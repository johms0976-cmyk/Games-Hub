/* Blood Rage — the battlefield, on the telly.
 *
 * When a clan pillages, the board gives way to the province itself: its
 * baked plate (bakery/regions.py), every figure fighting over it stood on its
 * ground, and a banner for each clan with its strength and its face-down
 * card. When the cards are all down the clans charge, the dust goes up, and
 * when it settles only the victors are standing. Only then do the cards turn
 * over. The engine holds the result back until this has played (opts.clashShow),
 * so no phone and no line of the log can give it away first.
 *
 * Everything here is drawn from what the telly passes in: a publicView, and
 * after the release the held `show` the engine prepared. Nothing reads a hand.
 *
 * THE PLATE CONTRACT (regions.py): a ground point (u, v) metres — u across the
 * frame, v away from the camera — lands on the 1920x1080 plate at
 *   x = ox + u*ppm,  y = oy - v*sin(el)*ppm
 * and the figure sprites share the plates' camera, so a sprite drawn at
 * ppm / pxPerM stands on that point at the right size.
 */
(function (root) {
  'use strict';
  const D = root.BRData, A = root.BRArt;
  const REGION_VER = 3;
  const esc = A.esc;

  const DEF = { w: 1920, h: 1080, ppm: 100, ox: 960, oy: 700, el: 24,
    arena: { u0: -8, u1: 8, v0: -3, v1: 4.2 }, water: { v0: 5.4, v1: 9.2, z: -0.12, moor: 7.0 } };
  const REG = () => root.BR_REGIONS || null;
  const CT = () => (REG() && REG().contract) || DEF;
  const figsMan = () => root.BR_FIGS && root.BR_FIGS.figs ? root.BR_FIGS : null;

  function pix(u, v, z) {
    const c = CT(), e = c.el * Math.PI / 180;
    return [c.ox + u * c.ppm, c.oy - v * Math.sin(e) * c.ppm - (z || 0) * Math.cos(e) * c.ppm];
  }
  /* A stable 0..1 from a string: layout jitter must not change between two paints. */
  function h01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  const shipLike = f => f.kind === 'ship' || (f.kind === 'monster' && D.CARDS[f.key] && D.CARDS[f.key].fx === 'isShip');

  /* ---------------- where everybody stands ---------------- */
  /* Boxes on the arena, in ground metres. u0 is the edge nearest the fight; a
     side box fills outward from it, column by column. */
  const BOX = {
    L:   { u0: -2.2, u1: -7.8, v0: -2.3, v1: 3.5, rows: 3 },
    R:   { u0: 2.2, u1: 7.8, v0: -2.3, v1: 3.5, rows: 3 },
    L4:  { u0: -2.2, u1: -7.8, v0: -2.3, v1: 2.1, rows: 3 },
    R4:  { u0: 2.2, u1: 7.8, v0: -2.3, v1: 2.1, rows: 3 },
    B:   { u0: -2.4, u1: 2.4, v0: 2.6, v1: 3.9, across: true },
    BL:  { u0: -0.6, u1: -4.8, v0: 2.7, v1: 3.9, across: true },
    BR:  { u0: 0.6, u1: 4.8, v0: 2.7, v1: 3.9, across: true },
    F:   { u0: -2.2, u1: 2.2, v0: -2.7, v1: -1.9, across: true },
    MID: { u0: -3.4, u1: 3.4, v0: -1.2, v1: 2.4, across: true }
  };
  const PLAN = { 1: ['L'], 2: ['L', 'R'], 3: ['L', 'R', 'B'], 4: ['L4', 'R4', 'BL', 'BR'], 5: ['L4', 'R4', 'BL', 'BR', 'F'] };
  const boxCentreU = b => (BOX[b].u0 + BOX[b].u1) / 2;

  function spriteKey(f, clan) { return A.figKey(f, clan); }
  function sprite(f, clan) { return A.spriteOf(spriteKey(f, clan)); }
  const heightOf = (f, clan) => { const m = sprite(f, clan); return m ? m.h : 200; };

  function fill(boxId, figs, clan) {
    const b = BOX[boxId];
    const out = [];
    const n = figs.length;
    if (!n) return out;
    const list = figs.slice().sort((x, y) => heightOf(x, clan) - heightOf(y, clan) || (x.id < y.id ? -1 : 1));
    const faceFor = u => b.across ? u > 0.2 : boxId[0] === 'R';
    if (b.across) {
      const rows = n > 5 ? 2 : 1;
      const cols = Math.ceil(n / rows);
      list.forEach((f, k) => {
        const row = Math.floor(k / cols), col = k % cols;
        const t = (col + 0.5) / cols;
        const u = b.u0 + (b.u1 - b.u0) * t + (h01(f.id) - 0.5) * 0.25;
        const v = rows === 1 ? (b.v0 + b.v1) / 2 : b.v1 - (row + 0.5) * (b.v1 - b.v0) / rows;
        out.push({ f, u, v, flip: faceFor(u) });
      });
      return out;
    }
    const rows = Math.min(b.rows, n);
    const cols = Math.ceil(n / rows);
    const dir = Math.sign(b.u1 - b.u0);
    const span = Math.abs(b.u1 - b.u0);
    const cell = Math.min(1.5, span / Math.max(1, cols));
    list.forEach((f, k) => {
      const col = Math.floor(k / rows), row = k % rows;
      const u = b.u0 + dir * Math.min(span - 0.3, (col + 0.5 + (row % 2) * 0.3) * cell) + (h01(f.id) - 0.5) * 0.2;
      const v = b.v0 + (row + 0.5) * (b.v1 - b.v0) / rows + (h01(f.id + 'v') - 0.5) * 0.3;
      out.push({ f, u, v, flip: faceFor(u) });
    });
    return out;
  }

  function shipSpots(boxId, ships) {
    const c = CT();
    const uc = BOX[boxId] ? boxCentreU(boxId) * 0.9 : 0;
    const m = ships.length;
    return ships.map((f, k) => {
      const u = Math.max(-8.2, Math.min(8.2, uc + (k - (m - 1) / 2) * 3.0));
      return { f, u, v: c.water.moor + (k % 2 ? 0.45 : -0.25), flip: u < -0.2, ship: true };
    });
  }

  /* Every figure in the area, placed. `order` is the clans in the order the
     boxes are handed out (the pillager first, so it always comes in from the
     left). `victors` is the winning clan: its land figures take the middle of
     the field; anyone else still standing (Frigga saved them) keeps its side. */
  function layout(figs, order, clanOf, opts) {
    opts = opts || {};
    const plan = PLAN[Math.min(5, Math.max(1, order.length))];
    const out = [];
    order.forEach((pid, i) => {
      const mine = figs.filter(f => f.owner === pid);
      const box = opts.victors && opts.victors === pid ? 'MID' : plan[i];
      out.push.apply(out, fill(box, mine.filter(f => !shipLike(f)), clanOf[pid]));
      out.push.apply(out, shipSpots(plan[i], mine.filter(shipLike)));
    });
    /* someone standing there who is not in the order (should not happen): the middle */
    const known = new Set(order);
    const strays = figs.filter(f => !known.has(f.owner));
    if (strays.length) out.push.apply(out, fill('MID', strays, clanOf[strays[0].owner]));
    for (const p of out) {
      const [x, y] = pix(p.u, p.v, p.ship ? -0.3 : 0);
      p.x = x; p.y = y;
      p.key = spriteKey(p.f, clanOf[p.f.owner]);
    }
    return out;
  }

  /* ---------------- the dust ---------------- */
  function Dust(canvas) {
    this.cv = canvas;
    let ctx = null;
    try { ctx = canvas && !/jsdom/i.test(root.navigator ? root.navigator.userAgent : '') ? canvas.getContext('2d') : null; } catch (e) { ctx = null; }
    this.ctx = ctx;
    this.puffs = [];
    this.sparks = [];
    this.flashes = [];
    this.on = false;
    this.fight = false;
    this.raf = 0;
  }
  Dust.prototype.tint = function (hex, embers) {
    this.embers = !!embers;
    if (!this.ctx) return;
    const mk = (a, b) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, a); g.addColorStop(0.55, a.replace(/[\d.]+\)$/, '0.55)')); g.addColorStop(1, b);
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
      return c;
    };
    const rgb = hexRgb(hex);
    const dark = rgb.map(v => Math.round(v * 0.62));
    this.puffLight = mk('rgba(' + rgb.join(',') + ',0.95)', 'rgba(' + rgb.join(',') + ',0)');
    this.puffDark = mk('rgba(' + dark.join(',') + ',0.9)', 'rgba(' + dark.join(',') + ',0)');
  };
  /* Rise over the box the fighters stand in (stage pixels) and keep rising
     until settle(). */
  /* `ash`: Ragnarök's thin smoke — the table must SEE the land burn and the
     doomed go, so a few pale puffs drift high, embers rise, and no fight flashes. */
  Dust.prototype.start = function (box, ash) {
    if (!this.ctx) return;
    this.box = box;
    this.ash = !!ash;
    this.on = true;
    this.fight = !ash;
    this.t0 = performance.now();
    this.loop();
  };
  Dust.prototype.settle = function () { this.on = false; this.fight = false; };
  Dust.prototype.stop = function () {
    this.on = false; this.fight = false;
    this.puffs = []; this.sparks = []; this.flashes = [];
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.ctx) this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
  };
  Dust.prototype.loop = function () {
    if (this.raf) return;
    const step = () => {
      this.raf = 0;
      if (!this.frame()) return;
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  };
  Dust.prototype.frame = function () {
    const x = this.ctx, B = this.box, s = 0.5;          // the canvas is half the stage's size
    const cw = this.cv.width, ch = this.cv.height;
    x.clearRect(0, 0, cw, ch);
    const cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
    const rx = (B.x1 - B.x0) / 2, ry = (B.y1 - B.y0) / 2;
    if (this.on && this.puffs.length < (this.ash ? 45 : 260)) {
      for (let k = 0; k < (this.ash ? 2 : 9); k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
        const px = cx + Math.cos(a) * r * rx, py = this.ash ? B.y0 - Math.random() * 260 : cy + Math.sin(a) * r * ry;
        this.puffs.push({ x: px, y: py, r: 50 + Math.random() * 70, g: 0.5 + Math.random() * 1.1,
          vx: (px - cx) / rx * (0.4 + Math.random() * 0.8), vy: -0.25 - Math.random() * 0.6,
          a: 0, top: this.ash ? 0.12 + Math.random() * 0.14 : 0.75 + Math.random() * 0.25, dark: this.ash || Math.random() < 0.35, rot: Math.random() * 6 });
      }
    }
    if (this.fight && Math.random() < 0.3) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.7;
      const fx = cx + Math.cos(a) * r * rx, fy = cy + Math.sin(a) * r * ry * 0.8;
      this.flashes.push({ x: fx, y: fy, life: 1 });
      const n = 5 + Math.floor(Math.random() * 7);
      for (let k = 0; k < n; k++) {
        const d = Math.random() * Math.PI * 2, v = 6 + Math.random() * 14;
        this.sparks.push({ x: fx, y: fy, vx: Math.cos(d) * v, vy: Math.sin(d) * v - 3, life: 1 });
      }
    }
    if (this.embers && Math.random() < (this.ash ? 0.95 : 0.6)) {
      this.sparks.push({ x: cx + (Math.random() - 0.5) * rx * 2, y: cy + ry * 0.5, vx: (Math.random() - 0.5) * 2, vy: -3 - Math.random() * 4, life: 1, ember: true });
    }
    this.puffs.sort((p, q) => p.y - q.y);
    for (const p of this.puffs) {
      p.x += p.vx; p.y += p.vy; p.r += p.g;
      p.a = this.on ? Math.min(p.top, p.a + 0.06) : p.a - 0.011;
      if (!this.on) { p.vy -= 0.02; p.vx *= 1.01; p.g += 0.03; }
      if (p.a <= 0) continue;
      const img = p.dark ? this.puffDark : this.puffLight;
      x.globalAlpha = Math.max(0, p.a);
      const R = p.r * s;
      x.drawImage(img, p.x * s - R, p.y * s - R, R * 2, R * 2);
    }
    this.puffs = this.puffs.filter(p => this.on || p.a > 0);
    x.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const R = (1.2 - f.life) * 120 * s;
      const g = x.createRadialGradient(f.x * s, f.y * s, 0, f.x * s, f.y * s, R + 1);
      g.addColorStop(0, 'rgba(255,245,215,' + (0.9 * f.life) + ')');
      g.addColorStop(1, 'rgba(255,160,60,0)');
      x.globalAlpha = 1;
      x.fillStyle = g;
      x.fillRect(f.x * s - R, f.y * s - R, R * 2, R * 2);
      f.life -= 0.12;
    }
    this.flashes = this.flashes.filter(f => f.life > 0);
    x.lineCap = 'round';
    for (const p of this.sparks) {
      x.globalAlpha = Math.max(0, p.life);
      x.strokeStyle = p.ember ? '#ff8a3a' : '#ffe9b0';
      x.lineWidth = p.ember ? 2 : 2.2;
      x.beginPath();
      x.moveTo(p.x * s, p.y * s);
      x.lineTo((p.x - p.vx * 1.6) * s, (p.y - p.vy * 1.6) * s);
      x.stroke();
      p.x += p.vx; p.y += p.vy; p.vy += p.ember ? -0.02 : 0.9; p.vx *= 0.96;
      p.life -= p.ember ? 0.012 : 0.07;
    }
    this.sparks = this.sparks.filter(p => p.life > 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    return this.on || this.puffs.length || this.sparks.length || this.flashes.length;
  };
  function hexRgb(h) { h = String(h || '#999').replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); }

  /* ---------------- the scene ---------------- */
  function Scene(host) {
    this.host = host;
    host.classList.add('bfield');
    host.innerHTML =
      '<div class="bf-stage"><div class="bf-cam">' +
        '<img class="bf-plate" alt="">' +
        '<img class="bf-plate bf-rag" alt="">' +
        '<div class="bf-figs"></div>' +
        '<div class="bf-sky"></div><div class="bf-glow"></div>' +
        '<canvas class="bf-dust" width="960" height="540"></canvas>' +
        '<div class="bf-ghosts"></div>' +
        '<div class="bf-flash"></div>' +
      '</div>' +
      '<div class="bf-banners"></div>' +
      '<div class="bf-title"><h2></h2><p></p></div>' +
      '<div class="bf-verdict"></div></div>';
    this.stage = host.querySelector('.bf-stage');
    this.cam = host.querySelector('.bf-cam');
    this.plate = host.querySelector('.bf-plate');
    this.ragPlate = host.querySelector('.bf-rag');
    this.figsEl = host.querySelector('.bf-figs');
    this.ghostsEl = host.querySelector('.bf-ghosts');
    this.flashEl = host.querySelector('.bf-flash');
    this.bannersEl = host.querySelector('.bf-banners');
    this.titleEl = host.querySelector('.bf-title');
    this.verdictEl = host.querySelector('.bf-verdict');
    this.dust = new Dust(host.querySelector('.bf-dust'));
    this.els = {};
    this.banners = {};
    this.prov = null;
    this.playing = false;
    this.timers = [];
    this.fit();
    if (root.addEventListener) root.addEventListener('resize', () => this.fit());
  }
  const P = Scene.prototype;
  P.fit = function () {
    const r = this.host.getBoundingClientRect ? this.host.getBoundingClientRect() : { width: 0, height: 0 };
    const k = Math.min(r.width / 1920, r.height / 1080) || 0.5;
    this.stage.style.setProperty('--k', k.toFixed(4));
  };
  P.open = function (prov) {
    if (!this.host.classList.contains('on')) { this.host.classList.add('on'); this.fit(); }
    if (this.prov === prov) return;
    this.reset();
    this.prov = prov;
    const R = REG();
    const info = R && R.regions[prov];
    this.plate.src = info ? 'art/regions/' + prov + '.webp?v=' + REGION_VER : '';
    this.plate.style.visibility = info ? 'visible' : 'hidden';
    this.host.dataset.prov = prov;
    this.dust.tint(info ? info.dust : '#a89a80', info && info.sig === 'lava');
  };
  P.close = function () {
    if (!this.host.classList.contains('on') && this.prov === null) return;
    this.host.classList.remove('on');
    this.reset();
    this.prov = null;
  };
  P.reset = function () {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.playing = false;
    this.dust.stop();
    this.figsEl.innerHTML = '';
    this.godId = null; this.godEl = null;
    this.ghostsEl.innerHTML = '';
    this.els = {};
    this.bannersEl.innerHTML = '';
    this.banners = {};
    this.verdictEl.className = 'bf-verdict';
    this.verdictEl.innerHTML = '';
    this.verdictKey = '';
    this.stage.classList.remove('shake', 'clashing', 'settled', 'rag-dark', 'rag-burn');
    this.ragPlate.removeAttribute('src');
    this.ragPlate.style.visibility = 'hidden';
    this.titleEl.querySelector('h2').textContent = '';
    this.titleEl.querySelector('p').textContent = '';
  };

  /* Place the figures. New ones march in from their own side; gone ones fade. */
  P.place = function (spots, hexOf) {
    if (this.playing) return;
    const F = figsMan();
    const k = CT().ppm / (F ? F.pxPerM : 120);
    const seen = {};
    for (const p of spots) {
      seen[p.f.id] = true;
      let e = this.els[p.f.id];
      const m = A.spriteOf(p.key);
      if (!e) {
        const el = document.createElement('div');
        el.className = 'bf-fig' + (p.ship ? ' ship' : '') + (p.f.kind === 'monster' ? ' monster' : '');
        el.dataset.fig = p.f.id;
        const sp = document.createElement('div');
        sp.className = 'bf-sp';
        const base = document.createElement('div');
        base.className = 'bf-base';
        el.appendChild(base);
        el.appendChild(sp);
        let img = null;
        if (m) {
          img = document.createElement('img');
          img.alt = '';
          img.src = 'art/figs/' + p.key + '.webp?v=' + A.ART_VER;
          img.style.width = (m.w * k).toFixed(1) + 'px';
          img.style.height = (m.h * k).toFixed(1) + 'px';
          img.style.left = (-m.ax * k).toFixed(1) + 'px';
          img.style.top = (-m.ay * k).toFixed(1) + 'px';
          img.style.transformOrigin = (m.ax * k).toFixed(1) + 'px ' + (m.ay * k).toFixed(1) + 'px';
          if (p.ship) {
            const wl = Math.max(0.5, (m.ay * k - 26) / (m.h * k));
            img.style.webkitMaskImage = img.style.maskImage = 'linear-gradient(to bottom,#000 ' + (wl * 100).toFixed(1) + '%,transparent ' + ((wl + 0.07) * 100).toFixed(1) + '%)';
          }
          sp.appendChild(img);
        } else {
          const tok = document.createElement('div');
          tok.className = 'bf-tok';
          sp.appendChild(tok);
        }
        /* a Leader or Warrior stands on its own sculpted base: just a shadow under it, sized to it */
        if (m && m.base) el.classList.add('based');
        const w = m && m.base ? m.base * 2.25 * CT().ppm : (m ? Math.max(60, Math.min(260, m.w * k * (p.ship ? 0.9 : 0.55))) : 60);
        el.style.setProperty('--bw', w.toFixed(0) + 'px');
        /* arrive from outside the frame on this clan's side */
        const from = p.u < 0 ? -420 : 420;
        el.style.transform = 'translate(' + (p.x + from).toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
        el.style.opacity = '0';
        this.figsEl.appendChild(el);
        e = this.els[p.f.id] = { el, sp, img, x: p.x, y: p.y, u: p.u, v: p.v, flip: null, key: p.key, ship: !!p.ship, hex: '' };
        void el.offsetWidth;
        el.classList.add('moving');
        el.style.opacity = '1';
      } else if (e.el.classList.contains('gone')) {
        e.el.classList.remove('gone');
      }
      const hex = hexOf[p.f.owner] || '#888';
      if (e.hex !== hex) { e.hex = hex; e.el.style.setProperty('--hex', hex); }
      if (e.flip !== p.flip && e.img) { e.flip = p.flip; e.img.style.transform = p.flip ? 'scaleX(-1)' : ''; }
      e.x = p.x; e.y = p.y; e.u = p.u; e.v = p.v;
      const tf = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
      if (e.el.style.transform !== tf) { e.el.classList.add('moving'); e.el.style.transform = tf; }
      e.el.style.zIndex = String(Math.round(2000 - p.v * 100));
    }
    for (const id of Object.keys(this.els)) {
      if (seen[id]) continue;
      const e = this.els[id];
      e.el.classList.add('gone');
      delete this.els[id];
      this.timers.push(setTimeout(() => { if (e.el.parentNode) e.el.parentNode.removeChild(e.el); }, 700));
    }
  };

  /* A god of Asgard in this province stands at the back of the field, bigger than anyone fighting. */
  P.god = function (id) {
    if (this.godId === id) return;
    this.godId = id;
    if (this.godEl && this.godEl.parentNode) this.godEl.parentNode.removeChild(this.godEl);
    this.godEl = null;
    const m = id ? A.spriteOf('god_' + id) : null;
    if (!m) return;
    const F = figsMan(), k = CT().ppm / (F ? F.pxPerM : 120) * 1.15;
    const [x, y] = pix(5.4, 4.6);
    const el = document.createElement('div');
    el.className = 'bf-godfig';
    el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    el.innerHTML = '<img alt="" src="art/figs/god_' + id + '.webp?v=' + A.ART_VER + '" style="width:' + (m.w * k).toFixed(1) + 'px;height:' + (m.h * k).toFixed(1) +
      'px;left:' + (-m.ax * k).toFixed(1) + 'px;top:' + (-m.ay * k).toFixed(1) + 'px">';
    this.figsEl.appendChild(el);
    el.style.zIndex = String(Math.round(2000 - 4.6 * 100));
    this.godEl = el;
  };

  P.title = function (h, p) {
    const H = this.titleEl.querySelector('h2'), Pp = this.titleEl.querySelector('p');
    if (H.textContent !== h) H.textContent = h;
    if (Pp.textContent !== (p || '')) Pp.textContent = p || '';
  };

  /* rows: {id, html} — each banner only repaints when its own html changes,
     so a card slammed down or turned over animates once. */
  P.bannerRows = function (rows) {
    const want = rows.map(r => r.id);
    for (const id of Object.keys(this.banners)) {
      if (want.indexOf(id) >= 0) continue;
      this.banners[id].remove();
      delete this.banners[id];
    }
    rows.forEach((r, i) => {
      let el = this.banners[r.id];
      if (!el) {
        el = document.createElement('div');
        el.dataset.clan = r.id;
        this.banners[r.id] = el;
      }
      if (this.bannersEl.children[i] !== el) this.bannersEl.insertBefore(el, this.bannersEl.children[i] || null);
      if (el.className !== 'bf-banner ' + (r.cls || '')) el.className = 'bf-banner ' + (r.cls || '');
      if (el.__html !== r.html) { el.innerHTML = r.html; el.__html = r.html; }
      el.style.setProperty('--hex', r.hex);
    });
  };

  P.verdict = function (key, html, cls) {
    if (this.verdictKey === key) return;
    this.verdictKey = key;
    this.verdictEl.className = 'bf-verdict' + (html ? ' on ' + (cls || '') : '');
    this.verdictEl.innerHTML = html || '';
  };

  /* The fight. `plan`: doomed fig ids, the victors' places, the timings.
     `done` is called once the dust has settled and the victors stand. */
  P.clash = function (plan, T, done) {
    if (this.playing) return;
    this.playing = true;
    const els = this.els;
    const ids = Object.keys(els);
    const doomed = new Set(plan.doomed);
    const at = (ms, fn) => this.timers.push(setTimeout(fn, ms));
    this.stage.classList.add('clashing');
    this.stage.classList.remove('settled');
    const land = ids.filter(id => !els[id].ship);
    const ships = ids.filter(id => els[id].ship);
    /* the box the fight fills: every land figure from its feet to its head */
    let box = null;
    const k = CT().ppm / ((figsMan() || { pxPerM: 120 }).pxPerM);
    const centre = pix(0, 0.7);
    for (const id of ids) {
      const e = els[id], m = A.spriteOf(e.key);
      const hgt = m ? m.ay * k : 200, wd = m ? m.w * k / 2 : 60;
      const cx = e.ship ? e.x : e.x + (centre[0] - e.x) * 0.5;
      const b = { x0: cx - wd, x1: cx + wd, y0: e.y - hgt, y1: e.y + 30 };
      box = box ? { x0: Math.min(box.x0, b.x0), x1: Math.max(box.x1, b.x1), y0: Math.min(box.y0, b.y0), y1: Math.max(box.y1, b.y1) } : b;
    }
    box = box || { x0: 660, x1: 1260, y0: 380, y1: 760 };
    box = { x0: box.x0 - 40, x1: box.x1 + 40, y0: box.y0 + 40, y1: box.y1 + 10 };

    for (const id of ids) els[id].sp.classList.add('ready');
    const t1 = T.lean, t2 = t1 + T.charge, t3 = t2 + T.fight, t4 = t3 + T.clear;
    at(t1, () => {
      for (const id of land) {
        const e = els[id];
        const j = h01(id + 'c');
        const tx = e.x + (centre[0] - e.x) * (0.42 + 0.2 * j) + (j - 0.5) * 60;
        const ty = e.y + (centre[1] - e.y) * 0.35;
        e.el.classList.remove('moving');
        e.el.style.transition = 'transform ' + T.charge + 'ms cubic-bezier(.55,0,.85,.6)';
        e.el.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px)';
        e.sp.classList.remove('ready');
        e.sp.classList.add('run');
        e.sp.style.animationDelay = (-j * 300).toFixed(0) + 'ms';
      }
      for (const id of ships) els[id].sp.classList.add('rock');
    });
    at(t1 + T.charge * 0.55, () => this.dust.start(box));
    at(t2, () => {
      this.stage.classList.add('shake');
      for (const id of land) {
        const e = els[id];
        e.sp.classList.remove('run');
        e.sp.classList.add('brawl');
        e.sp.style.animationDelay = (-h01(id + 'b') * 500).toFixed(0) + 'ms';
      }
    });
    /* under the thickest of it, the fallen go */
    at(t2 + T.fight * 0.55, () => {
      for (const id of ids) if (doomed.has(id)) els[id].sp.classList.add(els[id].ship ? 'sunk' : 'fallen');
    });
    at(t3, () => {
      this.dust.settle();
      this.stage.classList.remove('shake');
      const spots = {};
      for (const s of plan.victors) spots[s.f.id] = s;
      for (const id of ids) {
        const e = els[id];
        e.sp.classList.remove('brawl', 'rock');
        if (doomed.has(id)) continue;
        const s = spots[id];
        if (!s) continue;
        e.el.style.transition = 'transform ' + Math.round(T.clear * 0.8) + 'ms ease-out';
        e.el.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px)';
        e.el.style.zIndex = String(Math.round(2000 - s.v * 100));
        e.x = s.x; e.y = s.y; e.u = s.u; e.v = s.v;
        if (e.img) { e.flip = s.flip; e.img.style.transform = s.flip ? 'scaleX(-1)' : ''; }
      }
    });
    at(t4, () => {
      this.stage.classList.remove('clashing');
      this.stage.classList.add('settled');
      for (const id of ids) {
        const e = els[id];
        e.el.style.transition = '';
        if (!doomed.has(id)) e.sp.classList.add('cheer');
      }
      this.fallen = ids.filter(id => doomed.has(id)).map(id => ({ id, key: els[id].key, x: els[id].x, y: els[id].y, flip: els[id].flip, ship: els[id].ship }));
      for (const id of ids) if (doomed.has(id)) { const e = els[id]; if (e.el.parentNode) e.el.parentNode.removeChild(e.el); delete els[id]; }
      this.playing = false;
      done();
    });
  };

  /* Ragnarök. The province's figures are already standing (place()); the
     engine has decided who dies and who flees (the Volur Witch). The sky goes
     black, the ground shakes and the land crossfades into its burning plate
     (regions.py --ragnarok, the same camera, so nobody moves off their spot),
     the doomed sink into the fire one after another, a fleeing figure runs
     for Yggdrasil, and the fallen rise as ghosts. `done` once the smoke thins. */
  P.ragnarok = function (plan, T, done) {
    if (this.playing) return;
    this.playing = true;
    const els = this.els, ids = Object.keys(els);
    const dies = new Set(plan.dies || []), flees = new Set(plan.flees || []);
    const at = (ms, fn) => this.timers.push(setTimeout(fn, ms));
    const R = REG(), info = R && R.regions[this.prov];
    if (info && info.rag) {
      this.ragPlate.src = 'art/regions/' + this.prov + '_rag.webp?v=' + REGION_VER;
      this.ragPlate.style.visibility = 'visible';
    }
    this.stage.style.setProperty('--burn', T.burn + 'ms');
    this.stage.style.setProperty('--dark', T.rumble + 'ms');
    this.dust.tint('#3b2420', true);
    this.stage.classList.add('rag-dark');
    for (const id of ids) els[id].sp.classList.add('quail');
    at(T.rumble * 0.35, () => this.strike(-4));
    at(T.rumble * 0.8, () => this.strike(3.5));
    const t1 = T.rumble, tFall = t1 + T.burn * 0.4, t2 = Math.max(t1 + T.burn, tFall + T.fall), t3 = t2 + T.settle;
    at(t1, () => {
      this.stage.classList.add('rag-burn', 'shake');
      this.dust.start({ x0: 80, x1: 1840, y0: 330, y1: 900 }, true);
    });
    /* the doomed go one after another, front to back, so each can be seen to go */
    const order = ids.filter(id => dies.has(id) || flees.has(id)).sort((a, b) => els[b].y - els[a].y);
    this.fallen = [];
    order.forEach((id, k) => {
      const e = els[id];
      at(tFall + T.fall * (order.length > 1 ? k / (order.length - 1) : 0) * 0.8, () => {
        e.sp.classList.remove('quail');
        if (flees.has(id)) {
          /* away up the field, towards the World Tree */
          e.el.classList.remove('moving');
          e.el.classList.add('fleeing');
          e.el.style.transform = 'translate(' + (960 + (e.x - 960) * 0.3).toFixed(1) + 'px,' + (e.y - 260).toFixed(1) + 'px) scale(.6)';
          e.sp.classList.add('run');
          return;
        }
        e.sp.classList.add(e.ship ? 'sunk' : 'engulfed');
        e.el.classList.add('doomed');
        this.fallen.push({ id, key: e.key, x: e.x, y: e.y, flip: e.flip, ship: e.ship });
      });
    });
    at(t2, () => {
      this.stage.classList.remove('shake');
      this.dust.settle();
      for (const id of ids) els[id].sp.classList.remove('quail');
      this.ghosts();
    });
    at(t3, () => {
      for (const id of ids) {
        if (!dies.has(id) && !flees.has(id)) continue;
        const e = els[id];
        if (e.el.parentNode) e.el.parentNode.removeChild(e.el);
        delete els[id];
      }
      this.playing = false;
      done();
    });
  };

  /* Lightning: Odin's Smite, before the clash. `u` is where it lands. */
  P.strike = function (u) {
    const el = this.flashEl;
    el.style.setProperty('--fx', (50 + (u || 0) / 19.2 * 100).toFixed(0) + '%');
    el.classList.remove('strike');
    void el.offsetWidth;
    el.classList.add('strike');
    this.stage.classList.add('shake');
    this.timers.push(setTimeout(() => { if (!this.playing) this.stage.classList.remove('shake'); }, 450));
  };

  /* The fallen rise out of the field, pale, on their way to Valhalla. */
  P.ghosts = function () {
    const F = figsMan();
    const k = CT().ppm / (F ? F.pxPerM : 120);
    for (const g of this.fallen || []) {
      const m = A.spriteOf(g.key);
      if (!m) continue;
      const el = document.createElement('div');
      el.className = 'bf-ghost';
      el.style.transform = 'translate(' + g.x.toFixed(1) + 'px,' + g.y.toFixed(1) + 'px)';
      el.innerHTML = '<img alt="" src="art/figs/' + g.key + '.webp?v=' + A.ART_VER + '" style="width:' + (m.w * k).toFixed(1) + 'px;height:' + (m.h * k).toFixed(1) +
        'px;left:' + (-m.ax * k).toFixed(1) + 'px;top:' + (-m.ay * k).toFixed(1) + 'px;transform-origin:' + (m.ax * k).toFixed(1) + 'px ' + (m.ay * k).toFixed(1) + 'px' +
        (g.flip ? ';transform:scaleX(-1)' : '') + '">';
      el.style.animationDelay = (h01(g.id) * 500).toFixed(0) + 'ms';
      this.ghostsEl.appendChild(el);
      this.timers.push(setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4200));
    }
    this.fallen = [];
  };

  const CSS =
    '.bfield{position:absolute;inset:0;z-index:30;background:#07090b;overflow:hidden;opacity:0;pointer-events:none;transition:opacity .45s}' +
    '.bfield.on{opacity:1;pointer-events:auto}' +
    '.bf-stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform:translate(-50%,-50%) scale(var(--k,.5));transform-origin:50% 50%}' +
    '.bf-cam{position:absolute;inset:0;overflow:hidden}' +
    '.bf-plate{position:absolute;left:0;top:0;width:1920px;height:1080px}' +
    '.bf-figs,.bf-ghosts{position:absolute;inset:0}' +
    /* its own stacking context, so no figure's z-index can climb above the dust */
    '.bf-figs{z-index:1}' +
    '.bf-flash{position:absolute;inset:0;z-index:7;pointer-events:none;opacity:0;background:radial-gradient(ellipse at var(--fx,50%) 30%,rgba(235,245,255,.95),rgba(170,200,255,.35) 45%,rgba(0,0,0,0) 75%)}' +
    '.bf-flash.strike{animation:bfStrike .9s ease-out}' +
    '@keyframes bfStrike{0%{opacity:0}8%{opacity:1}16%{opacity:.2}24%{opacity:.9}100%{opacity:0}}' +
    '.bf-dust{position:absolute;left:0;top:0;width:1920px;height:1080px;pointer-events:none;z-index:5}' +
    '.bf-ghosts{z-index:6;pointer-events:none}' +
    '.bf-fig{position:absolute;left:0;top:0;width:0;height:0;transition:opacity .6s}' +
    '.bf-godfig{position:absolute;left:0;top:0;width:0;height:0;animation:bfGod 1.4s ease-out}' +
    '.bf-godfig img{position:absolute;display:block;filter:drop-shadow(0 0 22px rgba(255,220,140,.55)) drop-shadow(0 6px 4px rgba(0,0,0,.4))}' +
    '@keyframes bfGod{from{opacity:0;filter:brightness(2.2)}to{opacity:1;filter:none}}' +
    '.bf-fig.moving{transition:transform .9s cubic-bezier(.3,.7,.3,1),opacity .6s}' +
    '.bf-fig.gone{opacity:0 !important}' +
    '.bf-sp{position:absolute;left:0;top:0;width:0;height:0}' +
    '.bf-sp img{position:absolute;display:block;filter:drop-shadow(0 4px 3px rgba(0,0,0,.35))}' +
    '.bf-tok{position:absolute;left:-22px;top:-60px;width:44px;height:60px;border-radius:40% 40% 8px 8px;background:var(--hex);border:3px solid #0b0d12}' +
    '.bf-base{position:absolute;left:calc(var(--bw) / -2);top:calc(var(--bw) / -5.2);width:var(--bw);height:calc(var(--bw) / 2.6);border-radius:50%;' +
      'background:radial-gradient(closest-side,rgba(0,0,0,.5),rgba(0,0,0,.18) 70%,rgba(0,0,0,0));box-shadow:0 0 0 3px var(--hex) inset;opacity:.9}' +
    '.bf-fig.based .bf-base{box-shadow:none;background:radial-gradient(closest-side,rgba(0,0,0,.5),rgba(0,0,0,.2) 70%,rgba(0,0,0,0));margin-left:8px;margin-top:4px}' +
    '.bf-fig.ship .bf-base{box-shadow:none;background:radial-gradient(closest-side,rgba(255,255,255,.35),rgba(255,255,255,.08) 60%,rgba(255,255,255,0))}' +
    '.bf-fig.ship .bf-sp img{filter:none}' +
    '.bf-sp.ready{animation:bfReady .7s ease-in-out infinite alternate}' +
    '.bf-sp.run{animation:bfRun .28s ease-in-out infinite alternate}' +
    '.bf-sp.brawl{animation:bfBrawl .34s steps(2,end) infinite}' +
    '.bf-sp.rock{animation:bfRock 1.3s ease-in-out infinite alternate}' +
    '.bf-sp.fallen{transition:opacity .35s,transform .4s;opacity:0;transform:translateY(20px) rotate(-35deg)}' +
    '.bf-sp.sunk{transition:opacity .9s,transform 1.2s;opacity:0;transform:translateY(60px) rotate(8deg)}' +
    '.bf-sp.cheer{animation:bfCheer .5s ease-out 2}' +
    '@keyframes bfReady{from{transform:translateY(0)}to{transform:translateY(-4px) rotate(-1deg)}}' +
    '@keyframes bfRun{from{transform:translateY(0) rotate(-3deg)}to{transform:translateY(-16px) rotate(3deg)}}' +
    '@keyframes bfBrawl{0%{transform:translate(-9px,-4px) rotate(-5deg)}50%{transform:translate(8px,2px) rotate(4deg)}100%{transform:translate(-3px,-10px) rotate(-2deg)}}' +
    '@keyframes bfRock{from{transform:rotate(-2.5deg) translateY(0)}to{transform:rotate(2.5deg) translateY(-6px)}}' +
    '@keyframes bfCheer{0%{transform:translateY(0)}40%{transform:translateY(-26px)}100%{transform:translateY(0)}}' +
    '.bf-stage.shake .bf-cam{animation:bfShake .16s linear infinite}' +
    '@keyframes bfShake{0%{transform:translate(0,0)}25%{transform:translate(-6px,3px)}50%{transform:translate(5px,-4px)}75%{transform:translate(-3px,-2px)}100%{transform:translate(0,0)}}' +
    '.bf-ghost{position:absolute;left:0;top:0;width:0;height:0;opacity:0;animation:bfGhost 3.4s ease-out forwards}' +
    '.bf-ghost img{position:absolute;display:block;filter:grayscale(1) brightness(2.1) sepia(.35) hue-rotate(170deg);mix-blend-mode:screen}' +
    '@keyframes bfGhost{0%{opacity:0;margin-top:0}20%{opacity:.7}100%{opacity:0;margin-top:-320px}}' +
    /* banners along the top */
    '.bf-banners{position:absolute;left:24px;right:24px;top:18px;display:flex;justify-content:center;gap:16px;z-index:20}' +
    '.bf-banner{--hex:#888;display:flex;align-items:center;gap:12px;min-width:0;flex:0 1 370px;padding:10px 14px 10px 10px;border-radius:16px;' +
      'background:linear-gradient(180deg,rgba(18,13,11,.88),rgba(12,9,8,.82));border:2px solid rgba(255,255,255,.08);border-top:6px solid var(--hex);' +
      'box-shadow:0 10px 30px rgba(0,0,0,.45);color:#f3e9d8;font:16px/1.25 ui-rounded,-apple-system,"Segoe UI",system-ui,sans-serif;transition:opacity .6s,filter .6s,transform .6s}' +
    '.bf-banner.win{border-color:#e8c267;box-shadow:0 0 0 2px #e8c267,0 0 40px rgba(232,194,103,.55);transform:translateY(4px) scale(1.04)}' +
    '.bf-banner.lose{opacity:.55;filter:grayscale(.75)}' +
    '.bf-banner .bn-fig{flex:none;width:56px;height:64px;display:flex;align-items:flex-end;justify-content:center;overflow:visible}' +
    '.bf-banner .bn-fig img{height:78px;margin-top:-14px;filter:drop-shadow(0 3px 3px rgba(0,0,0,.6))}' +
    '.bf-banner .bn-main{flex:1;min-width:0}' +
    '.bf-banner .bn-name{font-weight:800;font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bf-banner .bn-clan{font-size:14px;color:#b3a28c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bf-banner .bn-str{flex:none;text-align:center;line-height:1}' +
    '.bf-banner .bn-str small{display:block;font-size:11px;letter-spacing:.14em;color:#b3a28c}' +
    '.bf-banner .bn-str b{font:900 34px/1 Georgia,serif;color:#f3e9d8}' +
    '.bf-banner .bn-cards{flex:none;display:flex;gap:6px;perspective:600px}' +
    '.bf-banner .bn-tot{flex:none;font:900 44px/1 Georgia,serif;color:#e8c267;min-width:0;animation:bfPop .5s ease-out}' +
    '.bf-banner .bn-tot:empty{display:none}' +
    '@keyframes bfPop{0%{transform:scale(.3);opacity:0}70%{transform:scale(1.25);opacity:1}100%{transform:scale(1)}}' +
    '.cslot{width:54px;height:76px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:11px;line-height:1.1;color:#b3a28c}' +
    '.cslot.choosing{border:2px dashed rgba(255,255,255,.3);animation:bfThink 1.1s ease-in-out infinite alternate}' +
    '.cslot.none{border:2px solid rgba(255,255,255,.08);opacity:.6}' +
    '.cslot.back{background:repeating-linear-gradient(45deg,#5b1512 0 6px,#6d1b17 6px 12px);border:2px solid #c9a24a;box-shadow:inset 0 0 0 3px #3a0d0b,0 4px 10px rgba(0,0,0,.5);animation:bfSlam .38s cubic-bezier(.2,1.6,.5,1)}' +
    '.cslot.back::after{content:"ᛟ";font-size:30px;color:#e8c267;opacity:.85}' +
    '.cslot.face{background:linear-gradient(180deg,#2a211c,#1a1512);border:2px solid var(--g,#c9a24a);color:#f3e9d8;padding:4px;animation:bfFlip .6s ease-out both}' +
    '.cslot.face b{font:900 24px/1 Georgia,serif;color:var(--g,#e8c267)}' +
    '.cslot.face span{font-size:10px;margin-top:3px}' +
    '.cslot.face.cancelled{opacity:.45;text-decoration:line-through}' +
    '@keyframes bfThink{from{opacity:.4}to{opacity:1}}' +
    '@keyframes bfSlam{0%{transform:translateY(-60px) rotate(-12deg) scale(1.3);opacity:0}100%{transform:none;opacity:1}}' +
    '@keyframes bfFlip{0%{transform:rotateY(90deg)}100%{transform:rotateY(0)}}' +
    /* the title along the bottom, the verdict across the middle */
    '.bf-title{position:absolute;left:0;right:0;bottom:0;padding:60px 0 26px;text-align:center;z-index:20;pointer-events:none;' +
      'background:linear-gradient(to top,rgba(8,6,5,.72),rgba(8,6,5,.45) 55%,rgba(8,6,5,0))}' +
    '.bf-title h2{margin:0;font:900 64px/1.05 Georgia,serif;letter-spacing:.04em;color:#f6ecd8;text-shadow:0 3px 0 #0b0d12,0 0 28px rgba(0,0,0,.8)}' +
    '.bf-title p{margin:6px 0 0;font:600 26px/1.3 ui-rounded,-apple-system,"Segoe UI",system-ui,sans-serif;color:#f3e9d8;text-shadow:0 2px 6px rgba(0,0,0,.95)}' +
    '.bf-title p:empty{display:none}' +
    '.bf-verdict{position:absolute;left:50%;top:29%;transform:translate(-50%,-50%) scale(.6);opacity:0;z-index:25;text-align:center;pointer-events:none;' +
      'transition:opacity .5s,transform .7s cubic-bezier(.2,1.4,.4,1);padding:22px 56px;border-radius:24px;background:radial-gradient(closest-side,rgba(10,7,6,.82),rgba(10,7,6,.55) 70%,rgba(10,7,6,0))}' +
    '.bf-verdict.on{animation:bfVerdict 4.2s cubic-bezier(.2,1.2,.4,1) forwards}' +
    /* it lands, holds, then gets out of the victors' way — the bottom line keeps saying it */
    '@keyframes bfVerdict{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}12%{opacity:1;transform:translate(-50%,-50%) scale(1)}78%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-80%) scale(.9)}}' +
    '.bf-verdict h3{margin:0;font:900 84px/1 Georgia,serif;color:#e8c267;letter-spacing:.04em;text-shadow:0 4px 0 #0b0d12,0 0 40px rgba(232,194,103,.45)}' +
    '.bf-verdict.rag h3{color:#ff9a62;text-shadow:0 4px 0 #0b0d12,0 0 46px rgba(255,90,30,.65)}' +
    '.bf-verdict.tie h3{color:#ff8a80;text-shadow:0 4px 0 #0b0d12,0 0 40px rgba(255,90,70,.45)}' +
    '.bf-verdict p{margin:10px 0 0;font:700 30px/1.3 ui-rounded,-apple-system,"Segoe UI",system-ui,sans-serif;color:#f3e9d8;text-shadow:0 2px 6px #000}' +
    '.bf-verdict small{display:block;margin-top:6px;font:600 22px/1.3 ui-rounded,system-ui,sans-serif;color:#cdbda6}' +
    '.bfield[data-prov] .bf-plate{animation:bfPlate 1.2s ease-out}' +
    /* Ragnarök: the burning plate fades up over the living one; the sky blackens; the fire lights the field from below */
    '.bfield[data-prov] .bf-plate.bf-rag{animation:none;opacity:0;transition:opacity var(--burn,2600ms) ease-in}' +
    '.bfield[data-prov] .bf-stage.rag-burn .bf-plate.bf-rag{opacity:1}' +
    '.bf-sky{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity var(--dark,1600ms) ease-in;' +
      'background:linear-gradient(180deg,rgba(12,2,3,.92),rgba(58,10,6,.55) 32%,rgba(20,4,4,.15) 60%,rgba(0,0,0,.25))}' +
    '.bf-stage.rag-dark .bf-sky{opacity:1}' +
    '.bf-glow{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;mix-blend-mode:screen;transition:opacity var(--burn,2600ms);' +
      'background:radial-gradient(ellipse 70% 45% at 50% 88%,rgba(255,96,30,.42),rgba(255,60,20,.12) 60%,rgba(0,0,0,0))}' +
    '.bf-stage.rag-burn .bf-glow{opacity:1;animation:bfFlicker 1.1s ease-in-out infinite alternate}' +
    '@keyframes bfFlicker{from{filter:brightness(.8)}to{filter:brightness(1.25)}}' +
    '.bf-sp.quail{animation:bfQuail .22s steps(2,end) infinite}' +
    '@keyframes bfQuail{0%{transform:translate(-2px,0) rotate(-1deg)}100%{transform:translate(2px,-2px) rotate(1deg)}}' +
    /* charred first (dark, rimmed in fire), then down into the ground */
    '.bf-sp.engulfed{animation:bfEngulf 2.2s ease-in forwards}' +
    '@keyframes bfEngulf{0%{filter:none;transform:none;opacity:1}' +
      '30%{filter:brightness(.42) sepia(.9) saturate(4) hue-rotate(-22deg) drop-shadow(0 0 14px rgba(255,96,24,.95));transform:translateY(4px);opacity:1}' +
      '100%{filter:brightness(.3) sepia(.9) saturate(4) hue-rotate(-22deg) drop-shadow(0 0 18px rgba(255,70,16,.9));transform:translateY(70px) scaleY(.6);opacity:0}}' +
    '.bf-fig.doomed .bf-base{opacity:0;transition:opacity 1.6s ease-in .5s}' +
    '.bf-fig.fleeing{transition:transform 2s cubic-bezier(.45,0,.8,.6),opacity 2s ease-in;opacity:0}' +
    '@keyframes bfPlate{from{filter:brightness(.4) saturate(.6)}to{filter:none}}';

  root.BRScene = { Scene, layout, pix, BOX, PLAN, CSS, REGION_VER, shipLike, h01 };
})(typeof window !== 'undefined' ? window : globalThis);
