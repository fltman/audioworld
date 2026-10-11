import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AssistantChange,
  AssistantEvent,
  AudioPoint,
  Course,
} from '@audioworld/shared';
import { DEFAULT_PLAYBACK } from '@audioworld/shared';
import * as Points from '../models/point';
import * as Courses from '../models/course';
import * as Characters from '../models/character';
import { metaFor } from '../models/upload';
import { saveToLibrary } from './library';
import { canManageCourse, type AuthUser } from './auth';
import {
  designVoice,
  elevenConfigured,
  generateSoundEffect,
  generateTts,
  listVoices,
} from './eleven';
import { UPLOAD_DIR } from '../env';

/** What a tool needs to act on the author's behalf (within their own course). */
export interface ToolContext {
  course: Course;
  user: AuthUser;
  toolCallId: string;
  emit: (e: AssistantEvent) => void;
  changed: Set<AssistantChange>;
  /** Paid ElevenLabs generations so far this turn (capped). */
  paid: { count: number };
}

/** Sent back to the model as the tool message (JSON); `summary` is also shown to the author. */
export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

/** At most this many ElevenLabs generations (speech, effects, voice designs) per turn. */
const MAX_PAID_PER_TURN = 8;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i;

type JsonSchema = Record<string, unknown>;
const fn = (name: string, description: string, properties: Record<string, JsonSchema>, required: string[] = []) => ({
  type: 'function' as const,
  function: { name, description, parameters: { type: 'object', properties, required } },
});
const S = (description: string): JsonSchema => ({ type: 'string', description });
const N = (description: string): JsonSchema => ({ type: 'number', description });
const O = (description: string): JsonSchema => ({ type: 'object', description, additionalProperties: true });

/** The tools the assistant may call (OpenAI function-calling format). There is no delete:
 *  removing things stays with the author in the editor. */
export const ASSISTANT_TOOLS = [
  fn('get_point', 'Every setting of one point (geometry, stops, audio, flags).', { id: S('Point id') }, ['id']),
  fn(
    'create_point',
    'Create a point in this course. `point` uses the AudioPoint JSON shape described in the system prompt ' +
      '(type, name, geometry for the type, radius…). Audio may be left empty (the author voices it later) or ' +
      'point at a library clip / a clip you generated.',
    { point: O('The new point') },
    ['point']
  ),
  fn(
    'update_point',
    'Change an existing point. Only the fields in `changes` change; `audio` and `playback` merge field by field. ' +
      'To change a path, send the whole new `path` (and `stops`).',
    { id: S('Point id'), changes: O('Fields to change') },
    ['id', 'changes']
  ),
  fn(
    'update_course',
    "Change the course's name, its description (listeners read it on the start page), or the author's notes " +
      '(idea, background). Only the given fields change.',
    {
      name: S('Course name'),
      description: S('Start-page description for listeners'),
      idea: S('The idea behind the walk'),
      background_info: S('Background research notes'),
    }
  ),
  fn(
    'search_library',
    'Find clips in the sound library (uploaded and generated audio) by words in their name, newest first.',
    { query: S('Words to match (optional)'), kind: { type: 'string', enum: ['sfx', 'voice'], description: 'Only effects or only voices' } }
  ),
  fn(
    'generate_speech',
    "Voice a line with ElevenLabs (eleven_v4) in a guide's voice or an account voice; the clip is saved to the " +
      'sound library and its url returned. Costs credits — only when the author asks for audio.',
    { text: S('What is said; eleven_v4 audio tags like [whispers] allowed'), guide_id: S("Use this guide's voice"), voice_id: S('Or an ElevenLabs voice id') },
    ['text']
  ),
  fn(
    'generate_sound_effect',
    'Generate a sound effect with ElevenLabs from an English prompt; saved to the sound library, url returned. ' +
      'Costs credits — only when the author asks for audio.',
    { prompt: S('English sound description'), duration_sec: N('0.5–22 s; omit to let the model choose') },
    ['prompt']
  ),
  fn('list_voices', 'The ElevenLabs voices available on the account (id, name, category).', {}),
  fn(
    'design_voice',
    'Design a NEW ElevenLabs voice from a description. ElevenLabs returns three previews; they are shown to the ' +
      'author to audition, and the author picks one (it is then saved, and given to the guide if guide_id is ' +
      'set). Costs credits — only when the author wants a new voice.',
    {
      voice_description: S('English: age, gender, accent/language, timbre, pace, emotion, setting (20–1000 chars)'),
      voice_name: S('Name for the saved voice'),
      sample_text: S('What the previews say, 100–1000 chars, in the voice’s language (optional)'),
      guide_id: S('Give the chosen voice to this guide (optional)'),
    },
    ['voice_description', 'voice_name']
  ),
  fn(
    'create_guide',
    'Create a guide (character): a persona that narrates, with an ElevenLabs voice and an optional idle sound.',
    { name: S('Name'), persona: S('Who they are and how they speak'), voice_id: S('ElevenLabs voice id'), voice_name: S('Voice name'), idle_sound_url: S('/uploads/… travelling sound') },
    ['name']
  ),
  fn(
    'update_guide',
    'Change a guide. Only the fields in `changes` change (name, persona, voice_id, voice_name, idle_sound_url).',
    { id: S('Guide id'), changes: O('Fields to change') },
    ['id', 'changes']
  ),
];

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' ? v.trim().slice(0, max) : undefined;
const fail = (summary: string): ToolResult => ({ ok: false, summary });
const label = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** A point as the model should see it (no bookkeeping fields). */
export function pointForModel(p: AudioPoint): Record<string, unknown> {
  const { courseId: _c, createdAt: _a, updatedAt: _u, ...rest } = p;
  return rest;
}

function payCheck(ctx: ToolContext): ToolResult | null {
  if (!elevenConfigured()) return fail('Audio generation is not configured on this server (no ElevenLabs key).');
  if (ctx.paid.count >= MAX_PAID_PER_TURN) {
    return fail(`Generation limit for one reply reached (${MAX_PAID_PER_TURN}); ask the author before generating more.`);
  }
  ctx.paid.count += 1;
  return null;
}

async function ownPoint(ctx: ToolContext, id: unknown): Promise<AudioPoint | null> {
  if (typeof id !== 'string') return null;
  const p = await Points.get(id).catch(() => null);
  return p && p.courseId === ctx.course.id ? p : null;
}

/** Run one tool call; never throws (failures come back to the model as ok:false). */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult> {
  let args: Record<string, unknown>;
  try {
    args = obj(rawArgs.trim() ? JSON.parse(rawArgs) : {});
  } catch {
    return fail(`Arguments for ${name} were not valid JSON`);
  }
  try {
    return await run(name, args, ctx);
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 300) : `${name} failed`);
  }
}

async function run(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case 'get_point': {
      const p = await ownPoint(ctx, args.id);
      return p ? { ok: true, summary: `Read “${p.name}”`, data: pointForModel(p) } : fail('No such point in this course');
    }

    case 'create_point': {
      const p = obj(args.point);
      const audio = obj(p.audio);
      const url = typeof audio.url === 'string' ? audio.url : '';
      const input = {
        sync: 'individual',
        volume: 1,
        ...p,
        playback: { ...DEFAULT_PLAYBACK, ...obj(p.playback) },
        audio: { ...audio, kind: /^https?:/.test(url) ? 'url' : 'upload', url },
      };
      const created = await Points.create(ctx.course.id, input);
      ctx.changed.add('points');
      return { ok: true, summary: `Created point “${created.name}” (${created.type})`, data: { id: created.id } };
    }

    case 'update_point': {
      const existing = await ownPoint(ctx, args.id);
      if (!existing) return fail('No such point in this course');
      const ch = obj(args.changes);
      const merged: Record<string, unknown> = {
        ...pointForModel(existing),
        ...ch,
        audio: { ...existing.audio, ...obj(ch.audio) },
        playback: { ...existing.playback, ...obj(ch.playback) },
      };
      delete merged.id;
      const updated = await Points.update(existing.id, merged);
      if (!updated) return fail('The point disappeared');
      ctx.changed.add('points');
      const fields = Object.keys(ch).join(', ') || 'nothing';
      return { ok: true, summary: `Updated “${updated.name}” (${fields})`, data: { id: updated.id } };
    }

    case 'update_course': {
      // Re-read: an earlier call this turn may have renamed it.
      const c = (await Courses.getCourse(ctx.course.id)) ?? ctx.course;
      const next = {
        name: text(args.name, 200) || c.name,
        description: text(args.description, 20_000),
        idea: text(args.idea, 20_000),
        backgroundInfo: text(args.background_info, 20_000),
      };
      const updated = await Courses.updateCourse(c.id, next);
      if (!updated) return fail('The course disappeared');
      ctx.changed.add('course');
      const fields = ['name', 'description', 'idea', 'background_info'].filter((k) => args[k] != null);
      return { ok: true, summary: `Updated the course (${fields.join(', ')})` };
    }

    case 'search_library': {
      const files = !existsSync(UPLOAD_DIR)
        ? []
        : readdirSync(UPLOAD_DIR)
            .filter((f) => AUDIO_EXT.test(f))
            .map((f) => ({ f, t: statSync(join(UPLOAD_DIR, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t)
            .map((x) => x.f);
      const meta = await metaFor(files);
      const words = (text(args.query, 200) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const kind = args.kind === 'sfx' || args.kind === 'voice' ? args.kind : null;
      const hits = files
        .map((f) => ({ url: `/uploads/${f}`, name: meta.get(f)?.description ?? f, kind: meta.get(f)?.kind ?? null }))
        .filter((c) => (!kind || c.kind === kind) && words.every((w) => c.name.toLowerCase().includes(w)))
        .slice(0, 40);
      return { ok: true, summary: `Searched the sound library (${hits.length} found)`, data: hits };
    }

    case 'generate_speech': {
      const line = text(args.text, 5000);
      if (!line) return fail('No text to speak');
      let voiceId = text(args.voice_id, 120);
      if (args.guide_id) {
        const g = await Characters.getCharacter(String(args.guide_id));
        if (!g) return fail('No such guide');
        if (!g.voiceId) return fail(`${g.name} has no voice yet`);
        voiceId = g.voiceId;
      }
      if (!voiceId) return fail('Give a guide_id or a voice_id');
      const blocked = payCheck(ctx);
      if (blocked) return blocked;
      const clip = await saveToLibrary(await generateTts(line, voiceId, 'eleven_v4'), `TTS: ${label(line)}`, 'voice');
      ctx.changed.add('library');
      return { ok: true, summary: `Voiced “${label(line, 40)}”`, data: { url: clip.url } };
    }

    case 'generate_sound_effect': {
      const prompt = text(args.prompt, 500);
      if (!prompt) return fail('No prompt');
      const dur = typeof args.duration_sec === 'number' ? Math.max(0.5, Math.min(22, args.duration_sec)) : undefined;
      const blocked = payCheck(ctx);
      if (blocked) return blocked;
      const clip = await saveToLibrary(await generateSoundEffect(prompt, dur), `SFX: ${prompt}`, 'sfx');
      ctx.changed.add('library');
      return { ok: true, summary: `Generated the sound “${label(prompt, 40)}”`, data: { url: clip.url } };
    }

    case 'list_voices': {
      if (!elevenConfigured()) return fail('ElevenLabs is not configured on this server');
      const voices = await listVoices();
      return { ok: true, summary: `Listed ${voices.length} voices`, data: voices };
    }

    case 'design_voice': {
      const description = text(args.voice_description, 1000);
      if (!description || description.length < 20) return fail('Describe the voice in at least 20 characters');
      const voiceName = text(args.voice_name, 100) || 'New voice';
      const guideId = text(args.guide_id, 80);
      if (guideId) {
        const g = await Characters.getCharacter(guideId);
        if (!g || !canManageCourse(ctx.user, g.ownerId)) return fail('No such guide');
      }
      const blocked = payCheck(ctx);
      if (blocked) return blocked;
      const previews = await designVoice(description, text(args.sample_text, 1000));
      if (previews.length === 0) return fail('ElevenLabs returned no previews');
      ctx.emit({
        type: 'voice_previews',
        toolCallId: ctx.toolCallId,
        description,
        name: voiceName,
        guideId,
        previews,
      });
      return {
        ok: true,
        summary: `Designed ${previews.length} voice previews for “${voiceName}”`,
        data: 'The previews are shown to the author, who will audition them and pick one. Stop here and let them choose.',
      };
    }

    case 'create_guide': {
      const nm = text(args.name, 120);
      if (!nm) return fail('A guide needs a name');
      const idle = text(args.idle_sound_url, 200);
      const g = await Characters.createCharacter(
        {
          name: nm,
          persona: text(args.persona, 4000) ?? '',
          voiceId: text(args.voice_id, 120) ?? '',
          voiceName: text(args.voice_name, 120),
          idleSoundUrl: idle?.startsWith('/uploads/') ? idle : undefined,
        },
        ctx.user.id
      );
      ctx.changed.add('guides');
      return { ok: true, summary: `Created the guide “${g.name}”`, data: { id: g.id } };
    }

    case 'update_guide': {
      const g = typeof args.id === 'string' ? await Characters.getCharacter(args.id) : null;
      if (!g || !canManageCourse(ctx.user, g.ownerId)) return fail('No such guide');
      const ch = obj(args.changes);
      const idle = ch.idle_sound_url !== undefined ? text(ch.idle_sound_url, 200) : g.idleSoundUrl;
      const updated = await Characters.updateCharacter(g.id, {
        name: text(ch.name, 120) || g.name,
        persona: ch.persona !== undefined ? (text(ch.persona, 4000) ?? '') : g.persona,
        voiceId: ch.voice_id !== undefined ? (text(ch.voice_id, 120) ?? '') : g.voiceId,
        voiceName: ch.voice_name !== undefined ? text(ch.voice_name, 120) : g.voiceName,
        idleSoundUrl: idle?.startsWith('/uploads/') ? idle : undefined,
      });
      if (!updated) return fail('The guide disappeared');
      ctx.changed.add('guides');
      return { ok: true, summary: `Updated the guide “${updated.name}” (${Object.keys(ch).join(', ')})` };
    }

    default:
      return fail(`Unknown tool ${name}`);
  }
}
