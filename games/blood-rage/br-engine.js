/* Blood Rage — the rules.
 *
 * No DOM, no timers, one seeded rng. The display holds the only Game; phones
 * and house clans send it answers to the prompts it opens.
 *
 * Shape (the same one Nidavellir and Saint Petersburg use, grown to allow
 * several prompts at once because drafting, battle cards and the discard are
 * all simultaneous at a real table):
 *
 *   prompts  — questions waiting on a seat. Several may be open together.
 *   steps    — scheduled machinery. run() never takes a step while a prompt is
 *              open, so the table cannot move on over somebody's question.
 *   hold     — the table itself is busy (opts.clashShow: the telly is playing
 *              a battle out; opts.ageShow: the room is reading the Age's
 *              card). Nobody is asked anything; run() waits until the
 *              display calls release(). Headless games never set one.
 *
 * A consequence raised while a step or an answer is being carried out is
 * queued IN FRONT of whatever was already scheduled (`push` into the current
 * buffer), so "the Troll kills the Warriors, then Frigga's Succor, then Thor's
 * Domain" happens in that order before the next player's turn.
 */
(function (root) {
  'use strict';
  const D = root.BRData;
  const VERSION = 2;

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
  const FJORD_IDS = D.FJORDS.map(f => f.id);
  const E_isFjord = loc => FJORD_IDS.indexOf(loc) >= 0;
  const isFjord = loc => FJORD_IDS.indexOf(loc) >= 0;
  const isProv = loc => !!D.prov(loc);
  const onBoardLoc = loc => isFjord(loc) || isProv(loc);

  /* ================================================================ */
  let GID = 0;
  const LEVELS = ['easy', 'medium', 'hard'];
  function Game(opts) {
    const g = this;
    g.gid = ++GID;
    g.opts = Object.assign({ ks: false, draft1: true, clashShow: false, ageShow: false, ragShow: false, mystics: false, gods: false }, opts.opts || {});
    g.seed = opts.seed >>> 0;
    g.r = rng(g.seed || 1);
    const n = opts.players.length;
    if (n < 2 || n > 5) throw new Error('Blood Rage seats 2 to 5 clans');
    /* Clans: whoever asked for one gets it (the first asker wins a clash), everyone
       else the free ones in the box's order — so a table that chooses nothing is
       dealt Wolf, Raven, Serpent, Bear, Ram by seat, as before. */
    const clanIds = [], taken = new Set();
    opts.players.forEach((p, i) => { if (p.clan && D.CLANS.some(c => c.id === p.clan) && !taken.has(p.clan)) { clanIds[i] = p.clan; taken.add(p.clan); } });
    opts.players.forEach((p, i) => { if (!clanIds[i]) { const c = D.CLANS.find(x => !taken.has(x.id)); clanIds[i] = c.id; taken.add(c.id); } });
    g.players = opts.players.map((p, i) => { const C = D.CLANS.find(c => c.id === clanIds[i]); return {
      id: String(p.id), name: p.name, hex: p.hex || C.hex, bot: !!p.bot,
      /* a house clan's difficulty: public, the room chose it (br-bots reads it) */
      level: p.bot ? (LEVELS.indexOf(p.level) >= 0 ? p.level : 'medium') : null,
      clan: C.id, clanName: C.name, clanHex: C.hex,
      stats: { rage: 0, axes: 0, horns: 0 },
      rage: D.STATS.rage[0], glory: 0,
      hand: [], quests: [], pack: [],
      up: { leader: [], warrior: [], ship: [], monster: [], clan: [] }
    }; });
    g.cards = {};
    g.figs = [];
    for (const p of g.players) {
      g.figs.push({ id: p.id + ':L', owner: p.id, kind: 'leader', at: 'R' });
      g.figs.push({ id: p.id + ':S', owner: p.id, kind: 'ship', at: 'R' });
      for (let k = 1; k <= D.FIGURES.warriors; k++) g.figs.push({ id: p.id + ':W' + k, owner: p.id, kind: 'warrior', at: 'R' });
      /* Mystics wait in the box ('X') until a Mystic Clan Upgrade brings one into the reserve */
      if (g.opts.mystics) for (let k = 1; k <= D.FIGURES.mystics; k++) g.figs.push({ id: p.id + ':Y' + k, owner: p.id, kind: 'mystic', at: 'X' });
    }
    /* the board */
    g.prov = {};
    const toks = shuffle(D.PILLAGE_TOKENS.slice(), g.r);
    D.RING.forEach((id, i) => { g.prov[id] = { destroyed: false, pillaged: false, token: toks[i] }; });
    g.prov.ygg = { destroyed: false, pillaged: false, token: 'all' };
    const rag = shuffle(D.RING.slice(), g.r);
    g.ragnarok = rag.slice(0, 3);                        // Ages 1, 2, 3
    const pre = rag.slice(3, 3 + D.PRE_DESTROYED[n]);
    for (const id of pre) g.prov[id].destroyed = true;
    g.preDestroyed = pre;
    g.doom = g.ragnarok[0];
    /* Gods of Asgard: two of the six, placed on the provinces of the Ragnarök
       tokens that went back in the box — the same spare tokens every Age. */
    g.gods = [];
    g.godTokens = rag.slice(3 + D.PRE_DESTROYED[n]);
    if (g.opts.gods) {
      g.gods = shuffle(D.DEITY_IDS.slice(), g.r).slice(0, 2).map(id => ({ id, at: null }));
    }
    g.discard = [];
    g.first = Math.floor(g.r() * n);
    g.cur = g.first;
    g.age = 0;
    g.phase = 'setup';
    g.prompts = [];
    g.hold = null;
    g.steps = [];
    g.buf = null;
    g.n = 0;
    g.log = [];
    g.battle = null;
    g.draft = null;
    g.result = null;
    g.ageBase = {};       // each clan's Glory as the Age began
    g.ageShow = null;     // the card for the Age just ended (opts.ageShow)
    g.ragShow = null;     // what Ragnarök just did, for the scene (opts.ragShow)
    g.turns = 0;
    g.push(() => g.startAge(1));
    g.run();
  }
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
      if (++guard > 200000) throw new Error('Blood Rage engine ran away');
      const s = this.steps.shift();
      this.exec(s);
    }
  };
  P.say = function (e) { e.age = this.age; this.log.push(e); };

  /* Open a question. `done(answer)` carries it out; `check(answer)` returns a
     reason to refuse, or null. The same prompt object is what the phone and
     the house clan see (minus the two functions). */
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
    const pr = this.promptFor(id);
    if (!pr) return { ok: false, why: 'Nothing is being asked of you right now.' };
    if (!a || typeof a !== 'object') return { ok: false, why: 'That is not an answer.' };
    let why;
    try { why = pr.check(a); } catch (e) { why = 'That is not an answer.'; }
    if (why) return { ok: false, why };
    this.prompts.splice(this.prompts.indexOf(pr), 1);
    this.exec(() => pr.done(a));
    this.run();
    return { ok: true };
  };
  P.hurried = function (ids) { this.say({ t: 'hurried', who: ids.slice() }); };
  /* The display has finished showing whatever the table was held for. */
  P.release = function (t) {
    if (!this.hold || (t && this.hold.t !== t)) return false;
    this.hold = null;
    this.run();
    return true;
  };

  /* ---------------- lookups ---------------- */
  P.seat = function (id) { return this.players.find(p => p.id === id) || null; };
  P.idx = function (id) { return this.players.findIndex(p => p.id === id); };
  P.fig = function (id) { return this.figs.find(f => f.id === id) || null; };
  P.card = function (id) { return this.cards[id] || null; };
  P.def = function (id) { const c = this.cards[id]; return c ? D.CARDS[c.key] : null; };
  P.left = function (i, k) { return (i + (k || 1)) % this.players.length; };

  P.statVal = function (p, s) { return D.STATS[s][p.stats[s]]; };
  P.raise = function (p, s, why) {
    if (p.stats[s] >= 5) return false;
    p.stats[s]++;
    this.say({ t: 'stat', by: p.id, stat: s, to: this.statVal(p, s), why });
    return true;
  };
  P.gain = function (p, glory, why) {
    if (!glory) return;
    p.glory += glory;
    this.say({ t: 'glory', by: p.id, n: glory, why, ph: this.phase });
  };
  /* Every upgrade of a given effect this clan has on its sheet. */
  P.ups = function (p, fx) {
    const out = [];
    for (const k of D.UPGRADE_KINDS) for (const cid of p.up[k]) { const d = this.def(cid); if (d && d.fx === fx) out.push(this.cards[cid]); }
    return out;
  };
  P.has = function (p, fx) { return this.ups(p, fx).length > 0; };

  /* ---------------- the gods (Gods of Asgard) ---------------- */
  P.godOf = function (prov) { const d = this.gods.find(x => x.at === prov); return d ? d.id : null; };
  /* A god rules its province and the fjords supporting it: a battle is always
     over a province, so asking of the battle's province is asking of both. */
  P.godHere = function (prov, id) { return !!prov && this.godOf(prov) === id; };
  /* Setup, and again at the start of the Second and Third Ages: one spare
     Ragnarök token drawn for each god. A token whose province Fenrir has since
     destroyed is set aside (a ruling: no god stands on a dead province). */
  P.placeGods = function () {
    const g = this;
    const pool = shuffle(g.godTokens.filter(id => g.alive(id)), g.r);
    for (const d of g.gods) d.at = pool.length ? pool.shift() : null;
    g.say({ t: 'gods', gods: g.gods.map(d => ({ id: d.id, at: d.at })) });
  };
  /* After ANY pillage of a province with a god in it, won or lost, the
     pillager must move the god: to a province with no god, not pillaged, not
     destroyed. None such, and it stays. */
  P.moveGod = function (p, prov) {
    const g = this;
    const d = g.gods.find(x => x.at === prov);
    if (!d) return;
    const to = Object.keys(g.prov).filter(id => id !== prov && g.alive(id) && !g.prov[id].pillaged && !g.godOf(id));
    if (!to.length) { g.say({ t: 'godStays', god: d.id, prov }); return; }
    const go = dest => { d.at = dest; g.say({ t: 'godMove', by: p.id, god: d.id, from: prov, to: dest }); };
    if (to.length === 1) { go(to[0]); return; }
    g.ask(p.id, 'god', { why: D.DEITIES[d.id].name + ' must leave ' + D.prov(prov).name + ' — where to?', god: d.id, from: prov, options: to },
      a => go(a.to), a => (a.t === 'god' && to.indexOf(a.to) >= 0) ? null : 'A province with no god, not pillaged and not destroyed.');
  };

  /* figure properties */
  P.figDef = function (f) { return f.kind === 'monster' ? D.CARDS[f.key] : null; };
  P.shipLike = function (f) { return f.kind === 'ship' || (f.kind === 'monster' && this.figDef(f).fx === 'isShip'); };
  P.leaderLike = function (f) { return f.kind === 'leader' || (f.kind === 'monster' && this.figDef(f).fx === 'isLeader'); };
  P.figName = function (f) {
    if (f.kind === 'monster') return this.figDef(f).name;
    return f.kind === 'leader' ? 'Leader' : f.kind === 'ship' ? 'Ship' : f.kind === 'mystic' ? 'Mystic' : 'Warrior';
  };
  /* The STR a figure is worth on its own — what Invade costs. */
  P.figStr = function (f, loc) {
    const p = this.seat(f.owner);
    if (f.kind === 'leader') return p.up.leader.length ? this.def(p.up.leader[0]).str : D.BASE_STR.leader;
    if (f.kind === 'ship') return p.up.ship.length ? this.def(p.up.ship[0]).str : D.BASE_STR.ship;
    if (f.kind === 'warrior') return p.up.warrior.length ? this.def(p.up.warrior[0]).str : D.BASE_STR.warrior;
    if (f.kind === 'mystic') return D.BASE_STR.mystic;
    const d = this.figDef(f);
    if (d.fx === 'darkelf' && loc === 'ygg') return 3;
    return d.str;
  };

  /* ---------------- the board ---------------- */
  P.figsAt = function (loc) { return this.figs.filter(f => f.at === loc); };
  P.onBoard = function (pid) { return this.figs.filter(f => f.owner === pid && onBoardLoc(f.at)); };
  P.reserve = function (pid) { return this.figs.filter(f => f.owner === pid && f.at === 'R'); };
  P.valhalla = function (pid) { return this.figs.filter(f => f.owner === pid && f.at === 'V'); };
  /* A province and every fjord supporting it: what a battle, a quest and
     Ragnarök all look at. */
  P.area = function (prov) {
    const locs = [prov];
    for (const f of D.FJORDS) if (f.supports.indexOf(prov) >= 0) locs.push(f.id);
    return locs;
  };
  P.inArea = function (prov) { const a = this.area(prov); return this.figs.filter(f => a.indexOf(f.at) >= 0); };
  P.alive = function (prov) { return !!this.prov[prov] && !this.prov[prov].destroyed; };
  P.fjordOpen = function (fid) { return D.fjord(fid).supports.some(p => this.alive(p)); };
  P.room = function (prov) {
    if (prov === 'ygg') return Infinity;
    if (!this.alive(prov)) return 0;
    return D.prov(prov).villages - this.figsAt(prov).length;
  };
  P.hornsRoom = function (p) { return this.statVal(p, 'horns') - this.onBoard(p.id).length; };
  /* Every enemy Warrior or Mystic in a province: what an Odin's Chosen Mystic may take the village of */
  P.assassinVictims = function (p, prov) {
    if (!isProv(prov) || prov === 'ygg' || !this.alive(prov)) return [];
    return this.figsAt(prov).filter(f => f.owner !== p.id && (f.kind === 'warrior' || f.kind === 'mystic')).map(f => f.id);
  };

  /* A clan's total STR in a province (with its fjords). In a battle with the
     Wolfman in it, only Monsters count. */
  P.clanStr = function (pid, prov, battle) {
    const p = this.seat(pid);
    /* Tyr, the Lord of Battle: in a battle in his province every figure is STR 0 */
    if (battle && this.godHere(prov, 'tyr')) return 0;
    const figs = this.inArea(prov).filter(f => f.owner === pid);
    const wolf = battle && this.inArea(prov).some(f => f.kind === 'monster' && this.figDef(f).fx === 'wolfman');
    let s = 0, w = 0;
    for (const f of figs) {
      if (wolf && f.kind !== 'monster') continue;
      if (f.kind === 'warrior') { w++; continue; }
      s += this.figStr(f, f.at);
    }
    if (w) {
      const up = p.up.warrior.length ? this.def(p.up.warrior[0]).fx : null;
      if (up === 'pairs3') s += Math.floor(w / 2) * 3 + (w % 2);
      else if (up === 'pairs6') s += Math.floor(w / 2) * 6 + (w % 2) * 2;
      else if (up === 'str2') s += 2 * w;
      else s += w;
    }
    return s;
  };
  /* Does `pid` hold strictly the most STR in `prov`? */
  P.mostStr = function (pid, prov) {
    if (!this.alive(prov)) return false;
    const mine = this.clanStr(pid, prov, false);
    if (mine <= 0) return false;
    return this.players.every(q => q.id === pid || this.clanStr(q.id, prov, false) < mine);
  };

  /* ================================================================
     Ages and phases
     ================================================================ */
  P.startAge = function (age) {
    const g = this;
    g.age = age;
    g.phase = 'draft';
    for (const p of g.players) g.ageBase[p.id] = p.glory;
    g.say({ t: 'age', n: age });
    if (g.opts.gods) g.placeGods();           // the end of setup for Age 1; a fresh draw for Ages 2 and 3
    const n = g.players.length;
    const deck = shuffle(D.deckFor(age, n, g.opts), g.r);
    for (const c of deck) g.cards[c.id] = c;
    for (const p of g.players) p.pack = deck.splice(0, 8).map(c => c.id);
    g.deckLeft = deck.length;
    for (const c of deck) g.discard.push(c.id);
    if (age === 1 && !g.opts.draft1) {
      for (const p of g.players) { p.hand = p.hand.concat(p.pack); p.pack = []; }
      g.say({ t: 'nodraft' });
      g.push(() => g.startAction());
      return;
    }
    g.draft = { round: 0, per: n === 2 ? 2 : 1 };
    g.push(() => g.draftRound());
  };

  P.draftRound = function () {
    const g = this;
    const per = g.draft.per;
    const picked = g.draft.round * per;
    if (picked >= 6) {
      for (const p of g.players) { g.discard.push.apply(g.discard, p.pack); p.pack = []; }
      g.draft = null;
      g.say({ t: 'drafted' });
      g.push(() => g.startAction());
      return;
    }
    for (const p of g.players) {
      g.ask(p.id, 'draft', {
        why: 'Keep ' + (per === 2 ? 'two cards' : 'a card') + ' — ' + (6 - picked) + ' still to choose',
        need: per, options: p.pack.slice()
      }, a => {
        for (const cid of a.cards) { p.pack.splice(p.pack.indexOf(cid), 1); p.hand.push(cid); }
      }, a => {
        if (a.t !== 'draft' || !Array.isArray(a.cards)) return 'Choose from the cards you were passed.';
        if (a.cards.length !== per) return 'Keep ' + per + '.';
        if (new Set(a.cards).size !== a.cards.length) return 'Two different cards.';
        if (!a.cards.every(c => p.pack.indexOf(c) >= 0)) return 'That card is not in the cards you were passed.';
        return null;
      });
    }
    g.push(() => {
      /* everyone passes what is left to the player on their left */
      const packs = g.players.map(p => p.pack);
      g.players.forEach((p, i) => { p.pack = packs[(i - 1 + packs.length) % packs.length]; });
      g.draft.round++;
      g.push(() => g.draftRound());
    });
  };

  P.startAction = function () {
    const g = this;
    g.phase = 'action';
    for (const p of g.players) p.rage = g.statVal(p, 'rage');
    g.cur = g.first;
    g.say({ t: 'action', first: g.players[g.first].id });
    g.push(() => g.nextTurn());
  };

  P.actionOver = function () {
    if (this.players.every(p => p.rage <= 0)) return true;
    return Object.keys(this.prov).every(id => this.prov[id].destroyed || this.prov[id].pillaged);
  };

  P.nextTurn = function () {
    const g = this;
    if (g.actionOver()) { g.push(() => g.endAction()); return; }
    const n = g.players.length;
    let k = 0;
    while (k < n && g.players[(g.cur + k) % n].rage <= 0) k++;
    const i = (g.cur + k) % n;
    const p = g.players[i];
    g.turns++;
    const legal = g.legal(p);
    g.ask(p.id, 'turn', { why: 'Your turn — ' + p.rage + ' Rage', legal }, a => {
      g.doAction(p, a);
      g.cur = (i + 1) % n;
      g.push(() => g.nextTurn());
    }, a => g.checkAction(p, a));
  };

  P.endAction = function () {
    const g = this;
    for (const p of g.players) p.rage = 0;
    g.say({ t: 'actionEnd' });
    g.phase = 'discard';
    const keep = g.age === 3 ? 0 : 1;
    for (const p of g.players) {
      if (p.hand.length <= keep) continue;
      if (keep === 0) { g.discard.push.apply(g.discard, p.hand); p.hand = []; continue; }
      g.ask(p.id, 'keep', { why: 'Keep one card for the next Age', options: p.hand.slice() }, a => {
        const others = p.hand.filter(c => c !== a.card);
        g.discard.push.apply(g.discard, others);
        p.hand = [a.card];
      }, a => (a.t === 'keep' && p.hand.indexOf(a.card) >= 0) ? null : 'Keep one of your own cards.');
    }
    g.push(() => g.questPhase());
  };

  P.questPhase = function () {
    const g = this;
    g.phase = 'quest';
    for (const p of g.players) {
      for (const cid of p.quests.slice()) {
        g.push(() => {
          const c = g.cards[cid], d = D.CARDS[c.key];
          const ok = g.questDone(p, d);
          const mult = g.has(p, 'doubleQuests') ? 2 : 1;
          g.say({ t: 'quest', by: p.id, card: c.key, ok, glory: c.glory, got: ok ? c.glory * mult : 0 });
          if (ok) {
            g.gain(p, c.glory * mult, d.name);
            g.askStat(p, 'Quest complete: raise a clan stat');
          }
          g.discard.push(cid);
          p.quests.splice(p.quests.indexOf(cid), 1);
        });
      }
    }
    g.push(() => g.ragnarokPhase());
  };
  P.questDone = function (p, d) {
    const live = Object.keys(this.prov).filter(id => this.alive(id));
    switch (d.fx) {
      case 'realm': return live.some(id => D.prov(id).realm === d.realm && this.mostStr(p.id, id));
      case 'ygg': return this.mostStr(p.id, 'ygg');
      case 'death': return this.valhalla(p.id).length >= 4;
      case 'wide': return live.filter(id => this.mostStr(p.id, id)).length >= 2;
    }
    return false;
  };

  P.ragnarokPhase = function () {
    const g = this;
    g.phase = 'ragnarok';
    let target = g.ragnarok[g.age - 1];
    const fen = g.figs.find(f => f.kind === 'monster' && g.figDef(f).fx === 'fenrir' && isProv(f.at) && f.at !== 'ygg');
    if (fen && g.alive(fen.at)) { target = fen.at; g.say({ t: 'fenrir', by: fen.owner, prov: target }); }
    if (!g.alive(target)) { g.say({ t: 'ragnarok', prov: target, already: true }); g.push(() => g.releasePhase()); return; }
    const standing = g.inArea(target).map(f => ({ id: f.id, owner: f.owner, kind: f.kind, key: f.key || null, at: f.at }));
    const dying = standing.map(f => f.id);
    const before = Object.fromEntries(g.players.map(p => [p.id, p.glory]));
    g.prov[target].destroyed = true;
    g.prov[target].pillaged = false;
    g.say({ t: 'ragnarok', prov: target, figs: dying.length });
    const ctx = { destroyed: [] };
    g.destroy(dying, 'ragnarok', ctx);
    g.push(() => {
      const per = D.RAGNAROK_GLORY[g.age];
      for (const p of g.players) {
        const mine = ctx.destroyed.filter(f => f.owner === p.id).length;
        if (mine) g.gain(p, mine * per * (g.has(p, 'doubleRagnarok') ? 2 : 1), 'died in Ragnarök');
      }
      g.doom = g.age < 3 ? g.ragnarok[g.age] : null;
      /* The province falls inside a few steps — the dead, the Volur Witch's
         flight, the Glory. With opts.ragShow the engine records what happened
         and holds the table while the telly plays it out on the province's own
         ground. Decided first, shown second: pacing only. */
      if (g.opts.ragShow) {
        const dead = new Set(ctx.destroyed.map(f => f.id));
        g.ragShow = {
          n: ++g.n, age: g.age, prov: target, per, fenrir: fen && dying.indexOf(fen.id) >= 0 ? fen.owner : null,
          figs: standing.map(f => Object.assign(f, { fate: dead.has(f.id) ? 'dies' : g.fig(f.id).at !== f.at ? 'flees' : 'lives', to: g.fig(f.id).at })),
          glory: g.players.map(p => ({ id: p.id, n: p.glory - before[p.id],
            dead: ctx.destroyed.filter(f => f.owner === p.id).length, doubled: g.has(p, 'doubleRagnarok') }))
            .filter(r => r.n || r.dead),
          next: g.doom
        };
        g.hold = { t: 'ragnarok', n: g.ragShow.n, prov: target, age: g.age };
      }
      g.push(() => g.releasePhase());
    });
  };

  P.releasePhase = function () {
    const g = this;
    g.phase = 'release';
    for (const p of g.players) {
      const back = g.valhalla(p.id);
      if (!back.length) continue;
      for (const f of back) f.at = 'R';
      g.say({ t: 'release', by: p.id, n: back.length });
      const per = g.ups(p, 'release').reduce((s, c) => s + D.CARDS[c.key].glory, 0);
      if (per) g.gain(p, per * back.length, 'released from Valhalla');
    }
    g.push(() => g.endAge());
  };

  P.endAge = function () {
    const g = this;
    for (const id in g.prov) g.prov[id].pillaged = false;
    const last = g.age >= 3;
    if (!last) g.first = g.left(g.first);
    /* The end of an Age is the one moment everything changes at once, and the
       engine does it all inside a few steps. With opts.ageShow the table is
       held on a card saying what the Age came to, until the display lets go.
       Pacing only: nothing here decides anything. */
    if (g.opts.ageShow) {
      g.ageShow = g.ageSummary();
      g.hold = { t: 'age', n: ++g.n, age: g.age };
    }
    g.push(() => last ? g.finish() : g.startAge(g.age + 1));
  };

  /* What the Age just ended came to, read off its own log. Everything in it
     was said out loud at the table, so all of it is public. */
  P.ageSummary = function () {
    const g = this, age = g.age;
    const evs = g.log.filter(e => e.age === age);
    const of = t => evs.filter(e => e.t === t);
    const deadOf = (pid, cause) => of('die').filter(e => !cause || e.cause === cause)
      .reduce((s, e) => s + e.figs.filter(f => f.owner === pid).length, 0);
    const rows = g.players.map(p => {
      const glory = of('glory').filter(e => e.by === p.id);
      const sum = ph => glory.filter(e => e.ph === ph).reduce((s, e) => s + e.n, 0);
      const gained = p.glory - (g.ageBase[p.id] || 0);
      const quests = sum('quest'), ragnarok = sum('ragnarok'), valhalla = sum('release');
      return {
        id: p.id, name: p.name, bot: p.bot, clanName: p.clanName, clanHex: p.clanHex, clan: p.clan,
        glory: p.glory, gained,
        /* the rest is the Action phase: battles, pillages, cards — and anything stolen */
        from: { war: gained - quests - ragnarok - valhalla, quests, ragnarok, valhalla },
        fought: of('battle').filter(e => e.parts.indexOf(p.id) >= 0).length,
        won: of('result').filter(e => e.winner === p.id).length,
        pillaged: of('pillaged').filter(e => e.by === p.id).length,
        dead: deadOf(p.id), ragDead: deadOf(p.id, 'ragnarok')
      };
    });
    const rag = of('ragnarok')[0] || null;
    const fen = of('fenrir')[0] || null;
    return {
      n: g.n + 1, age, last: age >= 3,
      ragnarok: rag ? { prov: rag.prov, already: !!rag.already, fenrir: fen ? fen.by : null, per: D.RAGNAROK_GLORY[age] } : null,
      quests: of('quest').map(e => ({ by: e.by, key: e.card, ok: e.ok, got: e.got || 0 })),
      battles: of('battle').length,
      rows,
      next: age < 3 ? { age: age + 1, first: g.players[g.first].id, doom: g.doom, per: D.RAGNAROK_GLORY[age + 1] } : null
    };
  };

  P.finish = function () {
    const g = this;
    const rows = g.players.map(p => {
      const stats = {};
      let bonus = 0;
      for (const s of D.STAT_IDS) { stats[s] = D.statBonus(p.stats[s]); bonus += stats[s]; }
      const conquest = g.ups(p, 'conquest').length * 3 * g.onBoard(p.id).length;
      const before = p.glory;
      p.glory += bonus + conquest;
      return { id: p.id, name: p.name, bot: p.bot, clan: p.clanName, hex: p.hex,
        before, stats, bonus, conquest, total: p.glory };
    });
    const top = Math.max.apply(null, rows.map(r => r.total));
    rows.sort((a, b) => b.total - a.total);
    let place = 0, last = null;
    rows.forEach((r, i) => { if (r.total !== last) { place = i + 1; last = r.total; } r.place = place; r.won = r.total === top; });
    g.result = { rows, top };
    g.phase = 'over';
    g.prompts = [];
    g.say({ t: 'over', top, winners: rows.filter(r => r.won).map(r => r.id) });
  };

  /* ================================================================
     Small questions that recur
     ================================================================ */
  P.askStat = function (p, why, except) {
    const g = this;
    const opts = D.STAT_IDS.filter(s => p.stats[s] < 5 && s !== except);
    if (!opts.length) return;
    if (opts.length === 1) { g.raise(p, opts[0], why); return; }
    g.ask(p.id, 'stat', { why, options: opts }, a => g.raise(p, a.stat, why),
      a => (a.t === 'stat' && opts.indexOf(a.stat) >= 0) ? null : 'Choose one of the stats that can still go up.');
  };

  /* Where figure `f` could be put from the reserve right now. */
  P.invadeTargets = function (p, f, free) {
    if (this.hornsRoom(p) <= 0) return [];
    if (this.shipLike(f)) return FJORD_IDS.filter(id => this.fjordOpen(id));
    const out = D.RING.filter(id => this.room(id) > 0 ||
      (f.kind === 'mystic' && this.has(p, 'mysticAssassin') && this.assassinVictims(p, id).length));
    if (f.kind === 'monster' && this.figDef(f).fx === 'darkelf') out.push('ygg');
    if (free) return out;
    return out;
  };
  P.invadeCost = function (p, f, to) {
    if (this.leaderLike(f)) return 0;
    if (f.kind === 'mystic') return 0;               // Mystics invade for free
    if (f.kind === 'monster' && this.figDef(f).fx === 'free') return 0;
    /* the Mystic Troll lets its owner's figures into its province for nothing */
    if (this.figs.some(m => m.owner === p.id && m.at === to && m.kind === 'monster' && this.figDef(m).fx === 'mtroll')) return 0;
    return this.figStr(f, to);
  };

  /* Offer `f` a free invade (after an upgrade, Frigga's Succor, Loki's
     Blessing). `only` restricts the province. Always skippable. */
  P.offerPlace = function (p, f, why, only, after, quiet) {
    const g = this;
    let to = g.invadeTargets(p, f, true).filter(x => g.room(x) > 0 || E_isFjord(x));
    if (only) to = to.filter(x => only.indexOf(x) >= 0);
    if (!to.length) { if (after) after(); return; }
    g.ask(p.id, 'place', { why, fig: f.id, figName: g.figName(f), options: to, optional: true }, a => {
      if (a.t === 'place') g.placeFig(p, f, a.to, true, quiet);
      if (after) after();
    }, a => {
      if (a.t === 'skip') return null;
      if (a.t !== 'place' || to.indexOf(a.to) < 0) return 'Not somewhere it can go.';
      if (f.at !== 'R') return 'That figure is not in your reserve.';
      return null;
    });
  };

  /* Put a figure on the board, with every "when it invades" hook. `quiet`
     skips Succor and Thor's Domain (a Succor warrior does not bring another). */
  P.placeFig = function (p, f, to, viaInvade, quiet) {
    const g = this;
    f.at = to;
    g.say({ t: 'invade', by: p.id, fig: g.figName(f), kind: f.kind, key: f.key || null, to });
    if (f.kind === 'monster') {
      const fx = g.figDef(f).fx;
      if ((fx === 'invadeKillWarriors' || fx === 'invadeKillMortals') && isProv(to)) {
        const victims = g.inArea(to).filter(v => v.owner !== p.id &&
          (fx === 'invadeKillWarriors' ? v.kind === 'warrior' : v.kind !== 'monster'));
        if (victims.length) {
          g.say({ t: 'rampage', by: p.id, fig: g.figDef(f).name, prov: to, n: victims.length });
          g.destroy(victims.map(v => v.id), 'invade', { destroyed: [] });
        }
      }
    }
    if (quiet || !viaInvade) return;
    g.push(() => {
      if (g.has(p, 'succor') && isProv(to) && to !== 'ygg') {
        const w = g.reserve(p.id).find(x => x.kind === 'warrior');
        if (w && g.room(to) > 0 && g.hornsRoom(p) > 0) {
          g.ask(p.id, 'yesno', { why: 'Frigga’s Succor: a Warrior follows into ' + D.prov(to).name + ' for free?', q: 'succor', prov: to }, a => {
            if (a.t === 'yes' && w.at === 'R' && g.room(to) > 0 && g.hornsRoom(p) > 0) g.placeFig(p, w, to, true, true);
          }, a => (a.t === 'yes' || a.t === 'no') ? null : 'Yes or no.');
        }
      }
      g.push(() => {
        if (!g.battle && g.has(p, 'thordomain') && isProv(to) && g.alive(to) && !g.prov[to].pillaged && p.rage >= 2 &&
            g.figs.some(x => x.owner === p.id && g.area(to).indexOf(x.at) >= 0)) {
          g.ask(p.id, 'yesno', { why: 'Thor’s Domain: pay 2 Rage to pillage ' + D.prov(to).name + ' now?', q: 'thordomain', prov: to }, a => {
            if (a.t === 'yes' && p.rage >= 2 && !g.prov[to].pillaged) { p.rage -= 2; g.pillage(p, to, false); }
          }, a => (a.t === 'yes' || a.t === 'no') ? null : 'Yes or no.');
        }
      });
    });
  };

  /* ================================================================
     Destruction — every death goes through here, because three different
     cards can interrupt one: Frigga's Protection, the Volur Witch and the
     Dragons that pay when a ship goes down.
     ================================================================ */
  P.destroy = function (ids, cause, ctx) {
    const g = this;
    const list = ids.map(id => g.fig(id)).filter(f => f && onBoardLoc(f.at));
    if (!list.length) return;
    /* Frigga, the Mother Protector: in her province nothing is destroyed during a battle, for any reason */
    if (cause === 'battle' && g.battle && g.godHere(g.battle.prov, 'frigga')) {
      g.say({ t: 'godSaves', god: 'frigga', prov: g.battle.prov, n: list.length });
      return;
    }
    const owners = [];
    for (const f of list) if (owners.indexOf(f.owner) < 0) owners.push(f.owner);
    const spared = new Set();
    for (const pid of owners) {
      const p = g.seat(pid);
      const mine = list.filter(f => f.owner === pid);
      /* the Volur Witch may flee an outer province for Yggdrasil */
      const witch = mine.find(f => f.kind === 'monster' && g.figDef(f).fx === 'volur' && isProv(f.at) && f.at !== 'ygg');
      if (witch && cause !== 'sacrifice') {
        g.push(() => g.ask(pid, 'yesno', { why: 'The Volur Witch would die — flee to Yggdrasil instead?', q: 'flee', fig: witch.id }, a => {
          if (a.t === 'yes') { spared.add(witch.id); witch.at = 'ygg'; g.say({ t: 'flee', by: pid }); }
        }, a => (a.t === 'yes' || a.t === 'no') ? null : 'Yes or no.'));
      }
      /* Frigga's Chosen: each Mystic about to die may retreat to a neighbouring province with room */
      if (g.has(p, 'mysticRetreat') && cause !== 'sacrifice') {
        for (const y of mine.filter(f => f.kind === 'mystic' && isProv(f.at))) {
          g.push(() => {
            if (spared.has(y.id) || !isProv(y.at)) return;
            const to = D.PROVINCES.map(x => x.id).filter(x => x !== y.at && D.adjacent(y.at, x) && g.alive(x) && g.room(x) > 0);
            if (!to.length) return;
            g.ask(pid, 'retreat', { why: 'Frigga’s Chosen: your Mystic may retreat from ' + D.prov(y.at).name + ' instead of dying', fig: y.id, from: y.at, options: to, optional: true }, a => {
              if (a.t === 'retreat' && g.room(a.to) > 0) { spared.add(y.id); const from = y.at; y.at = a.to; g.say({ t: 'retreat', by: pid, from, to: a.to }); }
            }, a => (a.t === 'stay' || (a.t === 'retreat' && to.indexOf(a.to) >= 0)) ? null : 'A neighbouring province with room, or stay.');
          });
        }
      }
      if (g.has(p, 'protect') && cause !== 'ragnarok' && cause !== 'sacrifice') {
        g.push(() => {
          const can = mine.filter(f => !spared.has(f.id) && onBoardLoc(f.at)).map(f => f.id);
          if (!can.length || p.rage <= 0) return;
          g.ask(pid, 'protect', { why: 'Frigga’s Protection: pay 1 Rage a figure to save them', options: can, max: p.rage }, a => {
            for (const id of a.figs) spared.add(id);
            p.rage -= a.figs.length;
            if (a.figs.length) g.say({ t: 'protect', by: pid, n: a.figs.length });
          }, a => {
            if (a.t !== 'protect' || !Array.isArray(a.figs)) return 'Choose the figures to save.';
            if (a.figs.length > p.rage) return 'One Rage for each.';
            if (new Set(a.figs).size !== a.figs.length || !a.figs.every(id => can.indexOf(id) >= 0)) return 'Only figures that are about to die.';
            return null;
          });
        });
      }
    }
    g.push(() => {
      const dead = list.filter(f => !spared.has(f.id) && onBoardLoc(f.at));
      for (const f of dead) {
        const was = f.at;
        f.at = 'V';
        ctx.destroyed.push({ id: f.id, owner: f.owner, kind: f.kind, at: was });
        if (g.shipLike(f)) {
          const p = g.seat(f.owner);
          const pay = g.ups(p, 'dragons').reduce((s, c) => s + D.CARDS[c.key].glory, 0);
          if (pay) g.gain(p, pay, 'a ship went down');
        }
      }
      if (dead.length) g.say({ t: 'die', cause, figs: dead.map(f => ({ owner: f.owner, name: g.figName(f) })) });
    });
  };

  /* ================================================================
     Actions
     ================================================================ */
  P.legal = function (p) {
    const g = this;
    const L = { invade: [], march: [], upgrade: [], quest: [], pillage: [], repillage: [], valhalla: [], sacrifice: false };
    if (p.rage <= 0) return L;
    /* Invade: one representative of each kind of figure in the reserve. */
    const seen = {};
    for (const f of g.reserve(p.id)) {
      const k = f.kind === 'monster' ? f.id : f.kind;
      if (seen[k]) continue;
      seen[k] = true;
      const to = g.invadeTargets(p, f).filter(t => g.invadeCost(p, f, t) <= p.rage);
      if (!to.length) continue;
      const entry = { fig: f.id, name: g.figName(f), kind: f.kind, key: f.key || null, costs: to.map(t => g.invadeCost(p, f, t)), to };
      /* an Odin's Chosen Mystic may take a village from an enemy Warrior or Mystic */
      if (f.kind === 'mystic' && g.has(p, 'mysticAssassin')) {
        entry.victims = {};
        for (const t of to) { const v = g.assassinVictims(p, t); if (v.length) entry.victims[t] = v.map(id => ({ fig: id, owner: g.fig(id).owner, kind: g.fig(id).kind })); }
      }
      L.invade.push(entry);
    }
    /* March: from any province with movable figures, to any other with room. */
    if (p.rage >= 1) {
      for (const from of Object.keys(g.prov)) {
        if (!g.alive(from)) continue;
        const figs = g.figsAt(from).filter(f => f.owner === p.id && !g.shipLike(f)).map(f => f.id);
        if (!figs.length) continue;
        const to = Object.keys(g.prov).filter(t => t !== from && g.alive(t) && g.room(t) > 0)
          .map(t => ({ prov: t, room: g.room(t) === Infinity ? 99 : g.room(t) }));
        if (to.length) L.march.push({ from, figs, to });
      }
    }
    /* Upgrade and Quest */
    for (const cid of p.hand) {
      const d = g.def(cid);
      if (d.kind === 'quest') { L.quest.push(cid); continue; }
      if (D.UPGRADE_KINDS.indexOf(d.kind) < 0) continue;
      const cost = g.upgradeCost(p, cid);
      if (cost > p.rage) continue;
      const full = p.up[d.kind].length >= D.SLOTS[d.kind];
      L.upgrade.push({ card: cid, cost, replace: full ? p.up[d.kind].slice() : [] });
    }
    /* Pillage */
    for (const id of Object.keys(g.prov)) {
      if (!g.alive(id)) continue;
      const present = g.inArea(id).some(f => f.owner === p.id);
      if (!present) continue;
      if (!g.prov[id].pillaged) L.pillage.push(id);
      else if (g.has(p, 'repillage') && p.rage >= 2) L.repillage.push(id);
    }
    if (g.has(p, 'valhallaInvade') && p.rage >= 1 && g.hornsRoom(p) > 0) {
      for (const f of g.valhalla(p.id)) {
        const to = g.invadeTargets(p, f);
        if (to.length) L.valhalla.push({ fig: f.id, name: g.figName(f), to });
      }
    }
    if (g.has(p, 'sacrifice') && g.onBoard(p.id).length >= 2 && D.STAT_IDS.some(s => p.stats[s] < 5)) L.sacrifice = true;
    return L;
  };

  P.upgradeCost = function (p, cid) {
    const d = this.def(cid);
    if (d.fx === 'free') return 0;
    return Math.max(0, d.str - this.ups(p, 'cheapUpgrades').length);
  };

  P.checkAction = function (p, a) {
    const g = this;
    if (a.t === 'pass') return null;
    if (p.rage <= 0) return 'You have no Rage left.';
    const L = g.legal(p);
    switch (a.t) {
      case 'invade': {
        const f = g.fig(a.fig);
        if (!f || f.owner !== p.id || f.at !== 'R') return 'That figure is not in your reserve.';
        const to = g.invadeTargets(p, f);
        if (to.indexOf(a.to) < 0) return g.hornsRoom(p) <= 0 ? 'Your Horns are full.' : 'It cannot go there.';
        if (g.invadeCost(p, f, a.to) > p.rage) return 'Not enough Rage.';
        if (a.victim != null) {
          if (f.kind !== 'mystic' || !g.has(p, 'mysticAssassin')) return 'Only an Odin’s Chosen Mystic can take a village.';
          if (g.assassinVictims(p, a.to).indexOf(a.victim) < 0) return 'Only an enemy Warrior or Mystic in that province.';
        } else if (g.room(a.to) <= 0 && !isFjord(a.to)) return 'Every village there is taken — choose whose village to take.';
        return null;
      }
      case 'march': {
        const m = L.march.find(x => x.from === a.from);
        if (!m) return 'You have nothing that can march from there.';
        const t = m.to.find(x => x.prov === a.to);
        if (!t) return 'There is no room there.';
        if (!Array.isArray(a.figs) || !a.figs.length) return 'Choose who marches.';
        if (new Set(a.figs).size !== a.figs.length || !a.figs.every(id => m.figs.indexOf(id) >= 0)) return 'Only your own figures from that province.';
        if (a.figs.length > t.room) return 'Only ' + t.room + ' will fit.';
        return null;
      }
      case 'upgrade': {
        const u = L.upgrade.find(x => x.card === a.card);
        if (!u) return p.hand.indexOf(a.card) >= 0 ? 'Not enough Rage for that upgrade.' : 'That card is not in your hand.';
        if (u.replace.length && u.replace.indexOf(a.replace) < 0) return 'Those slots are full — choose the card it replaces.';
        return null;
      }
      case 'quest': return L.quest.indexOf(a.card) >= 0 ? null : 'That is not a Quest in your hand.';
      case 'pillage': return L.pillage.indexOf(a.prov) >= 0 ? null : 'You cannot pillage there.';
      case 'repillage': return L.repillage.indexOf(a.prov) >= 0 ? null : 'You cannot pillage there again.';
      case 'valhalla': {
        const v = L.valhalla.find(x => x.fig === a.fig);
        return v && v.to.indexOf(a.to) >= 0 ? null : 'That figure cannot come out of Valhalla there.';
      }
      case 'sacrifice': {
        if (!L.sacrifice) return 'You cannot sacrifice now.';
        if (!Array.isArray(a.figs) || a.figs.length !== 2 || a.figs[0] === a.figs[1]) return 'Choose two of your figures.';
        if (!a.figs.every(id => { const f = g.fig(id); return f && f.owner === p.id && onBoardLoc(f.at); })) return 'Two of your figures on the board.';
        return null;
      }
    }
    return 'That is not an action.';
  };

  P.doAction = function (p, a) {
    const g = this;
    switch (a.t) {
      case 'pass':
        g.say({ t: 'pass', by: p.id, lost: p.rage });
        p.rage = 0;
        return;
      case 'invade': {
        const f = g.fig(a.fig);
        p.rage -= g.invadeCost(p, f, a.to);
        if (a.victim != null) {
          /* Odin's Chosen: the victim goes first (it may be saved or retreat); the Mystic takes the
             village if there is one to take, and otherwise stays home (a ruling) */
          const v = g.fig(a.victim);
          g.say({ t: 'assassin', by: p.id, victim: v.owner, kind: v.kind, prov: a.to });
          g.destroy([v.id], 'assassin', { destroyed: [] });
          g.push(() => {
            if (g.room(a.to) > 0 && g.hornsRoom(p) > 0) g.placeFig(p, f, a.to, true);
            else g.say({ t: 'assassinBlocked', by: p.id, prov: a.to });
          });
          return;
        }
        g.placeFig(p, f, a.to, true);
        return;
      }
      case 'march': {
        p.rage -= 1;
        for (const id of a.figs) g.fig(id).at = a.to;
        g.say({ t: 'march', by: p.id, from: a.from, to: a.to, n: a.figs.length });
        return;
      }
      case 'upgrade': return g.doUpgrade(p, a);
      case 'quest':
        p.hand.splice(p.hand.indexOf(a.card), 1);
        p.quests.push(a.card);
        g.say({ t: 'questCommit', by: p.id });
        return;
      case 'pillage': return g.pillage(p, a.prov, false);
      case 'repillage':
        p.rage -= 2;
        return g.pillage(p, a.prov, true);
      case 'valhalla': {
        const f = g.fig(a.fig);
        p.rage -= 1;
        g.say({ t: 'valhallaOut', by: p.id });
        g.placeFig(p, f, a.to, true);
        return;
      }
      case 'sacrifice': {
        g.say({ t: 'sacrifice', by: p.id });
        g.destroy(a.figs, 'sacrifice', { destroyed: [] });
        g.push(() => g.askStat(p, 'Frigga’s Sacrifice: raise a clan stat'));
        return;
      }
    }
  };

  P.doUpgrade = function (p, a) {
    const g = this;
    const cid = a.card, d = g.def(cid);
    p.rage -= g.upgradeCost(p, cid);
    p.hand.splice(p.hand.indexOf(cid), 1);
    if (p.up[d.kind].length >= D.SLOTS[d.kind]) {
      const old = a.replace;
      p.up[d.kind].splice(p.up[d.kind].indexOf(old), 1);
      g.discard.push(old);
      if (d.kind === 'monster') {
        const gone = g.figs.find(f => f.owner === p.id && f.kind === 'monster' && f.card === old);
        if (gone) gone.at = 'X';
      }
      g.say({ t: 'replace', by: p.id, old: g.cards[old].key });
    }
    p.up[d.kind].push(cid);
    g.say({ t: 'upgrade', by: p.id, card: d.key });
    let f = null;
    if (d.kind === 'monster') {
      f = { id: p.id + ':M:' + cid, owner: p.id, kind: 'monster', key: d.key, card: cid, at: 'R' };
      g.figs.push(f);
    } else if (d.kind === 'leader' || d.kind === 'ship' || d.kind === 'warrior') {
      f = g.reserve(p.id).find(x => x.kind === d.kind) || null;
    }
    /* a Mystic Clan Upgrade adds a Mystic to the reserve — no free invade with it (Mystics of Midgard p.2) */
    if (d.mystic) {
      const y = g.figs.find(x => x.owner === p.id && x.kind === 'mystic' && x.at === 'X');
      if (y) { y.at = 'R'; g.say({ t: 'mysticJoins', by: p.id, card: d.key }); }
    }
    if (f) g.offerPlace(p, f, 'Invade with your ' + g.figName(f) + ' for free?');
  };

  /* ================================================================
     Pillage and battle
     ================================================================ */
  P.pillage = function (p, prov, again) {
    const g = this;
    g.say({ t: 'pillage', by: p.id, prov, again: !!again });
    g.battle = { prov, pillager: p.id, stage: 'call', parts: [], played: {}, round: 0, destroyed: [], late: [], watchGlory: {} };
    const b = g.battle;
    const n = g.players.length;
    const pi = g.idx(p.id);
    const order = [];
    for (let k = 1; k <= n; k++) order.push(g.players[(pi + k) % n].id);
    let joinedThisLap = false, pos = 0;
    const callNext = () => {
      if (g.room(prov) <= 0) { g.push(() => g.startBattle()); return; }
      if (pos >= order.length) {
        if (!joinedThisLap) { g.push(() => g.startBattle()); return; }
        pos = 0; joinedThisLap = false;
      }
      const q = g.seat(order[pos++]);
      const figs = g.figs.filter(f => f.owner === q.id && isProv(f.at) && g.alive(f.at) && f.at !== prov &&
        D.adjacent(f.at, prov) && !g.shipLike(f));
      if (!figs.length) { g.push(callNext); return; }
      g.ask(q.id, 'join', { why: 'Call to battle at ' + D.prov(prov).name + ': send a figure from next door?', prov,
        options: figs.map(f => ({ fig: f.id, name: g.figName(f), kind: f.kind, key: f.key || null, from: f.at })), optional: true }, a => {
        if (a.t === 'join') {
          const f = g.fig(a.fig);
          f.at = prov;
          joinedThisLap = true;
          g.say({ t: 'join', by: q.id, fig: g.figName(f), from: a.from || null, prov });
        }
        g.push(callNext);
      }, a => {
        if (a.t === 'pass') return null;
        if (a.t !== 'join' || !figs.some(f => f.id === a.fig)) return 'Only one of your figures next door.';
        if (g.room(prov) <= 0) return 'Every village there is taken.';
        return null;
      });
    };
    g.push(callNext);
  };

  P.startBattle = function () {
    const g = this, b = g.battle;
    const parts = g.players.filter(q => g.inArea(b.prov).some(f => f.owner === q.id)).map(q => q.id);
    b.parts = parts;
    const enemies = parts.filter(id => id !== b.pillager);
    if (!enemies.length) {
      g.say({ t: 'unopposed', by: b.pillager, prov: b.prov });
      b.winner = b.pillager;
      g.pillageReward(g.seat(b.pillager), b.prov, null);
      g.push(() => { g.battle = null; g.moveGod(g.seat(b.pillager), b.prov); });
      return;
    }
    b.stage = 'cards';
    b.valk = parts.filter(id => g.inArea(b.prov).some(f => f.owner === id && f.kind === 'monster' && g.figDef(f).fx === 'valkyrie'));
    g.say({ t: 'battle', prov: b.prov, parts: parts.slice() });
    g.push(() => g.cardRound());
  };

  P.cardRound = function () {
    const g = this, b = g.battle;
    b.stage = 'cards';
    b.round++;
    b.played = {};
    b.ready = [];
    /* Heimdall, the Watcher Guardian: face up, one at a time, the pillager last */
    if (g.godHere(b.prov, 'heimdall')) {
      b.open = true;
      const n = g.players.length, pi = g.idx(b.pillager);
      const order = [];
      for (let k = 1; k <= n; k++) { const id = g.players[(pi + k) % n].id; if (b.parts.indexOf(id) >= 0) order.push(id); }
      for (const id of order) b.played[id] = [];
      const one = k => {
        if (k >= order.length) { g.push(() => g.reveal()); return; }
        const id = order[k], p = g.seat(id);
        if (!p.hand.length) { g.push(() => one(k + 1)); return; }
        g.ask(id, 'card', { why: 'Battle at ' + D.prov(b.prov).name + ' — Heimdall watches: play a card FACE UP', prov: b.prov, open: true, options: p.hand.slice() }, a => {
          p.hand.splice(p.hand.indexOf(a.card), 1);
          b.played[id].push({ card: a.card, key: g.cards[a.card].key, cancelled: false });
          b.ready.push(id);
          g.say({ t: 'openCard', by: id, key: g.cards[a.card].key, prov: b.prov });
          g.push(() => one(k + 1));
        }, a => (a.t === 'card' && p.hand.indexOf(a.card) >= 0) ? null : 'Play a card from your hand.');
      };
      one(0);
      return;
    }
    for (const id of b.parts) {
      const p = g.seat(id);
      b.played[id] = [];
      if (!p.hand.length) continue;
      g.ask(id, 'card', { why: 'Battle at ' + D.prov(b.prov).name + ' — play a card face down', prov: b.prov, options: p.hand.slice() }, a => {
        p.hand.splice(p.hand.indexOf(a.card), 1);
        b.played[id].push({ card: a.card, key: g.cards[a.card].key, cancelled: false });
        b.ready.push(id);
      }, a => (a.t === 'card' && p.hand.indexOf(a.card) >= 0) ? null : 'Play a card from your hand.');
    }
    g.push(() => g.reveal());
  };

  P.reveal = function () {
    const g = this, b = g.battle;
    b.stage = 'revealed';
    g.say({ t: 'reveal', prov: b.prov, cards: b.parts.map(id => ({ by: id, keys: b.played[id].map(x => x.key) })) });
    /* Thor's Primacy strips every opponent's card of its text. */
    for (const id of b.parts) {
      if (b.played[id].some(x => x.key === 'primacy')) {
        for (const o of b.parts) if (o !== id) for (const x of b.played[o]) x.cancelled = true;
      }
    }
    for (const id of b.parts) for (const x of b.played[id]) if (x.cancelled) g.say({ t: 'cancelled', by: id, key: x.key });
    /* Heimdall's Watch: every revealed card goes, its owner banks their +STR,
       and the battle is played again. */
    const watchers = b.parts.filter(id => b.played[id].some(x => x.key === 'watch' && !x.cancelled));
    if (watchers.length) {
      let total = 0;
      for (const id of b.parts) for (const x of b.played[id]) total += (D.CARDS[x.key].kind === 'battle' ? D.CARDS[x.key].value : 0);
      for (const id of watchers) g.gain(g.seat(id), total, 'Heimdall’s Watch');
      for (const id of b.parts) for (const x of b.played[id]) g.discard.push(x.card);
      g.say({ t: 'watch', by: watchers.slice() });
      if (b.parts.some(id => g.seat(id).hand.length)) { g.push(() => g.cardRound()); return; }
      for (const id of b.parts) b.played[id] = [];
    }
    g.push(() => g.preCompare());
  };

  P.preCompare = function () {
    const g = this, b = g.battle;
    const ctx = { destroyed: b.destroyed };
    /* Odin's Smite: a Warrior from each opponent. */
    for (const id of b.parts) {
      for (const x of b.played[id]) {
        if (x.key !== 'odinsmite' || x.cancelled) continue;
        const victims = [];
        for (const o of b.parts) {
          if (o === id) continue;
          const w = g.figsAt(b.prov).find(f => f.owner === o && f.kind === 'warrior' && victims.indexOf(f.id) < 0);
          if (w) victims.push(w.id);
        }
        if (victims.length) { g.say({ t: 'smite', by: id, n: victims.length }); g.destroy(victims, 'battle', ctx); }
      }
    }
    /* Odin's Tide: everyone keeps one figure. */
    g.push(() => {
      const tide = b.parts.some(id => b.played[id].some(x => x.key === 'tide' && !x.cancelled));
      if (!tide) return;
      if (g.godHere(b.prov, 'frigga')) { g.say({ t: 'godSaves', god: 'frigga', prov: b.prov, n: 0 }); return; }
      g.say({ t: 'tide' });
      const doom = [];
      for (const id of b.parts) {
        const mine = g.inArea(b.prov).filter(f => f.owner === id);
        if (mine.length <= 1) continue;
        g.ask(id, 'tide', { why: 'Odin’s Tide: keep ONE figure in this battle', prov: b.prov,
          options: mine.map(f => ({ fig: f.id, name: g.figName(f), kind: f.kind, key: f.key || null, at: f.at })) }, a => {
          for (const f of mine) if (f.id !== a.fig) doom.push(f.id);
        }, a => (a.t === 'keep' && mine.some(f => f.id === a.fig)) ? null : 'Keep one of your figures in the battle.');
      }
      g.push(() => g.destroy(doom, 'battle', ctx));
    });
    g.push(() => g.lateWindow());
  };

  /* Heimdall's Eye and Gaze may come out after the reveal: the pillager
     first, then clockwise, round and round until nobody plays one. */
  P.lateWindow = function () {
    const g = this, b = g.battle;
    b.stage = 'late';
    const n = g.players.length;
    const pi = g.idx(b.pillager);
    const order = [];
    for (let k = 0; k < n; k++) { const id = g.players[(pi + k) % n].id; if (b.parts.indexOf(id) >= 0) order.push(id); }
    let pos = 0, played = false;
    const next = () => {
      if (pos >= order.length) {
        if (!played) { g.push(() => g.resolve()); return; }
        pos = 0; played = false;
      }
      const id = order[pos++];
      const p = g.seat(id);
      const late = p.hand.filter(c => D.CARDS[g.cards[c].key].late);
      if (!late.length) { g.push(next); return; }
      g.ask(id, 'late', { why: 'Add a Heimdall card now that the cards are showing?', prov: b.prov, options: late, totals: g.totals(), optional: true }, a => {
        if (a.t === 'late') {
          p.hand.splice(p.hand.indexOf(a.card), 1);
          b.played[id].push({ card: a.card, key: g.cards[a.card].key, cancelled: false, late: true });
          g.say({ t: 'late', by: id, key: g.cards[a.card].key });
          played = true;
        }
        g.push(next);
      }, a => (a.t === 'pass' || (a.t === 'late' && late.indexOf(a.card) >= 0)) ? null : 'Play one of your Heimdall cards, or pass.');
    };
    g.push(next);
  };

  /* What each clan has in this battle right now — the figures plus the
     cards. Heimdall's Sight copies the best card an opponent has shown. */
  P.cardValue = function (id, x) {
    const g = this, b = g.battle, d = D.CARDS[x.key];
    if (d.kind === 'battle') {
      if (d.fx === 'sight') {
        if (x.cancelled) return 0;
        let best = 0;
        for (const o of b.parts) if (o !== id) for (const y of b.played[o]) if (y.key !== 'sight') best = Math.max(best, g.cardValue(o, y));
        return best;
      }
      return d.value;
    }
    if (d.kind === 'quest') {
      const p = g.seat(id);
      return g.ups(p, 'questBattle').reduce((m, c) => Math.max(m, D.CARDS[c.key].value), 0);
    }
    return 0;
  };
  P.totals = function () {
    const g = this, b = g.battle;
    const out = {};
    if (!b) return out;
    for (const id of b.parts) {
      const figs = g.clanStr(id, b.prov, true);
      const cards = (b.played[id] || []).reduce((s, x) => s + g.cardValue(id, x), 0);
      out[id] = { figs, cards, total: figs + cards };
    }
    return out;
  };

  P.resolve = function () {
    const g = this, b = g.battle;
    const T = g.totals();
    b.totals = T;
    const top = Math.max.apply(null, b.parts.map(id => T[id].total));
    const best = b.parts.filter(id => T[id].total === top);
    b.winner = best.length === 1 ? best[0] : null;
    const losers = b.parts.filter(id => id !== b.winner);
    const doomed = g.godHere(b.prov, 'frigga') ? [] : g.inArea(b.prov).filter(f => losers.indexOf(f.owner) >= 0).map(f => f.id);
    const finish = () => {
      b.stage = 'resolved';
      g.say({ t: 'result', prov: b.prov, winner: b.winner, totals: b.parts.map(id => ({ by: id, total: T[id].total })) });
      g.destroy(doomed, 'battle', { destroyed: b.destroyed });
      g.push(() => g.afterBattle());
    };
    /* The telly plays the fight out before anyone learns how it went: the
       outcome is decided here, and held — not applied, not said, not in any
       view — until the display releases it. Everything it needs to stage the
       fight is in b.show, which only the display reads. */
    if (g.opts.clashShow) {
      b.stage = 'clash';
      b.show = {
        prov: b.prov, winner: b.winner, parts: b.parts.slice(), doomed: doomed.slice(),
        totals: JSON.parse(JSON.stringify(T)),
        god: g.godOf(b.prov),
        cards: Object.fromEntries(b.parts.map(id => [id, (b.played[id] || []).map(x =>
          ({ key: x.key, value: g.cardValue(id, x), cancelled: x.cancelled, late: !!x.late }))])),
        figs: g.inArea(b.prov).map(f => ({ id: f.id, owner: f.owner, kind: f.kind, key: f.key || null, at: f.at }))
      };
      g.hold = { t: 'clash', n: ++g.n, prov: b.prov };
      g.push(finish);
      return;
    }
    finish();
  };

  P.afterBattle = function () {
    const g = this, b = g.battle;
    const W = b.winner ? g.seat(b.winner) : null;
    const losers = b.parts.filter(id => id !== b.winner);
    const live = (id, key) => (b.played[id] || []).some(x => x.key === key && !x.cancelled);

    /* cards: losers take theirs back; the winner's are spent — unless Tyr's
       Prowess buys them back, or Loki's Poison hands them to a loser. */
    for (const id of losers) {
      const p = g.seat(id);
      for (const x of b.played[id]) p.hand.push(x.card);
    }
    const spend = () => {
      if (!W) return;
      let spent = b.played[W.id].map(x => x.card).filter(c => W.hand.indexOf(c) < 0);
      const n = g.players.length, wi = g.idx(W.id);
      let thief = null;
      for (let k = 1; k < n && !thief; k++) {
        const id = g.players[(wi + k) % n].id;
        if (losers.indexOf(id) >= 0 && live(id, 'poison')) thief = g.seat(id);
      }
      if (thief && spent.length) {
        for (const c of spent) thief.hand.push(c);
        g.say({ t: 'poison', by: thief.id, n: spent.length });
      } else for (const c of spent) g.discard.push(c);
    };
    if (W && g.has(W, 'prowess') && W.rage > 0 && b.played[W.id].length) {
      const opts = b.played[W.id].map(x => x.card);
      g.ask(W.id, 'prowess', { why: 'Tyr’s Prowess: 1 Rage each to take your played cards back', options: opts, max: W.rage }, a => {
        for (const c of a.cards) W.hand.push(c);
        W.rage -= a.cards.length;
        if (a.cards.length) g.say({ t: 'prowess', by: W.id, n: a.cards.length });
        spend();
      }, a => {
        if (a.t !== 'prowess' || !Array.isArray(a.cards)) return 'Choose the cards to keep.';
        if (a.cards.length > W.rage) return 'One Rage for each.';
        if (new Set(a.cards).size !== a.cards.length || !a.cards.every(c => opts.indexOf(c) >= 0)) return 'Only the cards you played.';
        return null;
      });
    } else spend();

    g.push(() => {
      /* the pillage */
      if (W && W.id === b.pillager) g.pillageReward(W, b.prov, b);
      else if (!W || W.id !== b.pillager) g.say({ t: 'pillageFailed', by: b.pillager, prov: b.prov });
      g.push(() => {
        /* Loki, the Trickster: the losers take the battle Glory, not the winner */
        if (g.godHere(b.prov, 'loki')) {
          for (const id of losers) { const q = g.seat(id); g.gain(q, g.statVal(q, 'axes'), 'Loki: lost the battle'); }
        } else if (W) g.gain(W, g.statVal(W, 'axes'), 'won the battle');
        if (W) {
          /* Thor, the Victorious: 2 Glory for every enemy figure destroyed in this battle */
          if (g.godHere(b.prov, 'thor')) {
            const foes = b.destroyed.filter(f => f.owner !== W.id).length;
            if (foes) g.gain(W, 2 * foes, 'Thor the Victorious');
          }
          /* Thor's Chosen: 3 Glory for each of the winner's Mystics in the battle */
          if (g.has(W, 'mysticGlory')) {
            const my = g.inArea(b.prov).filter(f => f.owner === W.id && f.kind === 'mystic').length;
            if (my) g.gain(W, 3 * my, 'Thor’s Chosen');
          }
          if (live(W.id, 'hammer')) g.gain(W, 3, 'Thor’s Hammer');
          if (live(W.id, 'ascension')) { W.rage += 3; g.gain(W, 3, 'Thor’s Ascension'); }
          if (live(W.id, 'oath')) g.askStat(W, 'Thor’s Oath: raise a clan stat');
        }
        const dead = b.destroyed;
        for (const id of b.parts) {
          const p = g.seat(id);
          if (live(id, 'judgement') && dead.length) g.gain(p, 2 * dead.length, 'Odin’s Judgement');
          const foes = dead.filter(f => f.owner !== id).length;
          if (b.valk.indexOf(id) >= 0 && foes) g.gain(p, 2 * foes, 'the Valkyrie');
          if (foes >= 2 && g.has(p, 'thorglory')) g.gain(p, 2, 'Thor’s Glory');
        }
        if (W) for (const id of losers) {
          const p = g.seat(id);
          if (live(id, 'trickery') && W.rage > 0) { W.rage -= 1; p.rage += 1; g.say({ t: 'steal', by: id, from: W.id, what: '1 Rage' }); }
          if (live(id, 'backstab') && W.glory > 0) { const k = Math.min(2, W.glory); W.glory -= k; p.glory += k; g.say({ t: 'steal', by: id, from: W.id, what: k + ' Glory' }); }
        }
        for (const id of losers) {
          const p = g.seat(id);
          if (!g.has(p, 'lokiblessing')) continue;
          const w = g.reserve(id).find(f => f.kind === 'warrior');
          if (w) g.offerPlace(p, w, 'Loki’s Blessing: a Warrior invades ' + D.prov(b.prov).name + ' for free?', [b.prov], null, true);
        }
        g.push(() => { const prov = b.prov, by = g.seat(b.pillager); g.battle = null; g.moveGod(by, prov); });
      });
    });
  };

  /* The pillage reward, and everything that hangs off "successfully pillage". */
  P.pillageReward = function (p, prov, b) {
    const g = this;
    const tok = g.prov[prov].token;
    g.prov[prov].pillaged = true;
    const here = g.inArea(prov).filter(f => f.owner === p.id);
    let times = here.some(f => f.kind === 'monster' && g.figDef(f).fx === 'frostgiant') ? 2 : 1;
    const odin = g.godHere(prov, 'odin');
    if (odin) times++;                               // Odin, the All-Father: the reward again
    g.say({ t: 'pillaged', by: p.id, prov, token: tok, times, odin });
    const raised = [];
    for (let k = 0; k < times; k++) {
      if (tok === 'glory') g.gain(p, 5, 'pillage');
      else if (tok === 'all') { for (const s of D.STAT_IDS) if (g.raise(p, s, 'pillage')) raised.push(s); }
      else if (g.raise(p, tok, 'pillage')) raised.push(tok);
    }
    const live = key => b && (b.played[p.id] || []).some(x => x.key === key && !x.cancelled);
    if (live('grace')) g.askStat(p, 'Frigga’s Grace: raise another clan stat', D.STAT_IDS.indexOf(tok) >= 0 ? tok : null);
    const leader = g.figsAt(prov).find(f => f.owner === p.id && g.leaderLike(f));
    if (leader && p.up.leader.length) {
      const fx = g.def(p.up.leader[0]).fx;
      if (fx === 'leaderStat') g.askStat(p, 'Lord of Axes: raise a clan stat');
      if (fx === 'leaderAll') for (const s of D.STAT_IDS) g.raise(p, s, 'Lord of Spears');
      if (fx === 'leaderMove') {
        g.push(() => {
          if (leader.at !== prov) return;
          const to = D.PROVINCES.map(x => x.id).filter(x => D.adjacent(prov, x) && g.alive(x) && g.room(x) > 0);
          if (!to.length) return;
          g.ask(p.id, 'place', { why: 'Lord of Hammers: move your Leader next door?', fig: leader.id, figName: 'Leader', options: to, optional: true, move: true }, a => {
            if (a.t === 'place') { leader.at = a.to; g.say({ t: 'march', by: p.id, from: prov, to: a.to, n: 1, lead: true }); }
          }, a => (a.t === 'skip' || (a.t === 'place' && to.indexOf(a.to) >= 0)) ? null : 'Not somewhere he can go.');
        });
      }
    }
  };

  /* ================================================================
     Views
     ================================================================ */
  P.publicView = function () {
    const g = this;
    const b = g.battle;
    /* Face-down cards are secret until the reveal — and with the telly staging
       the fight, until it has been fought: the cards, the totals and the winner
       all stay out of the view through the reveal, the Heimdall window and the
       clash itself. (A seat deciding on a Heimdall card is shown the totals in
       its own prompt; nobody else is.) */
    const shown = b && (b.stage === 'resolved' || (!g.opts.clashShow && (b.stage === 'revealed' || b.stage === 'late')) ||
      (b.open && b.stage !== 'clash'));        // under Heimdall every card is played face up
    return {
      v: VERSION, gid: g.gid, age: g.age, phase: g.phase, first: g.players[g.first].id,
      turn: g.phase === 'action' && g.prompts.length ? (g.prompts.find(x => x.t === 'turn') || {}).seat || null : null,
      players: g.players.map(p => ({
        id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, clan: p.clan, clanName: p.clanName, clanHex: p.clanHex,
        stats: Object.assign({}, p.stats),
        vals: { rage: g.statVal(p, 'rage'), axes: g.statVal(p, 'axes'), horns: g.statVal(p, 'horns') },
        rage: p.rage, glory: p.glory,
        hand: p.hand.length, quests: p.quests.length,
        up: Object.fromEntries(D.UPGRADE_KINDS.map(k => [k, p.up[k].map(c => ({ id: c, key: g.cards[c].key }))])),
        onBoard: g.onBoard(p.id).length,
        reserve: g.reserve(p.id).map(f => ({ id: f.id, kind: f.kind, key: f.key || null })),
        valhalla: g.valhalla(p.id).map(f => ({ id: f.id, kind: f.kind, key: f.key || null }))
      })),
      figs: g.figs.filter(f => onBoardLoc(f.at)).map(f => ({ id: f.id, owner: f.owner, kind: f.kind, key: f.key || null, at: f.at })),
      provs: Object.keys(g.prov).map(id => ({ id, destroyed: g.prov[id].destroyed, pillaged: g.prov[id].pillaged,
        token: g.prov[id].token, room: g.room(id) === Infinity ? null : g.room(id) })),
      doom: g.doom, ragnarok: g.ragnarok.slice(), preDestroyed: g.preDestroyed.slice(),
      gods: g.gods.map(d => ({ id: d.id, at: d.at })),
      battle: b ? {
        prov: b.prov, pillager: b.pillager, parts: b.parts.slice(), stage: b.stage, round: b.round, open: !!b.open,
        ready: (b.ready || []).slice(),
        played: shown ? Object.fromEntries(b.parts.map(id => [id, (b.played[id] || []).map(x =>
          ({ key: x.key, cancelled: x.cancelled, late: !!x.late, value: g.cardValue(id, x) }))])) : null,
        totals: shown ? (b.stage === 'resolved' && b.totals ? b.totals : g.totals())
          : Object.fromEntries(b.parts.map(id => [id, { figs: g.clanStr(id, b.prov, true), cards: null, total: null }])),
        winner: b.stage === 'resolved' ? b.winner : undefined
      } : null,
      prompts: g.prompts.map(x => ({ seat: x.seat, t: x.t, n: x.n, why: x.why })),
      hold: g.hold ? { t: g.hold.t, n: g.hold.n, prov: g.hold.prov || null, age: g.hold.age || null } : null,
      ageShow: g.hold && g.hold.t === 'age' ? g.ageShow : null,
      ragShow: g.hold && g.hold.t === 'ragnarok' ? g.ragShow : null,
      draft: g.draft ? { round: g.draft.round, per: g.draft.per, waiting: g.prompts.filter(x => x.t === 'draft').map(x => x.seat) } : null,
      result: g.result
    };
  };

  /* A seat's own half: its hand, its committed quests, the cards it has been
     passed, and the whole of its open question. */
  P.seatView = function (id) {
    const g = this;
    const p = g.seat(id);
    if (!p) return null;
    const card = c => Object.assign({ id: c }, g.cards[c]);
    const pr = g.promptFor(id);
    return {
      id, hand: p.hand.map(card), quests: p.quests.map(card), pack: p.pack.map(card),
      prompt: pr ? JSON.parse(JSON.stringify(pr)) : null,
      promptCards: pr && Array.isArray(pr.options) && typeof pr.options[0] === 'string' && g.cards[pr.options[0]]
        ? pr.options.map(card) : null
    };
  };

  /* The same arithmetic as clanStr, read off a publicView — so a house clan
     and a phone can count strength without the Game. tests/engine.js checks
     the two agree on thousands of positions. */
  function viewStr(pub, pid, prov, battle) {
    if (battle && (pub.gods || []).some(d => d.id === 'tyr' && d.at === prov)) return 0;
    const area = [prov].concat(D.FJORDS.filter(f => f.supports.indexOf(prov) >= 0).map(f => f.id));
    const here = pub.figs.filter(f => area.indexOf(f.at) >= 0);
    const wolf = battle && here.some(f => f.kind === 'monster' && D.CARDS[f.key].fx === 'wolfman');
    const p = pub.players.find(x => x.id === pid);
    const upKey = k => p.up[k].length ? D.CARDS[p.up[k][0].key] : null;
    let s = 0, w = 0;
    for (const f of here) {
      if (f.owner !== pid) continue;
      if (wolf && f.kind !== 'monster') continue;
      if (f.kind === 'warrior') { w++; continue; }
      if (f.kind === 'leader') s += upKey('leader') ? upKey('leader').str : D.BASE_STR.leader;
      else if (f.kind === 'ship') s += upKey('ship') ? upKey('ship').str : D.BASE_STR.ship;
      else if (f.kind === 'mystic') s += D.BASE_STR.mystic;
      else { const d = D.CARDS[f.key]; s += (d.fx === 'darkelf' && f.at === 'ygg') ? 3 : d.str; }
    }
    if (w) {
      const up = upKey('warrior') ? upKey('warrior').fx : null;
      if (up === 'pairs3') s += Math.floor(w / 2) * 3 + (w % 2);
      else if (up === 'pairs6') s += Math.floor(w / 2) * 6 + (w % 2) * 2;
      else if (up === 'str2') s += 2 * w;
      else s += w;
    }
    return s;
  }

  /* Where a Quest stands right now, read off a publicView (the phone's own
     check, never shown to anyone else): the provinces it is about, the ones
     already lost, the ones this clan holds the most STR in (a tie is not a
     lead, p.20), and whether it would be fulfilled if the Quests were counted
     now. The engine test holds this to P.questDone on real positions. */
  function questLead(pub, pid, key) {
    const d = D.CARDS[key];
    if (!d || d.kind !== 'quest') return null;
    const gone = id => { const P = pub.provs.find(x => x.id === id); return !P || P.destroyed; };
    const leads = id => {
      if (gone(id)) return false;
      const mine = viewStr(pub, pid, id, false);
      return mine > 0 && pub.players.every(q => q.id === pid || viewStr(pub, q.id, id, false) < mine);
    };
    let provs = [];
    if (d.fx === 'realm') provs = D.PROVINCES.filter(p => p.realm === d.realm).map(p => p.id);
    else if (d.fx === 'ygg') provs = ['ygg'];
    else if (d.fx === 'wide') provs = D.PROVINCES.map(p => p.id);
    const out = { fx: d.fx, provs, lost: provs.filter(gone), lead: provs.filter(leads) };
    if (d.fx === 'death') {
      const p = pub.players.find(x => x.id === pid);
      out.valhalla = p ? p.valhalla.length : 0;
      out.done = out.valhalla >= 4;
    } else out.done = out.lead.length >= (d.fx === 'wide' ? 2 : 1);
    return out;
  }

  root.BREngine = {
    VERSION,
    create: opts => new Game(opts),
    rng, shuffle, isFjord, isProv, viewStr, questLead, LEVELS,
    ragShow: true          // the engine can hold the table on Ragnarök (opts.ragShow)
  };
})(typeof window !== 'undefined' ? window : globalThis);
