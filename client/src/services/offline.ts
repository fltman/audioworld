import type { AcousticZone, AudioPoint } from '@audioworld/shared';
import { courseBounds } from '@audioworld/shared';
import { absoluteAudioUrl } from '../api';

/**
 * Offline course packs. The page precaches a walk's audio clips + the OpenStreetMap
 * tiles covering its footprint into a per-course Cache, and the service worker
 * (public/sw.js) serves them cache-first. You download at the trailhead with signal,
 * then keep hearing sources and seeing the map through a dead zone.
 */

const PACK_VERSION = 'v1';
const TILE_HOST = 'https://tile.openstreetmap.org';
// z15 is the coarse floor (always cached so the map is never blank); z16 adds street
// detail only when it fits under the cap. The cap keeps us polite to OSM's tile
// usage policy and bounds device storage.
const ZOOMS = [15, 16] as const;
const MAX_TILES = 320;
const TILE_MARGIN = 1; // one extra tile ring so the map isn't cut off at the edges
const TILE_BATCH = 6; // small concurrency — don't hammer the tile server

const cacheName = (courseId: string): string => `aw-pack-${PACK_VERSION}-${courseId}`;
const markerKey = (courseId: string): string => `aw-pack:${courseId}`;

export interface PackMeta {
  at: number;
  tiles: number;
  audio: number;
  /** True if the footprint was too big for full z16 detail (coarser map only). */
  capped: boolean;
}

export interface PackProgress {
  done: number;
  total: number;
}

/** Offline packs need both the Cache API and a controlling service worker. */
export function offlineSupported(): boolean {
  return typeof caches !== 'undefined' && 'serviceWorker' in navigator;
}

/** Metadata for a downloaded pack, or null if this course isn't downloaded. */
export function packMeta(courseId: string): PackMeta | null {
  try {
    const raw = localStorage.getItem(markerKey(courseId));
    return raw ? (JSON.parse(raw) as PackMeta) : null;
  } catch {
    return null;
  }
}

// --- URL collection --------------------------------------------------------

/** Every audio clip a course plays: point clips, path-stop clips, zone ambience. */
function audioUrlsOf(points: AudioPoint[], zones: AcousticZone[]): string[] {
  const urls = new Set<string>();
  for (const p of points) {
    urls.add(absoluteAudioUrl(p.audio.url));
    if ((p.type === 'path' || p.type === 'path_triggered') && p.stops) {
      for (const s of p.stops) if (s.audio?.url) urls.add(absoluteAudioUrl(s.audio.url));
    }
  }
  for (const z of zones) if (z.ambienceUrl) urls.add(absoluteAudioUrl(z.ambienceUrl));
  return [...urls];
}

// Slippy-map tile coordinates (Web Mercator).
const lon2tile = (lng: number, z: number): number =>
  Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2tile = (lat: number, z: number): number => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function tilesForZoom(
  b: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  z: number
): string[] {
  const max = 2 ** z - 1;
  const clamp = (v: number): number => Math.max(0, Math.min(max, v));
  const x0 = clamp(lon2tile(b.minLng, z) - TILE_MARGIN);
  const x1 = clamp(lon2tile(b.maxLng, z) + TILE_MARGIN);
  const y0 = clamp(lat2tile(b.maxLat, z) - TILE_MARGIN); // north = smaller y
  const y1 = clamp(lat2tile(b.minLat, z) + TILE_MARGIN);
  const urls: string[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) urls.push(`${TILE_HOST}/${z}/${x}/${y}.png`);
  }
  return urls;
}

/** Tile URLs for a footprint: coarse floor always, finer zoom only if it fits the cap. */
function collectTiles(b: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}): { tiles: string[]; capped: boolean } {
  const out: string[] = [];
  let capped = false;
  for (const z of ZOOMS) {
    const tz = tilesForZoom(b, z);
    if (out.length + tz.length > MAX_TILES) {
      capped = true;
      break; // adding this (finer) zoom would blow the cap — stop at the coarser floor
    }
    out.push(...tz);
  }
  if (out.length === 0) {
    // Even the coarsest zoom alone exceeds the cap (a huge course) — take a slice.
    out.push(...tilesForZoom(b, ZOOMS[0]).slice(0, MAX_TILES));
    capped = true;
  }
  return { tiles: out, capped };
}

/** A rough count of what a download would fetch, for the pre-download prompt. */
export function packEstimate(
  points: AudioPoint[],
  zones: AcousticZone[]
): { audio: number; tiles: number } {
  const b = courseBounds(points);
  return {
    audio: audioUrlsOf(points, zones).length,
    tiles: b ? collectTiles(b).tiles.length : 0,
  };
}

// --- Download / remove ------------------------------------------------------

async function inBatches<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/**
 * Fetch and cache a course's audio + tiles. Audio is fetched CORS-readable (the app
 * decodes the bytes via decodeAudioData, so an opaque response would be useless);
 * tiles are fetched no-cors (opaque is fine for an <img>). Individual failures are
 * swallowed so one dead clip or tile can't abort the whole pack.
 */
export async function downloadPack(
  courseId: string,
  points: AudioPoint[],
  zones: AcousticZone[],
  onProgress?: (p: PackProgress) => void
): Promise<PackMeta> {
  if (!offlineSupported()) throw new Error('Offline is not available in this browser');

  const b = courseBounds(points);
  const audio = audioUrlsOf(points, zones);
  const { tiles, capped } = b ? collectTiles(b) : { tiles: [], capped: false };
  const cache = await caches.open(cacheName(courseId));

  const total = audio.length + tiles.length;
  let done = 0;
  const bump = (): void => {
    done += 1;
    onProgress?.({ done, total });
  };

  for (const u of audio) {
    try {
      const r = await fetch(u);
      if (r.ok) await cache.put(u, r);
    } catch {
      /* skip a clip that won't load */
    }
    bump();
  }

  await inBatches(tiles, TILE_BATCH, async (u) => {
    try {
      await cache.put(u, await fetch(u, { mode: 'no-cors' }));
    } catch {
      /* skip a tile that won't load */
    }
    bump();
  });

  const meta: PackMeta = { at: Date.now(), tiles: tiles.length, audio: audio.length, capped };
  try {
    localStorage.setItem(markerKey(courseId), JSON.stringify(meta));
  } catch {
    /* private mode — the cache still works this session */
  }
  return meta;
}

/** Delete a course's downloaded pack. */
export async function removePack(courseId: string): Promise<void> {
  try {
    await caches.delete(cacheName(courseId));
  } finally {
    localStorage.removeItem(markerKey(courseId));
  }
}
