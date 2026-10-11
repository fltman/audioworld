import { Router } from 'express';
import type { AssistantEvent, AssistantMessage, Course, CreateVoiceRequest } from '@audioworld/shared';
import * as Courses from '../models/course';
import * as Points from '../models/point';
import * as Characters from '../models/character';
import * as Chats from '../models/assistantChat';
import { describeChanges, fingerprint } from '../lib/courseChanges';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { rateLimit } from '../lib/rateLimit';
import { canManageCourse, requireRole, type AuthedRequest } from '../lib/auth';
import { OpenRouterError, openrouterConfigured } from '../lib/openrouter';
import { ElevenError, createVoiceFromPreview, elevenConfigured } from '../lib/eleven';
import { runAssistant, sanitizeHistory } from '../lib/assistant';

/**
 * The admin's AI assistant. Authoring-only and rate-limited per user: every reply spends
 * model tokens, and its tools can spend ElevenLabs credits.
 */
export const assistantRouter = Router();
assistantRouter.use(requireRole('superuser', 'admin'));
const byUser = (req: import('express').Request): string =>
  (req as AuthedRequest).user?.id ?? req.ip ?? 'anon';
// Replies and voices cost money: a tight per-minute and a daily cap. Browsing saved chats
// is cheap, so it only gets a generous guard.
assistantRouter.use(rateLimit({ windowMs: 60_000, max: 240, key: byUser }));
const paidPerMinute = rateLimit({ windowMs: 60_000, max: 15, key: byUser });
const dailyLimit = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 400, key: byUser });

/** The course, if the caller may manage it (else answers 404/403 and returns null). */
async function manageableCourse(req: AuthedRequest, res: import('express').Response): Promise<Course | null> {
  const course = await Courses.getCourse(req.params.courseId!);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return null;
  }
  if (!canManageCourse(req.user, course.ownerId)) {
    res.status(403).json({ success: false, error: 'You do not have access to this course' });
    return null;
  }
  return course;
}

/** The caller's own chat, or null after answering 404. */
async function ownChat(req: AuthedRequest, res: import('express').Response, id: unknown) {
  const chat = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? await Chats.getChat(id) : null;
  if (!chat || chat.userId !== req.user!.id) {
    res.status(404).json({ success: false, error: 'Chat not found' });
    return null;
  }
  return chat;
}

// The author's saved chats about a course, most recent first.
assistantRouter.get(
  '/:courseId/chats',
  asyncHandler(async (req: AuthedRequest, res) => {
    const course = await manageableCourse(req, res);
    if (!course) return;
    res.json({ success: true, data: await Chats.listChats(course.id, req.user!.id) });
  })
);

// One saved chat, to continue it.
assistantRouter.get(
  '/chats/:chatId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const chat = await ownChat(req, res, req.params.chatId);
    if (!chat) return;
    const { courseId: _c, userId: _u, seen: _s, ...data } = chat;
    res.json({ success: true, data });
  })
);

assistantRouter.delete(
  '/chats/:chatId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const chat = await ownChat(req, res, req.params.chatId);
    if (!chat) return;
    await Chats.removeChat(chat.id);
    res.json({ success: true, data: { id: chat.id } });
  })
);

// Save an existing conversation as a chat (moving one kept in the browser to the server).
assistantRouter.post(
  '/:courseId/chats',
  asyncHandler(async (req: AuthedRequest, res) => {
    const course = await manageableCourse(req, res);
    if (!course) return;
    const b = (req.body ?? {}) as { messages?: unknown; personaId?: unknown };
    const messages = sanitizeHistory(b.messages);
    if (messages.length === 0) throw new ValidationError('No messages to save');
    const first = messages.find((m): m is Extract<AssistantMessage, { role: 'user' }> => m.role === 'user');
    const chat = await Chats.createChat({
      courseId: course.id,
      userId: req.user!.id,
      title: Chats.titleFrom(first?.content ?? ''),
      messages,
      personaId: typeof b.personaId === 'string' && b.personaId ? b.personaId.slice(0, 80) : null,
    });
    const { courseId: _c, userId: _u, seen: _s, ...data } = chat;
    res.status(201).json({ success: true, data });
  })
);

// Chat about one course: a new message in a chat (or a new chat), or a retry of the last
// one. The server keeps the conversation. Streams AssistantEvents as server-sent events
// (one JSON per `data:` line) while the model writes and its tools run.
assistantRouter.post(
  '/:courseId/chat',
  paidPerMinute,
  dailyLimit,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!openrouterConfigured()) {
      res.status(503).json({ success: false, error: 'The AI assistant is not configured (no OpenRouter key).' });
      return;
    }
    const course = await manageableCourse(req, res);
    if (!course) return;
    const body = (req.body ?? {}) as { chatId?: unknown; message?: unknown; retry?: unknown; personaId?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 40_000) : '';
    const personaId = typeof body.personaId === 'string' && body.personaId ? body.personaId.slice(0, 80) : null;
    if (!message && body.retry !== true) throw new ValidationError('Write a message');

    const user = req.user!;
    let chat = body.chatId ? await ownChat(req, res, body.chatId) : null;
    if (body.chatId && !chat) return;
    if (chat && chat.courseId !== course.id) throw new ValidationError('That chat belongs to another course');
    const history = sanitizeHistory(chat?.messages ?? []);
    if (message) history.push({ role: 'user', content: message });
    if (history[history.length - 1]?.role !== 'user') throw new ValidationError('There is no message to answer');
    // Keep the author's message even if the reply fails or is stopped.
    if (chat) await Chats.saveChat(chat.id, { messages: history, personaId });
    else chat = await Chats.createChat({ courseId: course.id, userId: user.id, title: Chats.titleFrom(message), messages: history, personaId });

    const [points, guides] = await Promise.all([
      Points.listByCourse(course.id),
      Characters.listCharacters(user.id, user.role === 'admin'),
    ]);
    const persona = personaId ? (guides.find((g) => g.id === personaId) ?? null) : null;
    // What the author changed in the editor since the assistant last looked.
    const preface = chat.seen ? describeChanges(chat.seen, fingerprint(course, points, guides)) : null;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const ac = new AbortController();
    // The author closed the chat or hit Stop: stop calling the model and running tools.
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });
    const emit = (e: AssistantEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    // Keep proxies from timing out an idle stream while the model thinks.
    const ping = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);
    emit({ type: 'chat', chat: { id: chat.id, title: chat.title, updatedAt: new Date().toISOString(), messageCount: 0 } });
    try {
      const appended = await runAssistant({ course, user, points, guides, persona, history, emit, signal: ac.signal, preface });
      // Save the reply, and how the course looks now (after anything the tools changed).
      const [c2, p2, g2] = await Promise.all([
        Courses.getCourse(course.id),
        Points.listByCourse(course.id),
        Characters.listCharacters(user.id, user.role === 'admin'),
      ]);
      await Chats.saveChat(chat.id, {
        messages: [...history, ...appended],
        seen: fingerprint(c2 ?? course, p2, g2),
      });
    } catch (e) {
      if (!ac.signal.aborted) {
        const known = e instanceof OpenRouterError || e instanceof ElevenError;
        emit({ type: 'error', error: known ? e.message : 'Something went wrong — try again.' });
        if (!known) console.error('[assistant]', e);
      }
    } finally {
      clearInterval(ping);
      res.end();
    }
  })
);

// Keep one designed preview as a voice on the ElevenLabs account, and give it to a guide.
assistantRouter.post(
  '/voices',
  paidPerMinute,
  dailyLimit,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!elevenConfigured()) throw new ElevenError('ElevenLabs is not configured on this server.', 503);
    const b = (req.body ?? {}) as Partial<CreateVoiceRequest>;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const generatedVoiceId = str(b.generatedVoiceId, 200);
    const name = str(b.name, 100);
    const description = str(b.description, 1000);
    if (!generatedVoiceId || !name || description.length < 20) {
      throw new ValidationError('A preview id, a name and a description (20+ characters) are needed');
    }
    const guide = b.guideId ? await Characters.getCharacter(str(b.guideId, 80)) : null;
    if (b.guideId && (!guide || !canManageCourse(req.user, guide.ownerId))) {
      res.status(404).json({ success: false, error: 'No such guide' });
      return;
    }
    const voiceId = await createVoiceFromPreview(name, description, generatedVoiceId);
    if (guide) {
      await Characters.updateCharacter(guide.id, {
        name: guide.name,
        persona: guide.persona,
        voiceId,
        voiceName: name,
        idleSoundUrl: guide.idleSoundUrl,
      });
    }
    res.status(201).json({ success: true, data: { voiceId, name, guideId: guide?.id ?? null } });
  })
);

// Upstream failures keep their intended status and a readable message.
assistantRouter.use(
  (err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (err instanceof ElevenError || err instanceof OpenRouterError) {
      if (res.headersSent) return next(err);
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
);
