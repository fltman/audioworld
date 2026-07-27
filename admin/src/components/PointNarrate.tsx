import { useEffect, useState } from 'react';
import type { AudioSource, Character, ElevenVoice } from '@audioworld/shared';
import { ApiError, api } from '../api';

interface Props {
  /** Guides (personas) available to voice this point. */
  characters: Character[];
  /** The point's current audio (preserved except url/kind when regenerated). */
  audio: AudioSource;
  /** Prefill for the narration text (the point's facts, or its name). */
  initialText: string;
  /** Called with the new audio once TTS is generated. */
  onGenerated: (audio: AudioSource) => void;
}

/**
 * Voice a point after the fact: write (or edit) its narration, pick a guide/persona or a
 * plain voice, and generate the speech — used to voice a discovered place you've decided
 * to keep. Uses ElevenLabs credits, on an explicit click only.
 */
export default function PointNarrate({ characters, audio, initialText, onGenerated }: Props) {
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [ttsOff, setTtsOff] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  // Encoded pick: "g:<characterId>" (persona) or "v:<voiceId>" (plain voice).
  const [pick, setPick] = useState('');
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const guides = characters.filter((c) => c.voiceId);

  useEffect(() => {
    api
      .listVoices()
      .then((vs) => {
        setVoices(vs);
        // Default to the first guide (persona) if any, else the first raw voice.
        setPick((p) => p || (guides[0] ? `g:${guides[0].id}` : vs[0] ? `v:${vs[0].id}` : ''));
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 503) setTtsOff(true);
        else setVoicesError(e instanceof Error ? e.message : 'Could not load voices');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const clip = await api.generateTts(text.trim(), voiceId, 'eleven_v3');
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

  if (ttsOff) {
    return (
      <details className="stop-narrate">
        <summary>✨ Narrate this point</summary>
        <p className="muted">
          Set <code>ELEVENLABS_API_KEY</code> on the server to generate narration.
        </p>
      </details>
    );
  }

  return (
    <details className="stop-narrate">
      <summary>✨ Narrate this point{audio.url ? '' : ' — not voiced yet'}</summary>
      <div className="label-row">
        <span className="label">Narration (what’s spoken)</span>
        {audio.description && audio.description.trim() !== text.trim() && (
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setText(audio.description ?? '')}
            title="Replace the narration with the current Facts text"
          >
            ↻ Use facts
          </button>
        )}
      </div>
      <textarea
        className="textarea"
        placeholder="What the listener hears here… eleven_v3 tags like [warmly] work."
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      {voicesError && <div className="error">Voices unavailable: {voicesError}</div>}
      <select className="select" value={pick} onChange={(e) => setPick(e.currentTarget.value)}>
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
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-accent small"
          onClick={() => void generate()}
          disabled={busy || !text.trim() || !resolveVoiceId()}
        >
          {busy ? 'Generating…' : done ? 'Voiced ✓' : audio.url ? 'Re-generate & set' : 'Generate & set audio'}
        </button>
        <span className="muted gen-note">Uses ElevenLabs credits.</span>
      </div>
    </details>
  );
}
