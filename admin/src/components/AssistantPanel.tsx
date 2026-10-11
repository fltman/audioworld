import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  AssistantChange,
  AssistantChatSummary,
  AssistantMessage,
  Character,
  Coordinates,
  MapAnnotation,
  VoicePreview,
} from '@audioworld/shared';
import { absoluteAudioUrl } from '../api';
import { createVoice, deleteChat, getChat, importChat, listChats, streamAssistant } from '../services/assistant';
import ConfirmButton from './ConfirmButton';
import Markdown from './Markdown';

interface Props {
  courseId: string;
  guides: Character[];
  /** Kept mounted (so a reply keeps streaming) while another panel is showing. */
  hidden: boolean;
  /** The assistant changed something: reload it. */
  onChanged: (what: AssistantChange[]) => void;
  /** The course's current cover (to mark a generated image that already is it). */
  coverUrl?: string;
  /** Make a generated image the course cover. */
  onUseCover: (url: string) => void | Promise<void>;
  /** Show these on the map (the assistant explaining something spatial). */
  onAnnotate: (annotations: MapAnnotation[]) => void;
}

interface ToolChip {
  id: string;
  /** The tool that ran (decides how a file it made is shown). */
  name: string;
  summary: string;
  ok: boolean;
  /** A file it made: a voiced line, a sound effect, an image. */
  url?: string;
  /** Its arguments (from the history), e.g. to show a map annotation again. */
  args?: string;
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

/** Where chats were kept in the browser before they moved to the server. */
const OLD_STORE = (courseId: string) => `audioworld.assistant.${courseId}`;

const SUGGESTIONS = [
  'Suggest points along the planned route',
  'Write a start-page description for the walk',
  'Create a guide for this walk and design a voice for it',
  'Write a Suno style description for the background music',
  'Sound-effect prompts for the places in the walk',
];

/** In-flight moves, so every caller (a re-mount, a quick reopen) waits for the same one. */
const migrations = new Map<string, Promise<void>>();

/** Move a chat kept in this browser (before chats were saved on the server) over, once. */
function migrateLocalChat(courseId: string): Promise<void> {
  let run = migrations.get(courseId);
  if (!run) {
    run = moveLocalChat(courseId);
    migrations.set(courseId, run);
  }
  return run;
}

async function moveLocalChat(courseId: string): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OLD_STORE(courseId));
  } catch {
    return;
  }
  if (!raw) return;
  // Take it out first, so a second run (another tab, a re-mount) can't move it twice.
  localStorage.removeItem(OLD_STORE(courseId));
  try {
    const j = JSON.parse(raw) as { messages?: AssistantMessage[]; personaId?: string };
    if (Array.isArray(j.messages) && j.messages.some((m) => m.role === 'user')) {
      await importChat(courseId, { messages: j.messages, personaId: j.personaId || null });
    }
  } catch {
    try {
      localStorage.setItem(OLD_STORE(courseId), raw); // put it back for the next try
    } catch {
      /* storage gone — nothing more to do */
    }
  }
}

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** The annotations of a show_on_map call, from its (model-written) arguments. */
function annotationsOf(args: string | undefined): MapAnnotation[] {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const at = (o: Record<string, unknown>): Coordinates | null =>
    num(o.lat) && num(o.lng) ? { lat: o.lat, lng: o.lng } : null;
  try {
    const items = (JSON.parse(args ?? '{}') as { items?: unknown[] }).items ?? [];
    return items.flatMap((raw): MapAnnotation[] => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const label = typeof o.label === 'string' ? o.label.slice(0, 60) : undefined;
      if (o.kind === 'point' && typeof o.id === 'string') return [{ kind: 'point', id: o.id, label }];
      if (o.kind === 'line' && Array.isArray(o.path)) {
        const path = o.path.map((c) => at((c ?? {}) as Record<string, unknown>)).filter((c): c is Coordinates => !!c);
        return path.length >= 2 ? [{ kind: 'line', path, label }] : [];
      }
      const c = at(o);
      if (!c) return [];
      return o.kind === 'area' && num(o.radius) ? [{ kind: 'area', at: c, radius: o.radius, label }] : [{ kind: 'mark', at: c, label }];
    });
  } catch {
    return [];
  }
}

function resultOf(content: string): { ok: boolean; summary: string; url?: string } {
  try {
    const j = JSON.parse(content) as { ok?: boolean; summary?: string; data?: { url?: unknown } };
    const url = typeof j.data?.url === 'string' ? j.data.url : undefined;
    return { ok: j.ok !== false, summary: j.summary ?? 'Done', url };
  } catch {
    return { ok: true, summary: 'Done' };
  }
}

/**
 * The course's AI assistant: knows the walk (idea, background, route, points, guides) and
 * can build it — create and change points and guides, design voices (three previews to
 * audition), voice lines and effects — or answer as one of the guides.
 */
export default function AssistantPanel({ courseId, guides, hidden, onChanged, coverUrl, onUseCover, onAnnotate }: Props) {
  // Saved chats (on the server) and the open one; null = a new chat, not saved until sent.
  const [chats, setChats] = useState<AssistantChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [personaId, setPersonaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceCards, setVoiceCards] = useState<Record<string, VoiceCard>>({});
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const onAnnotateRef = useRef(onAnnotate);
  onAnnotateRef.current = onAnnotate;
  const showCoord = (c: Coordinates) => onAnnotate([{ kind: 'mark', at: c, label: `${c.lat}, ${c.lng}` }]);

  const openChat = useCallback(async (id: string | null) => {
    abortRef.current?.abort();
    setLive(null);
    setError(null);
    setVoiceCards({});
    following.current = true;
    if (!id) {
      setChatId(null);
      setMessages([]);
      return;
    }
    try {
      const chat = await getChat(id);
      setChatId(chat.id);
      setMessages(chat.messages);
      setPersonaId(chat.personaId ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the chat');
    }
  }, []);

  // Each course has its own chats (the panel is keyed by course, so it remounts): open the
  // most recent one, after moving any chat this browser still holds to the server.
  useEffect(() => {
    let live = true;
    (async () => {
      await migrateLocalChat(courseId);
      try {
        const list = await listChats(courseId);
        if (!live) return;
        setChats(list);
        if (list[0]) await openChat(list[0].id);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the chats');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
      abortRef.current?.abort();
    };
  }, [courseId, openChat]);

  const refreshChats = () => void listChats(courseId).then(setChats).catch(() => {});

  const removeChat = async () => {
    if (!chatId) return;
    try {
      await deleteChat(chatId);
      const list = chats.filter((c) => c.id !== chatId);
      setChats(list);
      await openChat(list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the chat');
    }
  };

  // Follow the conversation as it grows — unless the author has scrolled up to read.
  // Whether we're following is decided by where they were *before* new content landed
  // (a tool card or an image can be taller than any "near the bottom" margin), and the
  // content is watched for growth too, so images and players loading later still follow.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const toBottom = () => {
    const el = listRef.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  };
  const onScroll = () => {
    const el = listRef.current;
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useLayoutEffect(toBottom, [messages, live, voiceCards, error, hidden]);
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(toBottom);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const runTurn = useCallback(
    async (turn: { message?: string; retry?: boolean }) => {
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
          { chatId, ...turn, personaId: personaId || null },
          (e) => {
            switch (e.type) {
              case 'chat':
                setChatId(e.chat.id);
                setChats((list) => (list.some((c) => c.id === e.chat.id) ? list : [e.chat, ...list]));
                break;
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
                setLive((l) => l && [...l, { kind: 'tool', chip: { id: e.id, name: e.name, summary: e.summary, ok: e.ok, url: e.url } }]);
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
              case 'map':
                onAnnotateRef.current(e.annotations);
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
        refreshChats();
      }
    },
    [courseId, chatId, personaId]
  );

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    following.current = true; // you just wrote: show it, and the reply
    setMessages((m) => [...m, { role: 'user', content: t }]);
    setInput('');
    void runTurn({ message: t });
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

  const results = new Map<string, { ok: boolean; summary: string; url?: string }>();
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

  const chip = (c: ToolChip) => [
    <div key={`t-${c.id}`} className={`ai-tool${c.ok ? '' : ' is-failed'}`}>
      {c.ok ? (c.name === 'show_on_map' ? '📍' : '✓') : '⚠'} {c.summary}
      {c.ok && c.name === 'show_on_map' && c.args && (
        <button type="button" className="ai-tool__again" onClick={() => onAnnotate(annotationsOf(c.args))}>
          Show again
        </button>
      )}
    </div>,
    c.url && c.name === 'generate_cover_image' ? (
      <figure key={`i-${c.id}`} className="ai-image">
        <img src={absoluteAudioUrl(c.url)} alt="Generated cover" />
        <figcaption>
          {coverUrl === c.url ? (
            <span className="ai-image__current">✓ The walk’s cover</span>
          ) : (
            <button type="button" className="btn btn-accent small" onClick={() => void onUseCover(c.url!)}>
              Use as cover
            </button>
          )}
          <a className="ai-image__open" href={absoluteAudioUrl(c.url)} target="_blank" rel="noreferrer">
            Download
          </a>
        </figcaption>
      </figure>
    ) : c.url ? (
      <audio key={`a-${c.id}`} className="ai-audio" controls preload="none" src={absoluteAudioUrl(c.url)} />
    ) : null,
  ];

  const persona = guides.find((g) => g.id === personaId);

  return (
    <section className="section ai" hidden={hidden}>
      <div className="ai__head">
        <span className="section-title">AI assistant</span>
        <div className="ai__chatbar">
          <select
            className="select ai__chats"
            value={chatId ?? ''}
            disabled={busy || loading}
            title="Your saved chats about this walk"
            onChange={(e) => void openChat(e.currentTarget.value || null)}
          >
            {!chatId && <option value="">{loading ? 'Loading…' : 'New chat'}</option>}
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · {shortDate(c.updatedAt)}
              </option>
            ))}
          </select>
          {chatId && !busy && (
            <button type="button" className="btn btn-ghost small" onClick={() => void openChat(null)}>
              New
            </button>
          )}
          {chatId && !busy && (
            <ConfirmButton className="btn btn-ghost small" onConfirm={() => void removeChat()}>
              Delete
            </ConfirmButton>
          )}
        </div>
      </div>

      <div className="ai__list" ref={listRef} onScroll={onScroll}>
        <div className="ai__inner" ref={innerRef}>
          {messages.length === 0 && !live && !loading && (
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
                      <Markdown text={m.content} onCoord={showCoord} />
                    </div>
                  )}
                  {m.tool_calls?.map((c) => {
                    const r = results.get(c.id);
                    return [
                      chip({
                        id: c.id,
                        name: c.function.name,
                        ok: r?.ok ?? false,
                        summary: r?.summary ?? c.function.name,
                        url: r?.url,
                        args: c.function.arguments,
                      }),
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
                    <Markdown text={item.text} onCoord={showCoord} />
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
                <button type="button" className="btn btn-ghost small" onClick={() => void runTurn({ retry: true })}>
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
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
