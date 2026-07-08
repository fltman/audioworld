import type { PlaybackOptions } from '@audioworld/shared';

/** Per-frame instruction for one point, produced by the experience engine. */
export interface FrameSource {
  id: string;
  /** Absolute media URL. */
  url: string;
  playback: PlaybackOptions;
  audible: boolean;
  /** Relative azimuth in degrees (0 = dead ahead, +90 = right). */
  az: number;
  /** Target loudness 0..1. */
  gain: number;
}

interface SourceNode {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  panner: PannerNode;
  gain: GainNode;
  wasAudible: boolean;
  ended: boolean;
  playing: boolean;
  pauseTimer: number | null;
}

const POS_TC = 0.05; // panner glide
const GAIN_TC = 0.08; // loudness glide
const PAUSE_DELAY_MS = 220;

/**
 * Web Audio spatializer. One HRTF panner + gain per point. We drive loudness
 * ourselves (panner rolloff = 0) so distance attenuation exactly matches the HUD.
 * The listener stays at the origin facing -Z; sources are placed on the unit
 * circle by relative azimuth so the mix rotates as the user turns.
 */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly nodes = new Map<string, SourceNode>();

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
    for (const fs of sources) {
      // Lazy: never load media for a source the user hasn't reached yet.
      if (!fs.audible && !this.nodes.has(fs.id)) continue;
      const node = this.ensure(fs);
      node.el.loop = fs.playback.loop && !fs.playback.stopAfter;

      if (fs.audible) this.drive(node, fs);
      else this.silence(node);
    }
  }

  dispose(): void {
    for (const n of this.nodes.values()) {
      if (n.pauseTimer !== null) clearTimeout(n.pauseTimer);
      try {
        n.el.pause();
        n.source.disconnect();
        n.panner.disconnect();
        n.gain.disconnect();
      } catch {
        /* already torn down */
      }
      n.el.removeAttribute('src');
      n.el.load();
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

    const el = new Audio(fs.url);
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.loop = fs.playback.loop && !fs.playback.stopAfter;

    // createMediaElementSource may run only once per element.
    const source = this.ctx.createMediaElementSource(el);
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = 10_000;
    panner.rolloffFactor = 0;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(panner);
    panner.connect(gain);
    gain.connect(this.master);

    const node: SourceNode = {
      el,
      source,
      panner,
      gain,
      wasAudible: false,
      ended: false,
      playing: false,
      pauseTimer: null,
    };
    el.addEventListener('ended', () => {
      node.ended = true;
      node.playing = false;
    });

    this.nodes.set(fs.id, node);
    return node;
  }

  private drive(node: SourceNode, fs: FrameSource): void {
    if (node.pauseTimer !== null) {
      clearTimeout(node.pauseTimer);
      node.pauseTimer = null;
    }

    const entering = !node.wasAudible;
    if (entering) {
      if (fs.playback.reload) this.rewind(node);
      // stopAfter re-arms only after leaving and returning.
      if (fs.playback.stopAfter && node.ended) {
        node.ended = false;
        this.rewind(node);
      }
    }

    this.position(node, fs.az);

    const silent = fs.playback.stopAfter && node.ended;
    node.gain.gain.setTargetAtTime(silent ? 0 : fs.gain, this.ctx.currentTime, GAIN_TC);

    if (!silent && !node.playing) {
      node.el.play().catch(() => {
        /* autoplay races; retried next frame */
      });
      node.playing = true;
    }
    node.wasAudible = true;
  }

  private silence(node: SourceNode): void {
    if (node.wasAudible) {
      node.gain.gain.setTargetAtTime(0, this.ctx.currentTime, GAIN_TC);
      if (node.pauseTimer === null) {
        node.pauseTimer = window.setTimeout(() => {
          node.el.pause();
          node.playing = false;
          node.pauseTimer = null;
        }, PAUSE_DELAY_MS);
      }
    }
    node.wasAudible = false;
  }

  private position(node: SourceNode, az: number): void {
    const rad = (az * Math.PI) / 180;
    const x = Math.sin(rad);
    const z = -Math.cos(rad);
    const t = this.ctx.currentTime;
    const p = node.panner;
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, POS_TC);
      p.positionY.setTargetAtTime(0, t, POS_TC);
      p.positionZ.setTargetAtTime(z, t, POS_TC);
    } else {
      p.setPosition(x, 0, z);
    }
  }

  private rewind(node: SourceNode): void {
    try {
      node.el.currentTime = 0;
    } catch {
      /* not seekable yet */
    }
  }
}
