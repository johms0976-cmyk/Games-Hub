'use strict';
/* Android: Netrunner — the host. Everything the display does that is not paint.
 *
 * LESSONS-CHECKLIST F1 ("a mode, not a fork"; Glory to Rome's and Kemet's
 * shape): this file runs inside the telly page on the hub (netrunner.html) and
 * inside the phone page when one person plays alone (solo.html). It owns:
 *
 *   the lobby options     who plays which side, the two decks, the house's
 *                         level, the points to win, pace, sound
 *   the game              E.create and every answer through play()
 *   the house             thinking at a fraction of the pace, never before the
 *                         room has read the house's last move
 *   the holds             the opening card (Continue on every phone); the
 *                         engine's shows — a turn's banner, an ice rezzed, what
 *                         a run accessed, an agenda scored or stolen, a trace,
 *                         damage, an expose, a run stopped — on a timer or Skip
 *   undo                  by replay, back through your own answers
 *   save and resume       the moves list (solo)
 *   the finale stages     the display plays the reveal and reports back
 *   how to play           (nr-learn.js) lesson cards on the table hold, a coach in
 *                         the learner's own message, a gentle house, no reveal
 *   the campaign          Terminal Directive (nr-campaign.js): a run of games
 *                         that remembers itself through env.campaignLoad/Save
 *
 * It talks through `env`: toAll / toSeat / flash / humans / remote, a timer,
 * and optional hooks (onChange, bank, save, onFinale, skipFinale, menu).
 */
(function (root) {
  const req = n => (typeof module !== 'undefined' && module.exports) ? require('./' + n) : null;
  const D = req('nr-data.js') || root.NrData;
  const E = req('nr-engine.js') || root.NrEngine;
  const B = req('nr-bots.js') || root.NrBots;
  const W = req('nr-words.js') || root.NrWords;
  const CP = req('nr-campaign.js') || root.NrCampaign;
  const LN = req('nr-learn.js') || root.NrLearn;
  const VERSION = 1;

  /* Every wait in one table; the tests turn them all down. */
  function defaultT() {
    return {
      paceMs: { slow: 2400, relaxed: 1400, brisk: 700 },
      thinkMin: 0.45, thinkMax: 1.05,
      /* A house action may not start until the room has had this long to read
         the house's previous one (F1, "show the house's turns"). */
      houseShowMs: { slow: 3200, relaxed: 2400, brisk: 1400 },
      /* A house answer inside an action (a target, a rez, a break). */
      houseActMs: { slow: 1500, relaxed: 1000, brisk: 550 },
      showMs: {
        turn: { slow: 1800, relaxed: 1300, brisk: 800 },
        rez: { slow: 3000, relaxed: 2300, brisk: 1400 },
        access: { slow: 4200, relaxed: 3200, brisk: 2000 },
        score: { slow: 4200, relaxed: 3200, brisk: 2100 },
        trace: { slow: 3600, relaxed: 2800, brisk: 1700 },
        damage: { slow: 3600, relaxed: 2800, brisk: 1700 },
        expose: { slow: 3200, relaxed: 2500, brisk: 1500 },
        runend: { slow: 2600, relaxed: 2000, brisk: 1200 },
        psi: { slow: 3400, relaxed: 2600, brisk: 1600 }
      },
      hurryMs: 90000, holdGraceMs: 20000, lookMs: 6000, undoMs: 5000, saveMs: 400,
      finaleScale: { slow: 1.3, relaxed: 1, brisk: 0.7 }, finaleMul: 1
    };
  }
  const HOUSE = { corp: { name: 'Haas Control' }, runner: { name: 'Ghost' } };
  const HOUSE_NAMES = { corp: { hb: 'Haas Control', jinteki: 'Jinteki Board', nbn: 'NBN Desk', weyland: 'Weyland Board' }, runner: { anarch: 'Noise', criminal: 'Gabriel', shaper: 'Kate' } };
  const TABLE_HOLDS = { open: 1 };
  const SIDE_HEX = { corp: '#b3c4d8', runner: '#ff8a5c' };   /* house colours, clear of the hub's seat palette */

  function create(env) {
    const T = Object.assign(defaultT(), env.solo ? { undoMs: 3500 } : {}, env.T || {});
    const solo = !!env.solo;
    const now = () => (env.now ? env.now() : Date.now());
    const later = (fn, ms) => (env.timer ? env.timer(fn, ms) : setTimeout(fn, ms));
    const S = {
      screen: 'lobby', g: null,
      opts: { side: 'runner', corp: 'random', runner: 'random', level: 'medium', win: 7, pace: solo ? 'brisk' : 'relaxed', sound: !solo, pool: 'one', sets: D.setKey('all'), mode: 'game' },
      campaign: null, campaignLines: null, learnSeen: [], lessonN: 0, learnDone: false,
      decks: {},
      gameOpts: null, createOpts: null, moves: [], undoFloor: 0, lastHumanAt: 0, undone: null,
      thinking: {}, stateKey: '', hurryAt: 0, hurryShown: false, promptAt: {},
      table: null, show: null, heldTo: 0, reelAt: 0,
      finale: null, finaleN: 0, pay: null, banked: false, hidden: false, startedAt: 0, houseAt: []
    };
    const H = { S, T, solo };
    /* The campaign remembers itself (the telly's or the phone's own storage). */
    function loadCampaign() { let c = null; try { c = env.campaignLoad ? env.campaignLoad() : null; } catch (e) { c = null; } S.campaign = c && c.v === 1 ? c : CP.fresh(); }
    function saveCampaign() { try { if (env.campaignSave) env.campaignSave(S.campaign); } catch (e) { /* storage refused: the campaign lasts this session */ } }
    loadCampaign();
    const humans = () => env.humans();
    const remote = () => (env.remote ? env.remote() : (humans()[0] ? humans()[0].id : null));
    const pace = () => (S.gameOpts || S.opts).pace;
    const paceMs = () => T.paceMs[pace()] || T.paceMs.relaxed;
    /* A wait for this pace; 0 is a real answer (the tests use it), not "unset". */
    const pick = (tab, dflt) => { const v = tab ? tab[pace()] : null; return v != null ? v : dflt; };
    const seatName = id => { const p = S.g && S.g.seat(id); if (p) return p.name; const h = humans().find(x => x.id === id); return h ? h.name : '?'; };

    /* ================================================================
       The lobby: two chairs. The first phone takes the side chosen; a
       second phone takes the other; otherwise the house does.
       ================================================================ */
    /* A phone's own deck, as the lobby may say it: its name and identity, never
       its cards; and whether it can be used on the side that phone now sits. */
    function deckView(id, side) {
      const d = S.decks[id];
      if (!d) return null;
      const ident = D.CARDS[d.ident];
      const bad = ident.side !== side ? 'a ' + (ident.side === 'corp' ? 'Corp' : 'Runner') + ' deck — the starter deck is used' : (D.checkDeck(d, S.opts.pool, S.opts.sets)[0] || null);
      return { name: d.name, ident: d.ident, fac: ident.fac, n: D.deckStats(d).n, bad };
    }
    H.lobbyView = function () {
      const hs = humans();
      const first = S.opts.side, other = first === 'corp' ? 'runner' : 'corp';
      const seated = [];
      if (hs[0]) seated.push({ id: hs[0].id, name: hs[0].name, side: first, hex: hs[0].hex || SIDE_HEX[first], deck: deckView(hs[0].id, first) });
      if (hs[1]) seated.push({ id: hs[1].id, name: hs[1].name, side: other, hex: hs[1].hex || SIDE_HEX[other], deck: deckView(hs[1].id, other) });
      const house = [];
      if (seated.length < 2) house.push({ side: other, name: houseName(other), house: true, level: S.opts.level, hex: SIDE_HEX[other] });
      return { seated, house, side: first, corp: S.opts.corp, runner: S.opts.runner, level: S.opts.level, win: S.opts.win, pace: S.opts.pace, sound: S.opts.sound, pool: S.opts.pool, sets: S.opts.sets,
        mode: S.opts.mode, campaign: { lines: CP.describe(S.campaign), games: S.campaign.games, done: S.campaign.done, ethos: { corp: S.campaign.corp.ethos, runner: S.campaign.runner.ethos }, finale: CP.finale(S.campaign) },
        watching: hs.slice(2).map(s => ({ id: s.id, name: s.name, hex: s.hex })) };
    };
    function houseName(side) { const f = S.opts[side]; return (HOUSE_NAMES[side] || {})[f] || HOUSE[side].name; }
    H.canStart = () => humans().length >= 1 && !(env.evicted && env.evicted());
    const FACS = { corp: D.CORPS, runner: D.RUNNERS };
    H.setOpt = function (key, value) {
      if (S.screen !== 'lobby') return false;
      if (key === 'side') { if (value !== 'corp' && value !== 'runner') return false; S.opts.side = value; }
      else if (key === 'corp' || key === 'runner') { if (value !== 'random' && FACS[key].indexOf(value) < 0) return false; S.opts[key] = value; }
      else if (key === 'level') { if (E.LEVELS.indexOf(value) < 0) return false; S.opts.level = value; }
      else if (key === 'win') { const n = +value; if ([5, 6, 7].indexOf(n) < 0) return false; S.opts.win = n; }
      else if (key === 'pace') { if (!T.paceMs[value]) return false; S.opts.pace = value; }
      else if (key === 'sound') S.opts.sound = value === true || value === 'on';
      else if (key === 'pool') { if (value !== 'one' && value !== 'three') return false; S.opts.pool = value; }
      else if (key === 'sets') { if (typeof value !== 'string' || value.length > 200) return false; S.opts.sets = D.setKey(value); }
      else if (key === 'mode') { if (value !== 'game' && value !== 'campaign' && value !== 'learn') return false; S.opts.mode = value; }
      else if (key === 'ethos') {
        const [side, eth] = String(value).split(':');
        if (!S.campaign[side] || !CP.ETHOS[eth] || side === 'cautions' || S.campaign.games) return false;
        S.campaign[side].ethos = eth; saveCampaign();
      }
      else if (key === 'campaign') { if (value !== 'new') return false; S.campaign = CP.fresh(); saveCampaign(); }
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
      seed = seed == null ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed;
      const r = E.rngFrom(seed ^ 0x5eed);
      const camp = S.opts.mode === 'campaign', learn = S.opts.mode === 'learn';
      if (camp && S.campaign.done) return false;
      const facList = side => camp ? CP.FACS[side] : FACS[side];
      const fac = side => facList(side).indexOf(S.opts[side]) >= 0 ? S.opts[side] : facList(side)[Math.floor(r() * facList(side).length)];
      const corp = learn ? LN.DECKS.corp : fac('corp'), runner = learn ? LN.DECKS.runner : fac('runner');
      /* A phone's own deck, if it is for the side that phone plays and legal for the pool. */
      let decks = {};
      if (camp) {
        const own = {};
        for (const p of lv.seated) if (S.decks[p.id]) own[p.side] = S.decks[p.id];
        for (const side of ['corp', 'runner']) if (!S.campaign[side].ethos) S.campaign[side].ethos = 'protector';
        saveCampaign();
        decks = CP.decksFor(S.campaign, { corp, runner }, own);
      } else if (!learn) for (const p of lv.seated) if (p.deck && !p.deck.bad) decks[p.side] = JSON.parse(JSON.stringify(S.decks[p.id]));
      const players = lv.seated.map(p => ({ id: p.id, name: p.name, hex: p.hex, side: p.side }))
        .concat(lv.house.map(b => ({ id: 'house', name: (HOUSE_NAMES[b.side] || {})[b.side === 'corp' ? corp : runner] || b.name, hex: b.hex, side: b.side, bot: true, level: learn ? 'gentle' : S.opts.level })));
      if (players.length !== 2) return false;
      S.createOpts = { players, seed, corp: decks.corp ? D.CARDS[decks.corp.ident].fac : corp, runner: decks.runner ? D.CARDS[decks.runner.ident].fac : runner, win: learn ? LN.WIN : camp ? (CP.finale(S.campaign) ? 9 : 7) : S.opts.win, show: true, decks, campaign: camp, learn };
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
      S.learnSeen = S.pendingSeen || []; S.pendingSeen = null; S.lessonN = 0; S.learnDone = false;
      S.gameOpts = Object.assign({}, S.opts);
      S.screen = 'play';
      S.startedAt = now();
      if (moves && moves.length) replayInto(S.g, moves);
      H.afterChange();
    }
    H.resetToLobby = function () {
      bankNow();
      if (S.createOpts && S.createOpts.learn) S.opts.mode = 'game';
      S.g = null; S.screen = 'lobby'; S.pay = null; S.gameOpts = null; S.createOpts = null; S.moves = []; S.campaignLines = null; S.learnDone = false;
      S.table = null; S.show = null; S.finale = null;
      if (env.save) env.save(null);
      changed();
    };
    /* The season (hub only): £2,000 an agenda point; the winner £10,000 more. */
    function settle() {
      const g = S.g;
      if (!g || g.phase !== 'over' || S.pay) return;
      if (S.createOpts && S.createOpts.learn) { S.learnDone = true; return; }
      /* A campaign game is written into the campaign once (a resumed save is not counted twice). */
      if (S.createOpts && S.createOpts.campaign && S.campaign.recorded !== S.createOpts.seed) {
        const r = CP.record(S.campaign, g);
        S.campaign = r.state; S.campaign.recorded = S.createOpts.seed; S.campaignLines = r.lines;
        saveCampaign();
      }
      const R = g.result;
      S.pay = R.rows.map(r => ({ id: r.id, name: r.name, bot: r.bot, place: r.place,
        winnings: 2000 * r.points + (r.won ? 10000 : 0), detail: r.points + ' agenda point' + (r.points === 1 ? '' : 's') + ' as the ' + (r.side === 'corp' ? 'Corp' : 'Runner') + (r.won ? ' — the winner' : '') }));
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
        t: 'nr', screen: S.screen, remote: remote(), solo,
        opts: S.gameOpts || S.opts,
        lobby: S.screen === 'lobby' ? H.lobbyView() : null,
        game, table: tableView(), show: S.show ? Object.assign({}, S.show) : null,
        hurry: hurryView(), undone: S.undone ? S.undone.text : null,
        finale: S.finale ? { n: S.finale.n, stage: S.finale.stage, label: S.finale.label || '' } : null,
        pay: S.pay && revealed() ? S.pay.map(p => ({ name: p.name, winnings: p.winnings, detail: p.detail, bot: p.bot })) : null,
        paused: solo && S.hidden,
        learnDone: S.learnDone,
        campaignNotes: S.screen === 'over' && S.createOpts && S.createOpts.campaign && revealed() ? (S.campaignLines || []).concat(CP.describe(S.campaign)) : null
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
      env.toSeat(id, { t: 'nr-me', me: g.seatView(id), undo: undoInfo(id), coach: coachFor(id) });
    };
    function changed() { if (env.onChange) env.onChange(); H.publish(); }
    /* How to play: the house's own answer for this seat, worked out from its view
       alone, sent to that seat only. */
    function coachFor(id) {
      const g = S.g;
      if (!g || !S.createOpts || !S.createOpts.learn || g.phase === 'over' || S.table || g.hold) return null;
      const me = g.seatView(id);
      const pr = me && me.prompt;
      if (!pr) return null;
      try {
        const a = B.answer(g.publicView(), me, pr);
        if (!a) return null;
        const opt = id => (pr.options || []).find(o => o.id === id);
        let label = a.t === 'skip' ? (pr.skip || 'Skip') : a.ids ? (a.ids.length ? a.ids.map(x => (opt(x) || {}).label || x).join(', ') : 'None of them') : ((opt(a.id) || {}).label || a.id);
        if (a.t === 'turn' && a.id === 'end') label = 'End the turn';
        if (a.t === 'enc' && a.id === 'done') label = (opt('done') || {}).label || 'Let it fire';
        return { n: pr.n, a, label: String(label) };
      } catch (e) { return null; }
    }
    /* How to play: a lesson card for the learner's open question, held like the opening card. */
    function lessonCheck() {
      const g = S.g;
      if (!g || !S.createOpts || !S.createOpts.learn || g.phase === 'over' || S.table || S.show || g.hold || S.screen !== 'play') return;
      const learner = g.players.find(p => !p.bot);
      if (!learner) return;
      const L = LN.next(g.publicView(), g.seatView(learner.id), S.learnSeen);
      if (!L) return;
      S.learnSeen.push(L.id);
      S.lessonN++;
      S.table = { n: -S.lessonN, k: 'lesson', id: 'lesson-' + L.id, waiting: [learner.id], done: [], at: now(), grace: false, lesson: L };
    }

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
      if (S.screen === 'lobby' && msg.t === 'deck') { setDeck(from, msg.deck); return; }
      if (S.screen === 'lobby') {
        if (from !== holder) return;
        if (msg.t === 'opt') H.setOpt(msg.key, msg.value);
        else if (msg.t === 'start') H.start();
        return;
      }
      if (msg.t === 'again') { if (S.screen === 'over' && from === holder) H.resetToLobby(); return; }
      if (msg.t === 'skip') {
        if (S.finale && env.skipFinale) { if (from === holder) env.skipFinale(); }
        else if (S.show && (from === holder || solo)) showDone(S.show.n);
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
        if (S.table) { env.flash(from, S.table.k === 'lesson' ? 'Read the lesson first, then tap Continue.' : 'Everyone is reading the opening card first. Tap Continue.', 'bad'); H.sendSeat(from); return; }
        if (g.hold) { env.flash(from, solo ? 'One moment — it is being shown.' : 'Watch the telly first.', 'bad'); H.sendSeat(from); return; }
        const r = play(g, from, clean(msg.a));
        if (!r.ok) { env.flash(from, r.why, 'bad'); H.sendSeat(from); return; }
        H.afterChange();
      }
    };
    /* A deck from a phone: cleaned, checked by the rules, kept for that seat. */
    function setDeck(from, deck) {
      if (!humans().some(h => h.id === from)) return;
      if (!deck) { delete S.decks[from]; changed(); return; }
      if (typeof deck !== 'object' || !deck.cards || typeof deck.cards !== 'object') return;
      const ident = String(deck.ident || '');
      if (!D.CARDS[ident] || D.CARDS[ident].type !== 'identity') { env.flash(from, 'That deck has no identity.', 'bad'); return; }
      const cards = {};
      for (const k of Object.keys(deck.cards).slice(0, 120)) { const m = +deck.cards[k] | 0; if (D.CARDS[k] && m > 0) cards[k] = Math.min(m, 9); }
      const clean = { side: D.CARDS[ident].side, ident, cards, name: String(deck.name || 'My deck').slice(0, 30) };
      const bad = D.checkDeck(clean, S.opts.pool, S.opts.sets);
      if (bad.length) { env.flash(from, 'That deck is not legal yet: ' + bad[0] + '.', 'bad'); return; }
      S.decks[from] = clean;
      env.flash(from, '“' + clean.name + '” is your deck for this game.', 'good');
      changed();
    }
    /* A phone sends the bare order; nothing off the wire is trusted past here. */
    function clean(a) {
      const out = { t: String(a.t || '').slice(0, 10) };
      if (a.id != null) out.id = String(a.id).slice(0, 80);
      if (a.n != null && isFinite(+a.n)) out.n = Math.max(0, Math.min(1e9, +a.n | 0));
      if (Array.isArray(a.ids)) out.ids = a.ids.slice(0, 60).map(x => String(x).slice(0, 40));
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
      lessonCheck();
      if (g.phase === 'over' && S.screen !== 'over') {
        S.screen = 'over';
        settle();
        if (!(S.createOpts && S.createOpts.learn)) startFinale();
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
       of the pace, and each action waits until the last move could be read.
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
        const gap = turnish ? pick(T.houseShowMs, 2400) : pick(T.houseActMs, 1000);
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
       Taking a move back (D) — by replay. Barriers: the other side has
       answered since, or anything hidden came to light (a card drawn, a
       card rezzed or accessed, a shuffle, a run begun, a trace).
       ================================================================ */
    function markOf(g) { return { turnN: g.turnN, hidden: g.drawN + ',' + g.rngN + ',' + g.revealN + ',' + g.runN, logN: g.log.length }; }
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
      const same = prev && !prev.note && !prev.rel && prev.seat === m.seat && prev.mark.turnN === m.mark.turnN;
      if (!same) S.undoFloor = S.moves.length - 1;
      if (m.human) S.lastHumanAt = now();
    }
    function undoInfo(id) {
      const g = S.g;
      if (!g || S.screen !== 'play' || S.table || g.hold || g.phase === 'over' || !S.createOpts) return null;
      const k = S.moves.length - 1, m = S.moves[k];
      if (!m || m.note || m.rel || m.seat !== id || !m.human || k < S.undoFloor) return null;
      /* The last accepted answer is this seat's, so nobody else has moved since;
         and nothing hidden may have come to light since it was given. */
      const nowM = markOf(g);
      if (nowM.hidden !== m.mark.hidden) return null;
      const ls = W.lines(g.log.slice(m.mark.logN), g.publicView(), m.mark.logN).filter(l => l.by === id && !l.quiet && !l.turn);
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
      if (!info) { env.flash(from, 'That can no longer be taken back — something was revealed, or the other side has moved since.', 'bad'); H.sendSeat(from); return; }
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
      while (floor > 0) { const m = S.moves[floor - 1]; if (m.note || m.rel || m.seat !== from || m.mark.turnN !== ng.turnN) break; floor--; }
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
       Save and resume (solo): the game is its options and its answers. A
       hold the display released is a move too ({rel}).
       ================================================================ */
    H.saveData = function () {
      const g = S.g;
      return { v: VERSION, createOpts: S.createOpts, moves: S.moves, opts: S.gameOpts || S.opts, at: Date.now(), learnSeen: S.learnSeen.slice(),
        round: g ? g.round : 0, points: g ? { corp: g.X.points('corp'), runner: g.X.points('runner') } : null,
        sides: g ? g.players.map(p => ({ name: p.name, side: p.side, bot: p.bot })) : [], corp: S.createOpts.corp, runner: S.createOpts.runner };
    };
    H.resume = function (data) {
      if (!data || !data.createOpts) return false;
      try {
        S.opts = Object.assign({}, S.opts, data.opts || {});
        S.heldTo = 0;
        S.pendingSeen = (data.learnSeen || []).slice();
        begin(data.createOpts, data.moves || []);
        S.reelAt = 0;
        H.afterChange();
        return true;
      } catch (e) { return false; }
    };

    /* ================================================================
       The engine's holds: the opening card waits for Continue on every
       phone; a show is timed.
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
      return h ? { n: h.n, k: h.k, id: h.id, waiting: h.waiting.slice(), done: h.done.slice(), grace: h.grace, lesson: h.lesson || null } : null;
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
       The finale: data for shared/finale.js. Two players, so no bottom-up
       places: the count, the hold, the winner.
       ================================================================ */
    H.finaleData = function () {
      const g = S.g, R = g.result;
      const TITLE = { points: 'The last agenda', flatline: 'Flatline', decked: 'R&D runs dry', cap: 'Time is called' };
      const SUB = {
        points: 'Someone has reached ' + g.opts.win + ' agenda points.',
        flatline: 'The Runner took more damage than they could hold.',
        decked: 'The Corp had to draw, and R&D was empty.',
        cap: 'The game ran out of rounds. The most agenda points wins.'
      };
      return {
        title: TITLE[R.how] || 'Game over', sub: SUB[R.how] || '',
        tone: R.how === 'flatline' ? 'lightning' : 'hyperspace',
        categories: [{ key: 'agendas', label: 'Agenda points' }],
        places: false,
        winSmall: R.how === 'flatline' ? 'flatlined the Runner' : R.how === 'decked' ? 'outlasted R&D' : 'the agenda points',
        players: R.rows.map(r => ({ id: r.id, name: r.name, hex: r.hex, parts: { agendas: r.points }, total: r.points, place: r.place, won: r.won,
          side: r.side, tag: (r.side === 'corp' ? 'Corp · ' : 'Runner · ') + D.FACTIONS[r.fac].name + (r.bot ? ' · house ' + r.level : '') })),
        tiebreak: R.tiebreak ? 'Level on points when time was called: the Corp holds on.' : null,
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

  const Host = { VERSION, create, defaultT, HOUSE_NAMES, SIDE_HEX };
  if (typeof module !== 'undefined' && module.exports) module.exports = Host;
  else root.NrHost = Host;
})(typeof window !== 'undefined' ? window : this);
