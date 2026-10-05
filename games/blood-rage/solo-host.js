'use strict';
/* Blood Rage, single player — the table, run inside the phone's own page.
 *
 * On the Gameshow Hub the telly runs the game: the engine, the house clans,
 * the Age card it holds the table on, and the battlefield (br-scene.js) on
 * which every clash and every Ragnarök is played out before anyone learns how
 * it went. This file is that telly with the big screen taken away. The
 * handset (index.html) sends and receives the same messages it did over the
 * socket, through a tiny in-page bus; the battlefield is drawn into a box at
 * the top of the phone (attachScene) and its words, which the telly painted
 * across a 1920-wide stage, come out as `S.fieldShow` for the phone to set at
 * phone size.
 *
 * Added for one person on one phone: the game is saved after every move (the
 * seed and every accepted answer, the releases of the held table included —
 * the engine has one seeded rng and the house clans none, so a replay is
 * exact), and a turn can be taken back.
 */
(function (root) {
  const D = root.BRData, E = root.BREngine, B = root.BRBots, A = root.BRArt, W = root.BRWords;
  const ME = 'you';
  const SAVE_KEY = 'br.solo.save.v1', OPTS_KEY = 'br.solo.opts.v1', NAME_KEY = 'br.solo.name';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const readJSON = k => { const v = get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };
  const esc = A.esc;

  /* Every wait in one table, so the tests can turn them all down. */
  const T = {
    paceMs: { relaxed: 1600, brisk: 800 },
    thinkMin: 0.4, thinkMax: 1.1,
    /* the battlefield: lean in, charge, the fight in the dust, the dust settling */
    clash: { lean: 900, charge: 1000, fight: 2800, clear: 1800 },
    afterMs: 4500,          // the victors stand, the cards face up, before the board comes back
    unopposedMs: 2600,
    ragLookMs: 2600, rag: { rumble: 2200, burn: 3200, fall: 2600, settle: 2200 }, ragAfterMs: 3500,
    /* after your own move the house holds back a moment, so you see it land */
    afterYouMs: 700
  };
  const HOUSE = ['Ragnhild', 'Bjorn', 'Sigrun', 'Ivar'];
  /* "<name> pillages Horgr" — the name must take a verb in the third person. */
  const DEFAULT_NAME = 'The Jarl';

  const S = {
    screen: 'lobby', g: null,
    opts: Object.assign({ table: 3, pace: 'relaxed', draft1: true, ks: false, mystics: false, gods: false, level: 'medium', clan: null }, readJSON(OPTS_KEY) || {}),
    name: (get(NAME_KEY) || DEFAULT_NAME).slice(0, 14),
    gameOpts: null, thinking: {}, pay: null,
    seen: 0, crier: [], lastBattle: null,
    field: null, fieldSeq: 0, fight: null, held: [],
    teller: new W.Teller(),
    age: null, rag: null, ragHeld: null,
    fieldShow: null, onField: null, scene: null,
    createOpts: null, moves: [], lastHumanAt: 0,
    listener: null, resumed: false, quiet: false,
    pending: 0   // messages on their way, either direction (the tests wait for 0)
  };
  root.__BR_SOLO = S;
  const paceMs = () => T.paceMs[(S.gameOpts || S.opts).pace] || T.paceMs.relaxed;

  /* ---------------- the bus ---------------- */
  const queue = [];
  let flushing = false;
  function deliver(msg) {
    queue.push(JSON.parse(JSON.stringify(msg)));
    if (flushing) return;
    flushing = true; S.pending++;
    setTimeout(() => {
      S.pending--; flushing = false;
      const out = queue.splice(0);
      if (S.listener) for (const m of out) S.listener({ t: 'msg', msg: m });
    }, 0);
  }
  const flash = text => deliver({ t: 'flash', text });

  /* ================================================================
     The lobby.
     ================================================================ */
  const tableSize = () => Math.max(2, Math.min(5, +S.opts.table || 3));
  function lobbyView() {
    const size = tableSize();
    const want = [S.opts.clan && D.CLANS.some(c => c.id === S.opts.clan) ? S.opts.clan : null];
    const taken = new Set(want.filter(Boolean));
    const seats = [{ id: ME, name: S.name }].concat(HOUSE.slice(0, size - 1).map(n => ({ name: n, house: true, level: S.opts.level })));
    const all = seats.map((p, i) => {
      let c = want[i];
      if (!c) { c = D.CLANS.find(x => !taken.has(x.id)).id; taken.add(c); }
      const C = D.CLANS.find(x => x.id === c);
      return Object.assign({}, p, { clan: C.name, clanId: C.id, hex: C.hex, picked: !!want[i] });
    });
    return {
      seated: all.filter(p => !p.house), house: all.filter(p => p.house), size, minSize: 2, watching: [], name: S.name,
      pace: S.opts.pace, draft1: S.opts.draft1, ks: S.opts.ks, mystics: S.opts.mystics, gods: S.opts.gods, level: S.opts.level,
      clans: D.CLANS.map(c => ({ id: c.id, name: c.name, hex: c.hex })),
      shape: size === 5 ? 'Five clans: the green Ram joins, with the 5th-player cards; no province falls before Age 1.'
        : (D.PRE_DESTROYED[size] + ' province' + (D.PRE_DESTROYED[size] === 1 ? '' : 's') + ' already lost to Ragnarök before Age 1.')
    };
  }
  function setOpt(key, value) {
    if (S.screen !== 'lobby') return;
    if (key === 'table') { const v = +value; if (v < 2 || v > 5) return; S.opts.table = v; }
    else if (key === 'pace') { if (!T.paceMs[value]) return; S.opts.pace = value; }
    else if (key === 'draft1' || key === 'ks' || key === 'mystics' || key === 'gods') S.opts[key] = !!value;
    else if (key === 'level') { if (E.LEVELS.indexOf(value) < 0) return; S.opts.level = value; }
    else if (key === 'clan') { if (!D.CLANS.some(c => c.id === value)) return; S.opts.clan = value; }
    else if (key === 'name') {
      const v = String(value || '').trim().slice(0, 14);
      S.name = v && !/^(you|me|i)$/i.test(v) ? v : DEFAULT_NAME;
      set(NAME_KEY, S.name);
    }
    else return;
    set(OPTS_KEY, JSON.stringify(S.opts));
    publish();
  }

  /* ================================================================
     Starting, finishing, saving.
     ================================================================ */
  function freshTable() {
    S.pay = null; S.seen = 0; S.crier = []; S.thinking = {}; S.lastBattle = null;
    S.field = null; S.fight = null; S.held = []; S.teller = new W.Teller();
    S.age = null; S.rag = null; S.ragHeld = null; S.fieldShow = null;
    if (S.scene) S.scene.close();
  }
  function startGame() {
    if (S.screen !== 'lobby') return;
    const lv = lobbyView();
    const players = lv.seated.map(p => ({ id: ME, name: p.name, clan: p.clanId }))
      .concat(lv.house.map((b, k) => ({ id: 'house' + (k + 1), name: b.name, bot: true, level: S.opts.level, clan: b.clanId })));
    S.createOpts = { players, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
      opts: { draft1: S.opts.draft1, ks: S.opts.ks, mystics: S.opts.mystics, gods: S.opts.gods, clashShow: true, ageShow: true, ragShow: true } };
    freshTable();
    S.g = E.create(S.createOpts);
    S.gameOpts = Object.assign({}, S.opts, { table: players.length });
    S.moves = []; S.resumed = false;
    S.screen = 'play';
    afterChange();
  }
  function resetToLobby() {
    freshTable();
    S.g = null; S.screen = 'lobby'; S.gameOpts = null; S.moves = []; S.createOpts = null;
    del(SAVE_KEY);
    notifyField();
    publish();
  }
  function save() {
    if (!S.g || !S.createOpts) return;
    if (S.screen === 'over') { del(SAVE_KEY); return; }
    set(SAVE_KEY, JSON.stringify({ v: 1, createOpts: S.createOpts, gameOpts: S.gameOpts, moves: S.moves, at: Date.now() }));
  }
  function replay(createOpts, moves) {
    const g = E.create(createOpts);
    for (const m of moves) {
      if (m.rel) { if (!g.release(m.rel)) throw new Error('the table was not held on ' + m.rel); continue; }
      const r = g.act(m.seat, m.a);
      if (!r.ok) throw new Error(r.why);
    }
    return g;
  }
  /* A rebuilt game (resumed, or a move taken back): its words are said again
     from the start, quietly — no battle is replayed that is already over. */
  function adopt(g, moves) {
    freshTable();
    S.g = g; S.moves = moves;
    S.quiet = true;
    hearLog();
    S.quiet = false;
  }
  function resume() {
    const s = readJSON(SAVE_KEY);
    if (!s || s.v !== 1 || !s.createOpts || !Array.isArray(s.moves)) return false;
    let g;
    try { g = replay(s.createOpts, s.moves); } catch (e) { del(SAVE_KEY); return false; }
    if (g.phase === 'over') { del(SAVE_KEY); return false; }
    S.createOpts = s.createOpts;
    S.gameOpts = s.gameOpts || Object.assign({}, S.opts);
    adopt(g, s.moves);
    S.screen = 'play'; S.resumed = true;
    return true;
  }
  const ord = k => k + (k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th');
  function settle() {
    const g = S.g;
    if (!g || g.phase !== 'over' || S.pay) return;
    S.pay = g.result.rows.map(r => ({ id: r.id, name: r.name, bot: r.bot, place: r.place,
      detail: r.total + ' Glory' + (r.won ? ', beside Odin' : ', ' + ord(r.place)) }));
  }

  /* ================================================================
     Taking a turn back. Undo rebuilds the game from its seed and replays
     every answer before the one taken back. What can no longer be unseen:
       · the Age or the phase has moved on;
       · anybody has pillaged since — a battle, its cards and its dead are
         never taken back (nor is your own pillage, once made);
       · the table has been held (the Age card, a clash, Ragnarök).
     So you may walk back through your own turns this Action phase, and the
     house clans' replies go with them — they simply think again.
     ================================================================ */
  function markOf(g) { return { age: g.age, phase: g.phase, logN: g.log.length }; }
  function play(g, seat, a) {
    const mark = markOf(g);
    const r = g.act(seat, a);
    if (r && r.ok && g === S.g) {
      const p = g.seat(seat);
      S.moves.push({ seat, a: JSON.parse(JSON.stringify(a)), human: !!p && !p.bot, mark });
      if (p && !p.bot) S.lastHumanAt = Date.now();
    }
    return r;
  }
  function release(g, t) {
    if (!g.release(t)) return false;
    if (g === S.g) S.moves.push({ rel: t });
    return true;
  }
  function undoTarget() {
    const g = S.g;
    if (!g || S.screen !== 'play' || g.hold || S.age || S.rag || g.phase !== 'action' || g.battle) return -1;
    for (let k = S.moves.length - 1; k >= 0; k--) {
      const m = S.moves[k];
      if (m.rel) return -1;
      if (m.mark.age !== g.age || m.mark.phase !== 'action') return -1;
      if (!m.human) continue;
      for (let i = m.mark.logN; i < g.log.length; i++) if (g.log[i].t === 'pillage') return -1;
      return k;
    }
    return -1;
  }
  function undoInfo() {
    const k = undoTarget();
    if (k < 0) return null;
    const m = S.moves[k];
    const nm = id => { const p = S.g.seat(id); return p ? p.name : '?'; };
    const t = new W.Teller();
    for (let i = m.mark.logN; i < S.g.log.length; i++) { const e = S.g.log[i]; if (e.by === ME) t.feed(e); }
    const L = t.lines[0];
    return { what: L ? W.say(L, nm) : 'your last move' };
  }
  function doUndo() {
    const k = undoTarget();
    if (k < 0) { flash('That can no longer be taken back — somebody has pillaged since, or the phase has moved on.'); publish(); return; }
    const keep = S.moves.slice(0, k);
    const want = S.moves[k].mark.logN;
    let ng;
    try {
      ng = replay(S.createOpts, keep);
      if (ng.log.length !== want) throw new Error('the replay came out different');
    } catch (e) { flash('Could not take that back (' + e.message + ').'); return; }
    adopt(ng, keep);
    afterChange();
  }

  /* ================================================================
     Talking to the handset.
     ================================================================ */
  function publish() {
    const g = S.g;
    deliver({
      t: 'br', screen: S.screen, remote: ME, solo: true,
      opts: S.gameOpts || S.opts,
      lobby: S.screen === 'lobby' ? lobbyView() : null,
      game: g ? g.publicView() : null,
      last: S.lastBattle,
      hurry: null,
      said: g ? saidView() : null,
      age: ageView(),
      pay: S.pay ? S.pay.map(p => ({ name: p.name, detail: p.detail, bot: p.bot })) : null,
      undo: g ? undoInfo() : null
    });
    if (g && g.idx(ME) >= 0) deliver({ t: 'br-me', me: g.seatView(ME) });
  }
  function clean(a) {
    const out = { t: String(a.t || '').slice(0, 20) };
    for (const k of ['fig', 'to', 'from', 'card', 'replace', 'prov', 'stat', 'victim']) if (a[k] != null) out[k] = String(a[k]).slice(0, 60);
    for (const k of ['figs', 'cards']) if (Array.isArray(a[k])) out[k] = a[k].slice(0, 20).map(x => String(x).slice(0, 60));
    return out;
  }
  function input(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') { publish(); return; }
    if (S.screen === 'lobby') {
      if (msg.t === 'clan') setOpt('clan', String(msg.clan || ''));
      else if (msg.t === 'opt') setOpt(msg.key, msg.value);
      else if (msg.t === 'start') startGame();
      return;
    }
    if (msg.t === 'again') { if (S.screen === 'over') resetToLobby(); return; }
    if (msg.t === 'abandon') { resetToLobby(); return; }
    const g = S.g;
    if (!g) return;
    if (msg.t === 'cont') { ageContinue(msg.n); return; }
    if (msg.t === 'undo') { doUndo(); return; }
    if (msg.t === 'skipfield') { skipField(); return; }
    if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
      if (S.age) { flash('Read the end of the Age first, then tap Continue.'); publish(); return; }
      const r = play(g, ME, clean(msg.a));
      if (!r.ok) { flash(r.why); publish(); return; }
      afterChange();
    }
  }

  function afterChange() {
    const g = S.g;
    if (!g) return;
    hearLog();
    ageWatch();
    if (g.phase === 'over' && S.screen !== 'over') { S.screen = 'over'; settle(); }
    houseThinks();
    paintField();
    maybeClash();
    maybeRagnarok();
    save();
    publish();
  }

  /* The house clans, deciding from their own seat's view and nothing else.
     The key carries the prompt's number: the same seat can be asked the same
     kind of question twice running. */
  function houseThinks() {
    const g = S.g;
    if (!g || g.phase === 'over') return;
    for (const pr of g.prompts.slice()) {
      const p = g.seat(pr.seat);
      if (!p || !p.bot) continue;
      const key = pr.seat + ':' + pr.n;
      if (S.thinking[key]) continue;
      S.thinking[key] = true;
      const quick = pr.t === 'join' || pr.t === 'late' || pr.t === 'yesno' || pr.t === 'protect' || pr.t === 'retreat';
      let ms = paceMs() * (quick ? 0.35 : 1) * (T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin)) +
        (S.field && S.field.stage === 'after' && !g.battle ? Math.max(0, S.field.until - Date.now()) : 0);
      const last = S.moves[S.moves.length - 1];
      if (last && last.human) ms = Math.max(ms, S.lastHumanAt + T.afterYouMs - Date.now());
      setTimeout(() => {
        if (S.g !== g || g.phase === 'over') return;
        const now = g.promptFor(pr.seat);
        if (!now || now.n !== pr.n) return;
        const me = g.seatView(pr.seat);
        let r = play(g, pr.seat, B.answer(g.publicView(), me, me.prompt));
        if (!r.ok) {   // should never happen; the house passes rather than hang the table
          const fall = { turn: { t: 'pass' }, join: { t: 'pass' }, late: { t: 'pass' }, place: { t: 'skip' }, yesno: { t: 'no' }, protect: { t: 'protect', figs: [] }, prowess: { t: 'prowess', cards: [] },
            retreat: { t: 'stay' }, god: { t: 'god', to: pr.options && pr.options[0] } }[pr.t];
          if (fall) r = play(g, pr.seat, fall);
        }
        afterChange();
      }, ms);
    }
  }

  /* ================================================================
     Words — the log, said out loud (br-words.js, shared with the hub).
     ================================================================ */
  const nameOf0 = id => { const p = S.g && S.g.seat(id); return p ? p.name : '?'; };
  function hearLog() {
    const g = S.g;
    if (!g) return;
    let lastRag = -1;
    for (let i = g.log.length - 1; i >= 0; i--) if (g.log[i].t === 'ragnarok') { lastRag = i; break; }
    for (let i = S.seen; i < g.log.length; i++) {
      const e = g.log[i];
      fieldHears(e);
      if (e.t === 'battle') S.lastBattle = { prov: e.prov, parts: e.parts.slice(), cards: null, winner: undefined, totals: null };
      if (e.t === 'reveal' && S.lastBattle) S.lastBattle.cards = e.cards;
      if (e.t === 'result' && S.lastBattle) { S.lastBattle.winner = e.winner; S.lastBattle.totals = e.totals; }
      /* The cards are the fight's result: not said until the dust has settled. */
      if (g.opts.clashShow && (e.t === 'reveal' || e.t === 'cancelled' || e.t === 'late')) { S.held.push(e); continue; }
      if (e.t === 'result') { for (const h of S.held) S.teller.feed(h); S.held = []; }
      /* Ragnarök is said when it has been seen — only the one being held now */
      if (S.ragHeld) { S.ragHeld.push(e); continue; }
      if (g.opts.ragShow && e.t === 'ragnarok' && !e.already && i === lastRag && g.hold && g.hold.t === 'ragnarok') { S.ragHeld = [e]; continue; }
      S.teller.feed(e);
    }
    S.seen = g.log.length;
  }
  function saidView() {
    return S.teller.lines.slice(-60).map(L => ({ k: L.k, t: L.t, by: L.by, turn: L.turn, age: L.age, text: W.say(L, nameOf0) }));
  }

  /* ================================================================
     The end of an Age: held until you tap Continue.
     ================================================================ */
  function ageWatch() {
    const g = S.g;
    if (!g || !g.hold || g.hold.t !== 'age') return;
    if (S.age && S.age.n === g.hold.n) return;
    S.age = { n: g.hold.n, age: g.hold.age, waiting: [ME], done: [] };
  }
  function ageView() {
    const a = S.age;
    return a ? { n: a.n, age: a.age, waiting: a.waiting.slice(), done: a.done.slice(), grace: false } : null;
  }
  function ageContinue(n) {
    const a = S.age, g = S.g;
    if (!a || (n != null && +n !== a.n)) return;
    S.age = null;
    if (g && g.hold && g.hold.t === 'age' && g.hold.n === a.n) release(g, 'age');
    afterChange();
  }

  /* ================================================================
     The battlefield: the province in a box at the top of the phone, its
     words set at phone size underneath (S.fieldShow). The engine holds the
     result (opts.clashShow) until the dust has settled here.
     ================================================================ */
  function areaOf(prov) { return [prov].concat(D.FJORDS.filter(f => f.supports.indexOf(prov) >= 0).map(f => f.id)); }
  function clanMaps(pub) {
    const hexOf = {}, clanOf = {};
    for (const p of pub.players) { hexOf[p.id] = p.clanHex; clanOf[p.id] = p.clan; }
    return { hexOf, clanOf };
  }
  function later(ms) { setTimeout(() => { if (S.g && S.screen !== 'lobby') { paintField(); notifyField(); } }, ms + 60); }
  function notifyField() { if (S.onField) { try { S.onField(S.fieldShow); } catch (e) {} } }
  function fieldHears(e) {
    const now = Date.now();
    if (e.t === 'pillage') S.field = { seq: ++S.fieldSeq, prov: e.prov, pillager: e.by, again: !!e.again, stage: 'call', until: 0, late: {}, order: [e.by] };
    const F = S.field;
    if (!F) return;
    switch (e.t) {
      case 'unopposed': F.stage = 'unopposed'; F.until = S.quiet ? 0 : now + T.unopposedMs; if (!S.quiet) later(T.unopposedMs); break;
      case 'battle': F.stage = 'battle'; break;
      case 'smite': F.smite = { by: e.by, n: e.n, seen: S.quiet }; break;
      case 'tide': F.tide = true; break;
      case 'late': F.late[e.by] = (F.late[e.by] || 0) + 1; break;
      case 'watch': F.late = {}; F.watched = (F.watched || 0) + 1; break;
      case 'result': F.stage = 'after'; F.until = S.quiet ? 0 : now + T.afterMs; if (!S.quiet) later(T.afterMs); break;
    }
  }
  /* The battle that has been fought stays up a while; a tap moves it along. */
  function skipField() {
    const F = S.field;
    if (F && F.stage === 'after' && !(S.fight && S.fight.playing)) { F.until = 0; paintField(); notifyField(); publish(); }
    else if (F && F.stage === 'unopposed') { F.until = 0; paintField(); notifyField(); publish(); }
  }
  function fieldOrder(pub, F, figs, res) {
    const b = pub.battle && pub.battle.prov === F.prov ? pub.battle : null;
    const parts = b ? b.parts : (res ? res.parts : []);
    const more = parts.concat(pub.players.map(p => p.id).filter(id => figs.some(f => f.owner === id)));
    for (const id of more) if (F.order.indexOf(id) < 0) F.order.push(id);
    return F.order.filter(id => id === F.pillager || parts.indexOf(id) >= 0 || figs.some(f => f.owner === id));
  }
  function cardSlot(kind, c) {
    if (kind === 'back') return '<div class="cslot back"></div>';
    if (kind === 'choosing') return '<div class="cslot choosing">choosing</div>';
    if (kind === 'none') return '<div class="cslot none">no cards</div>';
    const d = D.CARDS[c.key] || { name: c.key };
    return '<div class="cslot face' + (c.cancelled ? ' cancelled' : '') + '" style="--g:' + esc(D.GODS[d.god] || '#e8c267') + '"><b>+' + c.value + '</b><span>' + esc(d.name) + '</span></div>';
  }
  function bannerRow(pub, F, b, id, res) {
    const p = pub.players.find(x => x.id === id);
    let str, cards, tot = '', cls = '';
    if (res) {
      const t = res.totals[id] || { figs: 0, total: 0 };
      str = t.figs;
      cards = (res.cards[id] || []).map(c => cardSlot('face', c)).join('') || cardSlot('none');
      tot = String(t.total);
      cls = res.winner === id ? 'win' : 'lose';
    } else {
      str = b && b.totals[id] ? b.totals[id].figs : E.viewStr(pub, id, F.prov, true);
      cards = '';
      if (b && b.parts.indexOf(id) >= 0 && b.open && b.played && (b.played[id] || []).length) {
        cards = b.played[id].map(c => cardSlot('face', c)).join('');
      } else if (b && b.parts.indexOf(id) >= 0) {
        if (b.ready.indexOf(id) >= 0) cards = cardSlot('back');
        else if (pub.prompts.some(q => q.seat === id && q.t === 'card')) cards = cardSlot('choosing');
        else cards = cardSlot('none');
        for (let k = 0; k < (F.late[id] || 0); k++) cards += cardSlot('back');
      }
    }
    const html = '<div class="bn-fig">' + A.figImg(p.clan + '_leader', 78) + '</div>' +
      '<div class="bn-main"><div class="bn-name">' + esc(id === ME ? p.name + ' (you)' : p.name) + '</div><div class="bn-clan">' + esc(p.clanName) + ' clan' +
      (id === F.pillager ? ' · pillaging' : '') + '</div></div>' +
      '<div class="bn-str"><small>STR</small><b>' + str + '</b></div><div class="bn-cards">' + cards + '</div><div class="bn-tot">' + tot + '</div>';
    return { id, hex: p.clanHex, cls, html };
  }
  /* What the battlefield says, for the scene (whose own words the phone
     hides) and for the phone (which sets them at its own size). */
  function show(sc, kind, prov, title, line, rows, verdict) {
    if (sc) { sc.bannerRows(rows); sc.title(title, line); sc.verdict(verdict ? verdict.key : '', verdict ? verdict.html : '', verdict ? verdict.cls : ''); }
    S.fieldShow = { kind, prov, title, line, rows, verdict: verdict ? { html: verdict.html, cls: verdict.cls || '' } : null,
      canSkip: kind === 'unopposed' || (kind === 'battle' && S.field && S.field.stage === 'after' && !(S.fight && S.fight.playing)) };
  }
  function paintField() {
    const g = S.g;
    const sc = S.scene;
    if (!g || S.screen === 'lobby') { S.fieldShow = null; if (sc) sc.close(); notifyField(); return; }
    const pub = g.publicView();
    if (S.rag) { paintRag(pub); notifyField(); return; }
    const F = S.field;
    const playing = S.fight && S.fight.playing;
    const b = F && pub.battle && pub.battle.prov === F.prov ? pub.battle : null;
    if (!F || !(b || playing || Date.now() < F.until)) {
      if (F && !pub.battle) S.field = null;
      if (sc) sc.close();
      S.fieldShow = null;
      notifyField();
      return;
    }
    if (sc) {
      sc.open(F.prov);
      const godHere0 = (pub.gods || []).find(d => d.at === F.prov);
      sc.god(godHere0 ? godHere0.id : null);
    }
    const PV = D.prov(F.prov).name;
    const nm = id => { const p = pub.players.find(x => x.id === id); return p ? p.name : '?'; };
    const area = areaOf(F.prov);
    const figs = pub.figs.filter(f => area.indexOf(f.at) >= 0);
    const { hexOf, clanOf } = clanMaps(pub);
    const res = F.stage === 'after' && S.fight && S.fight.seq === F.seq ? S.fight.show : null;
    const order = fieldOrder(pub, F, figs, res);
    if (sc && !playing) sc.place(root.BRScene.layout(figs, order, clanOf, { victors: res ? res.winner || '-' : null }), hexOf);
    const inBattle = b ? b.parts : (res ? res.parts : []);
    const rows = order.filter(id => !inBattle.length || inBattle.indexOf(id) >= 0).map(id => bannerRow(pub, F, b, id, res));
    const P = pub.provs.find(x => x.id === F.prov);
    const reward = P ? D.PILLAGE_NAMES[P.token] : '';
    const clanName = id => { const p = pub.players.find(x => x.id === id); return p ? p.clanName : '?'; };
    if (F.stage === 'unopposed') {
      show(sc, 'unopposed', F.prov, clanName(F.pillager) + ' take ' + PV, 'Nobody stands in their way. ' + nm(F.pillager) + ' pillages: ' + reward + '.', rows, null);
      notifyField(); return;
    }
    if (res) {
      const fallen = res.doomed.length;
      const toV = fallen ? fallen + ' to Valhalla' : (res.god === 'frigga' ? 'Frigga let nobody fall' : 'nobody fell');
      if (!res.winner) {
        show(sc, 'battle', F.prov, 'No one stands at ' + PV, 'A tie — every clan in it falls. ' + toV + '.', rows,
          { key: 'tie' + F.seq, cls: 'tie', html: '<h3>No one stands</h3><p>A tie at ' + esc(PV) + ' — every clan in it falls.</p><small>' + esc(toV) + '</small>' });
      } else {
        const took = res.winner === F.pillager;
        const head = clanName(res.winner) + (took ? ' take ' : ' hold ') + PV;
        const tail = toV + (took ? ' · pillage: ' + reward : ' · ' + nm(F.pillager) + '’s pillage fails');
        show(sc, 'battle', F.prov, head, nm(res.winner) + ' wins the battle · ' + tail, rows,
          { key: 'w' + F.seq, cls: '', html: '<h3>' + esc(head) + '</h3><p>' + esc(nm(res.winner)) + ' wins the battle</p><small>' + esc(tail) + '</small>' });
      }
      notifyField(); return;
    }
    if (playing) { show(sc, 'battle', F.prov, 'The Battle for ' + PV, 'The clans charge — the dust is up…', rows, null); notifyField(); return; }
    if (!b || !b.parts.length) {
      const deciding = pub.prompts.filter(q => q.t === 'join').map(q => nm(q.seat));
      show(sc, 'battle', F.prov, clanName(F.pillager) + ' pillage ' + PV,
        deciding.length ? deciding.join(' and ') + ' may answer the call to battle…' : 'The call to battle — neighbours may send one figure each.', rows, null);
      notifyField(); return;
    }
    const godHere = (pub.gods || []).find(d => d.at === F.prov);
    const godLine = godHere ? ' ' + D.DEITIES[godHere.id].name + ' is here: ' + D.DEITIES[godHere.id].text : '';
    const choosing = pub.prompts.filter(q => q.t === 'card').map(q => nm(q.seat));
    const late = pub.prompts.filter(q => q.t === 'late').map(q => nm(q.seat));
    const tide = pub.prompts.some(q => q.t === 'tide');
    if (F.smite && !F.smite.seen) {
      F.smite.seen = true;
      if (sc) sc.strike(order.indexOf(F.smite.by) === 0 ? 3 : -3);
    }
    let line;
    if (F.smite && !choosing.length && !late.length) line = '⚡ Odin’s Smite! ' + nm(F.smite.by) + '’s card strikes ' + F.smite.n + ' Warrior' + (F.smite.n === 1 ? '' : 's') + ' down before the clash.';
    else if (choosing.length) line = choosing.join(' and ') + (choosing.length > 1 ? ' are' : ' is') + (b.open ? ' choosing a card to play face up…' : ' choosing a card, face down…') + (F.watched ? ' (Heimdall’s Watch: again!)' : '');
    else if (late.length) line = 'Heimdall watches — ' + late.join(' and ') + ' may add a card now the cards are down…';
    else if (tide) line = 'Odin’s Tide — every clan keeps just one figure…';
    else line = 'Every card is down.';
    show(sc, 'battle', F.prov, 'The Battle for ' + PV, line + godLine, rows, null);
    notifyField();
  }
  function maybeClash() {
    const g = S.g;
    if (!g || !g.hold || g.hold.t !== 'clash' || !g.battle || !g.battle.show) return;
    if (S.fight && S.fight.n === g.hold.n) return;
    const F = S.field;
    const sh = JSON.parse(JSON.stringify(g.battle.show));
    const fight = S.fight = { n: g.hold.n, seq: F ? F.seq : 0, show: sh, playing: true };
    if (F) F.stage = 'clash';
    paintField();
    const pub = g.publicView();
    const { clanOf } = clanMaps(pub);
    const area = areaOf(sh.prov);
    const survivors = pub.figs.filter(f => area.indexOf(f.at) >= 0 && sh.doomed.indexOf(f.id) < 0);
    const order = F ? F.order.filter(id => sh.parts.indexOf(id) >= 0) : sh.parts;
    const victors = root.BRScene.layout(survivors, order, clanOf, { victors: sh.winner || '-' });
    const end = () => {
      fight.playing = false;
      if (S.g !== g || !g.hold || g.hold.n !== fight.n) return;
      release(g, 'clash');
      afterChange();
      if (S.scene) S.scene.ghosts();
    };
    const sc = S.scene;
    if (!sc || !sc.prov) { setTimeout(end, 0); return; }
    sc.clash({ doomed: sh.doomed, victors }, T.clash, end);
  }

  /* ================================================================
     Ragnarök: the province burns on the phone, then the Age card.
     ================================================================ */
  function maybeRagnarok() {
    const g = S.g;
    if (!g || !g.hold || g.hold.t !== 'ragnarok' || !g.ragShow) return;
    if (S.rag && S.rag.n === g.hold.n) return;
    const sh = JSON.parse(JSON.stringify(g.ragShow));
    const R = S.rag = { n: g.hold.n, show: sh, stage: 'look', placed: false };
    S.field = null;
    paintField();
    const end = () => {
      if (S.rag !== R) return;
      S.rag = null;
      for (const h of S.ragHeld || []) S.teller.feed(h);
      S.ragHeld = null;
      if (S.g === g && g.hold && g.hold.t === 'ragnarok' && g.hold.n === R.n) release(g, 'ragnarok');
      afterChange();
    };
    const plan = { dies: sh.figs.filter(f => f.fate === 'dies').map(f => f.id), flees: sh.figs.filter(f => f.fate === 'flees').map(f => f.id) };
    setTimeout(() => {
      if (S.rag !== R) return;
      R.stage = 'burn';
      paintField();
      const after = () => {
        if (S.rag !== R) return;
        R.stage = 'after';
        paintField();
        setTimeout(end, T.ragAfterMs);
      };
      if (S.scene) S.scene.ragnarok(plan, T.rag, after); else after();
    }, T.ragLookMs);
  }
  function paintRag(pub) {
    const R = S.rag, sh = R.show, sc = S.scene;
    if (sc) sc.open(sh.prov);
    const PV = D.prov(sh.prov).name;
    const nm = id => { const p = pub.players.find(x => x.id === id); return p ? p.name : '?'; };
    const clan = id => pub.players.find(x => x.id === id) || { clanName: '?', clanHex: '#888', clan: 'wolf', name: '?' };
    const { hexOf, clanOf } = clanMaps(pub);
    const order = pub.players.map(p => p.id).filter(id => sh.figs.some(f => f.owner === id));
    if (!R.placed) { R.placed = true; if (sc) sc.place(root.BRScene.layout(sh.figs, order, clanOf), hexOf); }
    const after = R.stage === 'after';
    const rows = order.map(id => {
      const p = clan(id), mine = sh.figs.filter(f => f.owner === id);
      const died = mine.filter(f => f.fate === 'dies').length;
      const gl = sh.glory.find(r => r.id === id);
      const html = '<div class="bn-fig">' + A.figImg(p.clan + '_leader', 78) + '</div>' +
        '<div class="bn-main"><div class="bn-name">' + esc(id === ME ? p.name + ' (you)' : p.name) + '</div><div class="bn-clan">' + esc(p.clanName) + ' clan' +
        (gl && gl.doubled ? ' · Odin’s Inspiration: doubled' : '') + '</div></div>' +
        '<div class="bn-str"><small>' + (after ? 'FELL' : 'HERE') + '</small><b>' + (after ? died : mine.length) + '</b></div>' +
        '<div class="bn-tot">' + (after && gl && gl.n ? '+' + gl.n : '') + '</div>';
      return { id, hex: p.clanHex, cls: after ? 'win' : '', html };
    });
    const nFigs = sh.figs.length;
    const dying = sh.figs.filter(f => f.fate === 'dies').length;
    const AGE = ['', 'First', 'Second', 'Third'];
    const why = sh.fenrir ? ' Fenrir dragged Ragnarök here for ' + nm(sh.fenrir) + '.' : '';
    if (!after) {
      show(sc, 'rag', sh.prov, 'Ragnarök falls on ' + PV, 'The end of the ' + AGE[sh.age] + ' Age.' + why + ' ' + (nFigs
        ? nFigs + ' figure' + (nFigs === 1 ? '' : 's') + ' stand' + (nFigs === 1 ? 's' : '') + ' here — every one that dies earns its clan ' + sh.per + ' Glory.'
        : 'Nobody stands here.'), rows, null);
      return;
    }
    const paid = sh.glory.filter(r => r.n).map(r => clan(r.id).clanName + ' +' + r.n);
    const fledN = sh.figs.filter(f => f.fate === 'flees').length;
    const fled = fledN ? ' ' + (fledN === 1 ? 'One figure' : fledN + ' figures') + ' escaped the fire.' : '';
    const next = sh.next ? 'Next Age, Ragnarök will take ' + D.prov(sh.next).name + '.' : 'The world has ended — the final count.';
    const head = PV + ' is swallowed';
    const line = (dying ? dying + ' to Valhalla' + (paid.length ? ' · Glory: ' + paid.join(', ') : '') : 'Nobody fell') + '.' + fled;
    show(sc, 'rag', sh.prov, head, line + ' ' + next, rows,
      { key: 'rag' + R.n, cls: 'rag', html: '<h3>' + esc(head) + '</h3><p>' + esc(line) + '</p><small>' + esc(next) + '</small>' });
  }

  /* ---------------- wiring ---------------- */
  const Solo = {
    ME, T, S,
    attach(fn) {
      S.listener = fn;
      deliver({ t: 'hello-ok', id: ME, name: S.name });
      if (S.g && S.screen === 'play') afterChange(); else publish();
    },
    /* The battlefield's box on the phone, and who to tell when its words change. */
    attachScene(host, onField) {
      if (root.BRScene && host) S.scene = new root.BRScene.Scene(host);
      S.onField = onField || null;
    },
    send(msg) { S.pending++; setTimeout(() => { S.pending--; input(JSON.parse(JSON.stringify(msg))); }, 0); }
  };
  resume();
  root.BRSolo = Solo;
})(typeof window !== 'undefined' ? window : globalThis);
