import { useState } from 'react';
import type { BBox, DiscoveredPlace, PlaceCategory } from '@audioworld/shared';
import { PLACE_CATEGORIES } from '@audioworld/shared';
import { api } from '../api';

interface Props {
  /** Current map viewport (the area searched). */
  bbox: BBox | null;
  places: DiscoveredPlace[];
  selected: number[];
  onResults: (places: DiscoveredPlace[]) => void;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  /** Add the selected places as points (individual, or ordered as a route). */
  onConvert: (mode: 'individual' | 'route') => void;
  converting: { done: number; total: number } | null;
}

/** Find notable places in the current map area (OpenStreetMap) and add them as points
 *  carrying their facts — you voice each one later (optionally with a persona). */
export default function DiscoverPanel({
  bbox,
  places,
  selected,
  onResults,
  onToggle,
  onSelectAll,
  onClear,
  onConvert,
  converting,
}: Props) {
  const [cats, setCats] = useState<Set<PlaceCategory>>(
    () => new Set<PlaceCategory>(['museum', 'historic', 'artwork'])
  );
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCat = (k: PlaceCategory) =>
    setCats((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const search = async () => {
    if (!bbox || cats.size === 0) return;
    setSearching(true);
    setError(null);
    try {
      onResults(await api.discover(bbox, [...cats]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="discover">
      <div className="discover-cats">
        {PLACE_CATEGORIES.map((c) => (
          <label key={c.key} className="check">
            <input
              type="checkbox"
              checked={cats.has(c.key)}
              disabled={!!converting}
              onChange={() => toggleCat(c.key)}
            />
            {c.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-accent"
        onClick={() => void search()}
        disabled={searching || cats.size === 0 || !bbox || !!converting}
      >
        {searching ? 'Searching…' : '🔍 Search this map area'}
      </button>
      <p className="hint">Pan/zoom to the area first. Found places show as green pins — tap one to select it.</p>
      {error && <div className="error">{error}</div>}

      {places.length > 0 && (
        <>
          <div className="discover-head">
            <span>
              {selected.length}/{places.length} selected
            </span>
            <div className="row-actions">
              <button type="button" className="btn btn-ghost small" onClick={onSelectAll}>
                All
              </button>
              <button type="button" className="btn btn-ghost small" onClick={onClear}>
                None
              </button>
            </div>
          </div>
          <ul className="discover-list">
            {places.map((p, i) => (
              <li key={i} className={selected.includes(i) ? 'is-on' : ''}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.includes(i)}
                    onChange={() => onToggle(i)}
                  />
                  <span>
                    <b>{p.name}</b> <span className="muted">· {p.kind}</span>
                    {p.description && <span className="discover-desc">{p.description}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="discover-convert">
            {converting ? (
              <p className="muted">
                Adding… {converting.done}/{converting.total}
              </p>
            ) : (
              <div className="row-actions row-actions--wrap">
                <button
                  type="button"
                  className="btn btn-accent small"
                  disabled={!selected.length}
                  onClick={() => onConvert('individual')}
                >
                  Add {selected.length} place{selected.length === 1 ? '' : 's'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost small"
                  disabled={selected.length < 2}
                  onClick={() => onConvert('route')}
                  title="Order them into a walking route"
                >
                  As a route
                </button>
              </div>
            )}
            <p className="hint">
              Added as silent points carrying each place’s facts. Voice them later in the point
              editor (optionally with a guide/persona) — no credits spent here.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
