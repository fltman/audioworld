import {
  audibleRadiusOf,
  circlingPosition,
  isGloballyTimed,
  pathCycleSeconds,
  pathStateAtTime,
  type AudioPoint,
  type Coordinates,
  type PathEndBehavior,
  type PathStop,
  type PointType,
} from '@audioworld/shared';
import { draftAudibleRadius, type DraftState } from './draft';

/** A one-way ('stop') route replays after this pause so the preview keeps showing it. */
const REPLAY_PAUSE_SEC = 3;

/**
 * A moving source as the editor's motion preview sees it: just its geometry and timing.
 * Listener-driven behaviour (triggers, wait-for-listener) is left out — the preview shows
 * the route as it plays once it gets going, so its pace and timing can be checked.
 */
export type Mover = {
  id: string;
  type: PointType;
  /** Audible range, drawn as a ring travelling with the source. */
  radius: number;
  /** Added to the preview clock: a global point keeps its real, shared phase. */
  phaseSec: number;
} & (
  | { kind: 'circle'; center: Coordinates; circleRadius: number; speed: number }
  | {
      kind: 'path';
      path: Coordinates[];
      speed: number;
      endBehavior: PathEndBehavior;
      stops: PathStop[] | undefined;
    }
);

export interface MoverState {
  position: Coordinates;
  /** Seconds into the route (matches the path's vertex time labels); null for orbits. */
  tripSec: number | null;
  /** True while dwelling at a guided-tour stop. */
  dwelling: boolean;
}

const mod = (t: number, p: number) => ((t % p) + p) % p;

/** Phase of a globally timed point relative to the preview's (re)start. */
function phaseOf(startAt: number | undefined, global: boolean, restartWallMs: number): number {
  return global && startAt != null ? (restartWallMs - startAt) / 1000 : 0;
}

function pointMover(p: AudioPoint, restartWallMs: number): Mover | null {
  const phaseSec = phaseOf(p.startAt, isGloballyTimed(p), restartWallMs);
  const base = { id: p.id, type: p.type, radius: audibleRadiusOf(p), phaseSec };
  switch (p.type) {
    case 'static_circling':
      return { ...base, kind: 'circle', center: p.center, circleRadius: p.circleRadius, speed: p.speed };
    case 'path':
    case 'path_triggered':
      if (p.path.length < 2) return null;
      return { ...base, kind: 'path', path: p.path, speed: p.speed, endBehavior: p.endBehavior, stops: p.stops };
    default:
      return null; // static doesn't move; follow_user only moves relative to a listener
  }
}

/** The point being edited, with its unsaved settings (so edits show up immediately). */
function draftMover(d: DraftState, restartWallMs: number): Mover | null {
  if (d.drawingPath) return null; // the route isn't finished yet
  const global = d.sync === 'global' && (d.type === 'path' || d.type === 'static_circling');
  const base = {
    id: d.editingId ?? '__draft__',
    type: d.type,
    radius: draftAudibleRadius(d),
    phaseSec: phaseOf(d.startAt, global && !(d.type === 'path' && d.waitForListener), restartWallMs),
  };
  switch (d.type) {
    case 'static_circling':
      if (!d.center) return null;
      return { ...base, kind: 'circle', center: d.center, circleRadius: d.circleRadius, speed: d.speed };
    case 'path':
    case 'path_triggered': {
      if (d.path.length < 2) return null;
      const stops = d.stops.filter((s) => s.index < d.path.length && s.dwellSec > 0);
      return { ...base, kind: 'path', path: d.path, speed: d.speed, endBehavior: d.endBehavior, stops };
    }
    default:
      return null;
  }
}

/** Every moving source to animate: saved points, with the open draft standing in for its own. */
export function moversOf(
  points: AudioPoint[],
  draft: DraftState | null,
  restartWallMs: number
): Mover[] {
  const out: Mover[] = [];
  for (const p of points) {
    if (draft?.editingId === p.id) continue;
    const m = pointMover(p, restartWallMs);
    if (m) out.push(m);
  }
  const dm = draft ? draftMover(draft, restartWallMs) : null;
  if (dm) out.push(dm);
  return out;
}

/** Where a mover is `clockSec` into the preview. */
export function moverAt(m: Mover, clockSec: number): MoverState {
  const t = clockSec + m.phaseSec;
  if (m.kind === 'circle') {
    return { position: circlingPosition(m.center, m.circleRadius, m.speed, t), tripSec: null, dwelling: false };
  }
  const cycle = pathCycleSeconds(m.path, m.speed, m.stops);
  if (cycle <= 0) return { position: m.path[0]!, tripSec: null, dwelling: false };
  let trip: number;
  if (m.endBehavior === 'reverse') {
    const lap = mod(t, cycle * 2);
    trip = lap > cycle ? cycle * 2 - lap : lap; // the way back retraces the timeline
  } else if (m.endBehavior === 'stop') {
    trip = Math.min(mod(t, cycle + REPLAY_PAUSE_SEC), cycle);
  } else {
    trip = mod(t, cycle);
  }
  const st = pathStateAtTime(m.path, m.speed, 'stop', m.stops, trip);
  return { position: st.position, tripSec: trip, dwelling: st.atStop != null };
}
