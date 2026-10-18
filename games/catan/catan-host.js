'use strict';
/* Catan — the host. Everything the display does that is not paint.
 *
 * LESSONS-CHECKLIST F1 ("a mode, not a fork"): the telly's orchestration,
 * pulled out of catan.html into a module with no DOM. It runs inside the telly
 * page on the hub (catan.html) and inside the phone page when one person plays
 * alone (solo.html, which is also the GitHub Pages build). It owns:
 *
 *   the lobby options        Catan or Cities & Knights, settlers, points, pace
 *   the game                 E.create and every answer through play()
 *   the house                thinking at a fraction of the pace; in solo, a house
 *                            turn waits until its last move could be read
 *   the barbarians           the landing holds the table while it is shown
 *   the crier                every engine event said in words (catan-words.js)
 *   undo                     by replay, back through your own moves while nothing
 *                            hidden has come out (no dice, no card drawn, no steal)
 *   save and resume          the moves list (solo)
 *   the finale stages        the display plays the reveal and reports back
 *
 * It talks through `env`: toAll / toSeat / flash / humans / remote, a timer,
 * and optional hooks (onChange for the telly's repaint, bank, save, onFinale,
 * skipFinale, menu, evicted).
 */
(function (root) {
  const req = n => (typeof module !== 'undefined' && module.exports) ? require('./' + n) : null;
  const D = req('catan-data.js') || root.CatanData;
  const E = req('catan-engine.js') || root.CatanEngine;
  const B = req('catan-bots.js') || root.CatanBots;
  const W = req('catan-words.js') || root.CatanWords;
  const VERSION = 1;

  /* Every wait in one table, so the tests can turn them all down and a house
     player's thinking is always a fraction of the room's pace. */
  function defaultT() {
    return {
      paceMs: { relaxed: 1300, brisk: 650 },
      thinkMin: 0.45, thinkMax: 1.1,
      replyMin: 0.8, replyMax: 2.2,                    // a house player mulling somebody's offer
      offerWaitMs: { relaxed: 9000, brisk: 6000 },     // how long a house offer waits on phones
      attackMs: { relaxed: 6500, brisk: 3600 },
      /* Solo (F1): the landing waits for Continue, or this long. */
      attackSoloMs: 45000,
      /* Solo (F1, "show the house's turns"): a house turn may not start until
         the player has had this long to read the house's previous move. */
      houseShowMs: { relaxed: 2700, brisk: 1500 },
      /* After a phone's move that can still be taken back, the house holds off
         this long (solo only; a room has other people to wait for). */
      undoMs: 3000,
      /* How long the table waits on a phone before the remote holder may play
         the house's move for it. */
      hurryMs: 90000,
      saveMs: 400,
      finaleScale: { relaxed: 1, brisk: 0.7 },
      finaleMul: 1
    };
  }

  function create(env) {
    const solo = !!env.solo;
    const T = Object.assign(defaultT(), env.T || {});
    const now = () => (env.now ? env.now() : Date.now());
    const later = (fn, ms) => (env.timer ? env.timer(fn, ms) : setTimeout(fn, ms));
    const S = {
      screen: 'lobby',
      g: null,
      opts: { ck: false, table: solo ? 4 : 0, vp: 0, pace: solo ? 'brisk' : 'relaxed' },
      gameOpts: null, createOpts: null,
      moves: [], lastHumanAt: 0, undone: null,
      thinking: {},
      stateKey: '',
      hurryAt: 0, hurryShown: false,
      pay: null, banked: false,
      crier: [], cryN: 0, reel: null, reelAt: 0, quiet: false,
      lastRoll: 0,
      attack: null,
      finale: null, finaleN: 0,
      hidden: false, houseAt: []
    };
    const H = { S, T, solo };
    S.T = T;
    const humans = () => env.humans();
    const remote = () => (env.remote ? env.remote() : (humans()[0] ? humans()[0].id : null));
    const pace = () => ((S.gameOpts || S.opts).pace === 'brisk' ? 'brisk' : 'relaxed');
    const paceMs = () => T.paceMs[pace()];
    /* A wait for this pace; 0 is a real answer (the tests use it), not "unset". */
    const pick = (tab, dflt) => { const v = tab && typeof tab === 'object' ? tab[pace()] : tab; return v != null ? v : dflt; };
    H.pace = pace;

    /* ================================================================
       The lobby
       ================================================================ */
    function tableSize() {
      const h = Math.min(4, humans().length);
      const want = S.opts.table || Math.max(3, h, 4);
      return Math.max(3, h, Math.min(4, want));
    }
    /* House colours: never one a phone at the table is already wearing. */
    function near(a, b) {
      const p = x => { const n = parseInt(String(x).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
      return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 110;
    }
    H.lobbyView = function () {
      const hs = humans();
      const size = tableSize();
      const seated = hs.slice(0, 4).map(s => ({ id: s.id, name: s.name, hex: s.hex || '#e8c267' }));
      const taken = seated.map(s => s.hex);
      const free = D.PIECE_COLOURS.filter(c => !taken.some(t => near(t, c)));
      const names = seated.map(s => s.name.toLowerCase());
      const house = D.HOUSE.filter(b => names.indexOf(b.name.toLowerCase()) < 0).slice(0, Math.max(0, size - seated.length))
        .map((b, k) => ({ name: b.name, hex: free[k] || b.hex, house: true }));
      const ck = !!S.opts.ck;
      return {
        seated, house, size, ck,
        watching: hs.slice(4).map(s => ({ id: s.id, name: s.name, hex: s.hex })),
        minSize: Math.max(3, Math.min(4, hs.length)),
        vp: S.opts.vp || (ck ? D.WIN.ck : D.WIN.base),
        vpChoices: ck ? [10, 13, 15] : [8, 10, 12],
        pace: S.opts.pace
      };
    };
    H.canStart = () => humans().length >= 1 && !(env.evicted && env.evicted());
    H.setOpt = function (key, value) {
      if (S.screen !== 'lobby') return false;
      if (key === 'ck') { S.opts.ck = !!+value; S.opts.vp = 0; }
      else if (key === 'table') { const v = +value; if (v >= 3 && v <= 4) S.opts.table = v; else return false; }
      else if (key === 'vp') { const v = +value; if (H.lobbyView().vpChoices.indexOf(v) >= 0) S.opts.vp = v; else return false; }
      else if (key === 'pace') { if (!T.paceMs[value]) return false; S.opts.pace = value; }
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
        .concat(lv.house.map((b, k) => ({ id: 'house' + (k + 1), name: b.name, hex: b.hex, bot: true })));
      S.createOpts = { players, seed: seed == null ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed, opts: { ck: lv.ck, vp: lv.vp, show: true } };
      S.gameOpts = Object.assign({}, S.opts, { table: players.length, vp: lv.vp });
      begin(S.createOpts, []);
      cry((lv.ck ? 'Cities & Knights: ' : '') + 'first to ' + lv.vp + ' points. ' + S.g.players[S.g.first].name + ' places first.');
      H.afterChange();
      return true;
    };
    function fresh(createOpts) {
      const g = E.create(createOpts);
      /* Count every throw of the engine's one rng: a move that used it (dice,
         a steal) cannot be taken back, and neither can one before it. */
      const r0 = g.r;
      g.rN = 0;
      g.r = function () { g.rN++; return r0(); };
      return g;
    }
    function begin(createOpts, moves) {
      if (env.stopFinale) env.stopFinale();
      S.createOpts = createOpts;
      S.g = fresh(createOpts);
      S.moves = []; S.undone = null;
      S.pay = null; S.banked = false; S.crier = []; S.cryN = 0; S.reel = null; S.reelAt = 0;
      S.thinking = {}; S.stateKey = ''; S.lastRoll = 0; S.attack = null; S.finale = null;
      S.screen = 'play';
      if (moves && moves.length) {
        S.quiet = true;
        try { replayInto(S.g, moves); } finally { S.quiet = false; }
      }
    }
    H.resetToLobby = function () {
      if (env.stopFinale) env.stopFinale();
      S.g = null; S.screen = 'lobby'; S.pay = null; S.gameOpts = null; S.createOpts = null; S.moves = [];
      S.attack = null; S.finale = null; S.reel = null; S.crier = [];
      if (env.save) env.save(null);
      changed();
    };

    /* The season (hub only). The first to the target banks £10,000, and
       everybody banks £500 a point — a close second on nine points is worth an
       evening. Banked once the winner has been revealed (H3). */
    function settle() {
      const g = S.g;
      if (!g || g.phase !== 'over' || S.pay) return;
      S.pay = g.result.rows.map(r => ({
        id: r.id, name: r.name, bot: r.bot,
        winnings: (r.won ? 10000 : 0) + 500 * r.vp,
        place: r.place,
        detail: r.vp + ' points' + (r.won ? ', settled Catan' : ', ' + ord(r.place))
      }));
    }
    function bankNow() {
      if (!S.pay || S.banked || solo) return;
      S.banked = true;
      const real = S.pay.filter(p => !p.bot);
      if (real.length && env.bank) env.bank(real.map(p => ({ name: p.name, winnings: p.winnings, place: p.place, detail: p.detail })));
    }
    H.bank = bankNow;
    const ord = k => k + (k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th');
    H.ord = ord;

    /* ================================================================
       Talking to the room
       ================================================================ */
    const revealed = () => !S.finale || S.finale.stage === 'winner' || S.finale.stage === 'table';
    H.revealed = revealed;
    H.publicMsg = function () {
      const g = S.g;
      /* While the reveal is counting, nothing that ranks anybody leaves the
         display: no result rows, no places, no purse (H3). */
      const told = revealed();
      const game = g ? g.publicView() : null;
      if (game && !told) game.result = null;
      return {
        t: 'catan', screen: S.screen, remote: remote(), solo,
        opts: S.gameOpts || S.opts,
        lobby: S.screen === 'lobby' ? H.lobbyView() : null,
        game,
        hurry: hurryView(),
        attack: S.attack ? Object.assign({}, S.attack) : null,
        crier: S.crier.slice(0, 14),
        reel: S.reel ? Object.assign({}, S.reel) : null,
        undone: S.undone ? S.undone.text : null,
        finale: S.finale ? { n: S.finale.n, stage: S.finale.stage, label: S.finale.label || '' } : null,
        pay: S.pay && told ? S.pay.map(p => ({ name: p.name, winnings: p.winnings, detail: p.detail, bot: p.bot })) : null,
        paused: solo && S.hidden
      };
    };
    H.publish = function () {
      env.toAll(H.publicMsg());
      const g = S.g;
      if (g) for (const p of g.players) if (!p.bot) H.sendSeat(p.id);
    };
    /* A seat's own half — its hand, its cards, its question — goes to that seat only. */
    H.sendSeat = function (id) {
      const g = S.g;
      if (!g || g.idx(id) < 0) return;
      env.toSeat(id, { t: 'catan-me', me: g.seatView(id), undo: undoInfo(id) });
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
        if (!solo) return;
        S.hidden = !!msg.hidden;
        if (S.hidden) { flushSave(); changed(); } else { S.thinking = {}; H.afterChange(); }
        return;
      }
      if (S.screen === 'lobby') {
        if (from !== holder) return;
        if (msg.t === 'opt') H.setOpt(String(msg.key), msg.value);
        else if (msg.t === 'start') H.start();
        return;
      }
      if (msg.t === 'again') { if (S.screen === 'over' && from === holder) H.resetToLobby(); return; }
      if (msg.t === 'skipFin') { if (from === holder && S.finale && env.skipFinale) env.skipFinale(); return; }
      /* The remote holder may call a game off — somebody arrived late, it is
         midnight. Nobody banks anything from a game that did not finish. */
      if (msg.t === 'abandon' || msg.t === 'quit') {
        if (S.screen !== 'lobby' && from === holder) { if (S.screen === 'play') cry('The game is called off.'); H.resetToLobby(); }
        return;
      }
      const g = S.g;
      if (!g) return;
      if (msg.t === 'hurry') { if (from === holder) hurry(); return; }
      if (msg.t === 'cont') { if (S.attack && from === holder) attackDone(S.attack.n); return; }
      if (msg.t === 'undo') { doUndo(from); return; }
      if (msg.t === 'do' && msg.a && typeof msg.a === 'object') {
        const r = play(g, from, clean(msg.a));
        if (!r.ok) { env.flash(from, r.why, 'bad'); H.sendSeat(from); return; }
        H.afterChange();
      }
    };
    /* A phone sends the bare order; nothing off the wire is trusted past here. */
    function cardMap(o) {
      const out = {};
      if (!o || typeof o !== 'object') return out;
      for (const k of D.RES.concat(D.COM)) if (Number.isInteger(o[k]) && o[k] > 0 && o[k] < 40) out[k] = o[k];
      return out;
    }
    function clean(a) {
      const out = { t: String(a.t || '').slice(0, 20) };
      const int = k => { if (Number.isInteger(a[k])) out[k] = a[k]; };
      const str = k => { if (a[k] != null && typeof a[k] !== 'object') out[k] = String(a[k]).slice(0, 40); };
      ['at', 'hex', 'offer', 'knight', 'level', 'y', 'r', 'a', 'b', 'to'].forEach(int);
      ['what', 'card', 'with', 'from', 'who', 'type', 'com', 'track', 'deck'].forEach(str);
      if (typeof a.yes === 'boolean') out.yes = a.yes;
      if (a.give != null) out.give = typeof a.give === 'object' ? cardMap(a.give) : String(a.give).slice(0, 12);
      if (a.get != null) out.get = typeof a.get === 'object' ? cardMap(a.get) : String(a.get).slice(0, 12);
      if (Array.isArray(a.to)) out.to = a.to.slice(0, 6).map(String);
      if (Array.isArray(a.res)) out.res = a.res.slice(0, 2).map(String); else if (a.res != null) out.res = String(a.res).slice(0, 12);
      if (Array.isArray(a.cards)) out.cards = a.cards.slice(0, 12).map(String); else if (a.cards && typeof a.cards === 'object') out.cards = cardMap(a.cards);
      return out;
    }
    H.clean = clean;

    /* Everything that follows a change of state, in one place. */
    H.afterChange = function () {
      const g = S.g;
      if (!g) { changed(); return; }
      const key = stateKey(g);
      if (key !== S.stateKey) { S.stateKey = key; S.hurryAt = now() + T.hurryMs; S.hurryShown = false; }
      hearLog();
      if (g.phase === 'over' && S.screen !== 'over') {
        S.screen = 'over';
        settle();
        startFinale();
      }
      attackWatch();
      houseThinks();
      if (env.save && S.createOpts && S.screen !== 'lobby') queueSave();
      changed();
    };
    function stateKey(g) {
      return g.turnNo + ':' + g.prompts.map(p => p.t + p.seat + p.n).join(',') + '|' +
        g.offers.map(o => o.id + ':' + Object.keys(o.replies).map(k => k + (o.replies[k] ? 'y' : 'n')).join('')).join(',') + '|' + (g.hold ? g.hold.t + g.hold.n : '');
    }

    /* The save is the whole move list, so it is written at most every T.saveMs
       (and at once when the phone is put away), not on every change. */
    let saveTimer = null;
    function queueSave() { if (!saveTimer) saveTimer = later(flushSave, T.saveMs); }
    function flushSave() {
      saveTimer = null;
      if (!env.save || !S.createOpts || S.screen === 'lobby') return;
      env.save(S.screen === 'over' && S.finale && S.finale.stage === 'table' ? null : H.saveData());
    }
    H.flushSave = flushSave;

    /* ================================================================
       A phone that has gone quiet — a flat battery, a pocket, somebody in the
       kitchen — would otherwise hold the whole island up. After a while the
       remote holder is offered the house's move for whoever the table is
       waiting on. Nobody else can press it. (Never in solo: there is nobody
       else to wait for.)
       ================================================================ */
    function waitingOn() {
      const g = S.g;
      if (solo || !g || S.screen !== 'play' || g.phase === 'over' || g.hold) return [];
      return g.prompts.filter(p => { const s = g.seat(p.seat); return s && !s.bot; });
    }
    function hurryView() {
      const w = waitingOn();
      if (!w.length || now() < S.hurryAt) return null;
      const ids = Array.from(new Set(w.map(p => p.seat)));
      return { ids, names: ids.map(id => S.g.seat(id).name) };
    }
    H.hurryView = hurryView;
    function hurry() {
      const h = hurryView();
      if (!h) return;
      const g = S.g;
      g.hurried(h.ids);
      S.moves.push({ hurried: h.ids.slice() });
      for (const id of h.ids) {
        const pr = g.promptFor(id);
        if (!pr) continue;
        let a;
        if (pr.t === 'turn') a = pr.stage === 'roll' ? { t: 'roll' } : { t: 'end' };
        else a = B.answer(g.publicView(), g.seatView(id), g.seatView(id).prompt, { waited: true });
        const r = play(g, id, a, true);
        if (!r.ok) play(g, id, fallback(g, pr), true);
      }
      H.afterChange();
    }
    H.tick = function () {
      if (!S.g || S.screen !== 'play') return;
      const show = !!hurryView();
      if (show !== S.hurryShown) { S.hurryShown = show; changed(); }
    };

    /* ================================================================
       The house settlers, deciding from their own seat's view and nothing
       else. Thinking is a fraction of the room's pace, so turning the pace up
       speeds them up with everything else.
       ================================================================ */
    function houseThinks() {
      const g = S.g;
      if (!g || g.phase === 'over' || g.hold || S.hidden) return;
      /* A turn's key carries the state of the offers too: somebody answering a
         house player's offer changes nothing else, and it must still get to see
         the answer. */
      const offers = g.offers.map(o => o.id + ':' + Object.keys(o.replies).map(k => k + (o.replies[k] ? 'y' : 'n')).join('')).join(',');
      for (const pr of g.prompts) {
        const p = g.seat(pr.seat);
        if (!p || !p.bot) continue;
        const key = 'p' + pr.n + ':' + pr.seat + (pr.t === 'turn' ? '|' + offers : '');
        /* Solo: a house turn (and a setup placement) waits until its last
           line could be read; its sub-answers do not. */
        let gap = 0;
        if (solo && (pr.t === 'turn' && pr.stage === 'roll' || pr.t === 'place')) gap = Math.max(0, S.reelAt + pick(T.houseShowMs, 2000) - now());
        if (solo) {
          const last = S.moves[S.moves.length - 1];
          if (last && last.human && undoInfo(last.seat)) gap = Math.max(gap, S.lastHumanAt + T.undoMs - now());
        }
        schedule(key, T.thinkMin, T.thinkMax, gap, () => houseMove(g, pr.seat, pr.n, false));
      }
      /* Offers on the table: a house player answers each one it was asked. */
      for (const o of g.offers) {
        if (o.counter) continue;
        for (const p of g.players) {
          if (!p.bot || p.id === o.by || p.id in o.replies) continue;
          if (o.to && o.to.indexOf(p.id) < 0) continue;
          schedule('o' + o.id + ':' + p.id, T.replyMin, T.replyMax, 0, () => {
            if (S.g !== g || !g.offers.some(x => x.id === o.id) || S.hidden) { S.thinking['o' + o.id + ':' + p.id] = false; return; }
            const r = play(g, p.id, B.reply(g.publicView(), g.seatView(p.id), o));
            if (r.ok) H.afterChange();
          });
        }
      }
    }
    function schedule(key, lo, hi, gap, fn) {
      if (S.thinking[key]) return;
      S.thinking[key] = true;
      const ms = Math.max(gap || 0, paceMs() * (lo + Math.random() * (hi - lo)));
      later(fn, ms);
    }
    function houseMove(g, id, n, waited) {
      if (S.g !== g || g.phase === 'over' || g.hold) return;
      const pr = g.promptFor(id);
      if (!pr || pr.n !== n) return;
      if (S.hidden) { S.thinking = {}; return; }
      const me = g.seatView(id);
      let a = B.answer(g.publicView(), me, me.prompt, { waited });
      if (a.t === 'wait') {
        /* Its own offer is out; give the phones a fair chance to answer. */
        later(() => houseMove(g, id, n, true), pick(T.offerWaitMs, 6000));
        return;
      }
      let r = play(g, id, a);
      /* A house player that is refused must not go silent for ever. */
      if (!r.ok) {
        if (typeof console !== 'undefined') console.warn('house move refused', pr.t, a, r.why);
        r = play(g, id, fallback(g, pr));
      }
      S.houseAt.push({ at: now(), t: pr.t, stage: pr.stage || null, since: now() - S.reelAt });
      if (S.houseAt.length > 300) S.houseAt.shift();
      H.afterChange();
    }
    H.houseMove = houseMove;
    /* Something always acceptable, for when a house player's answer was not. */
    function fallback(g, pr) {
      const me = g.seatView(pr.seat);
      const o = pr.options || [];
      switch (pr.t) {
        case 'turn': return pr.stage === 'roll' ? { t: 'roll' } : { t: 'end' };
        case 'freeRoad': case 'smith': case 'harborOffer': case 'spyTake': case 'treasonPlace': return { t: 'skip' };
        case 'robber': return { t: 'robber', hex: o[0] };
        case 'discard': case 'weddingGive': {
          const cards = {}; let need = pr.need;
          for (const k of Object.keys(me.hand)) { const n = Math.min(need, me.hand[k]); if (n) { cards[k] = n; need -= n; } }
          return { t: 'discard', cards };
        }
        case 'progDiscard': return { t: 'discard', cards: me.prog.slice(0, pr.need) };
        case 'plenty': return { t: 'pick', res: [o[0], o[0]] };
        case 'aqueduct': return { t: 'pick', res: D.RES.find(k => g.bank[k] > 0) || 'ore' };
        case 'defDeck': return { t: 'deck', deck: o[0] };
        case 'duesTake': { const cards = {}; let need = pr.need; for (const k of Object.keys(pr.hand)) { const n = Math.min(need, pr.hand[k]); if (n) { cards[k] = n; need -= n; } } return { t: 'take', cards }; }
        case 'alchemy': return { t: 'dice', y: 3, r: 5 };
        case 'invention': return { t: 'swap', a: o[0], b: o[1] };
        default: return { t: 'x', at: o[0], hex: o[0], from: o[0], who: o[0], knight: o[0], res: o[0], com: o[0], type: o[0], track: o[0], deck: o[0] };
      }
    }
    H.fallback = fallback;

    /* ================================================================
       Every answer goes through here, so the game is its moves.
       ================================================================ */
    const TWO_PARTY = ['deal', 'reply'];
    function hiddenMark(g) {
      return g.rN + ':' + g.devDeck.length + ':' + g.decks.trade.length + ',' + g.decks.politics.length + ',' + g.decks.science.length;
    }
    function play(g, seat, a, forPhone) {
      const before = hiddenMark(g);
      const r = g.act(seat, a);
      if (r && r.ok && g === S.g) {
        const p = g.seat(seat);
        const human = !!p && !p.bot && !forPhone;
        S.moves.push({ seat: String(seat), a: JSON.parse(JSON.stringify(a)), human, hid: before, turn: g.turnNo });
        if (human) S.lastHumanAt = now();
      }
      return r;
    }
    H.play = play;
    function replayInto(ng, moves) {
      for (const m of moves) {
        if (m.rel) { ng.release(m.rel); S.moves.push(m); continue; }
        if (m.hurried) { ng.hurried(m.hurried); S.moves.push(m); continue; }
        const r = ng.act(m.seat, m.a);
        if (!r.ok) throw new Error(r.why);
        S.moves.push(m);
      }
    }

    /* Taking a move back — by replay. Only your own last move, only while
       nothing hidden has come out since it was made (the move itself rolled
       no dice, drew no card, robbed nobody), and never a trade another player
       agreed to. Walks back move by move through your turn. */
    function undoInfo(id) {
      const g = S.g;
      if (!g || S.screen !== 'play' || g.phase === 'over' || g.hold || !S.createOpts || S.attack) return null;
      const m = S.moves[S.moves.length - 1];
      if (!m || !m.seat || m.seat !== id || !m.human) return null;
      if (TWO_PARTY.indexOf(m.a.t) >= 0) return null;
      if (hiddenMark(g) !== m.hid) return null;
      return { what: moveWords(m) };
    }
    H.undoInfo = undoInfo;
    function moveWords(m) {
      const a = m.a;
      switch (a.t) {
        case 'build': return 'the ' + (a.what === 'wall' ? 'city wall' : a.what);
        case 'place': return 'that placement';
        case 'road': return 'that road';
        case 'end': return 'ending your turn';
        case 'bank': return 'the trade with the bank';
        case 'offer': case 'counter': return 'your offer';
        case 'withdraw': return 'withdrawing your offer';
        case 'improve': return 'the city improvement';
        case 'activate': case 'promote': return 'the knight';
        case 'kmove': case 'displace': return 'the knight’s move';
        case 'play': return 'playing ' + (S.g.ck ? D.progName(a.card) : (D.DEV[a.card] ? D.DEV[a.card].name : 'that card'));
        case 'discard': return 'the discard';
        case 'robber': return 'moving the robber';
      }
      return 'your last move';
    }
    function doUndo(from) {
      const info = undoInfo(from);
      if (!info) { env.flash(from, 'That can no longer be taken back — dice have rolled, a card has been drawn, or someone else has moved since.', 'bad'); H.sendSeat(from); return; }
      const keep = S.moves.slice(0, -1);
      const old = { g: S.g, moves: S.moves, crier: S.crier, cryN: S.cryN };
      try {
        S.g = fresh(S.createOpts);
        S.moves = []; S.crier = []; S.cryN = 0;
        S.quiet = true;
        replayInto(S.g, keep);
        hearLog();
      } catch (e) {
        S.g = old.g; S.moves = old.moves; S.crier = old.crier; S.cryN = old.cryN;
        env.flash(from, 'Could not take that back (' + e.message + ').', 'bad');
        return;
      } finally { S.quiet = false; }
      S.thinking = {}; S.stateKey = '';
      const name = (S.g.seat(from) || {}).name || '?';
      const undone = { text: name + ' takes back ' + info.what + '.' };
      S.undone = undone;
      later(() => { if (S.undone === undone) { S.undone = null; changed(); } }, 4000);
      for (const p of S.g.players) if (!p.bot && p.id !== from) env.flash(p.id, name + ' took back a move.', 'bad');
      H.afterChange();
    }
    H.doUndo = doUndo;

    /* ================================================================
       Save and resume (solo): the game is its options and its answers.
       ================================================================ */
    H.saveData = function () {
      const g = S.g;
      return { v: VERSION, createOpts: S.createOpts, moves: S.moves, opts: S.gameOpts || S.opts, at: Date.now(),
        turnNo: g ? g.turnNo : 0, ck: g ? g.ck : false, target: g ? g.target : 0,
        names: g ? g.players.map(p => p.name) : [], vps: g ? g.players.map(p => g.publicVP(p)) : [] };
    };
    H.resume = function (data) {
      if (!data || !data.createOpts) return false;
      try {
        S.opts = Object.assign({}, S.opts, data.opts || {});
        S.gameOpts = Object.assign({}, data.opts || S.opts);
        begin(data.createOpts, data.moves || []);
        /* A landing that was showing when the phone closed: show it again. */
        H.afterChange();
        return true;
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('resume failed', e);
        S.g = null; S.screen = 'lobby';
        return false;
      }
    };

    /* ================================================================
       The barbarians land — the table holds while it is shown.
       ================================================================ */
    function attackWatch() {
      const g = S.g;
      if (!g || !g.hold || g.hold.t !== 'attack') return;
      if (S.attack && S.attack.n === g.hold.n) return;
      const L = g.lastAttack;
      const pub = g.publicView();
      const best = Math.max.apply(null, pub.players.map(x => L.contrib[x.id] || 0));
      const tops = pub.players.filter(p => (L.contrib[p.id] || 0) === best);
      const n = g.hold.n;
      S.attack = {
        n, stage: 'show', barb: L.barb, def: L.def, win: !!L.win,
        rows: pub.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, n: L.contrib[p.id] || 0 })),
        verdict: L.win
          ? 'Catan holds! ' + (tops.length === 1 ? tops[0].name + ' is the Defender of Catan.' : 'A shared defence: ' + tops.map(p => p.name).join(' and ') + ' each draw a progress card.')
          : 'Catan falls — the weakest defenders lose a city.'
      };
      const ms = pick(T.attackMs, 5000);
      later(() => { if (S.attack && S.attack.n === n && S.attack.stage === 'show') { S.attack.stage = 'verdict'; changed(); } }, ms * 0.45);
      later(() => attackDone(n), solo ? Math.max(ms, T.attackSoloMs) : ms);
    }
    function attackDone(n) {
      const g = S.g;
      if (!S.attack || S.attack.n !== n) return;
      S.attack = null;
      if (g && g.hold && g.hold.t === 'attack') {
        g.release('attack');
        S.moves.push({ rel: 'attack' });
      }
      S.reelAt = now();
      H.afterChange();
    }
    H.attackDone = attackDone;

    /* ================================================================
       The crier: every engine event, said once.
       ================================================================ */
    function hearLog() {
      const g = S.g;
      if (!g) return;
      for (const e of g.log) {
        if (e.__seen) continue;
        Object.defineProperty(e, '__seen', { value: true, enumerable: false });
        const w = W.line(g, e);
        if (w) cry(w, e.by || e.a || null, e.t);
        if (e.t === 'roll' && !S.quiet) {
          /* The telly's dice shake for a moment. A flag cleared on a timer,
             not a clock read while painting, so two paints of the same state
             are the same (the e2e's privacy guard compares them). */
          const n = S.lastRoll = (S.lastRoll || 0) + 1;
          S.rollFresh = true;
          later(() => { if (S.lastRoll === n && S.rollFresh) { S.rollFresh = false; changed(); } }, 700);
        }
      }
    }
    function cry(text, by, t) {
      const line = { i: ++S.cryN, text, by: by || null, t: t || '' };
      S.crier.unshift(line);
      S.crier = S.crier.slice(0, 40);
      if (S.quiet) return;
      /* Solo: the newest line by the house is "just now", and the house's next
         turn waits until it could be read. */
      const p = by && S.g ? S.g.seat(by) : null;
      if (p && p.bot) { S.reel = { i: line.i, text, by, hex: p.hex }; S.reelAt = now(); }
      else if (p && !p.bot && t === 'roll') S.reel = null;
    }
    H.cry = cry;

    /* ================================================================
       The winner reveal (docs/LESSONS-CHECKLIST.md H3, shared/finale.js).
       The island freezes and the display counts it the way the book does —
       settlements, cities, the road and the army — with the victory point
       cards that sat face down all game turned over last.
       ================================================================ */
    /* A settler wins only on their own turn — so somebody else may stand
       level, or even ahead (a Defender of Catan handed out on another
       player's turn). */
    function tiebreakLine(R) {
      const w = R.rows.find(r => r.won);
      const level = R.rows.filter(r => !r.won && r.vp >= w.vp);
      if (!level.length) return null;
      return level.map(r => r.name).join(' and ') + (level.length > 1 ? ' have ' : ' has ') + w.vp + (level.some(r => r.vp > w.vp) ? ' or more' : '') +
        ' too — but Catan is won only on your own turn, and it was ' + w.name + '’s.';
    }
    H.finaleData = function () {
      const g = S.g, R = g.result;
      const by = id => R.rows.find(r => r.id === id);
      const cats = g.ck
        ? [{ key: 'settlements', label: 'Settlements' }, { key: 'cities', label: 'Cities' }, { key: 'metros', label: 'Metropolises' },
           { key: 'longest', label: 'The Longest Road' }, { key: 'defender', label: 'Defenders of Catan' }, { key: 'merchant', label: 'The merchant' },
           { key: 'cards', label: 'Victory point cards' }]
        : [{ key: 'settlements', label: 'Settlements' }, { key: 'cities', label: 'Cities' }, { key: 'longest', label: 'The Longest Road' },
           { key: 'largest', label: 'The Largest Army' }, { key: 'cards', label: 'Victory point cards' }];
      return {
        title: g.ck ? 'The barbarians are held off for good' : 'Catan is settled',
        sub: 'First to ' + g.target + ' points. Every one of them, counted the way the book does.',
        tone: 'fireworks',
        categories: cats,
        decider: g.ck ? null : 'cards',
        deciderLine: 'And last, the cards that sat face down all game',
        players: g.players.map(p => {
          const r = by(p.id);
          return { id: p.id, name: p.name, hex: p.hex, parts: r.parts, total: r.vp, place: r.place, won: r.won, tag: p.bot ? 'house' : '' };
        }),
        tiebreak: tiebreakLine(R),
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

  const Host = { VERSION, create, defaultT };
  if (typeof module !== 'undefined' && module.exports) module.exports = Host;
  else root.CatanHost = Host;
})(typeof window !== 'undefined' ? window : this);
