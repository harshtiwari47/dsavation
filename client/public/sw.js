// DSAvation Service Worker
const CACHE_NAME = 'dsavation-pwa-v5';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/technovation-logo-tp.webp'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => { });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) return;

  // Navigation requests: network first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        try {
          return await caches.match('/index.html') || Response.error();
        } catch {
          return Response.error();
        }
      })
    );
    return;
  }

  event.respondWith((async () => {
    try {
      const cached = await caches.match(event.request);
      if (cached) return cached;
    } catch { }

    try {
      return await fetch(event.request);
    } catch {
      return Response.error();
    }
  })());
});
