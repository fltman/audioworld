import { useState } from 'react';
import type { AudioPoint } from '@audioworld/shared';
import { POINT_TYPE_META } from '../pointTypes';

interface Props {
  points: AudioPoint[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function PointList({ points, onEdit, onDelete }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <section className="section">
      <div className="section-title">Points ({points.length})</div>
      {points.length === 0 ? (
        <p className="muted">Pick a type above and click the map to add one.</p>
      ) : (
        <ul className="point-list">
          {points.map((p) => {
            const meta = POINT_TYPE_META[p.type];
            return (
              <li key={p.id} className="point-row">
                <span className="badge" style={{ background: meta.color }} title={meta.label}>
                  {meta.short}
                </span>
                <span className="point-name">
                  {p.name || <em className="muted">unnamed</em>}
                </span>
                {confirmId === p.id ? (
                  <span className="row-actions">
                    <button
                      type="button"
                      className="btn btn-danger small"
                      onClick={() => {
                        onDelete(p.id);
                        setConfirmId(null);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost small"
                      onClick={() => setConfirmId(null)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <span className="row-actions">
                    <button type="button" className="icon-btn" onClick={() => onEdit(p.id)}>
                      Edit
                    </button>
                    <button type="button" className="icon-btn" onClick={() => setConfirmId(p.id)}>
                      Delete
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
