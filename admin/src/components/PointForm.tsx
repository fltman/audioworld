import type { ChangeEvent } from 'react';
import type { PathEndBehavior, PlaybackOptions } from '@audioworld/shared';
import type { DraftState } from '../draft';
import { POINT_TYPE_META, isPathType } from '../pointTypes';

interface Props {
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  onFinishPath: () => void;
  onUndoVertex: () => void;
  saving: boolean;
  uploading: boolean;
  error: string | null;
}

const PLAYBACK_LABEL: Record<keyof PlaybackOptions, string> = {
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
}: {
  label: string;
  value: number;
  onValue: (n: number) => void;
  step?: number;
}) {
  return (
    <label className="form-field">
      <span className="label">{label}</span>
      <input
        className="input"
        type="number"
        min={0}
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
  // Global (shared) timing only makes sense for the continuously-moving types.
  const canSync = draft.type === 'path' || draft.type === 'static_circling';

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
          <p className="geo-status ok">{draft.path.length} points · drag markers to adjust</p>
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
        {(Object.keys(PLAYBACK_LABEL) as (keyof PlaybackOptions)[]).map((k) => (
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

      <div className="number-grid">
        {draft.type === 'static' && (
          <NumberField label="Audible radius (m)" value={draft.radius} onValue={(n) => onChange({ radius: n })} />
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
      </div>

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
