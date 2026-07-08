import type { AudioPoint, Coordinates, PathEndBehavior, PathStop } from './types';
import { calculateBearing, calculateDistance, destinationPoint } from './geo';

/** Total length of a polyline in meters. */
export function pathLength(path: Coordinates[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += calculateDistance(path[i - 1]!, path[i]!);
  }
  return total;
}

/** Linear interpolation between two coordinates (t in 0..1). */
function lerp(a: Coordinates, b: Coordinates, t: number): Coordinates {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * Position at arc-length `distanceM` along a polyline, honoring the end behavior.
 * Returns the point plus whether the traversal has completed (only ever true for 'stop').
 */
export function pointAlongPath(
  path: Coordinates[],
  distanceM: number,
  endBehavior: PathEndBehavior
): { position: Coordinates; done: boolean } {
  if (path.length === 0) return { position: { lat: 0, lng: 0 }, done: true };
  if (path.length === 1) return { position: path[0]!, done: true };

  const total = pathLength(path);
  if (total === 0) return { position: path[0]!, done: true };

  let d = distanceM;
  let done = false;

  if (endBehavior === 'loop') {
    d = ((d % total) + total) % total;
  } else if (endBehavior === 'reverse') {
    const period = total * 2;
    d = ((d % period) + period) % period;
    if (d > total) d = period - d; // ping-pong back
  } else {
    // 'stop'
    if (d >= total) {
      return { position: path[path.length - 1]!, done: true };
    }
    if (d <= 0) return { position: path[0]!, done: false };
  }

  // Walk segments until we consume `d`.
  let remaining = d;
  for (let i = 1; i < path.length; i++) {
    const segLen = calculateDistance(path[i - 1]!, path[i]!);
    if (segLen === 0) continue;
    if (remaining <= segLen) {
      return { position: lerp(path[i - 1]!, path[i]!, remaining / segLen), done };
    }
    remaining -= segLen;
  }
  return { position: path[path.length - 1]!, done };
}

function stopAt(stops: PathStop[] | undefined, index: number): PathStop | null {
  if (!stops) return null;
  for (const s of stops) if (s.index === index && s.dwellSec > 0) return s;
  return null;
}

/**
 * Position of a source travelling a polyline that pauses at `stops`, honoring the
 * end behavior. Returns the current position and, if the source is currently
 * dwelling at a stop, that stop (so the caller can play its clip).
 */
export function pathStateAtTime(
  path: Coordinates[],
  speed: number,
  endBehavior: PathEndBehavior,
  stops: PathStop[] | undefined,
  tSec: number
): { position: Coordinates; atStop: PathStop | null; done: boolean } {
  if (path.length === 0) return { position: { lat: 0, lng: 0 }, atStop: null, done: true };
  if (path.length === 1 || speed <= 0) return { position: path[0]!, atStop: null, done: true };

  // Ordered phases: [dwell@0?, travel 0->1, dwell@1?, travel 1->2, ..., dwell@last?].
  type Phase = { dur: number; a: Coordinates; b: Coordinates; stop: PathStop | null };
  const phases: Phase[] = [];
  for (let i = 0; i < path.length; i++) {
    const s = stopAt(stops, i);
    if (s) phases.push({ dur: s.dwellSec, a: path[i]!, b: path[i]!, stop: s });
    if (i < path.length - 1) {
      const segLen = calculateDistance(path[i]!, path[i + 1]!);
      if (segLen > 0) phases.push({ dur: segLen / speed, a: path[i]!, b: path[i + 1]!, stop: null });
    }
  }
  const cycle = phases.reduce((sum, p) => sum + p.dur, 0);
  if (cycle <= 0) return { position: path[0]!, atStop: null, done: true };

  let t = tSec;
  let done = false;
  if (endBehavior === 'loop') {
    t = ((t % cycle) + cycle) % cycle;
  } else if (endBehavior === 'reverse') {
    const period = cycle * 2;
    t = ((t % period) + period) % period;
    if (t > cycle) t = period - t; // mirror the forward timeline
  } else {
    if (t >= cycle) return { position: path[path.length - 1]!, atStop: null, done: true };
    if (t < 0) t = 0;
  }

  let acc = 0;
  for (let k = 0; k < phases.length; k++) {
    const p = phases[k]!;
    if (t < acc + p.dur || k === phases.length - 1) {
      const frac = p.dur > 0 ? Math.max(0, Math.min(1, (t - acc) / p.dur)) : 0;
      const position = p.stop ? p.a : lerp(p.a, p.b, frac);
      return { position, atStop: p.stop, done };
    }
    acc += p.dur;
  }
  return { position: path[path.length - 1]!, atStop: null, done };
}

/**
 * Arrival time (seconds from start) at each path vertex, accounting for dwells at
 * earlier stops. Used by the admin to label the map so audio clips can be timed.
 */
export function pathVertexTimes(
  path: Coordinates[],
  speed: number,
  stops: PathStop[] | undefined
): number[] {
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < path.length; i++) {
    times.push(t);
    const s = stopAt(stops, i);
    if (s) t += s.dwellSec;
    if (i < path.length - 1 && speed > 0) {
      t += calculateDistance(path[i]!, path[i + 1]!) / speed;
    }
  }
  return times;
}

/** Position of a source orbiting `center` at radius `circleRadius`, `speed` m/s, at time `tSec`. */
export function circlingPosition(
  center: Coordinates,
  circleRadius: number,
  speed: number,
  tSec: number
): Coordinates {
  if (circleRadius <= 0) return center;
  // angular velocity (deg/s) = linear speed / circumference * 360
  const angularDegPerSec = (speed / (2 * Math.PI * circleRadius)) * 360;
  const bearing = (angularDegPerSec * tSec) % 360;
  return destinationPoint(center, bearing, circleRadius);
}

/** The radius within which a point is audible (used by the client and by the admin map preview). */
export function audibleRadiusOf(point: AudioPoint): number {
  switch (point.type) {
    case 'static':
    case 'static_circling':
    case 'path':
      return point.radius;
    case 'follow_user':
      return point.initialRadius;
    case 'path_triggered':
      return point.triggerRadius;
  }
}

/** The proximity radius that triggers a point, or null if the point has no trigger. */
export function triggerRadiusOf(point: AudioPoint): number | null {
  switch (point.type) {
    case 'static':
      return point.triggerRadius ?? null;
    case 'follow_user':
      return point.initialRadius;
    case 'path_triggered':
      return point.triggerRadius;
    default:
      return null;
  }
}

/** The anchor coordinate a point is drawn at on a map (its center / path start). */
export function anchorOf(point: AudioPoint): Coordinates {
  switch (point.type) {
    case 'static':
    case 'static_circling':
    case 'follow_user':
      return point.center;
    case 'path':
    case 'path_triggered':
      return point.path[0] ?? { lat: 0, lng: 0 };
  }
}

/**
 * Whether a point's motion + audio is driven by the shared global clock (vs the
 * per-device clock). Only the continuously-moving types can be globally synced.
 */
export function isGloballyTimed(point: AudioPoint): boolean {
  return (
    point.sync === 'global' &&
    (point.type === 'path' || point.type === 'static_circling')
  );
}

export interface ResolveInput {
  /** Current user position. */
  user: Coordinates;
  /** Monotonic seconds from a fixed client origin (drives continuous movers). */
  clockSec: number;
  /** When this point was triggered for this user (monotonic seconds), or null if not yet. */
  triggeredAtSec: number | null;
}

export interface ResolveOutput {
  /** World position of the sound right now (null only for degenerate/empty paths). */
  position: Coordinates | null;
  /** Bearing from the user to the source, degrees clockwise from north. */
  bearing: number;
  /** Distance from the user to the source, meters. */
  distance: number;
  /** Whether the user is within the audible range. */
  audible: boolean;
  /** Possibly-updated trigger memory — the caller must persist this for the next frame. */
  triggeredAtSec: number | null;
  /** For a path with stops: the stop the source is currently dwelling at, else null. */
  atStop?: PathStop | null;
}

/**
 * Pure resolver: given a point, the user, a clock and the point's trigger memory,
 * compute where the sound is and whether it can be heard. Stateless — the caller
 * owns the `triggeredAtSec` memory and feeds the returned value back next frame.
 */
export function resolveSource(point: AudioPoint, input: ResolveInput): ResolveOutput {
  const { user, clockSec } = input;
  let triggeredAtSec = input.triggeredAtSec;

  const out = (
    position: Coordinates,
    audible: boolean,
    atStop: PathStop | null = null
  ): ResolveOutput => ({
    position,
    bearing: calculateBearing(user, position),
    distance: calculateDistance(user, position),
    audible,
    triggeredAtSec,
    atStop,
  });

  switch (point.type) {
    case 'static': {
      const d = calculateDistance(user, point.center);
      if (point.triggerRadius != null && point.triggerRadius > 0) {
        // Jumpscare: silent until armed by coming within triggerRadius, then
        // audible within the normal radius. Arm before out() reads triggeredAtSec.
        if (triggeredAtSec === null && d <= point.triggerRadius) {
          triggeredAtSec = clockSec;
        }
        return out(point.center, triggeredAtSec !== null && d <= point.radius);
      }
      return out(point.center, d <= point.radius);
    }

    case 'static_circling': {
      const pos = circlingPosition(point.center, point.circleRadius, point.speed, clockSec);
      const d = calculateDistance(user, pos);
      return out(pos, d <= point.radius);
    }

    case 'path': {
      const st =
        point.stops && point.stops.length > 0
          ? pathStateAtTime(point.path, point.speed, point.endBehavior, point.stops, clockSec)
          : {
              position: pointAlongPath(point.path, point.speed * clockSec, point.endBehavior)
                .position,
              atStop: null as PathStop | null,
            };
      const d = calculateDistance(user, st.position);
      return out(st.position, d <= point.radius, st.atStop);
    }

    case 'follow_user': {
      if (triggeredAtSec === null) {
        if (calculateDistance(user, point.center) <= point.initialRadius) {
          triggeredAtSec = clockSec;
        }
      }
      if (triggeredAtSec !== null) {
        // The source rides along with the user: right on top, always audible.
        return { position: user, bearing: 0, distance: 0, audible: true, triggeredAtSec };
      }
      return out(point.center, false);
    }

    case 'path_triggered': {
      const start = point.path[0] ?? user;
      if (triggeredAtSec === null) {
        if (calculateDistance(user, start) <= point.triggerRadius) {
          triggeredAtSec = clockSec;
        }
      }
      if (triggeredAtSec !== null) {
        const elapsed = clockSec - triggeredAtSec;
        const { position } = pointAlongPath(point.path, point.speed * elapsed, point.endBehavior);
        const d = calculateDistance(user, position);
        return out(position, d <= point.triggerRadius);
      }
      return out(start, false);
    }
  }
}
