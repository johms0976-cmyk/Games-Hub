'use strict';
/* Honor and Profit (2014 deluxe: Jinteki and Criminals, 55 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. Readings decided here:
 *   - Shiro's "the Runner accesses R&D" is the top card (plus the usual
 *     extras), in the middle of the run; the run then goes on.
 *   - Komainu's extra subroutines are counted as each encounter begins.
 *   - Push Your Luck: the Runner chooses in secret first, then the Corp guesses.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const kw = (X, i, re) => re.test(X.dat(i).kw || '');
  const notRemote = (X, iid, E) => { const sv = X.serverOf(E.iid); return !sv || !X.isRemote(sv.id); };
  const anyRun = (name) => ({
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, { card: iid, via: X.card(iid).k });
    }
  });
  const ambushPsi = function* (X, iid) {
    if (yield* X.psi('Psychic Field')) yield* X.damage('net', X.R.grip.length, 'Psychic Field');
  };
  /* A card trashed while accessed, kept by the Runner as points (Chairman Hiro). */
  function* toRunnerScore(X, iid, ctx, pts) {
    const c = X.card(iid);
    X.lift(iid); X.wipe(c); c.up = true; X.R.score.push(iid);
    ctx.seen.did = 'stolen';
    X.log({ t: 'steal', k: c.k, pts, total: X.points('runner') });
    X.winCheck();
  }

  /* ================================================================ JINTEKI */
  S('harmony', '05001', 'Each player needs 1 agenda point fewer to win.');
  on('harmony', { mod: { winPts: (X, iid, v) => v - 1 } });
  S('nisei_div', '05002', 'Whenever you and the Runner reveal secretly spent credits, gain 1 credit.');
  on('nisei_div', { on: { psi(X) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'nisei_div' }); } } });
  S('tennin', '05003', 'When your turn begins, if the Runner made no successful run on their last turn, you may put an advancement token on an installed card.');
  on('tennin', {
    on: {
      *corpTurnBegin(X, iid) {
        if (X.R.last.success || X.g.round < 2) return;
        const ts = X.installedCorp();
        const t = yield* X.ask(iid, 'corp', 'tennin', 'Tennin Institute: put an advancement token on which installed card?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')), { skip: 'None' });
        if (t) { X.card(t).adv++; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'tennin' }); }
      }
    },
    bot: { tennin: (pub, me, pr) => (pr.options.find(o => me.mine && D.CARDS[me.mine[o.id]] && D.CARDS[me.mine[o.id]].type === 'agenda') || pr.options.find(o => me.mine && D.CARDS[me.mine[o.id]] && D.CARDS[me.mine[o.id]].advable) || {}).id || 'skip' }
  });
  S('house_knives', '05004', 'When scored, 3 agenda counters. Spend one during a run (once a run): 1 net damage.', { scoreCounters: 3 });
  on('house_knives', {
    winOpts: (X, iid) => X.card(iid).agenda > 0 && X.g.run && !X.g.run.knives ? [{ label: 'House of Knives: spend a counter — 1 net damage' }] : [],
    *winUse(X, iid) { X.spendAgenda(iid); X.g.run.knives = true; yield* X.damage('net', 1, 'House of Knives'); },
    botWin: () => true
  });
  S('med_breakthrough', '05005', 'Needs one advancement fewer for each Medical Breakthrough already scored or stolen.');
  on('med_breakthrough', { self: { advNeed: (X, iid, v) => v - X.C.score.concat(X.R.score).filter(i => X.card(i).k === 'med_breakthrough').length } });
  S('philotic', '05006', 'When scored, 1 net damage for each agenda in the Runner’s score area. One per deck.');
  on('philotic', { *onScore(X) { const n = X.R.score.filter(i => X.dat(i).type === 'agenda').length; if (n) yield* X.damage('net', n, 'Philotic Entanglement'); } });
  S('future_perfect', '05007', 'Accessed when not installed: a psi game — if the bids differ, it cannot be stolen this access.');
  on('future_perfect', { *onAccess(X, iid, ctx) { if (ctx.installed) return; if (yield* X.psi('The Future Perfect')) { ctx.seen.noSteal = true; X.log({ t: 'note', side: 'corp', text: 'The Future Perfect cannot be stolen this time' }); } } });
  S('chairman_hiro', '05008', 'The Runner’s maximum hand size is 2 lower. Trashed while accessed: it goes to the Runner’s score area as 2 agenda points.', { scorePts: 2 });
  on('chairman_hiro', { mod: { runHand: (X, iid, v) => v - 2 }, *onTrashed(X, iid, ctx) { yield* toRunnerScore(X, iid, ctx, 2); } });
  S('mhc', '05009', 'Gain 1 credit when your turn begins. The Runner’s maximum hand size is 1 higher.');
  on('mhc', { on: { corpTurnBegin(X) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'mhc' }); } }, mod: { runHand: (X, iid, v) => v + 1 } });
  S('psychic_field', '05010', 'Ambush. Exposed or accessed while installed: a psi game — if the bids differ, 1 net damage per card in the grip.');
  on('psychic_field', {
    *onAccess(X, iid, ctx) { if (!ctx.installed) return; X.log({ t: 'ambush', k: 'psychic_field' }); yield* ambushPsi(X, iid); },
    on: {}
  });
  /* Psychic Field also answers an expose while face down: a watcher on the Corp's identity side. */
  D.script('psychic_field', { exposed: ambushPsi });
  S('shikyu', '05011', 'Ambush. Accessed anywhere but R&D: you spend any number of credits; the Runner takes that much net damage, or adds it to their score area as −1 agenda point.', { scorePts: -1 });
  on('shikyu', {
    *onAccess(X, iid, ctx) {
      if (ctx.from === 'rd') return;
      const opts = [];
      for (let n = 0; n <= Math.min(X.C.credits, 12); n++) opts.push({ id: String(n), label: n ? 'Spend ' + n : 'Nothing' });
      const n = +(yield* X.ask(iid, 'corp', 'shikyu', 'Shi.Kyū: spend how much?', opts, { always: true, pub: 'Shi.Kyū — the Corp decides' }));
      if (!n) return;
      X.pay('corp', n, 'any'); X.log({ t: 'ambush', k: 'shikyu' });
      const a = yield* X.ask(iid, 'runner', 'shikyuAns', 'Shi.Kyū: take ' + n + ' net damage, or take it as −1 agenda point?', [{ id: 'dmg', label: 'Take ' + n + ' net damage' }, { id: 'pts', label: 'Take it: −1 agenda point' }], { always: true });
      if (a === 'pts') { yield* toRunnerScore(X, iid, ctx, -1); ctx.seen.gone = true; return; }
      yield* X.damage('net', n, 'Shi.Kyū');
    },
    bot: { shikyu: (pub, me, pr) => String(Math.min(pr.options.length - 1, Math.max(0, pub.runner.gripN))), shikyuAns: (pub, me, pr) => +((pr.why.match(/take (\d+)/) || [])[1] || 0) >= pub.runner.gripN ? 'pts' : 'dmg' }
  });
  S('tenma_line', '05012', 'A click: swap two installed ice.');
  on('tenma_line', {
    abils: (X) => [{ label: 'Tenma Line: swap two installed ice', clicks: 1, bad: X.installedCorp().filter(i => X.dat(i).type === 'ice').length >= 2 ? null : 'Needs two ice' }],
    *use(X, iid) {
      const ice = () => X.installedCorp().filter(i => X.dat(i).type === 'ice').map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + (X.serverOf(i).ice.indexOf(i) + 1) + ' from the server'));
      const a = yield* X.ask(iid, 'corp', 'tenmaA', 'Tenma Line: swap which ice…', ice());
      const b = a && (yield* X.ask(iid, 'corp', 'tenmaB', '… with which?', ice().filter(o => o.id !== a)));
      if (!a || !b) return;
      const sa = X.serverOf(a), sb = X.serverOf(b), ia = sa.ice.indexOf(a), ib = sb.ice.indexOf(b);
      sa.ice[ia] = b; sb.ice[ib] = a;
      X.log({ t: 'swapIce', a: sa.id, b: sb.id, side: 'corp' });
    },
    botAbil: () => -1
  });
  S('cerebral_cast', '05013', 'Only if the Runner made a successful run on their last turn. A psi game: if the bids differ, the Runner takes 1 brain damage or a tag.');
  on('cerebral_cast', {
    playBad: (X) => X.R.last.success ? null : 'Only after a successful run on the Runner’s last turn',
    *play(X, iid) {
      if (!(yield* X.psi('Cerebral Cast'))) return;
      const a = yield* X.ask(iid, 'runner', 'cerebralCast', 'Cerebral Cast: take 1 brain damage, or a tag?', [{ id: 'brain', label: '1 brain damage' }, { id: 'tag', label: 'A tag' }], { always: true });
      if (a === 'brain') yield* X.damage('brain', 1, 'Cerebral Cast'); else yield* X.giveTags(1, 'Cerebral Cast');
    },
    bot: { cerebralCast: () => 'tag' },
    botPlay: () => 2
  });
  S('mrf', '05014', 'Gain 8 credits; the Runner gains 3.');
  on('mrf', { play(X) { X.gain('corp', 8); X.gain('runner', 3); X.log({ t: 'gain', side: 'runner', n: 3, k: 'mrf' }); }, botPlay: (pub) => pub.corp.credits < 10 ? 4 : 1 });
  S('mushin', '05015', 'Double. Install an agenda, asset or upgrade from HQ in a new remote server with 3 advancement tokens; it cannot be rezzed or scored until your next turn.');
  on('mushin', {
    playBad: (X) => X.C.hq.some(i => ['agenda', 'asset', 'upgrade'].indexOf(X.dat(i).type) >= 0) ? null : 'No agenda, asset or upgrade in HQ',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'mushin', 'Mushin No Shin: install which card?', X.C.hq.filter(i => ['agenda', 'asset', 'upgrade'].indexOf(X.dat(i).type) >= 0).map(i => X.cardOpt(i)));
      if (!t) return;
      yield* X.corpInstall(t, { to: 'new' });
      if (!X.isInstalled(t)) return;
      X.card(t).adv += 3; X.card(t).x.lockUntil = X.g.turnN + 2;
      X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: null, by: 'mushin', x: 3 });
    },
    bot: { mushin: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda' && D.CARDS[o.card].adv <= 4) || pr.options[0]).id },
    botPlay: () => 2.6
  });
  S('inazuma', '05016', '', { subs: [{ k: 's', n: 0, text: 'The next ice the Runner meets this run cannot have its subroutines broken' }, { k: 's', n: 1, text: 'The Runner cannot jack out until their next encounter begins' }] });
  on('inazuma', {
    subs: [function (X, iid) { X.g.run.inazumaNext = iid; return null; }, function (X) { X.g.run.noJackEnc = true; return null; }],
    on: { encounter(X, iid, ctx) { if (ctx.S.inazumaNext && ctx.iid !== ctx.S.inazumaNext) { ctx.S.inazumaNext = null; ctx.E.noBreak = true; } } },
    mod: { unbreakable: (X, iid, v, ctx) => v || !!(X.g.run && X.g.run.enc && X.g.run.enc.noBreak && X.g.run.enc.iid === ctx.iid) }
  });
  S('komainu', '05017', 'As the Runner meets it, it gains a “1 net damage” subroutine for each card in their grip.', { subs: [] });
  on('komainu', { onEnc(X, iid, ctx) { const n = X.R.grip.length; for (let k = 0; k < n; k++) { ctx.E.subs.push({ k: 'net', n: 1 }); ctx.E.broken.push(false); } return null; } });
  S('pup', '05018', '', { subs: [{ k: 'unless', pay: 1, do: { k: 'net', n: 1 } }, { k: 'unless', pay: 1, do: { k: 'net', n: 1 } }] });
  S('shiro', '05019', '', { subs: [{ k: 's', n: 0, text: 'The Corp looks at the top 3 cards of R&D and arranges them' }, { k: 's', n: 1, text: 'Unless the Corp pays 1, the Runner accesses R&D' }] });
  on('shiro', {
    subs: [
      function* (X, iid) {
        const top = X.C.rd.slice(0, 3);
        const order = []; let left = top.slice();
        while (left.length > 1) { const t = yield* X.ask(iid, 'corp', 'shiroOrder', 'Shiro: which card goes ' + (order.length ? 'next' : 'on top') + '?', left.map(i => X.cardOpt(i))); order.push(t); left = left.filter(i => i !== t); }
        order.push(...left); X.C.rd.splice(0, top.length, ...order);
        X.log({ t: 'precog', n: top.length });
        return null;
      },
      function* (X, iid) {
        if (X.C.credits >= 1 && (yield* X.yn(iid, 'corp', 'shiroPay', 'Shiro: pay 1, or the Runner accesses R&D?', 'Pay 1', 'Let them in'))) { X.pay('corp', 1, 'any'); return null; }
        const n = Math.min(X.C.rd.length, X.mod('accessRD', 1 + X.rigCards('rd_interface').length, {}));
        for (const t of X.C.rd.slice(0, n)) { if (!X.g.run) break; if (X.C.rd.indexOf(t) >= 0) yield* X.accessOne(t, 'rd', 'rd'); }
        return null;
      }
    ],
    bot: { shiroPay: () => 'yes' }
  });
  S('susanoo', '05020', '', { subs: [{ k: 's', n: 0, text: 'Unless the run is on Archives, the Runner moves to the outermost ice of Archives; no jacking out until their next encounter' }] });
  on('susanoo', {
    subs: [function (X) {
      if (X.g.run.sid === 'arch') return null;
      X.g.run.sid = 'arch'; X.g.run.noJackEnc = true;
      X.log({ t: 'note', side: 'corp', text: 'Susanoo-no-Mikoto sends the Runner to Archives' });
      return { moved: 'arch', outer: true };
    }]
  });
  S('neotokyo', '05021', 'The first time each turn an advancement token goes on a card in this server’s root, gain 1 credit. One region per server.');
  on('neotokyo', { on: { advanced(X, iid, ctx) { const sv = X.serverOf(iid); if (!sv || sv.root.indexOf(ctx.iid) < 0 || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'neotokyo' }); } } });
  S('tori', '05022', 'The first time each run against this server you would do net damage, you may pay 2 to do 1 brain damage instead.');
  on('tori', {
    *replaceDamage(X, iid, ctx) {
      const sv = X.serverOf(iid);
      if (ctx.kind !== 'net' || !X.g.run || !sv || X.g.run.sid !== sv.id || X.g.run.tori || X.C.credits < 2) return null;
      X.g.run.tori = true;
      if (!(yield* X.yn(iid, 'corp', 'tori', 'Tori Hanzō: pay 2 to make this ' + ctx.n + ' net damage 1 brain damage instead?', 'Pay 2', 'Leave it'))) return null;
      X.pay('corp', 2, 'any');
      return { kind: 'brain', n: 1, cause: 'Tori Hanzō' };
    },
    bot: { tori: (pub, me, pr) => +((pr.why.match(/this (\d+)/) || [])[1] || 0) <= 2 ? 'yes' : 'no' }
  });
  S('plan_b', '05023', 'Ambush. Can be advanced. When accessed, you may show and score an agenda from HQ needing no more advancements than are on it.', { advable: true });
  on('plan_b', {
    *onAccess(X, iid, ctx) {
      const n = X.card(iid).adv;
      const ag = X.C.hq.filter(i => X.dat(i).type === 'agenda' && X.dat(i).adv <= n);
      if (!ag.length) return;
      const t = yield* X.ask(iid, 'corp', 'planB', 'Plan B: score an agenda from HQ?', ag.map(i => X.cardOpt(i, null, X.dat(i).adv + ' advancements')), { skip: 'No', pub: 'Plan B — the Corp decides' });
      if (!t) return;
      X.reveal('corp', [t], 'Plan B'); X.log({ t: 'ambush', k: 'plan_b' }); ctx.seen.did = 'sprung';
      yield* X.scoreAgenda(t);
    },
    bot: { planB: (pub, me, pr) => pr.options.slice().sort((a, b) => (D.CARDS[b.card].pts || 0) - (D.CARDS[a.card].pts || 0))[0].id }
  });
  S('guard', '05024', 'Cannot be bypassed.', { noBypass: true, subs: [{ k: 'etr' }] });
  S('rainbow', '05025', '', { subs: [{ k: 'etr' }] });
  S('div_portfolio', '05026', 'Gain 1 credit for each remote server with a card in its root.');
  on('div_portfolio', { play(X) { const n = X.remotes().filter(sv => sv.root.length).length; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'div_portfolio' }); }, botPlay: (pub) => pub.corp.servers.filter(s => /^r\d/.test(s.id) && s.root.length).length >= 3 ? 3 : 0.3 });
  S('fast_track', '05027', 'Find an agenda in R&D, show it, take it into HQ; shuffle R&D.');
  on('fast_track', {
    playBad: (X) => X.C.rd.some(i => X.dat(i).type === 'agenda') ? null : 'No agenda in R&D',
    *play(X, iid) {
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'fastTrack', 'Fast Track: take which agenda?', X.dedupe(X.C.rd.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i))));
      if (t) { X.lift(t); X.C.hq.push(t); X.reveal('corp', [t], 'Fast Track'); }
      X.shuffleRD();
    },
    botPlay: () => 0.6
  });

  /* ================================================================ CRIMINALS */
  S('iain', '05028', 'When your turn begins, gain 2 credits if the Corp has more agenda points than you.');
  on('iain', { on: { runnerTurnBegin(X) { if (X.points('corp') > X.points('runner')) { X.gain('runner', 2); X.log({ t: 'gain', side: 'runner', n: 2, k: 'iain' }); } } } });
  S('ken_tenma', '05029', 'The first time each turn you play a run event, gain 1 credit.');
  on('ken_tenma', { on: { play(X, iid, ctx) { if (ctx.side === 'runner' && kw(X, ctx.iid, /\bRun\b/) && !X.R.flags.ken) { X.R.flags.ken = true; X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'ken_tenma' }); } } } });
  S('silhouette', '05030', 'The first time each turn you make a successful run on HQ, you may expose a card.');
  on('silhouette', {
    on: {
      *success(X, iid, ctx) {
        if (ctx.sid !== 'hq' || X.R.flags.silhouette) return;
        X.R.flags.silhouette = true;
        const ts = X.installedCorp().filter(i => !X.card(i).rez);
        const t = yield* X.ask(iid, 'runner', 'expose', 'Silhouette: expose a card?', ts.map(i => ({ id: i, label: (X.dat(i).type === 'ice' ? 'Ice' : 'A card') + ' in ' + X.srvName(X.serverOf(i)), sub: X.card(i).adv ? X.card(i).adv + ' advanced' : null })), { skip: 'No' });
        if (t) yield* X.expose(t, 'Silhouette');
      }
    }
  });
  S('calling_favors', '05031', 'Gain 1 credit for each installed connection.');
  on('calling_favors', { play(X) { const n = X.rigOf('resource').filter(i => kw(X, i, /Connection/)).length; X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'calling_favors' }); }, botPlay: (pub) => pub.runner.rig.filter(r => /Connection/.test(D.CARDS[r.k].kw || '')).length >= 2 ? 2 : -1 });
  S('early_bird', '05032', 'Only as your first click. Gain a click and run any server.');
  on('early_bird', Object.assign(anyRun('Early Bird'), {
    playBad: (X) => X.R.flags.acted ? 'Only as your first click' : (X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null),
    *play(X, iid) {
      X.R.clicks++;
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Early Bird: run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })));
      if (sid) yield* X.run(sid, { card: iid, via: 'early_bird' });
    },
    botPlay: () => 2
  }));
  S('express_delivery', '05033', 'Look at the top 4 cards of your stack, take one into your grip, shuffle.');
  on('express_delivery', {
    *play(X, iid) {
      const top = X.R.stack.slice(0, 4);
      if (!top.length) return;
      X.g.revealN++;
      const t = yield* X.ask(iid, 'runner', 'express', 'Express Delivery: take which card?', top.map(i => X.cardOpt(i)), { always: true });
      if (t) { X.lift(t); X.R.grip.push(t); }
      X.shuffleStack(true);
    },
    botPlay: () => 1.2
  });
  S('feint', '05034', 'Run HQ, slipping past the first 2 ice you meet. If successful, you do not access HQ.');
  on('feint', {
    playBad: (X) => X.runBad('hq', 1),
    *play(X, iid) { yield* X.run('hq', { card: iid, via: 'feint' }); },
    runEnc(X, iid, ctx) { ctx.S.feintN = (ctx.S.feintN || 0) + 1; if (ctx.S.feintN <= 2) ctx.E.bypass = 'feint'; return null; },
    success() { return 'replace'; },
    botPlay: () => -1
  });
  S('legwork', '05035', 'Run HQ. If successful, access 2 more cards from it.');
  on('legwork', { playBad: (X) => X.runBad('hq', 1), *play(X, iid) { yield* X.run('hq', { card: iid, via: 'legwork', extraHQ: 2 }); }, botPlay: (pub) => pub.corp.hqN >= 3 ? 3 : 1 });
  S('planned_assault', '05036', 'Double. Find a run event in your stack and play it (paying for it, not its extra costs); shuffle.');
  on('planned_assault', {
    playBad: (X) => X.R.stack.some(i => X.dat(i).type === 'event' && kw(X, i, /\bRun\b/)) ? null : 'No run event in your stack',
    *play(X, iid) {
      X.g.revealN++;
      const ok = i => X.avail('runner', 'event', { run: true }) >= X.playCost(i) && !(D.SCRIPT[X.card(i).k] && D.SCRIPT[X.card(i).k].playBad && D.SCRIPT[X.card(i).k].playBad(X, i));
      const t = yield* X.ask(iid, 'runner', 'plannedAssault', 'Planned Assault: play which run event?', X.dedupe(X.R.stack.filter(i => X.dat(i).type === 'event' && kw(X, i, /\bRun\b/)).map(i => X.cardOpt(i, null, X.playCost(i) + ' credits', ok(i) ? null : 'Cannot be played now'))));
      if (t) { X.lift(t); X.R.grip.push(t); X.shuffleStack(); yield* X.playEvent(t); } else X.shuffleStack();
    },
    botPlay: () => 0.8
  });
  S('logos', '05037', '+1 memory and +1 hand size. Whenever the Corp scores an agenda, you may take a card from your stack into your grip. One console only.', { console: true, memory: 1, handPlus: 1 });
  on('logos', {
    on: {
      *score(X, iid) {
        if (!X.R.stack.length) return;
        X.g.revealN++;
        const t = yield* X.ask(iid, 'runner', 'logos', 'Logos: take a card from your stack?', X.dedupe(X.R.stack.map(i => X.cardOpt(i))), { skip: 'No' });
        if (t) { X.lift(t); X.R.grip.push(t); }
        X.shuffleStack();
      }
    },
    bot: { logos: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id }
  });
  S('public_terminal', '05038', '1 recurring credit for playing run events.', { recur: { n: 1, for: 'runEvent' } });
  S('unregistered_sw', '05039', 'Only after a successful run on HQ this turn. Two clicks: trash a rezzed bioroid, clone, executive or sysop in a remote server’s root.');
  on('unregistered_sw', {
    abils: (X) => { const ts = [].concat(...X.remotes().map(sv => sv.root)).filter(i => X.card(i).rez && kw(X, i, /Bioroid|Clone|Executive|Sysop/)); return [{ label: 'Unregistered S&W ’35: trash a rezzed bioroid, clone, executive or sysop', clicks: 2, bad: !X.R.flags.hqSuccess ? 'Only after a successful run on HQ this turn' : ts.length ? null : 'No target' }]; },
    *use(X, iid) {
      const ts = [].concat(...X.remotes().map(sv => sv.root)).filter(i => X.card(i).rez && kw(X, i, /Bioroid|Clone|Executive|Sysop/));
      const t = yield* X.ask(iid, 'runner', 'sw35', 'Unregistered S&W ’35: trash which?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (t) { X.log({ t: 'trash', side: 'corp', k: X.card(t).k, price: 0, by: 'unregistered_sw' }); X.toArchives(t, true); }
    },
    botAbil: () => 3
  });
  S('window', '05040', 'A click: draw the bottom card of your stack.');
  on('window', { abils: (X) => [{ label: 'Window: draw from the bottom of your stack', clicks: 1, bad: X.R.stack.length ? null : 'Your stack is empty' }], use(X) { X.R.grip.push(X.R.stack.pop()); X.log({ t: 'draw', side: 'runner', n: 1, why: 'window' }); }, botAbil: () => 0.5 });
  S('alias', '05041', '1 credit: break one sentry subroutine. 2 credits: +3 strength. Not on ice protecting a remote server.', { brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 2, by: 3 } });
  on('alias', { canBreak: notRemote });
  S('breach', '05042', '2 credits: break up to three barrier subroutines. 2 credits: +4 strength. Not on ice protecting a remote server.', { brk: { type: 'barrier', cost: 2, n: 3 }, pump: { cost: 2, by: 4 } });
  on('breach', { canBreak: notRemote });
  S('bug', '05043', 'Install only after a successful run on HQ this turn. Whenever the Corp draws a card, you may pay 2 to see it.');
  on('bug', {
    installBad: (X) => X.R.flags.hqSuccess ? null : 'Only after a successful run on HQ this turn',
    on: {
      *corpDrew(X, iid, ctx) {
        for (const t of ctx.iids || []) {
          if (X.avail('runner', 'any') < 2) break;
          if (yield* X.yn(iid, 'runner', 'bug', 'Bug: pay 2 to see the card the Corp drew?', 'Pay 2', 'No')) { X.pay('runner', 2, 'any'); X.reveal('corp', [t], 'Bug'); }
        }
      }
    },
    bot: { bug: () => 'no' }
  });
  S('gingerbread', '05044', '1 credit: break one subroutine on a tracer ice. 2 credits: +3 strength.', { brk: { type: 'any', cost: 1, n: 1 }, pump: { cost: 2, by: 3 } });
  on('gingerbread', { canBreak: (X, iid, E) => kw(X, E.iid, /Tracer/) });
  S('grappling_hook', '05045', 'Trash it: break every subroutine on an ice but one.');
  on('grappling_hook', {
    encOpts: (X, iid, E) => { const open = E.broken.map((b, k) => b ? null : k).filter(k => k != null); return open.length >= 2 ? [{ kind: 'all', subs: open.slice(1), label: 'Grappling Hook: trash it — break all but one subroutine', cost: 0 }] : []; },
    *encUse(X, iid, n, E) {
      const open = E.broken.map((b, k) => b ? null : k).filter(k => k != null);
      const keep = yield* X.ask(iid, 'runner', 'hookKeep', 'Grappling Hook: which subroutine stays?', open.map(k => ({ id: String(k), label: X.subText(E.subs[k]) })), { always: true });
      X.trashRunner(iid, 'used');
      const won = yield* X.breaking(E, open.filter(k => String(k) !== keep));
      for (const k of won) E.broken[k] = true;
      E.brokeAny = true;
      X.log({ t: 'break', how: 'grappling_hook', iid: E.iid, subs: won });
    },
    bot: { hookKeep: (pub, me, pr) => (pr.options.find(o => !/End the run/.test(o.label)) || pr.options[0]).id }
  });
  S('passport', '05046', '1 credit: break one code gate subroutine. 2 credits: +2 strength. Not on ice protecting a remote server.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 2, by: 2 } });
  on('passport', { canBreak: notRemote });
  S('push_luck', '05047', 'Spend any number of credits in secret; the Corp guesses even or odd. If it guesses wrong, gain twice what you spent.');
  on('push_luck', {
    *play(X, iid) {
      const most = Math.min(X.avail('runner', 'any'), 20);
      const opts = []; for (let n = 0; n <= most; n++) opts.push({ id: String(n), label: 'Spend ' + n });
      const n = +(yield* X.ask(iid, 'runner', 'pushLuck', 'Push Your Luck: spend how much, in secret?', opts, { always: true, pub: 'The Runner chooses in secret' }));
      const guess = yield* X.ask(iid, 'corp', 'pushGuess', 'Push Your Luck: the Runner has spent a secret amount. Even or odd?', [{ id: 'even', label: 'Even' }, { id: 'odd', label: 'Odd' }], { always: true });
      X.pay('runner', n, 'any');
      const right = (n % 2 === 0) === (guess === 'even');
      X.log({ t: 'note', side: 'runner', text: 'Push Your Luck: the Runner spent ' + n + ', the Corp guessed ' + guess + ' — ' + (right ? 'right' : 'wrong') });
      if (!right) { X.gain('runner', 2 * n); X.log({ t: 'gain', side: 'runner', n: 2 * n, k: 'push_luck' }); }
    },
    bot: { pushLuck: (pub, me, pr) => String(Math.min(pr.options.length - 1, 3)), pushGuess: (pub, me) => (pub.turnN % 2 ? 'odd' : 'even') },
    botPlay: () => 0.5
  });
  S('security_testing', '05048', 'When your turn begins you may choose a server. The first successful run on it each turn: instead of accessing, gain 2 credits.');
  on('security_testing', {
    on: {
      *runnerTurnBegin(X, iid) {
        const sid = yield* X.ask(iid, 'runner', 'secTest', 'Security Testing: choose a server for this turn?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name })), { skip: 'None' });
        X.card(iid).x.srv = sid || null; X.card(iid).x.done = false;
      },
      success(X, iid, ctx) {
        const x = X.card(iid).x;
        if (!x.srv || x.done || ctx.sid !== x.srv || ctx.S.replace) return;
        x.done = true;
        ctx.S.replace = function* () { X.gain('runner', 2); X.log({ t: 'gain', side: 'runner', n: 2, k: 'security_testing' }); };
      }
    },
    show: (X, iid) => X.card(iid).x.srv ? 'on ' + X.srvName(X.server(X.card(iid).x.srv)) : null,
    bot: { secTest: (pub) => { const r = pub.corp.servers.filter(s => /^r\d/.test(s.id) && !s.root.length && !s.ice.length); return r.length ? r[0].id : 'arch'; } },
    botPlay: () => 1.6
  });
  S('theophilius', '05049', 'When installed, you lose every credit in your pool. Your maximum hand size equals your credits.');
  on('theophilius', { onInstall(X) { const n = X.R.credits; X.R.credits = 0; if (n) X.log({ t: 'lose', side: 'runner', n }); }, mod: { runHand: (X) => X.R.credits }, botPlay: () => -1 });
  S('trimaf', '05050', 'Once a turn, a click: gain 2 credits. When it is trashed, you take 3 meat damage.');
  on('trimaf', {
    abils: () => [{ label: 'Tri-maf Contact: gain 2', clicks: 1, once: 'tm' }],
    use(X) { X.gain('runner', 2); X.log({ t: 'gain', side: 'runner', n: 2, k: 'trimaf' }); },
    *whenTrashed(X) { yield* X.damage('meat', 3, 'Tri-maf Contact'); },
    botAbil: () => 2.2,
    botPlay: () => 1.4
  });
  S('mass_install', '05051', 'Install up to 3 programs from your grip (paying for them).');
  on('mass_install', {
    *play(X, iid) {
      for (let n = 0; n < 3; n++) {
        const progs = X.R.grip.filter(i => X.dat(i).type === 'program');
        const t = yield* X.ask(iid, 'runner', 'massInstall', 'Mass Install: install a program (' + (n + 1) + ' of up to 3)?', progs.map(i => X.cardOpt(i, null, X.installCost(i, 0) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null))), { skip: 'Done' });
        if (!t) break;
        yield* X.runnerInstall(t, {});
      }
    },
    botPlay: (pub, me) => (me.hand || []).filter(h => D.CARDS[h.k].type === 'program').length >= 2 ? 2.4 : -1
  });
  S('qcoherence', '05052', '+1 memory. Trashed whenever an installed program is trashed.', { memory: 1 });
  S('overmind', '05053', 'When installed, a power counter for each memory left free. Spend a counter: break one subroutine. 1 credit: +1 strength.', { brk: { type: 'any', cost: 0, n: 1, counters: true }, pump: { cost: 1, by: 1 } });
  on('overmind', { onInstall(X, iid) { const n = Math.max(0, X.muTotal() - X.muUsed()); X.card(iid).power = n; X.log({ t: 'power', k: 'overmind', n }); } });
  S('oracle_may', '05054', 'Once a turn, a click: name a card type and show the top of your stack. If it is that type, draw it and gain 2 credits; otherwise it is trashed.');
  on('oracle_may', {
    abils: (X) => [{ label: 'Oracle May: name a type, turn over the top card', clicks: 1, once: 'om', bad: X.R.stack.length ? null : 'Your stack is empty' }],
    *use(X, iid) {
      const ty = yield* X.ask(iid, 'runner', 'oracle', 'Oracle May: name a card type', ['event', 'hardware', 'program', 'resource'].map(x => ({ id: x, label: x })), { always: true });
      const t = X.R.stack[0];
      if (!t) return;
      X.reveal('runner', [t], 'Oracle May');
      if (X.dat(t).type === ty) { X.drawRunner(1, 'oracle_may'); X.gain('runner', 2); X.log({ t: 'gain', side: 'runner', n: 2, k: 'oracle_may' }); }
      else { X.lift(t); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'mill', k: 'oracle_may', side: 'runner' }); }
    },
    bot: { oracle: () => 'event' },
    botAbil: () => 0.9
  });
  S('donut', '05055', 'Every operation and event costs 1 more to play.');
  on('donut', { mod: { playCost: (X, iid, v, ctx) => ['operation', 'event'].indexOf(X.dat(ctx.iid).type) >= 0 ? v + 1 : v }, botPlay: () => 0.4 });

  D.SET_LOADED.hap = true;
})(typeof window !== 'undefined' ? window : this);
