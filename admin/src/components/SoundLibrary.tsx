import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ElevenVoice, UploadListItem } from '@audioworld/shared';
import { ApiError, absoluteAudioUrl, api } from '../api';

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i;
const isAudio = (filename: string): boolean => AUDIO_EXT.test(filename);

type Kind = 'sfx' | 'voice' | 'other';

/** Effective kind: the stored classification, else inferred from a generate prefix. */
function effectiveKind(u: UploadListItem): Kind {
  if (u.kind === 'sfx' || u.kind === 'voice') return u.kind;
  const d = (u.description ?? '').trim().toLowerCase();
  if (d.startsWith('sfx:')) return 'sfx';
  if (d.startsWith('tts:')) return 'voice';
  return 'other';
}
const KIND_BADGE: Record<Kind, { label: string; cls: string }> = {
  sfx: { label: 'SFX', cls: 'kind--sfx' },
  voice: { label: 'Voice', cls: 'kind--voice' },
  other: { label: 'Clip', cls: 'kind--clip' },
};

const clipName = (u: UploadListItem): string => u.description || u.filename;

function SoundCard({
  upload,
  others,
  onChanged,
}: {
  upload: UploadListItem;
  others: UploadListItem[];
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [desc, setDesc] = useState(upload.description ?? '');
  const [saved, setSaved] = useState(upload.description ?? '');
  const [saving, setSaving] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [replaceWith, setReplaceWith] = useState('');
  const [busy, setBusy] = useState(false);
  const badge = KIND_BADGE[effectiveKind(upload)];
  const usedBy = upload.usedBy ?? 0;

  // Let Gemini listen to the clip and name it, then persist that as the description.
  const enhance = async () => {
    setEnhancing(true);
    setError(null);
    try {
      const { description } = await api.enhanceClip(upload.url);
      setDesc(description);
      setSaved(description);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1400);
      onChanged(); // refresh so the kind badge updates from the AI's classification
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? 'AI naming is off — set OPENROUTER_API_KEY on the server.'
          : e instanceof Error
            ? e.message
            : 'Naming failed'
      );
    } finally {
      setEnhancing(false);
    }
  };

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

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      if (replaceMode && replaceWith) {
        await api.replaceClip(upload.filename, replaceWith, true);
      } else {
        await api.deleteClip(upload.filename);
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <article className="sound-card">
      <div className="sound-card__top">
        <span className={`kind ${badge.cls}`}>{badge.label}</span>
        <span className="row-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => void enhance()}
            disabled={enhancing}
            title="Let the AI listen and name this clip"
          >
            {enhancing ? '✨ Naming…' : '✨ Name'}
          </button>
          <button type="button" className="icon-btn" onClick={() => void copy()}>
            {copied ? 'Copied ✓' : '⧉ URL'}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            onClick={() => setConfirming(true)}
            title="Delete this clip"
          >
            🗑
          </button>
        </span>
      </div>
      <textarea
        className="sound-card__name"
        placeholder="Untitled clip — add a name…"
        value={desc}
        rows={1}
        title={upload.filename}
        onChange={(e) => setDesc(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          // Enter saves; Shift+Enter adds a line.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <audio className="sound-card__audio" controls preload="none" src={absoluteAudioUrl(upload.url)} />
      <div className="sound-card__meta">
        <span>{Math.round(upload.size / 1024)} KB</span>
        <span className={usedBy > 0 ? 'used-pill' : 'muted'}>
          {usedBy > 0 ? `In ${usedBy} point${usedBy === 1 ? '' : 's'}` : 'Unused'}
        </span>
        <span className="muted">{saving ? 'saving…' : flash ? 'saved ✓' : ''}</span>
      </div>

      {confirming && (
        <div className="sound-card__confirm">
          <p className="muted">
            {usedBy > 0
              ? `Used in ${usedBy} point${usedBy === 1 ? '' : 's'}. Deleting leaves ${usedBy === 1 ? 'it' : 'them'} silent.`
              : 'Delete this clip permanently?'}
          </p>
          {usedBy > 0 && others.length > 0 && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.currentTarget.checked)}
                />
                Replace it in those points with another clip
              </label>
              {replaceMode && (
                <select
                  className="select"
                  value={replaceWith}
                  onChange={(e) => setReplaceWith(e.currentTarget.value)}
                >
                  <option value="">— pick a replacement —</option>
                  {others.map((o) => (
                    <option key={o.filename} value={o.filename}>
                      {clipName(o)}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-danger small"
              onClick={() => void doDelete()}
              disabled={busy || (replaceMode && !replaceWith)}
            >
              {busy ? 'Working…' : replaceMode ? 'Replace & delete' : 'Delete'}
            </button>
            <button type="button" className="btn btn-ghost small" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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

const FILTERS: { key: 'all' | Kind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sfx', label: '🔊 SFX' },
  { key: 'voice', label: '🎙 Voice' },
];

export default function SoundLibrary() {
  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Kind>('all');

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
  const counts = useMemo(() => {
    const c = { sfx: 0, voice: 0 };
    for (const u of clips) {
      const k = effectiveKind(u);
      if (k === 'sfx') c.sfx++;
      else if (k === 'voice') c.voice++;
    }
    return c;
  }, [clips]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clips.filter(
      (u) =>
        (filter === 'all' || effectiveKind(u) === filter) &&
        (!q || (u.description || u.filename).toLowerCase().includes(q))
    );
  }, [clips, query, filter]);

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

      {clips.length > 0 && (
        <div className="seg sounds__filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? 'active' : ''}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.key === 'sfx' ? ` (${counts.sfx})` : f.key === 'voice' ? ` (${counts.voice})` : ''}
            </button>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : clips.length === 0 ? (
        <p className="muted">No clips yet. Generate one above, or add audio from a point.</p>
      ) : shown.length === 0 ? (
        <p className="muted">
          {query ? `No clips match “${query}”.` : 'No clips in this category yet.'}
        </p>
      ) : (
        <div className="sound-grid">
          {shown.map((u) => (
            <SoundCard
              key={u.url}
              upload={u}
              others={clips.filter((c) => c.filename !== u.filename)}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </section>
  );
}
