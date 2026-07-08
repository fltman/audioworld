import type { Snapshot } from '../services/experience';

interface ReadoutProps {
  snap: Snapshot;
}

/** Compact instrument readout: position, accuracy, heading and any active notices. */
export function Readout({ snap }: ReadoutProps) {
  const notices: string[] = [];
  if (snap.geoError) notices.push(snap.geoError);
  if (snap.insecure) notices.push('needs HTTPS');
  if (snap.compass === 'unavailable') notices.push('no compass');
  if (snap.compass === 'denied') notices.push('compass blocked');
  if (snap.mode === 'sim') notices.push('SIM');

  const coords =
    snap.lat != null && snap.lng != null
      ? `${snap.lat.toFixed(5)}, ${snap.lng.toFixed(5)}`
      : 'acquiring…';

  return (
    <footer className="readout">
      <div className="readout__stats">
        <span>{coords}</span>
        {snap.accuracy != null && <span>&plusmn;{Math.round(snap.accuracy)} m</span>}
        <span>{snap.headingDeg != null ? `${Math.round(snap.headingDeg)}°` : '—'}</span>
      </div>
      {notices.length > 0 && (
        <div className="readout__notices">
          {notices.map((n) => (
            <span key={n} className="pill">
              {n}
            </span>
          ))}
        </div>
      )}
    </footer>
  );
}
