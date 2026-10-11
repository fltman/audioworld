import { Router } from 'express';
import type { AssistantEvent, CreateVoiceRequest } from '@audioworld/shared';
import * as Courses from '../models/course';
import * as Points from '../models/point';
import * as Characters from '../models/character';
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
assistantRouter.use(rateLimit({ windowMs: 60_000, max: 15, key: byUser }));
const dailyLimit = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 400, key: byUser });

// Chat about one course. Streams AssistantEvents as server-sent events (one JSON per
// `data:` line) while the model writes and its tools run.
assistantRouter.post(
  '/:courseId/chat',
  dailyLimit,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!openrouterConfigured()) {
      res.status(503).json({ success: false, error: 'The AI assistant is not configured (no OpenRouter key).' });
      return;
    }
    const course = await Courses.getCourse(req.params.courseId);
    if (!course) {
      res.status(404).json({ success: false, error: 'Course not found' });
      return;
    }
    if (!canManageCourse(req.user, course.ownerId)) {
      res.status(403).json({ success: false, error: 'You do not have access to this course' });
      return;
    }
    const body = (req.body ?? {}) as { messages?: unknown; personaId?: unknown };
    const history = sanitizeHistory(body.messages);
    if (history[history.length - 1]?.role !== 'user') {
      throw new ValidationError('The conversation must end with a message from you');
    }
    const user = req.user!;
    const [points, guides] = await Promise.all([
      Points.listByCourse(course.id),
      Characters.listCharacters(user.id, user.role === 'admin'),
    ]);
    const persona = typeof body.personaId === 'string' ? (guides.find((g) => g.id === body.personaId) ?? null) : null;

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
    try {
      await runAssistant({ course, user, points, guides, persona, history, emit, signal: ac.signal });
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
