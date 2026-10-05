/* Blood Rage — drawing. The board as SVG (the telly draws it large, the phone
 * draws it small and taps it), figure tokens and card faces. Everything is
 * drawn from a publicView; nothing here can see a hand.
 */
(function (root) {
  'use strict';
  const D = root.BRData;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- geometry ---------------- */
  const C = 500, R_IN = 190, R_OUT = 445;
  const rad = d => d * Math.PI / 180;
  const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
  const sectorAngle = k => -90 + 45 * k;
  function sectorPath(k) {
    const a0 = sectorAngle(k) - 22.5 + 0.9, a1 = sectorAngle(k) + 22.5 - 0.9;
    const [x0, y0] = pt(R_IN + 6, a0), [x1, y1] = pt(R_OUT, a0), [x2, y2] = pt(R_OUT, a1), [x3, y3] = pt(R_IN + 6, a1);
    return 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) +
      ' A' + R_OUT + ',' + R_OUT + ' 0 0 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
      ' L' + x3.toFixed(1) + ',' + y3.toFixed(1) +
      ' A' + (R_IN + 6) + ',' + (R_IN + 6) + ' 0 0 0 ' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' Z';
  }
  /* Village slots in a sector: an inner arc of up to three, an outer arc for
     the fourth and fifth. */
  function villageSpots(k, n) {
    const a = sectorAngle(k);
    const inner = Math.min(3, n), outer = n - inner;
    const spots = [];
    const spread = (m, r, w) => { for (let i = 0; i < m; i++) spots.push(pt(r, a + (m === 1 ? 0 : -w / 2 + w * i / (m - 1)))); };
    spread(inner, 356, 22);
    spread(outer, 419, 13);
    return spots;
  }
  const FJORD_POS = { fn: -67.5, fe: 22.5, fs: 112.5, fw: 202.5 };
  function fjordCentre(id) { return pt(468, FJORD_POS[id]); }
  function labelPos(k) { return pt(262, sectorAngle(k)); }

  /* each region's middle, in degrees round the ring (the realms' sectors averaged) */
  const REGION_ARCS = Object.keys(D.REALMS).map(id => {
    const ks = D.RING.map((p, k) => [p, k]).filter(([p]) => D.prov(p).realm === id).map(([, k]) => k);
    /* the ring wraps (Myrkulor is sector 7, beside Elvagar at 0): average on the circle */
    const x = ks.reduce((a, k) => a + Math.cos(rad(sectorAngle(k))), 0), y = ks.reduce((a, k) => a + Math.sin(rad(sectorAngle(k))), 0);
    return { id, mid: Math.atan2(y, x) * 180 / Math.PI };
  });
  /* Where a god stands in each province: [radius, degrees off the sector's middle], found by testing
     every spot against the province's name and its token/RAGNAROK line (no overlap at 1920x1080). */
  const GOD_SPOT = { elvagar: [265, 17], anger: [290, -17], musp: [234, -17], horgr: [234, 17],
    utgard: [265, 17], andlang: [234, 17], gimle: [234, 17], myrk: [290, 17] };
  const TOKEN_TXT = { rage: 'RAGE', axes: 'AXES', horns: 'HORNS', glory: '+5', all: 'ALL' };

  /* ---------------- figures ---------------- */
  /* The baked miniatures (bakery/bakery.py). BR_FIGS comes from art/figs/manifest.js: each sprite's
     size and where the figure's FEET are in it, all at one pixels-per-metre, so a giant really is
     bigger than a warrior. Bump ART_VER after a re-bake — the filenames never change, and without it
     a browser shows the old art and the bake looks like it did nothing. */
  const ART_VER = 4;
  const UPM = 30;             // board units per metre at scale 1: a 1.8 m warrior is ~54 units
  const MAX_H = 118;          // ...but a giant with a raised sword would cover three provinces
  const figs = () => root.BR_FIGS && root.BR_FIGS.figs ? root.BR_FIGS : null;
  function figKey(f, clan) {
    return f.kind === 'monster' ? f.key : (clan || 'wolf') + '_' + f.kind;
  }
  function spriteOf(key) {
    const F = figs();
    return F && F.figs[key] ? F.figs[key] : null;
  }
  function spriteUrl(key) { return 'art/figs/' + key + '.webp?v=' + ART_VER; }
  /* An <img> of a figure for panels and cards, `h` px tall; '' when there is no art. */
  function figImg(key, h, cls) {
    const m = spriteOf(key);
    if (!m) return '';
    return '<img class="' + (cls || 'figimg') + '" src="' + spriteUrl(key) + '" alt="" style="height:' + h + 'px;width:' +
      Math.round(m.w * h / m.h) + 'px">';
  }

  function figSprite(f, x, y, hex, scale, clan) {
    const key = figKey(f, clan);
    const m = spriteOf(key);
    if (!m) return null;
    const F = figs();
    let k = UPM * scale / F.pxPerM;               // board units per sprite pixel
    if (m.h * k > MAX_H * scale) k = MAX_H * scale / m.h;
    const shipLike = f.kind === 'ship' || (f.kind === 'monster' && D.CARDS[f.key].fx === 'isShip');
    const big = f.kind === 'monster';
    /* Leaders and Warriors are baked standing on their own round base, in the clan's plastic
       (heroes.py): under those, only a shadow — a painted disc as well would be two bases. The
       monsters are neutral, so their clan-coloured disc is what says whose they are. */
    if (m.base) {
      const br = m.base * F.pxPerM * k;
      return '<g class="fig" data-fig="' + esc(f.id) + '">' +
        '<ellipse cx="' + (x + br * 0.12).toFixed(1) + '" cy="' + (y + br * 0.1).toFixed(1) + '" rx="' + (br * 1.08).toFixed(1) + '" ry="' + (br * 0.5).toFixed(1) +
        '" fill="#000" fill-opacity=".38"/>' +
        '<image href="' + spriteUrl(key) + '" x="' + (x - m.ax * k).toFixed(1) + '" y="' + (y - m.ay * k).toFixed(1) + '" width="' + (m.w * k).toFixed(1) +
        '" height="' + (m.h * k).toFixed(1) + '" preserveAspectRatio="none"/></g>';
    }
    const rx = (shipLike ? 26 : big ? 17 : 12) * scale, ry = rx * 0.42;
    return '<g class="fig" data-fig="' + esc(f.id) + '">' +
      '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + ry.toFixed(1) + '" fill="' + hex +
      '" stroke="#0b0d12" stroke-width="' + (2 * scale).toFixed(1) + '" fill-opacity="' + (shipLike ? 0.55 : 0.95) + '"/>' +
      '<image href="' + spriteUrl(key) + '" x="' + (x - m.ax * k).toFixed(1) + '" y="' + (y - m.ay * k).toFixed(1) + '" width="' + (m.w * k).toFixed(1) +
      '" height="' + (m.h * k).toFixed(1) + '" preserveAspectRatio="none"/></g>';
  }

  function figToken(f, x, y, hex, scale, clan) {
    const sprite = figSprite(f, x, y, hex, scale || 1, clan);
    if (sprite) return sprite;
    const s = scale || 1;
    const stroke = '#0b0d12';
    if (f.kind === 'ship' || (f.kind === 'monster' && D.CARDS[f.key].fx === 'isShip')) {
      const w = 34 * s, h = 16 * s;
      const mon = f.kind === 'monster';
      return '<g class="fig" data-fig="' + esc(f.id) + '"><path d="M' + (x - w / 2) + ',' + (y - h / 3) + ' L' + (x + w / 2) + ',' + (y - h / 3) +
        ' L' + (x + w / 3) + ',' + (y + h / 2) + ' L' + (x - w / 3) + ',' + (y + h / 2) + ' Z" fill="' + hex + '" stroke="' + (mon ? '#e8c267' : stroke) + '" stroke-width="' + (mon ? 3 : 2) + '"/>' +
        '<path d="M' + x + ',' + (y - h / 3) + ' L' + x + ',' + (y - h * 1.5) + ' L' + (x + w / 3) + ',' + (y - h * 0.5) + ' Z" fill="#efe6d2" stroke="' + stroke + '" stroke-width="1.5"/>' +
        (mon ? '<text x="' + x + '" y="' + (y + h * 0.35) + '" font-size="' + 11 * s + '" text-anchor="middle" fill="#0b0d12" font-weight="800">SS</text>' : '') + '</g>';
    }
    if (f.kind === 'monster') {
      const r = 21 * s;
      const ab = D.CARDS[f.key].name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      return '<g class="fig" data-fig="' + esc(f.id) + '"><path d="M' + x + ',' + (y - r) + ' L' + (x + r) + ',' + y + ' L' + x + ',' + (y + r) + ' L' + (x - r) + ',' + y + ' Z" fill="' + hex +
        '" stroke="#e8c267" stroke-width="3"/><text x="' + x + '" y="' + (y + 5 * s) + '" font-size="' + 14 * s + '" text-anchor="middle" fill="#0b0d12" font-weight="900">' + ab + '</text></g>';
    }
    if (f.kind === 'leader') {
      const r = 18 * s;
      return '<g class="fig" data-fig="' + esc(f.id) + '"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + hex + '" stroke="#e8c267" stroke-width="3.5"/>' +
        '<text x="' + x + '" y="' + (y + 6 * s) + '" font-size="' + 17 * s + '" text-anchor="middle" fill="#0b0d12" font-weight="900">L</text></g>';
    }
    if (f.kind === 'mystic') {
      const r = 16 * s;
      return '<g class="fig" data-fig="' + esc(f.id) + '"><path d="M' + x + ',' + (y - r) + ' L' + (x + r * 0.87) + ',' + (y + r * 0.5) + ' L' + (x - r * 0.87) + ',' + (y + r * 0.5) + ' Z" fill="' + hex +
        '" stroke="#9bb6ff" stroke-width="3"/><text x="' + x + '" y="' + (y + 5 * s) + '" font-size="' + 12 * s + '" text-anchor="middle" fill="#0b0d12" font-weight="900">M</text></g>';
    }
    const r = 14 * s;
    return '<g class="fig" data-fig="' + esc(f.id) + '"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + hex + '" stroke="' + stroke + '" stroke-width="2"/></g>';
  }

  /* A god of Asgard standing in a province (never in a village): its statue if baked, a token if not.
     Statues are bigger than any clan's figure, as the box's are. */
  function godToken(id, x, y, scale) {
    const dd = D.DEITIES[id], key = 'god_' + id, m = spriteOf(key);
    let out = '<g class="god" data-god="' + id + '"><ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + (26 * scale).toFixed(1) + '" ry="' + (10 * scale).toFixed(1) +
      '" fill="' + dd.hex + '" fill-opacity=".35" stroke="' + dd.hex + '" stroke-width="3"/>';
    if (m) {
      const F = figs();
      let k = UPM * scale / F.pxPerM;
      if (m.h * k > 150 * scale) k = 150 * scale / m.h;
      out += '<image href="' + spriteUrl(key) + '" x="' + (x - m.ax * k).toFixed(1) + '" y="' + (y - m.ay * k).toFixed(1) + '" width="' + (m.w * k).toFixed(1) +
        '" height="' + (m.h * k).toFixed(1) + '" preserveAspectRatio="none"/>';
    } else {
      out += '<circle cx="' + x.toFixed(1) + '" cy="' + (y - 20 * scale).toFixed(1) + '" r="' + (19 * scale).toFixed(1) + '" fill="#e8c267" stroke="' + dd.hex + '" stroke-width="4"/>' +
        '<text x="' + x.toFixed(1) + '" y="' + (y - 13 * scale).toFixed(1) + '" font-size="' + (20 * scale).toFixed(0) + '" text-anchor="middle" fill="#0b0d12" font-weight="900">' + dd.name[0] + '</text>';
    }
    return out + '</g>';
  }

  /* ---------------- the board ---------------- */
  /* The map is baked (bakery/board.py) in these very units: one Blender unit
     to one board unit, an ortho camera straight down over the rectangle in
     BR_BOARD. So the plate is one <image> under everything, and the provinces,
     villages and fjords drawn here are light overlays on the ground the plate
     already has — a realm-coloured outline, a ring round each village, the
     tap targets. Without the plate (art/board missing) the board is drawn
     flat, as it always was. Bump BOARD_VER after a re-bake. */
  const BOARD_VER = 1;
  const plate = () => root.BR_BOARD || null;

  /* opts: pick — locations that are tappable right now; sel — the one chosen;
     battle — the province being fought over; small — a phone: the small plate. */
  function board(pub, opts) {
    opts = opts || {};
    const pick = new Set(opts.pick || []);
    const hexOf = {}, clanOf = {};
    for (const p of pub.players) { hexOf[p.id] = p.clanHex; clanOf[p.id] = p.clan; }
    /* Figures go on ONE top layer, drawn back to front: a miniature is taller than its village, and
       drawn inside its own province it would be covered by the next province painted after it. Each
       keeps its province's data-loc so a tap on a figure still picks the province under it. */
    const layer = [];
    const place = (f, x, y, scale, loc) => layer.push({ f, x, y, scale, loc });
    const provs = {};
    for (const p of pub.provs) provs[p.id] = p;
    const battle = pub.battle ? pub.battle.prov : null;
    /* Headroom above the ring: a troll's club in the top province stands higher than the board. */
    let s = '<svg class="brmap" viewBox="0 -60 1000 1060" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="brsea" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#1c2a38"/><stop offset="1" stop-color="#0c141d"/></radialGradient>' +
      '<pattern id="brhatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#2a1414"/><line x1="0" y1="0" x2="0" y2="14" stroke="#5a1f1f" stroke-width="5"/></pattern></defs>' +
      '<rect x="-400" y="-60" width="1800" height="1060" fill="url(#brsea)"/>';
    const PL = plate();
    if (PL) s += '<image class="plate" href="art/board/' + (opts.small ? PL.small : PL.file) + '?v=' + BOARD_VER + '" x="' + PL.x0 + '" y="' + PL.y0 +
      '" width="' + PL.w + '" height="' + PL.h + '" preserveAspectRatio="none" pointer-events="none"/>';
    /* Names go on a layer ABOVE the figures: in the lower provinces a giant stands between its
       village and the name, and a name you cannot read is a province you cannot find. */
    let names = '';

    /* fjords under the land, so the land's edge sits over them */
    for (const f of D.FJORDS) {
      const [x, y] = fjordCentre(f.id);
      const open = f.supports.some(p => provs[p] && !provs[p].destroyed);
      const cls = 'loc fjord' + (pick.has(f.id) ? ' pick' : '') + (opts.sel === f.id ? ' sel' : '') + (battle && f.supports.indexOf(battle) >= 0 ? ' war' : '');
      s += '<g class="' + cls + '" data-loc="' + f.id + '"><ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="58" ry="40" transform="rotate(' + (FJORD_POS[f.id] + 90) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="' + (open ? '#2c5f86' : '#1b2630') + '"' +
        (PL ? ' fill-opacity="' + (open ? 0.22 : 0.6) + '" stroke-opacity=".75"' : '') + ' stroke="#8fc3e8" stroke-width="3" stroke-dasharray="' + (open ? '0' : '8 6') + '"/></g>';
    }
    D.RING.forEach((id, k) => {
      const P = provs[id], def = D.prov(id);
      const realm = D.REALMS[def.realm];
      const cls = 'loc prov' + (pick.has(id) ? ' pick' : '') + (opts.sel === id ? ' sel' : '') + (battle === id ? ' war' : '') + (P.destroyed ? ' gone' : '');
      /* on the plate: the land shows through, the realm is an outline, Ragnarök a scorched veil */
      const fo = P.destroyed ? (PL ? 0.8 : 1) : (PL ? 0.06 : 0.42);
      s += '<g class="' + cls + '" data-loc="' + id + '"><path d="' + sectorPath(k) + '" fill="' + (P.destroyed ? 'url(#brhatch)' : realm.hex) + '" fill-opacity="' + fo + '" stroke="' + (P.destroyed ? '#5a1f1f' : realm.hex) + '" stroke-width="4"' +
        (PL && !P.destroyed ? ' stroke-opacity=".7"' : '') + '/>';
      const spots = villageSpots(k, def.villages);
      if (!P.destroyed) for (const [x, y] of spots) s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="24" fill="#0b0d12" fill-opacity="' + (PL ? 0.12 : 0.35) +
        '" stroke="#efe6d2" stroke-opacity="' + (PL ? 0.6 : 0.35) + '" stroke-width="' + (PL ? 2.5 : 2) + '"/>';
      const [lx, ly] = labelPos(k);
      /* a long name on the left or right of the ring runs radially, into
         Yggdrasil one way and the villages the other — so cap its width */
      const fit = def.name.length > 8 ? ' textLength="132" lengthAdjust="spacingAndGlyphs"' : '';
      names += '<text x="' + lx.toFixed(1) + '" y="' + (ly - 8).toFixed(1) + '" class="pname" text-anchor="middle"' + fit + '>' + esc(def.name) + '</text>';
      /* say WHEN it went: a province lost at setup (fewer than five clans, p.10) looks like a bug otherwise */
      if (P.destroyed) {
        const pre = (pub.preDestroyed || []).indexOf(id) >= 0;
        const k2 = (pub.ragnarok || []).indexOf(id);
        const when = pre ? 'LOST AT SETUP' : 'RAGNARÖK' + (k2 >= 0 && k2 + 1 < pub.age + (pub.phase === 'ragnarok' || pub.phase === 'release' ? 1 : 0) ? ' · AGE ' + (k2 + 1) : '');
        names += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 22).toFixed(1) + '" class="ptok gone" text-anchor="middle"' +
          (when.length > 9 ? ' textLength="150" lengthAdjust="spacingAndGlyphs"' : '') + '>' + when + '</text>';
      }
      else names += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 22).toFixed(1) + '" class="ptok' + (P.pillaged ? ' done' : '') + '" text-anchor="middle">' +
        (P.pillaged ? 'pillaged' : TOKEN_TXT[P.token]) + '</text>';
      if (pub.doom === id && !P.destroyed) {
        const [dx, dy] = pt(425, sectorAngle(k) + 17);
        s += '<g class="doom"><circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="22" fill="#b3261e" stroke="#ffb4a9" stroke-width="3"/><text x="' + dx.toFixed(1) + '" y="' + (dy + 6).toFixed(1) + '" text-anchor="middle" font-size="17" font-weight="900" fill="#fff">☠</text></g>';
      }
      /* figures in the villages */
      const here = pub.figs.filter(f => f.at === id);
      here.forEach((f, i) => {
        const [x, y] = spots[i] || pt(356, sectorAngle(k));
        place(f, x, y, 1, id);
      });
      s += '</g>';
    });
    /* The three regions, named round the edge in their own colour as the printed board does — the
       Quests are named for them (p.20), and a province alone does not say which region it is in. */
    for (const r of REGION_ARCS) {
      const low = Math.sin(rad(r.mid)) > 0.2;          // along the bottom the words run the other way, or they are upside down
      const rr = low ? 486 : 468, a0 = r.mid - 22, a1 = r.mid + 22;
      const [x0, y0] = pt(rr, low ? a1 : a0), [x1, y1] = pt(rr, low ? a0 : a1);
      const pid = 'brrealm_' + r.id;
      s += '<path id="' + pid + '" d="M' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' A' + rr + ',' + rr + ' 0 0 ' + (low ? 0 : 1) + ' ' + x1.toFixed(1) + ',' + y1.toFixed(1) + '" fill="none"/>';
      names += '<text class="realm" fill="' + D.REALMS[r.id].hex + '"><textPath href="#' + pid + '" startOffset="50%" text-anchor="middle">' +
        esc(D.REALMS[r.id].name.toUpperCase()) + '</textPath></text>';
    }
    /* Yggdrasil */
    {
      const P = provs.ygg;
      const cls = 'loc prov ygg' + (pick.has('ygg') ? ' pick' : '') + (opts.sel === 'ygg' ? ' sel' : '') + (battle === 'ygg' ? ' war' : '');
      s += '<g class="' + cls + '" data-loc="ygg"><circle cx="' + C + '" cy="' + C + '" r="' + R_IN + '" fill="#3f6b2a" fill-opacity="' + (PL ? 0.05 : 0.6) + '" stroke="#9ccf6b" stroke-width="4"' +
        (PL ? ' stroke-opacity=".55"' : '') + '/>' +
        '';
      names += '<text x="' + C + '" y="' + (C - 118) + '" class="pname" text-anchor="middle">Yggdrasil</text>' +
        '<text x="' + C + '" y="' + (C - 90) + '" class="ptok' + (P.pillaged ? ' done' : '') + '" text-anchor="middle">' + (P.pillaged ? 'pillaged' : 'ALL') + '</text>';
      const here = pub.figs.filter(f => f.at === 'ygg');
      const cols = Math.max(4, Math.ceil(Math.sqrt(here.length * 1.4)));
      const cell = Math.min(46, 300 / cols);
      here.forEach((f, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = C - (cols - 1) * cell / 2 + c * cell, y = C - 40 + r * cell;
        place(f, x, y, cell / 46, 'ygg');
      });
      s += '</g>';
    }
    /* ships on top of the fjords */
    for (const f of D.FJORDS) {
      const [x, y] = fjordCentre(f.id);
      const here = pub.figs.filter(g => g.at === f.id);
      here.forEach((g, i) => {
        const dx = (i - (here.length - 1) / 2) * 40;
        place(g, x + dx, y + 8, 0.9, f.id);
      });
    }
    /* the gods of Asgard: between the name and the villages of their province, or low in Yggdrasil */
    for (const d of pub.gods || []) {
      if (!d.at) continue;
      const k = D.RING.indexOf(d.at);
      const sp = GOD_SPOT[d.at];
      const [x, y] = k >= 0 ? pt(sp[0], sectorAngle(k) + sp[1]) : [C + 120, C + 120];
      layer.push({ god: d.id, x, y, scale: 1, loc: d.at });
      names += '<text x="' + x.toFixed(1) + '" y="' + (y + 26).toFixed(1) + '" class="godname" fill="' + D.DEITIES[d.id].hex + '" text-anchor="middle">' + esc(D.DEITIES[d.id].name.toUpperCase()) + '</text>';
    }
    layer.sort((a, b) => a.y - b.y);
    s += '<g class="figs">' + layer.map(p => '<g data-loc="' + p.loc + '">' +
      (p.god ? godToken(p.god, p.x, p.y, p.scale) : figToken(p.f, p.x, p.y, hexOf[p.f.owner] || '#888', p.scale, clanOf[p.f.owner])) + '</g>').join('') + '</g>';
    return s + '<g class="names" pointer-events="none">' + names + '</g></svg>';
  }

  /* ---------------- cards ---------------- */
  const KIND_NAME = { battle: 'Battle', quest: 'Quest', monster: 'Monster', leader: 'Leader upgrade', warrior: 'Warrior upgrade', ship: 'Ship upgrade', clan: 'Clan upgrade' };
  /* a god's card, for the telly's panel and the phone */
  function godCard(id, opts) {
    const dd = D.DEITIES[id];
    return '<div class="godcard" style="--g:' + dd.hex + '">' + (spriteOf('god_' + id) ? figImg('god_' + id, (opts && opts.h) || 60) : '') +
      '<div><b>' + esc(dd.name) + '</b> <small>' + esc(dd.title) + '</small><span>' + esc(dd.text) + '</span></div></div>';
  }
  const GOD_CSS = '.godcard{--g:#e8c267;display:flex;gap:10px;align-items:center;border:1px solid var(--g);border-left:6px solid var(--g);border-radius:10px;padding:6px 10px;background:rgba(0,0,0,.25)}' +
    '.godcard b{color:var(--g);font:900 1.1em Georgia,serif}.godcard small{color:#b3a28c}.godcard span{display:block;font-size:.92em;line-height:1.3;color:#e9dcc6}';
  function cardFace(c, opts) {
    opts = opts || {};
    const d = D.CARDS[c.key];
    if (!d) return '';
    const hex = D.KIND_HEX[d.kind];
    const big = d.kind === 'battle' ? D.cardLabel(c) : d.kind === 'quest' ? c.glory + '★' : 'STR ' + d.str;
    return '<div class="bcard ' + d.kind + (opts.cls ? ' ' + opts.cls : '') + '" style="--k:' + hex + ';--g:' + (D.GODS[d.god] || '#999') + '"' +
      (opts.data ? ' ' + opts.data : '') + '>' +
      '<div class="bc-top"><span class="bc-kind">' + KIND_NAME[d.kind] + '</span><span class="bc-val">' + esc(big) + '</span></div>' +
      (d.kind === 'monster' && spriteOf(d.key) ? '<div class="bc-fig">' + figImg(d.key, 74) + '</div>' : '') +
      '<div class="bc-name">' + esc(d.name) + '</div>' +
      (opts.noText ? '' : '<div class="bc-text">' + esc(D.cardText(c)) + '</div>') +
      (opts.cost != null ? '<div class="bc-cost">costs ' + opts.cost + ' Rage</div>' : '') + '</div>';
  }
  const CARD_CSS = '.bcard{--k:#888;--g:#999;position:relative;background:linear-gradient(180deg,#221c18,#171310);border:1px solid #3a302a;' +
    'border-left:6px solid var(--k);border-radius:10px;padding:7px 9px;color:#f1e7d6;text-align:left}' +
    '.bcard .bc-top{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#bda98f}' +
    '.bcard .bc-val{font:900 15px/1 system-ui;color:var(--g);letter-spacing:0}' +
    '.bcard .bc-name{font-weight:800;font-size:15px;margin-top:2px}' +
    '.bcard .bc-text{font-size:12px;color:#cdbda6;line-height:1.3;margin-top:3px}' +
    '.bcard .bc-cost{font-size:11px;color:#e8c267;margin-top:4px;font-weight:700}' +
    '.bcard .bc-fig{float:right;margin:2px 0 2px 8px;line-height:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}' +
    '.bcard::after{content:"";display:block;clear:both}';

  const MAP_CSS = '.brmap{display:block;width:100%;height:100%}' +
    '.brmap .pname{font:800 23px/1 Georgia,serif;fill:#f6ecd8;paint-order:stroke;stroke:#0b0d12;stroke-width:5px;letter-spacing:.02em}' +
    '.brmap .ptok{font:900 17px/1 system-ui;fill:#e8c267;paint-order:stroke;stroke:#0b0d12;stroke-width:4px;letter-spacing:.08em}' +
    '.brmap .ptok.done{fill:#8d8a82;font-weight:600}' +
    '.brmap .ptok.gone{fill:#ff8a80}' +
    '.brmap .godname{font:900 15px/1 system-ui;letter-spacing:.14em;paint-order:stroke;stroke:#0b0d12;stroke-width:4px}' +
    '.brmap .realm{font:900 26px/1 Georgia,serif;letter-spacing:.2em;paint-order:stroke;stroke:#0b0d12;stroke-width:6px}' +
    '.brmap .loc.pick>path,.brmap .loc.pick>circle:first-child,.brmap .loc.pick>ellipse{stroke:#fff;stroke-width:9;cursor:pointer}' +
    '.brmap .loc.sel>path,.brmap .loc.sel>circle:first-child,.brmap .loc.sel>ellipse{stroke:#e8c267;stroke-width:12}' +
    '.brmap .loc.war>path,.brmap .loc.war>circle:first-child,.brmap .loc.war>ellipse{stroke:#ff5147;stroke-width:10}' +
    '.brmap .figs image{filter:drop-shadow(0 3px 2px rgba(0,0,0,.55))}';

  root.BRArt = { esc, board, figToken, figImg, figKey, spriteOf, cardFace, CARD_CSS, MAP_CSS, KIND_NAME, TOKEN_TXT, ART_VER, BOARD_VER, godCard, GOD_CSS, GOD_SPOT };
})(typeof window !== 'undefined' ? window : globalThis);
