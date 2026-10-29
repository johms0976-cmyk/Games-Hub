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
  const LEAN = 12, YAWS = [-24, -18, -12, -6, 0, 6, 12, 18, 24];   // (a stop rests at a LEAN step; the 6s are for a carriage mid-crossover)
  const yawKey = (name, yaw) => name + (yaw > 0 ? '_r' + yaw : yaw < 0 ? '_l' + -yaw : '');
  const dirOf = yaw => [Math.sin(yaw * Math.PI / 180), Math.cos(yaw * Math.PI / 180)];
  function yaws(map, byFloor, col) {
    const ins = {}, outs = {}, yaw = {}, BOSS_C = 2;
    for (const row of map.floors) for (const n of row) {
      if (n.f === 0) (ins[n.id] = ins[n.id] || []).push(0);
      for (const id of n.next) {
        const c = id === 'boss' ? BOSS_C : col[id], d = Math.max(-2, Math.min(2, c - col[n.id]));
        (outs[n.id] = outs[n.id] || []).push(d);
        if (id !== 'boss') (ins[id] = ins[id] || []).push(d);
      }
    }
    const mean = a => a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    for (const row of map.floors) for (const n of row)
      yaw[n.id] = n.kind === 'water' ? 0 : Math.max(-24, Math.min(24, Math.round((mean(ins[n.id]) + mean(outs[n.id])) * LEAN / LEAN) * LEAN));
    // side by side they must clear each other end to end: bring the one leaning harder toward the other until they do
    for (let pass = 0; pass < 8; pass++) for (const row of map.floors) for (const n of row) {
      const m = byFloor[n.f][col[n.id] + 1];
      if (!m || m.kind === 'water' || n.kind === 'water' || !clash(col[n.id], yaw[n.id], col[m.id], yaw[m.id])) continue;
      const k = Math.abs(yaw[n.id]) >= Math.abs(yaw[m.id]) ? n.id : m.id, o = k === n.id ? m.id : n.id;
      yaw[k] += yaw[o] > yaw[k] ? LEAN : yaw[o] < yaw[k] ? -LEAN : -Math.sign(yaw[k]) * LEAN;
    }
    return yaw;
  }
  /* Do carriages on tracks ca < cb, leaning ya and yb, touch? At both ends (the back with its platform), the gap
     between their centre lines must hold half of each one's width across the track (wider as it leans), and a
     little air. */
  const clash = (ca, ya, cb, yb) => clashAt(TRACK_X[ca], ya, TRACK_X[cb], yb);
  // the same for carriages standing anywhere across the line, xa < xb; one passing on a crossover makes do with
  // half the air
  function clashAt(xa, ya, xb, yb, air = 1) {
    const sa = Math.sin(ya * Math.PI / 180), sb = Math.sin(yb * Math.PI / 180);
    // (the body is CAR.w; eaves, outline and shadow make it look about a metre wider, and it wants a metre of air)
    const W2 = (CAR.w + 1) / 2, need = W2 / Math.cos(ya * Math.PI / 180) + W2 / Math.cos(yb * Math.PI / 180) + air;
    return [CAR.len / 2, -(CAR.len / 2 + CAR.platform)].some(e => (xb + sb * e) - (xa + sa * e) < need);
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
     them, the locomotive. Positions in world metres and plate pixels; sprites by key '<name>_<grade>'.
     cols (optional, for show): the track a stop's carriage has crossed over to ({ id: column }, the page's
     trainShuffle); a stop stands on its own column n.c otherwise, and an override onto a track another carriage of
     its stretch stands on is ignored. The map's graph never changes: only where its stops are drawn. */
  function layout(map, cols) {
    const stops = [], at = {}, byFloor = {}, col = {};
    const all = [];
    map.floors.forEach(row => {
      row.forEach(n => { col[n.id] = n.c; });
      if (cols) row.forEach(n => { const o = cols[n.id];
        if (o >= 0 && o <= 4 && !row.some(m => m !== n && col[m.id] === o)) col[n.id] = o; });
      row.forEach(n => { all.push(n); (byFloor[n.f] = byFloor[n.f] || {})[col[n.id]] = n; });
    });
    const count = {}, yaw = yaws(map, byFloor, col);
    let prev = null;
    for (const n of all) {
      const x = TRACK_X[col[n.id]], y = floorY(n.f) + (hash(n.id, 1) * 2 - 1) * 1.5;
      const pool = CARS[n.kind] || ['smoker'];
      let idx = (count[n.kind] = (count[n.kind] || 0) + 1) - 1;
      idx %= pool.length;
      if (prev && prev.f === n.f && prev.kind === n.kind && n.c - prev.c === 1 && prev.idx === idx && pool.length > 1) idx = (idx + 1) % pool.length;
      prev = { f: n.f, c: n.c, kind: n.kind, idx };
      const name = pool[idx];
      const yw = yaw[n.id], [dx, dy] = dirOf(yw), half = CAR.len / 2;
      const s = { id: n.id, kind: n.kind, f: n.f, c: col[n.id], at: [x, y], yaw: yw, dir: [dx, dy], name, rear: [x - dx * half, y - dy * half], front: [x + dx * half, y + dy * half], place: PLACE[name] };
      if (n.kind === 'water') {
        // a halt beside the track: the tower stands on the side with no carriage next to it (the outside at the edges)
        const free = d => col[n.id] + d < 0 || col[n.id] + d > 4 || !byFloor[n.f][col[n.id] + d];
        const side = col[n.id] === 0 ? -1 : col[n.id] === 4 ? 1 : free(1) && !free(-1) ? 1 : free(-1) && !free(1) ? -1 : (hash(n.id, 2) < 0.5 ? -1 : 1);
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

  /* A crossover (2026-10-29, the user's: "the train tracks change and then the carriages follow along on them, but
     curve when the tracks change and are straight when the tracks are straight"). An S of track from the carriage's
     own track to the free one beside it is laid ahead of it, on the ground, so it streams down the map with the
     ground; the carriage runs onto it. Its two bogies (BOGIE of the way from its middle to each end) each sit on the
     track where they are, so the carriage stands across the S at the angle between them: straight while the S is
     still ahead, swinging over as it passes under, straight again on the new track once it is behind. Its own lean
     into the ways in and on (yaws()) blends from the old layout's to the new's as it crosses. A and B: the layouts
     before and after (layout(map, cols) with the stop's column changed); id: the stop crossing. pose(s): where the
     carriage is when the ground has slid s metres (0 .. end), as a stop in layout() is (at, yaw, dir, rear, front,
     marker, its sprite's key); track(s): the S's centre line in world metres, with a stub of straight track at each
     end. Only stretches the page can see are drawn: SHOW metres either side of the carriage's middle. */
  const XOVER = 40, BOGIE = 0.7, SHOW = 28;
  const snapYaw = v => YAWS.reduce((b, y) => Math.abs(y - v) < Math.abs(b - v) ? y : b, 0);
  function crossover(A, B, id) {
    const a = A.stops.find(s => s.id === id), b = B.stops.find(s => s.id === id);
    const xa = a.at[0], xb = b.at[0], y = a.at[1], half = CAR.len / 2, bog = half * BOGIE, top = y + SHOW;
    const ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const xAt = (y0, yy) => xa + (xb - xa) * ss((yy - y0) / XOVER);
    function pose(s) {
      const y0 = top - s, xf = xAt(y0, y + bog), xr = xAt(y0, y - bog), x = (xf + xr) / 2, p = (x - xa) / (xb - xa);
      const yaw = Math.max(-24, Math.min(24, snapYaw(Math.atan2(xf - xr, 2 * bog) * 180 / Math.PI + a.yaw + (b.yaw - a.yaw) * p)));
      const [dx, dy] = dirOf(yaw), back = half + CAR.platform * 0.5;
      return { at: [x, y], yaw, dir: [dx, dy], rear: [x - dx * half, y - dy * half], front: [x + dx * half, y + dy * half],
               marker: mk(x - dx * back, y - dy * back, 3), key: yawKey(a.name, yaw) + '_' + grade(a.f) };
    }
    // clear: it never touches a carriage of its stretch on the way across (ws: every one of them, as they stand)
    const ws = B.stops.filter(o => o.f === a.f && o.id !== id && o.kind !== 'water');
    let clear = true;
    for (let s = 0; s <= 2 * SHOW + XOVER && clear; s += 1) { const p = pose(s);
      clear = ws.every(o => !(o.at[0] < p.at[0] ? clashAt(o.at[0], o.yaw, p.at[0], p.yaw, 0.5) : clashAt(p.at[0], p.yaw, o.at[0], o.yaw, 0.5))); }
    const track = s => { const y0 = top - s; return Array.from({ length: 21 }, (_, i) => { const yy = y0 - 6 + (XOVER + 12) * i / 20; return [xAt(y0, yy), yy]; }); };
    return { a, b, clear, end: 2 * SHOW + XOVER, show: [y - SHOW, y + SHOW], pose, track };
  }

  const api = { W, H, M, EL, OX, OY, TRACK, TRACK_X, CAR, DEPOT_Y, BOSS_Y, GAUGE, PERIOD, BANDS, CARS, PLACE, LEAN, YAWS, XOVER, yawKey, dirOf, snapYaw, railCurve, clash, crossover, px, floorY, grade, layout, FLOORS: 7 };
  if (node) module.exports = api;
  else root.BtpTrain = api;
})(typeof window !== 'undefined' ? window : this);
