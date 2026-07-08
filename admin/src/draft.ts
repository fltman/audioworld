import type {
  AudioPoint,
  AudioPointInput,
  AudioSource,
  Coordinates,
  PathEndBehavior,
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
  /** Individual (per-device) vs global (shared, server-synced) timing. */
  sync: SyncMode;
  /** Global anchor (epoch ms); undefined lets the server set it to "now" on save. */
  startAt?: number;
  /** Anchor for single-anchor types. */
  center: Coordinates | null;
  /** Vertices for path types. */
  path: Coordinates[];
  /** True while the user is still adding path vertices. */
  drawingPath: boolean;
  radius: number;
  circleRadius: number;
  speed: number;
  initialRadius: number;
  triggerRadius: number;
  endBehavior: PathEndBehavior;
}

const NUMERIC_DEFAULTS = {
  radius: 50,
  circleRadius: 30,
  speed: 2,
  initialRadius: 30,
  triggerRadius: 40,
};

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
    drawingPath: isPathType(type),
    ...NUMERIC_DEFAULTS,
    endBehavior: 'loop',
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
    sync: point.sync,
    startAt: point.startAt,
    center: null,
    path: [],
    drawingPath: false,
    ...NUMERIC_DEFAULTS,
    endBehavior: 'loop',
  };

  switch (point.type) {
    case 'static':
      return { ...base, center: point.center, radius: point.radius };
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
        radius: point.radius,
        speed: point.speed,
        endBehavior: point.endBehavior,
      };
    case 'follow_user':
      return { ...base, center: point.center, initialRadius: point.initialRadius };
    case 'path_triggered':
      return {
        ...base,
        path: [...point.path],
        triggerRadius: point.triggerRadius,
        speed: point.speed,
        endBehavior: point.endBehavior,
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
    playback: d.playback,
    volume: d.volume,
    sync: d.sync,
    startAt: d.startAt,
  };

  switch (d.type) {
    case 'static':
      if (!d.center) return { error: 'Click the map to place the center.' };
      return { input: { ...common, type: 'static', center: d.center, radius: d.radius } };
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
          radius: d.radius,
          speed: d.speed,
          endBehavior: d.endBehavior,
        },
      };
    case 'follow_user':
      if (!d.center) return { error: 'Click the map to place the start point.' };
      return {
        input: { ...common, type: 'follow_user', center: d.center, initialRadius: d.initialRadius },
      };
    case 'path_triggered':
      if (d.path.length < 2) return { error: 'Draw at least two path points.' };
      return {
        input: {
          ...common,
          type: 'path_triggered',
          path: d.path,
          triggerRadius: d.triggerRadius,
          speed: d.speed,
          endBehavior: d.endBehavior,
        },
      };
  }
}
