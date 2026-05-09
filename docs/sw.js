/**
 * LCJRU Fixtures — service worker.
 *
 * Strategy:
 *   - app shell  (HTML / JS / icons / manifest) → cache-first, precached on install
 *   - data JSON  (fixtures, lineups, events)    → stale-while-revalidate
 *   - .ics feeds                                → stale-while-revalidate
 *   - CDN crest images (cross-origin)           → network-first, cache fallback
 *
 * Bump SHELL_CACHE / DATA_CACHE versions on every UI deploy so old shells
 * are purged. The activate handler deletes any cache that doesn't match the
 * current pair.
 */

const SHELL_CACHE = 'lcjru-shell-v1';
const DATA_CACHE = 'lcjru-data-v1';

const SHELL_FILES = [
  './',
  'index.html',
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

function isShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.ics')) return false;
  return true;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    // Navigation fallback — return the precached index for offline SPA loads.
    if (request.mode === 'navigate') {
      const fallback = await cache.match('index.html');
      if (fallback) return fallback;
    }
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
    // CDN crests etc. — keep the page resilient when offline.
    event.respondWith(networkFirstCrossOrigin(request));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isShellRequest(url)) {
    event.respondWith(cacheFirst(request));
  }
});
