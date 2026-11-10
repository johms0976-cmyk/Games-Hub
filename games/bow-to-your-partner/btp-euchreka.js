/* Euchre-ka!, Act I's map, in the opening's and the cards' look (2026-11-09: the film crew's concept C, the user's
   pick; docs/film-crew/round2/map-concepts/). One phone wide, every stop in view across it (the user: "like the
   Inscryption map"), scrolling up only. bakery/euchreka_px.py bakes the fixed plate (the opening's sky, the Saloon
   and the Twins, the street, the stockade, the siege camp outside it) and the sprites; this places the rest from the
   run's own map:
     - each of the generator's rows is ONE line of stops along the shop fronts, its five columns five lanes across;
     - a shop at each side of every row: a shop stop (the hotel, the store, the bank) takes its column's side, and the
       other sides a backdrop that fits the row (the CARDS hall, the BARBER, the GOLD office), never twice running,
       or a plain house;
     - every gang stands at its stop as their portraits (the generator's foe.look), behind a prop that suits them; a
       duel is its pair face to face; a mystery stop its gang in silhouette; gossip the bench; the gold strike the
       prospectors at work;
     - the Sheriff and Pettibone at the gate, and a watchtower each side of it (2026-11-10: sprites, so whoever stands
       inside the stockade is drawn behind them).
   Art pixels throughout: x across (0 at the left), y down the plate, a sprite placed by its ground point. */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  // the same numbers as bakery/euchreka_px.py's GEO (tests/page.js checks them against art/euchreka/sprites.js)
  const GEO = { W: 187, SKY: 70, BOSS: 150, FS: 132, GATE: 440, FLOORS: 7, LANES: [24, 59, 94, 129, 164], ROAD: [80, 108] };
  GEO.H = GEO.SKY + GEO.BOSS + GEO.FLOORS * GEO.FS + GEO.GATE;
  GEO.GATE_Y = GEO.H - GEO.GATE + 100;                     // the stockade's ground line
  GEO.START = [94, GEO.GATE_Y - 46];                        // just inside the gate, clear of its sign
  /* The gate scene's marks (2026-11-10: scenes/gate.js plays on this map), a person's or a rider's ground point each.
     The Sheriff and Pettibone stand at `sher` and `pet` on the map too, so the scene's last frame is the map. `sign`
     is the gate's sign as the plate draws it: the page lays it over the plate again so riders pass behind it. */
  const gy = GEO.GATE_Y;
  const MARKS = { gy, foot: GEO.H, sher: [128, gy + 24], pet: [62, gy + 26], block: [94, gy + 12], talk: [124, gy + 40], stamp: [117, gy + 60],
    halt: [94, gy + 56], pal: [96, gy + 90], start: GEO.START, palStart: [GEO.START[0] - 24, GEO.START[1] - 7.5],
    lookout: [20, gy + 166], sleeper: [34, gy + 150], sign: { x: 63, y: gy - 38, w: 60, h: 40, z: gy + 2 },
    // the gate's watchtowers: clear of the road, the sign, the lanes' markers above and your partner standing inside
    towers: [{ key: 'sg_tower_l', x: 36, y: gy + 2 }, { key: 'sg_tower_r', x: 151, y: gy + 2 }] };
  const SHOPS = { camp: ['camp', 'The hotel'], store: ['store', 'The general store'], bank: ['bank', 'The bank of Euchre-ka!'] };
  const BACKDROP = { dance: 'dance', event: 'event', raffle: 'raffle' };
  const PLAIN = ['house1', 'house3', 'store2', 'house2', 'camp2'];
  const rowY = f => GEO.H - GEO.GATE - f * GEO.FS;           // a row's front line: the stops stand along it
  const laneX = n => { const [a, b] = n.span || [n.c, n.c]; return (GEO.LANES[a] + GEO.LANES[b]) / 2; };
  // what a gang stands behind, by who they are
  function propFor(name) {
    const n = String(name || '').toLowerCase();
    if (/miller|blacksmith/.test(n)) return 'p_sacks';
    if (/prospector/.test(n)) return 'p_gold';
    if (/drifter|mule|saddle|thie/.test(n)) return 'p_fire';
    if (/barber|widow/.test(n)) return 'p_barrel';
    return 'p_cards';
  }
  const look = n => (n.foe && n.foe.look ? n.foe.look : ['gJcp1', 'gJcp2']).map(k => k.replace(/^g/, ''));

  function layout(map) {
    const stops = [], shops = [];
    let flavI = 0, plainI = 0, last = new Set();
    map.floors.forEach((row, f) => {
      const Y = rowY(f), sides = {};
      for (const n of row) {
        if (!SHOPS[n.kind]) continue;
        const cpos = n.span ? (n.span[0] + n.span[1]) / 2 : n.c;
        let want = cpos <= 2 ? 0 : 1;
        if (want in sides) want = 1 - want;
        if (!(want in sides)) sides[want] = SHOPS[n.kind][0];
      }
      const flav = row.filter(n => BACKDROP[n.kind]).map(n => BACKDROP[n.kind]);
      if (!flav.length) flav.push('house1');
      for (const side of [0, 1]) {
        if (!(side in sides)) {
          let pick = flav[flavI++ % flav.length];
          if (Object.values(sides).includes(pick) || last.has(pick)) pick = PLAIN[plainI++ % PLAIN.length];
          sides[side] = pick;
        }
        shops.push({ key: sides[side], x: side ? GEO.W - 34 : 34, y: Y - 16 });
      }
      last = new Set(Object.values(sides));
      for (const n of row) {
        const x = laneX(n), draws = [];
        if (n.kind === 'dance' || n.kind === 'mystery') {
          const [a, b] = look(n), cls = n.kind === 'mystery' ? 'sil' : '';
          draws.push({ key: 'm_' + a, x: x - 8, y: Y - 3, cls }, { key: 'm_' + b, x: x + 8, y: Y - 4, cls },
                     { key: propFor(n.foe && n.foe.name), x, y: Y + 2, cls });
        } else if (n.kind === 'elite') {
          const [a, b] = look(n);
          draws.push({ key: 'mr_' + a, x: x - 13, y: Y - 2 }, { key: 'ml_' + b, x: x + 13, y: Y - 2 });
        } else if (n.kind === 'event') draws.push({ key: 'gossip', x, y: Y + 1 });
        else if (n.kind === 'raffle') draws.push({ key: n.c % 2 ? 'strike' : 'strike2', x, y: Y + 1 });
        stops.push({ id: n.id, kind: n.kind, f, c: n.c, marker: [x, Y + 10], place: SHOPS[n.kind] ? SHOPS[n.kind][1] : null, draws });
      }
    });
    const by = GEO.SKY + GEO.BOSS - 30;                     // the Saloon's front (baked into the plate)
    const boss = { id: 'boss', kind: 'boss', marker: [GEO.W / 2, by + 32] };
    const decor = [{ key: 'm_Ksher', x: MARKS.sher[0], y: MARKS.sher[1] }, { key: 'm_Jpet', x: MARKS.pet[0], y: MARKS.pet[1] }];
    return { stops, shops, boss, decor, towers: MARKS.towers, start: GEO.START };
  }

  const api = { GEO, MARKS, SHOPS, BACKDROP, PLAIN, rowY, laneX, propFor, layout };
  if (node) module.exports = api;
  else root.BtpEuchreka = api;
})(typeof window !== 'undefined' ? window : this);
