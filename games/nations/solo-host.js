'use strict';
/* Nations, single player — the table, run inside the phone's own page.
 *
 * On the Gameshow Hub the telly runs the game and the phones are handsets.
 * Here there is no telly: this file is the telly's orchestration with the
 * screen taken out — the engine, the house nations, the round card held
 * until you have read it, undo by replay — talking to the handset through a
 * tiny in-page bus instead of a socket. The handset (index.html) sends and
 * receives exactly the messages it would on the hub.
 *
 * The game is saved after every change (the seed and every accepted answer),
 * so a phone that throws the tab away mid-game picks up where it left off:
 * the engine has one seeded rng and no timers, so a replay is exact.
 */
(function (root) {
  const D = root.NationsData, E = root.NationsEngine, B = root.NationsBots, W = root.NationsWords;
  const ME = 'you';
  const SAVE_KEY = 'nations.solo.save.v1', OPTS_KEY = 'nations.solo.opts.v1', NAME_KEY = 'nations.solo.name';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };

  /* Every wait in one table. A house nation's thinking is a fraction of the
     chosen pace; after your move it holds back a moment so you see it land. */
  const T = {
    paceMs: { slow: 2400, relaxed: 1400, brisk: 600 },
    thinkMin: 0.45, thinkMax: 1.1,
    afterYouMs: 900
  };
  const HOUSE = [
    { name: 'Hammurabi', hex: '#c8463c' }, { name: 'Cleopatra', hex: '#4a86d9' }, { name: 'Pericles', hex: '#8e5bc4' },
    { name: 'Ashoka', hex: '#3fae67' }, { name: 'Trajan', hex: '#d07a2c' }
  ];
  const YOU_HEX = '#e8b94a';
  const DECKS = { base: ['base'], adv: ['base', 'adv'], exp: ['base', 'adv', 'exp'] };
  const OPTS = {
    decks: ['base', 'adv', 'exp'], side: ['A', 'B'], diff: D.DIFFICULTY.map(d => d.id),
    pace: ['slow', 'relaxed', 'brisk']
  };

  const S = {
    screen: 'lobby', g: null,
    opts: Object.assign({ table: 3, decks: 'base', side: 'A', diff: 'prince', pace: 'relaxed', ages: 4 }, readJSON(OPTS_KEY) || {}),
    /* Lines read "<name> buys …", so the default must take a verb in the third person. */
    name: (get(NAME_KEY) || 'Your Majesty').slice(0, 14),
    gameOpts: null, thinking: {}, hold: null, lastRound: 0, lastEvent: 0, roundVP: {},
    createOpts: null, moves: [], lastHumanAt: 0, listener: null, resumed: false,
    pending: 0   // messages on their way, either direction (the tests wait for 0)
  };
  root.__NATIONS_SOLO = S;
  S.T = T;

  function readJSON(k) { const v = get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
  const paceMs = () => T.paceMs[(S.gameOpts || S.opts).pace] || T.paceMs.relaxed;

  /* ---------------- the bus ---------------- */
  const queue = [];
  let flushing = false;
  function deliver(msg) {
    queue.push(JSON.parse(JSON.stringify(msg)));
    if (flushing) return;
    flushing = true;
    S.pending++;
    setTimeout(() => {
      S.pending--;
      flushing = false;
      const out = queue.splice(0);
      if (S.listener) for (const m of out) S.listener({ t: 'msg', msg: m });
    }, 0);
  }
  const flash = text => deliver({ t: 'flash', text });

  /* ---------------- the lobby ---------------- */
  function tableSize() { return Math.max(2, Math.min(5, +S.opts.table || 3)); }
  function lobbyView() {
    const size = tableSize();
    return {
      seated: [{ id: ME, name: S.name, hex: YOU_HEX }],
      house: HOUSE.slice(0, size - 1).map(b => ({ name: b.name, hex: b.hex, house: true })),
      size, decks: S.opts.decks, side: S.opts.side, diff: S.opts.diff, pace: S.opts.pace, ages: S.opts.ages,
      watching: [], minSize: 2, name: S.name
    };
  }
  function setOpt(key, value) {
    if (S.screen !== 'lobby') return;
    if (key === 'table') { const v = +value; if (v < 2 || v > 5) return; S.opts.table = v; }
    else if (key === 'ages') { const v = +value; if (v !== 2 && v !== 4) return; S.opts.ages = v; }
    else if (key === 'name') { const v = String(value || '').trim().slice(0, 14); S.name = v && !/^(you|me|i)$/i.test(v) ? v : 'Your Majesty'; set(NAME_KEY, S.name); }
    else if (OPTS[key]) { if (OPTS[key].indexOf(String(value)) < 0) return; S.opts[key] = String(value); }
    else return;
    /* Five nations need the advanced cards too (the base deck is too thin). */
    if (tableSize() === 5 && S.opts.decks === 'base') S.opts.decks = 'adv';
    set(OPTS_KEY, JSON.stringify(S.opts));
    publish();
  }

  /* ---------------- starting, finishing, saving ---------------- */
  function startGame() {
    if (S.screen !== 'lobby') return;
    const lv = lobbyView();
    const players = [{ id: ME, name: S.name, hex: YOU_HEX }]
      .concat(lv.house.map((b, k) => ({ id: 'house' + (k + 1), name: b.name, hex: b.hex, bot: true })));
    S.createOpts = { players, sets: DECKS[S.opts.decks], side: S.opts.side, difficulty: S.opts.diff, ages: S.opts.ages,
      seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, show: true };
    S.g = E.create(S.createOpts);
    S.gameOpts = Object.assign({}, S.opts, { table: players.length });
    S.thinking = {}; S.hold = null; S.lastRound = 0; S.lastEvent = 0; S.roundVP = {};
    S.moves = []; S.lastHumanAt = 0; S.resumed = false;
    S.screen = 'play';
    afterChange();
  }
  function resetToLobby() {
    S.g = null; S.screen = 'lobby'; S.gameOpts = null; S.hold = null; S.moves = []; S.createOpts = null;
    del(SAVE_KEY);
    publish();
  }
  function save() {
    if (!S.g || !S.createOpts) return;
    if (S.screen === 'over') { del(SAVE_KEY); return; }
    set(SAVE_KEY, JSON.stringify({
      v: 1, createOpts: S.createOpts, gameOpts: S.gameOpts, moves: S.moves,
      hold: S.hold, lastRound: S.lastRound, lastEvent: S.lastEvent, roundVP: S.roundVP, at: Date.now()
    }));
  }
  /* Build the game again from its seed and every answer it accepted. */
  function replay(createOpts, moves) {
    const g = E.create(createOpts);
    for (const m of moves) {
      if (m.note) { g.note(m.note); continue; }
      const r = g.act(m.seat, m.a);
      if (!r.ok) throw new Error(r.why);
    }
    return g;
  }
  function resume() {
    const s = readJSON(SAVE_KEY);
    if (!s || s.v !== 1 || !s.createOpts || !Array.isArray(s.moves)) return false;
    let g;
    try { g = replay(s.createOpts, s.moves); } catch (e) { del(SAVE_KEY); return false; }
    if (g.phase === 'over') { del(SAVE_KEY); return false; }
    S.g = g; S.createOpts = s.createOpts; S.moves = s.moves;
    S.gameOpts = s.gameOpts || Object.assign({}, S.opts);
    S.hold = s.hold || null; S.lastRound = s.lastRound || 0; S.lastEvent = s.lastEvent || 0; S.roundVP = s.roundVP || {};
    S.thinking = {}; S.screen = 'play'; S.resumed = true;
    return true;
  }
  function abandon() { resetToLobby(); }

  /* ---------------- talking to the handset ---------------- */
  function publish() {
    const g = S.g;
    deliver({
      t: 'nations', screen: S.screen, remote: ME, solo: true,
      opts: S.gameOpts || S.opts,
      lobby: S.screen === 'lobby' ? lobbyView() : null,
      game: g ? g.publicView() : null,
      hurry: null,
      hold: holdView(),
      pay: null,
      thinking: thinkingView()
    });
    if (g && g.idx(ME) >= 0) deliver({ t: 'nations-me', me: g.seatView(ME), undo: undoInfo(ME) });
  }
  /* Which house nation the table is waiting on, so the phone can say so. */
  function thinkingView() {
    const g = S.g;
    if (!g || S.hold || g.phase === 'over') return null;
    const pr = g.prompts.find(p => { const s = g.seat(p.seat); return s && s.bot; });
    return pr ? { seat: pr.seat, t: pr.t } : null;
  }

  function input(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (S.screen === 'lobby') {
      if (msg.t === 'opt') setOpt(msg.key, msg.value);
      else if (msg.t === 'start') startGame();
      else if (msg.t === 'hello') publish();
      return;
    }
    if (msg.t === 'hello') { publish(); return; }
    if (msg.t === 'again') { if (S.screen === 'over') resetToLobby(); return; }
    if (msg.t === 'abandon') { abandon(); return; }
    const g = S.g;
    if (!g) return;
    if (msg.t === 'cont') { holdContinue(ME, msg.round); return; }
    if (msg.t === 'hnext') { holdNext(ME, msg.round); return; }
    if (msg.t === 'undo') { doUndo(ME); return; }
    if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
      if (S.hold) { flash(S.hold.kind === 'event' ? 'Read the new event first.' : 'Read the round card first.'); publish(); return; }
      const r = play(g, ME, msg.a);
      if (!r.ok) { flash(r.why); publish(); return; }
      afterChange();
    }
  }

  function afterChange() {
    const g = S.g;
    if (!g) return;
    roundWatch();
    if (g.phase === 'over' && S.screen !== 'over') S.screen = 'over';
    houseThinks();
    save();
    publish();
  }

  function houseThinks() {
    const g = S.g;
    if (!g || g.phase === 'over' || S.hold) return;
    for (const pr of g.prompts) {
      const p = g.seat(pr.seat);
      if (!p || !p.bot) continue;
      const key = 'p' + pr.n + ':' + pr.seat;
      if (S.thinking[key]) continue;
      S.thinking[key] = true;
      const quick = pr.t !== 'turn';
      let ms = paceMs() * (quick ? 0.5 : 1) * (T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin));
      const last = S.moves[S.moves.length - 1];
      if (last && last.human && g.phase === 'action') ms = Math.max(ms, S.lastHumanAt + T.afterYouMs - Date.now());
      setTimeout(() => {
        if (S.g !== g || g.phase === 'over') return;
        if (S.hold) { S.thinking[key] = false; return; }
        const cur = g.prompts.find(x => x.n === pr.n);
        if (!cur) return;
        const r = houseAnswer(g, pr.seat, pr.n);
        if (!r || !r.ok) { S.refusals = (S.refusals || []).concat([{ t: pr.t, what: pr.what, why: r && r.why }]); S.thinking[key] = false; }
        afterChange();
      }, ms);
    }
  }
  function houseAnswer(g, id, n) {
    const me = g.seatView(id);
    const view = me.prompts.find(x => x.n === n);
    if (!view) return;
    let r;
    try { r = play(g, id, B.answer(g.publicView(), me, view)); } catch (e) { r = { ok: false, why: 'house: ' + e.message }; }
    if (!r.ok) { const first = r.why; try { r = play(g, id, B.fallback(g.publicView(), me, view)); } catch (e) { r = { ok: false, why: 'fallback: ' + e.message }; } if (!r.ok) r.why = first + ' / ' + r.why; }
    return r;
  }

  /* ================================================================
     Taking a move back

     Every accepted answer is kept, so undo is: build the game again from the
     same seed and replay everything before the move taken back. With only
     one person at the table, what can no longer be unseen is just this:
       · the round has moved on — the last pass sets off production, the War
         and the events, which are never taken back;
       · anything came out of a deck since (a card or an event turned over).
     So you may walk back through your own moves this action phase, and the
     house's replies to them go with them (the house simply thinks again).
     ================================================================ */
  function markOf(g) {
    let deck = 0;
    for (const a in g.decks) deck += g.decks[a].length;
    for (const a in g.evDecks) deck += g.evDecks[a].length;
    return { round: g.round, phase: g.phase, deck, logN: g.log.length };
  }
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
  function undoTarget(id) {
    const g = S.g;
    if (!g || S.screen !== 'play' || S.hold || g.phase !== 'action' || !S.createOpts) return -1;
    const deck = markOf(g).deck;
    for (let k = S.moves.length - 1; k >= 0; k--) {
      const m = S.moves[k];
      if (m.note) return -1;
      if (m.mark.phase !== 'action' || m.mark.round !== g.round || m.mark.deck !== deck) return -1;
      if (m.seat === id && m.human) return k;
    }
    return -1;
  }
  function undoInfo(id) {
    const k = undoTarget(id);
    if (k < 0) return null;
    const m = S.moves[k];
    const g = S.g;
    const ls = W.lines(g.log.slice(m.mark.logN), g, m.mark.logN).filter(l => l.by === id || l.by == null);
    return { what: ls.length ? W.text(ls[0]) : 'your last move' };
  }
  function doUndo(id) {
    const k = undoTarget(id);
    if (k < 0) { flash('That can no longer be taken back — the round has moved on.'); publish(); return; }
    const keep = S.moves.slice(0, k);
    const want = S.moves[k].mark.logN;
    let ng;
    try {
      ng = replay(S.createOpts, keep);
      if (ng.log.length !== want) throw new Error('the replay came out different');
    } catch (e) {
      flash('Could not take that back (' + e.message + ').');
      return;
    }
    S.g = ng; S.moves = keep; S.thinking = {};
    afterChange();
  }

  /* ================================================================
     The round card — held until you have read it, one step at a time.
     With one reader there are no clocks: Next turns the page.
     ================================================================ */
  function roundWatch() {
    const g = S.g;
    if (!g) return;
    const ended = g.log.filter(e => e.t === 'roundEnd').map(e => e.n);
    const last = ended.length ? ended[ended.length - 1] : 0;
    if (last > S.lastRound) {
      const pub = g.publicView();
      const evs = g.log.filter(e => e.round === last);
      const card = W.roundCard(evs, pub, S.roundVP);
      S.lastRound = last;
      if (g.phase !== 'over') startHold({ kind: 'round', round: card.round, card, pages: W.roundPages(card) });
    }
    if (!S.hold && g.phase === 'action' && S.lastEvent !== g.round) {
      S.lastEvent = g.round;
      let e = null;
      for (let i = g.log.length - 1; i >= 0 && !e; i--) if (g.log[i].t === 'event') e = g.log[i];
      if (e && e.round === g.round) startHold({ kind: 'event', round: g.round, ev: { round: g.round, event: e.ev, arch: g.arch, chosenBy: e.chosenBy || null } });
    }
    if (g.phase !== 'nations' && (!S.roundVP._round || S.roundVP._round !== g.round)) {
      S.roundVP = { _round: g.round };
      for (const p of g.players) S.roundVP[p.id] = p.res.vp;
    }
  }
  function startHold(o) {
    S.hold = Object.assign({ kind: 'round', pages: null, page: 0, nexted: [], waiting: [ME], humans: [ME], done: [], grace: false }, o);
  }
  const holdLast = h => !h.pages || h.page >= h.pages.length - 1;
  function holdNext(from, round) {
    const h = S.hold;
    if (!h || holdLast(h) || (round != null && +round !== h.round)) return;
    h.page++; h.nexted = [];
    save(); publish();
  }
  function holdView() {
    const h = S.hold;
    if (!h) return null;
    return { kind: h.kind, round: h.round, card: h.card || null, ev: h.ev || null, pages: h.pages, page: h.page, nexted: h.nexted.slice(),
      waiting: h.waiting.slice(), done: h.done.slice(), grace: false };
  }
  function holdContinue(from, round) {
    const h = S.hold;
    if (!h || (round != null && +round !== h.round)) return;
    S.hold = null;
    afterChange();
  }

  /* ---------------- wiring ---------------- */
  const Solo = {
    ME, T, S,
    attach(fn) {
      S.listener = fn;
      deliver({ t: 'hello-ok' });
      publish();
      if (S.g && S.screen === 'play') houseThinks();
    },
    send(msg) { S.pending++; setTimeout(() => { S.pending--; input(JSON.parse(JSON.stringify(msg))); }, 0); },
    hasSave: () => !!readJSON(SAVE_KEY),
    clearSave: () => del(SAVE_KEY)
  };
  resume();
  root.NationsSolo = Solo;
})(typeof window !== 'undefined' ? window : globalThis);
