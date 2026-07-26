import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { PoiInterpretation } from '@audioworld/shared';
import { OPENROUTER_API_KEY, OPENROUTER_VISION_MODEL, UPLOAD_DIR } from '../env';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/** At most this many photos are sent to the model (cost/token control). */
const MAX_PHOTOS = 4;

/** Whether AI interpretation is enabled (the OpenRouter key is configured). */
export function openrouterConfigured(): boolean {
  return OPENROUTER_API_KEY.length > 0;
}

/** An OpenRouter failure carrying a client-safe status + message (never the key). */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

/** Read a `/uploads/...` photo off disk and return a base64 data URL, or null if it's
 *  missing / not an allowed image (path-traversal-safe via basename). */
async function toDataUrl(uploadUrl: string): Promise<string | null> {
  if (!uploadUrl.startsWith('/uploads/')) return null;
  const name = basename(uploadUrl);
  const mime = MIME_BY_EXT[extname(name).toLowerCase()];
  if (!mime) return null;
  try {
    const bytes = await readFile(join(UPLOAD_DIR, name));
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT =
  'You write short narration for a location-based audio tour. Given a scout\'s field ' +
  'note and photos of a single spot, write a vivid, spoken-word narration (2–5 sentences) ' +
  'a visitor hears when they arrive there. Be concrete and grounded in what the note and ' +
  'photos actually show; never invent facts you cannot see. Reply ONLY with JSON: ' +
  '{"title": "<short place name>", "narration": "<the spoken narration>"}.';

interface ChatContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

/** Parse the model's reply into {title, narration}, tolerating markdown fences / prose.
 *  Returns null when there's no usable narration (so the caller can error rather than
 *  echoing a JSON blob or an empty string into TTS). */
function parseReply(content: string, fallbackTitle: string): PoiInterpretation | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(content.slice(start, end + 1)) as {
        title?: unknown;
        narration?: unknown;
      };
      // Valid JSON is authoritative: if it lacks a usable narration, don't fall through
      // and echo the raw blob — return null so interpretPoi reports a clean error.
      const narration = typeof obj.narration === 'string' ? obj.narration.trim() : '';
      const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : fallbackTitle;
      return narration ? { title: title.slice(0, 120), narration: narration.slice(0, 4000) } : null;
    } catch {
      /* not actually JSON — fall through to plain-text handling */
    }
  }
  // No JSON object at all — treat the whole (fence-stripped) reply as the narration.
  const narration = content.replace(/```[a-z]*|```/gi, '').trim();
  return narration ? { title: fallbackTitle.slice(0, 120), narration: narration.slice(0, 4000) } : null;
}

/**
 * Ask the vision model to turn a captured POI (its note + photos) into audio-point
 * narration. `photos` are `/uploads/...` URLs; missing/invalid ones are skipped.
 */
export async function interpretPoi(input: {
  note?: string;
  photos?: string[];
  fallbackTitle?: string;
}): Promise<PoiInterpretation> {
  const note = (input.note ?? '').trim();
  const dataUrls = (
    await Promise.all((input.photos ?? []).slice(0, MAX_PHOTOS).map(toDataUrl))
  ).filter((u): u is string => u !== null);

  if (!note && dataUrls.length === 0) {
    throw new OpenRouterError('This POI has no note or photos to interpret', 400);
  }

  const userContent: ChatContent[] = [
    {
      type: 'text',
      text: note
        ? `Scout note for this spot:\n"""${note}"""\n\nWrite the arrival narration.`
        : 'Write the arrival narration for the spot shown in these photos.',
    },
    ...dataUrls.map((url): ChatContent => ({ type: 'image_url', image_url: { url } })),
  ];

  let res: Response;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_VISION_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new OpenRouterError('The AI timed out — try again', 504);
    }
    throw new OpenRouterError('Could not reach the AI service', 502);
  }

  if (!res.ok) {
    let msg = `AI error (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      const e = j?.error;
      msg = String((typeof e === 'string' ? e : e?.message) ?? msg).slice(0, 200);
    } catch {
      /* keep default */
    }
    // 401/403 from OpenRouter usually means a bad/absent key — surface as a config problem.
    throw new OpenRouterError(msg, res.status === 401 || res.status === 403 ? 502 : 502);
  }

  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new OpenRouterError('The AI returned an empty response', 502);
  }
  const fallbackTitle = note ? note.split(/[.\n]/)[0]!.slice(0, 60) : 'Point of interest';
  const parsed = parseReply(content, fallbackTitle);
  if (!parsed) {
    throw new OpenRouterError('The AI did not return usable narration — try again', 502);
  }
  return parsed;
}
