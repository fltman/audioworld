import { useEffect, useState } from 'react';
import type { BBox, DiscoveredPlace, ElevenVoice, PlaceCategory } from '@audioworld/shared';
import { PLACE_CATEGORIES } from '@audioworld/shared';
import { ApiError, api } from '../api';

interface Props {
  /** Current map viewport (the area searched). */
  bbox: BBox | null;
  places: DiscoveredPlace[];
  selected: number[];
  onResults: (places: DiscoveredPlace[]) => void;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  /** Convert the selected places to narrated points (individual, or ordered as a route). */
  onConvert: (mode: 'individual' | 'route', voiceId: string) => void;
  converting: { done: number; total: number } | null;
}

/** Find notable places in the current map area (OpenStreetMap) and turn them into
 *  narrated audio points. */
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
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [ttsOff, setTtsOff] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listVoices()
      .then((vs) => {
        setVoices(vs);
        if (vs[0]) setVoiceId(vs[0].id);
      })
      .catch((e) => {
        // 503 = feature off (no key). Any other failure (expired token, 500, network)
        // must be surfaced, else convert is silently disabled with no explanation.
        if (e instanceof ApiError && e.status === 503) setTtsOff(true);
        else setVoicesError(e instanceof Error ? e.message : 'Could not load voices');
      });
  }, []);

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

          {ttsOff ? (
            <p className="muted">
              Set <code>ELEVENLABS_API_KEY</code> on the server to turn places into narrated points.
            </p>
          ) : (
            <div className="discover-convert">
              {voicesError && <div className="error">Voices unavailable: {voicesError}</div>}
              {voices.length > 0 && (
                <label className="gen-dur">
                  Narrator voice
                  <select
                    className="select"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.currentTarget.value)}
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {converting ? (
                <p className="muted">
                  Narrating… {converting.done}/{converting.total}
                </p>
              ) : (
                <div className="row-actions row-actions--wrap">
                  <button
                    type="button"
                    className="btn btn-accent small"
                    disabled={!selected.length || !voiceId}
                    onClick={() => onConvert('individual', voiceId)}
                  >
                    Create {selected.length} narrated point{selected.length === 1 ? '' : 's'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    disabled={selected.length < 2 || !voiceId}
                    onClick={() => onConvert('route', voiceId)}
                    title="Order them into a walking route"
                  >
                    As a route
                  </button>
                </div>
              )}
              <p className="hint">Each place is narrated in the chosen voice (uses ElevenLabs credits).</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
