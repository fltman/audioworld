import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioPoint, Coordinates, PointType } from '@audioworld/shared';
import {
  anchorOf,
  attenuation,
  audibleRadiusOf,
  destinationPoint,
  isGloballyTimed,
  relativeBearing,
  resolveSource,
} from '@audioworld/shared';
import { absoluteAudioUrl, syncServerTime } from '../api';
import { AudioEngine, type FrameSource } from '@audioworld/shared';
import { geoErrorMessage, isSecureEnough, watchUserPosition, type GeoWatch } from './geolocation';
import { requestOrientationPermission, watchHeading, type OrientationWatch } from './orientation';

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

/** Everything the HUD renders for one animation frame. */
export interface FrameState {
  user: Coordinates | null;
  headingDeg: number | null;
  accuracy: number | null;
  blips: Blip[];
  sources: MapSource[];
  audibleCount: number;
}

export interface EngineStatus {
  mode: 'live' | 'sim';
  geoError: string | null;
  compass: 'ok' | 'unavailable' | 'denied' | 'sim';
  insecure: boolean;
}

/** React-friendly digest pushed a few times a second for the surrounding chrome. */
export interface Snapshot extends EngineStatus {
  audibleCount: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  headingDeg: number | null;
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
}

/**
 * Owns the live inputs (GPS + compass, or simulated), the trigger memory and the
 * audio graph. `tick()` resolves every point for the current instant, updates the
 * audio and returns the frame the HUD should draw — a single source of truth.
 */
export class ExperienceEngine {
  private readonly points: AudioPoint[];
  private readonly sim: boolean;
  private readonly triggerMemory = new Map<string, number | null>();

  private ctx: AudioContext | null = null;
  private audio: AudioEngine | null = null;
  private startedAtPerf = 0;
  /** ms to add to Date.now() to match the server clock (for global/shared points). */
  private serverOffset = 0;

  private geoWatch: GeoWatch | null = null;
  private orientationWatch: OrientationWatch | null = null;
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
      this.geoWatch = watchUserPosition(
        (fix) => {
          this.userLive = fix.coords;
          this.accuracy = fix.accuracy;
          this.status.geoError = null;
        },
        (err) => {
          this.status.geoError = geoErrorMessage(err);
        }
      );
      // Kick off the compass; on iOS this consumes the gesture activation.
      requestOrientationPermission().then((result) => {
        if (result === 'denied') {
          this.status.compass = 'denied';
          return;
        }
        this.orientationWatch = watchHeading(
          (deg) => {
            this.headingLive = smoothHeading(this.headingLive, deg);
            this.status.compass = 'ok';
          },
          (s) => {
            if (s !== 'ok') this.status.compass = s;
          }
        );
      });
    }
  }

  /** Current server-synced wall-clock time in ms (for global/shared points). */
  private syncedNow(): number {
    return Date.now() + this.serverOffset;
  }

  /** Resolve every point for now, update audio, return the drawable frame. */
  tick(): FrameState {
    const deviceClockSec = (performance.now() - this.startedAtPerf) / 1000;
    const user = this.sim ? this.userSim : this.userLive;
    const headingDeg = this.sim ? this.headingSim : this.headingLive;
    const accuracy = this.sim ? null : this.accuracy;

    if (!user) {
      this.audio?.update([]);
      return { user: null, headingDeg, accuracy, blips: [], sources: [], audibleCount: 0 };
    }

    const heading = headingDeg ?? 0;
    const frame: FrameSource[] = [];
    const blips: Blip[] = [];
    const sources: MapSource[] = [];

    for (const point of this.points) {
      // Global/shared points are clocked from the server-synced wall clock (anchored
      // at startAt) so every device computes the same position AND the same point in
      // the audio loop. Individual points use this device's own clock.
      const startAt = isGloballyTimed(point) ? point.startAt : undefined;
      const clockSec = startAt != null ? (this.syncedNow() - startAt) / 1000 : deviceClockSec;

      const memory = this.triggerMemory.get(point.id) ?? null;
      const r = resolveSource(point, { user, clockSec, triggeredAtSec: memory });
      this.triggerMemory.set(point.id, r.triggeredAtSec);

      const radius = audibleRadiusOf(point);
      // A distance of 0 means the source rides on the user (follow_user): keep it
      // centered rather than panning off the placeholder bearing.
      const az = r.distance === 0 ? 0 : relativeBearing(r.bearing, heading);
      const gain = r.audible ? attenuation(r.distance, radius, point.volume) : 0;

      if (r.audible) {
        blips.push({ id: point.id, name: point.name, az, distance: r.distance, audibleRadius: radius, gain });
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
          gain,
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
            gain,
          });
        }
      } else {
        frame.push({
          id: point.id,
          url: absoluteAudioUrl(point.audio.url),
          playback: point.playback,
          audible: r.audible,
          az,
          gain,
          startOffsetSec,
        });
      }
    }

    this.audio?.update(frame);
    return { user, headingDeg, accuracy, blips, sources, audibleCount: blips.length };
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  setMuted(muted: boolean): void {
    this.audio?.setMuted(muted);
  }

  dispose(): void {
    this.geoWatch?.stop();
    this.orientationWatch?.stop();
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
