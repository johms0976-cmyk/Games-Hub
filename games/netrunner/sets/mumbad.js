'use strict';
/* The Mumbad cycle (2016: Kala Ghoda, Business First, Democracy and Dogma,
 * Salsette Island, The Liberated Mind, Fear the Masses — 114 cards).
 *
 * Numbers from sets/stats.js; every line of card text written fresh;
 * behaviour as card scripts. New here: alliance cards (no influence when the
 * deck meets their condition — `ally` in the data, counted by nr-data), deva
 * icebreakers that swap with one another, cards hosted on Full Immersion
 * RecStudio (they stand in its server and are accessed with it). Readings
 * decided here:
 *   - Jeeves Model Bioroids: "the same action" is the same basic action
 *     (credit, draw, install, advance), the same operation by name, or the same
 *     card ability — three clicks on it in a turn, or one action costing three.
 *   - Corporate Scandal adds its bad publicity where bad publicity pays the
 *     Runner (credits for runs) and for the Mumbad cards that ask; older cards
 *     that read the count directly see the printed count.
 *   - Panchatantra's subtype counts for Sadyojata (subtypes are counted from
 *     the card's printed line).
 *   - The Turning Wheel's counters are spent as the run succeeds, before access.
 *   - EMP Device is used as the run begins.
 *   - Personality Profiles hears every search of the stack that ends in a
 *     shuffle, and every install from the heap.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('../nr-data.js') : root.NrData;
  const N = node ? require('./stats.js') : root.NrStats;
  const S = (id, code, text, o) => N.make(id, code, Object.assign({ text }, o || {}));
  const on = D.script;
  const kw = (X, i, re) => re.test(X.dat(i).kw || '');
  const runOpts = X => X.C.servers.map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) }));
  const anyRun = (name, o) => ({
    playBad: (X) => X.C.servers.every(sv => X.runBad(sv.id, 1)) ? 'Nowhere to run' : null,
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', name + ': run which server?', runOpts(X), { pub: 'The Runner plays ' + name });
      if (sid) yield* X.run(sid, Object.assign({ card: iid, via: X.card(iid).k }, o || {}));
    }
  });
  const oneRun = (sid) => ({ playBad: (X) => X.runBad(sid, 1), *play(X, iid) { yield* X.run(sid, { card: iid, via: X.card(iid).k }); } });
  function toCorpScore(X, iid, pts) { X.lift(iid); X.wipe(X.card(iid)); X.card(iid).rez = true; X.card(iid).up = true; X.C.score.push(iid); X.log({ t: 'score', side: 'corp', k: X.card(iid).k, pts, total: X.points('corp') }); X.winCheck(); }
  function toRunnerScore(X, iid, pts) { X.lift(iid); X.wipe(X.card(iid)); X.card(iid).up = true; X.R.score.push(iid); X.log({ t: 'steal', k: X.card(iid).k, pts, total: X.points('runner') }); X.winCheck(); }
  /* No ice protecting this card's server (the political assets). */
  const bare = (X, iid) => { const sv = X.serverOf(iid); return !!sv && !sv.ice.length; };
  const faceUpCorp = X => X.corpPlaced().filter(i => X.card(i).rez || X.card(i).x.faceup);
  /* Put cards in an order, top first. */
  function* arrange(X, iid, side, what, list, why) {
    let left = list.slice();
    const order = [];
    while (left.length > 1) {
      const t = yield* X.ask(iid, side, what, why + ' — which goes ' + (order.length ? 'next' : 'on top') + '?', left.map(i => X.cardOpt(i)), { always: true });
      order.push(t); left = left.filter(i => i !== t);
    }
    return order.concat(left);
  }
  /* An ice's subtypes, from its printed line (and Panchatantra's addition this run). */
  function subtypes(X, i) {
    const t = (X.dat(i).kw || '').split(/\s*[-·]\s*/).filter(Boolean).map(s => s.toLowerCase());
    const p = X.g.run && X.g.run.panch;
    if (p && p.iid === i && t.indexOf(p.type) < 0) t.push(p.type);
    return t;
  }
  /* A deva: 1 credit, +1; 2 credits, swap it for another deva from the grip. */
  const deva = (canBreak) => ({
    canBreak,
    abils: (X, iid) => [{ label: X.nameOf(iid) + ': swap it for a deva from your grip', cost: 2, bad: X.R.grip.some(i => kw(X, i, /Deva/) && X.card(i).k !== X.card(iid).k) ? (X.avail('runner', 'any') < 2 ? 'Costs 2' : null) : 'No other deva in your grip' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'devaSwap', 'Swap ' + X.nameOf(iid) + ' for which deva?', X.dedupe(X.R.grip.filter(i => kw(X, i, /Deva/) && X.card(i).k !== X.card(iid).k).map(i => X.cardOpt(i))));
      if (!t) return;
      for (const h of X.hostedOn(iid)) X.trashRunner(h, 'host');
      X.lift(iid); X.wipe(X.card(iid)); X.R.grip.push(iid);
      yield* X.runnerInstall(t, { free: true });
      X.log({ t: 'note', side: 'runner', text: X.nameOf(t) + ' swaps in for ' + X.nameOf(iid) });
    },
    botAbil: () => -1
  });
  const DEVA = { brk: { type: 'any', cost: 1, n: 1 }, pump: { cost: 1, by: 1 } };

  /* ================================================================ KALA GHODA */
  S('run_amok', '10001', 'Run any server. When the run ends, trash 1 ice rezzed during it.');
  on('run_amok', Object.assign(anyRun('Run Amok'), {
    *play(X, iid) {
      X.linger(iid);
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'Run Amok: run which server?', runOpts(X), { pub: 'The Runner plays Run Amok' });
      if (sid) yield* X.run(sid, { card: iid, via: 'run_amok' });
    },
    on: { rez(X, iid, ctx) { if (X.g.run && X.g.run.o.card === iid && X.dat(ctx.iid).type === 'ice') (X.g.run.amok = X.g.run.amok || []).push(ctx.iid); } },
    *runEnd(X, iid, ctx) {
      const ice = (ctx.S.amok || []).filter(i => X.isInstalled(i));
      if (!ice.length) return;
      const t = yield* X.ask(iid, 'runner', 'amok', 'Run Amok: trash which ice rezzed during the run?', ice.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))), { always: true });
      if (t) { X.log({ t: 'trash', side: 'corp', k: X.card(t).k, price: 0, by: 'run_amok' }); X.toArchives(t, true); }
    },
    botPlay: () => 0.7
  }));
  S('ramujan', '10002', 'Trash it: prevent up to X brain or net damage (X: 1 + your other Ramujan-reliant 550 BMIs); trash that many cards from the top of your stack.');
  on('ramujan', {
    *prevent(X, iid, ctx) {
      if (ctx.kind !== 'brain' && ctx.kind !== 'net') return 0;
      const x = X.rigCards('ramujan').length;
      const n = Math.min(x, ctx.n);
      if (!(yield* X.yn(iid, 'runner', 'ramujan', 'Ramujan-reliant 550 BMI: trash it to prevent ' + n + ' ' + ctx.kind + ' damage (and lose ' + X.plural(n, 'card') + ' off your stack)?', 'Prevent it', 'Take it'))) return 0;
      X.trashRunner(iid, 'used');
      for (let k = 0; k < n && X.R.stack.length; k++) { const t = X.R.stack.shift(); X.card(t).up = true; X.R.heap.push(t); }
      X.log({ t: 'prevent', side: 'runner', k: 'ramujan', n });
      return n;
    },
    bot: { ramujan: (pub, me) => (me.hand || []).length <= 2 || /brain/.test('') ? 'yes' : 'yes' },
    botPlay: () => 0.6
  });
  S('street_magic', '10003', 'Unbroken subroutines fire in the order you choose.');
  on('street_magic', { bot: { streetMagic: (pub, me, pr) => (pr.options.find(o => o.label !== 'End the run') || pr.options[0]).id }, botPlay: () => 0.2 });
  S('high_stakes_job', '10004', 'Run a server with at least 1 unrezzed ice. If successful, gain 12 credits when the run ends.');
  on('high_stakes_job', {
    playBad: (X) => X.C.servers.some(sv => sv.ice.some(i => !X.card(i).rez) && !X.runBad(sv.id, 1)) ? null : 'No server with unrezzed ice',
    *play(X, iid) {
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'High-Stakes Job: run which server?', X.C.servers.filter(sv => sv.ice.some(i => !X.card(i).rez)).map(sv => ({ id: sv.id, label: 'Run ' + sv.name, sub: X.runSub(sv), bad: X.runBad(sv.id) })), { pub: 'The Runner plays High-Stakes Job' });
      if (sid) yield* X.run(sid, { card: iid, via: 'high_stakes_job' });
    },
    runEnd(X, iid, ctx) { if (ctx.how === 'success') { X.gain('runner', 12); X.log({ t: 'gain', side: 'runner', n: 12, k: 'high_stakes_job' }); } },
    botPlay: () => 1.4
  });
  S('mongoose', '10005', '1 credit: break up to 2 sentry subroutines. 2 credits: +2 strength. Only one ice a run.', { brk: { type: 'sentry', cost: 1, n: 2 }, pump: { cost: 2, by: 2 } });
  on('mongoose', { canBreak: (X, b, E) => !X.g.run.mongoose || X.g.run.mongoose === E.iid, onBreak(X, iid, ctx) { X.g.run.mongoose = ctx.E.iid; } });
  S('jesminder', '10006', 'The first time each run you would take tags, avoid 1 of them.');
  on('jesminder', { avoidTag(X, iid) { if (!X.g.run || X.g.run.jes) return 0; X.g.run.jes = true; X.log({ t: 'prevent', side: 'runner', k: 'jesminder', n: 1 }); return 1; } });
  S('maya', '10007', '+2 memory. Once a turn, after you access a card in R&D, you may put it at the bottom of R&D and take a tag. One console only.', { console: true, memory: 2 });
  on('maya', {
    on: {
      *accessed(X, iid, ctx) {
        if (ctx.from !== 'rd' || X.C.rd.indexOf(ctx.iid) < 0 || X.card(iid).x.turn === X.g.turnN) return;
        if (!(yield* X.yn(iid, 'runner', 'maya', 'Maya: put ' + X.nameOf(ctx.iid) + ' at the bottom of R&D and take a tag?', 'Bottom it', 'Leave it'))) return;
        X.card(iid).x.turn = X.g.turnN;
        X.lift(ctx.iid); X.C.rd.push(ctx.iid);
        X.log({ t: 'note', side: 'runner', text: 'Maya: the card goes to the bottom of R&D' });
        yield* X.giveTags(1, 'Maya');
      }
    },
    bot: { maya: () => 'no' },
    botPlay: () => 1.2
  });
  const PANCH = ['AP', 'Bioroid', 'Tracer', 'Trap', 'Destroyer', 'Observer', 'Deflector', 'Psi', 'Grail', 'NEXT', 'Illicit', 'Ambush'];
  S('panchatantra', '10008', 'Once a turn as you meet an ice, you may give it a subtype (not barrier, code gate or sentry) for this run.');
  on('panchatantra', {
    on: {
      *encounter(X, iid, ctx) {
        if (X.card(iid).x.turn === X.g.turnN) return;
        const have = subtypes(X, ctx.iid);
        const opts = PANCH.filter(t => have.indexOf(t.toLowerCase()) < 0).map(t => ({ id: t.toLowerCase(), label: t }));
        const t = yield* X.ask(iid, 'runner', 'panch', 'Panchatantra: give ' + X.nameOf(ctx.iid) + ' a subtype for this run?', opts, { skip: 'No' });
        if (!t) return;
        X.card(iid).x.turn = X.g.turnN;
        X.g.run.panch = { iid: ctx.iid, type: t };
        X.log({ t: 'note', side: 'runner', text: X.nameOf(ctx.iid) + ' becomes ' + t + ' for this run (Panchatantra)' });
      }
    },
    bot: { panch: (pub) => pub.runner.rig.some(r => r.k === 'sadyojata') ? 'ap' : 'skip' },
    botPlay: () => 0.2
  });
  S('artist_colony', '10009', 'Forfeit an agenda: find a program, resource or hardware in your stack and install it (paying for it).');
  on('artist_colony', {
    abils: (X) => [{ label: 'Artist Colony: forfeit an agenda — find and install a card', bad: !X.R.score.some(i => X.dat(i).type === 'agenda') ? 'No agenda to forfeit' : X.R.stack.some(i => ['program', 'resource', 'hardware'].indexOf(X.dat(i).type) >= 0) ? null : 'Nothing to find' }],
    *use(X, iid) {
      const f = yield* X.ask(iid, 'runner', 'colonyForfeit', 'Artist Colony: forfeit which agenda?', X.R.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i)));
      if (!f) return;
      X.lift(f); X.R.gone.push(f); X.log({ t: 'forfeit', side: 'runner', k: X.card(f).k });
      X.g.revealN++;
      const t = yield* X.ask(iid, 'runner', 'colony', 'Artist Colony: install which card?', X.dedupe(X.R.stack.filter(i => ['program', 'resource', 'hardware'].indexOf(X.dat(i).type) >= 0).map(i => X.cardOpt(i, null, X.installCost(i, 0) + ' credits', X.installBad(i) || (X.avail('runner', 'any') < X.installCost(i, 0) ? 'Costs ' + X.installCost(i, 0) : null)))), { skip: 'None' });
      if (t) yield* X.runnerInstall(t, {});
      X.shuffleStack();
    },
    botAbil: () => -1, botPlay: () => -1
  });
  S('chatterjee', '10010', 'A click: a power counter on it. A click: install a program from your grip for 1 less per counter, and take a counter off.');
  on('chatterjee', {
    abils: (X, iid) => [{ label: 'Chatterjee University: a power counter', clicks: 1 }, { label: 'Chatterjee University: install a program (' + X.card(iid).power + ' less)', clicks: 1, bad: X.R.grip.some(i => X.dat(i).type === 'program') ? null : 'No program in your grip' }],
    *use(X, iid, n) {
      if (n === 0) { X.card(iid).power++; X.log({ t: 'power', k: 'chatterjee', n: X.card(iid).power }); return; }
      const off = X.card(iid).power;
      const t = yield* X.ask(iid, 'runner', 'chatterjee', 'Chatterjee University: install which program?', X.R.grip.filter(i => X.dat(i).type === 'program').map(i => X.cardOpt(i, null, X.installCost(i, off) + ' credits', X.installBad(i) || (X.avail('runner', 'program') < X.installCost(i, off) ? 'Costs ' + X.installCost(i, off) : null))));
      if (!t) return;
      yield* X.runnerInstall(t, { discount: off });
      if (X.card(iid).power > 0) X.card(iid).power--;
    },
    botAbil: (pub, me, o) => /a power counter$/.test(o.label) ? 0.4 : 1.4,
    botPlay: () => 0.5
  });
  S('ach', '10011', 'The first time the Runner starts a run each turn, you may draw 1 card or gain 1 credit.');
  on('ach', {
    on: {
      *runBegin(X, iid) {
        if (X.C.score.indexOf(iid) < 0 || X.card(iid).x.turn === X.g.turnN) return;
        X.card(iid).x.turn = X.g.turnN;
        const a = yield* X.ask(iid, 'corp', 'acHopper', 'Advanced Concept Hopper: draw a card or gain a credit?', [{ id: 'draw', label: 'Draw 1' }, { id: 'gain', label: 'Gain 1' }], { skip: 'Neither' });
        if (a === 'draw') X.drawCorp(1, 'ach');
        if (a === 'gain') { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'ach' }); }
      }
    },
    bot: { acHopper: (pub) => pub.corp.hqN < 4 ? 'draw' : 'gain' }
  });
  S('vikram', '10012', 'The Runner may lose a click to break one of its subroutines.', { clickBreak: { clicks: 1, n: 1 },
    subs: [{ k: 's', n: 0, text: 'The Runner cannot use programs for the rest of this run' }, { k: 'trace', n: 4, do: { k: 'brain', n: 1 }, text: '1 brain damage' }, { k: 'trace', n: 4, do: { k: 'brain', n: 1 }, text: '1 brain damage' }] });
  on('vikram', { subs: [function (X) { X.g.run.noPrograms = true; X.log({ t: 'note', side: 'corp', text: 'Vikram 1.0: no programs for the rest of this run' }); return null; }] });
  S('heritage_committee', '10013', 'Alliance (free with 6 other Jinteki cards). Draw 3, then put a card from HQ on top of R&D.', { ally: { fac: 'jinteki', n: 6 } });
  on('heritage_committee', {
    *play(X, iid) {
      X.drawCorp(3, 'heritage_committee');
      const t = yield* X.ask(iid, 'corp', 'heritage', 'Heritage Committee: which card goes on top of R&D?', X.C.hq.map(i => X.cardOpt(i)), { always: true });
      if (t) { X.lift(t); X.card(t).up = false; X.C.rd.unshift(t); X.log({ t: 'note', side: 'corp', text: 'A card goes back on top of R&D' }); }
    },
    botPlay: () => 1.2
  });
  S('mumbad_grid', '10014', 'Whenever the Runner passes an ice protecting this server, you may swap it with another ice protecting it. One region per server.');
  on('mumbad_grid', {
    on: {
      *passIce(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || sv.ice.indexOf(ctx.iid) < 0 || sv.ice.length < 2 || !X.g.run || X.g.run.sid !== sv.id) return;
        const p = sv.ice.indexOf(ctx.iid);
        const t = yield* X.ask(iid, 'corp', 'mumbadGrid', 'Mumbad City Grid: swap ' + X.nameOf(ctx.iid) + ' with which ice?', sv.ice.filter(i => i !== ctx.iid).map(i => X.cardOpt(i, (X.card(i).rez ? X.nameOf(i) : X.nameOf(i) + ' (unrezzed)') + ' · position ' + (sv.ice.indexOf(i) + 1))), { skip: 'No swap', force: true });
        if (!t) return;
        const q = sv.ice.indexOf(t);
        sv.ice[p] = t; sv.ice[q] = ctx.iid;
        X.g.run.nextPos = p - 1;
        X.log({ t: 'note', side: 'corp', text: 'Mumbad City Grid swaps two ice protecting ' + sv.name });
      }
    },
    bot: { mumbadGrid: (pub, me, pr) => { const inner = pr.options.find(o => /position (\d+)/.test(o.label) && +o.label.match(/position (\d+)/)[1] === 1); return inner ? inner.id : 'skip'; } }
  });
  S('kala_ghoda', '10015', 'When your turn begins, you may look at the top card of the Runner’s stack. Trash it: the Runner trashes the top card of their stack.');
  on('kala_ghoda', {
    on: {
      *corpTurnBegin(X, iid) {
        if (!X.R.stack.length) return;
        X.g.revealN++;
        yield* X.ask(iid, 'corp', 'kalaLook', 'Kala Ghoda Real TV: the top card of the Runner’s stack', [X.cardOpt(X.R.stack[0], null, 'on top of the stack')], { always: true });
      }
    },
    abils: (X) => [{ label: 'Kala Ghoda Real TV: trash it — the top of the Runner’s stack goes', bad: X.R.stack.length ? null : 'The stack is empty' }],
    use(X, iid) { X.toArchives(iid, true); const t = X.R.stack.shift(); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'note', side: 'corp', text: 'Kala Ghoda Real TV: ' + X.nameOf(t) + ' goes from the top of the stack to the heap' }); },
    bot: { kalaLook: (pub, me, pr) => pr.options[0].id },
    botAbil: () => -1
  });
  S('interrupt_0', '10016', '', { subs: [{ k: 's', n: 0, text: 'For the rest of the run, every icebreaker break costs 1 more' }, { k: 's', n: 1, text: 'For the rest of the run, every icebreaker break costs 1 more' }] });
  const int0 = function (X) { X.g.run.breakTax = (X.g.run.breakTax || 0) + 1; X.log({ t: 'note', side: 'corp', text: 'Interrupt 0: icebreaker breaks cost ' + X.g.run.breakTax + ' more this run' }); return null; };
  on('interrupt_0', { subs: [int0, int0] });
  S('dedication_ceremony', '10017', 'Put 3 advancement tokens on a face-up card. You cannot score it before your next turn.');
  on('dedication_ceremony', {
    playBad: (X) => faceUpCorp(X).length ? null : 'No face-up card',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'dedication', 'Dedication Ceremony: 3 advancement tokens on which card?', faceUpCorp(X).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (!t) return;
      X.card(t).adv += 3; X.card(t).x.lockUntil = X.g.turnN + 2;
      X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).k, by: 'dedication_ceremony', x: 3 });
    },
    bot: { dedication: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id },
    botPlay: (pub) => -1
  });
  S('mumba_temple', '10018', 'Alliance (free with 15 or fewer ice). 2 recurring credits for rezzing.', { ally: { iceMax: 15 }, recur: { n: 2, for: 'rezAny' } });
  S('museum_of_history', '10019', 'Alliance (free in a deck of 50 or more). When your turn begins, you may shuffle a card from Archives into R&D.', { ally: { deckMin: 50 } });
  on('museum_of_history', {
    on: {
      *corpTurnBegin(X, iid) {
        if (!X.C.arch.length) return;
        const t = yield* X.ask(iid, 'corp', 'museum', 'Museum of History: shuffle which card from Archives into R&D?', X.C.arch.map(i => X.cardOpt(i, null, X.card(i).up ? 'face up' : 'face down')), { skip: 'None' });
        if (!t) return;
        X.lift(t); X.card(t).up = false; X.C.rd.push(t); X.shuffleRD();
        X.log({ t: 'note', side: 'corp', text: 'Museum of History shuffles a card from Archives into R&D' });
      }
    },
    bot: { museum: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id }
  });
  S('emp_device', '10020', 'Trash it as a run begins: the Corp can rez at most 1 more ice during that run.');
  on('emp_device', {
    on: {
      *runBegin(X, iid, ctx) {
        const sv = X.server(ctx.sid);
        if (!sv || !sv.ice.some(i => !X.card(i).rez)) return;
        if (!(yield* X.yn(iid, 'runner', 'emp', 'EMP Device: trash it — the Corp can rez only 1 ice this run?', 'Trash it', 'Keep it'))) return;
        X.trashRunner(iid, 'used');
        ctx.S.empAt = ctx.S.rezIceN || 0;
        X.log({ t: 'note', side: 'runner', text: 'EMP Device: the Corp can rez only 1 ice this run' });
      }
    },
    bot: { emp: (pub) => pub.run && (pub.corp.servers.find(s => s.id === pub.run.sid) || { ice: [] }).ice.filter(i => !i.rez).length >= 2 ? 'yes' : 'no' },
    botPlay: () => 0.5
  });
  S('diwan', '10021', 'When installed, choose a server: the Corp pays 1 more to install a card in or before it. Trashed when the Corp purges.', { virus: true });
  on('diwan', {
    *onInstall(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'diwan', 'Diwan: which server?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name })), { always: true });
      X.card(iid).x.sid = t;
    },
    mod: { corpInstallTax: (X, iid, v, ctx) => ctx.sid && ctx.sid === X.card(iid).x.sid ? v + 1 : v },
    show: (X, iid) => X.card(iid).x.sid ? 'on ' + X.srvName(X.server(X.card(iid).x.sid)) : null,
    purgeTrash: true,
    bot: { diwan: (pub, me, pr) => (pr.options.find(o => /^r/.test(o.id) && o.id !== 'rd') || pr.options.find(o => o.id === 'rd') || pr.options[0]).id },
    botPlay: () => 0.6
  });
  S('cbi_raid', '10022', 'Run HQ. If successful, instead of accessing, the Corp puts every card in HQ on top of R&D, in the order it chooses.');
  on('cbi_raid', Object.assign(oneRun('hq'), {
    *success(X, iid) {
      const order = yield* arrange(X, iid, 'corp', 'cbiRaid', X.C.hq.slice(), 'CBI Raid: HQ goes on top of R&D');
      for (let n = order.length - 1; n >= 0; n--) { X.lift(order[n]); X.card(order[n]).up = false; X.C.rd.unshift(order[n]); }
      X.log({ t: 'note', side: 'runner', text: 'CBI Raid: ' + X.plural(order.length, 'card') + ' from HQ go on top of R&D' });
      return 'replace';
    },
    botPlay: (pub) => pub.corp.hqN >= 4 ? 1 : -1
  }));
  S('tech_trader', '10023', 'Whenever you use a “trash it” ability, gain 1 credit.');
  on('tech_trader', { sync: { trashAbility(X, iid) { X.gain('runner', 1); X.log({ t: 'gain', side: 'runner', n: 1, k: 'tech_trader' }); } }, botPlay: () => 0.4 });
  S('netchip', '10024', 'Carries one program with a memory cost no higher than your NetChips installed; it then uses none of yours.');
  on('netchip', { freeHost: true, hostFor: (X, h, p) => X.dat(p).type === 'program' && !X.hostedOn(h).length && (X.dat(p).mu || 0) <= X.rigCards('netchip').length, botPlay: () => 0.5 });
  S('corporate_scandal', '10025', 'Current. The Corp counts as having 1 more bad publicity.');
  on('corporate_scandal', { mod: { bpExtra: (X, iid, v) => v + 1 }, botPlay: () => 1 });
  S('populist_rally', '10026', 'Only with a seedy card installed. The Corp has one click fewer next turn.');
  on('populist_rally', {
    playBad: (X) => X.R.rig.some(i => kw(X, i, /Seedy/) && !X.card(i).x.fd) ? null : 'Needs a seedy card installed',
    play(X, iid) { const n = X.C.clickCut && X.C.clickCut.turn === X.g.turnN + 1 ? X.C.clickCut.n + 1 : 1; X.C.clickCut = { turn: X.g.turnN + 1, n, iid }; X.log({ t: 'note', side: 'runner', text: 'Populist Rally: the Corp has a click fewer next turn' }); },
    botPlay: () => 1.4
  });
  S('aal', '10027', 'When rezzed, gain 3 credits. Trash it: install a card from HQ that is not an agenda (paying for it).');
  on('aal', {
    onRez(X) { X.gain('corp', 3); X.log({ t: 'gain', side: 'corp', n: 3, k: 'aal' }); },
    abils: (X) => [{ label: 'Advanced Assembly Lines: trash it — install a card from HQ', bad: X.C.hq.some(i => ['agenda', 'operation'].indexOf(X.dat(i).type) < 0) ? null : 'Nothing to install' }],
    *use(X, iid) {
      X.toArchives(iid, true);
      const t = yield* X.ask(iid, 'corp', 'aal', 'Advanced Assembly Lines: install which card?', X.C.hq.filter(i => ['agenda', 'operation'].indexOf(X.dat(i).type) < 0).map(i => X.cardOpt(i)), { skip: 'None' });
      if (t) yield* X.corpInstall(t, {});
    },
    bot: { aal: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || pr.options[0]).id },
    botAbil: () => -1
  });
  S('lakshmi', '10028', 'Whenever you rez another card, a power counter on it. Spend X counters: show an agenda worth X from HQ — the Runner cannot steal that agenda this turn.');
  on('lakshmi', {
    on: { rez(X, iid, ctx) { if (ctx.iid !== iid) X.card(iid).power++; } },
    abils: (X, iid) => [{ label: 'Lakshmi Smartfabrics: show an agenda — it cannot be stolen this turn', bad: X.C.hq.some(i => X.dat(i).type === 'agenda' && X.dat(i).pts <= X.card(iid).power) ? null : 'No agenda worth ' + X.card(iid).power + ' or less in HQ' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'lakshmi', 'Lakshmi Smartfabrics: show which agenda?', X.dedupe(X.C.hq.filter(i => X.dat(i).type === 'agenda' && X.dat(i).pts <= X.card(iid).power).map(i => X.cardOpt(i, null, X.dat(i).pts + ' points'))));
      if (!t) return;
      X.card(iid).power -= X.dat(t).pts;
      X.card(iid).x.ban = { k: X.card(t).k, turn: X.g.turnN };
      X.reveal('corp', [t], 'Lakshmi Smartfabrics');
    },
    mod: { noSteal: (X, iid, v, ctx) => v || (X.card(iid).x.ban && X.card(iid).x.ban.turn === X.g.turnN && X.card(ctx.iid).k === X.card(iid).x.ban.k ? 'Lakshmi Smartfabrics' : null) },
    botAbil: () => -1
  });
  S('product_recall', '10029', 'Alliance (free with 6 other Haas-Bioroid cards). Trash one of your rezzed assets or upgrades: gain its trash cost.', { ally: { fac: 'hb', n: 6 } });
  on('product_recall', {
    playBad: (X) => X.corpPlaced().some(i => X.card(i).rez && ['asset', 'upgrade'].indexOf(X.dat(i).type) >= 0) ? null : 'No rezzed asset or upgrade',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'recall', 'Product Recall: trash which card?', X.corpPlaced().filter(i => X.card(i).rez && ['asset', 'upgrade'].indexOf(X.dat(i).type) >= 0).map(i => X.cardOpt(i, null, 'gain ' + (X.dat(i).trash || 0))));
      if (!t) return;
      const n = X.dat(t).trash || 0;
      X.toArchives(t, true); X.gain('corp', n); X.log({ t: 'gain', side: 'corp', n, k: 'product_recall' });
    },
    bot: { recall: (pub, me, pr) => pr.options.slice().sort((a, b) => (D.CARDS[b.card].trash || 0) - (D.CARDS[a.card].trash || 0))[0].id },
    botPlay: () => -1
  });
  S('palana_foods', '10030', 'The first time each turn the Runner draws, gain 1 credit.');
  on('palana_foods', { sync: { runnerDrew(X, iid) { if (X.card(iid).x.turn === X.g.turnN) return; X.card(iid).x.turn = X.g.turnN; X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'palana_foods' }); } } });
  S('palana_agroplex', '10031', 'When your turn begins, each player draws a card.');
  on('palana_agroplex', { on: { corpTurnBegin(X) { X.drawCorp(1, 'palana_agroplex'); X.drawRunner(1, 'palana_agroplex'); } } });
  S('harvester', '10032', '', { subs: [{ k: 's', n: 0, text: 'The Runner draws 3, then discards down to their hand size' }, { k: 's', n: 1, text: 'The Runner draws 3, then discards down to their hand size' }] });
  const harvest = function* (X) { X.drawRunner(3, 'harvester'); yield* X.discardDown('runner'); return null; };
  on('harvester', { subs: [harvest, harvest] });
  S('remote_data_farm', '10033', 'Your maximum hand size is 2 higher.');
  on('remote_data_farm', { mod: { corpHand: (X, iid, v) => X.C.score.indexOf(iid) >= 0 ? v + 2 : v } });
  S('disposable_hq', '10034', 'When the Runner accesses it, you may put any number of cards from HQ at the bottom of R&D.');
  on('disposable_hq', {
    *onAccess(X, iid) {
      if (!X.C.hq.length) return;
      const ts = yield* X.ask(iid, 'corp', 'disposable', 'Disposable HQ: put which cards from HQ at the bottom of R&D?', X.C.hq.map(i => X.cardOpt(i)), { multi: true, min: 0, max: X.C.hq.length });
      for (const t of ts) { X.lift(t); X.card(t).up = false; X.C.rd.push(t); }
      if (ts.length) X.log({ t: 'note', side: 'corp', text: 'Disposable HQ: ' + X.plural(ts.length, 'card') + ' from HQ to the bottom of R&D' });
    },
    bot: { disposable: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type === 'agenda').map(o => o.id) }
  });
  S('new_construction', '10035', 'Installed face up. Whenever you advance it, you may install a card from HQ in a new remote server — rezzed free once it has 5 or more tokens.', { public: true });
  on('new_construction', {
    on: {
      *advanced(X, iid, ctx) {
        if (ctx.iid !== iid) return;
        const pool = X.C.hq.filter(i => X.dat(i).type !== 'operation');
        if (!pool.length) return;
        const t = yield* X.ask(iid, 'corp', 'newConst', 'New Construction: install a card from HQ in a new remote server?', pool.map(i => X.cardOpt(i)), { skip: 'No' });
        if (!t) return;
        yield* X.corpInstall(t, { to: 'new' });
        if (X.card(iid).adv >= 5 && X.isInstalled(t) && X.dat(t).type !== 'agenda' && !X.card(t).rez) { X.doRez(t, true); yield* X.rezTriggers(t); }
      }
    },
    bot: { newConst: (pub, me, pr) => (pr.options.find(o => ['asset', 'upgrade'].indexOf((D.CARDS[o.card] || {}).type) >= 0) || {}).id || 'skip' }
  });
  S('mumbad_construction', '10036', 'When your turn begins, an advancement token on it. 2 credits: move one of its tokens to a face-up card.');
  on('mumbad_construction', {
    on: { corpTurnBegin(X, iid) { X.card(iid).adv++; } },
    abils: (X, iid) => [{ label: 'Mumbad Construction Co.: move a token to a face-up card', cost: 2, bad: !X.card(iid).adv ? 'No tokens on it' : X.avail('corp', 'any') < 2 ? 'Costs 2' : faceUpCorp(X).some(i => i !== iid) ? null : 'No other face-up card' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'mumbadCo', 'Mumbad Construction Co.: move a token to which card?', faceUpCorp(X).filter(i => i !== iid).map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)))));
      if (!t) return;
      X.card(iid).adv--; X.card(t).adv++;
      X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).k, by: 'mumbad_construction' });
    },
    botAbil: () => -1
  });
  S('corporate_sales', '10037', 'When scored, put 10 credits on it. When each player’s turn begins, take 1 of them.');
  const salesTick = (X, iid) => { const c = X.card(iid); if (X.C.score.indexOf(iid) < 0 || c.cred <= 0) return; c.cred--; X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'corporate_sales' }); };
  on('corporate_sales', { onScore(X, iid) { X.card(iid).cred = 10; }, on: { corpTurnBegin: salesTick, runnerTurnBegin: salesTick }, show: (X, iid) => X.card(iid).cred ? X.card(iid).cred + ' credits left' : null });
  S('pad_factory', '10038', 'Alliance (free with 3 PAD Campaigns). A click: an advancement token on a card. You cannot score it before your next turn.', { ally: { pads: 3 } });
  on('pad_factory', {
    abils: (X) => [{ label: 'PAD Factory: an advancement token on a card', clicks: 1, bad: X.advTargets().length ? null : 'Nothing to advance' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'corp', 'padFactory', 'PAD Factory: an advancement token on which card?', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')));
      if (!t) return;
      X.card(t).adv++; X.card(t).x.lockUntil = X.g.turnN + 2;
      X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'pad_factory' });
    },
    botAbil: () => 0.9
  });
  S('political_graffiti', '10039', 'Run Archives. If successful, instead of accessing, put it on an agenda in the Corp’s score area: that agenda is worth 1 point less until the Corp purges.');
  on('political_graffiti', Object.assign(oneRun('arch'), {
    *success(X, iid) {
      const ags = X.C.score.filter(i => X.dat(i).type === 'agenda');
      if (!ags.length) return null;
      const t = yield* X.ask(iid, 'runner', 'graffiti', 'Political Graffiti: on which of the Corp’s agendas?', ags.map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { always: true });
      if (!t) return null;
      X.lift(iid); X.R.gone.push(iid);
      (X.card(t).x.graffiti = X.card(t).x.graffiti || []).push(iid);
      X.log({ t: 'note', side: 'runner', text: 'Political Graffiti: ' + X.nameOf(t) + ' is worth a point less' });
      return 'replace';
    },
    bot: { graffiti: (pub, me, pr) => pr.options[0].id },
    botPlay: (pub) => pub.corp.score.length ? 1.6 : -1
  }));
  S('nero', '10040', 'Once a turn as you meet a sentry, you may jack out.');
  on('nero', {
    on: {
      *encounter(X, iid, ctx) {
        if (X.card(iid).x.turn === X.g.turnN || X.typesOf(ctx.iid).indexOf('sentry') < 0) return;
        if (!(yield* X.yn(iid, 'runner', 'nero', 'Nero Severn: jack out as you meet ' + X.nameOf(ctx.iid) + '?', 'Jack out', 'Face it'))) return;
        X.card(iid).x.turn = X.g.turnN;
        ctx.E.jackNow = true;
      }
    },
    bot: { nero: (pub, me) => 'no' }
  });
  S('reflection', '10041', '+1 memory, +1 link. Whenever you jack out, the Corp shows a random card from HQ. One console only.', { console: true, memory: 1, link: 1 });
  on('reflection', { on: { runEnd(X, iid, ctx) { if (ctx.how === 'jacked' && X.C.hq.length) X.reveal('corp', [X.C.hq[Math.floor(X.rand() * X.C.hq.length)]], 'Reflection'); } }, botPlay: () => 0.8 });
  S('spy_camera', '10042', 'A click: look at the top X cards of your stack and put them back in any order (X: your Spy Cameras). Trash it: look at the top card of R&D.');
  on('spy_camera', {
    abils: (X) => [{ label: 'Spy Camera: arrange the top of your stack', clicks: 1, bad: X.R.stack.length ? null : 'Your stack is empty' }, { label: 'Spy Camera: trash it — look at the top of R&D', bad: X.C.rd.length ? null : 'R&D is empty' }],
    *use(X, iid, n) {
      if (n === 1) { X.trashRunner(iid, 'used'); X.R.peek = { iid: X.C.rd[0], k: X.card(X.C.rd[0]).k, turn: X.g.turnN }; X.log({ t: 'peek', k: 'spy_camera' }); return; }
      const top = X.R.stack.slice(0, X.rigCards('spy_camera').length);
      const order = yield* arrange(X, iid, 'runner', 'spyCam', top, 'Spy Camera');
      X.R.stack.splice(0, order.length, ...order);
    },
    botAbil: () => -1, botPlay: () => 0.1
  });
  S('political_op', '10043', 'Install only after a successful run on HQ this turn. Trash it and pay X: trash a rezzed card whose trash cost is X.');
  on('political_op', {
    installBad: (X) => X.R.flags.hqSuccess ? null : 'Only after a successful run on HQ this turn',
    abils: (X) => [{ label: 'Political Operative: trash it — trash a rezzed card', bad: X.corpPlaced().some(i => X.card(i).rez && X.trashCostOf(i) != null && X.avail('runner', 'any') >= X.trashCostOf(i)) ? null : 'No rezzed card you can pay for' }],
    *use(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'politicalOp', 'Political Operative: trash which rezzed card?', X.corpPlaced().filter(i => X.card(i).rez && X.trashCostOf(i) != null).map(i => X.cardOpt(i, null, 'pay ' + X.trashCostOf(i), X.avail('runner', 'any') < X.trashCostOf(i) ? 'Costs ' + X.trashCostOf(i) : null)));
      if (!t) return;
      const n = X.trashCostOf(t);
      X.trashRunner(iid, 'used');
      X.pay('runner', n, 'any');
      X.log({ t: 'trash', side: 'corp', k: X.card(t).k, price: n, by: 'political_op' });
      X.toArchives(t, true);
    },
    botAbil: () => 1, botPlay: () => 0.6
  });
  S('sadyojata', '10044', '1 credit: break one subroutine on an ice with 3 or more subtypes. 1 credit: +1 strength. 2 credits: swap it for a deva from your grip.', DEVA);
  on('sadyojata', deva((X, b, E) => subtypes(X, E.iid).length >= 3));
  S('fte', '10045', 'Current. When you steal an agenda, this goes to your score area as 1 agenda point.', { scorePts: 1 });
  on('fte', { on: { steal(X, iid) { if (X.R.cur.indexOf(iid) >= 0) toRunnerScore(X, iid, 1); } }, botPlay: () => 0.8 });
  S('akshara', '10046', 'Each player has one more click each turn.');
  on('akshara', { mod: { corpClicks: (X, iid, v) => v + 1, runnerClicks: (X, iid, v) => v + 1 }, botPlay: () => 0.4 });
  S('councilman', '10047', 'Whenever the Corp rezzes an asset or upgrade, you may pay its rez cost and trash this: derez that card; it cannot be rezzed again this turn.');
  on('councilman', {
    on: {
      *rez(X, iid, ctx) {
        const d = X.dat(ctx.iid);
        if (['asset', 'upgrade'].indexOf(d.type) < 0 || !X.card(ctx.iid).rez) return;
        const cost = X.rezCost(ctx.iid);
        if (X.avail('runner', 'any') < cost) return;
        if (!(yield* X.yn(iid, 'runner', 'councilman', 'Councilman: pay ' + cost + ' to derez ' + X.nameOf(ctx.iid) + '?', 'Derez it', 'No'))) return;
        X.pay('runner', cost, 'any');
        X.trashRunner(iid, 'used');
        X.derez(ctx.iid, 'councilman');
        X.card(ctx.iid).x.lockUntil = X.g.turnN + 1;
      }
    },
    bot: { councilman: (pub, me, pr) => /(\d+) to derez/.test(pr.why) && +pr.why.match(/(\d+) to derez/)[1] <= 3 ? 'yes' : 'no' },
    botPlay: () => 0.5
  });
  S('voting_machine', '10048', 'When scored, 3 agenda counters on it. When the Runner’s turn begins, you may spend one: the Runner loses a click.', { scoreCounters: 3 });
  on('voting_machine', {
    on: {
      *runnerTurnBegin(X, iid) {
        if (X.C.score.indexOf(iid) < 0 || !X.card(iid).agenda || !X.R.clicks) return;
        if (!(yield* X.yn(iid, 'corp', 'votingMachine', 'Voting Machine Initiative: spend a counter — the Runner loses a click?', 'Spend it', 'Not now'))) return;
        X.spendAgenda(iid); X.R.clicks--;
        X.log({ t: 'loseClick', k: 'voting_machine' });
      }
    },
    bot: { votingMachine: () => 'yes' }
  });
  S('clone_suffrage', '10049', 'When your turn begins, if no ice protects this server, you may take an operation from Archives into HQ.');
  on('clone_suffrage', {
    on: {
      *corpTurnBegin(X, iid) {
        if (!bare(X, iid)) return;
        const ops = X.C.arch.filter(i => X.dat(i).type === 'operation');
        if (!ops.length) return;
        const t = yield* X.ask(iid, 'corp', 'cloneSuffrage', 'Clone Suffrage Movement: take which operation back?', X.dedupe(ops.map(i => X.cardOpt(i))), { skip: 'None' });
        if (t) { X.lift(t); X.card(t).up = false; X.C.hq.push(t); X.log({ t: 'fromArch', k: X.card(t).k, by: 'clone_suffrage' }); }
      }
    },
    bot: { cloneSuffrage: (pub, me, pr) => pr.options[0].id }
  });
  S('bio_ethics', '10050', 'When your turn begins, if no ice protects this server, 1 net damage.');
  on('bio_ethics', { on: { *corpTurnBegin(X, iid) { if (bare(X, iid)) yield* X.damage('net', 1, 'Bio-Ethics Association'); } } });
  S('political_dealings', '10051', 'Whenever you draw an agenda, you may show it and install it.');
  const dealings = function* (X, iid, ctx) {
    for (const t of ctx.iids || []) {
      if (X.dat(t).type !== 'agenda' || X.C.hq.indexOf(t) < 0) continue;
      if (!(yield* X.yn(iid, 'corp', 'dealings', 'Political Dealings: show ' + X.nameOf(t) + ' and install it?', 'Install it', 'Keep it in HQ'))) continue;
      X.reveal('corp', [t], 'Political Dealings');
      yield* X.corpInstall(t, {});
    }
  };
  on('political_dealings', { on: { corpDrew: dealings, corpDrewMore: dealings }, bot: { dealings: () => 'no' } });
  S('canp', '10052', 'Current. When you score an agenda, this goes to your score area as 1 agenda point.', { scorePts: 1 });
  on('canp', { on: { score(X, iid) { if (X.C.cur.indexOf(iid) >= 0) toCorpScore(X, iid, 1); } }, botPlay: () => 0.8 });
  S('sensie', '10053', 'When your turn begins, if no ice protects this server, you may draw 3; then put a card from HQ at the bottom of R&D.');
  on('sensie', {
    on: {
      *corpTurnBegin(X, iid) {
        if (!bare(X, iid) || !X.C.rd.length) return;
        if (!(yield* X.yn(iid, 'corp', 'sensie', 'Sensie Actors Union: draw 3 (and bottom a card)?', 'Draw 3', 'No'))) return;
        X.drawCorp(3, 'sensie');
        const t = yield* X.ask(iid, 'corp', 'sensieBottom', 'Sensie Actors Union: which card goes to the bottom of R&D?', X.C.hq.map(i => X.cardOpt(i)), { always: true });
        if (t) { X.lift(t); X.C.rd.push(t); }
      }
    },
    bot: { sensie: () => 'yes' }
  });
  S('commercial_bankers', '10054', 'When your turn begins, if no ice protects this server, gain 3 credits.');
  on('commercial_bankers', { on: { corpTurnBegin(X, iid) { if (bare(X, iid)) { X.gain('corp', 3); X.log({ t: 'gain', side: 'corp', n: 3, k: 'commercial_bankers' }); } } } });
  S('mumbad_city_hall', '10055', 'A click: find an alliance card in R&D, show it, and play or install it (paying for it); shuffle.');
  on('mumbad_city_hall', {
    abils: (X) => [{ label: 'Mumbad City Hall: find an alliance card', clicks: 1, bad: X.C.rd.some(i => kw(X, i, /Alliance/)) ? null : 'No alliance card in R&D' }],
    *use(X, iid) {
      X.g.revealN++;
      const opts = X.dedupe(X.C.rd.filter(i => kw(X, i, /Alliance/)).map(i => { const op = X.dat(i).type === 'operation'; const sc = D.SCRIPT[X.card(i).k]; const pb = op && sc && sc.playBad ? sc.playBad(X, i) : null; return X.cardOpt(i, null, op ? 'play it · ' + X.playCost(i) : 'install it', op && X.C.credits < X.playCost(i) ? 'Costs ' + X.playCost(i) : pb); }));
      const t = yield* X.ask(iid, 'corp', 'cityHall', 'Mumbad City Hall: which alliance card?', opts, { skip: 'None' });
      if (t) X.reveal('corp', [t], 'Mumbad City Hall');
      if (t && X.dat(t).type === 'operation') { X.lift(t); X.C.hq.push(t); X.shuffleRD(); yield* X.playOp(t); return; }
      if (t) { X.lift(t); X.C.hq.push(t); X.shuffleRD(); yield* X.corpInstall(t, {}); return; }
      X.shuffleRD();
    },
    bot: { cityHall: (pub, me, pr) => (pr.options.find(o => !o.bad) || {}).id || 'skip' },
    botAbil: () => 0.5
  });
  S('bailiff', '10056', 'Whenever the Runner breaks one of its subroutines, gain 1 credit.', { subs: [{ k: 'etr' }] });
  on('bailiff', { onBreaking(X, iid, ctx) { if (ctx.E.iid !== iid) return; X.gain('corp', ctx.subs.length); X.log({ t: 'gain', side: 'corp', n: ctx.subs.length, k: 'bailiff' }); } });
  S('surat_grid', '10057', 'Whenever you rez another card in or protecting this server, you may rez a card for 2 less. One region per server.');
  on('surat_grid', {
    on: {
      *rez(X, iid, ctx) {
        const sv = X.serverOf(iid);
        if (!sv || ctx.iid === iid || X.serverOf(ctx.iid) !== sv || (X.g.suratDepth || 0) > 4) return;
        const pool = X.corpPlaced().filter(i => !X.card(i).rez && X.dat(i).type !== 'agenda' && !X.dat(i).rezForfeit && !X.rezBlock(i) && X.avail('corp', X.dat(i).type === 'ice' ? 'rezIce' : 'rez') >= Math.max(0, X.rezCost(i) - 2));
        if (!pool.length) return;
        const t = yield* X.ask(iid, 'corp', 'surat', 'Surat City Grid: rez a card for 2 less?', pool.map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + Math.max(0, X.rezCost(i) - 2))), { skip: 'No', force: true });
        if (!t) return;
        X.g.suratDepth = (X.g.suratDepth || 0) + 1;
        try { X.doRez(t, false, 2); yield* X.rezTriggers(t); } finally { X.g.suratDepth--; }
      }
    },
    bot: { surat: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || {}).id || 'skip' }
  });

  /* ================================================================ SALSETTE ISLAND */
  S('making_entrance', '10058', 'Priority. Look at the top 6 cards of your stack, trash any of them, put the rest back in any order.');
  on('making_entrance', {
    playBad: (X) => X.R.stack.length ? null : 'Your stack is empty',
    *play(X, iid) {
      const top = X.R.stack.slice(0, 6);
      const ts = yield* X.ask(iid, 'runner', 'entranceTrash', 'Making an Entrance: trash which of these?', top.map(i => X.cardOpt(i)), { multi: true, min: 0, max: top.length });
      for (const t of ts) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); }
      const rest = top.filter(i => ts.indexOf(i) < 0);
      const order = yield* arrange(X, iid, 'runner', 'entranceOrder', rest, 'Making an Entrance');
      for (const i of order) X.lift(i);
      X.R.stack.unshift(...order);
    },
    bot: { entranceTrash: () => [] },
    botPlay: () => 0.3
  });
  S('salsette_slums', '10059', 'Once a turn, as you access a card with a trash cost, you may pay it to remove that card from the game.');
  on('salsette_slums', {
    on: {
      *access(X, iid, ctx) {
        const cost = X.trashCostOf(ctx.iid);
        if (cost == null || ctx.from === 'arch' || X.card(iid).x.turn === X.g.turnN || X.dat(ctx.iid).type === 'agenda') return;
        const tctx = { asset: X.dat(ctx.iid).type === 'asset' };
        if (X.avail('runner', 'trashCost', tctx) < cost) return;
        if (!(yield* X.yn(iid, 'runner', 'salsette', 'Salsette Slums: pay ' + cost + ' to remove ' + X.nameOf(ctx.iid) + ' from the game?', 'Remove it (' + cost + ')', 'No'))) return;
        X.card(iid).x.turn = X.g.turnN;
        X.pay('runner', cost, 'trashCost', tctx);
        for (const h of X.C.hosted.filter(i => X.card(i).host === ctx.iid)) X.toArchives(h, X.card(h).rez);
        X.lift(ctx.iid); X.wipe(X.card(ctx.iid)); X.card(ctx.iid).up = true; X.C.gone.push(ctx.iid);
        X.log({ t: 'note', side: 'runner', text: 'Salsette Slums: ' + X.nameOf(ctx.iid) + ' is removed from the game' });
        ctx.seen.did = 'removed'; ctx.seen.gone = true;
      }
    },
    bot: { salsette: () => 'yes' },
    botPlay: () => 0.5
  });
  S('exclusive_party', '10060', 'Draw a card. Gain 1 credit for each Exclusive Party in your heap.');
  on('exclusive_party', { play(X, iid) { X.drawRunner(1, 'exclusive_party'); const n = X.R.heap.filter(i => i !== iid && X.card(i).k === 'exclusive_party').length; if (n) { X.gain('runner', n); X.log({ t: 'gain', side: 'runner', n, k: 'exclusive_party' }); } }, botPlay: () => 0.8 });
  S('vamadeva', '10061', '1 credit: break the subroutine of an ice that has exactly one. 1 credit: +1 strength. 2 credits: swap it for a deva from your grip.', DEVA);
  on('vamadeva', deva((X, b, E) => E.subs.length === 1));
  S('brahman', '10062', '1 credit: break up to 2 subroutines. 2 credits: +1 strength. After an encounter in which it broke a subroutine, put one of your installed non-virus programs on top of your stack.', { brk: { type: 'any', cost: 1, n: 2 }, pump: { cost: 2, by: 1 } });
  on('brahman', {
    onBreak(X, iid, ctx) { ctx.E.used.brahman = true; },
    on: {
      *encounterEnd(X, iid, ctx) {
        if (!ctx.E.used.brahman) return;
        ctx.E.used.brahman = false;
        const progs = X.programs().filter(i => !X.dat(i).virus);
        if (!progs.length) return;
        const t = yield* X.ask(iid, 'runner', 'brahman', 'Brahman: which program goes back on top of your stack?', progs.map(i => X.cardOpt(i)), { always: true });
        if (!t) return;
        for (const h of X.hostedOn(t)) X.trashRunner(h, 'host');
        X.lift(t); X.wipe(X.card(t)); X.R.stack.unshift(t);
        X.log({ t: 'note', side: 'runner', text: 'Brahman: ' + X.nameOf(t) + ' goes back on top of the stack' });
      }
    },
    bot: { brahman: (pub, me, pr) => (pr.options.find(o => !(D.CARDS[o.card] || {}).brk) || pr.options.find(o => o.card !== 'brahman') || pr.options[0]).id }
  });
  S('patron', '10063', 'When your turn begins, you may choose a server. The first successful run on it each turn: draw 2 instead of accessing.');
  on('patron', {
    on: {
      *runnerTurnBegin(X, iid) {
        const t = yield* X.ask(iid, 'runner', 'patron', 'Patron: choose a server for this turn?', X.C.servers.map(sv => ({ id: sv.id, label: sv.name })), { skip: 'None' });
        X.card(iid).x.sid = t || null; X.card(iid).x.turn = X.g.turnN; X.card(iid).x.used = false;
      },
      success(X, iid, ctx) {
        const x = X.card(iid).x;
        if (x.turn !== X.g.turnN || x.used || ctx.S.sid !== x.sid || ctx.S.replace) return;
        x.used = true;
        ctx.S.replace = function* () { X.drawRunner(2, 'patron'); };
      }
    },
    show: (X, iid) => X.card(iid).x.sid && X.card(iid).x.turn === X.g.turnN ? 'on ' + X.srvName(X.server(X.card(iid).x.sid)) : null,
    bot: { patron: () => 'arch' },
    botPlay: () => 0.8
  });
  S('sports_hopper', '10064', '+1 link. Trash it: draw 3.', { link: 1 });
  on('sports_hopper', { abils: () => [{ label: 'Sports Hopper: trash it — draw 3' }], use(X, iid) { X.trashRunner(iid, 'used'); X.drawRunner(3, 'sports_hopper'); }, botAbil: (pub, me) => (me.hand || []).length <= 1 ? 1 : -1, botPlay: () => 0.9 });
  S('bazaar', '10065', 'Whenever you install a hardware from your grip, you may install another copy of it from your grip (paying for it).');
  on('bazaar', {
    on: {
      *install(X, iid, ctx) {
        if (ctx.side !== 'runner' || ctx.from !== 'grip' || X.dat(ctx.iid).type !== 'hardware') return;
        const more = X.R.grip.filter(i => X.card(i).k === X.card(ctx.iid).k);
        if (!more.length || X.avail('runner', 'any') < X.installCost(more[0], 0) || X.installBad(more[0])) return;
        if (yield* X.yn(iid, 'runner', 'bazaar', 'Bazaar: install another ' + X.nameOf(ctx.iid) + ' (' + X.installCost(more[0], 0) + ')?', 'Install it', 'No')) yield* X.runnerInstall(more[0], {});
      }
    },
    bot: { bazaar: () => 'yes' },
    botPlay: () => 0.3
  });
  S('personality_profiles', '10066', 'Whenever the Runner searches their stack or installs a card from their heap, they trash a random card from their grip.');
  const profile = (X) => { if (!X.R.grip.length) return; const t = X.R.grip[Math.floor(X.rand() * X.R.grip.length)]; X.lift(t); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'note', side: 'corp', text: 'Personality Profiles: ' + X.nameOf(t) + ' is trashed from the grip' }); };
  on('personality_profiles', { sync: { stackSearched: (X, iid) => { if (X.C.score.indexOf(iid) >= 0) profile(X); } }, on: { install(X, iid, ctx) { if (ctx.side === 'runner' && ctx.from === 'heap' && X.C.score.indexOf(iid) >= 0) profile(X); } } });
  S('jeeves', '10067', 'Alliance (free with 6 other Haas-Bioroid cards). The first time each turn you spend three clicks on the same action, gain a click.', { ally: { fac: 'hb', n: 6 } });
  on('jeeves', { botPlay: () => 0.4 });
  S('raman_rai', '10068', 'Alliance (free with 6 other Jinteki cards). Once a turn when you draw a card, you may lose a click: show it and a card of the same type from Archives, and swap them.', { ally: { fac: 'jinteki', n: 6 } });
  const raman = function* (X, iid, ctx) {
    if (X.card(iid).x.turn === X.g.turnN || !X.C.clicks) return;
    const pool = (ctx.iids || []).filter(i => X.C.hq.indexOf(i) >= 0 && X.C.arch.some(a => X.dat(a).type === X.dat(i).type));
    if (!pool.length) return;
    const t = yield* X.ask(iid, 'corp', 'raman', 'Raman Rai: lose a click to swap a drawn card with one from Archives?', pool.map(i => X.cardOpt(i)), { skip: 'No' });
    if (!t) return;
    const u = yield* X.ask(iid, 'corp', 'ramanArch', 'Raman Rai: swap ' + X.nameOf(t) + ' for which card from Archives?', X.C.arch.filter(a => X.dat(a).type === X.dat(t).type).map(a => X.cardOpt(a)), { always: true });
    if (!u) return;
    X.card(iid).x.turn = X.g.turnN; X.C.clicks--;
    X.reveal('corp', [t, u], 'Raman Rai');
    X.lift(t); X.lift(u); X.card(t).up = true; X.card(u).up = false; X.C.arch.push(t); X.C.hq.push(u);
  };
  on('raman_rai', { on: { corpDrew: raman, corpDrewMore: raman }, bot: { raman: () => 'skip' } });
  S('upayoga', '10069', '', { subs: [{ k: 's', n: 0, text: 'Psi game: if the bids differ, the Runner loses 2 credits' }, { k: 's', n: 1, text: 'Fire a subroutine of a rezzed psi ice' }] });
  on('upayoga', {
    subs: [
      function* (X) { if (yield* X.psi('Upayoga')) { const n = Math.min(2, X.R.credits); X.R.credits -= n; X.log({ t: 'lose', side: 'runner', n, cause: 'Upayoga' }); } return null; },
      function* (X, iid, ctx) {
        if ((X.g.run.upayoga || 0) > 3) return null;
        const psiIce = X.corpPlaced().filter(i => X.dat(i).type === 'ice' && X.card(i).rez && kw(X, i, /\bPsi\b/));
        const opts = [];
        for (const i of psiIce) X.subsOf(i).forEach((sb, k) => { if (!(X.card(i).k === 'upayoga' && k === 1)) opts.push({ id: i + '|' + k, label: X.nameOf(i) + ': ' + X.subText(sb), card: X.card(i).k }); });
        const a = yield* X.ask(iid, 'corp', 'upayoga', 'Upayoga: fire which psi subroutine?', opts, { skip: 'None' });
        if (!a) return null;
        const [i, k] = a.split('|');
        X.g.run.upayoga = (X.g.run.upayoga || 0) + 1;
        return (yield* X.fireSub(X.subsOf(i)[+k], i, +k)) || null;
      }
    ],
    bot: { upayoga: (pub, me, pr) => (pr.options.find(o => /End the run/.test(o.label)) || pr.options[0] || {}).id || 'skip' }
  });
  S('aryabhata', '10070', 'Whenever a trace succeeds, gain 1 credit and the Runner loses 1.');
  on('aryabhata', { on: { trace(X, iid, ctx) { if (!ctx.ok) return; X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'aryabhata' }); if (X.R.credits) { X.R.credits--; X.log({ t: 'lose', side: 'runner', n: 1, cause: 'Aryabhata Tech' }); } } } });
  S('salems_hospitality', '10071', 'Alliance (free with 6 other NBN cards). Name a card: the Runner shows their grip and trashes every copy of it there.', { ally: { fac: 'nbn', n: 6 } });
  on('salems_hospitality', {
    *play(X, iid) {
      const names = {};
      for (const i of Object.keys(X.g.cards)) { const c = X.g.cards[i]; if (c && typeof c === 'object' && c.side === 'runner' && D.CARDS[c.k] && D.CARDS[c.k].type !== 'identity' && !names[c.k]) names[c.k] = i; }
      const opts = Object.keys(names).sort((a, b) => D.CARDS[a].name < D.CARDS[b].name ? -1 : 1).map(k => ({ id: k, label: D.CARDS[k].name, card: k }));
      const k = yield* X.ask(iid, 'corp', 'salem', 'Salem’s Hospitality: name a Runner card', opts, { always: true });
      X.reveal('runner', X.R.grip.slice(), 'Salem’s Hospitality');
      const hit = X.R.grip.filter(i => X.card(i).k === k);
      for (const t of hit) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); }
      X.log({ t: 'note', side: 'corp', text: 'Salem’s Hospitality names ' + (D.CARDS[k] || {}).name + ': ' + X.plural(hit.length, 'copy', 'copies') + ' trashed' });
    },
    bot: { salem: (pub, me, pr) => (pr.options.find(o => o.card === 'sure_gamble') || pr.options.find(o => (D.CARDS[o.card] || {}).brk) || pr.options[0]).id },
    botPlay: (pub) => pub.runner.gripN >= 4 ? 0.6 : -1
  });
  S('exec_search_firm', '10072', 'Alliance (free with 6 other Weyland cards). A click: find an executive, sysop or character in R&D, show it, take it; shuffle.', { ally: { fac: 'weyland', n: 6 } });
  on('exec_search_firm', {
    abils: (X) => [{ label: 'Executive Search Firm: find an executive, sysop or character', clicks: 1, bad: X.C.rd.some(i => kw(X, i, /Executive|Sysop|Character/)) ? null : 'None in R&D' }],
    *use(X, iid) {
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'searchFirm', 'Executive Search Firm: take which card?', X.dedupe(X.C.rd.filter(i => kw(X, i, /Executive|Sysop|Character/)).map(i => X.cardOpt(i))), { skip: 'None' });
      if (t) { X.lift(t); X.C.hq.push(t); X.reveal('corp', [t], 'Executive Search Firm'); }
      X.shuffleRD();
    },
    botAbil: () => 0.4
  });
  S('iuse', '10073', 'Whenever you rez or play a card from another faction (this one too), gain 1 credit.');
  const outOf = (X, i) => { const f = X.dat(i).fac; return f && f !== 'neutral' && f !== X.C.fac; };
  on('iuse', { on: { rez(X, iid, ctx) { if (outOf(X, ctx.iid)) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'iuse' }); } }, play(X, iid, ctx) { if (ctx.side === 'corp' && outOf(X, ctx.iid)) { X.gain('corp', 1); X.log({ t: 'gain', side: 'corp', n: 1, k: 'iuse' }); } } } });
  S('cobra', '10074', '', { subs: [{ k: 'trashProg' }, { k: 'net', n: 2 }] });
  S('localized_product', '10075', 'Find every copy of one card in R&D, show them and take them; shuffle.');
  on('localized_product', {
    playBad: (X) => X.C.rd.length ? null : 'R&D is empty',
    *play(X, iid) {
      X.g.revealN++;
      const t = yield* X.ask(iid, 'corp', 'localized', 'Localized Product Line: take every copy of which card?', X.dedupe(X.C.rd.map(i => X.cardOpt(i))), { always: true });
      const all = t ? X.C.rd.filter(i => X.card(i).k === X.card(t).k) : [];
      for (const i of all) { X.lift(i); X.C.hq.push(i); }
      X.reveal('corp', all, 'Localized Product Line');
      X.shuffleRD();
    },
    bot: { localized: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0]).id },
    botPlay: () => -1
  });
  S('mumbad_tour', '10076', 'Alliance (free with 7 or more assets). Accessed while installed, the Runner must trash it if they can pay.', { ally: { assets: 7 } });
  on('mumbad_tour', {
    onAccess(X, iid, ctx) {
      if (!ctx.installed) return;
      const cost = X.trashCostOf(iid);
      if (cost == null || X.avail('runner', 'trashCost', { asset: false }) < cost) return;
      X.pay('runner', cost, 'trashCost', { asset: false });
      X.log({ t: 'trash', side: 'corp', k: 'mumbad_tour', price: cost, by: 'mumbad_tour' });
      X.toArchives(iid, true);
      ctx.seen.did = 'trashed'; ctx.seen.gone = true;
    }
  });

  /* ================================================================ THE LIBERATED MIND */
  S('noble_path', '10077', 'Trash every card in your grip. Run any server; prevent all damage during that run.');
  on('noble_path', Object.assign(anyRun('The Noble Path'), {
    *play(X, iid) {
      for (const t of X.R.grip.splice(0)) { X.card(t).up = true; X.R.heap.push(t); }
      X.linger(iid);
      const sid = yield* X.ask(iid, 'runner', 'runOn', 'The Noble Path: run which server?', runOpts(X), { pub: 'The Runner plays The Noble Path' });
      if (sid) yield* X.run(sid, { card: iid, via: 'noble_path' });
    },
    prevent(X, iid, ctx) { if (!X.g.run || X.g.run.o.card !== iid) return 0; X.log({ t: 'prevent', side: 'runner', k: 'noble_path', n: ctx.n }); return ctx.n; },
    botPlay: (pub, me) => (me.hand || []).length <= 2 ? 0.8 : -1
  }));
  S('emptied_mind', '10078', 'When your turn begins, gain a click if your grip is empty.');
  on('emptied_mind', { on: { runnerTurnBegin(X) { if (!X.R.grip.length) { X.R.clicks++; X.log({ t: 'clicks', side: 'runner', n: 1, k: 'emptied_mind' }); } } }, botPlay: () => 0.2 });
  S('info_sifting', '10079', 'Run HQ. If successful, instead of accessing, the Corp splits HQ into 2 face-down piles; you access every card in the pile you choose.');
  on('info_sifting', Object.assign(oneRun('hq'), {
    *success(X, iid, ctx) {
      const hq = X.C.hq.slice();
      if (!hq.length) return null;
      const one = yield* X.ask(iid, 'corp', 'sifting', 'Information Sifting: which cards go in the first pile (the rest make the second)?', hq.map(i => X.cardOpt(i)), { multi: true, min: 0, max: hq.length });
      const two = hq.filter(i => one.indexOf(i) < 0);
      const a = yield* X.ask(iid, 'runner', 'siftPile', 'Information Sifting: which pile do you access?', [{ id: 'one', label: 'The first pile (' + X.plural(one.length, 'card') + ')' }, { id: 'two', label: 'The second pile (' + X.plural(two.length, 'card') + ')' }], { always: true });
      for (const i of a === 'one' ? one : two) { if (!X.g.run) break; if (X.C.hq.indexOf(i) >= 0) yield* X.accessOne(i, 'hq', 'hq'); }
      if (X.g.run && X.g.run.seen.length) yield* X.hold({ k: 'access', sid: 'hq', seen: JSON.parse(JSON.stringify(X.g.run.seen)) });
      return 'replace';
    },
    bot: { sifting: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type === 'agenda').map(o => o.id), siftPile: (pub, me, pr) => pr.options.slice().sort((x, y) => +y.label.match(/\((\d+)/)[1] - +x.label.match(/\((\d+)/)[1])[0].id },
    botPlay: (pub) => pub.corp.hqN >= 3 ? 1.2 : -1
  }));
  S('out_of_ashes', '10080', 'Run any server. When your turn begins, if it is in your heap, you may remove it from the game to run any server.');
  on('out_of_ashes', Object.assign(anyRun('Out of the Ashes'), {
    heap: {
      *runnerTurnBegin(X, iid) {
        if (X.heapLocked() || X.C.servers.every(sv => X.runBad(sv.id, 1))) return;
        const sid = yield* X.ask(iid, 'runner', 'ashes', 'Out of the Ashes (in your heap): remove it from the game to make a run?', runOpts(X), { skip: 'No' });
        if (!sid) return;
        X.lift(iid); X.R.gone.push(iid);
        yield* X.run(sid, { via: 'out_of_ashes' });
      }
    },
    bot: { ashes: (pub) => pub.corp.servers.find(s => s.id === 'arch' && !s.ice.length) ? 'arch' : 'skip' },
    botPlay: () => 0.6
  }));
  S('liberated_chela', '10081', 'Five clicks and forfeit an agenda: the Corp may forfeit an agenda to remove this from the game; if not, it joins your score area as 2 agenda points.', { scorePts: 2 });
  on('liberated_chela', {
    abils: (X) => [{ label: 'Liberated Chela: forfeit an agenda — take it as 2 points', clicks: 5, bad: X.R.clicks < 5 ? 'Takes five clicks' : X.R.score.some(i => X.dat(i).type === 'agenda') ? null : 'No agenda to forfeit' }],
    *use(X, iid) {
      const f = yield* X.ask(iid, 'runner', 'chelaForfeit', 'Liberated Chela: forfeit which agenda?', X.R.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { always: true });
      if (f) { X.lift(f); X.R.gone.push(f); X.log({ t: 'forfeit', side: 'runner', k: X.card(f).k }); }
      const ags = X.C.score.filter(i => X.dat(i).type === 'agenda');
      const g2 = ags.length ? yield* X.ask(iid, 'corp', 'chelaCorp', 'Liberated Chela: forfeit an agenda to stop it?', ags.map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')), { skip: 'Let it score' }) : null;
      if (g2) { X.lift(g2); X.C.gone.push(g2); X.log({ t: 'forfeit', side: 'corp', k: X.card(g2).k }); X.trashRunner(iid, 'chela'); X.lift(iid); X.R.gone.push(iid); return; }
      toRunnerScore(X, iid, 2);
    },
    bot: { chelaCorp: (pub, me, pr) => (pr.options.find(o => D.CARDS[o.card].pts <= 2) || {}).id || 'skip' },
    botAbil: () => -1, botPlay: () => -1
  });
  S('temple_mind', '10082', 'A click: a power counter on it. Once a turn, on your turn, spend a counter: gain a click.');
  on('temple_mind', {
    abils: (X, iid) => [{ label: 'Temple of the Liberated Mind: a power counter', clicks: 1 }, { label: 'Temple of the Liberated Mind: spend a counter — gain a click', bad: !X.card(iid).power ? 'No counters' : X.card(iid).x.turn === X.g.turnN ? 'Once a turn' : null }],
    use(X, iid, n) {
      if (n === 0) { X.card(iid).power++; X.log({ t: 'power', k: 'temple_mind', n: X.card(iid).power }); return; }
      X.card(iid).power--; X.card(iid).x.turn = X.g.turnN; X.R.clicks++; X.log({ t: 'clicks', side: 'runner', n: 1, k: 'temple_mind' });
    },
    botAbil: () => -1, botPlay: () => -1
  });
  S('rebirth', '10083', 'Swap your identity for another of your faction. It leaves the game instead of going to the heap. One per deck.');
  on('rebirth', {
    playBad: (X) => rebirths(X).length ? null : 'No other identity of your faction',
    *play(X, iid) {
      X.lift(iid); X.R.gone.push(iid);
      const t = yield* X.ask(iid, 'runner', 'rebirth', 'Rebirth: become which identity?', rebirths(X).map(k => ({ id: k, label: D.CARDS[k].name + (D.CARDS[k].title ? ': ' + D.CARDS[k].title : ''), card: k })), { always: true });
      if (!t) return;
      const c = X.card(X.R.ident), was = c.k;
      c.k = t; c.x = {};
      X.log({ t: 'note', side: 'runner', text: 'Rebirth: ' + D.CARDS[was].name + ' becomes ' + D.CARDS[t].name });
    },
    botPlay: () => -1
  });
  function rebirths(X) {
    const sets = {};
    for (const i of Object.keys(X.g.cards)) { const c = X.g.cards[i]; if (c && typeof c === 'object' && D.CARDS[c.k]) sets[D.CARDS[c.k].set] = true; }
    const me = X.card(X.R.ident).k;
    return Object.keys(D.CARDS).filter(k => { const c = D.CARDS[k]; return c.type === 'identity' && c.side === 'runner' && c.fac === D.CARDS[me].fac && k !== me && !c.unbuilt && sets[c.set] && !c.startsWith; });
  }
  S('guru_davinder', '10084', 'Prevent all net and meat damage you would take; each time, trash it unless you pay 4.');
  on('guru_davinder', {
    *prevent(X, iid, ctx) {
      if (ctx.kind !== 'net' && ctx.kind !== 'meat') return 0;
      X.log({ t: 'prevent', side: 'runner', k: 'guru_davinder', n: ctx.n });
      if (!(X.avail('runner', 'any') >= 4 && (yield* X.yn(iid, 'runner', 'guru', 'Guru Davinder: pay 4 to keep him?', 'Pay 4', 'Trash him')))) X.trashRunner(iid, 'used');
      else X.pay('runner', 4, 'any');
      return ctx.n;
    },
    bot: { guru: (pub) => pub.runner.credits >= 8 ? 'yes' : 'no' },
    botPlay: () => 0.7
  });
  S('turning_wheel', '10085', 'Whenever a run on HQ or R&D ends without your stealing, a power counter on it. As such a run succeeds, spend 2 counters: access 1 more card.');
  on('turning_wheel', {
    on: {
      runEnd(X, iid, ctx) { if ((ctx.sid === 'hq' || ctx.sid === 'rd') && !ctx.S.seen.some(s => s.did === 'stolen')) X.card(iid).power++; },
      *success(X, iid, ctx) {
        if (ctx.sid !== 'hq' && ctx.sid !== 'rd') return;
        while (X.card(iid).power >= 2 && (yield* X.yn(iid, 'runner', 'wheel', 'The Turning Wheel: spend 2 counters to access 1 more card?', 'Spend 2', 'No'))) {
          X.card(iid).power -= 2; ctx.S.wheel = (ctx.S.wheel || 0) + 1;
        }
      }
    },
    mod: { accessHQ: (X, iid, v, ctx) => v + ((ctx.S && ctx.S.wheel) || 0), accessRD: (X, iid, v, ctx) => v + ((ctx.S && ctx.S.wheel) || 0) },
    bot: { wheel: () => 'yes' },
    botPlay: () => 0.7
  });
  S('brainstorm', '10086', 'When the Runner meets it, it gains a “1 brain damage” subroutine for each card in their grip.', { subs: [] });
  on('brainstorm', { onEnc(X, iid, ctx) { for (let k = 0; k < X.R.grip.length; k++) { ctx.E.subs.push({ k: 'brain', n: 1 }); ctx.E.broken.push(false); } return null; } });
  S('ravana', '10087', 'The Runner may lose a click to break one of its subroutines.', { clickBreak: { clicks: 1, n: 1 }, subs: [{ k: 's', n: 0, text: 'Fire a subroutine of another rezzed bioroid ice' }, { k: 's', n: 0, text: 'Fire a subroutine of another rezzed bioroid ice' }] });
  on('ravana', {
    subs: [function* (X, iid) {
      if ((X.g.run.ravana || 0) > 3) return null;
      const opts = [];
      for (const i of X.corpPlaced().filter(i => i !== iid && X.dat(i).type === 'ice' && X.card(i).rez && kw(X, i, /Bioroid/) && X.card(i).k !== 'ravana')) X.subsOf(i).forEach((sb, k) => opts.push({ id: i + '|' + k, label: X.nameOf(i) + ': ' + X.subText(sb), card: X.card(i).k }));
      const a = yield* X.ask(iid, 'corp', 'ravana', 'Ravana 1.0: fire which bioroid subroutine?', opts, { skip: 'None' });
      if (!a) return null;
      const [i, k] = a.split('|');
      X.g.run.ravana = (X.g.run.ravana || 0) + 1;
      return (yield* X.fireSub(X.subsOf(i)[+k], i, +k)) || null;
    }],
    bot: { ravana: (pub, me, pr) => (pr.options.find(o => /End the run/.test(o.label)) || pr.options[0] || {}).id || 'skip' }
  });
  S('dnn', '10088', 'The first successful run on HQ each turn: a psi game — if the bids differ, you choose which cards the Runner accesses from HQ.');
  on('dnn', {
    on: {
      *success(X, iid, ctx) {
        if (ctx.sid !== 'hq' || X.C.score.indexOf(iid) < 0 || X.card(iid).x.turn === X.g.turnN) return;
        X.card(iid).x.turn = X.g.turnN;
        if (yield* X.psi('Dedicated Neural Net')) { ctx.S.corpPicksHQ = true; X.log({ t: 'note', side: 'corp', text: 'Dedicated Neural Net: the Corp chooses what is accessed from HQ' }); }
      }
    },
    bot: { dnnPick: (pub, me, pr) => pr.options.filter(o => (D.CARDS[o.card] || {}).type !== 'agenda').concat(pr.options).slice(0, pr.min).map(o => o.id).filter((v, n, a) => a.indexOf(v) === n) }
  });
  S('chetana', '10089', '', { subs: [{ k: 's', n: 0, text: 'Each player gains 2 credits' }, { k: 's', n: 1, text: 'Psi game: if the bids differ, 1 net damage for each card in the Runner’s grip' }] });
  on('chetana', {
    subs: [
      function (X) { X.gain('corp', 2); X.gain('runner', 2); X.log({ t: 'note', side: 'corp', text: 'Chetana: each player gains 2 credits' }); return null; },
      function* (X) { if (yield* X.psi('Chetana')) yield* X.damage('net', X.R.grip.length, 'Chetana'); return null; }
    ]
  });
  S('puppet_master', '10090', 'Whenever the Runner makes a successful run, you may put an advancement token on a card that can be advanced.');
  on('puppet_master', {
    on: {
      *success(X, iid) {
        if (X.C.score.indexOf(iid) < 0) return;
        const t = yield* X.ask(iid, 'corp', 'puppet', 'Puppet Master: an advancement token on which card?', X.advTargets().map(i => X.cardOpt(i, null, X.srvName(X.serverOf(i)) + ' · ' + X.card(i).adv + ' now')), { skip: 'No', force: true });
        if (t) { X.card(t).adv++; X.log({ t: 'adv', iid: t, sid: (X.serverOf(t) || {}).id, n: X.card(t).adv, k: X.card(t).rez ? X.card(t).k : null, by: 'puppet_master' }); }
      }
    },
    bot: { puppet: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'agenda') || pr.options[0] || {}).id || 'skip' }
  });
  S('waiver', '10091', '', { subs: [{ k: 's', n: 0, text: 'Trace 5 — the Runner shows their grip; every card in it costing no more than the excess is trashed' }] });
  on('waiver', {
    subs: [function* (X, iid) {
      const tr = yield* X.trace(5 + X.mod('subTraceBase', 0, { iid }), 'Waiver');
      if (!tr.ok) return null;
      X.reveal('runner', X.R.grip.slice(), 'Waiver');
      const hit = X.R.grip.filter(i => (X.dat(i).cost || 0) <= tr.excess);
      for (const t of hit) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); }
      X.log({ t: 'note', side: 'corp', text: 'Waiver: ' + X.plural(hit.length, 'card') + ' trashed from the grip' });
      return null;
    }]
  });
  S('exchange_info', '10092', 'Only while the Runner is tagged. Swap an agenda in your score area with one in theirs.');
  on('exchange_info', {
    playBad: (X) => !X.tagged() ? 'Only while the Runner is tagged' : !X.C.score.some(i => X.dat(i).type === 'agenda') || !X.R.score.some(i => X.dat(i).type === 'agenda') ? 'Needs an agenda in each score area' : null,
    *play(X, iid) {
      const mine = yield* X.ask(iid, 'corp', 'exchangeMine', 'Exchange of Information: give up which of your agendas?', X.C.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')));
      const theirs = yield* X.ask(iid, 'corp', 'exchangeTheirs', 'Exchange of Information: take which of the Runner’s agendas?', X.R.score.filter(i => X.dat(i).type === 'agenda').map(i => X.cardOpt(i, null, X.dat(i).pts + ' points')));
      if (!mine || !theirs) return;
      X.lift(mine); X.lift(theirs); X.R.score.push(mine); X.C.score.push(theirs);
      X.log({ t: 'note', side: 'corp', text: 'Exchange of Information: ' + X.nameOf(mine) + ' for ' + X.nameOf(theirs) });
      X.winCheck();
    },
    bot: { exchangeMine: (pub, me, pr) => pr.options.slice().sort((a, b) => D.CARDS[a.card].pts - D.CARDS[b.card].pts)[0].id, exchangeTheirs: (pub, me, pr) => pr.options.slice().sort((a, b) => D.CARDS[b.card].pts - D.CARDS[a.card].pts)[0].id },
    botPlay: (pub) => pub.runner.score.some(k => (D.CARDS[k] || {}).pts >= 2) ? 3 : -1
  });
  S('red_tape', '10093', '', { subs: [{ k: 's', n: 0, text: 'Every ice has +3 strength for the rest of the run' }] });
  on('red_tape', { subs: [function (X) { X.g.run.iceBoost = (X.g.run.iceBoost || 0) + 3; X.log({ t: 'note', side: 'corp', text: 'Red Tape: every ice is 3 stronger this run' }); return null; }] });
  S('consulting_visit', '10094', 'Alliance (free with 6 other Weyland cards). Double. Find an operation in R&D and play it (paying for it); shuffle.', { ally: { fac: 'weyland', n: 6 } });
  on('consulting_visit', {
    playBad: (X) => X.C.rd.some(i => X.dat(i).type === 'operation') ? null : 'No operation in R&D',
    *play(X, iid) {
      X.g.revealN++;
      const opts = X.dedupe(X.C.rd.filter(i => X.dat(i).type === 'operation').map(i => { const sc = D.SCRIPT[X.card(i).k]; return X.cardOpt(i, null, X.playCost(i) + ' credits', X.C.credits < X.playCost(i) ? 'Costs ' + X.playCost(i) : (sc && sc.playBad ? sc.playBad(X, i) : null)); }));
      const t = yield* X.ask(iid, 'corp', 'consulting', 'Consulting Visit: play which operation?', opts, { skip: 'None' });
      X.shuffleRD();
      if (t) { X.lift(t); X.C.hq.push(t); yield* X.playOp(t); }
    },
    bot: { consulting: (pub, me, pr) => (pr.options.find(o => !o.bad && /hedge|beanstalk|restructure/.test(o.card)) || pr.options.find(o => !o.bad) || {}).id || 'skip' },
    botPlay: () => 0.6
  });
  S('vanilla', '10095', '', { subs: [{ k: 'etr' }] });

  /* ================================================================ FEAR THE MASSES */
  S('fear_masses', '10096', 'Run HQ. If successful, instead of accessing, show any number of Fear the Masses from your grip: the Corp trashes the top 1 + that many cards of R&D.');
  on('fear_masses', Object.assign(oneRun('hq'), {
    *success(X, iid) {
      const more = X.R.grip.filter(i => X.card(i).k === 'fear_masses');
      const ts = more.length ? yield* X.ask(iid, 'runner', 'fearMore', 'Fear the Masses: show how many more from your grip?', more.map(i => X.cardOpt(i)), { multi: true, min: 0, max: more.length }) : [];
      if (ts.length) X.reveal('runner', ts, 'Fear the Masses');
      const n = 1 + ts.length;
      for (let k = 0; k < n && X.C.rd.length; k++) X.toArchives(X.C.rd[0], false);
      X.log({ t: 'note', side: 'runner', text: 'Fear the Masses: the top ' + X.plural(n, 'card') + ' of R&D go to Archives' });
      return 'replace';
    },
    bot: { fearMore: (pub, me, pr) => pr.options.map(o => o.id) },
    botPlay: () => 1
  }));
  S('aghora', '10097', '1 credit: break one subroutine on an ice costing 5 or more to rez. 1 credit: +1 strength. 2 credits: swap it for a deva from your grip.', DEVA);
  on('aghora', deva((X, b, E) => (X.dat(E.iid).cost || 0) >= 5));
  S('bhagat', '10098', 'The first successful run on HQ each turn: the Corp trashes the top card of R&D.');
  on('bhagat', { on: { success(X, iid, ctx) { if (ctx.sid !== 'hq' || X.card(iid).x.turn === X.g.turnN || !X.C.rd.length) return; X.card(iid).x.turn = X.g.turnN; X.toArchives(X.C.rd[0], false); X.log({ t: 'mill', k: 'bhagat' }); } }, botPlay: () => 1 });
  S('black_file', '10099', 'The Corp cannot win on points. When your turn begins, a power counter on it; at 3 it leaves the game. One per deck.');
  on('black_file', {
    mod: { noCorpPointsWin: () => true },
    on: { runnerTurnBegin(X, iid) { X.card(iid).power++; if (X.card(iid).power >= 3) { X.lift(iid); X.wipe(X.card(iid)); X.R.gone.push(iid); X.log({ t: 'note', side: 'runner', text: 'The Black File leaves the game' }); X.winCheck(); } } },
    botPlay: (pub) => pub.corp.points >= 5 ? 4 : -1
  });
  S('price_of_freedom', '10100', 'As an extra cost, trash one of your installed connections. The Corp cannot advance cards next turn. It leaves the game.');
  on('price_of_freedom', {
    playBad: (X) => X.rigOf('resource').some(i => kw(X, i, /Connection/)) ? null : 'Needs an installed connection to trash',
    *play(X, iid) {
      const t = yield* X.ask(iid, 'runner', 'priceConn', 'The Price of Freedom: trash which connection?', X.rigOf('resource').filter(i => kw(X, i, /Connection/)).map(i => X.cardOpt(i)), { always: true });
      if (t) X.trashRunner(t, 'price_of_freedom');
      X.C.noAdvTurn = X.g.turnN + 1;
      X.lift(iid); X.R.gone.push(iid);
      X.log({ t: 'note', side: 'runner', text: 'The Price of Freedom: the Corp cannot advance cards next turn' });
    },
    botPlay: () => -1
  });
  S('ankusa', '10101', '2 credits: break one barrier subroutine. 1 credit: +1 strength. When it breaks every subroutine on a barrier, that barrier goes back to HQ.', { str: 0, brk: { type: 'barrier', cost: 2, n: 1 }, pump: { cost: 1, by: 1 } });
  on('ankusa', {
    onBreak(X, iid, ctx) { ctx.E.used.ankusa = (ctx.E.used.ankusa || 0) + ctx.subs.length; },
    on: { fullyBroken(X, iid, ctx) { if ((ctx.E.used.ankusa || 0) < ctx.E.subs.length || X.typesOf(ctx.iid).indexOf('barrier') < 0 || !X.isInstalled(ctx.iid)) return; ctx.E.used.ankusa = 0; const k = X.card(ctx.iid).k; X.toHQ(ctx.iid); X.log({ t: 'note', side: 'runner', text: 'Ankusa: ' + D.CARDS[k].name + ' goes back to HQ' }); } }
  });
  S('rigged_results', '10102', 'Spend up to 2 credits in secret; the Corp guesses how many. If it guesses wrong, choose an ice and run its server, slipping past that ice the first time you meet it.');
  on('rigged_results', {
    playBad: (X) => X.corpPlaced().some(i => X.dat(i).type === 'ice' && X.serverOf(i) && !X.runBad(X.serverOf(i).id, 1)) ? null : 'No ice protecting a server you can run',
    *play(X, iid) {
      const most = Math.min(2, X.avail('runner', 'any'));
      const bid = +(yield* X.ask(iid, 'runner', 'riggedBid', 'Rigged Results: spend how much, in secret?', [0, 1, 2].map(n => ({ id: String(n), label: 'Spend ' + n, bad: n > most ? 'You have ' + most : null })), { always: true, secret: true, pub: 'The Runner spends in secret' }));
      X.pay('runner', bid, 'any');
      const guess = +(yield* X.ask(iid, 'corp', 'riggedGuess', 'Rigged Results: how much did the Runner spend?', [0, 1, 2].map(n => ({ id: String(n), label: 'Guess ' + n })), { always: true }));
      X.log({ t: 'note', side: 'runner', text: 'Rigged Results: the Runner spent ' + bid + ', the Corp guessed ' + guess });
      if (guess === bid) return;
      const ice = X.corpPlaced().filter(i => X.dat(i).type === 'ice' && X.serverOf(i) && !X.runBad(X.serverOf(i).id, 1));
      const t = yield* X.ask(iid, 'runner', 'riggedIce', 'Rigged Results: slip past which ice (and run its server)?', ice.map(i => ({ id: i, label: (X.card(i).rez ? X.nameOf(i) : 'Unrezzed ice') + ' · ' + X.srvName(X.serverOf(i)) + ', position ' + (X.serverOf(i).ice.indexOf(i) + 1) })), { always: true });
      if (t) yield* X.run(X.serverOf(t).id, { card: iid, via: 'rigged_results', rigged: t });
    },
    runEnc(X, iid, ctx) { if (ctx.S.o.rigged === ctx.iid && !ctx.S.riggedDone) { ctx.S.riggedDone = true; ctx.E.bypass = 'rigged_results'; } return null; },
    bot: { riggedBid: (pub) => String(Math.min(2, pub.runner.credits) % 2), riggedGuess: () => '1', riggedIce: (pub, me, pr) => pr.options[pr.options.length - 1].id },
    botPlay: () => 0.6
  });
  S('magnet', '10103', 'When rezzed, move a program hosted on an ice onto it. Programs on it have no abilities.', { subs: [{ k: 'etr' }] });
  on('magnet', {
    *onRez(X, iid) {
      const progs = X.programs().filter(i => { const h = X.card(i).host; return h && h !== iid && X.card(h).side === 'corp' && X.dat(h).type === 'ice'; });
      if (!progs.length) return;
      const t = yield* X.ask(iid, 'corp', 'magnet', 'Magnet: move which program onto it?', progs.map(i => X.cardOpt(i)), { always: true });
      if (t) { X.card(t).host = iid; X.log({ t: 'note', side: 'corp', text: 'Magnet pulls ' + X.nameOf(t) + ' onto itself' }); }
    }
  });
  S('lateral_growth', '10104', 'Gain 4 credits. You may install a card (paying for it).');
  on('lateral_growth', {
    *play(X, iid) {
      X.gain('corp', 4); X.log({ t: 'gain', side: 'corp', n: 4, k: 'lateral_growth' });
      const pool = X.C.hq.filter(i => X.dat(i).type !== 'operation');
      if (!pool.length) return;
      const t = yield* X.ask(iid, 'corp', 'lateral', 'Lateral Growth: install a card?', pool.map(i => X.cardOpt(i)), { skip: 'No' });
      if (t) yield* X.corpInstall(t, {});
    },
    bot: { lateral: (pub, me, pr) => (pr.options.find(o => (D.CARDS[o.card] || {}).type === 'ice') || pr.options[0] || {}).id || 'skip' },
    botPlay: () => 2.2
  });
  S('protein_source', '10105', 'When scored or stolen, the Runner gains 4 credits.');
  const protein = (X) => { X.gain('runner', 4); X.log({ t: 'gain', side: 'runner', n: 4, k: 'protein_source' }); };
  on('protein_source', { onScore: protein, onSteal: protein });
  S('voter_intimidation', '10106', 'Only with an agenda in the Runner’s score area. Psi game: if the bids differ, trash one of the Runner’s resources.');
  on('voter_intimidation', {
    playBad: (X) => X.R.score.some(i => X.dat(i).type === 'agenda') ? (X.rigOf('resource').length ? null : 'The Runner has no resources') : 'Only with an agenda in the Runner’s score area',
    *play(X, iid) {
      if (!(yield* X.psi('Voter Intimidation'))) return;
      const t = yield* X.ask(iid, 'corp', 'voterTrash', 'Voter Intimidation: trash which resource?', X.rigOf('resource').map(i => X.cardOpt(i)), { always: true });
      if (t) yield* X.corpTrashes(t, 'Voter Intimidation');
    },
    botPlay: () => 0.6
  });
  S('harishchandra', '10107', 'While the Runner is tagged, their grip is open for all to see.');
  on('harishchandra', { mod: { gripOpen: (X) => X.tagged() } });
  S('fir', '10108', 'Carries up to 2 assets and/or agendas (installed on it). It costs 3 more to trash for each card on it.');
  on('fir', {
    hostedAct: true,
    hostTarget: (X, h, t) => ['asset', 'agenda'].indexOf(X.dat(t).type) >= 0 && X.hostedCorp(h).length < 2,
    self: { trashCost: (X, iid, v) => v + 3 * X.hostedCorp(iid).length },
    show: (X, iid) => X.hostedCorp(iid).length ? X.plural(X.hostedCorp(iid).length, 'card') + ' on it' : null
  });
  S('ibrahim_salem', '10109', 'Alliance (free with 6 other NBN cards). To rez him, forfeit an agenda. When your turn begins, name a card type, look at the Runner’s grip and trash a card of that type.', { ally: { fac: 'nbn', n: 6 }, rezForfeit: true });
  on('ibrahim_salem', {
    on: {
      *corpTurnBegin(X, iid) {
        const type = yield* X.ask(iid, 'corp', 'ibrahimType', 'Ibrahim Salem: name a card type', ['event', 'hardware', 'program', 'resource'].map(t => ({ id: t, label: t[0].toUpperCase() + t.slice(1) })), { always: true });
        X.g.revealN++;
        const hit = X.R.grip.filter(i => X.dat(i).type === type);
        X.log({ t: 'note', side: 'corp', text: 'Ibrahim Salem names ' + type + 's and looks at the Runner’s grip' });
        if (!hit.length) { yield* X.ask(iid, 'corp', 'ibrahimLook', 'Ibrahim Salem: the Runner’s grip (no ' + type + ')', X.R.grip.map(i => X.cardOpt(i, null, null, 'Not a ' + type)).concat([{ id: 'ok', label: 'Carry on' }]), { always: true }); return; }
        const t = yield* X.ask(iid, 'corp', 'ibrahim', 'Ibrahim Salem: trash which card from the Runner’s grip?', X.R.grip.map(i => X.cardOpt(i, null, null, X.dat(i).type === type ? null : 'Not a ' + type)), { always: true });
        if (t && X.R.grip.indexOf(t) >= 0) { X.lift(t); X.card(t).up = true; X.R.heap.push(t); X.log({ t: 'note', side: 'corp', text: 'Ibrahim Salem trashes ' + X.nameOf(t) + ' from the grip' }); }
      }
    },
    bot: { ibrahimType: (pub) => 'event', ibrahim: (pub, me, pr) => (pr.options.find(o => !o.bad) || pr.options[0]).id, ibrahimLook: () => 'ok' }
  });
  S('navi_mumbai', '10110', 'During runs on this server, the Runner can use paid abilities only on icebreakers. One region per server.');
  on('navi_mumbai', { mod: { onlyBreakerAbils: (X, iid, v) => v || (!!X.g.run && !!X.serverOf(iid) && X.g.run.sid === X.serverOf(iid).id) } });
  S('zealous_judge', '10111', 'Can be rezzed only while the Runner is tagged. A click and 1 credit: give the Runner a tag.');
  on('zealous_judge', {
    self: { rezBad: (X, iid, v) => v || (X.tagged() ? null : 'Only while the Runner is tagged') },
    abils: () => [{ label: 'Zealous Judge: give the Runner a tag', clicks: 1, cost: 1 }],
    *use(X) { yield* X.giveTags(1, 'Zealous Judge'); },
    botAbil: () => 1.2
  });
  S('election_day', '10112', 'Trash every card in HQ (at least 1), then draw 5.');
  on('election_day', {
    playBad: (X) => X.C.hq.filter(i => X.card(i).k !== 'election_day').length ? null : 'Nothing else in HQ',
    play(X) { const n = X.C.hq.length; for (const t of X.C.hq.slice()) X.toArchives(t, false); X.log({ t: 'note', side: 'corp', text: 'Election Day: ' + X.plural(n, 'card') + ' from HQ to Archives' }); X.drawCorp(5, 'election_day'); },
    botPlay: (pub, me) => (me.hand || []).length <= 3 ? 0.8 : -1
  });
  S('subcontract', '10113', 'Only while the Runner is tagged. Play up to 2 operations from HQ, one after the other (paying for them).');
  on('subcontract', {
    playBad: (X) => X.tagged() ? null : 'Only while the Runner is tagged',
    *play(X, iid) {
      for (let n = 0; n < 2; n++) {
        const ops = X.C.hq.filter(i => X.dat(i).type === 'operation' && X.card(i).k !== 'subcontract');
        if (!ops.length) return;
        const t = yield* X.ask(iid, 'corp', 'subcontract', 'Subcontract: play which operation (' + (n + 1) + ' of 2)?', ops.map(i => { const sc = D.SCRIPT[X.card(i).k]; return X.cardOpt(i, null, X.playCost(i) + ' credits', X.C.credits < X.playCost(i) ? 'Costs ' + X.playCost(i) : (sc && sc.playBad ? sc.playBad(X, i) : null)); }), { skip: 'Stop' });
        if (!t) return;
        yield* X.playOp(t);
      }
    },
    bot: { subcontract: (pub, me, pr) => (pr.options.find(o => !o.bad && /scorched|psf|traffic/.test(o.card)) || pr.options.find(o => !o.bad) || {}).id || 'skip' },
    botPlay: () => 0.7
  });
  S('merger', '10114', 'Worth 1 point more in the Runner’s score area.');
  on('merger', { self: { agendaPts: (X, iid, v, ctx) => ctx.side === 'runner' ? v + 1 : v } });

  D.SET_LOADED.mumbad = true;
})(typeof window !== 'undefined' ? window : this);
