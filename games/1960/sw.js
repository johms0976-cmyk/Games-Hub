'use strict';
/* 1960 — the offline helper (PRINCIPLES 13). Network first, always: the hub is
 * a live room, so a cached page must never stand in for one the server can
 * still send. The cache only answers when the network does not — a phone that
 * lost the Wi-Fi for a moment still opens the page and shows "reconnecting…"
 * instead of the browser's dinosaur.
 *
 * The cache is named after the one build number (m60-build.js); a new build
 * empties the old cache on activation.
 */
importScripts('m60-build.js');
const CACHE = 'm60-' + self.M60_BUILD;
const SHELL = ['index.html', 'telly.html', 'hub.js', 'solo-room.js', 'solo-host.js', 'sound.js', 'm60-build.js', 'm60-data.js', 'm60-art.js', 'm60-words.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'portraits/K.png', 'portraits/N.png', 'avatar.js', 'finale.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.indexOf('m60-') === 0 && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);
  /* Only this origin's plain GETs; the room's socket and its API go straight through. */
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/ws') === 0 || u.pathname.indexOf('/api') === 0) return;
  e.respondWith(fetch(r).then(res => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
