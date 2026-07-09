import type {
  AudioPoint,
  AudioPointInput,
  AudioSource,
  Coordinates,
  FollowMode,
  PathEndBehavior,
  PathStop,
  PlaybackOptions,
  PointType,
  SyncMode,
} from '@audioworld/shared';
import { DEFAULT_PLAYBACK } from '@audioworld/shared';
import { isPathType } from './pointTypes';

/**
 * A flat, editable working copy of an audio point. It holds every possible
 * field so the form can switch types freely; `draftToInput` narrows it back to
 * the correct discriminated-union member on save.
 */
export interface DraftState {
  /** Id of the point being edited, or null for a brand-new point. */
  editingId: string | null;
  courseId: string;
  type: PointType;
  name: string;
  audio: AudioSource;
  volume: number;
  playback: PlaybackOptions;
  /** Seconds of silence between loop iterations (0 = seamless). */
  loopGapSec: number;
  /** Individual (per-device) vs global (shared, server-synced) timing. */
  sync: SyncMode;
  /** Global anchor (epoch ms); undefined lets the server set it to "now" on save. */
  startAt?: number;
  /** Anchor for single-anchor types. */
  center: Coordinates | null;
  /** Vertices for path types. */
  path: Coordinates[];
  /** Guided-tour stops (dwell + optional clip) for `path`. */
  stops: PathStop[];
  /** True while the user is still adding path vertices. */
  drawingPath: boolean;
  radius: number;
  circleRadius: number;
  speed: number;
  initialRadius: number;
  triggerRadius: number;
  endBehavior: PathEndBehavior;
  /** Wait-for-listener leash + toggle (path / path_triggered). */
  waitForListener: boolean;
  waitRadius: number;
  /** Show a compass arrow + distance in the client (path / path_triggered). */
  showWayfinding: boolean;
  /** follow_user behavior + per-mode params. */
  mode: FollowMode;
  maxSpeed: number;
  disengageDistance: number;
  followRadius: number;
  followSpeed: number;
  /** Height in metres above the listener (+up / -down); 0 = level. */
  height: number;
  /** Story flags this point sets / requires (comma-separated text). */
  setsFlags: string;
  requiresFlags: string;
  /** Exclusive-choice group (crossroads) — siblings lock each other. */
  flagGroup: string;
}

const NUMERIC_DEFAULTS = {
  radius: 50,
  circleRadius: 30,
  speed: 2,
  initialRadius: 30,
  triggerRadius: 40,
  waitRadius: 60,
  maxSpeed: 1.5,
  disengageDistance: 80,
  followRadius: 8,
  followSpeed: 2,
  height: 0,
};

/** Non-numeric draft fields shared by freshDraft + pointToDraft's base. */
const FLAG_DEFAULTS = {
  waitForListener: false,
  showWayfinding: false,
  mode: 'attach' as FollowMode,
};

/** Parse "OLD-LADY, KEY" -> ["OLD-LADY","KEY"]. */
const parseFlags = (s: string): string[] =>
  s.split(',').map((f) => f.trim()).filter((f) => f.length > 0);

export function freshDraft(type: PointType, courseId: string): DraftState {
  return {
    editingId: null,
    courseId,
    type,
    name: '',
    audio: { kind: 'url', url: '' },
    volume: 1,
    playback: { ...DEFAULT_PLAYBACK },
    sync: 'individual',
    center: null,
    path: [],
    stops: [],
    drawingPath: isPathType(type),
    ...NUMERIC_DEFAULTS,
    // The static jumpscare shares the triggerRadius field but starts off (0).
    triggerRadius: type === 'static' ? 0 : NUMERIC_DEFAULTS.triggerRadius,
    loopGapSec: 0,
    endBehavior: 'loop',
    ...FLAG_DEFAULTS,
    setsFlags: '',
    requiresFlags: '',
    flagGroup: '',
  };
}

export function pointToDraft(point: AudioPoint): DraftState {
  const base: DraftState = {
    editingId: point.id,
    courseId: point.courseId,
    type: point.type,
    name: point.name,
    audio: { ...point.audio },
    volume: point.volume,
    playback: { ...point.playback },
    loopGapSec: point.playback.loopGapSec ?? 0,
    sync: point.sync,
    startAt: point.startAt,
    center: null,
    path: [],
    stops: [],
    drawingPath: false,
    ...NUMERIC_DEFAULTS,
    endBehavior: 'loop',
    ...FLAG_DEFAULTS,
    height: point.height ?? 0,
    setsFlags: (point.setsFlags ?? []).join(', '),
    requiresFlags: (point.requiresFlags ?? []).join(', '),
    flagGroup: point.flagGroup ?? '',
  };

  switch (point.type) {
    case 'static':
      return {
        ...base,
        center: point.center,
        radius: point.radius,
        triggerRadius: point.triggerRadius ?? 0,
      };
    case 'static_circling':
      return {
        ...base,
        center: point.center,
        circleRadius: point.circleRadius,
        speed: point.speed,
        radius: point.radius,
      };
    case 'path':
      return {
        ...base,
        path: [...point.path],
        stops: point.stops ? point.stops.map((s) => ({ ...s })) : [],
        radius: point.radius,
        speed: point.speed,
        endBehavior: point.endBehavior,
        waitForListener: point.waitForListener ?? false,
        waitRadius: point.waitRadius ?? NUMERIC_DEFAULTS.waitRadius,
        showWayfinding: point.showWayfinding ?? false,
      };
    case 'follow_user':
      return {
        ...base,
        center: point.center,
        initialRadius: point.initialRadius,
        mode: point.mode ?? 'attach',
        maxSpeed: point.maxSpeed ?? NUMERIC_DEFAULTS.maxSpeed,
        disengageDistance: point.disengageDistance ?? NUMERIC_DEFAULTS.disengageDistance,
        followRadius: point.followRadius ?? NUMERIC_DEFAULTS.followRadius,
        followSpeed: point.followSpeed ?? NUMERIC_DEFAULTS.followSpeed,
      };
    case 'path_triggered':
      return {
        ...base,
        path: [...point.path],
        stops: point.stops ? point.stops.map((s) => ({ ...s })) : [],
        triggerRadius: point.triggerRadius,
        speed: point.speed,
        endBehavior: point.endBehavior,
        waitForListener: point.waitForListener ?? false,
        waitRadius: point.waitRadius ?? NUMERIC_DEFAULTS.waitRadius,
        showWayfinding: point.showWayfinding ?? false,
      };
  }
}

/** The anchor coordinate a draft is drawn at (its center / path start), or null. */
export function draftAnchor(d: DraftState): Coordinates | null {
  return isPathType(d.type) ? d.path[0] ?? null : d.center;
}

/** The audible/trigger radius currently relevant to a draft (for the preview ring). */
export function draftAudibleRadius(d: DraftState): number {
  switch (d.type) {
    case 'static':
    case 'static_circling':
    case 'path':
      return d.radius;
    case 'follow_user':
      return d.initialRadius;
    case 'path_triggered':
      return d.triggerRadius;
  }
}

export type DraftResult =
  | { input: AudioPointInput }
  | { error: string };

/** Validate a draft and narrow it to the API payload, or report why it can't be saved. */
export function draftToInput(d: DraftState): DraftResult {
  const name = d.name.trim();
  if (!name) return { error: 'Name is required.' };
  const url = d.audio.url.trim();
  if (!url) return { error: 'An audio URL or uploaded file is required.' };

  const common = {
    courseId: d.courseId,
    name,
    audio: { ...d.audio, url },
    // loopGapSec lives in its own draft field; carry it into playback only when set.
    playback: { ...d.playback, loopGapSec: d.loopGapSec > 0 ? d.loopGapSec : undefined },
    volume: d.volume,
    sync: d.sync,
    startAt: d.startAt,
    setsFlags: parseFlags(d.setsFlags),
    requiresFlags: parseFlags(d.requiresFlags),
    ...(d.height ? { height: d.height } : {}),
    ...(d.flagGroup.trim() ? { flagGroup: d.flagGroup.trim() } : {}),
  };

  switch (d.type) {
    case 'static':
      if (!d.center) return { error: 'Click the map to place the center.' };
      return {
        input: {
          ...common,
          type: 'static',
          center: d.center,
          radius: d.radius,
          ...(d.triggerRadius > 0 ? { triggerRadius: d.triggerRadius } : {}),
        },
      };
    case 'static_circling':
      if (!d.center) return { error: 'Click the map to place the center.' };
      return {
        input: {
          ...common,
          type: 'static_circling',
          center: d.center,
          circleRadius: d.circleRadius,
          speed: d.speed,
          radius: d.radius,
        },
      };
    case 'path':
      if (d.path.length < 2) return { error: 'Draw at least two path points.' };
      return {
        input: {
          ...common,
          type: 'path',
          path: d.path,
          stops: d.stops.filter((s) => s.dwellSec > 0 && s.index < d.path.length),
          radius: d.radius,
          speed: d.speed,
          endBehavior: d.endBehavior,
          waitForListener: d.waitForListener,
          waitRadius: d.waitRadius,
          showWayfinding: d.showWayfinding,
        },
      };
    case 'follow_user':
      if (!d.center) return { error: 'Click the map to place the start point.' };
      return {
        input: {
          ...common,
          type: 'follow_user',
          center: d.center,
          initialRadius: d.initialRadius,
          mode: d.mode,
          maxSpeed: d.maxSpeed,
          disengageDistance: d.disengageDistance,
          followRadius: d.followRadius,
          followSpeed: d.followSpeed,
        },
      };
    case 'path_triggered':
      if (d.path.length < 2) return { error: 'Draw at least two path points.' };
      return {
        input: {
          ...common,
          type: 'path_triggered',
          path: d.path,
          stops: d.stops.filter((s) => s.dwellSec > 0 && s.index < d.path.length),
          triggerRadius: d.triggerRadius,
          speed: d.speed,
          endBehavior: d.endBehavior,
          waitForListener: d.waitForListener,
          waitRadius: d.waitRadius,
          showWayfinding: d.showWayfinding,
        },
      };
  }
}
