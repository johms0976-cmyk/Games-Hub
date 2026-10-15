'use strict';
/* Gwent — the rules. No DOM, no timers, one seeded rng.
 *
 * The display holds the one Game; every order — from a phone, a house player
 * or a test — goes through `g.act(seatId, answer)`, which refuses with a
 * reason rather than a bare false.
 *
 * **The game is one generator** (the Radlands pattern). `main()` takes the
 * decks, deals, plays round after round; a turn, a card's ability and a
 * leader's ability are generators too, and every question is a `yield`:
 *
 *   g.prompts   the questions open right now — the active player's turn, a
 *               choice inside an ability (a medic's pick, a row), or both
 *               players at once (the decks, the redraws).
 *   g.hold      decide, hold, show, then apply: the start and the end of
 *               every round (the table reads them), and every Scorch before
 *               its victims burn. Only when the telly is showing the game
 *               (`opts.show`); a test proves seeded games end identically
 *               with it on and off.
 *
 * Generators cannot be copied, so undo is by replay (the telly keeps the
 * answers), never by snapshot.
 *
 * **What is secret:** each hand; each deck (its order, and what is in it);
 * the faction, leader and deck a player is choosing until both have chosen;
 * the three cards Emhyr, Emperor of Nilfgaard shows his player. The board,
 * the weather, both discard piles, hand and deck sizes and the gems are
 * public — Gwent is played face up apart from the hands.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gw-data.js') : root.GwentData;

  const VERSION = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const OVER = { over: true };
  /* The holds the whole table reads (Continue on every phone) and the ones
     the telly shows for a moment and lets go. */
  const TABLE_HOLDS = { roundStart: 1, roundEnd: 1, phase: 1 };

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
  const C = id => D.card(id);

  /* ================================================================
     Building a game
     opts.players: [{ id, name, hex, bot, level, fac?, leader?, cards? }] — two.
     A player given fac/leader/cards (the house; a "quick decks" lobby) is
     not asked for a deck. A given card may be { id, up } — a card honed in
     the single-player run (gw-run.js), `up` points stronger.
     x.mods: the run's trinkets and enemy rules, per player (gw-run.js).
     The hub game never sets either, so it plays exactly as before.
     ================================================================ */
  /* weak: every row of yours at −n; minusRows: [close, ranged, siege] at −n;
     noLeader: your leader is silent; phase: a boss's second phase (PHASES). */
  const MOD_DEFAULT = { hand: 0, redraws: 0, gems: 2, winDraw: 0, tieWin: false, keep: false, halfWeather: false, spyDraw: 0, roundDraw: 0, leaderUses: 1, start: [],
    weak: 0, minusRows: [0, 0, 0], noLeader: false, phase: null };
  const PHASES = ['whiteFrost', 'crones', 'edict', 'ambush', 'rage', 'levy'];
  function modsOf(m) {
    const o = Object.assign({}, MOD_DEFAULT, m || {});
    o.start = Array.isArray(o.start) ? o.start.slice() : [];
    o.gems = Math.max(1, Math.min(4, o.gems | 0));
    o.leaderUses = Math.max(1, o.leaderUses | 0);
    o.minusRows = [0, 1, 2].map(r => Math.max(0, ((o.minusRows || [])[r] | 0)));
    o.weak = Math.max(0, o.weak | 0);
    if (PHASES.indexOf(o.phase) < 0) o.phase = null;
    return o;
  }
  function create(opts) {
    opts = opts || {};
    const list = opts.players || [];
    if (list.length !== 2) throw new Error('Gwent is for two players');
    const seed = opts.seed == null ? Date.now() : opts.seed;
    const g = {
      VERSION, seed, rng: rngFrom(seed), rngN: 0, drawN: 0,
      opts: { show: !!opts.show },
      phase: 'deck', round: 0, cur: null, starter: null, lastWinner: null,
      board: D.emptyBoard(), wxCards: [],
      log: [], prompts: [], pn: 0, waitAll: false, answers: {},
      hold: null, holdN: 0, actN: 0, uidN: 0, limbo: [], locks: [false, false, false],
      history: [], result: null
    };
    g.players = list.map((x, i) => ({
      id: x.id, name: x.name, hex: x.hex || '#d9b04a', bot: !!x.bot, i,
      level: x.bot ? (LEVELS.indexOf(x.level) >= 0 ? x.level : 'medium') : null,
      given: x.fac ? { fac: x.fac, leader: x.leader || D.HOUSE_LEADER[x.fac], cards: (x.cards || D.STANDARD[x.fac]).slice() } : null,
      mods: modsOf(x.mods), modded: !!x.mods, leaderN: 0, phaseN: 0,
      fac: null, leader: null, leaderUsed: false, deck: [], hand: [], disc: [], gems: modsOf(x.mods).gems, passed: false, wins: 0, seen: null, deckSize: 0
    }));
    attach(g);
    g.gen = g.main();
    g.advance();
    return g;
  }

  function attach(g) {
    const P = id => g.players.find(p => p.id === id) || null;
    const opp = p => g.players[1 - p.i];
    const rand = () => { g.rngN++; return g.rng(); };
    const log = e => { g.log.push(Object.assign({ r: g.round }, e)); return e; };
    const uid = () => 'k' + (++g.uidN);
    const B = () => g.board;

    g.seat = P;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.activeId = () => g.phase !== 'play' || g.cur == null ? null : g.players[g.cur].id;
    g.note = e => log(e);

    /* ---------------- the leaders ---------------- */
    const cancelled = p => { const q = opp(p); return (q.leader === 'emhyr_whiteflame' && p.leader !== null) || (!!p.leader && p.mods.noLeader); };
    const leaderLive = (p, ab) => !!p.leader && D.LEADER[p.leader].ab === ab && !cancelled(p);
    const invader = () => g.players.some(p => leaderLive(p, 'randomRevive'));
    function refreshPassives() {
      B().spies2 = g.players.some(p => leaderLive(p, 'spies2'));
      B().half = g.players.map(p => leaderLive(p, 'halfWeather') || p.mods.halfWeather);
      baseMinus();
    }
    /* The standing row penalties (the run's Weakened and cursed trinkets). */
    function baseMinus() { B().minus = g.players.map(p => [0, 1, 2].map(r => p.mods.weak + p.mods.minusRows[r])); }
    /* The skies after a Clear: the White Frost does not lift. */
    const clearSkies = () => g.locks.slice();
    const clearable = () => B().wx.some((w, r) => w && !g.locks[r]);

    /* ---------------- cards moving ---------------- */
    const inst = (id, k, up) => { const c = { uid: uid(), id, k: k || 0 }; if (up) c.up = up; return c; };
    function draw(p, n, why) {
      const got = [];
      for (let j = 0; j < n && p.deck.length; j++) { const c = p.deck.pop(); p.hand.push(c); got.push(c); g.drawN++; }
      if (got.length) log({ t: 'draw', by: p.id, n: got.length, why: why || null });
      return got;
    }
    const takeFromHand = (p, u) => { const i = p.hand.findIndex(c => c.uid === u); return i < 0 ? null : p.hand.splice(i, 1)[0]; };
    function findOnBoard(u) {
      for (let s = 0; s < 2; s++) for (let r = 0; r < 3; r++) {
        const row = B().sides[s].rows[r];
        const i = row.units.findIndex(x => x.uid === u);
        if (i >= 0) return { s, r, i, unit: row.units[i] };
      }
      return null;
    }
    /* One door for every unit leaving the board: it goes to the discard pile
       of the side it was on. */
    function kill(s, r, unit, by, how) {
      const row = B().sides[s].rows[r];
      const i = row.units.indexOf(unit);
      if (i < 0) return;
      row.units.splice(i, 1);
      g.players[s].disc.push(unit);
      log({ t: 'burn', by: by ? by.id : null, of: g.players[s].id, card: unit.id, row: r, how: how || 'scorch' });
      avenge(s, unit);
    }
    /* Summon Avenger (Kambi): when it leaves the board, a new unit — never in
       any deck — takes its place, in its own row. */
    function avenge(s, unit) {
      const def = C(unit.id);
      if (!def || !def.avenger) return;
      const t = inst(def.avenger, 0);
      const r = C(t.id).rows[0];
      B().sides[s].rows[r].units.push(t);
      log({ t: 'summon', by: g.players[s].id, card: t.id, from: unit.id, row: r });
    }
    /* Mardroeme: every Berserker in this row turns into its bear (same card
       on the table, new face). */
    function transformRow(s, r, by) {
      for (const u of B().sides[s].rows[r].units) {
        const def = C(u.id);
        if (!def || def.ab !== 'berserk') continue;
        const from = u.id;
        u.id = def.into;
        log({ t: 'transform', by: by.id, card: u.id, from, row: r });
      }
    }

    /* ================================================================
       Asking
       ================================================================ */
    function* ask(p, pr) {
      pr = Object.assign({}, pr, { n: ++g.pn, seat: p.id });
      const a = yield { ask: [pr] };
      return a;
    }
    /* A pick. A question with one legal answer answers itself (unless
       `always`); with none it is not asked. */
    function* pick(p, what, why, options, o) {
      o = o || {};
      const legal = options.filter(x => !x.bad);
      if (!o.multi) {
        if (!legal.length) return null;
        if (legal.length === 1 && !o.skip && !o.always) return legal[0].id;
      } else if (!legal.length) return [];
      const a = yield* ask(p, { t: 'pick', what, why, pub: o.pub || null, options, multi: !!o.multi,
        min: o.multi ? (o.min || 0) : 1, max: o.multi ? Math.min(o.max == null ? legal.length : o.max, legal.length) : 1, skip: o.skip || null });
      if (a.t === 'skip') return o.multi ? [] : null;
      return o.multi ? a.ids.slice() : a.id;
    }
    function* hold(h) { yield { hold: h }; }
    /* A honed copy (The Path) says so, so a pick from a discard pile shows its real strength. */
    const cardOpt = (c, extra) => Object.assign({ id: c.uid, card: c.id, label: D.nameOf(c.id) }, c.up ? { up: c.up } : null, extra || {});

    /* ================================================================
       Units entering the board
       ================================================================ */
    /* Where a unit may go: its row, or either for Agile. A spy goes to the
       opponent's side. */
    const rowsFor = id => C(id).rows.slice();
    function* askRow(p, c, why) {
      const rows = rowsFor(c.id);
      if (rows.length === 1) return rows[0];
      const spy = C(c.id).ab === 'spy';
      const side = spy ? opp(p).i : p.i;
      const opts = rows.map(r => ({ id: String(r), label: D.ROW_NAME[r], row: r, delta: previewUnit(p, c.id, side, r, c.up) }));
      const id = yield* pick(p, 'row', why || 'Which row for ' + D.nameOf(c.id) + '?', opts, { always: true, pub: 'choosing a row' });
      return +id;
    }
    function* enterUnit(p, c, r, how) {
      const def = C(c.id);
      const side = def.ab === 'spy' ? opp(p) : p;
      B().sides[side.i].rows[r].units.push(c);
      log({ t: 'enter', by: p.id, card: c.id, row: r, side: side.id, how: how || 'play' });
      if (def.ab === 'spy') draw(p, 2 + p.mods.spyDraw, 'spy');
      if (def.ab === 'muster') {
        const mates = p.deck.filter(x => C(x.id).group === def.group);
        for (const m of mates) {
          p.deck.splice(p.deck.indexOf(m), 1);
          const mr = C(m.id).rows[0];
          B().sides[p.i].rows[mr].units.push(m);
          log({ t: 'enter', by: p.id, card: m.id, row: mr, side: p.id, how: 'muster' });
        }
      }
      if (def.ab === 'summon') {
        /* Cerys: the Shield Maidens come from the deck and the hand. */
        const mates = p.deck.filter(x => x.id === def.calls).concat(p.hand.filter(x => x.id === def.calls));
        for (const m of mates) {
          const from = p.deck.indexOf(m) >= 0 ? p.deck : p.hand;
          from.splice(from.indexOf(m), 1);
          const mr = C(m.id).rows[0];
          B().sides[p.i].rows[mr].units.push(m);
          log({ t: 'enter', by: p.id, card: m.id, row: mr, side: p.id, how: 'muster' });
        }
      }
      if (def.ab === 'mardroeme' || (def.ab === 'berserk' && D.mardOn(B().sides[side.i].rows[r]))) transformRow(side.i, r, p);
      if (def.ab === 'medic') yield* revive(p);
      if (def.ab === 'scorch') yield* rowScorch(p, opp(p), def.rows[0], 10, { card: c.id });
      if (def.ab === 'scorchAll') yield* scorchAll(p, c.id);
    }
    /* The whole-board Scorch: the special card, and the Clan Dimun Pirate. */
    function* scorchAll(p, card) {
      const vs = D.scorchVictims(B());
      if (vs.length) yield* hold({ k: 'scorch', by: p.id, card, victims: vs.map(x => ({ s: x.s, r: x.r, uid: x.u.uid, id: x.u.id, v: x.v })) });
      log({ t: 'scorch', by: p.id, n: vs.length, card });
      for (const x of vs) kill(x.s, x.r, x.u, p, 'scorch');
    }
    /* A medic: one unit from your discard pile, played at once — chosen, or
       at random while Emhyr, Invader of the North is in play. */
    function* revive(p) {
      const list = p.disc.filter(x => C(x.id).kind === 'unit' && !C(x.id).hero);
      if (!list.length) { log({ t: 'revive', by: p.id, card: null }); return; }
      let c;
      if (invader()) c = list[Math.floor(rand() * list.length)];
      else {
        const opts = list.map(x => cardOpt(x, { sub: Math.max(0, C(x.id).str + (x.up || 0)) + ' strength · ' + D.ROW_SHORT[C(x.id).rows[0]] + (C(x.id).agile ? ' or Ranged' : '') }));
        const id = yield* pick(p, 'revive', 'Medic: bring which unit back from your discard pile?', opts, { skip: 'Nobody', pub: 'choosing a unit to bring back' });
        if (!id) { log({ t: 'revive', by: p.id, card: null, skipped: true }); return; }
        c = list.find(x => x.uid === id);
      }
      p.disc.splice(p.disc.indexOf(c), 1);
      g.limbo.push(c);
      log({ t: 'revive', by: p.id, card: c.id, random: invader() || null });
      const r = yield* askRow(p, c, 'Which row for ' + D.nameOf(c.id) + '?');
      g.limbo.splice(g.limbo.indexOf(c), 1);
      yield* enterUnit(p, c, r, 'revive');
    }
    /* Row scorch: the strongest non-hero units of one of q's rows, if the row
       adds up to `min` or more. Shown on the telly before they burn. */
    function* rowScorch(p, q, r, min, why) {
      const vs = D.rowScorchVictims(B(), q.i, r, min);
      if (!vs.length) { log({ t: 'fizzle', by: p.id, of: q.id, row: r, total: D.rowTotal(B(), q.i, r), min }); return; }
      yield* hold({ k: 'scorch', by: p.id, row: r, of: q.id, card: why.card || null, leader: why.leader || null,
        victims: vs.map(x => ({ s: x.s, r: x.r, uid: x.u.uid, id: x.u.id, v: x.v })) });
      for (const x of vs) kill(x.s, x.r, x.u, p, why.leader ? 'leader' : 'rowscorch');
    }

    /* ================================================================
       Special cards
       ================================================================ */
    function* playWeather(p, c) {
      const rows = C(c.id).rows;
      if (rows.every(r => B().wx[r])) { p.disc.push(c); log({ t: 'weather', by: p.id, card: c.id, row: rows[0], rows, wasted: true }); return; }
      rows.forEach(r => { B().wx[r] = true; });
      g.wxCards.push({ c, s: p.i });
      log({ t: 'weather', by: p.id, card: c.id, row: rows[0], rows });
    }
    function clearWeather(p, c, how) {
      for (const w of g.wxCards) g.players[w.s].disc.push(w.c);
      g.wxCards = [];
      B().wx = clearSkies();
      if (c) p.disc.push(c);
      log({ t: 'clear', by: p.id, how: how || 'card' });
    }
    function* playSpecial(p, c, a) {
      const sp = C(c.id).sp;
      if (C(c.id).weather) return yield* playWeather(p, c);
      if (sp === 'clear') return clearWeather(p, c);
      if (sp === 'horn') {
        const row = B().sides[p.i].rows[a.row];
        row.horn = c;
        log({ t: 'horn', by: p.id, row: a.row });
        return;
      }
      if (sp === 'mardroeme') {
        B().sides[p.i].rows[a.row].horn = c;
        log({ t: 'mardroeme', by: p.id, row: a.row });
        transformRow(p.i, a.row, p);
        return;
      }
      if (sp === 'decoy') {
        const f = findOnBoard(a.target);
        const row = B().sides[f.s].rows[f.r];
        row.units[f.i] = c;
        p.hand.push(f.unit);
        log({ t: 'decoy', by: p.id, card: f.unit.id, row: f.r });
        return;
      }
      if (sp === 'scorch') {
        g.limbo.push(c);
        yield* scorchAll(p, 'sp_scorch');
        g.limbo.splice(g.limbo.indexOf(c), 1);
        p.disc.push(c);
      }
    }

    /* ================================================================
       Leader abilities (the twelve that are used; four are always on)
       ================================================================ */
    const deckWeather = (p, sp) => p.deck.filter(x => C(x.id).kind === 'special' && C(x.id).weather && (!sp || C(x.id).sp === sp));
    function leaderNeed(p) {
      const L = p.leader && D.LEADER[p.leader];
      if (!L) return 'No leader.';
      if (L.passive) return 'Always on.';
      if (cancelled(p)) return p.mods.noLeader ? 'Leaderless: your leader is silent this run.' : 'Emhyr, the White Flame cancels it.';
      if (p.leaderUsed) return p.mods.leaderUses > 1 ? 'Used ' + p.leaderN + ' times this game.' : 'Already used this game.';
      const q = opp(p);
      switch (L.ab) {
        case 'swap21': return p.hand.length < 2 ? 'You need two cards in hand to discard.' : (!p.deck.length ? 'Your deck is empty.' : null);
        case 'anyWeather': return deckWeather(p).length ? null : 'No weather card left in your deck.';
        case 'restoreHand': return p.disc.length ? null : 'Your discard pile is empty.';
        case 'horn0': case 'horn1': case 'horn2': { const r = +L.ab.slice(4); return D.hornOn(B().sides[p.i].rows[r]) ? 'A horn is already on your ' + D.ROW_NAME[r] + ' row.' : null; }
        case 'peek3': return q.hand.length ? null : q.name + ' has no cards in hand.';
        case 'rain': return deckWeather(p, 'rain').length ? null : 'No Torrential Rain left in your deck.';
        case 'fog': return deckWeather(p, 'fog').length ? null : 'No Impenetrable Fog left in your deck.';
        case 'frost': return deckWeather(p, 'frost').length ? null : 'No Biting Frost left in your deck.';
        case 'stealDiscard': return q.disc.length ? null : q.name + '’s discard pile is empty.';
        case 'clear': return clearable() ? null : g.locks.some(Boolean) ? 'The White Frost cannot be cleared.' : 'There is no weather to clear.';
        case 'burn1': return D.rowScorchVictims(B(), q.i, 1, 0).length ? null : q.name + ' has nothing in the Ranged row to destroy.';
        case 'burn2at10': return D.rowScorchVictims(B(), q.i, 2, 10).length ? null : q.name + '’s Siege row adds up to less than 10.';
        case 'burn0at10': return D.rowScorchVictims(B(), q.i, 0, 10).length ? null : q.name + '’s Close Combat row adds up to less than 10.';
        case 'agileBest': return agileMoves(p).length ? null : 'None of your Agile units would be stronger in its other row.';
        case 'shuffleBack': return g.players.some(x => x.disc.some(c => !C(c.id).token)) ? null : 'Both discard piles are empty.';
      }
      return 'Not yet.';
    }
    function agileMoves(p) {
      const out = [];
      for (const r of [0, 1]) for (const u of B().sides[p.i].rows[r].units.slice()) {
        if (!C(u.id) || !C(u.id).agile) continue;
        const row = B().sides[p.i].rows[r];
        const at = row.units.indexOf(u);
        row.units.splice(at, 1);
        const best = D.agileBest(B(), p.i, u, r);
        row.units.splice(at, 0, u);
        if (best !== r) out.push({ u, from: r, to: best });
      }
      return out;
    }
    function* useLeader(p) {
      const L = D.LEADER[p.leader];
      const q = opp(p);
      p.leaderN++;
      p.leaderUsed = p.leaderN >= p.mods.leaderUses;
      log({ t: 'leader', by: p.id, leader: p.leader, ab: L.ab });
      switch (L.ab) {
        case 'swap21': {
          const ids = p.hand.length === 2 ? p.hand.map(c => c.uid)
            : yield* pick(p, 'discard2', L.name + ': discard which two cards?', p.hand.map(c => cardOpt(c)), { multi: true, min: 2, max: 2, pub: 'choosing two cards to discard' });
          const gone = ids.map(u => takeFromHand(p, u));
          gone.forEach(c => p.disc.push(c));
          log({ t: 'discard', by: p.id, ids: gone.map(c => c.id) });
          const kinds = [];
          for (const c of p.deck) if (!kinds.some(k => k.card === c.id)) kinds.push({ id: c.uid, card: c.id, label: D.nameOf(c.id), sub: p.deck.filter(x => x.id === c.id).length + ' in your deck' });
          const got = yield* pick(p, 'fromDeck', 'Take which card from your deck?', kinds, { pub: 'choosing a card from their deck' });
          const c = p.deck.find(x => x.uid === got);
          p.deck.splice(p.deck.indexOf(c), 1);
          p.hand.push(c);
          g.drawN++;
          log({ t: 'tutor', by: p.id });
          return;
        }
        case 'anyWeather': case 'rain': case 'fog': case 'frost': {
          const list = deckWeather(p, L.ab === 'anyWeather' ? null : L.ab);
          const kinds = [];
          for (const c of list) if (!kinds.some(k => k.card === c.id)) kinds.push(cardOpt(c));
          const got = yield* pick(p, 'weatherDeck', 'Play which weather from your deck?', kinds, { pub: 'choosing a weather card' });
          const c = list.find(x => x.uid === got);
          p.deck.splice(p.deck.indexOf(c), 1);
          return yield* playWeather(p, c);
        }
        case 'restoreHand': {
          const got = yield* pick(p, 'restoreHand', 'Take which card back from your discard pile?', p.disc.map(c => cardOpt(c)), { pub: 'choosing a card from their discard pile' });
          const c = p.disc.find(x => x.uid === got);
          p.disc.splice(p.disc.indexOf(c), 1);
          p.hand.push(c);
          log({ t: 'restore', by: p.id, card: c.id });
          return;
        }
        case 'horn0': case 'horn1': case 'horn2': {
          const r = +L.ab.slice(4);
          B().sides[p.i].rows[r].lhorn = true;
          log({ t: 'horn', by: p.id, row: r, leader: true });
          return;
        }
        case 'peek3': {
          const pool = q.hand.slice();
          const seen = [];
          for (let k = 0; k < 3 && pool.length; k++) seen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
          p.seen = { round: g.round, of: q.id, ids: seen };
          log({ t: 'peek', by: p.id, of: q.id, n: seen.length });
          return;
        }
        case 'stealDiscard': {
          const got = yield* pick(p, 'steal', 'Take which card from ' + q.name + '’s discard pile?', q.disc.map(c => cardOpt(c)), { pub: 'choosing a card from ' + q.name + '’s discard pile' });
          const c = q.disc.find(x => x.uid === got);
          q.disc.splice(q.disc.indexOf(c), 1);
          p.hand.push(c);
          log({ t: 'steal', by: p.id, of: q.id, card: c.id });
          return;
        }
        case 'clear': return clearWeather(p, null, 'leader');
        case 'burn1': return yield* rowScorch(p, q, 1, 0, { leader: p.leader });
        case 'burn2at10': return yield* rowScorch(p, q, 2, 10, { leader: p.leader });
        case 'burn0at10': return yield* rowScorch(p, q, 0, 10, { leader: p.leader });
        case 'agileBest': {
          const moves = agileMoves(p);
          for (const m of moves) {
            const from = B().sides[p.i].rows[m.from].units;
            from.splice(from.indexOf(m.u), 1);
            B().sides[p.i].rows[m.to].units.push(m.u);
          }
          log({ t: 'agile', by: p.id, n: moves.length });
          return;
        }
        case 'shuffleBack': {
          /* Crach an Craite: both discard piles back into their decks, shuffled.
             A token (Hemdall) has no deck to go to and stays where it is. */
          const n = g.players.map(x => {
            const back = x.disc.filter(c => !C(c.id).token);
            x.disc = x.disc.filter(c => C(c.id).token);
            x.deck = shuffle(x.deck.concat(back), rand);
            return back.length;
          });
          log({ t: 'shuffle', by: p.id, n });
          return;
        }
      }
    }

    /* ================================================================
       The turn menu — one pure function, used by the phone, the house and
       the answer check alike, so nothing offered is ever refused.
       Each hand card lists every way it can be played, with what that does
       to the two totals right now (the phone shows it; the house scores it).
       ================================================================ */
    function totals() { return [D.sideTotal(B(), 0), D.sideTotal(B(), 1)]; }
    /* Try something on the real board and put it back exactly. */
    function trial(fn) {
      const real = g.board;
      const before = totals();
      let after;
      g.board = clone(real);
      try { fn(); after = totals(); } finally { g.board = real; }
      return [after[0] - before[0], after[1] - before[1]];
    }
    const pair = (p, d) => ({ me: d[p.i], them: d[1 - p.i] });
    function previewUnit(p, id, sideI, r, up) {
      return pair(p, trial(() => {
        const c = { uid: 'trial', id };
        if (up) c.up = up;
        B().sides[sideI].rows[r].units.push(c);
        const def = C(id);
        if (def.ab === 'muster') for (const m of p.deck.filter(x => C(x.id).group === def.group)) B().sides[p.i].rows[C(m.id).rows[0]].units.push({ uid: 't' + m.uid, id: m.id });
        if (def.ab === 'scorch') for (const v of D.rowScorchVictims(B(), 1 - p.i, def.rows[0], 10)) { const row = B().sides[v.s].rows[v.r]; row.units.splice(row.units.findIndex(x => x.uid === v.u.uid), 1); }
        if (def.ab === 'summon') for (const m of p.deck.concat(p.hand).filter(x => x.id === def.calls)) B().sides[p.i].rows[C(m.id).rows[0]].units.push({ uid: 't' + m.uid, id: m.id });
        if (def.ab === 'mardroeme' || (def.ab === 'berserk' && D.mardOn(B().sides[sideI].rows[r]))) previewTransform(sideI, r);
        if (def.ab === 'scorchAll') burnAll();
      }));
    }
    function previewTransform(s, r) { for (const u of B().sides[s].rows[r].units) { const d = C(u.id); if (d && d.ab === 'berserk') u.id = d.into; } }
    function burnAll() { for (const v of D.scorchVictims(B())) { const row = B().sides[v.s].rows[v.r]; row.units.splice(row.units.findIndex(x => x.uid === v.u.uid), 1); } }
    function playsOf(p, c) {
      const def = C(c.id);
      const q = opp(p);
      if (def.kind === 'unit') {
        const side = def.ab === 'spy' ? q.i : p.i;
        return def.rows.map(r => ({ key: c.uid + ':' + r, row: r, side: g.players[side].id, label: (def.ab === 'spy' ? q.name + '’s ' : 'Your ') + D.ROW_NAME[r] + ' row', delta: previewUnit(p, c.id, side, r, c.up) }));
      }
      const sp = def.sp;
      if (def.weather) {
        const rows = def.rows;
        return [{ key: c.uid, row: rows[0], label: 'Weather on every ' + rows.map(r => D.ROW_NAME[r]).join(' and ') + ' row' + (rows.every(r => B().wx[r]) ? ' (already there: it would do nothing)' : ''),
          delta: pair(p, trial(() => { rows.forEach(r => { B().wx[r] = true; }); })) }];
      }
      if (sp === 'mardroeme') return [0, 1, 2].filter(r => !B().sides[p.i].rows[r].horn).map(r => ({ key: c.uid + ':' + r, row: r,
        label: 'Your ' + D.ROW_NAME[r] + ' row' + (B().sides[p.i].rows[r].units.some(u => C(u.id).ab === 'berserk') ? '' : ' (no Berserker there yet)'),
        delta: pair(p, trial(() => { B().sides[p.i].rows[r].horn = { uid: 'trial', id: 'sp_mardroeme' }; previewTransform(p.i, r); })) }));
      if (sp === 'clear') return [{ key: c.uid, label: clearable() ? 'Clear the weather' + (g.locks.some(Boolean) ? ' (the White Frost stays)' : '') : g.locks.some(Boolean) ? 'Clear the weather (only the White Frost is here: it stays)' : 'Clear the weather (there is none)', delta: pair(p, trial(() => { B().wx = clearSkies(); })) }];
      if (sp === 'horn') return [0, 1, 2].filter(r => !B().sides[p.i].rows[r].horn).map(r => ({ key: c.uid + ':' + r, row: r, label: 'Your ' + D.ROW_NAME[r] + ' row' + (B().sides[p.i].rows[r].lhorn ? ' (your leader already doubles it)' : B().sides[p.i].rows[r].units.some(u => C(u.id).ab === 'horn') ? ' (Dandelion already doubles it)' : ''),
        delta: pair(p, trial(() => { B().sides[p.i].rows[r].horn = { uid: 'trial', id: 'sp_horn' }; })) }));
      if (sp === 'decoy') {
        const out = [];
        B().sides[p.i].rows.forEach((row, r) => row.units.forEach(u => {
          const d2 = C(u.id);
          if (!d2 || d2.hero || D.isDecoy(u)) return;
          out.push({ key: c.uid + ':' + u.uid, row: r, target: u.uid, card: u.id, label: D.nameOf(u.id) + ' (' + D.ROW_SHORT[r] + ')' + (d2.ab === 'spy' ? ' — a spy: it comes to your hand' : ''),
            delta: pair(p, trial(() => { const i = row.units.findIndex(x => x.uid === u.uid); B().sides[p.i].rows[r].units[i] = { uid: 'trial', id: 'sp_decoy' }; })) });
        }));
        return out;
      }
      if (sp === 'scorch') return [{ key: c.uid, label: 'Burn the strongest on the board', victims: D.scorchVictims(B()).map(v => ({ s: v.s, id: v.u.id, v: v.v })),
        delta: pair(p, trial(burnAll)) }];
      return [];
    }
    /* What a leader ability does to the two totals now, where it can be
       known before any choice (a horn, a burn, clearing, the Agile move). */
    function leaderPreview(p) {
      const ab = D.LEADER[p.leader].ab;
      const q = opp(p);
      const burn = (r, min) => pair(p, trial(() => { for (const v of D.rowScorchVictims(B(), q.i, r, min)) { const row = B().sides[v.s].rows[v.r]; row.units.splice(row.units.findIndex(x => x.uid === v.u.uid), 1); } }));
      if (/^horn/.test(ab)) return pair(p, trial(() => { B().sides[p.i].rows[+ab.slice(4)].lhorn = true; }));
      if (ab === 'clear') return pair(p, trial(() => { B().wx = clearSkies(); }));
      if (ab === 'burn1') return burn(1, 0);
      if (ab === 'burn2at10') return burn(2, 10);
      if (ab === 'burn0at10') return burn(0, 10);
      if (ab === 'agileBest') return pair(p, trial(() => { for (const m of agileMoves(p)) { const from = B().sides[p.i].rows[m.from].units; from.splice(from.findIndex(x => x.uid === m.u.uid), 1); B().sides[p.i].rows[m.to].units.push(m.u); } }));
      if (ab === 'rain' || ab === 'fog' || ab === 'frost') { const r = { frost: 0, fog: 1, rain: 2 }[ab]; return pair(p, trial(() => { B().wx[r] = true; })); }
      return null;
    }
    function menu(p) {
      const hand = p.hand.map(c => {
        const plays = playsOf(p, c);
        const def = C(c.id);
        const why = plays.length ? null : (def.sp === 'horn' || def.sp === 'mardroeme' ? 'Every one of your rows already has a horn or a Mardroeme.' : def.sp === 'decoy' ? 'You have no unit on the board it can swap with.' : 'It cannot be played now.');
        return { uid: c.uid, card: c.id, k: c.k, up: c.up || 0, plays, ok: !why, why };
      });
      const L = p.leader ? D.LEADER[p.leader] : null;
      const lw = leaderNeed(p);
      const t = totals();
      return { hand, leader: L ? { id: L.id, ok: !lw, why: lw, passive: !!L.passive, used: p.leaderUsed, text: L.text, delta: lw ? null : leaderPreview(p) } : null,
        pass: { ok: true }, mine: t[p.i], theirs: t[1 - p.i], oppPassed: opp(p).passed };
    }
    g.menu = id => { const p = P(id); return p ? menu(p) : null; };

    function turnCheck(p, a) {
      const m = menu(p);
      switch (a.t) {
        case 'pass': return yes();
        case 'leader': return m.leader && m.leader.ok ? yes() : no(m.leader ? m.leader.why : 'No leader.');
        case 'play': {
          const h = m.hand.find(x => x.uid === a.uid);
          if (!h) return no('That card is not in your hand.');
          if (!h.ok) return no(h.why);
          const def = C(h.card);
          const pl = def.sp === 'decoy' ? h.plays.find(x => x.target === a.target)
            : (def.kind === 'special' && !def.slot && def.sp !== 'horn') ? h.plays[0]
            : h.plays.find(x => x.row === a.row);
          if (!pl) return no(def.sp === 'decoy' ? 'Choose which of your units the Decoy replaces.' : 'Choose a row.');
          return yes({ pl });
        }
      }
      return no('That is not something you can do now.');
    }
    function* doTurn(p, a, pl) {
      if (a.t === 'pass') { p.passed = true; log({ t: 'pass', by: p.id }); return; }
      if (a.t === 'leader') return yield* useLeader(p);
      const c = takeFromHand(p, a.uid);
      const def = C(c.id);
      if (def.kind === 'unit') {
        log({ t: 'play', by: p.id, card: c.id });
        return yield* enterUnit(p, c, pl.row, 'play');
      }
      log({ t: 'play', by: p.id, card: c.id, special: true });
      return yield* playSpecial(p, c, { row: pl.row, target: pl.target });
    }

    /* ================================================================
       The game
       ================================================================ */
    g.main = function* () {
      /* The decks: chosen at once, face down, turned over together. */
      const asks = g.players.filter(p => !p.given).map(p => ({ n: ++g.pn, seat: p.id, t: 'deck', why: 'Choose your faction, your leader and your deck.', pub: 'choosing a deck' }));
      let ans = {};
      if (asks.length) ans = yield { ask: asks, all: true };
      g.players.forEach(p => {
        const d = p.given || ans[p.id];
        p.fac = d.fac; p.leader = d.leader;
        const seen = {};
        p.deck = shuffle(d.cards.map(x => { const id = typeof x === 'string' ? x : x.id; seen[id] = (seen[id] || 0) + 1; return inst(id, seen[id] - 1, typeof x === 'string' ? 0 : x.up); }), rand);
        p.deckSize = p.deck.length;
      });
      refreshPassives();
      log({ t: 'decks', list: g.players.map(p => ({ by: p.id, fac: p.fac, leader: p.leader, size: p.deck.length })) });
      /* Ten cards each (eleven for Francesca, Daisy of the Valley). */
      g.players.forEach(p => draw(p, D.DECK.hand + (leaderLive(p, 'extraCard') ? 1 : 0) + p.mods.hand, 'deal'));
      /* A trinket's cards come to hand from outside the deck. */
      g.players.forEach(p => { if (!p.mods.start.length) return; p.mods.start.forEach(id => p.hand.push(inst(id, 9))); log({ t: 'bonus', by: p.id, what: 'start', ids: p.mods.start.slice() }); });
      /* Redraw up to two, one at a time: the card goes back into the deck
         after its replacement is drawn, so it cannot come straight back. */
      g.phase = 'redraw';
      const left = {};
      g.players.forEach(p => { left[p.id] = D.DECK.redraws + p.mods.redraws; });
      const most = Math.max.apply(null, g.players.map(p => left[p.id]));
      for (let k = 0; k < most; k++) {
        const who = g.players.filter(p => left[p.id] > 0 && p.deck.length);
        if (!who.length) break;
        const rq = who.map(p => ({ n: ++g.pn, seat: p.id, t: 'pick', what: 'redraw',
          why: 'Redraw a card? You may change ' + left[p.id] + ' more.', pub: 'deciding what to redraw',
          options: p.hand.map(c => cardOpt(c)), multi: false, min: 1, max: 1, skip: 'Keep this hand' }));
        const r = yield { ask: rq, all: true };
        for (const p of who) {
          const a = r[p.id];
          if (!a || a.t === 'skip') { left[p.id] = 0; continue; }
          const c = takeFromHand(p, a.id);
          const got = p.deck.pop(); p.hand.push(got); g.drawN++;
          p.deck.splice(Math.floor(rand() * (p.deck.length + 1)), 0, c);
          left[p.id]--;
          log({ t: 'redraw', by: p.id });
        }
      }
      g.phase = 'play';
      for (;;) {
        g.round++;
        g.cur = null;
        g.players.forEach(p => { p.passed = false; });
        yield* chooseStarter();
        g.cur = g.starter;
        log({ t: 'round', by: g.players[g.starter].id, round: g.round });
        if (g.round === 3) skelligeRises();
        if (g.round > 1) g.players.forEach(p => { if (p.mods.roundDraw && p.deck.length) { draw(p, p.mods.roundDraw, 'trinket'); log({ t: 'bonus', by: p.id, what: 'roundDraw' }); } });
        yield* hold({ k: 'roundStart', round: g.round, by: g.players[g.starter].id });
        yield* bossPhases();
        for (;;) {
          if (g.players.every(p => p.passed)) break;
          const p = g.players[g.cur];
          if (p.passed) { g.cur = 1 - g.cur; continue; }
          if (!p.hand.length && !!leaderNeed(p)) { p.passed = true; log({ t: 'pass', by: p.id, auto: true }); }
          else {
            const a = yield* ask(p, { t: 'turn', why: 'Your turn', pub: 'taking a turn' });
            yield* doTurn(p, a, a._pl);
            const t = totals();
            log({ t: 'score', by: p.id, totals: t });
          }
          if (!opp(p).passed) g.cur = 1 - g.cur;
        }
        yield* endRound();
      }
    };
    /* Skellige: at the start of round three, two random non-hero units from
       its own discard pile are set on the board — summoned, not played, so
       their abilities do not fire. */
    function skelligeRises() {
      for (const p of g.players) {
        if (p.fac !== 'sk') continue;
        const pool = p.disc.filter(c => C(c.id).kind === 'unit' && !C(c.id).hero);
        const got = [];
        for (let k = 0; k < 2 && pool.length; k++) {
          const c = pool.splice(Math.floor(rand() * pool.length), 1)[0];
          p.disc.splice(p.disc.indexOf(c), 1);
          B().sides[p.i].rows[C(c.id).rows[0]].units.push(c);
          got.push(c.id);
        }
        log({ t: 'bonus', by: p.id, what: 'sk', ids: got });
      }
    }
    /* A boss's second phase (the single-player run, gw-run.js PHASES): once
       its holder has lost a round, it strikes at the start of every round
       after, harder after a second loss. Decided, shown on the table (a
       hold the room reads), then played on. Nothing here uses the rng, so
       undo by replay is unaffected. */
    const strongestIn = list => list.slice().sort((a, b) => {
      const ca = C(a.id), cb = C(b.id);
      const va = ca.kind === 'unit' ? ca.str + (a.up || 0) + (ca.hero ? 0.5 : 0) : 3, vb = cb.kind === 'unit' ? cb.str + (b.up || 0) + (cb.hero ? 0.5 : 0) : 3;
      return vb - va;
    })[0];
    function* bossPhases() {
      for (const p of g.players) {
        const ph = p.mods.phase;
        if (!ph || !p.phaseN) continue;
        const q = opp(p);
        const lvl = Math.min(2, p.phaseN);
        const info = { k: 'phase', by: p.id, of: q.id, what: ph, lvl, round: g.round };
        if (ph === 'whiteFrost') {
          g.locks[0] = true;
          if (lvl >= 2) g.locks[1] = true;
          g.locks.forEach((l, r) => { if (l) B().wx[r] = true; });
          info.rows = [0, 1, 2].filter(r => g.locks[r]);
        } else if (ph === 'crones') {
          info.ids = [];
          for (let k = 0; k < lvl && q.hand.length; k++) {
            const c = strongestIn(q.hand);
            q.hand.splice(q.hand.indexOf(c), 1);
            q.disc.push(c);
            q.hand.push(inst('cow', 20 + k));
            info.ids.push(c.id);
          }
        } else if (ph === 'edict') {
          const last = g.history[g.history.length - 1];
          const tot = last ? last.rows[q.i] : [0, 0, 0];
          let row = 0;
          [1, 2].forEach(r => { if (tot[r] > tot[row]) row = r; });
          info.row = row; info.n = lvl === 1 ? 2 : 3;
          B().minus[q.i][row] += info.n;
        } else if (ph === 'ambush') {
          info.ids = [];
          for (let k = 0; k < lvl + 1; k++) {
            const pool = p.deck.filter(c => C(c.id).kind === 'unit' && !C(c.id).hero);
            if (!pool.length) break;
            const c = strongestIn(pool);
            p.deck.splice(p.deck.indexOf(c), 1);
            B().sides[p.i].rows[C(c.id).rows[0]].units.push(c);
            log({ t: 'enter', by: p.id, card: c.id, row: C(c.id).rows[0], side: p.id, how: 'ambush' });
            info.ids.push(c.id);
          }
        } else if (ph === 'rage') {
          info.rows = lvl >= 2 ? [2, 1] : [2];
          info.rows.forEach(r => { B().sides[p.i].rows[r].lhorn = true; });
        } else if (ph === 'levy') {
          info.n = lvl + 1;
          for (let k = 0; k < info.n; k++) B().sides[p.i].rows[0].units.push(inst('poor_fucking_infantry', 30 + k));
        }
        log(Object.assign({ t: 'phase' }, info, { k: undefined }));
        yield* hold(info);
      }
    }
    function* chooseStarter() {
      const st = g.players.filter(p => p.fac === 'st');
      if (st.length === 1) {
        const p = st[0];
        const id = yield* pick(p, 'leads', 'Scoia’tael: who begins round ' + (['one', 'two', 'three', 'four', 'five', 'six', 'seven'][g.round - 1] || g.round) + '?',
          [{ id: 'me', label: 'I begin' }, { id: 'them', label: opp(p).name + ' begins' }], { always: true, pub: 'choosing who begins the round' });
        g.starter = id === 'me' ? p.i : opp(p).i;
        log({ t: 'leads', by: p.id, starter: g.players[g.starter].id });
        return;
      }
      if (g.round === 1) g.starter = rand() < 0.5 ? 0 : 1;
      else if (g.lastWinner != null) g.starter = g.lastWinner;
      else g.starter = 1 - g.starter;
    }
    function* endRound() {
      const t = totals();
      let w = t[0] > t[1] ? 0 : t[1] > t[0] ? 1 : null, how = w == null ? 'draw' : 'strength';
      if (w == null) {
        const ng = g.players.filter(p => p.fac === 'ng' || p.mods.tieWin);
        if (ng.length === 1) { w = ng[0].i; how = ng[0].fac === 'ng' ? 'nilfgaard' : 'trinket'; }
      }
      const losers = w == null ? [0, 1] : [1 - w];
      /* The Monsters' keeper is decided now, so the card can say it. */
      const keep = [null, null];
      g.players.forEach(p => {
        if (p.fac !== 'mo' && !p.mods.keep) return;
        const all = [];
        B().sides[p.i].rows.forEach((row, r) => row.units.forEach(u => { if (!D.isDecoy(u)) all.push({ r, u }); }));
        if (all.length) keep[p.i] = all[Math.floor(rand() * all.length)];
      });
      const nrDraw = w != null && g.players[w].fac === 'nr' && g.players[w].deck.length ? g.players[w].id : null;
      const winDraw = w != null && g.players[w].mods.winDraw && g.players[w].deck.length ? g.players[w].id : null;
      const rec = { round: g.round, totals: t, winner: w == null ? null : g.players[w].id, how,
        rows: [0, 1].map(s => [0, 1, 2].map(r => D.rowTotal(B(), s, r))),
        gems: g.players.map((p, i) => Math.max(0, p.gems - (losers.indexOf(i) >= 0 ? 1 : 0))),
        keep: keep.map((k, i) => k ? { by: g.players[i].id, card: k.u.id } : null).filter(Boolean), nrDraw, winDraw };
      g.history.push(rec);
      log({ t: 'roundEnd', round: g.round, totals: t, winner: rec.winner, how });
      /* The round that ends the game gets no card of its own: the winner
         reveal tells it (a card naming the round's winner would spoil it). */
      if (rec.gems.every(x => x > 0)) yield* hold(Object.assign({ k: 'roundEnd' }, clone(rec)));
      losers.forEach(i => { g.players[i].gems--; g.players[i].phaseN++; log({ t: 'gem', of: g.players[i].id, left: g.players[i].gems }); });
      if (w != null) g.players[w].wins++;
      g.lastWinner = w;
      if (nrDraw) { draw(P(nrDraw), 1, 'nr'); log({ t: 'bonus', by: nrDraw, what: 'nr' }); }
      if (winDraw) { draw(P(winDraw), P(winDraw).mods.winDraw, 'trinket'); log({ t: 'bonus', by: winDraw, what: 'winDraw' }); }
      /* Clear the board: everything to the discard pile of its side. */
      const avengers = [];
      B().sides.forEach((sd, s) => sd.rows.forEach((row, r) => {
        for (const u of row.units.slice()) {
          if (keep[s] && keep[s].u === u) continue;
          row.units.splice(row.units.indexOf(u), 1);
          g.players[s].disc.push(u);
          if (C(u.id).avenger) avengers.push([s, u]);
        }
        if (row.horn) { g.players[s].disc.push(row.horn); row.horn = null; }
        row.lhorn = false;
      }));
      keep.forEach((k, i) => { if (k) log({ t: 'bonus', by: g.players[i].id, what: g.players[i].fac === 'mo' ? 'mo' : 'keep', card: k.u.id }); });
      for (const [s2, u] of avengers) avenge(s2, u);
      for (const x of g.wxCards) g.players[x.s].disc.push(x.c);
      g.wxCards = [];
      B().wx = [false, false, false];
      baseMinus();
      g.players.forEach(p => { if (p.seen && p.seen.round <= g.round) p.seen = null; });
      const out = g.players.filter(p => p.gems <= 0);
      if (out.length) finish(out.length === 2 ? null : opp(out[0]).id, out.length === 2 ? 'draw' : 'gems');
    }
    function finish(winner, how) {
      g.phase = 'over';
      g.prompts = []; g.hold = null;
      const w = winner ? P(winner) : null;
      const rows = g.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, fac: p.fac, leader: p.leader,
        wins: p.wins, gems: p.gems, points: g.history.reduce((s, h) => s + h.totals[p.i], 0),
        won: how === 'draw' ? false : p.id === winner, draw: how === 'draw' }));
      g.result = { winner: winner || null, name: w ? w.name : null, how, rows, rounds: clone(g.history) };
      log({ t: 'over', by: winner || null, how });
      throw OVER;
    }

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
    function checkDeck(p, a) {
      if (a.t !== 'deck') return no('Choose your deck first.');
      const fac = String(a.fac || '');
      const leader = String(a.leader || '');
      if (!D.faction(fac)) return no('Choose a faction.');
      if (!D.LEADER[leader] || D.LEADER[leader].fac !== fac) return no('Choose a leader of that faction.');
      const cards = Array.isArray(a.cards) ? a.cards.map(String) : D.STANDARD[fac];
      const bad = D.deckProblem(fac, cards);
      if (bad) return no(bad);
      return yes({ a: { t: 'deck', fac, leader, cards: cards.slice() } });
    }
    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The game is over.');
      if (g.hold) return no('Watch the telly first.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const mine = g.prompts.filter(pr => pr.seat === seatId);
      if (!mine.length) return no('It is not your turn.');
      const pr = a.n != null ? mine.find(x => x.n === +a.n) : (mine.length === 1 ? mine[0] : null);
      if (!pr) return no('That question has moved on.');
      let r, clean;
      if (pr.t === 'turn') {
        r = turnCheck(p, a);
        clean = { t: a.t, uid: a.uid, row: a.row == null ? null : +a.row, target: a.target || null };
        if (r.ok) clean = Object.assign({}, clean, { _pl: r.pl });
      } else if (pr.t === 'deck') { r = checkDeck(p, a); clean = r.a; }
      else { r = checkPick(pr, a); clean = r.a; }
      if (!r.ok) return r;
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
    const chosen = () => g.phase !== 'deck';
    g.publicView = function () {
      const b = B();
      const t = totals();
      return {
        v: VERSION, phase: g.phase, round: g.round, active: g.activeId(),
        starter: g.starter == null ? null : g.players[g.starter].id,
        board: {
          wx: b.wx.slice(), spies2: b.spies2, half: (b.half || [false, false]).slice(), locks: g.locks.slice(), minus: (b.minus || [[0, 0, 0], [0, 0, 0]]).map(x => x.slice()),
          weather: g.wxCards.map(x => ({ uid: x.c.uid, id: x.c.id, k: x.c.k, by: g.players[x.s].id })),
          sides: b.sides.map((sd, s) => ({
            total: t[s],
            rows: sd.rows.map((row, r) => ({
              total: D.rowTotal(b, s, r), horn: row.horn ? { uid: row.horn.uid, id: row.horn.id, k: row.horn.k } : null, lhorn: row.lhorn,
              units: row.units.map(u => ({ uid: u.uid, id: u.id, k: u.k, v: D.strengthOf(b, s, r, u), base: C(u.id).str + (u.up || 0), up: u.up || 0 }))
            }))
          }))
        },
        players: g.players.map(p => ({
          id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level,
          fac: chosen() ? p.fac : null, leader: chosen() ? p.leader : null, leaderUsed: p.leaderUsed, leaderOff: chosen() && !!p.leader && cancelled(p),
          gems: p.gems, wins: p.wins, handN: p.hand.length, deckN: p.deck.length, passed: p.passed, leaderN: p.leaderN,
          mods: p.modded ? { hand: p.mods.hand, redraws: p.mods.redraws, gems: p.mods.gems, winDraw: p.mods.winDraw, tieWin: p.mods.tieWin, keep: p.mods.keep,
            halfWeather: p.mods.halfWeather, spyDraw: p.mods.spyDraw, roundDraw: p.mods.roundDraw, leaderUses: p.mods.leaderUses, startN: p.mods.start.length,
            weak: p.mods.weak, minusRows: p.mods.minusRows.slice(), noLeader: p.mods.noLeader, phase: p.mods.phase, phaseN: p.phaseN } : null,
          disc: p.disc.map(c => ({ uid: c.uid, id: c.id, k: c.k, up: c.up || 0 })),
          choosing: g.prompts.some(pr => pr.seat === p.id && (pr.t === 'deck' || pr.what === 'redraw'))
        })),
        prompts: g.prompts.map(pr => ({ n: pr.n, seat: pr.seat, t: pr.t, what: pr.what || null, why: pr.pub || pr.why })),
        hold: g.hold ? clone(g.hold) : null,
        history: clone(g.history),
        log: g.log.slice(-80).map(e => Object.assign({}, e)),
        logN: g.log.length,
        result: g.result
      };
    };
    g.seatView = function (id) {
      const p = P(id);
      if (!p) return null;
      const prompts = g.prompts.filter(pr => pr.seat === id).map(pr => clone(pr));
      const turnPr = g.prompts.find(pr => pr.seat === id && pr.t === 'turn');
      /* What is left in your own deck (you built it): names and counts, never the order. */
      const left = {};
      p.deck.forEach(c => { left[c.id] = (left[c.id] || 0) + 1; });
      /* The same, copy by copy with any honing (The Path), sorted so it says nothing of the order. */
      const deckCards = p.deck.map(c => c.up ? { id: c.id, up: c.up } : { id: c.id }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : (a.up || 0) - (b.up || 0));
      return { id, v: VERSION, hand: p.hand.map(c => ({ uid: c.uid, id: c.id, k: c.k, up: c.up || 0 })), deckLeft: left, deckCards,
        fac: p.fac, leader: p.leader, seen: p.seen ? clone(p.seen) : null, prompts,
        can: turnPr && !g.hold ? Object.assign({ n: turnPr.n }, menu(p)) : null };
    };
    /* For the tests: every card is somewhere, exactly once. */
    g.census = function () {
      const seen = {};
      const note = (c, w) => { (seen[c.uid] = seen[c.uid] || []).push(w); };
      g.players.forEach(p => { p.deck.forEach(c => note(c, p.id + ':deck')); p.hand.forEach(c => note(c, p.id + ':hand')); p.disc.forEach(c => note(c, p.id + ':disc')); });
      B().sides.forEach((sd, s) => sd.rows.forEach((row, r) => { row.units.forEach(c => note(c, s + ':row' + r)); if (row.horn) note(row.horn, s + ':horn' + r); }));
      g.wxCards.forEach(x => note(x.c, 'weather'));
      g.limbo.forEach(c => note(c, 'limbo'));
      return { seen, made: g.uidN };
    };
    g.X = { menu, leaderNeed, totals, cancelled, invader, agileMoves };
  }

  const Engine = { VERSION, LEVELS, TABLE_HOLDS, MOD_DEFAULT, PHASES, create, rngFrom, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.GwentEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
