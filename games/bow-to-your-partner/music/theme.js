/* music/theme.js: the Partner theme, one original tune in three treatments, so the user can pick the score's
 * direction by ear. Written in scale degrees, so the same melody sits in G major (folk), A minor (spaghetti) and
 * D major (epic). Original music: it quotes no existing score (see docs/music/CUE-SHEET.md, "Originality").
 */
(function () {
'use strict';
const M = DPMusic;

// The Partner theme. A is the call: a rising fifth, the open prairie. B is the answer: it climbs from the third
// and comes home. Bars are 16 sixteenths. '^7' is the leading tone in every mode.
const THEME = {
  A: '1:6 5:2 5:8 | 4:2 3:2 2:2 3:2 1:8 | 1:6 5:2 7:4 6:4 | 5:16 | 6:6 5:2 4:4 3:4 | 4:6 3:2 2:4 7,:4 | 1:4 3:4 2:4 ^7,:4 | 1:16',
  B: "3:6 7:2 7:8 | 1':4 7:4 5:4 3:4 | 4:6 5:2 6:4 1':4 | 7:16 | 5:6 6:2 5:4 4:4 | 3:6 4:2 3:4 2:4 | 1:4 5:4 4:4 2:4 | 1:16",
};
const PROG = {
  major: { A: 'I:16 | IV:8 I:8 | I:8 V:4 vi:4 | V:16 | IV:8 I:8 | ii:8 V:8 | I:8 V:8 | I:16',
           B: 'iii:16 | I:8 iii:8 | IV:16 | V:16 | V7:16 | vi:8 ii:8 | I:8 V:8 | I:16' },
  minor: { A: 'i:16 | VII:8 i:8 | i:8 VI:8 | V:16 | VI:8 iv:8 | VII:16 | i:8 V:8 | i:16',
           B: 'III:16 | VI:16 | iv:16 | VII:16 | i:16 | VI:8 V:8 | i:8 V:8 | i:16' },
};
const bars = (s, a, b) => s.split('|').slice(a, b).join('|');

// harmony helpers
const pcs = (sym, key) => M.chord(sym, key).map(n => ((n % 12) + 12) % 12);
const above = (pc, low) => low + (((pc - low) % 12) + 12) % 12;
const voicing = (sym, key, low) => pcs(sym, key).map(pc => above(pc, low)).sort((a, b) => a - b);
const rootAt = (sym, key, low) => above(pcs(sym, key)[0], low);
const fifthOf = (sym, key, root) => above(pcs(sym, key)[pcs(sym, key).length >= 3 ? 2 : 1], root + 1);
function segs(str, off) { return M.prog(str).map(s => ({ t: s.t + off, d: s.d, sym: s.sym })); }
function at(ch, t) { for (let i = ch.length - 1; i >= 0; i--) if (t >= ch[i].t) return ch[i].sym; return ch[0].sym; }
function strum(S, inst, t, notes, d, v, up) {
  const ns = up ? notes.slice().reverse() : notes;
  ns.forEach((n, i) => S.note(inst, t + i * 0.09, n, d, v * (up ? 0.55 : 1)));
}

/* ---------- A. frontier folk: "Campfire" ---------- */
M.add({
  id: 'theme-folk', title: 'Campfire', style: 'Frontier folk',
  blurb: 'Harmonica and fiddle over a boom-chick guitar, an upright bass and a horse at a trot. Warm, a little dusty, it doesn\'t take itself seriously.',
  bpm: 100, swing: 0.5, bars: 18, loopFrom: 2,
  build(S) {
    const key = 'G4', mel = tok => M.deg(tok, key, 'major');
    const ch = [...segs('I:32', 0), ...segs(PROG.major.A, 32), ...segs(PROG.major.B, 160)];
    S.line('harmonica', 10, '5,:2 6,:2 7,:2', mel, 0.8);           // pickup
    S.line('harmonica', 32, THEME.A, mel);
    S.line('fiddle', 160, THEME.B, mel);
    S.line('harmonica', 224, bars(THEME.B, 4), mel, 0.5);           // joins for the home stretch
    for (let t = 0; t < 18 * 16; t += 4) {
      const sym = at(ch, t), beat = (t / 4) % 4, r = rootAt(sym, key, 40);
      if (beat === 0) S.note('bass', t, r, 3, 0.95);
      else if (beat === 2) S.note('bass', t, fifthOf(sym, key, r) - 12 >= 38 ? fifthOf(sym, key, r) - 12 : fifthOf(sym, key, r), 3, 0.8);
      else {
        strum(S, 'guitar', t, voicing(sym, key, 55), 2, 0.75);
        if (beat === 3) strum(S, 'guitar', t + 2, voicing(sym, key, 55), 1, 0.75, true);
      }
    }
    for (let t = 0; t < 18 * 16; t += 2) {                        // clip-clop
      const b = t >= 160 ? 0.7 : 1;
      S.note('block', t, t % 4 === 0 ? 84 : 77, 1, (t % 4 === 0 ? 0.45 : 0.32) * b);
      if (t >= 160 && t % 4 === 2) S.note('shaker', t, 60, 1, 0.6);
    }
  },
});

/* ---------- B. spaghetti western: "The Long Draw" ---------- */
M.add({
  id: 'theme-spaghetti', title: 'The Long Draw', style: 'Spaghetti western',
  blurb: 'A lone whistle, a twang guitar drenched in spring reverb, a galloping rhythm, a wordless choir, a whip crack and an anvil, then a mariachi trumpet takes the answer.',
  bpm: 84, bars: 20, loopFrom: 4, gain: 0.8,
  build(S) {
    const key = 'A5', mode = 'minor', w = tok => M.deg(tok, key, mode), tp = tok => M.deg(tok, 'A4', mode),
      lo = tok => M.deg(tok, 'A2', mode), mid = tok => M.deg(tok, 'A3', mode);
    const ch = [...segs('i:32 i:16 V:16', 0), ...segs(PROG.minor.A, 64), ...segs(PROG.minor.B, 192)];
    // intro: anvil, the lone riff, the choir rising, a whip into the tune
    S.note('anvil', 0, 88, 1, 1);
    for (const t0 of [0, 32]) {
      S.line('twang', t0, '1:3 1:1 1:4 3:2 4:2 5:4', lo, 1);
      S.line('twang', t0 + 16, t0 ? '5:3 5:1 5:4 ^7:2 2\':2 5:4' : '4:3 3:1 1:8 -:4', lo, 1);
    }
    S.note('jawharp', 28, 45, 2, 0.8); S.note('jawharp', 30, 45, 2, 0.55);
    S.note('choir', 32, 57, 16, 0.7); S.note('choir', 32, 64, 16, 0.6);
    voicing('V', 'A4', 56).forEach(n => S.note('choir', 48, n, 16, 0.75));
    S.note('timp', 48, 40, 1, 0.7); S.note('whip', 60, 60, 1, 1);
    // the tune
    S.line('whistle', 64, THEME.A, w);
    S.line('trumpet', 192, THEME.B, tp, 0.95);
    // the gallop: palm-muted twang on the root, every beat
    for (let t = 64; t < 320; t += 4) {
      const sym = at(ch, t), r = rootAt(sym, 'A4', 40);
      S.note('twang', t, r, 2, 0.6, { ring: 0.04 }); S.note('twang', t + 2, r, 1, 0.32, { ring: 0.03 }); S.note('twang', t + 3, r, 1, 0.38, { ring: 0.03 });
      if ((t / 4) % 4 === 0) S.note('bass', t, r, 6, 0.9);
      if ((t / 4) % 4 === 2) S.note('bass', t, fifthOf(sym, 'A4', r) - 12, 4, 0.7);
    }
    for (const c of ch) if (c.t >= 64) voicing(c.sym, 'A4', 57).forEach(n => S.note('choir', c.t, n, c.d, c.t >= 192 ? 0.8 : 0.4));
    for (let t = 64; t < 320; t += 16) { const r = rootAt(at(ch, t), 'A4', 38); S.note('timp', t, r, 1, t >= 192 ? 0.8 : 0.55); if (t >= 192) S.note('timp', t + 8, fifthOf(at(ch, t + 8), 'A4', r) - 12, 1, 0.5); }
    // the twang answers the whistle's long notes
    S.line('twang', 112, '5,:2 ^7,:2 2:2 4:2 ^7,:4 -:4', mid, 1.1);
    S.line('twang', 176, "1:2 3:2 5:2 1':2 5:4 -:4", mid, 1.1);
    S.line('twang', 248, '4:2 2:2 7,:4 -:8', mid, 1.1);
    S.note('anvil', 64, 88, 1, 0.8); S.note('anvil', 192, 88, 1, 0.9);
    S.note('bell', 192, 57, 1, 0.8); S.note('bell', 256, 57, 1, 0.7);
    S.note('whip', 312, 60, 1, 1);
  },
});

/* ---------- C. grand epic: "Ride Out" ---------- */
M.add({
  id: 'theme-epic', title: 'Ride Out', style: 'Grand epic',
  blurb: 'Driving strings in a 3+3+2 ostinato, timpani and snare. The horns call the tune, then the violins soar with it and the trumpet joins for the finish. Wide skies, seven riders.',
  bpm: 132, bars: 20, loopFrom: 4,
  build(S) {
    const key = 'D4', mel = tok => M.deg(tok, key, 'major'), hi = tok => M.deg(tok, 'D5', 'major');
    const ch = [...segs('I:32 IV:8 I:8 V:16', 0), ...segs(PROG.major.A, 64), ...segs(PROG.major.B, 192)];
    // ostinato: eighths, accents grouped 3+3+2
    for (let t = 0; t < 320; t += 2) {
      const i = (t % 16) / 2, acc = i === 0 || i === 3 || i === 6, sym = at(ch, t), r = rootAt(sym, key, 45), f = fifthOf(sym, key, r);
      const pitch = [r, r, f, r, r, f, r + 12, f][i], swell = t < 32 ? 0.55 + 0.45 * t / 32 : 1;
      S.note('strings', t, pitch, 1.6, (acc ? 1 : 0.55) * swell);
      if (acc && t >= 32) S.note('strings', t, r - 12, 1.6, 0.7);
    }
    for (let t = 16; t < 32; t++) S.note('timp', t, 38, 1, 0.25 + 0.5 * (t - 16) / 16);   // roll in
    S.note('crash', 32, 60, 1, 0.8);
    S.line('horns', 32, '1:4 1:2 5:2 5:8 | 5:4 4:2 3:2 2:4 ^7,:4', mel, 1);
    S.line('horns', 64, THEME.A, mel, 1.05);
    for (const c of ch) if (c.t >= 64 && c.t < 192) voicing(c.sym, key, 69).forEach(n => S.note('strings', c.t, n, c.d, 0.45));
    S.line('strings', 192, THEME.B, hi, 1.2);
    S.line('strings', 192, THEME.B, mel, 0.6);
    for (const c of ch) if (c.t >= 192) voicing(c.sym, key, 57).forEach(n => S.note('horns', c.t, n, c.d, 0.55));
    S.line('trumpet', 256, bars(THEME.B, 4), hi, 0.7);
    for (let t = 32; t < 320; t += 8) { const sym = at(ch, t), r = rootAt(sym, key, 38); S.note('timp', t, (t / 8) % 2 ? fifthOf(sym, key, r) - 12 : r, 1, (t / 8) % 2 ? 0.28 : 0.45); }
    for (let t = 64; t < 320; t++) {
      const p = t % 16, v = p === 0 || p === 6 || p === 12 ? 0.75 : p % 2 === 0 ? 0.28 : p === 15 ? 0.3 : 0;
      if (v) S.note('snare', t, 60, 1, v);
    }
    for (const t of [64, 192, 256]) S.note('crash', t, 60, 1, 0.9);
  },
});

// shared with the other cue files
M.theme = { THEME, PROG, bars, pcs, above, voicing, rootAt, fifthOf, segs, at, strum };
})();
