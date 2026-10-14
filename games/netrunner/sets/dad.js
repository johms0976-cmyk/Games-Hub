'use strict';
/* Data and Destiny (2016 deluxe: NBN and the three mini-factions — Apex,
 * Adam, Sunny Lebeau — 55 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. New here: face-down Runner cards (Apex's), which
 * are installed but blank — no memory, no abilities; Adam's three directives,
 * in play from the start and not part of the deck. Readings decided here:
 *   - SYNC and Jinteki Biotech-style flips: SYNC flips back and forth, a click each.
 *   - Media Blitz takes on the constant abilities of the chosen agenda.
 *   - Archangel: the Corp may pay 3 as it is accessed (not in Archives); the
 *     Runner meets it then and there.
 *   - Security Chip is used as you meet an ice.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const kw = (X, i, re) => re.test(X.dat(i).kw || '');
  const anyRun = (name, o) => ({
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, Object.assign({ card: iid, via: X.card(iid).k }, o || {}));
    }
  });
  const isAd = (X, i) => kw(X, i, /Advertisement/) || (X.dat(i).type === 'asset' && X.C.score.some(s => X.card(s).k === 'rebranding_team'));
  function toCorpScore(X, iid, pts) { X.lift(iid); X.wipe(X.card(iid)); X.card(iid).rez = true; X.card(iid).up = true; X.C.score.push(iid); X.log({ t: 'score', side: 'corp', k: X.card(iid).k, pts, total: X.points('corp') }); X.winCheck(); }
  function toRunnerScore(X, iid, ctx, pts) { const c = X.card(iid); X.lift(iid); X.wipe(c); c.up = true; X.R.score.push(iid); if (ctx) { ctx.seen.did = 'stolen'; ctx.seen.gone = true; } X.log({ t: 'steal', k: c.k, pts, total: X.points('runner') }); X.winCheck(); }
  /* A Sunny Lebeau cloud breaker: 2 credits, any number of subroutines; 2 credits, +3. */
  const gs = (type) => ({ cloud: true, brk: { type, cost: 2, n: 99 }, pump: { cost: 2, by: 3 } });

  /* ================================================================ NBN */
  S('sync', '09001', 'A click: flip it. Front: removing a tag costs the Runner 1 more. Back: trashing a resource costs you 2 less.');
  on('sync', {
    abils: (X, iid) => [{ label: 'SYNC: flip to ' + (X.card(iid).x.flipped ? 'the front (tags cost more to remove)' : 'the back (resources cheaper to trash)'), clicks: 1 }],
    use(X, iid) { X.card(iid).x.flipped = !X.card(iid).x.flipped; X.log({ t: 'note', side: 'corp', text: 'SYNC flips' }); },
    mod: { untagCost: (X, iid, v) => X.card(iid).x.flipped ? v : v + 1, trashResCost: (X, iid, v) => X.card(iid).x.flipped ? v - 2 : v },
    show: (X, iid) => X.card(iid).x.flipped ? 'flipped' : null,
    botAbil: (pub) => pub.runner.tags && pub.runner.rig.some(r => D.CARDS[r.k].type === 'resource') ? 0.6 : -1
  });
  S('na_sol', '09002', 'Whenever an agenda is scored or stolen, you may play a current from HQ or Archives (paying for it).');
  on('na_sol', {
    on: {
      *scoreOrSteal(X, iid) {
        const pool = X.C.hq.concat(X.C.arch).filter(i => X.dat(i).type === 'operation' && kw(X, i, /\bCurrent\b/) && X.C.credits >= X.playCost(i));
        if (!pool.length) return;
        const t = yield* X.ask(iid, 'corp', 'naSol', 'New Angeles Sol: play a current?', pool.map(i => X.cardOpt(i, null, X.playCost(i) + ' credits · ' + (X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives'))), { skip: 'No' });
        if (!t) return;
        if (X.C.arch.indexOf(t) >= 0) { X.lift(t); X.C.hq.push(t); }
        yield* X.playOp(t);
      }
    },
    bot: { naSol: (pub, me, pr) => pr.options[0].id }
  });
  S('spark', '09003', 'The first time each turn you rez an advertisement, the Runner loses 1 credit.');
  on('spark', { on: { rez(X, iid, ctx) { if (!isAd(X, ctx.iid) || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; if (X.R.credits) { X.R.credits--; X.log({ t: 'lose', side: 'runner', n: 1, cause: 'Spark Agency' }); } } } });
  S('fifteen_min', '09004', 'A click: shuffle it into R&D — even from the Runner’s score area. One per deck.');
  on('fifteen_min', {
    abilsAnywhere: true,
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 || X.R.score.indexOf(iid) >= 0 ? [{ label: '15 Minutes: shuffle it into R&D', clicks: 1 }] : [],
    use(X, iid) { X.lift(iid); X.wipe(X.card(iid)); X.card(iid).up = false; X.C.rd.push(iid); X.shuffleRD(); X.log({ t: 'note', side: 'corp', text: '15 Minutes goes back into R&D' }); },
    botAbil: (pub, me, o) => pub.runner.score.includes('fifteen_min') ? 3 : -1
  });
  S('improved_tracers', '09005', 'Every tracer ice has +1 strength. Every subroutine’s trace starts 1 higher.');
  on('improved_tracers', { mod: { iceStr: (X, iid, v, ctx) => kw(X, ctx.iid, /Tracer/) ? v + 1 : v, subTraceBase: (X, iid, v) => v + 1 } });
  S('rebranding_team', '09006', 'Every asset is an advertisement.');
  on('rebranding_team', {});
  S('qpm', '09007', 'Accessed while the Runner is tagged: it joins your score area.');
  on('qpm', { onAccess(X, iid, ctx) { if (!X.tagged()) return; toCorpScore(X, iid, X.dat(iid).pts); ctx.seen.did = 'scored'; ctx.seen.gone = true; } });
  S('lily_lockwell', '09008', 'When rezzed, draw 3. A click, remove a tag: find an operation in R&D, show it, shuffle, put it on top.');
  on('lily_lockwell', {
    onRez(X) { X.drawCorp(3, 'lily_lockwell'); },
    abils: (X) => [{ label: 'Lily Lockwell: remove a tag — an operation on top of R&D', clicks: 1, bad: !X.R.tags ? 'The Runner has no tags' : X.C.rd.some(i => X.dat(i).type === 'operation') ? null : 'No operation in R&D' }],
    *use(X, iid) {
      X.R.tags--; X.log({ t: 'untag', n: 1, k: 'lily_lockwell' });
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'lily', 'Lily Lockwell: which operation goes on top of R&D?', X.dedupe(X.C.rd.filter(i => X.dat(i).type === 'operation').map(i => X.cardOpt(i))));
      X.shuffleRD();
      if (t) { X.lift(t); X.C.rd.unshift(t); X.reveal('corp', [t], 'Lily Lockwell'); }
    },
    bot: { lily: (pub, me, pr) => (pr.options.find(o => /scorched|traffic|punitive/.test(o.card)) || pr.options[0]).id },
    botAbil: () => 1.2
  });
  S('news_team', '09009', 'Ambush. When accessed, the Runner takes 2 tags or adds it to their score area as −1 agenda point.', { scorePts: -1 });
  on('news_team', {
    *onAccess(X, iid, ctx) {
      if (ctx.from === 'arch') return;
      X.log({ t: 'ambush', k: 'news_team' });
      const a = yield* X.ask(iid, 'runner', 'newsTeam', 'News Team: take 2 tags, or take it as −1 agenda point?', [{ id: 'tags', label: '2 tags' }, { id: 'pts', label: '−1 agenda point' }], { always: true });
      if (a === 'pts') { toRunnerScore(X, iid, ctx, -1); return; }
      yield* X.giveTags(2, 'News Team');
    },
    bot: { newsTeam: (pub) => pub.runner.tags || pub.corp.ident === 'babw' ? 'pts' : 'tags' }
  });
  S('shannon_claire', '09010', 'A click: draw the bottom card of R&D. Trash her: find an agenda in R&D or Archives and put it at the bottom of R&D.');
  on('shannon_claire', {
    abils: (X) => [{ label: 'Shannon Claire: draw from the bottom of R&D', clicks: 1, bad: X.C.rd.length ? null : 'R&D is empty' }, { label: 'Shannon Claire: trash her — an agenda to the bottom of R&D', bad: X.C.rd.concat(X.C.arch).some(i => X.dat(i).type === 'agenda') ? null : 'No agenda to find' }],
    *use(X, iid, n) {
      if (n === 0) { X.C.hq.push(X.C.rd.pop()); X.log({ t: 'draw', side: 'corp', n: 1, why: 'shannon_claire' }); return; }
      X.toArchives(iid, true);
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'shannon', 'Shannon Claire: which agenda goes to the bottom of R&D?', X.dedupe(X.C.rd.concat(X.C.arch).filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i, null, X.C.rd.indexOf(i) >= 0 ? 'in R&D' : 'in Archives'))));
      const fromRD = t && X.C.rd.indexOf(t) >= 0;
      if (t) { X.lift(t); X.card(t).up = false; X.reveal('corp', [t], 'Shannon Claire'); }
      if (fromRD) X.shuffleRD();
      if (t) X.C.rd.push(t);
    },
    botAbil: (pub, me, o) => /bottom of R&D$/.test(o.label) ? 1 : -1
  });
  S('victoria_jenkins', '09011', 'The Runner has one click fewer each turn. Trashed while accessed: it goes to the Runner’s score area as 2 agenda points.', { scorePts: 2 });
  on('victoria_jenkins', { mod: { runnerClicks: (X, iid, v) => v - 1 }, *onTrashed(X, iid, ctx) { toRunnerScore(X, iid, ctx, 2); } });
  S('reality_3d', '09012', 'Rezzing it gives you 1 bad publicity. When your turn begins, gain 2 credits if the Runner is tagged, otherwise 1.');
  on('reality_3d', { *onRez(X) { yield* X.takeBP(1, 'Reality Threedee'); }, on: { corpTurnBegin(X) { const n = X.tagged() ? 2 : 1; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'reality_3d' }); } } });
  S('archangel', '09013', 'Ambush: accessed outside Archives, you may pay 3 — the Runner meets it.', { subs: [{ k: 's', n: 0, text: 'Trace 6: the Corp sends one of the Runner’s installed cards back to the grip' }] });
  on('archangel', {
    *onAccess(X, iid, ctx) {
      if (ctx.from === 'arch' || X.C.credits < 3) return;
      if (!(yield* X.yn(iid, 'corp', 'archangel', 'Archangel: pay 3 — the Runner meets it?', 'Pay 3', 'No'))) return;
      X.pay('corp', 3, 'any'); X.log({ t: 'ambush', k: 'archangel' }); ctx.seen.did = 'sprung';
      const out = yield* X.encounter(iid);
      if (X.g.run && out === 'end') yield* X.endRun('ended', 'Archangel');
    },
    subs: [function* (X, iid) {
      if (!(yield* X.trace(6, 'Archangel')).ok || !X.R.rig.length) return null;
      const t = yield* X.ask(iid, 'corp', 'archangelT', 'Archangel: which of the Runner’s cards goes back to the grip?', X.R.rig.map(i => X.cardOpt(i)));
      if (t) { for (const h of X.hostedOn(t)) X.trashRunner(h, 'host'); X.lift(t); X.wipe(X.card(t)); X.R.grip.push(t); }
      return null;
    }],
    bot: { archangel: () => 'yes', archangelT: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id }
  });
  S('news_hound', '09014', 'While a current is in play it gains “End the run” after its other subroutines.', { subs: [{ k: 'trace', n: 3, then: 'tag' }] });
  on('news_hound', { self: { subs: (X, iid, v) => X.C.cur.length || X.R.cur.length ? v.concat({ k: 'etr' }) : v } });
  S('resistor', '09015', '+1 strength for each tag the Runner has.', { subs: [{ k: 'trace', n: 4, then: 'etr' }] });
  on('resistor', { self: { iceStr: (X, iid, v) => v + X.R.tags } });
  S('special_offer', '09016', '', { subs: [{ k: 's', n: 0, text: 'The Corp gains 5 credits; Special Offer is trashed' }] });
  on('special_offer', { subs: [function (X, iid) { X.gain('corp', 5); X.log({ t: 'gain', side: 'corp', n: 5, k: 'special_offer' }); if (X.isInstalled(iid)) X.toArchives(iid, true); return 'gone'; }] });
  S('tldr', '09017', '', { subs: [{ k: 's', n: 0, text: 'The next ice the Runner meets this run has each subroutine twice for that encounter' }] });
  on('tldr', {
    subs: [function (X, iid) { X.g.run.tldrNext = iid; return null; }],
    on: { encounter(X, iid, ctx) { if (!ctx.S.tldrNext || ctx.iid === ctx.S.tldrNext) return; ctx.S.tldrNext = null; const twice = []; for (const sb of ctx.E.subs) twice.push(sb, sb); ctx.E.subs.length = 0; ctx.E.subs.push(...twice); ctx.E.broken.length = 0; for (let k = 0; k < twice.length; k++) ctx.E.broken.push(false); } }
  });
  S('turnpike', '09018', 'When the Runner meets it, they lose 1 credit.', { subs: [{ k: 'trace', n: 5, then: 'tag' }] });
  on('turnpike', { onEnc(X) { if (X.R.credits) { X.R.credits--; X.log({ t: 'lose', side: 'runner', n: 1, cause: 'Turnpike' }); } return null; } });
  S('news_cycle', '09019', 'As an extra cost, forfeit an agenda. Use the “when scored” ability of an agenda in your score area again.');
  on('news_cycle', {
    playBad: (X) => X.C.score.length >= 2 ? null : 'Needs an agenda to forfeit and another to use',
    *play(X, iid) {
      const f = yield* X.ask(iid, 'corp', 'newsForfeit', '24/7 News Cycle: forfeit which agenda?', X.C.score.map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')));
      if (!f) return;
      X.lift(f); X.C.gone.push(f); X.log({ t: 'forfeit', side: 'corp', k: X.card(f).k });
      const t = yield* X.ask(iid, 'corp', 'newsUse', '24/7 News Cycle: use which agenda’s “when scored”?', X.C.score.map(i => X.cardOpt(i)));
      if (t) yield* X.whenScored(t, 0);
    },
    bot: { newsForfeit: (pub, me, pr) => pr.options.slice().sort((a, b) => D.CARDS[a.card].pts - D.CARDS[b.card].pts)[0].id, newsUse: (pub, me, pr) => (pr.options.find(o => ['hostile_takeover', 'geothermal', 'license_acq', 'breaking_news'].indexOf(o.card) >= 0) || pr.options[0]).id },
    botPlay: () => -1
  });
  S('ad_blitz', '09020', 'Double. Pay X: install and rez X advertisements from Archives and/or HQ (paying their costs).', { cost: 0 });
  on('ad_blitz', {
    playBad: (X) => X.C.hq.concat(X.C.arch).some(i => isAd(X, i) && X.dat(i).type !== 'operation') ? null : 'No advertisement to install',
    *play(X, iid) {
      const pool = () => X.C.hq.concat(X.C.arch).filter(i => isAd(X, i) && X.dat(i).type !== 'operation');
      const most = Math.min(pool().length, X.C.credits);
      const opts = []; for (let n = 1; n <= most; n++) opts.push({ id: String(n), label: 'X = ' + n });
      const x = opts.length ? +(yield* X.ask(iid, 'corp', 'adBlitzX', 'Ad Blitz: how many (X)?', opts, { always: true })) : 0;
      X.pay('corp', x, 'any');
      for (let n = 0; n < x; n++) {
        const t = yield* X.ask(iid, 'corp', 'adBlitz', 'Ad Blitz: install and rez which advertisement (' + (n + 1) + ' of ' + x + ')?', pool().map(i => X.cardOpt(i, null, X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives')), { skip: 'Stop' });
        if (!t) break;
        yield* X.corpInstall(t, {});
        if (X.isInstalled(t) && !X.card(t).rez && X.avail('corp', 'rez') >= X.rezCost(t)) yield* X.rezFlow(t, false);
      }
    },
    bot: { adBlitzX: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botPlay: () => 0.8
  });
  S('media_blitz', '09021', 'Current. Choose an agenda in the Runner’s score area: this has its text.', { copies: true });
  on('media_blitz', {
    playBad: (X) => X.R.score.some(i => X.dat(i).type === 'agenda') ? null : 'No agenda in the Runner’s score area',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'mediaBlitz', 'Media Blitz: copy which agenda’s text?', X.R.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i)));
      if (t) { X.card(iid).x.copy = X.card(t).k; X.log({ t: 'note', side: 'corp', text: 'Media Blitz takes the text of ' + X.nameOf(t) }); }
    },
    show: (X, iid) => X.card(iid).x.copy ? 'as ' + D.CARDS[X.card(iid).x.copy].name : null,
    botPlay: () => 0.6
  });
  S('all_seeing_i', '09022', 'Only while the Runner is tagged. Every installed resource is trashed — unless the Runner removes 1 of your bad publicity.');
  on('all_seeing_i', {
    playBad: (X) => X.tagged() ? (X.rigOf('resource').length ? null : 'The Runner has no resources') : 'Only while the Runner is tagged',
    *play(X, iid) {
      if (X.C.bp && (yield* X.yn(iid, 'runner', 'allSeeing', 'The All-Seeing I: remove 1 of the Corp’s bad publicity to keep your resources?', 'Remove 1 bad publicity', 'Lose them'))) { X.loseBP(1, 'The All-Seeing I'); return; }
      for (const t of X.rigOf('resource')) yield* X.corpTrashes(t, 'The All-Seeing I');
    },
    bot: { allSeeing: () => 'yes' },
    botPlay: (pub) => pub.runner.rig.filter(r => D.CARDS[r.k].type === 'resource').length >= 2 ? 5 : -1
  });
  S('surveillance_sweep', '09023', 'Current. In traces during runs the Runner spends first.');
  on('surveillance_sweep', { mod: { runnerBidsFirst: () => true }, botPlay: () => 1 });
  S('keegan_lane', '09024', 'During a run on this server: trash him and remove a tag — trash a program.');
  on('keegan_lane', {
    winOpts: (X, iid) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id && X.R.tags && X.programs().length ? [{ label: 'Keegan Lane: trash him, remove a tag — trash a program' }] : [],
    *winUse(X, iid) {
      X.toArchives(iid, true); X.R.tags--; X.log({ t: 'untag', n: 1, k: 'keegan_lane' });
      const t = yield* X.ask(iid, 'corp', 'keegan', 'Keegan Lane: trash which program?', X.programs().map(i => X.cardOpt(i)));
      if (t && !(yield* X.saveWithConstruct(t))) X.trashRunner(t, 'Keegan Lane');
    },
    bot: { keegan: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id },
    botWin: () => true
  });
  S('rutherford', '09025', 'Traces during runs on this server start 2 higher. One region per server.');
  on('rutherford', { mod: { traceBase: (X, iid, v) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id ? v + 2 : v } });
  S('gfi', '09026', 'Worth 1 point less in the Runner’s score area.');
  on('gfi', { self: { agendaPts: (X, iid, v, ctx) => ctx.side === 'runner' ? v - 1 : v } });
  S('launch_campaign', '09027', 'Put 6 credits on it when rezzed. When your turn begins, take 2. Trashed when empty.', { load: 6 });
  on('launch_campaign', { on: { corpTurnBegin(X, iid) { const c = X.card(iid), n = Math.min(2, c.cred); c.cred -= n; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'launch_campaign' }); if (c.cred <= 0) { X.toArchives(iid, true); X.log({ t: 'empty', k: 'launch_campaign' }); } } } });
  S('assassin', '09028', '', { subs: [{ k: 'trace', n: 5, do: { k: 'net', n: 3 }, text: '3 net damage' }, { k: 'trace', n: 4, do: { k: 'trashProg' }, text: 'trash a program' }] });

  /* ================================================================ APEX */
  S('apex', '09029', 'You cannot install resources that are not virtual. When your turn begins you may install a card from your grip face down.');
  on('apex', {
    mod: { runnerInstallBad: (X, iid, v, ctx) => v || (X.dat(ctx.iid).type === 'resource' && !kw(X, ctx.iid, /Virtual/) ? 'Apex: only virtual resources' : null) },
    on: {
      *runnerTurnBegin(X, iid) {
        if (!X.R.grip.length) return;
        const t = yield* X.ask(iid, 'runner', 'apexFd', 'Apex: install a card from your grip face down?', X.R.grip.map(i => X.cardOpt(i)), { skip: 'No' });
        if (t) yield* X.runnerInstall(t, { facedown: true });
      }
    },
    bot: { apexFd: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'event' && !/sure_gamble|easy_mark/.test(o.card)) || {}).id || 'skip' }
  });
  S('apocalypse', '09030', 'Only after successful runs on HQ, R&D and Archives this turn. Trash every installed Corp card; turn every installed Runner card face down.');
  on('apocalypse', {
    playBad: (X) => { const f = X.R.flags.succ || {}; return f.hq && f.rd && f.arch ? null : 'Only after successful runs on HQ, R&D and Archives this turn'; },
    play(X) {
      const all = X.installedCorp().filter(i => X.card(i).k !== 'architect');
      for (const i of all) if (X.isInstalled(i)) X.toArchives(i, true);
      for (const i of X.R.rig.slice()) { const c = X.card(i); if (!c.x.fd) { c.x.fd = true; c.virus = 0; c.power = 0; c.cred = 0; } }
      X.log({ t: 'note', side: 'runner', text: 'Apocalypse: ' + X.plural(all.length, 'Corp card') + ' trashed, the Runner’s cards turned face down' });
    },
    botPlay: () => 6
  });
  S('prey', '09031', 'Run any server. Once in that run, as you pass an ice, you may trash as many of your installed cards as its strength to trash it.');
  on('prey', Object.assign(anyRun('Prey'), {
    *play(X, iid) {
      X.linger(iid);
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Prey: run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })));
      if (sid) yield* X.run(sid, { card: iid, via: 'prey' });
    },
    on: {
      *passIce(X, iid, ctx) {
        if (!X.g.run || X.g.run.o.card !== iid || X.g.run.prey || !X.card(ctx.iid).rez) return;
        const n = Math.max(0, X.iceStr(ctx.iid));
        if (n > X.R.rig.length || X.card(ctx.iid).k === 'architect') return;
        if (!(yield* X.yn(iid, 'runner', 'prey', 'Prey: trash ' + X.plural(n, 'installed card') + ' to trash ' + X.nameOf(ctx.iid) + '?', 'Do it', 'No'))) return;
        X.g.run.prey = true;
        const ts = n ? yield* X.ask(iid, 'runner', 'preyCards', 'Prey: trash which cards?', X.R.rig.map(i => X.cardOpt(i)), { multi: true, min: n, max: n }) : [];
        for (const t of ts) if (X.isInstalled(t)) X.trashRunner(t, 'prey');
        X.log({ t: 'trash', side: 'corp', k: X.card(ctx.iid).k, price: 0, by: 'prey' });
        X.toArchives(ctx.iid, true);
      }
    },
    bot: { prey: () => 'no' },
    botPlay: () => 0.3
  }));
  S('heartbeat', '09032', '+1 memory. Trash one of your installed cards: prevent 1 damage. One console only.', { console: true, memory: 1 });
  on('heartbeat', {
    *prevent(X, iid, ctx) {
      let p = 0;
      while (p < ctx.n) {
        const ts = X.R.rig.filter(i => i !== iid);
        if (!ts.length) break;
        const t = yield* X.ask(iid, 'runner', 'heartbeat', 'Heartbeat: trash an installed card to prevent 1 ' + ctx.kind + ' damage (' + (ctx.n - p) + ' coming)?', ts.map(i => X.cardOpt(i)), { skip: 'No' });
        if (!t) break;
        X.trashRunner(t, 'heartbeat'); p++;
        X.log({ t: 'prevent', side: 'runner', k: 'heartbeat', n: 1 });
      }
      return p;
    },
    bot: { heartbeat: (pub, me, pr) => { const fd = pr.options.find(o => !o.card || !D.CARDS[o.card] || o.label === 'face-down card'); return pub.runner.gripN <= 2 ? (fd || pr.options[0]).id : 'skip'; } }
  });
  S('endless_hunger', '09033', 'Trash one of your installed cards: break one “End the run” subroutine.', { str: 11 });
  on('endless_hunger', {
    encOpts: (X, iid, E) => {
      if (X.breakerStr(iid) < X.iceStr(E.iid, E) || X.R.rig.length < 2) return [];
      const k = E.subs.findIndex((sb, n) => !E.broken[n] && sb.k === 'etr');
      return k < 0 ? [] : [{ kind: 'break', sub: k, subs: [k], label: 'Endless Hunger: trash a card — break “End the run”', cost: 0 }];
    },
    *encUse(X, iid, n, E) {
      const k = E.subs.findIndex((sb, j) => !E.broken[j] && sb.k === 'etr');
      const t = yield* X.ask(iid, 'runner', 'hunger', 'Endless Hunger: trash which installed card?', X.R.rig.filter(i => i !== iid).map(i => X.cardOpt(i)), { always: true });
      if (t) X.trashRunner(t, 'endless_hunger');
      const won = yield* X.breaking(E, [k]);
      for (const j of won) E.broken[j] = true;
      E.brokeAny = true;
      X.log({ t: 'break', how: 'endless_hunger', iid: E.iid, subs: won });
    },
    bot: { hunger: (pub, me, pr) => pr.options[pr.options.length - 1].id }
  });
  S('harbinger', '09034', 'When it would be trashed, it turns face down instead (it still counts as trashed).', { harbinger: true });
  on('harbinger', { harbinger: true, botPlay: () => 0.6 });
  S('hunting_grounds', '09035', 'Once a turn: stop an ice’s “when encountered” ability. Trash it: install the top 3 cards of your stack face down.');
  on('hunting_grounds', {
    *preventOnEnc(X, iid, ctx) {
      if (X.card(iid).x.turn === X.g.turnN) return false;
      if (!(yield* X.yn(iid, 'runner', 'hunting', 'Hunting Grounds: stop ' + X.nameOf(ctx.iid) + '’s “when encountered”?', 'Stop it', 'No'))) return false;
      X.card(iid).x.turn = X.g.turnN; return true;
    },
    abils: (X) => [{ label: 'Hunting Grounds: trash it — the top 3 of your stack, face down', bad: X.R.stack.length ? null : 'Your stack is empty' }],
    *use(X, iid) { X.trashRunner(iid, 'used'); for (const t of X.R.stack.slice(0, 3)) yield* X.runnerInstall(t, { facedown: true }); },
    bot: { hunting: () => 'yes' },
    botAbil: () => -1
  });
  S('wasteland', '09036', 'The first time each turn you trash one of your installed cards, gain 1 credit.');
  on('wasteland', { sync: { ownTrashed(X, iid, ctx) { if (ctx.why === 'host' || X.card(iid).x.turn === X.g.turnN || ctx.iid === iid) return; X.card(iid).x.turn = X.g.turnN; X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'wasteland' }); } }, botPlay: () => 1 });

  /* ================================================================ ADAM */
  S('adam', '09037', 'You start with your 3 directives installed (they are not part of your deck).', { startsWith: ['always_be_running', 'neutralize_threats', 'safety_first'] });
  S('independent_thinking', '09038', 'Trash up to 5 of your installed cards: draw a card for each (2 for each if any was a directive).');
  on('independent_thinking', {
    playBad: (X) => X.R.rig.length ? null : 'Nothing installed',
    *play(X, iid) {
      const ts = yield* X.ask(iid, 'runner', 'indepThink', 'Independent Thinking: trash which installed cards (up to 5)?', X.R.rig.map(i => X.cardOpt(i)), { multi: true, min: 1, max: 5 });
      const dir = ts.some(t => kw(X, t, /Directive/));
      for (const t of ts) if (X.isInstalled(t)) X.trashRunner(t, 'independent_thinking');
      X.drawRunner(ts.length * (dir ? 2 : 1), 'independent_thinking');
    },
    bot: { indepThink: (pub, me, pr) => pr.options.filter(o => /safety_first|always_be_running/.test(o.card)).map(o => o.id).slice(0, Math.max(1, pr.min)) },
    botPlay: () => 0.8
  });
  S('brain_chip', '09039', '+X memory and +X hand size: X is your agenda points. One console only.', { console: true });
  on('brain_chip', { mod: { mu: (X, iid, v) => v + Math.max(0, X.points('runner')), runHand: (X, iid, v) => v + Math.max(0, X.points('runner')) }, botPlay: (pub) => pub.runner.points >= 2 ? 2 : 0.4 });
  S('multithreader', '09040', '2 recurring credits for using programs.', { recur: { n: 2, for: 'breaker' } });
  S('always_be_running', '09041', 'Directive. Your first click each turn must be spent to run (a server, or a run event). Once a turn, lose two clicks: break a subroutine.');
  on('always_be_running', {
    mod: { firstClickRun: () => true },
    encOpts: (X, iid, E) => { if (X.card(iid).x.turn === X.g.turnN || X.R.clicks < 2) return []; const k = E.broken.findIndex(b => !b); return k < 0 ? [] : [{ kind: 'break', sub: k, subs: [k], label: 'Always Be Running: lose two clicks — break “' + X.subText(E.subs[k]) + '”', cost: 0 }]; },
    *encUse(X, iid, n, E) { X.card(iid).x.turn = X.g.turnN; X.R.clicks -= 2; const k = E.broken.findIndex(b => !b); const won = yield* X.breaking(E, [k]); for (const j of won) E.broken[j] = true; E.brokeAny = true; X.log({ t: 'break', how: 'always_be_running', iid: E.iid, subs: won }); }
  });
  S('dr_lovegood', '09042', 'When your turn begins, choose one of your installed cards: it has no printed abilities this turn.');
  on('dr_lovegood', {
    on: {
      *runnerTurnBegin(X, iid) {
        const ts = X.R.rig.filter(i => i !== iid && !X.card(i).x.fd);
        if (!ts.length) return;
        const t = yield* X.ask(iid, 'runner', 'lovegood', 'Dr. Lovegood: which card loses its abilities this turn?', ts.map(i => X.cardOpt(i)), { always: true });
        if (t) { X.card(t).x.blankT = X.g.turnN; X.log({ t: 'note', side: 'runner', text: 'Dr. Lovegood blanks ' + X.nameOf(t) + ' this turn' }); }
      }
    },
    bot: { lovegood: (pub, me, pr) => (pr.options.find(o => /safety_first|always_be_running/.test(o.card)) || pr.options[0]).id }
  });
  S('neutralize_threats', '09043', 'Directive. The first card with a trash cost you access each turn is shown, and you must trash it if you can pay. Accessing HQ takes 1 more card.');
  on('neutralize_threats', {
    mod: { accessHQ: (X, iid, v) => v + 1 },
    on: {
      access(X, iid, ctx) {
        const cost = X.trashCostOf(ctx.iid);
        if (cost == null || X.card(iid).x.turn === X.g.turnN || ctx.from === 'arch') return;
        X.card(iid).x.turn = X.g.turnN;
        X.reveal('corp', [ctx.iid], 'Neutralize All Threats');
        if (X.avail('runner', 'trashCost', { asset: X.dat(ctx.iid).type === 'asset' }) < cost) return;
        X.pay('runner', cost, 'trashCost', { asset: X.dat(ctx.iid).type === 'asset' });
        X.log({ t: 'trash', side: 'corp', k: X.card(ctx.iid).k, price: cost, by: 'neutralize_threats' });
        X.toArchives(ctx.iid, true);
        ctx.seen.did = 'trashed'; ctx.seen.gone = true;
      }
    }
  });
  S('safety_first', '09044', 'Directive. Your maximum hand size is 2 lower. When your turn ends, draw a card if your grip is smaller than that.');
  on('safety_first', { mod: { runHand: (X, iid, v) => v - 2 }, on: { runnerTurnEnd(X) { if (X.R.grip.length < X.runHandMax()) X.drawRunner(1, 'safety_first'); } } });

  /* ================================================================ SUNNY LEBEAU */
  S('sunny', '09045', '');
  S('security_chip', '09046', 'Trash it as you meet an ice: one icebreaker — or every cloud icebreaker — has +1 strength per link for this run.');
  on('security_chip', {
    encOpts: (X, iid) => X.breakers().length ? [{ kind: 'lower', label: 'Security Chip: trash it — +' + X.link() + ' strength this run', cost: 0 }] : [],
    *encUse(X, iid) {
      const n = X.link();
      const opts = X.breakers().map(i => X.cardOpt(i)).concat(X.breakers().some(i => X.dat(i).cloud) ? [{ id: 'clouds', label: 'Every cloud icebreaker' }] : []);
      const t = yield* X.ask(iid, 'runner', 'secChip', 'Security Chip: which icebreaker?', opts, { always: true });
      X.trashRunner(iid, 'used');
      for (const b of t === 'clouds' ? X.breakers().filter(i => X.dat(i).cloud) : [t]) X.g.run.pump[b] = (X.g.run.pump[b] || 0) + n;
    },
    bot: { secChip: (pub, me, pr) => pr.options[0].id }
  });
  S('security_nexus', '09047', '+1 memory, +1 link. Once a turn as you meet an ice, you may have the Corp trace 5: if it succeeds you take a tag and the run ends; if not, you slip past the ice. One console only.', { console: true, memory: 1, link: 1 });
  on('security_nexus', {
    on: {
      *encounter(X, iid, ctx) {
        if (X.card(iid).x.turn === X.g.turnN) return;
        if (!(yield* X.yn(iid, 'runner', 'nexus', 'Security Nexus: risk a trace 5 to slip past ' + X.nameOf(ctx.iid) + '?', 'Do it', 'No'))) return;
        X.card(iid).x.turn = X.g.turnN;
        if ((yield* X.trace(5, 'Security Nexus')).ok) { yield* X.giveTags(1, 'Security Nexus'); ctx.E.endNow = true; ctx.E.endBy = 'Security Nexus'; }
        else ctx.E.bypass = 'security_nexus';
      }
    },
    bot: { nexus: (pub) => pub.runner.link >= 4 ? 'yes' : 'no' }
  });
  S('gs_striker', '09048', 'Cloud: no memory with 2 link. 2 credits: break any number of code gate subroutines. 2 credits: +3 strength.', gs('code gate'));
  S('gs_shrike', '09049', 'Cloud: no memory with 2 link. 2 credits: break any number of sentry subroutines. 2 credits: +3 strength.', gs('sentry'));
  S('gs_sherman', '09050', 'Cloud: no memory with 2 link. 2 credits: break any number of barrier subroutines. 2 credits: +3 strength.', gs('barrier'));
  S('globalsec_clearance', '09051', 'Install only with 2 link or more. When your turn begins you may lose a click to look at the top card of R&D.');
  on('globalsec_clearance', {
    installBad: (X) => X.link() >= 2 ? null : 'Needs 2 link',
    on: { *runnerTurnBegin(X, iid) { if (!X.C.rd.length || !X.R.clicks) return; if (yield* X.yn(iid, 'runner', 'globalsec', 'Globalsec Security Clearance: lose a click to look at the top of R&D?', 'Look', 'No')) { X.R.clicks--; X.R.peek = { iid: X.C.rd[0], k: X.card(X.C.rd[0]).k, turn: X.g.turnN }; X.log({ t: 'peek', k: 'globalsec_clearance' }); } } },
    bot: { globalsec: () => 'no' }
  });
  S('jak_sinclair', '09052', 'Costs 1 less to install per link. When your turn begins you may make a run — without using programs.');
  on('jak_sinclair', {
    self: { installCost: (X, iid, v) => v - X.link() },
    on: {
      *runnerTurnBegin(X, iid) {
        const sid = yield* X.ask(iid, 'runner', 'jak', 'Jak Sinclair: make a run now (no programs)?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { skip: 'No' });
        if (sid) { yield* X.run(sid, { via: 'jak_sinclair' }); }
      },
      runBegin(X, iid, ctx) { if (ctx.S.o.via === 'jak_sinclair') ctx.S.noPrograms = true; }
    },
    bot: { jak: (pub) => pub.corp.servers.find(s => s.id === 'arch' && !s.ice.length) ? 'arch' : 'skip' }
  });

  /* ================================================================ NEUTRAL */
  S('employee_strike', '09053', 'Current. The Corp’s identity has no abilities.');
  on('employee_strike', { mod: { blankId: (X, iid, v, ctx) => v || ctx.side === 'corp' }, botPlay: () => 1.2 });
  S('windfall', '09054', 'Shuffle your stack, trash its top card, gain credits equal to its install cost.');
  on('windfall', { play(X) { X.shuffleStack(true); const t = X.R.stack.shift(); if (!t) return; X.card(t).up = true; X.R.heap.push(t); const n = X.dat(t).type === 'event' ? 0 : X.dat(t).cost || 0; X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'windfall', what: X.nameOf(t) }); }, botPlay: () => 1.5 });
  S('technical_writer', '09055', 'A credit on it whenever you install hardware or a program. A click, trash it: take them all.');
  on('technical_writer', {
    on: { install(X, iid, ctx) { if (ctx.side === 'runner' && ['hardware', 'program'].indexOf(X.dat(ctx.iid).type) >= 0) X.card(iid).cred++; } },
    abils: (X, iid) => [{ label: 'Technical Writer: trash it — take ' + X.card(iid).cred, clicks: 1 }],
    use(X, iid) { const n = X.card(iid).cred; X.trashRunner(iid, 'used'); X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'technical_writer' }); },
    botAbil: (pub, me, o) => +((o.label.match(/take (\d+)/) || [])[1] || 0) >= 5 ? 2 : -1,
    botPlay: () => 0.8
  });

  D.SET_LOADED.dad = true;
})(typeof window !== 'undefined' ? window : this);
