import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssistantChange,
  AssistantMessage,
  Character,
  VoicePreview,
} from '@audioworld/shared';
import { createVoice, streamAssistant } from '../services/assistant';
import ConfirmButton from './ConfirmButton';
import Markdown from './Markdown';

interface Props {
  courseId: string;
  guides: Character[];
  /** Kept mounted (so a reply keeps streaming) while another panel is showing. */
  hidden: boolean;
  /** The assistant changed something: reload it. */
  onChanged: (what: AssistantChange[]) => void;
}

interface ToolChip {
  id: string;
  summary: string;
  ok: boolean;
}

/** The reply being streamed, in order: text as it's written, and each tool as it runs. */
type LiveItem = { kind: 'text'; text: string } | { kind: 'tool'; chip: ToolChip };

/** Three designed voices to audition; the author keeps one. */
interface VoiceCard {
  description: string;
  name: string;
  guideId?: string;
  previews: VoicePreview[];
  chosen: number | null;
  saving: boolean;
  error: string | null;
}

const STORE = (courseId: string) => `audioworld.assistant.${courseId}`;
const MAX_STORED_CHARS = 300_000;

const SUGGESTIONS = [
  'Suggest points along the planned route',
  'Write a start-page description for the walk',
  'Create a guide for this walk and design a voice for it',
  'Write a Suno style description for the background music',
  'Sound-effect prompts for the places in the walk',
];

function load(courseId: string): { messages: AssistantMessage[]; personaId: string } {
  try {
    const raw = localStorage.getItem(STORE(courseId));
    if (raw) {
      const j = JSON.parse(raw) as { messages?: AssistantMessage[]; personaId?: string };
      return { messages: Array.isArray(j.messages) ? j.messages : [], personaId: j.personaId ?? '' };
    }
  } catch {
    /* no storage — start fresh */
  }
  return { messages: [], personaId: '' };
}

function save(courseId: string, messages: AssistantMessage[], personaId: string): void {
  try {
    let kept = messages;
    // Bounded: drop the oldest turns (from a user message on) until it fits.
    while (kept.length && JSON.stringify(kept).length > MAX_STORED_CHARS) {
      const next = kept.findIndex((m, i) => i > 0 && m.role === 'user');
      kept = next > 0 ? kept.slice(next) : [];
    }
    localStorage.setItem(STORE(courseId), JSON.stringify({ messages: kept, personaId }));
  } catch {
    /* storage full or blocked — the chat still works this session */
  }
}

function resultOf(content: string): { ok: boolean; summary: string } {
  try {
    const j = JSON.parse(content) as { ok?: boolean; summary?: string };
    return { ok: j.ok !== false, summary: j.summary ?? 'Done' };
  } catch {
    return { ok: true, summary: 'Done' };
  }
}

/**
 * The course's AI assistant: knows the walk (idea, background, route, points, guides) and
 * can build it — create and change points and guides, design voices (three previews to
 * audition), voice lines and effects — or answer as one of the guides.
 */
export default function AssistantPanel({ courseId, guides, hidden, onChanged }: Props) {
  const [messages, setMessages] = useState<AssistantMessage[]>(() => load(courseId).messages);
  const [personaId, setPersonaId] = useState(() => load(courseId).personaId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceCards, setVoiceCards] = useState<Record<string, VoiceCard>>({});
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // Each course has its own conversation (the panel is keyed by course, so it remounts).
  useEffect(() => save(courseId, messages, personaId), [courseId, messages, personaId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Follow the conversation as it grows (unless the author scrolled up to read).
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages, live, voiceCards]);

  const runTurn = useCallback(
    async (history: AssistantMessage[]) => {
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(true);
      setError(null);
      setLive([]);
      let partial = '';
      let appended: AssistantMessage[] | null = null;
      try {
        await streamAssistant(
          courseId,
          { messages: history, personaId: personaId || null },
          (e) => {
            switch (e.type) {
              case 'delta':
                partial += e.text;
                setLive((l) => {
                  if (!l) return l;
                  const last = l[l.length - 1];
                  return last?.kind === 'text'
                    ? [...l.slice(0, -1), { kind: 'text', text: last.text + e.text }]
                    : [...l, { kind: 'text', text: e.text }];
                });
                break;
              case 'tool':
                partial = '';
                setLive((l) => l && [...l, { kind: 'tool', chip: { id: e.id, summary: e.summary, ok: e.ok } }]);
                break;
              case 'voice_previews':
                setVoiceCards((v) => ({
                  ...v,
                  [e.toolCallId]: {
                    description: e.description,
                    name: e.name,
                    guideId: e.guideId,
                    previews: e.previews,
                    chosen: null,
                    saving: false,
                    error: null,
                  },
                }));
                break;
              case 'changed':
                onChangedRef.current(e.what);
                break;
              case 'done':
                appended = e.messages;
                break;
              case 'error':
                setError(e.error);
                break;
            }
          },
          ac.signal
        );
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : 'The assistant failed');
      } finally {
        const done = appended as AssistantMessage[] | null;
        if (done) setMessages((m) => [...m, ...done]);
        else if (partial.trim()) setMessages((m) => [...m, { role: 'assistant', content: `${partial.trim()} …` }]);
        setLive(null);
        setBusy(false);
        if (abortRef.current === ac) abortRef.current = null;
      }
    },
    [courseId, personaId]
  );

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: AssistantMessage[] = [...messages, { role: 'user', content: t }];
    setMessages(next);
    setInput('');
    void runTurn(next);
  };

  const pickVoice = async (cardId: string, i: number) => {
    const card = voiceCards[cardId];
    if (!card || card.saving) return;
    const patch = (p: Partial<VoiceCard>) => setVoiceCards((v) => ({ ...v, [cardId]: { ...v[cardId]!, ...p } }));
    patch({ saving: true, error: null });
    try {
      const r = await createVoice({
        generatedVoiceId: card.previews[i]!.generatedVoiceId,
        name: card.name.trim() || 'New voice',
        description: card.description,
        guideId: card.guideId,
      });
      patch({ saving: false, chosen: i });
      if (r.guideId) onChangedRef.current(['guides']);
      send(
        `(I picked preview ${i + 1}. It's saved as the voice “${r.name}” (voice id ${r.voiceId})` +
          `${r.guideId ? ' and given to the guide' : ''}.)`
      );
    } catch (e) {
      patch({ saving: false, error: e instanceof Error ? e.message : 'Could not save the voice' });
    }
  };

  const results = new Map<string, { ok: boolean; summary: string }>();
  for (const m of messages) if (m.role === 'tool') results.set(m.tool_call_id, resultOf(m.content));

  const voiceCard = (id: string) => {
    const card = voiceCards[id];
    if (!card) return null;
    return (
      <div key={`v-${id}`} className="ai-voices">
        <label className="ai-voices__name">
          <span>Voice name</span>
          <input
            className="input"
            value={card.name}
            disabled={card.chosen != null}
            onChange={(e) => {
              const name = e.currentTarget.value;
              setVoiceCards((v) => ({ ...v, [id]: { ...v[id]!, name } }));
            }}
          />
        </label>
        {card.previews.map((p, i) => (
          <div key={p.generatedVoiceId} className={`ai-voices__row${card.chosen === i ? ' is-chosen' : ''}`}>
            <span className="ai-voices__num">{i + 1}</span>
            <audio controls preload="none" src={`data:${p.mediaType};base64,${p.audioBase64}`} />
            {card.chosen == null ? (
              <button
                type="button"
                className="btn btn-accent small"
                disabled={card.saving}
                onClick={() => void pickVoice(id, i)}
              >
                {card.saving ? 'Saving…' : 'Use'}
              </button>
            ) : (
              card.chosen === i && <span className="ai-voices__chosen">✓ Chosen</span>
            )}
          </div>
        ))}
        {card.error && <div className="error">{card.error}</div>}
      </div>
    );
  };

  const chip = (c: ToolChip) => (
    <div key={`t-${c.id}`} className={`ai-tool${c.ok ? '' : ' is-failed'}`}>
      {c.ok ? '✓' : '⚠'} {c.summary}
    </div>
  );

  const persona = guides.find((g) => g.id === personaId);

  return (
    <section className="section ai" hidden={hidden}>
      <div className="ai__head">
        <span className="section-title">AI assistant</span>
        {messages.length > 0 && !busy && (
          <ConfirmButton className="btn btn-ghost small" onConfirm={() => setMessages([])}>
            New chat
          </ConfirmButton>
        )}
      </div>

      <div className="ai__list" ref={listRef}>
        {messages.length === 0 && !live && (
          <div className="ai__empty">
            <p className="hint">
              I know this walk — its idea, background, route, points and guides — and I can build
              it with you: place and change points, create guides and design their voices, write
              narration, and suggest prompts for sound effects and music.
            </p>
            <div className="ai__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="ai__suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="ai-msg ai-msg--user">
                {m.content}
              </div>
            );
          }
          if (m.role === 'assistant') {
            return (
              <div key={i} className="ai-turn">
                {m.content && (
                  <div className="ai-msg ai-msg--bot">
                    <Markdown text={m.content} />
                  </div>
                )}
                {m.tool_calls?.map((c) => {
                  const r = results.get(c.id);
                  return [
                    chip({ id: c.id, ok: r?.ok ?? false, summary: r?.summary ?? c.function.name }),
                    c.function.name === 'design_voice' ? voiceCard(c.id) : null,
                  ];
                })}
              </div>
            );
          }
          return null;
        })}

        {live && (
          <div className="ai-turn">
            {live.map((item, i) =>
              item.kind === 'text' ? (
                <div key={`l-${i}`} className="ai-msg ai-msg--bot">
                  <Markdown text={item.text} />
                </div>
              ) : (
                [chip(item.chip), voiceCard(item.chip.id)]
              )
            )}
            {live[live.length - 1]?.kind !== 'text' && (
              <div className="ai-typing" aria-label="Working">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="ai-error">
            <span>{error}</span>
            {!busy && messages[messages.length - 1]?.role === 'user' && (
              <button type="button" className="btn btn-ghost small" onClick={() => void runTurn(messages)}>
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      <form
        className="ai__composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          className="textarea ai__input"
          rows={3}
          placeholder={persona ? `Talk with ${persona.name}…` : 'Ask about the walk, or tell me what to build…'}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <div className="ai__controls">
          <label className="ai__persona" title="Let the whole chat speak as one of your guides">
            <span>Talk as</span>
            <select className="select" value={personaId} onChange={(e) => setPersonaId(e.currentTarget.value)}>
              <option value="">Assistant</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {busy ? (
            <button type="button" className="btn btn-danger small" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="btn btn-accent small" disabled={!input.trim()}>
              Send
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
