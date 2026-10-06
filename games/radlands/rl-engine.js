'use strict';
/* Radlands — the rules. No DOM, no timers, one seeded rng.
 *
 * The display holds the one Game; every order — from a phone, a house player
 * or a test — goes through `g.act(seatId, answer)`, which refuses with a
 * reason rather than a bare false. Phones load the data file only.
 *
 * **The game is one generator.** `main()` deals the camps, then plays turn
 * after turn; a turn, an ability, an event are generators too, and every
 * question is a `yield`. The driver (`advance`) runs the generator until it
 * asks something (`{ask:[prompt]}`) or wants the telly to show something
 * first (`{hold}`), and an answer resumes it. That gives the hub's usual
 * shape for free:
 *
 *   g.prompts   the questions open right now — the active player's turn, a
 *               choice inside an ability, or the opponent's choice (Raiders,
 *               Scud Launcher, Mercenary Camp …). Two at once only while the
 *               camps are being chosen.
 *   g.hold      decide, hold, show, then apply: an event about to go off.
 *               Only when the telly is showing the game (`opts.show`); a test
 *               proves seeded games end identically with it on and off.
 *
 * Generators cannot be copied, so undo is by replay (the telly keeps the
 * answers), never by snapshot — the checklist's preferred way anyway.
 *
 * **What is secret:** each hand; the deck's order; what every punk really is
 * (to its owner too — "no peeking"); the six camps dealt to each player until
 * both have chosen; the discard pile below its top card ("no dumpster
 * diving" — the log names each card as it is discarded). The event queues,
 * the board, water and hand sizes are public.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./rl-data.js') : root.RadData;

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
  const T = D.typeOf;

  /* ================================================================
     Building a game
     ================================================================ */
  function create(opts) {
    opts = opts || {};
    const list = opts.players || [];
    if (list.length !== 2) throw new Error('Radlands is for two players');
    const seed = opts.seed == null ? Date.now() : opts.seed;
    const rng = rngFrom(seed);
    const g = {
      VERSION, seed, rng, rngN: 0,
      setup: opts.setup === 'book' ? 'book' : 'draft',
      opts: { show: !!opts.show },
      phase: 'setup', turnN: 0, cur: null, start: null, firstWater: true,
      water: 0, tt: {},
      deck: [], disc: [], reshuffles: 0, campBox: [],
      log: [], prompts: [], pn: 0, waitAll: false, answers: {},
      hold: null, holdN: 0, actN: 0, flipN: 0, uidN: 0,
      result: null, limbo: []
    };
    g.players = list.map((x, i) => ({
      id: x.id, name: x.name, hex: x.hex || '#e9b93a', bot: !!x.bot, i,
      level: x.bot ? (LEVELS.indexOf(x.level) >= 0 ? x.level : 'medium') : null,
      camps: [], cols: [[], [], []], hand: [], silo: true, q: [null, null, null], dealt: []
    }));
    g.startOpt = opts.start == null ? null : +opts.start;
    attach(g);
    g.gen = g.main();
    g.advance();
    return g;
  }

  function attach(g) {
    const P = id => g.players.find(p => p.id === id) || null;
    const opp = p => g.players[1 - p.i];
    const rand = () => { g.rngN++; return g.rng(); };
    const log = e => { g.log.push(Object.assign({ tn: g.turnN }, e)); return e; };
    const uid = pre => pre + (++g.uidN);

    g.seat = P;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.activeId = () => g.phase === 'over' || g.cur == null ? null : g.players[g.cur].id;
    g.note = e => log(e);

    /* ---------------- the board ---------------- */
    const people = p => { const out = []; p.cols.forEach(c => c.forEach(e => { if (e.kind === 'person') out.push(e); })); return out; };
    const colOf = (p, e) => p.cols.findIndex(c => c.indexOf(e) >= 0);
    const peopleIn = (p, k) => p.cols[k].filter(e => e.kind === 'person').length;
    const liveCamps = p => p.camps.filter(c => !c.dead);
    const deadCamps = p => p.camps.filter(c => c.dead).length;
    const roomAnywhere = p => [0, 1, 2].some(k => peopleIn(p, k) < 2);
    const findEnt = (p, u) => { for (const c of p.cols) for (const e of c) if (e.uid === u) return e; return null; };
    const ownerOf = e => g.players.find(p => colOf(p, e) >= 0) || null;
    /* A trait is live on an undamaged person, or on a camp not destroyed. */
    const personTrait = (p, type) => people(p).some(e => !e.punk && T(e.inst) === type && !e.dmg);
    const campTrait = (p, type) => p.camps.some(c => c.id === type && !c.dead);
    const punks = p => people(p).filter(e => e.punk).length;
    const isReady = e => e.kind === 'camp' ? !e.dead && !e.used : !e.dmg && !e.nr;
    const typeOfEnt = e => e.kind === 'camp' ? e.id : (e.punk ? null : T(e.inst));
    const entName = e => e.kind === 'camp' ? D.nameOf(e.id) : (e.punk ? 'a punk' : D.nameOf(e.inst));
    /* For the log and the room: never the punk's real card. */
    const pubEnt = (p, e) => ({ of: p.id, uid: e.uid, kind: e.kind, card: e.kind === 'camp' ? e.id : (e.punk ? null : e.inst), punk: !!e.punk, col: colOf(p, e) });

    /* Unprotected: nothing of yours in front of it. On a High Ground turn every
       card of the other side counts as unprotected to its owner's attacks. */
    function exposed(q, attacker) {
      const all = attacker && g.tt.hg === attacker.i;
      const out = [];
      q.cols.forEach(col => {
        col.forEach((e, i) => {
          if (e.kind === 'camp' && e.dead) return;
          if (all || i === col.length - 1) out.push(e);
        });
      });
      return out;
    }
    const allLive = q => { const out = []; q.cols.forEach(col => col.forEach(e => { if (!(e.kind === 'camp' && e.dead)) out.push(e); })); return out; };

    function where(p, e) {
      const k = colOf(p, e);
      if (k < 0) return '';
      const col = p.cols[k];
      const i = col.indexOf(e);
      const camp = p.camps[k];
      if (e.kind === 'camp') return '';
      const front = i === col.length - 1;
      return 'by ' + D.nameOf(camp.id) + (peopleIn(p, k) > 1 ? (front ? ', in front' : ', behind') : '');
    }
    function label(p, e, viewer) {
      const mine = viewer && viewer.id === p.id;
      const who = mine ? 'Your ' : p.name + '’s ';
      if (e.kind === 'camp') return who + D.nameOf(e.id) + (e.dmg ? ' (damaged)' : '');
      return who + (e.punk ? 'punk' : D.nameOf(e.inst)) + (e.dmg ? ' (damaged)' : '');
    }
    const tgtOpt = (p, e, viewer, extra) => Object.assign({ id: e.uid, label: label(p, e, viewer), sub: where(p, e),
      tgt: { side: viewer && viewer.id === p.id ? 'me' : 'opp', kind: e.kind, card: typeOfEnt(e), punk: !!e.punk, dmg: !!e.dmg, camp: e.kind === 'camp' } }, extra || {});

    /* ---------------- the deck ---------------- */
    /* The top of the deck is the END of the array. */
    function drawTop() {
      if (!g.deck.length) {
        if (g.reshuffles >= 1 || !g.disc.length) { finish(null, 'deck'); }
        g.deck = shuffle(g.disc, rand);
        g.disc = [];
        g.reshuffles++;
        log({ t: 'reshuffle' });
      }
      return g.deck.pop();
    }
    function draw(p, k, why) {
      const got = [];
      for (let j = 0; j < k; j++) { const c = drawTop(); p.hand.push(c); got.push(c); }
      if (got.length) log({ t: 'draw', by: p.id, n: got.length, why: why || null });
      return got;
    }
    function discard(p, cards, why) {
      for (const c of cards) {
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
        if (c === 'silo') p.silo = true; else g.disc.push(c);
      }
      if (cards.length) log({ t: 'discard', by: p.id, cards: cards.slice(), why: why || null });
    }

    /* ---------------- damage, death, restore ---------------- */
    function finish(winner, how) {
      g.phase = 'over';
      g.prompts = []; g.hold = null;
      const w = winner ? P(winner) : null;
      const rows = g.players.map(p => {
        const q = opp(p);
        return { id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level,
          standing: liveCamps(p).length, razed: deadCamps(q), people: people(p).length, won: how === 'deck' ? false : p.id === winner, draw: how === 'deck' };
      });
      g.result = { winner: winner || null, name: w ? w.name : null, how, rows, turnN: g.turnN };
      log({ t: 'over', by: winner || null, how });
      throw OVER;
    }
    function killCamp(p, c, by) {
      if (c.dead) return;
      c.dead = true; c.dmg = false;
      const k = p.camps.indexOf(c);
      const col = p.cols[k];
      if (col.indexOf(c) > 0) { col.splice(col.indexOf(c), 1); col.unshift(c); }
      c.moves = 0;
      log({ t: 'campDown', by: by ? by.id : null, of: p.id, card: c.id, left: liveCamps(p).length });
      if (!liveCamps(p).length) finish(opp(p).id, 'camps');
    }
    function killPerson(p, e, by, why) {
      const k = colOf(p, e);
      if (k < 0) return;
      p.cols[k].splice(p.cols[k].indexOf(e), 1);
      if (e.punk) g.deck.push(e.inst); else g.disc.push(e.inst);
      log({ t: 'die', by: by ? by.id : null, of: p.id, card: e.punk ? null : e.inst, punk: !!e.punk, why: why || null });
    }
    /* One damage, by the rules: a punk dies, a damaged card dies, anything
       else turns sideways. Returns what happened. */
    function hurt(p, e, by, how) {
      if (e.kind === 'camp') {
        if (e.dead) return null;
        if (e.dmg) { log({ t: 'hit', by: by ? by.id : null, of: p.id, card: e.id, camp: true, res: 'destroyed', how: how || 'damage' }); killCamp(p, e, by); return 'destroyed'; }
        e.dmg = true;
        log({ t: 'hit', by: by ? by.id : null, of: p.id, card: e.id, camp: true, res: 'damaged', how: how || 'damage' });
        return 'damaged';
      }
      if (e.punk || e.dmg) {
        log({ t: 'hit', by: by ? by.id : null, of: p.id, card: e.punk ? null : e.inst, punk: !!e.punk, res: 'killed', how: how || 'damage' });
        killPerson(p, e, by, 'hit');
        return 'destroyed';
      }
      e.dmg = true;
      log({ t: 'hit', by: by ? by.id : null, of: p.id, card: e.inst, res: 'damaged', how: how || 'damage' });
      return 'damaged';
    }
    function destroy(p, e, by, why) {
      if (e.kind === 'camp') { log({ t: 'hit', by: by ? by.id : null, of: p.id, card: e.id, camp: true, res: 'destroyed', how: 'destroy' }); killCamp(p, e, by); }
      else { log({ t: 'hit', by: by ? by.id : null, of: p.id, card: e.punk ? null : e.inst, punk: !!e.punk, res: 'killed', how: why || 'destroy' }); killPerson(p, e, by, why || 'destroy'); }
    }
    function restoreEnt(p, e, by, ready) {
      e.dmg = false;
      if (e.kind === 'person') e.nr = !ready;
      log({ t: 'restore', by: by.id, of: p.id, card: e.kind === 'camp' ? e.id : (e.punk ? null : e.inst), punk: !!e.punk, camp: e.kind === 'camp' });
    }

    /* ================================================================
       Asking
       ================================================================ */
    function* ask(p, pr) {
      pr = Object.assign({ n: ++g.pn, seat: p.id }, pr);
      const a = yield { ask: [pr] };
      return a;
    }
    /* A pick. A question with one legal answer answers itself; with none it
       is not asked. `multi` takes ids (min..max). */
    function* pick(p, what, why, options, o) {
      o = o || {};
      const legal = options.filter(x => !x.bad);
      if (!o.multi) {
        if (!legal.length) return null;
        if (legal.length === 1 && !o.skip && !o.always) return legal[0].id;
      } else {
        const min = o.min || 0, max = o.max == null ? legal.length : o.max;
        if (!legal.length) return [];
        if (min >= legal.length && max >= legal.length && !o.always) return legal.map(x => x.id);
      }
      const a = yield* ask(p, { t: 'pick', what, why, pub: o.pub || null, options, multi: !!o.multi, min: o.multi ? (o.min || 0) : 1,
        max: o.multi ? Math.min(o.max == null ? legal.length : o.max, legal.length) : 1, skip: o.skip || null, look: o.look || null });
      if (a.t === 'skip') return o.multi ? [] : null;
      return o.multi ? a.ids.slice() : a.id;
    }
    function* hold(h) { yield { hold: h }; }

    /* ================================================================
       Placing people
       ================================================================ */
    function minAt(p, k) {
      const camp = p.camps[k];
      return camp.id === 'juggernaut' && !camp.dead && camp.moves > 0 ? 0 : 1;
    }
    function costIn(p, type, k) {
      const def = D.card(type);
      let c = def.cost;
      if (type === 'holdout' && p.camps[k].dead) c = 0;
      if (campTrait(p, 'oasis') && p.camps[k].id === 'oasis' && peopleIn(p, k) === 0) c -= 1;
      return Math.max(0, c);
    }
    function placeOptions(p, type) {
      const out = [];
      for (let k = 0; k < 3; k++) {
        if (peopleIn(p, k) >= 2) continue;
        const col = p.cols[k];
        for (let at = minAt(p, k); at <= col.length; at++) {
          const front = at === col.length;
          const next = col[at];
          let lab = 'By ' + D.nameOf(p.camps[k].id) + (p.camps[k].dead ? ' (destroyed)' : '');
          if (col.length > 1 || (col.length === 1 && at === 0)) lab += front ? ' — in front' : ' — behind ' + (next.kind === 'camp' ? D.nameOf(next.id) : (next.punk ? 'the punk' : D.nameOf(next.inst)));
          out.push({ id: k + ':' + at, col: k, at, label: lab, cost: type ? costIn(p, type, k) : 0 });
        }
      }
      return out;
    }
    /* The rules (v1.2): no room anywhere, and you may destroy one of your own
       people to make some — or, for a punk, give it up. */
    function* makeRoom(p, why, forfeit) {
      if (roomAnywhere(p)) return true;
      const id = yield* pick(p, 'makeRoom', why, people(p).map(e => tgtOpt(p, e, p)), { skip: forfeit || null, always: true, pub: 'making room in a full column' });
      if (!id) return false;
      const e = findEnt(p, id);
      destroy(p, e, p, 'room');
      return true;
    }
    function karli(p) { return personTrait(p, 'karli_blaze'); }
    function* enterPlay(p, e, k, at, how) {
      const col = p.cols[k];
      col.splice(Math.max(0, Math.min(at, col.length)), 0, e);
      const type = e.punk ? null : T(e.inst);
      e.nr = !(karli(p) || type === 'rescue_team');
      g.tt.pp = (g.tt.pp || 0) + 1;
      log({ t: how === 'punk' ? 'punk' : how === 'flip' ? 'flip' : 'enter', by: p.id, card: e.punk ? null : e.inst, col: k, how: how || 'play' });
      if (e.punk) return;
      /* "When this enters play" traits. */
      if (type === 'wounded_soldier') { draw(p, 1, 'wounded_soldier'); if (colOf(p, e) >= 0) hurt(p, e, p, 'self'); }
      if (type === 'vanguard' || type === 'argo_yesky') yield* gainPunk(p);
      if (type === 'repair_bot') yield* fxRestore(p, { src: e });
      if (type === 'doomsayer') {
        const q = opp(p);
        if (canPushBack(q)) {
          const a = yield* pick(p, 'doomsayer', 'Doomsayer: push all of ' + q.name + '’s events one space back?', [{ id: 'yes', label: 'Push them back' }, { id: 'no', label: 'Leave them' }], { always: true, pub: 'deciding about Doomsayer' });
          if (a === 'yes') { pushBack(q); log({ t: 'pushback', by: p.id, of: q.id }); }
        }
      }
    }
    const newPerson = (inst, punk) => ({ kind: 'person', uid: uid('u'), inst, punk: !!punk, dmg: false, nr: true });
    function* gainPunk(p) {
      if (!(yield* makeRoom(p, 'Every column is full. Destroy one of your people to make room for the punk, or give the punk up.', 'Give up the punk'))) return;
      const where = yield* pick(p, 'place', 'Where does the punk go?', placeOptions(p, null), { pub: 'placing a punk' });
      const o = placeOptions(p, null).find(x => x.id === where);
      const e = newPerson(drawTop(), true);
      yield* enterPlay(p, e, o.col, o.at, 'punk');
    }

    /* ================================================================
       Events and Raiders
       ================================================================ */
    const firstFree = (p, from) => { for (let k = Math.max(0, from); k < 3; k++) if (!p.q[k]) return k; return -1; };
    const zetoFirst = p => personTrait(p, 'zeto_khan') && !(g.tt.evPlayed > 0);
    function canPushBack(q) { return q.q.some((x, k) => x && k < 2 && !q.q[k + 1]); }
    function pushBack(q) { for (let k = 1; k >= 0; k--) if (q.q[k] && !q.q[k + 1]) { q.q[k + 1] = q.q[k]; q.q[k] = null; } }
    const hasEvent = q => q.q.some(Boolean);

    function* resolveEvent(p, inst) {
      if (inst !== 'raiders') g.limbo.push(inst);
      yield* hold({ k: 'event', card: inst, by: p.id });
      log({ t: 'goesoff', by: p.id, card: inst });
      g.tt.ev = true;
      if (inst === 'raiders') {
        g.tt.raid = true;
        const q = opp(p);
        const id = yield* pick(q, 'raided', p.name + '’s Raiders are here: pick one of your camps to take the damage.', liveCamps(q).map(c => tgtOpt(q, c, q)), { pub: 'choosing which camp the Raiders hit' });
        if (id) hurt(q, findEnt(q, id), p, 'raiders');
        return;
      }
      yield* EVT[T(inst)](p);
      g.limbo.splice(g.limbo.indexOf(inst), 1);
      g.disc.push(inst);
    }
    function* raid(p) {
      const at = p.q.indexOf('raiders');
      if (at < 0) {
        const z = zetoFirst(p);
        g.tt.evPlayed = (g.tt.evPlayed || 0) + 1;
        if (z) { log({ t: 'raid', by: p.id, res: 'now' }); return yield* resolveEvent(p, 'raiders'); }
        const k = firstFree(p, D.RAIDERS.slot - 1);
        if (k < 0) { log({ t: 'raid', by: p.id, res: 'stuck' }); return; }
        p.q[k] = 'raiders';
        log({ t: 'raid', by: p.id, res: 'out', slot: k + 1 });
        return;
      }
      if (at === 0) { p.q[0] = null; log({ t: 'raid', by: p.id, res: 'now' }); return yield* resolveEvent(p, 'raiders'); }
      if (p.q[at - 1]) { log({ t: 'raid', by: p.id, res: 'blocked', slot: at + 1 }); return; }
      p.q[at - 1] = 'raiders'; p.q[at] = null;
      log({ t: 'raid', by: p.id, res: 'closer', slot: at });
    }

    /* ================================================================
       Effects (the icons)
       ================================================================ */
    /* Targets for a damage-like effect from p's side. kind: any | person | camp.
       o.any ignores protection; o.dmgOnly only damaged cards. */
    function targets(p, kind, o) {
      o = o || {};
      const q = opp(p);
      const pool = o.any ? allLive(q) : exposed(q, p);
      return pool.filter(e => (kind === 'any' || e.kind === kind) && (!o.dmgOnly || e.dmg));
    }
    function* fxDamage(p, c, kind, o) {
      o = o || {};
      const q = opp(p);
      const list = targets(p, kind || 'any', o);
      const verb = o.verb || (kind === 'person' ? 'Injure' : 'Damage');
      const id = yield* pick(p, kind === 'person' ? 'injure' : 'damage', verb + ' which of ' + q.name + '’s cards?', list.map(e => tgtOpt(q, e, p)), { pub: (kind === 'person' ? 'choosing whom to injure' : 'choosing what to damage') });
      if (!id) { log({ t: 'miss', by: p.id }); return null; }
      const e = findEnt(q, id);
      const res = hurt(q, e, p, kind === 'person' ? 'injure' : 'damage');
      return { e, res, camp: e.kind === 'camp' };
    }
    function restorable(p, c) {
      const out = [];
      for (const e of people(p)) if (e.dmg && (!c || e !== c.src)) out.push(e);
      for (const cp of p.camps) if (cp.dmg && !cp.dead && cp.id !== 'bonfire' && (!c || cp !== c.src)) out.push(cp);
      return out;
    }
    function* fxRestore(p, c, o) {
      o = o || {};
      let list = restorable(p, c);
      if (o.people) list = list.filter(e => e.kind === 'person');
      const id = yield* pick(p, 'restore', o.why || 'Restore which of your cards?', list.map(e => tgtOpt(p, e, p)), { pub: 'choosing what to restore' });
      if (!id) return null;
      const e = findEnt(p, id);
      restoreEnt(p, e, p, !!o.ready);
      return e;
    }
    function* fxDestroyOwn(p, c, why) {
      const id = yield* pick(p, 'destroyOwn', why || 'Destroy which of your people?', people(p).map(e => tgtOpt(p, e, p)), { pub: 'choosing one of their own people to destroy' });
      if (!id) return null;
      const e = findEnt(p, id);
      destroy(p, e, p, 'own');
      return e;
    }
    function water(p, k) { g.water += k || 1; log({ t: 'water', by: p.id, n: k || 1 }); }
    function* icon(p, c, fx) {
      switch (fx) {
        case 'damage': return yield* fxDamage(p, c, 'any');
        case 'injure': return yield* fxDamage(p, c, 'person');
        case 'restore': return yield* fxRestore(p, c);
        case 'draw': return draw(p, 1, 'icon');
        case 'water': return water(p, 1);
        case 'punk': return yield* gainPunk(p);
        case 'raid': return yield* raid(p);
      }
    }

    /* ================================================================
       Events
       ================================================================ */
    const EVT = {
      *uprising(p) { for (let k = 0; k < 3; k++) yield* gainPunk(p); },
      *truce(p) {
        for (const x of g.players) for (const e of people(x)) {
          const k = colOf(x, e);
          x.cols[k].splice(x.cols[k].indexOf(e), 1);
          x.hand.push(e.inst);
          log({ t: 'tohand', by: p.id, of: x.id, card: e.punk ? null : e.inst, punk: !!e.punk });
        }
      },
      *strafe(p) { const q = opp(p); for (const e of targets(p, 'person')) hurt(q, e, p, 'injure'); },
      *radiation(p) { for (const x of g.players) for (const e of people(x)) hurt(x, e, p, 'injure'); },
      *napalm(p) {
        const q = opp(p);
        const cols = [0, 1, 2].filter(k => peopleIn(q, k) > 0);
        const id = yield* pick(p, 'column', 'Napalm: which of ' + q.name + '’s columns burns?', cols.map(k => ({ id: String(k), label: 'By ' + D.nameOf(q.camps[k].id), sub: q.cols[k].filter(e => e.kind === 'person').map(entName).join(', '), col: k })), { pub: 'choosing a column for the Napalm' });
        if (id == null) return;
        for (const e of q.cols[+id].filter(x => x.kind === 'person')) destroy(q, e, p, 'napalm');
      },
      *interrogate(p) {
        const got = draw(p, 4, 'interrogate');
        const n = Math.min(3, got.length);
        const ids = yield* pick(p, 'discard', 'Interrogate: discard three of the four you drew.', got.map(c => ({ id: c, card: c, label: D.nameOf(c) })), { multi: true, min: n, max: n, pub: 'choosing which three to discard' });
        discard(p, ids, 'interrogate');
      },
      *high_ground(p) {
        const mine = people(p);
        for (const e of mine) { const k = colOf(p, e); p.cols[k].splice(p.cols[k].indexOf(e), 1); g.limbo.push(e.inst); }
        for (const e of mine) {
          const opts = [0, 1, 2].filter(k => peopleIn(p, k) < 2).map(k => ({ id: String(k), label: 'By ' + D.nameOf(p.camps[k].id) + (p.camps[k].dead ? ' (destroyed)' : ''), sub: p.cols[k].filter(x => x.kind === 'person').length ? 'in front of ' + p.cols[k].filter(x => x.kind === 'person').map(entName).join(', ') : 'an empty column' }));
          const id = yield* pick(p, 'rearrange', 'High Ground: where does ' + (e.punk ? 'your punk' : D.nameOf(e.inst)) + (e.dmg ? ' (damaged)' : '') + ' go?', opts, { pub: 'rearranging their people' });
          p.cols[+id].push(e);
          g.limbo.splice(g.limbo.indexOf(e.inst), 1);
        }
        g.tt.hg = p.i;
        log({ t: 'highground', by: p.id });
      },
      *famine(p) {
        for (const x of [p, opp(p)]) {
          const list = people(x);
          if (list.length <= 1) continue;
          const keep = yield* pick(x, 'keep', 'Famine: which ONE of your people survives?', list.map(e => tgtOpt(x, e, x)), { pub: 'choosing who survives the Famine' });
          for (const e of list) if (e.uid !== keep) destroy(x, e, p, 'famine');
        }
      },
      *bombardment(p) {
        const q = opp(p);
        for (const c of liveCamps(q)) hurt(q, c, p, 'damage');
        const k = deadCamps(q);
        if (k) draw(p, k, 'bombardment');
      },
      *banish(p) {
        const q = opp(p);
        const id = yield* pick(p, 'destroy', 'Banish: destroy which of ' + q.name + '’s people?', people(q).map(e => tgtOpt(q, e, p)), { pub: 'choosing whom to banish' });
        if (id) destroy(q, findEnt(q, id), p, 'banish');
      }
    };

    /* ================================================================
       Abilities — every card's, by its type
       c = { p, q, src (the card using it), type }
       need(c) -> a reason it cannot be used now, or null
       ================================================================ */
    const anyT = (c, kind, o) => targets(c.p, kind, o).length ? null : (kind === 'camp' ? 'No camp of theirs is open to it.' : kind === 'person' ? 'No enemy is open to it.' : 'Nothing of theirs is open to it.');
    const needRestore = c => restorable(c.p, c).length ? null : 'Nothing of yours is damaged.';
    const needOwn = c => people(c.p).length ? null : 'You have no people to give up.';
    const dmg = cost => ({ cost, need: c => anyT(c, 'any'), *run(c) { yield* fxDamage(c.p, c, 'any'); } });
    const inj = cost => ({ cost, need: c => anyT(c, 'person'), *run(c) { yield* fxDamage(c.p, c, 'person'); } });
    const rst = cost => ({ cost, need: needRestore, *run(c) { yield* fxRestore(c.p, c); } });
    const rad = cost => ({ cost, need: () => null, *run(c) { yield* raid(c.p); } });
    function selfHurt(c) { if (c.src && ownerOf(c.src) === c.p) hurt(c.p, c.src, c.p, 'self'); }

    const ABIL = {
      zeto_khan: [{ cost: 1, need: () => null, *run(c) {
        draw(c.p, 3, 'zeto');
        const hand = c.p.hand.filter(x => x !== 'silo');
        const n = Math.min(3, hand.length);
        const ids = yield* pick(c.p, 'discard', 'Discard three cards (not the Water Silo).', hand.map(x => ({ id: x, card: x, label: D.nameOf(x) })), { multi: true, min: n, max: n, pub: 'choosing three cards to discard' });
        discard(c.p, ids, 'zeto');
      } }],
      vera_vosh: [inj(1)],
      molgur_stang: [{ cost: 1, need: c => liveCamps(c.q).length ? null : 'No camp left.', *run(c) {
        const id = yield* pick(c.p, 'destroy', 'Destroy which of ' + c.q.name + '’s camps?', liveCamps(c.q).map(e => tgtOpt(c.q, e, c.p)), { pub: 'choosing a camp to destroy' });
        if (id) destroy(c.q, findEnt(c.q, id), c.p, 'destroy');
      } }],
      magnus_karv: [{ cost: 2, need: c => [0, 1, 2].some(k => c.q.cols[k].some(e => !(e.kind === 'camp' && e.dead))) ? null : 'Nothing to hit.', *run(c) {
        const q = c.q;
        const cols = [0, 1, 2].filter(k => q.cols[k].some(e => !(e.kind === 'camp' && e.dead)));
        const id = yield* pick(c.p, 'column', 'Damage every card in which of ' + q.name + '’s columns?', cols.map(k => ({ id: String(k), col: k, label: 'By ' + D.nameOf(q.camps[k].id) + (q.camps[k].dead ? ' (destroyed)' : ''), sub: q.cols[k].filter(e => !(e.kind === 'camp' && e.dead)).map(entName).join(', ') })), { pub: 'choosing a column' });
        if (id == null) return;
        for (const e of q.cols[+id].slice().reverse()) if (ownerOf(e) === q) hurt(q, e, c.p, 'damage');
      } }],
      karli_blaze: [dmg(1)],
      argo_yesky: [dmg(1)],
      wounded_soldier: [dmg(1)],
      vigilante: [inj(1)],
      vanguard: [{ cost: 1, need: c => anyT(c, 'any'), *run(c) {
        yield* fxDamage(c.p, c, 'any');
        const q = c.q, p = c.p;
        const list = exposed(p, q);
        const id = yield* pick(q, 'hitback', 'Vanguard: damage one of ' + p.name + '’s cards in return.', list.map(e => tgtOpt(p, e, q)), { pub: 'hitting back at the Vanguard’s side' });
        if (id) hurt(p, findEnt(p, id), q, 'damage');
      } }],
      sniper: [{ cost: 2, need: c => anyT(c, 'any', { any: true }), *run(c) { yield* fxDamage(c.p, c, 'any', { any: true }); } }],
      scout: [rad(1)],
      scientist: [{ cost: 1, need: () => null, *run(c) {
        const got = [];
        for (let k = 0; k < 3; k++) { const x = drawTop(); g.disc.push(x); got.push(x); }
        log({ t: 'mill', by: c.p.id, cards: got.slice() });
        const opts = got.map(x => ({ id: x, card: x, label: D.nameOf(x) + ' — ' + D.ICONS[D.card(x).junk], fx: D.card(x).junk }));
        const id = yield* pick(c.p, 'junkOf', 'Use the junk effect of one of these?', opts, { skip: 'None of them', always: true, pub: 'choosing a junk effect' });
        if (id) { log({ t: 'borrow', by: c.p.id, card: id, fx: D.card(id).junk }); yield* icon(c.p, c, D.card(id).junk); }
      } }],
      rescue_team: [{ cost: 0, need: () => null, *run(c) {
        const p = c.p;
        const id = yield* pick(p, 'toHand', 'Pick up which of your people?', people(p).map(e => tgtOpt(p, e, p)), { pub: 'picking a person back up' });
        if (!id) return;
        const e = findEnt(p, id);
        const k = colOf(p, e);
        p.cols[k].splice(p.cols[k].indexOf(e), 1);
        p.hand.push(e.inst);
        log({ t: 'tohand', by: p.id, of: p.id, card: e.punk ? null : e.inst, punk: !!e.punk });
      } }],
      repair_bot: [rst(2)],
      rabble_rouser: [{ cost: 1, need: () => null, *run(c) { yield* gainPunk(c.p); } },
        { cost: 1, need: c => punks(c.p) ? anyT(c, 'any') : 'You have no punk in play.', *run(c) { yield* fxDamage(c.p, c, 'any'); } }],
      pyromaniac: [{ cost: 1, need: c => anyT(c, 'camp'), *run(c) { yield* fxDamage(c.p, c, 'camp'); } }],
      mutant: [{ cost: 0, need: c => (anyT(c, 'any') && needRestore(c)) ? 'Nothing to damage and nothing to restore.' : null, *run(c) {
        const p = c.p;
        const canD = !anyT(c, 'any'), canR = !needRestore(c);
        const opts = [];
        if (canD) opts.push({ id: 'd', label: 'Damage' });
        if (canR) opts.push({ id: 'r', label: 'Restore' });
        if (canD && canR) opts.push({ id: 'dr', label: 'Damage and restore' });
        const how = yield* pick(p, 'mutant', 'Mutant: damage, restore, or both?', opts, { pub: 'choosing what the Mutant does' });
        if (how && how.indexOf('d') >= 0) yield* fxDamage(p, c, 'any');
        if (how && how.indexOf('r') >= 0) yield* fxRestore(p, c);
        selfHurt(c);
      } }],
      muse: [{ cost: 0, need: () => null, *run(c) { water(c.p, 1); } }],
      mimic: [{ cost: null, mimic: true, need: c => mimicOptions(c).some(o => !o.bad) ? null : 'Nothing to copy that you can pay for.', *run(c) {
        const opts = mimicOptions(c);
        const id = yield* pick(c.p, 'copy', 'Mimic: copy which ability?', opts, { pub: 'choosing an ability to copy' });
        if (!id) return;
        const o = opts.find(x => x.id === id);
        const ab = o.ab;
        const cost = costOf(ab, c);
        g.water -= cost;
        log({ t: 'copy', by: c.p.id, card: o.card, k: o.k, cost });
        yield* ab.run(Object.assign({}, c, { type: o.card }));
      } }],
      looter: [{ cost: 2, need: c => anyT(c, 'any'), *run(c) {
        const r = yield* fxDamage(c.p, c, 'any');
        if (r && r.camp) draw(c.p, 1, 'looter');
      } }],
      holdout: [dmg(1)],
      gunner: [{ cost: 2, need: c => anyT(c, 'person'), *run(c) { for (const e of targets(c.p, 'person')) hurt(c.q, e, c.p, 'injure'); } }],
      exterminator: [{ cost: 1, need: c => people(c.q).some(e => e.dmg) ? null : 'No enemy is damaged.', *run(c) { for (const e of people(c.q).filter(e => e.dmg)) destroy(c.q, e, c.p, 'destroy'); } }],
      doomsayer: [{ cost: 1, need: c => hasEvent(c.q) ? anyT(c, 'any') : 'The opponent has no event in their queue.', *run(c) { yield* fxDamage(c.p, c, 'any'); } }],
      cult_leader: [{ cost: 0, need: needOwn, *run(c) { yield* fxDestroyOwn(c.p, c, 'Cult Leader: destroy which of your people (he may choose himself)?'); yield* fxDamage(c.p, c, 'any'); } }],
      assassin: [{ cost: 2, need: c => anyT(c, 'person'), *run(c) {
        const q = c.q;
        const id = yield* pick(c.p, 'destroy', 'Destroy which of ' + q.name + '’s people?', targets(c.p, 'person').map(e => tgtOpt(q, e, c.p)), { pub: 'choosing a target for the Assassin' });
        if (id) destroy(q, findEnt(q, id), c.p, 'destroy');
      } }],

      /* ---------------- camps ---------------- */
      watchtower: [{ cost: 1, need: c => g.tt.ev ? anyT(c, 'any') : 'No event has gone off this turn.', *run(c) { yield* fxDamage(c.p, c, 'any'); } }],
      warehouse: [{ cost: 0, need: c => c.p.hand.some(x => x !== 'silo') ? null : 'You have no cards to discard.', *run(c) {
        selfHurt(c);
        const hand = c.p.hand.filter(x => x !== 'silo');
        const ids = yield* pick(c.p, 'discard', 'Discard one or more cards — you draw that many plus one.', hand.map(x => ({ id: x, card: x, label: D.nameOf(x) })), { multi: true, min: 1, max: hand.length, always: true, pub: 'choosing cards to discard' });
        discard(c.p, ids, 'warehouse');
        draw(c.p, ids.length + 1, 'warehouse');
      } }],
      victory_totem: [inj(2), rad(2)],
      transplant_lab: [{ cost: 1, need: c => (g.tt.pp || 0) >= 2 ? needRestore(c) : 'Put two people into play this turn first.', *run(c) { yield* fxRestore(c.p, c); } }],
      training_camp: [{ cost: 1, need: c => punks(c.p) ? null : 'You have no punk.', *run(c) {
        const p = c.p;
        const id = yield* pick(p, 'flip', 'Turn which punk face up?', people(p).filter(e => e.punk).map(e => tgtOpt(p, e, p)), { pub: 'choosing a punk to turn over' });
        const e = findEnt(p, id);
        g.flipN++;
        const def = D.card(e.inst);
        log({ t: 'reveal', by: p.id, card: e.inst });
        if (def.kind === 'person') {
          const k = colOf(p, e), at = p.cols[k].indexOf(e);
          p.cols[k].splice(at, 1);
          e.punk = false;
          yield* enterPlay(p, e, k, at, 'flip');
          if (!karli(p)) e.nr = true;
        } else {
          const k = colOf(p, e);
          p.cols[k].splice(p.cols[k].indexOf(e), 1);
          g.disc.push(e.inst);
          yield* gainPunk(p);
          water(p, 1);
        }
      } }],
      supply_depot: [{ cost: 2, need: () => null, *run(c) {
        const got = draw(c.p, 2, 'supply_depot');
        const id = yield* pick(c.p, 'discard', 'Discard one of the two you drew.', got.map(x => ({ id: x, card: x, label: D.nameOf(x) })), { always: got.length > 1, pub: 'choosing a card to discard' });
        if (id) discard(c.p, [id], 'supply_depot');
      } }],
      scud_launcher: [{ cost: 1, need: () => null, *run(c) {
        const q = c.q;
        const id = yield* pick(q, 'scud', c.p.name + '’s Scud Launcher: pick one of your cards to take a damage.', allLive(q).map(e => tgtOpt(q, e, q)), { pub: 'choosing what the Scud hits' });
        if (id) hurt(q, findEnt(q, id), c.p, 'damage');
      } }],
      scavenger_camp: [rad(2), { cost: 1, need: c => g.tt.raid ? needRestore(c) : 'Your Raiders have not gone off this turn.', *run(c) { yield* fxRestore(c.p, c); } }],
      resonator: [{ cost: 2, need: c => anyT(c, 'any', { dmgOnly: true }), *run(c) {
        const q = c.q;
        const id = yield* pick(c.p, 'destroy', 'Destroy which damaged card of ' + q.name + '’s?', targets(c.p, 'any', { dmgOnly: true }).map(e => tgtOpt(q, e, c.p)), { pub: 'choosing what the Resonator shatters' });
        if (id) destroy(q, findEnt(q, id), c.p, 'destroy');
      } }],
      reactor: [{ cost: 2, need: () => null, *run(c) {
        killCamp(c.p, c.src, c.p);
        for (const x of g.players) for (const e of people(x)) destroy(x, e, c.p, 'reactor');
      } }],
      railgun: [dmg(2)],
      pillbox: [{ cost: c => Math.max(0, 3 - deadCamps(c.p)), need: c => anyT(c, 'any'), *run(c) { yield* fxDamage(c.p, c, 'any'); } }],
      parachute_base: [{ cost: 0, need: c => parachuteOptions(c).length ? null : 'No person in your hand you can pay for, with its ability.', *run(c) {
        const p = c.p;
        const list = parachuteOptions(c);
        const inst = yield* pick(p, 'parachute', 'Parachute in which person?', list.map(x => ({ id: x, card: x, label: D.nameOf(x) + ' — ' + D.card(x).cost + ' water to play' })), { pub: 'choosing a person to drop in' });
        if (!inst) return;
        if (!(yield* makeRoom(p, 'Every column is full. Destroy one of your people to make room.'))) return;
        const places = placeOptions(p, T(inst)).filter(o => o.cost <= g.water);
        const at = yield* pick(p, 'place', 'Where does ' + D.nameOf(inst) + ' land?', places, { pub: 'choosing where to land' });
        const o = places.find(x => x.id === at);
        if (!o) return;
        g.water -= o.cost;
        p.hand.splice(p.hand.indexOf(inst), 1);
        const e = newPerson(inst, false);
        yield* enterPlay(p, e, o.col, o.at, 'parachute');
        if (colOf(p, e) < 0) return;
        const c2 = { p, q: c.q, src: e, type: T(inst) };
        const abs = abilitiesOf(p, e).map((ab, k) => ({ ab, k }));
        const opts = abs.map(x => ({ id: String(x.k), label: D.card(x.ab.from || T(inst)).name + ': ' + abText(x.ab, x.k, T(inst)), cost: costOf(x.ab, c2), bad: costOf(x.ab, c2) > g.water ? 'Not enough water.' : x.ab.need(c2) }));
        const k = yield* pick(p, 'useNow', 'Use which of its abilities now?', opts, { pub: 'choosing the ability to use' });
        if (k != null) {
          const x = abs.find(y => String(y.k) === k);
          g.water -= costOf(x.ab, c2);
          log({ t: 'use', by: p.id, card: x.ab.from || T(inst), k: x.ab.from ? 0 : x.k, via: 'parachute_base' });
          yield* x.ab.run(c2);
        }
        if (colOf(p, e) >= 0) hurt(p, e, p, 'self');
      } }],
      outpost: [rad(2), rst(2)],
      omen_clock: [{ cost: 1, need: () => omenOptions().length ? null : 'No event can move forward.', *run(c) {
        const opts = omenOptions();
        const id = yield* pick(c.p, 'advance', 'Move which event one space forward?', opts, { pub: 'choosing an event to move' });
        if (!id) return;
        const o = opts.find(x => x.id === id);
        const x = P(o.of);
        const inst = x.q[o.k];
        if (o.k === 0) { x.q[0] = null; log({ t: 'advance', by: c.p.id, of: x.id, card: inst, now: true }); yield* resolveEvent(x, inst); }
        else { x.q[o.k - 1] = inst; x.q[o.k] = null; log({ t: 'advance', by: c.p.id, of: x.id, card: inst, slot: o.k }); }
      } }],
      the_octagon: [{ cost: 1, need: needOwn, *run(c) {
        const e = yield* fxDestroyOwn(c.p, c, 'The Octagon: destroy which of your people?');
        if (!e) return;
        const q = c.q;
        const id = yield* pick(q, 'destroyOwn', 'The Octagon: you must destroy one of your people.', people(q).map(x => tgtOpt(q, x, q)), { pub: 'choosing one of their own people to destroy' });
        if (id) destroy(q, findEnt(q, id), q, 'octagon');
      } }],
      obelisk: [],
      oasis: [],
      nest_of_spies: [{ cost: 1, need: c => (g.tt.pp || 0) >= 2 ? anyT(c, 'any') : 'Put two people into play this turn first.', *run(c) { yield* fxDamage(c.p, c, 'any'); } }],
      mulcher: [{ cost: 0, need: needOwn, *run(c) { yield* fxDestroyOwn(c.p, c); draw(c.p, 1, 'mulcher'); } }],
      mercenary_camp: [{ cost: 2, need: () => null, *run(c) {
        const q = c.q;
        const hand = q.hand.filter(x => x !== 'silo');
        const opts = allLive(q).map(e => tgtOpt(q, e, q, { label: 'Destroy ' + label(q, e, q).replace(/^Your /, 'your ') }));
        opts.push({ id: 'discard', label: 'Discard two cards instead', bad: hand.length >= 2 ? null : 'You need two cards (not the Water Silo).' });
        const id = yield* pick(q, 'mercenary', c.p.name + '’s Mercenary Camp: destroy one of your cards — or discard two.', opts, { pub: 'answering the Mercenary Camp' });
        if (id === 'discard') {
          const ids = yield* pick(q, 'discard', 'Discard which two?', hand.map(x => ({ id: x, card: x, label: D.nameOf(x) })), { multi: true, min: 2, max: 2, pub: 'choosing two cards to discard' });
          discard(q, ids, 'mercenary');
        } else if (id) destroy(q, findEnt(q, id), c.p, 'mercenary');
      } }],
      labor_camp: [{ cost: 0, need: needOwn, *run(c) { yield* fxDestroyOwn(c.p, c); yield* fxRestore(c.p, c); } }],
      juggernaut: [{ cost: 1, need: () => null, *run(c) {
        const p = c.p, j = c.src;
        const k = colOf(p, j), col = p.cols[k];
        if ((j.moves || 0) < 2) {
          const i = col.indexOf(j);
          if (i < col.length - 1) { col[i] = col[i + 1]; col[i + 1] = j; }
          j.moves = (j.moves || 0) + 1;
          log({ t: 'roll', by: p.id, moves: j.moves });
          return;
        }
        col.splice(col.indexOf(j), 1); col.unshift(j);
        j.moves = 0;
        log({ t: 'roll', by: p.id, moves: 3 });
        const q = c.q;
        const id = yield* pick(q, 'loseCamp', 'The Juggernaut: destroy one of your own camps.', liveCamps(q).map(e => tgtOpt(q, e, q)), { pub: 'choosing a camp for the Juggernaut' });
        if (id) destroy(q, findEnt(q, id), p, 'juggernaut');
      } }],
      garage: [rad(1)],
      construction_yard: [{ cost: 1, need: c => c.src && c.src.dmg ? 'It is damaged.' : (deadCamps(c.p) ? null : 'None of your camps is destroyed.'), *run(c) {
        const p = c.p;
        const id = yield* pick(p, 'rebuild', 'Bring back which destroyed camp?', p.camps.filter(x => x.dead).map(x => ({ id: x.uid, label: D.nameOf(x.id) })), { pub: 'choosing a camp to rebuild' });
        if (!id) return;
        const x = p.camps.find(y => y.uid === id);
        x.dead = false; x.dmg = false; x.used = true;
        log({ t: 'rebuild', by: p.id, card: x.id });
        killCamp(p, c.src, p);
      } }],
      command_post: [{ cost: c => Math.max(0, 3 - punks(c.p)), need: c => anyT(c, 'any'), *run(c) { yield* fxDamage(c.p, c, 'any'); } }],
      catapult: [{ cost: 2, need: c => needOwn(c) || anyT(c, 'any', { any: true }), *run(c) { yield* fxDamage(c.p, c, 'any', { any: true }); yield* fxDestroyOwn(c.p, c, 'Catapult: now destroy one of your people.'); } }],
      cannon: [{ cost: 1, need: c => anyT(c, 'any'), *run(c) { yield* fxDamage(c.p, c, 'any'); selfHurt(c); } }],
      cache: [{ cost: 0, need: () => null, *run(c) {
        selfHurt(c);
        const opts = [{ id: 'draw', label: 'Draw a card' }, { id: 'restore', label: 'Restore', bad: needRestore(c) }, { id: 'punk', label: 'Gain a punk' }];
        const id = yield* pick(c.p, 'cache', 'Cache: draw, restore or gain a punk?', opts, { always: true, pub: 'choosing what the Cache gives' });
        if (id) yield* icon(c.p, c, id);
      } }],
      bonfire: [{ cost: 0, need: () => null, *run(c) {
        selfHurt(c);
        const list = restorable(c.p, c);
        const ids = yield* pick(c.p, 'restoreMany', 'Bonfire: restore as many of your cards as you like.', list.map(e => tgtOpt(c.p, e, c.p)), { multi: true, min: 0, always: true, pub: 'choosing what to restore' });
        for (const id of ids) { const e = findEnt(c.p, id); if (e) restoreEnt(c.p, e, c.p, false); }
      } }],
      blood_bank: [{ cost: 0, need: needOwn, *run(c) { yield* fxDestroyOwn(c.p, c); water(c.p, 1); } }],
      atomic_garden: [{ cost: 2, need: c => people(c.p).some(e => e.dmg) ? null : 'None of your people is damaged.', *run(c) { yield* fxRestore(c.p, c, { people: true, ready: true, why: 'Restore which damaged person? They are ready again at once.' }); } }],
      arcade: [{ cost: 1, need: c => people(c.p).length <= 1 ? null : 'You have more than one person in play.', *run(c) { yield* gainPunk(c.p); } }],
      adrenaline_lab: [{ cost: 0, need: c => adrenalineOptions(c).some(o => !o.bad) ? null : 'None of your damaged people has an ability you can pay for.', *run(c) {
        const opts = adrenalineOptions(c);
        const id = yield* pick(c.p, 'adrenaline', 'Use which damaged person’s ability?', opts, { pub: 'choosing whom to jolt' });
        if (!id) return;
        const o = opts.find(x => x.id === id);
        const e = findEnt(c.p, o.uid);
        const c2 = { p: c.p, q: c.q, src: e, type: o.card };
        g.water -= costOf(o.ab, c2);
        log({ t: 'use', by: c.p.id, card: o.card, k: o.k, via: 'adrenaline_lab' });
        yield* o.ab.run(c2);
        if (colOf(c.p, e) >= 0) destroy(c.p, e, c.p, 'adrenaline');
      } }]
    };

    /* Every ability a card has right now. A punk has none — unless Argo
       lends every one of your people his. */
    function abilitiesOf(p, e) {
      const out = [];
      if (e.kind === 'camp') { if (!e.dead) (ABIL[e.id] || []).forEach(ab => out.push(ab)); return out; }
      const type = e.punk ? null : T(e.inst);
      if (type) (ABIL[type] || []).forEach(ab => out.push(ab));
      if (personTrait(p, 'argo_yesky') && type !== 'argo_yesky') out.push(Object.assign({}, ABIL.argo_yesky[0], { from: 'argo_yesky' }));
      return out;
    }
    function costOf(ab, c) { return typeof ab.cost === 'function' ? ab.cost(c) : (ab.cost || 0); }
    function abText(ab, k, type) {
      const def = D.card(ab.from || type);
      const a = def && def.ab && def.ab[ab.from ? 0 : k];
      return a ? a.text : '';
    }
    function mimicOptions(c) {
      const out = [];
      const add = (x, e, mine) => abilitiesOf(x, e).forEach((ab, k) => {
        if (ab.mimic) return;
        const card = ab.from || typeOfEnt(e);
        const c2 = Object.assign({}, c, { type: card });
        const cost = costOf(ab, c2);
        const bad = cost > g.water ? 'Not enough water.' : ab.need(c2);
        out.push({ id: e.uid + ':' + k, card, k: ab.from ? 0 : k, ab, cost, label: (mine ? 'Your ' : x.name + '’s ') + (e.punk ? 'punk' : D.nameOf(e.inst)) + ' — ' + abText(ab, k, card), sub: cost + ' water', bad });
      });
      for (const e of people(c.p)) if (e !== c.src && isReady(e)) add(c.p, e, true);
      for (const e of people(c.q)) if (!e.dmg) add(c.q, e, false);
      return out;
    }
    function adrenalineOptions(c) {
      const out = [];
      for (const e of people(c.p)) {
        if (!e.dmg) continue;
        abilitiesOf(c.p, e).forEach((ab, k) => {
          if (ab.mimic) return;
          const card = ab.from || typeOfEnt(e);
          const c2 = { p: c.p, q: c.q, src: e, type: card };
          const cost = costOf(ab, c2);
          out.push({ id: e.uid + ':' + k, uid: e.uid, card, k: ab.from ? 0 : k, ab, cost, label: (e.punk ? 'Your punk' : D.nameOf(e.inst)) + ' — ' + abText(ab, k, card), sub: cost + ' water', bad: cost > g.water ? 'Not enough water.' : ab.need(c2) });
        });
      }
      return out;
    }
    function parachuteOptions(c) {
      const p = c.p;
      const out = [];
      const room = roomAnywhere(p) || people(p).length > 0;
      if (!room) return out;
      for (const inst of p.hand) {
        const def = D.card(inst);
        if (!def || def.kind !== 'person') continue;
        const minPlace = Math.min.apply(null, [0, 1, 2].map(k => costIn(p, T(inst), k)));
        const minAb = Math.min.apply(null, (ABIL[T(inst)] || []).map(ab => ab.mimic ? 0 : (typeof ab.cost === 'function' ? 0 : ab.cost)).concat([99]));
        if (minPlace + minAb <= g.water && out.indexOf(inst) < 0) out.push(inst);
      }
      return out;
    }
    function omenOptions() {
      const out = [];
      for (const x of g.players) x.q.forEach((inst, k) => {
        if (!inst) return;
        if (k === 0 || !x.q[k - 1]) out.push({ id: x.id + ':' + k, of: x.id, k, card: inst, label: x.name + '’s ' + D.nameOf(inst) + (k === 0 ? ' — goes off now' : ' — to space ' + k) });
      });
      return out;
    }

    /* ================================================================
       The turn menu — one pure function, used by the phone, the house and
       the answer check alike, so nothing offered is ever refused.
       ================================================================ */
    function menu(p) {
      const w = g.water;
      const full = !roomAnywhere(p);
      const hand = p.hand.map(inst => {
        const def = D.card(inst);
        const row = { card: inst, kind: def.kind };
        if (inst === 'silo') { row.junk = { ok: true, fx: 'water' }; return row; }
        row.junk = { ok: true, fx: def.junk, note: junkNote(p, def.junk) };
        if (def.kind === 'person') {
          if (full) {
            /* The column you clear is the only one with room: price it there. */
            const destroy = people(p).map(e => {
              const k = colOf(p, e), i = p.cols[k].indexOf(e);
              p.cols[k].splice(i, 1);
              const cost = costIn(p, T(inst), k);
              p.cols[k].splice(i, 0, e);
              return { uid: e.uid, label: label(p, e, p), cost };
            });
            const okd = destroy.filter(d => d.cost <= w);
            const cost = Math.min.apply(null, destroy.map(d => d.cost));
            row.play = { ok: okd.length > 0, why: okd.length ? null : 'Costs ' + cost + ' water.', cost, full: true, destroy: okd };
          } else {
            const places = placeOptions(p, T(inst));
            const ok = places.some(o => o.cost <= w);
            row.play = { ok, why: ok ? null : 'Costs ' + Math.min.apply(null, places.map(o => o.cost)) + ' water.', cost: Math.min.apply(null, places.map(o => o.cost)), places };
          }
        } else if (def.kind === 'event') {
          const z = zetoFirst(p);
          const slot = z ? 0 : def.slot;
          const k = slot === 0 ? -1 : firstFree(p, slot - 1);
          const ok = def.cost <= w && (slot === 0 || k >= 0);
          row.play = { ok, why: def.cost > w ? 'Costs ' + def.cost + ' water.' : (ok ? null : 'Your event queue has no room for it.'), cost: def.cost, slot: slot === 0 ? 0 : k + 1, now: slot === 0 };
        }
        return row;
      });
      const use = [];
      const ents = [];
      p.cols.forEach(col => col.forEach(e => ents.push(e)));
      for (const e of ents) {
        if (e.kind === 'camp' && e.dead) continue;
        const abs = abilitiesOf(p, e);
        abs.forEach((ab, k) => {
          const c = { p, q: opp(p), src: e, type: ab.from || typeOfEnt(e) };
          const cost = costOf(ab, c);
          let why = null;
          if (!isReady(e)) why = e.kind === 'camp' ? 'Already used this turn.' : (e.dmg ? 'Damaged people are not ready.' : 'Not ready this turn.');
          else if (!ab.mimic && cost > w) why = 'Costs ' + cost + ' water.';
          else why = ab.need(c);
          use.push({ uid: e.uid, k, card: ab.from || typeOfEnt(e), camp: e.kind === 'camp', punk: !!e.punk, name: ab.from ? (e.punk ? 'Your punk (Argo’s gift)' : D.nameOf(e.inst) + ' (Argo’s gift)') : entName(e),
            cost: ab.mimic ? null : cost, ok: !why, why, text: abText(ab, k, ab.from || typeOfEnt(e)) });
        });
      }
      return {
        water: w, hand, use, full,
        draw: { ok: w >= D.START.drawCost, why: w >= D.START.drawCost ? null : 'Costs 2 water.' },
        silo: { ok: p.silo && w >= D.START.siloCost, why: !p.silo ? 'The Water Silo is already in your hand.' : (w >= 1 ? null : 'Costs 1 water.') }
      };
    }
    function junkNote(p, fx) {
      const q = opp(p);
      if (fx === 'damage' && !exposed(q, p).length) return 'nothing to hit — it would do nothing';
      if (fx === 'injure' && !exposed(q, p).some(e => e.kind === 'person')) return 'no enemy to hit — it would do nothing';
      if (fx === 'restore' && !restorable(p, null).length) return 'nothing damaged — it would do nothing';
      return null;
    }
    g.menu = id => { const p = P(id); return p ? menu(p) : null; };

    function turnCheck(p, a) {
      const m = menu(p);
      switch (a.t) {
        case 'end': return yes();
        case 'draw': return m.draw.ok ? yes() : no(m.draw.why);
        case 'silo': return m.silo.ok ? yes() : no(m.silo.why);
        case 'junk': {
          const r = m.hand.find(h => h.card === a.card);
          return r ? yes() : no('That card is not in your hand.');
        }
        case 'play': {
          const r = m.hand.find(h => h.card === a.card);
          if (!r || !r.play) return no('You cannot play that.');
          if (r.kind === 'event') return r.play.ok ? yes() : no(r.play.why);
          if (r.play.full) {
            if (!r.play.ok) return no(r.play.why);
            if (!r.play.destroy.some(d => d.uid === a.destroy)) return no('Every column is full: choose one of your people to destroy first.');
            return yes();
          }
          const o = r.play.places.find(x => x.col === +a.col && x.at === +a.at);
          if (!o) return no('Choose where it goes.');
          if (o.cost > m.water) return no('Costs ' + o.cost + ' water there.');
          return yes();
        }
        case 'use': {
          const u = m.use.find(x => x.uid === a.uid && x.k === +a.k);
          if (!u) return no('That card has no such ability.');
          return u.ok ? yes() : no(u.why);
        }
      }
      return no('That is not something you can do now.');
    }
    function* doTurnAction(p, a) {
      switch (a.t) {
        case 'draw':
          g.water -= D.START.drawCost;
          log({ t: 'buy', by: p.id });
          draw(p, 1, 'buy');
          return;
        case 'silo':
          g.water -= D.START.siloCost;
          p.silo = false; p.hand.push('silo');
          log({ t: 'silo', by: p.id });
          return;
        case 'junk': {
          const def = D.card(a.card);
          const i = p.hand.indexOf(a.card);
          p.hand.splice(i, 1);
          if (a.card === 'silo') p.silo = true; else g.disc.push(a.card);
          log({ t: 'junk', by: p.id, card: a.card, fx: def.junk });
          return yield* icon(p, { p, q: opp(p), src: null }, def.junk);
        }
        case 'play': {
          const def = D.card(a.card);
          if (def.kind === 'event') {
            const z = zetoFirst(p);
            g.tt.evPlayed = (g.tt.evPlayed || 0) + 1;
            g.water -= def.cost;
            p.hand.splice(p.hand.indexOf(a.card), 1);
            const slot = z ? 0 : def.slot;
            if (slot === 0) { log({ t: 'event', by: p.id, card: a.card, now: true, zeto: z && def.slot > 0 }); return yield* resolveEvent(p, a.card); }
            const k = firstFree(p, slot - 1);
            p.q[k] = a.card;
            log({ t: 'event', by: p.id, card: a.card, slot: k + 1 });
            return;
          }
          let col = +a.col, at = +a.at;
          if (a.destroy) {
            const e = findEnt(p, a.destroy);
            destroy(p, e, p, 'room');
            const places = placeOptions(p, T(a.card)).filter(o => o.cost <= g.water);
            const id = yield* pick(p, 'place', 'Where does ' + D.nameOf(a.card) + ' go?', places, { pub: 'choosing where to play a person' });
            const o = places.find(x => x.id === id);
            col = o.col; at = o.at;
          }
          g.water -= costIn(p, T(a.card), col);
          p.hand.splice(p.hand.indexOf(a.card), 1);
          return yield* enterPlay(p, newPerson(a.card, false), col, at, 'play');
        }
        case 'use': {
          const e = findEnt(p, a.uid);
          const ab = abilitiesOf(p, e)[+a.k];
          const c = { p, q: opp(p), src: e, type: ab.from || typeOfEnt(e) };
          const cost = ab.mimic ? 0 : costOf(ab, c);
          g.water -= cost;
          /* Vera Vosh: the first card used each turn stays ready. */
          const vera = personTrait(p, 'vera_vosh') && !(g.tt.uses > 0);
          g.tt.uses = (g.tt.uses || 0) + 1;
          if (!vera) { if (e.kind === 'camp') e.used = true; else e.nr = true; }
          log({ t: 'use', by: p.id, card: ab.from || typeOfEnt(e), k: ab.from ? 0 : +a.k, cost, punk: !!e.punk, vera: vera || null });
          return yield* ab.run(c);
        }
      }
    }

    /* ================================================================
       The game
       ================================================================ */
    g.main = function* () {
      /* The camps: six each, keep three, chosen face down and turned over
         together — or the rulebook's first game. */
      const camps = shuffle(D.CAMPS.map(c => c.id), rand);
      if (g.setup === 'book') {
        /* The first seat is the newcomer, the second the experienced player. */
        g.players[0].dealt = D.BOOK.newcomer.slice();
        g.players[1].dealt = D.BOOK.experienced.slice();
        g.campBox = camps.filter(id => D.BOOK.newcomer.indexOf(id) < 0 && D.BOOK.experienced.indexOf(id) < 0);
        g.players.forEach(p => setCamps(p, p.dealt));
      } else {
        g.players.forEach((p, i) => { p.dealt = camps.slice(i * 6, i * 6 + 6); });
        g.campBox = camps.slice(12);
        const asks = g.players.map(p => ({ n: ++g.pn, seat: p.id, t: 'pick', what: 'camps', why: 'Choose three camps to defend. The other three go back in the box.', pub: 'choosing three camps',
          options: p.dealt.map(id => ({ id, card: id, label: D.nameOf(id), sub: 'Draw ' + D.card(id).draw })), multi: true, min: 3, max: 3 }));
        const ans = yield { ask: asks, all: true };
        g.players.forEach(p => {
          const keep = ans[p.id].ids.slice();
          setCamps(p, keep);
          g.campBox = g.campBox.concat(p.dealt.filter(id => keep.indexOf(id) < 0));
        });
      }
      g.players.forEach(p => { p.dealt = []; });
      log({ t: 'camps', camps: g.players.map(p => ({ by: p.id, ids: p.camps.map(c => c.id) })) });
      /* Obelisk (as the module prints it) is destroyed before play. */
      g.players.forEach(p => p.camps.forEach(c => { if (c.id === 'obelisk') { c.dead = true; log({ t: 'campDown', by: null, of: p.id, card: c.id, left: liveCamps(p).length, setup: true }); } }));
      g.deck = shuffle(D.deckList(), rand);
      g.players.forEach(p => { const k = p.camps.reduce((s, c) => s + D.card(c.id).draw, 0); for (let j = 0; j < k; j++) p.hand.push(g.deck.pop()); });
      g.start = g.startOpt === 0 || g.startOpt === 1 ? g.startOpt : (rand() < 0.5 ? 0 : 1);
      log({ t: 'start', by: g.players[g.start].id, hands: g.players.map(p => p.hand.length) });
      g.cur = g.start;
      for (;;) {
        yield* turn(g.players[g.cur]);
        g.cur = 1 - g.cur;
      }
    };
    function setCamps(p, ids) {
      p.camps = ids.map((id, k) => ({ kind: 'camp', uid: 'c' + p.i + k, id, dmg: false, dead: false, used: false, moves: 0 }));
      p.cols = p.camps.map(c => [c]);
    }

    function* turn(p) {
      g.turnN++;
      g.tt = {};
      g.phase = 'events';
      log({ t: 'turn', by: p.id, turn: true });
      if (p.q[0]) {
        const inst = p.q[0];
        p.q[0] = null;
        yield* resolveEvent(p, inst);
      }
      p.q = [p.q[1], p.q[2], null];
      g.phase = 'replenish';
      draw(p, 1, 'replenish');
      g.water = g.firstWater ? D.START.firstWater : D.START.water;
      g.firstWater = false;
      g.phase = 'actions';
      for (;;) {
        const a = yield* ask(p, { t: 'turn', why: 'Your turn', pub: 'taking a turn' });
        if (a.t === 'end') break;
        yield* doTurnAction(p, a);
      }
      /* Clean-up: every water disc comes off. */
      g.water = 0;
      g.players.forEach(x => { people(x).forEach(e => { e.nr = false; }); x.camps.forEach(c => { c.used = false; }); });
      log({ t: 'endturn', by: p.id });
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
          g.hold = Object.assign({ n: ++g.holdN }, q.hold);
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
        clean = { t: a.t, card: a.card, col: a.col, at: a.at, destroy: a.destroy, uid: a.uid, k: a.k };
      } else { r = checkPick(pr, a); clean = r.a; }
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
    g.publicView = function () {
      return {
        v: VERSION, phase: g.phase, turnN: g.turnN, setup: g.setup,
        active: g.activeId(), start: g.start == null ? null : g.players[g.start].id,
        water: g.phase === 'actions' ? g.water : null,
        deckN: g.deck.length, discN: g.disc.length, discTop: g.disc.length ? g.disc[g.disc.length - 1] : null, reshuffles: g.reshuffles,
        hg: g.tt.hg != null ? g.players[g.tt.hg].id : null,
        players: g.players.map(p => ({
          id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level,
          handN: p.hand.length, siloInHand: !p.silo, raidersOut: p.q.indexOf('raiders') >= 0,
          q: p.q.slice(),
          camps: p.camps.map(c => ({ uid: c.uid, id: c.id, dmg: c.dmg, dead: c.dead, ready: isReady(c), moves: c.moves || 0 })),
          cols: p.cols.map(col => col.map(e => e.kind === 'camp' ? { kind: 'camp', uid: e.uid }
            : { kind: 'person', uid: e.uid, card: e.punk ? null : e.inst, punk: !!e.punk, dmg: e.dmg, ready: isReady(e) })),
          people: people(p).length, punks: punks(p), choosing: g.phase === 'setup' && g.prompts.some(pr => pr.seat === p.id)
        })),
        prompts: g.prompts.map(pr => ({ n: pr.n, seat: pr.seat, t: pr.t, what: pr.what || null, why: pr.pub || pr.why })),
        hold: g.hold ? clone(g.hold) : null,
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
      return { id, v: VERSION, hand: p.hand.slice(), prompts, can: turnPr && !g.hold ? Object.assign({ n: turnPr.n }, menu(p)) : null };
    };
    /* For the tests: every draw-deck card is somewhere, exactly once. */
    g.census = function () {
      const seen = {};
      const note = (id, w) => { (seen[id] = seen[id] || []).push(w); };
      g.deck.forEach(id => note(id, 'deck'));
      g.disc.forEach(id => note(id, 'disc'));
      g.limbo.forEach(id => note(id, 'limbo'));
      for (const p of g.players) {
        p.hand.forEach(id => { if (id !== 'silo') note(id, p.id + ':hand'); });
        people(p).forEach(e => note(e.inst, p.id + ':board'));
        p.q.forEach(id => { if (id && id !== 'raiders') note(id, p.id + ':queue'); });
      }
      return seen;
    };
    g.X = { people, exposed, liveCamps, deadCamps, menu, findEnt, colOf, abilitiesOf, ABIL, EVT, targets, placeOptions, restorable };
  }

  const Engine = { VERSION, LEVELS, create, rngFrom, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.RadEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
