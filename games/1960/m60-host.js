'use strict';
/* 1960: The Making of the President — the host. Everything the display does
 * that is not paint.
 *
 * LESSONS-CHECKLIST F1 ("a mode, not a fork"): this file runs inside the
 * telly page on the hub (1960.html) and inside the phone page when one person
 * plays alone (solo.html). It owns:
 *
 *   the lobby options     which side the first phone plays, the house's level,
 *                         Restricted Positioning, pace, sound, the mode
 *   the game              E.create and every answer through play()
 *   the house             thinking at a fraction of the pace, never before the
 *                         room has read the house's last move
 *   the holds             the table cards (turn, Momentum, Debates, Election
 *                         Day, lessons: Continue on every phone), a draw from
 *                         the bag (shaken, then shown, then released) and the
 *                         Debate reveals, each released by a timer, a Skip or
 *                         (solo) the phone's Go on
 *   the spotlight         each card played, large for a moment (a value)
 *   undo                  by replay, back to the start of your own turn
 *   save and resume       the moves list, releases included (solo)
 *   the finale stages     the display plays the reveal and reports back
 *
 * It talks through `env`: toAll / toSeat / flash / humans / remote, an
 * optional timer and clock, and hooks (onChange for the telly's repaint,
 * onLog, cue, bank, save, menu, onStart, onReset, onFinale, skipFinale,
 * extra). The field names on S (tbl, draw, timed, spot, moves, createOpts,
 * finale, T) are the ones the room tests read.
 */
(function (root) {
  const req = n => (typeof module !== 'undefined' && module.exports) ? require('./' + n) : null;
  const D = req('m60-data.js') || root.M60Data;
  const E = req('m60-engine.js') || root.M60Engine;
  const B = req('m60-bots.js') || root.M60Bots;
  const W = req('m60-words.js') || root.M60Words;
  /* Rides inside every save: a save of another version is not resumed. */
  const VERSION = 1;
  const SN = s => D.SIDE[s].name;

  /* Every wait in one table; the tests turn them all down. */
  function defaultT() {
    return {
      paceMs: { slow: 2600, relaxed: 1600, brisk: 800 },
      thinkMin: 0.45, thinkMax: 1.1,
      /* A house move may not start until the room has had this long to read
         the house's previous one (F1, "show the house's turns"). */
      houseShowMs: { slow: 3600, relaxed: 2600, brisk: 1400 },
      spotMs: { slow: 3200, relaxed: 2400, brisk: 1400 },
      shakeMs: { slow: 900, relaxed: 700, brisk: 450 },       // solo: the bag shakes before the cubes show
      cubeMs: { slow: 650, relaxed: 480, brisk: 300 },        // one cube out of the bag
      drawTailMs: { slow: 2000, relaxed: 1500, brisk: 900 },  // the result stays up this long
      revealMs: { slow: 4200, relaxed: 3200, brisk: 2000 },
      wonMs: { slow: 4000, relaxed: 3000, brisk: 1800 },
      tipsMs: { slow: 6000, relaxed: 4500, brisk: 2800 },
      pageMs: { slow: 6500, relaxed: 5000, brisk: 3200 },
      hurryMs: 90000, holdGraceMs: 20000, lookMs: 7000, undoMs: 6000, saveMs: 400,
      finaleScale: { slow: 1.3, relaxed: 1, brisk: 0.7 }, finaleMul: 1
    };
  }
  /* The house's names (campaign managers). */
  const HOUSE = { K: { name: 'O’Donnell', hex: '#3e7bfa' }, N: { name: 'Finch', hex: '#e5484d' } };

  function create(env) {
    const solo = !!env.solo;
    /* Alone, a draw and a debate reveal wait for "Go on" as well as the
       timer, and stay up longer: the phone is the only screen (F1). */
    const T = Object.assign(defaultT(), solo ? {
      undoMs: 3500,
      drawTailMs: { slow: 4200, relaxed: 3200, brisk: 2200 },
      revealMs: { slow: 6500, relaxed: 5000, brisk: 3600 },
      wonMs: { slow: 5500, relaxed: 4200, brisk: 3000 },
      tipsMs: { slow: 8000, relaxed: 6500, brisk: 4500 }
    } : {}, env.T || {});
    const now = () => (env.now ? env.now() : Date.now());
    const later = (fn, ms) => (env.timer ? env.timer(fn, ms) : setTimeout(fn, ms));
    const S = {
      screen: 'lobby', g: null,
      opts: { side: 'K', sideRandom: false, pace: solo ? 'brisk' : 'relaxed', level: 'medium', sound: !solo, restricted: false, mode: 'play' },
      gameOpts: null, thinking: {}, stateKey: '', hurryAt: 0, hurryShown: false,
      pay: null, banked: false,
      tbl: null, draw: null, timed: null, spot: null, spotN: 0, heldTo: 0,
      createOpts: null, moves: [], undoFloor: 0, lastHumanAt: 0, undone: null,
      reelAt: 0, hidden: false, houseAt: [], fallbacks: 0,
      finale: null, finaleN: 0
    };
    S.T = T;
    const H = { S, T, solo, HOUSE };
    const humans = () => env.humans();
    const remote = () => (env.remote ? env.remote() : (humans()[0] ? humans()[0].id : null));
    const pace = () => (S.gameOpts || S.opts).pace;
    const paceMs = () => T.paceMs[pace()] || T.paceMs.relaxed;
    /* A wait for this pace; 0 is a real answer (the tests use it), not "unset". */
    const pick = (tab, dflt) => { const v = tab ? tab[pace()] : null; return v != null ? v : dflt; };
    H.pick = pick;
    const seatName = id => { const p = S.g && S.g.seat(id); if (p) return p.name; const h = humans().find(x => x.id === id); return h ? h.name : '?'; };
    const cue = (name, o) => { if (env.cue && (S.gameOpts || S.opts).sound) env.cue(name, o || {}); };

    /* ================================================================
       The lobby — two chairs, one a side
       ================================================================ */
    /* How to play is against a gentle house: Easy, whatever the lobby said. */
    const houseLevel = () => (S.opts.mode === 'learn' ? 'easy' : S.opts.level);
    H.lobbyView = function () {
      const hs = humans();
      const seated = hs.slice(0, 2).map(s => ({ id: s.id, name: s.name, hex: s.hex }));
      const sides = [S.opts.side, D.other(S.opts.side)];
      seated.forEach((p, k) => { p.side = sides[k]; });
      const house = seated.length < 2 ? [{ name: HOUSE[sides[1]].name, hex: HOUSE[sides[1]].hex, house: true, level: houseLevel(), side: sides[1] }] : [];
      return { seated, house, side: S.opts.sideRandom ? 'R' : S.opts.side, pace: S.opts.pace, level: S.opts.level, sound: S.opts.sound, restricted: S.opts.restricted, mode: S.opts.mode,
        watching: hs.slice(2).map(s => ({ id: s.id, name: s.name, hex: s.hex })) };
    };
    H.canStart = () => humans().length >= 1 && !(env.evicted && env.evicted());
    H.setOpt = function (key, value) {
      if (S.screen !== 'lobby') return false;
      if (key === 'side') { if (['K', 'N', 'R'].indexOf(value) < 0) return false; S.opts.sideRandom = value === 'R'; S.opts.side = value === 'R' ? (Math.random() < 0.5 ? 'K' : 'N') : value; }
      else if (key === 'pace') { if (!T.paceMs[value]) return false; S.opts.pace = value; }
      else if (key === 'level') { if (E.LEVELS.indexOf(value) < 0) return false; S.opts.level = value; }
      else if (key === 'mode') { if (value !== 'play' && value !== 'learn') return false; S.opts.mode = value; }
      else if (key === 'restricted') S.opts.restricted = value === true || value === 'on';
      else if (key === 'sound') { S.opts.sound = value === true || value === 'on'; if (env.sound) env.sound(S.opts.sound); }
      else return false;
      changed();
      return true;
    };

    /* ================================================================
       Starting and finishing
       ================================================================ */
    H.start = function (seed) {
      if (!H.canStart() || S.screen !== 'lobby') return false;
      if (S.opts.sideRandom) S.opts.side = Math.random() < 0.5 ? 'K' : 'N';
      const lv = H.lobbyView();
      const players = lv.seated.map(p => ({ id: p.id, name: p.name, hex: D.SIDE[p.side].hex, side: p.side }))
        .concat(lv.house.map(b => ({ id: 'house' + b.side, name: b.name, hex: D.SIDE[b.side].hex, bot: true, level: houseLevel(), side: b.side })));
      const sd = seed == null ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed;
      if (env.onStart) env.onStart();
      begin({ players, seed: sd, show: true, restricted: S.opts.restricted, teach: S.opts.mode === 'learn' }, []);
      return true;
    };
    function begin(createOpts, moves) {
      S.createOpts = createOpts;
      S.g = E.create(createOpts);
      S.moves = []; S.undoFloor = 0; S.undone = null;
      S.finale = null; S.reelAt = 0; S.draw = null; S.tbl = null; S.timed = null; S.spot = null; S.heldTo = 0;
      S.gameOpts = Object.assign({}, S.opts);
      S.pay = null; S.banked = false; S.thinking = {}; S.stateKey = '';
      S.screen = 'play';
      if (moves && moves.length) replayInto(S.g, moves);
      S.spotN = S.g.log.length;
      H.afterChange();
    }
    H.resetToLobby = function () {
      bankNow();
      if (env.onReset) env.onReset();
      S.finale = null;
      S.g = null; S.screen = 'lobby'; S.pay = null; S.gameOpts = null; S.createOpts = null; S.moves = [];
      S.tbl = null; S.draw = null; S.timed = null; S.spot = null;
      if (env.save) env.save(null);
      changed();
    };
    /* The season (hub only): £10,000 to the winner, and £20 an electoral vote
       won to everybody — a close loser has an evening to show for it too. */
    function settle() {
      const g = S.g;
      if (!g || g.phase !== 'over' || S.pay) return;
      S.pay = g.result.rows.map(r => ({
        id: r.id, name: r.name, bot: r.bot,
        winnings: (r.won ? 10000 : 0) + 20 * r.ev,
        place: r.won ? 1 : 2,
        detail: (r.won ? 'won the White House, ' : 'lost, ') + r.ev + ' electoral votes as ' + SN(r.side)
      }));
    }
    /* Solo games never bank into the room's season (F1), nor does a lesson (F2). */
    function bankNow() {
      if (!S.pay || S.banked || solo || (S.createOpts && S.createOpts.teach)) return;
      S.banked = true;
      const real = S.pay.filter(p => !p.bot);
      if (real.length && env.bank) env.bank(real.map(p => ({ name: p.name, winnings: p.winnings, place: p.place, detail: p.detail })));
    }
    H.bank = bankNow;
    H.settle = settle;

    /* ================================================================
       Talking to the room
       ================================================================ */
    const revealed = () => !S.finale || S.finale.stage === 'winner' || S.finale.stage === 'table';
    H.revealed = revealed;
    /* Until the reveal names the winner, the count is nobody's business (H3). */
    function untold(log) {
      if (revealed() || !S.g || S.g.phase !== 'over') return log;
      return log.filter(e => e.t !== 'over');
    }
    H.untold = untold;
    /* While a draw is in the bag, the cubes are nobody's business — not the
       hold's, not the log's (LESSONS-CHECKLIST C: "dice are a secret until
       they land"). Alone, they land on the phone first, then show. */
    function hideDraws(game) {
      if (!S.draw || S.draw.landed || !game) return game;
      if (game.hold && game.hold.rows) game.hold = Object.assign({}, game.hold, { rows: game.hold.rows.map(r => ({ st: r.st, k: r.k, winner: null, cubes: null, got: null })) });
      const i = game.log.map(e => e.t).lastIndexOf('checks');
      const j = game.log.map(e => e.t).lastIndexOf('init');
      if (S.draw.init && j >= 0) game.log = game.log.slice(0, j);
      else if (i >= 0 && i >= game.log.length - 3) game.log = game.log.slice(0, i);
      return game;
    }
    H.hideDraws = hideDraws;
    H.publicView = function () {
      const g = S.g;
      let game = g ? g.publicView() : null;
      if (game && !revealed()) { game.result = null; game.log = untold(game.log); }
      return hideDraws(game);
    };
    function tblView() {
      const t = S.tbl;
      if (!t) return null;
      return { n: t.n, k: t.k, waiting: t.waiting.slice(), done: t.done.slice(), grace: t.grace, page: t.page, pages: t.pages };
    }
    H.publicMsg = function () {
      return Object.assign({
        t: 'm60', screen: S.screen, remote: remote(), solo,
        opts: S.gameOpts || S.opts,
        lobby: S.screen === 'lobby' ? H.lobbyView() : null,
        game: H.publicView(),
        hurry: hurryView(),
        tbl: tblView(),
        draw: S.draw ? { n: S.draw.n, landed: !!S.draw.landed } : null,
        timed: S.timed ? { n: S.timed.n, k: S.timed.k } : null,
        spot: S.spot ? { n: S.spot.n, card: S.spot.card, side: S.spot.side, line: S.spot.line } : null,
        undone: S.undone ? S.undone.text : null,
        finale: S.finale ? { n: S.finale.n, stage: S.finale.stage, label: S.finale.label || '' } : null,
        pay: S.pay && revealed() ? S.pay.map(p => ({ name: p.name, winnings: p.winnings, detail: p.detail, bot: p.bot })) : null,
        paused: solo && S.hidden
      }, env.extra ? env.extra() : {});
    };
    H.publish = function () {
      env.toAll(H.publicMsg());
      const g = S.g;
      if (g) for (const p of g.players) if (!p.bot) H.sendSeat(p.id);
    };
    H.sendSeat = function (id) {
      const g = S.g;
      if (!g || g.idx(id) < 0) return;
      const me = g.seatView(id);
      /* How to play: the coach is the hard house's pick from THIS seat's view
         only, and goes in this seat's own message only. */
      let coach = null;
      if (g.opts.teach && !g.hold && me.prompts.length) { try { coach = B.coach(g.publicView(), me); } catch (e) { coach = null; } }
      env.toSeat(id, { t: 'm60-me', me, undo: undoInfo(id), coach });
    };
    function changed() { if (env.onChange) env.onChange(); H.publish(); }
    H.changed = changed;

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
      if (msg.t === 'quit') { if (from === holder) H.resetToLobby(); return; }
      if (msg.t === 'skip') {
        if (from !== holder) return;
        if (S.finale && env.skipFinale) env.skipFinale();
        else if (S.draw) drawDone(S.draw);
        else if (S.timed) timedDone(S.timed);
        return;
      }
      const g = S.g;
      if (!g) return;
      if (msg.t === 'hurry') { if (from === holder) hurry(); return; }
      if (msg.t === 'cont') { tblContinue(from, msg.n); return; }
      if (msg.t === 'nowait') { tblNoWait(from); return; }
      if (msg.t === 'undo') { doUndo(from); return; }
      /* Alone, the phone's "Go on" ends a draw or a debate reveal early. */
      if (msg.t === 'goon') {
        if (!solo) return;
        if (S.draw && S.draw.n === +msg.n) { if (!S.draw.landed) landDraw(S.draw); else drawDone(S.draw); }
        else if (S.timed && S.timed.n === +msg.n) timedDone(S.timed);
        return;
      }
      if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
        if (g.hold) { env.flash(from, g.hold.table ? (solo ? 'Read the card first, then tap Continue.' : 'Everyone is reading the card on the telly first. Tap Continue.') : (solo ? 'One moment — it is being shown.' : 'Watch the telly first.'), 'bad'); H.sendSeat(from); return; }
        const r = play(g, from, clean(msg.a));
        if (!r.ok) { env.flash(from, r.why, 'bad'); H.sendSeat(from); return; }
        H.afterChange();
      }
    };
    /* A phone sends the bare order; nothing off the wire is trusted past here. */
    function clean(a) {
      const out = { t: String(a.t || '').slice(0, 12) };
      const str = k => { if (a[k] != null) out[k] = String(a[k]).slice(0, 48); };
      ['id', 'how'].forEach(str);
      if (a.n != null && isFinite(+a.n)) out.n = Math.max(0, Math.min(1e9, +a.n | 0));
      if (a.card != null) out.card = a.card === 'cand' ? 'cand' : Math.max(0, Math.min(999, +a.card | 0));
      if (a.pre != null) out.pre = !!a.pre;
      if (Array.isArray(a.ids)) out.ids = a.ids.slice(0, 20).map(x => String(x).slice(0, 48));
      if (a.map && typeof a.map === 'object') { out.map = {}; Object.keys(a.map).slice(0, 60).forEach(k => { out.map[String(k).slice(0, 8)] = Math.max(0, Math.min(99, +a.map[k] | 0)); }); }
      return out;
    }

    /* Everything that follows a change of state, in one place. */
    H.afterChange = function () {
      const g = S.g;
      if (!g) { changed(); return; }
      const key = g.prompts.map(p => p.n + p.seat).join(',') + ':' + g.log.length;
      if (key !== S.stateKey) { S.stateKey = key; S.hurryAt = now() + T.hurryMs; S.hurryShown = false; }
      holdWatch();
      spotWatch();
      if (env.onLog) env.onLog();
      if (g.phase === 'over' && S.screen !== 'over') {
        S.screen = 'over';
        S.spot = null;
        settle();
        startFinale();
      }
      houseThinks();
      if (env.save && S.createOpts && S.screen !== 'lobby') queueSave();
      changed();
    };
    /* The save is the whole move list, written at most every T.saveMs (and at
       once when the phone is put away). */
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
      if (solo || !g || S.screen !== 'play' || g.phase === 'over' || g.hold) return null;
      const waiting = g.prompts.map(pr => g.seat(pr.seat)).filter(p => p && !p.bot).map(p => p.id);
      if (!waiting.length || now() < S.hurryAt) return null;
      const ids = Array.from(new Set(waiting));
      return { ids, names: ids.map(id => g.seat(id).name) };
    }
    H.hurryView = hurryView;
    function hurry() {
      const h = hurryView();
      if (!h) return;
      const g = S.g;
      note({ t: 'hurried', who: h.ids.slice() });
      for (const id of h.ids) {
        for (let k = 0; k < 40; k++) {
          const pr = g.prompts.find(x => x.seat === id);
          if (!pr || g.hold || g.phase === 'over') break;
          houseAnswer(g, id, pr.n, true);
        }
      }
      H.afterChange();
    }
    H.tick = function () {
      const g = S.g;
      if (!g || S.screen !== 'play') return;
      if (S.tbl && !S.tbl.grace && !solo && now() - S.tbl.at >= T.holdGraceMs) { S.tbl.grace = true; changed(); }
      const show = !!hurryView();
      if (show !== S.hurryShown) { S.hurryShown = show; changed(); }
    };

    /* ================================================================
       The house, deciding from its own seat's view and nothing else. Its
       thinking is a fraction of the pace, and each of its turns waits until
       the room has had time to read the move before. Alone, it stops while
       the phone is away.
       ================================================================ */
    function houseThinks() {
      const g = S.g;
      if (!g || g.phase === 'over' || g.hold || S.hidden) return;
      for (const pr of g.prompts) {
        const p = g.seat(pr.seat);
        if (!p || !p.bot) continue;
        const key = 'p' + pr.n + ':' + pr.seat;
        if (S.thinking[key]) continue;
        S.thinking[key] = true;
        const turnish = pr.t === 'turn';
        let ms = paceMs() * (turnish ? 1 : 0.45) * (T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin));
        if (turnish) ms = Math.max(ms, S.reelAt + pick(T.houseShowMs, 2600) - now());
        const last = S.moves[S.moves.length - 1];
        if (last && last.human && last.act && undoInfo(last.seat)) ms = Math.max(ms, S.lastHumanAt + T.undoMs - now());
        later(() => {
          if (S.g !== g || g.phase === 'over') return;
          if (g.hold || S.hidden) { S.thinking[key] = false; return; }
          if (!g.prompts.find(x => x.n === pr.n)) return;
          houseAnswer(g, pr.seat, pr.n);
          if (turnish) { S.houseAt.push({ at: now(), since: now() - S.reelAt }); if (S.houseAt.length > 400) S.houseAt.shift(); S.reelAt = now(); }
          H.afterChange();
        }, Math.max(0, ms));
      }
    }
    function houseAnswer(g, id, n, forPhone) {
      const me = g.seatView(id);
      const view = me.prompts.find(x => x.n === n);
      if (!view) return null;
      const pub = g.publicView();
      let r = play(g, id, B.answer(pub, me, view), forPhone);
      if (!r.ok) { S.fallbacks++; r = play(g, id, B.fallback(pub, me, view), forPhone); }
      return r;
    }
    H.houseAnswer = houseAnswer;

    /* ================================================================
       Taking a move back (LESSONS-CHECKLIST D) — by replay. Barriers: the
       other side has moved, or anything hidden came out: a cube from the bag,
       a card off a deck, a held card or draw shown, the turn moving on.
       ================================================================ */
    function markOf(g) {
      return { turn: g.turn, hidden: [g.rngN, g.drawN, g.holdN].join(','), logN: g.log.length };
    }
    H.markOf = markOf;
    function play(g, seat, a, forPhone) {
      const mark = markOf(g);
      const wasAct = g.phase === 'act';
      const pr = g.prompts.find(x => x.seat === seat && (a.n == null || x.n === +a.n));
      const r = g.act(seat, a);
      if (r && r.ok && g === S.g) {
        const p = g.seat(seat);
        record({ seat, a: JSON.parse(JSON.stringify(a)), human: !!p && !p.bot && !forPhone, mark, act: wasAct, kind: pr ? pr.t : null });
      }
      return r;
    }
    H.play = play;
    function note(e) {
      S.g.note(e);
      S.moves.push({ note: e });
      S.undoFloor = S.moves.length;
    }
    H.note = note;
    function record(m) {
      const prev = S.moves[S.moves.length - 1];
      S.moves.push(m);
      const same = prev && !prev.note && !prev.rel && prev.seat === m.seat && prev.mark.turn === m.mark.turn;
      if (!same) S.undoFloor = S.moves.length - 1;
      if (m.human) S.lastHumanAt = now();
    }
    /* Undo goes back to the start of your own turn: the card you played and
       every step after it (campaign steps, a share-out), all at once. */
    function undoStart(id) {
      const g = S.g;
      if (!g || S.screen !== 'play' || g.hold || g.phase !== 'act' || !S.createOpts) return -1;
      /* The other side being asked (whether to trigger the card, or for its
         own turn) has not moved yet: the move can still come back. Once it
         answers, its move is the last in the list and the walk below stops.
         (Until 2026-11-27 any question but a trigger blocked it, so a card
         with no trigger could never be taken back.) */
      const nowM = markOf(g);
      for (let k = S.moves.length - 1; k >= S.undoFloor; k--) {
        const m = S.moves[k];
        if (!m || m.note || m.rel || m.seat !== id || !m.human || !m.act) return -1;
        if (nowM.turn !== m.mark.turn || nowM.hidden !== m.mark.hidden) return -1;
        if (m.kind === 'turn') return k;
      }
      return -1;
    }
    function undoInfo(id) {
      const k = undoStart(id);
      if (k < 0) return null;
      const g = S.g, m = S.moves[k];
      /* Named from the log entry itself: a card's name may have a full stop in it (Harry F. Byrd). */
      const e = g.log.slice(m.mark.logN).find(x => x.t === 'play');
      if (!e) return { what: 'your card' };
      const name = e.cand || !D.CARD[e.card] ? 'the candidate card' : D.CARD[e.card].name;
      return { what: 'plays ' + name + (e.how === 'event' ? ' for its event' : e.cp ? ', ' + e.cp + ' CP ' + ({ camp: 'campaigning', adv: 'advertising', pos: 'positioning on issues' })[e.how] : '') };
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
      S.heldTo = ng.holdN - (ng.hold ? 1 : 0);
      S.undoFloor = S.moves.length;
    }
    function doUndo(from) {
      const info = undoInfo(from);
      if (!info) { env.flash(from, 'That can no longer be taken back — a cube has been drawn, a card shown, or the other side has moved.', 'bad'); H.sendSeat(from); return; }
      const k0 = undoStart(from);
      const keep = S.moves.slice(0, k0);
      const want = S.moves[k0].mark.logN;
      /* Holds the room has already read stay read. */
      const shown = S.g.holdN;
      let ng;
      try {
        ng = E.create(S.createOpts);
        for (const m of keep) {
          if (m.note) { ng.note(m.note); continue; }
          if (m.rel) { if (ng.hold) ng.release(); continue; }
          while (ng.hold) ng.release();
          const r = ng.act(m.seat, m.a);
          if (!r.ok) throw new Error(r.why);
        }
        while (ng.hold && ng.hold.n <= shown) ng.release();
        if (ng.log.length !== want || ng.hold) throw new Error('the replay came out different');
      } catch (e) {
        env.flash(from, 'Could not take that back (' + e.message + ').', 'bad');
        return;
      }
      S.g = ng; S.moves = keep;
      S.thinking = {}; S.stateKey = ''; S.draw = null; S.timed = null; S.tbl = null;
      S.spot = null; S.spotN = ng.log.length;
      const undone = { text: seatName(from) + ' takes back a move: ' + info.what.replace(/\.$/, '') + '.' };
      S.undone = undone;
      later(() => { if (S.undone === undone) { S.undone = null; changed(); } }, T.undoMs);
      for (const p of ng.players) if (!p.bot && p.id !== from) env.flash(p.id, seatName(from) + ' took back a move.', 'bad');
      if (env.onUndo) env.onUndo();
      H.afterChange();
    }
    H.doUndo = doUndo;

    /* ================================================================
       Save and resume (solo): the game is its options and its answers. A
       hold the display released is a move too ({rel}), or a resumed game
       replays to a different place (checklist F1).
       ================================================================ */
    H.saveData = function () {
      const g = S.g;
      const ev = g ? D.leadingEv(g.sup) : { K: 0, N: 0 };
      return { v: VERSION, createOpts: S.createOpts, moves: S.moves, opts: S.gameOpts || S.opts, at: Date.now(),
        turn: g ? g.turn : 0, ev: { K: ev.K, N: ev.N }, sides: g ? g.players.map(p => ({ name: p.name, side: p.side, bot: p.bot })) : [] };
    };
    H.resume = function (data) {
      if (!data || !data.createOpts || data.v !== VERSION) return false;
      try {
        S.opts = Object.assign({}, S.opts, data.opts || {});
        begin(data.createOpts, data.moves || []);
        S.reelAt = 0;
        H.afterChange();
        return true;
      } catch (e) { S.screen = 'lobby'; S.g = null; return false; }
    };

    /* ================================================================
       The engine's holds. Turn, Momentum, Debate and Election Day cards hold
       the whole table until every phone has tapped Continue (LESSONS-CHECKLIST
       D); a draw from the bag, a debate round, an issue won and the undecided
       states are shown for a moment, then they land.
       ================================================================ */
    function holdWatch() {
      const g = S.g;
      if (!g || !g.hold) {
        if (S.tbl && (!g || !g.hold || g.hold.n !== S.tbl.n)) S.tbl = null;
        return;
      }
      const h = g.hold;
      if (h.table) {
        if (S.tbl && S.tbl.n === h.n) return;
        const waiting = g.players.filter(p => !p.bot).map(p => p.id);
        /* The telly turns a Momentum card's pages one by one; a phone alone
           shows the whole card at once. */
        const pages = h.k === 'mom' && !solo ? W.momPages(g.publicView(), h, g.log.slice(h.from, h.to)).length : 0;
        const tbl = { n: h.n, k: h.k, waiting, done: [], at: now(), grace: false, page: pages ? 0 : null, pages };
        S.tbl = tbl;
        S.heldTo = Math.max(S.heldTo, h.n);
        S.reelAt = 0;
        cue(h.k === 'turnStart' ? 'chime' : 'gong', { gain: 0.7 });
        if (pages) turnPage(tbl);
        if (!waiting.length) later(() => { if (S.tbl === tbl) releaseTbl(); }, T.lookMs + (pages ? pages * pick(T.pageMs, 5000) : 0));
        return;
      }
      if (h.k === 'draw') {
        if (S.draw && S.draw.n === h.n) return;
        const draw = { n: h.n, h, at: now(), init: !!h.init, landed: false };
        S.draw = draw;
        S.heldTo = Math.max(S.heldTo, h.n);
        cue('rise', { gain: 0.6 });
        /* On the hub the telly animates the cubes straight away and the phones
           learn the result when it lands. Alone, the bag shakes, then the
           cubes come out on the phone. */
        if (solo) later(() => landDraw(draw), pick(T.shakeMs, 700));
        else later(() => drawDone(draw), cubesOf(h) * pick(T.cubeMs, 480) + pick(T.drawTailMs, 1500));
        return;
      }
      if (S.timed && S.timed.n === h.n) return;
      const ms = h.k === 'reveal' ? pick(T.revealMs, 3200) : h.k === 'won' ? pick(T.wonMs, 3000) : h.k === 'tips' ? pick(T.tipsMs, 4500) : pick(T.wonMs, 3000);
      const timed = { n: h.n, k: h.k, h, at: now() };
      S.timed = timed;
      S.heldTo = Math.max(S.heldTo, h.n);
      cue(h.k === 'reveal' ? 'flip' : h.k === 'won' ? 'fanfare' : 'sparkle', { gain: 0.7 });
      later(() => timedDone(timed), ms);
    }
    const cubesOf = h => (h.rows || []).reduce((t, r) => t + (r.cubes ? r.cubes.length : 0), 0);
    H.cubesOf = cubesOf;
    /* Away from the phone, nothing lands and nothing moves on: a draw and a
       debate reveal wait for the screen to come back (F1). */
    const whenSeen = fn => { later(fn, 400); };
    function landDraw(draw) {
      if (S.draw !== draw || draw.landed) return;
      if (S.hidden) { whenSeen(() => landDraw(draw)); return; }
      draw.landed = true;
      draw.at = now();
      changed();
      later(() => drawDone(draw), cubesOf(draw.h) * pick(T.cubeMs, 480) + pick(T.drawTailMs, 1500));
    }
    function turnPage(tbl) {
      later(() => {
        if (S.tbl !== tbl || tbl.page == null) return;
        if (tbl.page < tbl.pages) { tbl.page++; cue('tick', { gain: 0.5 }); }
        if (tbl.page >= tbl.pages && !tbl.waiting.length) { releaseTbl(); return; }
        changed();
        if (tbl.page < tbl.pages) turnPage(tbl);
      }, pick(T.pageMs, 5000));
    }
    function release(n) {
      const g = S.g;
      if (g && g.hold && g.hold.n === n) { g.release(n); S.moves.push({ rel: n }); }
    }
    function drawDone(draw) {
      if (S.draw !== draw || !S.g) return;
      if (S.hidden) { whenSeen(() => drawDone(draw)); return; }
      S.draw = null;
      release(draw.n);
      cue('coin', { gain: 0.5 });
      H.afterChange();
    }
    function timedDone(t) {
      if (S.timed !== t || !S.g) return;
      if (S.hidden) { whenSeen(() => timedDone(t)); return; }
      S.timed = null;
      release(t.n);
      H.afterChange();
    }
    H.drawDone = () => { if (S.draw) drawDone(S.draw); };
    H.timedDone = () => { if (S.timed) timedDone(S.timed); };
    function tblContinue(from, n) {
      const t = S.tbl;
      /* Continue names the card it was pressed on, or a late tap dismisses
         the next one. */
      if (!t || (n != null && +n !== t.n)) return;
      const i = t.waiting.indexOf(from);
      if (i < 0) return;
      t.waiting.splice(i, 1);
      t.done.push(from);
      /* A paged card turns to its last page once everybody has read it. */
      if (!t.waiting.length && (t.page == null || t.page >= t.pages)) releaseTbl();
      else if (!t.waiting.length) { t.page = t.pages; changed(); later(() => { if (S.tbl === t) releaseTbl(); }, pick(T.pageMs, 5000) * 0.6); }
      else changed();
    }
    function tblNoWait(from) {
      const t = S.tbl;
      if (!t || !t.grace || t.done.indexOf(from) < 0 || !t.waiting.length) return;
      note({ t: 'nowait', who: t.waiting.slice() });
      releaseTbl();
    }
    function releaseTbl() {
      const t = S.tbl;
      S.tbl = null;
      S.stateKey = '';
      S.reelAt = now();
      if (t) release(t.n);
      H.afterChange();
    }

    /* ================================================================
       The spotlight: each card played turns over large for a moment, so the
       room sees what it was (a value held, never a deadline).
       ================================================================ */
    function spotWatch() {
      const g = S.g;
      if (!g) return;
      for (let i = g.log.length - 1; i >= S.spotN; i--) {
        const e = g.log[i];
        if ((e.t === 'play' && !e.cand) || e.t === 'trigger' || (e.t === 'event' && (e.via === 'hh' || e.via === 'tricky'))) {
          const how = e.t === 'trigger' ? 'triggers it for 1 momentum' : e.t === 'event' ? (e.via === 'hh' ? 'High Hopes turns it over: an event for Kennedy' : 'Tricky Dick plays it from the discards') :
            e.how === 'event' ? 'plays it as an event' : 'plays it for ' + e.cp + ' CP — ' + ({ camp: 'Campaigning', adv: 'Advertising', pos: 'Positioning' })[e.how] + (e.pre ? ' (preempted)' : '');
          const spot = { n: i, card: e.card, side: e.side, line: SN(e.side) + ' ' + how };
          S.spot = spot;
          later(() => { if (S.spot === spot) { S.spot = null; changed(); } }, pick(T.spotMs, 2400));
          break;
        }
      }
      S.spotN = g.log.length;
    }

    /* ================================================================
       The finale: data for shared/finale.js — the votes region by region,
       the closest region last. The display (the telly, or the solo phone)
       plays it and reports each stage back with H.finaleStage.
       ================================================================ */
    H.finaleData = function () {
      const R = S.g.result;
      const margin = r => Math.abs(R.rows[0].byReg[r] - R.rows[1].byReg[r]);
      const regs = D.REGIONS.slice().sort((a, b) => margin(b) - margin(a));
      const cats = regs.map(r => ({ key: r, label: 'The ' + D.REGION[r].name + ' — ' + D.statesIn(r).reduce((t, s) => t + D.STATE[s].ev, 0) + ' votes' }));
      const tie = R.how === 'states' ? 'The electoral votes are level: the House of Representatives picks whoever won more states.' : R.how === 'cubes' ? 'Level on votes and on states: whoever has more state support wins.' : null;
      return {
        title: 'The polls have closed', sub: '537 electoral votes. 269 to win.', tone: 'confetti',
        categories: cats, decider: regs[regs.length - 1], deciderLine: 'And the closest region of all',
        players: R.rows.map(r => ({ id: r.id, name: SN(r.side), hex: D.SIDE[r.side].hex, side: r.side, parts: Object.assign({}, r.byReg), total: r.ev, place: r.won ? 1 : 2, won: r.won,
          tag: r.name + (r.bot ? ' · house · ' + r.level : '') })),
        tiebreak: tie, places: false, winSmall: 'is the next President',
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
    return H;
  }

  const Host = { VERSION, create, defaultT, HOUSE };
  if (typeof module !== 'undefined' && module.exports) module.exports = Host;
  else root.M60Host = Host;
})(typeof window !== 'undefined' ? window : this);
