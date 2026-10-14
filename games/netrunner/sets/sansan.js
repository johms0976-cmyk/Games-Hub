'use strict';
/* The SanSan cycle (2015: The Valley, Breaker Bay, Chrome City, The Underway,
 * Old Hollywood, The Universe of Tomorrow — 120 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. Readings decided here:
 *   - Genetics count "the first time each turn" per card; Gene Conditioning
 *     Shoppe lets each fire a second time.
 *   - Jinteki Biotech: the side is chosen before the first turn; three clicks
 *     flip it once, for that side's effect.
 *   - Film Critic's agendas are added to the score area, not stolen: no
 *     "when stolen" abilities fire.
 *   - Cards on Worlds Plaza stand in its server and are accessed with it
 *     (changed with Mumbad’s Full Immersion RecStudio, which carries agendas).
 *   - Paparazzi makes the Runner count as tagged for the Corp's own actions and
 *     for "while tagged" cards.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const kw = (X, i, re) => re.test(X.dat(i).kw || '');
  const iceIn = X => X.installedCorp().filter(i => X.dat(i).type === 'ice');
  const anyRun = (name, o) => ({
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, Object.assign({ card: iid, via: X.card(iid).k }, o || {}));
    }
  });
  /* A genetics card: the first time each turn (twice with Gene Conditioning Shoppe). */
  function genetics(X, iid) {
    const x = X.card(iid).x;
    if (x.genT !== X.g.turnN) { x.genT = X.g.turnN; x.genN = 0; }
    const most = X.rigCards('gene_shoppe').length ? 2 : 1;
    if (x.genN >= most) return false;
    x.genN++;
    return true;
  }
  /* Ice strong while protecting one server. */
  const strongAt = (sid) => ({ self: { iceStr: (X, iid, v) => X.serverOf(iid) && X.serverOf(iid).id === sid ? v + 3 : v } });
  /* A cloud breaker: +1 strength per installed icebreaker; trash it to break up to 3. */
  const cloudBreaker = (type) => ({ cloud: true, str: 0, brk: { type, cost: 0, n: 3 } });
  const cloudOn = { self: { breakerStr: (X, iid, v) => v + X.breakers().length }, onBreak(X, iid) { if (X.isInstalled(iid)) X.trashRunner(iid, 'used'); } };
  /* A card trashed while accessed, kept as points; a card the Corp adds to its score. */
  function toCorpScore(X, iid, pts) { X.lift(iid); X.wipe(X.card(iid)); X.card(iid).rez = true; X.card(iid).up = true; X.C.score.push(iid); X.log({ t: 'score', side: 'corp', k: X.card(iid).k, pts, total: X.points('corp') }); X.winCheck(); }
  function toRunnerArea(X, iid, pts) { X.lift(iid); X.wipe(X.card(iid)); X.card(iid).up = true; X.R.score.push(iid); X.log({ t: 'steal', k: X.card(iid).k, pts, total: X.points('runner') }); X.winCheck(); }
  /* Advance-triggered public agendas. */
  const advTarget = (X) => X.advTargets();

  /* ================================================================ THE VALLEY */
  S('clot', '08001', 'The Corp cannot score an agenda the turn it was installed. Trashed when the Corp purges.', { virus: true });
  on('clot', { mod: { noScore: (X, iid, v, ctx) => v || X.card(ctx.iid).x.installTurn === X.g.turnN }, purgeTrash: true, botPlay: () => 1.4 });
  S('paige_piper', '08002', 'The first time each turn you install a card, you may put every other copy of it from your stack into your heap; shuffle.');
  on('paige_piper', {
    on: {
      *install(X, iid, ctx) {
        if (ctx.side !== 'runner' || X.R.flags.paige) return;
        X.R.flags.paige = true;
        const copies = X.R.stack.filter(i => X.card(i).k === X.card(ctx.iid).k);
        if (!copies.length || !(yield* X.yn(iid, 'runner', 'paige', 'Paige Piper: put the other ' + X.plural(copies.length, 'copy', 'copies') + ' of ' + X.nameOf(ctx.iid) + ' from your stack into your heap?', 'Yes', 'No'))) return;
        for (const t of copies) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); }
        X.shuffleStack();
      }
    },
    bot: { paige: () => 'no' }
  });
  S('adjusted_chrono', '08003', 'Genetics. The first time each turn you lose a click (not by paying for an ability), gain a click.');
  on('adjusted_chrono', { on: { clickLost(X, iid) { if (genetics(X, iid)) { X.R.clicks++; X.log({ t: 'clicks', side: 'runner', n: 1, k: 'adjusted_chrono' }); } } }, botPlay: () => 0.5 });
  S('spike', '08004', 'Cloud: no memory with 2 link. +1 strength for each installed icebreaker. Trash it: break up to three barrier subroutines.', cloudBreaker('barrier'));
  on('spike', cloudOn);
  S('enhanced_vision', '08005', 'Genetics. Your first successful run each turn: the Corp shows a random card from HQ.');
  on('enhanced_vision', { on: { success(X, iid) { if (!X.C.hq.length || !genetics(X, iid)) return; X.reveal('corp', [X.C.hq[Math.floor(X.rand() * X.C.hq.length)]], 'Enhanced Vision'); } }, botPlay: () => 0.6 });
  S('gene_shoppe', '08006', 'Genetics also fire the second time each turn.');
  on('gene_shoppe', { botPlay: () => 0.4 });
  S('synthetic_blood', '08007', 'Genetics. The first time you take damage each turn, draw a card.');
  on('synthetic_blood', { on: { damaged(X, iid) { if (genetics(X, iid)) X.drawRunner(1, 'synthetic_blood'); } }, botPlay: () => 1 });
  S('traffic_jam', '08008', 'Current. An agenda needs one more advancement for each copy of it in the Corp’s score area.');
  on('traffic_jam', { mod: { advNeed: (X, iid, v, ctx) => v + X.C.score.filter(i => X.card(i).k === X.card(ctx.iid).k).length }, botPlay: (pub) => pub.corp.score.length ? 1.2 : -1 });
  S('symm_visage', '08009', 'Genetics. The first time each turn you click to draw a card, gain 1 credit.');
  on('symm_visage', { on: { runnerBasic(X, iid, ctx) { if (ctx.what === 'draw' && genetics(X, iid)) { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'symm_visage' }); } } }, botPlay: () => 0.9 });
  S('brain_taping', '08010', 'Bioroid ice costs 1 less to rez for each click the Runner has left.');
  on('brain_taping', { mod: { rezCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'ice' && kw(X, ctx.iid, /Bioroid/) ? v - X.R.clicks : v } });
  S('next_gold', '08011', 'X is the number of rezzed NEXT ice.', { subs: [{ k: 's', n: 0, text: 'X net damage (X: rezzed NEXT ice)' }, { k: 's', n: 1, text: 'Trash X programs (X: rezzed NEXT ice)' }] });
  const nextX = X => X.installedCorp().filter(i => X.card(i).rez && kw(X, i, /NEXT/)).length;
  on('next_gold', { subs: [function* (X) { yield* X.damage('net', nextX(X), 'NEXT Gold'); return null; }, function* (X) { for (let k = 0; k < nextX(X); k++) yield* X.trashProgram('NEXT Gold'); return null; }] });
  S('jinteki_biotech', '08012', 'Before your first turn, choose The Brewery, The Tank or The Greenhouse. Three clicks, once: flip it — 2 net damage; or Archives shuffled into R&D; or 4 advancement tokens on a card you can advance.');
  on('jinteki_biotech', {
    on: {
      *corpTurnBegin(X, iid) {
        const x = X.card(iid).x;
        if (x.side) return;
        x.side = yield* X.ask(iid, 'corp', 'biotech', 'Jinteki Biotech: which side is it?', [{ id: 'brewery', label: 'The Brewery — 2 net damage when flipped' }, { id: 'tank', label: 'The Tank — Archives into R&D when flipped' }, { id: 'greenhouse', label: 'The Greenhouse — 4 advancement tokens when flipped' }], { always: true });
        X.log({ t: 'note', side: 'corp', text: 'Jinteki Biotech is ' + ({ brewery: 'The Brewery', tank: 'The Tank', greenhouse: 'The Greenhouse' })[x.side] });
      }
    },
    abils: (X, iid) => { const x = X.card(iid).x; return x.side && !x.flipped ? [{ label: 'Jinteki Biotech: flip it', clicks: 3, bad: x.side === 'greenhouse' && !X.advTargets().length ? 'Nothing to advance' : null }] : []; },
    *use(X, iid) {
      const x = X.card(iid).x;
      x.flipped = true;
      if (x.side === 'brewery') { yield* X.damage('net', 2, 'Jinteki Biotech'); return; }
      if (x.side === 'tank') { for (const i of X.C.arch.splice(0)) { X.card(i).up = false; X.C.rd.push(i); } X.shuffleRD(); X.log({ t: 'archToRD', n: 0 }); return; }
      const t = yield* X.ask(iid, 'corp', 'greenhouse', 'The Greenhouse: 4 advancement tokens on which card?', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (t) { X.card(t).adv += 4; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'jinteki_biotech', x: 4 }); }
    },
    show: (X, iid) => X.card(iid).x.side ? ({ brewery: 'The Brewery', tank: 'The Tank', greenhouse: 'The Greenhouse' })[X.card(iid).x.side] + (X.card(iid).x.flipped ? ' (flipped)' : '') : null,
    bot: { biotech: () => 'brewery' },
    botAbil: (pub) => pub.runner.gripN <= 2 ? 6 : -1
  });
  S('genetic_reseq', '08013', 'When scored, you may put an agenda counter on an agenda in your score area.');
  on('genetic_reseq', {
    *onScore(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'reseq', 'Genetic Resequencing: an agenda counter on which agenda?', X.C.score.map(i => X.cardOpt(i)), { skip: 'None' });
      if (t) { X.card(t).agenda++; X.log({ t: 'counters', k: X.card(t).k, n: X.card(t).agenda }); }
    },
    bot: { reseq: (pub, me, pr) => (pr.options.find(o => o.card !== 'genetic_reseq') || pr.options[0]).id }
  });
  S('cortex_lock', '08014', '', { subs: [{ k: 's', n: 0, text: '1 net damage for each memory the Runner has free' }] });
  on('cortex_lock', { subs: [function* (X) { const n = Math.max(0, X.muTotal() - X.muUsed()); if (n) yield* X.damage('net', n, 'Cortex Lock'); return null; }] });
  S('valley_grid', '08015', 'Whenever the Runner breaks every subroutine on an ice protecting this server, their hand size is 1 lower until your next turn. One region per server.');
  on('valley_grid', { on: { fullyBroken(X, iid, ctx) { const sv = X.serverOf(iid); if (!sv || sv.ice.indexOf(ctx.iid) < 0) return; const h = X.R.handCut && X.R.handCut.until > X.g.turnN ? X.R.handCut.n : 0; X.R.handCut = { n: h + 1, until: X.g.turnN + 1 }; } } });
  S('bandwidth', '08016', '', { subs: [{ k: 's', n: 0, text: 'A tag — removed again if this run is successful' }] });
  on('bandwidth', {
    subs: [function* (X) { yield* X.giveTags(1, 'Bandwidth'); X.g.run.bandwidth = (X.g.run.bandwidth || 0) + 1; return null; }],
    on: { success(X, iid, ctx) { const n = Math.min(ctx.S.bandwidth || 0, X.R.tags); if (n) { X.R.tags -= n; ctx.S.bandwidth = 0; X.log({ t: 'untag', n, k: 'bandwidth' }); } } }
  });
  S('predictive', '08017', 'Current. Stealing an agenda costs the Runner 2 more.');
  on('predictive', { mod: { stealCost: (X, iid, v) => v + 2 }, botPlay: () => 1.4 });
  S('capital_investors', '08018', 'A click: gain 2 credits.');
  on('capital_investors', { abils: () => [{ label: 'Capital Investors: gain 2', clicks: 1 }], use(X) { X.gain('corp', 2); X.log({ t: 'gain', side: 'corp', n: 2, k: 'capital_investors' }); }, botAbil: () => 2.4 });
  S('negotiator', '08019', 'The Runner may pay 2 to break one of its subroutines.', { creditBreak: { cost: 2 }, subs: [{ k: 'gain', n: 2 }, { k: 'trashProg' }] });
  S('tech_startup', '08020', 'When your turn begins you may trash it: find an asset in R&D, show it and install it; shuffle.');
  on('tech_startup', {
    on: {
      *corpTurnBegin(X, iid) {
        if (!X.C.rd.some(i => X.dat(i).type === 'asset') || !(yield* X.yn(iid, 'corp', 'techStart', 'Tech Startup: trash it to find and install an asset?', 'Do it', 'No'))) return;
        X.toArchives(iid, true);
        X.g.revealN++;
        const t = yield* X.ask(iid, 'corp', 'techAsset', 'Tech Startup: install which asset?', X.dedupe(X.C.rd.filter(i => X.dat(i).type === 'asset').map(i => X.cardOpt(i))));
        if (t) { X.reveal('corp', [t], 'Tech Startup'); yield* X.corpInstall(t, {}); }
        X.shuffleRD();
      }
    },
    bot: { techStart: () => 'yes' }
  });

  /* ================================================================ BREAKER BAY */
  S('hacktivist', '08021', 'Current. The Corp must trash a random card from HQ to rez anything but ice.');
  on('hacktivist', { mod: { rezTax: () => true }, botPlay: () => 1.2 });
  S('off_campus', '08022', 'Carries any number of connections. Whenever you install a connection on it, draw a card.');
  on('off_campus', {
    hostFor: (X, h, p) => kw(X, p, /Connection/),
    on: { install(X, iid, ctx) { if (ctx.side === 'runner' && X.card(ctx.iid).host === iid) X.drawRunner(1, 'off_campus'); } },
    botPlay: () => 1
  });
  S('career_fair', '08023', 'Install a resource from your grip for 3 less.');
  on('career_fair', {
    playBad: (X) => X.R.grip.some(i => X.dat(i).type === 'resource') ? null : 'No resource in your grip',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'careerFair', 'Career Fair: install which resource (3 less)?', X.R.grip.filter(i => X.dat(i).type === 'resource').map(i => X.cardOpt(i, null, X.installCost(i, 3) + ' credits', X.installBad(i) || (X.avail('runner', 'any') < X.installCost(i, 3) ? 'Costs ' + X.installCost(i, 3) : null))));
      if (t) yield* X.runnerInstall(t, { discount: 3 });
    },
    botPlay: () => 1.2
  });
  S('dorm_computer', '08024', 'Comes with 4 power counters. A click and a counter: run any server; tags you would take in that run are prevented.');
  on('dorm_computer', {
    onInstall(X, iid) { X.card(iid).power = 4; },
    abils: (X, iid) => [{ label: 'Dorm Computer: run any server, safe from tags', clicks: 1, bad: X.card(iid).power ? null : 'No counters left' }],
    *use(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Dorm Computer: run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })));
      if (!sid) return;
      X.card(iid).power--;
      yield* X.run(sid, { via: 'dorm_computer', dorm: true });
    },
    avoidTag(X, iid, ctx) { return X.g.run && X.g.run.o.dorm ? ctx.n : 0; },
    botAbil: () => 0.8
  });
  S('hayley', '08025', 'The first time you install a card each turn, you may install another card of the same type from your grip (paying for it).');
  on('hayley', {
    on: {
      *install(X, iid, ctx) {
        if (ctx.side !== 'runner' || X.R.flags.hayley) return;
        X.R.flags.hayley = true;
        const type = X.dat(ctx.iid).type;
        const pool = X.R.grip.filter(i => X.dat(i).type === type);
        if (!pool.length) return;
        const t = yield* X.ask(iid, 'runner', 'hayley', 'Hayley Kaplan: install another ' + type + ' (paying for it)?', pool.map(i => X.cardOpt(i, null, X.installCost(i, 0) + ' credits', X.installBad(i) || (X.avail('runner', type === 'program' ? 'program' : 'any') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null))), { skip: 'No' });
        if (t) yield* X.runnerInstall(t, {});
      }
    },
    bot: { hayley: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' }
  });
  S('game_day', '08026', 'Double. Draw until your grip is as big as your maximum hand size.');
  on('game_day', { play(X) { const n = X.runHandMax() - X.R.grip.length; if (n > 0) X.drawRunner(n, 'game_day'); }, botPlay: (pub, me) => pub.runner.handMax - (me.hand || []).length >= 3 ? 2.6 : -1 });
  S('comet', '08027', '+1 memory. The first event you play each turn, you may play another event after it without a click. One console only.', { console: true, memory: 1 });
  on('comet', {
    on: {
      *play(X, iid, ctx) {
        if (ctx.side !== 'runner' || X.R.flags.comet) return;
        X.R.flags.comet = true;
        X.card(iid).x.armed = X.g.turnN;
      },
      *runnerAction(X, iid) {
        if (X.card(iid).x.armed !== X.g.turnN) return;
        X.card(iid).x.armed = null;
        const evs = X.R.grip.filter(i => X.dat(i).type === 'event' && X.avail('runner', 'event') >= X.playCost(i) && !(D.SCRIPT[X.card(i).k] && D.SCRIPT[X.card(i).k].playBad && D.SCRIPT[X.card(i).k].playBad(X, i)));
        if (!evs.length) return;
        const t = yield* X.ask(iid, 'runner', 'comet', 'Comet: play another event without a click?', evs.map(i => X.cardOpt(i)), { skip: 'No' });
        if (t) yield* X.playEvent(t);
      }
    },
    bot: { comet: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' }
  });
  S('study_guide', '08028', '+1 strength for each power counter on it. 1 credit: break one code gate subroutine. 2 credits: a power counter.', { str: 0, brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 2, by: 1, perm: true } });
  on('study_guide', { self: { breakerStr: (X, iid, v) => v + X.card(iid).power } });
  S('london_library', '08029', 'A click: install a non-virus program from your grip on it, free. A click: take a program on it back into your grip. Programs on it are trashed when your turn ends.');
  on('london_library', {
    abils: (X, iid) => [{ label: 'London Library: install a program on it, free', clicks: 1, bad: X.R.grip.some(i => X.dat(i).type === 'program' && !X.dat(i).virus) ? null : 'No non-virus program in your grip' }, { label: 'London Library: take a program back', clicks: 1, bad: X.hostedOn(iid).length ? null : 'Nothing on it' }],
    *use(X, iid, n) {
      if (n === 0) {
        const t = yield* X.ask(iid, 'runner', 'library', 'London Library: install which program on it?', X.R.grip.filter(i => X.dat(i).type === 'program' && !X.dat(i).virus).map(i => X.cardOpt(i)));
        if (t) yield* X.runnerInstall(t, { free: true, host: iid });
        return;
      }
      const t = yield* X.ask(iid, 'runner', 'libraryBack', 'London Library: take which program back?', X.hostedOn(iid).map(i => X.cardOpt(i)));
      if (t) { X.lift(t); X.wipe(X.card(t)); X.R.grip.push(t); }
    },
    on: { runnerTurnEnd(X, iid) { for (const h of X.hostedOn(iid)) X.trashRunner(h, 'london_library'); } },
    botAbil: () => -1, botPlay: () => 0.4
  });
  S('tyson', '08030', 'Two clicks: find a hardware in your stack, show it, take it; shuffle.');
  on('tyson', {
    abils: (X) => [{ label: 'Tyson Observatory: find a hardware', clicks: 2, bad: X.R.stack.some(i => X.dat(i).type === 'hardware') ? null : 'No hardware in your stack' }],
    *use(X, iid) {
      X.g.revealN++;
      const t = yield* X.ask(iid, 'runner', 'tyson', 'Tyson Observatory: take which hardware?', X.dedupe(X.R.stack.filter(i => X.dat(i).type === 'hardware').map(i => X.cardOpt(i))));
      if (t) { X.lift(t); X.R.grip.push(t); X.reveal('runner', [t], 'Tyson Observatory'); }
      X.shuffleStack();
    },
    botAbil: () => 0.5
  });
  S('beach_party', '08031', 'When your turn begins, lose a click. Your maximum hand size is 5 higher.', { handPlus: 5 });
  on('beach_party', { on: { runnerTurnBegin(X) { X.R.clicks = Math.max(0, X.R.clicks - 1); X.log({ t: 'loseClick', k: 'beach_party' }); } }, botPlay: () => -1 });
  S('research_grant', '08032', 'When scored, you may score another installed Research Grant.');
  on('research_grant', {
    *onScore(X, iid) {
      const t = X.installedCorp().find(i => X.card(i).k === 'research_grant');
      if (t && (yield* X.yn(iid, 'corp', 'grant', 'Research Grant: score the other installed Research Grant too?', 'Score it', 'No'))) yield* X.scoreAgenda(t);
    },
    bot: { grant: () => 'yes' }
  });
  S('turing', '08033', '+3 strength while protecting a remote server. AI programs cannot break it.', { subs: [{ k: 's', n: 0, text: 'End the run unless the Runner spends three clicks' }] });
  on('turing', {
    self: { iceStr: (X, iid, v) => X.serverOf(iid) && X.isRemote(X.serverOf(iid).id) ? v + 3 : v },
    blocks: (X, iid, b) => kw(X, b, /\bAI\b/),
    subs: [function* (X, iid) { if (X.R.clicks >= 3 && (yield* X.yn(iid, 'runner', 'turing', 'Turing: spend three clicks, or the run ends?', 'Spend three clicks', 'Let the run end'))) { X.R.clicks -= 3; return null; } return 'end'; }],
    bot: { turing: () => 'no' }
  });
  S('crick', '08034', '+3 strength while protecting Archives.', { subs: [{ k: 's', n: 0, text: 'The Corp installs a card from Archives (paying for it)' }] });
  on('crick', Object.assign(strongAt('arch'), {
    subs: [function* (X, iid) {
      const pool = X.C.arch.filter(i => X.dat(i).type !== 'operation');
      const t = yield* X.ask(iid, 'corp', 'crick', 'Crick: install which card from Archives?', pool.map(i => X.cardOpt(i)), { skip: 'None' });
      if (t) yield* X.corpInstall(t, {});
      return null;
    }],
    bot: { crick: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || {}).id || 'skip' }
  }));
  S('recruiting_trip', '08035', 'Pay X: find up to X different sysops in R&D, show them, take them; shuffle.', { cost: 0 });
  on('recruiting_trip', {
    playBad: (X) => X.C.rd.some(i => kw(X, i, /Sysop/)) ? null : 'No sysop in R&D',
    *play(X, iid) {
      const kinds = X.dedupe(X.C.rd.filter(i => kw(X, i, /Sysop/)).map(i => X.cardOpt(i)));
      const most = Math.min(kinds.length, X.C.credits);
      if (!most) return;
      X.g.revealN++;
      const ts = yield* X.ask(iid, 'corp', 'recruit', 'Recruiting Trip: take which sysops (1 credit each)?', kinds, { multi: true, min: 0, max: most });
      X.pay('corp', ts.length, 'any');
      for (const t of ts) { X.lift(t); X.C.hq.push(t); }
      X.reveal('corp', ts, 'Recruiting Trip');
      X.shuffleRD();
    },
    botPlay: () => 0.6
  });
  S('blacklist', '08036', 'No card can leave the Runner’s heap.');
  on('blacklist', { mod: { heapLocked: () => true } });
  S('gutenberg', '08037', '+3 strength while protecting R&D.', { subs: [{ k: 'trace', n: 7, then: 'tag' }] });
  on('gutenberg', strongAt('rd'));
  S('student_loans', '08038', 'An event the Runner plays costs 2 more if a copy of it is in their heap.');
  on('student_loans', { mod: { playCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'event' && X.R.heap.some(i => i !== ctx.iid && X.card(i).k === X.card(ctx.iid).k) ? v + 2 : v } });
  S('meru_mati', '08039', '+3 strength while protecting HQ.', { subs: [{ k: 'etr' }] });
  on('meru_mati', strongAt('hq'));
  S('breaker_bay', '08040', 'Cards in this server’s root cost 5 less to rez. One region per server.');
  on('breaker_bay', { mod: { rezCost: (X, iid, v, ctx) => X.serverOf(iid) && X.serverOf(iid).root.indexOf(ctx.iid) >= 0 ? v - 5 : v } });

  /* ================================================================ CHROME CITY */
  S('immolation', '08041', 'Run Archives. If successful, once this run, instead of accessing a face-up ice there you may trash a rezzed copy of it.');
  on('immolation', {
    playBad: (X) => X.runBad('arch', 1),
    *play(X, iid) { yield* X.run('arch', { card: iid, via: 'immolation' }); },
  });
  D.script('immolation', {
    *success(X, iid, ctx) {
      const up = X.C.arch.filter(i => X.card(i).up && X.dat(i).type === 'ice' && iceIn(X).some(j => X.card(j).rez && X.card(j).k === X.card(i).k && X.card(j).k !== 'architect'));
      if (!up.length) return null;
      const which = yield* X.ask(iid, 'runner', 'immolate', 'Immolation Script: trash a rezzed copy of which ice from Archives?', X.dedupe(up.map(i => X.cardOpt(i))), { skip: 'No' });
      if (!which) return null;
      const t = yield* X.ask(iid, 'runner', 'immolateT', 'Which rezzed ' + X.nameOf(which) + '?', iceIn(X).filter(j => X.card(j).rez && X.card(j).k === X.card(which).k).map(j => X.cardOpt(j, null, X.srvName(X.serverOf(j)))));
      if (t) { X.log({ t: 'trash', side: 'corp', k: X.card(t).k, price: 0, by: 'immolation' }); X.toArchives(t, true); }
      return null;
    },
    bot: { immolate: (pub, me, pr) => pr.options[0].id },
    botPlay: () => 0.6
  });
  S('skulljack', '08042', 'When installed, you take 1 brain damage. Every Corp card costs 1 less to trash.');
  on('skulljack', { *onInstall(X) { yield* X.damage('brain', 1, 'Skulljack'); }, mod: { trashCost: (X, iid, v) => v - 1 }, botPlay: () => 0.6 });
  S('turntable', '08043', '+1 memory. Whenever you steal an agenda, you may swap it for one in the Corp’s score area. One console only.', { console: true, memory: 1 });
  on('turntable', {
    on: {
      *steal(X, iid, ctx) {
        if (!X.C.score.length || X.R.score.indexOf(ctx.iid) < 0) return;
        const t = yield* X.ask(iid, 'runner', 'turntable', 'Turntable: swap ' + X.nameOf(ctx.iid) + ' for which of the Corp’s agendas?', X.C.score.map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { skip: 'Keep it' });
        if (!t) return;
        X.lift(ctx.iid); X.lift(t); X.C.score.push(ctx.iid); X.R.score.push(t);
        X.log({ t: 'note', side: 'runner', text: 'Turntable: ' + X.nameOf(ctx.iid) + ' for ' + X.nameOf(t) });
        X.winCheck();
      }
    },
    bot: { turntable: (pub, me, pr) => { const best = pr.options.slice().sort((a, b) => D.CARDS[b.card].pts - D.CARDS[a.card].pts)[0]; return best && D.CARDS[best.card].pts > +((pr.why.match(/swap (.+) for/) || [])[1] ? 0 : 0) ? best.id : 'skip'; } },
    botPlay: () => 1
  });
  S('chrome_parlor', '08044', 'Damage from installing cybernetic hardware is prevented.');
  on('chrome_parlor', { prevent(X, iid, ctx) { return ['Skulljack', 'Titanium Ribs', 'Net-Ready Eyes', 'Brain Cage'].indexOf(ctx.cause) >= 0 ? ctx.n : 0; }, botPlay: () => 0.4 });
  S('titanium_ribs', '08045', 'When installed, you take 2 meat damage. You choose the cards that damage takes from your grip.');
  on('titanium_ribs', { *onInstall(X) { yield* X.damage('meat', 2, 'Titanium Ribs'); }, mod: { damagePicker: (X, iid, v) => v || 'runner' }, botPlay: () => -1 });
  S('crowbar', '08046', 'Cloud: no memory with 2 link. +1 strength for each installed icebreaker. Trash it: break up to three code gate subroutines.', cloudBreaker('code gate'));
  on('crowbar', cloudOn);
  S('net_ready_eyes', '08047', 'When installed, you take 2 meat damage. Whenever you start a run, an icebreaker of your choice has +1 strength for that run.');
  on('net_ready_eyes', {
    *onInstall(X) { yield* X.damage('meat', 2, 'Net-Ready Eyes'); },
    on: {
      *runBegin(X, iid, ctx) {
        if (!X.breakers().length) return;
        const t = yield* X.ask(iid, 'runner', 'eyes', 'Net-Ready Eyes: which icebreaker gets +1 strength this run?', X.breakers().map(i => X.cardOpt(i)), { always: true });
        if (t) ctx.S.pump[t] = (ctx.S.pump[t] || 0) + 1;
      }
    },
    bot: { eyes: (pub, me, pr) => pr.options[0].id },
    botPlay: () => -1
  });
  S('analog_dreamers', '08048', 'A click: run R&D. If successful, instead of accessing you may shuffle an unrezzed, unadvanced card that is not ice into R&D.');
  on('analog_dreamers', {
    abils: (X) => [{ label: 'Analog Dreamers: run R&D', clicks: 1, bad: X.runBad('rd', 0) }],
    *use(X, iid) { yield* X.run('rd', { card: iid, via: 'analog_dreamers' }); },
    *success(X, iid) {
      const ts = X.installedCorp().filter(i => !X.card(i).rez && !X.card(i).adv && X.dat(i).type !== 'ice');
      if (!ts.length) return null;
      const t = yield* X.ask(iid, 'runner', 'dreamers', 'Analog Dreamers: shuffle which card into R&D instead of accessing?', ts.map(i => ({ id: i, label: 'A face-down card · ' + X.srvName(X.serverOf(i)) })), { skip: 'Access R&D' });
      if (!t) return null;
      X.dropHosted(t); X.lift(t); X.wipe(X.card(t)); X.C.rd.push(t); X.shuffleRD();
      X.log({ t: 'note', side: 'runner', text: 'Analog Dreamers shuffles a card into R&D' });
      return 'replace';
    },
    bot: { dreamers: () => 'skip' },
    botAbil: () => 1.6
  });
  S('brain_cage', '08049', '+3 maximum hand size. When installed, you take 1 brain damage.', { handPlus: 3 });
  on('brain_cage', { *onInstall(X) { yield* X.damage('brain', 1, 'Brain Cage'); }, botPlay: () => -1 });
  S('cybernetics_div', '08050', 'Each player’s maximum hand size is 1 lower.');
  on('cybernetics_div', { mod: { corpHand: (X, iid, v) => v - 1, runHand: (X, iid, v) => v - 1 } });
  S('self_destruct_chips', '08051', 'The Runner’s maximum hand size is 1 lower.');
  on('self_destruct_chips', { mod: { runHand: (X, iid, v) => v - 1 } });
  S('lab_dog', '08052', '', { subs: [{ k: 's', n: 0, text: 'The Runner trashes an installed hardware; Lab Dog is trashed' }] });
  on('lab_dog', {
    subs: [function* (X, iid) {
      const hw = X.rigOf('hardware');
      if (hw.length) { const t = yield* X.ask(iid, 'runner', 'labDog', 'Lab Dog: trash one of your hardware', hw.map(i => X.cardOpt(i)), { always: true }); if (t) X.trashRunner(t, 'Lab Dog'); }
      if (X.isInstalled(iid)) X.toArchives(iid, true);
      return 'gone';
    }]
  });
  S('oaktown_grid', '08053', 'Cards in this server’s root cost 3 more to trash. One region per server.');
  on('oaktown_grid', { mod: { trashCost: (X, iid, v, ctx) => X.serverOf(iid) && X.serverOf(iid).root.indexOf(ctx.iid) >= 0 ? v + 3 : v } });
  S('ryon_knight', '08054', 'Trash it during a run on this server while the Runner has no clicks left: 1 brain damage.');
  on('ryon_knight', {
    winOpts: (X, iid) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id && !X.R.clicks ? [{ label: 'Ryon Knight: trash it — 1 brain damage' }] : [],
    *winUse(X, iid) { X.toArchives(iid, true); yield* X.damage('brain', 1, 'Ryon Knight'); },
    botWin: () => true
  });
  S('clairvoyant', '08055', '', { subs: [{ k: 's', n: 0, text: 'A psi game: if the bids differ, an advancement token on an installed card and the run ends' }] });
  on('clairvoyant', {
    subs: [function* (X, iid) {
      if (!(yield* X.psi('Clairvoyant Monitor'))) return null;
      const t = yield* X.ask(iid, 'corp', 'clairvoyant', 'Clairvoyant Monitor: an advancement token on which installed card?', X.installedCorp().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { skip: 'None' });
      if (t) { X.card(t).adv++; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'clairvoyant' }); }
      return 'end';
    }],
    bot: { clairvoyant: (pub, me, pr) => (pr.options.find(o => me.mine && D.CARDS[me.mine[o.id]] && D.CARDS[me.mine[o.id]].type === 'agenda') || pr.options[0]).id }
  });
  S('lockdown', '08056', '', { subs: [{ k: 's', n: 0, text: 'The Runner cannot draw cards for the rest of the turn' }] });
  on('lockdown', { subs: [function (X) { X.R.noDrawTurn = X.g.turnN; X.log({ t: 'note', side: 'corp', text: 'Lockdown: no drawing for the rest of the turn' }); return null; }] });
  S('little_engine', '08057', '', { subs: [{ k: 'etr' }, { k: 'etr' }, { k: 's', n: 0, text: 'The Runner gains 5 credits' }] });
  on('little_engine', { subs: [function (X) { X.gain('runner', 5); X.log({ t: 'gain', side: 'runner', n: 5, k: 'little_engine' }); return null; }] });
  S('oaktown_reno', '08058', 'Installed face up. Whenever you advance it, gain 2 credits — 3 once it has 5 or more tokens.', { public: true });
  on('oaktown_reno', {
    hand: {},
    on: {},
    sync: {}
  });
  /* the public agendas react from wherever they are installed: a watcher on the Corp's identity side */
  const publicAdv = { oaktown_reno: (X, t) => { const n = X.card(t).adv >= 5 ? 3 : 2; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'oaktown_reno' }); } };
  S('corporate_town', '08059', 'To rez it, forfeit an agenda. When your turn begins, you may trash an installed resource (it cannot be prevented).', { rezForfeit: true });
  on('corporate_town', {
    on: {
      *corpTurnBegin(X, iid) {
        const res = X.rigOf('resource');
        if (!res.length) return;
        const t = yield* X.ask(iid, 'corp', 'corpTown', 'Corporate Town: trash a resource?', res.map(i => X.cardOpt(i)), { skip: 'No' });
        if (t) yield* X.corpTrashes(t, 'Corporate Town', { unprev: true });
      }
    },
    bot: { corpTown: (pub, me, pr) => pr.options[0].id }
  });
  S('quicksand', '08060', 'Each time the Runner meets it, a power counter on it: +1 strength each.', { subs: [{ k: 'etr' }] });
  on('quicksand', { onEnc(X, iid) { X.card(iid).power++; return null; }, self: { iceStr: (X, iid, v) => v + X.card(iid).power } });

  /* ================================================================ THE UNDERWAY */
  S('faust', '08061', 'Trash a card from your grip: break one subroutine. Trash a card from your grip: +2 strength.', { brk: { type: 'any', cost: 0, n: 1, grip: true }, pump: { cost: 0, by: 2, grip: true } });
  S('street_peddler', '08062', 'When installed, the top 3 cards of your stack go face down on it (you may look at them). Trash it: install one of them for 1 less.');
  on('street_peddler', {
    onInstall(X, iid) { for (const t of X.R.stack.splice(0, 3)) { X.card(t).host = iid; X.card(t).x.facedown = true; X.R.ws.push(t); } },
    abils: (X, iid) => [{ label: 'Street Peddler: trash it — install a card from it, 1 less', bad: X.R.ws.some(i => X.card(i).host === iid && X.dat(i).type !== 'event') ? null : 'Nothing installable on it' }],
    *use(X, iid) {
      const pool = X.R.ws.filter(i => X.card(i).host === iid && X.dat(i).type !== 'event');
      const t = yield* X.ask(iid, 'runner', 'peddler', 'Street Peddler: install which card (1 less)?', pool.map(i => X.cardOpt(i, null, X.installCost(i, 1) + ' credits', X.installBad(i) || (X.avail('runner', 'any') < X.installCost(i, 1) ? 'Costs ' + X.installCost(i, 1) : null))), { skip: 'None' });
      if (t) { X.lift(t); X.card(t).x.facedown = false; X.card(t).host = null; X.R.grip.push(t); }
      X.trashRunner(iid, 'used');
      if (t) yield* X.runnerInstall(t, { discount: 1 });
    },
    botAbil: () => 1, botPlay: () => 1.2
  });
  S('geist', '08063', 'Whenever you use a “trash this” ability, draw a card.');
  on('geist', { sync: { trashAbility(X) { X.drawRunner(1, 'geist'); } } });
  S('drive_by', '08064', 'Double. Expose a card in a remote server’s root: if it is an asset or upgrade, trash it.');
  on('drive_by', {
    playBad: (X) => X.remotes().some(sv => sv.root.some(i => !X.card(i).rez)) ? null : 'Nothing face down in a remote',
    *play(X, iid) {
      const ts = [].concat(...X.remotes().map(sv => sv.root.filter(i => !X.card(i).rez)));
      const t = yield* X.ask(iid, 'runner', 'driveBy', 'Drive By: expose which card?', ts.map(i => ({ id: i, label: 'A face-down card · ' + X.srvName(X.serverOf(i)) })));
      if (!t) return;
      yield* X.expose(t, 'Drive By');
      const ex = X.g.log[X.g.log.length - 1];
      if (X.isInstalled(t) && ['asset', 'upgrade'].indexOf(X.dat(t).type) >= 0 && X.g.log.some(e => e.t === 'expose' && e.iid === t)) { X.log({ t: 'trash', side: 'corp', k: X.card(t).k, price: 0, by: 'drive_by' }); X.toArchives(t, true); }
      void ex;
    },
    botPlay: () => 1
  });
  S('forger', '08065', '+1 link. Trash it: avoid a tag. Trash it: remove a tag. One console only.', { console: true, link: 1 });
  on('forger', {
    *avoidTag(X, iid) { if (yield* X.yn(iid, 'runner', 'forger', 'Forger: trash it to avoid a tag?', 'Trash it', 'Keep it')) { X.trashRunner(iid, 'used'); return 1; } return 0; },
    abils: (X) => [{ label: 'Forger: trash it — remove a tag', bad: X.R.tags ? null : 'You have no tags' }],
    use(X, iid) { X.trashRunner(iid, 'used'); X.R.tags--; X.log({ t: 'untag', n: 1, k: 'forger' }); },
    bot: { forger: () => 'no' },
    botAbil: () => -1
  });
  S('shiv', '08066', 'Cloud: no memory with 2 link. +1 strength for each installed icebreaker. Trash it: break up to three sentry subroutines.', cloudBreaker('sentry'));
  on('shiv', cloudOn);
  S('gang_sign', '08067', 'Whenever the Corp scores an agenda, access HQ (not its root).');
  on('gang_sign', {
    on: {
      *score(X) {
        if (!X.C.hq.length) return;
        const n = Math.min(X.C.hq.length, X.mod('accessHQ', 1 + X.rigCards('hq_interface').length, {}));
        const pool = X.C.hq.slice(), list = [];
        for (let k = 0; k < n && pool.length; k++) list.push({ iid: pool.splice(Math.floor(X.rand() * pool.length), 1)[0], from: 'hq' });
        yield* X.accessOutside(list, 'hq');
      }
    },
    botPlay: () => 1
  });
  S('muertos', '08068', 'When installed, the Corp must derez a card. When it leaves play, the Corp may rez a card free. Trash it: draw a card.');
  on('muertos', {
    *onInstall(X, iid) {
      const ts = X.installedCorp().filter(i => X.card(i).rez);
      if (!ts.length) return;
      const t = yield* X.ask(iid, 'corp', 'muertos', 'Muertos Gang Member: derez which card?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (t) X.derez(t, 'muertos');
    },
    *whenTrashed(X, iid) {
      const ts = X.installedCorp().filter(i => !X.card(i).rez && X.dat(i).type !== 'agenda');
      if (!ts.length) return;
      const t = yield* X.ask(iid, 'corp', 'muertosRez', 'Muertos Gang Member is gone: rez a card free?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { skip: 'No' });
      if (t) { X.doRez(t, true); yield* X.rezTriggers(t); }
    },
    abils: () => [{ label: 'Muertos Gang Member: trash it — draw a card' }],
    use(X, iid) { X.trashRunner(iid, 'used'); X.drawRunner(1, 'muertos'); },
    bot: { muertos: (pub, me, pr) => pr.options.slice().sort((a, b) => (D.CARDS[a.card].cost || 0) - (D.CARDS[b.card].cost || 0))[0].id, muertosRez: (pub, me, pr) => pr.options[0].id },
    botAbil: () => -1, botPlay: () => 1
  });
  S('chameleon', '08069', 'When installed, choose barrier, code gate or sentry. It returns to your grip after your discard step. 1 credit: break one subroutine on ice of that type.', { brk: { type: 'any', cost: 1, n: 1 } });
  on('chameleon', {
    *onInstall(X, iid) { X.card(iid).x.type = yield* X.ask(iid, 'runner', 'chameleon', 'Chameleon: which type does it break?', ['barrier', 'code gate', 'sentry'].map(x => ({ id: x, label: x })), { always: true }); },
    canBreak: (X, iid, E) => X.typesOf(E.iid).indexOf(X.card(iid).x.type) >= 0,
    on: { runnerTurnEnd(X, iid) { if (!X.isInstalled(iid)) return; for (const h of X.hostedOn(iid)) X.trashRunner(h, 'host'); X.lift(iid); X.wipe(X.card(iid)); X.R.grip.push(iid); } },
    show: (X, iid) => X.card(iid).x.type ? 'breaks ' + X.card(iid).x.type : null,
    bot: { chameleon: (pub) => { const k = {}; for (const r of pub.runner.rig) { const b = D.CARDS[r.k].brk; if (b) k[b.type] = 1; } return ['barrier', 'code gate', 'sentry'].find(t => !k[t]) || 'sentry'; } }
  });
  S('hyperdriver', '08070', 'When your turn begins, you may remove it from the game: gain three clicks.');
  on('hyperdriver', { on: { *runnerTurnBegin(X, iid) { if (yield* X.yn(iid, 'runner', 'hyper', 'Hyperdriver: remove it from the game for three more clicks?', 'Do it', 'Not yet')) { X.lift(iid); X.R.gone.push(iid); X.R.clicks += 3; X.log({ t: 'clicks', side: 'runner', n: 3, k: 'hyperdriver' }); } } }, bot: { hyper: () => 'yes' }, botPlay: () => 0.6 });
  S('test_ground', '08071', 'Can be advanced. Trash it: derez a card for each advancement token on it.', { advable: true });
  on('test_ground', {
    abils: (X, iid) => [{ label: 'Test Ground: trash it — derez ' + X.card(iid).adv, bad: X.card(iid).adv ? null : 'No tokens' }],
    *use(X, iid) {
      const n = X.card(iid).adv; X.toArchives(iid, true);
      for (let k = 0; k < n; k++) {
        const ts = X.installedCorp().concat(X.R.rig).filter(i => X.card(i).side === 'corp' && X.card(i).rez);
        const t = yield* X.ask(iid, 'corp', 'testGround', 'Test Ground: derez which card?', ts.map(i => X.cardOpt(i)), { skip: 'Done' });
        if (!t) break;
        X.derez(t, 'test_ground');
      }
    },
    botAbil: () => -1
  });
  S('defective_brainchips', '08072', 'Current. The first brain damage the Runner takes each turn is 1 higher.');
  on('defective_brainchips', { mod: { damage: (X, iid, v, ctx) => { if (ctx.kind !== 'brain' || X.card(iid).x.turn === X.g.turnN) return v; X.card(iid).x.turn = X.g.turnN; return v + 1; } }, botPlay: () => 1 });
  S('allele', '08073', 'Can be advanced. Trash it: swap a card in HQ with one in Archives for each advancement token on it.', { advable: true });
  on('allele', {
    abils: (X, iid) => [{ label: 'Allele Repression: trash it — swap ' + X.card(iid).adv + ' cards with Archives', bad: X.card(iid).adv && X.C.arch.length && X.C.hq.length ? null : 'Nothing to swap' }],
    *use(X, iid) {
      const n = X.card(iid).adv; X.toArchives(iid, true);
      for (let k = 0; k < n && X.C.arch.length && X.C.hq.length; k++) {
        const a = yield* X.ask(iid, 'corp', 'alleleA', 'Allele Repression: which card from Archives?', X.C.arch.map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { skip: 'Done' });
        if (!a) break;
        const b = yield* X.ask(iid, 'corp', 'alleleB', '… for which card from HQ?', X.C.hq.map(i => X.cardOpt(i)));
        X.lift(a); X.card(a).up = false; X.C.hq.push(a); X.toArchives(b, false);
      }
    },
    botAbil: () => -1
  });
  S('marcus_batty', '08074', 'Trash it during a run on this server: a psi game — if the bids differ, resolve a subroutine on a rezzed ice protecting this server.');
  on('marcus_batty', {
    winOpts: (X, iid) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id && X.serverOf(iid).ice.some(i => X.card(i).rez) ? [{ label: 'Marcus Batty: trash him — a psi game for a subroutine' }] : [],
    *winUse(X, iid) {
      const sv = X.serverOf(iid);
      X.toArchives(iid, true);
      if (!(yield* X.psi('Marcus Batty'))) return null;
      const ice = sv.ice.filter(i => X.card(i).rez);
      const t = yield* X.ask(iid, 'corp', 'battyIce', 'Marcus Batty: a subroutine of which ice?', ice.map(i => X.cardOpt(i)));
      if (!t) return null;
      const subs = X.subsOf(t);
      const n = +(yield* X.ask(iid, 'corp', 'battySub', 'Which subroutine?', subs.map((sb, k) => ({ id: String(k), label: X.subText(sb) })), { always: true }));
      const r = yield* X.fireSub(Object.assign({ src: X.card(t).k }, subs[n]), t, n);
      return r === 'end' ? 'end' : null;
    },
    bot: { battyIce: (pub, me, pr) => pr.options[0].id, battySub: (pub, me, pr) => (pr.options.find(o => /End the run/.test(o.label)) || pr.options[0]).id },
    botWin: (pub) => !!pub.run && pub.run.stage === 'server'
  });
  S('expose', '08075', 'Can be advanced. Trash it: remove 1 bad publicity for each advancement token on it.', { advable: true });
  on('expose', { abils: (X, iid) => [{ label: 'Exposé: trash it — remove ' + Math.min(X.card(iid).adv, X.C.bp) + ' bad publicity', bad: X.card(iid).adv && X.C.bp ? null : 'Nothing to remove' }], use(X, iid) { const n = X.card(iid).adv; X.toArchives(iid, true); X.loseBP(n, 'Exposé'); }, botAbil: () => 2 });
  S('pachinko', '08076', '', { subs: [0, 1].map(() => ({ k: 's', n: 0, text: 'End the run if the Runner is tagged' })) });
  on('pachinko', { subs: [function (X) { return X.tagged() ? 'end' : null; }] });
  S('underway_reno', '08077', 'Installed face up. Whenever you advance it, trash the top card of the Runner’s stack (the top 2 once it has 4 or more tokens).', { public: true });
  publicAdv.underway_reno = (X, t) => { const n = X.card(t).adv >= 4 ? 2 : 1; for (let k = 0; k < n && X.R.stack.length; k++) { const c = X.R.stack.shift(); X.card(c).up = true; X.R.heap.push(c); } X.log({ t: 'note', side: 'corp', text: 'Underway Renovation trashes ' + X.plural(n, 'card') + ' from the top of the stack' }); };
  S('contract_killer', '08078', 'Can be advanced. With 2 or more tokens: a click, trash it — trash a connection, or do 2 meat damage.', { advable: true });
  on('contract_killer', {
    abils: (X, iid) => X.card(iid).adv >= 2 ? [{ label: 'Contract Killer: trash it — a connection, or 2 meat damage', clicks: 1 }] : [],
    *use(X, iid) {
      X.toArchives(iid, true);
      const conns = X.rigOf('resource').filter(i => kw(X, i, /Connection/));
      const a = conns.length ? yield* X.ask(iid, 'corp', 'contract', 'Contract Killer: trash a connection, or 2 meat damage?', [{ id: 'meat', label: '2 meat damage' }].concat(conns.map(i => X.cardOpt(i, 'Trash ' + X.nameOf(i)))), { always: true }) : 'meat';
      if (a === 'meat') yield* X.damage('meat', 2, 'Contract Killer'); else yield* X.corpTrashes(a, 'Contract Killer');
    },
    bot: { contract: () => 'meat' },
    botAbil: () => 3
  });
  S('spiderweb', '08079', '', { subs: [{ k: 'etr' }, { k: 'etr' }, { k: 'etr' }] });
  S('underway_grid', '08080', 'Ice protecting this server cannot be bypassed; nothing in or protecting it can be exposed. One region per server.');
  on('underway_grid', { mod: { noBypass: (X, iid, v, ctx) => v || (!!X.serverOf(iid) && X.serverOf(iid).ice.indexOf(ctx.iid) >= 0), noExpose: (X, iid, v, ctx) => v || (!!X.serverOf(iid) && X.serverOf(ctx.iid) === X.serverOf(iid)) } });

  /* ================================================================ OLD HOLLYWOOD */
  S('trope', '08081', 'A power counter as your turn begins. A click, remove it from the game: shuffle a card from your heap into your stack per counter.');
  on('trope', {
    on: { runnerTurnBegin(X, iid) { X.card(iid).power++; } },
    abils: (X, iid) => [{ label: 'Trope: remove it — ' + X.card(iid).power + ' cards from the heap into the stack', clicks: 1, bad: X.R.heap.length ? (X.heapLocked() ? 'Cards cannot leave your heap' : null) : 'Your heap is empty' }],
    *use(X, iid) {
      const n = X.card(iid).power;
      X.lift(iid); X.R.gone.push(iid);
      const ts = yield* X.ask(iid, 'runner', 'trope', 'Trope: shuffle which cards back (up to ' + n + ')?', X.R.heap.map(i => X.cardOpt(i)), { multi: true, min: 0, max: n });
      for (const t of ts) { X.lift(t); X.card(t).up = false; X.R.stack.push(t); }
      X.shuffleStack(true);
    },
    bot: { trope: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).brk || o.card === 'sure_gamble').slice(0, pr.max).map(o => o.id) },
    botAbil: (pub, me, o) => +((o.label.match(/— (\d+)/) || [])[1] || 0) >= 4 ? 1.5 : -1
  });
  S('spoilers', '08082', 'Whenever the Corp scores an agenda, it trashes the top card of R&D.');
  on('spoilers', { on: { score(X) { if (X.C.rd.length) { X.toArchives(X.C.rd[0], false); X.log({ t: 'mill', k: 'spoilers' }); } } }, botPlay: () => 0.8 });
  S('drug_dealer', '08083', 'When your turn begins, lose 1 credit. When the Corp’s turn begins, draw a card.');
  on('drug_dealer', { on: { runnerTurnBegin(X) { if (X.R.credits) { X.R.credits--; X.log({ t: 'lose', side: 'runner', n: 1 }); } }, corpTurnBegin(X) { X.drawRunner(1, 'drug_dealer'); } }, botPlay: () => 0.8 });
  S('rolodex', '08084', 'When installed, arrange the top 5 cards of your stack. When it is trashed, trash the top 3 cards of your stack.');
  on('rolodex', {
    *onInstall(X, iid) {
      const top = X.R.stack.slice(0, 5); const order = []; let left = top.slice();
      while (left.length > 1) { const t = yield* X.ask(iid, 'runner', 'rolodex', 'Rolodex: which card goes ' + (order.length ? 'next' : 'on top') + '?', left.map(i => X.cardOpt(i))); order.push(t); left = left.filter(i => i !== t); }
      order.push(...left); X.R.stack.splice(0, top.length, ...order);
    },
    whenTrashed(X) { for (let k = 0; k < 3 && X.R.stack.length; k++) { const t = X.R.stack.shift(); X.card(t).up = true; X.R.heap.push(t); } X.log({ t: 'mill', k: 'rolodex', side: 'runner' }); },
    botPlay: () => 0.6
  });
  S('fan_site', '08085', 'Whenever the Corp scores an agenda, it goes to your score area as an agenda worth 0 points.', { scorePts: 0 });
  on('fan_site', { on: { score(X, iid) { if (!X.isInstalled(iid)) return; X.lift(iid); X.wipe(X.card(iid)); X.card(iid).up = true; X.R.score.push(iid); X.log({ t: 'note', side: 'runner', text: 'Fan Site joins the Runner’s score area (0 points)' }); } }, botPlay: () => 0.3 });
  S('film_critic', '08086', 'Carries one agenda. Whenever you access an agenda you may put it on Film Critic instead. Two clicks: add that agenda to your score area.');
  on('film_critic', {
    hostsAgenda: true,
    on: {
      *access(X, iid, ctx) {
        if (X.dat(ctx.iid).type !== 'agenda' || X.R.ws.some(i => X.card(i).host === iid) || ctx.seen.noSteal) return;
        if (!(yield* X.yn(iid, 'runner', 'filmCritic', 'Film Critic: put ' + X.nameOf(ctx.iid) + ' on it instead of stealing?', 'Host it', 'No'))) return;
        X.dropHosted(ctx.iid); X.lift(ctx.iid); X.wipe(X.card(ctx.iid)); X.card(ctx.iid).up = true; X.card(ctx.iid).host = iid; X.R.ws.push(ctx.iid);
        ctx.seen.did = 'hosted'; ctx.seen.gone = true;
        X.log({ t: 'note', side: 'runner', text: 'Film Critic takes ' + X.nameOf(ctx.iid) });
      }
    },
    abils: (X, iid) => [{ label: 'Film Critic: add its agenda to your score area', clicks: 2, bad: X.R.ws.some(i => X.card(i).host === iid) ? null : 'Nothing on it' }],
    use(X, iid) {
      const t = X.R.ws.find(i => X.card(i).host === iid);
      if (!t) return;
      X.lift(t); X.card(t).host = null; X.R.score.push(t);
      X.log({ t: 'steal', k: X.card(t).k, pts: X.dat(t).pts, total: X.points('runner') });
      X.winCheck();
    },
    bot: { filmCritic: () => 'no' },
    botAbil: () => 3, botPlay: () => 0.4
  });
  S('paparazzi', '08087', 'You are always tagged. Meat damage to you is prevented.');
  on('paparazzi', { mod: { alwaysTagged: () => true }, prevent(X, iid, ctx) { return ctx.kind === 'meat' ? ctx.n : 0; }, botPlay: () => -1 });
  S('ronald_five', '08088', 'Whenever the Runner trashes a Corp card (this one too), they lose a click.');
  on('ronald_five', { on: { runnerTrashed(X) { if (X.R.clicks) { X.R.clicks--; X.log({ t: 'loseClick', k: 'ronald_five' }); } } }, onTrashed(X) { if (X.R.clicks) { X.R.clicks--; X.log({ t: 'loseClick', k: 'ronald_five' }); } } });
  S('enforcer', '08089', 'To rez it, forfeit an agenda. The Runner may lose a click to break one of its subroutines.', { rezForfeit: true, clickBreak: { clicks: 1, n: 1 },
    subs: [{ k: 'trashProg' }, { k: 'brain', n: 1 }, { k: 's', n: 0, text: 'Trash an installed console' }, { k: 's', n: 1, text: 'Trash every installed virtual resource' }] });
  on('enforcer', {
    subs: [
      function (X) { const t = X.R.rig.find(i => X.dat(i).console); if (t) X.trashRunner(t, 'Enforcer 1.0'); return null; },
      function (X) { for (const t of X.rigOf('resource').filter(i => kw(X, i, /Virtual/))) X.trashRunner(t, 'Enforcer 1.0'); return null; }
    ]
  });
  S('its_a_trap', '08090', 'Whenever it is exposed, 2 net damage.', { subs: [{ k: 's', n: 0, text: 'The Runner trashes an installed card; this ice is trashed' }] });
  on('its_a_trap', {
    *exposed(X) { yield* X.damage('net', 2, 'It’s a Trap!'); },
    subs: [function* (X, iid) { if (X.R.rig.length) { const t = yield* X.ask(iid, 'runner', 'trap', 'It’s a Trap!: trash one of your installed cards', X.R.rig.map(i => X.cardOpt(i)), { always: true }); if (t) X.trashRunner(t, 'It’s a Trap!'); } if (X.isInstalled(iid)) X.toArchives(iid, true); return 'gone'; }]
  });
  S('offer_refuse', '08091', 'Choose a central server: the Runner may run it, and cannot jack out. If they do not, this goes to your score area as 1 agenda point.', { scorePts: 1 });
  on('offer_refuse', {
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'corp', 'offer', 'An Offer You Can’t Refuse: which central server?', ['hq', 'rd', 'arch'].map(s => ({ id: s, label: X.srvName(X.server(s)) })), { always: true });
      if (yield* X.yn(iid, 'runner', 'offerRun', 'An Offer You Can’t Refuse: run ' + X.srvName(X.server(sid)) + ' now (no jacking out) — or the Corp takes it as 1 agenda point?', 'Run it', 'Let them have it')) { yield* X.run(sid, { via: 'offer_refuse', noJack: true }); return; }
      toCorpScore(X, iid, 1);
    },
    runMod: {},
    bot: { offer: () => 'hq', offerRun: (pub) => pub.runner.credits >= 4 ? 'yes' : 'no' },
    botPlay: () => 1.5
  });
  S('haarpsichord', '08092', 'The Runner cannot steal more than one agenda a turn.');
  on('haarpsichord', { mod: { noSteal: (X, iid, v) => v || (X.R.flags.stole ? 'Haarpsichord Studios: one agenda a turn' : null) } });
  S('award_bait', '08093', 'When accessed, you may put up to 2 advancement tokens on an installed card that can be advanced.');
  on('award_bait', {
    *onAccess(X, iid, ctx) {
      const ts = X.advTargets().filter(i => i !== iid);
      if (!ts.length) return;
      const t = yield* X.ask(iid, 'corp', 'awardBait', 'Award Bait: up to 2 advancement tokens on which card?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')), { skip: 'No' });
      if (t) { X.card(t).adv += 2; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'award_bait', x: 2 }); }
    },
    bot: { awardBait: (pub, me, pr) => pr.options[0].id }
  });
  S('explodapalooza', '08094', 'When accessed, you may gain 5 credits.');
  on('explodapalooza', { onAccess(X) { X.gain('corp', 5); X.log({ t: 'gain', side: 'corp', n: 5, k: 'explodapalooza' }); } });
  S('early_premiere', '08095', 'When your turn begins you may pay 1: an advancement token on a card you can advance in a server’s root.');
  on('early_premiere', {
    on: {
      *corpTurnBegin(X, iid) {
        const ts = X.advTargets().filter(i => X.dat(i).type !== 'ice');
        if (!ts.length || X.C.credits < 1) return;
        const t = yield* X.ask(iid, 'corp', 'premiere', 'Early Premiere: pay 1 for an advancement token on which card?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { skip: 'No' });
        if (t) { X.pay('corp', 1, 'any'); X.card(t).adv++; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'early_premiere' }); }
      }
    },
    bot: { premiere: (pub, me, pr) => pr.options[0].id }
  });
  S('casting_call', '08096', 'Install an agenda from HQ face up and put this on it: whenever the Runner accesses that agenda, they take 2 tags.');
  on('casting_call', {
    playBad: (X) => X.C.hq.some(i => X.dat(i).type === 'agenda') ? null : 'No agenda in HQ',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'casting', 'Casting Call: install which agenda face up?', X.C.hq.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i)));
      if (!t) return;
      yield* X.corpInstall(t, { faceup: true });
      if (!X.isInstalled(t)) return;
      X.hostCorp(iid, t); X.card(iid).rez = true;
    },
    on: { *access(X, iid, ctx) { if (ctx.iid === X.card(iid).host) yield* X.giveTags(2, 'Casting Call'); } },
    botPlay: () => 0.8
  });
  S('old_hollywood', '08097', 'Agendas in or protected by this server cannot be stolen — unless the Runner has a copy of that agenda in their score area. One region per server.');
  on('old_hollywood', { mod: { noSteal: (X, iid, v, ctx) => { if (v) return v; const sv = X.serverOf(iid); if (!sv || !X.g.run || X.g.run.sid !== sv.id) return v; return X.R.score.some(i => X.card(i).k === X.card(ctx.iid).k) ? v : 'Old Hollywood Grid'; } } });
  S('hollywood_reno', '08098', 'Installed face up. Whenever you advance it, you may put an advancement token on another card that can be advanced (2 once it has 6 or more tokens).', { public: true });
  S('back_channels', '08099', 'Choose a card in a remote server’s root: gain 3 credits per advancement token on it, then trash it.');
  on('back_channels', {
    playBad: (X) => X.remotes().some(sv => sv.root.length) ? null : 'No card in a remote',
    *play(X, iid) {
      const ts = [].concat(...X.remotes().map(sv => sv.root));
      const t = yield* X.ask(iid, 'corp', 'backCh', 'Back Channels: which card?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' tokens')));
      if (!t) return;
      const n = 3 * X.card(t).adv; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'back_channels' }); X.toArchives(t, X.card(t).rez);
    },
    bot: { backCh: (pub, me, pr) => pr.options.slice().sort((a, b) => (+((b.sub || '').match(/(\d+) tokens/) || [0, 0])[1]) - (+((a.sub || '').match(/(\d+) tokens/) || [0, 0])[1]))[0].id },
    botPlay: () => 0.2
  });
  S('vanity_project', '08100', '');

  /* ================================================================ THE UNIVERSE OF TOMORROW */
  S('power_to_people', '08101', 'Priority. The first time you access an agenda this turn, gain 7 credits.');
  on('power_to_people', { play(X, iid) { X.linger(iid); }, on: { access(X, iid, ctx) { if (X.dat(ctx.iid).type !== 'agenda' || X.R.flags.ptp) return; X.R.flags.ptp = true; X.gain('runner', 7); X.log({ t: 'gain', side: 'runner', n: 7, k: 'power_to_people' }); } }, botPlay: () => 1 });
  S('surfer', '08102', '2 credits: swap a barrier you are meeting with the ice just before or after it; the run carries on from its new place.');
  on('surfer', {
    encOpts: (X, iid, E) => {
      if (X.typesOf(E.iid).indexOf('barrier') < 0) return [];
      const sv = X.serverOf(E.iid), pos = sv.ice.indexOf(E.iid), out = [];
      for (const d of [-1, 1]) if (sv.ice[pos + d]) out.push({ kind: 'lower', label: 'Surfer: pay 2 — swap with the ' + (d < 0 ? 'next inner' : 'next outer') + ' ice', cost: 2, bad: X.avail('runner', 'any') < 2 ? 'Costs 2' : null, dir: d });
      return out;
    },
    encUse(X, iid, n, E) {
      const sv = X.serverOf(E.iid), pos = sv.ice.indexOf(E.iid);
      const opts = [-1, 1].filter(d => sv.ice[pos + d]);
      const d = opts[n] != null ? opts[n] : opts[0];
      X.pay('runner', 2, 'any');
      const other = sv.ice[pos + d]; sv.ice[pos + d] = E.iid; sv.ice[pos] = other;
      X.log({ t: 'note', side: 'runner', text: 'Surfer swaps ' + X.nameOf(E.iid) + ' with the ice beside it' });
    },
    botPlay: () => 0.4
  });
  S('ddos', '08103', 'Trash it: no outermost ice can be rezzed during runs this turn.');
  on('ddos', {
    abils: () => [{ label: 'DDoS: trash it — the outermost ice cannot be rezzed this turn' }],
    use(X, iid) { X.trashRunner(iid, 'used'); X.R.ddosTurn = X.g.turnN; X.log({ t: 'note', side: 'runner', text: 'DDoS: no outermost ice can be rezzed during runs this turn' }); },
    botAbil: () => -1, botPlay: () => 0.4
  });
  S('laramy_fisk', '08104', 'The first time each turn you make a successful run on a central server, you may make the Corp draw a card.');
  on('laramy_fisk', { on: { *success(X, iid, ctx) { if (X.isRemote(ctx.sid) || X.R.flags.fisk) return; X.R.flags.fisk = true; if (yield* X.yn(iid, 'runner', 'fisk', 'Laramy Fisk: make the Corp draw a card?', 'Yes', 'No')) X.drawCorp(1, 'laramy_fisk'); } }, bot: { fisk: (pub) => pub.corp.rdN <= 10 ? 'yes' : 'no' } });
  S('fisk_seminar', '08105', 'Priority. Each player draws 3 cards.');
  on('fisk_seminar', { play(X) { X.drawRunner(3, 'fisk_seminar'); X.drawCorp(3, 'fisk_seminar'); }, botPlay: () => 0.6 });
  S('bookmark', '08106', 'A click: put up to 3 cards from your grip face down on it. A click, or trash it: take them all back.');
  on('bookmark', {
    abils: (X, iid) => [{ label: 'Bookmark: put cards on it', clicks: 1, bad: X.R.grip.length ? null : 'Your grip is empty' }, { label: 'Bookmark: take them back', clicks: 1, bad: X.R.ws.some(i => X.card(i).host === iid) ? null : 'Nothing on it' }, { label: 'Bookmark: trash it — take them back', bad: X.R.ws.some(i => X.card(i).host === iid) ? null : 'Nothing on it' }],
    *use(X, iid, n) {
      if (n === 0) {
        const ts = yield* X.ask(iid, 'runner', 'bookmark', 'Bookmark: which cards (up to 3)?', X.R.grip.map(i => X.cardOpt(i)), { multi: true, min: 1, max: 3 });
        for (const t of ts) { X.lift(t); X.card(t).host = iid; X.card(t).x.facedown = true; X.R.ws.push(t); }
        return;
      }
      for (const t of X.R.ws.filter(i => X.card(i).host === iid)) { X.lift(t); X.card(t).x.facedown = false; X.R.grip.push(t); }
      if (n === 2) X.trashRunner(iid, 'used');
    },
    botAbil: () => -1, botPlay: () => -1
  });
  S('davinci', '08107', 'A power counter for each successful run. Trash it: install a card from your grip costing no more than its counters, free.');
  on('davinci', {
    on: { success(X, iid) { X.card(iid).power++; } },
    abils: (X, iid) => [{ label: 'DaVinci: trash it — install a card costing up to ' + X.card(iid).power + ', free', bad: X.R.grip.some(i => X.dat(i).type !== 'event' && (X.dat(i).cost || 0) <= X.card(iid).power) ? null : 'Nothing that cheap in your grip' }],
    *use(X, iid) {
      const n = X.card(iid).power;
      const pool = X.R.grip.filter(i => X.dat(i).type !== 'event' && (X.dat(i).cost || 0) <= n && !X.installBad(i));
      X.trashRunner(iid, 'used');
      const t = yield* X.ask(iid, 'runner', 'davinci', 'DaVinci: install which card free?', pool.map(i => X.cardOpt(i, null, X.dat(i).cost + ' to install')), { skip: 'None' });
      if (t) yield* X.runnerInstall(t, { free: true });
    },
    bot: { davinci: (pub, me, pr) => pr.options.slice().sort((a, b) => (D.CARDS[b.card].cost || 0) - (D.CARDS[a.card].cost || 0))[0].id },
    botAbil: (pub, me) => (me.hand || []).some(h => D.CARDS[h.k].type !== 'event' && (D.CARDS[h.k].cost || 0) >= 4) ? 1.5 : -1,
    botPlay: () => 1
  });
  S('wireless_net', '08108', 'The Corp’s basic action to trash a resource costs 2 more.');
  on('wireless_net', { mod: { trashResCost: (X, iid, v) => v + 2 }, botPlay: () => 0.6 });
  S('cybernetics_court', '08109', 'Your maximum hand size is 4 higher.');
  on('cybernetics_court', { mod: { corpHand: (X, iid, v) => v + 4 } });
  S('team_sponsorship', '08110', 'Whenever you score an agenda, you may install a card from Archives or HQ, free.');
  on('team_sponsorship', {
    on: {
      *score(X, iid) {
        const pool = X.C.hq.concat(X.C.arch).filter(i => X.dat(i).type !== 'operation');
        const t = yield* X.ask(iid, 'corp', 'teamSpon', 'Team Sponsorship: install which card, free?', pool.map(i => X.cardOpt(i, null, X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives')), { skip: 'None' });
        if (t) yield* X.corpInstall(t, { free: true });
      }
    },
    bot: { teamSpon: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || pr.options[0] || {}).id || 'skip' }
  });
  S('chronos_protocol', '08111', 'The first net damage the Runner takes each turn: you may look at their grip and choose the card lost.');
  on('chronos_protocol', { mod: { damagePicker: (X, iid, v, ctx) => { if (v || ctx.kind !== 'net' || X.card(iid).x.turn === X.g.turnN) return v; X.card(iid).x.turn = X.g.turnN; return 'corp'; } } });
  S('ancestral_imager', '08112', 'Whenever the Runner jacks out, 1 net damage.');
  on('ancestral_imager', { on: { *runEnd(X, iid, ctx) { if (ctx.how === 'jacked') yield* X.damage('net', 1, 'Ancestral Imager'); } } });
  S('genetics_pavilion', '08113', 'The Runner cannot draw more than 2 cards in each of their turns.');
  on('genetics_pavilion', { mod: { runnerDrawCap: () => 2 } });
  S('franchise_city', '08114', 'When the Runner accesses an agenda, this goes to your score area as 1 agenda point.', { scorePts: 1 });
  on('franchise_city', { on: { access(X, iid, ctx) { if (X.dat(ctx.iid).type === 'agenda' && X.isInstalled(iid)) toCorpScore(X, iid, 1); } } });
  S('product_placement', '08115', 'When accessed anywhere but Archives, gain 2 credits.');
  on('product_placement', { onAccess(X, iid, ctx) { if (ctx.from === 'arch') return; X.gain('corp', 2); X.log({ t: 'gain', side: 'corp', n: 2, k: 'product_placement' }); } });
  S('worlds_plaza', '08116', 'Carries up to 3 assets. A click: install an asset from HQ on it and rez it for 2 less.');
  on('worlds_plaza', {
    abils: (X, iid) => [{ label: 'Worlds Plaza: install and rez an asset on it', clicks: 1, bad: X.hostedCorp(iid).length >= 3 ? 'It holds 3 already' : X.C.hq.some(i => X.dat(i).type === 'asset') ? null : 'No asset in HQ' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'plaza', 'Worlds Plaza: install which asset on it?', X.C.hq.filter(i => X.dat(i).type === 'asset').map(i => X.cardOpt(i, null, 'rez for ' + Math.max(0, X.rezCost(i) - 2))));
      if (!t) return;
      X.hostCorp(t, iid); X.card(t).rez = false;
      X.log({ t: 'install', side: 'corp', iid: t, sid: X.serverOf(iid).id, ice: false, cost: 0 });
      if (X.avail('corp', 'rez') >= Math.max(0, X.rezCost(t) - 2)) { X.doRez(t, false, 2); yield* X.rezTriggers(t); }
    },
    botAbil: () => 1.6
  });
  S('public_support', '08117', 'When rezzed, 3 power counters; one comes off as your turn begins. When the last goes, it joins your score area as 1 agenda point.', { scriptCounters: 3, scorePts: 1 });
  on('public_support', { on: { corpTurnBegin(X, iid) { const c = X.card(iid); c.power--; if (c.power <= 0) toCorpScore(X, iid, 1); } } });
  S('tour_guide', '08118', 'An “End the run” subroutine for each rezzed asset.', { subs: [] });
  on('tour_guide', { self: { subs: (X, iid, v) => { const out = v.slice(); const n = X.installedCorp().concat(X.C.hosted).filter(i => X.card(i).rez && X.dat(i).type === 'asset').length; for (let k = 0; k < n; k++) out.push({ k: 'etr' }); return out; } } });
  S('expo_grid', '08119', 'When your turn begins, gain 1 credit if a rezzed asset is in this server’s root. One region per server.');
  on('expo_grid', { on: { corpTurnBegin(X, iid) { const sv = X.serverOf(iid); if (sv && sv.root.some(i => X.card(i).rez && X.dat(i).type === 'asset')) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'expo_grid' }); } } } });
  S('future_is_now', '08120', 'When scored, find any card in R&D and take it into HQ; shuffle.');
  on('future_is_now', {
    *onScore(X, iid) {
      if (!X.C.rd.length) return;
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'futureNow', 'The Future is Now: take which card from R&D?', X.dedupe(X.C.rd.map(i => X.cardOpt(i))));
      if (t) { X.lift(t); X.C.hq.push(t); }
      X.shuffleRD();
    },
    bot: { futureNow: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id }
  });

  /* The public agendas' advancement triggers, seen from the Corp's side. */
  D.script('oaktown_reno', { on: { advanced(X, iid, ctx) { if (ctx.iid === iid) publicAdv.oaktown_reno(X, iid); } } });
  D.script('underway_reno', { on: { advanced(X, iid, ctx) { if (ctx.iid === iid) publicAdv.underway_reno(X, iid); } } });
  D.script('hollywood_reno', {
    on: {
      *advanced(X, iid, ctx) {
        if (ctx.iid !== iid) return;
        const n = X.card(iid).adv >= 6 ? 2 : 1;
        const ts = X.advTargets().filter(i => i !== iid);
        if (!ts.length) return;
        const t = yield* X.ask(iid, 'corp', 'hollywood', 'Hollywood Renovation: ' + X.plural(n, 'advancement token') + ' on which other card?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { skip: 'None' });
        if (t) { X.card(t).adv += n; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'hollywood_reno', x: n }); }
      }
    },
    bot: { hollywood: (pub, me, pr) => pr.options[0].id }
  });

  D.SET_LOADED.sansan = true;
})(typeof window !== 'undefined' ? window : this);
