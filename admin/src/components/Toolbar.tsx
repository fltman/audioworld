import type { PointType } from '@audioworld/shared';
import { POINT_TYPE_META, POINT_TYPE_ORDER } from '../pointTypes';

interface Props {
  activeType: PointType | null;
  placing: boolean;
  disabled: boolean;
  onPick: (t: PointType) => void;
  onCancel: () => void;
}

export default function Toolbar({ activeType, placing, disabled, onPick, onCancel }: Props) {
  return (
    <section className="section">
      <div className="section-title">Place a point</div>
      <div className="type-grid">
        {POINT_TYPE_ORDER.map((t) => {
          const meta = POINT_TYPE_META[t];
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              className={`type-btn${activeType === t ? ' type-btn--active' : ''}`}
              onClick={() => onPick(t)}
            >
              <span className="dot" style={{ background: meta.color }} />
              {meta.label}
            </button>
          );
        })}
      </div>
      {placing && activeType && (
        <div className="placing-bar">
          <span className="placing-label">
            <span className="dot" style={{ background: POINT_TYPE_META[activeType].color }} />
            placing {POINT_TYPE_META[activeType].label}
          </span>
          <button type="button" className="btn btn-ghost small" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
