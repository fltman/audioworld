import type {
  AcousticZone,
  AssistantChange,
  AssistantEvent,
  AssistantMessage,
  AssistantToolCall,
  AudioPoint,
  Character,
  Course,
} from '@audioworld/shared';
import { pathLength } from '@audioworld/shared';
import { OPENROUTER_API_KEY, OPENROUTER_CHAT_MODEL } from '../env';
import { OpenRouterError } from './openrouter';
import { ASSISTANT_TOOLS, pointForModel, runTool, type ToolContext } from './assistantTools';
import type { AuthUser } from './auth';

const URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Model calls per author message (each tool round is one). */
const MAX_STEPS = 12;
const MAX_OUTPUT_TOKENS = 8000;
const MAX_HISTORY_MESSAGES = 80;
const MAX_HISTORY_CHARS = 400_000;

const PRIMER = `You are the authoring assistant inside AudioWorld's admin. AudioWorld makes GPS sound walks: listeners walk a real place with headphones, and sounds are placed in the world around them in 3D — each comes from a direction, grows louder as you approach, and may move. You help the author of the course below design and build it: the idea and story, placing points, guides and their voices, narration, and prompts for sound effects and music.

## How to work
- Reply in the language the author writes in (often Swedish). Be concise and concrete. Use light Markdown: short paragraphs, lists, **bold**, and a fenced code block for anything meant to be copied (prompts, style descriptions, narration).
- Change the course with tools when the author asks (or clearly agrees). For a large batch (more than about five points) propose the plan first. You cannot delete anything — the author does that in the editor.
- After using tools, say briefly what you did. Never invent ids: use the ids below or ones a tool returned.
- Generating audio (speech, sound effects, designing a voice) spends ElevenLabs credits — only when the author asks for it.
- Coordinates are WGS84 {lat, lng}. When a planned route exists it is the way listeners walk, start to finish: place points along it, in walking order, spaced so their audible radii don't overlap unless that's intended (walking pace is about 1.3 m/s, so 60 m is about 45 s). The first point in the list is where the walk starts.

## Point JSON (create_point / update_point)
Common fields: name, type, audio {kind 'upload'|'url', url ('' = not voiced yet), title, description — for a single point, the facts its narration is written from}, volume 0–1, playback {loop, stopAfter (play once), reload (restart on re-entry), loopGapSec}, sync 'individual'|'global', height (m, + up), hidden (kept off the listener's screen but still heard), setsFlags / requiresFlags (story gating by flags), flagGroup (an exclusive choice).
Types:
- static: center {lat,lng}, radius (audible, m). Optional triggerRadius (silent until the listener is that close — jump scares), stillSec (only after standing still that long), fleeOnMove, facing + spread (a directional wedge, degrees).
- static_circling: center, circleRadius, speed (m/s along the circle), radius.
- path: path [{lat,lng}, …] (2+), speed (m/s), radius, endBehavior 'loop'|'reverse'|'stop', stops [{index (vertex), dwellSec, facts, audio}] (guided-tour pauses), waitForListener + waitRadius (a guide that waits for you), showWayfinding, characterId (its guide).
- path_triggered: like path, but rests at its start until the listener comes within triggerRadius.
- follow_user: center, initialRadius (trigger), mode 'attach'|'chase'|'orbit'|'sideToSide', maxSpeed + disengageDistance (chase), followRadius + followSpeed (orbit, sideToSide).
Typical audible radii: narration 15–30 m, ambience 30–80 m, small effects 5–15 m.

## Guides
A guide (character) has a name, a persona, an ElevenLabs voice and an optional idle (travelling) sound. Narration for a guide follows its persona. To give a guide a new voice, use design_voice with its guide_id: the author auditions three previews and picks one.

## Writing for the ear
- Narration: short spoken sentences, concrete and sensory, present tense, about 20–60 seconds per point. eleven_v4 audio tags in square brackets set the delivery — [whispers], [warmly], [laughs], [pause] — use them sparingly, and always write the tags in English, even inside Swedish text.
- Lines a guide might say about something: write them in that guide's persona and voice, as a few alternatives to choose from.
- Sound-effect prompts (ElevenLabs or Suno): English, one or two concrete sentences — the source, the action, materials, the space and distance, the mood; say "seamless loop" for beds; no music unless wanted.
- Music style descriptions for Suno: English, one paragraph of about 300 characters — genre, instrumentation, tempo/BPM, key and mood, production; "instrumental, no vocals" for beds under narration.

## Cover images
generate_cover_image makes a 16:9 landscape cover for the start page. Write the prompt in English from the walk's idea, place and mood: the subject and setting, season and time of day, light, atmosphere and style (photographic unless the idea calls for illustration), composition with calm space at the bottom where the title sits, and "no text, no letters, no logos". It is shown to the author with a "Use as cover" button; only set it as the cover directly when they asked for that.`;

const round = (n: number) => Math.round(n * 1e6) / 1e6;
/** Round every lat/lng in a JSON-able value (6 dp ≈ 0.1 m) to keep the context lean. */
function roundCoords(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(roundCoords);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.lat === 'number' && typeof o.lng === 'number' && Object.keys(o).length === 2) {
      return { lat: round(o.lat), lng: round(o.lng) };
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, roundCoords(x)]));
  }
  return v;
}

function zoneLine(z: AcousticZone): string {
  const bed = z.ambienceUrl ? `, background loop at ${Math.round((z.ambienceVolume ?? 0.6) * 100)}%` : '';
  return `- ${z.name}: ${z.reverb} reverb ${Math.round(z.wet * 100)}%${bed}`;
}

/** The system prompt: the platform primer, then the course as it is right now. */
export function buildSystemPrompt(
  course: Course,
  points: AudioPoint[],
  guides: Character[],
  persona: Character | null
): string {
  const route = course.route && course.route.length >= 2 ? course.route : null;
  const parts = [
    PRIMER,
    '## The course (current state)',
    `Name: ${course.name}`,
    `Description (listeners read it on the start page): ${course.description?.trim() || '—'}`,
    `The idea (author's notes): ${course.idea?.trim() || '—'}`,
    `Background (author's notes): ${course.backgroundInfo?.trim() || '—'}`,
    route
      ? `Planned route: ${route.length} corners, ${Math.round(pathLength(route))} m, start → finish: ${JSON.stringify(
          route.map((c) => [round(c.lat), round(c.lng)])
        )}`
      : 'Planned route: none drawn yet.',
    course.zones?.length ? `Acoustic zones:\n${course.zones.map(zoneLine).join('\n')}` : 'Acoustic zones: none.',
    guides.length
      ? `Guides:\n${JSON.stringify(
          guides.map((g) => ({ id: g.id, name: g.name, persona: g.persona, voice: g.voiceName ?? (g.voiceId || null), idleSound: g.idleSoundUrl ?? null }))
        )}`
      : 'Guides: none yet.',
    points.length
      ? `Points (${points.length}, in order — the first is the start):\n${JSON.stringify(roundCoords(points.map(pointForModel)))}`
      : 'Points: none yet.',
  ];
  if (persona) {
    parts.push(
      `## Persona mode\nThe author has asked you to speak as the guide “${persona.name}” for this conversation. ` +
        `Reply fully in character — their voice, manner, vocabulary and view of the world — in the first person:\n${persona.persona || '(no persona written yet — improvise one that fits the name)'}\n` +
        'Stay in character while you help; when you use a tool, mention it briefly in character.'
    );
  }
  return parts.join('\n\n');
}

/** Keep the client's history well-formed and bounded: known roles only, tool results
 *  paired with their calls, consecutive user turns merged, oldest turns dropped first. */
export function sanitizeHistory(raw: unknown): AssistantMessage[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const msgs: AssistantMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES * 2)) {
    const o = (m ?? {}) as Record<string, unknown>;
    if (o.role === 'user') {
      const content = str(o.content, 40_000).trim();
      if (!content) continue;
      const prev = msgs[msgs.length - 1];
      if (prev?.role === 'user') prev.content += `\n\n${content}`;
      else msgs.push({ role: 'user', content });
    } else if (o.role === 'assistant') {
      const calls = Array.isArray(o.tool_calls)
        ? (o.tool_calls as unknown[])
            .map((c) => (c ?? {}) as Record<string, unknown>)
            .filter((c) => typeof c.id === 'string' && typeof (c.function as Record<string, unknown>)?.name === 'string')
            .map(
              (c): AssistantToolCall => ({
                id: c.id as string,
                type: 'function',
                function: {
                  name: (c.function as Record<string, unknown>).name as string,
                  arguments: str((c.function as Record<string, unknown>).arguments, 60_000),
                },
              })
            )
        : [];
      msgs.push({ role: 'assistant', content: str(o.content, 40_000) || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (o.role === 'tool' && typeof o.tool_call_id === 'string') {
      msgs.push({ role: 'tool', tool_call_id: o.tool_call_id, content: str(o.content, 40_000) });
    }
  }

  // Pair tool calls with results: drop calls that never got one, and stray results.
  const out: AssistantMessage[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    if (m.role === 'tool') continue; // emitted with its call below
    if (m.role === 'assistant' && m.tool_calls) {
      const results = new Map<string, AssistantMessage>();
      for (let j = i + 1; j < msgs.length && msgs[j]!.role === 'tool'; j++) {
        const t = msgs[j] as Extract<AssistantMessage, { role: 'tool' }>;
        results.set(t.tool_call_id, t);
      }
      const answered = m.tool_calls.filter((c) => results.has(c.id));
      if (answered.length === m.tool_calls.length) {
        out.push(m, ...answered.map((c) => results.get(c.id)!));
      } else if (m.content) {
        out.push({ role: 'assistant', content: m.content });
      }
      continue;
    }
    if (m.role === 'assistant' && !m.content) continue;
    out.push(m);
  }

  // Bound the size, dropping whole turns from the front, and start on a user turn.
  let total = out.reduce((n, m) => n + JSON.stringify(m).length, 0);
  while (out.length > 0 && (out.length > MAX_HISTORY_MESSAGES || total > MAX_HISTORY_CHARS || out[0]!.role !== 'user')) {
    total -= JSON.stringify(out.shift()).length;
    while (out.length > 0 && out[0]!.role !== 'user') total -= JSON.stringify(out.shift()).length;
  }
  return out;
}

interface StepResult {
  content: string;
  toolCalls: AssistantToolCall[];
}

/** One streamed model call: forwards text deltas as they arrive, collects tool calls. */
async function streamStep(
  messages: unknown[],
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<StepResult> {
  let res: Response;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENROUTER_CHAT_MODEL,
        messages,
        tools: ASSISTANT_TOOLS,
        stream: true,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new OpenRouterError('Could not reach the AI service', 502);
  }
  if (!res.ok || !res.body) {
    let msg = `AI error (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      msg = String((typeof j.error === 'string' ? j.error : j.error?.message) ?? msg).slice(0, 300);
    } catch {
      /* keep default */
    }
    throw new OpenRouterError(msg, 502);
  }

  let content = '';
  const calls: Array<{ id: string; name: string; args: string }> = [];
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue; // SSE comments (": OPENROUTER PROCESSING") etc.
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let chunk: {
        error?: { message?: string };
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
        }>;
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) throw new OpenRouterError(String(chunk.error.message ?? 'AI error').slice(0, 300), 502);
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? calls.length;
        const call = (calls[i] ??= { id: '', name: '', args: '' });
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name += tc.function.name;
        if (tc.function?.arguments) call.args += tc.function.arguments;
      }
    }
  }
  return {
    content,
    toolCalls: calls
      .filter((c) => c && c.name)
      .map((c, i) => ({
        id: c.id || `call_${Date.now()}_${i}`,
        type: 'function' as const,
        function: { name: c.name, arguments: c.args },
      })),
  };
}

/**
 * Answer one author message: call the model, run the tools it asks for, feed the results
 * back, and repeat until it replies without tools. Everything streams through `emit`.
 */
export async function runAssistant(opts: {
  course: Course;
  user: AuthUser;
  points: AudioPoint[];
  guides: Character[];
  persona: Character | null;
  history: AssistantMessage[];
  emit: (e: AssistantEvent) => void;
  signal: AbortSignal;
}): Promise<void> {
  const system = buildSystemPrompt(opts.course, opts.points, opts.guides, opts.persona);
  // Cache the (large) system prompt across this turn's tool rounds.
  const convo: unknown[] = [
    { role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] },
    ...opts.history,
  ];
  const appended: AssistantMessage[] = [];
  const changed = new Set<AssistantChange>();
  const paid = { count: 0, images: 0 };
  const ctx: Omit<ToolContext, 'toolCallId'> = { course: opts.course, user: opts.user, emit: opts.emit, changed, paid };

  for (let step = 0; step < MAX_STEPS; step++) {
    const { content, toolCalls } = await streamStep(convo, (text) => opts.emit({ type: 'delta', text }), opts.signal);
    const reply: AssistantMessage = {
      role: 'assistant',
      content: content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    convo.push(reply);
    appended.push(reply);
    if (toolCalls.length === 0) break;

    for (const call of toolCalls) {
      if (opts.signal.aborted) return;
      const result = await runTool(call.function.name, call.function.arguments, { ...ctx, toolCallId: call.id });
      const made = (result.data as { url?: unknown } | undefined)?.url;
      opts.emit({
        type: 'tool',
        id: call.id,
        name: call.function.name,
        summary: result.summary,
        ok: result.ok,
        ...(typeof made === 'string' ? { url: made } : {}),
      });
      const msg: AssistantMessage = { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) };
      convo.push(msg);
      appended.push(msg);
    }
    if (changed.size > 0) opts.emit({ type: 'changed', what: [...changed] });
    if (step === MAX_STEPS - 1) {
      appended.push({ role: 'assistant', content: '(Stopped after many steps — ask me to continue.)' });
    }
  }
  opts.emit({ type: 'done', messages: appended });
}
