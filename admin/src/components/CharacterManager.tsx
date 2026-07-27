import { useEffect, useState } from 'react';
import type { Character, CharacterInput, ElevenVoice, UploadListItem } from '@audioworld/shared';
import { ApiError, absoluteAudioUrl, api } from '../api';

interface Props {
  characters: Character[];
  onChange: (next: Character[]) => void;
}

interface FormState {
  id: string | null;
  name: string;
  persona: string;
  voiceId: string;
  /** Held in form state (not re-derived from the voices list) so editing with the
   *  ElevenLabs feature off doesn't blank the cached name. */
  voiceName: string;
  idleSoundUrl: string;
}

const EMPTY: FormState = { id: null, name: '', persona: '', voiceId: '', voiceName: '', idleSoundUrl: '' };

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i;
const byName = (a: Character, b: Character) => a.name.localeCompare(b.name);

/** Option label for the idle-sound picker: name + size (+ SFX/Voice hint from generate). */
function idleLabel(u: UploadListItem): string {
  const d = (u.description ?? '').trim();
  const tag = /^sfx:/i.test(d) ? '🔊 ' : /^tts:/i.test(d) ? '🎙 ' : '';
  const name = d || u.filename;
  return `${tag}${name} · ${Math.round(u.size / 1024)} KB`;
}

/**
 * Manage reusable guides — a persona + an ElevenLabs voice (its narration voice) + an
 * idle sound (what plays while it travels between narration stops). Assign one to a
 * moving path point in the point editor.
 */
export default function CharacterManager({ characters, onChange }: Props) {
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-read on each form open so a sound generated/uploaded in the library meanwhile shows up.
  const loadUploads = () => api.listUploads().then(setUploads).catch(() => setUploads([]));

  useEffect(() => {
    // Voices power the narration-voice picker; a 503 (feature off) just leaves it empty.
    api.listVoices().then(setVoices).catch(() => setVoices([]));
    void loadUploads();
  }, []);

  const startNew = () => {
    setError(null);
    void loadUploads();
    setForm({ ...EMPTY });
  };

  const startEdit = (c: Character) => {
    setError(null);
    void loadUploads();
    setForm({
      id: c.id,
      name: c.name,
      persona: c.persona,
      voiceId: c.voiceId,
      voiceName: c.voiceName ?? '',
      idleSoundUrl: c.idleSoundUrl ?? '',
    });
  };

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setError('A name is required.');
      return;
    }
    const input: CharacterInput = {
      name,
      persona: form.persona,
      voiceId: form.voiceId,
      voiceName: form.voiceName || undefined,
      idleSoundUrl: form.idleSoundUrl || undefined,
    };
    const byName = (a: Character, b: Character) => a.name.localeCompare(b.name);
    setBusy(true);
    setError(null);
    try {
      if (form.id) {
        const updated = await api.updateCharacter(form.id, input);
        onChange(characters.map((c) => (c.id === updated.id ? updated : c)).sort(byName));
      } else {
        const created = await api.createCharacter(input);
        onChange([...characters, created].sort(byName));
      }
      setForm(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Character) => {
    setError(null);
    try {
      await api.deleteCharacter(c.id);
      onChange(characters.filter((x) => x.id !== c.id));
      if (form?.id === c.id) setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const duplicate = async (c: Character) => {
    setError(null);
    try {
      const created = await api.createCharacter({
        name: `${c.name} (copy)`,
        persona: c.persona,
        voiceId: c.voiceId,
        voiceName: c.voiceName,
        idleSoundUrl: c.idleSoundUrl,
      });
      onChange([...characters, created].sort(byName));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Expand the rough persona (+ name) into a vivid one via the AI.
  const enhance = async () => {
    if (!form) return;
    setEnhancing(true);
    setError(null);
    try {
      const { persona } = await api.enhancePersona(form.name.trim(), form.persona);
      patch({ persona });
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? 'AI enhance is off — set OPENROUTER_API_KEY on the server.'
          : e instanceof Error
            ? e.message
            : 'Enhance failed'
      );
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <section className="section">
      <div className="section-title">
        Guides ({characters.length})
        {!form && (
          <button type="button" className="btn btn-ghost small" onClick={startNew}>
            + New guide
          </button>
        )}
      </div>

      <p className="muted">
        A guide is a reusable character: a voice for its narrated stops and an idle sound it
        makes while moving between them. Assign one to a moving point in the point editor.
      </p>

      {error && <div className="error">{error}</div>}

      {form && (
        <div className="gen-panel">
          <label className="form-field">
            <span className="label">Name</span>
            <input
              className="input"
              placeholder="e.g. Old Fisherman"
              value={form.name}
              onChange={(e) => patch({ name: e.currentTarget.value })}
            />
          </label>

          <div className="form-field">
            <div className="label-row">
              <span className="label">Persona (your reference when writing its lines)</span>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => void enhance()}
                disabled={enhancing || (!form.name.trim() && !form.persona.trim())}
                title="Let the AI expand this into a vivid persona"
              >
                {enhancing ? '✨ Enhancing…' : '✨ Enhance'}
              </button>
            </div>
            <textarea
              className="textarea"
              placeholder="Gruff, weathered, speaks slowly. Knows every wreck on the coast. — or just type a few words and hit ✨ Enhance."
              value={form.persona}
              onChange={(e) => patch({ persona: e.currentTarget.value })}
            />
          </div>

          <label className="form-field">
            <span className="label">Narration voice</span>
            {voices.length > 0 ? (
              <select
                className="select"
                value={form.voiceId}
                onChange={(e) => {
                  const voiceId = e.currentTarget.value;
                  patch({ voiceId, voiceName: voices.find((v) => v.id === voiceId)?.name ?? '' });
                }}
              >
                <option value="">— None —</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.category ? ` · ${v.category}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="muted">
                No voices — set <code>ELEVENLABS_API_KEY</code> on the server to pick one.
              </p>
            )}
          </label>

          <label className="form-field">
            <span className="label">Idle sound (travelling audio between stops)</span>
            <select
              className="select"
              value={form.idleSoundUrl}
              onChange={(e) => patch({ idleSoundUrl: e.currentTarget.value })}
            >
              <option value="">— None —</option>
              {uploads
                .filter((u) => AUDIO_EXT.test(u.filename))
                .map((u) => (
                  <option key={u.url} value={u.url}>
                    {idleLabel(u)}
                  </option>
                ))}
            </select>
            {form.idleSoundUrl && (
              <audio
                className="clip-preview"
                controls
                preload="none"
                src={absoluteAudioUrl(form.idleSoundUrl)}
              />
            )}
          </label>

          <div className="actions">
            <button type="button" className="btn btn-accent" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save guide'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {characters.length === 0 && !form ? (
        <p className="muted">No guides yet. Create one to voice narrated stops with a persona.</p>
      ) : (
        <div className="guide-grid">
          {characters.map((c) => (
            <article key={c.id} className="guide-card">
              <div className="guide-card__head">
                <span className="guide-card__mask" aria-hidden="true">
                  🎭
                </span>
                <span className="guide-card__name">{c.name}</span>
                <span className="row-actions">
                  <button type="button" className="icon-btn" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button type="button" className="icon-btn" onClick={() => void duplicate(c)}>
                    Duplicate
                  </button>
                  <button type="button" className="icon-btn icon-btn--danger" onClick={() => void remove(c)}>
                    Delete
                  </button>
                </span>
              </div>
              <div className="guide-card__chips">
                <span className={`chip ${c.voiceName ? 'chip--on' : ''}`}>
                  🎙 {c.voiceName || 'No voice'}
                </span>
                <span className={`chip ${c.idleSoundUrl ? 'chip--on' : ''}`}>
                  {c.idleSoundUrl ? '🔊 Idle sound' : '🔇 No idle sound'}
                </span>
              </div>
              {c.persona && <p className="guide-card__persona">{c.persona}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
