'use strict';
/* Order and Chaos (2015 deluxe: Weyland and Anarchs, 55 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. Readings decided here:
 *   - Wormhole and Orion's "resolve a subroutine on another rezzed ice":
 *     the Corp picks the ice and the subroutine; it fires as if on that ice.
 *   - Hivemind's counters count for Medium, Nerve Agent, Darwin and
 *     Datasucker (which may spend them); other virus cards read their own.
 *   - Mark Yale sees agenda counters spent by any card.
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
  /* Ice that can be advanced, 3 cheaper to rez per token. */
  const cheaper = { self: { rezCost: (X, iid, v) => v - 3 * X.advOf(iid) } };
  /* Fire a subroutine of another rezzed ice (Wormhole, Orion). */
  function* wormhole(X, iid, ctx) {
    /* A Wormhole may resolve an Orion's Wormhole-like subroutine — but not forever. */
    if ((X.g.run && X.g.run.worm || 0) >= 2) return null;
    const others = iceIn(X).filter(i => i !== iid && X.card(i).rez && X.subsOf(i).length);
    if (!others.length) return null;
    const t = yield* X.ask(iid, 'corp', 'wormIce', X.nameOf(iid) + ': resolve a subroutine of which ice?', others.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
    if (!t) return null;
    const subs = X.subsOf(t);
    const n = subs.length === 1 ? '0' : yield* X.ask(iid, 'corp', 'wormSub', 'Which subroutine of ' + X.nameOf(t) + '?', subs.map((sb, k) => ({ id: String(k), label: X.subText(sb) })), { always: true });
    const sb = subs[+n];
    X.log({ t: 'note', side: 'corp', text: X.nameOf(iid) + ' resolves “' + X.subText(sb) + '” of ' + X.nameOf(t) });
    if (X.g.run) X.g.run.worm = (X.g.run.worm || 0) + 1;
    try { return (yield* X.fireSub(Object.assign({ src: X.card(t).k }, sb), iid, ctx.k)) || null; }
    finally { if (X.g.run) X.g.run.worm--; }
  }
  const wormBot = { wormIce: (pub, me, pr) => pr.options[0].id, wormSub: (pub, me, pr) => (pr.options.find(o => /End the run/.test(o.label)) || pr.options[0]).id };
  /* A condition on an ice (Patch, Sub Boost). */
  const condition = (name) => ({
    playBad: (X) => iceIn(X).some(i => X.card(i).rez) ? null : 'No rezzed ice',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'condIce', name + ': on which rezzed ice?', iceIn(X).filter(i => X.card(i).rez).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (!t) return;
      X.hostCorp(iid, t); X.card(iid).rez = true;
      X.log({ t: 'note', side: 'corp', text: name + ' goes on ' + X.nameOf(t) });
    },
    botPlay: () => 1.2
  });
  const hostOf = (X, iid) => X.C.hosted.indexOf(iid) >= 0 ? X.card(iid).host : null;
  /* A sabotage run: the first time an ice of this type is fully broken, it is trashed. */
  const sabotage = (name, type) => Object.assign(anyRun(name), {
    runFullyBroken(X, iid, ctx) {
      if (ctx.E.sabotaged || X.g.run.sabotaged || X.typesOf(ctx.iid).indexOf(type) < 0 || X.card(ctx.iid).k === 'architect') return;
      X.g.run.sabotaged = true;
      X.log({ t: 'trash', side: 'corp', k: X.card(ctx.iid).k, price: 0, by: X.card(iid).k });
      X.toArchives(ctx.iid, true);
    },
    botPlay: () => 0.8
  });
  /* A card trashed while accessed, kept by the Runner as points (The Board). */
  function* toRunnerScore(X, iid, ctx, pts) {
    const c = X.card(iid);
    X.lift(iid); X.wipe(c); c.up = true; X.R.score.push(iid);
    ctx.seen.did = 'stolen';
    X.log({ t: 'steal', k: c.k, pts, total: X.points('runner') });
    X.winCheck();
  }

  /* ================================================================ WEYLAND */
  S('argus', '07001', 'Whenever the Runner steals an agenda, they take a tag or 2 meat damage.');
  on('argus', {
    on: {
      *steal(X, iid) {
        const a = yield* X.ask(iid, 'runner', 'argus', 'Argus Security: take a tag, or 2 meat damage?', [{ id: 'tag', label: 'A tag' }, { id: 'meat', label: '2 meat damage' }], { always: true });
        if (a === 'meat') yield* X.damage('meat', 2, 'Argus Security'); else yield* X.giveTags(1, 'Argus Security');
      }
    },
    bot: { argus: (pub) => pub.runner.gripN >= 4 && !pub.runner.tags ? 'meat' : 'tag' }
  });
  S('gagarin', '07002', 'Accessing a card in the root of a remote server costs the Runner 1 credit.');
  on('gagarin', { mod: { accessCost: (X, iid, v, ctx) => ctx.sid && X.isRemote(ctx.sid) ? v + 1 : v }, bot: {} });
  S('titan', '07003', 'Whenever you score an agenda, you may put an agenda counter on it.');
  on('titan', { on: { *score(X, iid, ctx) { if (yield* X.yn(iid, 'corp', 'titan', 'Titan Transnational: an agenda counter on ' + X.nameOf(ctx.iid) + '?', 'Yes', 'No')) { X.card(ctx.iid).agenda++; X.log({ t: 'counters', k: X.card(ctx.iid).k, n: X.card(ctx.iid).agenda }); } } }, bot: { titan: () => 'yes' } });
  S('firmware', '07004', 'When scored, 3 agenda counters. Once a turn, spend one: an advancement token on an ice that can be advanced.', { scoreCounters: 3 });
  on('firmware', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'Firmware Updates: an advancement token on an ice', once: 'fw', bad: !X.card(iid).agenda ? 'No counters left' : iceIn(X).some(i => X.canAdvance(i)) ? null : 'No ice can be advanced' }] : [],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'firmware', 'Firmware Updates: which ice?', iceIn(X).filter(i => X.canAdvance(i)).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (!t) return;
      X.spendAgenda(iid); X.card(t).adv++;
      X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'firmware' });
    },
    botAbil: () => 1.5
  });
  S('glenn_station', '07005', 'Carries one card. A click: put a card from HQ on it face down. A click: take that card back into HQ.');
  on('glenn_station', {
    abils: (X, iid) => {
      if (X.C.score.indexOf(iid) < 0) return [];
      const held = X.hostedCorp(iid);
      return [{ label: 'Glenn Station: put a card from HQ on it', clicks: 1, bad: held.length ? 'It already holds one' : X.C.hq.length ? null : 'HQ is empty' }, { label: 'Glenn Station: take its card back', clicks: 1, bad: held.length ? null : 'It holds nothing' }];
    },
    *use(X, iid, n) {
      if (n === 0) {
        const t = yield* X.ask(iid, 'corp', 'glenn', 'Glenn Station: put which card on it?', X.C.hq.map(i => X.cardOpt(i)));
        if (t) { X.hostCorp(t, iid); X.card(t).rez = false; X.log({ t: 'note', side: 'corp', text: 'Glenn Station holds a face-down card' }); }
        return;
      }
      const t = X.hostedCorp(iid)[0];
      if (t) { X.lift(t); X.card(t).host = null; X.C.hq.push(t); X.log({ t: 'note', side: 'corp', text: 'The card on Glenn Station goes back to HQ' }); }
    },
    botAbil: () => -1
  });
  S('gov_takeover', '07006', 'A click: gain 3 credits. One per deck.');
  on('gov_takeover', { abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'Government Takeover: gain 3', clicks: 1 }] : [], use(X) { X.gain('corp', 3); X.log({ t: 'gain', side: 'corp', n: 3, k: 'gov_takeover' }); }, botAbil: () => 2.8 });
  S('high_risk', '07007', 'When scored, an agenda counter. A click and the counter: gain a credit for each credit the Runner has.', { scoreCounters: 1 });
  on('high_risk', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'High-Risk Investment: gain ' + X.R.credits, clicks: 1, bad: X.card(iid).agenda ? null : 'No counter left' }] : [],
    use(X, iid) { X.spendAgenda(iid); const n = X.R.credits; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'high_risk' }); },
    botAbil: (pub) => pub.runner.credits >= 8 ? 5 : -1
  });
  S('constellation', '07008', 'When your turn begins, you may move an advancement token from one ice to another that can be advanced.');
  on('constellation', {
    on: {
      *corpTurnBegin(X, iid) {
        const from = iceIn(X).filter(i => X.card(i).adv > 0);
        const to = iceIn(X).filter(i => X.canAdvance(i));
        if (!from.length || to.length < 1) return;
        const a = yield* X.ask(iid, 'corp', 'constFrom', 'Constellation Protocol: move a token from which ice?', from.map(i => X.cardOpt(i, null, X.card(i).adv + ' tokens')), { skip: 'No' });
        if (!a) return;
        const b = yield* X.ask(iid, 'corp', 'constTo', '… onto which ice?', to.filter(i => i !== a).map(i => X.cardOpt(i, null, X.card(i).adv + ' tokens')));
        if (!b) return;
        X.card(a).adv--; X.card(b).adv++;
        X.log({ t: 'adv', iid: b, sid: X.serverOf(b).id, n: X.card(b).adv, k: X.card(b).rez ? X.card(b).k : null, by: 'constellation' });
      }
    },
    bot: { constFrom: () => 'skip' }
  });
  S('mark_yale', '07009', 'Whenever you spend an agenda counter, gain 1 credit. Trash it, or spend any agenda counter: gain 2 credits.');
  on('mark_yale', {
    sync: { agendaSpent(X) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'mark_yale' }); } },
    abils: (X) => [{ label: 'Mark Yale: trash him — gain 2' }, { label: 'Mark Yale: spend an agenda counter — gain 2', bad: X.C.score.some(i => X.card(i).agenda > 0) ? null : 'No agenda counters' }],
    *use(X, iid, n) {
      if (n === 0) { X.toArchives(iid, true); X.gain('corp', 2); X.log({ t: 'gain', side: 'corp', n: 2, k: 'mark_yale' }); return; }
      const t = yield* X.ask(iid, 'corp', 'markYale', 'Mark Yale: spend a counter from which agenda?', X.C.score.filter(i => X.card(i).agenda > 0).map(i => X.cardOpt(i, null, X.plural(X.card(i).agenda, 'counter'))));
      if (t) { X.spendAgenda(t); X.gain('corp', 2); X.log({ t: 'gain', side: 'corp', n: 2, k: 'mark_yale' }); }
    },
    botAbil: () => -1
  });
  S('space_camp', '07010', 'Ambush. When accessed, you may put an advancement token on an installed card that can be advanced.');
  on('space_camp', {
    *onAccess(X, iid, ctx) {
      const ts = X.advTargets();
      if (!ts.length) return;
      const t = yield* X.ask(iid, 'corp', 'spaceCamp', 'Space Camp: an advancement token on which card?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')), { skip: 'No' });
      if (t) { X.card(t).adv++; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'space_camp' }); ctx.seen.did = 'sprung'; }
    },
    bot: { spaceCamp: (pub, me, pr) => (pr.options.find(o => me.mine && D.CARDS[me.mine[o.id]] && D.CARDS[me.mine[o.id]].type === 'agenda') || pr.options[0]).id }
  });
  S('the_board', '07011', 'Every agenda in the Runner’s score area is worth 1 point less. Trashed while accessed: it goes to the Runner’s score area as 2 agenda points.', { scorePts: 2 });
  on('the_board', {
    mod: { agendaPts: (X, iid, v, ctx) => ctx.side === 'runner' && X.dat(ctx.iid).type === 'agenda' ? v - 1 : v },
    *onTrashed(X, iid, ctx) { yield* toRunnerScore(X, iid, ctx, 2); }
  });
  S('asteroid_belt', '07012', 'Can be advanced: 3 cheaper to rez per token.', { advable: true, subs: [{ k: 'etr' }] });
  on('asteroid_belt', cheaper);
  S('wormhole', '07013', 'Can be advanced: 3 cheaper to rez per token.', { advable: true, subs: [{ k: 's', n: 0, text: 'Resolve a subroutine of another rezzed ice' }] });
  on('wormhole', Object.assign({ subs: [wormhole], bot: wormBot }, cheaper));
  S('nebula', '07014', 'Can be advanced: 3 cheaper to rez per token.', { advable: true, subs: [{ k: 'trashProg' }] });
  on('nebula', cheaper);
  S('orion', '07015', 'Can be advanced: 3 cheaper to rez per token.', { advable: true, subs: [{ k: 'trashProg' }, { k: 's', n: 0, text: 'Resolve a subroutine of another rezzed ice' }, { k: 'etr' }] });
  on('orion', Object.assign({ subs: [wormhole], bot: wormBot }, cheaper));
  S('builder', '07016', 'A click: move it to the outermost position of any server.', { subs: [0, 1].map(() => ({ k: 's', n: 0, text: 'An advancement token on an ice protecting this server that can be advanced' })) });
  on('builder', {
    abils: () => [{ label: 'Builder: move it to the outside of a server', clicks: 1 }],
    *use(X, iid) {
      const sid = yield* X.ask(iid, 'corp', 'builderTo', 'Builder: to the outermost position of which server?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name })));
      const to = X.server(sid);
      if (!to) return;
      const from = X.serverOf(iid);
      from.ice.splice(from.ice.indexOf(iid), 1); to.ice.push(iid);
      X.log({ t: 'note', side: 'corp', text: 'Builder moves to ' + to.name });
    },
    subs: [function* (X, iid) {
      const ts = X.serverOf(iid).ice.filter(i => X.canAdvance(i));
      const t = yield* X.ask(iid, 'corp', 'builderAdv', 'Builder: an advancement token on which ice?', ts.map(i => X.cardOpt(i)));
      if (t) { X.card(t).adv++; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'builder' }); }
      return null;
    }],
    botAbil: () => -1
  });
  S('checkpoint', '07017', 'Rezzing it gives you 1 bad publicity.', { subs: [{ k: 's', n: 0, text: 'Trace 5: 3 meat damage when the run becomes successful' }] });
  on('checkpoint', {
    *onRez(X) { yield* X.takeBP(1, 'Checkpoint'); },
    subs: [function* (X) { if ((yield* X.trace(5, 'Checkpoint')).ok) X.g.run.checkpoint = true; return null; }],
    on: { *success(X, iid, ctx) { if (ctx.S.checkpoint) { ctx.S.checkpoint = false; yield* X.damage('meat', 3, 'Checkpoint'); } } }
  });
  S('fire_wall', '07018', 'Can be advanced: +1 strength per token.', { advable: true, advStr: 1, subs: [{ k: 'etr' }] });
  S('searchlight', '07019', 'Can be advanced. X is its advancement tokens.', { advable: true, subs: [0, 1].map(() => ({ k: 's', n: 0, text: 'Trace X: a tag (X: its advancement tokens)' })) });
  on('searchlight', { subs: [function* (X, iid) { if ((yield* X.trace(X.advOf(iid), 'Searchlight')).ok) yield* X.giveTags(1, 'Searchlight'); return null; }] });
  S('housekeeping', '07020', 'Current. The first time each turn the Runner installs a card, they trash a card from their grip.');
  on('housekeeping', {
    on: {
      *install(X, iid, ctx) {
        if (ctx.side !== 'runner' || X.R.flags.housekept || !X.R.grip.length) return;
        X.R.flags.housekept = true;
        const t = yield* X.ask(iid, 'runner', 'housekeep', 'Housekeeping: trash a card from your grip', X.R.grip.map(i => X.cardOpt(i)), { always: true });
        if (t) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'discard', side: 'runner', n: 1, ks: [X.card(t).k] }); }
      }
    },
    botPlay: () => 1.2
  });
  S('patch', '07021', 'A condition on a rezzed ice: +2 strength.');
  on('patch', Object.assign(condition('Patch'), { mod: { iceStr: (X, iid, v, ctx) => hostOf(X, iid) === ctx.iid ? v + 2 : v } }));
  S('traffic_accident', '07022', 'Only if the Runner has 2 or more tags. 2 meat damage.');
  on('traffic_accident', { playBad: (X) => X.R.tags >= 2 ? null : 'The Runner needs 2 tags', *play(X) { yield* X.damage('meat', 2, 'Traffic Accident'); }, botPlay: () => 5 });
  S('satellite_grid', '07023', 'Each ice protecting this server counts one more advancement token. One region per server.');
  on('satellite_grid', { mod: { advOf: (X, iid, v, ctx) => X.serverOf(iid) && X.serverOf(ctx.iid) === X.serverOf(iid) && X.dat(ctx.iid).type === 'ice' ? v + 1 : v } });
  S('the_twins', '07024', 'When the Runner passes a rezzed ice protecting this server, you may show and trash another copy from HQ: the Runner meets that ice again.');
  on('the_twins', {
    on: {
      *passIce(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || sv.ice.indexOf(ctx.iid) < 0 || !X.card(ctx.iid).rez) return;
        const copy = X.C.hq.find(i => X.card(i).k === X.card(ctx.iid).k);
        if (!copy || !(yield* X.yn(iid, 'corp', 'twins', 'The Twins: trash another ' + X.nameOf(ctx.iid) + ' from HQ to make the Runner meet it again?', 'Do it', 'No'))) return;
        X.reveal('corp', [copy], 'The Twins'); X.toArchives(copy, true);
        const out = yield* X.encounter(ctx.iid);
        if (!X.g.run) return;
        if (out === 'end') { ctx.S.endNow = true; ctx.S.endBy = ctx.S.endBy || X.nameOf(ctx.iid); }
      }
    },
    bot: { twins: () => 'yes' }
  });
  S('sub_boost', '07025', 'A condition on a rezzed ice: it is also a barrier and gains “End the run” after its other subroutines.');
  on('sub_boost', Object.assign(condition('Sub Boost'), {
    mod: {
      iceTypes: (X, iid, v, ctx) => hostOf(X, iid) === ctx.iid && v.indexOf('barrier') < 0 ? v.concat('barrier') : v,
      subs: (X, iid, v, ctx) => hostOf(X, iid) === ctx.iid ? v.concat({ k: 'etr' }) : v
    }
  }));
  S('dtt', '07026', '2 recurring credits for installing ice protecting this server.', { recur: { n: 2, for: 'dtt' } });
  S('cyberdex_suite', '07027', 'Ambush. When accessed, you may purge virus counters. Trash it: purge virus counters.');
  on('cyberdex_suite', {
    *onAccess(X, iid, ctx) { if (yield* X.yn(iid, 'corp', 'cdvs', 'Cyberdex Virus Suite: purge virus counters?', 'Purge', 'No')) { yield* X.purge(); ctx.seen.did = 'sprung'; } },
    abils: () => [{ label: 'Cyberdex Virus Suite: trash it — purge' }],
    *use(X, iid) { X.toArchives(iid, true); yield* X.purge(); },
    bot: { cdvs: (pub) => pub.runner.rig.some(r => r.virus) ? 'yes' : 'no' },
    botAbil: (pub) => pub.runner.rig.reduce((s, r) => s + (r.virus || 0), 0) >= 3 ? 4 : -1
  });

  /* ================================================================ ANARCHS */
  S('edward_kim', '07028', 'The first operation you access each turn is trashed, free.');
  on('edward_kim', {
    on: {
      access(X, iid, ctx) {
        if (X.dat(ctx.iid).type !== 'operation' || X.R.flags.edward || ctx.from === 'arch') return;
        X.R.flags.edward = true;
        X.toArchives(ctx.iid, true);
        X.log({ t: 'trash', side: 'corp', k: X.card(ctx.iid).k, price: 0, by: 'edward_kim' });
        ctx.seen.did = 'trashed'; ctx.seen.gone = true;
      }
    }
  });
  S('maxx', '07029', 'When your turn begins, trash the top 2 cards of your stack and draw 1.');
  on('maxx', { on: { runnerTurnBegin(X) { for (let k = 0; k < 2 && X.R.stack.length; k++) { const t = X.R.stack.shift(); X.card(t).up = true; X.R.heap.push(t); } X.log({ t: 'mill', k: 'maxx', side: 'runner' }); X.drawRunner(1, 'maxx'); } } });
  S('valencia', '07030', 'The Corp starts with 1 bad publicity.', { corpStartBP: 1 });
  S('amped_up', '07031', 'Gain three clicks and take 1 brain damage that cannot be prevented.');
  on('amped_up', { *play(X) { X.R.clicks += 3; X.log({ t: 'clicks', side: 'runner', n: 3, k: 'amped_up' }); yield* X.damage('brain', 1, 'Amped Up', { unprev: true }); }, botPlay: () => -1 });
  S('ive_had_worse', '07032', 'Draw 3. If net or meat damage trashes it, draw 3.');
  on('ive_had_worse', { play(X) { X.drawRunner(3, 'ive_had_worse'); }, lostToDamage(X) { X.drawRunner(3, 'ive_had_worse'); }, botPlay: () => 1.5 });
  S('itinerant', '07033', 'Current. The Corp’s maximum hand size is 1 lower for each bad publicity it has.');
  on('itinerant', { mod: { corpHand: (X, iid, v) => v - X.C.bp }, botPlay: (pub) => pub.corp.bp ? 1.6 : -1 });
  S('showing_off', '07034', 'Run R&D. If successful, you access from the bottom of R&D instead of the top.');
  on('showing_off', { playBad: (X) => X.runBad('rd', 1), *play(X, iid) { yield* X.run('rd', { card: iid, via: 'showing_off', bottom: true }); }, botPlay: () => 1.2 });
  S('wanton', '07035', 'Run HQ. If successful, instead of accessing you may spend clicks: the Corp trashes that many cards from HQ at random.');
  on('wanton', {
    playBad: (X) => X.runBad('hq', 1),
    *play(X, iid) { yield* X.run('hq', { card: iid, via: 'wanton' }); },
    *success(X, iid) {
      if (!X.R.clicks || !X.C.hq.length) return null;
      const opts = [{ id: '0', label: 'Access HQ instead' }];
      for (let n = 1; n <= X.R.clicks; n++) opts.push({ id: String(n), label: 'Spend ' + X.plural(n, 'click') + ': ' + n + ' cards trashed' });
      const n = +(yield* X.ask(iid, 'runner', 'wanton', 'Wanton Destruction: spend clicks to trash cards from HQ?', opts, { always: true }));
      if (!n) return null;
      X.R.clicks -= n;
      for (let k = 0; k < n && X.C.hq.length; k++) X.toArchives(X.C.hq[Math.floor(X.rand() * X.C.hq.length)], false);
      X.log({ t: 'discard', side: 'corp', n });
      return 'replace';
    },
    bot: { wanton: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botPlay: () => 1
  });
  S('day_job', '07036', 'Three more clicks to play it. Gain 10 credits.', { extraClicks: 3 });
  on('day_job', { play(X) { X.gain('runner', 10); }, botPlay: (pub) => pub.runner.credits < 4 ? 3 : -1 });
  S('forked', '07037', 'Run any server. The first time you break every subroutine on a sentry in that run, trash it.');
  on('forked', sabotage('Forked', 'sentry'));
  S('knifed', '07038', 'Run any server. The first time you break every subroutine on a barrier in that run, trash it.');
  on('knifed', sabotage('Knifed', 'barrier'));
  S('spooned', '07039', 'Run any server. The first time you break every subroutine on a code gate in that run, trash it.');
  on('spooned', sabotage('Spooned', 'code gate'));
  S('eater', '07040', '1 credit: break one subroutine — and you cannot access cards for the rest of the run. 1 credit: +1 strength.', { brk: { type: 'any', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } });
  on('eater', { onBreak(X) { if (X.g.run) X.g.run.noAccess = true; } });
  S('gravedigger', '07041', 'A virus counter whenever an installed Corp card is trashed. A click and a counter: the Corp trashes the top of R&D.', { virus: true });
  on('gravedigger', {
    sync: { corpTrashed(X, iid) { X.card(iid).virus++; } },
    abils: (X, iid) => [{ label: 'Gravedigger: the Corp trashes the top of R&D', clicks: 1, bad: X.virusOf(iid) ? (X.C.rd.length ? null : 'R&D is empty') : 'No virus counters' }],
    use(X, iid) { X.spendVirus(iid, 1); X.toArchives(X.C.rd[0], false); X.log({ t: 'mill', k: 'gravedigger' }); },
    botAbil: () => 1.1
  });
  S('hivemind', '07042', 'Comes with a virus counter. Its counters count as being on every other virus program.', { virus: true });
  on('hivemind', { onInstall(X, iid) { X.addVirus(iid, 1); }, botPlay: () => 1.2 });
  S('progenitor', '07043', 'Carries one virus program, which uses none of your memory. When virus counters are purged, the hosted program keeps one.');
  on('progenitor', { freeHost: true, hostFor: (X, h, p) => X.dat(p).type === 'program' && !!X.dat(p).virus && !X.hostedOn(h).length, botPlay: () => 0.8 });
  S('archives_interface', '07044', 'Once each time you access Archives, you may remove a card you would access there from the game instead.');
  on('archives_interface', {
    on: {
      *access(X, iid, ctx) {
        if (ctx.from !== 'arch' || X.g.run.archInt) return;
        if (!(yield* X.yn(iid, 'runner', 'archInt', 'Archives Interface: remove ' + X.nameOf(ctx.iid) + ' from the game instead of accessing it?', 'Remove it', 'Access it'))) return;
        X.g.run.archInt = true;
        X.lift(ctx.iid); X.card(ctx.iid).up = true; X.C.gone.push(ctx.iid);
        X.log({ t: 'note', side: 'runner', text: 'Archives Interface removes ' + X.nameOf(ctx.iid) + ' from the game' });
        ctx.seen.did = 'trashed'; ctx.seen.gone = true;
      }
    },
    bot: { archInt: (pub, me, pr) => /Hedge Fund|Snare|Sweeps|Restructure/.test(pr.why) ? 'yes' : 'no' }
  });
  S('chop_bot', '07045', 'When your turn begins you may trash another installed card of yours: draw a card or remove a tag.');
  on('chop_bot', {
    on: {
      *runnerTurnBegin(X, iid) {
        const ts = X.R.rig.filter(i => i !== iid);
        if (!ts.length) return;
        const t = yield* X.ask(iid, 'runner', 'chopBot', 'Chop Bot 3000: trash another installed card?', ts.map(i => X.cardOpt(i)), { skip: 'No' });
        if (!t) return;
        X.trashRunner(t, 'chop_bot');
        const a = X.R.tags ? yield* X.ask(iid, 'runner', 'chopWhat', 'Chop Bot 3000: draw a card, or remove a tag?', [{ id: 'draw', label: 'Draw' }, { id: 'tag', label: 'Remove a tag' }], { always: true }) : 'draw';
        if (a === 'tag') { X.R.tags--; X.log({ t: 'untag', n: 1, k: 'chop_bot' }); } else X.drawRunner(1, 'chop_bot');
      }
    },
    bot: { chopBot: () => 'skip' },
    botPlay: () => 0.3
  });
  S('memstrips', '07046', '+3 memory, for virus programs only.');
  on('memstrips', { mod: { muUsed: (X, iid, v) => v - Math.min(3, X.programs().filter(i => X.dat(i).virus).reduce((s, i) => s + X.muOf(i), 0)) }, botPlay: () => 0.6 });
  S('vigil', '07047', '+1 memory. When your turn begins, draw a card if the Corp’s hand is full. One console only.', { console: true, memory: 1 });
  on('vigil', { on: { runnerTurnBegin(X) { if (X.C.hq.length >= X.corpHandMax()) X.drawRunner(1, 'vigil'); } }, botPlay: () => 1.6 });
  S('human_first', '07048', 'Whenever an agenda is scored or stolen, gain credits equal to its agenda points.');
  on('human_first', { on: { scoreOrSteal(X, iid, ctx) { const n = X.dat(ctx.iid).pts || 0; if (n) { X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'human_first' }); } } }, botPlay: () => 1.4 });
  S('investigative', '07049', 'Install only if the Corp has bad publicity. Four clicks, trash it: the Corp takes 1 bad publicity.');
  on('investigative', {
    installBad: (X) => X.C.bp ? null : 'The Corp has no bad publicity',
    abils: () => [{ label: 'Investigative Journalism: trash it — 1 bad publicity', clicks: 4 }],
    *use(X, iid) { X.trashRunner(iid, 'used'); yield* X.takeBP(1, 'Investigative Journalism'); },
    botAbil: () => -1, botPlay: () => -1
  });
  S('sac_clone', '07050', 'Trash it to prevent all of some damage: then lose your hardware, your non-virtual resources, your grip, your credits — and your tags.');
  on('sac_clone', {
    *prevent(X, iid, ctx) {
      if (!(yield* X.yn(iid, 'runner', 'sacClone', 'Sacrificial Clone: give up almost everything to prevent this ' + ctx.n + ' ' + ctx.kind + ' damage?', 'Do it', 'No'))) return 0;
      X.trashRunner(iid, 'prevent');
      for (const i of X.R.rig.slice()) if (X.isInstalled(i) && (X.dat(i).type === 'hardware' || (X.dat(i).type === 'resource' && !kw(X, i, /Virtual/)))) X.trashRunner(i, 'sac_clone');
      for (const i of X.R.grip.splice(0)) { X.card(i).up = true; X.R.heap.push(i); }
      X.R.credits = 0; X.R.tags = 0;
      X.log({ t: 'prevent', side: 'runner', k: 'sac_clone', n: ctx.n });
      return ctx.n;
    },
    bot: { sacClone: (pub, me, pr) => +((pr.why.match(/this (\d+)/) || [])[1] || 0) > pub.runner.gripN ? 'yes' : 'no' }
  });
  S('stim_dealer', '07051', 'When your turn begins: with 2 or more power counters, remove them and take 1 brain damage that cannot be prevented; otherwise a power counter and a click.');
  on('stim_dealer', {
    on: { *runnerTurnBegin(X, iid) { const c = X.card(iid); if (c.power >= 2) { c.power = 0; yield* X.damage('brain', 1, 'Stim Dealer', { unprev: true }); } else { c.power++; X.R.clicks++; X.log({ t: 'clicks', side: 'runner', n: 1, k: 'stim_dealer' }); } } },
    botPlay: () => -1
  });
  S('vbg', '07052', 'A virus counter when your turn begins. A click: move one of them to another card with a virus counter.');
  on('vbg', {
    on: { runnerTurnBegin(X, iid) { X.addVirus(iid, 1); } },
    abils: (X, iid) => [{ label: 'Virus Breeding Ground: move a virus counter', clicks: 1, bad: X.card(iid).virus && X.R.rig.some(i => i !== iid && X.card(i).virus > 0) ? null : 'Nothing to move it to' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'vbg', 'Move a counter onto which card?', X.R.rig.filter(i => i !== iid && X.card(i).virus > 0).map(i => X.cardOpt(i, null, X.plural(X.card(i).virus, 'counter'))));
      if (t) { X.card(iid).virus--; X.addVirus(t, 1); }
    },
    botAbil: () => 0.7, botPlay: () => 0.6
  });
  S('uninstall', '07053', 'Take an installed program or hardware back into your grip.');
  on('uninstall', {
    playBad: (X) => X.R.rig.some(i => ['program', 'hardware'].indexOf(X.dat(i).type) >= 0) ? null : 'No program or hardware installed',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'uninstall', 'Uninstall: which card?', X.R.rig.filter(i => ['program', 'hardware'].indexOf(X.dat(i).type) >= 0).map(i => X.cardOpt(i)));
      if (!t) return;
      for (const h of X.hostedOn(t)) X.trashRunner(h, 'host');
      X.lift(t); X.wipe(X.card(t)); X.R.grip.push(t);
    },
    botPlay: () => -1
  });
  S('qianju', '07054', 'When your turn begins you may lose a click: the first tag(s) you would take before your next turn, 1 is avoided.');
  on('qianju', {
    on: { *runnerTurnBegin(X, iid) { if (X.R.clicks && (yield* X.yn(iid, 'runner', 'qianju', 'Qianju PT: lose a click to be ready to avoid a tag?', 'Lose a click', 'No'))) { X.R.clicks--; X.card(iid).x.armed = true; } } },
    avoidTag(X, iid) { if (!X.card(iid).x.armed) return 0; X.card(iid).x.armed = false; X.log({ t: 'prevent', side: 'runner', k: 'qianju', n: 1 }); return 1; },
    bot: { qianju: () => 'no' }
  });
  S('data_folding', '07055', 'When your turn begins, gain 1 credit if you have 2 or more memory free.');
  on('data_folding', { on: { runnerTurnBegin(X) { if (X.muTotal() - X.muUsed() >= 2) { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'data_folding' }); } } }, botPlay: () => 1.2 });

  D.SET_LOADED.oac = true;
})(typeof window !== 'undefined' ? window : this);
