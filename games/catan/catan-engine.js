/* Catan — the rules. Base game, and Cities & Knights as an option.
 *
 * No DOM, no timers, one seeded rng. The display holds the only Game; phones
 * and house players send it answers to the prompts it opens.
 *
 * Shape (the hub's house shape — Nidavellir, Saint Petersburg, Blood Rage):
 *
 *   prompts  — questions waiting on a seat. Several may be open together: the
 *              discard on a 7, a Wedding, the pillage after a lost battle are
 *              all asked of several players at once, as at a real table.
 *   steps    — scheduled machinery. run() never takes a step while a prompt is
 *              open, so the table cannot move on over somebody's question.
 *   hold     — the table itself is busy (opts.show: the telly is playing the
 *              barbarians landing). Nobody is asked anything until release().
 *
 * A consequence raised while a step or an answer is being carried out goes IN
 * FRONT of whatever was already scheduled, so "play a knight → move the robber
 * → pick whom to rob" all happens before the turn prompt comes back.
 *
 * The active player's turn is itself a prompt ('turn'), re-asked after every
 * action with a new number — so a house player's pacing key and a phone's
 * screen both see every step of a turn as a fresh question.
 *
 * Trading between players is NOT a prompt: an offer waits on nobody. Offers
 * live in `offers`, replies and deals are their own actions, and the game
 * never stalls on a phone that ignores one.
 *
 * Expansion as an OPTION, not a fork (the Saint Petersburg lesson): `ck` is
 * read at create and every rule asks the question it needs — "does a city
 * make commodities?", "is the robber on the board yet?" — rather than
 * branching the whole game.
 *
 * Five or six players is the same game on the bigger island (`big`, set by the
 * seat count), with one thing more between turns (`between`):
 *   paired  the 2025 rule. After the active player's turn, the player three
 *           seats on takes an action phase of their own — the same turn
 *           prompt, marked `paired`, already past the roll, closed to trading
 *           between players. It has its own turn number, so a card bought in
 *           it waits for a later turn and a knight woken in it can act later.
 *   build   the Almanac's special building phase. When a turn ends, each
 *           other player in turn who can build something is asked a `special`
 *           question: build with the cards in hand, or be done. No trades,
 *           no cards played, no knight actions.
 */
(function (root) {
  'use strict';
  const D = root.CatanData || (typeof require === 'function' ? require('./catan-data.js') : null);
  const BoardLib = root.CatanBoard || (typeof require === 'function' ? require('./catan-board.js') : null);
  const VERSION = 1;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  const sum = o => Object.keys(o || {}).reduce((s, k) => s + (o[k] || 0), 0);
  const clone = o => JSON.parse(JSON.stringify(o));
  const TRADE_ACTS = ['offer', 'reply', 'counter', 'deal', 'withdraw'];

  /* ================================================================ */
  let GID = 0;
  function Game(o) {
    const g = this;
    g.gid = ++GID;
    g.opts = Object.assign({ ck: false, vp: 0, show: false, between: 'paired' }, o.opts || {});
    g.ck = !!g.opts.ck;
    g.target = g.opts.vp || (g.ck ? D.WIN.ck : D.WIN.base);
    g.seed = o.seed >>> 0;
    g.r = rng(g.seed || 1);
    const n = o.players.length;
    if (n < 2 || n > D.SEATS_MAX) throw new Error('Catan seats 2 to ' + D.SEATS_MAX + ' players');
    /* Five or six: the extension's island, bank and decks. */
    g.big = n >= 5;
    g.between = g.big ? (g.opts.between === 'build' ? 'build' : 'paired') : null;
    g.B = BoardLib.build(g.big ? D.BIG.layout : 'standard');
    g.supply = { res: g.big ? D.BIG.bank : D.BANK, com: g.ck ? (g.big ? D.BIG.commodities : D.COMMODITIES) : 0 };
    g.TYPES = g.ck ? D.RES.concat(D.COM) : D.RES.slice();
    g.players = o.players.map((p, i) => ({
      id: String(p.id), name: p.name, hex: p.hex || D.PIECE_COLOURS[i], bot: !!p.bot, i,
      hand: blankHand(),
      dev: [],                 // base: [{key, turn}] — secret
      knightsPlayed: 0,        // base: face up in front of you
      prog: [],                // C&K: progress card keys — secret
      vpCards: [],             // C&K: Printing / Constitution — face up
      impr: { trade: 0, politics: 0, science: 0 },
      defender: 0,
      pieces: { road: D.PIECES.road, settlement: D.PIECES.settlement, city: D.PIECES.city, wall: D.PIECES.wall },
      kn: { 1: D.KNIGHTS[1], 2: D.KNIGHTS[2], 3: D.KNIGHTS[3] }
    }));
    g.bank = blankHand();
    for (const k of D.RES) g.bank[k] = g.supply.res;
    if (g.ck) for (const k of D.COM) g.bank[k] = g.supply.com;

    g.layIsland();
    g.build = {};             // cornerId -> {owner, kind, wall, metro, sideways}
    g.roads = {};             // edgeId -> owner index
    g.knights = [];           // {id, owner, level, active, at, lock}
    g.knightN = 0;
    g.devDeck = [];
    if (!g.ck) {
      for (const k of D.DEV_KEYS) for (let c = 0; c < (g.big ? D.BIG.dev[k] : D.DEV[k].count); c++) g.devDeck.push(k);
      shuffle(g.devDeck, g.r);
    }
    g.decks = { trade: [], politics: [], science: [] };
    if (g.ck) {
      for (const k of D.PROGRESS_KEYS) for (let c = 0; c < D.PROGRESS[k].count; c++) g.decks[D.PROGRESS[k].deck].push(k);
      for (const t of D.TRACKS) shuffle(g.decks[t], g.r);
    }
    g.barb = 0;
    g.attacks = 0;
    g.metro = { trade: null, politics: null, science: null };
    g.merchant = null;
    g.defenderLeft = g.big ? D.BIG.defender : D.DEFENDER_TOKENS;
    g.sbp = null;             // the special building phase in progress: {from, k}
    g.lastAttack = null;
    g.longest = null;
    g.largest = null;
    g.offers = [];
    g.offerN = 0;
    g.first = Number.isInteger(g.opts.first) ? g.opts.first % n : Math.floor(g.r() * n);
    g.cur = g.first;
    g.turnNo = 0;
    g.turn = null;
    g.dice = null;
    g.rollN = 0;
    g.phase = 'setup';
    g.prompts = [];
    g.steps = [];
    g.buf = null;
    g.hold = null;
    g.n = 0;
    g.log = [];
    g.notes = {};
    g.result = null;
    g.push(() => g.beginSetup());
    g.run();
  }
  function blankHand() { return { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0, paper: 0, cloth: 0, coin: 0 }; }
  const P = Game.prototype;

  /* ---------------- machinery ---------------- */
  P.push = function (fn) { if (this.buf) this.buf.push(fn); else this.steps.push(fn); };
  P.exec = function (fn) {
    const outer = this.buf;
    const buf = [];
    this.buf = buf;
    try { fn(); } finally { this.buf = outer; }
    if (outer) outer.push.apply(outer, buf); else this.steps.unshift.apply(this.steps, buf);
  };
  P.run = function () {
    let guard = 0;
    while (!this.prompts.length && !this.hold && this.steps.length && this.phase !== 'over') {
      if (++guard > 100000) throw new Error('Catan engine ran away');
      const s = this.steps.shift();
      this.exec(s);
      this.checkWin();
    }
  };
  P.say = function (e) {
    e.turn = this.turnNo;
    if (this.sbp) e.sbp = true;
    this.log.push(e);
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  };
  /* What only one seat may know: the card you stole, the card you drew. */
  P.note = function (id, e) {
    e.turn = this.turnNo;
    const l = this.notes[id] = this.notes[id] || [];
    l.push(e);
    if (l.length > 30) l.splice(0, l.length - 30);
  };

  /* Open a question. `done(answer)` carries it out; `check(answer)` returns a
     reason to refuse, or null. */
  P.ask = function (seat, t, data, done, check) {
    const pr = Object.assign({ n: ++this.n, seat, t }, data);
    Object.defineProperty(pr, 'done', { value: done, enumerable: false });
    Object.defineProperty(pr, 'check', { value: check || (() => null), enumerable: false });
    this.prompts.push(pr);
    return pr;
  };
  P.promptFor = function (id) { return this.prompts.find(p => p.seat === id) || null; };

  P.act = function (id, a) {
    id = String(id);
    if (this.phase === 'over') return { ok: false, why: 'The game is over.' };
    if (!a || typeof a !== 'object') return { ok: false, why: 'That is not an answer.' };
    if (TRADE_ACTS.indexOf(a.t) >= 0) {
      const why = this.tradeAct(id, a);
      if (why) return { ok: false, why };
      this.checkWin();
      return { ok: true };
    }
    const pr = this.promptFor(id);
    if (!pr) return { ok: false, why: 'Nothing is being asked of you right now.' };
    let why;
    try { why = pr.check(a); } catch (e) { why = 'That is not an answer.'; }
    if (why) return { ok: false, why };
    this.prompts.splice(this.prompts.indexOf(pr), 1);
    this.exec(() => pr.done(a));
    this.checkWin();
    this.run();
    return { ok: true };
  };
  P.hurried = function (ids) { this.say({ t: 'hurried', who: ids.slice() }); };
  P.release = function (t) {
    if (!this.hold || (t && this.hold.t !== t)) return false;
    this.hold = null;
    this.run();
    return true;
  };

  /* ---------------- lookups ---------------- */
  P.seat = function (id) { return this.players.find(p => p.id === String(id)) || null; };
  P.idx = function (id) { return this.players.findIndex(p => p.id === String(id)); };
  P.curP = function () { return this.players[this.cur]; };
  P.left = function (i, k) { return (i + (k == null ? 1 : k)) % this.players.length; };
  /* Everyone, starting with seat i and going clockwise. */
  P.round = function (i) { const out = []; for (let k = 0; k < this.players.length; k++) out.push(this.players[this.left(i, k)]); return out; };
  P.knightAt = function (c) { return this.knights.find(k => k.at === c) || null; };
  P.knight = function (id) { return this.knights.find(k => k.id === id) || null; };
  P.cardCount = function (p) { return this.TYPES.reduce((s, k) => s + p.hand[k], 0); };
  P.resCount = function (p) { return D.RES.reduce((s, k) => s + p.hand[k], 0); };
  P.limit = function (p) { return D.HAND_LIMIT + D.WALL_BONUS * this.wallsOf(p.i); };
  P.wallsOf = function (i) { let n = 0; for (const c in this.build) { const b = this.build[c]; if (b.owner === i && b.wall) n++; } return n; };
  P.buildsOf = function (i, kind) {
    const out = [];
    for (const c in this.build) { const b = this.build[c]; if (b.owner === i && (!kind || b.kind === kind)) out.push(+c); }
    return out.sort((a, b) => a - b);
  };
  P.citiesOf = function (i) { return this.buildsOf(i, 'city'); };
  P.hasCity = function (i) { return this.citiesOf(i).length > 0; };
  /* A city a metropolis could be put on. */
  P.freeCities = function (i) { return this.citiesOf(i).filter(c => !this.build[c].metro); };
  P.isType = function (k) { return this.TYPES.indexOf(k) >= 0; };
  P.isRes = k => D.RES.indexOf(k) >= 0;
  P.isCom = function (k) { return this.ck && D.COM.indexOf(k) >= 0; };

  /* ---------------- the island ---------------- */
  P.layIsland = function () {
    const g = this, B = g.B;
    const MIX = g.big ? D.BIG.mix : D.MIX;
    const NUMBERS = g.big ? D.BIG.numbers : D.NUMBERS;
    const tiles = [];
    for (const t of Object.keys(MIX)) for (let k = 0; k < MIX[t]; k++) tiles.push(t);
    shuffle(tiles, g.r);
    g.hexes = B.hexes.map((h, i) => ({ t: tiles[i], n: null }));
    const land = g.hexes.map((h, i) => i).filter(i => g.hexes[i].t !== 'desert');
    /* Numbers: shuffled, and never a 6 or 8 beside another 6 or 8 — the printed
       rule. Try for "no two equal numbers side by side" as well while it comes
       cheaply; it only ever relaxes to the printed rule. */
    const red = n => n === 6 || n === 8;
    let nums = null;
    for (let attempt = 0; attempt < 5000; attempt++) {
      const pick = shuffle(NUMBERS.slice(), g.r);
      const at = {};
      land.forEach((h, k) => { at[h] = pick[k]; });
      let okRed = true, okSame = true;
      for (const h of land) for (const nb of B.hexes[h].adj) {
        if (at[nb] == null) continue;
        if (red(at[h]) && red(at[nb])) okRed = false;
        if (at[h] === at[nb]) okSame = false;
      }
      if (okRed && (okSame || attempt > 1500)) { nums = at; break; }
    }
    for (const h of land) g.hexes[h].n = nums[h];
    /* The bigger island has two deserts; the robber starts on either. */
    g.deserts = g.hexes.map((h, i) => i).filter(i => g.hexes[i].t === 'desert');
    g.desert = g.deserts.length > 1 ? g.deserts[Math.floor(g.r() * g.deserts.length)] : g.deserts[0];
    /* In Cities & Knights the robber waits beside the barbarian track until
       the first attack. */
    g.robber = g.ck ? null : g.desert;
    const kinds = shuffle((g.big ? D.BIG.ports : D.PORTS).slice(), g.r);
    g.ports = B.harbours.map((e, k) => ({ edge: e, kind: kinds[k], corners: [B.edges[e].a, B.edges[e].b] }));
  };
  P.portsOf = function (i) {
    const out = [];
    for (const pt of this.ports) if (pt.corners.some(c => this.build[c] && this.build[c].owner === i)) out.push(pt.kind);
    return out;
  };
  /* The bank's rate for a card type, for this player, now. */
  P.rate = function (i, k) {
    const p = this.players[i];
    let r = 4;
    const ports = this.portsOf(i);
    if (this.isRes(k)) {
      if (ports.indexOf('any') >= 0) r = 3;
      if (ports.indexOf(k) >= 0) r = 2;
      if (this.merchant && this.merchant.seat === i && D.TERRAIN[this.hexes[this.merchant.hex].t].res === k) r = 2;
    } else if (this.isCom(k)) {
      if (ports.indexOf('any') >= 0) r = 3;
      if (p.impr.trade >= 3) r = 2;
    } else return 0;
    if (this.turn && this.turn.fleet === k && this.cur === i) r = 2;
    return r;
  };
  P.rates = function (i) { const o = {}; for (const k of this.TYPES) o[k] = this.rate(i, k); return o; };

  /* ---------------- cards ---------------- */
  P.has = function (p, cost) { for (const k in cost) if ((p.hand[k] || 0) < cost[k]) return false; return true; };
  P.pay = function (p, cost) { for (const k in cost) { p.hand[k] -= cost[k]; this.bank[k] += cost[k]; } };
  /* From the bank, as many as it has. */
  P.gain = function (p, k, n) {
    const got = Math.min(n, this.bank[k]);
    this.bank[k] -= got; p.hand[k] += got;
    return got;
  };
  P.move = function (from, to, k, n) {
    const m = Math.min(n, from.hand[k]);
    from.hand[k] -= m; to.hand[k] += m;
    return m;
  };
  /* One card at random out of a hand (resources, and commodities in C&K). */
  P.randomCard = function (p) {
    const total = this.cardCount(p);
    if (!total) return null;
    let x = Math.floor(this.r() * total);
    for (const k of this.TYPES) { if (x < p.hand[k]) return k; x -= p.hand[k]; }
    return null;
  };
  /* A hand given as {type: n} is a real part of this hand. */
  P.validCards = function (p, cards, need) {
    if (!cards || typeof cards !== 'object') return 'Pick the cards.';
    let n = 0;
    for (const k of Object.keys(cards)) {
      const v = cards[k];
      if (!this.isType(k)) return 'That is not a card in this game.';
      if (!Number.isInteger(v) || v < 0) return 'That is not a number of cards.';
      if (v > p.hand[k]) return 'You do not have ' + v + ' ' + D.cardName(k) + '.';
      n += v;
    }
    if (need != null && n !== need) return 'That is ' + n + ' card' + (n === 1 ? '' : 's') + ', not ' + need + '.';
    return null;
  };
  P.cleanCards = function (cards) { const o = {}; for (const k of this.TYPES) if (cards && cards[k] > 0) o[k] = cards[k] | 0; return o; };

  /* ---------------- points ---------------- */
  P.vpOf = function (p, hidden) {
    let v = 0;
    for (const c in this.build) {
      const b = this.build[c];
      if (b.owner !== p.i) continue;
      v += b.kind === 'city' ? 2 : 1;
      if (b.metro) v += 2;
    }
    if (this.longest && this.longest.seat === p.i) v += 2;
    if (this.largest && this.largest.seat === p.i) v += 2;
    if (this.ck) {
      v += p.defender + p.vpCards.length;
      if (this.merchant && this.merchant.seat === p.i) v += 1;
    } else if (hidden) v += p.dev.filter(d => d.key === 'vp').length;
    return v;
  };
  P.vp = function (p) { return this.vpOf(p, true); };
  P.publicVP = function (p) { return this.vpOf(p, false); };

  /* Only the player whose turn (or paired action phase) it is can win — never
     in the gap after a turn has ended, such as a special building phase. */
  P.checkWin = function () {
    if (this.phase !== 'play' || !this.turn || this.turn.ended) return false;
    const p = this.curP();
    if (this.vp(p) >= this.target) { this.finish(p); return true; }
    return false;
  };
  P.finish = function (w) {
    const g = this;
    g.phase = 'over';
    g.prompts = [];
    g.steps = [];
    g.offers = [];
    g.hold = null;
    const rows = g.players.map(p => ({
      id: p.id, name: p.name, bot: p.bot, i: p.i, hex: p.hex,
      vp: g.vp(p), won: p === w, parts: g.vpParts(p),
      vpDev: g.ck ? 0 : p.dev.filter(d => d.key === 'vp').length
    }));
    rows.sort((a, b) => (b.won - a.won) || (b.vp - a.vp) || (a.i - b.i));
    let place = 0, last = null;
    rows.forEach((r, k) => {
      if (r.won) { r.place = 1; place = 1; last = null; return; }
      if (last === null || r.vp !== last) { place = k + 1; last = r.vp; }
      r.place = place;
    });
    g.result = { winner: w.id, rows };
    g.say({ t: 'over', by: w.id, vp: g.vp(w) });
  };
  P.vpParts = function (p) {
    const o = { settlements: 0, cities: 0, metros: 0, longest: 0, largest: 0, defender: 0, merchant: 0, cards: 0 };
    for (const c in this.build) {
      const b = this.build[c];
      if (b.owner !== p.i) continue;
      if (b.kind === 'city') o.cities += 2; else o.settlements += 1;
      if (b.metro) o.metros += 2;
    }
    if (this.longest && this.longest.seat === p.i) o.longest = 2;
    if (this.largest && this.largest.seat === p.i) o.largest = 2;
    if (this.ck) {
      o.defender = p.defender;
      o.merchant = this.merchant && this.merchant.seat === p.i ? 1 : 0;
      o.cards = p.vpCards.length;
    } else o.cards = p.dev.filter(d => d.key === 'vp').length;
    return o;
  };

  /* ================================================================
     Where things may go
     ================================================================ */
  P.opponentAt = function (c, i) {
    const b = this.build[c];
    if (b && b.owner !== i) return true;
    const k = this.knightAt(c);
    return !!(k && k.owner !== i);
  };
  P.emptyCorner = function (c) { return !this.build[c] && !this.knightAt(c); };
  P.distanceOk = function (c) { return this.B.corners[c].adj.every(a => !this.build[a]); };
  P.ownRoadAt = function (c, i, except) {
    for (const e of this.B.corners[c].edges) if (e !== except && this.roads[e] === i) return true;
    return false;
  };
  /* A road joins your network at one of its ends: your building there, or
     another road of yours there that is not cut by somebody else's piece. */
  P.roadConnects = function (e, i) {
    const E = this.B.edges[e];
    for (const c of [E.a, E.b]) {
      const b = this.build[c];
      if (b && b.owner === i) return true;
      if (this.opponentAt(c, i)) continue;
      if (this.ownRoadAt(c, i, e)) return true;
    }
    return false;
  };
  P.legalRoads = function (i) {
    if (this.players[i].pieces.road <= 0) return [];
    return this.B.edges.filter(e => this.roads[e.id] == null && this.roadConnects(e.id, i)).map(e => e.id);
  };
  P.legalSettlements = function (i) {
    if (this.players[i].pieces.settlement <= 0) return [];
    return this.B.corners.filter(c => this.emptyCorner(c.id) && this.distanceOk(c.id) && this.ownRoadAt(c.id, i)).map(c => c.id);
  };
  P.setupCorners = function () {
    return this.B.corners.filter(c => this.emptyCorner(c.id) && this.distanceOk(c.id)).map(c => c.id);
  };
  /* A pillaged city with no settlement piece left to stand in for it must be
     rebuilt before any other settlement is upgraded. */
  P.legalCities = function (i) {
    const p = this.players[i];
    const own = this.buildsOf(i, 'settlement');
    const side = own.filter(c => this.build[c].sideways);
    if (side.length) return side;
    if (p.pieces.city <= 0) return [];
    return own;
  };
  P.legalWalls = function (i) {
    if (!this.ck || this.players[i].pieces.wall <= 0) return [];
    return this.citiesOf(i).filter(c => !this.build[c].wall);
  };
  P.legalKnightSpots = function (i) {
    return this.B.corners.filter(c => this.emptyCorner(c.id) && this.ownRoadAt(c.id, i)).map(c => c.id);
  };

  /* Where a knight can get to along its owner's roads. It may pass its own
     side's buildings and knights, never anybody else's, and stops on an empty
     crossing — or, to displace, on a weaker opposing knight. */
  P.knightReach = function (from, owner, level) {
    const g = this;
    const seen = new Set([from]);
    const empty = [], displace = [];
    const queue = [from];
    while (queue.length) {
      const c = queue.shift();
      for (const e of g.B.corners[c].edges) {
        if (g.roads[e] !== owner) continue;
        const d = g.B.other(e, c);
        if (seen.has(d)) continue;
        seen.add(d);
        const b = g.build[d];
        const k = g.knightAt(d);
        if (b && b.owner !== owner) continue;
        if (k && k.owner !== owner) { if (level != null && k.level < level) displace.push(d); continue; }
        if (!b && !k) empty.push(d);
        queue.push(d);
      }
    }
    return { empty: empty.sort((a, b) => a - b), displace: displace.sort((a, b) => a - b) };
  };
  /* Knights that stood ready when this Action phase began: active, and not
     woken this turn. */
  P.ready = function (k) { return k.active && k.lock !== this.turnNo; };
  P.promotable = function (k, free) {
    const p = this.players[k.owner];
    if (k.level >= 3) return 'That knight is already mighty.';
    if (k.level === 2 && p.impr.politics < 3) return 'Strong knights become mighty only once you have the Fortress (politics 3).';
    if (p.kn[k.level + 1] <= 0) return 'Both your ' + D.KNIGHT_NAME[k.level + 1] + ' knights are already on the board.';
    if (this.turn && this.turn.promoted[k.id]) return 'That knight has been promoted once this turn already.';
    if (!free && !this.has(p, D.COST.promote)) return 'Promoting costs a wool and an ore.';
    return null;
  };
  /* The "open" roads Diplomacy may lift: one end with nothing of the owner's
     on it — no road, no building, no knight. */
  P.openRoads = function () {
    const out = [];
    for (const e in this.roads) {
      const i = this.roads[e], E = this.B.edges[+e];
      const loose = c => {
        const b = this.build[c]; if (b && b.owner === i) return false;
        const k = this.knightAt(c); if (k && k.owner === i) return false;
        return !this.ownRoadAt(c, i, +e);
      };
      if (loose(E.a) || loose(E.b)) out.push(+e);
    }
    return out.sort((a, b) => a - b);
  };
  P.hexesOf = function (i) {
    const out = new Set();
    for (const c in this.build) if (this.build[c].owner === i) for (const h of this.B.corners[+c].hexes) out.add(h);
    return Array.from(out).sort((a, b) => a - b);
  };
  P.robberVictims = function (hex, i) {
    const out = [];
    for (const c of this.B.hexes[hex].corners) {
      const b = this.build[c];
      if (b && b.owner !== i && out.indexOf(b.owner) < 0) out.push(b.owner);
    }
    return out.sort((a, b) => a - b);
  };

  /* ================================================================
     Longest road and largest army
     ================================================================ */
  P.roadLength = function (i) {
    const g = this;
    const mine = Object.keys(g.roads).filter(e => g.roads[e] === i).map(Number);
    if (!mine.length) return 0;
    const at = {};
    for (const e of mine) { const E = g.B.edges[e]; (at[E.a] = at[E.a] || []).push(e); (at[E.b] = at[E.b] || []).push(e); }
    const used = {};
    const blocked = c => g.opponentAt(c, i);
    const dfs = c => {
      let best = 0;
      for (const e of at[c] || []) {
        if (used[e]) continue;
        used[e] = true;
        const d = g.B.other(e, c);
        const len = 1 + (blocked(d) ? 0 : dfs(d));
        used[e] = false;
        if (len > best) best = len;
      }
      return best;
    };
    let best = 0;
    for (const c of Object.keys(at)) best = Math.max(best, dfs(+c));
    return best;
  };
  /* The holder keeps it on a tie. When it breaks, a clear new leader takes it;
     a tie at the top, or nobody at five, sets it aside. */
  P.updateLongest = function () {
    const g = this;
    const lens = g.players.map(p => g.roadLength(p.i));
    const max = Math.max.apply(null, lens);
    const top = g.players.filter(p => lens[p.i] === max);
    const before = g.longest ? g.longest.seat : null;
    if (before != null && lens[before] >= D.LONGEST_MIN && lens[before] >= max) {
      g.longest = { seat: before, len: lens[before] };
    } else if (max >= D.LONGEST_MIN && top.length === 1) {
      g.longest = { seat: top[0].i, len: max };
    } else g.longest = null;
    const after = g.longest ? g.longest.seat : null;
    if (after !== before) {
      if (after != null) g.say({ t: 'longest', by: g.players[after].id, len: g.longest.len, from: before != null ? g.players[before].id : null });
      else g.say({ t: 'longestLost', from: g.players[before].id });
    }
    g.lens = lens;
  };
  P.updateLargest = function (p) {
    const g = this;
    if (p.knightsPlayed < D.ARMY_MIN) return;
    if (!g.largest) { g.largest = { seat: p.i, n: p.knightsPlayed }; g.say({ t: 'largest', by: p.id, n: p.knightsPlayed, from: null }); return; }
    if (g.largest.seat === p.i) { g.largest.n = p.knightsPlayed; return; }
    if (p.knightsPlayed > g.largest.n) {
      const from = g.players[g.largest.seat].id;
      g.largest = { seat: p.i, n: p.knightsPlayed };
      g.say({ t: 'largest', by: p.id, n: p.knightsPlayed, from });
    }
  };

  /* ================================================================
     Setup: two rounds, the second in reverse. In Cities & Knights the second
     building is a city.
     ================================================================ */
  P.beginSetup = function () {
    const g = this;
    const order = g.round(g.first).map(p => p.i);
    g.setupOrder = order.concat(order.slice().reverse());
    g.setupAt = 0;
    g.say({ t: 'setup', first: g.players[g.first].id });
    g.push(() => g.setupStep());
  };
  P.setupStep = function () {
    const g = this;
    if (g.setupAt >= g.setupOrder.length) { g.push(() => g.startPlay()); return; }
    const i = g.setupOrder[g.setupAt];
    const p = g.players[i];
    const second = g.setupAt >= g.players.length;
    const kind = g.ck && second ? 'city' : 'settlement';
    g.cur = i;
    g.ask(p.id, 'place', {
      kind, second,
      why: (second ? 'Your second ' : 'Your first ') + kind + (second ? ' — it pays out one of everything around it.' : '.'),
      options: g.setupCorners()
    }, a => {
      g.placeBuilding(p, a.at, kind);
      g.say({ t: 'build', by: p.id, what: kind, at: a.at, setup: true });
      if (second) {
        const got = {};
        for (const h of g.B.corners[a.at].hexes) {
          const res = D.TERRAIN[g.hexes[h].t].res;
          if (res && g.gain(p, res, 1)) got[res] = (got[res] || 0) + 1;
        }
        g.say({ t: 'start', by: p.id, got });
      }
      g.ask(p.id, 'setupRoad', {
        corner: a.at, why: 'A road leading off it.',
        options: g.B.corners[a.at].edges.filter(e => g.roads[e] == null)
      }, b => {
        g.placeRoad(p, b.at);
        g.say({ t: 'build', by: p.id, what: 'road', at: b.at, setup: true });
        g.setupAt++;
        g.push(() => g.setupStep());
      }, b => (g.B.corners[a.at].edges.indexOf(b.at) >= 0 && g.roads[b.at] == null ? null : 'The road must leave the building you just placed.'));
    }, a => {
      if (!Number.isInteger(a.at) || !g.B.corners[a.at]) return 'Pick a crossing.';
      if (!g.emptyCorner(a.at)) return 'Somebody is already there.';
      if (!g.distanceOk(a.at)) return 'Too close — no building may stand next to another.';
      return null;
    });
  };
  P.placeBuilding = function (p, c, kind) {
    this.build[c] = { owner: p.i, kind, wall: false, metro: null, sideways: false };
    p.pieces[kind]--;
    this.updateLongest();
  };
  P.placeRoad = function (p, e) {
    this.roads[e] = p.i;
    p.pieces.road--;
    this.updateLongest();
  };

  /* ================================================================
     The turn
     ================================================================ */
  P.startPlay = function () {
    this.phase = 'play';
    this.say({ t: 'begin', first: this.players[this.first].id });
    this.beginTurn(this.first);
  };
  P.beginTurn = function (i) {
    const g = this;
    g.cur = i;
    g.turnNo++;
    g.turn = { rolled: false, devPlayed: false, fleet: null, promoted: {}, ended: false };
    g.offers = [];
    const p = g.players[i];
    g.say({ t: 'turn', by: p.id });
    /* Ten points reached on somebody else's turn win at the start of yours. */
    if (g.checkWin()) return;
    g.askTurn();
  };
  /* Five or six with paired turns: the player three seats on from the one who
     rolled takes an action phase of their own, on that roll. No dice, and no
     trading with other players — the bank and harbours, building and one card
     are all theirs. */
  P.beginPaired = function (j, p1) {
    const g = this;
    g.cur = j;
    g.turnNo++;
    g.turn = { rolled: true, devPlayed: false, fleet: null, promoted: {}, ended: false, paired: true, p1 };
    g.offers = [];
    const p = g.players[j];
    g.say({ t: 'paired', by: p.id, after: g.players[p1].id });
    if (g.checkWin()) return;
    g.askTurn();
  };
  /* Whose move it is once a turn is over. */
  P.afterTurn = function (p) {
    const g = this, T = g.turn;
    if (g.between === 'paired') {
      if (T.paired) g.beginTurn(g.left(T.p1));
      else g.beginPaired(g.left(p.i, 3), p.i);
      return;
    }
    if (g.between === 'build') { g.specialBuild(p.i, 1); return; }
    g.beginTurn(g.left(p.i));
  };
  P.askTurn = function () {
    const g = this;
    if (g.phase !== 'play' || g.turn.ended) return;
    const p = g.curP();
    const stage = g.turn.rolled ? 'main' : 'roll';
    g.ask(p.id, 'turn', {
      stage, paired: !!g.turn.paired,
      why: stage === 'roll' ? 'Roll the dice.'
        : g.turn.paired ? 'Your paired turn: trade with the bank, build, play a card — no trading with other players.'
          : 'Trade, build, play cards — then end your turn.'
    }, a => g.turnDo(p, a), a => g.turnCheck(p, a));
  };

  /* One place that says what a turn action needs, and one that does it. */
  P.turnCheck = function (p, a) {
    const g = this, T = g.turn, i = p.i;
    const main = T.rolled;
    switch (a.t) {
      case 'roll':
        if (T.paired) return 'A paired turn has no roll — it plays on ' + g.players[T.p1].name + '’s.';
        return main ? 'You have rolled already.' : null;
      case 'end':
        return main ? null : 'Roll first.';
      case 'build': {
        if (!main) return 'Roll first.';
        const w = a.what, at = a.at;
        if (!Number.isInteger(at)) return 'Pick a spot on the board.';
        if (w === 'road') {
          if (!g.B.edges[at]) return 'Pick a path.';
          if (p.pieces.road <= 0) return 'All fifteen of your roads are on the board.';
          if (g.roads[at] != null) return 'There is a road there already.';
          if (!g.roadConnects(at, i)) return 'A road has to join one of your own roads or buildings.';
          if (!g.has(p, D.COST.road)) return 'A road costs a wood and a brick.';
          return null;
        }
        if (w === 'settlement') {
          if (!g.B.corners[at]) return 'Pick a crossing.';
          if (p.pieces.settlement <= 0) return 'All five of your settlements are on the board — upgrade one to a city first.';
          if (!g.emptyCorner(at)) return 'That crossing is taken.';
          if (!g.distanceOk(at)) return 'Too close — no building may stand next to another.';
          if (!g.ownRoadAt(at, i)) return 'A settlement has to stand on one of your roads.';
          if (!g.has(p, D.COST.settlement)) return 'A settlement costs a wood, a brick, a wool and a wheat.';
          return null;
        }
        if (w === 'city') {
          if (!g.B.corners[at]) return 'Pick a settlement.';
          const b = g.build[at];
          if (!b || b.owner !== i || b.kind !== 'settlement') return 'A city goes on one of your own settlements.';
          if (g.legalCities(i).indexOf(at) < 0) return p.pieces.city <= 0 ? 'All four of your cities are on the board.' : 'Your pillaged city has to be rebuilt first.';
          if (!g.has(p, D.COST.city)) return 'A city costs three ore and two wheat.';
          return null;
        }
        if (w === 'wall') {
          if (!g.ck) return 'No walls in the base game.';
          const b = g.build[at];
          if (!b || b.owner !== i || b.kind !== 'city') return 'A wall goes under one of your cities.';
          if (b.wall) return 'That city has a wall already.';
          if (p.pieces.wall <= 0) return 'All three of your walls are built.';
          if (!g.has(p, D.COST.wall)) return 'A city wall costs two brick.';
          return null;
        }
        if (w === 'knight') {
          if (!g.ck) return 'No knights on the board in the base game.';
          if (p.kn[1] <= 0) return 'Both your basic knights are out — promote one to free it.';
          if (!g.B.corners[at] || !g.emptyCorner(at)) return 'A knight needs an empty crossing.';
          if (!g.ownRoadAt(at, i)) return 'A knight has to stand on one of your roads.';
          if (!g.has(p, D.COST.knight)) return 'A knight costs a wool and an ore.';
          return null;
        }
        return 'Build what?';
      }
      case 'buy':
        if (g.ck) return 'No development cards in Cities & Knights.';
        if (!main) return 'Roll first.';
        if (!g.devDeck.length) return 'The development deck is empty.';
        if (!g.has(p, D.COST.dev)) return 'A development card costs a wool, a wheat and an ore.';
        return null;
      case 'play':
        return g.ck ? g.progCheck(p, a) : g.devCheck(p, a);
      case 'bank': {
        if (!main) return 'Roll first.';
        const give = a.give, get = a.get;
        if (!g.isType(give) || !g.isType(get)) return 'Trade what for what?';
        if (give === get) return 'That would be the same card back.';
        const r = g.rate(i, give);
        if (p.hand[give] < r) return 'You need ' + r + ' ' + D.cardName(give) + ' for that.';
        if (g.bank[get] <= 0) return 'The bank has no ' + D.cardName(get) + ' left.';
        return null;
      }
      case 'improve': {
        if (!g.ck) return 'Not in the base game.';
        if (!main) return 'Roll first.';
        return g.improveCheck(p, a.track, 0);
      }
      case 'promote': {
        if (!g.ck || !main) return main ? 'Not in the base game.' : 'Roll first.';
        const k = g.knight(a.knight);
        if (!k || k.owner !== i) return 'Pick one of your knights.';
        return g.promotable(k, false);
      }
      case 'activate': {
        if (!g.ck || !main) return main ? 'Not in the base game.' : 'Roll first.';
        const k = g.knight(a.knight);
        if (!k || k.owner !== i) return 'Pick one of your knights.';
        if (k.active) return 'That knight is already active.';
        if (!g.has(p, D.COST.activate)) return 'Activating a knight costs a wheat.';
        return null;
      }
      case 'kmove': case 'displace': {
        if (!g.ck || !main) return main ? 'Not in the base game.' : 'Roll first.';
        const k = g.knight(a.knight);
        if (!k || k.owner !== i) return 'Pick one of your knights.';
        if (!k.active) return 'Only an active knight can act.';
        if (k.lock === g.turnNo) return 'A knight woken this turn cannot act until your next one.';
        const reach = g.knightReach(k.at, i, k.level);
        if (a.t === 'kmove') return reach.empty.indexOf(a.to) >= 0 ? null : 'Your knight cannot reach there along your roads.';
        return reach.displace.indexOf(a.to) >= 0 ? null : 'Your knight can only displace a weaker knight it can reach along your roads.';
      }
      case 'chase': {
        if (!g.ck || !main) return main ? 'Not in the base game.' : 'Roll first.';
        if (g.robber == null) return 'The robber is not on the board until the barbarians first land.';
        const k = g.knight(a.knight);
        if (!k || k.owner !== i) return 'Pick one of your knights.';
        if (!g.ready(k)) return k.active ? 'A knight woken this turn cannot act until your next one.' : 'Only an active knight can act.';
        if (g.B.hexes[g.robber].corners.indexOf(k.at) < 0) return 'That knight is not beside the robber.';
        return null;
      }
    }
    return 'That is not something you can do now.';
  };

  P.turnDo = function (p, a) {
    const g = this;
    if (a.t === 'end') { g.endTurn(p); return; }
    g.actDo(p, a);
    g.push(() => g.askTurn());
  };
  /* Carry out a checked action: a turn's, or a special build's. */
  P.actDo = function (p, a) {
    const g = this, i = p.i;
    switch (a.t) {
      case 'roll':
        g.doRoll(null);
        break;
      case 'build': {
        const w = a.what, at = a.at;
        if (w === 'road') { g.pay(p, D.COST.road); g.placeRoad(p, at); }
        else if (w === 'settlement') { g.pay(p, D.COST.settlement); g.placeBuilding(p, at, 'settlement'); }
        else if (w === 'city') { g.pay(p, D.COST.city); g.upgrade(p, at); }
        else if (w === 'wall') { g.pay(p, D.COST.wall); g.build[at].wall = true; p.pieces.wall--; }
        else if (w === 'knight') { g.pay(p, D.COST.knight); g.recruit(p, at, 1, false); }
        g.say({ t: 'build', by: p.id, what: w, at });
        break;
      }
      case 'buy': {
        g.pay(p, D.COST.dev);
        const key = g.devDeck.shift();
        p.dev.push({ key, turn: g.turnNo });
        g.say({ t: 'buy', by: p.id });
        g.note(p.id, { t: 'bought', card: key });
        break;
      }
      case 'play':
        if (g.ck) g.progDo(p, a); else g.devDo(p, a);
        break;
      case 'bank': {
        const r = g.rate(i, a.give);
        p.hand[a.give] -= r; g.bank[a.give] += r;
        g.bank[a.get] -= 1; p.hand[a.get] += 1;
        g.say({ t: 'bank', by: p.id, give: a.give, n: r, get: a.get });
        g.offers = g.offers.filter(o => g.offerLive(o));
        break;
      }
      case 'improve':
        g.improve(p, a.track, 0);
        break;
      case 'promote': {
        g.pay(p, D.COST.promote);
        g.promote(g.knight(a.knight));
        break;
      }
      case 'activate': {
        const k = g.knight(a.knight);
        g.pay(p, D.COST.activate);
        k.active = true; k.lock = g.turnNo;
        g.say({ t: 'activate', by: p.id, knight: k.id, at: k.at, level: k.level });
        break;
      }
      case 'kmove': {
        const k = g.knight(a.knight);
        const from = k.at;
        k.at = a.to; k.active = false;
        g.say({ t: 'kmove', by: p.id, from, to: a.to, level: k.level });
        g.updateLongest();
        break;
      }
      case 'displace': {
        const k = g.knight(a.knight);
        const victim = g.knightAt(a.to);
        const from = k.at;
        k.at = a.to; k.active = false;
        g.say({ t: 'displace', by: p.id, from, to: a.to, level: k.level, whom: g.players[victim.owner].id, vlevel: victim.level });
        g.bounce(victim, a.to);
        g.push(() => g.updateLongest());
        break;
      }
      case 'chase': {
        const k = g.knight(a.knight);
        k.active = false;
        g.say({ t: 'chase', by: p.id, at: k.at, level: k.level });
        g.robberFlow(p, 'one', 'Your knight chases the robber away — where to?');
        break;
      }
    }
  };

  P.endTurn = function (p) {
    const g = this;
    const pass = () => {
      g.turn.ended = true;
      g.offers = [];
      g.say({ t: 'end', by: p.id });
      g.push(() => g.afterTurn(p));
    };
    if (g.ck && p.prog.length > D.PROGRESS_LIMIT) {
      g.progDiscard(p, () => pass());
      return;
    }
    pass();
  };

  /* ---------------- the special building phase (five or six, older rule) ----
     When a turn ends, every other player in turn from the next seat may build
     with what is in their hand: roads, settlements, cities, development cards
     — with Cities & Knights, walls, knights and improvements, and activating
     or promoting knights. No trading of any kind, no cards played, no knight
     actions. Only somebody with something they can build is asked; they are
     asked again after each build until they say they are done. */
  const SPECIAL_ACTS = ['done', 'build', 'buy', 'improve', 'promote', 'activate'];
  P.specialBuild = function (from, k) {
    const g = this;
    if (k >= g.players.length) { g.sbp = null; g.beginTurn(g.left(from)); return; }
    g.sbp = { from, k };
    const p = g.players[g.left(from, k)];
    const next = () => g.push(() => g.specialBuild(from, k + 1));
    if (!g.specialCan(p).any) { next(); return; }
    g.ask(p.id, 'special', {
      after: g.players[from].id,
      why: 'Special building after ' + g.players[from].name + '’s turn: build with the cards in your hand — no trading, no cards played.'
    }, a => {
      if (a.t === 'done') { next(); return; }
      g.actDo(p, a);
      g.push(() => g.specialBuild(from, k));
    }, a => g.specialCheck(p, a));
  };
  P.specialCheck = function (p, a) {
    if (SPECIAL_ACTS.indexOf(a.t) < 0) return a.t === 'bank' || TRADE_ACTS.indexOf(a.t) >= 0
      ? 'No trading in the special building phase — only the cards in your hand.'
      : a.t === 'play' ? 'No cards are played in the special building phase.' : 'Only building now.';
    if (a.t === 'done') return null;
    return this.turnCheck(p, a);
  };
  /* What a player could do in a special building phase right now. */
  P.specialCan = function (p) {
    const g = this, i = p.i;
    const can = {
      stage: 'special', trade: false, afford: {},
      road: [], settlement: [], city: [], wall: [], knight: [],
      promote: [], activate: [], kmove: {}, displace: {}, chase: [],
      improve: {}, buy: false, play: {}, bank: {}
    };
    for (const k of Object.keys(D.COST)) can.afford[k] = g.has(p, D.COST[k]);
    const not = 'Not in the special building phase.';
    if (!g.ck) { for (const d of p.dev) if (d.key !== 'vp') can.play[d.key] = not; }
    else for (const k of p.prog) can.play[k] = not;
    can.road = g.legalRoads(i);
    can.settlement = g.legalSettlements(i);
    can.city = g.legalCities(i);
    can.buy = !g.ck && g.devDeck.length > 0;
    let any = (can.afford.road && can.road.length) || (can.afford.settlement && can.settlement.length) ||
      (can.afford.city && can.city.length) || (can.buy && can.afford.dev);
    if (g.ck) {
      can.wall = g.legalWalls(i);
      can.knight = p.kn[1] > 0 ? g.legalKnightSpots(i) : [];
      for (const k of g.knights) {
        if (k.owner !== i) continue;
        if (!g.promotable(k, true)) can.promote.push(k.id);
        if (!k.active) can.activate.push(k.id);
      }
      for (const t of D.TRACKS) {
        const c = g.improveCost(p, t, 0);
        can.improve[t] = { level: c.level, cost: c.n, com: c.com, why: g.improveCheck(p, t, 0) };
        if (!can.improve[t].why) any = true;
      }
      any = any || (can.afford.wall && can.wall.length) || (can.afford.knight && can.knight.length) ||
        (can.afford.promote && can.promote.length) || (can.afford.activate && can.activate.length);
    }
    can.any = !!any;
    return can;
  };

  /* ---------------- dice ---------------- */
  P.die = function () { return 1 + Math.floor(this.r() * 6); };
  P.doRoll = function (fixed) {
    const g = this, p = g.curP();
    const y = fixed ? fixed.y : g.die();
    const r = fixed ? fixed.r : g.die();
    const e = g.ck ? D.EVENT_FACES[g.die() - 1] : null;
    g.turn.rolled = true;
    g.dice = { y, r, e, sum: y + r, n: ++g.rollN, by: p.id, fixed: !!fixed };
    g.say({ t: 'roll', by: p.id, y, r, e, sum: y + r, fixed: !!fixed });
    if (g.ck) g.push(() => g.eventDie(e, r));
    g.push(() => (y + r === 7 ? g.seven() : g.produce(y + r)));
  };
  /* Tests and the Alchemy card set the dice; nothing else does. */
  P.rollWith = function (y, r, e) {
    const g = this, p = g.curP();
    g.turn.rolled = true;
    g.dice = { y, r, e: g.ck ? e : null, sum: y + r, n: ++g.rollN, by: p.id, fixed: true };
    g.say({ t: 'roll', by: p.id, y, r, e: g.dice.e, sum: y + r, fixed: true });
    if (g.ck) g.push(() => g.eventDie(e, r));
    g.push(() => (y + r === 7 ? g.seven() : g.produce(y + r)));
  };

  /* ---------------- production ---------------- */
  P.produce = function (total) {
    const g = this;
    const owed = g.players.map(() => blankHand());
    g.hexes.forEach((h, hid) => {
      if (h.n !== total || hid === g.robber) return;
      const T = D.TERRAIN[h.t];
      if (!T.res) return;
      for (const c of g.B.hexes[hid].corners) {
        const b = g.build[c];
        if (!b) continue;
        const o = owed[b.owner];
        if (b.kind === 'settlement') o[T.res] += 1;
        else if (!g.ck || !T.com) o[T.res] += 2;
        else { o[T.res] += 1; o[T.com] += 1; }
      }
    });
    /* Not enough in the bank for everybody who is owed a type: nobody gets it,
       unless only one player is owed it — then they take what is left. */
    const gains = {}, short = [];
    for (const k of g.TYPES) {
      const want = owed.reduce((s, o) => s + o[k], 0);
      if (!want) continue;
      const who = owed.map((o, i) => (o[k] ? i : -1)).filter(i => i >= 0);
      if (want > g.bank[k] && who.length > 1) { short.push(k); continue; }
      for (const i of who) {
        const got = g.gain(g.players[i], k, owed[i][k]);
        if (got) { const id = g.players[i].id; (gains[id] = gains[id] || {})[k] = got; }
        if (got < owed[i][k]) short.push(k);
      }
    }
    g.say({ t: 'produce', sum: total, gains, short });
    /* The Aqueduct: a roll that brought you nothing brings you one resource of
       your choice instead. */
    if (g.ck) {
      for (const p of g.round(g.cur)) {
        if (p.impr.science < 3 || gains[p.id]) continue;
        const options = D.RES.filter(k => g.bank[k] > 0);
        if (!options.length) continue;
        g.ask(p.id, 'aqueduct', { why: 'The Aqueduct: this roll brought you nothing, so take one resource.', options },
          a => { g.gain(p, a.res, 1); g.say({ t: 'aqueduct', by: p.id, res: a.res }); },
          /* Several players choose at once from one bank, so what was on offer
             when the question went out may have gone by the time it is
             answered: judge against the bank now, and if the bank is bare,
             accept anything (it pays nothing). */
          a => (g.isRes(a.res) && (g.bank[a.res] > 0 || D.RES.every(k => g.bank[k] === 0)) ? null : 'Pick a resource the bank still has.'));
      }
    }
  };

  /* ---------------- the 7 and the robber ---------------- */
  P.seven = function () {
    const g = this;
    for (const p of g.round(g.cur)) {
      const n = g.cardCount(p);
      const lim = g.limit(p);
      if (n <= lim) continue;
      const need = Math.floor(n / 2);
      g.discardAsk(p, need, 'A 7 — you hold ' + n + ' cards, so ' + need + ' go back to the bank.', 'seven');
    }
    g.push(() => {
      if (g.robber == null) { g.say({ t: 'robberAsleep' }); return; }
      g.robberFlow(g.curP(), 'one', 'Move the robber.');
    });
  };
  P.discardAsk = function (p, need, why, cause) {
    const g = this;
    g.ask(p.id, 'discard', { need, why, cause }, a => {
      const c = g.cleanCards(a.cards);
      for (const k in c) { p.hand[k] -= c[k]; g.bank[k] += c[k]; }
      g.say({ t: 'discard', by: p.id, cards: c, n: need, cause });
    }, a => g.validCards(p, a.cards, need));
  };
  /* Move the robber, then rob one player (`one`) or every player on the hex
     (`each`, the Taxation card). */
  P.robberFlow = function (p, mode, why) {
    const g = this;
    const options = g.hexes.map((h, i) => i).filter(i => i !== g.robber);
    g.ask(p.id, 'robber', { why, mode, options }, a => {
      const from = g.robber;
      g.robber = a.hex;
      g.say({ t: 'robber', by: p.id, from, to: a.hex });
      g.push(() => g.robStep(p, a.hex, mode));
    }, a => (options.indexOf(a.hex) >= 0 ? null : 'The robber has to move to another hex.'));
  };
  P.robStep = function (p, hex, mode) {
    const g = this;
    const who = g.robberVictims(hex, p.i).filter(i => g.cardCount(g.players[i]) > 0);
    if (!who.length) { g.say({ t: 'robNobody', by: p.id }); return; }
    if (mode === 'each') { for (const i of who) g.steal(p, g.players[i]); return; }
    if (who.length === 1) { g.steal(p, g.players[who[0]]); return; }
    const options = who.map(i => g.players[i].id);
    g.ask(p.id, 'steal', { why: 'Whom do you rob?', options, counts: who.map(i => g.cardCount(g.players[i])) },
      a => g.steal(p, g.seat(a.from)),
      a => (options.indexOf(String(a.from)) >= 0 ? null : 'Pick somebody with a building on that hex.'));
  };
  P.steal = function (p, v) {
    const g = this;
    const k = g.randomCard(v);
    if (!k) return;
    v.hand[k]--; p.hand[k]++;
    g.say({ t: 'steal', by: p.id, from: v.id });
    g.note(p.id, { t: 'stole', from: v.id, card: k });
    g.note(v.id, { t: 'robbed', by: p.id, card: k });
  };

  /* ================================================================
     Base game: development cards
     ================================================================ */
  P.devCheck = function (p, a) {
    const g = this;
    const idx = p.dev.findIndex(d => d.key === a.card && d.turn !== g.turnNo);
    if (!D.DEV[a.card]) return 'Play which card?';
    if (a.card === 'vp') return 'Victory points stay face down until they win you the game.';
    if (g.turn.devPlayed) return 'One development card a turn.';
    if (idx < 0) return p.dev.some(d => d.key === a.card) ? 'A card bought this turn cannot be played until your next.' : 'You do not hold that card.';
    if (a.card === 'roads' && !g.legalRoads(p.i).length) return 'There is nowhere for a road to go.';
    return null;
  };
  P.devDo = function (p, a) {
    const g = this;
    const idx = p.dev.findIndex(d => d.key === a.card && d.turn !== g.turnNo);
    p.dev.splice(idx, 1);
    g.turn.devPlayed = true;
    g.say({ t: 'dev', by: p.id, card: a.card });
    if (a.card === 'knight') {
      p.knightsPlayed++;
      g.updateLargest(p);
      g.robberFlow(p, 'one', 'Your knight moves the robber.');
    } else if (a.card === 'roads') {
      g.freeRoads(p, 2);
    } else if (a.card === 'plenty') {
      g.ask(p.id, 'plenty', { why: 'Year of Plenty: take any two resources.', options: D.RES.filter(k => g.bank[k] > 0) }, b => {
        const got = {};
        for (const k of b.res) if (g.gain(p, k, 1)) got[k] = (got[k] || 0) + 1;
        g.say({ t: 'plenty', by: p.id, got });
      }, b => {
        if (!Array.isArray(b.res) || b.res.length < 1 || b.res.length > 2) return 'Pick two resources.';
        const want = {};
        for (const k of b.res) { if (!g.isRes(k)) return 'Pick resources.'; want[k] = (want[k] || 0) + 1; }
        const room = D.RES.reduce((s, k) => s + Math.min(2, g.bank[k]), 0);
        if (b.res.length < 2 && room >= 2) return 'Pick two resources.';
        for (const k in want) if (g.bank[k] < want[k]) return 'The bank has only ' + g.bank[k] + ' ' + D.cardName(k) + '.';
        return null;
      });
    } else if (a.card === 'monopoly') {
      g.ask(p.id, 'monopoly', { why: 'Monopoly: name a resource.', options: D.RES.slice() }, b => {
        let n = 0;
        const from = {};
        for (const o of g.players) if (o !== p) { const m = g.move(o, p, b.res, o.hand[b.res]); if (m) from[o.id] = m; n += m; }
        g.say({ t: 'monopoly', by: p.id, res: b.res, n, from });
      }, b => (g.isRes(b.res) ? null : 'Name a resource.'));
    }
  };
  /* Free roads (Road Building), one at a time; you may stop early. */
  P.freeRoads = function (p, left) {
    const g = this;
    if (left <= 0) return;
    const options = g.legalRoads(p.i);
    if (!options.length) { g.say({ t: 'noRoad', by: p.id }); return; }
    g.ask(p.id, 'freeRoad', { left, why: left > 1 ? 'Lay a road for nothing — ' + left + ' to go.' : 'Lay your free road.', options }, a => {
      if (a.t === 'skip') { g.say({ t: 'skipRoad', by: p.id }); return; }
      g.placeRoad(p, a.at);
      g.say({ t: 'build', by: p.id, what: 'road', at: a.at, free: true });
      g.push(() => g.freeRoads(p, left - 1));
    }, a => (a.t === 'skip' || options.indexOf(a.at) >= 0 ? null : 'A road has to join your own network.'));
  };

  /* ================================================================
     Trading between players. Offers wait on nobody.
     ================================================================ */
  P.tradeWindow = function () {
    const pr = this.prompts.length === 1 ? this.prompts[0] : null;
    return this.phase === 'play' && this.turn && this.turn.rolled && !this.turn.paired && pr && pr.t === 'turn' && pr.seat === this.curP().id;
  };
  P.offerLive = function (o) {
    const a = this.seat(o.by);
    return !!a && this.has(a, o.give);
  };
  P.tradeAct = function (id, a) {
    const why = this.tradeActInner(id, a);
    /* An offer made, withdrawn or closed by the player whose turn it is is a
       step of their turn: the turn question gets a new number, like any other
       step, so a house player's pacing and a phone's screen both see it. */
    if (!why && this.turn && id === this.curP().id) {
      const pr = this.promptFor(id);
      if (pr && pr.t === 'turn') pr.n = ++this.n;
    }
    return why;
  };
  P.tradeActInner = function (id, a) {
    const g = this;
    const p = g.seat(id);
    if (!p) return 'You are not in this game.';
    const active = g.curP();
    if (a.t === 'withdraw') {
      const o = g.offers.find(x => x.id === a.offer);
      if (!o || o.by !== id) return 'That offer is not yours.';
      g.offers.splice(g.offers.indexOf(o), 1);
      g.say({ t: 'withdraw', by: id });
      return null;
    }
    if (g.turn && g.turn.paired && g.phase === 'play') return 'No trading between players on a paired turn — only with the bank.';
    if (!g.tradeWindow()) return 'Trading happens on a player’s turn, once they have rolled.';
    if (a.t === 'offer' || a.t === 'counter') {
      const mine = a.t === 'offer';
      if (mine && p !== active) return 'Only the player whose turn it is makes offers — you can reply to theirs.';
      if (!mine && p === active) return 'It is your turn: make an offer instead.';
      const give = g.cleanCards(a.give), get = g.cleanCards(a.get);
      if (!sum(give) || !sum(get)) return 'A trade has cards going both ways.';
      for (const k in give) if (get[k]) return 'You cannot trade ' + D.cardName(k) + ' for ' + D.cardName(k) + '.';
      const why = g.validCards(p, give);
      if (why) return why;
      let to = null;
      if (mine) {
        if (Array.isArray(a.to) && a.to.length) {
          to = a.to.map(String).filter(x => x !== id && g.seat(x));
          if (!to.length) return 'Offer it to somebody.';
        }
        g.offers = g.offers.filter(x => x.by !== id);
      } else {
        g.offers = g.offers.filter(x => x.by !== id);
        to = [active.id];
      }
      const o = { id: ++g.offerN, by: id, to, give, get, counter: !mine, replies: {} };
      g.offers.push(o);
      g.say({ t: mine ? 'offer' : 'counter', by: id, give, get, to });
      return null;
    }
    if (a.t === 'reply') {
      const o = g.offers.find(x => x.id === a.offer);
      if (!o || o.counter) return 'That offer has gone.';
      if (o.by === id) return 'That is your own offer.';
      if (o.to && o.to.indexOf(id) < 0) return 'That offer was not made to you.';
      if (a.yes && !g.has(p, o.get)) return 'You do not have what they are asking for.';
      o.replies[id] = !!a.yes;
      g.say({ t: 'reply', by: id, yes: !!a.yes });
      return null;
    }
    if (a.t === 'deal') {
      const o = g.offers.find(x => x.id === a.offer);
      if (!o) return 'That offer has gone.';
      if (p !== active) return 'Only the player whose turn it is closes a deal.';
      let giver, taker, give, get;
      if (o.counter) {
        giver = g.seat(o.by); taker = active;         // the counter's author hands over `give`
        give = o.give; get = o.get;
      } else {
        if (o.by !== id) return 'That offer is not yours.';
        const w = g.seat(a.with);
        if (!w || w === active) return 'Deal with whom?';
        if (o.replies[w.id] !== true) return w.name + ' has not accepted.';
        giver = active; taker = w;
        give = o.give; get = o.get;
      }
      if (!g.has(giver, give)) return giver.name + ' no longer has those cards.';
      if (!g.has(taker, get)) return taker.name + ' no longer has those cards.';
      for (const k in give) g.move(giver, taker, k, give[k]);
      for (const k in get) g.move(taker, giver, k, get[k]);
      g.say({ t: 'trade', a: giver.id, b: taker.id, gave: give, got: get });
      g.offers = [];
      return null;
    }
    return 'That is not a trade.';
  };

  /* ================================================================
     Cities & Knights: knights
     ================================================================ */
  P.recruit = function (p, at, level, active) {
    const k = { id: ++this.knightN, owner: p.i, level, active: !!active, at, lock: this.turnNo };
    this.knights.push(k);
    p.kn[level]--;
    this.updateLongest();
    return k;
  };
  P.promote = function (k) {
    const p = this.players[k.owner];
    p.kn[k.level]++;
    p.kn[k.level + 1]--;
    k.level++;
    if (this.turn) this.turn.promoted[k.id] = true;
    this.say({ t: 'promote', by: p.id, at: k.at, level: k.level });
  };
  P.removeKnight = function (k) {
    const p = this.players[k.owner];
    this.knights.splice(this.knights.indexOf(k), 1);
    p.kn[k.level]++;
    this.updateLongest();
  };
  /* A displaced knight's owner moves it along their own roads to an empty
     crossing, keeping its status — or loses it if there is nowhere to go. */
  P.bounce = function (k, from) {
    const g = this;
    const owner = g.players[k.owner];
    /* Lifted off the board while its owner decides, so no crossing ever
       holds two knights. */
    k.at = -1;
    const options = g.knightReach(from, k.owner, null).empty;
    if (!options.length) {
      g.removeKnight(k);
      g.say({ t: 'kLost', by: owner.id, level: k.level });
      return;
    }
    g.ask(owner.id, 'bounce', { knight: k.id, from, level: k.level, why: 'Your ' + D.KNIGHT_NAME[k.level] + ' knight was displaced — where does it go?', options }, a => {
      k.at = a.at;
      g.say({ t: 'bounced', by: owner.id, to: a.at, level: k.level });
      g.updateLongest();
    }, a => (options.indexOf(a.at) >= 0 ? null : 'It can only go along your own roads to an empty crossing.'));
  };

  /* ================================================================
     Cities & Knights: city improvements and metropolises
     ================================================================ */
  P.improveCost = function (p, track, discount) {
    const lvl = p.impr[track] + 1;
    return { level: lvl, com: D.TRACK[track].com, n: Math.max(0, lvl - (discount || 0)) };
  };
  /* Would reaching this level hand this player the metropolis? */
  P.metroGain = function (p, track, lvl) {
    if (lvl < 4) return false;
    const m = this.metro[track];
    if (!m) return true;
    if (m.seat === p.i) return false;
    return !m.perm && lvl === 5 && this.players[m.seat].impr[track] < 5;
  };
  P.improveCheck = function (p, track, discount) {
    if (D.TRACKS.indexOf(track) < 0) return 'Improve which track?';
    if (!this.hasCity(p.i)) return 'City improvements need a city on the board.';
    const c = this.improveCost(p, track, discount);
    if (c.level > 5) return 'That track is complete.';
    if (this.metroGain(p, track, c.level) && !this.freeCities(p.i).length)
      return 'That level brings the metropolis, and every city of yours already has one.';
    if (p.hand[c.com] < c.n) return D.TRACK[track].levels[c.level] + ' costs ' + c.n + ' ' + D.cardName(c.com) + '.';
    return null;
  };
  P.improve = function (p, track, discount) {
    const g = this;
    const c = g.improveCost(p, track, discount);
    const gain = g.metroGain(p, track, c.level);
    p.hand[c.com] -= c.n; g.bank[c.com] += c.n;
    p.impr[track] = c.level;
    g.say({ t: 'improve', by: p.id, track, level: c.level, paid: c.n });
    const m = g.metro[track];
    if (gain) {
      const took = m ? g.players[m.seat] : null;
      if (m) { g.build[m.at].metro = null; }
      const place = at => {
        g.build[at].metro = track;
        g.metro[track] = { seat: p.i, at, perm: c.level === 5 };
        g.say({ t: 'metro', by: p.id, track, at, from: took ? took.id : null, perm: c.level === 5 });
      };
      const free = g.freeCities(p.i);
      if (free.length === 1) place(free[0]);
      else g.ask(p.id, 'metroCity', { track, why: 'The ' + D.TRACK[track].name + ' metropolis — which city does it crown?', options: free },
        a => place(a.at), a => (free.indexOf(a.at) >= 0 ? null : 'Pick one of your cities without a metropolis.'));
    } else if (m && m.seat === p.i && c.level === 5 && !m.perm) {
      m.perm = true;
      g.say({ t: 'metroPerm', by: p.id, track });
    }
  };
  /* City from a settlement (a city piece in, a settlement piece back) — or a
     pillaged city standing on its side, turned upright. */
  P.upgrade = function (p, at) {
    const b = this.build[at];
    if (b.sideways) b.sideways = false;
    else { p.pieces.city--; p.pieces.settlement++; }
    b.kind = 'city';
  };

  /* ================================================================
     Cities & Knights: the event die and the barbarians
     ================================================================ */
  P.eventDie = function (e, red) {
    const g = this;
    if (e === 'ship') {
      g.barb++;
      g.say({ t: 'barb', at: g.barb });
      if (g.barb >= D.BARB_TRACK) g.attack();
      return;
    }
    const got = [];
    for (const p of g.round(g.cur)) {
      const lvl = p.impr[e];
      if (lvl < 1 || red > lvl + 1) continue;
      const card = g.draw(p, e);
      if (card) got.push(p.id);
    }
    g.say({ t: 'gate', track: e, red, who: got });
    g.push(() => g.handLimits());
  };
  /* Draw the top card of a progress deck. A victory point is laid face up at
     once; anything else goes into the hand. */
  P.draw = function (p, deck) {
    const g = this;
    const card = g.decks[deck].shift();
    if (!card) { g.say({ t: 'deckEmpty', deck }); return null; }
    if (D.PROGRESS[card].when === 'vp') {
      p.vpCards.push(card);
      g.say({ t: 'vpCard', by: p.id, card });
    } else {
      p.prog.push(card);
      g.say({ t: 'draw', by: p.id, deck });
      g.note(p.id, { t: 'drew', card });
    }
    return card;
  };
  /* Off your turn, four progress cards is the limit — over it and you discard
     at once. On your turn you have until the end of it. */
  P.handLimits = function () {
    const g = this;
    for (const p of g.players) if (p.i !== g.cur && p.prog.length > D.PROGRESS_LIMIT) g.progDiscard(p, null);
  };
  P.progDiscard = function (p, then) {
    const g = this;
    const need = p.prog.length - D.PROGRESS_LIMIT;
    g.ask(p.id, 'progDiscard', { need, why: 'Four progress cards is the limit — put ' + need + ' back.', options: p.prog.slice() }, a => {
      const cards = Array.isArray(a.cards) ? a.cards : [a.card];
      for (const c of cards) {
        const k = p.prog.indexOf(c);
        p.prog.splice(k, 1);
        g.decks[D.deckOf(c)].push(c);
      }
      g.say({ t: 'progDiscard', by: p.id, n: cards.length });
      if (then) g.push(then);
    }, a => {
      const cards = Array.isArray(a.cards) ? a.cards : [a.card];
      if (cards.length !== need) return 'Put back ' + need + '.';
      const left = p.prog.slice();
      for (const c of cards) { const k = left.indexOf(c); if (k < 0) return 'You do not hold that card.'; left.splice(k, 1); }
      return null;
    });
  };
  P.barbStrength = function () { let n = 0; for (const c in this.build) if (this.build[c].kind === 'city') n++; return n; };
  P.contribution = function (i) { return this.knights.filter(k => k.owner === i && k.active).reduce((s, k) => s + k.level, 0); };
  P.attack = function () {
    const g = this;
    const barb = g.barbStrength();
    const contrib = g.players.map(p => g.contribution(p.i));
    const def = contrib.reduce((s, v) => s + v, 0);
    const win = def >= barb;
    g.attacks++;
    const first = g.robber == null;
    if (first) g.robber = g.desert;
    g.lastAttack = { n: g.attacks, barb, def, win, contrib: {}, lost: [], hero: null, tied: [] };
    g.players.forEach((p, i) => { g.lastAttack.contrib[p.id] = contrib[i]; });
    g.say({ t: 'attack', barb, def, win, first });
    if (g.opts.show) g.hold = { t: 'attack', n: g.attacks };
    g.push(() => g.attackResult(win, contrib));
  };
  P.attackResult = function (win, contrib) {
    const g = this, A = g.lastAttack;
    if (!win) {
      const levels = Array.from(new Set(contrib)).sort((a, b) => a - b);
      for (const lvl of levels) {
        const victims = g.players.filter(p => contrib[p.i] === lvl && g.freeCities(p.i).length);
        if (!victims.length) continue;
        for (const v of victims) {
          const opts = g.freeCities(v.i);
          if (opts.length === 1) g.pillage(v, opts[0]);
          else g.ask(v.id, 'pillage', { why: 'The barbarians pillage one of your cities — which falls?', options: opts },
            a => g.pillage(v, a.at), a => (opts.indexOf(a.at) >= 0 ? null : 'Pick one of your cities without a metropolis.'));
        }
        break;
      }
    } else {
      const max = Math.max.apply(null, contrib);
      const tops = g.round(g.cur).filter(p => contrib[p.i] === max);
      if (max > 0 && tops.length === 1) {
        const h = tops[0];
        if (g.defenderLeft > 0) { g.defenderLeft--; h.defender++; }
        A.hero = h.id;
        g.say({ t: 'defender', by: h.id });
      } else if (max > 0) {
        A.tied = tops.map(p => p.id);
        g.say({ t: 'defTie', who: A.tied });
        for (const p of tops) g.push(() => g.defenderDraw(p));
        g.push(() => g.handLimits());
      }
    }
    g.push(() => {
      g.barb = 0;
      for (const k of g.knights) k.active = false;
      g.say({ t: 'barbHome' });
    });
  };
  P.defenderDraw = function (p) {
    const g = this;
    const options = D.TRACKS.filter(t => g.decks[t].length);
    if (!options.length) return;
    g.ask(p.id, 'defDeck', { why: 'A share in the defence of Catan: draw a progress card from the deck of your choice.', options },
      a => g.draw(p, a.deck), a => (options.indexOf(a.deck) >= 0 ? null : 'Pick a deck.'));
  };
  P.pillage = function (p, at) {
    const b = this.build[at];
    if (b.wall) { b.wall = false; p.pieces.wall++; }
    b.kind = 'settlement';
    if (p.pieces.settlement > 0) { p.pieces.settlement--; p.pieces.city++; b.sideways = false; }
    else b.sideways = true;
    this.lastAttack.lost.push({ id: p.id, at });
    this.say({ t: 'pillage', by: p.id, at });
  };

  /* ================================================================
     Cities & Knights: progress cards
     ================================================================ */
  P.progCheck = function (p, a) {
    const g = this;
    const key = a.card;
    const C = D.PROGRESS[key];
    if (!C) return 'Play which card?';
    if (p.prog.indexOf(key) < 0) return 'You do not hold that card.';
    if (C.when === 'vp') return 'That card is already face up.';
    if (C.when === 'roll' && g.turn.rolled) return 'Alchemy is played before the dice are rolled.';
    if (C.when !== 'roll' && !g.turn.rolled) return 'Progress cards are played after the dice — Alchemy is the only one before.';
    if (key === 'taxation' && g.robber == null) return 'Taxation waits until the barbarians have landed once and the robber is on the board.';
    return null;
  };
  P.progDo = function (p, a) {
    const g = this, key = a.card, i = p.i;
    p.prog.splice(p.prog.indexOf(key), 1);
    g.decks[D.deckOf(key)].push(key);
    g.say({ t: 'prog', by: p.id, card: key });
    const ask = (t, data, done, check) => g.ask(p.id, t, Object.assign({ card: key }, data), done, check);
    const others = g.round(i).filter(o => o !== p);
    switch (key) {
      case 'alchemy':
        ask('alchemy', { why: 'Alchemy: choose the two production dice.' }, b => g.doRoll({ y: b.y, r: b.r }),
          b => ([b.y, b.r].every(v => Number.isInteger(v) && v >= 1 && v <= 6) ? null : 'Each die shows 1 to 6.'));
        return;
      case 'crane': {
        const options = D.TRACKS.filter(t => !g.improveCheck(p, t, 1));
        if (!options.length) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        ask('crane', { why: 'Crane: which improvement, one commodity cheaper?', options }, b => g.improve(p, b.track, 1),
          b => (options.indexOf(b.track) >= 0 ? g.improveCheck(p, b.track, 1) : 'Pick a track you can raise.'));
        return;
      }
      case 'engineering': {
        const options = g.legalWalls(i);
        if (!options.length) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        const put = at => { g.build[at].wall = true; p.pieces.wall--; g.say({ t: 'build', by: p.id, what: 'wall', at, free: true }); };
        if (options.length === 1) { put(options[0]); return; }
        ask('wallAt', { why: 'Engineering: which city gets the wall?', options }, b => put(b.at),
          b => (options.indexOf(b.at) >= 0 ? null : 'Pick a city of yours without a wall.'));
        return;
      }
      case 'invention': {
        const options = g.hexes.map((h, k) => k).filter(k => g.hexes[k].n && [2, 6, 8, 12].indexOf(g.hexes[k].n) < 0);
        ask('invention', { why: 'Invention: swap two number discs (not a 2, 6, 8 or 12).', options }, b => {
          const x = g.hexes[b.a].n; g.hexes[b.a].n = g.hexes[b.b].n; g.hexes[b.b].n = x;
          g.say({ t: 'invention', by: p.id, a: b.a, b: b.b });
        }, b => (b.a !== b.b && options.indexOf(b.a) >= 0 && options.indexOf(b.b) >= 0 ? null : 'Pick two different discs you may move.'));
        return;
      }
      case 'irrigation': case 'mining': {
        const terr = key === 'irrigation' ? 'fields' : 'mountains';
        const res = D.TERRAIN[terr].res;
        const hexes = g.hexesOf(i).filter(h => g.hexes[h].t === terr);
        const got = g.gain(p, res, 2 * hexes.length);
        g.say({ t: key, by: p.id, res, n: got });
        return;
      }
      case 'medicine': {
        const options = g.legalCities(i);
        if (!options.length || !g.has(p, D.COST.medicine)) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        ask('medicine', { why: 'Medicine: which settlement becomes a city, for two ore and a wheat?', options }, b => {
          g.pay(p, D.COST.medicine); g.upgrade(p, b.at);
          g.say({ t: 'build', by: p.id, what: 'city', at: b.at, medicine: true });
        }, b => (options.indexOf(b.at) >= 0 && g.has(p, D.COST.medicine) ? null : 'Pick one of your settlements.'));
        return;
      }
      case 'roads':
        g.freeRoads(p, 2);
        return;
      case 'smithing':
        g.smith(p, 2);
        return;
      case 'harbor':
        g.push(() => g.harborStep(p, others.map(o => o.i), 0));
        return;
      case 'dues': {
        const mine = g.publicVP(p);
        const options = others.filter(o => g.publicVP(o) > mine).map(o => o.id);
        if (!options.length) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        ask('duesWho', { why: 'Guild Dues: whose hand do you look through?', options }, b => {
          const v = g.seat(b.who);
          const n = Math.min(2, g.cardCount(v));
          if (!n) { g.say({ t: 'dues', by: p.id, from: v.id, n: 0 }); return; }
          ask('duesTake', { from: v.id, need: n, hand: g.cleanCards(v.hand), why: 'Take ' + n + ' from ' + v.name + '’s hand.' }, c => {
            const cards = g.cleanCards(c.cards);
            for (const k in cards) g.move(v, p, k, cards[k]);
            g.say({ t: 'dues', by: p.id, from: v.id, n });
            g.note(p.id, { t: 'took', from: v.id, cards });
            g.note(v.id, { t: 'taken', by: p.id, cards });
          }, c => g.validCards(v, c.cards, n));
        }, b => (options.indexOf(String(b.who)) >= 0 ? null : 'Pick a player with more points than you.'));
        return;
      }
      case 'merchant': {
        const options = g.hexesOf(i);
        ask('merchant', { why: 'Merchant: stand him on a hex beside one of your buildings.', options }, b => {
          const from = g.merchant ? g.players[g.merchant.seat].id : null;
          g.merchant = { seat: i, hex: b.hex };
          g.say({ t: 'merchant', by: p.id, hex: b.hex, from });
        }, b => (options.indexOf(b.hex) >= 0 ? null : 'Pick a hex beside one of your buildings.'));
        return;
      }
      case 'fleet':
        ask('fleet', { why: 'Merchant Fleet: which card trades at 2:1 for the rest of your turn?', options: g.TYPES.slice() }, b => {
          g.turn.fleet = b.type;
          g.say({ t: 'fleet', by: p.id, type: b.type });
        }, b => (g.isType(b.type) ? null : 'Pick a resource or commodity.'));
        return;
      case 'resmono': case 'trademono': {
        const list = key === 'resmono' ? D.RES : D.COM;
        const each = key === 'resmono' ? 2 : 1;
        ask(key, { why: key === 'resmono' ? 'Resource Monopoly: name a resource.' : 'Trade Monopoly: name a commodity.', options: list.slice() }, b => {
          let n = 0; const from = {};
          for (const o of others) { const m = g.move(o, p, b.type, each); if (m) from[o.id] = m; n += m; }
          g.say({ t: key, by: p.id, type: b.type, n, from });
        }, b => (list.indexOf(b.type) >= 0 ? null : 'Pick one.'));
        return;
      }
      case 'diplomacy': {
        const options = g.openRoads();
        if (!options.length) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        ask('diplomacy', { why: 'Diplomacy: lift an open road.', options }, b => {
          const owner = g.players[g.roads[b.at]];
          delete g.roads[b.at];
          owner.pieces.road++;
          g.say({ t: 'diplomacy', by: p.id, at: b.at, whose: owner.id });
          g.updateLongest();
          if (owner === p) g.push(() => g.freeRoads(p, 1));
        }, b => (options.indexOf(b.at) >= 0 ? null : 'Pick an open road — one with a loose end.'));
        return;
      }
      case 'espionage': {
        const options = others.filter(o => o.prog.length).map(o => o.id);
        if (!options.length) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        ask('spyWho', { why: 'Espionage: whose progress cards do you look at?', options }, b => {
          const v = g.seat(b.who);
          ask('spyTake', { from: v.id, cards: v.prog.slice(), why: 'Take one of ' + v.name + '’s cards, or none.' }, c => {
            if (c.t === 'skip' || c.card == null) { g.say({ t: 'spy', by: p.id, from: v.id, took: false }); return; }
            v.prog.splice(v.prog.indexOf(c.card), 1);
            p.prog.push(c.card);
            g.say({ t: 'spy', by: p.id, from: v.id, took: true });
            g.note(p.id, { t: 'spied', from: v.id, card: c.card });
            g.note(v.id, { t: 'spiedOn', by: p.id, card: c.card });
          }, c => (c.t === 'skip' || c.card == null || v.prog.indexOf(c.card) >= 0 ? null : 'They do not hold that card.'));
        }, b => (options.indexOf(String(b.who)) >= 0 ? null : 'Pick another player with progress cards.'));
        return;
      }
      case 'encouragement': {
        let n = 0;
        for (const k of g.knights) if (k.owner === i && !k.active) { k.active = true; k.lock = g.turnNo; n++; }
        g.say({ t: 'encouragement', by: p.id, n });
        return;
      }
      case 'intrigue': {
        const options = g.knights.filter(k => k.owner !== i && g.ownRoadAt(k.at, i)).map(k => k.id);
        if (!options.length) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        ask('intrigue', { why: 'Intrigue: which knight on your roads is sent packing?', options, at: options.map(id => g.knight(id).at) }, b => {
          const k = g.knight(b.knight);
          g.say({ t: 'intrigue', by: p.id, whom: g.players[k.owner].id, at: k.at, level: k.level });
          g.bounceAway(k);
        }, b => (options.indexOf(b.knight) >= 0 ? null : 'Pick an opposing knight on one of your roads.'));
        return;
      }
      case 'taxation':
        g.robberFlow(p, 'each', 'Taxation: move the robber — everyone beside its new hex pays a card.');
        return;
      case 'treason': {
        const options = others.filter(o => g.knights.some(k => k.owner === o.i)).map(o => o.id);
        if (!options.length) { g.say({ t: 'noEffect', by: p.id, card: key }); return; }
        ask('treasonWho', { why: 'Treason: whose knight deserts?', options }, b => {
          const v = g.seat(b.who);
          const theirs = g.knights.filter(k => k.owner === v.i).map(k => k.id);
          const gone = k => {
            const was = { level: k.level, active: k.active, at: k.at };
            g.removeKnight(k);
            g.say({ t: 'treason', by: p.id, whom: v.id, level: was.level, at: was.at });
            g.push(() => g.treasonPlace(p, was));
          };
          if (theirs.length === 1) { gone(g.knight(theirs[0])); return; }
          g.ask(v.id, 'treasonGive', { by: p.id, why: p.name + ' plays Treason: which of your knights leaves the board?', options: theirs, at: theirs.map(id => g.knight(id).at) },
            c => gone(g.knight(c.knight)), c => (theirs.indexOf(c.knight) >= 0 ? null : 'Pick one of your knights.'));
        }, b => (options.indexOf(String(b.who)) >= 0 ? null : 'Pick a player with a knight on the board.'));
        return;
      }
      case 'wedding': {
        const mine = g.publicVP(p);
        for (const o of others) {
          if (g.publicVP(o) <= mine) continue;
          const n = Math.min(2, g.cardCount(o));
          if (!n) continue;
          g.ask(o.id, 'weddingGive', { to: p.id, need: n, why: p.name + '’s Wedding: give them ' + n + ' card' + (n === 1 ? '' : 's') + ' of your choice.' }, b => {
            const cards = g.cleanCards(b.cards);
            for (const k in cards) g.move(o, p, k, cards[k]);
            g.say({ t: 'wedding', by: o.id, to: p.id, n });
            g.note(p.id, { t: 'gift', from: o.id, cards });
            g.note(o.id, { t: 'gave', to: p.id, cards });
          }, b => g.validCards(o, b.cards, n));
        }
        return;
      }
      case 'sabotage': {
        const mine = g.publicVP(p);
        for (const o of others) {
          if (g.publicVP(o) < mine) continue;
          const n = Math.floor(g.cardCount(o) / 2);
          if (!n) continue;
          g.discardAsk(o, n, p.name + '’s Sabotage: discard ' + n + ' card' + (n === 1 ? '' : 's') + '.', 'sabotage');
        }
        return;
      }
    }
  };
  /* Promote up to `left` knights for nothing; stop whenever you like. */
  P.smith = function (p, left) {
    const g = this;
    if (left <= 0) return;
    const options = g.knights.filter(k => k.owner === p.i && !g.promotable(k, true)).map(k => k.id);
    if (!options.length) return;
    g.ask(p.id, 'smith', { card: 'smithing', left, why: 'Smithing: promote a knight for nothing (' + left + ' left).', options, at: options.map(id => g.knight(id).at) }, a => {
      if (a.t === 'skip') return;
      g.promote(g.knight(a.knight));
      g.push(() => g.smith(p, left - 1));
    }, a => (a.t === 'skip' || options.indexOf(a.knight) >= 0 ? null : 'Pick one of your knights that can be promoted.'));
  };
  /* Commercial Harbor: one offer to each other player in turn. */
  P.harborStep = function (p, list, k) {
    const g = this;
    if (k >= list.length) return;
    const o = g.players[list[k]];
    const next = () => g.push(() => g.harborStep(p, list, k + 1));
    const coms = D.COM.filter(c => o.hand[c] > 0);
    const res = D.RES.filter(r => p.hand[r] > 0);
    if (!coms.length || !res.length) { g.say({ t: 'harborNone', by: p.id, to: o.id }); next(); return; }
    g.ask(p.id, 'harborOffer', { card: 'harbor', to: o.id, why: 'Commercial Harbor: which resource do you hand ' + o.name + '?', options: res }, a => {
      if (a.t === 'skip') { next(); return; }
      g.ask(o.id, 'harborReply', { by: p.id, res: a.res, why: p.name + ' hands you a ' + D.cardName(a.res) + ' — which commodity do you give back?', options: coms }, b => {
        g.move(p, o, a.res, 1);
        g.move(o, p, b.com, 1);
        g.say({ t: 'harbor', by: p.id, to: o.id });
        g.note(p.id, { t: 'harborGot', from: o.id, card: b.com });
        g.note(o.id, { t: 'harborGave', to: p.id, card: b.com, got: a.res });
        next();
      }, b => (coms.indexOf(b.com) >= 0 && o.hand[b.com] > 0 ? null : 'Pick a commodity you hold.'));
    }, a => (a.t === 'skip' || (res.indexOf(a.res) >= 0 && p.hand[a.res] > 0) ? null : 'Pick a resource you hold.'));
  };
  /* Intrigue: no knight of yours needed — its owner relocates it or loses it. */
  P.bounceAway = function (k) {
    const from = k.at;
    this.bounce(k, from);
    this.push(() => this.updateLongest());
  };
  P.treasonPlace = function (p, was) {
    const g = this;
    const levels = [3, 2, 1].filter(l => l <= was.level && p.kn[l] > 0);
    const spots = g.legalKnightSpots(p.i);
    if (!levels.length || !spots.length) { g.say({ t: 'treasonNone', by: p.id }); return; }
    g.ask(p.id, 'treasonPlace', { card: 'treason', why: 'Treason: stand one of your knights on your roads — ' + (was.active ? 'active' : 'inactive') + ', like the one that left.', options: spots, levels }, a => {
      if (a.t === 'skip') { g.say({ t: 'treasonNone', by: p.id }); return; }
      const k = g.recruit(p, a.at, a.level, was.active);
      k.lock = g.turnNo;
      g.say({ t: 'build', by: p.id, what: 'knight', at: a.at, level: a.level, free: true });
    }, a => (a.t === 'skip' || (spots.indexOf(a.at) >= 0 && levels.indexOf(a.level) >= 0) ? null : 'Pick an empty crossing on your roads and a knight you have.'));
  };

  /* ================================================================
     What the telly and every phone may see
     ================================================================ */
  P.publicView = function () {
    const g = this;
    const pr = g.prompts.map(x => ({ n: x.n, seat: x.seat, t: x.t, why: x.why, need: x.need, card: x.card, stage: x.stage, kind: x.kind, paired: x.paired, after: x.after }));
    const T = g.turn;
    const live = g.phase === 'play' && T;
    return {
      v: VERSION, gid: g.gid, ck: g.ck, target: g.target, phase: g.phase,
      cur: g.phase === 'over' ? null : g.curP().id, turnNo: g.turnNo, first: g.players[g.first].id,
      stage: T ? (T.rolled ? 'main' : 'roll') : null,
      big: g.big, between: g.between,
      /* Paired turns: who rolled, and who follows on that roll. */
      paired: !!(live && T.paired),
      pair: live && g.between === 'paired'
        ? (T.paired ? { p1: g.players[T.p1].id, p2: g.curP().id, now: 'p2' } : { p1: g.curP().id, p2: g.players[g.left(g.cur, 3)].id, now: 'p1' })
        : null,
      special: g.sbp ? { after: g.players[g.sbp.from].id, who: g.players[g.left(g.sbp.from, g.sbp.k)].id } : null,
      supply: Object.assign({}, g.supply),
      layout: g.B.name,
      hexes: g.hexes.map(h => ({ t: h.t, n: h.n })),
      robber: g.robber, desert: g.desert, deserts: g.deserts.slice(),
      ports: g.ports.map(p => ({ edge: p.edge, kind: p.kind })),
      builds: Object.keys(g.build).map(c => {
        const b = g.build[c];
        return { at: +c, owner: g.players[b.owner].id, kind: b.kind, wall: b.wall, metro: b.metro, sideways: b.sideways };
      }),
      roads: Object.keys(g.roads).map(e => ({ at: +e, owner: g.players[g.roads[e]].id })),
      knights: g.knights.filter(k => k.at >= 0).map(k => ({ id: k.id, owner: g.players[k.owner].id, level: k.level, active: k.active, at: k.at, fresh: k.lock === g.turnNo })),
      bank: Object.assign({}, g.bank),
      devLeft: g.devDeck.length,
      decks: { trade: g.decks.trade.length, politics: g.decks.politics.length, science: g.decks.science.length },
      barb: g.barb, barbTrack: D.BARB_TRACK, attacks: g.attacks, lastAttack: g.lastAttack ? clone(g.lastAttack) : null,
      barbStrength: g.ck ? g.barbStrength() : 0,
      metro: clone(g.metro),
      merchant: g.merchant ? { seat: g.players[g.merchant.seat].id, hex: g.merchant.hex } : null,
      defenderLeft: g.defenderLeft,
      longest: g.longest ? { seat: g.players[g.longest.seat].id, len: g.longest.len } : null,
      largest: g.largest ? { seat: g.players[g.largest.seat].id, n: g.largest.n } : null,
      dice: g.dice ? Object.assign({}, g.dice) : null,
      fleet: g.turn && g.turn.fleet ? g.turn.fleet : null,
      players: g.players.map(p => ({
        id: p.id, name: p.name, hex: p.hex, bot: p.bot, i: p.i,
        vp: g.publicVP(p),
        cards: g.cardCount(p),
        limit: g.limit(p),
        dev: p.dev.length,
        knightsPlayed: p.knightsPlayed,
        prog: p.prog.length,
        vpCards: p.vpCards.slice(),
        impr: Object.assign({}, p.impr),
        defender: p.defender,
        pieces: Object.assign({}, p.pieces),
        kn: Object.assign({}, p.kn),
        roadLen: g.roadLength(p.i),
        strength: g.contribution(p.i),
        ports: g.portsOf(p.i)
      })),
      prompts: pr,
      offers: g.offers.map(o => clone(o)),
      log: g.log.slice(-60).map(e => clone(e)),
      logN: g.log.length,
      hold: g.hold ? Object.assign({}, g.hold) : null,
      result: g.result ? clone(g.result) : null
    };
  };

  /* One seat's own half: the hand, the cards, the question, and what it may do. */
  P.seatView = function (id) {
    const g = this;
    const p = g.seat(id);
    if (!p) return null;
    const pr = g.promptFor(id);
    const view = {
      id: p.id, i: p.i, name: p.name,
      hand: g.cleanCards(p.hand),
      dev: p.dev.map(d => ({ key: d.key, fresh: d.turn === g.turnNo })),
      prog: p.prog.slice(),
      vp: g.vp(p),
      prompt: pr ? clone(pr) : null,
      rates: g.rates(p.i),
      notes: (g.notes[id] || []).slice(-12),
      can: null
    };
    if (pr && pr.t === 'turn') view.can = g.canView(p);
    else if (pr && pr.t === 'special') view.can = g.specialCan(p);
    return view;
  };
  /* Everything a phone needs to draw the active player's buttons. The rules
     decide; the phone only paints. */
  P.canView = function (p) {
    const g = this, i = p.i, main = g.turn.rolled;
    const can = {
      stage: main ? 'main' : 'roll',
      paired: !!g.turn.paired,
      trade: !g.turn.paired,             // offers to and from the other players
      afford: {},
      road: [], settlement: [], city: [], wall: [], knight: [],
      promote: [], activate: [], kmove: {}, displace: {}, chase: [],
      improve: {}, buy: false, play: {}, bank: {}
    };
    for (const k of Object.keys(D.COST)) can.afford[k] = g.has(p, D.COST[k]);
    if (!g.ck) {
      for (const d of p.dev) if (d.key !== 'vp' && !can.play[d.key]) {
        const why = g.devCheck(p, { card: d.key });
        can.play[d.key] = why || null;
      }
    } else {
      for (const k of p.prog) if (!(k in can.play)) can.play[k] = g.progCheck(p, { card: k });
    }
    if (!main) return can;
    can.road = g.legalRoads(i);
    can.settlement = g.legalSettlements(i);
    can.city = g.legalCities(i);
    can.buy = !g.ck && g.devDeck.length > 0;
    for (const k of g.TYPES) can.bank[k] = g.rate(i, k);
    if (g.ck) {
      can.wall = g.legalWalls(i);
      can.knight = p.kn[1] > 0 ? g.legalKnightSpots(i) : [];
      for (const k of g.knights) {
        if (k.owner !== i) continue;
        if (!g.promotable(k, true)) can.promote.push(k.id);
        if (!k.active) can.activate.push(k.id);
        if (g.ready(k)) {
          const reach = g.knightReach(k.at, i, k.level);
          if (reach.empty.length) can.kmove[k.id] = reach.empty;
          if (reach.displace.length) can.displace[k.id] = reach.displace;
          if (g.robber != null && g.B.hexes[g.robber].corners.indexOf(k.at) >= 0) can.chase.push(k.id);
        }
      }
      for (const t of D.TRACKS) {
        const c = g.improveCost(p, t, 0);
        can.improve[t] = { level: c.level, cost: c.n, com: c.com, why: g.improveCheck(p, t, 0) };
      }
    }
    return can;
  };

  /* ================================================================ */
  function create(o) { return new Game(o); }
  const E = { VERSION, create, Game, rng, shuffle };
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.CatanEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
