import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AcousticZone,
  AudioPoint,
  Coordinates,
  PointType,
  SourceState,
} from '@audioworld/shared';
import {
  airCutoffHz,
  anchorOf,
  attenuation,
  audibleRadiusOf,
  calculateBearing,
  calculateDistance,
  destinationPoint,
  dopplerRate,
  elevationRad,
  isGloballyTimed,
  polygonCrossings,
  relativeBearing,
  resolveSource,
  secondsUntilAtStart,
  zoneAt,
} from '@audioworld/shared';
import { absoluteAudioUrl, syncServerTime } from '../api';
import { AudioEngine, type FrameSource } from '@audioworld/shared';
import { geoErrorMessage, isSecureEnough, watchUserPosition, type GeoWatch } from './geolocation';
import { requestOrientationPermission, watchHeading, type HeadingWatch } from './orientation';

/** A single audible source, projected for the radar. */
export interface Blip {
  id: string;
  name: string;
  /** Relative azimuth, degrees clockwise from the user's heading. */
  az: number;
  distance: number;
  audibleRadius: number;
  gain: number;
}

/** A source projected onto the geographic map (all points, audible or not). */
export interface MapSource {
  id: string;
  name: string;
  type: PointType;
  /** Current world position of the sound, or null for a degenerate/empty path. */
  position: Coordinates | null;
  audible: boolean;
  gain: number;
  audibleRadius: number;
}

/** A wayfinding cue: which way + how far to a sound you're navigating to (even out of range). */
export interface Waypoint {
  id: string;
  name: string;
  /** Relative azimuth, degrees clockwise from the user's heading. */
  az: number;
  distance: number;
  /** True once you're within earshot (the sound itself takes over). */
  audible: boolean;
  /** 'sound' = a per-point wayfinding arrow; 'start' = the course start cue. */
  kind: 'sound' | 'start';
  /** For a 'start' cue whose guide is a moving path: seconds until it's back at start (0 = there now). */
  etaSec?: number;
}

/** Everything the HUD renders for one animation frame. */
export interface FrameState {
  user: Coordinates | null;
  headingDeg: number | null;
  accuracy: number | null;
  blips: Blip[];
  sources: MapSource[];
  waypoints: Waypoint[];
  /** Name of the acoustic zone the listener is inside, or null. */
  zoneName: string | null;
  audibleCount: number;
}

export interface EngineStatus {
  mode: 'live' | 'sim';
  geoError: string | null;
  compass: 'ok' | 'gps' | 'unavailable' | 'denied' | 'sim';
  insecure: boolean;
}

/** React-friendly digest pushed a few times a second for the surrounding chrome. */
export interface Snapshot extends EngineStatus {
  audibleCount: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  headingDeg: number | null;
  zone: string | null;
}

const FALLBACK_ORIGIN: Coordinates = { lat: 59.3293, lng: 18.0686 };
const SIM_STEP_M = 4;
const SIM_TURN_DEG = 15;
const SIM_DRAG_M_PER_PX = 0.6;
const HEADING_SMOOTH = 0.25;

function smoothHeading(prev: number | null, next: number): number {
  if (prev === null) return next;
  const delta = ((next - prev + 540) % 360) - 180;
  return (prev + delta * HEADING_SMOOTH + 360) % 360;
}

export interface EngineOptions {
  points: AudioPoint[];
  sim: boolean;
  /** Show a compass cue + distance (+ return ETA) to the course start point. */
  showStartWayfinding?: boolean;
  /** Acoustic zones (reverb + ambient beds) for the course. */
  zones?: AcousticZone[];
  /** Eyes-up sonar navigation (hide the radar, ping toward the next point). */
  eyesUp?: boolean;
}

/**
 * Owns the live inputs (GPS + compass, or simulated), the trigger memory and the
 * audio graph. `tick()` resolves every point for the current instant, updates the
 * audio and returns the frame the HUD should draw — a single source of truth.
 */
export class ExperienceEngine {
  private readonly points: AudioPoint[];
  private readonly sim: boolean;
  private readonly showStartWayfinding: boolean;
  private readonly zones: AcousticZone[];
  private readonly eyesUp: boolean;
  /** Id of the zone the listener is currently inside, to fire setZone only on change. */
  private lastZoneId: string | null = null;
  /** Eyes-up sonar: perf time of the last nav ping + audible count to detect arrivals. */
  private lastPingAt = 0;
  private lastAudibleCount = 0;
  /** Per-point movement/trigger memory the resolver reads + writes each frame. */
  private readonly stateMemory = new Map<string, SourceState>();
  /** Story flags raised on THIS device (set by visited points, gate other points). */
  private readonly flags = new Set<string>();
  /** Flags permanently locked by an exclusive-group choice — can never be raised. */
  private readonly locked = new Set<string>();
  /** Previous-frame distance per point, for Doppler radial velocity. */
  private readonly prevDistance = new Map<string, number>();
  /** Previous listener position + smoothed speed, for the hold-still gate. */
  private prevUser: Coordinates | null = null;
  private smoothedSpeed = 0;

  private ctx: AudioContext | null = null;
  private audio: AudioEngine | null = null;
  private startedAtPerf = 0;
  /** performance.now() of the previous tick, for the inter-frame delta. */
  private lastTickPerf = 0;
  /** ms to add to Date.now() to match the server clock (for global/shared points). */
  private serverOffset = 0;

  private geoWatch: GeoWatch | null = null;
  private headingWatch: HeadingWatch | null = null;
  private orientationDenied = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  // Live inputs.
  private userLive: Coordinates | null = null;
  private headingLive: number | null = null;
  private accuracy: number | null = null;

  // Simulated inputs.
  private userSim: Coordinates = FALLBACK_ORIGIN;
  private headingSim = 0;

  private status: EngineStatus;

  constructor(opts: EngineOptions) {
    this.points = opts.points;
    this.sim = opts.sim;
    this.showStartWayfinding = opts.showStartWayfinding ?? false;
    this.zones = opts.zones ?? [];
    this.eyesUp = opts.eyesUp ?? false;
    this.status = {
      mode: opts.sim ? 'sim' : 'live',
      geoError: null,
      compass: opts.sim ? 'sim' : 'unavailable',
      insecure: false,
    };
  }

  /** MUST be called synchronously from a user gesture (creates the AudioContext,
   *  starts geolocation and requests the compass permission — in that order). */
  async start(): Promise<void> {
    // iOS 16.4+: route to the "playback" audio session so sound comes out of the
    // speaker even when the physical ring/silent switch is set to silent. The default
    // ("auto" → ambient) session is muted by that switch, so Web Audio would otherwise
    // only be audible through headphones.
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';

    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    // Resume in the background — the context is created inside the user gesture, so it
    // will unlock. Do NOT await it: on a first-visit HTTPS origin resume() can stay
    // pending until the gesture fully settles, which would block opening the experience.
    void this.ctx.resume().catch(() => {});
    this.audio = new AudioEngine(this.ctx);
    this.startedAtPerf = performance.now();

    // Sync to the server clock so global/shared points are timed identically on
    // every device. Non-blocking: global points use the device clock until this
    // resolves (a fraction of a second), then snap into shared sync.
    void syncServerTime().then((offset) => {
      this.serverOffset = offset;
    });

    if (this.sim) {
      this.initSim();
    } else {
      this.status.insecure = !isSecureEnough();
      this.headingWatch = watchHeading();
      this.geoWatch = watchUserPosition(
        (fix) => {
          this.userLive = fix.coords;
          this.accuracy = fix.accuracy;
          // Anchor the GPS-course fallback (used when there's no magnetic compass).
          this.headingWatch?.feedGps(fix.heading, fix.speed);
          this.status.geoError = null;
        },
        (err) => {
          this.status.geoError = geoErrorMessage(err);
        }
      );
      // Request the compass permission (on iOS this consumes the gesture activation).
      // Listeners are already attached, so events flow once granted; a denial simply
      // leaves us on the GPS course-over-ground fallback.
      requestOrientationPermission().then((result) => {
        if (result === 'denied') this.orientationDenied = true;
      });
    }
  }

  /** Current server-synced wall-clock time in ms (for global/shared points). */
  private syncedNow(): number {
    return Date.now() + this.serverOffset;
  }

  /** Resolve every point for now, update audio, return the drawable frame. */
  tick(): FrameState {
    const nowPerf = performance.now();
    const deviceClockSec = (nowPerf - this.startedAtPerf) / 1000;
    // Inter-frame delta for integrated movers (chase, wait-for-listener). Clamp so a
    // backgrounded tab doesn't teleport them on the first frame back.
    const dtSec = this.lastTickPerf ? Math.min(0.5, (nowPerf - this.lastTickPerf) / 1000) : 0;
    this.lastTickPerf = nowPerf;

    // Live heading: poll the fused compass/GPS-course provider, smooth it, and reflect
    // the source in the status chip (ok = magnetic compass, gps = course-over-ground).
    if (!this.sim) {
      const cur = this.headingWatch?.current();
      if (cur?.deg != null) this.headingLive = smoothHeading(this.headingLive, cur.deg);
      this.status.compass =
        cur?.source === 'compass'
          ? 'ok'
          : cur?.source === 'fused' || cur?.source === 'gps'
            ? 'gps'
            : this.orientationDenied
              ? 'denied'
              : deviceClockSec > 3
                ? 'unavailable'
                : this.status.compass;
    }

    const user = this.sim ? this.userSim : this.userLive;
    const headingDeg = this.sim ? this.headingSim : this.headingLive;
    const accuracy = this.sim ? null : this.accuracy;

    if (!user) {
      this.audio?.update([]);
      return {
        user: null, headingDeg, accuracy, blips: [], sources: [], waypoints: [],
        zoneName: null, audibleCount: 0,
      };
    }

    // Acoustic zone: fire setZone only when the enclosing zone changes.
    const zone = zoneAt(this.zones, user);
    if ((zone?.id ?? null) !== this.lastZoneId) {
      this.lastZoneId = zone?.id ?? null;
      this.audio?.setZone(zone);
    }

    const heading = headingDeg ?? 0;
    // Listener speed (smoothed + jitter-clamped) drives the hold-still gate.
    const rawSpeed = this.prevUser && dtSec > 0 ? calculateDistance(this.prevUser, user) / dtSec : 0;
    this.smoothedSpeed = this.smoothedSpeed * 0.7 + Math.min(rawSpeed, 15) * 0.3;
    this.prevUser = user;
    const userSpeed = this.smoothedSpeed;
    const frame: FrameSource[] = [];
    const blips: Blip[] = [];
    const sources: MapSource[] = [];
    const waypoints: Waypoint[] = [];
    // The first point's own elapsed time, captured in the loop, for the start-return ETA.
    let firstGuideElapsed: number | null = null;
    // Flags raised this frame are merged in AFTER the loop so ordering is irrelevant
    // (a gated point reacts on the next frame — imperceptible).
    const raised: string[] = [];
    // Flags to lock this frame from exclusive-group choices (the branches not taken).
    const lockNow: string[] = [];
    // Groups already committed this frame — so a same-frame tie has one winner (the
    // first point, i.e. lowest creation order) rather than mutually cancelling out.
    const committedGroups = new Set<string>();

    for (const point of this.points) {
      // Global/shared points are clocked from the server-synced wall clock (anchored
      // at startAt) so every device computes the same position AND the same point in
      // the audio loop. Individual points use this device's own clock.
      const startAt = isGloballyTimed(point) ? point.startAt : undefined;
      const clockSec = startAt != null ? (this.syncedNow() - startAt) / 1000 : deviceClockSec;

      let state = this.stateMemory.get(point.id);
      if (!state) {
        state = { triggeredAtSec: null };
        this.stateMemory.set(point.id, state);
      }
      const r = resolveSource(point, { user, clockSec, dtSec, heading, userSpeed, state, flags: this.flags });
      this.stateMemory.set(point.id, r.state);
      // Visiting (hearing) a point raises its story flags for the rest of the session.
      // For an exclusive group the first sibling reached commits and locks the others'
      // flags (excluding any flag it sets itself, so a shared flag isn't self-locked).
      if (r.audible && point.setsFlags && point.setsFlags.length > 0) {
        if (point.flagGroup) {
          if (!committedGroups.has(point.flagGroup)) {
            committedGroups.add(point.flagGroup);
            raised.push(...point.setsFlags);
            const mine = new Set(point.setsFlags);
            for (const other of this.points) {
              if (other !== point && other.flagGroup === point.flagGroup && other.setsFlags) {
                for (const f of other.setsFlags) if (!mine.has(f)) lockNow.push(f);
              }
            }
          }
          // else: a lower-order sibling already won this group this frame — skip.
        } else {
          raised.push(...point.setsFlags);
        }
      }

      const radius = audibleRadiusOf(point);
      // A distance of 0 means the source rides on the user (follow_user): keep it
      // centered rather than panning off the placeholder bearing.
      const az = r.distance === 0 ? 0 : relativeBearing(r.bearing, heading);
      const gain = r.audible ? attenuation(r.distance, radius, point.volume) : 0;

      // Spatial polish: Doppler on movers, air-absorption + elevation on everything.
      const prevDist = this.prevDistance.get(point.id);
      this.prevDistance.set(point.id, r.distance);
      const isMover =
        point.type === 'path' ||
        point.type === 'static_circling' ||
        point.type === 'path_triggered' ||
        (point.type === 'follow_user' && (point.mode ?? 'attach') !== 'attach');
      const playbackRate = isMover ? dopplerRate(r.distance, prevDist ?? null, dtSec) : 1;
      const elevation = elevationRad(point.height ?? 0, r.distance);
      // Occlusion: each acoustic-zone wall between listener and source muffles it further.
      let walls = 0;
      if (r.position && this.zones.length > 0) {
        for (const z of this.zones) walls += polygonCrossings(user, r.position, z.polygon);
      }
      const air = airCutoffHz(r.distance, radius);
      const cutoffHz =
        walls > 0 ? Math.min(air, Math.max(260, Math.round(2200 * Math.pow(0.42, walls)))) : air;

      if (r.audible) {
        blips.push({ id: point.id, name: point.name, az, distance: r.distance, audibleRadius: radius, gain });
      }
      // Wayfinding: a compass cue to this sound even when it's out of earshot.
      if (
        (point.type === 'path' || point.type === 'path_triggered') &&
        point.showWayfinding &&
        r.position
      ) {
        waypoints.push({
          id: point.id,
          name: point.name,
          az,
          distance: r.distance,
          audible: r.audible,
          kind: 'sound',
        });
      }
      // Capture the first point's own elapsed time (for the start-return ETA below).
      // A wait-for-listener guide advances on its leash progress, not the wall clock,
      // so feed progressSec there — otherwise the ETA counts down while it's frozen.
      if (point === this.points[0]) {
        if (point.type === 'path') {
          firstGuideElapsed = point.waitForListener ? r.state.progressSec ?? 0 : clockSec;
        } else if (point.type === 'path_triggered') {
          if (r.state.triggeredAtSec == null) firstGuideElapsed = 0;
          else
            firstGuideElapsed = point.waitForListener
              ? r.state.progressSec ?? 0
              : clockSec - r.state.triggeredAtSec;
        }
      }
      sources.push({
        id: point.id,
        name: point.name,
        type: point.type,
        position: r.position,
        audible: r.audible,
        gain,
        audibleRadius: radius,
      });
      // For a global source, seek playback to the shared loop position; undefined = start at 0.
      const startOffsetSec = startAt != null ? clockSec : undefined;

      if (
        (point.type === 'path' || point.type === 'path_triggered') &&
        point.stops &&
        point.stops.length > 0
      ) {
        // Guided tour: the traveling voice plays while moving (and during silent
        // dwells); it yields to a stop's narration while dwelling there. Each stop's
        // clip is its own voice, audible only during its dwell, and plays once.
        const narrating = !!(r.atStop && r.atStop.audio);
        frame.push({
          id: point.id,
          url: absoluteAudioUrl(point.audio.url),
          playback: point.playback,
          audible: r.audible && !narrating,
          az,
          elevation,
          gain,
          playbackRate,
          cutoffHz,
          startOffsetSec,
        });
        for (const s of point.stops) {
          if (!s.audio) continue;
          frame.push({
            id: `${point.id}::stop::${s.index}`,
            url: absoluteAudioUrl(s.audio.url),
            playback: { loop: false, stopAfter: false, reload: false },
            audible: r.audible && r.atStop?.index === s.index,
            az,
            elevation,
            gain,
            playbackRate,
            cutoffHz,
          });
        }
      } else {
        frame.push({
          id: point.id,
          url: absoluteAudioUrl(point.audio.url),
          playback: point.playback,
          audible: r.audible,
          az,
          elevation,
          gain,
          playbackRate,
          cutoffHz,
          startOffsetSec,
        });
      }
    }

    for (const f of lockNow) this.locked.add(f);
    for (const f of raised) if (!this.locked.has(f)) this.flags.add(f);

    // Course start cue: always show the way (+ distance, + guide-return ETA) to the
    // start point — the first point, or its first path vertex.
    const first = this.points[0];
    if (this.showStartWayfinding && first) {
      const start = anchorOf(first);
      const dStart = calculateDistance(user, start);
      const azStart = dStart === 0 ? 0 : relativeBearing(calculateBearing(user, start), heading);
      const eta = firstGuideElapsed != null ? secondsUntilAtStart(first, firstGuideElapsed) : null;
      waypoints.push({
        id: '__start__',
        name: 'Start',
        az: azStart,
        distance: dStart,
        audible: false,
        kind: 'start',
        etaSec: eta ?? undefined,
      });
    }

    // Eyes-up sonar: ping toward the nearest not-yet-heard point (faster as you close
    // in), plus a brighter earcon whenever a new point comes into earshot.
    if (this.eyesUp && this.audio) {
      let target: MapSource | null = null;
      let best = Infinity;
      for (const s of sources) {
        if (s.audible || !s.position) continue;
        const d = calculateDistance(user, s.position);
        if (d < best) {
          best = d;
          target = s;
        }
      }
      if (target?.position) {
        const az = relativeBearing(calculateBearing(user, target.position), heading);
        const radius = target.audibleRadius || 50;
        const interval = Math.max(220, Math.min(1600, 220 + Math.max(0, best - radius) * 12));
        if (nowPerf - this.lastPingAt >= interval) {
          this.lastPingAt = nowPerf;
          this.audio.ping(az, 'nav');
        }
      }
      if (blips.length > this.lastAudibleCount) this.audio.ping(0, 'arrive');
    }
    this.lastAudibleCount = blips.length;

    this.audio?.update(frame);
    return {
      user, headingDeg, accuracy, blips, sources, waypoints,
      zoneName: zone?.name ?? null, audibleCount: blips.length,
    };
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  setMuted(muted: boolean): void {
    this.audio?.setMuted(muted);
  }

  dispose(): void {
    this.geoWatch?.stop();
    this.headingWatch?.stop();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.audio?.dispose();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.audio = null;
  }

  // --- Simulation controls -------------------------------------------------

  isSim(): boolean {
    return this.sim;
  }

  getHeadingSim(): number {
    return this.headingSim;
  }

  setHeadingSim(deg: number): void {
    this.headingSim = ((deg % 360) + 360) % 360;
  }

  /** Translate the simulated user by a screen-space drag on the radar (heading-up). */
  nudgeScreen(dxPx: number, dyPx: number): void {
    if (!this.sim) return;
    const meters = Math.hypot(dxPx, dyPx) * SIM_DRAG_M_PER_PX;
    if (meters === 0) return;
    const screenAngle = (Math.atan2(dxPx, -dyPx) * 180) / Math.PI; // clockwise from up
    const bearing = (this.headingSim + screenAngle + 360) % 360;
    this.userSim = destinationPoint(this.userSim, bearing, meters);
  }

  private initSim(): void {
    const anchor = this.points.length > 0 ? anchorOf(this.points[0]) : FALLBACK_ORIGIN;
    this.userSim = anchor;
    this.headingSim = 0;

    this.keyHandler = (e: KeyboardEvent) => {
      let bearing: number | null = null;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          bearing = this.headingSim;
          break;
        case 's':
        case 'arrowdown':
          bearing = this.headingSim + 180;
          break;
        case 'a':
        case 'arrowleft':
          bearing = this.headingSim - 90;
          break;
        case 'd':
        case 'arrowright':
          bearing = this.headingSim + 90;
          break;
        case 'q':
          this.setHeadingSim(this.headingSim - SIM_TURN_DEG);
          e.preventDefault();
          return;
        case 'e':
          this.setHeadingSim(this.headingSim + SIM_TURN_DEG);
          e.preventDefault();
          return;
        default:
          return;
      }
      this.userSim = destinationPoint(this.userSim, ((bearing % 360) + 360) % 360, SIM_STEP_M);
      e.preventDefault();
    };
    window.addEventListener('keydown', this.keyHandler);
  }
}

function toSnapshot(f: FrameState, status: EngineStatus): Snapshot {
  return {
    ...status,
    audibleCount: f.audibleCount,
    lat: f.user?.lat ?? null,
    lng: f.user?.lng ?? null,
    accuracy: f.accuracy,
    headingDeg: f.headingDeg,
    zone: f.zoneName,
  };
}

/**
 * Drives the engine's animation frame loop. The high-rate frame lives in a ref
 * (read by the canvas radar) while a throttled digest feeds React chrome.
 */
export function useExperience(engine: ExperienceEngine) {
  const frameRef = useRef<FrameState>({
    user: null,
    headingDeg: null,
    accuracy: null,
    blips: [],
    sources: [],
    waypoints: [],
    zoneName: null,
    audibleCount: 0,
  });
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    toSnapshot(frameRef.current, engine.getStatus())
  );
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    const loop = () => {
      const frame = engine.tick();
      frameRef.current = frame;
      const now = performance.now();
      if (now - lastPush > 150) {
        lastPush = now;
        setSnapshot(toSnapshot(frame, engine.getStatus()));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      engine.setMuted(next);
      return next;
    });
  }, [engine]);

  return { frameRef, snapshot, muted, toggleMute };
}
