// Service worker.
//  - Shell (page, CSS, bundle, icons): cache-first, so the app opens offline.
//  - Page navigations: network-first, cached copy as the fallback, so a new build is picked up.
//  - Store GET requests: network-first, cached fallback. (The app's own calls are POSTs to
//    two functions, which cannot be cached here; the app keeps its own last copy instead.)
// The cache name carries the app version and the bundle name from dist/build-info.js, which
// scripts/build.mjs writes. Never hand-edit a version here.
importScripts('./dist/build-info.js');
// eslint-disable-next-line no-undef
const INFO = self.__BUILD_INFO__ || { version: 'unknown', bundle: 'app.js' };
const SHELL = `alpal-workout-${INFO.version}-${INFO.bundle}-shell`;
const RUNTIME = `alpal-workout-${INFO.version}-runtime`;

const CRITICAL = [
  './',
  './index.html',
  './styles.css',
  `./dist/${INFO.bundle}`,
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(CRITICAL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit =
      (await cache.match(request)) || (await caches.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }
  // Video preview pictures (i.ytimg.com) are left to the browser's own HTTP cache: cached here
  // they would be opaque responses, which browsers count at several MB each.
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(networkFirst(req, RUNTIME));
  }
});

// The page tells the worker which of OUR pictures (assets/moves/*) the current program uses; they
// are kept for offline (best effort: one that cannot be fetched is skipped). Nothing from another
// origin is ever stored here.
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'cache-images' || !Array.isArray(msg.urls)) return;
  const ours = msg.urls.filter(
    (u) => typeof u === 'string' && !/^[a-z]+:/i.test(u) && !u.startsWith('//')
  );
  event.waitUntil(
    caches.open(RUNTIME).then((cache) =>
      Promise.all(
        ours.map((u) =>
          cache.match(u).then((hit) =>
            hit
              ? undefined
              : fetch(u, { mode: 'same-origin' })
                  .then((res) => cache.put(u, res))
                  .catch(() => undefined)
          )
        )
      )
    )
  );
});
