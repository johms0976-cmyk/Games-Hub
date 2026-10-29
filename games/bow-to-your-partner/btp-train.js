/* The Westbound Express, Act II's map (2026-10-29): the line runs up the map from the depot to the locomotive.
   The paths are the rails: five tracks side by side, and a way from one stop to the next is the rail between
   them (a crossover when it changes track). Every stop is a carriage standing on its track, dressed for what
   happens there (a smoking car, a flatcar with a card table, a duel on a boxcar's roof, a sleeper, the express
   car being robbed), or a water tower beside the track. The page draws the rails and the markers from this,
   and bakery/train.py bakes the plate and the carriages from it (via `node bakery/layout.js`), so the two never
   drift apart.

   Dustwater's camera and plate exactly (btp-town.js: the same W x H, M metres a pixel, EL degrees, px()), so a
   train sprite and a town sprite are the same size of thing. World: metres; x across the line (0 = the middle
   track), y up it. The map's graph (btp-run.js genMap) is untouched: floor f is a stretch of line, column c a
   track. Cars are chibi like the townsfolk: TRACK m apart, CAR.w wide, a body CAR.len long whose rear end (the
   platform, facing you) carries the marker. */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const T = node ? require('./btp-town.js') : root.BtpTown;
  const { W, H, M, EL, OX, OY, px, floorY, grade, hash } = T;
  const TRACK = 10, TRACK_X = [-20, -10, 0, 10, 20];
  const CAR = { w: 7, len: 20, platform: 2.4 };              // body ±len/2 about the car's centre; the platform behind it
  const DEPOT_Y = -6, BOSS_Y = 306;                         // where every first track starts; the tender's back
  const GAUGE = 3.2;                                        // chibi rails, so they read at this size
  /* What a stop's carriage is, by kind; repeats of a kind alternate, and no two the same side by side. */
  const CARS = { dance: ['smoker', 'flatcards', 'smoker2'], elite: ['roofduel', 'roofduel2'], event: ['parlor', 'parlor2'],
                 camp: ['sleeper', 'sleeper2'], store: ['candy'], raffle: ['observe', 'observe2'], bank: ['express'], water: ['tower'] };
  const PLACE = { smoker: 'The smoking car', smoker2: 'The smoking car', flatcards: 'A flatcar game', roofduel: 'On the boxcar roof', roofduel2: 'On the carriage roof',
                  parlor: 'The parlour car', parlor2: 'The ladies’ car', sleeper: 'The sleeper car', sleeper2: 'The Pullman', candy: 'The candy butcher’s cart',
                  observe: 'The observation car', observe2: 'The observation car', express: 'The express car', tower: 'The water tower' };
  const mk = (x, y, d) => { const p = px(x, y); return [p[0], p[1] + d]; };

  /* Everything the map shows: stops (marker, rails under it, the carriage that dresses it), the rails between
     them, the locomotive. Positions in world metres and plate pixels; sprites by key '<name>_<grade>'. */
  function layout(map) {
    const stops = [], at = {}, byFloor = {};
    const all = [];
    map.floors.forEach(row => row.forEach(n => { all.push(n); (byFloor[n.f] = byFloor[n.f] || {})[n.c] = n; }));
    const count = {};
    let prev = null;
    for (const n of all) {
      const x = TRACK_X[n.c], y = floorY(n.f) + (hash(n.id, 1) * 2 - 1) * 1.5;
      const pool = CARS[n.kind] || ['smoker'];
      let idx = (count[n.kind] = (count[n.kind] || 0) + 1) - 1;
      idx %= pool.length;
      if (prev && prev.f === n.f && prev.kind === n.kind && n.c - prev.c === 1 && prev.idx === idx && pool.length > 1) idx = (idx + 1) % pool.length;
      prev = { f: n.f, c: n.c, kind: n.kind, idx };
      const name = pool[idx];
      const s = { id: n.id, kind: n.kind, f: n.f, c: n.c, at: [x, y], rear: [x, y - CAR.len / 2], front: [x, y + CAR.len / 2], place: PLACE[name] };
      if (n.kind === 'water') {
        // a halt beside the track: the tower stands on the side with no carriage next to it (the outside at the edges)
        const free = d => n.c + d < 0 || n.c + d > 4 || !byFloor[n.f][n.c + d];
        const side = n.c === 0 ? -1 : n.c === 4 ? 1 : free(1) && !free(-1) ? 1 : free(-1) && !free(1) ? -1 : (hash(n.id, 2) < 0.5 ? -1 : 1);
        // carriages both sides: the tower stands up the line, in the gap before the next stretch
        const up = free(side) ? 0 : CAR.len / 2 + 6;
        s.marker = mk(x, y - 4, 3);
        s.sprite = { key: name + '_' + (side < 0 ? 'w' : 'e') + '_' + grade(n.f), at: [x + side * 5.2, y + up] };
      } else {
        s.marker = mk(x, y - CAR.len / 2 - CAR.platform * 0.5, 3);
        s.sprite = { key: name + '_' + grade(n.f), at: [x, y] };
      }
      stops.push(s);
      at[n.id] = s;
    }
    // the rails: from the depot up each first track, under every stop, and every way on from it
    const rails = [];
    for (const s of stops) {
      if (s.f === 0) rails.push({ from: null, to: s.id, a: [s.at[0], DEPOT_Y], b: s.rear });
      rails.push({ from: s.id, to: s.id, a: s.rear, b: s.front, under: true });
    }
    const boss = { id: 'boss', kind: 'boss', at: [0, BOSS_Y], marker: mk(0, BOSS_Y - 2, 3) };
    for (const s of stops) for (const id of (map.floors[s.f].find(n => n.id === s.id) || {}).next || [])
      rails.push({ from: s.id, to: id, a: s.front, b: id === 'boss' ? [0, BOSS_Y - 4] : at[id].rear });
    return { stops, rails, boss };
  }

  const api = { W, H, M, EL, OX, OY, TRACK, TRACK_X, CAR, DEPOT_Y, BOSS_Y, GAUGE, CARS, PLACE, px, floorY, grade, layout, FLOORS: 7 };
  if (node) module.exports = api;
  else root.BtpTrain = api;
})(typeof window !== 'undefined' ? window : this);
