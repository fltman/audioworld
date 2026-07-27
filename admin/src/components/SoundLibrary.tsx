import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ElevenVoice, UploadListItem } from '@audioworld/shared';
import { ApiError, absoluteAudioUrl, api } from '../api';

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i;
const isAudio = (filename: string): boolean => AUDIO_EXT.test(filename);

/** A short kind badge derived from how the clip was made (generate prefixes its label). */
function soundKind(u: UploadListItem): { label: string; cls: string } {
  const d = (u.description ?? '').trim().toLowerCase();
  if (d.startsWith('sfx:')) return { label: 'SFX', cls: 'kind--sfx' };
  if (d.startsWith('tts:')) return { label: 'Voice', cls: 'kind--voice' };
  return { label: 'Clip', cls: 'kind--clip' };
}

function SoundCard({ upload }: { upload: UploadListItem }) {
  const [copied, setCopied] = useState(false);
  const [desc, setDesc] = useState(upload.description ?? '');
  const [saved, setSaved] = useState(upload.description ?? '');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = soundKind(upload);

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(absoluteAudioUrl(upload.url));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    const next = desc.trim();
    if (next === saved) return;
    setSaving(true);
    setError(null);
    try {
      await api.setUploadDescription(upload.filename, next);
      setSaved(next);
      setDesc(next);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="sound-card">
      <div className="sound-card__top">
        <span className={`kind ${kind.cls}`}>{kind.label}</span>
        <button type="button" className="icon-btn" onClick={() => void copy()}>
          {copied ? 'Copied ✓' : '⧉ URL'}
        </button>
      </div>
      <input
        className="sound-card__name"
        placeholder="Untitled clip — add a name…"
        value={desc}
        title={upload.filename}
        onChange={(e) => setDesc(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <audio className="sound-card__audio" controls preload="none" src={absoluteAudioUrl(upload.url)} />
      <div className="sound-card__meta">
        <span>{Math.round(upload.size / 1024)} KB</span>
        <span className="muted">{saving ? 'saving…' : flash ? 'saved ✓' : ''}</span>
      </div>
      {error && <span className="error">{error}</span>}
    </article>
  );
}

type GenStatus = 'checking' | 'ready' | 'off';

/** Generate sound effects + speech (ElevenLabs) straight into the library. */
function GeneratePanel({ onGenerated }: { onGenerated: () => void }) {
  const [status, setStatus] = useState<GenStatus>('checking');
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [mode, setMode] = useState<'sfx' | 'tts'>('sfx');
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState('');
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .listVoices()
      .then((vs) => {
        setVoices(vs);
        if (vs[0]) setVoiceId(vs[0].id);
        setStatus('ready');
      })
      .catch((e) => {
        // 503 = feature not configured (no key). Anything else = configured but the
        // voice list failed — keep the panel (SFX still works) and surface the reason.
        if (e instanceof ApiError && e.status === 503) {
          setStatus('off');
        } else {
          setVoicesError(e instanceof Error ? e.message : 'Could not load voices');
          setStatus('ready');
        }
      });
  }, []);

  const flashDone = () => {
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'sfx') {
        const dur = durationSec.trim() ? Number(durationSec) : undefined;
        await api.generateSfx(prompt.trim(), dur);
        setPrompt('');
      } else {
        await api.generateTts(text.trim(), voiceId, 'eleven_v3');
        setText('');
      }
      onGenerated();
      flashDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'checking') return null;
  if (status === 'off') {
    return (
      <p className="muted gen-off">
        AI generation is off — set <code>ELEVENLABS_API_KEY</code> on the server to generate sound
        effects and speech here.
      </p>
    );
  }

  const canGo =
    !busy && (mode === 'sfx' ? prompt.trim().length > 0 : text.trim().length > 0 && !!voiceId);

  return (
    <div className="gen-panel">
      <div className="gen-panel__head">
        <span className="section-title" style={{ margin: 0 }}>
          ✨ Generate
        </span>
        <div className="seg">
          <button
            type="button"
            className={mode === 'sfx' ? 'active' : ''}
            onClick={() => setMode('sfx')}
          >
            Sound effect
          </button>
          <button
            type="button"
            className={mode === 'tts' ? 'active' : ''}
            onClick={() => setMode('tts')}
          >
            Speech
          </button>
        </div>
      </div>

      {mode === 'sfx' ? (
        <>
          <textarea
            className="textarea"
            placeholder="Describe the sound — e.g. “distant church bells over wind”"
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
          />
          <label className="gen-dur">
            Length (s, optional)
            <input
              className="input"
              type="number"
              min={0.5}
              max={22}
              step={0.5}
              placeholder="auto"
              value={durationSec}
              onChange={(e) => setDurationSec(e.currentTarget.value)}
            />
          </label>
        </>
      ) : (
        <>
          <textarea
            className="textarea"
            placeholder="What should the voice say? eleven_v3 understands inline tags like [whispers], [excited], [laughs]."
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
          />
          {voices.length > 0 ? (
            <select
              className="select"
              value={voiceId}
              onChange={(e) => setVoiceId(e.currentTarget.value)}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.category ? ` · ${v.category}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="muted">{voicesError ?? 'No voices available on this account.'}</p>
          )}
          <p className="muted gen-hint">Model: eleven_v3</p>
        </>
      )}

      <div className="row-actions">
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => void generate()}
          disabled={!canGo}
        >
          {busy ? 'Generating…' : done ? 'Added ✓' : 'Generate'}
        </button>
        <span className="muted gen-note">Uses ElevenLabs credits.</span>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default function SoundLibrary() {
  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setError(null);
    api
      .listUploads()
      .then(setUploads)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Only audio clips belong here — the upload dir also holds POI photos etc.
  const clips = useMemo(() => uploads.filter((u) => isAudio(u.filename)), [uploads]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clips.filter((u) => (u.description || u.filename).toLowerCase().includes(q)) : clips;
  }, [clips, query]);

  return (
    <section className="section sounds">
      <div className="sounds__head">
        <div className="section-title" style={{ margin: 0 }}>
          Sound library <span className="count-pill">{clips.length}</span>
        </div>
        {clips.length > 0 && (
          <input
            className="input sounds__search"
            placeholder="Search clips…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        )}
      </div>

      <GeneratePanel onGenerated={load} />

      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : clips.length === 0 ? (
        <p className="muted">No clips yet. Generate one above, or add audio from a point.</p>
      ) : shown.length === 0 ? (
        <p className="muted">No clips match “{query}”.</p>
      ) : (
        <div className="sound-grid">
          {shown.map((u) => (
            <SoundCard key={u.url} upload={u} />
          ))}
        </div>
      )}
    </section>
  );
}
