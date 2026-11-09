/* btp-scene.js: the scene player (2026-11-09, docs/film-crew/SCENE-BIBLE.md). A story scene is data, a shot list
   (scenes/*.js), and this plays it on a pixel stage: one frame at the top of the phone, one balloon at a time in the
   picture, stage directions as insert shots, the pick in a dock under the frame. It grew out of the film crew's gate
   animatic (docs/film-crew/animatic/).

   The rules it keeps (the bible's grammar):
   - Art is drawn at a whole number of DEVICE pixels per art pixel (kd); a shot's size z is a whole multiple of fit
     (z2 = fit), so moving between sizes is always a cut, never a zoom.
   - One Clock: time stops while the tab is hidden or the Script is open, and every wait and tween picks up where it
     left off. Nothing waits on animationend or rAF; rAF only draws.
   - Lines auto-advance at reading pace; a tap moves one step on; Skip lands on the pick with every state applied;
     a scene never auto-advances into a pick. With reduced motion (opt.still) nothing moves and every line waits
     for a tap.
   - A balloon holds about 64 characters (SOFT); a longer line is split at full stops, and a sentence over HARD at a
     comma. The writers' words never change.

   The step vocabulary is closed: say, hold, tap, pan, prop, move, sfx, set, dir, card. A shot is
   { id, plate, cam: { x | on, dx, cy, z }, brim, dir, key, steps } or { id, choice }.

   new BtpScene(host, scene, opt).play()   opt: cut 'first'|'fast', from (a shot id to resume at), still, turbo (the
   tests: no waits), read(n) (ms a line of n characters holds), onShot(id), onEnd(option).
   BtpScene.split(text) is the balloon splitter; BtpScene.images(scene) every picture a scene uses. */
(function (root) {
  'use strict';
  const SOFT = 64, HARD = 70;
  const READ = n => Math.max(1200, Math.min(3400, 1100 + 28 * n));
  const STEPS = ['say', 'hold', 'tap', 'pan', 'prop', 'move', 'sfx', 'set', 'dir', 'card'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = s => esc(s).replace(/\*(.+?)\*/g, '<i>$1</i>');     // *draw* is the one markup
  const plain = s => String(s).replace(/\*/g, '');

  /* A line into balloons: whole if it fits, else sentences packed up to SOFT, and a sentence over HARD broken at the
     comma (or colon) nearest its middle. */
  function split(text) {
    const len = s => plain(s).length;
    if (len(text) <= SOFT) return [text];
    const sents = text.split(/(?<=[.!?…][”’"')]?)\s+(?=\S)/);
    const out = [];
    let cur = '';
    for (const s of sents) {
      if (cur && len(cur + ' ' + s) > SOFT) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
    }
    if (cur) out.push(cur);
    const brk = s => {
      if (len(s) <= HARD) return [s];
      const re = /[,:;] /g, mid = s.length / 2;
      let best = -1, m;
      while ((m = re.exec(s))) if (best < 0 || Math.abs(m.index - mid) < Math.abs(best - mid)) best = m.index;
      if (best < 0) return [s];
      return brk(s.slice(0, best + 1)).concat(brk(s.slice(best + 2)));
    };
    return out.reduce((a, s) => a.concat(brk(s)), []);
  }

  class Clock {
    constructor() { this.t = 0; this.last = performance.now(); this.paused = false; this.why = {}; this.timers = new Set(); }
    now() { return this.paused ? this.t : this.t + performance.now() - this.last; }
    hold(why, on) {
      this.why[why] = on;
      const p = Object.keys(this.why).some(k => this.why[k]);
      if (p && !this.paused) { this.t = this.now(); this.paused = true; this.timers.forEach(x => { clearTimeout(x.id); x.left = x.due - this.t; }); }
      if (!p && this.paused) { this.paused = false; this.last = performance.now(); this.timers.forEach(x => this.arm(x)); }
    }
    arm(x) { x.due = this.now() + x.left; x.id = setTimeout(() => { this.timers.delete(x); x.fn(); }, Math.max(0, x.left)); }
    after(ms, fn) { const x = { left: ms, fn }; this.timers.add(x); if (!this.paused) this.arm(x); return () => { clearTimeout(x.id); this.timers.delete(x); }; }
    clear() { this.timers.forEach(x => clearTimeout(x.id)); this.timers.clear(); }
  }

  // your hat from behind, in the foreground of an over-the-shoulder shot: you are the camera (rule 4). Art pixels.
  const BRIM = [[16, 0, 16, 2], [14, 2, 20, 9], [0, 8, 5, 3], [43, 8, 5, 3], [2, 10, 44, 3], [0, 11, 48, 3], [4, 14, 40, 2],
    [10, 16, 30, 3], [4, 19, 44, 30]];

  const CSS = `
#scene { position: fixed; inset: 0; z-index: 65; background: #1c120d; overflow: hidden; font-family: Bitter, Georgia, serif; -webkit-tap-highlight-color: transparent; }
#scene[hidden] { display: none; }
.sp-stage { position: absolute; top: 0; overflow: hidden; touch-action: manipulation; user-select: none; -webkit-user-select: none; cursor: pointer; }
.sp-world, .sp-fg, .sp-fx { position: absolute; left: 0; top: 0; }
.sp-world > *, .sp-fg > * { position: absolute; display: block; image-rendering: pixelated; }
.sp-brim i { position: absolute; background: #140c08; }
.sp-clouds { background-repeat: repeat-x; image-rendering: pixelated; }
.sp-text { white-space: nowrap; font-family: "Pixelify Sans", monospace; line-height: 1; translate: -50% -50%; }
.sp-text.stencil { color: #3a2414; opacity: .85; letter-spacing: .08em; }
.sp-text.inmate { color: #c0201a; border: .12em solid #c0201a; padding: .05em .25em; font-weight: 700; rotate: -4deg; letter-spacing: .06em; }
.sp-words { position: absolute; inset: 0; pointer-events: none; }
.sp-b { position: absolute; box-sizing: border-box; max-width: min(250px, calc(100% - 28px)); background: #fffaf0; color: #3a2a20; border: 3px solid #2a1b16;
  border-radius: 12px; padding: 6px 11px 7px; font: 16px/1.3 Bitter, Georgia, serif; box-shadow: 0 3px 0 rgba(30, 18, 14, .35); }
.sp-b p { margin: 0; }
.sp-b.dim { background: #e6dccb; color: #7a6a5a; border-color: #7a6a5a; box-shadow: none; }
.sp-b.dim::before { border-top-color: #7a6a5a; } .sp-b.dim::after { border-top-color: #e6dccb; }
.sp-b::before, .sp-b::after { content: ""; position: absolute; border: solid transparent; }
.sp-b.down::before, .sp-b.you::before { left: var(--tx); bottom: -17px; margin-left: -9px; border-width: 14px 9px 0; border-top-color: #2a1b16; }
.sp-b.down::after, .sp-b.you::after { left: var(--tx); bottom: -11px; margin-left: -6px; border-width: 10px 6px 0; border-top-color: #fffaf0; }
.sp-b.you { --tx: 40px; left: 18%; bottom: 17px; background: #f3e3c0; }
.sp-b.you::after { border-top-color: #f3e3c0; }
.sp-b.off.l::before { left: -17px; top: 10px; border-width: 8px 14px 8px 0; border-right-color: #2a1b16; }
.sp-b.off.l::after { left: -11px; top: 12px; border-width: 6px 10px 6px 0; border-right-color: #fffaf0; }
.sp-b.off.r::before { right: -17px; top: 10px; border-width: 8px 0 8px 14px; border-left-color: #2a1b16; }
.sp-b.off.r::after { right: -11px; top: 12px; border-width: 6px 0 6px 10px; border-left-color: #fffaf0; }
.sp-sfxw { position: absolute; translate: -50% -50%; rotate: -6deg; font: 700 30px/1 "Pixelify Sans", monospace; color: #fff3d0; letter-spacing: .04em; white-space: nowrap; pointer-events: none;
  text-shadow: 3px 0 #2a1b16, -3px 0 #2a1b16, 0 3px #2a1b16, 0 -3px #2a1b16, 3px 3px #2a1b16, -3px 3px #2a1b16, 3px -3px #2a1b16, -3px -3px #2a1b16, 0 6px rgba(0,0,0,.3); }
.sp-sfxw.s { font-size: 16px; rotate: 0deg; color: #3a2a20; text-shadow: none; opacity: .8; }
.sp-skip, .sp-script { position: absolute; top: 10px; z-index: 5; min-height: 34px; padding: 4px 12px; border: 2px solid rgba(255, 246, 220, .7); border-radius: 17px;
  background: rgba(28, 18, 13, .55); color: #fff6dc; font: 600 14px/1 Bitter, Georgia, serif; cursor: pointer; }
.sp-skip { right: 10px; } .sp-script { left: 10px; }
.sp-skip[hidden], .sp-script[hidden], .sp-more[hidden] { display: none; }
.sp-more { position: absolute; right: 14px; bottom: 10px; color: #fff6dc; font-style: normal; font-size: 18px; text-shadow: 0 2px 0 #2a1b16; animation: spblink 1s steps(2) infinite; }
@keyframes spblink { 50% { opacity: .2; } }
.sp-card { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; background: #1c120d; }
.sp-card b { font: 700 34px/1.2 "Pixelify Sans", monospace; color: #f3d070; text-align: center; padding: 0 16px; }
.sp-card.slam b { translate: 0 4px; }
.sp-dock { position: absolute; box-sizing: border-box; padding: 10px 12px max(10px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px; overflow-y: auto;
  background: linear-gradient(#3a2418, #24160f); border-top: 3px solid #120b08; color: #f6efe2; }
.sp-head { margin: 0; font: 700 17px/1.2 "Pixelify Sans", Bitter, monospace; color: #f3d070; letter-spacing: .03em; }
.sp-status { margin: 0; min-height: 16px; font: 13px/1.25 Bitter, Georgia, serif; color: #e8c890; }
.sp-hint { margin: 0; font: italic 14px/1.3 Bitter, Georgia, serif; color: #bfa98a; }
.sp-tags { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sp-tag { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 84px; padding: 8px 4px 6px 10px; cursor: pointer;
  background: #e9d6a6; color: #3a2a20; border: 2px solid #6b4a2a; border-radius: 4px 12px 12px 4px; font: 600 13px/1.2 Bitter, Georgia, serif; text-align: center; box-shadow: 0 3px 0 rgba(0,0,0,.35); }
.sp-tag::before { content: ""; position: absolute; left: 4px; top: 50%; width: 7px; height: 7px; margin-top: -4px; border-radius: 50%; background: #3a2418; }
.sp-tag img { width: 52px; height: 52px; image-rendering: pixelated; }
.sp-tag[aria-pressed="true"] { translate: 0 -3px; outline: 3px solid #f3d070; }
.sp-tag:disabled { opacity: .45; cursor: default; }
.sp-rules { margin: 0; min-height: 2.6em; font: 14px/1.3 Bitter, Georgia, serif; color: #f6efe2; }
.sp-rules b { color: #f3d070; }
.sp-take { min-height: 48px; border: 3px solid #4a2626; border-radius: 10px; background: #7a3b2a; color: #fbf3e2; font: 600 18px/1 "Pixelify Sans", Georgia, serif; cursor: pointer; }
.sp-take:disabled { opacity: .5; cursor: default; }
.sp-sheet { position: absolute; inset: 0; z-index: 9; display: flex; flex-direction: column; background: rgba(20, 12, 8, .88); padding: 16px; box-sizing: border-box; }
.sp-sheet[hidden] { display: none; }
.sp-page { flex: 1; overflow-y: auto; max-width: 440px; width: 100%; margin: 0 auto; box-sizing: border-box; padding: 18px 20px; background: #f6f0e0; color: #1e1712;
  font: 14px/1.45 "Courier New", Courier, monospace; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
.sp-page .dir { margin: 14px 0 6px; font-style: italic; } .sp-page .dir:first-child { margin-top: 0; }
.sp-page .who { margin: 12px 0 0; text-align: center; text-transform: uppercase; letter-spacing: .04em; }
.sp-page .ln { margin: 0 auto; max-width: 30ch; }
.sp-close { margin: 12px auto 0; min-height: 44px; padding: 0 20px; border-radius: 10px; border: 3px solid #4a2626; background: #f3e3c0; font: 600 15px Bitter, Georgia, serif; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .sp-more { animation: none; } }
`;
  function addCSS() {
    if (typeof document === 'undefined' || document.getElementById('sp-css')) return;
    const s = document.createElement('style');
    s.id = 'sp-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  class BtpScene {
    constructor(host, scene, opt) {
      addCSS();
      this.host = host; this.S = scene; this.opt = opt || {}; this.clock = new Clock();
      this.still = !!this.opt.still; this.turbo = !!this.opt.turbo; this.read = this.opt.read || READ;
      this.state = {}; this.log = []; this.pending = null; this.skipping = false; this.swallow = 0; this.dead = false; this.offs = [];
      host.innerHTML = '<div class="sp-stage" role="img" aria-label="' + esc(scene.title || 'A scene') + '"><div class="sp-world"></div><div class="sp-fg"></div><div class="sp-words" aria-live="polite"></div>' +
        '<div class="sp-fx"></div><button class="sp-script" hidden>Script</button><button class="sp-skip" hidden>Skip ›</button><i class="sp-more" hidden>▼</i></div>' +
        '<div class="sp-dock"></div><div class="sp-sheet" hidden><div class="sp-page"></div><button class="sp-close">Back to the scene</button></div>';
      const $ = c => host.querySelector(c);
      Object.assign(this, { stage: $('.sp-stage'), world: $('.sp-world'), fg: $('.sp-fg'), words: $('.sp-words'), fxl: $('.sp-fx'),
        skipB: $('.sp-skip'), scriptB: $('.sp-script'), moreI: $('.sp-more'), dock: $('.sp-dock'), sheet: $('.sp-sheet') });
      this.dockIdle();
      const on = (t, ev, f, o) => { t.addEventListener(ev, f, o); this.offs.push(() => t.removeEventListener(ev, f, o)); };
      // a tap moves one step on, on pointerup; the click after it is swallowed, so it can't land on whatever the tap
      // just put under the finger (memory: touch ghost-clicks)
      on(this.stage, 'pointerup', e => { if (e.target.closest && e.target.closest('button')) return; this.swallow = performance.now() + 400; this.tap(); });
      on(document, 'click', e => { if (performance.now() < this.swallow && !(e.target.closest && e.target.closest('.sp-skip,.sp-script,.sp-close'))) { e.stopPropagation(); e.preventDefault(); } }, true);
      on(document, 'keydown', e => {
        if (!this.sheet.hidden) { if (e.key === 'Escape') { e.stopPropagation(); this.script(false); } return; }
        if ((e.key === ' ' || e.key === 'Enter') && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); e.stopPropagation(); this.tap(); }
        if (e.key === 'Escape') { e.stopPropagation(); this.skip(); }
      }, true);
      on(document, 'visibilitychange', () => this.clock.hold('hidden', document.hidden));
      let rz = 0;
      on(root, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (this.dead) return; this.layout(); if (this.shot) this.draw(this.shot, true); }, 250); });
      this.skipB.onclick = () => this.skip();
      this.scriptB.onclick = () => this.script(true);
      $('.sp-close').onclick = () => this.script(false);
      this.layout();
    }
    destroy() {
      this.dead = true;
      if (this.tok) this.tok.dead = true;
      if (this.pickTok) this.pickTok.dead = true;
      if (this.pending) { const p = this.pending; this.pending = null; p.res(); }
      this.clock.clear();
      this.offs.forEach(f => f()); this.offs = [];
      this.host.innerHTML = '';
    }

    /* ---- the frame: the full width (to 480) and about 2/3 of the height, the dock under it ---- */
    layout() {
      const dpr = this.dpr = root.devicePixelRatio || 1, vw = root.innerWidth || 375, vh = root.innerHeight || 812;
      this.Wd = Math.floor(Math.min(vw, 480) * dpr);
      this.Hd = Math.floor(Math.max(200, Math.min(vh * 0.66, vh - 240)) * dpr);
      this.W = this.Wd / dpr; this.H = this.Hd / dpr;
      const left = Math.round((vw * dpr - this.Wd) / 2) / dpr;
      Object.assign(this.stage.style, { left: left + 'px', width: this.W + 'px', height: this.H + 'px' });
      Object.assign(this.dock.style, { left: left + 'px', width: this.W + 'px', top: this.H + 'px', height: (vh - this.H) + 'px' });
      this.kFit = Math.ceil(this.Wd / this.S.fitW);             // fewest device px per art px that span the width
    }
    kdOf(z) { return Math.max(1, Math.round(this.kFit * z / 2)); }
    box(e, x, y, w, h) { const k = this.k; Object.assign(e.style, { left: x * k + 'px', top: y * k + 'px' }); if (w != null) Object.assign(e.style, { width: w * k + 'px', height: h * k + 'px' }); return e; }
    add(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; (parent || this.world).appendChild(e); return e; }
    img(src, x, y, w, h, kd) {
      const e = this.add('img'); e.src = src; e.alt = ''; e.draggable = false;
      const s = (kd || this.kd) / this.dpr;
      Object.assign(e.style, { left: x * this.k + 'px', top: y * this.k + 'px', width: w * s + 'px', height: h * s + 'px' });
      return e;
    }
    draw(shot, again) {
      this.shot = shot; const P = this.plate = this.S.plates[shot.plate];
      this.kd = this.kdOf(shot.cam.z); this.k = this.kd / this.dpr;
      const keep = again ? [...this.words.children] : null;
      this.world.innerHTML = ''; this.fg.innerHTML = ''; this.words.innerHTML = ''; this.fxl.innerHTML = ''; this.els = {};
      this.stage.style.background = P.bg;
      if (P.clouds) { const c = this.box(this.add('i', 'sp-clouds'), 0, -P.clouds.h - 2, P.w, P.clouds.h); c.style.backgroundImage = 'url(' + P.clouds.img + ')'; c.style.backgroundSize = P.clouds.w * this.k + 'px ' + P.clouds.h * this.k + 'px'; }
      if (P.img) this.img(P.img, 0, 0, P.w, P.h);
      const rect = r => { const e = this.box(this.add('i'), r.x, r.y, r.w, r.h); e.style.background = r.c; };
      (P.rects || []).filter(r => !r.front).forEach(rect);
      (P.imgs || []).forEach(m => this.img(m.img, m.x, m.y, m.w, m.h));
      Object.keys(P.actors || {}).forEach(id => { const a = P.actors[id], c = this.S.cast[id]; this.els[id] = this.img(c.img, a.x - c.w / 2, a.y - c.h, c.w, c.h); });
      (P.rects || []).filter(r => r.front).forEach(rect);
      (P.texts || []).forEach(t => this.text(t));
      if (shot.brim) {        // your hat and shoulder from behind, near the camera so a size up, cut by the frame's corner
        // (never taller than half the frame, so a short landscape frame still shows who you're looking at)
        const kb = Math.max(1, Math.min(Math.round(this.kd * 1.5), Math.floor(this.Hd * 0.5 / 49))), s = kb / this.dpr, w = 48 * kb, h = 49 * kb, e = this.add('div', 'sp-brim', this.fg);
        Object.assign(e.style, { left: Math.round(-0.22 * w) / this.dpr + 'px', top: (this.Hd - Math.round(0.42 * h)) / this.dpr + 'px', width: w / this.dpr + 'px', height: h / this.dpr + 'px' });
        e.innerHTML = BRIM.map(r => '<i style="left:' + r[0] * s + 'px;top:' + r[1] * s + 'px;width:' + r[2] * s + 'px;height:' + r[3] * s + 'px"></i>').join('');
      }
      this.cam = this.camFor(shot.cam); this.shk = 0; this.place();
      if (keep) keep.forEach(b => this.words.appendChild(b));
      else if (shot.dir) this.log.push({ dir: shot.dir });
    }
    // where the camera is: an x at the frame's centre and the art row on its bottom edge. `on` frames an actor's head
    // a little above the middle, but never lets the frame's bottom drop below the plate (the waist rule)
    camFor(c) {
      const P = this.plate, vh = this.Hd / this.kd;
      let x = c.x, by = c.cy != null ? Math.round(c.cy + vh / 2) : P.h;
      if (c.on) { const a = P.actors[c.on], top = a.y - this.S.cast[c.on].h; x = a.x + (c.dx || 0); by = Math.min(P.h, Math.max(top + 24, Math.round(top + vh * 0.55))); }
      return { x, by };
    }
    place() {
      const P = this.plate, vw = this.Wd / this.kd;
      const x = P.w >= vw ? Math.max(vw / 2, Math.min(P.w - vw / 2, this.cam.x)) : P.w / 2;
      this.ox = Math.round(this.Wd / 2 - x * this.kd); this.oy = Math.round(this.Hd - this.cam.by * this.kd);
      this.world.style.transform = 'translate(' + (this.ox + this.shk) / this.dpr + 'px,' + this.oy / this.dpr + 'px)';
    }
    toStage(ax, ay) { return [(this.ox + ax * this.kd) / this.dpr, (this.oy + ay * this.kd) / this.dpr]; }
    text(t) {
      const e = this.box(this.add('span', 'sp-text ' + (t.cls || '')), t.x, t.y);
      e.textContent = t.text; e.style.fontSize = (t.size || 6) * this.k + 'px';
      return e;
    }

    /* ---- waiting ---- */
    // ms null waits for a tap only; opt.tap false can't be hurried (a hit-stop, the pick's arming)
    wait(ms, opt) {
      if (this.skipping || this.dead) return Promise.resolve();
      if (this.turbo && ms != null) return Promise.resolve();
      return new Promise(res => {
        let off = null;
        const p = { tap: !(opt && opt.tap === false), res, done: () => { if (this.pending === p) this.pending = null; if (off) off(); res(); } };
        this.pending = p;
        if (ms != null) off = this.clock.after(ms, p.done);
        else if (this.turbo) this.clock.after(0, p.done);
      });
    }
    tap() { if (this.pending && this.pending.tap) this.pending.done(); }
    // draws f(t) from the clock's time; a tap finishes it at once, as do Skip and reduced motion
    async tween(ms, f) {
      if (this.still || this.skipping || this.turbo || !ms) { f(1); return; }
      const t0 = this.clock.now(); let raf = 0;
      const loop = () => { const t = Math.min(1, (this.clock.now() - t0) / ms); f(t); if (t < 1 && !this.dead) raf = requestAnimationFrame(loop); };
      loop();
      await this.wait(ms);
      cancelAnimationFrame(raf); f(1);
    }
    async shake(n) {
      if (this.still || this.skipping) return;
      for (const s of [n, -n, n, -n, 0]) { this.shk = s * this.kd; this.place(); await this.wait(45, { tap: false }); }
    }

    /* ---- the steps ---- */
    async run(steps, tok) {
      for (const s of steps) { if (tok.dead || this.dead) return false; await this.step(s, tok); }
      return !tok.dead && !this.dead;
    }
    async step(s, tok) {
      if (s.say) return this.say(s, tok);
      if (s.hold != null) return this.wait(s.hold);
      if (s.tap) return this.tapStep();
      if (s.pan) { if (this.skipping) return; const a = this.cam.x, b = s.pan.x; return this.tween(s.ms, t => { this.cam.x = Math.round(a + (b - a) * t); this.place(); }); }
      if (s.prop) return this.prop(s);
      if (s.move) return this.move(s);
      if (s.sfx) return this.sfx(s);
      if (s.set) { this.state[s.set] = true; this.status(); return; }
      if (s.dir) { this.log.push({ dir: s.dir }); return; }
      if (s.card) return this.card(s);
      throw new Error('btp-scene: unknown step ' + JSON.stringify(s));
    }
    async tapStep() {
      if (this.skipping) return;
      this.moreI.hidden = false; await this.wait(null); this.moreI.hidden = true;
    }
    async say(s, tok) {
      const all = s.text + (s.append || '');
      this.log.push({ who: s.say, text: all });
      if (this.skipping) return;
      const parts = split(s.text);
      for (let i = 0; i < parts.length; i++) {
        if (tok.dead || this.dead || this.skipping) return;
        const last = i === parts.length - 1, top = s.topper && i === 0;
        if (top) { await this.wait(s.beat || 400); if (tok.dead || this.skipping) return; }
        const b = this.balloon(s.say, parts[i], top);
        this.hop(s.say);
        if (last && s.append) { await this.wait(s.after || 600, { tap: false }); if (tok.dead || this.skipping || this.dead) return; b.querySelector('p').innerHTML += fmt(s.append); }
        const n = plain(parts[i] + (last && s.append ? s.append : '')).length;
        if (this.still) { this.moreI.hidden = false; await this.wait(null); this.moreI.hidden = true; } else await this.wait(this.read(n));
      }
    }
    // one balloon at a time, in the frame, its tail at the speaker's head; a topper keeps the set-up, dimmed
    balloon(who, text, topper) {
      const prev = this.words.lastElementChild;
      [...this.words.children].forEach(e => { if (!(topper && e === prev && prev.dataset.who !== who)) e.remove(); });
      if (prev && prev.isConnected) prev.classList.add('dim');
      const c = this.S.cast[who], b = this.add('div', 'sp-b', this.words);
      b.dataset.who = who; b.innerHTML = '<p>' + fmt(text) + '</p>';
      if (c.warm) { b.classList.add('you'); return b; }
      const A = this.plate.actors && this.plate.actors[who], bw = b.offsetWidth || 220, bh = b.offsetHeight || 50;
      const [hx, hy] = A ? this.toStage(A.x, A.y - c.h + 3) : [-1, 0];
      if (A && hx > 8 && hx < this.W - 8) {
        const left = Math.max(10, Math.min(this.W - 10 - bw, hx - bw / 2));
        b.classList.add('down'); b.style.left = left + 'px';
        b.style.setProperty('--tx', Math.max(18, Math.min(bw - 18, hx - left)) + 'px');
        if (hy - 18 - bh > 40) b.style.bottom = (this.H - hy + 18) + 'px'; else b.style.top = '48px';
      } else { b.classList.add('off', c.side === 'left' ? 'l' : 'r'); b.style.top = '52px'; b.style[c.side === 'left' ? 'left' : 'right'] = '14px'; }
      // a kept set-up never sits under the topper: it moves up out of the way, or goes if there's no room
      if (prev && prev.isConnected) {
        const p = prev.getBoundingClientRect(), n = b.getBoundingClientRect(), st = this.stage.getBoundingClientRect();
        if (p.width && p.bottom > n.top - 6 && p.top < n.bottom && p.right > n.left && p.left < n.right) {
          const top = n.top - 6 - p.height - st.top;
          if (top >= 44) { prev.style.bottom = ''; prev.style.top = top + 'px'; prev.classList.remove('down'); } else prev.remove();
        }
      }
      return b;
    }
    hop(id) {
      const e = this.els && this.els[id];
      if (!e || this.still) return;
      e.style.translate = '0 ' + -this.k + 'px';
      this.clock.after(140, () => { e.style.translate = ''; });
    }
    async prop(s) {
      if (this.skipping) return;
      const e = s.text ? this.text(s) : this.img(s.img, s.x, s.y, s.w, s.h, s.z ? this.kdOf(s.z) : null);
      e.classList.add('sp-prop'); this.els[s.prop] = e; e._dx = 0; e._dy = 0;
      if (s.from || s.fromX) {
        const fx = s.fromX || 0, fy = s.from || 0;
        await this.tween(s.ms || 200, t => { const u = s.ease === 'in' ? t * t : t; e.style.transform = 'translate(' + Math.round(fx * (1 - u)) * this.k + 'px,' + Math.round(fy * (1 - u)) * this.k + 'px)'; });
      }
    }
    // to an offset from where the prop was put, in whole art px, from wherever it is now
    async move(s) {
      const e = this.els && this.els[s.move];
      if (!e || this.skipping) return;
      const x0 = e._dx || 0, y0 = e._dy || 0, x1 = s.dx != null ? s.dx : x0, y1 = s.dy != null ? s.dy : y0;
      await this.tween(s.ms, t => { e._dx = Math.round(x0 + (x1 - x0) * t); e._dy = Math.round(y0 + (y1 - y0) * t); e.style.transform = 'translate(' + e._dx * this.k + 'px,' + e._dy * this.k + 'px)'; });
      if (s.gone) e.remove();
    }
    // lettered sound: it pops on whole; `stop` freezes the frame (hit-stop), then the plate shakes by whole art px
    async sfx(s) {
      if (this.skipping) return;
      const e = this.add('b', 'sp-sfxw' + (s.small ? ' s' : ''), this.fxl), [x, y] = this.toStage(s.x, s.y);
      e.textContent = s.sfx; e.style.left = x + 'px'; e.style.top = y + 'px';
      if (!s.small) e.setAttribute('aria-hidden', 'true');
      this.clock.after(s.small ? 1400 : 900, () => e.remove());
      if (s.stop && !this.still) await this.wait(s.stop, { tap: false });
      if (s.shake) await this.shake(s.shake);
      if (s.hold) await this.wait(s.hold);
    }
    async card(s) {
      const c = this.add('div', 'sp-card', this.stage);
      c.innerHTML = '<b>' + esc(s.card) + '</b>';
      this.log.push({ dir: s.card + (s.then ? ' ' + s.then : '') });
      await this.wait(this.skipping ? 0 : 700, { tap: false });
      if (s.then && !this.dead) { c.querySelector('b').textContent += ' ' + s.then; this.shk = 0; if (!this.still) { c.classList.add('slam'); this.clock.after(220, () => c.classList.remove('slam')); } }
      await this.wait(s.hold != null ? s.hold : 500, { tap: false });
    }
    status() {
      const L = this.S.stateLabels || {}, on = Object.keys(this.state).filter(k => L[k]).map(k => L[k]);
      const p = this.dock.querySelector('.sp-status');
      if (p) p.textContent = on.length ? 'On you: ' + on.join(' · ') : '';
    }
    dockIdle() {
      this.dock.innerHTML = (this.S.title ? '<p class="sp-head">' + esc(this.S.title) + '</p>' : '') + '<p class="sp-status"></p><p class="sp-hint">Tap the picture to go on.</p>';
      this.status();
    }
    skip() {
      if (this.skipping || this.picking || this.dead) return;
      this.skipping = true; this.skipB.hidden = true; this.moreI.hidden = true;
      if (this.pending) this.pending.done();
    }
    script(open) {
      this.sheet.hidden = !open; this.clock.hold('script', open);
      if (open) this.sheet.querySelector('.sp-page').innerHTML = this.log.map(l => l.dir ? '<p class="dir">' + esc(l.dir) + '</p>' :
        '<p class="who">' + esc(this.S.cast[l.who].short) + '</p><p class="ln">' + fmt(l.text) + '</p>').join('');
    }

    /* ---- the pick lives in the scene: tags in the dock, the talk about them in the frame ---- */
    choice(C) {
      this.skipping = false; this.picking = true; this.skipB.hidden = true; this.moreI.hidden = true;
      this.draw(C.shot);
      this.dock.innerHTML = '<p class="sp-status"></p><div class="sp-tags">' + C.options.map(o => '<button class="sp-tag" data-o="' + esc(o.id) + '" aria-pressed="false"' + (o.off ? ' disabled' : '') + '>' +
        (o.icon ? '<img src="' + esc(o.icon) + '" alt="">' : '') + '<span>' + esc(o.label) + '</span></button>').join('') + '</div>' +
        '<p class="sp-rules">' + esc(C.hint || 'Tap one to hear about it.') + '</p><button class="sp-take" disabled>' + esc(C.prompt) + '</button>';
      this.status();
      this.dock.querySelectorAll('.sp-tag img').forEach(i => { i.onerror = () => i.remove(); });
      const take = this.dock.querySelector('.sp-take'), rules = this.dock.querySelector('.sp-rules'), armed = this.clock.now() + (this.turbo ? 0 : 450);
      let chosen = null;
      this.pickTok = { dead: true };
      return new Promise(res => {
        this.dock.querySelectorAll('.sp-tag').forEach(btn => btn.onclick = async () => {
          if (this.dead || this.clock.now() < armed) return;            // inert until 450 ms after it shows
          this.pickTok.dead = true; if (this.pending) this.pending.done();
          const o = C.options.find(x => x.id === btn.dataset.o), my = this.pickTok = { dead: false };
          this.dock.querySelectorAll('.sp-tag').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
          take.disabled = true; take.textContent = o.take; chosen = null; this.words.innerHTML = '';
          rules.innerHTML = '<b>' + esc(o.label) + ':</b> ' + esc(o.rules || '');
          if (!await this.run(o.steps, my)) return;
          await this.wait(this.turbo ? 0 : 450, { tap: false });
          if (!my.dead && !this.dead) { take.disabled = false; chosen = o; }
        });
        take.onclick = () => { if (chosen && !this.dead) { this.pickTok.dead = true; if (this.pending) this.pending.done(); res(chosen); } };
      });
    }

    async play() {
      const cut = this.S[this.opt.cut === 'fast' ? 'fast' : 'first'], tok = this.tok = { dead: false };
      let i0 = this.opt.from ? cut.findIndex(s => s.id === this.opt.from) : 0;
      if (i0 < 0) i0 = 0;
      this.clock.after(600, () => { if (!this.skipping && !this.picking && !this.dead) { this.skipB.hidden = false; this.scriptB.hidden = false; } });
      for (let i = 0; i < cut.length; i++) {
        const shot = cut[i];
        if (this.dead) return;
        // a resumed scene runs the shots before its place as a Skip does: every state set, every line in the Script
        if (i < i0) this.skipping = true;
        else if (i === i0 && this.opt.from) this.skipping = false;
        if (!this.skipping && this.opt.onShot) this.opt.onShot(shot.id, shot);
        if (shot.choice) {
          if (this.skipping && this.opt.onShot) this.opt.onShot(shot.id, shot);
          const o = await this.choice(shot.choice);
          if (this.dead) return;
          this.dock.querySelectorAll('button').forEach(b => { b.disabled = true; });
          this.log.push({ dir: 'You take ' + o.label[0].toLowerCase() + o.label.slice(1) + '.' });
          this.state['took:' + o.id] = true;
          this.picking = false;
          await this.run(shot.choice.after || [], tok);
          if (!this.dead && this.opt.onEnd) this.opt.onEnd(o, this);
          return;
        }
        if (!this.skipping) this.draw(shot); else if (shot.dir) this.log.push({ dir: shot.dir });
        if (!await this.run(shot.steps, tok)) return;
      }
      if (!this.dead && this.opt.onEnd) this.opt.onEnd(null, this);
    }
    // the pictures a scene uses, so they can be decoded before the first shot (never more than 1.5 s)
    static images(scene) {
      const s = new Set();
      JSON.stringify(scene, (k, v) => { if (typeof v === 'string' && /\.(webp|png)(\?|$)/.test(v)) s.add(v); return v; });
      return [...s];
    }
    static preload(scene) {
      const all = Promise.all(BtpScene.images(scene).map(u => { const i = new Image(); i.src = u; return i.decode ? i.decode().catch(() => 0) : 0; }));
      return Promise.race([all, new Promise(r => setTimeout(r, 1500))]);
    }
  }
  Object.assign(BtpScene, { READ, SOFT, HARD, STEPS, split, Clock });
  root.BtpScene = BtpScene;
  if (typeof module !== 'undefined' && module.exports) module.exports = BtpScene;
})(typeof window !== 'undefined' ? window : globalThis);
