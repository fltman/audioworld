import type { BBox, DiscoveredPlace, PlaceCategory } from '@audioworld/shared';

// Public Overpass mirrors, tried in order — the main instance is frequently busy (504).
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** OSM selectors per category. `{{bbox}}` is substituted with the query bounds. Only
 *  named elements are useful, so every selector requires a name. */
const CATEGORY_FILTERS: Record<PlaceCategory, string[]> = {
  museum: ['node["tourism"~"^(museum|gallery)$"]["name"]', 'way["tourism"~"^(museum|gallery)$"]["name"]'],
  historic: ['node["historic"]["name"]', 'way["historic"]["name"]'],
  artwork: ['node["tourism"="artwork"]["name"]'],
  viewpoint: ['node["tourism"="viewpoint"]["name"]'],
  attraction: ['node["tourism"="attraction"]["name"]', 'way["tourism"="attraction"]["name"]'],
  religious: ['node["amenity"="place_of_worship"]["name"]', 'way["amenity"="place_of_worship"]["name"]'],
  park: ['way["leisure"~"^(park|garden)$"]["name"]', 'node["natural"~"^(peak|spring)$"]["name"]'],
};

const MAX_RESULTS = 80;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

// OSM/Overpass policy REQUIRES a descriptive User-Agent identifying the app; without one
// the servers reject the request (overpass-api.de returns 406). Node's fetch sends none,
// so we must set it explicitly.
const REQUEST_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'AudioWorld/1.0 (+https://audioworld.bjarby.com)',
  Accept: 'application/json',
};

/** Build the Overpass QL for the selected categories within a bbox. */
function buildQuery(bbox: BBox, categories: PlaceCategory[]): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const parts: string[] = [];
  for (const c of categories) {
    for (const sel of CATEGORY_FILTERS[c] ?? []) parts.push(`  ${sel}(${b});`);
  }
  return `[out:json][timeout:25];\n(\n${parts.join('\n')}\n);\nout center ${MAX_RESULTS};`;
}

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** The category-ish label for an element, from whichever tag matched. */
function kindOf(t: Record<string, string>): string {
  return t.tourism ?? t.historic ?? t.amenity ?? t.leisure ?? t.natural ?? 'place';
}

/** A discovery error carrying a client-safe status + message. */
export class DiscoverError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * Find notable places of the given categories within a bbox, via OpenStreetMap
 * (Overpass). Times out and falls through mirrors so a busy instance doesn't hang the
 * request. Returns named places, deduped and capped.
 */
export async function discoverPlaces(
  bbox: BBox,
  categories: PlaceCategory[]
): Promise<DiscoveredPlace[]> {
  const query = buildQuery(bbox, categories);
  let lastStatus = 502;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: REQUEST_HEADERS,
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        lastStatus = res.status === 429 || res.status === 504 ? 503 : 502;
        continue; // busy / rate-limited — try the next mirror
      }
      // Guard against an oversized body (results are capped at 80, so this is huge).
      if (Number(res.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES) {
        lastStatus = 502;
        continue;
      }
      // The parse is INSIDE the try so a non-JSON 200 or a timeout mid-body falls
      // through to the next mirror instead of throwing a raw 500.
      const data = (await res.json()) as { elements?: OverpassEl[] };
      return parseElements(data.elements ?? []);
    } catch {
      lastStatus = 504; // timeout / network / bad body — try the next mirror
    }
  }
  throw new DiscoverError(
    lastStatus === 503
      ? 'The map database is busy right now — try again in a moment.'
      : 'Could not reach the map database.',
    lastStatus
  );
}

function parseElements(elements: OverpassEl[]): DiscoveredPlace[] {
  const seen = new Set<string>();
  const out: DiscoveredPlace[] = [];
  for (const e of elements) {
    const t = e.tags;
    if (!t?.name) continue;
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (lat == null || lng == null) continue;
    // Dedupe on name + rough position (ways + nodes can echo the same place).
    const key = `${t.name}@${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const place: DiscoveredPlace = { name: t.name, lat, lng, kind: kindOf(t) };
    if (t.description) place.description = t.description.slice(0, 400);
    if (t.wikipedia) place.wikipedia = t.wikipedia;
    out.push(place);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}
