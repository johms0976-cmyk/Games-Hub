'use strict';
/* Nations — the War, acted out (docs/LESSONS-CHECKLIST.md H1).
 *
 * The round card's War page: every nation's army marches in from the left, the War's host from the
 * right, they meet in a cloud of dust, and when it clears the victors stand cheering under their
 * banner and the defeated lie where they fell — the cost of the defeat under their names. Nobody
 * learns who held until the dust settles.
 *
 * Layered baked plates (bakery/war.py), not a 3D engine: a battlefield an age, and one soldier an
 * age as a strip of eight frames (stand, march x4, strike, cheer, fall) painted in light grey with a
 * mask of where the national colour shows. A nation's colour is multiplied over the grey through the
 * mask, so one bake serves every nation and the War's own host (a dark smoke colour).
 *
 * THE CAMERA CONTRACT (art/war/war.json, verified by the bakery): the plate's camera looks along +Y,
 * `pitch` degrees down, from (x, y, z), lens/sensor horizontal. A soldier standing at ground point
 * (X, Y) is drawn by project(), the same pinhole; his frame is `cell / px_per_m` metres across, so
 * at depth z it is (that * lens / sensor / z) of the stage's width. Nothing is sized by eye.
 *
 * It reads only the round card (W.roundCard: the War, every nation's strength against it, who was
 * defeated and what it cost them) and the public players. All motion is the Web Animations API, so
 * repainting the page never changes its markup (the telly's privacy guard compares two paints) and a
 * repaint mid-scene resumes where it was: the start time is kept per War.
 *
 *   NationsWar.html(card, pub, A)   the stage's markup ('' when there was no War)
 *   NationsWar.wake(root)           start or resume every stage under root (call after painting)
 */
(function (root) {
  const VERSION = 1;
  const BASE = (root.NATIONS_BASE != null ? root.NATIONS_BASE : '');
  const ART = BASE + 'art/war/';
  const AGES = ['antiquity', 'medieval', 'renaissance', 'industrial'];
  const FRAME = { stand: 0, march1: 1, march2: 2, march3: 3, march4: 4, strike: 5, cheer: 6, fall: 7 };
  const NF = 8;
  /* The contract, as war.json has it (copied so the page never waits on a fetch). */
  const K = {
    cam: { x: 0, y: -9.5, z: 3.4, pitch: 8, lens: 32, sensor: 36 }, w: 1600, h: 900,
    cell: 512, px_per_m: 150, feet: [0.42, 0.86]
  };
  /* Beat times in ms; scaled by T.scale (the tests turn it right down). */
  const T = { scale: 1, title: 600, march: 2600, clash: 650, dust: 1900, reveal: 1000, chips: 500 };
  const FOE = '#4a4440';                 // the War's host
  const DUST = { antiquity: '#d9c79a', medieval: '#b9b29c', renaissance: '#cfc6a6', industrial: '#8d847a' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const started = {};                    // key -> performance-ish start time

  function project(X, Y, Z) {
    const c = K.cam, p = c.pitch * Math.PI / 180;
    const dx = X - c.x, dy = Y - c.y, dz = (Z || 0) - c.z;
    const zc = dy * Math.cos(p) - dz * Math.sin(p);
    const yc = dy * Math.sin(p) + dz * Math.cos(p);
    const f = c.lens / c.sensor;
    return { x: (0.5 + (dx / zc) * f) * 100, y: (0.5 - (yc / zc) * f * K.w / K.h) * 100, z: zc };
  }
  /* A frame's width in per cent of the stage at depth z. */
  const cellW = z => (K.cell / K.px_per_m) * (K.cam.lens / K.cam.sensor) / z * 100;

  /* How many soldiers a strength puts in the field (1 to 4). */
  const troops = s => Math.max(1, Math.min(4, 1 + Math.floor((s || 0) / 6)));
  /* The lanes, front to back, one a nation in player order. */
  function lanes(n) {
    if (n === 1) return [2.2];
    const out = [];
    for (let i = 0; i < n; i++) out.push(0.2 + i * (5.8 / (n - 1)));
    return out;
  }
  const h01 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

  function figHtml(cls, age, hex, x, y, w, z, foe) {
    const strip = ART + age + '.webp', mask = ART + age + '-mask.webp';
    return '<div class="nw-fig' + (foe ? ' foe' : '') + ' ' + cls + '" style="left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%;width:' + w.toFixed(2) + '%;z-index:' + Math.round(1000 - z * 10) + '">' +
      '<div class="nw-cell"><div class="nw-strip" style="background-image:url(' + strip + ')"><div class="nw-tint" style="background:' + esc(hex) +
      ';-webkit-mask-image:url(' + mask + ');mask-image:url(' + mask + ')"></div></div></div></div>';
  }

  /* The scene's plan, from the round card alone (the same numbers on every screen). */
  function plan(card, pub) {
    const w = card.war;
    if (!w || w.none || !w.card) return null;
    const ids = (card.order || pub.order || []).slice();
    const P = id => (pub.players || []).find(p => p.id === id) || { id, name: '?', hex: '#888' };
    const age = AGES[Math.max(0, Math.min(3, (card.age || 1) - 1))];
    const ys = lanes(ids.length);
    const loss = {};
    for (const r of (card.warLoss || [])) loss[r.id] = r;
    const rows = ids.map((id, i) => {
      const p = P(id);
      const s = w.strs && w.strs[id] != null ? w.strs[id] : (loss[id] ? loss[id].str : null);
      const lost = (w.defeated || []).indexOf(id) >= 0 || !!loss[id];
      return { id, name: p.name, hex: p.hex, Y: ys[i], str: s, lost, got: loss[id] ? loss[id].got : null };
    });
    return { key: 'war' + card.round + ':' + w.card, age, war: w, rows, foeN: troops(w.str) };
  }

  function html(card, pub, A) {
    const pl = plan(card, pub);
    if (!pl) return '';
    const D = root.NationsData;
    const wname = D && D.card(pl.war.card) ? D.card(pl.war.card).name : 'The War';
    let figs = '', tags = '';
    for (const r of pl.rows) {
      const n = troops(r.str);
      for (let k = 0; k < n; k++) {
        const X = -1.4 - k * 1.05 + (h01(r.id + k) - 0.5) * 0.25, Y = r.Y + (k % 2 ? 0.28 : -0.1);
        const pt = project(X, Y);
        figs += figHtml('nwr-' + r.id.replace(/\W/g, '') + ' nw-k' + k, pl.age, r.hex, pt.x, pt.y, cellW(pt.z), pt.z, false);
      }
      for (let k = 0; k < pl.foeN; k++) {
        const X = 1.4 + k * 1.05 + (h01('f' + r.id + k) - 0.5) * 0.25, Y = r.Y + (k % 2 ? 0.28 : -0.1);
        const pt = project(X, Y);
        figs += figHtml('nwf-' + r.id.replace(/\W/g, '') + ' nw-k' + k, pl.age, FOE, pt.x, pt.y, cellW(pt.z), pt.z, true);
      }
      const bp = project(-0.95, r.Y + 0.55);
      figs += '<div class="nw-banner nw-b' + r.id.replace(/\W/g, '') + '" style="left:' + bp.x.toFixed(2) + '%;top:' + bp.y.toFixed(2) + '%;width:' + cellW(bp.z).toFixed(2) + '%;z-index:' + Math.round(1000 - bp.z * 10 + 1) + '">' +
        '<div class="nw-cell"><div class="nw-strip one" style="background-image:url(' + ART + 'banner.webp)"><div class="nw-tint" style="background:' + esc(r.hex) +
        ';-webkit-mask-image:url(' + ART + 'banner-mask.webp);mask-image:url(' + ART + 'banner-mask.webp)"></div></div></div></div>';
      const tp = project(-5.2, r.Y);
      const gain = r.got && A && root.NationsWords ? root.NationsWords.gainsHtml(r.got, A) : '';
      tags += '<div class="nw-tag" data-id="' + esc(r.id) + '" style="left:2%;top:' + Math.min(96, tp.y).toFixed(2) + '%">' +
        '<i style="background:' + esc(r.hex) + '"></i><b>' + esc(r.name) + '</b><span class="nw-s">' + (r.str != null ? r.str : '?') + '</span>' +
        '<span class="nw-res ' + (r.lost ? 'lost' : 'held') + '">' + (r.lost ? (gain || 'defeated') : 'holds') + '</span></div>';
    }
    const dust = [];
    for (let i = 0; i < 9; i++) {
      const Y = -0.5 + i * 0.85, pt = project(0, Y, 0.6), wd = cellW(pt.z) * (1.25 + h01('d' + i) * 0.5);
      dust.push('<div class="nw-dust" style="left:' + pt.x.toFixed(2) + '%;top:' + pt.y.toFixed(2) + '%;width:' + wd.toFixed(2) + '%;--dc:' + DUST[pl.age] + '"></div>');
    }
    return '<div class="nwar" data-key="' + esc(pl.key) + '">' +
      '<div class="nw-stage"><img class="nw-plate" alt="" src="' + ART + 'plate-' + pl.age + '.webp">' +
      '<div class="nw-figs">' + figs + '</div><div class="nw-dusts">' + dust.join('') + '</div>' + tags +
      '<div class="nw-title"><b>' + esc(wname) + '</b> at strength <b>' + pl.war.str + '</b></div>' +
      '<div class="nw-foe"><span class="nw-s">' + pl.war.str + '</span> the War</div></div></div>';
  }

  /* ---------------- the motion ---------------- */
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  function anim(el, kf, o, t0) {
    if (!el || !el.animate) return;
    el.animate(kf, Object.assign({ fill: 'both' }, o, { delay: (o.delay || 0) - t0 }));
  }
  const pos = k => 'translateX(' + (-k * 100 / NF) + '%)';
  function frames(strip, list, t0) {
    /* a sequence of [frame, at ms] held until the next */
    if (!strip || !strip.animate) return;
    const end = list[list.length - 1][1] + 10;
    const kf = list.map(([f, at]) => ({ transform: pos(f), offset: Math.min(1, at / end), easing: 'steps(1, end)' }));
    kf.push({ transform: pos(list[list.length - 1][0]), offset: 1 });
    strip.animate(kf, { duration: end, delay: -t0, fill: 'both' });
  }

  function run(el, elapsed) {
    const S = T.scale;
    const tTitle = T.title * S, tMarch = T.march * S, tClash = T.clash * S, tDust = T.dust * S, tReveal = T.reveal * S;
    const atClash = tTitle + tMarch, atDust = atClash + tClash, atClear = atDust + tDust, atEnd = atClear + tReveal;
    const key = el.getAttribute('data-key');
    const lost = {};
    el.querySelectorAll('.nw-tag').forEach(t => { lost[t.getAttribute('data-id')] = t.querySelector('.nw-res.lost') != null; });
    const figs = el.querySelectorAll('.nw-fig');
    figs.forEach(f => {
      const foe = f.classList.contains('foe');
      const cls = Array.from(f.classList).find(c => /^nw[rf]-/.test(c)) || '';
      const id = Object.keys(lost).find(x => cls === (foe ? 'nwf-' : 'nwr-') + x.replace(/\W/g, ''));
      const won = foe ? lost[id] : !lost[id];
      const k = +((Array.from(f.classList).find(c => /^nw-k\d/.test(c)) || 'nw-k0').slice(4));
      /* march in from off the stage: 40% of its width per beat of the walk */
      const from = foe ? 1 : -1;
      anim(f, [{ transform: 'translateX(' + (from * (260 + k * 40)) + '%)' }, { transform: 'translateX(0)' }],
        { duration: tMarch, delay: tTitle, easing: 'cubic-bezier(.3,.1,.4,1)' }, elapsed);
      const walk = [];
      for (let t = 0, i = 0; t < tMarch; t += 150 * S, i++) walk.push([1 + (i + k) % 4, tTitle + t]);
      frames(f.querySelector('.nw-strip'), [[0, 0]].concat(walk, [[5, atClash], [0, atClash + tClash * 0.6], [won ? 6 : 7, atClear + 80 * (k + 1)]]), elapsed);
    });
    /* the dust: it rolls in at the clash and hides everything, then thins */
    el.querySelectorAll('.nw-dust').forEach((d, i) => {
      anim(d, [{ opacity: 0, transform: 'translate(-50%,-70%) scale(.3)' }, { opacity: 0.96, transform: 'translate(-50%,-70%) scale(1)', offset: 0.18 },
        { opacity: 0.92, transform: 'translate(-50%,-70%) scale(1.15)', offset: 0.78 }, { opacity: 0, transform: 'translate(-50%,-70%) scale(1.35)' }],
        { duration: tClash + tDust + tReveal * 0.8, delay: atClash - 120 * S + i * 25 * S, easing: 'ease-out' }, elapsed);
    });
    /* each victor's standard rises out of the settling dust */
    el.querySelectorAll('.nw-banner').forEach(b => {
      const id = Object.keys(lost).find(x => b.classList.contains('nw-b' + x.replace(/\W/g, '')));
      if (lost[id]) { anim(b, [{ opacity: 0 }, { opacity: 0 }], { duration: 10 }, elapsed); return; }
      anim(b, [{ opacity: 0, transform: 'translateY(12%)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: tReveal, delay: atClear + 150 * S }, elapsed);
    });
    /* names and strengths up front; the verdicts when the dust clears */
    el.querySelectorAll('.nw-tag').forEach((t, i) => anim(t, [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 400 * S, delay: 120 * S * i }, elapsed));
    el.querySelectorAll('.nw-res').forEach(r => anim(r, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: T.chips * S, delay: atClear + tReveal * 0.5, easing: 'cubic-bezier(.2,1.6,.4,1)' }, elapsed));
    anim(el.querySelector('.nw-title'), [{ opacity: 0, transform: 'translate(-50%,-30%)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 500 * S }, elapsed);
    anim(el.querySelector('.nw-foe'), [{ opacity: 0 }, { opacity: 1 }], { duration: 400 * S, delay: tTitle }, elapsed);
    /* the words under the stage name the defeated: they wait for the dust too */
    const after = el.parentNode && el.parentNode.querySelector('.nw-after');
    anim(after, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 * S, delay: atEnd }, elapsed);
    return atEnd + T.chips * S;
  }

  /* Start, or pick up where it was, every stage under root. */
  function wake(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    rootEl.querySelectorAll('.nwar').forEach(el => {
      if (el.__nw) return;
      el.__nw = true;
      const key = el.getAttribute('data-key');
      if (started[key] == null) started[key] = now();
      const plate = el.querySelector('.nw-plate');
      /* never load-bearing: no plate, no stage (the words below say it all) */
      if (plate) plate.addEventListener('error', () => el.classList.add('nw-noart'));
      run(el, now() - started[key]);
    });
  }
  /* How long the whole scene runs, for whoever paces the page. */
  const duration = () => (T.title + T.march + T.clash + T.dust + T.reveal + T.chips) * T.scale;

  const CSS = `
.nwar{position:relative;width:100%;margin:.6em 0 .4em}
.nwar.nw-noart{display:none}
.nw-stage{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:10px;background:linear-gradient(#cdbf9c,#8e8064);isolation:isolate;container-type:inline-size}
.nw-plate{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.nw-figs{position:absolute;inset:0;z-index:1}
.nw-fig,.nw-banner{position:absolute;aspect-ratio:1;transform-origin:42% 86%;translate:-42% -86%}
.nw-fig.foe{translate:-58% -86%}
.nw-fig.foe .nw-cell{transform:scaleX(-1)}
.nw-fig::before{content:"";position:absolute;left:24%;width:36%;top:83%;height:6%;border-radius:50%;background:radial-gradient(rgba(30,22,10,.42),rgba(30,22,10,0) 70%);z-index:-1}
.nw-fig.foe::before{left:40%}
.nw-cell{position:absolute;inset:0;overflow:hidden}
.nw-strip{position:absolute;left:0;top:0;width:800%;height:100%;background-size:100% 100%;background-repeat:no-repeat;isolation:isolate}
.nw-strip.one{width:100%}
.nw-tint{position:absolute;inset:0;mix-blend-mode:multiply;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
.nw-dusts{position:absolute;inset:0;z-index:2;pointer-events:none}
.nw-dust{position:absolute;aspect-ratio:1.5;opacity:0;transform:translate(-50%,-70%);border-radius:50%;
  background:radial-gradient(closest-side,var(--dc) 0%,var(--dc) 45%,color-mix(in srgb,var(--dc) 60%,transparent) 70%,transparent 100%);filter:blur(.8cqw)}
.nw-tag{position:absolute;z-index:3;transform:translateY(-50%);display:flex;align-items:center;gap:.6cqw;background:rgba(20,16,10,.72);color:#f3ecdc;
  border-radius:.8cqw;padding:.35cqw .8cqw;font:700 1.55cqw/1.1 system-ui,sans-serif;white-space:nowrap}
.nw-tag i{width:1.1cqw;height:1.1cqw;border-radius:50%;flex:none}
.nw-tag .nw-s{background:#e8b94a;color:#1a140a;border-radius:.5cqw;padding:0 .5cqw;font-weight:900}
.nw-res{border-radius:.5cqw;padding:0 .5cqw;opacity:0}
.nw-res.held{background:#3f8a52;color:#fff}
.nw-res.lost{background:#a83a33;color:#fff}
.nw-res .wg{color:#fff}
.nw-title{position:absolute;z-index:3;left:50%;top:2.5%;transform:translateX(-50%);background:rgba(20,16,10,.75);color:#f3ecdc;border-radius:1cqw;
  padding:.5cqw 1.4cqw;font:600 2.1cqw/1.2 "Palatino Linotype",Palatino,Georgia,serif;white-space:nowrap}
.nw-title b{color:#e8b94a}
.nw-foe{position:absolute;z-index:3;right:2%;top:50%;transform:translateY(-50%);background:rgba(20,16,10,.72);color:#f3ecdc;border-radius:.8cqw;
  padding:.35cqw .8cqw;font:700 1.55cqw/1.1 system-ui,sans-serif}
.nw-foe .nw-s{background:#e8b94a;color:#1a140a;border-radius:.5cqw;padding:0 .5cqw;font-weight:900}
`;
  function install(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.getElementById('nationsWarCss')) return;
    doc.head.insertAdjacentHTML('beforeend', '<style id="nationsWarCss">' + CSS + '</style>');
  }

  const War = { VERSION, html, wake, install, plan, project, duration, T, K };
  if (typeof module !== 'undefined' && module.exports) module.exports = War;
  else { root.NationsWar = War; install(); }
})(typeof window !== 'undefined' ? window : globalThis);
