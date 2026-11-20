'use strict';
/* 1960: The Making of the President — the rules. No DOM, no timers, one
 * seeded rng.
 *
 * The display holds the one Game; every order — from a phone, a house player
 * or a test — goes through `g.act(seatId, answer)`, which refuses with a
 * reason rather than a bare false.
 *
 * **The game is one generator** (the Radlands/Gwent pattern). `main()` deals,
 * checks initiative, plays five activity phases a turn, the Momentum and
 * Campaign Strategy phases, the Debates and Election Day. A card's event is a
 * list of steps (`ops` in m60-data.js) run by `runOps`; every question is a
 * `yield {ask}`:
 *
 *   g.prompts   the questions open right now — the active player's card, a
 *               choice inside an event or an action, the opponent's chance
 *               to trigger, or both players at once (Campaign Strategy, a
 *               debate round).
 *   g.hold      decide, hold, show, then apply: every draw from the bag (the
 *               cubes are drawn first and shown before they land), the card
 *               that opens each turn, the Momentum phase, each debate round
 *               and issue, and every step of Election Day. Only when the
 *               telly is showing the game (`opts.show`); a test proves seeded
 *               games end identically with it on and off.
 *
 * Generators cannot be copied, so undo is by replay (the telly keeps the
 * answers), never by snapshot.
 *
 * **What is secret:** each hand; each Campaign Strategy stack; the deck's
 * order; the endorsement deck's order; a debate pick until both are shown;
 * Kennedy's hand once Opposition Research shows it (Nixon's phone only).
 * The board, the bag's counts, momentum, rest cubes, the discard pile, the
 * persistent events and hand and stack sizes are public.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./m60-data.js') : root.M60Data;

  const VERSION = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const OVER = { over: true };
  /* The holds the whole table reads (Continue on every phone); the others
     the telly shows for a moment and lets go. */
  const TABLE_HOLDS = { turnStart: 1, mom: 1, debateStart: 1, debateEnd: 1, edayStart: 1, lesson: 1 };
  /* How to play (opts.teach): the lessons, in the order a first game meets
     them (ARCHITECTURE.md, "What a newcomer meets, ranked"). Tier 1 before
     the first card; each tier 2 lesson the first time it bites. They are
     holds like any other, so a game without a telly never sees them and a
     seeded game ends the same with them or without. */
  const LESSONS_FIRST = ['votes', 'cards', 'checks', 'faces', 'turns'];
  const R = D.RULES;
  const other = D.other;
  const sgn = D.signOf;

  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {                         // mulberry32
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
  const clone = o => JSON.parse(JSON.stringify(o));
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const no = why => ({ ok: false, why });
  const SN = s => D.SIDE[s].name;

  /* ================================================================
     Building a game
     opts.players: [{ id, name, hex, bot, level, side }] — two, one a side.
     opts.restricted: the Restricted Positioning optional rule.
     ================================================================ */
  function create(opts) {
    opts = opts || {};
    const list = opts.players || [];
    if (list.length !== 2) throw new Error('1960 is for two players');
    const seed = opts.seed == null ? Date.now() : opts.seed;
    const g = {
      VERSION, seed, rng: rngFrom(seed), rngN: 0, drawN: 0,
      opts: { show: !!opts.show, restricted: !!opts.restricted, teach: !!opts.teach },
      phase: 'setup', turn: 0, ap: 0, first: null, initSide: null, cur: null,
      sup: {}, media: {}, end: {}, iss: {}, order: D.ISSUE_START.slice(),
      tok: { K: D.SIDE.K.home, N: D.SIDE.N.home }, mom: { K: R.momentum, N: R.momentum },
      bag: { K: R.bagSeed, N: R.bagSeed }, rest: { K: 0, N: 0 },
      hand: { K: [], N: [] }, strat: { K: [], N: [] }, deck: [], disc: [], gone: [],
      board: { prev: [], debate: [], eday: [] }, edeck: [], edisc: [],
      cand: { K: true, N: true }, fx: {}, fxCards: [], seen: null,
      debate: null, eday: null, noReseed: false, ledgerTurn: [],
      log: [], prompts: [], pn: 0, waitAll: false, answers: {},
      hold: null, holdN: 0, actN: 0, limbo: [], result: null
    };
    D.STATES.forEach(s => { g.sup[s] = D.STATE[s].start; });
    D.REGIONS.forEach(r => { g.media[r] = 0; g.end[r] = 0; });
    D.ISSUES.forEach(i => { g.iss[i] = 0; });
    const sides = list.map(x => x.side);
    if (sides.indexOf('K') < 0 || sides.indexOf('N') < 0) list.forEach((x, i) => { x.side = i ? 'N' : 'K'; });
    /* Kennedy is always players[0]: the board, the views and the tests read
       the two sides in the order K, N. */
    g.players = ['K', 'N'].map(side => {
      const x = list.find(y => y.side === side);
      return { id: x.id, name: x.name, hex: x.hex || D.SIDE[side].hex, bot: !!x.bot, side,
        level: x.bot ? (LEVELS.indexOf(x.level) >= 0 ? x.level : 'medium') : null };
    });
    attach(g);
    g.gen = g.main();
    g.advance();
    return g;
  }

  function attach(g) {
    const P = id => g.players.find(p => p.id === id) || null;
    const bySide = s => g.players.find(p => p.side === s);
    const rand = () => { g.rngN++; return g.rng(); };
    const log = e => { g.log.push(Object.assign({ tn: g.turn, ap: g.ap }, e)); return e; };

    g.seat = P;
    g.bySide = bySide;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.activeId = () => g.phase === 'act' && g.cur ? bySide(g.cur).id : null;
    g.note = e => log(e);

    /* ---------------- the board arithmetic ---------------- */
    const lead = st => D.leadOf(g.sup[st]);
    const carried = (st, side) => D.carried(g.sup[st], side);
    const issueLead = i => D.leadOf(g.iss[i]);
    const mediaTotal = side => D.REGIONS.reduce((t, r) => t + D.mine(g.media[r], side), 0);
    const issueTotal = side => D.ISSUES.reduce((t, i) => t + D.mine(g.iss[i], side), 0);
    const prevented = id => g.board.prev.some(p => (D.CARD[p].prevents || []).indexOf(id) >= 0);
    const canSpend = (side, n) => g.mom[side] >= n && !(g.fx.noMom && g.fx.noMom[side]);
    function addMom(side, n, why) {
      if (!side || !n) return;
      const before = g.mom[side];
      g.mom[side] = Math.max(0, before + n);
      const d = g.mom[side] - before;
      if (d || n < 0) log({ t: 'mom', side, n: d, want: n, why: why || null });
    }
    function addSup(side, st, n, via) {
      if (!n) return;
      const before = g.sup[st];
      g.sup[st] += sgn(side) * n;
      log({ t: 'sup', side, st, n, from: before, to: g.sup[st], via: via || null });
    }
    /* Losing is limited to what you have; the other side never gains. */
    function loseSup(side, st, n, via) {
      const have = D.mine(g.sup[st], side);
      const k = Math.min(have, n);
      if (k > 0) { const before = g.sup[st]; g.sup[st] -= sgn(side) * k; log({ t: 'lose', side, st, n: k, from: before, to: g.sup[st], via: via || null }); }
      else log({ t: 'lose', side, st, n: 0, want: n, via: via || null });
      return k;
    }
    function addIssue(side, i, n) {
      if (n > 0) { g.iss[i] += sgn(side) * n; log({ t: 'iss', side, iss: i, n }); return; }
      const k = Math.min(D.mine(g.iss[i], side), -n);
      if (k > 0) g.iss[i] -= sgn(side) * k;
      log({ t: 'iss', side, iss: i, n: -k, want: n });
    }
    function addMedia(side, r, n) { if (n) { g.media[r] += sgn(side) * n; log({ t: 'media', side, reg: r, n }); } }
    function moveUp(i, n) {
      const from = g.order.indexOf(i);
      const to = Math.max(0, from - n);
      if (to !== from) { g.order.splice(from, 1); g.order.splice(to, 0, i); }
      log({ t: 'up', iss: i, from, to, order: g.order.slice() });
    }

    /* ---------------- the bag ---------------- */
    function reseed() {
      g.bag.K += R.bagSeed; g.bag.N += R.bagSeed;
      log({ t: 'reseed', bag: Object.assign({}, g.bag) });
    }
    function bagDraw() {
      let tot = g.bag.K + g.bag.N;
      if (!tot) { if (g.noReseed) return null; reseed(); tot = g.bag.K + g.bag.N; }
      const c = rand() * tot < g.bag.K ? 'K' : 'N';
      g.bag[c]--;
      return c;
    }
    /* k support checks for `side`. Profiles in Courage draws each of
       Kennedy's failures once more. Returns the cubes in the order drawn. */
    function checks(side, k) {
      const cubes = [];
      let got = 0;
      for (let j = 0; j < k; j++) {
        const c = bagDraw();
        if (!c) { cubes.push({ c: null }); continue; }
        cubes.push({ c });
        if (c === side) { got++; continue; }
        if (side === 'K' && g.fx.profiles) {
          const c2 = bagDraw();
          if (!c2) { cubes.push({ c: null, re: true }); continue; }
          cubes.push({ c: c2, re: true });
          if (c2 === side) got++;
        }
      }
      return { cubes, got };
    }
    function initiative(why) {
      const n = { K: 0, N: 0 };
      const cubes = [];
      for (;;) {
        const c = bagDraw();
        if (!c) break;
        cubes.push({ c });
        if (++n[c] >= 2) break;
      }
      const winner = n.K >= 2 ? 'K' : n.N >= 2 ? 'N' : (n.K >= n.N ? 'K' : 'N');
      log({ t: 'init', cubes: cubes.map(x => x.c), winner, why });
      return { cubes, winner };
    }

    /* ---------------- the decks ---------------- */
    function drawCard() {
      if (!g.deck.length) {
        if (!g.disc.length) return null;
        g.deck = shuffle(g.disc, rand);
        g.disc = [];
        log({ t: 'reshuffle', n: g.deck.length });
      }
      g.drawN++;
      return g.deck.pop();
    }
    function drawTo(side, n, why) {
      let k = 0;
      for (let j = 0; j < n; j++) { const c = drawCard(); if (c == null) break; g.hand[side].push(c); k++; }
      if (why) log({ t: 'draw', side, n: k, why });
      return k;
    }
    function endorseCard() {
      if (!g.edeck.length) { g.edeck = shuffle(g.edisc, rand); g.edisc = []; log({ t: 'ereshuffle' }); }
      g.drawN++;
      return g.edeck.pop() || null;
    }
    function placeEndorse(side, r, via) {
      const opp = other(side);
      if (D.mine(g.end[r], opp) > 0) { g.end[r] += sgn(side); log({ t: 'endorse', side, reg: r, removed: true, via: via || null }); }
      else { g.end[r] += sgn(side); log({ t: 'endorse', side, reg: r, via: via || null }); }
    }

    /* ================================================================
       Asking
       ================================================================ */
    function* ask(side, pr) {
      pr = Object.assign({}, pr, { n: ++g.pn, seat: bySide(side).id, t: pr.t || 'pick' });
      const a = yield { ask: [pr] };
      return a;
    }
    /* A pick. A question with one legal answer answers itself (unless
       `always`); with none it is not asked. */
    function* pick(side, what, why, options, o) {
      o = o || {};
      const legal = options.filter(x => !x.bad);
      if (!o.multi) {
        if (!legal.length) return null;
        if (legal.length === 1 && !o.skip && !o.always) return legal[0].id;
      } else if (!legal.length && !o.always) return [];
      const a = yield* ask(side, { t: 'pick', what, why, pub: o.pub || null, options, multi: !!o.multi, card: o.card || null, st: o.st || null,
        min: o.multi ? (o.min || 0) : 1, max: o.multi ? Math.min(o.max == null ? legal.length : o.max, legal.length) : 1, skip: o.skip || null });
      if (a.t === 'skip') return o.multi ? [] : null;
      return o.multi ? a.ids.slice() : a.id;
    }
    /* Share up to `total` among options, at most each option's cap.
       Answers itself when every option can be filled and nothing needs a
       check (adding never hurts the one adding). */
    function* alloc(side, what, why, options, total, o) {
      o = o || {};
      const opts = options.filter(x => x.cap > 0);
      if (!opts.length || total <= 0) return {};
      const room = opts.reduce((t, x) => t + x.cap, 0);
      const min = o.must ? Math.min(total, room) : (o.min || 0);
      if (room <= total && !opts.some(x => x.chk) && (o.auto !== false)) {
        const m = {};
        opts.forEach(x => { m[x.id] = x.cap; });
        return m;
      }
      const a = yield* ask(side, { t: 'alloc', what, why, pub: o.pub || null, options: opts, total, min, card: o.card || null, budget: o.budget || null });
      return a.map || {};
    }
    function* hold(h) { yield { hold: h }; }

    /* ================================================================
       Support, with checks
       ================================================================ */
    const regOf = st => D.STATE[st].reg;
    /* Must `side` make support checks to add support in st? The opponent
       carries it or stands in it (or, Campaigning under Hostile Press
       Corps, Nixon checks everywhere) — unless `side` has media support in
       the region, or (Campaigning only) Advance Men. */
    function needsCheck(side, st, mode) {
      const opp = other(side);
      const req = carried(st, opp) || g.tok[opp] === st || (mode === 'camp' && side === 'N' && !!g.fx.hostile);
      if (!req) return false;
      if (D.mine(g.media[regOf(st)], side) > 0) return false;
      if (mode === 'camp' && g.fx.advance && g.fx.advance[side]) return false;
      return true;
    }
    g.needsCheck = needsCheck;
    /* Apply an allocation of state support: straight in where no check is
       needed, drawn from the bag where one is — the draws shown on the telly
       first (decide, hold, show, apply). */
    function* applyAdd(side, map, why, mode, card) {
      const plain = [], drawn = [];
      for (const st of Object.keys(map)) {
        const k = map[st] | 0;
        if (k <= 0) continue;
        if (needsCheck(side, st, mode || 'event')) drawn.push({ st, k });
        else plain.push({ st, k });
      }
      plain.forEach(x => addSup(side, x.st, x.k, card || mode || null));
      if (!drawn.length) return;
      const rows = drawn.map(x => { const r = checks(side, x.k); return { st: x.st, k: x.k, cubes: r.cubes, got: r.got }; });
      log({ t: 'checks', side, why, rows: rows.map(r => ({ st: r.st, k: r.k, got: r.got, cubes: r.cubes.map(c => c.c) })) });
      yield* hold({ k: 'draw', side, why, card: card || null, rows: clone(rows) });
      rows.forEach(r => { if (r.got) addSup(side, r.st, r.got, 'check'); });
    }
    function stateOpts(side, filter, cap, mode) {
      return D.STATES.filter(filter).map(st => ({ id: st, cap: typeof cap === 'function' ? cap(st) : cap, chk: mode ? needsCheck(side, st, mode) : false,
        label: D.STATE[st].name, ev: D.STATE[st].ev, sup: g.sup[st] }));
    }
    function whereFn(side, where) {
      if (!where || where === 'any') return () => true;
      if (where.sts) return st => where.sts.indexOf(st) >= 0;
      if (where.reg) return st => regOf(st) === where.reg;
      if (where.regs) return st => where.regs.indexOf(regOf(st)) >= 0 && (where.evMax == null || D.STATE[st].ev <= where.evMax);
      if (where.evMin) return st => D.STATE[st].ev >= where.evMin;
      if (where.empty) return st => g.sup[st] === 0;
      return () => true;
    }

    /* ================================================================
       The events: one interpreter for every card's steps
       ================================================================ */
    function who(w, me) {
      if (!w) return null;
      if (w === 'K' || w === 'N') return w;
      if (w === 'me') return me;
      if (w === 'opp') return other(me);
      if (w.indexOf('lead:') === 0) return issueLead(w.slice(5));
      if (w.indexOf('media:') === 0) return D.leadOf(g.media[w.slice(6)]);
      if (w === 'akhi') {
        const k = D.mine(g.sup.AK, 'K') + D.mine(g.sup.HI, 'K'), n = D.mine(g.sup.AK, 'N') + D.mine(g.sup.HI, 'N');
        return k > n ? 'K' : n > k ? 'N' : null;
      }
      if (w === 'leadCT') return lead('CT');
      return null;
    }
    function playableEvent(id, side) {
      if (prevented(id)) return 'Prevented by ' + D.CARD[g.board.prev.find(p => (D.CARD[p].prevents || []).indexOf(id) >= 0)].name + '.';
      return null;
    }
    g.playableEvent = playableEvent;
    function setFx(key, side, card, extra) {
      switch (key) {
        case 'cpUp': case 'noMom': case 'advance': (g.fx[key] = g.fx[key] || {})[side] = true; break;
        case 'noCamp': { const m = g.fx.noCamp = g.fx.noCamp || {}; m[side] = (m[side] || []).concat(extra.regs.filter(r => (m[side] || []).indexOf(r) < 0)); break; }
        case 'oldSouth': g.fx.oldSouth = side; break;
        default: g.fx[key] = true;
      }
      g.fxCards.push({ id: card, key, side: side || null });
      log({ t: 'fx', key, side: side || null, card });
    }

    /* Resolve card `id` as an event for `side` (who plays or triggered it).
       The card leaves the game afterwards, or goes to its place on the board. */
    function* resolveEvent(id, side, via) {
      const c = D.CARD[id];
      log({ t: 'event', side, card: id, via });
      if (c.persist) {
        g.board[c.persist].push(id);
        log({ t: 'persist', card: id, where: c.persist, side });
        return yield* runOps(c.ops, side, id);
      }
      g.limbo.push(id);
      yield* runOps(c.ops, side, id);
      g.limbo.splice(g.limbo.indexOf(id), 1);
      g.gone.push(id);
    }

    function* runOps(ops, me, card) {
      for (const o of ops) yield* runOp(o, me, card);
    }
    function* runOp(o, me, card) {
      const cname = D.CARD[card] ? D.CARD[card].name : '';
      switch (o.op) {
        case 'add': {
          const s = who(o.who, me);
          if (!s) { log({ t: 'nobody', card, what: o.who }); return; }
          let filter = whereFn(s, o.where);
          if (o.where && o.where.mediaReg) {
            const regs = D.REGIONS.filter(r => D.mine(g.media[r], s) > 0);
            if (!regs.length) { log({ t: 'nobody', card, what: 'media' }); return; }
            const r = yield* pick(s, 'region', cname + ': add support in which region? (you have media support there)', regs.map(x => ({ id: x, label: D.REGION[x].name })), { pub: 'choosing a region' });
            filter = st => regOf(st) === r;
          }
          const opts = stateOpts(s, filter, o.cap, 'event');
          const m = yield* alloc(s, 'add', cname + ': add up to ' + o.n + ' state support' + (o.cap < o.n ? ', at most ' + o.cap + ' a state' : '') + '.', opts, o.n, { card, pub: 'placing support' });
          return yield* applyAdd(s, m, cname, 'event', card);
        }
        case 'gain': {
          const s = who(o.who, me);
          if (!s) { log({ t: 'nobody', card, what: o.who }); return; }
          return yield* applyAdd(s, { [o.st]: o.n }, cname, 'event', card);
        }
        case 'sub': {
          const from = who(o.from, me), by = who(o.by, me);
          if (!from || !by) { log({ t: 'nobody', card, what: o.from }); return; }
          const filter = whereFn(from, o.where);
          const opts = D.STATES.filter(st => filter(st) && D.mine(g.sup[st], from) > 0)
            .map(st => ({ id: st, cap: Math.min(o.cap, D.mine(g.sup[st], from)), label: D.STATE[st].name, ev: D.STATE[st].ev, sup: g.sup[st] }));
          if (!opts.length) { log({ t: 'lose', side: from, st: null, n: 0, want: o.n, via: card }); return; }
          const chooser = o.must ? from : by;
          const m = yield* alloc(chooser, 'sub', cname + ': ' + (o.must ? 'take ' + o.n + ' of your own' : 'take up to ' + o.n + ' of ' + SN(from) + '’s') + ' state support off' + (o.cap < o.n ? ', at most ' + o.cap + ' a state' : '') + '.', opts, o.n, { must: !!o.must, card, pub: o.must ? 'choosing what to lose' : 'choosing what to take' });
          for (const st of Object.keys(m)) if (m[st] > 0) loseSup(from, st, m[st], card);
          return;
        }
        case 'lose': {
          const s = who(o.who, me);
          if (!s) return;
          const st = o.st === 'token' ? g.tok[s] : o.st;
          loseSup(s, st, o.n, card);
          return;
        }
        case 'mom': { const s = who(o.who, me); if (s) addMom(s, o.n, card); else log({ t: 'nobody', card, what: o.who }); return; }
        case 'iss': {
          const s = who(o.who, me);
          if (!s) return;
          (o.iss === 'each' ? D.ISSUES : [o.iss]).forEach(i => addIssue(s, i, o.n));
          return;
        }
        case 'issPick': {
          const s = who(o.who, me);
          if (o.one) {
            const i = yield* pick(s, 'issue', cname + ': put ' + o.n + ' issue support on which issue?', D.ISSUES.map(x => ({ id: x, label: D.ISSUE[x].name })), { always: true, pub: 'choosing an issue' });
            if (i) addIssue(s, i, o.n);
            return;
          }
          const m = yield* alloc(s, 'iss', cname + ': add ' + o.n + ' issue support, split as you like.', D.ISSUES.map(x => ({ id: x, cap: o.n, label: D.ISSUE[x].name })), o.n, { card, pub: 'choosing issues', auto: false });
          for (const i of Object.keys(m)) if (m[i] > 0) addIssue(s, i, m[i]);
          return;
        }
        case 'issLose': {
          const s = who(o.who, me);
          const opts = D.ISSUES.filter(i => D.mine(g.iss[i], s) > 0).map(i => ({ id: i, cap: D.mine(g.iss[i], s), label: D.ISSUE[i].name }));
          const m = yield* alloc(s, 'issLose', cname + ': take ' + o.n + ' off your issue support.', opts, o.n, { must: true, card, pub: 'choosing what to lose' });
          for (const i of Object.keys(m)) if (m[i] > 0) addIssue(s, i, -m[i]);
          return;
        }
        case 'up': moveUp(o.iss, o.n); return;
        case 'tok': {
          const s = who(o.who, me);
          let st = o.st;
          if (Array.isArray(st)) st = yield* pick(s, 'tok', cname + ': move your candidate to which state?', st.map(x => ({ id: x, label: D.STATE[x].name })), { always: true, pub: 'choosing where to go' });
          g.tok[s] = st;
          log({ t: 'tok', side: s, st, via: card });
          return;
        }
        case 'fx': {
          const s = o.who ? who(o.who, me) : (o.key === 'knee' || o.key === 'hostile' || o.key === 'ikeSilence' || o.key === 'jackie' ? 'N' : 'K');
          if (!s) { log({ t: 'nobody', card, what: o.who }); return; }
          setFx(o.key, s, card, o);
          return;
        }
        case 'media': {
          const s = who(o.who, me);
          const m = yield* alloc(s, 'media', cname + ': place ' + o.n + ' media support cubes.', D.REGIONS.map(r => ({ id: r, cap: o.n, label: D.REGION[r].name })), o.n, { must: true, card, pub: 'placing media support', auto: false });
          for (const r of Object.keys(m)) addMedia(s, r, m[r]);
          return;
        }
        case 'mediaAt': addMedia(who(o.who, me), o.reg, o.n); return;
        case 'mediaOff': {
          const from = o.from, by = other(from);
          const opts = D.REGIONS.filter(r => D.mine(g.media[r], from) > 0).map(r => ({ id: r, cap: D.mine(g.media[r], from), label: D.REGION[r].name }));
          if (!opts.length) { log({ t: 'mediaOff', side: from, n: 0 }); return; }
          const m = yield* alloc(by, 'mediaOff', cname + ': remove up to ' + o.n + ' of ' + SN(from) + '’s media support cubes.', opts, o.n, { card, pub: 'removing media support' });
          for (const r of Object.keys(m)) if (m[r] > 0) { g.media[r] -= sgn(from) * m[r]; log({ t: 'mediaOff', side: from, reg: r, n: m[r] }); }
          return;
        }
        case 'endorse': {
          const s = who(o.who, me);
          for (let k = 0; k < o.n; k++) {
            const r = yield* pick(s, 'region', cname + ': put an endorsement marker in which region?', D.REGIONS.map(x => ({ id: x, label: D.REGION[x].name, sub: endorseSub(s, x) })), { always: true, pub: 'choosing a region' });
            placeEndorse(s, r, card);
          }
          return;
        }
        case 'reclaim': { const s = who(o.who, me); if (!g.cand[s]) { g.cand[s] = true; log({ t: 'cand', side: s, ready: true, via: card }); } return; }
        case 'exhaust': { const s = who(o.who, me); if (g.cand[s]) { g.cand[s] = false; log({ t: 'cand', side: s, ready: false, via: card }); } else log({ t: 'cand', side: s, ready: false, already: true, via: card }); return; }
        case 'retrieve': {
          const s = who(o.who, me);
          if (o.card) {
            const i = g.disc.indexOf(o.card);
            if (i < 0) { log({ t: 'retrieve', side: s, card: null, want: o.card }); return; }
            g.disc.splice(i, 1); g.hand[s].push(o.card);
            log({ t: 'retrieve', side: s, card: o.card });
            return;
          }
          if (!g.disc.length) { log({ t: 'retrieve', side: s, card: null }); return; }
          const id = yield* pick(s, 'retrieve', cname + ': take which card from the discard pile into your hand?', g.disc.map(x => cardOpt(x)), { skip: 'None', pub: 'choosing from the discard pile' });
          if (id == null) { log({ t: 'retrieve', side: s, card: null, skipped: true }); return; }
          const c = +id;
          g.disc.splice(g.disc.indexOf(c), 1); g.hand[s].push(c);
          log({ t: 'retrieve', side: s, card: c });
          return;
        }
        case 'draw': { const s = who(o.who, me); drawTo(s, o.n, card); return; }
        case 'swap': {
          const s = who(o.who, me);
          if (!g.hand[s].length) { log({ t: 'swap', side: s, n: 0 }); return; }
          const ids = yield* pick(s, 'swap', cname + ': discard which cards? You draw as many again.', g.hand[s].map(x => cardOpt(x)), { multi: true, min: 0, max: g.hand[s].length, always: true, pub: 'choosing cards to change' });
          ids.map(Number).forEach(c => { g.hand[s].splice(g.hand[s].indexOf(c), 1); g.disc.push(c); });
          const k = drawTo(s, ids.length, null);
          log({ t: 'swap', side: s, n: ids.length, got: k });
          return;
        }
        case 'equal': {
          const s = who(o.who, me), q = other(s);
          if (g.mom[q] > g.mom[s]) addMom(s, g.mom[q] - g.mom[s], card);
          else log({ t: 'mom', side: s, n: 0, why: card, level: true });
          return;
        }
        case 'if': {
          const c = o.cond;
          let okc = false;
          if (c.leads) okc = issueLead(c.leads[1]) === c.leads[0];
          if (c.multi) okc = D.ISSUES.filter(i => issueLead(i) === c.multi).length >= 2;
          log({ t: 'cond', card, ok: okc, cond: c });
          if (okc) yield* runOps(o.ops, me, card);
          return;
        }
        case 'medal': {
          const L = o.iss.map(i => issueLead(i));
          o.iss.forEach((i, k) => { if (L[k]) addIssue(L[k], i, -1); });
          if (L[0] && L[0] === L[1]) addMom(L[0], -1, card);
          return;
        }
        case 'gm': {
          const k = D.statesLed(g.sup, o.reg, 'K'), n = D.statesLed(g.sup, o.reg, 'N');
          const s = k > n ? 'K' : n > k ? 'N' : null;
          log({ t: 'gm', reg: o.reg, K: k, N: n, side: s });
          if (!s) return;
          addMom(s, 1, card);
          const m = {};
          D.statesIn(o.reg).forEach(st => { if (g.sup[st] === 0) m[st] = 1; });
          return yield* applyAdd(s, m, cname, 'event', card);
        }
        case 'gallup': {
          const s = who(o.who, me);
          const perms = [];
          const P3 = D.ISSUES;
          for (const a of P3) for (const b of P3) for (const c of P3) if (a !== b && b !== c && a !== c) perms.push([a, b, c]);
          const opts = perms.map(p => ({ id: p.join(','), label: p.map(i => D.ISSUE[i].name).join(' · '), cur: p.join() === g.order.join() }));
          const id = yield* pick(s, 'order', cname + ': set the issues track (first place first).', opts, { always: true, pub: 'rearranging the issues' });
          g.order = id.split(',');
          log({ t: 'order', side: s, order: g.order.slice(), via: card });
          return;
        }
        case 'swing': {
          const s = who(o.who, me), q = other(s);
          const list = D.STATES.filter(st => lead(st) === q && !carried(st, q));
          if (!list.length) { log({ t: 'nobody', card, what: 'swing' }); return; }
          const st = yield* pick(s, 'swing', cname + ': which state? (' + SN(q) + ' leads it but does not carry it)', list.map(x => ({ id: x, label: D.STATE[x].name, sub: D.STATE[x].ev + ' votes · ' + SN(q) + ' ' + D.mine(g.sup[x], q) + (needsCheck(s, x, 'event') ? ' · support checks' : ''), chk: needsCheck(s, x, 'event') })), { always: true, pub: 'choosing a state' });
          yield* applyAdd(s, { [st]: 5 }, cname, 'event', card);
          g.tok[s] = st;
          log({ t: 'tok', side: s, st, via: card });
          return;
        }
        case 'whistle': return yield* campaign(who(o.who, me), 7, { whistle: true, card });
        case 'oppo': {
          g.seen = { side: 'N', of: 'K', ids: g.hand.K.slice(), turn: g.turn };
          log({ t: 'oppo', n: g.hand.K.length });
          const how = yield* pick('N', 'oppo', cname + ': spend 3 CP on what?', [{ id: 'camp', label: 'Campaign in states' }, { id: 'adv', label: 'Advertise (3 support checks for media)' }, { id: 'pos', label: 'Position on issues' }], { skip: 'Nothing', always: true, pub: 'choosing what to do with 3 CP' });
          if (how) yield* cpAction('N', how, 3, card, true);
          return;
        }
        case 'highHopes': {
          for (let k = 0; k < 2; k++) {
            const id = drawCard();
            if (id == null) break;
            const c = D.CARD[id];
            const ok = (c.icon === 'K' || c.icon === 'B') && !playableEvent(id, 'K');
            log({ t: 'hh', card: id, k: k + 1, ok });
            if (ok) yield* resolveEvent(id, 'K', 'hh');
            else g.disc.push(id);
          }
          return;
        }
        case 'tricky': {
          const list = g.disc.filter(x => !playableEvent(x, 'N'));
          if (!list.length) { log({ t: 'retrieve', side: 'N', card: null }); return; }
          const id = yield* pick('N', 'tricky', cname + ': play which card from the discard pile as your event?', list.map(x => cardOpt(x)), { skip: 'None', pub: 'choosing from the discard pile' });
          if (id == null) { log({ t: 'retrieve', side: 'N', card: null, skipped: true }); return; }
          const c = +id;
          g.disc.splice(g.disc.indexOf(c), 1);
          return yield* resolveEvent(c, 'N', 'tricky');
        }
      }
    }
    const cardOpt = id => ({ id: String(id), card: id, label: D.CARD[id].name });
    function endorseSub(s, r) {
      const v = g.end[r];
      return v === 0 ? 'no markers there' : D.leadOf(v) === s ? 'you have ' + D.mine(v, s) : SN(other(s)) + ' has ' + D.mine(v, other(s)) + ' — yours removes one';
    }

    /* ================================================================
       Playing a card for Campaign Points
       ================================================================ */
    /* What a card is worth to `side` in CP for an action, after this turn's
       cards: bonuses first (to 5 at most), then penalties (to 1 at least). */
    function cpFor(side, base, how) {
      let v = base, up = 0, down = 0;
      if (g.fx.cpUp && g.fx.cpUp[side]) up++;
      if (side === 'K' && g.fx.kenAir && how === 'camp') up++;
      if (up) v = Math.max(v, Math.min(5, v + up));
      if (side === 'K' && g.fx.cpDown) down += 2;
      if (side === 'K' && g.fx.stature && how === 'pos') down += 2;
      if (down) v = Math.max(1, v - down);
      return v;
    }
    g.cpFor = cpFor;
    function campBlocked(side, st) {
      const r = regOf(st);
      if (g.fx.noCamp && g.fx.noCamp[side] && g.fx.noCamp[side].indexOf(r) >= 0) return 'No Campaigning in the ' + D.REGION[r].name + ' this turn.';
      if (g.fx.oldSouth === side && r === 'S') return 'Old South: no Campaigning in the South this turn.';
      if (side === 'N' && g.fx.ikeSilence && lead(st) === 'K') return 'Eisenhower’s Silence: not in a state Kennedy leads.';
      return null;
    }
    g.campBlocked = campBlocked;
    function travelCost(side, from, to) {
      if ((side === 'K' && g.fx.kenAir) || (g.fx.advance && g.fx.advance[side])) return 0;
      return D.travelCost(from, to);
    }
    /* Campaigning: travel and add support, one CP at a time, until the CP
       are spent or the player stops. A state that needs checks is declared
       once: all the points for it are drawn together. */
    function* campaign(side, cp, o) {
      o = o || {};
      let left = cp;
      const declared = {}, spent = {};
      let moved = false;
      log({ t: 'camp', side, cp, whistle: !!o.whistle });
      for (let guard = 0; left > 0 && guard < 60; guard++) {
        const mr = D.moveRegionOf(g.tok[side]);
        const options = [];
        D.statesInMove(mr).forEach(st => {
          const why = campBlocked(side, st) || (declared[st] ? 'Already declared with checks this action.' : null) || (o.whistle && spent[st] ? 'Whistlestop: 1 CP a state.' : null);
          const chk = needsCheck(side, st, 'camp');
          options.push({ id: (chk ? 'chk:' : 'add:') + st, st, chk, bad: why, label: D.STATE[st].name, ev: D.STATE[st].ev, sup: g.sup[st] });
        });
        D.MOVE_REGIONS.filter(x => x !== mr).forEach(x => {
          const c = travelCost(side, mr, x);
          if (c <= left) options.push({ id: 'go:' + x, go: x, cost: c, label: 'Travel to ' + (x === 'AK' ? 'Alaska' : x === 'HI' ? 'Hawaii' : 'the ' + D.REGION[x].name), sub: c ? c + ' CP' : 'free', bad: c > left ? 'Not enough CP.' : null });
        });
        options.push({ id: 'end', label: 'Stop here', sub: left + ' CP unspent' });
        const a = yield* ask(side, { t: 'camp', what: 'camp', why: 'Campaigning: ' + left + ' CP left' + (o.whistle ? ' (Whistlestop: 1 a state)' : ''), pub: 'campaigning', options, left, region: mr, tok: g.tok[side] });
        if (a.id === 'end') break;
        if (a.id.indexOf('go:') === 0) {
          const x = a.id.slice(3);
          const c = travelCost(side, mr, x);
          left -= c;
          const st = yield* pick(side, 'tok', 'Which state does your candidate stop in?', D.statesInMove(x).map(s => ({ id: s, label: D.STATE[s].name, sub: D.STATE[s].ev + ' votes' })), { always: D.statesInMove(x).length > 1, pub: 'choosing where to stop' });
          g.tok[side] = st;
          moved = true;
          log({ t: 'travel', side, to: x, st, cost: c });
          continue;
        }
        const st = a.id.slice(4);
        if (a.id.indexOf('chk:') === 0) {
          const max = o.whistle ? 1 : left;
          let k = 1;
          if (max > 1) {
            const opts = [];
            for (let j = 1; j <= max; j++) opts.push({ id: String(j), label: j + ' CP — ' + j + ' support check' + (j === 1 ? '' : 's') });
            k = +(yield* pick(side, 'declare', 'How many CP do you spend in ' + D.STATE[st].name + '? Each is one draw from the bag.', opts, { always: true, st, pub: 'declaring support checks' }));
          }
          declared[st] = true;
          spent[st] = (spent[st] || 0) + k;
          left -= k;
          g.tok[side] = st;
          log({ t: 'tok', side, st, via: 'camp' });
          yield* applyAdd(side, { [st]: k }, 'Campaigning in ' + D.STATE[st].name, 'camp', o.card || null);
        } else {
          spent[st] = (spent[st] || 0) + 1;
          left--;
          g.tok[side] = st;
          addSup(side, st, 1, 'camp');
        }
      }
      if (left > 0) log({ t: 'campEnd', side, left });
      return moved;
    }
    function* advertise(side, cp, card) {
      const r = checks(side, cp);
      log({ t: 'checks', side, why: 'adv', rows: [{ st: null, k: cp, got: r.got, cubes: r.cubes.map(c => c.c) }] });
      yield* hold({ k: 'draw', side, why: 'Advertising', card: card || null, rows: [{ st: null, k: cp, cubes: clone(r.cubes), got: r.got }] });
      if (!r.got) { log({ t: 'media', side, n: 0, reg: null }); return; }
      const m = yield* alloc(side, 'media', 'Place ' + r.got + ' media support cube' + (r.got === 1 ? '' : 's') + '.', D.REGIONS.map(x => ({ id: x, cap: r.got, label: D.REGION[x].name, sup: g.media[x] })), r.got, { must: true, card, pub: 'placing media support', auto: false });
      for (const x of Object.keys(m)) addMedia(side, x, m[x]);
    }
    function* position(side, cp, card, banned) {
      const opts = D.ISSUES.map(i => ({ id: i, cap: cp, label: D.ISSUE[i].name, sup: g.iss[i], bad: banned === i ? 'Restricted Positioning: not the issue on your card.' : null }));
      const a = yield* ask(side, { t: 'alloc', what: 'pos', why: 'Positioning: ' + cp + ' CP. The first cube on an issue costs 1, each more on the same issue 2.', pub: 'positioning on issues', options: opts, total: cp, min: 0, budget: cp, card: card || null });
      const m = a.map || {};
      for (const i of D.ISSUES) if (m[i] > 0) addIssue(side, i, m[i]);
    }
    function* cpAction(side, how, cp, card, flat) {
      if (how === 'camp') return yield* campaign(side, cp, { card });
      if (how === 'adv') return yield* advertise(side, cp, card);
      const banned = g.opts.restricted && D.CARD[card] && !flat ? D.CARD[card].iss : null;
      return yield* position(side, cp, card, banned);
    }
    g.posCost = m => D.ISSUES.reduce((t, i) => t + ((m[i] | 0) > 0 ? 2 * (m[i] | 0) - 1 : 0), 0);

    /* ================================================================
       The turn menu — one pure function, used by the phone, the house and
       the answer check alike, so nothing offered is ever refused.
       ================================================================ */
    /* Keeping a Campaign Strategy card (rulebook p11): after this play, can
       the player still keep `need` cards that are not Gathering Momentum? */
    function keepsStrategy(side, handAfter, candAfter) {
      if (g.turn === R.debateTurn || g.turn >= R.electionTurn) return true;
      const need = R.strat(g.turn);
      const later = R.phases - g.ap;                       // plays still to make after this one
      const valid = handAfter.filter(c => !D.CARD[c].noStrat).length;
      const most = handAfter.length - later + (candAfter ? 1 : 0);
      return Math.min(valid, most) >= need;
    }
    function menu(side) {
      const m = menuWith(side, false);
      const any = m.hand.some(h => h.event.ok || h.camp.ok || h.adv.ok || h.pos.ok) || (m.cand && (m.cand.camp.ok || m.cand.adv.ok || m.cand.pos.ok));
      /* If keeping a Campaign Strategy card has left no legal play at all,
         the rule gives way. */
      return any ? m : menuWith(side, true);
    }
    function menuWith(side, relax) {
      const opp = other(side);
      const oppCanTrig = canSpend(opp, 1);
      const preCost = side === 'K' && g.fx.peaceCorps ? 0 : 2;
      const preOk = preCost === 0 || canSpend(side, 2);
      const kneeBlock = side === 'N' && g.fx.knee && !canSpend('N', 1) ? 'Nixon’s Knee: Campaigning costs 1 momentum, and you can spend none.' : null;
      const hand = g.hand[side].map(id => {
        const c = D.CARD[id];
        const after = g.hand[side].filter(x => x !== id);
        const keep = relax || keepsStrategy(side, after, g.cand[side]) ? null : 'Keep it: you need ' + (R.strat(g.turn) === 1 ? 'a card' : 'two cards') + ' (not Gathering Momentum) for Campaign Strategy.';
        const pe = playableEvent(id, side);
        const jackie = side === 'N' && g.fx.jackie ? (canSpend('N', 1) ? 1 : -1) : 0;
        const evWhy = keep || pe || (jackie < 0 ? 'Jackie Kennedy: an event costs 1 momentum, and you can spend none.' : null);
        const trig = !pe && oppCanTrig;
        return { card: id, cp: c.cp, rest: c.rest, keep,
          event: { ok: !evWhy, why: evWhy, mom: jackie > 0 ? 1 : 0 },
          camp: { ok: !keep && !kneeBlock, why: keep || kneeBlock, cp: cpFor(side, c.cp, 'camp'), mom: side === 'N' && g.fx.knee ? 1 : 0 },
          adv: { ok: !keep, why: keep, cp: cpFor(side, c.cp, 'adv') },
          pos: { ok: !keep, why: keep, cp: cpFor(side, c.cp, 'pos'), banned: g.opts.restricted ? c.iss : null },
          trig, pre: trig ? { ok: preOk, cost: preCost, why: preOk ? null : 'Preempting costs 2 momentum' + (g.fx.noMom && g.fx.noMom[side] ? ', and you may spend none this turn.' : '.') } : null };
      });
      let cand = null;
      if (g.cand[side]) {
        const keep = relax || keepsStrategy(side, g.hand[side], false) ? null : 'Keep your candidate card: you need it to save a Campaign Strategy card.';
        cand = { ok: true, keep,
          camp: { ok: !keep && !kneeBlock, why: keep || kneeBlock, cp: cpFor(side, R.candCp, 'camp'), mom: side === 'N' && g.fx.knee ? 1 : 0 },
          adv: { ok: !keep, why: keep, cp: cpFor(side, R.candCp, 'adv') },
          pos: { ok: !keep, why: keep, cp: cpFor(side, R.candCp, 'pos') } };
      }
      return { hand, cand, mom: g.mom[side], oppMom: g.mom[opp], pass: !g.hand[side].length && !g.cand[side] };
    }
    g.menu = id => { const p = P(id); return p ? menu(p.side) : null; };

    function turnCheck(side, a) {
      const m = menu(side);
      if (a.t === 'pass') return m.pass ? yes({ a: { t: 'pass' } }) : no('You have a card to play.');
      if (a.t !== 'play') return no('Choose a card to play.');
      const how = a.how;
      if (['event', 'camp', 'adv', 'pos'].indexOf(how) < 0) return no('Play it how?');
      if (a.card === 'cand') {
        if (!m.cand) return no('Your candidate card is exhausted.');
        if (how === 'event') return no('A candidate card has no event.');
        const x = m.cand[how];
        if (!x.ok) return no(x.why);
        return yes({ a: { t: 'play', card: 'cand', how, pre: false } });
      }
      const id = +a.card;
      const h = m.hand.find(x => x.card === id);
      if (!h) return no('That card is not in your hand.');
      const x = h[how];
      if (!x.ok) return no(x.why);
      let pre = !!a.pre && how !== 'event';
      if (pre && !(h.pre && h.pre.ok)) return no(h.pre ? h.pre.why : 'Nobody could trigger it: there is nothing to preempt.');
      return yes({ a: { t: 'play', card: id, how, pre } });
    }

    function* activity(side) {
      g.cur = side;
      if (!g.hand[side].length && !g.cand[side]) { log({ t: 'pass', side, why: 'no cards' }); return; }
      const a = yield* ask(side, { t: 'turn', why: 'Activity phase ' + g.ap + ' of ' + R.phases, pub: 'playing a card' });
      yield* doPlay(side, a);
    }
    function* doPlay(side, a) {
      const opp = other(side);
      if (a.t === 'pass') { log({ t: 'pass', side }); return; }
      const pledge = side === 'N' && g.fx.pledge && a.how !== 'camp';
      if (a.card === 'cand') {
        const cp = cpFor(side, R.candCp, a.how);
        g.cand[side] = false;
        log({ t: 'play', side, card: side, cand: true, how: a.how, cp });
        if (a.how === 'camp' && side === 'N' && g.fx.knee) addMom('N', -1, 2);
        if (pledge) addMom('K', 1, 76);
        yield* cpAction(side, a.how, cp, null);
        log({ t: 'cand', side, ready: false });
        return;
      }
      const id = a.card;
      const c = D.CARD[id];
      g.hand[side].splice(g.hand[side].indexOf(id), 1);
      g.limbo.push(id);
      g.rest[side] += c.rest;
      if (a.how === 'event') {
        log({ t: 'play', side, card: id, how: 'event', rest: c.rest });
        if (side === 'N' && g.fx.jackie) addMom('N', -1, 85);
        if (pledge) addMom('K', 1, 76);
        g.limbo.splice(g.limbo.indexOf(id), 1);
        yield* resolveEvent(id, side, 'play');
        return;
      }
      const cp = cpFor(side, c.cp, a.how);
      log({ t: 'play', side, card: id, how: a.how, cp, pre: !!a.pre, rest: c.rest });
      if (a.pre) {
        const cost = side === 'K' && g.fx.peaceCorps ? 0 : 2;
        if (cost) addMom(side, -cost, 'preempt');
      }
      if (a.how === 'camp' && side === 'N' && g.fx.knee) addMom('N', -1, 2);
      if (pledge) addMom('K', 1, 76);
      yield* cpAction(side, a.how, cp, id);
      /* The opponent may now trigger the event, for 1 momentum. */
      if (!a.pre && !playableEvent(id, opp) && canSpend(opp, 1)) {
        const t = yield* pick(opp, 'trigger', SN(side) + ' played ' + c.name + ' for CP. Trigger its event for 1 momentum? (you have ' + g.mom[opp] + ')',
          [{ id: 'yes', label: 'Trigger it — 1 momentum', card: id }, { id: 'no', label: 'Let it go' }], { always: true, card: id, pub: 'deciding whether to trigger ' + c.name });
        if (t === 'yes') {
          log({ t: 'trigger', side: opp, card: id });
          addMom(opp, -1, 'trigger');
          g.limbo.splice(g.limbo.indexOf(id), 1);
          yield* resolveEvent(id, opp, 'trigger');
          return;
        }
        log({ t: 'notrigger', side: opp, card: id });
      }
      g.limbo.splice(g.limbo.indexOf(id), 1);
      g.disc.push(id);
    }

    /* ================================================================
       The Momentum and Campaign Strategy phases
       ================================================================ */
    function* momentumPhase() {
      g.phase = 'mom';
      g.cur = null;
      const start = g.log.length;
      log({ t: 'momStart' });
      /* 1. Decay: half, rounded down. */
      const lost = { K: Math.floor(g.mom.K / 2), N: Math.floor(g.mom.N / 2) };
      g.mom.K -= lost.K; g.mom.N -= lost.N;
      log({ t: 'decay', lost, left: Object.assign({}, g.mom) });
      /* 2. The issue shift, by whoever has more media support. */
      const mk = mediaTotal('K'), mn = mediaTotal('N');
      const sh = mk > mn ? 'K' : mn > mk ? 'N' : null;
      if (sh) {
        const sw = (a, b) => { const o = g.order.slice(); [o[a], o[b]] = [o[b], o[a]]; return o; };
        const opts = [{ id: 'none', label: 'Leave the track as it is', order: g.order.slice() },
          { id: '01', label: 'Swap first and second: ' + sw(0, 1).map(D.issueName).join(' · '), order: sw(0, 1) },
          { id: '12', label: 'Swap second and third: ' + sw(1, 2).map(D.issueName).join(' · '), order: sw(1, 2) }];
        const id = yield* pick(sh, 'shift', 'Momentum: you have more media support (' + Math.max(mk, mn) + ' to ' + Math.min(mk, mn) + '). Shift two adjacent issues?', opts, { always: true, pub: 'shifting the issues' });
        if (id && id !== 'none') { g.order = opts.find(x => x.id === id).order; log({ t: 'shift', side: sh, order: g.order.slice() }); }
        else log({ t: 'shift', side: sh, order: null });
      } else log({ t: 'shift', side: null, media: [mk, mn] });
      /* 3. Awards: third place, second, then first. */
      for (const pos of [2, 1, 0]) {
        const i = g.order[pos];
        const L = issueLead(i);
        if (!L) { log({ t: 'award', pos, iss: i, side: null }); continue; }
        if (pos === 2) { log({ t: 'award', pos, iss: i, side: L, what: 'mom' }); addMom(L, 1, 'award'); continue; }
        let takeE = pos === 0;
        if (pos === 1) {
          const id = yield* pick(L, 'award', 'You lead ' + D.ISSUE[i].name + ', the second issue: take a momentum marker or an endorsement card?', [{ id: 'mom', label: '1 momentum marker' }, { id: 'end', label: '1 endorsement card' }], { always: true, pub: 'choosing an award' });
          takeE = id === 'end';
          if (!takeE) { log({ t: 'award', pos, iss: i, side: L, what: 'mom' }); addMom(L, 1, 'award'); continue; }
        }
        log({ t: 'award', pos, iss: i, side: L, what: pos === 0 ? 'both' : 'end' });
        if (pos === 0) addMom(L, 1, 'award');
        const e = endorseCard();
        if (!e) continue;
        let r = e.reg;
        if (!r) r = yield* pick(L, 'region', 'A Major Endorsement: put the marker in which region?', D.REGIONS.map(x => ({ id: x, label: D.REGION[x].name, sub: endorseSub(L, x) })), { always: true, pub: 'choosing a region' });
        g.edisc.push(e);
        placeEndorse(L, r, e.reg ? 'card' : 'major');
      }
      /* 4. Issue decay. */
      const dec = {};
      D.ISSUES.forEach(i => { if (g.iss[i]) { dec[i] = D.leadOf(g.iss[i]); g.iss[i] -= sgn(dec[i]); } });
      log({ t: 'issDecay', dec });
      yield* hold({ k: 'mom', turn: g.turn, from: start, to: g.log.length });
    }
    function* strategyPhase() {
      g.phase = 'strat';
      const need = R.strat(g.turn);
      const asks = [];
      const auto = {};
      for (const s of D.SIDES) {
        const valid = g.hand[s].filter(c => !D.CARD[c].noStrat);
        const k = Math.min(need, valid.length);
        if (!k) { auto[s] = []; continue; }
        if (valid.length === k) { auto[s] = valid.slice(); continue; }
        asks.push({ n: ++g.pn, seat: bySide(s).id, t: 'pick', what: 'strat', multi: true, min: k, max: k,
          why: 'Campaign Strategy: put ' + (k === 1 ? 'one card' : 'two cards') + ' face down for ' + (g.turn < R.debateTurn ? 'the Debates (high CP, your own icon, a mix of issues).' : 'Election Day (each is 3 support checks in the state on it).'),
          pub: 'choosing Campaign Strategy', options: valid.map(c => cardOpt(c)) });
      }
      let ans = {};
      if (asks.length) ans = yield { ask: asks, all: true };
      for (const s of D.SIDES) {
        const p = bySide(s);
        const ids = auto[s] || (ans[p.id] ? ans[p.id].ids.map(Number) : []);
        ids.forEach(c => { g.hand[s].splice(g.hand[s].indexOf(c), 1); g.strat[s].push(c); });
        const rest = g.hand[s].splice(0);
        rest.forEach(c => g.disc.push(c));
        log({ t: 'strat', side: s, n: ids.length, discarded: rest.length });
      }
      const rest = Object.assign({}, g.rest);
      g.bag.K += g.rest.K; g.bag.N += g.rest.N;
      g.rest = { K: 0, N: 0 };
      log({ t: 'rest', rest, bag: Object.assign({}, g.bag) });
    }
    function clearTurn() {
      if (g.fxCards.length) log({ t: 'fxEnd', n: g.fxCards.length });
      g.fx = {}; g.fxCards = []; g.seen = null;
    }

    /* ================================================================
       The Debates — turn 6
       ================================================================ */
    function debateTotals(i) {
      const b = g.debate.board[i];
      const harvard = g.board.debate.indexOf(35) >= 0 ? 1 : 0;
      return { K: b.K.reduce((t, c) => t + D.CARD[c].cp, 0) + harvard, N: b.N.reduce((t, c) => t + D.CARD[c].cp, 0), harvard };
    }
    g.debateTotals = i => g.debate ? debateTotals(i) : null;
    function* winIssue(i, end) {
      const d = g.debate;
      const t = debateTotals(i);
      const w = t.K > t.N ? 'K' : t.N > t.K ? 'N' : d.init;
      const k = d.won.length;
      const award = R.debateAward[k];
      d.won.push({ iss: i, side: w, K: t.K, N: t.N, tie: t.K === t.N, award, end: !!end });
      d.newOrder[2 - k] = i;
      log({ t: 'dwon', iss: i, side: w, K: t.K, N: t.N, tie: t.K === t.N, award, k: k + 1, end: !!end });
      yield* hold({ k: 'won', iss: i, side: w, K: t.K, N: t.N, tie: t.K === t.N, award, harvard: t.harvard, end: !!end });
      const m = yield* alloc(w, 'award', 'You won ' + D.ISSUE[i].name + ': place ' + award + ' state support anywhere — no support checks.', stateOpts(w, () => true, award, null), award, { must: true, pub: 'placing the debate award', auto: false });
      for (const st of Object.keys(m)) if (m[st] > 0) addSup(w, st, m[st], 'debate');
      D.SIDES.forEach(s => { d.board[i][s].forEach(c => g.disc.push(c)); d.board[i][s] = []; });
    }
    function* debates() {
      g.phase = 'debate';
      g.cur = null;
      const init = initiative('debates');
      yield* hold({ k: 'draw', why: 'Initiative for the Debates', init: true, rows: [{ st: null, cubes: init.cubes, got: null, winner: init.winner }] });
      g.initSide = init.winner;
      const d = g.debate = { init: init.winner, pos: g.order.slice(), board: {}, won: [], newOrder: [null, null, null], round: 0,
        hand: { K: g.strat.K.splice(0), N: g.strat.N.splice(0) }, shown: null, last: null };
      D.ISSUES.forEach(i => { d.board[i] = { K: [], N: [] }; });
      log({ t: 'debateStart', init: init.winner, order: d.pos.slice(), n: { K: d.hand.K.length, N: d.hand.N.length } });
      yield* hold({ k: 'debateStart', init: init.winner });
      const open = () => d.pos.filter(i => !d.won.some(w => w.iss === i));
      const lazy = g.board.debate.indexOf(34) >= 0;
      while (open().length && (d.hand.K.length || d.hand.N.length)) {
        d.round++;
        const picks = { K: null, N: null };
        const askOne = s => ({ n: ++g.pn, seat: bySide(s).id, t: 'pick', what: 'debate', why: 'Debate round ' + d.round + ': choose a card to play.', pub: 'choosing a debate card',
          options: d.hand[s].map(c => Object.assign(cardOpt(c), { sub: D.CARD[c].cp + ' CP · ' + D.ISSUE[D.CARD[c].iss].name + (open().indexOf(D.CARD[c].iss) < 0 ? ' (already won: it would be discarded)' : '') })), multi: false, min: 1, max: 1 });
        if (lazy && d.hand.N.length && d.hand.K.length) {
          const a = yield { ask: [askOne('N')], all: true };
          picks.N = +a[bySide('N').id].id;
          d.shown = picks.N;
          log({ t: 'dshow', side: 'N', card: picks.N });
          const b = yield { ask: [askOne('K')], all: true };
          picks.K = +b[bySide('K').id].id;
        } else {
          const who2 = D.SIDES.filter(s => d.hand[s].length);
          const asks = who2.map(askOne);
          const ans = yield { ask: asks, all: true };
          who2.forEach(s => { const x = ans[bySide(s).id]; picks[s] = x.id != null ? +x.id : null; });
        }
        d.shown = null;
        D.SIDES.forEach(s => { if (picks[s] != null) { d.hand[s].splice(d.hand[s].indexOf(picks[s]), 1); g.limbo.push(picks[s]); } });
        d.last = { K: picks.K, N: picks.N };
        log({ t: 'dreveal', round: d.round, K: picks.K, N: picks.N });
        yield* hold({ k: 'reveal', round: d.round, K: picks.K, N: picks.N });
        /* Placing: a card goes to the side its icon names; both icons, the
           player chooses (the initiative decides who places first). */
        let order = D.SIDES.filter(s => picks[s] != null);
        const both = order.filter(s => D.CARD[picks[s]].icon === 'B' && open().indexOf(D.CARD[picks[s]].iss) >= 0);
        if (both.length === 2) {
          const f = yield* pick(d.init, 'dfirst', 'Both debate cards show both candidates: who places first?', [{ id: d.init, label: 'I place first' }, { id: other(d.init), label: SN(other(d.init)) + ' places first' }], { always: true, pub: 'choosing who places first' });
          order = [f, other(f)];
        }
        for (const s of order) {
          const c = picks[s], i = D.CARD[c].iss;
          g.limbo.splice(g.limbo.indexOf(c), 1);
          if (open().indexOf(i) < 0) { g.disc.push(c); log({ t: 'dplace', side: s, card: c, iss: i, to: null }); continue; }
          g.limbo.push(c);
          let to = D.CARD[c].icon;
          if (to === 'B') to = yield* pick(s, 'dside', 'Place ' + D.CARD[c].name + ' (' + D.CARD[c].cp + ' CP) on which side of ' + D.ISSUE[i].name + '?', [{ id: s, label: 'My side' }, { id: other(s), label: SN(other(s)) + '’s side' }], { always: true, card: c, pub: 'choosing a side' });
          g.limbo.splice(g.limbo.indexOf(c), 1);
          d.board[i][to].push(c);
          log({ t: 'dplace', side: s, card: c, iss: i, to });
        }
        /* An issue with two cards on one side is won; two at once, the lower
           place first. */
        const now = d.pos.slice().reverse().filter(i => open().indexOf(i) >= 0 && (d.board[i].K.length >= 2 || d.board[i].N.length >= 2));
        for (const i of now) yield* winIssue(i, false);
      }
      for (const i of d.pos.slice().reverse()) if (open().indexOf(i) >= 0) yield* winIssue(i, true);
      D.SIDES.forEach(s => { d.hand[s].forEach(c => g.disc.push(c)); d.hand[s] = []; });
      g.order = d.newOrder.slice();
      g.board.debate.splice(0).forEach(c => g.gone.push(c));
      log({ t: 'debateEnd', order: g.order.slice(), won: clone(d.won) });
      yield* hold({ k: 'debateEnd' });
      g.debate = Object.assign(d, { over: true });
    }

    /* ================================================================
       Election Day — turn 9
       ================================================================ */
    function* electionDay() {
      g.phase = 'eday';
      g.cur = null;
      const ed = g.eday = { step: 'bonus', init: null, strat: { K: g.strat.K.slice(), N: g.strat.N.slice() }, done: [], tips: null };
      /* 1. Bonus cubes: media (counted twice: the bonus and the cubes), issue
         support, and two for every momentum marker. */
      const bonus = {};
      for (const s of D.SIDES) {
        const m = mediaTotal(s), i = issueTotal(s), mo = g.mom[s];
        bonus[s] = { media: m, issues: i, mom: mo, total: 2 * m + i + 2 * mo };
        g.bag[s] += bonus[s].total;
      }
      D.REGIONS.forEach(r => { g.media[r] = 0; });
      D.ISSUES.forEach(i => { g.iss[i] = 0; });
      g.mom.K = 0; g.mom.N = 0;
      ed.bonus = bonus;
      log({ t: 'bonus', bonus: clone(bonus), bag: Object.assign({}, g.bag) });
      /* 2. Initiative. */
      ed.step = 'init';
      const init = initiative('election');
      yield* hold({ k: 'draw', why: 'Initiative for Election Day', init: true, rows: [{ st: null, cubes: init.cubes, got: null, winner: init.winner }] });
      ed.init = init.winner;
      g.initSide = init.winner;
      g.noReseed = true;
      yield* hold({ k: 'edayStart', init: init.winner });
      /* 3. Campaign Strategy: three checks in each card's state. */
      ed.step = 'strat';
      for (const s of [init.winner, other(init.winner)]) {
        const cards = g.strat[s].slice();
        log({ t: 'edayCards', side: s, cards: cards.slice() });
        for (const c of cards) {
          const st = D.CARD[c].st;
          const r = checks(s, R.edayChecks);
          log({ t: 'checks', side: s, why: 'eday', card: c, rows: [{ st, k: R.edayChecks, got: r.got, cubes: r.cubes.map(x => x.c) }] });
          yield* hold({ k: 'draw', side: s, why: 'Election Day: ' + D.CARD[c].name, card: c, eday: true, rows: [{ st, k: R.edayChecks, cubes: clone(r.cubes), got: r.got }] });
          if (r.got) addSup(s, st, r.got, 'eday');
          g.strat[s].splice(g.strat[s].indexOf(c), 1);
          g.disc.push(c);
          ed.done.push(c);
        }
      }
      /* 4. Election Day events, in the order the initiative chooses. */
      ed.step = 'events';
      let evs = g.board.eday.filter(c => !D.CARD[c].eday.unpledged);
      while (evs.length) {
        let c = evs[0];
        if (evs.length > 1) c = +(yield* pick(init.winner, 'edayOrder', 'Election Day: which event is resolved next?', evs.map(x => cardOpt(x)), { always: true, pub: 'choosing the order of the events' }));
        evs = evs.filter(x => x !== c);
        const e = D.CARD[c].eday;
        let s = e.who === 'leadCT' ? lead('CT') : e.who;
        let st = e.st;
        if (!s) { log({ t: 'edayEvent', card: c, side: null }); yield* hold({ k: 'draw', why: D.CARD[c].name + ': nobody leads Connecticut', card: c, eday: true, rows: [] }); continue; }
        if (!st) st = yield* pick(s, 'recount', D.CARD[c].name + ': make 3 support checks in which state?', D.STATES.map(x => ({ id: x, label: D.STATE[x].name, sub: D.STATE[x].ev + ' votes · ' + supWords(x) })), { always: true, pub: 'choosing a state for the recount' });
        const r = checks(s, e.n);
        log({ t: 'checks', side: s, why: 'edayEvent', card: c, rows: [{ st, k: e.n, got: r.got, cubes: r.cubes.map(x => x.c) }] });
        yield* hold({ k: 'draw', side: s, why: D.CARD[c].name, card: c, eday: true, rows: [{ st, k: e.n, cubes: clone(r.cubes), got: r.got }] });
        if (r.got) addSup(s, st, r.got, 'eday');
      }
      /* 5. Endorsements and undecided voters. */
      ed.step = 'tips';
      const tips = [];
      D.STATES.forEach(st => {
        if (g.sup[st] !== 0) return;
        const e = D.leadOf(g.end[regOf(st)]);
        const s = e || D.STATE[st].edge;
        tips.push({ st, side: s, why: e ? 'endorse' : 'edge' });
      });
      ed.tips = tips;
      log({ t: 'tips', tips: clone(tips) });
      yield* hold({ k: 'tips', tips: clone(tips) });
      tips.forEach(x => { g.sup[x.st] += sgn(x.side); });
      /* 6. The tally. */
      ed.step = 'tally';
      tally();
    }
    function supWords(st) { const v = g.sup[st]; return v === 0 ? 'empty' : SN(D.leadOf(v)) + ' ' + Math.abs(v); }
    function tally() {
      const unp = g.board.eday.indexOf(33) >= 0;
      const ev = { K: 0, N: 0 }, states = { K: 0, N: 0 }, cubes = { K: 0, N: 0 };
      const byReg = { K: {}, N: {} };
      D.REGIONS.forEach(r => { byReg.K[r] = 0; byReg.N[r] = 0; });
      const lost = [];
      const won = {};
      D.STATES.forEach(st => {
        const s = lead(st);
        if (!s) return;
        cubes[s] += Math.abs(g.sup[st]);
        if (unp && s === 'K' && ['AL', 'LA', 'MS'].indexOf(st) >= 0 && Math.abs(g.sup[st]) < R.carry) { lost.push(st); won[st] = null; return; }
        won[st] = s;
        ev[s] += D.STATE[st].ev; states[s]++; byReg[s][regOf(st)] += D.STATE[st].ev;
      });
      let winner, how;
      if (ev.K !== ev.N) { winner = ev.K > ev.N ? 'K' : 'N'; how = 'ev'; }
      else if (states.K !== states.N) { winner = states.K > states.N ? 'K' : 'N'; how = 'states'; }
      else if (cubes.K !== cubes.N) { winner = cubes.K > cubes.N ? 'K' : 'N'; how = 'cubes'; }
      else { winner = null; how = 'tie'; }
      finish(winner, how, { ev, states, cubes, byReg, unpledged: lost, won });
    }
    function finish(winner, how, t) {
      g.phase = 'over';
      g.prompts = []; g.hold = null;
      const rows = g.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, side: p.side,
        ev: t.ev[p.side], states: t.states[p.side], cubes: t.cubes[p.side], byReg: t.byReg[p.side], won: p.side === winner }));
      const w = winner ? bySide(winner) : null;
      g.result = { winner: w ? w.id : null, side: winner, name: w ? w.name : null, how, rows, unpledged: t.unpledged, won: t.won, ev: t.ev };
      log({ t: 'over', side: winner, how, ev: t.ev });
      throw OVER;
    }

    /* ================================================================
       The game
       ================================================================ */
    g.main = function* () {
      g.deck = shuffle(D.CARDS.map(c => c.id), rand);
      g.edeck = shuffle(D.ENDORSE.map(e => Object.assign({}, e)), rand);
      log({ t: 'setup' });
      for (let t = 1; t <= R.turns; t++) {
        g.turn = t; g.ap = 0; g.cur = null; g.first = null;
        if (t === R.debateTurn) { yield* debates(); continue; }
        if (t === R.electionTurn) { yield* electionDay(); return; }
        g.phase = 'deal';
        const n = R.hand(t);
        for (let j = 0; j < n; j++) for (const s of D.SIDES) drawTo(s, 1, null);
        log({ t: 'deal', n, got: { K: g.hand.K.length, N: g.hand.N.length } });
        /* How to play: the five first lessons, with the hand already dealt
           (the phones show it under the card) and before the first question. */
        if (g.opts.teach && t === 1) for (let k = 0; k < LESSONS_FIRST.length; k++) yield* hold({ k: 'lesson', id: LESSONS_FIRST[k], i: k + 1, of: LESSONS_FIRST.length });
        const init = initiative('turn');
        yield* hold({ k: 'draw', why: 'Initiative for turn ' + t, init: true, rows: [{ st: null, cubes: init.cubes, got: null, winner: init.winner }] });
        g.initSide = init.winner;
        const f = yield* pick(init.winner, 'first', 'You have the initiative for turn ' + t + ': who plays first in every activity phase?',
          [{ id: init.winner, label: 'I play first' }, { id: other(init.winner), label: SN(other(init.winner)) + ' plays first' }], { always: true, pub: 'choosing who plays first' });
        g.first = f;
        log({ t: 'first', side: init.winner, first: f });
        yield* hold({ k: 'turnStart', turn: t, init: init.winner, first: f });
        g.phase = 'act';
        for (let ap = 1; ap <= R.phases; ap++) {
          g.ap = ap;
          log({ t: 'ap', ap });
          for (const s of [f, other(f)]) yield* activity(s);
        }
        g.ap = 0; g.cur = null;
        if (g.opts.teach && t === 1) yield* hold({ k: 'lesson', id: 'momentum' });
        yield* momentumPhase();
        if (g.opts.teach && (t === 1 || t === R.debateTurn + 1)) yield* hold({ k: 'lesson', id: t === 1 ? 'strategy' : 'eday' });
        yield* strategyPhase();
        clearTurn();
      }
    };

    /* ================================================================
       The driver
       ================================================================ */
    g.advance = function (v) {
      for (;;) {
        let r;
        try { r = g.gen.next(v); }
        catch (e) { if (e === OVER) { g.prompts = []; g.hold = null; return; } throw e; }
        v = undefined;
        if (r.done) return;
        const q = r.value;
        if (q.hold) {
          if (!g.opts.show) continue;
          g.hold = Object.assign({ n: ++g.holdN, table: !!TABLE_HOLDS[q.hold.k] }, q.hold);
          return;
        }
        if (q.ask) { g.prompts = q.ask; g.waitAll = !!q.all; g.answers = {}; return; }
      }
    };
    g.release = function (n) {
      if (!g.hold || (n != null && g.hold.n !== n)) return false;
      g.hold = null;
      g.advance();
      return true;
    };
    function checkPick(pr, a) {
      if (a.t === 'skip') return pr.skip ? yes({ a: { t: 'skip' } }) : no('You have to choose.');
      if (a.t !== 'pick') return no('Answer the question on your screen first.');
      if (pr.multi) {
        const ids = Array.isArray(a.ids) ? a.ids.map(String) : [];
        if (ids.length < pr.min || ids.length > pr.max) return no(pr.min === pr.max ? 'Choose ' + pr.min + '.' : 'Choose between ' + pr.min + ' and ' + pr.max + '.');
        if (new Set(ids).size !== ids.length) return no('Choose each only once.');
        for (const id of ids) { const o = pr.options.find(x => x.id === id); if (!o || o.bad) return no('That is not one of the choices.'); }
        return yes({ a: { t: 'pick', ids } });
      }
      const o = pr.options.find(x => x.id === String(a.id));
      if (!o) return no('That is not one of the choices.');
      if (o.bad) return no(o.bad);
      return yes({ a: { t: 'pick', id: o.id } });
    }
    function checkAlloc(pr, a) {
      if (a.t !== 'alloc' || !a.map || typeof a.map !== 'object') return no('Share them out first.');
      const m = {};
      let tot = 0;
      for (const k of Object.keys(a.map)) {
        const v = a.map[k] | 0;
        if (v < 0) return no('Not below zero.');
        if (!v) continue;
        const o = pr.options.find(x => x.id === k);
        if (!o) return no('That is not one of the choices.');
        if (o.bad) return no(o.bad);
        if (pr.what !== 'pos' && v > o.cap) return no('At most ' + o.cap + ' in ' + o.label + '.');
        m[k] = v; tot += v;
      }
      if (pr.what === 'pos') {
        const cost = g.posCost(m);
        if (cost > pr.budget) return no('That costs ' + cost + ' CP; you have ' + pr.budget + '.');
        return yes({ a: { t: 'alloc', map: m } });
      }
      if (tot > pr.total) return no('At most ' + pr.total + ' in all.');
      if (tot < pr.min) return no(pr.min === pr.total ? 'Place all ' + pr.total + '.' : 'Place at least ' + pr.min + '.');
      return yes({ a: { t: 'alloc', map: m } });
    }
    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The election is over.');
      if (g.hold) return no('Watch the telly first.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const mine = g.prompts.filter(pr => pr.seat === seatId);
      if (!mine.length) return no('It is not your turn.');
      const pr = a.n != null ? mine.find(x => x.n === +a.n) : (mine.length === 1 ? mine[0] : null);
      if (!pr) return no('That question has moved on.');
      let r;
      if (pr.t === 'turn') r = turnCheck(p.side, a);
      else if (pr.t === 'alloc') r = checkAlloc(pr, a);
      else if (pr.t === 'camp') {
        const o = pr.options.find(x => x.id === String(a.id));
        r = a.t !== 'pick' ? no('Choose where to campaign.') : !o ? no('That is not one of the choices.') : o.bad ? no(o.bad) : yes({ a: { t: 'pick', id: o.id } });
      } else r = checkPick(pr, a);
      if (!r.ok) return r;
      const clean = r.a;
      g.prompts = g.prompts.filter(x => x !== pr);
      g.actN++;
      if (g.waitAll) {
        g.answers[seatId] = clean;
        if (g.prompts.length) return yes();
        g.advance(g.answers);
      } else g.advance(clean);
      return yes();
    };

    /* ================================================================
       The views
       ================================================================ */
    g.publicView = function () {
      const d = g.debate;
      return {
        v: VERSION, phase: g.phase, turn: g.turn, ap: g.ap, cur: g.cur, first: g.first, initSide: g.initSide, teach: g.opts.teach,
        active: g.activeId(), restricted: g.opts.restricted,
        sup: Object.assign({}, g.sup), media: Object.assign({}, g.media), end: Object.assign({}, g.end), iss: Object.assign({}, g.iss),
        order: g.order.slice(), tok: Object.assign({}, g.tok), mom: Object.assign({}, g.mom), bag: Object.assign({}, g.bag),
        rest: Object.assign({}, g.rest), cand: Object.assign({}, g.cand),
        handN: { K: g.hand.K.length, N: g.hand.N.length }, stratN: { K: g.strat.K.length, N: g.strat.N.length },
        deckN: g.deck.length, disc: g.disc.slice(), goneN: g.gone.length, board: clone(g.board), edeckN: g.edeck.length,
        fx: clone(g.fx), fxCards: clone(g.fxCards), seenBy: g.seen ? g.seen.side : null,
        debate: d ? { init: d.init, pos: d.pos.slice(), round: d.round, board: clone(d.board), won: clone(d.won), newOrder: d.newOrder.slice(),
          handN: { K: d.hand.K.length, N: d.hand.N.length }, shown: d.shown, last: d.last ? clone(d.last) : null, over: !!d.over,
          totals: D.ISSUES.reduce((o, i) => { o[i] = debateTotals(i); return o; }, {}) } : null,
        eday: g.eday ? { step: g.eday.step, init: g.eday.init, bonus: clone(g.eday.bonus || null), done: g.eday.done.slice(), tips: g.eday.tips ? clone(g.eday.tips) : null,
          left: { K: g.strat.K.length, N: g.strat.N.length } } : null,
        players: g.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, side: p.side })),
        prompts: g.prompts.map(pr => ({ n: pr.n, seat: pr.seat, t: pr.t, what: pr.what || null, why: pr.pub || pr.why })),
        hold: g.hold ? clone(g.hold) : null,
        log: g.log.slice(-90).map(e => Object.assign({}, e)),
        logN: g.log.length,
        result: g.result
      };
    };
    g.seatView = function (id) {
      const p = P(id);
      if (!p) return null;
      const s = p.side;
      const prompts = g.prompts.filter(pr => pr.seat === id).map(pr => clone(pr));
      const turnPr = g.prompts.find(pr => pr.seat === id && pr.t === 'turn');
      return { id, side: s, v: VERSION, hand: g.hand[s].slice(), strat: g.strat[s].slice(),
        debateHand: g.debate && !g.debate.over ? g.debate.hand[s].slice() : null,
        seen: g.seen && g.seen.side === s ? clone(g.seen) : null, prompts,
        can: turnPr && !g.hold ? Object.assign({ n: turnPr.n }, menu(s)) : null };
    };
    /* For the tests: every campaign card is somewhere, exactly once. */
    g.census = function () {
      const seen = {};
      const note = (c, w) => { (seen[c] = seen[c] || []).push(w); };
      D.SIDES.forEach(s => { g.hand[s].forEach(c => note(c, s + ':hand')); g.strat[s].forEach(c => note(c, s + ':strat')); });
      if (g.debate && !g.debate.over) D.SIDES.forEach(s => { g.debate.hand[s].forEach(c => note(c, s + ':dhand')); D.ISSUES.forEach(i => g.debate.board[i][s].forEach(c => note(c, 'debate:' + i))); });
      g.deck.forEach(c => note(c, 'deck'));
      g.disc.forEach(c => note(c, 'disc'));
      g.gone.forEach(c => note(c, 'gone'));
      Object.keys(g.board).forEach(k => g.board[k].forEach(c => note(c, 'board:' + k)));
      g.limbo.forEach(c => note(c, 'limbo'));
      return seen;
    };
    g.X = { menu, cpFor, needsCheck, campBlocked, keepsStrategy, mediaTotal, issueTotal, prevented, canSpend };
  }

  const Engine = { VERSION, LEVELS, TABLE_HOLDS, LESSONS_FIRST, create, rngFrom, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.M60Engine = Engine;
})(typeof window !== 'undefined' ? window : this);
