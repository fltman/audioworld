import { useEffect, useState, type ChangeEvent } from 'react';
import type {
  Character,
  ElevenVoice,
  FollowMode,
  LocalizedClip,
  PathEndBehavior,
  PathStop,
  PlaybackOptions,
} from '@audioworld/shared';
import { pathVertexTimes } from '@audioworld/shared';
import type { DraftState } from '../draft';
import { POINT_TYPE_META, isPathType } from '../pointTypes';
import { ApiError, absoluteAudioUrl, api, wikipediaExtract } from '../api';
import PointNarrate from './PointNarrate';

/** Seconds -> m:ss. */
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Load only an audio clip's metadata and resolve its duration in seconds (null on failure).
 * Times out so a missing/slow file (a 404 fires neither `loadedmetadata` nor `error` in some
 * browsers) can never hang the caller.
 */
function measureAudioDuration(url: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    let timer = 0;
    const finish = (v: number | null) => {
      window.clearTimeout(timer);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('error', onErr);
      resolve(v);
    };
    const onMeta = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
    const onErr = () => finish(null);
    timer = window.setTimeout(() => finish(null), timeoutMs);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('error', onErr);
    audio.src = url;
  });
}

interface Props {
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  /** Upload a file and return its URL (for per-stop clips). */
  onUploadFile: (file: File) => Promise<string | null>;
  onFinishPath: () => void;
  onUndoVertex: () => void;
  onAddPoints: () => void;
  /** Reusable guides available to assign to a moving point. */
  characters: Character[];
  saving: boolean;
  uploading: boolean;
  error: string | null;
}

type BoolPlayback = 'loop' | 'stopAfter' | 'reload';
const PLAYBACK_LABEL: Record<BoolPlayback, string> = {
  loop: 'Loop while in range',
  stopAfter: 'Play once',
  reload: 'Restart on re-entry',
};

const readNum = (e: ChangeEvent<HTMLInputElement>): number => {
  const v = e.currentTarget.valueAsNumber;
  return Number.isFinite(v) ? v : 0;
};

/** Common travel paces as a m/s reference, since Speed is entered in m/s. */
const SPEED_HINT = 'Walk 5 km/h ≈ 1.4 · jog 9 km/h ≈ 2.5 · bike 15 km/h ≈ 4.2 (m/s)';

function NumberField({
  label,
  value,
  onValue,
  step = 1,
  min = 0,
  hint,
}: {
  label: string;
  value: number;
  onValue: (n: number) => void;
  step?: number;
  min?: number;
  hint?: string;
}) {
  return (
    <label className="form-field">
      <span className="label">{label}</span>
      <input
        className="input"
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onValue(readNum(e))}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export default function PointForm(props: Props) {
  const { draft, onChange, onSave, onCancel, onDelete, onUpload, saving, uploading, error } = props;
  const meta = POINT_TYPE_META[draft.type];
  const { audio, playback } = draft;
  // Global (shared) timing only makes sense for the continuously-moving types, and a
  // wait-for-listener path is inherently individual (each device has its own leash).
  const canSync =
    (draft.type === 'path' && !draft.waitForListener) || draft.type === 'static_circling';

  const [fetchingWiki, setFetchingWiki] = useState(false);
  // One shared voice list for every narration widget (the single point + each path stop), so
  // a path with many stops issues one voices request instead of one per stop.
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [ttsOff, setTtsOff] = useState(false);
  useEffect(() => {
    api
      .listVoices()
      .then(setVoices)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 503) setTtsOff(true);
      });
  }, []);

  // A "wikipedia: lang:Title" reference left in the facts (e.g. from Discover) → offer to
  // pull the real summary from Wikipedia.
  const wikiRef = /wikipedia:\s*([a-z-]{2,}:[^\n)]+)/i.exec(audio.description ?? '')?.[1]?.trim() ?? null;
  const fetchWiki = async () => {
    if (!wikiRef) return;
    setFetchingWiki(true);
    try {
      const extract = await wikipediaExtract(wikiRef);
      if (extract) {
        onChange({ audio: { ...audio, description: `${extract}\n\n(Wikipedia: ${wikiRef})` } });
      }
    } finally {
      setFetchingWiki(false);
    }
  };
  const vertexTimes = isPathType(draft.type)
    ? pathVertexTimes(draft.path, draft.speed, draft.stops)
    : [];

  const upsertStop = (index: number, patch: Partial<PathStop>) => {
    const exists = draft.stops.some((s) => s.index === index);
    const stops = exists
      ? draft.stops.map((s) => (s.index === index ? { ...s, ...patch } : s))
      : [...draft.stops, { index, dwellSec: 0, ...patch }];
    onChange({ stops });
  };

  // The current clip's player (only when there IS a clip).
  const clipPlayer = audio.url.trim() ? (
    <audio className="clip-preview" controls preload="none" src={absoluteAudioUrl(audio.url.trim())} />
  ) : null;

  // The manual audio-source picker (URL / upload). Primary for path travelling audio,
  // secondary (collapsed) for non-path points that are usually voiced via Narrate.
  const manualSource = (
    <>
      <div className="seg">
        <button
          type="button"
          className={audio.kind === 'url' ? 'active' : ''}
          onClick={() => onChange({ audio: { ...audio, kind: 'url' } })}
        >
          URL
        </button>
        <button
          type="button"
          className={audio.kind === 'upload' ? 'active' : ''}
          onClick={() => onChange({ audio: { ...audio, kind: 'upload' } })}
        >
          Upload
        </button>
      </div>
      {audio.kind === 'url' ? (
        <input
          className="input"
          placeholder="https://…/sound.mp3"
          value={audio.url}
          onChange={(e) => onChange({ audio: { ...audio, url: e.currentTarget.value } })}
        />
      ) : (
        <div className="upload">
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) onUpload(f);
            }}
          />
          {uploading && <span className="muted">Uploading…</span>}
          {!uploading && audio.url && <span className="muted">{audio.title ?? audio.url}</span>}
        </div>
      )}
    </>
  );

  return (
    <section className="section form">
      <div className="section-title">
        <span className="dot" style={{ background: meta.color }} />
        {draft.editingId ? 'Edit' : 'New'} {meta.label}
      </div>

      {isPathType(draft.type) ? (
        draft.drawingPath ? (
          <div className="geo-status">
            <span>
              {draft.path.length} point{draft.path.length === 1 ? '' : 's'} · click the map, or a
              point to fold it in
            </span>
            <span className="row-actions">
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={props.onUndoVertex}
                disabled={draft.path.length === 0}
              >
                Undo
              </button>
              <button
                type="button"
                className="btn btn-accent small"
                onClick={props.onFinishPath}
                disabled={draft.path.length < 2}
              >
                Finish path
              </button>
            </span>
          </div>
        ) : (
          <div className="geo-status ok">
            <span>{draft.path.length} points · drag to adjust</span>
            <button type="button" className="btn btn-ghost small" onClick={props.onAddPoints}>
              + Add points
            </button>
          </div>
        )
      ) : draft.center ? (
        <p className="geo-status ok">Placed · drag the marker to adjust</p>
      ) : (
        <p className="geo-status">{meta.hint}</p>
      )}

      <label className="form-field">
        <span className="label">Name</span>
        <input
          className="input"
          value={draft.name}
          placeholder="Name"
          onChange={(e) => onChange({ name: e.currentTarget.value })}
        />
      </label>

      <div className="form-field">
        {/* Path types carry a "travelling" clip set manually. Non-path points lead with
            facts + AI narration below; their manual source is tucked away at the end. */}
        {isPathType(draft.type) && (
          <>
            <span className="label">Travelling audio</span>
            {manualSource}
            {clipPlayer}
          </>
        )}

        {/* The facts the narration draws on (a discovered place stores its OSM facts here).
            Editable + visible so you can refine what the AI/voice works from. */}
        {!isPathType(draft.type) && (
          <div className="form-field">
            <div className="label-row">
              <span className="label">Facts / notes — what this point is about</span>
              {wikiRef && (
                <button
                  type="button"
                  className="btn btn-ghost small"
                  onClick={() => void fetchWiki()}
                  disabled={fetchingWiki}
                  title={`Fetch the summary for ${wikiRef} from Wikipedia`}
                >
                  {fetchingWiki ? '↓ Fetching…' : '↓ Wikipedia'}
                </button>
              )}
            </div>
            <textarea
              className="textarea"
              placeholder="Facts the narration draws on — e.g. “12th-century castle, seat of the county governor…”"
              value={audio.description ?? ''}
              onChange={(e) =>
                onChange({ audio: { ...audio, description: e.currentTarget.value || undefined } })
              }
            />
          </div>
        )}

        {/* Voice a single-audio point later (e.g. a discovered place), optionally with a
            persona. Path types voice per stop / via an assigned guide instead. */}
        {!isPathType(draft.type) && (
          <PointNarrate
            key={draft.editingId ?? 'new'}
            characters={props.characters}
            audio={audio}
            voices={voices}
            ttsOff={ttsOff}
            initialText={audio.description || draft.name}
            title={draft.name}
            onGenerated={(a) => onChange({ audio: a })}
          />
        )}

        {/* The resulting clip, then the manual source as a tucked-away fallback. */}
        {!isPathType(draft.type) && clipPlayer && (
          <div className="form-field">
            <span className="label">Audio clip</span>
            {clipPlayer}
          </div>
        )}
        {!isPathType(draft.type) && (
          <details className="lang-variants">
            <summary>Set the audio manually</summary>
            {manualSource}
          </details>
        )}

        {(() => {
          const variants: LocalizedClip[] = audio.variants ?? [];
          const setVariants = (vs: LocalizedClip[]) =>
            onChange({ audio: { ...audio, variants: vs.length ? vs : undefined } });
          const patchVariant = (i: number, patch: Partial<LocalizedClip>) =>
            setVariants(variants.map((v, j) => (j === i ? { ...v, ...patch } : v)));
          return (
            <details className="lang-variants">
              <summary>
                Narration languages{variants.length > 0 ? ` (${variants.length})` : ''}
              </summary>
              <p className="hint">
                Alternate recordings; each listener hears the one matching their device
                language, falling back to the clip above.
              </p>
              {variants.map((v, i) => (
                <div key={i} className="lang-row">
                  <input
                    className="input lang-code"
                    placeholder="en"
                    value={v.lang}
                    onChange={(e) => patchVariant(i, { lang: e.currentTarget.value })}
                  />
                  <input
                    className="input"
                    placeholder="https://… or upload →"
                    value={v.url}
                    onChange={(e) => patchVariant(i, { url: e.currentTarget.value, kind: 'url' })}
                  />
                  <label className="btn btn-ghost small lang-upload">
                    ⭱
                    <input
                      type="file"
                      accept="audio/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const f = e.currentTarget.files?.[0];
                        if (!f) return;
                        const url = await props.onUploadFile(f);
                        if (url) patchVariant(i, { url, kind: 'upload', title: f.name });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-danger small"
                    onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => setVariants([...variants, { lang: '', kind: 'url', url: '' }])}
              >
                + Add language
              </button>
            </details>
          );
        })()}
      </div>

      <div className="form-field">
        <span className="label">Volume {Math.round(draft.volume * 100)}%</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={draft.volume}
          onChange={(e) => onChange({ volume: e.currentTarget.valueAsNumber })}
        />
      </div>

      <div className="checks">
        {(Object.keys(PLAYBACK_LABEL) as BoolPlayback[]).map((k) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={playback[k]}
              onChange={(e) =>
                onChange({ playback: { ...playback, [k]: e.currentTarget.checked } })
              }
            />
            {PLAYBACK_LABEL[k]}
          </label>
        ))}
      </div>

      {playback.loop && (
        <NumberField
          label="Pause before looping (s)"
          value={draft.loopGapSec}
          onValue={(n) => onChange({ loopGapSec: n })}
          step={0.5}
        />
      )}

      <div className="number-grid">
        {draft.type === 'static' && (
          <>
            <NumberField label="Audible radius (m)" value={draft.radius} onValue={(n) => onChange({ radius: n })} />
            <NumberField
              label="Jumpscare trigger radius (m) — 0 = off"
              value={draft.triggerRadius}
              onValue={(n) => onChange({ triggerRadius: n })}
            />
            <NumberField
              label="Reveal after standing still (s) — 0 = off"
              value={draft.stillSec}
              onValue={(n) => onChange({ stillSec: n })}
            />
          </>
        )}
        {draft.type === 'static_circling' && (
          <>
            <NumberField label="Orbit radius (m)" value={draft.circleRadius} onValue={(n) => onChange({ circleRadius: n })} />
            <NumberField label="Speed (m/s)" value={draft.speed} onValue={(n) => onChange({ speed: n })} step={0.5} hint={SPEED_HINT} />
            <NumberField label="Audible radius (m)" value={draft.radius} onValue={(n) => onChange({ radius: n })} />
          </>
        )}
        {draft.type === 'path' && (
          <>
            <NumberField label="Audible radius (m)" value={draft.radius} onValue={(n) => onChange({ radius: n })} />
            <NumberField label="Speed (m/s)" value={draft.speed} onValue={(n) => onChange({ speed: n })} step={0.5} hint={SPEED_HINT} />
          </>
        )}
        {draft.type === 'follow_user' && (
          <NumberField label="Trigger radius (m)" value={draft.initialRadius} onValue={(n) => onChange({ initialRadius: n })} />
        )}
        {draft.type === 'path_triggered' && (
          <>
            <NumberField label="Trigger radius (m)" value={draft.triggerRadius} onValue={(n) => onChange({ triggerRadius: n })} />
            <NumberField label="Speed (m/s)" value={draft.speed} onValue={(n) => onChange({ speed: n })} step={0.5} hint={SPEED_HINT} />
          </>
        )}
        {(draft.type === 'path' || draft.type === 'path_triggered') && (
          <label className="form-field">
            <span className="label">End behavior</span>
            <select
              className="select"
              value={draft.endBehavior}
              onChange={(e) => onChange({ endBehavior: e.currentTarget.value as PathEndBehavior })}
            >
              <option value="loop">Loop</option>
              <option value="reverse">Reverse</option>
              <option value="stop">Stop</option>
            </select>
          </label>
        )}
        <NumberField
          label="Height (m · + up / − down)"
          value={draft.height}
          onValue={(n) => onChange({ height: n })}
          min={-1000}
        />
      </div>

      {(draft.type === 'static' ||
        draft.type === 'path' ||
        draft.type === 'path_triggered') && (
        <div className="form-field">
          <label className="check">
            <input
              type="checkbox"
              checked={draft.directional}
              onChange={(e) => onChange({ directional: e.currentTarget.checked })}
            />
            Directional — radiates one way (not heard behind it)
          </label>
          {draft.directional && (
            <>
              <div className="number-grid">
                <NumberField
                  label="Facing (° from N)"
                  value={draft.facing}
                  onValue={(n) => onChange({ facing: ((n % 360) + 360) % 360 })}
                  min={0}
                />
                <NumberField
                  label="Spread (° wide)"
                  value={draft.spread}
                  onValue={(n) => onChange({ spread: Math.max(10, Math.min(350, n)) })}
                  min={10}
                />
              </div>
              <p className="geo-status">
                A wedge facing that compass bearing; listeners outside it don't hear the sound. So a
                source against a building faces the street — heard there, not behind it.
              </p>
            </>
          )}
        </div>
      )}

      {draft.type === 'static' && (
        <p className="geo-status">
          0 disables the jumpscare. Above 0, the point stays silent until you come within it, then
          plays inside the audible radius — pair with "Play once". "Reveal after standing still"
          keeps it silent until the listener holds still that long inside range.
        </p>
      )}

      {draft.type === 'static' && (
        <label className="check">
          <input
            type="checkbox"
            checked={draft.fleeOnMove}
            onChange={(e) => onChange({ fleeOnMove: e.currentTarget.checked })}
          />
          Flees on movement (audible only while the listener is still)
        </label>
      )}

      {isPathType(draft.type) &&
        (() => {
          const guide = props.characters.find((x) => x.id === draft.characterId);
          // A characterId that resolves to nothing (guide deleted since assignment).
          const orphaned = draft.characterId !== '' && !guide;
          return (
            <div className="form-field">
              <span className="label">Guide for the whole path</span>
              <select
                className="select"
                value={draft.characterId}
                onChange={(e) => {
                  const id = e.currentTarget.value;
                  const c = props.characters.find((x) => x.id === id);
                  // Adopt the guide's idle sound as this point's travelling audio (what
                  // plays between narration stops), keeping any language variants /
                  // metadata already set on the clip. Its voice is the default persona
                  // that narrates every stop.
                  if (c?.idleSoundUrl) {
                    onChange({
                      characterId: id,
                      audio: { ...audio, kind: 'upload', url: c.idleSoundUrl, title: `${c.name} (idle)` },
                    });
                  } else {
                    onChange({ characterId: id });
                  }
                }}
              >
                <option value="">— None —</option>
                {/* Keep the dangling id selectable so it renders honestly and can be cleared. */}
                {orphaned && <option value={draft.characterId}>— (removed guide) —</option>}
                {props.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.voiceName ? ` · ${c.voiceName}` : ''}
                  </option>
                ))}
              </select>
              {guide && (
                <p className="geo-status ok">
                  Default persona for every stop (override per stop below), voiced by{' '}
                  {guide.voiceName ?? 'its voice'}. Travelling audio:{' '}
                  {audio.url ? audio.title ?? audio.url : 'none set'}.
                  {!guide.idleSoundUrl &&
                    ' This guide has no idle sound — set the travelling audio above.'}
                </p>
              )}
              {orphaned && (
                <p className="geo-status">
                  This point references a guide that no longer exists — pick another or “— None —”.
                </p>
              )}
            </div>
          );
        })()}

      {isPathType(draft.type) && draft.path.length >= 2 && (
        <div className="form-field">
          <span className="label">Stops · pause &amp; narrate (arrival time shown)</span>
          <div className="stops">
            {draft.path.map((_, i) => {
              const stop = draft.stops.find((s) => s.index === i);
              return (
                <div key={i} className="stop-entry">
                <div className="stop-row">
                  <span className="stop-row__t">
                    #{i + 1}
                    <em>{fmtTime(vertexTimes[i] ?? 0)}</em>
                  </span>
                  <input
                    className="input stop-row__dwell"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0s"
                    value={stop?.dwellSec ?? ''}
                    onChange={(e) =>
                      upsertStop(i, {
                        dwellSec: Number.isFinite(e.currentTarget.valueAsNumber)
                          ? e.currentTarget.valueAsNumber
                          : 0,
                      })
                    }
                  />
                  <input
                    className="input stop-row__url"
                    type="text"
                    placeholder="clip URL"
                    value={stop?.audio?.url ?? ''}
                    onChange={(e) =>
                      upsertStop(i, {
                        audio: e.currentTarget.value
                          ? { kind: 'url', url: e.currentTarget.value }
                          : undefined,
                      })
                    }
                    onBlur={async (e) => {
                      const raw = e.currentTarget.value.trim();
                      // Auto-fill the dwell from the clip length only when it hasn't
                      // been set yet, so a re-blur never clobbers a manual value.
                      if (!raw || (stop?.dwellSec ?? 0) > 0) return;
                      const dur = await measureAudioDuration(absoluteAudioUrl(raw));
                      if (dur) upsertStop(i, { dwellSec: Math.ceil(dur) });
                    }}
                  />
                  <label className="stop-row__up" title="Upload clip">
                    &#8593;
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.currentTarget.files?.[0];
                        if (!f) return;
                        // Measure the clip locally while it uploads, then set the dwell
                        // to its length so the guide pauses long enough to finish it.
                        const obj = URL.createObjectURL(f);
                        const [url, dur] = await Promise.all([
                          props.onUploadFile(f),
                          measureAudioDuration(obj),
                        ]);
                        URL.revokeObjectURL(obj);
                        if (url) {
                          upsertStop(i, {
                            audio: { kind: 'upload', url, title: f.name },
                            ...(dur ? { dwellSec: Math.ceil(dur) } : {}),
                          });
                        }
                      }}
                    />
                  </label>
                </div>
                {/* Same knowledge-base → write-in-persona → render flow as a single point,
                    but per stop. The persona defaults to the path's guide and can be
                    overridden here for just this stop. */}
                <PointNarrate
                  key={`${draft.editingId ?? 'new'}-stop${i}-${stop?.characterId || draft.characterId || 'none'}`}
                  characters={props.characters}
                  audio={stop?.audio ?? { kind: 'url', url: '' }}
                  voices={voices}
                  ttsOff={ttsOff}
                  facts={stop?.facts ?? ''}
                  onFactsChange={(v) => upsertStop(i, { facts: v || undefined })}
                  defaultCharacterId={stop?.characterId || draft.characterId || undefined}
                  onCharacterChange={(id) => upsertStop(i, { characterId: id || undefined })}
                  initialText={stop?.facts ?? ''}
                  title={`${draft.name} — stop ${i + 1}`}
                  summaryLabel={`✨ Narrate stop ${i + 1}${stop?.audio?.url ? '' : ' — not voiced yet'}`}
                  onGenerated={async (a) => {
                    const dur = await measureAudioDuration(absoluteAudioUrl(a.url));
                    upsertStop(i, {
                      audio: { ...a, title: a.title ?? `${draft.name} — stop ${i + 1}` },
                      ...(dur ? { dwellSec: Math.ceil(dur) } : {}),
                    });
                  }}
                />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {draft.type === 'follow_user' && (
        <div className="form-field">
          <span className="label">Follow behavior</span>
          <select
            className="select"
            value={draft.mode}
            onChange={(e) => onChange({ mode: e.currentTarget.value as FollowMode })}
          >
            <option value="attach">Attach — rides on top of you</option>
            <option value="chase">Chase — pursues; you can outrun it</option>
            <option value="orbit">Orbit — circles around you</option>
            <option value="sideToSide">Side to side — sweeps left ↔ right</option>
          </select>
          {draft.mode === 'chase' && (
            <div className="number-grid">
              <NumberField
                label="Max speed (m/s)"
                value={draft.maxSpeed}
                onValue={(n) => onChange({ maxSpeed: n })}
                step={0.5}
                hint={SPEED_HINT}
              />
              <NumberField
                label="Give-up distance (m)"
                value={draft.disengageDistance}
                onValue={(n) => onChange({ disengageDistance: n })}
              />
            </div>
          )}
          {(draft.mode === 'orbit' || draft.mode === 'sideToSide') && (
            <div className="number-grid">
              <NumberField
                label="Follow radius (m)"
                value={draft.followRadius}
                onValue={(n) => onChange({ followRadius: n })}
                step={0.5}
              />
              <NumberField
                label={draft.mode === 'orbit' ? 'Orbit speed (m/s)' : 'Sweep speed (m/s)'}
                value={draft.followSpeed}
                onValue={(n) => onChange({ followSpeed: n })}
                step={0.5}
                hint={SPEED_HINT}
              />
            </div>
          )}
        </div>
      )}


      {isPathType(draft.type) && (
        <div className="checks">
          <label className="check">
            <input
              type="checkbox"
              checked={draft.showWayfinding}
              onChange={(e) => onChange({ showWayfinding: e.currentTarget.checked })}
            />
            Show direction &amp; distance to this sound
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.waitForListener}
              onChange={(e) =>
                onChange(
                  e.currentTarget.checked
                    ? { waitForListener: true, sync: 'individual', startAt: undefined }
                    : { waitForListener: false }
                )
              }
            />
            Wait for the listener (pause when out of leash range)
          </label>
        </div>
      )}

      {isPathType(draft.type) && draft.waitForListener && (
        <NumberField
          label="Leash / resume radius (m)"
          value={draft.waitRadius}
          onValue={(n) => onChange({ waitRadius: n })}
        />
      )}

      <label className="form-field">
        <span className="label">Sets flags when visited</span>
        <input
          className="input"
          placeholder="OLD-LADY, KEY (comma-separated)"
          value={draft.setsFlags}
          onChange={(e) => onChange({ setsFlags: e.currentTarget.value })}
        />
      </label>
      <label className="form-field">
        <span className="label">Requires flags to activate</span>
        <input
          className="input"
          placeholder="OLD-LADY (silent until set)"
          value={draft.requiresFlags}
          onChange={(e) => onChange({ requiresFlags: e.currentTarget.value })}
        />
      </label>
      <label className="form-field">
        <span className="label">Exclusive group (crossroads)</span>
        <input
          className="input"
          placeholder="fork-1 — the first sibling reached locks the others"
          value={draft.flagGroup}
          onChange={(e) => onChange({ flagGroup: e.currentTarget.value })}
        />
      </label>

      {canSync && (
        <div className="form-field">
          <span className="label">Timing</span>
          <div className="seg">
            <button
              type="button"
              className={draft.sync === 'individual' ? 'active' : ''}
              onClick={() => onChange({ sync: 'individual', startAt: undefined })}
            >
              Individual
            </button>
            <button
              type="button"
              className={draft.sync === 'global' ? 'active' : ''}
              onClick={() => onChange({ sync: 'global' })}
            >
              Global
            </button>
          </div>
          {draft.sync === 'global' && (
            <>
              <p className="geo-status ok">
                Shared timeline — same position &amp; the same moment in the loop for every listener.
              </p>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => onChange({ startAt: Date.now() })}
              >
                Sync start to now
              </button>
            </>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button type="button" className="btn btn-accent" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        {draft.editingId && (
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </section>
  );
}
