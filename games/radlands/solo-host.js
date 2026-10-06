'use strict';
/* Radlands, single player — the table, run inside the phone's own page.
 *
 * On the Gameshow Hub the telly runs the game: the engine, the house player,
 * the opening card it holds the table on, every event turned over on the big
 * screen before it goes off. This file is that telly with the big screen
 * taken away. The handset (index.html) sends and receives the same messages
 * it did over the socket, through a tiny in-page bus.
 *
 * Added for one person on one phone (LESSONS-CHECKLIST F1):
 *   · the game is saved after every move (the seed and every accepted
 *     answer — the engine has one seeded rng and the house hashes its
 *     wobbles, so a replay is exact) and picks up where it was left;
 *   · the house takes its moves where you can read them: each house move
 *     stays on your phone at least T.houseShowMs before the next;
 *   · an event (or the Raiders) going off is held on your phone until you
 *     tap Got it, or a while passes — and the house waits for it;
 *   · the game opens on its card, and the house waits for that too;
 *   · put the phone down (the page hidden) and the house stops;
 *   · undo is more generous alone: back through your own moves this turn,
 *     past the house's answers to them, until something new was drawn or
 *     turned over or an event went off.
 */
(function (root) {
  const D = root.RadData, E = root.RadEngine, B = root.RadBots, W = root.RadWords;
  const ME = 'you';
  const SAVE_KEY = 'radlands.solo.save.v1', OPTS_KEY = 'radlands.solo.opts.v1', NAME_KEY = 'radlands.solo.name';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const readJSON = k => { const v = get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };

  /* Every wait in one table, so the tests can turn them all down. */
  const T = {
    paceMs: { slow: 2400, relaxed: 1400, brisk: 700 },
    thinkMin: 0.45, thinkMax: 1.1,
    /* each house move stays on the phone at least this long before the next */
    houseShowMs: { slow: 3600, relaxed: 2600, brisk: 1400 },
    /* after your own move the house holds back a moment, so you see it land */
    afterYouMs: 900,
    /* an event going off stays up this long if you do not tap Got it */
    eventMs: { slow: 9000, relaxed: 6500, brisk: 4000 },
    finaleMul: 1
  };
  const HOUSE = { name: 'Rook', hex: '#9ad43a' };
  const COLOURS = [
    { id: 'pink', hex: '#ff4fb3' }, { id: 'blue', hex: '#6aa8ff' }, { id: 'orange', hex: '#ff9a3c' },
    { id: 'teal', hex: '#2ec4b6' }, { id: 'red', hex: '#e5484d' }, { id: 'violet', hex: '#a77bff' }
  ];
  /* "<name> plays …" — the name takes a verb in the third person. */
  const DEFAULT_NAME = 'The Drifter';

  const S = {
    screen: 'lobby', g: null,
    opts: Object.assign({ setup: 'draft', first: 'random', pace: 'relaxed', level: 'medium', sound: false, colour: 'pink' }, readJSON(OPTS_KEY) || {}),
    name: (get(NAME_KEY) || DEFAULT_NAME).slice(0, 14),
    gameOpts: null, thinking: {}, pay: null,
    hold: null, opened: false,
    /* an event being shown: { n, card, by } until Got it or the timer */
    ev: null,
    /* the house's newest line ({ i, by }) and when it was said */
    reel: null, reelAt: 0, linesSeen: 0,
    createOpts: null, moves: [], turnFloor: 0, lastHumanAt: 0,
    soundN: 0, resumed: false, hidden: false,
    listener: null,
    pending: 0   // messages on their way, either direction (the tests wait for 0)
  };
  root.__RAD_SOLO = S;
  const paceOf = () => (S.gameOpts || S.opts).pace;
  const paceMs = () => T.paceMs[paceOf()] || T.paceMs.relaxed;

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
     The lobby
     ================================================================ */
  const myHex = () => (COLOURS.find(c => c.id === S.opts.colour) || COLOURS[0]).hex;
  function lobbyView() {
    return {
      seated: [{ id: ME, name: S.name, hex: myHex() }],
      house: [{ name: HOUSE.name, hex: HOUSE.hex, house: true, level: S.opts.level }],
      setup: S.opts.setup, first: S.opts.first, pace: S.opts.pace, level: S.opts.level, sound: S.opts.sound,
      colour: S.opts.colour, colours: COLOURS, name: S.name, watching: [],
      saved: false
    };
  }
  function setOpt(key, value) {
    if (S.screen !== 'lobby') return;
    if (key === 'setup') { if (value !== 'draft' && value !== 'book') return; S.opts.setup = value; }
    else if (key === 'first') { if (['random', ME, 'house'].indexOf(value) < 0) return; S.opts.first = value; }
    else if (key === 'pace') { if (!T.paceMs[value]) return; S.opts.pace = value; }
    else if (key === 'level') { if (E.LEVELS.indexOf(value) < 0) return; S.opts.level = value; }
    else if (key === 'sound') { S.opts.sound = value === true || value === 'on'; if (root.HubSound) root.HubSound.setEnabled(S.opts.sound); }
    else if (key === 'colour') { if (!COLOURS.some(c => c.id === value)) return; S.opts.colour = value; }
    else if (key === 'name') {
      const v = String(value || '').trim().slice(0, 14);
      S.name = v && !/^(you|me|i|rook)$/i.test(v) ? v : DEFAULT_NAME;
      set(NAME_KEY, S.name);
    }
    else return;
    set(OPTS_KEY, JSON.stringify(S.opts));
    publish();
  }

  /* ================================================================
     Starting, finishing, saving
     ================================================================ */
  function freshTable() {
    S.pay = null; S.thinking = {}; S.hold = null; S.opened = false; S.ev = null;
    S.reel = null; S.reelAt = 0; S.linesSeen = 0; S.soundN = 0;
  }
  function startGame() {
    if (S.screen !== 'lobby') return;
    const players = [{ id: ME, name: S.name, hex: myHex() }, { id: 'house1', name: HOUSE.name, hex: HOUSE.hex, bot: true, level: S.opts.level }];
    const start = S.opts.first === ME ? 0 : S.opts.first === 'house' ? 1 : null;
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    S.createOpts = { players, seed, setup: S.opts.setup, start: start == null ? (seed & 1) : start, show: true };
    freshTable();
    S.g = E.create(S.createOpts);
    S.gameOpts = Object.assign({}, S.opts);
    S.moves = []; S.turnFloor = 0; S.resumed = false;
    if (root.HubSound) { root.HubSound.setEnabled(S.opts.sound); root.HubSound.unlock(); }
    S.screen = 'play';
    afterChange();
  }
  function resetToLobby() {
    freshTable();
    S.g = null; S.screen = 'lobby'; S.gameOpts = null; S.moves = []; S.createOpts = null;
    del(SAVE_KEY);
    publish();
  }
  function save() {
    if (!S.g || !S.createOpts) return;
    if (S.screen === 'over') { del(SAVE_KEY); return; }
    set(SAVE_KEY, JSON.stringify({ v: 1, createOpts: S.createOpts, gameOpts: S.gameOpts, moves: S.moves, opened: S.opened, held: !!S.hold, at: Date.now() }));
  }
  /* Holds are the telly's: a replay lets every one go before the next answer. */
  function replay(createOpts, moves) {
    const g = E.create(createOpts);
    for (const m of moves) {
      while (g.hold) g.release();
      if (m.note) { g.note(m.note); continue; }
      const r = g.act(m.seat, m.a);
      if (!r.ok) throw new Error(r.why);
    }
    while (g.hold) g.release();
    return g;
  }
  function resume() {
    const s = readJSON(SAVE_KEY);
    if (!s || s.v !== 1 || !s.createOpts || !Array.isArray(s.moves)) return false;
    let g;
    try { g = replay(s.createOpts, s.moves); } catch (e) { del(SAVE_KEY); return false; }
    if (g.phase === 'over') { del(SAVE_KEY); return false; }
    freshTable();
    S.g = g; S.moves = s.moves; S.createOpts = s.createOpts;
    S.gameOpts = s.gameOpts || Object.assign({}, S.opts);
    S.opened = !!s.opened;
    if (s.held) S.hold = { round: 1 };
    S.soundN = g.log.length; S.linesSeen = g.log.length;
    S.turnFloor = S.moves.length;
    S.screen = 'play'; S.resumed = true;
    return true;
  }
  function settle() {
    const g = S.g;
    if (!g || g.phase !== 'over' || S.pay) return;
    S.pay = g.result.rows.map(r => ({ id: r.id, name: r.name, bot: r.bot,
      detail: r.draw ? 'a draw — the deck ran dry' : r.won ? 'burned all three camps' : r.razed + ' of their camps burned' }));
  }

  /* ================================================================
     Taking a move back. Every accepted answer is kept, so undo is: build
     the game again from the same seed and replay everything before your
     last move. Alone, nobody else can have moved behind your back — the
     house only answers your own moves (the Raiders' camp, a Vanguard's
     hit-back), and those come back with it. A move stands once a card was
     drawn, a punk turned over, the deck reshuffled or an event went off,
     and never further back than the start of your turn.
     ================================================================ */
  function markOf(g) {
    return { turnN: g.turnN, hidden: [g.deck.length, g.reshuffles, g.rngN, g.flipN, g.log.filter(e => e.t === 'goesoff').length].join(','), logN: g.log.length };
  }
  function play(g, seat, a) {
    const mark = markOf(g);
    const r = g.act(seat, a);
    if (r && r.ok && g === S.g) {
      const p = g.seat(seat);
      const m = { seat, a: JSON.parse(JSON.stringify(a)), human: !!p && !p.bot, mark };
      const prev = S.moves[S.moves.length - 1];
      S.moves.push(m);
      if (!prev || prev.mark.turnN !== m.mark.turnN) S.turnFloor = S.moves.length - 1;
      if (m.human) S.lastHumanAt = Date.now();
    }
    return r;
  }
  function lastMine() {
    for (let k = S.moves.length - 1; k >= S.turnFloor; k--) {
      const m = S.moves[k];
      if (m.note) return -1;
      if (m.human) return k;
    }
    return -1;
  }
  function undoInfo() {
    const g = S.g;
    if (!g || S.screen !== 'play' || S.hold || g.hold || S.ev || g.phase === 'over' || !S.createOpts) return null;
    if (g.activeId() !== ME) return null;
    const k = lastMine();
    if (k < 0) return null;
    const m = S.moves[k];
    const now = markOf(g);
    if (now.turnN !== m.mark.turnN || now.hidden !== m.mark.hidden) return null;
    const ls = W.lines(g.log.slice(m.mark.logN), g.publicView(), m.mark.logN).filter(l => l.by === ME && !l.turn);
    return { what: ls.length ? ls[0].text : 'your last move' };
  }
  function doUndo() {
    const info = undoInfo();
    if (!info) { flash('That can no longer be taken back — a card has been drawn or turned over, or an event went off.'); publish(); return; }
    const k = lastMine();
    const keep = S.moves.slice(0, k);
    const want = S.moves[k].mark.logN;
    let ng;
    try {
      ng = replay(S.createOpts, keep);
      if (ng.log.length !== want) throw new Error('the replay came out different');
    } catch (e) { flash('Could not take that back (' + e.message + ').'); return; }
    S.g = ng; S.moves = keep; S.thinking = {};
    S.soundN = ng.log.length; S.linesSeen = Math.min(S.linesSeen, ng.log.length);
    flash('Taken back: ' + info.what.replace(/\.$/, '') + '.');
    afterChange();
  }

  /* ================================================================
     Talking to the handset
     ================================================================ */
  function publish() {
    const g = S.g;
    const lobby = S.screen === 'lobby' ? lobbyView() : null;
    deliver({
      t: 'rad', screen: S.screen, remote: ME, solo: true,
      opts: S.gameOpts || S.opts,
      lobby,
      game: g ? g.publicView() : null,
      hurry: null,
      hold: S.hold ? { round: 1, waiting: [ME], done: [], grace: false } : null,
      show: S.ev ? { n: S.ev.n, card: S.ev.card, by: S.ev.by } : null,
      reel: S.reel,
      finale: null,
      pay: S.pay ? S.pay.map(p => ({ name: p.name, detail: p.detail, bot: p.bot })) : null
    });
    if (g && g.idx(ME) >= 0) deliver({ t: 'rad-me', me: g.seatView(ME), undo: undoInfo() });
  }
  /* A phone sends the bare order; nothing is trusted past here. */
  function clean(a) {
    const out = { t: String(a.t || '').slice(0, 12) };
    const str = k => { if (a[k] != null) out[k] = String(a[k]).slice(0, 40); };
    const int = k => { if (a[k] != null && isFinite(+a[k])) out[k] = Math.max(0, Math.min(1e7, +a[k] | 0)); };
    ['card', 'destroy', 'uid', 'id'].forEach(str);
    ['n', 'col', 'at', 'k'].forEach(int);
    if (Array.isArray(a.ids)) out.ids = a.ids.slice(0, 12).map(x => String(x).slice(0, 40));
    return out;
  }
  function input(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') { publish(); return; }
    if (msg.t === 'vis') { S.hidden = !!msg.hidden; if (!S.hidden && S.g) { S.thinking = {}; evArm(); afterChange(); } return; }
    if (S.screen === 'lobby') {
      if (msg.t === 'opt') setOpt(msg.key, msg.value);
      else if (msg.t === 'start') startGame();
      return;
    }
    if (msg.t === 'again') { if (S.screen === 'over') resetToLobby(); return; }
    if (msg.t === 'abandon') { resetToLobby(); return; }
    const g = S.g;
    if (!g) return;
    if (msg.t === 'cont') { holdContinue(); return; }
    if (msg.t === 'evok') { if (S.ev && (msg.n == null || +msg.n === S.ev.n)) evDone(S.ev); return; }
    if (msg.t === 'undo') { doUndo(); return; }
    if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
      if (S.hold) { flash('Read the opening card first, then tap Continue.'); publish(); return; }
      if (g.hold || S.ev) { flash('Tap Got it on the event first.'); publish(); return; }
      const r = play(g, ME, clean(msg.a));
      if (!r.ok) { flash(r.why); publish(); return; }
      afterChange();
    }
  }

  function afterChange() {
    const g = S.g;
    if (!g) return;
    openWatch();
    evWatch();
    reelWatch();
    soundWatch();
    if (g.phase === 'over' && S.screen !== 'over') { S.screen = 'over'; settle(); }
    houseThinks();
    save();
    publish();
  }

  /* The house, deciding from its own seat's view and nothing else. Each of
     its moves waits until the one before has been read; nothing moves while
     the phone is put away. */
  function houseThinks() {
    const g = S.g;
    if (!g || g.phase === 'over' || S.hold || g.hold || S.ev || S.hidden) return;
    for (const pr of g.prompts) {
      const p = g.seat(pr.seat);
      if (!p || !p.bot) continue;
      const key = 'p' + pr.n + ':' + pr.seat;
      if (S.thinking[key]) continue;
      S.thinking[key] = true;
      const quick = pr.t !== 'turn';
      let ms = paceMs() * (quick ? 0.5 : 1) * (T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin));
      const last = S.moves[S.moves.length - 1];
      if (last && last.human) ms = Math.max(ms, S.lastHumanAt + T.afterYouMs - Date.now());
      if (pr.t === 'turn') ms = Math.max(ms, S.reelAt + (T.houseShowMs[paceOf()] || T.houseShowMs.relaxed) - Date.now());
      setTimeout(() => {
        if (S.g !== g || g.phase === 'over') return;
        if (S.hold || g.hold || S.ev || S.hidden) { S.thinking[key] = false; return; }
        if (!g.prompts.some(x => x.n === pr.n)) return;
        houseAnswer(g, pr.seat, pr.n);
        afterChange();
      }, Math.max(0, ms));
    }
  }
  function houseAnswer(g, id, n) {
    const me = g.seatView(id);
    const view = me.prompts.find(x => x.n === n);
    if (!view) return;
    let r = play(g, id, B.answer(g.publicView(), me, view));
    if (!r.ok) r = play(g, id, B.fallback(g.publicView(), me, view));
    return r;
  }

  /* The newest line the house has said, for the phone to set large while
     the next house move waits. Its turn banner is not a move. */
  function reelWatch() {
    const g = S.g;
    if (!g || S.linesSeen >= g.log.length) return;
    const from = Math.max(0, S.linesSeen - 40);
    const ls = W.lines(g.log.slice(from), g.publicView(), from).filter(l => l.i >= S.linesSeen && !l.turn && l.by && l.by !== ME);
    S.linesSeen = g.log.length;
    const L = ls[ls.length - 1];
    if (!L) return;
    S.reel = { i: L.i, by: L.by };
    S.reelAt = Date.now();
  }

  /* ================================================================
     The opening card: the game opens on it once the camps are chosen,
     and the house waits until you tap Continue.
     ================================================================ */
  function openWatch() {
    const g = S.g;
    if (!g || S.opened || g.phase === 'over' || g.turnN < 1) return;
    S.opened = true;
    S.hold = { round: 1 };
  }
  function holdContinue() {
    if (!S.hold) return;
    S.hold = null;
    S.reel = null;
    S.reelAt = Date.now();
    afterChange();
  }

  /* ================================================================
     An event going off: the engine holds before it applies; the phone
     turns the card over and the game waits for Got it (or the timer).
     ================================================================ */
  let evTimer = null;
  function evWatch() {
    const g = S.g;
    if (!g || !g.hold || g.hold.k !== 'event') return;
    if (S.ev && S.ev.n === g.hold.n) return;
    S.ev = { n: g.hold.n, card: g.hold.card, by: g.hold.by };
    const HS = root.HubSound;
    if (HS && (S.gameOpts || S.opts).sound) HS.play(S.ev.card === 'raiders' ? 'growl' : 'sting', { gain: 0.7 });
    evArm();
  }
  function evArm() {
    clearTimeout(evTimer);
    const ev = S.ev;
    if (!ev || S.hidden) return;
    evTimer = setTimeout(() => evDone(ev), T.eventMs[paceOf()] || T.eventMs.relaxed);
  }
  function evDone(ev) {
    const g = S.g;
    if (S.ev !== ev || !g) return;
    clearTimeout(evTimer);
    S.ev = null;
    if (g.hold && g.hold.k === 'event') g.release(g.hold.n);
    S.reelAt = Date.now();
    afterChange();
  }

  /* The board's sounds, from the public log: three at most per change. */
  const CUE = { enter: 'step', punk: 'step', event: 'flip', junk: 'coin', use: 'tick', campDown: 'gong', raid: 'whoosh', buy: 'flip', restore: 'sparkle' };
  function soundWatch() {
    const g = S.g;
    if (!g) return;
    const from = S.soundN;
    S.soundN = g.log.length;
    const HS = root.HubSound;
    if (!HS || !(S.gameOpts || S.opts).sound || S.screen === 'over' || S.hidden) return;
    const said = {};
    let k = 0;
    for (const e of g.log.slice(from)) {
      const cue = e.t === 'hit' ? (e.res === 'damaged' ? 'thump' : 'hit') : CUE[e.t];
      if (!cue || said[cue] || k >= 3) continue;
      said[cue] = 1;
      HS.play(cue, { delay: k * 0.18, gain: 0.7 });
      k++;
    }
  }

  /* ---------------- wiring ---------------- */
  const Solo = {
    ME, T, S, HOUSE, COLOURS,
    attach(fn) {
      S.listener = fn;
      deliver({ t: 'hello-ok', id: ME, name: S.name, hex: myHex() });
      if (S.g && S.screen === 'play') afterChange(); else publish();
    },
    send(msg) { S.pending++; setTimeout(() => { S.pending--; input(JSON.parse(JSON.stringify(msg))); }, 0); }
  };
  resume();
  root.RadSolo = Solo;
})(typeof window !== 'undefined' ? window : globalThis);
