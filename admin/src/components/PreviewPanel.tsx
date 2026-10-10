import { useCallback, useEffect, useState } from 'react';
import {
  WALK_SPEEDS,
  type PreviewBlip,
  type PreviewEngine,
  type WalkControl,
  type WalkSpeed,
} from '../services/previewEngine';

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

/** Arrows turn (like turning your head toward a sound); A / D sidestep. */
const KEYMAP: Record<string, WalkControl> = {
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  a: 'left',
  d: 'right',
  q: 'turnLeft',
  arrowleft: 'turnLeft',
  e: 'turnRight',
  arrowright: 'turnRight',
};

const SPEED_LABEL: Record<WalkSpeed, string> = { walk: 'Walk', jog: 'Jog', bike: 'Bike' };

/** Typing in a field must not walk the listener (sliders + checkboxes are fine). */
function isTextEntry(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName !== 'INPUT') return false;
  return !['range', 'checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type);
}

export default function PreviewPanel({ engine, onStop }: Props) {
  const [audible, setAudible] = useState<PreviewBlip[]>([]);
  const [heading, setHeading] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<WalkSpeed>('walk');

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

  // Hold to walk / turn. Capture phase + stopPropagation so Leaflet's own arrow-key
  // panning (when the map has focus) doesn't fight the listener.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      engine.sprint = e.shiftKey;
      // macOS swallows the keyup of a key released while ⌘ is down — drop everything
      // rather than leave the listener walking off on its own.
      if (e.key === 'Meta') engine.releaseAll();
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
      const c = KEYMAP[e.key.toLowerCase()];
      if (!c) return;
      engine.press(c);
      e.preventDefault();
      e.stopPropagation();
    };
    const onUp = (e: KeyboardEvent) => {
      engine.sprint = e.shiftKey;
      const c = KEYMAP[e.key.toLowerCase()];
      if (c) engine.release(c);
    };
    const onBlur = () => engine.releaseAll();
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
      engine.releaseAll();
    };
  }, [engine]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      engine.setMuted(!m);
      return !m;
    });
  }, [engine]);

  const pickSpeed = (k: WalkSpeed) => {
    engine.speedMps = WALK_SPEEDS[k];
    setSpeed(k);
  };

  return (
    <section className="section preview">
      <div className="section-title">
        <span className="dot" style={{ background: '#7c5cff' }} />
        Playtest · {audible.length} audible
      </div>

      <p className="geo-status">
        🎧 Headphones on — sound is 3D. Click the map (or a point) to walk there; drag the
        listener to jump. The map scrolls along as you walk.
      </p>
      <p className="preview-keys">
        <kbd>W</kbd>/<kbd>↑</kbd> walk · <kbd>S</kbd>/<kbd>↓</kbd> back · <kbd>←</kbd>
        <kbd>→</kbd> or <kbd>Q</kbd>/<kbd>E</kbd> turn · <kbd>A</kbd>/<kbd>D</kbd> sidestep ·
        hold <kbd>Shift</kbd> to hurry
      </p>

      <div className="form-field">
        <span className="label">Pace</span>
        <div className="seg">
          {(Object.keys(WALK_SPEEDS) as WalkSpeed[]).map((k) => (
            <button
              key={k}
              type="button"
              className={speed === k ? 'active' : ''}
              onClick={() => pickSpeed(k)}
            >
              {SPEED_LABEL[k]} {WALK_SPEEDS[k]} m/s
            </button>
          ))}
        </div>
      </div>

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
              <span className="preview-list__level" title="Loudness">
                <i style={{ width: `${Math.round(Math.min(1, b.gain) * 100)}%` }} />
              </span>
              <span className="preview-list__meta">{Math.round(b.distance)} m</span>
            </li>
          ))
        )}
      </ul>

      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={() => engine.reset()}>
          Restart
        </button>
        <button type="button" className={`btn ${muted ? 'btn-accent' : 'btn-ghost'}`} onClick={toggleMute}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="btn btn-danger" onClick={onStop}>
          Stop
        </button>
      </div>
    </section>
  );
}
