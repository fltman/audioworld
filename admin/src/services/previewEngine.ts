import type { AcousticZone, AudioPoint, Coordinates, PointType, SourceState } from '@audioworld/shared';
import {
  airCutoffHz,
  attenuation,
  audibleRadiusOf,
  calculateDistance,
  dopplerRate,
  elevationRad,
  isGloballyTimed,
  polygonCrossings,
  relativeBearing,
  resolveSource,
  zoneAt,
} from '@audioworld/shared';
import {
  AudioEngine,
  DEFAULT_AMBIENCE_VOLUME,
  SimWalker,
  type FrameSource,
  type WalkControl,
} from '@audioworld/shared';
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
  /** The acoustic zone the listener is standing in, if any. */
  zoneId: string | null;
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

  /** The virtual listener: walks with held keys, to a clicked spot, or along a drag. */
  private readonly walker: SimWalker;
  /** The most recent tick's result, read by the map's render loop. */
  lastFrame: PreviewFrame | null = null;

  constructor(points: AudioPoint[], listener: Coordinates) {
    this.points = points;
    this.walker = new SimWalker(listener);
  }

  get listener(): Coordinates {
    return this.walker.position;
  }
  get heading(): number {
    return this.walker.heading;
  }
  /** Base pace in m/s (see WALK_SPEEDS). */
  get speedMps(): number {
    return this.walker.speedMps;
  }
  set speedMps(v: number) {
    this.walker.speedMps = v;
  }
  /** Shift held: temporarily move faster. */
  get sprint(): boolean {
    return this.walker.sprint;
  }
  set sprint(v: boolean) {
    this.walker.sprint = v;
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
    // Mixing the zone you're standing in: re-level its ambient bed live.
    const here = this.lastZoneId ? zones.find((z) => z.id === this.lastZoneId) : undefined;
    if (here) this.audio?.setAmbienceVolume(here.ambienceVolume ?? DEFAULT_AMBIENCE_VOLUME);
  }
  /** Jump straight to a spot (cancels any walk in progress). */
  setListener(c: Coordinates): void {
    this.walker.setPosition(c);
  }
  /** Follow a drag of the listener marker, facing the way it's being dragged. */
  dragTo(c: Coordinates): void {
    this.walker.dragTo(c);
  }
  endDrag(): void {
    this.walker.endDrag();
  }
  /** Walk to a spot at the current pace, turning to face it. */
  walkTo(c: Coordinates): void {
    this.walker.walkTo(c);
  }
  press(c: WalkControl): void {
    this.walker.press(c);
  }
  release(c: WalkControl): void {
    this.walker.release(c);
  }
  /** Drop every held key (window blur would otherwise leave the listener walking). */
  releaseAll(): void {
    this.walker.releaseAll();
  }
  setHeading(deg: number): void {
    this.walker.setHeading(deg);
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
    this.walker.cancelWalk();
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
    this.walker.step(dtSec);
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
      this.audio?.setZone(
        zone?.ambienceUrl ? { ...zone, ambienceUrl: absoluteAudioUrl(zone.ambienceUrl) } : zone
      );
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
    this.lastFrame = { listener: user, heading, audible, sources, zoneId: this.lastZoneId };
    return this.lastFrame;
  }

  dispose(): void {
    this.audio?.dispose();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.audio = null;
  }
}
