import { useEffect, useState } from 'react';
import type { AudioSource, Character, ElevenVoice } from '@audioworld/shared';
import { ApiError, api } from '../api';

interface Props {
  /** Guides (personas) available to voice this point/stop. */
  characters: Character[];
  /** The current audio (preserved except url/kind when regenerated). */
  audio: AudioSource;
  /** Prefill for the narration text (the facts, or a fallback name). */
  initialText: string;
  /** Name/context for the narration prompt. */
  title: string;
  /** Called with the new audio once TTS is generated. */
  onGenerated: (audio: AudioSource) => void;
  /** Shared voice list — when provided, this component reuses it instead of fetching its own
   *  (so a path with many stops makes one voices request, not one per stop). */
  voices?: ElevenVoice[];
  /** When `voices` is provided: whether TTS is unconfigured (503) upstream. */
  ttsOff?: boolean;
  /** Editable knowledge base. When `onFactsChange` is set a Facts field is shown and used as
   *  the narration source (instead of `audio.description`) — this is how path stops work. */
  facts?: string;
  onFactsChange?: (facts: string) => void;
  /** Guide (its id) to pre-select in the persona picker. */
  defaultCharacterId?: string;
  /** Called when the picked guide changes — its id, or '' for a plain (non-guide) voice. */
  onCharacterChange?: (characterId: string) => void;
  /** Override the collapsible summary label. */
  summaryLabel?: string;
  /** Start expanded (e.g. the first path stop, so the editor is obvious). */
  defaultOpen?: boolean;
}

/**
 * Voice a point (or a path stop) after the fact: write (or edit) its narration from the facts
 * in a guide's persona, then render the speech. Uses ElevenLabs credits, on explicit clicks.
 */
export default function PointNarrate({
  characters,
  audio,
  initialText,
  title,
  onGenerated,
  voices: voicesProp,
  ttsOff: ttsOffProp,
  facts,
  onFactsChange,
  defaultCharacterId,
  onCharacterChange,
  summaryLabel,
  defaultOpen,
}: Props) {
  // When a voice list is passed in we adopt it; otherwise we fetch our own.
  const shared = voicesProp !== undefined;
  const [voices, setVoices] = useState<ElevenVoice[]>(voicesProp ?? []);
  const [ttsOff, setTtsOff] = useState(ttsOffProp ?? false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  // Encoded pick: "g:<characterId>" (persona) or "v:<voiceId>" (plain voice).
  const [pick, setPick] = useState('');
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(defaultOpen ?? false);

  // Facts come from an editable prop (stops) or the clip's own description (single points).
  const editableFacts = onFactsChange !== undefined;
  const factsSource = editableFacts ? facts ?? '' : audio.description ?? '';

  const guides = characters.filter((c) => c.voiceId);
  const pickedGuide = pick.startsWith('g:') ? characters.find((c) => c.id === pick.slice(2)) : undefined;

  // Which entry the picker opens on: the requested guide, else the first guide, else a voice.
  const defaultPick = (vs: ElevenVoice[]): string => {
    if (defaultCharacterId && characters.some((c) => c.id === defaultCharacterId && c.voiceId))
      return `g:${defaultCharacterId}`;
    if (guides[0]) return `g:${guides[0].id}`;
    if (vs[0]) return `v:${vs[0].id}`;
    return '';
  };

  // Step 1: AI writes the spoken narration from the facts, in the picked guide's persona.
  const write = async () => {
    const f = factsSource.trim();
    if (!f) {
      setError('Add some facts first — the narration is written from them.');
      return;
    }
    setWriting(true);
    setError(null);
    try {
      const { narration } = await api.writeNarration(f, pickedGuide?.persona ?? '', title);
      setText(narration);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? 'AI writing is off — set OPENROUTER_API_KEY on the server.'
          : e instanceof Error
            ? e.message
            : 'Writing failed'
      );
    } finally {
      setWriting(false);
    }
  };

  useEffect(() => {
    if (shared) {
      setVoices(voicesProp ?? []);
      setTtsOff(ttsOffProp ?? false);
      setPick((p) => p || defaultPick(voicesProp ?? []));
      return;
    }
    api
      .listVoices()
      .then((vs) => {
        setVoices(vs);
        setPick((p) => p || defaultPick(vs));
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 503) setTtsOff(true);
        else setVoicesError(e instanceof Error ? e.message : 'Could not load voices');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, voicesProp, ttsOffProp]);

  const changePick = (v: string) => {
    setPick(v);
    onCharacterChange?.(v.startsWith('g:') ? v.slice(2) : '');
  };

  const resolveVoiceId = (): string => {
    if (pick.startsWith('g:')) return characters.find((c) => c.id === pick.slice(2))?.voiceId ?? '';
    if (pick.startsWith('v:')) return pick.slice(2);
    return '';
  };

  const generate = async () => {
    const voiceId = resolveVoiceId();
    if (!voiceId || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const clip = await api.generateTts(text.trim(), voiceId, 'eleven_v4');
      // Keep title/description(facts)/variants; swap in the generated clip.
      onGenerated({ ...audio, kind: 'upload', url: clip.url });
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Narration failed');
    } finally {
      setBusy(false);
    }
  };

  const summary = summaryLabel ?? `✨ Narrate this point${audio.url ? '' : ' — not voiced yet'}`;

  // Writing the monologue only needs OpenRouter, so the facts + write steps stay available
  // even when TTS is unconfigured — only the final render is gated on ElevenLabs.

  return (
    <details className="stop-narrate" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>

      {editableFacts && (
        <label className="form-field">
          <span className="label">Facts (knowledge base)</span>
          <textarea
            className="textarea"
            placeholder="Facts this stop's narration draws on — e.g. “built 1887, the city's first electric tram depot…”"
            value={facts ?? ''}
            onChange={(e) => onFactsChange!(e.currentTarget.value || '')}
          />
        </label>
      )}

      <label className="form-field">
        <span className="label">Voice / persona</span>
        <select className="select" value={pick} onChange={(e) => changePick(e.currentTarget.value)}>
          {guides.length > 0 && (
            <optgroup label="Guides (persona)">
              {guides.map((c) => (
                <option key={c.id} value={`g:${c.id}`}>
                  🎭 {c.name}
                  {c.voiceName ? ` · ${c.voiceName}` : ''}
                </option>
              ))}
            </optgroup>
          )}
          {voices.length > 0 && (
            <optgroup label="Voices">
              {voices.map((v) => (
                <option key={v.id} value={`v:${v.id}`}>
                  {v.name}
                  {v.category ? ` · ${v.category}` : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {/* Step 1 — write the spoken narration from the facts, in the chosen persona. */}
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-accent small"
          onClick={() => void write()}
          disabled={writing || !factsSource.trim()}
          title="Let the AI retell the facts as spoken narration in this persona"
        >
          {writing
            ? '✨ Writing…'
            : pickedGuide
              ? `✨ Write in ${pickedGuide.name}’s voice`
              : '✨ Write narration'}
        </button>
        {factsSource && factsSource.trim() !== text.trim() && (
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setText(factsSource)}
            title="Use the facts verbatim as the narration"
          >
            ↻ Facts verbatim
          </button>
        )}
      </div>

      <label className="form-field">
        <span className="label">Narration (what’s spoken)</span>
        <textarea
          className="textarea"
          placeholder="What the listener hears here — write it yourself or ✨ Write above. eleven_v4 audio tags like [warmly] work."
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      </label>

      {voicesError && <div className="error">Voices unavailable: {voicesError}</div>}

      {/* Step 2 — render the narration to audio with the chosen voice. */}
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-accent small"
          onClick={() => void generate()}
          disabled={busy || !text.trim() || !resolveVoiceId() || ttsOff}
        >
          {busy ? '🔊 Rendering…' : done ? 'Rendered ✓' : audio.url ? '🔊 Re-render audio' : '🔊 Render audio'}
        </button>
        {ttsOff ? (
          <span className="muted gen-note">
            Set <code>ELEVENLABS_API_KEY</code> on the server to render.
          </span>
        ) : (
          <span className="muted gen-note">Uses ElevenLabs credits.</span>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </details>
  );
}
