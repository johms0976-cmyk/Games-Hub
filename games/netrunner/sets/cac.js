'use strict';
/* Creation and Control (2013 deluxe: Haas-Bioroid and Shapers, 55 cards).
 *
 * Numbers come from sets/stats.js (netrunnerdb's data, the printed faces in
 * netrunnerdb/<code>.jpg); every line of card text here is written fresh.
 * Behaviour is a card script (see "CARD SCRIPTS" in nr-engine.js).
 * Readings decided here (MANIFEST.decisions has the general ones):
 *   - Tyr's Hand works once rezzed; it is not offered as an interrupt rez in
 *     the middle of a break (the Corp rezzes it at a rez window like any upgrade).
 *   - Awakening Center: only bioroid ice on it; the Corp is asked as the Runner
 *     passes the last ice of its server, and only when ice sits on it.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const bioroid = (X, i) => /Bioroid/.test(X.dat(i).kw || '');
  const iceOpts = (X, list) => list.map(i => X.cardOpt(i, X.card(i).rez ? null : X.nameOf(i) + (X.serverOf(i) ? ' (unrezzed)' : ''), X.serverOf(i) ? X.srvName(X.serverOf(i)) : (X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives')));

  /* ================================================================ HAAS-BIOROID */
  S('cerebral_imaging', '03001', 'Your maximum hand size equals the credits in your pool.');
  on('cerebral_imaging', { mod: { corpHand: (X) => X.C.credits } });

  S('custom_biotics', '03002', 'No Jinteki cards in this deck. 22 influence.', { noFac: ['jinteki'] });

  S('next_design', '03003', 'Before your first turn, install up to 3 ice free (no more than one a server), then draw up to 5 cards.');
  on('next_design', {
    on: {
      *corpTurnBegin(X, iid) {
        const c = X.card(iid);
        if (c.x.done) return;
        c.x.done = true;
        const used = [];
        for (let n = 0; n < 3; n++) {
          const ice = X.C.hq.filter(i => X.dat(i).type === 'ice');
          const t = yield* X.ask(iid, 'corp', 'nextIce', 'NEXT Design: install an ice for free (' + (n + 1) + ' of up to 3, one a server)?', ice.map(i => X.cardOpt(i)), { skip: 'No more', pub: 'NEXT Design: the Corp sets out its ice' });
          if (!t) break;
          const sid = yield* X.corpInstall(t, { free: true, filter: o => used.indexOf(o.id) < 0 });
          if (sid) used.push(sid);
        }
        while (X.C.hq.length < 5 && X.C.rd.length) X.drawCorp(1, 'next_design');
      }
    }
  });

  S('pet_project', '03004', 'When scored: install up to 3 cards from HQ and/or Archives, free, in and around one new remote server. One per deck.');
  on('pet_project', {
    *onScore(X, iid) {
      let sid = null;
      for (let n = 0; n < 3; n++) {
        const sv = sid && X.server(sid);
        const full = sv && sv.root.some(i => ['agenda', 'asset'].indexOf(X.dat(i).type) >= 0);
        const pool = X.C.hq.concat(X.C.arch).filter(i => { const t = X.dat(i).type; return t !== 'operation' && !(full && (t === 'agenda' || t === 'asset')); });
        const t = yield* X.ask(iid, 'corp', 'petProject', 'Director Haas’ Pet Project: install a card in the new server, free (' + (n + 1) + ' of up to 3)?', pool.map(i => X.cardOpt(i, null, X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives')), { skip: 'Done', pub: 'The Corp builds a new server' });
        if (!t) break;
        const got = yield* X.corpInstall(t, { free: true, to: sid || 'new' });
        if (!sid) sid = got;
      }
    },
    bot: { petProject: (pub, me, pr) => (pr.options.find(o => !o.bad && D.CARDS[o.card] && D.CARDS[o.card].type === 'ice') || pr.options.find(o => !o.bad) || {}).id || 'skip' }
  });

  S('efficiency_committee', '03005', 'When scored: 3 agenda counters. A click and a counter: gain two clicks — and you cannot advance cards for the rest of the turn.', { scoreCounters: 3 });
  on('efficiency_committee', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'Efficiency Committee: two more clicks', sub: 'A click and an agenda counter · no advancing this turn', clicks: 1, bad: X.card(iid).agenda > 0 ? null : 'No agenda counters left' }] : [],
    *use(X, iid) { X.spendAgenda(iid); X.C.clicks += 2; X.C.flags.noAdvance = true; X.log({ t: 'clicks', side: 'corp', n: 2, k: 'efficiency_committee' }); },
    botAbil: (pub) => pub.corp.clicks >= 2 ? 1.1 : -1
  });

  S('wotan', '03006', 'When scored: 3 agenda counters. Spend one as the Runner approaches a rezzed bioroid ice: it gains “End the run” after its other subroutines for this run.', { scoreCounters: 3 });
  on('wotan', {
    winOpts: (X, iid, w) => w.where === 'ice' && X.card(w.iid).rez && bioroid(X, w.iid) && X.card(iid).agenda > 0 && !((X.g.run.wotan || []).indexOf(w.iid) >= 0) ? [{ label: 'Project Wotan: spend a counter — ' + X.nameOf(w.iid) + ' gains “End the run” this run' }] : [],
    *winUse(X, iid, n, w) { X.spendAgenda(iid); X.g.run.wotan = (X.g.run.wotan || []).concat(w.iid); X.log({ t: 'use', side: 'corp', k: 'wotan' }); },
    mod: { subs: (X, iid, v, ctx) => X.g.run && (X.g.run.wotan || []).indexOf(ctx.iid) >= 0 ? v.concat({ k: 'etr' }) : v },
    botWin: (pub) => !!pub.run && pub.run.sid !== 'arch'
  });

  S('sentinel', '03007', 'Whenever the Runner takes brain damage, do 1 net damage.');
  on('sentinel', { on: { *damaged(X, iid, ctx) { if (ctx.kind === 'brain' && ctx.n > 0) yield* X.damage('net', 1, 'Sentinel Defense Program'); } } });

  S('alix', '03008', 'A power counter whenever you install a card. A click, trash it: gain 2 credits per counter.');
  on('alix', {
    on: { install(X, iid, ctx) { if (ctx.side === 'corp') X.card(iid).power++; } },
    abils: (X, iid) => [{ label: 'Alix T4LB07: trash it — gain ' + 2 * X.card(iid).power, clicks: 1 }],
    *use(X, iid) { const n = 2 * X.card(iid).power; X.toArchives(iid, true); X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'alix' }); },
    botAbil: (pub, me, o) => +((o.label.match(/gain (\d+)/) || [])[1] || 0) >= 8 ? 4 : -1
  });

  S('cerebral_overwriter', '03009', 'Can be advanced. Installed, when accessed: you may pay 3 for 1 brain damage per advancement token on it.', { advable: true });
  on('cerebral_overwriter', {
    *onAccess(X, iid, ctx) {
      const c = X.card(iid);
      if (!ctx.installed || !c.adv || X.C.credits < 3) return;
      if (yield* X.yn(iid, 'corp', 'overwriter', 'Cerebral Overwriter: pay 3 for ' + c.adv + ' brain damage?', 'Spring it (3)', 'Let it be', { pub: 'Cerebral Overwriter — the Corp decides' })) {
        X.pay('corp', 3, 'any'); X.log({ t: 'ambush', k: 'cerebral_overwriter' }); ctx.seen.did = 'sprung';
        yield* X.damage('brain', c.adv, 'Cerebral Overwriter');
      }
    },
    bot: { overwriter: () => 'yes' }
  });

  S('director_haas', '03010', 'One more click each turn. Trashed while accessed: it goes to the Runner’s score area as 2 agenda points.', { scorePts: 2 });
  on('director_haas', {
    mod: { corpClicks: (X, iid, v) => v + 1 },
    *onTrashed(X, iid, ctx) {
      const c = X.card(iid);
      X.lift(iid); X.wipe(c); c.up = true; X.R.score.push(iid);
      ctx.seen.did = 'stolen';
      X.log({ t: 'steal', k: 'director_haas', pts: 2, total: X.points('runner') });
      X.winCheck();
    }
  });

  S('haas_arcology', '03011', 'Can be advanced while unrezzed. Once a turn, a click and an advancement token on it: gain two clicks.', { advable: true, advUnrezzed: true });
  on('haas_arcology', {
    abils: (X, iid) => [{ label: 'Haas Arcology AI: two more clicks', sub: 'A click and an advancement token · once a turn', clicks: 1, once: 'arc', bad: X.card(iid).adv > 0 ? null : 'No advancement tokens on it' }],
    *use(X, iid) { X.card(iid).adv--; X.C.clicks += 2; X.log({ t: 'clicks', side: 'corp', n: 2, k: 'haas_arcology' }); },
    botAbil: (pub) => pub.corp.clicks >= 1 ? 1.4 : -1
  });

  S('thomas_haas', '03012', 'Can be advanced. Trash it: gain 2 credits per advancement token on it.', { advable: true });
  on('thomas_haas', {
    abils: (X, iid) => [{ label: 'Thomas Haas: trash it — gain ' + 2 * X.card(iid).adv, bad: X.card(iid).adv ? null : 'No advancement tokens on it' }],
    *use(X, iid) { const n = 2 * X.card(iid).adv; X.toArchives(iid, true); X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'thomas_haas' }); },
    botAbil: (pub, me, o) => +((o.label.match(/gain (\d+)/) || [])[1] || 0) >= 6 ? 3 : -1
  });

  S('ber', '03013', 'Rez a bioroid ice for free and leave this on it: if every subroutine on it is broken in one encounter, trash this and derez the ice.');
  on('ber', {
    playBad: (X) => X.installedCorp().some(i => X.dat(i).type === 'ice' && !X.card(i).rez && bioroid(X, i)) ? null : 'No unrezzed bioroid ice',
    *play(X, iid) {
      const ice = X.installedCorp().filter(i => X.dat(i).type === 'ice' && !X.card(i).rez && bioroid(X, i));
      const t = yield* X.ask(iid, 'corp', 'ber', 'Bioroid Efficiency Research: rez which bioroid ice, free?', iceOpts(X, ice), { pub: 'The Corp plays Bioroid Efficiency Research' });
      if (!t) return;
      X.doRez(t, true); yield* X.rezTriggers(t);
      if (!X.isInstalled(t)) return;
      X.hostCorp(iid, t); X.card(iid).rez = true;
    },
    on: {
      encounterEnd(X, iid, ctx) {
        const h = X.card(iid).host;
        if (ctx.iid !== h || !ctx.E.subs.length || !ctx.E.broken.every(b => b)) return;
        X.toArchives(iid, true); X.derez(h, 'ber');
      }
    },
    botPlay: () => 2.6
  });

  S('successful_demo', '03014', 'Only if the Runner made an unsuccessful run on their last turn. Gain 7 credits.');
  on('successful_demo', {
    playBad: (X) => X.R.last.failed ? null : 'Only after an unsuccessful run on the Runner’s last turn',
    play(X) { X.gain('corp', 7); },
    botPlay: () => 5
  });

  S('heimdall2', '03015', 'The Runner may lose two clicks to break up to two of its subroutines.', { clickBreak: { clicks: 2, n: 2 },
    subs: [{ k: 'brain', n: 1 }, { k: 'multi', do: [{ k: 'brain', n: 1 }, { k: 'etr' }], text: '1 brain damage and end the run' }, { k: 'etr' }] });

  S('howler', '03016', '', { subs: [{ k: 's', n: 0, text: 'Install and rez a bioroid ice from HQ or Archives just inside this one, free; when the run ends, Howler is trashed and that ice derezzed' }] });
  on('howler', {
    subs: [function* (X, iid) {
      const pool = X.C.hq.concat(X.C.arch).filter(i => X.dat(i).type === 'ice' && bioroid(X, i));
      const t = yield* X.ask(iid, 'corp', 'howler', 'Howler: install and rez a bioroid ice just inside it, free?', iceOpts(X, pool), { skip: 'No', pub: 'Howler fires' });
      if (!t) return null;
      const sv = X.serverOf(iid), pos = sv.ice.indexOf(iid);
      X.lift(t); sv.ice.splice(pos, 0, t);
      const c = X.card(t); c.rez = false; c.adv = 0; c.up = false;
      X.log({ t: 'install', side: 'corp', iid: t, sid: sv.id, ice: true, cost: 0 });
      X.doRez(t, true); yield* X.rezTriggers(t);
      X.g.run.howler = (X.g.run.howler || []).concat([[iid, t]]);
      return null;
    }],
    on: {
      runEnd(X, iid, ctx) {
        for (const [h, t] of ctx.S.howler || []) {
          if (h !== iid) continue;
          if (X.isInstalled(t)) X.derez(t, 'howler');
          if (X.isInstalled(iid)) X.toArchives(iid, true);
        }
      }
    },
    bot: { howler: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' }
  });

  S('ichi2', '03017', 'The Runner may lose two clicks to break up to two of its subroutines.', { clickBreak: { clicks: 2, n: 2 },
    subs: [{ k: 'trashProg' }, { k: 'trashProg' }, { k: 'trace', n: 3, then: 'ichi' }] });

  S('minelayer', '03018', '', { subs: [{ k: 's', n: 0, text: 'The Corp may install an ice from HQ in front of this server, free' }] });
  on('minelayer', {
    subs: [function* (X, iid) {
      const ice = X.C.hq.filter(i => X.dat(i).type === 'ice');
      const t = yield* X.ask(iid, 'corp', 'minelayer', 'Minelayer: install an ice from HQ in front of this server, free?', ice.map(i => X.cardOpt(i)), { skip: 'No', pub: 'Minelayer fires' });
      if (t) yield* X.corpInstall(t, { free: true, to: X.serverOf(iid).id });
      return null;
    }],
    bot: { minelayer: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' }
  });

  S('viktor2', '03019', 'The Runner may lose two clicks to break up to two of its subroutines. Spend a power counter on it: 1 brain damage.', { clickBreak: { clicks: 2, n: 2 },
    subs: [{ k: 'trace', n: 2, do: { k: 'power' }, text: 'a power counter on this ice' }, { k: 'etr' }] });
  on('viktor2', {
    abils: (X, iid) => [{ label: 'Viktor 2.0: spend a power counter — 1 brain damage', bad: X.card(iid).power > 0 ? null : 'No power counters' }],
    *use(X, iid) { X.card(iid).power--; yield* X.damage('brain', 1, 'Viktor 2.0'); },
    winOpts: (X, iid) => X.card(iid).power > 0 ? [{ label: 'Viktor 2.0: spend a power counter — 1 brain damage' }] : [],
    *winUse(X, iid) { X.card(iid).power--; yield* X.damage('brain', 1, 'Viktor 2.0'); },
    botAbil: () => 6
  });

  S('zed1', '03020', 'The Runner may lose a click to break one of its subroutines.', { clickBreak: { clicks: 1, n: 1 },
    subs: [{ k: 's', n: 0, text: '1 brain damage if the Runner has spent a click to break a subroutine this run' }, { k: 's', n: 1, text: '1 brain damage if the Runner has spent a click to break a subroutine this run' }] });
  on('zed1', {
    subs: [function* (X) { if (X.g.run && X.g.run.clickBroke) yield* X.damage('brain', 1, 'Zed 1.0'); return null; },
      function* (X) { if (X.g.run && X.g.run.clickBroke) yield* X.damage('brain', 1, 'Zed 1.0'); return null; }]
  });

  S('awakening_center', '03021', 'Bioroid ice may be installed on it, free. When the Runner passes the last ice of this server, you may rez one of them for 7 less: the Runner meets it, and it is trashed when the run ends.');
  on('awakening_center', {
    hostTarget: (X, h, ice) => X.dat(ice).type === 'ice' && bioroid(X, ice),
    on: {
      *approachServer(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || sv.id !== ctx.sid) return;
        const hosted = X.hostedCorp(iid).filter(i => !X.card(i).rez && X.dat(i).type === 'ice');
        if (!hosted.length) return;
        const opts = hosted.map(i => X.cardOpt(i, 'Rez ' + X.nameOf(i) + ' (' + Math.max(0, X.rezCost(i) - 7) + ')', null, X.avail('corp', 'rezIce') < Math.max(0, X.rezCost(i) - 7) ? 'Not enough credits' : null));
        const t = yield* X.ask(iid, 'corp', 'awaken', 'Awakening Center: rez a bioroid ice on it for 7 less — the Runner meets it?', opts, { skip: 'No', force: true, pub: 'Awakening Center — the Corp decides' });
        if (!t) return;
        X.doRez(t, false, 7); yield* X.rezTriggers(t);
        ctx.S.awake = (ctx.S.awake || []).concat(t);
        ctx.S.at = t;
        const out = yield* X.encounter(t);
        if (!X.g.run) return;
        if (out === 'end') { ctx.S.endNow = true; ctx.S.endBy = ctx.S.endBy || X.nameOf(t); }
        ctx.S.at = null;
      },
      runEnd(X, iid, ctx) { for (const t of ctx.S.awake || []) if (X.isInstalled(t) && X.card(t).host === iid) X.toArchives(t, true); }
    },
    bot: { awaken: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' }
  });

  S('tyrs_hand', '03022', 'Trash it: stop one subroutine on a bioroid ice protecting this server from being broken.');
  on('tyrs_hand', {
    *onBreaking(X, iid, ctx) {
      const sv = X.serverOf(iid);
      if (!sv || sv.ice.indexOf(ctx.E.iid) < 0 || !bioroid(X, ctx.E.iid) || !ctx.subs.length) return;
      if (yield* X.yn(iid, 'corp', 'tyrsHand', 'Tyr’s Hand: trash it so that “' + X.subText(ctx.E.subs[ctx.subs[0]]) + '” is not broken?', 'Trash it: stop the break', 'Let it go', { pub: 'Tyr’s Hand — the Corp decides' })) {
        ctx.prevent.push(ctx.subs[0]);
        X.toArchives(iid, true);
      }
    },
    bot: { tyrsHand: () => 'yes' }
  });

  S('gila_hands', '03023', 'Two clicks: gain 3 credits.');
  on('gila_hands', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'Gila Hands Arcology: gain 3', clicks: 2 }] : [],
    use(X) { X.gain('corp', 3); X.log({ t: 'gain', side: 'corp', n: 3, k: 'gila_hands' }); },
    botAbil: (pub) => pub.corp.credits < 8 ? 2.7 : 1.3
  });

  S('levy_university', '03024', 'A click and 1 credit: find an ice in R&D, show it, take it into HQ; shuffle R&D.');
  on('levy_university', {
    abils: (X) => [{ label: 'Levy University: find an ice in R&D', clicks: 1, cost: 1, bad: X.C.rd.some(i => X.dat(i).type === 'ice') ? null : 'No ice in R&D' }],
    *use(X, iid) {
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'levyIce', 'Levy University: take which ice?', X.dedupe(X.C.rd.filter(i => X.dat(i).type === 'ice').map(i => X.cardOpt(i))), { pub: 'The Corp searches R&D' });
      if (t) { X.lift(t); X.C.hq.push(t); X.log({ t: 'search', side: 'corp', k: X.card(t).k }); }
      X.shuffleRD();
    },
    botAbil: (pub, me) => (me.hand || []).filter(h => D.CARDS[h.k].type === 'ice').length ? -1 : 1.2
  });

  S('server_diagnostics', '03025', 'Gain 2 credits when your turn begins. Trashed when you install an ice.');
  on('server_diagnostics', {
    on: {
      corpTurnBegin(X) { X.gain('corp', 2); X.log({ t: 'gain', side: 'corp', n: 2, k: 'server_diagnostics' }); },
      install(X, iid, ctx) { if (ctx.side === 'corp' && X.dat(ctx.iid).type === 'ice' && X.isInstalled(iid)) { X.toArchives(iid, true); X.log({ t: 'empty', k: 'server_diagnostics' }); } }
    }
  });

  S('bastion', '03026', '', { subs: [{ k: 'etr' }] });
  S('datapike', '03027', '', { subs: [{ k: 'mustPay', n: 2 }, { k: 'etr' }] });

  /* ================================================================ SHAPERS */
  S('rielle', '03028', 'The first ice you meet each turn is also a code gate for that run.');
  on('rielle', {
    on: { encounter(X, iid, ctx) { if (!X.R.flags.kit) { X.R.flags.kit = true; ctx.S.kit = ctx.iid; } } },
    mod: { iceTypes: (X, iid, v, ctx) => X.g.run && X.g.run.kit === ctx.iid && v.indexOf('code gate') < 0 ? v.concat('code gate') : v }
  });

  S('professor', '03029', 'The first copy of each program costs no influence.', { freeFirstProgram: true });

  S('exile', '03030', 'Whenever you install a program from your heap, draw a card.');
  on('exile', { on: { install(X, iid, ctx) { if (ctx.side === 'runner' && ctx.from === 'heap' && X.dat(ctx.iid).type === 'program') X.drawRunner(1, 'exile'); } } });

  S('escher', '03031', 'Run HQ. If successful, instead of accessing, rearrange the ice protecting any servers (each server keeps as many ice).');
  on('escher', {
    playBad: (X) => X.runBad('hq', 1),
    *play(X, iid) { yield* X.run('hq', { card: iid, via: 'escher' }); },
    *success(X, iid) {
      const all = () => [].concat(...X.C.servers.map(sv => sv.ice));
      if (all().length < 2) return null;
      if (!(yield* X.yn(iid, 'runner', 'escher', 'Escher: rearrange the Corp’s ice instead of accessing HQ?', 'Rearrange it', 'Access HQ', { pub: 'Escher' }))) return null;
      for (let n = 0; n < 12; n++) {
        const opts = all().map(i => X.cardOpt(i, X.card(i).rez ? X.nameOf(i) : 'Unrezzed ice', X.srvName(X.serverOf(i)) + ' · ' + (X.serverOf(i).ice.indexOf(i) + 1) + ' from the server'));
        const a = yield* X.ask(iid, 'runner', 'escherA', 'Escher: swap which ice…', opts, { skip: 'Done', pub: 'The Runner rearranges the ice' });
        if (!a) break;
        const b = yield* X.ask(iid, 'runner', 'escherB', '… with which?', opts.filter(o => o.id !== a), { pub: 'The Runner rearranges the ice' });
        if (!b) break;
        const sa = X.serverOf(a), sb = X.serverOf(b), ia = sa.ice.indexOf(a), ib = sb.ice.indexOf(b);
        sa.ice[ia] = b; sb.ice[ib] = a;
        X.log({ t: 'swapIce', a: sa.id, b: sb.id });
      }
      return 'replace';
    },
    bot: { escher: () => 'no' },
    botPlay: () => 0.3
  });

  S('romp', '03032', 'Run any server. If successful, instead of accessing, remove up to 3 advancement tokens from one card in or protecting it.');
  on('romp', {
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Exploratory Romp: run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays Exploratory Romp' });
      if (sid) yield* X.run(sid, { card: iid, via: 'romp' });
    },
    *success(X, iid, ctx) {
      const sv = X.server(ctx.S.sid);
      const ts = sv ? sv.ice.concat(sv.root).filter(i => X.card(i).adv > 0) : [];
      if (!ts.length) return null;
      const t = yield* X.ask(iid, 'runner', 'romp', 'Exploratory Romp: instead of accessing, take advancement tokens off which card?', ts.map(i => X.cardOpt(i, (X.card(i).rez ? X.nameOf(i) : 'A face-down card') + ' · ' + X.card(i).adv + ' advanced')), { skip: 'Access instead', pub: 'Exploratory Romp' });
      if (!t) return null;
      const n = Math.min(3, X.card(t).adv);
      X.card(t).adv -= n;
      X.log({ t: 'unadv', n, sid: sv.id });
      return 'replace';
    },
    botPlay: () => 0.4
  });

  S('fcc', '03033', 'Trash up to 5 programs from your grip: gain 2 credits for each.');
  on('fcc', {
    *play(X, iid) {
      const progs = X.R.grip.filter(i => X.dat(i).type === 'program');
      const ts = yield* X.ask(iid, 'runner', 'fcc', 'Freelance Coding Contract: trash which programs from your grip (2 credits each)?', progs.map(i => X.cardOpt(i)), { multi: true, min: 0, max: 5, pub: 'The Runner sells code' });
      for (const t of ts) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); }
      if (ts.length) { X.gain('runner', 2 * ts.length); X.log({ t: 'gain', side: 'runner', n: 2 * ts.length, k: 'fcc' }); }
    },
    bot: { fcc: (pub, me, pr) => pr.options.filter(o => !o.bad && !(D.CARDS[o.card] || {}).brk).slice(0, 5).map(o => o.id) },
    botPlay: (pub, me) => (me.hand || []).filter(h => D.CARDS[h.k].type === 'program' && !D.CARDS[h.k].brk).length >= 2 ? 2.5 : -1
  });

  S('scavenge', '03034', 'As an extra cost, trash an installed program. Then install a program from your grip or heap for that much less.');
  on('scavenge', {
    playBad: (X) => X.programs().length ? null : 'You must trash an installed program',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'scavengeOut', 'Scavenge: trash which installed program?', X.programs().map(i => X.cardOpt(i, null, X.dat(i).cost + ' to install')), { pub: 'The Runner plays Scavenge' });
      if (!t) return;
      const off = X.dat(t).cost || 0;
      X.trashRunner(t, 'scavenge');
      const pool = X.R.grip.concat(X.R.heap).filter(i => i !== iid && X.dat(i).type === 'program');
      const u = yield* X.ask(iid, 'runner', 'scavengeIn', 'Scavenge: install which program, ' + off + ' less?', X.dedupe(pool.map(i => X.cardOpt(i, null, Math.max(0, X.installCost(i, off)) + ' credits · ' + (X.R.heap.indexOf(i) >= 0 ? 'from your heap' : 'from your grip'), X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, off) ? 'Costs ' + X.installCost(i, off) : null)))), { skip: 'Nothing', pub: 'The Runner scavenges' });
      if (u) yield* X.runnerInstall(u, { discount: off });
    },
    botPlay: () => -1
  });

  S('levy_ar', '03035', 'Shuffle your grip and heap into your stack and draw 5. It leaves the game instead of going to the heap.');
  on('levy_ar', {
    play(X, iid) {
      X.lift(iid); X.R.gone.push(iid);
      const back = X.R.grip.splice(0).concat(X.R.heap.splice(0));
      for (const i of back) X.card(i).up = false;
      X.R.stack.push(...back); X.shuffleStack();
      X.drawRunner(5, 'levy_ar');
    },
    botPlay: (pub) => pub.runner.stackN < 8 ? 4 : -1
  });

  S('monolith', '03036', '+3 memory. When installed, install up to 3 programs from your grip, each 4 less. Trash a program from your grip: prevent 1 brain or net damage. One console only.', { console: true, memory: 3 });
  on('monolith', {
    *onInstall(X, iid) {
      for (let n = 0; n < 3; n++) {
        const progs = X.R.grip.filter(i => X.dat(i).type === 'program');
        const t = yield* X.ask(iid, 'runner', 'monolithIn', 'Monolith: install a program from your grip, 4 less (' + (n + 1) + ' of up to 3)?', progs.map(i => X.cardOpt(i, null, X.installCost(i, 4) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 4) ? 'Costs ' + X.installCost(i, 4) : null))), { skip: 'Done', pub: 'The Runner fills Monolith' });
        if (!t) break;
        yield* X.runnerInstall(t, { discount: 4 });
      }
    },
    *prevent(X, iid, ctx) {
      if (ctx.kind !== 'net' && ctx.kind !== 'brain') return 0;
      let p = 0;
      while (p < ctx.n) {
        const progs = X.R.grip.filter(i => X.dat(i).type === 'program');
        if (!progs.length) break;
        const t = yield* X.ask(iid, 'runner', 'monolith', 'Monolith: trash a program from your grip to prevent 1 ' + ctx.kind + ' damage (' + (ctx.n - p) + ' coming)?', progs.map(i => X.cardOpt(i)), { skip: 'No', pub: 'The Runner considers Monolith' });
        if (!t) break;
        X.lift(t); X.card(t).up = true; X.R.heap.push(t);
        X.log({ t: 'prevent', side: 'runner', k: 'monolith', n: 1 });
        p++;
      }
      return p;
    },
    bot: { monolith: (pub, me, pr) => pr.options.length && pub.runner.gripN <= 3 ? pr.options[0].id : 'skip' }
  });

  S('feedback_filter', '03037', '3 credits: prevent 1 net damage. Trash it: prevent up to 2 brain damage.');
  on('feedback_filter', {
    *prevent(X, iid, ctx) {
      let p = 0;
      if (ctx.kind === 'net') {
        while (p < ctx.n && X.avail('runner', 'any') >= 3) {
          if (!(yield* X.yn(iid, 'runner', 'ffNet', 'Feedback Filter: pay 3 to prevent 1 net damage (' + (ctx.n - p) + ' coming)?', 'Pay 3', 'No', { pub: 'The Runner considers Feedback Filter' }))) break;
          X.pay('runner', 3, 'any'); p++;
          X.log({ t: 'prevent', side: 'runner', k: 'feedback_filter', n: 1 });
        }
      }
      if (ctx.kind === 'brain') {
        if (yield* X.yn(iid, 'runner', 'ffBrain', 'Feedback Filter: trash it to prevent up to 2 brain damage?', 'Trash it', 'Keep it', { pub: 'The Runner considers Feedback Filter' })) {
          p = Math.min(2, ctx.n); X.trashRunner(iid, 'prevent');
          X.log({ t: 'prevent', side: 'runner', k: 'feedback_filter', n: p });
        }
      }
      return p;
    },
    bot: { ffNet: (pub) => pub.runner.gripN <= 2 ? 'yes' : 'no', ffBrain: () => 'yes' }
  });

  S('clone_chip', '03038', 'Trash it: install a program from your heap (paying for it).');
  on('clone_chip', {
    abils: (X, iid) => [{ label: 'Clone Chip: trash it — install a program from your heap', bad: X.R.heap.some(i => X.dat(i).type === 'program' && !X.installBad(i) && X.avail('runner', 'program') >= X.installCost(i, 0)) ? null : 'No program in your heap you can afford' }],
    *use(X, iid) {
      X.trashRunner(iid, 'used');
      const progs = X.R.heap.filter(i => X.dat(i).type === 'program');
      const t = yield* X.ask(iid, 'runner', 'cloneChip', 'Clone Chip: install which program from your heap?', X.dedupe(progs.map(i => X.cardOpt(i, null, X.installCost(i, 0) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null)))), { pub: 'The Runner uses Clone Chip' });
      if (t) yield* X.runnerInstall(t, {});
    },
    botAbil: (pub) => pub.runner.heap.some(k => D.CARDS[k] && D.CARDS[k].brk) ? 2.5 : -1,
    bot: { cloneChip: (pub, me, pr) => (pr.options.filter(o => !o.bad).sort((a, b) => !!(D.CARDS[b.card] || {}).brk - !!(D.CARDS[a.card] || {}).brk)[0] || {}).id }
  });

  S('omni_drive', '03039', 'Carries one program of 1 memory or less, which then uses none of yours. 1 recurring credit for using that program.', { recur: { n: 1, for: 'omni' } });
  on('omni_drive', {
    freeHost: true,
    hostFor: (X, h, p) => X.dat(p).type === 'program' && (X.dat(p).mu || 0) <= 1 && !X.hostedOn(h).length
  });

  S('atman', '03040', 'When installed, pay any credits for that many power counters: +1 strength each. Breaks only ice of exactly its strength: 1 credit, one subroutine.', { str: 0, exact: true, brk: { type: 'any', cost: 1, n: 1 } });
  on('atman', {
    *onInstall(X, iid) {
      const most = Math.min(X.avail('runner', 'any'), 15);
      if (most <= 0) return;
      const opts = [];
      for (let n = 0; n <= most; n++) opts.push({ id: String(n), label: n ? 'Pay ' + n + ': strength ' + n : 'Nothing: strength 0' });
      const n = +(yield* X.ask(iid, 'runner', 'atman', 'Atman: how strong? (1 credit a power counter)', opts, { always: true, pub: 'The Runner sets Atman' }));
      if (n) { X.pay('runner', n, 'any'); X.card(iid).power = n; X.log({ t: 'power', k: 'atman', n }); }
    },
    self: { breakerStr: (X, iid, v) => v + X.card(iid).power },
    bot: { atman: (pub, me, pr) => String(Math.min(pr.options.length - 1, 4, Math.max(0, pub.runner.credits - 3))) }
  });

  S('cloak', '03041', '1 recurring credit for using icebreakers (a stealth credit).', { recur: { n: 1, for: 'stealth' } });
  S('dagger', '03042', '1 credit: break one sentry subroutine. 1 credit from stealth cards only: +5 strength.', { brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 1, by: 5, why: 'stealth' } });

  S('chakana', '03043', 'A virus counter for each successful run on R&D. With 3 or more, every agenda needs one more advancement.', { virus: true });
  on('chakana', {
    on: { success(X, iid, ctx) { if (ctx.sid === 'rd') X.addVirus(iid, 1); } },
    mod: { advNeed: (X, iid, v) => X.card(iid).virus >= 3 ? v + 1 : v }
  });

  S('cyber_cypher', '03044', 'When installed, choose a server: it works only in runs on that server. 1 credit: break one code gate subroutine. 1 credit: +1 strength.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } });
  on('cyber_cypher', {
    *onInstall(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'cypher', 'Cyber-Cypher: which server is it for?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name, sub: X.runSub(sv) })), { always: true, pub: 'The Runner sets Cyber-Cypher' });
      X.card(iid).x.srv = sid;
      X.log({ t: 'cypher', sid });
    },
    canBreak: (X, iid) => !!X.g.run && X.g.run.sid === X.card(iid).x.srv,
    show: (X, iid) => X.card(iid).x.srv ? 'for ' + X.srvName(X.server(X.card(iid).x.srv)) : null,
    bot: { cypher: (pub) => { const r = pub.corp.servers.filter(s => /^r\d/.test(s.id) && s.ice.length); return r.length ? r[r.length - 1].id : 'rd'; } }
  });

  S('paricia', '03045', '2 recurring credits for paying to trash assets.', { recur: { n: 2, for: 'trashAsset' } });

  S('smc', '03046', '2 credits, trash it: find a program in your stack and install it (paying for it).');
  on('smc', {
    abils: (X) => [{ label: 'Self-modifying Code: trash it — find and install a program', cost: 2, bad: X.R.stack.some(i => X.dat(i).type === 'program') ? null : 'No program in your stack' }],
    *use(X, iid) {
      X.trashRunner(iid, 'used');
      X.g.revealN++;
      const progs = X.R.stack.filter(i => X.dat(i).type === 'program');
      const t = yield* X.ask(iid, 'runner', 'smc', 'Self-modifying Code: install which program?', X.dedupe(progs.map(i => X.cardOpt(i, null, X.installCost(i, 0) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null)))), { pub: 'The Runner searches the stack' });
      if (t) yield* X.runnerInstall(t, {});
      X.shuffleStack();
    },
    botAbil: (pub) => pub.runner.credits >= 6 && pub.runner.rig.filter(r => D.CARDS[r.k].brk).length < 2 ? 2 : -1,
    bot: { smc: (pub, me, pr) => (pr.options.filter(o => !o.bad).sort((a, b) => !!(D.CARDS[b.card] || {}).brk - !!(D.CARDS[a.card] || {}).brk)[0] || {}).id }
  });

  S('sahasrara', '03047', '2 recurring credits for installing programs.', { recur: { n: 2, for: 'program' } });
  S('inti', '03048', '1 credit: break one barrier subroutine. 2 credits: +1 strength for the rest of the run.', { brk: { type: 'barrier', cost: 1, n: 1 }, pump: { cost: 2, by: 1, run: true } });

  S('pro_contacts', '03049', 'A click: gain 1 credit and draw a card.');
  on('pro_contacts', {
    abils: () => [{ label: 'Professional Contacts: gain 1 and draw', clicks: 1 }],
    use(X) { X.gain('runner', 1); X.drawRunner(1, 'pro_contacts'); },
    botAbil: () => 1.9
  });

  S('borrowed_satellite', '03050', '+1 link. Your maximum hand size is 1 higher.', { link: 1, handPlus: 1 });

  S('ice_analyzer', '03051', 'A credit on it whenever the Corp rezzes an ice. Its credits pay for installing programs.');
  on('ice_analyzer', {
    on: { rez(X, iid, ctx) { if (X.dat(ctx.iid).type === 'ice') X.card(iid).cred++; } },
    spend: (X, iid, why) => why === 'program' || why === 'virus'
  });

  S('dirty_laundry', '03052', 'Run any server. When the run ends, if it was successful, gain 5 credits.');
  on('dirty_laundry', {
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Dirty Laundry: run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays Dirty Laundry' });
      if (sid) yield* X.run(sid, { card: iid, via: 'dirty_laundry' });
    },
    runEnd(X, iid, ctx) { if (ctx.how === 'success') { X.gain('runner', 5); X.log({ t: 'gain', side: 'runner', n: 5, k: 'dirty_laundry' }); } },
    botPlay: () => 3.2
  });

  S('daily_casts', '03053', 'Put 8 credits on it when installed. When your turn begins, take 2. Trashed when empty.', { load: 8 });
  on('daily_casts', {
    on: {
      runnerTurnBegin(X, iid) {
        const c = X.card(iid), n = Math.min(2, c.cred);
        c.cred -= n; X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'daily_casts' });
        if (c.cred <= 0) X.trashRunner(iid, 'empty');
      }
    },
    botPlay: () => 3
  });

  S('same_old_thing', '03054', 'Two clicks, trash it: play an event from your heap (paying for it).');
  on('same_old_thing', {
    abils: (X, iid) => [{ label: 'Same Old Thing: play an event from your heap', clicks: 2, bad: X.R.heap.some(i => X.dat(i).type === 'event' && X.avail('runner', 'any') >= X.playCost(i)) ? null : 'No event in your heap you can afford' }],
    *use(X, iid) {
      X.trashRunner(iid, 'used');
      const evs = X.R.heap.filter(i => X.dat(i).type === 'event');
      const t = yield* X.ask(iid, 'runner', 'sameOld', 'Same Old Thing: play which event?', X.dedupe(evs.map(i => X.cardOpt(i, null, X.playCost(i) + ' credits', X.avail('runner', 'any') < X.playCost(i) ? 'Costs ' + X.playCost(i) : null))), { pub: 'The Runner plays an event again' });
      if (t) yield* X.playEvent(t);
    },
    botAbil: () => -1
  });

  S('the_source', '03055', 'Every agenda needs one more advancement. Stealing an agenda costs 3 more. Trashed when an agenda is scored or stolen.');
  on('the_source', {
    mod: { advNeed: (X, iid, v) => v + 1, stealCost: (X, iid, v) => v + 3 },
    on: { scoreOrSteal(X, iid) { if (X.isInstalled(iid)) X.trashRunner(iid, 'the_source'); } },
    botPlay: () => 1.2
  });
  D.SET_LOADED.cac = true;
})(typeof window !== 'undefined' ? window : this);
