import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoutSet, User } from '@audioworld/shared';
import {
  absoluteAudioUrl,
  addWaypoint,
  createScout,
  deleteScout,
  deleteWaypoint,
  getScout,
  getScoutToken,
  listScouts,
  scoutLogin,
  scoutMe,
  setScoutToken,
  uploadVoiceNote,
} from '../api';
import { ScoutMap } from '../components/ScoutMap';
import { isSecureEnough, watchUserPosition } from '../services/geolocation';

interface ScoutProps {
  onExit: () => void;
}

interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}

// --- Dictation (Web Speech API, where supported — Chrome/Android) ---
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
const SpeechCtor = (
  window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  }
).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
const dictationSupported = !!SpeechCtor;

function pickRecorderMime(): string | undefined {
  const R = window.MediaRecorder;
  if (!R || !R.isTypeSupported) return undefined;
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (R.isTypeSupported(m)) return m;
  }
  return undefined;
}

/**
 * Field scouting on a phone: sign in, create a waypoint set, then walk and drop points
 * at your live GPS position with a typed/dictated note and/or a recorded voice note.
 * The sets show up as a read-only reference layer in the desktop admin while authoring.
 */
export function Scout({ onExit }: ScoutProps) {
  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Sets
  const [sets, setSets] = useState<ScoutSet[] | null>(null);
  const [active, setActive] = useState<ScoutSet | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Editor: live GPS
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Note draft (open after "Mark this spot")
  const [draft, setDraft] = useState<Fix | null>(null);
  const [noteText, setNoteText] = useState('');
  const [draftAudioUrl, setDraftAudioUrl] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loadSets = useCallback(async () => {
    try {
      setSets(await listScouts());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your sets');
    }
  }, []);

  // Resume a session if a token is stored.
  useEffect(() => {
    const token = getScoutToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    scoutMe()
      .then((u) => {
        setUser(u);
        void loadSets();
      })
      .catch(() => setScoutToken(null))
      .finally(() => setAuthChecked(true));
  }, [loadSets]);

  // Watch GPS only while a set is open.
  useEffect(() => {
    if (!active) return;
    const watch = watchUserPosition(
      (f) => {
        setFix({ lat: f.coords.lat, lng: f.coords.lng, accuracy: f.accuracy });
        setGeoError(null);
      },
      (err) => setGeoError(err.message || 'Location unavailable')
    );
    return () => watch.stop();
  }, [active]);

  const handleLogin = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await scoutLogin(email.trim(), password);
      setUser(res.user);
      await loadSets();
    } catch {
      setAuthError('Wrong email or password');
    } finally {
      setAuthBusy(false);
    }
  };

  const openSet = async (id: string) => {
    try {
      const set = await getScout(id);
      setActive(set);
      setSelectedId(null);
      setFix(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open set');
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const set = await createScout(name);
      setNewName('');
      await loadSets();
      await openSet(set.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create set');
    }
  };

  const markSpot = () => {
    if (!fix) return;
    setDraft({ ...fix });
    setNoteText('');
    setDraftAudioUrl(null);
  };

  const toggleDictation = () => {
    if (!SpeechCtor || dictating) return;
    const rec = new SpeechCtor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i]![0]!.transcript);
      const t = parts.join(' ').trim();
      setNoteText((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onend = () => setDictating(false);
    rec.onerror = () => setDictating(false);
    setDictating(true);
    rec.start();
  };

  const toggleRecord = async () => {
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
        const file = new File([new Blob(chunksRef.current, { type })], `voicenote.${ext}`, { type });
        setBusy(true);
        uploadVoiceNote(file)
          .then((r) => setDraftAudioUrl(r.url))
          .catch(() => setError('Could not upload the voice note'))
          .finally(() => setBusy(false));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError('Microphone access denied');
    }
  };

  const saveWaypoint = async () => {
    if (!active || !draft) return;
    setBusy(true);
    try {
      const updated = await addWaypoint(active.id, {
        lat: draft.lat,
        lng: draft.lng,
        accuracy: draft.accuracy,
        note: noteText.trim() || undefined,
        audioUrl: draftAudioUrl ?? undefined,
      });
      setActive(updated);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the waypoint');
    } finally {
      setBusy(false);
    }
  };

  const removeWaypoint = async (wpId: string) => {
    if (!active) return;
    try {
      setActive(await deleteWaypoint(active.id, wpId));
    } catch {
      /* ignore */
    }
  };

  const logout = () => {
    setScoutToken(null);
    setUser(null);
    setSets(null);
    setActive(null);
  };

  // --- Render ---

  if (!authChecked) {
    return <div className="screen screen--scout">{null}</div>;
  }

  // Login gate
  if (!user) {
    return (
      <div className="screen screen--scout scout-center">
        <button className="link-back" onClick={onExit}>
          &#8592; Back
        </button>
        <div className="scout-login">
          <h1 className="scout-title">Field scout</h1>
          <p className="gate-desc">
            Sign in to mark places and notes in the field. They become a reference layer in the
            admin for building courses.
          </p>
          {!isSecureEnough() && (
            <div className="notice notice--warn">Location + mic need HTTPS to work here.</div>
          )}
          <input
            className="scout-input"
            type="email"
            inputMode="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <input
            className="scout-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
          />
          {authError && <div className="notice notice--error">{authError}</div>}
          <button className="btn-primary" disabled={authBusy} onClick={() => void handleLogin()}>
            {authBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    );
  }

  // Set list
  if (!active) {
    return (
      <div className="screen screen--scout">
        <div className="scout-topbar">
          <button className="link-back" onClick={onExit}>
            &#8592; Exit
          </button>
          <span className="scout-topbar__title">Scout sets</span>
          <button className="icon-btn" onClick={logout}>
            Sign out
          </button>
        </div>

        <div className="scout-new">
          <input
            className="scout-input"
            placeholder="New set name (e.g. Slottsskogen)"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
          />
          <button className="btn-test" disabled={!newName.trim()} onClick={() => void handleCreate()}>
            + Create
          </button>
        </div>

        {error && <div className="notice notice--error">{error}</div>}

        <ul className="scout-set-list">
          {sets?.map((s) => (
            <li key={s.id}>
              <button className="scout-set-card" onClick={() => void openSet(s.id)}>
                <span className="scout-set-card__name">{s.name}</span>
                <span className="scout-set-card__meta">
                  {s.waypoints.length} waypoint{s.waypoints.length === 1 ? '' : 's'}
                </span>
              </button>
              <button
                className="icon-btn scout-set-del"
                title="Delete set"
                onClick={() => {
                  if (confirm(`Delete "${s.name}" and its waypoints?`)) {
                    void deleteScout(s.id).then(loadSets);
                  }
                }}
              >
                ✕
              </button>
            </li>
          ))}
          {sets && sets.length === 0 && (
            <li className="notice">No sets yet — create one above, then go for a walk.</li>
          )}
        </ul>
      </div>
    );
  }

  // Editor
  const acc = fix?.accuracy ?? Infinity;
  const accClass = acc <= 10 ? 'good' : acc <= 30 ? 'ok' : 'poor';
  const selected = active.waypoints.find((w) => w.id === selectedId) ?? null;

  return (
    <div className="screen screen--scout screen--scout-editor">
      <div className="scout-topbar">
        <button className="link-back" onClick={() => setActive(null)}>
          &#8592; Sets
        </button>
        <span className="scout-topbar__title">{active.name}</span>
        <span className={`fc-acc fc-acc--${accClass}`}>
          {fix ? `±${Math.round(acc)} m` : geoError ? 'no GPS' : '…'}
        </span>
      </div>

      <div className="scout-map-wrap">
        <ScoutMap
          center={fix ? { lat: fix.lat, lng: fix.lng } : null}
          accuracy={fix?.accuracy ?? null}
          waypoints={active.waypoints}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      {draft ? (
        <div className="scout-note-editor">
          <div className="scout-note-editor__head">
            <strong>New waypoint</strong>
            <span
              className={`fc-acc fc-acc--${draft.accuracy <= 10 ? 'good' : draft.accuracy <= 30 ? 'ok' : 'poor'}`}
            >
              ±{Math.round(draft.accuracy)} m
            </span>
          </div>
          <textarea
            className="scout-textarea"
            placeholder="Note about this spot…"
            value={noteText}
            autoFocus
            onChange={(e) => setNoteText(e.currentTarget.value)}
          />
          <div className="scout-note-editor__tools">
            {dictationSupported && (
              <button
                type="button"
                className={`btn-test ${dictating ? 'is-on' : ''}`}
                onClick={toggleDictation}
                disabled={dictating}
              >
                {dictating ? '🎤 Listening…' : '🎤 Dictate'}
              </button>
            )}
            <button
              type="button"
              className={`btn-test ${recording ? 'is-on' : ''}`}
              onClick={() => void toggleRecord()}
              disabled={busy && !recording}
            >
              {recording ? '⏹ Stop' : draftAudioUrl ? '🔴 Re-record' : '🔴 Voice note'}
            </button>
            {draftAudioUrl && <span className="scout-audio-ok">♪ attached</span>}
          </div>
          <div className="scout-note-editor__actions">
            <button className="btn-primary" disabled={busy} onClick={() => void saveWaypoint()}>
              {busy ? 'Saving…' : 'Save waypoint'}
            </button>
            <button className="linkish" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-primary scout-mark" disabled={!fix} onClick={markSpot}>
          {fix ? '＋ Mark this spot' : geoError ? 'Waiting for GPS…' : 'Locating…'}
        </button>
      )}

      {selected && !draft && (
        <div className="scout-selected">
          <div className="scout-selected__note">{selected.note || <em>No note</em>}</div>
          {selected.audioUrl && (
            <audio
              className="clip-preview"
              controls
              preload="none"
              src={absoluteAudioUrl(selected.audioUrl)}
            />
          )}
          <button className="linkish" onClick={() => void removeWaypoint(selected.id)}>
            Delete waypoint
          </button>
        </div>
      )}
    </div>
  );
}
