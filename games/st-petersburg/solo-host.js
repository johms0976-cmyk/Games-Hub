'use strict';
/* Saint Petersburg, single player — the table, run inside the phone's own page.
 *
 * The phones-only build had a small Node server doing the telly's job: the
 * engine, the computer players, and the pause after every payout. This file
 * is that server with the network taken out. The handset (index.html) sends
 * and receives exactly the messages it did over the socket, through a tiny
 * in-page bus.
 *
 * Added for one person on one phone: the game is saved after every move (the
 * seed and every accepted answer — the engine has one seeded rng and the
 * computer players none, so a replay is exact), and a move can be taken back.
 */
(function (root) {
  const D = root.SPData, E = root.SPEngine, B = root.SPBots;
  const ME = 'you';
  const SAVE_KEY = 'sp.solo.save.v1', OPTS_KEY = 'sp.solo.opts.v1', NAME_KEY = 'sp.solo.name', HEX_KEY = 'sp.solo.hex';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const readJSON = k => { const v = get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } };

  const T = { paceMs: { slow: 2600, relaxed: 1500, brisk: 800 }, thinkMin: 0.4, thinkMax: 1.1,
    /* After your own move the computers hold back a moment, so you see it land. */
    afterYouMs: 700,
    /* Each computer move stays in the move pop-up at least this long before
       the next computer takes its turn: there is no telly to watch them on,
       so they are paced by reading time, one line at a time. */
    houseShowMs: { slow: 3800, relaxed: 2700, brisk: 1500 } };
  const HOUSE = ['Katya', 'Pyotr', 'Irina'];
  /* The computers take whichever colours you have not, in this order. */
  const HOUSE_COLOR_ORDER = [2, 5, 4, 6, 7, 3, 1, 0];

  const savedOpts = readJSON(OPTS_KEY) || {};
  const S = {
    screen: 'lobby', g: null,
    opts: Object.assign({ bots: 1, pace: 'relaxed', market: false, banquet: false, banquetPurple: true, company: false, assistants: false }, savedOpts),
    /* "<name> bought a Lumberjack" — the name must take a verb in the third person. */
    name: (get(NAME_KEY) || 'Your Majesty').slice(0, 14),
    hex: D.PLAYER_COLORS.includes(get(HEX_KEY)) ? get(HEX_KEY) : D.PLAYER_COLORS[3],
    gameOpts: null, thinking: {}, stateKey: '', pay: null,
    pause: null, pauseSeq: 0, logSeen: 0, gameNo: 0,
    createOpts: null, moves: [], lastHumanAt: 0,
    /* when a computer's move (or a payout card) was last put in front of you */
    reelAt: 0,
    listener: null, resumed: false,
    pending: 0   // messages on their way, either direction (the tests wait for 0)
  };
  root.__SP_SOLO = S;
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

  /* ---------------- the lobby ---------------- */
  const botCount = () => Math.max(1, Math.min(HOUSE.length, Math.round(+S.opts.bots) || 1));
  function lobbyView() {
    const seated = [{ id: ME, name: S.name, hex: S.hex }];
    const free = HOUSE_COLOR_ORDER.map(i => D.PLAYER_COLORS[i]).filter(hex => hex !== S.hex);
    const house = HOUSE.slice(0, botCount()).map((name, k) => ({ name, hex: free[k], house: true }));
    const size = 1 + house.length;
    return {
      seated, house, size, botsMin: 1, botsMax: HOUSE.length, watching: [], colors: D.PLAYER_COLORS, name: S.name,
      shape: D.startingCards(size) + ' workers laid out to start · ' + D.boardSize(S.opts.market) + ' cards on the table after that · ' +
        D.phasesFor(S.opts.market).length + ' phases a round'
    };
  }
  function setOpt(key, value) {
    if (S.screen !== 'lobby') return;
    if (key === 'bots') { const v = Math.round(+value); if (!(v >= 1 && v <= HOUSE.length)) return; S.opts.bots = v; }
    else if (key === 'pace') { if (!T.paceMs[value]) return; S.opts.pace = value; }
    else if (key === 'market') { S.opts.market = !!value; if (!S.opts.market) S.opts.assistants = false; }
    else if (key === 'banquet') S.opts.banquet = !!value;
    else if (key === 'banquetPurple') S.opts.banquetPurple = !!value;
    else if (key === 'company') S.opts.company = !!value;
    else if (key === 'assistants') { if (value && !S.opts.market) return; S.opts.assistants = !!value; }
    else if (key === 'name') {
      const v = String(value || '').trim().slice(0, 14);
      S.name = v && !/^(you|me|i)$/i.test(v) ? v : 'Your Majesty';
      set(NAME_KEY, S.name);
    }
    else return;
    set(OPTS_KEY, JSON.stringify(S.opts));
    publish();
  }
  function setColor(hex) {
    if (S.screen !== 'lobby' || !D.PLAYER_COLORS.includes(hex)) return;
    S.hex = hex; set(HEX_KEY, hex);
    publish();
  }

  /* ---------------- starting, finishing, saving ---------------- */
  function startGame() {
    if (S.screen !== 'lobby') return;
    const lv = lobbyView();
    const players = [{ id: ME, name: S.name, hex: S.hex }]
      .concat(lv.house.map((b, k) => ({ id: 'house' + (k + 1), name: b.name, hex: b.hex, bot: true })));
    S.createOpts = { players, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, market: S.opts.market,
      banquet: S.opts.banquet, banquetPurple: S.opts.banquetPurple, company: S.opts.company, assistants: S.opts.assistants };
    S.g = E.create(S.createOpts);
    S.gameOpts = Object.assign({}, S.opts, { table: players.length });
    S.pay = null; S.thinking = {}; S.stateKey = ''; S.pause = null; S.logSeen = 0;
    S.gameNo = S.createOpts.seed; S.moves = []; S.resumed = false; S.reelAt = 0;
    S.screen = 'play';
    afterChange();
  }
  function resetToLobby() {
    S.g = null; S.screen = 'lobby'; S.pay = null; S.gameOpts = null; S.pause = null; S.moves = []; S.createOpts = null;
    del(SAVE_KEY);
    publish();
  }
  function save() {
    if (!S.g || !S.createOpts) return;
    if (S.screen === 'over') { del(SAVE_KEY); return; }
    set(SAVE_KEY, JSON.stringify({ v: 1, createOpts: S.createOpts, gameOpts: S.gameOpts, moves: S.moves,
      pause: S.pause, pauseSeq: S.pauseSeq, logSeen: S.logSeen, gameNo: S.gameNo, at: Date.now() }));
  }
  function replay(createOpts, moves) {
    const g = E.create(createOpts);
    for (const m of moves) {
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
    Object.assign(S, { g, createOpts: s.createOpts, moves: s.moves, gameOpts: s.gameOpts || Object.assign({}, S.opts),
      pause: s.pause || null, pauseSeq: s.pauseSeq || 0, logSeen: s.logSeen || g.log.length, gameNo: s.gameNo || s.createOpts.seed,
      thinking: {}, stateKey: '', screen: 'play', resumed: true });
    return true;
  }

  /* ================================================================
     The pause — after every phase that pays, and at the end of every
     round, nothing moves until you have read what happened.
     ================================================================ */
  function collectPause() {
    const g = S.g;
    if (!g) return;
    const cards = [];
    for (let i = S.logSeen; i < g.log.length; i++) {
      const e = g.log[i];
      if (e.t === 'paid') { const c = paidCard(g, e); if (c) cards.push(c); }
      else if (e.t === 'round' && !e.ending) cards.push(roundCard(g, e));
      else if (e.t === 'lastcard') cards.push({ k: 'last', deck: e.deck, round: e.round });
    }
    S.logSeen = g.log.length;
    if (!cards.length) return;
    if (S.pause) { S.pause.cards.push(...cards); S.pause.id = ++S.pauseSeq; S.pause.waiting = [ME]; }
    else S.pause = { id: ++S.pauseSeq, cards, waiting: [ME] };
  }
  function pauseReady(id) {
    if (!S.pause || S.pause.id !== id) return;
    S.pause = null;
    S.reelAt = Date.now();     // the first computer turn after the scores waits a beat too
    houseThinks();
    save();
    publish();
  }
  function paidCard(g, e) {
    const phaseLog = g.log.filter(x => x.round === e.round && x.phase === e.phase);
    const rows = e.rows.map(row => {
      const p = g.seat(row.id);
      const items = [];
      const add = it => {
        const same = it.k === 'card' && items.find(x => x.k === 'card' && x.key === it.key);
        if (same) { same.n++; same.r += it.r; same.vp += it.vp; } else items.push(it);
      };
      for (const x of phaseLog) {
        if (x.t === 'market') {
          if (x.first.includes(row.id)) items.push({ k: 'market', good: x.good, place: 1, vp: x.value[0] });
          else if (x.second.includes(row.id)) items.push({ k: 'market', good: x.good, place: 2, vp: x.value[1] });
          continue;
        }
        if (x.by !== row.id) continue;
        if (x.t === 'score') for (const b of x.bits || []) add({ k: 'card', key: b.key, n: 1, r: b.r || 0, vp: b.vp || 0 });
        else if (x.t === 'pub') items.push({ k: 'pub', r: -x.paid, vp: x.points });
        else if (x.t === 'tradinghouse') items.push({ k: 'tradinghouse', r: -3 * x.times, vp: 2 * x.times });
        else if (x.t === 'guildhall') items.push({ k: 'guildhall', r: x.r, vp: x.vp });
        else if (x.t === 'sycophant') items.push({ k: 'sycophant', r: x.paid ? -1 : 0, paid: !!x.paid });
        else if (x.t === 'rent') items.push({ k: 'rent', key: x.key, r: -x.paid });
        else if (x.t === 'rent-no') items.push({ k: 'rentno', key: x.key });
      }
      return { id: row.id, r: row.r, vp: row.vp, vpNow: p ? p.vp : 0, items };
    });
    if (rows.every(r => !r.r && !r.vp && !r.items.length)) return null;
    const card = { k: 'paid', round: e.round, phase: e.phase, rows };
    if (e.goods) { card.value = e.value; card.goods = e.goods; }
    return card;
  }
  function roundCard(g, e) {
    const v = g.publicView();
    const paid = g.log.filter(x => x.t === 'paid' && x.round === e.round);
    const rows = v.players.map(p => {
      let r = 0, vp = 0;
      for (const x of paid) { const row = x.rows.find(y => y.id === p.id); if (row) { r += row.r; vp += row.vp; } }
      return { id: p.id, r, vp, vpNow: p.vp, hand: p.hand };
    });
    const firsts = v.phases.map(ph => ({ phase: ph, id: (v.players.find(p => p.markers.includes(ph)) || {}).id }));
    return { k: 'round', round: e.round, rows, firsts, decks: v.decks, lastRound: v.lastRound, endedBy: v.endedBy };
  }
  const ord = k => k + (k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th');
  function settle() {
    const g = S.g;
    if (!g || g.phase !== 'over' || S.pay) return;
    S.pay = g.result.rows.map(r => ({ id: r.id, name: r.name, bot: r.bot, place: r.place, total: r.total,
      detail: r.total + ' points' + (r.won ? ', highest in the city' : ', ' + ord(r.place)) }));
  }

  /* ================================================================
     Taking a move back. Undo rebuilds the game from its seed and replays
     every answer before the one taken back. What can no longer be unseen:
       · the phase has moved on (its payout has been shown);
       · a card came out of a stack since (the Observatory, the deal).
     So you may walk back through your own moves in this phase, and the
     computers' replies to them go too — they simply think again.
     ================================================================ */
  function markOf(g) {
    let deck = 0;
    for (const d in g.decks) deck += g.decks[d].length;
    return { round: g.round, phase: g.phase, deck, logN: g.log.length };
  }
  function play(g, seat, a) {
    const mark = markOf(g);
    const r = g.act(seat, a);
    if (r && r.ok && g === S.g) {
      const p = g.seat(seat);
      S.moves.push({ seat, a: { t: a.t, pick: a.pick }, human: !!p && !p.bot, mark });
      if (p && !p.bot) S.lastHumanAt = Date.now();
    }
    return r;
  }
  function undoTarget() {
    const g = S.g;
    if (!g || S.screen !== 'play' || S.pause || g.phase === 'over') return -1;
    const now = markOf(g);
    if (S.logSeen < g.log.length) return -1;
    for (let k = S.moves.length - 1; k >= 0; k--) {
      const m = S.moves[k];
      if (m.mark.round !== now.round || m.mark.phase !== now.phase || m.mark.deck !== now.deck) return -1;
      if (m.human) return k;
    }
    return -1;
  }
  const UNDO_WORDS = { turn: 'your move', trade: 'where it was built', pub: 'the pub', obs: 'the observatory',
    wild: 'the Czar’s good', upkeep: 'the rent', tradinghouse: 'the Trading House', guildhall: 'the Guild Hall',
    salvage: 'the discard pick', moneycollector: 'the Money Collector', jester: 'the Jester', banquet: 'the Banquet',
    moocher: 'the Moocher', awaywithit: 'the discard' };
  function undoInfo() {
    const k = undoTarget();
    if (k < 0) return null;
    const m = S.moves[k];
    const after = S.g.log.slice(m.mark.logN).find(e => e.by === ME);
    const name = key => { const c = D.card(key); return c ? c.name : key; };
    let what = UNDO_WORDS[m.a.t] || 'your move';
    if (after) {
      if (after.t === 'build') what = 'buying the ' + name(after.key);
      else if (after.t === 'hold') what = 'taking ' + (after.key ? 'the ' + name(after.key) : 'a card') + ' in hand';
      else if (after.t === 'pass') what = 'your pass';
      else if (after.t === 'purple') what = 'playing the ' + name(after.key);
    }
    return { what };
  }
  function doUndo() {
    const k = undoTarget();
    if (k < 0) { flash('That can no longer be taken back — the phase has moved on, or a card has been drawn.'); publish(); return; }
    const keep = S.moves.slice(0, k);
    const want = S.moves[k].mark.logN;
    let ng;
    try {
      ng = replay(S.createOpts, keep);
      if (ng.log.length !== want) throw new Error('the replay came out different');
    } catch (e) { flash('Could not take that back (' + e.message + ').'); return; }
    S.g = ng; S.moves = keep; S.thinking = {}; S.stateKey = ''; S.logSeen = ng.log.length;
    afterChange();
  }

  /* ---------------- talking to the handset ---------------- */
  function publish() {
    const g = S.g;
    deliver({
      t: 'sp', screen: S.screen, gameNo: S.gameNo, solo: true,
      logTotal: g ? g.log.length : 0,
      opts: S.gameOpts || S.opts,
      lobby: S.screen === 'lobby' ? lobbyView() : null,
      game: g ? g.publicView() : null,
      hurry: null,
      pause: S.pause ? { id: S.pause.id, cards: S.pause.cards, waiting: S.pause.waiting.slice(), graceMs: 0 } : null,
      pay: S.pay ? S.pay.map(p => ({ name: p.name, detail: p.detail, bot: p.bot, total: p.total, place: p.place })) : null,
      undo: g ? undoInfo() : null
    });
    if (g && g.idx(ME) >= 0) deliver({ t: 'sp-me', me: g.seatView(ME) });
  }
  function input(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') { publish(); return; }
    if (S.screen === 'lobby') {
      if (msg.t === 'color') setColor(String(msg.hex || ''));
      else if (msg.t === 'opt') setOpt(msg.key, msg.value);
      else if (msg.t === 'start') startGame();
      return;
    }
    if (msg.t === 'again') { if (S.screen === 'over') resetToLobby(); return; }
    if (msg.t === 'abandon') { resetToLobby(); return; }
    const g = S.g;
    if (!g) return;
    if (msg.t === 'ready') { pauseReady(+msg.pause); return; }
    if (S.pause) { if (msg.t === 'do') { flash('Hang on — read the scores first.'); publish(); } return; }
    if (msg.t === 'undo') { doUndo(); return; }
    if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
      const r = play(g, ME, { t: String(msg.a.t || ''), pick: String(msg.a.pick == null ? '' : msg.a.pick).slice(0, 40) });
      if (!r.ok) { flash(r.why); publish(); return; }
      afterChange();
    }
  }
  function afterChange() {
    const g = S.g;
    if (!g) return;
    const pr = g.prompt;
    S.stateKey = g.round + ':' + g.phase + ':' + g.at + ':' + (pr ? pr.t + pr.seat + pr.n : 'none') + ':' + g.log.length;
    if (g.phase === 'over' && S.screen !== 'over') { S.screen = 'over'; settle(); }
    collectPause();
    houseThinks();
    save();
    publish();
  }
  function houseThinks() {
    const g = S.g;
    if (!g || g.phase === 'over' || !g.prompt || S.pause) return;
    const p = g.seat(g.prompt.seat);
    if (!p || !p.bot) return;
    const key = S.stateKey;
    if (S.thinking[key]) return;
    S.thinking[key] = true;
    const n = g.prompt.n;
    let ms = paceMs() * (T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin));
    const last = S.moves[S.moves.length - 1];
    if (last && last.human) ms = Math.max(ms, S.lastHumanAt + T.afterYouMs - Date.now());
    /* a turn waits until the computer move before it has been read; the
       questions inside a turn (where to build it, the pub) do not */
    if (g.prompt.t === 'turn') ms = Math.max(ms, S.reelAt + (T.houseShowMs[(S.gameOpts || S.opts).pace] || T.houseShowMs.relaxed) - Date.now());
    setTimeout(() => {
      if (S.g !== g || g.phase === 'over' || !g.prompt || g.prompt.seat !== p.id || g.prompt.n !== n) return;
      if (S.pause) { S.thinking[key] = false; return; }
      const before = g.log.length;
      play(g, p.id, B.answer(g, g.prompt));
      if (g.log.length > before) S.reelAt = Date.now();
      afterChange();
    }, ms);
  }

  const Solo = {
    ME, T, S,
    attach(fn) {
      S.listener = fn;
      deliver({ t: 'hello-ok', id: ME, name: S.name, hex: S.hex });
      publish();
      if (S.g && S.screen === 'play') houseThinks();
    },
    send(msg) { S.pending++; setTimeout(() => { S.pending--; input(JSON.parse(JSON.stringify(msg))); }, 0); }
  };
  resume();
  root.SPSolo = Solo;
})(typeof window !== 'undefined' ? window : globalThis);
