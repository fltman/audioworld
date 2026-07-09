import type {
  AudioPoint,
  Coordinates,
  FollowMode,
  PathEndBehavior,
  PathStop,
  PlaybackOptions,
  PointType,
  SyncMode,
} from '@audioworld/shared';
import { DEFAULT_PLAYBACK } from '@audioworld/shared';

/** Thrown on bad client input; the error handler maps it to HTTP 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Raw shape of an `audio_points` row as returned by pg. */
export interface PointRow {
  id: string;
  course_id: string;
  name: string;
  type: string;
  audio_kind: string;
  audio_url: string;
  audio_title: string | null;
  audio_description: string | null;
  audio_tags: string[] | null;
  volume: number | string;
  playback: PlaybackOptions;
  config: Record<string, unknown>;
  sync: string | null;
  start_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Column values ready to be written to `audio_points`. */
export interface PointColumns {
  course_id: string;
  name: string;
  type: PointType;
  audio_kind: 'url' | 'upload';
  audio_url: string;
  audio_title: string | null;
  audio_description: string | null;
  audio_tags: string[] | null;
  volume: number;
  playback: PlaybackOptions;
  config: Record<string, unknown>;
  sync: SyncMode;
  start_at: Date | null;
}

const POINT_TYPES: readonly PointType[] = [
  'static',
  'static_circling',
  'path',
  'follow_user',
  'path_triggered',
];

/**
 * Rebuild a domain `AudioPoint` from a row. Spreading `config` supplies the
 * type-specific geometry (center/radius/path/speed/...), completing the union.
 */
export function rowToPoint(row: PointRow): AudioPoint {
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    type: row.type as PointType,
    audio: {
      kind: row.audio_kind as 'url' | 'upload',
      url: row.audio_url,
      title: row.audio_title ?? undefined,
      description: row.audio_description ?? undefined,
      tags: row.audio_tags ?? undefined,
    },
    playback: row.playback,
    volume: Number(row.volume),
    sync: (row.sync as SyncMode) ?? 'individual',
    startAt: row.start_at ? row.start_at.getTime() : undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...row.config,
  } as AudioPoint;
}

/**
 * Validate an `AudioPointInput` body and split it into common columns plus a
 * `config` object holding only the geometry relevant to its type.
 */
export function pointInputToColumns(input: unknown, courseId: string): PointColumns {
  const body = asObject(input, 'body');

  const type = body.type;
  if (typeof type !== 'string' || !POINT_TYPES.includes(type as PointType)) {
    throw new ValidationError(
      `Invalid point "type"; expected one of ${POINT_TYPES.join(', ')}`
    );
  }
  const pointType = type as PointType;

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    throw new ValidationError('Point "name" is required');
  }

  const audio = asObject(body.audio, 'audio');
  if (audio.kind !== 'url' && audio.kind !== 'upload') {
    throw new ValidationError('audio.kind must be "url" or "upload"');
  }
  if (typeof audio.url !== 'string' || audio.url.trim() === '') {
    throw new ValidationError('audio.url is required');
  }

  let audioTags: string[] | null = null;
  if (Array.isArray(audio.tags)) {
    audioTags = audio.tags.map((t) => String(t));
  } else if (audio.tags != null) {
    throw new ValidationError('audio.tags must be an array of strings');
  }

  let volume = 1;
  if (body.volume != null) {
    volume = num(body.volume, 'volume');
    if (volume < 0 || volume > 1) {
      throw new ValidationError('volume must be between 0 and 1');
    }
  }

  const sync: SyncMode = body.sync === 'global' ? 'global' : 'individual';
  // A global point needs a shared clock anchor. Honor a client-supplied startAt
  // (e.g. to re-sync a journey), otherwise anchor it at creation time.
  let startAt: Date | null = null;
  if (sync === 'global') {
    startAt = body.startAt != null ? new Date(num(body.startAt, 'startAt')) : new Date();
  }

  // Story flags apply to every type, so they live alongside the geometry in `config`
  // (rowToPoint spreads config back onto the point) — no dedicated columns needed.
  const config = configForType(pointType, body);
  const setsFlags = flagList(body.setsFlags, 'setsFlags');
  if (setsFlags) config.setsFlags = setsFlags;
  const requiresFlags = flagList(body.requiresFlags, 'requiresFlags');
  if (requiresFlags) config.requiresFlags = requiresFlags;
  if (body.height != null) config.height = num(body.height, 'height');

  return {
    course_id: courseId,
    name: body.name,
    type: pointType,
    audio_kind: audio.kind,
    audio_url: audio.url,
    audio_title: typeof audio.title === 'string' ? audio.title : null,
    audio_description: typeof audio.description === 'string' ? audio.description : null,
    audio_tags: audioTags,
    volume,
    playback: normalizePlayback(body.playback),
    config,
    sync,
    start_at: startAt,
  };
}

function configForType(
  type: PointType,
  body: Record<string, unknown>
): Record<string, unknown> {
  switch (type) {
    case 'static': {
      const config: Record<string, unknown> = {
        center: coord(body.center, 'center'),
        radius: num(body.radius, 'radius'),
      };
      if (body.triggerRadius != null) {
        const triggerRadius = num(body.triggerRadius, 'triggerRadius');
        if (triggerRadius < 0) throw new ValidationError('triggerRadius must be >= 0');
        config.triggerRadius = triggerRadius;
      }
      return config;
    }
    case 'static_circling':
      return {
        center: coord(body.center, 'center'),
        circleRadius: num(body.circleRadius, 'circleRadius'),
        speed: num(body.speed, 'speed'),
        radius: num(body.radius, 'radius'),
      };
    case 'path': {
      const path = coordArray(body.path, 'path');
      const config: Record<string, unknown> = {
        path,
        stops: pathStops(body.stops, path.length),
        radius: num(body.radius, 'radius'),
        speed: num(body.speed, 'speed'),
        endBehavior: endBehavior(body.endBehavior),
      };
      addWaitAndWayfinding(config, body);
      return config;
    }
    case 'follow_user': {
      const config: Record<string, unknown> = {
        center: coord(body.center, 'center'),
        initialRadius: num(body.initialRadius, 'initialRadius'),
      };
      if (body.mode != null) config.mode = followMode(body.mode);
      if (body.maxSpeed != null) config.maxSpeed = num(body.maxSpeed, 'maxSpeed');
      if (body.disengageDistance != null)
        config.disengageDistance = num(body.disengageDistance, 'disengageDistance');
      if (body.followRadius != null) config.followRadius = num(body.followRadius, 'followRadius');
      if (body.followSpeed != null) config.followSpeed = num(body.followSpeed, 'followSpeed');
      return config;
    }
    case 'path_triggered': {
      const path = coordArray(body.path, 'path');
      const config: Record<string, unknown> = {
        path,
        stops: pathStops(body.stops, path.length),
        triggerRadius: num(body.triggerRadius, 'triggerRadius'),
        speed: num(body.speed, 'speed'),
        endBehavior: endBehavior(body.endBehavior),
      };
      addWaitAndWayfinding(config, body);
      return config;
    }
  }
}

/** Copy the optional wait-for-listener + wayfinding settings shared by both path types. */
function addWaitAndWayfinding(config: Record<string, unknown>, body: Record<string, unknown>): void {
  if (body.waitForListener != null) config.waitForListener = Boolean(body.waitForListener);
  if (body.waitRadius != null) {
    const r = num(body.waitRadius, 'waitRadius');
    if (r < 0) throw new ValidationError('waitRadius must be >= 0');
    config.waitRadius = r;
  }
  if (body.showWayfinding != null) config.showWayfinding = Boolean(body.showWayfinding);
}

function followMode(value: unknown): FollowMode {
  if (value === 'attach' || value === 'chase' || value === 'orbit' || value === 'sideToSide') {
    return value;
  }
  throw new ValidationError('mode must be "attach", "chase", "orbit" or "sideToSide"');
}

/** Normalize a story-flag list: trimmed non-empty strings, or undefined if none. */
function flagList(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ValidationError(`"${field}" must be an array of strings`);
  const flags = value.map((f) => String(f).trim()).filter((f) => f.length > 0);
  return flags.length > 0 ? flags : undefined;
}

function normalizePlayback(value: unknown): PlaybackOptions {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PLAYBACK };
  const v = value as Record<string, unknown>;
  const playback: PlaybackOptions = {
    loop: v.loop == null ? DEFAULT_PLAYBACK.loop : Boolean(v.loop),
    stopAfter: v.stopAfter == null ? DEFAULT_PLAYBACK.stopAfter : Boolean(v.stopAfter),
    reload: v.reload == null ? DEFAULT_PLAYBACK.reload : Boolean(v.reload),
  };
  if (v.loopGapSec != null) {
    const gap = Number(v.loopGapSec);
    if (Number.isFinite(gap) && gap >= 0) playback.loopGapSec = gap;
  }
  return playback;
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`"${field}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function num(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new ValidationError(`"${field}" must be a finite number`);
  }
  return n;
}

function coord(value: unknown, field: string): Coordinates {
  const v = asObject(value, field);
  return { lat: num(v.lat, `${field}.lat`), lng: num(v.lng, `${field}.lng`) };
}

function coordArray(value: unknown, field: string): Coordinates[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new ValidationError(`"${field}" must be an array of at least 2 coordinates`);
  }
  return value.map((c, i) => coord(c, `${field}[${i}]`));
}

function endBehavior(value: unknown): PathEndBehavior {
  if (value === 'loop' || value === 'reverse' || value === 'stop') return value;
  throw new ValidationError('endBehavior must be "loop", "reverse" or "stop"');
}

function pathStops(value: unknown, pathLen: number): PathStop[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ValidationError('"stops" must be an array');
  return value.map((s, i) => {
    const o = asObject(s, `stops[${i}]`);
    const index = num(o.index, `stops[${i}].index`);
    if (!Number.isInteger(index) || index < 0 || index >= pathLen) {
      throw new ValidationError(`stops[${i}].index is out of range`);
    }
    const dwellSec = num(o.dwellSec, `stops[${i}].dwellSec`);
    if (dwellSec < 0) throw new ValidationError(`stops[${i}].dwellSec must be >= 0`);
    const stop: PathStop = { index, dwellSec };
    if (o.audio != null) {
      const a = asObject(o.audio, `stops[${i}].audio`);
      if (a.kind !== 'url' && a.kind !== 'upload') {
        throw new ValidationError(`stops[${i}].audio.kind must be "url" or "upload"`);
      }
      if (typeof a.url !== 'string' || a.url.trim() === '') {
        throw new ValidationError(`stops[${i}].audio.url is required`);
      }
      stop.audio = {
        kind: a.kind,
        url: a.url,
        title: typeof a.title === 'string' ? a.title : undefined,
      };
    }
    return stop;
  });
}
