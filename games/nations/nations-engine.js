'use strict';
/* Nations — the rules. No DOM, no timers, one seeded rng.
 *
 * The display holds the one Game; every order — a phone, a house player, a
 * test — goes through `g.act(seatId, action)`, which refuses with a reason.
 *
 * The house shape (Nidavellir, Saint Petersburg, Arnak):
 *   g.prompts  the questions open now: growth (everybody at once), the active
 *              nation's turn, or a choice inside an effect.
 *   g.steps    scheduled work. `run()` takes none while a prompt is open, and
 *              anything raised while an answer is carried out goes IN FRONT of
 *              what was queued.
 *
 * **Derive, don't track.** Strength, stability and production are never
 * stored: they are counted from the board every time they are asked for, the
 * way the rulebook tells players to count them. Only what the board cannot
 * tell you is state: resources, workers taken, cards, architects.
 *
 * **Nothing is secret but the decks.** Resources, cards, workers are all in
 * front of everybody in Nations. The public view leaves out only the order of
 * the progress and event decks.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nations-data.js') : root.NationsData;
  const VERSION = 1;
  const RES = D.RES;

  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const no = why => ({ ok: false, why });
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const clone = o => JSON.parse(JSON.stringify(o));
  const C = id => D.card(id);
  const cap = (v, hi) => Math.min(v, hi);

  /* ================================================================
     Counting a nation — pure functions of a player record, so the phone and
     the house can run them on the public view too.
     ================================================================ */

  /* Every card that is "in play" on a board and so has its effects on. */
  function inPlay(p) {
    const out = [];
    for (const s of p.bm) if (s && s.card) out.push(s.card);
    for (const a of p.advisors) if (a) out.push(a);
    for (const c of p.colonies) if (c) out.push(c);
    for (const w of p.wonders) if (w) out.push(w);
    return out;
  }
  /* Cards whose fx are "always on": advisors, colonies and ready wonders
     (a wonder space may hold an advisor or a colony under a dynasty), plus
     the nation's special — or the dynasty that has replaced it. */
  function fxOf(p) {
    const out = [];
    for (const a of p.advisors) if (a) for (const f of (C(a).fx || [])) out.push({ f, card: a });
    for (const c of p.colonies) if (c) for (const f of (C(c).fx || [])) out.push({ f, card: c });
    for (const w of p.wonders) if (w) for (const f of (C(w).fx || [])) out.push({ f, card: w });
    for (const f of (p.special || [])) out.push({ f, card: p.dynasty || 'nation' });
    return out;
  }
  const hasFx = (p, key) => fxOf(p).some(x => x.f[key] != null && x.f[key] !== false);
  const sumFx = (p, key) => fxOf(p).reduce((t, x) => t + (typeof x.f[key] === 'number' ? x.f[key] : 0), 0);
  const fxVal = (p, key) => { const x = fxOf(p).find(y => y.f[key] != null && y.f[key] !== false); return x ? x.f[key] : null; };
  /* Every advisor and colony a nation has, wherever it sits. */
  const advisorsOf = p => p.advisors.filter(a => a && !C(a).permanent).concat(p.wonders.filter(w => w && C(w).type === 'advisor'));
  const coloniesOf = p => p.colonies.filter(Boolean).concat(p.wonders.filter(w => w && C(w).type === 'colony'));
  const naturalsOf = p => p.wonders.filter(w => w && C(w).type === 'natural' && w !== 's-siberia');
  const milWorkersOf = p => p.bm.reduce((t, s) => t + (s && s.card && C(s.card).type === 'military' ? s.w : 0), 0);

  /* Strength: workers on military times the card, plus every flat bonus. */
  function strengthOf(p, all) {
    let s = 0;
    for (const sl of p.bm) if (sl && sl.card && sl.w) { const c = C(sl.card); if (c.type === 'military') s += c.str * sl.w; else s += (c.prod.str || 0) * sl.w; }
    for (const a of p.advisors) if (a) s += C(a).prod.str || 0;
    for (const c of p.colonies) if (c) s += C(c).prod.str || 0;
    for (const w of p.wonders) if (w) s += C(w).prod.str || 0;
    s += sumFx(p, 'str');
    /* Sparta: exactly one worker on military. The Emperor's tokens. */
    if (milWorkersOf(p) === 1) s += sumFx(p, 'spartaStr');
    s += p.emperor || 0;
    /* Mongolia takes its workers off a Strength track. */
    s -= 3 * (p.taken.str || 0);
    s += p.temp.str || 0;
    return s;
  }
  function stabilityOf(p, all) {
    let s = 0;
    for (const sl of p.bm) if (sl && sl.card && sl.w) {
      const c = C(sl.card);
      if (c.type === 'building') s += (c.prod.stab || 0) * sl.w;
      else s -= (c.up.stab || 0) * sl.w;
    }
    for (const a of p.advisors) if (a) s += C(a).prod.stab || 0;
    for (const c of p.colonies) if (c) s += C(c).prod.stab || 0;
    for (const w of p.wonders) if (w) s += C(w).prod.stab || 0;
    s -= 3 * p.taken.stab;
    /* Each Turmoil card held this round. */
    s -= 2 * (p.turmoil || 0);
    /* Genghis Khan: every nation, his own included. */
    for (const q of (all || [p])) s += sumFx(q, 'allStab');
    /* The Kremlin: while you are the strongest. */
    const k = sumFx(p, 'kremlin');
    if (k && all && all.length > 1) {
      const mine = strengthOf(p, all);
      if (all.every(q => q === p || strengthOf(q, all) < mine)) s += k;
    }
    s += p.temp.stab || 0;
    return s;
  }
  /* What the board makes in a production phase, before conditions. */
  function baseProduction(p) {
    const out = { gold: 0, stone: 0, food: 0, book: 0 };
    const noUp = hasFx(p, 'noMilUpkeep') || !!p.temp.noUpkeep;
    for (const sl of p.bm) if (sl && sl.card && sl.w) {
      const c = C(sl.card);
      if (c.type === 'building') { for (const r of RES) out[r] += (c.prod[r] || 0) * sl.w; }
      else if (!noUp) { for (const r of RES) out[r] -= (c.up[r] || 0) * sl.w; }
    }
    for (const id of p.advisors.concat(p.colonies, p.wonders)) if (id) { const c = C(id); for (const r of RES) out[r] += c.prod[r] || 0; }
    out.food -= 3 * p.taken.food;
    return out;
  }
  const workersOf = p => p.idle + p.bm.reduce((t, s) => t + (s && s.card ? s.w : 0), 0);
  const milWorkers = p => p.bm.reduce((t, s) => t + (s && s.card && C(s.card).type === 'military' ? s.w : 0), 0);
  /* Your raid: the best military with a worker on it (never multiplied). */
  function raidOf(p) {
    let best = 0;
    for (const s of p.bm) if (s && s.card && s.w) { const c = C(s.card); if (c.type === 'military') best = Math.max(best, c.raid); }
    return best ? best + sumFx(p, 'raid') : 0;
  }
  const gaBonus = p => sumFx(p, 'gaBonus');
  const privArchOf = p => sumFx(p, 'privArch');

  /* The final score, itemised the way the score pad is. */
  function scoreOf(p, all) {
    const vp = p.res.vp;
    let colonies = 0, wonders = 0, bm = 0;
    for (const c of p.colonies) if (c) colonies += C(c).vp || 0;
    for (const w of p.wonders) if (w) wonders += C(w).vp || 0;
    let special = 0;
    let stoneX = 1;
    for (const x of fxOf(p)) {
      if (x.f.score === 'perAdvisor') special += advisorsOf(p).length;
      if (x.f.score === 'perIndColony') special += coloniesOf(p).filter(c => C(c).age === 4).length;
      if (x.f.score === 'mostWorkers') {
        const mine = workersOf(p);
        if ((all || [p]).every(q => q === p || workersOf(q) < mine)) special += 2;
      }
      /* Grand Canyon: every OTHER Natural Wonder. Titusville: stone ×2. */
      if (x.f.score === 'perNatural') special += naturalsOf(p).filter(w => w !== x.card).length;
      if (x.f.score === 'stoneDouble') stoneX = 2;
    }
    wonders += special;
    for (const s of p.bm) if (s && s.card && s.w) {
      const list = C(s.card).vp || [];
      for (let k = 0; k < Math.min(s.w, list.length); k++) bm += list[k];
    }
    const pile = p.res.gold + p.res.stone * stoneX + p.res.food + p.res.book + Math.max(0, strengthOf(p, all)) + stabilityOf(p, all);
    const resources = Math.max(0, Math.floor(pile / 10));
    return { vp, colonies, wonders, bm, resources, pile, total: vp + colonies + wonders + bm + resources };
  }

  /* ================================================================
     Setting up
     ================================================================ */
  function create(opts) {
    opts = opts || {};
    const rng = rngFrom(opts.seed == null ? Date.now() : opts.seed);
    const list = opts.players || [];
    const n = list.length;
    if (n < 2 || n > 5) throw new Error('Nations is for 2 to 5 nations here');
    let sets = (opts.sets || ['base']).filter(s => ['base', 'adv', 'exp'].indexOf(s) >= 0);
    if (sets.indexOf('base') < 0) sets.unshift('base');
    /* Five need the bigger deck (rulebook p.21). */
    if (n === 5 && sets.length === 1) sets = ['base', 'adv'];
    /* Nations: Dynasties mixes its cards into every age and is played on
       the B sides (its own nations have no A side). Promos ride along. */
    const dyn = !!opts.dyn, promo = !!opts.promo;
    if (dyn) sets.push('dyn');
    if (promo) sets.push('promo');
    const ages = Math.max(1, Math.min(4, opts.ages || 4));
    const side = dyn || opts.side === 'B' ? 'B' : 'A';
    const diff = id => D.DIFFICULTY.find(d => d.id === id) || D.DIFFICULTY[1];

    const g = {
      VERSION, n, sets, ages, side, dyn, promo, lastRound: ages * 2,
      seed: opts.seed, rng,
      round: 0, age: 1, phase: 'setup',
      log: [], prompts: [], steps: [], pn: 0, ins: 0,
      decks: {}, evDecks: {},
      board: [[], [], []], cols: D.COLUMNS[n],
      event: null, evSeen: [],
      arch: 0, war: null, passOrder: [],
      turmoil: 0, tolls: [], rolls: 0, endAfter: false, extra: null,
      order: [], cur: -1,
      result: null,
      opts: { show: !!opts.show }
    };
    for (let a = 1; a <= 4; a++) {
      g.decks[a] = shuffle(D.deck(a, sets), rng);
      g.evDecks[a] = shuffle(D.EVENTS.filter(e => e.age === a && (promo || !e.promo)).map(e => e.id), rng);
    }
    for (let r = 0; r < 3; r++) g.board[r] = new Array(g.cols).fill(null);

    /* Random player order (step 1 of the score board's setup). */
    const seats = shuffle(list.map((x, i) => i), rng);
    g.players = list.map((x, i) => ({
      id: x.id, name: x.name, hex: x.hex || '#888', bot: !!x.bot, i,
      diff: diff(x.difficulty || opts.difficulty).id,
      nation: null, side: null, special: [], specialText: '',
      res: { gold: 0, stone: 0, food: 0, book: 0, vp: 0 },
      idle: 0, taken: { food: 0, stab: 0, str: 0 }, track: { food: 4, stab: 4 }, freeTop: 0,
      bm: [], advisors: [null], colonies: [], wonders: [], wonderCap: 5, uc: null,
      privArch: 0, used: {}, passed: false, turns: 0, actionsLeft: 0,
      temp: { str: 0, stab: 0 }, leastStab: false, westphalia: 0,
      bought: { war: 0, battle: 0, colony: 0, ga: 0 }, lackVP: {}, warLoss: null,
      /* Dynasties: the cards still in hand, the one in play, Turmoil held
         this round, tokens on cards, the Emperor's tokens. */
      dynasties: [], dynasty: null, turmoil: 0, tok: {}, emperor: 0, uses: {},
      achFree: false, joseon: null, zhuKept: false, passedOver: {}, archOff: 0
    }));
    g.order = seats.slice();

    attach(g);

    /* The first round's board is dealt before anybody chooses a nation. */
    g.round = 1; g.age = 1;
    refill(g, true);
    if (side === 'B') {
      g.phase = 'nations';
      g.pool = shuffle(D.NATIONS.filter(x => dyn || !x.dyn).map(x => x.id), rng).slice(0, n);
      /* Reverse player order picks. */
      for (let k = n - 1; k >= 0; k--) g.steps.push({ k: 'pickNation', i: g.order[k] });
    } else {
      const names = shuffle(D.NATIONS.filter(x => !x.dyn).map(x => x.id), rng);
      g.order.forEach((pi, k) => g.setNation(g.players[pi], names[k], 'A'));
    }
    g.steps.push({ k: 'start' });
    g.run();
    return g;
  }

  /* Refill the progress board. Round one fills it once; after that the top
     two rows are cleared and whatever is left on the bottom row moves up to
     the top, as far left as it will go. */
  function refill(g, first) {
    const deck = g.decks[g.age];
    if (!first) {
      const left = g.board[2].filter(Boolean);
      for (const id of g.board[0].concat(g.board[1])) if (id) g.discard.push(id);
      g.board[0] = new Array(g.cols).fill(null);
      g.board[1] = new Array(g.cols).fill(null);
      g.board[2] = new Array(g.cols).fill(null);
      left.forEach((id, k) => { g.board[0][k] = id; });
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < g.cols; c++) if (!g.board[r][c] && deck.length) g.board[r][c] = deck.shift();
    /* An Axumite token goes with a card that left the board. */
    if (g.tolls) g.tolls = g.tolls.filter(t => g.board.some(row => row.indexOf(t.card) >= 0));
  }

  /* ================================================================
     The game object
     ================================================================ */
  function attach(g) {
    g.discard = [];
    const P = id => g.players.find(p => p.id === id) || null;
    const log = e => { g.log.push(Object.assign({ round: g.round }, e)); };
    const push = st => { g.steps.splice(g.ins++, 0, st); };
    /* The prompt's own number, seat and kind always win over the data: a
       prompt numbered by its payload is invisible to anybody keyed on `n`. */
    const ask = (p, t, data) => { const pr = Object.assign({}, data, { n: ++g.pn, seat: p.id, t }); g.prompts.push(pr); return pr; };
    const close = pr => { const i = g.prompts.indexOf(pr); if (i >= 0) g.prompts.splice(i, 1); };
    const all = () => g.players;
    const byOrder = () => g.order.map(i => g.players[i]);
    const str = p => strengthOf(p, all());
    const stab = p => stabilityOf(p, all());

    g.seat = P;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.promptFor = id => g.prompts.find(pr => pr.seat === id) || null;
    g.activeId = () => g.phase === 'action' && g.cur >= 0 ? g.players[g.order[g.cur]].id : null;
    g.note = e => log(e);
    g.str = str; g.stab = stab;

    g.setNation = function (p, id, side) {
      const nat = D.NATIONS.find(x => x.id === id);
      const b = side === 'B' ? nat.B : D.A_SIDE;
      p.nation = id; p.side = side;
      /* Hokkaido and the Steppe are printed empty spaces: null. */
      p.bm = b.bm.map(c => c ? { card: c, w: 0 } : null);
      p.res = Object.assign({ gold: 0, stone: 0, food: 0, book: 0, vp: 0 }, b.res, { book: 0 });
      p.idle = b.workers;
      p.track = Object.assign({}, b.track);
      p.taken = { food: 0, stab: 0, str: 0 };
      p.advisors = new Array(b.advisors).fill(null).map((x, k) => (b.startAdvisors || [])[k] || null);
      p.colonies = new Array(b.colonies).fill(null).map((x, k) => (b.startColonies || [])[k] || null);
      p.wonderCap = b.wonders;
      p.wonders = b.ready.slice();
      p.special = (b.special || []).slice();
      p.specialText = b.specialText || '';
      p.dynCovers = side === 'B' ? (b.dynCovers || null) : null;
      p.dynasties = g.dyn && side === 'B' ? D.DYNASTIES.filter(d => d.nation === id).map(d => d.id) : [];
      p.dynasty = null;
    };
    /* The first player starts on 1 book, the next on 2, and so on. */
    function startBooks() { g.order.forEach((pi, k) => { g.players[pi].res.book = k + 1; }); }

    /* ---------------- ranking ---------------- */
    const strM = p => cap(str(p), 40) - (p.westphalia || 0);
    const stabM = p => { const s = stab(p); return s < 0 ? -1 : cap(s, 15); };
    /* The one strongest (and in a five-player game the second too, unless
       tied). Nobody gains from a tie at the top. */
    function most(metric) {
      const ps = all().map(p => ({ p, v: metric(p) })).sort((a, b) => b.v - a.v);
      const top = ps.filter(x => x.v === ps[0].v);
      if (g.n < 5) return top.length === 1 ? [top[0].p] : [];
      if (top.length === 2) return top.map(x => x.p);
      if (top.length > 2) return [];
      const rest = ps.slice(1), second = rest.filter(x => x.v === rest[0].v);
      return second.length === 1 ? [top[0].p, second[0].p] : [top[0].p];
    }
    /* Everybody tied at the bottom suffers (the two weakest at five). */
    function least(metric, forced) {
      const ps = all().map(p => ({ p, v: metric(p) })).sort((a, b) => a.v - b.v);
      const out = [];
      const need = g.n < 5 ? 1 : 2;
      let i = 0;
      while (i < ps.length && out.length < need) {
        const v = ps[i].v;
        while (i < ps.length && ps[i].v === v) out.push(ps[i++].p);
      }
      if (forced) for (const p of all()) if (forced(p) && out.indexOf(p) < 0) out.push(p);
      return out;
    }
    const mostStr = () => most(strM);
    const leastStr = () => least(strM);
    const mostStab = () => most(p => p.leastStab ? -99 : stabM(p));
    const leastStab = () => least(stabM, p => p.leastStab);
    g.rank = { mostStr, leastStr, mostStab, leastStab };

    /* ---------------- resources ---------------- */
    function gain(p, res, why) {
      const got = {};
      for (const r in res) {
        const v = res[r];
        if (!v) continue;
        if (r === 'vp') { const before = p.res.vp; p.res.vp = Math.max(0, p.res.vp + v); got.vp = p.res.vp - before; continue; }
        if (v > 0) { p.res[r] += v; got[r] = (got[r] || 0) + v; }
        else lose(p, r, -v, why, got);
      }
      return got;
    }
    /* A loss you cannot cover: lose what you have, 1 VP (once a round for
       each kind), and a book for each one missing. */
    function lose(p, r, amount, why, got) {
      got = got || {};
      if (r === 'book') { loseBooks(p, amount, why, got); return got; }
      if (p.res[r] >= amount) { p.res[r] -= amount; got[r] = (got[r] || 0) - amount; return got; }
      const missing = amount - p.res[r];
      got[r] = (got[r] || 0) - p.res[r];
      p.res[r] = 0;
      lackVP(p, r, why, got);
      loseBooks(p, missing, why, got, r);
      return got;
    }
    function lackVP(p, r, why, got) {
      if (p.lackVP[r]) return;
      p.lackVP[r] = true;
      if (hasFx(p, 'noLackVP')) { log({ t: 'spared', by: p.id, res: r }); return; }
      if (p.res.vp > 0) { p.res.vp--; got.vp = (got.vp || 0) - 1; }
      log({ t: 'short', by: p.id, res: r, why: why || null });
    }
    function loseBooks(p, n, why, got, forRes) {
      const take = Math.min(p.res.book, n);
      p.res.book -= take;
      got.book = (got.book || 0) - take;
      const rest = n - take;
      if (rest <= 0) return;
      lackVP(p, 'book', why, got);
      /* Books at nothing: one other resource of your choice per book. */
      const have = p.res.gold + p.res.stone + p.res.food;
      if (have <= rest) {
        for (const r of ['gold', 'stone', 'food']) { got[r] = (got[r] || 0) - p.res[r]; p.res[r] = 0; }
        return;
      }
      const opts = ['gold', 'stone', 'food'].filter(r => p.res[r] > 0);
      if (opts.length === 1) { p.res[opts[0]] -= rest; got[opts[0]] = (got[opts[0]] || 0) - rest; return; }
      ask(p, 'mix', { owe: rest, from: ['gold', 'stone', 'food'], why: 'You are out of books: pay ' + rest + ' other resource' + (rest > 1 ? 's' : '') + ' instead', what: 'books' });
    }

    /* ---------------- workers ---------------- */
    /* The population track has a Food and a Stability section — Mongolia's
       a Food and a Strength one. */
    const SECTIONS = ['food', 'stab', 'str'];
    const sectionsOpen = p => SECTIONS.filter(s => p.track[s] && (p.taken[s] || 0) < p.track[s]);
    const canTake = p => p.freeTop > 0 || sectionsOpen(p).length > 0;
    function takeWorker(p, section) {
      if (p.freeTop > 0) { p.freeTop--; p.idle++; log({ t: 'worker', by: p.id, section: 'top' }); tookWorker(p); return true; }
      if (!section || !p.track[section] || (p.taken[section] || 0) >= p.track[section]) return false;
      p.taken[section] = (p.taken[section] || 0) + 1; p.idle++;
      log({ t: 'worker', by: p.id, section });
      tookWorker(p);
      return true;
    }
    /* Ming: every worker taken comes with food. */
    function tookWorker(p) {
      for (const x of fxOf(p)) if (x.f.onTakeWorker) { gain(p, x.f.onTakeWorker); log({ t: 'gain', by: p.id, res: x.f.onTakeWorker, why: 'takeWorker', card: x.card }); }
    }
    function returnWorker(p, from, section) {
      if (from === 'idle') { if (p.idle < 1) return false; p.idle--; }
      else { const s = p.bm[from]; if (!s || !s.w) return false; s.w--; }
      if (section && p.taken[section] > 0) p.taken[section]--;
      else {
        const back = ['stab', 'str', 'food'].find(s => p.taken[s] > 0);
        if (back) p.taken[back]--; else p.freeTop++;
      }
      log({ t: 'returned', by: p.id, from, section: section || null });
      return true;
    }
    const SECTION_NAME = { food: 'Food', stab: 'Stability', str: 'Strength' };
    const SECTION_SAYS = { food: '3 more food a round', stab: '3 less stability', str: '3 less strength' };

    /* ---------------- removals: "if X: remove" ---------------- */
    function checkRemovals() {
      for (let loop = 0; loop < 6; loop++) {
        let any = false;
        const ls = leastStab(), lw = leastStr();
        const hits = (p, f) => (f.remove === 'leastStab' && ls.indexOf(p) >= 0) ||
          (f.remove === 'leastStr' && lw.indexOf(p) >= 0) ||
          (f.remove === 'milWorker' && milWorkers(p) > 0) ||
          (f.remove === 'stabOver2' && stab(p) > 2) ||
          (f.lostIf === 'leastStab' && ls.indexOf(p) >= 0);
        for (const p of all()) {
          p.advisors.forEach((a, k) => {
            if (!a) return;
            for (const f of (C(a).fx || [])) {
              if (hits(p, f)) { p.advisors[k] = null; g.discard.push(a); any = true; log({ t: 'removed', by: p.id, card: a, why: f.remove }); break; }
            }
          });
          /* An advisor in a wonder space, and a wonder that is lost. */
          p.wonders.slice().forEach(w => {
            if (!w) return;
            for (const f of (C(w).fx || [])) {
              if (hits(p, f)) { p.wonders.splice(p.wonders.indexOf(w), 1); g.discard.push(w); any = true; log({ t: 'removed', by: p.id, card: w, why: f.remove || f.lostIf }); break; }
            }
          });
          if (any) syncAdvisors(p);
        }
        if (!any) return;
      }
    }
    g.checkRemovals = checkRemovals;

    /* ---------------- the step loop ---------------- */
    function run() {
      let guard = 0;
      while (!g.prompts.length && g.steps.length && g.phase !== 'over') {
        if (++guard > 100000) throw new Error('nations: runaway steps');
        const st = g.steps.shift();
        g.ins = 0;
        exec(st);
      }
    }
    g.run = run;

    function exec(st) {
      switch (st.k) {
        case 'pickNation': {
          const p = g.players[st.i];
          const options = g.pool.filter(id => !g.players.some(q => q.nation === id)).map(id => {
            const nat = D.NATIONS.find(x => x.id === id);
            return { id, label: nat.name + (nat.dyn ? '' : ' (B side)'), sub: nat.B.specialText,
              dynasties: g.dyn ? D.DYNASTIES.filter(d => d.nation === id).map(d => d.id) : undefined };
          });
          if (options.length === 1) { g.setNation(p, options[0].id, 'B'); log({ t: 'nation', by: p.id, nation: options[0].id, side: 'B' }); return; }
          ask(p, 'nation', { why: 'Choose your nation', options, sides: true });
          return;
        }
        case 'start':
          startBooks();
          g.phase = 'growth';
          log({ t: 'start', order: byOrder().map(p => p.id), nations: all().map(p => ({ id: p.id, nation: p.nation, side: p.side })) });
          push({ k: 'growth' });
          return;
        case 'round': {
          g.round++;
          g.age = Math.ceil(g.round / 2);
          refill(g, false);
          log({ t: 'round', n: g.round, age: g.age });
          push({ k: 'growth' });
          return;
        }
        case 'growth': {
          g.phase = 'growth';
          for (const p of all()) {
            const bonus = D.DIFFICULTY.find(d => d.id === p.diff).bonus;
            const options = [];
            if (p.freeTop > 0) options.push({ id: 'worker:top', label: 'Grow: take the spare worker' });
            else for (const s of sectionsOpen(p)) options.push({ id: 'worker:' + s, label: 'Grow: take a worker from the ' + SECTION_NAME[s] + ' track', sub: SECTION_SAYS[s] });
            /* Mali's gold and the Spice Islands come on top of the bonus. */
            const plus = sumFx(p, 'growthPlus');
            for (const r of ['food', 'stone', 'gold']) {
              const k = bonus + plus + fxOf(p).reduce((t, x) => t + ((x.f.growthBonus && x.f.growthBonus[r]) || 0), 0);
              options.push({ id: 'bonus:' + r, label: '+' + k + ' ' + r, res: r, n: k });
            }
            ask(p, 'growth', { why: 'Growth: a worker, or ' + bonus + ' of one resource', options });
          }
          push({ k: 'event' });
          return;
        }
        case 'event': {
          const deck = g.evDecks[g.age];
          const chooser = all().find(p => hasFx(p, 'eventChoose'));
          if (chooser && deck.length >= 2) {
            const two = deck.splice(0, 2);
            ask(chooser, 'choice', { what: 'event', why: 'Machiavelli: choose this round’s event', options: two.map(id => ({ id, label: D.event(id).a.name + ' / ' + D.event(id).b.name, event: id })), two });
            push({ k: 'arch' });
            return;
          }
          g.event = deck.shift();
          g.evSeen.push(g.event);
          log({ t: 'event', ev: g.event });
          push({ k: 'arch' });
          return;
        }
        case 'arch': {
          const ev = D.event(g.event);
          g.arch = D.ARCHITECTS[g.n] + ev.arch;
          /* Dynasties: as many Turmoil cards as architects (six in the box). */
          if (g.dyn) g.turmoil = Math.min(D.TURMOIL, g.arch);
          for (const p of all()) { p.privArch = privArchOf(p); p.used = {}; p.uses = {}; p.turns = 0; p.passed = false; }
          g.passOrder = [];
          g.phase = 'action';
          log({ t: 'actions', arch: g.arch, turmoil: g.dyn ? g.turmoil : undefined });
          g.cur = -1;
          /* Axumite Kingdom marks a card; the Jagiellonians may buy a turn. */
          for (const p of byOrder()) if (hasFx(p, 'axumite')) push({ k: 'axumite', seat: p.id });
          for (const p of byOrder()) if (hasFx(p, 'extraFirst')) push({ k: 'jagiello', seat: p.id });
          push({ k: 'next' });
          return;
        }
        case 'axumite': return askAxumite(P(st.seat));
        case 'jagiello': return askJagiello(P(st.seat));
        case 'extraTurn': return extraTurn(P(st.seat));
        case 'next': return nextTurn();
        case 'again': { const p = P(st.seat); if (p.passed) { push({ k: 'next' }); return; } turnAsk(p, p.moreWhy || 'Sun Tzu: your second action'); return; }
        case 'resolve': return resolve();
        case 'prod': return production();
        case 'order': return playerOrder();
        case 'war': return warStep();
        case 'fx': return eventFx(st);
        case 'fxApply': return st.fn();
        case 'famine': return famine();
        case 'ageEnd': return ageEnd();
        case 'endRound': return endRound();
        case 'ready': return wonderReady(P(st.seat));
        case 'discovered': return discovered(P(st.seat));
        case 'vikingTax': return askVikingTax(P(st.seat));
      }
    }

    /* ================================================================
       The action phase
       ================================================================ */
    function nextTurn() {
      checkRemovals();
      /* Actions owed to the nation that just played (Wardenclyffe Tower). */
      const now = g.cur >= 0 ? g.players[g.order[g.cur]] : null;
      if (now && now.bonus > 0 && !now.passed) { now.bonus--; turnAsk(now, now.moreWhy || 'An extra action'); return; }
      const k = g.n;
      const skipped = [];
      for (let step = 1; step <= k; step++) {
        const i = (g.cur + step + k) % k;
        const p = g.players[g.order[i]];
        if (p.passed) { skipped.push(p); continue; }
        /* Passed and skipped over while somebody plays on: Øresund Dues,
           Arabian Nights. */
        for (const q of skipped) passedOver(q);
        g.cur = i;
        openTurn(p);
        return;
      }
      g.cur = -1;
      push({ k: 'resolve' });
    }
    function passedOver(p) {
      const got = {};
      for (const x of fxOf(p)) if (x.f.passedOver) for (const r in x.f.passedOver) got[r] = (got[r] || 0) + x.f.passedOver[r];
      for (const r in p.passedOver) got[r] = (got[r] || 0) + p.passedOver[r];
      if (Object.keys(got).length) { gain(p, got); log({ t: 'gain', by: p.id, res: got, why: 'passedOver' }); }
    }
    /* The turn question, with what this nation may do in it. */
    function turnAsk(p, why, extra) {
      const exploreOnly = !!(p.uc && C(p.uc.card).type === 'natural');
      ask(p, 'turn', Object.assign({ why: exploreOnly ? (why === 'Your turn' ? 'Your turn — explore ' + C(p.uc.card).name : why) : why, exploreOnly, what: exploreOnly ? 'explore' : undefined }, extra || {}));
    }
    function openTurn(p) {
      p.turns++;
      if (p.turns === 1 && hasFx(p, 'twoFirst')) p.actionsLeft = 2; else p.actionsLeft = 1;
      const skip = p.turns === 1 && hasFx(p, 'skipFirst');
      if (skip) { ask(p, 'turn', { why: 'Buddha: your first turn is skipped', skipOnly: true }); return; }
      turnAsk(p, 'Your turn');
    }
    /* The Jagiellonians' bought action, before anybody's first turn. */
    function extraTurn(p) {
      g.cur = g.order.indexOf(g.idx(p.id));
      g.extra = p.id;
      p.actionsLeft = 1;
      turnAsk(p, 'Jagiellonian Dynasty: your extra action', { extraOnly: true });
    }
    function afterAction(p) {
      checkRemovals();
      p.achFree = false;
      if (g.extra === p.id) { g.extra = null; g.cur = -1; push({ k: 'next' }); return; }
      /* A step, not a question: whatever the action set off (a wonder
         finishing) happens before the second action is offered. */
      if (p.actionsLeft > 1 && !p.passed) { p.actionsLeft--; push({ k: 'again', seat: p.id }); return; }
      push({ k: 'next' });
    }

    /* ---------------- answering ---------------- */
    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The game is over.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const mine = g.prompts.filter(pr => pr.seat === seatId);
      if (!mine.length) return no('It is not your turn.');
      let pr = a.n != null ? mine.find(x => x.n === a.n) : (mine.length === 1 ? mine[0] : null);
      if (!pr) return no('That question has moved on.');
      g.ins = 0;
      let r;
      try { r = answer(p, pr, a); }
      catch (e) { r = no('That did not work: ' + e.message); }
      if (!r.ok) return r;
      run();
      return r;
    };
    const FITS = {
      nation: ['nation'], growth: ['growth'], choice: ['pick'], mix: ['mix'],
      turn: ['buy', 'deploy', 'undeploy', 'hire', 'special', 'pass', 'skip', 'turmoil', 'explore']
    };
    function answer(p, pr, a) {
      if (!FITS[pr.t] || FITS[pr.t].indexOf(a.t) < 0) return no(pr.t === 'turn' ? 'That is not something you can do now.' : 'Answer the question on your screen first.');
      switch (pr.t) {
        case 'nation': {
          const o = pr.options.find(x => x.id === a.nation);
          if (!o) return no('That nation is not on offer.');
          /* A Dynasties game is played on the B sides; its nations have no other. */
          const side = a.side === 'A' && !g.dyn && !D.NATIONS.find(x => x.id === o.id).dyn ? 'A' : 'B';
          close(pr);
          g.setNation(p, o.id, side);
          log({ t: 'nation', by: p.id, nation: o.id, side });
          return yes();
        }
        case 'growth': {
          const o = pr.options.find(x => x.id === a.pick);
          if (!o) return no('Choose one of the options.');
          close(pr);
          const [kind, what] = o.id.split(':');
          if (kind === 'worker') {
            takeWorker(p, what === 'top' ? null : what);
            /* Achaemenid: the new worker may go to work free; Mauryan: 2 more. */
            if (hasFx(p, 'growthFreeDeploy')) p.achFree = true;
            const extra = sumFx(p, 'growthExtra');
            if (extra) askTake(p, D.dynasty(p.dynasty) ? D.dynasty(p.dynasty).name : 'Growth', extra, true);
          }
          else { gain(p, { [what]: o.n }); log({ t: 'growth', by: p.id, res: what, n: o.n }); }
          return yes();
        }
        case 'mix': {
          const pay = cleanMix(a.pay);
          const tot = RES.reduce((t, r) => t + pay[r], 0);
          for (const r of RES) if (pay[r] && pr.from.indexOf(r) < 0) return no('Not ' + r + '.');
          for (const r of RES) if (pay[r] > p.res[r]) return no('You do not have that much ' + r + '.');
          /* Other losses may have landed since the question was asked. */
          const owe = Math.min(pr.owe, pr.from.reduce((t, r) => t + p.res[r], 0));
          if (tot !== owe) return no('Pay exactly ' + owe + '.');
          close(pr);
          for (const r of RES) p.res[r] -= pay[r];
          log({ t: 'paidMix', by: p.id, pay, what: pr.what || null });
          if (pr.then) pr.then(pay);
          return yes();
        }
        case 'choice': {
          const o = pr.options.find(x => x.id === a.pick);
          if (!o) return no('Choose one of the options.');
          close(pr);
          if (pr.what === 'event') {
            g.event = o.id; g.evSeen.push(o.id);
            for (const id of pr.two) if (id !== o.id) g.evDecks[g.age].push(id);
            log({ t: 'event', ev: g.event, chosenBy: p.id });
            return yes();
          }
          if (pr.then) pr.then(o.id, o);
          return yes();
        }
        case 'turn': return turnAct(p, pr, a);
      }
      return no('Nothing to answer.');
    }
    function cleanMix(pay) {
      const out = { gold: 0, stone: 0, food: 0, book: 0 };
      if (pay && typeof pay === 'object') for (const r of RES) out[r] = Math.max(0, Math.floor(+pay[r] || 0));
      return out;
    }

    function turnAct(p, pr, a) {
      if (pr.skipOnly && a.t !== 'skip' && a.t !== 'pass' && a.t !== 'undeploy') return no('Buddha: this turn is skipped.');
      if (pr.exploreOnly && a.t !== 'explore' && a.t !== 'undeploy') return no('You are exploring ' + C(p.uc.card).name + ': exploring is your only action until it is discovered.');
      if (pr.extraOnly && a.t === 'pass') return no('This is an extra action — take one, or skip it.');
      if (a.t === 'skip' && pr.extraOnly) { close(pr); log({ t: 'skip', by: p.id, extra: true }); afterAction(p); return yes(); }
      let r;
      switch (a.t) {
        case 'undeploy': {
          const s = p.bm[a.slot];
          if (!s || !s.card || !s.w) return no('No worker there.');
          s.w--; p.idle++;
          log({ t: 'undeploy', by: p.id, card: s.card });
          checkRemovals();
          /* Free: the same question stays open, renumbered. */
          close(pr); ask(p, 'turn', { why: pr.why, skipOnly: pr.skipOnly, exploreOnly: pr.exploreOnly, extraOnly: pr.extraOnly });
          return yes();
        }
        case 'explore': r = doExplore(p); break;
        case 'turmoil': r = doTurmoil(p, a); break;
        case 'skip':
          if (!pr.skipOnly) return no('Take an action or pass.');
          close(pr); log({ t: 'skip', by: p.id }); p.actionsLeft = 1; afterAction(p); return yes();
        case 'pass':
          close(pr); doPass(p); push({ k: 'next' }); return yes();
        case 'buy': r = doBuy(p, a, false); break;
        case 'deploy': r = doDeploy(p, a, false); break;
        case 'hire': r = doHire(p, a); break;
        case 'special': r = doSpecial(p, a); break;
      }
      if (!r || !r.ok) return r || no('Nothing happened.');
      close(pr);
      afterAction(p);
      return r;
    }

    function doPass(p) {
      p.passed = true;
      g.passOrder.push(p.id);
      const k = g.passOrder.length;
      log({ t: 'pass', by: p.id, k });
      const firstish = k === 1 || (g.n === 5 && k === 2);
      for (const x of fxOf(p)) if (x.f.passFirst && firstish) { gain(p, x.f.passFirst); log({ t: 'gain', by: p.id, res: x.f.passFirst, why: 'passFirst', card: x.card }); }
      /* The last to pass: Venice, and the Coffee House per worker on it. */
      if (k === g.n) {
        for (const x of fxOf(p)) if (x.f.passLast) { gain(p, x.f.passLast); log({ t: 'gain', by: p.id, res: x.f.passLast, why: 'passLast', card: x.card }); }
        for (const s of p.bm) if (s && s.card && s.w && C(s.card).passLastPer) { const got = mul(C(s.card).passLastPer, s.w); gain(p, got); log({ t: 'gain', by: p.id, res: got, why: 'passLast', card: s.card }); }
      }
    }

    /* ---------------- buying ---------------- */
    /* The 4th row is Victoria Falls' colonies, at 4 gold. */
    const rowPrice = r => r === 3 ? 4 : D.ROW_PRICE[r];
    function priceFor(p, card, row, free) {
      if (free) return 0;
      let price = rowPrice(row);
      for (const x of fxOf(p)) if (x.f.rowDiscount && x.f.rowDiscount.row === row) price = Math.max(0, price - x.f.rowDiscount.n);
      if (card.type === 'battle') {
        for (const q of all()) if (q !== p) price += sumFx(q, 'othersBattleCost');
        price = Math.max(0, price - sumFx(p, 'battleDiscount'));
      }
      return price;
    }
    /* Axumite Kingdom's token: anybody else buying the marked card pays its
       owner 3 gold on top. */
    function axumiteToll(p, id) {
      const t = g.tolls.find(x => x.card === id);
      return t && t.by !== p.id ? t.n : 0;
    }
    /* Room for a Natural Wonder: free wonder spaces, plus any that hold
       something it may cover (anything but another Natural Wonder). */
    const coverable = w => w && C(w).type !== 'natural';
    const naturalRoom = p => (p.wonderCap - p.wonders.length) + p.wonders.filter(coverable).length;
    const freeWonderSpace = p => p.wonders.length < p.wonderCap;
    function gaNumbers(p, card) {
      const disc = gaBonus(p) + sumFx(p, 'gaVpDiscount');
      const vpCost = Math.max(0, (card.alt || card.vpCost != null ? card.vpCost : g.age) - disc);
      let gaGain = 2 + gaBonus(p);
      if (card.res === 'book') gaGain += sumFx(p, 'gaBookPlus');
      return { vpCost, gaGain, vpGain: 1 + sumFx(p, 'gaVpPlus') };
    }
    /* Everything a buy would need, or why it cannot be. Shared with the
       phone through seatView so the handset never offers a refusal. */
    function buyCheck(p, r, c, free) {
      const id = g.board[r] && g.board[r][c];
      if (!id) return no('There is no card there.');
      const card = C(id);
      const price = priceFor(p, card, r, free);
      const toll = free ? 0 : axumiteToll(p, id);
      if (p.res.gold < price + toll) return no('You need ' + (price + toll) + ' gold' + (toll ? ' (with ' + toll + ' for the Axumite token)' : '') + '.');
      const need = {};
      if (toll) need.toll = toll;
      switch (card.type) {
        case 'war':
          if (g.war) return no('Only one War a round — ' + C(g.war.card).name + ' is already bought.');
          if (hasFx(p, 'noWar')) return no('Alfred Nobel: you may not buy a War.');
          /* Kingdom of León raids with its War. */
          if (hasFx(p, 'warAsBattle') && raidOf(p)) need.pick = ['book', 'food', 'stone'];
          break;
        case 'battle':
          if (!raidOf(p)) return no('You need a worker on a military card to fight a Battle.');
          need.pick = ['book', 'food', 'stone'];
          break;
        case 'colony': {
          if (hasFx(p, 'noColonyNatural')) return no('Edo Period: you may not buy colonies.');
          const req = Math.max(0, card.req + all().reduce((t, q) => t + sumFx(q, 'allColonyReq'), 0) + sumFx(p, 'colonyReq'));
          if (str(p) < req) return no('This colony needs ' + req + ' strength; you have ' + str(p) + '.');
          if (p.colonies.every(Boolean)) need.slot = p.colonies.map((x, k) => k);
          if (hasFx(p, 'colonyOnWonder') && freeWonderSpace(p)) need.wonderSpot = true;
          if (hasFx(p, 'colonyDiscard')) need.discardOpt = fxVal(p, 'colonyDiscard');
          need.req = req;
          break;
        }
        case 'building': case 'military':
          need.slot = p.bm.map((x, k) => k);
          break;
        case 'advisor': {
          /* The Emperor: an advisor bought is discarded for his token. */
          if (p.advisors.some(a => a && C(a).fx.some(f => f.emperor))) { need.emperor = true; break; }
          const spots = advisorSpots(p);
          if (spots.length > 1) need.slot = spots;
          if (hasFx(p, 'advisorOnWonder') && freeWonderSpace(p)) need.wonderSpot = true;
          break;
        }
        case 'natural':
          if (hasFx(p, 'noColonyNatural')) return no('Edo Period: you may not buy Natural Wonders.');
          if (naturalRoom(p) < (card.spaces || 1)) return no('You have no wonder space left that ' + card.name + ' could go in' + (card.spaces > 1 ? ' — it needs two' : '') + '.');
          break;
        case 'golden': {
          const n = gaNumbers(p, card);
          need.pick = [card.alt ? 'alt' : 'res', 'vp'];
          need.vpCost = n.vpCost;
          need.gaGain = n.gaGain;
          need.vpGain = n.vpGain;
          if (card.alt) need.alt = card.alt;
          break;
        }
      }
      return yes({ id, card, price, need });
    }
    /* Where an advisor can sit: the advisor space(s), plus a Porcelain
       Tower's. A Zhu Xi kept after being replaced is not one of them. */
    function advisorSpots(p) { return p.advisors.map((x, k) => k).filter(k => !(p.zhuKept && p.advisors[k] === 'zhuxi' && k > 0)); }
    /* One advisor space, plus one for a ready Porcelain Tower, plus one for a
       kept Zhu Xi. When the tower goes (covered, or lost), so does whatever
       advisor sat on it; an emptied space goes first. */
    function syncAdvisors(p) {
      /* A kept Zhu Xi who has since gone leaves his space behind: close it. */
      if (p.zhuKept && p.advisors.indexOf('zhuxi') < 0) {
        p.zhuKept = false;
        const k = p.advisors.lastIndexOf(null);
        if (k > 0) p.advisors.splice(k, 1);
      }
      const want = 1 + (p.wonders.some(w => w && C(w).fx.some(f => f.advisorSpace)) ? 1 : 0) + (p.zhuKept ? 1 : 0);
      while (p.advisors.length > want) { const a = p.advisors.pop(); if (a) { g.discard.push(a); log({ t: 'removed', by: p.id, card: a, why: 'tower' }); } }
      while (p.advisors.length < want) p.advisors.push(null);
    }
    g.syncAdvisors = syncAdvisors;
    function doBuy(p, a, free) {
      const r = +a.r, c = +a.c;
      const chk = buyCheck(p, r, c, free);
      if (!chk.ok) return chk;
      const { id, card, price, need } = chk;
      let slot = a.slot != null ? +a.slot : null;
      const onWonder = slot === -2 && need.wonderSpot;
      const discardIt = card.type === 'colony' && a.pick === 'discard' && need.discardOpt;
      if (need.slot && !onWonder && !discardIt && (slot == null || need.slot.indexOf(slot) < 0)) {
        if (card.type === 'building' || card.type === 'military') return no('Choose which space it goes in.');
        if (card.type === 'colony') return no('Your colony spaces are full — choose one to give up.');
        if (card.type === 'advisor') slot = 0;
      }
      let pick = a.pick;
      let payVP = null;
      if (card.type === 'battle' && need.pick.indexOf(pick) < 0) return no('Choose books, food or stone.');
      if (card.type === 'war' && need.pick && need.pick.indexOf(pick) < 0) return no('Choose what León raids: books, food or stone.');
      if (card.type === 'golden') {
        if (need.pick.indexOf(pick) < 0) return no('Choose one of the two options.');
        if (pick === 'vp') {
          payVP = cleanMix(a.pay);
          const tot = RES.reduce((t, k) => t + payVP[k], 0);
          if (tot !== need.vpCost) return no('The VP costs ' + need.vpCost + ' resources.');
          for (const k of RES) if (payVP[k] > p.res[k] - (k === 'gold' ? price + (need.toll || 0) : 0)) return no('You do not have that much ' + k + '.');
        }
        if (pick === 'alt') { const why = altCheck(p, card); if (why) return no(why); }
      }
      /* Pay and take. */
      const goldBefore = p.res.gold;
      p.res.gold -= price;
      g.board[r][c] = null;
      const ev = { t: 'buy', by: p.id, card: id, price, row: r, col: c };
      const t = g.tolls.find(x => x.card === id);
      if (t) {
        if (need.toll) { const o = P(t.by); p.res.gold -= need.toll; o.res.gold += need.toll; ev.toll = { to: o.id, n: need.toll }; }
        g.tolls.splice(g.tolls.indexOf(t), 1);
      }
      const name = card.name;
      const others = fn => { for (const q of all()) if (q !== p) for (const x of fxOf(q)) fn(q, x.f, x.card); };
      switch (card.type) {
        case 'building': case 'military': {
          const old = p.bm[slot];
          if (old && old.card) {
            p.idle += old.w;
            ev.replaced = old.card; ev.freed = old.w;
            if (card.type === 'building' && C(old.card).type === 'building' && card.age > C(old.card).age) {
              for (const x of fxOf(p)) if (x.f.replaceNewer) { ev.himeji = x.f.replaceNewer; gain(p, x.f.replaceNewer); }
            }
            if (old.card.indexOf('s-') !== 0) g.discard.push(old.card);
          }
          p.bm[slot] = { card: id, w: 0 };
          ev.slot = slot;
          if (card.type === 'building' && p.idle > 0 && hasFx(p, 'mitDeploy')) { p.bm[slot].w = 1; p.idle--; ev.mit = true; }
          break;
        }
        case 'colony': {
          p.bought.colony++;
          if (discardIt) { g.discard.push(id); ev.discarded = true; gain(p, need.discardOpt); ev.gain = Object.assign({}, need.discardOpt); }
          else if (onWonder) { p.wonders.push(id); ev.onWonder = true; }
          else {
            let k = p.colonies.indexOf(null);
            if (k < 0) { k = slot; ev.replaced = p.colonies[k]; if (p.colonies[k].indexOf('s-') !== 0) g.discard.push(p.colonies[k]); }
            p.colonies[k] = id;
          }
          others((q, f, src) => { if (f.othersColony) { gain(q, f.othersColony); log({ t: 'gain', by: q.id, res: f.othersColony, why: 'othersColony', card: src }); } });
          others((q, f, src) => { if (f.othersBattleColony) { gain(q, f.othersBattleColony); log({ t: 'gain', by: q.id, res: f.othersBattleColony, why: 'othersColony', card: src }); } });
          break;
        }
        case 'advisor': {
          if (need.emperor) { g.discard.push(id); p.emperor++; ev.emperor = p.emperor; break; }
          if (onWonder) { p.wonders.push(id); ev.onWonder = true; }
          else {
            let k = slot != null && slot >= 0 && slot < p.advisors.length ? slot : (p.advisors.indexOf(null) >= 0 ? p.advisors.indexOf(null) : 0);
            const old = p.advisors[k];
            if (old === 'zhuxi' && !p.zhuKept) { p.zhuKept = true; p.advisors.push('zhuxi'); ev.kept = 'zhuxi'; }
            else if (old) { ev.replaced = old; g.discard.push(old); }
            p.advisors[k] = id;
            ev.slot = k;
          }
          if (id === 'hypatia') p.tok.hypatia = 0;
          break;
        }
        case 'wonder': case 'natural': {
          if (p.uc) { ev.replaced = p.uc.card; ev.lostArch = p.uc.built; g.discard.push(p.uc.card); }
          p.uc = { card: id, built: 0 };
          break;
        }
        case 'war': {
          g.war = { card: id, str: str(p), by: p.id };
          ev.str = g.war.str;
          p.bought.war++;
          /* The Golden Horde takes the gold paid for somebody else's War. */
          others((q, f, src) => { if (f.othersWarGold && price) { gain(q, { gold: price }); log({ t: 'gain', by: q.id, res: { gold: price }, why: 'othersWar', card: src }); } });
          if (need.pick) { const n = raidOf(p); ev.pick = pick; ev.n = n; gain(p, { [pick]: n }); ev.leon = true; }
          break;
        }
        case 'battle': {
          const n = raidOf(p);
          ev.pick = pick; ev.n = n;
          gain(p, { [pick]: n });
          p.bought.battle++;
          g.discard.push(id);
          others((q, f, src) => { if (f.othersBattleColony) { gain(q, f.othersBattleColony); log({ t: 'gain', by: q.id, res: f.othersBattleColony, why: 'othersBattle', card: src }); } });
          /* The Assassin, with a worker on it: everybody else pays 3 food or
             loses their advisor (chosen in reverse order, then done). */
          if (p.bm.some(s => s && s.card && s.w && C(s.card).assassin)) {
            for (const q of byOrder().slice().reverse()) if (q !== p) push({ k: 'fxApply', fn: () => eitherAsk(q, [{ gain: { food: -3 } }, { removeAdvisor: true }], 'Assassin', null) });
          }
          break;
        }
        case 'golden': {
          p.bought.ga++;
          ev.pick = pick;
          if (pick === 'res') { const k = need.gaGain; gain(p, { [card.res]: k }); ev.gain = { [card.res]: k }; }
          else if (pick === 'alt') altGA(p, card, ev);
          else { for (const k of RES) p.res[k] -= payVP[k]; p.res.vp += need.vpGain; ev.pay = payVP; ev.gain = { vp: need.vpGain }; }
          g.discard.push(id);
          /* The Abbasids may buy the same VP. */
          for (const q of byOrder().slice().reverse()) if (q !== p && hasFx(q, 'othersGAvp')) push({ k: 'fxApply', fn: () => askAbbasid(q, card) });
          break;
        }
      }
      log(ev);
      /* What buying set off. */
      const fire = (key, test) => {
        for (const x of fxOf(p)) if (x.f.on === key && (!test || test(x.f))) {
          if (x.f.gain) { gain(p, x.f.gain); log({ t: 'gain', by: p.id, res: x.f.gain, why: key, card: x.card }); }
          if (x.f.takeWorker) push({ k: 'fxApply', fn: () => askTake(p, cardName(x.card), x.f.takeWorker, true) });
          if (x.f.freeArch) push({ k: 'fxApply', fn: () => askFreeArch(p, x.f.freeArch, cardName(x.card)) });
          if (x.f.noUpkeepRound) { p.temp.noUpkeep = true; log({ t: 'noUpkeep', by: p.id, card: x.card }); }
        }
      };
      if (price > 0) fire('buyAt', f => f.price === price);
      if (card.type === 'golden') fire('buyGA');
      if (card.type === 'war') { fire('buyWar'); fire('buyWarOrBattle'); if (ev.leon) { fire('buyBattle'); fire('buyWarOrBattle'); } }
      if (card.type === 'battle') { fire('buyBattle'); fire('buyWarOrBattle'); }
      if (card.type === 'colony') fire('buyColony');
      if (card.type === 'building') fire('buyBuilding');
      if (card.type === 'advisor') fire('buyAdvisor');
      lastGold(p, goldBefore);
      return yes();
    }
    const cardName = id => id === 'nation' ? 'Your nation' : (C(id) ? C(id).name : (D.dynasty(id) ? D.dynasty(id).name : ''));

    /* ---------------- Golden Ages with their own first option ---------------- */
    function altCheck(p, card) {
      if (card.alt === 'antikythera' && !g.decks[Math.min(4, g.age + 1)].length) return 'There are no cards left to turn up.';
      return '';
    }
    function altGA(p, card, ev) {
      ev.alt = card.alt;
      switch (card.alt) {
        case 'arabian':
          p.passedOver.book = (p.passedOver.book || 0) + 2;
          break;
        case 'levite':
          g.arch += 3; p.archOff += 1;
          break;
        case 'powergrid': {
          const deck = g.decks[g.age];
          let k = 0;
          for (let r = 0; r < 3; r++) for (let c = 0; c < g.cols; c++) if (!g.board[r][c] && deck.length) { g.board[r][c] = deck.shift(); k++; }
          ev.filled = k;
          gain(p, { gold: 2 }); ev.gain = { gold: 2 };
          break;
        }
        case 'uncletom':
          /* Every nation, the buyer too: the buildings that cost 1 stone to
             staff are turned face down — empty spaces now. */
          for (const q of all()) q.bm.forEach((s, k) => {
            if (!s || !s.card) return;
            const c = C(s.card);
            if (c.type !== 'building' || c.dep !== 1) return;
            q.idle += s.w;
            if (s.card.indexOf('s-') !== 0) g.discard.push(s.card);
            log({ t: 'removed', by: q.id, card: s.card, why: 'uncletom' });
            q.bm[k] = null;
          });
          break;
        case 'antikythera': {
          /* Turn up the next age's cards until a Golden Age, a wonder or a
             building; the others are discarded, that one is taken free. */
          const deck = g.decks[Math.min(4, g.age + 1)];
          const seen = [];
          let found = null;
          while (deck.length && !found) {
            const id = deck.shift();
            if (['golden', 'wonder', 'building'].indexOf(C(id).type) >= 0) found = id; else { seen.push(id); g.discard.push(id); }
          }
          ev.turned = seen.concat(found ? [found] : []);
          if (found) push({ k: 'fxApply', fn: () => takeFree(p, found, 'Antikythera Mechanism') });
          break;
        }
      }
    }
    /* A card come by for nothing outside the board (Antikythera). */
    function takeFree(p, id, why) {
      const card = C(id);
      log({ t: 'freeCard', by: p.id, card: id, why });
      if (card.type === 'wonder') {
        if (p.uc) { g.discard.push(p.uc.card); log({ t: 'removed', by: p.id, card: p.uc.card, why: 'replaced' }); }
        p.uc = { card: id, built: 0 };
        return;
      }
      if (card.type === 'building') {
        const opts = p.bm.map((s, k) => ({ id: 's' + k, label: s ? 'Over ' + C(s.card).name + (s.w ? ' (its workers go idle)' : '') : 'An empty space' }));
        ask(p, 'choice', { what: 'freeSlot', why: why + ': where does ' + card.name + ' go?', options: opts, card: id,
          then: pick => {
            const k = +pick.slice(1), old = p.bm[k];
            if (old && old.card) { p.idle += old.w; if (old.card.indexOf('s-') !== 0) g.discard.push(old.card); }
            p.bm[k] = { card: id, w: 0 };
            log({ t: 'placed', by: p.id, card: id, slot: k });
          } });
        return;
      }
      /* A Golden Age: its resources, or its VP if it can be paid for. */
      const n = gaNumbers(p, card);
      const have = RES.reduce((t, r) => t + p.res[r], 0);
      const opts = [card.alt ? { id: 'alt', label: D.GA_ALT[card.alt] } : { id: 'res', label: '+' + n.gaGain + ' ' + card.res }];
      if (have >= n.vpCost) opts.push({ id: 'vp', label: 'Pay ' + n.vpCost + ' resources for ' + n.vpGain + ' VP' });
      ask(p, 'choice', { what: 'freeGA', why: why + ': ' + card.name, options: opts, card: id,
        then: pick => {
          g.discard.push(id);
          p.bought.ga++;
          if (pick === 'res') { gain(p, { [card.res]: n.gaGain }); log({ t: 'gain', by: p.id, res: { [card.res]: n.gaGain }, why: 'freeGA', card: id }); }
          else if (pick === 'alt') { const e2 = { t: 'gaAlt', by: p.id, card: id }; altGA(p, card, e2); log(e2); }
          else payThen(p, n.vpCost, card.name + ': pay for the VP', () => { p.res.vp += n.vpGain; log({ t: 'gain', by: p.id, res: { vp: n.vpGain }, why: 'freeGA', card: id }); });
        } });
    }
    /* Pay `n` resources of the nation's choosing, then carry on. */
    function payThen(p, n, why, then) {
      if (n <= 0) { then(); return; }
      ask(p, 'mix', { owe: n, from: RES.slice(), why, what: 'pay', then: () => then() });
    }
    /* Abbasid Caliphate: someone else bought a Golden Age. */
    function askAbbasid(q, card) {
      const n = gaNumbers(q, card);
      const have = RES.reduce((t, r) => t + q.res[r], 0);
      if (have < n.vpCost) return;
      ask(q, 'choice', { what: 'abbasid', why: 'Abbasid Caliphate: buy ' + card.name + '’s VP too — ' + n.vpGain + ' VP for ' + n.vpCost + ' resources?',
        options: [{ id: 'yes', label: 'Pay ' + n.vpCost + ' for ' + n.vpGain + ' VP' }, { id: 'no', label: 'No thanks' }],
        then: pick => {
          if (pick !== 'yes') { log({ t: 'declined', by: q.id, name: 'Abbasid Caliphate' }); return; }
          payThen(q, n.vpCost, 'Abbasid Caliphate: pay ' + n.vpCost + ' resources', () => { q.res.vp += n.vpGain; log({ t: 'gain', by: q.id, res: { vp: n.vpGain }, why: 'abbasid', card: 'abbasid' }); });
        } });
    }
    /* Mansa Musa: an action of yours that leaves you on exactly 0 gold. */
    function lastGold(p, before) {
      if (before > 0 && p.res.gold === 0) for (const x of fxOf(p)) if (x.f.lastGold) { gain(p, x.f.lastGold); log({ t: 'gain', by: p.id, res: x.f.lastGold, why: 'lastGold', card: x.card }); }
    }

    /* ---------------- deploying ---------------- */
    function deployCost(p, card, free) {
      if (free) return 0;
      /* Achaemenid: the worker grown this round, put to work as the first action. */
      if (p.achFree && p.turns <= 1 && g.phase === 'action') return 0;
      let cost = card.dep;
      if (card.type === 'military') { const d = sumFx(p, 'milDeployDiscount'); if (d) cost = Math.max(1, cost - d); }
      return cost;
    }
    function deployCheck(p, slot, from, free) {
      const s = p.bm[slot];
      if (!s || !s.card) return no('That space is empty.');
      const card = C(s.card);
      if (from != null && from !== 'idle') {
        const f = p.bm[from];
        if (from === slot) return no('That is the same card.');
        if (!f || !f.card || !f.w) return no('There is no worker there to move.');
      } else if (p.idle < 1) return no('You have no idle worker — take one off another card first.');
      if (card.max && s.w >= card.max) return no(card.name + ' takes at most ' + card.max + ' worker' + (card.max > 1 ? 's' : '') + '.');
      const cost = deployCost(p, card, free);
      if (p.res.stone < cost) return no(card.name + ' costs ' + cost + ' stone to put a worker on.');
      return yes({ cost, card });
    }
    function doDeploy(p, a, free) {
      const slot = +a.slot;
      const from = a.from == null || a.from === 'idle' ? null : +a.from;
      const chk = deployCheck(p, slot, from, free);
      if (!chk.ok) return chk;
      if (from != null) { p.bm[from].w--; p.idle++; log({ t: 'undeploy', by: p.id, card: p.bm[from].card, moving: true }); checkRemovals(); }
      p.idle--; p.bm[slot].w++;
      p.res.stone -= chk.cost;
      log({ t: 'deploy', by: p.id, card: p.bm[slot].card, cost: chk.cost, free: !!free });
      return yes();
    }

    /* ---------------- architects ---------------- */
    function hireCheck(p, src) {
      if (!p.uc) return no('You have no wonder under construction.');
      const card = C(p.uc.card);
      if (card.type === 'natural') return no(card.name + ' is explored, not built.');
      if (p.uc.built >= card.cost.length) return no(card.name + ' is finished.');
      /* Le Vite: this round each section costs 1 stone less. */
      const cost = Math.max(0, card.cost[p.uc.built] - (p.archOff || 0));
      if (src === 'private' ? p.privArch < 1 : g.arch < 1) return no(src === 'private' ? 'No private architect left this round.' : 'No architects left this round.');
      if (p.res.stone < cost) return no('The next section costs ' + cost + ' stone.');
      return yes({ cost });
    }
    function doHire(p, a) {
      const src = a.src === 'private' ? 'private' : (a.src === 'public' ? 'public' : (p.privArch > 0 ? 'private' : 'public'));
      const chk = hireCheck(p, src);
      if (!chk.ok) return chk;
      if (src === 'private') p.privArch--; else g.arch--;
      p.res.stone -= chk.cost;
      build(p, chk.cost, src);
      return yes();
    }
    function build(p, cost, src) {
      p.uc.built++;
      log({ t: 'hire', by: p.id, card: p.uc.card, cost, src, built: p.uc.built, of: C(p.uc.card).cost.length });
      for (const x of fxOf(p)) if (x.f.on === 'hire') { gain(p, x.f.gain); log({ t: 'gain', by: p.id, res: x.f.gain, why: 'hire', card: x.card }); }
      if (p.uc.built >= C(p.uc.card).cost.length) push({ k: 'ready', seat: p.id });
    }
    function wonderReady(p) {
      if (!p.uc) return;
      const id = p.uc.card;
      p.uc = null;
      const place = k => {
        if (k < p.wonders.length && p.wonders[k]) {
          const old = p.wonders[k];
          g.discard.push(old);
          log({ t: 'covered', by: p.id, card: old });
          p.wonders[k] = id;
        } else p.wonders.push(id);
        syncAdvisors(p);
        log({ t: 'ready', by: p.id, card: id });
        readyFx(p, id);
      };
      if (p.wonders.length < p.wonderCap) { place(p.wonders.length); return; }
      /* A Natural Wonder, once discovered, is never covered. */
      const can = p.wonders.map((w, k) => coverable(w) ? k : -1).filter(k => k >= 0);
      if (!can.length) { g.discard.push(id); log({ t: 'removed', by: p.id, card: id, why: 'noRoom' }); return; }
      if (can.length === 1) { place(can[0]); return; }
      ask(p, 'choice', {
        what: 'cover', why: C(id).name + ' is ready — your wonder spaces are full. Which wonder does it cover?',
        options: can.map(k => ({ id: 'w' + k, label: C(p.wonders[k]).name })),
        then: pick => place(+pick.slice(1))
      });
    }
    function readyFx(p, id) {
      const card = C(id);
      for (const f of card.fx) {
        if (f.on !== 'ready') continue;
        if (f.gain && !f.sel) { const got = gain(p, f.gain, 'ready'); log({ t: 'gain', by: p.id, res: got, why: 'ready', card: id }); }
        if (f.sel) {
          const set = f.sel === 'leastStab' ? leastStab() : f.sel === 'leastStr' ? leastStr() : f.sel === 'mostStr' ? mostStr() : [];
          for (const q of set) { const got = gain(q, f.gain, 'ready'); log({ t: 'gain', by: q.id, res: got, why: 'readyOther', card: id }); }
        }
        if (f.leastStabRound) { p.leastStab = true; log({ t: 'versailles', by: p.id }); }
        /* Wardenclyffe Tower: three more actions now. */
        if (f.moreActions) { p.bonus = (p.bonus || 0) + f.moreActions; p.moreWhy = card.name + ': an extra action'; log({ t: 'moreActions', by: p.id, n: f.moreActions, card: id }); }
        if (f.titanic) {
          for (const q of byOrder().slice().reverse()) {
            push({ k: 'fxApply', fn: () => eitherAsk(q, [{ gain: { gold: -4 } }, { removeAdvisor: true }], 'Titanic', null) });
          }
        }
      }
      /* Hatshepsut and the Sphinx. */
      for (const x of fxOf(p)) {
        if (x.f.on === 'wonderReady') { gain(p, x.f.gain); log({ t: 'gain', by: p.id, res: x.f.gain, why: 'wonderReady', card: x.card }); }
        if (x.f.on === 'otherWonderReady' && x.card !== id) { gain(p, x.f.gain); log({ t: 'gain', by: p.id, res: x.f.gain, why: 'otherWonderReady', card: x.card }); }
      }
      checkRemovals();
    }

    /* ---------------- special actions ---------------- */
    function specialsOf(p) {
      const out = [];
      for (const x of fxOf(p)) if (x.f.act) out.push({ act: x.f.act, card: x.card, once: !!x.f.once, max: x.f.max || 0, used: !!p.used[x.card] });
      /* Actions other nations' cards offer: buying Chopin, or an advisor out
         of a Polish-Lithuanian wonder space. */
      for (const q of all()) {
        if (q === p) continue;
        for (const a of advisorsOf(q)) if (C(a).fx.some(f => f.chopin)) out.push({ act: 'chopin', card: a, owner: q.id, once: false, used: false });
        if (hasFx(q, 'othersBuyAdvisor')) for (const w of q.wonders) if (w && C(w).type === 'advisor') out.push({ act: 'plcbuy', card: w, owner: q.id, once: false, used: false });
      }
      return out;
    }
    const hasAdvisor = p => p.advisors.some(a => a && !C(a).permanent) || p.wonders.some(w => w && C(w).type === 'advisor');
    function specialCheck(p, cardId) {
      const s = specialsOf(p).find(x => x.card === cardId);
      if (!s) return no('You have no such card.');
      const nm = cardName(cardId);
      if (s.once && s.used) return no(nm + ' has been used this round.');
      if (s.max && (p.uses[cardId] || 0) >= s.max) return no(nm + ': ' + s.max + ' times a round at most.');
      switch (s.act) {
        case 'petra': if (p.res.food < 1) return no('Petra needs 1 food.'); break;
        case 'piazza': if (p.res.gold < 2) return no('Piazza San Marco needs 2 gold.'); break;
        case 'marco': if (p.res.food < 2 && p.res.stone < 2) return no('Marco Polo needs 2 food or 2 stone.'); break;
        case 'suleiman': if (mostStr().indexOf(p) < 0) return no('Suleiman: only when you are the strongest.'); if (!canTake(p)) return no('No worker left to take.'); break;
        case 'lincoln': if (!canTake(p)) return no('No worker left to take.'); break;
        case 'bolivar': if (!p.colonies.some(Boolean)) return no('You have no colony to give up.'); break;
        case 'shwedagon': if (g.passOrder.length) return no('Shwedagon Pagoda: only while nobody has passed.'); break;
        case 'reef': if (p.res.vp < 1) return no('The Great Barrier Reef costs 1 VP.'); break;
        case 'uppsala': if (p.res.food < 1) return no('Old Uppsala costs 1 food.'); break;
        case 'tesla': if (p.res.gold < 2) return no('Nikola Tesla costs 2 gold.'); break;
        case 'turk': if (!turkTargets(p).length) return no('Nobody less stable has a free wonder space for the Mechanical Turk.'); break;
        case 'qin':
          if (!p.uc || C(p.uc.card).type === 'natural' || p.uc.built >= C(p.uc.card).cost.length) return no('Qin Dynasty: you need a wonder under construction.');
          if (workersOf(p) < 1) return no('Qin Dynasty: you have no worker to return.');
          break;
        case 'romanrep': if (g.arch < 1) return no('No architects left this round.'); break;
        case 'oldkingdom': if (!hasAdvisor(p)) return no('Old Kingdom: you have no advisor to give up.'); break;
        case 'maliempire': if (!hasAdvisor(p)) return no('Mali Empire: you have no advisor to give up.'); if (p.res.gold < 2) return no('Mali Empire costs 2 gold.'); break;
        case 'joseon': if (!['food', 'stone', 'gold'].some(r => p.res[r] > 0)) return no('Joseon Kingdom: you have no food, stone or gold to store.'); break;
        case 'demrep': { const d = demrepTargets(p); if (!d.ok) return no(d.why); break; }
        case 'chopin': {
          const o = P(s.owner);
          if (o.passed) return no(o.name + ' has passed: Chopin is theirs for the round.');
          if (p.res.gold < 5) return no('Chopin costs 5 gold.');
          break;
        }
        case 'plcbuy': if (p.res.gold < 3) return no('It costs 3 gold, paid to ' + P(s.owner).name + '.'); break;
      }
      return yes({ s });
    }
    /* The Mechanical Turk goes to a less stable nation with room for it. */
    const turkTargets = p => all().filter(q => q !== p && stab(q) < stab(p) && freeWonderSpace(q));
    /* Democratic-Republicans: the other weakest nations with a dynasty left,
       one Turmoil card each. */
    function demrepTargets(p) {
      const hit = leastStr().filter(q => q !== p && q.dynasties.length);
      if (!hit.length) return no('None of the weakest nations has a dynasty left to play.');
      if (g.turmoil < hit.length) return no('Not enough Turmoil cards left this round.');
      return yes({ hit });
    }
    function doSpecial(p, a) {
      const chk = specialCheck(p, String(a.card));
      if (!chk.ok) return chk;
      const s = chk.s;
      const ev = { t: 'special', by: p.id, card: s.card, act: s.act };
      const pick3 = (list, n) => { if (list.indexOf(a.pick) < 0) return false; return true; };
      switch (s.act) {
        case 'petra':
          if (!pick3(['book', 'gold', 'stone'])) return no('Choose books, gold or stone.');
          p.res.food -= 1; gain(p, { [a.pick]: 3 }); ev.gain = { [a.pick]: 3 }; ev.pay = { food: 1 };
          break;
        case 'piazza': {
          if (!pick3(['book', 'food', 'stone'])) return no('Choose books, food or stone.');
          const before = p.res.gold;
          p.res.gold -= 2; gain(p, { [a.pick]: 5 }); ev.gain = { [a.pick]: 5 }; ev.pay = { gold: 2 };
          lastGold(p, before);
          break;
        }
        case 'marco': {
          const r = a.pick === 'stone' ? 'stone' : 'food';
          if (p.res[r] < 2) return no('You need 2 ' + r + '.');
          p.res[r] -= 2; gain(p, { gold: 4 }); ev.gain = { gold: 4 }; ev.pay = { [r]: 2 };
          break;
        }
        case 'galileo': {
          const id = g.board[+a.r] && g.board[+a.r][+a.c];
          if (!id || ['golden', 'wonder'].indexOf(C(id).type) < 0) return no('Galileo buys a Golden Age or a Wonder.');
          const r = doBuy(p, a, true);
          if (!r.ok) return r;
          ev.bought = id;
          break;
        }
        case 'alhazen': {
          const A = a.a || [], B = a.b || [];
          const ok = x => Array.isArray(x) && x[0] >= 0 && x[0] < 3 && x[1] >= 0 && x[1] < g.cols;
          if (!ok(A) || !ok(B) || (A[0] === B[0] && A[1] === B[1])) return no('Choose two places on the board.');
          const x = g.board[A[0]][A[1]], y = g.board[B[0]][B[1]];
          if (!x && !y) return no('Both places are empty.');
          g.board[A[0]][A[1]] = y; g.board[B[0]][B[1]] = x;
          ev.a = A; ev.b = B; ev.cards = [x, y];
          break;
        }
        case 'royal': {
          const r = doDeploy(p, a, true);
          if (!r.ok) return r;
          break;
        }
        case 'suleiman': case 'lincoln': {
          const sec = p.freeTop > 0 ? null : (sectionsOpen(p).indexOf(a.pick) >= 0 ? a.pick : sectionsOpen(p)[0]);
          takeWorker(p, sec);
          break;
        }
        case 'bolivar': {
          const k = +a.slot;
          if (!p.colonies[k]) return no('Choose one of your colonies.');
          ev.colony = p.colonies[k];
          g.discard.push(p.colonies[k]);
          p.colonies[k] = null;
          gain(p, { gold: 4, stone: 4 }); ev.gain = { gold: 4, stone: 4 };
          break;
        }
        case 'shwedagon': case 'romanrep':
          if (s.act === 'romanrep') { g.arch--; ev.archGone = 1; }
          p.temp.stab = (p.temp.stab || 0) + 1; ev.temp = { stab: 1 };
          break;
        case 'reef':
          p.res.vp -= 1; gain(p, { food: 5 }); ev.gain = { vp: -1, food: 5 };
          break;
        case 'uppsala':
          p.res.food -= 1; p.temp.str = (p.temp.str || 0) + 3; ev.pay = { food: 1 }; ev.temp = { str: 3 };
          break;
        case 'duchy':
          ev.skip = true;
          break;
        case 'tesla': {
          const before = p.res.gold;
          p.res.gold -= 2;
          const roll = 1 + Math.floor(g.rng() * 6);
          g.rolls++;
          p.temp.str = (p.temp.str || 0) + roll;
          ev.pay = { gold: 2 }; ev.roll = roll; ev.temp = { str: roll };
          lastGold(p, before);
          break;
        }
        case 'turk': {
          const q = turkTargets(p).find(x => x.id === a.pick);
          if (!q) return no('Choose a less stable nation with a free wonder space.');
          p.wonders.splice(p.wonders.indexOf(s.card), 1);
          q.wonders.push(s.card);
          syncAdvisors(p);
          ev.to = q.id;
          break;
        }
        case 'qin': {
          const from = a.pick === 'idle' || a.pick == null ? (p.idle > 0 ? 'idle' : null) : (/^s\d+$/.test(a.pick) ? +a.pick.slice(1) : null);
          if (from == null || (from === 'idle' ? p.idle < 1 : !(p.bm[from] && p.bm[from].w))) return no('Choose the worker that goes back.');
          returnWorker(p, from, null);
          checkRemovals();
          if (!p.uc) return no('Qin Dynasty: you need a wonder under construction.');
          p.uses[s.card] = (p.uses[s.card] || 0) + 1;
          log(ev);
          build(p, 0, 'free');
          return yes();
        }
        case 'oldkingdom': case 'maliempire': {
          const where = dropOwnAdvisor(p, a.pick);
          if (!where) return no('Choose the advisor to give up.');
          ev.advisor = where;
          if (s.act === 'oldkingdom') { p.tok.oldkingdom = (p.tok.oldkingdom || 0) + 1; ev.tok = p.tok.oldkingdom; }
          else { p.res.gold -= 2; gain(p, { book: 3, vp: 1 }); ev.pay = { gold: 2 }; ev.gain = { book: 3, vp: 1 }; }
          break;
        }
        case 'joseon': {
          const r = ['food', 'stone', 'gold'].indexOf(a.pick) >= 0 ? a.pick : null;
          if (!r) return no('Choose food, stone or gold.');
          const k = Math.min(3, p.res[r], Math.max(1, +a.slot || 3));
          if (k < 1) return no('You have no ' + r + '.');
          p.res[r] -= k;
          p.joseon = { res: r, n: k };
          ev.stored = { [r]: k };
          break;
        }
        case 'demrep': {
          const d = demrepTargets(p);
          ev.hit = d.hit.map(q => q.id);
          gain(p, { book: 3 * d.hit.length }); ev.gain = { book: 3 * d.hit.length };
          log(ev);
          for (const q of d.hit) push({ k: 'fxApply', fn: () => forcedDynasty(q, 'Democratic-Republicans') });
          return yes();
        }
        case 'chopin': case 'plcbuy': {
          const o = P(s.owner);
          const price = s.act === 'chopin' ? 5 : 3;
          p.res.gold -= price;
          if (s.act === 'plcbuy') o.res.gold += price;
          /* Out of the owner's hands … */
          const k = o.advisors.indexOf(s.card);
          if (k >= 0) o.advisors[k] = null; else o.wonders.splice(o.wonders.indexOf(s.card), 1);
          syncAdvisors(o);
          /* … into the buyer's advisor space. */
          ev.from = o.id; ev.pay = { gold: price };
          if (p.advisors.some(x => x && C(x).fx.some(f => f.emperor))) { g.discard.push(s.card); p.emperor++; ev.emperor = p.emperor; }
          else {
            const at = p.advisors.indexOf(null) >= 0 ? p.advisors.indexOf(null) : 0;
            if (p.advisors[at]) { ev.replaced = p.advisors[at]; g.discard.push(p.advisors[at]); }
            p.advisors[at] = s.card;
          }
          break;
        }
        default: return no('That card has no action.');
      }
      if (s.once) p.used[s.card] = true;
      if (s.max) p.uses[s.card] = (p.uses[s.card] || 0) + 1;
      log(ev);
      return yes();
    }
    /* Give up one of your own advisors (`pick` "a<k>" or "w<k>"; the only
       one if there is only one). Returns its id. */
    function dropOwnAdvisor(p, pick) {
      const have = [];
      p.advisors.forEach((x, k) => { if (x && !C(x).permanent) have.push('a' + k); });
      p.wonders.forEach((x, k) => { if (x && C(x).type === 'advisor') have.push('w' + k); });
      const at = have.length === 1 ? have[0] : (have.indexOf(pick) >= 0 ? pick : null);
      if (!at) return null;
      const k = +at.slice(1);
      let id;
      if (at[0] === 'a') { id = p.advisors[k]; p.advisors[k] = null; } else { id = p.wonders[k]; p.wonders.splice(k, 1); }
      g.discard.push(id);
      syncAdvisors(p);
      return id;
    }

    /* ---------------- Natural Wonders ---------------- */
    function doExplore(p) {
      if (!p.uc || C(p.uc.card).type !== 'natural') return no('You have no Natural Wonder to explore.');
      const card = C(p.uc.card);
      p.uc.built++;
      log({ t: 'explore', by: p.id, card: card.id, built: p.uc.built, of: card.spy });
      if (p.uc.built >= card.spy) push({ k: 'discovered', seat: p.id });
      return yes();
    }
    /* Discovered: into a wonder space (two for Siberia), covering a built
       wonder only if every space is full, then what it does. */
    function discovered(p) {
      if (!p.uc) return;
      const id = p.uc.card, card = C(id);
      p.uc = null;
      const pieces = card.spaces > 1 ? [id, 's-siberia'] : [id];
      const done = () => {
        syncAdvisors(p);
        log({ t: 'discovered', by: p.id, card: id });
        discoverFx(p, id);
      };
      const next = () => {
        const piece = pieces.shift();
        if (!piece) { done(); return; }
        if (p.wonders.length < p.wonderCap) { p.wonders.push(piece); next(); return; }
        const can = p.wonders.map((w, k) => coverable(w) ? k : -1).filter(k => k >= 0);
        const cover = k => { const old = p.wonders[k]; g.discard.push(old); log({ t: 'covered', by: p.id, card: old }); p.wonders[k] = piece; next(); };
        if (!can.length) { log({ t: 'removed', by: p.id, card: piece, why: 'noRoom' }); next(); return; }
        if (can.length === 1) { cover(can[0]); return; }
        ask(p, 'choice', { what: 'cover', why: card.name + ' is discovered — which wonder does it cover?', options: can.map(k => ({ id: 'w' + k, label: C(p.wonders[k]).name })),
          then: pick => cover(+pick.slice(1)) });
      };
      next();
    }
    function discoverFx(p, id) {
      const card = C(id);
      const note = (q, res) => log({ t: 'gain', by: q.id, res, why: 'discover', card: id });
      for (const f of card.fx) {
        if (f.on !== 'discover') continue;
        if (f.gain) note(p, gain(p, f.gain));
        if (f.tempStr) { p.temp.str = (p.temp.str || 0) + f.tempStr; log({ t: 'tempStr', by: p.id, n: f.tempStr, card: id }); }
        if (f.others) for (const q of byOrder()) if (q !== p) note(q, gain(q, f.others));
        if (f.perPassedVP) { const k = g.passOrder.length * f.perPassedVP; if (k) note(p, gain(p, { vp: k })); }
        if (f.freeWorker) { p.idle += f.freeWorker; log({ t: 'worker', by: p.id, section: 'free' }); tookWorker(p); }
        if (f.addBM) { for (let k = 0; k < f.addBM; k++) p.bm.push(null); log({ t: 'newSpace', by: p.id, card: id }); }
        if (f.returnWorkers) for (let k = 0; k < f.returnWorkers; k++) push({ k: 'fxApply', fn: () => askReturn(p, card.name) });
        if (f.victoria) {
          const deck = g.decks[g.age];
          const drawn = deck.splice(0, f.victoria);
          const cols = drawn.filter(x => C(x).type === 'colony');
          for (const x of drawn) if (cols.indexOf(x) < 0) g.discard.push(x);
          g.board[3] = (g.board[3] || []).filter(Boolean).concat(cols);
          log({ t: 'victoria', by: p.id, n: drawn.length, colonies: cols });
        }
      }
      /* America: every discovery. */
      for (const x of fxOf(p)) if (x.card !== id && x.f.on === 'discover' && x.f.gain) note(p, gain(p, x.f.gain));
      checkRemovals();
    }

    /* ---------------- Turmoil and the dynasties ---------------- */
    function turmoilCheck(p) {
      if (!g.dyn) return no('Turmoil is part of Nations: Dynasties.');
      if (g.turmoil < 1) return no('No Turmoil cards left this round.');
      return yes();
    }
    function doTurmoil(p, a) {
      const chk = turmoilCheck(p);
      if (!chk.ok) return chk;
      const pick = a.pick === 'gold' ? 'gold' : (p.dynasties.indexOf(a.pick) >= 0 ? a.pick : null);
      if (!pick) return no(p.dynasties.length ? 'Choose a dynasty to play, or the 2 gold.' : 'Take the 2 gold.');
      g.turmoil--;
      p.turmoil++;
      if (pick === 'gold') {
        gain(p, { gold: 2 });
        const free = hasFx(p, 'turmoilGoldFree');
        /* Sassanid Empire: the card goes straight back — no stability lost. */
        if (free) p.turmoil--;
        log({ t: 'turmoil', by: p.id, gold: 2, discarded: free });
        return yes();
      }
      log({ t: 'turmoil', by: p.id, dyn: pick });
      playDynasty(p, pick);
      return yes();
    }
    /* Somebody else's action makes this nation change dynasty now. */
    function forcedDynasty(q, why) {
      if (!q.dynasties.length || g.turmoil < 1) return;
      const go = id => { g.turmoil--; q.turmoil++; log({ t: 'turmoil', by: q.id, dyn: id, forced: why }); playDynasty(q, id); };
      if (q.dynasties.length === 1) { go(q.dynasties[0]); return; }
      ask(q, 'choice', { what: 'dynasty', why: why + ': you must play a dynasty now — which?', options: q.dynasties.map(id => ({ id, label: D.dynasty(id).name + ' — ' + D.dynasty(id).text })), then: id => go(id) });
    }
    function playDynasty(p, id) {
      const d = D.dynasty(id);
      const old = p.dynasty ? D.dynasty(p.dynasty) : null;
      /* What stood in wonder spaces under the old dynasty goes. */
      if (old) for (const f of old.fx) {
        const kind = f.advisorOnWonder ? 'advisor' : f.colonyOnWonder ? 'colony' : null;
        if (!kind) continue;
        for (const w of p.wonders.slice()) if (w && C(w).type === kind) { p.wonders.splice(p.wonders.indexOf(w), 1); g.discard.push(w); log({ t: 'removed', by: p.id, card: w, why: 'dynasty' }); }
      }
      const first = !p.dynasty;
      p.dynasty = id;
      p.dynasties = p.dynasties.filter(x => x !== id);
      p.special = d.fx.slice();
      p.specialText = d.name + ': ' + d.text;
      log({ t: 'dynasty', by: p.id, dyn: id, old: old ? old.id : null });
      syncAdvisors(p);
      /* Japan's and Persia's first dynasty card lies over one of their spaces. */
      if (first && p.dynCovers === 'bm') {
        ask(p, 'choice', { what: 'coverSpace', why: d.name + ' lies over one of your building/military spaces — which?',
          options: p.bm.map((s, k) => ({ id: 's' + k, label: s && s.card ? C(s.card).name + (s.w ? ' (its ' + s.w + ' worker' + (s.w > 1 ? 's go' : ' goes') + ' idle)' : '') : 'An empty space' })),
          then: pick => { const k = +pick.slice(1), s = p.bm[k]; if (s && s.card) { p.idle += s.w; if (s.card.indexOf('s-') !== 0) g.discard.push(s.card); } p.bm.splice(k, 1); log({ t: 'spaceCovered', by: p.id, kind: 'bm', card: s && s.card || null }); checkRemovals(); } });
      }
      if (first && p.dynCovers === 'colony' && p.colonies.length > 1) {
        const lose = k => { const c = p.colonies[k]; if (c && c.indexOf('s-') !== 0) g.discard.push(c); p.colonies.splice(k, 1); log({ t: 'spaceCovered', by: p.id, kind: 'colony', card: c || null }); };
        const emptyK = p.colonies.indexOf(null);
        if (emptyK >= 0) lose(emptyK);
        else ask(p, 'choice', { what: 'coverSpace', why: d.name + ' lies over one of your colony spaces — which colony goes?',
          options: p.colonies.map((c, k) => ({ id: 'c' + k, label: C(c).name })), then: pick => lose(+pick.slice(1)) });
      }
      for (const f of d.fx) if (f.onPlay && f.onPlay.takeWorkers) push({ k: 'fxApply', fn: () => askTake(p, d.name, f.onPlay.takeWorkers, false) });
      checkRemovals();
    }

    /* ---------------- before the first turn ---------------- */
    function askAxumite(p) {
      const opts = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < g.cols; c++) { const id = g.board[r][c]; if (id && !g.tolls.some(t => t.card === id)) opts.push({ id: r + '|' + c, label: C(id).name + ' (row ' + (r + 1) + ')' }); }
      if (!opts.length) return;
      ask(p, 'choice', { what: 'axumite', why: 'Axumite Kingdom: mark a card — anybody else who buys it pays you 3 gold', options: opts,
        then: pick => { const [r, c] = pick.split('|').map(Number); const id = g.board[r][c]; g.tolls.push({ card: id, by: p.id, n: fxVal(p, 'axumite') || 3 }); log({ t: 'axumite', by: p.id, card: id }); } });
    }
    function askJagiello(p) {
      if (p.res.gold < 1 || g.n < 2) return;
      const first = byOrder()[0] === p ? byOrder()[1] : byOrder()[0];
      ask(p, 'choice', { what: 'jagiello', why: 'Jagiellonian Dynasty: pay ' + first.name + ' 1 gold for an action before everybody?',
        options: [{ id: 'yes', label: 'Pay 1 gold — act first' }, { id: 'no', label: 'No thanks' }],
        then: pick => {
          if (pick !== 'yes') return;
          p.res.gold--; first.res.gold++;
          log({ t: 'jagiello', by: p.id, to: first.id });
          push({ k: 'extraTurn', seat: p.id });
        } });
    }
    /* Vikings: after production, name a resource — every other nation loses 1. */
    function askVikingTax(p) {
      ask(p, 'choice', { what: 'vikingTax', why: 'Vikings: every other nation loses 1 of which?', options: ['food', 'stone', 'gold', 'book'].map(r => ({ id: r, label: (r === 'book' ? 'Books' : r[0].toUpperCase() + r.slice(1)) })),
        then: r => { log({ t: 'vikingTax', by: p.id, res: r }); for (const q of byOrder()) if (q !== p) log({ t: 'gain', by: q.id, res: gain(q, { [r]: -1 }, 'vikings'), why: 'vikings', card: 'nation', from: p.id }); } });
    }

    /* ================================================================
       The resolution phase
       ================================================================ */
    function resolve() {
      g.phase = 'resolution';
      log({ t: 'resolution' });
      /* Production choices first (Peter the Great), then the rest in order. */
      const warStr = g.war ? g.war.str : 0;
      for (const p of byOrder().slice().reverse()) {
        for (const x of fxOf(p)) if (x.f.on === 'prod' && x.f.ifStrGtWar && str(p) > warStr) {
          const card = x.card;
          push({ k: 'fxApply', fn: () => {
            ask(p, 'choice', { what: 'peter', why: C(card).name + ': you are stronger than the War — take 5 of one', options: x.f.choose.map(o => { const r = Object.keys(o)[0]; return { id: r, label: '+' + o[r] + ' ' + r }; }),
              then: pick => { p.peter = pick; } });
          } });
        }
      }
      push({ k: 'prod' });
      push({ k: 'order' });
      push({ k: 'war' });
      push({ k: 'fx', side: 'a', i: 0 });
      if (D.event(g.event).b) push({ k: 'fx', side: 'b', i: 0 });
      push({ k: 'famine' });
      /* Imperium Rex ends the game after this round — books as at an age's end. */
      const ending = D.event(g.event).a.fx.some(f => f.endGame);
      if (ending) g.endAfter = true;
      if (g.round % 2 === 0 || ending) push({ k: 'ageEnd' });
      push({ k: 'endRound' });
    }

    /* Production with every condition, as one figure per resource. */
    function productionOf(p, inPhase) {
      const out = baseProduction(p);
      const why = [];
      const ms = mostStab(), mw = mostStr(), lw = leastStr();
      const firstPass = g.passOrder[0] === p.id || (g.n === 5 && g.passOrder[1] === p.id);
      for (const x of fxOf(p)) {
        const f = x.f;
        if (f.on !== 'prod') continue;
        let times = 0;
        if (f.if === 'mostStab') times = ms.indexOf(p) >= 0 ? 1 : 0;
        else if (f.if === 'mostStr') times = mw.indexOf(p) >= 0 ? 1 : 0;
        else if (f.if === 'leastStr') times = lw.indexOf(p) >= 0 ? 1 : 0;
        else if (f.if === 'passedFirst') times = firstPass ? 1 : 0;
        else if (f.ifColonyBought) times = p.bought.colony > 0 ? 1 : 0;
        else if (f.perColonyAge) times = coloniesOf(p).filter(c => C(c).age === f.perColonyAge).length;
        else if (f.perCurAgeBM) times = p.bm.filter(s => s && s.card && C(s.card).age === g.age).length;
        else if (f.perIndWorker) times = p.bm.reduce((t, s) => t + (s && s.card && C(s.card).type === 'building' && C(s.card).age === 4 ? s.w : 0), 0);
        else if (f.always) times = 1;
        else if (f.perIdle) times = p.idle;
        else if (f.perToken) times = p.tok[f.perToken] || 0;
        /* Hypatia: a token first, then a book per token. */
        else if (f.hypatia) { times = (p.tok.hypatia || 0) + 1; if (inPhase) p.tok.hypatia = times; out.book += times; why.push({ card: x.card, res: { book: times } }); continue; }
        else if (f.if === 'mostStrStab') times = mw.indexOf(p) >= 0 && ms.indexOf(p) >= 0 ? 1 : 0;
        else if (f.if === 'onlyMostStab') times = ms.indexOf(p) >= 0 && mw.indexOf(p) < 0 ? 1 : 0;
        else if (f.ifStrGtWar) { if (inPhase && p.peter) { out[p.peter] += 5; why.push({ card: x.card, res: { [p.peter]: 5 } }); } continue; }
        if (!times) continue;
        for (const r in f.gain) out[r] = (out[r] || 0) + f.gain[r] * times;
        why.push({ card: x.card, res: Object.fromEntries(Object.entries(f.gain).map(([k, v]) => [k, v * times])) });
      }
      /* Chopin doubles the books you make (not the books you have). */
      if (hasFx(p, 'bookDouble') && out.book > 0) { why.push({ card: 'chopin', res: { book: out.book } }); out.book *= 2; }
      return { net: out, why };
    }
    g.productionOf = p => productionOf(p, false).net;

    function production() {
      for (const p of all()) {
        const { net, why } = productionOf(p, true);
        const before = Object.assign({}, p.res);
        const got = {};
        for (const r of ['gold', 'food', 'stone', 'book']) {
          const v = net[r] || 0;
          if (v > 0) { p.res[r] += v; got[r] = (got[r] || 0) + v; }
          else if (v < 0) lose(p, r, -v, 'production', got);
        }
        log({ t: 'produced', by: p.id, net, got, why });
        const s = stab(p);
        if (s < 0) {
          const g2 = {};
          loseBooks(p, -s, 'revolt', g2);
          if (p.res.vp > 0) { p.res.vp--; g2.vp = (g2.vp || 0) - 1; }
          log({ t: 'revolt', by: p.id, stab: s, got: g2 });
        }
        /* Mongolia: strength below 0 is a revolt too. */
        const w = str(p);
        if (w < 0) {
          const g2 = {};
          loseBooks(p, -w, 'revolt', g2);
          if (p.res.vp > 0) { p.res.vp--; g2.vp = (g2.vp || 0) - 1; }
          log({ t: 'revolt', by: p.id, str: w, got: g2 });
        }
        p.peter = null;
      }
      /* After everybody's production: Athens, then the Vikings' levy. */
      for (const p of byOrder()) for (const x of fxOf(p)) if (x.f.afterProd) {
        const a = x.f.afterProd;
        const ok = a.if === 'mostBook' ? most(q => q.res.book).indexOf(p) >= 0 : true;
        if (ok) log({ t: 'gain', by: p.id, res: gain(p, a.gain), why: 'afterProd', card: x.card });
      }
      for (const p of byOrder()) if (hasFx(p, 'vikingTax')) push({ k: 'vikingTax', seat: p.id });
    }

    function playerOrder() {
      const ev = D.event(g.event);
      const halves = [ev.a, ev.b].filter(Boolean);
      const frozen = halves.some(e => e.fx.some(f => f.noOrderChange));
      const byPass = halves.some(e => e.fx.some(f => f.orderByPass));
      const before = byOrder().map(p => p.id);
      if (byPass) {
        /* Solar Eclipse: the order everybody passed in. */
        g.order = g.passOrder.map(id => g.idx(id)).concat(g.order.filter(i => g.passOrder.indexOf(g.players[i].id) < 0));
      } else if (!frozen) {
        const prev = g.order.slice();
        /* Ethiopia counts its stability as strength here (and here only). */
        const key = p => strM(p) + (hasFx(p, 'orderStab') ? Math.max(0, stab(p)) : 0);
        g.order.sort((x, y) => {
          const a = g.players[x], b = g.players[y];
          return (key(b) - key(a)) || (stabOrder(b) - stabOrder(a)) || (prev.indexOf(x) - prev.indexOf(y));
        });
      }
      log({ t: 'order', before, after: byOrder().map(p => p.id), frozen, byPass });
    }
    const stabOrder = p => cap(stab(p), 15);

    function warStep() {
      if (!g.war) { log({ t: 'war', none: true }); return; }
      const w = C(g.war.card);
      const extraFood = all().reduce((t, q) => t + sumFx(q, 'allDefeatFood'), 0);
      /* Mongolia: every defeat costs 2 more of the War's own resource. */
      const extraSame = all().reduce((t, q) => t + sumFx(q, 'allDefeatExtra'), 0);
      const lost = [];
      for (const p of byOrder()) {
        const s = cap(str(p), 40) + sumFx(p, 'warStr') + sumFx(p, 'warStrPerMil') * milWorkersOf(p);
        if (s >= g.war.str) {
          p.warLoss = null;
          /* Poland: a War, and not defeated. */
          for (const x of fxOf(p)) if (x.f.warSafe) log({ t: 'gain', by: p.id, res: gain(p, x.f.warSafe), why: 'warSafe', card: x.card });
          continue;
        }
        /* Edo Period: a defeat costs nothing at all. */
        if (hasFx(p, 'noDefeat')) { p.warLoss = null; lost.push(p.id); log({ t: 'spared', by: p.id, why: 'edo' }); continue; }
        const st = Math.max(0, stab(p));
        let relief = st;
        const bill = [];
        for (const r in w.loss) bill.push([r, w.loss[r] + extraSame]);
        if (extraFood) bill.push(['food', extraFood]);
        const got = {};
        const before = Object.assign({}, p.res);
        for (const [r, n] of bill) {
          const cut = Math.min(relief, n); relief -= cut;
          if (n - cut > 0) lose(p, r, n - cut, 'war', got);
        }
        const firstPass = g.passOrder[0] === p.id || (g.n === 5 && g.passOrder[1] === p.id);
        let vpLost = 0;
        if (hasFx(p, 'passFirstNoWarVP') && firstPass) log({ t: 'spared', by: p.id, why: 'greatwall' });
        else if (p.res.vp > 0) { p.res.vp--; vpLost = 1; got.vp = (got.vp || 0) - 1; }
        const loss = {};
        for (const k of Object.keys(before)) if (p.res[k] < before[k]) loss[k] = before[k] - p.res[k];
        p.warLoss = loss;
        lost.push(p.id);
        log({ t: 'defeat', by: p.id, war: g.war.card, str: s, need: g.war.str, relief: st, got });
        /* The Old Kingdom loses a token with a defeat. */
        if (p.tok.oldkingdom > 0 && hasFx(p, 'perToken')) { p.tok.oldkingdom--; log({ t: 'tokenLost', by: p.id, card: p.dynasty }); }
        /* Solomon's Temple falls with a defeat. */
        for (const wid of p.wonders.slice()) if (wid && C(wid).fx.some(f => f.removeIfDefeated)) { p.wonders.splice(p.wonders.indexOf(wid), 1); g.discard.push(wid); log({ t: 'removed', by: p.id, card: wid, why: 'defeated' }); }
        syncAdvisors(p);
      }
      log({ t: 'war', card: g.war.card, str: g.war.str, by: g.war.by, defeated: lost });
    }

    /* ---------------- the events ---------------- */
    function selectOf(f) {
      const ps = all();
      switch (f.sel) {
        case 'all': return byOrder();
        case 'mostStr': return mostStr();
        case 'leastStr': return leastStr();
        case 'mostStab': return mostStab();
        case 'leastStab': return leastStab();
        case 'mostFood': return most(p => p.res.food);
        case 'leastFood': return least(p => p.res.food);
        case 'firstPass': return g.passOrder.slice(0, g.n === 5 ? 2 : 1).map(P);
        case 'lastPass': return g.passOrder.slice(g.n === 5 ? -2 : -1).map(P);
        case 'mostGA': return most(p => p.bought.ga).filter(p => p.bought.ga > 0);
        case 'mostIndWorkers': return most(p => p.bm.reduce((t, s) => t + (s && s.card && C(s.card).type === 'building' && C(s.card).age === 4 ? s.w : 0), 0))
          .filter(p => p.bm.some(s => s && s.card && C(s.card).type === 'building' && C(s.card).age === 4 && s.w));
        case 'allButLeastStab': { const l = leastStab(); return byOrder().filter(p => l.indexOf(p) < 0); }
        case 'allButMostStrStab': { const a = mostStr(), b = mostStab(); return byOrder().filter(p => a.indexOf(p) < 0 && b.indexOf(p) < 0); }
        case 'advisorAge': return byOrder().filter(p => advisorsOf(p).some(a => f.ages.indexOf(C(a).age) >= 0));
      }
      return [];
    }
    const inOrder = set => byOrder().filter(p => set.indexOf(p) >= 0);
    function eventFx(st) {
      const e = D.event(g.event)[st.side];
      const f = e.fx[st.i];
      if (!f) return;
      const set = inOrder(selectOf(f));
      const name = e.name;
      log({ t: 'fx', ev: g.event, side: st.side, i: st.i, name, who: set.map(p => p.id) });
      /* This effect's pieces first, then the card's next effect — push()
         inserts at the cursor, so the order of the calls is the order run. */
      applyFx(f, set, name);
      if (st.i + 1 < e.fx.length) push({ k: 'fx', side: st.side, i: st.i + 1 });
    }
    g.selectOf = selectOf;

    function applyFx(f, set, name) {
      const here = [];               // steps for this effect, run in order
      const add = fn => here.push({ k: 'fxApply', fn });
      const note = (p, got, extra) => log(Object.assign({ t: 'gain', by: p.id, res: got, why: 'event', name }, extra || {}));
      if (f.gain && !f.mayPay && !f.mayTakeWorker && !f.removeAdvisors && !f.ifColonyAge && !f.mayLast) for (const p of set) add(() => note(p, gain(p, f.gain, 'event')));
      if (f.removeAdvisors) for (const p of set) add(() => {
        for (const sp of advisorSpotsOf(p).reverse()) dropSpot(p, sp.id, name);
        syncAdvisors(p);
        note(p, gain(p, f.gain || {}, 'event'));
      });
      if (f.ifColonyAge) for (const p of set) add(() => { if (coloniesOf(p).some(c => C(c).age === f.ifColonyAge)) note(p, gain(p, f.gain)); });
      if (f.othersGain && set.length && !f.either) {
        for (const p of byOrder()) if (set.indexOf(p) < 0) add(() => note(p, gain(p, f.othersGain, 'event')));
      }
      if (f.last || f.first) add(() => moveOrder(set, f.last ? 'last' : 'first', name));
      if (f.perWarBattle) for (const p of set) add(() => { const k = p.bought.war + p.bought.battle; if (k) note(p, gain(p, mul(f.perWarBattle, k))); });
      if (f.perColonyBought) for (const p of set) add(() => { const k = p.bought.colony; if (k) note(p, gain(p, mul(f.perColonyBought, k))); });
      if (f.perColonyAge) for (const p of set) add(() => { const k = coloniesOf(p).filter(c => C(c).age === f.perColonyAge.age).length; if (k) note(p, gain(p, mul(f.perColonyAge.gain, k))); });
      /* Spring and Autumn Period: your strength against your neighbours'. */
      if (f.springAutumn) for (const p of set) add(() => {
        const i = p.i, n = g.n, left = g.players[(i + n - 1) % n], right = g.players[(i + 1) % n];
        const nb = left === right ? [left] : [left, right];
        const k = nb.filter(q => str(p) > str(q)).length;
        if (k) note(p, gain(p, k === nb.length && nb.length > 1 ? f.springAutumn.both : f.springAutumn.one));
      });
      if (f.ifStrGtWar) for (const p of set) add(() => { if (str(p) > (g.war ? g.war.str : 0)) note(p, gain(p, f.ifStrGtWar)); });
      if (f.ifOtherWar) for (const p of set) add(() => { if (g.war && g.war.by !== p.id) note(p, gain(p, f.ifOtherWar)); });
      if (f.keepGold != null) for (const p of set) add(() => { if (p.res.gold > f.keepGold) { const k = p.res.gold - f.keepGold; p.res.gold = f.keepGold; note(p, { gold: -k }); } });
      if (f.regainWar) for (const p of set) add(() => {
        if (!p.warLoss) return;
        const back = f.regainWar === 'vp' ? (p.warLoss.vp ? { vp: p.warLoss.vp } : {}) : Object.assign({}, p.warLoss);
        if (Object.keys(back).length) note(p, gain(p, back), { regain: true });
      });
      if (f.returnWorker) for (const p of inOrder(set).reverse()) add(() => askReturn(p, name));
      if (f.takeWorker) for (const p of set) add(() => askTake(p, name, f.takeWorker, false));
      if (f.mayTakeWorker) for (const p of set) add(() => { if (f.gain) note(p, gain(p, f.gain)); askTake(p, name, f.mayTakeWorker, true); });
      if (f.mayPay) for (const p of inOrder(set).reverse()) add(() => {
        if (!RES.every(r => (p.res[r] || 0) >= (f.mayPay[r] || 0))) return;
        ask(p, 'choice', { what: 'mayPay', why: name + ': pay ' + fmt(f.mayPay) + ' for ' + fmt(f.get) + '?', options: [{ id: 'yes', label: 'Pay ' + fmt(f.mayPay) + ' → ' + fmt(f.get) }, { id: 'no', label: 'No thanks' }],
          then: pick => { if (pick === 'yes') { for (const r in f.mayPay) p.res[r] -= f.mayPay[r]; note(p, gain(p, f.get), { paid: f.mayPay }); } else log({ t: 'declined', by: p.id, name }); } });
      });
      if (f.mayLast) for (const p of set) add(() => {
        ask(p, 'choice', { what: 'mayLast', why: name + ': go last next round for ' + fmt(f.get) + '?', options: [{ id: 'yes', label: 'Go last → ' + fmt(f.get) }, { id: 'no', label: 'No thanks' }],
          then: pick => { if (pick === 'yes') { moveOrder([p], 'last', name); note(p, gain(p, f.get)); } else log({ t: 'declined', by: p.id, name }); } });
      });
      if (f.either) {
        /* Everybody chooses in reverse player order, then it all happens. */
        const picks = new Map();
        for (const p of inOrder(set).reverse()) add(() => eitherAsk(p, f.either, name, picks));
        add(() => {
          const moveLast = [];
          for (const p of inOrder(set)) {
            const o = picks.get(p);
            if (!o) continue;
            applyEither(p, o, name, moveLast, set);
          }
          if (moveLast.length) moveOrder(moveLast, 'last', name);
        });
      }
      if (f.undeployFor) for (const p of inOrder(set).reverse()) add(() => askUndeploy(p, f.undeployFor, name, 0));
      if (f.freeArch) for (const p of set) add(() => askFreeArch(p, f.freeArch, name));
      if (f.othersGain && f.freeArch && set.length) { /* handled above for non-either */ }
      if (f.freeMilDeploy) for (const p of set) add(() => askFreeMil(p, f.freeMilDeploy, name));
      if (f.removeColony) for (const p of set) add(() => {
        const have = colonySpotsOf(p);
        if (!have.length) { note(p, gain(p, { vp: -f.removeColony })); return; }
        if (have.length === 1) { dropSpot(p, have[0].id, name); return; }
        ask(p, 'choice', { what: 'loseColony', why: name + ': which colony do you lose?', options: have.map(x => ({ id: x.id, label: C(x.card).name })), then: pick => dropSpot(p, pick, name) });
      });
      if (f.removeAdvisorOr) for (const p of set) add(() => {
        const have = advisorSpotsOf(p);
        if (!have.length) { note(p, gain(p, { vp: -f.removeAdvisorOr })); return; }
        dropAdvisor(p, have, name);
      });
      /* Run this effect's pieces in front of what was queued. */
      for (const st of here) push(st);
    }
    const mul = (o, k) => { const out = {}; for (const r in o) out[r] = o[r] * k; return out; };
    const fmt = o => Object.keys(o || {}).map(r => o[r] + ' ' + (r === 'vp' ? 'VP' : r)).join(' + ');

    /* Where a nation's advisors and colonies are: "a<k>" an advisor space,
       "c<k>" a colony space, "w<k>" a wonder space (under a dynasty). The
       Emperor is never one of them. */
    function advisorSpotsOf(p) {
      const out = [];
      p.advisors.forEach((x, k) => { if (x && !C(x).permanent) out.push({ id: 'a' + k, card: x }); });
      p.wonders.forEach((x, k) => { if (x && C(x).type === 'advisor') out.push({ id: 'w' + k, card: x }); });
      return out;
    }
    function colonySpotsOf(p) {
      const out = [];
      p.colonies.forEach((x, k) => { if (x) out.push({ id: 'c' + k, card: x }); });
      p.wonders.forEach((x, k) => { if (x && C(x).type === 'colony') out.push({ id: 'w' + k, card: x }); });
      return out;
    }
    /* Remove what stands at one of those spots; a wonder space closes up. */
    function dropSpot(p, spot, name) {
      const k = +spot.slice(1);
      const list = spot[0] === 'a' ? p.advisors : spot[0] === 'c' ? p.colonies : p.wonders;
      const id = list[k];
      if (!id) return;
      log({ t: 'removed', by: p.id, card: id, why: 'event', name });
      if (id.indexOf('s-') !== 0) g.discard.push(id);
      if (spot[0] === 'w') p.wonders.splice(k, 1); else list[k] = null;
      syncAdvisors(p);
    }
    function dropAdvisor(p, have, name) {
      if (have.length === 1) { dropSpot(p, have[0].id, name); return; }
      ask(p, 'choice', { what: 'loseAdvisor', why: name + ': which advisor goes?', options: have.map(x => ({ id: x.id, label: C(x.card).name })), then: pick => dropSpot(p, pick, name) });
    }
    function eitherOptions(p, list) {
      return list.map((o, k) => {
        let label = '', ok = true;
        if (o.gain) label = fmt(Object.fromEntries(Object.entries(o.gain).map(([r, v]) => [r, v]))).replace(/(^|\+ )(\d)/g, '$1+$2').replace(/\+-/g, '−');
        if (o.gain) label = Object.entries(o.gain).map(([r, v]) => (v > 0 ? '+' : '−') + Math.abs(v) + ' ' + (r === 'vp' ? 'VP' : r)).join(', ');
        if (o.othersGain) label = 'Everybody else ' + Object.entries(o.othersGain).map(([r, v]) => (v > 0 ? '+' : '−') + Math.abs(v) + ' ' + r).join(', ');
        if (o.last) label = 'Go last next round';
        if (o.removeArch) { label = 'Take an architect off your wonder'; ok = !!(p.uc && p.uc.built > 0); }
        if (o.removeAdvisor) { label = 'Lose your advisor'; ok = advisorSpotsOf(p).length > 0; }
        if (o.westphalia) label = '−' + o.westphalia + ' strength for Peace of Westphalia';
        return { id: 'o' + k, label, ok };
      }).filter(o => o.ok);
    }
    function eitherAsk(p, list, name, picks) {
      const options = eitherOptions(p, list);
      const take = id => { const o = list[+id.slice(1)]; if (picks) picks.set(p, o); else applyEither(p, o, name, null, [p]); };
      if (options.length === 1) { take(options[0].id); log({ t: 'forced', by: p.id, name, label: options[0].label }); return; }
      ask(p, 'choice', { what: 'either', why: name, options, then: (id, o) => { take(id); log({ t: 'chose', by: p.id, name, label: o.label }); } });
    }
    function applyEither(p, o, name, moveLast, set) {
      const note = (q, got) => log({ t: 'gain', by: q.id, res: got, why: 'event', name });
      if (o.gain) note(p, gain(p, o.gain, 'event'));
      if (o.othersGain) for (const q of byOrder()) if (q !== p) note(q, gain(q, o.othersGain, 'event'));
      if (o.last) { if (moveLast) moveLast.push(p); else moveOrder([p], 'last', name); }
      if (o.removeArch && p.uc && p.uc.built > 0) { p.uc.built--; log({ t: 'archLost', by: p.id, card: p.uc.card, name }); }
      if (o.removeAdvisor) { const have = advisorSpotsOf(p); if (have.length) dropAdvisor(p, have, name); }
      if (o.westphalia) { p.westphalia = o.westphalia; log({ t: 'westphalia', by: p.id }); }
    }
    function moveOrder(set, where, name) {
      if (!set.length) return;
      const ids = set.map(p => g.idx(p.id));
      const keep = g.order.filter(i => ids.indexOf(i) < 0);
      const moved = g.order.filter(i => ids.indexOf(i) >= 0);
      g.order = where === 'last' ? keep.concat(moved) : moved.concat(keep);
      log({ t: 'moved', who: set.map(p => p.id), where, name, order: byOrder().map(p => p.id) });
    }
    function askTake(p, name, n, optional) {
      if (n <= 0 || !canTake(p)) return;
      const opts = [];
      if (p.freeTop > 0) opts.push({ id: 'top', label: 'Take the spare worker' });
      else for (const s of sectionsOpen(p)) opts.push({ id: s, label: 'Take a worker from the ' + SECTION_NAME[s] + ' track' });
      if (optional) opts.push({ id: 'no', label: 'No more' });
      const next = () => push({ k: 'fxApply', fn: () => askTake(p, name, n - 1, optional) });
      if (opts.length === 1) { takeWorker(p, opts[0].id === 'top' ? null : opts[0].id); next(); return; }
      ask(p, 'choice', { what: 'take', why: name + (n > 1 ? ': take up to ' + n + ' workers' : ': take a worker'), options: opts,
        then: pick => { if (pick === 'no') return; takeWorker(p, pick === 'top' ? null : pick); next(); } });
    }
    function askReturn(p, name) {
      const froms = [];
      if (p.idle > 0) froms.push({ id: 'idle', label: 'An idle worker' });
      p.bm.forEach((s, k) => { if (s && s.card && s.w) froms.push({ id: 's' + k, label: 'Off ' + C(s.card).name }); });
      if (!froms.length) return;
      const sections = ['stab', 'str', 'food'].filter(s => p.taken[s] > 0);
      const BACK = { stab: 'Stability track (+3 stability)', str: 'Strength track (+3 strength)', food: 'Food track (3 less food a round)' };
      const finish = (from) => {
        if (sections.length < 2) { returnWorker(p, from, sections[0] || null); checkRemovals(); return; }
        ask(p, 'choice', { what: 'returnTo', why: name + ': put it back on which track?', options: sections.map(s => ({ id: s, label: BACK[s] })),
          then: sec => { returnWorker(p, from, sec); checkRemovals(); } });
      };
      if (froms.length === 1) { finish(froms[0].id === 'idle' ? 'idle' : +froms[0].id.slice(1)); return; }
      ask(p, 'choice', { what: 'returnFrom', why: name + ': which worker goes back?', options: froms, then: id => finish(id === 'idle' ? 'idle' : +id.slice(1)) });
    }
    function askUndeploy(p, u, name, done) {
      const opts = [];
      p.bm.forEach((s, k) => { if (s && s.card && s.w && C(s.card).type === u.kind) opts.push({ id: 's' + k, label: 'Take one off ' + C(s.card).name + ' → ' + fmt(u.per) }); });
      if (!opts.length) return;
      opts.push({ id: 'no', label: done ? 'That is all' : 'No thanks' });
      ask(p, 'choice', { what: 'undeploy', why: name + (done ? ' — another?' : ''), options: opts,
        then: pick => {
          if (pick === 'no') return;
          const s = p.bm[+pick.slice(1)];
          s.w--; p.idle++;
          log({ t: 'undeploy', by: p.id, card: s.card, event: true });
          log({ t: 'gain', by: p.id, res: gain(p, u.per), why: 'event', name });
          checkRemovals();
          push({ k: 'fxApply', fn: () => askUndeploy(p, u, name, done + 1) });
        } });
    }
    function askFreeArch(p, n, name) {
      if (n <= 0 || !p.uc) return;
      ask(p, 'choice', { what: 'freeArch', why: name + ': hire an architect for free?', options: [{ id: 'yes', label: 'Build the next section of ' + C(p.uc.card).name }, { id: 'no', label: 'No' }],
        then: pick => {
          if (pick !== 'yes') return;
          build(p, 0, 'free');
          push({ k: 'fxApply', fn: () => askFreeArch(p, n - 1, name) });
        } });
    }
    function askFreeMil(p, n, name) {
      if (n <= 0 || p.idle < 1) return;
      const opts = [];
      p.bm.forEach((s, k) => { if (s && s.card && C(s.card).type === 'military') opts.push({ id: 's' + k, label: 'A worker onto ' + C(s.card).name }); });
      if (!opts.length) return;
      opts.push({ id: 'no', label: 'No more' });
      ask(p, 'choice', { what: 'freeMil', why: name + ': put a worker on military for free', options: opts,
        then: pick => {
          if (pick === 'no') return;
          const s = p.bm[+pick.slice(1)];
          p.idle--; s.w++;
          log({ t: 'deploy', by: p.id, card: s.card, cost: 0, free: true });
          checkRemovals();
          push({ k: 'fxApply', fn: () => askFreeMil(p, n - 1, name) });
        } });
    }

    function famine() {
      const f = D.event(g.event).famine;
      /* Songhai Empire: the weakest of the OTHER nations pay more. */
      const extra = {};
      for (const q of all()) {
        const k = sumFx(q, 'songhai');
        if (!k) continue;
        const ps = all().filter(x => x !== q);
        const low = Math.min(...ps.map(x => strM(x)));
        for (const x of ps) if (strM(x) === low) extra[x.id] = (extra[x.id] || 0) + k;
      }
      for (const p of byOrder()) {
        const n = f + (extra[p.id] || 0);
        if (!n) continue;
        const got = lose(p, 'food', n, 'famine', {});
        log({ t: 'famine', by: p.id, n, got, songhai: extra[p.id] || 0 });
      }
    }
    function ageEnd() {
      const rows = [];
      for (const p of all()) {
        const k = all().filter(q => q.res.book < p.res.book).length;
        if (k) p.res.vp += k;
        rows.push({ id: p.id, books: p.res.book, vp: k });
        for (const x of fxOf(p)) if (x.f.endAge) { gain(p, x.f.endAge); log({ t: 'gain', by: p.id, res: x.f.endAge, why: 'endAge', card: x.card }); }
      }
      log({ t: 'books', age: g.age, rows });
      /* Vesuvius: a worker goes back at the end of every age. */
      for (const p of byOrder()) for (const x of fxOf(p)) if (x.f.endAgeReturn) for (let k = 0; k < x.f.endAgeReturn; k++) push({ k: 'fxApply', fn: () => askReturn(p, C(x.card).name) });
    }
    function endRound() {
      const over = g.round >= g.lastRound || g.endAfter;
      for (const p of all()) {
        p.passed = false; p.bought = { war: 0, battle: 0, colony: 0, ga: 0 };
        p.lackVP = {}; p.used = {}; p.temp = { str: 0, stab: 0 }; p.leastStab = false; p.westphalia = 0; p.warLoss = null;
        /* Dynasties: Turmoil cards go back (and their -2 stability with them). */
        p.turmoil = 0; p.uses = {}; p.passedOver = {}; p.archOff = 0; p.bonus = 0; p.achFree = false;
        /* Joseon Kingdom: what was stored comes back doubled. */
        if (p.joseon) { const back = { [p.joseon.res]: p.joseon.n * 2 }; gain(p, back); log({ t: 'gain', by: p.id, res: back, why: 'joseon', card: 'joseon' }); p.joseon = null; }
      }
      if (g.war) { g.discard.push(g.war.card); g.war = null; }
      g.arch = 0; g.turmoil = 0;
      checkRemovals();
      log({ t: 'roundEnd', n: g.round });
      if (over) { finish(); return; }
      push({ k: 'round' });
    }
    function finish() {
      g.phase = 'over';
      g.cur = -1;
      const rows = byOrder().map((p, k) => Object.assign({ id: p.id, name: p.name, bot: p.bot, nation: p.nation, order: k }, scoreOf(p, all())));
      rows.sort((a, b) => (b.total - a.total) || (a.order - b.order));
      let place = 0;
      rows.forEach((r, k) => { r.place = k + 1; r.won = k === 0; });
      g.result = { rows };
      log({ t: 'over', rows: rows.map(r => ({ id: r.id, total: r.total, place: r.place })) });
    }

    /* ================================================================
       What a seat could do right now — the phone draws only these.
       ================================================================ */
    function turnCan(p) {
      const board = [];
      for (let r = 0; r < g.board.length; r++) for (let c = 0; c < g.board[r].length; c++) {
        const id = g.board[r][c];
        if (!id) continue;
        const chk = buyCheck(p, r, c, false);
        board.push({ r, c, card: id, price: priceFor(p, C(id), r, false), ok: chk.ok, why: chk.ok ? '' : chk.why, need: chk.ok ? chk.need : null });
      }
      const deploy = p.bm.map((s, k) => {
        if (!s || !s.card) return null;
        const chk = deployCheck(p, k, null, false);
        const cost = deployCost(p, C(s.card), false);
        const froms = p.bm.map((f, j) => f && f.card && f.w && j !== k ? j : -1).filter(j => j >= 0);
        const full = C(s.card).max && s.w >= C(s.card).max;
        return { slot: k, card: s.card, cost, ok: chk.ok, why: chk.ok ? '' : chk.why, canMove: p.res.stone >= cost && !full ? froms : [] };
      });
      const natural = p.uc && C(p.uc.card).type === 'natural';
      const hire = p.uc && !natural ? {
        card: p.uc.card, built: p.uc.built, cost: Math.max(0, C(p.uc.card).cost[p.uc.built] - (p.archOff || 0)),
        public: hireCheck(p, 'public').ok, private: hireCheck(p, 'private').ok,
        why: hireCheck(p, p.privArch > 0 ? 'private' : 'public').why || ''
      } : null;
      const specials = specialsOf(p).map(s => { const chk = specialCheck(p, s.card); return { card: s.card, act: s.act, once: s.once, used: s.used, owner: s.owner || null, ok: chk.ok, why: chk.ok ? '' : chk.why,
        targets: s.act === 'turk' ? turkTargets(p).map(q => q.id) : undefined, hit: s.act === 'demrep' && chk.ok ? demrepTargets(p).hit.map(q => q.id) : undefined }; });
      const explore = natural ? { card: p.uc.card, built: p.uc.built, of: C(p.uc.card).spy } : null;
      const tch = turmoilCheck(p);
      const turmoil = g.dyn ? { ok: tch.ok, why: tch.ok ? '' : tch.why, left: g.turmoil, dynasties: p.dynasties.slice(), goldFree: hasFx(p, 'turmoilGoldFree') } : null;
      return { board, deploy, hire, specials, explore, turmoil, idle: p.idle, galileo: specials.some(s => s.act === 'galileo' && s.ok) ? board.filter(b => ['golden', 'wonder'].indexOf(C(b.card).type) >= 0).map(b => ({ r: b.r, c: b.c, card: b.card, need: buyCheck(p, b.r, b.c, true).need || null })) : [] };
    }
    g.turnCan = id => { const p = P(id); return p ? turnCan(p) : null; };

    /* ================================================================
       Views
       ================================================================ */
    function playerPub(p) {
      const prod = productionOf(p, false).net;
      return {
        id: p.id, name: p.name, hex: p.hex, bot: p.bot, i: p.i,
        nation: p.nation, side: p.side, diff: p.diff, specialText: p.specialText,
        dynasty: p.dynasty, dynasties: p.dynasties.slice(), turmoil: p.turmoil, tok: Object.assign({}, p.tok), emperor: p.emperor,
        joseon: p.joseon ? Object.assign({}, p.joseon) : null, dynCovers: p.dynCovers || null,
        res: Object.assign({}, p.res), idle: p.idle, workers: workersOf(p),
        taken: Object.assign({}, p.taken), track: Object.assign({}, p.track), freeTop: p.freeTop,
        bm: p.bm.map(s => s && s.card ? { card: s.card, w: s.w } : null),
        advisors: p.advisors.slice(),
        colonies: p.colonies.slice(), wonders: p.wonders.slice(), wonderCap: p.wonderCap,
        uc: p.uc ? { card: p.uc.card, built: p.uc.built, natural: C(p.uc.card).type === 'natural' } : null,
        privArch: p.privArch, used: Object.keys(p.used),
        passed: p.passed, str: str(p), stab: stab(p), raid: raidOf(p), gaBonus: gaBonus(p),
        prod, bought: Object.assign({}, p.bought), leastStab: p.leastStab,
        score: scoreOf(p, all())
      };
    }
    g.publicView = function () {
      return {
        v: VERSION, n: g.n, round: g.round, lastRound: g.lastRound, age: g.age, ages: g.ages, phase: g.phase,
        sets: g.sets.slice(), side: g.side, cols: g.cols, dyn: g.dyn, promo: g.promo,
        turmoil: g.turmoil, tolls: g.tolls.map(t => Object.assign({}, t)), extra: g.extra || null,
        order: byOrder().map(p => p.id),
        active: g.activeId(),
        players: g.players.map(playerPub),
        board: g.board.map(row => row.slice()),
        deckN: g.decks[g.age] ? g.decks[g.age].length : 0,
        event: g.event, arch: g.arch,
        war: g.war ? { card: g.war.card, str: g.war.str, by: g.war.by } : null,
        passOrder: g.passOrder.slice(),
        pool: g.pool ? g.pool.slice() : null,
        rank: {
          mostStr: mostStr().map(p => p.id), leastStr: leastStr().map(p => p.id),
          mostStab: mostStab().map(p => p.id), leastStab: leastStab().map(p => p.id)
        },
        prompts: g.prompts.map(pr => ({ n: pr.n, seat: pr.seat, t: pr.t, what: pr.what || null, why: pr.why || '' })),
        log: g.log.slice(-80),
        logN: g.log.length,
        result: g.result
      };
    };
    g.seatView = function (id) {
      const p = P(id);
      if (!p) return null;
      const prompts = g.prompts.filter(pr => pr.seat === id).map(pr => {
        const out = clone(Object.assign({}, pr, { then: undefined, two: undefined }));
        return out;
      });
      const turn = g.prompts.find(pr => pr.seat === id && pr.t === 'turn');
      return { id, v: VERSION, prompts, can: turn ? Object.assign({ n: turn.n, skipOnly: !!turn.skipOnly }, turnCan(p)) : null };
    };
    /* For the tests: every progress card is somewhere, exactly once. */
    g.census = function () {
      const seen = {};
      const note = (id, where) => { if (!id || id.indexOf('s-') === 0) return; (seen[id] = seen[id] || []).push(where); };
      for (let a = 1; a <= 4; a++) for (const id of g.decks[a]) note(id, 'deck' + a);
      g.board.forEach((row, r) => row.forEach(id => note(id, 'board' + r)));
      for (const id of g.discard) note(id, 'discard');
      if (g.war) note(g.war.card, 'war');
      for (const p of g.players) {
        for (const s of p.bm) if (s && s.card) note(s.card, p.id + ':bm');
        if (p.joseon) { /* resources, not cards */ }
        for (const a of p.advisors) note(a, p.id + ':adv');
        for (const c of p.colonies) note(c, p.id + ':col');
        for (const w of p.wonders) note(w, p.id + ':won');
        if (p.uc) note(p.uc.card, p.id + ':uc');
      }
      return seen;
    };
    g.score = p => scoreOf(p, all());
  }

  const Engine = {
    VERSION, create, rngFrom, shuffle, strengthOf, stabilityOf, baseProduction, scoreOf, raidOf, workersOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.NationsEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
