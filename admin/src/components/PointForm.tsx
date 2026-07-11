import type { ChangeEvent } from 'react';
import type {
  FollowMode,
  LocalizedClip,
  PathEndBehavior,
  PathStop,
  PlaybackOptions,
} from '@audioworld/shared';
import { pathVertexTimes } from '@audioworld/shared';
import type { DraftState } from '../draft';
import { POINT_TYPE_META, isPathType } from '../pointTypes';
import { absoluteAudioUrl } from '../api';

/** Seconds -> m:ss. */
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Load only an audio clip's metadata and resolve its duration in seconds (null on failure). */
function measureAudioDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    const finish = (v: number | null) => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('error', onErr);
      resolve(v);
    };
    const onMeta = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
    const onErr = () => finish(null);
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

function NumberField({
  label,
  value,
  onValue,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onValue: (n: number) => void;
  step?: number;
  min?: number;
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
              {draft.path.length} point{draft.path.length === 1 ? '' : 's'} · click the map to add
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
        <span className="label">Audio</span>
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

        {audio.url.trim() && (
          <audio
            className="clip-preview"
            controls
            preload="none"
            src={absoluteAudioUrl(audio.url.trim())}
          />
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
            <NumberField label="Speed (m/s)" value={draft.speed} onValue={(n) => onChange({ speed: n })} step={0.5} />
            <NumberField label="Audible radius (m)" value={draft.radius} onValue={(n) => onChange({ radius: n })} />
          </>
        )}
        {draft.type === 'path' && (
          <>
            <NumberField label="Audible radius (m)" value={draft.radius} onValue={(n) => onChange({ radius: n })} />
            <NumberField label="Speed (m/s)" value={draft.speed} onValue={(n) => onChange({ speed: n })} step={0.5} />
          </>
        )}
        {draft.type === 'follow_user' && (
          <NumberField label="Trigger radius (m)" value={draft.initialRadius} onValue={(n) => onChange({ initialRadius: n })} />
        )}
        {draft.type === 'path_triggered' && (
          <>
            <NumberField label="Trigger radius (m)" value={draft.triggerRadius} onValue={(n) => onChange({ triggerRadius: n })} />
            <NumberField label="Speed (m/s)" value={draft.speed} onValue={(n) => onChange({ speed: n })} step={0.5} />
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

      {isPathType(draft.type) && draft.path.length >= 2 && (
        <div className="form-field">
          <span className="label">Stops · pause &amp; narrate (arrival time shown)</span>
          <div className="stops">
            {draft.path.map((_, i) => {
              const stop = draft.stops.find((s) => s.index === i);
              return (
                <div key={i} className="stop-row">
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
