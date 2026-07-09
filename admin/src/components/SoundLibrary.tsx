import { useEffect, useState } from 'react';
import type { UploadListItem } from '@audioworld/shared';
import { absoluteAudioUrl, api } from '../api';

function SoundRow({ upload }: { upload: UploadListItem }) {
  const [copied, setCopied] = useState(false);
  const [desc, setDesc] = useState(upload.description ?? '');
  const [saved, setSaved] = useState(upload.description ?? '');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <li className="sound-row">
      <div className="sound-row__head">
        <span className="sound-row__name" title={upload.filename}>
          {upload.filename}
        </span>
        <button type="button" className="icon-btn" onClick={() => void copy()}>
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
      </div>
      <input
        className="input"
        placeholder="Add a description…"
        value={desc}
        onChange={(e) => setDesc(e.currentTarget.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <span className="sound-row__meta">
        {Math.round(upload.size / 1024)} KB
        {saving ? ' · saving…' : flash ? ' · saved ✓' : ''}
      </span>
      {error && <span className="error">{error}</span>}
      <audio
        className="sound-row__audio"
        controls
        preload="none"
        src={absoluteAudioUrl(upload.url)}
      />
    </li>
  );
}

export default function SoundLibrary() {
  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listUploads()
      .then(setUploads)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="section">
      <div className="section-title">Sound library ({uploads.length})</div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : uploads.length === 0 ? (
        <p className="muted">No uploads yet. Add audio from a point to build the library.</p>
      ) : (
        <ul className="sound-list">
          {uploads.map((u) => (
            <SoundRow key={u.url} upload={u} />
          ))}
        </ul>
      )}
    </section>
  );
}
