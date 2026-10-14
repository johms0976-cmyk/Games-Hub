'use strict';
/* The Red Sand cycle (2017–18: Earth's Scion, Blood and Water, Free Mars,
 * Crimson Dust, Sovereign Sight, Down the White Nile — 120 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. New here: triple operations, net damage as a
 * cost to steal (Ben Musashi, Obokata Protocol), a Corp condition on a Runner
 * resource (MCA Informant), the Runner moved to Archives (Mirāju) or another
 * server (AgInfusion, Sand Storm). Readings decided here:
 *   - Net Analytics hears tags avoided, and tags removed with the basic action.
 *   - Counter Surveillance: pay X (your tags), then access up to that many.
 *   - Respirocytes and Dadiana Chacon look at the grip / credits after each
 *     action and as runs end.
 *   - Bioroid Work Crew may be used when the Corp's last action was an operation.
 *   - Salvaged Vanadis Armory may be used in the turn you took damage.
 *   - Adjusted Matrix's host breaks with a click, but does not become an AI
 *     for other cards.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const kw = (X, i, re) => re.test(X.dat(i).kw || '');
  const runOpts = X => X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) }));
  const noRun = X => X.C.servers.every(sv => X.runBad(sv.id, 1));
  const anyRunL = (name, o) => ({
    playBad: (X) => noRun(X) ? 'Nowhere to run' : null,
    *play(X, iid) {
      X.linger(iid);
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', runOpts(X), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, Object.assign({ card: iid, via: X.card(iid).k }, typeof o === 'function' ? o(X, iid) : o || {}));
    }
  });
  const gainC = (X, n, k) => { if (n > 0) { X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k }); } };
  const gainR = (X, n, k) => { if (n > 0) { X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k }); } };
  const loseR = (X, n, cause) => { const k = Math.min(n, X.R.credits); if (k) { X.R.credits -= k; X.log({ t: 'lose', side: 'runner', n: k, cause }); } };
  const hasAI = X => X.programs().some(i => kw(X, i, /\bAI\b/));
  const mill = (X, n) => { for (let k = 0; k < n && X.R.stack.length; k++) { const t = X.R.stack.shift(); X.card(t).up = true; X.R.heap.push(t); } };
  const millRD = (X, n) => { for (let k = 0; k < n && X.C.rd.length; k++) X.toArchives(X.C.rd[0], false); };
  const toGrip = (X, t) => { for (const h of X.hostedOn(t)) X.trashRunner(h, 'host'); X.lift(t); X.wipe(X.card(t)); X.R.grip.push(t); };
  const iceAll = X => X.corpPlaced().filter(i => X.dat(i).type === 'ice');
  const forfeit = (X, iid) => { X.lift(iid); X.C.gone.push(iid); X.log({ t: 'forfeit', side: 'corp', k: X.card(iid).k }); };
  const agendasC = X => X.C.score.filter(i => X.dat(i).type === 'agenda');
  function* arrange(X, iid, side, what, list, why) {
    let left = list.slice();
    const order = [];
    while (left.length > 1) {
      const t = yield* X.ask(iid, side, what, why + ' — which goes ' + (order.length ? 'next' : 'on top') + '?', left.map(i => X.cardOpt(i)), { always: true });
      order.push(t); left = left.filter(i => i !== t);
    }
    return order.concat(left);
  }
  /* Swap two installed cards' places (ice with ice, or root card with root card). */
  function swapPlaces(X, a, b) {
    const sa = X.serverOf(a), sb = X.serverOf(b);
    const la = sa.ice.indexOf(a) >= 0 ? sa.ice : sa.root, lb = sb.ice.indexOf(b) >= 0 ? sb.ice : sb.root;
    const pa = la.indexOf(a), pb = lb.indexOf(b);
    la[pa] = b; lb[pb] = a;
  }
  const trashOwnProgram = function* (X, iid, who) {
    if (!X.programs().length) return null;
    const t = yield* X.ask(iid, who || 'runner', 'trashProgOwn', X.nameOf(iid) + ': trash which program?', X.programs().map(i => X.cardOpt(i)), { always: true });
    if (t) X.trashRunner(t, X.nameOf(iid));
    return null;
  };
  const cheapest = (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[a.card] || {}).cost || 0) - ((D.CARDS[b.card] || {}).cost || 0))[0].id;

  /* ================================================================ EARTH'S SCION */
  S('pushing_envelope', '12001', 'Run any server. With 2 or fewer cards in your grip, every icebreaker has +2 strength during the run.');
  on('pushing_envelope', Object.assign(anyRunL('Pushing the Envelope', (X) => ({ envelope: X.R.grip.length <= 2 })), {
    runMod: { breakerStr: (X, iid, v) => X.g.run && X.g.run.o.envelope ? v + 2 : v },
    botPlay: () => 0.6
  }));
  S('maw', '12002', '+2 memory. The first time each turn you access a card outside Archives and neither steal nor trash it, the Corp trashes a random card from HQ. One console only.', { console: true, memory: 2 });
  on('maw', {
    on: { accessed(X, iid, ctx) { if (ctx.from === 'arch' || X.card(iid).x.turn === X.g.turnN) return; const seen = X.g.run && X.g.run.seen.find(s => s.iid === ctx.iid); if (seen && (seen.did === 'stolen' || seen.did === 'trashed' || seen.did === 'removed')) return; if (!X.C.hq.length) return; X.card(iid).x.turn = X.g.turnN; const t = X.C.hq[Math.floor(X.rand() * X.C.hq.length)]; X.toArchives(t, false); X.log({ t: 'note', side: 'runner', text: 'Maw: a random card from HQ is trashed' }); } },
    botPlay: () => 1.4
  });
  S('archivist', '12003', '+1 link. Whenever the Corp scores an initiative or security agenda, it traces 1: if that fails, it takes a bad publicity.', { link: 1 });
  on('archivist', { on: { *score(X, iid, ctx) { if (!kw(X, ctx.iid, /Initiative|Security/)) return; if (!(yield* X.trace(1, 'The Archivist')).ok) yield* X.takeBP(1, 'The Archivist'); } }, botPlay: () => 0.6 });
  S('exploit', '12004', 'Only after successful runs on HQ, R&D and Archives this turn. Derez up to 3 ice.');
  on('exploit', {
    playBad: (X) => { const f = X.R.flags.succ || {}; return f.hq && f.rd && f.arch ? (iceAll(X).some(i => X.card(i).rez) ? null : 'No rezzed ice') : 'Only after successful runs on HQ, R&D and Archives this turn'; },
    *play(X, iid) {
      const pool = iceAll(X).filter(i => X.card(i).rez);
      const ts = yield* X.ask(iid, 'runner', 'exploit', 'Exploit: derez which ice (up to 3)?', pool.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { multi: true, min: 1, max: Math.min(3, pool.length) });
      for (const t of ts) X.derez(t, 'exploit');
    },
    bot: { exploit: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0)).slice(0, pr.max).map(o => o.id) },
    botPlay: () => 5
  });
  S('spot_the_prey', '12005', 'Expose a card that is not ice, then run any server.');
  on('spot_the_prey', {
    playBad: (X) => noRun(X) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const pool = X.corpPlaced().filter(i => X.dat(i).type !== 'ice' && !X.card(i).rez);
      if (pool.length) { const e = yield* X.ask(iid, 'runner', 'spotPrey', 'Spot the Prey: expose which card?', pool.map(i => ({ id: i, label: 'A card in ' + X.srvName(X.serverOf(i)) })), { always: true }); if (e) yield* X.expose(e, 'Spot the Prey'); }
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Spot the Prey: run which server?', runOpts(X), { pub: 'The Runner makes a run' });
      if (sid) yield* X.run(sid, { card: iid, via: 'spot_the_prey' });
    },
    botPlay: () => 0.7
  });
  S('bio_modeled', '12006', 'Trash it: prevent all but 1 of the net damage coming.');
  on('bio_modeled', {
    *prevent(X, iid, ctx) {
      if (ctx.kind !== 'net' || ctx.n < 2) return 0;
      if (!(yield* X.yn(iid, 'runner', 'bioModeled', 'Bio-Modeled Network: trash it to take only 1 of ' + ctx.n + ' net damage?', 'Trash it', 'Take it'))) return 0;
      X.trashRunner(iid, 'used'); X.log({ t: 'prevent', side: 'runner', k: 'bio_modeled', n: ctx.n - 1 });
      return ctx.n - 1;
    },
    bot: { bioModeled: () => 'yes' },
    botPlay: () => 0.5
  });
  S('network_exchange', '12007', 'Installing an ice anywhere but innermost costs the Corp 1 more.');
  on('network_exchange', { mod: { iceInstallCost: (X, iid, v, ctx) => { const sv = X.server(ctx.sid); return sv && sv.ice.length ? v + 1 : v; } }, botPlay: () => 0.6 });
  S('mad_dash', '12008', 'Run any server. When it ends: if you stole an agenda, this joins your score area as 1 agenda point; otherwise 1 meat damage.', { scorePts: 1 });
  on('mad_dash', Object.assign(anyRunL('Mad Dash'), {
    *runEnd(X, iid, ctx) {
      if (ctx.S.seen.some(s => s.did === 'stolen')) { if (X.R.heap.indexOf(iid) >= 0) { X.lift(iid); X.R.score.push(iid); X.log({ t: 'steal', k: 'mad_dash', pts: 1, total: X.points('runner') }); X.winCheck(); } return; }
      yield* X.damage('meat', 1, 'Mad Dash');
    },
    botPlay: () => 0.4
  }));
  S('next_wave_2', '12009', 'When scored, if a NEXT ice is rezzed, you may do 1 brain damage.');
  on('next_wave_2', { *onScore(X, iid) { if (!iceAll(X).some(i => X.card(i).rez && kw(X, i, /NEXT/))) return; if (yield* X.yn(iid, 'corp', 'nextWave', 'NEXT Wave 2: 1 brain damage?', 'Do it', 'No')) yield* X.damage('brain', 1, 'NEXT Wave 2'); }, bot: { nextWave: () => 'yes' } });
  S('zed_2', '12010', 'The Runner may lose two clicks to break up to two of its subroutines.', { clickBreak: { clicks: 2, n: 2 }, subs: [{ k: 's', n: 0, text: 'Trash a hardware' }, { k: 's', n: 0, text: 'Trash a hardware' }, { k: 's', n: 1, text: '2 brain damage if the Runner lost clicks to break a subroutine this run' }] });
  on('zed_2', {
    subs: [
      function* (X, iid) { const hw = X.rigOf('hardware'); if (!hw.length) return null; const t = yield* X.ask(iid, 'corp', 'zedHw', 'Zed 2.0: trash which hardware?', hw.map(i => X.cardOpt(i)), { always: true }); if (t && !(yield* X.saveWithConstruct(t))) X.trashRunner(t, 'Zed 2.0'); return null; },
      function* (X) { if (X.g.run.clickBroke) yield* X.damage('brain', 2, 'Zed 2.0'); return null; }
    ]
  });
  S('defense_construct', '12011', 'It can be advanced. During a run on Archives, trash it: a face-down card from Archives into HQ for each advancement token on it.', { advable: true });
  on('defense_construct', {
    winOpts: (X, iid) => X.g.run && X.g.run.sid === 'arch' && X.card(iid).adv && X.C.arch.some(i => !X.card(i).up) ? [{ label: 'Defense Construct: trash it — ' + X.plural(X.card(iid).adv, 'face-down card') + ' back to HQ' }] : [],
    *winUse(X, iid) {
      const n = X.card(iid).adv;
      X.toArchives(iid, true);
      const down = X.C.arch.filter(i => !X.card(i).up);
      const ts = yield* X.ask(iid, 'corp', 'defConstruct', 'Defense Construct: which face-down cards back to HQ?', down.map(i => X.cardOpt(i)), { multi: true, min: Math.min(n, down.length), max: Math.min(n, down.length) });
      for (const t of ts) { X.lift(t); X.C.hq.push(t); }
      X.log({ t: 'note', side: 'corp', text: 'Defense Construct: ' + X.plural(ts.length, 'card') + ' back to HQ from Archives' });
    },
    botWin: () => true
  });
  S('synth_dna', '12012', 'The first time each turn a subroutine on an AP ice is broken, 1 net damage.');
  on('synth_dna', { *onBreaking(X, iid, ctx) { if (!kw(X, ctx.E.iid, /\bAP\b/) || X.card(iid).x.turn === X.g.turnN || !ctx.subs.length) return; X.card(iid).x.turn = X.g.turnN; yield* X.damage('net', 1, 'Synth DNA Modification'); } });
  S('kakugo', '12013', 'When the Runner passes it, 1 net damage.', { subs: [{ k: 'etr' }] });
  on('kakugo', { on: { *passIce(X, iid, ctx) { if (ctx.iid === iid) yield* X.damage('net', 1, 'Kakugo'); } } });
  S('net_analytics', '12014', 'Whenever the Runner avoids or removes tags, you may draw a card.');
  on('net_analytics', { on: { *tagsGone(X, iid) { if (X.C.rd.length && (yield* X.yn(iid, 'corp', 'netAnalytics', 'Net Analytics: draw a card?', 'Draw', 'No'))) X.drawCorp(1, 'net_analytics'); } }, bot: { netAnalytics: () => 'yes' } });
  S('sync_bre', '12015', '', { subs: [{ k: 'trace', n: 4, then: 'tag' }, { k: 'trace', n: 2, do: { k: 's', n: 0 }, text: 'the Runner accesses 1 fewer card for the rest of the run' }] });
  on('sync_bre', {
    subs: [function (X) { X.g.run.fewer = (X.g.run.fewer || 0) + 1; X.log({ t: 'note', side: 'corp', text: 'SYNC BRE: the Runner accesses 1 fewer card this run' }); return null; }],
    mod: { accessHQ: (X, iid, v, ctx) => Math.max(0, v - ((ctx.S && ctx.S.fewer) || 0)), accessRD: (X, iid, v, ctx) => Math.max(0, v - ((ctx.S && ctx.S.fewer) || 0)) }
  });
  S('jemison', '12016', 'Whenever you forfeit an agenda, put its points + 1 in advancement tokens on an installed card.');
  on('jemison', {
    on: {
      *corpForfeited(X, iid, ctx) {
        const pool = X.corpPlaced();
        if (!pool.length) return;
        const n = (D.CARDS[ctx.k].pts || 0) + 1;
        const t = yield* X.ask(iid, 'corp', 'jemison', 'Jemison Astronautics: ' + X.plural(n, 'advancement token') + ' on which card?', pool.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true, force: true });
        if (t) { X.card(t).adv += n; X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'jemison', x: n }); }
      }
    },
    bot: { jemison: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id }
  });
  S('quarantine_system', '12017', 'Forfeit an agenda: rez up to 3 ice, each costing 2 less per point the agenda was worth.');
  on('quarantine_system', {
    abils: (X) => [{ label: 'Quarantine System: forfeit an agenda — rez up to 3 ice cheaper', bad: !agendasC(X).length ? 'No agenda to forfeit' : iceAll(X).some(i => !X.card(i).rez) ? null : 'No unrezzed ice' }],
    winOpts: (X, iid, ctx) => ctx.where === 'ice' && agendasC(X).length && !X.card(ctx.iid).rez ? [{ label: 'Quarantine System: forfeit an agenda — rez ice cheaper' }] : [],
    *use(X, iid) { yield* quarantine(X, iid); },
    *winUse(X, iid) { yield* quarantine(X, iid); },
    botAbil: () => -1, botWin: () => false
  });
  function* quarantine(X, iid) {
    const ag = yield* X.ask(iid, 'corp', 'quarantineAg', 'Quarantine System: forfeit which agenda?', agendasC(X).map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { always: true });
    if (!ag) return;
    const off = 2 * (X.dat(ag).pts || 0);
    forfeit(X, ag);
    for (let n = 0; n < 3; n++) {
      const pool = iceAll(X).filter(i => !X.card(i).rez && X.avail('corp', 'rezIce', { iid: i }) >= Math.max(0, X.rezCost(i) - off) && !X.rezBlock(i) && !X.dat(i).rezForfeit);
      if (!pool.length) break;
      const t = yield* X.ask(iid, 'corp', 'quarantine', 'Quarantine System: rez which ice (' + off + ' less)?', pool.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + Math.max(0, X.rezCost(i) - off))), { skip: 'Stop' });
      if (!t) break;
      X.doRez(t, false, off); yield* X.rezTriggers(t);
    }
  }
  S('oberth', '12018', 'To rez it, forfeit an agenda. The first time each turn you advance a card in or before this server, one more advancement token.', { rezForfeit: true });
  on('oberth', { on: { advanced(X, iid, ctx) { const sv = X.serverOf(iid); if (!sv || X.serverOf(ctx.iid) !== sv || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; X.card(ctx.iid).adv++; X.log({ t: 'adv', iid: ctx.iid, sid: sv.id, n: X.card(ctx.iid).adv, k: X.card(ctx.iid).rez ? X.card(ctx.iid).k : null, by: 'oberth' }); } } });
  S('khondi', '12019', 'X recurring credits for rezzing ice protecting this server (X: your remote servers).', { recur: { n: 'remotes', for: 'khondi' } });
  S('signal_jamming', '12020', 'During a run on this server, trash it: no card can be installed until the run ends.');
  on('signal_jamming', {
    winOpts: (X, iid) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id && !X.g.run.noInstall ? [{ label: 'Signal Jamming: trash it — no installs this run' }] : [],
    winUse(X, iid) { X.toArchives(iid, true); X.g.run.noInstall = true; X.log({ t: 'note', side: 'corp', text: 'Signal Jamming: nothing can be installed until the run ends' }); },
    botWin: () => false
  });
  S('severnius', '12021', 'A click: trash 2 or more cards from your grip and run HQ or R&D — one more card accessed for each 2 trashed.');
  on('severnius', {
    abils: (X) => [{ label: 'Severnius Stim Implant: trash cards, run HQ or R&D', clicks: 1, bad: X.R.grip.length < 2 ? 'Needs 2 cards in your grip' : X.runBad('hq', 1) && X.runBad('rd', 1) ? 'Nowhere to run' : null }],
    *use(X, iid) {
      const ts = yield* X.ask(iid, 'runner', 'severnius', 'Severnius Stim Implant: trash which cards (2 or more)?', X.R.grip.map(i => X.cardOpt(i)), { multi: true, min: 2, max: X.R.grip.length });
      for (const t of ts) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); }
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Severnius Stim Implant: HQ or R&D?', runOpts(X).filter(o => o.id === 'hq' || o.id === 'rd'), {});
      const more = Math.floor(ts.length / 2);
      if (sid) yield* X.run(sid, sid === 'hq' ? { via: 'severnius', extraHQ: more } : { via: 'severnius', extra: more });
    },
    bot: { severnius: (pub, me, pr) => pr.options.slice(0, 2).map(o => o.id) },
    botAbil: () => -1, botPlay: () => 0.2
  });
  S('clan_vengeance', '12022', 'Whenever you take damage, a power counter on it. Trash it: the Corp trashes a random card from HQ for each counter.');
  on('clan_vengeance', {
    on: { damaged(X, iid, ctx) { if (ctx.n > 0) X.card(iid).power++; } },
    abils: (X, iid) => [{ label: 'Clan Vengeance: trash it — ' + X.plural(X.card(iid).power, 'random card') + ' from HQ', bad: X.card(iid).power ? null : 'No counters' }],
    use(X, iid) { const n = X.card(iid).power; X.trashRunner(iid, 'used'); for (let k = 0; k < n && X.C.hq.length; k++) X.toArchives(X.C.hq[Math.floor(X.rand() * X.C.hq.length)], false); X.log({ t: 'note', side: 'runner', text: 'Clan Vengeance: ' + X.plural(n, 'card') + ' from HQ trashed' }); },
    botAbil: (pub, me, o) => /— (\d+) random/.test(o.label) && +o.label.match(/— (\d+) random/)[1] >= 2 ? 2 : -1, botPlay: () => 0.4
  });
  S('counter_surveillance', '12023', 'A click, trash it: run any server. If successful, instead of the usual access, pay X (your tags) to access up to X cards there.');
  on('counter_surveillance', {
    abils: (X) => [{ label: 'Counter Surveillance: trash it — run', clicks: 1, bad: noRun(X) ? 'Nowhere to run' : null }],
    *use(X, iid) {
      X.trashRunner(iid, 'used'); X.linger(iid);
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Counter Surveillance: run which server?', runOpts(X), {});
      if (sid) yield* X.run(sid, { card: iid, via: 'counter_surveillance' });
    },
    *success(X, iid, ctx) {
      const x = X.R.tags;
      if (!x || X.avail('runner', 'any') < x) { ctx.S.noAccess = true; return null; }
      X.pay('runner', x, 'any');
      const opts = []; for (let n = 1; n <= x; n++) opts.push({ id: String(n), label: 'Access ' + X.plural(n, 'card') });
      const n = +(yield* X.ask(iid, 'runner', 'counterSurv', 'Counter Surveillance: access how many?', opts, { always: true }));
      ctx.S.accessMax = n; ctx.S.o.extraHQ = (ctx.S.o.extraHQ || 0) + n - 1; ctx.S.o.extra = (ctx.S.o.extra || 0) + n - 1;
      return null;
    },
    bot: { counterSurv: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botAbil: () => -1, botPlay: () => 0.2
  });
  S('mobius', '12024', 'Run R&D. If successful, you may run R&D again when it ends; if that second run succeeds, gain 4 credits.');
  on('mobius', {
    playBad: (X) => X.runBad('rd', 1),
    *play(X, iid) { yield* X.run('rd', { card: iid, via: 'mobius' }); },
    *runEnd(X, iid, ctx) {
      if (ctx.how !== 'success') return;
      if (ctx.S.o.again) { gainR(X, 4, 'mobius'); return; }
      if (!X.runBad('rd') && (yield* X.yn(iid, 'runner', 'mobius', 'Möbius: run R&D again?', 'Run again', 'No'))) yield* X.run('rd', { card: iid, via: 'mobius', again: true });
    },
    bot: { mobius: () => 'yes' },
    botPlay: () => 1.4
  });
  S('los', '12025', 'The first time the Corp rezzes an ice each turn, gain 2 credits.');
  on('los', { on: { rez(X, iid, ctx) { if (X.dat(ctx.iid).type !== 'ice' || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; gainR(X, 2, 'los'); } } });
  S('system_seizure', '12026', 'Current. The first time each turn you raise an icebreaker’s strength, its strength lasts for the rest of the run.');
  on('system_seizure', { botPlay: () => 0.6 });
  S('customized_secretary', '12027', 'When installed, look at the top 5 cards of your stack and put any programs among them on it; shuffle. A click: install a program from it (paying for it).');
  on('customized_secretary', {
    *onInstall(X, iid) {
      const top = X.R.stack.slice(0, 5);
      X.reveal('runner', top, 'Customized Secretary');
      const progs = top.filter(i => X.dat(i).type === 'program');
      const ts = progs.length ? yield* X.ask(iid, 'runner', 'secretary', 'Customized Secretary: which programs go on it?', progs.map(i => X.cardOpt(i)), { multi: true, min: 0, max: progs.length }) : [];
      for (const t of ts) { X.lift(t); X.card(t).up = true; X.card(t).host = iid; X.R.ws.push(t); }
      X.shuffleStack();
    },
    abils: (X, iid) => [{ label: 'Customized Secretary: install a program from it', clicks: 1, bad: X.R.ws.some(i => X.card(i).host === iid) ? null : 'Nothing on it' }],
    *use(X, iid) {
      const pool = X.R.ws.filter(i => X.card(i).host === iid);
      const t = yield* X.ask(iid, 'runner', 'secretaryInstall', 'Customized Secretary: install which program?', pool.map(i => X.cardOpt(i, null, X.installCost(i, 0) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null))));
      if (t) yield* X.runnerInstall(t, { from: 'secretary' });
    },
    bot: { secretary: (pub, me, pr) => pr.options.map(o => o.id) },
    botAbil: () => 1, botPlay: () => 0.5
  });
  S('build_script', '12028', 'Gain 1 credit and draw 2.');
  on('build_script', { play(X) { gainR(X, 1, 'build_script'); X.drawRunner(2, 'build_script'); }, botPlay: () => 1.2 });
  S('seidr', '12029', '+1 strength for each ice protecting this server.', { subs: [{ k: 'etr' }] });
  on('seidr', { self: { iceStr: (X, iid, v) => v + (X.serverOf(iid) ? X.serverOf(iid).ice.length : 0) } });
  S('nerine_2', '12030', 'The Runner may lose two clicks to break up to two of its subroutines.', { clickBreak: { clicks: 2, n: 2 }, subs: [{ k: 's', n: 0, text: '1 brain damage; the Corp may draw a card' }, { k: 's', n: 0, text: '1 brain damage; the Corp may draw a card' }] });
  on('nerine_2', { subs: [function* (X, iid) { yield* X.damage('brain', 1, 'Nerine 2.0'); if (X.C.rd.length && (yield* X.yn(iid, 'corp', 'nerine', 'Nerine 2.0: draw a card?', 'Draw', 'No'))) X.drawCorp(1, 'nerine_2'); return null; }], bot: { nerine: () => 'yes' } });
  S('load_testing', '12031', 'The Runner loses a click when their next turn begins.');
  on('load_testing', { play(X) { X.R.loseNext = (X.R.loseNext || 0) + 1; }, botPlay: () => 0.6 });
  S('bloom', '12032', '', { subs: [{ k: 's', n: 0, text: 'The Corp may install an ice from HQ protecting another server, free' }, { k: 's', n: 1, text: 'The Corp may install an ice from HQ just inside Bloom, free' }] });
  on('bloom', {
    subs: [
      function* (X, iid) {
        const ice = X.C.hq.filter(i => X.dat(i).type === 'ice');
        if (!ice.length) return null;
        const t = yield* X.ask(iid, 'corp', 'bloom', 'Bloom: install which ice protecting another server?', ice.map(i => X.cardOpt(i)), { skip: 'None' });
        if (t) yield* X.corpInstall(t, { free: true, filter: o => o.id !== (X.serverOf(iid) || {}).id });
        return null;
      },
      function* (X, iid) {
        const ice = X.C.hq.filter(i => X.dat(i).type === 'ice');
        const sv = X.serverOf(iid);
        if (!ice.length || !sv) return null;
        const t = yield* X.ask(iid, 'corp', 'bloom2', 'Bloom: install which ice just inside it?', ice.map(i => X.cardOpt(i)), { skip: 'None' });
        if (!t) return null;
        yield* X.corpInstall(t, { free: true, to: sv.id });
        if (sv.ice.indexOf(t) >= 0) { sv.ice.splice(sv.ice.indexOf(t), 1); sv.ice.splice(sv.ice.indexOf(iid), 0, t); }
        return null;
      }
    ],
    bot: { bloom: (pub, me, pr) => pr.options[0].id, bloom2: (pub, me, pr) => pr.options[0].id }
  });
  S('replanting', '12033', 'Double. Take one of your installed cards back into HQ, then install 2 cards from HQ, free.');
  on('replanting', {
    playBad: (X) => X.corpPlaced().length ? null : 'Nothing installed',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'replant', 'Replanting: take which card back into HQ?', X.corpPlaced().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (t) X.toHQ(t);
      for (let n = 0; n < 2; n++) {
        const pool = X.C.hq.filter(i => X.dat(i).type !== 'operation');
        if (!pool.length) break;
        const u = yield* X.ask(iid, 'corp', 'replantInstall', 'Replanting: install which card free (' + (n + 1) + ' of 2)?', pool.map(i => X.cardOpt(i)), { skip: 'Stop' });
        if (!u) break;
        yield* X.corpInstall(u, { free: true });
      }
    },
    botPlay: () => -1
  });
  S('cpc_generator', '12034', 'The first time each turn the Runner clicks for a credit, gain 1 credit.');
  on('cpc_generator', { on: { runnerBasic(X, iid, ctx) { if (ctx.what !== 'credit' || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; gainC(X, 1, 'cpc_generator'); } } });
  S('free_lunch', '12035', 'Spend a power counter on it: the Runner loses 1 credit.', { subs: [{ k: 'power' }, { k: 'power' }] });
  on('free_lunch', {
    abils: (X, iid) => [{ label: 'Free Lunch: spend a counter — the Runner loses 1', bad: X.card(iid).power ? null : 'No counters' }],
    use(X, iid) { X.card(iid).power--; loseR(X, 1, 'Free Lunch'); },
    winOpts: (X, iid) => X.card(iid).power && X.R.credits ? [{ label: 'Free Lunch: spend a counter — the Runner loses 1' }] : [],
    winUse(X, iid) { X.card(iid).power--; loseR(X, 1, 'Free Lunch'); },
    botAbil: () => 1.5, botWin: () => true
  });
  S('mca_informant', '12036', 'Terminal. Put it on an installed connection: the Runner counts as having a tag more; they may spend a click and 2 credits to trash that connection.');
  const conns = X => X.rigOf('resource').filter(i => kw(X, i, /Connection/));
  on('mca_informant', {
    playBad: (X) => conns(X).length ? null : 'The Runner has no connection',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'mcaInformant', 'MCA Informant: on which connection?', conns(X).map(i => X.cardOpt(i)), { always: true });
      if (!t) return;
      X.hostCorp(iid, t); X.card(iid).rez = true; X.card(iid).up = true;
      X.log({ t: 'note', side: 'corp', text: 'MCA Informant goes on ' + X.nameOf(t) });
    },
    mod: { alwaysTagged: (X, iid, v) => v || X.C.hosted.indexOf(iid) >= 0 },
    abilsFor: 'runner',
    abils: (X, iid) => X.C.hosted.indexOf(iid) >= 0 ? [{ label: 'Trash ' + X.nameOf(X.card(iid).host) + ' (with MCA Informant on it)', clicks: 1, cost: 2 }] : [],
    use(X, iid) { const h = X.card(iid).host; if (h) X.trashRunner(h, 'mca_informant'); },
    botAbil: () => 1.2, botPlay: () => 0.8
  });
  S('clyde_van_rite', '12037', 'When your turn begins, the Runner pays 1 credit or trashes the top card of their stack.');
  on('clyde_van_rite', { on: { *corpTurnBegin(X, iid) { if (X.avail('runner', 'any') >= 1 && (yield* X.yn(iid, 'runner', 'clyde', 'Clyde Van Rite: pay 1, or lose the top card of your stack?', 'Pay 1', 'Lose the card'))) { X.pay('runner', 1, 'any'); X.log({ t: 'paid', n: 1, k: 'clyde_van_rite' }); return; } mill(X, 1); X.log({ t: 'note', side: 'corp', text: 'Clyde Van Rite: the top of the stack is trashed' }); } }, bot: { clyde: (pub) => pub.runner.credits >= 4 ? 'yes' : 'no' } });
  S('watchtower', '12038', '', { subs: [{ k: 's', n: 0, text: 'The Corp finds a card in R&D and takes it; shuffle' }] });
  on('watchtower', { subs: [function* (X, iid) { if (!X.C.rd.length) return null; X.g.revealN++; const t = yield* X.ask(iid, 'corp', 'watchtower', 'Watchtower: take which card?', X.dedupe(X.C.rd.map(i => X.cardOpt(i))), { always: true }); if (t) { X.lift(t); X.C.hq.push(t); } X.shuffleRD(); return null; }], bot: { watchtower: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id } });
  S('sacrifice', '12039', 'As an extra cost, forfeit an agenda. Remove bad publicity equal to its points, and gain 1 credit for each removed.');
  on('sacrifice', {
    playBad: (X) => !agendasC(X).length ? 'No agenda to forfeit' : X.C.bp ? null : 'No bad publicity',
    *play(X, iid) { const ag = yield* X.ask(iid, 'corp', 'sacrifice', 'Sacrifice: forfeit which agenda?', agendasC(X).map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { always: true }); if (!ag) return; const n = X.dat(ag).pts || 0; forfeit(X, ag); const k = X.loseBP(n, 'Sacrifice'); gainC(X, k, 'sacrifice'); },
    botPlay: () => -1
  });
  S('sacw', '12040', 'Its strength cannot be lowered.', { noLower: true, subs: [{ k: 'etr' }] });

  /* ================================================================ BLOOD AND WATER */
  S('berserker', '12041', 'As you meet a barrier, +1 strength for each of its subroutines for that encounter. 2 credits: break up to 2 barrier subroutines.', { brk: { type: 'barrier', cost: 2, n: 2 } });
  on('berserker', { on: { encounter(X, iid, ctx) { if (X.typesOf(ctx.iid).indexOf('barrier') >= 0) ctx.E.pump[iid] = (ctx.E.pump[iid] || 0) + ctx.E.subs.length; } }, botPlay: () => 0.6 });
  S('persephone', '12042', '2 credits: break one sentry subroutine. 1 credit: +1 strength. After you pass a sentry you met, you may trash the top of your stack: the Corp trashes a card from the top of R&D for each of its subroutines that fired.', { brk: { type: 'sentry', cost: 2, n: 1 }, pump: { cost: 1, by: 1 } });
  on('persephone', {
    on: {
      encounterEnd(X, iid, ctx) { if (X.g.run) X.g.run.lastEnc = { iid: ctx.iid, fired: ctx.E.fired.length }; },
      *passIce(X, iid, ctx) {
        const le = ctx.S.lastEnc;
        if (!le || le.iid !== ctx.iid || X.typesOf(ctx.iid).indexOf('sentry') < 0 || !X.R.stack.length || !le.fired) return;
        if (!(yield* X.yn(iid, 'runner', 'persephone', 'Persephone: trash the top of your stack — the Corp loses ' + X.plural(le.fired, 'card') + ' off R&D?', 'Do it', 'No'))) return;
        mill(X, 1); millRD(X, le.fired);
        X.log({ t: 'note', side: 'runner', text: 'Persephone: ' + X.plural(le.fired, 'card') + ' off the top of R&D' });
      }
    },
    bot: { persephone: () => 'yes' }
  });
  S('rubicon_switch', '12043', 'Once a turn, a click and X credits: derez an ice rezzed this turn whose printed rez cost is X.');
  const rubiconPool = X => iceAll(X).filter(i => X.card(i).rez && X.card(i).x.rezTurn >= X.g.turnN - 1 && X.avail('runner', 'any') >= (X.dat(i).cost || 0));
  on('rubicon_switch', {
    abils: (X, iid) => [{ label: 'Rubicon Switch: derez an ice rezzed this turn', clicks: 1, once: 'rubicon', bad: rubiconPool(X).length ? null : 'No ice rezzed this turn you can pay for' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'rubicon', 'Rubicon Switch: derez which ice?', rubiconPool(X).map(i => X.cardOpt(i, null, 'pay ' + (X.dat(i).cost || 0))));
      if (!t) return;
      X.pay('runner', X.dat(t).cost || 0, 'any'); X.derez(t, 'rubicon_switch');
    },
    botAbil: () => 1, botPlay: () => 0.4
  });
  S('aeneas_informant', '12044', 'Whenever you access a card with a trash cost outside Archives and do not trash it, you may show it and gain 1 credit.');
  on('aeneas_informant', {
    on: {
      *accessed(X, iid, ctx) {
        if (ctx.from === 'arch' || X.trashCostOf(ctx.iid) == null) return;
        const seen = X.g.run && X.g.run.seen.find(s => s.iid === ctx.iid);
        if (seen && (seen.did === 'trashed' || seen.did === 'removed')) return;
        if (yield* X.yn(iid, 'runner', 'aeneas', 'Aeneas Informant: show ' + X.nameOf(ctx.iid) + ' and gain 1?', 'Gain 1', 'No')) { X.reveal('corp', [ctx.iid], 'Aeneas Informant'); gainR(X, 1, 'aeneas_informant'); }
      }
    },
    bot: { aeneas: () => 'yes' },
    botPlay: () => 0.8
  });
  S('rosetta_2', '12045', 'A click, remove one of your installed programs from the game: find a non-virus program in your stack and install it for that program’s cost less; shuffle.');
  on('rosetta_2', {
    abils: (X) => [{ label: 'Rosetta 2.0: swap a program for one from your stack', clicks: 1, bad: X.programs().length ? (X.R.stack.some(i => X.dat(i).type === 'program' && !X.dat(i).virus) ? null : 'No program in your stack') : 'No program to give up' }],
    *use(X, iid) {
      const old = yield* X.ask(iid, 'runner', 'rosettaOld', 'Rosetta 2.0: remove which program from the game?', X.programs().map(i => X.cardOpt(i)), { always: true });
      if (!old) return;
      const off = X.dat(old).cost || 0;
      for (const h of X.hostedOn(old)) X.trashRunner(h, 'host');
      X.lift(old); X.wipe(X.card(old)); X.R.gone.push(old);
      X.g.revealN++;
      const t = yield* X.ask(iid, 'runner', 'rosetta', 'Rosetta 2.0: install which program (' + off + ' less)?', X.dedupe(X.R.stack.filter(i => X.dat(i).type === 'program' && !X.dat(i).virus).map(i => X.cardOpt(i, null, X.installCost(i, off) + ' credits'))), { skip: 'None' });
      X.shuffleStack();
      if (t) yield* X.runnerInstall(t, { discount: off });
    },
    botAbil: () => -1, botPlay: () => 0.2
  });
  S('adjusted_matrix', '12046', 'Install it on an icebreaker. That icebreaker may lose a click to break one subroutine of an ice it can break.', { onBreaker: true });
  on('adjusted_matrix', {
    encOpts(X, iid, E) {
      const b = X.card(iid).host;
      if (!b || !X.isInstalled(b) || !X.dat(b).brk || X.R.clicks < 1 || X.g.run.noPrograms) return [];
      const t = X.dat(b).brk.type;
      if (t !== 'any' && X.typesOf(E.iid).indexOf(t) < 0) return [];
      if (X.breakerStr(b) < X.iceStr(E.iid, E)) return [];
      const k = E.broken.findIndex(x => !x);
      return k < 0 ? [] : [{ kind: 'break', sub: k, subs: [k], label: 'Adjusted Matrix (' + X.nameOf(b) + '): lose a click — break “' + X.subText(E.subs[k]) + '”', cost: 0 }];
    },
    *encUse(X, iid, n, E) { X.R.clicks--; const k = E.broken.findIndex(x => !x); const won = yield* X.breaking(E, [k]); for (const j of won) E.broken[j] = true; E.brokeAny = true; X.log({ t: 'break', how: 'adjusted_matrix', iid: E.iid, subs: won }); },
    botPlay: () => 0.3
  });
  S('dedicated_processor', '12047', 'Install it on an icebreaker that is not an AI. That icebreaker gains “2 credits: +4 strength”.', { onBreaker: true });
  on('dedicated_processor', {
    encOpts(X, iid, E) { const b = X.card(iid).host; if (!b || !X.isInstalled(b)) return []; return [{ kind: 'lower', label: 'Dedicated Processor: 2 credits — ' + X.nameOf(b) + ' +4 strength', cost: 2, bad: X.avail('runner', 'breaker', { b }) < 2 ? 'Costs 2' : null }]; },
    encUse(X, iid, n, E) { const b = X.card(iid).host; X.pay('runner', 2, 'breaker', { b }); E.pump[b] = (E.pump[b] || 0) + 4; },
    botPlay: () => 0.4
  });
  S('inversificator', '12048', '1 credit: break one code gate subroutine. 1 credit: +1 strength. The first time each turn you pass an ice it fully broke, you may swap that ice with another installed ice.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } });
  on('inversificator', {
    on: {
      fullyBroken(X, iid, ctx) { if (ctx.E.used.by && ctx.E.used.by[iid] >= ctx.E.subs.length && X.g.run) X.g.run.invFull = ctx.iid; },
      *passIce(X, iid, ctx) {
        if (ctx.S.invFull !== ctx.iid || X.card(iid).x.turn === X.g.turnN) return;
        const others = iceAll(X).filter(i => i !== ctx.iid);
        if (!others.length) return;
        const t = yield* X.ask(iid, 'runner', 'inversificator', 'Inversificator: swap ' + X.nameOf(ctx.iid) + ' with which ice?', others.map(i => ({ id: i, label: (X.card(i).rez ? X.nameOf(i) : 'Unrezzed ice') + ' · ' + X.srvName(X.serverOf(i)) })), { skip: 'No swap' });
        if (!t) return;
        X.card(iid).x.turn = X.g.turnN;
        const sv = X.serverOf(ctx.iid), p = sv.ice.indexOf(ctx.iid);
        swapPlaces(X, ctx.iid, t);
        ctx.S.nextPos = p - 1;
        X.log({ t: 'note', side: 'runner', text: 'Inversificator swaps two ice' });
      }
    },
    bot: { inversificator: () => 'skip' }
  });
  S('dadiana', '12049', 'When your turn begins, gain 1 credit if you have fewer than 6. Whenever you have no credits, trash her and take 3 meat damage.');
  function* dadianaCheck(X, iid) { if (X.R.credits === 0 && X.R.rig.indexOf(iid) >= 0) { X.trashRunner(iid, 'dadiana'); yield* X.damage('meat', 3, 'Dadiana Chacon'); } }
  on('dadiana', { on: { runnerTurnBegin(X) { if (X.R.credits < 6) gainR(X, 1, 'dadiana'); }, runnerAction: dadianaCheck, runEnd: dadianaCheck, corpTurnBegin: dadianaCheck }, botPlay: () => 0.4 });
  S('next_opal', '12050', 'A “you may install a card from HQ” subroutine for each rezzed NEXT ice.', { subs: [] });
  on('next_opal', {
    self: { subs: (X, iid, v) => { const n = iceAll(X).filter(i => X.card(i).rez && kw(X, i, /NEXT/)).length; const out = v.slice(); for (let k = 0; k < n; k++) out.push({ k: 's', n: 0, src: 'next_opal', text: 'The Corp may install a card from HQ' }); return out; } },
    subs: [function* (X, iid) { const pool = X.C.hq.filter(i => X.dat(i).type !== 'operation'); if (!pool.length) return null; const t = yield* X.ask(iid, 'corp', 'opal', 'NEXT Opal: install which card?', pool.map(i => X.cardOpt(i)), { skip: 'None' }); if (t) yield* X.corpInstall(t, {}); return null; }]
  });
  S('bioroid_work_crew', '12051', 'Right after you play an operation, trash it: install a card from HQ.');
  on('bioroid_work_crew', {
    abils: (X) => [{ label: 'Bioroid Work Crew: trash it — install a card from HQ', bad: X.C.flags.lastOp ? (X.C.hq.some(i => X.dat(i).type !== 'operation') ? null : 'Nothing to install') : 'Only right after you play an operation' }],
    on: { opDone(X) { X.C.flags.lastOp = X.g.turnN; }, install(X, iid, ctx) { if (ctx.side === 'corp') X.C.flags.lastOp = 0; }, advanced(X) { X.C.flags.lastOp = 0; } },
    *use(X, iid) { X.toArchives(iid, true); const t = yield* X.ask(iid, 'corp', 'workCrew', 'Bioroid Work Crew: install which card?', X.C.hq.filter(i => X.dat(i).type !== 'operation').map(i => X.cardOpt(i)), { skip: 'None' }); if (t) yield* X.corpInstall(t, {}); },
    botAbil: () => -1
  });
  S('aginfusion', '12052', 'Once a turn, trash the unrezzed ice the Runner is approaching: they move to the outside of another server.');
  on('aginfusion', {
    winOpts: (X, iid, ctx) => ctx.where === 'ice' && !X.card(ctx.iid).rez && X.card(iid).x.turn !== X.g.turnN && X.C.servers.length > 1 ? [{ label: 'AgInfusion: trash this ice — send the Runner to another server' }] : [],
    *winUse(X, iid, n, ctx) {
      X.card(iid).x.turn = X.g.turnN;
      const from = X.g.run.sid;
      X.toArchives(ctx.iid, false); X.log({ t: 'trashedIce', by: 'aginfusion' });
      const others = X.C.servers.filter(sv => sv.id !== from);
      if (!others.length) return null;
      const to = yield* X.ask(iid, 'corp', 'aginfusion', 'AgInfusion: send the Runner to which server?', others.map(sv => ({ id: sv.id, label: sv.name, sub: X.plural(sv.ice.length, 'ice') })), { always: true });
      X.g.run.sid = to;
      X.log({ t: 'note', side: 'corp', text: 'AgInfusion: the Runner is moved to ' + X.server(to).name });
      return { moved: to };
    },
    bot: { aginfusion: (pub, me, pr) => pr.options.slice().sort((a, b) => +b.sub.split(' ')[0] - +a.sub.split(' ')[0])[0].id },
    botWin: () => false
  });
  S('bamboo_dome', '12053', 'Install only in the root of R&D. A click: show the top 3 cards of R&D; take one into HQ in secret, the others back on top in any order. One region per server.', { rdOnly: true });
  on('bamboo_dome', {
    abils: (X) => [{ label: 'Bamboo Dome: take one of the top 3 of R&D', clicks: 1, bad: X.C.rd.length ? null : 'R&D is empty' }],
    *use(X, iid) {
      const top = X.C.rd.slice(0, 3);
      X.reveal('corp', top, 'Bamboo Dome');
      const t = yield* X.ask(iid, 'corp', 'bamboo', 'Bamboo Dome: which card goes into HQ?', top.map(i => X.cardOpt(i)), { always: true, secret: true });
      if (t) { X.lift(t); X.C.hq.push(t); }
      const rest = top.filter(i => i !== t);
      const order = yield* arrange(X, iid, 'corp', 'bambooOrder', rest, 'Bamboo Dome');
      for (const i of order) X.lift(i);
      X.C.rd.unshift(...order);
    },
    bot: { bamboo: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id },
    botAbil: () => 0.6
  });
  S('ben_musashi', '12054', 'Stealing an agenda from this server costs the Runner 2 net damage (still so for the run if they trash him as they access him).');
  on('ben_musashi', {
    mod: { stealNet: (X, iid, v, ctx) => X.serverOf(iid) && ctx.sid === X.serverOf(iid).id ? Math.max(v, 2) : v },
    on: { access(X, iid, ctx) { if (ctx.iid === iid && X.g.run) X.g.run.musashi = ctx.sid; } }
  });
  S('authenticator', '12055', 'When the Runner meets it, they may take a tag to slip past it.', { subs: [{ k: 'gain', n: 2 }, { k: 'etr' }] });
  on('authenticator', { *onEnc(X, iid) { if (yield* X.yn(iid, 'runner', 'authenticator', 'Authenticator: take a tag to slip past it?', 'Take a tag', 'Face it')) { yield* X.giveTags(1, 'Authenticator'); return 'pass'; } return null; }, bot: { authenticator: (pub) => pub.runner.tags ? 'no' : 'yes' } });
  S('henry_phillips', '12056', 'During a run on this server, whenever the Runner breaks a subroutine while tagged, gain 2 credits.');
  on('henry_phillips', { onBreaking(X, iid, ctx) { const sv = X.serverOf(iid); if (!sv || !X.g.run || X.g.run.sid !== sv.id || !X.tagged()) return; gainC(X, 2 * ctx.subs.length, 'henry_phillips'); } });
  S('battlement', '12057', '', { subs: [{ k: 'etr' }, { k: 'etr' }] });
  S('audacity', '12058', 'Only with at least 2 other cards in HQ. Trash all of HQ, then put 2 advancement tokens on cards you can advance.');
  on('audacity', {
    playBad: (X, iid) => X.C.hq.filter(i => i !== iid).length >= 2 ? null : 'Needs 2 other cards in HQ',
    *play(X, iid) {
      for (const t of X.C.hq.slice()) X.toArchives(t, false);
      for (let n = 0; n < 2; n++) {
        if (!X.advTargets().length) break;
        const t = yield* X.ask(iid, 'corp', 'audacity', 'Audacity: an advancement token on which card (' + (n + 1) + ' of 2)?', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')), { always: true });
        if (t) { X.card(t).adv++; X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'audacity' }); }
      }
    },
    botPlay: () => -1
  });
  S('red_planet', '12059', 'Triple. Move every advancement token from every installed card onto one card that can be advanced.');
  on('red_planet', {
    playBad: (X) => X.advTargets().length && X.corpPlaced().some(i => X.card(i).adv) ? null : 'No tokens to move',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'redPlanet', 'Red Planet Couriers: every advancement token onto which card?', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (!t) return;
      let n = 0; for (const i of X.corpPlaced()) if (i !== t) { n += X.card(i).adv; X.card(i).adv = 0; }
      X.card(t).adv += n;
      X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'red_planet', x: n });
    },
    botPlay: () => -1
  });
  S('owl', '12060', '', { subs: [{ k: 's', n: 0, text: 'An installed program goes back on top of the Runner’s stack' }] });
  on('owl', { subs: [function* (X, iid) { if (!X.programs().length) return null; const t = yield* X.ask(iid, 'corp', 'owl', 'Owl: which program goes back on top of the stack?', X.programs().map(i => X.cardOpt(i)), { always: true }); if (t) { toGrip(X, t); X.lift(t); X.R.stack.unshift(t); X.log({ t: 'note', side: 'corp', text: 'Owl: ' + X.nameOf(t) + ' goes back on top of the stack' }); } return null; }], bot: { owl: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id } });

  /* ================================================================ FREE MARS */
  S('alice_merchant', '12061', 'The first time each turn you make a successful run on Archives, the Corp trashes a card from HQ.');
  on('alice_merchant', { on: { *success(X, iid, ctx) { if (ctx.sid !== 'arch' || X.card(iid).x.turn === X.g.turnN || !X.C.hq.length) return; X.card(iid).x.turn = X.g.turnN; const t = yield* X.ask(iid, 'corp', 'alice', 'Alice Merchant: trash which card from HQ?', X.C.hq.map(i => X.cardOpt(i)), { always: true }); if (t) X.toArchives(t, false); X.log({ t: 'note', side: 'runner', text: 'Alice Merchant: the Corp trashes a card from HQ' }); } }, bot: { alice: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'operation') || pr.options[0]).id } });
  S('jarogniew', '12062', 'When installed, take a tag; it holds (your tags + 3) power counters. The Corp cannot trash it while you have another resource. A counter: prevent 1 meat damage. Trashed when empty.');
  on('jarogniew', {
    *onInstall(X, iid) { yield* X.giveTags(1, 'Jarogniew Mercs'); X.card(iid).power = X.R.tags + 3; },
    preventTrash(X, iid, ctx) { return ctx.iid === iid && X.rigOf('resource').some(i => i !== iid); },
    *prevent(X, iid, ctx) {
      if (ctx.kind !== 'meat' || !X.card(iid).power) return 0;
      const most = Math.min(ctx.n, X.card(iid).power);
      const opts = []; for (let n = 1; n <= most; n++) opts.push({ id: String(n), label: 'Prevent ' + n });
      const a = yield* X.ask(iid, 'runner', 'jarogniew', 'Jarogniew Mercs: spend counters to prevent meat damage?', opts, { skip: 'No' });
      if (!a) return 0;
      X.card(iid).power -= +a; X.log({ t: 'prevent', side: 'runner', k: 'jarogniew', n: +a });
      if (X.card(iid).power <= 0) X.trashRunner(iid, 'empty');
      return +a;
    },
    bot: { jarogniew: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botPlay: () => 0.3
  });
  S('maui', '12063', '+2 memory. X recurring credits for runs on HQ (X: the ice protecting HQ). One console only.', { console: true, memory: 2, recur: { n: 'hqIce', for: 'runHQ' } });
  S('bug_out_bag', '12064', 'Pay X to install it: X power counters. When your turn ends with an empty grip, draw a card per counter and trash it.', { cost: 0 });
  on('bug_out_bag', {
    *onInstall(X, iid) {
      const most = Math.min(10, X.avail('runner', 'any'));
      const opts = []; for (let n = 0; n <= most; n++) opts.push({ id: String(n), label: 'X = ' + n });
      const x = +(yield* X.ask(iid, 'runner', 'bugOut', 'Bug Out Bag: pay X for X counters', opts, { always: true }));
      X.pay('runner', x, 'any'); X.card(iid).power = x;
    },
    on: { runnerTurnEnd(X, iid) { if (X.R.grip.length) return; const n = X.card(iid).power; X.trashRunner(iid, 'used'); X.drawRunner(n, 'bug_out_bag'); } },
    bot: { bugOut: (pub, me, pr) => pr.options[Math.min(3, pr.options.length - 1)].id },
    botPlay: () => 0.3
  });
  S('keros', '12065', 'The first time each turn you derez an ice, gain 2 credits.');
  on('keros', { sync: { derezzed(X, iid, ctx) { if (X.dat(ctx.iid).type !== 'ice' || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; gainR(X, 2, 'keros'); } }, botPlay: () => 0.3 });
  S('daredevil', '12066', '+2 memory. The first time each turn you start a run on a server with 2 or more ice, draw 2. One console only.', { console: true, memory: 2 });
  on('daredevil', { on: { runBegin(X, iid, ctx) { const sv = X.server(ctx.sid); if (!sv || sv.ice.length < 2 || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; X.drawRunner(2, 'daredevil'); } }, botPlay: () => 1 });
  S('mass_driver', '12067', '2 credits: break one code gate subroutine. 1 credit: +1 strength. When it fully breaks an ice, the first 3 subroutines of the next encounter this run do not fire.', { brk: { type: 'code gate', cost: 2, n: 1 }, pump: { cost: 1, by: 1 } });
  on('mass_driver', { on: { fullyBroken(X, iid, ctx) { if (ctx.E.used.by && ctx.E.used.by[iid] >= ctx.E.subs.length && X.g.run) { X.g.run.skipSubs = 3; X.g.run.skipBy = 'Mass-Driver'; } } } });
  S('warroid_tracker', '12068', 'Whenever the Runner trashes a card in or before this server, trace 4: they trash 2 of their installed cards.');
  on('warroid_tracker', {
    on: {
      *runnerTrashed(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || !ctx.installed || ctx.from !== sv.id || X.g.run && X.g.run.warroid) return;
        if (X.g.run) X.g.run.warroid = true;
        if (!(yield* X.trace(4, 'Warroid Tracker')).ok) return;
        for (let n = 0; n < 2 && X.R.rig.length; n++) { const t = yield* X.ask(iid, 'runner', 'warroid', 'Warroid Tracker: trash which of your cards (' + (n + 1) + ' of 2)?', X.R.rig.map(i => X.cardOpt(i)), { always: true }); if (t) X.trashRunner(t, 'Warroid Tracker'); }
      }
    },
    bot: { warroid: cheapest }
  });
  S('loki', '12069', 'When the Runner meets it, choose another rezzed ice: for the run it has that ice’s subtypes, and that ice’s subroutines before its own.', { subs: [{ k: 's', n: 0, text: 'End the run unless the Runner shuffles their grip into their stack' }] });
  on('loki', {
    *onEnc(X, iid, ctx) {
      const pool = iceAll(X).filter(i => i !== iid && X.card(i).rez);
      if (!pool.length) return null;
      const t = yield* X.ask(iid, 'corp', 'loki', 'Loki: copy which ice?', pool.map(i => X.cardOpt(i, null, X.subsOf(i).length + ' subroutines')), { always: true });
      if (!t) return null;
      X.g.run.loki = { iid, from: t };
      const add = X.subsOf(t).map(s => Object.assign({}, s, s.k === 's' && !s.src ? { src: X.card(t).k } : {}));
      ctx.E.subs.unshift(...add); for (let k = 0; k < add.length; k++) ctx.E.broken.unshift(false);
      X.log({ t: 'note', side: 'corp', text: 'Loki takes on ' + X.nameOf(t) });
      return null;
    },
    mod: { iceTypes: (X, iid, v, ctx) => { const l = X.g.run && X.g.run.loki; if (!l || l.iid !== ctx.iid || !X.card(l.from)) return v; const extra = (X.dat(l.from).ice || []).filter(t => v.indexOf(t) < 0); return extra.length ? v.concat(extra) : v; } },
    subs: [function* (X, iid) { if (yield* X.yn(iid, 'runner', 'lokiShuffle', 'Loki: shuffle your grip into your stack, or the run ends?', 'Shuffle it', 'Let the run end')) { for (const t of X.R.grip.splice(0)) X.R.stack.push(t); X.shuffleStack(true); return null; } return 'end'; }],
    bot: { loki: (pub, me, pr) => pr.options.slice().sort((a, b) => parseInt(b.sub) - parseInt(a.sub))[0].id, lokiShuffle: (pub, me) => (me.hand || []).length <= 2 ? 'yes' : 'no' }
  });
  S('obokata', '12070', 'Stealing it costs the Runner 4 net damage.');
  on('obokata', { self: { stealNet: (X, iid, v) => Math.max(v, 4) } });
  S('miraju', '12071', 'When an encounter with it ends and its subroutine was broken, the Runner is moved to the outside of Archives instead of passing it (they may jack out); it derezzes.', { subs: [{ k: 's', n: 0, text: 'The Corp may draw a card, then shuffle a card from HQ into R&D' }] });
  on('miraju', {
    on: { encounterEnd(X, iid, ctx) { if (ctx.iid !== iid || !ctx.E.broken[0] || !X.g.run || X.g.run.sid === 'arch') return; ctx.E.moveTo = 'arch'; X.derez(iid, 'miraju'); X.log({ t: 'note', side: 'corp', text: 'Mirāju: the Runner is sent to Archives' }); } },
    subs: [function* (X, iid) {
      if (X.C.rd.length && (yield* X.yn(iid, 'corp', 'miraju', 'Mirāju: draw a card?', 'Draw', 'No'))) X.drawCorp(1, 'miraju');
      if (!X.C.hq.length) return null;
      const t = yield* X.ask(iid, 'corp', 'mirajuBack', 'Mirāju: shuffle which card from HQ into R&D?', X.C.hq.map(i => X.cardOpt(i)), { always: true });
      if (t) { X.lift(t); X.C.rd.push(t); X.shuffleRD(); }
      return null;
    }],
    bot: { miraju: () => 'yes' }
  });
  S('shipment_tennin', '12072', 'Only if the Runner made no successful run last turn. Put 2 advancement tokens on an installed card.');
  on('shipment_tennin', {
    playBad: (X) => X.R.last.success ? 'The Runner made a successful run last turn' : X.corpPlaced().length ? null : 'Nothing installed',
    *play(X, iid) { const t = yield* X.ask(iid, 'corp', 'tennin', 'Shipment from Tennin: 2 advancement tokens on which card?', X.corpPlaced().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true }); if (t) { X.card(t).adv += 2; X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'shipment_tennin', x: 2 }); } },
    bot: { tennin: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id },
    botPlay: () => 1
  });
  S('escalate_vitriol', '12073', 'Once a turn, a click: gain 1 credit for each tag the Runner has.');
  on('escalate_vitriol', { abils: (X) => [{ label: 'Escalate Vitriol: gain ' + X.R.tags, clicks: 1, once: 'vitriol', bad: X.R.tags ? null : 'The Runner has no tags' }], use(X) { gainC(X, X.R.tags, 'escalate_vitriol'); }, botAbil: (pub) => pub.runner.tags >= 2 ? 2 : -1 });
  S('reeducation', '12074', 'When scored, put any number of cards from HQ at the bottom of R&D and draw that many; if the Runner has as many cards, that many random cards from their grip go to the bottom of their stack.');
  on('reeducation', {
    *onScore(X, iid) {
      if (!X.C.hq.length) return;
      const ts = yield* X.ask(iid, 'corp', 'reeducation', 'Reeducation: which cards from HQ go to the bottom of R&D?', X.C.hq.map(i => X.cardOpt(i)), { multi: true, min: 0, max: X.C.hq.length });
      for (const t of ts) { X.lift(t); X.C.rd.push(t); }
      X.drawCorp(ts.length, 'reeducation');
      if (ts.length && X.R.grip.length >= ts.length) { for (let k = 0; k < ts.length; k++) { const t = X.R.grip[Math.floor(X.rand() * X.R.grip.length)]; X.lift(t); X.R.stack.push(t); } X.log({ t: 'note', side: 'corp', text: 'Reeducation: ' + X.plural(ts.length, 'card') + ' from the grip to the bottom of the stack' }); }
    },
    bot: { reeducation: (pub, me, pr) => pr.options.slice(0, Math.min(2, pr.options.length)).map(o => o.id) }
  });
  S('traffic_analyzer', '12075', 'Whenever you rez an ice protecting this server, trace 2: gain 1 credit.');
  on('traffic_analyzer', { on: { *rez(X, iid, ctx) { const sv = X.serverOf(iid); if (!sv || sv.ice.indexOf(ctx.iid) < 0) return; if ((yield* X.trace(2, 'Traffic Analyzer')).ok) gainC(X, 1, 'traffic_analyzer'); } } });
  S('meteor_mining', '12076', 'When scored, you may gain 7 credits — or, if the Runner has 2 tags or more, do 7 meat damage instead.');
  on('meteor_mining', { *onScore(X, iid) { const a = yield* X.ask(iid, 'corp', 'meteor', 'Meteor Mining: gain 7, or 7 meat damage?', [{ id: 'gain', label: 'Gain 7' }, { id: 'meat', label: '7 meat damage', bad: X.R.tags >= 2 ? null : 'The Runner needs 2 tags' }], { skip: 'Neither' }); if (a === 'gain') gainC(X, 7, 'meteor_mining'); if (a === 'meat') yield* X.damage('meat', 7, 'Meteor Mining'); }, bot: { meteor: (pub) => pub.runner.tags >= 2 ? 'meat' : 'gain' } });
  S('standoff', '12077', 'When scored, the Runner may trash one of their installed cards; if not, you draw 1 and gain 5. If they do, you may trash one of yours to repeat.');
  on('standoff', {
    *onScore(X, iid) {
      for (let guard = 0; guard < 20; guard++) {
        const t = X.R.rig.length ? yield* X.ask(iid, 'runner', 'standoffR', 'Standoff: trash one of your installed cards (or the Corp draws 1 and gains 5)?', X.R.rig.map(i => X.cardOpt(i)), { skip: 'Let them have it' }) : null;
        if (!t) { X.drawCorp(1, 'standoff'); gainC(X, 5, 'standoff'); return; }
        X.trashRunner(t, 'Standoff');
        const u = X.corpPlaced().length ? yield* X.ask(iid, 'corp', 'standoffC', 'Standoff: trash one of your installed cards to go again?', X.corpPlaced().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { skip: 'Stop' }) : null;
        if (!u) return;
        X.toArchives(u, X.card(u).rez);
      }
    },
    bot: { standoffR: () => 'skip', standoffC: () => 'skip' }
  });
  S('success', '12078', 'Triple. As an extra cost, forfeit an agenda. Advance a card as many times as that agenda needed.');
  on('success', {
    playBad: (X) => !agendasC(X).length ? 'No agenda to forfeit' : X.advTargets().length ? null : 'Nothing to advance',
    *play(X, iid) {
      const ag = yield* X.ask(iid, 'corp', 'successAg', 'Success: forfeit which agenda?', agendasC(X).map(i => X.cardOpt(i, null, 'advance ' + X.dat(i).adv + ' times')), { always: true });
      if (!ag) return;
      const n = X.dat(ag).adv || 0; forfeit(X, ag);
      const t = yield* X.ask(iid, 'corp', 'successTo', 'Success: advance which card ' + n + ' times?', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (!t) return;
      for (let k = 0; k < n; k++) { X.card(t).adv++; yield* X.emit('advanced', { iid: t, n: 1 }); }
      X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'success', x: n });
    },
    botPlay: () => -1
  });
  S('whampoa', '12079', 'Once a turn, trash a card from HQ: put a card from Archives at the bottom of R&D.');
  on('whampoa', {
    abils: (X) => [{ label: 'Whampoa Reclamation: trash a card from HQ — a card from Archives to the bottom of R&D', once: 'whampoa', bad: X.C.hq.length && X.C.arch.length ? null : 'Needs a card in HQ and one in Archives' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'whampoaHQ', 'Whampoa Reclamation: trash which card from HQ?', X.C.hq.map(i => X.cardOpt(i)), { always: true });
      if (t) X.toArchives(t, false);
      const u = yield* X.ask(iid, 'corp', 'whampoaArch', 'Whampoa Reclamation: which card from Archives to the bottom of R&D?', X.C.arch.map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { always: true });
      if (u) { X.lift(u); X.card(u).up = false; X.C.rd.push(u); X.log({ t: 'archToRD', n: 1 }); }
    },
    botAbil: () => -1
  });
  S('mass_commercialization', '12080', 'Gain 2 credits for each installed card with an advancement token.');
  on('mass_commercialization', { play(X) { gainC(X, 2 * X.corpPlaced().filter(i => X.card(i).adv > 0).length, 'mass_commercialization'); }, botPlay: (pub) => -1 });

  /* ================================================================ CRIMSON DUST */
  S('mars_for_martians', '12081', 'Priority. Draw a card for each clan resource you have; gain 1 credit for each tag.');
  on('mars_for_martians', { play(X) { X.drawRunner(X.rigOf('resource').filter(i => kw(X, i, /Clan/)).length, 'mars_for_martians'); gainR(X, X.R.tags, 'mars_for_martians'); }, botPlay: () => 0.4 });
  S('god_of_war', '12082', 'When your turn begins, you may take a tag for 2 virus counters on it. A virus counter: break one subroutine. 2 credits: +1 strength.', Object.assign({ str: 0 }, { brk: { type: 'any', cost: 1, n: 1, only: ['__script'] } }));
  on('god_of_war', {
    on: { *runnerTurnBegin(X, iid) { if (yield* X.yn(iid, 'runner', 'godOfWar', 'God of War: take a tag for 2 virus counters?', 'Take it', 'No')) { yield* X.giveTags(1, 'God of War'); X.addVirus(iid, 2); } } },
    encOpts(X, iid, E) {
      if (X.g.run.noPrograms) return [];
      const open = E.subs.map((s, k) => k).filter(k => !E.broken[k]);
      const need = Math.max(0, X.iceStr(E.iid, E) - X.breakerStr(iid));
      const v = X.virusOf(iid);
      return open.slice(0, v).map((s, j) => ({ kind: 'break', subs: open.slice(0, j + 1), label: 'God of War: ' + X.plural(j + 1, 'virus counter') + (need ? ' and ' + 2 * need + ' credits' : '') + ' — break ' + (j + 1), cost: 2 * need, bad: X.avail('runner', 'breaker', { b: iid }) < 2 * need ? 'Costs ' + 2 * need : null }));
    },
    *encUse(X, iid, n, E) {
      const open = E.subs.map((s, k) => k).filter(k => !E.broken[k]);
      const need = Math.max(0, X.iceStr(E.iid, E) - X.breakerStr(iid));
      X.pay('runner', 2 * need, 'breaker', { b: iid }); E.pump[iid] = (E.pump[iid] || 0) + need;
      X.spendVirus(iid, n + 1);
      const won = yield* X.breaking(E, open.slice(0, n + 1));
      for (const k of won) E.broken[k] = true; E.brokeAny = true;
      X.log({ t: 'break', how: 'god_of_war', iid: E.iid, subs: won });
    },
    bot: { godOfWar: (pub) => pub.runner.tags ? 'no' : 'yes' },
    botPlay: () => 0.4
  });
  S('leave_no_trace', '12083', 'Run any server. When it ends, every ice rezzed during it is derezzed.');
  on('leave_no_trace', Object.assign(anyRunL('Leave No Trace'), {
    on: { rez(X, iid, ctx) { if (X.g.run && X.g.run.o.card === iid && X.dat(ctx.iid).type === 'ice') (X.g.run.lnt = X.g.run.lnt || []).push(ctx.iid); } },
    runEnd(X, iid, ctx) { for (const t of ctx.S.lnt || []) if (X.isInstalled(t)) X.derez(t, 'leave_no_trace'); },
    botPlay: () => 0.6
  }));
  S('rip_deal', '12084', 'Run HQ. If successful, you may take as many cards from your heap as you would access from HQ, accessing none of HQ itself (the root still). It leaves the game when the run ends.');
  on('rip_deal', {
    playBad: (X) => X.runBad('hq', 1),
    *play(X, iid) { yield* X.run('hq', { card: iid, via: 'rip_deal' }); },
    *success(X, iid, ctx) {
      const n = Math.max(0, X.mod('accessHQ', 1 + (ctx.S.o.extraHQ || 0), { S: ctx.S }));
      const pool = X.R.heap.filter(i => i !== iid);
      if (!n || !pool.length || X.heapLocked()) return null;
      if (!(yield* X.yn(iid, 'runner', 'ripDeal', 'Rip Deal: take ' + X.plural(Math.min(n, pool.length), 'card') + ' from your heap instead of accessing HQ?', 'Take them', 'Access HQ'))) return null;
      const ts = yield* X.ask(iid, 'runner', 'ripPick', 'Rip Deal: which cards?', X.dedupe(pool.map(i => X.cardOpt(i))).length >= Math.min(n, pool.length) ? pool.map(i => X.cardOpt(i)) : pool.map(i => X.cardOpt(i)), { multi: true, min: Math.min(n, pool.length), max: Math.min(n, pool.length) });
      for (const t of ts) { X.lift(t); X.R.grip.push(t); }
      ctx.S.noHQCards = true;
      return null;
    },
    runEnd(X, iid) { if (X.R.heap.indexOf(iid) >= 0) { X.lift(iid); X.R.gone.push(iid); } },
    bot: { ripDeal: () => 'no' },
    botPlay: () => 0.4
  });
  S('flashbang', '12085', '6 credits: derez the sentry you are meeting. 1 credit: +1 strength.', { str: 0, brk: { type: 'sentry', cost: 1, n: 1, only: ['__script'] }, pump: { cost: 1, by: 1 } });
  on('flashbang', {
    encOpts(X, iid, E) {
      if (X.typesOf(E.iid).indexOf('sentry') < 0 || X.g.run.noPrograms) return [];
      const need = Math.max(0, X.iceStr(E.iid, E) - X.breakerStr(iid)), cost = 6 + need;
      return [{ kind: 'all', subs: E.broken.map((b, k) => b ? null : k).filter(k => k != null), label: 'Flashbang: ' + cost + ' credits — derez ' + X.nameOf(E.iid), cost, bad: X.avail('runner', 'breaker', { b: iid }) < cost ? 'Costs ' + cost : null }];
    },
    encUse(X, iid, n, E) { const need = Math.max(0, X.iceStr(E.iid, E) - X.breakerStr(iid)); X.pay('runner', 6 + need, 'breaker', { b: iid }); X.derez(E.iid, 'flashbang'); return 'pass'; },
    botPlay: () => 0.4
  });
  S('lean_and_mean', '12086', 'Run any server. With 3 or fewer programs installed, every icebreaker has +2 strength during the run.');
  on('lean_and_mean', Object.assign(anyRunL('Lean and Mean', (X) => ({ lean: X.programs().length <= 3 })), { runMod: { breakerStr: (X, iid, v) => X.g.run && X.g.run.o.lean ? v + 2 : v }, botPlay: () => 0.6 }));
  S('maven', '12087', '+1 strength for each installed program. 2 credits: break one subroutine.', { str: 0, brk: { type: 'any', cost: 2, n: 1 } });
  on('maven', { self: { breakerStr: (X, iid, v) => v + X.programs().length } });
  S('nanotk', '12088', 'During runs, +1 strength for each ice protecting the attacked server. 1 credit: break one sentry subroutine. 3 credits: +2 strength.', { brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 3, by: 2 } });
  on('nanotk', { self: { breakerStr: (X, iid, v) => X.g.run && X.server(X.g.run.sid) ? v + X.server(X.g.run.sid).ice.length : v } });
  S('bloo_moose', '12089', 'When your turn begins, you may remove a card in your heap from the game to gain 2 credits.');
  on('bloo_moose', { on: { *runnerTurnBegin(X, iid) { if (!X.R.heap.length || X.heapLocked()) return; const t = yield* X.ask(iid, 'runner', 'blooMoose', 'Bloo Moose: remove a card in your heap from the game for 2 credits?', X.dedupe(X.R.heap.map(i => X.cardOpt(i))), { skip: 'No' }); if (t) { X.lift(t); X.R.gone.push(t); gainR(X, 2, 'bloo_moose'); } } }, bot: { blooMoose: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'event') || pr.options[0]).id }, botPlay: () => 1.2 });
  S('o2_shortage', '12090', 'The Runner may trash a random card from their grip; if they do not, you gain two clicks.');
  on('o2_shortage', { *play(X, iid) { if (X.R.grip.length && (yield* X.yn(iid, 'runner', 'o2', 'O₂ Shortage: trash a random card from your grip (or the Corp gains two clicks)?', 'Trash a card', 'Let them have the clicks'))) { const t = X.R.grip[Math.floor(X.rand() * X.R.grip.length)]; X.lift(t); X.card(t).up = true; X.R.heap.push(t); return; } X.C.clicks += 2; X.log({ t: 'clicks', side: 'corp', n: 2, k: 'o2_shortage' }); }, bot: { o2: (pub) => 'yes' }, botPlay: () => 0.4 });
  S('helheim', '12091', 'During a run on this server, trash a card from HQ: every ice protecting this server has +2 strength for the run.');
  on('helheim', {
    winOpts: (X, iid) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id && X.C.hq.length ? [{ label: 'Helheim Servers: trash a card from HQ — ice here +2 strength' }] : [],
    *winUse(X, iid) { const t = yield* X.ask(iid, 'corp', 'helheim', 'Helheim Servers: trash which card from HQ?', X.C.hq.map(i => X.cardOpt(i)), { always: true }); if (t) X.toArchives(t, false); X.g.run.helheim = (X.g.run.helheim || 0) + 2; X.log({ t: 'note', side: 'corp', text: 'Helheim Servers: the ice here is 2 stronger this run' }); },
    mod: { iceStr: (X, iid, v, ctx) => X.g.run && X.g.run.helheim && X.serverOf(iid) && X.serverOf(iid).ice.indexOf(ctx.iid) >= 0 ? v + X.g.run.helheim : v },
    botWin: () => false
  });
  S('msr', '12092', 'When scored, rearrange any of your ice.');
  on('msr', {
    *onScore(X, iid) {
      for (let n = 0; n < 6; n++) {
        const ice = iceAll(X);
        if (ice.length < 2) return;
        const opt = i => ({ id: i, label: (X.card(i).rez ? X.nameOf(i) : X.nameOf(i) + ' (unrezzed)') + ' · ' + X.srvName(X.serverOf(i)) + ', position ' + (X.serverOf(i).ice.indexOf(i) + 1), card: X.card(i).k });
        const a = yield* X.ask(iid, 'corp', 'msrA', 'Mandatory Seed Replacement: swap which ice?', ice.map(opt), { skip: 'Done' });
        if (!a) return;
        const b = yield* X.ask(iid, 'corp', 'msrB', 'Mandatory Seed Replacement: with which?', ice.filter(i => i !== a).map(opt), { always: true });
        if (b) { swapPlaces(X, a, b); X.log({ t: 'note', side: 'corp', text: 'Mandatory Seed Replacement swaps two ice' }); }
      }
    },
    bot: { msrA: () => 'skip' }
  });
  S('water_monopoly', '12093', 'Every resource that is not virtual costs 1 more to install.');
  on('water_monopoly', { mod: { installCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'resource' && !kw(X, ctx.iid, /Virtual/) ? v + 1 : v } });
  S('metamorph', '12094', '', { subs: [{ k: 's', n: 0, text: 'Swap two other installed ice, or two of the Corp’s installed cards that are not ice' }] });
  on('metamorph', {
    subs: [function* (X, iid) {
      const ice = iceAll(X).filter(i => i !== iid), non = X.corpPlaced().filter(i => X.dat(i).type !== 'ice' && X.C.hosted.indexOf(i) < 0);
      const a = yield* X.ask(iid, 'corp', 'metamorph', 'Metamorph: swap two ice, or two cards that are not ice?', [{ id: 'ice', label: 'Two ice', bad: ice.length >= 2 ? null : 'Not enough ice' }, { id: 'non', label: 'Two cards that are not ice', bad: non.length >= 2 ? null : 'Not enough cards' }], { skip: 'Neither' });
      if (!a) return null;
      const pool = a === 'ice' ? ice : non;
      const ts = yield* X.ask(iid, 'corp', 'metamorphPick', 'Metamorph: which two?', pool.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { multi: true, min: 2, max: 2 });
      /* An agenda or asset may not end up in the root of a central server. */
      const okIn = (i, other) => ['agenda', 'asset'].indexOf(X.dat(i).type) < 0 || /^r[0-9]+$/.test(X.serverOf(other).id);
      if (ts.length === 2 && a === 'non' && !(okIn(ts[0], ts[1]) && okIn(ts[1], ts[0]))) { X.log({ t: 'note', side: 'corp', text: 'Metamorph: those two cannot change places' }); return null; }
      if (ts.length === 2) {
        const sv = X.g.run && X.server(X.g.run.sid), here = sv ? sv.ice.indexOf(iid) : -1;
        swapPlaces(X, ts[0], ts[1]);
        if (X.g.run && here >= 0 && sv.ice.indexOf(iid) >= 0) X.g.run.nextPos = sv.ice.indexOf(iid) - 1;
        X.log({ t: 'note', side: 'corp', text: 'Metamorph swaps two cards' });
      }
      return null;
    }],
    bot: { metamorph: () => 'skip' }
  });
  S('data_loop', '12095', 'When the Runner meets it, they put 2 cards from their grip on top of their stack.', { subs: [{ k: 's', n: 0, text: 'End the run if the Runner is tagged' }, { k: 'etr' }] });
  on('data_loop', {
    *onEnc(X, iid) {
      const n = Math.min(2, X.R.grip.length);
      if (!n) return null;
      const ts = yield* X.ask(iid, 'runner', 'dataLoop', 'Data Loop: which ' + X.plural(n, 'card') + ' go back on top of your stack?', X.R.grip.map(i => X.cardOpt(i)), { multi: true, min: n, max: n });
      for (const t of ts) { X.lift(t); X.R.stack.unshift(t); }
      return null;
    },
    subs: [function (X) { return X.tagged() ? 'end' : null; }],
    bot: { dataLoop: (pub, me, pr) => pr.options.slice(0, pr.min).map(o => o.id) }
  });
  S('biased_reporting', '12096', 'Name resource, hardware or program: the Runner may trash any of theirs of that type (1 credit each); you gain 2 for each left.');
  on('biased_reporting', {
    *play(X, iid) {
      const type = yield* X.ask(iid, 'corp', 'biased', 'Biased Reporting: which type?', ['resource', 'hardware', 'program'].map(t => ({ id: t, label: t[0].toUpperCase() + t.slice(1), sub: X.plural(X.rigOf(t).length, 'installed') })), { always: true });
      const mine = X.rigOf(type);
      const ts = mine.length ? yield* X.ask(iid, 'runner', 'biasedTrash', 'Biased Reporting: trash which ' + type + 's (1 credit each)?', mine.map(i => X.cardOpt(i)), { multi: true, min: 0, max: mine.length }) : [];
      for (const t of ts) X.trashRunner(t, 'biased_reporting');
      gainR(X, ts.length, 'biased_reporting');
      gainC(X, 2 * X.rigOf(type).length, 'biased_reporting');
    },
    bot: { biased: (pub, me, pr) => pr.options.slice().sort((a, b) => parseInt(b.sub) - parseInt(a.sub))[0].id, biasedTrash: () => [] },
    botPlay: (pub) => pub.runner.rig.length >= 4 ? 1.4 : -1
  });
  S('open_forum', '12097', 'After your mandatory draw, show the top card of R&D and take it, then put a card from HQ on top of R&D.');
  on('open_forum', {
    on: {
      *corpDrew(X, iid, ctx) {
        if (!ctx.mandatory || !X.C.rd.length) return;
        const t = X.C.rd[0]; X.reveal('corp', [t], 'Open Forum'); X.lift(t); X.C.hq.push(t);
        const u = yield* X.ask(iid, 'corp', 'openForum', 'Open Forum: which card goes on top of R&D?', X.C.hq.map(i => X.cardOpt(i)), { always: true });
        if (u) { X.lift(u); X.C.rd.unshift(u); }
      }
    }
  });
  S('tithonium', '12098', 'You may forfeit an agenda to rez it instead of paying. It cannot carry cards.', { altForfeit: true, noHost: true, subs: [{ k: 'trashProg' }, { k: 'trashProg' }, { k: 's', n: 0, text: 'Trash a resource, end the run' }] });
  on('tithonium', { subs: [function* (X, iid) { const r = X.rigOf('resource'); if (r.length) { const t = yield* X.ask(iid, 'corp', 'tithonium', 'Tithonium: trash which resource?', r.map(i => X.cardOpt(i)), { always: true }); if (t) yield* X.corpTrashes(t, 'Tithonium'); } return 'end'; }] });
  S('transparency', '12099', 'Turn an installed agenda face up and put this on it: it is public, and you gain 1 credit whenever you advance it.');
  const hiddenAgendas = X => X.corpPlaced().filter(i => X.dat(i).type === 'agenda' && !X.card(i).x.faceup);
  on('transparency', {
    playBad: (X) => hiddenAgendas(X).length ? null : 'No face-down agenda installed',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'transparency', 'Transparency Initiative: which agenda?', hiddenAgendas(X).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (!t) return;
      X.card(t).x.faceup = true; X.reveal('corp', [t], 'Transparency Initiative');
      X.hostCorp(iid, t); X.card(iid).rez = true; X.card(iid).up = true;
    },
    on: { advanced(X, iid, ctx) { if (X.card(iid).host === ctx.iid) gainC(X, 1, 'transparency'); } },
    botPlay: () => -1
  });
  S('rover_algorithm', '12100', 'Put it on a rezzed ice: that ice has +1 strength per power counter on this, and gains a counter whenever the Runner passes it.');
  on('rover_algorithm', {
    playBad: (X) => iceAll(X).some(i => X.card(i).rez) ? null : 'No rezzed ice',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'rover', 'Rover Algorithm: on which ice?', iceAll(X).filter(i => X.card(i).rez && !X.dat(i).noHost).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (!t) return;
      X.hostCorp(iid, t); X.card(iid).rez = true; X.card(iid).up = true;
    },
    on: { passIce(X, iid, ctx) { if (X.card(iid).host === ctx.iid) X.card(iid).power++; } },
    mod: { iceStr: (X, iid, v, ctx) => X.card(iid).host === ctx.iid ? v + X.card(iid).power : v },
    bot: { rover: (pub, me, pr) => pr.options[0].id },
    botPlay: () => 0.5
  });

  /* ================================================================ SOVEREIGN SIGHT */
  S('mining_accident', '12101', 'Only after a successful run on HQ, R&D or Archives this turn. The Corp pays 5 or takes a bad publicity. It leaves the game.');
  on('mining_accident', {
    playBad: (X) => X.R.flags.succCentral ? null : 'Only after a successful run on HQ, R&D or Archives this turn',
    *play(X, iid) {
      X.lift(iid); X.R.gone.push(iid);
      if (X.C.credits >= 5 && (yield* X.yn(iid, 'corp', 'miningAccident', 'Mining Accident: pay 5, or take a bad publicity?', 'Pay 5', 'Take the bad publicity'))) { X.pay('corp', 5, 'any'); X.log({ t: 'note', side: 'corp', text: 'The Corp pays 5 (Mining Accident)' }); return; }
      yield* X.takeBP(1, 'Mining Accident');
    },
    bot: { miningAccident: (pub) => pub.corp.credits >= 12 ? 'yes' : 'no' },
    botPlay: () => 1
  });
  S('respirocytes', '12102', 'When installed, 1 meat damage. The first time each turn your grip is empty, draw a card and put a power counter on it; at 3 it is trashed.');
  function* respCheck(X, iid) {
    if (X.R.grip.length || X.card(iid).x.turn === X.g.turnN || X.R.rig.indexOf(iid) < 0 || !X.R.stack.length) return;
    X.card(iid).x.turn = X.g.turnN; X.drawRunner(1, 'respirocytes'); X.card(iid).power++;
    if (X.card(iid).power >= 3) X.trashRunner(iid, 'empty');
  }
  on('respirocytes', { *onInstall(X) { yield* X.damage('meat', 1, 'Respirocytes'); }, on: { runnerAction: respCheck, runEnd: respCheck, play: respCheck, install: respCheck }, botPlay: () => 0.2 });
  S('vanadis', '12103', 'In a turn you took damage, trash it: the Corp trashes the top X cards of R&D (X: the damage you took this turn).');
  on('vanadis', {
    on: { damaged(X, iid, ctx) { X.R.flags.dmgN = (X.R.flags.dmgN || 0) + (ctx.n || 0); } },
    abils: (X) => [{ label: 'Salvaged Vanadis Armory: trash it — ' + (X.R.flags.dmgN || 0) + ' cards off R&D', bad: X.R.flags.dmgN ? null : 'Only after you took damage this turn' }],
    use(X, iid) { const n = X.R.flags.dmgN || 0; X.trashRunner(iid, 'used'); millRD(X, n); X.log({ t: 'note', side: 'runner', text: 'Salvaged Vanadis Armory: ' + X.plural(n, 'card') + ' off the top of R&D' }); },
    botAbil: () => 1.5, botPlay: () => 0.3
  });
  S('aumakua', '12104', '+1 strength per virus counter. A counter whenever you expose a card, and whenever you finish an access stealing and trashing nothing. 1 credit: break one subroutine.', { str: 0, strVirus: true, virus: true, brk: { type: 'any', cost: 1, n: 1 } });
  on('aumakua', {
    on: { expose(X, iid) { X.addVirus(iid, 1); }, runEnd(X, iid, ctx) { if (ctx.how === 'success' && !ctx.S.seen.some(s => s.did === 'stolen' || s.did === 'trashed')) X.addVirus(iid, 1); } },
    botPlay: () => 0.6
  });
  S('caldera', '12105', '3 credits: prevent 1 brain or net damage.');
  on('caldera', {
    *prevent(X, iid, ctx) {
      if (ctx.kind !== 'brain' && ctx.kind !== 'net') return 0;
      let p = 0;
      while (p < ctx.n && X.avail('runner', 'any') >= 3 && (yield* X.yn(iid, 'runner', 'caldera', 'Caldera: pay 3 to prevent 1 ' + ctx.kind + ' damage (' + (ctx.n - p) + ' coming)?', 'Pay 3', 'No'))) { X.pay('runner', 3, 'any'); p++; }
      if (p) X.log({ t: 'prevent', side: 'runner', k: 'caldera', n: p });
      return p;
    },
    bot: { caldera: (pub) => pub.runner.credits >= 6 ? 'yes' : 'no' },
    botPlay: () => 0.4
  });
  S('dianas_hunt', '12106', 'Run any server. Each time you meet an ice, you may install a program from your grip free; those programs are trashed when the run ends.');
  on('dianas_hunt', Object.assign(anyRunL('Diana’s Hunt'), {
    *runEnc(X, iid, ctx) {
      const progs = X.R.grip.filter(i => X.dat(i).type === 'program' && !X.installBad(i));
      if (!progs.length) return null;
      const t = yield* X.ask(iid, 'runner', 'diana', 'Diana’s Hunt: install a program free?', progs.map(i => X.cardOpt(i)), { skip: 'No' });
      if (t) { yield* X.runnerInstall(t, { free: true }); if (X.R.rig.indexOf(t) >= 0) (ctx.S.diana = ctx.S.diana || []).push(t); }
      return null;
    },
    runEnd(X, iid, ctx) { for (const t of ctx.S.diana || []) if (X.R.rig.indexOf(t) >= 0) X.trashRunner(t, 'dianas_hunt'); },
    bot: { diana: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || {}).id || 'skip' },
    botPlay: () => 0.6
  }));
  S('reshape', '12107', 'Swap two unrezzed ice.');
  on('reshape', {
    playBad: (X) => iceAll(X).filter(i => !X.card(i).rez).length >= 2 ? null : 'Needs two unrezzed ice',
    *play(X, iid) { const ts = yield* X.ask(iid, 'runner', 'reshape', 'Reshape: swap which two unrezzed ice?', iceAll(X).filter(i => !X.card(i).rez).map(i => ({ id: i, label: 'Unrezzed ice · ' + X.srvName(X.serverOf(i)) + ', position ' + (X.serverOf(i).ice.indexOf(i) + 1) })), { multi: true, min: 2, max: 2 }); if (ts.length === 2) { swapPlaces(X, ts[0], ts[1]); X.log({ t: 'note', side: 'runner', text: 'Reshape swaps two unrezzed ice' }); } },
    botPlay: () => 0.2
  });
  S('dummy_box', '12108', 'When the Corp would trash one of your installed cards, you may trash a card of the same type from your grip to stop it.');
  on('dummy_box', {
    *preventTrash(X, iid, ctx) {
      const type = X.dat(ctx.iid).type;
      const same = X.R.grip.filter(i => X.dat(i).type === type);
      if (!same.length) return false;
      const t = yield* X.ask(iid, 'runner', 'dummyBox', 'Dummy Box: trash a ' + type + ' from your grip to save ' + X.nameOf(ctx.iid) + '?', same.map(i => X.cardOpt(i)), { skip: 'No' });
      if (!t) return false;
      X.lift(t); X.card(t).up = true; X.R.heap.push(t);
      return true;
    },
    bot: { dummyBox: (pub, me, pr) => pr.options[0].id },
    botPlay: () => 0.4
  });
  S('corporate_defector', '12109', 'Whenever the Corp draws a card with its basic action, it is shown.');
  on('corporate_defector', { on: { corpDrew(X, iid, ctx) { if (ctx.basic && ctx.iids && ctx.iids.length) X.reveal('corp', ctx.iids, 'Corporate Defector'); } }, botPlay: () => 0.3 });
  S('cfc', '12110', 'When scored, gain 2 credits for each rezzed bioroid.');
  on('cfc', { onScore(X) { gainC(X, 2 * X.corpPlaced().filter(i => X.card(i).rez && kw(X, i, /Bioroid/)).length, 'cfc'); } });
  S('mca_austerity', '12111', 'Once a turn, a click: a power counter on it, and the Runner loses a click next turn. A click, trash it and 3 counters: gain four clicks.');
  on('mca_austerity', {
    abils: (X, iid) => [{ label: 'MCA Austerity Policy: a counter — the Runner loses a click next turn', clicks: 1, once: 'austerity' }, { label: 'MCA Austerity Policy: trash it — gain four clicks', clicks: 1, bad: X.card(iid).power >= 3 ? null : 'Needs 3 counters' }],
    use(X, iid, n) {
      if (n === 0) { X.card(iid).power++; X.R.loseNext = (X.R.loseNext || 0) + 1; return; }
      X.toArchives(iid, true); X.C.clicks += 4; X.log({ t: 'clicks', side: 'corp', n: 4, k: 'mca_austerity' });
    },
    botAbil: (pub, me, o) => /four clicks/.test(o.label) ? 3 : 0.9
  });
  S('restore', '12112', 'Install and rez a card from Archives (paying for both); every other copy of it in Archives leaves the game.');
  on('restore', {
    playBad: (X) => X.C.arch.some(i => ['agenda', 'operation'].indexOf(X.dat(i).type) < 0) ? null : 'Nothing in Archives to install',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'restore', 'Restore: install and rez which card?', X.dedupe(X.C.arch.filter(i => ['agenda', 'operation'].indexOf(X.dat(i).type) < 0).map(i => X.cardOpt(i))), { always: true });
      if (!t) return;
      for (const o of X.C.arch.filter(i => i !== t && X.card(i).k === X.card(t).k)) { X.lift(o); X.C.gone.push(o); }
      yield* X.corpInstall(t, {});
      if (X.isInstalled(t) && X.avail('corp', X.dat(t).type === 'ice' ? 'rezIce' : 'rez', { iid: t }) >= X.rezCost(t) && !X.rezBlock(t)) yield* X.rezFlow(t, false);
    },
    botPlay: () => 0.5
  });
  S('breached_dome', '12113', 'When the Runner accesses it, 1 meat damage and the top card of their stack is trashed.');
  on('breached_dome', { *onAccess(X) { X.log({ t: 'ambush', k: 'breached_dome' }); yield* X.damage('meat', 1, 'Breached Dome'); mill(X, 1); } });
  S('sand_storm', '12114', '', { subs: [{ k: 's', n: 0, text: 'It moves, with the run, to the outside of another server, and is trashed' }] });
  on('sand_storm', {
    subs: [function* (X, iid) {
      if (!X.isInstalled(iid)) return null;
      const others = X.C.servers.filter(sv => sv.id !== X.g.run.sid);
      if (!others.length) return null;
      const to = yield* X.ask(iid, 'corp', 'sandStorm', 'Sand Storm: move the run to which server?', others.map(sv => ({ id: sv.id, label: sv.name, sub: X.plural(sv.ice.length, 'ice') })), { always: true });
      X.g.run.sid = to;
      X.toArchives(iid, true);
      X.log({ t: 'note', side: 'corp', text: 'Sand Storm moves the run to ' + X.server(to).name });
      return { moved: to, outer: true };
    }],
    bot: { sandStorm: (pub, me, pr) => pr.options.slice().sort((a, b) => parseInt(b.sub) - parseInt(a.sub))[0].id }
  });
  S('ar_enhanced', '12115', 'The first time each turn the Runner trashes a Corp card, they take a tag.');
  on('ar_enhanced', { on: { *runnerTrashed(X, iid) { if (X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; yield* X.giveTags(1, 'AR-Enhanced Security'); } } });
  S('rolling_brownout', '12116', 'Current. Every operation and event costs 1 more. The first time the Runner plays an event each turn, gain 1 credit.');
  on('rolling_brownout', { mod: { playCost: (X, iid, v, ctx) => ['operation', 'event'].indexOf(X.dat(ctx.iid).type) >= 0 ? v + 1 : v }, on: { play(X, iid, ctx) { if (ctx.side !== 'runner' || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; gainC(X, 1, 'rolling_brownout'); } }, botPlay: () => 1 });
  S('threat_level_alpha', '12117', 'Double. Trace 1: as many tags as the Runner has (1 if they have none).');
  on('threat_level_alpha', { *play(X) { if ((yield* X.trace(1, 'Threat Level Alpha')).ok) yield* X.giveTags(Math.max(1, X.R.tags), 'Threat Level Alpha'); }, botPlay: (pub) => pub.runner.tags ? 2 : 0.6 });
  S('priority_construction', '12118', 'Double. Install an ice from HQ protecting a remote server, free, with 3 advancement tokens on it.');
  on('priority_construction', {
    playBad: (X) => X.C.hq.some(i => X.dat(i).type === 'ice') ? null : 'No ice in HQ',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'priorityCon', 'Priority Construction: install which ice?', X.C.hq.filter(i => X.dat(i).type === 'ice').map(i => X.cardOpt(i)), { always: true });
      if (!t) return;
      yield* X.corpInstall(t, { free: true, filter: o => o.id === 'new' || /^r[0-9]+$/.test(o.id) });
      if (X.isInstalled(t)) X.card(t).adv += 3;
    },
    botPlay: () => 0.4
  });
  S('fractal_threat', '12119', 'Each time every subroutine on an ice protecting this server is broken, the top 2 cards of the Runner’s stack are trashed.');
  on('fractal_threat', { on: { fullyBroken(X, iid, ctx) { const sv = X.serverOf(iid); if (sv && sv.ice.indexOf(ctx.iid) >= 0) { mill(X, 2); X.log({ t: 'note', side: 'corp', text: 'Fractal Threat Matrix: the top 2 of the stack are trashed' }); } } } });
  S('conundrum', '12120', '+3 strength while an AI is installed.', { subs: [{ k: 's', n: 0, text: 'The Runner trashes one of their programs' }, { k: 'loseClick' }, { k: 'etr' }] });
  on('conundrum', { self: { iceStr: (X, iid, v) => hasAI(X) ? v + 3 : v }, subs: [function* (X, iid) { return yield* trashOwnProgram(X, iid); }], bot: { trashProgOwn: cheapest } });

  D.SET_LOADED.redsand = true;
})(typeof window !== 'undefined' ? window : this);
