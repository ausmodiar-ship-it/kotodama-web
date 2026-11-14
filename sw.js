// Keeps Kotodama opening with no signal. App files: served from the cache at once and refreshed
// in the background (the new version shows on the next launch). The dictionary and sentence
// files are not cached here: the app stores them on the phone itself.
const CACHE = 'kotodama-v3';
const SHELL = ['./', './index.html', './app.js', './app.css', './manifest.webmanifest', './icon.svg', './apple-touch-icon.png', './pwa-192x192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'kotodama-ocr').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Photo reader (Tesseract.js + its Japanese model): fetched once, then kept for offline use
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open('kotodama-ocr').then(async (cache) => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
  if (url.origin !== location.origin || url.pathname.includes('/dict/')) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = e.request.mode === 'navigate' ? './index.html' : e.request;
      const cached = await cache.match(key);
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
