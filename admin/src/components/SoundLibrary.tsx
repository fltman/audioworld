import { useEffect, useState } from 'react';
import { absoluteAudioUrl, api } from '../api';

interface Upload {
  url: string;
  filename: string;
  size: number;
}

export default function SoundLibrary() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api
      .listUploads()
      .then(setUploads)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(absoluteAudioUrl(url));
      setCopied(url);
      window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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
            <li key={u.url} className="sound-row">
              <div className="sound-row__head">
                <span className="sound-row__name" title={u.filename}>
                  {u.filename}
                </span>
                <button type="button" className="icon-btn" onClick={() => void copy(u.url)}>
                  {copied === u.url ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
              <span className="sound-row__meta">{Math.round(u.size / 1024)} KB</span>
              <audio className="sound-row__audio" controls preload="none" src={absoluteAudioUrl(u.url)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
