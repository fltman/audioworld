import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AcousticZone,
  AnalyticsReport,
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
  pickClipUrl,
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

// The listener's language preferences, most-preferred first — drives localized
// narration: a point plays the clip matching the device language, else its default.
const DEVICE_LANGS: readonly string[] =
  typeof navigator !== 'undefined'
    ? navigator.languages ?? (navigator.language ? [navigator.language] : [])
    : [];

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

// --- Power governor tuning ---
/** active: full rAF. saver: throttled (low battery). pocket: audio-only while hidden. */
export type PowerMode = 'active' | 'saver' | 'pocket';
const ACTIVE_PUSH_MS = 150; // React snapshot cadence at full power
const SAVER_TICK_MS = 66; // ~15 Hz engine ticks when the battery is low
const SAVER_PUSH_MS = 300; // slower chrome updates in saver mode
const POCKET_TICK_MS = 400; // audio-only tick rate while the screen is off / hidden

interface BatteryLike {
  charging: boolean;
  level: number;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}
interface NavigatorBattery {
  getBattery?: () => Promise<BatteryLike>;
}
const SIM_TURN_DEG = 15;
const SIM_DRAG_M_PER_PX = 0.6;
const HEADING_SMOOTH = 0.25;

// --- GPS glitch shield ---
// One urban-canyon multipath jump can teleport the listener tens of metres and
// permanently commit a crossroads (locked flags never re-raise) or fire a one-shot
// scare. These gate the raw fix stream and irreversible commits without making normal
// walking feel laggy. Sim mode bypasses all of it.
// Only egregious (cell-tower-grade) fixes are hard-dropped for accuracy — 40-90 m is
// routine under tree canopy / in urban canyons where these walks run, and rejecting it
// would throttle position updates to a stutter. The teleport (implied-speed) gate does
// the real glitch-catching; accuracy just filters the truly useless fixes.
const MAX_FIX_ACCURACY_M = 120;
const MAX_FIX_SPEED_MPS = 12; // a fix implying a jump faster than ~43 km/h is a glitch
const GPS_REJECT_TOLERANCE = 3; // accept after this many rejects (a real GPS re-lock)
const MAX_FIX_GAP_SEC = 2; // cap the dt used for the teleport check so held rejects
//                            don't loosen the speed bound without limit
const GPS_STALE_MS = 10_000; // warn when no good fix has landed for this long
const COMMIT_DWELL_MS = 1500; // sustained audibility required before an exclusive commit

function smoothHeading(prev: number | null, next: number): number {
  if (prev === null) return next;
  const delta = ((next - prev + 540) % 360) - 180;
  return (prev + delta * HEADING_SMOOTH + 360) % 360;
}

/**
 * A serialized run: everything needed to resume a walk after a reload / tab-kill so
 * story flags, crossroads commitments, one-shot triggers and progress survive. All
 * plain JSON (Sets/Maps flattened) so it round-trips through localStorage.
 */
export interface RunSnapshot {
  /** Schema version, so an incompatible old snapshot is ignored rather than misread. */
  v: number;
  /** Device-clock seconds elapsed at save time — re-anchors the session clock on resume. */
  clockSec: number;
  flags: string[];
  locked: string[];
  reached: string[];
  sentReached: string[];
  state: Record<string, SourceState>;
  /** Epoch ms of the save, for freshness (a very old run isn't offered for resume). */
  savedAt: number;
}

const RUN_SNAPSHOT_VERSION = 1;

export interface EngineOptions {
  points: AudioPoint[];
  sim: boolean;
  /** Show a compass cue + distance (+ return ETA) to the course start point. */
  showStartWayfinding?: boolean;
  /** Acoustic zones (reverb + ambient beds) for the course. */
  zones?: AcousticZone[];
  /** Eyes-up sonar navigation (hide the radar, ping toward the next point). */
  eyesUp?: boolean;
  /** localStorage key under which to persist run state (omit to disable persistence). */
  persistKey?: string;
  /** A prior snapshot to resume from (its flags/locks/progress are restored). */
  resume?: RunSnapshot;
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
  /** Anonymous analytics (live only): coarse grid cell → seconds dwelt, + points heard. */
  private readonly visitedCells = new Map<string, number>();
  private readonly reachedPoints = new Set<string>();
  /** Point ids already reported in a prior flush, so re-flushing can't double-count. */
  private readonly sentReached = new Set<string>();
  /** Per-point movement/trigger memory the resolver reads + writes each frame. */
  private readonly stateMemory = new Map<string, SourceState>();
  /** Story flags raised on THIS device (set by visited points, gate other points). */
  private readonly flags = new Set<string>();
  /** Flags permanently locked by an exclusive-group choice — can never be raised. */
  private readonly locked = new Set<string>();
  /** Previous-frame distance per point, for Doppler radial velocity. */
  private readonly prevDistance = new Map<string, number>();
  /** Sim-mode speed: per-frame from discrete key steps (GPS path uses fixes instead). */
  private prevUser: Coordinates | null = null;
  private smoothedSpeed = 0;
  /** Live speed for the hold-still gate, derived from GPS fixes (~1 Hz), not RAF frames. */
  private userSpeedLive = 0;
  private prevFix: { coords: Coordinates; t: number } | null = null;
  /** GPS glitch shield: last accepted fix time + consecutive-reject counter. */
  private lastAcceptedFixPerf = 0;
  private rejectStreak = 0;
  /** perf time each point became continuously audible (for the commit dwell gate). */
  private readonly audibleSince = new Map<string, number>();

  private ctx: AudioContext | null = null;
  private audio: AudioEngine | null = null;
  private startedAtPerf = 0;
  /** performance.now() of the previous tick, for the inter-frame delta. */
  private lastTickPerf = 0;
  /** ms to add to Date.now() to match the server clock (for global/shared points). */
  private serverOffset = 0;
  /** localStorage key for run persistence (null = disabled), + throttle + resume clock. */
  private readonly persistKey: string | null;
  private resumeClockSec = 0;
  private lastPersistPerf = 0;

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
    this.persistKey = opts.persistKey ?? null;
    this.status = {
      mode: opts.sim ? 'sim' : 'live',
      geoError: null,
      compass: opts.sim ? 'sim' : 'unavailable',
      insecure: false,
    };

    // Resume a prior run: rehydrate progress so flags, crossroads locks, one-shot
    // triggers and per-point progress pick up where the walk left off.
    const r = opts.resume;
    if (r && r.v === RUN_SNAPSHOT_VERSION) {
      this.resumeClockSec = Math.max(0, r.clockSec) || 0;
      for (const f of r.flags) this.flags.add(f);
      for (const f of r.locked) this.locked.add(f);
      for (const id of r.reached) this.reachedPoints.add(id);
      for (const id of r.sentReached) this.sentReached.add(id);
      for (const [id, st] of Object.entries(r.state)) this.stateMemory.set(id, { ...st });
    }
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
    // Anchor the device clock so a resumed run continues from its saved elapsed time
    // (individual-timed points read this clock; global points use the shared wall clock).
    this.startedAtPerf = performance.now() - this.resumeClockSec * 1000;

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
          const now = performance.now();
          // The reported heading/speed can be sound even when the POSITION jumped, and
          // the compass-fallback shouldn't go stale during a reject streak — feed it
          // regardless of whether we accept the position.
          this.headingWatch?.feedGps(fix.heading, fix.speed);
          // Glitch shield: once positioned, drop a fix that's far too inaccurate or
          // that implies an impossible jump — unless several arrive in a row (a genuine
          // GPS re-lock after a tunnel), so we converge instead of freezing forever.
          if (this.userLive && this.prevFix) {
            // Cap dt so a run of held rejects can't keep loosening the speed bound.
            const dt = Math.min(MAX_FIX_GAP_SEC, Math.max(0.25, (now - this.prevFix.t) / 1000));
            const implied = calculateDistance(this.prevFix.coords, fix.coords) / dt;
            const bad =
              (fix.accuracy != null && fix.accuracy > MAX_FIX_ACCURACY_M) ||
              implied > MAX_FIX_SPEED_MPS;
            if (bad && this.rejectStreak < GPS_REJECT_TOLERANCE) {
              this.rejectStreak += 1;
              return; // keep the last good position; don't move on a glitch
            }
          }
          this.rejectStreak = 0;
          this.lastAcceptedFixPerf = now;
          this.userLive = fix.coords;
          this.accuracy = fix.accuracy;
          // Hold-still speed: use the device's own reading, else the fix-to-fix delta
          // over the ELAPSED fix interval (never the render-frame delta).
          let spd = 0;
          if (fix.speed != null && fix.speed >= 0) {
            spd = fix.speed;
          } else if (this.prevFix) {
            spd = calculateDistance(this.prevFix.coords, fix.coords) / Math.max(0.25, (now - this.prevFix.t) / 1000);
          }
          this.userSpeedLive = this.userSpeedLive * 0.5 + Math.min(spd, 15) * 0.5;
          this.prevFix = { coords: fix.coords, t: now };
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

    // GPS staleness: warn (not error) when no good fix has landed for a while, so the
    // listener knows the position may be stale rather than silently trusting it.
    if (
      !this.sim &&
      this.lastAcceptedFixPerf &&
      nowPerf - this.lastAcceptedFixPerf > GPS_STALE_MS &&
      !this.status.geoError
    ) {
      this.status.geoError = 'Weak GPS — your position may be stale';
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
    // Hold-still speed. Sim moves in discrete key steps, so per-frame is fine there;
    // live GPS speed comes from the fix callback (~1 Hz), never the render frame.
    const rawSpeed = this.prevUser && dtSec > 0 ? calculateDistance(this.prevUser, user) / dtSec : 0;
    this.smoothedSpeed = this.smoothedSpeed * 0.7 + Math.min(rawSpeed, 15) * 0.3;
    this.prevUser = user;
    const userSpeed = this.sim ? this.smoothedSpeed : this.userSpeedLive;
    // Anonymous heatmap: accumulate seconds dwelt in each coarse (~11 m) grid cell.
    if (!this.sim) {
      const cell = `${user.lat.toFixed(4)},${user.lng.toFixed(4)}`;
      this.visitedCells.set(cell, (this.visitedCells.get(cell) ?? 0) + dtSec);
    }
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
      // Commit-dwell tracking: how long has this point been continuously audible? A
      // single GPS glitch shouldn't be enough to fire an IRREVERSIBLE exclusive-group
      // choice (locked flags can never re-raise), so that commit waits for sustained
      // audibility. Plain audibility + non-group flags stay instant. Sim bypasses.
      if (r.audible) {
        if (!this.audibleSince.has(point.id)) this.audibleSince.set(point.id, nowPerf);
      } else {
        this.audibleSince.delete(point.id);
      }
      const committable =
        this.sim || (r.audible && nowPerf - (this.audibleSince.get(point.id) ?? nowPerf) >= COMMIT_DWELL_MS);
      // Visiting (hearing) a point raises its story flags for the rest of the session.
      // For an exclusive group the first sibling reached commits and locks the others'
      // flags (excluding any flag it sets itself, so a shared flag isn't self-locked).
      if (r.audible && point.setsFlags && point.setsFlags.length > 0) {
        if (point.flagGroup) {
          if (committable && !committedGroups.has(point.flagGroup)) {
            committedGroups.add(point.flagGroup);
            raised.push(...point.setsFlags);
            const mine = new Set(point.setsFlags);
            for (const other of this.points) {
              if (other !== point && other.flagGroup === point.flagGroup && other.setsFlags) {
                for (const f of other.setsFlags) if (!mine.has(f)) lockNow.push(f);
              }
            }
          }
          // else: not yet sustained, or a lower-order sibling already won — skip.
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
        if (!this.sim) this.reachedPoints.add(point.id);
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
          url: absoluteAudioUrl(pickClipUrl(point.audio, DEVICE_LANGS)),
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
            url: absoluteAudioUrl(pickClipUrl(s.audio, DEVICE_LANGS)),
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
          url: absoluteAudioUrl(pickClipUrl(point.audio, DEVICE_LANGS)),
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

    // Persist the run periodically so a reload / iOS tab-kill mid-walk can resume with
    // flags, crossroads locks and progress intact.
    if (this.persistKey && !this.sim && nowPerf - this.lastPersistPerf > 5000) {
      this.lastPersistPerf = nowPerf;
      this.persist();
    }

    return {
      user, headingDeg, accuracy, blips, sources, waypoints,
      zoneName: zone?.name ?? null, audibleCount: blips.length,
    };
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  /** Snapshot the run's progress so it can be resumed after a reload / tab-kill. */
  serialize(): RunSnapshot {
    return {
      v: RUN_SNAPSHOT_VERSION,
      clockSec: this.startedAtPerf ? (performance.now() - this.startedAtPerf) / 1000 : this.resumeClockSec,
      flags: [...this.flags],
      locked: [...this.locked],
      reached: [...this.reachedPoints],
      sentReached: [...this.sentReached],
      state: Object.fromEntries(this.stateMemory),
      savedAt: Date.now(),
    };
  }

  /** Write the run snapshot to localStorage (no-op for sim or when persistence is off). */
  persist(): void {
    if (!this.persistKey || this.sim) return;
    try {
      localStorage.setItem(this.persistKey, JSON.stringify(this.serialize()));
    } catch {
      /* storage full / disabled — the walk still runs, just won't resume */
    }
  }

  /** Forget any persisted run (on "start over" / completion). */
  clearPersisted(): void {
    if (!this.persistKey) return;
    try {
      localStorage.removeItem(this.persistKey);
    } catch {
      /* ignore */
    }
  }

  /**
   * Drain the anonymous aggregate report accumulated since the last drain. Cells are
   * cleared (the server SUMS dwell across reports, so sending deltas is correct); reached
   * points are sent once (tracked in sentReached) so a mid-walk flush + a final flush
   * can't double-count the funnel. Returns null when there's nothing new to send.
   */
  drainAnalytics(): AnalyticsReport | null {
    const cells = Object.fromEntries(this.visitedCells);
    this.visitedCells.clear();
    const reached: string[] = [];
    for (const id of this.reachedPoints) {
      if (!this.sentReached.has(id)) {
        this.sentReached.add(id);
        reached.push(id);
      }
    }
    if (Object.keys(cells).length === 0 && reached.length === 0) return null;
    return { cells, reached };
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
  const [powerMode, setPowerMode] = useState<PowerMode>('active');

  useEffect(() => {
    let raf = 0;
    let interval: number | null = null;
    let lastPush = 0;
    let lastTick = 0;
    let hidden = document.hidden;
    let lowBattery = false;
    // The getBattery() promise may resolve AFTER this effect is cleaned up; this flag
    // stops its callback from re-arming a zombie loop / leaking battery listeners.
    let cancelled = false;

    const push = (frame: FrameState, gap: number): void => {
      const now = performance.now();
      if (now - lastPush >= gap) {
        lastPush = now;
        setSnapshot(toSnapshot(frame, engine.getStatus()));
      }
    };
    const clearTimers = (): void => {
      if (raf) cancelAnimationFrame(raf);
      if (interval != null) clearInterval(interval);
      raf = 0;
      interval = null;
    };

    // Pick a scheduling strategy from the current visibility + battery state.
    const schedule = (): void => {
      if (cancelled) return;
      clearTimers();
      if (hidden) {
        // Pocket / backgrounded: rAF is frozen while hidden, so keep the SOUND alive
        // with a low-rate timer (spatialization still updates as you walk) and skip all
        // visual work. Best-effort — a fully locked phone may suspend timers entirely.
        setPowerMode('pocket');
        interval = window.setInterval(() => {
          frameRef.current = engine.tick();
        }, POCKET_TICK_MS);
        return;
      }
      setPowerMode(lowBattery ? 'saver' : 'active');
      const tickGap = lowBattery ? SAVER_TICK_MS : 0; // 0 = every frame
      const pushGap = lowBattery ? SAVER_PUSH_MS : ACTIVE_PUSH_MS;
      const loop = (t: number): void => {
        raf = requestAnimationFrame(loop);
        if (t - lastTick < tickGap) return; // throttle ticks to spare the battery
        lastTick = t;
        const frame = engine.tick();
        frameRef.current = frame;
        push(frame, pushGap);
      };
      raf = requestAnimationFrame(loop);
    };

    const onVisibility = (): void => {
      hidden = document.hidden;
      if (!hidden) lastPush = 0; // force an immediate refresh when the screen returns
      schedule();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Battery-driven power saver, where the (non-iOS) Battery API is available.
    let battery: BatteryLike | null = null;
    const onBattery = (): void => {
      const low = !!battery && !battery.charging && battery.level <= 0.2;
      if (low !== lowBattery) {
        lowBattery = low;
        if (!hidden) schedule();
      }
    };
    const getBattery = (navigator as NavigatorBattery).getBattery;
    if (typeof getBattery === 'function') {
      getBattery
        .call(navigator)
        .then((b) => {
          if (cancelled) return; // effect already cleaned up — don't wire a zombie
          battery = b;
          b.addEventListener('levelchange', onBattery);
          b.addEventListener('chargingchange', onBattery);
          onBattery();
        })
        .catch(() => {
          /* no battery info — stay in active/pocket modes only */
        });
    }

    schedule();
    return () => {
      cancelled = true;
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
      if (battery) {
        battery.removeEventListener('levelchange', onBattery);
        battery.removeEventListener('chargingchange', onBattery);
      }
    };
  }, [engine]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      engine.setMuted(next);
      return next;
    });
  }, [engine]);

  return { frameRef, snapshot, muted, toggleMute, powerMode };
}
