import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import type { UploadResult } from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';
import { asyncHandler } from '../lib/http';
import { ValidationError } from '../lib/mapping';
import { rateLimit } from '../lib/rateLimit';
import { requireRole, type AuthedRequest } from '../lib/auth';
import type { ClipKind } from '@audioworld/shared';
import { setMeta } from '../models/upload';
import {
  ElevenError,
  elevenConfigured,
  generateSoundEffect,
  generateTts,
  listVoices,
} from '../lib/eleven';

export const generateRouter = Router();

// Authoring-only, and rate-limited: each generation spends real ElevenLabs credits, so
// the endpoint must not be a cheap way to burn the account. The limits key on the
// authenticated USER (not IP) so a leaked author token can't be amplified across many
// IPs, and the paid endpoints additionally have a per-user DAILY cap.
generateRouter.use(requireRole('superuser', 'admin'));
const byUser = (req: import('express').Request): string =>
  (req as AuthedRequest).user?.id ?? req.ip ?? 'anon';
generateRouter.use(rateLimit({ windowMs: 60_000, max: 20, key: byUser }));
// Bounds a single account's daily spend even at the sustained minute-rate.
const dailyPaidLimit = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 300, key: byUser });

/** Hard cap on a single generated file (defence-in-depth; real mp3s are far smaller). */
const MAX_GENERATED_BYTES = 30 * 1024 * 1024;

// eleven_v3 is the expressive default the author asked for; keep a small allowlist so a
// client can't inject an arbitrary model id into the upstream call.
const TTS_MODELS = new Set([
  'eleven_v3',
  'eleven_multilingual_v2',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
]);
const MAX_SFX_PROMPT = 500;
const MAX_TTS_TEXT = 5000;

/** Refuse early (with a clear status) when the feature isn't configured. */
function requireConfigured(): void {
  if (!elevenConfigured()) {
    throw new ElevenError('Audio generation is not configured (no ElevenLabs API key).', 503);
  }
}

/** Persist generated mp3 bytes into the sound library, exactly like an upload. */
async function saveToLibrary(bytes: Buffer, description: string, kind: ClipKind): Promise<UploadResult> {
  if (bytes.length > MAX_GENERATED_BYTES) {
    throw new ElevenError('Generated audio was unexpectedly large', 502);
  }
  const filename = `${randomUUID()}.mp3`;
  writeFileSync(join(UPLOAD_DIR, filename), bytes);
  await setMeta(filename, description.slice(0, 200), kind);
  return { url: `/uploads/${filename}`, filename, size: bytes.length, mimetype: 'audio/mpeg' };
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

generateRouter.get(
  '/voices',
  asyncHandler(async (_req, res) => {
    requireConfigured();
    res.json({ success: true, data: await listVoices() });
  })
);

generateRouter.post(
  '/sound-effect',
  dailyPaidLimit,
  asyncHandler(async (req, res) => {
    requireConfigured();
    const prompt = str((req.body as { prompt?: unknown }).prompt);
    if (!prompt) throw new ValidationError('A sound-effect "prompt" is required');
    if (prompt.length > MAX_SFX_PROMPT) {
      throw new ValidationError(`Prompt must be at most ${MAX_SFX_PROMPT} characters`);
    }
    const rawDur = (req.body as { durationSec?: unknown }).durationSec;
    let durationSec: number | undefined;
    if (rawDur != null) {
      const n = Number(rawDur);
      if (!Number.isFinite(n) || n < 0.5 || n > 22) {
        throw new ValidationError('durationSec must be between 0.5 and 22');
      }
      durationSec = n;
    }
    const bytes = await generateSoundEffect(prompt, durationSec);
    res.status(201).json({ success: true, data: await saveToLibrary(bytes, `SFX: ${prompt}`, 'sfx') });
  })
);

generateRouter.post(
  '/tts',
  dailyPaidLimit,
  asyncHandler(async (req, res) => {
    requireConfigured();
    const b = req.body as { text?: unknown; voiceId?: unknown; modelId?: unknown };
    const text = str(b.text);
    const voiceId = str(b.voiceId);
    if (!text) throw new ValidationError('"text" is required');
    if (text.length > MAX_TTS_TEXT) {
      throw new ValidationError(`Text must be at most ${MAX_TTS_TEXT} characters`);
    }
    if (!voiceId) throw new ValidationError('A "voiceId" is required');
    const modelId = TTS_MODELS.has(str(b.modelId)) ? str(b.modelId) : 'eleven_v3';
    const bytes = await generateTts(text, voiceId, modelId);
    const label = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    res.status(201).json({ success: true, data: await saveToLibrary(bytes, `TTS: ${label}`, 'voice') });
  })
);

// Turn an ElevenError into its intended status (503 not-configured, 502 upstream fail).
generateRouter.use(
  (err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (err instanceof ElevenError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
);
