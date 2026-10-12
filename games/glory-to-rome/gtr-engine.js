'use strict';
/* Glory to Rome — the rules. No DOM, no timers, one seeded rng.
 *
 * The display (or the solo host) holds the one Game; every order — from a
 * phone, a house player or a test — goes through `g.act(seatId, answer)`,
 * which refuses with a reason rather than a bare false.
 *
 * **The game is one generator** (the Radlands pattern, LESSONS-CHECKLIST B).
 * `main()` deals and then plays turn after turn; a turn, an action and every
 * building's power are generators too, and every question is a `yield`. The
 * driver (`advance`) runs until the generator asks something (`{ask}`) or
 * wants the telly to show something first (`{hold}`); an answer resumes it.
 *
 *   g.prompts   the question open right now (only ever one: Glory to Rome is
 *               played strictly around the table)
 *   g.hold      decide, hold, show, then apply: a lead, a legionary's demand,
 *               a building finished. Only when a screen is showing the game
 *               (`opts.show`); a test proves seeded games end identically with
 *               it on and off.
 *
 * Generators cannot be copied, so undo is by replay of the answers.
 *
 * **What is secret** (the rulebook): each hand; the deck's order; what is in
 * each Vault (its size is public; you know what you put in, except an Atrium
 * card, which nobody sees until the end); the top of the deck a Fountain
 * turns over until it is used. Everything else is on the table: the Pool,
 * Sites, every Clientele, Stockpile and building, the cards led and followed.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gtr-data.js') : root.GtrData;

  const VERSION = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const OVER = { over: true };

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
  /* A card id is "<kind>.<copy>": school.2, jack.5. */
  const K = id => String(id).split('.')[0];
  const isJack = id => K(id) === 'jack';
  const matOf = id => D.matOf(K(id));
  const roleOf = id => D.roleOf(K(id));
  const valOf = id => (D.card(K(id)) ? D.card(K(id)).value : 0);

  /* ================================================================
     Building a game
     ================================================================ */
  function create(opts) {
    opts = opts || {};
    const list = opts.players || [];
    if (list.length < 2 || list.length > 5) throw new Error('Glory to Rome is for 2 to 5 players');
    const seed = opts.seed == null ? Date.now() : opts.seed;
    const version = opts.version === 'imp' ? 'imp' : 'rep';
    const g = {
      VERSION, seed, rng: rngFrom(seed), rngN: 0, drawN: 0,
      version, geek: !!opts.geek, pet: D.SETS[version].petition,
      opts: { show: !!opts.show },
      phase: 'setup', turnN: 0, leader: null, tt: null,
      deck: [], pool: [], jacks: [], sites: {}, limbo: [],
      log: [], prompts: [], pn: 0, hold: null, holdN: 0, actN: 0, uidN: 0,
      result: null
    };
    g.players = list.map((x, i) => ({
      id: x.id, name: x.name, hex: x.hex || '#c9a84c', bot: !!x.bot, i,
      level: x.bot ? (LEVELS.indexOf(x.level) >= 0 ? x.level : 'medium') : null,
      hand: [], clients: [], stock: [], vault: [], builds: [], inf: []
    }));
    attach(g);
    g.gen = g.main();
    g.advance();
    return g;
  }

  function attach(g) {
    const P = id => g.players.find(p => p.id === id) || null;
    const N = () => g.players.length;
    const after = (p, k) => g.players[(p.i + (k == null ? 1 : k)) % N()];
    const rand = () => { g.rngN++; return g.rng(); };
    const log = e => { g.log.push(Object.assign({ tn: g.turnN }, e)); return e; };
    const uid = pre => pre + (++g.uidN);

    g.seat = P;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.note = e => log(e);

    /* ---------------- standing powers ---------------- */
    const kindOfB = b => K(b.card);
    function gateOn(p) {
      if (p.builds.some(b => b.done && kindOfB(b) === 'gate')) return true;
      return g.players.some(q => q.builds.some(b => b.done && b.pub && kindOfB(b) === 'gate'));
    }
    /* A power is yours from a finished building, a Marble foundation with a
       Gate, or anybody's building a Stairway has made public. */
    function has(p, k) {
      const marble = D.matOf(k) === 'marble';
      for (const b of p.builds) {
        if (kindOfB(b) !== k) continue;
        if (b.done) return true;
        if (marble && gateOn(p)) return true;
      }
      return g.players.some(q => q.builds.some(b => b.done && b.pub && kindOfB(b) === k));
    }
    const infOf = p => 2 + p.inf.reduce((s, m) => s + D.MAT[m].value, 0);
    const infFor = p => has(p, 'aerarium') ? Math.max.apply(null, g.players.map(infOf)) : infOf(p);
    const handSize = p => 5 + (has(p, 'shrine') ? 2 : 0) + (has(p, 'temple') ? 4 : 0);
    const clientRoom = p => (infFor(p) + (has(p, 'insula') ? 2 : 0)) * (has(p, 'aqueduct') ? 2 : 1);
    const vaultRoom = p => infFor(p) + (has(p, 'market') ? 2 : 0);
    const clientsLeft = p => Math.max(0, clientRoom(p) - p.clients.length);
    const vaultLeft = p => Math.max(0, vaultRoom(p) - p.vault.length);
    /* How many of your clients answer when this role is played. */
    function clientsFor(p, role) {
      if (role === 'laborer' && has(p, 'storeroom')) return p.clients.length;
      const ludus = has(p, 'ludusmagnus');
      return p.clients.filter(c => roleOf(c) === role || (ludus && roleOf(c) === 'merchant')).length;
    }
    const inTownLeft = () => D.MATS.reduce((s, m) => s + g.sites[m].in, 0);
    const victimsOf = (p, bridge) => {
      const others = g.players.filter(q => q !== p);
      if (bridge || N() <= 3) return others;
      const l = after(p, 1), r = after(p, N() - 1);
      return l === r ? [l] : [l, r];
    };
    const ownBuildKinds = p => p.builds.map(kindOfB);

    /* ---------------- the deck ---------------- */
    /* The top of the deck is the END of the array. The deck running out ends
       the game the moment the last card is drawn. */
    function drawTop(why) {
      if (!g.deck.length) return null;
      g.drawN++;
      return g.deck.pop();
    }
    function deckOutCheck() { if (!g.deck.length) finish(null, 'deck'); }
    function drawTo(p, k, why) {
      const got = [];
      for (let j = 0; j < k && g.deck.length; j++) { const c = drawTop(why); p.hand.push(c); got.push(c); }
      if (got.length) log({ t: 'draw', by: p.id, n: got.length, why: why || null });
      deckOutCheck();
      return got;
    }
    function takeJack(p, why) {
      if (!g.jacks.length) return false;
      p.hand.push(g.jacks.pop());
      log({ t: 'jack', by: p.id, why: why || null });
      return true;
    }
    function toPool(cards) { for (const c of cards) { if (isJack(c)) g.jacks.push(c); else g.pool.push(c); } }
    const removeFrom = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); return i >= 0; };

    /* ================================================================
       Asking
       ================================================================ */
    function* ask(p, pr) {
      pr = Object.assign({}, pr, { n: ++g.pn, seat: p.id });
      return yield { ask: [pr] };
    }
    /* A pick. A question with one legal answer answers itself; with none it
       is not asked. `multi` takes ids (min..max). */
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
    function* yesNo(p, what, why, yesLab, noLab, pub) {
      const a = yield* pick(p, what, why, [{ id: 'yes', label: yesLab }, { id: 'no', label: noLab }], { always: true, pub });
      return a === 'yes';
    }
    function* hold(h) { yield { hold: h }; }

    /* ================================================================
       The end
       ================================================================ */
    function score(p) {
      const vault = p.vault.reduce((s, v) => s + valOf(v.id), 0);
      const statue = p.builds.some(b => b.done && kindOfB(b) === 'statue') ? 3 : 0;
      const wall = p.builds.some(b => b.done && kindOfB(b) === 'wall') || g.players.some(q => q.builds.some(b => b.done && b.pub && kindOfB(b) === 'wall')) ? Math.floor(p.stock.length / 2) : 0;
      return { inf: infOf(p), vault, statue, wall };
    }
    function bonuses() {
      const out = {};
      for (const m of D.MATS) {
        let best = 0, who = [];
        for (const p of g.players) {
          const n = p.vault.filter(v => matOf(v.id) === m).length;
          if (n > best) { best = n; who = [p.id]; } else if (n === best && n > 0) who.push(p.id);
        }
        out[m] = who.length === 1 ? who[0] : null;
      }
      return out;
    }
    function finish(winner, how) {
      g.phase = 'over';
      g.prompts = []; g.hold = null;
      const bon = bonuses();
      const rows = g.players.map(p => {
        const s = score(p);
        const bonus = D.MATS.filter(m => bon[m] === p.id);
        const total = s.inf + s.vault + 3 * bonus.length + s.statue + s.wall;
        return { id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, inf: s.inf, vault: s.vault, bonus: bonus.length, bonusMats: bonus,
          extra: s.statue + s.wall, statue: s.statue, wall: s.wall, total, hand: p.hand.length, vaultN: p.vault.length,
          vaultCards: p.vault.map(v => K(v.id)), builds: p.builds.filter(b => b.done).map(b => K(b.card)) };
      });
      let won = [];
      if (winner) won = [winner];
      else {
        const top = Math.max.apply(null, rows.map(r => r.total));
        let tied = rows.filter(r => r.total === top);
        if (tied.length > 1) { const h = Math.max.apply(null, tied.map(r => r.hand)); tied = tied.filter(r => r.hand === h); }
        won = tied.map(r => r.id);
      }
      /* Places: the winners first, then by total, the hand breaking ties. */
      rows.forEach(r => { r.won = won.indexOf(r.id) >= 0; });
      const better = (x, r) => (x.won && !r.won) || (x.won === r.won && (x.total > r.total || (x.total === r.total && x.hand > r.hand)));
      rows.forEach(r => { r.place = 1 + rows.filter(x => x !== r && better(x, r)).length; });
      const w = won.length ? P(won[0]) : null;
      g.result = { winner: won.length === 1 ? won[0] : null, winners: won, name: w ? w.name : null, how, rows, turnN: g.turnN, bonus: bon,
        tie: !winner && won.length > 1, tiebreak: !winner && rows.filter(r => r.total === Math.max.apply(null, rows.map(x => x.total))).length > 1 };
      log({ t: 'over', how, by: winner || null });
      throw OVER;
    }
    /* The Forums and the Plebeian Council win the moment their condition holds. */
    function forumRoles(p, needMats) {
      /* Can the clients cover all six roles, each client filling one? */
      const lud = has(p, 'ludusmagnus'), store = has(p, 'storeroom');
      const opts = p.clients.map(c => {
        const r = roleOf(c), s = new Set([r]);
        if (lud && r === 'merchant') D.ROLES.forEach(x => s.add(x));
        if (store) s.add('laborer');
        return s;
      });
      const used = new Array(opts.length).fill(false);
      const fill = k => {
        if (k === D.ROLES.length) return true;
        const role = D.ROLES[k];
        for (let i = 0; i < opts.length; i++) if (!used[i] && opts[i].has(role)) { used[i] = true; if (fill(k + 1)) return true; used[i] = false; }
        return false;
      };
      if (!fill(0)) return false;
      if (needMats) return D.MATS.every(m => p.stock.some(c => matOf(c) === m));
      return true;
    }
    function laborers(p) { return has(p, 'storeroom') ? p.clients.length : p.clients.filter(c => roleOf(c) === 'laborer').length + (has(p, 'ludusmagnus') ? p.clients.filter(c => roleOf(c) === 'merchant').length : 0); }
    function legionaries(p) { return p.clients.filter(c => roleOf(c) === 'legionary').length + (has(p, 'ludusmagnus') ? p.clients.filter(c => roleOf(c) === 'merchant').length : 0); }
    function checkWins(first) {
      const order = first ? [first].concat(g.players.filter(q => q !== first)) : g.players;
      for (const p of order) {
        if (has(p, 'forumromanum') && forumRoles(p, true)) finish(p.id, 'forumromanum');
        if (has(p, 'forum') && forumRoles(p, false)) finish(p.id, 'forum');
        if (has(p, 'plebeiancouncil')) {
          const mine = laborers(p);
          const lab = g.players.reduce((s, q) => s + laborers(q), 0), leg = g.players.reduce((s, q) => s + legionaries(q), 0);
          if (mine > 0 && g.players.every(q => q === p || laborers(q) < mine) && lab > leg) finish(p.id, 'plebeiancouncil');
        }
      }
    }

    /* ================================================================
       Leading and following
       ================================================================ */
    /* How many actions a set of cards played as `role` is worth, or why not.
       Jacks and cards of the role count one each; other cards only in
       petitions of `pet` (2 Republic, 3 Imperium, 2 with a Circus). Without a
       Palace exactly one unit may be played. */
    function petOf(p) { return g.version === 'imp' && has(p, 'circus') ? 2 : g.pet; }
    function playCheck(p, cards, role) {
      if (!Array.isArray(cards) || !cards.length) return no('Choose the cards to play.');
      if (new Set(cards).size !== cards.length) return no('Each card once.');
      for (const c of cards) if (p.hand.indexOf(c) < 0) return no('That card is not in your hand.');
      return D.units(cards.map(K), role, { pet: petOf(p), palace: has(p, 'palace'), crane: has(p, 'crane') });
    }
    /* The simple ways to play each role from this hand, for the phone's
       quick buttons and the house: a card of the role, a Jack, a petition, and
       with a Palace everything at once. */
    function playsFor(p, onlyRole) {
      const out = [];
      const hand = p.hand.slice();
      const jacks = hand.filter(isJack);
      const pet = petOf(p);
      const crane = has(p, 'crane');
      const palace = has(p, 'palace');
      for (const role of onlyRole ? [onlyRole] : D.ROLES) {
        const match = hand.filter(c => !isJack(c) && (roleOf(c) === role || (crane && role === 'architect')));
        const seen = {};
        for (const c of match) { if (seen[K(c)]) continue; seen[K(c)] = 1; out.push({ role, cards: [c], units: 1, how: 'card' }); }
        if (jacks.length) out.push({ role, cards: [jacks[0]], units: 1, how: 'jack' });
        const byRole = {};
        hand.forEach(c => { if (!isJack(c) && match.indexOf(c) < 0) (byRole[roleOf(c)] = byRole[roleOf(c)] || []).push(c); });
        for (const r of Object.keys(byRole)) {
          const list = byRole[r].slice().sort();
          if (list.length >= pet) out.push({ role, cards: list.slice(0, pet), units: 1, how: 'petition', from: r });
        }
        if (palace) {
          let all = match.concat(jacks);
          let units = all.length;
          for (const r of Object.keys(byRole)) { const k = Math.floor(byRole[r].length / pet); if (k) { all = all.concat(byRole[r].slice(0, k * pet)); units += k; } }
          if (units > 1) out.push({ role, cards: all, units, how: 'palace' });
        }
      }
      return out;
    }
    function playCards(p, cards, role, how) {
      const r = playCheck(p, cards, role);
      for (const c of cards) removeFrom(p.hand, c);
      g.tt.plays[p.id] = { cards: cards.slice(), units: r.ok ? r.units : 1, how };
      log({ t: how, by: p.id, role, cards: cards.map(K), units: r.ok ? r.units : 1 });
    }

    /* ================================================================
       Thinking
       ================================================================ */
    function thinkMenu(p, handN) {
      const size = handSize(p);
      const n = handN == null ? p.hand.length : handN;
      return {
        size, hand: n,
        refill: n < size && g.deck.length ? Math.min(size - n, g.deck.length) : 0,
        one: n >= size && g.deck.length > 0,
        jack: g.jacks.length > 0,
        latrine: has(p, 'latrine') && p.hand.length > 0,
        vomit: has(p, 'vomitorium') && p.hand.length > 0,
        tribunal: g.version === 'rep' && has(p, 'tribunal')
      };
    }
    function thinkCheck(p, a) {
      const m0 = thinkMenu(p);
      let n = p.hand.length;
      if (a.dropAll) { if (!m0.vomit) return no('Only a Vomitorium lets you throw your hand away.'); n = 0; }
      else if (a.drop) {
        if (!m0.latrine) return no('Only a Latrine lets you throw a card away first.');
        if (p.hand.indexOf(a.drop) < 0) return no('That card is not in your hand.');
        n--;
      }
      const m = thinkMenu(p, n);
      if (a.how === 'refill') return m.refill ? yes() : no(n >= m.size ? 'Your hand is already full: draw one card instead.' : 'The deck is empty.');
      if (a.how === 'one') return m.one ? yes() : no('Below your hand size you must draw up to it.');
      if (a.how === 'jack') return m.jack ? yes() : no('There are no Jacks left.');
      return no('Draw cards or take a Jack.');
    }
    function* doThink(p, a, why) {
      if (a.dropAll) {
        const cards = p.hand.slice();
        p.hand = [];
        toPool(cards);
        log({ t: 'vomit', by: p.id, cards: cards.filter(c => !isJack(c)).map(K), jacks: cards.filter(isJack).length });
      } else if (a.drop) {
        removeFrom(p.hand, a.drop);
        toPool([a.drop]);
        log({ t: 'latrine', by: p.id, card: isJack(a.drop) ? 'jack' : K(a.drop) });
      }
      if (a.how === 'jack') takeJack(p, why || 'think');
      else if (a.how === 'one') drawTo(p, 1, why || 'think');
      else drawTo(p, handSize(p) - p.hand.length, why || 'think');
      if (thinkMenu(p).tribunal && g.jacks.length) takeJack(p, 'tribunal');
    }
    /* An optional Think (School, Academy, Castra): ask, or skip. */
    function* offerThink(p, why, pub, optional) {
      const a = yield* ask(p, { t: 'think', why, pub, optional: !!optional, menu: thinkMenu(p) });
      if (a.t === 'skip') return false;
      yield* doThink(p, a, a.why);
      return true;
    }

    /* ================================================================
       Buildings
       ================================================================ */
    const needOf = b => D.MAT[b.site].value;
    function accepts(p, b, m) {
      if (b.done) return false;
      const k = kindOfB(b);
      if (m === b.site) return true;
      if (k === 'statue' && m === 'marble') return true;
      if (D.matOf(k) === 'stone' && has(p, 'road')) return true;
      if (m === 'rubble' && has(p, 'tower')) return true;
      if (m === 'marble' && has(p, 'scriptorium')) return true;
      return false;
    }
    function canLay(p, c) {
      if (isJack(c)) return false;
      return ownBuildKinds(p).indexOf(K(c)) < 0;
    }
    /* Where a card may be laid: [{site, ot}] */
    function laySites(p, c, left) {
      if (!canLay(p, c)) return [];
      const out = [];
      const mats = K(c) === 'statue' ? D.MATS : [matOf(c)];
      const otCost = has(p, 'tower') ? 1 : 2;
      for (const m of mats) {
        if (g.sites[m].in > 0) out.push({ site: m, ot: false, cost: 1 });
        if (g.sites[m].out > 0 && left >= otCost) out.push({ site: m, ot: true, cost: otCost });
      }
      return out;
    }
    function* lay(p, c, site, ot, how) {
      const b = { uid: uid('b'), card: c, site, ot: !!ot, mats: [], done: false, pub: false };
      if (ot) g.sites[site].out--; else g.sites[site].in--;
      p.builds.push(b);
      log({ t: 'lay', by: p.id, card: K(c), site, ot: !!ot, how: how || null });
      if (!ot && inTownLeft() === 0) finish(null, 'sites');
      return b;
    }
    /* Put a material into a building; finish it if that completes it. */
    function* addTo(p, b, c, from, viaArch) {
      b.mats.push(c);
      const m = matOf(c);
      log({ t: 'fill', by: p.id, card: K(b.card), mat: m, from, have: b.mats.length, need: needOf(b) });
      const k = kindOfB(b);
      const done = b.mats.length >= needOf(b) || (m === 'marble' && has(p, 'scriptorium')) || (k === 'villa' && viaArch);
      if (done) {
        yield* complete(p, b);
        if (viaArch && has(p, 'solarium') && b.mats.length) {
          const opts = uniqBy(b.mats, matOf).map(x => ({ id: x, label: D.MAT[matOf(x)].name, mat: matOf(x) }));
          const id = yield* pick(p, 'solarium', 'Solarium: move one material from your ' + D.nameOf(k) + ' into your Stockpile?', opts, { skip: 'Leave them', pub: 'deciding about the Solarium' });
          if (id) { removeFrom(b.mats, id); p.stock.push(id); log({ t: 'solarium', by: p.id, mat: matOf(id), card: k }); }
        }
      }
    }
    function uniqBy(list, f) { const seen = {}; return list.filter(x => { const k = f(x); if (seen[k]) return false; seen[k] = 1; return true; }); }
    function* complete(p, b) {
      b.done = true;
      p.inf.push(b.site);
      const k = kindOfB(b);
      log({ t: 'done', by: p.id, card: k, site: b.site, inf: infOf(p) });
      yield* hold({ k: 'done', by: p.id, card: k, site: b.site, inf: infOf(p) });
      yield* onDone(p, k, b);
      checkWins(p);
    }
    /* "Upon completion" powers. */
    function* onDone(p, k, b) {
      const n = infFor(p);
      if (k === 'catacomb') { log({ t: 'catacomb', by: p.id }); finish(null, 'catacomb'); }
      if (k === 'foundry') yield* actions(p, 'laborer', n, { via: 'foundry', label: 'Foundry' });
      if (k === 'amphitheatre') yield* actions(p, 'craftsman', n, { via: 'amphitheatre', label: 'Amphitheatre' });
      if (k === 'garden') yield* actions(p, 'patron', n, { via: 'garden', label: 'Garden' });
      if (k === 'school') {
        for (let j = 0; j < n; j++) {
          const did = yield* offerThink(p, 'School: Think ' + (n - j) + ' more time' + (n - j > 1 ? 's' : '') + '?', 'thinking for the School', true);
          if (!did) break;
        }
      }
      if (k === 'domus') yield* actions(p, 'patron', 1, { via: 'domus', label: 'Domus', domus: true });
      if (k === 'prison') yield* prison(p, b);
      if (k === 'castrapraetoria' && b && b.mats.length) {
        const room = clientsLeft(p);
        if (room) {
          const ids = yield* pick(p, 'praetoria', 'Castra Praetoria: which of its materials join your Clientele?', b.mats.map(x => ({ id: x, label: D.MAT[matOf(x)].name + ' — a ' + D.ROLE[roleOf(x)].name })),
            { multi: true, min: 0, max: room, pub: 'deciding about the Castra Praetoria', always: true });
          for (const x of ids) { removeFrom(b.mats, x); p.clients.push(x); log({ t: 'client', by: p.id, card: K(x), from: 'building' }); }
        }
      }
      if (k === 'aerarium') {
        const list = p.builds.filter(x => x.done && x !== b && D.card(kindOfB(x)).when === 'done' && kindOfB(x) !== 'catacomb');
        const id = yield* pick(p, 'aerarium', 'Aerarium: run one of your buildings’ “when finished” powers again?', list.map(x => ({ id: x.uid, label: D.nameOf(kindOfB(x)), card: kindOfB(x) })), { skip: 'Not now', pub: 'deciding about the Aerarium' });
        if (id) { const x = list.find(y => y.uid === id); log({ t: 'aerarium', by: p.id, card: kindOfB(x) }); yield* onDone(p, kindOfB(x), x); }
      }
      if (k === 'bacchanalia') yield* bacchanalia(p);
    }
    function* prison(p, b) {
      const cands = [];
      g.players.forEach(q => { if (q !== p) q.builds.forEach(x => { if (x.done && ownBuildKinds(p).indexOf(kindOfB(x)) < 0) cands.push({ q, x }); }); });
      if (!cands.length) return;
      const id = yield* pick(p, 'prison', 'Prison: give up its site (3 influence) for another player’s building?', cands.map(c => ({ id: c.x.uid, label: c.q.name + '’s ' + D.nameOf(kindOfB(c.x)), card: kindOfB(c.x), sub: D.card(kindOfB(c.x)).text })),
        { skip: 'Keep the influence', pub: 'deciding whom to rob with the Prison' });
      if (!id) return;
      const c = cands.find(y => y.x.uid === id);
      removeFrom(c.q.builds, c.x);
      p.builds.push(c.x);
      const i = p.inf.lastIndexOf('stone');
      if (i >= 0) { p.inf.splice(i, 1); c.q.inf.push('stone'); }
      log({ t: 'prison', by: p.id, of: c.q.id, card: kindOfB(c.x) });
      yield* onDone(p, kindOfB(c.x), c.x);
    }
    function* bacchanalia(p) {
      const n = infFor(p);
      if (n > g.deck.length) { log({ t: 'bacchanalia', by: p.id, n, short: true }); finish(null, 'deck'); }
      const shown = [];
      for (let j = 0; j < n; j++) shown.push(drawTop('bacchanalia'));
      g.limbo.push.apply(g.limbo, shown);
      log({ t: 'reveal', by: p.id, cards: shown.map(K), why: 'bacchanalia' });
      const take = id => { removeFrom(g.limbo, id); removeFrom(shown, id); };
      const left = () => shown.slice();
      const slots = ['vault', 'stock', 'client', 'found', 'mat'];
      const LAB = { vault: 'your Vault', stock: 'your Stockpile', client: 'your Clientele', found: 'a new foundation (in town)', mat: 'an unfinished building' };
      for (const s of slots) {
        const cands = [];
        for (const c of left()) {
          if (s === 'vault' && vaultLeft(p)) cands.push({ id: c, label: D.nameOf(K(c)), card: K(c) });
          if (s === 'stock') cands.push({ id: c, label: D.nameOf(K(c)) + ' as ' + D.MAT[matOf(c)].name, card: K(c) });
          if (s === 'client' && clientsLeft(p)) cands.push({ id: c, label: D.nameOf(K(c)) + ' as a ' + D.ROLE[roleOf(c)].name, card: K(c) });
          if (s === 'found' && canLay(p, c) && (K(c) === 'statue' ? D.MATS.some(m => g.sites[m].in) : g.sites[matOf(c)].in > 0)) cands.push({ id: c, label: D.nameOf(K(c)), card: K(c) });
          if (s === 'mat') p.builds.filter(b => accepts(p, b, matOf(c))).forEach(b => cands.push({ id: c + '>' + b.uid, label: D.MAT[matOf(c)].name + ' into your ' + D.nameOf(kindOfB(b)), card: K(c) }));
        }
        if (!cands.length) continue;
        const id = yield* pick(p, 'bacchanalia', 'Bacchanalia: one card into ' + LAB[s] + '?', cands, { skip: 'None', pub: 'sharing out the Bacchanalia' });
        if (!id) continue;
        const [c, bu] = id.split('>');
        take(c);
        if (s === 'vault') { p.vault.push({ id: c, seen: true }); log({ t: 'vault', by: p.id, mat: matOf(c), from: 'bacchanalia' }); }
        if (s === 'stock') { p.stock.push(c); log({ t: 'take', by: p.id, mat: matOf(c), from: 'bacchanalia' }); }
        if (s === 'client') { p.clients.push(c); log({ t: 'client', by: p.id, card: K(c), from: 'bacchanalia' }); }
        if (s === 'found') {
          const sites = laySites(p, c, 1).filter(x => !x.ot);
          const site = sites.length === 1 ? sites[0].site : (yield* pick(p, 'site', 'Which site for the Statue?', sites.map(x => ({ id: x.site, label: D.MAT[x.site].name + ' site' })), { pub: 'choosing a site' }));
          yield* lay(p, c, site, false, 'bacchanalia');
        }
        if (s === 'mat') { const b = p.builds.find(x => x.uid === bu); yield* addTo(p, b, c, 'bacchanalia', false); }
      }
      if (shown.length) { for (const c of shown) { removeFrom(g.limbo, c); p.hand.push(c); } log({ t: 'draw', by: p.id, n: shown.length, why: 'bacchanalia' }); }
      deckOutCheck();
    }

    /* ================================================================
       Actions
       ================================================================ */
    /* Every option open to one action of a role, worked out from the state
       now. The phone shows them, the house scores them, and the answer is
       checked against them again when it arrives. */
    function actOptions(p, role, left, ctx) {
      ctx = ctx || {};
      const out = [];
      const hand = p.hand.filter(c => !isJack(c));
      const byKind = list => uniqBy(list, K);
      const byMat = list => uniqBy(list, matOf);
      if (role === 'laborer') {
        for (const c of byMat(g.pool)) out.push({ id: 'pool:' + c, kind: 'take', from: 'pool', card: c, mat: matOf(c), label: 'Take ' + D.MAT[matOf(c)].name + ' from the Pool' });
        if (has(p, 'dock')) for (const c of byKind(hand)) out.push({ id: 'hand:' + c, kind: 'take', from: 'hand', card: c, mat: matOf(c), label: 'Dock: ' + D.nameOf(K(c)) + ' from your hand as ' + D.MAT[matOf(c)].name });
      }
      if (role === 'patron' && clientsLeft(p)) {
        for (const c of byMat(g.pool)) out.push({ id: 'pool:' + c, kind: 'client', from: 'pool', card: c, role: roleOf(c), label: 'Hire a ' + D.ROLE[roleOf(c)].name + ' from the Pool' });
        if (has(p, 'bar') && g.deck.length) out.push({ id: 'deck', kind: 'client', from: 'deck', label: 'Bar: hire the top card of the deck' });
        if (has(p, 'aqueduct')) for (const c of byMat(hand)) out.push({ id: 'hand:' + c, kind: 'client', from: 'hand', card: c, role: roleOf(c), label: 'Aqueduct: hire a ' + D.ROLE[roleOf(c)].name + ' from your hand' });
      }
      if (role === 'merchant' && vaultLeft(p)) {
        for (const c of byMat(p.stock)) out.push({ id: 'stock:' + c, kind: 'vault', from: 'stock', card: c, mat: matOf(c), label: 'Vault ' + D.MAT[matOf(c)].name + ' from your Stockpile' });
        if (has(p, 'atrium') && g.deck.length) out.push({ id: 'deck', kind: 'vault', from: 'deck', label: 'Atrium: vault the top card of the deck, unseen' });
        if (has(p, 'basilica')) for (const c of byKind(hand)) out.push({ id: 'hand:' + c, kind: 'vault', from: 'hand', card: c, mat: matOf(c), label: 'Basilica: vault ' + D.nameOf(K(c)) + ' from your hand' });
      }
      if (role === 'craftsman' || role === 'architect') {
        for (const c of byKind(hand)) for (const s of laySites(p, c, left)) {
          out.push({ id: 'lay:' + c + ':' + s.site + ':' + (s.ot ? 1 : 0), kind: 'lay', from: 'hand', card: c, site: s.site, ot: s.ot, cost: s.cost,
            label: 'Lay ' + D.nameOf(K(c)) + (K(c) === 'statue' ? ' on a ' + D.MAT[s.site].name + ' site' : '') + (s.ot ? ' out of town' + (s.cost > 1 ? ' (uses 2 actions)' : '') : '') });
        }
        const src = role === 'craftsman' ? hand : p.stock;
        const from = role === 'craftsman' ? 'hand' : 'stock';
        for (const b of p.builds) {
          if (b.done) continue;
          for (const c of byMat(src)) if (accepts(p, b, matOf(c))) out.push({ id: 'fill:' + c + ':' + b.uid, kind: 'fill', from, card: c, mat: matOf(c), b: b.uid, bk: kindOfB(b),
            label: D.MAT[matOf(c)].name + ' into your ' + D.nameOf(kindOfB(b)) + (from === 'hand' ? ' (from hand)' : '') });
          if (role === 'architect' && has(p, 'archway')) for (const c of byMat(g.pool)) if (accepts(p, b, matOf(c))) out.push({ id: 'fillpool:' + c + ':' + b.uid, kind: 'fill', from: 'pool', card: c, mat: matOf(c), b: b.uid, bk: kindOfB(b),
            label: 'Archway: ' + D.MAT[matOf(c)].name + ' from the Pool into your ' + D.nameOf(kindOfB(b)) });
        }
        if (role === 'craftsman' && has(p, 'fountain') && g.deck.length) out.push({ id: 'deck', kind: 'fountain', from: 'deck', label: 'Fountain: use the top card of the deck' });
        if (role === 'craftsman' && has(p, 'watchpost')) for (const b of p.builds) if (b.done) out.push({ id: 'tear:' + b.uid, kind: 'tear', b: b.uid, bk: kindOfB(b), label: 'Watch Post: pull down your ' + D.nameOf(kindOfB(b)) });
      }
      out.push({ id: 'stop', kind: 'stop', label: left > 1 ? 'Stop here (' + left + ' actions left)' : 'Do nothing with it' });
      return out;
    }
    function legalOpt(p, role, left, id, ctx) { return actOptions(p, role, left, ctx).find(o => o.id === id) || null; }

    /* Run `n` actions of a role for p. ctx.via says why (lead, follow, client,
       a building), ctx.played says whether p led or followed. */
    function* actions(p, role, n, ctx) {
      ctx = ctx || {};
      if (n <= 0) return;
      if (role === 'legionary') { yield* legionary(p, n, ctx); return; }
      if (role === 'thinker') {
        for (let j = 0; j < n; j++) { const did = yield* offerThink(p, 'Think (' + (n - j) + ' left)?', 'thinking', true); if (!did) break; }
        return;
      }
      let left = n;
      while (left > 0) {
        const opts = actOptions(p, role, left, ctx);
        if (opts.length === 1) { log({ t: 'idle', by: p.id, role, n: left, via: ctx.via || null }); break; }
        const a = yield* ask(p, { t: 'act', role, left, via: ctx.via || null, label: ctx.label || null,
          why: (ctx.label ? ctx.label + ': ' : '') + D.ROLE[role].name + ' action' + (left > 1 ? ' — ' + left + ' left' : ''),
          pub: 'taking ' + (left > 1 ? left + ' ' + D.ROLE[role].name + ' actions' : 'a ' + D.ROLE[role].name + ' action'), options: opts });
        const o = legalOpt(p, role, left, a.id, ctx);
        if (!o || o.kind === 'stop') { if (left) log({ t: 'idle', by: p.id, role, n: left, stop: true, via: ctx.via || null }); break; }
        const used = yield* doOption(p, role, o, left, ctx);
        left -= used || 1;
        if (role === 'craftsman' && g.tt) g.tt.crafted[p.id] = true;
        checkWins(p);
      }
    }
    function* hire(p, c, from, ctx) {
      p.clients.push(c);
      log({ t: 'client', by: p.id, card: K(c), from });
      /* Domus: a client matching the role being played adds an action to it. */
      if (ctx && ctx.domus && g.tt && g.tt.role && (roleOf(c) === g.tt.role || (has(p, 'ludusmagnus') && roleOf(c) === 'merchant') || (g.tt.role === 'laborer' && has(p, 'storeroom')))) {
        if (g.tt.extra) g.tt.extra[p.id] = (g.tt.extra[p.id] || 0) + 1;
      }
      if (has(p, 'bath')) {
        log({ t: 'bath', by: p.id, role: roleOf(c) });
        yield* actions(p, roleOf(c), 1, { via: 'bath', label: 'Bath — your new ' + D.ROLE[roleOf(c)].name });
      }
      checkWins(p);
    }
    function* doOption(p, role, o, left, ctx) {
      const c = o.card;
      switch (o.kind) {
        case 'take': {
          if (o.from === 'pool') { removeFrom(g.pool, c); p.stock.push(c); log({ t: 'take', by: p.id, mat: matOf(c), from: 'pool' }); }
          else { removeFrom(p.hand, c); p.stock.push(c); log({ t: 'take', by: p.id, mat: matOf(c), from: 'hand' }); }
          if (o.from === 'pool' && has(p, 'dock')) {
            const hand = uniqBy(p.hand.filter(x => !isJack(x)), K);
            const id = yield* pick(p, 'dock', 'Dock: move a card from your hand into your Stockpile too?', hand.map(x => ({ id: x, label: D.nameOf(K(x)) + ' as ' + D.MAT[matOf(x)].name, card: K(x) })), { skip: 'No', pub: 'deciding about the Dock' });
            if (id) { removeFrom(p.hand, id); p.stock.push(id); log({ t: 'take', by: p.id, mat: matOf(id), from: 'hand' }); }
          }
          return 1;
        }
        case 'client': {
          if (o.from === 'pool') { removeFrom(g.pool, c); yield* hire(p, c, 'pool', ctx); }
          else if (o.from === 'deck') { const d = drawTop('bar'); yield* hire(p, d, 'deck', ctx); deckOutCheck(); }
          else { removeFrom(p.hand, c); yield* hire(p, c, 'hand', ctx); }
          if (o.from === 'pool' && has(p, 'bar') && g.deck.length && clientsLeft(p)) {
            if (yield* yesNo(p, 'bar', 'Bar: hire the top card of the deck as well?', 'Yes — the top card', 'No', 'deciding about the Bar')) { const d = drawTop('bar'); yield* hire(p, d, 'deck', ctx); deckOutCheck(); }
          }
          if (o.from !== 'hand' && has(p, 'aqueduct') && clientsLeft(p)) {
            const hand = uniqBy(p.hand.filter(x => !isJack(x)), roleOf);
            const id = yield* pick(p, 'aqueduct', 'Aqueduct: hire a client from your hand as well?', hand.map(x => ({ id: x, label: 'A ' + D.ROLE[roleOf(x)].name + ' (' + D.nameOf(K(x)) + ')', card: K(x) })), { skip: 'No', pub: 'deciding about the Aqueduct' });
            if (id) { removeFrom(p.hand, id); yield* hire(p, id, 'hand', ctx); }
          }
          return 1;
        }
        case 'vault': {
          if (o.from === 'stock') { removeFrom(p.stock, c); p.vault.push({ id: c, seen: true }); log({ t: 'vault', by: p.id, mat: matOf(c), from: 'stock' }); }
          else if (o.from === 'deck') { const d = drawTop('atrium'); p.vault.push({ id: d, seen: false }); log({ t: 'vault', by: p.id, mat: null, from: 'deck' }); deckOutCheck(); }
          else { removeFrom(p.hand, c); p.vault.push({ id: c, seen: true }); log({ t: 'vault', by: p.id, mat: null, from: 'hand' }); }
          if (o.from !== 'hand' && has(p, 'basilica') && vaultLeft(p)) {
            const hand = uniqBy(p.hand.filter(x => !isJack(x)), K);
            const id = yield* pick(p, 'basilica', 'Basilica: move a card from your hand into your Vault as well?', hand.map(x => ({ id: x, label: D.nameOf(K(x)) + ' (' + D.MAT[matOf(x)].name + ', ' + valOf(x) + ')', card: K(x) })), { skip: 'No', pub: 'deciding about the Basilica' });
            if (id) { removeFrom(p.hand, id); p.vault.push({ id, seen: true }); log({ t: 'vault', by: p.id, mat: null, from: 'hand' }); }
          }
          return 1;
        }
        case 'lay': {
          removeFrom(p.hand, c);
          yield* lay(p, c, o.site, o.ot, role);
          return o.cost || 1;
        }
        case 'fill': {
          const b = p.builds.find(x => x.uid === o.b);
          if (o.from === 'hand') removeFrom(p.hand, c);
          else if (o.from === 'stock') removeFrom(p.stock, c);
          else removeFrom(g.pool, c);
          yield* addTo(p, b, c, o.from, role === 'architect');
          if (role === 'architect') yield* stairway(p);
          return 1;
        }
        case 'fountain': {
          const d = drawTop('fountain');
          g.limbo.push(d);
          log({ t: 'fountain', by: p.id });
          const opts = [];
          for (const s of laySites(p, d, left)) opts.push({ id: 'lay:' + s.site + ':' + (s.ot ? 1 : 0), label: 'Lay it' + (K(d) === 'statue' ? ' on a ' + D.MAT[s.site].name + ' site' : '') + (s.ot ? ' out of town' + (s.cost > 1 ? ' (uses 2 actions)' : '') : ''), cost: s.cost, card: K(d) });
          for (const b of p.builds) if (accepts(p, b, matOf(d))) opts.push({ id: 'fill:' + b.uid, label: 'Put it into your ' + D.nameOf(kindOfB(b)) + ' as ' + D.MAT[matOf(d)].name, card: K(d) });
          opts.push({ id: 'keep', label: 'Keep it in your hand', card: K(d) });
          const id = yield* pick(p, 'fountain', 'Fountain: you turned over ' + D.nameOf(K(d)) + ' (' + D.MAT[matOf(d)].name + '). What now?', opts, { always: true, pub: 'using the Fountain' });
          removeFrom(g.limbo, d);
          let used = 1;
          if (id === 'keep') { p.hand.push(d); log({ t: 'draw', by: p.id, n: 1, why: 'fountain' }); }
          else if (id.indexOf('lay:') === 0) { const [, site, ot] = id.split(':'); const o2 = opts.find(x => x.id === id); yield* lay(p, d, site, ot === '1', 'fountain'); used = o2.cost || 1; }
          else { const b = p.builds.find(x => x.uid === id.slice(5)); yield* addTo(p, b, d, 'deck', false); }
          deckOutCheck();
          return used;
        }
        case 'tear': {
          const b = p.builds.find(x => x.uid === o.b);
          removeFrom(p.builds, b);
          p.hand.push(b.card);
          b.mats.forEach(m => p.stock.push(m));
          const i = p.inf.indexOf(b.site);
          if (i >= 0) p.inf.splice(i, 1);
          g.sites[b.site].out++;
          log({ t: 'tear', by: p.id, card: kindOfB(b), mats: b.mats.length });
          return 1;
        }
      }
      return 1;
    }
    /* Stairway: with each Architect action, a material into another
       player's finished building makes its power everybody's. */
    function* stairway(p) {
      if (!has(p, 'stairway')) return;
      const opts = [];
      const srcs = uniqBy(p.stock, matOf).map(c => ({ c, from: 'stock' })).concat(has(p, 'archway') ? uniqBy(g.pool, matOf).map(c => ({ c, from: 'pool' })) : []);
      g.players.forEach(q => { if (q !== p) q.builds.forEach(b => { if (b.done && !b.pub) srcs.forEach(s => { if (matOf(s.c) === b.site || matOf(s.c) === D.matOf(kindOfB(b))) opts.push({ id: s.c + '>' + b.uid + '>' + s.from, label: D.MAT[matOf(s.c)].name + (s.from === 'pool' ? ' from the Pool' : '') + ' into ' + q.name + '’s ' + D.nameOf(kindOfB(b)), card: kindOfB(b), sub: D.card(kindOfB(b)).text }); }); }); });
      if (!opts.length) return;
      const id = yield* pick(p, 'stairway', 'Stairway: make another player’s building work for everyone?', opts, { skip: 'No', pub: 'deciding about the Stairway' });
      if (!id) return;
      const [c, bu, from] = id.split('>');
      let b = null, q = null;
      g.players.forEach(x => x.builds.forEach(y => { if (y.uid === bu) { b = y; q = x; } }));
      if (from === 'pool') removeFrom(g.pool, c); else removeFrom(p.stock, c);
      b.mats.push(c); b.pub = true;
      log({ t: 'stairway', by: p.id, of: q.id, card: kindOfB(b) });
      checkWins(p);
    }

    /* ---------------- the Legionary ---------------- */
    function* legionary(p, n, ctx) {
      const hand = p.hand.filter(c => !isJack(c));
      const opts = hand.map(c => ({ id: c, label: D.MAT[matOf(c)].name, sub: D.nameOf(K(c)), mat: matOf(c), card: K(c) }));
      if (has(p, 'castrapraetoria')) p.builds.forEach(b => { if (!b.done) opts.push({ id: b.uid, label: D.MAT[D.matOf(kindOfB(b))].name, sub: 'your unfinished ' + D.nameOf(kindOfB(b)), mat: D.matOf(kindOfB(b)), card: kindOfB(b), build: true }); });
      if (!opts.length) { log({ t: 'idle', by: p.id, role: 'legionary', n, via: ctx.via || null }); return; }
      const ids = yield* pick(p, 'demand', 'Rome demands… Show up to ' + n + ' card' + (n > 1 ? 's' : '') + ' — one material each.', opts,
        { multi: true, min: 0, max: n, always: true, pub: 'choosing what Rome demands' });
      if (!ids.length) { log({ t: 'idle', by: p.id, role: 'legionary', n, stop: true }); return; }
      const mats = ids.map(id => opts.find(o => o.id === id).mat);
      log({ t: 'demand', by: p.id, mats: mats.slice(), shown: ids.map(id => opts.find(o => o.id === id).card) });
      yield* hold({ k: 'demand', by: p.id, mats: mats.slice() });
      const bridge = has(p, 'bridge');
      const victims = victimsOf(p, bridge);
      const got = { pool: 0, hands: {} };
      for (const m of mats) {
        const pi = g.pool.findIndex(c => matOf(c) === m);
        if (pi >= 0) { const c = g.pool.splice(pi, 1)[0]; p.stock.push(c); log({ t: 'take', by: p.id, mat: m, from: 'pool', why: 'legionary' }); }
        for (const q of victims) {
          const wall = has(q, 'wall'), pal = has(q, 'palisade') && !bridge;
          if (wall || pal) { log({ t: 'immune', by: p.id, of: q.id, mat: m, card: wall ? 'wall' : 'palisade' }); continue; }
          const match = q.hand.filter(c => !isJack(c) && matOf(c) === m);
          if (match.length) {
            let give = match[0];
            if (uniqBy(match, K).length > 1) give = yield* pick(q, 'give', p.name + ': “Rome demands ' + D.MAT[m].name + '!” Which card do you hand over?', uniqBy(match, K).map(c => ({ id: c, label: D.nameOf(K(c)), card: K(c) })), { pub: 'handing over ' + D.MAT[m].name });
            removeFrom(q.hand, give);
            p.stock.push(give);
            if (g.tt) g.tt.lost[q.id] = true;
            log({ t: 'give', by: q.id, to: p.id, mat: m, card: K(give) });
          } else log({ t: 'glory', by: q.id, to: p.id, mat: m });
          if (bridge) {
            const si = q.stock.findIndex(c => matOf(c) === m);
            if (si >= 0) { const c = q.stock.splice(si, 1)[0]; p.stock.push(c); log({ t: 'take', by: p.id, of: q.id, mat: m, from: 'stockpile', why: 'bridge' }); }
          }
          if (g.version === 'imp' && has(p, 'colosseum') && vaultLeft(p)) {
            const ci = q.clients.findIndex(c => matOf(c) === m);
            if (ci >= 0) { const c = q.clients.splice(ci, 1)[0]; p.vault.push({ id: c, seen: true }); log({ t: 'lions', by: p.id, of: q.id, card: K(c), role: roleOf(c) }); }
          }
          if (g.version === 'rep' && has(p, 'domusaurea')) {
            const b = q.builds.find(x => !x.done && !x.mats.length && D.matOf(kindOfB(x)) === m);
            if (b) { removeFrom(q.builds, b); p.stock.push(b.card); p.inf.push(b.site); log({ t: 'aurea', by: p.id, of: q.id, card: kindOfB(b), site: b.site }); }
          }
        }
      }
      checkWins(p);
    }

    /* ================================================================
       The game
       ================================================================ */
    g.main = function* () {
      const n = N();
      const kinds = D.deckKinds(g.version, g.geek);
      const count = {};
      const ids = kinds.map(k => { count[k] = (count[k] || 0) + 1; return k + '.' + count[k]; });
      g.deck = shuffle(ids, rand);
      g.jacks = [1, 2, 3, 4, 5, 6].map(i => 'jack.' + i);
      D.MATS.forEach(m => { g.sites[m] = { in: n, out: 6 - n }; });
      const S = D.SETS[g.version];
      for (const p of g.players) {
        for (let j = 0; j < S.startHand; j++) p.hand.push(g.deck.pop());
        for (let j = 0; j < S.startJacks; j++) p.hand.push(g.jacks.pop());
      }
      /* Who leads: a card into the Pool for each player; the earliest in the
         alphabet starts, ties dealing again (all of them stay in the Pool). */
      let tied = g.players.slice();
      const dealt = [];
      for (let round = 0; tied.length > 1 && g.deck.length >= tied.length; round++) {
        const these = tied.map(p => ({ p, c: g.deck.pop() }));
        these.forEach(x => { g.pool.push(x.c); dealt.push({ by: x.p.id, card: K(x.c) }); });
        const nm = x => D.nameOf(K(x.c));
        const best = these.map(nm).sort()[0];
        tied = these.filter(x => nm(x) === best).map(x => x.p);
      }
      g.drawN = 0;
      g.leader = tied[0].i;
      g.startInfo = { by: tied[0].id, dealt };
      log({ t: 'start', by: tied[0].id, dealt, version: g.version, geek: g.geek });
      for (;;) {
        yield* turn(g.players[g.leader]);
        g.leader = (g.leader + 1) % n;
      }
    };

    /* A prompt with one legal answer answers itself: nothing to play, and
       only one way to Think. */
    function forcedThink(p, role) {
      if (playsFor(p, role).length) return null;
      const m = thinkMenu(p);
      if (m.latrine || m.vomit) return null;
      const ways = [m.refill ? 'refill' : null, m.one ? 'one' : null, m.jack ? 'jack' : null].filter(Boolean);
      return ways.length === 1 ? { t: 'think', how: ways[0], forced: true } : null;
    }
    function* turn(L) {
      g.turnN++;
      g.tt = { leader: L.id, role: null, plays: {}, crafted: {}, lost: {}, extra: {}, thought: {}, order: [] };
      g.phase = 'lead';
      log({ t: 'turn', by: L.id, turn: true });
      const a = forcedThink(L, null) || (yield* ask(L, { t: 'lead', why: 'You lead: play a role, or Think', pub: 'deciding what to lead' }));
      if (a.t === 'think') {
        log({ t: 'thinks', by: L.id, lead: true });
        g.tt.thought[L.id] = true;
        yield* doThink(L, a);
        yield* endTurn(L);
        return;
      }
      const role = a.role;
      g.tt.role = role;
      playCards(L, a.cards, role, 'lead');
      yield* hold({ k: 'lead', by: L.id, role, cards: a.cards.map(K) });
      g.phase = 'follow';
      for (let k = 1; k < N(); k++) {
        const q = after(L, k);
        const f = forcedThink(q, role) || (yield* ask(q, { t: 'follow', role, why: L.name + ' leads ' + D.ROLE[role].name + ': follow, or Think', pub: 'deciding whether to follow ' + D.ROLE[role].name }));
        if (f.t === 'think') { log({ t: 'thinks', by: q.id }); g.tt.thought[q.id] = true; yield* doThink(q, f); }
        else playCards(q, f.cards, role, 'follow');
      }
      g.phase = 'actions';
      for (let k = 0; k < N(); k++) {
        const p = after(L, k);
        const played = g.tt.plays[p.id];
        const units = played ? played.units : 0;
        const cl = clientsFor(p, role) * (played && has(p, 'circusmaximus') ? 2 : 1);
        const n = units + cl;
        g.tt.order.push(p.id);
        if (!n) continue;
        g.tt.extra[p.id] = 0;
        log({ t: 'acts', by: p.id, role, n, units, clients: cl });
        yield* actionsWithExtra(p, role, n, { via: played ? (p === L ? 'lead' : 'follow') : 'clients', played: !!played });
        if (role === 'laborer' && played && has(p, 'watermill')) {
          const arch = clientsFor(p, 'architect');
          if (arch) yield* actions(p, 'architect', arch, { via: 'watermill', label: 'Watermill' });
        }
        if (played && has(p, 'triclinium')) yield* triclinium(p, role);
      }
      yield* endTurn(L);
    }
    /* Domus adds actions mid-block; run them on. */
    function* actionsWithExtra(p, role, n, ctx) {
      yield* actions(p, role, n, ctx);
      let more = g.tt.extra[p.id] || 0;
      while (more > 0) { g.tt.extra[p.id] = 0; yield* actions(p, role, more, ctx); more = g.tt.extra[p.id] || 0; }
    }
    function* triclinium(p, role) {
      const room = vaultLeft(p);
      const cands = p.clients.filter(c => roleOf(c) === role || (has(p, 'ludusmagnus') && roleOf(c) === 'merchant') || (role === 'laborer' && has(p, 'storeroom')));
      if (!room || !cands.length) return;
      const ids = yield* pick(p, 'triclinium', 'Triclinium: put any of the clients who just worked into your Vault?', cands.map(c => ({ id: c, label: D.ROLE[roleOf(c)].name + ' (' + D.MAT[matOf(c)].name + ', ' + valOf(c) + ')', card: K(c) })),
        { multi: true, min: 0, max: room, always: true, pub: 'deciding about the Triclinium' });
      for (const c of ids) { removeFrom(p.clients, c); p.vault.push({ id: c, seen: true }); log({ t: 'vault', by: p.id, mat: matOf(c), from: 'clientele' }); }
    }
    function* endTurn(L) {
      g.phase = 'end';
      const order = []; for (let k = 0; k < N(); k++) order.push(after(L, k));
      for (const p of order) {
        if (g.tt.crafted[p.id] && has(p, 'academy')) yield* offerThink(p, 'Academy: Think once, after a Craftsman turn?', 'thinking for the Academy', true);
        if (g.geek && g.tt.lost[p.id] && has(p, 'castra')) yield* offerThink(p, 'Castra: a Legionary took your cards — Think?', 'thinking for the Castra', true);
      }
      /* The cards led and followed go to the Pool; Jacks back to the pile —
         unless a Sewer or a Senate claims them. */
      const senates = g.version === 'imp' ? order.filter(p => has(p, 'senate')) : [];
      for (const p of order) {
        const pl = g.tt.plays[p.id];
        if (!pl) continue;
        for (const c of pl.cards) {
          if (isJack(c)) {
            const s = senates.find(x => x !== p);
            if (s) { s.hand.push(c); log({ t: 'senate', by: s.id, of: p.id }); }
            else g.jacks.push(c);
          } else if (has(p, 'sewer')) { p.stock.push(c); log({ t: 'sewer', by: p.id, mat: matOf(c) }); }
          else g.pool.push(c);
        }
      }
      g.tt.plays = {};
      checkWins();
      log({ t: 'endturn', by: L.id });
    }

    /* ================================================================
       Answers
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
          g.hold = Object.assign({ n: ++g.holdN }, q.hold);
          return;
        }
        if (q.ask) { g.prompts = q.ask; return; }
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
    function checkThinkAns(p, a) {
      const r = thinkCheck(p, a);
      if (!r.ok) return r;
      return yes({ a: { t: 'think', how: a.how, drop: a.dropAll ? null : (a.drop || null), dropAll: !!a.dropAll } });
    }
    function check(p, pr, a) {
      if (pr.t === 'pick') return checkPick(pr, a);
      if (pr.t === 'think') {
        if (a.t === 'skip') return pr.optional ? yes({ a: { t: 'skip' } }) : no('You have to Think.');
        if (a.t !== 'think') return no('Draw cards or take a Jack.');
        return checkThinkAns(p, a);
      }
      if (pr.t === 'lead' || pr.t === 'follow') {
        if (a.t === 'think') return checkThinkAns(p, a);
        const role = pr.t === 'lead' ? a.role : pr.role;
        if (a.t !== (pr.t === 'lead' ? 'lead' : 'follow')) return no(pr.t === 'lead' ? 'Lead a role, or Think.' : 'Follow, or Think.');
        const cards = Array.isArray(a.cards) ? a.cards.map(String) : [];
        const r = playCheck(p, cards, role);
        if (!r.ok) return r;
        return yes({ a: { t: a.t, role, cards } });
      }
      if (pr.t === 'act') {
        if (a.t !== 'act') return no('Choose one of the actions.');
        const o = pr.options.find(x => x.id === String(a.id));
        if (!o) return no('That is not one of the choices.');
        if (o.kind !== 'stop' && !legalOpt(p, pr.role, pr.left, o.id)) return no('That is no longer possible.');
        return yes({ a: { t: 'act', id: o.id } });
      }
      return no('That is not something you can do now.');
    }
    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The game is over.');
      if (g.hold) return no('Watch the telly first.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const pr = g.prompts.find(x => x.seat === seatId);
      if (!pr) return no('It is not your turn.');
      if (a.n != null && +a.n !== pr.n) return no('That question has moved on.');
      const r = check(p, pr, a);
      if (!r.ok) return r;
      g.prompts = [];
      g.actN++;
      g.advance(r.a);
      return yes();
    };

    /* ================================================================
       The views
       ================================================================ */
    const pubBuild = (p, b) => ({ uid: b.uid, card: K(b.card), site: b.site, ot: b.ot, mats: b.mats.map(matOf), need: needOf(b), done: b.done, pub: b.pub,
      works: !b.done && D.matOf(K(b.card)) === 'marble' && gateOn(p) });
    g.publicView = function () {
      const tt = g.tt;
      return {
        v: VERSION, phase: g.phase, turnN: g.turnN, version: g.version, geek: g.geek, pet: g.pet, start: g.startInfo ? clone(g.startInfo) : null,
        leader: g.leader == null ? null : g.players[g.leader].id,
        role: tt ? tt.role : null,
        active: g.prompts.length ? g.prompts[0].seat : null,
        deckN: g.deck.length, jacksN: g.jacks.length, pool: g.pool.map(K),
        sites: clone(g.sites), inTown: g.sites.rubble ? inTownLeft() : 0,
        plays: tt ? Object.keys(tt.plays).map(id => ({ by: id, cards: tt.plays[id].cards.map(K), units: tt.plays[id].units, how: tt.plays[id].how })) : [],
        thought: tt ? Object.keys(tt.thought) : [],
        players: g.players.map(p => ({
          id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, i: p.i,
          handN: p.hand.length, inf: infOf(p), infSites: p.inf.slice(),
          clients: p.clients.map(K), stock: p.stock.map(matOf), vaultN: p.vault.length,
          clientRoom: clientRoom(p), vaultRoom: vaultRoom(p), handSize: handSize(p),
          builds: p.builds.map(b => pubBuild(p, b)),
          powers: D.CARDS.filter(c => has(p, c.k)).map(c => c.k)
        })),
        prompt: g.prompts.length ? { n: g.prompts[0].n, seat: g.prompts[0].seat, t: g.prompts[0].t, what: g.prompts[0].what || null, role: g.prompts[0].role || null, why: g.prompts[0].pub || g.prompts[0].why } : null,
        hold: g.hold ? clone(g.hold) : null,
        log: g.log.slice(-80).map(e => Object.assign({}, e)),
        logN: g.log.length,
        result: g.result
      };
    };
    g.seatView = function (id) {
      const p = P(id);
      if (!p) return null;
      const pr = g.prompts.find(x => x.seat === id);
      const out = { id, v: VERSION, hand: p.hand.map(String), vault: p.vault.map(v => v.seen ? K(v.id) : null), prompt: pr && !g.hold ? clone(pr) : null };
      if (out.prompt && (pr.t === 'lead' || pr.t === 'follow' || pr.t === 'think')) {
        out.prompt.plays = pr.t === 'think' ? [] : playsFor(p, pr.t === 'follow' ? pr.role : null);
        out.prompt.think = thinkMenu(p);
        out.prompt.petition = petOf(p);
        out.prompt.palace = has(p, 'palace');
        out.prompt.crane = has(p, 'crane');
      }
      return out;
    };
    /* Pure checks the phone and the house may ask about a candidate play. */
    g.checkPlay = (id, cards, role) => { const p = P(id); return p ? playCheck(p, cards, role) : no('?'); };
    g.checkThink = (id, a) => { const p = P(id); return p ? thinkCheck(p, a) : no('?'); };

    /* For the tests: every card is somewhere, exactly once. */
    g.census = function () {
      const seen = {};
      const note = (id, w) => { (seen[id] = seen[id] || []).push(w); };
      g.deck.forEach(id => note(id, 'deck'));
      g.pool.forEach(id => note(id, 'pool'));
      g.jacks.forEach(id => note(id, 'jacks'));
      g.limbo.forEach(id => note(id, 'limbo'));
      for (const p of g.players) {
        p.hand.forEach(id => note(id, p.id + ':hand'));
        p.clients.forEach(id => note(id, p.id + ':clients'));
        p.stock.forEach(id => note(id, p.id + ':stock'));
        p.vault.forEach(v => note(v.id, p.id + ':vault'));
        p.builds.forEach(b => { note(b.card, p.id + ':build'); b.mats.forEach(m => note(m, p.id + ':mat')); });
      }
      if (g.tt) Object.keys(g.tt.plays).forEach(id => g.tt.plays[id].cards.forEach(c => note(c, id + ':played')));
      return seen;
    };
    g.X = { has, infOf, infFor, handSize, clientRoom, vaultRoom, clientsFor, actOptions, playsFor, playCheck, thinkMenu, laySites, accepts, score, bonuses, forumRoles, victimsOf, inTownLeft, K, matOf, roleOf, isJack };
  }

  const Engine = { VERSION, LEVELS, create, rngFrom, shuffle, K, isJack };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.GtrEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
