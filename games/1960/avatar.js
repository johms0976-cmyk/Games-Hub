/* The player's avatar — a little Mii-style figure every player makes on their
   phone the first time they join, and the face the hub puts on them from then
   on: the lobby, and the winner reveal at the end of a game (shared/finale.js).

   The SHIRT is the important part. Its colour is the seat's colour, so a player
   in a green shirt plays green pieces in every game that paints pieces in the
   seat colour (the server enforces one shirt per colour — see server.js).

   It is DATA, a small flat object, so it rides in the lobby summary and in
   localStorage, and the drawing is a pure function of it:

     HubAvatar.svg(avatar, { pose, crop, shirt, cls })   an SVG string
       pose   'stand' (default) | 'cheer' | 'wave' | 'sad'
              The SVG carries every pose; the class on the root picks one, so
              CSS can switch pose without redrawing (the reveal does this).
       crop   'full' (default, feet on the ground) | 'head' | 'bust'
       shirt  a hex colour that wins over the avatar's own shirt — the reveal
              passes the colour the player actually played, which for a
              faction game is the faction's.
     HubAvatar.normalise(raw)       a valid avatar from anything (never throws)
     HubAvatar.random(seed)         a whole random look; same seed, same look
     HubAvatar.PARTS / SHIRTS / SKINS / HAIR_COLS / EYE_COLS / LEG_COLS
                                    the choices, in the order the maker shows them

   Figures share one coordinate system (120 x 220, feet at y 214), so a short
   player really is shorter than a tall one when they stand in a row.
   Works in Node too (the server uses SHIRTS and normalise). */
(function (root) {
  'use strict';

  /* Same names and hexes the seat colours always had, so nothing that already
     reads `seat.color` or `seat.hex` notices the change. */
  const SHIRTS = [
    { name: 'red',    hex: '#e5484d', label: 'Red' },
    { name: 'blue',   hex: '#3e7bfa', label: 'Blue' },
    { name: 'green',  hex: '#30a46c', label: 'Green' },
    { name: 'gold',   hex: '#f5c542', label: 'Gold' },
    { name: 'purple', hex: '#8e4ec6', label: 'Purple' },
    { name: 'orange', hex: '#f76b15', label: 'Orange' },
    { name: 'cyan',   hex: '#00b4d8', label: 'Cyan' },
    { name: 'pink',   hex: '#e93d82', label: 'Pink' },
    { name: 'lime',   hex: '#99d52a', label: 'Lime' },
    { name: 'teal',   hex: '#12a594', label: 'Teal' }
  ];
  const SKINS = ['#ffe3cc', '#f5c7a1', '#e2a67c', '#c4835a', '#8e5a3c', '#5e3b29'];
  const HAIR_COLS = ['#1d1916', '#4a2f1e', '#7b4b2a', '#a2471f', '#d9783a', '#e6c477', '#f1ead6', '#9b9b9b', '#3e7bfa', '#e93d82'];
  const EYE_COLS = ['#4a2e1b', '#2f6fb3', '#3f8a4a', '#8a6a33', '#5b6470'];
  const LEG_COLS = ['#34507e', '#24272e', '#b59a6a', '#6b7280', '#ebe7dc', '#7a2e3a'];

  const PARTS = {
    sex:     [['m', 'Male'], ['f', 'Female']],
    height:  [['short', 'Short'], ['medium', 'Medium'], ['tall', 'Tall']],
    build:   [['cut', 'Cut'], ['lean', 'Lean'], ['heavy', 'Heavy']],
    hair:    [['crop', 'Crop'], ['swoop', 'Swoop'], ['spiky', 'Spiky'], ['buzz', 'Buzz'], ['curly', 'Curly'], ['afro', 'Afro'],
              ['mohawk', 'Mohawk'], ['bob', 'Bob'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['bun', 'Bun'], ['bald', 'Bald']],
    eyes:    [['dot', 'Dots'], ['round', 'Round'], ['happy', 'Happy'], ['sleepy', 'Sleepy'], ['lashes', 'Lashes'],
              ['wide', 'Wide'], ['wink', 'Wink'], ['narrow', 'Narrow']],
    brows:   [['soft', 'Soft'], ['thick', 'Thick'], ['angry', 'Fierce'], ['raised', 'Raised'], ['none', 'None']],
    nose:    [['button', 'Button'], ['line', 'Line'], ['round', 'Round'], ['none', 'None']],
    mouth:   [['smile', 'Smile'], ['grin', 'Grin'], ['flat', 'Flat'], ['open', 'Open'], ['smirk', 'Smirk']],
    cheeks:  [['none', 'None'], ['blush', 'Blush'], ['freckles', 'Freckles']],
    beard:   [['none', 'None'], ['stubble', 'Stubble'], ['moustache', 'Moustache'], ['goatee', 'Goatee'], ['beard', 'Beard']],
    glasses: [['none', 'None'], ['round', 'Round'], ['square', 'Square'], ['shades', 'Shades'], ['star', 'Party']],
    legs:    [['trousers', 'Trousers'], ['shorts', 'Shorts'], ['skirt', 'Skirt']]
  };
  const NUMS = { skin: SKINS.length, hairCol: HAIR_COLS.length, eyeCol: EYE_COLS.length, legCol: LEG_COLS.length };
  const DEFAULT = {
    shirt: null, sex: 'm', height: 'medium', build: 'lean', skin: 1,
    hair: 'crop', hairCol: 1, eyes: 'dot', eyeCol: 0, brows: 'soft', nose: 'button', mouth: 'smile',
    cheeks: 'none', beard: 'none', glasses: 'none', legs: 'trousers', legCol: 0
  };

  const shirtByName = n => SHIRTS.find(s => s.name === n) || null;

  function normalise(raw) {
    const a = {};
    const r = raw && typeof raw === 'object' ? raw : {};
    for (const k of Object.keys(PARTS)) a[k] = PARTS[k].some(p => p[0] === r[k]) ? r[k] : DEFAULT[k];
    for (const k of Object.keys(NUMS)) {
      const n = Math.floor(Number(r[k]));
      a[k] = n >= 0 && n < NUMS[k] ? n : DEFAULT[k];
    }
    a.shirt = shirtByName(r.shirt) ? r.shirt : null;
    return a;
  }

  /* A small seeded generator, so a house player called "Hal" always looks the same. */
  function rng(seed) {
    if (seed == null) return Math.random;
    const s = String(seed);
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function random(seed) {
    const R = rng(seed);
    const pick = list => list[Math.floor(R() * list.length)];
    const keys = k => PARTS[k].map(p => p[0]);
    const sex = R() < 0.5 ? 'm' : 'f';
    const a = {
      shirt: pick(SHIRTS).name, sex,
      height: pick(keys('height')), build: pick(['cut', 'lean', 'lean', 'heavy']),
      skin: Math.floor(R() * SKINS.length),
      hair: sex === 'm' ? pick(['crop', 'swoop', 'spiky', 'buzz', 'curly', 'afro', 'mohawk', 'bald', 'crop', 'swoop'])
                        : pick(['bob', 'long', 'ponytail', 'bun', 'curly', 'afro', 'long', 'swoop']),
      hairCol: Math.floor(R() * 8),                     // the two loud colours are a choice, never a roll
      eyes: sex === 'f' ? pick(['lashes', 'round', 'dot', 'happy', 'lashes']) : pick(['dot', 'round', 'happy', 'sleepy', 'wide', 'narrow']),
      eyeCol: Math.floor(R() * EYE_COLS.length),
      brows: pick(['soft', 'soft', 'thick', 'raised', 'angry']),
      nose: pick(['button', 'line', 'round', 'button']),
      mouth: pick(['smile', 'smile', 'grin', 'open', 'smirk', 'flat']),
      cheeks: R() < 0.3 ? pick(['blush', 'freckles']) : 'none',
      beard: sex === 'm' && R() < 0.35 ? pick(['stubble', 'moustache', 'goatee', 'beard']) : 'none',
      glasses: R() < 0.2 ? pick(['round', 'square', 'shades']) : 'none',
      legs: sex === 'f' && R() < 0.35 ? 'skirt' : R() < 0.2 ? 'shorts' : 'trousers',
      legCol: Math.floor(R() * LEG_COLS.length)
    };
    return normalise(a);
  }

  /* ---------------- colour helpers ---------------- */
  function hex6(c) {
    if (typeof c !== 'string') return null;
    let m = /^#([0-9a-f]{6})$/i.exec(c.trim());
    if (m) return '#' + m[1].toLowerCase();
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c.trim());
    return m ? '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3] : null;
  }
  function mix(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const x = p(a), y = p(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  /* Light shirts need dark trim, or the collar disappears into the gold. */
  const lum = h => { const p = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; };
  const f1 = n => Math.round(n * 10) / 10;
  const P = (x, y) => f1(x) + ',' + f1(y);

  /* ---------------- the body ---------------- */
  const HEIGHTS = { short: { leg: 32, torso: 38 }, medium: { leg: 43, torso: 44 }, tall: { leg: 55, torso: 50 } };
  const BUILDS = {
    m: { cut:   { sh: 27, waist: 17, mid: 21, arm: 8.6, legW: 15 },
         lean:  { sh: 20, waist: 15, mid: 17, arm: 6.2, legW: 12 },
         heavy: { sh: 25, waist: 24, mid: 31, arm: 9.6, legW: 18 } },
    f: { cut:   { sh: 23, waist: 14, mid: 14, arm: 7.4, legW: 13.5, hip: 20 },
         lean:  { sh: 18, waist: 12, mid: 12.5, arm: 5.6, legW: 11, hip: 17.5 },
         heavy: { sh: 23, waist: 21, mid: 27, arm: 8.8, legW: 17, hip: 26 } }
  };
  const GROUND = 214, ANKLE = 207, CX = 60;

  function layout(a) {
    const H = HEIGHTS[a.height], B = BUILDS[a.sex][a.build];
    const hip = ANKLE - H.leg;
    const sy = hip - H.torso;
    return { H, B, hip, sy, hy: sy - 27, hw: B.hip || B.waist };
  }

  /* ---------------- the head ---------------- */
  /* Head space: the face is centred on 0,0, 46 wide and 50 tall. */
  const HEAD = 'M0,-25C14,-25 23,-15 23,-1C23,14 14,25 0,25C-14,25 -23,14 -23,-1C-23,-15 -14,-25 0,-25Z';
  const capOf = (fringe, outer) => 'M-25,-1' + (outer || 'C-26.5,-38 26.5,-38 25,-1') + 'L21.5,-1' + fringe + 'L-21.5,-1Z';
  const FRINGE = {
    crop: 'L21,-8C12,-14 -12,-14 -21,-8',
    swoop: 'L21,-11C9,-15 -6,-7 -21,-1',
    bangs: 'L21,-8C12,-11 -12,-11 -21,-8',
    part: 'L21,-5C12,-7 4,-13 0,-19C-4,-13 -12,-7 -21,-5',
    back: 'L21,-6C14,-18 -14,-18 -21,-6',
    high: 'L21,-10C12,-16 -12,-16 -21,-10'
  };
  const SPIKES = 'L-27,-12L-24,-21L-26,-30L-16,-28L-14,-38L-6,-31L0,-42L6,-31L14,-38L16,-28L26,-30L24,-21L27,-12L25,-1';
  const circ = (x, y, r) => '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + r + '"/>';
  function curls(n, from, to, rx, ry, cy, r) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const t = (from + (to - from) * i / (n - 1)) * Math.PI / 180;
      s += circ(Math.cos(t) * rx, cy + Math.sin(t) * ry, r);
    }
    return s;
  }

  /* What sits behind the head (and so behind the body). */
  function hairBack(st, col, edge) {
    const g = (d, extra) => '<path d="' + d + '" fill="' + col + '" stroke="' + edge + '" stroke-width=".8"' + (extra || '') + '/>';
    switch (st) {
      case 'bob': return g('M-27,-8C-30,-38 30,-38 27,-8L30,19C30,26 24,27 18,24L-18,24C-24,27 -30,26 -30,19Z');
      case 'long': return g('M-27,-8C-31,-38 31,-38 27,-8C29,10 32,30 33,47C26,53 -26,53 -33,47C-32,30 -29,10 -27,-8Z');
      case 'afro': return '<circle cx="0" cy="-9" r="35" fill="' + col + '" stroke="' + edge + '" stroke-width=".8"/>' +
        '<g fill="' + col + '" stroke="' + edge + '" stroke-width=".8">' + curls(14, 160, 380, 33, 33, -9, 6) + '</g>';
      case 'ponytail': return g('M10,-24C30,-31 41,-8 37,17C35,31 27,36 24,28C30,12 28,-6 12,-10Z') +
        '<circle cx="22" cy="-17" r="3.4" fill="#e5484d"/>';
      case 'bun': return '<circle cx="0" cy="-31" r="11" fill="' + col + '" stroke="' + edge + '" stroke-width=".8"/>' +
        '<path d="M-6,-33C-3,-38 5,-37 6,-31" fill="none" stroke="' + edge + '" stroke-width="1.2" stroke-linecap="round"/>';
      default: return '';
    }
  }
  /* What sits over the forehead. */
  function hairFront(st, col, edge) {
    const g = (d, extra) => '<path d="' + d + '" fill="' + col + '" stroke="' + edge + '" stroke-width=".8"' + (extra || '') + '/>';
    switch (st) {
      case 'crop': return g(capOf(FRINGE.crop));
      case 'swoop': return g(capOf(FRINGE.swoop));
      case 'spiky': return g(capOf(FRINGE.crop, SPIKES));
      case 'buzz': return g(capOf(FRINGE.high, 'C-25.5,-35 25.5,-35 25,-1'), ' fill-opacity=".72"');
      case 'curly': return g(capOf(FRINGE.crop)) + '<g fill="' + col + '" stroke="' + edge + '" stroke-width=".8">' +
        curls(8, 195, 345, 23, 26, -2, 7.5) + curls(4, 200, 340, 14, 6, -12, 5) + '</g>';
      case 'afro': return g(capOf(FRINGE.crop)) + '<g fill="' + col + '" stroke="' + edge + '" stroke-width=".8">' + curls(5, 200, 340, 16, 5, -12, 5) + '</g>';
      case 'mohawk': return g(capOf(FRINGE.high, 'C-25.5,-35 25.5,-35 25,-1'), ' fill-opacity=".3" stroke-opacity=".3"') +
        g('M-6,-22L-9,-37L-3,-33L0,-46L3,-33L9,-37L6,-22C3,-25 -3,-25 -6,-22Z');
      case 'bob': return g(capOf(FRINGE.bangs));
      case 'long': return g(capOf(FRINGE.part)) +
        g('M19,-6C25,6 27,20 27,36C24,40 19,39 17,35C18,20 17,8 14,-2Z') +
        g('M-19,-6C-25,6 -27,20 -27,36C-24,40 -19,39 -17,35C-18,20 -17,8 -14,-2Z');
      case 'ponytail': return g(capOf(FRINGE.back));
      case 'bun': return g(capOf(FRINGE.back));
      case 'bald': return '<ellipse cx="-8" cy="-16" rx="6" ry="3.4" fill="#fff" opacity=".22" transform="rotate(-25 -8 -16)"/>';
      default: return '';
    }
  }
  const EARS_HIDDEN = { bob: 1, long: 1, afro: 1 };

  const INK = '#2a1d17';
  function eye(type, s, iris) {
    const at = 'transform="translate(' + (s * 8.5) + ' 3)"';
    const ball = (rx, ry, ir) => '<ellipse rx="' + rx + '" ry="' + ry + '" fill="#fff" stroke="' + INK + '" stroke-width=".7"/>' +
      '<circle cy=".6" r="' + ir + '" fill="' + iris + '"/><circle cy=".6" r="' + f1(ir * 0.5) + '" fill="#111"/>' +
      '<circle cx="1" cy="-.7" r=".95" fill="#fff"/>';
    const arc = '<path d="M-4,1.6Q0,-3.2 4,1.6" fill="none" stroke="' + INK + '" stroke-width="1.9" stroke-linecap="round"/>';
    let inner;
    switch (type) {
      case 'round': inner = ball(4.4, 5, 3); break;
      case 'wide': inner = ball(5.4, 6.2, 2.3); break;
      case 'happy': inner = arc; break;
      case 'wink': inner = s > 0 ? arc : ball(4.4, 5, 3); break;
      case 'narrow': inner = '<path d="M-4.6,1.4Q0,-2 4.6,1.4Q0,3.6 -4.6,1.4Z" fill="' + INK + '"/>'; break;
      case 'sleepy': inner = ball(4.4, 5, 3) + '<path d="M-5.2,-5.8L5.2,-5.8L5.2,.5Q0,-.9 -5.2,.5Z" fill="var(--hav-skin)"/>' +
        '<path d="M-4.9,.5Q0,-.9 4.9,.5" fill="none" stroke="' + INK + '" stroke-width="1.3" stroke-linecap="round"/>'; break;
      case 'lashes': inner = ball(4.4, 5, 3) + '<path d="M' + (s * 3) + ',-4.1L' + (s * 5.6) + ',-6.6M' + (s * 4.2) + ',-2.4L' + (s * 7) + ',-3.9" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>'; break;
      default: inner = '<ellipse rx="2.6" ry="3.3" fill="' + INK + '"/><circle cx=".8" cy="-1.1" r=".9" fill="#fff"/>';
    }
    return '<g ' + at + '>' + inner + '</g>';
  }
  function brows(type, col) {
    if (type === 'none') return '';
    const one = s => {
      switch (type) {
        case 'thick': return 'M' + P(s * 4.2, -6.4) + 'Q' + P(s * 8.5, -9.6) + ' ' + P(s * 12.8, -6.8);
        case 'angry': return 'M' + P(s * 4.4, -5) + 'L' + P(s * 12.6, -8.6);
        case 'raised': return 'M' + P(s * 4.4, -9) + 'Q' + P(s * 8.5, -12.8) + ' ' + P(s * 12.6, -9.2);
        default: return 'M' + P(s * 4.4, -6.6) + 'Q' + P(s * 8.5, -9.2) + ' ' + P(s * 12.6, -6.8);
      }
    };
    return '<path d="' + one(-1) + one(1) + '" fill="none" stroke="' + col + '" stroke-width="' + (type === 'thick' ? 3.2 : 2) + '" stroke-linecap="round"/>';
  }
  function nose(type, dark) {
    switch (type) {
      case 'line': return '<path d="M-.6,5.5Q2.6,9.6 -1.4,11.6" fill="none" stroke="' + dark + '" stroke-width="1.4" stroke-linecap="round"/>';
      case 'round': return '<ellipse cy="10" rx="3.5" ry="2.7" fill="' + dark + '" opacity=".75"/><circle cx="-1.1" cy="9.1" r=".9" fill="#fff" opacity=".35"/>';
      case 'none': return '';
      default: return '<ellipse cy="10" rx="2.2" ry="1.6" fill="' + dark + '"/>';
    }
  }
  const LIP = '#6e2b25', MOUTH_IN = '#4a1714';
  function mouth(type) {
    switch (type) {
      case 'grin': return '<path d="M-7,14Q0,24 7,14Z" fill="' + MOUTH_IN + '"/><path d="M-6.3,14.5Q0,16.6 6.3,14.5L5.6,16Q0,17.8 -5.6,16Z" fill="#fff"/>';
      case 'flat': return '<path d="M-4.6,16.4L4.6,16.4" stroke="' + LIP + '" stroke-width="2" stroke-linecap="round"/>';
      case 'open': return '<ellipse cy="17" rx="3.4" ry="4" fill="' + MOUTH_IN + '"/><ellipse cy="19.4" rx="2.2" ry="1.4" fill="#e2626a"/>';
      case 'smirk': return '<path d="M-5,17Q1,18.6 6,13.8" fill="none" stroke="' + LIP + '" stroke-width="2" stroke-linecap="round"/>';
      default: return '<path d="M-6,15Q0,21 6,15" fill="none" stroke="' + LIP + '" stroke-width="2" stroke-linecap="round"/>';
    }
  }
  const SAD = '<path d="M-5.4,18.4Q0,13.8 5.4,18.4" fill="none" stroke="' + LIP + '" stroke-width="2" stroke-linecap="round"/>';
  const STACHE = 'M-8.4,13.2Q-4,9.8 0,12Q4,9.8 8.4,13.2Q4,15.6 0,14Q-4,15.6 -8.4,13.2Z';
  function beard(type, col) {
    switch (type) {
      case 'stubble': return '<path d="M-21.5,5C-20,23 -10,30 0,30C10,30 20,23 21.5,5C16,16 8,21 0,21C-8,21 -16,16 -21.5,5Z" fill="' + col + '" opacity=".3"/>' +
        '<path d="' + STACHE + '" fill="' + col + '" opacity=".3"/>';
      case 'moustache': return '<path d="' + STACHE + '" fill="' + col + '"/>';
      case 'goatee': return '<path d="' + STACHE + '" fill="' + col + '"/><path d="M-4.6,20.6Q0,19.6 4.6,20.6L3.4,27.4Q0,29.6 -3.4,27.4Z" fill="' + col + '"/>';
      case 'beard': return '<path d="M-22.6,0C-23,25 -11,35 0,35C11,35 23,25 22.6,0L19.6,3C18,15 10,21.5 0,21.5C-10,21.5 -18,15 -19.6,3Z" fill="' + col + '"/>' +
        '<path d="' + STACHE + '" fill="' + col + '"/>';
      default: return '';
    }
  }
  function cheeks(type, dark) {
    if (type === 'blush') return '<ellipse cx="-13.5" cy="11" rx="4.2" ry="2.5" fill="#ff6f86" opacity=".35"/><ellipse cx="13.5" cy="11" rx="4.2" ry="2.5" fill="#ff6f86" opacity=".35"/>';
    if (type === 'freckles') {
      let s = '';
      for (const [x, y] of [[11, 8.6], [14, 10.2], [12, 12], [15.6, 8]]) s += circ(x, y, 0.75) + circ(-x, y, 0.75);
      return '<g fill="' + dark + '" opacity=".75">' + s + '</g>';
    }
    return '';
  }
  function star(x, y, R) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.48 : R, t = -Math.PI / 2 + i * Math.PI / 5;
      d += (i ? 'L' : 'M') + P(x + Math.cos(t) * r, y + Math.sin(t) * r);
    }
    return d + 'Z';
  }
  function glasses(type) {
    const temples = '<path d="M-14.5,2L-22,0M14.5,2L22,0" stroke="#222" stroke-width="1.3" stroke-linecap="round"/>';
    switch (type) {
      case 'round': return temples + '<g fill="#fff" fill-opacity=".14" stroke="#222" stroke-width="1.4"><circle cx="-8.5" cy="3" r="6"/><circle cx="8.5" cy="3" r="6"/></g>' +
        '<path d="M-2.6,2.4Q0,.8 2.6,2.4" fill="none" stroke="#222" stroke-width="1.3"/>';
      case 'square': return temples + '<g fill="#fff" fill-opacity=".14" stroke="#222" stroke-width="1.5"><rect x="-15" y="-1.8" width="13" height="9.6" rx="2"/><rect x="2" y="-1.8" width="13" height="9.6" rx="2"/></g>' +
        '<path d="M-2,1.6L2,1.6" stroke="#222" stroke-width="1.4"/>';
      case 'shades': return temples + '<g fill="#121317" stroke="#000" stroke-width="1"><path d="M-15.4,-1.4L-1.8,-1.4L-2.6,5.2Q-3.6,9 -8.8,9Q-14.4,9 -15.4,4Z"/><path d="M15.4,-1.4L1.8,-1.4L2.6,5.2Q3.6,9 8.8,9Q14.4,9 15.4,4Z"/></g>' +
        '<path d="M-1.8,-.6L1.8,-.6" stroke="#000" stroke-width="1.6"/><path d="M-12.6,.6L-9.4,.6M5,.6L8.2,.6" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>';
      case 'star': return temples + '<g fill="#ff4fb3" fill-opacity=".85" stroke="#7a1450" stroke-width="1.1" stroke-linejoin="round"><path d="' + star(-8.5, 3, 8) + '"/><path d="' + star(8.5, 3, 8) + '"/></g>' +
        '<path d="M-2.6,1.4L2.6,1.4" stroke="#7a1450" stroke-width="1.4"/>';
      default: return '';
    }
  }

  /* ---------------- the figure ---------------- */
  let uid = 0;
  const CSS = '.hav{display:block;overflow:visible}' +
    '.hav .hav-up,.hav .hav-sad{display:none}' +
    '.hav.cheer .hav-up,.hav.wave .hav-up.r{display:inline}' +
    '.hav.cheer .hav-dn,.hav.wave .hav-dn.r{display:none}' +
    '.hav.sad .hav-sad{display:inline}.hav.sad .hav-m{display:none}' +
    '.hav .hav-head{transform-box:fill-box;transform-origin:50% 100%;transition:transform .5s}' +
    '.hav.sad .hav-head{transform:translateY(1.5px) rotate(-7deg)}';
  function injectCss() {
    const doc = root.document;
    if (!doc || !doc.head || doc.getElementById('hav-css')) return;
    const st = doc.createElement('style');
    st.id = 'hav-css';
    st.textContent = CSS;
    doc.head.appendChild(st);
  }

  function svg(raw, opt) {
    opt = opt || {};
    injectCss();
    const a = normalise(raw);
    const L = layout(a), B = L.B;
    const shirt = hex6(opt.shirt) || (shirtByName(a.shirt) || SHIRTS[1]).hex;
    const skin = SKINS[a.skin], skinD = mix(skin, '#3a1a0a', 0.22), skinL = mix(skin, '#ffffff', 0.14);
    const hair = HAIR_COLS[a.hairCol], hairE = mix(hair, '#000000', 0.32);
    const legs = LEG_COLS[a.legCol], legsD = mix(legs, '#000000', 0.25);
    const shirtD = mix(shirt, '#000000', 0.24), shirtL = mix(shirt, '#ffffff', 0.16);
    const trim = lum(shirt) > 0.62 ? mix(shirt, '#000000', 0.45) : shirtD;
    const id = 'hav' + (++uid);
    const { hip, sy, hy, hw } = L;
    const tl = hip + 4 - sy;
    const pose = opt.pose && opt.pose !== 'stand' ? ' ' + opt.pose : '';

    let vb;
    if (opt.crop === 'head') vb = [CX - 40, hy - 50, 80, 86];
    else if (opt.crop === 'bust') vb = [CX - 46, hy - 50, 92, 106];
    else vb = [0, 0, 120, 220];

    let s = '<svg xmlns="http://www.w3.org/2000/svg" class="hav' + pose + (opt.cls ? ' ' + opt.cls : '') + '" viewBox="' + vb.join(' ') +
      '" preserveAspectRatio="xMidYMax meet" role="img" aria-label="' + (opt.label ? String(opt.label).replace(/[<>&"]/g, '') : 'player') + '"' +
      ' style="--hav-skin:' + skin + (opt.crop === 'head' || opt.crop === 'bust' ? ';overflow:hidden' : '') + '">';
    s += '<defs><linearGradient id="' + id + 's" x1="0" x2="1"><stop offset="0" stop-color="' + shirtL + '"/><stop offset=".55" stop-color="' + shirt + '"/><stop offset="1" stop-color="' + shirtD + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'h" cx=".4" cy=".36" r=".72"><stop offset="0" stop-color="' + skinL + '"/><stop offset=".75" stop-color="' + skin + '"/><stop offset="1" stop-color="' + mix(skin, '#3a1a0a', 0.1) + '"/></radialGradient></defs>';

    if (opt.crop !== 'head' && opt.crop !== 'bust') s += '<ellipse cx="60" cy="' + GROUND + '" rx="' + (26 + B.legW * 0.5) + '" ry="4.5" fill="#000" opacity=".22"/>';

    /* hair that hangs behind everything */
    s += '<g transform="translate(' + CX + ' ' + f1(hy) + ')">' + hairBack(a.hair, hair, hairE) + '</g>';

    /* legs, shoes */
    const lx = side => CX + side * (hw * 0.5 + 0.5);
    const knee = hip + L.H.leg * 0.44;
    const legLine = (side, y0, y1, w, col) => '<path d="M' + P(lx(side), y0) + 'L' + P(lx(side) + side * 1.6, y1) + '" stroke="' + col + '" stroke-width="' + f1(w) + '" stroke-linecap="round"/>';
    if (a.legs === 'trousers') {
      for (const sd of [-1, 1]) s += legLine(sd, hip - 2, ANKLE, B.legW + 1.2, legsD) + legLine(sd, hip - 2, ANKLE, B.legW, legs);
    } else {
      for (const sd of [-1, 1]) s += legLine(sd, hip, ANKLE, B.legW * 0.78, skinD) + legLine(sd, hip, ANKLE, B.legW * 0.78 - 1.2, skin);
      if (a.legs === 'shorts') for (const sd of [-1, 1]) s += legLine(sd, hip - 2, knee, B.legW + 2.4, legsD) + legLine(sd, hip - 2, knee, B.legW + 1.2, legs);
      else {
        const sk = hip + L.H.leg * 0.5;
        s += '<path d="M' + P(CX - hw + 1, hip - 4) + 'L' + P(CX + hw - 1, hip - 4) + 'L' + P(CX + hw + 9, sk) + 'Q' + P(CX, sk + 5) + ' ' + P(CX - hw - 9, sk) + 'Z" fill="' + legs + '" stroke="' + legsD + '" stroke-width="1"/>';
      }
    }
    for (const sd of [-1, 1]) {
      const x = lx(sd) + sd * 3.4, w = B.legW * 0.5 + 4.2;
      s += '<ellipse cx="' + f1(x) + '" cy="' + (ANKLE + 3) + '" rx="' + f1(w) + '" ry="5.6" fill="#2b2d36"/>' +
        '<path d="M' + P(x - w + 1.5, ANKLE + 5.4) + 'L' + P(x + w - 1.5, ANKLE + 5.4) + '" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>';
    }

    /* neck, then the shirt over it */
    s += '<rect x="' + (CX - 6.5) + '" y="' + f1(hy + 14) + '" width="13" height="' + f1(sy - hy - 10) + '" rx="4" fill="' + mix(skin, '#3a1a0a', 0.1) + '"/>';
    const Lx = CX - B.sh, Rx = CX + B.sh, bot = hip + 4;
    s += '<path d="M' + P(CX - 9, sy) + 'C' + P(Lx + 2, sy) + ' ' + P(Lx, sy + 2) + ' ' + P(Lx, sy + 9) +
      'C' + P(Lx, sy + tl * 0.4) + ' ' + P(CX - B.mid, sy + tl * 0.72) + ' ' + P(CX - hw, bot) +
      'Q' + P(CX, bot + 4) + ' ' + P(CX + hw, bot) +
      'C' + P(CX + B.mid, sy + tl * 0.72) + ' ' + P(Rx, sy + tl * 0.4) + ' ' + P(Rx, sy + 9) +
      'C' + P(Rx, sy + 2) + ' ' + P(Rx - 2, sy) + ' ' + P(CX + 9, sy) +
      'Q' + P(CX, sy + 7) + ' ' + P(CX - 9, sy) + 'Z" fill="url(#' + id + 's)" stroke="' + shirtD + '" stroke-width="1.1"/>';
    s += '<path d="M' + P(CX - 9.4, sy + 0.2) + 'Q' + P(CX, sy + 8) + ' ' + P(CX + 9.4, sy + 0.2) + '" fill="none" stroke="' + trim + '" stroke-width="2.2" stroke-linecap="round"/>';
    /* a cut build shows it, a heavy one has a belly line */
    if (a.build === 'cut') s += '<path d="M' + P(CX - B.sh * 0.5, sy + 13) + 'Q' + P(CX - 3, sy + 17) + ' ' + P(CX, sy + 14) + 'Q' + P(CX + 3, sy + 17) + ' ' + P(CX + B.sh * 0.5, sy + 13) + '" fill="none" stroke="' + shirtD + '" stroke-width="1" opacity=".7"/>';
    if (a.build === 'heavy') s += '<path d="M' + P(CX - B.mid * 0.62, sy + tl * 0.78) + 'Q' + P(CX, sy + tl * 0.92) + ' ' + P(CX + B.mid * 0.62, sy + tl * 0.78) + '" fill="none" stroke="' + shirtD + '" stroke-width="1" opacity=".55"/>';

    /* arms: both poses are in the drawing; the root class shows one */
    const arm = (sd, E, Hd, cls) => {
      const S = [CX + sd * (B.sh - 4), sy + 7];
      const k = 0.6, Sl = [S[0] + (E[0] - S[0]) * k, S[1] + (E[1] - S[1]) * k];
      const d = 'M' + P(S[0], S[1]) + 'L' + P(E[0], E[1]) + 'L' + P(Hd[0], Hd[1]);
      return '<g class="' + cls + (sd > 0 ? ' r' : ' l') + '">' +
        '<path d="' + d + '" fill="none" stroke="' + skinD + '" stroke-width="' + f1(B.arm * 2 + 1.2) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="' + d + '" fill="none" stroke="' + skin + '" stroke-width="' + f1(B.arm * 2) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M' + P(S[0], S[1]) + 'L' + P(Sl[0], Sl[1]) + '" stroke="' + shirtD + '" stroke-width="' + f1(B.arm * 2 + 4.4) + '" stroke-linecap="round"/>' +
        '<path d="M' + P(S[0], S[1]) + 'L' + P(Sl[0], Sl[1]) + '" stroke="' + shirt + '" stroke-width="' + f1(B.arm * 2 + 3) + '" stroke-linecap="round"/>' +
        '<circle cx="' + f1(Hd[0]) + '" cy="' + f1(Hd[1]) + '" r="' + f1(B.arm + 1.7) + '" fill="' + skin + '" stroke="' + skinD + '" stroke-width=".7"/></g>';
    };
    const bulge = a.build === 'heavy' ? 4 : a.build === 'cut' ? 1.5 : 0;
    for (const sd of [-1, 1]) {
      s += arm(sd, [CX + sd * (B.sh + 2 + bulge), sy + L.H.torso * 0.5], [CX + sd * (B.sh + 4 + bulge), sy + L.H.torso * 0.94], 'hav-dn');
      s += arm(sd, [CX + sd * (B.sh + 11), sy - 5], [CX + sd * (B.sh + 15), sy - L.H.torso * 0.8], 'hav-up');
    }

    /* the head */
    s += '<g transform="translate(' + CX + ' ' + f1(hy) + ')"><g class="hav-head">';
    if (!EARS_HIDDEN[a.hair]) {
      for (const sd of [-1, 1]) s += '<ellipse cx="' + (sd * 22.4) + '" cy="2" rx="4.4" ry="6.3" fill="' + skin + '" stroke="' + skinD + '" stroke-width=".7"/>' +
        '<path d="M' + P(sd * 22.4, -1.5) + 'Q' + P(sd * 24.6, 2) + ' ' + P(sd * 22.6, 5.4) + '" fill="none" stroke="' + skinD + '" stroke-width="1"/>';
    }
    s += '<path d="' + HEAD + '" fill="url(#' + id + 'h)" stroke="' + skinD + '" stroke-width=".8"/>';
    s += cheeks(a.cheeks, skinD);
    s += eye(a.eyes, -1, EYE_COLS[a.eyeCol]) + eye(a.eyes, 1, EYE_COLS[a.eyeCol]);
    s += brows(a.brows, a.hair === 'bald' ? mix(skin, '#1d1916', 0.6) : hair);
    s += nose(a.nose, skinD);
    s += beard(a.beard, hair);
    s += '<g class="hav-m">' + mouth(a.mouth) + '</g><g class="hav-sad">' + SAD + '</g>';
    s += hairFront(a.hair, hair, hairE);
    s += glasses(a.glasses);
    s += '</g></g></svg>';
    return s;
  }

  const api = { svg, normalise, random, PARTS, SHIRTS, SKINS, HAIR_COLS, EYE_COLS, LEG_COLS, shirtByName, DEFAULT };
  root.HubAvatar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
