'use strict';
/* 1960 — THE build number, set here and nowhere else (PRINCIPLES 24).
 *
 * Bump it after any change to a script, a picture, a baked scene or the
 * manifest. Everything that caches keys on it:
 *   - sw.js names its cache `m60-<build>` and drops every older one;
 *   - m60-art.js puts it on every picture (`art/c12.webp?v=<build>`) and
 *     every scene plate (`scenes/...?v=<build>`);
 *   - the telly and the phone show it in "What this is" / the lobby footer,
 *     so "which version is this phone on?" has an answer.
 * The server sends `cache-control: no-store`, so the browser's own HTTP cache
 * is not in play; the offline helper is the only cache, and it is
 * network-first, so a phone that can reach the hub always gets the new files.
 */
(function (root) {
  root.M60_BUILD = '2026-11-20.3';
})(typeof self !== 'undefined' ? self : this);
