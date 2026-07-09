import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type {
  AcousticZone,
  AudioPoint,
  Course,
  CourseBundle,
  CourseBundleAsset,
} from '@audioworld/shared';
import { UPLOAD_DIR } from '../env';

const UPLOADS_PREFIX = '/uploads/';

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
};
const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/webm': '.webm',
  'audio/flac': '.flac',
};

const mimeForFile = (filename: string): string =>
  MIME_BY_EXT[extname(filename).toLowerCase()] ?? 'audio/mpeg';

/** A safe file extension for an imported asset — from its mime, else its own name. */
export function extForAsset(asset: CourseBundleAsset): string {
  return EXT_BY_MIME[asset.mime] ?? MIME_BY_EXT[extname(asset.filename).toLowerCase()] ?? '.mp3';
}

/** Every distinct `/uploads/...` clip a course references (points, path stops, zones). */
export function collectAssetUrls(points: AudioPoint[], zones: AcousticZone[]): string[] {
  const urls = new Set<string>();
  const add = (u: string | undefined): void => {
    if (u && u.startsWith(UPLOADS_PREFIX)) urls.add(u);
  };
  for (const p of points) {
    add(p.audio.url);
    if ((p.type === 'path' || p.type === 'path_triggered') && p.stops) {
      for (const s of p.stops) add(s.audio?.url);
    }
  }
  for (const z of zones) add(z.ambienceUrl);
  return [...urls];
}

/**
 * Read a `/uploads/...` clip off disk for bundling. Guarded to a bare filename that
 * resolves to a real file inside UPLOAD_DIR, so a crafted url can't read outside it.
 * Returns null for anything missing or suspicious (skip, don't fail the whole export).
 */
function readAsset(url: string): CourseBundleAsset | null {
  const filename = url.slice(UPLOADS_PREFIX.length);
  if (basename(filename) !== filename) return null; // rejects '..', subpaths
  const full = join(UPLOAD_DIR, filename);
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return {
    url,
    filename,
    mime: mimeForFile(filename),
    data: readFileSync(full).toString('base64'),
  };
}

/** Build a self-contained bundle for a course + its points (reads asset files). */
export function buildBundle(course: Course, points: AudioPoint[]): CourseBundle {
  const zones = course.zones ?? [];
  const assets = collectAssetUrls(points, zones)
    .map(readAsset)
    .filter((a): a is CourseBundleAsset => a !== null);
  return {
    format: 'audioworld-course',
    version: 1,
    exportedAt: new Date().toISOString(),
    course: {
      name: course.name,
      description: course.description,
      showStartWayfinding: course.showStartWayfinding,
      eyesUp: course.eyesUp,
      zones,
    },
    points,
    assets,
  };
}

/** Rewrite every audio url in a point through the old→new asset map (for import). */
export function rewritePointUrls(point: AudioPoint, map: Map<string, string>): AudioPoint {
  const remap = (u: string): string => map.get(u) ?? u;
  const next: AudioPoint = {
    ...point,
    audio: { ...point.audio, url: remap(point.audio.url) },
  };
  if ((next.type === 'path' || next.type === 'path_triggered') && next.stops) {
    next.stops = next.stops.map((s) =>
      s.audio ? { ...s, audio: { ...s.audio, url: remap(s.audio.url) } } : s
    );
  }
  return next;
}

/** Rewrite zone ambience urls through the old→new asset map (for import). */
export function rewriteZoneUrls(zones: AcousticZone[], map: Map<string, string>): AcousticZone[] {
  return zones.map((z) =>
    z.ambienceUrl ? { ...z, ambienceUrl: map.get(z.ambienceUrl) ?? z.ambienceUrl } : z
  );
}
