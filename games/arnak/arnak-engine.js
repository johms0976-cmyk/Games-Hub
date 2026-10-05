'use strict';
/* Lost Ruins of Arnak — the rules. No DOM, no timers, one seeded rng.
 *
 * The display holds the one Game; every order — from a phone, a house
 * explorer or a test — goes through `g.act(seatId, action)`, which refuses
 * with a reason rather than a bare false. The handsets load this file too, so
 * a phone decides whether a payment covers a travel cost with the very
 * function that will judge it.
 *
 * The shape is the hub's usual one (Nidavellir, Saint Petersburg, Blood Rage,
 * Catan):
 *
 *   g.prompts   the questions open right now. Usually one — the active
 *               player's turn, or a choice inside an effect — but the end of a
 *               round asks everybody holding cards at once.
 *   g.steps     scheduled work. `run()` takes none while a prompt is open, and
 *               anything raised while an answer is being carried out goes IN
 *               FRONT of what was already queued, so "play the Mortar →
 *               exile a card → gain two coins → back to your turn" comes out
 *               in that order.
 *
 * **The turn is itself a prompt**, re-asked with a new number after every
 * action. One main action a turn and any number of free actions around it;
 * once the main action is spent the prompt offers only the free ones and
 * "end turn", and if there are none it ends the turn by itself.
 *
 * **Travel is a pool.** Paying a travel cost puts cards (or boons, assistants,
 * a hired pilot) in; the cheapest icons that do the job come out; whatever is
 * left stays for the rest of the turn — the book's "the extra icon is
 * probably wasted", but not always (a Gem cutter can spend it).
 *
 * **What is secret is the hand and the order of the decks.** Everything that
 * scores is public — cards are bought, Fear is taken and cards are exiled in
 * front of everybody — so the running score on the telly is the real one.
 * `publicView` carries counts of hands and decks and never which card is
 * where; the hidden stacks (assistants under the top one, site and guardian
 * tiles, the temple's bonus tiles, the stranded assistants) are counts too.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./arnak-data.js') : root.ArnakData;

  const VERSION = 1;
  /* How well a house explorer plays. Public: the room chose it. */
  const LEVELS = ['easy', 'medium', 'hard'];

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
  const no = why => ({ ok: false, why });
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ================================================================
     Resources
     ================================================================ */

  function afford(res, cost, idols) {
    for (const k in cost) {
      if (k === 'idol') { if ((idols || 0) < cost.idol) return false; continue; }
      if ((res[k] || 0) < cost[k]) return false;
    }
    return true;
  }
  /* A cost with a discount taken off, never below nothing. */
  function minus(cost, disc) {
    const out = {};
    for (const k in cost) {
      const v = cost[k] - ((disc && disc[k]) || 0);
      if (v > 0) out[k] = v;
    }
    return out;
  }
  function addTo(a, b) { const out = Object.assign({}, a); for (const k in b) out[k] = (out[k] || 0) + b[k]; return out; }
  const costValue = c => { let v = 0; for (const k in c) v += (D.RES_VALUE[k] || 3) * c[k]; return v; };
  const isEmpty = c => !c || !Object.keys(c).some(k => c[k] > 0);

  /* ================================================================
     Travel — the part the phone shares
     ================================================================ */

  const TV = { boot: 1, car: 2, ship: 2, plane: 4 };

  /* The cheapest way to cover `cost` from `avail` ({icon, disc}). A discount
     costs nothing to use up — it lasts for this one action — so the plan
     spends discounts first and otherwise keeps the most flexible icons back.
     Costs are at most two icons, so this is a search, not a heuristic. */
  function plan(avail, cost) {
    const m = cost.length;
    if (!m) return { used: [], value: 0 };
    let best = null;
    const used = [];
    const rec = (i, val) => {
      if (best && val >= best.value) return;
      if (i === m) { best = { used: used.slice(), value: val }; return; }
      for (let j = 0; j < avail.length; j++) {
        if (used.indexOf(j) >= 0) continue;
        if (!D.pays(avail[j].icon, cost[i])) continue;
        used.push(j);
        rec(i + 1, val + (avail[j].disc ? 0 : TV[avail[j].icon]));
        used.pop();
      }
    };
    rec(0, 0);
    return best;
  }

  /* A wallet is everything that can pay travel, in plain data: the phone
     builds one from its own seat's view, the engine from the player. */
  function walletOf(p) {
    return {
      res: Object.assign({}, p.res),
      hand: p.hand.slice(),
      pool: p.pool.slice(),
      boons: p.guardians.map(x => ({ id: x.id, used: x.used })),
      asst: p.asst.map(a => ({ id: a.id, gold: a.gold, ready: a.ready })),
      ocarina: !!p.ocarina
    };
  }
  const cardTravel = uid => { const c = D.card(uid); return c ? c.travel.slice() : []; };
  const boonTravel = id => { const gd = D.GUARD[id]; return gd && gd.boon.travel ? gd.boon.travel.slice() : []; };
  const asstTravel = a => { const d = D.ASST[a.id]; const side = d && (a.gold ? d.gold : d.silver); return side && side.travel ? side.travel.slice() : []; };

  /* Every icon a payment would put on the table. */
  function sourcesOf(w, disc, pay) {
    pay = pay || {};
    const oc = w.ocarina;
    const mk = (icon, src) => ({ icon: oc ? 'plane' : icon, src });
    const out = [];
    for (const icon of (disc || [])) out.push({ icon, disc: true, src: 'disc' });
    for (const icon of w.pool) out.push(mk(icon, 'pool'));
    for (const uid of (pay.cards || [])) for (const icon of cardTravel(uid)) out.push(mk(icon, 'card:' + uid));
    for (const id of (pay.boons || [])) for (const icon of boonTravel(id)) out.push(mk(icon, 'boon:' + id));
    for (const id of (pay.assts || [])) {
      const a = w.asst.find(x => x.id === id);
      if (a) for (const icon of asstTravel(a)) out.push(mk(icon, 'asst:' + id));
    }
    for (let k = 0; k < (pay.pilots || 0); k++) out.push({ icon: 'plane', src: 'pilot' });
    return out;
  }

  /* Is a payment legal, sufficient and not wasteful? `coinsHeld` is the coin
     left for pilots once any coin in the same cost is set aside. */
  function checkPay(w, cost, disc, pay, coinsHeld) {
    pay = pay || {};
    const cards = pay.cards || [], boons = pay.boons || [], assts = pay.assts || [], pilots = pay.pilots | 0;
    if (new Set(cards).size !== cards.length || new Set(boons).size !== boons.length || new Set(assts).size !== assts.length) return no('The same thing twice.');
    for (const uid of cards) if (w.hand.indexOf(uid) < 0) return no('That card is not in your hand.');
    for (const id of boons) {
      const b = w.boons.find(x => x.id === id);
      if (!b || b.used || !boonTravel(id).length) return no('That boon cannot pay for travel.');
    }
    for (const id of assts) {
      const a = w.asst.find(x => x.id === id);
      if (!a || !a.ready || !asstTravel(a).length) return no('That assistant cannot pay for travel now.');
    }
    if (pilots < 0 || pilots * 2 > (coinsHeld == null ? w.res.coin : coinsHeld)) return no('Not enough coins for a pilot.');
    const avail = sourcesOf(w, disc, pay);
    const best = plan(avail, cost);
    if (!best) return no('That does not cover the travel.');
    /* Nothing spent for nothing: every card, boon, assistant and pilot in the
       payment has to be needed. */
    const drop = (list, x) => { const i = list.indexOf(x); const c = list.slice(); c.splice(i, 1); return c; };
    const without = alt => !!plan(sourcesOf(w, disc, alt), cost);
    for (const uid of cards) if (without(Object.assign({}, pay, { cards: drop(cards, uid) }))) return no('You do not need to spend ' + D.card(uid).name + '.');
    for (const id of boons) if (without(Object.assign({}, pay, { boons: drop(boons, id) }))) return no('You do not need that boon.');
    for (const id of assts) if (without(Object.assign({}, pay, { assts: drop(assts, id) }))) return no('You do not need that assistant.');
    if (pilots && without(Object.assign({}, pay, { pilots: pilots - 1 }))) return no('You do not need a pilot.');
    return yes({ avail, used: best.used });
  }

  /* How much a source is worth keeping, to whoever is choosing what to pay
     with. Fear first, then the basic cards; boons are once a game. */
  function sacrifice(src, w) {
    if (src.t === 'card') {
      const c = D.card(src.id);
      if (!c) return 9;
      if (c.kind === 'fear') return 0.1;
      if (c.kind === 'basic') return 1;
      return 1.6 + (c.kind === 'art' ? 0.8 : 0) + (c.cost || 0) * 0.25;
    }
    if (src.t === 'pilot') return 2.4;
    if (src.t === 'asst') return 2;
    if (src.t === 'boon') return 3;
    return 5;
  }
  /* The payment a careful player would make: the cheapest set of sources
     that covers the cost. Used by the house and as the phone's first guess. */
  function suggestPay(w, cost, disc, coinsHeld) {
    const held = coinsHeld == null ? w.res.coin : coinsHeld;
    if (plan(sourcesOf(w, disc, {}), cost)) return { cards: [], boons: [], assts: [], pilots: 0 };
    const cands = [];
    for (const uid of w.hand) if (cardTravel(uid).length) cands.push({ t: 'card', id: uid });
    for (const b of w.boons) if (!b.used && boonTravel(b.id).length) cands.push({ t: 'boon', id: b.id });
    for (const a of w.asst) if (a.ready && asstTravel(a).length) cands.push({ t: 'asst', id: a.id });
    for (let k = 0; k < Math.min(2, Math.floor(held / 2)); k++) cands.push({ t: 'pilot', id: 'pilot' + k });
    for (const c of cands) c.v = sacrifice(c, w);
    cands.sort((a, b) => a.v - b.v);
    const build = set => {
      const pay = { cards: [], boons: [], assts: [], pilots: 0 };
      for (const c of set) {
        if (c.t === 'card') pay.cards.push(c.id);
        else if (c.t === 'boon') pay.boons.push(c.id);
        else if (c.t === 'asst') pay.assts.push(c.id);
        else pay.pilots++;
      }
      return pay;
    };
    let best = null;
    const pick = [];
    const rec = (start, val) => {
      if (best && val >= best.v) return;
      if (pick.length) {
        const pay = build(pick);
        if (plan(sourcesOf(w, disc, pay), cost)) { best = { v: val, pay }; return; }
      }
      if (pick.length >= 3) return;
      for (let i = start; i < cands.length; i++) {
        pick.push(cands[i]); rec(i + 1, val + cands[i].v); pick.pop();
      }
    };
    rec(0, 0);
    return best ? best.pay : null;
  }
  const canCover = (w, cost, disc, coinsHeld) => !!suggestPay(w, cost, disc, coinsHeld);

  /* ================================================================
     Scoring
     ================================================================ */

  function ownedCards(p) { return p.deck.concat(p.hand, p.play); }

  function score(p, g) {
    const T = D.TRACKS[g.side];
    const sq = id => T.squares[id];
    const glassRow = sq(p.glass).row, bookRow = sq(p.book).row;
    let research = 0;
    if (glassRow === 8) research += D.TEMPLE_ARRIVAL[p.arrival] || 0;
    else if (glassRow > 0) research += T.rows[glassRow].glass.vp;
    if (bookRow > 0) research += T.rows[bookRow].book.vp;
    const temple = p.temple.reduce((a, b) => a + b, 0);
    const idolsOwned = p.idols + p.slots;
    const emptySlots = D.SLOT_VALUE.slice(p.slots).reduce((a, b) => a + b, 0);
    const idols = D.IDOL_VP * idolsOwned + emptySlots;
    const guardians = D.GUARDIAN_VP * p.guardians.length;
    let cards = 0, fear = 0;
    for (const uid of ownedCards(p)) {
      const c = D.card(uid);
      if (!c) continue;
      if (c.kind === 'fear') fear -= 1;
      else if (c.kind === 'art' || c.kind === 'item') cards += c.vp;
    }
    fear -= 2 * p.fearTiles;
    const total = research + temple + idols + guardians + cards + fear;
    return { research, temple, idols, guardians, cards, fear, total };
  }

  /* ================================================================
     Building a game
     ================================================================ */

  function create(opts) {
    opts = opts || {};
    const rng = rngFrom(opts.seed == null ? Date.now() : opts.seed);
    const list = opts.players || [];
    const n = list.length;
    if (n < 2 || n > 4) throw new Error('Arnak is for 2 to 4 expeditions');
    const side = opts.side === 'snake' ? 'snake' : 'bird';
    const T = D.TRACKS[side];

    const g = {
      VERSION, side, n, round: 1, phase: 'play',
      seed: opts.seed, rng,
      start: opts.start == null ? Math.floor(rng() * n) : opts.start,
      cur: 0, turnN: 0, drawN: 0,
      log: [], prompts: [], steps: [], pn: 0, ins: 0,
      decks: {
        art: shuffle(D.ARTIFACTS.map(c => 'art:' + c.id), rng),
        item: shuffle(D.ITEMS.map(c => 'item:' + c.id), rng)
      },
      row: { art: [], item: [] },
      exiled: { art: [], item: [], basic: [] },
      fearSupply: [], fearTiles: D.FEAR_TILES,
      sites: {},
      siteDecks: { 1: shuffle(D.SITES[1].map(s => s.id), rng), 2: shuffle(D.SITES[2].map(s => s.id), rng) },
      guardDeck: shuffle(D.GUARDIANS.map(x => x.id), rng),
      asst: { stacks: [], rescue: [] },
      research: { bonus: {}, templeBonus: [], stacks: {}, arrivals: 0 },
      peek: null, reveal: null,
      result: null,
      opts: { show: !!opts.show }
    };

    /* The players, and every card any of them owns. */
    let fearNo = 0;
    g.players = list.map((x, i) => {
      const deck = [];
      for (const k of D.START_DECK) deck.push(k === 'fear' ? 'fear:' + (++fearNo) : 'basic:' + i + ':' + k);
      return {
        id: x.id, name: x.name, hex: x.hex || '#888', bot: !!x.bot, i,
        level: x.bot ? (LEVELS.indexOf(x.level) >= 0 ? x.level : 'medium') : null,
        deck: shuffle(deck, rng), hand: [], play: [],
        res: { coin: 0, compass: 0, tablet: 0, arrowhead: 0, jewel: 0 },
        idols: 0, slots: 0, idolsLost: 0,
        guardians: [], asst: [],
        glass: 0, book: 0, temple: [], arrival: null, fearTiles: 0,
        arch: [null, null], passed: false,
        pool: [], mainDone: false, mask: false, ocarina: false,
        exiledN: 0
      };
    });
    while (fearNo < D.FEAR_CARDS) g.fearSupply.push('fear:' + (++fearNo));
    /* Starting resources go by position in the first round. */
    for (let k = 0; k < n; k++) {
      const p = g.players[(g.start + k) % n];
      for (const r in D.START_RES[k]) p.res[r] += D.START_RES[k][r];
    }

    /* The island. */
    const blocked = new Set();
    if (n === 2) for (let i = 0; i < 5; i++) blocked.add(i);
    if (n === 3) for (const i of shuffle([0, 1, 2, 3, 4], rng).slice(0, 3)) blocked.add(i);
    const idols = shuffle(D.IDOLS, rng);
    for (const s of D.slots(side)) {
      g.sites[s.id] = {
        id: s.id, level: s.level, row: s.row, col: s.col,
        spaces: s.spaces.map((cost, k) => ({ cost: cost.slice(), who: null, blocked: s.level === 0 && k === 1 && blocked.has(s.col) })),
        tile: s.level === 0 ? s.camp : null,
        guardian: null,
        idols: s.level === 0 ? [] : idols.splice(0, s.idols)
      };
    }

    /* The assistants. On the Snake side one per player is stranded on the
       research track; the supply then has stacks of three, three and the rest. */
    const asst = shuffle(D.ASSISTANTS.map(a => a.id), rng);
    if (side === 'snake') {
      g.asst.rescue = asst.splice(0, n);
      g.asst.stacks = [asst.splice(0, 3), asst.splice(0, 3), asst.splice(0)];
    } else {
      g.asst.stacks = [asst.splice(0, 4), asst.splice(0, 4), asst.splice(0, 4)];
    }

    /* Research bonus tiles and the temple. */
    const bonus = shuffle(D.BONUS, rng);
    for (const s of T.squares) {
      const k = s.bonus ? s.bonus[n - 2] : 0;
      if (k) g.research.bonus[s.id] = bonus.splice(0, k);
    }
    g.research.templeBonus = bonus.splice(0, n);
    for (const st of D.TEMPLE_STACKS) g.research.stacks[st.id] = n;

    /* The card row: one artifact, five items. */
    refill(g, 'art'); refill(g, 'item');

    attach(g);
    g.steps.push({ k: 'round' });
    g.run();
    return g;
  }

  /* ================================================================
     The card row. Index 0 of each half is the card beside the moon staff.
     ================================================================ */
  const cap = (g, type) => type === 'art' ? g.round : 6 - g.round;
  function refill(g, type) {
    const row = g.row[type], deck = g.decks[type];
    if (!deck.length) return;                  // an empty deck: nothing slides
    const kept = row.filter(Boolean);
    while (kept.length < cap(g, type) && deck.length) kept.push(deck.shift());
    g.row[type] = kept;
  }

  /* ================================================================
     The game object: every rule below closes over `g`.
     ================================================================ */
  function attach(g) {
    const T = D.TRACKS[g.side];
    const SQ = T.squares;
    const P = id => g.players.find(p => p.id === id) || null;
    const log = e => { g.log.push(Object.assign({ round: g.round }, e)); };
    const push = st => { g.steps.splice(g.ins++, 0, st); };
    const pushFx = (p, fx, src) => { for (const s of (fx || [])) push({ k: 'e', seat: p.id, s, src: src || null }); };
    const ask = (p, t, data) => {
      const pr = Object.assign({ n: ++g.pn, seat: p.id, t }, data);
      g.prompts.push(pr);
      return pr;
    };
    const close = pr => { const i = g.prompts.indexOf(pr); if (i >= 0) g.prompts.splice(i, 1); };
    const siteName = s => {
      if (!s) return '?';
      if (s.tile) { const d = D.site(s.tile); return d ? d.name : s.tile; }
      return (s.level === 1 ? 'a level I site' : 'a level II site');
    };

    g.idx = id => g.players.findIndex(p => p.id === id);
    g.seat = P;
    /* The display's own entries in the log (somebody hurried along). */
    g.note = e => log(e);
    /* The open question for a seat, if any. */
    g.promptFor = id => g.prompts.find(pr => pr.seat === id) || null;
    g.activeId = () => g.players[g.cur] ? g.players[g.cur].id : null;

    /* ---------------- cards moving ---------------- */

    function draw(p, k, fromBottom) {
      let got = 0;
      for (let i = 0; i < k; i++) {
        if (!p.deck.length) break;
        p.hand.push(fromBottom ? p.deck.pop() : p.deck.shift());
        got++; g.drawN++;
      }
      return got;
    }
    function takeFear(p) {
      if (g.fearSupply.length) { p.play.push(g.fearSupply.shift()); return 'card'; }
      if (g.fearTiles > 0) { g.fearTiles--; p.fearTiles++; return 'tile'; }
      return null;
    }
    function exileCard(p, uid) {
      if (uid === 'feartile') {
        if (p.fearTiles < 1) return false;
        p.fearTiles--; g.fearTiles++;
        return true;
      }
      let where = p.hand.indexOf(uid) >= 0 ? p.hand : (p.play.indexOf(uid) >= 0 ? p.play : null);
      if (!where) return false;
      where.splice(where.indexOf(uid), 1);
      const kind = D.kindOf(uid);
      if (kind === 'fear') g.fearSupply.push(uid);
      else if (kind === 'art') g.exiled.art.push(uid);
      else if (kind === 'item') g.exiled.item.push(uid);
      else g.exiled.basic.push(uid);
      p.exiledN++;
      return true;
    }
    const exileChoices = p => p.hand.map(uid => ({ id: uid, card: uid, where: 'hand' }))
      .concat(p.play.map(uid => ({ id: uid, card: uid, where: 'play' })))
      .concat(p.fearTiles ? [{ id: 'feartile', label: 'A fear tile', where: 'play' }] : []);

    /* ---------------- sites ---------------- */

    const atCamp = p => p.arch.filter(a => !a).length;
    const occupied = s => s.spaces.some(sp => sp.who);
    const mine = (p, s) => s.spaces.some(sp => sp.who === p.id);
    const siteFx = s => { const d = D.site(s.tile); return d ? d.fx : []; };
    function place(p, s, k) {
      const i = p.arch.indexOf(null);
      p.arch[i] = { site: s.id, space: k };
      s.spaces[k].who = p.id;
    }
    function lift(p, i) {
      const a = p.arch[i];
      if (!a) return;
      const s = g.sites[a.site];
      if (s && s.spaces[a.space].who === p.id) s.spaces[a.space].who = null;
      p.arch[i] = null;
    }

    /* Where an archaeologist could be sent: every free space at a discovered
       site, and every undiscovered site (found by paying its compasses too). */
    function digTargets(p, o) {
      o = o || {};
      if (!atCamp(p)) return [];
      const w = walletOf(p);
      const out = [];
      for (const s of Object.values(g.sites)) {
        if (o.levels && o.levels.indexOf(s.level) < 0) continue;
        if (s.tile) {
          s.spaces.forEach((sp, k) => {
            if (sp.who || sp.blocked) return;
            const cost = o.free ? [] : sp.cost;
            out.push({ t: 'dig', slot: s.id, space: k, cost, level: s.level,
              ok: o.free || canCover(w, cost, o.disc, p.res.coin) });
          });
        } else if (!o.noDiscover && !o.free) {
          const comp = Math.max(0, D.DISCOVER[s.level] - (o.comp || 0));
          if (!g.siteDecks[s.level].length) continue;
          const cost = s.spaces[0].cost;
          out.push({ t: 'discover', slot: s.id, space: 0, cost, level: s.level, comp,
            ok: p.res.compass >= comp && canCover(w, cost, o.disc, p.res.coin) });
        }
      }
      return out;
    }

    /* ---------------- the guardians ---------------- */

    function guardianCost(gid) {
      const c = D.GUARD[gid].cost;
      const res = {}, travel = c.travel ? c.travel.slice() : [];
      for (const k in c) if (k !== 'travel' && k !== 'useCard') res[k] = c[k];
      return { res, travel, useCard: c.useCard || 0 };
    }
    function canOvercome(p, s) {
      if (!s.guardian || !mine(p, s)) return no('No guardian at a site of yours.');
      const c = guardianCost(s.guardian);
      if (!afford(p.res, c.res)) return no('You cannot pay ' + D.GUARD[s.guardian].name + '.');
      if (c.useCard && !p.hand.length) return no('It wants a card from your hand.');
      const held = p.res.coin - (c.res.coin || 0);
      /* The card set aside for the guardian cannot also be the travel. */
      if (c.travel.length) {
        const w = walletOf(p);
        if (c.useCard) {
          let fine = false;
          for (const uid of p.hand) {
            const w2 = Object.assign({}, w, { hand: w.hand.filter(x => x !== uid) });
            if (canCover(w2, c.travel, null, held)) { fine = true; break; }
          }
          if (!fine) return no('Not enough travel and cards for it.');
        } else if (!canCover(w, c.travel, null, held)) return no('Not enough travel for it.');
      }
      return yes();
    }
    function takeGuardian(p, s, how) {
      const gid = s.guardian;
      s.guardian = null;
      p.guardians.push({ id: gid, used: false });
      log({ t: 'overcome', by: p.id, guardian: gid, site: s.id, how: how || 'paid' });
    }

    /* ---------------- research ---------------- */

    /* Every move a token could make, with its price after any discount. */
    function researchMoves(p, o) {
      o = o || {};
      const out = [];
      const discs = o.discOr ? o.discOr : [o.disc || null];
      const priced = cost => {
        if (o.free) return { cost: {}, ok: true };
        let best = null;
        for (const d of discs) {
          const c = minus(cost, d);
          const ok = afford(p.res, c, p.idols);
          const v = costValue(c);
          if (!best || (ok && !best.ok) || (ok === best.ok && v < best.v)) best = { cost: c, ok, v, disc: d };
        }
        return best;
      };
      const tokens = o.token ? [o.token] : ['glass', 'book'];
      for (const tok of tokens) {
        const from = SQ[p[tok]];
        if (tok === 'glass' && from.temple) continue;
        for (const to of from.next) {
          const s = SQ[to];
          if (tok === 'book' && (s.temple || s.row > SQ[p.glass].row)) continue;
          const pr = priced(s.cost);
          out.push({ t: 'research', token: tok, to, cost: pr.cost, ok: pr.ok, disc: pr.disc });
        }
      }
      if (!o.token && SQ[p.glass].temple && !o.free) {
        for (const st of D.TEMPLE_STACKS) {
          if (!g.research.stacks[st.id]) continue;
          let cost = {};
          for (const u of st.uses) cost = addTo(cost, T.templeCosts[u]);
          const pr = priced(cost);
          out.push({ t: 'temple', stack: st.id, vp: st.vp, cost: pr.cost, ok: pr.ok, disc: pr.disc });
        }
      }
      return out;
    }
    function doResearch(p, mv) {
      if (mv.t === 'temple') {
        spend(p, mv.cost);
        g.research.stacks[mv.stack]--;
        const st = D.TEMPLE_STACKS.find(x => x.id === mv.stack);
        p.temple.push(st.vp);
        log({ t: 'templeTile', by: p.id, vp: st.vp });
        return;
      }
      spend(p, mv.cost);
      p[mv.token] = mv.to;
      const s = SQ[mv.to];
      log({ t: 'research', by: p.id, token: mv.token, row: s.row, to: mv.to });
      const later = [];
      if (s.temple) {
        p.arrival = g.research.arrivals++;
        log({ t: 'temple', by: p.id, rank: p.arrival, vp: D.TEMPLE_ARRIVAL[p.arrival] });
        if (g.research.templeBonus.length) later.push({ k: 'templeBonus', seat: p.id });
        for (const st of later) push(st);
        return;
      }
      /* The row's own reward, and the bonus tile if the space still has one.
         Drawing goes before exiling or trading up, whichever came from where:
         the book allows either order and that one is never worse. */
      const row = T.rows[s.row][mv.token];
      const fx = [{ k: 'row', seat: p.id, r: row.r }];
      const tiles = g.research.bonus[mv.to];
      if (tiles && tiles.length) {
        if (s.pick) fx.push({ k: 'tales', seat: p.id, sq: mv.to });
        else {
          const b = tiles.shift();
          log({ t: 'bonus', by: p.id, bonus: b });
          fx.push({ k: 'reward', seat: p.id, r: b, src: 'bonus' });
        }
      }
      const rank = st => {
        const r = st.r;
        if (r === 'exile' || r === 'upgrade') return 2;
        if (st.k === 'tales') return 1;
        return 0;
      };
      fx.sort((a, b) => rank(a) - rank(b));
      for (const st of fx) push(st);
    }
    function spend(p, cost) {
      for (const k in cost) {
        if (k === 'idol') { p.idols -= cost.idol; p.idolsLost += cost.idol; continue; }
        p.res[k] -= cost[k];
      }
    }

    /* ---------------- buying ---------------- */

    function rowCards(type) {
      const out = [];
      for (const t of (type === 'any' ? ['art', 'item'] : [type])) for (const uid of g.row[t]) if (uid) out.push(uid);
      return out;
    }
    function priceOf(uid, disc) {
      const c = D.card(uid);
      const res = c.kind === 'art' ? 'compass' : 'coin';
      return { res, n: Math.max(0, c.cost - (disc || 0)) };
    }
    function takeFromRow(uid) {
      for (const t of ['art', 'item']) {
        const i = g.row[t].indexOf(uid);
        if (i >= 0) { g.row[t][i] = null; return true; }
      }
      for (const t of ['art', 'item']) if (g.decks[t][0] === uid && g.peek === uid) { g.decks[t].shift(); g.peek = null; return true; }
      return false;
    }
    /* A card arriving, by purchase or as a gift. Items go to the bottom of
       the deck (or wherever the effect says); an artifact goes into play and
       may be used at once, the tablet not paid. */
    function receive(p, uid, to, use, opt) {
      const c = D.card(uid);
      if (c.kind === 'item') {
        if (to === 'top') p.deck.unshift(uid);
        else if (to === 'hand') p.hand.push(uid);
        else p.deck.push(uid);
        return;
      }
      p.play.push(uid);
      if (use) cardFx(p, uid, opt | 0);
    }
    function cardFx(p, uid, opt) {
      const c = D.card(uid);
      if (c.opts) {
        const o = c.opts[opt | 0] || c.opts[0];
        pushFx(p, o.fx, uid);
        if (o.pass) push({ k: 'pass', seat: p.id });
      } else pushFx(p, c.fx, uid);
    }

    /* ---------------- the assistants ---------------- */

    const tops = () => g.asst.stacks.map(st => st[0] || null);
    function asstFx(a, gold) { const d = D.ASST[a]; return (gold ? d.gold : d.silver).fx; }

    /* ---------------- the turn ---------------- */

    /* Could this player still do anything free this turn? */
    function freeActions(p) {
      if (p.hand.some(uid => { const c = D.card(uid); return c && (c.free || (c.opts && c.opts.some(o => o.free))); })) return true;
      if (p.asst.some(a => a.ready && !D.ASST[a.id].main)) return true;
      if (p.guardians.some(x => !x.used && D.GUARD[x.id].boon.fx)) return true;
      if (p.idols > 0 && p.slots < 4) return true;
      return false;
    }

    /* Everything the active player could do right now, for the phone to
       draw buttons from and the house to choose between. */
    function turnCan(p) {
      const main = !p.mainDone;
      const w = walletOf(p);
      const can = { main, end: p.mainDone, pass: main, campArch: atCamp(p) };
      can.dig = main ? digTargets(p) : [];
      can.overcome = main ? Object.values(g.sites).filter(s => s.guardian && mine(p, s)).map(s => {
        const r = canOvercome(p, s);
        return { slot: s.id, guardian: s.guardian, ok: r.ok, why: r.ok ? '' : r.why, cost: guardianCost(s.guardian) };
      }) : [];
      can.buy = main ? rowCards('any').map(uid => {
        const pr = priceOf(uid, 0);
        return { card: uid, res: pr.res, cost: pr.n, ok: p.res[pr.res] >= pr.n };
      }) : [];
      can.play = p.hand.map(uid => playCheck(p, uid));
      can.research = main ? researchMoves(p) : [];
      can.assist = p.asst.map(a => {
        const d = D.ASST[a.id];
        const side = a.gold ? d.gold : d.silver;
        let ok = a.ready, why = a.ready ? '' : 'Used this round.';
        if (ok && d.main && !main) { ok = false; why = 'That is a main action.'; }
        const opts = side.fx[0].choose ? side.fx[0].choose.map((o, i) => ({ i, label: o.label, ok: !o.pay || afford(p.res, o.pay) })) : null;
        if (ok && side.fx[0].pay && !afford(p.res, side.fx[0].pay)) { ok = false; why = 'You cannot pay for it.'; }
        if (ok && side.fx[0].travelPay && !canCover(w, side.fx[0].travelPay, null, p.res.coin)) { ok = false; why = 'No travel to pay with.'; }
        if (ok && opts && !opts.some(o => o.ok)) { ok = false; why = 'You cannot pay for it.'; }
        return { id: a.id, gold: a.gold, ready: a.ready, ok, why, main: !!d.main, opts };
      });
      can.idol = {
        ok: p.idols > 0 && p.slots < 4,
        cost: p.slots < 4 ? D.SLOT_VALUE[p.slots] : 0,
        opts: D.IDOL_SLOT.map((o, i) => ({ i, id: o.id, label: o.label, ok: !o.pay || afford(p.res, o.pay) }))
      };
      can.boon = p.guardians.filter(x => !x.used && D.GUARD[x.id].boon.fx).map(x => ({ id: x.id, ok: true }));
      return can;
    }

    /* Can this card be played for its effect right now? */
    function playCheck(p, uid) {
      const c = D.card(uid);
      const out = { card: uid, ok: false, why: '', free: false };
      if (!c || !c.fx && !c.opts) { out.why = 'Fear does nothing but travel.'; return out; }
      if (c.opts) {
        out.opts = c.opts.map((o, i) => {
          let ok = true, why = '';
          if (!o.free && p.mainDone) { ok = false; why = 'You have had your main action.'; }
          if (c.kind === 'art' && p.res.tablet < 1) { ok = false; why = 'Playing an artifact costs a tablet.'; }
          return { i, label: o.label, ok, why, free: !!o.free, pass: !!o.pass };
        });
        out.ok = out.opts.some(o => o.ok);
        out.free = out.opts.some(o => o.free && o.ok);
        if (!out.ok) out.why = out.opts[0].why || out.opts[1].why;
        return out;
      }
      out.free = !!c.free;
      if (!c.free && p.mainDone) { out.why = 'You have had your main action.'; return out; }
      const need = c.kind === 'art' ? { tablet: 1 } : {};
      const first = c.fx[0];
      if (first.pay) {
        if (!afford(p.res, addTo(need, first.pay))) { out.why = 'You cannot pay for it.'; return out; }
      } else if (!afford(p.res, need)) { out.why = 'Playing an artifact costs a tablet.'; return out; }
      if (first.useCard && p.hand.length < 2) { out.why = 'It needs another card in your hand.'; return out; }
      out.ok = true;
      return out;
    }

    function openTurn(p) {
      ask(p, 'turn', { why: p.mainDone ? 'Anything else, or end your turn' : 'Your turn' });
    }

    /* ---------------- the step runner ---------------- */

    function exec(st) {
      const p = st.seat ? P(st.seat) : null;
      switch (st.k) {
        case 'round': return startRound();
        case 'turn': return nextTurn();
        case 'again': {
          if (g.players[g.cur] !== p) return;
          if (p.mainDone && !freeActions(p)) { push({ k: 'endTurn', seat: p.id }); return; }
          openTurn(p);
          return;
        }
        case 'endTurn': return endTurn(p);
        case 'pass': {
          p.passed = true; p.mainDone = true;
          log({ t: 'pass', by: p.id });
          return;
        }
        case 'roundEnd': return roundEnd();
        case 'roundEnd2': return roundEnd2();
        case 'final': return finish();
        case 'e': return effect(p, st.s, st.src);
        case 'row': return rowReward(p, st.r);
        case 'reward': pushFx(p, D.REWARD[st.r].fx, st.src || 'reward'); return;
        case 'tales': {
          const tiles = g.research.bonus[st.sq] || [];
          if (!tiles.length) return;
          const options = Array.from(new Set(tiles)).map(b => ({ id: b, label: D.REWARD[b].text }));
          if (options.length === 1) { tiles.splice(tiles.indexOf(options[0].id), 1); log({ t: 'bonus', by: p.id, bonus: options[0].id }); push({ k: 'reward', seat: p.id, r: options[0].id }); return; }
          ask(p, 'pick', { what: 'tales', why: 'Take one of the bonus tiles', options, sq: st.sq });
          return;
        }
        case 'templeBonus': {
          const options = Array.from(new Set(g.research.templeBonus)).map(b => ({ id: b, label: D.REWARD[b].text }));
          if (!options.length) return;
          if (options.length === 1) { g.research.templeBonus.splice(g.research.templeBonus.indexOf(options[0].id), 1); push({ k: 'reward', seat: p.id, r: options[0].id }); return; }
          ask(p, 'pick', { what: 'templeBonus', why: 'The Lost Temple — choose one of the tiles in the stack', options, private: true });
          return;
        }
        case 'guardian': {
          const s = g.sites[st.slot];
          if (!s.guardian && g.guardDeck.length) {
            s.guardian = g.guardDeck.shift();
            log({ t: 'awaken', site: s.id, guardian: s.guardian });
          }
          return;
        }
      }
    }

    function run() {
      let guard = 0;
      while (!g.prompts.length && g.steps.length && g.phase !== 'over') {
        if (++guard > 200000) throw new Error('arnak: runaway steps');
        const st = g.steps.shift();
        g.ins = 0;
        exec(st);
      }
    }
    g.run = run;

    function startRound() {
      for (const p of g.players) {
        p.passed = false; p.mainDone = false; p.pool = [];
        draw(p, Math.max(0, 5 - p.hand.length));
      }
      g.cur = g.start;
      log({ t: 'round', n: g.round, start: g.players[g.start].id });
      push({ k: 'turn' });
    }
    function nextTurn() {
      for (let k = 0; k < g.n; k++) {
        const i = (g.cur + k) % g.n;
        if (!g.players[i].passed) {
          g.cur = i;
          const p = g.players[i];
          p.mainDone = false; p.pool = [];
          g.turnN++;                 // a turn begins (undo goes back no further)
          openTurn(p);
          return;
        }
      }
      push({ k: 'roundEnd' });
    }
    function endTurn(p) {
      refill(g, 'art'); refill(g, 'item');
      g.peek = null; g.reveal = null;
      p.pool = [];
      g.cur = (g.idx(p.id) + 1) % g.n;
      push({ k: 'turn' });
    }

    function roundEnd() {
      /* Everybody comes home; a guardian at the site costs a Fear, unless the
         War Mask is up. */
      for (const p of g.players) {
        let fear = 0;
        p.arch.forEach((a, i) => {
          if (!a) return;
          const s = g.sites[a.site];
          if (s.guardian && !p.mask) { takeFear(p); fear++; }
          lift(p, i);
        });
        if (fear) log({ t: 'fear', by: p.id, n: fear, why: 'guardian' });
      }
      if (g.round >= 5) { push({ k: 'final' }); return; }
      /* Cards still in hand may be kept for next round, or put into play. */
      for (const p of g.players) {
        if (!p.hand.length) continue;
        ask(p, 'keep', { why: 'Keep any cards for next round?', options: p.hand.map(uid => ({ id: uid, card: uid })) });
      }
      push({ k: 'roundEnd2' });
    }
    function roundEnd2() {
      for (const p of g.players) {
        p.deck = p.deck.concat(shuffle(p.play, g.rng));
        p.play = [];
        for (const a of p.asst) a.ready = true;
        p.mask = false; p.ocarina = false; p.pool = [];
      }
      /* The two cards beside the moon staff go; the staff moves one along. */
      const ea = g.row.art[0], ei = g.row.item[0];
      if (ea) g.exiled.art.push(ea);
      if (ei) g.exiled.item.push(ei);
      log({ t: 'staff', art: ea || null, item: ei || null });
      g.row.art[0] = null;
      g.row.art = [null].concat(g.row.art);
      g.row.item = g.row.item.slice(1);
      g.round++;
      refill(g, 'art'); refill(g, 'item');
      g.start = (g.start + 1) % g.n;
      push({ k: 'round' });
    }

    function finish() {
      const rows = g.players.map(p => Object.assign({ id: p.id, name: p.name, hex: p.hex, bot: p.bot, arrival: p.arrival }, score(p, g)));
      rows.forEach(r => { r.score = { research: r.research, temple: r.temple, idols: r.idols, guardians: r.guardians, cards: r.cards, fear: r.fear }; });
      const key = r => [r.total, r.arrival == null ? -1 : 10 - r.arrival, r.research];
      rows.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; });
      let place = 0, prev = null;
      rows.forEach((r, i) => {
        const k = key(r).join(',');
        if (k !== prev) place = i + 1;
        prev = k;
        r.place = place;
        r.won = place === 1;
      });
      g.result = { rows, top: rows[0].total };
      g.phase = 'over';
      log({ t: 'over', top: rows[0].total });
    }

    /* ---------------- effects ---------------- */

    function effect(p, s, src) {
      if (s.g) {
        for (const k in s.g) p.res[k] += s.g[k];
        log({ t: 'gain', by: p.id, res: s.g, src });
        return;
      }
      if (s.fear) {
        for (let i = 0; i < s.fear; i++) takeFear(p);
        log({ t: 'fear', by: p.id, n: s.fear, src });
        return;
      }
      if (s.draw) { const k = draw(p, s.draw); if (k) log({ t: 'draw', by: p.id, n: k, src }); return; }
      if (s.drawBottom) { const k = draw(p, s.drawBottom, true); if (k) log({ t: 'draw', by: p.id, n: k, bottom: true, src }); return; }
      if (s.exile) {
        const options = exileChoices(p);
        if (!options.length) return;
        ask(p, 'pick', { what: 'exile', why: 'Exile a card?', options, skip: true, src });
        return;
      }
      if (s.upgrade) {
        const options = [];
        if (p.res.tablet > 0) options.push({ id: 'ta', label: 'A tablet up to an arrowhead' });
        if (p.res.arrowhead > 0) options.push({ id: 'aj', label: 'An arrowhead up to a jewel' });
        if (!options.length) return;
        ask(p, 'pick', { what: 'upgrade', why: 'Trade a resource up?', options, skip: true, src });
        return;
      }
      if (s.refresh) {
        const tired = p.asst.filter(a => !a.ready);
        if (!tired.length) return;
        if (tired.length <= s.refresh) { for (const a of tired) a.ready = true; log({ t: 'refresh', by: p.id, ids: tired.map(a => a.id) }); return; }
        ask(p, 'pick', { what: 'refresh', why: 'Refresh which assistant?', options: tired.map(a => ({ id: a.id, asst: a.id })), src });
        return;
      }
      if (s.pay) {
        if (!afford(p.res, s.pay)) { log({ t: 'cannot', by: p.id, src }); return; }
        spend(p, s.pay);
        pushFx(p, s.then, src);
        return;
      }
      if (s.useCard) {
        if (!p.hand.length) { log({ t: 'cannot', by: p.id, src }); return; }
        /* A card as the price of something may be declined along with the
           something; a card that simply has to go (the Porter's) may not. */
        const must = s.must || !s.then;
        if (p.hand.length === 1 && must) { useCard(p, p.hand[0]); pushFx(p, s.then, src); return; }
        ask(p, 'pick', { what: 'useCard', why: s.then ? 'Put which card into play, unused?' : 'Put a card from your hand into play, unused',
          options: p.hand.map(uid => ({ id: uid, card: uid })), skip: !must, then: s.then || null, src });
        return;
      }
      if (s.travelPay) {
        const w = walletOf(p);
        const auto = checkPay(w, s.travelPay, null, {}, p.res.coin);
        if (auto.ok) { applyPay(p, s.travelPay, null, {}, auto); pushFx(p, s.then, src); return; }
        if (!canCover(w, s.travelPay, null, p.res.coin)) { log({ t: 'cannot', by: p.id, src }); return; }
        ask(p, 'pay', { why: 'Pay the travel', cost: s.travelPay.slice(), then: s.then || null, skip: true, src });
        return;
      }
      if (s.travel) { for (const icon of s.travel) p.pool.push(icon); log({ t: 'travel', by: p.id, icons: s.travel }); return; }
      if (s.dig) {
        const o = s.dig;
        const targets = digTargets(p, o).filter(t => t.ok);
        if (!targets.length) return;
        ask(p, 'dig', { why: o.free ? 'Send an archaeologist to a camp site' : 'Send an archaeologist out', o: clone(o), skip: true, src });
        return;
      }
      if (s.research) {
        const moves = researchMoves(p, s.research).filter(m => m.ok);
        if (!moves.length) return;
        ask(p, 'research', { why: s.research.free ? 'Move your notebook up, free' : 'Research, with a discount', o: clone(s.research), skip: true, src });
        return;
      }
      if (s.buy) {
        const o = s.buy;
        if (o.peek) {
          const t = o.type;
          if (g.decks[t].length) { g.peek = g.decks[t][0]; log({ t: 'peek', by: p.id, card: g.peek }); }
        }
        const cands = rowCards(o.type).concat(g.peek && (o.type === 'any' || D.kindOf(g.peek) === o.type) ? [g.peek] : []);
        if (!cands.some(uid => { const pr = priceOf(uid, o.disc); return p.res[pr.res] >= pr.n; })) { g.peek = null; return; }
        ask(p, 'buy', { why: 'Buy a card, ' + o.disc + ' cheaper', o: clone(o), skip: true, src });
        return;
      }
      if (s.gain) {
        const o = s.gain;
        const cands = rowCards(o.type);
        if (!cands.length) return;
        ask(p, 'pick', { what: 'gain', why: o.type === 'art' ? 'Take an artifact for nothing' : 'Take an item for nothing', options: cands.map(uid => ({ id: uid, card: uid })), skip: true, o: clone(o), src });
        return;
      }
      if (s.overcome) {
        const o = s.overcome;
        const cands = Object.values(g.sites).filter(x => x.guardian && (o.where === 'noOther'
          ? !x.spaces.some(sp => sp.who && sp.who !== p.id) : mine(p, x)));
        if (!cands.length) return;
        if (cands.length === 1 && o.auto) { takeGuardian(p, cands[0], 'free'); return; }
        ask(p, 'pick', { what: 'overcome', why: 'Overcome a guardian, free', options: cands.map(x => ({ id: x.id, slot: x.id, guardian: x.guardian })), skip: true, src });
        return;
      }
      if (s.activate) {
        const o = s.activate;
        const cands = Object.values(g.sites).filter(x => x.tile && (!o.levels || o.levels.indexOf(x.level) >= 0) &&
          (!o.unocc || !occupied(x)) && (!o.mine || mine(p, x)) && (!o.not || o.not.indexOf(x.id) < 0) &&
          (!(o.mine && x.level === 2 && o.l2pay) || afford(p.res, o.l2pay)));
        if (!cands.length) return;
        ask(p, 'pick', { what: 'activate', why: (o.n === 2 ? 'Use two different sites — the first' : (o.not ? 'Now the second site' : 'Use a site')),
          options: cands.map(x => ({ id: x.id, slot: x.id })), skip: true, o: clone(o), left: o.n || 1, src });
        return;
      }
      if (s.activateTop) {
        const lv = s.activateTop;
        const deck = g.siteDecks[lv];
        if (!deck.length) return;
        const id = deck.shift();
        deck.push(id);
        g.reveal = id;
        log({ t: 'reveal', by: p.id, tile: id });
        pushFx(p, D.site(id).fx, 'site:' + id);
        return;
      }
      if (s.relocate) {
        const o = s.relocate;
        const options = [];
        p.arch.forEach((a, i) => {
          if (!a) return;
          for (const x of Object.values(g.sites)) {
            if (!x.tile || x.id === a.site || o.levels.indexOf(x.level) < 0) continue;
            const k = x.spaces.findIndex(sp => !sp.who && !sp.blocked);
            if (k < 0) continue;
            options.push({ id: i + '>' + x.id, from: a.site, slot: x.id, arch: i, space: k });
          }
        });
        if (!options.length) return;
        ask(p, 'pick', { what: 'relocate', why: 'Move an archaeologist, and use the site', options, skip: true, src });
        return;
      }
      if (s.recall) {
        const options = p.arch.map((a, i) => a ? { id: String(i), from: a.site, arch: i } : null).filter(Boolean);
        if (!options.length) return;
        ask(p, 'pick', { what: 'recall', why: 'Bring an archaeologist home?', options, skip: true, src });
        return;
      }
      if (s.ocarina) { p.ocarina = true; p.pool = p.pool.map(() => 'plane'); log({ t: 'ocarina', by: p.id }); return; }
      if (s.warMask) { p.mask = true; log({ t: 'mask', by: p.id }); return; }
      if (s.crown) {
        const options = [];
        for (const from of Object.values(g.sites)) {
          if (!from.guardian || !mine(p, from)) continue;
          for (const to of Object.values(g.sites)) {
            if (to === from || !to.tile || to.level > 1 || to.guardian || occupied(to)) continue;
            options.push({ id: from.id + '>' + to.id, from: from.id, slot: to.id, guardian: from.guardian });
          }
        }
        if (!options.length) return;
        ask(p, 'pick', { what: 'crown', why: 'Lead a guardian away, and use the site', options, skip: true, src });
        return;
      }
      if (s.supplyAsst) {
        const options = tops().filter(Boolean).map(id => ({ id, asst: id, gold: s.supplyAsst === 'gold' }));
        if (!options.length) return;
        ask(p, 'pick', { what: 'supplyAsst', why: 'Borrow an assistant’s ' + s.supplyAsst + ' side', options, skip: true, gold: s.supplyAsst === 'gold', src });
        return;
      }
      if (s.swapAsst) {
        const options = [];
        for (const a of p.asst) tops().forEach((t, k) => { if (t) options.push({ id: a.id + '>' + k, give: a.id, asst: t, stack: k }); });
        if (!options.length) return;
        ask(p, 'pick', { what: 'swapAsst', why: 'Swap an assistant', options, skip: true, src });
        return;
      }
      if (s.stoneKey) {
        if (p.slots > 0) { p.slots--; p.idols++; log({ t: 'key', by: p.id }); }
        return;
      }
      if (s.earring) {
        const o = s.earring;
        const most = Math.min(o.max, p.deck.length);
        if (!most) return;
        const options = [];
        for (let k = 1; k <= most; k++) options.push({ id: String(k), label: 'Draw ' + k });
        ask(p, 'pick', { what: 'earringN', why: 'How many will you draw?', options, o: clone(o), src });
        return;
      }
      if (s.hammer) {
        const items = g.row.item;
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i]) { g.exiled.item.push(items[i]); log({ t: 'hammer', by: p.id, card: items[i] }); items[i] = null; break; }
        }
        if (!g.exiled.item.length) return;
        ask(p, 'pick', { what: 'hammer', why: 'Take an exiled item, free?', options: g.exiled.item.map(uid => ({ id: uid, card: uid })), skip: true, src });
        return;
      }
      if (s.per) {
        const o = s.per;
        let k = 0;
        if (o.what === 'guardians') k = p.guardians.length + Object.values(g.sites).filter(x => x.guardian && mine(p, x)).length;
        else if (o.what === 'idols') k = p.idols + p.slots;
        else if (o.what === 'placed') k = p.arch.filter(Boolean).length;
        if (o.max != null) k = Math.min(k, o.max);
        if (k) { p.res[o.res] += k; log({ t: 'gain', by: p.id, res: { [o.res]: k }, src }); }
        return;
      }
      if (s.choose) {
        const options = s.choose.map((c, i) => ({ id: String(i), label: c.label, ok: !c.pay || afford(p.res, c.pay), fx: clone(c.fx), pay: c.pay ? Object.assign({}, c.pay) : null })).filter(o => o.ok);
        if (!options.length) { log({ t: 'cannot', by: p.id, src }); return; }
        ask(p, 'pick', { what: 'choose', why: 'Choose one', options, choose: clone(s.choose), src });
        return;
      }
      if (s.choose2) {
        ask(p, 'multi', { what: 'choose2', why: 'Choose two different', options: s.choose2.map(x => ({ id: x, label: x === 'exile' ? 'Exile a card' : 'A ' + D.RES_NAME[x] })), min: 2, max: 2, src });
        return;
      }
    }

    function useCard(p, uid) {
      const i = p.hand.indexOf(uid);
      if (i < 0) return false;
      p.hand.splice(i, 1);
      p.play.push(uid);
      log({ t: 'usecard', by: p.id, card: uid });
      return true;
    }

    function rowReward(p, r) {
      switch (r) {
        case 'coin': return effect(p, { g: { coin: 1 } }, 'row');
        case 'coin2': return effect(p, { g: { coin: 2 } }, 'row');
        case 'compass': return effect(p, { g: { compass: 1 } }, 'row');
        case 'compass3': return effect(p, { g: { compass: 3 } }, 'row');
        case 'jewel': return effect(p, { g: { jewel: 1 } }, 'row');
        case 'draw': return effect(p, { draw: 1 }, 'row');
        case 'fear': return effect(p, { fear: 1 }, 'row');
        case 'exile': return effect(p, { exile: 1 }, 'row');
        case 'refreshAsst': return effect(p, { refresh: 1 }, 'row');
        case 'freeArt': return effect(p, { gain: { type: 'art', to: 'play' } }, 'row');
        case 'guard': return effect(p, { overcome: { where: 'mine' } }, 'row');
        case 'recruit': {
          if (p.asst.length >= 2) return;
          const options = tops().map((id, k) => id ? { id, asst: id, stack: k } : null).filter(Boolean);
          if (!options.length) return;
          if (options.length === 1) return recruit(p, options[0].id, false);
          ask(p, 'pick', { what: 'recruit', why: 'Recruit an assistant', options, src: 'row' });
          return;
        }
        case 'upAsst': {
          const silver = p.asst.filter(a => !a.gold);
          if (!silver.length) return;
          if (silver.length === 1) { upgradeAsst(p, silver[0].id); return; }
          ask(p, 'pick', { what: 'upAsst', why: 'Upgrade which assistant to gold?', options: silver.map(a => ({ id: a.id, asst: a.id })), src: 'row' });
          return;
        }
        case 'rescue': {
          if (!g.asst.rescue.length || p.asst.length >= 2) return;
          ask(p, 'pick', { what: 'rescue', why: 'Rescue a stranded assistant', options: g.asst.rescue.map(id => ({ id, asst: id })), private: true, src: 'row' });
          return;
        }
      }
    }
    function recruit(p, id, fromRescue) {
      if (fromRescue) {
        const i = g.asst.rescue.indexOf(id);
        if (i < 0) return false;
        g.asst.rescue.splice(i, 1);
        p.asst.push({ id, gold: false, ready: false });
        log({ t: 'rescue', by: p.id, asst: id });
        return true;
      }
      const k = g.asst.stacks.findIndex(st => st[0] === id);
      if (k < 0) return false;
      g.asst.stacks[k].shift();
      p.asst.push({ id, gold: false, ready: true });
      log({ t: 'recruit', by: p.id, asst: id });
      return true;
    }
    function upgradeAsst(p, id) {
      const a = p.asst.find(x => x.id === id && !x.gold);
      if (!a) return false;
      a.gold = true; a.ready = true;
      log({ t: 'upAsst', by: p.id, asst: id });
      return true;
    }

    /* ---------------- paying travel ---------------- */

    function applyPay(p, cost, disc, pay, checked) {
      pay = pay || {};
      for (const uid of (pay.cards || [])) {
        p.hand.splice(p.hand.indexOf(uid), 1);
        p.play.push(uid);
      }
      for (const id of (pay.boons || [])) { const b = p.guardians.find(x => x.id === id); b.used = true; }
      for (const id of (pay.assts || [])) { const a = p.asst.find(x => x.id === id); a.ready = false; }
      if (pay.pilots) p.res.coin -= 2 * pay.pilots;
      const avail = checked.avail;
      const used = new Set(checked.used);
      p.pool = avail.filter((x, i) => !x.disc && !used.has(i)).map(x => x.icon);
      if ((pay.cards || []).length || (pay.boons || []).length || (pay.assts || []).length || pay.pilots) {
        log({ t: 'travel-paid', by: p.id, cards: (pay.cards || []).slice(), boons: (pay.boons || []).slice(), assts: (pay.assts || []).slice(), pilots: pay.pilots || 0 });
      }
    }

    /* ---------------- answering ---------------- */

    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The expedition is over.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const mineOpen = g.prompts.filter(pr => pr.seat === seatId);
      if (!mineOpen.length) return no('It is not your turn.');
      let pr = null;
      if (a.n != null) pr = mineOpen.find(x => x.n === a.n) || null;
      else if (mineOpen.length === 1) pr = mineOpen[0];
      if (!pr) return no('That question has moved on.');
      g.ins = 0;
      let r;
      try { r = answer(p, pr, a); }
      catch (e) { r = no('That did not work: ' + e.message); }
      if (!r.ok) return r;
      run();
      return r;
    };

    /* Each kind of question takes its own kind of answer. Without this a
       stale "end turn" arriving while a sub-question is open reads as
       declining that question. */
    const FITS = {
      turn: ['end', 'pass', 'dig', 'discover', 'overcome', 'buy', 'research', 'temple', 'play', 'assist', 'idol', 'boon'],
      pick: ['pick', 'skip'], multi: ['multi'], dig: ['dig', 'discover', 'skip'], research: ['research', 'temple', 'skip'],
      buy: ['buy', 'skip'], pay: ['pay', 'skip'], keep: ['keep']
    };
    function answer(p, pr, a) {
      if (!FITS[pr.t] || FITS[pr.t].indexOf(a.t) < 0) return no(pr.t === 'turn' ? 'That is not something you can do now.' : 'Answer the question on your screen first.');
      switch (pr.t) {
        case 'turn': return turnAct(p, pr, a);
        case 'pick': return pickAct(p, pr, a);
        case 'multi': return multiAct(p, pr, a);
        case 'dig': return a.t === 'skip' && pr.skip ? done(pr) : doDig(p, pr, a, pr.o, false);
        case 'research': return a.t === 'skip' && pr.skip ? done(pr) : doResearchAct(p, pr, a, pr.o, false);
        case 'buy': return a.t === 'skip' && pr.skip ? (g.peek = null, done(pr)) : doBuy(p, pr, a, pr.o, false);
        case 'pay': {
          if (a.t === 'skip' && pr.skip) return done(pr);
          const chk = checkPay(walletOf(p), pr.cost, null, a.pay, p.res.coin);
          if (!chk.ok) return chk;
          close(pr);
          applyPay(p, pr.cost, null, a.pay, chk);
          pushFx(p, pr.then, pr.src);
          return yes();
        }
        case 'keep': {
          const keep = Array.isArray(a.keep) ? a.keep.map(String) : [];
          if (keep.some(uid => p.hand.indexOf(uid) < 0)) return no('That card is not in your hand.');
          close(pr);
          const toss = p.hand.filter(uid => keep.indexOf(uid) < 0);
          p.hand = p.hand.filter(uid => keep.indexOf(uid) >= 0);
          p.play = p.play.concat(toss);
          log({ t: 'keep', by: p.id, n: p.hand.length });
          return yes();
        }
      }
      return no('Nothing to answer.');
    }
    const done = pr => { close(pr); return yes(); };

    /* The turn: one main action, any number of free ones. */
    function turnAct(p, pr, a) {
      const main = !p.mainDone;
      const needMain = () => main ? null : no('You have already had your main action this turn.');
      let r;
      switch (a.t) {
        case 'end':
          if (!p.mainDone) return no('Take a main action first — or pass.');
          close(pr);
          push({ k: 'endTurn', seat: p.id });
          return yes();
        case 'pass':
          if ((r = needMain())) return r;
          close(pr);
          p.passed = true; p.mainDone = true;
          log({ t: 'pass', by: p.id });
          push({ k: 'again', seat: p.id });
          return yes();
        case 'dig': case 'discover':
          if ((r = needMain())) return r;
          r = doDig(p, pr, a, {}, true);
          if (r.ok) push({ k: 'again', seat: p.id });
          return r;
        case 'overcome': {
          if ((r = needMain())) return r;
          const s = g.sites[a.slot];
          if (!s) return no('No such site.');
          const chk = canOvercome(p, s);
          if (!chk.ok) return chk;
          const c = guardianCost(s.guardian);
          let use = null;
          if (c.useCard) {
            use = String(a.use || '');
            if (p.hand.indexOf(use) < 0) return no('Choose a card from your hand to put into play for it.');
          }
          const held = p.res.coin - (c.res.coin || 0);
          let w = walletOf(p);
          if (use) w = Object.assign({}, w, { hand: w.hand.filter(x => x !== use) });
          let pc = null;
          if (c.travel.length) {
            pc = checkPay(w, c.travel, null, a.pay || {}, held);
            if (!pc.ok) return pc;
          }
          close(pr);
          p.mainDone = true;
          if (use) useCard(p, use);
          if (pc) applyPay(p, c.travel, null, a.pay || {}, pc);
          spend(p, c.res);
          takeGuardian(p, s, 'paid');
          push({ k: 'again', seat: p.id });
          return yes();
        }
        case 'buy':
          if ((r = needMain())) return r;
          r = doBuy(p, pr, a, { type: 'any', disc: 0 }, true);
          if (r.ok) push({ k: 'again', seat: p.id });
          return r;
        case 'research': case 'temple':
          if ((r = needMain())) return r;
          r = doResearchAct(p, pr, a, {}, true);
          if (r.ok) push({ k: 'again', seat: p.id });
          return r;
        case 'play': {
          const uid = String(a.card || '');
          if (p.hand.indexOf(uid) < 0) return no('That card is not in your hand.');
          const chk = playCheck(p, uid);
          const c = D.card(uid);
          let free = !!c.free, opt = 0, pass = false;
          if (c.opts) {
            opt = a.opt | 0;
            const o = chk.opts && chk.opts[opt];
            if (!o || !o.ok) return no((o && o.why) || 'You cannot play that now.');
            free = o.free; pass = o.pass;
          } else if (!chk.ok) return no(chk.why || 'You cannot play that now.');
          close(pr);
          if (!free) p.mainDone = true;
          p.hand.splice(p.hand.indexOf(uid), 1);
          if (c.kind === 'art') p.res.tablet -= 1;
          if (c.exileSelf) { g.exiled.item.push(uid); } else p.play.push(uid);
          log({ t: 'play', by: p.id, card: uid, opt: c.opts ? opt : null });
          cardFx(p, uid, opt);
          push({ k: 'again', seat: p.id });
          return yes();
        }
        case 'assist': {
          const as = p.asst.find(x => x.id === a.id);
          if (!as) return no('That is not your assistant.');
          if (!as.ready) return no('That assistant has already worked this round.');
          const d = D.ASST[as.id];
          if (d.main && (r = needMain())) return r;
          const side = as.gold ? d.gold : d.silver;
          const first = side.fx[0];
          if (first.pay && !afford(p.res, first.pay)) return no('You cannot pay for it.');
          if (first.travelPay && !canCover(walletOf(p), first.travelPay, null, p.res.coin)) return no('You have no travel to pay with.');
          let fx = side.fx;
          if (first.choose) {
            const i = a.opt == null ? null : a.opt | 0;
            if (i != null) {
              const o = first.choose[i];
              if (!o) return no('No such choice.');
              if (o.pay && !afford(p.res, o.pay)) return no('You cannot pay for that.');
              fx = (o.pay ? [{ pay: o.pay, then: o.fx }] : o.fx).concat(side.fx.slice(1));
            } else if (!first.choose.some(o => !o.pay || afford(p.res, o.pay))) return no('You cannot pay for it.');
          }
          close(pr);
          as.ready = false;
          if (d.main) p.mainDone = true;
          log({ t: 'assist', by: p.id, asst: as.id, gold: as.gold });
          pushFx(p, fx, 'asst:' + as.id);
          push({ k: 'again', seat: p.id });
          return yes();
        }
        case 'idol': {
          if (!(p.idols > 0)) return no('You have no idol in your crates.');
          if (p.slots >= 4) return no('Your idol slots are full.');
          const o = D.IDOL_SLOT[a.opt | 0];
          if (!o) return no('No such choice.');
          if (o.pay && !afford(p.res, o.pay)) return no('You cannot pay for that.');
          close(pr);
          p.idols--; p.slots++;
          log({ t: 'idol', by: p.id, opt: o.id });
          if (o.pay) spend(p, o.pay);
          pushFx(p, o.fx, 'idol');
          push({ k: 'again', seat: p.id });
          return yes();
        }
        case 'boon': {
          const b = p.guardians.find(x => x.id === a.id);
          if (!b || b.used) return no('That boon is not yours to use.');
          const d = D.GUARD[b.id];
          if (!d.boon.fx) return no('That boon is travel: it pays when you send an archaeologist out.');
          close(pr);
          b.used = true;
          log({ t: 'boon', by: p.id, guardian: b.id });
          pushFx(p, d.boon.fx, 'boon:' + b.id);
          push({ k: 'again', seat: p.id });
          return yes();
        }
      }
      return no('That is not something you can do now.');
    }

    /* Sending an archaeologist out — by the main action, or by an effect. */
    function doDig(p, pr, a, o, isMain) {
      o = o || {};
      const s = g.sites[a.slot];
      if (!s) return no('No such site.');
      if (!atCamp(p)) return no('Both your archaeologists are already out.');
      if (o.levels && o.levels.indexOf(s.level) < 0) return no('Not that kind of site.');
      const disc = o.disc || null;
      if (s.tile) {
        if (a.t === 'discover') return no('That site is already discovered.');
        const k = a.space | 0;
        const sp = s.spaces[k];
        if (!sp || sp.who || sp.blocked) return no('That space is taken.');
        const cost = o.free ? [] : sp.cost;
        const chk = checkPay(walletOf(p), cost, disc, o.free ? {} : (a.pay || {}), p.res.coin);
        if (!chk.ok) return chk;
        close(pr);
        if (isMain) p.mainDone = true;
        applyPay(p, cost, disc, o.free ? {} : (a.pay || {}), chk);
        place(p, s, k);
        log({ t: 'dig', by: p.id, site: s.id, space: k });
        const fx = siteFx(s);
        if (o.twice) pushFx(p, fx, 'site:' + s.tile);
        pushFx(p, fx, 'site:' + s.tile);
        return yes();
      }
      if (o.free) return no('Only a camp site.');
      if (!g.siteDecks[s.level].length) return no('No site tiles left for that level.');
      const comp = Math.max(0, D.DISCOVER[s.level] - (o.comp || 0));
      if (p.res.compass < comp) return no('Discovering it costs ' + comp + ' compasses.');
      const cost = s.spaces[0].cost;
      const chk = checkPay(walletOf(p), cost, disc, a.pay || {}, p.res.coin);
      if (!chk.ok) return chk;
      close(pr);
      if (isMain) p.mainDone = true;
      p.res.compass -= comp;
      applyPay(p, cost, disc, a.pay || {}, chk);
      place(p, s, 0);
      /* The idol (or two) first; only the face-up one's gift counts. */
      const got = s.idols.splice(0);
      p.idols += got.length;
      s.tile = g.siteDecks[s.level].shift();
      log({ t: 'discover', by: p.id, site: s.id, tile: s.tile, idol: got[0], idols: got.length });
      if (got[0]) pushFx(p, D.REWARD[got[0]].fx, 'idol');
      pushFx(p, siteFx(s), 'site:' + s.tile);
      push({ k: 'guardian', slot: s.id });
      return yes();
    }

    function doResearchAct(p, pr, a, o, isMain) {
      o = o || {};
      const moves = researchMoves(p, o);
      const mv = a.t === 'temple'
        ? moves.find(m => m.t === 'temple' && m.stack === a.stack)
        : moves.find(m => m.t === 'research' && m.token === a.token && m.to === (a.to | 0));
      if (!mv) {
        if (a.token === 'book' && a.t !== 'temple') {
          const to = SQ[a.to | 0];
          if (to && to.row > SQ[p.glass].row) return no('Your notebook cannot go above your magnifying glass.');
        }
        return no('That is not a move you can make.');
      }
      if (!mv.ok) return no('You cannot pay for that.');
      close(pr);
      if (isMain) p.mainDone = true;
      doResearch(p, mv);
      return yes();
    }

    function doBuy(p, pr, a, o, isMain) {
      o = o || {};
      const uid = String(a.card || '');
      const inRow = rowCards(o.type || 'any').indexOf(uid) >= 0;
      const isPeek = g.peek && g.peek === uid && (o.type === 'any' || D.kindOf(uid) === o.type);
      if (!inRow && !isPeek) return no('That card is not on offer.');
      const price = priceOf(uid, o.disc || 0);
      if (p.res[price.res] < price.n) return no('You need ' + price.n + ' ' + D.RES_PLURAL[price.res] + '.');
      close(pr);
      if (isMain) p.mainDone = true;
      p.res[price.res] -= price.n;
      takeFromRow(uid);
      g.peek = null;
      log({ t: 'buy', by: p.id, card: uid, paid: price.n, res: price.res });
      receive(p, uid, 'bottom', !!a.use, a.opt);
      return yes();
    }

    function pickAct(p, pr, a) {
      if (a.t === 'skip' || a.pick == null) {
        if (!pr.skip) return no('You have to choose.');
        close(pr);
        /* Declining to put a card back still sends the others into play. */
        if (pr.what === 'earringBack') {
          for (const uid of pr.rest) p.play.push(uid);
          log({ t: 'earringRest', by: p.id, cards: pr.rest.slice() });
        }
        return yes();
      }
      const id = String(a.pick);
      const opt = pr.options.find(o => o.id === id);
      if (!opt) return no('That is not one of the choices.');
      switch (pr.what) {
        case 'exile':
          close(pr);
          if (!exileCard(p, id)) return no('That card is not yours to exile.');
          log({ t: 'exile', by: p.id, card: id });
          return yes();
        case 'upgrade':
          close(pr);
          if (id === 'ta' && p.res.tablet > 0) { p.res.tablet--; p.res.arrowhead++; }
          else if (id === 'aj' && p.res.arrowhead > 0) { p.res.arrowhead--; p.res.jewel++; }
          log({ t: 'upgrade', by: p.id, how: id });
          return yes();
        case 'refresh': {
          close(pr);
          const as = p.asst.find(x => x.id === id);
          if (as) as.ready = true;
          log({ t: 'refresh', by: p.id, ids: [id] });
          return yes();
        }
        case 'useCard':
          close(pr);
          useCard(p, id);
          pushFx(p, pr.then, pr.src);
          return yes();
        case 'tales': {
          close(pr);
          const tiles = g.research.bonus[pr.sq] || [];
          const i = tiles.indexOf(id);
          if (i >= 0) tiles.splice(i, 1);
          log({ t: 'bonus', by: p.id, bonus: id });
          push({ k: 'reward', seat: p.id, r: id });
          return yes();
        }
        case 'templeBonus': {
          close(pr);
          const i = g.research.templeBonus.indexOf(id);
          if (i >= 0) g.research.templeBonus.splice(i, 1);
          push({ k: 'reward', seat: p.id, r: id });
          return yes();
        }
        case 'gain': {
          close(pr);
          takeFromRow(id);
          log({ t: 'gain-card', by: p.id, card: id, to: pr.o.to });
          receive(p, id, pr.o.to, !!a.use, a.opt);
          return yes();
        }
        case 'overcome': {
          close(pr);
          takeGuardian(p, g.sites[id], 'free');
          return yes();
        }
        case 'activate': {
          const s = g.sites[id];
          const o = pr.o;
          close(pr);
          if (o.mine && s.level === 2 && o.l2pay) spend(p, o.l2pay);
          log({ t: 'activate', by: p.id, site: s.id });
          pushFx(p, siteFx(s), 'site:' + s.tile);
          /* Star Charts: the second site is chosen once the first has paid
             out, and it has to be a different one. */
          if ((pr.left || 1) > 1) push({ k: 'e', seat: p.id, s: { activate: Object.assign({}, o, { n: 1, not: (o.not || []).concat([id]) }) }, src: pr.src });
          return yes();
        }
        case 'relocate': {
          close(pr);
          const s = g.sites[opt.slot];
          const k = s.spaces.findIndex(sp => !sp.who && !sp.blocked);
          if (k < 0) return yes();
          lift(p, opt.arch);
          p.arch[opt.arch] = { site: s.id, space: k };
          s.spaces[k].who = p.id;
          log({ t: 'relocate', by: p.id, from: opt.from, site: s.id });
          pushFx(p, siteFx(s), 'site:' + s.tile);
          return yes();
        }
        case 'recall': {
          close(pr);
          lift(p, opt.arch);
          log({ t: 'recall', by: p.id, from: opt.from });
          return yes();
        }
        case 'crown': {
          close(pr);
          const from = g.sites[opt.from], to = g.sites[opt.slot];
          to.guardian = from.guardian; from.guardian = null;
          log({ t: 'crown', by: p.id, from: from.id, site: to.id, guardian: to.guardian });
          pushFx(p, siteFx(to), 'site:' + to.tile);
          return yes();
        }
        case 'supplyAsst': {
          close(pr);
          log({ t: 'borrow', by: p.id, asst: id, gold: !!pr.gold });
          pushFx(p, asstFx(id, pr.gold), 'asst:' + id);
          return yes();
        }
        case 'swapAsst': {
          close(pr);
          const mineA = p.asst.find(x => x.id === opt.give);
          const st = g.asst.stacks[opt.stack];
          if (!mineA || st[0] !== opt.asst) return no('That swap is no longer possible.');
          st.shift();
          st.unshift(mineA.id);
          const gold = mineA.gold;
          const at = p.asst.indexOf(mineA);
          p.asst[at] = { id: opt.asst, gold, ready: true };
          log({ t: 'swapAsst', by: p.id, gave: opt.give, got: opt.asst });
          return yes();
        }
        case 'earringN': {
          close(pr);
          const k = Math.min(+id, p.deck.length);
          const drawn = pr.o.from === 'bottom' ? p.deck.splice(p.deck.length - k, k).reverse() : p.deck.splice(0, k);
          g.drawN += drawn.length;
          log({ t: 'draw', by: p.id, n: drawn.length, bottom: pr.o.from === 'bottom', src: 'earring' });
          if (drawn.length === 1) { p.hand.push(drawn[0]); return yes(); }
          ask(p, 'pick', { what: 'earringKeep', why: 'Keep which one?', options: drawn.map(uid => ({ id: uid, card: uid })), drawn, o: pr.o, private: true });
          return yes();
        }
        case 'earringKeep': {
          close(pr);
          p.hand.push(id);
          const rest = pr.drawn.filter(x => x !== id);
          if (pr.o.back && rest.length) {
            ask(p, 'pick', { what: 'earringBack', why: 'Put one back on top of your deck?', options: rest.map(uid => ({ id: uid, card: uid })), rest, skip: true, private: true });
            return yes();
          }
          for (const uid of rest) p.play.push(uid);
          if (rest.length) log({ t: 'earringRest', by: p.id, cards: rest });
          return yes();
        }
        case 'earringBack': {
          close(pr);
          const rest = pr.rest.filter(x => x !== id);
          p.deck.unshift(id);
          for (const uid of rest) p.play.push(uid);
          if (rest.length) log({ t: 'earringRest', by: p.id, cards: rest });
          return yes();
        }
        case 'hammer': {
          close(pr);
          const i = g.exiled.item.indexOf(id);
          if (i >= 0) g.exiled.item.splice(i, 1);
          p.deck.push(id);
          log({ t: 'gain-card', by: p.id, card: id, to: 'bottom', from: 'exile' });
          return yes();
        }
        case 'choose': {
          close(pr);
          const c = pr.choose[+id];
          if (c.pay) {
            if (!afford(p.res, c.pay)) return yes();
            spend(p, c.pay);
          }
          pushFx(p, c.fx, pr.src);
          return yes();
        }
        case 'recruit':
          close(pr);
          recruit(p, id, false);
          return yes();
        case 'upAsst':
          close(pr);
          upgradeAsst(p, id);
          return yes();
        case 'rescue':
          close(pr);
          recruit(p, id, true);
          return yes();
      }
      return no('Nothing to choose.');
    }

    function multiAct(p, pr, a) {
      const picks = Array.isArray(a.picks) ? a.picks.map(String) : [];
      if (new Set(picks).size !== picks.length) return no('Two different ones.');
      if (picks.length < pr.min || picks.length > pr.max) return no('Choose ' + pr.min + '.');
      if (picks.some(x => !pr.options.find(o => o.id === x))) return no('That is not one of the choices.');
      close(pr);
      if (pr.what === 'choose2') {
        const fx = [];
        for (const x of picks) fx.push(x === 'exile' ? { exile: 1 } : { g: { [x]: 1 } });
        /* Gains first, so a card exiled cannot be the thing that paid. */
        fx.sort((u, v) => (u.exile ? 1 : 0) - (v.exile ? 1 : 0));
        pushFx(p, fx, pr.src);
      }
      return yes();
    }

    /* ================================================================
       Views
       ================================================================ */

    g.publicView = function () {
      return {
        v: VERSION, side: g.side, n: g.n, round: g.round, phase: g.phase, start: g.start, cur: g.cur,
        active: g.phase === 'play' && g.players[g.cur] ? g.players[g.cur].id : null,
        players: g.players.map(p => ({
          id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, i: p.i,
          res: Object.assign({}, p.res), idols: p.idols, slots: p.slots, idolsLost: p.idolsLost,
          guardians: p.guardians.map(x => ({ id: x.id, used: x.used })),
          asst: p.asst.map(a => ({ id: a.id, gold: a.gold, ready: a.ready })),
          glass: p.glass, book: p.book, temple: p.temple.slice(), arrival: p.arrival,
          fearTiles: p.fearTiles, handN: p.hand.length, deckN: p.deck.length, play: p.play.slice(),
          arch: p.arch.map(a => a ? { site: a.site, space: a.space } : null),
          passed: p.passed, mainDone: g.players[g.cur] === p ? p.mainDone : false,
          pool: g.players[g.cur] === p ? p.pool.slice() : [],
          mask: p.mask, ocarina: p.ocarina,
          score: score(p, g),
          fearN: ownedCards(p).filter(uid => D.kindOf(uid) === 'fear').length,
          cardsN: ownedCards(p).length
        })),
        row: { art: g.row.art.slice(), item: g.row.item.slice() },
        deckN: { art: g.decks.art.length, item: g.decks.item.length },
        peek: g.peek,
        exiled: { art: g.exiled.art.slice(), item: g.exiled.item.slice(), basic: g.exiled.basic.length },
        fearSupply: g.fearSupply.length, fearTiles: g.fearTiles,
        sites: Object.values(g.sites).map(s => ({
          id: s.id, level: s.level, row: s.row, col: s.col, tile: s.tile, guardian: s.guardian,
          spaces: s.spaces.map(sp => ({ cost: sp.cost.slice(), who: sp.who, blocked: sp.blocked })),
          /* A level II site's second idol lies face down. */
          idols: s.idols.map((t, i) => i === 0 ? t : null)
        })),
        siteDeckN: { 1: g.siteDecks[1].length, 2: g.siteDecks[2].length },
        guardDeckN: g.guardDeck.length,
        reveal: g.reveal,
        asst: {
          tops: tops(), counts: g.asst.stacks.map(st => st.length),
          rescueTop: g.asst.rescue[0] || null, rescueN: g.asst.rescue.length
        },
        research: {
          bonus: Object.fromEntries(Object.entries(g.research.bonus).map(([k, v]) => {
            const sq = SQ[+k];
            return [k, sq.pick ? v.slice() : v.slice(0, 1)];
          })),
          templeBonusN: g.research.templeBonus.length,
          stacks: Object.assign({}, g.research.stacks),
          arrivals: g.research.arrivals
        },
        prompts: g.prompts.map(pr => ({ n: pr.n, seat: pr.seat, t: pr.t, what: pr.what || null, why: pr.why || '' })),
        log: g.log.slice(-60),
        logN: g.log.length,
        result: g.result
      };
    };

    /* One seat's own half: its hand, what is in its deck (never the order),
       its open questions with every option, and what it could do. */
    g.seatView = function (id) {
      const p = P(id);
      if (!p) return null;
      const prompts = g.prompts.filter(pr => pr.seat === id).map(pr => {
        const out = clone(Object.assign({}, pr, { then: undefined, choose: undefined }));
        if (pr.t === 'dig') out.targets = digTargets(p, pr.o);
        if (pr.t === 'research') out.moves = researchMoves(p, pr.o);
        if (pr.t === 'buy') {
          const cands = rowCards(pr.o.type).concat(g.peek && (pr.o.type === 'any' || D.kindOf(g.peek) === pr.o.type) ? [g.peek] : []);
          out.cards = cands.map(uid => { const x = priceOf(uid, pr.o.disc); return { card: uid, res: x.res, cost: x.n, ok: p.res[x.res] >= x.n, peek: uid === g.peek }; });
        }
        return out;
      });
      const turn = g.prompts.find(pr => pr.seat === id && pr.t === 'turn');
      return {
        id, v: VERSION,
        hand: p.hand.slice(),
        deckList: p.deck.slice().sort(),
        wallet: walletOf(p),
        prompts,
        can: turn ? Object.assign({ n: turn.n }, turnCan(p)) : null,
        score: score(p, g)
      };
    };

    /* For the tests: every card instance is somewhere, exactly once. */
    g.census = function () {
      const seen = {};
      const note = (uid, where) => { (seen[uid] = seen[uid] || []).push(where); };
      for (const p of g.players) {
        for (const uid of p.deck) note(uid, p.id + ':deck');
        for (const uid of p.hand) note(uid, p.id + ':hand');
        for (const uid of p.play) note(uid, p.id + ':play');
      }
      for (const t of ['art', 'item']) {
        for (const uid of g.decks[t]) note(uid, 'deck:' + t);
        for (const uid of g.row[t]) if (uid) note(uid, 'row:' + t);
        for (const uid of g.exiled[t]) note(uid, 'exile:' + t);
      }
      for (const uid of g.exiled.basic) note(uid, 'exile:basic');
      for (const uid of g.fearSupply) note(uid, 'fear');
      for (const pr of g.prompts) for (const uid of (pr.drawn && pr.what === 'earringKeep' ? pr.drawn : []).concat(pr.rest && pr.what === 'earringBack' ? pr.rest : [])) note(uid, 'limbo');
      return seen;
    };
    g.score = p => score(p, g);
  }

  const Engine = {
    VERSION, LEVELS, create, score, plan, checkPay, suggestPay, canCover, walletOf, sourcesOf,
    afford, minus, addTo, costValue, isEmpty, cardTravel, boonTravel, asstTravel, rngFrom, shuffle
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.ArnakEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
