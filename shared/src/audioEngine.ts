import type { PlaybackOptions } from './types';

/** Per-frame instruction for one point, produced by the experience engine. */
export interface FrameSource {
  id: string;
  /** Absolute media URL. */
  url: string;
  playback: PlaybackOptions;
  audible: boolean;
  /** Relative azimuth in degrees (0 = dead ahead, +90 = right). */
  az: number;
  /** Elevation angle in radians (+up); places the source above/below on the unit sphere. */
  elevation?: number;
  /** Target loudness 0..1. */
  gain: number;
  /** Doppler playback rate (1 = no shift); recreated sources inherit the last value. */
  playbackRate?: number;
  /** Air-absorption low-pass cutoff in Hz (far = duller); undefined leaves it open. */
  cutoffHz?: number;
  /** For global/shared points: seconds into the shared timeline, so playback starts
   *  at the same point in the loop on every device. Undefined = start at 0. */
  startOffsetSec?: number;
}

interface SourceNode {
  url: string;
  panner: PannerNode;
  /** Distance air-absorption low-pass, between the source and the panner. */
  lowpass: BiquadFilterNode;
  gain: GainNode;
  /** Latest Doppler rate, so a recreated one-shot source starts at the right pitch. */
  rate: number;
  /** Transient — AudioBufferSourceNodes are one-shot, recreated on each (re)start. */
  src: AudioBufferSourceNode | null;
  loop: boolean;
  stopAfter: boolean;
  reload: boolean;
  wasAudible: boolean;
  /** A one-shot (stopAfter) source has finished and should stay silent until re-entry. */
  ended: boolean;
  /** Gap between loop iterations in ms; > 0 = "gapped loop" (one-shots + a restart timer). */
  loopGapMs: number;
  /** Pending restart timer during a loop gap; cleared on silence and in dispose(). */
  gapTimer: number | null;
}

const POS_TC = 0.05; // panner glide
const GAIN_TC = 0.08; // loudness glide
const RATE_TC = 0.06; // Doppler pitch glide
const CUTOFF_TC = 0.08; // air-absorption filter glide

/**
 * Web Audio spatializer built on decoded AudioBuffers. Shared by the client
 * experience and the admin playtest (single source of truth).
 *
 * We deliberately avoid HTMLAudioElement + createMediaElementSource: iOS Safari
 * will only play ONE media-element-backed source at a time, so a soundscape with
 * several audible points collapses to a single voice on iPhone. Decoding each clip
 * to an AudioBuffer and playing it through an AudioBufferSourceNode lets iOS mix
 * many spatialized voices at once.
 *
 * Each point keeps a persistent HRTF panner + gain (panner rolloff = 0; we drive
 * loudness ourselves so distance attenuation matches the HUD). The listener stays
 * at the origin facing -Z and sources sit on the unit circle by relative azimuth,
 * so the mix rotates as the user turns.
 *
 * Browser-only: instantiate this only in a browser (it uses Web Audio + fetch).
 * The module is safe to import in Node (nothing runs at import time).
 */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly nodes = new Map<string, SourceNode>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Set<string>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);
  }

  setMuted(muted: boolean): void {
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** Reconcile the audio graph with this frame's sources. */
  update(sources: FrameSource[]): void {
    const t = this.ctx.currentTime;

    for (const fs of sources) {
      // Lazy: never fetch/build audio for a source the user hasn't reached yet.
      if (!fs.audible && !this.nodes.has(fs.id)) continue;

      const node = this.ensure(fs);
      const gapSec = fs.playback.loopGapSec ?? 0;
      const looping = fs.playback.loop && !fs.playback.stopAfter;
      node.loopGapMs = looping && gapSec > 0 ? gapSec * 1000 : 0;
      // node.loop drives the *native* seamless loop; a gapped loop plays one-shots + a timer.
      node.loop = looping && node.loopGapMs === 0;
      node.stopAfter = fs.playback.stopAfter;
      node.reload = fs.playback.reload;

      // Direction: place on the unit sphere by relative azimuth + elevation.
      const rad = (fs.az * Math.PI) / 180;
      const el = fs.elevation ?? 0;
      const ce = Math.cos(el);
      this.position(node.panner, Math.sin(rad) * ce, Math.sin(el), -Math.cos(rad) * ce, t);

      // Air-absorption: dull the far side of the field.
      if (fs.cutoffHz != null) node.lowpass.frequency.setTargetAtTime(fs.cutoffHz, t, CUTOFF_TC);
      // Doppler: nudge the pitch of whatever source is currently playing.
      if (fs.playbackRate != null) {
        node.rate = fs.playbackRate;
        if (node.src) node.src.playbackRate.setTargetAtTime(fs.playbackRate, t, RATE_TC);
      }

      if (fs.audible) {
        const entering = !node.wasAudible;
        if (entering && node.ended) node.ended = false; // re-arm a one-shot on re-entry

        if (!node.ended) {
          if (!node.src && node.gapTimer === null) {
            this.startSource(node, fs.startOffsetSec); // first play (seeks global sources into sync)
          } else if (entering && node.reload) {
            this.startSource(node, fs.startOffsetSec); // reload: restart
          }
        }
        node.gain.gain.setTargetAtTime(node.ended ? 0 : fs.gain, t, GAIN_TC);
        node.wasAudible = true;
      } else {
        node.gain.gain.setTargetAtTime(0, t, GAIN_TC);
        // A native-looping source keeps running (silently) to preserve its phase; one-shot,
        // reload and gapped-loop sources are stopped so the next entry starts fresh / re-armed.
        if (!node.loop) {
          this.clearGap(node);
          this.stopSource(node);
        }
        node.wasAudible = false;
      }
    }
  }

  dispose(): void {
    for (const node of this.nodes.values()) {
      this.clearGap(node);
      this.stopSource(node);
      try {
        node.lowpass.disconnect();
        node.panner.disconnect();
        node.gain.disconnect();
      } catch {
        /* already torn down */
      }
    }
    this.nodes.clear();
    try {
      this.master.disconnect();
    } catch {
      /* noop */
    }
  }

  private ensure(fs: FrameSource): SourceNode {
    const existing = this.nodes.get(fs.id);
    if (existing) return existing;

    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = 10_000;
    panner.rolloffFactor = 0;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 18000;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    lowpass.connect(panner);
    panner.connect(gain);
    gain.connect(this.master);

    const node: SourceNode = {
      url: fs.url,
      panner,
      lowpass,
      gain,
      rate: 1,
      src: null,
      loop: fs.playback.loop && !fs.playback.stopAfter,
      stopAfter: fs.playback.stopAfter,
      reload: fs.playback.reload,
      wasAudible: false,
      ended: false,
      loopGapMs: 0,
      gapTimer: null,
    };
    this.nodes.set(fs.id, node);
    void this.loadBuffer(fs.url);
    return node;
  }

  /**
   * (Re)start playback for a node. `offsetSec` seeks into the buffer so global/shared
   * sources begin at the same point in the loop on every device. No-op until decoded.
   */
  private startSource(node: SourceNode, offsetSec = 0): void {
    const buffer = this.buffers.get(node.url);
    if (!buffer) return; // not decoded yet — retried on the next audible frame
    this.clearGap(node);
    this.stopSource(node);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = node.loop;
    src.playbackRate.value = node.rate;
    src.connect(node.lowpass);
    src.onended = () => {
      if (src !== node.src) return;
      node.src = null;
      if (node.loop) return; // native seamless loop never ends on its own
      if (node.loopGapMs > 0 && node.wasAudible) {
        // Gapped loop: wait out the silence, then play the next iteration if still audible.
        node.gapTimer = window.setTimeout(() => {
          node.gapTimer = null;
          if (node.wasAudible && !node.ended) this.startSource(node);
        }, node.loopGapMs);
      } else {
        node.ended = true; // a one-shot finished
      }
    };
    node.src = src;
    const dur = buffer.duration;
    const off = dur > 0 ? ((offsetSec % dur) + dur) % dur : 0;
    try {
      src.start(0, off);
    } catch {
      /* start races */
    }
  }

  /** Cancel a pending loop-gap restart (on silence, restart or dispose). */
  private clearGap(node: SourceNode): void {
    if (node.gapTimer !== null) {
      window.clearTimeout(node.gapTimer);
      node.gapTimer = null;
    }
  }

  private stopSource(node: SourceNode): void {
    const src = node.src;
    if (!src) return;
    node.src = null;
    try {
      src.onended = null;
      src.stop();
    } catch {
      /* already stopped */
    }
    try {
      src.disconnect();
    } catch {
      /* noop */
    }
  }

  private position(p: PannerNode, x: number, y: number, z: number, t: number): void {
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, POS_TC);
      p.positionY.setTargetAtTime(y, t, POS_TC);
      p.positionZ.setTargetAtTime(z, t, POS_TC);
    } else {
      p.setPosition(x, y, z);
    }
  }

  private async loadBuffer(url: string): Promise<void> {
    if (this.buffers.has(url) || this.loading.has(url)) return;
    this.loading.add(url);
    try {
      const res = await fetch(url, { mode: 'cors' });
      const arr = await res.arrayBuffer();
      const buffer = await this.decode(arr);
      this.buffers.set(url, buffer);
    } catch {
      /* leave unloaded; ensure() will retry on the next encounter */
    } finally {
      this.loading.delete(url);
    }
  }

  /** decodeAudioData with a callback fallback for older Safari. */
  private decode(arr: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      const maybe = this.ctx.decodeAudioData(arr, resolve, reject);
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
    });
  }
}
