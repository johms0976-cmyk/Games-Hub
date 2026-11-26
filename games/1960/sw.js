/* build 2026-11-27.1 */
'use strict';
/* 1960 on one phone (GitHub Pages) — the offline helper.
 *
 * tools/github-sync.py copies this file over sw.js in the GitHub copy. The
 * hub keeps its own network-first sw.js, which is right for a live room; a
 * game installed on a home screen needs the opposite (PHONE-APP-LESSONS C):
 *
 *   - one cache per build, named after the one build number (m60-build.js),
 *     filled on install with the whole page and every script, fetched past
 *     the browser's own cache so a new build never stores an old file;
 *   - answered from that cache first, by exact address: a page and its
 *     scripts always come from the same build, and no old file ever stands in
 *     for a new one (no ignoreSearch);
 *   - pictures (art/…?v=<build>, scenes/…?v=<build>, portraits/…?v=<build>)
 *     are kept as they are first shown, so a game seen once plays offline;
 *   - a new build waits. No skipWaiting on install and no clients.claim: the
 *     files never change under a game in progress. The page asks it to take
 *     over ('take-over') only at the setup screen, and otherwise it takes over
 *     at the next cold start, when nothing is running;
 *   - old builds' caches are deleted when a new one takes over; other games'
 *     caches on the same site are left alone.
 */
importScripts('m60-build.js');
const VER = self.M60_BUILD;
const PREFIX = 'm60-solo-';
const CACHE = PREFIX + VER;
const SHELL = ['index.html', 'finale.js', 'sound.js', 'm60-build.js', 'm60-data.js', 'm60-engine.js', 'm60-bots.js', 'm60-art.js', 'm60-words.js', 'm60-host.js', 'm60-phone.js',
  'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  /* what the first screen shows */
  'art/map.webp?v=' + VER, 'portraits/K.png?v=' + VER, 'portraits/N.png?v=' + VER];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.indexOf(PREFIX) === 0 && k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('message', e => {
  if (e.data === 'take-over') self.skipWaiting();
});
self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    /* The page itself: this build's copy, whatever the address's query says. */
    e.respondWith(caches.open(CACHE).then(c => c.match('index.html')).then(hit => hit || fetch(r)));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => hit || fetch(r).then(res => {
    if (res && res.ok && res.type === 'basic') c.put(r, res.clone()).catch(() => {});
    return res;
  }))));
});
