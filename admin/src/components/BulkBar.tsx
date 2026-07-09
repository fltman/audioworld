import { useState } from 'react';
import type { SyncMode } from '@audioworld/shared';

interface Props {
  count: number;
  total: number;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onClone: () => void;
  onDelete: () => void;
  onBulkVolume: (v: number) => void;
  onBulkSync: (mode: SyncMode) => void;
}

/**
 * Acts on a multi-point selection: clone, delete, or push one property onto all of
 * them at once — so tuning a big course doesn't mean editing points one by one.
 */
export default function BulkBar({
  count,
  total,
  busy,
  onSelectAll,
  onClear,
  onClone,
  onDelete,
  onBulkVolume,
  onBulkSync,
}: Props) {
  const [volume, setVolume] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const none = count === 0;

  return (
    <section className="section bulk-bar">
      <div className="bulk-head">
        <span className="bulk-count">{count} selected</span>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost small" onClick={onSelectAll} disabled={busy}>
            Select all ({total})
          </button>
          <button type="button" className="btn btn-ghost small" onClick={onClear} disabled={busy || none}>
            Clear
          </button>
        </div>
      </div>

      <p className="hint">Click points on the map to select them.</p>

      <div className="row-actions">
        <button type="button" className="btn btn-accent small" onClick={onClone} disabled={busy || none}>
          Clone {count > 0 ? count : ''}
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="btn btn-danger small"
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
              disabled={busy}
            >
              Delete {count} — confirm
            </button>
            <button type="button" className="btn btn-ghost small" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-danger small"
            onClick={() => setConfirmDelete(true)}
            disabled={busy || none}
          >
            Delete
          </button>
        )}
      </div>

      <div className="bulk-edit">
        <div className="bulk-field">
          <label>Set volume: {Math.round(volume * 100)}%</label>
          <div className="row-actions">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.currentTarget.value))}
            />
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => onBulkVolume(volume)}
              disabled={busy || none}
            >
              Apply
            </button>
          </div>
        </div>
        <div className="bulk-field">
          <label>Set timing</label>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => onBulkSync('individual')}
              disabled={busy || none}
            >
              → Individual
            </button>
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => onBulkSync('global')}
              disabled={busy || none}
            >
              → Global
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
