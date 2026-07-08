import { useCallback, useEffect, useState } from 'react';
import type { PreviewBlip, PreviewEngine } from '../services/previewEngine';

interface Props {
  engine: PreviewEngine;
  onStop: () => void;
}

/** Compass arrow for a relative azimuth (0 = ahead / up). */
function arrow(az: number): string {
  const a = ((az % 360) + 360) % 360;
  const glyphs = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return glyphs[Math.round(a / 45) % 8]!;
}

export default function PreviewPanel({ engine, onStop }: Props) {
  const [audible, setAudible] = useState<PreviewBlip[]>([]);
  const [heading, setHeading] = useState(0);
  const [muted, setMuted] = useState(false);

  // Drive the audio + HUD.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = () => {
      const f = engine.tick();
      const now = performance.now();
      if (now - last > 120) {
        last = now;
        setAudible(f.audible);
        setHeading(Math.round(f.heading));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // WASD / arrows walk, Q / E turn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          engine.walk(engine.heading);
          break;
        case 's':
        case 'arrowdown':
          engine.walk(engine.heading + 180);
          break;
        case 'a':
        case 'arrowleft':
          engine.walk(engine.heading - 90);
          break;
        case 'd':
        case 'arrowright':
          engine.walk(engine.heading + 90);
          break;
        case 'q':
          engine.turn(-15);
          break;
        case 'e':
          engine.turn(15);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      engine.setMuted(!m);
      return !m;
    });
  }, [engine]);

  return (
    <section className="section preview">
      <div className="section-title">
        <span className="dot" style={{ background: '#7c5cff' }} />
        Playtest · {audible.length} audible
      </div>

      <p className="geo-status">Click / drag the listener on the map · WASD move · Q/E turn</p>

      <label className="form-field">
        <span className="label">Heading {heading}°</span>
        <input
          type="range"
          min={0}
          max={359}
          value={heading}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            engine.setHeading(v);
            setHeading(v);
          }}
        />
      </label>

      <ul className="preview-list">
        {audible.length === 0 ? (
          <li className="muted">Nothing in range — move closer to a point.</li>
        ) : (
          audible.map((b) => (
            <li key={b.id}>
              <span className="preview-list__arrow">{arrow(b.az)}</span>
              <span className="preview-list__name">{b.name}</span>
              <span className="preview-list__meta">{Math.round(b.distance)} m</span>
            </li>
          ))
        )}
      </ul>

      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={() => engine.reset()}>
          Restart
        </button>
        <button type="button" className={`btn btn-ghost${muted ? ' active' : ''}`} onClick={toggleMute}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="btn btn-danger" onClick={onStop}>
          Stop
        </button>
      </div>
    </section>
  );
}
