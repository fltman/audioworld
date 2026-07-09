import type { AcousticZone, AudioPoint, Coordinates, PathEndBehavior, PathStop } from './types';
import { calculateBearing, calculateDistance, destinationPoint, pointInPolygon } from './geo';

/** The acoustic zone the listener is in, or null. Later zones win where they overlap. */
export function zoneAt(zones: AcousticZone[] | undefined, p: Coordinates): AcousticZone | null {
  if (!zones) return null;
  for (let i = zones.length - 1; i >= 0; i--) {
    if (pointInPolygon(p, zones[i]!.polygon)) return zones[i]!;
  }
  return null;
}

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

/** One full traversal time (seconds) of a path including dwells — the loop cycle. */
export function pathCycleSeconds(
  path: Coordinates[],
  speed: number,
  stops: PathStop[] | undefined
): number {
  if (path.length < 2 || speed <= 0) return 0;
  let t = 0;
  for (let i = 0; i < path.length; i++) {
    const s = stopAt(stops, i);
    if (s) t += s.dwellSec;
    if (i < path.length - 1) t += calculateDistance(path[i]!, path[i + 1]!) / speed;
  }
  return t;
}

/**
 * Seconds until a moving path guide is next back at its start vertex (path[0]),
 * given the guide's own elapsed time. Returns 0 if it is at the start right now,
 * or null if the point never returns (not a path, or endBehavior 'stop').
 */
export function secondsUntilAtStart(point: AudioPoint, elapsedSec: number): number | null {
  if (point.type !== 'path' && point.type !== 'path_triggered') return null;
  if (point.endBehavior === 'stop') return null;
  const cycle = pathCycleSeconds(point.path, point.speed, point.stops);
  if (cycle <= 0) return null;
  // loop returns every cycle; reverse (ping-pong) only every other cycle.
  const period = point.endBehavior === 'reverse' ? cycle * 2 : cycle;
  const phase = ((elapsedSec % period) + period) % period;
  // A dwell at the start vertex means the guide sits AT the start for that window
  // (at the cycle start, and — for reverse — mirrored at the cycle end): ETA 0.
  const dwell0 = stopAt(point.stops, 0)?.dwellSec ?? 0;
  if (phase <= dwell0) return 0;
  if (point.endBehavior === 'reverse' && phase >= period - dwell0) return 0;
  return period - phase;
}

/** Speed of sound in air, m/s. */
const SPEED_OF_SOUND = 343;

/**
 * Doppler playback-rate for a source, from how its distance changed since last frame.
 * Approaching (distance shrinking) pitches up (>1); receding pitches down (<1). Clamped
 * to a musical ±~2 semitones so a fast fly-by whooshes without ever sounding broken, and
 * so GPS jitter can't warble it. Returns 1 (no shift) when there's no prior sample.
 */
export function dopplerRate(distNow: number, distPrev: number | null, dtSec: number): number {
  if (distPrev == null || dtSec <= 0) return 1;
  // Clamp the radial velocity (not the output): a huge fake spike from a GPS jump would
  // otherwise drive (c + v) negative and flip the pitch the wrong way. ±35 m/s keeps the
  // rate in ~[0.91, 1.11] with the direction always correct.
  const vRadial = Math.max(-35, Math.min(35, (distNow - distPrev) / dtSec)); // +ve = receding
  return SPEED_OF_SOUND / (SPEED_OF_SOUND + vRadial);
}

/**
 * Low-pass cutoff (Hz) for distance air-absorption: near sounds stay bright, far ones go
 * dull, driven by the same normalized distance `t = distance/radius` as loudness. Open
 * (~18 kHz) at the source, ~720 Hz at the audible edge.
 */
export function airCutoffHz(distance: number, radius: number): number {
  if (radius <= 0) return 18000;
  const t = Math.max(0, Math.min(1, distance / radius));
  return Math.round(18000 * Math.pow(0.04, t));
}

/**
 * Elevation angle (radians, +up) of a source `height` metres above the listener at
 * `distance` metres of ground range. Zero height reads dead level; walk under it
 * (distance -> 0) and it swings directly overhead.
 */
export function elevationRad(height: number, distance: number): number {
  if (!height) return 0;
  return Math.atan2(height, Math.max(distance, 0));
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
      switch (point.mode) {
        // Chase fades out over the give-up distance; orbit/sideToSide hug the user,
        // so the audible field must be a few times their hold radius to stay loud.
        case 'chase':
          return point.disengageDistance ?? point.initialRadius;
        case 'orbit':
        case 'sideToSide':
          return Math.max((point.followRadius ?? 8) * 4, point.initialRadius);
        default:
          return point.initialRadius;
      }
    case 'path_triggered':
      return point.triggerRadius;
  }
}

/**
 * The "leash" radius for a wait-for-listener path: the source only advances while
 * the user is within this. Falls back to the audible radius when unset.
 */
export function waitRadiusOf(point: AudioPoint): number {
  if (point.type === 'path') return point.waitRadius ?? point.radius;
  if (point.type === 'path_triggered') return point.waitRadius ?? point.triggerRadius;
  return 0;
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
  // A wait-for-listener path advances on each user's own leash, so it can't share a
  // global clock — it is inherently individual.
  if (point.type === 'path' && point.waitForListener) return false;
  return (
    point.sync === 'global' &&
    (point.type === 'path' || point.type === 'static_circling')
  );
}

/** Per-point, per-device memory the caller persists between frames. */
export interface SourceState {
  /** When this point was triggered for this user (client seconds), or null if not yet. */
  triggeredAtSec: number | null;
  /** wait-for-listener: path-progress seconds, advanced only while the user is in the leash. */
  progressSec?: number;
  /** chase: the pursuer's integrated world position. */
  chaserPos?: Coordinates | null;
  /** chase: true once the user has outrun it (stays given-up until reset). */
  disengaged?: boolean;
  /** hold-still: seconds stood still (below walking pace) inside range this streak. */
  stillAccumSec?: number;
  /** hold-still: latched once the still-time reveal has been earned. */
  stillRevealed?: boolean;
}

/** Below this ground speed (m/s) the listener counts as "standing still". */
const STILL_SPEED = 0.8;

export interface ResolveInput {
  /** Current user position. */
  user: Coordinates;
  /** Monotonic seconds from a fixed client origin (drives continuous movers). */
  clockSec: number;
  /** Seconds since the previous frame; drives integrated movers (chase, wait). 0 on the first frame. */
  dtSec: number;
  /** User compass heading, degrees clockwise from north (for heading-relative movers). */
  heading: number;
  /** Listener ground speed (m/s), smoothed — drives the hold-still gate. */
  userSpeed: number;
  /** Per-point memory; the returned `state` must be persisted for the next frame. */
  state: SourceState;
  /** Story flags currently raised on this device (for `requiresFlags` gating). */
  flags: ReadonlySet<string>;
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
  /** Updated per-point memory — the caller must persist this for the next frame. */
  state: SourceState;
  /** For a path with stops: the stop the source is currently dwelling at, else null. */
  atStop?: PathStop | null;
}

/** True only if every required flag has been raised (empty/absent = always satisfied). */
function flagsSatisfied(point: AudioPoint, flags: ReadonlySet<string>): boolean {
  const req = point.requiresFlags;
  if (!req || req.length === 0) return true;
  for (const f of req) if (!flags.has(f)) return false;
  return true;
}

/**
 * Advance a wait-for-listener path: the source only moves while the user is within
 * `leashRadius`. Mutates `state.progressSec` and reports the current position/audibility.
 */
function advanceWaitProgress(
  state: SourceState,
  path: Coordinates[],
  speed: number,
  endBehavior: PathEndBehavior,
  stops: PathStop[] | undefined,
  user: Coordinates,
  audibleRadius: number,
  leashRadius: number,
  dtSec: number
): { position: Coordinates; audible: boolean; atStop: PathStop | null } {
  const progress = state.progressSec ?? 0;
  const st = pathStateAtTime(path, speed, endBehavior, stops, progress);
  const leashDist = calculateDistance(user, st.position);
  // Advance only while the listener is inside the leash; otherwise hold (wait).
  state.progressSec = leashDist <= leashRadius ? progress + dtSec : progress;
  return { position: st.position, audible: leashDist <= audibleRadius, atStop: st.atStop };
}

/**
 * Resolver: given a point, the user, clocks and the point's memory, compute where
 * the sound is and whether it can be heard. The returned `state` carries updated
 * memory the caller feeds back next frame.
 */
export function resolveSource(point: AudioPoint, input: ResolveInput): ResolveOutput {
  const { user, clockSec, dtSec, heading, flags, userSpeed } = input;
  const state: SourceState = { ...input.state };

  const out = (
    position: Coordinates,
    audible: boolean,
    atStop: PathStop | null = null
  ): ResolveOutput => ({
    position,
    bearing: calculateBearing(user, position),
    distance: calculateDistance(user, position),
    audible,
    state,
    atStop,
  });

  // Gated points stay inert (silent, untriggerable) until their flags are raised.
  if (!flagsSatisfied(point, flags)) {
    return out(anchorOf(point), false);
  }

  switch (point.type) {
    case 'static': {
      const d = calculateDistance(user, point.center);
      const inRange = d <= point.radius;
      const still = userSpeed < STILL_SPEED;

      // Hold-still: accumulate still-time while in range; latch "revealed" once the
      // wait is served. Moving resets the wait (but keeps a reveal already earned).
      if (point.stillSec && point.stillSec > 0) {
        if (inRange && still) {
          state.stillAccumSec = (state.stillAccumSec ?? 0) + dtSec;
          if (state.stillAccumSec >= point.stillSec) state.stillRevealed = true;
        } else {
          state.stillAccumSec = 0;
        }
      }

      // Jumpscare: silent until armed by coming within triggerRadius, then audible
      // within the normal radius.
      let audible: boolean;
      if (point.triggerRadius != null && point.triggerRadius > 0) {
        if (state.triggeredAtSec === null && d <= point.triggerRadius) {
          state.triggeredAtSec = clockSec;
        }
        audible = state.triggeredAtSec !== null && inRange;
      } else {
        audible = inRange;
      }

      if (point.stillSec && point.stillSec > 0) audible = audible && !!state.stillRevealed;
      if (point.fleeOnMove) audible = audible && still;
      return out(point.center, audible);
    }

    case 'static_circling': {
      const pos = circlingPosition(point.center, point.circleRadius, point.speed, clockSec);
      const d = calculateDistance(user, pos);
      return out(pos, d <= point.radius);
    }

    case 'path': {
      if (point.waitForListener) {
        const w = advanceWaitProgress(
          state, point.path, point.speed, point.endBehavior, point.stops,
          user, point.radius, waitRadiusOf(point), dtSec
        );
        return out(w.position, w.audible, w.atStop);
      }
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
      const mode = point.mode ?? 'attach';
      // Trigger when the user first enters initialRadius; seed the chaser at center.
      if (state.triggeredAtSec === null) {
        if (calculateDistance(user, point.center) <= point.initialRadius) {
          state.triggeredAtSec = clockSec;
          if (mode === 'chase') state.chaserPos = point.center;
        } else {
          return out(point.center, false);
        }
      }
      const elapsed = clockSec - (state.triggeredAtSec ?? clockSec);

      switch (mode) {
        case 'chase': {
          const maxSpeed = point.maxSpeed ?? 1.5;
          const giveUp = point.disengageDistance ?? point.initialRadius;
          let pos = state.chaserPos ?? point.center;
          const dist = calculateDistance(pos, user);
          // Outrun it (or already gave up) → it stops where it is and falls silent.
          if (state.disengaged || dist > giveUp) {
            state.disengaged = true;
            state.chaserPos = pos;
            return out(pos, false);
          }
          const step = Math.min(maxSpeed * dtSec, dist);
          if (step > 0) pos = destinationPoint(pos, calculateBearing(pos, user), step);
          state.chaserPos = pos;
          return out(pos, true);
        }
        case 'orbit': {
          const r = point.followRadius ?? 8;
          const pos = circlingPosition(user, r, point.followSpeed ?? 2, elapsed);
          return out(pos, true);
        }
        case 'sideToSide': {
          const r = point.followRadius ?? 8;
          if (r <= 0) return { position: user, bearing: 0, distance: 0, audible: true, state };
          // Sweep the azimuth ±90° around the user's facing at an angular rate ~ speed/radius.
          const omega = (point.followSpeed ?? 2) / r;
          const bearing = (((heading + 90 * Math.sin(omega * elapsed)) % 360) + 360) % 360;
          const pos = destinationPoint(user, bearing, r);
          return out(pos, true);
        }
        default:
          // 'attach': rides right on top of the user, always audible.
          return { position: user, bearing: 0, distance: 0, audible: true, state };
      }
    }

    case 'path_triggered': {
      const start = point.path[0] ?? user;
      if (state.triggeredAtSec === null) {
        if (calculateDistance(user, start) <= point.triggerRadius) {
          state.triggeredAtSec = clockSec;
          state.progressSec = 0;
        } else {
          return out(start, false);
        }
      }
      if (point.waitForListener) {
        const w = advanceWaitProgress(
          state, point.path, point.speed, point.endBehavior, point.stops,
          user, point.triggerRadius, waitRadiusOf(point), dtSec
        );
        return out(w.position, w.audible, w.atStop);
      }
      const elapsed = clockSec - (state.triggeredAtSec ?? clockSec);
      const st =
        point.stops && point.stops.length > 0
          ? pathStateAtTime(point.path, point.speed, point.endBehavior, point.stops, elapsed)
          : {
              position: pointAlongPath(point.path, point.speed * elapsed, point.endBehavior)
                .position,
              atStop: null as PathStop | null,
            };
      const d = calculateDistance(user, st.position);
      return out(st.position, d <= point.triggerRadius, st.atStop);
    }
  }
}
