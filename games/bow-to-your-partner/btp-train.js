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
  /* The ground streams past (2026-10-29, the user's: the illusion of the train moving). Three strips of land, each a
     tile PERIOD metres long that repeats up the line and scrolls down the map: [name, from y, to y, time of day].
     The depot, the locomotive and the mountains stay put. */
  const PERIOD = 60;
  const BANDS = [['desert', -2, 124, 'm'], ['rock', 124, 212, 'n'], ['canyon', 212, 340, 'd']];
  /* What a stop's carriage is, by kind; repeats of a kind alternate, and no two the same side by side. */
  const CARS = { dance: ['smoker', 'flatcards', 'smoker2'], elite: ['roofduel', 'roofduel2'], event: ['parlor', 'parlor2'],
                 camp: ['sleeper', 'sleeper2'], store: ['candy'], raffle: ['observe', 'observe2'], bank: ['express'], water: ['tower'] };
  const PLACE = { smoker: 'The smoking car', smoker2: 'The smoking car', flatcards: 'A flatcar game', roofduel: 'On the boxcar roof', roofduel2: 'On the carriage roof',
                  parlor: 'The parlour car', parlor2: 'The ladies’ car', sleeper: 'The sleeper car', sleeper2: 'The Pullman', candy: 'The candy butcher’s cart',
                  observe: 'The observation car', observe2: 'The observation car', express: 'The express car', tower: 'The water tower' };
  const mk = (x, y, d) => { const p = px(x, y); return [p[0], p[1] + d]; };
  /* The carriages lean into their track (2026-10-29, the user's: "the track curves around the train"). A carriage's
     yaw (degrees, its front turned toward +x) is what its track does through it: LEAN for each column the ways in
     move it on average, and the same for the ways on, so a carriage on a diagonal run leans 2 x LEAN and one on a
     single crossover LEAN. Baked at every YAWS angle (train.py); the rails leave and meet each carriage along its
     own line, as curves (trainBox). Two carriages side by side never lean more than LEAN apart, so they never
     touch. yawKey: a sprite's name at its yaw ('smoker_r12', 'flatcards_l24'). */
  const LEAN = 12, YAWS = [-24, -12, 0, 12, 24];
  const yawKey = (name, yaw) => name + (yaw > 0 ? '_r' + yaw : yaw < 0 ? '_l' + -yaw : '');
  const dirOf = yaw => [Math.sin(yaw * Math.PI / 180), Math.cos(yaw * Math.PI / 180)];
  function yaws(map, byFloor) {
    const ins = {}, outs = {}, yaw = {}, BOSS_C = 2;
    for (const row of map.floors) for (const n of row) {
      if (n.f === 0) (ins[n.id] = ins[n.id] || []).push(0);
      for (const id of n.next) {
        const c = id === 'boss' ? BOSS_C : +id.split(':')[1], d = Math.max(-2, Math.min(2, c - n.c));
        (outs[n.id] = outs[n.id] || []).push(d);
        if (id !== 'boss') (ins[id] = ins[id] || []).push(d);
      }
    }
    const mean = a => a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    for (const row of map.floors) for (const n of row)
      yaw[n.id] = n.kind === 'water' ? 0 : Math.max(-24, Math.min(24, Math.round((mean(ins[n.id]) + mean(outs[n.id])) * LEAN / LEAN) * LEAN));
    // side by side they must clear each other end to end: bring the one leaning harder toward the other until they do
    for (let pass = 0; pass < 8; pass++) for (const row of map.floors) for (const n of row) {
      const m = byFloor[n.f][n.c + 1];
      if (!m || m.kind === 'water' || n.kind === 'water' || !clash(n.c, yaw[n.id], m.c, yaw[m.id])) continue;
      const k = Math.abs(yaw[n.id]) >= Math.abs(yaw[m.id]) ? n.id : m.id, o = k === n.id ? m.id : n.id;
      yaw[k] += yaw[o] > yaw[k] ? LEAN : yaw[o] < yaw[k] ? -LEAN : -Math.sign(yaw[k]) * LEAN;
    }
    return yaw;
  }
  /* Do carriages on tracks ca < cb, leaning ya and yb, touch? At both ends (the back with its platform), the gap
     between their centre lines must hold half of each one's width across the track (wider as it leans), and a
     little air. */
  function clash(ca, ya, cb, yb) {
    const sa = Math.sin(ya * Math.PI / 180), sb = Math.sin(yb * Math.PI / 180);
    // (the body is CAR.w; eaves, outline and shadow make it look about a metre wider, and it wants a metre of air)
    const W2 = (CAR.w + 1) / 2, need = W2 / Math.cos(ya * Math.PI / 180) + W2 / Math.cos(yb * Math.PI / 180) + 1;
    return [CAR.len / 2, -(CAR.len / 2 + CAR.platform)].some(e => (TRACK_X[cb] + sb * e) - (TRACK_X[ca] + sa * e) < need);
  }

  /* A rail as a curve, in world metres: from a along ta, into b along tb, shifted `off` metres to its left (a rail
     of the pair). Returns the cubic's four points; px() is affine, so the plate's curve is the same four points
     projected. */
  function railCurve(r, off) {
    const k = 0.42 * Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), na = [-r.ta[1], r.ta[0]], nb = [-r.tb[1], r.tb[0]], o = off || 0;
    return [[r.a[0] + na[0] * o, r.a[1] + na[1] * o], [r.a[0] + r.ta[0] * k + na[0] * o, r.a[1] + r.ta[1] * k + na[1] * o],
            [r.b[0] - r.tb[0] * k + nb[0] * o, r.b[1] - r.tb[1] * k + nb[1] * o], [r.b[0] + nb[0] * o, r.b[1] + nb[1] * o]];
  }
  /* Everything the map shows: stops (marker, rails under it, the carriage that dresses it), the rails between
     them, the locomotive. Positions in world metres and plate pixels; sprites by key '<name>_<grade>'. */
  function layout(map) {
    const stops = [], at = {}, byFloor = {};
    const all = [];
    map.floors.forEach(row => row.forEach(n => { all.push(n); (byFloor[n.f] = byFloor[n.f] || {})[n.c] = n; }));
    const count = {}, yaw = yaws(map, byFloor);
    let prev = null;
    for (const n of all) {
      const x = TRACK_X[n.c], y = floorY(n.f) + (hash(n.id, 1) * 2 - 1) * 1.5;
      const pool = CARS[n.kind] || ['smoker'];
      let idx = (count[n.kind] = (count[n.kind] || 0) + 1) - 1;
      idx %= pool.length;
      if (prev && prev.f === n.f && prev.kind === n.kind && n.c - prev.c === 1 && prev.idx === idx && pool.length > 1) idx = (idx + 1) % pool.length;
      prev = { f: n.f, c: n.c, kind: n.kind, idx };
      const name = pool[idx];
      const yw = yaw[n.id], [dx, dy] = dirOf(yw), half = CAR.len / 2;
      const s = { id: n.id, kind: n.kind, f: n.f, c: n.c, at: [x, y], yaw: yw, dir: [dx, dy], name, rear: [x - dx * half, y - dy * half], front: [x + dx * half, y + dy * half], place: PLACE[name] };
      if (n.kind === 'water') {
        // a halt beside the track: the tower stands on the side with no carriage next to it (the outside at the edges)
        const free = d => n.c + d < 0 || n.c + d > 4 || !byFloor[n.f][n.c + d];
        const side = n.c === 0 ? -1 : n.c === 4 ? 1 : free(1) && !free(-1) ? 1 : free(-1) && !free(1) ? -1 : (hash(n.id, 2) < 0.5 ? -1 : 1);
        // carriages both sides: the tower stands up the line, in the gap before the next stretch
        const up = free(side) ? 0 : CAR.len / 2 + 6;
        s.marker = mk(x, y - 4, 3);
        s.sprite = { key: name + '_' + (side < 0 ? 'w' : 'e') + '_' + grade(n.f), at: [x + side * 5.2, y + up] };
      } else {
        const back = half + CAR.platform * 0.5;
        s.marker = mk(x - dx * back, y - dy * back, 3);
        s.sprite = { key: yawKey(name, yw) + '_' + grade(n.f), at: [x, y] };
      }
      stops.push(s);
      at[n.id] = s;
    }
    // the rails: from the depot up each first track, under every stop, and every way on from it
    const rails = [];
    for (const s of stops) {
      // ta, tb: the rail's direction where it leaves a and where it meets b (straight up at the depot and the tender)
      if (s.f === 0) rails.push({ from: null, to: s.id, a: [s.at[0], DEPOT_Y], b: s.rear, ta: [0, 1], tb: s.dir });
      rails.push({ from: s.id, to: s.id, a: s.rear, b: s.front, ta: s.dir, tb: s.dir, under: true });
    }
    const boss = { id: 'boss', kind: 'boss', at: [0, BOSS_Y], marker: mk(0, BOSS_Y - 2, 3) };
    for (const s of stops) for (const id of (map.floors[s.f].find(n => n.id === s.id) || {}).next || [])
      rails.push({ from: s.id, to: id, a: s.front, b: id === 'boss' ? [0, BOSS_Y - 4] : at[id].rear, ta: s.dir, tb: id === 'boss' ? [0, 1] : at[id].dir });
    return { stops, rails, boss };
  }

  const api = { W, H, M, EL, OX, OY, TRACK, TRACK_X, CAR, DEPOT_Y, BOSS_Y, GAUGE, PERIOD, BANDS, CARS, PLACE, LEAN, YAWS, yawKey, dirOf, railCurve, clash, px, floorY, grade, layout, FLOORS: 7 };
  if (node) module.exports = api;
  else root.BtpTrain = api;
})(typeof window !== 'undefined' ? window : this);
