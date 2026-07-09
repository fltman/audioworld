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
  /** Seconds of silence to wait between loop iterations when `loop` is true
   *  (0/undefined = seamless, the default). */
  loopGapSec?: number;
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
  /** Height in metres relative to the listener (+up, -down). 0/absent = level. Drives
   *  elevation: walk under a raised source and it swings overhead. */
  height?: number;
  /**
   * Story flags this point RAISES on the visitor's device the first time it is
   * heard/reached (e.g. ["OLD-LADY"]). Other points can gate on them.
   */
  setsFlags?: string[];
  /**
   * Story flags REQUIRED for this point to activate. Until every listed flag has
   * been raised, the point stays inert — silent and untriggerable. This is what
   * turns a course into a branching adventure (visit A → unlocks B).
   */
  requiresFlags?: string[];
  /**
   * Exclusive-choice group. Points sharing a `flagGroup` are mutually exclusive: the
   * first one you reach commits its flags and permanently LOCKS the others' flags for
   * this run (a locked flag can never be raised, so anything requiring it stays inert).
   * A crossroads — you commit to a branch by which way you walk, and can't hear the
   * road not taken until you replay.
   */
  flagGroup?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fixed point; audible when the user is within `radius`. */
export interface StaticPoint extends BaseAudioPoint {
  type: 'static';
  center: Coordinates;
  radius: number;
  /**
   * Optional jumpscare trigger. When set (> 0) the point is SILENT until the user
   * comes within `triggerRadius` of `center`; it then arms and becomes audible
   * within its normal `radius`. Pair with "Play once" (stopAfter) for a one-shot
   * scare. Absent/0 = always audible within `radius`, as normal.
   */
  triggerRadius?: number;
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

/**
 * A stop along a path: the source pauses at a vertex and (optionally) plays its
 * own clip — a guided-tour waypoint. `dwellSec` should be >= the clip length so
 * the narration finishes before the guide moves on (the admin shows arrival times
 * to help set this).
 */
export interface PathStop {
  /** Index of the path vertex this stop sits on (0..path.length-1). */
  index: number;
  /** Seconds the source pauses here. */
  dwellSec: number;
  /** Clip played once during the dwell; if omitted, the traveling audio continues. */
  audio?: AudioSource;
}

/** Source that travels a polyline at `speed` m/s, optionally pausing at stops. */
export interface PathAudioPoint extends BaseAudioPoint {
  type: 'path';
  path: Coordinates[];
  /** Guided-tour waypoints (pause + optional narration). Empty/absent = plain path. */
  stops?: PathStop[];
  radius: number;
  speed: number;
  endBehavior: PathEndBehavior;
  /**
   * "Wait for the listener": the source only advances along the path while the user
   * is within `waitRadius` (a leash, typically wider than the audible radius). Step
   * outside it and the source pauses in place until you come back — so a guide never
   * runs off without you. Forces individual timing.
   */
  waitForListener?: boolean;
  /** Leash radius (m) for `waitForListener`. Absent = use the audible `radius`. */
  waitRadius?: number;
  /** When true the client shows a compass arrow + distance to the source (wayfinding). */
  showWayfinding?: boolean;
}

/**
 * How a `follow_user` source behaves once the user has triggered it.
 * - attach:     rides right on top of the user, always audible (the original behavior).
 * - chase:      pursues the user at up to `maxSpeed`; outrun it and you hear it fall
 *               behind, get more than `disengageDistance` ahead and it gives up + goes silent.
 * - orbit:      circles the moving user at `followRadius`, `followSpeed` m/s.
 * - sideToSide: sweeps from the user's left side to their right at `followRadius`.
 */
export type FollowMode = 'attach' | 'chase' | 'orbit' | 'sideToSide';

/** Sits at `center` until the user enters `initialRadius`; then it follows the user. */
export interface FollowUserPoint extends BaseAudioPoint {
  type: 'follow_user';
  center: Coordinates;
  initialRadius: number;
  /** Follow behavior; absent = 'attach' (the original glued-on-top behavior). */
  mode?: FollowMode;
  /** chase: metres/second the pursuer can move toward the user. */
  maxSpeed?: number;
  /** chase: give-up distance (m) — the pursuer stops + goes silent once the user is this far ahead. */
  disengageDistance?: number;
  /** orbit/sideToSide: distance (m) the source holds from the user. */
  followRadius?: number;
  /** orbit/sideToSide: metres/second around the user (orbit) / sweep rate (sideToSide). */
  followSpeed?: number;
}

/** Rests at the path start until the user comes within `triggerRadius`, then travels the path. */
export interface PathTriggeredPoint extends BaseAudioPoint {
  type: 'path_triggered';
  path: Coordinates[];
  /** Guided-tour waypoints (pause + optional narration), timed from the trigger moment. */
  stops?: PathStop[];
  triggerRadius: number;
  speed: number;
  endBehavior: PathEndBehavior;
  /** "Wait for the listener" — see PathAudioPoint. The source pauses along the path
   *  whenever the user steps outside `waitRadius`, resuming when they return. */
  waitForListener?: boolean;
  /** Leash radius (m) for `waitForListener`. Absent = use `triggerRadius`. */
  waitRadius?: number;
  /** When true the client shows a compass arrow + distance to the source (wayfinding). */
  showWayfinding?: boolean;
}

/** Discriminated union over `type`. */
export type AudioPoint =
  | StaticPoint
  | StaticCirclingPoint
  | PathAudioPoint
  | FollowUserPoint
  | PathTriggeredPoint;

/** Reverb character of an acoustic zone — maps to a synthesized impulse response. */
export type ReverbCharacter = 'room' | 'hall' | 'cathedral' | 'tunnel' | 'outdoor';

/**
 * A polygonal region that colours the whole soundscape while the listener is inside
 * it: a reverb tail (its `reverb` character at `wet` strength) and an optional diffuse
 * ambient bed. Walking under the bridge floods everything with reverb; stepping into
 * the chapel hushes and lengthens every tail.
 */
export interface AcousticZone {
  id: string;
  name: string;
  /** Polygon vertices (>= 3), in order. */
  polygon: Coordinates[];
  reverb: ReverbCharacter;
  /** Reverb send strength 0..1. */
  wet: number;
  /** Optional looping, non-spatialized ambient bed heard throughout the zone. */
  ambienceUrl?: string;
  /** Ambient bed loudness 0..1. */
  ambienceVolume?: number;
}

/** A collection of audio points that form one experience. */
export interface Course {
  id: string;
  name: string;
  description?: string;
  /** The superuser who owns/authored this course (null for legacy/admin-created). */
  ownerId?: string | null;
  /** Acoustic zones (reverb + ambient beds) painted over the course area. */
  zones?: AcousticZone[];
  /**
   * When true, the client always shows a compass cue + distance to the course's
   * start point (the first point, or its first path vertex). If that first point is
   * a moving guide, the cue also shows an ETA for when it returns to the start.
   */
  showStartWayfinding?: boolean;
  /** When the course was last published (frozen for listeners), or null/absent if never. */
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The frozen, playable snapshot stored when a course is published. */
export interface PublishedSnapshot {
  name: string;
  description?: string;
  showStartWayfinding?: boolean;
  zones?: AcousticZone[];
  points: AudioPoint[];
  publishedAt: string;
}

/** What a listener gets for a course: the published snapshot as a playable course + points. */
export interface PublishedCourse {
  course: Course;
  points: AudioPoint[];
  /** True when this is the frozen published version (false = live-draft fallback). */
  published: boolean;
}

/** Severity of a pre-publish flight-check finding. */
export type FlightSeverity = 'error' | 'warning';

/** One issue found by the pre-publish flight check / flag linter. */
export interface FlightIssue {
  severity: FlightSeverity;
  message: string;
  /** The offending point, when the issue is point-specific. */
  pointId?: string;
}

/**
 * User role.
 * - basic:     registered, no authoring privileges yet (awaiting promotion).
 * - superuser: creates and manages their OWN courses + points.
 * - admin:     manages ALL courses + points, and user accounts/roles.
 */
export type Role = 'basic' | 'superuser' | 'admin';

/** An account (never carries the password hash to the client). */
export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/** Returned by /api/auth/login and /api/auth/register. */
export interface AuthResult {
  token: string;
  user: User;
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
export type CourseInput = Pick<
  Course,
  'name' | 'description' | 'showStartWayfinding' | 'zones'
>;

/** Result of an audio-file upload. */
export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
}

/** One clip as listed in the sound library (existence from disk, description from the DB). */
export interface UploadListItem {
  url: string;
  filename: string;
  size: number;
  /** Author-set label for the clip, if any. */
  description?: string;
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
