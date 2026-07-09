import type { AcousticZone, ReverbCharacter } from '@audioworld/shared';

const REVERBS: ReverbCharacter[] = ['outdoor', 'room', 'hall', 'cathedral', 'tunnel'];

interface Props {
  zones: AcousticZone[];
  drawing: boolean;
  draftLen: number;
  saving: boolean;
  onNew: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onUpdate: (i: number, patch: Partial<AcousticZone>) => void;
  onDelete: (i: number) => void;
  onSave: () => void;
}

/** Author acoustic zones: draw a polygon on the map, then pick reverb + ambient bed. */
export default function ZonePanel({
  zones,
  drawing,
  draftLen,
  saving,
  onNew,
  onFinish,
  onCancel,
  onUpdate,
  onDelete,
  onSave,
}: Props) {
  return (
    <section className="section">
      <div className="section-title">Acoustic zones ({zones.length})</div>

      {drawing ? (
        <div className="geo-status">
          <span>
            {draftLen} corner{draftLen === 1 ? '' : 's'} · click the map, then finish (need 3+)
          </span>
          <span className="row-actions">
            <button type="button" className="btn btn-accent small" onClick={onFinish} disabled={draftLen < 3}>
              Finish
            </button>
            <button type="button" className="btn btn-ghost small" onClick={onCancel}>
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost small" onClick={onNew}>
          + Draw a zone
        </button>
      )}

      {zones.map((z, i) => (
        <div key={z.id} className="zone-row">
          <div className="zone-row__head">
            <input
              className="input"
              value={z.name}
              onChange={(e) => onUpdate(i, { name: e.currentTarget.value })}
            />
            <select
              className="select"
              value={z.reverb}
              onChange={(e) => onUpdate(i, { reverb: e.currentTarget.value as ReverbCharacter })}
            >
              {REVERBS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <label className="zone-row__wet">
            reverb {Math.round(z.wet * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={z.wet}
              onChange={(e) => onUpdate(i, { wet: e.currentTarget.valueAsNumber })}
            />
          </label>
          <input
            className="input"
            placeholder="ambient loop URL (optional)"
            value={z.ambienceUrl ?? ''}
            onChange={(e) => onUpdate(i, { ambienceUrl: e.currentTarget.value || undefined })}
          />
          <button type="button" className="btn btn-danger small" onClick={() => onDelete(i)}>
            Delete zone
          </button>
        </div>
      ))}

      {zones.length > 0 && (
        <button type="button" className="btn btn-accent" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save zones'}
        </button>
      )}
    </section>
  );
}
