import {
  AudioEngine,
  DEFAULT_AMBIENCE_VOLUME,
  attenuation,
  audibleRadiusOf,
  type AcousticZone,
  type AudioPoint,
  type FrameSource,
} from '@audioworld/shared';
import { absoluteAudioUrl } from '../api';

/** What the zone colours while previewing: a synthesized clap, one of the course's own
 *  sounds (to judge the background against), or nothing but the background itself. */
export type TestSound = 'clap' | 'none' | { point: AudioPoint };

let clapUrl: string | null = null;

/** A dry hand-clap as a WAV blob, so it plays through the engine (and its reverb) like any clip. */
function clap(): string {
  if (clapUrl) return clapUrl;
  const rate = 44100;
  const n = Math.round(rate * 0.25);
  const samples = new Float32Array(n);
  // A clap is a few noise bursts milliseconds apart, then a short decay; band-limit
  // the noise (one-pole low + high pass) so it sounds like hands, not hiss.
  const bursts = [0, 0.009, 0.019];
  const aLow = 1 - Math.exp((-2 * Math.PI * 3000) / rate);
  const aHigh = Math.exp((-2 * Math.PI * 700) / rate);
  let low = 0;
  let lowPrev = 0;
  let high = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let env = t >= 0.019 ? 0.5 * Math.exp(-(t - 0.019) / 0.04) : 0;
    for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) / 0.006));
    low += aLow * ((Math.random() * 2 - 1) * env - low);
    high = aHigh * (high + low - lowPrev);
    lowPrev = low;
    samples[i] = high;
    peak = Math.max(peak, Math.abs(high));
  }
  const wav = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) wav.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  wav.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true); // PCM
  wav.setUint16(22, 1, true); // mono
  wav.setUint32(24, rate, true);
  wav.setUint32(28, rate * 2, true);
  wav.setUint16(32, 2, true);
  wav.setUint16(34, 16, true);
  text(36, 'data');
  wav.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.round((samples[i]! / peak) * 0.9 * 32767), true);
  clapUrl = URL.createObjectURL(new Blob([wav.buffer], { type: 'audio/wav' }));
  return clapUrl;
}

function testSource(sound: TestSound): FrameSource | null {
  if (sound === 'none') return null;
  if (sound === 'clap') {
    return {
      id: 'clap',
      url: clap(),
      playback: { loop: true, stopAfter: false, reload: false, loopGapSec: 1.3 },
      audible: true,
      az: 0,
      gain: 0.6,
    };
  }
  const p = sound.point;
  const radius = audibleRadiusOf(p);
  return {
    id: `point:${p.id}`,
    url: absoluteAudioUrl(p.audio.url),
    playback: { loop: true, stopAfter: false, reload: false },
    audible: true,
    az: 0,
    // As heard a few steps in from the edge of its range, halfway to the source.
    gain: attenuation(radius / 2, radius, p.volume),
  };
}

/**
 * Hear one acoustic zone on its own: its background loop at its volume, and a dry test
 * sound played through its reverb. Edits re-apply live — a slider re-levels in place, a
 * new reverb character or loop cross-fades — so the zone can be tuned by ear.
 */
export class ZonePreview {
  private readonly ctx: AudioContext;
  private readonly audio: AudioEngine;
  private readonly timer: number;
  private readonly sources = new Map<string, FrameSource>();
  private zone: AcousticZone | null = null;

  /** MUST be called from a user gesture (creates + resumes the AudioContext). */
  constructor() {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    void this.ctx.resume().catch(() => {});
    this.audio = new AudioEngine(this.ctx);
    this.timer = window.setInterval(() => this.audio.update([...this.sources.values()]), 100);
  }

  setZone(zone: AcousticZone): void {
    const was = this.zone;
    this.zone = zone;
    if (!was || was.reverb !== zone.reverb || was.ambienceUrl !== zone.ambienceUrl) {
      this.audio.setZone(
        zone.ambienceUrl ? { ...zone, ambienceUrl: absoluteAudioUrl(zone.ambienceUrl) } : zone
      );
      return;
    }
    if (was.wet !== zone.wet) this.audio.setReverbWet(zone.wet);
    if (was.ambienceVolume !== zone.ambienceVolume) {
      this.audio.setAmbienceVolume(zone.ambienceVolume ?? DEFAULT_AMBIENCE_VOLUME);
    }
  }

  setTestSound(sound: TestSound): void {
    // Silence the previous test sound (the engine fades it out) and start the new one.
    for (const s of this.sources.values()) s.audible = false;
    const next = testSource(sound);
    if (next) this.sources.set(next.id, next);
  }

  dispose(): void {
    window.clearInterval(this.timer);
    this.audio.dispose();
    this.ctx.close().catch(() => {});
  }
}
