import type { Coordinates } from './types';
import { calculateBearing, calculateDistance, destinationPoint } from './geo';

/** A movement key held down while walking a simulated listener. */
export type WalkControl = 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight';

/** Pace presets, m/s. Walking pace matters: hold-still triggers + Doppler read the speed. */
export const WALK_SPEEDS = { walk: 1.4, jog: 3, bike: 6 } as const;
export type WalkSpeed = keyof typeof WALK_SPEEDS;

/** Keys for walking a simulated listener (by lower-cased `KeyboardEvent.key`). The arrows
 *  turn, like turning your head toward a sound; A / D sidestep. */
export const WALK_KEYMAP: Readonly<Record<string, WalkControl>> = {
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

const SPRINT_FACTOR = 3; // Shift held
const KEY_TURN_DEG_PER_SEC = 120;
/** How fast the listener turns to face where they're walking (a natural head turn). */
const FACE_TURN_DEG_PER_SEC = 270;
const ARRIVED_M = 0.3;
/** A drag only re-aims the heading once it has moved this far (hand jitter otherwise). */
const DRAG_AIM_M = 1.5;

/** Step `from` toward `to` by at most `maxDeg`, the short way round. */
function approachAngle(from: number, to: number, maxDeg: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  const step = Math.abs(delta) <= maxDeg ? delta : Math.sign(delta) * maxDeg;
  return (from + step + 360) % 360;
}

/**
 * A simulated listener walking a map: held keys walk / turn / sidestep at a real pace,
 * a clicked spot is walked to (turning to face it), and a drag carries it along. Shared
 * by the admin's playtest and the app's "try it on this screen", so both move alike.
 * Call `step` once per frame.
 */
export class SimWalker {
  position: Coordinates;
  /** Compass heading, degrees clockwise from north. */
  heading = 0;
  /** Base pace in m/s (see WALK_SPEEDS). */
  speedMps: number = WALK_SPEEDS.walk;
  /** Shift held: temporarily move SPRINT_FACTOR× faster. */
  sprint = false;

  private readonly held = new Set<WalkControl>();
  private target: Coordinates | null = null;
  private dragAim: Coordinates | null = null;

  constructor(position: Coordinates) {
    this.position = position;
  }

  /** Where a click-to-walk is heading, or null. */
  get destination(): Coordinates | null {
    return this.target;
  }

  /** Jump straight to a spot (cancels any walk in progress). */
  setPosition(c: Coordinates): void {
    this.position = c;
    this.target = null;
  }
  /** Follow a drag of the listener, facing the way it's being dragged. */
  dragTo(c: Coordinates): void {
    const from = this.dragAim ?? this.position;
    if (calculateDistance(from, c) >= DRAG_AIM_M) {
      this.setHeading(calculateBearing(from, c));
      this.dragAim = c;
    } else if (!this.dragAim) {
      this.dragAim = from;
    }
    this.setPosition(c);
  }
  endDrag(): void {
    this.dragAim = null;
  }
  /** Walk to a spot at the current pace, turning to face it. */
  walkTo(c: Coordinates): void {
    this.target = c;
  }
  cancelWalk(): void {
    this.target = null;
  }
  press(c: WalkControl): void {
    this.held.add(c);
  }
  release(c: WalkControl): void {
    this.held.delete(c);
  }
  /** Drop every held key (a window blur would otherwise leave the listener walking). */
  releaseAll(): void {
    this.held.clear();
    this.sprint = false;
  }
  setHeading(deg: number): void {
    this.heading = ((deg % 360) + 360) % 360;
  }

  /** Advance by one frame of held keys / walk-to-target movement. */
  step(dtSec: number): void {
    if (dtSec <= 0) return;
    const h = this.held;
    const pace = this.speedMps * (this.sprint ? SPRINT_FACTOR : 1);
    const turn = (h.has('turnRight') ? 1 : 0) - (h.has('turnLeft') ? 1 : 0);
    if (turn !== 0) this.setHeading(this.heading + turn * KEY_TURN_DEG_PER_SEC * dtSec);

    const ahead = (h.has('forward') ? 1 : 0) - (h.has('back') ? 1 : 0);
    const side = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    if (ahead !== 0 || side !== 0) {
      // Keys take over from a click-to-walk; the heading stays where the listener looks.
      this.target = null;
      const offset = (Math.atan2(side, ahead) * 180) / Math.PI;
      this.position = destinationPoint(this.position, (this.heading + offset + 360) % 360, pace * dtSec);
      return;
    }

    if (this.target) {
      const left = calculateDistance(this.position, this.target);
      if (left <= ARRIVED_M) {
        this.target = null;
        return;
      }
      const bearing = calculateBearing(this.position, this.target);
      this.heading = approachAngle(this.heading, bearing, FACE_TURN_DEG_PER_SEC * dtSec);
      this.position = destinationPoint(this.position, bearing, Math.min(left, pace * dtSec));
    }
  }
}

/** Whether a key event comes from typing in a field (so it mustn't walk the listener).
 *  Sliders, checkboxes and buttons don't count. */
export function isTextEntryTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  return !['range', 'checkbox', 'radio', 'button'].includes(el.type ?? '');
}
