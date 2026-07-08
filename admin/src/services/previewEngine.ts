import type { AudioPoint, Coordinates } from '@audioworld/shared';
import {
  attenuation,
  audibleRadiusOf,
  destinationPoint,
  isGloballyTimed,
  relativeBearing,
  resolveSource,
} from '@audioworld/shared';
import { AudioEngine, type FrameSource } from './audioEngine';
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
  private serverOffset = 0;
  private readonly triggerMemory = new Map<string, number | null>();
  private points: AudioPoint[];

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
  /** Re-arm triggers and restart the local clock (fresh playthrough). */
  reset(): void {
    this.triggerMemory.clear();
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
    const deviceClockSec = (performance.now() - this.startedAtPerf) / 1000;
    const user = this.listener;
    const heading = this.heading;
    const frame: FrameSource[] = [];
    const audible: PreviewBlip[] = [];

    for (const point of this.points) {
      const startAt = isGloballyTimed(point) ? point.startAt : undefined;
      const clockSec = startAt != null ? (this.syncedNow() - startAt) / 1000 : deviceClockSec;
      const memory = this.triggerMemory.get(point.id) ?? null;
      const r = resolveSource(point, { user, clockSec, triggeredAtSec: memory });
      this.triggerMemory.set(point.id, r.triggeredAtSec);

      const radius = audibleRadiusOf(point);
      const az = r.distance === 0 ? 0 : relativeBearing(r.bearing, heading);
      const gain = r.audible ? attenuation(r.distance, radius, point.volume) : 0;

      if (r.audible) {
        audible.push({ id: point.id, name: point.name, distance: r.distance, az, gain });
      }
      const startOffsetSec = startAt != null ? clockSec : undefined;
      if (point.type === 'path' && point.stops && point.stops.length > 0) {
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
    return { listener: user, heading, audible };
  }

  dispose(): void {
    this.audio?.dispose();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.audio = null;
  }
}
