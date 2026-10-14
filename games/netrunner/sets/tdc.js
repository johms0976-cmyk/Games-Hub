'use strict';
/* Terminal Directive — the campaign cards (28). They never go in a deck by
 * hand: the campaign (nr-campaign.js) adds them to each side's deck as its
 * data sets open. Their set is 'tdc', which no table's card sets include.
 *
 * Numbers from sets/stats.js; every line of card text written fresh.
 * Readings decided here:
 *   - Trojan, when the Runner accesses it, costs the Corp 2 credits and a
 *     random card from HQ, and leaves the game.
 *   - Surveillance Network Key reveals the first card the Corp draws by
 *     clicking to draw.
 *   - BMI Buffer catches programs discarded from the grip or lost to damage.
 *   - The Masque B: after its successful run ends, another run on a different server.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text, set: 'tdc', campaign: true }, o || {}));
  const on = D.script;
  const runOpts = X => X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) }));
  const noRun = X => X.C.servers.every(sv => X.runBad(sv.id, 1));
  const iceAll = X => X.corpPlaced().filter(i => X.dat(i).type === 'ice');
  const gainC = (X, n, k) => { if (n > 0) { X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k }); } };

  /* ================================================================ CORP */
  S('evidence_1', '14000', 'Campaign. Win a game with it in your score area: data set 2 opens.');
  S('evidence_2', '14001', 'Campaign. Win a game with it in your score area: data set 5 opens.');
  S('evidence_3', '14002', 'Campaign. Win a game with it in your score area: data set 8 opens.');
  /* What a win with them scored opens is the campaign's business (nr-campaign.js). */
  for (const k of ['evidence_1', 'evidence_2', 'evidence_3']) on(k, {});
  S('evidence_4', '14003', 'Campaign. Worth 1 point less in the Runner’s score area.');
  on('evidence_4', { self: { agendaPts: (X, iid, v, ctx) => ctx.side === 'runner' ? v - 1 : v } });
  S('inez_corp_a', '14004', 'Campaign. Whenever you score an agenda, you may swap it for one of the Runner’s worth at least 1 point, then use that agenda’s “when scored”.');
  on('inez_corp_a', {
    on: {
      *score(X, iid, ctx) {
        const theirs = X.R.score.filter(i => X.dat(i).type === 'agenda' && (X.dat(i).pts || 0) >= 1);
        if (!theirs.length || X.C.score.indexOf(ctx.iid) < 0) return;
        const t = yield* X.ask(iid, 'corp', 'inezA', 'Inez Delgado: swap ' + X.nameOf(ctx.iid) + ' for which of the Runner’s agendas?', theirs.map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { skip: 'No swap' });
        if (!t) return;
        X.lift(ctx.iid); X.lift(t); X.R.score.push(ctx.iid); X.C.score.push(t);
        X.log({ t: 'note', side: 'corp', text: 'Inez Delgado swaps ' + X.nameOf(ctx.iid) + ' for ' + X.nameOf(t) });
        X.winCheck();
        yield* X.whenScored(t, 0);
      }
    },
    bot: { inezA: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).pts >= 2) || {}).id || 'skip' }
  });
  S('inez_corp_a2', '14005', 'Campaign. Whenever the Runner steals an agenda, you may use its “when scored”, then swap it for one in your score area.');
  on('inez_corp_a2', {
    on: {
      *steal(X, iid, ctx) {
        if (X.R.score.indexOf(ctx.iid) < 0 || !X.C.score.some(i => X.dat(i).type === 'agenda')) return;
        if (!(yield* X.yn(iid, 'corp', 'inezA2', 'Inez Delgado: use ' + X.nameOf(ctx.iid) + '’s “when scored” and swap it?', 'Do it', 'No'))) return;
        yield* X.whenScored(ctx.iid, 0);
        const t = yield* X.ask(iid, 'corp', 'inezA2Swap', 'Inez Delgado: swap it for which of your agendas?', X.C.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { always: true });
        if (!t || X.R.score.indexOf(ctx.iid) < 0) return;
        X.lift(ctx.iid); X.lift(t); X.C.score.push(ctx.iid); X.R.score.push(t);
        X.log({ t: 'note', side: 'corp', text: 'Inez Delgado swaps ' + X.nameOf(ctx.iid) + ' for ' + X.nameOf(t) });
        X.winCheck();
      }
    },
    bot: { inezA2: () => 'yes', inezA2Swap: (pub, me, pr) => pr.options.slice().sort((a, b) => D.CARDS[a.card].pts - D.CARDS[b.card].pts)[0].id }
  });
  S('todachine', '14006', 'Campaign. Whenever you rez an ice, the Runner takes a tag.');
  on('todachine', { on: { *rez(X, iid, ctx) { if (X.dat(ctx.iid).type === 'ice') yield* X.giveTags(1, 'Lt. Todachine'); } } });
  S('todachine_2', '14007', 'Campaign. Whenever you rez an ice, the Runner takes a tag. While they are tagged, they access 1 fewer card (at least 1).');
  on('todachine_2', {
    on: { *rez(X, iid, ctx) { if (X.dat(ctx.iid).type === 'ice') yield* X.giveTags(1, 'Lt. Todachine'); } },
    mod: { accessHQ: (X, iid, v) => X.tagged() && v > 1 ? v - 1 : v, accessRD: (X, iid, v) => X.tagged() && v > 1 ? v - 1 : v }
  });
  S('trojan', '14008', 'Campaign (a caution). When the Runner accesses it outside Archives, you lose 2 credits and a random card from HQ, and it leaves the game.');
  on('trojan', {
    onAccess(X, iid, ctx) {
      if (ctx.from === 'arch') return;
      const k = Math.min(2, X.C.credits); X.C.credits -= k;
      if (X.C.hq.length) X.toArchives(X.C.hq[Math.floor(X.rand() * X.C.hq.length)], false);
      X.lift(iid); X.wipe(X.card(iid)); X.card(iid).up = true; X.C.gone.push(iid);
      X.log({ t: 'note', side: 'corp', text: 'Trojan: the Corp loses ' + k + ' credits and a card from HQ; Trojan leaves the game' });
      ctx.seen.did = 'removed'; ctx.seen.gone = true;
    }
  });
  S('security_leak', '14009', 'Campaign (a caution). Current. Advancing a card costs the Corp 1 more.');
  on('security_leak', { mod: { advTax: (X, iid, v) => v + 1 }, botPlay: () => 1 });
  S('machicolation_a', '14010', 'Campaign.', { subs: [{ k: 'trashProg' }, { k: 'trashProg' }, { k: 's', n: 0, text: 'Trash a hardware' }, { k: 's', n: 1, text: 'The Runner loses 3 credits; end the run' }] });
  on('machicolation_a', {
    subs: [
      function* (X, iid) { const hw = X.rigOf('hardware'); if (!hw.length) return null; const t = yield* X.ask(iid, 'corp', 'machicolation', 'Machicolation: trash which hardware?', hw.map(i => X.cardOpt(i)), { always: true }); if (t && !(yield* X.saveWithConstruct(t))) X.trashRunner(t, 'Machicolation'); return null; },
      function (X) { const k = Math.min(3, X.R.credits); if (k) { X.R.credits -= k; X.log({ t: 'lose', side: 'runner', n: k, cause: 'Machicolation' }); } return 'end'; }
    ]
  });
  S('machicolation_b', '14011', 'Campaign.', { subs: [{ k: 's', n: 0, text: 'Trash a resource' }, { k: 's', n: 0, text: 'Trash a resource' }, { k: 'net', n: 1 }, { k: 'multi', do: [{ k: 'loseClick' }, { k: 'etr' }], text: 'The Runner loses a click; end the run' }] });
  on('machicolation_b', { subs: [function* (X, iid) { const r = X.rigOf('resource'); if (!r.length) return null; const t = yield* X.ask(iid, 'corp', 'machicolationB', 'Machicolation: trash which resource?', r.map(i => X.cardOpt(i)), { always: true }); if (t) yield* X.corpTrashes(t, 'Machicolation'); return null; }] });
  const oversight = (where) => ({
    *onScore(X, iid) {
      const ice = X.C.rd.filter(i => X.dat(i).type === 'ice');
      if (!ice.length) return;
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'oversight', 'Corporate Oversight: install and rez which ice free?', X.dedupe(ice.map(i => X.cardOpt(i))), { skip: 'None' });
      X.shuffleRD();
      if (!t) return;
      yield* X.corpInstall(t, { free: true, rez: true, filter: o => where === 'remote' ? (o.id === 'new' || /^r[0-9]+$/.test(o.id)) : ['hq', 'rd', 'arch'].indexOf(o.id) >= 0 });
    },
    bot: { oversight: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id }
  });
  S('oversight_a', '14012', 'Campaign (emergency). When scored, you may find an ice in R&D and install and rez it free before a remote server; shuffle. Win a game with it scored and it is destroyed.');
  on('oversight_a', oversight('remote'));
  S('oversight_b', '14013', 'Campaign (emergency). When scored, you may find an ice in R&D and install and rez it free before a central server; shuffle. Win a game with it scored and it is destroyed.');
  on('oversight_b', oversight('central'));

  /* ================================================================ RUNNER */
  const inez = (n, why) => ({
    abils: (X, iid) => [{ label: 'Inez Delgado: to your score area (0 points) — ' + why, bad: X.R.flags.stole ? null : 'Only after you stole an agenda this turn' }],
    use(X, iid) {
      X.lift(iid); X.wipe(X.card(iid)); X.card(iid).up = true; X.R.score.push(iid);
      X.log({ t: 'note', side: 'runner', text: 'Investigator Inez Delgado joins the Runner’s score area' });
      if (n === 1) { const r = X.remotes().filter(sv => sv.root.length); const sv = r[0]; if (sv) for (const i of sv.root) if (!X.card(i).rez) X.reveal('corp', [i], 'Inez Delgado'); }
      if (n === 2) X.reveal('corp', X.C.rd.slice(0, 3), 'Inez Delgado');
      if (n === 3) X.reveal('corp', X.C.hq.slice(), 'Inez Delgado');
      if (n === 4) X.reveal('corp', X.C.hq.concat(X.C.rd.slice(0, 1)), 'Inez Delgado');
    },
    botAbil: () => 2.5, botPlay: () => 2.2
  });
  S('inez_1', '14014', 'Campaign. After you steal an agenda this turn: add her to your score area (0 points) and see the cards in a remote server. Win a game with her there: data set 2 opens.', { scorePts: 0 });
  on('inez_1', inez(1, 'see a remote server'));
  S('inez_2', '14015', 'Campaign. After you steal an agenda this turn: add her to your score area (0 points) and see the top 3 of R&D. Win a game with her there: data set 5 opens.', { scorePts: 0 });
  on('inez_2', inez(2, 'see the top 3 of R&D'));
  S('inez_3', '14016', 'Campaign. After you steal an agenda this turn: add her to your score area (0 points) and see HQ. Win a game with her there: data set 8 opens.', { scorePts: 0 });
  on('inez_3', inez(3, 'see HQ'));
  S('inez_4', '14017', 'Campaign. After you steal an agenda this turn: add her to your score area (0 points) and see HQ and the top of R&D.', { scorePts: 0 });
  on('inez_4', inez(4, 'see HQ and the top of R&D'));
  const snk = {
    on: { corpDrew(X, iid, ctx) { if (ctx.basic && ctx.iids && ctx.iids.length) X.reveal('corp', [ctx.iids[0]], 'Surveillance Network Key'); } }
  };
  S('snk', '14018', 'Campaign. Whenever the Corp clicks to draw, the first card drawn is shown.');
  on('snk', Object.assign({}, snk, { botPlay: () => 0.4 }));
  S('snk_2', '14019', 'Campaign. Whenever the Corp clicks to draw, the first card drawn is shown. Once a turn, as a run on HQ or R&D succeeds, pay 2: access 1 more card.');
  on('snk_2', {
    on: Object.assign({}, snk.on, {
      *success(X, iid, ctx) {
        if ((ctx.sid !== 'hq' && ctx.sid !== 'rd') || X.card(iid).x.turn === X.g.turnN || X.avail('runner', 'any') < 2) return;
        if (!(yield* X.yn(iid, 'runner', 'snk2', 'Surveillance Network Key: pay 2 to access 1 more card?', 'Pay 2', 'No'))) return;
        X.card(iid).x.turn = X.g.turnN; X.pay('runner', 2, 'any');
        if (ctx.sid === 'hq') ctx.S.o.extraHQ = (ctx.S.o.extraHQ || 0) + 1; else ctx.S.o.extra = (ctx.S.o.extra || 0) + 1;
      }
    }),
    bot: { snk2: () => 'yes' },
    botPlay: () => 0.8
  });
  const bmi = (free) => ({
    sync: { cardsTrashed(X, iid, ctx) { if (!ctx.fromGrip || X.R.rig.indexOf(iid) < 0) return; for (const t of ctx.iids) if (X.R.heap.indexOf(t) >= 0 && X.dat(t).type === 'program') { X.lift(t); X.card(t).up = true; X.card(t).host = iid; X.R.ws.push(t); X.log({ t: 'note', side: 'runner', text: 'BMI Buffer catches ' + X.nameOf(t) }); } } },
    abils: (X, iid) => [{ label: 'BMI Buffer: install a program from it' + (free ? ' free' : ''), clicks: 2, bad: X.R.ws.some(i => X.card(i).host === iid) ? null : 'Nothing on it' }],
    *use(X, iid) { const t = yield* X.ask(iid, 'runner', 'bmi', 'BMI Buffer: install which program?', X.R.ws.filter(i => X.card(i).host === iid).map(i => X.cardOpt(i, null, free ? 'free' : X.installCost(i, 0) + ' credits', X.installBad(i) || (!free && X.avail('runner', 'program') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null)))); if (t) yield* X.runnerInstall(t, { free, from: 'bmi' }); },
    botAbil: () => 0.8, botPlay: () => 0.3
  });
  S('bmi_buffer', '14020', 'Campaign. Programs discarded or lost from your grip go on it instead of the heap. Two clicks: install one (paying for it).');
  on('bmi_buffer', bmi(false));
  S('bmi_buffer_2', '14021', 'Campaign. Programs discarded or lost from your grip go on it instead of the heap. Two clicks: install one free.');
  on('bmi_buffer_2', bmi(true));
  S('shadow_team', '14022', 'Campaign (a caution). When you draw it, it is installed at once. Whenever you start a run, trash a card from your grip. A successful run on HQ, R&D or Archives destroys it.');
  on('shadow_team', {
    sync: { runnerDrew(X, iid, ctx) { if ((ctx.iids || []).indexOf(iid) < 0) return; X.g.pending.push({ iid, f: function* (X2, i2) { if (X2.R.grip.indexOf(i2) >= 0) yield* X2.runnerInstall(i2, { free: true }); } }); } },
    on: {
      *runBegin(X, iid) { if (X.R.rig.indexOf(iid) < 0 || !X.R.grip.length) return; const t = yield* X.ask(iid, 'runner', 'shadowTeam', 'Shadow Team: trash a card from your grip', X.R.grip.map(i => X.cardOpt(i)), { always: true }); if (t) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); } },
      success(X, iid, ctx) { if (X.R.rig.indexOf(iid) >= 0 && !X.isRemote(ctx.sid)) { X.lift(iid); X.wipe(X.card(iid)); X.R.gone.push(iid); X.log({ t: 'note', side: 'runner', text: 'Shadow Team is destroyed' }); } }
    },
    bot: { shadowTeam: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[a.card] || {}).cost || 0) - ((D.CARDS[b.card] || {}).cost || 0))[0].id },
    botPlay: () => -1
  });
  S('net_watchlist', '14023', 'Campaign (a caution). Current. Every icebreaker break costs the Runner 2 more.');
  on('net_watchlist', { mod: { breakExtra: (X, iid, v) => v + 2 }, botPlay: () => 1 });
  const masque = (b) => ({
    abils: (X) => [{ label: 'The Masque: trash it — run, and a click back', clicks: 1, bad: noRun(X) ? 'Nowhere to run' : null }],
    *use(X, iid) {
      X.trashRunner(iid, 'used'); X.linger(iid);
      X.R.clicks++; X.log({ t: 'clicks', side: 'runner', n: 1, k: X.card(iid).k });
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'The Masque: run which server?', runOpts(X));
      if (sid) yield* X.run(sid, { card: iid, via: X.card(iid).k });
    },
    *runEnd(X, iid, ctx) {
      if (ctx.how !== 'success') return;
      if (!b) { X.drawRunner(1, 'masque_a'); return; }
      if (ctx.S.o.again) return;
      const opts = runOpts(X).filter(o => o.id !== ctx.S.sid);
      const sid = opts.some(o => !o.bad) ? yield* X.ask(iid, 'runner', 'masqueB', 'The Masque: run another server now?', opts, { skip: 'No' }) : null;
      if (sid) yield* X.run(sid, { card: iid, via: 'masque_b', again: true });
    },
    bot: { masqueB: (pub, me, pr) => (pr.options.find(o => o.id === 'arch' && !o.bad) || {}).id || 'skip' },
    botAbil: () => 1, botPlay: () => 0.6
  });
  S('masque_a', '14024', 'Campaign. A click, trash it: run any server and gain a click; if the run succeeds, draw a card.');
  on('masque_a', masque(false));
  S('masque_b', '14025', 'Campaign. A click, trash it: run any server and gain a click; if the run succeeds, you may then run another server.');
  on('masque_b', masque(true));
  S('sneakdoor_a', '14026', 'Campaign (emergency). Two clicks: run a remote server; if it succeeds, it counts as a run on HQ, R&D or Archives.');
  on('sneakdoor_a', {
    abils: (X) => [{ label: 'Sneakdoor Prime: run a remote, as a central', clicks: 2, bad: X.remotes().some(sv => !X.runBad(sv.id, 2)) ? null : 'No remote server to run' }],
    *use(X, iid) { const sid = yield* X.ask(iid, 'runner', 'runOn', 'Sneakdoor Prime: run which remote?', runOpts(X).filter(o => /^r[0-9]+$/.test(o.id))); if (sid) yield* X.run(sid, { via: 'sneakdoor_a', asPick: ['hq', 'rd', 'arch'], asWhy: 'Sneakdoor Prime' }); },
    bot: { asServer: () => 'hq' },
    botAbil: () => 1.2, botPlay: () => 0.6
  });
  S('sneakdoor_b', '14027', 'Campaign (emergency). Two clicks: run HQ, R&D or Archives; if it succeeds, it counts as a run on a remote server.');
  on('sneakdoor_b', {
    abils: (X) => [{ label: 'Sneakdoor Prime: run a central, as a remote', clicks: 2, bad: X.remotes().length ? null : 'No remote server' }],
    *use(X, iid) { const sid = yield* X.ask(iid, 'runner', 'runOn', 'Sneakdoor Prime: run which central server?', runOpts(X).filter(o => ['hq', 'rd', 'arch'].indexOf(o.id) >= 0)); if (sid) yield* X.run(sid, { via: 'sneakdoor_b', asPick: 'remote', asWhy: 'Sneakdoor Prime' }); },
    botAbil: () => 1, botPlay: () => 0.6
  });

  D.SET_LOADED.tdc = true;
})(typeof window !== 'undefined' ? window : this);
