'use strict';
/* The Spin cycle (2013-14: Opening Moves, Second Thoughts, Mala Tempora,
 * True Colors, Fear and Loathing, Double Time — 120 cards).
 *
 * Numbers from sets/stats.js (netrunnerdb; printed faces in netrunnerdb/);
 * every line of card text written fresh; behaviour as card scripts.
 * New here: double events and operations (a second click), bad publicity as
 * a thing cards give and take, the Caïssa programs that live on the Corp's
 * ice. Readings decided here:
 *   - Sundew: when the Runner's first click action of a turn is not a run on
 *     its server, the Corp gains 2 (a run there gains and pays it back: nothing).
 *   - Raymond Flint's access of HQ is one random card plus the usual extras.
 *   - Toshiyuki Sakai swaps with an agenda or asset from HQ; the Runner then
 *     chooses whether to access the newcomer.
 *   - Strongbox's extra click is not kept after it is trashed mid-access.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const kw = (X, i, re) => re.test(X.dat(i).kw || '');
  const isCaissa = (X, i) => kw(X, i, /Ca[iï]ssa/);
  const icePlace = (X, i) => (X.card(i).rez ? X.nameOf(i) : 'Unrezzed ice') + ' · ' + X.srvName(X.serverOf(i)) + ' (' + (X.serverOf(i).ice.indexOf(i) + 1) + ' from the server)';
  const allIce = X => [].concat(...X.C.servers.map(sv => sv.ice));
  const isCentral = sid => sid === 'hq' || sid === 'rd' || sid === 'arch';
  /* A run event on any server. */
  const anyRun = (name) => ({
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, { card: iid, via: X.card(iid).k });
    }
  });
  /* A Caïssa program's click: host it on an ice that `ok` allows. */
  function caissa(text, ok) {
    return {
      abils: (X, iid) => [{ label: X.nameOf(iid) + ': host it on an ice', sub: text, clicks: 1, bad: allIce(X).some(i => ok(X, iid, i)) ? null : 'No ice it can move to' }],
      *use(X, iid) { yield* hostOnIce(X, iid, ok); },
      botAbil: () => -1
    };
  }
  function* hostOnIce(X, iid, ok) {
    const ts = allIce(X).filter(i => ok(X, iid, i));
    const t = yield* X.ask(iid, 'runner', 'caissa', X.nameOf(iid) + ': host it on which ice?', ts.map(i => ({ id: i, label: icePlace(X, i) })), { pub: 'The Runner moves a Caïssa program' });
    if (t) { X.card(iid).host = t; X.log({ t: 'hostOn', k: X.card(iid).k, sid: X.serverOf(t).id }); }
  }
  const freeOfCaissa = (X, iid, i) => !X.R.rig.some(p => p !== iid && X.card(p).host === i && isCaissa(X, p));
  const hostIce = (X, iid) => { const h = X.card(iid).host; return h && X.card(h) && X.card(h).side === 'corp' ? h : null; };
  const removeBP = (X, iid, most) => function* () {
    if (!X.C.bp) return;
    const opts = [];
    for (let n = 0; n <= Math.min(most, X.C.bp); n++) opts.push({ id: String(n), label: n ? 'Remove ' + n : 'None' });
    const n = +(yield* X.ask(iid, 'corp', 'removeBP', X.nameOf(iid) + ': remove how much bad publicity?', opts, { always: true }));
    if (n) X.loseBP(n, X.nameOf(iid));
  };
  const trashProgUnless = (X, iid, n) => function* () {
    if (!X.programs().length) return null;
    if (X.avail('runner', 'any') >= n && (yield* X.yn(iid, 'runner', 'payOrLose', X.nameOf(iid) + ': pay ' + n + ', or lose a program?', 'Pay ' + n, 'Lose a program', { pub: X.nameOf(iid) + ': pay, or lose a program' }))) { X.pay('runner', n, 'any'); X.log({ t: 'paid', n, k: X.card(iid).k }); return null; }
    yield* X.trashProgram(X.nameOf(iid));
    return null;
  };

  /* ================================================================ OPENING MOVES */
  S('frame_job', '04001', 'Double. Forfeit an agenda: the Corp takes 1 bad publicity.');
  on('frame_job', {
    playBad: (X) => X.R.score.some(i => X.dat(i).type === 'agenda') ? null : 'No agenda to forfeit',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'frameJob', 'Frame Job: forfeit which agenda?', X.R.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { pub: 'The Runner frames the Corp' });
      if (!t) return;
      X.lift(t); X.R.gone.push(t); X.log({ t: 'forfeit', side: 'runner', k: X.card(t).k });
      yield* X.takeBP(1, 'Frame Job');
    },
    botPlay: () => -1
  });
  S('pawn', '04002', 'Caïssa. A click: host it on the outermost ice of a central server. Each successful run while hosted, it moves one ice inward; with nowhere to go it is trashed and you install another Caïssa program from your grip or heap, free.');
  on('pawn', Object.assign(caissa('outermost ice of HQ, R&D or Archives', (X, iid, i) => isCentral(X.serverOf(i).id) && X.serverOf(i).ice[X.serverOf(i).ice.length - 1] === i && X.card(iid).host !== i), {
    on: {
      *success(X, iid) {
        const h = hostIce(X, iid);
        if (!h) return;
        const sv = X.serverOf(h), pos = sv.ice.indexOf(h);
        if (pos > 0) { X.card(iid).host = sv.ice[pos - 1]; X.log({ t: 'hostOn', k: 'pawn', sid: sv.id }); return; }
        X.trashRunner(iid, 'pawn');
        const pool = X.R.grip.concat(X.R.heap).filter(i => isCaissa(X, i) && X.card(i).k !== 'pawn');
        const t = yield* X.ask(iid, 'runner', 'pawnNext', 'Pawn is spent: install another Caïssa program, free?', X.dedupe(pool.map(i => X.cardOpt(i))), { skip: 'No', pub: 'Pawn reaches the end' });
        if (t) yield* X.runnerInstall(t, { free: true });
      }
    }
  }));
  S('rook', '04003', 'Caïssa. While on an ice, every ice protecting that server costs 2 more to rez. A click: host it on an ice with no Caïssa program (once hosted: only on the same server, or the same position elsewhere).');
  on('rook', Object.assign(caissa('the same server, or the same position on another', (X, iid, i) => {
    if (!freeOfCaissa(X, iid, i) || X.card(iid).host === i) return false;
    const h = hostIce(X, iid);
    if (!h) return true;
    const a = X.serverOf(h), b = X.serverOf(i);
    return a === b || a.ice.indexOf(h) === b.ice.indexOf(i);
  }), { mod: { rezCost: (X, iid, v, ctx) => { const h = hostIce(X, iid); return h && X.dat(ctx.iid).type === 'ice' && X.serverOf(ctx.iid) === X.serverOf(h) ? v + 2 : v; } } }));
  S('hostage', '04004', 'Double. Find a connection in your stack, show it and take it; you may install it (paying). Shuffle.');
  on('hostage', {
    playBad: (X) => X.R.stack.some(i => kw(X, i, /Connection/)) ? null : 'No connection in your stack',
    *play(X, iid) {
      X.g.revealN++;
      const t = yield* X.ask(iid, 'runner', 'hostage', 'Hostage: take which connection?', X.dedupe(X.R.stack.filter(i => kw(X, i, /Connection/)).map(i => X.cardOpt(i))), { pub: 'The Runner searches the stack' });
      X.shuffleStack();
      if (!t) return;
      X.lift(t); X.R.grip.push(t); X.reveal('runner', [t], 'Hostage');
      if (X.avail('runner', 'any') >= X.installCost(t, 0) && !X.installBad(t) && (yield* X.yn(iid, 'runner', 'hostageIn', 'Install ' + X.nameOf(t) + ' now (' + X.installCost(t, 0) + ')?', 'Install it', 'Keep it'))) yield* X.runnerInstall(t, {});
    },
    bot: { hostageIn: () => 'yes' },
    botPlay: () => 1.5
  });
  S('gorman_drip', '04005', 'A virus counter whenever the Corp clicks to draw or gain a credit. A click, trash it: 1 credit per counter.', { virus: true });
  on('gorman_drip', {
    on: { corpBasic(X, iid) { X.addVirus(iid, 1); } },
    abils: (X, iid) => [{ label: 'Gorman Drip: trash it — gain ' + X.card(iid).virus, clicks: 1 }],
    use(X, iid) { const n = X.card(iid).virus; X.trashRunner(iid, 'used'); X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'gorman_drip' }); },
    botAbil: (pub, me, o) => +((o.label.match(/gain (\d+)/) || [])[1] || 0) >= 7 ? 4 : -1,
    botPlay: () => 1.6
  });
  S('lockpick', '04006', '1 recurring credit for using decoders.', { recur: { n: 1, for: 'decoder' } });
  S('false_echo', '04007', 'As you pass an unrezzed ice, you may trash it: the Corp must rez that ice or take it back into HQ.');
  on('false_echo', {
    on: {
      *passIce(X, iid, ctx) {
        const ice = ctx.iid;
        if (X.card(ice).rez || !X.isInstalled(ice)) return;
        if (!(yield* X.yn(iid, 'runner', 'falseEcho', 'False Echo: trash it — the Corp must rez this ice or take it into HQ?', 'Trash it', 'Not now', { pub: 'The Runner considers False Echo' }))) return;
        X.trashRunner(iid, 'used');
        const can = X.avail('corp', 'rezIce') >= X.rezCost(ice);
        const a = yield* X.ask(iid, 'corp', 'falseEchoAns', 'False Echo: rez ' + X.nameOf(ice) + ' (' + X.rezCost(ice) + ') or take it into HQ?', [{ id: 'rez', label: 'Rez it (' + X.rezCost(ice) + ')', bad: can ? null : 'You cannot pay for it' }, { id: 'hq', label: 'Take it into HQ' }], { pub: 'The Corp must rez the ice or take it back' });
        if (a === 'rez' && (yield* X.rezFlow(ice, false))) return;
        X.toHQ(ice); X.log({ t: 'toHQ', what: 'ice' });
      }
    },
    bot: { falseEcho: () => 'yes', falseEchoAns: (pub) => pub.corp.credits >= 6 ? 'rez' : 'hq' }
  });
  S('motivation', '04008', 'When your turn begins, you may look at the top card of your stack.');
  on('motivation', { on: { runnerTurnBegin(X) { if (X.R.stack.length) { X.R.peekStack = { iid: X.R.stack[0], k: X.card(X.R.stack[0]).k, turn: X.g.turnN }; X.log({ t: 'peek', k: 'motivation' }); } } }, botPlay: () => 0.4 });
  S('john_masanori', '04009', 'Your first successful run each turn: draw a card. Your first unsuccessful run each turn: take a tag.');
  on('john_masanori', {
    on: {
      success(X, iid) { if (!X.R.flags.jmWin) { X.R.flags.jmWin = true; X.drawRunner(1, 'john_masanori'); } },
      *runEnd(X, iid, ctx) { if (ctx.how !== 'success' && !X.R.flags.jmLose && X.g.active === 'runner') { X.R.flags.jmLose = true; yield* X.giveTags(1, 'John Masanori'); } }
    },
    botPlay: () => 1.6
  });
  S('project_ares', '04010', 'When scored, the Runner trashes one installed card for each advancement token over 4; if any go, you take 1 bad publicity.');
  on('project_ares', {
    *onScore(X, iid, ctx) {
      const n = Math.min(ctx.over, X.R.rig.length);
      if (!n) return;
      const ts = yield* X.ask(iid, 'runner', 'ares', 'Project Ares: trash ' + X.plural(n, 'installed card') + '.', X.R.rig.map(i => X.cardOpt(i)), { multi: true, min: n, max: n, pub: 'The Runner loses installed cards' });
      for (const t of ts) if (X.isInstalled(t)) X.trashRunner(t, 'Project Ares');
      if (ts.length) yield* X.takeBP(1, 'Project Ares');
    }
  });
  S('next_bronze', '04011', '+1 strength for each rezzed NEXT ice.', { subs: [{ k: 'etr' }] });
  on('next_bronze', { self: { iceStr: (X, iid, v) => v + X.installedCorp().filter(i => X.card(i).rez && kw(X, i, /NEXT/)).length } });
  S('celebrity_gift', '04012', 'Double. Show up to 5 cards from HQ: gain 2 credits for each.');
  on('celebrity_gift', {
    *play(X, iid) {
      const ts = yield* X.ask(iid, 'corp', 'celebGift', 'Celebrity Gift: show which cards from HQ (2 credits each, up to 5)?', X.C.hq.map(i => X.cardOpt(i)), { multi: true, min: 0, max: 5, pub: 'The Corp shows its hand' });
      X.reveal('corp', ts, 'Celebrity Gift');
      if (ts.length) { X.gain('corp', 2 * ts.length); X.log({ t: 'gain', side: 'corp', n: 2 * ts.length, k: 'celebrity_gift' }); }
    },
    bot: { celebGift: (pub, me, pr) => pr.options.filter(o => !o.bad && (D.CARDS[o.card] || {}).type !== 'agenda').slice(0, 5).map(o => o.id) },
    botPlay: (pub, me) => (me.hand || []).length >= 5 ? 3 : 1
  });
  S('himitsu_bako', '04013', '1 credit: take it back into HQ.', { subs: [{ k: 'etr' }] });
  on('himitsu_bako', {
    abils: () => [{ label: 'Himitsu-Bako: take it back into HQ', cost: 1 }],
    use(X, iid) { X.toHQ(iid); X.log({ t: 'toHQ', what: 'Himitsu-Bako' }); },
    winOpts: (X, iid, w) => X.avail('corp', 'any') >= 1 && w.where === 'ice' && w.iid === iid ? [{ label: 'Himitsu-Bako: pay 1, take it back into HQ' }] : [],
    winUse(X, iid) { X.pay('corp', 1, 'any'); X.toHQ(iid); X.log({ t: 'toHQ', what: 'Himitsu-Bako' }); },
    botAbil: () => -1
  });
  S('character_assassination', '04014', 'When scored, trash one resource (it cannot be prevented).');
  on('character_assassination', {
    *onScore(X, iid) {
      const res = X.rigOf('resource');
      const t = yield* X.ask(iid, 'corp', 'charAss', 'Character Assassination: trash which resource?', res.map(i => X.cardOpt(i)), { pub: 'The Corp trashes a resource' });
      if (t) yield* X.corpTrashes(t, 'Character Assassination', { unprev: true });
    }
  });
  S('jackson_howard', '04015', 'A click: draw 2. Remove it from the game: shuffle up to 3 cards from Archives into R&D.');
  on('jackson_howard', {
    abils: (X) => [{ label: 'Jackson Howard: draw 2', clicks: 1 }, { label: 'Jackson Howard: remove him — up to 3 from Archives into R&D', bad: X.C.arch.length ? null : 'Archives is empty' }],
    *use(X, iid, n) {
      if (n === 0) { X.drawCorp(2, 'jackson_howard'); return; }
      const ts = yield* X.ask(iid, 'corp', 'jhArch', 'Jackson Howard: shuffle which cards from Archives into R&D (up to 3)?', X.C.arch.map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { multi: true, min: 0, max: 3 });
      X.lift(iid); X.C.gone.push(iid);
      for (const t of ts) { X.lift(t); X.card(t).up = false; X.C.rd.push(t); }
      X.shuffleRD(); X.log({ t: 'archToRD', n: ts.length });
    },
    bot: { jhArch: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type === 'agenda').slice(0, 3).map(o => o.id) },
    botAbil: (pub, me, o) => /draw 2/.test(o.label) ? ((me.hand || []).length <= 3 ? 2.6 : 0.5) : (pub.corp.arch.up.filter(k => D.CARDS[k].type === 'agenda').length >= 2 ? 2 : -1)
  });
  S('invasion_privacy', '04016', 'Double. Trace 2: the Runner shows their grip and you trash up to as many resources and events from it as the trace beat their link. If it fails, take 1 bad publicity.');
  on('invasion_privacy', {
    *play(X, iid) {
      const r = yield* X.trace(2, 'Invasion of Privacy');
      if (!r.ok) { yield* X.takeBP(1, 'Invasion of Privacy'); return; }
      X.reveal('runner', X.R.grip.slice(), 'Invasion of Privacy');
      const ok = X.R.grip.filter(i => ['resource', 'event'].indexOf(X.dat(i).type) >= 0);
      if (!ok.length || !r.excess) return;
      const ts = yield* X.ask(iid, 'corp', 'invasion', 'Invasion of Privacy: trash up to ' + r.excess + ' of these', ok.map(i => X.cardOpt(i)), { multi: true, min: 0, max: r.excess });
      for (const t of ts) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'discardBy', k: X.card(t).k, by: 'invasion_privacy' }); }
    },
    bot: { invasion: (pub, me, pr) => pr.options.slice(0, pr.max).map(o => o.id) },
    botPlay: (pub) => pub.corp.credits >= pub.runner.credits + 4 ? 2.5 : 0.2
  });
  S('geothermal', '04017', 'When scored, 2 agenda counters. A click and a counter: gain 7 credits and take 1 bad publicity.', { scoreCounters: 2 });
  on('geothermal', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'Geothermal Fracking: gain 7, take 1 bad publicity', clicks: 1, bad: X.card(iid).agenda > 0 ? null : 'No counters left' }] : [],
    *use(X, iid) { X.spendAgenda(iid); X.gain('corp', 7); X.log({ t: 'gain', side: 'corp', n: 7, k: 'geothermal' }); yield* X.takeBP(1, 'Geothermal Fracking'); },
    botAbil: (pub) => pub.corp.credits < 10 ? 3.5 : 0.5
  });
  S('swarm', '04018', 'Rezzing it gives you 1 bad publicity. Can be advanced: a “trash a program unless the Runner pays 3” subroutine per token.', { advable: true,
    advSub: { k: 's', n: 0, text: 'Trash an installed program unless the Runner pays 3' }, subs: [] });
  on('swarm', { *onRez(X) { yield* X.takeBP(1, 'Swarm'); }, subs: [function* (X, iid) { return yield* trashProgUnless(X, iid, 3)(); }], bot: { payOrLose: (pub) => pub.runner.credits >= 6 ? 'yes' : 'no' } });
  S('cyberdex_trial', '04019', 'Purge virus counters.');
  on('cyberdex_trial', {
    *play(X) { yield* X.purge(); },
    botPlay: (pub) => pub.runner.rig.reduce((s, r) => s + (r.virus || 0), 0) >= 2 ? 4 : -1
  });
  S('grim', '04020', 'Rezzing it gives you 1 bad publicity.', { subs: [{ k: 'trashProg' }] });
  on('grim', { *onRez(X) { yield* X.takeBP(1, 'Grim'); } });

  /* ================================================================ SECOND THOUGHTS */
  S('bishop', '04021', 'Caïssa. The ice it is on has −2 strength. A click: host it on an ice with no Caïssa program — from a central server’s ice only to a remote’s, and back.');
  on('bishop', Object.assign(caissa('central to remote, remote to central', (X, iid, i) => {
    if (!freeOfCaissa(X, iid, i) || X.card(iid).host === i) return false;
    const h = hostIce(X, iid);
    if (!h) return true;
    return isCentral(X.serverOf(h).id) !== isCentral(X.serverOf(i).id);
  }), { mod: { iceStr: (X, iid, v, ctx) => hostIce(X, iid) === ctx.iid ? v - 2 : v } }));
  S('scheherazade', '04022', 'Carries any number of programs. Whenever you install a program on it, gain 1 credit.');
  on('scheherazade', {
    hostFor: (X, h, p) => X.dat(p).type === 'program' && p !== h,
    on: { install(X, iid, ctx) { if (ctx.side === 'runner' && X.card(ctx.iid).host === iid) { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'scheherazade' }); } } },
    botPlay: () => 1.2
  });
  S('hard_at_work', '04023', 'When your turn begins, gain 2 credits and lose a click.');
  on('hard_at_work', { on: { runnerTurnBegin(X) { X.gain('runner', 2); X.R.clicks = Math.max(0, X.R.clicks - 1); X.log({ t: 'gain', side: 'runner', n: 2, k: 'hard_at_work' }); } }, botPlay: () => 1.4 });
  S('recon', '04024', 'Run any server. You may jack out as you meet the first ice.');
  on('recon', Object.assign(anyRun('Recon'), {
    *runEnc(X, iid, ctx) {
      if (ctx.S.reconAsked) return null;
      ctx.S.reconAsked = true;
      return (yield* X.yn(iid, 'runner', 'recon', 'Recon: you meet ' + X.nameOf(ctx.iid) + '. Jack out now?', 'Jack out', 'Face it', { pub: 'The Runner considers jacking out' })) ? 'jack' : null;
    },
    bot: { recon: () => 'no' },
    botPlay: () => 0.6
  }));
  S('copycat', '04025', 'As you pass an ice, you may trash it: carry on as if you had just passed another rezzed copy of that ice, on any server.');
  on('copycat', {
    on: {
      *passIce(X, iid, ctx) {
        const ice = ctx.iid;
        if (!X.card(ice).rez) return;
        const copies = allIce(X).filter(i => i !== ice && X.card(i).rez && X.card(i).k === X.card(ice).k);
        if (!copies.length) return;
        const t = yield* X.ask(iid, 'runner', 'copycat', 'Copycat: trash it and carry on from another ' + X.nameOf(ice) + '?', copies.map(i => ({ id: i, label: icePlace(X, i) })), { skip: 'No', pub: 'The Runner considers Copycat' });
        if (!t) return;
        X.trashRunner(iid, 'used');
        ctx.S.jumpTo = t;
        X.log({ t: 'copycat', sid: X.serverOf(t).id });
      }
    },
    bot: { copycat: () => 'skip' },
    botPlay: () => 0.3
  });
  S('leviathan', '04026', '3 credits: break up to three code gate subroutines. 3 credits: +5 strength.', { brk: { type: 'code gate', cost: 3, n: 3 }, pump: { cost: 3, by: 5 } });
  S('eureka', '04027', 'Double. Show the top card of your stack: install it for 10 less if you can, or it is trashed.');
  on('eureka', {
    *play(X, iid) {
      const t = X.R.stack[0];
      if (!t) return;
      X.reveal('runner', [t], 'Eureka!');
      const d = X.dat(t);
      if (['program', 'hardware', 'resource'].indexOf(d.type) >= 0 && !X.installBad(t) && X.avail('runner', 'any') >= X.installCost(t, 10) &&
        (yield* X.yn(iid, 'runner', 'eureka', 'Eureka!: install ' + d.name + ' for ' + X.installCost(t, 10) + '?', 'Install it', 'Trash it'))) { yield* X.runnerInstall(t, { discount: 10 }); return; }
      X.lift(t); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'mill', k: 'eureka', side: 'runner' });
    },
    bot: { eureka: () => 'yes' },
    botPlay: () => 0.8
  });
  S('record_reconstructor', '04028', 'After a successful run on Archives, instead of accessing you may put one face-up card from Archives on top of R&D.');
  on('record_reconstructor', {
    on: {
      *success(X, iid, ctx) {
        if (ctx.sid !== 'arch' || ctx.S.replace) return;
        const up = X.C.arch.filter(i => X.card(i).up);
        if (!up.length || !(yield* X.yn(iid, 'runner', 'recRec', 'Record Reconstructor: put a face-up card from Archives on top of R&D instead of accessing?', 'Do it', 'Access Archives'))) return;
        ctx.S.replace = function* () {
          const t = yield* X.ask(iid, 'runner', 'recRecCard', 'Which card goes on top of R&D?', up.map(i => X.cardOpt(i)), { pub: 'The Runner rebuilds the record' });
          if (t) { X.lift(t); X.card(t).up = false; X.C.rd.unshift(t); X.log({ t: 'toRD', k: X.card(t).k }); }
        };
      }
    },
    bot: { recRec: (pub) => pub.corp.arch.up.some(k => D.CARDS[k].type === 'agenda') ? 'yes' : 'no', recRecCard: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id },
    botPlay: () => 0.4
  });
  S('prepaid_voicepad', '04029', '1 recurring credit for playing events.', { recur: { n: 1, for: 'event' } });
  S('wotan_ice', '04030', '', { subs: [
    { k: 's', n: 0, text: 'End the run unless the Runner spends two clicks' }, { k: 's', n: 1, text: 'End the run unless the Runner pays 3' },
    { k: 's', n: 2, text: 'End the run unless the Runner trashes an installed program' }, { k: 's', n: 3, text: 'End the run unless the Runner takes 1 brain damage' }] });
  on('wotan_ice', {
    subs: [
      function* (X, iid) { if (X.R.clicks >= 2 && (yield* X.yn(iid, 'runner', 'wotanK', 'Wotan: spend two clicks, or the run ends?', 'Spend two clicks', 'Let the run end'))) { X.R.clicks -= 2; return null; } return 'end'; },
      function* (X, iid) { if (X.avail('runner', 'any') >= 3 && (yield* X.yn(iid, 'runner', 'wotanC', 'Wotan: pay 3, or the run ends?', 'Pay 3', 'Let the run end'))) { X.pay('runner', 3, 'any'); return null; } return 'end'; },
      function* (X, iid) {
        if (!X.programs().length) return 'end';
        const t = yield* X.ask(iid, 'runner', 'wotanP', 'Wotan: trash a program, or the run ends?', X.programs().map(i => X.cardOpt(i)), { skip: 'Let the run end' });
        if (!t) return 'end';
        X.trashRunner(t, 'Wotan'); return null;
      },
      function* (X, iid) { if (yield* X.yn(iid, 'runner', 'wotanB', 'Wotan: take 1 brain damage, or the run ends?', 'Take it', 'Let the run end')) { yield* X.damage('brain', 1, 'Wotan'); return null; } return 'end'; }
    ],
    bot: { wotanK: (pub) => pub.runner.clicks >= 3 ? 'yes' : 'no', wotanC: (pub) => pub.runner.credits >= 6 ? 'yes' : 'no', wotanP: () => 'skip', wotanB: () => 'no' }
  });
  S('hellion', '04031', 'Only if the Runner installed a resource on their last turn. Trace 2: put an installed resource on top of the stack. If it fails, take 1 bad publicity.');
  on('hellion', {
    playBad: (X) => X.R.last.installedRes ? null : 'Only if the Runner installed a resource on their last turn',
    *play(X, iid) {
      const r = yield* X.trace(2, 'Hellion Alpha Test');
      if (!r.ok) { yield* X.takeBP(1, 'Hellion Alpha Test'); return; }
      const t = yield* X.ask(iid, 'corp', 'hellion', 'Hellion Alpha Test: which resource goes on top of the stack?', X.rigOf('resource').map(i => X.cardOpt(i)));
      if (t) { X.lift(t); X.wipe(X.card(t)); X.card(t).up = false; X.R.stack.unshift(t); X.log({ t: 'toStack', k: X.card(t).k, by: 'hellion' }); }
    },
    botPlay: () => 2
  });
  S('clone_retirement', '04032', 'When scored, you may remove 1 bad publicity. When stolen, you take 1 bad publicity.');
  on('clone_retirement', { *onScore(X, iid) { yield* removeBP(X, iid, 1)(); }, *onSteal(X) { yield* X.takeBP(1, 'Clone Retirement'); } });
  S('swordsman', '04033', 'AI programs cannot break its subroutines.', { subs: [{ k: 's', n: 0, text: 'Trash an installed AI program' }, { k: 'net', n: 1 }] });
  on('swordsman', {
    blocks: (X, iid, b) => kw(X, b, /\bAI\b/),
    subs: [function* (X, iid) {
      const ai = X.programs().filter(i => kw(X, i, /\bAI\b/));
      const t = yield* X.ask(iid, 'corp', 'swordsman', 'Swordsman: trash which AI program?', ai.map(i => X.cardOpt(i)));
      if (t && !(yield* X.saveWithConstruct(t))) X.trashRunner(t, 'Swordsman');
      return null;
    }]
  });
  S('shipment_sansan', '04034', 'Double. Put up to two advancement tokens on a card that can be advanced.');
  on('shipment_sansan', {
    playBad: (X) => X.advTargets().length ? null : 'Nothing installed can be advanced',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'advTo', 'Shipment from SanSan: two advancement tokens on…', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')));
      if (t) { X.card(t).adv += 2; X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'shipment_sansan', x: 2 }); }
    },
    botPlay: () => 2.6
  });
  S('muckraker', '04035', 'Rezzing it gives you 1 bad publicity.', { subs: [{ k: 'trace', n: 1, then: 'tag' }, { k: 'trace', n: 2, then: 'tag' }, { k: 'trace', n: 3, then: 'tag' }, { k: 's', n: 0, text: 'End the run if the Runner is tagged' }] });
  on('muckraker', { *onRez(X) { yield* X.takeBP(1, 'Muckraker'); }, subs: [function (X) { return X.R.tags > 0 ? 'end' : null; }] });
  S('the_cleaners', '04036', 'All meat damage you do is 1 higher.');
  on('the_cleaners', { mod: { damage: (X, iid, v, ctx) => ctx.kind === 'meat' ? v + 1 : v } });
  S('elizabeth_mills', '04037', 'When rezzed, remove 1 bad publicity. A click, trash her: trash an installed location resource and take 1 bad publicity.');
  on('elizabeth_mills', {
    onRez(X) { X.loseBP(1, 'Elizabeth Mills'); },
    abils: (X) => [{ label: 'Elizabeth Mills: trash her — trash a location', clicks: 1, bad: X.rigOf('resource').some(i => kw(X, i, /Location/)) ? null : 'No location installed' }],
    *use(X, iid) {
      X.toArchives(iid, true);
      const t = yield* X.ask(iid, 'corp', 'eliz', 'Elizabeth Mills: trash which location?', X.rigOf('resource').filter(i => kw(X, i, /Location/)).map(i => X.cardOpt(i)));
      if (t) yield* X.corpTrashes(t, 'Elizabeth Mills');
      yield* X.takeBP(1, 'Elizabeth Mills');
    },
    botAbil: () => 2
  });
  S('off_the_grid', '04038', 'Install only in a remote server. The Runner cannot run this server. Trashed whenever the Runner makes a successful run on HQ.', { remoteOnly: true });
  on('off_the_grid', {
    mod: { runBad: (X, iid, v, ctx) => v || (X.serverOf(iid) && ctx.sid === X.serverOf(iid).id ? 'Off the Grid: this server cannot be run' : null) },
    on: { success(X, iid, ctx) { if (ctx.sid === 'hq' && X.isInstalled(iid)) { X.toArchives(iid, true); X.log({ t: 'empty', k: 'off_the_grid' }); } } }
  });
  S('profiteering', '04039', 'When scored, take up to 3 bad publicity: 5 credits for each.');
  on('profiteering', {
    *onScore(X, iid) {
      const n = +(yield* X.ask(iid, 'corp', 'profit', 'Profiteering: take how much bad publicity (5 credits each)?', [0, 1, 2, 3].map(n => ({ id: String(n), label: n ? 'Take ' + n + ': gain ' + 5 * n : 'None' })), { always: true }));
      const got = yield* X.takeBP(n, 'Profiteering');
      if (got) { X.gain('corp', 5 * got); X.log({ t: 'gain', side: 'corp', n: 5 * got, k: 'profiteering' }); }
    },
    bot: { profit: () => '2' }
  });
  S('restructure', '04040', 'Gain 15 credits.');
  on('restructure', { play(X) { X.gain('corp', 15); }, botPlay: (pub) => pub.corp.credits >= 10 && pub.corp.credits < 15 ? 4 : -1 });

  /* ================================================================ MALA TEMPORA */
  S('reina_roja', '04041', 'The first ice the Corp rezzes each turn costs 1 more.');
  on('reina_roja', {
    mod: { rezCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'ice' && X.card(iid).x.iceTurn !== X.g.turnN ? v + 1 : v },
    on: { rez(X, iid, ctx) { if (X.dat(ctx.iid).type === 'ice') X.card(iid).x.iceTurn = X.g.turnN; } }
  });
  S('deep_red', '04042', '+3 memory, for Caïssa programs only. Whenever you install a Caïssa program you may use its click ability without the click. One console only.', { console: true });
  on('deep_red', {
    mod: { muUsed: (X, iid, v) => v - Math.min(3, X.programs().filter(i => isCaissa(X, i)).reduce((s, i) => s + X.muOf(i), 0)) },
    on: {
      *install(X, iid, ctx) {
        if (ctx.side !== 'runner' || !isCaissa(X, ctx.iid) || !D.SCRIPT[X.card(ctx.iid).k] || !D.SCRIPT[X.card(ctx.iid).k].abils) return;
        const a = (D.SCRIPT[X.card(ctx.iid).k].abils(X, ctx.iid) || [])[0];
        if (!a || a.bad) return;
        if (yield* X.yn(iid, 'runner', 'deepRed', 'Deep Red: host ' + X.nameOf(ctx.iid) + ' on an ice now, without a click?', 'Host it', 'Not now')) yield* X.call(D.SCRIPT[X.card(ctx.iid).k].use, ctx.iid, 0, a);
      }
    },
    bot: { deepRed: () => 'yes' },
    botPlay: (pub) => pub.runner.rig.some(r => /Ca[iï]ssa/.test(D.CARDS[r.k].kw || '')) ? 2 : 0.3
  });
  S('knight', '04043', 'Caïssa. 2 credits: break one subroutine on the ice it is on. A click: host it on an ice with no Caïssa program (not the one next to its current ice).', { brk: { type: 'any', cost: 2, n: 1 } });
  on('knight', Object.assign(caissa('any ice with no Caïssa program, not next to where it is', (X, iid, i) => {
    if (!freeOfCaissa(X, iid, i) || X.card(iid).host === i) return false;
    const h = hostIce(X, iid);
    if (!h) return true;
    const a = X.serverOf(h), b = X.serverOf(i);
    return !(a === b && Math.abs(a.ice.indexOf(h) - b.ice.indexOf(i)) === 1);
  }), { canBreak: (X, iid, E) => hostIce(X, iid) === E.iid }));
  S('running_interference', '04044', 'Double. Run any server: the Corp pays each ice’s rez cost twice over this run.');
  on('running_interference', Object.assign(anyRun('Running Interference'), { runMod: { rezCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'ice' ? v * 2 : v }, botPlay: () => 0.8 }));
  S('esa', '04045', 'A click: run HQ. If successful, instead of accessing you may show every card in HQ.');
  on('esa', {
    abils: (X) => [{ label: 'Expert Schedule Analyzer: run HQ', clicks: 1, bad: X.runBad('hq', 0) }],
    *use(X, iid) { yield* X.run('hq', { card: iid, via: 'esa' }); },
    *success(X, iid) {
      if (!(yield* X.yn(iid, 'runner', 'esa', 'Expert Schedule Analyzer: show all of HQ instead of accessing?', 'Show HQ', 'Access HQ'))) return null;
      X.reveal('corp', X.C.hq.slice(), 'Expert Schedule Analyzer');
      return 'replace';
    },
    bot: { esa: () => 'no' },
    botAbil: () => -1
  });
  S('grifter', '04046', 'When your turn ends: gain 1 credit if you made a successful run this turn; otherwise it is trashed.');
  on('grifter', { on: { runnerTurnEnd(X, iid) { if (X.R.flags.success) { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'grifter' }); } else X.trashRunner(iid, 'grifter'); } }, botPlay: () => 1 });
  S('torch', '04047', '1 credit: break one code gate subroutine. 1 credit: +1 strength.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } });
  S('wird', '04048', 'When your turn begins, show the top card of R&D; the Corp may draw it.');
  on('wird', {
    on: {
      *runnerTurnBegin(X, iid) {
        const t = X.C.rd[0];
        if (!t) return;
        X.reveal('corp', [t], 'Woman in the Red Dress');
        if (yield* X.yn(iid, 'corp', 'wird', 'Woman in the Red Dress: draw ' + X.nameOf(t) + '?', 'Draw it', 'Leave it')) X.drawCorp(1, 'wird');
      }
    },
    bot: { wird: () => 'yes' },
    botPlay: () => 1.2
  });
  S('raymond_flint', '04049', 'Whenever the Corp takes bad publicity, access HQ (not its root). Trash him: expose a card.');
  on('raymond_flint', {
    on: {
      *bp(X) {
        if (!X.C.hq.length) return;
        const n = Math.min(X.C.hq.length, X.mod('accessHQ', 1 + X.rigCards('hq_interface').length, {}));
        const pool = X.C.hq.slice(), list = [];
        for (let k = 0; k < n && pool.length; k++) list.push({ iid: pool.splice(Math.floor(X.rand() * pool.length), 1)[0], from: 'hq' });
        yield* X.accessOutside(list, 'hq');
      }
    },
    abils: (X) => [{ label: 'Raymond Flint: trash him — expose a card', bad: X.installedCorp().some(i => !X.card(i).rez) ? null : 'Nothing to expose' }],
    *use(X, iid) {
      X.trashRunner(iid, 'used');
      const t = yield* X.ask(iid, 'runner', 'expose', 'Raymond Flint: expose which card?', X.installedCorp().filter(i => !X.card(i).rez).map(i => ({ id: i, label: (X.dat(i).type === 'ice' ? 'Ice' : 'A card') + ' in ' + X.srvName(X.serverOf(i)) })));
      if (t) yield* X.expose(t, 'Raymond Flint');
    },
    botAbil: () => -1,
    botPlay: () => 0.8
  });
  S('isabel_mcguire', '04050', 'A click: take one of your installed cards back into HQ.');
  on('isabel_mcguire', {
    abils: (X, iid) => [{ label: 'Isabel McGuire: take an installed card back into HQ', clicks: 1, bad: X.installedCorp().some(i => i !== iid) ? null : 'Nothing else installed' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'isabel', 'Isabel McGuire: take which card back?', X.installedCorp().filter(i => i !== iid).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (t) { const what = X.dat(t).type === 'ice' ? 'ice' : 'a card'; X.toHQ(t); X.log({ t: 'toHQ', what }); }
    },
    botAbil: () => -1
  });
  S('hudson', '04051', 'The Runner may lose a click to break one of its subroutines.', { clickBreak: { clicks: 1, n: 1 },
    subs: [{ k: 's', n: 0, text: 'The Runner can access no more than 1 card this run' }, { k: 's', n: 1, text: 'The Runner can access no more than 1 card this run' }] });
  on('hudson', { subs: [function (X) { X.g.run.accessMax = 1; return null; }, function (X) { X.g.run.accessMax = 1; return null; }] });
  S('accelerated_diag', '04052', 'Look at the top 3 cards of R&D: play any operations among them (paying for them), trash the rest.');
  on('accelerated_diag', {
    *play(X, iid) {
      const top = X.C.rd.slice(0, 3);
      X.g.revealN++;
      for (let n = 0; n < 3; n++) {
        const ops = top.filter(i => X.C.rd.indexOf(i) >= 0 && X.dat(i).type === 'operation');
        const opts = ops.map(i => X.cardOpt(i, 'Play ' + X.nameOf(i), X.playCost(i) + ' credits', X.C.credits < X.playCost(i) ? 'Costs ' + X.playCost(i) : (D.SCRIPT[X.card(i).k] && D.SCRIPT[X.card(i).k].playBad ? D.SCRIPT[X.card(i).k].playBad(X, i) : null)));
        if (!opts.some(o => !o.bad)) break;
        const t = yield* X.ask(iid, 'corp', 'accDiag', 'Accelerated Diagnostics: play which operation?', opts, { skip: 'No more' });
        if (!t) break;
        X.lift(t); X.C.hq.push(t);
        yield* X.playOp(t);
      }
      for (const i of top) if (X.C.rd.indexOf(i) >= 0) X.toArchives(i, false);
      X.log({ t: 'abt', looked: top.length });
    },
    botPlay: () => 1.2
  });
  S('unorthodox', '04053', 'When scored, choose sentry, code gate or barrier: subroutines on ice of that type cannot be broken until your next turn begins.');
  on('unorthodox', {
    *onScore(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'unorthodox', 'Unorthodox Predictions: which type cannot be broken until your next turn?', ['sentry', 'code gate', 'barrier'].map(x => ({ id: x, label: x })), { always: true });
      X.card(iid).x.type = t; X.log({ t: 'note', side: 'corp', text: 'Unorthodox Predictions: ' + t + ' subroutines cannot be broken until the Corp’s next turn' });
    },
    on: { corpTurnBegin(X, iid) { X.card(iid).x.type = null; } },
    mod: { unbreakable: (X, iid, v, ctx) => v || (!!X.card(iid).x.type && X.typesOf(ctx.iid).indexOf(X.card(iid).x.type) >= 0) },
    bot: { unorthodox: (pub) => { const k = {}; for (const r of pub.runner.rig) { const b = D.CARDS[r.k].brk; if (b) k[b.type] = 1; } return ['sentry', 'code gate', 'barrier'].find(t => k[t]) || 'sentry'; } }
  });
  S('sundew', '04054', 'The first time each turn the Runner spends a click on an action, gain 2 credits — unless that action is a run on this server.');
  on('sundew', {
    on: {
      runnerAction(X, iid, ctx) {
        if (X.R.flags.sundew) return;
        X.R.flags.sundew = true;
        const sv = X.serverOf(iid);
        if (sv && ctx.id === 'run:' + sv.id) return;
        X.gain('corp', 2); X.log({ t: 'gain', side: 'corp', n: 2, k: 'sundew' });
      }
    }
  });
  S('city_surveillance', '04055', 'When the Runner’s turn begins, they take a tag unless they pay 1 credit.');
  on('city_surveillance', {
    on: {
      *runnerTurnBegin(X, iid) {
        if (X.avail('runner', 'any') >= 1 && (yield* X.yn(iid, 'runner', 'citySurv', 'City Surveillance: pay 1, or take a tag?', 'Pay 1', 'Take a tag'))) { X.pay('runner', 1, 'any'); return; }
        yield* X.giveTags(1, 'City Surveillance');
      }
    },
    bot: { citySurv: () => 'yes' }
  });
  S('snoop', '04056', 'When the Runner meets it, they show their grip. Spend a power counter on it: they show their grip and you trash a card from it.', { subs: [{ k: 'trace', n: 3, do: { k: 'power' }, text: 'a power counter on this ice' }] });
  const snoopTrash = function* (X, iid) {
    X.card(iid).power--;
    X.reveal('runner', X.R.grip.slice(), 'Snoop');
    const t = yield* X.ask(iid, 'corp', 'snoop', 'Snoop: trash which card from the Runner’s grip?', X.R.grip.map(i => X.cardOpt(i)));
    if (t) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'discardBy', k: X.card(t).k, by: 'snoop' }); }
  };
  on('snoop', {
    onEnc(X, iid) { X.reveal('runner', X.R.grip.slice(), 'Snoop'); return null; },
    abils: (X, iid) => [{ label: 'Snoop: spend a power counter — trash a card from the grip', bad: X.card(iid).power > 0 && X.R.grip.length ? null : 'No power counter, or the grip is empty' }],
    *use(X, iid) { yield* snoopTrash(X, iid); },
    winOpts: (X, iid) => X.card(iid).power > 0 && X.R.grip.length ? [{ label: 'Snoop: spend a power counter — trash a card from the grip' }] : [],
    *winUse(X, iid) { yield* snoopTrash(X, iid); },
    botAbil: () => 3
  });
  S('ireress', '04057', 'A “the Runner loses 1 credit” subroutine for each bad publicity you have.', { subs: [] });
  on('ireress', {
    self: { subs: (X, iid, v) => { const out = v.slice(); for (let n = 0; n < X.C.bp; n++) out.push({ k: 's', n: 0, text: 'The Runner loses 1 credit' }); return out; } },
    subs: [function (X) { if (X.R.credits > 0) { X.R.credits--; X.log({ t: 'lose', side: 'runner', n: 1 }); } return null; }]
  });
  S('power_shutdown', '04058', 'Only if the Runner ran on their last turn. Trash any number of cards from the top of R&D: the Runner trashes an installed program or hardware costing no more than that.');
  on('power_shutdown', {
    playBad: (X) => X.R.last.ran ? null : 'Only if the Runner ran on their last turn',
    *play(X, iid) {
      const opts = [];
      for (let n = 0; n <= Math.min(X.C.rd.length, 10); n++) opts.push({ id: String(n), label: n ? 'Trash ' + n : 'None' });
      const n = +(yield* X.ask(iid, 'corp', 'powerShut', 'Power Shutdown: trash how many cards from the top of R&D?', opts, { always: true }));
      for (let k = 0; k < n && X.C.rd.length; k++) X.toArchives(X.C.rd[0], false);
      if (n) X.log({ t: 'mill', k: 'power_shutdown', side: 'corp', n });
      const ts = X.R.rig.filter(i => ['program', 'hardware'].indexOf(X.dat(i).type) >= 0 && (X.dat(i).cost || 0) <= n);
      const t = yield* X.ask(iid, 'runner', 'powerShutR', 'Power Shutdown: trash an installed program or hardware costing ' + n + ' or less', ts.map(i => X.cardOpt(i, null, X.dat(i).cost + ' to install')));
      if (t) X.trashRunner(t, 'Power Shutdown');
    },
    bot: { powerShut: (pub) => String(Math.min(3, pub.corp.rdN - 10 > 0 ? 3 : 0)) },
    botPlay: () => 0.5
  });
  S('paper_wall', '04059', 'When the Runner breaks every subroutine on it, it is trashed.', { subs: [{ k: 'etr' }] });
  on('paper_wall', { on: { fullyBroken(X, iid, ctx) { if (ctx.iid === iid && X.isInstalled(iid)) { X.toArchives(iid, true); X.log({ t: 'empty', k: 'paper_wall' }); } } } });
  S('interns', '04060', 'Double. Install a card that is not an operation from Archives or HQ, free.');
  on('interns', {
    playBad: (X) => X.C.hq.concat(X.C.arch).some(i => i !== undefined && X.dat(i).type !== 'operation') ? null : 'Nothing to install',
    *play(X, iid) {
      const pool = X.C.hq.concat(X.C.arch).filter(i => X.dat(i).type !== 'operation');
      const t = yield* X.ask(iid, 'corp', 'interns', 'Interns: install which card, free?', pool.map(i => X.cardOpt(i, null, X.C.hq.indexOf(i) >= 0 ? 'from HQ' : 'from Archives')));
      if (t) yield* X.corpInstall(t, { free: true });
    },
    bot: { interns: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice' && (D.CARDS[o.card].cost || 0) >= 4) || pr.options[0]).id },
    botPlay: () => 1.6
  });

  /* ================================================================ TRUE COLORS */
  S('keyhole', '04061', 'A click: run R&D. If successful, instead of accessing look at the top 3 cards, trash one, and the Corp shuffles R&D.');
  on('keyhole', {
    abils: (X) => [{ label: 'Keyhole: run R&D', clicks: 1, bad: X.runBad('rd', 0) }],
    *use(X, iid) { yield* X.run('rd', { card: iid, via: 'keyhole' }); },
    *success(X, iid) {
      const top = X.C.rd.slice(0, 3);
      if (!top.length) return null;
      X.g.revealN++;
      const t = yield* X.ask(iid, 'runner', 'keyhole', 'Keyhole: trash which of the top ' + X.plural(top.length, 'card') + ' of R&D?', top.map(i => X.cardOpt(i)), { pub: 'The Runner looks into R&D' });
      if (t) { X.toArchives(t, true); X.log({ t: 'trash', side: 'corp', k: X.card(t).k, price: 0, by: 'keyhole' }); }
      X.shuffleRD();
      return 'replace';
    },
    bot: { keyhole: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id },
    botAbil: () => 2.2,
    botPlay: () => 2
  });
  S('activist_support', '04062', 'When the Corp’s turn begins, take a tag if you have none. When yours begins, the Corp takes 1 bad publicity if it has none.');
  on('activist_support', {
    on: {
      *corpTurnBegin(X) { if (!X.R.tags) yield* X.giveTags(1, 'Activist Support'); },
      *runnerTurnBegin(X) { if (!X.C.bp) yield* X.takeBP(1, 'Activist Support'); }
    },
    botPlay: () => 0.3
  });
  S('lawyer_up', '04063', 'Double. Remove up to 2 tags and draw 3 cards.');
  on('lawyer_up', { play(X) { const n = Math.min(2, X.R.tags); X.R.tags -= n; if (n) X.log({ t: 'untag', n, k: 'lawyer_up' }); X.drawRunner(3, 'lawyer_up'); }, botPlay: (pub) => pub.runner.tags ? 3 : 1.4 });
  S('leverage', '04064', 'Only after a successful run on HQ this turn. The Corp may take 2 bad publicity; if not, all damage to you is prevented until your next turn.');
  on('leverage', {
    playBad: (X) => X.R.flags.hqSuccess ? null : 'Only after a successful run on HQ this turn',
    *play(X, iid) {
      if (yield* X.yn(iid, 'corp', 'leverage', 'Leverage: take 2 bad publicity — or the Runner is safe from damage until their next turn?', 'Take 2 bad publicity', 'Let them be safe')) { yield* X.takeBP(2, 'Leverage'); return; }
      X.R.noDamageUntil = X.g.turnN + 2;
      X.log({ t: 'note', side: 'runner', text: 'Leverage: all damage to the Runner is prevented until their next turn' });
    },
    bot: { leverage: () => 'no' },
    botPlay: () => 0.3
  });
  S('garrote', '04065', '1 credit: break one sentry subroutine. 1 credit: +1 strength.', { brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } });
  S('llds', '04066', 'Whenever you install an icebreaker it has +1 strength until the end of the turn.');
  on('llds', {
    on: { install(X, iid, ctx) { if (ctx.side === 'runner' && X.dat(ctx.iid).brk) { const x = X.card(ctx.iid).x; x.lldsT = X.g.turnN; x.lldsN = (x.lldsT === X.g.turnN ? x.lldsN || 0 : 0) + 1; } } },
    mod: { breakerStr: (X, iid, v, ctx) => { const x = X.card(ctx.iid).x; return x.lldsT === X.g.turnN ? v + (x.lldsN || 0) : v; } },
    botPlay: () => 0.6
  });
  S('sharpshooter', '04067', 'Trash it: break any number of subroutines on a destroyer ice. 1 credit: +2 strength.', { brk: { type: 'any', cost: 0, n: 99 }, pump: { cost: 1, by: 2 } });
  on('sharpshooter', { canBreak: (X, iid, E) => kw(X, E.iid, /Destroyer/), onBreak(X, iid) { if (X.isInstalled(iid)) X.trashRunner(iid, 'used'); } });
  S('capstone', '04068', 'A click: trash any number of cards from your grip; draw a card for each that has a copy installed.');
  on('capstone', {
    abils: (X) => [{ label: 'Capstone: trash cards from your grip', clicks: 1, bad: X.R.grip.length ? null : 'Your grip is empty' }],
    *use(X, iid) {
      const ts = yield* X.ask(iid, 'runner', 'capstone', 'Capstone: trash which cards from your grip? (a card for each with a copy installed)', X.R.grip.map(i => X.cardOpt(i, null, X.R.rig.some(r => X.card(r).k === X.card(i).k) ? 'a copy is installed' : null)), { multi: true, min: 0, max: X.R.grip.length });
      let n = 0;
      for (const t of ts) { if (X.R.rig.some(r => X.card(r).k === X.card(t).k)) n++; X.lift(t); X.card(t).up = true; X.R.heap.push(t); }
      if (ts.length) X.log({ t: 'discard', side: 'runner', n: ts.length, ks: ts.map(t => X.card(t).k) });
      X.drawRunner(n, 'capstone');
    },
    bot: { capstone: (pub, me, pr) => pr.options.filter(o => /installed/.test(o.sub || '')).map(o => o.id) },
    botAbil: (pub, me) => (me.hand || []).filter(h => pub.runner.rig.some(r => r.k === h.k)).length >= 2 ? 2 : -1
  });
  S('starlight', '04069', 'When your turn begins, lose a click. The extra click of double events is not paid.');
  on('starlight', { on: { runnerTurnBegin(X) { X.R.clicks = Math.max(0, X.R.clicks - 1); X.log({ t: 'loseClick', k: 'starlight' }); } }, mod: { noDouble: (X, iid, v, ctx) => v || X.card(ctx.iid).side === 'runner' }, botPlay: () => 0.2 });
  S('rex_campaign', '04070', 'When rezzed, 3 power counters on it; one comes off as your turn begins. When the last goes, trash it and remove 1 bad publicity or gain 5 credits.', { scriptCounters: 3 });
  on('rex_campaign', {
    on: {
      *corpTurnBegin(X, iid) {
        const c = X.card(iid);
        c.power = Math.max(0, c.power - 1);
        if (c.power > 0) return;
        X.toArchives(iid, true);
        const a = X.C.bp ? yield* X.ask(iid, 'corp', 'rex', 'Rex Campaign: remove 1 bad publicity, or gain 5?', [{ id: 'bp', label: 'Remove 1 bad publicity' }, { id: 'cr', label: 'Gain 5 credits' }], { always: true }) : 'cr';
        if (a === 'bp') X.loseBP(1, 'Rex Campaign'); else { X.gain('corp', 5); X.log({ t: 'gain', side: 'corp', n: 5, k: 'rex_campaign' }); }
      }
    },
    bot: { rex: (pub) => pub.corp.bp >= 2 ? 'bp' : 'cr' }
  });
  S('fenris', '04071', 'Rezzing it gives you 1 bad publicity.', { subs: [{ k: 'brain', n: 1 }, { k: 'etr' }] });
  on('fenris', { *onRez(X) { yield* X.takeBP(1, 'Fenris'); } });
  S('panic_button', '04072', 'Only in the root of HQ. 1 credit: draw a card — only during a run on HQ.', { hqOnly: true });
  on('panic_button', {
    winOpts: (X) => X.g.run && X.g.run.sid === 'hq' && X.C.credits >= 1 && X.C.rd.length ? [{ label: 'Panic Button: pay 1, draw a card' }] : [],
    winUse(X) { X.pay('corp', 1, 'any'); X.drawCorp(1, 'panic_button'); },
    botWin: (pub, me) => pub.corp.credits >= 4 && (me.hand || []).length < 6
  });
  S('shock', '04073', 'Ambush. When accessed, anywhere: 1 net damage.');
  on('shock', { *onAccess(X, iid, ctx) { if (ctx.from === 'arch') return; X.log({ t: 'ambush', k: 'shock' }); ctx.seen.did = 'sprung'; yield* X.damage('net', 1, 'Shock!'); } });
  S('tsurugi', '04074', '', { subs: [{ k: 's', n: 0, text: 'End the run unless the Corp pays 1' }, { k: 'net', n: 1 }, { k: 'net', n: 1 }, { k: 'net', n: 1 }] });
  on('tsurugi', {
    subs: [function* (X, iid) { if (X.C.credits >= 1 && (yield* X.yn(iid, 'corp', 'tsurugi', 'Tsurugi: pay 1 to end the run?', 'Pay 1: end the run', 'Let it go on'))) { X.pay('corp', 1, 'any'); return 'end'; } return null; }],
    bot: { tsurugi: () => 'yes' }
  });
  S('tgtbt', '04075', 'Ambush. When accessed, the Runner takes a tag.');
  on('tgtbt', { *onAccess(X, iid, ctx) { if (ctx.from === 'arch') return; X.log({ t: 'ambush', k: 'tgtbt' }); yield* X.giveTags(1, 'TGTBT'); } });
  S('sweeps_week', '04076', 'Gain 1 credit for each card in the Runner’s grip.');
  on('sweeps_week', { play(X) { const n = X.R.grip.length; X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'sweeps_week' }); }, botPlay: (pub) => pub.runner.gripN >= 4 ? 3.5 : 0.5 });
  S('rsvp', '04077', '', { subs: [{ k: 's', n: 0, text: 'The Runner cannot spend credits for the rest of the run' }] });
  on('rsvp', { subs: [function (X) { X.g.run.noCredits = true; X.log({ t: 'note', side: 'corp', text: 'RSVP: the Runner cannot spend credits this run' }); return null; }] });
  S('curtain_wall', '04078', '+4 strength while it is the outermost ice of its server.', { subs: [{ k: 'etr' }, { k: 'etr' }, { k: 'etr' }] });
  on('curtain_wall', { self: { iceStr: (X, iid, v) => { const sv = X.serverOf(iid); return sv && sv.ice[sv.ice.length - 1] === iid ? v + 4 : v; } } });
  S('punitive', '04079', 'Trace 5: meat damage equal to the printed agenda points the Runner stole on their last turn.');
  on('punitive', {
    *play(X) { const r = yield* X.trace(5, 'Punitive Counterstrike'); if (r.ok && X.R.last.stolePts) yield* X.damage('meat', X.R.last.stolePts, 'Punitive Counterstrike'); },
    playBad: (X) => X.R.last.stolePts ? null : 'The Runner stole nothing on their last turn',
    botPlay: () => 4
  });
  S('veterans', '04080', 'When scored, you may remove up to 2 bad publicity.');
  on('veterans', { *onScore(X, iid) { yield* removeBP(X, iid, 2)(); } });
  S('quest_completed', '04081', 'Only after successful runs on R&D, HQ and Archives this turn. Access one installed card that is not ice.');
  on('quest_completed', {
    playBad: (X) => { const f = X.R.flags.succ || {}; return f.hq && f.rd && f.arch ? (X.installedCorp().some(i => X.dat(i).type !== 'ice') ? null : 'Nothing to access') : 'Only after successful runs on HQ, R&D and Archives this turn'; },
    *play(X, iid) {
      const ts = X.installedCorp().filter(i => X.dat(i).type !== 'ice');
      const t = yield* X.ask(iid, 'runner', 'questDone', 'Quest Completed: access which card?', ts.map(i => ({ id: i, label: (X.card(i).rez ? X.nameOf(i) : 'A face-down card') + ' · ' + X.srvName(X.serverOf(i)), sub: X.card(i).adv ? X.card(i).adv + ' advanced' : null })));
      if (t) yield* X.accessOutside([{ iid: t, from: X.serverOf(t).id }], X.serverOf(t).id);
    },
    bot: { questDone: (pub, me, pr) => (pr.options.slice().sort((a, b) => (+((b.sub || '').match(/\d+/) || [0])[0]) - (+((a.sub || '').match(/\d+/) || [0])[0]))[0] || {}).id },
    botPlay: () => 6
  });
  S('hemorrhage', '04082', 'A virus counter for each successful run. A click and 2 counters: the Corp trashes a card from HQ.', { virus: true });
  on('hemorrhage', {
    on: { success(X, iid) { X.addVirus(iid, 1); } },
    abils: (X, iid) => [{ label: 'Hemorrhage: the Corp trashes a card from HQ', clicks: 1, bad: X.card(iid).virus >= 2 ? (X.C.hq.length ? null : 'HQ is empty') : 'Needs 2 virus counters' }],
    *use(X, iid) {
      X.card(iid).virus -= 2;
      const t = yield* X.ask(iid, 'corp', 'hemorrhage', 'Hemorrhage: trash which card from HQ?', X.C.hq.map(i => X.cardOpt(i)), { pub: 'The Corp discards from HQ' });
      if (t) { X.toArchives(t, false); X.log({ t: 'discard', side: 'corp', n: 1 }); }
    },
    botAbil: () => 1.6,
    botPlay: () => 1.8
  });
  S('tallie', '04083', 'Whenever a gray ops or black ops operation is played, you may give the Corp 1 bad publicity and take a tag. Trash her: draw a card for each bad publicity the Corp has.');
  on('tallie', {
    on: {
      *opDone(X, iid, ctx) {
        if (!kw(X, ctx.iid, /Gray Ops|Black Ops/)) return;
        if (yield* X.yn(iid, 'runner', 'tallie', 'Tallie Perrault: give the Corp 1 bad publicity and take a tag?', 'Do it', 'No')) { yield* X.takeBP(1, 'Tallie Perrault'); yield* X.giveTags(1, 'Tallie Perrault'); }
      }
    },
    abils: (X) => [{ label: 'Tallie Perrault: trash her — draw ' + X.C.bp }],
    use(X, iid) { const n = X.C.bp; X.trashRunner(iid, 'used'); X.drawRunner(n, 'tallie'); },
    bot: { tallie: (pub) => pub.runner.tags ? 'no' : 'yes' },
    botAbil: (pub) => pub.corp.bp >= 3 ? 2 : -1
  });
  S('exec_wiretaps', '04084', 'Double. Show every card in HQ.');
  on('exec_wiretaps', { play(X) { X.reveal('corp', X.C.hq.slice(), 'Executive Wiretaps'); }, botPlay: () => 0.2 });
  S('blackguard', '04085', '+2 memory. Whenever you expose a card, the Corp must rez it, paying for it, if it can. One console only.', { console: true, memory: 2 });
  on('blackguard', {
    on: {
      *expose(X, iid, ctx) {
        const t = ctx.iid;
        if (!X.isInstalled(t) || X.card(t).rez || X.dat(t).type === 'agenda') return;
        if (X.avail('corp', X.dat(t).type === 'ice' ? 'rezIce' : 'any') < X.rezCost(t) || X.dat(t).rezForfeit) return;
        X.log({ t: 'note', side: 'runner', text: 'Blackguard: the Corp must rez ' + X.nameOf(t) });
        yield* X.rezFlow(t, false);
      }
    },
    botPlay: () => 1
  });
  S('cybersolutions', '04086', '+2 memory.', { memory: 2 });
  S('alpha', '04087', '1 credit: break one subroutine. 1 credit: +1 strength. Only on the outermost ice of a server.', { brk: { type: 'any', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } });
  on('alpha', { canBreak: (X, iid, E) => { const sv = X.serverOf(E.iid); return !!sv && sv.ice[sv.ice.length - 1] === E.iid; } });
  S('omega', '04088', '1 credit: break one subroutine. 1 credit: +1 strength. Only on the innermost ice of a server.', { brk: { type: 'any', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } });
  on('omega', { canBreak: (X, iid, E) => { const sv = X.serverOf(E.iid); return !!sv && sv.ice[0] === E.iid; } });
  S('blackmail', '04089', 'Only if the Corp has bad publicity. Run any server: no ice can be rezzed this run.');
  on('blackmail', Object.assign(anyRun('Blackmail'), {
    playBad: (X) => X.C.bp ? (X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null) : 'Only if the Corp has bad publicity',
    runMod: { noRezIce: () => true },
    botPlay: () => 3
  }));

  /* ================================================================ DOUBLE TIME */
  S('blue_level', '04090', 'Double. Gain 5 credits and draw 2.');
  on('blue_level', { play(X) { X.gain('corp', 5); X.drawCorp(2, 'blue_level'); }, botPlay: (pub) => pub.corp.credits < 10 ? 4 : 1.5 });
  S('strongbox', '04091', 'Stealing an agenda from this server costs the Runner a click more.');
  on('strongbox', { mod: { stealClicks: (X, iid, v, ctx) => X.serverOf(iid) && ctx.sid === X.serverOf(iid).id ? v + 1 : v } });
  S('toshiyuki', '04092', 'Can be advanced. Accessed while installed: you may swap him for an agenda or asset from HQ, installed face down with his advancement tokens; the Runner may decline to access it.', { advable: true });
  on('toshiyuki', {
    *onAccess(X, iid, ctx) {
      if (!ctx.installed) return;
      /* Not for another Toshiyuki: two of them would swap for each other forever. */
      const pool = X.C.hq.filter(i => ['agenda', 'asset'].indexOf(X.dat(i).type) >= 0 && X.card(i).k !== 'toshiyuki');
      if (!pool.length) return;
      const t = yield* X.ask(iid, 'corp', 'toshiyuki', 'Toshiyuki Sakai: swap him for which card from HQ?', pool.map(i => X.cardOpt(i)), { skip: 'Leave him', pub: 'Toshiyuki Sakai — the Corp decides' });
      if (!t) return;
      const sv = X.serverOf(iid), pos = sv.root.indexOf(iid), adv = X.card(iid).adv;
      X.lift(t); sv.root.splice(pos, 0, t); X.card(t).rez = false; X.card(t).adv = adv;
      X.toHQ(iid);
      X.log({ t: 'swapRoot', sid: sv.id });
      ctx.seen.gone = true; ctx.seen.did = 'swapped';
      if (yield* X.yn(iid, 'runner', 'toshiAccess', 'Toshiyuki Sakai was swapped for a face-down card. Access it?', 'Access it', 'Leave it')) yield* X.accessOne(t, ctx.from, ctx.sid);
    },
    bot: { toshiyuki: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'asset') || {}).id || 'skip', toshiAccess: () => 'yes' }
  });
  S('yagura', '04093', '', { subs: [{ k: 's', n: 0, text: 'The Corp looks at the top card of R&D and may put it at the bottom' }, { k: 'net', n: 1 }] });
  on('yagura', {
    subs: [function* (X, iid) {
      const t = X.C.rd[0];
      if (!t) return null;
      if (yield* X.yn(iid, 'corp', 'yagura', 'Yagura: the top of R&D is ' + X.nameOf(t) + '. Put it at the bottom?', 'To the bottom', 'Leave it')) { X.C.rd.push(X.C.rd.shift()); X.log({ t: 'note', side: 'corp', text: 'Yagura: the Corp moves a card in R&D', quiet: true }); }
      return null;
    }],
    bot: { yagura: () => 'no' }
  });
  S('restoring_face', '04094', 'Show and trash one of your installed sysops, executives or clones: remove up to 2 bad publicity.');
  on('restoring_face', {
    playBad: (X) => X.installedCorp().some(i => kw(X, i, /Sysop|Executive|Clone/)) ? null : 'No sysop, executive or clone installed',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'restoring', 'Restoring Face: trash which?', X.installedCorp().filter(i => kw(X, i, /Sysop|Executive|Clone/)).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (!t) return;
      X.reveal('corp', [t], 'Restoring Face'); X.toArchives(t, true);
      X.loseBP(2, 'Restoring Face');
    },
    botPlay: (pub) => pub.corp.bp >= 2 ? 2 : -1
  });
  S('market_research', '04095', 'If the Runner is tagged when you score it, it gets an agenda counter: worth 1 more point while it has it.');
  on('market_research', { onScore(X, iid) { if (X.R.tags) { X.card(iid).agenda = 1; X.log({ t: 'counters', k: 'market_research', n: 1 }); } }, self: { agendaPts: (X, iid, v, ctx) => ctx.side === 'corp' && X.card(iid).agenda ? v + 1 : v } });
  S('wraparound', '04096', '+7 strength while no fracter is installed.', { subs: [{ k: 'etr' }] });
  on('wraparound', { self: { iceStr: (X, iid, v) => X.programs().some(i => kw(X, i, /Fracter/)) ? v : v + 7 } });
  S('grndl', '04097', 'You start with 10 credits and 1 bad publicity.', { startCredits: 10, startBP: 1 });
  S('vulcan_coverup', '04098', 'When scored, do 2 meat damage. When stolen, you take 1 bad publicity.');
  on('vulcan_coverup', { *onScore(X) { yield* X.damage('meat', 2, 'Vulcan Coverup'); }, *onSteal(X) { yield* X.takeBP(1, 'Vulcan Coverup'); } });
  S('grndl_refinery', '04099', 'Can be advanced. A click, trash it: gain 4 credits per advancement token.', { advable: true });
  on('grndl_refinery', {
    abils: (X, iid) => [{ label: 'GRNDL Refinery: trash it — gain ' + 4 * X.card(iid).adv, clicks: 1 }],
    use(X, iid) { const n = 4 * X.card(iid).adv; X.toArchives(iid, true); X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'grndl_refinery' }); },
    botAbil: (pub, me, o) => +((o.label.match(/gain (\d+)/) || [])[1] || 0) >= 12 ? 4 : -1
  });
  S('subliminal', '04100', 'Gain 1 credit; the first one you play each turn also gives a click. When your turn begins, if it is in Archives and the Runner made no run on their last turn, you may take it back into HQ.');
  on('subliminal', {
    play(X) {
      X.gain('corp', 1);
      if (!X.C.flags.subliminal) { X.C.flags.subliminal = true; X.C.clicks++; X.log({ t: 'clicks', side: 'corp', n: 1, k: 'subliminal' }); }
    },
    arch: {
      *corpTurnBegin(X, iid) {
        if (X.R.last.ran || !X.card(iid).up) return;
        if (yield* X.yn(iid, 'corp', 'sublim', 'Subliminal Messaging: take it back into HQ from Archives?', 'Take it', 'Leave it')) { X.reveal('corp', [iid], 'Subliminal Messaging'); X.lift(iid); X.card(iid).up = false; X.C.hq.push(iid); }
      }
    },
    bot: { sublim: () => 'yes' },
    botPlay: () => 2.4
  });
  S('singularity', '04101', 'Double. Run a remote server. If successful, instead of accessing, trash every card in its root.');
  on('singularity', {
    playBad: (X) => X.remotes().some(sv => !X.runBad(sv.id, 1)) ? null : 'No remote server to run',
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Singularity: run which remote?', X.remotes().map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })));
      if (sid) yield* X.run(sid, { card: iid, via: 'singularity' });
    },
    success(X, iid, ctx) {
      const sv = X.server(ctx.S.sid);
      if (!sv) return null;
      for (const i of sv.root.slice()) { X.log({ t: 'trash', side: 'corp', k: X.card(i).k, price: 0, by: 'singularity' }); X.toArchives(i, true); }
      return 'replace';
    },
    botPlay: () => 1.5
  });
  S('queens_gambit', '04102', 'Double. Put up to 3 advancement tokens on an unrezzed card in a remote server’s root: gain 2 credits each. You cannot access that card this turn.');
  on('queens_gambit', {
    playBad: (X) => X.remotes().some(sv => sv.root.some(i => !X.card(i).rez)) ? null : 'No unrezzed card in a remote',
    *play(X, iid) {
      const ts = [].concat(...X.remotes().map(sv => sv.root.filter(i => !X.card(i).rez)));
      const t = yield* X.ask(iid, 'runner', 'qgCard', 'Queen’s Gambit: which card?', ts.map(i => ({ id: i, label: 'A face-down card · ' + X.srvName(X.serverOf(i)), sub: X.card(i).adv ? X.card(i).adv + ' advanced' : null })));
      if (!t) return;
      const n = +(yield* X.ask(iid, 'runner', 'qgN', 'Queen’s Gambit: how many tokens (2 credits each)?', [1, 2, 3].map(n => ({ id: String(n), label: n + ' — gain ' + 2 * n })), { always: true }));
      X.card(t).adv += n; X.card(t).x.noAccess = X.g.turnN;
      X.gain('runner', 2 * n);
      X.log({ t: 'adv', iid: t, sid: X.serverOf(t).id, n: X.card(t).adv, k: null, by: 'queens_gambit', x: n });
    },
    bot: { qgN: () => '1' },
    botPlay: () => 0.3
  });
  S('dyson_fractal', '04103', '1 recurring credit for using fracters.', { recur: { n: 1, for: 'fracter' } });
  S('silencer', '04104', '1 recurring credit for using killers.', { recur: { n: 1, for: 'killer' } });
  S('savoir_faire', '04105', 'Once a turn, 2 credits: install a program from your grip (paying for it).');
  on('savoir_faire', {
    abils: (X) => [{ label: 'Savoir-faire: install a program from your grip', cost: 2, once: 'sf', bad: X.R.grip.some(i => X.dat(i).type === 'program') ? null : 'No program in your grip' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'savoir', 'Savoir-faire: install which program?', X.R.grip.filter(i => X.dat(i).type === 'program').map(i => X.cardOpt(i, null, X.installCost(i, 0) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null))));
      if (t) yield* X.runnerInstall(t, {});
    },
    botAbil: (pub, me) => pub.runner.clicks === 0 && pub.runner.credits >= 6 && (me.hand || []).some(h => D.CARDS[h.k].brk) ? 2 : -1
  });
  S('fall_guy', '04106', 'Trash it: stop another installed resource being trashed. Trash it: gain 2 credits.');
  on('fall_guy', {
    *preventTrash(X, iid, ctx) {
      if (X.dat(ctx.iid).type !== 'resource') return false;
      if (!(yield* X.yn(iid, 'runner', 'fallGuy', 'Fall Guy: trash it to save ' + X.nameOf(ctx.iid) + '?', 'Trash Fall Guy', 'Let it go'))) return false;
      X.trashRunner(iid, 'prevent');
      return true;
    },
    abils: () => [{ label: 'Fall Guy: trash it — gain 2' }],
    use(X, iid) { X.trashRunner(iid, 'used'); X.gain('runner', 2); X.log({ t: 'gain', side: 'runner', n: 2, k: 'fall_guy' }); },
    bot: { fallGuy: () => 'yes' },
    botAbil: (pub) => pub.runner.credits <= 1 ? 1 : -1
  });
  S('power_nap', '04107', 'Double. Gain 2 credits, and 1 more for each double event in your heap.');
  on('power_nap', { play(X, iid) { const n = 2 + X.R.heap.filter(i => i !== iid && X.dat(i).type === 'event' && kw(X, i, /Double/)).length; X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'power_nap' }); }, botPlay: () => 2 });
  S('paintbrush', '04108', 'A click: a rezzed ice becomes a sentry, code gate or barrier too, until the end of your next run this turn.');
  on('paintbrush', {
    abils: (X) => [{ label: 'Paintbrush: give an ice another type', clicks: 1, bad: X.installedCorp().some(i => X.dat(i).type === 'ice' && X.card(i).rez) ? null : 'No rezzed ice' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'paintIce', 'Paintbrush: which ice?', X.installedCorp().filter(i => X.dat(i).type === 'ice' && X.card(i).rez).map(i => ({ id: i, label: icePlace(X, i) })));
      if (!t) return;
      const ty = yield* X.ask(iid, 'runner', 'paintType', 'Paintbrush: it becomes also a…', ['sentry', 'code gate', 'barrier'].map(x => ({ id: x, label: x })), { always: true });
      X.card(t).x.paint = { type: ty, turn: X.g.turnN, runs: X.g.runN };
      X.log({ t: 'note', side: 'runner', text: 'Paintbrush: ' + X.nameOf(t) + ' is also a ' + ty + ' until the end of the next run' });
    },
    mod: { iceTypes: (X, iid, v, ctx) => { const p = X.card(ctx.iid).x.paint; return p && p.turn === X.g.turnN && X.g.runN <= p.runs + 1 && (!X.g.run || X.g.run.n === p.runs + 1) && v.indexOf(p.type) < 0 ? v.concat(p.type) : v; } },
    botAbil: () => -1
  });
  S('lucky_find', '04109', 'Double. Gain 9 credits.');
  on('lucky_find', { play(X) { X.gain('runner', 9); }, botPlay: () => 4.5 });
  S('gyri', '04110', '', { subs: [{ k: 's', n: 0, text: 'The Runner’s maximum hand size is 2 lower until the Corp’s next turn' }] });
  on('gyri', { subs: [function (X) { const h = X.R.handCut && X.R.handCut.until > X.g.turnN ? X.R.handCut.n : 0; X.R.handCut = { n: h + 2, until: X.g.turnN + 1 }; X.log({ t: 'note', side: 'corp', text: 'Gyri Labyrinth: the Runner’s hand size is ' + (h + 2) + ' lower until the Corp’s next turn' }); return null; }] });
  S('reclamation_order', '04111', 'Double. Name a card (not this one): every copy of it in Archives comes back into HQ, shown.');
  on('reclamation_order', {
    playBad: (X) => X.C.arch.some(i => X.card(i).k !== 'reclamation_order') ? null : 'Archives holds nothing to reclaim',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'reclaim', 'Reclamation Order: take back every copy of which card?', X.dedupe(X.C.arch.filter(i => X.card(i).k !== 'reclamation_order').map(i => X.cardOpt(i))));
      if (!t) return;
      const k = X.card(t).k, all = X.C.arch.filter(i => X.card(i).k === k);
      X.reveal('corp', all, 'Reclamation Order');
      for (const i of all) { X.lift(i); X.card(i).up = false; X.C.hq.push(i); }
    },
    botPlay: () => 1
  });
  S('broadcast_square', '04112', 'Whenever you would take bad publicity: trace 3 — if it succeeds, you take none.');
  on('broadcast_square', { *preventBP(X, iid, ctx) { if ((yield* X.trace(3, 'Broadcast Square')).ok) ctx.prevent = ctx.n; } });
  S('corporate_shuffle', '04113', 'Double. Shuffle HQ into R&D and draw 5.');
  on('corporate_shuffle', { play(X) { X.C.rd.push(...X.C.hq.splice(0)); X.shuffleRD(); X.log({ t: 'shuffleHQ' }); X.drawCorp(5, 'corporate_shuffle'); }, botPlay: () => -1 });
  S('caprice', '04114', 'When the Runner passes all the ice of this server, a psi game: if the bids differ, the run ends.');
  on('caprice', {
    on: {
      *approachServer(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || sv.id !== ctx.sid) return;
        if (yield* X.psi('Caprice Nisei')) { ctx.S.endNow = true; ctx.S.endBy = 'Caprice Nisei'; }
      }
    }
  });
  S('shinobi', '04115', 'Rezzing it gives you 1 bad publicity.', { subs: [{ k: 'trace', n: 1, do: { k: 'net', n: 1 }, text: '1 net damage' }, { k: 'trace', n: 2, do: { k: 'net', n: 2 }, text: '2 net damage' }, { k: 'trace', n: 3, do: [{ k: 'net', n: 3 }, { k: 'etr' }], text: '3 net damage and end the run' }] });
  on('shinobi', { *onRez(X) { yield* X.takeBP(1, 'Shinobi'); } });
  S('marker', '04116', '', { subs: [{ k: 's', n: 0, text: 'The next ice the Runner meets this run gains “End the run”' }] });
  on('marker', {
    subs: [function (X, iid) { X.g.run.markNext = iid; return null; }],
    on: { encounter(X, iid, ctx) { if (ctx.S.markNext && ctx.iid !== ctx.S.markNext) { ctx.S.markNext = null; ctx.S.marked = ctx.iid; ctx.E.subs.push({ k: 'etr' }); ctx.E.broken.push(false); } } },
    mod: { subs: (X, iid, v, ctx) => X.g.run && X.g.run.marked === ctx.iid && !(X.g.run.enc && X.g.run.enc.iid === ctx.iid) ? v.concat({ k: 'etr' }) : v }
  });
  S('hive', '04117', 'Loses one “End the run” for each agenda point you have.', { subs: [{ k: 'etr' }, { k: 'etr' }, { k: 'etr' }, { k: 'etr' }, { k: 'etr' }] });
  on('hive', { self: { subs: (X, iid, v) => v.slice(Math.min(5, X.points('corp'))) } });
  S('witness_tampering', '04118', 'Double. Remove up to 2 bad publicity.');
  on('witness_tampering', { play(X) { X.loseBP(2, 'Witness Tampering'); }, playBad: (X) => X.C.bp ? null : 'You have no bad publicity', botPlay: () => 1.5 });
  S('napd', '04119', 'Needs one more advancement for each bad publicity you have. Stealing it costs the Runner 4 more.');
  on('napd', { self: { advNeed: (X, iid, v) => v + X.C.bp, stealCost: (X, iid, v) => v + 4 } });
  S('quandary', '04120', '', { subs: [{ k: 'etr' }] });

  D.SET_LOADED.spin = true;
})(typeof window !== 'undefined' ? window : this);
