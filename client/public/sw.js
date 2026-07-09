/*
 * AudioWorld offline service worker.
 *
 * Deliberately minimal: it never precaches the app shell and never *writes* to the
 * cache on fetch. The only thing it does is serve a course's audio + map tiles from
 * a cache that the page explicitly filled via "Download for offline" (see
 * services/offline.ts). So the cache is bounded entirely by what the user chose to
 * download, and the SW can't silently bloat storage or shadow a fresh app deploy.
 *
 * Result: you load a walk at the trailhead with signal, tap Download, then keep
 * hearing sources and seeing the map as you walk through a dead zone.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Which requests are eligible to be served from an offline pack.
function isPackable(url) {
  // OpenStreetMap tiles (the map) — served subdomain-less so the cached URL matches
  // exactly what Leaflet requests at runtime.
  if (url.host === 'tile.openstreetmap.org') return true;
  // Uploaded audio clips, wherever the API lives (same-origin in prod, :3001 in dev).
  if (url.pathname.startsWith('/uploads/')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (!isPackable(url)) return;

  // Cache-first across every aw-pack-* cache, then fall through to the network. We do
  // NOT cache the network result here — only the explicit download populates the pack.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req))
  );
});
