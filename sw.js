const CACHE_NAME = 'enthub-cache-v1';
const urlsToCache = [
  '/nuove-uscite-app/',
  '/nuove-uscite-app/index.html',
  '/nuove-uscite-app/top.html',
  '/nuove-uscite-app/target.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Strategia: Network first, falling back to cache.
// Utile per avere sempre i JSON aggiornati quando c'è rete.
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});