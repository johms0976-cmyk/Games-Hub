/* Catan — the pictures.
 *
 * The island is one SVG, drawn from the public view alone, so the telly and a
 * phone draw the same board from the same numbers. The terrain is the baked
 * tile art in art/ (pointy-top hexes, 512px, the hex's corner radius 220.5px);
 * every other thing on the board is vector, in the owner's colour.
 *
 * Layers, bottom to top — named, not indexed, so a new one goes in by name:
 *   sea · beach · tiles · harbours · numbers · roads · buildings · knights ·
 *   robber · merchant · pick
 *
 * The art is never load-bearing: each tile sits on a hex in its terrain
 * colour, so a board with no images is still a playable board.
 *
 * THE BAKED ISLAND (bakery/, art/baked/): the sea plate (frame, water, the
 * sand the tiles sit in, a pier at every harbour), six terrain tiles and every
 * piece, rendered in Blender. A.probe() loads them; until every picture is in
 * (and on a page with no canvas, such as the tests' jsdom) the board is drawn
 * exactly as before — the user's own tiles and vector pieces. Pieces are baked
 * without a colour: each has a grey "paint" picture that is multiplied by the
 * seat's colour on a canvas once per colour and added over the rest of it.
 */
(function (root) {
  'use strict';
  const D = root.CatanData || (typeof require === 'function' ? require('./catan-data.js') : null);
  const Board = root.CatanBoard || (typeof require === 'function' ? require('./catan-board.js') : null);
  const A = {};
  A.VERSION = 1;
  const ART_VER = 1;
  const S = 100;                        // svg units per board unit (a hex's corner radius)
  const SQ3 = Math.sqrt(3);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  A.esc = esc;
  const f = v => Math.round(v * 10) / 10;

  /* ---------------- colour helpers ---------------- */
  function shade(hex, k) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = k < 0 ? 0 : 255, p = Math.abs(k);
    r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  A.shade = shade;
  const light = hex => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170;
  };
  A.light = light;

  /* ---------------- shared defs ---------------- */
  A.defs = function () {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<radialGradient id="ctSea" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#2f84b8"/><stop offset=".62" stop-color="#1f6a9c"/><stop offset="1" stop-color="#143f66"/></radialGradient>' +
      '<linearGradient id="ctFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9b77c"/><stop offset="1" stop-color="#a47a45"/></linearGradient>' +
      '<radialGradient id="ctToken" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e8dcc0"/></radialGradient>' +
      '<pattern id="ctWaves" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M0 20 Q15 10 30 20 T60 20" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3"/></pattern>' +
      '<filter id="ctLift" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity=".45"/></filter>' +
      '<filter id="ctGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs></svg>';
  };

  /* ---------------- icons ----------------
     One glyph per card type, drawn in a 24x24 box, readable at 14px. */
  const GLYPH = {
    wood: '<path d="M12 2 5 12h4l-4 6h6v4h2v-4h6l-4-6h4z" fill="currentColor"/>',
    brick: '<g fill="currentColor"><rect x="2" y="5" width="9" height="4.5" rx=".8"/><rect x="13" y="5" width="9" height="4.5" rx=".8"/><rect x="6.5" y="11" width="11" height="4.5" rx=".8"/><rect x="2" y="17" width="9" height="4.5" rx=".8"/><rect x="13" y="17" width="9" height="4.5" rx=".8"/></g>',
    wool: '<g fill="currentColor"><circle cx="9" cy="11" r="4"/><circle cx="14" cy="10" r="4.4"/><circle cx="12" cy="14.5" r="4.2"/><circle cx="7.5" cy="15" r="3.4"/><circle cx="16.5" cy="14.5" r="3.4"/><ellipse cx="19.8" cy="9.4" rx="2.6" ry="2.1"/><rect x="8" y="17" width="1.6" height="5" rx=".7"/><rect x="14.5" y="17" width="1.6" height="5" rx=".7"/></g>',
    wheat: '<g fill="currentColor"><path d="M11.2 22V9h1.6v13z"/><ellipse cx="12" cy="4.5" rx="1.8" ry="3"/><ellipse cx="8.6" cy="8" rx="1.6" ry="2.7" transform="rotate(-35 8.6 8)"/><ellipse cx="15.4" cy="8" rx="1.6" ry="2.7" transform="rotate(35 15.4 8)"/><ellipse cx="8.4" cy="12.6" rx="1.6" ry="2.7" transform="rotate(-35 8.4 12.6)"/><ellipse cx="15.6" cy="12.6" rx="1.6" ry="2.7" transform="rotate(35 15.6 12.6)"/></g>',
    ore: '<g fill="currentColor"><path d="M2 20 7 9l5 4 3-6 7 13z"/><path d="M7 9l2 5-3 2z" fill-opacity=".45"/><path d="M15 7l2 7 4 1z" fill-opacity=".45"/></g>',
    paper: '<g fill="currentColor"><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4z"/><path d="M8 8h8M8 11.5h8M8 15h5" stroke="#000" stroke-opacity=".35" stroke-width="1.4"/></g>',
    cloth: '<g fill="currentColor"><path d="M3 6c3-2 6-2 9 0s6 2 9 0v12c-3 2-6 2-9 0s-6-2-9 0z"/><path d="M3 10c3-2 6-2 9 0s6 2 9 0" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.3"/></g>',
    coin: '<g fill="currentColor"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.6"/><path d="M12 8v8" stroke="#000" stroke-opacity=".35" stroke-width="1.8"/></g>',
    any: '<g fill="currentColor"><circle cx="7" cy="12" r="3.2"/><circle cx="12" cy="12" r="3.2"/><circle cx="17" cy="12" r="3.2"/></g>',
    dev: '<g fill="currentColor"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 7l1.4 3 3.2.3-2.4 2.1.7 3.2L12 14l-2.9 1.6.7-3.2-2.4-2.1 3.2-.3z" fill="#000" fill-opacity=".35"/></g>',
    knight: '<g fill="currentColor"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="M12 6v12M7.5 11h9" stroke="#000" stroke-opacity=".35" stroke-width="1.8"/></g>',
    road: '<rect x="2" y="10" width="20" height="4.5" rx="2" fill="currentColor" transform="rotate(-20 12 12)"/>',
    settlement: '<path d="M4 21V11l8-7 8 7v10z" fill="currentColor"/>',
    city: '<path d="M2 21V10l5-5 5 5v2h10v9z" fill="currentColor"/>',
    wall: '<g fill="currentColor"><path d="M2 21V9h3v3h3V9h3v3h2V9h3v3h3V9h3v12z"/></g>',
    trade: '<g fill="currentColor"><path d="M4 8h13l-3-3 1.4-1.4L21 9l-5.6 5.4L14 13l3-3H4z"/><path d="M20 16H7l3 3-1.4 1.4L3 15l5.6-5.4L10 11l-3 3h13z" opacity=".75"/></g>',
    politics: '<g fill="currentColor"><path d="M12 3 3 8h18z"/><rect x="5" y="9" width="2.4" height="9"/><rect x="10.8" y="9" width="2.4" height="9"/><rect x="16.6" y="9" width="2.4" height="9"/><rect x="3" y="19" width="18" height="2.4"/></g>',
    science: '<g fill="currentColor"><path d="M9 2h6v2h-1v5.5l5.5 9.5A2 2 0 0 1 17.8 22H6.2a2 2 0 0 1-1.7-3l5.5-9.5V4H9z"/></g>',
    ship: '<g fill="currentColor"><path d="M2 15h20l-3 5H5z"/><path d="M11 3v11H4l7-11z"/><path d="M13 6v8h6z" opacity=".7"/></g>',
    robber: '<g fill="currentColor"><circle cx="12" cy="6" r="4"/><path d="M6 22c0-7 2.5-11 6-11s6 4 6 11z"/></g>',
    merchant: '<g fill="currentColor"><circle cx="12" cy="6" r="3.6"/><path d="M5 22c0-6 3-10 7-10s7 4 7 10z"/><path d="M8.5 5h7l-1-2.6h-5z"/></g>',
    vp: '<path d="M12 2l3 6.3 7 .9-5.1 4.8 1.3 6.9L12 17.6 5.8 20.9l1.3-6.9L2 9.2l7-.9z" fill="currentColor"/>',
    cards: '<g fill="currentColor"><rect x="3" y="5" width="12" height="16" rx="2" opacity=".55"/><rect x="8" y="3" width="12" height="16" rx="2"/></g>'
  };
  A.glyph = function (k, px, colour) {
    const g = GLYPH[k] || GLYPH.cards;
    return '<svg class="glyph" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" style="color:' + (colour || 'currentColor') + '" aria-hidden="true">' + g + '</svg>';
  };
  /* A card chip: the card's own colour, its glyph and a count. */
  A.chip = function (k, n, px, extra) {
    const c = D.CARD[k] || { hex: '#555', ink: '#fff', name: k };
    px = px || 22;
    return '<span class="chip-card' + (extra ? ' ' + extra : '') + '" data-card="' + esc(k) + '" style="--cc:' + c.hex + ';--ci:' + c.ink + '" title="' + esc(c.name) + '">' +
      A.glyph(k, px, c.ink) + (n != null ? '<b>' + n + '</b>' : '') + '</span>';
  };
  /* A whole set of cards, e.g. an offer or a production line. */
  A.cards = function (set, px) {
    const ks = Object.keys(set || {}).filter(k => set[k] > 0);
    ks.sort((a, b) => order(a) - order(b));
    return ks.map(k => A.chip(k, set[k], px)).join('');
  };
  const ORDER = ['wood', 'brick', 'wool', 'wheat', 'ore', 'paper', 'cloth', 'coin'];
  const order = k => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i; };

  /* ---------------- dice ---------------- */
  const PIPS = { 1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]],
    5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7, 6.5], [17, 6.5], [7, 12], [17, 12], [7, 17.5], [17, 17.5]] };
  A.die = function (v, kind, px) {
    px = px || 48;
    const bg = kind === 'r' ? '#d8433a' : kind === 'e' ? '#f4f1ea' : '#f2c94c';
    const fg = kind === 'r' ? '#fff5f0' : '#2b2003';
    let inner = '';
    if (kind === 'e') {
      const face = v;
      if (face === 'ship') inner = '<g transform="translate(3 3) scale(.75)" style="color:#1d2433">' + GLYPH.ship + '</g>';
      else if (D.TRACK[face]) inner = '<rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="' + D.TRACK[face].hex + '"/><g transform="translate(5.5 5.5) scale(.54)" style="color:' + D.TRACK[face].ink + '">' + GLYPH[face] + '</g>';
    } else {
      inner = (PIPS[v] || []).map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.3" fill="' + fg + '"/>').join('');
    }
    return '<svg class="die" width="' + px + '" height="' + px + '" viewBox="0 0 24 24"><rect x=".8" y=".8" width="22.4" height="22.4" rx="4.5" fill="' + bg + '" stroke="rgba(0,0,0,.35)" stroke-width="1"/>' + inner + '</svg>';
  };

  /* ---------------- the baked island ---------------- */
  const BK = { ready: false, loading: false, img: {}, tint: {}, listeners: [], base: 'art/baked/' };
  const MAN = () => root.CATAN_ART || null;
  A.onReady = fn => { BK.listeners.push(fn); };
  A.baked = () => BK.ready;
  /* The seat's colour, lifted a little so a black seat still reads as paint
     (the cockpit bakery's lift). */
  function lift(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#cccccc';
    const n = parseInt(m[1], 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
    const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const o = c.map(v => Math.round(255 * Math.min(1, v + 0.18 * (1 - v) * (1 - l))));
    return 'rgb(' + o.join(',') + ')';
  }
  A.probe = function (base) {
    const M = MAN();
    if (!M || BK.ready || BK.loading || typeof document === 'undefined' || typeof Image === 'undefined') return false;
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return false;
    if (base) BK.base = base;
    const cv = document.createElement('canvas');
    if (!cv.getContext || !cv.getContext('2d')) return false;
    BK.loading = true;
    const want = ['sea.webp', 'sea_s.webp'].concat(Object.keys(D.TERRAIN).map(t => 'tile-' + D.TERRAIN[t].art + '.webp'));
    for (const k of Object.keys(M.pieces)) {
      want.push('pieces/' + k + '.webp');
      if (M.pieces[k].paint) want.push('pieces/' + k + '_paint.webp');
    }
    let left = want.length, failed = false;
    for (const f of want) {
      const im = new Image();
      im.onload = () => { if (--left === 0 && !failed) { BK.ready = true; BK.listeners.forEach(fn => { try { fn(); } catch (e) {} }); } };
      im.onerror = () => { failed = true; };
      im.src = BK.base + f + '?v=' + M.ver;
      BK.img[f] = im;
    }
    return true;
  };
  const bsrc = f => BK.base + f + '?v=' + (MAN() ? MAN().ver : 0);
  /* A piece in a seat's colour, as a short blob: URL made once per colour. */
  function sprite(key, hex) {
    const M = MAN();
    const m = M && M.pieces[key];
    if (!m) return null;
    if (!m.paint || !hex) return bsrc('pieces/' + key + '.webp');
    const id = key + '|' + hex;
    if (BK.tint[id]) return BK.tint[id];
    try {
      const body = BK.img['pieces/' + key + '.webp'], paint = BK.img['pieces/' + key + '_paint.webp'];
      const c = document.createElement('canvas'), p = document.createElement('canvas');
      c.width = p.width = m.w; c.height = p.height = m.h;
      const x = c.getContext('2d'), y = p.getContext('2d');
      x.drawImage(body, 0, 0);
      y.drawImage(paint, 0, 0);
      y.globalCompositeOperation = 'multiply';
      y.fillStyle = lift(hex);
      y.fillRect(0, 0, m.w, m.h);
      y.globalCompositeOperation = 'destination-in';
      y.drawImage(paint, 0, 0);
      x.globalCompositeOperation = 'lighter';
      x.drawImage(p, 0, 0);
      const d = c.toDataURL('image/png');
      const bin = atob(d.slice(d.indexOf(',') + 1));
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      BK.tint[id] = URL.createObjectURL(new Blob([u8], { type: 'image/png' }));
    } catch (e) {
      BK.tint[id] = bsrc('pieces/' + key + '.webp');
    }
    return BK.tint[id];
  }
  A.sprite = sprite;
  /* A piece standing on the board point (x, y) in SVG units. */
  function spriteAt(key, hex, x, y, extra) {
    const M = MAN(), m = M.pieces[key];
    const k = 1 / M.pxPerSvg;
    return '<image href="' + sprite(key, hex) + '" x="' + f(x - m.ax * k) + '" y="' + f(y - m.ay * k) + '" width="' + f(m.w * k) + '" height="' + f(m.h * k) + '"' + (extra || '') + '/>';
  }
  /* The barbarian ship, for the telly's track. */
  A.ship = function (px, colour) {
    if (!BK.ready) return A.glyph('ship', px, colour);
    return '<img class="ship-ico" src="' + bsrc('pieces/ship.webp') + '" alt="" style="height:' + Math.round(px * 1.6) + 'px;width:auto;margin:-' + Math.round(px * 0.35) + 'px">';
  };

  /* ---------------- pieces, as little icons for panels and buttons ---------------- */
  const ICON = { road: 'road30', settlement: 'settlement', city: 'city', knight: 'knight1' };
  A.piece = function (kind, hex, px) {
    px = px || 22;
    if (BK.ready && ICON[kind]) return '<img class="piece-ico" src="' + sprite(ICON[kind], hex) + '" alt="" width="' + px + '" height="' + px + '" style="object-fit:contain">';
    const stroke = light(hex) ? '#2a2a2a' : '#0b0f1a';
    const body = {
      road: '<rect x="1" y="9" width="22" height="6" rx="2.5" fill="' + hex + '" stroke="' + stroke + '" stroke-width="1.3" transform="rotate(-25 12 12)"/>',
      settlement: '<path d="M4 21V11l8-7 8 7v10z" fill="' + hex + '" stroke="' + stroke + '" stroke-width="1.5"/>',
      city: '<path d="M2 21V10l5-5 5 5v2h10v9z" fill="' + hex + '" stroke="' + stroke + '" stroke-width="1.5"/>',
      knight: '<circle cx="12" cy="12" r="10" fill="' + hex + '" stroke="' + stroke + '" stroke-width="1.5"/><g transform="translate(5 5) scale(.58)" style="color:' + (light(hex) ? '#222' : '#fff') + '">' + GLYPH.knight + '</g>',
      wall: '<path d="M2 21V9h3v3h3V9h3v3h2V9h3v3h3V9h3v12z" fill="#9aa0a8" stroke="#3b3f45" stroke-width="1.2"/>'
    }[kind] || '';
    return '<svg class="piece-ico" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  };

  /* ---------------- the island ---------------- */
  const RF = 5.62;                                   // the sea frame's corner radius, board units
  function frameAt(r) {
    const pts = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; pts.push([Math.cos(a) * r * S, Math.sin(a) * r * S]); }
    return pts;
  }
  function hexPts(x, y, r) {
    const out = [];
    for (let k = 0; k < 6; k++) { const a = (60 * k - 90) * Math.PI / 180; out.push(f(x + Math.cos(a) * r) + ',' + f(y + Math.sin(a) * r)); }
    return out.join(' ');
  }
  A.viewBox = function () {
    const w = RF * S + 20, h = RF * S * SQ3 / 2 + 20;
    return [-w, -h, 2 * w, 2 * h];
  };
  A.tileSrc = t => 'art/tile__hex-' + (D.TERRAIN[t] ? D.TERRAIN[t].art : 'desert') + '__01.png?v=' + ART_VER;

  /* Where the robber and the merchant stand on a hex: beside the number disc,
     so the number stays readable from the sofa. */
  const ROBBER_AT = [-0.42, 0.12], MERCHANT_AT = [0.42, 0.12];

  /*  o: {
        mode:   'tv' | 'phone'
        pick:   {kind:'corner'|'edge'|'hex'|'knight', options:[ids], sel:id|[ids]}
        hot:    number rolled — its discs glow
        faint:  true to dim everything under the pick layer
        players: optional override of pub.players (id -> {hex})
      } */
  A.board = function (pub, o) {
    o = o || {};
    const B = Board.build(pub.layout);
    const colour = {};
    for (const p of pub.players) colour[p.id] = p.hex;
    const vb = A.viewBox();
    const out = [];
    out.push('<svg class="island" viewBox="' + vb.join(' ') + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">');

    /* The baked island is modelled on the 3-4 island; the 5-6 one stays vector. */
    const baked = BK.ready && pub.layout === 'standard';
    const M = MAN();

    /* sea */
    if (baked) {
      out.push('<g data-layer="sea"><image href="' + bsrc(o.mode === 'phone' ? 'sea_s.webp' : 'sea.webp') + '" x="' + f(M.sea.x) + '" y="' + f(M.sea.y) + '" width="' + f(M.sea.w) + '" height="' + f(M.sea.h) + '" preserveAspectRatio="none"/></g>');
    } else {
      const fr = frameAt(RF).map(p => f(p[0]) + ',' + f(p[1])).join(' ');
      const fr2 = frameAt(RF + 0.16).map(p => f(p[0]) + ',' + f(p[1])).join(' ');
      out.push('<g data-layer="sea"><polygon points="' + fr2 + '" fill="url(#ctFrame)"/><polygon points="' + fr + '" fill="url(#ctSea)"/><polygon points="' + fr + '" fill="url(#ctWaves)"/></g>');
    }

    /* beach: a sand hex a touch larger than each tile, so the gaps read as paths
       (the sea plate has its own sand) */
    out.push('<g data-layer="beach">');
    if (!baked) for (const h of B.hexes) out.push('<polygon points="' + hexPts(h.x * S, h.y * S, 1.1 * S) + '" fill="#e2c98f" stroke="#e2c98f" stroke-width="6" stroke-linejoin="round"/>');
    out.push('</g>');

    /* tiles: a flat hex in the terrain colour, the tile picture over it */
    out.push('<g data-layer="tiles">');
    const TW = 512 / 220.5 * S * 0.985;
    pub.hexes.forEach((x, i) => {
      const h = B.hexes[i];
      const T = D.TERRAIN[x.t];
      out.push('<polygon points="' + hexPts(h.x * S, h.y * S, 0.97 * S) + '" fill="' + T.hex + '"/>');
      out.push('<image href="' + (baked ? bsrc('tile-' + T.art + '.webp') : A.tileSrc(x.t)) + '" x="' + f(h.x * S - TW / 2) + '" y="' + f(h.y * S - TW / 2) + '" width="' + f(TW) + '" height="' + f(TW) + '"/>');
    });
    out.push('</g>');

    /* harbours: a pier to each of the two crossings (baked into the sea plate),
       a flag with the rate */
    out.push('<g data-layer="harbours">');
    for (const pt of pub.ports) {
      const e = B.edges[pt.edge];
      const cx = (e.x + e.out[0] * 0.62) * S, cy = (e.y + e.out[1] * 0.62) * S;
      if (!baked) for (const c of [e.a, e.b]) {
        const k = B.corners[c];
        const mx = k.x * S + (cx - k.x * S) * 0.18, my = k.y * S + (cy - k.y * S) * 0.18;
        out.push('<line x1="' + f(mx) + '" y1="' + f(my) + '" x2="' + f(cx) + '" y2="' + f(cy) + '" stroke="#8a6334" stroke-width="9" stroke-linecap="round"/>');
        out.push('<line x1="' + f(mx) + '" y1="' + f(my) + '" x2="' + f(cx) + '" y2="' + f(cy) + '" stroke="#c49a5e" stroke-width="4" stroke-linecap="round" stroke-dasharray="7 5"/>');
      }
      const c = pt.kind === 'any' ? { hex: '#f4efe2', ink: '#2b2b2b' } : D.CARD[pt.kind];
      out.push('<g class="port" data-port="' + esc(pt.kind) + '" transform="translate(' + f(cx) + ' ' + f(cy) + ')"><circle r="29" fill="' + c.hex + '" stroke="#3a2a14" stroke-width="3.5"/>' +
        (pt.kind === 'any'
          ? '<text y="9" text-anchor="middle" font-size="25" font-weight="800" fill="' + c.ink + '" font-family="system-ui,sans-serif">3:1</text>'
          : '<g transform="translate(-13 -20) scale(1.08)" style="color:' + c.ink + '">' + GLYPH[pt.kind] + '</g><text y="24" text-anchor="middle" font-size="13" font-weight="800" fill="' + c.ink + '" font-family="system-ui,sans-serif">2:1</text>') +
        '</g>');
    }
    out.push('</g>');

    /* numbers */
    out.push('<g data-layer="numbers">');
    pub.hexes.forEach((x, i) => {
      if (!x.n) return;
      const h = B.hexes[i];
      const red = x.n === 6 || x.n === 8;
      const hot = o.hot === x.n;
      const blocked = pub.robber === i;
      out.push('<g transform="translate(' + f(h.x * S) + ' ' + f(h.y * S) + ')"' + (hot ? ' filter="url(#ctGlow)"' : '') + (blocked ? ' opacity=".55"' : '') + '>' +
        (hot ? '<circle r="40" fill="#fff6c9" opacity=".85"/>' : '') +
        (baked
          ? spriteAt('token', null, 0, 0) + (hot ? '<circle r="31" fill="none" stroke="#f2b705" stroke-width="5"/>' : '')
          : '<circle r="31" fill="url(#ctToken)" stroke="' + (hot ? '#f2b705' : '#8a6d3b') + '" stroke-width="' + (hot ? 5 : 2.5) + '"/>') +
        '<text y="7" text-anchor="middle" font-size="' + (red ? 29 : 27) + '" font-weight="800" fill="' + (red ? '#c8261c' : '#2a1f10') + '" font-family="Georgia,serif">' + x.n + '</text>' +
        '<g fill="' + (red ? '#c8261c' : '#2a1f10') + '">' + pips(D.PIPS[x.n]) + '</g></g>');
    });
    out.push('</g>');

    if (baked) { out.push(bakedPieces(pub, B, colour)); } else {
    /* roads */
    out.push('<g data-layer="roads">');
    for (const r of pub.roads) {
      const e = B.edges[r.at];
      const a = B.corners[e.a], b = B.corners[e.b];
      const t1 = 0.2, t2 = 0.8;
      const x1 = (a.x + (b.x - a.x) * t1) * S, y1 = (a.y + (b.y - a.y) * t1) * S;
      const x2 = (a.x + (b.x - a.x) * t2) * S, y2 = (a.y + (b.y - a.y) * t2) * S;
      const hex = colour[r.owner] || '#999';
      out.push('<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="#10131c" stroke-width="18" stroke-linecap="round"/>' +
        '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="' + hex + '" stroke-width="11" stroke-linecap="round"/>');
    }
    out.push('</g>');

    /* buildings */
    out.push('<g data-layer="buildings">');
    for (const b of pub.builds) {
      const c = B.corners[b.at];
      const hex = colour[b.owner] || '#999';
      const dark = light(hex) ? '#2a2a2a' : '#0b0f1a';
      out.push('<g transform="translate(' + f(c.x * S) + ' ' + f(c.y * S) + ')" filter="url(#ctLift)">');
      if (b.wall) out.push('<path d="M-34 22 V-10 h8 v7 h8 v-7 h8 v7 h8 v-7 h8 v7 h8 v-7 h8 v7 h8 v-7 h8 V22z" fill="#9aa0a8" stroke="#3b3f45" stroke-width="3" transform="translate(0 6)"/>');
      if (b.kind === 'settlement') {
        out.push('<path d="M-17 15 V-3 L0 -19 L17 -3 V15 Z" fill="' + hex + '" stroke="' + dark + '" stroke-width="3.5" stroke-linejoin="round"' + (b.sideways ? ' transform="rotate(90)"' : '') + '/>');
      } else {
        out.push('<path d="M-27 17 V-6 L-14 -20 L-1 -6 V-2 H27 V17 Z" fill="' + hex + '" stroke="' + dark + '" stroke-width="3.5" stroke-linejoin="round"/>' +
          '<rect x="-19" y="3" width="8" height="9" fill="' + dark + '" opacity=".35"/><rect x="8" y="5" width="7" height="7" fill="' + dark + '" opacity=".35"/>');
        if (b.metro) {
          const T = D.TRACK[b.metro];
          out.push('<g transform="translate(-14 -24)"><path d="M0 0 V-26" stroke="' + dark + '" stroke-width="3"/><path d="M0 -26 L22 -19 L0 -12Z" fill="' + T.hex + '" stroke="' + dark + '" stroke-width="2.2"/></g>' +
            '<g transform="translate(8 -18) scale(.9)"><circle r="11" fill="' + T.hex + '" stroke="' + dark + '" stroke-width="2.4"/><g transform="translate(-8 -8) scale(.67)" style="color:' + T.ink + '">' + GLYPH[b.metro] + '</g></g>');
        }
      }
      out.push('</g>');
    }
    out.push('</g>');

    /* knights: a shield disc, one to three rings for strength; laid down (faded) when inactive */
    out.push('<g data-layer="knights">');
    for (const k of pub.knights) {
      const c = B.corners[k.at];
      const hex = colour[k.owner] || '#999';
      const dark = light(hex) ? '#222' : '#0b0f1a';
      const ink = light(hex) ? '#1a1a1a' : '#ffffff';
      out.push('<g transform="translate(' + f(c.x * S) + ' ' + f(c.y * S) + ')"' + (k.active ? ' filter="url(#ctLift)"' : ' opacity=".62"') + '>' +
        (k.active ? '<circle r="27" fill="none" stroke="#fff7c2" stroke-width="4"/>' : '') +
        '<circle r="22" fill="' + hex + '" stroke="' + dark + '" stroke-width="3.5"' + (k.active ? '' : ' stroke-dasharray="5 4"') + '/>' +
        '<g transform="translate(-12 -14) scale(1)" style="color:' + ink + '">' + GLYPH.knight + '</g>' +
        [1, 2, 3].slice(0, k.level).map(n => '<circle cx="' + (-12 + (n - 1) * 12) + '" cy="30" r="4.6" fill="' + ink + '" stroke="' + dark + '" stroke-width="2"/>').join('') +
        '</g>');
    }
    out.push('</g>');

    /* robber, merchant */
    out.push('<g data-layer="robber">');
    if (pub.robber != null) {
      const h = B.hexes[pub.robber];
      out.push('<g transform="translate(' + f((h.x + ROBBER_AT[0]) * S) + ' ' + f((h.y + ROBBER_AT[1]) * S) + ')" filter="url(#ctLift)">' +
        '<ellipse cx="0" cy="24" rx="17" ry="6" fill="#000" opacity=".3"/>' +
        '<path d="M-15 24 C-15 4 -9 -6 0 -6 C9 -6 15 4 15 24Z" fill="#3a3d45" stroke="#0e0f13" stroke-width="3"/>' +
        '<circle cy="-16" r="10.5" fill="#4a4e58" stroke="#0e0f13" stroke-width="3"/></g>');
    }
    out.push('</g>');
    out.push('<g data-layer="merchant">');
    if (pub.merchant) {
      const h = B.hexes[pub.merchant.hex];
      const hex = colour[pub.merchant.seat] || '#e8c267';
      out.push('<g transform="translate(' + f((h.x + MERCHANT_AT[0]) * S) + ' ' + f((h.y + MERCHANT_AT[1]) * S) + ')" filter="url(#ctLift)">' +
        '<path d="M-13 22 C-13 4 -8 -4 0 -4 C8 -4 13 4 13 22Z" fill="#e8c267" stroke="#5a4210" stroke-width="3"/>' +
        '<circle cy="-13" r="9" fill="#f3d98c" stroke="#5a4210" stroke-width="3"/>' +
        '<path d="M-10 -19 H10 L7 -26 H-7Z" fill="' + hex + '" stroke="#5a4210" stroke-width="2"/></g>');
    }
    out.push('</g>');

    }

    /* what just happened: a glow on this turn's new pieces, so the room can
       see what changed without reading the log */
    out.push('<g data-layer="marks">');
    if (o.marks) {
      for (const id of o.marks.edges || []) {
        const e = B.edges[id];
        if (!e) continue;
        const a = B.corners[e.a], b = B.corners[e.b];
        out.push('<line class="mark" x1="' + f(a.x * S + (b.x - a.x) * S * 0.2) + '" y1="' + f(a.y * S + (b.y - a.y) * S * 0.2) + '" x2="' + f(a.x * S + (b.x - a.x) * S * 0.8) + '" y2="' + f(a.y * S + (b.y - a.y) * S * 0.8) + '" stroke="#ffe066" stroke-width="30" stroke-linecap="round" opacity=".38"/>');
      }
      for (const id of o.marks.corners || []) {
        const c = B.corners[id];
        if (!c) continue;
        out.push('<circle class="mark" cx="' + f(c.x * S) + '" cy="' + f(c.y * S) + '" r="38" fill="none" stroke="#ffe066" stroke-width="6" opacity=".9"/>');
      }
      for (const id of o.marks.hexes || []) {
        const h = B.hexes[id];
        if (!h) continue;
        out.push('<polygon class="mark" points="' + hexPts(h.x * S, h.y * S, 0.93 * S) + '" fill="none" stroke="#ffe066" stroke-width="8" opacity=".85"/>');
      }
    }
    out.push('</g>');

    /* what may be picked */
    out.push('<g data-layer="pick">');
    if (o.pick) out.push(pickLayer(pub, B, o.pick, o.mode));
    out.push('</g>');

    out.push('</svg>');
    return out.join('');
  };
  /* The pieces as baked sprites: the same layers, each piece's foot on its
     crossing or path. Within a layer, pieces further down the screen are
     drawn later, so a nearer piece stands in front of one behind it. */
  const ROAD_KEYS = [30, 90, 150];
  const FLAG_AT = [-14.6, -42];               // the metropolis flagpole's top, SVG units from the crossing
  function bakedPieces(pub, B, colour) {
    const out = [];
    const byY = (a, b) => a.y - b.y;
    out.push('<g data-layer="roads">');
    pub.roads.map(r => {
      const e = B.edges[r.at];
      const a = B.corners[e.a], b = B.corners[e.b];
      let deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      deg = ((deg % 180) + 180) % 180;
      const key = 'road' + ROAD_KEYS.reduce((best, k) => (Math.abs(k - deg) < Math.abs(best - deg) ? k : best), 90);
      return { y: e.y, html: spriteAt(key, colour[r.owner] || '#999', e.x * S, e.y * S) };
    }).sort(byY).forEach(p => out.push(p.html));
    out.push('</g>');
    out.push('<g data-layer="buildings">');
    pub.builds.map(b => {
      const c = B.corners[b.at];
      const hex = colour[b.owner] || '#999';
      const x = c.x * S, y = c.y * S;
      let h = '';
      if (b.wall) h += spriteAt('wall_back', null, x, y);
      if (b.kind === 'settlement') h += spriteAt('settlement', hex, x, y);
      else if (b.metro) {
        const T = D.TRACK[b.metro];
        const dark = '#1b1f2a';
        h += spriteAt('metro', hex, x, y) +
          '<g transform="translate(' + f(x + FLAG_AT[0]) + ' ' + f(y + FLAG_AT[1]) + ')"><path d="M0 0 L26 7 L0 15Z" fill="' + T.hex + '" stroke="' + dark + '" stroke-width="2"/>' +
          '<g transform="translate(26 -12)"><circle r="11" fill="' + T.hex + '" stroke="' + dark + '" stroke-width="2.2"/><g transform="translate(-8 -8) scale(.67)" style="color:' + T.ink + '">' + GLYPH[b.metro] + '</g></g></g>';
      } else h += spriteAt('city', hex, x, y);
      if (b.wall) h += spriteAt('wall_front', null, x, y);
      return { y: c.y, html: '<g data-at="' + b.at + '">' + h + '</g>' };
    }).sort(byY).forEach(p => out.push(p.html));
    out.push('</g>');
    out.push('<g data-layer="knights">');
    pub.knights.map(k => {
      const c = B.corners[k.at];
      const hex = colour[k.owner] || '#999';
      const x = c.x * S, y = c.y * S;
      /* Active: a bright ring at its foot. Inactive: faded, a dashed ring. */
      const ring = '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="22" ry="' + f(22 * 0.77) + '" fill="none" stroke="' + (k.active ? '#fff7c2' : 'rgba(255,255,255,.75)') + '" stroke-width="' + (k.active ? 4 : 2.5) + '"' + (k.active ? '' : ' stroke-dasharray="5 4"') + '/>';
      return { y: c.y, html: '<g' + (k.active ? '' : ' opacity=".6"') + '>' + ring + spriteAt('knight' + Math.max(1, Math.min(3, k.level)), hex, x, y) + '</g>' };
    }).sort(byY).forEach(p => out.push(p.html));
    out.push('</g>');
    out.push('<g data-layer="robber">');
    if (pub.robber != null) {
      const h = B.hexes[pub.robber];
      out.push(spriteAt('robber', null, (h.x + ROBBER_AT[0]) * S, (h.y + ROBBER_AT[1] + 0.2) * S));
    }
    out.push('</g>');
    out.push('<g data-layer="merchant">');
    if (pub.merchant) {
      const h = B.hexes[pub.merchant.hex];
      out.push(spriteAt('merchant', colour[pub.merchant.seat] || '#e8c267', (h.x + MERCHANT_AT[0]) * S, (h.y + MERCHANT_AT[1] + 0.2) * S));
    }
    out.push('</g>');
    return out.join('');
  }

  function pips(n) {
    const out = [];
    const w = 6.2;
    for (let i = 0; i < n; i++) out.push('<circle cx="' + f((i - (n - 1) / 2) * w) + '" cy="18" r="2.4"/>');
    return out.join('');
  }
  function pickLayer(pub, B, pk, mode) {
    const out = [];
    const sel = Array.isArray(pk.sel) ? pk.sel : (pk.sel == null ? [] : [pk.sel]);
    const big = mode === 'phone';
    if (pk.kind === 'corner') {
      for (const c of pk.options) {
        const k = B.corners[c];
        const on = sel.indexOf(c) >= 0;
        out.push('<g class="pk' + (on ? ' on' : '') + '" data-pick="' + c + '" transform="translate(' + f(k.x * S) + ' ' + f(k.y * S) + ')">' +
          '<circle r="' + (big ? 34 : 26) + '" fill="transparent"/>' +
          '<circle r="' + (on ? 20 : 15) + '" fill="' + (on ? '#ffe066' : 'rgba(255,255,255,.88)') + '" stroke="#11151f" stroke-width="' + (on ? 5 : 3.5) + '"/></g>');
      }
    } else if (pk.kind === 'edge') {
      for (const id of pk.options) {
        const e = B.edges[id];
        const a = B.corners[e.a], b = B.corners[e.b];
        const on = sel.indexOf(id) >= 0;
        const x1 = (a.x + (b.x - a.x) * 0.24) * S, y1 = (a.y + (b.y - a.y) * 0.24) * S;
        const x2 = (a.x + (b.x - a.x) * 0.76) * S, y2 = (a.y + (b.y - a.y) * 0.76) * S;
        out.push('<g class="pk' + (on ? ' on' : '') + '" data-pick="' + id + '">' +
          '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="transparent" stroke-width="' + (big ? 44 : 30) + '" stroke-linecap="round"/>' +
          '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="#11151f" stroke-width="' + (on ? 20 : 15) + '" stroke-linecap="round"/>' +
          '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="' + (on ? '#ffe066' : 'rgba(255,255,255,.9)') + '" stroke-width="' + (on ? 12 : 8) + '" stroke-linecap="round"/></g>');
      }
    } else if (pk.kind === 'hex') {
      for (const id of pk.options) {
        const h = B.hexes[id];
        const on = sel.indexOf(id) >= 0;
        out.push('<g class="pk' + (on ? ' on' : '') + '" data-pick="' + id + '">' +
          '<polygon points="' + hexPts(h.x * S, h.y * S, 0.9 * S) + '" fill="' + (on ? 'rgba(255,224,102,.35)' : 'rgba(255,255,255,.08)') + '" stroke="' + (on ? '#ffe066' : 'rgba(255,255,255,.75)') + '" stroke-width="' + (on ? 9 : 5) + '" stroke-dasharray="' + (on ? '' : '14 10') + '"/></g>');
      }
    } else if (pk.kind === 'knight') {
      for (const id of pk.options) {
        const k = pub.knights.find(x => x.id === id);
        if (!k) continue;
        const c = B.corners[k.at];
        const on = sel.indexOf(id) >= 0;
        out.push('<g class="pk' + (on ? ' on' : '') + '" data-pick="' + id + '" transform="translate(' + f(c.x * S) + ' ' + f(c.y * S) + ')">' +
          '<circle r="' + (big ? 40 : 34) + '" fill="transparent" stroke="' + (on ? '#ffe066' : 'rgba(255,255,255,.9)') + '" stroke-width="' + (on ? 8 : 5) + '" stroke-dasharray="' + (on ? '' : '10 7') + '"/></g>');
      }
    }
    return out.join('');
  }

  /* The nearest pickable thing to a point on the board (svg units), within a
     thumb's reach — so a tap does not have to land on a 15-unit circle. */
  A.nearest = function (pub, pk, x, y, reach) {
    const B = Board.build(pub.layout);
    let best = null, bd = (reach || 70) * (reach || 70);
    const at = id => {
      if (pk.kind === 'corner') { const c = B.corners[id]; return [c.x * S, c.y * S]; }
      if (pk.kind === 'edge') { const e = B.edges[id]; return [e.x * S, e.y * S]; }
      if (pk.kind === 'hex') { const h = B.hexes[id]; return [h.x * S, h.y * S]; }
      if (pk.kind === 'knight') { const k = pub.knights.find(z => z.id === id); if (!k) return [1e9, 1e9]; const c = B.corners[k.at]; return [c.x * S, c.y * S]; }
      return [1e9, 1e9];
    };
    for (const id of pk.options) {
      const p = at(id);
      const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  };

  A.S = S;
  if (typeof module === 'object' && module.exports) module.exports = A;
  else root.CatanArt = A;
})(typeof window !== 'undefined' ? window : globalThis);
