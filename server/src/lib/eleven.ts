import type { ElevenVoice, VoicePreview } from '@audioworld/shared';
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
    const j = (await res.json()) as {
      detail?: { message?: string; status?: string } | string | Array<{ msg?: string }>;
    };
    const d = j?.detail;
    // 422 validation errors carry a list of {loc, msg}.
    const msg = typeof d === 'string' ? d : Array.isArray(d) ? d[0]?.msg : (d?.message ?? d?.status);
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

/**
 * Design new voices from a description: ElevenLabs returns a few previews (usually three)
 * speaking `text` — or a sample it writes itself when `text` is outside 100–1000 chars.
 */
export async function designVoice(description: string, text?: string): Promise<VoicePreview[]> {
  const sample = (text ?? '').trim();
  const body: Record<string, unknown> = { voice_description: description, model_id: 'eleven_ttv_v3' };
  if (sample.length >= 100 && sample.length <= 1000) body.text = sample;
  else body.auto_generate_text = true;
  const res = await elevenFetch(
    `${BASE}/text-to-voice/design?output_format=mp3_44100_128`,
    { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    120_000
  );
  if (!res.ok) throw new ElevenError(await readError(res), 502);
  const j = (await res.json()) as {
    previews?: Array<{ generated_voice_id: string; audio_base_64: string; media_type?: string; duration_secs?: number }>;
  };
  return (j.previews ?? []).map((p) => ({
    generatedVoiceId: p.generated_voice_id,
    audioBase64: p.audio_base_64,
    mediaType: p.media_type || 'audio/mpeg',
    durationSec: p.duration_secs ?? 0,
  }));
}

/** Keep a designed preview as a voice on the account → its voice id. */
export async function createVoiceFromPreview(name: string, description: string, generatedVoiceId: string): Promise<string> {
  const res = await elevenFetch(
    `${BASE}/text-to-voice`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_name: name, voice_description: description, generated_voice_id: generatedVoiceId }),
    },
    60_000
  );
  if (!res.ok) throw new ElevenError(await readError(res), 502);
  const j = (await res.json()) as { voice_id?: string };
  if (!j.voice_id) throw new ElevenError('ElevenLabs did not return a voice id', 502);
  return j.voice_id;
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
