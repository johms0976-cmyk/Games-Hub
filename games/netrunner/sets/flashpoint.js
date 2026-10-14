'use strict';
/* The Flashpoint cycle (2016–17: 23 Seconds, Blood Money, Escalation,
 * Intervention, Martial Law, Quorum — 120 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. New here: terminal operations (the Corp's
 * actions end), ice the Runner meets where they access it, icebreakers that
 * come back from the heap as their ice is met, Omar Keung's switched server,
 * the Runner's extra turn. Readings decided here:
 *   - "Pay X: +X strength, then break" breakers (Paperclip, Black Orchestra,
 *     MKUltra) are offered as whole plans: break 1, 2… subroutines for the
 *     fewest credits.
 *   - Dai V's whole cost (strength too) comes from stealth credits.
 *   - Hyoubu Research Facility gains what the Corp itself spent.
 *   - Net Mercur's choice (a credit on it, or a card) is asked when the run's
 *     action is over.
 *   - NASX: after any of your card abilities gains you credits, its counters
 *     may be bought from the turn menu.
 *   - Baba Yaga carries icebreakers; they work as they would anyway.
 *   - Cold Read's 4 credits pay for anything in its run.
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
  const anyRun = (name, o) => ({
    playBad: (X) => noRun(X) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', runOpts(X), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, Object.assign({ card: iid, via: X.card(iid).k }, o || {}));
    }
  });
  const gainC = (X, n, k) => { if (n > 0) { X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k }); } };
  const gainR = (X, n, k) => { if (n > 0) { X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k }); } };
  const loseR = (X, n, cause) => { const k = Math.min(n, X.R.credits); if (k) { X.R.credits -= k; X.log({ t: 'lose', side: 'runner', n: k, cause }); } };
  const hasAI = X => X.programs().some(i => kw(X, i, /\bAI\b/));
  const mill = (X, n) => { for (let k = 0; k < n && X.R.stack.length; k++) { const t = X.R.stack.shift(); X.card(t).up = true; X.R.heap.push(t); } };
  const toGrip = (X, t) => { for (const h of X.hostedOn(t)) X.trashRunner(h, 'host'); X.lift(t); X.wipe(X.card(t)); X.R.grip.push(t); };
  function* arrange(X, iid, side, what, list, why) {
    let left = list.slice();
    const order = [];
    while (left.length > 1) {
      const t = yield* X.ask(iid, side, what, why + ' — which goes ' + (order.length ? 'next' : 'on top') + '?', left.map(i => X.cardOpt(i)), { always: true });
      order.push(t); left = left.filter(i => i !== t);
    }
    return order.concat(left);
  }
  /* May this breaker touch the ice being met? (the engine's own test, for script breakers) */
  function fits(X, b, E, type) {
    const r = X.g.run;
    if (!r || r.noPrograms || (r.disabled || []).indexOf(b) >= 0) return false;
    if (type !== 'any' && X.typesOf(E.iid).indexOf(type) < 0) return false;
    const isc = D.SCRIPT[X.card(E.iid).k];
    return !(isc && isc.blocks && isc.blocks(X, E.iid, b));
  }
  /* A "pay to grow, then break" breaker: each use costs `per`, gives `by` strength and,
     once strong enough, breaks up to `n` subroutines. Paperclip pays X for X of both. */
  function growBreaker(type, per, by, n, paperclip) {
    const plan = (X, iid, E, k) => {
      const need = Math.max(0, X.iceStr(E.iid, E) - X.breakerStr(iid));
      if (paperclip) { const x = Math.max(need, k); return { cost: x, str: x }; }
      const u = Math.max(Math.ceil(need / by), 1) + Math.ceil(k / n) - 1;
      return { cost: per * u, str: by * u };
    };
    const open = E => E.subs.map((s, k) => k).filter(k => !E.broken[k]);
    return {
      encOpts(X, iid, E) {
        if (!fits(X, iid, E, type)) return [];
        const o = open(E);
        return o.map((s, j) => { const p = plan(X, iid, E, j + 1); return { kind: 'break', subs: o.slice(0, j + 1), label: X.nameOf(iid) + ': pay ' + p.cost + ' — +' + p.str + ' strength, break ' + o.slice(0, j + 1).map(k => '“' + X.subText(E.subs[k]) + '”').join(' and '), cost: p.cost, bad: X.avail('runner', 'breaker', { b: iid }) < p.cost ? 'Costs ' + p.cost : null }; });
      },
      *encUse(X, iid, m, E) {
        const o = open(E), p = plan(X, iid, E, m + 1);
        X.pay('runner', p.cost, 'breaker', { b: iid });
        E.pump[iid] = (E.pump[iid] || 0) + p.str;
        const won = yield* X.breaking(E, o.slice(0, m + 1));
        for (const k of won) E.broken[k] = true;
        E.brokeAny = true;
        E.used.by = E.used.by || {}; E.used.by[iid] = (E.used.by[iid] || 0) + won.length;
        X.log({ t: 'break', how: X.card(iid).k, iid: E.iid, subs: won, cost: p.cost });
      },
      heap: {
        *encounter(X, iid, ctx) {
          if (X.typesOf(ctx.iid).indexOf(type) < 0 || X.heapLocked() || X.installBad(iid) || X.avail('runner', 'program') < X.installCost(iid, 0)) return;
          if (yield* X.yn(iid, 'runner', 'fromHeap', X.nameOf(iid) + ': install it from your heap (' + X.installCost(iid, 0) + ')?', 'Install it', 'No')) yield* X.runnerInstall(iid, {});
        }
      },
      bot: { fromHeap: () => 'yes' }
    };
  }
  /* No standard break options: the script offers them. */
  const SCRIPTED = type => ({ brk: { type, cost: 1, n: 1, only: ['__script'] } });
  /* "2 credits, back to your grip: derez the ice it fully broke this encounter." */
  const derezBack = (type) => ({
    encOpts(X, iid, E) {
      if (!E.subs.length || !E.used.by || (E.used.by[iid] || 0) < E.subs.length || X.typesOf(E.iid).indexOf(type) < 0 || !X.card(E.iid).rez) return [];
      return [{ kind: 'lower', label: X.nameOf(iid) + ': pay 2, back to your grip — derez ' + X.nameOf(E.iid), cost: 2, bad: X.avail('runner', 'breaker', { b: iid }) < 2 ? 'Costs 2' : null }];
    },
    encUse(X, iid, n, E) { X.pay('runner', 2, 'breaker', { b: iid }); toGrip(X, iid); X.derez(E.iid, X.card(iid).k); }
  });
  /* "Whenever this program fully breaks an ice, a power counter: +1 strength each." */
  const growsOnFull = {
    self: { breakerStr: (X, iid, v) => v + X.card(iid).power },
    on: { fullyBroken(X, iid, ctx) { if (ctx.E.used.by && ctx.E.used.by[iid] >= ctx.E.subs.length) { X.card(iid).power++; X.log({ t: 'power', k: X.card(iid).k, n: X.card(iid).power }); } } }
  };
  /* Ice met where it is accessed (not in Archives). */
  const metOnAccess = {
    *onAccess(X, iid, ctx) {
      if (ctx.from === 'arch' || !X.g.run) return;
      X.log({ t: 'note', side: 'corp', text: 'The Runner meets ' + X.nameOf(iid) + ' as they access it' });
      const out = yield* X.encounter(iid);
      if (X.g.run && out === 'end') yield* X.endRun('ended', X.nameOf(iid));
    }
  };
  /* Fairchild: pay N, or trash one of your installed cards. */
  const payOrTrash = n => function* (X, iid) {
    const can = X.avail('runner', 'any') >= n, any = X.R.rig.length > 0;
    if (!can && !any) return null;
    const a = yield* X.ask(iid, 'runner', 'payOrTrash', X.nameOf(iid) + ': pay ' + n + ', or trash one of your installed cards?', [{ id: 'pay', label: 'Pay ' + n, bad: can ? null : 'You cannot' }, { id: 'trash', label: 'Trash an installed card', bad: any ? null : 'Nothing installed' }], { always: true });
    if (a === 'pay') { X.pay('runner', n, 'any'); X.log({ t: 'paid', n, k: X.card(iid).k }); return null; }
    const t = yield* X.ask(iid, 'runner', 'trashOwn', X.nameOf(iid) + ': trash which of your cards?', X.R.rig.map(i => X.cardOpt(i)), { always: true });
    if (t) X.trashRunner(t, X.nameOf(iid));
    return null;
  };
  const trashOwn = function* (X, iid) {
    if (!X.R.rig.length) return null;
    const t = yield* X.ask(iid, 'runner', 'trashOwn', X.nameOf(iid) + ': trash which of your installed cards?', X.R.rig.map(i => X.cardOpt(i)), { always: true });
    if (t) X.trashRunner(t, X.nameOf(iid));
    return null;
  };
  const botTrashOwn = (pub, me, pr) => (pr.options.find(o => o.label === 'face-down card') || pr.options.slice().sort((a, b) => ((D.CARDS[a.card] || {}).cost || 0) - ((D.CARDS[b.card] || {}).cost || 0))[0]).id;
  /* A job that saves credits: Algo Trading (Runner), C.I. Fund (Corp). */
  const fund = (side, k) => ({
    on: {
      *[side === 'corp' ? 'corpTurnBegin' : 'runnerTurnBegin'](X, iid) {
        const have = X.sideOf(side).credits, most = Math.min(3, have);
        if (most > 0) {
          const opts = []; for (let n = 1; n <= most; n++) opts.push({ id: String(n), label: 'Move ' + n });
          const a = yield* X.ask(iid, side, 'fund', X.nameOf(iid) + ': move credits onto it (it has ' + X.card(iid).cred + ')?', opts, { skip: 'None' });
          if (a) { X.sideOf(side).credits -= +a; X.card(iid).cred += +a; }
        }
        if (X.card(iid).cred >= 6) { X.card(iid).cred += 2; X.log({ t: 'note', side, text: X.nameOf(iid) + ' grows by 2 (' + X.card(iid).cred + ' on it)' }); }
      }
    },
    show: (X, iid) => X.card(iid).cred ? X.card(iid).cred + ' on it' : null,
    bot: { fund: (pub, me, pr) => pr.options[pr.options.length - 1].id }
  });

  /* ================================================================ 23 SECONDS */
  S('system_outage', '11001', 'Current. Each time the Corp draws after its first draw of the turn, it loses 1 credit.');
  const outage = function* (X) { X.C.flags.soDraws = (X.C.flags.soDraws || 0) + 1; if (X.C.flags.soDraws > 1) yield* X.corpLoses(1, 'System Outage'); };
  on('system_outage', { on: { corpDrew: outage, corpDrewMore: outage }, botPlay: () => 0.8 });
  S('null', '11002', 'Once a turn as you meet an ice, you may trash a card from your grip: that ice has −2 strength for the run.');
  on('null', {
    on: {
      *encounter(X, iid, ctx) {
        if (X.card(iid).x.turn === X.g.turnN || !X.R.grip.length) return;
        const t = yield* X.ask(iid, 'runner', 'null', 'Null: trash a card from your grip — ' + X.nameOf(ctx.iid) + ' −2 strength this run?', X.R.grip.map(i => X.cardOpt(i)), { skip: 'No' });
        if (!t) return;
        X.card(iid).x.turn = X.g.turnN;
        X.lift(t); X.card(t).up = true; X.R.heap.push(t);
        (X.g.run.nullIce = X.g.run.nullIce || []).push(ctx.iid);
        X.log({ t: 'note', side: 'runner', text: 'Null: ' + X.nameOf(ctx.iid) + ' is 2 weaker this run' });
      }
    },
    mod: { iceStr: (X, iid, v, ctx) => X.g.run && (X.g.run.nullIce || []).indexOf(ctx.iid) >= 0 ? v - 2 : v },
    bot: { null: () => 'skip' }
  });
  S('gpi_net_tap', '11003', 'Whenever you approach an ice, you may expose it; then you may trash this to jack out.');
  on('gpi_net_tap', {
    on: {
      *approachIce(X, iid, ctx) {
        if (X.card(ctx.iid).rez) return;
        if (!(yield* X.yn(iid, 'runner', 'gpi', 'GPI Net Tap: expose this unrezzed ice?', 'Expose it', 'No'))) return;
        yield* X.expose(ctx.iid, 'GPI Net Tap');
        if (yield* X.yn(iid, 'runner', 'gpiJack', 'GPI Net Tap: trash it to jack out?', 'Trash it and jack out', 'Carry on')) { X.trashRunner(iid, 'used'); ctx.S.jackNow = true; }
      }
    },
    bot: { gpi: () => 'no', gpiJack: () => 'no' },
    botPlay: () => 0.3
  });
  S('hernando_cortez', '11004', 'While the Corp has 10 credits or more, rezzing an ice costs 1 more for each of its subroutines.');
  on('hernando_cortez', { mod: { rezCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'ice' && X.C.credits >= 10 ? v + X.subsOf(ctx.iid).length : v }, botPlay: (pub) => pub.corp.credits >= 10 ? 1.2 : 0.3 });
  S('mirror', '11005', '+2 memory. Whenever you make a successful run on R&D, you may refill 1 spent recurring credit. One console only.', { console: true, memory: 2 });
  on('mirror', {
    on: {
      *success(X, iid, ctx) {
        if (ctx.sid !== 'rd') return;
        const spent = [X.R.ident].concat(X.R.rig).filter(i => { const r = X.dat(i).recur; return r && typeof r.n === 'number' && X.card(i).rc < r.n; });
        if (!spent.length) return;
        const t = yield* X.ask(iid, 'runner', 'mirror', 'Mirror: refill a recurring credit on which card?', spent.map(i => X.cardOpt(i)), { skip: 'No' });
        if (t) X.card(t).rc++;
      }
    },
    bot: { mirror: (pub, me, pr) => pr.options[0].id },
    botPlay: () => 0.8
  });
  S('dai_v', '11006', '2 credits, from stealth cards only: break every subroutine. 1 credit: +1 strength.', { brk: { type: 'any', cost: 2, n: 99, why: 'stealth' }, pump: { cost: 1, by: 1 } });
  on('dai_v', { botPlay: () => 0.5 });
  S('adap', '11007', 'Current. Whenever you steal an agenda, the Corp traces 0: if it fails, gain 1 credit for each agenda point in both score areas.');
  on('adap', { on: { *steal(X) { if (!(yield* X.trace(0, 'Another Day, Another Paycheck')).ok) gainR(X, X.points('corp') + X.points('runner'), 'adap'); } }, botPlay: () => 0.7 });
  S('deuces_wild', '11008', 'Do two of these, in the order you choose: gain 3 credits; draw 2; remove a tag; expose an ice and then run.');
  on('deuces_wild', {
    *play(X, iid) {
      const done = [];
      for (let n = 0; n < 2; n++) {
        const ice = X.corpPlaced().filter(i => X.dat(i).type === 'ice' && !X.card(i).rez);
        const opts = [{ id: 'gain', label: 'Gain 3 credits' }, { id: 'draw', label: 'Draw 2' }, { id: 'tag', label: 'Remove a tag', bad: X.R.tags ? null : 'No tags' }, { id: 'run', label: 'Expose an ice, then run', bad: noRun(X) ? 'Nowhere to run' : null }].filter(o => done.indexOf(o.id) < 0);
        const a = yield* X.ask(iid, 'runner', 'deuces', 'Deuces Wild: ' + (n ? 'and second?' : 'first?'), opts, { always: true });
        done.push(a);
        if (a === 'gain') gainR(X, 3, 'deuces_wild');
        if (a === 'draw') X.drawRunner(2, 'deuces_wild');
        if (a === 'tag' && X.R.tags) { X.R.tags--; X.log({ t: 'untag', n: 1, k: 'deuces_wild' }); }
        if (a === 'run') {
          if (ice.length) { const e = yield* X.ask(iid, 'runner', 'deucesExpose', 'Deuces Wild: expose which ice?', ice.map(i => ({ id: i, label: 'Unrezzed ice · ' + X.srvName(X.serverOf(i)) })), { always: true }); if (e) yield* X.expose(e, 'Deuces Wild'); }
          const sid = yield* X.ask(iid, 'runner', 'runOn', 'Deuces Wild: run which server?', runOpts(X), { pub: 'The Runner makes a run' });
          if (sid) yield* X.run(sid, { card: iid, via: 'deuces_wild' });
        }
      }
    },
    bot: { deuces: (pub, me, pr) => (pr.options.find(o => o.id === 'gain' && !o.bad) || pr.options.find(o => !o.bad)).id },
    botPlay: () => 1.6
  });
  S('injection_attack', '11009', 'Choose an installed icebreaker and run any server: it has +2 strength during the run.');
  on('injection_attack', {
    playBad: (X) => !X.breakers().length ? 'No icebreaker installed' : noRun(X) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const b = yield* X.ask(iid, 'runner', 'injection', 'Injection Attack: which icebreaker?', X.breakers().map(i => X.cardOpt(i)), { always: true });
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Injection Attack: run which server?', runOpts(X), { pub: 'The Runner plays Injection Attack' });
      if (sid) yield* X.run(sid, { card: iid, via: 'injection_attack', inj: b });
    },
    runMod: { breakerStr: (X, iid, v, ctx) => X.g.run && X.g.run.o.inj === ctx.iid ? v + 2 : v },
    botPlay: () => 0.9
  });
  S('fairchild_1', '11010', 'The Runner may lose a click to break one of its subroutines.', { clickBreak: { clicks: 1, n: 1 }, subs: [{ k: 's', n: 0, text: 'Pay 1 or trash an installed card' }, { k: 's', n: 0, text: 'Pay 1 or trash an installed card' }] });
  on('fairchild_1', { subs: [payOrTrash(1)], bot: { trashOwn: botTrashOwn } });
  S('sherlock_2', '11011', 'The Runner may lose two clicks to break up to two of its subroutines.', { clickBreak: { clicks: 2, n: 2 },
    subs: [{ k: 'trace', n: 4, do: { k: 's', n: 0 }, text: 'a program to the bottom of the stack' }, { k: 'trace', n: 4, do: { k: 's', n: 0 }, text: 'a program to the bottom of the stack' }, { k: 'tag', n: 1 }] });
  on('sherlock_2', {
    subs: [function* (X, iid) {
      if (!X.programs().length) return null;
      const t = yield* X.ask(iid, 'corp', 'sherlock2', 'Sherlock 2.0: which program goes to the bottom of the Runner’s stack?', X.programs().map(i => X.cardOpt(i)), { always: true });
      if (t) { toGrip(X, t); X.lift(t); X.R.stack.push(t); X.log({ t: 'note', side: 'corp', text: 'Sherlock 2.0: ' + X.nameOf(t) + ' goes to the bottom of the stack' }); }
      return null;
    }],
    bot: { sherlock2: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id }
  });
  S('hyoubu', '11012', 'The first time each turn secretly spent credits are shown, gain as many as you spent.');
  on('hyoubu', { on: { psi(X, iid, ctx) { if (X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; gainC(X, ctx.cb, 'hyoubu'); } } });
  S('chrysalis', '11013', 'Accessed anywhere but Archives, the Runner meets it.', { subs: [{ k: 'net', n: 2 }] });
  on('chrysalis', metOnAccess);
  S('georgia', '11014', 'Whenever a run on this server is unsuccessful, 1 net damage. 2 credits: move her to another server.');
  on('georgia', {
    on: { *runEnd(X, iid, ctx) { const sv = X.serverOf(iid); if (sv && ctx.sid === sv.id && ctx.how !== 'success') yield* X.damage('net', 1, 'Georgia Emelyov'); } },
    abils: (X, iid) => [{ label: 'Georgia Emelyov: move her to another server', cost: 2, bad: X.C.servers.length > 1 ? (X.avail('corp', 'any') < 2 ? 'Costs 2' : null) : 'No other server' }],
    *use(X, iid) {
      const here = X.serverOf(iid);
      const t = yield* X.ask(iid, 'corp', 'georgia', 'Georgia Emelyov: move her to which server?', X.C.servers.filter(sv => sv !== here).map(sv => ({ id: sv.id, label: sv.name })));
      if (!t) return;
      X.lift(iid); X.server(t).root.push(iid);
      X.log({ t: 'note', side: 'corp', text: 'Georgia Emelyov moves to ' + X.server(t).name });
    },
    botAbil: () => -1
  });
  S('watchdog', '11015', 'The first ice you rez each turn costs 1 less for each tag the Runner has.');
  on('watchdog', {
    on: { rez(X, iid, ctx) { if (X.dat(ctx.iid).type === 'ice') X.card(iid).x.turn = X.g.turnN; } },
    mod: { rezCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'ice' && X.card(iid).x.turn !== X.g.turnN ? v - X.R.tags : v }
  });
  S('hard_hitting', '11016', 'Terminal. Only if the Runner made a run last turn. Trace 4: 4 tags.');
  on('hard_hitting', { playBad: (X) => X.R.last.ran ? null : 'Only if the Runner ran on their last turn', *play(X) { if ((yield* X.trace(4, 'Hard-Hitting News')).ok) yield* X.giveTags(4, 'Hard-Hitting News'); }, botPlay: () => 1.8 });
  S('ctm', '11017', 'The first time each turn the Runner trashes one of your installed cards, you may trace 4: a tag they cannot avoid.');
  on('ctm', {
    on: {
      *runnerTrashed(X, iid, ctx) {
        if (!ctx.installed || X.card(iid).x.turn === X.g.turnN) return;
        X.card(iid).x.turn = X.g.turnN;
        if (!(yield* X.yn(iid, 'corp', 'ctm', 'Controlling the Message: trace 4 for a tag?', 'Trace 4', 'No'))) return;
        if ((yield* X.trace(4, 'Controlling the Message')).ok) { X.R.tags++; X.log({ t: 'tags', n: 1, total: X.R.tags, cause: 'Controlling the Message' }); }
      }
    },
    bot: { ctm: () => 'yes' }
  });
  S('crisis_management', '11018', 'While the Runner is tagged: when your turn begins, 1 meat damage.');
  on('crisis_management', { on: { *corpTurnBegin(X, iid) { if (X.C.score.indexOf(iid) >= 0 && X.tagged()) yield* X.damage('meat', 1, 'Crisis Management'); } } });
  S('stock_buyback', '11019', 'Terminal. Gain 3 credits for each agenda in the Runner’s score area.');
  on('stock_buyback', { play(X) { gainC(X, 3 * X.R.score.filter(i => X.dat(i).type === 'agenda').length, 'stock_buyback'); }, botPlay: (pub) => pub.runner.score.length >= 2 ? 2 : -1 });
  S('sandburg', '11020', 'While you have 10 credits or more, every ice has +1 strength for each 5 credits you have.');
  on('sandburg', { mod: { iceStr: (X, iid, v) => X.C.credits >= 10 ? v + Math.floor(X.C.credits / 5) : v } });

  /* ================================================================ BLOOD MONEY */
  S('credit_crash', '11021', 'Run any server. The first card you access that is not an agenda is trashed free — unless the Corp pays its rez or play cost.');
  on('credit_crash', Object.assign(anyRun('Credit Crash'), {
    *play(X, iid) {
      X.linger(iid);
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Credit Crash: run which server?', runOpts(X), { pub: 'The Runner plays Credit Crash' });
      if (sid) yield* X.run(sid, { card: iid, via: 'credit_crash' });
    },
    on: {
      *access(X, iid, ctx) {
        const S0 = X.g.run;
        if (!S0 || S0.o.card !== iid || S0.crash || ctx.from === 'arch' || X.dat(ctx.iid).type === 'agenda') return;
        S0.crash = true;
        const cost = typeof X.dat(ctx.iid).cost === 'number' ? X.dat(ctx.iid).cost : 0;
        if (X.C.credits >= cost && (yield* X.yn(iid, 'corp', 'crash', 'Credit Crash: pay ' + cost + ' to keep ' + X.nameOf(ctx.iid) + '?', 'Pay ' + cost, 'Let it go'))) { X.pay('corp', cost, 'any'); X.log({ t: 'note', side: 'corp', text: 'The Corp pays ' + cost + ' to keep ' + X.nameOf(ctx.iid) }); return; }
        X.log({ t: 'trash', side: 'corp', k: X.card(ctx.iid).k, price: 0, by: 'credit_crash' });
        X.toArchives(ctx.iid, true);
        ctx.seen.did = 'trashed'; ctx.seen.gone = true;
      }
    },
    bot: { crash: (pub, me, pr) => /pay (\d+)/i.test(pr.why) && +pr.why.match(/pay (\d+)/i)[1] <= 2 ? 'yes' : 'no' },
    botPlay: () => 0.8
  }));
  S('rumor_mill', '11022', 'Current. Unique assets and upgrades (not regions) have no printed abilities.');
  on('rumor_mill', { botPlay: (pub) => pub.corp.servers.some(s => s.root.some(c => c.k && D.CARDS[c.k] && D.CARDS[c.k].uniq)) ? 1.2 : 0.2 });
  S('nfr', '11023', '1 credit: break one barrier subroutine. +1 strength for each power counter; a counter whenever it fully breaks an ice.', { brk: { type: 'barrier', cost: 1, n: 1 } });
  on('nfr', growsOnFull);
  S('paperclip', '11024', 'As you meet a barrier, you may install it from your heap. X credits: +X strength, then break up to X barrier subroutines.', SCRIPTED('barrier'));
  on('paperclip', growBreaker('barrier', 1, 1, 1, true));
  S('golden', '11025', '2 credits: break up to 2 sentry subroutines. 2 credits: +4 strength. 2 credits, back to your grip: derez a sentry it fully broke this encounter.', { brk: { type: 'sentry', cost: 2, n: 2 }, pump: { cost: 2, by: 4 } });
  on('golden', derezBack('sentry'));
  S('temujin', '11026', 'When installed, choose a server and put 20 credits on it. Whenever a run on that server succeeds, take 4. Trashed when empty.', { load: 20 });
  on('temujin', {
    *onInstall(X, iid) { X.card(iid).x.sid = yield* X.ask(iid, 'runner', 'temujin', 'Temüjin Contract: which server?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name })), { always: true }); },
    on: { success(X, iid, ctx) { if (ctx.S.sid !== X.card(iid).x.sid) return; const c = X.card(iid), n = Math.min(4, c.cred); c.cred -= n; gainR(X, n, 'temujin'); if (c.cred <= 0) X.trashRunner(iid, 'empty'); } },
    show: (X, iid) => X.card(iid).x.sid ? 'on ' + X.srvName(X.server(X.card(iid).x.sid)) + ' · ' + X.card(iid).cred + ' left' : null,
    bot: { temujin: () => 'hq' },
    botPlay: () => 1.6
  });
  S('khan', '11027', 'The first time each turn you pass an ice, you may install an icebreaker from your grip for 1 less.');
  on('khan', {
    on: {
      *passIce(X, iid) {
        if (X.card(iid).x.turn === X.g.turnN) return;
        X.card(iid).x.turn = X.g.turnN;
        const brk = X.R.grip.filter(i => X.dat(i).brk);
        if (!brk.length) return;
        const t = yield* X.ask(iid, 'runner', 'khan', 'Khan: install an icebreaker for 1 less?', brk.map(i => X.cardOpt(i, null, X.installCost(i, 1) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 1) ? 'Costs ' + X.installCost(i, 1) : null))), { skip: 'No' });
        if (t) yield* X.runnerInstall(t, { discount: 1 });
      }
    },
    bot: { khan: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' }
  });
  S('data_breach', '11028', 'Run R&D. If it succeeds, you may run R&D again when it ends.');
  on('data_breach', {
    playBad: (X) => X.runBad('rd', 1),
    *play(X, iid) { yield* X.run('rd', { card: iid, via: 'data_breach' }); },
    *runEnd(X, iid, ctx) { if (ctx.how === 'success' && !ctx.S.o.again && !X.runBad('rd') && (yield* X.yn(iid, 'runner', 'dataBreach', 'Data Breach: run R&D again?', 'Run again', 'No'))) yield* X.run('rd', { card: iid, via: 'data_breach', again: true }); },
    bot: { dataBreach: () => 'yes' },
    botPlay: () => 1.4
  });
  S('algo_trading', '11029', 'When your turn begins, you may move up to 3 credits onto it; then, with 6 or more on it, 2 more from the bank. A click, trash it: take them all.');
  on('algo_trading', Object.assign(fund('runner', 'algo_trading'), {
    abils: (X, iid) => [{ label: 'Algo Trading: trash it — take ' + X.card(iid).cred, clicks: 1 }],
    use(X, iid) { const n = X.card(iid).cred; X.trashRunner(iid, 'used'); gainR(X, n, 'algo_trading'); },
    botAbil: (pub, me, o) => +((o.label.match(/take (\d+)/) || [])[1] || 0) >= 12 ? 2 : -1, botPlay: () => 0.5
  }));
  S('beth', '11030', 'When your turn begins: the Corp has 5–9 credits, gain 1; 10–14, draw a card; 15 or more, gain a click.');
  on('beth', { on: { runnerTurnBegin(X) { const c = X.C.credits; if (c >= 15) { X.R.clicks++; X.log({ t: 'clicks', side: 'runner', n: 1, k: 'beth' }); } else if (c >= 10) X.drawRunner(1, 'beth'); else if (c >= 5) gainR(X, 1, 'beth'); } }, botPlay: () => 1 });
  S('fairchild_2', '11031', 'The Runner may lose two clicks to break up to two of its subroutines.', { clickBreak: { clicks: 2, n: 2 }, subs: [{ k: 's', n: 0, text: 'Pay 2 or trash an installed card' }, { k: 's', n: 0, text: 'Pay 2 or trash an installed card' }, { k: 'brain', n: 1 }] });
  on('fairchild_2', { subs: [payOrTrash(2)], bot: { trashOwn: botTrashOwn } });
  S('aiki', '11032', '', { subs: [{ k: 's', n: 0, text: 'Psi game: if the bids differ, the Runner draws 2' }, { k: 'net', n: 1 }, { k: 'net', n: 1 }] });
  on('aiki', { subs: [function* (X) { if (yield* X.psi('Aiki')) X.drawRunner(2, 'aiki'); return null; }] });
  S('enforcing_loyalty', '11033', 'Double. Trace 3: trash an installed card that is not of the Runner’s faction.');
  const offFaction = X => X.R.rig.filter(i => X.card(i).x.fd || X.dat(i).fac !== X.dat(X.R.ident).fac);
  on('enforcing_loyalty', {
    playBad: (X) => offFaction(X).length ? null : 'Nothing of another faction installed',
    *play(X, iid) {
      if (!(yield* X.trace(3, 'Enforcing Loyalty')).ok) return;
      const t = yield* X.ask(iid, 'corp', 'loyalty', 'Enforcing Loyalty: trash which card?', offFaction(X).map(i => X.cardOpt(i)), { always: true });
      if (t) yield* X.corpTrashes(t, 'Enforcing Loyalty');
    },
    botPlay: () => 0.6
  });
  S('hatchet_job', '11034', 'Double. Trace 5: an installed card that is not virtual goes back to the Runner’s grip.');
  on('hatchet_job', {
    playBad: (X) => X.R.rig.some(i => !kw(X, i, /Virtual/)) ? null : 'Nothing to send back',
    *play(X, iid) {
      if (!(yield* X.trace(5, 'Hatchet Job')).ok) return;
      const t = yield* X.ask(iid, 'corp', 'hatchet', 'Hatchet Job: which card goes back to the grip?', X.R.rig.filter(i => !kw(X, i, /Virtual/)).map(i => X.cardOpt(i)), { always: true });
      if (t) { toGrip(X, t); X.log({ t: 'note', side: 'corp', text: 'Hatchet Job: ' + X.nameOf(t) + ' goes back to the grip' }); }
    },
    bot: { hatchet: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id },
    botPlay: () => 0.6
  });
  S('special_report', '11035', 'Shuffle any number of cards from HQ into R&D, then draw that many.');
  on('special_report', {
    *play(X, iid) {
      if (!X.C.hq.length) return;
      const ts = yield* X.ask(iid, 'corp', 'specialReport', 'Special Report: shuffle which cards into R&D?', X.C.hq.map(i => X.cardOpt(i)), { multi: true, min: 0, max: X.C.hq.length });
      for (const t of ts) { X.lift(t); X.C.rd.push(t); }
      X.shuffleRD(); X.drawCorp(ts.length, 'special_report');
    },
    bot: { specialReport: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type === 'operation').map(o => o.id) },
    botPlay: () => -1
  });
  S('ci_fund', '11036', 'When your turn begins, you may move up to 3 credits onto it; then, with 6 or more on it, 2 more from the bank. 2 credits, trash it: take them all.');
  on('ci_fund', Object.assign(fund('corp', 'ci_fund'), {
    abils: (X, iid) => [{ label: 'C.I. Fund: trash it — take ' + X.card(iid).cred, cost: 2, bad: X.avail('corp', 'any') < 2 ? 'Costs 2' : null }],
    use(X, iid) { const n = X.card(iid).cred; X.toArchives(iid, true); gainC(X, n, 'ci_fund'); },
    botAbil: (pub, me, o) => +((o.label.match(/take (\d+)/) || [])[1] || 0) >= 10 ? 2 : -1
  }));
  S('liquidation', '11037', 'Double. Trash any number of your rezzed cards: gain 3 credits for each.');
  on('liquidation', {
    playBad: (X) => X.corpPlaced().some(i => X.card(i).rez) ? null : 'Nothing rezzed',
    *play(X, iid) {
      const pool = X.corpPlaced().filter(i => X.card(i).rez);
      const ts = yield* X.ask(iid, 'corp', 'liquidation', 'Liquidation: trash which rezzed cards (3 credits each)?', pool.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { multi: true, min: 0, max: pool.length });
      for (const t of ts) if (X.isInstalled(t)) X.toArchives(t, true);
      gainC(X, 3 * ts.length, 'liquidation');
    },
    bot: { liquidation: () => [] },
    botPlay: () => -1
  });
  S('bon', '11038', 'The first time each turn an encounter with an advanced ice ends, 1 meat damage.');
  on('bon', { on: { *encounterEnd(X, iid, ctx) { if (X.card(ctx.iid).adv > 0 && X.card(iid).x.turn !== X.g.turnN) { X.card(iid).x.turn = X.g.turnN; yield* X.damage('meat', 1, 'Builder of Nations'); } } } });
  S('financial_collapse', '11039', 'Only if the Runner has 6 credits or more. They lose 2 for each installed resource — unless they trash a resource.');
  on('financial_collapse', {
    playBad: (X) => X.R.credits >= 6 ? (X.rigOf('resource').length ? null : 'The Runner has no resources') : 'Only if the Runner has 6 credits or more',
    *play(X, iid) {
      const res = X.rigOf('resource');
      const t = yield* X.ask(iid, 'runner', 'collapse', 'Financial Collapse: trash a resource, or lose ' + 2 * res.length + ' credits?', res.map(i => X.cardOpt(i, 'Trash ' + X.nameOf(i))), { skip: 'Lose ' + 2 * res.length });
      if (t) { X.trashRunner(t, 'financial_collapse'); return; }
      loseR(X, 2 * res.length, 'Financial Collapse');
    },
    bot: { collapse: (pub, me, pr) => pr.options.length >= 2 ? pr.options[0].id : 'skip' },
    botPlay: (pub) => pub.runner.credits >= 6 ? 1 : -1
  });
  S('prisec', '11040', 'Ambush. Accessed while installed, you may pay 2: 1 tag and 1 meat damage.');
  on('prisec', {
    *onAccess(X, iid, ctx) {
      if (!ctx.installed || X.C.credits < 2) return;
      if (!(yield* X.yn(iid, 'corp', 'prisec', 'Prisec: pay 2 for a tag and 1 meat damage?', 'Spring it (2)', 'Let it be'))) return;
      X.pay('corp', 2, 'any'); X.log({ t: 'ambush', k: 'prisec' }); ctx.seen.did = 'sprung';
      yield* X.giveTags(1, 'Prisec'); yield* X.damage('meat', 1, 'Prisec');
    },
    bot: { prisec: () => 'yes' }
  });

  /* ================================================================ ESCALATION */
  S('obelus', '11041', '+1 memory, +1 hand size per tag. The first successful run on HQ or R&D each turn: when it ends, draw a card for each card you accessed. One console only.', { console: true, memory: 1 });
  on('obelus', {
    mod: { runHand: (X, iid, v) => v + X.R.tags },
    on: { runEnd(X, iid, ctx) { if (ctx.how !== 'success' || (ctx.sid !== 'hq' && ctx.sid !== 'rd') || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; if (ctx.S.seen.length) X.drawRunner(ctx.S.seen.length, 'obelus'); } },
    botPlay: () => 1.2
  });
  S('black_orchestra', '11042', 'As you meet a code gate, you may install it from your heap. 3 credits: +2 strength, then break up to 2 code gate subroutines.', SCRIPTED('code gate'));
  on('black_orchestra', growBreaker('code gate', 3, 2, 2));
  S('omar', '11043', 'Once a turn, a click: run Archives — if it succeeds, it becomes a run on HQ or R&D.');
  on('omar', {
    abils: (X, iid) => [{ label: 'Omar Keung: run Archives (as HQ or R&D if it succeeds)', clicks: 1, bad: X.card(iid).x.turn === X.g.turnN ? 'Once a turn' : X.runBad('arch', 1) }],
    *use(X, iid) { X.card(iid).x.turn = X.g.turnN; yield* X.run('arch', { via: 'omar', omar: true }); },
    bot: { omar: () => 'hq' },
    botAbil: () => 1.3
  });
  S('peregrine', '11044', '1 credit: break one code gate subroutine. 3 credits: +3 strength. 2 credits, back to your grip: derez a code gate it fully broke this encounter.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 3, by: 3 } });
  on('peregrine', derezBack('code gate'));
  S('houdini', '11045', '1 credit: break one code gate subroutine. 2 credits (stealth): +4 strength for the run.', { brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 2, by: 4, run: true, why: 'stealth' } });
  S('net_mercur', '11046', 'The first time in a run you spend credits from a stealth card, put a credit on it or draw a card. Its credits pay for anything.');
  on('net_mercur', {
    spend: () => true,
    sync: {
      stealthSpent(X, iid) {
        if (!X.g.run || X.g.run.mercur) return;
        X.g.run.mercur = true;
        X.g.pending.push({ iid, f: function* (X2, i2) { if (!X2.isInstalled(i2)) return; const a = yield* X2.ask(i2, 'runner', 'mercur', 'Net Mercur: a credit on it, or draw a card?', [{ id: 'cred', label: 'A credit on it' }, { id: 'draw', label: 'Draw a card' }], { always: true }); if (a === 'draw') X2.drawRunner(1, 'net_mercur'); else X2.card(i2).cred++; } });
      }
    },
    show: (X, iid) => X.card(iid).cred ? X.card(iid).cred + ' on it' : null,
    bot: { mercur: () => 'cred' },
    botPlay: () => 0.5
  });
  S('find_truth', '11047', 'Directive. Every card you draw is shown. The first successful run each turn, you may look at the top card of R&D.');
  on('find_truth', {
    sync: { runnerDrew(X, iid, ctx) { if (X.R.rig.indexOf(iid) >= 0 && ctx.iids && ctx.iids.length) X.reveal('runner', ctx.iids, 'Find the Truth'); } },
    on: { *success(X, iid) { if (X.card(iid).x.turn === X.g.turnN || !X.C.rd.length) return; X.card(iid).x.turn = X.g.turnN; if (yield* X.yn(iid, 'runner', 'findTruth', 'Find the Truth: look at the top card of R&D?', 'Look', 'No')) { X.R.peek = { iid: X.C.rd[0], k: X.card(X.C.rd[0]).k, turn: X.g.turnN }; X.log({ t: 'peek', k: 'find_truth' }); } } },
    bot: { findTruth: () => 'yes' },
    botPlay: () => 0.5
  });
  S('first_responders', '11048', '2 credits: draw a card — only after the Corp’s cards have damaged you this turn.');
  on('first_responders', {
    on: { damaged(X) { X.R.flags.hurt = true; } },
    abils: (X) => [{ label: 'First Responders: draw a card', cost: 2, bad: !X.R.flags.hurt ? 'Only after you took damage this turn' : X.avail('runner', 'any') < 2 ? 'Costs 2' : null }],
    use(X) { X.drawRunner(1, 'first_responders'); },
    botAbil: () => 0.8, botPlay: () => 0.3
  });
  S('fairchild_3', '11049', 'The Runner may lose three clicks to break up to three of its subroutines.', { clickBreak: { clicks: 3, n: 3 }, subs: [{ k: 's', n: 0, text: 'Pay 3 or trash an installed card' }, { k: 's', n: 0, text: 'Pay 3 or trash an installed card' }, { k: 's', n: 1, text: '1 brain damage or end the run (the Corp chooses)' }] });
  on('fairchild_3', {
    subs: [payOrTrash(3), function* (X, iid) { const a = yield* X.ask(iid, 'corp', 'fairchild3', 'Fairchild 3.0: 1 brain damage, or end the run?', [{ id: 'brain', label: '1 brain damage' }, { id: 'end', label: 'End the run' }], { always: true }); if (a === 'end') return 'end'; yield* X.damage('brain', 1, 'Fairchild 3.0'); return null; }],
    bot: { trashOwn: botTrashOwn, fairchild3: () => 'end' }
  });
  S('ark_lockdown', '11050', 'Name a card in the Runner’s heap: every copy there leaves the game.');
  on('ark_lockdown', {
    playBad: (X) => X.R.heap.length ? null : 'The heap is empty',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'ark', 'Ark Lockdown: which card?', X.dedupe(X.R.heap.map(i => X.cardOpt(i))), { always: true });
      const all = t ? X.R.heap.filter(i => X.card(i).k === X.card(t).k) : [];
      for (const i of all) { X.lift(i); X.R.gone.push(i); }
      if (all.length) X.log({ t: 'note', side: 'corp', text: 'Ark Lockdown: ' + X.plural(all.length, 'copy', 'copies') + ' of ' + X.nameOf(all[0]) + ' leave the game' });
    },
    botPlay: () => 0.3
  });
  S('hellion_beta', '11051', 'Only if the Runner trashed a card they accessed last turn. Trace 2: trash 2 installed cards that are not programs. If it fails, take 1 bad publicity.');
  on('hellion_beta', {
    playBad: (X) => X.R.last.trashedAccess ? null : 'Only if the Runner trashed an accessed card last turn',
    *play(X, iid) {
      if (!(yield* X.trace(2, 'Hellion Beta Test')).ok) { yield* X.takeBP(1, 'Hellion Beta Test'); return; }
      for (let n = 0; n < 2; n++) {
        const pool = X.R.rig.filter(i => X.dat(i).type !== 'program' || X.card(i).x.fd);
        if (!pool.length) break;
        const t = yield* X.ask(iid, 'corp', 'hellion', 'Hellion Beta Test: trash which card (' + (n + 1) + ' of 2)?', pool.map(i => X.cardOpt(i)), { always: true });
        if (t) yield* X.corpTrashes(t, 'Hellion Beta Test');
      }
    },
    botPlay: () => 1
  });
  S('kusanagi', '11052', 'When scored, an agenda counter for each advancement token over 2. Spend one: an ice gains “1 net damage” after its other subroutines for the run.');
  on('kusanagi', {
    onScore(X, iid, ctx) { X.card(iid).agenda = Math.max(0, ctx.over || 0); },
    winOpts: (X, iid, ctx) => X.g.run && X.card(iid).agenda > 0 && ctx.where === 'ice' ? [{ label: 'Project Kusanagi: spend a counter — ' + X.nameOf(ctx.iid) + ' gains 1 net damage' }] : [],
    winUse(X, iid, n, ctx) { X.spendAgenda(iid); (X.g.run.kus = X.g.run.kus || []).push(ctx.iid); X.log({ t: 'note', side: 'corp', text: 'Project Kusanagi: ' + X.nameOf(ctx.iid) + ' gains “1 net damage” this run' }); },
    mod: { subs: (X, iid, v, ctx) => { const n = X.g.run && X.g.run.kus ? X.g.run.kus.filter(i => i === ctx.iid).length : 0; if (!n) return v; const out = v.slice(); for (let k = 0; k < n; k++) out.push({ k: 'net', n: 1 }); return out; } },
    botWin: () => true
  });
  S('dna_tracker', '11053', '', { subs: [{ k: 's', n: 0, text: '1 net damage; the Runner loses 2 credits' }, { k: 's', n: 0, text: '1 net damage; the Runner loses 2 credits' }, { k: 's', n: 0, text: '1 net damage; the Runner loses 2 credits' }] });
  on('dna_tracker', { subs: [function* (X) { yield* X.damage('net', 1, 'DNA Tracker'); loseR(X, 2, 'DNA Tracker'); return null; }] });
  S('jpu', '11054', 'Whenever the Runner takes net damage, the top card of their stack is trashed.');
  on('jpu', { on: { damaged(X, iid, ctx) { if (ctx.kind === 'net' && ctx.n > 0) mill(X, 1); } } });
  S('alexa_belsky', '11055', 'Trash her: shuffle HQ into R&D — the Runner may pay 2 credits for each random card that stays.');
  on('alexa_belsky', {
    abils: (X) => [{ label: 'Alexa Belsky: trash her — shuffle HQ into R&D', bad: X.C.hq.length ? null : 'HQ is empty' }],
    *use(X, iid) {
      X.toArchives(iid, true);
      const most = Math.min(X.C.hq.length, Math.floor(X.avail('runner', 'any') / 2));
      let keep = 0;
      if (most) { const opts = []; for (let n = 0; n <= most; n++) opts.push({ id: String(n), label: n ? 'Pay ' + 2 * n + ': ' + X.plural(n, 'card') + ' stay' : 'Pay nothing' }); keep = +(yield* X.ask(iid, 'runner', 'alexa', 'Alexa Belsky: pay to keep cards in HQ?', opts, { always: true })); }
      X.pay('runner', 2 * keep, 'any');
      const stay = [];
      for (let n = 0; n < keep; n++) { const pool = X.C.hq.filter(i => stay.indexOf(i) < 0); stay.push(pool[Math.floor(X.rand() * pool.length)]); }
      for (const t of X.C.hq.filter(i => stay.indexOf(i) < 0)) { X.lift(t); X.C.rd.push(t); }
      X.shuffleRD();
      X.log({ t: 'note', side: 'corp', text: 'Alexa Belsky shuffles HQ into R&D (' + X.plural(stay.length, 'card') + ' stay)' });
    },
    bot: { alexa: () => '0' },
    botAbil: () => -1
  });
  S('observe_destroy', '11056', 'Only if the Runner has fewer than 6 credits. As an extra cost, remove one of their tags. Trash one of their installed cards.');
  on('observe_destroy', {
    playBad: (X) => X.R.credits >= 6 ? 'Only if the Runner has fewer than 6 credits' : !X.R.tags ? 'Needs a tag to remove' : X.R.rig.length ? null : 'Nothing installed',
    *play(X, iid) {
      X.R.tags--; X.log({ t: 'untag', n: 1, k: 'observe_destroy' });
      const t = yield* X.ask(iid, 'corp', 'observe', 'Observe and Destroy: trash which card?', X.R.rig.map(i => X.cardOpt(i)), { always: true });
      if (t) yield* X.corpTrashes(t, 'Observe and Destroy');
    },
    bot: { observe: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id },
    botPlay: () => 1.4
  });
  S('service_outage', '11057', 'Current. The Runner’s first run each turn costs 1 credit more.');
  on('service_outage', { mod: { runCost: (X, iid, v) => v + 1 }, botPlay: () => 1 });
  S('boom', '11058', 'Double. Only while the Runner has 2 tags or more. 7 meat damage.');
  on('boom', { playBad: (X) => X.R.tags >= 2 ? null : 'Needs 2 tags', *play(X) { yield* X.damage('meat', 7, 'BOOM!'); }, botPlay: () => 8 });
  S('door_to_door', '11059', 'Current. When the Runner’s turn begins, trace 1: 1 meat damage if they are tagged, otherwise a tag.');
  on('door_to_door', { on: { *runnerTurnBegin(X) { if (!(yield* X.trace(1, 'Door to Door')).ok) return; if (X.tagged()) yield* X.damage('meat', 1, 'Door to Door'); else yield* X.giveTags(1, 'Door to Door'); } }, botPlay: () => 1.2 });
  S('scarcity', '11060', 'Current. Every resource costs 2 more to install.');
  on('scarcity', { mod: { installCost: (X, iid, v, ctx) => X.dat(ctx.iid).type === 'resource' ? v + 2 : v }, botPlay: () => 1 });

  /* ================================================================ INTERVENTION */
  S('en_passant', '11061', 'Only after a successful run this turn. Trash an unrezzed ice you passed in your last run.');
  const passedHidden = X => (X.R.lastPassed || []).filter(i => X.isInstalled(i) && !X.card(i).rez && X.dat(i).type === 'ice');
  on('en_passant', {
    playBad: (X) => !X.R.flags.success ? 'Only after a successful run this turn' : passedHidden(X).length ? null : 'You passed no unrezzed ice',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'enPassant', 'En Passant: trash which ice?', passedHidden(X).map(i => ({ id: i, label: 'Unrezzed ice · ' + X.srvName(X.serverOf(i)) })), { always: true });
      if (t) { X.toArchives(t, false); X.log({ t: 'trashedIce', by: 'en_passant' }); }
    },
    botPlay: () => 3
  });
  S('frantic_coding', '11062', 'Look at the top 10 cards of your stack: you may install a program among them for 5 less; trash the rest.');
  on('frantic_coding', {
    playBad: (X) => X.R.stack.length ? null : 'Your stack is empty',
    *play(X, iid) {
      const top = X.R.stack.slice(0, 10);
      const progs = top.filter(i => X.dat(i).type === 'program');
      const t = progs.length ? yield* X.ask(iid, 'runner', 'frantic', 'Frantic Coding: install which program (5 less)?', progs.map(i => X.cardOpt(i, null, X.installCost(i, 5) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, 5) ? 'Costs ' + X.installCost(i, 5) : null))), { skip: 'None' }) : null;
      if (t) yield* X.runnerInstall(t, { discount: 5 });
      for (const i of top) if (X.R.stack.indexOf(i) >= 0) { X.lift(i); X.card(i).up = true; X.R.heap.push(i); }
    },
    bot: { frantic: (pub, me, pr) => (pr.options.find(o => !o.bad && (D.CARDS[o.card] || {}).brk) || pr.options.find(o => !o.bad) || {}).id || 'skip' },
    botPlay: () => 0.3
  });
  S('gauntlet', '11063', '+2 memory. As you access HQ, 1 more card for each ice protecting HQ you fully broke this run. One console only.', { console: true, memory: 2 });
  on('gauntlet', {
    on: { fullyBroken(X, iid, ctx) { if (X.g.run) (X.g.run.fully = X.g.run.fully || []).push(ctx.iid); } },
    mod: { accessHQ: (X, iid, v, ctx) => { const S0 = ctx.S || X.g.run; const hq = X.server('hq'); return v + (S0 && S0.fully && hq ? S0.fully.filter(i => hq.ice.indexOf(i) >= 0).length : 0); } },
    botPlay: () => 1
  });
  S('saker', '11064', '1 credit: break one barrier subroutine. 2 credits: +2 strength. 2 credits, back to your grip: derez a barrier it fully broke this encounter.', { brk: { type: 'barrier', cost: 1, n: 1 }, pump: { cost: 2, by: 2 } });
  on('saker', derezBack('barrier'));
  S('blockade_runner', '11065', 'Two clicks: draw 3, then shuffle a card from your grip into your stack.');
  on('blockade_runner', {
    abils: () => [{ label: 'Blockade Runner: draw 3, put one back', clicks: 2 }],
    *use(X, iid) {
      X.drawRunner(3, 'blockade_runner');
      if (!X.R.grip.length) return;
      const t = yield* X.ask(iid, 'runner', 'blockade', 'Blockade Runner: shuffle which card into your stack?', X.R.grip.map(i => X.cardOpt(i)), { always: true });
      if (t) { X.lift(t); X.R.stack.push(t); X.shuffleStack(true); }
    },
    botAbil: (pub, me) => (me.hand || []).length <= 2 ? 1.2 : -1, botPlay: () => 0.5
  });
  S('smoke', '11066', '1 recurring credit for using icebreakers (a stealth credit).', { recur: { n: 1, for: 'stealth' } });
  S('top_hat', '11067', 'After a successful run on R&D, instead of accessing, you may choose one of the top 5 cards and access it.');
  on('top_hat', {
    on: {
      *success(X, iid, ctx) {
        if (ctx.sid !== 'rd' || ctx.S.replace || X.C.rd.length < 2) return;
        if (!(yield* X.yn(iid, 'runner', 'topHat', 'Top Hat: access one of the top 5 cards of R&D instead?', 'Choose one', 'Access as usual'))) return;
        ctx.S.replace = function* () {
          const n = Math.min(5, X.C.rd.length);
          const opts = []; for (let k = 0; k < n; k++) opts.push({ id: String(k), label: k ? 'Card ' + (k + 1) + ' from the top' : 'The top card' });
          const p = +(yield* X.ask(iid, 'runner', 'topHatPick', 'Top Hat: access which card?', opts, { always: true }));
          const t = X.C.rd[p];
          if (t) yield* X.accessOne(t, 'rd', 'rd');
          if (X.g.run && X.g.run.seen.length) yield* X.hold({ k: 'access', sid: 'rd', seen: JSON.parse(JSON.stringify(X.g.run.seen)) });
        };
      }
    },
    bot: { topHat: () => 'no', topHatPick: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botPlay: () => 0.4
  });
  S('blackstone', '11068', '1 credit: break one barrier subroutine. 3 credits (stealth): +4 strength for the run.', { brk: { type: 'barrier', cost: 1, n: 1 }, pump: { cost: 3, by: 4, run: true, why: 'stealth' } });
  S('gov_investigations', '11069', 'Current. No one may spend 2 credits in secret.');
  on('gov_investigations', { mod: { noBid2: () => true }, botPlay: () => 0.4 });
  S('citadel', '11070', 'As your turn ends while you are tagged, the Corp traces 1: if it fails, remove a tag. Trash it and your grip: prevent all meat damage.');
  on('citadel', {
    on: { *runnerTurnEnd(X) { if (!X.R.tags) return; if (!(yield* X.trace(1, 'Citadel Sanctuary')).ok) { X.R.tags--; X.log({ t: 'untag', n: 1, k: 'citadel' }); } } },
    *prevent(X, iid, ctx) {
      if (ctx.kind !== 'meat') return 0;
      if (!(yield* X.yn(iid, 'runner', 'citadel', 'Citadel Sanctuary: trash it and your grip to prevent all ' + ctx.n + ' meat damage?', 'Prevent it', 'Take it'))) return 0;
      X.trashRunner(iid, 'used');
      for (const t of X.R.grip.splice(0)) { X.card(t).up = true; X.R.heap.push(t); }
      X.log({ t: 'prevent', side: 'runner', k: 'citadel', n: ctx.n });
      return ctx.n;
    },
    bot: { citadel: (pub, me, pr) => /all (\d+)/.test(pr.why) && +pr.why.match(/all (\d+)/)[1] >= (me.hand || []).length ? 'yes' : 'no' },
    botPlay: () => 0.6
  });
  S('wetwork_refit', '11071', 'Put it on a rezzed bioroid ice: that ice gains “1 brain damage” before its other subroutines.');
  const bioroidIce = X => X.corpPlaced().filter(i => X.dat(i).type === 'ice' && X.card(i).rez && kw(X, i, /Bioroid/));
  on('wetwork_refit', {
    playBad: (X) => bioroidIce(X).length ? null : 'No rezzed bioroid ice',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'wetwork', 'Wetwork Refit: on which bioroid ice?', bioroidIce(X).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (!t) return;
      X.hostCorp(iid, t); X.card(iid).rez = true; X.card(iid).up = true;
      X.log({ t: 'note', side: 'corp', text: 'Wetwork Refit goes on ' + X.nameOf(t) });
    },
    mod: { subs: (X, iid, v, ctx) => X.card(iid).host === ctx.iid ? [{ k: 'brain', n: 1 }].concat(v) : v },
    botPlay: () => 0.8
  });
  S('aot', '11072', 'The first time each turn the Runner passes a rezzed bioroid ice, you may rez a bioroid card for 4 less.');
  on('aot', {
    on: {
      *passIce(X, iid, ctx) {
        if (!X.card(ctx.iid).rez || !kw(X, ctx.iid, /Bioroid/) || X.card(iid).x.turn === X.g.turnN) return;
        X.card(iid).x.turn = X.g.turnN;
        const pool = X.corpPlaced().filter(i => !X.card(i).rez && kw(X, i, /Bioroid/) && X.dat(i).type !== 'agenda' && !X.rezBlock(i) && !X.dat(i).rezForfeit && X.avail('corp', X.dat(i).type === 'ice' ? 'rezIce' : 'rez') >= Math.max(0, X.rezCost(i) - 4));
        const t = yield* X.ask(iid, 'corp', 'aot', 'Architects of Tomorrow: rez a bioroid for 4 less?', pool.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + Math.max(0, X.rezCost(i) - 4))), { skip: 'No', force: true });
        if (t) { X.doRez(t, false, 4); yield* X.rezTriggers(t); }
      }
    },
    bot: { aot: (pub, me, pr) => (pr.options[0] || {}).id || 'skip' }
  });
  S('fumiko', '11073', 'Whenever secretly spent credits are shown and the bids differ, 1 meat damage.');
  on('fumiko', { on: { *psi(X, iid, ctx) { if (ctx.cb !== ctx.rb) yield* X.damage('meat', 1, 'Fumiko Yamamori'); } } });
  S('hasty_relocation', '11074', 'As an extra cost, trash the top card of R&D. Draw 3, then put 3 cards from HQ on top of R&D in any order.');
  on('hasty_relocation', {
    playBad: (X) => X.C.rd.length ? null : 'R&D is empty',
    *play(X, iid) {
      X.toArchives(X.C.rd[0], false);
      X.drawCorp(3, 'hasty_relocation');
      const n = Math.min(3, X.C.hq.length);
      if (!n) return;
      const ts = yield* X.ask(iid, 'corp', 'hasty', 'Hasty Relocation: which ' + X.plural(n, 'card') + ' go back on top of R&D?', X.C.hq.map(i => X.cardOpt(i)), { multi: true, min: n, max: n });
      const order = yield* arrange(X, iid, 'corp', 'hastyOrder', ts, 'Hasty Relocation');
      for (let k = order.length - 1; k >= 0; k--) { X.lift(order[k]); X.C.rd.unshift(order[k]); }
    },
    botPlay: () => -1
  });
  S('data_ward', '11075', 'When the Runner meets it, they take a tag unless they pay 3.', { subs: [0, 1, 2, 3].map(() => ({ k: 's', n: 0, text: 'End the run if the Runner is tagged' })) });
  on('data_ward', {
    *onEnc(X, iid) {
      if (X.avail('runner', 'any') >= 3 && (yield* X.yn(iid, 'runner', 'dataWard', 'Data Ward: pay 3, or take a tag?', 'Pay 3', 'Take a tag'))) { X.pay('runner', 3, 'any'); X.log({ t: 'paid', n: 3, k: 'data_ward' }); return null; }
      yield* X.giveTags(1, 'Data Ward');
      return null;
    },
    subs: [function (X) { return X.tagged() ? 'end' : null; }],
    bot: { dataWard: () => 'yes' }
  });
  S('drone_screen', '11076', 'While the Runner is tagged: whenever they start a run on this server, trace 3 — 1 meat damage that cannot be prevented.');
  on('drone_screen', { on: { *runBegin(X, iid, ctx) { const sv = X.serverOf(iid); if (!sv || ctx.sid !== sv.id || !X.tagged()) return; if ((yield* X.trace(3, 'Drone Screen')).ok) yield* X.damage('meat', 1, 'Drone Screen', { unprev: true }); } } });
  S('chief_slee', '11077', 'Whenever an encounter ends, a power counter for each subroutine left unbroken. A click and 5 counters: 5 meat damage.');
  on('chief_slee', {
    on: { encounterEnd(X, iid, ctx) { const n = ctx.E.broken.filter(b => !b).length; if (n) X.card(iid).power += n; } },
    abils: (X, iid) => [{ label: 'Chief Slee: 5 meat damage', clicks: 1, bad: X.card(iid).power >= 5 ? null : 'Needs 5 counters (' + X.card(iid).power + ')' }],
    *use(X, iid) { X.card(iid).power -= 5; yield* X.damage('meat', 5, 'Chief Slee'); },
    show: (X, iid) => X.card(iid).power ? X.plural(X.card(iid).power, 'counter') : null,
    botAbil: () => 9
  });
  S('bulwark', '11078', 'Rezzing it gives you 1 bad publicity. When the Runner meets it with an AI program installed, gain 2 credits.', { subs: [{ k: 's', n: 0, text: 'The Runner trashes one of their programs' }, { k: 'multi', do: [{ k: 'gain', n: 2 }, { k: 'etr' }] }, { k: 'multi', do: [{ k: 'gain', n: 2 }, { k: 'etr' }] }] });
  on('bulwark', {
    *onRez(X) { yield* X.takeBP(1, 'Bulwark'); },
    onEnc(X) { if (hasAI(X)) gainC(X, 2, 'bulwark'); return null; },
    subs: [function* (X, iid) { if (!X.programs().length) return null; const t = yield* X.ask(iid, 'runner', 'bulwark', 'Bulwark: trash which of your programs?', X.programs().map(i => X.cardOpt(i)), { always: true }); if (t) X.trashRunner(t, 'Bulwark'); return null; }],
    bot: { bulwark: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[a.card] || {}).cost || 0) - ((D.CARDS[b.card] || {}).cost || 0))[0].id }
  });
  S('best_defense', '11079', 'Trash an installed card whose install cost is no more than the Runner’s tags.');
  const cheap = X => X.R.rig.filter(i => X.card(i).x.fd || (X.dat(i).cost || 0) <= X.R.tags);
  on('best_defense', {
    playBad: (X) => cheap(X).length ? null : 'Nothing cheap enough',
    *play(X, iid) { const t = yield* X.ask(iid, 'corp', 'bestDefense', 'Best Defense: trash which card?', cheap(X).map(i => X.cardOpt(i)), { always: true }); if (t) yield* X.corpTrashes(t, 'Best Defense'); },
    bot: { bestDefense: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).cost || 0) - ((D.CARDS[a.card] || {}).cost || 0))[0].id },
    botPlay: () => 0.8
  });
  S('preemptive_action', '11080', 'Terminal. Shuffle 3 cards from Archives into R&D. It leaves the game.');
  on('preemptive_action', {
    playBad: (X) => X.C.arch.length ? null : 'Archives is empty',
    *play(X, iid) {
      const n = Math.min(3, X.C.arch.filter(i => i !== iid).length);
      const ts = n ? yield* X.ask(iid, 'corp', 'preemptive', 'Preemptive Action: shuffle which ' + X.plural(n, 'card') + ' into R&D?', X.C.arch.filter(i => i !== iid).map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { multi: true, min: n, max: n }) : [];
      for (const t of ts) { X.lift(t); X.card(t).up = false; X.C.rd.push(t); }
      X.shuffleRD();
      X.lift(iid); X.C.gone.push(iid);
      X.log({ t: 'note', side: 'corp', text: 'Preemptive Action: ' + X.plural(ts.length, 'card') + ' from Archives into R&D' });
    },
    bot: { preemptive: (pub, me, pr) => pr.options.slice().sort((a, b) => ((D.CARDS[b.card] || {}).type === 'agenda') - ((D.CARDS[a.card] || {}).type === 'agenda')).slice(0, pr.min).map(o => o.id) },
    botPlay: () => -1
  });

  /* ================================================================ MARTIAL LAW */
  S('mkultra', '11081', 'As you meet a sentry, you may install it from your heap. 3 credits: +2 strength, then break up to 2 sentry subroutines.', SCRIPTED('sentry'));
  on('mkultra', growBreaker('sentry', 3, 2, 2));
  S('on_the_lam', '11082', 'Put it on an installed resource. Trash it: avoid up to 3 tags or prevent up to 3 damage.');
  on('on_the_lam', {
    playBad: (X) => X.rigOf('resource').length ? null : 'No resource installed',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'onTheLam', 'On the Lam: on which resource?', X.rigOf('resource').map(i => X.cardOpt(i)), { always: true });
      if (!t) return;
      X.lift(iid); X.card(iid).up = true; X.card(iid).host = t; X.R.rig.push(iid);
    },
    *avoidTag(X, iid, ctx) { if (!(yield* X.yn(iid, 'runner', 'lam', 'On the Lam: trash it to avoid ' + X.plural(Math.min(3, ctx.n), 'tag') + '?', 'Trash it', 'Keep it'))) return 0; X.trashRunner(iid, 'used'); return Math.min(3, ctx.n); },
    *prevent(X, iid, ctx) { if (!(yield* X.yn(iid, 'runner', 'lam', 'On the Lam: trash it to prevent ' + Math.min(3, ctx.n) + ' ' + ctx.kind + ' damage?', 'Trash it', 'Keep it'))) return 0; X.trashRunner(iid, 'used'); X.log({ t: 'prevent', side: 'runner', k: 'on_the_lam', n: Math.min(3, ctx.n) }); return Math.min(3, ctx.n); },
    bot: { lam: () => 'yes' },
    botPlay: () => 0.6
  });
  S('cold_read', '11083', 'Run any server with 4 credits to spend in the run. When it ends, trash a program you used in it (this cannot be prevented).');
  on('cold_read', Object.assign(anyRun('Cold Read'), {
    *play(X, iid) {
      X.linger(iid);
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Cold Read: run which server?', runOpts(X), { pub: 'The Runner plays Cold Read' });
      if (sid) yield* X.run(sid, { card: iid, via: 'cold_read' });
    },
    on: { runBegin(X, iid, ctx) { if (ctx.S.o.card === iid) ctx.S.stim = (ctx.S.stim || 0) + 4; } },
    *runEnd(X, iid, ctx) {
      const used = (ctx.S.usedBreakers || []).filter(i => X.R.rig.indexOf(i) >= 0);
      if (!used.length) return;
      const t = yield* X.ask(iid, 'runner', 'coldRead', 'Cold Read: trash which program you used?', used.map(i => X.cardOpt(i)), { always: true });
      if (t) X.trashRunner(t, 'cold_read');
    },
    botPlay: () => 0.6
  }));
  S('equivocation', '11084', 'Whenever you make a successful run on R&D, you may show its top card; then you may make the Corp draw it.');
  on('equivocation', {
    on: {
      *success(X, iid, ctx) {
        if (ctx.sid !== 'rd' || !X.C.rd.length) return;
        if (!(yield* X.yn(iid, 'runner', 'equivocation', 'Equivocation: show the top card of R&D?', 'Show it', 'No'))) return;
        X.reveal('corp', [X.C.rd[0]], 'Equivocation');
        if (yield* X.yn(iid, 'runner', 'equivocDraw', 'Equivocation: make the Corp draw ' + X.nameOf(X.C.rd[0]) + '?', 'Make them draw it', 'Leave it')) X.drawCorp(1, 'equivocation');
      }
    },
    bot: { equivocation: () => 'yes', equivocDraw: (pub, me, pr) => /agenda/i.test(pr.why) ? 'no' : 'yes' },
    botPlay: () => 0.6
  });
  S('misdirection', '11085', 'Two clicks and X credits: remove X tags.');
  on('misdirection', {
    abils: (X) => [{ label: 'Misdirection: remove tags', clicks: 2, bad: !X.R.tags ? 'No tags' : X.avail('runner', 'any') < 1 ? 'No credits' : null }],
    *use(X, iid) {
      const most = Math.min(X.R.tags, X.avail('runner', 'any'));
      const opts = []; for (let n = 1; n <= most; n++) opts.push({ id: String(n), label: 'Remove ' + X.plural(n, 'tag') + ' for ' + n });
      const n = +(yield* X.ask(iid, 'runner', 'misdirection', 'Misdirection: how many?', opts, { always: true }));
      X.pay('runner', n, 'any'); X.R.tags -= n; X.log({ t: 'untag', n, k: 'misdirection' });
    },
    bot: { misdirection: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botAbil: (pub) => pub.runner.tags ? 1.4 : -1, botPlay: () => 0.4
  });
  S('reaver', '11086', 'The first time each turn you trash one of your installed cards, draw a card.');
  on('reaver', { sync: { ownTrashed(X, iid, ctx) { if (ctx.iid === iid || ctx.why === 'host' || X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; X.drawRunner(1, 'reaver'); } }, botPlay: () => 0.6 });
  S('encore', '11107', 'Only after successful runs on HQ, R&D and Archives this turn. Take another turn after this one. It leaves the game.');
  on('encore', {
    playBad: (X) => { const f = X.R.flags.succ || {}; return f.hq && f.rd && f.arch ? null : 'Only after successful runs on HQ, R&D and Archives this turn'; },
    play(X, iid) { X.lift(iid); X.R.gone.push(iid); X.R.extraTurns = (X.R.extraTurns || 0) + 1; X.log({ t: 'note', side: 'runner', text: 'Encore: the Runner will take another turn' }); },
    botPlay: () => 6
  });
  S('interdiction', '11087', 'Current. The Corp cannot rez cards other than ice during your turn.');
  on('interdiction', { mod: { rezBad: (X, iid, v, ctx) => v || (X.g.active === 'runner' && X.dat(ctx.iid).type !== 'ice' ? 'Interdiction: not during the Runner’s turn' : null) }, botPlay: () => 0.8 });
  S('fawkes', '11108', '1 credit: break one sentry subroutine. X credits (stealth): +X strength for the run.', { brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 1, by: 1, run: true, why: 'stealth' } });
  S('baba_yaga', '11088', 'Carries any number of icebreakers that are not AI (they work from it as they would anyway).');
  on('baba_yaga', { hostFor: (X, h, p) => !!X.dat(p).brk && !kw(X, p, /\bAI\b/), botPlay: () => 0.2 });
  S('fairchild', '11089', '', { subs: [{ k: 'payOrEnd', n: 4 }, { k: 'payOrEnd', n: 4 }, { k: 's', n: 0, text: 'End the run unless the Runner trashes an installed card' }, { k: 's', n: 1, text: 'End the run unless the Runner takes 1 brain damage' }] });
  on('fairchild', {
    subs: [
      function* (X, iid) { if (!X.R.rig.length) return 'end'; const t = yield* X.ask(iid, 'runner', 'fairchildT', 'Fairchild: trash an installed card, or the run ends?', X.R.rig.map(i => X.cardOpt(i)), { skip: 'Let the run end' }); if (!t) return 'end'; X.trashRunner(t, 'Fairchild'); return null; },
      function* (X, iid) { if (!(yield* X.yn(iid, 'runner', 'fairchildB', 'Fairchild: take 1 brain damage, or the run ends?', 'Take it', 'Let the run end'))) return 'end'; yield* X.damage('brain', 1, 'Fairchild'); return null; }
    ],
    bot: { fairchildT: () => 'skip', fairchildB: () => 'no' }
  });
  S('friends_high_places', '11090', 'Terminal. Install up to 2 cards from Archives (paying for them).');
  on('friends_high_places', {
    playBad: (X) => X.C.arch.some(i => X.dat(i).type !== 'operation') ? null : 'Nothing in Archives to install',
    *play(X, iid) {
      for (let n = 0; n < 2; n++) {
        const pool = X.C.arch.filter(i => X.dat(i).type !== 'operation');
        if (!pool.length) return;
        const t = yield* X.ask(iid, 'corp', 'friends', 'Friends in High Places: install which card from Archives (' + (n + 1) + ' of 2)?', pool.map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { skip: 'Stop' });
        if (!t) return;
        yield* X.corpInstall(t, {});
      }
    },
    bot: { friends: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || pr.options[0]).id },
    botPlay: () => 0.4
  });
  S('manta_grid', '11091', 'When a successful run on this server ends with the Runner on fewer than 6 credits or no clicks, you have a click more next turn. One region per server.');
  on('manta_grid', {
    on: {
      runEnd(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (ctx.how !== 'success' || !sv || ctx.sid !== sv.id || !(X.R.credits < 6 || X.R.clicks === 0)) return;
        const turn = X.g.turnN + (X.g.active === 'runner' ? 1 : 2);
        X.C.clickPlus = { turn, n: (X.C.clickPlus && X.C.clickPlus.turn === turn ? X.C.clickPlus.n : 0) + 1, iid };
      }
    }
  });
  S('mind_game', '11092', '', { subs: [{ k: 's', n: 0, text: 'Psi game: if the bids differ, the Runner is moved to the outside of another server, and jacking out costs them an installed card' }] });
  on('mind_game', {
    subs: [function* (X, iid) {
      if (!(yield* X.psi('Mind Game'))) return null;
      const others = X.C.servers.filter(sv => sv.id !== X.g.run.sid);
      if (!others.length) return null;
      const to = yield* X.ask(iid, 'corp', 'mindGame', 'Mind Game: send the Runner to the outside of which server?', others.map(sv => ({ id: sv.id, label: sv.name, sub: X.plural(sv.ice.length, 'ice') })), { always: true });
      X.g.run.sid = to; X.g.run.mindGame = true;
      X.log({ t: 'note', side: 'corp', text: 'Mind Game: the Runner is moved to ' + X.server(to).name });
      return { moved: to, outer: true };
    }],
    bot: { mindGame: (pub, me, pr) => pr.options.slice().sort((a, b) => +b.sub.split(' ')[0] - +a.sub.split(' ')[0])[0].id }
  });
  S('nihongai', '11093', 'Whenever a run on this server succeeds while the Runner lacks 2 cards in grip and 6 credits, you may look at the top 5 cards of R&D and swap one with a card in HQ. One region per server.');
  on('nihongai', {
    on: {
      *success(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || ctx.S.sid !== sv.id || (X.R.grip.length >= 2 && X.R.credits >= 6) || !X.C.rd.length || !X.C.hq.length) return;
        X.g.revealN++;
        const top = X.C.rd.slice(0, 5);
        const a = yield* X.ask(iid, 'corp', 'nihongai', 'Nihongai Grid: swap which of the top of R&D?', top.map((i, k) => X.cardOpt(i, null, 'card ' + (k + 1))), { skip: 'No swap' });
        if (!a) return;
        const b = yield* X.ask(iid, 'corp', 'nihongaiHQ', 'Nihongai Grid: for which card in HQ?', X.C.hq.map(i => X.cardOpt(i)), { always: true });
        const p = X.C.rd.indexOf(a), q = X.C.hq.indexOf(b);
        X.C.rd[p] = b; X.C.hq[q] = a;
        X.log({ t: 'note', side: 'corp', text: 'Nihongai Grid swaps a card of HQ into R&D' });
      }
    },
    bot: { nihongai: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') ? 'skip' : (pr.options[0] || {}).id) || 'skip', nihongaiHQ: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id }
  });
  S('ip_block', '11094', 'When the Runner meets it with an AI program installed, they take a tag.', { subs: [{ k: 'trace', n: 3, then: 'tag' }, { k: 's', n: 0, text: 'End the run if the Runner is tagged' }] });
  on('ip_block', { *onEnc(X) { if (hasAI(X)) yield* X.giveTags(1, 'IP Block'); return null; }, subs: [function (X) { return X.tagged() ? 'end' : null; }] });
  S('thoth', '11095', 'When the Runner meets it, they take a tag.', { subs: [{ k: 'trace', n: 4, do: { k: 's', n: 0 }, text: '1 net damage for each tag' }, { k: 'trace', n: 4, do: { k: 's', n: 1 }, text: 'the Runner loses 1 credit for each tag' }] });
  on('thoth', {
    *onEnc(X) { yield* X.giveTags(1, 'Thoth'); return null; },
    subs: [function* (X) { if (X.R.tags) yield* X.damage('net', X.R.tags, 'Thoth'); return null; }, function (X) { loseR(X, X.R.tags, 'Thoth'); return null; }]
  });
  S('anson_rose', '11096', 'When your turn begins, an advancement token on him. Whenever you rez an ice, you may move any number of his tokens onto it.');
  on('anson_rose', {
    on: {
      corpTurnBegin(X, iid) { X.card(iid).adv++; },
      *rez(X, iid, ctx) {
        if (X.dat(ctx.iid).type !== 'ice' || !X.card(iid).adv) return;
        const opts = []; for (let n = 1; n <= X.card(iid).adv; n++) opts.push({ id: String(n), label: 'Move ' + n });
        const a = yield* X.ask(iid, 'corp', 'anson', 'Anson Rose: move tokens onto ' + X.nameOf(ctx.iid) + '?', opts, { skip: 'None' });
        if (!a) return;
        X.card(iid).adv -= +a; X.card(ctx.iid).adv += +a;
        X.log({ t: 'adv', iid: ctx.iid, sid: (X.serverOf(ctx.iid) || {}).id, n: X.card(ctx.iid).adv, k: X.card(ctx.iid).k, by: 'anson_rose' });
      }
    },
    bot: { anson: (pub, me, pr) => ['mausolus', 'woodcutter', 'tyrant', 'salvage', 'nebula'].some(k => pr.why.indexOf(D.CARDS[k] ? D.CARDS[k].name : '#') >= 0) ? pr.options[pr.options.length - 1].id : 'skip' }
  });
  S('mausolus', '11097', 'It can be advanced. With 3 or more advancement tokens its subroutines grow.', { advable: true, subs: [{ k: 's', n: 0, text: 'The Corp gains 1 (3 with 3+ tokens)' }, { k: 's', n: 1, text: '1 net damage (3 with 3+ tokens)' }, { k: 's', n: 2, text: '1 tag (and end the run with 3+ tokens)' }] });
  const big = (X, iid) => X.advOf(iid) >= 3;
  on('mausolus', {
    subs: [
      function (X, iid) { gainC(X, big(X, iid) ? 3 : 1, 'mausolus'); return null; },
      function* (X, iid) { yield* X.damage('net', big(X, iid) ? 3 : 1, 'Mausolus'); return null; },
      function* (X, iid) { yield* X.giveTags(1, 'Mausolus'); return big(X, iid) ? 'end' : null; }
    ]
  });
  S('sapper', '11098', 'Accessed anywhere but Archives, the Runner meets it.', { subs: [{ k: 'trashProg' }] });
  on('sapper', metOnAccess);
  S('show_of_force', '11099', 'When scored, 2 meat damage.');
  on('show_of_force', { *onScore(X) { yield* X.damage('meat', 2, 'Show of Force'); } });
  S('enforced_curfew', '11100', 'Current. The Runner’s maximum hand size is 1 lower.');
  on('enforced_curfew', { mod: { runHand: (X, iid, v) => v - 1 }, botPlay: () => 0.8 });

  /* ================================================================ QUORUM */
  S('sifr', '11101', '+2 memory. Once a turn as you meet an ice, you may take −1 hand size until your next turn: that ice has strength 0 for the encounter. One console only.', { console: true, memory: 2 });
  on('sifr', {
    on: {
      *encounter(X, iid, ctx) {
        if (X.card(iid).x.turn === X.g.turnN) return;
        const s = X.iceStr(ctx.iid, ctx.E);
        if (s <= 0 || !(yield* X.yn(iid, 'runner', 'sifr', 'Şifr: −1 hand size until your next turn — ' + X.nameOf(ctx.iid) + ' to strength 0?', 'Do it', 'No'))) return;
        X.card(iid).x.turn = X.g.turnN;
        ctx.E.lower = (ctx.E.lower || 0) + s;
        const h = X.R.handCut && X.R.handCut.until > X.g.turnN ? X.R.handCut.n : 0;
        X.R.handCut = { n: h + 1, until: X.g.turnN + 2 };
      }
    },
    bot: { sifr: (pub) => 'yes' },
    botPlay: () => 1
  });
  S('sunya', '11102', '2 credits: break one sentry subroutine. +1 strength for each power counter; a counter whenever it fully breaks an ice.', { brk: { type: 'sentry', cost: 2, n: 1 } });
  on('sunya', growsOnFull);
  S('recon_drone', '11103', 'Pay X and trash it: prevent X damage from a card you are accessing.');
  on('recon_drone', {
    *prevent(X, iid, ctx) {
      if (!X.g.run || !X.g.run.accessing) return 0;
      const most = Math.min(ctx.n, X.avail('runner', 'any'));
      if (most <= 0) return 0;
      const opts = []; for (let n = 1; n <= most; n++) opts.push({ id: String(n), label: 'Prevent ' + n + ' for ' + n });
      const a = yield* X.ask(iid, 'runner', 'recon', 'Recon Drone: trash it and pay to prevent ' + ctx.kind + ' damage?', opts, { skip: 'No' });
      if (!a) return 0;
      X.pay('runner', +a, 'any'); X.trashRunner(iid, 'used');
      X.log({ t: 'prevent', side: 'runner', k: 'recon_drone', n: +a });
      return +a;
    },
    bot: { recon: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botPlay: () => 0.5
  });
  S('tapwrm', '11104', 'Install only after a successful run on HQ, R&D or Archives this turn. When your turn begins, gain 1 credit for each 5 the Corp has. Trashed when the Corp purges.', { virus: true });
  on('tapwrm', { installBad: (X) => X.R.flags.succCentral ? null : 'Only after a successful run on HQ, R&D or Archives this turn', on: { runnerTurnBegin(X) { gainR(X, Math.floor(X.C.credits / 5), 'tapwrm'); } }, purgeTrash: true, botPlay: () => 1 });
  S('tracker', '11105', 'When your turn begins, you may choose a server. A click and 2 credits: run it — the first subroutine that would fire does not.');
  on('tracker', {
    on: {
      *runnerTurnBegin(X, iid) { X.card(iid).x.sid = (yield* X.ask(iid, 'runner', 'tracker', 'Tracker: choose a server for this turn?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name })), { skip: 'None' })) || null; },
      runBegin(X, iid, ctx) { if (ctx.S.o.via === 'tracker') ctx.S.skipSubs = 1; }
    },
    abils: (X, iid) => { const sid = X.card(iid).x.sid; return [{ label: 'Tracker: run ' + (sid && X.server(sid) ? X.server(sid).name : 'the chosen server'), clicks: 1, cost: 2, bad: !sid || !X.server(sid) ? 'No server chosen' : X.avail('runner', 'any') < 2 ? 'Costs 2' : X.runBad(sid, 1) }]; },
    *use(X, iid) { yield* X.run(X.card(iid).x.sid, { via: 'tracker' }); },
    bot: { tracker: () => 'hq' },
    botAbil: () => 0.9, botPlay: () => 0.4
  });
  S('aaron_marron', '11106', 'Whenever an agenda is scored or stolen, 2 power counters on him. A counter: remove a tag and draw a card.');
  on('aaron_marron', {
    on: { scoreOrSteal(X, iid) { X.card(iid).power += 2; } },
    abils: (X, iid) => [{ label: 'Aaron Marrón: remove a tag, draw a card', bad: !X.card(iid).power ? 'No counters' : X.R.tags ? null : 'No tags' }],
    use(X, iid) { X.card(iid).power--; X.R.tags--; X.log({ t: 'untag', n: 1, k: 'aaron_marron' }); X.drawRunner(1, 'aaron_marron'); },
    botAbil: () => 1.5, botPlay: () => 0.5
  });
  S('peace_in_our_time', '11109', 'Priority. Only if the Corp scored no agenda last turn. Gain 10 credits; the Corp gains 5. No runs for you this turn.');
  on('peace_in_our_time', { playBad: (X) => X.C.flags.scored ? 'The Corp scored last turn' : null, play(X) { gainR(X, 10, 'peace_in_our_time'); gainC(X, 5, 'peace_in_our_time'); X.R.flags.noRun = true; }, botPlay: () => 1.2 });
  S('sensor_net', '11110', 'When scored, an agenda counter on it. Spend it: rez a bioroid free; it derezzes when the turn ends.', { scoreCounters: 1 });
  const snaPool = X => X.corpPlaced().filter(i => !X.card(i).rez && kw(X, i, /Bioroid/) && X.dat(i).type !== 'agenda');
  function* snaRez(X, iid, t) {
    X.spendAgenda(iid); X.doRez(t, true); yield* X.rezTriggers(t);
    (X.card(iid).x.back = X.card(iid).x.back || []).push(t);
  }
  const snaBack = (X, iid) => { for (const t of X.card(iid).x.back || []) if (X.isInstalled(t)) X.derez(t, 'sensor_net'); X.card(iid).x.back = []; };
  on('sensor_net', {
    abils: (X, iid) => X.C.score.indexOf(iid) >= 0 && X.card(iid).agenda ? [{ label: 'Sensor Net Activation: rez a bioroid free', bad: snaPool(X).length ? null : 'No unrezzed bioroid' }] : [],
    *use(X, iid) { const t = yield* X.ask(iid, 'corp', 'sensorNet', 'Sensor Net Activation: rez which bioroid?', snaPool(X).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i))))); if (t) yield* snaRez(X, iid, t); },
    winOpts: (X, iid, ctx) => ctx.where === 'ice' && X.card(iid).agenda && !X.card(ctx.iid).rez && kw(X, ctx.iid, /Bioroid/) ? [{ label: 'Sensor Net Activation: rez ' + X.nameOf(ctx.iid) + ' free' }] : [],
    *winUse(X, iid, n, ctx) { yield* snaRez(X, iid, ctx.iid); },
    on: { corpTurnEnd: snaBack, runnerTurnEnd: snaBack },
    botAbil: () => -1, botWin: () => true
  });
  S('violet_level', '11111', 'Terminal. Gain 8 credits and draw 4.');
  on('violet_level', { play(X) { gainC(X, 8, 'violet_level'); X.drawCorp(4, 'violet_level'); }, botPlay: () => 1.4 });
  S('chiyashi', '11112', 'Whenever the Runner breaks one of its subroutines with an AI installed, the top 2 cards of their stack are trashed.', { subs: [{ k: 'net', n: 2 }, { k: 'net', n: 2 }, { k: 'etr' }] });
  on('chiyashi', { onBreaking(X, iid, ctx) { if (ctx.E.iid === iid && hasAI(X)) mill(X, 2 * ctx.subs.length); } });
  S('psychokinesis', '11113', 'Terminal. Look at the top 5 cards of R&D: you may install an agenda, asset or upgrade among them in a remote server.');
  on('psychokinesis', {
    *play(X, iid) {
      const top = X.C.rd.slice(0, 5);
      X.g.revealN++;
      const pool = top.filter(i => ['agenda', 'asset', 'upgrade'].indexOf(X.dat(i).type) >= 0);
      const t = yield* X.ask(iid, 'corp', 'psychokinesis', 'Psychokinesis: install which card in a remote server?', (pool.length ? pool : top).map(i => X.cardOpt(i, null, null, pool.indexOf(i) >= 0 ? null : 'Not an agenda, asset or upgrade')), { skip: 'None' });
      if (t) yield* X.corpInstall(t, { filter: o => o.id === 'new' || /^r[0-9]+$/.test(o.id) });
    },
    bot: { psychokinesis: (pub, me, pr) => (pr.options.find(o => !o.bad && (D.CARDS[o.card] || {}).type === 'agenda') || pr.options.find(o => !o.bad) || {}).id || 'skip' },
    botPlay: () => 0.6
  });
  S('net_quarantine', '11114', 'The first trace each turn, the Runner’s link counts as 0. Whenever they spend credits on a trace, gain 1 for every 2.');
  on('net_quarantine', {
    on: { traceStart(X, iid) { const x = X.card(iid).x; if (x.turn !== X.g.turnN) { x.turn = X.g.turnN; x.zeroN = X.g.traceN; } }, traceSpent(X, iid, ctx) { gainC(X, Math.floor(ctx.rb / 2), 'net_quarantine'); } },
    mod: { traceLink: (X, iid, v) => X.C.score.indexOf(iid) >= 0 && X.card(iid).x.zeroN === X.g.traceN ? 0 : v }
  });
  S('herald', '11115', 'Accessed anywhere but Archives, the Runner meets it.', { subs: [{ k: 'gain', n: 2 }, { k: 's', n: 0, text: 'The Corp may pay up to 2: that many advancement tokens on one card' }] });
  on('herald', Object.assign({}, metOnAccess, {
    subs: [function* (X, iid) {
      const most = Math.min(2, X.C.credits);
      if (!most || !X.advTargets().length) return null;
      const t = yield* X.ask(iid, 'corp', 'herald', 'Herald: advancement tokens on which card?', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')), { skip: 'None' });
      if (!t) return null;
      const n = most;
      X.pay('corp', n, 'any'); X.card(t).adv += n;
      X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'herald', x: n });
      return null;
    }],
    bot: { herald: (pub, me, pr) => (pr.options[0] || {}).id || 'skip' }
  }));
  S('veritas', '11116', '', { subs: [{ k: 'gain', n: 2 }, { k: 's', n: 0, text: 'The Runner loses 2 credits' }, { k: 'trace', n: 2, then: 'tag' }] });
  on('veritas', { subs: [function (X) { loseR(X, 2, 'Veritas'); return null; }] });
  S('bryan_stinson', '11117', 'While the Runner has fewer than 6 credits: a click — play a transaction from Archives free; it then leaves the game.');
  const txArch = X => X.C.arch.filter(i => X.dat(i).type === 'operation' && kw(X, i, /Transaction/) && !(D.SCRIPT[X.card(i).k] && D.SCRIPT[X.card(i).k].playBad && D.SCRIPT[X.card(i).k].playBad(X, i)));
  on('bryan_stinson', {
    abils: (X) => [{ label: 'Bryan Stinson: play a transaction from Archives', clicks: 1, bad: X.R.credits >= 6 ? 'Only while the Runner has fewer than 6 credits' : txArch(X).length ? null : 'No transaction in Archives' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'bryan', 'Bryan Stinson: play which transaction?', X.dedupe(txArch(X).map(i => X.cardOpt(i))));
      if (!t) return;
      X.C.credits += X.playCost(t);
      yield* X.playOp(t);
      if (X.C.arch.indexOf(t) >= 0) { X.lift(t); X.C.gone.push(t); }
    },
    botAbil: () => 2
  });
  S('nasx', '11118', 'When your turn begins, gain 1 credit. After another card gains you credits, you may pay up to 2 for that many power counters. A click, trash it: 2 credits a counter.');
  const nasxNew = (X, iid) => X.g.log.slice(X.card(iid).x.mark || 0).some(e => e.t === 'gain' && e.side === 'corp' && e.k && e.k !== 'nasx');
  on('nasx', {
    on: { corpTurnBegin(X) { gainC(X, 1, 'nasx'); } },
    abils: (X, iid) => [{ label: 'NASX: pay for power counters', bad: !nasxNew(X, iid) ? 'Only after another card gains you credits' : X.C.credits < 1 ? 'No credits' : null }, { label: 'NASX: trash it — gain ' + 2 * X.card(iid).power, clicks: 1 }],
    *use(X, iid, n) {
      if (n === 1) { const k = 2 * X.card(iid).power; X.toArchives(iid, true); gainC(X, k, 'nasx'); return; }
      const most = Math.min(2, X.C.credits);
      const opts = []; for (let m = 1; m <= most; m++) opts.push({ id: String(m), label: 'Pay ' + m });
      const a = +(yield* X.ask(iid, 'corp', 'nasx', 'NASX: how many counters?', opts, { always: true }));
      X.pay('corp', a, 'any'); X.card(iid).power += a; X.card(iid).x.mark = X.g.log.length;
    },
    botAbil: (pub, me, o) => /trash it/.test(o.label) ? (+((o.label.match(/gain (\d+)/) || [])[1] || 0) >= 10 ? 2 : -1) : -1
  });
  S('macrophage', '11119', '', { subs: [{ k: 'trace', n: 4, do: { k: 's', n: 0 }, text: 'purge virus counters' }, { k: 'trace', n: 3, do: { k: 's', n: 1 }, text: 'trash a virus' }, { k: 'trace', n: 2, do: { k: 's', n: 2 }, text: 'a virus in the heap leaves the game' }, { k: 'trace', n: 1, then: 'etr' }] });
  on('macrophage', {
    subs: [
      function* (X) { yield* X.purge(); return null; },
      function* (X, iid) { const v = X.programs().filter(i => X.dat(i).virus); if (!v.length) return null; const t = yield* X.ask(iid, 'corp', 'macroTrash', 'Macrophage: trash which virus?', v.map(i => X.cardOpt(i)), { always: true }); if (t) X.trashRunner(t, 'Macrophage'); return null; },
      function* (X, iid) { const v = X.R.heap.filter(i => X.dat(i).virus); if (!v.length) return null; const t = yield* X.ask(iid, 'corp', 'macroHeap', 'Macrophage: which virus in the heap leaves the game?', X.dedupe(v.map(i => X.cardOpt(i))), { always: true }); if (t) { X.lift(t); X.R.gone.push(t); X.log({ t: 'note', side: 'corp', text: 'Macrophage: ' + X.nameOf(t) + ' leaves the game' }); } return null; }
    ]
  });
  S('tribunal', '11120', '', { subs: [0, 1, 2].map(() => ({ k: 's', n: 0, text: 'The Runner trashes one of their installed cards' })) });
  on('tribunal', { subs: [trashOwn], bot: { trashOwn: botTrashOwn } });

  D.SET_LOADED.flashpoint = true;
})(typeof window !== 'undefined' ? window : this);
