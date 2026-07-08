import type { PlaybackOptions } from '@audioworld/shared';

// NOTE: mirrors client/src/services/audioEngine.ts. Kept as a copy so the admin
// playtest never imports client code; keep the two in sync if the engine changes.

/** Per-frame instruction for one point. */
export interface FrameSource {
  id: string;
  url: string;
  playback: PlaybackOptions;
  audible: boolean;
  /** Relative azimuth in degrees (0 = dead ahead, +90 = right). */
  az: number;
  /** Target loudness 0..1. */
  gain: number;
  /** Seconds into a global/shared timeline, so playback seeks to the shared position. */
  startOffsetSec?: number;
}

interface SourceNode {
  url: string;
  panner: PannerNode;
  gain: GainNode;
  src: AudioBufferSourceNode | null;
  loop: boolean;
  stopAfter: boolean;
  reload: boolean;
  wasAudible: boolean;
  ended: boolean;
}

const POS_TC = 0.05;
const GAIN_TC = 0.08;

/** Web Audio HRTF spatializer built on decoded AudioBuffers (many voices at once). */
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

  update(sources: FrameSource[]): void {
    const t = this.ctx.currentTime;
    for (const fs of sources) {
      if (!fs.audible && !this.nodes.has(fs.id)) continue;

      const node = this.ensure(fs);
      node.loop = fs.playback.loop && !fs.playback.stopAfter;
      node.stopAfter = fs.playback.stopAfter;
      node.reload = fs.playback.reload;

      const rad = (fs.az * Math.PI) / 180;
      this.position(node.panner, Math.sin(rad), -Math.cos(rad), t);

      if (fs.audible) {
        const entering = !node.wasAudible;
        if (entering && node.ended) node.ended = false;
        if (!node.ended) {
          if (!node.src) this.startSource(node, fs.startOffsetSec);
          else if (entering && node.reload) this.startSource(node, fs.startOffsetSec);
        }
        node.gain.gain.setTargetAtTime(node.ended ? 0 : fs.gain, t, GAIN_TC);
        node.wasAudible = true;
      } else {
        node.gain.gain.setTargetAtTime(0, t, GAIN_TC);
        if (!node.loop) this.stopSource(node);
        node.wasAudible = false;
      }
    }
  }

  dispose(): void {
    for (const node of this.nodes.values()) {
      this.stopSource(node);
      try {
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

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    panner.connect(gain);
    gain.connect(this.master);

    const node: SourceNode = {
      url: fs.url,
      panner,
      gain,
      src: null,
      loop: fs.playback.loop && !fs.playback.stopAfter,
      stopAfter: fs.playback.stopAfter,
      reload: fs.playback.reload,
      wasAudible: false,
      ended: false,
    };
    this.nodes.set(fs.id, node);
    void this.loadBuffer(fs.url);
    return node;
  }

  private startSource(node: SourceNode, offsetSec = 0): void {
    const buffer = this.buffers.get(node.url);
    if (!buffer) return;
    this.stopSource(node);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = node.loop;
    src.connect(node.panner);
    src.onended = () => {
      if (src === node.src) {
        node.src = null;
        if (!node.loop) node.ended = true;
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

  private position(p: PannerNode, x: number, z: number, t: number): void {
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, POS_TC);
      p.positionY.setTargetAtTime(0, t, POS_TC);
      p.positionZ.setTargetAtTime(z, t, POS_TC);
    } else {
      p.setPosition(x, 0, z);
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
      /* leave unloaded; retried on the next encounter */
    } finally {
      this.loading.delete(url);
    }
  }

  private decode(arr: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      const maybe = this.ctx.decodeAudioData(arr, resolve, reject);
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
    });
  }
}
