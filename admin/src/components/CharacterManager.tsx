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

          <label className="form-field">
            <span className="label">Persona (your reference when writing its lines)</span>
            <textarea
              className="textarea"
              placeholder="Gruff, weathered, speaks slowly. Knows every wreck on the coast."
              value={form.persona}
              onChange={(e) => patch({ persona: e.currentTarget.value })}
            />
          </label>

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
              {uploads.map((u) => (
                <option key={u.url} value={u.url}>
                  {u.description || u.filename}
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

      {characters.length === 0 ? (
        <p className="muted">No guides yet.</p>
      ) : (
        <ul className="sound-list">
          {characters.map((c) => (
            <li key={c.id} className="sound-row">
              <div className="sound-row__head">
                <span className="sound-row__name">{c.name}</span>
                <span className="row-actions">
                  <button type="button" className="icon-btn" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button type="button" className="icon-btn" onClick={() => void remove(c)}>
                    Delete
                  </button>
                </span>
              </div>
              <span className="sound-row__meta">
                {c.voiceName ? `Voice: ${c.voiceName}` : 'No voice'}
                {c.idleSoundUrl ? ' · has idle sound' : ' · no idle sound'}
              </span>
              {c.persona && <span className="muted">{c.persona}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
