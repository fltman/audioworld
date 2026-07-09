import type { AcousticZone, AudioPoint, Coordinates, SourceState } from '@audioworld/shared';
import {
  airCutoffHz,
  attenuation,
  audibleRadiusOf,
  destinationPoint,
  dopplerRate,
  elevationRad,
  isGloballyTimed,
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

export interface PreviewFrame {
  listener: Coordinates;
  heading: number;
  audible: PreviewBlip[];
}

const STEP_M = 4;

/**
 * In-admin playtest: a virtual listener placed on the map. Runs the exact same
 * spatial resolution (resolveSource) and audio engine as the client, so authors
 * can hear a course while editing. No geolocation/compass — position + heading
 * are driven from the map and keyboard.
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
  private points: AudioPoint[];
  private zones: AcousticZone[] = [];
  private lastZoneId: string | null = null;

  listener: Coordinates;
  heading = 0;

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
  setListener(c: Coordinates): void {
    this.listener = c;
  }
  setHeading(deg: number): void {
    this.heading = ((deg % 360) + 360) % 360;
  }
  turn(delta: number): void {
    this.setHeading(this.heading + delta);
  }
  /** Walk `meters` along a bearing (defaults to STEP_M in the current heading). */
  walk(bearingDeg: number, meters = STEP_M): void {
    this.listener = destinationPoint(this.listener, ((bearingDeg % 360) + 360) % 360, meters);
  }
  /** Re-arm triggers + flags and restart the local clock (fresh playthrough). */
  reset(): void {
    this.stateMemory.clear();
    this.flags.clear();
    this.locked.clear();
    this.prevDistance.clear();
    this.lastTickPerf = 0;
    this.lastZoneId = null;
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
    const user = this.listener;
    const heading = this.heading;
    const frame: FrameSource[] = [];
    const audible: PreviewBlip[] = [];
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
      const r = resolveSource(point, { user, clockSec, dtSec, heading, state, flags: this.flags });
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
      const gain = r.audible ? attenuation(r.distance, radius, point.volume) : 0;

      const prevDist = this.prevDistance.get(point.id);
      this.prevDistance.set(point.id, r.distance);
      const isMover =
        point.type === 'path' ||
        point.type === 'static_circling' ||
        point.type === 'path_triggered' ||
        (point.type === 'follow_user' && (point.mode ?? 'attach') !== 'attach');
      const playbackRate = isMover ? dopplerRate(r.distance, prevDist ?? null, dtSec) : 1;
      const cutoffHz = airCutoffHz(r.distance, radius);
      const elevation = elevationRad(point.height ?? 0, r.distance);

      if (r.audible) {
        audible.push({ id: point.id, name: point.name, distance: r.distance, az, gain });
      }
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
    return { listener: user, heading, audible };
  }

  dispose(): void {
    this.audio?.dispose();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.audio = null;
  }
}
