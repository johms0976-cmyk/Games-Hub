'use strict';
/* Lost Ruins of Arnak, single player — the table, run inside the phone's own page.
 *
 * On the Gameshow Hub the telly runs the game: the engine, the house
 * explorers, the round card it holds the table on, the island everybody
 * watches. This file is that telly with the big screen taken away. The
 * handset (index.html) sends and receives the same messages it did over the
 * socket, through a tiny in-page bus, and draws the island itself.
 *
 * Added for one person on one phone:
 *   · the game is saved after every move (the seed and every accepted
 *     answer — the engine has one seeded rng and the house explorers hash
 *     their wobbles, so a replay is exact) and picks up where it was left;
 *   · the house takes its turns where you can read them: each house action
 *     stays on your phone (S.reel) at least T.houseShowMs before the next;
 *   · every round opens on a card you tap past — round I too, which on the
 *     telly was only a glance — and the house waits for it.
 */
(function (root) {
  const D = root.ArnakData, E = root.ArnakEngine, B = root.ArnakBots, W = root.ArnakWords;
  const ME = 'you';
  const SAVE_KEY = 'arnak.solo.save.v1', OPTS_KEY = 'arnak.solo.opts.v1', NAME_KEY = 'arnak.solo.name';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const readJSON = k => { const v = get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };

  /* Every wait in one table, so the tests can turn them all down. */
  const T = {
    paceMs: { slow: 2600, relaxed: 1500, brisk: 750 },
    thinkMin: 0.45, thinkMax: 1.1,
    /* each house action stays on the phone at least this long before the
       house takes the next one */
    houseShowMs: { slow: 3800, relaxed: 2700, brisk: 1500 },
    /* after your own move the house holds back a moment, so you see it land */
    afterYouMs: 900
  };
  /* The house explorers, named after the people in the book's diary, in
     colours clear of the ones a phone can pick. */
  const HOUSE = [
    { name: 'Ruby', hex: '#a0522d' }, { name: 'Elsa', hex: '#8fa3b8' },
    { name: 'Tomas', hex: '#3a3631' }, { name: 'Mina', hex: '#eeeae0' }
  ];
  const COLOURS = [
    { id: 'red', hex: '#e5484d' }, { id: 'blue', hex: '#3e8ed0' }, { id: 'green', hex: '#46a758' },
    { id: 'yellow', hex: '#f0c419' }, { id: 'purple', hex: '#8e4ec6' }, { id: 'teal', hex: '#12a594' }
  ];
  /* "<name> digs at …" — the name must take a verb in the third person. */
  const DEFAULT_NAME = 'The Professor';

  const S = {
    screen: 'lobby', g: null,
    opts: Object.assign({ table: 3, side: 'bird', pace: 'relaxed', level: 'medium', sound: true, colour: 'red' }, readJSON(OPTS_KEY) || {}),
    name: (get(NAME_KEY) || DEFAULT_NAME).slice(0, 14),
    gameOpts: null, thinking: {}, pay: null,
    /* The round card: { round, card|null (round I opens on an intro) } —
       the whole table waits on it until you tap Continue. */
    hold: null, lastRound: 0, roundBase: {}, prevRow: null,
    /* The house's latest line ({ i, by }) and when it was said. */
    reel: null, reelAt: 0, linesSeen: 0,
    createOpts: null, moves: [], undoFloor: 0, lastHumanAt: 0,
    soundN: 0, resumed: false,
    listener: null,
    pending: 0   // messages on their way, either direction (the tests wait for 0)
  };
  root.__ARNAK_SOLO = S;
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
     The lobby.
     ================================================================ */
  const tableSize = () => Math.max(2, Math.min(4, +S.opts.table || 3));
  const myHex = () => (COLOURS.find(c => c.id === S.opts.colour) || COLOURS[0]).hex;
  function lobbyView() {
    const size = tableSize();
    return {
      seated: [{ id: ME, name: S.name, hex: myHex() }],
      house: HOUSE.slice(0, size - 1).map(b => ({ name: b.name, hex: b.hex, house: true, level: S.opts.level })),
      size, minSize: 2, side: S.opts.side, pace: S.opts.pace, level: S.opts.level, sound: S.opts.sound,
      colour: S.opts.colour, colours: COLOURS, name: S.name, watching: []
    };
  }
  function setOpt(key, value) {
    if (S.screen !== 'lobby') return;
    if (key === 'table') { const v = +value; if (v < 2 || v > 4) return; S.opts.table = v; }
    else if (key === 'side') { if (value !== 'bird' && value !== 'snake') return; S.opts.side = value; }
    else if (key === 'pace') { if (!T.paceMs[value]) return; S.opts.pace = value; }
    else if (key === 'level') { if (E.LEVELS.indexOf(value) < 0) return; S.opts.level = value; }
    else if (key === 'sound') { S.opts.sound = value === true || value === 'on'; if (root.HubSound) root.HubSound.setEnabled(S.opts.sound); }
    else if (key === 'colour') { if (!COLOURS.some(c => c.id === value)) return; S.opts.colour = value; }
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
    S.pay = null; S.thinking = {}; S.hold = null; S.lastRound = 0; S.roundBase = {}; S.prevRow = null;
    S.reel = null; S.reelAt = 0; S.linesSeen = 0; S.soundN = 0;
  }
  function startGame() {
    if (S.screen !== 'lobby') return;
    const lv = lobbyView();
    const players = [{ id: ME, name: S.name, hex: myHex() }]
      .concat(lv.house.map((b, k) => ({ id: 'house' + (k + 1), name: b.name, hex: b.hex, bot: true, level: S.opts.level })));
    S.createOpts = { players, side: S.opts.side, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, show: true };
    freshTable();
    S.g = E.create(S.createOpts);
    S.gameOpts = Object.assign({}, S.opts, { table: players.length });
    S.moves = []; S.undoFloor = 0; S.resumed = false;
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
    set(SAVE_KEY, JSON.stringify({ v: 1, createOpts: S.createOpts, gameOpts: S.gameOpts, moves: S.moves,
      held: S.hold ? S.hold.round : 0, roundBase: S.roundBase, prevRow: S.prevRow, at: Date.now() }));
  }
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
    freshTable();
    S.g = g; S.moves = s.moves; S.createOpts = s.createOpts;
    S.gameOpts = s.gameOpts || Object.assign({}, S.opts);
    S.lastRound = g.round; S.roundBase = s.roundBase || {}; S.prevRow = s.prevRow || null;
    S.soundN = g.log.length; S.linesSeen = g.log.length;
    S.undoFloor = S.moves.length;
    /* the round card that was up when the phone was put away is up again */
    if (s.held && s.held === g.round) startHold(g, g.publicView(), g.round - 1);
    S.screen = 'play'; S.resumed = true;
    return true;
  }
  const ord = k => k + (k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th');
  function settle() {
    const g = S.g;
    if (!g || g.phase !== 'over' || S.pay) return;
    S.pay = g.result.rows.map(r => ({ id: r.id, name: r.name, bot: r.bot, place: r.place,
      detail: r.total + ' points' + (r.won ? ', led the expedition home' : ', ' + ord(r.place)) }));
  }

  /* ================================================================
     Taking a move back (the telly's rule, arnak.html section 8).
     Every accepted answer is kept, so undo is: build the game again from
     the same seed and replay everything but the last one. A move stands
     once somebody else has moved since, anything hidden came out (a card
     drawn, a tile or guardian turned over, a stack's top shown), or the
     round is ending. Back to the start of your own turn, one move a tap.
     ================================================================ */
  function markOf(g) {
    const piles = [g.decks.art.length, g.decks.item.length, g.siteDecks[1].length, g.siteDecks[2].length,
      g.guardDeck.length, g.research.templeBonus.length, g.asst.rescue.length].concat(g.asst.stacks.map(st => st.length));
    for (const k in g.research.bonus) piles.push(g.research.bonus[k].length);
    piles.push(g.drawN, g.log.filter(e => e.t === 'peek' || e.t === 'reveal').length);
    return { round: g.round, turnN: g.turnN, hidden: piles.join(','), logN: g.log.length };
  }
  function play(g, seat, a) {
    const mark = markOf(g);
    const r = g.act(seat, a);
    if (r && r.ok && g === S.g) {
      const p = g.seat(seat);
      const m = { seat, a: JSON.parse(JSON.stringify(a)), human: !!p && !p.bot, mark };
      const prev = S.moves[S.moves.length - 1];
      S.moves.push(m);
      const same = prev && !prev.note && prev.seat === m.seat && prev.mark.round === m.mark.round && prev.mark.turnN === m.mark.turnN;
      if (!same) S.undoFloor = S.moves.length - 1;
      if (m.human) S.lastHumanAt = Date.now();
    }
    return r;
  }
  function undoInfo() {
    const g = S.g;
    if (!g || S.screen !== 'play' || S.hold || g.phase !== 'play' || !S.createOpts) return null;
    if (g.prompts.some(pr => pr.t === 'keep')) return null;
    const k = S.moves.length - 1, m = S.moves[k];
    if (!m || m.note || m.seat !== ME || !m.human || k < S.undoFloor) return null;
    const now = markOf(g);
    if (now.round !== m.mark.round || now.hidden !== m.mark.hidden) return null;
    const ls = W.lines(g.log.slice(m.mark.logN), g, m.mark.logN).filter(l => l.by === ME);
    return { what: ls.length ? W.text(ls[0]) : 'your last move' };
  }
  function doUndo() {
    const info = undoInfo();
    if (!info) { flash('That can no longer be taken back — somebody has moved since, or something new has been turned over.'); publish(); return; }
    const keep = S.moves.slice(0, -1);
    const want = S.moves[S.moves.length - 1].mark.logN;
    let ng;
    try {
      ng = replay(S.createOpts, keep);
      if (ng.log.length !== want) throw new Error('the replay came out different');
    } catch (e) { flash('Could not take that back (' + e.message + ').'); return; }
    S.g = ng; S.moves = keep; S.thinking = {};
    S.soundN = ng.log.length; S.linesSeen = Math.min(S.linesSeen, ng.log.length);
    afterChange();
  }

  /* ================================================================
     Talking to the handset.
     ================================================================ */
  function publish() {
    const g = S.g;
    deliver({
      t: 'arnak', screen: S.screen, remote: ME, solo: true,
      opts: S.gameOpts || S.opts,
      lobby: S.screen === 'lobby' ? lobbyView() : null,
      game: g ? g.publicView() : null,
      hurry: null,
      hold: S.hold ? { round: S.hold.round, card: S.hold.card, intro: !S.hold.card, waiting: [ME], done: [], grace: false } : null,
      reel: S.reel,
      finale: null,
      pay: S.pay ? S.pay.map(p => ({ name: p.name, detail: p.detail, bot: p.bot })) : null
    });
    if (g && g.idx(ME) >= 0) deliver({ t: 'arnak-me', me: g.seatView(ME), undo: undoInfo() });
  }
  /* A phone sends the bare order; nothing is trusted past here. */
  function clean(a) {
    const out = { t: String(a.t || '') };
    const str = k => { if (a[k] != null) out[k] = String(a[k]).slice(0, 60); };
    const int = k => { if (a[k] != null && isFinite(+a[k])) out[k] = +a[k] | 0; };
    ['slot', 'card', 'token', 'stack', 'id', 'use', 'pick'].forEach(str);
    ['n', 'space', 'to', 'opt'].forEach(int);
    if (a.use === true || a.use === false) out.use = a.use;
    if (a.pick === null) out.pick = null;
    if (Array.isArray(a.picks)) out.picks = a.picks.slice(0, 6).map(String);
    if (Array.isArray(a.keep)) out.keep = a.keep.slice(0, 30).map(String);
    if (a.pay && typeof a.pay === 'object') {
      const arr = k => Array.isArray(a.pay[k]) ? a.pay[k].slice(0, 8).map(String) : [];
      out.pay = { cards: arr('cards'), boons: arr('boons'), assts: arr('assts'), pilots: Math.max(0, Math.min(6, +a.pay.pilots | 0)) };
    }
    return out;
  }
  function input(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') { publish(); return; }
    if (S.screen === 'lobby') {
      if (msg.t === 'opt') setOpt(msg.key, msg.value);
      else if (msg.t === 'start') startGame();
      return;
    }
    if (msg.t === 'again') { if (S.screen === 'over') resetToLobby(); return; }
    if (msg.t === 'abandon') { resetToLobby(); return; }
    const g = S.g;
    if (!g) return;
    if (msg.t === 'cont') { holdContinue(msg.round); return; }
    if (msg.t === 'undo') { doUndo(); return; }
    if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
      if (S.hold) { flash('Read the round card first, then tap Continue.'); publish(); return; }
      const r = play(g, ME, clean(msg.a));
      if (!r.ok) { flash(r.why); publish(); return; }
      afterChange();
    }
  }

  function afterChange() {
    const g = S.g;
    if (!g) return;
    roundWatch();
    reelWatch();
    soundWatch();
    if (g.phase === 'over' && S.screen !== 'over') { S.screen = 'over'; settle(); }
    houseThinks();
    save();
    publish();
  }

  /* The house explorers, deciding from their own seat's view and nothing
     else. A turn waits until the house's last action has been read. */
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
      if (last && last.human) ms = Math.max(ms, S.lastHumanAt + T.afterYouMs - Date.now());
      if (pr.t === 'turn') ms = Math.max(ms, S.reelAt + (T.houseShowMs[paceOf()] || T.houseShowMs.relaxed) - Date.now());
      setTimeout(() => {
        if (S.g !== g || g.phase === 'over') return;
        if (S.hold) { S.thinking[key] = false; return; }
        const cur = g.promptFor(pr.seat);
        if (!cur || cur.n !== pr.n) return;
        houseAnswer(g, pr.seat, pr.n);
        afterChange();
      }, ms);
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

  /* The newest line the house has said (arnak-words.js), for the phone to
     show large while the next house action waits. */
  function reelWatch() {
    const g = S.g;
    if (!g || S.linesSeen >= g.log.length) return;
    const from = Math.max(0, S.linesSeen - 40);
    const ls = W.lines(g.log.slice(from), g, from).filter(l => l.i >= S.linesSeen && !l.table && !l.home && l.by && l.by !== ME);
    S.linesSeen = g.log.length;
    const L = ls[ls.length - 1];
    if (!L) return;
    S.reel = { i: L.i, by: L.by };
    S.reelAt = Date.now();
  }

  /* ================================================================
     The round card. A new round is the one moment Arnak changes under
     everybody at once; the engine does it inside one answer, so it is
     caught here, after the fact, and the house waits until you have
     read it. Round I opens on its own card (the phone draws it).
     ================================================================ */
  function roundWatch() {
    const g = S.g;
    if (!g) return;
    const pub = g.publicView();
    if (g.phase === 'play' && g.round > S.lastRound) {
      startHold(g, pub, S.lastRound);
      S.lastRound = g.round;
      S.roundBase = {};
      for (const p of pub.players) S.roundBase[p.id] = p.score.total;
    }
    S.prevRow = pub.row.art.concat(pub.row.item).filter(Boolean);
  }
  function startHold(g, pub, ended) {
    if (!ended) { S.hold = { round: g.round, card: null }; return; }
    const evs = g.log.filter(e => e.round === ended);
    const name = id => { const p = g.seat(id); return p ? p.name : '?'; };
    const was = new Set(S.prevRow || []);
    const staff = evs.filter(e => e.t === 'staff').pop();
    const first = pub.players[pub.start];
    S.hold = { round: g.round, card: {
      ended, round: g.round, start: first.id, startName: first.name,
      players: pub.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, total: p.score.total, delta: p.score.total - (S.roundBase[p.id] || 0) })),
      fear: evs.filter(e => e.t === 'fear' && e.why === 'guardian').map(e => ({ id: e.by, name: name(e.by), n: e.n })),
      kept: evs.filter(e => e.t === 'keep' && e.n > 0).map(e => ({ id: e.by, name: name(e.by), n: e.n })),
      highlights: W.highlights(evs, g),
      exiled: staff ? [staff.art, staff.item].filter(Boolean) : [],
      dealt: pub.row.art.concat(pub.row.item).filter(uid => uid && !was.has(uid)),
      shape: { art: g.round, item: 6 - g.round }
    } };
  }
  function holdContinue(round) {
    const h = S.hold;
    if (!h || (round != null && +round !== h.round)) return;
    S.hold = null;
    S.reel = null;             // the last round's moves are on the card just read
    S.reelAt = Date.now();     // the first house turn of the round waits a beat too
    afterChange();
  }

  /* The board's sounds, from the public log: three at most per change. */
  const CUE = { dig: 'dig', discover: 'flip', awaken: 'growl', overcome: 'gong', research: 'step', temple: 'chime',
    buy: 'coin', idol: 'sparkle', fear: 'thump', round: 'gong', staff: 'whoosh', assist: 'tick' };
  function soundWatch() {
    const g = S.g;
    if (!g) return;
    const from = S.soundN;
    S.soundN = g.log.length;
    const HS = root.HubSound;
    if (!HS || !(S.gameOpts || S.opts).sound || S.screen === 'over') return;
    const said = {};
    let k = 0;
    for (const e of g.log.slice(from)) {
      const cue = CUE[e.t];
      if (!cue || said[cue] || k >= 3) continue;
      said[cue] = 1;
      HS.play(cue, { delay: k * 0.18, gain: e.t === 'fear' ? 0.5 : (e.t === 'round' ? 0.6 : 0.8), pitch: e.t === 'overcome' ? 1.4 : 1 });
      k++;
    }
  }

  /* ---------------- wiring ---------------- */
  const Solo = {
    ME, T, S, HOUSE,
    attach(fn) {
      S.listener = fn;
      deliver({ t: 'hello-ok', id: ME, name: S.name, hex: myHex() });
      if (S.g && S.screen === 'play') afterChange(); else publish();
    },
    send(msg) { S.pending++; setTimeout(() => { S.pending--; input(JSON.parse(JSON.stringify(msg))); }, 0); }
  };
  resume();
  root.ArnakSolo = Solo;
})(typeof window !== 'undefined' ? window : globalThis);
