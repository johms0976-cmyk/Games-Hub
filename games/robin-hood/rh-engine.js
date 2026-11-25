'use strict';
/* A Gest of Robin Hood — the rules. No DOM, no timers, one seeded rng.
 *
 * The display (or the solo host) holds the one Game; every order — from a
 * phone, a house player or a test — goes through `g.act(seatId, answer)`,
 * which refuses with a reason rather than a bare false.
 *
 * ONE GENERATOR (LESSONS-CHECKLIST B; the Radlands / Kemet shape). `main()`
 * sets up, then plays the Ballad deck card by card: the Carriages move, then
 * a Fortune event, a Royal Inspection, or the two factions in eligibility
 * order. Every question is a `yield {ask}`; anything the room should see
 * before it is applied is a `yield {hold}` (only when `opts.show`; a test
 * proves seeded games end identically with it on and off).
 *
 * WHAT IS SECRET (rulebook 3, "the Robin Hood player may secretly check the
 * location of Robin Hood"; "the Sheriff may secretly check the contents of
 * each face-down Carriage"):
 *   - which Hidden Merry Man is Robin Hood (only Robin Hood's seat knows);
 *   - what a face-down Carriage holds, on the map or Available (only the
 *     Sheriff's seat knows);
 *   - the order of the Ballad deck and of the Travellers deck (nobody);
 *   - a Rob's die, until the show releases it (decide, hold, show, apply).
 * Everything else — shillings, the Royal Favour, every piece's place and
 * face, the Victims, the used Carriages — is on the table.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./rh-data.js') : root.RhData;

  const VERSION = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const OVER = { over: true };
  const SIDES = ['robin', 'sheriff'];
  const other = s => (s === 'robin' ? 'sheriff' : 'robin');

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
  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const no = why => ({ ok: false, why });
  const K = id => String(id).split('.')[0];
  const S = id => D.SPACES[id];
  const nm = id => (S(id) ? S(id).name : id);

  /* ================================================================
     Pure board arithmetic, shared by the engine, the house and the phones
     (LESSONS-CHECKLIST B, "keep the board arithmetic in pure functions").
     `b` is anything shaped like the public view's board: {bridge, oak}.
     ================================================================ */
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const BASE = {};
  for (const [a, b] of D.BORDERS.concat(D.BRIDGED)) BASE[pairKey(a, b)] = 1;
  function adjacent(b, a, c, side) {
    if (a === c || a === 'ollerton' || c === 'ollerton') return false;
    if (BASE[pairKey(a, c)]) return true;
    if (b && b.bridge && pairKey(b.bridge[0], b.bridge[1]) === pairKey(a, c)) return true;
    if (side === 'robin' && b && b.oak && D.OLLERTON.indexOf(a) >= 0 && D.OLLERTON.indexOf(c) >= 0) return true;
    return false;
  }
  function neighbours(b, a, side) { return D.IDS.filter(c => adjacent(b, a, c, side)); }
  /* Odds that a Rob with `n` robbers (+bonus) beats `need` (= defence +
     Henchmen) on the given die: the house prices robs with it, the phone
     prints it. */
  function robOdds(die, n, bonus, need) {
    const f = D.DICE[die];
    return f.filter(x => n + x + (bonus || 0) > need).length / f.length;
  }
  /* Steps on the favour track: +k towards Order, -k towards Justice. There
     is no zero: 1 Justice is next to 1 Order. */
  function stepFavour(f, k) {
    let v = f;
    const dir = k > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(k); i++) {
      if (v === dir * D.FAVOUR_MAX) break;
      v += dir;
      if (v === 0) v = dir;
    }
    return v;
  }
  const favourText = f => (f > 0 ? f + ' Order' : -f + ' Justice');

  /* ================================================================
     Building a game
     ================================================================ */
  function create(opts) {
    opts = opts || {};
    const list = opts.players || [];
    if (list.length !== 2) throw new Error('A Gest of Robin Hood is for two players');
    const seed = opts.seed == null ? Date.now() : opts.seed;
    const sides = list.map(x => x.side);
    if (!(sides.indexOf('robin') >= 0 && sides.indexOf('sheriff') >= 0)) throw new Error('One Robin Hood and one Sheriff');
    const g = {
      VERSION, seed, gid: ((Math.imul(seed >>> 0, 2654435761) ^ 0x5bd1e995) >>> 0).toString(36), rng: rngFrom(seed), rngN: 0, drawN: 0, rollN: 0,
      opts: { show: !!opts.show },
      phase: 'setup', ballad: 0, cardN: 0, turnN: 0,
      favour: D.START.favour, sh: { robin: 0, sheriff: 0 },
      sp: {}, men: [], robin: null, car: [], bridge: null, oak: false,
      hGone: 0, mGone: 0,
      deck: [], played: [], card: null, first: 'robin', boxes: {},
      tdeck: [], tdisc: [], victims: [], tout: [], taside: [], tlimbo: [],
      log: [], prompts: [], answers: {}, pn: 0, hold: null, holdN: 0, actN: 0,
      ri: null, lastRi: null, result: null, rob: null
    };
    g.players = list.map((x, i) => ({
      id: x.id, name: x.name, hex: x.hex || D.SIDES[x.side].hex, bot: !!x.bot, i, side: x.side,
      level: x.bot ? (LEVELS.indexOf(x.level) >= 0 ? x.level : 'medium') : null
    }));
    attach(g);
    g.gen = g.main();
    g.advance();
    return g;
  }

  function attach(g) {
    const P = id => g.players.find(p => p.id === id) || null;
    const bySide = s => g.players.find(p => p.side === s);
    const rand = () => { g.rngN++; return g.rng(); };
    const log = e => { g.log.push(Object.assign({ b: g.ballad, c: g.card }, e)); return e; };
    g.seat = P;
    g.bySide = bySide;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.note = e => log(e);

    /* ================================================================
       Pieces
       ================================================================ */
    const sp = id => g.sp[id];
    const hench = id => (g.sp[id] ? g.sp[id].h : 0);
    const camps = id => (g.sp[id] ? g.sp[id].camps : 0);
    const menAt = at => g.men.filter(m => m.at === at);
    const robinP = () => g.men.find(m => m.id === g.robin);
    const isRobin = m => m.id === g.robin;
    const hiddenAt = at => menAt(at).filter(m => !m.rev);
    const hiddenPlain = at => menAt(at).filter(m => !m.rev && !isRobin(m));
    const revPlain = at => menAt(at).filter(m => m.rev && !isRobin(m));
    const plainAt = at => menAt(at).filter(m => !isRobin(m));
    const robinAt = at => { const r = robinP(); return r && r.at === at; };
    const availMen = () => menAt('avail').filter(m => !isRobin(m));
    const availH = () => D.PIECES.henchmen - g.hGone - D.IDS.reduce((s, k) => s + hench(k), 0);
    const availCamps = () => D.PIECES.camps - D.IDS.reduce((s, k) => s + camps(k), 0);
    const carsAt = at => g.car.filter(c => c.at === at);
    const state = id => (S(id).kind === 'castle' ? 'sub' : S(id).kind === 'parish' ? g.sp[id].state : null);
    const isSub = id => state(id) === 'sub';                         /* Nottingham always */
    const isRev = id => state(id) === 'rev';
    const subLike = id => isSub(id) || state(id) === 'pas';          /* Rob and Capture */
    const isParish = id => S(id).kind === 'parish';
    const isForest = id => S(id).kind === 'forest';
    const onMap = at => !!D.SPACES[at];
    const board = () => ({ bridge: g.bridge, oak: g.oak });
    const adj = (a, c, side) => adjacent(board(), a, c, side);
    const nbrs = (a, side) => neighbours(board(), a, side);
    const subParishes = () => D.PARISHES.filter(isSub).length;
    const revParishes = () => D.PARISHES.filter(isRev).length;
    const victimsN = () => g.victims.length;

    function placeMen(at, k, rev) {
      let n = 0;
      for (const m of availMen().slice(0, k)) { m.at = at; m.rev = !!rev; n++; }
      return n;
    }
    function addH(at, k) {
      const n = Math.min(k, availH());
      if (n > 0) g.sp[at].h += n;
      return n;
    }
    function remH(at, k, gone) {
      const n = Math.min(k, hench(at));
      g.sp[at].h -= n;
      if (gone) g.hGone += n;
      return n;
    }
    function setState(id, st, why) {
      if (!isParish(id)) return false;
      const was = g.sp[id].state;
      if (was === 'pas' || was === st) return false;
      g.sp[id].state = st;
      log({ t: 'parish', at: id, st, was, why: why || null });
      return true;
    }
    function shift(k, why, by) {
      if (!k) return;
      const was = g.favour;
      g.favour = stepFavour(g.favour, k);
      if (g.favour !== was) log({ t: 'favour', k, now: g.favour, was, why: why || null, by: by || null });
    }
    function gain(side, k, why, from) {
      if (k <= 0) return 0;
      let n = k;
      if (from) { n = Math.min(k, g.sh[from]); g.sh[from] -= n; }
      g.sh[side] += n;
      if (n) log({ t: 'gain', side, n, why: why || null, from: from || null, by: bySide(side).id });
      return n;
    }
    function pay(side, k, why) {
      if (k <= 0) return true;
      if (g.sh[side] < k) return false;
      g.sh[side] -= k;
      log({ t: 'paid', side, n: k, why: why || null, by: bySide(side).id });
      return true;
    }
    /* One door for every Camp placed and removed, and Robin Hood captured
       (rulebook 7: the favour moves every time). */
    function placeCamp(at, why) {
      if (availCamps() <= 0) return false;
      g.sp[at].camps++;
      log({ t: 'camp', at, why: why || null, by: bySide('robin').id });
      shift(-1, 'camp');
      return true;
    }
    function removeCamp(at, why, by) {
      if (camps(at) <= 0) return false;
      g.sp[at].camps--;
      log({ t: 'campGone', at, why: why || null, by: by || bySide('sheriff').id });
      shift(1, 'campGone');
      return true;
    }
    function toPrison(m, why) {
      const from = m.at;
      m.at = 'prison'; m.rev = true;
      if (isRobin(m)) { log({ t: 'robinTaken', from, why: why || null, by: bySide('sheriff').id }); shift(1, 'robinTaken'); }
      return isRobin(m);
    }
    function revealMen(list) { for (const m of list) m.rev = true; return list.length; }
    /* A random pick among Hidden men: the Sheriff cannot see under them. */
    function blind(list, k) { return shuffle(list, rand).slice(0, k); }

    /* ================================================================
       Asking
       ================================================================ */
    function* ask(p, pr) {
      const q = Object.assign({}, pr, { n: ++g.pn, seat: p.id, t: pr.t });
      const out = yield { ask: [q] };
      return out[p.id];
    }
    /* A pick. A question with one legal answer answers itself; with none it
       is not asked. `multi` takes ids (min..max). */
    function* pick(side, what, why, options, o) {
      o = o || {};
      const p = bySide(side);
      const legal = options.filter(x => !x.bad);
      if (!o.multi) {
        if (!legal.length) return null;
        if (legal.length === 1 && !o.skip && !o.always) return legal[0].id;
      } else if (!legal.length) return [];
      const a = yield* ask(p, { t: 'pick', what, why, pub: o.pub || null, options, multi: !!o.multi,
        min: o.multi ? (o.min || 0) : 1, max: o.multi ? Math.min(o.max == null ? legal.length : o.max, legal.length) : 1,
        skip: o.skip || null, spaces: o.spaces || null, secret: !!o.secret, info: o.info || null });
      if (a.t === 'skip') return o.multi ? [] : null;
      return o.multi ? a.ids.slice() : a.id;
    }
    function* yesNo(side, what, why, yesLab, noLab, o) {
      return (yield* pick(side, what, why, [{ id: 'yes', label: yesLab }, { id: 'no', label: noLab }], Object.assign({ always: true }, o || {}))) === 'yes';
    }
    function* hold(h) { yield { hold: h }; }
    const spOpt = (id, sub, bad) => ({ id, label: nm(id), sub: sub || null, space: id, bad: bad || null });
    const PLURAL = { Henchman: 'Henchmen', man: 'men', 'Merry Man': 'Merry Men' };
    const numOpts = (lo, hi, word) => { const out = []; for (let k = hi; k >= lo; k--) out.push({ id: String(k), label: k + (word ? ' ' + (k === 1 ? word : (PLURAL[word] || word + 's')) : '') }); return out; };

    /* ================================================================
       The end
       ================================================================ */
    function finish(how) {
      const win = g.favour > 0 ? 'sheriff' : 'robin';
      const rows = g.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, side: p.side, bot: p.bot, level: p.level,
        favour: p.side === 'sheriff' ? Math.max(0, g.favour) : Math.max(0, -g.favour), shillings: g.sh[p.side], won: p.side === win }));
      rows.forEach(r => { r.place = r.won ? 1 : 2; r.total = r.favour; });
      g.result = { how, winner: bySide(win).id, side: win, name: bySide(win).name, rows, favour: g.favour, ballad: g.ballad };
      g.phase = 'over';
      g.prompts = [];
      g.hold = null;
      log({ t: 'over', how });   /* never names the winner: the log is public before the reveal */
      throw OVER;
    }

    /* ================================================================
       Setup (the two setup sheets)
       ================================================================ */
    function* setup() {
      for (const id of D.IDS) g.sp[id] = { h: 0, camps: 0, state: isParish(id) ? (D.START.revolting.indexOf(id) >= 0 ? 'rev' : 'sub') : null };
      for (let i = 0; i < D.PIECES.merry; i++) g.men.push({ id: 'm' + (i + 1), at: 'avail', rev: false });
      g.robin = 'm1';
      const kinds = shuffle(D.CARRIAGE_LIST, rand);
      kinds.forEach((k, i) => g.car.push({ id: 'c' + (i + 1), kind: k, at: 'avail', rev: false }));
      for (const id of Object.keys(D.START.sheriff.henchmen)) g.sp[id].h = D.START.sheriff.henchmen[id];
      g.sh.sheriff = D.START.sheriff.shillings;
      g.sh.robin = D.START.robin.shillings;
      g.sp[D.START.robin.camp].camps = 1;
      /* The Ballad deck (rulebook 5): three piles of 4 events + 1 Fortune
         event shuffled, 2 more events on top; Royal Inspections between and
         King Richard's Return under the last. */
      const ev = shuffle(D.REGULAR, rand);
      const fo = shuffle(D.FORTUNE, rand);
      /* The two unshuffled events go on TOP of each pile — the front, since
         the deck is drawn from the front. */
      const piles = [0, 1, 2].map(k => ev.slice(k * 6 + 4, k * 6 + 6).concat(shuffle(ev.slice(k * 6, k * 6 + 4).concat([fo[k]]), rand)));
      /* g.deck is drawn from the front. */
      g.deck = piles[0].concat([30], piles[1], [31], piles[2], [32]);
      g.drawN++;
      g.tdeck = shuffle(D.TRAVELLER_IDS.filter(t => !D.TRAVELLERS[K(t)].extra), rand);
      g.taside = D.TRAVELLER_IDS.filter(t => D.TRAVELLERS[K(t)].extra);
      log({ t: 'setup' });
      /* Robin Hood and three Merry Men, Hidden, among Shire Wood, Southwell
         Forest and Remston: the setup sheet's three spreads. */
      const SPLITS = [
        { id: 'classic', label: 'Classic', sub: 'Two in Shire Wood, one in Southwell Forest, one in Remston', at: { shirewood: 2, southwell: 1, remston: 1 } },
        { id: 'balanced', label: 'Balanced', sub: 'One in Shire Wood, one in Southwell Forest, two in Remston', at: { shirewood: 1, southwell: 1, remston: 2 } },
        { id: 'aggressive', label: 'Aggressive', sub: 'One in Shire Wood, two in Southwell Forest, one in Remston', at: { shirewood: 1, southwell: 2, remston: 1 } }
      ];
      g.phase = 'setup';
      const split = yield* pick('robin', 'setupSplit', 'Where do your four men start? Robin Hood is one of them — the Sheriff will not know which.', SPLITS.map(s => ({ id: s.id, label: s.label, sub: s.sub })).concat([{ id: 'custom', label: 'My own spread', sub: 'Any four among Shire Wood, Southwell Forest and Remston' }]), { always: true, pub: 'Robin Hood sets up in the greenwood' });
      let at;
      if (split === 'custom') {
        const a = +(yield* pick('robin', 'setupN', 'How many in Shire Wood?', numOpts(0, 4, 'man'), { always: true, pub: 'Robin Hood sets up in the greenwood' }));
        const b = +(yield* pick('robin', 'setupN', 'How many in Southwell Forest? The rest go to Remston.', numOpts(0, 4 - a, 'man'), { always: true, pub: 'Robin Hood sets up in the greenwood' }));
        at = {};
        if (a) at.shirewood = a;
        if (b) at.southwell = b;
        if (4 - a - b) at.remston = 4 - a - b;
      } else at = SPLITS.find(s => s.id === split).at;
      const where = yield* pick('robin', 'setupRobin', 'Which space hides Robin Hood himself?', Object.keys(at).map(k => spOpt(k, at[k] + ' m' + (at[k] > 1 ? 'en' : 'an') + ' there')), { always: true, secret: true, pub: 'Robin Hood hides among his men' });
      robinP().at = where;
      const need = Object.assign({}, at);
      need[where]--;
      for (const k of Object.keys(need)) placeMen(k, need[k], false);
      log({ t: 'placed', split, by: bySide('robin').id, at: clone(at) });
    }

    /* ================================================================
       The game: Ballad after Ballad, card after card
       ================================================================ */
    g.main = function* () {
      yield* setup();
      for (g.ballad = 1; g.ballad <= 3; g.ballad++) {
        g.phase = 'ballad';
        g.first = 'robin';
        g.cardN = 0;
        log({ t: 'ballad', n: g.ballad });
        yield* hold({ k: 'ballad', ballad: g.ballad });
        g.phase = 'play';
        for (;;) {
          const id = g.deck.shift();
          g.drawN++;
          g.card = id;
          g.cardN++;
          g.turnN++;
          g.boxes = {};
          const c = D.EVENTS[id];
          log({ t: 'card', id });
          yield* hold({ k: 'card', id });
          yield* moveCarriages(c.c, 1);
          if (c.inspection) {
            yield* inspection(!!c.last);
            g.played.push(id);
            break;
          }
          if (c.fortune) yield* fortune(id);
          else yield* round(id);
          g.played.push(id);
          g.card = null;
        }
      }
    };

    /* ---------------- the Carriages move ---------------- */
    function* moveCarriages(k, steps, o) {
      o = o || {};
      const moved = {};
      for (let i = 0; i < k; i++) {
        const can = g.car.filter(c => onMap(c.at) && !moved[c.id] && S(c.at).road);
        if (!can.length) break;
        const left = k - i;
        const cid = yield* pick('sheriff', 'carriage', 'The Carriages roll: which one moves' + (steps > 1 ? ' (up to ' + steps + ' spaces)' : '') + '? ' + (left > 1 ? left + ' to move.' : 'One to move.'),
          can.map(c => ({ id: c.id, label: carriageLabel(c, true) + ' in ' + nm(c.at), sub: 'On to ' + nm(S(c.at).road) + (hench(c.at) ? ' · a Henchman may ride along' : ''), space: c.at })), { pub: 'The Sheriff’s Carriages roll towards Nottingham' });
        const c = g.car.find(x => x.id === cid);
        moved[cid] = 1;
        for (let st = 0; st < steps && onMap(c.at) && S(c.at).road; st++) {
          if (st > 0 && !(yield* yesNo('sheriff', 'carriageOn', 'Move it on again, to ' + nm(S(c.at).road) + '?', 'On to ' + nm(S(c.at).road), 'Stop here'))) break;
          const from = c.at, to = S(from).road;
          let escort = false;
          if (hench(from) > 0) escort = yield* yesNo('sheriff', 'escort', 'A Henchman to ride with it from ' + nm(from) + ' to ' + nm(to) + '?', 'Yes, an escort', 'No escort');
          if (escort) { g.sp[from].h--; g.sp[to].h++; }
          c.at = to;
          log({ t: 'carriage', id: c.id, from, to, escort, by: bySide('sheriff').id, why: o.why || null });
          if (to === 'nottingham') yield* arrive(c);
        }
      }
    }
    function carriageLabel(c, forSheriff) { return (c.rev || forSheriff ? D.CARRIAGES[c.kind].name : 'Carriage') + (c.rev ? ' (revealed)' : ''); }
    function* arrive(c) {
      const K2 = D.CARRIAGES[c.kind];
      c.at = 'used'; c.rev = true;
      log({ t: 'arrive', id: c.id, kind: c.kind, by: bySide('sheriff').id });
      yield* hold({ k: 'arrive', id: c.id, kind: c.kind });
      shift(K2.order, 'arrive');
      gain('sheriff', K2.sh, 'arrive');
    }

    /* ---------------- an ordinary card: both factions, eligibility order ---------------- */
    function* round(id) {
      const first = g.first, second = other(first);
      yield* turn(first, id, true);
      yield* turn(second, id, false);
      const left = D.BOXES.find(b => g.boxes[b.id]);
      g.first = left ? g.boxes[left.id] : first;
      log({ t: 'eligible', first: g.first });
    }
    function turnMenu(side, id, first) {
      const out = [];
      const c = D.EVENTS[id];
      for (const b of D.BOXES) {
        if (g.boxes[b.id]) continue;
        let bad = null, sub = '';
        if (b.id === 'single') { bad = plotMenu(side, 'single').some(x => !x.bad) ? null : 'No Plot is possible for you now.'; sub = 'One Plot in one space. You will be first eligible next card.'; }
        if (b.id === 'pd') { bad = plotMenu(side, 'pd').some(x => !x.bad) ? null : 'No Plot is possible for you now.'; sub = 'One Plot in up to 3 spaces, then a Deed.' + (first ? ' The other player cannot then take the Event.' : ''); }
        let halves = null;
        if (b.id === 'event') {
          const own = side === 'robin' ? 'rh' : 'sh';
          halves = [own, own === 'rh' ? 'sh' : 'rh'].filter(h => canEvent(h, id, side));
          bad = halves.length ? null : 'Neither half of the card can do anything now.';
          sub = 'Either half. Robin Hood’s: ' + c.rh.title + '. The Sheriff’s: ' + c.sh.title + '.';
        }
        out.push({ id: b.id, kind: 'box', label: b.name, sub, bad, halves });
      }
      const free = D.BOXES.filter(b => !g.boxes[b.id]);
      out.push({ id: 'pass', kind: 'pass', label: 'Pass', sub: side === 'robin' ? 'Take 1 shilling.' : 'Take the coins on the box you leave your cylinder on (' + free.map(b => b.coins).join(' or ') + ').', bad: null });
      return out;
    }
    function* turn(side, id, first) {
      const p = bySide(side);
      g.active = side;
      const menu = turnMenu(side, id, first);
      const a = yield* ask(p, { t: 'turn', why: (first ? 'You are first eligible' : 'Your choice, second') + ': ' + D.EVENTS[id].name, pub: p.name + (first ? ' chooses first' : ' chooses second'), options: menu, first, card: id });
      const x = a.id;
      if (x === 'pass') {
        const free = D.BOXES.filter(b => !g.boxes[b.id]);
        let box = free[0].id;
        if (free.length > 1) box = yield* pick(side, 'passBox', 'Pass: leave your cylinder on which box?' + (side === 'sheriff' ? ' You take its coins.' : ''),
          free.map(b => ({ id: b.id, label: b.name + (side === 'sheriff' ? ' · ' + b.coins + ' shilling' + (b.coins > 1 ? 's' : '') : ''), sub: b.id === 'single' ? 'Leftmost: you will be first next card.' : b.id === 'pd' ? 'Rightmost: you will be second next card.' : 'Middle: first next card unless the other player is on Single Plot.' })), { always: true });
        g.boxes[box] = side;
        log({ t: 'pass', side, box, by: p.id });
        gain(side, side === 'robin' ? 1 : D.BOXES.find(b => b.id === box).coins, 'pass');
        return;
      }
      g.boxes[x] = side;
      log({ t: 'choose', side, box: x, by: p.id });
      if (x === 'single') yield* doPlots(side, 'single');
      else if (x === 'pd') { yield* doPlots(side, 'pd'); yield* doDeed(side); }
      else if (x === 'event') {
        const own = side === 'robin' ? 'rh' : 'sh';
        const c = D.EVENTS[id];
        const halves = [own, own === 'rh' ? 'sh' : 'rh'].filter(h => canEvent(h, id, side));
        const half = yield* pick(side, 'eventHalf', c.name + ': which half do you play?', halves.map(h => ({ id: h, label: (h === 'rh' ? 'Robin Hood’s half: ' : 'The Sheriff’s half: ') + c[h].title, sub: c[h].text })), { always: halves.length > 1, pub: p.name + ' plays ' + c.name });
        yield* doEvent(side, id, half);
      }
    }

    /* ================================================================
       Plots
       ================================================================ */
    /* "Each Merry Man piece may only move once during a Sneak Plot", and each
       Henchman once during a Patrol (3.2.2, 3.3.2): who has moved this Plot. */
    let sneakMoved = {}, marched = {};
    const PLOT_IDS = { robin: ['recruit', 'sneak', 'rob'], sheriff: ['hire', 'patrol', 'capture'] };
    function plotMenu(side, mode, o) {
      o = o || {};
      return PLOT_IDS[side].map(k => {
        const def = D.PLOTS[side][k];
        const sps = plotSpaces(side, k, o);
        const ok = sps.filter(x => !x.bad);
        const cost = o.free ? 0 : def.cost;
        let bad = null;
        if (!ok.length) bad = sps.length ? sps[0].bad : 'Nowhere to do it.';
        else if (cost && g.sh[side] < cost) bad = 'It costs ' + cost + ' shilling' + (cost > 1 ? 's' : '') + ' a ' + def.per + '; you have ' + g.sh[side] + '.';
        return { id: k, kind: 'plot', label: def.name, sub: (cost ? cost + ' a ' + def.per : 'Free') + ' · ' + (mode === 'single' ? 'one space' : 'up to 3') + ' · ' + def.text, bad };
      });
    }
    function plotSpaces(side, k, o) {
      o = o || {};
      const done = o.done || {};
      const all = D.IDS.filter(id => id !== 'ollerton');
      const res = id => (done[id] ? 'Already chosen.' : null);
      if (k === 'recruit') return all.map(id => {
        if (res(id)) return spOpt(id, null, res(id));
        if (isSub(id)) return spOpt(id, null, 'Submissive.');
        const opts = recruitChoices(id);
        return spOpt(id, opts.length ? opts.map(x => x.label).join(' / ') : null, opts.length ? null : 'Nothing to recruit there.');
      });
      if (k === 'sneak') return all.map(id => { const n = menAt(id).filter(m => !sneakMoved[m.id]).length; return res(id) ? spOpt(id, null, res(id)) : n ? spOpt(id, n + ' men') : spOpt(id, null, menAt(id).length ? 'They have moved already this Plot.' : 'No Merry Men there.'); });
      if (k === 'rob') return all.map(id => {
        if (res(id)) return spOpt(id, null, res(id));
        if (!hiddenPlain(id).length && !robinAt(id)) return spOpt(id, null, 'No Hidden Merry Men or Robin Hood there.');
        if (!robTargets(id).length) return spOpt(id, null, 'Nothing to rob.');
        return spOpt(id, robTargets(id).map(t => t.label).join(' / '));
      });
      if (k === 'hire') return all.map(id => {
        if (res(id)) return spOpt(id, null, res(id));
        if (id === 'nottingham') return availH() ? spOpt(id, '+' + Math.min(4, availH()) + ' Henchmen') : spOpt(id, null, 'No Henchmen Available.');
        if (!isParish(id)) return spOpt(id, null, 'Only Parishes and Nottingham.');
        if (isSub(id)) return availH() ? spOpt(id, '+' + Math.min(2, availH()) + ' Henchmen') : spOpt(id, null, 'No Henchmen Available.');
        if (isRev(id)) return hench(id) > menAt(id).length ? spOpt(id, 'Set Submissive') : spOpt(id, null, 'Revolting: Henchmen must outnumber the Merry Men there.');
        return spOpt(id, null, 'Passive.');
      });
      if (k === 'patrol') return all.map(id => {
        if (res(id)) return spOpt(id, null, res(id));
        const from = nbrs(id, 'sheriff').filter(n => hench(n) > 0);
        if (!hench(id) && !from.length) return spOpt(id, null, 'No Henchmen in or next to it.');
        return spOpt(id, hiddenAt(id).length + ' Hidden there');
      });
      if (k === 'capture') return all.map(id => {
        if (res(id)) return spOpt(id, null, res(id));
        if (!hench(id)) return spOpt(id, null, 'No Henchmen there.');
        const n = captureCount(id);
        return n ? spOpt(id, n + ' to take') : spOpt(id, null, 'Nothing Revealed to take.');
      });
      return [];
    }
    function captureCount(id) {
      const per = isRev(id) ? Math.floor(hench(id) / 2) : hench(id);
      const rv = revPlain(id).length + (robinAt(id) && robinP().rev ? 1 : 0);
      let n = Math.min(per, rv);
      if (per > rv && !hiddenAt(id).length) n += Math.min(per - rv, camps(id));
      return n;
    }
    function recruitChoices(id) {
      const out = [];
      if (camps(id) > 0) {
        if (availMen().length) out.push({ id: 'two', label: 'Place ' + Math.min(2, availMen().length) + ' Merry Men' });
        if (menAt(id).some(m => m.rev)) out.push({ id: 'hide', label: 'Hide everyone there' });
      } else {
        if (availMen().length) out.push({ id: 'one', label: 'Place a Merry Man' });
        if (plainAt(id).length && availCamps()) out.push({ id: 'camp', label: 'Turn a Merry Man into a Camp (+1 Justice)' });
      }
      return out;
    }
    function robTargets(id) {
      const out = [];
      if (g.tdeck.length + g.tdisc.length) out.push({ id: 'traveller', label: 'A Traveller' });
      for (const c of carsAt(id)) out.push({ id: c.id, label: c.rev ? 'the ' + D.CARRIAGES[c.kind].name + ' Carriage' : 'a Carriage' });
      if (id === 'nottingham') out.push({ id: 'treasury', label: 'the Treasury' });
      return out;
    }

    /* Single Plot or Plots: choose the Plot, then its spaces one at a time. */
    function* doPlots(side, mode, o) {
      o = o || {};
      sneakMoved = {}; marched = {};
      const menu = plotMenu(side, mode, o).filter(x => !o.only || x.id === o.only);
      const k = yield* pick(side, 'plot', mode === 'single' ? 'Single Plot: which?' : 'Plots & Deeds: which Plot (up to 3 spaces)?', menu, { always: true, pub: bySide(side).name + ' chooses a Plot' });
      if (!k) return null;
      log({ t: 'plot', side, plot: k, mode, by: bySide(side).id });
      const max = mode === 'single' ? 1 : 3;
      const done = {};
      let n = 0;
      while (n < max) {
        const cost = o.free ? 0 : D.PLOTS[side][k].cost;
        if (cost && g.sh[side] < cost) break;
        const sps = plotSpaces(side, k, { done }).filter(x => !x.bad);
        if (!sps.length) break;
        const where = yield* pick(side, 'plotSpace', D.PLOTS[side][k].name + ': ' + (n ? 'another space? (' + n + ' of ' + max + ')' : 'which space?') + (cost ? ' ' + cost + ' shilling' + (cost > 1 ? 's' : '') + ' each; you have ' + g.sh[side] + '.' : ''), sps,
          { skip: n ? 'Done' : null, always: true, spaces: true, pub: bySide(side).name + ' — ' + D.PLOTS[side][k].name });
        if (!where) break;
        done[where] = 1;
        n++;
        if (cost) pay(side, cost, k);
        yield* plotAt(side, k, where, o);
      }
      return k;
    }
    function* plotAt(side, k, id, o) {
      if (k === 'recruit') return yield* recruitAt(id);
      if (k === 'sneak') return yield* sneakFrom(id);
      if (k === 'rob') return yield* robAt(id, o);
      if (k === 'hire') return hireAt(id);
      if (k === 'patrol') return yield* patrolTo(id, o);
      if (k === 'capture') return captureAt(id);
    }

    /* ---------------- Robin Hood's Plots ---------------- */
    function* recruitAt(id) {
      const ch = recruitChoices(id);
      const c = yield* pick('robin', 'recruit', 'Recruit in ' + nm(id) + ':', ch, { pub: 'Robin Hood recruits in ' + nm(id) });
      if (c === 'one') { placeMen(id, 1, false); log({ t: 'recruit', at: id, n: 1, by: bySide('robin').id }); }
      else if (c === 'two') { const n = placeMen(id, 2, false); log({ t: 'recruit', at: id, n, by: bySide('robin').id }); }
      else if (c === 'hide') { const n = menAt(id).filter(m => m.rev).length; menAt(id).forEach(m => { m.rev = false; }); log({ t: 'hide', at: id, n, by: bySide('robin').id }); }
      else if (c === 'camp') {
        const pool = revPlain(id).length ? revPlain(id) : hiddenPlain(id);
        const m = pool[0];
        m.at = 'avail'; m.rev = false;
        log({ t: 'toCamp', at: id, by: bySide('robin').id });
        placeCamp(id, 'recruit');
      }
    }
    /* Move men out of one space, a destination at a time. Revealed men go
       first (they arrive Hidden); Robin Hood goes only when chosen. */
    function* sneakFrom(id, o) {
      o = o || {};
      let first = true;
      const ex = o.rule ? null : sneakMoved;
      for (;;) {
        const here = menAt(id).filter(m => !ex || !ex[m.id]);
        if (!here.length) break;
        const dests = (o.dests || nbrs(id, 'robin')).filter(d => d !== id);
        const to = yield* pick('robin', 'sneakTo', 'Sneak from ' + nm(id) + ' (' + here.length + ' here): to where?', dests.map(d => spOpt(d, (isSub(d) ? 'Submissive · ' + hench(d) + ' Henchmen' : isRev(d) ? 'Revolting' : isForest(d) ? 'Forest' : 'Passive'))),
          { skip: first ? null : 'Done', always: true, spaces: true, pub: 'Robin Hood’s men sneak out of ' + nm(id) });
        if (!to) break;
        const groups = moveGroups(id, null, ex);
        const n = yield* pick('robin', 'sneakN', 'How many go from ' + nm(id) + ' to ' + nm(to) + '?', groups, { always: true, secret: true, pub: 'Robin Hood’s men sneak out of ' + nm(id) });
        yield* moveMen(id, to, n, 'sneak', o.rule || 'sneak', ex);
        first = false;
        if (o.once) break;
      }
    }
    /* "3", "2 + Robin Hood": the counts of the men who could go. */
    function moveGroups(id, max, ex) {
      const plain = plainAt(id).filter(m => !ex || !ex[m.id]).length, rh = robinAt(id) && (!ex || !ex[robinP().id]);
      const out = [];
      for (let k = Math.min(plain, max == null ? 99 : max); k >= 0; k--) {
        if (rh && (max == null || k + 1 <= max)) out.push({ id: k + 'r', label: k ? k + ' Merry Man' + (k > 1 ? 'en' : '') + ' and Robin Hood' : 'Robin Hood alone' });
        if (k) out.push({ id: k + '', label: k + ' Merry M' + (k > 1 ? 'en' : 'an') + (rh ? ' (Robin Hood stays)' : '') });
      }
      return out;
    }
    function takeGroup(id, code, ex) {
      const k = parseInt(code, 10) || 0, withR = /r$/.test(String(code));
      const plain = plainAt(id).filter(m => !ex || !ex[m.id]).sort((a, b) => (b.rev ? 1 : 0) - (a.rev ? 1 : 0)).slice(0, k);
      if (withR && robinAt(id)) plain.push(robinP());
      return plain;
    }
    /* rule: 'sneak' reveals movers into a crowded Submissive space; 'hide'
       hides them all; 'keep' leaves faces as they are. */
    function* moveMen(from, to, code, why, rule, ex) {
      const list = takeGroup(from, code, ex);
      if (ex) for (const m of list) ex[m.id] = 1;
      if (!list.length) return 0;
      const robinWasSeen = list.some(m => isRobin(m) && m.rev);
      let rev = false;
      if (rule === 'sneak') rev = isSub(to) && list.length + hench(to) > 3;
      for (const m of list) { m.at = to; m.rev = rule === 'keep' ? m.rev : rev; }
      log({ t: 'move', from, to, n: list.length, rev, robin: robinWasSeen || (rev && list.some(isRobin)) || undefined, why, by: bySide('robin').id });
      return list.length;
    }

    /* ---------------- the Rob ---------------- */
    function* robAt(id, o) {
      o = o || {};
      const side = 'robin';
      /* 3.2.3: first the target, then who takes part (Robin Hood's part is
         decided before a Traveller is drawn or a Carriage turned over). */
      const tgts = robTargets(id);
      const tid = yield* pick(side, 'robTarget', 'Rob in ' + nm(id) + ': rob what?', tgts.map(t => ({ id: t.id, label: t.label.charAt(0).toUpperCase() + t.label.slice(1), sub: targetSub(t.id, id) })), { always: true, pub: 'Robin Hood chooses a target in ' + nm(id) });
      const hp = hiddenPlain(id).length, rh = robinAt(id);
      /* The robbers: Hidden Merry Men, and Robin Hood if he is here. At least
         one Hidden man is Revealed, unless Robin Hood already is. */
      const opts = [];
      for (let k = hp; k >= 0; k--) {
        if (rh) opts.push({ id: k + 'r', label: (k ? k + ' Merry M' + (k > 1 ? 'en' : 'an') + ' and ' : '') + 'Robin Hood', sub: (k + 1) + ' to the roll' + (robinP().rev ? '' : ' · Robin Hood is Revealed') });
        if (k) opts.push({ id: k + '', label: k + ' Merry M' + (k > 1 ? 'en' : 'an'), sub: k + ' to the roll' });
      }
      const code = yield* pick(side, 'robbers', 'Rob in ' + nm(id) + ': who takes part? They are Revealed.', opts, { always: true, secret: true, info: { target: tid }, pub: 'Robin Hood’s men rob in ' + nm(id) });
      const k = parseInt(code, 10) || 0, withR = /r$/.test(code);
      const robbers = hiddenPlain(id).slice(0, k);
      revealMen(robbers);
      if (withR) robinP().rev = true;
      if (withR) robbers.push(robinP());
      log({ t: 'robbers', at: id, n: robbers.length, robin: withR || undefined, by: bySide('robin').id });
      const R = { n: ++g.rollN, at: id, robbers: robbers.length, robin: withR, target: tid, bonus: o.bonus || 0, hench: hench(id), die: (isForest(id) || isRev(id)) ? 'green' : 'white' };
      let opt = null, card = null, car = null;
      if (tid === 'traveller') {
        if (!g.tdeck.length) { g.tdeck = shuffle(g.tdisc, rand); g.tdisc = []; log({ t: 'treshuffle' }); }
        card = g.tdeck.shift();
        g.drawN++;
        g.tlimbo.push(card);
        const T = D.TRAVELLERS[K(card)];
        R.card = card; R.def = T.def;
        log({ t: 'tdraw', card, at: id, by: bySide('robin').id });
        if (T.single) opt = 'a';
        else {
          const ob = T.b;
          const bBad = ob.noRoll ? (g.sh.robin < ob.cost ? 'You need ' + ob.cost + ' shillings.' : null) : null;
          opt = yield* pick(side, 'robOption', T.name + ' (Defence ' + T.def + '): which way?', [
            { id: 'a', label: T.a.name, sub: 'Success: ' + T.a.win + ' Failure: ' + T.a.lose },
            { id: 'b', label: ob.name, sub: ob.noRoll ? ob.win : 'Success: ' + ob.win + ' Failure: ' + ob.lose, bad: bBad }], { always: true, pub: 'Robin Hood meets ' + T.name });
        }
        R.opt = opt;
      } else if (tid === 'treasury') {
        R.def = 0;
      } else {
        car = g.car.find(c => c.id === tid);
        if (!car.rev) { car.rev = true; log({ t: 'carRevealed', id: car.id, kind: car.kind, at: id }); }
        R.kind = car.kind; R.def = D.CARRIAGES[car.kind].def;
      }
      const T = card ? D.TRAVELLERS[K(card)] : null;
      const noRoll = T && T[opt] && T[opt].noRoll;
      if (noRoll) { R.noRoll = true; R.win = true; }
      else {
        R.face = Math.floor(rand() * 6);
        R.roll = D.DICE[R.die][R.face];
        R.total = R.robbers + R.roll + R.bonus;
        R.need = R.def + R.hench;
        R.win = R.total > R.need;
      }
      /* Decide, hold, show, then apply. The die stays out of the public view
         and the log until the show releases it (LESSONS-CHECKLIST C, "dice
         are a secret until they land"). */
      g.rob = R;
      R.stage = 'roll';
      yield* hold({ k: 'rob', rob: R.n });
      R.stage = 'landed';
      yield* hold({ k: 'robLand', rob: R.n });
      g.rob = null;
      log(Object.assign({ t: 'rob', by: bySide('robin').id }, clone(R)));
      yield* robResult(R, id, card, car, robbers);
    }
    function targetSub(t, id) {
      const need = h => ' + ' + hench(id) + ' Henchmen = ' + h;
      if (t === 'traveller') return 'Draw one: Defence 0 to 3' + ' · ' + (g.tdeck.length + g.tdisc.length) + ' left';
      if (t === 'treasury') return 'Defence 0' + need(hench(id)) + ' · success: 2 shillings from the Sheriff, +1 Justice';
      const c = g.car.find(x => x.id === t);
      if (c.rev) { const C = D.CARRIAGES[c.kind]; return 'Defence ' + C.def + need(C.def + hench(id)) + ' · ' + C.text; }
      return 'Face down: Tallage, Tribute or a Trap (Defence 2)';
    }
    function* robResult(R, id, card, car, robbers) {
      const side = 'robin';
      const capture = why => { let k = 0; for (const m of robbers) { if (m.at === id) { toPrison(m, why); k++; } } log({ t: 'captured', at: id, n: k, why }); };
      if (R.target === 'treasury') {
        if (R.win) { gain(side, 2, 'treasury', 'sheriff'); shift(-1, 'treasury'); }
        return;
      }
      if (car) {
        const C = D.CARRIAGES[car.kind];
        if (R.win) { car.at = 'used'; gain(side, C.rh, 'carriage'); if (C.justice) shift(-C.justice, 'tribute'); }
        else if (C.capture) capture('trap');
        return;
      }
      const T = D.TRAVELLERS[K(card)], O = T[R.opt];
      let to = 'disc';
      if (R.win) {
        if (O.noRoll) {
          pay(side, O.cost, 'lea');
          setState('retford', 'rev', 'lea');
          if (!camps('retford')) placeCamp('retford', 'lea');
          to = 'out';
        } else {
          if (O.gain) gain(side, O.gain, 'traveller');
          if (O.fromSheriff) gain(side, O.fromSheriff, 'traveller', 'sheriff');
          if (O.justice) shift(-O.justice, 'traveller');
          if (O.placeRobin) {
            const dest = yield* pick(side, 'potter', 'The Potter: Robin Hood appears, Revealed — where, beside Nottingham?', nbrs('nottingham', 'robin').map(d => spOpt(d)), { always: true, spaces: true });
            const r = robinP(); r.at = dest; r.rev = true;
            log({ t: 'robinAt', at: dest, why: 'potter' });
          }
          if (O.recruit && availMen().length) {
            const dest = yield* pick(side, 'miller', 'The Miller’s Son: a Hidden Merry Man joins — here or next door?', [id].concat(nbrs(id, 'robin')).map(d => spOpt(d)), { always: true, spaces: true });
            placeMen(dest, 1, false);
            log({ t: 'recruit', at: dest, n: 1, why: 'miller', by: bySide('robin').id });
          }
          if (O.removeCard) to = 'out';
          else if (O.victim) to = 'victims';
        }
      } else {
        if (O.loseSheriff) gain('sheriff', O.loseSheriff, 'traveller');
        if (O.loseCapture) capture('traveller');
        if (O.loseSubmit) setState(id, 'sub', 'traveller');
        if (O.loseRobin) { const r = robinP(); if (onMap(r.at) || r.at === 'avail') toPrison(r, 'potter'); }
        if (O.loseHenchman) { const n = addH(id, 1); if (n) log({ t: 'hench', at: id, n, why: 'miller', by: bySide('sheriff').id }); }
      }
      g.tlimbo = g.tlimbo.filter(x => x !== card);
      if (to === 'victims') g.victims.push(card); else if (to === 'out') g.tout.push(card); else g.tdisc.push(card);
      log({ t: 'tgo', card, to });
    }

    /* ---------------- the Sheriff's Plots ---------------- */
    function hireAt(id) {
      if (isRev(id)) { setState(id, 'sub', 'hire'); return; }
      const n = addH(id, id === 'nottingham' ? 4 : 2);
      log({ t: 'hire', at: id, n, by: bySide('sheriff').id });
    }
    function* patrolTo(id, o) {
      o = o || {};
      const free = n => hench(n) - (marched[n] || 0);
      const srcs = nbrs(id, 'sheriff').filter(n => free(n) > 0);
      let came = 0;
      for (const s of srcs) {
        const k = +(yield* pick('sheriff', 'patrolN', 'Patrol into ' + nm(id) + ': how many Henchmen come from ' + nm(s) + '?', numOpts(0, free(s), 'Henchman'), { always: true, pub: 'The Sheriff patrols into ' + nm(id) }));
        if (k > 0) { g.sp[s].h -= k; g.sp[id].h += k; came += k; marched[id] = (marched[id] || 0) + k; log({ t: 'patrolMove', from: s, to: id, n: k, by: bySide('sheriff').id }); }
      }
      const h = hench(id);
      let k = isForest(id) ? Math.floor(h / 2) : h;
      const hid = hiddenAt(id);
      let shown;
      if (o.all && h > 0) shown = hid;
      else shown = k >= hid.length ? hid : blind(hid, k);
      revealMen(shown);
      log({ t: 'patrol', at: id, came, n: shown.length, robin: shown.some(isRobin) || undefined, by: bySide('sheriff').id });
    }
    function captureAt(id, o) {
      o = o || {};
      let k = o.count != null ? o.count : (isRev(id) ? Math.floor(hench(id) / 2) : hench(id));
      let men = 0, robin = false, cp = 0;
      for (const m of revPlain(id)) { if (k <= 0) break; toPrison(m, 'capture'); men++; k--; }
      if (k > 0 && robinAt(id) && robinP().rev) { toPrison(robinP(), 'capture'); robin = true; k--; }
      while (k > 0 && !hiddenAt(id).length && camps(id) > 0) { removeCamp(id, 'capture'); cp++; k--; }
      log({ t: 'capture', at: id, men, robin: robin || undefined, camps: cp, by: bySide('sheriff').id });
    }

    /* ================================================================
       Deeds (after Plots & Deeds)
       ================================================================ */
    function deedMenu(side, o) {
      o = o || {};
      const out = [];
      const add = (id, bad, sub) => out.push({ id, kind: 'deed', label: D.DEEDS[side][id].name, sub: (D.DEEDS[side][id].cost ? D.DEEDS[side][id].cost + (id === 'donate' ? ' a Parish' : '') : 'Free') + ' · ' + (sub || D.DEEDS[side][id].text), bad });
      const can = (cost, sps) => (g.sh[side] < cost ? 'It costs ' + cost + '; you have ' + g.sh[side] + '.' : !sps.length ? 'Nowhere to do it.' : null);
      if (side === 'robin') {
        add('turncoat', can(1, turncoatSpaces()));
        add('donate', can(2, donateSpaces(false)));
        add('swashbuckle', can(0, swashSpaces(o.any)));
        add('inspire', can(0, inspireSpaces(o.any)));
      } else {
        add('ride', hench('nottingham') ? null : 'No Henchmen in Nottingham.');
        add('confiscate', can(0, confiscateSpaces(false)));
        add('disperse', can(3, D.PARISHES.filter(id => hench(id) > 0)));
      }
      return out;
    }
    const turncoatSpaces = () => (availMen().length ? D.PARISHES.filter(id => isRev(id) && menAt(id).length && hench(id) > 0) : []);
    const donateSpaces = cheap => D.PARISHES.filter(id => isSub(id) && menAt(id).length && (cheap || menAt(id).length >= hench(id)));
    const swashSpaces = any => {
      const r = robinP();
      if (any) return D.IDS.filter(id => plainAt(id).length || robinAt(id));
      if (r.at === 'prison') return ['prison'];
      return onMap(r.at) ? [r.at] : [];
    };
    const inspireSpaces = any => D.PARISHES.filter(id => state(id) !== 'pas' && (any ? hiddenAt(id).length : robinAt(id) && !robinP().rev));
    const confiscateSpaces = anyState => (g.car.some(c => c.at === 'avail') ? D.PARISHES.filter(id => (anyState ? state(id) !== 'pas' : isSub(id)) && hench(id) > 0) : []);
    function* doDeed(side, o) {
      o = o || {};
      const menu = o.only ? deedMenu(side, o).filter(x => o.only.indexOf(x.id) >= 0) : deedMenu(side, o);
      const k = yield* pick(side, 'deed', o.why || 'Now a Deed?', menu, { skip: o.must ? null : 'No Deed', always: true, pub: bySide(side).name + ' chooses a Deed' });
      if (!k) return;
      log({ t: 'deed', side, deed: k, by: bySide(side).id });
      if (k === 'turncoat') yield* turncoat();
      else if (k === 'donate') yield* donate(2, 2, false);
      else if (k === 'swashbuckle') yield* swashbuckle(o.any);
      else if (k === 'inspire') yield* inspire(o.any);
      else if (k === 'ride') yield* ride();
      else if (k === 'confiscate') yield* confiscate(false);
      else if (k === 'disperse') yield* disperse();
    }
    function* turncoat() {
      const id = yield* pick('robin', 'turncoat', 'Turncoat: in which Revolting Parish?', turncoatSpaces().map(x => spOpt(x, hench(x) + ' Henchmen')), { always: true, spaces: true });
      if (!id || !pay('robin', 1, 'turncoat')) return;
      remH(id, 1); placeMen(id, 1, false);
      log({ t: 'turncoat', at: id, by: bySide('robin').id });
    }
    function* donate(max, cost, cheap) {
      let n = 0;
      const done = {};
      while (n < max && g.sh.robin >= cost) {
        const sps = donateSpaces(cheap).filter(x => !done[x]);
        if (!sps.length) break;
        const id = yield* pick('robin', 'donate', 'Donate: ' + cost + ' shilling' + (cost > 1 ? 's' : '') + ' to set a Parish Revolting' + (n ? ' — another?' : '') + ' You have ' + g.sh.robin + '.', sps.map(x => spOpt(x, menAt(x).length + ' men · ' + hench(x) + ' Henchmen')), { skip: n ? 'Done' : 'None', always: true, spaces: true });
        if (!id) break;
        done[id] = 1; n++;
        pay('robin', cost, 'donate');
        setState(id, 'rev', 'donate');
      }
      return n;
    }
    function* swashbuckle(any) {
      const r = robinP();
      if (!any && r.at === 'prison') {
        const dest = yield* pick('robin', 'breakout', 'Swashbuckle: Robin Hood breaks out of Prison — into Nottingham or beside it?', ['nottingham'].concat(nbrs('nottingham', 'robin')).map(d => spOpt(d)), { always: true, spaces: true });
        r.at = dest; r.rev = true;
        log({ t: 'breakout', at: dest, by: bySide('robin').id });
        return;
      }
      let from = r.at, lead = r;
      if (any) {
        from = yield* pick('robin', 'swashFrom', 'Swashbuckle with any Merry Man: from which space?', swashSpaces(true).map(x => spOpt(x)), { always: true, spaces: true });
        lead = robinAt(from) ? robinP() : plainAt(from)[0];
      }
      const mates = menAt(from).filter(m => m !== lead);
      const goes = [lead];
      if (mates.length && (yield* yesNo('robin', 'swashMate', 'Does a Merry Man go with ' + (lead === r ? 'Robin Hood' : 'him') + '?', 'Yes, one goes too', 'No, alone'))) goes.push(mates.sort((a, b) => (b.rev ? 1 : 0) - (a.rev ? 1 : 0))[0]);
      const seen = r.rev && goes.indexOf(r) >= 0;
      const dests = [];
      for (let i = 0; i < goes.length; i++) {
        const d = yield* pick('robin', 'swashTo', (i === 0 ? (lead === r ? 'Robin Hood' : 'The leader') : 'His companion') + ' slips away from ' + nm(from) + ' to:', nbrs(from, 'robin').map(x => spOpt(x)), { always: true, spaces: true, secret: true, pub: 'Two men slip away from ' + nm(from) });
        dests.push(d);
      }
      goes.forEach((m, i) => { m.at = dests[i]; m.rev = false; });
      log({ t: 'swash', from, to: dests.slice(), robinTo: seen ? dests[0] : undefined, by: bySide('robin').id });
    }
    function* inspire(any) {
      const id = yield* pick('robin', 'inspire', 'Inspire: in which Parish?', inspireSpaces(any).map(x => spOpt(x, isRev(x) ? '+1 Justice' : 'Set Revolting')), { always: true, spaces: true, secret: !any, pub: 'Robin Hood stirs a Parish' });
      if (!id) return;
      const m = any && !robinAt(id) ? hiddenAt(id)[0] : robinP();
      m.rev = true;
      log({ t: 'inspire', at: id, robin: isRobin(m) || undefined, by: bySide('robin').id });
      if (isRev(id)) shift(-1, 'inspire'); else setState(id, 'rev', 'inspire');
    }
    function* ride() {
      const id = yield* pick('sheriff', 'ride', 'Ride: up to 4 Henchmen from Nottingham to which Parish?', D.PARISHES.map(x => spOpt(x, hench(x) + ' Henchmen there')), { always: true, spaces: true });
      const k = +(yield* pick('sheriff', 'rideN', 'How many ride to ' + nm(id) + '?', numOpts(1, Math.min(4, hench('nottingham')), 'Henchman'), { always: false }));
      g.sp.nottingham.h -= k; g.sp[id].h += k;
      log({ t: 'ride', to: id, n: k, by: bySide('sheriff').id });
    }
    function* confiscate(anyState) {
      let n = 0;
      const done = {};
      while (n < 2) {
        const sps = confiscateSpaces(anyState).filter(x => !done[x]);
        if (!sps.length) break;
        const id = yield* pick('sheriff', 'confiscate', 'Confiscate: a Carriage into which Parish?' + (n ? ' (another?)' : ''), sps.map(x => spOpt(x, hench(x) + ' Henchmen · it turns Revolting')), { skip: n ? 'Done' : null, always: true, spaces: true });
        if (!id) break;
        done[id] = 1; n++;
        const kinds = {};
        for (const c of g.car) if (c.at === 'avail') kinds[c.kind] = (kinds[c.kind] || 0) + 1;
        const kind = yield* pick('sheriff', 'carKind', 'Which Carriage goes face down into ' + nm(id) + '?', Object.keys(kinds).map(k => ({ id: k, label: D.CARRIAGES[k].name + ' · ' + kinds[k] + ' Available', sub: D.CARRIAGES[k].text })), { always: true, secret: true, pub: 'The Sheriff loads a Carriage' });
        const c = g.car.find(x => x.at === 'avail' && x.kind === kind);
        c.at = id; c.rev = false;
        log({ t: 'confiscate', at: id, id: c.id, by: bySide('sheriff').id });
        setState(id, 'rev', 'confiscate');
      }
    }
    function* disperse() {
      const id = yield* pick('sheriff', 'disperse', 'Disperse (3 shillings): which Parish?', D.PARISHES.filter(x => hench(x) > 0).map(x => spOpt(x, menAt(x).length + ' men · ' + camps(x) + ' Camp' + (camps(x) === 1 ? '' : 's'))), { always: true, spaces: true });
      if (!pay('sheriff', 3, 'disperse')) return;
      /* "up to two pieces" (4.3.3) */
      yield* removeEnemies(id, 2, 'disperse', { upTo: true });
      setState(id, 'rev', 'disperse');
    }
    /* The Sheriff removes enemy pieces to Available by kind; Hidden ones are
       taken blind. Camps only once no Merry Men are left. */
    function* removeEnemies(id, k, why, o) {
      o = o || {};
      let gone = 0;
      for (let i = 0; i < k; i++) {
        const opts = [];
        if (revPlain(id).length) opts.push({ id: 'rev', label: 'A Revealed Merry Man', sub: revPlain(id).length + ' there' });
        if (robinAt(id) && robinP().rev && !o.noRobin) opts.push({ id: 'robin', label: 'Robin Hood (Revealed)' });
        if (hiddenAt(id).length && !o.revealedOnly) opts.push({ id: 'hid', label: 'A Hidden man, unseen', sub: hiddenAt(id).length + ' there — it might be Robin Hood' });
        if (!menAt(id).length && camps(id) && !o.noCamps) opts.push({ id: 'camp', label: 'The Camp (+1 Order)' });
        const c = yield* pick(o.by || 'sheriff', 'remove', (why === 'disperse' ? 'Disperse' : 'Remove') + ' in ' + nm(id) + ': take what?' + (k > 1 ? ' (' + (i + 1) + ' of ' + k + ')' : ''), opts, { skip: o.optional || (o.upTo && i > 0) ? 'Stop' : null, always: true });
        if (!c) break;
        let m = null;
        if (c === 'rev') m = revPlain(id)[0];
        else if (c === 'robin') m = robinP();
        else if (c === 'hid') m = blind(hiddenAt(id), 1)[0];
        if (c === 'camp') { removeCamp(id, why); gone++; continue; }
        const wasRobin = isRobin(m);
        m.at = o.to || 'avail'; m.rev = false;
        if (o.to === 'prison') { m.rev = true; if (wasRobin) shift(1, 'robinTaken'); }
        log({ t: 'removed', at: id, robin: wasRobin || undefined, to: o.to || 'avail', why, by: bySide('sheriff').id });
        gone++;
      }
      return gone;
    }

    /* ================================================================
       Events. `canEvent` is the honest "something would happen" check the
       turn menu greys the Event box with.
       ================================================================ */
    const anyMen = () => g.men.some(m => onMap(m.at));
    function canEvent(half, id, actor) {
      const r = robinP();
      const rOn = onMap(r.at);
      const R = half === 'rh';
      switch (id) {
        case 2: return R ? g.taside.indexOf('bishop.1') >= 0 : true;
        case 4: return R ? g.men.some(m => !isRobin(m) && onMap(m.at)) : g.taside.indexOf('guy.1') >= 0;
        case 5: return R ? rOn : D.PARISHES.some(x => isRev(x) && revPlain(x).length + (robinAt(x) && r.rev ? 1 : 0) > 0);
        case 6: return R ? D.PARISHES.some(x => menAt(x).length) : rOn;
        case 7: return R ? D.PARISHES.some(x => !hench(x) && state(x) !== 'pas' && !isRev(x)) : subParishes() > revParishes();
        case 9: return R ? rOn && isParish(r.at) : rOn;
        case 10: return R ? nbrs('nottingham', 'robin').some(x => menAt(x).length) : confiscateSpaces(true).length > 0;
        case 11: return R ? menAt('prison').length > 0 : D.IDS.some(x => menAt(x).length && hench(x));
        case 12: return R ? anyMen() : !g.bridge;
        case 13: return R ? g.car.some(c => onMap(c.at)) && anyMen() : D.FORESTS.some(x => menAt(x).length);
        case 15: return R ? availCamps() > 0 : rOn;
        case 17: return rOn;
        case 18: return R ? D.IDS.some(x => hiddenAt(x).length) : true;
        case 19: return R ? Math.floor(menAt('prison').length / 2) > 0 : menAt('prison').filter(m => !isRobin(m)).length > 0;
        case 20: return R ? availCamps() > 0 && !camps('ollerton') : D.FORESTS.some(x => camps(x));
        case 21: return R ? rOn : true;
        case 22: return R ? anyMen() : g.car.some(c => onMap(c.at));
        case 23: return R ? g.sh.robin >= 1 && donateSpaces(true).length > 0 : D.IDS.some(x => hench(x) && hiddenAt(x).length);
        case 24: return R ? true : g.car.some(c => onMap(c.at));
        case 25: return R ? D.PARISHES.some(isSub) : D.PARISHES.some(isRev);
        case 26: return R ? g.sh[actor] >= 1 && availMen().length > 0 && D.IDS.some(x => hench(x)) : g.sh[actor] >= 2 && availH() > 0 && D.IDS.some(x => plainAt(x).length);
        case 27: return R ? D.PARISHES.some(p => nbrs(p, 'robin').some(n => hiddenAt(n).length)) : D.IDS.concat(['prison']).some(x => onMap(x) && revPlain(x).length) && revCount() >= 1;
        case 28: return R ? hench('nottingham') > 0 && availMen().length > 0 : nbrs('nottingham', 'sheriff').some(x => menAt(x).length);
        case 29: return R ? g.sh[actor] >= 1 && D.IDS.some(x => plainAt(x).length) : true;
      }
      return true;
    }
    const revCount = () => D.IDS.reduce((s, x) => s + revPlain(x).length, 0);
    /* Either player may play either half (rulebook 5.1.1). Whoever plays it
       gains and pays, and chooses spaces and Parishes; but Robin Hood's men
       are only ever moved or placed by Robin Hood's player (he alone knows
       which one is Robin), and the Henchmen and Carriages only by the
       Sheriff. Removing pieces is the player's who plays it. */
    function* doEvent(side, id, half) {
      half = half || (side === 'robin' ? 'rh' : 'sh');
      log({ t: 'event', side, id, half, by: bySide(side).id });
      const R = half === 'rh';
      const A = side;
      const r = robinP();
      switch (id) {
        case 2:
          if (R) { travIn('bishop.1'); travOut('knight', 'out'); reshuffleT(); }
          else { gain(A, 2, 'event'); travOut('monks', 'victims'); }
          return;
        case 4:
          if (R) {
            const opts = D.IDS.filter(x => plainAt(x).length).map(x => spOpt(x, plainAt(x).length + ' men'));
            const x = yield* pick('robin', 'decoy', 'A decoy: Robin Hood trades places with a Merry Man where?', opts, { always: true, spaces: true, secret: true, pub: 'Robin Hood fools them with a decoy' });
            const m = plainAt(x).sort((a, b) => (a.rev ? 1 : 0) - (b.rev ? 1 : 0))[0];
            const was = r.at;
            m.at = was; m.rev = was !== 'avail';
            r.at = x; r.rev = false;
            log({ t: 'decoy', from: was, to: onMap(was) ? null : was, by: bySide('robin').id });
          } else { travIn('guy.1'); travOut('monks', 'out'); reshuffleT(); }
          return;
        case 5:
          if (R) { if (!onMap(r.at)) return; r.rev = true; log({ t: 'robinAt', at: r.at, why: 'event' }); const n = placeMen(r.at, 1, false); if (n) log({ t: 'recruit', at: r.at, n, why: 'event', by: bySide('robin').id }); gain(A, 2, 'event'); }
          else { const sps = D.PARISHES.filter(x => isRev(x) && (revPlain(x).length || (robinAt(x) && r.rev))); const x = yield* pick(A, 'evSpace', 'Which Revolting Parish turns Submissive?', sps.map(y => spOpt(y)), { always: true, spaces: true }); if (x) setState(x, 'sub', 'event'); }
          return;
        case 6:
          if (R) { const x = yield* pick(A, 'evSpace', 'Hide every Merry Man in which Parish?', D.PARISHES.filter(y => menAt(y).length).map(y => spOpt(y, menAt(y).filter(m => m.rev).length + ' Revealed')), { always: true, spaces: true }); menAt(x).forEach(m => { m.rev = false; }); log({ t: 'hide', at: x, n: 0, why: 'event', by: bySide('robin').id }); shift(-1, 'event'); }
          else {
            if (!onMap(r.at)) return;
            const at = r.at;
            r.at = 'avail'; r.rev = false;
            log({ t: 'removed', at, robin: true, to: 'avail', why: 'poison', by: bySide('sheriff').id });
            yield* removeEnemies(at, 1, 'poison', { noCamps: true, noRobin: true, optional: true, by: A });
          }
          return;
        case 7:
          if (R) { const x = yield* pick(A, 'evSpace', 'Which Parish with no Henchmen turns Revolting?', D.PARISHES.filter(y => !hench(y) && state(y) === 'sub').map(y => spOpt(y)), { always: true, spaces: true }); if (x) setState(x, 'rev', 'event'); shift(-1, 'event'); }
          else if (subParishes() > revParishes()) shift(1, 'event');
          return;
        case 9:
          if (R) {
            if (!onMap(r.at) || !isParish(r.at)) return;
            r.rev = true; log({ t: 'robinAt', at: r.at, why: 'event' });
            if (!camps(r.at)) placeCamp(r.at, 'event');
            gain(A, 2, 'event');
          } else { if (!onMap(r.at)) return; r.rev = true; log({ t: 'robinAt', at: r.at, why: 'event' }); setState(r.at, 'sub', 'event'); }
          return;
        case 10:
          if (R) {
            let moved = 0;
            for (const n of nbrs('nottingham', 'robin')) {
              if (moved >= 4 || !menAt(n).length) continue;
              const code = yield* pick('robin', 'gather', 'Into Nottingham from ' + nm(n) + ' (up to ' + (4 - moved) + ' more):', [{ id: '0', label: 'None from here' }].concat(moveGroups(n, 4 - moved)), { always: true, secret: true, pub: 'Merry Men slip into Nottingham' });
              if (code !== '0') moved += yield* moveMen(n, 'nottingham', code, 'event', 'hide');
            }
            if (moved && plotSpaces('robin', 'rob').find(x => x.id === 'nottingham' && !x.bad) && (yield* yesNo('robin', 'robNow', 'Rob in Nottingham now?', 'Rob', 'Not now'))) yield* robAt('nottingham', {});
          } else yield* confiscate(true);
          return;
        case 11:
          if (R) {
            const dest = yield* pick('robin', 'escape', 'The Great Escape: everyone in Prison breaks out into which space beside Nottingham?', nbrs('nottingham', 'robin').map(x => spOpt(x)), { always: true, spaces: true });
            const n = menAt('prison').length;
            menAt('prison').forEach(m => { m.at = dest; m.rev = true; });
            log({ t: 'escape', at: dest, n, by: bySide('robin').id });
          } else {
            const x = yield* pick(A, 'evSpace', 'Reveal every Merry Man in which space, then Capture there?', D.IDS.filter(y => menAt(y).length && hench(y)).map(y => spOpt(y, menAt(y).length + ' men · ' + hench(y) + ' Henchmen')), { always: true, spaces: true });
            const shown = hiddenAt(x);
            revealMen(shown);
            log({ t: 'patrol', at: x, came: 0, n: shown.length, robin: shown.some(isRobin) || undefined, why: 'traitor', by: bySide('sheriff').id });
            captureAt(x);
          }
          return;
        case 12:
          if (R) {
            const from = yield* pick('robin', 'boatFrom', 'Boats: row men from which riverside space?', D.RIVERSIDE.filter(y => menAt(y).length).map(y => spOpt(y, menAt(y).length + ' men')), { always: true, spaces: true });
            const to = yield* pick('robin', 'boatTo', 'To which riverside space?', D.RIVERSIDE.filter(y => y !== from).map(y => spOpt(y)), { always: true, spaces: true });
            const code = yield* pick('robin', 'boatN', 'How many row from ' + nm(from) + ' to ' + nm(to) + '?', moveGroups(from), { always: true, secret: true, pub: 'Merry Men take to the boats' });
            yield* moveMen(from, to, code, 'boats', 'hide');
          } else {
            const x = yield* pick(A, 'bridge', 'The Bridge: across which river?', D.RIVERS.map(p => ({ id: p.join('-'), label: nm(p[0]) + ' – ' + nm(p[1]) })), { always: true });
            g.bridge = x.split('-');
            log({ t: 'bridge', a: g.bridge[0], b: g.bridge[1], by: bySide('sheriff').id });
            shift(1, 'event');
          }
          return;
        case 13:
          if (R) {
            const dest = yield* pick('robin', 'ambush', 'Ambush: gather where a Carriage stands?', D.IDS.filter(y => carsAt(y).length).map(y => spOpt(y, carsAt(y).length + ' Carriage' + (carsAt(y).length > 1 ? 's' : ''))), { always: true, spaces: true });
            for (const src of D.IDS) {
              if (src === dest || !menAt(src).length) continue;
              const code = yield* pick('robin', 'gather', 'Ambush at ' + nm(dest) + ': who comes from ' + nm(src) + '?', [{ id: '0', label: 'None from here' }].concat(moveGroups(src)), { always: true, secret: true, pub: 'Merry Men gather for an ambush' });
              if (code !== '0') yield* moveMen(src, dest, code, 'ambush', 'hide');
            }
            menAt(dest).forEach(m => { m.rev = false; });
            if (plotSpaces('robin', 'rob').find(x => x.id === dest && !x.bad)) yield* robAt(dest, {});
          } else {
            const x = yield* pick(A, 'evSpace', 'Reveal every Merry Man in which Forest?', D.FORESTS.filter(y => menAt(y).length).map(y => spOpt(y, hiddenAt(y).length + ' Hidden')), { always: true, spaces: true });
            const shown = hiddenAt(x); revealMen(shown);
            log({ t: 'patrol', at: x, came: 0, n: shown.length, robin: shown.some(isRobin) || undefined, why: 'detect', by: bySide('sheriff').id });
            shift(1, 'event');
          }
          return;
        case 15:
          if (R) { const x = yield* pick('robin', 'campForest', 'A Camp in which Forest?', D.FORESTS.map(y => spOpt(y, camps(y) + ' Camp' + (camps(y) === 1 ? '' : 's') + ' there')), { always: true, spaces: true }); g.sp[x].camps++; log({ t: 'camp', at: x, why: 'event', by: bySide('robin').id }); shift(-1, 'camp'); }
          else { if (onMap(r.at)) { r.rev = true; log({ t: 'robinAt', at: r.at, why: 'event' }); } yield* freePatrol({}); }
          return;
        case 17:
          if (R) {
            if (!onMap(r.at)) return;
            r.rev = true; log({ t: 'robinAt', at: r.at, why: 'event' });
            const x = yield* pick(A, 'evSpace', 'Which Parish next to Robin Hood turns Revolting?', nbrs(r.at, 'robin').filter(y => isParish(y) && isSub(y)).map(y => spOpt(y)), { always: true, spaces: true });
            if (x) setState(x, 'rev', 'event');
            shift(-1, 'event');
          } else {
            if (!onMap(r.at)) return;
            r.rev = true; log({ t: 'robinAt', at: r.at, why: 'event' });
            for (let i = 0; i < 2; i++) {
              const src = D.IDS.filter(y => y !== r.at && hench(y));
              const s = yield* pick('sheriff', 'redcap', 'A Henchman to join Robin Hood in ' + nm(r.at) + ' — from where? (' + (i + 1) + ' of 2)', src.map(y => spOpt(y, hench(y) + ' there')), { skip: 'No more', always: true, spaces: true });
              if (!s) break;
              g.sp[s].h--; g.sp[r.at].h++;
              log({ t: 'patrolMove', from: s, to: r.at, n: 1, why: 'event', by: bySide('sheriff').id });
            }
          }
          return;
        case 18:
          if (R) {
            const x = yield* pick(A, 'evSpace', 'Allan-a-Dale sings: reveal men in which space?', D.IDS.filter(y => hiddenPlain(y).length).map(y => spOpt(y, hiddenPlain(y).length + ' Hidden')), { always: true, spaces: true });
            let n = 0;
            if (x) {
              n = +(yield* pick(A, 'allanN', 'How many step into the song? A shilling each.', numOpts(1, hiddenPlain(x).length, 'man'), { always: false }));
              revealMen(hiddenPlain(x).slice(0, n));
              log({ t: 'allan', at: x, n, by: bySide('robin').id });
              gain(A, n, 'event');
            }
            shift(-1, 'event');
          } else yield* freePatrol({ all: true });
          return;
        case 19:
          if (R) {
            const k = Math.floor(menAt('prison').length / 2);
            const dest = yield* pick('robin', 'escape', 'The pardon: ' + k + ' walk out into which space beside Nottingham?', nbrs('nottingham', 'robin').map(x => spOpt(x)), { always: true, spaces: true });
            let list = menAt('prison');
            if (list.some(isRobin) && list.length > k) {
              const withR = yield* yesNo('robin', 'pardonRobin', 'Is Robin Hood one of the ' + k + '?', 'Yes, Robin Hood goes', 'No, he stays');
              list = list.filter(m => (withR ? true : !isRobin(m))).sort((a, b) => (isRobin(b) ? 1 : 0) - (isRobin(a) ? 1 : 0));
            }
            list.slice(0, k).forEach(m => { m.at = dest; m.rev = true; });
            log({ t: 'escape', at: dest, n: k, why: 'pardon', robin: list.slice(0, k).some(isRobin) || undefined, by: bySide('robin').id });
          } else {
            const pr = menAt('prison').filter(m => !isRobin(m));
            const k = +(yield* pick(A, 'pardonN', 'Release how many Merry Men from Prison? +1 Order for every two.', numOpts(0, pr.length, 'man'), { always: true }));
            pr.slice(0, k).forEach(m => { m.at = 'avail'; m.rev = false; });
            log({ t: 'released', n: k, why: 'pardon', by: bySide('sheriff').id });
            shift(Math.floor(k / 2), 'event');
          }
          return;
        case 20:
          if (R) { if (placeCamp('ollerton', 'event')) { g.oak = true; log({ t: 'oak' }); } }
          else { const x = yield* pick(A, 'evSpace', 'Destroy a Camp in which Forest?', D.FORESTS.filter(y => camps(y)).map(y => spOpt(y)), { always: true, spaces: true }); if (x) removeCamp(x, 'event'); }
          return;
        case 21:
          if (R) {
            if (!onMap(r.at)) return;
            r.rev = true; log({ t: 'robinAt', at: r.at, why: 'event' });
            let moved = 0;
            for (const n of nbrs(r.at, 'robin')) {
              if (moved >= 3 || !plainAt(n).length) continue;
              const opts = [{ id: '0', label: 'None from here' }].concat(moveGroups(n, 3 - moved).filter(x => !/r$/.test(x.id)));
              const code = yield* pick('robin', 'gather', 'Robin’s Horn: who comes from ' + nm(n) + '? (up to ' + (3 - moved) + ')', opts, { always: true, pub: 'Robin Hood blows his horn' });
              if (code !== '0') moved += yield* moveMen(n, r.at, code, 'horn', 'hide');
            }
            if (plotSpaces('robin', 'rob').find(x => x.id === r.at && !x.bad) && (yield* yesNo('robin', 'robNow', 'Rob in ' + nm(r.at) + ' now?', 'Rob', 'Not now'))) yield* robAt(r.at, {});
          } else {
            const k = Math.ceil(victimsN() / 2);
            const placed = {};
            for (let i = 0; i < k && availH() > 0; i++) {
              const x = yield* pick('sheriff', 'hornH', 'A common thief: a Henchman into which Parish? (' + (i + 1) + ' of ' + k + ')', D.PARISHES.map(y => spOpt(y, hench(y) + ' there')), { always: true, spaces: true });
              addH(x, 1); placed[x] = 1;
              log({ t: 'hench', at: x, n: 1, why: 'event', by: bySide('sheriff').id });
            }
            const sps = Object.keys(placed).filter(x => captureCount(x) > 0);
            const x = yield* pick(A, 'evSpace', 'Capture in one of them?', sps.map(y => spOpt(y, captureCount(y) + ' to take')), { skip: 'No', always: true, spaces: true });
            if (x) captureAt(x);
          }
          return;
        case 22:
          if (R) {
            yield* doPlots('robin', 'single', { only: 'sneak', free: true });
            let n = 0; const done = {};
            while (n < 3) {
              const sps = plotSpaces('robin', 'rob', { done }).filter(x => !x.bad);
              if (!sps.length) break;
              const x = yield* pick('robin', 'plotSpace', 'Rob, +1 to each roll: where?' + (n ? ' (another?)' : ''), sps, { skip: n ? 'Done' : 'No Rob', always: true, spaces: true });
              if (!x) break;
              done[x] = 1; n++;
              yield* robAt(x, { bonus: 1 });
            }
          } else yield* moveCarriages(1, 2, { why: 'fast' });
          return;
        case 23:
          if (R) yield* donate(3, 1, true);
          else {
            const x = yield* pick(A, 'evSpace', 'Reveal every Merry Man in which space with a Henchman?', D.IDS.filter(y => hench(y) && hiddenAt(y).length).map(y => spOpt(y, hiddenAt(y).length + ' Hidden')), { always: true, spaces: true });
            const shown = hiddenAt(x); revealMen(shown);
            log({ t: 'patrol', at: x, came: 0, n: shown.length, robin: shown.some(isRobin) || undefined, why: 'ale', by: bySide('sheriff').id });
          }
          return;
        case 24:
          if (R) {
            yield* doPlots('robin', 'single', { free: true });
            yield* doDeed('robin', { any: true, only: ['swashbuckle', 'inspire'], why: 'Maid Marian: Swashbuckle or Inspire, with any Merry Man as Robin Hood' });
          } else {
            const cid = yield* pick(A, 'marian', 'Mercy: which Carriage leaves the map?', g.car.filter(c => onMap(c.at)).map(c => ({ id: c.id, label: carriageLabel(c, true) + ' in ' + nm(c.at), space: c.at })), { always: true });
            const c = g.car.find(x => x.id === cid);
            log({ t: 'carUsed', id: c.id, from: c.at, by: bySide('sheriff').id });
            c.at = 'used'; c.rev = true;
            const x = yield* pick(A, 'evSpace', 'Which Parish turns Submissive?', D.PARISHES.filter(y => state(y) !== 'pas').map(y => spOpt(y, isSub(y) ? 'already Submissive' : '')), { always: true, spaces: true });
            setState(x, 'sub', 'event');
            if (menAt(x).length) {
              const to = yield* pick('robin', 'marianTo', 'Your men must leave ' + nm(x) + ': to where?', nbrs(x, 'robin').map(y => spOpt(y)), { always: true, spaces: true });
              const n = menAt(x).length;
              menAt(x).forEach(m => { m.at = to; });
              log({ t: 'move', from: x, to, n, why: 'mercy', by: bySide('robin').id });
            }
          }
          return;
        case 25:
          if (R) { const x = yield* pick(A, 'evSpace', 'Which Submissive Parish turns Passive for good?', D.PARISHES.filter(isSub).map(y => spOpt(y)), { always: true, spaces: true }); g.sp[x].state = 'pas'; log({ t: 'parish', at: x, st: 'pas', was: 'sub', why: 'event' }); }
          else { const x = yield* pick(A, 'evSpace', 'Which Revolting Parish turns Submissive?', D.PARISHES.filter(isRev).map(y => spOpt(y)), { always: true, spaces: true }); setState(x, 'sub', 'event'); }
          return;
        case 26:
          if (R) {
            const x = yield* pick(A, 'evSpace', 'Corruption (1 shilling): which Henchman becomes a Merry Man?', D.IDS.filter(y => hench(y)).map(y => spOpt(y, hench(y) + ' Henchmen')), { always: true, spaces: true });
            if (!pay(A, 1, 'event')) return;
            remH(x, 1); placeMen(x, 1, false);
            log({ t: 'turncoat', at: x, why: 'event', by: bySide('robin').id });
          } else {
            const x = yield* pick(A, 'evSpace', 'Hungry men defect (2 shillings): in which space?', D.IDS.filter(y => plainAt(y).length).map(y => spOpt(y, menAt(y).length + ' men')), { always: true, spaces: true });
            if (!pay(A, 2, 'event')) return;
            let n = 0;
            for (let i = 0; i < 2 && availH() > 0; i++) {
              const opts = [];
              if (revPlain(x).length) opts.push({ id: 'rev', label: 'A Revealed Merry Man' });
              if (hiddenAt(x).length) opts.push({ id: 'hid', label: 'A Hidden man, unseen', sub: 'It might be Robin Hood' });
              const c = yield* pick(A, 'remove', 'Who defects? (' + (i + 1) + ' of 2)', opts, { skip: i ? 'Stop' : null, always: true });
              if (!c) break;
              const m = c === 'rev' ? revPlain(x)[0] : blind(hiddenAt(x), 1)[0];
              const wasR = isRobin(m);
              m.at = 'avail'; m.rev = false; addH(x, 1); n++;
              log({ t: 'defect', at: x, robin: wasR || undefined, by: bySide('sheriff').id });
            }
          }
          return;
        case 27:
          if (R) {
            const opts = [];
            for (const p of D.PARISHES) for (const s of nbrs(p, 'robin')) if (hiddenAt(s).length) opts.push({ id: s + '>' + p, label: nm(s) + ' → ' + nm(p), sub: hench(p) + ' Henchmen to Nottingham', space: p });
            const x = yield* pick('robin', 'stutely', 'A cunning ruse: a Hidden man slips from where to which Parish?', opts, { always: true });
            const [from, to] = x.split('>');
            let m = hiddenPlain(from)[0];
            if (robinAt(from) && !robinP().rev) {
              if (!m || (yield* yesNo('robin', 'stutelyRobin', 'Is it Robin Hood himself who goes?', 'Robin Hood', 'A Merry Man', { secret: true }))) m = robinP();
            }
            m.at = to; m.rev = false;
            const h = hench(to);
            g.sp[to].h = 0; g.sp.nottingham.h += h;
            log({ t: 'stutely', from, to, h, by: bySide('robin').id });
          } else {
            for (let i = 0; i < 2; i++) {
              const sps = D.IDS.filter(y => revPlain(y).length);
              const x = yield* pick(A, 'gallows', 'To the gallows: a Revealed Merry Man from where? (' + (i + 1) + ' of 2)', sps.map(y => spOpt(y, revPlain(y).length + ' Revealed')), { always: true, spaces: true });
              if (!x) break;
              toPrison(revPlain(x)[0], 'gallows');
              log({ t: 'captured', at: x, n: 1, why: 'gallows' });
            }
          }
          return;
        case 28:
          if (R) {
            const k = Math.min(2, hench('nottingham'), availMen().length);
            const n = +(yield* pick(A, 'fairN', 'Nottingham Fair: how many Henchmen become Merry Men?', numOpts(1, k, 'Henchman'), {}));
            remH('nottingham', n); placeMen('nottingham', n, false);
            log({ t: 'turncoat', at: 'nottingham', n, why: 'fair', by: bySide('robin').id });
          } else {
            for (let i = 0; i < 2; i++) {
              const sps = nbrs('nottingham', 'sheriff').filter(y => menAt(y).length);
              const x = yield* pick(A, 'evSpace', 'Too much ale: send a Merry Man home from where? (' + (i + 1) + ' of 2)', sps.map(y => spOpt(y, menAt(y).length + ' men')), { skip: i ? 'No more' : null, always: true, spaces: true });
              if (!x) break;
              yield* removeEnemies(x, 1, 'ale', { noCamps: true, by: A });
            }
          }
          return;
        case 29:
          if (R) {
            const x = yield* pick(A, 'evSpace', 'The wedding (1 shilling): in which space do a Merry Man and up to 2 Henchmen leave the game?', D.IDS.filter(y => plainAt(y).length).map(y => spOpt(y, hench(y) + ' Henchmen')), { always: true, spaces: true });
            if (!pay(A, 1, 'event')) return;
            const m = plainAt(x).sort((a, b) => (b.rev ? 1 : 0) - (a.rev ? 1 : 0))[0];
            m.at = 'gone'; g.mGone++;
            const h = remH(x, 2, true);
            log({ t: 'wedding', at: x, h, by: bySide('robin').id });
            shift(-1, 'event');
          } else {
            gain(A, 2, 'event');
            const x = yield* pick('sheriff', 'hench2', 'Up to two Henchmen into which Parish?', D.PARISHES.map(y => spOpt(y, hench(y) + ' there')), { always: true, spaces: true });
            const n = addH(x, 2);
            log({ t: 'hench', at: x, n, why: 'event', by: bySide('sheriff').id });
          }
          return;
      }
    }
    function* freePatrol(o) {
      marched = {};
      const sps = plotSpaces('sheriff', 'patrol').filter(x => !x.bad);
      const x = yield* pick('sheriff', 'plotSpace', 'A free Single Patrol: which destination?', sps, { always: true, spaces: true });
      if (x) yield* patrolTo(x, o);
    }
    function travIn(card) { g.taside = g.taside.filter(x => x !== card); g.tdeck.push(card); log({ t: 'tin', card }); }
    function travOut(kind, to) {
      let c = g.tdeck.find(x => K(x) === kind), from = 'deck';
      if (!c) { c = g.tdisc.find(x => K(x) === kind); from = 'disc'; }
      if (!c) return false;
      if (from === 'deck') g.tdeck = g.tdeck.filter(x => x !== c); else g.tdisc = g.tdisc.filter(x => x !== c);
      if (to === 'victims') g.victims.push(c); else g.tout.push(c);
      log({ t: 'tout', card: c, to });
      return true;
    }
    function reshuffleT() { g.tdeck = shuffle(g.tdeck, rand); log({ t: 'tshuffle' }); }

    /* ---------------- the Fortune events ---------------- */
    function* fortune(id) {
      log({ t: 'fortune', id });
      if (id === 1) {
        const onH = D.IDS.reduce((s, x) => s + hench(x), 0);
        const max = Math.min(onH, subParishes());
        let n = 0;
        if (max > 0) n = +(yield* pick('sheriff', 'marketN', 'Day of Market: send how many Henchmen home, a shilling each?', numOpts(0, max, 'Henchman'), { always: true }));
        for (let i = 0; i < n; i++) {
          const x = yield* pick('sheriff', 'marketFrom', 'A Henchman goes home from where? (' + (i + 1) + ' of ' + n + ')', D.IDS.filter(y => hench(y)).map(y => spOpt(y, hench(y) + ' there')), { always: true, spaces: true });
          remH(x, 1);
          log({ t: 'home', at: x, n: 1, by: bySide('sheriff').id });
        }
        gain('sheriff', n, 'market');
        const half = Math.floor(n / 2);
        if (half > 0) {
          const sps = D.IDS.filter(y => plainAt(y).length);
          const x = yield* pick('robin', 'marketMM', 'Send one Merry Man home for ' + half + ' shilling' + (half > 1 ? 's' : '') + '? From where?', sps.map(y => spOpt(y, menAt(y).length + ' men')), { skip: 'Keep him', always: true, spaces: true });
          if (x) { const m = plainAt(x).sort((a, b) => (b.rev ? 1 : 0) - (a.rev ? 1 : 0))[0]; m.at = 'avail'; m.rev = false; log({ t: 'home', at: x, n: 1, men: true, by: bySide('robin').id }); gain('robin', half, 'market'); }
        }
      } else if (id === 3) {
        const kn = g.tdeck.find(x => K(x) === 'knight');
        if (kn && (yield* yesNo('sheriff', 'eleanor', 'Queen Eleanor: send a Noble Knight from the Travellers to the Victims?', 'Yes', 'No'))) travOut('knight', 'victims');
        shift(victimsN() >= 4 ? 1 : -1, 'event');
      } else if (id === 8) {
        let n = 0;
        while (n < 2 && g.sh.sheriff >= 2) {
          const sps = D.PARISHES.filter(x => isRev(x) && hench(x) > menAt(x).length);
          const x = yield* pick('sheriff', 'plotSpace', 'Warden of the Forest: Hire (2 shillings) in a Revolting Parish?' + (n ? ' Another?' : ''), sps.map(y => spOpt(y, 'Set Submissive')), { skip: 'No', always: true, spaces: true });
          if (!x) break;
          n++; pay('sheriff', 2, 'hire'); hireAt(x);
        }
        yield* donate(1, 2, false);
        shift(subParishes() >= 5 ? 1 : -1, 'event');
      } else if (id === 14) {
        if (yield* yesNo('sheriff', 'truce', 'Temporary Truce: march every Henchman into Submissive spaces for +1 Order?', 'Yes, +1 Order', 'No')) {
          yield* redeployHench(true);
          shift(1, 'event');
        }
        if (yield* yesNo('robin', 'truce', 'Temporary Truce: take every Merry Man to Camps or Forests, all Hidden, for +1 Justice?', 'Yes, +1 Justice', 'No')) {
          yield* redeployMen(true, false);
          shift(-1, 'event');
        }
      } else if (id === 16) {
        for (const side of [g.first, other(g.first)]) {
          const can = plotMenu(side, 'single').some(x => !x.bad);
          const c = yield* pick(side, 'rain', 'Heavy Rain: a Single Plot, or 2 shillings?', [{ id: 'plot', label: 'A Single Plot', sub: 'At its usual cost', bad: can ? null : 'No Plot is possible now.' }, { id: 'cash', label: 'Take 2 shillings' }], { always: true });
          if (c === 'plot') yield* doPlots(side, 'single');
          else gain(side, 2, 'rain');
        }
      }
    }

    /* ================================================================
       The Royal Inspection (the SOP sheet), each phase its own page
       ================================================================ */
    function* inspection(last) {
      g.phase = 'inspection';
      const RI = g.ri = { ballad: g.ballad, last, pages: [] };
      const page = (k, lines) => { RI.pages.push({ k, lines }); };
      const fav0 = g.favour;
      /* 1 Unrest */
      const subs = subParishes();
      const k = subs >= 5 ? 1 : subs >= 3 ? -1 : subs >= 1 ? -2 : -3;
      shift(k, 'unrest');
      page('unrest', [subs + ' Submissive Parish' + (subs === 1 ? '' : 'es') + ': ' + (k > 0 ? '+1 Order' : '+' + (-k) + ' Justice') + '. The Royal Favour is at ' + favourText(g.favour) + '.']);
      log({ t: 'unrest', subs, k, now: g.favour });
      RI.step = 'unrest';
      yield* hold({ k: 'ri', step: 'unrest' });
      if (last) { g.lastRi = clone(RI); finish('king'); }
      if (Math.abs(g.favour) >= D.WIN_AT) { g.lastRi = clone(RI); finish('favour'); }
      /* 2 Mischief */
      RI.step = 'mischief';
      const forestCamps = D.FORESTS.reduce((s, x) => s + camps(x), 0) + camps('ollerton');
      const lines = [];
      if (forestCamps) { gain('robin', forestCamps, 'poach'); lines.push('Poaching: ' + forestCamps + ' shilling' + (forestCamps > 1 ? 's' : '') + ' for the Camps in the Forests.'); }
      const robSp = plotSpaces('robin', 'rob').filter(x => !x.bad);
      if (robSp.length) {
        const x = yield* pick('robin', 'plotSpace', 'Mischief: a free Single Rob?', robSp, { skip: 'No Rob', always: true, spaces: true, pub: 'Robin Hood’s mischief' });
        if (x) { yield* robAt(x, {}); lines.push('A Rob in ' + nm(x) + '.'); }
      }
      const dn = yield* donate(2, 2, false);
      if (dn) lines.push('Donated in ' + dn + ' Parish' + (dn > 1 ? 'es' : '') + '.');
      const pris = menAt('prison');
      const free = Math.floor(pris.length / 2);
      if (free > 0) {
        let out = pris.filter(m => !isRobin(m)).slice(0, free);
        if (pris.some(isRobin) && (yield* yesNo('robin', 'freeRobin', 'Half your men in Prison go free: is Robin Hood one of them?', 'Yes, free Robin Hood', 'No'))) out = [robinP()].concat(pris.filter(m => !isRobin(m))).slice(0, free);
        out.forEach(m => { m.at = 'avail'; m.rev = false; });
        log({ t: 'released', n: free, robin: out.some(isRobin) || undefined, why: 'mischief' });
        lines.push(free + ' m' + (free > 1 ? 'en' : 'an') + ' freed from Prison' + (out.some(isRobin) ? ', Robin Hood among them' : '') + '.');
      }
      page('mischief', lines.length ? lines : ['Nothing stirs.']);
      yield* hold({ k: 'ri', step: 'mischief' });
      /* 3 Governance */
      RI.step = 'governance';
      const gl = [];
      const subSp = D.IDS.filter(isSub).length;
      gain('sheriff', subSp, 'governance');
      gl.push(subSp + ' shilling' + (subSp === 1 ? '' : 's') + ' from the Submissive spaces.');
      for (const x of D.PARISHES.filter(isRev)) {
        const h = Math.floor(hench(x) / 2);
        if (h) { remH(x, h); log({ t: 'home', at: x, n: h, why: 'governance' }); gl.push(nm(x) + ': ' + h + ' Henchm' + (h > 1 ? 'en' : 'an') + ' leave.'); }
        if (hench(x) > menAt(x).length) { setState(x, 'sub', 'governance'); gl.push(nm(x) + ' is Submissive again.'); }
      }
      page('governance', gl);
      yield* hold({ k: 'ri', step: 'governance' });
      /* 4 Redeployment */
      RI.step = 'redeploy';
      yield* redeployHench(false);
      for (const c of g.car) if (c.at === 'used') { c.at = 'avail'; c.rev = false; }
      yield* redeployMen(false, true);
      page('redeploy', ['Henchmen back to Submissive spaces, Merry Men to the Forests and Camps, all Hidden. Used Carriages are Available again.']);
      yield* hold({ k: 'ri', step: 'redeploy' });
      /* 5 Reset */
      RI.step = 'reset';
      g.tdeck = shuffle(g.tdeck.concat(g.tdisc), rand); g.tdisc = [];
      log({ t: 'tshuffle' });
      g.first = 'robin';
      page('reset', ['The Travellers are shuffled. Robin Hood is first eligible.']);
      RI.favour = { from: fav0, to: g.favour };
      g.lastRi = clone(RI);
      g.ri = null;
      g.phase = 'play';
    }
    /* Henchmen must leave Revolting Parishes and Forests for Submissive
       spaces; others may go home to Nottingham. `all`: Temporary Truce. */
    function* redeployHench(all) {
      const subs = D.IDS.filter(isSub);
      const must = D.IDS.filter(x => hench(x) && (all ? !isSub(x) : (isRev(x) || isForest(x))));
      for (const x of must) {
        while (hench(x)) {
          const h = hench(x);
          const to = yield* pick('sheriff', 'redeployH', 'Redeploy: the ' + h + ' Henchm' + (h > 1 ? 'en' : 'an') + ' in ' + nm(x) + ' must go to a Submissive space. Where?', subs.map(y => spOpt(y, hench(y) + ' there')), { always: true, spaces: true, pub: 'The Sheriff redeploys' });
          const n = h > 1 ? +(yield* pick('sheriff', 'redeployN', 'How many go to ' + nm(to) + '?', numOpts(1, h, 'Henchman'), { always: true })) : 1;
          g.sp[x].h -= n; g.sp[to].h += n;
          log({ t: 'redeployH', from: x, to, n, by: bySide('sheriff').id });
        }
      }
      if (all) return;
      const home = D.IDS.filter(x => x !== 'nottingham' && hench(x));
      if (home.length) {
        const ids = yield* pick('sheriff', 'homeH', 'Bring Henchmen home to Nottingham? Every Henchman in each space you pick goes.', home.map(y => spOpt(y, hench(y) + ' there')), { multi: true, min: 0, spaces: true });
        for (const x of ids) { const n = hench(x); g.sp[x].h = 0; g.sp.nottingham.h += n; log({ t: 'redeployH', from: x, to: 'nottingham', n, by: bySide('sheriff').id }); }
      }
    }
    /* Merry Men must leave Submissive spaces for Forests or Camps; others may
       do the same; then everyone is Hidden, Robin Hood comes back from
       Available, and may secretly change places with any Merry Man. */
    function* redeployMen(all, inspect) {
      const homes = () => D.IDS.filter(x => x !== 'ollerton' && (isForest(x) || camps(x) > 0));
      /* Men already at a Camp are at a Camp: they may stay. */
      const must = D.IDS.filter(x => menAt(x).length && homes().indexOf(x) < 0 && (all || isSub(x)));
      for (const x of must) {
        while (menAt(x).length) {
          const to = yield* pick('robin', 'redeployM', 'Redeploy: your men in ' + nm(x) + ' must go to a Forest or a Camp. Where?', homes().filter(y => y !== x).map(y => spOpt(y, menAt(y).length + ' there')), { always: true, spaces: true, pub: 'Robin Hood redeploys' });
          const code = yield* pick('robin', 'redeployN', 'Who goes from ' + nm(x) + ' to ' + nm(to) + '?', moveGroups(x), { always: true, secret: true, pub: 'Robin Hood redeploys' });
          yield* moveMen(x, to, code, 'redeploy', 'keep');
        }
      }
      if (!all) {
        const may = D.IDS.filter(x => menAt(x).length && homes().indexOf(x) < 0);
        for (const x of may) {
          const to = yield* pick('robin', 'redeployM', 'Your men in ' + nm(x) + ' may stay, or move to a Forest or Camp:', homes().map(y => spOpt(y)), { skip: 'They stay', always: true, spaces: true, pub: 'Robin Hood redeploys' });
          if (!to) continue;
          const code = yield* pick('robin', 'redeployN', 'Who goes from ' + nm(x) + ' to ' + nm(to) + '?', moveGroups(x), { always: true, secret: true, pub: 'Robin Hood redeploys' });
          yield* moveMen(x, to, code, 'redeploy', 'keep');
        }
      }
      for (const m of g.men) if (onMap(m.at)) m.rev = false;
      log({ t: 'allHidden' });
      if (!inspect) return;
      const r = robinP();
      if (r.at === 'avail') {
        const x = yield* pick('robin', 'robinBack', 'Robin Hood returns from Available: into which Forest?', D.FORESTS.map(y => spOpt(y)), { always: true, spaces: true, pub: 'Robin Hood returns' });
        r.at = x; r.rev = false;
        log({ t: 'robinBack', at: x });
      }
      if (onMap(r.at) && g.men.some(m => !isRobin(m) && onMap(m.at))) {
        const opts = [{ id: 'stay', label: 'He stays in ' + nm(r.at) }].concat(D.IDS.filter(y => plainAt(y).length && y !== r.at).map(y => spOpt(y, 'Swap with a man there')));
        const x = yield* pick('robin', 'robinSwap', 'Secretly swap Robin Hood with a Merry Man elsewhere?', opts, { always: true, secret: true, pub: 'Robin Hood may change places in secret' });
        if (x && x !== 'stay') { const m = plainAt(x)[0]; const was = r.at; m.at = was; r.at = x; }
      }
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
        if (q.ask) { g.prompts = q.ask; g.answers = {}; return; }
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
    function checkTurn(p, pr, a) {
      if (a.t !== 'turn') return no('Choose what to do this card.');
      const fresh = turnMenu(p.side, pr.card, pr.first).find(x => x.id === String(a.id));
      if (!fresh) return no('That is not one of the choices.');
      if (fresh.bad) return no(fresh.bad);
      return yes({ a: { t: 'turn', id: fresh.id } });
    }
    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The game is over.');
      if (g.hold) return no('Watch the telly first.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const pr = g.prompts.find(x => x.seat === seatId);
      if (!pr) return no(g.prompts.length ? 'It is not your turn — ' + (P(g.prompts[0].seat) || {}).name + ' is choosing.' : 'It is not your turn.');
      if (a.n != null && +a.n !== pr.n) return no('That question has moved on.');
      const r = pr.t === 'turn' ? checkTurn(p, pr, a) : pr.t === 'pick' ? checkPick(pr, a) : no('That is not something you can do now.');
      if (!r.ok) return r;
      g.answers[seatId] = r.a;
      g.prompts = g.prompts.filter(x => x !== pr);
      g.actN++;
      if (!g.prompts.length) { const ans = g.answers; g.answers = {}; g.advance(ans); }
      return yes();
    };

    /* ================================================================
       The views
       ================================================================ */
    /* A piece's public face: a Hidden man is just a Hidden man. */
    function spaceView(id) {
      const ms = menAt(id);
      const r = robinP();
      return { h: hench(id), camps: camps(id), state: state(id),
        hidden: ms.filter(m => !m.rev).length, rev: ms.filter(m => m.rev && !isRobin(m)).length,
        robin: r.at === id && r.rev ? true : undefined,
        cars: carsAt(id).map(c => ({ id: c.id, kind: c.rev ? c.kind : null })) };
    }
    const pubPrompt = pr => ({ n: pr.n, seat: pr.seat, t: pr.t, what: pr.what || null, why: pr.pub || pr.why, secret: !!pr.secret });
    g.publicView = function () {
      const spaces = {};
      for (const id of D.IDS) spaces[id] = spaceView(id);
      const r = robinP();
      const robinWhere = r.rev || r.at === 'prison' || r.at === 'avail' ? r.at : null;
      const R = g.rob;
      return {
        v: VERSION, gid: g.gid, phase: g.phase, ballad: g.ballad, cardN: g.cardN, turnN: g.turnN,
        card: g.card, deckN: g.deck.length, toInspection: g.deck.findIndex(x => D.EVENTS[x].inspection) + 1, played: g.played.slice(),
        first: g.first, boxes: Object.assign({}, g.boxes), active: g.active || null,
        favour: g.favour, sh: Object.assign({}, g.sh), bridge: g.bridge ? g.bridge.slice() : null, oak: g.oak,
        spaces,
        prison: { n: menAt('prison').length, robin: r.at === 'prison' || undefined },
        avail: { men: availMen().length, robin: r.at === 'avail' || undefined, h: availH(), camps: availCamps(), cars: g.car.filter(c => c.at === 'avail').length },
        gone: { men: g.mGone, h: g.hGone },
        robinAt: robinWhere,
        used: g.car.filter(c => c.at === 'used').map(c => c.kind),
        trav: { deck: g.tdeck.length, disc: g.tdisc.slice(), victims: g.victims.slice(), out: g.tout.slice(), aside: g.taside.slice() },
        players: g.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, side: p.side, i: p.i, sh: g.sh[p.side] })),
        prompts: g.prompts.map(pubPrompt), prompt: g.prompts.length ? pubPrompt(g.prompts[0]) : null,
        /* While a Rob is held, the room sees who robs what — not the die. */
        rob: R ? Object.assign({ n: R.n, stage: R.stage, at: R.at, robbers: R.robbers, robin: R.robin, target: R.target, card: R.card || null, opt: R.opt || null, kind: R.kind || null, def: R.def, hench: R.hench, die: R.die, bonus: R.bonus, noRoll: R.noRoll || false },
          R.stage === 'landed' ? { face: R.face, roll: R.roll, total: R.total, need: R.need, win: R.win } : {}) : null,
        hold: g.hold ? clone(g.hold) : null,
        ri: g.ri ? clone(g.ri) : null, lastRi: g.lastRi ? clone(g.lastRi) : null,
        log: g.log.slice(-80).map(e => Object.assign({}, e)),
        logN: g.log.length,
        result: g.result
      };
    };
    g.seatView = function (id) {
      const p = P(id);
      if (!p) return null;
      const pr = g.prompts.find(x => x.seat === id);
      const out = { id, v: VERSION, side: p.side, prompt: pr && !g.hold ? clone(pr) : null };
      if (out.prompt && pr.t === 'turn') out.prompt.options = turnMenu(p.side, pr.card, pr.first);
      if (p.side === 'robin') { const r = robinP(); out.robinAt = r.at; out.robinRev = r.rev; }
      else {
        out.cars = g.car.filter(c => onMap(c.at)).map(c => ({ id: c.id, at: c.at, kind: c.kind, rev: c.rev }));
        const k = {};
        for (const c of g.car) if (c.at === 'avail') k[c.kind] = (k[c.kind] || 0) + 1;
        out.availCars = k;
      }
      /* The Rob in progress: the robber's own die is no secret from him once
         it is rolled, but it is held back with everyone's until the show. */
      return out;
    };

    /* For the tests: every piece and card is somewhere, exactly once. */
    g.census = function () {
      const bad = [];
      if (g.men.length !== D.PIECES.merry) bad.push(g.men.length + ' Merry Men');
      const okAt = { avail: 1, prison: 1, gone: 1 };
      for (const m of g.men) if (!okAt[m.at] && !onMap(m.at)) bad.push(m.id + ' at ' + m.at);
      if (g.men.some(m => m.at === 'ollerton')) bad.push('a Merry Man on Ollerton Hill');
      if (availH() < 0) bad.push('Henchmen below zero: ' + availH());
      for (const id of D.IDS) if (hench(id) < 0 || camps(id) < 0) bad.push('negative pieces in ' + id);
      if (hench('ollerton')) bad.push('Henchmen on Ollerton Hill');
      if (availCamps() < 0) bad.push('more than 5 Camps');
      if (g.car.length !== 6) bad.push(g.car.length + ' Carriages');
      for (const c of g.car) if (c.at === 'nottingham' || c.at === 'ollerton') bad.push('a Carriage in ' + c.at);
      if (g.sh.robin < 0 || g.sh.sheriff < 0) bad.push('shillings below zero');
      if (g.favour === 0 || Math.abs(g.favour) > D.FAVOUR_MAX) bad.push('favour ' + g.favour);
      const seen = {};
      const note = id => { seen[id] = (seen[id] || 0) + 1; };
      g.tdeck.forEach(note); g.tdisc.forEach(note); g.victims.forEach(note); g.tout.forEach(note); g.taside.forEach(note); g.tlimbo.forEach(note);
      if (Object.keys(seen).length !== D.TRAVELLER_IDS.length) bad.push(Object.keys(seen).length + ' Travellers, not ' + D.TRAVELLER_IDS.length);
      if (Object.keys(seen).some(k => seen[k] > 1)) bad.push('a Traveller in two places');
      const evs = g.deck.length + g.played.length + (g.card != null && g.played.indexOf(g.card) < 0 ? 1 : 0);
      if (evs !== 24) bad.push(evs + ' Ballad cards, not 24');
      for (const id of D.PARISHES) if (['sub', 'rev', 'pas'].indexOf(g.sp[id].state) < 0) bad.push(id + ' has no state');
      return bad;
    };
    g.X = { menAt, hiddenAt, hiddenPlain, revPlain, plainAt, robinP, hench, camps, state, isSub, isRev, availMen, availH, availCamps, nbrs, plotMenu, plotSpaces, deedMenu, captureCount, turnMenu, canEvent, robTargets };
  }

  const Engine = { VERSION, LEVELS, SIDES, create, rngFrom, shuffle, K, adjacent, neighbours, robOdds, stepFavour, favourText, other };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.RhEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
