/* Draw, Partner! offline helper (2026-11-03, install to home screen). Network first, so a new version is always
   what you get when you're online; every file it fetches is kept, so a game opened from the home screen with no
   signal still plays. The page and its scripts carry ?v= versions, so an old copy is never paired with a new one. */
const CACHE = 'draw-partner-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: false }).then(hit => hit || caches.match(req, { ignoreSearch: true }))));
});
