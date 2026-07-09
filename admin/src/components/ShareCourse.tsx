import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * The client deep-link base. In production the client is served at `/` on the same
 * host as the admin (`/admin`), so the current origin is correct; `VITE_CLIENT_URL`
 * overrides it for local dev where the client runs on a different port.
 */
function clientBase(): string {
  const env = import.meta.env.VITE_CLIENT_URL as string | undefined;
  return (env || window.location.origin).replace(/\/$/, '');
}

const slugify = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';

interface Props {
  courseId: string;
  courseName: string;
  onClose: () => void;
}

/** A shareable deep-link + scannable QR code for one course. */
export default function ShareCourse({ courseId, courseName, onClose }: Props) {
  const link = `${clientBase()}/?course=${courseId}`;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setQr(null);
    setError(null);
    QRCode.toDataURL(link, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => live && setQr(url))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [link]);

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="share">
      <div className="field-row">
        <input
          className="input"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="btn btn-ghost small" onClick={() => void copy()}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {qr && (
        <div className="share__qr">
          <img src={qr} alt={`QR code for ${courseName}`} width={200} height={200} />
          <a className="btn btn-ghost small" href={qr} download={`audioworld-${slugify(courseName)}.png`}>
            Download QR
          </a>
        </div>
      )}
      <button type="button" className="btn btn-ghost small" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
