'use strict';
/* Saint Petersburg — the rules. No DOM, no timers, one seeded rng.
 *
 * The display holds the one Game and every order — from a phone or from a
 * house player — goes through `g.act(seatId, action)`, which refuses with a
 * reason rather than a bare false. The handsets load this file too, so the
 * price a phone prints on a card is worked out by the same `priceOf()` that
 * takes the money.
 *
 * Three things shape the whole file.
 *
 * **Colour, not group, is what the game runs on.** A trading card is green,
 * blue or red; it is built over a card of its own colour and from then on it
 * is scored in that colour's phase like anything else. So a play area is
 * a column per colour — `area.green`, `area.yellow`, `area.blue`, `area.red` —
 * and almost nothing downstream has to know a trading card from a printed one.
 *
 * **The Market is an option, not a fork.** `create({market:true})` adds a fifth
 * phase, a fifth stack, a fifth start-player stone, two more cards on the
 * table and a yellow column; every other rule is untouched. The phase list,
 * the refill cycle and the board size are worked out once at `create` and read
 * off the Game from then on, so nothing downstream asks "are we playing the
 * Market?" — it asks how many phases there are.
 *
 * **Market tracks are DERIVED, never tracked.** The rulebook has to warn
 * players to keep their wooden markers honest when they build over a card
 * carrying a symbol. Here `goodsOf()` counts the roundels actually in front of
 * you, every time, so the drift the warning is about cannot happen.
 *
 * **One prompt at a time, and a forced choice answers itself.** `g.prompt`
 * says which seat has to answer, what for, and which answers are legal. A
 * prompt with exactly one legal answer resolves without being asked: putting
 * "you may buy 0 points at the pub" on a phone is a tap that could not have
 * gone any other way, and from the sofa it reads as the game having stalled.
 *
 * **Two things are secret, and they are the printed game's two.** The cards
 * behind your hand, and **what is in your purse** — "the players keep their
 * money secret from others during the game and may never tell others how much
 * they have". `publicView()` carries a hand's COUNT and no purse at all, and
 * the running total it reports is deliberately the part that does not include
 * money. See the guards in `../../tests/petersburg.js`.
 *
 * What stays public is what a table can see: the price somebody pays for a
 * card, and the income they take from the bank when a colour is scored. Both
 * happen in the open at a real table, and hiding them would make a scoring
 * phase silent. Anybody who wants to keep count on paper can, exactly as they
 * could sitting at the box — the rule is that nobody has to TELL you.
 */
(function (root) {
  'use strict';
  const D = (typeof module !== 'undefined' && module.exports) ? require('./sp-data.js') : root.SPData;

  const VERSION = 1;

  /* ---------- plumbing ---------- */

  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {                       // mulberry32
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
  /* `deal()` always pops off the END of a deck, so the very first cards laid
     out are whatever the shuffle happened to leave there. That is fine for
     every ordinary refill — but the OPENING deal is special-cased to offer
     only "buy", with no "hand" on the table at all (see options() below),
     and a Module 1 purple card can never be bought. Left alone, a shuffle
     that happens to put one in the last N slots hands the opening a card
     nobody has a legal move for. So: after shuffling the worker deck, swap
     any purple card out of the slice `deal()` is about to draw from with an
     ordinary worker further back in the stack — purple cards only ever turn
     up in a LATER worker phase, where hand and play are both on the table
     like normal. */
  function keepPurpleOutOfOpening(deck, openingSize) {
    const tailStart = Math.max(0, deck.length - openingSize);
    for (let i = deck.length - 1; i >= tailStart; i--) {
      if (!D.card(deck[i].key).purple) continue;
      for (let j = tailStart - 1; j >= 0; j--) {
        if (!D.card(deck[j].key).purple) { const t = deck[i]; deck[i] = deck[j]; deck[j] = t; break; }
      }
    }
  }
  const no = why => ({ ok: false, why });
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const def = inst => D.card(inst.key);

  /* ================================================================
     Scoring. Pure: a player in, a breakdown out. The phones use it for
     their own running total, so there is one answer to "what am I on".
     ================================================================ */

  /* Does this card wear the given worker symbol — or wear ALL of them, the
     way the Czar and (Module 1's) Czar-Superstar do. */
  const wearsSym = (inst, sym) => { const c = def(inst); return c.sym === sym || c.sym === 'any'; };

  /* What ONE card, on its own, pays its OWNER right now — a pure read, no
     mutation, so Module 1's Moocher can ask "what would this be worth" about
     an opponent's card without that card actually scoring. `income()` below
     is the sum of this over a colour, plus the two things that are not
     per-card (the observatory's free point, the debtor's prison and the
     sycophant, both of which are their own steps in scorePhase()). */
  function cardIncome(p, inst) {
    const c = def(inst);
    let r = 0, vp = 0;
    if (c.fn === 'mariinsky') vp = p.area.red.length;
    else if (c.fn === 'taxman') r = p.area.green.length;
    else if (c.fn === 'coffeehouse') r = p.area.red.length;
    else if (c.fn === 'mayor') r = p.area.blue.length;
    else if (c.fn === 'textile') vp = p.area.green.filter(i => wearsSym(i, 'cloth')).length * 2;
    else { r = c.r; vp = c.vp; }
    /* Jester and Banquet modify whatever they were assigned to for exactly
       its next scoring — a flag on the INSTANCE, not the definition, since
       two copies of the same card can be in two different states. Money
       Collector's "worth no points" is the same shape, but permanent. */
    if (inst.jester) { const t = r; r = vp; vp = t; }
    if (inst.banquet) { r *= 2; vp *= 2; }
    if (inst.noVp) vp = 0;
    return { r, vp };
  }

  /* What a colour pays this player when its phase is scored. */
  function income(p, color) {
    let r = 0, vp = 0;
    const bits = [];
    for (const inst of p.area[color]) {
      const c = def(inst);
      /* An Observatory pays only if it was not used this round, so it is
         counted once, below, rather than card by card. Module 2's Sycophant
         and Debtor's Prison are their own post-scoring steps in
         scorePhase() — a purse too thin for the Sycophant has to be checked
         AFTER everything else has landed, and the Prison's point depends on
         whether its OWN search was used this round, not on any card count. */
      if (c.fn === 'observatory' || c.fn === 'sycophant') continue;
      if (c.fn === 'debtorsprison') { if (!inst.prisonUsed) { vp += 1; bits.push({ key: c.key, vp: 1 }); } continue; }
      const got = cardIncome(p, inst);
      /* The flags are one-shot — clear them once they have actually paid out,
         which `cardIncome` itself must not do since Moocher calls it without
         anything really scoring. */
      inst.jester = false; inst.banquet = false;
      r += got.r; vp += got.vp;
      if (got.r || got.vp) bits.push({ key: c.key, r: got.r, vp: got.vp });
    }
    if (color === 'blue') {
      const free = observatoriesFree(p);
      if (free) { vp += free; bits.push({ key: 'observatory', vp: free }); }
    }
    return { r, vp, bits };
  }

  /* How many of a good this player has brought to market: the roundels on the
     cards actually in front of them, counted fresh. A '?' counts for whatever
     good its owner declared it to be. */
  function goodsOf(p, good) {
    let n = 0;
    for (const col of D.COLOR_IDS) for (const inst of p.area[col]) {
      const c = def(inst);
      if (!c.good) continue;
      if (c.good === good) n += c.goods;
      else if (c.good === 'any' && p.wild && p.wild[inst.uid] === good) n += c.goods;
    }
    return n;
  }
  const marketTrack = p => {
    const out = {};
    for (const g of D.GOOD_IDS) out[g] = goodsOf(p, g);
    return out;
  };

  const countFn = (p, fn) => D.COLOR_IDS.reduce((n, c) =>
    n + p.area[c].filter(i => def(i).fn === fn).length, 0);
  const hasFn = (p, fn) => countFn(p, fn) > 0;
  const observatoriesFree = p => Math.max(0, countFn(p, 'observatory') - (p.obsUsed || 0));

  /* ---------- Module 3: The Assistants ---------- */

  /* One assistant a seat, dealt once at setup. A 2- or 3-player table gets
     exactly as many assistants as there are seats and deals them out blind;
     a 4-player table sits the Master Craftsman out and hands the Mistress of
     the Manor to a NAMED seat first — the rules give her to whoever is
     sitting to the right of the player already holding the market's own
     start-player stone (the "sack") — before dealing the rest blind. */
  function setupAssistants(g) {
    const n = g.players.length;
    const ids = g.players.map(p => p.id);
    const rightOf = id => ids[(ids.indexOf(id) - 1 + n) % n];
    const pool = D.assistantsFor(n).slice();
    if (n >= 4) {
      const manorId = rightOf(ids[g.marker.market]);
      g.assistant[manorId] = 'manor';
      const rest = shuffle(pool.filter(a => a !== 'manor'), g.rng);
      ids.filter(id => id !== manorId).forEach((id, k) => { g.assistant[id] = rest[k]; });
    } else {
      const dealt = shuffle(pool, g.rng);
      ids.forEach((id, k) => { g.assistant[id] = dealt[k]; });
    }
  }

  /* "At the end of a round, after the exchange phase, pass the assistants
     counterclockwise" — the OPPOSITE direction from the start-player stones,
     which move left (index + 1). Passing to the right is index - 1: what
     player j holds next is whatever the player to THEIR left, j + 1, is
     holding now. */
  function rotateAssistants(g) {
    const ids = g.players.map(p => p.id);
    const n = ids.length;
    const next = {};
    for (let j = 0; j < n; j++) next[ids[j]] = g.assistant[ids[(j + 1) % n]];
    g.assistant = next;
  }

  /* What an assistant takes off a card's price, or 0 if this seat's assistant
     has nothing to say about it. The Czar's Daughter has no COLOUR — that is
     what says "any exchange card" here rather than one colour of them. */
  function assistantDiscount(g, p, c) {
    const a = g.assistants && g.assistant[p.id];
    if (!a) return 0;
    const def = D.ASSISTANTS[a];
    if (def.color == null) return c.group === 'trading' ? def.discount : 0;
    return def.color === c.color ? def.discount : 0;
  }

  /* What the room is allowed to add up: the points on the board, the bonus for
     different aristocrats and the penalty for a full hand — every one of which
     comes off a tableau everybody can see. The purse is not in it, and neither
     therefore is the total. */
  /* A purple card left in hand costs nothing at the end — "they do not
     reduce your score" — so it is the one kind of card the hand penalty
     skips counting at the FINAL count in score(), below.
     publicScore() deliberately does NOT make this distinction: it is shown
     live, mid-game, to the whole room, and hand CONTENT is the one thing
     that stays hidden. Card COUNT is already public, so a penalty of
     count × -5 leaks nothing — but count-minus-however-many-are-purple
     would leak exactly whether a hidden hand holds a purple card, which
     nobody watching is supposed to be able to tell. The live projection
     runs slightly pessimistic when Module 1 is on; the real rule still
     applies exactly at the end, in score(), by which point hands are no
     longer a secret anybody is keeping. */
  const penalisable = p => p.hand.filter(i => !def(i).purple).length;
  function publicScore(p) {
    const kinds = new Set(p.area.red.map(i => i.key));
    const nobles = D.nobleScore(kinds.size);
    const hand = p.hand.length * D.HAND_PENALTY;
    return { played: p.vp, nobles, nobleKinds: kinds.size, hand, open: p.vp + nobles + hand };
  }

  /* The final count. Distinct red cards, money, and what is still in hand. */
  function score(p) {
    const kinds = new Set(p.area.red.map(i => i.key));
    const nobles = D.nobleScore(kinds.size);
    const money = Math.floor(p.rubles / D.RUBLES_PER_POINT);
    const hand = penalisable(p) * D.HAND_PENALTY;
    return {
      played: p.vp, nobles, nobleKinds: kinds.size, money, hand,
      rubles: p.rubles,
      total: p.vp + nobles + money + hand
    };
  }

  /* ================================================================
     The game
     ================================================================ */

  function create(opts) {
    opts = opts || {};
    const seats = (opts.players || []).slice(0, D.PLAYERS.max);
    if (seats.length < D.PLAYERS.min) throw new Error('Saint Petersburg wants ' + D.PLAYERS.min + ' to ' + D.PLAYERS.max + ' players.');
    const g = Object.create(Game);
    g.version = VERSION;
    g.seed = (opts.seed >>> 0) || 1;
    g.rng = rngFrom(g.seed);
    g._uid = 0; g._pn = 0;
    g.log = [];
    g.queue = []; g.steps = []; g.prompt = null; g.ins = null;

    /* The Market, decided once and read off the Game everywhere after. */
    g.market = !!opts.market;
    g.phases = D.phasesFor(g.market);
    g.refill = D.refillAfter(g.market);
    g.boardSize = D.boardSize(g.market);
    g.deckNames = g.phases.map(ph => D.PHASE[ph].deck);

    /* Modules 1 and 2, likewise decided once. `mods` is what every deck below
       gets built with, so nothing downstream ever asks "is Module 2 on?" —
       it just finds (or doesn't find) the cards. */
    g.banquet = !!opts.banquet;
    g.banquetPurple = g.banquet && opts.banquetPurple !== false;
    g.company = !!opts.company;
    const mods = { banquet: g.banquet, banquetPurple: g.banquetPurple, company: g.company };

    g.players = seats.map(s => ({
      id: s.id, name: s.name, hex: s.hex || '#e8c267', bot: !!s.bot,
      rubles: D.START_RUBLES, vp: 0,
      hand: [], area: { green: [], yellow: [], blue: [], red: [] },
      /* Which good the Czar's '?' roundel was declared to be, by card. */
      wild: {},
      obsUsed: 0, pending: null,
      /* Module 1's Double Turn: actions still owed before control passes on. */
      bonusActions: 0
    }));
    const n = g.players.length;

    g.decks = {};
    for (const d of g.deckNames) g.decks[d] = shuffle(D.deckKeys(d, mods), g.rng).map(k => g.mk(k));
    if (g.decks.worker) keepPurpleOutOfOpening(g.decks.worker, D.startingCards(n));

    /* The five symbol tiles a '?' roundel can be declared to be. One each, and
       once a good is claimed it is out of the supply for good. */
    g.wilds = g.market ? D.GOOD_IDS.slice() : [];

    /* One stone a phase over two to four players: everybody gets at least one
       and nobody gets three. Dealt round robin over a shuffled table, which
       gives 2+2 at a table of two and one each at a table of four for free. */
    g.marker = {};
    const stones = shuffle(g.phases, g.rng);
    const seatOrder = shuffle(g.players.map((p, i) => i), g.rng);
    stones.forEach((phase, k) => { g.marker[phase] = seatOrder[k % n]; });

    /* Module 3: The Assistants — only playable with the Market, since the
       Mistress of the Manor discounts yellow cards. One a seat, always. */
    g.assistants = !!(opts.assistants && g.market);
    g.assistant = {};
    if (g.assistants) setupAssistants(g);

    g.top = []; g.bottom = []; g.discard = [];
    /* Purple cards go here once played, never to `discard` — "remove from
       the game" is the printed rule, and a Black Market fishing another
       purple card back out of the discard pile would let its one-off effect
       run twice. */
    g.removed = [];
    g.round = 1; g.phase = 'worker'; g.first = true;
    g.lastRound = false; g.endedBy = null;
    g.passes = 0; g.order = []; g.at = 0;
    g.result = null;
    /* What the phase that has just been scored paid each player. The telly
       puts it up over a plate; nothing in the rules reads it. */
    g.lastScore = null;

    /* Two workers a player, face up, and that is the whole opening board. */
    g.deal('worker', D.startingCards(n));
    g.say({ t: 'start', players: n, markers: Object.assign({}, g.marker) });
    g.startPhase('worker');
    g.run();
    return g;
  }

  const Game = {

    /* ---------- little things ---------- */

    mk(key) { return { uid: 'c' + (++this._uid), key }; },
    seat(id) { return this.players.find(p => p.id === id) || null; },
    idx(id) { return this.players.findIndex(p => p.id === id); },
    say(e) { this.log.push(Object.assign({ round: this.round, phase: this.phase }, e)); },
    n() { return this.players.length; },
    turnSeat() { return this.order[this.at] || null; },

    find(uid) {
      for (const row of ['top', 'bottom'])
        for (const inst of this[row]) if (inst.uid === uid) return { inst, row };
      return null;
    },
    inHand(p, uid) { return p.hand.find(i => i.uid === uid) || null; },
    handLimit(p) { return D.HAND_LIMIT + (hasFn(p, 'warehouse') ? 1 : 0); },

    /* ---------- money ----------
     *
     * Four reductions, all cumulative, and a floor of one ruble that a free
     * card does not get under: "he can never pay just 0".
     */
    reductions(p, c, row) {
      let cut = 0;
      const copies = D.COLOR_IDS.reduce((k, col) => k + p.area[col].filter(i => i.key === c.key).length, 0);
      cut += copies;                                   // one a copy already built
      if (row === 'bottom') cut += 1;                  // the cheaper row
      if (c.color === 'blue' && (hasFn(p, 'discountBlue') || hasFn(p, 'discountBoth'))) cut += 1;
      if (c.color === 'red' && (hasFn(p, 'discountRed') || hasFn(p, 'discountBoth'))) cut += 1;
      cut += assistantDiscount(this, p, c);
      return cut;
    },

    /* What this player would pay for this card right now. A trading card has
       no price of its own — it costs the difference over whatever it is built
       on, or one ruble when it is no dearer than that. */
    priceOf(p, inst, row, target) {
      const c = def(inst);
      let base;
      if (c.group === 'trading') {
        if (!target) return null;
        const t = def(target);
        const worth = t.worth != null ? t.worth : t.cost;
        base = c.cost > worth ? c.cost - worth : 1;
      } else base = c.cost;
      return Math.max(1, base - this.reductions(p, c, row));
    },

    /* ---------- building over ---------- */

    /* What a trading card may be built over. Green is pair to pair — a weaving
       mill only ever over a shepherd — except that Czar Peter can do it all
       and takes any green card. Blue and red go over anything of their colour.
       Nothing is ever built over a trading card. */
    targets(p, c) {
      if (c.group !== 'trading') return [];
      return p.area[c.color].filter(inst => {
        const t = def(inst);
        if (t.group === 'trading') return false;
        /* Module 1's Money Collector plays a card that can never be replaced —
           its whole point is that it is a bargain nobody can knock down. */
        if (t.noReplace) return false;
        if (c.color !== 'green') return true;
        /* Module 2's October Revolution has no `over` at all: like a blue or
           red trading card, it fits over any worker rather than one pair. */
        if (!c.over) return true;
        /* `family` catches a worker split into several roundel variants (the
           Ship Builder's five goods) under one displaceable identity, the way
           `key` alone does for a worker that is only ever printed once. */
        return t.anyGreen || t.key === c.over || t.family === c.over;
      });
    },
    payableTargets(p, inst, row) {
      const c = def(inst);
      return this.targets(p, c).filter(t => this.priceOf(p, inst, row, t) <= p.rubles);
    },
    /* The cheapest this card could possibly be to this player — what a phone
       prints on it before anyone has chosen what to knock down. */
    bestPrice(p, inst, row) {
      const c = def(inst);
      if (c.group !== 'trading') return this.priceOf(p, inst, row);
      const ts = this.targets(p, c);
      if (!ts.length) return null;
      return ts.reduce((m, t) => Math.min(m, this.priceOf(p, inst, row, t)), Infinity);
    },
    canBuy(p, inst, row) {
      const c = def(inst);
      if (c.group === 'trading') return this.payableTargets(p, inst, row).length > 0;
      return this.priceOf(p, inst, row) <= p.rubles;
    },

    /* ---------- placing ---------- */

    /* `from` is where the card came from — the board's two rows, a hand, or
       whatever the Observatory or a discard-pile search turned up — which is
       all a phone needs to tell the room "bought" from "played from hand". */
    place(p, inst, price, displaced, from) {
      const c = def(inst);
      p.rubles -= price;
      if (displaced) {
        const col = p.area[c.color];
        const k = col.indexOf(displaced);
        if (k >= 0) col.splice(k, 1);
        /* A card built over goes away, and so do its market roundels — which
           is the one piece of bookkeeping the rulebook warns players about.
           A declared '?' hands its symbol tile back to the supply. */
        if (p.wild[displaced.uid]) { this.wilds.push(p.wild[displaced.uid]); delete p.wild[displaced.uid]; }
        this.discard.push(displaced);
      }
      p.area[c.color].push(inst);
      this.say({ t: 'build', by: p.id, key: c.key, price, over: displaced ? def(displaced).key : null, from: from || null });
      /* The Czar's roundel is whichever good his owner names, out of whatever
         is left in the supply. */
      if (this.market && c.good === 'any' && this.wilds.length)
        this.push({ seat: p.id, t: 'wild', card: inst, why: 'What does the Czar bring to market?' });
    },

    /* ---------- the stacks and the board ---------- */

    deal(deckName, upTo) {
      const deck = this.decks[deckName];
      if (!deck) return;
      while (this.top.length + this.bottom.length < upTo && deck.length) {
        this.top.push(deck.pop());
        /* The last card of a stack reaching the board is the end of the game
           being called: this round finishes and that is that. */
        if (!deck.length && !this.lastRound) {
          this.lastRound = true; this.endedBy = deckName;
          this.say({ t: 'lastcard', deck: deckName });
        }
      }
    },

    /* ---------- phases ---------- */

    startPhase(phase) {
      this.phase = phase;
      const m = this.marker[phase];
      this.order = [];
      for (let k = 0; k < this.n(); k++) this.order.push(this.players[(m + k) % this.n()].id);
      this.at = 0;
      this.passes = 0;
      this.say({ t: 'phase', phase, first: this.order[0] });
      this.askTurn();
    },

    askTurn() {
      const id = this.turnSeat();
      if (!id) return;
      this.push({ seat: id, t: 'turn', why: this.first
        ? 'The first workers — you must buy one'
        : 'Buy, take a card in hand, play one from your hand, or pass' });
    },

    /* The actions are over when everybody has passed in turn. The very first
       worker phase is the exception the rules make: nobody may pass, and it
       runs until every player has their two workers. */
    actionsDone() {
      if (this.first) {
        return this.players.every(p => p.area.green.length >= 2) ||
          (!this.top.length && !this.bottom.length);
      }
      return this.passes >= this.n();
    },

    nextTurn() {
      this.at = (this.at + 1) % this.n();
      if (this.actionsDone()) {
        /* Said out loud so a phone can raise its own notice at the moment the
           actions genuinely stop — "everyone passed" when the whole phase ran
           out on consecutive passes, "no more actions" for the one phase where
           passing isn't even legal yet (the opening two workers). */
        this.say({ t: 'actionsDone', everyone: this.passes >= this.n() });
        this.steps.push({ s: 'endActions' }); return;
      }
      this.askTurn();
    },

    /* ---------- the market ---------- */

    goods(p, good) { return goodsOf(p, good); },
    /* The two numbers on this round's market tile: what first and second place
       are worth. It climbs every round and then stops. */
    marketValue() { return D.marketValue(this.round); },
    orangeCards(p) { return p.area.yellow.filter(i => def(i).orange); },

    /* Who is where on one good's track. Nobody at zero is on the track at all:
       the rulebook's own example scores a good that only one player brought
       anything of, and gives no second place for it. */
    standings(good) {
      const rows = this.players.map(p => ({ id: p.id, n: goodsOf(p, good) })).filter(r => r.n > 0);
      if (!rows.length) return { first: [], second: [], top: 0 };
      const top = rows.reduce((m, r) => Math.max(m, r.n), 0);
      const first = rows.filter(r => r.n === top).map(r => r.id);
      /* A tie for first takes BOTH first places and leaves no second. */
      if (first.length > 1) return { first, second: [], top };
      const rest = rows.filter(r => r.n < top);
      if (!rest.length) return { first, second: [], top };
      const next = rest.reduce((m, r) => Math.max(m, r.n), 0);
      return { first, second: rest.filter(r => r.n === next).map(r => r.id), top };
    },

    scoreMarketTracks() {
      const val = this.marketValue();
      for (const good of D.GOOD_IDS) {
        const st = this.standings(good);
        if (!st.first.length) continue;
        for (const id of st.first) this.seat(id).vp += val[0];
        for (const id of st.second) this.seat(id).vp += val[1];
        this.say({ t: 'market', good, top: st.top, value: val.slice(),
          first: st.first.slice(), second: st.second.slice() });
      }
    },

    endActions() {
      if (this.first) this.first = false;
      /* Snapshot before anything is paid, so what each player EARNED is a
         difference rather than a sum of five separate income rules. The pub,
         the market tracks and the rent on an orange crate all land between
         here and `closeScore`, and all three belong in the number the room is
         shown. */
      this._before = this.players.map(p => ({ id: p.id, r: p.rubles, vp: p.vp }));
      this._scoredAt = this.phase;
      if (D.PHASE[this.phase].scores) this.scorePhase();
      this.steps.push({ s: 'closeScore' });
      this.steps.push({ s: 'afterScore' });
    },

    /* Everything the phase paid, once every prompt it raised has been
       answered. Public by construction: each part of it comes off a tableau
       or a track the whole room can see, which is why it can be shown at all
       in a game where the purse itself cannot. */
    closeScore() {
      const before = this._before || [];
      if (!D.PHASE[this._scoredAt] || !D.PHASE[this._scoredAt].scores) { this.lastScore = null; return; }
      const rows = this.players.map(p => {
        const b = before.find(x => x.id === p.id) || { r: p.rubles, vp: p.vp };
        return { id: p.id, r: p.rubles - b.r, vp: p.vp - b.vp };
      });
      const out = { round: this.round, phase: this._scoredAt, rows };
      if (this._scoredAt === 'market') {
        out.value = this.marketValue().slice();
        out.goods = D.GOOD_IDS.map(good => {
          const st = this.standings(good);
          return { good, top: st.top, first: st.first.slice(), second: st.second.slice() };
        });
      }
      this.lastScore = out;
      /* And into the log, so the moment a phase has finished paying is a point
         in the stream of events rather than a value overwritten by the next
         phase — two can land in one move when a phase ends with nothing left
         for anybody to do. The standalone phones pause the game on it. */
      this.say(Object.assign({ t: 'paid' }, JSON.parse(JSON.stringify(out))));
    },

    scorePhase() {
      const color = D.PHASE[this.phase].color;
      for (const id of this.order) {
        const p = this.seat(id);
        const got = income(p, color);
        p.rubles += got.r; p.vp += got.vp;
        /* `bits` is which card paid what. Every one of them is on the table in
           front of this player, so it is as public as the total — and it is
           what lets a phone show WHY somebody earned what they did. */
        if (got.r || got.vp) this.say({ t: 'score', by: p.id, color, r: got.r, vp: got.vp, bits: got.bits });
      }
      /* The pub, the Trading House and the Guild Hall are all settled right
         after the buildings are scored, in the order the building phase ran —
         the pub and the Trading House because the rules say so by name, the
         Guild Hall because there is nothing to split until the building
         phase's own income has actually landed. */
      if (color === 'blue') for (const id of this.order) {
        const p = this.seat(id);
        const pubs = countFn(p, 'pub');
        if (pubs) this.push({ seat: p.id, t: 'pub', max: pubs * D.PUB_POINTS,
          why: 'The pub: points at ' + D.PUB_COST + ' rubles each' });
        const houses = countFn(p, 'tradinghouse');
        if (houses) this.push({ seat: p.id, t: 'tradinghouse', max: houses,
          why: 'The Trading House: 3 rubles for 2 points, once a round' });
        for (const inst of p.area.blue.filter(i => def(i).fn === 'guildhall'))
          this.push({ seat: p.id, t: 'guildhall', card: inst,
            why: 'The Guild Hall: split 4 between rubles and points' });
      }
      /* The Sycophant pays 1 ruble at every aristocrat scoring — checked
         AFTER every other red card has already paid, because a purse too
         thin to cover it is only known once everything else has landed. */
      if (color === 'red') for (const id of this.order) {
        const p = this.seat(id);
        for (const inst of p.area.red.filter(i => def(i).fn === 'sycophant').slice()) {
          if (p.rubles >= 1) { p.rubles -= 1; this.say({ t: 'sycophant', by: p.id, paid: true }); }
          else {
            const k = p.area.red.indexOf(inst);
            p.area.red.splice(k, 1);
            this.discard.push(inst);
            this.say({ t: 'sycophant', by: p.id, paid: false });
          }
        }
      }
      /* The market scores in three parts and strictly in this order: the cards
         pay their rubles (above), then the rent on every orange crate is
         settled, then the tracks are counted. The rent comes in the middle
         because not paying it takes four symbols straight back off your track
         — which has to happen before anybody is placed on it. */
      if (color === 'yellow') {
        const rent = this.marketValue()[0];
        for (const id of this.order) {
          const p = this.seat(id);
          for (const inst of this.orangeCards(p))
            this.push({ seat: p.id, t: 'upkeep', card: inst, rent,
              why: 'Rent on the ' + def(inst).name + ': ' + rent + ' rubles, or it goes back' });
        }
        this.steps.push({ s: 'scoreMarketTracks' });
      }
    },

    afterScore() {
      if (this.phase !== 'trading') {
        this.deal(this.refill[this.phase], this.boardSize);
        const k = this.phases.indexOf(this.phase);
        this.startPhase(this.phases[k + 1]);
        return;
      }
      /* The end of a round. Whatever is left in the cheap row is thrown away,
         this round's row drops into it, and the next round's workers are laid
         out on top.
         The flag is read BEFORE that deal on purpose: a worker stack that runs
         dry while the next round is being laid out has called the end of the
         round about to be played, not of the one just finished. */
      const ending = this.lastRound;
      for (const inst of this.bottom) this.discard.push(inst);
      this.bottom = this.top; this.top = [];
      this.deal('worker', this.boardSize);
      for (const ph of this.phases) this.marker[ph] = (this.marker[ph] + 1) % this.n();
      /* The assistants pass too, after the trading phase like the rules say —
         but to the RIGHT, the opposite way from the stones above. */
      if (this.assistants) rotateAssistants(this);
      this.say({ t: 'round', round: this.round, ending });
      if (ending) { this.finish(); return; }
      this.round++;
      for (const p of this.players) {
        p.obsUsed = 0;
        /* The Debtor's Prison turns back over at the start of the next round. */
        for (const inst of p.area.blue) if (def(inst).fn === 'debtorsprison') inst.prisonUsed = false;
      }
      this.startPhase('worker');
    },

    finish() {
      this.phase = 'over';
      this.prompt = null; this.queue = []; this.steps = [];
      const rows = this.players.map(p => Object.assign({ id: p.id, name: p.name, hex: p.hex, bot: p.bot }, score(p)));
      rows.sort((a, b) => (b.total - a.total) || (b.rubles - a.rubles));
      rows.forEach((r, k) => { r.place = k + 1; });
      /* A genuine dead heat: same points, same money. */
      for (let k = 1; k < rows.length; k++)
        if (rows[k].total === rows[k - 1].total && rows[k].rubles === rows[k - 1].rubles) rows[k].place = rows[k - 1].place;
      rows.forEach(r => { r.won = r.place === 1; });
      this.result = { rows, rounds: this.round, endedBy: this.endedBy };
      this.say({ t: 'over', top: rows[0].total, who: rows.filter(r => r.won).map(r => r.id) });
    },

    /* ---------- prompts ---------- */

    /* A prompt raised while an answer is being carried out is a consequence of
       it — which card the trading card goes over, what the observatory turned
       up — and has to happen before whatever was already scheduled. */
    push(prompt) {
      if (this.ins == null) this.queue.push(prompt);
      else this.queue.splice(this.ins++, 0, prompt);
    },

    /* What a seat may answer with, right now. Also the list a phone draws its
       buttons from, so there is one answer to "is this legal". */
    options(pr) {
      if (!pr) return [];
      const p = this.seat(pr.seat);
      if (!p) return [];
      const out = [];
      switch (pr.t) {
        case 'turn': {
          /* The opening: everyone buys, twice, and nobody may do anything
             else. Only ever the top row, because there is no other row yet. */
          if (this.first) {
            /* Purple cards are never bought — see keepPurpleOutOfOpening() in
               create(), which is what actually keeps one out of this deal.
               This is the same guard repeated for anyone who ever loosens
               that, so the opening cannot land on a card with no legal
               answer for it. */
            for (const inst of this.top) if (!def(inst).purple && this.canBuy(p, inst, 'top')) out.push('buy:' + inst.uid);
            if (!out.length) out.push('pass');
            return out;
          }
          const room = p.hand.length < this.handLimit(p);
          for (const row of ['top', 'bottom']) for (const inst of this[row]) {
            /* A purple card is never bought straight onto the board — it has
               to go to hand first, same as the rules say. */
            if (!def(inst).purple && this.canBuy(p, inst, row)) out.push('buy:' + inst.uid);
            if (room) out.push('hand:' + inst.uid);
          }
          for (const inst of p.hand) {
            const c = def(inst);
            if (c.purple ? this.canPlayPurple(p, inst) : this.canBuy(p, inst, 'hand')) out.push('play:' + inst.uid);
          }
          /* The observatory looks at a stack during the blue actions, and may
             not take the stack's last card. */
          if (this.phase === 'building' && observatoriesFree(p) > 0)
            for (const d of this.deckNames)
              if (this.decks[d].length > 1) out.push('obs:' + d);
          /* The Debtor's Prison searches the discard pile, once a round, in
             the building phase — the same shape as the observatory above. */
          if (this.phase === 'building' && this.discard.length)
            for (const inst of p.area.blue.filter(i => def(i).fn === 'debtorsprison' && !i.prisonUsed))
              out.push('prison:' + inst.uid);
          out.push('pass');
          return out;
        }
        case 'trade': {
          const inst = pr.inst;
          return this.payableTargets(p, inst, pr.row).map(t => t.uid);
        }
        case 'pub': {
          const most = Math.min(pr.max, Math.floor(p.rubles / D.PUB_COST));
          for (let k = 0; k <= most; k++) out.push(String(k));
          return out;
        }
        case 'obs': {
          const inst = p.pending;
          if (!inst) return [];
          if (this.canBuy(p, inst, 'obs')) out.push('buy');
          if (p.hand.length < this.handLimit(p)) out.push('hand');
          out.push('discard');
          return out;
        }
        /* Which good the Czar's '?' is declared to be. */
        case 'wild': return this.wilds.slice();
        /* Rent on an orange crate. Paying is only on the table if the rubles
           are there; giving it up always is. */
        case 'upkeep': {
          if (p.rubles >= pr.rent) out.push('pay');
          out.push('drop');
          return out;
        }
        /* Module 2's Trading House: the same "pay a fixed price for points,
           up to a cap" shape as the pub, at its own price and cap. */
        case 'tradinghouse': {
          const most = Math.min(pr.max, Math.floor(p.rubles / 3));
          for (let k = 0; k <= most; k++) out.push(String(k));
          return out;
        }
        /* The Guild Hall: 4 points of income, split however you like. */
        case 'guildhall': return ['0', '1', '2', '3', '4'];
        /* Module 2's Debtor's Prison and Module 1's Black Market both search
           the discard pile — this is stage one, choosing what to take;
           stage two reuses 'obs' below, since "buy it, hold it, or put it
           back" is exactly what the observatory already asks. An empty pile
           returns no options, which `pump()` treats as nothing to ask. */
        case 'salvage': return this.discard.map(i => i.uid);
        /* Module 1's Money Collector: any non-trading card on the board this
           seat could afford at half price. */
        case 'moneycollector': return this.moneycollectorTargets(p).map(t => t.uid);
        /* The Jester and the Banquet: one of this seat's own cards that has
           both a ruble and a point value to play with. */
        case 'jester':
        case 'banquet': return this.jesterTargets(p);
        /* The Moocher: any opponent's card that would actually pay something
           right now, off the same reckoning `income()` itself uses. */
        case 'moocher': return this.moocherTargets(p).map(t => t.uid);
        /* Away With It!: any card left in this seat's own hand. */
        case 'awaywithit': return p.hand.map(i => i.uid);
      }
      return [];
    },

    /* A prompt with one legal answer is not a decision. */
    forcedAnswer(pr, opts) { return opts.length === 1 ? opts[0] : null; },

    pump() {
      let guard = 0;
      while (!this.prompt && this.queue.length && guard++ < 500) {
        const next = this.queue.shift();
        const opts = this.options(next);
        if (!opts.length) { this.say({ t: 'skip', what: next.t, by: next.seat }); continue; }
        const only = this.forcedAnswer(next, opts);
        if (only != null) { this.apply(this.seat(next.seat), next, only); continue; }
        next.options = opts;
        /* Every prompt is numbered. The same seat is asked the same kind of
           question twice running all the time here — two pubs, a trade then
           the next turn — and anything upstream keyed on "who is being asked
           what" would see one moment where there are two. The display paces a
           house player's thinking on exactly that key. */
        next.n = ++this._pn;
        this.prompt = next;
      }
      return this.prompt;
    },

    /* The one loop. Prompts first, always: a scheduled step never runs while
       somebody still owes the table an answer. */
    run() {
      let guard = 0;
      while (guard++ < 2000) {
        if (this.pump()) return this.prompt;
        if (!this.steps.length) return null;
        const st = this.steps.shift();
        this[st.s](st);
      }
      return this.prompt;
    },

    /* ---------- orders ---------- */

    act(id, a) {
      const p = this.seat(id);
      if (!p) return no('You are not at this table.');
      if (this.phase === 'over') return no('The game is over.');
      if (!a || typeof a !== 'object') return no('That order made no sense.');
      const pr = this.prompt;
      if (!pr) return no('Nothing is waiting on you.');
      if (pr.seat !== id) return no('It is ' + this.seat(pr.seat).name + '’s turn.');
      if (a.t !== pr.t) return no('The table is waiting for something else.');
      const value = String(a.pick == null ? '' : a.pick);
      const opts = this.options(pr);
      if (!opts.includes(value)) return no(this.whyNot(p, pr, value) || 'You cannot do that.');
      this.prompt = null;
      this.apply(p, pr, value);
      this.run();
      return yes();
    },

    /* A refusal that names the reason. "Nothing happened" reads as a broken
       phone from the other side of the room. */
    whyNot(p, pr, value) {
      if (pr.t !== 'turn') return null;
      const bits = String(value).split(':');
      const kind = bits[0], key = bits[1];
      if (kind === 'buy' || kind === 'hand') {
        const hit = this.find(key);
        if (!hit) return 'That card has gone.';
        const c = def(hit.inst);
        if (kind === 'hand') return 'Your hand is full — ' + this.handLimit(p) + ' cards.';
        if (c.group === 'trading' && !this.targets(p, c).length)
          return 'You have nothing a ' + c.name + ' could be built over.';
        const price = this.bestPrice(p, hit.inst, hit.row);
        return 'The ' + c.name + ' costs ' + price + ' and you have ' + p.rubles + '.';
      }
      if (kind === 'play') {
        const inst = this.inHand(p, key);
        if (!inst) return 'That card is not in your hand.';
        const price = this.bestPrice(p, inst, 'hand');
        return price == null
          ? 'You have nothing a ' + def(inst).name + ' could be built over.'
          : 'The ' + def(inst).name + ' costs ' + price + ' and you have ' + p.rubles + '.';
      }
      if (kind === 'obs') return 'The observatory has already looked this round.';
      return null;
    },

    apply(p, pr, value) {
      /* Consequences go to the FRONT: two pubs may be queued behind a turn,
         and the trade this buy needs must not wait for somebody else's. */
      this.ins = 0;
      try { this.carry(p, pr, value); }
      finally { this.ins = null; }
    },

    carry(p, pr, value) {
      if (pr.t === 'turn') return this.doTurn(p, value);
      if (pr.t === 'trade') return this.doTrade(p, pr, value);
      if (pr.t === 'pub') return this.doPub(p, value);
      if (pr.t === 'obs') return this.doObs(p, value);
      if (pr.t === 'wild') return this.doWild(p, pr, value);
      if (pr.t === 'upkeep') return this.doUpkeep(p, pr, value);
      if (pr.t === 'tradinghouse') return this.doTradingHouse(p, value);
      if (pr.t === 'guildhall') return this.doGuildHall(p, value);
      if (pr.t === 'salvage') return this.doSalvage(p, pr, value);
      if (pr.t === 'moneycollector') return this.doMoneyCollector(p, value);
      if (pr.t === 'jester') return this.doAssign(p, value, 'jester');
      if (pr.t === 'banquet') return this.doAssign(p, value, 'banquet');
      if (pr.t === 'moocher') return this.doMoocher(p, value);
      if (pr.t === 'awaywithit') return this.doAwayWithIt(p, value);
    },

    /* Ordinarily this is just "queue the next turn" — but Module 1's Double
       Turn grants two bonus actions in a row, and each of THOSE has to reach
       this same fork (a bonus action can itself be a pass, and a pass is
       what the whole phase is waiting to see enough of). So every ending to
       doTurn() below goes through here rather than pushing 'nextTurn'
       straight onto the steps. */
    afterTurnAction(p) {
      if (p.bonusActions > 0) { p.bonusActions--; this.askTurn(); }
      else this.steps.push({ s: 'nextTurn' });
    },

    doTurn(p, value) {
      const bits = value.split(':');
      const kind = bits[0], key = bits[1];
      if (kind === 'pass') {
        this.passes++;
        this.say({ t: 'pass', by: p.id });
        this.afterTurnAction(p);
        return;
      }
      this.passes = 0;

      if (kind === 'obs') {
        p.obsUsed++;
        const inst = this.decks[key].pop();
        p.pending = inst;
        /* The card itself is NOT said out loud: the observatory looks at it in
           private and it may go straight into a hand. The room is told which
           stack was looked at, which is all it can see. */
        this.say({ t: 'observe', by: p.id, deck: key });
        this.push({ seat: p.id, t: 'obs', why: 'The observatory turned up a ' + def(inst).name });
        this.afterTurnAction(p);
        return;
      }

      /* Module 2's Debtor's Prison: the card stays exactly where it is (it is
         not bought or held, it is already built), and just turns face down
         for the round. */
      if (kind === 'prison') {
        const inst = p.area.blue.find(i => i.uid === key);
        if (inst) inst.prisonUsed = true;
        this.say({ t: 'prison', by: p.id });
        this.push({ seat: p.id, t: 'salvage', why: 'The Debtor’s Prison: search the discard pile' });
        this.afterTurnAction(p);
        return;
      }

      let inst = null, row = null;
      if (kind === 'play') {
        inst = this.inHand(p, key); row = 'hand';
        p.hand.splice(p.hand.indexOf(inst), 1);
        /* Module 1's purple cards are never built onto the tableau — playing
           one from hand triggers its one-off action instead. */
        if (def(inst).purple) { this.usePurple(p, inst); this.afterTurnAction(p); return; }
      } else {
        const hit = this.find(key);
        inst = hit.inst; row = hit.row;
        this[row].splice(this[row].indexOf(inst), 1);
      }

      if (kind === 'hand') {
        p.hand.push(inst);
        /* Named: it came off the face-up board, so the whole table watched it
           go — exactly as at the box. The Observatory's card, kept in hand, is
           a different event ('obs-hand') and is still never named. */
        this.say({ t: 'hold', by: p.id, row, key: inst.key });
        this.afterTurnAction(p);
        return;
      }

      this.buyOut(p, inst, row);
      this.afterTurnAction(p);
    },

    /* Buying and playing are the same thing once the card is off the board:
       a trading card asks what it is built over first, everything else simply
       lands. */
    buyOut(p, inst, row) {
      const c = def(inst);
      if (c.group === 'trading') {
        this.push({ seat: p.id, t: 'trade', inst, row,
          why: 'What does the ' + c.name + ' go over?' });
        return;
      }
      this.place(p, inst, this.priceOf(p, inst, row), null, row);
    },

    doTrade(p, pr, uid) {
      const target = p.area[def(pr.inst).color].find(i => i.uid === uid);
      /* Both `act` and `pump` have already checked this uid against the legal
         answers, so a miss is impossible — but if one ever got past, the price
         would be null, the purse would go NaN, and the game would look
         perfectly healthy until somebody's money stopped working. Ask again
         instead: with one legal answer left the queue resolves it itself. */
      if (!target) { this.push(pr); return; }
      this.place(p, pr.inst, this.priceOf(p, pr.inst, pr.row, target), target, pr.row);
    },

    doPub(p, value) {
      const k = parseInt(value, 10) || 0;
      if (!k) return;
      p.rubles -= k * D.PUB_COST;
      p.vp += k;
      this.say({ t: 'pub', by: p.id, points: k, paid: k * D.PUB_COST });
    },

    doWild(p, pr, good) {
      if (this.wilds.indexOf(good) < 0) { this.push(pr); return; }
      p.wild[pr.card.uid] = good;
      this.wilds = this.wilds.filter(x => x !== good);
      this.say({ t: 'wild', by: p.id, good });
    },

    doUpkeep(p, pr, what) {
      const c = def(pr.card);
      if (what === 'pay') {
        p.rubles -= pr.rent;
        this.say({ t: 'rent', by: p.id, key: c.key, paid: pr.rent });
        return;
      }
      const k = p.area.yellow.indexOf(pr.card);
      if (k >= 0) p.area.yellow.splice(k, 1);
      this.discard.push(pr.card);
      this.say({ t: 'rent-no', by: p.id, key: c.key, rent: pr.rent });
    },

    doObs(p, what) {
      const inst = p.pending;
      p.pending = null;
      if (what === 'hand') { p.hand.push(inst); this.say({ t: 'obs-hand', by: p.id }); return; }
      if (what === 'discard') { this.discard.push(inst); this.say({ t: 'obs-drop', by: p.id, key: inst.key }); return; }
      this.buyOut(p, inst, 'obs');
    },

    doTradingHouse(p, value) {
      const k = parseInt(value, 10) || 0;
      if (!k) return;
      p.rubles -= k * 3; p.vp += k * 2;
      this.say({ t: 'tradinghouse', by: p.id, times: k });
    },

    doGuildHall(p, value) {
      const r = Math.max(0, Math.min(4, parseInt(value, 10) || 0));
      p.rubles += r; p.vp += 4 - r;
      this.say({ t: 'guildhall', by: p.id, r, vp: 4 - r });
    },

    /* Stage one of a discard-pile search (Module 2's Debtor's Prison, Module
       1's Black Market): pick the card. Stage two is 'obs' above — "buy it,
       hold it, or put it back" is exactly what the observatory already asks,
       and "put it back" IS the discard pile either way. */
    doSalvage(p, pr, uid) {
      const k = this.discard.findIndex(i => i.uid === uid);
      if (k < 0) { this.push(pr); return; }
      p.pending = this.discard.splice(k, 1)[0];
      this.push({ seat: p.id, t: 'obs', why: 'What do you do with it?' });
    },

    /* ---------- Module 1: the purple cards ----------
     *
     * Taken to hand for free like any other card; PLAYED as a one-off action
     * instead of built onto the tableau (see the `purple` branch in
     * doTurn()), then removed from the game for good rather than discarded —
     * see `g.removed`. */

    moneycollectorTargets(p) {
      const out = [];
      for (const row of ['top', 'bottom']) for (const inst of this[row]) {
        const c = def(inst);
        if (c.group === 'trading') continue;                 // no "built over" step here
        if (Math.floor(this.priceOf(p, inst, row) / 2) <= p.rubles) out.push({ uid: inst.uid, row });
      }
      return out;
    },
    doMoneyCollector(p, uid) {
      const hit = this.find(uid);
      if (!hit) return;
      const { inst, row } = hit;
      this[row].splice(this[row].indexOf(inst), 1);
      const price = Math.floor(this.priceOf(p, inst, row) / 2);
      p.rubles -= price;
      inst.noVp = true; inst.noReplace = true;
      p.area[def(inst).color].push(inst);
      this.say({ t: 'moneycollector', by: p.id, key: def(inst).key, price });
    },

    /* Both the Jester and the Banquet need a card with a ruble AND a point
       value on its own face — the printed value, not what it might come to
       after a Tax Man or Mariinsky Theater's counting. */
    jesterTargets(p) {
      const out = [];
      for (const col of D.COLOR_IDS) for (const inst of p.area[col])
        if (def(inst).r > 0 && def(inst).vp > 0) out.push(inst.uid);
      return out;
    },
    doAssign(p, uid, which) {
      for (const col of D.COLOR_IDS) {
        const inst = p.area[col].find(i => i.uid === uid);
        if (inst) { inst[which] = true; this.say({ t: which, by: p.id, key: def(inst).key }); return; }
      }
    },

    /* Whatever an opponent's card would pay THEM right now, off the same
       reckoning income() itself uses — see cardIncome(). Only cards actually
       worth something are offered; scoring nothing for nobody is not a
       purple card's function "being carried out". */
    moocherTargets(p) {
      const out = [];
      for (const opp of this.players) {
        if (opp.id === p.id) continue;
        for (const col of D.COLOR_IDS) for (const inst of opp.area[col]) {
          const got = cardIncome(opp, inst);
          if (got.r || got.vp) out.push({ owner: opp.id, uid: inst.uid });
        }
      }
      return out;
    },
    doMoocher(p, uid) {
      for (const opp of this.players) {
        if (opp.id === p.id) continue;
        for (const col of D.COLOR_IDS) {
          const inst = opp.area[col].find(i => i.uid === uid);
          if (!inst) continue;
          const got = cardIncome(opp, inst);
          p.rubles += got.r; p.vp += got.vp;
          this.say({ t: 'moocher', by: p.id, from: opp.id, key: def(inst).key, r: got.r, vp: got.vp });
          return;
        }
      }
    },

    doAwayWithIt(p, uid) {
      const inst = this.inHand(p, uid);
      if (!inst) return;
      p.hand.splice(p.hand.indexOf(inst), 1);
      this.discard.push(inst);
      this.say({ t: 'awaywithit', by: p.id, key: inst.key });
    },

    /* Whether this purple card's "special function can be carried out" right
       now — the rules say a purple card with nothing to do cannot simply be
       played for no effect. */
    canPlayPurple(p, inst) {
      switch (def(inst).fn) {
        case 'awaywithit':     return p.hand.length > 1;   // itself, plus something to discard
        case 'moneycollector': return this.moneycollectorTargets(p).length > 0;
        case 'jester':
        case 'banquet':        return this.jesterTargets(p).length > 0;
        case 'moocher':        return this.moocherTargets(p).length > 0;
        case 'blackmarket':    return this.discard.length > 0;
        default:                return true;                // Golden Donkey, Double Turn: always
      }
    },

    /* The purple card itself is already out of the hand and off to
       `g.removed` by the time this runs (see doTurn) — this is only ever the
       ONE-OFF EFFECT, dispatched by `fn`. */
    usePurple(p, inst) {
      const c = def(inst);
      this.removed.push(inst);
      this.say({ t: 'purple', by: p.id, key: c.key });
      switch (c.fn) {
        case 'donkey': p.rubles += 5; break;
        case 'doubleturn': p.bonusActions = (p.bonusActions || 0) + 2; break;
        /* Simplified from "play out of turn, before the start player" — see
           the long comment on this card in sp-data.js. */
        case 'pickpocket': p.bonusActions = (p.bonusActions || 0) + 1; break;
        case 'awaywithit':
          if (p.hand.length) this.push({ seat: p.id, t: 'awaywithit', why: 'Discard a card from your hand' });
          break;
        case 'moneycollector':
          if (this.moneycollectorTargets(p).length)
            this.push({ seat: p.id, t: 'moneycollector', why: 'Pick a card off the board at half price' });
          break;
        case 'jester':
          if (this.jesterTargets(p).length)
            this.push({ seat: p.id, t: 'jester', why: 'Assign the Jester to one of your cards' });
          break;
        case 'banquet':
          if (this.jesterTargets(p).length)
            this.push({ seat: p.id, t: 'banquet', why: 'Assign the Banquet to one of your cards' });
          break;
        case 'moocher':
          if (this.moocherTargets(p).length)
            this.push({ seat: p.id, t: 'moocher', why: 'Choose an opponent’s card to score for yourself' });
          break;
        case 'blackmarket':
          if (this.discard.length) this.push({ seat: p.id, t: 'salvage', why: 'Choose a card from the discard pile' });
          break;
      }
    },

    /* ---------- the remote holder stopping the table waiting ---------- */

    hurried(ids) { this.say({ t: 'hurried', who: ids.slice() }); },

    /* ================================================================
       Views. Everything the room sees comes out of `publicView`, and a
       seat's own half — the hand, and the prices only that player pays —
       goes to that seat alone.
       ================================================================ */

    publicView() {
      const board = row => this[row].map(i => ({ uid: i.uid, key: i.key, row }));
      const pr = this.prompt;
      return {
        version: this.version,
        market: this.market, phases: this.phases.slice(), boardSize: this.boardSize,
        assistants: this.assistants,
        wilds: this.wilds.slice(), marketValue: this.marketValue().slice(),
        standings: this.market ? D.GOOD_IDS.reduce((o, g) => { o[g] = this.standings(g); return o; }, {}) : null,
        round: this.round, phase: this.phase, first: this.first,
        lastScore: this.lastScore,
        lastRound: this.lastRound, endedBy: this.endedBy,
        top: board('top'), bottom: board('bottom'),
        decks: this.deckNames.reduce((o, d) => { o[d] = this.decks[d].length; return o; }, {}),
        discard: this.discard.length,
        discardTop: this.discard.length ? this.discard[this.discard.length - 1].key : null,
        order: this.order.slice(), at: this.at, turn: this.turnSeat(), passes: this.passes,
        markers: Object.assign({}, this.marker),
        players: this.players.map(p => ({
          id: p.id, name: p.name, hex: p.hex, bot: p.bot,
          /* NO `rubles`. The purse is the second of this game's two secrets,
             and leaving the field out entirely means anything downstream that
             reaches for it gets `undefined` rather than a stale number. */
          vp: p.vp,
          /* The count, never the cards. This is the whole privacy invariant. */
          hand: p.hand.length, handLimit: this.handLimit(p),
          area: D.COLOR_IDS.reduce((o, col) => {
            o[col] = p.area[col].map(i => ({ uid: i.uid, key: i.key, good: p.wild[i.uid] || null }));
            return o;
          }, {}),
          obsFree: observatoriesFree(p),
          /* The tracks are public — the wooden markers sit on the board — so
             they are counted here rather than anywhere a phone could differ. */
          goods: this.market ? marketTrack(p) : null,
          markers: this.phases.filter(ph => this.players[this.marker[ph]].id === p.id),
          /* Which assistant this seat holds right now — public, since it sits
             on the table in front of them like a stone does. */
          assistant: this.assistants ? this.assistant[p.id] : null,
          score: publicScore(p)
        })),
        /* The card a trade is about came off the face-up board, so naming it
           is not a leak — and without it the telly cannot say what anybody is
           deciding. The observatory's card is never named. */
        prompt: pr ? { seat: pr.seat, t: pr.t, why: pr.why, n: pr.n,
          key: pr.t === 'trade' ? pr.inst.key : (pr.card && pr.t !== 'obs' ? pr.card.key : null) } : null,
        log: this.log.slice(-60),
        result: this.result
      };
    },

    /* One seat's own half: the cards behind their hand, what every card on the
       board would cost THEM, and the question they are being asked. */
    seatView(id) {
      const p = this.seat(id);
      if (!p) return null;
      const pr = this.prompt && this.prompt.seat === id ? this.prompt : null;
      const opts = pr ? this.options(pr) : [];
      const room = p.hand.length < this.handLimit(p);
      const offer = (inst, row) => {
        const c = def(inst);
        const price = this.bestPrice(p, inst, row);
        return {
          uid: inst.uid, key: c.key, row, price,
          canBuy: opts.includes('buy:' + inst.uid),
          canHand: opts.includes('hand:' + inst.uid),
          canPlay: opts.includes('play:' + inst.uid),
          targets: c.group === 'trading' ? this.targets(p, c).length : 0
        };
      };
      return {
        id, n: pr ? pr.n : 0, room,
        rubles: p.rubles, vp: p.vp, score: score(p),
        hand: p.hand.map(i => offer(i, 'hand')),
        handLimit: this.handLimit(p),
        board: this.top.map(i => offer(i, 'top')).concat(this.bottom.map(i => offer(i, 'bottom'))),
        pending: p.pending ? { uid: p.pending.uid, key: p.pending.key,
          price: this.bestPrice(p, p.pending, 'obs') } : null,
        goods: this.market ? marketTrack(p) : null,
        prompt: pr ? {
          t: pr.t, why: pr.why, n: pr.n, options: opts,
          max: pr.max || 0, rent: pr.rent || 0,
          card: (pr.inst || pr.card) ? { uid: (pr.inst || pr.card).uid, key: (pr.inst || pr.card).key } : null,
          /* For a trade, what each choice would actually cost — cheapest
             first, then alphabetical, so picking what to replace does not
             mean reading down a list in whatever order the cards landed on
             the table. */
          targets: pr.t === 'trade' ? this.payableTargets(p, pr.inst, pr.row).map(t => ({
            uid: t.uid, key: t.key, price: this.priceOf(p, pr.inst, pr.row, t)
          })).sort((a, b) => (a.price - b.price) || D.card(a.key).name.localeCompare(D.card(b.key).name)) : null,
          /* The rest of the discard pile is otherwise never shown to anyone —
             not even the room — so a salvage prompt (Module 2's Debtor's
             Prison, Module 1's Black Market) is the one place it needs
             naming, and only to the seat actually searching it. */
          discard: pr.t === 'salvage' ? this.discard.map(i => ({ uid: i.uid, key: i.key })) : null
        } : null
      };
    }
  };

  const E = { VERSION, create, score, publicScore, income, rngFrom, shuffle,
    observatoriesFree, countFn, hasFn, goodsOf, marketTrack };
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  root.SPEngine = E;

})(typeof window !== 'undefined' ? window : globalThis);
