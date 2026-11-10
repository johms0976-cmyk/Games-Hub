/* btp-scene.js: the scene player. A story scene is data, a list of beats (scenes/*.js), and this plays it ON THE MAP
   (2026-11-10, the user's: "I want this to all happen on the map ... ride up the road here and stop out by the Sheriff
   and then the interaction should happen here"; docs/film-crew/round2/DIRECTORS-PASS.md). The game's own camera, the
   map's own sprites: the cast walk, turn, hop and hold things up over their heads, the words are one balloon at a
   time over the speaker, and the scene's last frame is the map's next render. It replaced the first-person film of
   2026-11-09 (one frame over the screen, shot sizes, inserts); the engine under it is the same.

   What it keeps:
   - One Clock: time stops while the tab is hidden or the Script is open, and every wait and tween picks up where it
     left off. Nothing waits on animationend or rAF; rAF only draws.
   - Lines auto-advance at reading pace; a tap moves one step on; Skip lands on the pick with every state applied and
     everybody on their marks (every step has an end state). With reduced motion (opt.still) nothing travels and every
     line waits for a tap.
   - A balloon holds about 64 characters (SOFT); a longer line is split at full stops, and a sentence over HARD at a
     comma. The writers' words never change.

   The world: opt.world = { box() -> the map's element (asked for again after every re-render), k() -> CSS pixels an
   art pixel, W, H (the map in art pixels) }. Everything on the map is placed in art pixels, by its ground point; the
   cast sort with the map's own sprites by how far down the map they stand (z-index 2 + y, as the page's sprites).

   The step vocabulary is closed (STEPS):
     say    { say: who, text, append, after, topper }       a balloon over who's head
     note   { note: who | [x, y], text, ms }                a passing balloon that waits for nobody
     go     { go: who, to: [x, y], ms, ease, face }         walk or ride there (turning to face the way), then face
     face   { face: who, to: 'm' | 'r' | 'l' | 'u' }        front, right, left; 'u' a rider's back (riding up the map)
     hop    { hop: who, h, n }
     emote  { emote: who | [x, y], text, ms }               ! … ♪ over a head
     raise  { raise: who, img | text, cls, w, h, hold, keep }   hold it up over your head (Stardew's big moment)
     give   { give: who, to: who, ms }                      what who holds up goes over to the other
     sfx    { sfx: 'BANG!', on: who | at: [x, y], small, shake, stop, hold }
     cam    { cam: y | 'foot', at, ms }                     the page scrolls: art row y at `at` of the screen's height
     hold, tap, set, dir, all (steps at once), seq (steps in turn, inside an all)
   A beat is { id, dir, steps } or { id, choice: { cam, prompt, hint, options: [{ id, label, take, icon, rules,
   steps, off }], after } }.

   new BtpScene(host, scene, opt).play()   host: the overlay for taps, Skip, the Script and the pick's dock.
   opt: world, cut 'first'|'fast', from (a beat id to resume at), still, turbo (the tests: no waits), read(n) (ms a
   line of n characters holds), onShot(id, beat), onEnd(option). remount() after the map was drawn again.
   BtpScene.split(text) is the balloon splitter; BtpScene.images(scene) every picture a scene uses. */
(function (root) {
  'use strict';
  const SOFT = 64, HARD = 70;
  const READ = n => Math.max(1200, Math.min(3400, 1100 + 28 * n));
  const STEPS = ['say', 'note', 'go', 'face', 'hop', 'emote', 'raise', 'give', 'sfx', 'cam', 'hold', 'tap', 'set', 'dir', 'all', 'seq'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = s => esc(s).replace(/\*(.+?)\*/g, '<i>$1</i>');     // *draw* is the one markup
  const plain = s => String(s).replace(/\*/g, '');
  const EASE = { out: t => 1 - (1 - t) * (1 - t), inout: t => t * t * (3 - 2 * t), lin: t => t };

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

  const CSS = `
#scene { position: fixed; inset: 0; z-index: 65; background: none; overflow: hidden; touch-action: none; cursor: pointer; font-family: Bitter, Georgia, serif;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
#scene[hidden] { display: none; }
/* on the map: no z-index of its own, so the cast sort with the map's sprites (and pass behind the gate's sign) */
.ms-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ms-a { position: absolute; display: block; background-repeat: no-repeat; background-position: 0 0; image-rendering: pixelated; }
.ms-a.flip { transform: scaleX(-1); }
.ms-a.go { animation: mswalk .52s steps(4) infinite; }
.ms-a.ms-r.go { animation-duration: .42s; }
@keyframes mswalk { from { background-position-x: 0; } to { background-position-x: 133.333%; } }
.ms-p { position: absolute; display: block; image-rendering: pixelated; z-index: 2600; }
.ms-p.txt { width: auto !important; height: auto !important; translate: -50% 0; white-space: nowrap; font: 700 12px/1 "Pixelify Sans", monospace; }
.ms-p.inmate { color: #c0201a; background: #fff3dc; border: 2px solid #c0201a; padding: 1px 4px 2px; letter-spacing: .06em; rotate: -5deg; }
.ms-p.coin { color: #5a3a10; background: #f0c23c; border: 2px solid #5a3a10; border-radius: 50%; padding: 4px 3px; font-size: 10px; }
.ms-e { position: absolute; z-index: 2700; translate: -50% -100%; min-width: 14px; padding: 1px 4px 2px; box-sizing: border-box; text-align: center; background: #fffaf0; color: #2a1b16;
  border: 2px solid #2a1b16; font: 700 14px/1 "Pixelify Sans", monospace; white-space: nowrap; }
.ms-e::after { content: ""; position: absolute; left: 50%; bottom: -6px; margin-left: -2px; width: 4px; height: 4px; background: #2a1b16; }
.ms-b { position: absolute; z-index: 3000; box-sizing: border-box; max-width: min(250px, calc(100% - 20px)); background: #fffaf0; color: #3a2a20; border: 3px solid #2a1b16;
  border-radius: 12px; padding: 6px 11px 7px; font: 16px/1.3 Bitter, Georgia, serif; box-shadow: 0 3px 0 rgba(30, 18, 14, .35); }
.ms-b p { margin: 0; }
.ms-b.you { background: #f3e3c0; }
.ms-b.small { font-size: 13px; padding: 4px 8px 5px; border-width: 2px; border-radius: 9px; }
.ms-b::before, .ms-b::after { content: ""; position: absolute; left: var(--tx); border: solid transparent; }
.ms-b::before { bottom: -17px; margin-left: -9px; border-width: 14px 9px 0; border-top-color: #2a1b16; }
.ms-b::after { bottom: -11px; margin-left: -6px; border-width: 10px 6px 0; border-top-color: #fffaf0; }
.ms-b.you::after { border-top-color: #f3e3c0; }
.ms-b.small::before { bottom: -11px; margin-left: -6px; border-width: 9px 6px 0; } .ms-b.small::after { bottom: -7px; margin-left: -4px; border-width: 7px 4px 0; }
.ms-b.under::before { bottom: auto; top: -17px; border-width: 0 9px 14px; border-top-color: transparent; border-bottom-color: #2a1b16; }
.ms-b.under::after { bottom: auto; top: -11px; border-width: 0 6px 10px; border-top-color: transparent; border-bottom-color: #fffaf0; }
.ms-b.you.under::after { border-bottom-color: #f3e3c0; }
.ms-sfx { position: absolute; z-index: 3100; translate: -50% -50%; rotate: -6deg; font: 700 30px/1 "Pixelify Sans", monospace; color: #fff3d0; letter-spacing: .04em; white-space: nowrap;
  text-shadow: 3px 0 #2a1b16, -3px 0 #2a1b16, 0 3px #2a1b16, 0 -3px #2a1b16, 3px 3px #2a1b16, -3px 3px #2a1b16, 3px -3px #2a1b16, -3px -3px #2a1b16, 0 6px rgba(0,0,0,.3); }
.ms-sfx.s { font-size: 15px; rotate: 0deg; color: #fffaf0; text-shadow: 2px 0 #2a1b16, -2px 0 #2a1b16, 0 2px #2a1b16, 0 -2px #2a1b16; }
.sp-skip, .sp-script { position: absolute; bottom: calc(12px + env(safe-area-inset-bottom)); z-index: 5; min-height: 38px; padding: 4px 14px; border: 2px solid rgba(255, 246, 220, .8); border-radius: 19px;
  background: rgba(28, 18, 13, .72); color: #fff6dc; font: 600 14px/1 Bitter, Georgia, serif; cursor: pointer; }
.sp-skip { right: 10px; } .sp-script { left: 10px; }
.sp-skip[hidden], .sp-script[hidden], .sp-more[hidden], .sp-dock[hidden] { display: none; }
.sp-more { position: absolute; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom)); margin-left: -8px; color: #fff6dc; font-style: normal; font-size: 18px; text-shadow: 0 2px 0 #2a1b16, 0 -2px 0 #2a1b16, 2px 0 #2a1b16, -2px 0 #2a1b16;
  animation: spblink 1s steps(2) infinite; }
@keyframes spblink { 50% { opacity: .2; } }
.sp-dock { position: absolute; left: 50%; bottom: 0; translate: -50% 0; width: min(100%, 480px); max-height: 56%; box-sizing: border-box; padding: 10px 12px max(10px, env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 8px; overflow-y: auto; touch-action: pan-y; cursor: default;
  background: linear-gradient(#3a2418, #24160f); border-top: 3px solid #120b08; color: #f6efe2; }
.sp-status { margin: 0; min-height: 16px; font: 13px/1.25 Bitter, Georgia, serif; color: #e8c890; }
.sp-tags { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sp-tag { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 84px; padding: 8px 4px 6px 10px; cursor: pointer;
  background: #e9d6a6; color: #3a2a20; border: 2px solid #6b4a2a; border-radius: 4px 12px 12px 4px; font: 600 13px/1.2 Bitter, Georgia, serif; text-align: center; box-shadow: 0 3px 0 rgba(0,0,0,.35); }
.sp-tag::before { content: ""; position: absolute; left: 4px; top: 50%; width: 7px; height: 7px; margin-top: -4px; border-radius: 50%; background: #3a2418; }
.sp-tag img { width: 52px; height: 52px; image-rendering: pixelated; }
.sp-tag[aria-pressed="true"] { translate: 0 -3px; outline: 3px solid #f3d070; }
.sp-tag:disabled { opacity: .45; cursor: default; }
.sp-rules { margin: 0; min-height: 2.6em; flex-shrink: 0; font: 14px/1.3 Bitter, Georgia, serif; color: #f6efe2; }
.sp-rules b { color: #f3d070; }
/* Take is pinned to the dock's bottom: on a short window the rules scroll under it, never it out of view */
.sp-take { position: sticky; bottom: 0; z-index: 1; flex-shrink: 0; margin-top: auto; box-shadow: 0 -8px 10px #24160f; min-height: 48px;border: 3px solid #4a2626; border-radius: 10px; background: #7a3b2a; color: #fbf3e2; font: 600 18px/1 "Pixelify Sans", Georgia, serif; cursor: pointer; }
.sp-take:disabled { opacity: .5; cursor: default; }
.sp-sheet { position: absolute; inset: 0; z-index: 9; display: flex; flex-direction: column; background: rgba(20, 12, 8, .88); padding: 16px; box-sizing: border-box; cursor: default; }
.sp-sheet[hidden] { display: none; }
.sp-page { flex: 1; overflow-y: auto; touch-action: pan-y; max-width: 440px; width: 100%; margin: 0 auto; box-sizing: border-box; padding: 18px 20px; background: #f6f0e0; color: #1e1712;
  font: 14px/1.45 "Courier New", Courier, monospace; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
.sp-page .dir { margin: 14px 0 6px; font-style: italic; } .sp-page .dir:first-child { margin-top: 0; }
.sp-page .who { margin: 12px 0 0; text-align: center; text-transform: uppercase; letter-spacing: .04em; }
.sp-page .ln { margin: 0 auto; max-width: 30ch; }
.sp-close { margin: 12px auto 0; min-height: 44px; padding: 0 20px; border-radius: 10px; border: 3px solid #4a2626; background: #f3e3c0; font: 600 15px Bitter, Georgia, serif; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .sp-more, .ms-a.go { animation: none; } }
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
      this.world = this.opt.world || { box: () => host, k: () => 2, W: 187, H: 400 };
      this.still = !!this.opt.still; this.turbo = !!this.opt.turbo; this.read = this.opt.read || READ;
      this.state = {}; this.log = []; this.pending = new Set(); this.skipping = false; this.swallow = 0; this.dead = false; this.offs = [];
      host.innerHTML = '<div class="sp-dock" hidden></div><button class="sp-script" hidden>Script</button><button class="sp-skip" hidden>Skip ›</button><i class="sp-more" hidden>▼</i>' +
        '<div class="sp-sheet" hidden><div class="sp-page"></div><button class="sp-close">Back to the scene</button></div>';
      host.setAttribute('role', 'group'); host.setAttribute('aria-label', scene.title || 'A scene');
      const $ = c => host.querySelector(c);
      Object.assign(this, { skipB: $('.sp-skip'), scriptB: $('.sp-script'), moreI: $('.sp-more'), dock: $('.sp-dock'), sheet: $('.sp-sheet') });
      this.layer = document.createElement('div'); this.layer.className = 'ms-layer';
      this.words = this.layer;
      // the cast, on their marks
      this.cast = {};
      Object.keys(scene.cast).forEach(id => {
        const c = scene.cast[id];
        if (!c.at) return;
        const a = this.cast[id] = { id, c, x: c.at[0], y: c.at[1], face: c.face || (c.rider ? 'r' : 'm'), held: null, el: document.createElement('i') };
        a.el.className = 'ms-a' + (c.rider ? ' ms-r' : ''); a.el.dataset.who = id;
        this.layer.appendChild(a.el);
      });
      const on = (t, ev, f, o) => { t.addEventListener(ev, f, o); this.offs.push(() => t.removeEventListener(ev, f, o)); };
      // a tap anywhere moves one step on, on pointerup; the click after it is swallowed, so it can't land on whatever
      // the tap just put under the finger (memory: touch ghost-clicks)
      on(host, 'pointerup', e => { if (e.target.closest && e.target.closest('button,.sp-dock,.sp-sheet')) return; this.swallow = performance.now() + 400; this.tap(); });
      on(document, 'click', e => { if (performance.now() < this.swallow && !(e.target.closest && e.target.closest('.sp-skip,.sp-script,.sp-close'))) { e.stopPropagation(); e.preventDefault(); } }, true);
      on(document, 'keydown', e => {
        if (!this.sheet.hidden) { if (e.key === 'Escape') { e.stopPropagation(); this.script(false); } return; }
        if ((e.key === ' ' || e.key === 'Enter') && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); e.stopPropagation(); this.tap(); }
        if (e.key === 'Escape') { e.stopPropagation(); this.skip(); }
      }, true);
      // the scene holds the camera: the page doesn't scroll under it
      on(host, 'wheel', e => { if (!(e.target.closest && e.target.closest('.sp-dock,.sp-page'))) e.preventDefault(); }, { passive: false });
      on(document, 'visibilitychange', () => this.clock.hold('hidden', document.hidden));
      let rz = 0;
      on(root, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!this.dead) this.remount(); }, 250); });
      this.skipB.onclick = () => this.skip();
      this.scriptB.onclick = () => this.script(true);
      $('.sp-close').onclick = () => this.script(false);
      this.remount();
    }
    destroy() {
      this.dead = true;
      if (this.tok) this.tok.dead = true;
      if (this.pickTok) this.pickTok.dead = true;
      this.flush();
      this.clock.clear();
      this.offs.forEach(f => f()); this.offs = [];
      this.unshake();
      this.layer.remove();
      this.host.innerHTML = '';
    }

    /* ---- the map: the layer rides in the map's element, placed in % of the map so a resize moves nothing ---- */
    remount() {
      const box = this.world.box();
      if (box && this.layer.parentNode !== box) { box.appendChild(this.layer); [...this.layer.querySelectorAll('.ms-b,.ms-sfx')].forEach(e => e.remove()); }
      this.k = this.world.k() || 2;
      Object.keys(this.cast).forEach(id => this.place(this.cast[id]));
      if (this.lastCam) this.aim(this.lastCam);
    }
    pc(v, of) { return (100 * v / of).toFixed(3) + '%'; }
    snap(v) { return Math.round(v * this.k) / this.k; }           // whole screen pixels
    // a walker's views are m (front), r, l; a rider's r (flipped for l) and u (from behind, riding up the map)
    view(a) { const c = a.c; return c.views ? (c.views[a.face] || c.views[c.rider ? 'r' : 'm']) : c; }
    place(a) {
      const v = this.view(a), W = this.world.W, H = this.world.H, s = a.el.style;
      s.left = this.pc(this.snap(a.x) - v.ax, W); s.top = this.pc(this.snap(a.y) - v.ay, H); s.width = this.pc(v.w, W); s.height = this.pc(v.h, H);
      s.backgroundImage = 'url(' + v.img + ')'; s.backgroundSize = (v.frames || 1) * 100 + '% 100%'; s.zIndex = 2 + Math.round(a.y);
      a.el.classList.toggle('flip', !!a.c.rider && a.face === 'l');
      if (a.held) this.placeHeld(a);
    }
    head(a) { const v = this.view(a); return [a.x, a.y - v.ay + (a.c.headY || 0)]; }      // the top of who's hat
    placeHeld(a, lift) {
      const e = a.held, [hx, hy] = this.head(a), W = this.world.W, H = this.world.H;
      e.style.left = this.pc(this.snap(hx) - (e._txt ? 0 : e._w / 2), W); e.style.top = this.pc(this.snap(hy) - e._h - 2 + (lift || 0), H);
    }
    // the page's scroll that puts art row y at `at` of the screen's height ('foot': the map's foot on the screen's)
    scrollFor(c) {
      const box = this.world.box();
      if (!box || !box.getBoundingClientRect) return null;
      const r = box.getBoundingClientRect(), top = r.top + (root.scrollY || 0), vh = root.innerHeight || 667;
      if (!r.height) return null;
      const y = c.cam === 'foot' ? top + r.height - vh + 6 : top + c.cam * this.k - vh * (c.at != null ? c.at : 0.4);
      return Math.max(0, Math.round(y));
    }
    aim(c) { const y = this.scrollFor(c); this.lastCam = c; if (y != null) try { root.scrollTo(0, y); } catch (e) { /* no layout */ } }

    /* ---- waiting ---- */
    // ms null waits for a tap only; opt.tap false can't be hurried (a hit-stop, the pick's arming)
    wait(ms, opt) {
      if (this.skipping || this.dead) return Promise.resolve();
      if (this.turbo && ms != null) return Promise.resolve();
      return new Promise(res => {
        let off = null;
        const p = { tap: !(opt && opt.tap === false), done: () => { if (!this.pending.delete(p)) return; if (off) off(); res(); } };
        this.pending.add(p);
        if (ms != null) off = this.clock.after(ms, p.done);
        else if (this.turbo) this.clock.after(0, p.done);
      });
    }
    tap() { [...this.pending].forEach(p => { if (p.tap) p.done(); }); }
    flush() { [...this.pending].forEach(p => p.done()); }
    // draws f(t) from the clock's time; a tap finishes it at once, as do Skip and reduced motion
    async tween(ms, f) {
      if (this.still || this.skipping || this.turbo || !ms) { f(1); return; }
      const t0 = this.clock.now(); let raf = 0;
      const loop = () => { const t = Math.min(1, (this.clock.now() - t0) / ms); f(t); if (t < 1 && !this.dead) raf = requestAnimationFrame(loop); };
      loop();
      await this.wait(ms);
      cancelAnimationFrame(raf);
      if (!this.dead) f(1);
    }
    unshake() { const b = this.world.box(); if (b && b.style) b.style.translate = ''; }
    async shake(n) {
      if (this.still || this.skipping || this.turbo) return;
      for (const s of [n, -n, n, -n, 0]) { const b = this.world.box(); if (b) b.style.translate = s ? s * this.k + 'px 0' : ''; await this.wait(45, { tap: false }); }
    }

    /* ---- the steps ---- */
    async run(steps, tok) {
      for (const s of steps) { if (tok.dead || this.dead) return false; await this.step(s, tok); }
      return !tok.dead && !this.dead;
    }
    async step(s, tok) {
      if (s.say) return this.say(s, tok);
      if (s.note) return this.note(s);
      if (s.go) return this.go(s);
      if (s.face) { const a = this.cast[s.face]; if (a) { a.face = s.to; this.place(a); } return; }
      if (s.hop) return this.hop(s.hop, s.h, s.n);
      if (s.emote) return this.emote(s);
      if (s.raise) return this.raise(s);
      if (s.give) return this.give(s);
      if (s.sfx) return this.sfx(s);
      if (s.cam != null) return this.camStep(s);
      if (s.hold != null) return this.wait(s.hold);
      if (s.tap) return this.tapStep();
      if (s.set) { this.state[s.set] = true; this.status(); return; }
      if (s.dir) { this.log.push({ dir: s.dir }); return; }
      if (s.all) { await Promise.all(s.all.map(x => this.step(x, tok))); return; }
      if (s.seq) { await this.run(s.seq, tok); return; }
      throw new Error('btp-scene: unknown step ' + JSON.stringify(s));
    }
    async tapStep() {
      if (this.skipping) return;
      this.moreI.hidden = false; await this.wait(null); this.moreI.hidden = true;
    }
    async camStep(s) {
      const to = this.scrollFor(s), from = root.scrollY || 0;
      this.lastCam = s;
      if (to == null) return;
      await this.tween(s.ms || 0, t => { try { root.scrollTo(0, Math.round(from + (to - from) * EASE.inout(t))); } catch (e) { /* no layout */ } });
    }
    // walk or ride to a mark: turned the way it goes (side on unless it's straight up or down), its strip stepping
    async go(s) {
      const a = this.cast[s.go];
      if (!a) return;
      const x0 = a.x, y0 = a.y, [x1, y1] = s.to, dx = x1 - x0, ease = EASE[s.ease] || EASE.lin;
      const moving = !(this.still || this.skipping || this.turbo || !s.ms);
      const up = !!(a.c.views && a.c.views.u) && y1 < y0 && y0 - y1 > 1.5 * Math.abs(dx);      // riding up the map: from behind
      if (moving) { if (up) a.face = 'u'; else if (Math.abs(dx) >= 2) a.face = dx > 0 ? 'r' : 'l'; a.el.classList.add('go'); }
      else if (up) a.face = 'u';                           // (skipped or still: the same end state)
      await this.tween(s.ms, t => { const u = ease(t); a.x = x0 + dx * u; a.y = y0 + (y1 - y0) * u; this.place(a); });
      a.el.classList.remove('go');
      a.x = x1; a.y = y1;
      if (s.face) a.face = s.face;
      this.place(a);
    }
    async hop(id, h, n) {
      const a = this.cast[id];
      if (!a || this.still || this.skipping || this.turbo) return;
      for (let i = 0; i < (n || 1); i++) {
        a.el.style.translate = '0 ' + -(h || 2) * this.k + 'px'; await this.wait(110, { tap: false });
        a.el.style.translate = ''; await this.wait(90, { tap: false });
      }
    }
    // where a balloon or an emote goes: over a cast member's head, or over a place on the map
    spot(who) { if (Array.isArray(who)) return who; const a = this.cast[who]; if (!a) return null; const h = this.head(a); return a.held ? [h[0], h[1] - a.held._h - 3] : h; }
    async emote(s) {
      const at = this.spot(s.emote);
      if (!at || this.skipping || this.turbo) return;
      const e = document.createElement('b'); e.className = 'ms-e'; e.textContent = s.text;
      e.style.left = this.pc(at[0], this.world.W); e.style.top = this.pc(at[1] - 3, this.world.H);
      this.layer.appendChild(e);
      this.clock.after(s.ms || 700, () => e.remove());
      if (!s.nowait) await this.wait(s.ms || 700);
    }
    async say(s, tok) {
      const all = s.text + (s.append || '');
      this.log.push({ who: s.say, text: all });
      if (this.skipping) return;
      const parts = split(s.text);
      for (let i = 0; i < parts.length; i++) {
        if (tok.dead || this.dead || this.skipping) return;
        const last = i === parts.length - 1;
        if (s.topper && i === 0) { await this.wait(s.beat || 400); if (tok.dead || this.skipping || this.dead) return; }
        const b = this.balloon(s.say, parts[i]);
        this.hop(s.say, 1);
        if (last && s.append) { await this.wait(s.after || 600, { tap: false }); if (tok.dead || this.skipping || this.dead) return; b.querySelector('p').innerHTML += fmt(s.append); }
        const n = plain(parts[i] + (last && s.append ? s.append : '')).length;
        if (this.still) { this.moreI.hidden = false; await this.wait(null); this.moreI.hidden = true; } else await this.wait(this.read(n));
      }
      if (!tok.dead && !this.dead) this.clearWords();
    }
    clearWords() { [...this.layer.querySelectorAll('.ms-b')].forEach(e => e.remove()); }
    // one balloon at a time, on the map, its tail at the speaker's head; under them when there's no room above
    balloon(who, text, small) {
      if (!small) this.clearWords();
      const at = this.spot(who), c = !Array.isArray(who) && this.S.cast[who], b = document.createElement('div');
      b.className = 'ms-b' + (c && c.warm ? ' you' : '') + (small ? ' small' : '');
      b.innerHTML = '<p>' + fmt(text) + '</p>';
      this.layer.appendChild(b);
      if (!at) return b;
      const k = this.k, W = this.world.W * k, bw = b.offsetWidth || 200, bh = b.offsetHeight || 48, hx = at[0] * k, hy = at[1] * k;
      const left = Math.max(6, Math.min(W - 6 - bw, hx - bw / 2));
      let top = hy - (small ? 12 : 18) - bh;
      const box = this.world.box(), seen = box && box.getBoundingClientRect ? -box.getBoundingClientRect().top : 0;
      if (top < seen + 8) { const a = !Array.isArray(who) && this.cast[who]; top = (a ? a.y : at[1] + 30) * k + 18; b.classList.add('under'); }
      b.style.left = left + 'px'; b.style.top = Math.round(top) + 'px';
      b.style.setProperty('--tx', Math.max(16, Math.min(bw - 16, hx - left)) + 'px');
      return b;
    }
    // a passing remark: it waits for nobody and goes by itself
    note(s) {
      if (this.skipping || this.turbo || this.still) return;
      const b = this.balloon(s.note, s.text, true);
      this.clock.after(s.ms || 1600, () => b.remove());
    }
    // hold it up: a thing (or a word) rises over who's head, and stays there for `hold` (or until the next, with keep)
    async raise(s) {
      const a = this.cast[s.raise];
      if (!a) return;
      if (a.held) { a.held.remove(); a.held = null; }
      if (this.skipping) return;
      const e = document.createElement(s.text ? 'b' : 'img');
      e.className = 'ms-p' + (s.text ? ' txt' : '') + (s.cls ? ' ' + s.cls : '');
      e._txt = !!s.text; e._w = s.w || 13; e._h = s.h || (s.text ? 9 : 13);
      if (s.text) e.textContent = s.text; else { e.src = s.img; e.alt = ''; e.style.width = this.pc(e._w, this.world.W); e.style.height = this.pc(e._h, this.world.H); }
      a.held = e;
      this.layer.appendChild(e);
      await this.tween(s.ms != null ? s.ms : 180, t => this.placeHeld(a, Math.round(6 * (1 - t))));
      if (s.keep) return;
      await this.wait(s.hold != null ? s.hold : 800);
      if (a.held === e) { e.remove(); a.held = null; }
    }
    // what one holds up arcs over to the other's head, and is theirs
    async give(s) {
      const a = this.cast[s.give], b = this.cast[s.to], e = a && a.held;
      if (!e) return;
      a.held = null;
      if (!b || this.skipping) { e.remove(); return; }
      const [x0, y0] = this.head(a), [x1, y1] = this.head(b), W = this.world.W, H = this.world.H;
      await this.tween(s.ms || 450, t => {
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t - 14 * Math.sin(Math.PI * t);
        e.style.left = this.pc(this.snap(x) - e._w / 2, W); e.style.top = this.pc(this.snap(y) - e._h - 2, H);
      });
      await this.wait(s.hold != null ? s.hold : 500);
      e.remove();
    }
    // lettered sound: it pops on whole; `stop` freezes the scene (hit-stop), then the map shakes by whole art px
    async sfx(s) {
      if (this.skipping || this.turbo) return;
      const at = s.at || this.spot(s.on);
      if (!at) return;
      const e = document.createElement('b'); e.className = 'ms-sfx' + (s.small ? ' s' : ''); e.textContent = s.sfx;
      e.style.left = Math.max(40, Math.min(this.world.W * this.k - 40, (at[0] + (s.dx != null ? s.dx : s.small && s.on ? 20 : 0)) * this.k)) + 'px'; e.style.top = (at[1] + (s.dy != null ? s.dy : s.small && s.on ? 4 : s.on ? -8 : 0)) * this.k + 'px';
      if (!s.small) e.setAttribute('aria-hidden', 'true');
      this.layer.appendChild(e);
      this.clock.after(s.small ? 1100 : 900, () => e.remove());
      if (s.stop && !this.still) await this.wait(s.stop, { tap: false });
      if (s.shake) await this.shake(s.shake);
      if (s.hold) await this.wait(s.hold);
    }
    status() {
      const L = this.S.stateLabels || {}, on = Object.keys(this.state).filter(k => L[k]).map(k => L[k]);
      const p = this.dock.querySelector('.sp-status');
      if (p) p.textContent = on.length ? 'On you: ' + on.join(' · ') : '';
    }
    skip() {
      if (this.skipping || this.picking || this.dead) return;
      this.skipping = true; this.skipB.hidden = true; this.moreI.hidden = true;
      this.clearWords();
      this.flush();
    }
    script(open) {
      this.sheet.hidden = !open; this.clock.hold('script', open);
      if (open) this.sheet.querySelector('.sp-page').innerHTML = this.log.map(l => l.dir ? '<p class="dir">' + esc(l.dir) + '</p>' :
        '<p class="who">' + esc(this.S.cast[l.who].short) + '</p><p class="ln">' + fmt(l.text) + '</p>').join('');
    }

    /* ---- the pick lives in the scene: tags in a dock at the screen's foot, the talk about them on the map ---- */
    choice(C) {
      this.skipping = false; this.picking = true; this.skipB.hidden = true; this.scriptB.hidden = true; this.moreI.hidden = true;
      this.clearWords();
      Object.keys(this.cast).forEach(id => { this.cast[id].el.classList.remove('go'); this.place(this.cast[id]); });
      this.dock.hidden = false;
      this.dock.innerHTML = '<p class="sp-status"></p><div class="sp-tags">' + C.options.map(o => '<button class="sp-tag" data-o="' + esc(o.id) + '" aria-pressed="false"' + (o.off ? ' disabled' : '') + '>' +
        (o.icon ? '<img src="' + esc(o.icon) + '" alt="">' : '') + '<span>' + esc(o.label) + '</span></button>').join('') + '</div>' +
        '<p class="sp-rules">' + esc(C.hint || 'Tap one to hear about it.') + '</p><button class="sp-take" disabled>' + esc(C.prompt) + '</button>';
      this.status();
      this.dock.querySelectorAll('.sp-tag img').forEach(i => { i.onerror = () => i.remove(); });
      // the cast stay in view over the dock
      const frame = ms => { if (C.cam == null) return; const vh = root.innerHeight || 667, dh = this.dock.offsetHeight || 0, c = { cam: C.cam, at: Math.max(0.3, (vh - dh - 10) / vh), ms }; if (ms) this.camStep(c); else this.aim(c); };
      frame();
      const take = this.dock.querySelector('.sp-take'), rules = this.dock.querySelector('.sp-rules'), armed = this.clock.now() + (this.turbo ? 0 : 450);
      let chosen = null;
      this.pickTok = { dead: true };
      return new Promise(res => {
        // 2026-11-10 (the user: "I can't select an item from the sheriff to move on"): a tag picks at once (Take arms
        // 300 ms later, so a double tap can't take it), and the talk about it plays on as colour.
        this.dock.querySelectorAll('.sp-tag').forEach(btn => btn.onclick = async () => {
          if (this.dead || this.clock.now() < armed) return;            // inert until 450 ms after it shows
          const o = C.options.find(x => x.id === btn.dataset.o);
          if (chosen === o) return;                                      // already picked: its talk plays on
          this.pickTok.dead = true; this.flush();
          const my = this.pickTok = { dead: false };
          this.dock.querySelectorAll('.sp-tag').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
          take.disabled = true; take.textContent = o.take; chosen = o; this.clearWords();
          rules.innerHTML = '<b>' + esc(o.label) + ':</b> ' + esc(o.rules || '');
          frame(220);
          this.clock.after(this.turbo ? 0 : 300, () => { if (!my.dead && !this.dead && chosen === o) take.disabled = false; });
          await this.run(o.steps, my);
        });
        take.onclick = () => { if (chosen && !this.dead) { this.pickTok.dead = true; this.flush(); res(chosen); } };
      });
    }

    async play() {
      const cut = this.S[this.opt.cut === 'fast' ? 'fast' : 'first'], tok = this.tok = { dead: false };
      let i0 = this.opt.from ? cut.findIndex(s => s.id === this.opt.from) : 0;
      if (i0 < 0) i0 = 0;
      this.clock.after(600, () => { if (!this.skipping && !this.picking && !this.dead) { this.skipB.hidden = false; this.scriptB.hidden = false; } });
      for (let i = 0; i < cut.length; i++) {
        const beat = cut[i];
        if (this.dead) return;
        // a resumed scene runs the beats before its place as a Skip does: every state set, everybody on their marks,
        // every line in the Script
        if (i < i0) this.skipping = true;
        else if (i === i0 && this.opt.from) this.skipping = false;
        if (!this.skipping && this.opt.onShot) this.opt.onShot(beat.id, beat);
        if (beat.choice) {
          if (this.skipping && this.opt.onShot) this.opt.onShot(beat.id, beat);
          const o = await this.choice(beat.choice);
          if (this.dead) return;
          this.dock.querySelectorAll('button').forEach(b => { b.disabled = true; });
          this.log.push({ dir: 'You take ' + o.label[0].toLowerCase() + o.label.slice(1) + '.' });
          this.state['took:' + o.id] = true;
          this.picking = false;
          this.clearWords();
          this.dock.hidden = true;
          await this.run(beat.choice.after || [], tok);
          if (!this.dead && this.opt.onEnd) this.opt.onEnd(o, this);
          return;
        }
        if (beat.dir) this.log.push({ dir: beat.dir });
        if (!await this.run(beat.steps, tok)) return;
      }
      if (!this.dead && this.opt.onEnd) this.opt.onEnd(null, this);
    }
    // the pictures a scene uses, so they can be decoded before the first beat (never more than 1.5 s)
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
