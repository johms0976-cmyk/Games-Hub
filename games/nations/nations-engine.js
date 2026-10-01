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
  /* Cards whose fx are "always on": advisors and ready wonders, plus the
     nation's printed special. */
  function fxOf(p) {
    const out = [];
    for (const a of p.advisors) if (a) for (const f of (C(a).fx || [])) out.push({ f, card: a });
    for (const w of p.wonders) if (w) for (const f of (C(w).fx || [])) out.push({ f, card: w });
    for (const f of (p.special || [])) out.push({ f, card: 'nation' });
    return out;
  }
  const hasFx = (p, key) => fxOf(p).some(x => x.f[key] != null && x.f[key] !== false);
  const sumFx = (p, key) => fxOf(p).reduce((t, x) => t + (typeof x.f[key] === 'number' ? x.f[key] : 0), 0);

  /* Strength: workers on military times the card, plus every flat bonus. */
  function strengthOf(p, all) {
    let s = 0;
    for (const sl of p.bm) if (sl && sl.card && sl.w) { const c = C(sl.card); if (c.type === 'military') s += c.str * sl.w; }
    for (const a of p.advisors) if (a) s += C(a).prod.str || 0;
    for (const c of p.colonies) if (c) s += C(c).prod.str || 0;
    for (const w of p.wonders) if (w) s += C(w).prod.str || 0;
    s += sumFx(p, 'str');
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
    /* Genghis Khan: every nation, his own included. */
    for (const q of (all || [p])) s += sumFx(q, 'allStab');
    s += p.temp.stab || 0;
    return s;
  }
  /* What the board makes in a production phase, before conditions. */
  function baseProduction(p) {
    const out = { gold: 0, stone: 0, food: 0, book: 0 };
    const noUp = hasFx(p, 'noMilUpkeep');
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
    for (const x of fxOf(p)) {
      if (x.f.score === 'perAdvisor') special += p.advisors.filter(Boolean).length;
      if (x.f.score === 'perIndColony') special += p.colonies.filter(c => c && C(c).age === 4).length;
      if (x.f.score === 'mostWorkers') {
        const mine = workersOf(p);
        if ((all || [p]).every(q => q === p || workersOf(q) < mine)) special += 2;
      }
    }
    wonders += special;
    for (const s of p.bm) if (s && s.card && s.w) {
      const list = C(s.card).vp || [];
      for (let k = 0; k < Math.min(s.w, list.length); k++) bm += list[k];
    }
    const pile = p.res.gold + p.res.stone + p.res.food + p.res.book + Math.max(0, strengthOf(p, all)) + stabilityOf(p, all);
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
    const ages = Math.max(1, Math.min(4, opts.ages || 4));
    const side = opts.side === 'B' ? 'B' : 'A';
    const diff = id => D.DIFFICULTY.find(d => d.id === id) || D.DIFFICULTY[1];

    const g = {
      VERSION, n, sets, ages, side, lastRound: ages * 2,
      seed: opts.seed, rng,
      round: 0, age: 1, phase: 'setup',
      log: [], prompts: [], steps: [], pn: 0, ins: 0,
      decks: {}, evDecks: {},
      board: [[], [], []], cols: D.COLUMNS[n],
      event: null, evSeen: [],
      arch: 0, war: null, passOrder: [],
      order: [], cur: -1,
      result: null,
      opts: { show: !!opts.show }
    };
    for (let a = 1; a <= 4; a++) {
      g.decks[a] = shuffle(D.deck(a, sets), rng);
      g.evDecks[a] = shuffle(D.EVENTS.filter(e => e.age === a).map(e => e.id), rng);
    }
    for (let r = 0; r < 3; r++) g.board[r] = new Array(g.cols).fill(null);

    /* Random player order (step 1 of the score board's setup). */
    const seats = shuffle(list.map((x, i) => i), rng);
    g.players = list.map((x, i) => ({
      id: x.id, name: x.name, hex: x.hex || '#888', bot: !!x.bot, i,
      diff: diff(x.difficulty || opts.difficulty).id,
      nation: null, side: null, special: [], specialText: '',
      res: { gold: 0, stone: 0, food: 0, book: 0, vp: 0 },
      idle: 0, taken: { food: 0, stab: 0 }, track: { food: 4, stab: 4 }, freeTop: 0,
      bm: [], advisors: [null], colonies: [], wonders: [], wonderCap: 5, uc: null,
      privArch: 0, used: {}, passed: false, turns: 0, actionsLeft: 0,
      temp: { str: 0, stab: 0 }, leastStab: false, westphalia: 0,
      bought: { war: 0, battle: 0, colony: 0, ga: 0 }, lackVP: {}, warLoss: null
    }));
    g.order = seats.slice();

    attach(g);

    /* The first round's board is dealt before anybody chooses a nation. */
    g.round = 1; g.age = 1;
    refill(g, true);
    if (side === 'B') {
      g.phase = 'nations';
      g.pool = shuffle(D.NATIONS.map(x => x.id), rng).slice(0, n);
      /* Reverse player order picks. */
      for (let k = n - 1; k >= 0; k--) g.steps.push({ k: 'pickNation', i: g.order[k] });
    } else {
      const names = shuffle(D.NATIONS.map(x => x.id), rng);
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
      p.bm = b.bm.map(c => ({ card: c, w: 0 }));
      p.res = Object.assign({ gold: 0, stone: 0, food: 0, book: 0, vp: 0 }, b.res, { book: 0 });
      p.idle = b.workers;
      p.track = Object.assign({}, b.track);
      p.advisors = new Array(b.advisors).fill(null);
      p.colonies = new Array(b.colonies).fill(null);
      p.wonderCap = b.wonders;
      p.wonders = b.ready.slice();
      p.special = (b.special || []).slice();
      p.specialText = b.specialText || '';
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
    const canTake = p => p.freeTop > 0 || p.taken.food < p.track.food || p.taken.stab < p.track.stab;
    const sectionsOpen = p => ['food', 'stab'].filter(s => p.taken[s] < p.track[s]);
    function takeWorker(p, section) {
      if (p.freeTop > 0) { p.freeTop--; p.idle++; log({ t: 'worker', by: p.id, section: 'top' }); return true; }
      if (!section || p.taken[section] >= p.track[section]) return false;
      p.taken[section]++; p.idle++;
      log({ t: 'worker', by: p.id, section });
      return true;
    }
    function returnWorker(p, from, section) {
      if (from === 'idle') { if (p.idle < 1) return false; p.idle--; }
      else { const s = p.bm[from]; if (!s || !s.w) return false; s.w--; }
      if (section && p.taken[section] > 0) p.taken[section]--;
      else if (p.taken.food > 0 || p.taken.stab > 0) p.taken[p.taken.stab > 0 ? 'stab' : 'food']--;
      else p.freeTop++;
      log({ t: 'returned', by: p.id, from, section: section || null });
      return true;
    }

    /* ---------------- removals: "if X: remove" ---------------- */
    function checkRemovals() {
      for (let loop = 0; loop < 6; loop++) {
        let any = false;
        const ls = leastStab(), lw = leastStr();
        for (const p of all()) {
          p.advisors.forEach((a, k) => {
            if (!a) return;
            for (const f of (C(a).fx || [])) {
              const hit = (f.remove === 'leastStab' && ls.indexOf(p) >= 0) ||
                (f.remove === 'leastStr' && lw.indexOf(p) >= 0) ||
                (f.remove === 'milWorker' && milWorkers(p) > 0);
              if (hit) { p.advisors[k] = null; g.discard.push(a); any = true; log({ t: 'removed', by: p.id, card: a, why: f.remove }); break; }
            }
          });
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
            return { id, label: nat.name + ' (B side)', sub: nat.B.specialText };
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
            else for (const s of sectionsOpen(p)) options.push({ id: 'worker:' + s, label: 'Grow: take a worker from the ' + (s === 'food' ? 'Food' : 'Stability') + ' track', sub: s === 'food' ? '3 more food a round' : '3 less stability' });
            for (const r of ['food', 'stone', 'gold']) options.push({ id: 'bonus:' + r, label: '+' + bonus + ' ' + r, res: r, n: bonus });
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
          for (const p of all()) { p.privArch = privArchOf(p); p.used = {}; p.turns = 0; p.passed = false; }
          g.passOrder = [];
          g.phase = 'action';
          log({ t: 'actions', arch: g.arch });
          g.cur = -1;
          push({ k: 'next' });
          return;
        }
        case 'next': return nextTurn();
        case 'again': { const p = P(st.seat); if (p.passed) { push({ k: 'next' }); return; } ask(p, 'turn', { why: 'Sun Tzu: your second action' }); return; }
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
      }
    }

    /* ================================================================
       The action phase
       ================================================================ */
    function nextTurn() {
      checkRemovals();
      const k = g.n;
      for (let step = 1; step <= k; step++) {
        const i = (g.cur + step + k) % k;
        const p = g.players[g.order[i]];
        if (p.passed) continue;
        g.cur = i;
        openTurn(p);
        return;
      }
      g.cur = -1;
      push({ k: 'resolve' });
    }
    function openTurn(p) {
      p.turns++;
      if (p.turns === 1 && hasFx(p, 'twoFirst')) p.actionsLeft = 2; else p.actionsLeft = 1;
      const skip = p.turns === 1 && hasFx(p, 'skipFirst');
      ask(p, 'turn', { why: skip ? 'Buddha: your first turn is skipped' : 'Your turn', skipOnly: skip });
    }
    function afterAction(p) {
      checkRemovals();
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
      turn: ['buy', 'deploy', 'undeploy', 'hire', 'special', 'pass', 'skip']
    };
    function answer(p, pr, a) {
      if (!FITS[pr.t] || FITS[pr.t].indexOf(a.t) < 0) return no(pr.t === 'turn' ? 'That is not something you can do now.' : 'Answer the question on your screen first.');
      switch (pr.t) {
        case 'nation': {
          const o = pr.options.find(x => x.id === a.nation);
          if (!o) return no('That nation is not on offer.');
          const side = a.side === 'A' ? 'A' : 'B';
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
          if (kind === 'worker') takeWorker(p, what === 'top' ? null : what);
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
      let r;
      switch (a.t) {
        case 'undeploy': {
          const s = p.bm[a.slot];
          if (!s || !s.card || !s.w) return no('No worker there.');
          s.w--; p.idle++;
          log({ t: 'undeploy', by: p.id, card: s.card });
          checkRemovals();
          /* Free: the same question stays open, renumbered. */
          close(pr); ask(p, 'turn', { why: pr.why, skipOnly: pr.skipOnly });
          return yes();
        }
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
    }

    /* ---------------- buying ---------------- */
    function priceFor(p, card, row, free) {
      if (free) return 0;
      let price = D.ROW_PRICE[row];
      if (card.type === 'battle') for (const q of all()) if (q !== p) price += sumFx(q, 'othersBattleCost');
      return price;
    }
    /* Everything a buy would need, or why it cannot be. Shared with the
       phone through seatView so the handset never offers a refusal. */
    function buyCheck(p, r, c, free) {
      const id = g.board[r] && g.board[r][c];
      if (!id) return no('There is no card there.');
      const card = C(id);
      const price = priceFor(p, card, r, free);
      if (p.res.gold < price) return no('You need ' + price + ' gold.');
      const need = {};
      switch (card.type) {
        case 'war':
          if (g.war) return no('Only one War a round — ' + C(g.war.card).name + ' is already bought.');
          if (hasFx(p, 'noWar')) return no('Alfred Nobel: you may not buy a War.');
          break;
        case 'battle':
          if (!raidOf(p)) return no('You need a worker on a military card to fight a Battle.');
          need.pick = ['book', 'food', 'stone'];
          break;
        case 'colony': {
          const req = card.req + all().reduce((t, q) => t + sumFx(q, 'allColonyReq'), 0);
          if (str(p) < req) return no('This colony needs ' + req + ' strength; you have ' + str(p) + '.');
          if (p.colonies.every(Boolean)) need.slot = p.colonies.map((x, k) => k);
          break;
        }
        case 'building': case 'military':
          need.slot = p.bm.map((x, k) => k);
          break;
        case 'advisor': {
          const spots = advisorSpots(p);
          if (spots.length > 1) need.slot = spots;
          break;
        }
        case 'golden':
          need.pick = ['res', 'vp'];
          need.vpCost = Math.max(0, g.age - gaBonus(p));
          need.gaGain = 2 + gaBonus(p);
          break;
      }
      return yes({ id, card, price, need });
    }
    /* Where an advisor can sit: the advisor space(s), plus a Porcelain
       Tower's. Index -1-k means the tower in wonder space k. */
    function advisorSpots(p) { return p.advisors.map((x, k) => k); }
    /* One advisor space, plus one for a ready Porcelain Tower. When the tower
       goes (covered, or lost), so does whatever advisor sat on it. */
    function syncAdvisors(p) {
      const want = 1 + (p.wonders.some(w => w && C(w).fx.some(f => f.advisorSpace)) ? 1 : 0);
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
      if (need.slot && (slot == null || need.slot.indexOf(slot) < 0)) {
        if (card.type === 'building' || card.type === 'military') return no('Choose which space it goes in.');
        if (card.type === 'colony') return no('Your colony spaces are full — choose one to give up.');
        if (card.type === 'advisor') slot = 0;
      }
      let pick = a.pick;
      let payVP = null;
      if (card.type === 'battle' && need.pick.indexOf(pick) < 0) return no('Choose books, food or stone.');
      if (card.type === 'golden') {
        if (pick !== 'res' && pick !== 'vp') return no('Choose the resources or the VP.');
        if (pick === 'vp') {
          payVP = cleanMix(a.pay);
          const tot = RES.reduce((t, k) => t + payVP[k], 0);
          if (tot !== need.vpCost) return no('The VP costs ' + need.vpCost + ' resources.');
          for (const k of RES) if (payVP[k] > p.res[k] - (k === 'gold' ? price : 0)) return no('You do not have that much ' + k + '.');
        }
      }
      /* Pay and take. */
      const goldBefore = p.res.gold;
      p.res.gold -= price;
      g.board[r][c] = null;
      const ev = { t: 'buy', by: p.id, card: id, price, row: r, col: c };
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
          let k = p.colonies.indexOf(null);
          if (k < 0) { k = slot; ev.replaced = p.colonies[k]; g.discard.push(p.colonies[k]); }
          p.colonies[k] = id;
          p.bought.colony++;
          for (const q of all()) if (q !== p) for (const x of fxOf(q)) if (x.f.othersColony) { gain(q, x.f.othersColony); log({ t: 'gain', by: q.id, res: x.f.othersColony, why: 'othersColony', card: x.card }); }
          break;
        }
        case 'advisor': {
          let k = slot != null && slot >= 0 && slot < p.advisors.length ? slot : (p.advisors.indexOf(null) >= 0 ? p.advisors.indexOf(null) : 0);
          if (p.advisors[k]) { ev.replaced = p.advisors[k]; g.discard.push(p.advisors[k]); }
          p.advisors[k] = id;
          ev.slot = k;
          break;
        }
        case 'wonder': {
          if (p.uc) { ev.replaced = p.uc.card; ev.lostArch = p.uc.built; g.discard.push(p.uc.card); }
          p.uc = { card: id, built: 0 };
          break;
        }
        case 'war': {
          g.war = { card: id, str: str(p), by: p.id };
          ev.str = g.war.str;
          p.bought.war++;
          break;
        }
        case 'battle': {
          const n = raidOf(p);
          ev.pick = pick; ev.n = n;
          gain(p, { [pick]: n });
          p.bought.battle++;
          g.discard.push(id);
          break;
        }
        case 'golden': {
          p.bought.ga++;
          ev.pick = pick;
          if (pick === 'res') { const n = need.gaGain; gain(p, { [card.res]: n }); ev.gain = { [card.res]: n }; }
          else { for (const k of RES) p.res[k] -= payVP[k]; p.res.vp++; ev.pay = payVP; ev.gain = { vp: 1 }; }
          g.discard.push(id);
          break;
        }
      }
      log(ev);
      /* What buying set off. */
      const fire = (key, test) => {
        for (const x of fxOf(p)) if (x.f.on === key && (!test || test(x.f))) { gain(p, x.f.gain); log({ t: 'gain', by: p.id, res: x.f.gain, why: key, card: x.card }); }
      };
      if (price > 0) fire('buyAt', f => f.price === price);
      if (card.type === 'golden') fire('buyGA');
      if (card.type === 'war') { fire('buyWar'); fire('buyWarOrBattle'); }
      if (card.type === 'battle') { fire('buyBattle'); fire('buyWarOrBattle'); }
      lastGold(p, goldBefore);
      return yes();
    }
    /* Mansa Musa: an action of yours that leaves you on exactly 0 gold. */
    function lastGold(p, before) {
      if (before > 0 && p.res.gold === 0) for (const x of fxOf(p)) if (x.f.lastGold) { gain(p, x.f.lastGold); log({ t: 'gain', by: p.id, res: x.f.lastGold, why: 'lastGold', card: x.card }); }
    }

    /* ---------------- deploying ---------------- */
    function deployCost(p, card, free) {
      if (free) return 0;
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
      if (p.uc.built >= card.cost.length) return no(card.name + ' is finished.');
      const cost = card.cost[p.uc.built];
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
      ask(p, 'choice', {
        what: 'cover', why: C(id).name + ' is ready — your wonder spaces are full. Which wonder does it cover?',
        options: p.wonders.map((w, k) => ({ id: 'w' + k, label: C(w).name })),
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
      for (const x of fxOf(p)) if (x.f.act) out.push({ act: x.f.act, card: x.card, once: !!x.f.once, used: !!p.used[x.card] });
      return out;
    }
    function specialCheck(p, cardId) {
      const s = specialsOf(p).find(x => x.card === cardId);
      if (!s) return no('You have no such card.');
      if (s.once && s.used) return no(C(cardId).name + ' has been used this round.');
      switch (s.act) {
        case 'petra': if (p.res.food < 1) return no('Petra needs 1 food.'); break;
        case 'piazza': if (p.res.gold < 2) return no('Piazza San Marco needs 2 gold.'); break;
        case 'marco': if (p.res.food < 2 && p.res.stone < 2) return no('Marco Polo needs 2 food or 2 stone.'); break;
        case 'suleiman': if (mostStr().indexOf(p) < 0) return no('Suleiman: only when you are the strongest.'); if (!canTake(p)) return no('No worker left to take.'); break;
        case 'lincoln': if (!canTake(p)) return no('No worker left to take.'); break;
        case 'bolivar': if (!p.colonies.some(Boolean)) return no('You have no colony to give up.'); break;
      }
      return yes({ s });
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
        default: return no('That card has no action.');
      }
      if (s.once) p.used[s.card] = true;
      log(ev);
      return yes();
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
      push({ k: 'fx', side: 'b', i: 0 });
      push({ k: 'famine' });
      if (g.round % 2 === 0) push({ k: 'ageEnd' });
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
        else if (f.perColonyAge) times = p.colonies.filter(c => c && C(c).age === f.perColonyAge).length;
        else if (f.perCurAgeBM) times = p.bm.filter(s => s && s.card && C(s.card).age === g.age).length;
        else if (f.perIndWorker) times = p.bm.reduce((t, s) => t + (s && s.card && C(s.card).type === 'building' && C(s.card).age === 4 ? s.w : 0), 0);
        else if (f.ifStrGtWar) { if (inPhase && p.peter) { out[p.peter] += 5; why.push({ card: x.card, res: { [p.peter]: 5 } }); } continue; }
        if (!times) continue;
        for (const r in f.gain) out[r] = (out[r] || 0) + f.gain[r] * times;
        why.push({ card: x.card, res: Object.fromEntries(Object.entries(f.gain).map(([k, v]) => [k, v * times])) });
      }
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
        p.peter = null;
      }
    }

    function playerOrder() {
      const ev = D.event(g.event);
      const frozen = [ev.a, ev.b].some(e => e.fx.some(f => f.noOrderChange));
      const before = byOrder().map(p => p.id);
      if (!frozen) {
        const prev = g.order.slice();
        g.order.sort((x, y) => {
          const a = g.players[x], b = g.players[y];
          return (strM(b) - strM(a)) || (stabOrder(b) - stabOrder(a)) || (prev.indexOf(x) - prev.indexOf(y));
        });
      }
      log({ t: 'order', before, after: byOrder().map(p => p.id), frozen });
    }
    const stabOrder = p => cap(stab(p), 15);

    function warStep() {
      if (!g.war) { log({ t: 'war', none: true }); return; }
      const w = C(g.war.card);
      const extraFood = all().reduce((t, q) => t + sumFx(q, 'allDefeatFood'), 0);
      const lost = [];
      for (const p of byOrder()) {
        const s = cap(str(p), 40) + sumFx(p, 'warStr');
        if (s >= g.war.str) { p.warLoss = null; continue; }
        const st = Math.max(0, stab(p));
        let relief = st;
        const bill = [];
        for (const r in w.loss) bill.push([r, w.loss[r]]);
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
        case 'advisorAge': return byOrder().filter(p => p.advisors.some(a => a && f.ages.indexOf(C(a).age) >= 0));
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
        for (let k = 0; k < p.advisors.length; k++) if (p.advisors[k]) { log({ t: 'removed', by: p.id, card: p.advisors[k], why: 'event', name }); g.discard.push(p.advisors[k]); p.advisors[k] = null; }
        note(p, gain(p, f.gain || {}, 'event'));
      });
      if (f.ifColonyAge) for (const p of set) add(() => { if (p.colonies.some(c => c && C(c).age === f.ifColonyAge)) note(p, gain(p, f.gain)); });
      if (f.othersGain && set.length && !f.either) {
        for (const p of byOrder()) if (set.indexOf(p) < 0) add(() => note(p, gain(p, f.othersGain, 'event')));
      }
      if (f.last || f.first) add(() => moveOrder(set, f.last ? 'last' : 'first', name));
      if (f.perWarBattle) for (const p of set) add(() => { const k = p.bought.war + p.bought.battle; if (k) note(p, gain(p, mul(f.perWarBattle, k))); });
      if (f.perColonyBought) for (const p of set) add(() => { const k = p.bought.colony; if (k) note(p, gain(p, mul(f.perColonyBought, k))); });
      if (f.perColonyAge) for (const p of set) add(() => { const k = p.colonies.filter(c => c && C(c).age === f.perColonyAge.age).length; if (k) note(p, gain(p, mul(f.perColonyAge.gain, k))); });
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
        const have = p.colonies.map((c, k) => c ? k : -1).filter(k => k >= 0);
        if (!have.length) { note(p, gain(p, { vp: -f.removeColony })); return; }
        const drop = k => { log({ t: 'removed', by: p.id, card: p.colonies[k], why: 'event', name }); g.discard.push(p.colonies[k]); p.colonies[k] = null; };
        if (have.length === 1) { drop(have[0]); return; }
        ask(p, 'choice', { what: 'loseColony', why: name + ': which colony do you lose?', options: have.map(k => ({ id: 'c' + k, label: C(p.colonies[k]).name })), then: pick => drop(+pick.slice(1)) });
      });
      if (f.removeAdvisorOr) for (const p of set) add(() => {
        const have = p.advisors.map((a, k) => a ? k : -1).filter(k => k >= 0);
        if (!have.length) { note(p, gain(p, { vp: -f.removeAdvisorOr })); return; }
        dropAdvisor(p, have, name);
      });
      /* Run this effect's pieces in front of what was queued. */
      for (const st of here) push(st);
    }
    const mul = (o, k) => { const out = {}; for (const r in o) out[r] = o[r] * k; return out; };
    const fmt = o => Object.keys(o || {}).map(r => o[r] + ' ' + (r === 'vp' ? 'VP' : r)).join(' + ');

    function dropAdvisor(p, have, name) {
      const drop = k => { log({ t: 'removed', by: p.id, card: p.advisors[k], why: 'event', name }); g.discard.push(p.advisors[k]); p.advisors[k] = null; };
      if (have.length === 1) { drop(have[0]); return; }
      ask(p, 'choice', { what: 'loseAdvisor', why: name + ': which advisor goes?', options: have.map(k => ({ id: 'a' + k, label: C(p.advisors[k]).name })), then: pick => drop(+pick.slice(1)) });
    }
    function eitherOptions(p, list) {
      return list.map((o, k) => {
        let label = '', ok = true;
        if (o.gain) label = fmt(Object.fromEntries(Object.entries(o.gain).map(([r, v]) => [r, v]))).replace(/(^|\+ )(\d)/g, '$1+$2').replace(/\+-/g, '−');
        if (o.gain) label = Object.entries(o.gain).map(([r, v]) => (v > 0 ? '+' : '−') + Math.abs(v) + ' ' + (r === 'vp' ? 'VP' : r)).join(', ');
        if (o.othersGain) label = 'Everybody else ' + Object.entries(o.othersGain).map(([r, v]) => (v > 0 ? '+' : '−') + Math.abs(v) + ' ' + r).join(', ');
        if (o.last) label = 'Go last next round';
        if (o.removeArch) { label = 'Take an architect off your wonder'; ok = !!(p.uc && p.uc.built > 0); }
        if (o.removeAdvisor) { label = 'Lose your advisor'; ok = p.advisors.some(Boolean); }
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
      if (o.removeAdvisor) { const have = p.advisors.map((a, k) => a ? k : -1).filter(k => k >= 0); if (have.length) dropAdvisor(p, have, name); }
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
      else for (const s of sectionsOpen(p)) opts.push({ id: s, label: 'Take a worker from the ' + (s === 'food' ? 'Food' : 'Stability') + ' track' });
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
      const sections = ['stab', 'food'].filter(s => p.taken[s] > 0);
      const finish = (from) => {
        if (sections.length < 2) { returnWorker(p, from, sections[0] || null); checkRemovals(); return; }
        ask(p, 'choice', { what: 'returnTo', why: name + ': put it back on which track?', options: [{ id: 'stab', label: 'Stability track (+3 stability)' }, { id: 'food', label: 'Food track (3 less food a round)' }],
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
      for (const p of byOrder()) {
        if (!f) continue;
        const got = lose(p, 'food', f, 'famine', {});
        log({ t: 'famine', by: p.id, n: f, got });
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
    }
    function endRound() {
      const over = g.round >= g.lastRound;
      for (const p of all()) {
        p.passed = false; p.bought = { war: 0, battle: 0, colony: 0, ga: 0 };
        p.lackVP = {}; p.used = {}; p.temp = { str: 0, stab: 0 }; p.leastStab = false; p.westphalia = 0; p.warLoss = null;
      }
      if (g.war) { g.discard.push(g.war.card); g.war = null; }
      g.arch = 0;
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
      for (let r = 0; r < 3; r++) for (let c = 0; c < g.cols; c++) {
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
        return { slot: k, card: s.card, cost, ok: chk.ok, why: chk.ok ? '' : chk.why, canMove: p.res.stone >= cost ? froms : [] };
      });
      const hire = p.uc ? {
        card: p.uc.card, built: p.uc.built, cost: C(p.uc.card).cost[p.uc.built],
        public: hireCheck(p, 'public').ok, private: hireCheck(p, 'private').ok,
        why: hireCheck(p, p.privArch > 0 ? 'private' : 'public').why || ''
      } : null;
      const specials = specialsOf(p).map(s => { const chk = specialCheck(p, s.card); return { card: s.card, act: s.act, once: s.once, used: s.used, ok: chk.ok, why: chk.ok ? '' : chk.why }; });
      return { board, deploy, hire, specials, idle: p.idle, galileo: specials.some(s => s.act === 'galileo' && s.ok) ? board.filter(b => ['golden', 'wonder'].indexOf(C(b.card).type) >= 0).map(b => ({ r: b.r, c: b.c, card: b.card, need: buyCheck(p, b.r, b.c, true).need || null })) : [] };
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
        res: Object.assign({}, p.res), idle: p.idle, workers: workersOf(p),
        taken: Object.assign({}, p.taken), track: Object.assign({}, p.track), freeTop: p.freeTop,
        bm: p.bm.map(s => s && s.card ? { card: s.card, w: s.w } : null),
        advisors: p.advisors.slice(),
        colonies: p.colonies.slice(), wonders: p.wonders.slice(), wonderCap: p.wonderCap,
        uc: p.uc ? { card: p.uc.card, built: p.uc.built } : null,
        privArch: p.privArch, used: Object.keys(p.used),
        passed: p.passed, str: str(p), stab: stab(p), raid: raidOf(p), gaBonus: gaBonus(p),
        prod, bought: Object.assign({}, p.bought), leastStab: p.leastStab,
        score: scoreOf(p, all())
      };
    }
    g.publicView = function () {
      return {
        v: VERSION, n: g.n, round: g.round, lastRound: g.lastRound, age: g.age, ages: g.ages, phase: g.phase,
        sets: g.sets.slice(), side: g.side, cols: g.cols,
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
