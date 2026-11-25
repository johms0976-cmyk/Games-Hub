'use strict';
/* A Gest of Robin Hood — the host. Everything the display does that is not paint.
 *
 * LESSONS-CHECKLIST F1 ("a mode, not a fork"; done first for Glory to Rome):
 * this file runs inside the telly page on the hub (robinhood.html) and inside the
 * phone page when one person plays alone (solo.html). It owns:
 *
 *   the lobby options          which side the first phone plays, the house's level, pace, sound
 *   the game                   E.create and every answer through play()
 *   the house                  thinking at a fraction of the pace, never before
 *                              the room has read the house's last move
 *   the holds                  each Ballad's opening card (Continue on every
 *                              phone), the engine's shows (the card drawn, a
 *                              Rob's die, a Carriage home, an Inspection page),
 *                              released by a timer or a Skip
 *   undo                       by replay, back through your own moves this turn
 *   save and resume            the moves list (solo)
 *   the finale stages          the display plays the reveal and reports back
 *
 * It talks through `env`: toAll / toSeat / flash / humans / remote, a timer,
 * and optional hooks (onChange for the telly's repaint, bank, save, onFinale).
 */
(function (root) {
  const req = n => (typeof module !== 'undefined' && module.exports) ? require('./' + n) : null;
  const D = req('rh-data.js') || root.RhData;
  const E = req('rh-engine.js') || root.RhEngine;
  const B = req('rh-bots.js') || root.RhBots;
  const W = req('rh-words.js') || root.RhWords;
  const VERSION = 1;

  /* Every wait in one table (D: "every wait in one T table"); the tests turn
     them all down. */
  function defaultT() {
    return {
      paceMs: { slow: 2400, relaxed: 1400, brisk: 700 },
      thinkMin: 0.45, thinkMax: 1.05,
      /* A house turn may not start until the room has had this long to read
         the house's previous move (F1, "show the house's turns"). */
      houseShowMs: { slow: 3400, relaxed: 2600, brisk: 1500 },
      /* A house sub-answer (a step of a move, a recruit) waits this long. */
      houseActMs: { slow: 1600, relaxed: 1100, brisk: 600 },
      showMs: {
        card: { slow: 4600, relaxed: 3600, brisk: 2200 },
        rob: { slow: 3000, relaxed: 2400, brisk: 1500 },
        robLand: { slow: 4200, relaxed: 3300, brisk: 2100 },
        arrive: { slow: 3400, relaxed: 2600, brisk: 1600 },
        ri: { slow: 6500, relaxed: 5200, brisk: 3400 }
      },
      hurryMs: 90000, holdGraceMs: 20000, lookMs: 6000, undoMs: 5000, saveMs: 400,
      finaleScale: { slow: 1.3, relaxed: 1, brisk: 0.7 }, finaleMul: 1
    };
  }
  /* The house's names, one a side. */
  const HOUSE = { robin: { name: 'Will o’ the Green' }, sheriff: { name: 'Sir Roger de Lacy' } };
  const TABLE_HOLDS = { ballad: 1 };
  /* A house answer that is one space of a Plot (or a Carriage rolling)
     waits acting time, so the room sees each step land. */
  const HOUSE_ACT = { plotSpace: 1, carriage: 1, sneakTo: 1, deed: 1, plot: 1, robTarget: 1, donate: 1, confiscate: 1 };

  function create(env) {
    const T = Object.assign(defaultT(), env.solo ? { undoMs: 3500 } : {}, env.T || {});
    const solo = !!env.solo;
    const now = () => (env.now ? env.now() : Date.now());
    const later = (fn, ms) => (env.timer ? env.timer(fn, ms) : setTimeout(fn, ms));
    const S = {
      screen: 'lobby', g: null,
      opts: { side: 'robin', level: 'medium', pace: solo ? 'brisk' : 'relaxed', sound: !solo },
      gameOpts: null, createOpts: null, moves: [], undoFloor: 0, lastHumanAt: 0, undone: null,
      thinking: {}, stateKey: '', hurryAt: 0, hurryShown: false, promptAt: {},
      table: null, show: null, heldTo: 0, reelAt: 0, released: [],
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
       The lobby. A god is a colour: seats take Anubis, Bastet, Horus,
       Ouadjet, Sobek in order.
       ================================================================ */
    H.lobbyView = function () {
      const hs = humans().slice(0, 2);
      const first = S.opts.side === 'sheriff' ? 'sheriff' : 'robin';
      const sides = [first, E.other(first)];
      const seated = hs.map((h, k) => ({ id: h.id, name: h.name, side: sides[k], hex: D.SIDES[sides[k]].hex }));
      const house = hs.length >= 2 ? [] : [{ name: HOUSE[sides[1]].name, house: true, level: S.opts.level, side: sides[1], hex: D.SIDES[sides[1]].hex }];
      return { seated, house, level: S.opts.level, side: first, pace: S.opts.pace, sound: S.opts.sound,
        watching: humans().slice(2).map(x => ({ id: x.id, name: x.name, hex: x.hex })) };
    };
    H.canStart = () => humans().length >= 1 && !(env.evicted && env.evicted());
    H.setOpt = function (key, value) {
      if (S.screen !== 'lobby') return false;
      if (key === 'side') { if (value !== 'robin' && value !== 'sheriff') return false; S.opts.side = value; }
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
      const players = lv.seated.map(p => ({ id: p.id, name: p.name, hex: p.hex, side: p.side }))
        .concat(lv.house.map((b, k) => ({ id: 'house' + (k + 1), name: b.name, hex: b.hex, side: b.side, bot: true, level: S.opts.level })));
      if (players.length !== 2) return false;
      S.createOpts = { players, seed: seed == null ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed, show: true };
      begin(S.createOpts, []);
      return true;
    };
    function begin(createOpts, moves) {
      S.createOpts = createOpts;
      S.g = E.create(createOpts);
      S.moves = []; S.undoFloor = 0; S.undone = null;
      S.thinking = {}; S.stateKey = ''; S.promptAt = {};
      S.finale = null; S.pay = null; S.banked = false;
      S.table = null; S.show = null; S.heldTo = 0; S.reelAt = 0;
      S.gameOpts = Object.assign({}, S.opts);
      S.screen = 'play';
      S.startedAt = now();
      if (moves && moves.length) replayInto(S.g, moves);
      H.afterChange();
    }
    H.resetToLobby = function () {
      bankNow();
      S.g = null; S.screen = 'lobby'; S.pay = null; S.gameOpts = null; S.createOpts = null; S.moves = [];
      S.table = null; S.show = null; S.finale = null;
      if (env.save) env.save(null);
      changed();
    };
    /* The season (hub only): the winner £10,000 and £1,000 a step of the
       Royal Favour on their side; the other side £2,000 for the fight. */
    function settle() {
      const g = S.g;
      if (!g || g.phase !== 'over' || S.pay) return;
      const R = g.result;
      S.pay = R.rows.map(r => ({ id: r.id, name: r.name, bot: r.bot, place: r.place,
        winnings: r.won ? 10000 + 1000 * r.favour : 2000,
        detail: (r.side === 'robin' ? 'Robin Hood' : 'the Sheriff') + (r.won ? ' — won with the Royal Favour at ' + r.favour : ' — beaten') }));
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
        t: 'rh', screen: S.screen, remote: remote(), solo,
        opts: S.gameOpts || S.opts,
        lobby: S.screen === 'lobby' ? H.lobbyView() : null,
        game, table: tableView(), show: S.show ? Object.assign({}, S.show) : null,
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
      env.toSeat(id, { t: 'rh-me', me: g.seatView(id), undo: undoInfo(id) });
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
      if (msg.t === 'cont') { tableContinue(from, msg.id); return; }
      if (msg.t === 'nowait') { tableNoWait(from); return; }
      if (msg.t === 'undo') { doUndo(from); return; }
      if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
        if (S.table) { env.flash(from, 'Everyone is reading the Ballad’s card first. Tap Continue.', 'bad'); H.sendSeat(from); return; }
        if (g.hold) { env.flash(from, solo ? 'One moment — it is being shown.' : 'Watch the telly first.', 'bad'); H.sendSeat(from); return; }
        const r = play(g, from, clean(msg.a));
        if (!r.ok) { env.flash(from, r.why, 'bad'); H.sendSeat(from); return; }
        H.afterChange();
      }
    };
    /* A phone sends the bare order; nothing off the wire is trusted past here. */
    function clean(a) {
      const out = { t: String(a.t || '').slice(0, 10) };
      if (a.id != null) out.id = String(a.id).slice(0, 80);
      if (a.n != null && isFinite(+a.n)) out.n = Math.max(0, Math.min(1e9, +a.n | 0));
      if (Array.isArray(a.ids)) out.ids = a.ids.slice(0, 20).map(x => String(x).slice(0, 40));
      return out;
    }

    /* Everything that follows a change of state, in one place. */
    H.afterChange = function () {
      const g = S.g;
      if (!g) { changed(); return; }
      const key = g.prompts.map(p => p.n + p.seat).join(',') + ':' + g.log.length;
      if (key !== S.stateKey) {
        S.stateKey = key; S.hurryAt = now() + T.hurryMs; S.hurryShown = false;
        for (const pr of g.prompts) if (!S.promptAt[pr.n]) S.promptAt[pr.n] = now();
      }
      holdWatch();
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
       T.saveMs (and at once when the phone is put away). */
    let saveTimer = null;
    function queueSave() { if (!saveTimer) saveTimer = later(flushSave, T.saveMs); }
    function flushSave() {
      saveTimer = null;
      if (!env.save || !S.createOpts || S.screen === 'lobby') return;
      env.save(S.screen === 'over' && S.finale && S.finale.stage === 'table' ? null : H.saveData());
    }
    H.flushSave = flushSave;

    /* The remote may play a quiet phone's move after a while. */
    function hurryView() {
      const g = S.g;
      if (solo || !g || S.screen !== 'play' || g.phase === 'over' || S.table || g.hold) return null;
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
        const pr = g.prompts.find(x => h.ids.indexOf(x.seat) >= 0);
        if (!pr || g.hold || g.phase === 'over') break;
        houseAnswer(g, pr.seat, pr.n, true);
      }
      H.afterChange();
    }
    H.tick = function () {
      const g = S.g;
      if (!g || S.screen !== 'play') return;
      if (S.table && !S.table.grace && !solo && now() - S.table.at >= T.holdGraceMs) { S.table.grace = true; changed(); }
      const show = !!hurryView();
      if (show !== S.hurryShown) { S.hurryShown = show; changed(); }
    };

    /* ================================================================
       The house: from its own seat's view only. Its thinking is a fraction
       of the pace, and each turn waits until the last move could be read.
       ================================================================ */
    function houseThinks() {
      const g = S.g;
      if (!g || g.phase === 'over' || S.table || g.hold || S.hidden) return;
      for (const pr of g.prompts) {
        const p = g.seat(pr.seat);
        if (!p || !p.bot) continue;
        const key = 'p' + pr.n + ':' + pr.seat;
        if (S.thinking[key]) continue;
        S.thinking[key] = true;
        const turnish = pr.t === 'turn';
        let ms = paceMs() * (pr.t === 'pick' ? 0.4 : 0.7) * (T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin));
        /* Pace the turn by reading time and each space of a Plot by acting
           time; the small sub-answers go at thinking pace (F1). */
        const gap = turnish ? pick(T.houseShowMs, 2600) : HOUSE_ACT[pr.what] ? pick(T.houseActMs, 1100) : 0;
        ms = Math.max(ms, S.reelAt + gap - now());
        /* After a phone's move that can still be taken back, the house holds
           off a few seconds so the window is really open (D). */
        const last = S.moves[S.moves.length - 1];
        if (last && last.human && undoInfo(last.seat)) ms = Math.max(ms, S.lastHumanAt + T.undoMs - now());
        later(() => {
          if (S.g !== g || g.phase === 'over') return;
          if (S.table || g.hold || S.hidden) { S.thinking[key] = false; return; }
          if (!g.prompts.find(x => x.n === pr.n)) return;
          houseAnswer(g, pr.seat, pr.n);
          S.houseAt.push({ at: now(), t: pr.t, what: pr.what || null, turnish, since: now() - S.reelAt });
          if (S.houseAt.length > 400) S.houseAt.shift();
          S.reelAt = now();
          H.afterChange();
        }, Math.max(0, ms));
      }
    }
    function houseAnswer(g, id, n, forPhone) {
      const me = g.seatView(id);
      if (!me.prompt || me.prompt.n !== n) return null;
      const pub = g.publicView();
      let r = play(g, id, B.answer(pub, me, me.prompt), forPhone);
      if (!r.ok) { S.fallbacks = (S.fallbacks || 0) + 1; r = play(g, id, B.fallback(pub, me, me.prompt), forPhone); }
      return r;
    }
    H.houseAnswer = houseAnswer;

    /* ================================================================
       Taking a move back (D) — by replay. Barriers: anybody else has
       answered since, a card came off a deck, a die was rolled or a
       Hidden man picked blind (both draw on the rng), a new Ballad began.
       ================================================================ */
    function markOf(g) { return { turnN: g.turnN, round: g.ballad, hidden: g.drawN + ',' + g.rngN + ',' + g.rollN, logN: g.log.length }; }
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
      const same = prev && !prev.note && !prev.rel && prev.seat === m.seat && prev.mark.turnN === m.mark.turnN && prev.mark.round === m.mark.round;
      if (!same) S.undoFloor = S.moves.length - 1;
      if (m.human) S.lastHumanAt = now();
    }
    function undoInfo(id) {
      const g = S.g;
      if (!g || S.screen !== 'play' || S.table || g.hold || g.phase === 'over' || !S.createOpts) return null;
      const k = S.moves.length - 1, m = S.moves[k];
      if (!m || m.note || m.rel || m.seat !== id || !m.human || k < S.undoFloor) return null;
      /* The last accepted answer is this seat's, so nobody else has moved since
         (whoever is being asked now has not answered). A turn ending is no
         barrier; a card off a deck, a die or a blind pick, a new Ballad are. */
      const nowM = markOf(g);
      if (nowM.round !== m.mark.round || nowM.hidden !== m.mark.hidden) return null;
      const ls = W.lines(g.log.slice(m.mark.logN), g.publicView(), m.mark.logN).filter(l => l.by === id && !l.quiet);
      return { what: ls.length ? ls[0].text : 'your last choice' };
    }
    H.undoInfo = undoInfo;
    function replayInto(ng, moves) {
      for (const m of moves) {
        if (m.note) { ng.note(m.note); S.moves.push(m); continue; }
        if (m.rel) { if (ng.hold) ng.release(); S.moves.push(m); continue; }
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
      if (!info) { env.flash(from, 'That can no longer be taken back — a card was drawn, a die rolled, or someone else has moved since.', 'bad'); H.sendSeat(from); return; }
      const keep = S.moves.slice(0, -1);
      const want = S.moves[S.moves.length - 1].mark.logN;
      const heldTo = S.g.holdN;
      let ng;
      const saveMoves = S.moves;
      try {
        ng = E.create(S.createOpts);
        S.moves = [];
        for (const m of keep) {
          if (m.note) { ng.note(m.note); S.moves.push(m); continue; }
          if (m.rel) { if (ng.hold) ng.release(); S.moves.push(m); continue; }
          while (ng.hold) ng.release();
          const r = ng.act(m.seat, m.a);
          if (!r.ok) throw new Error(r.why);
          S.moves.push(m);
        }
        /* Release every hold the room has already read. */
        while (ng.hold && ng.hold.n <= heldTo) ng.release();
        if (ng.log.length !== want) throw new Error('the replay came out different');
      } catch (e) {
        S.moves = saveMoves;
        env.flash(from, 'Could not take that back (' + e.message + ').', 'bad');
        return;
      }
      let floor = S.moves.length;
      while (floor > 0) { const m = S.moves[floor - 1]; if (m.note || m.rel || m.seat !== from || m.mark.turnN !== ng.turnN || m.mark.round !== ng.ballad) break; floor--; }
      S.undoFloor = floor;
      S.g = ng;
      S.thinking = {}; S.stateKey = ''; S.show = null; S.table = null;
      const undone = { text: seatName(from) + ' takes back a move: ' + info.what.replace(/\.$/, '') + '.' };
      S.undone = undone;
      later(() => { if (S.undone === undone) { S.undone = null; changed(); } }, T.undoMs);
      for (const p of ng.players) if (!p.bot && p.id !== from) env.flash(p.id, seatName(from) + ' took back a move.', 'bad');
      H.afterChange();
    }
    H.doUndo = doUndo;

    /* ================================================================
       Save and resume (solo): the game is its options and its answers.
       A hold the display released is a move too ({rel}), or a resumed game
       replays to a different place (checklist F1).
       ================================================================ */
    H.saveData = function () {
      const g = S.g;
      return { v: VERSION, createOpts: S.createOpts, moves: S.moves, opts: S.gameOpts || S.opts, at: Date.now(),
        ballad: g ? g.ballad : 0, favour: g ? g.favour : 0, sides: g ? g.players.map(p => ({ name: p.name, side: p.side })) : [], names: g ? g.players.map(p => p.name) : [] };
    };
    H.resume = function (data) {
      if (!data || !data.createOpts) return false;
      try {
        S.opts = Object.assign({}, S.opts, data.opts || {});
        S.heldTo = 0;
        begin(data.createOpts, data.moves || []);
        S.reelAt = 0;
        H.afterChange();
        return true;
      } catch (e) { return false; }
    };

    /* ================================================================
       The engine's holds: a table hold (each Ballad's opening card)
       waits for Continue on every phone; a show (a card, a Rob, an Inspection page) is timed.
       ================================================================ */
    function holdWatch() {
      const g = S.g;
      if (!g || !g.hold) return;
      const h = g.hold;
      if (TABLE_HOLDS[h.k]) {
        if (S.table && S.table.n === h.n) return;
        const waiting = g.players.filter(p => !p.bot).map(p => p.id);
        S.table = { n: h.n, k: h.k, id: h.k + h.n, waiting, done: [], at: now(), grace: false };
        S.heldTo = Math.max(S.heldTo, h.n);
        if (!waiting.length) { const tb = S.table; later(() => { if (S.table === tb) releaseTable(); }, T.lookMs); }
        return;
      }
      if (S.show && S.show.n === h.n) return;
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
      if (g.hold && g.hold.n === n) { g.release(n); S.moves.push({ rel: n }); }
      S.reelAt = now();
      const last = S.moves[S.moves.length - 1];
      if (last && last.human) S.lastHumanAt = now();
      H.afterChange();
    }
    H.showDone = showDone;
    function tableView() {
      const h = S.table;
      return h ? { n: h.n, k: h.k, id: h.id, waiting: h.waiting.slice(), done: h.done.slice(), grace: h.grace } : null;
    }
    function tableContinue(from, id) {
      const h = S.table;
      if (!h) return;
      /* Continue names the card it was pressed on, or a late tap dismisses the next one. */
      if (id && id !== h.id) return;
      const i = h.waiting.indexOf(from);
      if (i < 0) return;
      h.waiting.splice(i, 1);
      h.done.push(from);
      if (!h.waiting.length) releaseTable(); else changed();
    }
    function tableNoWait(from) {
      const h = S.table;
      if (!h || !h.grace || h.done.indexOf(from) < 0 || !h.waiting.length) return;
      note({ t: 'nowait', who: h.waiting.slice() });
      releaseTable();
    }
    function releaseTable() {
      const g = S.g, h = S.table;
      S.table = null;
      if (g && h && g.hold && g.hold.n === h.n) { g.release(h.n); S.moves.push({ rel: h.n }); }
      S.stateKey = '';
      S.reelAt = now();
      H.afterChange();
    }

    /* ================================================================
       The finale: data for shared/finale.js. The display plays it and
       reports each stage back with H.finaleStage.
       ================================================================ */
    H.finaleData = function () {
      const g = S.g, R = g.result;
      const winSmall = R.side === 'robin' ? 'Robin Hood — the King calls it Justice' : 'the Sheriff — the King calls it Order';
      return {
        title: R.how === 'king' ? 'King Richard returns' : 'The Royal Favour tips',
        sub: R.how === 'king' ? 'Home from the Crusade, the King hears how Nottinghamshire was kept.' : 'At the Royal Inspection the Favour reached ' + D.WIN_AT + '.',
        tone: R.side === 'robin' ? 'confetti' : 'fireworks',
        categories: [{ key: 'favour', label: 'The Royal Favour' }],
        decider: 'favour', deciderLine: 'And the King’s judgement',
        players: R.rows.map(r => ({ id: r.id, name: r.name, hex: r.hex, parts: { favour: r.favour }, total: r.favour, place: r.place, won: r.won,
          tag: (r.side === 'robin' ? 'Robin Hood' : 'the Sheriff') + (r.bot ? ' · house ' + r.level : '') })),
        places: false, winSmall,
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
  else root.RhHost = Host;
})(typeof window !== 'undefined' ? window : this);
