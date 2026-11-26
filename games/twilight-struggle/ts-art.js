'use strict';
/* Twilight Struggle — drawing. The board is one SVG in the map's own units
 * (5100 x 3300, the module's map), so every country sits where the printed
 * map has it. Two layers:
 *   drawn    our own boxes, links and labels: always there underneath, and the
 *            whole board when the picture is missing (?noart, or no art/ folder)
 *   picture  the module's map (art/map.webp) and card faces (art/cards/N.svg),
 *            switched on by probe() once the map has loaded: html.tsart
 * Influence chips, highlights and control are always drawn by us, on top: the
 * art is never load-bearing (LESSONS-CHECKLIST E).
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./ts-data.js') : root.TSData;
  const VERSION = 1;
  const C = D.COUNTRY;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const build = () => (root.TS_BUILD || '1');
  const artUrl = p => 'art/' + p + '?v=' + build();

  /* The superpowers' boxes on the drawn board (the printed map paints them). */
  const SUPER = { US: { x: 470, y: 1080, name: 'USA' }, SU: { x: 3050, y: 640, name: 'USSR' } };
  const BW = 236, BH = 150;

  /* The baked scenes (bakery/scenes.py, tools/scene-plates.py): every layer
     of a scene is the same full 1600x900 frame from one camera, so the page
     lays them on top of each other and only ever moves the rocket. The rocket
     stands at x 0.44, its base at y 0.84 (the bakery's CONTRACT checks it). */
  const SCENES = {
    w: 1600, h: 900,
    space: { pad: 'space-pad.webp', rocket: 'space-rocket.webp', flame: 'space-flame.webp', smoke: 'space-smoke.webp', rocketX: 0.44, rocketBase: 0.84 },
    war: { room: 'war-room.webp', phone: 'war-phone.webp' },
    /* the headline desk: the two newspapers' centres, where the cards lie */
    head: { desk: 'head-desk.webp', left: [0.326, 0.555], right: [0.674, 0.555] },
    /* the bunker panel: lamps 5..1 left to right, each lit as its own layer */
    defcon: { panel: 'defcon-panel.webp', lit: { 1: 'defcon-lit1.webp', 2: 'defcon-lit2.webp', 3: 'defcon-lit3.webp', 4: 'defcon-lit4.webp', 5: 'defcon-lit5.webp' }, beacon: 'defcon-beacon.webp' },
    /* behind every scoring card, and the finale's skyline */
    globe: 'globe-study.webp',
    finale: { dawn: 'city-dawn.webp', red: 'city-red.webp' }
  };
  /* Which scene a die is rolled in: the space race at the pad, everything
     with a target or an opponent in the situation room. */
  const SCENE_OF = { space: 'space', coup: 'war', realign: 'war', war: 'war', summit: 'war', olympics: 'war', stuck: 'war' };
  const sceneUrl = f => 'scenes/' + f + '?v=' + build();
  /* html.tsscene once the plates load; never load-bearing: without it the
     drawn dice card stands in. */
  function probeScenes() {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return;
    const im = new Image();
    im.onload = () => { document.documentElement.classList.add('tsscene'); try { root.dispatchEvent(new Event('tsart')); } catch (e) {} };
    im.src = sceneUrl(SCENES.space.pad);
  }
  function probe() {
    probeScenes();
    if (typeof document === 'undefined' || typeof Image === 'undefined') return;
    const im = new Image();
    im.onload = () => { document.documentElement.classList.add('tsart'); try { root.dispatchEvent(new Event('tsart')); } catch (e) {} };
    im.src = artUrl('map.webp');
  }

  function icon(name, px) {
    const s = px || 20;
    const box = (body, vb) => '<svg class="ts-ic" width="' + s + '" height="' + s + '" viewBox="' + (vb || '0 0 24 24') + '" aria-hidden="true">' + body + '</svg>';
    switch (name) {
      case 'defcon': return box('<circle cx="12" cy="12" r="10" fill="#2a1a10" stroke="#f1c75b" stroke-width="1.6"/><path d="M12 12 L7 4 A10 10 0 0 1 17 4Z M12 12 L22 12 A10 10 0 0 1 17 20.6Z M12 12 L7 20.6 A10 10 0 0 1 2 12Z" fill="#f1c75b"/><circle cx="12" cy="12" r="2.2" fill="#2a1a10"/>');
      case 'vp': return box('<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill="#f1c75b"/>');
      case 'space': return box('<path d="M12 2c3 2.5 4.5 6 4.5 10l2.5 3-2.5 1.5h-9L5 15l2.5-3C7.5 8 9 4.5 12 2z" fill="#dfe6f5"/><circle cx="12" cy="9" r="2" fill="#3b7be0"/><path d="M10 18h4l-2 4z" fill="#ff9a3c"/>');
      case 'mil': return box('<circle cx="12" cy="12" r="8" fill="none" stroke="#ff8a8a" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#ff8a8a"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="#ff8a8a" stroke-width="2"/>');
      case 'china': return box('<rect x="3" y="3" width="18" height="18" rx="3" fill="#c8202a"/><path d="M8 6l.9 2.2 2.4.2-1.8 1.5.6 2.3L8 11 6 12.2l.6-2.3L4.8 8.4l2.4-.2z" fill="#ffd400"/>');
      case 'card': return box('<rect x="5" y="3" width="14" height="18" rx="2" fill="#e9e1cc" stroke="#7c6a45"/>');
      case 'star': return box('<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill="currentColor"/>');
    }
    return '';
  }

  /* ---------------- the board ---------------- */
  /* opts: hi {country: class} lights a box (a coup, a scored region's
     countries, the house's newest move); pick {country: true} marks boxes a
     phone may choose. */
  function board(pub, opts) {
    opts = opts || {};
    const hi = opts.hi || {}, inf = pub ? pub.inf : null;
    let s = '<svg class="ts-board" viewBox="0 0 5100 3300" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect class="ts-sea" x="0" y="0" width="5100" height="3300"/>';
    s += '<image class="ts-map" href="' + esc(artUrl('map.webp')) + '" x="0" y="0" width="5100" height="3300" preserveAspectRatio="none"/>';
    /* the drawn layer */
    s += '<g class="ts-drawn">';
    const done = {};
    for (const c of D.COUNTRIES) {
      const a = C[c];
      for (const b of a.adj) {
        const k = c < b ? c + '|' + b : b + '|' + c;
        if (done[k]) continue;
        done[k] = 1;
        const B = C[b];
        const cross = a.reg !== B.reg;
        s += '<line class="ts-link' + (cross ? ' x' : '') + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + B.x + '" y2="' + B.y + '"/>';
      }
      if (a.sup) { const P = SUPER[a.sup]; s += '<line class="ts-link sp" x1="' + a.x + '" y1="' + a.y + '" x2="' + P.x + '" y2="' + P.y + '"/>'; }
    }
    for (const sp of ['US', 'SU']) {
      const P = SUPER[sp];
      s += '<g class="ts-super ' + sp + '"><rect x="' + (P.x - 230) + '" y="' + (P.y - 90) + '" width="460" height="180" rx="30"/><text x="' + P.x + '" y="' + (P.y + 40) + '">' + P.name + '</text></g>';
    }
    const RL = { EU: [2350, 210], AS: [4300, 980], ME: [2860, 1880], AF: [2230, 2860], CA: [640, 2080], SA: [700, 3130] };
    for (const r of D.REGIONS) s += '<text class="ts-rlab" x="' + RL[r][0] + '" y="' + RL[r][1] + '" fill="' + D.REGION[r].hex + '">' + esc(D.REGION[r].name.toUpperCase()) + '</text>';
    for (const c of D.COUNTRIES) {
      const a = C[c];
      const x0 = a.x - BW / 2, y0 = a.y - BH / 2;
      s += '<g class="ts-box ' + a.reg + (a.bg ? ' bg' : '') + '">' +
        '<rect class="ts-bx" x="' + x0 + '" y="' + y0 + '" width="' + BW + '" height="' + BH + '" rx="14" style="--rc:' + D.REGION[a.reg].hex + '"/>' +
        '<rect class="ts-bn" x="' + x0 + '" y="' + y0 + '" width="' + BW + '" height="48" rx="14"/>' +
        '<text class="ts-nm" x="' + (x0 + 12) + '" y="' + (y0 + 38) + '"' + (a.name.length > 12 ? ' textLength="' + (BW - 66) + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + esc(a.name) + '</text>' +
        '<text class="ts-stab" x="' + (x0 + BW - 14) + '" y="' + (y0 + 39) + '">' + a.stab + '</text></g>';
    }
    s += '</g>';
    /* our marks, over either layer */
    if (inf) {
      for (const c of D.COUNTRIES) {
        const a = C[c];
        const ct = D.ctrl(inf, c);
        const h = hi[c];
        if (h) s += '<rect class="ts-hi ' + esc(h) + '" x="' + (a.x - BW / 2 - 16) + '" y="' + (a.y - BH / 2 - 16) + '" width="' + (BW + 32) + '" height="' + (BH + 32) + '" rx="24"/>';
        if (opts.pick && opts.pick[c]) s += '<rect class="ts-pk" x="' + (a.x - BW / 2 - 8) + '" y="' + (a.y - BH / 2 - 8) + '" width="' + (BW + 16) + '" height="' + (BH + 16) + '" rx="20"/>';
        for (const side of ['US', 'SU']) {
          const n = inf[c][side];
          if (!n) continue;
          const cx = side === 'US' ? a.x - 58 : a.x + 58, cy = a.y + 24;
          const own = ct === side;
          s += '<g class="ts-chip ' + side + (own ? ' ctl' : '') + '"><rect x="' + (cx - 54) + '" y="' + (cy - 46) + '" width="108" height="92" rx="16"/><text x="' + cx + '" y="' + (cy + 30) + '">' + n + '</text></g>';
        }
      }
    }
    s += '</svg>';
    return s;
  }

  /* ---------------- cards ---------------- */
  const sideClass = s => (s === 'US' ? 'us' : s === 'SU' ? 'su' : 'n');
  function opsBadge(id) {
    const c = D.CARD[id];
    if (c.score) return '<span class="ts-ops sc" title="Scoring card">S</span>';
    return '<span class="ts-ops ' + sideClass(c.side) + '">' + (id === D.CHINA ? 4 : c.ops) + '</span>';
  }
  /* A whole face: the drawn card, with the module's picture over it when the
     art layer is on (a picture that fails to load removes itself). */
  function face(id, o) {
    o = o || {};
    const c = D.CARD[id];
    if (!c) return '';
    const who = c.side === 'N' ? 'Both sides' : D.SIDE[c.side].name + ' event';
    return '<div class="ts-card ' + sideClass(c.side) + (c.score ? ' score' : '') + (o.cls ? ' ' + o.cls : '') + '" data-card="' + id + '">' +
      '<div class="ts-c-top">' + opsBadge(id) + '<span class="ts-c-era">' + esc(D.ERA[c.era]) + '</span><span class="ts-c-no">' + id + '</span></div>' +
      '<div class="ts-c-name">' + esc(c.name) + (c.star ? '<i class="ts-star">*</i>' : '') + '</div>' +
      '<div class="ts-c-tx">' + esc(c.text) + '</div>' +
      '<div class="ts-c-foot">' + esc(c.score ? 'Scoring card' : who) + (c.star ? ' · removed after' : '') + '</div>' +
      '<img class="ts-c-art" alt="" src="' + esc(artUrl('cards/' + id + '.svg')) + '" onerror="this.remove()">' +
      '</div>';
  }
  /* One line: Ops badge, the name, the side. */
  function spine(id, o) {
    o = o || {};
    const c = D.CARD[id];
    if (!c) return '';
    return '<span class="ts-sp ' + sideClass(c.side) + '">' + opsBadge(id) + '<b>' + esc(o.short ? D.shortName(id) : c.name) + '</b>' +
      (c.star ? '<i class="ts-star">*</i>' : '') + '<em>' + esc(c.score ? 'scoring' : c.side === 'N' ? 'both' : D.SIDE[c.side].name) + '</em></span>';
  }
  /* An influence chip in text (the phone's lists). */
  function chip(side, n, own) {
    if (!n) return '';
    return '<span class="ts-ch ' + (side === 'US' ? 'us' : 'su') + (own ? ' ctl' : '') + '">' + n + '</span>';
  }
  function die(n, side, cls) {
    const pips = { 1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]], 5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]] }[n] || [];
    return '<svg class="ts-die ' + (side === 'US' ? 'us' : 'su') + ' ' + (cls || '') + '" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="4"/>' + pips.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.2"/>').join('') + '</svg>';
  }

  function styles() {
    return '<style>' + `
.ts-board{width:100%;height:100%;display:block}
.ts-sea{fill:#0d1729}
html:not(.tsart) .ts-map{display:none}
html.tsart .ts-drawn{display:none}
.ts-link{stroke:#3a4c75;stroke-width:7}
.ts-link.x{stroke-dasharray:22 16}
.ts-link.sp{stroke:#151515;stroke-width:12}
.ts-super rect{stroke-width:8}
.ts-super.US rect{fill:#18325f;stroke:#5c8fe8}
.ts-super.SU rect{fill:#5b1418;stroke:#e0555c}
.ts-super text{fill:#fff;font:900 120px Georgia,serif;text-anchor:middle;letter-spacing:8px}
.ts-rlab{font:900 92px Georgia,serif;letter-spacing:10px;opacity:.55;text-anchor:middle}
.ts-bx{fill:color-mix(in srgb,var(--rc) 22%,#121a2d);stroke:var(--rc);stroke-width:5}
.ts-bn{fill:var(--rc);opacity:.85}
.ts-box.bg .ts-bn{fill:#8d1d2c;opacity:1}
.ts-nm{fill:#111;font:800 34px system-ui,sans-serif}
.ts-box.bg .ts-nm{fill:#fff}
.ts-stab{fill:#111;font:900 34px system-ui,sans-serif;text-anchor:end}
.ts-box.bg .ts-stab{fill:#ffe1a0}
.ts-chip rect{stroke-width:7}
.ts-chip text{font:900 78px system-ui,sans-serif;text-anchor:middle}
.ts-chip.US rect{fill:#eef4ff;stroke:#3b7be0}.ts-chip.US text{fill:#1d4fa8}
.ts-chip.SU rect{fill:#fff0ef;stroke:#d8323a}.ts-chip.SU text{fill:#a3161d}
.ts-chip.US.ctl rect{fill:#2f68cf;stroke:#cfe0ff}.ts-chip.US.ctl text{fill:#fff}
.ts-chip.SU.ctl rect{fill:#c8222b;stroke:#ffd0d0}.ts-chip.SU.ctl text{fill:#fff}
.ts-hi{fill:none;stroke:#f1c75b;stroke-width:14}
.ts-hi.hot{stroke:#ffd24a;stroke-width:20;filter:drop-shadow(0 0 30px #ffd24a)}
.ts-hi.us{stroke:#7fb0ff}.ts-hi.su{stroke:#ff8f93}
.ts-hi.score{stroke:#f1c75b;stroke-dasharray:30 18}
.ts-pk{fill:none;stroke:#6fcf7f;stroke-width:10;stroke-dasharray:24 14}
.ts-ic{vertical-align:-.18em;flex:none}
.ts-card{position:relative;aspect-ratio:388/538;width:12em;border-radius:.6em;overflow:hidden;display:flex;flex-direction:column;gap:.35em;padding:.55em .6em;
  background:linear-gradient(#f4ecd8,#e3d6b6);color:#221a10;font-family:Georgia,serif;font-size:14px;box-shadow:0 .3em 1em rgba(0,0,0,.5);border:.18em solid #6d5a39}
.ts-card.us{border-color:#3b7be0}.ts-card.su{border-color:#d8323a}
.ts-card.score{background:linear-gradient(#fff6d6,#f0d98e)}
.ts-c-top{display:flex;align-items:center;gap:.4em;font-family:system-ui,sans-serif}
.ts-c-era{font-size:.72em;text-transform:uppercase;letter-spacing:.08em;color:#6d5a39}
.ts-c-no{margin-left:auto;font-size:.72em;color:#6d5a39}
.ts-c-name{font-weight:900;font-size:1.05em;line-height:1.15}
.ts-c-tx{font-size:.78em;line-height:1.3;flex:1;min-height:0;overflow:hidden;font-family:system-ui,sans-serif}
.ts-c-foot{font-size:.7em;color:#6d5a39;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:.05em}
.ts-c-art{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:none;background:#fff}
html.tsart .ts-c-art{display:block}
.ts-ops{display:inline-flex;align-items:center;justify-content:center;width:1.7em;height:1.7em;border-radius:50%;font:900 1em system-ui,sans-serif;flex:none}
.ts-ops.us{background:#fff;color:#1d4fa8;box-shadow:inset 0 0 0 .16em #3b7be0}
.ts-ops.su{background:#c8222b;color:#ffe066}
.ts-ops.n{background:linear-gradient(90deg,#fff 50%,#c8222b 50%);color:#111;text-shadow:0 0 .2em #fff}
.ts-ops.sc{background:#f1c75b;color:#3a2a08;border-radius:.3em}
.ts-star{font-style:normal;color:#b8282e;font-weight:900;margin-left:.1em}
.ts-sp{display:inline-flex;align-items:center;gap:.45em;min-width:0}
.ts-sp b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ts-sp em{font-style:normal;font-size:.75em;opacity:.75;white-space:nowrap}
.ts-sp.us em{color:#9cc2ff}.ts-sp.su em{color:#ff9a9e}
.ts-ch{display:inline-flex;align-items:center;justify-content:center;min-width:1.5em;height:1.45em;padding:0 .25em;border-radius:.3em;font:900 .92em system-ui,sans-serif}
.ts-ch.us{background:#e8f0ff;color:#1d4fa8;box-shadow:inset 0 0 0 .12em #3b7be0}
.ts-ch.su{background:#ffeceb;color:#a3161d;box-shadow:inset 0 0 0 .12em #d8323a}
.ts-ch.us.ctl{background:#2f68cf;color:#fff}.ts-ch.su.ctl{background:#c8222b;color:#fff}
.ts-die{width:1em;height:1em}
.ts-die rect{stroke-width:1.4}
.ts-die.us rect{fill:#f2f6ff;stroke:#3b7be0}.ts-die.us circle{fill:#1d4fa8}
.ts-die.su rect{fill:#c8222b;stroke:#ffb3b3}.ts-die.su circle{fill:#fff}
` + '</style>';
  }

  const Art = { VERSION, esc, probe, probeScenes, icon, board, face, spine, chip, die, styles, artUrl, opsBadge, SUPER, SCENES, SCENE_OF, sceneUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  else root.TSArt = Art;
})(typeof window !== 'undefined' ? window : this);
