'use strict';
/* A Gest of Robin Hood — the house. It decides from (publicView, seatView)
 * only (LESSONS-CHECKLIST C/G: honest, not omniscient): the house Sheriff
 * never knows which Hidden man is Robin Hood, the house Robin Hood never
 * knows what a face-down Carriage holds.
 *
 * One brain, three levels (G1): every option is priced in one currency (a
 * step of the Royal Favour = 1), the price jogged by noise that is a hash of
 * what is being decided (never Math.random, never the prompt number), with
 * the odd forgotten good option (slip). Easy also plays without its plan for
 * the initiative and without the events' values.
 *
 * At the turn's box it makes a PLAN (which Plot, which spaces, which Deed),
 * keyed by game and card, and follows it through the sub-questions; any
 * question the plan did not foresee is priced on its own.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./rh-data.js') : root.RhData;
  const E = (typeof module !== 'undefined' && module.exports) ? require('./rh-engine.js') : root.RhEngine;
  const VERSION = 1;
  const K = id => String(id).split('.')[0];

  /* The level knobs (G1: hard first, then take away). */
  const LEVEL = {
    hard:   { noise: 0.12, slip: 0, wild: 0, plan: true, events: true, initiative: true },
    medium: { noise: 0.45, slip: 0.12, wild: 0.04, plan: true, events: true, initiative: true },
    easy:   { noise: 1.0, slip: 0.3, wild: 0.15, plan: false, events: false, initiative: false, deeds: 0.5 }
  };
  /* Easy is the house without its plan (G1, the Obsession/Arnak lesson): no
     initiative, no reading of the events, and half its Deeds forgotten. Noise alone left the
     Easy Sheriff as strong as Medium once the rules were put right from the
     GMT book (2026-11-25: Robin v easy 64.3%, v medium 65.0%). */
  /* The currency: one step of the Royal Favour. */
  const V = { shill: 0.22, man: 0.33, hench: 0.26, camp: 1.25, flip: 0.55, robin: 2.2, deny: 0.6 };

  const memory = new Map();       /* keyed by game id: the plan for the card in hand */
  function mem(pub, side) {
    const k = pub.gid + ':' + side;
    let m = memory.get(k);
    if (!m) { m = {}; memory.set(k, m); if (memory.size > 64) memory.delete(memory.keys().next().value); }
    return m;
  }
  /* Noise from a hash of what is decided (FS lesson: never the prompt n). */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
  function jog(pub, me, key, lv) { return (hash(pub.gid + '|' + me.side + '|' + pub.turnN + '|' + pub.logN + '|' + key) - 0.5) * 2 * lv.noise; }
  const lvOf = (pub, me) => { const p = pub.players.find(x => x.id === me.id); return LEVEL[(p && p.level) || 'medium'] || LEVEL.medium; };

  /* ================================================================
     Reading the board
     ================================================================ */
  function B(pub, me) {
    const sp = pub.spaces;
    const b = { bridge: pub.bridge, oak: pub.oak };
    const men = id => sp[id].hidden + sp[id].rev + (sp[id].robin ? 1 : 0);
    const plain = id => men(id) - (robinHere(id) ? 1 : 0);
    const robinHere = id => (me.side === 'robin' ? me.robinAt === id : pub.robinAt === id);
    const nb = (id, side) => E.neighbours(b, id, side || me.side);
    const hNear = id => nb(id, 'sheriff').reduce((s, n) => s + sp[n].h, 0);
    const mNear = id => nb(id, 'robin').reduce((s, n) => s + men(n), 0);
    /* How exposed a space is to the Sheriff next card: Henchmen there or
       a short march away. */
    const danger = id => (sp[id].h > 0 ? 1 : hNear(id) > 0 ? 0.55 : 0.15);
    const state = id => sp[id].state;
    const isSub = id => state(id) === 'sub';
    const isRev = id => state(id) === 'rev';
    const subParishes = () => D.PARISHES.filter(isSub).length;
    const availMen = () => pub.avail.men;
    return { sp, b, men, plain, robinHere, nb, hNear, mNear, danger, state, isSub, isRev, subParishes, availMen };
  }

  /* What a face-down Carriage may hold, to Robin Hood: the six less those
     used or Revealed. The Sheriff simply knows. */
  function carriagePool(pub) {
    const left = { tallage: 2, tribute: 2, trap: 2 };
    for (const k of pub.used) left[k]--;
    for (const id of D.IDS) for (const c of pub.spaces[id].cars) if (c.kind) left[c.kind]--;
    const out = [];
    for (const k of Object.keys(left)) for (let i = 0; i < left[k]; i++) out.push(k);
    return out.length ? out : ['tallage', 'tribute', 'trap'];
  }
  function carriageWin(kind) {
    const C = D.CARRIAGES[kind];
    return C.rh * V.shill + C.justice + V.deny * (C.sh * V.shill + C.order);
  }
  /* The Travellers still to come off the deck (all of them, less the public piles). */
  function travPool(pub) {
    const t = pub.trav;
    const gone = {};
    for (const x of t.disc.concat(t.victims, t.out, t.aside)) gone[x] = 1;
    let pool = D.TRAVELLER_IDS.filter(x => !gone[x]);
    if (!pool.length || t.deck === 0) pool = t.disc.slice();
    return pool.length ? pool : ['merchant.1'];
  }
  /* The value of a Traveller once drawn: the better of its two halves. */
  function travBest(card, p, robbers, withRobin, bd, at, pub) {
    const T = D.TRAVELLERS[K(card)];
    const half = (o, key) => {
      if (!o) return -9;
      if (o.noRoll) return pub.sh.robin >= o.cost ? 1 + V.flip + 0.6 - o.cost * V.shill : -9;
      let win = (o.gain || 0) * V.shill + (o.fromSheriff || 0) * V.shill * 2 + (o.justice || 0) + (o.recruit ? V.man : 0) + (o.removeCard ? 0.3 : 0) + (o.placeRobin ? -0.2 : 0);
      let lose = (o.loseSheriff || 0) * V.shill + (o.loseCapture ? robbers * 0.5 + (withRobin ? V.robin : 0) : 0) + (o.loseSubmit ? (bd.state(at) === 'rev' ? V.flip : 0.1) : 0) + (o.loseRobin ? V.robin : 0) + (o.loseHenchman ? V.hench : 0);
      return p * win - (1 - p) * lose;
    };
    return Math.max(half(T.a, 'a'), T.single ? -9 : half(T.b, 'b'));
  }
  /* A Rob's worth in one space: the best target with the best robbers. */
  function robPlan(pub, me, bd, at, bonus, only) {
    const sp = bd.sp[at];
    const hp = sp.hidden - (me.robinAt === at && !me.robinRev ? 1 : 0);
    const rh = me.robinAt === at;
    const die = (D.SPACES[at].kind === 'forest' || sp.state === 'rev') ? 'green' : 'white';
    const targets = [];
    if (pub.trav.deck + pub.trav.disc.length) targets.push({ id: 'traveller' });
    for (const c of sp.cars) targets.push({ id: c.id, kind: c.kind });
    if (at === 'nottingham') targets.push({ id: 'treasury' });
    if (only) for (let i = targets.length - 1; i >= 0; i--) if (targets[i].id !== only) targets.splice(i, 1);
    let best = null;
    const crew = [];
    for (let k = 0; k <= hp; k++) { if (k) crew.push({ k, r: false }); if (rh) crew.push({ k, r: true }); }
    for (const t of targets) for (const c of crew) {
      const n = c.k + (c.r ? 1 : 0);
      const reveal = c.k * 0.22 * bd.danger(at) + (c.r && !me.robinRev ? 0.9 * bd.danger(at) : 0) + (c.r ? 0.35 * bd.danger(at) : 0);
      let ev;
      if (t.id === 'treasury') { const p = E.robOdds(die, n, bonus, sp.h); ev = p * (Math.min(2, pub.sh.sheriff) * V.shill * 2 + 1); }
      else if (t.id === 'traveller') {
        const pool = travPool(pub);
        ev = pool.reduce((s, card) => { const p = E.robOdds(die, n, bonus, D.TRAVELLERS[K(card)].def + sp.h); return s + travBest(card, p, n, c.r, bd, at, pub); }, 0) / pool.length;
      } else {
        const kinds = t.kind ? [t.kind] : carriagePool(pub);
        ev = kinds.reduce((s, kd) => { const C = D.CARRIAGES[kd]; const p = E.robOdds(die, n, bonus, C.def + sp.h); return s + p * carriageWin(kd) - (1 - p) * (C.capture ? n * 0.5 + (c.r ? V.robin : 0) : 0); }, 0) / kinds.length;
      }
      const v = ev - reveal;
      if (!best || v > best.v) best = { v, target: t.id, code: c.k + (c.r ? 'r' : ''), n };
    }
    return best;
  }

  /* ================================================================
     Pricing a Plot in a space (the plan's building block)
     ================================================================ */
  function spaceValue(pub, me, bd, plot, at, o) {
    o = o || {};
    const sp = bd.sp[at];
    const cost = o.free ? 0 : (D.PLOTS[me.side][plot] || {}).cost || 0;
    let v = -9;
    if (plot === 'recruit') {
      if (sp.camps > 0) v = Math.max(Math.min(2, bd.availMen()) * V.man * (D.SPACES[at].kind === 'forest' ? 1.1 : 0.9), sp.rev * 0.3 * bd.danger(at) + (bd.robinHere(at) && me.robinRev ? 0.6 * bd.danger(at) : 0));
      else {
        if (bd.plain(at) > 0 && pub.avail.camps > 0) v = 1 + 0.45 - V.man;
        if (bd.availMen() > 0) v = Math.max(v, V.man + (D.SPACES[at].kind === 'forest' ? 0.08 : 0) + (sp.state === 'rev' ? 0.05 : 0));
      }
    } else if (plot === 'sneak') {
      const n = bd.men(at);
      if (!n) return -9;
      const out = sneakDest(pub, me, bd, at);
      v = out ? out.v : -9;
    } else if (plot === 'rob') {
      const r = robPlan(pub, me, bd, at, o.bonus || 0);
      v = r ? r.v : -9;
    } else if (plot === 'hire') {
      if (at === 'nottingham') v = Math.min(4, pub.avail.h) * V.hench * 0.8;
      else if (sp.state === 'sub') v = Math.min(2, pub.avail.h) * V.hench * (bd.men(at) || bd.mNear(at) ? 1.35 : 0.7);
      else if (sp.state === 'rev') v = V.flip * 1.5 + (bd.subParishes() === 4 ? 0.7 : 0);
    } else if (plot === 'patrol') {
      const come = sp.h + bd.nb(at, 'sheriff').reduce((s, n) => s + bd.sp[n].h, 0);
      const k = D.SPACES[at].kind === 'forest' ? Math.floor(come / 2) : come;
      const shown = Math.min(sp.hidden, k);
      v = shown * 0.42 + (sp.hidden ? shown / sp.hidden * 0.5 : 0) + sp.camps * 0.2 * (shown >= sp.hidden ? 1 : 0) - 0.1;
    } else if (plot === 'capture') {
      const per = sp.state === 'rev' ? Math.floor(sp.h / 2) : sp.h;
      let left = per;
      const m = Math.min(left, sp.rev); left -= m; v = m * 0.6;
      if (left > 0 && sp.robin) { v += V.robin + 1; left--; }
      if (left > 0 && !sp.hidden) v += Math.min(left, sp.camps) * (V.camp + 1);
      if (!m && v === 0) v = -9;
    }
    return v - cost * V.shill;
  }
  function sneakDest(pub, me, bd, at) {
    let best = null;
    const n = bd.men(at);
    const relief = (bd.sp[at].rev + (me.robinAt === at && me.robinRev ? 2 : 0)) * 0.3 * bd.danger(at);
    for (const d of bd.nb(at, 'robin')) {
      const ds = bd.sp[d];
      let v = relief;
      if (ds.state === 'sub' && D.SPACES[d].kind === 'parish' && n >= ds.h) v += 0.45 + (bd.subParishes() === 5 ? 0.3 : 0);
      if (ds.cars.length) v += 0.35;
      if (d === 'nottingham') v += 0.15;
      if (ds.state === 'sub' && n + ds.h > 3) v -= 0.4;
      v -= ds.h * 0.12;
      if (D.SPACES[d].kind === 'forest') v += 0.05;
      if (!best || v > best.v) best = { v, to: d };
    }
    return best;
  }

  /* The Deeds, priced. */
  function deedValue(pub, me, bd, id) {
    const sh = pub.sh[me.side];
    if (me.side === 'robin') {
      if (id === 'donate') { const ps = D.PARISHES.filter(p => bd.isSub(p) && bd.men(p) && bd.men(p) >= bd.sp[p].h); const k = Math.min(2, ps.length, Math.floor(sh / 2)); return k * (V.flip + 0.25 + (bd.subParishes() - k <= 4 && bd.subParishes() >= 5 ? 0.5 : 0) - 2 * V.shill); }
      if (id === 'turncoat') return 0.6 - V.shill;
      if (id === 'inspire') { const at = me.robinAt; if (!D.SPACES[at] || D.SPACES[at].kind !== 'parish' || me.robinRev) return -9; return (bd.isRev(at) ? 1 : V.flip + 0.2) - 0.6 * bd.danger(at); }
      if (id === 'swashbuckle') { if (me.robinAt === 'prison') return 2.2; if (!D.SPACES[me.robinAt]) return -9; return me.robinRev ? 0.9 * bd.danger(me.robinAt) + 0.1 : 0.15 * bd.danger(me.robinAt); }
    } else {
      if (id === 'ride') { let best = 0; for (const p of D.PARISHES) { const v = (bd.men(p) ? 0.5 : 0) + (bd.isRev(p) && bd.men(p) < Math.min(4, bd.sp.nottingham.h) ? 0.5 : 0); best = Math.max(best, v); } return best * Math.min(1, bd.sp.nottingham.h / 2); }
      if (id === 'confiscate') { const ps = D.PARISHES.filter(p => bd.isSub(p) && bd.sp[p].h > 0); const k = Math.min(2, ps.length, pub.avail.cars); return k * (0.95 - V.flip) - (bd.subParishes() - k < 5 && bd.subParishes() >= 5 ? 0.6 : 0); }
      if (id === 'disperse') { let best = -9; for (const p of D.PARISHES.filter(q => bd.sp[q].h > 0)) { const s = bd.sp[p]; const v = Math.min(2, s.rev) * 0.45 + (s.robin ? 0.8 : 0) + (bd.men(p) <= 2 && s.camps ? V.camp + 1 : 0) + Math.min(2, s.hidden) * 0.35 - (bd.isSub(p) ? V.flip : 0); best = Math.max(best, v); } return best - 3 * V.shill; }
    }
    return -9;
  }

  /* An event half, priced roughly (Easy does not look). */
  const EV = {
    robin: { 2: 0.5, 4: 0.6, 5: 0.9, 6: 1.2, 7: 1.5, 9: 1.9, 10: 1.0, 11: 0.6, 12: 0.4, 13: 1.3, 15: 1.4, 17: 1.5, 18: 1.3, 19: 0.5, 20: 1.5, 21: 1.2, 22: 1.5, 23: 1.6, 24: 1.3, 25: 1.0, 26: 0.6, 27: 0.8, 28: 0.7, 29: 1.0 },
    sheriff: { 2: 0.9, 4: 0.5, 5: 0.6, 6: 1.0, 7: 0.9, 9: 0.6, 10: 1.4, 11: 1.0, 12: 1.2, 13: 1.2, 15: 1.0, 17: 0.8, 18: 0.9, 19: 0.4, 20: 1.8, 21: 0.8, 22: 0.8, 23: 0.6, 24: 1.0, 25: 0.7, 26: 0.6, 27: 0.9, 28: 0.7, 29: 0.8 }
  };
  function eventValue(pub, me, bd, id) {
    let v = (EV[me.side] || {})[id] || 0.5;
    if (me.side === 'robin' && id === 11) v = pub.prison.n * 0.45 + (pub.prison.robin ? 1.8 : 0);
    if (me.side === 'robin' && id === 19) v = Math.floor(pub.prison.n / 2) * 0.45 + (pub.prison.robin ? 0.8 : 0);
    if (me.side === 'sheriff' && id === 19) v = Math.floor((pub.prison.n - (pub.prison.robin ? 1 : 0)) / 2) * 1;
    if (me.side === 'robin' && id === 4) v = me.robinAt === 'prison' ? 1.9 : me.robinRev ? 0.9 : 0.3;
    if (me.side === 'sheriff' && id === 6) v = pub.robinAt && D.SPACES[pub.robinAt] ? 1.6 : 1.0;
    return v;
  }

  /* ================================================================
     The plan, made at the turn's box
     ================================================================ */
  function bestPlots(pub, me, bd, mode, o) {
    o = o || {};
    const ids = me.side === 'robin' ? ['recruit', 'sneak', 'rob'] : ['hire', 'patrol', 'capture'];
    let best = null;
    const max = mode === 'single' ? 1 : 3;
    for (const plot of ids) {
      if (o.only && plot !== o.only) continue;
      const vals = [];
      for (const at of D.IDS) {
        if (at === 'ollerton') continue;
        const v = spaceValue(pub, me, bd, plot, at, o);
        if (v > -5) vals.push({ at, v });
      }
      vals.sort((a, b) => b.v - a.v);
      const cost = o.free ? 0 : D.PLOTS[me.side][plot].cost;
      const afford = cost ? Math.floor(pub.sh[me.side] / cost) : 3;
      /* Only spaces worth doing: a plan of losing Plots must lose to a Pass
         (G: "the house never makes a play that only hurts itself"). */
      const pick = vals.filter(x => x.v > 0).slice(0, Math.min(max, afford));
      if (!pick.length) continue;
      const v = pick.reduce((s, x) => s + x.v, 0);
      if (!best || v > best.v) best = { plot, spaces: pick.map(x => x.at), v };
    }
    return best;
  }
  function planTurn(pub, me, pr, lv) {
    const bd = B(pub, me);
    const opts = pr.options.filter(x => !x.bad);
    const scored = [];
    for (const o of opts) {
      let v = 0, plan = { box: o.id };
      if (o.id === 'single') { const b = bestPlots(pub, me, bd, 'single'); if (!b) continue; v = b.v; plan.plot = b.plot; plan.spaces = b.spaces; if (lv.initiative) v += 0.35; }
      else if (o.id === 'pd') {
        const b = bestPlots(pub, me, bd, 'pd'); if (!b) continue;
        let dv = -9, dd = null;
        for (const d of Object.keys(D.DEEDS[me.side])) { const x = deedValue(pub, me, bd, d); if (x > dv) { dv = x; dd = d; } }
        if (lv.deeds != null && hash(pub.gid + pub.turnN + 'deed') < lv.deeds) dv = 0;
        v = b.v + Math.max(0, dv); plan.plot = b.plot; plan.spaces = b.spaces; plan.deed = dv > 0 ? dd : null;
        if (lv.initiative) v -= 0.3;
      } else if (o.id === 'event') {
        const own = me.side === 'robin' ? 'rh' : 'sh';
        /* Either half may be played (5.1.1); the house plays its own. */
        if (o.halves && o.halves.indexOf(own) < 0) continue;
        v = lv.events ? eventValue(pub, me, bd, pr.card) : 0.4;
      }
      else if (o.id === 'pass') { v = (me.side === 'robin' ? 1 : 3) * V.shill + (lv.initiative ? 0.2 : 0); plan.passBox = me.side === 'robin' ? 'single' : 'pd'; }
      v += jog(pub, me, 'turn:' + o.id, lv);
      if (lv.slip && hash(pub.gid + pub.turnN + o.id + 'slip') < lv.slip && o.id !== 'pass') v -= 0.8;
      scored.push({ v, plan });
    }
    scored.sort((a, b) => b.v - a.v);
    const plan = scored.length ? scored[0].plan : { box: 'pass' };
    const m = mem(pub, me.side);
    m.plan = Object.assign({ card: pub.turnN, used: 0 }, plan);
    return plan.box;
  }
  function planFor(pub, me) { const m = mem(pub, me.side); return m.plan && m.plan.card === pub.turnN ? m.plan : null; }

  /* ================================================================
     Answering
     ================================================================ */
  const legal = pr => pr.options.filter(o => !o.bad);
  const pickId = (pr, id) => ({ t: 'pick', n: pr.n, id });
  function bestBy(pr, score, pub, me, lv) {
    const L = legal(pr);
    if (!L.length) return pr.skip ? { t: 'skip', n: pr.n } : null;
    let best = null, bv = -1e9;
    for (const o of L) {
      const v = score(o) + jog(pub, me, pr.what + ':' + o.id, lv);
      if (v > bv) { bv = v; best = o; }
    }
    if (pr.skip && bv < -0.05) return { t: 'skip', n: pr.n };
    return pickId(pr, best.id);
  }
  function answer(pub, me, pr) {
    const lv = lvOf(pub, me);
    const bd = B(pub, me);
    const plan = lv.plan ? planFor(pub, me) : null;
    if (pr.t === 'turn') return { t: 'turn', n: pr.n, id: planTurn(pub, me, pr, lv) };
    const sp = bd.sp;
    const w = pr.what;
    const yesIf = c => pickId(pr, c ? 'yes' : 'no');
    switch (w) {
      case 'setupSplit': return pickId(pr, ['classic', 'balanced', 'aggressive'][Math.floor(hash(pub.gid + 'split') * 3)]);
      case 'setupRobin': return bestBy(pr, o => (o.space === 'remston' ? -0.3 : 0) + hash(pub.gid + o.id) * 0.5, pub, me, lv);
      case 'passBox': return pickId(pr, legal(pr).some(o => o.id === (plan && plan.passBox)) ? plan.passBox : legal(pr)[me.side === 'robin' ? 0 : legal(pr).length - 1].id);
      case 'plot': {
        if (plan && plan.plot && legal(pr).some(o => o.id === plan.plot)) return pickId(pr, plan.plot);
        const b = bestPlots(pub, me, bd, /Single/.test(pr.why) ? 'single' : 'pd');
        return pickId(pr, b && legal(pr).some(o => o.id === b.plot) ? b.plot : legal(pr)[0].id);
      }
      case 'plotSpace': {
        const plot = plotOf(pr.why);
        if (plan && plan.spaces) {
          while (plan.used < plan.spaces.length) { const at = plan.spaces[plan.used++]; if (legal(pr).some(o => o.id === at)) return pickId(pr, at); }
          if (pr.skip) return { t: 'skip', n: pr.n };
        }
        const bonus = /\+1/.test(pr.why) ? 1 : 0;
        return bestBy(pr, o => (plot ? spaceValue(pub, me, bd, plot, o.id, { free: true, bonus }) : 0.1), pub, me, lv);
      }
      case 'recruit': return bestBy(pr, o => ({ camp: 1.2, two: 0.7, one: 0.35, hide: 0.3 })[o.id] || 0, pub, me, lv);
      case 'sneakTo': {
        const from = pr.why.match(/from (.+?) \(/);
        const at = from ? D.IDS.find(k => D.SPACES[k].name === from[1]) : null;
        if (at && pr.skip && !(sp[at].rev + (me.robinAt === at && me.robinRev ? 1 : 0))) return { t: 'skip', n: pr.n };
        const d = at ? sneakDest(pub, me, bd, at) : null;
        return bestBy(pr, o => (d && o.id === d.to ? 1 : 0) - sp[o.id].h * 0.1 + (D.SPACES[o.id].kind === 'forest' ? 0.1 : 0), pub, me, lv);
      }
      case 'sneakN': case 'boatN': case 'redeployN': case 'gather': {
        /* Move everyone but Robin Hood when he is safer staying; take him
           when the place he leaves is the dangerous one. */
        const L = legal(pr);
        const nums = L.filter(o => o.id !== '0');
        if (!nums.length) return pickId(pr, L[0].id);
        const withR = nums.filter(o => /r$/.test(o.id)), without = nums.filter(o => !/r$/.test(o.id));
        const robinGo = me.robinRev || (D.SPACES[me.robinAt] && bd.danger(me.robinAt) >= 0.55);
        const pool = (robinGo && withR.length) || !without.length ? withR : without;
        pool.sort((a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0));
        return pickId(pr, pool[0].id);
      }
      case 'eventHalf': { const own = me.side === 'robin' ? 'rh' : 'sh'; return pickId(pr, legal(pr).some(o => o.id === own) ? own : legal(pr)[0].id); }
      case 'setupN': return pickId(pr, legal(pr)[legal(pr).length - 1].id);
      case 'hench2': return bestBy(pr, o => bd.men(o.id) * 0.3 + (sp[o.id].state === 'rev' ? 0.3 : 0), pub, me, lv);
      case 'campForest': return bestBy(pr, o => -bd.danger(o.id), pub, me, lv);
      case 'robbers': {
        const at = atOf(pr.why);
        const r = at ? robPlan(pub, me, bd, at, 0, pr.info && pr.info.target) : null;
        if (r && legal(pr).some(o => o.id === r.code)) return pickId(pr, r.code);
        return pickId(pr, legal(pr)[0].id);
      }
      case 'robTarget': {
        /* The target comes first now (3.2.3): price each with its best crew. */
        const at = atOf(pr.why);
        const bonus = /\+1/.test(pr.why) ? 1 : 0;
        return bestBy(pr, o => { const r = robPlan(pub, me, bd, at, bonus, o.id); return r ? r.v : -1; }, pub, me, lv);
      }
      case 'robOption': {
        const R = pub.log.slice().reverse().find(e => e.t === 'tdraw');
        const at = R ? R.at : null;
        if (!at) return pickId(pr, legal(pr)[0].id);
        const T = D.TRAVELLERS[K(R.card)];
        const die = (D.SPACES[at].kind === 'forest' || sp[at].state === 'rev') ? 'green' : 'white';
        const n = robbersIn(pub, at);
        const p = E.robOdds(die, n, 0, T.def + sp[at].h);
        return bestBy(pr, o => { const H = T[o.id]; return travBest(R.card + '', p, n, false, bd, at, pub) * 0 + halfVal(H, p, n, bd, at, pub); }, pub, me, lv);
      }
      case 'carriage': {
        /* The Sheriff knows his Carriages: roll the richest one that is
           safest, and the nearest home. */
        return bestBy(pr, o => {
          const c = (me.cars || []).find(x => x.id === o.id);
          if (!c) return 0;
          const to = D.SPACES[c.at].road;
          const C = D.CARRIAGES[c.kind];
          return (to === 'nottingham' ? 1.5 : 0) + C.order * 0.4 + C.sh * 0.05 - bd.men(to) * 0.25 + (bd.men(c.at) ? 0.4 : 0) + (c.kind === 'trap' ? -0.3 : 0);
        }, pub, me, lv);
      }
      case 'carriageOn': return yesIf(true);
      case 'escort': { const m = pr.why.match(/from (.+?) to (.+?)\?/); const to = m && D.IDS.find(k => D.SPACES[k].name === m[2]); return yesIf(to && to !== 'nottingham' && (bd.men(to) > 0 || bd.mNear(to) > 1)); }
      case 'deed': {
        if (lv.deeds != null && hash(pub.gid + pub.turnN + 'deed') < lv.deeds && pr.skip) return { t: 'skip', n: pr.n };
        if (plan && plan.deed && legal(pr).some(o => o.id === plan.deed)) return pickId(pr, plan.deed);
        return bestBy(pr, o => deedValue(pub, me, bd, o.id), pub, me, lv);
      }
      case 'donate': return bestBy(pr, o => V.flip + 0.2 - 2 * V.shill + (sp[o.id].h ? 0 : 0.1), pub, me, lv);
      case 'turncoat': return bestBy(pr, o => sp[o.id].h, pub, me, lv);
      case 'swashMate': return yesIf(true);
      case 'swashTo': case 'breakout': case 'potter': case 'miller': case 'escape': case 'robinBack': case 'marianTo': case 'redeployM':
        return bestBy(pr, o => -(sp[o.id] ? sp[o.id].h + bd.hNear(o.id) * 0.4 : 0) + (D.SPACES[o.id] && D.SPACES[o.id].kind === 'forest' ? 0.5 : 0) + (sp[o.id] && sp[o.id].camps ? 0.3 : 0) + (pr.skip ? -0.2 : 0), pub, me, lv);
      case 'inspire': return bestBy(pr, o => (sp[o.id].state === 'rev' ? 1 : 0.75) - sp[o.id].h * 0.2, pub, me, lv);
      case 'ride': return bestBy(pr, o => bd.men(o.id) * 0.3 + (sp[o.id].state === 'rev' ? 0.4 : 0) + sp[o.id].cars.length * 0.3, pub, me, lv);
      case 'rideN': case 'patrolN': case 'fairN': case 'allanN': return pickId(pr, legal(pr)[0].id);
      case 'confiscate': return bestBy(pr, o => sp[o.id].h * 0.2 - bd.mNear(o.id) * 0.15 - bd.men(o.id) * 0.3 + (D.SPACES[o.id].road === 'tuxford' || D.SPACES[o.id].road === 'shirewood' ? 0.2 : 0), pub, me, lv);
      case 'carKind': {
        const at = atOf(pr.why, true);
        const risky = at && (bd.men(at) || bd.mNear(at) > 1);
        return bestBy(pr, o => (o.id === 'trap' ? (risky ? 1 : 0.1) : o.id === 'tribute' ? 0.7 : 0.6), pub, me, lv);
      }
      case 'disperse': return bestBy(pr, o => sp[o.id].rev * 0.4 + (sp[o.id].robin ? 0.8 : 0) + (sp[o.id].camps && bd.men(o.id) <= 2 ? 2 : 0) + sp[o.id].hidden * 0.2, pub, me, lv);
      case 'remove': return bestBy(pr, o => ({ camp: 3, robin: 2.5, rev: 1, hid: 0.8 })[o.id] || 0, pub, me, lv);
      case 'redeployH': return bestBy(pr, o => (o.id === 'nottingham' ? 0.4 : 0) + bd.mNear(o.id) * 0.2 + sp[o.id].cars.length * 0.4, pub, me, lv);
      case 'homeH': return { t: 'pick', n: pr.n, ids: [] };
      case 'robinSwap': {
        const here = me.robinAt;
        return bestBy(pr, o => o.id === 'stay' ? 0.2 - (D.SPACES[here] ? bd.danger(here) * 0.5 : 0) : -bd.danger(o.id) * 0.5 + (D.SPACES[o.id].kind === 'forest' ? 0.2 : 0), pub, me, lv);
      }
      case 'rain': {
        const b = bestPlots(pub, me, bd, 'single');
        return pickId(pr, b && b.v > 2 * V.shill && legal(pr).some(o => o.id === 'plot') ? 'plot' : 'cash');
      }
      case 'marketN': return pickId(pr, pub.sh.sheriff < 2 && legal(pr).some(o => o.id === '2') ? '2' : '0');
      case 'marketMM': { const half = parseInt((pr.why.match(/for (\d+)/) || [])[1], 10) || 0; if (half < 2) return { t: 'skip', n: pr.n }; return bestBy(pr, o => -bd.danger(o.id), pub, me, lv); }
      case 'marketFrom': return bestBy(pr, o => -bd.men(o.id) - bd.mNear(o.id) * 0.3, pub, me, lv);
      case 'pardonN': { const L = legal(pr); const even = L.find(o => +o.id % 2 === 0 && +o.id > 0); return pickId(pr, even ? even.id : '0'); }
      case 'eleanor': case 'truce': case 'freeRobin': case 'pardonRobin': case 'robNow': return yesIf(true);
      case 'stutelyRobin': return yesIf(false);
      case 'bridge': return pickId(pr, legal(pr).some(o => o.id === 'nottingham-remston') ? 'nottingham-remston' : legal(pr)[0].id);
      case 'decoy': return bestBy(pr, o => -bd.danger(o.id) + (D.SPACES[o.id].kind === 'forest' ? 0.3 : 0), pub, me, lv);
      case 'gallows': case 'hornH': case 'redcap': return bestBy(pr, o => (sp[o.id] ? sp[o.id].rev + sp[o.id].h * 0.1 : 0), pub, me, lv);
      case 'stutely': return bestBy(pr, o => { const p = o.space; return sp[p].h * 0.4 + (sp[p].state === 'sub' ? 0.3 : 0); }, pub, me, lv);
      case 'evSpace': return bestBy(pr, o => evSpaceScore(pub, me, bd, o), pub, me, lv);
    }
    return fallback(pub, me, pr);
  }
  function halfVal(H, p, n, bd, at, pub) {
    if (!H) return -9;
    if (H.noRoll) return pub.sh.robin >= H.cost ? 1 + V.flip + 0.6 - H.cost * V.shill : -9;
    const win = (H.gain || 0) * V.shill + (H.fromSheriff || 0) * V.shill * 2 + (H.justice || 0) + (H.recruit ? V.man : 0) + (H.removeCard ? 0.3 : 0);
    const lose = (H.loseSheriff || 0) * V.shill + (H.loseCapture ? n * 0.5 : 0) + (H.loseSubmit ? 0.4 : 0) + (H.loseRobin ? V.robin : 0) + (H.loseHenchman ? V.hench : 0);
    return p * win - (1 - p) * lose;
  }
  function evSpaceScore(pub, me, bd, o) {
    const sp = bd.sp[o.id];
    if (!sp) return 0;
    if (me.side === 'sheriff') return sp.hidden * 0.5 + sp.rev * 0.4 + (sp.robin ? 1 : 0) + sp.camps * 0.6 + (sp.state === 'rev' ? 0.3 : 0);
    return -sp.h * 0.3 + bd.men(o.id) * 0.2 + (sp.state === 'sub' ? 0.2 : 0);
  }
  function plotOf(why) {
    for (const side of ['robin', 'sheriff']) for (const k of Object.keys(D.PLOTS[side])) if (why.indexOf(D.PLOTS[side][k].name) === 0) return k;
    if (/^Rob/.test(why) || /Rob\?/.test(why)) return 'rob';
    if (/Patrol/.test(why)) return 'patrol';
    if (/Hire/.test(why)) return 'hire';
    return null;
  }
  function atOf(why, last) {
    let found = null;
    for (const k of D.IDS) { const i = why.indexOf(D.SPACES[k].name); if (i >= 0 && (!found || (last ? i > found.i : i < found.i))) found = { k, i }; }
    return found ? found.k : null;
  }
  function robbersIn(pub, at) {
    const e = pub.log.slice().reverse().find(x => x.t === 'robbers' && x.at === at);
    return e ? e.n : 1;
  }
  /* A refused answer retries with the first legal one (G: "a refused bot
     move must retry"). */
  function fallback(pub, me, pr) {
    if (pr.t === 'turn') { const L = pr.options.filter(o => !o.bad); const p = L.find(o => o.id === 'pass') || L[0]; return { t: 'turn', n: pr.n, id: p.id }; }
    if (pr.multi) return { t: 'pick', n: pr.n, ids: legal(pr).slice(0, pr.min).map(o => o.id) };
    const L = legal(pr);
    if (!L.length) return { t: 'skip', n: pr.n };
    return { t: 'pick', n: pr.n, id: L[0].id };
  }

  const Bots = { VERSION, answer, fallback, LEVEL, V, robPlan, carriagePool, travPool };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.RhBots = Bots;
})(typeof window !== 'undefined' ? window : this);
