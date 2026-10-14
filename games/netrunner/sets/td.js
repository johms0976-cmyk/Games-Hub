'use strict';
/* Terminal Directive (2017 campaign box: 57 cards for open play — two Runner
 * and two Corp identities, one copy each). The 28 campaign cards are in
 * sets/tdc.js and only come into a game through the campaign.
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. Readings decided here:
 *   - Ayla “Bios” Rahim chooses which 2 of the 6 set-aside cards go back.
 *   - Maxwell James may be used in a turn after a successful run on HQ.
 *   - Dhegdheer: a click installs a program onto it for 1 less.
 *   - Skorpios Defense Systems hears cards trashed from play, from the grip
 *     and lost to damage; the Corp chooses one to remove after the action.
 *   - Marilyn Campaign: when it would be trashed (by the Runner, or emptied),
 *     the Corp may shuffle it into R&D instead.
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
  const gainC = (X, n, k) => { if (n > 0) { X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k }); } };
  const gainR = (X, n, k) => { if (n > 0) { X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k }); } };
  const iceAll = X => X.corpPlaced().filter(i => X.dat(i).type === 'ice');
  const freeMu = X => Math.max(0, X.muTotal() - X.muUsed());
  const mill = (X, n) => { for (let k = 0; k < n && X.R.stack.length; k++) { const t = X.R.stack.shift(); X.card(t).up = true; X.R.heap.push(t); } };
  const advBig = (X, iid) => X.advOf(iid) >= 3;
  function* arrange(X, iid, side, what, list, why) {
    let left = list.slice();
    const order = [];
    while (left.length > 1) {
      const t = yield* X.ask(iid, side, what, why + ' — which goes ' + (order.length ? 'next' : 'on top') + '?', left.map(i => X.cardOpt(i)), { always: true });
      order.push(t); left = left.filter(i => i !== t);
    }
    return order.concat(left);
  }
  /* A Cambridge-style breaker: trash it to slip past the ice it can break. */
  const bypassBy = type => ({
    encOpts: (X, iid, E) => X.typesOf(E.iid).indexOf(type) >= 0 && !X.g.run.noPrograms ? [{ kind: 'lower', label: X.nameOf(iid) + ': trash it — slip past ' + X.nameOf(E.iid), cost: 0 }] : [],
    encUse(X, iid, n, E) { X.trashRunner(iid, 'used'); X.log({ t: 'bypass', iid: E.iid, k: X.card(E.iid).k, by: X.card(iid).k }); return 'pass'; }
  });

  /* ================================================================ RUNNER */
  S('steve_cambridge', '13001', 'The first time each turn you make a successful run on HQ, you may choose 2 cards in your heap: the Corp removes one from the game, you take the other.');
  on('steve_cambridge', {
    on: {
      *success(X, iid, ctx) {
        if (ctx.sid !== 'hq' || X.card(iid).x.turn === X.g.turnN || X.R.heap.length < 2 || X.heapLocked()) return;
        X.card(iid).x.turn = X.g.turnN;
        const two = yield* X.ask(iid, 'runner', 'steve', 'Steve Cambridge: choose 2 cards in your heap?', X.R.heap.map(i => X.cardOpt(i)), { multi: true, min: 0, max: 2 });
        if (two.length < 2) return;
        const gone = yield* X.ask(iid, 'corp', 'steveCorp', 'Steve Cambridge: which of these leaves the game (the Runner takes the other)?', two.map(i => X.cardOpt(i)), { always: true });
        const keep = two.find(i => i !== gone);
        X.lift(gone); X.R.gone.push(gone); X.lift(keep); X.R.grip.push(keep);
        X.log({ t: 'note', side: 'runner', text: 'Steve Cambridge: ' + X.nameOf(keep) + ' back to the grip, ' + X.nameOf(gone) + ' leaves the game' });
      }
    },
    bot: { steve: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0)).slice(0, 2).map(o => o.id), steveCorp: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id }
  });
  S('brute_force_hack', '13002', 'Double. Pay X: derez an ice whose rez cost is X or less.', { cost: 0 });
  on('brute_force_hack', {
    playBad: (X) => iceAll(X).some(i => X.card(i).rez && X.rezCost(i) <= X.avail('runner', 'any')) ? null : 'No rezzed ice you can afford',
    *play(X, iid) {
      const pool = iceAll(X).filter(i => X.card(i).rez && X.rezCost(i) <= X.avail('runner', 'any'));
      const t = yield* X.ask(iid, 'runner', 'bruteForce', 'Brute-Force-Hack: derez which ice (you pay its rez cost)?', pool.map(i => X.cardOpt(i, null, 'pay ' + X.rezCost(i) + ' · ' + X.srvName(X.serverOf(i)))), { always: true });
      if (!t) return;
      X.pay('runner', X.rezCost(t), 'any'); X.derez(t, 'brute_force_hack');
    },
    bot: { bruteForce: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id },
    botPlay: () => 0.8
  });
  S('spear_phishing', '13003', 'Run any server: slip past its innermost ice when you meet it.');
  on('spear_phishing', {
    playBad: (X) => noRun(X) ? 'Nowhere to run' : null,
    *play(X, iid) { const sid = yield* X.ask(iid, 'runner', 'runOn', 'Spear Phishing: run which server?', runOpts(X), { pub: 'The Runner plays Spear Phishing' }); if (sid) yield* X.run(sid, { card: iid, via: 'spear_phishing' }); },
    runEnc(X, iid, ctx) { const sv = X.server(ctx.S.sid); if (sv && sv.ice[0] === ctx.iid) ctx.E.bypass = 'spear_phishing'; return null; },
    botPlay: () => 1
  });
  S('syn_attack', '13004', 'Double. The Corp discards 2 cards or draws 4.');
  on('syn_attack', {
    *play(X, iid) {
      const a = yield* X.ask(iid, 'corp', 'synAttack', 'SYN Attack: discard 2 cards, or draw 4?', [{ id: 'discard', label: 'Discard 2', bad: X.C.hq.length >= 2 ? null : 'Fewer than 2 cards in HQ' }, { id: 'draw', label: 'Draw 4' }], { always: true });
      if (a === 'draw') { X.drawCorp(4, 'syn_attack'); return; }
      const ts = yield* X.ask(iid, 'corp', 'synDiscard', 'SYN Attack: discard which 2?', X.C.hq.map(i => X.cardOpt(i)), { multi: true, min: 2, max: 2 });
      for (const t of ts) X.toArchives(t, false);
      X.log({ t: 'note', side: 'corp', text: 'SYN Attack: the Corp discards 2' });
    },
    bot: { synAttack: (pub) => pub.corp.hqN >= 5 ? 'discard' : 'draw' },
    botPlay: () => 0.6
  });
  S('polyhistor', '13005', '+1 memory, +1 link. The first time each turn you pass every ice protecting HQ, you may draw a card — and the Corp draws one. One console only.', { console: true, memory: 1, link: 1 });
  on('polyhistor', { on: { *approachServer(X, iid, ctx) { const hq = X.server('hq'); if (ctx.sid !== 'hq' || !hq.ice.length || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; if (yield* X.yn(iid, 'runner', 'polyhistor', 'Polyhistor: draw a card (the Corp draws one too)?', 'Draw', 'No')) { X.drawRunner(1, 'polyhistor'); X.drawCorp(1, 'polyhistor'); } } }, bot: { polyhistor: () => 'yes' }, botPlay: () => 0.8 });
  S('abagnale', '13006', '1 credit: break one code gate subroutine. 2 credits: +2 strength. Trash it: slip past the code gate you are meeting.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 2, by: 2 } });
  on('abagnale', bypassBy('code gate'));
  S('lustig', '13007', '1 credit: break one sentry subroutine. 3 credits: +5 strength. Trash it: slip past the sentry you are meeting.', { brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 3, by: 5 } });
  on('lustig', bypassBy('sentry'));
  S('demara', '13008', '2 credits: break up to 2 barrier subroutines. 2 credits: +3 strength. Trash it: slip past the barrier you are meeting.', { brk: { type: 'barrier', cost: 2, n: 2 }, pump: { cost: 2, by: 3 } });
  on('demara', bypassBy('barrier'));
  S('mammon', '13009', 'When your turn begins, buy power counters for credits; they go when your turn ends. A counter: break one subroutine. 2 credits: +2 strength.', { str: 0, brk: { type: 'any', cost: 0, n: 1, counters: true }, pump: { cost: 2, by: 2 } });
  on('mammon', {
    on: {
      *runnerTurnBegin(X, iid) {
        const most = Math.min(8, X.avail('runner', 'any'));
        if (!most) return;
        const opts = []; for (let n = 1; n <= most; n++) opts.push({ id: String(n), label: n + ' counter' + (n === 1 ? '' : 's') });
        const a = yield* X.ask(iid, 'runner', 'mammon', 'Mammon: buy power counters for this turn?', opts, { skip: 'None' });
        if (a) { X.pay('runner', +a, 'any'); X.card(iid).power += +a; }
      },
      runnerTurnEnd(X, iid) { X.card(iid).power = 0; }
    },
    bot: { mammon: (pub, me, pr) => pr.options[Math.min(2, pr.options.length - 1)].id },
    botPlay: () => 0.7
  });
  S('charlatan', '13010', 'Two clicks: run any server. The first time in that run you approach a rezzed ice, you may pay its strength to slip past it.');
  on('charlatan', {
    abils: (X) => [{ label: 'Charlatan: run any server', clicks: 2, bad: noRun(X) ? 'Nowhere to run' : null }],
    *use(X, iid) { const sid = yield* X.ask(iid, 'runner', 'runOn', 'Charlatan: run which server?', runOpts(X)); if (sid) yield* X.run(sid, { via: 'charlatan' }); },
    on: {
      *approachIce(X, iid, ctx) {
        const S0 = ctx.S;
        if (S0.o.via !== 'charlatan' || S0.charl || !X.card(ctx.iid).rez) return;
        S0.charl = true;
        const n = Math.max(0, X.iceStr(ctx.iid));
        if (X.avail('runner', 'any') >= n && (yield* X.yn(iid, 'runner', 'charlatan', 'Charlatan: pay ' + n + ' to slip past ' + X.nameOf(ctx.iid) + '?', 'Pay ' + n, 'No'))) { X.pay('runner', n, 'any'); S0.charlIce = ctx.iid; }
      },
      encounter(X, iid, ctx) { if (ctx.S.charlIce === ctx.iid) { ctx.S.charlIce = null; ctx.E.bypass = 'charlatan'; } }
    },
    bot: { charlatan: () => 'yes' },
    botAbil: () => 0.4, botPlay: () => 0.3
  });
  S('maxwell_james', '13011', '+1 link. In a turn after a successful run on HQ, trash it: derez an ice protecting a remote server.', { link: 1 });
  on('maxwell_james', {
    abils: (X) => [{ label: 'Maxwell James: trash it — derez an ice protecting a remote', bad: !X.R.flags.hqSuccess ? 'Only after a successful run on HQ this turn' : iceAll(X).some(i => X.card(i).rez && X.isRemote(X.serverOf(i).id)) ? null : 'No rezzed ice on a remote' }],
    *use(X, iid) { const t = yield* X.ask(iid, 'runner', 'maxwell', 'Maxwell James: derez which ice?', iceAll(X).filter(i => X.card(i).rez && X.isRemote(X.serverOf(i).id)).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i))))); X.trashRunner(iid, 'used'); if (t) X.derez(t, 'maxwell_james'); },
    botAbil: () => 0.6, botPlay: () => 0.5
  });
  S('ayla', '13012', 'Before your opening hand, set aside the top 6 cards of your stack (you may look at them) and shuffle 2 of them back. A click: take one of them into your grip.', { setAside: 6 });
  on('ayla', {
    abils: (X, iid) => [{ label: 'Ayla: take a set-aside card', clicks: 1, bad: X.R.ws.some(i => X.card(i).host === iid) ? null : 'None left' }],
    *use(X, iid) { const t = yield* X.ask(iid, 'runner', 'aylaTake', 'Ayla: take which set-aside card?', X.R.ws.filter(i => X.card(i).host === iid).map(i => X.cardOpt(i))); if (t) { X.lift(t); X.wipe(X.card(t)); X.R.grip.push(t); } },
    bot: { aylaBack: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[a.card] || {}).cost || 0) - ((D.CARDS[b.card] || {}).cost || 0)).slice(0, 2).map(o => o.id) },
    botAbil: (pub, me) => (me.hand || []).length <= 2 ? 1 : 0.3
  });
  S('careful_planning', '13013', 'Priority. Choose a card in or before a remote server: it cannot be rezzed this turn.');
  on('careful_planning', {
    playBad: (X) => X.corpPlaced().some(i => X.serverOf(i) && X.isRemote(X.serverOf(i).id)) ? null : 'No remote server',
    *play(X, iid) { const t = yield* X.ask(iid, 'runner', 'careful', 'Careful Planning: which card cannot be rezzed this turn?', X.corpPlaced().filter(i => X.serverOf(i) && X.isRemote(X.serverOf(i).id)).map(i => ({ id: i, label: (X.card(i).rez ? X.nameOf(i) : (X.dat(i).type === 'ice' ? 'Ice' : 'A card')) + ' · ' + X.srvName(X.serverOf(i)) })), { always: true }); if (t) X.card(t).x.lockUntil = X.g.turnN + 1; },
    botPlay: () => 0.3
  });
  S('deep_data_mining', '13014', 'Run R&D. If successful, access more cards: your free memory, at most 4.');
  on('deep_data_mining', { playBad: (X) => X.runBad('rd', 1), *play(X, iid) { yield* X.run('rd', { card: iid, via: 'deep_data_mining' }); }, runMod: { accessRD: (X, iid, v) => v + Math.min(4, freeMu(X)) }, botPlay: () => 1.2 });
  S('llds_diamond', '13015', '+1 memory, +1 link, +1 maximum hand size.', { memory: 1, link: 1, handPlus: 1 });
  on('llds_diamond', { botPlay: () => 0.6 });
  S('ubax', '13016', '+1 memory. When your turn begins, draw a card. One console only.', { console: true, memory: 1 });
  on('ubax', { on: { runnerTurnBegin(X) { X.drawRunner(1, 'ubax'); } }, botPlay: () => 1.2 });
  S('adept', '13017', '+1 strength for each free memory. 2 credits: break one sentry or barrier subroutine.', { brk: { type: ['sentry', 'barrier'], cost: 2, n: 1 } });
  on('adept', { self: { breakerStr: (X, iid, v) => v + freeMu(X) } });
  S('savant', '13018', '+1 strength for each free memory. 2 credits: break one sentry subroutine, or two code gate subroutines.', { brks: [{ type: 'sentry', cost: 2, n: 1 }, { type: 'code gate', cost: 2, n: 2 }], brk: { type: 'sentry', cost: 2, n: 1 } });
  on('savant', { self: { breakerStr: (X, iid, v) => v + freeMu(X) } });
  S('egret', '13019', 'Install only on a rezzed ice: it becomes a barrier, code gate and sentry as well.', { onIce: true });
  on('egret', { mod: { iceTypes: (X, iid, v, ctx) => X.card(iid).host === ctx.iid ? v.concat(['barrier', 'code gate', 'sentry'].filter(t => v.indexOf(t) < 0)) : v }, botPlay: () => 0.4 });
  S('dhegdheer', '13020', 'A click: install a program from your grip on it for 1 less (one at a time); it then uses none of your memory.');
  on('dhegdheer', {
    freeHost: true,
    abils: (X, iid) => [{ label: 'Dhegdheer: install a program on it (1 less)', clicks: 1, bad: X.hostedOn(iid).length ? 'It carries one already' : X.R.grip.some(i => X.dat(i).type === 'program') ? null : 'No program in your grip' }],
    *use(X, iid) { const t = yield* X.ask(iid, 'runner', 'dhegdheer', 'Dhegdheer: install which program on it?', X.R.grip.filter(i => X.dat(i).type === 'program').map(i => X.cardOpt(i, null, X.installCost(i, 1) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 1) ? 'Costs ' + X.installCost(i, 1) : null)))); if (t) yield* X.runnerInstall(t, { discount: 1, host: iid }); },
    botAbil: () => 0.9, botPlay: () => 0.5
  });
  S('levy_lab', '13021', 'A click: show the top 4 cards of your stack, take a program among them, and put the rest at the bottom in any order.');
  on('levy_lab', {
    abils: (X) => [{ label: 'Levy Advanced Research Lab: look at the top 4', clicks: 1, bad: X.R.stack.length ? null : 'Your stack is empty' }],
    *use(X, iid) {
      const top = X.R.stack.slice(0, 4);
      X.reveal('runner', top, 'Levy Advanced Research Lab');
      const progs = top.filter(i => X.dat(i).type === 'program');
      const t = progs.length ? yield* X.ask(iid, 'runner', 'levyLab', 'Levy Advanced Research Lab: take which program?', progs.map(i => X.cardOpt(i)), { skip: 'None' }) : null;
      if (t) { X.lift(t); X.R.grip.push(t); }
      const rest = top.filter(i => i !== t);
      const order = yield* arrange(X, iid, 'runner', 'levyOrder', rest, 'Levy Advanced Research Lab (to the bottom)');
      for (const i of order) { X.lift(i); X.R.stack.push(i); }
    },
    bot: { levyLab: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id },
    botAbil: () => 0.7, botPlay: () => 0.4
  });
  S('laguna_velasco', '13022', 'Clicking to draw draws one more card.');
  on('laguna_velasco', { on: { runnerBasic(X, iid, ctx) { if (ctx.what === 'draw') X.drawRunner(1, 'laguna_velasco'); } }, botPlay: () => 0.8 });
  S('process_automation', '13023', 'Gain 2 credits and draw a card.');
  on('process_automation', { play(X) { gainR(X, 2, 'process_automation'); X.drawRunner(1, 'process_automation'); }, botPlay: () => 1.6 });
  S('officer_frank', '13024', 'In a turn you took meat damage, trash it and pay 1: the Corp trashes 2 random cards from HQ.');
  on('officer_frank', {
    on: { damaged(X, iid, ctx) { if (ctx.kind === 'meat' && ctx.n > 0) X.R.flags.meat = true; } },
    abils: (X) => [{ label: 'Officer Frank: trash it — 2 random cards from HQ', cost: 1, bad: X.R.flags.meat ? null : 'Only after you took meat damage this turn' }],
    use(X, iid) { X.trashRunner(iid, 'used'); for (let k = 0; k < 2 && X.C.hq.length; k++) X.toArchives(X.C.hq[Math.floor(X.rand() * X.C.hq.length)], false); X.log({ t: 'note', side: 'runner', text: 'Officer Frank: 2 random cards from HQ are trashed' }); },
    botAbil: () => 2, botPlay: () => 0.2
  });
  S('dean_lister', '13025', 'Trash it as you meet an ice: an icebreaker has +1 strength for each card in your grip until the run ends.');
  on('dean_lister', {
    encOpts: (X, iid) => X.breakers().length && X.R.grip.length ? [{ kind: 'lower', label: 'Dean Lister: trash him — an icebreaker +' + X.R.grip.length + ' strength this run', cost: 0 }] : [],
    *encUse(X, iid) { const b = yield* X.ask(iid, 'runner', 'deanLister', 'Dean Lister: which icebreaker?', X.breakers().map(i => X.cardOpt(i)), { always: true }); const n = X.R.grip.length; X.trashRunner(iid, 'used'); if (b) X.g.run.pump[b] = (X.g.run.pump[b] || 0) + n; },
    botPlay: () => 0.3
  });
  S('biometric_spoofing', '13026', 'Trash it: prevent 2 damage.');
  on('biometric_spoofing', { *prevent(X, iid, ctx) { if (!(yield* X.yn(iid, 'runner', 'biometric', 'Biometric Spoofing: trash it to prevent 2 ' + ctx.kind + ' damage?', 'Prevent 2', 'Take it'))) return 0; X.trashRunner(iid, 'used'); X.log({ t: 'prevent', side: 'runner', k: 'biometric_spoofing', n: Math.min(2, ctx.n) }); return Math.min(2, ctx.n); }, bot: { biometric: () => 'yes' }, botPlay: () => 0.6 });
  S('shadow_net', '13027', 'A click, forfeit an agenda: play an event from your heap free.');
  on('shadow_net', {
    abils: (X) => [{ label: 'The Shadow Net: forfeit an agenda — play an event from your heap', clicks: 1, bad: !X.R.score.some(i => X.dat(i).type === 'agenda') ? 'No agenda to forfeit' : X.heapLocked() ? 'Cards cannot leave your heap' : X.R.heap.some(i => X.dat(i).type === 'event') ? null : 'No event in your heap' }],
    *use(X, iid) {
      const ag = yield* X.ask(iid, 'runner', 'shadowNetAg', 'The Shadow Net: forfeit which agenda?', X.R.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i)), { always: true });
      if (!ag) return;
      const ev = yield* X.ask(iid, 'runner', 'shadowNet', 'The Shadow Net: play which event?', X.dedupe(X.R.heap.filter(i => X.dat(i).type === 'event').map(i => { const sc = D.SCRIPT[X.card(i).k]; return X.cardOpt(i, null, null, sc && sc.playBad ? sc.playBad(X, i) : null); })), { skip: 'None' });
      if (!ev) return;
      X.lift(ag); X.R.gone.push(ag); X.log({ t: 'forfeit', side: 'runner', k: X.card(ag).k });
      X.R.credits += X.playCost(ev);
      X.lift(ev); X.R.grip.push(ev);
      yield* X.playEvent(ev);
    },
    botAbil: () => -1, botPlay: () => -1
  });

  /* ================================================================ CORP */
  S('seidr_labs', '13028', 'The first time each turn the Runner loses or spends a click during a run, you may put a card from Archives on top of R&D.');
  const seidr = function* (X, iid) {
    if (!X.g.run || X.card(iid).x.turn === X.g.turnN || !X.C.arch.length) return;
    X.card(iid).x.turn = X.g.turnN;
    const t = yield* X.ask(iid, 'corp', 'seidr', 'Seidr Laboratories: put which card from Archives on top of R&D?', X.C.arch.map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { skip: 'None' });
    if (t) { X.lift(t); X.card(t).up = false; X.C.rd.unshift(t); X.log({ t: 'note', side: 'corp', text: 'Seidr Laboratories: a card from Archives goes on top of R&D' }); }
  };
  on('seidr_labs', { on: { clickSpent: seidr, clickLost: seidr }, bot: { seidr: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id } });
  S('brain_rewiring', '13029', 'When scored, you may pay X: X random cards from the Runner’s grip go to the bottom of their stack, then they draw a card.');
  on('brain_rewiring', {
    *onScore(X, iid) {
      const most = Math.min(X.C.credits, X.R.grip.length);
      if (!most) return;
      const opts = []; for (let n = 1; n <= most; n++) opts.push({ id: String(n), label: 'Pay ' + n });
      const a = yield* X.ask(iid, 'corp', 'brainRewiring', 'Brain Rewiring: pay how much?', opts, { skip: 'Nothing' });
      if (!a) return;
      X.pay('corp', +a, 'any');
      for (let k = 0; k < +a && X.R.grip.length; k++) { const t = X.R.grip[Math.floor(X.rand() * X.R.grip.length)]; X.lift(t); X.R.stack.push(t); }
      X.drawRunner(1, 'brain_rewiring');
      X.log({ t: 'note', side: 'corp', text: 'Brain Rewiring: ' + X.plural(+a, 'card') + ' from the grip to the bottom of the stack' });
    },
    bot: { brainRewiring: (pub, me, pr) => pr.options[pr.options.length - 1].id }
  });
  S('elective_upgrade', '13030', 'When scored, 2 agenda counters on it. Once a turn, a click and a counter: gain two clicks.', { scoreCounters: 2 });
  on('elective_upgrade', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 ? [{ label: 'Elective Upgrade: spend a counter — gain two clicks', clicks: 1, once: 'elective', bad: X.card(iid).agenda ? null : 'No counters' }] : [],
    use(X, iid) { X.spendAgenda(iid); X.C.clicks += 2; X.log({ t: 'clicks', side: 'corp', n: 2, k: 'elective_upgrade' }); },
    botAbil: () => 1.8
  });
  S('field_test', '13031', 'When scored, install any number of cards from HQ, free.');
  on('field_test', {
    *onScore(X, iid) {
      for (let n = 0; n < 10; n++) {
        const pool = X.C.hq.filter(i => X.dat(i).type !== 'operation');
        if (!pool.length) return;
        const t = yield* X.ask(iid, 'corp', 'fieldTest', 'Successful Field Test: install which card free?', pool.map(i => X.cardOpt(i)), { skip: 'Done' });
        if (!t) return;
        yield* X.corpInstall(t, { free: true });
      }
    },
    bot: { fieldTest: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || {}).id || 'skip' }
  });
  S('estelle_moon', '13032', 'Whenever you install a card in the root of a remote server, a power counter on her. Trash her: 2 credits and a card for each counter.');
  on('estelle_moon', {
    on: { install(X, iid, ctx) { if (ctx.side === 'corp' && ctx.iid !== iid && X.dat(ctx.iid).type !== 'ice' && ctx.sid && X.isRemote(ctx.sid)) X.card(iid).power++; } },
    abils: (X, iid) => [{ label: 'Estelle Moon: trash her — ' + 2 * X.card(iid).power + ' credits and ' + X.plural(X.card(iid).power, 'card') }],
    use(X, iid) { const n = X.card(iid).power; X.toArchives(iid, true); gainC(X, 2 * n, 'estelle_moon'); X.drawCorp(n, 'estelle_moon'); },
    botAbil: (pub, me, o) => /— (\d+) credits/.test(o.label) && +o.label.match(/— (\d+) credits/)[1] >= 6 ? 2 : -1
  });
  S('marilyn_campaign', '13033', 'Put 8 credits on it when rezzed; when your turn begins, take 2; trashed when empty. When it would be trashed, you may shuffle it into R&D instead.', { load: 8 });
  function* marilynBack(X, iid) {
    if (!(yield* X.yn(iid, 'corp', 'marilyn', 'Marilyn Campaign: shuffle it into R&D instead of Archives?', 'Into R&D', 'To Archives'))) return false;
    X.lift(iid); X.wipe(X.card(iid)); X.card(iid).up = false; X.C.rd.push(iid); X.shuffleRD();
    X.card(iid).x.saved = true;
    X.log({ t: 'note', side: 'corp', text: 'Marilyn Campaign is shuffled back into R&D' });
    return true;
  }
  on('marilyn_campaign', {
    on: { *corpTurnBegin(X, iid) { const c = X.card(iid), n = Math.min(2, c.cred); c.cred -= n; gainC(X, n, 'marilyn_campaign'); if (c.cred <= 0) { if (!(yield* marilynBack(X, iid))) { X.toArchives(iid, true); X.log({ t: 'empty', k: 'marilyn_campaign' }); } else X.card(iid).x.saved = false; } } },
    *onTrashed(X, iid) { yield* marilynBack(X, iid); },
    bot: { marilyn: () => 'yes' }
  });
  S('eli_2', '13034', 'The Runner may lose two clicks to break up to two of its subroutines.', { clickBreak: { clicks: 2, n: 2 }, subs: [{ k: 's', n: 0, text: 'The Corp may draw a card' }, { k: 'etr' }, { k: 'etr' }] });
  on('eli_2', { subs: [function* (X, iid) { if (X.C.rd.length && (yield* X.yn(iid, 'corp', 'eli2', 'Eli 2.0: draw a card?', 'Draw', 'No'))) X.drawCorp(1, 'eli_2'); return null; }], bot: { eli2: () => 'yes' } });
  S('exec_functioning', '13035', '', { subs: [{ k: 'trace', n: 4, do: { k: 'brain', n: 1 }, text: '1 brain damage' }] });
  S('holmegaard', '13036', '', { subs: [{ k: 'trace', n: 4, do: { k: 's', n: 0 }, text: 'the Runner accesses nothing this run' }, { k: 's', n: 1, text: 'Trash an installed icebreaker' }] });
  on('holmegaard', {
    subs: [
      function (X) { X.g.run.noAccess = true; X.log({ t: 'note', side: 'corp', text: 'Holmegaard: the Runner can access nothing this run' }); return null; },
      function* (X, iid) { const b = X.breakers(); if (!b.length) return null; const t = yield* X.ask(iid, 'corp', 'holmegaard', 'Holmegaard: trash which icebreaker?', b.map(i => X.cardOpt(i)), { always: true }); if (t && !(yield* X.saveWithConstruct(t))) X.trashRunner(t, 'Holmegaard'); return null; }
    ]
  });
  S('tapestry', '13037', '', { subs: [{ k: 'loseClick' }, { k: 's', n: 0, text: 'The Corp may draw a card' }, { k: 's', n: 1, text: 'The Corp may put a card from HQ on top of R&D' }] });
  on('tapestry', {
    subs: [
      function* (X, iid) { if (X.C.rd.length && (yield* X.yn(iid, 'corp', 'tapestryDraw', 'Tapestry: draw a card?', 'Draw', 'No'))) X.drawCorp(1, 'tapestry'); return null; },
      function* (X, iid) { if (!X.C.hq.length) return null; const t = yield* X.ask(iid, 'corp', 'tapestryTop', 'Tapestry: put a card from HQ on top of R&D?', X.C.hq.map(i => X.cardOpt(i)), { skip: 'No' }); if (t) { X.lift(t); X.C.rd.unshift(t); } return null; }
    ],
    bot: { tapestryDraw: () => 'yes', tapestryTop: () => 'skip' }
  });
  S('ultraviolet', '13038', 'Triple. Gain 10 credits and draw 4; you may install a card from HQ.');
  on('ultraviolet', {
    *play(X, iid) {
      gainC(X, 10, 'ultraviolet'); X.drawCorp(4, 'ultraviolet');
      const pool = X.C.hq.filter(i => X.dat(i).type !== 'operation');
      const t = pool.length ? yield* X.ask(iid, 'corp', 'ultraviolet', 'Ultraviolet Clearance: install a card?', pool.map(i => X.cardOpt(i)), { skip: 'No' }) : null;
      if (t) yield* X.corpInstall(t, {});
    },
    bot: { ultraviolet: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || {}).id || 'skip' },
    botPlay: () => 1.6
  });
  S('black_level', '13039', 'Whenever a run on this server succeeds, the Runner takes 1 brain damage or jacks out — if they jack out, you gain 5, draw a card and trash this.');
  on('black_level', {
    on: {
      *success(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || ctx.S.sid !== sv.id) return;
        if (yield* X.yn(iid, 'runner', 'blackLevel', 'Black Level Clearance: take 1 brain damage, or jack out?', 'Take the damage', 'Jack out')) { yield* X.damage('brain', 1, 'Black Level Clearance'); return; }
        gainC(X, 5, 'black_level'); X.drawCorp(1, 'black_level'); X.toArchives(iid, true);
        yield* X.endRun('jacked', 'Black Level Clearance');
      }
    },
    bot: { blackLevel: (pub) => pub.runner.brain >= 2 ? 'no' : 'yes' }
  });
  S('mason_bellamy', '13040', 'Whenever an encounter with an ice protecting this server ends with a subroutine broken, the Runner loses a click.');
  on('mason_bellamy', { on: { encounterEnd(X, iid, ctx) { const sv = X.serverOf(iid); if (!sv || sv.ice.indexOf(ctx.iid) < 0 || !ctx.E.brokeAny || !X.R.clicks) return; X.R.clicks--; X.log({ t: 'loseClick', k: 'mason_bellamy' }); } } });
  S('skorpios', '13041', 'Once a turn, when Runner cards are trashed, you may remove one of them from the game instead.');
  on('skorpios', {
    sync: {
      cardsTrashed(X, iid, ctx) {
        if (X.card(iid).x.turn === X.g.turnN) return;
        const batch = (X.card(iid).x.batch = (X.card(iid).x.batch || []).concat(ctx.iids));
        if (batch.length > ctx.iids.length) return;
        X.g.pending.push({ iid, f: function* (X2, i2) {
          const pool = (X2.card(i2).x.batch || []).filter(i => X2.R.heap.indexOf(i) >= 0);
          X2.card(i2).x.batch = [];
          if (!pool.length || X2.card(i2).x.turn === X2.g.turnN) return;
          const t = yield* X2.ask(i2, 'corp', 'skorpios', 'Skorpios: remove one of the trashed cards from the game?', pool.map(i => X2.cardOpt(i)), { skip: 'No' });
          if (t) { X2.card(i2).x.turn = X2.g.turnN; X2.lift(t); X2.R.gone.push(t); X2.log({ t: 'note', side: 'corp', text: 'Skorpios: ' + X2.nameOf(t) + ' leaves the game' }); }
        } });
      }
    },
    bot: { skorpios: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id }
  });
  S('armored_servers', '13042', 'When scored, an agenda counter on it. During a run, spend it: for the rest of the run, breaking a subroutine or jacking out costs the Runner a card from their grip.', { scoreCounters: 1 });
  on('armored_servers', {
    winOpts: (X, iid) => X.g.run && X.card(iid).agenda && !X.g.run.armored ? [{ label: 'Armored Servers: spend the counter — breaking or jacking out costs a card from the grip' }] : [],
    winUse(X, iid) { X.spendAgenda(iid); X.g.run.armored = true; X.log({ t: 'note', side: 'corp', text: 'Armored Servers: breaking and jacking out cost a card from the grip this run' }); },
    botWin: () => true
  });
  S('illicit_sales', '13043', 'When scored, you may take a bad publicity; gain 3 credits for each bad publicity you have.');
  on('illicit_sales', { *onScore(X, iid) { if (yield* X.yn(iid, 'corp', 'illicit', 'Illicit Sales: take a bad publicity first?', 'Take it', 'No')) yield* X.takeBP(1, 'Illicit Sales'); gainC(X, 3 * X.C.bp, 'illicit_sales'); }, bot: { illicit: () => 'yes' } });
  S('graft', '13044', 'When scored, you may find up to 3 cards in R&D, show them and take them; shuffle.');
  on('graft', {
    *onScore(X, iid) {
      if (!X.C.rd.length) return;
      X.g.revealN++;
      const ts = yield* X.ask(iid, 'corp', 'graft', 'Graft: take up to 3 cards from R&D?', X.C.rd.map(i => X.cardOpt(i)), { multi: true, min: 0, max: Math.min(3, X.C.rd.length) });
      for (const t of ts) { X.lift(t); X.C.hq.push(t); }
      if (ts.length) X.reveal('corp', ts, 'Graft');
      X.shuffleRD();
    },
    bot: { graft: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type === 'agenda').concat(pr.options).slice(0, 3).map(o => o.id).filter((v, n, a) => a.indexOf(v) === n) }
  });
  S('illegal_arms', '13045', 'When your turn begins, gain 1 credit and draw a card. When the Runner trashes it while it is rezzed, you take a bad publicity.');
  on('illegal_arms', { on: { corpTurnBegin(X) { gainC(X, 1, 'illegal_arms'); X.drawCorp(1, 'illegal_arms'); } }, *onTrashed(X, iid) { if (X.card(iid).rez) yield* X.takeBP(1, 'Illegal Arms Factory'); } });
  S('mr_stone', '13046', 'Whenever the Runner takes tags, 1 meat damage.');
  on('mr_stone', { on: { *tagged(X) { yield* X.damage('meat', 1, 'Mr. Stone'); } } });
  S('bloodletter', '13047', '', { subs: [{ k: 's', n: 0, text: 'The Runner trashes a program, or the top 2 cards of their stack' }] });
  on('bloodletter', {
    subs: [function* (X, iid) {
      const p = X.programs();
      const a = yield* X.ask(iid, 'runner', 'bloodletter', 'Bloodletter: trash a program, or the top 2 cards of your stack?', [{ id: 'prog', label: 'Trash a program', bad: p.length ? null : 'No programs' }, { id: 'top', label: 'Trash the top 2 of your stack' }], { always: true });
      if (a === 'top') { mill(X, 2); return null; }
      const t = yield* X.ask(iid, 'runner', 'bloodletterP', 'Bloodletter: trash which program?', p.map(i => X.cardOpt(i)), { always: true });
      if (t) X.trashRunner(t, 'Bloodletter');
      return null;
    }],
    bot: { bloodletter: () => 'top' }
  });
  S('colossus', '13048', 'It can be advanced: +1 strength for each advancement token. With 3 or more its subroutines grow.', { advable: true, advStr: 1, subs: [{ k: 's', n: 0, text: '1 tag (2 with 3+ tokens)' }, { k: 's', n: 1, text: 'Trash a program (and a resource with 3+ tokens)' }] });
  on('colossus', {
    subs: [
      function* (X, iid) { yield* X.giveTags(advBig(X, iid) ? 2 : 1, 'Colossus'); return null; },
      function* (X, iid) {
        yield* X.trashProgram('Colossus');
        if (advBig(X, iid) && X.rigOf('resource').length) { const t = yield* X.ask(iid, 'corp', 'colossus', 'Colossus: trash which resource?', X.rigOf('resource').map(i => X.cardOpt(i)), { always: true }); if (t) yield* X.corpTrashes(t, 'Colossus'); }
        return null;
      }
    ]
  });
  S('hailstorm', '13049', '', { subs: [{ k: 's', n: 0, text: 'A card in the Runner’s heap leaves the game' }, { k: 'etr' }] });
  on('hailstorm', { subs: [function* (X, iid) { if (!X.R.heap.length) return null; const t = yield* X.ask(iid, 'corp', 'hailstorm', 'Hailstorm: which card in the heap leaves the game?', X.dedupe(X.R.heap.map(i => X.cardOpt(i))), { always: true }); if (t) { X.lift(t); X.R.gone.push(t); } return null; }] });
  S('hortum', '13050', 'It can be advanced. With 3 or more advancement tokens AI programs cannot break it, and its subroutines grow.', { advable: true, subs: [{ k: 's', n: 0, text: 'The Corp gains 1 (4 with 3+ tokens)' }, { k: 's', n: 1, text: 'End the run (with 3+ tokens: first find up to 2 cards in R&D)' }] });
  on('hortum', {
    blocks: (X, iid, b) => advBig(X, iid) && kw(X, b, /\bAI\b/),
    subs: [
      function (X, iid) { gainC(X, advBig(X, iid) ? 4 : 1, 'hortum'); return null; },
      function* (X, iid) {
        if (advBig(X, iid) && X.C.rd.length) {
          X.g.revealN++;
          const ts = yield* X.ask(iid, 'corp', 'hortum', 'Hortum: take up to 2 cards from R&D?', X.C.rd.map(i => X.cardOpt(i)), { multi: true, min: 0, max: Math.min(2, X.C.rd.length) });
          for (const t of ts) { X.lift(t); X.C.hq.push(t); }
          X.shuffleRD();
        }
        return 'end';
      }
    ],
    bot: { hortum: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type === 'agenda').slice(0, 2).map(o => o.id) }
  });
  S('hunter_seeker', '13051', 'Double. Only if the Runner stole an agenda last turn. Trash an installed card.');
  on('hunter_seeker', {
    playBad: (X) => X.R.last.stole ? (X.R.rig.length ? null : 'Nothing installed') : 'Only if the Runner stole an agenda last turn',
    *play(X, iid) { const t = yield* X.ask(iid, 'corp', 'hunterSeeker', 'Hunter Seeker: trash which card?', X.R.rig.map(i => X.cardOpt(i)), { always: true }); if (t) yield* X.corpTrashes(t, 'Hunter Seeker'); },
    bot: { hunterSeeker: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id },
    botPlay: () => 3
  });
  S('kp_lynn', '13052', 'Whenever the Runner passes every ice protecting this server, they take a tag or the run ends.');
  on('kp_lynn', {
    on: {
      *approachServer(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || ctx.sid !== sv.id || !sv.ice.length) return;
        if (yield* X.yn(iid, 'runner', 'kpLynn', 'K. P. Lynn: take a tag, or the run ends?', 'Take a tag', 'End the run')) { yield* X.giveTags(1, 'K. P. Lynn'); return; }
        ctx.S.endNow = true; ctx.S.endBy = 'K. P. Lynn';
      }
    },
    bot: { kpLynn: (pub) => pub.runner.tags ? 'no' : 'yes' }
  });
  S('paper_trail', '13053', 'When scored, trace 6: every connection and job resource is trashed.');
  on('paper_trail', { *onScore(X) { if (!(yield* X.trace(6, 'Paper Trail')).ok) return; for (const t of X.rigOf('resource').filter(i => kw(X, i, /Connection|Job/))) yield* X.corpTrashes(t, 'Paper Trail'); } });
  S('honeyfarm', '13054', 'When the Runner accesses it, they lose 1 credit.');
  on('honeyfarm', { onAccess(X) { if (X.R.credits) { X.R.credits--; X.log({ t: 'lose', side: 'runner', n: 1, cause: 'Honeyfarm' }); } } });
  S('long_term', '13055', 'When your turn begins, put 2 credits on it. With 8 or more on it: a click — take any number of them.');
  on('long_term', {
    on: { corpTurnBegin(X, iid) { X.card(iid).cred += 2; } },
    abils: (X, iid) => [{ label: 'Long-Term Investment: take its credits (' + X.card(iid).cred + ')', clicks: 1, bad: X.card(iid).cred >= 8 ? null : 'Needs 8 on it' }],
    *use(X, iid) { const c = X.card(iid); const opts = []; for (let n = c.cred; n >= 1; n--) opts.push({ id: String(n), label: 'Take ' + n }); const a = +(yield* X.ask(iid, 'corp', 'longTerm', 'Long-Term Investment: take how many?', opts, { always: true })); c.cred -= a; gainC(X, a, 'long_term'); },
    show: (X, iid) => X.card(iid).cred ? X.card(iid).cred + ' on it' : null,
    bot: { longTerm: (pub, me, pr) => pr.options[0].id },
    botAbil: () => 2
  });
  S('weir', '13056', '', { subs: [{ k: 'loseClick' }, { k: 's', n: 0, text: 'The Runner trashes a card from their grip' }] });
  on('weir', { subs: [function* (X, iid) { if (!X.R.grip.length) return null; const t = yield* X.ask(iid, 'runner', 'weir', 'Weir: trash which card from your grip?', X.R.grip.map(i => X.cardOpt(i)), { always: true }); if (t) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); } return null; }] });
  S('ipo', '13057', 'Terminal. Gain 13 credits.');
  on('ipo', { play(X) { gainC(X, 13, 'ipo'); }, botPlay: (pub) => pub.corp.credits < 12 ? 2 : 0.5 });

  D.SET_LOADED.td = true;
})(typeof window !== 'undefined' ? window : this);
