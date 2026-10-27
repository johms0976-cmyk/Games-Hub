/* Dustwater, Act I's map, laid out as a town (layout D, 2026-10-27): one long Main Street up the map, buildings
   turned 45 degrees toward the street on both sides, people in the street. The page draws the stops from this
   and bakery/dustwater.py bakes the art from it (via `node bakery/layout.js`), so the two never drift apart.

   World: metres; x across the street (0 = its middle), y up the street (into the picture), z up. The camera
   looks straight up the street from 30 degrees, orthographic, one art pixel = M metres; the plate is W x H art
   pixels and px() turns a world point into plate pixels. The map's graph (btp-run.js genMap) is untouched:
   floor f is a block of the street, column c a place across it:
     c 2       the middle of Main Street
     c 1, 3    the street's edge, in front of the inner row of shops
     c 0, 4    the back lots behind them (a second, outer row of shops)
   A stop that is a building (BUILDING_KINDS) stands on a lot on its side of the street, its marker at its
   door; one drawn in the middle of the road crosses to a side with no stop of its own on that floor, or
   moves half a block up. Every other stop is people, standing where its column says. Lots with no stop get
   a plain shop (FILLERS), so the street is lined. Time of day climbs with the floors: morning at the
   stagecoach, dusk at the Saloon (GRADE). */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const W = 180, H = 620, M = 0.30, EL = 30;
  const S = Math.sin(EL * Math.PI / 180), C = Math.cos(EL * Math.PI / 180);
  const OX = W / 2, OY = H - 4 - 14 * S / M;            // the world origin's plate pixel (y = -14 sits 4 px up)
  const FLOOR0 = 14, STEP = 44, BOSS_Y = 318;           // a floor every 44 m of street; the Saloon's front
  const FIG_X = [-19, -7.5, 0, 7.5, 19];                // where people stand, by column
  const DOOR = { inner: 10.5, outer: 19 };              // lot doors, |x|; an outer lot is 5 m further up
  const BUILDING_KINDS = ['camp', 'store', 'bank'];
  const FILLERS = ['house1', 'house2', 'house3'];
  const CARDS = ['cards1', 'cards2', 'cards3', 'cards4'];
  const FIGURE = { elite: ['duel', 'duel2'], event: ['gossip', 'gossip2'], raffle: ['strike', 'strike2'] };
  // a building's front centre sits behind its door, toward its own side: the door is 2.2 m out along the
  // turned front's normal
  const BACK = 2.2 * Math.SQRT1_2;

  const px = (x, y, z) => [OX + x / M, OY - (y * S + (z || 0) * C) / M];
  // a stop's marker sits a few pixels in front of its ground point, so it is a base the townsfolk stand
  // behind rather than a disc over them
  const mk = (x, y, d) => { const p = px(x, y); return [p[0], p[1] + d]; };
  const floorY = f => FLOOR0 + STEP * f;
  const grade = f => f <= 1 ? 'm' : f <= 4 ? 'n' : 'd';     // morning, noon, dusk
  function hash(s, k) { let h = 2166136261 ^ (k || 0); for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }
  const jit = (id, k, a) => (hash(id, k) * 2 - 1) * a;

  /* A kind's buildings, in the order the town hands them out (the user's town rules, 2026-10-27): a repeat is
     never the same building twice running, so a second hotel is the boarding house and a second store the
     mercantile. Hotels are counted down from the Saloon (the one before it is THE hotel), stores up from the
     stagecoach. [sprite name, its place's name] */
  const VARIANTS = { camp: [['camp', 'The hotel'], ['camp2', 'The boarding house']],
                     store: [['store', 'The general store'], ['store2', 'The mercantile']],
                     bank: [['bank', 'The Dustwater bank']] };

  /* Everything the map shows: stops (marker, and the sprite that dresses it), the plain shops between them,
     the Saloon. Positions in world metres and plate pixels; sprites by key, '<name>_<side>_<grade>' for
     buildings and '<name>_<grade>' for people. */
  function layout(map) {
    const stops = [], lots = {};
    const taken = (f, side, lot) => lots[f + side + lot];
    const take = (f, side, lot, v) => { lots[f + side + lot] = v || true; };
    const byFloor = {};
    map.floors.forEach(row => row.forEach(n => { (byFloor[n.f] = byFloor[n.f] || {})[n.c] = n; }));
    // which columns of each floor something stands in: every stop's own (all of a merged stop's), and any a
    // building crosses to or a duel steps out into, so nothing is put where something already is
    const occ = {};
    const busy = (f, c) => (occ[f] || new Set()).has(c), hold = (f, c) => { (occ[f] = occ[f] || new Set()).add(c); };
    map.floors.forEach(row => row.forEach(n => { const [a, b] = n.span || [n.c, n.c]; for (let c = a; c <= b; c++) hold(n.f, c); }));
    const all = [];
    map.floors.forEach(row => row.forEach(n => all.push(n)));
    const variant = {};
    for (const kind of Object.keys(VARIANTS)) {
      const mine = all.filter(n => n.kind === kind);
      if (kind === 'camp') mine.reverse();
      mine.forEach((n, i) => { variant[n.id] = VARIANTS[kind][i % VARIANTS[kind].length]; });
    }
    let prev = null;                                        // the last people stop drawn, for "no scene twice running"
    for (const n of all) {
      const g = grade(n.f);
      let y = floorY(n.f) + jit(n.id, 1, 2.5);
      // a merged stop (btp-run.js townRules) stands between the columns it covers
      const cpos = n.span ? (n.span[0] + n.span[1]) / 2 : n.c;
      if (BUILDING_KINDS.includes(n.kind)) {
        let side = cpos < 2 ? -1 : cpos > 2 ? 1 : 0, lot = cpos === 0 || cpos === 4 ? 'outer' : 'inner';
        if (!side) {
          // the middle of the road is no place for a hotel: cross to a side with nobody at its edge
          const free = s => !busy(n.f, s < 0 ? 1 : 3) && !taken(n.f, s, 'inner');
          side = free(-1) && free(1) ? (hash(n.id, 2) < 0.5 ? -1 : 1) : free(-1) ? -1 : free(1) ? 1 : -1;
          if (!free(side)) y += STEP / 3;                   // both edges busy: half a block up
        }
        if (lot === 'outer') y += 5;
        take(n.f, side, lot, n.id);
        if (lot === 'inner' && y < floorY(n.f) + STEP / 4) hold(n.f, side < 0 ? 1 : 3);
        const door = [side * DOOR[lot], y], [name, place] = variant[n.id];
        stops.push({ id: n.id, kind: n.kind, f: n.f, c: n.c, at: door, marker: mk(door[0], door[1], 3), place,
                     sprite: { key: name + '_' + (side < 0 ? 'w' : 'e') + '_' + g, at: [door[0] + side * BACK, door[1] + BACK] } });
      } else {
        let c = n.c;
        // high noon belongs on Main Street: a duel drawn in a back lot comes out to the street's edge, or the
        // middle of the road, if nobody else is there
        if (n.kind === 'elite' && (c === 0 || c === 4)) {
          const edge = c === 0 ? 1 : 3;
          if (!busy(n.f, edge)) c = edge; else if (!busy(n.f, 2)) c = 2;
          hold(n.f, c);
        }
        const x = FIG_X[c] + jit(n.id, 3, 1.5);
        if (c === 0 || c === 4) { y += 5; take(n.f, c < 2 ? -1 : 1, 'outer', n.id); }   // people in the back lot: no shop there
        // a duel needs open ground between the two of them: off the middle of the road, it clears the shop row
        if (n.kind === 'elite' && c !== 2) take(n.f, c < 2 ? -1 : 1, 'inner', n.id);
        const pool = n.kind === 'dance' ? CARDS : FIGURE[n.kind];
        let idx = pool ? Math.floor(hash(n.id, 4) * pool.length) : 0;
        // never the same scene twice side by side
        if (pool && prev && prev.f === n.f && prev.kind === n.kind && n.c - prev.c === 1 && prev.idx === idx) idx = (idx + 1) % pool.length;
        prev = { f: n.f, c: n.c, kind: n.kind, idx };
        stops.push({ id: n.id, kind: n.kind, f: n.f, c: n.c, at: [x, y], marker: mk(x, y, 6),
                     sprite: pool ? { key: pool[idx] + '_' + g, at: [x, y + 0.6] } : null });
      }
    }
    // plain shops on every lot no stop took, so Main Street is lined all the way up
    const fillers = [];
    for (let f = 0; f < map.floors.length; f++) for (const side of [-1, 1]) for (const lot of ['inner', 'outer']) {
      if (taken(f, side, lot)) continue;
      const y = floorY(f) + (lot === 'outer' ? 5 : 0) + jit(f + lot + side, 5, 2);
      const door = [side * DOOR[lot], y];
      const name = FILLERS[Math.floor(hash(f + ':' + side + lot, 6) * FILLERS.length)];
      fillers.push({ key: name + '_' + (side < 0 ? 'w' : 'e') + '_' + grade(f), at: [door[0] + side * BACK, door[1] + BACK] });
    }
    const boss = { id: 'boss', kind: 'boss', at: [0, BOSS_Y - 4], marker: mk(0, BOSS_Y - 4, 3) };
    return { stops, fillers, boss };
  }

  const api = { W, H, M, EL, OX, OY, FLOOR0, STEP, BOSS_Y, FIG_X, DOOR, BUILDING_KINDS, FILLERS, CARDS, FIGURE, VARIANTS, BACK, px, floorY, grade, hash, layout,
                COACH: [-3.5, -5], FLOORS: 7 };
  if (node) module.exports = api;
  else root.BtpTown = api;
})(typeof window !== 'undefined' ? window : this);
