/* music/westbound.js: "Westbound", the opening credits. A steam train across the open plains: freedom, the
 * unknown ahead, the eagle overhead, the buffalo alongside. The Partner theme in the Ride Out (epic) setting, with
 * The Long Draw's twang gallop, and a locomotive for a rhythm section. Original music.
 *
 * Bars 0-3   Dawn on the plains   open fifths, an eagle cries, a whistle far off
 * Bars 4-7   Steam up             the chuffs start slow and gather speed, bell, two toots, horns call
 * Bars 8-15  Westbound (A)        the theme on horns over chuffs, rail clacks and the gallop       <- loop
 * Bars 16-23 The eagle (B)        violins and whistle soar with the answer
 * Bars 24-27 Buffalo              a stampede on the floor drums under a modal brass call, whistle blast home
 */
(function () {
'use strict';
const M = DPMusic, T = M.theme;

M.add({
  id: 'westbound', title: 'Westbound', style: 'Opening credits · steam & plains',
  blurb: 'Dawn on the open plains: an eagle cries and a whistle sounds far off. The engine steams up and gathers speed, and the Partner theme rides the rails on the horns. The violins soar with the eagle, then the buffalo stampede and the whistle calls it home.',
  bpm: 120, bars: 28, loopFrom: 8,
  sections: [[0, 'Dawn on the plains'], [4, 'Steam up'], [8, 'Westbound'], [16, 'The eagle'], [24, 'Buffalo']],
  build(S) {
    const key = 'D4', mel = tok => M.deg(tok, key, 'major'), hi = tok => M.deg(tok, 'D5', 'major'), top = tok => M.deg(tok, 'D6', 'major');
    const ch = [
      ...T.segs('I5:32 IV:16 I:16 I:32 IV:16 V:16', 0),
      ...T.segs(T.PROG.major.A, 128), ...T.segs(T.PROG.major.B, 256),
      ...T.segs('bVI:16 | bVII:16 | bVI:8 bVII:8 | V:16', 384),
    ];
    const cry = (t, from, to, d, v) => S.note('whistle', t, from, d, v, { to });

    /* --- dawn --- */
    for (const c of ch) if (c.t < 64) T.voicing(c.sym, key, 50).forEach(n => S.note('strings', c.t, n, c.d, 0.5));
    S.note('strings', 0, 74, 64, 0.28); S.note('strings', 0, 81, 64, 0.25);
    S.note('choir', 0, 62, 64, 0.35); S.note('choir', 0, 69, 64, 0.3);
    cry(8, 93, 86, 6, 0.8);
    S.note('steam', 20, 69, 10, 0.4, { doppler: true, pan: 0.6 });            // far off
    for (const c of ch) if (c.t >= 32 && c.t < 64) {                          // the guitar opens out
      const v = T.voicing(c.sym, key, 55), up = [v[0], v[1], v[2], v[0] + 12, v[2], v[1]];
      for (let i = 0; i < 8; i++) S.note('guitar', c.t + i * 2, up[i % 6], 2, 0.5, { ring: 0.3 });
    }
    cry(40, 88, 95, 3, 0.6); cry(43, 95, 86, 7, 0.8);
    S.note('steam', 52, 69, 6, 0.65, { doppler: true, pan: 0.4 });            // nearer

    /* --- steam up: the chuffs start slow and gather speed --- */
    let t = 64, gap = 8, k = 0;
    while (t < 128) { S.note('chuff', t, 60, 1, gap > 4 ? 1 : k % 4 === 0 ? 0.9 : 0.5); t += gap; gap = Math.max(2, gap * 0.86); k++; }
    S.note('steam', 64, 69, 8, 1);
    S.note('steam', 80, 69, 1.5, 0.85); S.note('steam', 83, 69, 1.5, 0.85);    // two toots: proceeding
    for (let b = 64; b < 96; b += 4) S.note('bell', b, 81, 1, 0.4);
    S.note('timp', 64, 38, 1, 0.7);
    S.line('horns', 96, '5,:2 1:2 4:2 6:10 | 5:4 6:2 5:2 3:4 2:4', mel, 1);
    for (let r = 112; r < 128; r++) S.note('timp', r, 45, 1, 0.15 + 0.35 * (r - 112) / 16);

    /* --- the train's rhythm section, from bar 6 to the end --- */
    for (let u = 96; u < 448; u += 2) {                                       // the Ride Out ostinato, 3+3+2
      const i = (u % 16) / 2, acc = i === 0 || i === 3 || i === 6, sym = T.at(ch, u), r = T.rootAt(sym, key, 45), f = T.fifthOf(sym, key, r);
      const swell = u < 128 ? 0.4 + 0.6 * (u - 96) / 32 : 1;
      S.note('strings', u, [r, r, f, r, r, f, r + 12, f][i], 1.6, (acc ? 0.9 : 0.45) * swell);
    }
    for (let u = 128; u < 448; u += 2) {
      if (u >= 384 && u < 432) continue;                                       // the buffalo drown the engine out
      S.note('chuff', u, 60, 1, (u % 4 === 0 ? 0.75 : 0.4) * (u >= 256 && u < 384 ? 0.75 : 1));
    }
    for (let b = 96; b < 448; b += 16) { S.note('clack', b + 6, 60, 1, 0.7); S.note('clack', b + 14, 60, 1, 0.6); }
    for (let u = 128; u < 384; u += 8) {                                       // The Long Draw's gallop, beats 1 and 3
      const sym = T.at(ch, u), r = T.rootAt(sym, key, 40);
      S.note('twang', u, r, 2, 0.55, { ring: 0.04 }); S.note('twang', u + 2, r, 1, 0.3, { ring: 0.03 }); S.note('twang', u + 3, r, 1, 0.35, { ring: 0.03 });
      S.note('bass', u, u % 16 === 0 ? r : T.fifthOf(sym, key, r) - 12, 6, 0.85);
    }

    /* --- A: westbound --- */
    S.note('crash', 128, 60, 1, 0.85);
    S.line('horns', 128, T.THEME.A, mel, 1.1);
    for (const c of ch) if (c.t >= 128 && c.t < 256) T.voicing(c.sym, key, 62).forEach(n => S.note('strings', c.t, n, c.d, 0.3));
    S.line('whistle', 180, "5:2 6:2 ^7:2 2':6", hi, 0.75);                   // answers the held note
    cry(244, 93, 86, 8, 0.75);
    for (let b = 128; b < 384; b += 16) S.note('timp', b, T.rootAt(T.at(ch, b), key, 38), 1, 0.3);

    /* --- B: the eagle --- */
    S.note('crash', 256, 60, 1, 0.9);
    S.line('strings', 256, T.THEME.B, hi, 1.5);
    S.line('whistle', 256, T.THEME.B, top, 0.45);
    for (const c of ch) if (c.t >= 256 && c.t < 384) T.voicing(c.sym, key, 57).forEach(n => S.note('horns', c.t, n, c.d, 0.3));
    cry(308, 95, 88, 8, 0.7);
    S.line('trumpet', 320, T.bars(T.THEME.B, 4), hi, 0.6);
    for (let u = 256; u < 384; u++) { const p = u % 16; if (p === 0 || p === 6 || p === 12) S.note('snare', u, 60, 1, 0.5); else if (p % 2 === 0) S.note('snare', u, 60, 1, 0.18); }

    /* --- buffalo --- */
    S.note('crash', 384, 60, 1, 1);
    const herd = 'X.x.X.xxX.x.X.xx';
    for (let u = 384; u < 448; u++) { const c = herd[u % 16], grow = 0.7 + 0.3 * (u - 384) / 64; if (c !== '.') S.note('stomp', u, 60, 1, (c === 'X' ? 1 : 0.55) * grow); }
    for (const c of ch) if (c.t >= 384) {
      for (const p of [0, 6, 12]) if (p < c.d) T.voicing(c.sym, key, 50).forEach(n => S.note('horns', c.t + p, n, 3, 0.95));
      T.voicing(c.sym, key, 62).forEach(n => S.note('choir', c.t, n, c.d, 0.7));
    }
    S.line('trumpet', 384, 'D5:6 F5:2 F5:8 | E5:6 G5:2 G5:8 | F5:4 E5:4 D5:4 C5:4 | C#5:16', null, 1);
    cry(416, 93, 86, 8, 0.8);
    for (let r = 432; r < 448; r++) S.note('timp', r, 45, 1, 0.15 + 0.35 * (r - 432) / 16);
    S.note('steam', 432, 69, 8, 1);                                           // the whistle calls it home
    for (let u = 432; u < 448; u += 2) S.note('chuff', u, 60, 1, u % 4 === 0 ? 0.8 : 0.45);
  },
});
})();
