import { useEffect, useState } from 'react';
import type {
  AudioPoint,
  AudioPointInput,
  ElevenVoice,
  PoiInterpretation,
  ScoutWaypoint,
} from '@audioworld/shared';
import { ApiError, absoluteAudioUrl, api } from '../api';

interface Props {
  waypoints: ScoutWaypoint[];
  courseId: string | null;
  onPointsCreated: (points: AudioPoint[]) => void;
}

/** Nearest-neighbour ordering from the first waypoint (cheap; fine at city scale). */
function orderRoute(wps: ScoutWaypoint[]): ScoutWaypoint[] {
  if (wps.length < 3) return wps;
  const remaining = [...wps];
  const ordered = [remaining.shift()!];
  while (remaining.length) {
    const last = ordered[ordered.length - 1]!;
    let best = 0;
    let bestD = Infinity;
    remaining.forEach((w, i) => {
      const d = (w.lat - last.lat) ** 2 + (w.lng - last.lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    ordered.push(remaining.splice(best, 1)[0]!);
  }
  return ordered;
}

function pointFrom(
  courseId: string,
  wp: ScoutWaypoint,
  draft: PoiInterpretation,
  clipUrl: string
): AudioPointInput {
  return {
    courseId,
    name: draft.title || 'Point of interest',
    type: 'static',
    center: { lat: wp.lat, lng: wp.lng },
    radius: 30,
    audio: { kind: 'upload', url: clipUrl, title: draft.title },
    playback: { loop: false, stopAfter: false, reload: true },
    volume: 1,
    sync: 'individual',
  };
}

/**
 * Turn scouted POIs (note + photos) into narrated audio points. Per POI: AI writes a
 * narration draft you can edit, then a guide voice speaks it and it's placed at the
 * waypoint. Or convert several at once (individual points or a route).
 */
export default function ScoutConvertPanel({ waypoints, courseId, onPointsCreated }: Props) {
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PoiInterpretation>>({});
  const [interpreting, setInterpreting] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null); // wpId, or '__batch__'
  const [placed, setPlaced] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listVoices()
      .then((vs) => {
        setVoices(vs);
        if (vs[0]) setVoiceId(vs[0].id);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 503) setVoicesError('ElevenLabs is off');
        else setVoicesError(e instanceof Error ? e.message : 'Could not load voices');
      });
  }, []);

  const busy = interpreting !== null || placing !== null;
  const patchDraft = (id: string, patch: Partial<PoiInterpretation>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));

  const interpretOne = async (wp: ScoutWaypoint) => {
    setInterpreting(wp.id);
    setError(null);
    try {
      const result = await api.interpretPoi(wp.note, wp.photos ?? []);
      setDrafts((d) => ({ ...d, [wp.id]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Interpretation failed');
    } finally {
      setInterpreting(null);
    }
  };

  const placeOne = async (wp: ScoutWaypoint) => {
    const draft = drafts[wp.id];
    if (!draft || !courseId || !voiceId) return;
    setPlacing(wp.id);
    setError(null);
    try {
      const clip = await api.generateTts(draft.narration, voiceId, 'eleven_v3');
      const pt = await api.createPoint(courseId, pointFrom(courseId, wp, draft, clip.url));
      onPointsCreated([pt]);
      setPlaced((p) => new Set(p).add(wp.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the point');
    } finally {
      setPlacing(null);
    }
  };

  const runBatch = async (mode: 'individual' | 'route') => {
    if (!courseId || !voiceId) return;
    let chosen = selected
      .map((id) => waypoints.find((w) => w.id === id))
      .filter((w): w is ScoutWaypoint => !!w && !placed.has(w.id));
    if (chosen.length === 0) return;
    if (mode === 'route') chosen = orderRoute(chosen);
    setPlacing('__batch__');
    setError(null);
    const created: AudioPoint[] = [];
    const done = new Set<string>();
    try {
      for (const wp of chosen) {
        // Reuse an already-generated draft; otherwise interpret now — and persist it
        // immediately so a later TTS/place failure doesn't discard a paid interpretation
        // (a retry would re-spend OpenRouter credits on the same POI).
        let draft = drafts[wp.id];
        if (!draft) {
          draft = await api.interpretPoi(wp.note, wp.photos ?? []);
          const persisted = draft;
          setDrafts((d) => ({ ...d, [wp.id]: persisted }));
        }
        const clip = await api.generateTts(draft.narration, voiceId, 'eleven_v3');
        created.push(await api.createPoint(courseId, pointFrom(courseId, wp, draft, clip.url)));
        done.add(wp.id); // record success BEFORE the next iteration
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed');
    } finally {
      if (created.length) onPointsCreated(created);
      // Mark converted POIs placed (even on partial failure) so a retry skips them.
      setPlaced((p) => new Set([...p, ...done]));
      setSelected([]);
      setPlacing(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const selectable = waypoints.filter((w) => !placed.has(w.id));
  const canPlace = !!courseId && !!voiceId;

  return (
    <section className="section">
      <div className="section-title">POI → audio points (AI)</div>
      {!courseId && <p className="muted">Select a course above to place points into.</p>}
      <p className="muted">
        The AI reads each POI’s note + photos and drafts narration; a guide voice speaks it
        and it’s placed at the waypoint. Set <code>OPENROUTER_API_KEY</code> on the server to
        enable the AI.
      </p>

      <div className="form-field">
        <span className="label">Narration voice</span>
        {voices.length > 0 ? (
          <select className="select" value={voiceId} onChange={(e) => setVoiceId(e.currentTarget.value)}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.category ? ` · ${v.category}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <p className="muted">
            {voicesError === 'ElevenLabs is off'
              ? 'Set ELEVENLABS_API_KEY on the server to voice the narration.'
              : (voicesError ?? 'Loading voices…')}
          </p>
        )}
      </div>

      {selectable.length > 0 && (
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setSelected(selectable.map((w) => w.id))}
            disabled={busy}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn btn-ghost small"
            onClick={() => setSelected([])}
            disabled={busy || selected.length === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-accent small"
            onClick={() => void runBatch('individual')}
            disabled={busy || !canPlace || selected.length === 0}
          >
            {placing === '__batch__' ? 'Converting…' : `Convert ${selected.length} → points`}
          </button>
          <button
            type="button"
            className="btn btn-accent small"
            onClick={() => void runBatch('route')}
            disabled={busy || !canPlace || selected.length < 2}
          >
            As a route
          </button>
        </div>
      )}
      {selected.length > 0 && <span className="muted gen-note">Uses OpenRouter + ElevenLabs credits.</span>}

      {error && <div className="error">{error}</div>}

      <ul className="poi-list">
        {waypoints.map((wp, i) => {
          const draft = drafts[wp.id];
          const isPlaced = placed.has(wp.id);
          return (
            <li key={wp.id} className="poi-row">
              <div className="poi-row__head">
                {!isPlaced && (
                  <input
                    type="checkbox"
                    checked={selected.includes(wp.id)}
                    onChange={() => toggle(wp.id)}
                    disabled={busy}
                  />
                )}
                <span className="poi-row__note">
                  {wp.note || <em>#{i + 1} — no note</em>}
                </span>
                {isPlaced && <span className="poi-row__done">✓ placed</span>}
              </div>

              {wp.photos && wp.photos.length > 0 && (
                <div className="poi-thumbs">
                  {wp.photos.map((url, j) => (
                    <img key={url} src={absoluteAudioUrl(url)} alt={`Photo ${j + 1}`} />
                  ))}
                </div>
              )}

              {!isPlaced &&
                (draft ? (
                  <div className="poi-draft">
                    <input
                      className="input"
                      value={draft.title}
                      placeholder="Point name"
                      onChange={(e) => patchDraft(wp.id, { title: e.currentTarget.value })}
                    />
                    <textarea
                      className="textarea"
                      value={draft.narration}
                      placeholder="Narration…"
                      onChange={(e) => patchDraft(wp.id, { narration: e.currentTarget.value })}
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-accent small"
                        onClick={() => void placeOne(wp)}
                        disabled={busy || !canPlace || !draft.narration.trim()}
                      >
                        {placing === wp.id ? 'Placing…' : 'Generate & place'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost small"
                        onClick={() => void interpretOne(wp)}
                        disabled={busy}
                      >
                        {interpreting === wp.id ? 'Re-reading…' : 'Re-interpret'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => void interpretOne(wp)}
                    disabled={busy}
                  >
                    {interpreting === wp.id ? '✨ Reading…' : '✨ Interpret'}
                  </button>
                ))}
            </li>
          );
        })}
        {waypoints.length === 0 && <li className="muted">This set has no waypoints yet.</li>}
      </ul>
    </section>
  );
}
