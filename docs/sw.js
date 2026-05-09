/**
 * LCJRU Fixtures — service worker.
 *
 * Strategy:
 *   - HTML navigations         → network-first with cache fallback
 *     (so a fresh deploy lands without a manual SHELL_CACHE bump; cache
 *     only wins when the user is offline)
 *   - other same-origin assets → stale-while-revalidate
 *     (instant render from cache, refreshed in the background — keeps
 *     render.mjs / config.js / manifest / icons updates one reload away)
 *   - cross-origin CDN images  → network-first with cache fallback
 *
 * Bumping SHELL_CACHE / DATA_CACHE versions still helps when an asset is
 * removed or renamed entirely. The activate handler deletes any cache that
 * doesn't match the current pair.
 */

const SHELL_CACHE = 'lcjru-shell-v1';
const DATA_CACHE = 'lcjru-data-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'venues.html',
  'render.mjs',
  'config.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-512-maskable.png',
  'assets/apple-touch-icon-180.png',
];

const DATA_PATHS = ['fixtures.json', 'lineups.json', 'events.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== SHELL_CACHE && n !== DATA_CACHE).map((n) => caches.delete(n)),
    )).then(() => self.clients.claim()),
  );
});

function isDataRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return DATA_PATHS.some((p) => url.pathname.endsWith('/' + p))
      || url.pathname.endsWith('.ics');
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    // Offline — try the requested URL, fall back to the precached index.
    const cached = await cache.match(request) || await cache.match('index.html') || await cache.match('./');
    if (cached) return cached;
    throw err;
  }
}

async function networkFirstCrossOrigin(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    // GoatCounter loader + count beacon: let the browser handle directly so
    // analytics aren't served from cache (would suppress every repeat event).
    if (url.host === 'gc.zgo.at' || url.host.endsWith('.goatcounter.com')) return;
    // CDN crests etc. — keep the page resilient when offline.
    event.respondWith(networkFirstCrossOrigin(request));
    return;
  }

  // HTML navigations are network-first so a fresh deploy lands without a
  // manual SHELL_CACHE bump; cache only wins when the user is offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // All other same-origin requests (JS / icons / manifest) → SWR via SHELL_CACHE.
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
