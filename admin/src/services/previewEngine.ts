import type { AcousticZone, AudioPoint, Coordinates, PointType, SourceState } from '@audioworld/shared';
import {
  airCutoffHz,
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
  zoneAt,
} from '@audioworld/shared';
import { AudioEngine, type FrameSource } from '@audioworld/shared';
import { absoluteAudioUrl, syncServerTime } from '../api';

export interface PreviewBlip {
  id: string;
  name: string;
  distance: number;
  /** Relative azimuth, degrees clockwise from the listener's heading. */
  az: number;
  gain: number;
}

/** Where a source is right now (moving sources travel), for the live map layer. */
export interface PreviewSource {
  id: string;
  name: string;
  type: PointType;
  position: Coordinates | null;
  /** Audible range in metres. */
  radius: number;
  audible: boolean;
  /** Paused at a guided-tour stop. */
  dwelling: boolean;
}

export interface PreviewFrame {
  listener: Coordinates;
  heading: number;
  audible: PreviewBlip[];
  sources: PreviewSource[];
}

/** A movement key the author is holding down. */
export type WalkControl = 'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight';

/** Pace presets, m/s. Walking pace matters: hold-still triggers + Doppler read the speed. */
export const WALK_SPEEDS = { walk: 1.4, jog: 3, bike: 6 } as const;
export type WalkSpeed = keyof typeof WALK_SPEEDS;

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
 * In-admin playtest: a virtual listener walking the map. Runs the exact same
 * spatial resolution (resolveSource) and audio engine as the client, so authors
 * can hear a course while editing. No geolocation/compass — position + heading
 * are driven from the map and keyboard, and the listener moves continuously at a
 * real walking pace (so speed-driven behaviour sounds like it will on the street).
 */
export class PreviewEngine {
  private ctx: AudioContext | null = null;
  private audio: AudioEngine | null = null;
  private startedAtPerf = 0;
  private lastTickPerf = 0;
  private serverOffset = 0;
  private readonly stateMemory = new Map<string, SourceState>();
  private readonly flags = new Set<string>();
  private readonly locked = new Set<string>();
  private readonly prevDistance = new Map<string, number>();
  private prevUser: Coordinates | null = null;
  private smoothedSpeed = 0;
  private points: AudioPoint[];
  private zones: AcousticZone[] = [];
  private lastZoneId: string | null = null;

  private readonly held = new Set<WalkControl>();
  private target: Coordinates | null = null;
  private dragAim: Coordinates | null = null;

  listener: Coordinates;
  heading = 0;
  /** Base pace in m/s (see WALK_SPEEDS). */
  speedMps: number = WALK_SPEEDS.walk;
  /** Shift held: temporarily move SPRINT_FACTOR× faster. */
  sprint = false;
  /** The most recent tick's result, read by the map's render loop. */
  lastFrame: PreviewFrame | null = null;

  constructor(points: AudioPoint[], listener: Coordinates) {
    this.points = points;
    this.listener = listener;
  }

  /** MUST be called from a user gesture (creates + resumes the AudioContext). */
  async start(): Promise<void> {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    void this.ctx.resume().catch(() => {});
    this.audio = new AudioEngine(this.ctx);
    this.startedAtPerf = performance.now();
    void syncServerTime().then((o) => {
      this.serverOffset = o;
    });
  }

  setPoints(points: AudioPoint[]): void {
    this.points = points;
  }
  setZones(zones: AcousticZone[]): void {
    this.zones = zones;
  }
  /** Jump straight to a spot (cancels any walk in progress). */
  setListener(c: Coordinates): void {
    this.listener = c;
    this.target = null;
  }
  /** Follow a drag of the listener marker, facing the way it's being dragged. */
  dragTo(c: Coordinates): void {
    const from = this.dragAim ?? this.listener;
    if (calculateDistance(from, c) >= DRAG_AIM_M) {
      this.setHeading(calculateBearing(from, c));
      this.dragAim = c;
    } else if (!this.dragAim) {
      this.dragAim = from;
    }
    this.setListener(c);
  }
  endDrag(): void {
    this.dragAim = null;
  }
  /** Walk to a spot at the current pace, turning to face it. */
  walkTo(c: Coordinates): void {
    this.target = c;
  }
  press(c: WalkControl): void {
    this.held.add(c);
  }
  release(c: WalkControl): void {
    this.held.delete(c);
  }
  /** Drop every held key (window blur would otherwise leave the listener walking). */
  releaseAll(): void {
    this.held.clear();
    this.sprint = false;
  }
  setHeading(deg: number): void {
    this.heading = ((deg % 360) + 360) % 360;
  }
  turn(delta: number): void {
    this.setHeading(this.heading + delta);
  }

  /** Advance the listener by one frame of held keys / walk-to-target movement. */
  private move(dtSec: number): void {
    if (dtSec <= 0) return;
    const h = this.held;
    const pace = this.speedMps * (this.sprint ? SPRINT_FACTOR : 1);
    const turn = (h.has('turnRight') ? 1 : 0) - (h.has('turnLeft') ? 1 : 0);
    if (turn !== 0) this.setHeading(this.heading + turn * KEY_TURN_DEG_PER_SEC * dtSec);

    const ahead = (h.has('forward') ? 1 : 0) - (h.has('back') ? 1 : 0);
    const side = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    if (ahead !== 0 || side !== 0) {
      // Keys take over from a click-to-walk; the heading stays where the author looks.
      this.target = null;
      const offset = (Math.atan2(side, ahead) * 180) / Math.PI;
      this.listener = destinationPoint(this.listener, (this.heading + offset + 360) % 360, pace * dtSec);
      return;
    }

    if (this.target) {
      const left = calculateDistance(this.listener, this.target);
      if (left <= ARRIVED_M) {
        this.target = null;
        return;
      }
      const bearing = calculateBearing(this.listener, this.target);
      this.heading = approachAngle(this.heading, bearing, FACE_TURN_DEG_PER_SEC * dtSec);
      this.listener = destinationPoint(this.listener, bearing, Math.min(left, pace * dtSec));
    }
  }
  /** Re-arm triggers + flags and restart the local clock (fresh playthrough). */
  reset(): void {
    this.stateMemory.clear();
    this.flags.clear();
    this.locked.clear();
    this.prevDistance.clear();
    this.prevUser = null;
    this.smoothedSpeed = 0;
    this.lastTickPerf = 0;
    this.lastZoneId = null;
    this.target = null;
    this.audio?.setZone(null);
    this.startedAtPerf = performance.now();
  }

  setMuted(muted: boolean): void {
    this.audio?.setMuted(muted);
  }

  private syncedNow(): number {
    return Date.now() + this.serverOffset;
  }

  /** Resolve every point for the current listener, update audio, return audible sources. */
  tick(): PreviewFrame {
    const nowPerf = performance.now();
    const deviceClockSec = (nowPerf - this.startedAtPerf) / 1000;
    const dtSec = this.lastTickPerf ? Math.min(0.5, (nowPerf - this.lastTickPerf) / 1000) : 0;
    this.lastTickPerf = nowPerf;
    this.move(dtSec);
    const user = this.listener;
    const heading = this.heading;
    const rawSpeed =
      this.prevUser && dtSec > 0 ? calculateDistance(this.prevUser, user) / dtSec : 0;
    this.smoothedSpeed = this.smoothedSpeed * 0.7 + Math.min(rawSpeed, 15) * 0.3;
    this.prevUser = user;
    const userSpeed = this.smoothedSpeed;
    const frame: FrameSource[] = [];
    const audible: PreviewBlip[] = [];
    const sources: PreviewSource[] = [];
    const raised: string[] = [];
    const lockNow: string[] = [];
    const committedGroups = new Set<string>();

    const zone = zoneAt(this.zones, user);
    if ((zone?.id ?? null) !== this.lastZoneId) {
      this.lastZoneId = zone?.id ?? null;
      this.audio?.setZone(zone);
    }

    for (const point of this.points) {
      const startAt = isGloballyTimed(point) ? point.startAt : undefined;
      const clockSec = startAt != null ? (this.syncedNow() - startAt) / 1000 : deviceClockSec;
      let state = this.stateMemory.get(point.id);
      if (!state) {
        state = { triggeredAtSec: null };
        this.stateMemory.set(point.id, state);
      }
      const r = resolveSource(point, { user, clockSec, dtSec, heading, userSpeed, state, flags: this.flags });
      this.stateMemory.set(point.id, r.state);
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
        } else {
          raised.push(...point.setsFlags);
        }
      }

      const radius = audibleRadiusOf(point);
      const az = r.distance === 0 ? 0 : relativeBearing(r.bearing, heading);
      const gain = r.audible ? attenuation(r.distance, radius, point.volume) * r.directionalGain : 0;

      const prevDist = this.prevDistance.get(point.id);
      this.prevDistance.set(point.id, r.distance);
      const isMover =
        point.type === 'path' ||
        point.type === 'static_circling' ||
        point.type === 'path_triggered' ||
        (point.type === 'follow_user' && (point.mode ?? 'attach') !== 'attach');
      const playbackRate = isMover ? dopplerRate(r.distance, prevDist ?? null, dtSec) : 1;
      const elevation = elevationRad(point.height ?? 0, r.distance);
      let walls = 0;
      if (r.position && this.zones.length > 0) {
        for (const z of this.zones) walls += polygonCrossings(user, r.position, z.polygon);
      }
      const air = airCutoffHz(r.distance, radius);
      const cutoffHz =
        walls > 0 ? Math.min(air, Math.max(260, Math.round(2200 * Math.pow(0.42, walls)))) : air;

      if (r.audible) {
        audible.push({ id: point.id, name: point.name, distance: r.distance, az, gain });
      }
      sources.push({
        id: point.id,
        name: point.name,
        type: point.type,
        position: r.position,
        radius,
        audible: r.audible,
        dwelling: r.atStop != null,
      });
      const startOffsetSec = startAt != null ? clockSec : undefined;
      if (
        (point.type === 'path' || point.type === 'path_triggered') &&
        point.stops &&
        point.stops.length > 0
      ) {
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

    this.audio?.update(frame);
    this.lastFrame = { listener: user, heading, audible, sources };
    return this.lastFrame;
  }

  dispose(): void {
    this.audio?.dispose();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.audio = null;
  }
}
