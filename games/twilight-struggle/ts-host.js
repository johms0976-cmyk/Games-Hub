'use strict';
/* Twilight Struggle — the host. Everything the display does that is not paint.
 *
 * LESSONS-CHECKLIST F1 ("a mode, not a fork"): this file runs inside the
 * telly page on the hub (ts.html) and inside the phone page when one person
 * plays alone (solo.html). It owns:
 *
 *   the lobby options     which side the first phone plays, the house's level,
 *                         the optional cards, pace, sound
 *   the game              E.create and every answer through play()
 *   the house             thinking at a fraction of the pace, never before the
 *                         room has read the house's last move
 *   the holds             the table cards (turn opening, scoring, turn end,
 *                         final scoring: Continue on every phone), the dice
 *                         (rolling, then landed, then released) and the
 *                         headline reveal, each released by a timer, a Skip or
 *                         (solo) the phone's Go on
 *   undo                  by replay, back to the start of your action round
 *   save and resume       the moves list, releases included (solo)
 *   the finale stages     the display plays the reveal and reports back
 *
 * It talks through `env`: toAll / toSeat / flash / humans / remote, an
 * optional timer and clock, and hooks (onChange for the telly's repaint,
 * bank, save, menu, onFinale, skipFinale, extra for the telly's own fields).
 * The field names on S (tbl, dice, timed, moves, createOpts, finale) are the
 * ones the room tests read.
 */
(function (root) {
  const req = n => (typeof module !== 'undefined' && module.exports) ? require('./' + n) : null;
  const D = req('ts-data.js') || root.TSData;
  const E = req('ts-engine.js') || root.TSEngine;
  const B = req('ts-bots.js') || root.TSBots;
  const W = req('ts-words.js') || root.TSWords;
  /* Rides inside every save: a save of another version is not resumed. */
  const VERSION = 1;

  /* Every wait in one table; the tests turn them all down. */
  function defaultT() {
    return {
      paceMs: { slow: 2600, relaxed: 1600, brisk: 800 },
      thinkMin: 0.45, thinkMax: 1.1,
      /* A house move may not start until the room has had this long to read
         the house's previous one (F1, "show the house's turns"). */
      houseShowMs: { slow: 3600, relaxed: 2600, brisk: 1500 },
      tumbleMs: { slow: 1500, relaxed: 1100, brisk: 650 },   // the dice roll before they land
      landMs: { slow: 2400, relaxed: 1800, brisk: 1000 },    // the result stays up this long
      headMs: { slow: 5200, relaxed: 4000, brisk: 2400 },
      defconMs: { slow: 4200, relaxed: 3200, brisk: 2000 },
      hurryMs: 90000, holdGraceMs: 20000, lookMs: 7000, undoMs: 6000, saveMs: 400,
      finaleScale: { slow: 1.3, relaxed: 1, brisk: 0.7 }, finaleMul: 1
    };
  }
  const HOUSE = { SU: { name: 'Comrade Volkov' }, US: { name: 'Director Hale' } };

  function create(env) {
    const solo = !!env.solo;
    /* Alone, the dice and the headline wait for "Go on" as well as the timer,
       and the house is quicker (F1). */
    const T = Object.assign(defaultT(), solo ? { undoMs: 3500, landMs: { slow: 4000, relaxed: 3000, brisk: 2000 }, headMs: { slow: 7000, relaxed: 5500, brisk: 4000 } } : {}, env.T || {});
    const now = () => (env.now ? env.now() : Date.now());
    const later = (fn, ms) => (env.timer ? env.timer(fn, ms) : setTimeout(fn, ms));
    const S = {
      screen: 'lobby', g: null,
      opts: { side: 'SU', sideRandom: false, pace: solo ? 'brisk' : 'relaxed', level: 'medium', sound: !solo, optional: false, mode: 'play' },
      gameOpts: null, thinking: {}, stateKey: '', hurryAt: 0, hurryShown: false,
      pay: null, banked: false,
      tbl: null, dice: null, timed: null, heldTo: 0,
      createOpts: null, moves: [], undoFloor: 0, lastHumanAt: 0, undone: null,
      reelAt: 0, hidden: false, houseAt: [], fallbacks: 0,
      finale: null, finaleN: 0
    };
    const H = { S, T, solo, HOUSE };
    const humans = () => env.humans();
    const remote = () => (env.remote ? env.remote() : (humans()[0] ? humans()[0].id : null));
    const pace = () => (S.gameOpts || S.opts).pace;
    const paceMs = () => T.paceMs[pace()] || T.paceMs.relaxed;
    /* A wait for this pace; 0 is a real answer (the tests use it), not "unset". */
    const pick = (tab, dflt) => { const v = tab ? tab[pace()] : null; return v != null ? v : dflt; };
    H.pick = pick;
    const seatName = id => { const p = S.g && S.g.seat(id); if (p) return p.name; const h = humans().find(x => x.id === id); return h ? h.name : '?'; };

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
      const house = seated.length < 2 ? [{ name: HOUSE[sides[1]].name, house: true, level: houseLevel(), side: sides[1] }] : [];
      return { seated, house, side: S.opts.sideRandom ? 'R' : S.opts.side, pace: S.opts.pace, level: S.opts.level, sound: S.opts.sound, optional: S.opts.optional, mode: S.opts.mode,
        watching: hs.slice(2).map(s => ({ id: s.id, name: s.name, hex: s.hex })) };
    };
    H.canStart = () => humans().length >= 1 && !(env.evicted && env.evicted());
    H.setOpt = function (key, value) {
      if (S.screen !== 'lobby') return false;
      if (key === 'side') { if (['SU', 'US', 'R'].indexOf(value) < 0) return false; S.opts.sideRandom = value === 'R'; S.opts.side = value === 'R' ? (Math.random() < 0.5 ? 'SU' : 'US') : value; }
      else if (key === 'pace') { if (!T.paceMs[value]) return false; S.opts.pace = value; }
      else if (key === 'level') { if (E.LEVELS.indexOf(value) < 0) return false; S.opts.level = value; }
      else if (key === 'optional') S.opts.optional = value === true || value === 'on';
      else if (key === 'mode') { if (value !== 'play' && value !== 'learn') return false; S.opts.mode = value; }
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
      if (S.opts.sideRandom) S.opts.side = Math.random() < 0.5 ? 'SU' : 'US';
      const lv = H.lobbyView();
      const players = lv.seated.map(p => ({ id: p.id, name: p.name, hex: D.SIDE[p.side].hex, side: p.side }))
        .concat(lv.house.map(b => ({ id: 'house' + b.side, name: b.name, hex: D.SIDE[b.side].hex, bot: true, level: houseLevel(), side: b.side })));
      const sd = seed == null ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed;
      begin({ players, seed: sd, show: true, optional: S.opts.optional, teach: S.opts.mode === 'learn' }, []);
      if (env.onStart) env.onStart();
      return true;
    };
    function begin(createOpts, moves) {
      S.createOpts = createOpts;
      S.g = E.create(createOpts);
      S.moves = []; S.undoFloor = 0; S.undone = null;
      S.finale = null; S.reelAt = 0; S.dice = null; S.tbl = null; S.timed = null; S.heldTo = 0;
      S.gameOpts = Object.assign({}, S.opts);
      S.pay = null; S.banked = false; S.thinking = {}; S.stateKey = '';
      S.screen = 'play';
      if (moves && moves.length) replayInto(S.g, moves);
      H.afterChange();
    }
    H.resetToLobby = function () {
      bankNow();
      S.finale = null;
      S.g = null; S.screen = 'lobby'; S.pay = null; S.gameOpts = null; S.createOpts = null; S.moves = [];
      S.tbl = null; S.dice = null; S.timed = null;
      if (env.save) env.save(null);
      changed();
    };
    /* The season (hub only): £10,000 to the winner; the other side £1,000 and
       £200 for each battleground it holds at the end. A draw pays £5,000 each. */
    function settle() {
      const g = S.g;
      if (!g || g.phase !== 'over' || S.pay) return;
      const R = g.result;
      S.pay = R.rows.map(r => ({
        id: r.id, name: r.name, bot: r.bot,
        winnings: !R.side ? 5000 : r.won ? 10000 : 1000 + 200 * r.bg,
        place: !R.side ? 1 : r.won ? 1 : 2,
        detail: (!R.side ? 'drew the Cold War' : r.won ? 'won the Cold War' : 'lost the Cold War') + ' as the ' + D.SIDE[r.side].name + ', ' + r.bg + ' battlegrounds held'
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
    function untold(log) {
      if (revealed() || !S.g || S.g.phase !== 'over') return log;
      return log.filter(e => e.t !== 'over');
    }
    H.untold = untold;
    /* While the dice are rolling, their faces are nobody's business — not the
       hold's, not any phone's (LESSONS-CHECKLIST C, "dice are a secret until
       they land"). The result's log lines only come after the hold. */
    function hideDice(game) {
      if (!game || !S.dice || S.dice.landed) return game;
      if (game.hold && game.hold.rolls) game.hold = Object.assign({}, game.hold, { rolls: game.hold.rolls.map(r => ({ side: r.side, mod: r.mod })), net: null });
      return game;
    }
    H.hideDice = hideDice;
    H.publicView = function () {
      const g = S.g;
      let game = g ? g.publicView() : null;
      if (game && !revealed()) { game.result = null; game.log = untold(game.log); }
      return hideDice(game);
    };
    H.publicMsg = function () {
      return Object.assign({
        t: 'ts', screen: S.screen, remote: remote(), solo,
        opts: S.gameOpts || S.opts,
        lobby: S.screen === 'lobby' ? H.lobbyView() : null,
        game: H.publicView(),
        hurry: hurryView(),
        tbl: tblView(),
        dice: S.dice ? { n: S.dice.n, landed: S.dice.landed } : null,
        timed: S.timed ? { n: S.timed.n, k: S.timed.k } : null,
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
      env.toSeat(id, { t: 'ts-me', me, undo: undoInfo(id), coach });
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
        else if (S.dice) diceDone(S.dice);
        else if (S.timed) timedDone(S.timed);
        return;
      }
      const g = S.g;
      if (!g) return;
      if (msg.t === 'hurry') { if (from === holder) hurry(); return; }
      if (msg.t === 'cont') { tblContinue(from, msg.n); return; }
      if (msg.t === 'nowait') { tblNoWait(from); return; }
      if (msg.t === 'undo') { doUndo(from); return; }
      /* Alone, the phone's "Go on" ends a die or the headline early. */
      if (msg.t === 'goon') {
        if (!solo) return;
        if (S.dice && S.dice.n === +msg.n) { if (!S.dice.landed) landDice(S.dice); else diceDone(S.dice); }
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
      if (a.card != null) out.card = Math.max(0, Math.min(999, +a.card | 0));
      if (a.evFirst != null) out.evFirst = !!a.evFirst;
      if (Array.isArray(a.ids)) out.ids = a.ids.slice(0, 20).map(x => String(x).slice(0, 48));
      if (a.map && typeof a.map === 'object') { out.map = {}; Object.keys(a.map).slice(0, 90).forEach(k => { out.map[String(k).slice(0, 24)] = Math.max(0, Math.min(99, +a.map[k] | 0)); }); }
      return out;
    }

    /* Everything that follows a change of state, in one place. */
    H.afterChange = function () {
      const g = S.g;
      if (!g) { changed(); return; }
      const key = g.prompts.map(p => p.n + p.seat).join(',') + ':' + g.log.length;
      if (key !== S.stateKey) { S.stateKey = key; S.hurryAt = now() + T.hurryMs; S.hurryShown = false; }
      holdWatch();
      if (env.onLog) env.onLog();
      if (g.phase === 'over' && S.screen !== 'over') {
        S.screen = 'over';
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
        const turnish = pr.t === 'turn' || pr.what === 'headline';
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
       other side has answered since, or anything hidden came out: a die, a
       card off the deck, a hold shown, the round moving on.
       ================================================================ */
    function markOf(g) {
      return { turn: g.turn, ar: g.ar, hidden: [g.rngN, g.drawN, g.holdN].join(','), logN: g.log.length };
    }
    H.markOf = markOf;
    function play(g, seat, a, forPhone) {
      const mark = markOf(g);
      const wasAct = g.phase === 'ar';
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
      const same = prev && !prev.note && !prev.rel && prev.seat === m.seat && prev.mark.turn === m.mark.turn && prev.mark.ar === m.mark.ar;
      if (!same) S.undoFloor = S.moves.length - 1;
      if (m.human) S.lastHumanAt = now();
    }
    /* Undo goes back to the start of your own action round: the card you
       played and every step after it, all at once. Holds released since are
       no barrier only if nothing was shown (the hidden mark counts holds). */
    function undoStart(id) {
      const g = S.g;
      if (!g || S.screen !== 'play' || g.hold || g.phase !== 'ar' || !S.createOpts) return -1;
      const nowM = markOf(g);
      for (let k = S.moves.length - 1; k >= S.undoFloor; k--) {
        const m = S.moves[k];
        if (!m || m.note || m.rel || m.seat !== id || !m.human || !m.act) return -1;
        if (nowM.turn !== m.mark.turn || nowM.ar !== m.mark.ar || nowM.hidden !== m.mark.hidden) return -1;
        if (m.kind === 'turn') return k;
      }
      return -1;
    }
    function undoInfo(id) {
      const k = undoStart(id);
      if (k < 0) return null;
      const g = S.g, m = S.moves[k];
      const e = g.log.slice(m.mark.logN).find(x => x.t === 'play');
      return { what: e ? D.CARD[e.card].name + (e.how === 'event' ? ' as its event' : e.how === 'space' ? ' to space' : ' for Ops') : 'your card' };
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
      if (!info) { env.flash(from, 'That can no longer be taken back — a die was rolled, a card drawn or shown, or the other side has moved.', 'bad'); H.sendSeat(from); return; }
      const k0 = undoStart(from);
      const keep = S.moves.slice(0, k0);
      const want = S.moves[k0].mark.logN;
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
        /* Holds the room has already read stay read. */
        while (ng.hold && ng.hold.n <= shown) ng.release();
        if (ng.log.length !== want || ng.hold) throw new Error('the replay came out different');
      } catch (e) {
        env.flash(from, 'Could not take that back (' + e.message + ').', 'bad');
        return;
      }
      S.g = ng; S.moves = keep;
      S.thinking = {}; S.stateKey = ''; S.dice = null; S.timed = null; S.tbl = null;
      const undone = { text: seatName(from) + ' takes back a move: ' + info.what + '.' };
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
      return { v: VERSION, createOpts: S.createOpts, moves: S.moves, opts: S.gameOpts || S.opts, at: Date.now(),
        turn: g ? g.turn : 0, vp: g ? g.vp : 0, defcon: g ? g.defcon : 5, sides: g ? g.players.map(p => ({ name: p.name, side: p.side, bot: p.bot })) : [] };
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
       The engine's holds
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
        const tbl = { n: h.n, k: h.k, waiting, done: [], at: now(), grace: false };
        S.tbl = tbl;
        S.heldTo = Math.max(S.heldTo, h.n);
        S.reelAt = 0;
        if (env.cue) env.cue(h.k === 'score' || h.k === 'final' ? 'gong' : 'chime');
        if (!waiting.length) later(() => { if (S.tbl === tbl) releaseTbl(); }, T.lookMs);
        return;
      }
      if (h.k === 'die') {
        if (S.dice && S.dice.n === h.n) return;
        const dice = { n: h.n, h, landed: false };
        S.dice = dice;
        S.heldTo = Math.max(S.heldTo, h.n);
        if (env.cue) env.cue('rise');
        later(() => landDice(dice), pick(T.tumbleMs, 1100));
        return;
      }
      if (S.timed && S.timed.n === h.n) return;
      const timed = { n: h.n, k: h.k, h };
      S.timed = timed;
      S.heldTo = Math.max(S.heldTo, h.n);
      if (env.cue) env.cue(h.k === 'defcon' ? (h.to <= 2 ? 'sting' : 'thump') : 'flip');
      later(() => timedDone(timed), h.k === 'defcon' ? pick(T.defconMs, 3200) : pick(T.headMs, 4000));
    }
    /* Away from the phone, nothing lands and nothing moves on: the die and
       the headline wait for the screen to come back (F1). */
    const whenSeen = fn => { later(fn, 400); };
    function landDice(dice) {
      if (S.dice !== dice || dice.landed) return;
      if (S.hidden) { whenSeen(() => landDice(dice)); return; }
      dice.landed = true;
      if (env.cue) env.cue(dice.h.what === 'coup' || dice.h.what === 'war' ? 'thump' : 'tick');
      changed();
      later(() => diceDone(dice), pick(T.landMs, 1800));
    }
    function release(n) {
      const g = S.g;
      if (g && g.hold && g.hold.n === n) { g.release(n); S.moves.push({ rel: n }); }
    }
    function diceDone(dice) {
      if (S.dice !== dice || !S.g) return;
      if (S.hidden) { whenSeen(() => diceDone(dice)); return; }
      S.dice = null;
      release(dice.n);
      S.reelAt = Math.max(S.reelAt, now() - pick(T.houseShowMs, 2600) / 2);
      H.afterChange();
    }
    function timedDone(t) {
      if (S.timed !== t || !S.g) return;
      if (S.hidden) { whenSeen(() => timedDone(t)); return; }
      S.timed = null;
      release(t.n);
      H.afterChange();
    }
    function tblView() {
      const t = S.tbl;
      if (!t) return null;
      return { n: t.n, k: t.k, waiting: t.waiting.slice(), done: t.done.slice(), grace: t.grace };
    }
    function tblContinue(from, n) {
      const t = S.tbl;
      /* Continue names the card it was pressed on, or a late tap dismisses
         the next one. */
      if (!t || (n != null && +n !== t.n)) return;
      const i = t.waiting.indexOf(from);
      if (i < 0) return;
      t.waiting.splice(i, 1);
      t.done.push(from);
      if (!t.waiting.length) releaseTbl();
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
       The finale: data for shared/finale.js. The display (the telly, or the
       solo phone) plays it and reports each stage back with H.finaleStage.
       ================================================================ */
    const HOW_TITLE = { vp: '20 victory points', europe: 'Europe falls', defcon: 'Nuclear war', cmc: 'Nuclear war', scoring: 'A scoring card held', wargames: 'Wargames', final: 'The Cold War ends' };
    H.finaleData = function () {
      const g = S.g, R = g.result;
      const fh = R.how === 'final' ? g.log.filter(e => e.t === 'score' && e.final) : [];
      const vpBefore = R.how === 'final' ? R.vp - fh.reduce((t, e) => t + e.net, 0) - (g.china ? D.sgn(g.china) : 0) : 0;
      const cats = R.how === 'final'
        ? [{ key: 'track', label: 'The VP track after turn 10' }].concat(fh.map(e => ({ key: e.r, label: D.REGION[e.r].name }))).concat([{ key: 'china', label: 'The China Card' }])
        : [{ key: 'vp', label: HOW_TITLE[R.how] || 'The end' }];
      const parts = s => {
        if (R.how !== 'final') return { vp: s === 'US' ? Math.max(0, R.vp) : Math.max(0, -R.vp) };
        const o = { track: s === 'US' ? Math.max(0, vpBefore) : Math.max(0, -vpBefore), china: g.china === s ? 1 : 0 };
        fh.forEach(e => { o[e.r] = s === 'US' ? e.us : e.su; });
        return o;
      };
      const tot = o => Object.keys(o).reduce((t, k) => t + o[k], 0);
      const endLine = W.lines(g.log.filter(e => e.t === 'over'), g.publicView(), 0).map(l => l.text)[0] || '';
      return {
        title: HOW_TITLE[R.how] || 'The Cold War ends',
        sub: R.how === 'final' ? 'Every region is scored once more.' : endLine,
        tone: R.how === 'defcon' || R.how === 'cmc' ? 'lightning' : 'fireworks',
        categories: cats,
        players: R.rows.map(r => { const ps = parts(r.side); return { id: r.id, name: D.SIDE[r.side].name, hex: D.SIDE[r.side].hex, side: r.side, parts: ps, total: tot(ps), place: !R.side ? 1 : r.won ? 1 : 2, won: r.won,
          tag: r.name + (r.bot ? ' · house · ' + r.level : '') }; }),
        tiebreak: !R.side ? 'Level on victory points: the Cold War is a draw.' : null,
        places: false, winSmall: R.side ? 'wins the Cold War' : 'a draw',
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
  else root.TSHost = Host;
})(typeof window !== 'undefined' ? window : this);
