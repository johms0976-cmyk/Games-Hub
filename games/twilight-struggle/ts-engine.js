'use strict';
/* Twilight Struggle — the rules. No DOM, no timers, one seeded rng.
 *
 * The display holds the one Game; every order (a phone, a house player, a
 * test) goes through `g.act(seatId, answer)`, which refuses with a reason.
 *
 * **The game is one generator** (the Radlands / 1960 pattern). `main()` sets
 * up, then runs ten turns: DEFCON improves, the hands are dealt, the headline,
 * six or seven action rounds, the end of the turn; then final scoring. Every
 * card's event is a generator step in EV below; a question is `yield {ask}`:
 *
 *   g.prompts   the questions open now: the phasing player's card, a choice
 *               inside an event, or both players at once (the headline).
 *   g.hold      decide, hold, show, then apply: every die (coups, realignment,
 *               wars, the space race), the headline reveal, each scoring card,
 *               the card that opens and the card that closes each turn. Only
 *               when a telly shows the game (`opts.show`); a test proves seeded
 *               games end the same with it on and off.
 *
 * Generators cannot be copied, so undo is by replay, never by snapshot.
 *
 * **What is secret:** each hand; the deck's order; a headline card until both
 * are shown; a die until it lands (the telly holds it back); a card Grain Sales
 * draws until the USA plays it. A hand shown by CIA Created, Lone Gunman or
 * Aldrich Ames goes to the other side's phone only. Influence, DEFCON, VP,
 * military ops, the space race, the China Card, the discards and every hand's
 * size are public.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./ts-data.js') : root.TSData;

  const VERSION = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const OVER = { over: true };
  const TABLE_HOLDS = { turnStart: 1, score: 1, turnEnd: 1, final: 1, lesson: 1 };
  /* How to play (opts.teach): the lessons in the order a first game meets
     them (ARCHITECTURE.md, "What a newcomer meets, ranked"). Each is a table
     hold raised the first time its rule is about to bite, once a game; holds
     change nothing, so a taught game ends as an untaught one would. */
  const LESSONS = ['welcome', 'control', 'cards', 'headline', 'ops', 'trigger', 'coup', 'defcon', 'realign', 'space', 'china', 'scoring', 'milops', 'done', 'midwar'];
  /* The tutorial is the Early War; after turn 3 the room may play on. */
  const TEACH_TURNS = 3;
  const R = D.RULES;
  const C = D.COUNTRY;
  const other = D.other;
  const sgn = D.sgn;
  const SN = s => D.SIDE[s].name;
  const CN = c => C[c].name;
  const CHINA = D.CHINA;

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

  /* ================================================================
     Building a game
     opts.players: [{ id, name, hex, bot, level, side }] — two, one a side.
     opts.optional: the seven optional cards (104-110) go into the decks.
     ================================================================ */
  function create(opts) {
    opts = opts || {};
    const list = opts.players || [];
    if (list.length !== 2) throw new Error('Twilight Struggle is for two players');
    const seed = opts.seed == null ? Date.now() : opts.seed;
    const g = {
      VERSION, seed, rng: rngFrom(seed), rngN: 0, drawN: 0,
      opts: { show: !!opts.show, optional: !!opts.optional, teach: !!opts.teach }, taught: {},
      phase: 'setup', turn: 0, ar: 0, cur: null, phasing: null,
      inf: {}, defcon: R.defconStart, vp: 0, mil: { US: 0, SU: 0 }, space: { US: 0, SU: 0 }, spaceN: { US: 0, SU: 0 },
      hand: { US: [], SU: [] }, deck: [], disc: [], gone: [], later: { M: [], L: [] }, table: [], limbo: [], aside: [],
      china: 'SU', chinaUp: true, fx: {}, tfx: {}, head: null, finalScoring: false,
      log: [], prompts: [], pn: 0, waitAll: false, answers: {},
      hold: null, holdN: 0, actN: 0, result: null
    };
    D.COUNTRIES.forEach(c => { g.inf[c] = { US: 0, SU: 0 }; });
    const sides = list.map(x => x.side);
    if (sides.indexOf('US') < 0 || sides.indexOf('SU') < 0) list.forEach((x, i) => { x.side = i ? 'US' : 'SU'; });
    /* The USSR is always players[0]: it moves first in every action round. */
    g.players = ['SU', 'US'].map(side => {
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
    const log = e => { g.log.push(Object.assign({ tn: g.turn, ar: g.ar }, e)); return e; };
    const inf = (c, s) => g.inf[c][s];
    const ctrl = c => D.ctrl(g.inf, c);

    g.seat = P;
    g.bySide = bySide;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.activeId = () => (g.phase === 'ar' && g.cur ? bySide(g.cur).id : null);
    g.note = e => log(e);

    /* ================================================================
       The board
       ================================================================ */
    function addInf(s, c, n, via) {
      if (!n) return 0;
      g.inf[c][s] += n;
      log({ t: 'inf', side: s, c, n, to: Object.assign({}, g.inf[c]), via: via || null });
      return n;
    }
    function remInf(s, c, n, via) {
      const k = Math.min(n, g.inf[c][s]);
      if (k <= 0) return 0;
      g.inf[c][s] -= k;
      log({ t: 'inf', side: s, c, n: -k, to: Object.assign({}, g.inf[c]), via: via || null });
      return k;
    }
    /* Enough influence to control it (and no more). */
    function toControl(s, c, via) {
      const need = C[c].stab + inf(c, other(s)) - inf(c, s);
      if (need > 0) addInf(s, c, need, via);
    }
    function addVP(s, n, why) {
      if (!n) return;
      g.vp += sgn(s) * n;
      log({ t: 'vp', side: s, n, vp: g.vp, why: why || null });
      if (!g.finalScoring) {
        if (g.vp >= R.vpWin) finish('US', 'vp');
        if (g.vp <= -R.vpWin) finish('SU', 'vp');
      }
    }
    function addMil(s, n, why) {
      if (!n) return;
      g.mil[s] += n;
      log({ t: 'mil', side: s, n, to: g.mil[s], why: why || null });
    }
    /* DEFCON moves. Falling to 1 loses the game for the player whose turn it
       is (the headline's owner during the headline). NORAD fires on a fall to
       2 during the action rounds. */
    function* defconMove(n, why) {
      const before = g.defcon;
      g.defcon = Math.max(1, Math.min(5, before + n));
      if (g.defcon === before) return;
      log({ t: 'defcon', from: before, to: g.defcon, why: why || null });
      if (g.defcon === 1) finish(other(g.phasing || 'SU'), 'defcon', { by: g.phasing });
      /* A fall is shown before play goes on (the bunker panel on the telly);
         a fall to 1 is the finale's. */
      if (g.defcon < before) yield* lesson('defcon');
      if (g.defcon < before) yield* hold({ k: 'defcon', from: before, to: g.defcon, why: why || null, side: g.phasing || null });
      if (g.defcon === 2 && before > 2 && g.phase === 'ar' && g.fx.norad && ctrl('Canada') === 'US') {
        const opts = D.COUNTRIES.filter(c => inf(c, 'US') > 0).map(c => cOpt(c));
        const c = yield* pick('US', 'norad', 'NORAD: DEFCON is at 2 — add 1 influence where you already have some.', opts, { pub: 'NORAD: adding 1 influence', card: 106 });
        if (c) addInf('US', c, 1, 'NORAD');
      }
    }
    function* defconSet(v, why) { yield* defconMove(v - g.defcon, why); }

    /* ================================================================
       Cards
       ================================================================ */
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
    /* Where a resolved card goes: removed if its starred event happened, the
       discards otherwise. */
    function settle(id, evented) {
      const i = g.limbo.indexOf(id);
      if (i >= 0) g.limbo.splice(i, 1);
      if (id === CHINA) return;
      if (evented && D.CARD[id].star) { g.gone.push(id); log({ t: 'gone', card: id }); }
      else g.disc.push(id);
    }
    /* Missile Envy goes to the other hand and Shuttle Diplomacy onto the table
       when their events happen; everything else settles. */
    function place(id, ok) {
      if (id === 49 && g.envyDest) { g.envyDest = false; return; }
      if (id === 73 && g.shuttleDest) {
        g.shuttleDest = false;
        const i = g.limbo.indexOf(73); if (i >= 0) g.limbo.splice(i, 1);
        g.table.push(73);
        return;
      }
      settle(id, ok);
    }
    function fromHand(s, id) {
      const i = g.hand[s].indexOf(id);
      if (i >= 0) g.hand[s].splice(i, 1);
      g.limbo.push(id);
    }
    /* A card's Ops when `s` plays it: Containment and Brezhnev +1 (to 4), Red
       Scare/Purge -1 (to 1). Scoring cards have none. */
    function opsVal(s, base) {
      if (!base) return 0;
      let v = base;
      if ((s === 'US' && g.tfx.containment) || (s === 'SU' && g.tfx.brezhnev)) v = Math.min(4, v + 1);
      if (g.tfx.redScare && g.tfx.redScare === other(s)) v = Math.max(1, v - 1);
      return v;
    }
    const opsOf = (s, id) => (id === CHINA ? opsVal(s, 4) : opsVal(s, D.CARD[id].ops));
    g.opsOf = opsOf;
    /* The regional bonuses a card's Ops get when they are all spent in one
       area. */
    function bonusOf(s, id) {
      const b = [];
      if (id === CHINA) b.push({ n: 1, where: 'AS' });
      if (s === 'SU' && g.tfx.vietnam) b.push({ n: 1, where: 'SEA' });
      return b;
    }

    /* ================================================================
       Asking
       ================================================================ */
    function* ask(side, pr) {
      pr = Object.assign({}, pr, { n: ++g.pn, seat: bySide(side).id, t: pr.t || 'pick' });
      return yield { ask: [pr] };
    }
    /* A pick. One legal answer answers itself (unless `always`); none is not
       asked. */
    function* pick(side, what, why, options, o) {
      o = o || {};
      const legal = options.filter(x => !x.bad);
      if (!o.multi) {
        if (!legal.length && !o.skip) return null;
        if (legal.length === 1 && !o.skip && !o.always) return legal[0].id;
        if (!legal.length && o.skip && !o.always) return null;
      } else if (!legal.length && !o.always) return [];
      const a = yield* ask(side, { t: 'pick', what, why, pub: o.pub || null, options, multi: !!o.multi, card: o.card || null,
        min: o.multi ? Math.min(o.min || 0, legal.length) : 1, max: o.multi ? Math.min(o.max == null ? legal.length : o.max, legal.length) : 1,
        skip: o.skip || null, secret: !!o.secret, act: o.act || null, who: o.who || null });
      if (a.t === 'skip') return o.multi ? [] : null;
      return o.multi ? a.ids.slice() : a.id;
    }
    /* Share `total` among options, at most each option's cap. Answers itself
       when every option fills exactly. */
    function* alloc(side, what, why, options, total, o) {
      o = o || {};
      const opts = options.filter(x => x.cap > 0);
      if (!opts.length || total <= 0) return {};
      const room = opts.reduce((t, x) => t + x.cap, 0);
      const min = o.must ? Math.min(total, room) : (o.min || 0);
      if (room <= total && o.must) {
        const m = {};
        opts.forEach(x => { m[x.id] = x.cap; });
        return m;
      }
      const a = yield* ask(side, { t: 'alloc', what, why, pub: o.pub || null, options: opts, total: Math.min(total, room), min, card: o.card || null,
        act: o.act || 'add', who: o.who || side });
      return a.map || {};
    }
    function* hold(h) { yield { hold: h }; }
    /* A lesson, once a game, only when teaching. */
    function* lesson(id) {
      if (!g.opts.teach || g.taught[id]) return;
      g.taught[id] = 1;
      yield* hold({ k: 'lesson', id, i: LESSONS.indexOf(id) + 1, side: g.phasing || null });
    }
    function* die(why, side, extra) {
      const r = 1 + Math.floor(rand() * 6);
      yield* hold(Object.assign({ k: 'die', why, side, rolls: [{ side, r }] }, extra || {}));
      return r;
    }
    function cOpt(c, extra) {
      return Object.assign({ id: c, c, label: CN(c), us: inf(c, 'US'), su: inf(c, 'SU'), stab: C[c].stab, bg: C[c].bg, reg: C[c].reg }, extra || {});
    }

    /* ================================================================
       Influence, coups, realignment
       ================================================================ */
    /* Where `s` may place influence with Ops: where it has some, or next to
       somewhere it has some, or next to its own superpower — fixed at the
       start of the placement. */
    function placeable(s) {
      return D.COUNTRIES.filter(c => {
        if (s === 'SU' && g.tfx.chernobyl && C[c].reg === g.tfx.chernobyl) return false;
        if (inf(c, s) > 0 || C[c].sup === s) return true;
        return C[c].adj.some(a => inf(a, s) > 0);
      });
    }
    g.placeable = placeable;
    function* placeOps(s, ops, bonus, card) {
      const list = placeable(s);
      if (!list.length) { log({ t: 'noop', side: s, why: 'nowhere to place' }); return; }
      const a = yield* ask(s, { t: 'alloc', what: 'inf', why: 'Place influence: ' + ops + ' Ops' + (bonus.length ? ' (' + bonus.map(b => '+' + b.n + ' if all in ' + (b.where === 'AS' ? 'Asia' : D.SUBS[b.where])).join(', ') + ')' : '') + '. A country the other side controls costs 2 a point.',
        pub: 'placing influence', options: list.map(c => cOpt(c, { cap: 99 })), budget: ops, bonus, total: ops + bonus.reduce((t, b) => t + b.n, 0), min: 0, card, act: 'add', who: s });
      const m = a.map || {};
      const where = Object.keys(m).filter(c => m[c] > 0);
      log({ t: 'place', side: s, map: Object.assign({}, m), ops });
      for (const c of where) addInf(s, c, m[c], 'ops');
    }
    /* Countries `s` may coup or realign in: the other side has influence there,
       and DEFCON, NATO, the US/Japan pact and The Reformer allow it. A free
       coup from an event ignores the DEFCON map. */
    function coupable(s, o) {
      o = o || {};
      const opp = other(s);
      return D.COUNTRIES.filter(c => {
        if (inf(c, opp) <= 0) return false;
        if (!o.free && D.defconBans(g.defcon, C[c].reg)) return false;
        if (s === 'SU' && protectedFromSU(c)) return false;
        if (o.coup && s === 'SU' && g.fx.reformer && C[c].reg === 'EU') return false;
        if (o.where && !o.where(c)) return false;
        return true;
      });
    }
    function protectedFromSU(c) {
      if (c === 'Japan' && g.fx.japan) return true;
      if (g.fx.nato && C[c].reg === 'EU' && ctrl(c) === 'US') {
        if (c === 'France' && g.fx.deGaulle) return false;
        if (c === 'WGermany' && g.fx.brandt) return false;
        return true;
      }
      return false;
    }
    g.coupable = (s, o) => coupable(s, Object.assign({ coup: true }, o || {}));
    g.realignable = (s, o) => coupable(s, o);
    function coupMod(s, c) {
      let m = 0;
      if (g.tfx.salt) m -= 1;
      if (g.tfx.squads && (C[c].reg === 'CA' || C[c].reg === 'SA')) m += g.tfx.squads === s ? 1 : -1;
      return m;
    }
    g.coupMod = coupMod;
    /* A coup: d6 + Ops - twice the stability. Above zero removes the other
       side's influence, any extra becomes yours. A battleground lowers
       DEFCON; Ops count as military operations unless the coup is free. */
    function* coup(s, ops, card, o) {
      o = o || {};
      const list = coupable(s, Object.assign({ coup: true }, o));
      if (!list.length) { log({ t: 'noop', side: s, why: 'no coup target' }); return null; }
      const opts = list.map(c => {
        const need = 2 * C[c].stab - (ops + D.bonusFor(o.bonus || [], [c])) - coupMod(s, c) + 1;
        const bgDanger = C[c].bg && g.defcon === 2 && !(s === 'US' && g.tfx.subs);
        return cOpt(c, { need: Math.max(1, need), sure: need <= 1, never: need > 6, warn: bgDanger ? 'DEFCON would fall to 1: you lose' : (g.tfx.cmc === other(s) ? 'The Cuban Missile Crisis: a coup loses the game' : null) });
      });
      const c = yield* pick(s, 'coup', o.why || ('Coup with ' + ops + ' Ops: choose the target.'), opts, { pub: 'choosing a coup target', card, always: true, skip: o.optional ? 'No coup' : null });
      if (!c) return null;
      return yield* coupAt(s, c, ops + D.bonusFor(o.bonus || [], [c]), card, o);
    }
    function* coupAt(s, c, ops, card, o) {
      o = o || {};
      const opp = other(s);
      yield* lesson('coup');
      log({ t: 'coup', side: s, c, ops, free: !!o.free, card: card || null });
      if (g.tfx.cmc === opp) finish(opp, 'cmc', { by: s, c });
      if (s === 'US' && g.tfx.yuri) addVP('SU', 1, 'Yuri and Samantha');
      const mod = coupMod(s, c);
      const r = 1 + Math.floor(rand() * 6);
      const net = r + ops + mod - 2 * C[c].stab;
      yield* hold({ k: 'die', what: 'coup', why: SN(s) + ' coup in ' + CN(c), side: s, c, rolls: [{ side: s, r }], ops, mod, stab: C[c].stab, net, card: card || null, free: !!o.free });
      let removed = 0, added = 0;
      if (net > 0) {
        removed = remInf(opp, c, net, 'coup');
        added = addInf(s, c, net - removed, 'coup');
      }
      log({ t: 'couped', side: s, c, r, ops, mod, net, removed, added });
      if (!o.free) addMil(s, ops, 'coup');
      if (C[c].bg && !(s === 'US' && g.tfx.subs)) yield* defconMove(-1, 'coup in ' + CN(c));
      return { c, net, removed, added };
    }
    function realignMods(s, c) {
      let m = 0;
      m += C[c].adj.filter(a => ctrl(a) === s).length;
      if (inf(c, s) > inf(c, other(s))) m += 1;
      if (C[c].sup === s) m += 1;
      if (s === 'US' && g.tfx.contra) m -= 1;
      return m;
    }
    g.realignMods = realignMods;
    /* Realignment: one roll an Op. Both roll with their modifiers; the higher
       removes the difference from the lower's influence. */
    function* realign(s, ops, card, o) {
      o = o || {};
      const bonus = o.bonus || [];
      const done = [];
      for (;;) {
        const list = coupable(s, o).filter(c => done.length + 1 <= ops + D.bonusFor(bonus, done.concat([c])));
        if (!list.length) break;
        const opts = list.map(c => cOpt(c, { mine: realignMods(s, c), theirs: realignMods(other(s), c) }));
        const c = yield* pick(s, 'realign', 'Realignment roll ' + (done.length + 1) + ': choose a country' + (done.length ? ', or stop.' : '.'),
          opts, { pub: 'realigning', card, always: true, skip: done.length || o.optional ? 'Stop realigning' : null });
        if (!c) break;
        done.push(c);
        const opp = other(s);
        const ms = realignMods(s, c), mo = realignMods(opp, c);
        yield* lesson('realign');
        const rs = 1 + Math.floor(rand() * 6), ro = 1 + Math.floor(rand() * 6);
        yield* hold({ k: 'die', what: 'realign', why: SN(s) + ' realigns ' + CN(c), side: s, c, rolls: [{ side: s, r: rs, mod: ms }, { side: opp, r: ro, mod: mo }] });
        const a = rs + ms, b = ro + mo;
        let removed = 0, lost = 0;
        if (a > b) removed = remInf(opp, c, a - b, 'realign');
        else if (b > a) lost = remInf(s, c, b - a, 'realign');
        log({ t: 'realigned', side: s, c, rs, ro, ms, mo, removed, lost });
      }
    }
    /* Spend `ops` on one of influence, a coup or realignment. */
    function* spendOps(s, ops, card, o) {
      o = o || {};
      const bonus = o.bonus || [];
      const modes = [
        { id: 'inf', label: 'Place influence', bad: o.noInf ? 'Not with this event' : (placeable(s).length ? null : 'Nowhere to place') },
        { id: 'coup', label: 'Coup', bad: o.noCoup ? 'Not with this event' : (coupable(s, { coup: true }).length ? null : 'No country to coup') },
        { id: 'realign', label: 'Realignment', bad: coupable(s).length ? null : 'No country to realign' }
      ];
      if (!o.mode && !modes.some(x => !x.bad)) { log({ t: 'noop', side: s, why: 'nothing to spend Ops on' }); return; }
      const m = o.mode || (yield* pick(s, 'mode', (o.why || 'Spend ' + ops + ' Ops') + ': how?', modes, { pub: 'choosing how to spend ' + ops + ' Ops', card, always: true }));
      if (m === 'inf') yield* placeOps(s, ops, bonus, card);
      else if (m === 'coup') yield* coup(s, ops, card, { bonus });
      else if (m === 'realign') yield* realign(s, ops, card, { bonus });
    }

    /* ================================================================
       The space race
       ================================================================ */
    const SP = D.SPACE;
    function spaceTries(s) {
      return (g.space[s] >= 2 && g.space[other(s)] < 2) ? 2 : 1;
    }
    function canSpace(s, ops) {
      const at = g.space[s];
      if (at >= 8) return 'The space race is won';
      if (g.spaceN[s] >= spaceTries(s)) return 'Once a turn' + (spaceTries(s) > 1 ? ' (twice with Animal in Space)' : '');
      if (ops < SP[at + 1].ops) return SP[at + 1].name + ' needs ' + SP[at + 1].ops + ' Ops';
      return null;
    }
    g.canSpace = canSpace;
    const hasAdv = (s, box) => g.space[s] >= box && g.space[other(s)] < box;
    g.hasAdv = hasAdv;
    function advance(s, k, why) {
      let last = null;
      for (let j = 0; j < k && g.space[s] < 8; j++) { g.space[s]++; last = g.space[s]; }
      if (!last) return;
      const first = g.space[other(s)] < last;
      const vp = SP[last].vp[first ? 0 : 1];
      log({ t: 'space', side: s, box: last, name: SP[last].name, first, vp, why: why || null });
      addVP(s, vp, SP[last].name);
    }
    function* spaceRace(s, id) {
      yield* lesson('space');
      g.spaceN[s]++;
      const to = g.space[s] + 1;
      const r = 1 + Math.floor(rand() * 6);
      yield* hold({ k: 'die', what: 'space', why: SN(s) + ' tries for ' + SP[to].name, side: s, rolls: [{ side: s, r }], need: SP[to].roll, box: to });
      const ok = r <= SP[to].roll;
      log({ t: 'spacetry', side: s, box: to, r, need: SP[to].roll, ok, card: id });
      if (ok) advance(s, 1);
    }

    /* ================================================================
       Events
       ================================================================ */
    function canEvent(id, s, ctx) {
      ctx = ctx || {};
      const F = g.fx;
      switch (id) {
        case CHINA: return false;
        case 7: return !F.ironLady;
        case 13: return !F.campDavid;
        case 21: return !!(F.marshall || F.warsaw);
        case 32: return ctx.how === 'event' && g.hand[s].some(x => x !== 32 && D.CARD[x].side === other(s));
        case 55: return !F.tearDown;
        case 56: return !F.awacs;
        case 59: return !F.evilEmpire;
        case 61: return !F.nso;
        case 85: return g.space.US > g.space.SU;
        case 100: return g.defcon === 2;
        case 101: return !!F.jp2;
        case 104: return g.turn < R.lateTurn;
      }
      return true;
    }
    g.canEvent = canEvent;
    /* Whose event it is when `by` plays it: the card's side, or the player for
       a card both sides can use. */
    const evSide = (id, by) => (D.CARD[id].side === 'N' ? by : D.CARD[id].side);

    /* Run a card's event. Returns true if it happened (so a star removes it). */
    function* runEvent(id, s, ctx) {
      ctx = ctx || {};
      if (!canEvent(id, s, ctx)) { log({ t: 'noevent', card: id, side: s }); return false; }
      log({ t: 'event', card: id, side: s, by: ctx.by || s, how: ctx.how || 'event' });
      const f = EV[id];
      if (f) yield* f(s, ctx);
      if (D.WARS.indexOf(id) >= 0 && (ctx.by || s) === 'US' && s === 'US' && g.fx.flower && !g.fx.evilEmpire) addVP('SU', 2, 'Flower Power');
      return true;
    }

    /* The country lists events share. */
    const has = (c, s) => inf(c, s) > 0;
    const list = (where, f) => D.inReg(where).filter(c => !f || f(c));
    /* Add `n` influence, at most `per` a country, among `cands`. */
    function* addN(s, n, cands, per, why, card) {
      const m = yield* alloc(s, 'add', why, cands.map(c => cOpt(c, { cap: per || n })), n, { must: true, card, act: 'add', who: s, pub: why });
      for (const c of Object.keys(m)) addInf(s, c, m[c], 'event');
    }
    /* `actor` removes `n` of `whose` influence, at most `per` a country. */
    function* remN(actor, whose, n, cands, per, why, card) {
      const opts = cands.filter(c => has(c, whose)).map(c => cOpt(c, { cap: Math.min(per || n, inf(c, whose)) }));
      const m = yield* alloc(actor, 'rem', why, opts, n, { must: true, card, act: 'rem', who: whose, pub: why });
      for (const c of Object.keys(m)) remInf(whose, c, m[c], 'event');
    }
    /* Choose `k` distinct countries. */
    function* chooseK(s, k, cands, why, card, act, who) {
      const opts = cands.map(c => cOpt(c));
      if (opts.length <= k) return cands.slice();
      return yield* pick(s, 'countries', why, opts, { multi: true, min: k, max: k, card, act, who, pub: why });
    }
    /* A war: roll 1-6, less 1 for each neighbour of the target the defender
       controls; at `win` or more the attacker gains VP and the defender's
       influence there. */
    function* war(s, target, win, vp, mil, card, extraMinus) {
      const opp = other(s);
      const minus = C[target].adj.filter(a => ctrl(a) === opp).length + (extraMinus || 0);
      const r = 1 + Math.floor(rand() * 6);
      yield* hold({ k: 'die', what: 'war', why: D.CARD[card].name + ': ' + CN(target), side: s, c: target, rolls: [{ side: s, r, mod: -minus }], need: win, card });
      const won = r - minus >= win;
      log({ t: 'war', card, side: s, c: target, r, minus, need: win, won });
      addMil(s, mil, D.CARD[card].name);
      if (won) {
        const k = inf(target, opp);
        remInf(opp, target, k, 'war');
        addInf(s, target, k, 'war');
        addVP(s, vp, D.CARD[card].name);
      }
    }
    /* "Discard a card worth N+ Ops, or else": the answer or null. */
    function* discardOrElse(s, need, why, card, elseLabel) {
      const ok = g.hand[s].filter(x => D.CARD[x].ops && opsOf(s, x) >= need && !D.CARD[x].score);
      if (!ok.length) return null;
      const opts = ok.map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: opsOf(s, x) + ' Ops' }));
      const id = yield* pick(s, 'discard', why, opts, { skip: elseLabel, card, always: true, pub: why });
      if (id == null) return null;
      const x = +id;
      fromHand(s, x); settle(x, false);
      log({ t: 'discard', side: s, card: x, why: D.CARD[card].name });
      return x;
    }
    function randomDiscard(s, why) {
      const h = g.hand[s];
      if (!h.length) return null;
      const x = h[Math.floor(rand() * h.length)];
      g.drawN++;
      fromHand(s, x); settle(x, false);
      log({ t: 'discard', side: s, card: x, random: true, why });
      return x;
    }
    function* scoreCard(r, by) {
      const shuttle = (r === 'ME' || r === 'AS') && g.fx.shuttle;
      const res = D.scoreRegion(g.inf, r, { taiwanBg: g.fx.formosan, shuttle });
      if (shuttle) {
        g.fx.shuttle = false;
        const i = g.table.indexOf(73);
        if (i >= 0) { g.table.splice(i, 1); g.disc.push(73); }
        log({ t: 'shuttle', r });
      }
      log({ t: 'score', r, us: res.US, su: res.SU, net: res.net, lv: res.lv || null, euroWin: res.euroWin || null, rows: res.rows || null, by });
      yield* lesson('scoring');
      yield* hold({ k: 'score', r, res: clone(res), vpBefore: g.vp });
      if (res.euroWin) finish(res.euroWin, 'europe');
      if (res.net > 0) addVP('US', res.net, (r === 'SEA' ? 'Southeast Asia' : D.REGION[r].name) + ' scoring');
      else if (res.net < 0) addVP('SU', -res.net, (r === 'SEA' ? 'Southeast Asia' : D.REGION[r].name) + ' scoring');
    }
    function* takeChina(s, up, why) {
      g.china = s; g.chinaUp = up;
      log({ t: 'china', side: s, up, why });
    }

    const EV = {
      1: function* (s) { yield* scoreCard('AS', s); },
      2: function* (s) { yield* scoreCard('EU', s); },
      3: function* (s) { yield* scoreCard('ME', s); },
      37: function* (s) { yield* scoreCard('CA', s); },
      38: function* (s) { yield* scoreCard('SEA', s); },
      79: function* (s) { yield* scoreCard('AF', s); },
      81: function* (s) { yield* scoreCard('SA', s); },
      4: function* () { yield* defconMove(-1, 'Duck and Cover'); addVP('US', 5 - g.defcon, 'Duck and Cover'); },
      5: function* () {
        const x = randomDiscard('SU', 'Five Year Plan');
        if (x != null && D.CARD[x].side === 'US' && canEvent(x, 'US', {})) {
          const i = g.disc.lastIndexOf(x); if (i >= 0) g.disc.splice(i, 1);
          g.limbo.push(x);
          const ok = yield* runEvent(x, 'US', { by: 'SU', how: 'trigger' });
          place(x, ok);
        }
      },
      7: function* () { yield* remN('SU', 'US', 3, D.inReg('WE'), 2, 'Socialist Governments: remove 3 US influence in Western Europe, at most 2 a country.', 7); },
      8: function* () { remInf('US', 'Cuba', inf('Cuba', 'US'), 'Fidel'); toControl('SU', 'Cuba', 'Fidel'); },
      9: function* () { addInf('SU', 'Vietnam', 2, 'Vietnam Revolts'); g.tfx.vietnam = true; },
      10: function* () {
        const x = yield* discardOrElse('US', 3, 'Blockade: discard a card worth 3+ Ops, or lose all your influence in West Germany.', 10, 'Lose West Germany');
        if (x == null) remInf('US', 'WGermany', inf('WGermany', 'US'), 'Blockade');
      },
      11: function* (s) { yield* war('SU', 'SKorea', 4, 2, 2, 11); },
      12: function* () { remInf('US', 'Romania', inf('Romania', 'US'), 'Romanian Abdication'); toControl('SU', 'Romania', 'Romanian Abdication'); },
      13: function* () { yield* war('SU', 'Israel', 4, 2, 2, 13, ctrl('Israel') === 'US' ? 1 : 0); },
      14: function* () {
        const cs = yield* chooseK('SU', 4, list('EE', c => ctrl(c) !== 'US'), 'COMECON: 1 influence in each of 4 Eastern European countries.', 14, 'add', 'SU');
        cs.forEach(c => addInf('SU', c, 1, 'COMECON'));
      },
      15: function* () { addInf('SU', 'Egypt', 2, 'Nasser'); remInf('US', 'Egypt', Math.ceil(inf('Egypt', 'US') / 2), 'Nasser'); },
      16: function* () {
        g.fx.warsaw = true;
        const m = yield* pick('SU', 'warsaw', 'Warsaw Pact: which?', [
          { id: 'rem', label: 'Clear US influence from 4 countries', bad: list('EE', c => has(c, 'US')).length ? null : 'No US influence in Eastern Europe' },
          { id: 'add', label: 'Add 5 USSR influence, at most 2 a country' }], { card: 16, always: true, pub: 'Warsaw Pact: choosing' });
        if (m === 'rem') {
          const cs = yield* chooseK('SU', 4, list('EE', c => has(c, 'US')), 'Warsaw Pact: clear US influence from 4 countries.', 16, 'clear', 'US');
          cs.forEach(c => remInf('US', c, inf(c, 'US'), 'Warsaw Pact'));
        } else yield* addN('SU', 5, D.inReg('EE'), 2, 'Warsaw Pact: add 5 influence in Eastern Europe, at most 2 a country.', 16);
      },
      17: function* () { remInf('US', 'France', 2, 'De Gaulle'); addInf('SU', 'France', 1, 'De Gaulle'); g.fx.deGaulle = true; },
      18: function* (s) { advance(s, 1, 'Captured Nazi Scientist'); },
      19: function* () {
        const cs = list('EU', c => !ctrl(c) && has(c, 'SU'));
        const c = yield* pick('US', 'country', 'Truman Doctrine: clear all USSR influence from one uncontrolled European country.', cs.map(x => cOpt(x)), { card: 19, act: 'clear', who: 'SU', pub: 'Truman Doctrine' });
        if (c) remInf('SU', c, inf(c, 'SU'), 'Truman Doctrine');
      },
      20: function* (s) {
        const o = other(s);
        const a = yield* pick(o, 'olympics', SN(s) + ' hosts the Olympic Games. Take part, or boycott?', [
          { id: 'go', label: 'Take part', sub: 'Both roll; ' + SN(s) + ' adds 2; the winner gains 2 VP' },
          { id: 'boycott', label: 'Boycott', sub: 'DEFCON drops one and ' + SN(s) + ' spends 4 Ops' }], { card: 20, always: true, pub: 'deciding on the Olympics' });
        log({ t: 'olympics', side: o, a });
        if (a === 'boycott') { yield* defconMove(-1, 'Olympic boycott'); yield* spendOps(s, opsVal(s, 4), 20, { why: 'The boycott: spend 4 Ops' }); return; }
        for (let k = 0; k < 20; k++) {
          const rs = 1 + Math.floor(rand() * 6), ro = 1 + Math.floor(rand() * 6);
          yield* hold({ k: 'die', what: 'olympics', why: 'The Olympic Games', side: s, rolls: [{ side: s, r: rs, mod: 2 }, { side: o, r: ro, mod: 0 }] });
          if (rs + 2 === ro) { log({ t: 'olytie' }); continue; }
          const w = rs + 2 > ro ? s : o;
          log({ t: 'olywin', side: w, rs, ro });
          addVP(w, 2, 'Olympic Games');
          return;
        }
      },
      21: function* () { g.fx.nato = true; },
      22: function* () {
        const cs = ['Yugoslavia', 'Romania', 'Bulgaria', 'Hungary', 'Czechoslovakia'].filter(c => inf(c, 'SU') > inf(c, 'US'));
        const c = yield* pick('US', 'country', 'Independent Reds: match the USSR’s influence in one country.', cs.map(x => cOpt(x)), { card: 22, act: 'match', who: 'US', pub: 'Independent Reds' });
        if (c) addInf('US', c, inf(c, 'SU') - inf(c, 'US'), 'Independent Reds');
      },
      23: function* () {
        g.fx.marshall = true;
        const cs = yield* chooseK('US', 7, list('WE', c => ctrl(c) !== 'SU'), 'Marshall Plan: 1 influence in each of 7 Western European countries.', 23, 'add', 'US');
        cs.forEach(c => addInf('US', c, 1, 'Marshall Plan'));
      },
      24: function* (s) {
        const t = yield* pick(s, 'target', 'Indo-Pakistani War: who is invaded?', [cOpt('India', { label: 'Invade India' }), cOpt('Pakistan', { label: 'Invade Pakistan' })], { card: 24, always: true, act: 'war', who: other(s), pub: 'choosing the war' });
        yield* war(s, t, 4, 2, 2, 24);
      },
      25: function* () { g.tfx.containment = true; },
      26: function* () { g.tfx.seeSU = true; log({ t: 'reveal', side: 'SU', to: 'US', n: g.hand.SU.length }); yield* spendOps('US', opsVal('US', 1), 26, { why: 'CIA Created: spend 1 Op' }); },
      27: function* () { toControl('US', 'Japan', 'US/Japan Pact'); g.fx.japan = true; },
      28: function* () { yield* remN('SU', 'US', 4, ['France', 'UK', 'Israel'], 2, 'Suez Crisis: remove 4 US influence from France, the UK and Israel, at most 2 each.', 28); },
      29: function* () {
        const k = g.turn >= R.lateTurn ? 2 : 1;
        const cs = yield* chooseK('US', 3, list('EE', c => has(c, 'SU')), 'East European Unrest: remove ' + k + ' USSR influence from each of 3 countries.', 29, 'rem', 'SU');
        cs.forEach(c => remInf('SU', c, k, 'East European Unrest'));
      },
      30: function* () {
        const cs = yield* chooseK('SU', 4, D.COUNTRIES.filter(c => C[c].reg === 'AF' || C[c].subs.indexOf('SEA') >= 0), 'Decolonization: 1 influence in each of 4 countries in Africa or Southeast Asia.', 30, 'add', 'SU');
        cs.forEach(c => addInf('SU', c, 1, 'Decolonization'));
      },
      31: function* (s) { g.tfx.redScare = s; },
      32: function* (s) {
        const opts = g.hand[s].filter(x => x !== 32 && D.CARD[x].side === other(s)).map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: opsOf(s, x) + ' Ops' }));
        const id = yield* pick(s, 'un', 'UN Intervention: which of the other side’s cards do you spend? Its event will not happen.', opts, { card: 32, always: true, pub: 'UN Intervention' });
        if (id == null) return;
        const x = +id;
        fromHand(s, x);
        log({ t: 'un', side: s, card: x });
        if (g.tfx.u2) addVP('SU', 1, 'U2 Incident');
        yield* spendOps(s, opsOf(s, x), x, { why: 'UN Intervention with ' + D.CARD[x].name, bonus: bonusOf(s, x) });
        settle(x, false);
      },
      33: function* () {
        const own = D.COUNTRIES.filter(c => has(c, 'SU'));
        const m = yield* alloc('SU', 'rem', 'De-Stalinization: take up to 4 USSR influence off the map (to move it).', own.map(c => cOpt(c, { cap: inf(c, 'SU') })), 4, { min: 0, card: 33, act: 'rem', who: 'SU', pub: 'De-Stalinization' });
        let n = 0;
        for (const c of Object.keys(m)) n += remInf('SU', c, m[c], 'De-Stalinization');
        if (n) yield* addN('SU', n, D.COUNTRIES.filter(c => ctrl(c) !== 'US'), 2, 'De-Stalinization: place the ' + n + ' again where the USA has no control, at most 2 a country.', 33);
      },
      34: function* (s) { if (g.defcon - 2 > 0) addVP(s, g.defcon - 2, 'Nuclear Test Ban'); yield* defconMove(2, 'Nuclear Test Ban'); },
      35: function* () { g.fx.formosan = true; },
      36: function* (s) {
        const o = other(s);
        const cs = D.COUNTRIES.filter(c => C[c].stab <= 2 && has(c, o) && !(s === 'SU' && protectedFromSU(c)));
        const t = yield* pick(s, 'target', 'Brush War: attack a country of stability 1 or 2.', cs.map(c => cOpt(c)), { card: 36, act: 'war', who: o, pub: 'choosing a Brush War target' });
        if (t) yield* war(s, t, 3, 1, 3, 36);
      },
      39: function* (s) {
        const o = other(s);
        if (g.mil[s] > g.mil[o]) addVP(s, g.mil[s] >= g.defcon ? 3 : 1, 'Arms Race');
      },
      40: function* (s) { yield* defconSet(2, 'Cuban Missile Crisis'); g.tfx.cmc = s; },
      41: function* () { g.tfx.subs = true; },
      42: function* () { g.fx.quag = true; g.fx.norad = false; },
      43: function* (s) {
        yield* defconMove(2, 'SALT');
        g.tfx.salt = true;
        const opts = g.disc.filter(x => !D.CARD[x].score).map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: D.CARD[x].ops + ' Ops' }));
        const id = yield* pick(s, 'salt', 'SALT Negotiations: take a card from the discards?', opts, { card: 43, skip: 'Take nothing', pub: 'SALT: looking through the discards' });
        if (id != null) { const x = +id; g.disc.splice(g.disc.indexOf(x), 1); g.hand[s].push(x); log({ t: 'salt', side: s, card: x }); }
      },
      44: function* () { g.fx.bear = true; },
      45: function* (s) {
        const o = other(s);
        const lv = side => D.REGIONS.filter(r => { const x = D.scoreRegion(g.inf, r, {}); return x.lv[side] === 'domination' || x.lv[side] === 'control'; }).length;
        const ms = lv(s), mo = lv(o);
        const rs = 1 + Math.floor(rand() * 6), ro = 1 + Math.floor(rand() * 6);
        yield* hold({ k: 'die', what: 'summit', why: 'The Summit', side: s, rolls: [{ side: s, r: rs, mod: ms }, { side: o, r: ro, mod: mo }] });
        log({ t: 'summit', rs, ro, ms, mo, side: s });
        if (rs + ms === ro + mo) return;
        const w = rs + ms > ro + mo ? s : o;
        addVP(w, 2, 'Summit');
        const d = yield* pick(w, 'defcon', 'You won the Summit: move DEFCON?', [
          { id: '0', label: 'Leave it at ' + g.defcon },
          { id: '1', label: 'Improve to ' + Math.min(5, g.defcon + 1), bad: g.defcon >= 5 ? 'Already 5' : null },
          { id: '-1', label: 'Lower to ' + (g.defcon - 1), sub: g.defcon === 2 ? 'Nuclear war: ' + SN(g.phasing) + ', whose turn it is, loses' : '' }], { card: 45, always: true, pub: 'Summit: DEFCON' });
        if (d && +d) yield* defconMove(+d, 'Summit');
      },
      46: function* (s) {
        const opts = [5, 4, 3, 2, 1].map(v => ({ id: String(v), label: 'DEFCON ' + v, sub: v === 1 ? 'Nuclear war: you lose' : v === g.defcon ? 'as it is' : '' }));
        const v = yield* pick(s, 'defcon', 'How I Learned to Stop Worrying: set DEFCON.', opts, { card: 46, always: true, pub: 'setting DEFCON' });
        yield* defconSet(+v, 'How I Learned to Stop Worrying');
        addMil(s, 5, 'How I Learned to Stop Worrying');
      },
      47: function* (s) {
        const cs = D.COUNTRIES.filter(c => C[c].reg === 'CA' || C[c].reg === 'SA');
        const c = yield* pick(s, 'country', 'Junta: add 2 influence to one country in Central or South America.', cs.map(x => cOpt(x)), { card: 47, act: 'add', who: s, pub: 'Junta' });
        if (c) addInf(s, c, 2, 'Junta');
        const where = x => C[x].reg === 'CA' || C[x].reg === 'SA';
        const m = yield* pick(s, 'mode', 'Junta: a free coup or realignment in Central or South America?', [
          { id: 'coup', label: 'Free coup', bad: coupable(s, { coup: true, free: true, where }).length ? null : 'No target' },
          { id: 'realign', label: 'Realignment', bad: coupable(s, { free: true, where }).length ? null : 'No target' }], { card: 47, skip: 'Neither', pub: 'Junta: a coup?' });
        if (m === 'coup') yield* coup(s, opsVal(s, 2), 47, { free: true, where });
        else if (m === 'realign') yield* realign(s, opsVal(s, 2), 47, { free: true, where });
      },
      48: function* () {
        const bg = s => D.COUNTRIES.filter(c => C[c].bg && ctrl(c) === s).length;
        if (bg('US') > bg('SU')) addVP('US', 2, 'Kitchen Debates');
      },
      49: function* (s) {
        const o = other(s);
        const h = g.hand[o];
        if (!h.length) return;
        const top = Math.max.apply(null, h.map(x => D.CARD[x].ops));
        const cands = h.filter(x => D.CARD[x].ops === top);
        const id = cands.length === 1 ? String(cands[0]) : yield* pick(o, 'envy', 'Missile Envy: which card do you hand over?', cands.map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: D.CARD[x].ops + ' Ops' })), { card: 49, always: true, pub: 'Missile Envy: choosing a card' });
        const x = +id;
        fromHand(o, x);
        /* Missile Envy itself goes to the other side, to be played for Ops. */
        const i = g.limbo.indexOf(49);
        if (i >= 0) { g.limbo.splice(i, 1); g.hand[o].push(49); g.tfx.envy = o; }
        log({ t: 'envy', side: s, card: x, from: o });
        const ev = D.CARD[x].side;
        if (ev !== o && canEvent(x, evSide(x, s), { how: 'event' })) {
          const ok = yield* runEvent(x, evSide(x, s), { by: s, how: 'event' });
          place(x, ok);
        } else {
          yield* spendOps(s, opsOf(s, x), x, { why: 'Missile Envy: spend ' + D.CARD[x].name + '’s Ops', bonus: bonusOf(s, x) });
          settle(x, false);
        }
        g.envyDest = g.hand[o].indexOf(49) >= 0;
      },
      50: function* () { yield* defconMove(-1, 'We Will Bury You'); g.tfx.wwby = true; },
      51: function* () { g.tfx.brezhnev = true; },
      52: function* () { addInf('SU', 'SEAfricanStates', 2, 'Portuguese Empire Crumbles'); addInf('SU', 'Angola', 2, 'Portuguese Empire Crumbles'); },
      53: function* () {
        const m = yield* pick('SU', 'mode', 'South African Unrest: which?', [
          { id: 'sa', label: '2 influence in South Africa' }, { id: 'adj', label: '1 in South Africa, 2 in Angola and/or Botswana' }], { card: 53, always: true, pub: 'South African Unrest' });
        if (m === 'sa') addInf('SU', 'SouthAfrica', 2, 'South African Unrest');
        else { addInf('SU', 'SouthAfrica', 1, 'South African Unrest'); yield* addN('SU', 2, ['Angola', 'Botswana'], 2, 'South African Unrest: 2 influence in Angola and/or Botswana.', 53); }
      },
      54: function* () { addInf('SU', 'Chile', 2, 'Allende'); },
      55: function* () { addVP('SU', 1, 'Willy Brandt'); addInf('SU', 'WGermany', 1, 'Willy Brandt'); g.fx.brandt = true; },
      56: function* () {
        const cs = ['Sudan', 'Iran', 'Iraq', 'Egypt', 'Libya', 'SaudiArabia', 'Syria', 'Jordan'].filter(c => has(c, 'US'));
        const pickd = yield* chooseK('SU', 2, cs, 'Muslim Revolution: clear all US influence from 2 countries.', 56, 'clear', 'US');
        pickd.forEach(c => remInf('US', c, inf(c, 'US'), 'Muslim Revolution'));
      },
      57: function* (s) { yield* defconMove(1, 'ABM Treaty'); yield* spendOps(s, opsVal(s, 4), 57, { why: 'ABM Treaty: spend 4 Ops' }); },
      58: function* () { if (g.china === 'US') yield* takeChina('SU', true, 'Cultural Revolution'); else addVP('SU', 1, 'Cultural Revolution'); },
      59: function* () { g.fx.flower = true; },
      60: function* () { addVP('SU', 1, 'U2 Incident'); g.tfx.u2 = true; },
      61: function* () {
        const n = ['Egypt', 'Iran', 'Libya', 'SaudiArabia', 'Iraq', 'GulfStates', 'Venezuela'].filter(c => ctrl(c) === 'SU').length;
        addVP('SU', n, 'OPEC');
      },
      62: function* () { g.tfx.seeUS = true; log({ t: 'reveal', side: 'US', to: 'SU', n: g.hand.US.length }); yield* spendOps('SU', opsVal('SU', 1), 62, { why: 'Lone Gunman: spend 1 Op' }); },
      63: function* () {
        const cs = yield* chooseK('US', 4, D.COUNTRIES.filter(c => C[c].reg === 'AF' || C[c].subs.indexOf('SEA') >= 0), 'Colonial Rear Guards: 1 influence in each of 4 countries in Africa or Southeast Asia.', 63, 'add', 'US');
        cs.forEach(c => addInf('US', c, 1, 'Colonial Rear Guards'));
      },
      64: function* () { ['Panama', 'CostaRica', 'Venezuela'].forEach(c => addInf('US', c, 1, 'Panama Canal Returned')); },
      65: function* () { addVP('US', 1, 'Camp David Accords'); ['Israel', 'Jordan', 'Egypt'].forEach(c => addInf('US', c, 1, 'Camp David Accords')); g.fx.campDavid = true; },
      66: function* () {
        const cs = yield* chooseK('US', 3, D.COUNTRIES.filter(c => !has(c, 'US') && !has(c, 'SU')), 'Puppet Governments: 1 influence in each of 3 countries where neither side has any.', 66, 'add', 'US');
        cs.forEach(c => addInf('US', c, 1, 'Puppet Governments'));
      },
      67: function* () {
        const h = g.hand.SU;
        let x = null;
        if (h.length) { x = h[Math.floor(rand() * h.length)]; g.drawN++; fromHand('SU', x); }
        if (x != null) {
          log({ t: 'grain', side: 'US' });
          const a = yield* pick('US', 'grain', 'Grain Sales: you drew ' + D.CARD[x].name + ' from the USSR’s hand. Play it, or give it back and spend 2 Ops?', [
            { id: 'play', label: 'Play ' + D.CARD[x].name, card: x },
            { id: 'back', label: 'Give it back, spend Grain Sales’ Ops' }], { card: x, always: true, secret: true, pub: 'Grain Sales: deciding' });
          if (a === 'play') {
            const i = g.limbo.indexOf(x); if (i >= 0) g.limbo.splice(i, 1);
            g.hand.US.push(x);
            log({ t: 'grainplay', side: 'US', card: x });
            const ans = yield* ask('US', { t: 'turn', what: 'turn', why: 'Grain Sales: play ' + D.CARD[x].name, pub: 'playing the card Grain Sales drew', only: x });
            yield* doPlay('US', ans, { grain: true });
            return;
          }
          const i = g.limbo.indexOf(x); if (i >= 0) g.limbo.splice(i, 1);
          g.hand.SU.push(x);
          log({ t: 'grainback', side: 'US' });
        }
        yield* spendOps('US', opsVal('US', 2), 67, { why: 'Grain Sales: spend 2 Ops' });
      },
      68: function* () { remInf('SU', 'Poland', 2, 'John Paul II'); addInf('US', 'Poland', 1, 'John Paul II'); g.fx.jp2 = true; },
      69: function* (s) { g.tfx.squads = s; },
      70: function* () { yield* addN('US', 2, D.COUNTRIES.filter(c => C[c].reg === 'CA' || C[c].reg === 'SA'), 2, 'OAS Founded: 2 influence in Central and/or South America.', 70); },
      71: function* () { if (g.china === 'US') addVP('US', 2, 'Nixon Plays the China Card'); else yield* takeChina('US', false, 'Nixon Plays the China Card'); },
      72: function* () { remInf('SU', 'Egypt', inf('Egypt', 'SU'), 'Sadat Expels Soviets'); addInf('US', 'Egypt', 1, 'Sadat Expels Soviets'); },
      73: function* () { g.fx.shuttle = true; g.shuttleDest = true; },
      74: function* () { yield* remN('US', 'SU', 4, D.COUNTRIES.filter(c => C[c].reg !== 'EU'), 2, 'The Voice of America: remove 4 USSR influence outside Europe, at most 2 a country.', 74); },
      75: function* () { yield* addN('SU', 3, D.inReg('CA'), 2, 'Liberation Theology: 3 influence in Central America, at most 2 a country.', 75); },
      76: function* () {
        if (g.china === 'SU') yield* takeChina('US', true, 'Ussuri River Skirmish');
        else yield* addN('US', 4, D.inReg('AS'), 2, 'Ussuri River Skirmish: 4 influence in Asia, at most 2 a country.', 76);
      },
      77: function* () {
        const opts = g.hand.US.map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: D.CARD[x].ops + ' Ops' }));
        const ids = yield* pick('US', 'asknot', 'Ask Not: discard any cards to draw that many again.', opts, { multi: true, min: 0, card: 77, always: true, pub: 'Ask Not: choosing cards to discard' });
        ids.forEach(id => { const x = +id; fromHand('US', x); settle(x, false); });
        if (ids.length) log({ t: 'asknot', side: 'US', cards: ids.map(Number) });
        let k = 0;
        for (let j = 0; j < ids.length; j++) { const c = drawCard(); if (c == null) break; g.hand.US.push(c); k++; }
        log({ t: 'draw', side: 'US', n: k, why: 'Ask Not' });
      },
      78: function* () {
        const n = D.COUNTRIES.filter(c => (C[c].reg === 'CA' || C[c].reg === 'SA') && C[c].bg && ctrl(c) === 'US').length;
        addVP('US', n, 'Alliance for Progress');
      },
      80: function* (s) { if (g.space[s] < g.space[other(s)]) advance(s, 2, 'One Small Step'); },
      82: function* () { remInf('US', 'Iran', inf('Iran', 'US'), 'Iranian Hostage Crisis'); addInf('SU', 'Iran', 2, 'Iranian Hostage Crisis'); g.fx.hostage = true; },
      83: function* () { addVP('US', 1, 'The Iron Lady'); addInf('SU', 'Argentina', 1, 'The Iron Lady'); remInf('SU', 'UK', inf('UK', 'SU'), 'The Iron Lady'); g.fx.ironLady = true; },
      84: function* () { addVP('US', Math.floor(inf('Libya', 'SU') / 2), 'Reagan Bombs Libya'); },
      85: function* () {
        const opts = g.disc.filter(x => !D.CARD[x].score && x !== 85 && canEvent(x, evSide(x, 'US'), { how: 'event' })).map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: D.SIDE[evSide(x, 'US')].name + '’s event' }));
        const id = yield* pick('US', 'starwars', 'Star Wars: choose a card from the discards; its event happens now.', opts, { card: 85, always: true, pub: 'Star Wars: choosing an event' });
        if (id == null) return;
        const x = +id;
        g.disc.splice(g.disc.indexOf(x), 1); g.limbo.push(x);
        const ok = yield* runEvent(x, evSide(x, 'US'), { by: 'US', how: 'event' });
        place(x, ok);
      },
      86: function* () { g.fx.nso = true; g.tfx.nso8 = true; },
      87: function* () {
        const n = g.vp < 0 ? 6 : 4;
        yield* addN('SU', n, D.inReg('EU'), 2, 'The Reformer: ' + n + ' influence in Europe, at most 2 a country.', 87);
        g.fx.reformer = true;
      },
      88: function* () {
        remInf('US', 'Lebanon', inf('Lebanon', 'US'), 'Marine Barracks Bombing');
        yield* remN('SU', 'US', 2, D.inReg('ME'), 2, 'Marine Barracks Bombing: remove 2 more US influence in the Middle East.', 88);
      },
      89: function* () {
        yield* defconMove(-1, 'KAL-007');
        addVP('US', 2, 'KAL-007');
        if (ctrl('SKorea') === 'US') yield* spendOps('US', opsVal('US', 4), 89, { why: 'KAL-007: spend 4 Ops', noCoup: true });
      },
      90: function* () {
        addVP('SU', 2, 'Glasnost');
        yield* defconMove(1, 'Glasnost');
        if (g.fx.reformer) yield* spendOps('SU', opsVal('SU', 4), 90, { why: 'Glasnost: spend 4 Ops', noCoup: true });
      },
      91: function* () {
        remInf('US', 'Nicaragua', inf('Nicaragua', 'US'), 'Ortega');
        const where = c => C.Nicaragua.adj.indexOf(c) >= 0;
        yield* coup('SU', opsVal('SU', 2), 91, { free: true, where, optional: true, why: 'Ortega: a free coup next to Nicaragua?' });
      },
      92: function* (s) {
        const o = other(s);
        const k = s === 'SU' && g.fx.hostage ? 2 : 1;
        for (let j = 0; j < k; j++) randomDiscard(o, 'Terrorism');
      },
      93: function* () { g.tfx.contra = true; },
      94: function* () {
        const r = yield* pick('US', 'region', 'Chernobyl: in which region may the USSR not place influence this turn?', D.REGIONS.map(x => ({ id: x, label: D.REGION[x].name })), { card: 94, always: true, pub: 'Chernobyl: naming a region' });
        g.tfx.chernobyl = r;
        log({ t: 'chernobyl', r });
      },
      95: function* () {
        const x = yield* discardOrElse('US', 3, 'Latin American Debt Crisis: discard a card worth 3+ Ops, or the USSR doubles its influence in 2 South American countries.', 95, 'Let them double it');
        if (x != null) return;
        const cs = yield* chooseK('SU', 2, list('SA', c => has(c, 'SU')), 'Debt Crisis: double your influence in 2 South American countries.', 95, 'add', 'SU');
        cs.forEach(c => addInf('SU', c, inf(c, 'SU'), 'Latin American Debt Crisis'));
      },
      96: function* () {
        addInf('US', 'EGermany', 3, 'Tear Down This Wall');
        g.fx.tearDown = true; g.fx.brandt = false;
        const where = c => C[c].reg === 'EU';
        const m = yield* pick('US', 'mode', 'Tear Down This Wall: a free coup or realignment in Europe?', [
          { id: 'coup', label: 'Free coup', bad: coupable('US', { coup: true, free: true, where }).length ? null : 'No target' },
          { id: 'realign', label: 'Realignment', bad: coupable('US', { free: true, where }).length ? null : 'No target' }], { card: 96, skip: 'Neither', pub: 'Tear Down This Wall: a coup?' });
        if (m === 'coup') yield* coup('US', opsVal('US', 3), 96, { free: true, where });
        else if (m === 'realign') yield* realign('US', opsVal('US', 3), 96, { free: true, where });
      },
      97: function* () { addVP('US', 1, 'An Evil Empire'); g.fx.evilEmpire = true; g.fx.flower = false; },
      98: function* () {
        g.tfx.seeUS = true;
        log({ t: 'reveal', side: 'US', to: 'SU', n: g.hand.US.length });
        const opts = g.hand.US.map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: D.CARD[x].ops + ' Ops' }));
        const id = yield* pick('SU', 'ames', 'Aldrich Ames: choose one card from the US hand to discard.', opts, { card: 98, always: true, pub: 'Aldrich Ames: choosing a US card' });
        if (id == null) return;
        const x = +id;
        fromHand('US', x); settle(x, false);
        log({ t: 'discard', side: 'US', card: x, why: 'Aldrich Ames' });
      },
      99: function* () {
        addVP('SU', 1, 'Pershing II');
        const cs = yield* chooseK('SU', 3, list('WE', c => has(c, 'US')), 'Pershing II: 1 US influence off each of 3 Western European countries.', 99, 'rem', 'US');
        cs.forEach(c => remInf('US', c, 1, 'Pershing II'));
      },
      100: function* (s) {
        const o = other(s);
        const after = g.vp + sgn(o) * 6;
        const a = yield* pick(s, 'wargames', 'Wargames: end the game now, giving ' + SN(o) + ' 6 VP? ' + (after === 0 ? 'It would be a draw.' : D.SIDE[after > 0 ? 'US' : 'SU'].name + ' would win.'), [
          { id: 'end', label: 'End the game' }, { id: 'no', label: 'Play on' }], { card: 100, always: true, pub: 'Wargames: end the game?' });
        if (a !== 'end') return;
        g.finalScoring = true;
        addVP(o, 6, 'Wargames');
        finish(g.vp > 0 ? 'US' : g.vp < 0 ? 'SU' : null, 'wargames');
      },
      101: function* () { addInf('US', 'Poland', 3, 'Solidarity'); },
      102: function* (s) {
        const t = yield* pick(s, 'target', 'Iran-Iraq War: who is invaded?', [cOpt('Iran', { label: 'Invade Iran' }), cOpt('Iraq', { label: 'Invade Iraq' })], { card: 102, always: true, act: 'war', who: other(s), pub: 'choosing the war' });
        yield* war(s, t, 4, 2, 2, 102);
      },
      103: function* (s, ctx) {
        if (ctx.how === 'trigger' && ctx.by === 'SU' && g.phase === 'ar') addVP('US', 1, 'Defectors');
      },
      104: function* () {
        const sc = g.hand.US.filter(x => D.CARD[x].score);
        log({ t: 'cambridge', cards: sc.slice() });
        if (!sc.length) return;
        const regs = Array.from(new Set(sc.map(x => D.CARD[x].score)));
        const cs = D.COUNTRIES.filter(c => regs.some(r => D.inWhere(c, r)));
        const c = yield* pick('SU', 'country', 'The Cambridge Five: add 1 influence in a region named on those cards.', cs.map(x => cOpt(x)), { card: 104, skip: 'Add nothing', act: 'add', who: 'SU', pub: 'The Cambridge Five' });
        if (c) addInf('SU', c, 1, 'The Cambridge Five');
      },
      105: function* () {
        if (ctrl('UK') !== 'US') return;
        if (g.fx.nato) {
          const c = yield* pick('US', 'country', 'Special Relationship: 2 influence in one Western European country.', D.inReg('WE').map(x => cOpt(x)), { card: 105, always: true, act: 'add', who: 'US', pub: 'Special Relationship' });
          if (c) addInf('US', c, 2, 'Special Relationship');
          addVP('US', 2, 'Special Relationship');
        } else {
          const c = yield* pick('US', 'country', 'Special Relationship: 1 influence next to the UK.', C.UK.adj.map(x => cOpt(x)), { card: 105, always: true, act: 'add', who: 'US', pub: 'Special Relationship' });
          if (c) addInf('US', c, 1, 'Special Relationship');
        }
      },
      106: function* () { g.fx.norad = true; },
      107: function* () {
        const where = c => (C[c].reg === 'CA' || C[c].reg === 'SA' || C[c].reg === 'AF') && !C[c].bg;
        const r = yield* coup('SU', opsVal('SU', 3), 107, { free: true, where, optional: true, why: 'Che: a free coup in a non-battleground of Central or South America or Africa?' });
        if (r && r.removed > 0) yield* coup('SU', opsVal('SU', 3), 107, { free: true, where: c => where(c) && c !== r.c, optional: true, why: 'Che: a second coup somewhere else?' });
      },
      108: function* () {
        if (!D.inReg('ME').some(c => ctrl(c) === 'US')) return;
        const top = [];
        for (let j = 0; j < 5; j++) { const c = drawCard(); if (c == null) break; top.push(c); g.limbo.push(c); }
        log({ t: 'tehran', cards: top.slice() });
        const ids = yield* pick('US', 'tehran', 'Our Man in Tehran: discard any of these; the rest go back and the deck is shuffled.', top.map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: D.SIDE[D.CARD[x].side] ? D.SIDE[D.CARD[x].side].name : 'both' })), { multi: true, min: 0, card: 108, always: true, pub: 'Our Man in Tehran' });
        top.forEach(x => { const i = g.limbo.indexOf(x); if (i >= 0) g.limbo.splice(i, 1); });
        top.forEach(x => { if (ids.indexOf(String(x)) >= 0) g.disc.push(x); else g.deck.push(x); });
        if (ids.length) log({ t: 'tehrandisc', cards: ids.map(Number) });
        g.deck = shuffle(g.deck, rand);
      },
      109: function* () { g.tfx.yuri = true; },
      110: function* () { addInf('US', 'SaudiArabia', 2, 'AWACS Sale'); g.fx.awacs = true; }
    };
    g.EV_IDS = Object.keys(EV).map(Number);

    /* ================================================================
       The action round
       ================================================================ */
    /* The turn menu: every card in hand, every way to play it, and why a way
       is closed. The phone renders this, the house scores it, and the answer
       check validates against it, so nothing offered is ever refused. */
    function menu(side, only) {
      const opp = other(side);
      const cards = only != null ? [only] : g.hand[side].slice();
      if (only == null && g.china === side && g.chinaUp) cards.push(CHINA);
      const envy = g.tfx.envy === side && g.hand[side].indexOf(49) >= 0 && only == null;
      const lastAr = g.ar >= R.rounds(g.turn);
      const out = { hand: [], pass: false, defuse: [], forced: envy ? 49 : null, ar: g.ar, of: R.rounds(g.turn), scoring: g.hand[side].filter(x => D.CARD[x].score).length };
      const coupAny = coupable(side, { coup: true }).length > 0;
      const realignAny = coupable(side).length > 0;
      const placeAny = placeable(side).length > 0;
      for (const id of cards) {
        const c = D.CARD[id];
        const ops = opsOf(side, id);
        const row = { card: id, ops, side: c.side, score: !!c.score };
        const closed = envy && id !== 49 ? 'Missile Envy must be played for Ops this round' : null;
        if (c.score) {
          row.event = closed ? no(closed) : yes();
          row.inf = row.coup = row.realign = row.space = no('A scoring card is played as its event');
        } else {
          if (id === CHINA) row.event = no('The China Card has no event');
          else if (c.side === opp) row.event = no('The ' + SN(opp) + '’s event');
          else if (envy) row.event = no('Missile Envy must be played for Ops');
          else row.event = canEvent(id, side, { how: 'event' }) ? yes() : no(id === 32 ? 'Needs one of the other side’s cards in your hand' : 'Its event cannot happen now');
          if (closed) { row.event = no(closed); }
          row.inf = closed ? no(closed) : placeAny ? yes() : no('Nowhere to place');
          row.coup = closed ? no(closed) : coupAny ? yes() : no('No country to coup');
          row.realign = closed ? no(closed) : realignAny ? yes() : no('No country to realign');
          const sp = canSpace(side, ops);
          row.space = closed ? no(closed) : (envy ? no('Missile Envy must be played for Ops') : sp ? no(sp) : yes({ need: D.SPACE[g.space[side] + 1].roll, box: D.SPACE[g.space[side] + 1].name }));
          if (c.side === opp) row.trig = canEvent(id, opp, { how: 'trigger' });
        }
        out.hand.push(row);
      }
      if (only == null) {
        if (g.tfx.cmc === opp) {
          const spots = side === 'SU' ? ['Cuba'] : ['WGermany', 'Turkey'];
          out.defuse = spots.filter(c => inf(c, side) >= 2);
        }
        out.pass = !g.hand[side].length || !!g.extra;
        out.lastAr = lastAr;
      }
      return out;
    }
    g.menu = id => { const p = P(id); return p ? menu(p.side) : null; };
    g.X = { menu, opsOf, canSpace, coupable, placeable, realignMods, coupMod };

    function turnCheck(side, a, pr) {
      const m = menu(side, pr && pr.only != null ? pr.only : null);
      if (a.t === 'pass') return m.pass ? yes({ a: { t: 'pass' } }) : no('You must play a card.');
      if (a.t === 'defuse') return m.defuse.indexOf(a.id) >= 0 ? yes({ a: { t: 'defuse', id: a.id } }) : no('You cannot defuse the crisis there.');
      if (a.t !== 'play') return no('Choose a card first.');
      const id = +a.card;
      const row = m.hand.find(x => x.card === id);
      if (!row) return no('That card is not in your hand.');
      const how = String(a.how || '');
      if (['event', 'inf', 'coup', 'realign', 'space'].indexOf(how) < 0) return no('Choose how to play it.');
      const r = row[how];
      if (!r || !r.ok) return no(r ? r.why : 'Not like that.');
      return yes({ a: { t: 'play', card: id, how, evFirst: !!a.evFirst && !!row.trig && how !== 'space' } });
    }

    function* doPlay(side, a, o) {
      o = o || {};
      const opp = other(side);
      if (a.t === 'pass') { log({ t: 'pass', side }); if (side === 'US' && g.tfx.wwby) { g.tfx.wwby = false; addVP('SU', 3, 'We Will Bury You'); } return; }
      const id = a.card, c = D.CARD[id];
      /* We Will Bury You: unless this round is UN Intervention as an event,
         the USSR scores first. */
      if (side === 'US' && g.tfx.wwby) {
        g.tfx.wwby = false;
        if (!(id === 32 && a.how === 'event')) addVP('SU', 3, 'We Will Bury You');
        else log({ t: 'wwbystop' });
      }
      if (id === CHINA) { g.chinaUp = false; g.china = null; g.limbo.push(CHINA); }
      else fromHand(side, id);
      if (g.tfx.envy === side && id === 49) g.tfx.envy = null;
      log({ t: 'play', side, card: id, how: a.how, ops: a.how === 'event' ? null : opsOf(side, id), evFirst: !!a.evFirst, grain: !!o.grain });
      let evented = false;
      if (a.how === 'event') {
        evented = yield* runEvent(id, evSide(id, side), { by: side, how: 'event' });
      } else if (a.how === 'space') {
        yield* spaceRace(side, id);
      } else {
        const trig = c.side === opp && id !== CHINA;
        if (trig && canEvent(id, opp, { how: 'trigger' })) yield* lesson('trigger');
        if (trig && a.evFirst) evented = yield* runEvent(id, opp, { by: side, how: 'trigger' });
        yield* spendOps(side, opsOf(side, id), id, { mode: a.how, bonus: bonusOf(side, id) });
        if (trig && !a.evFirst) evented = yield* runEvent(id, opp, { by: side, how: 'trigger' });
      }
      if (id === CHINA) {
        const i = g.limbo.indexOf(CHINA); if (i >= 0) g.limbo.splice(i, 1);
        g.china = opp; g.chinaUp = false;
        if (side === 'US' && g.fx.formosan) { g.fx.formosan = false; log({ t: 'formosanEnds' }); }
        log({ t: 'china', side: opp, up: false, why: 'played' });
        yield* lesson('china');
        return;
      }
      place(id, evented && a.how !== 'space');
    }

    /* Quagmire / Bear Trap: discard a 2+ Ops card and roll 1-4 to get out. */
    function* stuckRound(side) {
      const key = side === 'US' ? 'quag' : 'bear', name = side === 'US' ? 'Quagmire' : 'Bear Trap';
      const ok = g.hand[side].filter(x => !D.CARD[x].score && opsOf(side, x) >= 2);
      /* A scoring card may always be played instead (MANIFEST.decisions):
         otherwise a trapped player holding one would lose by the rules alone. */
      const sc = g.hand[side].filter(x => D.CARD[x].score);
      if (ok.length) {
        const opts = ok.map(x => ({ id: String(x), card: x, label: 'Discard ' + D.CARD[x].name, sub: opsOf(side, x) + ' Ops' }))
          .concat(sc.map(x => ({ id: 'play:' + x, card: x, label: 'Play ' + D.CARD[x].name, sub: 'instead of trying to get out' })));
        const id = yield* pick(side, 'stuck', name + ': discard a card worth 2+ Ops, then roll 1-4 to get out' + (sc.length ? ', or play a scoring card.' : '.'), opts, { always: true, card: side === 'US' ? 42 : 44, pub: name + ': choosing a card to discard' });
        if (/^play:/.test(id)) { yield* doPlay(side, { t: 'play', card: +id.slice(5), how: 'event' }); return; }
        const x = +id;
        fromHand(side, x); settle(x, false);
        log({ t: 'discard', side, card: x, why: name });
        const r = 1 + Math.floor(rand() * 6);
        yield* hold({ k: 'die', what: 'stuck', why: SN(side) + ' tries to escape ' + name, side, rolls: [{ side, r }], need: 4 });
        const out = r <= 4;
        log({ t: 'stuck', side, r, out, name });
        if (out) g.fx[key] = false;
        return;
      }
      if (sc.length) {
        const opts = sc.map(x => ({ id: String(x), card: x, label: D.CARD[x].name }));
        const id = yield* pick(side, 'stuck', name + ': no card worth 2 Ops — play a scoring card.', opts, { always: true, pub: name + ': playing a scoring card' });
        yield* doPlay(side, { t: 'play', card: +id, how: 'event' });
        return;
      }
      log({ t: 'pass', side, why: name });
    }

    function* actionRound(side) {
      g.cur = side; g.phasing = side;
      const k = g.fx[side === 'US' ? 'quag' : 'bear'];
      if (k) {
        if (side === 'US' && g.tfx.wwby) { g.tfx.wwby = false; addVP('SU', 3, 'We Will Bury You'); }
        yield* stuckRound(side);
        return;
      }
      if (!g.hand[side].length && !(g.china === side && g.chinaUp)) {
        log({ t: 'pass', side, why: 'empty hand' });
        if (side === 'US' && g.tfx.wwby) { g.tfx.wwby = false; addVP('SU', 3, 'We Will Bury You'); }
        return;
      }
      for (;;) {
        const a = yield* ask(side, { t: 'turn', what: 'turn', why: 'Action round ' + g.ar + ': play a card', pub: 'choosing a card' });
        if (a.t === 'defuse') {
          remInf(side, a.id, 2, 'defusing the crisis');
          g.tfx.cmc = null;
          log({ t: 'defuse', side, c: a.id });
          continue;
        }
        yield* doPlay(side, a);
        return;
      }
    }

    /* ================================================================
       The headline
       ================================================================ */
    function* headline() {
      g.phase = 'headline';
      const pickable = s => g.hand[s].filter(x => x !== 32);
      const opts = s => pickable(s).map(x => ({ id: String(x), card: x, label: D.CARD[x].name, sub: (D.CARD[x].side === 'N' ? 'both' : D.SIDE[D.CARD[x].side].name) + ' · ' + D.CARD[x].ops + ' Ops' }));
      const ask2 = s => ({ t: 'pick', what: 'headline', why: 'Choose your headline: its event happens, whoever it belongs to.', pub: 'choosing a headline', options: opts(s), multi: false, min: 1, max: 1, n: ++g.pn, seat: bySide(s).id, secret: true });
      g.head = { US: null, SU: null, first: null, shown: false };
      const sides = D.SIDES.filter(s => pickable(s).length);
      /* Man in Earth Orbit: the other side chooses first and shows it. */
      const adv = D.SIDES.find(s => hasAdv(s, 4));
      if (adv && sides.length === 2) {
        const o = other(adv);
        const a1 = yield { ask: [ask2(o)] };
        g.head[o] = +a1.id; g.head.first = o;
        log({ t: 'headfirst', side: o, card: g.head[o] });
        const a2 = yield { ask: [ask2(adv)] };
        g.head[adv] = +a2.id;
      } else if (sides.length) {
        const ans = yield { ask: sides.map(ask2), all: true };
        sides.forEach(s => { g.head[s] = +ans[bySide(s).id].id; });
      }
      sides.forEach(s => fromHand(s, g.head[s]));
      g.head.shown = true;
      log({ t: 'headline', US: g.head.US, SU: g.head.SU });
      yield* hold({ k: 'headline', US: g.head.US, SU: g.head.SU });
      let cancelled = null;
      if (g.head.US === 103 && g.head.SU != null) {
        cancelled = g.head.SU;
        log({ t: 'defectors', card: cancelled });
        settle(cancelled, false);
      }
      const order = sides.filter(s => g.head[s] != null && g.head[s] !== cancelled)
        .sort((a, b) => (D.CARD[g.head[b]].ops - D.CARD[g.head[a]].ops) || (a === 'US' ? -1 : 1));
      for (const s of order) {
        const id = g.head[s];
        g.phasing = s;
        const ok = yield* runEvent(id, evSide(id, s), { by: s, how: 'headline' });
        place(id, ok);
      }
      g.head = null;
    }

    /* ================================================================
       The end of a turn, and of the game
       ================================================================ */
    function* endTurn() {
      g.phase = 'end'; g.cur = null; g.ar = 0;
      const before = g.vp;
      const short = {};
      for (const s of D.SIDES) {
        const need = g.defcon - g.mil[s];
        short[s] = Math.max(0, need);
      }
      log({ t: 'milcheck', mil: Object.assign({}, g.mil), defcon: g.defcon, short });
      /* Held scoring cards lose the game. */
      const held = D.SIDES.filter(s => g.hand[s].some(x => D.CARD[x].score));
      if (held.length === 2) finish(null, 'scoring', { held });
      if (held.length === 1) finish(other(held[0]), 'scoring', { held });
      for (const s of D.SIDES) if (short[s]) addVP(other(s), short[s], 'military operations');
      for (const s of D.SIDES) if (hasAdv(s, 6) && g.hand[s].length) {
        const opts = g.hand[s].map(x => ({ id: String(x), card: x, label: D.CARD[x].name }));
        const id = yield* pick(s, 'eagle', D.SPACE[6].name + ': discard one held card?', opts, { skip: 'Keep them all', always: true, pub: 'deciding whether to discard a held card' });
        if (id != null) { const x = +id; fromHand(s, x); settle(x, false); log({ t: 'discard', side: s, card: x, why: D.SPACE[6].name }); }
      }
      yield* lesson('milops');
      yield* hold({ k: 'turnEnd', turn: g.turn, mil: Object.assign({}, g.mil), short, defcon: g.defcon, vpBefore: before, vp: g.vp });
      if (g.china && !g.chinaUp) { g.chinaUp = true; log({ t: 'china', side: g.china, up: true, why: 'turn end' }); }
      g.mil = { US: 0, SU: 0 };
      g.spaceN = { US: 0, SU: 0 };
      g.tfx = {};
    }
    function* finalScoring() {
      g.phase = 'final';
      g.finalScoring = true;
      const before = g.vp;
      const rows = [];
      for (const r of D.REGIONS) {
        const res = D.scoreRegion(g.inf, r, { taiwanBg: g.fx.formosan });
        rows.push({ r, us: res.US, su: res.SU, net: res.net, lv: res.lv, euroWin: res.euroWin });
        log({ t: 'score', r, us: res.US, su: res.SU, net: res.net, lv: res.lv, final: true });
        if (res.euroWin) { yield* hold({ k: 'final', rows, china: null, vpBefore: before }); finish(res.euroWin, 'europe', { final: true }); }
        if (res.net) addVP(res.net > 0 ? 'US' : 'SU', Math.abs(res.net), D.REGION[r].name);
      }
      const holder = g.china;
      if (holder) addVP(holder, 1, 'the China Card');
      yield* hold({ k: 'final', rows, china: holder, vpBefore: before, vp: g.vp });
      finish(g.vp > 0 ? 'US' : g.vp < 0 ? 'SU' : null, 'final');
    }
    function finish(winner, how, extra) {
      g.phase = 'over';
      g.prompts = []; g.hold = null;
      const rows = g.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, side: p.side, won: p.side === winner,
        bg: D.COUNTRIES.filter(c => C[c].bg && ctrl(c) === p.side).length, countries: D.COUNTRIES.filter(c => ctrl(c) === p.side).length }));
      const w = winner ? bySide(winner) : null;
      g.result = { winner: w ? w.id : null, side: winner, name: w ? w.name : null, how, vp: g.vp, turn: g.turn, defcon: g.defcon, rows, extra: extra || null };
      log({ t: 'over', side: winner, how, vp: g.vp, extra: extra || null });
      throw OVER;
    }

    /* ================================================================
       The game
       ================================================================ */
    g.main = function* () {
      const use = id => !D.CARD[id].opt || g.opts.optional;
      const era = e => D.CARDS.filter(id => D.CARD[id].era === e && id !== CHINA);
      g.aside = D.CARDS.filter(id => D.CARD[id].opt && !g.opts.optional);
      g.deck = shuffle(era('E').filter(use), rand);
      g.later.M = era('M').filter(use);
      g.later.L = era('L').filter(use);
      for (const s of D.SIDES) for (const c of Object.keys(D.SETUP[s])) g.inf[c][s] = D.SETUP[s][c];
      log({ t: 'setup' });
      yield* lesson('welcome');
      yield* lesson('control');
      g.turn = 1;
      for (const s of D.SIDES) while (g.hand[s].length < R.hand(1)) { const c = drawCard(); if (c == null) break; g.hand[s].push(c); }
      log({ t: 'deal', turn: 1, n: { US: g.hand.US.length, SU: g.hand.SU.length } });
      /* The open setup: the USSR first, in Eastern Europe; then the USA. */
      for (const s of D.SIDES) {
        const f = D.SETUP.free[s];
        g.phasing = s;
        const m = yield* alloc(s, 'setup', 'Set up: place ' + f.n + ' influence anywhere in ' + D.SUBS[f.where] + '.', D.inReg(f.where).map(c => cOpt(c, { cap: f.n })), f.n, { must: true, act: 'add', who: s, pub: 'placing ' + f.n + ' starting influence' });
        for (const c of Object.keys(m)) addInf(s, c, m[c], 'setup');
      }
      for (let t = 1; t <= R.turns; t++) {
        g.turn = t; g.ar = 0; g.cur = null; g.phasing = null;
        if (t > 1) {
          g.phase = 'deal';
          if (g.defcon < 5) yield* defconMove(1, 'a new turn');
          if (t === R.midTurn) { g.deck = shuffle(g.deck.concat(g.later.M), rand); log({ t: 'era', era: 'M', n: g.later.M.length }); g.later.M = []; }
          if (t === R.lateTurn) { g.deck = shuffle(g.deck.concat(g.later.L), rand); log({ t: 'era', era: 'L', n: g.later.L.length }); g.later.L = []; }
          for (let k = 0; k < 2 * R.hand(t); k++) for (const s of D.SIDES) if (g.hand[s].length < R.hand(t)) { const c = drawCard(); if (c != null) g.hand[s].push(c); }
          log({ t: 'deal', turn: t, n: { US: g.hand.US.length, SU: g.hand.SU.length } });
        }
        yield* hold({ k: 'turnStart', turn: t, defcon: g.defcon, vp: g.vp, rounds: R.rounds(t) });
        if (t === 1) { yield* lesson('cards'); yield* lesson('headline'); }
        if (t === R.midTurn) yield* lesson('midwar');
        yield* headline();
        g.phase = 'ar';
        const n = R.rounds(t);
        for (let ar = 1; ar <= n; ar++) {
          if (ar === 1 && t === 1) { g.ar = 1; yield* lesson('ops'); }
          g.ar = ar;
          for (const s of D.SIDES) yield* actionRound(s);
        }
        /* The eighth round: Space Station, or North Sea Oil for the USA. */
        const extra = D.SIDES.filter(s => hasAdv(s, 8) || (s === 'US' && g.tfx.nso8));
        if (extra.length) {
          g.ar = n + 1; g.extra = true;
          for (const s of extra) yield* actionRound(s);
          g.extra = false;
        }
        yield* endTurn();
        if (t === TEACH_TURNS) yield* lesson('done');
      }
      yield* finalScoring();
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
    function checkAlloc(pr, a, side) {
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
        if (v > o.cap) return no('At most ' + o.cap + ' in ' + o.label + '.');
        m[k] = v; tot += v;
      }
      if (pr.what === 'inf') {
        const cost = D.placeCost(g.inf, side, m);
        const can = pr.budget + D.bonusFor(pr.bonus, Object.keys(m));
        if (cost > can) return no('That costs ' + cost + ' Ops; you have ' + can + '.');
        return yes({ a: { t: 'alloc', map: m } });
      }
      if (tot > pr.total) return no('At most ' + pr.total + ' in all.');
      if (tot < pr.min) return no(pr.min === pr.total ? 'Place all ' + pr.total + '.' : 'At least ' + pr.min + '.');
      return yes({ a: { t: 'alloc', map: m } });
    }
    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The Cold War is over.');
      if (g.hold) return no('Watch the telly first.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const mine = g.prompts.filter(pr => pr.seat === seatId);
      if (!mine.length) return no('It is not your turn.');
      const pr = a.n != null ? mine.find(x => x.n === +a.n) : (mine.length === 1 ? mine[0] : null);
      if (!pr) return no('That question has moved on.');
      let r;
      if (pr.t === 'turn') r = turnCheck(p.side, a, pr);
      else if (pr.t === 'alloc') r = checkAlloc(pr, a, p.side);
      else r = checkPick(pr, a);
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
      const h = g.head;
      return {
        v: VERSION, teach: g.opts.teach, phase: g.phase, turn: g.turn, ar: g.ar, rounds: g.turn ? R.rounds(g.turn) : 0, cur: g.cur, active: g.activeId(), extra: !!g.extra,
        inf: clone(g.inf), defcon: g.defcon, vp: g.vp, mil: Object.assign({}, g.mil), space: Object.assign({}, g.space), spaceN: Object.assign({}, g.spaceN),
        handN: { US: g.hand.US.length, SU: g.hand.SU.length }, deckN: g.deck.length, disc: g.disc.slice(), gone: g.gone.slice(), table: g.table.slice(),
        laterN: { M: g.later.M.length, L: g.later.L.length }, optional: g.opts.optional,
        china: g.china, chinaUp: g.chinaUp, fx: clone(g.fx), tfx: clone(g.tfx),
        head: h ? { chosen: { US: h.US != null || !!g.answers[bySide('US').id], SU: h.SU != null || !!g.answers[bySide('SU').id] }, first: h.first, firstCard: h.first ? h[h.first] : null, US: h.shown ? h.US : null, SU: h.shown ? h.SU : null } : null,
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
      const sees = s === 'US' ? g.tfx.seeSU : g.tfx.seeUS;
      return { id, side: s, v: VERSION, hand: g.hand[s].slice(),
        seen: sees ? g.hand[other(s)].slice() : null,
        myHead: g.head && g.head[s] != null && !g.head.shown ? g.head[s] : null,
        prompts,
        can: turnPr && !g.hold ? Object.assign({ n: turnPr.n }, menu(s, turnPr.only != null ? turnPr.only : null)) : null };
    };
    /* For the tests: every card is somewhere, exactly once. */
    g.census = function () {
      const seen = {};
      const note = (c, w) => { (seen[c] = seen[c] || []).push(w); };
      D.SIDES.forEach(s => g.hand[s].forEach(c => note(c, s + ':hand')));
      g.deck.forEach(c => note(c, 'deck'));
      g.disc.forEach(c => note(c, 'disc'));
      g.gone.forEach(c => note(c, 'gone'));
      g.table.forEach(c => note(c, 'table'));
      g.limbo.forEach(c => note(c, 'limbo'));
      g.aside.forEach(c => note(c, 'aside'));
      g.later.M.forEach(c => note(c, 'later'));
      g.later.L.forEach(c => note(c, 'later'));
      if (g.china) note(CHINA, 'china:' + g.china);
      return seen;
    };
  }

  const Engine = { VERSION, LEVELS, TABLE_HOLDS, LESSONS, TEACH_TURNS, create, rngFrom, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.TSEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
