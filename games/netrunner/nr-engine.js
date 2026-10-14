'use strict';
/* Android: Netrunner (Core Set) — the rules. No DOM, no timers, one seeded rng.
 *
 * The display (or the solo host) holds the one Game; every order — from a
 * phone, a house player or a test — goes through `g.act(seatId, answer)`,
 * which refuses with a reason rather than a bare false.
 *
 * ONE GENERATOR (the Radlands / Glory to Rome / Kemet pattern, LESSONS-
 * CHECKLIST B). `main()` deals, offers each side a mulligan, then plays Corp
 * turn, Runner turn, round after round. A turn, a run, an encounter, an
 * access, a trace and damage are generators too, and every question is a
 * `yield`. The driver runs until the generator asks something (`{ask}`) or
 * wants the screen to show something first (`{hold}`).
 *
 *   g.prompts   the question open now (Netrunner never asks both sides at once)
 *   g.hold      decide, hold, show, then apply: the opening card, each turn's
 *               banner, an ice rezzed in a run, what a run accessed, an agenda
 *               scored or stolen, a trace, damage, an expose, a run's end.
 *               Only when a screen shows the game (`opts.show`); a test proves
 *               seeded games end identically with holds on and off.
 *
 * Generators cannot be copied, so undo is by replay of the answers.
 *
 * WHAT IS SECRET (the Core Set rules): HQ (the Corp's hand) and the grip (the
 * Runner's); the order of R&D and of the stack; every unrezzed installed Corp
 * card — though where it is, and its advancement tokens, are public; cards in
 * Archives face down. A card's id (`c12`, `r7`) is dealt AFTER the shuffle, so
 * it says nothing about what the card is. Accessed, exposed, rezzed, played,
 * stolen and scored cards are public from then on.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nr-data.js') : root.NrData;
  const CARD = D.CARDS;

  const VERSION = 1;
  const LEVELS = ['easy', 'medium', 'hard'];
  const OVER = { over: true };

  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return function () {                         // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const no = why => ({ ok: false, why });
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));

  /* ================================================================
     Building a game
     opts: { players: [{ id, name, hex, bot, level, side: 'corp'|'runner' }],
             corp: 'hb'|'jinteki'|'nbn'|'weyland', runner: 'anarch'|'criminal'|'shaper',
             seed, show, win (agenda points, 7), cap (rounds before the most points wins) }
     ================================================================ */
  function create(opts) {
    opts = opts || {};
    const list = opts.players || [];
    if (list.length !== 2) throw new Error('Netrunner is for exactly two: a Corp and a Runner');
    const cs = list.find(p => p.side === 'corp'), rs = list.find(p => p.side === 'runner');
    if (!cs || !rs) throw new Error('One player must be the Corp and the other the Runner');
    const seed = opts.seed == null ? Date.now() : opts.seed;
    /* A deck built on a phone (checked by the host), or the faction's starter. */
    const decks = opts.decks || {};
    const deckFor = (side, fac) => decks[side] && D.CARDS[decks[side].ident] && D.CARDS[decks[side].ident].side === side ? decks[side] : D.starterDeck(fac);
    const corpDeck = deckFor('corp', D.CORPS.indexOf(opts.corp) >= 0 ? opts.corp : 'hb');
    const runDeck = deckFor('runner', D.RUNNERS.indexOf(opts.runner) >= 0 ? opts.runner : 'shaper');
    const corpFac = D.CARDS[corpDeck.ident].fac, runFac = D.CARDS[runDeck.ident].fac;
    const g = {
      VERSION, seed, rng: rngFrom(seed), rngN: 0, drawN: 0, revealN: 0, runN: 0, pending: [], linger: [],
      opts: { show: !!opts.show, win: opts.win >= 3 && opts.win <= 12 ? +opts.win : D.WIN, cap: opts.cap || 0, corp: corpFac, runner: runFac, campaign: !!opts.campaign },
      phase: 'setup', turnN: 0, round: 0, active: null,
      cards: {},
      corp: null, runner: null, run: null,
      log: [], prompts: [], answers: {}, pn: 0, hold: null, holdN: 0, actN: 0,
      result: null
    };
    g.players = list.map((x, i) => ({
      id: x.id, name: x.name, hex: x.hex || '#9aa3ad', bot: !!x.bot, i, side: x.side,
      level: x.bot ? (LEVELS.indexOf(x.level) >= 0 ? x.level : 'medium') : null
    }));
    const rand = () => { g.rngN++; return g.rng(); };
    /* Deal ids after the shuffle: an id says where a card started, never what it is. */
    const deal = (deck, prefix) => {
      const keys = shuffle(D.listOf(deck), rand);
      return keys.map((k, n) => { const iid = prefix + (n + 1); g.cards[iid] = fresh(iid, k); return iid; });
    };
    function fresh(iid, k) { return { iid, k, side: CARD[k].side, rez: false, adv: 0, virus: 0, power: 0, agenda: 0, cred: 0, rc: 0, host: null, up: false, boost: 0, mark: null, tink: 0, chimera: null, oversight: false, hai: 0, haiTurn: 0, cortez: 0, x: {} }; }
    const ci = 'cid', ri = 'rid';
    g.cards[ci] = fresh(ci, corpDeck.ident); g.cards[ci].rez = true; g.cards[ci].up = true;
    g.cards[ri] = fresh(ri, runDeck.ident); g.cards[ri].up = true;
    g.corp = {
      seat: cs.id, fac: corpFac, ident: ci, credits: D.START_CREDITS, clicks: 0, hq: [], rd: deal(corpDeck, 'c'), deckN: D.listOf(corpDeck).length, deckName: corpDeck.name || null, arch: [], score: [], gone: [], bp: 0,
      servers: [{ id: 'hq', name: 'HQ', ice: [], root: [] }, { id: 'rd', name: 'R&D', ice: [], root: [] }, { id: 'arch', name: 'Archives', ice: [], root: [] }],
      remoteN: 0, flags: {}, mull: null, hosted: [], cur: []
    };
    g.runner = {
      seat: rs.id, fac: runFac, ident: ri, credits: D.START_CREDITS, clicks: 0, grip: [], stack: deal(runDeck, 'r'), deckN: D.listOf(runDeck).length, deckName: runDeck.name || null, heap: [], rig: [], score: [], gone: [],
      tags: 0, brain: 0, flags: {}, last: { ran: false, success: false, stole: false }, mull: null, ws: [], peek: null, cur: []
    };
    g.cards[ci].rc = (CARD[g.cards[ci].k].recur || {}).n || 0;
    g.runner.extraN = 0;
    for (const k of CARD[g.cards[ri].k].startsWith || []) {
      const iid = 'rx' + (++g.runner.extraN);
      g.cards[iid] = fresh(iid, k); g.cards[iid].up = true; g.runner.rig.push(iid);
    }
    { const idc = CARD[g.cards[ci].k]; if (idc.startCredits != null) g.corp.credits = idc.startCredits; if (idc.startBP) g.corp.bp = idc.startBP; }
    { const idr = CARD[g.cards[ri].k]; if (idr.startCredits != null) g.runner.credits = idr.startCredits; if (idr.corpStartBP) g.corp.bp += idr.corpStartBP; }
    attach(g, rand);
    g.gen = g.main();
    g.advance();
    return g;
  }

  function attach(g, rand) {
    const P = id => g.players.find(p => p.id === id) || null;
    const C = g.corp, R = g.runner;
    const log = e => { g.log.push(Object.assign({ tn: g.turnN }, e)); return e; };
    const card = iid => g.cards[iid];
    const dat = iid => CARD[g.cards[iid].k];
    const sideOf = s => s === 'corp' ? C : R;
    const seatOf = s => P(sideOf(s).seat);
    const nameOf = iid => dat(iid).name;

    g.seat = P;
    g.idx = id => g.players.findIndex(p => p.id === id);
    g.note = e => log(e);
    g.sideOfSeat = id => (C.seat === id ? 'corp' : R.seat === id ? 'runner' : null);

    /* ================================================================
       Where things are
       ================================================================ */
    const server = sid => C.servers.find(s => s.id === sid) || null;
    /* Remotes are r1, r2…; never test the first letter — R&D is 'rd'. */
    const isRemote = sid => /^r[0-9]+$/.test(sid || '');
    const remotes = () => C.servers.filter(s => isRemote(s.id));
    function serverOf(iid) {
      for (const s of C.servers) if (s.ice.indexOf(iid) >= 0 || s.root.indexOf(iid) >= 0) return s;
      if (C.hosted.indexOf(iid) >= 0 && card(iid).host && card(card(iid).host).side === 'corp') {
        const h = card(iid).host;
        for (const s of C.servers) if (s.ice.indexOf(h) >= 0 || s.root.indexOf(h) >= 0) return s;
      }
      return null;
    }
    /* Corp cards on the table that the Corp may rez, advance or score: the
       servers' cards plus hosted non-ice (Awakening Center's ice has its own rule). */
    const corpPlaced = () => installedCorp().concat(C.hosted.filter(i => ['asset', 'agenda', 'upgrade'].indexOf(dat(i).type) >= 0));
    const hostedAct = iid => { const h = card(iid).host; return !!h && !!card(h) && !!(D.SCRIPT[card(h).k] || {}).hostedAct; };
    /* Rezzing barred: not until the next turn (Councilman, Dedication Ceremony) or by a card (Zealous Judge). */
    const rezBlock = i => card(i).x.lockUntil > g.turnN ? 'Not until your next turn' : (mod('rezBad', null, { iid: i }) || null);
    const installedCorp = () => { const out = []; for (const s of C.servers) out.push(...s.ice, ...s.root); return out; };
    const isInstalled = iid => card(iid).side === 'corp' ? !!serverOf(iid) || C.hosted.indexOf(iid) >= 0 : R.rig.indexOf(iid) >= 0;
    const rigOf = type => R.rig.filter(i => dat(i).type === type && !card(i).x.fd);
    const faceUpRig = () => R.rig.filter(i => !card(i).x.fd);
    const programs = () => rigOf('program');
    const breakers = () => programs().filter(i => dat(i).brk);
    const hostedOn = iid => R.rig.filter(i => card(i).host === iid);
    const rezzed = (k, where) => (where || installedCorp()).filter(i => card(i).k === k && card(i).rez && !blanked(i));
    const has = k => R.rig.some(i => card(i).k === k);
    const rumorMill = () => R.cur.some(i => card(i).k === 'rumor_mill');
    const blanked = i => { const c = card(i); return !!(c.x.fd || c.x.blankT === g.turnN || (c.side === 'runner' && c.host && card(c.host) && card(c.host).k === 'magnet' && card(c.host).rez) ||
      (c.side === 'corp' && CARD[c.k].uniq && (CARD[c.k].type === 'asset' || CARD[c.k].type === 'upgrade') && !/Region/.test(CARD[c.k].kw || '') && rumorMill() && isInstalled(i))); };
    const rigCards = k => R.rig.filter(i => card(i).k === k && !blanked(i));
    const LISTS = () => [C.hq, C.rd, C.arch, C.score, C.gone, C.hosted, C.cur, R.grip, R.stack, R.heap, R.rig, R.score, R.gone, R.ws, R.cur].concat(C.servers.map(s => s.ice), C.servers.map(s => s.root));
    /* Lift a card out of wherever it is (one door). */
    function lift(iid) {
      for (const l of LISTS()) { const i = l.indexOf(iid); if (i >= 0) { l.splice(i, 1); break; } }
      const c = card(iid);
      c.host = null;
      pruneRemotes();
      return c;
    }
    /* A remote with nothing in its root and no ice is gone. */
    function pruneRemotes() { C.servers = C.servers.filter(s => !isRemote(s.id) || s.ice.length || s.root.length); }
    function wipe(c) { c.rez = false; c.adv = 0; c.virus = 0; c.power = 0; c.agenda = 0; c.cred = 0; c.boost = 0; c.mark = null; c.tink = 0; c.host = null; c.chimera = null; c.oversight = false; c.hai = 0; c.cortez = 0; c.x = {}; }
    /* A program on Djinn or a breaker on Dinosaurus uses none of the Runner's memory. */
    const freeHost = i => { const h = card(i).host; return !!h && !!card(h) && (card(h).k === 'djinn' || card(h).k === 'dinosaurus' || !!(D.SCRIPT[card(h).k] && D.SCRIPT[card(h).k].freeHost)); };

    /* ================================================================
       Numbers that are derived, never tracked
       ================================================================ */
    const link = () => mod('link', (blankId('runner') ? 0 : dat(R.ident).link || 0) + faceUpRig().reduce((s, i) => s + (dat(i).link || 0), 0));
    const muTotal = () => -((R.muCut && R.muCut.turn === g.turnN) ? R.muCut.n : 0) + mod('mu', D.MU + (dat(R.ident).memory || 0) + faceUpRig().reduce((s, i) => s + (dat(i).memory || 0), 0));
    /* Cloud breakers use no memory while the Runner has 2 link. */
    const muOf = i => card(i).x.fd || freeHost(i) || (dat(i).cloud && link() >= 2) ? 0 : mod('muOf', dat(i).mu || 0, { iid: i });
    const muUsed = () => mod('muUsed', programs().reduce((s, i) => s + muOf(i), 0));
    const points = side => mod('points', sideOf(side).score.reduce((s, i) => s + mod('agendaPts', (dat(i).pts || dat(i).scorePts || 0) + (card(i).k === 'beale' ? card(i).agenda : 0) - (side === 'corp' ? (card(i).x.graffiti || []).length : 0), { iid: i, side }), 0), { side });
    const bpNow = () => C.bp + Math.max(0, mod('bpExtra', 0, {}));
    const corpHandMax = () => mod('corpHand', D.HAND + 2 * rezzed('research_station', server('hq').root).length + (dat(C.ident).handPlus || 0));
    const runHandMax = () => mod('runHand', D.HAND - R.brain - (R.handCut && R.handCut.until > g.turnN ? R.handCut.n : 0) + faceUpRig().reduce((s, i) => s + (dat(i).handPlus || 0), 0));
    /* Virus counters a program can count and spend: its own, and Hivemind's for any other virus program. */
    const hives = () => R.rig.filter(i => card(i).k === 'hivemind');
    const virusOf = iid => card(iid).virus + (dat(iid).virus && card(iid).k !== 'hivemind' ? hives().reduce((t, h) => t + card(h).virus, 0) : 0);
    function spendVirus(iid, n) {
      for (; n > 0 && card(iid).virus > 0; n--) card(iid).virus--;
      for (const h of hives()) for (; n > 0 && card(h).virus > 0; n--) card(h).virus--;
    }
    const advOf = iid => Math.max(0, mod('advOf', card(iid).adv, { iid }));
    function advNeed(iid) {
      const s = serverOf(iid);
      const ss = s ? rezzed('sansan', s.root).length : 0;
      return Math.max(0, mod('advNeed', dat(iid).adv - ss, { iid }));
    }
    const canAdvance = iid => { const d = dat(iid); return isInstalled(iid) && card(iid).side === 'corp' && (d.type === 'agenda' || !!d.advable) && (!d.advRezzed || card(iid).rez) && (!d.advUnrezzed || !card(iid).rez) && (C.hosted.indexOf(iid) < 0 || hostedAct(iid)) && C.noAdvTurn !== g.turnN; };
    function typesOf(iid) {
      const c = card(iid);
      if (c.tink && c.tink === g.turnN) return ['barrier', 'code gate', 'sentry'];
      if (c.chimera) return mod('iceTypes', [c.chimera], { iid });
      return mod('iceTypes', (dat(iid).ice || []).slice(), { iid });
    }
    /* An ice's subroutines as they stand: the printed ones, one per advancement
       token on Woodcutter, Tyrant and Salvage, and Sensei's End the run. */
    function subsOf(iid) {
      const d = dat(iid), c = card(iid);
      const out = d.subs.slice();
      if (d.advSub) for (let k = 0; k < advOf(iid); k++) out.push(d.advSub);
      if (g.run && g.run.sensei && g.run.sensei !== iid) out.push({ k: 'etr', sensei: true });
      return mod('subs', out, { iid });
    }
    /* What it costs the Runner to trash a card: its printed cost, +1 per
       Encryption Protocol while it is installed. */
    function trashCostOf(iid) {
      const d = dat(iid);
      if (d.trash == null) return null;
      return Math.max(0, mod('trashCost', d.trash + (isInstalled(iid) ? rezzed('encryption').length : 0), { iid }));
    }
    /* Ice strength. `enc` adds what only an encounter brings: Ice Carver, a
       Chum's +2, and strength lowered by Datasucker or Wyrm. */
    function iceStr(iid, enc) {
      const c = card(iid), d = dat(iid);
      let s = d.str + (d.advStr ? advOf(iid) * d.advStr : 0) + c.boost;
      const sv = serverOf(iid);
      if (sv) s += rezzed('exp_data', sv.root).length;
      if (idK('corp') === 'stronger' && /Bioroid/.test(d.kw || '')) s += 1;
      if (c.k === 'draco') s += c.power;
      for (const h of hostedOn(iid)) if (card(h).k === 'parasite' && !blanked(h)) s -= card(h).virus;
      if (enc) {
        if (R.rig.some(i => card(i).k === 'ice_carver')) s -= 1;
        if (enc.chum) s += 2;
        s -= enc.lower || 0;
      }
      if (g.run && g.run.iceBoost) s += g.run.iceBoost;
      s = mod('iceStr', s, { iid, enc: !!enc });
      return d.noLower ? Math.max(s, d.str + (d.advStr ? c.adv * d.advStr : 0) + c.boost) : s;
    }
    function breakerStr(iid) {
      const d = dat(iid);
      let s = (d.strVirus ? virusOf(iid) : (d.str || 0)) + hostedOn(iid).filter(h => card(h).k === 'personal_touch').length;
      if (card(iid).host && card(card(iid).host) && card(card(iid).host).k === 'dinosaurus') s += 2;
      if (card(iid).haiTurn === g.turnN) s += card(iid).hai;
      if (g.run) s += (g.run.pump[iid] || 0) + (g.run.enc && g.run.enc.pump[iid] || 0);
      return mod('breakerStr', s, { iid });
    }
    function rezCost(iid) {
      const d = dat(iid);
      if (d.type === 'ice') {
        const sv = serverOf(iid);
        const brain = C.score.filter(i => card(i).k === 'braintrust').reduce((t, i) => t + card(i).agenda, 0);
        return Math.max(0, mod('rezCost', d.cost - (sv ? 2 * rezzed('akitaro', sv.root).length : 0) - brain + rigCards('xanadu').length + (card(iid).cortez === g.turnN ? 2 : 0), { iid }));
      }
      return Math.max(0, mod('rezCost', d.cost || 0, { iid }));
    }

    /* ================================================================
       Credits: the pool, plus recurring and run-only credits that are spent
       first wherever they are allowed.
         corp: Making News (traces)
         runner: Cyberfeeder (icebreakers, installing viruses), The Toolbox
         (icebreakers), Crash Space (removing tags), Stimhack and bad
         publicity (anything during the run)
       ================================================================ */
    /* Whether a recurring credit on `holder` may pay for `why` (ctx: { ice, sid }). */
    function okFor(holder, r, why, ctx) {
      switch (r.for) {
        case 'feeder': return why === 'breaker' || why === 'virus';
        case 'program': return why === 'virus' || why === 'program';
        case 'stealth': return why === 'breaker' || why === 'stealth';
        case 'trashAsset': return why === 'trashCost' && !!(ctx && ctx.asset);
        case 'omni': return why === 'breaker' && (ctx && ctx.b ? card(ctx.b).host === holder : hostedOn(holder).some(h => !!dat(h).brk));
        case 'fracter': case 'decoder': case 'killer': return (why === 'breaker' || why === 'stealth') && !!(ctx && ctx.b) && new RegExp(r.for, 'i').test(dat(ctx.b).kw || '');
        case 'event': return why === 'event';
        case 'rezAny': return why === 'rez' || why === 'rezIce';
        case 'khondi': return why === 'rezIce' && !!ctx && !!ctx.iid && !!serverOf(holder) && serverOf(ctx.iid) === serverOf(holder);
        case 'runHQ': return !!g.run && g.run.sid === 'hq';
        case 'runEvent': return why === 'event' && !!(ctx && ctx.run);
        case 'run': return !!g.run;
        case 'root': return ['advance', 'install', 'rez', 'rezIce'].indexOf(why) >= 0;
        case 'dtt': return why === 'install' && !!ctx && !!ctx.ice && !!serverOf(holder) && ctx.sid === serverOf(holder).id;
        case 'advIce': return why === 'advance' && !!(ctx && ctx.ice);
        case 'advance': return why === 'advance' && !!ctx && !!serverOf(holder) && ctx.sid === serverOf(holder).id;
        default: return r.for === why;
      }
    }
    const recurN = r => r.n === 'link' ? link() : r.n === 'remotes' ? remotes().length : r.n === 'hqIce' ? (server('hq') ? server('hq').ice.length : 0) : r.n;
    function pools(side, why, ctx) {
      const out = [];
      if (side === 'runner' && g.run) {
        if (g.run.stim) out.push({ k: 'stim' });
        if (g.run.bpc) out.push({ k: 'bpc' });
        if (g.run.sid === 'hq') for (const ph of rigCards('pheromones')) if (card(ph).rc > 0) out.push({ k: 'rc', iid: ph });
      }
      const holders = side === 'corp' ? [C.ident].concat(installedCorp().filter(i => card(i).rez), C.cur) : [R.ident].concat(R.rig, R.cur);
      for (const i of holders) {
        const r = dat(i).recur;
        if (r && card(i).rc > 0 && okFor(i, r, why, ctx)) out.push({ k: 'rc', iid: i });
      }
      /* Credits a script keeps on a card (Ice Analyzer, Omni-drive…): `spend` says what for. */
      for (const i of holders) {
        const sc = SC(i);
        if (sc && sc.spend && card(i).cred > 0 && sc.spend(X, i, why, ctx || {})) out.push({ k: 'cred', iid: i });
      }
      return out;
    }
    function poolAmt(p) { return p.k === 'stim' ? g.run.stim : p.k === 'bpc' ? g.run.bpc : p.k === 'cred' ? card(p.iid).cred : card(p.iid).rc; }
    /* `why` 'stealth' (Dagger's pump) may use only credits from stealth cards: none from the pool. */
    const poolOnly = why => why === 'stealth';
    function avail(side, why, ctx) {
      if (side === 'runner' && g.run && g.run.noCredits) return 0;    /* RSVP */
      return (poolOnly(why) ? 0 : sideOf(side).credits) + pools(side, why, ctx).reduce((s, p) => s + poolAmt(p), 0);
    }
    function refill(iid) { const r = dat(iid).recur; if (r) card(iid).rc = recurN(r); if (card(iid).k === 'pheromones') card(iid).rc = card(iid).virus; }
    function pay(side, n, why, ctx) {
      if (n <= 0) return true;
      if (avail(side, why, ctx) < n) return false;
      for (const p of pools(side, why, ctx)) {
        const take = Math.min(n, poolAmt(p));
        if (p.k === 'stim') g.run.stim -= take; else if (p.k === 'bpc') g.run.bpc -= take; else if (p.k === 'cred') { card(p.iid).cred -= take; const sc = SC(p.iid); if (sc && sc.spent) sc.spent(X, p.iid); } else card(p.iid).rc -= take;
        if (take > 0 && side === 'runner' && g.run && p.iid && /\bStealth\b/.test(dat(p.iid).kw || '')) for (const ri of runnerActives()) { const sc = SC(ri); if (sc && sc.sync && sc.sync.stealthSpent) sc.sync.stealthSpent(X, ri, { iid: p.iid, n: take }); }
        n -= take;
        if (!n) return true;
      }
      sideOf(side).credits -= n;
      return true;
    }
    const gain = (side, n) => { sideOf(side).credits += n; };

    /* ================================================================
       Asking
       ================================================================ */
    function* ask(side, pr) {
      const q = Object.assign({}, pr, { n: ++g.pn, seat: sideOf(side).seat, side });
      const out = yield { ask: [q] };
      return out[q.seat];
    }
    /* A pick. A question with one legal answer answers itself; with none it
       is not asked. `multi` takes ids (min..max). */
    function* pick(side, what, why, options, o) {
      o = o || {};
      const legal = options.filter(x => !x.bad);
      if (!o.multi) {
        if (!legal.length && !o.force) return null;
        if (legal.length === 1 && !o.skip && !o.always && !o.force) return legal[0].id;
      } else if (!legal.length) return [];
      const a = yield* ask(side, { t: 'pick', what, why, pub: o.pub || null, options, multi: !!o.multi, src: o.src || null,
        min: o.multi ? (o.min || 0) : 1, max: o.multi ? Math.min(o.max == null ? legal.length : o.max, legal.length) : 1, skip: o.skip || null, show: o.show || null });
      if (a.t === 'skip') return o.multi ? [] : null;
      return o.multi ? a.ids.slice() : a.id;
    }
    function* yesNo(side, what, why, yesLab, noLab, o) {
      const a = yield* pick(side, what, why, [{ id: 'yes', label: yesLab, sub: (o && o.yesSub) || null }, { id: 'no', label: noLab, sub: (o && o.noSub) || null }], Object.assign({ always: true }, o || {}));
      return a === 'yes';
    }
    function* hold(h) { yield { hold: h }; }
    /* A psi game: both sides choose 0, 1 or 2 credits in secret, asked at
       once; both pay; true when they differ. */
    function* psi(cause) {
      const opts = side => [0, 1, 2].map(n => ({ id: String(n), label: 'Spend ' + n, bad: n === 2 && mod('noBid2', false, {}) ? 'Government Investigations: not 2' : avail(side, 'any') < n ? 'You have ' + avail(side, 'any') : null }));
      const qs = ['corp', 'runner'].map(side => ({ t: 'pick', what: 'psi', why: 'Psi game (' + cause + '): spend 0, 1 or 2 credits in secret. ' + (side === 'corp' ? 'Different from the Runner and it works.' : 'Match the Corp and it fails.'),
        pub: 'Psi game — both sides choose in secret', options: opts(side), multi: false, min: 1, max: 1, skip: null, secret: true, n: ++g.pn, seat: sideOf(side).seat, side }));
      const out = yield { ask: qs };
      const cb = +out[C.seat].id, rb = +out[R.seat].id;
      pay('corp', cb, 'any'); pay('runner', rb, 'any');
      g.revealN++;
      log({ t: 'psi', cb, rb, cause });
      yield* hold({ k: 'psi', cb, rb, cause });
      yield* emit('psi', { cb, rb, cause });
      return cb !== rb;
    }
    /* Virus counters, counted for Surge. */
    function addVirus(iid, n) { card(iid).virus += n; R.flags.virusOn = R.flags.virusOn || []; if (R.flags.virusOn.indexOf(iid) < 0) R.flags.virusOn.push(iid); log({ t: 'virus', k: card(iid).k, n: card(iid).virus }); }
    const cardOpt = (iid, label, sub, bad) => ({ id: iid, label: label || nameOf(iid), sub: sub || null, card: card(iid).k, bad: bad || null });

    /* ================================================================
       The end
       ================================================================ */
    function finish(how, side) {
      const rows = ['corp', 'runner'].map(s => {
        const X = sideOf(s), p = P(X.seat);
        return { id: p.id, name: p.name, hex: p.hex, side: s, fac: X.fac, ident: card(X.ident).k, bot: p.bot, level: p.level,
          points: points(s), agendas: X.score.map(i => card(i).k), total: points(s) };
      });
      let win = side ? rows.find(r => r.side === side) : null;
      let tiebreak = false;
      if (!win) {
        const a = rows[0].points, b = rows[1].points;
        if (a === b) { tiebreak = true; win = rows[0]; } else win = a > b ? rows[0] : rows[1];
      }
      rows.forEach(r => { r.won = r === win; r.place = r.won ? 1 : 2; });
      g.result = { how, winner: win.id, name: win.name, side: win.side, rows, tiebreak, round: g.round };
      g.phase = 'over';
      g.prompts = [];
      g.hold = null;
      log({ t: 'over', how });   /* never names the winner: the log is public before the reveal */
      throw OVER;
    }
    const winAt = side => Math.max(1, mod('winPts', g.opts.win, { side }));
    function winCheck() {
      if (points('corp') >= winAt('corp') && !mod('noCorpPointsWin', false, {})) finish('points', 'corp');
      if (points('runner') >= winAt('runner')) finish('points', 'runner');
    }

    /* ================================================================
       Moving cards
       ================================================================ */
    function drawCorp(n, why) {
      let k = 0;
      for (; k < n && C.rd.length; k++) { C.hq.push(C.rd.shift()); g.drawN++; }
      if (k) log({ t: 'draw', side: 'corp', n: k, why: why || null });
      if (k && why !== 'turn' && why !== 'click' && g.phase === 'play') (g.drawQ = g.drawQ || []).push(...C.hq.slice(-k));
      return k;
    }
    function drawRunner(n, why) {
      if (R.noDrawTurn === g.turnN) return 0;
      const cap = mod('runnerDrawCap', null, {});
      if (cap != null && g.active === 'runner') { R.flags.drawn = R.flags.drawn || 0; n = Math.min(n, Math.max(0, cap - R.flags.drawn)); }
      let k = 0;
      for (; k < n && R.stack.length; k++) { R.grip.push(R.stack.shift()); g.drawN++; }
      if (g.active === 'runner') R.flags.drawn = (R.flags.drawn || 0) + k;
      if (k) log({ t: 'draw', side: 'runner', n: k, why: why || null });
      if (k) { const iids = R.grip.slice(-k); for (const ci of activeIids().concat(iids)) { const sc = SC(ci); if (sc && sc.sync && sc.sync.runnerDrew) sc.sync.runnerDrew(X, ci, { n: k, iids }); } }
      return k;
    }
    /* One door for every Corp card that leaves play or a hand: Archives, face
       up if it was seen (rezzed, accessed, played) and face down otherwise. */
    function toArchives(iid, up) {
      const c = card(iid);
      if (isInstalled(iid) && c.side === 'corp') for (const ri of R.rig) { const sc = SC(ri); if (sc && sc.sync && sc.sync.corpTrashed) sc.sync.corpTrashed(X, ri, { iid }); }
      const hosted = R.rig.filter(i => card(i).host === iid);
      for (const h of hosted) trashRunner(h, 'host');
      for (const h of C.hosted.filter(i => card(i).host === iid)) toArchives(h, card(h).rez || dat(h).type === 'operation');
      const was = c.rez || !!up;
      lift(iid); wipe(c);
      c.up = was;
      C.arch.push(iid);
      return was;
    }
    /* Runner cards just put in the heap (trashed, discarded, lost to damage). */
    function heardTrash(iids, fromGrip) {
      if (!iids.length || g.phase !== 'play') return;
      for (const a of activeIids()) { const sc = SC(a); if (sc && sc.sync && sc.sync.cardsTrashed) sc.sync.cardsTrashed(X, a, { iids, fromGrip }); }
    }
    /* One door for every Runner card that is trashed: the heap, face up. */
    function trashRunner(iid, why) {
      const c = card(iid);
      if (R.rig.indexOf(iid) >= 0 && !c.x.fd && D.SCRIPT[c.k] && D.SCRIPT[c.k].harbinger && why !== 'facedownGone') {
        for (const h of R.rig.filter(i => card(i).host === iid)) trashRunner(h, 'host');
        wipe(c); c.x.fd = true;
        log({ t: 'note', side: 'runner', text: nameOf(iid) + ' turns face down instead of being trashed' });
        return;
      }
      const wasProgram = R.rig.indexOf(iid) >= 0 && dat(iid).type === 'program';
      if (R.rig.indexOf(iid) >= 0 && SC(iid) && SC(iid).whenTrashed) g.pending.push({ iid, f: SC(iid).whenTrashed });
      for (const h of R.rig.concat(R.ws, C.hosted).filter(i => card(i).host === iid)) { if (card(h).side === 'corp') { lift(h); card(h).up = true; C.arch.push(h); } else trashRunner(h, 'host'); }
      lift(iid); wipe(c);
      c.up = true;
      if (R.heap.indexOf(iid) >= 0) heardTrash([iid], false);
      R.heap.push(iid);
      log({ t: 'trashed', side: 'runner', k: c.k, why: why || null });
      if (why === 'used') for (const ri of runnerActives()) { const sc = SC(ri); if (sc && sc.sync && sc.sync.trashAbility) sc.sync.trashAbility(X, ri, { iid }); }
      for (const ri of runnerActives()) { const sc = SC(ri); if (sc && sc.sync && sc.sync.ownTrashed) sc.sync.ownTrashed(X, ri, { iid, why }); }
      /* Q-Coherence Chip: a program trashed, the chip goes too. */
      if (wasProgram) for (const q of R.rig.filter(i => card(i).k === 'qcoherence')) trashRunner(q, 'qcoherence');
      /* Memory lost (a chip or console gone): programs over the limit go,
         newest first, until they fit. */
      if (why !== 'memory') for (let k = 0; k < 12 && muUsed() > muTotal(); k++) {
        const over = programs().filter(i => !card(i).host || card(card(i).host).k !== 'djinn');
        if (!over.length) break;
        trashRunner(over[over.length - 1], 'memory');
      }
    }
    function shuffleRD() { C.rd = shuffle(C.rd, rand); }
    /* Shuffling after a search tells the Corp's cards (Personality Profiles); `plain` is a shuffle with no search. */
    function shuffleStack(plain) {
      R.stack = shuffle(R.stack, rand);
      if (!plain && g.phase === 'play') for (const ci of corpActives()) { const sc = SC(ci); if (sc && sc.sync && sc.sync.stackSearched) sc.sync.stackSearched(X, ci, {}); }
    }

    /* ================================================================
       Damage, tags, programs trashed — each with its prevention, one door.
       ================================================================ */
    function* damage(kind, n, cause, o) {
      o = o || {};
      n = mod('damage', n, { kind, cause });
      if (n <= 0) return;
      if (!o.replaced) for (const ci of corpActives()) {
        const sc = SC(ci);
        if (!sc || !sc.replaceDamage || !stillActive(ci)) continue;
        const r = yield* call(sc.replaceDamage, ci, { kind, n, cause });
        if (r) return yield* damage(r.kind, r.n, r.cause || cause, { replaced: true });
      }
      /* Leverage: every bit of damage prevented until the Runner's next turn. */
      if (!o.unprev && R.noDamageUntil && g.turnN < R.noDamageUntil) { log({ t: 'prevent', side: 'runner', k: 'leverage', n }); return; }
      let prevented = 0;
      if (!o.unprev) {
        for (const i of runnerActives()) {
          const sc = SC(i);
          if (!sc || !sc.prevent || prevented >= n || !stillActive(i)) continue;
          prevented += (yield* call(sc.prevent, i, { kind, n: n - prevented, cause })) || 0;
        }
        if (kind === 'net' && R.shieldTurn !== g.turnN) {
          const ns = rigCards('net_shield')[0];
          R.shieldTurn = g.turnN;     /* "the first net damage this turn", prevented or not */
          if (ns && avail('runner', 'any') >= 1) {
            if (yield* yesNo('runner', 'netShield', 'Net Shield: pay 1 credit to prevent 1 of this net damage?', 'Prevent 1 (1 credit)', 'Take it all', { pub: 'The Runner considers Net Shield' })) {
              pay('runner', 1, 'any'); prevented++;
              log({ t: 'prevent', side: 'runner', k: 'net_shield', n: 1 });
            }
          }
        }
        if (kind === 'net' && prevented < n) for (const dx of rigCards('deus_x')) {
          if (yield* yesNo('runner', 'deusNet', 'Deus X: trash it to prevent all ' + (n - prevented) + ' of this net damage?', 'Trash it: prevent it all', 'Keep it', { pub: 'The Runner considers Deus X' })) {
            trashRunner(dx, 'prevent'); log({ t: 'prevent', side: 'runner', k: 'deus_x', n: n - prevented }); prevented = n; break;
          }
        }
        if (kind === 'meat' && R.mureshTurn !== g.turnN && rigCards('muresh').length) {
          R.mureshTurn = g.turnN; prevented++;
          log({ t: 'prevent', side: 'runner', k: 'muresh', n: 1 });
        }
        if (kind === 'meat') for (const pc of rigCards('plascrete')) {
          const most = Math.min(card(pc).power, n - prevented);
          if (most <= 0) continue;
          const opts = [];
          for (let m = 0; m <= most; m++) opts.push({ id: String(m), label: m ? 'Prevent ' + m + ' (' + plural(m, 'counter') + ')' : 'Keep the counters' });
          const m = +(yield* pick('runner', 'plascrete', 'Plascrete Carapace: spend power counters to prevent meat damage (' + (n - prevented) + ' coming)?', opts, { always: true, pub: 'The Runner considers Plascrete Carapace' }));
          if (m) { card(pc).power -= m; prevented += m; log({ t: 'prevent', side: 'runner', k: 'plascrete', n: m }); if (card(pc).power <= 0) trashRunner(pc, 'empty'); }
        }
        if (kind === 'meat') {
          for (const cs of rigCards('crash_space')) {
            if (prevented >= n) break;
            if (yield* yesNo('runner', 'crash', 'Trash Crash Space to prevent up to 3 of this meat damage (' + n + ')?', 'Trash it: prevent ' + Math.min(3, n - prevented), 'Keep it', { pub: 'The Runner considers Crash Space' })) {
              const k = Math.min(3, n - prevented);
              prevented += k;
              trashRunner(cs, 'prevent');
              log({ t: 'prevent', side: 'runner', k: 'crash_space', n: k });
            }
          }
        }
      }
      const take = n - prevented;
      if (take <= 0) return;
      const lost = [];
      const flat = take > R.grip.length;
      const lostIids = [];
      const chooser = R.grip.length > take ? mod('damagePicker', null, { kind, n: take }) : null;
      if (chooser) {
        const ids = yield* pick(chooser, 'damageCards', (chooser === 'corp' ? 'Choose the Runner’s ' : 'Choose your ') + plural(take, 'card') + ' to lose to ' + kind + ' damage', R.grip.map(i => cardOpt(i)), { multi: true, min: take, max: take, pub: (chooser === 'corp' ? 'The Corp' : 'The Runner') + ' chooses what is lost' });
        for (const iid of ids) { lift(iid); card(iid).up = true; R.heap.push(iid); lost.push(card(iid).k); lostIids.push(iid); }
      }
      for (let k = lostIids.length; k < take && R.grip.length; k++) {
        const i = Math.floor(rand() * R.grip.length);
        const iid = R.grip[i];
        lift(iid); card(iid).up = true; R.heap.push(iid);
        lost.push(card(iid).k); lostIids.push(iid);
      }
      if (kind === 'net' || kind === 'meat') for (const i of lostIids) if (SC(i) && SC(i).lostToDamage) g.pending.push({ iid: i, f: SC(i).lostToDamage });
      heardTrash(lostIids, true);
      if (kind === 'brain') R.brain += take;
      g.revealN++;
      log({ t: 'damage', kind, n: take, lost, cause: cause || null, flat });
      yield* hold({ k: 'damage', kind, n: take, lost, cause: cause || null, flat });
      if (flat) finish('flatline', 'corp');
      yield* emit('damaged', { kind, n: take, cause });
    }
    function* giveTags(n, cause) {
      const asked = n;
      for (const nach of rigCards('nach')) {
        while (n > 0 && avail('runner', 'any') >= 2) {
          if (!(yield* yesNo('runner', 'nach', 'New Angeles City Hall: pay 2 to avoid one of ' + plural(n, 'tag') + '?', 'Pay 2: avoid 1', 'Take it', { pub: 'The Runner considers New Angeles City Hall' }))) break;
          pay('runner', 2, 'any'); n--;
          log({ t: 'prevent', side: 'runner', k: 'nach', n: 1 });
        }
        void nach; break;
      }
      for (const dc of rigCards('decoy')) {
        if (n <= 0) break;
        if (yield* yesNo('runner', 'decoy', 'Trash Decoy to avoid one of ' + plural(n, 'tag') + '?', 'Trash Decoy: avoid 1', 'Keep it', { pub: 'The Runner considers Decoy' })) {
          trashRunner(dc, 'prevent');
          n--;
          log({ t: 'prevent', side: 'runner', k: 'decoy', n: 1 });
        }
      }
      for (const i of runnerActives()) {
        const sc = SC(i);
        if (n <= 0 || !sc || !sc.avoidTag || !stillActive(i)) continue;
        n -= (yield* call(sc.avoidTag, i, { n, cause })) || 0;
      }
      if (n < asked) yield* emit('tagsGone', { n: asked - Math.max(0, n), avoided: true });
      if (n <= 0) return;
      R.tags += n;
      log({ t: 'tags', n, total: R.tags, cause: cause || null });
      yield* emit('tagged', { n, cause });
    }
    /* Trash 1 program: the Corp chooses, the Runner may sacrifice a Construct. */
    function* trashProgram(cause) {
      const progs = programs();
      if (!progs.length) { log({ t: 'fizzle', cause, what: 'no program to trash' }); return; }
      const target = yield* pick('corp', 'trashProg', 'Choose one of the Runner’s programs to trash (' + cause + ')', progs.map(i => cardOpt(i)), { pub: 'The Corp chooses a program to trash' });
      if (!target) return;
      if (yield* saveWithConstruct(target)) return;
      trashRunner(target, cause);
    }
    function* saveWithConstruct(target) {
      const sc = rigCards('sac_construct')[0];
      if (!sc) return false;
      if (yield* yesNo('runner', 'construct', 'Trash Sacrificial Construct to save ' + nameOf(target) + '?', 'Save it', 'Let it go', { pub: 'The Runner considers Sacrificial Construct' })) {
        trashRunner(sc, 'prevent');
        log({ t: 'prevent', side: 'runner', k: 'sac_construct', saved: card(target).k });
        return true;
      }
      return false;
    }

    /* ================================================================
       Traces: the Corp bids, then the Runner; both in the open.
       ================================================================ */
    function* trace(base, cause) {
      g.traceN = (g.traceN || 0) + 1;
      yield* emit('traceStart', { base, cause });
      /* Disrupter: the trace starts again at base strength 0. */
      if (base > 0) for (const ds of rigCards('disrupter')) {
        if (yield* yesNo('runner', 'disrupter', 'Disrupter: trash it — the trace (' + cause + ', strength ' + base + ') starts again at 0?', 'Trash it', 'Keep it', { pub: 'The Runner considers Disrupter' })) {
          trashRunner(ds, 'prevent'); log({ t: 'prevent', side: 'runner', k: 'disrupter' }); base = 0; break;
        }
      }
      base += mod('traceBase', 0, { cause });
      if (g.run && mod('runnerBidsFirst', false, {})) return yield* traceRunnerFirst(base, cause);
      const ca = avail('corp', 'trace');
      const copts = [];
      for (let x = 0; x <= Math.min(ca, 20); x++) copts.push({ id: String(x), label: 'Spend ' + x + ' → strength ' + (base + x), n: x });
      const cb = +(yield* pick('corp', 'traceC', 'Trace ' + base + ' (' + cause + '): how much do you spend? The Runner has ' + Math.max(0, mod('traceLink', link(), {})) + ' link and ' + avail('runner', 'any') + ' credits.', copts, { always: true, pub: 'The Corp sets the trace' }));
      pay('corp', cb, 'trace');
      const str = base + cb;
      const ra = avail('runner', 'trace');
      const ropts = [];
      const L = Math.max(0, mod('traceLink', link(), {}));
      for (let y = 0; y <= Math.min(ra, 25); y++) ropts.push({ id: String(y), label: 'Spend ' + y + ' → link ' + (L + y) + (L + y >= str ? ' — it fails' : ''), n: y });
      let rb = 0;
      if (ra > 0) rb = +(yield* pick('runner', 'traceR', 'Trace strength ' + str + ' (' + cause + '). You have ' + L + ' link: spend credits to match it?', ropts, { always: true, pub: 'The Runner answers the trace' }));
      pay('runner', rb, 'trace');
      if (rb) yield* emit('traceSpent', { rb });
      const ok = str > L + rb;
      const excess = ok ? str - (L + rb) : 0;
      if (g.run) g.run.traced = true;
      g.revealN++;
      log({ t: 'trace', base, cb, str, link: L, rb, ok, cause });
      yield* hold({ k: 'trace', base, cb, str, link: L, rb, ok, cause });
      if (ok && g.run) {
        const sv = server(g.run.sid);
        if (sv && rezzed('chilo', sv.root).length) yield* giveTags(1, 'ChiLo City Grid');
        for (const sm of rigCards('spinal_modem')) yield* damage('brain', 1, 'Spinal Modem');
      }
      yield* emit('trace', { ok, excess, cause, str });
      return { ok, excess, str };
    }

    /* Surveillance Sweep: the Runner spends first, then the Corp. */
    function* traceRunnerFirst(base, cause) {
      const L = Math.max(0, mod('traceLink', link(), {}));
      const ra = avail('runner', 'trace');
      const ropts = [];
      for (let y = 0; y <= Math.min(ra, 25); y++) ropts.push({ id: String(y), label: 'Spend ' + y + ' → link ' + (L + y), n: y });
      const rb = ra > 0 ? +(yield* pick('runner', 'traceR', 'Trace ' + base + ' (' + cause + '): you spend first. You have ' + L + ' link.', ropts, { always: true, pub: 'The Runner answers the trace first' })) : 0;
      pay('runner', rb, 'trace');
      const ca = avail('corp', 'trace');
      const copts = [];
      for (let x = 0; x <= Math.min(ca, 20); x++) copts.push({ id: String(x), label: 'Spend ' + x + ' → strength ' + (base + x) + (base + x > L + rb ? ' — it lands' : ''), n: x });
      const cb = +(yield* pick('corp', 'traceC', 'Trace ' + base + ' (' + cause + '): the Runner has ' + (L + rb) + '. How much do you spend?', copts, { always: true, pub: 'The Corp sets the trace' }));
      pay('corp', cb, 'trace');
      const str = base + cb;
      const ok = str > L + rb, excess = ok ? str - (L + rb) : 0;
      if (g.run) g.run.traced = true;
      g.revealN++;
      log({ t: 'trace', base, cb, str, link: L, rb, ok, cause });
      yield* hold({ k: 'trace', base, cb, str, link: L, rb, ok, cause });
      yield* emit('trace', { ok, excess, cause, str });
      return { ok, excess, str };
    }

    /* ================================================================
       Expose (Infiltration, Lemuria): Zaibatsu Loyalty may stop it.
       ================================================================ */
    function* expose(iid, cause) {
      if (mod('noExpose', false, { iid })) { log({ t: 'note', side: 'corp', text: 'That card cannot be exposed' }); return; }
      const zb = installedCorp().filter(i => card(i).k === 'zaibatsu');
      /* The Corp is always asked: whether it holds a Zaibatsu Loyalty must not show. */
      if (!zb.length) yield* pick('corp', 'zaibatsu', 'The Runner is about to expose one of your cards (' + srvName(serverOf(iid)) + ')', [{ id: 'no', label: 'Let it be exposed' }], { always: true, pub: 'The Corp may answer the expose' });
      for (const z of zb) {
        const opts = [];
        if (C.credits >= 1 || !card(z).rez) opts.push({ id: 'pay', label: (card(z).rez ? '' : 'Rez Zaibatsu Loyalty, then ') + 'pay 1 credit to stop it', bad: C.credits >= 1 + (card(z).rez ? 0 : rezCost(z)) ? null : 'Not enough credits' });
        opts.push({ id: 'trash', label: (card(z).rez ? '' : 'Rez Zaibatsu Loyalty, then ') + 'trash it to stop it' });
        opts.push({ id: 'no', label: 'Let the card be exposed' });
        const a = yield* pick('corp', 'zaibatsu', 'The Runner is about to expose one of your cards (' + (card(iid).rez ? nameOf(iid) : 'unrezzed, in ' + srvName(serverOf(iid))) + ')', opts, { always: true, pub: 'The Corp considers Zaibatsu Loyalty' });
        if (a === 'no') break;
        if (!card(z).rez) { card(z).rez = true; g.revealN++; log({ t: 'rez', iid: z, k: 'zaibatsu', cost: 0 }); }
        if (a === 'pay') pay('corp', 1, 'any'); else toArchives(z, true);
        log({ t: 'prevent', side: 'corp', k: 'zaibatsu', what: 'expose' });
        return;
      }
      g.revealN++;
      log({ t: 'expose', iid, k: card(iid).k, sid: (serverOf(iid) || {}).id, cause });
      yield* hold({ k: 'expose', iid, card: card(iid).k });
      yield* emit('expose', { iid });
      if (SC(iid) && SC(iid).exposed && isInstalled(iid)) yield* call(SC(iid).exposed, iid, {});
    }
    const srvName = s => s ? s.name : '?';

    /* ================================================================
       Setup
       ================================================================ */
    g.main = function* () {
      const rHand = dat(R.ident).hand || D.HAND;
      if (dat(R.ident).setAside) {
        const six = R.stack.splice(0, dat(R.ident).setAside);
        for (const i of six) { card(i).up = true; card(i).host = R.ident; card(i).x.facedown = true; R.ws.push(i); }
        const back = yield* pick('runner', 'aylaBack', nameOf(R.ident) + ': shuffle which 2 of your 6 set-aside cards back into your stack?', six.map(i => cardOpt(i)), { multi: true, min: 2, max: 2, pub: 'The Runner sets cards aside' });
        for (const i of back) { lift(i); wipe(card(i)); card(i).up = false; R.stack.push(i); }
        shuffleStack(true);
        log({ t: 'note', side: 'runner', text: nameOf(R.ident) + ' keeps 4 cards set aside' });
      }
      drawCorp(D.HAND, 'deal');
      drawRunner(rHand, 'deal');
      for (const side of ['corp', 'runner']) {
        const X = sideOf(side);
        const ok = yield* yesNo(side, 'mulligan', 'Your opening hand. Keep it, or shuffle it back and draw a new one (once)?', 'Keep these', 'Mulligan', { pub: (side === 'corp' ? 'The Corp' : 'The Runner') + ' looks at the opening hand' });
        X.mull = !ok;
        if (!ok) {
          if (side === 'corp') { C.rd.push(...C.hq.splice(0)); shuffleRD(); drawCorp(D.HAND, 'mulligan'); }
          else { R.stack.push(...R.grip.splice(0)); shuffleStack(true); drawRunner(rHand, 'mulligan'); }
        }
        log({ t: 'mulligan', side, did: !ok });
      }
      g.phase = 'play';
      yield* hold({ k: 'open' });
      for (;;) {
        yield* corpTurn();
        yield* runnerTurn();
        for (let x = 0; x < 3 && R.extraTurns > 0 && g.phase !== 'over'; x++) { R.extraTurns--; log({ t: 'note', side: 'runner', text: 'The Runner takes another turn (Encore)' }); yield* runnerTurn(); }
        if (g.opts.cap && g.round >= g.opts.cap) finish('cap', null);
      }
    };

    /* ================================================================
       The Corp's turn
       ================================================================ */
    function* corpTurn() {
      g.turnN++; g.round++;
      g.active = 'corp';
      C.clicks = mod('corpClicks', D.CLICKS.corp + C.score.filter(i => card(i).k === 'mandatory').length);
      if (C.clickPlus && C.clickPlus.turn === g.turnN) { C.clicks += C.clickPlus.n; log({ t: 'note', side: 'corp', text: 'The Corp has ' + plural(C.clickPlus.n, 'click') + ' more this turn (' + nameOf(C.clickPlus.iid) + ')' }); C.clickPlus = null; }
      if (C.clickCut && C.clickCut.turn === g.turnN) { C.clicks = Math.max(0, C.clicks - C.clickCut.n); log({ t: 'note', side: 'corp', text: 'The Corp has ' + plural(C.clickCut.n, 'click') + ' fewer this turn (' + nameOf(C.clickCut.iid) + ')' }); C.clickCut = null; }
      C.flags = {};
      for (const i of [C.ident].concat(installedCorp().filter(i => card(i).rez), C.cur)) refill(i);
      log({ t: 'turn', side: 'corp', round: g.round });
      yield* hold({ k: 'turn', side: 'corp', round: g.round });
      /* Before "when your turn begins": a moment to rez (so a PAD Campaign
         pays this turn). Asked whenever anything is unrezzed — whether there
         is something worth rezzing must not show (CHECKLIST C). */
      for (let guard = 0; guard < 8; guard++) {
        const hidden = corpPlaced().filter(i => !card(i).rez);
        if (!hidden.length) break;
        const opts = hidden.filter(i => dat(i).type !== 'agenda').map(i => cardOpt(i, 'Rez ' + nameOf(i) + ' (' + rezCost(i) + ')', srvName(serverOf(i)), C.credits < rezCost(i) ? 'Not enough credits' : dat(i).rezForfeit ? 'Rez Archer when it is approached' : rezBlock(i)));
        const a = yield* pick('corp', 'startRez', 'Your turn begins: rez anything first?', opts, { skip: 'Begin the turn', force: true, pub: 'The Corp’s turn begins' });
        if (!a) break;
        yield* rezFlow(a, false);
      }
      /* When your turn begins */
      for (const i of installedCorp().slice()) {
        const c = card(i);
        if (!c.rez) continue;
        if (c.k === 'pad') { gain('corp', 1); log({ t: 'gain', side: 'corp', n: 1, k: 'pad' }); }
        if (c.k === 'adonis' || c.k === 'eve') {
          const t = Math.min(c.k === 'eve' ? 2 : 3, c.cred);
          c.cred -= t; gain('corp', t);
          log({ t: 'gain', side: 'corp', n: t, k: c.k });
          if (c.cred <= 0) { toArchives(i, true); log({ t: 'empty', k: c.k }); }
        }
        if (c.k === 'marked' && c.cred > 0) { c.cred--; gain('corp', 1); log({ t: 'gain', side: 'corp', n: 1, k: 'marked' }); }
      }
      yield* emit('corpTurnBegin', {});
      /* Cards in Archives that act as the Corp's turn begins (Subliminal Messaging). */
      for (const i of C.arch.slice()) { const sc = SC(i); if (sc && sc.arch && sc.arch.corpTurnBegin && C.arch.indexOf(i) >= 0) yield* call(sc.arch.corpTurnBegin, i, {}); }
      /* The mandatory draw: an empty R&D loses the game. */
      if (!C.flags.noDraw) {
        if (!C.rd.length) finish('decked', 'runner');
        const was = C.hq.slice();
        drawCorp(mod('corpDraw', 1), 'turn');
        yield* emit('corpDrew', { iids: C.hq.filter(i => was.indexOf(i) < 0), mandatory: true });
      }
      yield* actions('corp');
      yield* discardDown('corp');
      yield* emit('corpTurnEnd', {});
      if (g.opts.campaign) {
        g.cautions = g.cautions || { corp: [], runner: [] };
        if (C.credits >= 20 && g.cautions.corp.indexOf('rich') < 0) { g.cautions.corp.push('rich'); log({ t: 'note', side: 'corp', text: 'Caution: the Corp ends a turn with 20 credits or more' }); }
        if ((C.flags.drawClicks || 0) >= 2 && g.cautions.corp.indexOf('draw') < 0) { g.cautions.corp.push('draw'); log({ t: 'note', side: 'corp', text: 'Caution: the Corp clicked to draw twice in a turn' }); }
      }
      /* The end of the turn */
      if (C.flags.bnews) { const lose = Math.min(R.tags, 2 * C.flags.bnews); R.tags -= lose; if (lose) log({ t: 'untag', n: lose, k: 'breaking_news' }); }
      for (const i of installedCorp()) card(i).boost = 0;
      turnEnds();
      g.active = null;
    }
    /* When a turn ends (either side's): Chimera derezzes. */
    function turnEnds() {
      for (const i of installedCorp()) if (card(i).k === 'chimera' && card(i).rez) { card(i).rez = false; card(i).chimera = null; log({ t: 'derez', k: 'chimera', why: 'turn' }); }
    }

    /* ================================================================
       The Runner's turn
       ================================================================ */
    function* runnerTurn() {
      g.turnN++;
      g.active = 'runner';
      R.clicks = mod('runnerClicks', D.CLICKS.runner);
      if (R.loseNext) { const n = Math.min(R.clicks, R.loseNext); R.clicks -= n; R.loseNext = 0; if (n) log({ t: 'loseClick', k: 'load_testing', n }); }
      R.flags = {};
      for (const i of [R.ident].concat(R.rig, R.cur)) refill(i);
      log({ t: 'turn', side: 'runner', round: g.round });
      yield* hold({ k: 'turn', side: 'runner', round: g.round });
      /* When your turn begins */
      for (const i of rigCards('parasite')) { card(i).virus++; log({ t: 'virus', k: 'parasite', n: card(i).virus }); }
      checkParasites();
      for (const i of rigCards('wyldside')) { drawRunner(2, 'wyldside'); R.clicks = Math.max(0, R.clicks - 1); log({ t: 'loseClick', k: 'wyldside' }); }
      for (const i of rigCards('joshua')) {
        if (yield* yesNo('runner', 'joshua', 'Joshua B.: gain a click now, and take a tag when the turn ends?', 'Gain a click', 'No', { pub: 'The Runner considers Joshua B.' })) { R.clicks++; R.flags.joshua = (R.flags.joshua || 0) + 1; log({ t: 'clicks', side: 'runner', n: 1, k: 'joshua' }); }
      }
      for (const i of rigCards('underworld')) if (link() >= 2) { gain('runner', 1); log({ t: 'gain', side: 'runner', n: 1, k: 'underworld' }); }
      for (const i of rigCards('darwin')) {
        if (avail('runner', 'any') >= 1 && (yield* yesNo('runner', 'darwin', 'Darwin: pay 1 credit for a virus counter (it is ' + card(i).virus + ' strong)?', 'Pay 1', 'No', { pub: 'The Runner considers Darwin' }))) { pay('runner', 1, 'any'); addVirus(i, 1); }
      }
      for (const i of rigCards('deep_thought')) if (card(i).virus >= 3 && C.rd.length) { R.peek = { iid: C.rd[0], k: card(C.rd[0]).k, turn: g.turnN }; log({ t: 'peek', k: 'deep_thought' }); }
      if (onWorkshop().length) {
        const w = onWorkshop().filter(x => card(x).power > 0);
        const t = yield* pick('runner', 'workshop', 'Personal Workshop: take a power counter off which card?', w.map(x => cardOpt(x, null, plural(card(x).power, 'counter') + ' left')), { pub: 'Personal Workshop' });
        if (t) yield* workshopTick(t, 'turn');
      }
      for (const i of rigCards('aesops')) {
        const others = R.rig.filter(x => x !== i);
        if (!others.length) continue;
        const a = yield* pick('runner', 'aesops', 'Aesop’s Pawnshop: trash another of your installed cards to gain 3 credits?', others.map(x => cardOpt(x)), { skip: 'Not now', pub: 'The Runner visits Aesop’s Pawnshop' });
        if (a) { trashRunner(a, 'aesops'); gain('runner', 3); log({ t: 'gain', side: 'runner', n: 3, k: 'aesops' }); }
      }
      yield* emit('runnerTurnBegin', {});
      yield* actions('runner');
      yield* discardDown('runner');
      yield* emit('runnerTurnEnd', {});
      if (g.opts.campaign) {
        g.cautions = g.cautions || { corp: [], runner: [] };
        if (R.credits < 3 && g.cautions.runner.indexOf('broke') < 0) { g.cautions.runner.push('broke'); log({ t: 'note', side: 'runner', text: 'Caution: the Runner ends a turn with fewer than 3 credits' }); }
        if (!R.flags.ran && g.cautions.runner.indexOf('idle') < 0) { g.cautions.runner.push('idle'); log({ t: 'note', side: 'runner', text: 'Caution: the Runner made no run this turn' }); }
      }
      /* When the turn ends */
      if (R.flags.joshua) yield* giveTags(R.flags.joshua, 'Joshua B.');
      for (const t of R.flags.testRun || []) if (R.rig.indexOf(t) >= 0) { for (const h of hostedOn(t)) trashRunner(h, 'host'); lift(t); wipe(card(t)); R.stack.unshift(t); log({ t: 'testRunBack', k: card(t).k }); }
      R.last = { trashedAccess: !!R.flags.trashedAccess, ran: !!R.flags.ran, success: !!R.flags.success, stole: !!R.flags.stole, failed: !!R.flags.failed, installedRes: !!R.flags.installedRes, stolePts: R.flags.stolePts || 0 };
      turnEnds();
      g.active = null;
    }
    /* Personal Workshop: a counter comes off; at none, the card installs free. */
    function* workshopTick(iid, why) {
      card(iid).power--;
      log({ t: 'workshop', k: card(iid).k, n: card(iid).power });
      if (card(iid).power <= 0) yield* fromWorkshop(iid);
    }
    /* Off the Workshop and into the rig, free — or to the heap if it cannot go in. */
    function* fromWorkshop(iid) {
      yield* runnerInstall(iid, { free: true, from: 'workshop' });
      if (R.ws.indexOf(iid) >= 0) trashRunner(iid, 'nowhere');
    }

    function* discardDown(side) {
      const X = sideOf(side), hand = side === 'corp' ? C.hq : R.grip;
      const max = side === 'corp' ? corpHandMax() : runHandMax();
      if (side === 'runner' && max < 0) finish('flatline', 'corp');
      const over = hand.length - max;
      if (over <= 0) return;
      const ids = yield* pick(side, 'discard', 'End of turn: your maximum hand size is ' + max + '. Discard ' + over + '.', hand.map(i => cardOpt(i)), { multi: true, min: over, max: over, pub: (side === 'corp' ? 'The Corp' : 'The Runner') + ' discards down to ' + max });
      const ks = [];
      for (const i of ids) {
        if (side === 'corp') toArchives(i, false);
        else { lift(i); card(i).up = true; R.heap.push(i); ks.push(card(i).k); }
      }
      log({ t: 'discard', side, n: ids.length, ks: side === 'runner' ? ks : null });
      if (side === 'runner') heardTrash(ids, true);
    }

    /* ================================================================
       The action loop: ask for an action from the turn menu until the clicks
       are spent and nothing free is left (or End is chosen).
       ================================================================ */
    function* actions(side) {
      const X = sideOf(side);
      for (let guard = 0; guard < 400; guard++) {
        if (side === 'corp' && C.flags.terminal) return;
        const menu = turnMenu(side);
        const legal = menu.filter(o => !o.bad);
        if (!legal.length || (legal.length === 1 && legal[0].id === 'end')) return;
        const a = yield* ask(side, { t: 'turn', why: X.clicks ? (side === 'corp' ? 'Your turn — ' : 'Your turn — ') + plural(X.clicks, 'click') + ' left' : 'No clicks left — anything free before you end?', pub: (side === 'corp' ? 'The Corp' : 'The Runner') + ' is taking a turn' });
        if (a.id === 'end') return;
        if (side === 'runner') { const opt = menu.find(o => o.id === a.id); if (opt && opt.kind !== 'free') yield* emit('runnerAction', { id: a.id, opt }); }
        yield* (side === 'corp' ? doCorp(a.id) : doRunner(a.id));
        sideOf(side).flags.acted = true;
        yield* settlePending();
        winCheck();
      }
    }

    /* ================================================================
       THE TURN MENU — one pure function per side. The phone renders it, the
       house scores it, the answer check re-runs it: nothing offered is
       refused, and a greyed button says why.
       ================================================================ */
    function turnMenu(side) { return side === 'corp' ? corpMenu() : runnerMenu(); }
    const tagged = () => R.tags > 0 || !!mod('alwaysTagged', false, {});
    function corpNeed(k) {
      const n = CARD[k].need;
      if (n === 'tagged' && !tagged()) return 'Only while the Runner is tagged';
      if (n === 'ranLast' && !R.last.ran) return 'Only if the Runner ran on their last turn';
      if (n === 'successLast' && !R.last.success) return 'Only after a successful run on the Runner’s last turn';
      if (n === 'scoredThisTurn' && !C.flags.scored) return 'Only after you score an agenda this turn';
      if (n === 'stoleLast' && !R.last.stole) return 'Only if the Runner stole an agenda on their last turn';
      return null;
    }
    function corpMenu() {
      const o = [];
      const k = C.clicks;
      const nc = k < 1 ? 'No clicks left' : null;
      o.push({ id: 'draw', kind: 'basic', label: 'Draw a card', sub: 'One click', bad: nc || (C.rd.length ? null : 'R&D is empty') });
      o.push({ id: 'credit', kind: 'basic', label: 'Gain 1 credit', sub: 'One click', bad: nc });
      for (const i of C.hq) {
        const d = dat(i);
        if (d.type === 'operation') {
          const cost = d.cost === 'X' ? 1 : playCost(i);
          let bad = nc || (k < 1 + extraClicks(i) ? 'A double: takes two clicks' : null) || corpNeed(card(i).k) || (C.credits < cost ? 'Costs ' + cost + ' — you have ' + C.credits : null);
          if (!bad && card(i).k === 'archived_memories' && !C.arch.length) bad = 'Archives is empty';
          if (!bad && (card(i).k === 'psychographics' || card(i).k === 'kaguya') && !advTargets().length) bad = 'Nothing installed can be advanced';
          if (!bad && card(i).k === 'precognition' && !C.rd.length) bad = 'R&D is empty';
          if (!bad && card(i).k === 'agg_neg' && !C.rd.length) bad = 'R&D is empty';
          if (!bad) bad = opBad(card(i).k, i);
          if (!bad && SC(i) && SC(i).playBad) bad = SC(i).playBad(X, i) || null;
          o.push({ id: 'play:' + i, kind: 'play', card: card(i).k, label: 'Play ' + d.name, sub: (d.cost === 'X' ? 'X credits' : d.cost + ' credit' + (d.cost === 1 ? '' : 's')) + ' · ' + d.text, bad });
        } else {
          const ts = corpTargets(i, {});
          o.push({ id: 'install:' + i, kind: 'install', card: card(i).k, label: 'Install ' + d.name, sub: d.type === 'ice' ? 'Ice · ' + d.cost + ' to rez' : d.type, bad: nc || (ts.some(t => !t.bad) ? null : 'Nowhere you can afford') || mod('corpInstallBad', null, { iid: i }) });
        }
      }
      for (const i of advTargets()) o.push({ id: 'adv:' + i, kind: 'adv', label: 'Advance ' + nameOf(i), sub: srvName(serverOf(i)) + ' · ' + card(i).adv + (dat(i).type === 'agenda' ? ' of ' + advNeed(i) : '') + ' · one click and 1 credit', bad: nc || (C.flags.noAdvance ? 'You cannot advance cards this turn' : null) || (avail('corp', 'advance', advCtx(i)) < 1 + Math.max(0, mod('advTax', 0, {})) ? 'No credits' : null) });
      const trc = 2 + Math.max(0, mod('trashResCost', 0, {}));
      if (tagged()) for (const i of rigOf('resource')) o.push({ id: 'trashres:' + i, kind: 'trashres', label: 'Trash ' + nameOf(i), sub: 'The Runner is tagged · one click and ' + trc + ' credits', bad: nc || (C.credits < trc ? 'Costs ' + trc : null) });
      if (R.rig.some(i => card(i).virus > 0)) o.push({ id: 'purge', kind: 'basic', label: 'Purge virus counters', sub: 'Three clicks: every virus counter goes', bad: k < 3 ? 'Takes three clicks' : null });
      for (const i of installedCorp()) {
        const c = card(i);
        if (!c.rez) continue;
        if (c.k === 'melange') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Melange Mining Corp.: gain 7', sub: 'Three clicks', bad: k < 3 ? 'Takes three clicks' : null });
        if (c.k === 'sec_sub') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Security Subcontract: trash an ice, gain 4', sub: 'One click and a rezzed ice', bad: nc || (installedCorp().some(x => dat(x).type === 'ice' && card(x).rez) ? null : 'No rezzed ice') });
        if (c.k === 'data_raven' && c.power > 0) o.push({ id: 'raven:' + i, kind: 'free', label: 'Data Raven: spend a power counter — 1 tag', sub: plural(c.power, 'counter') + ' · free' });
        if (c.k === 'marked') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Marked Accounts: put 3 credits on it', sub: 'One click · ' + c.cred + ' on it', bad: nc });
        if (c.k === 'private_contracts') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Private Contracts: take 2 credits', sub: 'One click · ' + c.cred + ' left', bad: nc });
        if (c.k === 'ronin' && c.adv >= 4) o.push({ id: 'ab:' + i, kind: 'ability', label: 'Ronin: trash it for 3 net damage', sub: 'One click', bad: nc });
      }
      for (const i of C.score) {
        const c = card(i);
        if (c.k === 'psf') o.push({ id: 'psf:' + i, kind: 'ability', label: 'Private Security Force: 1 meat damage', sub: 'One click · the Runner is tagged', bad: nc || (tagged() ? null : 'The Runner is not tagged') });
        if (c.k === 'astroscript' && c.agenda > 0) o.push({ id: 'astro:' + i, kind: 'free', label: 'AstroScript: place an advancement token', sub: 'Spend its agenda counter · free', bad: advTargets().length ? null : 'Nothing can be advanced' });
        if (c.k === 'datapool') o.push({ id: 'sab:' + i, kind: 'ability', label: 'Restructured Datapool: trace 2 for a tag', sub: 'One click', bad: nc });
        if (c.k === 'gov_contracts') o.push({ id: 'sab:' + i, kind: 'ability', label: 'Government Contracts: gain 4', sub: 'Two clicks', bad: k < 2 ? 'Takes two clicks' : null });
        if (c.k === 'exec_retreat' && c.agenda > 0) o.push({ id: 'sab:' + i, kind: 'ability', label: 'Executive Retreat: draw 5', sub: 'One click and its counter', bad: nc });
        if (c.k === 'vitruvius' && c.agenda > 0) o.push({ id: 'sab:' + i, kind: 'free', label: 'Project Vitruvius: a card from Archives to HQ', sub: 'Spend a counter · free', bad: C.arch.length ? null : 'Archives is empty' });
        if (c.k === 'atlas' && c.agenda > 0) o.push({ id: 'sab:' + i, kind: 'free', label: 'Project Atlas: find a card in R&D', sub: 'Spend a counter · free', bad: C.rd.length ? null : 'R&D is empty' });
      }
      for (const i of corpPlaced()) {
        const c = card(i), d = dat(i);
        if (!c.rez && d.type !== 'agenda') {
          const cost = rezCost(i);
          let bad = avail('corp', d.type === 'ice' ? 'rezIce' : 'rez', { iid: i }) < cost ? 'Costs ' + cost + ' — you have ' + C.credits : null;
          if (d.rezForfeit && !C.score.length) bad = 'You must forfeit an agenda, and have none';
          if (rezBlock(i)) bad = rezBlock(i);
          o.push({ id: 'rez:' + i, kind: 'free', card: c.k, label: 'Rez ' + d.name + ' (' + cost + ')', sub: srvName(serverOf(i)) + ' · free', bad });
        }
        if (d.type === 'agenda' && c.adv >= advNeed(i) && !(c.x.lockUntil > g.turnN) && !(C.hosted.indexOf(i) >= 0 && !hostedAct(i)) && !mod('noScore', false, { iid: i })) o.push({ id: 'score:' + i, kind: 'free', card: c.k, label: 'Score ' + d.name, sub: d.pts + ' point' + (d.pts === 1 ? '' : 's') + ' · free' });
      }
      o.push(...scriptAbils('corp'));
      o.push({ id: 'end', kind: 'end', label: 'End your turn', bad: k > 0 ? 'Spend your clicks first' : null });
      return o;
    }
    function advTargets() { return corpPlaced().filter(i => canAdvance(i)); }
    const advCtx = i => ({ ice: dat(i).type === 'ice', sid: (serverOf(i) || {}).id });
    function opBad(k, i) {
      const ice = installedCorp().filter(x => dat(x).type === 'ice');
      if (k === 'trick_light' && !(advTargets().length >= 2 && installedCorp().some(x => card(x).adv > 0))) return 'No advancement tokens to move';
      if (k === 'sunset' && !C.servers.some(sv => sv.ice.length >= 2)) return 'No server with two ice';
      if (k === 'rework' && C.hq.length < 2) return 'Nothing else in HQ';
      if ((k === 'commercialization') && !ice.length) return 'No ice installed';
      if (k === 'oversight' && !ice.some(x => !card(x).rez)) return 'No unrezzed ice';
      if (k === 'freelancer' && !rigOf('resource').length) return 'The Runner has no resources';
      if (k === 'foxfire' && !R.rig.some(x => /Virtual|Link/.test(dat(x).kw || ''))) return 'No virtual resource or link card to trash';
      if (k === 'pgo' && !rigOf('hardware').length) return 'The Runner has no hardware';
      return null;
    }
    /* Where a Corp card can go. */
    function corpTargets(iid, o) {
      const out = corpTargets0(iid, o);
      if (o && o.free) return out;
      for (const t of out) {
        if (/^host:/.test(t.id) || t.id === 'new') continue;
        const tax = Math.max(0, mod('corpInstallTax', 0, { iid, sid: t.id }));
        if (!tax) continue;
        t.cost = (t.cost || 0) + tax;
        t.sub = (t.sub ? t.sub + ' · ' : '') + tax + ' more (Diwan)';
        if (avail('corp', 'install', { sid: t.id, ice: dat(iid).type === 'ice' }) < t.cost) t.bad = 'Costs ' + t.cost;
      }
      return out;
    }
    function corpTargets0(iid, o) {
      const d = dat(iid);
      const out = [];
      const nextName = 'Server ' + (C.remoteN + 1);
      for (const h of corpActives()) {
        const sc = SC(h);
        if (sc && sc.hostTarget && sc.hostTarget(X, h, iid)) out.push({ id: 'host:' + h, label: 'On ' + nameOf(h) + ' (' + srvName(serverOf(h)) + ')', sub: 'free', cost: 0 });
      }
      if (d.type === 'ice') {
        for (const s of C.servers) {
          const cost = o.free ? 0 : Math.max(0, mod('iceInstallCost', s.ice.length, { iid, sid: s.id }));
          out.push({ id: s.id, label: 'In front of ' + s.name, sub: 'Costs ' + cost + (s.ice.length ? ' (' + plural(s.ice.length, 'ice') + ' already there)' : ''), cost, bad: avail('corp', 'install', { sid: s.id, ice: true }) < cost ? 'Costs ' + cost + ' — you have ' + C.credits : null });
        }
        out.push({ id: 'new', label: 'A new remote server (' + nextName + ')', sub: 'Costs 0', cost: 0 });
        return out;
      }
      if (d.type === 'upgrade') {
        for (const s of C.servers) {
          if (d.hqOnly && s.id !== 'hq') continue;
          if (d.rdOnly && s.id !== 'rd') continue;
          if (d.remoteOnly && !isRemote(s.id)) continue;
          let sub = null;
          if (d.kw === 'Region') { const old = s.root.find(i => dat(i).kw === 'Region'); if (old) sub = 'Replaces ' + nameOf(old) + ' (one region per server)'; }
          out.push({ id: s.id, label: 'In ' + s.name, sub, cost: 0 });
        }
        if (!d.hqOnly && !d.rdOnly) out.push({ id: 'new', label: 'A new remote server (' + nextName + ')', cost: 0 });
        return out;
      }
      for (const s of remotes()) {
        const old = s.root.find(i => ['agenda', 'asset'].indexOf(dat(i).type) >= 0);
        out.push({ id: s.id, label: 'In ' + s.name, sub: old ? 'Replaces ' + nameOf(old) + ' (trashed face down)' : (s.ice.length ? plural(s.ice.length, 'ice') + ' protecting it' : 'No ice'), cost: 0 });
      }
      out.push({ id: 'new', label: 'A new remote server (' + nextName + ')', cost: 0 });
      return out;
    }

    function runnerMenu() {
      const o = [];
      const k = R.clicks;
      const nc = k < 1 ? 'No clicks left' : null;
      o.push({ id: 'draw', kind: 'basic', label: 'Draw a card', sub: 'One click', bad: nc || (R.stack.length ? null : 'Your stack is empty') });
      o.push({ id: 'credit', kind: 'basic', label: 'Gain 1 credit', sub: 'One click', bad: nc });
      for (const i of R.grip) {
        const d = dat(i);
        if (d.type === 'event') {
          let bad = nc || (k < 1 + extraClicks(i) ? 'Takes ' + plural(1 + extraClicks(i), 'click') : null) || (avail('runner', 'event', { run: /\bRun\b/.test(d.kw || '') }) < playCost(i) ? 'Costs ' + playCost(i) + ' — you have ' + R.credits : null);
          if (!bad) bad = eventBad(i);
          if (!bad && /\bPriority\b/.test(d.kw || '') && R.flags.acted) bad = 'Only as your first click';
          if (!bad && /\bCurrent\b/.test(d.kw || '') && mod('noRunnerCurrent', false, {})) bad = 'The Runner cannot play currents';
          if (!bad && SC(i) && SC(i).playBad) bad = SC(i).playBad(X, i) || null;
          o.push({ id: 'event:' + i, kind: 'event', card: card(i).k, label: 'Play ' + d.name, sub: d.cost + ' credit' + (d.cost === 1 ? '' : 's') + ' · ' + d.text, bad });
        } else {
          const cost = installCost(i, 0);
          let bad = nc || (avail('runner', installWhy(d)) < cost ? 'Costs ' + cost + ' — you have ' + R.credits : null);
          if (!bad) bad = installBad(i);
          o.push({ id: 'install:' + i, kind: 'install', card: card(i).k, label: 'Install ' + d.name, sub: cost + ' credit' + (cost === 1 ? '' : 's') + (d.mu ? ' · ' + d.mu + ' memory' : '') + ' · ' + d.type, bad });
        }
      }
      const utc = 2 + mod('untagCost', 0, {});
      if (R.tags > 0) o.push({ id: 'untag', kind: 'basic', label: 'Remove a tag', sub: 'One click and ' + utc + ' credits · ' + plural(R.tags, 'tag'), bad: nc || (avail('runner', 'tag') < utc ? 'Costs ' + utc : null) });
      const rx = runExtra();
      for (const s of C.servers) o.push({ id: 'run:' + s.id, kind: 'run', label: 'Run ' + s.name, sub: runSub(s) + (rx ? ' · costs ' + plural(1 + rx, 'click') : ''), sid: s.id, bad: nc || (k < 1 + rx ? 'Takes ' + plural(1 + rx, 'click') : null) || runBad(s.id, 1 + rx) });
      for (const i of R.rig) {
        const c = card(i);
        if (c.k === 'magnum_opus') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Magnum Opus: gain 2 credits', sub: 'One click', bad: nc });
        if (c.k === 'armitage') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Armitage Codebusting: take 2 credits', sub: 'One click · ' + c.cred + ' left', bad: nc });
        if (c.k === 'crypsis') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Crypsis: add a virus counter', sub: 'One click · ' + plural(c.virus, 'counter'), bad: nc });
        if (c.k === 'djinn') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Djinn: find a virus program', sub: 'One click and 1 credit', bad: nc || (R.credits < 1 ? 'Costs 1' : null) || (R.stack.some(x => dat(x).virus) ? null : 'No virus program in your stack') });
        if (c.k === 'lemuria') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Lemuria Codecracker: expose a card', sub: 'One click and 1 credit', bad: nc || (R.flags.hqSuccess ? null : 'Only after a successful run on HQ this turn') || (R.credits < 1 ? 'Costs 1' : null) || (installedCorp().some(x => !card(x).rez) ? null : 'Nothing unrezzed to expose') });
        if (c.k === 'sneakdoor') o.push({ id: 'ab:' + i, kind: 'run', label: 'Sneakdoor Beta: run Archives as HQ', sub: 'One click · ' + runSub(server('arch')), sid: 'arch', bad: nc || runBad('arch', 1) });
        if (c.k === 'liberated') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Liberated Account: take 4 credits', sub: 'One click · ' + c.cred + ' left', bad: nc });
        if (c.k === 'kati') {
          o.push({ id: 'ab:' + i, kind: 'ability', label: 'Kati Jones: put 3 credits on her', sub: 'One click · once a turn · ' + c.cred + ' on her', bad: nc || (R.flags.kati ? 'Once a turn' : null) });
          o.push({ id: 'kati:' + i, kind: 'ability', label: 'Kati Jones: take the ' + c.cred + ' on her', sub: 'One click · once a turn', bad: nc || (R.flags.kati ? 'Once a turn' : c.cred ? null : 'Nothing on her yet') });
        }
        if (c.k === 'mr_li') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Mr. Li: draw 2, put 1 back under', sub: 'One click', bad: nc || (R.stack.length ? null : 'Your stack is empty') });
        if (c.k === 'all_nighter') o.push({ id: 'ab:' + i, kind: 'ability', label: 'All-nighter: trash it for two clicks', sub: 'One click', bad: nc });
        if (c.k === 'dlr' && R.tags > 0) o.push({ id: 'ab:' + i, kind: 'ability', label: 'Data Leak Reversal: the Corp trashes the top of R&D', sub: 'One click · you are tagged', bad: nc || (C.rd.length ? null : 'R&D is empty') });
        if (c.k === 'workshop') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Personal Workshop: put a card on it', sub: 'One click · a program or hardware from your grip', bad: nc || (R.grip.some(x => ['program', 'hardware'].indexOf(dat(x).type) >= 0) ? null : 'No program or hardware in your grip') });
        if (c.k === 'cortez') o.push({ id: 'ab:' + i, kind: 'free', label: 'Cortez Chip: trash it — an ice costs 2 more to rez this turn', sub: 'Free', bad: installedCorp().some(x => dat(x).type === 'ice' && !card(x).rez) ? null : 'No unrezzed ice' });
        if (c.k === 'data_dealer') o.push({ id: 'ab:' + i, kind: 'ability', label: 'Data Dealer: forfeit an agenda for 9', sub: 'One click', bad: nc || (R.score.length ? null : 'No agenda to forfeit') });
      }
      o.push(...scriptAbils('runner'));
      const mustRun = !R.flags.acted && mod('firstClickRun', false, {});
      if (mustRun) for (const x of o) if (!x.bad && x.kind !== 'run' && x.kind !== 'free' && x.kind !== 'end' && !(x.kind === 'event' && /\bRun\b/.test(dat(x.id.split(':')[1]).kw || ''))) x.bad = 'Always Be Running: your first click must run';
      for (const w of onWorkshop()) o.push({ id: 'ws:' + w, kind: 'free', label: 'Personal Workshop: 1 credit off ' + nameOf(w), sub: plural(card(w).power, 'counter') + ' left · free', bad: avail('runner', 'any') < 1 ? 'No credits' : null });
      o.push({ id: 'end', kind: 'end', label: 'End your turn', bad: k > 0 ? 'Spend your clicks first' : null });
      return o;
    }
    const runExtra = () => Math.max(0, mod('runClicks', 0, {}));
    /* Cards waiting on a Personal Workshop (R.ws also holds what other cards carry face down). */
    const onWorkshop = () => R.ws.filter(i => !card(i).host || (card(card(i).host) && card(card(i).host).k === 'workshop'));
    const heapLocked = () => !!mod('heapLocked', false, {});
    const installWhy = d => d.type === 'hardware' ? 'hardware' : d.virus ? 'virus' : d.type === 'program' ? 'program' : 'any';
    /* Whether a run on a server may start now (clicks: those left after this
       action's own click is paid). */
    function runBad(sid, clicksFirst) {
      if (R.flags.noRun) return 'No more runs this turn';
      if (!R.flags.ran && g.active === 'runner') { const fee = Math.max(0, mod('runCost', 0, { sid })); if (fee && avail('runner', 'any') < fee) return 'Your first run costs ' + fee; }
      const why = mod('runBad', null, { sid, clicksFirst: clicksFirst || 0 });
      if (why) return why;
      if (isRemote(sid) && idK('corp') === 'replicating' && !R.flags.ranCentral) return 'Replicating Perfection: run HQ, R&D or Archives first';
      const sv = server(sid);
      const ruhr = sv ? rezzed('ruhr', sv.root).length : 0;
      if (ruhr && R.clicks - (clicksFirst || 0) < ruhr) return 'Ruhr Valley: a run here costs another click';
      return null;
    }
    /* What the Runner knows about a server: its rezzed ice, what is unrezzed. */
    function runSub(s) {
      const known = s.ice.filter(i => card(i).rez).map(i => nameOf(i));
      const hidden = s.ice.length - known.length;
      const bits = [];
      if (!s.ice.length) bits.push('no ice');
      if (known.length) bits.push(known.join(', '));
      if (hidden) bits.push(plural(hidden, 'unrezzed ice', 'unrezzed ice'));
      if (isRemote(s.id)) bits.push(plural(s.root.length, 'card') + ' inside');
      return bits.join(' · ');
    }
    function eventBad(i) {
      const k = card(i).k;
      if (k === 'forged' && !installedCorp().some(x => dat(x).type === 'ice' && !card(x).rez)) return 'No unrezzed ice';
      if (k === 'tinkering' && !installedCorp().some(x => dat(x).type === 'ice')) return 'No ice';
      if (k === 'deja_vu' && !R.heap.length) return 'Your heap is empty';
      if (k === 'deja_vu' && heapLocked()) return 'Cards cannot leave your heap';
      if (k === 'special_order' && !R.stack.some(x => dat(x).brk)) return 'No icebreaker in your stack';
      if (k === 'modded' && !R.grip.some(x => x !== i && ['program', 'hardware'].indexOf(dat(x).type) >= 0 && !installBad(x) && avail('runner', installWhy(dat(x))) >= installCost(x, 3))) return 'Nothing in your grip it could install';
      const f = R.flags.succ || {};
      if (k === 'notoriety' && !(f.hq && f.rd && f.arch)) return 'Only after successful runs on HQ, R&D and Archives this turn';
      if (k === 'em_shutdown' && !R.flags.hqSuccess) return 'Only after a successful run on HQ this turn';
      if (k === 'em_shutdown' && !installedCorp().some(x => dat(x).type === 'ice' && card(x).rez)) return 'No rezzed ice';
      if (k === 'surge' && !(R.flags.virusOn || []).some(x => R.rig.indexOf(x) >= 0)) return 'Only after you put a virus counter on a program this turn';
      if (k === 'kraken' && !R.flags.stole) return 'Only after you steal an agenda this turn';
      if (k === 'kraken' && !C.servers.some(sv => sv.ice.length)) return 'No ice to trash';
      if (k === 'sat_uplink' && !installedCorp().some(x => !card(x).rez)) return 'Nothing unrezzed to expose';
      if (k === 'networking' && !R.tags) return 'You have no tags';
      if (k === 'test_run' && !R.stack.concat(R.heap).some(x => x !== i && dat(x).type === 'program')) return 'No program in your stack or heap';
      const runs = { vamp: 'hq', retrieval: 'arch', indexing: 'rd', account_siphon: 'hq', makers_eye: 'rd' };
      if (runs[k]) return runBad(runs[k], 1);
      if (k === 'demolition_run') return runBad('hq', 1) && runBad('rd', 1);
      if (k === 'stimhack' || k === 'inside_job') return C.servers.every(sv => runBad(sv.id, 1)) ? runBad('hq', 1) : null;
      return null;
    }
    function installCost(i, discount) {
      const d = dat(i);
      if (discount === 'free') return 0;
      let cost = d.cost - (discount || 0);
      if (idK('runner') === 'kate' && !R.flags.kate && (d.type === 'program' || d.type === 'hardware')) cost -= 1;
      return Math.max(0, mod('installCost', cost, { iid: i }));
    }
    function installBad(i) {
      const d = dat(i);
      if (d.onIce && !installedCorp().some(x => dat(x).type === 'ice' && card(x).rez)) return 'Needs a rezzed ice to live on';
      if (d.onBreaker && !breakers().length) return 'Needs an icebreaker to sit on';
      if (card(i).k === 'dlr' && !R.flags.succCentral) return 'Only after a successful run on HQ, R&D or Archives this turn';
      if (SC(i) && SC(i).installBad) { const b = SC(i).installBad(X, i); if (b) return b; }
      return mod('runnerInstallBad', null, { iid: i }) || null;
    }

    /* ================================================================
       Doing a Corp action
       ================================================================ */
    function* doCorp(id) {
      const before = C.clicks;
      const [kind0, x0] = id.split(':');
      const key = kind0 === 'play' ? 'play:' + card(x0).k : (kind0 === 'x' || kind0 === 'ab' || kind0 === 'sab') ? id : kind0;
      yield* doCorpInner(id);
      const spent = before - C.clicks;
      if (spent <= 0 || g.phase !== 'play') return;
      C.flags.acts = C.flags.acts || {};
      C.flags.acts[key] = (C.flags.acts[key] || 0) + spent;
      if (C.flags.acts[key] >= 3 && !C.flags.jeeves && rezzed('jeeves').length) { C.flags.jeeves = true; C.clicks++; log({ t: 'clicks', side: 'corp', n: 1, k: 'jeeves' }); }
    }
    function* doCorpInner(id) {
      const [kind, iid] = id.split(':');
      const click = n => { C.clicks -= n; };
      if (kind === 'draw') { click(1); C.flags.drawClicks = (C.flags.drawClicks || 0) + 1; const was = C.hq.slice(); drawCorp(1, 'click'); yield* emit('corpDrew', { iids: C.hq.filter(i => was.indexOf(i) < 0), basic: true }); yield* emit('corpBasic', { what: 'draw' }); return; }
      if (kind === 'credit') { click(1); gain('corp', 1); log({ t: 'click', side: 'corp', what: 'credit' }); yield* emit('corpBasic', { what: 'credit' }); return; }
      if (kind === 'install') { click(1); yield* corpInstall(iid, {}); return; }
      if (kind === 'play') {
        click(1 + extraClicks(iid)); yield* playOp(iid); yield* emit('opDone', { iid });
        if (/\bTerminal\b/.test(dat(iid).kw || '') && g.phase === 'play') { C.clicks = 0; C.flags.terminal = true; log({ t: 'note', side: 'corp', text: nameOf(iid) + ' is terminal: the Corp’s actions end' }); }
        return;
      }
      if (kind === 'adv') { click(1); pay('corp', 1, 'advance', advCtx(iid)); const tax = Math.max(0, mod('advTax', 0, {})); if (tax) pay('corp', tax, 'any'); card(iid).adv++; log({ t: 'adv', iid, sid: serverOf(iid).id, n: card(iid).adv, k: card(iid).rez ? card(iid).k : null }); yield* emit('advanced', { iid, n: 1 }); return; }
      if (kind === 'trashres') { click(1); pay('corp', 2 + Math.max(0, mod('trashResCost', 0, {})), 'any'); yield* corpTrashes(iid, 'tagged'); return; }
      if (kind === 'purge') { click(3); yield* purge(); return; }
      if (kind === 'ab') {
        const k = card(iid).k;
        if (k === 'melange') { click(3); gain('corp', 7); log({ t: 'gain', side: 'corp', n: 7, k }); return; }
        if (k === 'marked') { click(1); card(iid).cred += 3; log({ t: 'load', k, n: card(iid).cred }); return; }
        if (k === 'private_contracts') { click(1); const t = Math.min(2, card(iid).cred); card(iid).cred -= t; gain('corp', t); log({ t: 'gain', side: 'corp', n: t, k }); if (card(iid).cred <= 0) { toArchives(iid, true); log({ t: 'empty', k }); } return; }
        if (k === 'ronin') { click(1); toArchives(iid, true); log({ t: 'use', side: 'corp', k }); yield* damage('net', 3, 'Ronin'); return; }
        if (k === 'sec_sub') {
          click(1);
          const ice = yield* pick('corp', 'secSub', 'Security Subcontract: trash which rezzed ice?', installedCorp().filter(x => dat(x).type === 'ice' && card(x).rez).map(x => cardOpt(x, null, srvName(serverOf(x)))), { always: true });
          toArchives(ice, true);
          gain('corp', 4);
          log({ t: 'secsub', k: card(ice).k });
          return;
        }
      }
      if (kind === 'psf') { click(1); log({ t: 'use', side: 'corp', k: 'psf' }); yield* damage('meat', 1, 'Private Security Force'); return; }
      if (kind === 'raven') { card(iid).power--; log({ t: 'use', side: 'corp', k: 'data_raven' }); yield* giveTags(1, 'Data Raven'); return; }
      if (kind === 'astro') {
        const t = yield* pick('corp', 'astroTo', 'AstroScript: place an advancement token on…', advTargets().map(x => cardOpt(x, null, srvName(serverOf(x)) + ' · ' + card(x).adv + ' now')), { always: true, pub: 'The Corp uses AstroScript' });
        spendAgenda(iid);
        card(t).adv++;
        log({ t: 'adv', iid: t, sid: serverOf(t).id, n: card(t).adv, k: card(t).rez ? card(t).k : null, by: 'astroscript' });
        return;
      }
      if (kind === 'sab') {
        const c = card(iid), k = c.k;
        if (k === 'datapool') { click(1); log({ t: 'use', side: 'corp', k }); if ((yield* trace(2, 'Restructured Datapool')).ok) yield* giveTags(1, 'Restructured Datapool'); return; }
        if (k === 'gov_contracts') { click(2); gain('corp', 4); log({ t: 'gain', side: 'corp', n: 4, k }); return; }
        if (k === 'exec_retreat') { click(1); spendAgenda(iid); drawCorp(5, 'exec_retreat'); return; }
        if (k === 'vitruvius') {
          const t = yield* pick('corp', 'archMem', 'Project Vitruvius: take which card from Archives into HQ?', C.arch.map(a => cardOpt(a, null, card(a).up ? 'face up' : 'face down')), { pub: 'The Corp uses Project Vitruvius' });
          if (t) { spendAgenda(iid); const up = card(t).up; lift(t); C.hq.push(t); log({ t: 'fromArch', k: up ? card(t).k : null, by: k }); card(t).up = false; }
          return;
        }
        if (k === 'atlas') {
          g.revealN++;
          const t = yield* pick('corp', 'aggNeg', 'Project Atlas: take which card from R&D?', C.rd.map(i => cardOpt(i)), { pub: 'The Corp searches R&D' });
          if (t) { spendAgenda(iid); lift(t); C.hq.push(t); }
          shuffleRD();
          log({ t: 'search', side: 'corp', by: k });
          return;
        }
      }
      if (kind === 'rez') { yield* rezFlow(iid, false); return; }
      if (kind === 'score') { yield* scoreAgenda(iid); return; }
      if (kind === 'x') { yield* useAbil('corp', id); return; }
    }
    function doRez(iid, free, off) {
      const cost = free ? 0 : Math.max(0, rezCost(iid) - (off || 0));
      const ice = dat(iid).type === 'ice';
      if (cost) pay('corp', cost, ice ? 'rezIce' : 'rez', { iid });
      card(iid).x.rezTurn = g.turnN;
      const c = card(iid), d = dat(iid);
      c.rez = true;
      g.revealN++;
      if (ice && g.run) g.run.rezIceN = (g.run.rezIceN || 0) + 1;
      if (c.k === 'adonis') c.cred = 12;
      if (d.load) c.cred = d.load;
      refill(iid);
      log({ t: 'rez', iid, k: c.k, cost, sid: (serverOf(iid) || {}).id });
      if (d.scriptCounters) c.power = d.scriptCounters;
      if (ice) for (const ce of rigCards('comp_employee')) { gain('runner', 1); log({ t: 'gain', side: 'runner', n: 1, k: 'comp_employee' }); }
    }
    /* What some ice does as it is rezzed. */
    function* rezTriggers(iid) {
      const c = card(iid), d = dat(iid);
      if (SC(iid) && SC(iid).onRez) yield* call(SC(iid).onRez, iid, {});
      if (c.rez) yield* emit('rez', { iid });
      if (d.onRez === 'chimera') {
        const t = yield* pick('corp', 'chimera', 'Chimera: what is it until it derezzes?', ['sentry', 'code gate', 'barrier'].map(x => ({ id: x, label: x[0].toUpperCase() + x.slice(1) })), { always: true, pub: 'The Corp chooses what Chimera is' });
        c.chimera = t; log({ t: 'chimera', type: t });
      }
      if (d.onRez === 'draco' && C.credits > 0) {
        const opts = [];
        for (let x = 0; x <= Math.min(C.credits, 12); x++) opts.push({ id: String(x), label: x ? 'Pay ' + x + ': strength ' + x : 'Pay nothing' });
        const x = +(yield* pick('corp', 'dracoX', 'Dracō: pay X for X power counters (+1 strength each)?', opts, { always: true, pub: 'The Corp powers up Dracō' }));
        if (x) { pay('corp', x, 'any'); c.power += x; log({ t: 'power', k: 'draco', n: c.power }); }
      }
      if (d.onRez === 'tmi') {
        const r = yield* trace(2, 'TMI');
        if (!r.ok) { c.rez = false; log({ t: 'derez', k: 'tmi', why: 'trace' }); }
      }
    }
    function* rezFlow(iid, free) {
      if (dat(iid).rezForfeit && !free) {
        const ag = yield* pick('corp', 'forfeit', 'To rez Archer you must forfeit an agenda', C.score.map(i => cardOpt(i, null, dat(i).pts + ' points')), { skip: 'Leave it unrezzed', pub: 'The Corp considers rezzing Archer' });
        if (!ag) return false;
        lift(ag); C.gone.push(ag);
        log({ t: 'forfeit', side: 'corp', k: card(ag).k });
      }
      if (!free && dat(iid).type !== 'ice' && mod('rezTax', false, { iid }) && C.hq.length) {
        const t = C.hq[Math.floor(rand() * C.hq.length)];
        toArchives(t, false); log({ t: 'discard', side: 'corp', n: 1, cause: 'Hacktivist Meeting' });
      }
      doRez(iid, free);
      yield* rezTriggers(iid);
      return card(iid).rez;
    }
    function* scoreAgenda(iid) {
      const c = card(iid);
      const over = Math.max(0, c.adv - dat(iid).adv);
      dropHosted(iid);
      lift(iid);
      c.rez = true; c.up = true; c.adv = 0;
      C.score.push(iid);
      C.flags.scored = true;
      g.revealN++;
      log({ t: 'score', side: 'corp', k: c.k, pts: dat(iid).pts, total: points('corp') });
      yield* hold({ k: 'score', side: 'corp', card: c.k });
      if (idK('corp') === 'pe') yield* damage('net', 1, 'Personal Evolution');
      winCheck();
      yield* whenScored(iid, over);
      yield* emit('score', { iid });
      yield* emit('scoreOrSteal', { iid, side: 'corp' });
      endCurrents('runner');
    }
    /* An agenda's own "when scored" (also for Bifrost Array). */
    function* whenScored(iid, over) {
      const c = card(iid);
      if (c.k === 'nisei' || c.k === 'astroscript' || c.k === 'exec_retreat') c.agenda = 1;
      if (c.k === 'braintrust' || c.k === 'beale') c.agenda = Math.floor(over / 2);
      if (c.k === 'atlas' || c.k === 'vitruvius') c.agenda = over;
      if (c.agenda && c.k !== 'nisei' && c.k !== 'astroscript' && c.k !== 'exec_retreat') log({ t: 'counters', k: c.k, n: c.agenda });
      if (c.k === 'beale') winCheck();
      if (c.k === 'exec_retreat') { C.rd.push(...C.hq.splice(0)); shuffleRD(); log({ t: 'shuffleHQ' }); }
      if (c.k === 'corp_war') { if (C.credits >= 7) { gain('corp', 7); log({ t: 'gain', side: 'corp', n: 7, k: c.k }); } else { const n = C.credits; C.credits = 0; log({ t: 'lose', side: 'corp', n }); } }
      if (c.k === 'hostile_takeover') { gain('corp', 7); C.bp++; log({ t: 'gain', side: 'corp', n: 7, k: c.k }); log({ t: 'bp', n: C.bp }); }
      if (c.k === 'breaking_news') { C.flags.bnews = (C.flags.bnews || 0) + 1; yield* giveTags(2, 'Breaking News'); }
      if (c.k === 'posted_bounty') {
        if (yield* yesNo('corp', 'bounty', 'Posted Bounty: forfeit it to give the Runner a tag and take a bad publicity?', 'Forfeit it', 'Keep the point', { pub: 'The Corp considers Posted Bounty' })) {
          lift(iid); C.gone.push(iid);
          log({ t: 'forfeit', side: 'corp', k: c.k });
          C.bp++; log({ t: 'bp', n: C.bp });
          yield* giveTags(1, 'Posted Bounty');
        }
      }
      if (c.k === 'priority_req') {
        const ice = installedCorp().filter(x => dat(x).type === 'ice' && !card(x).rez);
        const t = yield* pick('corp', 'prioReq', 'Priority Requisition: rez a piece of ice for free?', ice.map(x => cardOpt(x, null, srvName(serverOf(x)) + ' · worth ' + rezCost(x))), { skip: 'No', pub: 'The Corp may rez an ice for free' });
        if (t) { doRez(t, true); yield* rezTriggers(t); }
      }
      if (c.k === 'abt') yield* betaTest();
      if (dat(iid).scoreCounters) { c.agenda += dat(iid).scoreCounters; log({ t: 'counters', k: c.k, n: c.agenda }); }
      if (SC(iid) && SC(iid).onScore) yield* call(SC(iid).onScore, iid, { over });
    }
    function* betaTest() {
      const top = C.rd.slice(0, 3);
      if (!top.length) return;
      g.revealN++;
      const ices = top.filter(i => dat(i).type === 'ice');
      for (const i of ices) {
        const go = yield* yesNo('corp', 'abt', 'Accelerated Beta Test: install and rez ' + nameOf(i) + ' for free?', 'Install and rez it', 'Trash it', { pub: 'The Corp looks at the top of R&D' });
        if (go) { yield* corpInstall(i, { free: true, rez: true }); }
      }
      const rest = top.filter(i => C.rd.indexOf(i) >= 0);
      for (const i of rest) toArchives(i, false);
      log({ t: 'abt', looked: top.length, trashed: rest.length });
    }

    /* Installing a Corp card. o: { free (ignore install cost), rez (rez it free), noClick } */
    function* corpInstall(iid, o) {
      const d = dat(iid);
      if (g.run && g.run.noInstall) { log({ t: 'fizzle', what: 'no installs this run', k: card(iid).k }); return null; }
      let ts = corpTargets(iid, o);
      if (o.filter) ts = ts.filter(o.filter);
      const sid = o.to || (yield* pick('corp', 'installTo', 'Install ' + d.name + ' where?', ts, { pub: 'The Corp installs a card' }));
      if (!sid) return null;
      /* Onto a card (Awakening Center): host:<iid> */
      if (/^host:/.test(sid)) {
        const host = sid.slice(5);
        hostCorp(iid, host);
        const c = card(iid); c.rez = false; c.adv = 0;
        log({ t: 'install', side: 'corp', iid, sid: (serverOf(host) || {}).id, ice: d.type === 'ice', host: card(host).rez ? card(host).k : null, cost: 0 });
        if (idK('corp') === 'etf' && !C.flags.etf) { C.flags.etf = true; gain('corp', 1); log({ t: 'gain', side: 'corp', n: 1, k: 'etf' }); }
        yield* emit('install', { iid, side: 'corp', sid: (serverOf(host) || {}).id, host });
        return (serverOf(host) || {}).id || null;
      }
      /* Before installing in a server, the Corp may trash any cards already installed there. */
      const s0 = sid === 'new' ? null : server(sid);
      if (s0 && d.type === 'ice' && s0.ice.length && !o.free && !o.noClear) {
        const here = s0.ice.concat(s0.root);
        const ids = yield* pick('corp', 'clearServer', 'Before installing ' + d.name + ': trash any of your cards in ' + s0.name + ' (each ice trashed makes this one cheaper)?', here.map(x => cardOpt(x, null, dat(x).type === 'ice' ? 'ice' : (card(x).rez ? 'rezzed' : 'face down'))), { multi: true, min: 0, max: here.length, pub: 'The Corp considers its server' });
        for (const x of ids) if (isInstalled(x)) { toArchives(x, card(x).rez); log({ t: 'note', side: 'corp', text: 'The Corp trashes ' + (card(x).up ? nameOf(x) : 'a card') + ' from ' + s0.name }); }
      }
      const t = corpTargets(iid, o).find(x => x.id === sid) || ts.find(x => x.id === sid) || { cost: 0 };
      let s = sid === 'new' ? null : server(sid);
      let created = false;
      if (!s) { C.remoteN++; s = { id: 'r' + C.remoteN, name: 'Server ' + C.remoteN, ice: [], root: [] }; C.servers.push(s); created = true; }
      if (d.type === 'ice') {
        pay('corp', t.cost || 0, 'install', { sid: s.id, ice: true });
        lift(iid);
        s.ice.push(iid);
        C.flags.iceInstalled = (C.flags.iceInstalled || 0) + 1;
      } else {
        if (t.cost) pay('corp', t.cost, 'install', { sid: s.id, ice: false });
        lift(iid);
        if (d.type === 'agenda' || d.type === 'asset') {
          const old = s.root.find(i => ['agenda', 'asset'].indexOf(dat(i).type) >= 0);
          if (old) { toArchives(old, false); log({ t: 'overwrite', sid: s.id }); }
        }
        if (d.kw === 'Region') { const old = s.root.find(i => dat(i).kw === 'Region' && i !== iid); if (old) toArchives(old, false); }
        if (d.uniq) for (const x of installedCorp()) if (x !== iid && card(x).k === card(iid).k && card(x).rez) toArchives(x, true);
        if (!server(s.id)) C.servers.push(s);
        s.root.push(iid);
      }
      if (!server(s.id)) C.servers.push(s);
      const c = card(iid);
      c.rez = false; c.adv = 0; c.x.installTurn = g.turnN;
      if (o.faceup || d.public) c.x.faceup = true;
      log({ t: 'install', side: 'corp', iid, sid: s.id, ice: d.type === 'ice', pos: d.type === 'ice' ? s.ice.length : null, cost: d.type === 'ice' ? (t.cost || 0) : 0 });
      if (idK('corp') === 'etf' && !C.flags.etf) { C.flags.etf = true; gain('corp', 1); log({ t: 'gain', side: 'corp', n: 1, k: 'etf' }); }
      if (created) yield* emit('newServer', { sid: s.id });
      if (SC(iid) && SC(iid).onInstall) yield* call(SC(iid).onInstall, iid, { sid: s.id });
      yield* emit('install', { iid, side: 'corp', sid: s.id });
      if (o.rez) { doRez(iid, true); yield* rezTriggers(iid); }
      else if (d.type === 'ice' && rezzed('aiz', s.root).length) {
        const cost = Math.max(0, rezCost(iid) - 3);
        if (avail('corp', 'rezIce') >= cost && (!d.rezForfeit || C.score.length) && (yield* yesNo('corp', 'aiz', 'Amazon Industrial Zone: rez ' + d.name + ' now for ' + cost + '?', 'Rez it (' + cost + ')', 'Leave it', { pub: 'The Corp considers Amazon Industrial Zone' }))) {
          if (d.rezForfeit) { const ag = yield* pick('corp', 'forfeit', 'To rez Archer you must forfeit an agenda', C.score.map(i => cardOpt(i, null, dat(i).pts + ' points')), { pub: 'The Corp forfeits an agenda' }); lift(ag); C.gone.push(ag); log({ t: 'forfeit', side: 'corp', k: card(ag).k }); }
          doRez(iid, false, 3); yield* rezTriggers(iid);
        }
      }
      return s.id;
    }

    function* playOp(iid) {
      const c = card(iid), d = dat(iid), k = c.k;
      let x = 0;
      if (d.cost === 'X') {
        const top = Math.min(R.tags, C.credits);
        const opts = [];
        for (let n = 1; n <= top; n++) opts.push({ id: String(n), label: 'X = ' + n, sub: n + ' credit' + (n === 1 ? '' : 's') + ', ' + plural(n, 'advancement token') });
        x = +(yield* pick('corp', 'psychoX', 'Psychographics: how many (up to the Runner’s ' + plural(R.tags, 'tag') + ')?', opts, { pub: 'The Corp plays Psychographics' }));
        pay('corp', x, 'any');
      } else pay('corp', playCost(iid), 'any');
      lift(iid);
      c.up = true; C.arch.push(iid);
      g.revealN++;
      log({ t: 'play', side: 'corp', k, x: d.cost === 'X' ? x : null });
      if (d.kw === 'Transaction' && idK('corp') === 'babw') { gain('corp', 1); log({ t: 'gain', side: 'corp', n: 1, k: 'babw' }); }
      yield* emit('play', { iid, side: 'corp' });
      if (/\bCurrent\b/.test(d.kw || '')) setCurrent(iid);
      if (SC(iid) && SC(iid).play) { yield* call(SC(iid).play, iid, { x }); return; }
      if (k === 'hedge_fund') { gain('corp', 9); return; }
      if (k === 'green_level') { gain('corp', 3); drawCorp(1, k); return; }
      if (k === 'big_brother') { yield* giveTags(2, 'Big Brother'); return; }
      if (k === 'rework') {
        const t = yield* pick('corp', 'rework', 'Rework: shuffle which card from HQ into R&D?', C.hq.map(x => cardOpt(x)), { pub: 'The Corp reworks a card' });
        if (t) { lift(t); C.rd.push(t); shuffleRD(); log({ t: 'rework' }); }
        return;
      }
      if (k === 'trick_light') {
        const to = yield* pick('corp', 'trickTo', 'Trick of Light: move advancement tokens onto…', advTargets().map(x => cardOpt(x, null, srvName(serverOf(x)) + ' · ' + card(x).adv + ' now')), { pub: 'The Corp plays Trick of Light' });
        const from = yield* pick('corp', 'trickFrom', 'Trick of Light: … from which card?', installedCorp().filter(x => x !== to && card(x).adv > 0).map(x => cardOpt(x, null, srvName(serverOf(x)) + ' · ' + card(x).adv)), { pub: 'The Corp plays Trick of Light' });
        if (to && from) {
          const n = Math.min(2, card(from).adv);
          card(from).adv -= n; card(to).adv += n;
          log({ t: 'adv', iid: to, sid: serverOf(to).id, n: card(to).adv, k: card(to).rez ? card(to).k : null, by: k, x: n });
        }
        return;
      }
      if (k === 'sunset') {
        const sid = yield* pick('corp', 'sunsetSrv', 'Sunset: rearrange the ice of which server?', C.servers.filter(sv => sv.ice.length >= 2).map(sv => ({ id: sv.id, label: sv.name, sub: plural(sv.ice.length, 'ice') })), { pub: 'The Corp plays Sunset' });
        const sv = server(sid);
        if (!sv) return;
        const order = [];
        let left = sv.ice.slice();
        while (left.length > 1) {
          const t = yield* pick('corp', 'sunset', 'Sunset: which ice goes ' + (order.length ? 'next, further in' : 'outermost') + '?', left.map(x => cardOpt(x, card(x).rez ? null : nameOf(x) + ' (unrezzed)')), { pub: 'The Corp rearranges the ice' });
          order.push(t); left = left.filter(x => x !== t);
        }
        order.push(...left);
        sv.ice = order.reverse();
        log({ t: 'sunset', sid });
        return;
      }
      if (k === 'commercialization') {
        const t = yield* pick('corp', 'commerce', 'Commercialization: which ice?', installedCorp().filter(x => dat(x).type === 'ice').map(x => cardOpt(x, card(x).rez ? null : nameOf(x) + ' (unrezzed)', plural(card(x).adv, 'token'))), { pub: 'The Corp plays Commercialization' });
        if (t) { gain('corp', card(t).adv); log({ t: 'gain', side: 'corp', n: card(t).adv, k }); }
        return;
      }
      if (k === 'oversight') {
        const t = yield* pick('corp', 'oversight', 'Oversight AI: rez which ice for free?', installedCorp().filter(x => dat(x).type === 'ice' && !card(x).rez).map(x => cardOpt(x, null, srvName(serverOf(x)))), { pub: 'The Corp plays Oversight AI' });
        if (t) { doRez(t, true); card(t).oversight = true; yield* rezTriggers(t); }
        return;
      }
      if (k === 'freelancer') {
        const ts = yield* pick('corp', 'freelancer', 'Freelancer: trash up to two resources', rigOf('resource').map(x => cardOpt(x)), { multi: true, min: 1, max: 2, pub: 'The Corp plays Freelancer' });
        for (const t of ts) trashRunner(t, 'freelancer');
        return;
      }
      if (k === 'foxfire') {
        if ((yield* trace(7, 'Foxfire')).ok) {
          const t = yield* pick('corp', 'foxfire', 'Foxfire: trash which?', R.rig.filter(x => /Virtual|Link/.test(dat(x).kw || '')).map(x => cardOpt(x)), { pub: 'The Corp chooses' });
          if (t) trashRunner(t, 'foxfire');
        }
        return;
      }
      if (k === 'pgo') {
        const r = yield* trace(2, 'Power Grid Overload');
        if (r.ok) {
          const hw = rigOf('hardware').filter(x => (dat(x).cost || 0) <= r.excess);
          const t = yield* pick('corp', 'pgo', 'Power Grid Overload: trash which hardware (cost ' + r.excess + ' or less)?', hw.map(x => cardOpt(x, null, 'costs ' + dat(x).cost)), { pub: 'The Corp chooses' });
          if (t && !(yield* saveWithConstruct(t))) trashRunner(t, 'pgo');
        }
        return;
      }
      if (k === 'midseason') { const r = yield* trace(6, 'Midseason Replacements'); if (r.ok) yield* giveTags(r.excess, 'Midseason Replacements'); return; }
      if (k === 'beanstalk') { gain('corp', 3); return; }
      if (k === 'biotic_labor') { C.clicks += 2; log({ t: 'clicks', side: 'corp', n: 2 }); return; }
      if (k === 'anon_tip') { drawCorp(3, 'anon_tip'); return; }
      if (k === 'closed_accounts') { const n = R.credits; R.credits = 0; log({ t: 'lose', side: 'runner', n }); return; }
      if (k === 'scorched') { yield* damage('meat', 4, 'Scorched Earth'); return; }
      if (k === 'neural_emp') { yield* damage('net', 1, 'Neural EMP'); return; }
      if (k === 'sea_source') { if ((yield* trace(3, 'SEA Source')).ok) yield* giveTags(1, 'SEA Source'); return; }
      if (k === 'archived_memories') {
        const t = yield* pick('corp', 'archMem', 'Archived Memories: take which card from Archives into HQ?', C.arch.map(a => cardOpt(a, null, card(a).up ? 'face up' : 'face down')), { pub: 'The Corp takes a card from Archives' });
        if (t) { const up = card(t).up; lift(t); C.hq.push(t); log({ t: 'fromArch', k: up ? card(t).k : null }); card(t).up = false; }
        return;
      }
      if (k === 'mirrormorph') {
        for (let n = 0; n < 3; n++) {
          const opts = C.hq.filter(i => dat(i).type !== 'operation').map(i => cardOpt(i, 'Install ' + nameOf(i), dat(i).type, corpTargets(i, {}).some(t => !t.bad) ? null : 'Nowhere you can afford'));
          const t = yield* pick('corp', 'mirror', 'Shipment from MirrorMorph: install a card (' + (n + 1) + ' of up to 3)', opts, { skip: 'Stop', pub: 'The Corp ships cards in' });
          if (!t) break;
          yield* corpInstall(t, {});
        }
        return;
      }
      if (k === 'precognition') {
        const top = C.rd.slice(0, 5);
        g.revealN++;
        const order = [];
        let left = top.slice();
        while (left.length > 1) {
          const t = yield* pick('corp', 'precog', 'Precognition: which card goes ' + (order.length ? 'next' : 'on top') + '?', left.map(i => cardOpt(i)), { pub: 'The Corp arranges the top of R&D' });
          order.push(t); left = left.filter(i => i !== t);
        }
        order.push(...left);
        C.rd.splice(0, top.length, ...order);
        log({ t: 'precog', n: top.length });
        return;
      }
      if (k === 'agg_neg') {
        g.revealN++;
        const t = yield* pick('corp', 'aggNeg', 'Aggressive Negotiation: take which card from R&D?', C.rd.map(i => cardOpt(i)), { pub: 'The Corp searches R&D' });
        if (t) { lift(t); C.hq.push(t); }
        shuffleRD();
        log({ t: 'search', side: 'corp' });
        return;
      }
      if (k === 'psychographics') {
        const t = yield* pick('corp', 'advTo', 'Psychographics: put ' + plural(x, 'advancement token') + ' on…', advTargets().map(i => cardOpt(i, null, srvName(serverOf(i)) + ' · ' + card(i).adv + ' now')), { pub: 'The Corp places advancement tokens' });
        if (t) { card(t).adv += x; log({ t: 'adv', iid: t, sid: serverOf(t).id, n: card(t).adv, k: card(t).rez ? card(t).k : null, by: 'psychographics', x }); }
        return;
      }
      if (k === 'kaguya') {
        const ts = yield* pick('corp', 'kaguya', 'Shipment from Kaguya: an advancement token on each of up to two cards', advTargets().map(i => cardOpt(i, null, srvName(serverOf(i)) + ' · ' + card(i).adv + ' now')), { multi: true, min: 1, max: 2, pub: 'The Corp places advancement tokens' });
        for (const t of ts) { card(t).adv++; log({ t: 'adv', iid: t, sid: serverOf(t).id, n: card(t).adv, k: card(t).rez ? card(t).k : null, by: 'kaguya' }); }
        return;
      }
    }

    /* ================================================================
       Doing a Runner action
       ================================================================ */
    function* doRunner(id) {
      const [kind, iid] = id.split(':');
      const click = n => { R.clicks -= n; };
      if (kind === 'draw') { click(1); drawRunner(1, 'click'); yield* emit('runnerBasic', { what: 'draw' }); return; }
      if (kind === 'credit') { click(1); gain('runner', 1); log({ t: 'click', side: 'runner', what: 'credit' }); return; }
      if (kind === 'untag') { click(1); pay('runner', 2 + mod('untagCost', 0, {}), 'tag'); R.tags--; log({ t: 'untag', n: 1, by: 'click' }); yield* emit('tagsGone', { n: 1 }); return; }
      if (kind === 'install') { click(1); yield* runnerInstall(iid, {}); return; }
      if (kind === 'event') { click(1 + extraClicks(iid)); yield* playEvent(iid); return; }
      if (kind === 'run') { click(1 + runExtra()); R.flags.ranBasic = true; yield* run(iid, {}); return; }
      if (kind === 'ws') { pay('runner', 1, 'any'); yield* workshopTick(iid, 'paid'); return; }
      if (kind === 'x') { yield* useAbil('runner', id); return; }
      if (kind === 'kati') { click(1); R.flags.kati = true; const n = card(iid).cred; card(iid).cred = 0; gain('runner', n); log({ t: 'gain', side: 'runner', n, k: 'kati' }); return; }
      if (kind === 'ab') {
        const c = card(iid), k = c.k;
        if (k === 'magnum_opus') { click(1); gain('runner', 2); log({ t: 'gain', side: 'runner', n: 2, k }); return; }
        if (k === 'armitage') {
          click(1);
          const t = Math.min(2, c.cred); c.cred -= t; gain('runner', t);
          log({ t: 'gain', side: 'runner', n: t, k });
          if (c.cred <= 0) trashRunner(iid, 'empty');
          return;
        }
        if (k === 'crypsis') { click(1); c.virus++; log({ t: 'virus', k, n: c.virus }); return; }
        if (k === 'djinn') {
          click(1); pay('runner', 1, 'any');
          const opts = R.stack.filter(x => dat(x).virus).map(x => cardOpt(x));
          const t = yield* pick('runner', 'djinn', 'Djinn: take which virus program?', dedupe(opts), { pub: 'The Runner searches the stack' });
          if (t) { lift(t); R.grip.push(t); log({ t: 'search', side: 'runner', k: card(t).k }); }
          shuffleStack();
          return;
        }
        if (k === 'lemuria') {
          click(1); pay('runner', 1, 'any');
          const t = yield* pick('runner', 'expose', 'Lemuria Codecracker: expose which card?', installedCorp().filter(x => !card(x).rez).map(x => ({ id: x, label: (dat(x).type === 'ice' ? 'Ice' : 'Card') + ' in ' + srvName(serverOf(x)), sub: card(x).adv ? card(x).adv + ' advanced' : null })), { pub: 'The Runner exposes a card' });
          if (t) yield* expose(t, 'Lemuria Codecracker');
          return;
        }
        if (k === 'sneakdoor') { click(1); yield* run('arch', { sneak: true }); return; }
        if (k === 'liberated') { click(1); const t = Math.min(4, c.cred); c.cred -= t; gain('runner', t); log({ t: 'gain', side: 'runner', n: t, k }); if (c.cred <= 0) trashRunner(iid, 'empty'); return; }
        if (k === 'kati') { click(1); R.flags.kati = true; c.cred += 3; log({ t: 'load', k, n: c.cred }); return; }
        if (k === 'mr_li') {
          click(1);
          const got = R.stack.slice(0, 2);
          drawRunner(2, 'mr_li');
          if (got.length) {
            const t = yield* pick('runner', 'mrli', 'Mr. Li: which of these goes to the bottom of your stack?', got.map(x => cardOpt(x)), { always: true, pub: 'The Runner puts a card back' });
            lift(t); R.stack.push(t);
          }
          return;
        }
        if (k === 'all_nighter') { click(1); trashRunner(iid, 'used'); R.clicks += 2; log({ t: 'clicks', side: 'runner', n: 2, k }); return; }
        if (k === 'dlr') { click(1); const top = C.rd[0]; toArchives(top, false); log({ t: 'mill', k: 'dlr' }); return; }
        if (k === 'workshop') {
          click(1);
          const t = yield* pick('runner', 'wsHost', 'Personal Workshop: which card goes on it?', R.grip.filter(x => ['program', 'hardware'].indexOf(dat(x).type) >= 0).map(x => cardOpt(x, null, dat(x).cost + ' power counters')), { pub: 'The Runner uses Personal Workshop' });
          if (t) {
            lift(t); card(t).up = true; card(t).power = dat(t).cost || 0; card(t).host = iid; R.ws.push(t);
            log({ t: 'workshopHost', k: card(t).k, n: card(t).power });
            if (card(t).power <= 0) yield* fromWorkshop(t);
          }
          return;
        }
        if (k === 'cortez') {
          const t = yield* pick('runner', 'cortez', 'Cortez Chip: which ice costs 2 more to rez this turn?', installedCorp().filter(x => dat(x).type === 'ice' && !card(x).rez).map(x => ({ id: x, label: 'Unrezzed ice · ' + srvName(serverOf(x)) })), { pub: 'The Runner uses Cortez Chip' });
          trashRunner(iid, 'used');
          if (t) { card(t).cortez = g.turnN; log({ t: 'cortez', iid: t }); }
          return;
        }
        if (k === 'data_dealer') {
          click(1);
          const t = yield* pick('runner', 'dealer', 'Data Dealer: forfeit which agenda?', R.score.map(x => cardOpt(x, null, dat(x).pts + ' points')), { pub: 'The Runner sells an agenda' });
          lift(t); R.gone.push(t);
          gain('runner', 9);
          log({ t: 'forfeit', side: 'runner', k: card(t).k });
          log({ t: 'gain', side: 'runner', n: 9, k });
          return;
        }
      }
    }
    /* One option per kind of card: identical copies in a deck are one choice. */
    function dedupe(opts) { const seen = {}; return opts.filter(o => { if (seen[o.card]) return false; seen[o.card] = 1; return true; }); }

    /* Installing a Runner card. o: { discount } */
    function* runnerInstall(iid, o) {
      const d = dat(iid), c = card(iid);
      if (g.run && g.run.noInstall) { log({ t: 'fizzle', what: 'no installs this run', k: c.k }); return; }
      if (o.facedown) {
        lift(iid); wipe(c); c.up = true; c.x.fd = true; R.rig.push(iid);
        log({ t: 'install', side: 'runner', k: null, cost: 0, host: null, hostIid: null, free: true, facedown: true });
        return;
      }
      const from = R.heap.indexOf(iid) >= 0 ? 'heap' : R.grip.indexOf(iid) >= 0 ? 'grip' : R.stack.indexOf(iid) >= 0 ? 'stack' : o.from || 'other';
      const cost = o.free ? 0 : Math.max(0, installCost(iid, o.discount || 0) - (o.off || 0));
      let host = o.host || null;
      if (d.onIce) {
        host = yield* pick('runner', 'hostIce', 'Install ' + d.name + ' on which rezzed ice?', installedCorp().filter(x => dat(x).type === 'ice' && card(x).rez && !dat(x).noHost).map(x => cardOpt(x, nameOf(x) + ' · ' + srvName(serverOf(x)), 'strength ' + iceStr(x))), { pub: 'The Runner installs ' + d.name });
        if (!host) return;
      }
      if (d.onBreaker) {
        host = yield* pick('runner', 'hostBreaker', 'The Personal Touch goes on which icebreaker?', breakers().map(x => cardOpt(x, null, 'strength ' + breakerStr(x))), { pub: 'The Runner installs The Personal Touch' });
        if (!host) return;
      }
      if (d.type !== 'program' && !host) {
        const others = R.rig.filter(x => card(x).k !== c.k && SC(x) && SC(x).hostFor && SC(x).hostFor(X, x, iid));
        if (others.length) {
          const where = yield* pick('runner', 'djinnHost', 'Install ' + d.name + ' on a card that carries it, or in your rig?', [{ id: 'rig', label: 'In your rig' }].concat(others.map(j => ({ id: j, label: 'On ' + nameOf(j) }))), { pub: 'The Runner installs ' + d.name });
          if (where && where !== 'rig') host = where;
        }
      }
      if (d.type === 'program') {
        /* Parasite lives on an ice but still uses the Runner's memory. */
        const djinns = d.onIce || host ? [] : rigCards('djinn').filter(j => !d.brk && hostedOn(j).reduce((s, h) => s + (dat(h).mu || 0), 0) + (d.mu || 0) <= 3);
        const dinos = d.brk && !host && !/AI/.test(d.kw || '') ? rigCards('dinosaurus').filter(x => !hostedOn(x).length) : [];
        const others = d.onIce || host ? [] : R.rig.filter(x => card(x).k !== c.k && SC(x) && SC(x).hostFor && SC(x).hostFor(X, x, iid));
        if (djinns.length || dinos.length || others.length) {
          const where = yield* pick('runner', 'djinnHost', 'Install ' + d.name + ' on a card that carries it (using none of your memory), or in your rig?', [{ id: 'rig', label: 'In your rig', sub: (muTotal() - muUsed()) + ' memory free' }].concat(djinns.map(j => ({ id: j, label: 'On Djinn', sub: 'Djinn carries up to 3 memory' })), dinos.map(j => ({ id: j, label: 'On Dinosaurus', sub: '+2 strength, no memory' })), others.map(j => ({ id: j, label: 'On ' + nameOf(j), sub: 'no memory' }))), { pub: 'The Runner installs ' + d.name });
          if (where && where !== 'rig') host = where;
        }
        if (!host || d.onIce || !(card(host).k === 'djinn' || card(host).k === 'dinosaurus' || (D.SCRIPT[card(host).k] || {}).freeHost)) {
          /* Make room — again if trashing cost memory too (a Q-Coherence Chip goes with a program). */
          for (let round = 0; round < 4; round++) {
            const need = (d.cloud && link() >= 2 ? 0 : mod('muOf', d.mu || 0, { iid }) || 0) - (muTotal() - muUsed());
            if (need <= 0) break;
            const mine = programs().filter(x => !freeHost(x) && x !== host);
            const ids = mine.length ? yield* pick('runner', 'makeRoom', 'Not enough memory for ' + d.name + ': trash programs to make ' + need + ' room', mine.map(x => cardOpt(x, null, (dat(x).mu || 0) + ' memory')), { multi: true, min: 1, max: mine.length, pub: 'The Runner makes room' }) : [];
            let freed = 0;
            for (const x of ids) freed += dat(x).mu || 0;
            if (freed < need) { log({ t: 'fizzle', what: 'not enough memory', k: c.k }); return; }
            for (const x of ids) if (R.rig.indexOf(x) >= 0) trashRunner(x, 'room');
            if (round === 3 && (d.mu || 0) - (muTotal() - muUsed()) > 0) { log({ t: 'fizzle', what: 'not enough memory', k: c.k }); return; }
          }
        }
      }
      if (d.console && !o.facedown) for (const x of faceUpRig().filter(x => dat(x).console)) trashRunner(x, 'console');
      if (d.uniq) for (const x of rigCards(c.k)) trashRunner(x, 'unique');
      if (!pay('runner', cost, installWhy(d))) { log({ t: 'fizzle', what: 'cannot pay', k: c.k }); return; }
      if (d.type === 'program' || d.type === 'hardware') R.flags.kate = true;
      lift(iid);
      c.up = true; c.power = 0;
      c.host = host;
      R.rig.push(iid);
      log({ t: 'install', side: 'runner', k: c.k, cost, host: host ? card(host).k : null, hostIid: host, free: !!o.free });
      if (o.testRun) (R.flags.testRun = R.flags.testRun || []).push(iid);
      if (d.load) c.cred = d.load;
      if (d.recur) c.rc = recurN(d.recur);
      if (d.power) c.power = d.power;
      if (d.startVirus) addVirus(iid, d.startVirus);
      if (d.virus) {
        if (rigCards('grimoire').length) addVirus(iid, 1);
        if (idK('runner') === 'noise' && C.rd.length) { const top = C.rd[0]; toArchives(top, false); log({ t: 'mill', k: 'noise' }); }
      }
      if (d.marks) {
        const ice = installedCorp().filter(x => dat(x).type === 'ice');
        const t = yield* pick('runner', 'femme', 'Femme Fatale: mark which ice? (you may later pay 1 a subroutine to slip past it)', ice.map(x => ({ id: x, label: (card(x).rez ? nameOf(x) : 'Unrezzed ice') + ' · ' + srvName(serverOf(x)) })), { pub: 'The Runner marks an ice' });
        if (t) { c.mark = t; log({ t: 'mark', iid: t }); }
      }
      if (d.type === 'hardware') for (const rp of rigCards('replicator')) {
        const more = R.stack.filter(x => card(x).k === c.k);
        if (!more.length) break;
        if (yield* yesNo('runner', 'replicator', 'Replicator: find another ' + d.name + ' in your stack and take it into your grip?', 'Yes', 'No', { pub: 'The Runner considers Replicator' })) {
          lift(more[0]); R.grip.push(more[0]); log({ t: 'search', side: 'runner', k: c.k });
        }
        shuffleStack();
        break;
      }
      if (c.k === 'rabbit_hole') {
        const more = R.stack.filter(x => card(x).k === 'rabbit_hole');
        if (more.length && avail('runner', 'any') >= installCost(more[0], 0)) {
          if (yield* yesNo('runner', 'rabbit', 'Rabbit Hole: find the other one in your stack and install it (' + installCost(more[0], 0) + ' credits)?', 'Yes', 'No', { pub: 'The Runner digs for another Rabbit Hole' })) {
            yield* runnerInstall(more[0], {});
          }
          shuffleStack();
        }
      }
      if (R.rig.indexOf(iid) < 0) return;
      if (d.type === 'resource') R.flags.installedRes = true;
      if (SC(iid) && SC(iid).onInstall) yield* call(SC(iid).onInstall, iid, { from });
      yield* emit('install', { iid, side: 'runner', from });
    }

    function* playEvent(iid) {
      const c = card(iid), d = dat(iid), k = c.k;
      pay('runner', playCost(iid), 'event', { run: /\bRun\b/.test(d.kw || '') });
      lift(iid);
      c.up = true; R.heap.push(iid);
      log({ t: 'play', side: 'runner', k });
      yield* emit('play', { iid, side: 'runner' });
      if (/\bCurrent\b/.test(d.kw || '')) setCurrent(iid);
      if (SC(iid) && SC(iid).play) { yield* call(SC(iid).play, iid, {}); return; }
      if (k === 'sure_gamble') { gain('runner', 9); return; }
      if (k === 'quality_time') { drawRunner(5, k); return; }
      if (k === 'notoriety') { lift(iid); R.score.push(iid); log({ t: 'notoriety', total: points('runner') }); winCheck(); return; }
      if (k === 'networking') {
        R.tags = Math.max(0, R.tags - 1); log({ t: 'untag', n: 1, by: 'networking' });
        if (avail('runner', 'any') >= 1 && (yield* yesNo('runner', 'networking', 'Networking: pay 1 credit to take it back into your grip?', 'Pay 1', 'No', { pub: 'The Runner considers Networking' }))) { pay('runner', 1, 'any'); lift(iid); R.grip.push(iid); }
        return;
      }
      if (k === 'sat_uplink') {
        const cands = installedCorp().filter(x => !card(x).rez);
        const ts = yield* pick('runner', 'uplink', 'Satellite Uplink: expose up to two cards', cands.map(x => ({ id: x, label: (dat(x).type === 'ice' ? 'Ice' : 'Card') + ' in ' + srvName(serverOf(x)), sub: card(x).adv ? card(x).adv + ' advanced' : null })), { multi: true, min: 1, max: 2, pub: 'The Runner plays Satellite Uplink' });
        for (const t of ts) yield* expose(t, 'Satellite Uplink');
        return;
      }
      if (k === 'em_shutdown') {
        const t = yield* pick('runner', 'shutdown', 'Emergency Shutdown: derez which ice?', installedCorp().filter(x => dat(x).type === 'ice' && card(x).rez).map(x => cardOpt(x, null, srvName(serverOf(x)))), { pub: 'The Runner plays Emergency Shutdown' });
        if (t) { card(t).rez = false; card(t).chimera = null; log({ t: 'derez', k: card(t).k, why: 'shutdown' }); }
        return;
      }
      if (k === 'surge') {
        const t = yield* pick('runner', 'surge', 'Surge: two more virus counters on which program?', (R.flags.virusOn || []).filter(x => R.rig.indexOf(x) >= 0).map(x => cardOpt(x, null, plural(card(x).virus, 'counter'))), { pub: 'The Runner plays Surge' });
        if (t) addVirus(t, 2);
        return;
      }
      if (k === 'kraken') {
        const sid = yield* pick('runner', 'kraken', 'Kraken: which server loses an ice?', C.servers.filter(sv => sv.ice.length).map(sv => ({ id: sv.id, label: sv.name, sub: plural(sv.ice.length, 'ice') })), { pub: 'The Runner plays Kraken' });
        const sv = server(sid);
        if (sv) {
          const t = yield* pick('corp', 'krakenAns', 'Kraken: trash which of your ice protecting ' + sv.name + '?', sv.ice.map(x => cardOpt(x, card(x).rez ? null : nameOf(x) + ' (unrezzed)')), { pub: 'The Corp chooses an ice to lose' });
          if (t) { const kk = card(t).k, up = card(t).rez; toArchives(t, false); log({ t: 'trashedIce', by: 'kraken', k: up ? kk : null }); }
        }
        return;
      }
      if (k === 'test_run') {
        const pool = R.stack.concat(R.heap).filter(x => x !== iid && dat(x).type === 'program');
        g.revealN++;
        const t = yield* pick('runner', 'testRun', 'Test Run: install which program for free? (It goes back on top of your stack when the turn ends.)', dedupe(pool.map(x => cardOpt(x, null, R.stack.indexOf(x) >= 0 ? 'from your stack' : 'from your heap'))), { pub: 'The Runner plays Test Run' });
        const fromStack = t && R.stack.indexOf(t) >= 0;
        if (t) yield* runnerInstall(t, { free: true, testRun: true });
        if (fromStack) shuffleStack();
        return;
      }
      if (k === 'vamp') { yield* run('hq', { vamp: true, via: k }); return; }
      if (k === 'retrieval') { yield* run('arch', { retrieval: true, via: k }); return; }
      if (k === 'indexing') { yield* run('rd', { indexing: true, via: k }); return; }
      if (k === 'easy_mark') { gain('runner', 3); return; }
      if (k === 'diesel') { drawRunner(3, 'diesel'); return; }
      if (k === 'infiltration') {
        const cands = installedCorp().filter(x => !card(x).rez);
        const a = yield* pick('runner', 'infil', 'Infiltration: gain 2 credits, or expose a card?', [{ id: 'gain', label: 'Gain 2 credits' }].concat(cands.map(x => ({ id: x, label: 'Expose: ' + (dat(x).type === 'ice' ? 'ice' : 'a card') + ' in ' + srvName(serverOf(x)), sub: card(x).adv ? card(x).adv + ' advanced' : null }))), { always: true, pub: 'The Runner plays Infiltration' });
        if (a === 'gain') gain('runner', 2); else yield* expose(a, 'Infiltration');
        return;
      }
      if (k === 'special_order') {
        g.revealN++;
        const t = yield* pick('runner', 'special', 'Special Order: take which icebreaker?', dedupe(R.stack.filter(x => dat(x).brk).map(x => cardOpt(x, null, dat(x).kw))), { pub: 'The Runner searches the stack' });
        if (t) { lift(t); R.grip.push(t); log({ t: 'search', side: 'runner', k: card(t).k }); }
        shuffleStack();
        return;
      }
      if (k === 'deja_vu') {
        const viruses = R.heap.filter(x => dat(x).virus && x !== iid);
        const t = yield* pick('runner', 'dejavu', 'Déjà Vu: take which card back? (A virus card lets you take a second virus card.)', dedupe(R.heap.filter(x => x !== iid).map(x => cardOpt(x, null, dat(x).virus ? 'virus' : dat(x).type))), { pub: 'The Runner picks through the heap' });
        if (!t) return;
        lift(t); R.grip.push(t);
        log({ t: 'fromHeap', k: card(t).k });
        if (dat(t).virus) {
          const more = R.heap.filter(x => dat(x).virus && x !== iid);
          if (more.length) {
            const t2 = yield* pick('runner', 'dejavu2', 'Déjà Vu: a second virus card?', dedupe(more.map(x => cardOpt(x))), { skip: 'Just the one', pub: 'The Runner picks through the heap' });
            if (t2) { lift(t2); R.grip.push(t2); log({ t: 'fromHeap', k: card(t2).k }); }
          }
        }
        return;
      }
      if (k === 'modded') {
        const opts = R.grip.filter(x => ['program', 'hardware'].indexOf(dat(x).type) >= 0).map(x => cardOpt(x, 'Install ' + nameOf(x), installCost(x, 3) + ' credits', installBad(x) || (avail('runner', dat(x).virus ? 'virus' : 'any') < installCost(x, 3) ? 'Costs ' + installCost(x, 3) : null)));
        const t = yield* pick('runner', 'modded', 'Modded: install which, for 3 less?', opts, { pub: 'The Runner plays Modded' });
        if (t) yield* runnerInstall(t, { discount: 3 });
        return;
      }
      if (k === 'tinkering') {
        const t = yield* pick('runner', 'tinker', 'Tinkering: which ice becomes a sentry, code gate and barrier this turn?', installedCorp().filter(x => dat(x).type === 'ice').map(x => ({ id: x, label: (card(x).rez ? nameOf(x) : 'Unrezzed ice') + ' · ' + srvName(serverOf(x)) })), { pub: 'The Runner plays Tinkering' });
        if (t) { card(t).tink = g.turnN; log({ t: 'tinker', iid: t }); }
        return;
      }
      if (k === 'forged') {
        const t = yield* pick('runner', 'forged', 'Forged Activation Orders: which unrezzed ice?', installedCorp().filter(x => dat(x).type === 'ice' && !card(x).rez).map(x => ({ id: x, label: 'Unrezzed ice · ' + srvName(serverOf(x)), sub: 'position ' + (serverOf(x).ice.indexOf(x) + 1) + ' from the server' })), { pub: 'The Runner plays Forged Activation Orders' });
        if (!t) return;
        const canRez = C.credits >= rezCost(t) && (!dat(t).rezForfeit || C.score.length);
        const a = yield* pick('corp', 'forgedAns', 'Forged Activation Orders: rez ' + nameOf(t) + ' (' + rezCost(t) + ') or trash it?', [{ id: 'rez', label: 'Rez it (' + rezCost(t) + ')', bad: canRez ? null : 'You cannot pay for it' }, { id: 'trash', label: 'Trash it' }], { pub: 'The Corp must rez the ice or trash it' });
        if (a === 'rez') { const done = yield* rezFlow(t, false); if (!done) { toArchives(t, false); log({ t: 'trashedIce', by: 'forged' }); } }
        else { toArchives(t, false); log({ t: 'trashedIce', by: 'forged' }); }
        return;
      }
      if (k === 'demolition_run') {
        const sid = yield* pick('runner', 'runOn', 'Demolition Run: HQ or R&D?', [{ id: 'hq', label: 'Run HQ', sub: runSub(server('hq')), bad: runBad('hq') }, { id: 'rd', label: 'Run R&D', sub: runSub(server('rd')), bad: runBad('rd') }], { pub: 'The Runner plays Demolition Run' });
        yield* run(sid, { demo: true, via: k });
        return;
      }
      if (k === 'account_siphon') { yield* run('hq', { siphon: true, via: k }); return; }
      if (k === 'makers_eye') { yield* run('rd', { extra: 2, via: k }); return; }
      if (k === 'stimhack' || k === 'inside_job') {
        const sid = yield* pick('runner', 'runOn', d.name + ': run which server?', C.servers.map(s => ({ id: s.id, label: 'Run ' + s.name, sub: runSub(s), bad: runBad(s.id) })), { pub: 'The Runner plays ' + d.name });
        yield* run(sid, k === 'stimhack' ? { stim: true, via: k } : { inside: true, via: k });
        return;
      }
    }

    /* Parasite: host ice at strength 0 or less is trashed. */
    function checkParasites() {
      for (const p of rigCards('parasite')) {
        const h = card(p).host;
        if (h && card(h) && isInstalled(h) && iceStr(h) <= 0) {
          const k = card(h).k;
          toArchives(h, true);
          log({ t: 'parasite', k });
        }
      }
    }

    /* ================================================================
       THE RUN
       ================================================================ */
    function* run(sid, o) {
      yield* runOnce(sid, o);
      /* Doppelgänger: once a turn, another run straight after a successful one. */
      if (R.flags.lastRunWon && rigCards('doppelganger').length && !R.flags.doppel && g.phase !== 'over') {
        const opts = C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: runSub(sv), bad: runBad(sv.id) }));
        if (opts.some(x => !x.bad)) {
          const t = yield* pick('runner', 'doppel', 'Doppelgänger: make another run now?', opts, { skip: 'No', pub: 'The Runner considers Doppelgänger' });
          if (t) { R.flags.doppel = true; yield* runOnce(t, { via: 'doppelganger' }); }
        }
      }
    }
    function* runOnce(sid, o) {
      g.runN++;
      R.flags.lastRunWon = false;
      const S = g.run = { n: g.runN, sid, o, stage: 'start', pos: -1, at: null, approached: 0, pump: {}, enc: null,
        stim: o.stim ? 9 : 0, bpc: bpNow(), chum: false, inside: !!o.inside, seen: [], accessing: null, how: null, sensei: null, noJack: !!o.noJack, midori: false, snitched: false };
      const fee = !R.flags.ran && g.active === 'runner' ? Math.max(0, mod('runCost', 0, { sid })) : 0;
      if (fee) { pay('runner', fee, 'any'); log({ t: 'note', side: 'runner', text: 'The first run of the turn costs ' + fee + ' (Service Outage)' }); }
      R.flags.ran = true;
      if (!isRemote(sid)) R.flags.ranCentral = true;
      /* Ruhr Valley: a click more to run here. */
      const sv0 = server(sid);
      const ruhr = sv0 ? rezzed('ruhr', sv0.root).length : 0;
      if (ruhr) { R.clicks = Math.max(0, R.clicks - ruhr); log({ t: 'loseClick', k: 'ruhr' }); }
      log({ t: 'run', sid, via: o.via || (o.sneak ? 'sneakdoor' : null), bp: C.bp || 0 });
      yield* emit('runBegin', { sid, S });
      if (!g.run) return;
      let s = server(sid);
      let i = s ? s.ice.length - 1 : -1;
      while (s && i >= 0) {
        if (i > s.ice.length - 1) i = s.ice.length - 1;
        if (i < 0) break;
        let iid = s.ice[i];
        S.pos = i; S.at = iid; S.stage = 'approach';
        if (S.approached > 40) return yield* endRun('jacked');
        if (S.approached > 0 && (yield* jackOut())) return yield* endRun('jacked');
        S.approached++;
        log({ t: 'approach', sid: S.sid, pos: i, iid, k: card(iid).rez ? card(iid).k : null });
        yield* emit('approachIce', { iid, S });
        if (!g.run) return;
        if (S.jackNow) { S.jackNow = false; return yield* endRun('jacked'); }
        /* Snitch: once a run, expose an unrezzed ice as you approach it — and maybe jack out. */
        if (!card(iid).rez && !S.snitched && rigCards('snitch').length) {
          if (yield* yesNo('runner', 'snitch', 'Snitch: expose this unrezzed ice?', 'Expose it', 'No', { pub: 'The Runner considers Snitch' })) {
            S.snitched = true;
            yield* expose(iid, 'Snitch');
            const ex = g.log[g.log.length - 1];
            const seen = ex && ex.t === 'expose' && ex.iid === iid ? 'It is ' + dat(iid).name + ' (' + subsOf(iid).map(subText).join('; ') + '). ' : '';
            if (yield* yesNo('runner', 'snitchJack', 'Snitch: ' + seen + 'Jack out now?', 'Jack out', 'Carry on', { pub: 'The Runner decides whether to press on' })) return yield* endRun('jacked');
          }
        }
        const w = yield* corpWindow('ice', iid);
        if (w === 'end') return yield* endRun('ended', S.endBy || 'Nisei MK II');
        if (w && w.moved) { s = server(S.sid); i = s ? s.ice.length - 1 : -1; continue; }
        if (w && w.iid) iid = w.iid;
        if (isInstalled(iid) && card(iid).rez) {
          const out = yield* encounter(iid);
          if (!g.run) return;
          if (out === 'end') return yield* endRun('ended', S.endBy);
          if (out === 'cell') { s = server(S.sid); i = s ? s.ice.length - 1 : -1; continue; }
          if (out && out.moved) { s = server(S.sid); i = !s ? -1 : out.outer ? s.ice.length - 1 : s.ice.indexOf(iid) - 1; continue; }
          if (out === 'jack') return yield* endRun('jacked');
        }
        (S.passed = S.passed || []).push(iid);
        yield* emit('passIce', { iid, S });
        if (!g.run) return;
        if (S.endNow) return yield* endRun('ended', S.endBy);
        /* Copycat: the run carries on from another copy of this ice. */
        if (S.jumpTo && isInstalled(S.jumpTo)) { iid = S.jumpTo; S.sid = serverOf(iid).id; S.jumpTo = null; }
        s = server(S.sid);
        if (!s) break;
        if (S.nextPos != null) { i = S.nextPos; S.nextPos = null; }
        else i = s.ice.indexOf(iid) >= 0 ? s.ice.indexOf(iid) - 1 : Math.min(i - 1, s.ice.length - 1);
      }
      S.stage = 'server'; S.pos = -1; S.at = null;
      if (S.approached > 0 && (yield* jackOut(true))) return yield* endRun('jacked');
      log({ t: 'approachServer', sid: S.sid });
      yield* emit('approachServer', { sid: S.sid, S });
      if (!g.run) return;
      if (S.endNow) return yield* endRun('ended', S.endBy);
      if ((yield* corpWindow('server', null)) === 'end') return yield* endRun('ended', S.endBy || 'Nisei MK II');
      if (!server(S.sid)) return yield* endRun('gone');
      if (mod('noSuccess', false, { sid: S.sid })) return yield* endRun('nosuccess', 'Crisium Grid');
      return yield* success();
    }
    function* jackOut(atServer) {
      const S = g.run;
      if (S.noJack || S.noJackEnc) return false;
      /* Port Anson Grid: jacking out costs an installed program. */
      const cost = mod('jackCost', null, { sid: S.sid });
      const jbad = cost === 'program' && !programs().length ? 'You have no program to give up' : S.mindGame && !R.rig.length ? 'Mind Game: you have no installed card to give up' : S.armored && !R.grip.length ? 'Armored Servers: you need a card in your grip' : null;
      const a = yield* pick('runner', 'jack', atServer ? 'You have passed the ice: go into ' + srvName(server(S.sid)) + ', or jack out?' : 'On to the next piece of ice, or jack out?', [{ id: 'go', label: atServer ? 'Into the server' : 'Approach the next ice' }, { id: 'jack', label: 'Jack out — the run ends' + (cost === 'program' ? ' (trash a program)' : ''), bad: jbad }], { always: true, pub: 'The Runner decides whether to press on' });
      if (a !== 'jack') return false;
      /* Labyrinthine Servers: the Corp may stop it. */
      for (const ci of corpActives()) { const sc = SC(ci); if (sc && sc.stopJack && (yield* call(sc.stopJack, ci, { S }))) { log({ t: 'note', side: 'corp', text: nameOf(ci) + ': the Runner cannot jack out this run' }); S.noJack = true; return false; } }
      if (cost === 'program') {
        const t = yield* pick('runner', 'jackProg', 'Port Anson Grid: trash which program to jack out?', programs().map(i => cardOpt(i)), { always: true });
        if (t) trashRunner(t, 'Port Anson Grid');
      }
      if (S.armored && R.grip.length) {
        const t = yield* pick('runner', 'armoredJack', 'Armored Servers: trash a card from your grip to jack out', R.grip.map(i => cardOpt(i)), { always: true });
        if (t) { lift(t); card(t).up = true; R.heap.push(t); heardTrash([t], true); }
      }
      if (S.mindGame && R.rig.length) {
        const t = yield* pick('runner', 'jackMind', 'Mind Game: which installed card goes to the bottom of your stack?', R.rig.map(i => cardOpt(i)), { always: true });
        if (t) { for (const h of R.rig.filter(i => card(i).host === t)) trashRunner(h, 'host'); lift(t); wipe(card(t)); R.stack.push(t); log({ t: 'note', side: 'runner', text: 'Mind Game: a card goes to the bottom of the stack' }); }
      }
      return true;
    }
    /* The Corp's moment as the Runner approaches an ice (rez it) or the
       server (rez anything but ice): also Nisei and the Troubleshooter. */
    function* corpWindow(where, iid) {
      const S = g.run;
      let swapped = null;
      const back = v => (v == null && swapped ? { iid: swapped } : v);
      for (let guard = 0; guard < 8; guard++) {
        if (where === 'ice' && !isInstalled(iid)) return back(null);
        const opts = [];
        if (where === 'ice' && !card(iid).rez) {
          const cost = rezCost(iid);
          let bad = avail('corp', 'rezIce', { iid }) < cost ? 'Costs ' + cost + ' — you have ' + C.credits : null;
          if (dat(iid).rezForfeit && !C.score.length) bad = 'Archer needs an agenda to forfeit';
          if (mod('noRezIce', false, { iid })) bad = 'No ice can be rezzed this run';
          if (S.empAt != null && (S.rezIceN || 0) - S.empAt >= 1) bad = 'EMP Device: no more ice can be rezzed this run';
          if (R.ddosTurn === g.turnN && serverOf(iid) && serverOf(iid).ice[serverOf(iid).ice.length - 1] === iid) bad = 'DDoS: the outermost ice cannot be rezzed this turn';
          opts.push({ id: 'rez', label: 'Rez ' + nameOf(iid) + ' (' + cost + ')', card: card(iid).k, bad });
          if (dat(iid).altForfeit && C.score.some(x => dat(x).type === 'agenda') && !mod('noRezIce', false, { iid })) opts.push({ id: 'rezf', label: 'Rez ' + nameOf(iid) + ' by forfeiting an agenda', card: card(iid).k });
        }
        let hidden = 0;
        if (where === 'server') {
          for (const x of corpPlaced()) {
            if (card(x).rez) continue;
            hidden++;
            const t = dat(x).type;
            if (t !== 'asset' && t !== 'upgrade') continue;
            const cost = rezCost(x);
            opts.push({ id: 'rez:' + x, label: 'Rez ' + nameOf(x) + ' (' + cost + ')', sub: srvName(serverOf(x)), card: card(x).k, bad: C.credits < cost ? 'Costs ' + cost : rezBlock(x) });
          }
        }
        if (where === 'ice' && card(iid).rez) {
          const s = serverOf(iid);
          for (const t of rezzed('troubleshooter', s.root)) opts.push({ id: 'ts:' + t, label: 'Corporate Troubleshooter: trash it to make ' + nameOf(iid) + ' stronger', sub: 'Pay X credits: +X strength this turn', bad: C.credits < 1 ? 'No credits' : null });
        }
        for (const ns of C.score.filter(x => card(x).k === 'nisei' && card(x).agenda > 0)) opts.push({ id: 'nisei:' + ns, label: 'Nisei MK II: spend its counter — END THE RUN', card: 'nisei' });
        for (const ci of corpActives()) {
          const sc = SC(ci);
          if (!sc || !sc.winOpts) continue;
          (sc.winOpts(X, ci, { where, iid, S }) || []).forEach((w, n) => { if (w) opts.push({ id: 'xw:' + ci + ':' + n, label: w.label, sub: w.sub || null, card: card(ci).k, bad: w.bad || null }); });
        }
        if (R.clicks > 0) for (const fl of C.score.filter(x => card(x).k === 'false_lead')) opts.push({ id: 'flead:' + fl, label: 'False Lead: forfeit it — the Runner loses two clicks', card: 'false_lead' });
        if (where === 'ice' && !S.midori) {
          const sv = serverOf(iid);
          if (sv && rezzed('midori', sv.root).length) for (const h of C.hq.filter(x => dat(x).type === 'ice')) opts.push({ id: 'midori:' + h, label: 'Midori: swap it for ' + nameOf(h) + ' from HQ', card: card(h).k });
        }
        /* An unrezzed ice is always asked about, and the server whenever anything
           is unrezzed: that the Corp has nothing worth rezzing must not show. */
        const force = guard === 0 && ((where === 'ice' && !card(iid).rez) || (where === 'server' && hidden > 0));
        if (!force && !opts.some(x => !x.bad)) return back(null);
        const why = where === 'ice' ? 'The Runner approaches ' + (card(iid).rez ? nameOf(iid) : 'your unrezzed ' + nameOf(iid)) + ' (' + srvName(serverOf(iid)) + ', position ' + (S.pos + 1) + ')' : 'The Runner approaches ' + srvName(server(S.sid)) + ': rez anything?';
        const a = yield* pick('corp', where === 'ice' ? 'rezIce' : 'rezServer', why, opts, { skip: where === 'ice' && !card(iid).rez ? 'Leave it unrezzed' : 'Carry on', force, pub: where === 'ice' ? 'The Corp may rez the ice' : 'The Corp may rez cards' });
        if (!a) return back(null);
        if (a === 'rezf') {
          const ag = yield* pick('corp', 'forfeit', 'Forfeit which agenda to rez ' + nameOf(iid) + '?', C.score.filter(x => dat(x).type === 'agenda').map(x => cardOpt(x, null, dat(x).pts + ' points')), { always: true, pub: 'The Corp forfeits an agenda' });
          lift(ag); C.gone.push(ag); log({ t: 'forfeit', side: 'corp', k: card(ag).k });
          doRez(iid, true); yield* rezTriggers(iid);
          S.rezAt = iid; yield* hold({ k: 'rez', iid, card: card(iid).k });
          continue;
        }
        if (a === 'rez') {
          const done = yield* rezFlow(iid, false);
          if (done) { S.rezAt = iid; yield* hold({ k: 'rez', iid, card: card(iid).k }); }
          continue;
        }
        const [kk, x, nn] = a.split(':');
        if (kk === 'rez') { yield* rezFlow(x, false); continue; }
        if (kk === 'xw') {
          const r = yield* call(SC(x).winUse, x, +nn, { where, iid, S });
          if (r === 'end') return 'end';
          if (r && r.moved) return r;
          if (r && r.iid) { swapped = r.iid; iid = r.iid; }
          if (!g.run) return 'end';
          continue;
        }
        if (kk === 'nisei') { spendAgenda(x); log({ t: 'use', side: 'corp', k: 'nisei' }); S.endBy = 'Nisei MK II'; return 'end'; }
        if (kk === 'flead') { lift(x); C.gone.push(x); log({ t: 'forfeit', side: 'corp', k: 'false_lead' }); const n = Math.min(2, R.clicks); R.clicks -= n; log({ t: 'loseClick', k: 'false_lead', n }); continue; }
        if (kk === 'midori') {
          const sv = serverOf(iid), pos = sv.ice.indexOf(iid);
          lift(x); sv.ice.splice(pos, 0, x); card(x).rez = false; card(x).adv = 0;
          const old = iid;
          toHQ(old);
          S.midori = true; S.at = x; iid = x;
          log({ t: 'midori', sid: sv.id, pos });
          if (!server(sv.id)) C.servers.push(sv);
          swapped = x;
          continue;
        }
        if (kk === 'ts') {
          const top = Math.min(C.credits, 12);
          const xs = [];
          for (let n = 1; n <= top; n++) xs.push({ id: String(n), label: '+' + n + ' strength for ' + n + ' credit' + (n === 1 ? '' : 's') });
          const n = +(yield* pick('corp', 'tsX', 'Corporate Troubleshooter: how much?', xs, { pub: 'The Corp calls in the Troubleshooter' }));
          pay('corp', n, 'any');
          card(iid).boost += n;
          toArchives(x, true);
          log({ t: 'boost', iid, n, k: 'troubleshooter' });
          continue;
        }
      }
      return back(null);
    }

    /* ================================================================
       An encounter: slip past it, the ice's own "when encountered", the
       Runner breaks what they can, then the rest fires.
       ================================================================ */
    function* encounter(iid) {
      const S = g.run, d = dat(iid);
      const wasIn = isInstalled(iid);
      const subs = subsOf(iid);
      const E = S.enc = { iid, k: card(iid).k, subs, broken: subs.map(() => false), pump: {}, lower: 0, chum: S.chum, used: {}, fired: [], brokeAny: false };
      S.chum = false;
      S.noJackEnc = false;
      S.stage = 'encounter';
      log({ t: 'encounter', iid, k: card(iid).k });
      /* The Runner's slip-past effects come first (the active player's). */
      const noBy = d.noBypass || mod('noBypass', false, { iid });
      if (S.inside && !noBy) {
        S.inside = false;
        log({ t: 'bypass', iid, k: card(iid).k, by: 'inside_job' });
        return yield* finishEnc('pass');
      }
      for (const ff of noBy ? [] : rigCards('femme_fatale')) {
        if (card(ff).mark !== iid) continue;
        const n = subs.length;
        if (avail('runner', 'breaker') < n) continue;
        if (yield* yesNo('runner', 'femmeBy', 'Femme Fatale: pay ' + n + ' to slip past ' + d.name + '?', 'Pay ' + n + ' and bypass it', 'Face it', { pub: 'The Runner considers Femme Fatale' })) {
          pay('runner', n, 'breaker');
          log({ t: 'bypass', iid, k: card(iid).k, by: 'femme_fatale' });
          return yield* finishEnc('pass');
        }
      }
      /* When encountered */
      yield* emit('encounter', { iid, E, S });
      if (!g.run) return 'end';
      if (E.endNow) { S.endBy = S.endBy || E.endBy || d.name; return yield* finishEnc('end'); }
      if (E.jackNow) return yield* finishEnc('jack');
      if (S.o.card && SC(S.o.card) && SC(S.o.card).runEnc) {
        const r = yield* call(SC(S.o.card).runEnc, S.o.card, { iid, E, S });
        if (!g.run) return 'end';
        if (r === 'jack') return yield* finishEnc('jack');
      }
      if (E.bypass && !noBy) { log({ t: 'bypass', iid, k: card(iid).k, by: E.bypass }); return yield* finishEnc('pass'); }
      let skipEnc = false;
      if ((SC(iid) && SC(iid).onEnc) || d.onEnc) for (const ri of runnerActives()) {
        const sc = SC(ri);
        if (sc && sc.preventOnEnc && (yield* call(sc.preventOnEnc, ri, { iid }))) { skipEnc = true; log({ t: 'prevent', side: 'runner', k: card(ri).k, what: 'encounter' }); break; }
      }
      if (!skipEnc && SC(iid) && SC(iid).onEnc) {
        const out = yield* call(SC(iid).onEnc, iid, { E, S });
        if (!g.run) return 'end';
        if (out === 'end') { S.endBy = S.endBy || d.name; return yield* finishEnc('end'); }
        if (out === 'pass') return yield* finishEnc('pass');
        if (out === 'jack') return yield* finishEnc('jack');
      }
      if (!skipEnc && d.onEnc === 'toll') {
        if (avail('runner', 'any') >= 3) { pay('runner', 3, 'any'); log({ t: 'toll', paid: 3 }); }
        else { log({ t: 'toll', paid: 0 }); S.endBy = d.name; return yield* finishEnc('end'); }
      }
      if (!skipEnc && d.onEnc === 'popup') { gain('corp', 1); log({ t: 'gain', side: 'corp', n: 1, k: 'popup' }); }
      if (d.onEnc === 'raven') {
        const a = yield* pick('runner', 'raven', 'Data Raven: take 1 tag, or end the run?', [{ id: 'tag', label: 'Take 1 tag' }, { id: 'end', label: 'End the run' }], { always: true, pub: 'Data Raven: a tag, or the run ends' });
        if (a === 'end') { log({ t: 'ravenEnd' }); S.endBy = d.name; return yield* finishEnc('end'); }
        yield* giveTags(1, 'Data Raven');
      }
      if (d.onEnc === 'matrix' && C.credits >= 1) {
        /* Asked even with nothing to advance: whether a hidden card can be advanced must not show. */
        const t = yield* pick('corp', 'matrix', 'Matrix Analyzer: pay 1 to place an advancement token?', advTargets().map(x => cardOpt(x, null, srvName(serverOf(x)) + ' · ' + card(x).adv + ' now')), { skip: 'No', force: true, pub: 'The Corp may use Matrix Analyzer' });
        if (t) { pay('corp', 1, 'any'); card(t).adv++; log({ t: 'adv', iid: t, sid: serverOf(t).id, n: card(t).adv, k: card(t).rez ? card(t).k : null, by: 'matrix_analyzer' }); }
      }
      /* Break what you can */
      for (let guard = 0; guard < 40; guard++) {
        const menu = encMenu();
        const legal = menu.filter(x => !x.bad);
        if (legal.length === 1 && legal[0].id === 'done') break;
        const a = yield* ask('runner', { t: 'enc', why: 'Encountering ' + d.name + ' — strength ' + iceStr(iid, E), pub: 'The Runner faces ' + d.name });
        if (a.id === 'done') break;
        const r = yield* applyBreak(a.id);
        if (!g.run) return 'end';
        if (r === 'end' || r === 'pass' || r === 'jack') return yield* finishEnc(r);
      }
      /* What is not broken fires, in order. */
      let seq = subs.map((s0, k) => k);
      if (rigCards('street_magic').length && seq.filter(k => !E.broken[k]).length > 1) {
        let left = seq.filter(k => !E.broken[k]);
        const order = [];
        while (left.length > 1) {
          const t = +(yield* pick('runner', 'streetMagic', 'Street Magic: which unbroken subroutine fires ' + (order.length ? 'next' : 'first') + '?', left.map(k => ({ id: String(k), label: subText(subs[k]) })), { always: true, pub: 'The Runner orders the subroutines' }));
          order.push(t); left = left.filter(k => k !== t);
        }
        seq = order.concat(left);
      }
      for (const k of seq) {
        if (E.broken[k]) continue;
        if (!g.run || (wasIn && !isInstalled(iid))) break;
        if (S.skipSubs > 0) { S.skipSubs--; log({ t: 'note', side: 'runner', text: '“' + subText(subs[k]) + '” does not fire (' + (S.skipBy || 'Tracker') + ')' }); continue; }
        E.fired.push(k);
        const out = yield* fireSub(subs[k], iid, k);
        if (!g.run) return 'end';
        if (out === 'end') { S.endBy = S.endBy || (subs[k].sensei ? 'Sensei' : d.name); return yield* finishEnc('end'); }
        if (out === 'jack') return yield* finishEnc('jack');
        if (out === 'cell') return yield* finishEnc('cell');
        if (out === 'gone') break;
        if (out && out.moved) return yield* finishEnc(out);
        if (out && out.outer) return yield* finishEnc(out);
      }
      return yield* finishEnc('pass');
      /* The encounter ends: Crypsis loses a counter (or goes), Chum bites. */
      function* finishEnc(out) {
        if (E.used.crypsis) for (const cr of E.used.crypsis) {
          if (!isInstalled(cr)) continue;
          if (card(cr).virus > 0) { card(cr).virus--; log({ t: 'virus', k: 'crypsis', n: card(cr).virus }); }
          else trashRunner(cr, 'crypsis');
        }
        for (const fa of E.used.faerie || []) if (isInstalled(fa)) trashRunner(fa, 'faerie');
        if (E.subs.length && E.broken.every(b => b) && isInstalled(iid)) {
          yield* emit('fullyBroken', { iid, E });
          if (g.run && g.run.o.card && SC(g.run.o.card) && SC(g.run.o.card).runFullyBroken && isInstalled(iid)) yield* call(SC(g.run.o.card).runFullyBroken, g.run.o.card, { iid, E });
        }
        /* Oversight AI: every subroutine broken in one encounter, and the ice goes. */
        if (card(iid).oversight && E.subs.length && E.broken.every(b => b) && isInstalled(iid)) { const kk = card(iid).k; toArchives(iid, true); log({ t: 'oversight', k: kk }); }
        if (g.run) g.run.enc = null;
        if (E.chum && E.broken.some(b => !b)) yield* damage('net', 3, 'Chum');
        if (g.run) yield* emit('encounterEnd', { iid, E, S, out });
        if (g.run && E.moveTo && (out === 'pass' || out === null)) { g.run.sid = E.moveTo; return { moved: E.moveTo, outer: true }; }
        return out;
      }
    }
    /* The encounter menu: one pure function (the phone renders it, the house
       scores it, the check re-runs it). */
    function encMenu() {
      const S = g.run, E = S && S.enc;
      if (!E) return [];
      const d = CARD[E.k];
      const o = [];
      const subs = E.subs;
      const open = subs.map((s, k) => k).filter(k => !E.broken[k]);
      const types = typesOf(E.iid);
      const have = avail('runner', 'breaker');
      /* Subroutines that cannot be broken at all (Unorthodox Predictions). */
      if (open.length && mod('unbreakable', false, { iid: E.iid })) {
        for (const ri of runnerActives()) { const sc = SC(ri); if (sc && sc.encOpts) (sc.encOpts(X, ri, E) || []).forEach((a, n) => { if (a && a.kind !== 'break' && a.kind !== 'all') o.push(Object.assign({ subs: [], cost: 0 }, a, { id: 'xe:' + ri + ':' + n, card: card(ri).k })); }); }
        o.push({ id: 'done', kind: 'done', label: 'Its subroutines cannot be broken — let them fire', subs: open.slice() });
        return o;
      }
      /* Deus X: trash it to break every subroutine on an AP ice. */
      if (/\bAP\b/.test(d.kw || '') && open.length) for (const dx of rigCards('deus_x')) o.push({ id: 'deusx:' + dx, kind: 'all', card: 'deus_x', subs: open.slice(), label: 'Deus X: trash it — break every subroutine on this AP ice', cost: 0, plan: 'Deus X is trashed' });
      for (const b of breakers()) {
        const bd = dat(b);
        const abils = bd.brks || [bd.brk];
        abils.forEach((ab, ai) => {
          if (!ab || !brkFits(b, ab, types, E)) return;
          const tail = ai ? ':' + ai : '';
          for (const k of open) {
            if (ab.only && ab.only.indexOf(subs[k].k) < 0) continue;
            const subsHit = ab.n > 1 ? open.filter(x => x >= k && (!ab.only || ab.only.indexOf(subs[x].k) >= 0)).slice(0, ab.n) : [k];
            const plan = breakPlan(b, subsHit.length, ab);
            if (!plan) continue;
            o.push({ id: 'brk:' + b + ':' + k + tail, kind: 'break', card: card(b).k, sub: k, subs: subsHit, label: 'Break ' + subsHit.map(x => '“' + subText(subs[x]) + '”').join(' and ') + ' with ' + bd.name, cost: plan.total, plan: planWords(plan, bd), bad: planBad(b, plan) });
          }
          if (open.length > 1 && !ab.only) {
            const plan = breakPlan(b, open.length, ab);
            if (plan) o.push({ id: 'all:' + b + tail, kind: 'all', card: card(b).k, subs: open.slice(), label: 'Break every subroutine with ' + bd.name, cost: plan.total, plan: planWords(plan, bd), bad: planBad(b, plan) });
          }
        });
      }
      for (const ri of runnerActives()) {
        const sc = SC(ri);
        if (!sc || !sc.encOpts) continue;
        (sc.encOpts(X, ri, E) || []).forEach((a, n) => { if (a) o.push(Object.assign({ kind: 'break', subs: [], cost: 0 }, a, { id: 'xe:' + ri + ':' + n, card: card(ri).k })); });
      }
      /* Ice that lets the Runner spend clicks: Bioroids (a click a subroutine,
         or `clickBreak: { clicks, n }` — lose that many clicks to break up to n). */
      if (d.creditBreak) for (const k of open) o.push({ id: 'cred:' + k, kind: 'break', sub: k, subs: [k], label: 'Pay ' + d.creditBreak.cost + ': break “' + subText(subs[k]) + '”', cost: d.creditBreak.cost, plan: d.creditBreak.cost + ' credits', bad: avail('runner', 'any') < d.creditBreak.cost ? 'Costs ' + d.creditBreak.cost : null });
      if (d.clickBreak === true) for (const k of open) o.push({ id: 'click:' + k, kind: 'click', sub: k, subs: [k], label: 'Spend a click: break “' + subText(subs[k]) + '”', cost: 0, bad: R.clicks < 1 ? 'No clicks left' : null });
      else if (d.clickBreak) for (const k of open) {
        const hit = open.filter(x => x >= k).slice(0, d.clickBreak.n);
        o.push({ id: 'click:' + k, kind: 'click', sub: k, subs: hit, label: 'Lose ' + plural(d.clickBreak.clicks, 'click') + ': break ' + hit.map(x => '“' + subText(subs[x]) + '”').join(' and '), cost: 0, bad: R.clicks < d.clickBreak.clicks ? 'Not enough clicks' : null });
      }
      if (E.brokeAny && rigCards('e3').length) for (const k of open) o.push({ id: 'e3:' + k, kind: 'break', card: 'e3', sub: k, subs: [k], label: 'e3 Feedback Implants: pay 1 to break “' + subText(subs[k]) + '”', cost: 1, plan: '1 credit', bad: avail('runner', 'any') < 1 ? 'No credits' : null });
      for (const ha of rigCards('helpful_ai')) for (const b of breakers()) {
        const bd = dat(b);
        if (bd.brk.type !== 'any' && types.indexOf(bd.brk.type) < 0) continue;
        o.push({ id: 'hai:' + ha + ':' + b, kind: 'lower', card: 'helpful_ai', label: 'The Helpful AI: trash it — ' + bd.name + ' +2 strength this turn', sub2: 'now ' + breakerStr(b), cost: 0 });
      }
      if (!open.length && subs.length) for (const cr of rigCards('crescentus')) o.push({ id: 'cresc:' + cr, kind: 'lower', card: 'crescentus', label: 'Crescentus: trash it — derez ' + d.name, cost: 0 });
      for (const ds of rigCards('datasucker')) if (virusOf(ds) > 0) o.push({ id: 'suck:' + ds, kind: 'lower', card: 'datasucker', label: 'Datasucker: spend a virus counter — ' + d.name + ' −1 strength', sub2: plural(card(ds).virus, 'counter'), cost: 0 });
      if (mod('onlyBreakerAbils', false, {})) for (let n = o.length - 1; n >= 0; n--) { const src = o[n].id.split(':'); if (['suck', 'hai', 'cresc', 'e3', 'deusx'].indexOf(src[0]) >= 0 || (src[0] === 'xe' && !dat(src[1]).brk)) o.splice(n, 1); }
      if (S.armored && !R.grip.length) for (const x of o) if (x.kind === 'break' || x.kind === 'all' || x.kind === 'click') x.bad = x.bad || 'Armored Servers: a card from your grip is needed to break';
      o.push({ id: 'done', kind: 'done', label: open.length ? (open.length === subs.length ? 'Break nothing — let it fire' : 'Let the rest fire') : 'Pass the ice', subs: open.slice() });
      return o;
    }
    function subText(s) {
      switch (s.k) {
        case 'etr': return 'End the run';
        case 'loseClick': return 'Lose a click';
        case 'trashProg': return 'Trash a program';
        case 'brain': return s.n + ' brain damage';
        case 'net': return s.n + ' net damage';
        case 'gain': return 'The Corp gains ' + s.n;
        case 'trace': if (s.text) return 'Trace ' + s.n + ' — ' + s.text; return 'Trace ' + s.n + ' — ' + ({ tag: '1 tag', ichi: '1 tag and 1 brain damage', raven: 'a power counter', gain3: 'the Corp gains 3', etr: 'end the run', loseClick: 'lose a click', noRun: 'no more runs this turn', sherlock: 'a program to the top of the stack', flare: 'trash a hardware, 2 meat damage, end the run', burke: 'trash a program', draco: '1 tag and end the run', hound: 'look at the top of the stack' })[s.then];
        case 'psi': return 'Psi game — ' + (s.then === 'etr' ? 'end the run' : 'move to another server');
        case 'sensei': return 'Every later ice this run: + End the run';
        case 'whirlpool': return 'No jacking out this run; then it is trashed';
        case 'payOrEnd': return 'End the run unless you pay ' + s.n;
        case 'cell': return 'Back to the outermost ice';
        case 'chum': return 'The next ice: +2 strength, 3 net damage';
        case 'dataMine': return '1 net damage, then it is trashed';
        case 'meat': return s.n + ' meat damage';
        case 'tag': return plural(s.n || 1, 'tag');
        case 's': return s.text || '…';
        case 'multi': return s.text || s.do.map(subText).join(', ');
        case 'unless': return subText(s.do) + ' unless the Runner pays ' + s.pay;
        case 'power': return 'A power counter on this ice';
        case 'mustPay': return 'The Runner pays ' + s.n + ', or the run ends';
      }
      return s.text || s.k;
    }
    /* What it costs one breaker to break `nSubs` subroutines on the ice being
       encountered: lower the ice (Wyrm), pump the breaker, pay per break. */
    function breakPlan(b, nSubs, ab) {
      const S = g.run, E = S.enc, bd = dat(b);
      ab = ab || bd.brk;
      let ice = iceStr(E.iid, E);
      let lowers = 0;
      /* Atman: only ice of exactly its strength. */
      if (bd.exact) return breakerStr(b) === ice ? { lowers: 0, pumps: 0, breaks: Math.ceil(nSubs / ab.n), total: Math.ceil(nSubs / ab.n) * ab.cost, pumpCost: 0 } : null;
      if (bd.noStr) { const br = Math.ceil(nSubs / ab.n); if (ab.counters && br > card(b).power) return null; return { lowers: 0, pumps: 0, breaks: br, total: br * ab.cost, pumpCost: 0, why: ab.why || null }; }
      if (!bd.pump && !ab.zero && breakerStr(b) < ice) return null;
      if (ab.zero) { lowers = Math.max(0, ice); ice -= lowers; if (lowers && !bd.lower) return null; }
      const bs = breakerStr(b);
      let pumps = 0;
      if (bs < ice) { if (!bd.pump) return null; pumps = Math.ceil((ice - bs) / bd.pump.by); }
      const breaks = Math.ceil(nSubs / ab.n);
      if (ab.counters && breaks > card(b).power) return null;
      if (ab.grip) { const cards = breaks + (bd.pump && bd.pump.grip ? pumps : 0); if (cards > R.grip.length) return null; return { lowers, pumps, breaks, pumpCost: 0, total: 0, cards }; }
      const pumpCost = pumps * (bd.pump ? bd.pump.cost : 0);
      const extra = breaks * (Math.max(0, mod('breakExtra', 0, { b })) + (S.breakTax || 0));
      return { lowers, pumps, breaks, pumpCost, total: lowers * (bd.lower ? bd.lower.cost : 0) + pumpCost + breaks * ab.cost + extra, why: ab.why || null };
    }
    /* Whether a breaker's ability may touch this ice at all. */
    function brkFits(b, ab, types, E) {
      const t = ab.type;
      if (g.run && ((g.run.disabled || []).indexOf(b) >= 0 || g.run.noPrograms)) return false;
      if (t !== 'any' && !(Array.isArray(t) ? t.some(x => types.indexOf(x) >= 0) : types.indexOf(t) >= 0)) return false;
      const sc = SC(b);
      if (sc && sc.canBreak && !sc.canBreak(X, b, E)) return false;
      const isc = SC(E.iid);
      if (isc && isc.blocks && isc.blocks(X, E.iid, b)) return false;
      return true;
    }
    /* Why a plan cannot be paid for (a pump paid only in stealth credits: Dagger). */
    function planBad(b, plan) {
      const bd = dat(b);
      const pw = bd.pump && bd.pump.why;
      if (pw && plan.pumpCost) {
        if (avail('runner', pw, { b }) < plan.pumpCost) return 'Its strength costs ' + plan.pumpCost + ' from ' + pw + ' cards';
        if (avail('runner', 'breaker', { b }) < plan.total) return 'Costs ' + plan.total;
        return null;
      }
      if (plan.why) return avail('runner', plan.why, { b }) < plan.total ? 'Costs ' + plan.total + ' from ' + plan.why + ' cards' : null;
      const have = avail('runner', 'breaker', { b });
      return plan.total > have ? 'Costs ' + plan.total + ' — you have ' + have : null;
    }
    function planWords(p, bd) {
      const bits = [];
      if (p.lowers) bits.push('lower the ice ' + p.lowers);
      if (p.pumps) bits.push('+' + p.pumps * bd.pump.by + ' strength');
      bits.push(plural(p.breaks, 'break'));
      return bits.join(', ') + ' · ' + p.total + ' credit' + (p.total === 1 ? '' : 's');
    }
    /* Subroutines about to be broken: the Corp may stop some (Tyr's Hand). */
    function* breaking(E, subs) {
      const ctx = { E, subs, prevent: [] };
      for (const ci of corpActives()) {
        const sc = SC(ci);
        if (sc && sc.onBreaking && stillActive(ci)) yield* call(sc.onBreaking, ci, ctx);
      }
      if (ctx.prevent.length) log({ t: 'unbroken', n: ctx.prevent.length });
      return subs.filter(k => ctx.prevent.indexOf(k) < 0);
    }
    function* applyBreak(id) {
      const S = g.run, E = S.enc, d = CARD[E.k];
      const [kind, x, y] = id.split(':');
      const opt0 = encMenu().find(o => o.id === id);
      if (S.armored && opt0 && (opt0.kind === 'break' || opt0.kind === 'all' || opt0.kind === 'click') && R.grip.length) {
        const t = yield* pick('runner', 'armored', 'Armored Servers: trash a card from your grip to break', R.grip.map(i => cardOpt(i)), { always: true, pub: 'The Runner pays Armored Servers' });
        if (t) { lift(t); card(t).up = true; R.heap.push(t); heardTrash([t], true); }
      }
      if (kind === 'xe') { return yield* call(SC(x).encUse, x, +y, E); }
      if (kind === 'suck') { spendVirus(x, 1); E.lower++; log({ t: 'lower', k: 'datasucker', iid: E.iid }); return; }
      if (kind === 'click') {
        const cb = d.clickBreak === true ? { clicks: 1, n: 1 } : d.clickBreak;
        const open = E.broken.map((b, k) => b ? null : k).filter(k => k != null);
        let hit = open.filter(k => k >= +x).slice(0, cb.n);
        R.clicks -= cb.clicks; S.clickBroke = true;
        yield* emit('clickSpent', { n: cb.clicks });
        hit = yield* breaking(E, hit);
        for (const k of hit) E.broken[k] = true; E.brokeAny = true;
        log({ t: 'break', how: 'click', iid: E.iid, subs: hit });
        return;
      }
      if (kind === 'cred') { pay('runner', d.creditBreak.cost, 'any'); const won = yield* breaking(E, [+x]); for (const k of won) E.broken[k] = true; E.brokeAny = true; log({ t: 'break', how: 'credits', iid: E.iid, subs: won, cost: d.creditBreak.cost }); return; }
      if (kind === 'e3') { pay('runner', 1, 'any'); E.broken[+x] = true; log({ t: 'break', how: 'e3', iid: E.iid, subs: [+x], cost: 1 }); return; }
      if (kind === 'deusx') { const subs = E.broken.map((b, k) => b ? null : k).filter(k => k != null); trashRunner(x, 'used'); for (const k of subs) E.broken[k] = true; E.brokeAny = true; log({ t: 'break', how: 'deus_x', iid: E.iid, subs }); return; }
      if (kind === 'hai') { trashRunner(x, 'used'); const was = card(y).haiTurn === g.turnN ? card(y).hai : 0; card(y).haiTurn = g.turnN; card(y).hai = was + 2; log({ t: 'boost', k: 'helpful_ai', iid: y, n: 2 }); return; }
      if (kind === 'cresc') { trashRunner(x, 'used'); card(E.iid).rez = false; card(E.iid).chimera = null; log({ t: 'derez', k: card(E.iid).k, why: 'crescentus' }); return; }
      const opt = encMenu().find(o => o.id === id);
      const b = x, bd = dat(b);
      const ab = (bd.brks || [bd.brk])[kind === 'all' ? +(y || 0) : +(id.split(':')[3] || 0)] || bd.brk;
      const subs = opt.subs;
      const plan = breakPlan(b, subs.length, ab);
      if (bd.pump && bd.pump.why && plan.pumpCost) { pay('runner', plan.pumpCost, bd.pump.why, { b }); pay('runner', plan.total - plan.pumpCost, plan.why || 'breaker', { b }); }
      else pay('runner', plan.total, plan.why || 'breaker', { b });
      if (plan.lowers) E.lower += plan.lowers;
      if (plan.pumps && !bd.pump.run && R.cur.some(i => card(i).k === 'system_seizure') && R.seizureTurn !== g.turnN) { R.seizureTurn = g.turnN; S.seized = b; log({ t: 'note', side: 'runner', text: 'System Seizure: ' + nameOf(b) + '’s strength lasts the run' }); }
      if (plan.pumps) { if (bd.pump.run || S.seized === b) S.pump[b] = (S.pump[b] || 0) + plan.pumps * bd.pump.by; else E.pump[b] = (E.pump[b] || 0) + plan.pumps * bd.pump.by; }
      if (ab.counters) card(b).power -= plan.breaks;
      if (plan.cards) {
        const ids = yield* pick('runner', 'gripCost', nameOf(b) + ': trash ' + plural(plan.cards, 'card') + ' from your grip to pay', R.grip.map(i => cardOpt(i)), { multi: true, min: plan.cards, max: plan.cards });
        for (const t of ids) { lift(t); card(t).up = true; R.heap.push(t); }
      }
      if (bd.pump && bd.pump.perm && plan.pumps) { card(b).power += plan.pumps * bd.pump.by; delete (S.pump[b]); delete (E.pump[b]); }
      const won = yield* breaking(E, subs.slice());
      for (const k of won) E.broken[k] = true;
      E.brokeAny = true;
      E.used.by = E.used.by || {}; E.used.by[b] = (E.used.by[b] || 0) + won.length;
      S.usedBreakers = S.usedBreakers || []; if (S.usedBreakers.indexOf(b) < 0) S.usedBreakers.push(b);
      if (card(b).k === 'crypsis') { E.used.crypsis = E.used.crypsis || []; if (E.used.crypsis.indexOf(b) < 0) E.used.crypsis.push(b); }
      if (card(b).k === 'faerie') { E.used.faerie = E.used.faerie || []; if (E.used.faerie.indexOf(b) < 0) E.used.faerie.push(b); }
      if (bd.snow) S.pump[b] = (S.pump[b] || 0) + subs.length;
      log({ t: 'break', how: card(b).k, iid: E.iid, subs: subs.slice(), cost: plan.total, pumps: plan.pumps, lowers: plan.lowers });
      if (SC(b) && SC(b).onBreak) yield* call(SC(b).onBreak, b, { E, subs });
    }
    function* fireSub(sub, iid, k) {
      const name = nameOf(iid);
      log({ t: 'sub', iid, k: card(iid).k, i: k, sub: sub.k });
      switch (sub.k) {
        case 'etr': return 'end';
        case 'loseClick': if (R.clicks > 0) { R.clicks--; log({ t: 'loseClick', k: card(iid).k }); yield* emit('clickLost', { n: 1 }); } return null;
        case 'trashProg': yield* trashProgram(name); return null;
        case 'brain': yield* damage('brain', sub.n, name); return null;
        case 'net': yield* damage('net', sub.n, name); return null;
        case 'gain': gain('corp', sub.n); log({ t: 'gain', side: 'corp', n: sub.n, k: card(iid).k }); return null;
        case 'meat': yield* damage('meat', sub.n, name); return null;
        case 'multi': { for (const x of sub.do) { const r = yield* fireSub(x, iid, k); if (r) return r; } return null; }
        case 'unless': {
          if (avail('runner', 'any') >= sub.pay && (yield* yesNo('runner', 'unless', nameOf(iid) + ': pay ' + sub.pay + ' to stop “' + subText(sub.do) + '”?', 'Pay ' + sub.pay, 'Let it happen', { pub: nameOf(iid) + ': the Runner may pay' }))) { pay('runner', sub.pay, 'any'); log({ t: 'paid', n: sub.pay, k: card(iid).k }); return null; }
          return (yield* fireSub(sub.do, iid, k)) || null;
        }
        case 'power': card(iid).power += sub.n || 1; log({ t: 'power', k: card(iid).k, n: card(iid).power }); return null;
        case 'mustPay': {
          if (avail('runner', 'any') >= sub.n) { pay('runner', sub.n, 'any'); log({ t: 'paid', n: sub.n, k: card(iid).k }); return null; }
          return 'end';
        }
        case 'tag': yield* giveTags(sub.n || 1, name); return null;
        case 's': {
          const sc = sub.src ? D.SCRIPT[sub.src] : SC(iid);
          const f = sc && sc.subs && sc.subs[sub.n];
          if (!f) return null;
          return (yield* call(f, iid, { sub, k })) || null;
        }
        case 'trace': {
          const tr = yield* trace(sub.n + mod('subTraceBase', 0, { iid }), name);
          if (!tr.ok) { if (sub.fail) return (yield* fireSub(sub.fail, iid, k)) || null; return null; }
          if (sub.do) {
            for (const x of [].concat(sub.do)) { const r = yield* fireSub(Object.assign({ excess: tr.excess }, x), iid, k); if (r) return r; }
            return null;
          }
          if (sub.then === 'tag') yield* giveTags(1, name);
          if (sub.then === 'ichi') { yield* giveTags(1, name); yield* damage('brain', 1, name); }
          if (sub.then === 'raven') { card(iid).power++; log({ t: 'power', k: 'data_raven', n: card(iid).power }); }
          if (sub.then === 'gain3') { gain('corp', 3); log({ t: 'gain', side: 'corp', n: 3, k: card(iid).k }); }
          if (sub.then === 'etr') return 'end';
          if (sub.then === 'loseClick') { if (R.clicks > 0) { R.clicks--; log({ t: 'loseClick', k: card(iid).k }); } }
          if (sub.then === 'noRun') { R.flags.noRun = true; log({ t: 'noRun', k: card(iid).k }); }
          if (sub.then === 'draco') { yield* giveTags(1, name); return 'end'; }
          if (sub.then === 'sherlock') {
            const t = yield* pick('corp', 'sherlock', 'Sherlock 1.0: which program goes back on top of the Runner’s stack?', programs().map(x => cardOpt(x)), { pub: 'The Corp chooses a program' });
            if (t) { const kk = card(t).k; for (const h of hostedOn(t)) trashRunner(h, 'host'); lift(t); wipe(card(t)); R.stack.unshift(t); log({ t: 'toStack', k: kk }); }
          }
          if (sub.then === 'burke') {
            const t = yield* pick('runner', 'burke', 'Burke Bugs: trash one of your programs', programs().map(x => cardOpt(x)), { pub: 'The Runner chooses a program to lose' });
            if (t && !(yield* saveWithConstruct(t))) trashRunner(t, name);
          }
          if (sub.then === 'flare') {
            const t = yield* pick('corp', 'flare', 'Flare: trash which hardware?', rigOf('hardware').map(x => cardOpt(x)), { pub: 'The Corp chooses a hardware' });
            if (t && !(yield* saveWithConstruct(t))) trashRunner(t, name);
            yield* damage('meat', 2, name, { unprev: true });
            return 'end';
          }
          if (sub.then === 'hound' && tr.excess > 0 && R.stack.length) {
            const top = R.stack.slice(0, tr.excess);
            g.revealN++;
            const t = yield* pick('corp', 'hound', 'Data Hound: trash which of the Runner’s top ' + plural(top.length, 'card') + '?', top.map(x => cardOpt(x)), { pub: 'The Corp looks at the Runner’s stack' });
            if (t) { lift(t); card(t).up = true; R.heap.push(t); log({ t: 'hound', k: card(t).k }); }
            let left = top.filter(x => x !== t);
            const order = [];
            while (left.length > 1) {
              const u = yield* pick('corp', 'houndOrder', 'Data Hound: which goes on top?', left.map(x => cardOpt(x)), { pub: 'The Corp arranges the Runner’s stack' });
              order.push(u); left = left.filter(x => x !== u);
            }
            order.push(...left);
            R.stack.splice(0, order.length, ...order);
          }
          return null;
        }
        case 'psi': {
          const differ = yield* psi(name);
          if (!differ) return null;
          if (sub.then === 'etr') return 'end';
          if (sub.then === 'bullfrog' && isInstalled(iid)) {
            const others = C.servers.filter(sv => sv.id !== g.run.sid);
            if (!others.length) return null;
            const to = yield* pick('corp', 'bullfrog', 'Bullfrog: move it — and the run — to the outside of which server?', others.map(sv => ({ id: sv.id, label: sv.name, sub: plural(sv.ice.length, 'ice') })), { pub: 'The Corp moves Bullfrog' });
            const dest = server(to);
            lift(iid); dest.ice.push(iid); if (!server(dest.id)) C.servers.push(dest);
            g.run.sid = to;
            log({ t: 'bullfrog', to });
            return { moved: to };
          }
          return null;
        }
        case 'sensei': g.run.sensei = iid; log({ t: 'sensei' }); return null;
        case 'whirlpool': g.run.noJack = true; log({ t: 'whirlpool' }); if (isInstalled(iid)) toArchives(iid, true); return 'gone';
        case 'payOrEnd': {
          const can = avail('runner', 'any') >= sub.n;
          const a = yield* pick('runner', 'payOrEnd', nameOf(iid) + ': pay ' + sub.n + ' or the run ends', [{ id: 'pay', label: 'Pay ' + sub.n, bad: can ? null : 'You cannot' }, { id: 'end', label: 'Let the run end' }], { always: true, pub: 'Pay, or the run ends' });
          if (a === 'pay') { pay('runner', sub.n, 'any'); log({ t: 'paid', n: sub.n, k: card(iid).k }); return null; }
          return 'end';
        }
        case 'cell': card(iid).rez = false; log({ t: 'cell' }); return 'cell';
        case 'chum': g.run.chum = true; return null;
        case 'dataMine': yield* damage('net', 1, name); if (isInstalled(iid)) toArchives(iid, true); log({ t: 'mineGone' }); return 'gone';
      }
      return null;
    }

    /* ================================================================
       Success and access
       ================================================================ */
    function* success() {
      const S = g.run;
      S.stage = 'success';
      if (S.o.omar && S.sid === 'arch') {
        S.o.asSid = yield* pick('runner', 'omar', 'Omar Keung: the run on Archives is successful — make it HQ or R&D?', [{ id: 'hq', label: 'HQ' }, { id: 'rd', label: 'R&D' }], { always: true, pub: 'Omar Keung changes the server' });
        S.sid = S.o.asSid;
      }
      if (S.o.asPick) {
        const ids = S.o.asPick === 'remote' ? remotes().map(sv => sv.id) : S.o.asPick;
        if (ids.length) {
          S.o.asSid = yield* pick('runner', 'asServer', (S.o.asWhy || 'The run') + ': which server is it a successful run on?', ids.map(id => ({ id, label: srvName(server(id)) })), { always: true, pub: 'The Runner chooses where the run succeeds' });
          S.sid = S.o.asSid;
        }
      }
      const sid = S.o.sneak ? 'hq' : S.sid;
      S.as = sid;
      R.flags.success = true;
      R.flags.succN = (R.flags.succN || 0) + 1;
      R.flags.succ = R.flags.succ || {};
      R.flags.succ[sid] = true;
      if (!isRemote(sid)) R.flags.succCentral = true;
      log({ t: 'success', sid: S.sid, as: sid !== S.sid ? sid : null });
      if (sid === 'hq') {
        if (idK('runner') === 'gabriel' && !R.flags.hqSuccess) { gain('runner', 2); log({ t: 'gain', side: 'runner', n: 2, k: 'gabriel' }); }
        R.flags.hqSuccess = true;
      }
      for (const x of rigCards('desperado')) { gain('runner', 1); log({ t: 'gain', side: 'runner', n: 1, k: 'desperado' }); }
      yield* emit('success', { sid, S });
      if (!g.run) return;
      /* A run event's own "if successful" — 'replace' means instead of accessing. */
      if (S.o.card && SC(S.o.card) && SC(S.o.card).success) {
        const r = yield* call(SC(S.o.card).success, S.o.card, { sid, S });
        if (!g.run) return;
        if (r === 'replace') return yield* endRun('success');
      }
      if (S.replace) { const f = S.replace; S.replace = null; yield* f(); if (!g.run) return; return yield* endRun('success'); }
      if (!isRemote(sid)) for (const x of rigCards('datasucker')) addVirus(x, 1);
      if (sid === 'rd') for (const x of rigCards('medium').concat(rigCards('deep_thought'))) addVirus(x, 1);
      if (sid === 'hq') for (const x of rigCards('nerve_agent').concat(rigCards('pheromones'))) addVirus(x, 1);
      /* The server's own upgrades react to a successful run on it. */
      const sv = server(S.sid);
      if (sv) {
        for (const h of rezzed('hokusai', sv.root)) yield* damage('net', 1, 'Hokusai Grid');
        for (const a of rezzed('ash', sv.root)) { if ((yield* trace(4, 'Ash 2X3ZB9CY')).ok) { S.ashOnly = a; log({ t: 'ash' }); } }
        for (const b of rezzed('bernice', sv.root)) {
          if ((yield* trace(5, 'Bernice Mai')).ok) yield* giveTags(1, 'Bernice Mai');
          else if (isInstalled(b)) { toArchives(b, true); log({ t: 'bernice' }); }
        }
      }
      if (!g.run) return;
      if (S.o.vamp && sid === 'hq') {
        const most = Math.min(C.credits, avail('runner', 'any'));
        const opts = [{ id: '0', label: 'Access HQ as normal' }];
        for (let x = 1; x <= most; x++) opts.push({ id: String(x), label: 'Pay ' + x + ': the Corp loses ' + x + ' (and you take a tag)' });
        const x = +(yield* pick('runner', 'vamp', 'Vamp: pay X so the Corp loses X, instead of accessing?', opts, { always: true, pub: 'Vamp' }));
        if (x > 0) { pay('runner', x, 'any'); C.credits -= x; log({ t: 'vamp', n: x }); yield* giveTags(1, 'Vamp'); return yield* endRun('success'); }
      }
      if (S.o.retrieval && sid === 'arch') {
        const progs = R.heap.filter(x => dat(x).type === 'program');
        const t = yield* pick('runner', 'retrieval', 'Retrieval Run: install a program from your heap for free, instead of accessing?', dedupe(progs.map(x => cardOpt(x))), { skip: 'Access Archives instead', pub: 'Retrieval Run' });
        if (t) { yield* runnerInstall(t, { free: true }); return yield* endRun('success'); }
      }
      if (S.o.indexing && sid === 'rd' && C.rd.length) {
        if (yield* yesNo('runner', 'indexing', 'Indexing: look at the top 5 cards of R&D and rearrange them, instead of accessing?', 'Rearrange them', 'Access as normal', { pub: 'Indexing' })) {
          const top = C.rd.slice(0, 5);
          g.revealN++;
          const order = [];
          let left = top.slice();
          while (left.length > 1) {
            const t = yield* pick('runner', 'indexOrder', 'Indexing: which card goes ' + (order.length ? 'next' : 'on top') + '?', left.map(x => cardOpt(x)), { pub: 'The Runner arranges the top of R&D' });
            order.push(t); left = left.filter(x => x !== t);
          }
          order.push(...left);
          C.rd.splice(0, top.length, ...order);
          log({ t: 'indexing', n: top.length });
          return yield* endRun('success');
        }
      }
      /* Replacements for access */
      if (S.o.siphon) {
        const a = yield* pick('runner', 'siphon', 'Account Siphon: siphon the Corp’s credits instead of accessing?', [{ id: 'siphon', label: 'Siphon: the Corp loses ' + Math.min(5, C.credits) + ', you gain ' + 2 * Math.min(5, C.credits) + ', and take 2 tags' }, { id: 'access', label: 'Access HQ instead' }], { always: true, pub: 'Account Siphon' });
        if (a === 'siphon') {
          const n = Math.min(5, C.credits);
          C.credits -= n; gain('runner', 2 * n);
          log({ t: 'siphon', n });
          yield* giveTags(2, 'Account Siphon');
          return yield* endRun('success');
        }
      }
      if (isRemote(sid)) for (const bj of rigCards('bank_job')) {
        const c = card(bj);
        if (c.cred <= 0) continue;
        const opts = [{ id: '0', label: 'Access the server as normal' }];
        for (let n = 1; n <= c.cred; n++) opts.push({ id: String(n), label: 'Take ' + n + ' from Bank Job instead' + (n === c.cred ? ' (all of it)' : '') });
        const a = +(yield* pick('runner', 'bankJob', 'Bank Job: take credits instead of accessing?', opts, { always: true, pub: 'Bank Job' }));
        if (a > 0) {
          c.cred -= a; gain('runner', a);
          log({ t: 'gain', side: 'runner', n: a, k: 'bank_job' });
          if (c.cred <= 0) trashRunner(bj, 'empty');
          return yield* endRun('success');
        }
      }
      yield* access(sid);
      return yield* endRun('success');
    }
    function* access(sid) {
      const S = g.run;
      S.stage = 'access';
      const s = server(sid);
      const list = [];
      if (s) for (const x of s.root) { list.push({ iid: x, from: sid, root: true }); for (const h of C.hosted.filter(i => card(i).host === x && dat(i).type !== 'ice')) list.push({ iid: h, from: sid, root: true }); }
      if (sid === 'hq' && !S.noHQCards) {
        const pool = C.hq.slice();
        let n = 1 + rigCards('hq_interface').length + (S.o.extraHQ || 0);
        for (const m of rigCards('nerve_agent')) n += Math.max(0, virusOf(m) - 1);
        n = mod('accessHQ', n, { S });
        if (S.corpPicksHQ && pool.length) {
          const m = Math.min(n, pool.length);
          const ids = yield* pick('corp', 'dnnPick', 'Dedicated Neural Net: which ' + plural(m, 'card') + ' from HQ does the Runner access?', pool.map(i => cardOpt(i)), { multi: true, min: m, max: m, pub: 'The Corp chooses what the Runner sees in HQ' });
          for (const i of ids) list.push({ iid: i, from: 'hq' });
        } else for (let k = 0; k < n && pool.length; k++) { const i = Math.floor(rand() * pool.length); list.push({ iid: pool.splice(i, 1)[0], from: 'hq' }); }
      }
      if (sid === 'rd') {
        let n = 1 + (S.o.extra || 0) + rigCards('rd_interface').length;
        for (const m of rigCards('medium')) n += Math.max(0, virusOf(m) - 1);
        n = mod('accessRD', n, { S });
        const rd = S.o.bottom ? C.rd.slice().reverse() : C.rd;
        for (const x of rd.slice(0, n)) list.push({ iid: x, from: 'rd' });
      }
      if (sid === 'arch') for (const x of C.arch.slice()) list.push({ iid: x, from: 'arch' });
      /* Cards that cannot be accessed this turn (Queen's Gambit). */
      for (let n = list.length - 1; n >= 0; n--) if (card(list[n].iid).x.noAccess === g.turnN) list.splice(n, 1);
      /* Hudson 1.0: no more than so many this run. */
      if (S.accessMax != null && list.length > S.accessMax) list.length = S.accessMax;
      /* Ash: only Ash may be accessed this run. */
      if (S.ashOnly) { const only = list.filter(it => it.iid === S.ashOnly); list.length = 0; list.push(...only); }
      log({ t: 'access', sid, n: list.length });
      if (S.noAccess) { list.length = 0; log({ t: 'note', side: 'runner', text: 'No cards may be accessed this run' }); }
      for (const it of list) {
        if (!g.run) break;
        if (it.from === 'hq' && C.hq.indexOf(it.iid) < 0) continue;
        if (it.from === 'rd' && C.rd.indexOf(it.iid) < 0) continue;
        const fee = it.root ? mod('accessCost', 0, { iid: it.iid, sid }) : 0;
        if (fee > 0) {
          const can = avail('runner', 'any') >= fee;
          if (!can || !(yield* yesNo('runner', 'accessFee', 'Accessing this card costs ' + fee + '. Pay it?', 'Pay ' + fee, 'Leave it', { pub: 'The Runner pays to access, or not' }))) continue;
          pay('runner', fee, 'any');
        }
        yield* accessOne(it.iid, it.from, sid);
      }
      S.accessing = null;
      if (S.seen.length) yield* hold({ k: 'access', sid, seen: clone(S.seen) });
    }
    function* accessOne(iid, from, sid) {
      yield* accessOneInner(iid, from, sid);
      if (g.run) yield* emit('accessed', { iid, from, sid });
    }
    function* accessOneInner(iid, from, sid) {
      const S = g.run, c = card(iid), d = dat(iid);
      const seen = { iid, card: c.k, from, did: null };
      S.seen.push(seen);
      S.accessing = { iid, card: c.k, from };
      g.revealN++;
      log({ t: 'sees', k: c.k, from, iid });
      const installed = isInstalled(iid);
      if (SC(iid) && SC(iid).onAccess) {
        yield* call(SC(iid).onAccess, iid, { from, installed, seen, sid });
        if (!g.run) return;
        if (seen.gone) return;
      }
      yield* emit('access', { iid, from, installed, seen, sid });
      if (!g.run || seen.gone) return;
      /* Fetal AI: 2 net damage wherever it is found but Archives. */
      if (c.k === 'fetal_ai' && from !== 'arch') { log({ t: 'ambush', k: 'fetal_ai' }); yield* damage('net', 2, 'Fetal AI'); if (!g.run) return; }
      if (c.k === 'edge' && installed && C.credits >= 3) {
        const sv = serverOf(iid), n = sv ? sv.ice.length : 0;
        if (n && (yield* yesNo('corp', 'edge', 'Edge of World: pay 3 for ' + n + ' brain damage (one per ice protecting this server)?', 'Spring it (3)', 'Let it be', { pub: 'Edge of World — the Corp decides' }))) {
          pay('corp', 3, 'any'); log({ t: 'ambush', k: 'edge' }); seen.did = 'sprung';
          yield* damage('brain', n, 'Edge of World');
        }
      }
      /* The Corp's ambushes */
      if (c.k === 'snare' && from !== 'arch' && C.credits >= 4) {
        if (yield* yesNo('corp', 'snare', 'The Runner has found Snare! Pay 4 for 3 net damage and a tag?', 'Spring it (4)', 'Let it be', { pub: 'Snare! — the Corp decides' })) {
          pay('corp', 4, 'any'); log({ t: 'ambush', k: 'snare' });
          yield* damage('net', 3, 'Snare!');
          yield* giveTags(1, 'Snare!');
          seen.did = 'sprung';
        }
      }
      if (installed && c.adv > 0) {
        if (c.k === 'junebug' && C.credits >= 1 && (yield* yesNo('corp', 'junebug', 'Project Junebug: pay 1 for ' + 2 * c.adv + ' net damage?', 'Spring it (1)', 'Let it be', { pub: 'Project Junebug — the Corp decides' }))) {
          pay('corp', 1, 'any'); log({ t: 'ambush', k: 'junebug' }); seen.did = 'sprung';
          yield* damage('net', 2 * c.adv, 'Project Junebug');
        }
        if (c.k === 'agg_sec' && C.credits >= 2 && programs().length && (yield* yesNo('corp', 'aggSec', 'Aggressive Secretary: pay 2 to trash ' + plural(c.adv, 'program') + '?', 'Spring it (2)', 'Let it be', { pub: 'Aggressive Secretary — the Corp decides' }))) {
          pay('corp', 2, 'any'); log({ t: 'ambush', k: 'agg_sec' }); seen.did = 'sprung';
          for (let n = 0; n < c.adv; n++) yield* trashProgram('Aggressive Secretary');
        }
        if (c.k === 'ghost_branch' && (yield* yesNo('corp', 'ghost', 'Ghost Branch: give the Runner ' + plural(c.adv, 'tag') + '?', 'Tag them', 'Let it be', { pub: 'Ghost Branch — the Corp decides' }))) {
          log({ t: 'ambush', k: 'ghost_branch' }); seen.did = 'sprung';
          yield* giveTags(c.adv, 'Ghost Branch');
        }
      }
      if (!g.run) return;
      /* Imp: once a turn, a virus counter trashes the card being accessed, whatever it is. */
      const imp = from !== 'arch' && !R.flags.imp ? rigCards('imp').find(x => card(x).virus > 0) : null;
      if (d.type === 'agenda') {
        /* Demolition Run trashes even what cannot normally be trashed. */
        if ((S.o.demo || imp) && from !== 'arch') {
          const opts = [{ id: 'steal', label: 'Steal it — ' + plural(d.pts, 'point') }];
          if (S.o.demo) opts.push({ id: 'trash', label: 'Trash it (free, Demolition Run)' });
          if (imp) opts.push({ id: 'imp', label: 'Trash it with Imp (a virus counter)' });
          const a = yield* pick('runner', 'demoAgenda', d.name + ': steal it, or trash it?', opts, { always: true, pub: 'The Runner decides: steal or trash' });
          if (a === 'imp') { card(imp).virus--; R.flags.imp = true; toArchives(iid, true); log({ t: 'trash', side: 'corp', k: c.k, price: 0, by: 'imp' }); seen.did = 'trashed'; return; }
          if (a === 'trash') { toArchives(iid, true); log({ t: 'trash', side: 'corp', k: c.k, price: 0, by: 'demolition_run' }); seen.did = 'trashed'; return; }
        }
        const s = server(sid);
        const extra = mod('stealCost', (s ? 5 * rezzed('red_herrings', s.root).length : 0) + (c.k === 'fetal_ai' ? 2 : 0), { iid, from });
        const xclicks = mod('stealClicks', 0, { iid, from, sid });
        const xnet = Math.max(mod('stealNet', 0, { iid, from, sid }), S.musashi && S.musashi === sid ? 2 : 0);
        if (seen.noSteal || mod('noSteal', null, { iid, from })) { seen.did = 'left'; log({ t: 'leave', k: c.k }); return; }
        if (extra || xclicks || xnet) {
          const can = avail('runner', 'any') >= extra && R.clicks >= xclicks;
          const cost = [extra ? extra + ' credit' + (extra === 1 ? '' : 's') : null, xclicks ? plural(xclicks, 'click') : null, xnet ? xnet + ' net damage' : null].filter(Boolean).join(' and ');
          const a = yield* pick('runner', 'steal', d.name + ': stealing it costs ' + cost + ' more. Steal it?', [{ id: 'steal', label: 'Pay ' + cost + ' and steal it', bad: can ? null : 'You cannot pay it' }, { id: 'leave', label: 'Leave it' }], { always: true, pub: 'Stealing costs more: the Runner decides' });
          if (a !== 'steal') { seen.did = 'left'; log({ t: 'leave', k: c.k }); return; }
          pay('runner', extra, 'any');
          R.clicks -= xclicks;
          if (xnet) { yield* damage('net', xnet, 'the cost of stealing', { unprev: true }); if (!g.run || g.phase === 'over') return; }
        }
        yield* steal(iid);
        seen.did = 'stolen';
        return;
      }
      if (from === 'arch') { c.up = true; return; }
      const free = !!(S.o.demo);
      const price = free ? 0 : trashCostOf(iid);
      const opts = [];
      const tctx = { asset: d.type === 'asset' };
      if (price != null) opts.push({ id: 'trash', label: price ? 'Trash it (' + price + ')' : 'Trash it (free)', bad: avail('runner', 'trashCost', tctx) < price ? 'Costs ' + price : null });
      if (imp && (price == null || price > 0)) opts.push({ id: 'imp', label: 'Trash it with Imp (a virus counter)' });
      if (!opts.length) return;
      opts.push({ id: 'leave', label: 'Leave it' });
      if (!opts.some(o2 => !o2.bad && o2.id !== 'leave')) { seen.did = 'kept'; return; }
      const a = yield* pick('runner', 'trash', 'You access ' + d.name + (from === 'rd' ? ' (R&D)' : from === 'hq' ? ' (HQ)' : '') + ': trash it?', opts, { always: true, pub: 'The Runner decides whether to trash it' });
      if (a === 'trash') {
        pay('runner', price, 'trashCost', tctx);
        const sc = SC(iid);
        if (sc && sc.onTrashed) yield* call(sc.onTrashed, iid, { by: 'runner', from, seen });
        if (!c.x.saved && (C.hq.indexOf(iid) >= 0 || C.rd.indexOf(iid) >= 0 || isInstalled(iid))) toArchives(iid, true);
        c.x.saved = false;
        log({ t: 'trash', side: 'corp', k: c.k, price, by: free ? 'demolition_run' : null });
        seen.did = seen.did || 'trashed';
        R.flags.trashedAccess = true;
        yield* emit('runnerTrashed', { iid, k: c.k, from, installed });
      } else if (a === 'imp') {
        card(imp).virus--; R.flags.imp = true;
        toArchives(iid, true);
        log({ t: 'trash', side: 'corp', k: c.k, price: 0, by: 'imp' });
        seen.did = 'trashed';
      } else seen.did = 'kept';
    }
    function* steal(iid) {
      const c = card(iid);
      dropHosted(iid);
      lift(iid);
      wipe(c);
      c.up = true;
      R.score.push(iid);
      R.flags.stole = true;
      R.flags.stolePts = (R.flags.stolePts || 0) + (CARD[c.k].pts || 0);
      g.revealN++;
      log({ t: 'steal', k: c.k, pts: CARD[c.k].pts, total: points('runner') });
      for (const n of rigCards('nach')) trashRunner(n, 'steal');
      yield* hold({ k: 'score', side: 'runner', card: c.k });
      if (idK('corp') === 'pe') yield* damage('net', 1, 'Personal Evolution');
      winCheck();
      if (SC(iid) && SC(iid).onSteal) yield* call(SC(iid).onSteal, iid, {});
      yield* emit('steal', { iid });
      yield* emit('scoreOrSteal', { iid, side: 'runner' });
      endCurrents('corp');
      winCheck();
    }
    function* endRun(how, by) {
      const S = g.run;
      if (!S) return;
      S.stage = 'end'; S.how = how; S.endBy = by || S.endBy || null;
      S.enc = null; S.accessing = null;
      log({ t: 'runEnd', sid: S.sid, how, by: S.endBy || null });
      if (how !== 'success' && how !== 'nosuccess') R.flags.failed = true;
      if (how !== 'success') yield* hold({ k: 'runend', sid: S.sid, how, by: S.endBy || null });
      g.run = null;
      R.lastPassed = S.passed || [];
      if (how === 'success') {
        R.flags.lastRunWon = true;
        /* Dedicated Response Team: a tagged Runner pays for a successful run. */
        if (R.tags > 0) for (const t of rezzed('drt')) yield* damage('meat', 2, 'Dedicated Response Team');
      }
      if (S.o.stim) yield* damage('brain', 1, 'Stimhack', { unprev: true });
      if (S.o.card && SC(S.o.card) && SC(S.o.card).runEnd) yield* call(SC(S.o.card).runEnd, S.o.card, { how, S });
      yield* emit('runEnd', { how, sid: S.sid, S });
      yield* settlePending();
      checkParasites();
    }

    /* ================================================================
       Answers
       ================================================================ */
    g.advance = function (v) {
      for (;;) {
        let r;
        try { r = g.gen.next(v); }
        catch (e) { if (e === OVER) { g.prompts = []; g.hold = null; return; } throw e; }
        v = undefined;
        if (r.done) return;
        const q = r.value;
        if (q.hold) {
          if (!g.opts.show) continue;
          g.hold = Object.assign({ n: ++g.holdN }, q.hold);
          return;
        }
        if (q.ask) { g.prompts = q.ask; g.answers = {}; return; }
      }
    };
    g.release = function (n) {
      if (!g.hold || (n != null && g.hold.n !== n)) return false;
      g.hold = null;
      g.advance();
      return true;
    };
    function checkPick(pr, a) {
      if (a.t === 'skip') return pr.skip ? yes({ a: { t: 'skip' } }) : no('You have to choose.');
      if (a.t !== 'pick') return no('Answer the question on your screen first.');
      if (pr.multi) {
        const ids = Array.isArray(a.ids) ? a.ids.map(String) : [];
        if (ids.length < pr.min || ids.length > pr.max) return no(pr.min === pr.max ? 'Choose ' + pr.min + '.' : 'Choose between ' + pr.min + ' and ' + pr.max + '.');
        if (new Set(ids).size !== ids.length) return no('Choose each only once.');
        for (const id of ids) { const o = pr.options.find(x => x.id === id); if (!o || o.bad) return no('That is not one of the choices.'); }
        return yes({ a: { t: 'pick', ids } });
      }
      const o = pr.options.find(x => x.id === String(a.id));
      if (!o) return no('That is not one of the choices.');
      if (o.bad) return no(o.bad);
      return yes({ a: { t: 'pick', id: o.id } });
    }
    function checkMenu(pr, a, menu, kind) {
      if (a.t !== kind) return no(kind === 'enc' ? 'You are in an encounter: choose how to deal with the ice.' : 'Choose what to do this turn.');
      const o = menu.find(x => x.id === String(a.id));
      if (!o) return no('That is not one of the choices.');
      if (o.bad) return no(o.bad);
      return yes({ a: { t: kind, id: o.id } });
    }
    function check(p, pr, a) {
      if (pr.t === 'pick') return checkPick(pr, a);
      if (pr.t === 'turn') return checkMenu(pr, a, turnMenu(pr.side), 'turn');
      if (pr.t === 'enc') return checkMenu(pr, a, encMenu(), 'enc');
      return no('That is not something you can do now.');
    }
    g.act = function (seatId, a) {
      const p = P(seatId);
      if (!p) return no('You are not at this table.');
      if (g.phase === 'over') return no('The game is over.');
      if (g.hold) return no('Watch the telly first.');
      if (!a || typeof a !== 'object') return no('Nothing to do.');
      const pr = g.prompts.find(x => x.seat === seatId);
      if (!pr) return no(g.prompts.length ? 'It is not your move — ' + ((P(g.prompts[0].seat) || {}).name || 'the other side') + ' is choosing.' : 'It is not your move.');
      if (a.n != null && +a.n !== pr.n) return no('That question has moved on.');
      const r = check(p, pr, a);
      if (!r.ok) return r;
      g.answers[seatId] = r.a;
      g.prompts = g.prompts.filter(x => x !== pr);
      g.actN++;
      if (!g.prompts.length) { const ans = g.answers; g.answers = {}; g.advance(ans); }
      return yes();
    };

    /* ================================================================
       The views
       ================================================================ */
    const pubPrompt = pr => ({ n: pr.n, seat: pr.seat, side: pr.side, t: pr.t, what: pr.what || null, why: pr.pub || pr.why });
    /* A Corp card as the room sees it: only its place and tokens until it is rezzed. */
    function pubCorpCard(iid) {
      const c = card(iid), d = dat(iid);
      const open = c.rez || !!c.x.faceup;
      const out = { iid, k: open ? c.k : null, rez: c.rez, ice: d.type === 'ice', adv: c.adv };
      if (open) { if (c.cred) out.cred = c.cred; if (c.power) out.power = c.power; if (c.boost) out.boost = c.boost; if (d.type === 'ice') { out.str = iceStr(iid); out.subs = subsOf(iid).length; } if (c.chimera) out.chimera = c.chimera; if (c.oversight) out.oversight = true; if (c.rc) out.rc = c.rc; }
      if (c.cortez === g.turnN && c.cortez) out.cortez = true;
      if (c.tink === g.turnN && c.tink) out.tink = true;
      const hosted = R.rig.filter(i => card(i).host === iid);
      if (hosted.length) out.hosted = hosted;
      const ch = C.hosted.filter(i => card(i).host === iid);
      if (ch.length) out.chosted = ch.map(pubCorpCard);
      if (open && c.agenda) out.agenda = c.agenda;
      if (open && c.virus) out.virus = c.virus;
      const sc = SC(iid);
      if (open && sc && sc.show) out.note = sc.show(X, iid);
      return out;
    }
    function pubRunCard(iid) {
      const c = card(iid), d = dat(iid);
      if (c.x.fd) return { iid, k: null, facedown: true, host: c.host || null };
      const out = { iid, k: c.k, host: c.host || null };
      if (c.virus) out.virus = c.virus;
      if (c.cred) out.cred = c.cred;
      if (d.recur) out.rc = c.rc;
      if (c.mark) out.mark = c.mark;
      if (c.power) out.power = c.power;
      if (d.brk || d.str != null) out.str = breakerStr(iid);
      if (c.agenda) out.agenda = c.agenda;
      const sc = SC(iid);
      if (sc && sc.show) out.note = sc.show(X, iid);
      return out;
    }
    function runView() {
      const S = g.run;
      if (!S) return null;
      const out = { n: S.n, sid: S.sid, as: S.as || null, via: S.o.via || (S.o.sneak ? 'sneakdoor' : null), stage: S.stage, pos: S.pos, at: S.at, approached: S.approached,
        stim: S.stim, bpc: S.bpc, endBy: S.endBy || null, sensei: !!S.sensei, noJack: !!S.noJack, how: S.how || null, seen: clone(S.seen), accessing: S.accessing ? clone(S.accessing) : null, chum: !!S.chum, inside: !!S.inside };
      if (S.enc) {
        const E = S.enc;
        out.enc = { iid: E.iid, k: E.k, subs: clone(E.subs), broken: E.broken.slice(), fired: E.fired.slice(), str: iceStr(E.iid, E), lower: E.lower, chum: !!E.chum,
          breakers: breakers().map(b => ({ iid: b, k: card(b).k, str: breakerStr(b) })) };
      }
      return out;
    }
    g.publicView = function () {
      const open = g.prompts;
      return {
        v: VERSION, phase: g.phase, turnN: g.turnN, round: g.round, active: g.active, win: g.opts.win, cap: g.opts.cap,
        corp: {
          seat: C.seat, fac: C.fac, ident: card(C.ident).k, credits: C.credits, clicks: C.clicks, hqN: C.hq.length, rdN: C.rd.length,
          arch: { down: C.arch.filter(i => !card(i).up).length, up: C.arch.filter(i => card(i).up).map(i => card(i).k) },
          score: C.score.map(i => ({ iid: i, k: card(i).k, agenda: card(i).agenda })), points: points('corp'), bp: C.bp, handMax: corpHandMax(),
          cur: C.cur.map(i => card(i).k),
          recur: card(C.ident).rc, gone: C.gone.map(i => card(i).k), deckN: C.deckN, deckName: C.deckName,
          servers: C.servers.map(s => ({ id: s.id, name: s.name, ice: s.ice.map(pubCorpCard), root: s.root.map(pubCorpCard) }))
        },
        runner: {
          seat: R.seat, fac: R.fac, ident: card(R.ident).k, credits: R.credits, clicks: R.clicks, gripN: R.grip.length, stackN: R.stack.length, gripOpen: mod('gripOpen', false, {}) ? R.grip.map(i => card(i).k) : null,
          heap: R.heap.map(i => card(i).k), rig: R.rig.filter(i => !card(i).x.fd).map(pubRunCard), fd: R.rig.filter(i => card(i).x.fd).map(pubRunCard), score: R.score.map(i => card(i).k), points: points('runner'),
          tags: R.tags, brain: R.brain, link: link(), mu: { used: muUsed(), total: muTotal() }, handMax: runHandMax(), gone: R.gone.map(i => card(i).k),
          ws: R.ws.map(i => ({ iid: i, k: card(i).x.facedown ? null : card(i).k, power: card(i).power, host: card(i).host || null })), cur: R.cur.map(i => card(i).k),
          deckN: R.deckN, deckName: R.deckName, last: Object.assign({}, R.last), flags: { ran: !!R.flags.ran, success: !!R.flags.success, hqSuccess: !!R.flags.hqSuccess, noRun: !!R.flags.noRun, succ: Object.assign({}, R.flags.succ || {}) }
        },
        players: g.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, bot: p.bot, level: p.level, side: p.side })),
        run: runView(),
        prompts: open.map(pubPrompt), prompt: open.length ? pubPrompt(open[0]) : null,
        hold: g.hold ? clone(g.hold) : null,
        log: g.log.slice(-80).map(e => Object.assign({}, e)),
        logN: g.log.length,
        result: g.result
      };
    };
    g.seatView = function (id) {
      const side = g.sideOfSeat(id);
      if (!side) return null;
      const pr = g.prompts.find(x => x.seat === id);
      const out = { id, side, v: VERSION, prompt: pr && !g.hold ? clone(pr) : null };
      if (side === 'corp') {
        out.hand = C.hq.map(i => ({ iid: i, k: card(i).k }));
        out.mine = {};
        for (const i of installedCorp().concat(C.hosted)) out.mine[i] = card(i).k;
        out.archDown = C.arch.filter(i => !card(i).up).map(i => card(i).k);
      } else {
        out.hand = R.grip.map(i => ({ iid: i, k: card(i).k }));
        /* Deep Thought: the top of R&D, this turn only, for the Runner alone. */
        if (R.peek && R.peek.turn === g.turnN && C.rd[0] === R.peek.iid) out.peek = R.peek.k;
        /* Motivation: the top of the Runner's own stack, this turn. */
        if (R.peekStack && R.peekStack.turn === g.turnN && R.stack[0] === R.peekStack.iid) out.peekStack = R.peekStack.k;
        out.wsMine = R.ws.filter(i => card(i).x.facedown).map(i => ({ iid: i, k: card(i).k, host: card(i).host }));
        out.fdMine = R.rig.filter(i => card(i).x.fd).map(i => ({ iid: i, k: card(i).k }));
      }
      if (out.prompt && pr.t === 'turn') out.prompt.options = turnMenu(side);
      if (out.prompt && pr.t === 'enc') out.prompt.options = encMenu();
      return out;
    };

    /* For the tests: every card is somewhere, exactly once, and the numbers
       that must never go wrong have not. */
    g.census = function () {
      const bad = [];
      const seen = {};
      const note = (i, where) => { if (seen[i]) bad.push(i + ' (' + card(i).k + ') in ' + seen[i] + ' and ' + where); seen[i] = where; };
      const L = { hq: C.hq, rd: C.rd, arch: C.arch, cscore: C.score, cgone: C.gone, chosted: C.hosted, ccur: C.cur, grip: R.grip, stack: R.stack, heap: R.heap, rig: R.rig, rscore: R.score, rgone: R.gone, ws: R.ws, rcur: R.cur };
      for (const k of Object.keys(L)) for (const i of L[k]) note(i, k);
      for (const s of C.servers) { for (const i of s.ice) note(i, s.id + ' ice'); for (const i of s.root) note(i, s.id + ' root'); }
      const all = Object.keys(g.cards).filter(i => i !== 'cid' && i !== 'rid');
      for (const i of all) if (!seen[i]) bad.push(i + ' (' + card(i).k + ') is nowhere');
      if (all.length !== C.deckN + R.deckN + (R.extraN || 0)) bad.push('card count ' + all.length);
      for (const i of C.hq.concat(C.rd, C.arch)) if (card(i).side !== 'corp') bad.push('runner card in a corp pile');
      for (const i of R.grip.concat(R.stack, R.heap, R.rig, R.ws)) if (card(i).side !== 'runner' && !(R.ws.indexOf(i) >= 0 && card(i).host && SC(card(i).host) && SC(card(i).host).hostsAgenda)) bad.push('corp card in a runner pile');
      for (const i of R.score) if (card(i).side !== 'corp' && card(i).k !== 'notoriety' && dat(i).scorePts == null) bad.push(card(i).k + ' in the Runner’s score area');
      for (const s of C.servers) {
        for (const i of s.ice) if (dat(i).type !== 'ice') bad.push(card(i).k + ' installed as ice');
        for (const i of s.root) if (dat(i).type === 'ice' || dat(i).type === 'operation') bad.push(card(i).k + ' in a root');
        if (!isRemote(s.id)) { for (const i of s.root) if (dat(i).type !== 'upgrade') bad.push(card(i).k + ' in the root of ' + s.id); }
        else if (s.root.filter(i => ['agenda', 'asset'].indexOf(dat(i).type) >= 0).length > 1) bad.push('two agendas/assets in ' + s.id);
      }
      for (const i of R.rig) { const h = card(i).host; if (h && !isInstalled(h)) bad.push(card(i).k + ' hosted on a card that is gone'); }
      for (const i of C.hosted) { const h = card(i).host; if (!h || !(isInstalled(h) || C.score.indexOf(h) >= 0)) bad.push(card(i).k + ' (Corp) hosted on a card that is gone'); }
      if (C.credits < 0 || R.credits < 0) bad.push('credits below zero');
      if (C.clicks < 0 || R.clicks < 0) bad.push('clicks below zero');
      if (R.tags < 0) bad.push('tags below zero');
      if (muUsed() > muTotal() && !g.prompts.some(p => p.what === 'makeRoom') && !R.rig.some(i => SC(i) && SC(i).dynamicMu)) bad.push('memory over: ' + muUsed() + '/' + muTotal());
      if (faceUpRig().filter(i => dat(i).console).length > 1) bad.push('two consoles');
      for (const dn of rigCards('dinosaurus')) if (hostedOn(dn).length > 1) bad.push('Dinosaurus carries two');
      return bad;
    };

    /* ================================================================
       CARD SCRIPTS — how the later products' cards act (sets/*.js).

       A script is D.SCRIPT[cardId], an object of optional parts. Every part
       gets X (the engine's helpers, below) and the card's iid first; a part
       written as `function*` may ask questions (`yield* X.pick(...)`).

         on: { event: function*(X, iid, ctx) }   while the card is active
               corpTurnBegin corpTurnEnd runnerTurnBegin runnerTurnEnd
               install rez score steal scoreOrSteal play
               runBegin approachIce encounter encounterEnd passIce
               approachServer success access runnerTrashed runEnd
               damaged tagged trace
         mod: { name: (X, iid, value, ctx) => value }   numbers while active:
               link mu muOf corpHand runHand advNeed points agendaPts
               iceStr breakerStr rezCost installCost playCost trashCost
               corpClicks runnerClicks corpDraw accessHQ accessRD stealCost
               noSteal runBad damage subs
         self: { name: … }          the same, for the card itself even when not active
         abils(X, iid) → [{ label, sub, clicks, cost, why, once, bad }]
         use: function*(X, iid, n, abil)           an ability used from the turn menu
         play: function*(X, iid, ctx)              an operation or event, played
         playBad(X, iid) → reason | null
         installBad(X, iid) → reason | null
         onInstall / onRez / onScore / onSteal / onAccess / onTrashed: function*(X, iid, ctx)
         onEnc: function*(X, iid, ctx) → 'end' | 'pass' | null   the ice, encountered
         subs: [function*(X, iid, ctx) → 'end' | null]   an ice's { k: 's', n } subroutines
         encOpts(X, iid, E) → [{ label, kind, subs, cost, bad }] ; encUse: function*(X, iid, n, E)
         winOpts(X, iid, { where, iid, S }) → [{ label, bad }] ; winUse: function*(X, iid, n, ctx)
         prevent: function*(X, iid, { kind, n }) → damage prevented
         avoidTag: function*(X, iid, { n }) → tags avoided
         spend(X, iid, why, ctx) → bool   may credits on this card pay for `why`?
         canBreak(X, breakerIid, E) → bool ; onBreak: function*(X, iid, { E, subs })
         success / runEnd: function*(X, iid, ctx)   a run event's own (the run's S.o.card)
         freeHost: true             programs hosted here use no memory
       Active: the Corp's identity, rezzed installed and hosted cards, scored
       agendas and its current; the Runner's identity, rig and current.
       ================================================================ */
    function SC(iid) {
      const c = card(iid);
      if (!c || blanked(iid)) return null;
      const sc = D.SCRIPT[c.k] || null;
      if (CARD[c.k].copies && c.x.copy && C.cur.indexOf(iid) >= 0) return D.SCRIPT[c.x.copy] || sc;
      return sc;
    }
    /* An identity's id — or null while its abilities are blanked (Cerebral Static). */
    const blankId = side => !!mod('blankId', false, { side });
    function idK(side) { return blankId(side) ? null : card(sideOf(side).ident).k; }
    const MODS = {};
    for (const k of Object.keys(D.SCRIPT)) for (const part of ['mod', 'self', 'runMod']) for (const n of Object.keys(D.SCRIPT[k][part] || {})) MODS[n] = true;
    function corpActives() {
      const out = blankId('corp') ? [] : [C.ident];
      for (const sv of C.servers) { for (const i of sv.ice) if (card(i).rez) out.push(i); for (const i of sv.root) if (card(i).rez || card(i).x.faceup) out.push(i); }
      for (const i of C.hosted) if (card(i).rez) out.push(i);
      return out.concat(C.score, C.cur, lingering('corp'));
    }
    const runnerActives = () => (blankId('runner') ? [] : [R.ident]).concat(R.rig, R.cur, lingering('runner'));
    /* Cards no longer in play whose effect lasts a while (Social Engineering, Three Steps Ahead). */
    function lingering(side) { return g.linger.filter(l => l.side === side && l.until >= g.turnN).map(l => l.iid); }
    function linger(iid, until) { g.linger = g.linger.filter(l => l.until >= g.turnN && l.iid !== iid); g.linger.push({ iid, side: card(iid).side, until: until == null ? g.turnN : until }); }
    const activeIids = () => corpActives().concat(runnerActives());
    const stillActive = iid => activeIids().indexOf(iid) >= 0;
    /* Run a script part: a generator is driven, a plain function just called. */
    function* call(f, iid, ...args) {
      if (!f) return null;
      const r = f(X, iid, ...args);
      if (r && typeof r.next === 'function') return yield* r;
      return r;
    }
    function* emit(ev, ctx) {
      ctx = ctx || {};
      for (const iid of activeIids()) {
        const sc = SC(iid);
        const f = sc && sc.on && sc.on[ev];
        if (!f || !stillActive(iid)) continue;
        yield* call(f, iid, ctx);
        if (g.phase === 'over') break;
      }
      for (const iid of R.heap.slice()) {
        const sc = SC(iid);
        const f = sc && sc.heap && sc.heap[ev];
        if (!f || R.heap.indexOf(iid) < 0) continue;
        yield* call(f, iid, ctx);
        if (g.phase === 'over') break;
      }
      for (const iid of R.grip.concat(C.hq)) {
        const sc = SC(iid);
        const f = sc && sc.hand && sc.hand[ev];
        if (!f || (R.grip.indexOf(iid) < 0 && C.hq.indexOf(iid) < 0)) continue;
        yield* call(f, iid, ctx);
        if (g.phase === 'over') break;
      }
      return ctx;
    }
    let modDepth = 0;
    function mod(name, v, ctx) {
      if (!MODS[name] || modDepth > 3) return v;
      if (name === 'blankId') {
        for (const i of C.cur.concat(R.cur)) { const sc = SC(i); const f = sc && sc.mod && sc.mod.blankId; if (f) v = f(X, i, v, ctx || {}); }
        return v;
      }
      modDepth++;
      try {
        ctx = ctx || {};
        for (const iid of activeIids()) {
          const sc = SC(iid);
          const f = sc && sc.mod && sc.mod[name];
          if (f) v = f(X, iid, v, ctx);
        }
        if (ctx.iid && card(ctx.iid)) { const sc = SC(ctx.iid); const f = sc && sc.self && sc.self[name]; if (f) v = f(X, ctx.iid, v, ctx); }
        if (g.run && g.run.o.card) { const sc = SC(g.run.o.card); const f = sc && sc.runMod && sc.runMod[name]; if (f) v = f(X, g.run.o.card, v, ctx); }
      } finally { modDepth--; }
      return v;
    }
    const playCost = iid => Math.max(0, mod('playCost', dat(iid).cost === 'X' ? 0 : dat(iid).cost || 0, { iid }));
    /* Once-a-turn marks on a card. */
    const onceUsed = (iid, key) => card(iid).x['once:' + key] === g.turnN;
    const markOnce = (iid, key) => { card(iid).x['once:' + key] = g.turnN; };
    /* Abilities a side's active cards offer on its turn menu: ids x:<iid>:<n>. */
    function scriptAbils(side) {
      const o = [];
      const X_ = sideOf(side);
      for (const iid of side === 'corp' ? corpActives().concat(R.score.filter(i => SC(i) && SC(i).abilsAnywhere)) : runnerActives().concat(C.hosted.filter(i => SC(i) && SC(i).abilsFor === 'runner'))) {
        const sc = SC(iid);
        if (!sc || !sc.abils) continue;
        if ((sc.abilsFor || card(iid).side) !== side) continue;
        (sc.abils(X, iid) || []).forEach((a, n) => {
          if (!a) return;
          const clicks = a.clicks || 0, cost = a.cost || 0;
          let bad = a.bad || null;
          if (!bad && X_.clicks < clicks) bad = clicks === 1 ? 'No clicks left' : 'Takes ' + plural(clicks, 'click');
          if (!bad && avail(side, a.why || 'any') < cost) bad = 'Costs ' + cost;
          if (!bad && a.once && onceUsed(iid, a.once)) bad = 'Once a turn';
          o.push({ id: 'x:' + iid + ':' + n, kind: clicks ? 'ability' : 'free', card: card(iid).k, label: a.label,
            sub: a.sub || ((clicks ? plural(clicks, 'click') : 'free') + (cost ? ' · ' + plural(cost, 'credit') : '')), bad });
        });
      }
      return o;
    }
    function* useAbil(side, id) {
      const [, iid, n] = id.split(':');
      const sc = SC(iid);
      const a = (sc.abils(X, iid) || [])[+n];
      sideOf(side).clicks -= a.clicks || 0;
      if (a.cost) pay(side, a.cost, a.why || 'any');
      if (a.once) markOnce(iid, a.once);
      if (a.log !== false) log({ t: 'use', side, k: card(iid).k });
      yield* call(sc.use, iid, +n, a);
    }
    /* Bad publicity, taken (Broadcast Square may stop it) and removed. */
    function* takeBP(n, cause) {
      if (n <= 0) return 0;
      const ctx = { n, cause, prevent: 0 };
      for (const ci of corpActives()) { const sc = SC(ci); if (sc && sc.preventBP && stillActive(ci) && ctx.prevent < n) yield* call(sc.preventBP, ci, ctx); }
      const take = Math.max(0, n - ctx.prevent);
      if (!take) return 0;
      C.bp += take;
      log({ t: 'bp', n: C.bp, add: take, cause: cause || null });
      yield* emit('bp', { n: take, cause });
      return take;
    }
    function loseBP(n, cause) { const k = Math.min(n, C.bp); if (!k) return 0; C.bp -= k; log({ t: 'bpGone', n: k, total: C.bp, cause: cause || null }); return k; }
    /* The Corp trashes one of the Runner's installed cards; the Runner may stop it (Fall Guy). */
    function* corpTrashes(iid, why, o) {
      o = o || {};
      if (!o.unprev) {
        for (const ri of runnerActives()) {
          const sc = SC(ri);
          if (ri === iid || !sc || !sc.preventTrash || !stillActive(ri) || !isInstalled(iid)) continue;
          if (yield* call(sc.preventTrash, ri, { iid, why })) { log({ t: 'prevent', side: 'runner', k: card(ri).k, saved: card(iid).k }); return false; }
        }
      }
      if (isInstalled(iid)) trashRunner(iid, why);
      return true;
    }
    /* Access a card outside a run (Quest Completed, Raymond Flint). */
    function* accessOutside(list, sid) {
      const was = g.run;
      g.run = { n: ++g.runN, sid: sid || null, o: {}, stage: 'access', pos: -1, at: null, approached: 0, pump: {}, enc: null, stim: 0, bpc: 0, seen: [], accessing: null, outside: true };
      log({ t: 'accessOut', n: list.length });
      for (const it of list) { if (!g.run) break; yield* accessOne(it.iid, it.from, sid); }
      if (g.run && g.run.seen.length) yield* hold({ k: 'access', sid, seen: clone(g.run.seen) });
      g.run = was;
    }
    /* Show cards to the table (revealed: everyone sees them). */
    function reveal(side, iids, cause) { if (!iids.length) return; g.revealN++; log({ t: 'reveal', side, ks: iids.map(i => card(i).k), cause: cause || null }); }
    const extraClicks = iid => dat(iid).extraClicks || (/\bTriple\b/.test(dat(iid).kw || '') ? 2 : 0) || (/\bDouble\b/.test(dat(iid).kw || '') && !mod('noDouble', false, { iid }) ? 1 : 0);
    /* A Corp card back into HQ from play: what it hosts goes. */
    /* A card leaves play: what it hosts goes to the bin. */
    function dropHosted(iid) {
      for (const h of R.rig.filter(i => card(i).host === iid)) trashRunner(h, 'host');
      for (const h of C.hosted.filter(i => card(i).host === iid)) toArchives(h, card(h).rez || dat(h).type === 'operation');
    }
    function toHQ(iid) {
      dropHosted(iid);
      lift(iid); wipe(card(iid)); card(iid).up = false; C.hq.push(iid);
    }
    /* What waited for a moment when questions may be asked. */
    function* settlePending() {
      for (let guard = 0; guard < 20 && g.pending.length; guard++) { const p = g.pending.shift(); yield* call(p.f, p.iid, {}); }
      for (let guard = 0; guard < 10 && (g.forfeitMark || 0) < g.log.length; guard++) {
        const from = g.forfeitMark || 0;
        g.forfeitMark = g.log.length;
        for (const e of g.log.slice(from)) if (e.t === 'forfeit' && e.side === 'corp') yield* emit('corpForfeited', { k: e.k });
      }
      if (g.drawQ && g.drawQ.length) { const iids = g.drawQ.filter(i => C.hq.indexOf(i) >= 0); g.drawQ = []; if (iids.length) yield* emit('corpDrewMore', { iids }); }
      /* Memory that shrank on its own (Ekomind): the Runner trashes programs until they fit. */
      for (let guard = 0; guard < 10 && muUsed() > muTotal(); guard++) {
        const mine = programs().filter(x => muOf(x) > 0);
        if (!mine.length) break;
        const t = yield* pick('runner', 'makeRoom', 'Too little memory (' + muUsed() + '/' + muTotal() + '): trash a program', mine.map(x => cardOpt(x, null, muOf(x) + ' memory')), { always: true, pub: 'The Runner makes room' });
        if (t) trashRunner(t, 'memory'); else break;
      }
    }
    function* purge() {
      let n = 0;
      const keep = R.rig.filter(i => card(i).virus > 0 && card(i).host && card(card(i).host) && card(card(i).host).k === 'progenitor');
      for (const i of R.rig) { n += card(i).virus; card(i).virus = 0; }
      for (const i of keep) { card(i).virus = 1; n--; log({ t: 'prevent', side: 'runner', k: 'progenitor', n: 1 }); }
      log({ t: 'purge', n });
      for (const a of C.score) for (const e of card(a).x.graffiti || []) { lift(e); card(e).up = true; R.heap.push(e); log({ t: 'note', side: 'corp', text: 'Political Graffiti is purged from ' + nameOf(a) }); }
      for (const a of C.score) card(a).x.graffiti = [];
      yield* emit('purge', { n });
      for (const i of R.rig.filter(i => SC(i) && SC(i).purgeTrash)) trashRunner(i, 'purge');
    }
    /* The Corp loses credits (not spends): Ixodidae watches. */
    function* corpLoses(n, cause) { const k = Math.min(n, C.credits); if (!k) return 0; C.credits -= k; log({ t: 'lose', side: 'corp', n: k, cause: cause || null }); yield* emit('corpLost', { n: k }); return k; }
    /* A current stays in play until another current is played (or an agenda
       is stolen: the Corp's; scored: the Runner's). */
    function setCurrent(iid) {
      endCurrents('corp', iid); endCurrents('runner', iid);
      lift(iid); card(iid).up = true; sideOf(card(iid).side).cur.push(iid);
      refill(iid);
    }
    function endCurrents(side, except) {
      for (const i of sideOf(side).cur.slice()) {
        if (i === except) continue;
        lift(i); card(i).up = true;
        if (side === 'corp') C.arch.push(i); else R.heap.push(i);
        log({ t: 'currentGone', k: card(i).k });
      }
    }
    function spendAgenda(iid, n) {
      n = n || 1;
      card(iid).agenda = Math.max(0, card(iid).agenda - n);
      for (const ci of corpActives()) { const sc = SC(ci); if (sc && sc.sync && sc.sync.agendaSpent) sc.sync.agendaSpent(X, ci, { iid, n }); }
    }
    function derez(iid, why) {
      const c = card(iid); if (!c.rez) return; c.rez = false; c.chimera = null; log({ t: 'derez', k: c.k, why: why || null });
      if (why && CARD[why] && CARD[why].side === 'runner') for (const ri of runnerActives()) { const sc = SC(ri); if (sc && sc.sync && sc.sync.derezzed) sc.sync.derezzed(X, ri, { iid }); }
    }
    /* Host a Corp card on another Corp card (Awakening Center's ice, a condition). */
    function hostCorp(iid, host) { lift(iid); card(iid).host = host; C.hosted.push(iid); }
    const hostedCorp = host => C.hosted.filter(i => card(i).host === host);
    /* The helpers a script may use. */
    const X = {
      g, C, R, D, CARD, card, dat, nameOf, log, gain, pay, avail, plural, rand,
      pick, yesNo, hold, psi, damage, giveTags, trace, expose, trashProgram, saveWithConstruct,
      drawCorp, drawRunner, toArchives, trashRunner, lift, wipe, shuffleRD, shuffleStack,
      server, serverOf, isRemote, remotes, installedCorp, isInstalled, rigOf, programs, breakers, hostedOn, rezzed, rigCards, has,
      link, muTotal, muUsed, muOf, points, iceStr, breakerStr, rezCost, advNeed, canAdvance, typesOf, subsOf, trashCostOf, installCost, installBad, playCost,
      corpInstall, runnerInstall, corpTargets, doRez, rezFlow, rezTriggers, derez, hostCorp, hostedCorp, advTargets, addVirus,
      run, runBad, runSub, endRun: (how, by) => endRun(how, by), access, accessOne, steal, scoreAgenda, cardOpt, srvName, dedupe, emit, mod, call,
      winCheck, finish, sideOf, tagged, onceUsed, markOnce, winAt, settlePending, corpActives, runnerActives, stillActive, fireSub, subText, encMenu,
      playOp, playEvent, discardDown, corpHandMax, runHandMax, encounter, breaking,
      takeBP, loseBP, corpTrashes, accessOutside, reveal, extraClicks, toHQ, dropHosted,
      purge, corpLoses, setCurrent, endCurrents, linger, whenScored, idK, blankId, runExtra, advOf, virusOf, spendVirus, spendAgenda, heapLocked, faceUpRig,
      bpNow, corpPlaced, rezBlock, blanked, activeIids,
      /* A question from a card (the house finds the card's own hints by it). */
      ask: (iid, side, what, why, options, o) => pick(side, what, why, options, Object.assign({ src: card(iid).k }, o || {})),
      yn: (iid, side, what, why, yesLab, noLab, o) => yesNo(side, what, why, yesLab, noLab, Object.assign({ src: card(iid).k }, o || {}))
    };
    g.X = { iceStr, breakerStr, rezCost, advNeed, link, muTotal, muUsed, points, avail, server, serverOf, installedCorp, corpTargets, encMenu, turnMenu, breakPlan, subText, typesOf, subsOf, trashCostOf, card, dat, api: X };
  }

  const Engine = { VERSION, LEVELS, create, rngFrom, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.NrEngine = Engine;
})(typeof window !== 'undefined' ? window : this);
