'use strict';
/* Glory to Rome — the host. Everything the display does that is not paint.
 *
 * LESSONS-CHECKLIST F1: "pull the telly's orchestration into <game>-host.js,
 * a module that has no DOM". This file runs inside the telly page on the hub
 * (gtr.html) and inside the phone page when one person plays alone
 * (solo.html, which is also the GitHub Pages build). It owns:
 *
 *   the lobby options          version, Geek cards, house players and level, pace
 *   the game                   E.create and every answer through play()
 *   the house                  thinking at a fraction of the pace, never before
 *                              the room has read the house's last move
 *   the holds                  the opening card (Continue on every phone) and the
 *                              engine's shows (a lead, Rome's demand, a building
 *                              finished), released by a timer or a Skip
 *   undo                       by replay, back through your own moves this turn
 *   save and resume            the moves list (solo)
 *   the finale stages          the display plays the reveal and reports back
 *
 * It talks through `env`: toAll / toSeat / flash / humans / remote, a timer,
 * and optional hooks (onChange for the telly's repaint, bank, save, onFinale).
 */
(function (root) {
  const req = n => (typeof module !== 'undefined' && module.exports) ? require('./' + n) : null;
  const D = req('gtr-data.js') || root.GtrData;
  const E = req('gtr-engine.js') || root.GtrEngine;
  const B = req('gtr-bots.js') || root.GtrBots;
  const W = req('gtr-words.js') || root.GtrWords;
  const VERSION = 1;

  /* Every wait in one table (D: "every wait in one T table"); the tests turn
     them all down. */
  function defaultT() {
    return {
      paceMs: { slow: 2400, relaxed: 1400, brisk: 700 },
      thinkMin: 0.45, thinkMax: 1.05,
      /* A house lead may not start until the room has had this long to read
         the house's previous move (F1, "show the house's turns"). */
      houseShowMs: { slow: 3400, relaxed: 2500, brisk: 1400 },
      /* A house action waits this long after the last line was said. */
      houseActMs: { slow: 1700, relaxed: 1200, brisk: 650 },
      showMs: { lead: { slow: 2600, relaxed: 1800, brisk: 1000 }, demand: { slow: 3600, relaxed: 2800, brisk: 1700 }, done: { slow: 3400, relaxed: 2600, brisk: 1500 } },
      hurryMs: 90000, holdGraceMs: 20000, lookMs: 6000, undoMs: 5000, saveMs: 400,
      finaleScale: { slow: 1.3, relaxed: 1, brisk: 0.7 }, finaleMul: 1
    };
  }
  const HOUSE = [
    { name: 'Nero', hex: '#d6a21e' }, { name: 'Livia', hex: '#4fb39a' }, { name: 'Brutus', hex: '#9b6ad6' },
    { name: 'Agrippa', hex: '#e07a3c' }, { name: 'Octavia', hex: '#6f8fe0' }
  ];

  function create(env) {
    const T = Object.assign(defaultT(), env.solo ? { undoMs: 3500 } : {}, env.T || {});
    const solo = !!env.solo;
    const now = () => (env.now ? env.now() : Date.now());
    const later = (fn, ms) => (env.timer ? env.timer(fn, ms) : setTimeout(fn, ms));
    const S = {
      screen: 'lobby', g: null,
      opts: { version: 'rep', geek: false, house: solo ? 2 : 1, level: 'medium', pace: solo ? 'brisk' : 'relaxed', sound: !solo },
      gameOpts: null, createOpts: null, moves: [], undoFloor: 0, lastHumanAt: 0, undone: null,
      thinking: {}, stateKey: '', hurryAt: 0, hurryShown: false,
      hold: null, opened: false, show: null, heldTo: 0, reelAt: 0,
      finale: null, finaleN: 0, pay: null, banked: false, hidden: false, startedAt: 0, houseAt: []
    };
    const H = { S, T, solo, HOUSE };
    const humans = () => env.humans();
    const remote = () => (env.remote ? env.remote() : (humans()[0] ? humans()[0].id : null));
    const pace = () => (S.gameOpts || S.opts).pace;
    const paceMs = () => T.paceMs[pace()] || T.paceMs.relaxed;
    /* A wait for this pace; 0 is a real answer (the tests use it), not "unset". */
    const pick = (tab, dflt) => { const v = tab ? tab[pace()] : null; return v != null ? v : dflt; };
    const seatName = id => { const p = S.g && S.g.seat(id); if (p) return p.name; const h = humans().find(x => x.id === id); return h ? h.name : '?'; };

    /* ================================================================
       The lobby
       ================================================================ */
    H.lobbyView = function () {
      const hs = humans().slice(0, 5);
      const room = 5 - hs.length;
      const want = Math.max(hs.length >= 2 ? 0 : 1, Math.min(room, S.opts.house));
      const used = {};
      hs.forEach(h => { used[h.name] = 1; });
      const house = HOUSE.filter(b => !used[b.name]).slice(0, want).map(b => ({ name: b.name, hex: b.hex, house: true, level: S.opts.level }));
      return { seated: hs.map(s => ({ id: s.id, name: s.name, hex: s.hex })), house, version: S.opts.version, geek: S.opts.geek, level: S.opts.level,
        pace: S.opts.pace, sound: S.opts.sound, houseN: S.opts.house, maxHouse: room, minHouse: hs.length >= 2 ? 0 : 1,
        watching: humans().slice(5).map(s => ({ id: s.id, name: s.name, hex: s.hex })) };
    };
    H.canStart = () => humans().length >= 1 && !(env.evicted && env.evicted());
    H.setOpt = function (key, value) {
      if (S.screen !== 'lobby') return false;
      if (key === 'version') { if (value !== 'rep' && value !== 'imp') return false; S.opts.version = value; }
      else if (key === 'geek') S.opts.geek = value === true || value === 'on';
      else if (key === 'house') { const n = +value; if (!(n >= 0 && n <= 4)) return false; S.opts.house = n; }
      else if (key === 'level') { if (E.LEVELS.indexOf(value) < 0) return false; S.opts.level = value; }
      else if (key === 'pace') { if (!T.paceMs[value]) return false; S.opts.pace = value; }
      else if (key === 'sound') S.opts.sound = value === true || value === 'on';
      else return false;
      changed();
      return true;
    };

    /* ================================================================
       Starting and finishing
       ================================================================ */
    H.start = function (seed) {
      if (!H.canStart() || S.screen !== 'lobby') return false;
      const lv = H.lobbyView();
      const players = lv.seated.map(p => ({ id: p.id, name: p.name, hex: p.hex }))
        .concat(lv.house.map((b, k) => ({ id: 'house' + (k + 1), name: b.name, hex: b.hex, bot: true, level: S.opts.level })));
      if (players.length < 2) return false;
      S.createOpts = { players, seed: seed == null ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed, version: S.opts.version, geek: S.opts.geek, show: true };
      begin(S.createOpts, []);
      return true;
    };
    function begin(createOpts, moves) {
      S.createOpts = createOpts;
      S.g = E.create(createOpts);
      S.moves = []; S.undoFloor = 0; S.undone = null;
      S.thinking = {}; S.stateKey = '';
      S.finale = null; S.pay = null; S.banked = false;
      S.hold = null; S.opened = false; S.show = null; S.heldTo = 0; S.reelAt = 0;
      S.gameOpts = Object.assign({}, S.opts);
      S.screen = 'play';
      S.startedAt = now();
      if (moves && moves.length) replayInto(S.g, moves);
      H.afterChange();
    }
    H.resetToLobby = function () {
      bankNow();
      S.g = null; S.screen = 'lobby'; S.pay = null; S.gameOpts = null; S.createOpts = null; S.moves = [];
      S.hold = null; S.show = null; S.finale = null;
      if (env.save) env.save(null);
      changed();
    };
    /* The season (hub only): everyone banks £200 a point; the winner £5,000
       more. An instant win (a Forum, the Plebeian Council) pays £10,000. */
    function settle() {
      const g = S.g;
      if (!g || g.phase !== 'over' || S.pay) return;
      const R = g.result;
      const instant = R.how === 'forum' || R.how === 'forumromanum' || R.how === 'plebeiancouncil';
      S.pay = R.rows.map(r => ({ id: r.id, name: r.name, bot: r.bot, place: r.place,
        winnings: instant ? (r.won ? 10000 : 100 * r.total) : 200 * r.total + (r.won ? 5000 : 0),
        detail: r.total + ' points' + (r.won ? (instant ? ' — and the instant win' : ' — the winner') : '') }));
    }
    function bankNow() {
      if (!S.pay || S.banked || solo) return;
      S.banked = true;
      const real = S.pay.filter(p => !p.bot);
      if (real.length && env.bank) env.bank(real.map(p => ({ name: p.name, winnings: p.winnings, place: p.place, detail: p.detail })));
    }
    H.bank = bankNow;

    /* ================================================================
       Talking to the room
       ================================================================ */
    const revealed = () => !S.finale || S.finale.stage === 'winner' || S.finale.stage === 'table';
    H.revealed = revealed;
    H.publicMsg = function () {
      const g = S.g;
      const game = g ? g.publicView() : null;
      if (game && !revealed()) game.result = null;
      return {
        t: 'gtr', screen: S.screen, remote: remote(), solo,
        opts: S.gameOpts || S.opts,
        lobby: S.screen === 'lobby' ? H.lobbyView() : null,
        game, hold: holdView(), show: S.show ? Object.assign({}, S.show) : null,
        hurry: hurryView(), undone: S.undone ? S.undone.text : null,
        finale: S.finale ? { n: S.finale.n, stage: S.finale.stage, label: S.finale.label || '' } : null,
        pay: S.pay && revealed() ? S.pay.map(p => ({ name: p.name, winnings: p.winnings, detail: p.detail, bot: p.bot })) : null,
        paused: solo && S.hidden
      };
    };
    H.publish = function () {
      env.toAll(H.publicMsg());
      const g = S.g;
      if (g) for (const p of g.players) if (!p.bot) H.sendSeat(p.id);
    };
    H.sendSeat = function (id) {
      const g = S.g;
      if (!g || g.idx(id) < 0) return;
      env.toSeat(id, { t: 'gtr-me', me: g.seatView(id), undo: undoInfo(id) });
    };
    function changed() { if (env.onChange) env.onChange(); H.publish(); }

    /* ================================================================
       Orders from a phone
       ================================================================ */
    H.input = function (from, msg) {
      if (!msg || typeof msg !== 'object') return;
      const holder = remote();
      if (msg.t === 'menu') { if (from === holder && env.menu) env.menu(); return; }
      if (msg.t === 'vis') {
        S.hidden = !!msg.hidden;
        if (S.hidden) { flushSave(); changed(); } else { S.thinking = {}; H.afterChange(); }
        return;
      }
      if (S.screen === 'lobby') {
        if (from !== holder) return;
        if (msg.t === 'opt') H.setOpt(msg.key, msg.value);
        else if (msg.t === 'start') H.start();
        return;
      }
      if (msg.t === 'again') { if (S.screen === 'over' && from === holder) H.resetToLobby(); return; }
      if (msg.t === 'skip') {
        if (from !== holder) return;
        if (S.finale && env.skipFinale) env.skipFinale();
        else if (S.show) showDone(S.show.n);
        return;
      }
      if (msg.t === 'quit') { if (from === holder) H.resetToLobby(); return; }
      const g = S.g;
      if (!g) return;
      if (msg.t === 'hurry') { if (from === holder) hurry(); return; }
      if (msg.t === 'cont') { holdContinue(from); return; }
      if (msg.t === 'nowait') { holdNoWait(from); return; }
      if (msg.t === 'undo') { doUndo(from); return; }
      if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
        if (S.hold) { env.flash(from, 'Everyone is reading the opening card first. Tap Continue.', 'bad'); H.sendSeat(from); return; }
        if (g.hold) { env.flash(from, solo ? 'One moment — it is being shown.' : 'Watch the telly first.', 'bad'); H.sendSeat(from); return; }
        const r = play(g, from, clean(msg.a));
        if (!r.ok) { env.flash(from, r.why, 'bad'); H.sendSeat(from); return; }
        H.afterChange();
      }
    };
    /* A phone sends the bare order; nothing off the wire is trusted past here. */
    function clean(a) {
      const out = { t: String(a.t || '').slice(0, 10) };
      const str = k => { if (a[k] != null) out[k] = String(a[k]).slice(0, 80); };
      ['role', 'how', 'id', 'drop'].forEach(str);
      if (a.n != null && isFinite(+a.n)) out.n = Math.max(0, Math.min(1e9, +a.n | 0));
      if (a.dropAll) out.dropAll = true;
      if (Array.isArray(a.cards)) out.cards = a.cards.slice(0, 20).map(x => String(x).slice(0, 40));
      if (Array.isArray(a.ids)) out.ids = a.ids.slice(0, 20).map(x => String(x).slice(0, 40));
      return out;
    }

    /* Everything that follows a change of state, in one place. */
    H.afterChange = function () {
      const g = S.g;
      if (!g) { changed(); return; }
      const key = g.prompts.map(p => p.n + p.seat).join(',') + ':' + g.log.length;
      if (key !== S.stateKey) { S.stateKey = key; S.hurryAt = now() + T.hurryMs; S.hurryShown = false; }
      openWatch();
      showWatch();
      if (g.phase === 'over' && S.screen !== 'over') {
        S.screen = 'over';
        settle();
        startFinale();
      }
      houseThinks();
      if (env.save && S.createOpts && S.screen !== 'lobby') queueSave();
      changed();
    };
    /* The save is the whole move list, so it is written at most every
       T.saveMs (and at once when the phone is put away), not on every
       change — a long game would otherwise stringify thousands of moves a
       second. */
    let saveTimer = null;
    function queueSave() { if (!saveTimer) saveTimer = later(flushSave, T.saveMs); }
    function flushSave() {
      saveTimer = null;
      if (!env.save || !S.createOpts || S.screen === 'lobby') return;
      env.save(S.screen === 'over' && S.finale && S.finale.stage === 'table' ? null : H.saveData());
    }
    H.flushSave = flushSave;

    function hurryView() {
      const g = S.g;
      if (solo || !g || S.screen !== 'play' || g.phase === 'over' || S.hold || g.hold) return null;
      const waiting = g.prompts.map(pr => g.seat(pr.seat)).filter(p => p && !p.bot).map(p => p.id);
      if (!waiting.length || now() < S.hurryAt) return null;
      return { ids: waiting, names: waiting.map(id => g.seat(id).name) };
    }
    function hurry() {
      const h = hurryView();
      if (!h) return;
      const g = S.g;
      note({ t: 'hurried', who: h.ids.slice() });
      for (let k = 0; k < 40; k++) {
        const pr = g.prompts[0];
        if (!pr || g.hold || g.phase === 'over' || h.ids.indexOf(pr.seat) < 0) break;
        houseAnswer(g, pr.seat, pr.n, true);
      }
      H.afterChange();
    }
    H.tick = function () {
      const g = S.g;
      if (!g || S.screen !== 'play') return;
      if (S.hold && !S.hold.grace && !solo && now() - S.hold.at >= T.holdGraceMs) { S.hold.grace = true; changed(); }
      const show = !!hurryView();
      if (show !== S.hurryShown) { S.hurryShown = show; changed(); }
    };

    /* ================================================================
       The house: from its own seat's view only. Its thinking is a fraction
       of the pace, and each move waits until the last one could be read.
       ================================================================ */
    function houseThinks() {
      const g = S.g;
      if (!g || g.phase === 'over' || S.hold || g.hold || S.hidden) return;
      const pr = g.prompts[0];
      if (!pr) return;
      const p = g.seat(pr.seat);
      if (!p || !p.bot) return;
      const key = 'p' + pr.n + ':' + pr.seat;
      if (S.thinking[key]) return;
      S.thinking[key] = true;
      const turnish = pr.t === 'lead';
      let ms = paceMs() * (pr.t === 'pick' ? 0.4 : 0.7) * (T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin));
      const gap = turnish ? pick(T.houseShowMs, 2500) : pr.t === 'act' || pr.t === 'follow' ? pick(T.houseActMs, 1200) : 0;
      ms = Math.max(ms, S.reelAt + gap - now());
      /* After a phone's move that can still be taken back, the house holds
         off a few seconds so the window is really open (D). */
      const last = S.moves[S.moves.length - 1];
      if (last && last.human && undoInfo(last.seat)) ms = Math.max(ms, S.lastHumanAt + T.undoMs - now());
      later(() => {
        if (S.g !== g || g.phase === 'over') return;
        if (S.hold || g.hold || S.hidden) { S.thinking[key] = false; return; }
        if (!g.prompts.find(x => x.n === pr.n)) return;
        houseAnswer(g, pr.seat, pr.n);
        /* When each house answer landed — the pacing test reads it. */
        S.houseAt.push({ at: now(), t: pr.t, since: now() - S.reelAt });
        if (S.houseAt.length > 300) S.houseAt.shift();
        S.reelAt = now();
        H.afterChange();
      }, Math.max(0, ms));
    }
    function houseAnswer(g, id, n, forPhone) {
      const me = g.seatView(id);
      if (!me.prompt || me.prompt.n !== n) return null;
      const pub = g.publicView();
      let r = play(g, id, B.answer(pub, me, me.prompt), forPhone);
      if (!r.ok) r = play(g, id, B.fallback(pub, me, me.prompt), forPhone);
      return r;
    }
    H.houseAnswer = houseAnswer;

    /* ================================================================
       Taking a move back (D) — by replay. Barriers: anybody else has
       answered since, or a card came off the deck.
       ================================================================ */
    function markOf(g) { return { turnN: g.turnN, hidden: g.drawN + ',' + g.rngN, logN: g.log.length, holdN: g.holdN }; }
    H.markOf = markOf;
    function play(g, seat, a, forPhone) {
      const mark = markOf(g);
      const r = g.act(seat, a);
      if (r && r.ok && g === S.g) {
        const p = g.seat(seat);
        record({ seat, a: JSON.parse(JSON.stringify(a)), human: !!p && !p.bot && !forPhone, mark });
      }
      return r;
    }
    H.play = play;
    function note(e) { S.g.note(e); S.moves.push({ note: e }); S.undoFloor = S.moves.length; }
    function record(m) {
      const prev = S.moves[S.moves.length - 1];
      S.moves.push(m);
      const same = prev && !prev.note && prev.seat === m.seat && prev.mark.turnN === m.mark.turnN;
      if (!same) S.undoFloor = S.moves.length - 1;
      if (m.human) S.lastHumanAt = now();
    }
    function undoInfo(id) {
      const g = S.g;
      if (!g || S.screen !== 'play' || S.hold || g.phase === 'over' || !S.createOpts) return null;
      const k = S.moves.length - 1, m = S.moves[k];
      if (!m || m.note || m.seat !== id || !m.human || k < S.undoFloor) return null;
      /* The last answer is this seat's, so nobody else has moved since —
         whoever is being asked now has not answered yet. */
      const nowM = markOf(g);
      if (nowM.turnN !== m.mark.turnN || nowM.hidden !== m.mark.hidden) return null;
      const ls = W.lines(g.log.slice(m.mark.logN), g.publicView(), m.mark.logN).filter(l => l.by === id && l.t !== 'acts' && l.t !== 'idle');
      return { what: ls.length ? ls[0].text : 'your last move' };
    }
    H.undoInfo = undoInfo;
    function replayInto(ng, moves) {
      for (const m of moves) {
        if (m.note) { ng.note(m.note); S.moves.push(m); continue; }
        while (ng.hold) ng.release();
        const r = ng.act(m.seat, m.a);
        if (!r.ok) throw new Error(r.why);
        S.moves.push(m);
      }
      while (ng.hold && ng.hold.n <= S.heldTo) ng.release();
      S.undoFloor = S.moves.length;
    }
    function doUndo(from) {
      const info = undoInfo(from);
      if (!info) { env.flash(from, 'That can no longer be taken back — a card has been drawn, or someone else has answered since.', 'bad'); H.sendSeat(from); return; }
      const keep = S.moves.slice(0, -1);
      const want = S.moves[S.moves.length - 1].mark.logN;
      let ng;
      const saveMoves = S.moves;
      try {
        ng = E.create(S.createOpts);
        S.moves = [];
        for (const m of keep) {
          if (m.note) { ng.note(m.note); S.moves.push(m); continue; }
          while (ng.hold) ng.release();
          const r = ng.act(m.seat, m.a);
          if (!r.ok) throw new Error(r.why);
          S.moves.push(m);
        }
        while (ng.hold) ng.release();
        if (ng.log.length !== want) throw new Error('the replay came out different');
      } catch (e) {
        S.moves = saveMoves;
        env.flash(from, 'Could not take that back (' + e.message + ').', 'bad');
        return;
      }
      /* Re-derive the floor: everything before this seat's run is fixed. */
      let floor = S.moves.length;
      while (floor > 0) { const m = S.moves[floor - 1]; if (m.note || m.seat !== from || m.mark.turnN !== ng.turnN) break; floor--; }
      S.undoFloor = floor;
      S.g = ng;
      S.thinking = {}; S.stateKey = ''; S.show = null;
      const undone = { text: seatName(from) + ' takes back a move: ' + info.what.replace(/\.$/, '') + '.' };
      S.undone = undone;
      later(() => { if (S.undone === undone) { S.undone = null; changed(); } }, T.undoMs);
      for (const p of ng.players) if (!p.bot && p.id !== from) env.flash(p.id, seatName(from) + ' took back a move.', 'bad');
      H.afterChange();
    }
    H.doUndo = doUndo;

    /* ================================================================
       Save and resume (solo): the game is its options and its answers.
       ================================================================ */
    H.saveData = function () {
      return { v: VERSION, createOpts: S.createOpts, moves: S.moves, opened: S.opened, opts: S.gameOpts || S.opts, at: Date.now(),
        turnN: S.g ? S.g.turnN : 0, deckN: S.g ? S.g.deck.length : 0, names: S.g ? S.g.players.map(p => p.name) : [] };
    };
    H.resume = function (data) {
      if (!data || !data.createOpts) return false;
      try {
        S.opts = Object.assign({}, S.opts, data.opts || {});
        S.heldTo = 1e9;
        begin(data.createOpts, data.moves || []);
        S.heldTo = S.g.holdN;
        S.opened = data.opened !== false;
        if (S.opened && S.hold) S.hold = null;
        S.reelAt = 0;
        H.afterChange();
        return true;
      } catch (e) { return false; }
    };

    /* ================================================================
       The engine's shows: decide, hold, show, then apply.
       ================================================================ */
    function showWatch() {
      const g = S.g;
      if (!g || !g.hold) return;
      if (S.show && S.show.n === g.hold.n) return;
      const h = g.hold;
      S.show = Object.assign({}, h);
      S.heldTo = Math.max(S.heldTo, h.n);
      const ms = T.showMs[h.k] ? pick(T.showMs[h.k], 2000) : 2000;
      const n = h.n;
      later(() => showDone(n), ms);
    }
    function showDone(n) {
      const g = S.g;
      if (!g || !S.show || S.show.n !== n) return;
      S.show = null;
      if (g.hold && g.hold.n === n) g.release(n);
      S.reelAt = now();
      /* A phone's move that was being shown: the undo window starts now. */
      const last = S.moves[S.moves.length - 1];
      if (last && last.human) S.lastHumanAt = now();
      H.afterChange();
    }
    H.showDone = showDone;

    /* ================================================================
       The opening card: the game opens on it, and the whole table waits on
       it until every phone has tapped Continue (D).
       ================================================================ */
    function openWatch() {
      const g = S.g;
      if (!g || S.opened || g.phase === 'over' || g.turnN < 1) return;
      S.opened = true;
      const waiting = g.players.filter(p => !p.bot).map(p => p.id);
      S.hold = { id: 'open', waiting, done: [], at: now(), grace: false };
      if (!waiting.length) { const h = S.hold; later(() => { if (S.hold === h) releaseHold(); }, T.lookMs); }
    }
    function holdView() {
      const h = S.hold;
      return h ? { id: h.id, waiting: h.waiting.slice(), done: h.done.slice(), grace: h.grace } : null;
    }
    function holdContinue(from) {
      const h = S.hold;
      if (!h) return;
      const i = h.waiting.indexOf(from);
      if (i < 0) return;
      h.waiting.splice(i, 1);
      h.done.push(from);
      if (!h.waiting.length) releaseHold(); else changed();
    }
    function holdNoWait(from) {
      const h = S.hold;
      if (!h || !h.grace || h.done.indexOf(from) < 0 || !h.waiting.length) return;
      note({ t: 'nowait', who: h.waiting.slice() });
      releaseHold();
    }
    function releaseHold() {
      S.hold = null;
      S.stateKey = '';
      S.reelAt = now();
      H.afterChange();
    }

    /* ================================================================
       The finale: data for shared/finale.js. The display plays it and
       reports each stage back with H.finaleStage.
       ================================================================ */
    const INSTANT = { forum: 'the Forum', forumromanum: 'the Forum Romanum', plebeiancouncil: 'the Plebeian Council' };
    H.finaleData = function () {
      const g = S.g, R = g.result;
      const inst = INSTANT[R.how];
      return {
        title: inst ? 'A city of every trade' : R.how === 'catacomb' ? 'The Catacomb is sealed' : 'Rome is rebuilt',
        sub: W.ENDS[R.how] || '',
        tone: inst ? 'lightning' : 'fireworks',
        categories: [{ key: 'inf', label: 'Influence' }, { key: 'vault', label: 'The Vault, opened' }, { key: 'extra', label: 'Statue and Wall' }, { key: 'bonus', label: 'Merchant Bonuses' }],
        decider: 'bonus', deciderLine: 'And the Merchant Bonuses — most of each material in a Vault',
        players: R.rows.map(r => ({ id: r.id, name: r.name, hex: r.hex, parts: { inf: r.inf, vault: r.vault, extra: r.extra, bonus: r.bonus * 3 },
          total: r.total, place: r.place, won: r.won, tag: r.bot ? 'house · ' + r.level : '' })),
        tiebreak: R.tiebreak ? 'Level on points: the most cards in hand wins.' : null,
        places: !inst, winSmall: inst ? 'wins at once with ' + inst : null,
        scale: T.finaleMul * (T.finaleScale[pace()] || 1)
      };
    };
    function startFinale() {
      const fin = { n: ++S.finaleN, stage: 'title', label: '' };
      S.finale = fin;
      if (env.onFinale) env.onFinale(fin, H.finaleData());
      else H.finaleStage(fin.n, 'table');
    }
    H.finaleStage = function (n, stage, label) {
      const fin = S.finale;
      if (!fin || fin.n !== n) return;
      fin.stage = stage; fin.label = label || '';
      if (stage === 'winner' || stage === 'table') bankNow();
      if (stage === 'table' && env.save) { flushSave(); env.save(null); }
      changed();
    };

    H.note = note;
    H.T = T;
    return H;
  }

  const Host = { VERSION, create, defaultT, HOUSE };
  if (typeof module !== 'undefined' && module.exports) module.exports = Host;
  else root.GtrHost = Host;
})(typeof window !== 'undefined' ? window : this);
