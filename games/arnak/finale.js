/* The winner reveal — the last scene of the night (docs/LESSONS-CHECKLIST.md H3).

   Built once for every hub game: a game hands it DATA, not code, the same
   declarative idea as the card protocol. Lost Ruins of Arnak was the first to
   use it (2026-10-05).

   On the telly
     const f = HubFinale.play({
       root,                       an empty element; the reveal fills the screen inside it
       title, sub,                 beat 1, in the game's voice ("The expedition returns")
       tone,                       'temple' | 'fireworks' | 'confetti' | 'lightning'
       categories: [{ key, label }],   in the order the rulebook scores
       decider,                    a category key counted LAST, as its own beat (optional)
       deciderLine,                what that beat is called ("The race up the research track")
       players: [{ id, name, hex, figure, parts: { key: n }, total, place, won, tag }],
                                   in SEAT order — never sorted; figure is an HTML string
       tiebreak,                   a sentence when the top totals tie and the printed rule settles it
       scale,                      1 = relaxed; every beat's length is multiplied by it (0 = skip straight to the table)
       sound,                      HubSound, or nothing
       onStage(stage, info),       'title' 'count' 'decider' 'places' 'hold' 'tie' 'winner' 'table'
       onDone()                    the reveal is over (or skipped): show the table, bank the season
     });
     f.skip();  f.stop();  f.stage

   On a phone
     HubFinale.phoneHtml({ stage, label }, { meId, rows, esc })
       rows: the result rows ({ id, name, hex, total, place, won }) — pass them ONLY from stage 'winner' on.

   The rules it keeps (H3): players stay in seat order through the count; the decider is counted last;
   places are revealed bottom up; the final two are held, a tie gets its own beat, and only then does
   the winner step forward. Nothing ranks anybody before 'winner' — the telly passes the phones the
   stage and a label, never a place. Beats are chained, never at absolute offsets. One canvas for the
   particles, a requestAnimationFrame loop that stops when the last spark dies and waits while the page
   is hidden; prefers-reduced-motion gets a fade and no sparks. */
(function (root) {
  'use strict';
  const doc = root.document;

  /* Beat lengths at the relaxed pace, in ms. */
  const BEAT = { title: 3400, cat: 2700, decider: 4600, place: 2500, hold: 3400, tie: 3800, winner: 7000 };
  const ORD = k => k + (k % 100 >= 11 && k % 100 <= 13 ? 'th' : k % 10 === 1 ? 'st' : k % 10 === 2 ? 'nd' : k % 10 === 3 ? 'rd' : 'th');
  const PLACE_WORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const CSS = `
.hf-wrap{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;overflow:hidden;
  background:radial-gradient(ellipse at 50% 110%,rgba(60,48,26,.9),rgba(8,10,9,.97) 62%);color:#f4efe2;
  font-family:inherit;animation:hfIn .7s ease-out both}
@keyframes hfIn{from{opacity:0}to{opacity:1}}
.hf-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4}
.hf-shaft{position:absolute;top:-10vh;bottom:0;width:30vw;left:35vw;pointer-events:none;z-index:1;opacity:0;
  background:linear-gradient(180deg,rgba(255,236,170,.75),rgba(255,226,140,.25) 55%,rgba(255,220,130,0));
  clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);filter:blur(1.2vh);transition:opacity 1.6s,left 1.2s}
.hf-shaft.on{opacity:1}
.hf-sweep{position:absolute;top:0;bottom:0;width:22vw;pointer-events:none;z-index:1;opacity:0;
  background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,0));clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);transition:opacity .4s}
.hf-sweep.on{opacity:1;animation:hfSweep 1.1s ease-in-out infinite alternate}
@keyframes hfSweep{from{left:var(--a)}to{left:var(--b)}}
.hf-head{position:relative;z-index:5;text-align:center;margin-top:5vh;min-height:17vh;padding:0 4vw}
.hf-title{font-weight:900;font-size:6.2vh;letter-spacing:.02em;color:#f1c75b;text-shadow:0 .4vh 2vh rgba(0,0,0,.6);line-height:1.1}
.hf-sub{font-size:3.1vh;margin-top:1.2vh;color:#e9e1cc;min-height:3.6vh}
.hf-title.pop,.hf-sub.pop{animation:hfPop .5s ease-out}
@keyframes hfPop{from{transform:translateY(1.5vh);opacity:0}to{transform:none;opacity:1}}
.hf-stage{position:relative;z-index:3;flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:4vw;padding:0 6vw 7vh}
.hf-col{display:flex;flex-direction:column;align-items:center;width:15vw;max-width:26vh;transition:transform 1s cubic-bezier(.2,.8,.2,1),opacity 1s,filter 1s}
.hf-col.back{transform:translateY(3vh) scale(.82);opacity:.38;filter:grayscale(.6)}
.hf-col.final{transform:scale(1.04)}
.hf-col.win{transform:scale(1.16);z-index:6}
.hf-fig{height:13vh;display:flex;align-items:flex-end;justify-content:center;transition:transform .6s}
.hf-fig>*{height:100%;width:auto;max-width:100%;filter:drop-shadow(0 0 .35vh rgba(255,255,255,.45)) drop-shadow(0 .8vh 1vh rgba(0,0,0,.6))}
.hf-col.bob .hf-fig{animation:hfBob .55s ease-in-out 2}
.hf-col.win .hf-fig{animation:hfCheer .7s ease-in-out infinite alternate}
@keyframes hfBob{50%{transform:translateY(-2vh)}}
@keyframes hfCheer{from{transform:translateY(0) rotate(-4deg)}to{transform:translateY(-2vh) rotate(4deg)}}
.hf-bar{width:62%;height:calc(var(--h,0) * 34vh + .6vh);border-radius:1vh 1vh 0 0;background:linear-gradient(180deg,var(--c),rgba(0,0,0,.35)),var(--c);
  box-shadow:0 0 0 .25vh rgba(255,255,255,.18) inset;transition:height 1.1s cubic-bezier(.3,.9,.3,1)}
.hf-part{height:3.4vh;font-size:2.6vh;font-weight:800;color:#f1c75b;opacity:0;transition:opacity .3s}
.hf-part.on{opacity:1;animation:hfPop .4s ease-out}
.hf-part.neg{color:#ff8f8f}
.hf-name{margin-top:1.2vh;font-size:3vh;font-weight:800;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hf-tag{font-size:2.2vh;color:#b9b29e;min-height:2.6vh}
.hf-tot{font-size:4.4vh;font-weight:900;font-variant-numeric:tabular-nums}
.hf-place{font-size:2.6vh;font-weight:800;color:#d8cfb8;min-height:3vh}
.hf-col.win .hf-place{color:#f1c75b}
.hf-winner{position:absolute;left:0;right:0;top:4vh;z-index:7;text-align:center;font-weight:900;font-size:10vh;line-height:1;color:#ffe6a0;
  text-shadow:0 0 3vh rgba(255,200,90,.7),0 .6vh 2vh rgba(0,0,0,.8);opacity:0;transform:scale(.7);transition:opacity .7s,transform .9s cubic-bezier(.2,1.4,.3,1)}
.hf-winner.on{opacity:1;transform:none}
.hf-winner small{display:block;font-size:3.4vh;font-weight:700;color:#f4efe2;margin-top:1.4vh}
.hf-skip{position:absolute;right:2.5vw;bottom:2.5vh;z-index:8;font:inherit;font-size:2.3vh;background:rgba(0,0,0,.35);color:#cfc7b2;
  border:.15vh solid rgba(255,255,255,.25);border-radius:1vh;padding:.8vh 1.8vh;cursor:pointer}
.hf-flash{position:absolute;inset:0;z-index:5;background:#dfe8ff;opacity:0;pointer-events:none}
.hf-flash.go{animation:hfFlash .5s ease-out}
@keyframes hfFlash{0%{opacity:.85}100%{opacity:0}}
.hf-reduced .hf-col,.hf-reduced .hf-bar,.hf-reduced .hf-winner{transition-duration:.01s !important;animation:none !important}
/* the phone's block */
.hf-ph{text-align:center;padding:22px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)}
.hf-ph .hf-ph-h{font-weight:900;font-size:24px;color:#e3b54a}
.hf-ph .hf-ph-s{margin-top:6px;font-size:15px;opacity:.8}
.hf-ph.win{background:linear-gradient(180deg,#f3cf6a,#c9952b);color:#1a140a;border-color:#ffe39a;animation:hfPhWin 1.2s ease-in-out infinite alternate}
.hf-ph.win .hf-ph-h{color:#1a140a;font-size:30px}
@keyframes hfPhWin{from{box-shadow:0 0 0 rgba(243,207,106,0)}to{box-shadow:0 0 34px rgba(243,207,106,.75)}}
.hf-ph .hf-dots i{display:inline-block;width:8px;height:8px;margin:12px 4px 0;border-radius:50%;background:currentColor;opacity:.3;animation:hfDot 1.2s infinite}
.hf-ph .hf-dots i:nth-child(2){animation-delay:.2s}.hf-ph .hf-dots i:nth-child(3){animation-delay:.4s}
@keyframes hfDot{50%{opacity:1}}
`;
  function injectCss() {
    if (!doc || doc.getElementById('hf-css')) return;
    const st = doc.createElement('style');
    st.id = 'hf-css';
    st.textContent = CSS;
    (doc.head || doc.body).appendChild(st);
  }

  /* ---------------- particles: one canvas, one loop ---------------- */
  function Sparks(canvas) {
    const cx = canvas.getContext ? canvas.getContext('2d') : null;
    const P = [], emit = [];
    let raf = 0, last = 0, W = 0, H = 0, dpr = 1, dead = false;
    const size = () => {
      dpr = Math.min(1.5, root.devicePixelRatio || 1);
      W = canvas.clientWidth || root.innerWidth || 1920; H = canvas.clientHeight || root.innerHeight || 1080;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    };
    const rnd = (a, b) => a + Math.random() * (b - a);
    function frame(ts) {
      raf = 0;
      if (dead || !cx) return;
      if (doc.hidden) { last = 0; return; }           // visibilitychange restarts it
      const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
      last = ts;
      for (let i = emit.length - 1; i >= 0; i--) { const e = emit[i]; e.left -= dt; e.acc += dt * e.rate; while (e.acc >= 1) { e.acc--; e.fn(); } if (e.left <= 0) emit.splice(i, 1); }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt;
        if (p.life <= 0) { if (p.burst) p.burst(p); P.splice(i, 1); continue; }
        p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.spin != null) p.spin += p.vs * dt;
        const a = Math.max(0, Math.min(1, p.life / p.fade));
        cx.globalAlpha = a;
        cx.fillStyle = p.c;
        if (p.kind === 'confetti') {
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.spin); cx.scale(1, Math.abs(Math.cos(p.spin * 1.7)) + 0.15);
          cx.globalCompositeOperation = 'source-over'; cx.fillRect(-p.s, -p.s * 0.45, p.s * 2, p.s * 0.9); cx.restore();
          cx.globalCompositeOperation = 'lighter';
        } else { cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 6.283); cx.fill(); }
      }
      cx.globalAlpha = 1;
      if (P.length || emit.length) raf = root.requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead && cx && root.requestAnimationFrame) { last = 0; raf = root.requestAnimationFrame(frame); } };
    const onVis = () => { if (!doc.hidden) kick(); };
    doc.addEventListener('visibilitychange', onVis);
    size();
    const api = {
      add(p) { P.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 1, life: 1, fade: 0.6, s: 2, c: '#fff' }, p)); kick(); },
      over(seconds, rate, fn) { emit.push({ left: seconds, rate, acc: 0, fn }); kick(); },
      get W() { return W; }, get H() { return H; },
      rnd,
      stop() { dead = true; if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); P.length = 0; emit.length = 0; doc.removeEventListener('visibilitychange', onVis); }
    };
    return api;
  }

  /* The celebrations. `x` is the winner's column centre in px; `hues` the winners' colours. */
  const CELEBRATE = {
    fireworks(sp, x, hues, secs) {
      const cols = hues.concat(['#ffd36b', '#ffffff', '#8fd3ff']);
      sp.over(secs, 1.8, () => {
        const c = cols[Math.floor(Math.random() * cols.length)];
        const tx = Math.random() < 0.5 ? x + sp.rnd(-sp.W * 0.12, sp.W * 0.12) : sp.rnd(sp.W * 0.1, sp.W * 0.9);
        sp.add({ x: tx, y: sp.H, vx: sp.rnd(-30, 30), vy: -sp.rnd(sp.H * 0.75, sp.H * 1.05), g: sp.H * 0.55, life: sp.rnd(0.9, 1.3), fade: 0.2, s: 2.6, c: '#ffe9b0',
          burst(p) { for (let k = 0; k < 70; k++) { const a = Math.random() * 6.283, v = sp.rnd(60, 260); sp.add({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120, drag: 0.985, life: sp.rnd(1, 1.8), fade: 0.9, s: sp.rnd(1.5, 2.8), c }); } } });
      });
    },
    confetti(sp, x, hues, secs) {
      const cols = hues.concat(['#ffd36b', '#ffffff', '#ff6b6b', '#6bd0ff', '#7ee08a']);
      sp.over(secs * 0.6, 90, () => sp.add({ kind: 'confetti', x: sp.rnd(0, sp.W), y: -10, vx: sp.rnd(-40, 40), vy: sp.rnd(60, 160), g: 30, drag: 0.995,
        life: sp.rnd(4, 6), fade: 1.2, s: sp.rnd(4, 8), c: cols[Math.floor(Math.random() * cols.length)], spin: sp.rnd(0, 6), vs: sp.rnd(-6, 6) }));
    },
    temple(sp, x, hues, secs) {
      /* Gold dust falling through the light onto the winner, and a ring of motes when it lands. */
      sp.over(secs, 55, () => sp.add({ x: x + sp.rnd(-sp.W * 0.07, sp.W * 0.07), y: sp.rnd(-20, sp.H * 0.3), vx: sp.rnd(-12, 12), vy: sp.rnd(30, 90), g: 8,
        life: sp.rnd(2.5, 4.5), fade: 1.4, s: sp.rnd(1.2, 3.2), c: Math.random() < 0.7 ? '#ffe39a' : '#fff6d8' }));
      for (let k = 0; k < 90; k++) { const a = Math.random() * 6.283, v = sp.rnd(40, 240);
        sp.add({ x, y: sp.H * 0.62, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55 - 60, g: 90, drag: 0.98, life: sp.rnd(1.2, 2.4), fade: 1, s: sp.rnd(1.4, 3), c: '#ffd36b' }); }
    },
    lightning(sp, x, hues, secs, wrap) {
      const flash = wrap.querySelector('.hf-flash');
      let n = 0;
      sp.over(Math.min(secs, 3), 1.6, () => { if (flash) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); } n++; });
      sp.over(secs, 30, () => sp.add({ x: x + sp.rnd(-sp.W * 0.1, sp.W * 0.1), y: sp.H * 0.7, vx: sp.rnd(-50, 50), vy: -sp.rnd(80, 220), g: -10, life: sp.rnd(0.8, 1.6), fade: 0.8, s: sp.rnd(1, 2.4), c: '#bcd2ff' }));
    }
  };

  /* ---------------- the reveal ---------------- */
  function play(o) {
    injectCss();
    const scale = o.scale == null ? 1 : o.scale;
    const players = (o.players || []).slice();
    const onStage = o.onStage || function () {};
    const onDone = o.onDone || function () {};
    const snd = o.sound && o.sound.play ? o.sound : null;
    const say = (name, opt) => { if (snd) snd.play(name, Object.assign({ bus: 'scene' }, opt || {})); };
    const ctl = { stage: null, done: false };
    const timers = new Set();
    let sp = null, wrap = null;

    const finish = () => {
      if (ctl.done) return;
      ctl.done = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (snd && snd.quiet) snd.quiet(false);
      ctl.stage = 'table';
      onStage('table', {});
      onDone();
    };
    ctl.stop = () => {
      ctl.done = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (sp) sp.stop();
      if (snd && snd.quiet) snd.quiet(false);
      if (o.root) o.root.innerHTML = '';
    };
    ctl.skip = () => { if (!ctl.done) finish(); };
    /* Headless, a test, or a room in a hurry: straight to the table. */
    if (!(scale > 0) || !o.root || !doc) { ctl.stage = 'title'; Promise.resolve().then(finish); return ctl; }

    const cats = (o.categories || []).slice();
    const dec = o.decider ? cats.find(c => c.key === o.decider) : null;
    const order = cats.filter(c => c !== dec).concat(dec ? [dec] : []);
    /* Bars share one scale: the highest running total anybody reaches. */
    let top = 1;
    for (const p of players) { let run = 0; for (const c of order) { run += (p.parts[c.key] || 0); top = Math.max(top, run); } }
    const run = {};
    players.forEach(p => { run[p.id] = 0; });

    const red = reduced();
    o.root.innerHTML = '<div class="hf-wrap tone-' + escH(o.tone || 'fireworks') + (red ? ' hf-reduced' : '') + '">' +
      '<canvas class="hf-fx"></canvas><div class="hf-shaft"></div><div class="hf-sweep"></div><div class="hf-flash"></div>' +
      '<div class="hf-head"><div class="hf-title"></div><div class="hf-sub"></div></div>' +
      '<div class="hf-winner"></div>' +
      '<div class="hf-stage">' + players.map(p =>
        '<div class="hf-col" data-id="' + escH(p.id) + '">' +
          '<div class="hf-part"></div>' +
          '<div class="hf-fig">' + (p.figure || '') + '</div>' +
          '<div class="hf-bar" style="--c:' + escH(p.hex || '#888') + ';--h:0"></div>' +
          '<div class="hf-name">' + escH(p.name) + '</div>' +
          '<div class="hf-tag">' + escH(p.tag || '') + '</div>' +
          '<div class="hf-tot">0</div><div class="hf-place"></div></div>').join('') + '</div>' +
      '<button class="hf-skip">Skip to the table</button></div>';
    wrap = o.root.querySelector('.hf-wrap');
    const $ = s => wrap.querySelector(s);
    const col = id => wrap.querySelector('.hf-col[data-id="' + id + '"]');
    $('.hf-skip').onclick = () => ctl.skip();
    /* jsdom has no canvas: the tests get the beats without the sparks. */
    const canvasOk = !/jsdom/i.test((root.navigator && root.navigator.userAgent) || '');
    if (!red && canvasOk) sp = Sparks($('.hf-fx'));
    if (snd && snd.quiet) snd.quiet(true);

    const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!ctl.done) fn(); }, Math.max(0, ms * scale)); timers.add(t); };
    const head = (title, sub) => {
      const t = $('.hf-title'), s = $('.hf-sub');
      if (title != null && t.textContent !== title) { t.textContent = title; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
      s.textContent = sub || ''; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
    };
    const stage = (name, info) => { ctl.stage = name; onStage(name, info || {}); };
    const totEl = id => col(id).querySelector('.hf-tot');
    const setBar = id => { col(id).querySelector('.hf-bar').style.setProperty('--h', String(Math.max(0, run[id]) / top)); };
    const centreOf = el => { const r = el.getBoundingClientRect(); return r.width ? r.left + r.width / 2 : (root.innerWidth || 1920) / 2; };

    /* Count one category: every bar grows together, a tick a column. */
    function countCat(c, beat) {
      players.forEach((p, k) => {
        const add = p.parts[c.key] || 0;
        const el = col(p.id), part = el.querySelector('.hf-part');
        later(beat * 0.08 + k * beat * 0.09, () => {
          run[p.id] += add;
          part.textContent = (add > 0 ? '+' : '') + add;
          part.className = 'hf-part on' + (add < 0 ? ' neg' : '');
          setBar(p.id);
          totEl(p.id).textContent = String(run[p.id]);
          if (add) { el.classList.remove('bob'); void el.offsetWidth; el.classList.add('bob'); }
          say('tick', { pitch: 1 + k * 0.08, gain: add ? 1 : 0.4 });
        });
      });
      later(beat * 0.85, () => wrap.querySelectorAll('.hf-part').forEach(x => { x.className = 'hf-part'; }));
    }

    const queue = [];
    const next = () => { const b = queue.shift(); if (b) b(); else finish(); };

    /* 1 · the board freezes, a title card in the game's voice */
    queue.push(() => {
      stage('title');
      head(o.title || 'The final count', o.sub || '');
      say('gong', { gain: 0.6 });
      later(BEAT.title, next);
    });
    /* 2 · the count, category by category, seat order */
    order.filter(c => c !== dec).forEach((c, i) => queue.push(() => {
      stage('count', { label: c.label, i });
      head(null, c.label);
      countCat(c, BEAT.cat);
      later(BEAT.cat, next);
    }));
    /* 3 · the decider, last, slower */
    if (dec) queue.push(() => {
      stage('decider', { label: dec.label });
      head(null, (o.deciderLine || ('And last: ' + dec.label)));
      say('rise', { gain: 0.7 });
      later(BEAT.decider * 0.35, () => countCat(dec, BEAT.decider * 0.6));
      later(BEAT.decider, next);
    });
    /* 4 · bottom up: last place first, up to third */
    const maxPlace = Math.max.apply(null, players.map(p => p.place || 1));
    for (let pl = maxPlace; pl >= 3; pl--) {
      const at = players.filter(p => p.place === pl);
      if (!at.length) continue;
      queue.push(() => {
        stage('places', {});
        head(null, 'In ' + (PLACE_WORD[pl] || ORD(pl)) + ' place — ' + at.map(p => p.name + ', ' + p.total).join(' and '));
        for (const p of at) { col(p.id).classList.add('back'); col(p.id).querySelector('.hf-place').textContent = ORD(pl); }
        say('thump', { gain: 0.5 });
        later(BEAT.place, next);
      });
    }
    /* 5 · the hold: the final few, lights sweeping, a drum roll */
    const finals = players.filter(p => (p.place || 1) <= 2);
    const winners = players.filter(p => p.won);
    if (finals.length > 1) queue.push(() => {
      stage('hold', {});
      head(null, finals.length === 2 ? 'And then there were two…' : 'It is close at the top…');
      for (const p of finals) col(p.id).classList.add('final');
      const xs = finals.map(p => centreOf(col(p.id)) / (root.innerWidth || 1920) * 100);
      const sw = $('.hf-sweep');
      sw.style.setProperty('--a', (Math.min.apply(null, xs) - 11) + 'vw');
      sw.style.setProperty('--b', (Math.max.apply(null, xs) - 11) + 'vw');
      sw.classList.add('on');
      if (snd && snd.roll) snd.roll(BEAT.hold * scale / 1000, { hit: !o.tiebreak });
      later(BEAT.hold, next);
    });
    /* the tie, said in a sentence and then applied */
    if (o.tiebreak) queue.push(() => {
      stage('tie', {});
      head('Level at the top!', o.tiebreak);
      say('sting', { gain: 0.5 });
      if (snd && snd.roll) later(BEAT.tie * 0.4, () => snd.roll(BEAT.tie * 0.6 * scale / 1000));
      later(BEAT.tie, next);
    });
    /* 6 · the reveal: the winner steps forward into the light */
    queue.push(() => {
      stage('winner', {});
      $('.hf-sweep').classList.remove('on');
      for (const p of players) {
        const el = col(p.id);
        el.querySelector('.hf-place').textContent = ORD(p.place || 1);
        el.classList.remove('final');
        if (p.won) el.classList.add('win'); else el.classList.add('back');
      }
      const names = winners.map(p => escH(p.name)).join(' &amp; ');
      $('.hf-winner').innerHTML = names + '<small>' + (winners.length > 1 ? 'share the win on ' : 'wins with ') + (winners[0] ? winners[0].total : '') + ' points</small>';
      $('.hf-winner').classList.add('on');
      head('', '');
      const xs = winners.map(p => centreOf(col(p.id)));
      const x = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const shaft = $('.hf-shaft');
      shaft.style.left = (x / (root.innerWidth || 1920) * 100 - 15) + 'vw';
      if (o.tone === 'temple' || o.tone === 'lightning') shaft.classList.add('on');
      const fx = CELEBRATE[o.tone] || CELEBRATE.fireworks;
      if (sp) fx(sp, x, winners.map(p => p.hex || '#ffd36b'), BEAT.winner * scale / 1000, wrap);
      if (sp && o.tone !== 'confetti' && o.tone !== 'lightning') CELEBRATE.confetti(sp, x, winners.map(p => p.hex), BEAT.winner * scale / 1000 * 0.6, wrap);
      if (o.tone === 'temple') { say('gong'); say('sparkle', { delay: 0.3 }); say('cheer', { delay: 0.5 }); }
      else if (o.tone === 'lightning') { say('sting'); say('gong', { delay: 0.2, pitch: 0.7 }); say('cheer', { delay: 0.6, gain: 0.7 }); }
      else { say('fanfare'); say('cheer', { delay: 0.5 }); }
      later(BEAT.winner, next);
    });
    /* 7 · the table — onDone shows it */
    next();
    return ctl;
  }

  /* ---------------- the phone's block ---------------- */
  const PHONE_LINE = {
    title: 'The expedition is over', count: 'Counting', decider: 'And the one that decides it',
    places: 'The table steps back…', hold: 'The final few…', tie: 'A tie at the top!'
  };
  function phoneHtml(f, opt) {
    injectCss();
    opt = opt || {};
    const esc = opt.esc || escH;
    const st = f && f.stage;
    const rows = opt.rows || null;
    if (!st || (st !== 'winner' && st !== 'table') || !rows) {
      const line = PHONE_LINE[st] || 'The count';
      return '<div class="hf-ph"><div class="hf-ph-h">The count</div>' +
        '<div class="hf-ph-s">' + esc(line) + (f && f.label && (st === 'count' || st === 'decider') ? ': ' + esc(f.label) : '') + '</div>' +
        '<div class="hf-ph-s">Watch the telly.</div><div class="hf-dots"><i></i><i></i><i></i></div></div>';
    }
    const win = rows.filter(r => r.won);
    const me = rows.find(r => r.id === opt.meId);
    const names = win.map(r => r.name).join(' and ');
    if (me && me.won) {
      return '<div class="hf-ph win"><div class="hf-ph-h">' + (win.length > 1 ? 'You share the win!' : 'You win!') + '</div>' +
        '<div class="hf-ph-s">' + me.total + ' points' + (win.length > 1 ? ' — with ' + esc(win.filter(r => r.id !== me.id).map(r => r.name).join(' and ')) : '') + '</div></div>';
    }
    return '<div class="hf-ph"><div class="hf-ph-h">' + esc(names) + (win.length > 1 ? ' share the win' : ' wins') + '</div>' +
      (me ? '<div class="hf-ph-s">You finished ' + ORD(me.place) + ' with ' + me.total + ' points.</div>' : '') + '</div>';
  }

  const api = { play, phoneHtml, BEAT, ORD, STAGES: ['title', 'count', 'decider', 'places', 'hold', 'tie', 'winner', 'table'] };
  root.HubFinale = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
