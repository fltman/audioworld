import type { ElevenVoice } from '@audioworld/shared';
import { ELEVENLABS_API_KEY } from '../env';

const BASE = 'https://api.elevenlabs.io/v1';
const authHeaders = (): Record<string, string> => ({ 'xi-api-key': ELEVENLABS_API_KEY });

/** Whether generation is enabled (the API key is configured). */
export function elevenConfigured(): boolean {
  return ELEVENLABS_API_KEY.length > 0;
}

/** An ElevenLabs failure carrying a client-safe status + message (never the key). */
export class ElevenError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** fetch with a timeout, mapping a stall/network failure to a clean ElevenError so a
 *  hung upstream can never leave the request (and the admin's Generate button) pending. */
async function elevenFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ElevenError('ElevenLabs timed out — try again', 504);
    }
    throw new ElevenError('Could not reach ElevenLabs', 502);
  }
}

/** Extract a short, safe message from an ElevenLabs error response body. */
async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: { message?: string; status?: string } | string };
    const d = j?.detail;
    const msg = typeof d === 'string' ? d : (d?.message ?? d?.status);
    return String(msg ?? `ElevenLabs error (${res.status})`).slice(0, 200);
  } catch {
    return `ElevenLabs error (${res.status})`;
  }
}

/** The account's voices, for the TTS voice picker. */
export async function listVoices(): Promise<ElevenVoice[]> {
  const res = await elevenFetch(`${BASE}/voices`, { headers: authHeaders() }, 15_000);
  if (!res.ok) throw new ElevenError(await readError(res), 502);
  const j = (await res.json()) as {
    voices?: Array<{ voice_id: string; name: string; category?: string }>;
  };
  return (j.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category }));
}

/** Generate a sound effect from a text prompt → mp3 bytes. */
export async function generateSoundEffect(prompt: string, durationSec?: number): Promise<Buffer> {
  const body: Record<string, unknown> = { text: prompt };
  if (durationSec != null) body.duration_seconds = durationSec;
  const res = await elevenFetch(
    `${BASE}/sound-generation`,
    { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) },
    90_000
  );
  if (!res.ok) throw new ElevenError(await readError(res), 502);
  return Buffer.from(await res.arrayBuffer());
}

/** Generate speech for `text` with the given voice + model → mp3 bytes. */
export async function generateTts(text: string, voiceId: string, modelId: string): Promise<Buffer> {
  const res = await elevenFetch(
    `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: modelId }),
    },
    90_000
  );
  if (!res.ok) throw new ElevenError(await readError(res), 502);
  return Buffer.from(await res.arrayBuffer());
}
