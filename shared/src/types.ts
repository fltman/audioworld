/**
 * AudioWorld shared domain types — the single source of truth shared by
 * server, admin and client. Keep this file dependency-free.
 */

/** Geographic coordinate (WGS84). */
export interface Coordinates {
  lat: number;
  lng: number;
}

/** The five kinds of audio point. */
export type PointType =
  | 'static'
  | 'static_circling'
  | 'path'
  | 'follow_user'
  | 'path_triggered';

/** What happens when a moving source reaches the end of its path. */
export type PathEndBehavior = 'loop' | 'reverse' | 'stop';

/** Where the audio comes from. */
export type AudioSourceKind = 'url' | 'upload';

/**
 * How a point's motion + audio timing is clocked.
 * - individual: each device clocks the source from when it entered the experience
 *               (and triggers per-user). The default — every user gets their own run.
 * - global:     all devices clock the source from a shared, server-synced wall clock
 *               anchored at `startAt`, so a moving source is in the same world position
 *               AND at the same point in its audio loop for everyone. A shared guide.
 *               Only meaningful for the continuously-moving types (path, static_circling).
 */
export type SyncMode = 'individual' | 'global';

/**
 * Playback options (per the spec).
 * - loop:      keep looping while audible
 * - stopAfter: play once, then stay silent even if still in range (until re-armed)
 * - reload:    restart from 0 every time the user re-enters the audible range
 */
export interface PlaybackOptions {
  loop: boolean;
  stopAfter: boolean;
  reload: boolean;
}

/** The audio media backing a point (URL or uploaded file, both resolve to `url`). */
export interface AudioSource {
  kind: AudioSourceKind;
  /** Resolved URL. For uploads this is a server path like `/uploads/<file>.mp3`. */
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
}

/** Fields common to every audio point. */
export interface BaseAudioPoint {
  id: string;
  courseId: string;
  name: string;
  type: PointType;
  audio: AudioSource;
  playback: PlaybackOptions;
  /** Maximum gain 0..1 at the source. */
  volume: number;
  /** Individual (per-device) or global (shared, server-synced) timing. */
  sync: SyncMode;
  /** For global points: epoch ms when the shared motion/audio clock starts (t=0). */
  startAt?: number;
  createdAt: string;
  updatedAt: string;
}

/** Fixed point; audible when the user is within `radius`. */
export interface StaticPoint extends BaseAudioPoint {
  type: 'static';
  center: Coordinates;
  radius: number;
}

/** Source that orbits `center` at `circleRadius`, moving `speed` m/s along the circle. */
export interface StaticCirclingPoint extends BaseAudioPoint {
  type: 'static_circling';
  center: Coordinates;
  circleRadius: number;
  speed: number;
  /** Audible radius from the *moving* source. */
  radius: number;
}

/** Source that continuously travels a polyline at `speed` m/s. */
export interface PathAudioPoint extends BaseAudioPoint {
  type: 'path';
  path: Coordinates[];
  radius: number;
  speed: number;
  endBehavior: PathEndBehavior;
}

/** Sits at `center` until the user enters `initialRadius`; then it follows the user. */
export interface FollowUserPoint extends BaseAudioPoint {
  type: 'follow_user';
  center: Coordinates;
  initialRadius: number;
}

/** Rests at the path start until the user comes within `triggerRadius`, then travels the path. */
export interface PathTriggeredPoint extends BaseAudioPoint {
  type: 'path_triggered';
  path: Coordinates[];
  triggerRadius: number;
  speed: number;
  endBehavior: PathEndBehavior;
}

/** Discriminated union over `type`. */
export type AudioPoint =
  | StaticPoint
  | StaticCirclingPoint
  | PathAudioPoint
  | FollowUserPoint
  | PathTriggeredPoint;

/** A collection of audio points that form one experience. */
export interface Course {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** Distribute `Omit` across a union so each member is narrowed individually. */
export type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Omit<T, K>
  : never;

/** Payload accepted when creating/updating a point (server assigns id + timestamps). */
export type AudioPointInput = DistributiveOmit<
  AudioPoint,
  'id' | 'createdAt' | 'updatedAt'
>;

/** Payload accepted when creating/updating a course. */
export type CourseInput = Pick<Course, 'name' | 'description'>;

/** Result of an audio-file upload. */
export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
}

/** Uniform API envelope. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Default playback options for a freshly created point. */
export const DEFAULT_PLAYBACK: PlaybackOptions = {
  loop: true,
  stopAfter: false,
  reload: false,
};
