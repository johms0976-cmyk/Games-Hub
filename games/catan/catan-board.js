/* Catan — the island's geometry.
 *
 * Pure geometry, shared by the rules, the telly, the phones and the bots: the
 * land hexes, the crossings (corners) where buildings and knights stand, the
 * paths (edges) where roads go, which touches which, and the coast the
 * harbours sit on. Nothing here knows whose piece is where.
 *
 * Units: one hex's corner radius is 1. Hexes are pointy-top, as on the printed
 * board and in the tile art (rows of 3-4-5-4-3 read left to right).
 *
 *   hex    {id, q, r, x, y, corners:[6 ids, clockwise from the top], edges:[6], adj:[hex ids]}
 *   corner {id, x, y, hexes:[...], adj:[corner ids], edges:[edge ids], coast}
 *   edge   {id, a, b, x, y, hexes:[...], coast, out:[dx,dy] (coast only)}
 *
 * Ids are small integers in reading order (top to bottom, left to right), so a
 * log line or a test can name a crossing and mean the same one every game.
 */
(function (root) {
  'use strict';
  const SQ3 = Math.sqrt(3);
  /* `harbours` spaces the harbour sites round the coast the way the frame
     does: `from` is the first site, counted clockwise from twelve o'clock, and
     `gaps` the paths from each site to the next. */
  const LAYOUTS = {
    /* The 3–4 player island: 19 land hexes. Three harbours to every two sides. */
    standard: { rows: [3, 4, 5, 4, 3], harbours: { from: 1, gaps: [3, 3, 4, 3, 3, 4, 3, 3, 4] } },
    /* The 5–6 player island: 30 land hexes, the frame lengthened by four short
       pieces. Eleven harbours, read off the fixed-setup picture in the 2025
       CATAN 5–6 rulebook (CN3082): the two new sea pieces on the upper sides
       carry none, the two on the lower sides one each — hence the wide gaps at
       the top of the ring. */
    big: { rows: [3, 4, 5, 6, 5, 4, 3], harbours: { from: 0, gaps: [4, 5, 3, 3, 3, 3, 3, 3, 3, 5, 3] } }
  };
  /* The sea frame, as margins beyond the land: kept exactly as the 3–4 island
     has always been drawn (a regular hexagon of corner radius 5.62). */
  const FRAME_SIDE = 5.62 - 2.5 * SQ3, FRAME_TOP = 5.62 * SQ3 / 2 - 4;
  const cache = {};

  function build(name) {
    name = name || 'standard';
    if (cache[name]) return cache[name];
    const L = LAYOUTS[name];
    if (!L) throw new Error('No such island: ' + name);
    const rows = L.rows;
    const mid = (rows.length - 1) / 2;
    const widest = Math.max.apply(null, rows);

    /* Hexes, row by row. Axial q is recovered from the pixel position so
       neighbours can be found by coordinate. */
    const hexes = [];
    rows.forEach((n, ri) => {
      const r = ri - mid;
      for (let k = 0; k < n; k++) {
        const x = SQ3 * (k - (n - 1) / 2);
        const y = 1.5 * r;
        const q = Math.round(x / SQ3 - r / 2);
        hexes.push({ id: hexes.length, q, r, x, y, corners: [], edges: [], adj: [] });
      }
    });

    /* Corners are shared between hexes: the same point from up to three of
       them. Keyed by position, rounded well inside the smallest spacing. */
    const ckey = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000);
    const cmap = new Map();
    const craw = [];
    for (const h of hexes) {
      for (let k = 0; k < 6; k++) {
        const a = (60 * k - 90) * Math.PI / 180;
        const x = h.x + Math.cos(a), y = h.y + Math.sin(a);
        const key = ckey(x, y);
        let c = cmap.get(key);
        if (!c) { c = { key, x, y, hexes: [] }; cmap.set(key, c); craw.push(c); }
        c.hexes.push(h.id);
        h.corners.push(c);
      }
    }
    craw.sort((a, b) => (Math.abs(a.y - b.y) > 1e-6 ? a.y - b.y : a.x - b.x));
    const corners = craw.map((c, i) => ({ id: i, x: round(c.x), y: round(c.y), hexes: c.hexes.slice().sort((a, b) => a - b), adj: [], edges: [], coast: false }));
    craw.forEach((c, i) => { c.id = i; });
    for (const h of hexes) h.corners = h.corners.map(c => c.id);

    /* Edges: consecutive corners round each hex. */
    const emap = new Map();
    const eraw = [];
    for (const h of hexes) {
      for (let k = 0; k < 6; k++) {
        const a = h.corners[k], b = h.corners[(k + 1) % 6];
        const key = Math.min(a, b) + '-' + Math.max(a, b);
        let e = emap.get(key);
        if (!e) { e = { key, a: Math.min(a, b), b: Math.max(a, b), hexes: [] }; emap.set(key, e); eraw.push(e); }
        e.hexes.push(h.id);
        h.edges.push(e);
      }
    }
    for (const e of eraw) {
      e.x = (corners[e.a].x + corners[e.b].x) / 2;
      e.y = (corners[e.a].y + corners[e.b].y) / 2;
    }
    eraw.sort((a, b) => (Math.abs(a.y - b.y) > 1e-6 ? a.y - b.y : a.x - b.x));
    const edges = eraw.map((e, i) => ({ id: i, a: e.a, b: e.b, x: round(e.x), y: round(e.y), hexes: e.hexes.slice().sort((p, q) => p - q), coast: e.hexes.length === 1 }));
    eraw.forEach((e, i) => { e.id = i; });
    for (const h of hexes) h.edges = h.edges.map(e => e.id);

    for (const e of edges) {
      corners[e.a].edges.push(e.id); corners[e.b].edges.push(e.id);
      corners[e.a].adj.push(e.b); corners[e.b].adj.push(e.a);
      if (e.coast) {
        corners[e.a].coast = true; corners[e.b].coast = true;
        /* Outward: from the one hex's centre through the edge's middle. */
        const h = hexes[e.hexes[0]];
        const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy);
        e.out = [round(dx / d), round(dy / d)];
      }
    }
    for (const c of corners) { c.adj.sort((a, b) => a - b); c.edges.sort((a, b) => a - b); }

    /* Hex neighbours: two hexes sharing an edge. */
    for (const e of edges) if (e.hexes.length === 2) {
      hexes[e.hexes[0]].adj.push(e.hexes[1]);
      hexes[e.hexes[1]].adj.push(e.hexes[0]);
    }
    for (const h of hexes) h.adj.sort((a, b) => a - b);

    /* The coast as one ring, clockwise from twelve o'clock. */
    const coast = edges.filter(e => e.coast).map(e => e.id);
    const ang = id => {
      const e = edges[id];
      let a = Math.atan2(e.y, e.x) + Math.PI / 2;      // 0 at the top
      if (a < 0) a += 2 * Math.PI;
      return a;
    };
    coast.sort((p, q) => ang(p) - ang(q));

    /* The harbour sites, spaced round the coast the way the frame spaces them,
       never two on one crossing. */
    const harbours = [];
    let at = L.harbours.from;
    for (const g of L.harbours.gaps) { harbours.push(coast[at % coast.length]); at += g; }

    const minX = Math.min.apply(null, corners.map(c => c.x));
    const maxX = Math.max.apply(null, corners.map(c => c.x));
    const minY = Math.min.apply(null, corners.map(c => c.y));
    const maxY = Math.max.apply(null, corners.map(c => c.y));

    /* The sea frame: a hexagon with a point at each end of the widest row and
       flat along the top and bottom rows, sides parallel to the coast. */
    const fx = widest * SQ3 / 2 + FRAME_SIDE;
    const fy = 1.5 * mid + 1 + FRAME_TOP;
    const frame = { x: round(fx), y: round(fy), top: round(fx - fy / SQ3) };

    const B = {
      name, rows, widest,
      hexes: hexes.map(h => ({ id: h.id, q: h.q, r: h.r, x: round(h.x), y: round(h.y), corners: h.corners, edges: h.edges, adj: h.adj })),
      corners, edges, coast, harbours, frame,
      box: { minX, maxX, minY, maxY }
    };
    /* Handy lookups. */
    B.edgeOf = function (a, b) {
      const ca = corners[a];
      if (!ca) return -1;
      for (const id of ca.edges) { const e = edges[id]; if (e.a === b || e.b === b) return id; }
      return -1;
    };
    B.other = (edgeId, cornerId) => { const e = edges[edgeId]; return e.a === cornerId ? e.b : e.a; };
    cache[name] = B;
    return B;
  }
  function round(v) { return Math.round(v * 10000) / 10000; }

  const Board = { build, LAYOUTS, SQ3 };
  if (typeof module === 'object' && module.exports) module.exports = Board;
  else root.CatanBoard = Board;
})(typeof window !== 'undefined' ? window : globalThis);
