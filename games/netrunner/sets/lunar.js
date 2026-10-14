'use strict';
/* The Lunar cycle (2014: Upstalk, The Spaces Between, First Contact, Up and
 * Over, All That Remains, The Source — 120 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. New here: currents (they stay until another
 * current is played, or an agenda is stolen / scored), priority events (your
 * first click only), the grail ice, the Shards that install from the grip.
 * Readings decided here:
 *   - Daily Business Show adds its card to the Corp's turn draw (the first
 *     draw of a turn), and one of the drawn cards goes to the bottom of R&D.
 *   - Heinlein Grid reacts to clicks spent breaking subroutines.
 *   - Order of Sol is checked after each of the Runner's actions.
 *   - Architect cannot be chosen by any card that trashes ice.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const kw = (X, i, re) => re.test(X.dat(i).kw || '');
  const iceIn = X => X.installedCorp().filter(i => X.dat(i).type === 'ice');
  const icePlace = (X, i) => (X.card(i).rez ? X.nameOf(i) : 'Unrezzed ice') + ' · ' + X.srvName(X.serverOf(i));
  const anyRun = (name, o) => ({
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, Object.assign({ card: iid, via: X.card(iid).k }, o || {}));
    }
  });
  /* A grail ice: on encounter, the Corp may show up to 2 grail ice from HQ; this one gains their subroutines. */
  const grail = {
    *onEnc(X, iid, ctx) {
      const pool = X.C.hq.filter(i => X.dat(i).type === 'ice' && kw(X, i, /Grail/));
      if (!pool.length) return null;
      const ts = yield* X.ask(iid, 'corp', 'grail', X.nameOf(iid) + ': show up to 2 grail ice from HQ — it gains their subroutines (in the order you pick them)?', pool.map(i => X.cardOpt(i)), { multi: true, min: 0, max: 2, pub: 'The Corp may show grail ice' });
      if (!ts.length) return null;
      X.reveal('corp', ts, X.nameOf(iid));
      for (const t of ts) for (const sb of X.dat(t).subs) { ctx.E.subs.push(Object.assign({ src: X.card(t).k }, sb)); ctx.E.broken.push(false); }
      return null;
    },
    bot: { grail: (pub, me, pr) => pr.options.slice(0, 2).map(o => o.id) }
  };
  /* Trace 2: do it once; do it again if the trace strength reached 5. */
  const trace25 = (name, fx) => function* (X, iid) {
    const r = yield* X.trace(2, name);
    if (!r.ok) return null;
    yield* fx(X, iid);
    if (r.str >= 5 && X.g.run) yield* fx(X, iid);
    return null;
  };
  /* A breaker with power counters to spend (the Cerberus line). */
  const cerberus = (type) => ({ brk: { type, cost: 0, n: 2, counters: true }, pump: { cost: 1, by: 1 } });
  const cerberusOn = { onInstall(X, iid) { X.card(iid).power = 4; X.log({ t: 'power', k: X.card(iid).k, n: 4 }); } };
  /* A Shard: from the grip, instead of accessing a central server. */
  const shard = (sid, name) => ({
    hand: {
      success(X, iid, ctx) {
        if (ctx.sid !== sid || ctx.S.replace || X.R.grip.indexOf(iid) < 0) return;
        ctx.S.replace = function* () {
          if (X.R.grip.indexOf(iid) < 0) return;
          if (yield* X.yn(iid, 'runner', 'shard', name + ': install it from your grip, free, instead of accessing?', 'Install it', 'Access instead')) yield* X.runnerInstall(iid, { free: true });
          else ctx.S.replaceDeclined = true;
        };
      }
    },
    bot: { shard: () => 'yes' }
  });

  /* ================================================================ UPSTALK */
  S('domestic_sleepers', '06001', 'Three clicks: an agenda counter on it. Worth 1 agenda point while it has one (0 otherwise).');
  on('domestic_sleepers', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'Domestic Sleepers: an agenda counter', clicks: 3, bad: X.card(iid).agenda ? 'It has one already' : null }] : [],
    use(X, iid) { X.card(iid).agenda++; X.log({ t: 'counters', k: 'domestic_sleepers', n: X.card(iid).agenda }); },
    self: { agendaPts: (X, iid, v, ctx) => ctx.side === 'corp' && X.card(iid).agenda ? v + 1 : v },
    botAbil: () => 4
  });
  S('next_silver', '06002', 'An “End the run” subroutine for each rezzed NEXT ice.', { subs: [] });
  on('next_silver', { self: { subs: (X, iid, v) => { const out = v.slice(); const n = X.installedCorp().filter(i => X.card(i).rez && kw(X, i, /NEXT/)).length; for (let k = 0; k < n; k++) out.push({ k: 'etr' }); return out; } } });
  S('lotus_field', '06003', 'Its strength cannot be lowered.', { noLower: true, subs: [{ k: 'etr' }] });
  S('mutate', '06004', 'As an extra cost, trash a rezzed ice. Turn over R&D until an ice: install and rez it free where the trashed one was. Shuffle R&D.');
  on('mutate', {
    playBad: (X) => iceIn(X).some(i => X.card(i).rez && X.card(i).k !== 'architect') ? null : 'No rezzed ice to trash',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'mutate', 'Mutate: trash which rezzed ice?', iceIn(X).filter(i => X.card(i).rez && X.card(i).k !== 'architect').map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (!t) return;
      const sv = X.serverOf(t), pos = sv.ice.indexOf(t);
      X.toArchives(t, true);
      const shown = [];
      let found = null;
      for (const i of X.C.rd) { shown.push(i); if (X.dat(i).type === 'ice') { found = i; break; } }
      X.reveal('corp', shown, 'Mutate');
      if (found) {
        X.lift(found); if (!X.server(sv.id)) X.C.servers.push(sv);
        sv.ice.splice(pos, 0, found); X.card(found).rez = false;
        X.log({ t: 'install', side: 'corp', iid: found, sid: sv.id, ice: true, cost: 0 });
        X.doRez(found, true); yield* X.rezTriggers(found);
      }
      X.shuffleRD();
    },
    botPlay: () => -1
  });
  S('near_earth', '06005', 'The first time each turn you create a remote server, draw a card.');
  on('near_earth', { on: { newServer(X, iid) { if (X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; X.drawCorp(1, 'near_earth'); } } });
  S('ptd', '06006', '3 recurring credits for traces.', { recur: { n: 3, for: 'trace' } });
  S('midway_station', '06007', 'In runs on this server, each icebreaker break costs the Runner 1 more. One region per server.');
  on('midway_station', { mod: { breakExtra: (X, iid, v) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id ? v + 1 : v } });
  S('the_root', '06008', '3 recurring credits for advancing, installing and rezzing.', { recur: { n: 3, for: 'root' } });
  S('taurus', '06009', '', { subs: [{ k: 's', n: 0, text: 'Trace 2: trash a hardware; at trace strength 5 or more, another' }] });
  on('taurus', {
    subs: [trace25('Taurus', function* (X, iid) {
      const t = yield* X.ask(iid, 'corp', 'taurus', 'Taurus: trash which hardware?', X.rigOf('hardware').map(i => X.cardOpt(i)));
      if (t && !(yield* X.saveWithConstruct(t))) yield* X.corpTrashes(t, 'Taurus');
    })]
  });
  S('mother_goddess', '06010', 'It has every subtype of every other rezzed ice.', { subs: [{ k: 'etr' }] });
  on('mother_goddess', { self: { iceTypes: (X, iid, v) => { const out = v.slice(); for (const i of iceIn(X)) if (i !== iid && X.card(i).rez && X.card(i).k !== 'mother_goddess') for (const t of (X.dat(i).ice || [])) if (out.indexOf(t) < 0) out.push(t); return out; } } });
  S('galahad', '06011', 'Grail: as the Runner meets it, you may show up to 2 grail ice from HQ — it gains their subroutines.', { subs: [{ k: 'etr' }] });
  on('galahad', grail);
  S('bad_times', '06012', 'Only while the Runner is tagged. The Runner has 2 less memory until the end of the turn.');
  on('bad_times', {
    playBad: (X) => X.R.tags ? null : 'Only while the Runner is tagged',
    play(X) { X.R.muCut = { n: 2, turn: X.g.turnN }; X.log({ t: 'note', side: 'corp', text: 'Bad Times: the Runner has 2 less memory this turn' }); X.trashRunner && null; },
    botPlay: () => 0.5
  });
  S('cyber_threat', '06013', 'Priority. Choose a server: the Corp may rez an ice protecting it; if it does not, run it — and no ice may be rezzed in that run.');
  on('cyber_threat', {
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Cyber Threat: which server?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })));
      if (!sid) return;
      const sv = X.server(sid);
      const ice = sv.ice.filter(i => !X.card(i).rez);
      const t = ice.length ? yield* X.ask(iid, 'corp', 'cyberThreat', 'Cyber Threat: rez an ice protecting ' + sv.name + '? If you do not, the Runner runs it and you cannot rez ice in that run.', ice.map(i => X.cardOpt(i, 'Rez ' + X.nameOf(i) + ' (' + X.rezCost(i) + ')', null, X.avail('corp', 'rezIce') < X.rezCost(i) ? 'Not enough credits' : null)), { skip: 'No', force: true }) : null;
      if (t && (yield* X.rezFlow(t, false))) return;
      yield* X.run(sid, { card: iid, via: 'cyber_threat' });
    },
    runMod: { noRezIce: () => true },
    bot: { cyberThreat: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' },
    botPlay: () => 0.8
  });
  S('lamprey', '06014', 'Whenever you make a successful run on HQ, the Corp loses 1 credit. Trashed when the Corp purges.', { virus: true });
  on('lamprey', { on: { *success(X, iid, ctx) { if (ctx.sid === 'hq') yield* X.corpLoses(1, 'Lamprey'); } }, purgeTrash: true, botPlay: () => 1.2 });
  S('paper_tripping', '06015', 'Priority. Remove every tag.');
  on('paper_tripping', { playBad: (X) => X.R.tags ? null : 'You have no tags', play(X) { const n = X.R.tags; X.R.tags = 0; X.log({ t: 'untag', n, k: 'paper_tripping' }); }, botPlay: (pub) => pub.runner.tags >= 2 ? 4 : -1 });
  S('power_tap', '06016', 'Gain 1 credit whenever a trace begins.');
  on('power_tap', { on: { traceStart(X) { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'power_tap' }); } }, botPlay: () => 0.8 });
  S('nasir', '06017', 'Whenever you meet an ice that was rezzed as you approached it, lose your credits and gain its rez cost instead.');
  on('nasir', { on: { encounter(X, iid, ctx) { if (ctx.S.rezAt !== ctx.iid) return; ctx.S.rezAt = null; const n = X.dat(ctx.iid).cost || 0; X.log({ t: 'note', side: 'runner', text: 'Nasir Meidan: ' + X.R.credits + ' credits become ' + n }); X.R.credits = n; } } });
  S('social_engineering', '06018', 'Priority. Choose an unrezzed ice: if the Corp rezzes it this turn, gain its rez cost.');
  on('social_engineering', {
    playBad: (X) => iceIn(X).some(i => !X.card(i).rez) ? null : 'No unrezzed ice',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'socialEng', 'Social Engineering: which unrezzed ice?', iceIn(X).filter(i => !X.card(i).rez).map(i => ({ id: i, label: icePlace(X, i) })));
      if (!t) return;
      X.card(iid).x.ice = t; X.linger(iid);
    },
    on: { rez(X, iid, ctx) { if (X.card(iid).x.ice === ctx.iid) { const n = X.rezCost(ctx.iid) || X.dat(ctx.iid).cost || 0; X.card(iid).x.ice = null; X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'social_engineering' }); } } },
    botPlay: () => 0.6
  });
  S('leprechaun', '06019', 'Carries up to 2 programs, which use none of your memory.');
  on('leprechaun', { freeHost: true, hostFor: (X, h, p) => X.dat(p).type === 'program' && X.hostedOn(h).length < 2 && X.card(p).k !== 'leprechaun', botPlay: () => 1 });
  S('eden_shard', '06020', 'After a successful run on R&D, instead of accessing you may install it from your grip, free. Trash it: the Corp draws 2. One per deck.');
  on('eden_shard', Object.assign(shard('rd', 'Eden Shard'), {
    abils: () => [{ label: 'Eden Shard: trash it — the Corp draws 2' }],
    use(X, iid) { X.trashRunner(iid, 'used'); X.drawCorp(2, 'eden_shard'); },
    botAbil: () => -1
  }));

  /* ================================================================ THE SPACES BETWEEN */
  S('foundry', '06021', 'The first time each turn you rez an ice, you may take another copy of it from R&D (shown); shuffle R&D.');
  on('foundry', {
    on: {
      *rez(X, iid, ctx) {
        if (X.dat(ctx.iid).type !== 'ice' || X.card(iid).x.turn === X.g.turnN) return;
        X.card(iid).x.turn = X.g.turnN;
        const copy = X.C.rd.find(i => X.card(i).k === X.card(ctx.iid).k);
        if (!copy || !(yield* X.yn(iid, 'corp', 'foundry', 'The Foundry: take another ' + X.nameOf(ctx.iid) + ' from R&D?', 'Take it', 'No'))) return;
        X.lift(copy); X.C.hq.push(copy); X.reveal('corp', [copy], 'The Foundry'); X.shuffleRD();
      }
    },
    bot: { foundry: () => 'yes' }
  });
  S('elp', '06022', 'Current. The Runner’s first click run each turn costs another click.');
  on('elp', { mod: { runClicks: (X, iid, v) => X.R.flags.ranBasic ? v : v + 1 }, botPlay: () => 2 });
  S('heinlein', '06023', 'Whenever the Runner spends or loses clicks during a run on this server, they lose every credit in their pool. One region per server.');
  on('heinlein', { on: { clickSpent(X, iid) { const sv = X.serverOf(iid); if (X.g.run && sv && X.g.run.sid === sv.id && X.R.credits) { X.log({ t: 'lose', side: 'runner', n: X.R.credits, cause: 'Heinlein Grid' }); X.R.credits = 0; } } } });
  S('encrypted_portals', '06024', 'Every code gate has +1 strength. When scored, gain 1 credit for each rezzed code gate.');
  on('encrypted_portals', {
    mod: { iceStr: (X, iid, v, ctx) => X.typesOf(ctx.iid).indexOf('code gate') >= 0 ? v + 1 : v },
    onScore(X) { const n = iceIn(X).filter(i => X.card(i).rez && X.typesOf(i).indexOf('code gate') >= 0).length; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'encrypted_portals' }); }
  });
  S('cerebral_static', '06025', 'Current. The Runner’s identity has no abilities.');
  on('cerebral_static', { mod: { blankId: (X, iid, v, ctx) => v || ctx.side === 'runner' }, botPlay: () => 1.2 });
  S('targeted_marketing', '06026', 'Current. Name a card: gain 10 credits whenever the Runner plays or installs a copy of it.');
  on('targeted_marketing', {
    *play(X, iid) {
      const names = Object.keys(D.CARDS).filter(k => D.CARDS[k].side === 'runner' && D.CARDS[k].type !== 'identity' && D.inSets(k, 'all'));
      const seen = X.R.heap.concat(X.R.rig).map(i => X.card(i).k);
      const pool = names.filter(k => seen.indexOf(k) >= 0).concat(['sure_gamble', 'corroder', 'gordian', 'datasucker']).filter((k, n, a) => a.indexOf(k) === n && D.CARDS[k]);
      const k = yield* X.ask(iid, 'corp', 'tmName', 'Targeted Marketing: name a card', pool.map(k => ({ id: k, label: D.CARDS[k].name, card: k })), { always: true });
      X.card(iid).x.k = k;
      X.log({ t: 'note', side: 'corp', text: 'Targeted Marketing names ' + D.CARDS[k].name });
    },
    on: {
      install(X, iid, ctx) { if (ctx.side === 'runner' && X.card(ctx.iid).k === X.card(iid).x.k) { X.gain('corp', 10); X.log({ t: 'gain', side: 'corp', n: 10, k: 'targeted_marketing' }); } },
      play(X, iid, ctx) { if (ctx.side === 'runner' && X.card(ctx.iid).k === X.card(iid).x.k) { X.gain('corp', 10); X.log({ t: 'gain', side: 'corp', n: 10, k: 'targeted_marketing' }); } }
    },
    show: (X, iid) => X.card(iid).x.k ? 'names ' + D.CARDS[X.card(iid).x.k].name : null,
    bot: { tmName: (pub, me, pr) => (pr.options.find(o => o.card === 'sure_gamble') || pr.options[0]).id },
    botPlay: () => 1
  });
  S('info_overload', '06027', 'As the Runner meets it: trace 1 — a tag. It has a “the Runner trashes one of their installed cards” subroutine for each tag the Runner has.', { subs: [] });
  on('info_overload', {
    *onEnc(X, iid, ctx) {
      if ((yield* X.trace(1, 'Information Overload')).ok) yield* X.giveTags(1, 'Information Overload');
      for (let k = 0; k < X.R.tags; k++) { ctx.E.subs.push({ k: 's', n: 0, text: 'The Runner trashes one of their installed cards' }); ctx.E.broken.push(false); }
      return null;
    },
    subs: [function* (X, iid) {
      if (!X.R.rig.length) return null;
      const t = yield* X.ask(iid, 'runner', 'infoOver', 'Information Overload: trash one of your installed cards', X.R.rig.map(i => X.cardOpt(i)), { always: true });
      if (t) X.trashRunner(t, 'Information Overload');
      return null;
    }]
  });
  S('paywall', '06028', 'Current. Gain 1 credit whenever the Runner makes a successful run.');
  on('paywall', { on: { success(X) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'paywall' }); } }, botPlay: () => 2 });
  S('sealed_vault', '06029', '1 credit: move credits from your pool onto it. A click: take any of them. Trash it: take any of them.');
  on('sealed_vault', {
    abils: (X, iid) => [{ label: 'Sealed Vault: store credits on it', cost: 1, bad: X.C.credits >= 2 ? null : 'Nothing to store' }, { label: 'Sealed Vault: take credits', clicks: 1, bad: X.card(iid).cred ? null : 'Empty' }, { label: 'Sealed Vault: trash it — take credits', bad: X.card(iid).cred ? null : 'Empty' }],
    *use(X, iid, n) {
      const c = X.card(iid);
      const most = n === 0 ? X.C.credits : c.cred;
      const opts = []; for (let k = 1; k <= Math.min(most, 30); k++) opts.push({ id: String(k), label: String(k) });
      const k = +(yield* X.ask(iid, 'corp', 'vault', n === 0 ? 'Sealed Vault: store how many?' : 'Sealed Vault: take how many?', opts, { always: true }));
      if (n === 0) { X.C.credits -= k; c.cred += k; X.log({ t: 'load', k: 'sealed_vault', n: c.cred }); return; }
      if (n === 2) X.toArchives(iid, true);
      else c.cred -= k;
      X.gain('corp', k); X.log({ t: 'gain', side: 'corp', n: k, k: 'sealed_vault' });
    },
    bot: { vault: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botAbil: () => -1
  });
  S('eden_fragment', '06030', 'The first ice you install each turn costs nothing to install. One per deck.');
  on('eden_fragment', { mod: { iceInstallCost: (X, iid, v) => X.C.flags.iceInstalled ? v : 0 } });
  S('lag_time', '06031', 'Current. Every ice has +1 strength.');
  on('lag_time', { mod: { iceStr: (X, iid, v) => v + 1 }, botPlay: () => 1.4 });
  S('will_o_wisp', '06032', 'After a successful run on this server you may trash it: an icebreaker used in that run goes to the bottom of the stack.');
  on('will_o_wisp', {
    on: {
      *success(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || sv.id !== ctx.S.sid) return;
        const used = (ctx.S.usedBreakers || []).filter(b => X.isInstalled(b));
        if (!used.length) return;
        const t = yield* X.ask(iid, 'corp', 'wisp', 'Will-o’-the-Wisp: trash it to send an icebreaker to the bottom of the stack?', used.map(b => X.cardOpt(b)), { skip: 'No' });
        if (!t) return;
        X.toArchives(iid, true);
        for (const h of X.hostedOn(t)) X.trashRunner(h, 'host');
        X.lift(t); X.wipe(X.card(t)); X.card(t).up = false; X.R.stack.push(t);
        X.log({ t: 'toStack', k: X.card(t).k, by: 'will_o_wisp' });
      }
    },
    bot: { wisp: (pub, me, pr) => pr.options[0].id }
  });
  S('d4v1d', '06033', 'Comes with 3 power counters. Spend one: break a subroutine on an ice of strength 5 or more.', { noStr: true, brk: { type: 'any', cost: 0, n: 1, counters: true } });
  on('d4v1d', { onInstall(X, iid) { X.card(iid).power = 3; }, canBreak: (X, iid, E) => X.iceStr(E.iid, E) >= 5 });
  S('scrubbed', '06034', 'Current. The first ice you meet each turn has −2 strength for that run.');
  on('scrubbed', {
    on: { encounter(X, iid, ctx) { if (X.R.flags.scrubbed || X.g.active !== 'runner') return; X.R.flags.scrubbed = true; ctx.S.scrubbed = ctx.iid; } },
    mod: { iceStr: (X, iid, v, ctx) => X.g.run && X.g.run.scrubbed === ctx.iid ? v - 2 : v },
    botPlay: () => 1.2
  });
  S('three_steps', '06035', 'Priority. When this turn ends, gain 2 credits for each successful run you made in it.');
  on('three_steps', { play(X, iid) { X.linger(iid); }, on: { runnerTurnEnd(X) { const n = 2 * (X.R.flags.succN || 0); if (n) { X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'three_steps' }); } } }, botPlay: () => 1.5 });
  S('unscheduled', '06036', 'Current. The Corp cannot install more than one ice a turn.');
  on('unscheduled', { mod: { corpInstallBad: (X, iid, v, ctx) => v || (X.dat(ctx.iid).type === 'ice' && X.C.flags.iceInstalled ? 'Unscheduled Maintenance: one ice a turn' : null) }, botPlay: () => 1 });
  S('cache', '06037', 'Comes with 3 virus counters. Spend one: gain 1 credit.', { virus: true });
  on('cache', {
    onInstall(X, iid) { X.addVirus(iid, 3); },
    abils: (X, iid) => [{ label: 'Cache: spend a virus counter — gain 1', bad: X.card(iid).virus ? null : 'No virus counters' }],
    use(X, iid) { X.card(iid).virus--; X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'cache' }); },
    botAbil: (pub) => pub.runner.credits <= 2 ? 1 : -1,
    botPlay: () => 1.2
  });
  S('net_celebrity', '06038', 'Current. 1 recurring credit to spend during runs.', { recur: { n: 1, for: 'run' } });
  on('net_celebrity', { botPlay: () => 1 });
  S('llds_reg', '06039', '3 credits, or trash it: stop an installed hardware from being trashed.');
  on('llds_reg', {
    *preventTrash(X, iid, ctx) {
      if (X.dat(ctx.iid).type !== 'hardware') return false;
      const opts = [{ id: 'pay', label: 'Pay 3', bad: X.avail('runner', 'any') < 3 ? 'Costs 3' : null }, { id: 'trash', label: 'Trash the Energy Regulator' }];
      const a = yield* X.ask(iid, 'runner', 'lldsReg', 'LLDS Energy Regulator: save ' + X.nameOf(ctx.iid) + '?', opts, { skip: 'Let it go' });
      if (a === 'pay') { X.pay('runner', 3, 'any'); return true; }
      if (a === 'trash') { X.trashRunner(iid, 'prevent'); return true; }
      return false;
    },
    bot: { lldsReg: (pub) => pub.runner.credits >= 5 ? 'pay' : 'trash' }
  });
  S('ghost_runner', '06040', 'Put 3 credits on it when installed: spend them during runs. Trashed when empty.', { load: 3 });
  on('ghost_runner', { spend: (X) => !!X.g.run, spent(X, iid) { if (X.card(iid).cred <= 0) X.trashRunner(iid, 'empty'); }, botPlay: () => 1.4 });

  /* ================================================================ FIRST CONTACT */
  S('iq', '06041', 'Costs 1 more to rez and has +1 strength for each card in HQ.', { subs: [{ k: 'etr' }] });
  on('iq', { self: { rezCost: (X, iid, v) => v + X.C.hq.length, iceStr: (X, iid, v) => v + X.C.hq.length } });
  S('elizas_toybox', '06042', 'Three clicks: rez a card for free.');
  on('elizas_toybox', {
    abils: (X) => [{ label: 'Eliza’s Toybox: rez a card for free', clicks: 3, bad: X.installedCorp().some(i => !X.card(i).rez && X.dat(i).type !== 'agenda') ? null : 'Nothing to rez' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'toybox', 'Eliza’s Toybox: rez which card free?', X.installedCorp().filter(i => !X.card(i).rez && X.dat(i).type !== 'agenda').map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.rezCost(i))));
      if (t) { X.doRez(t, true); yield* X.rezTriggers(t); }
    },
    bot: { toybox: (pub, me, pr) => pr.options.slice().sort((a, b) => (D.CARDS[b.card].cost || 0) - (D.CARDS[a.card].cost || 0))[0].id },
    botAbil: () => 1.2
  });
  S('kitsune', '06043', '', { subs: [{ k: 's', n: 0, text: 'The Corp may choose a card in HQ: the Runner accesses HQ, that card first; then Kitsune is trashed' }] });
  on('kitsune', {
    subs: [function* (X, iid) {
      if (!X.C.hq.length) return null;
      const t = yield* X.ask(iid, 'corp', 'kitsune', 'Kitsune: show the Runner which card from HQ?', X.C.hq.map(i => X.cardOpt(i)), { skip: 'No' });
      if (!t) return null;
      const n = X.mod('accessHQ', 1 + X.rigCards('hq_interface').length, {});
      const pool = X.C.hq.filter(i => i !== t), list = [{ iid: t, from: 'hq' }];
      for (let k = 1; k < n && pool.length; k++) list.push({ iid: pool.splice(Math.floor(X.rand() * pool.length), 1)[0], from: 'hq' });
      for (const it of list) { if (!X.g.run) break; if (X.C.hq.indexOf(it.iid) >= 0) yield* X.accessOne(it.iid, 'hq', 'hq'); }
      if (X.isInstalled(iid)) X.toArchives(iid, true);
      return 'gone';
    }],
    bot: { kitsune: (pub, me, pr) => (pr.options.find(o => /snare|shock|shikyu|psychic/.test(o.card)) || {}).id || 'skip' }
  });
  S('port_anson', '06044', 'To jack out of a run on this server, the Runner must trash an installed program. One region per server.');
  on('port_anson', { mod: { jackCost: (X, iid, v, ctx) => X.serverOf(iid) && ctx.sid === X.serverOf(iid).id ? 'program' : v } });
  S('news_now', '06045', 'The Runner cannot play currents.');
  on('news_now', { mod: { noRunnerCurrent: () => true } });
  S('manhunt', '06046', 'Current. The first time each turn the Runner makes a successful run: trace 2 — a tag.');
  on('manhunt', { on: { *success(X, iid) { if (X.R.flags.manhunt) return; X.R.flags.manhunt = true; if ((yield* X.trace(2, 'Manhunt')).ok) yield* X.giveTags(1, 'Manhunt'); } }, botPlay: () => 1.6 });
  const morph = (from, to) => ({ self: { iceTypes: (X, iid, v) => X.card(iid).adv % 2 ? v.filter(t => t !== from).concat(v.indexOf(to) < 0 ? [to] : []) : v } });
  S('wendigo', '06047', 'Can be advanced. With an odd number of tokens it is a barrier, not a code gate.', { advable: true, subs: [{ k: 's', n: 0, text: 'The Corp chooses a program: the Runner cannot use it this run' }] });
  on('wendigo', Object.assign(morph('code gate', 'barrier'), {
    subs: [function* (X, iid) {
      const t = yield* X.ask(iid, 'corp', 'wendigo', 'Wendigo: which program cannot be used this run?', X.programs().map(i => X.cardOpt(i)));
      if (t) { X.g.run.disabled = (X.g.run.disabled || []).concat(t); X.log({ t: 'note', side: 'corp', text: 'Wendigo: ' + X.nameOf(t) + ' cannot be used this run' }); }
      return null;
    }],
    bot: { wendigo: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id }
  }));
  S('crisium', '06048', 'Runs on this server cannot be successful. One region per server.');
  on('crisium', { mod: { noSuccess: (X, iid, v, ctx) => v || (!!X.serverOf(iid) && ctx.sid === X.serverOf(iid).id) } });
  S('chronos', '06049', 'When scored, the Runner’s heap is removed from the game.');
  on('chronos', { onScore(X) { const n = X.R.heap.length; X.R.gone.push(...X.R.heap.splice(0)); X.log({ t: 'note', side: 'corp', text: 'Chronos Project: ' + n + ' cards of the Runner’s heap leave the game' }); } });
  S('shattered_remains', '06050', 'Ambush. Can be advanced. When accessed you may pay 1: trash a hardware per advancement token on it.', { advable: true });
  on('shattered_remains', {
    *onAccess(X, iid, ctx) {
      const n = Math.min(X.card(iid).adv, X.rigOf('hardware').length);
      if (!n || X.C.credits < 1) return;
      if (!(yield* X.yn(iid, 'corp', 'shattered', 'Shattered Remains: pay 1 to trash ' + X.plural(n, 'hardware', 'hardware') + '?', 'Pay 1', 'No'))) return;
      X.pay('corp', 1, 'any'); X.log({ t: 'ambush', k: 'shattered_remains' }); ctx.seen.did = 'sprung';
      const ts = yield* X.ask(iid, 'corp', 'shatteredHw', 'Shattered Remains: trash which hardware?', X.rigOf('hardware').map(i => X.cardOpt(i)), { multi: true, min: n, max: n });
      for (const t of ts) yield* X.corpTrashes(t, 'Shattered Remains');
    },
    bot: { shattered: () => 'yes' }
  });
  S('lancelot', '06051', 'Grail: as the Runner meets it, you may show up to 2 grail ice from HQ — it gains their subroutines.', { subs: [{ k: 'trashProg' }] });
  on('lancelot', grail);
  S('quetzal', '06052', 'Once a turn: break one barrier subroutine for free.');
  on('quetzal', {
    encOpts: (X, iid, E) => { if (X.card(iid).x.turn === X.g.turnN || X.typesOf(E.iid).indexOf('barrier') < 0) return []; return E.broken.map((b, k) => b ? null : { kind: 'break', sub: k, subs: [k], label: 'Quetzal: break “' + X.subText(E.subs[k]) + '” free (once a turn)', cost: 0 }).filter(Boolean).slice(0, 1); },
    *encUse(X, iid, n, E) { X.card(iid).x.turn = X.g.turnN; const k = E.broken.findIndex(b => !b); const won = yield* X.breaking(E, [k]); for (const j of won) E.broken[j] = true; E.brokeAny = true; X.log({ t: 'break', how: 'quetzal', iid: E.iid, subs: won }); }
  });
  S('blackat', '06053', '1 credit: break one barrier subroutine — up to three if paid with a stealth credit. 2 credits: +1 strength.', { brks: [{ type: 'barrier', cost: 1, n: 1 }, { type: 'barrier', cost: 1, n: 3, why: 'stealth' }], brk: { type: 'barrier', cost: 1, n: 1 }, pump: { cost: 2, by: 1 } });
  S('duggars', '06054', 'Four clicks: draw 10 cards.');
  on('duggars', { abils: () => [{ label: 'Duggar’s: draw 10', clicks: 4 }], use(X) { X.drawRunner(10, 'duggars'); }, botAbil: () => -1, botPlay: () => 0.2 });
  S('box_e', '06055', '+2 memory and +2 hand size. One console only.', { console: true, memory: 2, handPlus: 2 });
  S('the_supplier', '06056', 'A click: put a resource or hardware from your grip on it. When your turn begins you may install one of them for 2 less.');
  on('the_supplier', {
    abils: (X) => [{ label: 'The Supplier: put a resource or hardware on it', clicks: 1, bad: X.R.grip.some(i => ['resource', 'hardware'].indexOf(X.dat(i).type) >= 0) ? null : 'No resource or hardware in your grip' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'supplier', 'The Supplier: which card goes on it?', X.R.grip.filter(i => ['resource', 'hardware'].indexOf(X.dat(i).type) >= 0).map(i => X.cardOpt(i)));
      if (t) { X.lift(t); X.card(t).up = true; X.card(t).host = iid; X.R.ws.push(t); X.log({ t: 'workshopHost', k: X.card(t).k, n: 0 }); }
    },
    on: {
      *runnerTurnBegin(X, iid) {
        const hosted = X.R.ws.filter(i => X.card(i).host === iid);
        if (!hosted.length) return;
        const t = yield* X.ask(iid, 'runner', 'supplierIn', 'The Supplier: install a card from it, 2 less?', hosted.map(i => X.cardOpt(i, null, X.installCost(i, 2) + ' credits', X.installBad(i) || (X.avail('runner', 'any') < X.installCost(i, 2) ? 'Costs ' + X.installCost(i, 2) : null))), { skip: 'Not now' });
        if (t) yield* X.runnerInstall(t, { discount: 2, from: 'supplier' });
      }
    },
    bot: { supplierIn: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' },
    botAbil: () => -1
  });
  S('refractor', '06057', '1 credit: break one code gate subroutine. 1 credit from stealth cards only: +3 strength.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 1, by: 3, why: 'stealth' } });
  S('order_of_sol', '06058', 'The first time each turn your credit pool is empty, gain 1 credit.');
  on('order_of_sol', {
    on: {
      corpTurnEnd(X, iid) { sol(X, iid); }, runnerTurnEnd(X, iid) { sol(X, iid); }, runnerAction(X, iid) { sol(X, iid); }, runEnd(X, iid) { sol(X, iid); }, install(X, iid) { sol(X, iid); }, play(X, iid) { sol(X, iid); }
    },
    botPlay: () => 0.8
  });
  function sol(X, iid) { if (X.R.credits === 0 && X.card(iid).x.turn !== X.g.turnN) { X.card(iid).x.turn = X.g.turnN; X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'order_of_sol' }); } }
  S('hades_shard', '06059', 'After a successful run on Archives, instead of accessing you may install it from your grip, free. Trash it: access Archives. One per deck.');
  on('hades_shard', Object.assign(shard('arch', 'Hades Shard'), {
    abils: (X) => [{ label: 'Hades Shard: trash it — access Archives', bad: X.C.arch.length ? null : 'Archives is empty' }],
    *use(X, iid) { X.trashRunner(iid, 'used'); yield* X.accessOutside(X.C.arch.slice().map(i => ({ iid: i, from: 'arch' })), 'arch'); },
    botAbil: (pub) => pub.corp.arch.down >= 2 ? 2 : -1
  }));
  S('rachel_beckman', '06060', 'One more click each turn. Trashed if you are tagged.');
  on('rachel_beckman', {
    mod: { runnerClicks: (X, iid, v) => v + 1 },
    on: { tagged(X, iid) { if (X.isInstalled(iid)) X.trashRunner(iid, 'tagged'); }, runnerTurnBegin(X, iid) { if (X.R.tags && X.isInstalled(iid)) X.trashRunner(iid, 'tagged'); } },
    installBad: (X) => X.R.tags ? 'You are tagged' : null,
    botPlay: () => 3
  });

  /* ================================================================ UP AND OVER */
  S('architect', '06061', 'It cannot be trashed.', { subs: [{ k: 's', n: 0, text: 'The Corp looks at the top 5 cards of R&D and may install one, free' }, { k: 's', n: 1, text: 'The Corp may install a card from Archives or HQ' }] });
  on('architect', {
    subs: [
      function* (X, iid) {
        const top = X.C.rd.slice(0, 5).filter(i => X.dat(i).type !== 'operation');
        if (!top.length) return null;
        const t = yield* X.ask(iid, 'corp', 'architectTop', 'Architect: install one of the top 5 of R&D, free?', top.map(i => X.cardOpt(i)), { skip: 'No' });
        if (t) yield* X.corpInstall(t, { free: true });
        return null;
      },
      function* (X, iid) {
        const pool = X.C.hq.concat(X.C.arch).filter(i => X.dat(i).type !== 'operation');
        const t = yield* X.ask(iid, 'corp', 'architectIn', 'Architect: install a card from Archives or HQ?', pool.map(i => X.cardOpt(i, null, X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives')), { skip: 'No' });
        if (t) yield* X.corpInstall(t, {});
        return null;
      }
    ],
    bot: { architectTop: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || {}).id || 'skip', architectIn: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || {}).id || 'skip' }
  });
  S('peak_efficiency', '06062', 'Gain 1 credit for each rezzed ice.');
  on('peak_efficiency', { play(X) { const n = iceIn(X).filter(i => X.card(i).rez).length; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'peak_efficiency' }); }, botPlay: (pub) => pub.corp.servers.reduce((s, sv) => s + sv.ice.filter(v => v.rez).length, 0) >= 4 ? 3.5 : 0.2 });
  S('labyrinthine', '06063', 'When scored, 2 power counters. Spend one as the Runner jacks out: they cannot jack out this run.');
  on('labyrinthine', {
    onScore(X, iid) { X.card(iid).power = 2; },
    *stopJack(X, iid) {
      if (X.card(iid).power < 1) return false;
      if (!(yield* X.yn(iid, 'corp', 'labyrinth', 'Labyrinthine Servers: spend a power counter — the Runner cannot jack out this run?', 'Keep them in', 'Let them go'))) return false;
      X.card(iid).power--; return true;
    },
    bot: { labyrinth: (pub) => !!pub.run && (pub.run.sid === 'hq' || pub.run.sid === 'rd' || /^r\d/.test(pub.run.sid)) ? 'yes' : 'no' }
  });
  S('ashigaru', '06064', 'An “End the run” subroutine for each card in HQ.', { subs: [] });
  on('ashigaru', { self: { subs: (X, iid, v) => { const out = v.slice(); for (let k = 0; k < X.C.hq.length; k++) out.push({ k: 'etr' }); return out; } } });
  S('mamba', '06065', 'Spend a power counter on it during a run: 1 net damage.', { subs: [{ k: 'net', n: 1 }, { k: 's', n: 0, text: 'A psi game: if the bids differ, a power counter on Mamba' }] });
  on('mamba', {
    subs: [function* (X, iid) { if (yield* X.psi('Mamba')) { X.card(iid).power++; X.log({ t: 'power', k: 'mamba', n: X.card(iid).power }); } return null; }],
    winOpts: (X, iid) => X.card(iid).power > 0 ? [{ label: 'Mamba: spend a power counter — 1 net damage' }] : [],
    *winUse(X, iid) { X.card(iid).power--; yield* X.damage('net', 1, 'Mamba'); },
    botWin: () => true
  });
  S('reversed_accounts', '06066', 'Can be advanced. A click, trash it: the Runner loses 4 credits per advancement token.', { advable: true });
  on('reversed_accounts', {
    abils: (X, iid) => [{ label: 'Reversed Accounts: trash it — the Runner loses ' + 4 * X.card(iid).adv, clicks: 1 }],
    use(X, iid) { const n = Math.min(X.R.credits, 4 * X.card(iid).adv); X.toArchives(iid, true); X.R.credits -= n; X.log({ t: 'lose', side: 'runner', n }); },
    botAbil: (pub, me, o) => Math.min(pub.runner.credits, +((o.label.match(/loses (\d+)/) || [])[1] || 0)) >= 8 ? 4 : -1
  });
  S('ucf', '06067', '', { subs: [{ k: 's', n: 0, text: 'Untagged, the Runner loses 1 credit; tagged, every credit — and this ice is trashed' }] });
  on('ucf', { subs: [function (X, iid) { if (!X.R.tags) { if (X.R.credits) { X.R.credits--; X.log({ t: 'lose', side: 'runner', n: 1 }); } return null; } X.log({ t: 'lose', side: 'runner', n: X.R.credits }); X.R.credits = 0; if (X.isInstalled(iid)) X.toArchives(iid, true); return 'gone'; }] });
  S('blue_sun', '06068', 'When your turn begins, you may take a rezzed card back into HQ and gain its rez cost.');
  on('blue_sun', {
    on: {
      *corpTurnBegin(X, iid) {
        const ts = X.installedCorp().filter(i => X.card(i).rez);
        if (!ts.length) return;
        const t = yield* X.ask(iid, 'corp', 'blueSun', 'Blue Sun: take a rezzed card back into HQ and gain its rez cost?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + (X.dat(i).cost || 0))), { skip: 'No' });
        if (!t) return;
        const n = X.dat(t).cost || 0;
        X.toHQ(t); X.gain('corp', n); X.log({ t: 'toHQ', what: X.nameOf(t) }); X.log({ t: 'gain', side: 'corp', n, k: 'blue_sun' });
      }
    },
    bot: { blueSun: () => 'skip' }
  });
  S('changeling', '06069', 'Can be advanced. With an odd number of tokens it is a sentry, not a barrier.', { advable: true, subs: [{ k: 'etr' }] });
  on('changeling', morph('barrier', 'sentry'));
  S('reuse', '06070', 'Double. Trash any number of cards from HQ: 2 credits each.');
  on('reuse', {
    *play(X, iid) {
      const ts = yield* X.ask(iid, 'corp', 'reuse', 'Reuse: trash which cards from HQ (2 credits each)?', X.C.hq.map(i => X.cardOpt(i)), { multi: true, min: 0, max: X.C.hq.length });
      for (const t of ts) X.toArchives(t, false);
      if (ts.length) { X.gain('corp', 2 * ts.length); X.log({ t: 'gain', side: 'corp', n: 2 * ts.length, k: 'reuse' }); }
    },
    bot: { reuse: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type === 'operation').map(o => o.id) },
    botPlay: () => 0.6
  });
  S('hades_fragment', '06071', 'When your turn begins, you may put a card from Archives at the bottom of R&D. One per deck.');
  on('hades_fragment', {
    on: {
      *corpTurnBegin(X, iid) {
        if (!X.C.arch.length) return;
        const t = yield* X.ask(iid, 'corp', 'hadesFrag', 'Hades Fragment: put a card from Archives at the bottom of R&D?', X.C.arch.map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { skip: 'No' });
        if (t) { X.lift(t); X.card(t).up = false; X.C.rd.push(t); X.log({ t: 'archToRD', n: 1 }); }
      }
    },
    bot: { hadesFrag: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || {}).id || 'skip' }
  });
  S('docklands', '06072', 'Two clicks: a power counter on it. The first card the Runner installs each turn costs 1 more per counter.');
  on('docklands', {
    abils: () => [{ label: 'Docklands Crackdown: a power counter', clicks: 2 }],
    use(X, iid) { X.card(iid).power++; },
    mod: { installCost: (X, iid, v, ctx) => X.card(ctx.iid).side === 'runner' && !X.R.flags.dockInstalled ? v + X.card(iid).power : v },
    on: { install(X, iid, ctx) { if (ctx.side === 'runner') X.R.flags.dockInstalled = true; } },
    botAbil: () => 0.7
  });
  S('inject', '06073', 'Show the top 4 cards of your stack: trash the programs (1 credit each), the rest into your grip.');
  on('inject', {
    play(X) {
      const top = X.R.stack.slice(0, 4);
      X.reveal('runner', top, 'Inject');
      let n = 0;
      for (const t of top) { X.lift(t); X.card(t).up = true; if (X.dat(t).type === 'program') { X.R.heap.push(t); n++; } else X.R.grip.push(t); }
      if (n) { X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'inject' }); }
    },
    botPlay: () => 1.4
  });
  S('origami', '06074', 'Your maximum hand size is 1 higher for each Origami installed.');
  on('origami', { mod: { runHand: (X, iid, v) => v + X.rigCards('origami').length }, botPlay: () => 0.6 });
  S('fester', '06075', 'Whenever the Corp purges, it loses 2 credits if it has them.');
  on('fester', { on: { *purge(X) { if (X.C.credits >= 2) yield* X.corpLoses(2, 'Fester'); } }, botPlay: () => 0.4 });
  S('autoscripter', '06076', 'The first time each turn you install a program from your grip, gain a click. Trashed after an unsuccessful run.');
  on('autoscripter', {
    on: {
      install(X, iid, ctx) { if (ctx.side === 'runner' && ctx.from === 'grip' && X.dat(ctx.iid).type === 'program' && X.g.active === 'runner' && !X.R.flags.autoscript) { X.R.flags.autoscript = true; X.R.clicks++; X.log({ t: 'clicks', side: 'runner', n: 1, k: 'autoscripter' }); } },
      runEnd(X, iid, ctx) { if (ctx.how !== 'success' && ctx.how !== 'nosuccess' && X.isInstalled(iid)) X.trashRunner(iid, 'autoscripter'); }
    },
    botPlay: () => 1.4
  });
  S('switchblade', '06077', '1 stealth credit: break any number of sentry subroutines. 1 stealth credit: +7 strength.', { brk: { type: 'sentry', cost: 1, n: 99, why: 'stealth' }, pump: { cost: 1, by: 7, why: 'stealth' } });
  S('trade_in', '06078', 'As an extra cost, trash an installed hardware: gain half its cost (rounded down) and take a hardware from your stack (shown); shuffle.');
  on('trade_in', {
    playBad: (X) => X.rigOf('hardware').length ? null : 'You must trash an installed hardware',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'tradeOut', 'Trade-In: trash which hardware?', X.rigOf('hardware').map(i => X.cardOpt(i, null, X.dat(i).cost + ' to install')));
      if (!t) return;
      const n = Math.floor((X.dat(t).cost || 0) / 2);
      X.trashRunner(t, 'trade_in'); X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'trade_in' });
      X.g.revealN++;
      const u = yield* X.ask(iid, 'runner', 'tradeIn', 'Trade-In: take which hardware from your stack?', X.dedupe(X.R.stack.filter(i => X.dat(i).type === 'hardware').map(i => X.cardOpt(i))), { skip: 'None' });
      if (u) { X.lift(u); X.R.grip.push(u); X.reveal('runner', [u], 'Trade-In'); }
      X.shuffleStack();
    },
    botPlay: () => -1
  });
  S('astrolabe', '06079', '+1 memory. Draw a card whenever the Corp creates a server. One console only.', { console: true, memory: 1 });
  on('astrolabe', { on: { newServer(X) { X.drawRunner(1, 'astrolabe'); } }, botPlay: () => 2 });
  S('angel_arena', '06080', 'Pay X to install it: X power counters. Spend one: show the top of your stack; you may put it at the bottom. Trashed when empty.', { cost: 0 });
  on('angel_arena', {
    *onInstall(X, iid) {
      const most = Math.min(X.avail('runner', 'any'), 10);
      const opts = []; for (let n = 0; n <= most; n++) opts.push({ id: String(n), label: 'X = ' + n });
      const n = +(yield* X.ask(iid, 'runner', 'angelX', 'Angel Arena: pay X for X power counters', opts, { always: true }));
      if (n) { X.pay('runner', n, 'any'); X.card(iid).power = n; }
      if (!X.card(iid).power) X.trashRunner(iid, 'empty');
    },
    abils: (X, iid) => [{ label: 'Angel Arena: spend a counter — look at the top of your stack', bad: X.R.stack.length ? null : 'Your stack is empty' }],
    *use(X, iid) {
      const t = X.R.stack[0];
      X.card(iid).power--;
      X.reveal('runner', [t], 'Angel Arena');
      if (yield* X.yn(iid, 'runner', 'angelBottom', 'Angel Arena: put ' + X.nameOf(t) + ' at the bottom of your stack?', 'To the bottom', 'Leave it')) X.R.stack.push(X.R.stack.shift());
      if (X.card(iid).power <= 0) X.trashRunner(iid, 'empty');
    },
    bot: { angelX: () => '0', angelBottom: () => 'no' },
    botAbil: () => -1,
    botPlay: () => -1
  });

  /* ================================================================ ALL THAT REMAINS */
  S('bifrost', '06081', 'When scored, you may use the “when scored” ability of another agenda in your score area (not another Bifrost Array).');
  on('bifrost', {
    *onScore(X, iid) {
      const ts = X.C.score.filter(i => i !== iid && X.card(i).k !== 'bifrost');
      if (!ts.length) return;
      const t = yield* X.ask(iid, 'corp', 'bifrost', 'Bifrost Array: use which agenda’s “when scored” again?', ts.map(i => X.cardOpt(i)), { skip: 'None' });
      if (t) yield* X.whenScored(t, 0);
    },
    bot: { bifrost: (pub, me, pr) => (pr.options.find(o => ['hostile_takeover', 'geothermal', 'priority_req', 'breaking_news', 'license_acq', 'vulcan_coverup'].indexOf(o.card) >= 0) || {}).id || 'skip' }
  });
  S('sagittarius', '06082', '', { subs: [{ k: 's', n: 0, text: 'Trace 2: trash a program; at trace strength 5 or more, another' }] });
  on('sagittarius', { subs: [trace25('Sagittarius', function* (X) { yield* X.trashProgram('Sagittarius'); })] });
  S('hostile_infra', '06083', 'Whenever the Runner trashes a Corp card (itself included), 1 net damage.');
  on('hostile_infra', { on: { *runnerTrashed(X) { yield* X.damage('net', 1, 'Hostile Infrastructure'); } }, *onTrashed(X) { yield* X.damage('net', 1, 'Hostile Infrastructure'); } });
  S('gemini', '06084', '', { subs: [{ k: 's', n: 0, text: 'Trace 2: 1 net damage; at trace strength 5 or more, 1 more' }] });
  on('gemini', { subs: [trace25('Gemini', function* (X) { yield* X.damage('net', 1, 'Gemini'); })] });
  S('license_acq', '06085', 'When scored, you may install and rez an asset or upgrade from HQ or Archives, free.');
  on('license_acq', {
    *onScore(X, iid) {
      const pool = X.C.hq.concat(X.C.arch).filter(i => ['asset', 'upgrade'].indexOf(X.dat(i).type) >= 0);
      const t = yield* X.ask(iid, 'corp', 'license', 'License Acquisition: install and rez which asset or upgrade, free?', pool.map(i => X.cardOpt(i, null, X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives')), { skip: 'None' });
      if (t) yield* X.corpInstall(t, { free: true, rez: true });
    },
    bot: { license: (pub, me, pr) => (pr.options[0] || {}).id || 'skip' }
  });
  S('dbs', '06086', 'The first time each turn you draw, draw one more and put one of them at the bottom of R&D.');
  on('dbs', {
    mod: { corpDraw: (X, iid, v) => X.C.flags.dbs ? v : v + 1 },
    on: {
      *corpDrew(X, iid, ctx) {
        if (X.C.flags.dbs || !ctx.iids || ctx.iids.length < 2) { X.C.flags.dbs = true; return; }
        X.C.flags.dbs = true;
        const t = yield* X.ask(iid, 'corp', 'dbs', 'Daily Business Show: which of these goes to the bottom of R&D?', ctx.iids.map(i => X.cardOpt(i)), { always: true });
        if (t) { X.lift(t); X.C.rd.push(t); }
      }
    }
  });
  S('superior_cyberwalls', '06087', 'Every barrier has +1 strength. When scored, gain 1 credit for each rezzed barrier.');
  on('superior_cyberwalls', {
    mod: { iceStr: (X, iid, v, ctx) => X.typesOf(ctx.iid).indexOf('barrier') >= 0 ? v + 1 : v },
    onScore(X) { const n = iceIn(X).filter(i => X.card(i).rez && X.typesOf(i).indexOf('barrier') >= 0).length; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'superior_cyberwalls' }); }
  });
  S('exec_boot_camp', '06088', 'When your turn begins you may rez a card for 1 less. 1 credit, trash it: take an asset from R&D (shown); shuffle.');
  on('exec_boot_camp', {
    on: {
      *corpTurnBegin(X, iid) {
        const ts = X.installedCorp().filter(i => !X.card(i).rez && X.dat(i).type !== 'agenda' && i !== iid);
        if (!ts.length) return;
        const t = yield* X.ask(iid, 'corp', 'bootCamp', 'Executive Boot Camp: rez a card for 1 less?', ts.map(i => X.cardOpt(i, 'Rez ' + X.nameOf(i) + ' (' + Math.max(0, X.rezCost(i) - 1) + ')', null, X.C.credits < X.rezCost(i) - 1 ? 'Not enough credits' : null)), { skip: 'No', force: true });
        if (t) { X.doRez(t, false, 1); yield* X.rezTriggers(t); }
      }
    },
    abils: (X) => [{ label: 'Executive Boot Camp: trash it — find an asset in R&D', cost: 1, bad: X.C.rd.some(i => X.dat(i).type === 'asset') ? null : 'No asset in R&D' }],
    *use(X, iid) {
      X.toArchives(iid, true);
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'bootAsset', 'Executive Boot Camp: take which asset?', X.dedupe(X.C.rd.filter(i => X.dat(i).type === 'asset').map(i => X.cardOpt(i))));
      if (t) { X.lift(t); X.C.hq.push(t); X.reveal('corp', [t], 'Executive Boot Camp'); }
      X.shuffleRD();
    },
    bot: { bootCamp: () => 'skip' },
    botAbil: () => -1
  });
  S('lycan', '06089', 'Can be advanced. With an odd number of tokens it is a code gate, not a sentry.', { advable: true, subs: [{ k: 'trashProg' }] });
  on('lycan', morph('sentry', 'code gate'));
  S('snatch_grab', '06090', 'Trace 3: trash a connection — the Runner may take a tag instead.');
  on('snatch_grab', {
    playBad: (X) => X.rigOf('resource').some(i => kw(X, i, /Connection/)) ? null : 'The Runner has no connection',
    *play(X, iid) {
      if (!(yield* X.trace(3, 'Snatch and Grab')).ok) return;
      const t = yield* X.ask(iid, 'corp', 'snatch', 'Snatch and Grab: trash which connection?', X.rigOf('resource').filter(i => kw(X, i, /Connection/)).map(i => X.cardOpt(i)));
      if (!t) return;
      if (yield* X.yn(iid, 'runner', 'snatchTag', 'Snatch and Grab: take a tag to keep ' + X.nameOf(t) + '?', 'Take a tag', 'Let it go')) { yield* X.giveTags(1, 'Snatch and Grab'); return; }
      yield* X.corpTrashes(t, 'Snatch and Grab');
    },
    bot: { snatchTag: (pub) => pub.runner.tags ? 'no' : 'yes' },
    botPlay: () => 1.2
  });
  S('merlin', '06091', 'Grail: as the Runner meets it, you may show up to 2 grail ice from HQ — it gains their subroutines.', { subs: [{ k: 'net', n: 2 }] });
  on('merlin', grail);
  S('shell_corp', '06092', 'Once a turn: a click to put 3 credits on it, or a click to take them all.');
  on('shell_corp', {
    abils: (X, iid) => [{ label: 'Shell Corporation: put 3 credits on it', clicks: 1, once: 'sc' }, { label: 'Shell Corporation: take the ' + X.card(iid).cred + ' on it', clicks: 1, once: 'sc', bad: X.card(iid).cred ? null : 'Empty' }],
    use(X, iid, n) { const c = X.card(iid); if (n === 0) { c.cred += 3; X.log({ t: 'load', k: 'shell_corp', n: c.cred }); } else { X.gain('corp', c.cred); X.log({ t: 'gain', side: 'corp', n: c.cred, k: 'shell_corp' }); c.cred = 0; } },
    botAbil: (pub, me, o) => /take/.test(o.label) ? (+((o.label.match(/the (\d+)/) || [])[1] || 0) >= 6 ? 3 : -1) : 1
  });
  S('ekomind', '06093', 'Your memory is equal to the number of cards in your grip. One console only.', { console: true });
  on('ekomind', { mod: { mu: (X) => X.R.grip.length }, dynamicMu: true, botPlay: () => -1 });
  S('cerberus_cuj', '06094', 'Comes with 4 power counters. Spend one: break up to two sentry subroutines. 1 credit: +1 strength.', cerberus('sentry'));
  on('cerberus_cuj', cerberusOn);
  S('leela', '06095', 'Whenever an agenda is scored or stolen, put an unrezzed installed Corp card back into HQ.');
  on('leela', {
    on: {
      *scoreOrSteal(X, iid) {
        const ts = X.installedCorp().filter(i => !X.card(i).rez);
        if (!ts.length) return;
        const t = yield* X.ask(iid, 'runner', 'leela', 'Leela Patel: send which unrezzed card back to HQ?', ts.map(i => ({ id: i, label: (X.dat(i).type === 'ice' ? 'Ice' : 'A card') + ' in ' + X.srvName(X.serverOf(i)), sub: X.card(i).adv ? X.card(i).adv + ' advanced' : null })), { always: true });
        if (t) { const what = X.dat(t).type === 'ice' ? 'ice' : 'a card'; X.toHQ(t); X.log({ t: 'toHQ', what }); }
      }
    },
    bot: { leela: (pub, me, pr) => (pr.options.slice().sort((a, b) => (+((b.sub || '').match(/\d+/) || [0])[0]) - (+((a.sub || '').match(/\d+/) || [0])[0]))[0] || {}).id }
  });
  S('cerberus_rex', '06096', 'Comes with 4 power counters. Spend one: break up to two code gate subroutines. 1 credit: +1 strength.', cerberus('code gate'));
  on('cerberus_rex', cerberusOn);
  S('zona_sul', '06097', 'A credit on it as your turn begins. A click: take them all. Trashed if you are tagged.');
  on('zona_sul', {
    on: { runnerTurnBegin(X, iid) { if (X.R.tags) { X.trashRunner(iid, 'tagged'); return; } X.card(iid).cred++; }, tagged(X, iid) { if (X.isInstalled(iid)) X.trashRunner(iid, 'tagged'); } },
    abils: (X, iid) => [{ label: 'Zona Sul Shipping: take the ' + X.card(iid).cred, clicks: 1, bad: X.card(iid).cred ? null : 'Empty' }],
    use(X, iid) { const n = X.card(iid).cred; X.card(iid).cred = 0; X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'zona_sul' }); },
    botAbil: (pub, me, o) => +((o.label.match(/the (\d+)/) || [])[1] || 0) >= 3 ? 2.5 : -1,
    botPlay: () => 1.5
  });
  S('macrodrive', '06098', '1 recurring credit for installing programs.', { recur: { n: 1, for: 'program' } });
  S('cerberus_lady', '06099', 'Comes with 4 power counters. Spend one: break up to two barrier subroutines. 1 credit: +1 strength.', cerberus('barrier'));
  on('cerberus_lady', cerberusOn);
  S('utopia_shard', '06100', 'After a successful run on HQ, instead of accessing you may install it from your grip, free. Trash it: the Corp discards 2 cards at random from HQ. One per deck.');
  on('utopia_shard', Object.assign(shard('hq', 'Utopia Shard'), {
    abils: (X) => [{ label: 'Utopia Shard: trash it — the Corp discards 2 at random', bad: X.C.hq.length ? null : 'HQ is empty' }],
    use(X, iid) {
      X.trashRunner(iid, 'used');
      for (let k = 0; k < 2 && X.C.hq.length; k++) X.toArchives(X.C.hq[Math.floor(X.rand() * X.C.hq.length)], false);
      X.log({ t: 'discard', side: 'corp', n: 2 });
    },
    botAbil: (pub) => pub.corp.hqN >= 2 ? 1.5 : -1
  }));

  /* ================================================================ THE SOURCE */
  S('helium3', '06101', 'When scored, put up to 2 power counters on a card that already has one.');
  on('helium3', {
    *onScore(X, iid) {
      const ts = X.installedCorp().concat(X.R.rig, X.C.score).filter(i => X.card(i).power > 0);
      const t = yield* X.ask(iid, 'corp', 'helium', 'Helium-3 Deposit: two more power counters on which card?', ts.map(i => X.cardOpt(i, null, X.plural(X.card(i).power, 'power counter'))), { skip: 'None' });
      if (t) { X.card(t).power += 2; X.log({ t: 'power', k: X.card(t).k, n: X.card(t).power }); }
    },
    bot: { helium: (pub, me, pr) => (pr.options.find(o => o.card && D.CARDS[o.card].side === 'corp') || {}).id || 'skip' }
  });
  S('errand_boy', '06102', '', { subs: [0, 1, 2].map(n => ({ k: 's', n: 0, text: 'The Corp gains 1 credit or draws a card' })) });
  on('errand_boy', {
    subs: [function* (X, iid) {
      const a = yield* X.ask(iid, 'corp', 'errand', 'Errand Boy: gain 1 credit or draw a card?', [{ id: 'cr', label: 'Gain 1' }, { id: 'draw', label: 'Draw', bad: X.C.rd.length ? null : 'R&D is empty' }], { always: true });
      if (a === 'draw') X.drawCorp(1, 'errand_boy'); else { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'errand_boy' }); }
      return null;
    }],
    bot: { errand: (pub, me) => (me.hand || []).length <= 3 ? 'draw' : 'cr' }
  });
  S('it_dept', '06103', 'A click: a power counter on it. Spend one: a rezzed ice has +1 strength per counter (the spent one too) until the end of the turn.');
  on('it_dept', {
    abils: (X, iid) => [{ label: 'IT Department: a power counter', clicks: 1 }, { label: 'IT Department: spend a counter — an ice is stronger this turn', bad: X.card(iid).power && iceIn(X).some(i => X.card(i).rez) ? null : 'No counter, or no rezzed ice' }],
    *use(X, iid, n) {
      const c = X.card(iid);
      if (n === 0) { c.power++; return; }
      const t = yield* X.ask(iid, 'corp', 'itDept', 'IT Department: which ice?', iceIn(X).filter(i => X.card(i).rez).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (!t) return;
      const by = c.power; c.power--;
      const x = X.card(t).x; x.itT = X.g.turnN; x.itN = (x.itT === X.g.turnN ? x.itN || 0 : 0) + by;
      X.log({ t: 'note', side: 'corp', text: 'IT Department: ' + X.nameOf(t) + ' is ' + by + ' stronger this turn' });
    },
    mod: { iceStr: (X, iid, v, ctx) => { const x = X.card(ctx.iid).x; return x.itT === X.g.turnN ? v + (x.itN || 0) : v; } },
    winOpts: (X, iid, w) => X.card(iid).power && w.where === 'ice' && X.card(w.iid).rez ? [{ label: 'IT Department: spend a counter — ' + X.nameOf(w.iid) + ' +' + X.card(iid).power + ' strength this turn' }] : [],
    winUse(X, iid, n, w) { const c = X.card(iid); const by = c.power; c.power--; const x = X.card(w.iid).x; x.itN = (x.itT === X.g.turnN ? x.itN || 0 : 0) + by; x.itT = X.g.turnN; X.log({ t: 'note', side: 'corp', text: 'IT Department: ' + X.nameOf(w.iid) + ' is ' + by + ' stronger this turn' }); },
    botAbil: (pub, me, o) => /a power counter$/.test(o.label) ? 0.9 : -1,
    botWin: () => false
  });
  S('markus', '06104', 'The Runner may lose a click to break one of its subroutines.', { clickBreak: { clicks: 1, n: 1 }, subs: [{ k: 's', n: 0, text: 'The Runner trashes one of their installed cards' }, { k: 'etr' }] });
  on('markus', { subs: [function* (X, iid) { if (!X.R.rig.length) return null; const t = yield* X.ask(iid, 'runner', 'markus', 'Markus 1.0: trash one of your installed cards', X.R.rig.map(i => X.cardOpt(i)), { always: true }); if (t) X.trashRunner(t, 'Markus 1.0'); return null; }] });
  S('industrial_genomics', '06105', 'Every card costs 1 more to trash for each face-down card in Archives.');
  on('industrial_genomics', { mod: { trashCost: (X, iid, v) => v + X.C.arch.filter(i => !X.card(i).up).length } });
  S('turtlebacks', '06106', 'Gain 1 credit whenever you create a server.');
  on('turtlebacks', { on: { newServer(X) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'turtlebacks' }); } } });
  S('shoot_moon', '06107', 'Double. Rez an ice for free for each tag the Runner has.');
  on('shoot_moon', {
    playBad: (X) => X.R.tags ? null : 'The Runner has no tags',
    *play(X, iid) {
      for (let n = 0; n < X.R.tags; n++) {
        const ts = iceIn(X).filter(i => !X.card(i).rez);
        const t = yield* X.ask(iid, 'corp', 'shootMoon', 'Shoot the Moon: rez which ice, free (' + (n + 1) + ' of ' + X.R.tags + ')?', ts.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { skip: 'Done' });
        if (!t) break;
        X.doRez(t, true); yield* X.rezTriggers(t);
      }
    },
    botPlay: (pub) => pub.runner.tags >= 2 ? 3 : -1
  });
  S('troll', '06108', 'As the Runner meets it: trace 2 — they lose a click or the run ends.', { subs: [] });
  on('troll', {
    *onEnc(X, iid) {
      if (!(yield* X.trace(2, 'Troll')).ok) return null;
      if (X.R.clicks && (yield* X.yn(iid, 'runner', 'troll', 'Troll: lose a click, or the run ends?', 'Lose a click', 'Let the run end'))) { X.R.clicks--; X.log({ t: 'loseClick', k: 'troll' }); return null; }
      return 'end';
    },
    bot: { troll: () => 'yes' }
  });
  S('virgo', '06109', '', { subs: [{ k: 's', n: 0, text: 'Trace 2: a tag; at trace strength 5 or more, another' }] });
  on('virgo', { subs: [trace25('Virgo', function* (X) { yield* X.giveTags(1, 'Virgo'); })] });
  S('utopia_fragment', '06110', 'Stealing an agenda costs the Runner 2 credits per advancement token on it. One per deck.');
  on('utopia_fragment', { mod: { stealCost: (X, iid, v, ctx) => v + 2 * (X.card(ctx.iid).adv || 0) } });
  S('excalibur', '06111', '', { subs: [{ k: 's', n: 0, text: 'The Runner cannot make another run this turn' }] });
  on('excalibur', { subs: [function (X) { X.R.flags.noRun = true; X.log({ t: 'noRun', k: 'excalibur' }); return null; }] });
  on('excalibur', grail);
  S('self_destruct', '06112', 'Remote servers only. Trash it during a run on this server: trash every card in and protecting the server, then trace X (X: cards trashed) — 3 net damage.', { remoteOnly: true });
  on('self_destruct', {
    winOpts: (X, iid) => X.g.run && X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id ? [{ label: 'Self-destruct: blow up this server' }] : [],
    *winUse(X, iid) {
      const sv = X.serverOf(iid);
      const all = sv.root.concat(sv.ice).filter(i => i !== iid && X.card(i).k !== 'architect');
      X.toArchives(iid, true);
      for (const i of all) if (X.isInstalled(i)) X.toArchives(i, true);
      X.log({ t: 'note', side: 'corp', text: 'Self-destruct: ' + X.plural(all.length + 1, 'card') + ' trashed' });
      if ((yield* X.trace(all.length + 1, 'Self-destruct')).ok) yield* X.damage('net', 3, 'Self-destruct');
      if (X.g.run && !X.server(X.g.run.sid)) return 'end';
      return null;
    },
    botWin: (pub, me, o) => pub.run && pub.runner.gripN <= 3
  });
  S('incubator', '06113', 'A virus counter as your turn begins. A click, trash it: move all its counters to another installed virus program.', { virus: true });
  on('incubator', {
    on: { runnerTurnBegin(X, iid) { X.addVirus(iid, 1); } },
    abils: (X, iid) => [{ label: 'Incubator: trash it — move its ' + X.card(iid).virus + ' counters', clicks: 1, bad: X.programs().some(i => i !== iid && X.dat(i).virus) ? null : 'No other virus program' }],
    *use(X, iid) {
      const n = X.card(iid).virus;
      const t = yield* X.ask(iid, 'runner', 'incubator', 'Incubator: move its counters to which virus program?', X.programs().filter(i => i !== iid && X.dat(i).virus).map(i => X.cardOpt(i)));
      X.trashRunner(iid, 'used');
      if (t) X.addVirus(t, n);
    },
    botAbil: (pub, me, o) => +((o.label.match(/its (\d+)/) || [])[1] || 0) >= 4 ? 2 : -1
  });
  S('ixodidae', '06114', 'Whenever the Corp loses credits, gain 1. Trashed when the Corp purges.', { virus: true });
  on('ixodidae', { on: { corpLost(X) { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'ixodidae' }); } }, purgeTrash: true, botPlay: () => 0.6 });
  S('code_siphon', '06115', 'Run R&D. If successful, instead of accessing you may find a program in your stack and install it for 3 less per ice protecting R&D; then take a tag.');
  on('code_siphon', {
    playBad: (X) => X.runBad('rd', 1),
    *play(X, iid) { yield* X.run('rd', { card: iid, via: 'code_siphon' }); },
    *success(X, iid) {
      if (!X.R.stack.some(i => X.dat(i).type === 'program')) return null;
      if (!(yield* X.yn(iid, 'runner', 'codeSiphon', 'Code Siphon: find and install a program instead of accessing R&D?', 'Do it', 'Access R&D'))) return null;
      const off = 3 * X.server('rd').ice.length;
      X.g.revealN++;
      const t = yield* X.ask(iid, 'runner', 'codeSiphonP', 'Code Siphon: install which program (' + off + ' less)?', X.dedupe(X.R.stack.filter(i => X.dat(i).type === 'program').map(i => X.cardOpt(i, null, X.installCost(i, off) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, off) ? 'Costs ' + X.installCost(i, off) : null)))), { skip: 'None' });
      if (t) yield* X.runnerInstall(t, { discount: off });
      X.shuffleStack();
      yield* X.giveTags(1, 'Code Siphon');
      return 'replace';
    },
    bot: { codeSiphon: () => 'no' },
    botPlay: () => 0.4
  });
  S('collective', '06116', 'Draw a card whenever the Corp rezzes an ice.');
  on('collective', { on: { rez(X, iid, ctx) { if (X.dat(ctx.iid).type === 'ice') X.drawRunner(1, 'collective'); } }, botPlay: () => 1.2 });
  S('sage', '06117', '+1 strength for each memory left free. 2 credits: break one code gate or barrier subroutine.', { str: 0, brk: { type: ['code gate', 'barrier'], cost: 2, n: 1 } });
  on('sage', { self: { breakerStr: (X, iid, v) => v + Math.max(0, X.muTotal() - X.muUsed()) } });
  S('bribery', '06118', 'Pay X and run any server: the Corp pays X more to rez the first unrezzed ice you approach.', { cost: 0 });
  on('bribery', {
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const most = Math.min(X.avail('runner', 'any'), 15);
      const opts = []; for (let n = 0; n <= most; n++) opts.push({ id: String(n), label: 'X = ' + n });
      const x = +(yield* X.ask(iid, 'runner', 'briberyX', 'Bribery: how much (X)?', opts, { always: true }));
      X.pay('runner', x, 'any');
      X.card(iid).x.n = x;
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Bribery: run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })));
      if (sid) yield* X.run(sid, { card: iid, via: 'bribery' });
    },
    runMod: { rezCost: (X, iid, v, ctx) => { const S = X.g.run; if (!S || X.dat(ctx.iid).type !== 'ice' || S.at !== ctx.iid) return v; if (S.bribed && S.bribed !== ctx.iid) return v; S.bribedSeen = ctx.iid; return v + (X.card(iid).x.n || 0); } },
    on: {},
    bot: { briberyX: () => '3' },
    botPlay: () => 0.6
  });
  S('au_revoir', '06119', 'Gain 1 credit whenever you jack out.');
  on('au_revoir', { on: { runEnd(X, iid, ctx) { if (ctx.how === 'jacked') { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'au_revoir' }); } } }, botPlay: () => 0.5 });
  S('earthrise', '06120', 'Comes with 3 power counters. When your turn begins, take one off and draw 2. Trashed when empty.');
  on('earthrise', {
    onInstall(X, iid) { X.card(iid).power = 3; },
    on: { runnerTurnBegin(X, iid) { const c = X.card(iid); c.power--; X.drawRunner(2, 'earthrise'); if (c.power <= 0) X.trashRunner(iid, 'empty'); } },
    botPlay: () => 2.2
  });

  D.SET_LOADED.lunar = true;
})(typeof window !== 'undefined' ? window : this);
