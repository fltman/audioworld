import { useEffect, useRef, useState } from 'react';
import type { AudioPoint, AudioPointInput, Coordinates, UploadListItem } from '@audioworld/shared';
import { api } from '../api';

interface Props {
  courseId: string;
  onCreated: (point: AudioPoint) => void;
}

interface Fix extends Coordinates {
  accuracy: number;
}

const DEFAULT_RADIUS = 30; // m — audible radius for a dropped point
const WALK_SPEED = 1.3; // m/s — a relaxed walking pace for recorded paths
const BREADCRUMB_MIN_M = 5; // don't log a path vertex until you've moved this far

// Rough metres between two coords (equirectangular — fine at path scale).
function metresBetween(a: Coordinates, b: Coordinates): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

// Prefer mp4/aac (plays on iOS listeners too) over webm/opus when the device offers it.
function pickRecorderMime(): string | undefined {
  const R = window.MediaRecorder;
  if (!R || !R.isTypeSupported) return undefined;
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (R.isTypeSupported(m)) return m;
  }
  return undefined;
}

/**
 * Author a course with your feet: on a phone, drop a point at your live GPS position
 * (no guessing lat/lng at a desk), attach audio you record on the spot or pick from the
 * library, and walk a path to record its shape. Lives in the (already authenticated)
 * admin, so it reuses the point + upload APIs directly.
 */
export default function FieldCapture({ courseId, onCreated }: Props) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioLabel, setAudioLabel] = useState<string>('');

  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [walking, setWalking] = useState(false);
  const crumbsRef = useRef<Coordinates[]>([]);
  const [crumbCount, setCrumbCount] = useState(0);

  const refreshUploads = (): void => {
    void api.listUploads().then(setUploads).catch(() => setUploads([]));
  };
  useEffect(refreshUploads, []);

  // Live position (and feed the path recorder while walking).
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('This device has no geolocation');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const here: Fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setFix(here);
        setGeoError(null);
        if (walking) {
          const crumbs = crumbsRef.current;
          const last = crumbs[crumbs.length - 1];
          if (!last || metresBetween(last, here) >= BREADCRUMB_MIN_M) {
            crumbs.push({ lat: here.lat, lng: here.lng });
            setCrumbCount(crumbs.length);
          }
        }
      },
      (err) => setGeoError(err.message || 'Location unavailable'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [walking]);

  const toggleRecord = async (): Promise<void> => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = rec.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('webm') ? 'webm' : 'ogg';
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `field-${name.trim() || 'clip'}.${ext}`, { type });
        setBusy(true);
        api
          .uploadAudio(file)
          .then((res) => {
            setAudioUrl(res.url);
            setAudioLabel('recording on site');
            refreshUploads();
            setNote('Recording attached');
          })
          .catch(() => setNote('Could not upload the recording'))
          .finally(() => setBusy(false));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setNote(null);
    } catch {
      setNote('Microphone access denied');
    }
  };

  // Fields common to every captured point. Kept loosely typed so it can be spread into
  // either discriminated-union member below (the literal `type` in each does the narrowing).
  const common = () => {
    const pointName = name.trim() || 'Field point';
    return {
      courseId, // the create route ignores this in favour of the URL, but the type wants it
      name: pointName,
      audio: { kind: 'upload' as const, url: audioUrl, title: pointName },
      playback: { loop: true, stopAfter: false, reload: false },
      volume: 1,
      sync: 'individual' as const,
    };
  };

  const dropStatic = async (): Promise<void> => {
    if (!fix || !audioUrl || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const input: AudioPointInput = {
        type: 'static',
        ...common(),
        center: { lat: fix.lat, lng: fix.lng },
        radius: DEFAULT_RADIUS,
      };
      onCreated(await api.createPoint(courseId, input));
      setNote('Point dropped at your location');
      setName('');
    } catch {
      setNote('Could not create the point');
    } finally {
      setBusy(false);
    }
  };

  const toggleWalk = async (): Promise<void> => {
    if (!walking) {
      crumbsRef.current = fix ? [{ lat: fix.lat, lng: fix.lng }] : [];
      setCrumbCount(crumbsRef.current.length);
      setWalking(true);
      setNote('Walk the route — a point drops every few metres');
      return;
    }
    setWalking(false);
    const path = crumbsRef.current;
    if (path.length < 2 || !audioUrl) {
      setNote(audioUrl ? 'Walk a bit further before finishing' : 'Attach audio first');
      return;
    }
    setBusy(true);
    try {
      const input: AudioPointInput = {
        type: 'path',
        ...common(),
        path,
        radius: DEFAULT_RADIUS,
        speed: WALK_SPEED,
        endBehavior: 'loop',
      };
      onCreated(await api.createPoint(courseId, input));
      setNote(`Path recorded (${path.length} points)`);
      setName('');
      crumbsRef.current = [];
      setCrumbCount(0);
    } catch {
      setNote('Could not create the path');
    } finally {
      setBusy(false);
    }
  };

  const acc = fix?.accuracy ?? Infinity;
  const accClass = acc <= 10 ? 'good' : acc <= 30 ? 'ok' : 'poor';
  const hasAudio = audioUrl !== '';

  return (
    <section className="section field-capture">
      <div className="section-title">Field capture — author with your feet</div>

      <div className="fc-fix">
        {fix ? (
          <>
            <span className="fc-coords">
              {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
            </span>
            <span className={`fc-acc fc-acc--${accClass}`}>±{Math.round(acc)} m</span>
          </>
        ) : (
          <span className="fc-coords">{geoError ?? 'Locating…'}</span>
        )}
      </div>

      <input
        className="input"
        placeholder="Point name (optional)"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
      />

      <div className="fc-audio">
        <button
          type="button"
          className={`btn small ${recording ? 'btn-danger' : 'btn-ghost'}`}
          onClick={() => void toggleRecord()}
          disabled={busy && !recording}
        >
          {recording ? '⏹ Stop recording' : '⏺ Record here'}
        </button>
        <span className="fc-or">or</span>
        <select
          className="select"
          value={audioLabel === 'recording on site' ? '' : audioUrl}
          onChange={(e) => {
            setAudioUrl(e.currentTarget.value);
            const u = uploads.find((x) => x.url === e.currentTarget.value);
            setAudioLabel(u?.description || u?.filename || '');
          }}
        >
          <option value="">Pick a library clip…</option>
          {uploads.map((u) => (
            <option key={u.url} value={u.url}>
              {u.description || u.filename}
            </option>
          ))}
        </select>
      </div>
      {hasAudio && <div className="fc-audio-ok">♪ {audioLabel || 'clip attached'}</div>}

      <div className="row-actions">
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => void dropStatic()}
          disabled={!fix || !hasAudio || busy || walking}
          title={!hasAudio ? 'Record or pick audio first' : 'Create a point at your GPS position'}
        >
          ⬇ Drop point here
        </button>
        <button
          type="button"
          className={`btn ${walking ? 'btn-danger' : 'btn-ghost'}`}
          onClick={() => void toggleWalk()}
          disabled={(!fix || !hasAudio) && !walking}
        >
          {walking ? `⏹ Finish path (${crumbCount})` : '🚶 Walk a path'}
        </button>
      </div>

      {note && <div className="fc-note">{note}</div>}
    </section>
  );
}
