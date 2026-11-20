'use strict';
/* 1960 — the house. Decides from (publicView, seatView) and nothing else:
   it never sees the other hand, the stacks or the deck. No reaches into the
   Game; tests/engine.js greps this file for them.

   One brain, three levels (LESSONS-CHECKLIST G1). Everything is valued in
   one currency — expected electoral votes — through `stateP`, the chance a
   state ends on your side given its support (`VAL` holds the few other
   numbers: a momentum marker, an issue's lead, a media cube). A card's event
   is valued by reading its `ops`, the same steps the engine runs, on a copy
   of the public board. Medium and Easy are the same brain made sloppier
   (noise, slips); Easy also loses the plan: it neither keeps its best cards
   for the Debates and Election Day, nor weighs what the other side would do
   with a card's event (no preempting, triggers on a whim). */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./m60-data.js') : root.M60Data;
  const VERSION = 1;
  const other = D.other;
  const VAL = { mom: 4.2, end: 5.5, media: 2.4, issue: [16, 9.7, 6.4], card: 3, cand: 6, rest: 0.25, fx: 4 };
  const BASE = { noise: 0, slip: 0, plan: true, keep: 0.5, trigger: 0.6, issueMul: 1, mediaMul: 1, endMul: 1, campMul: 0.9 };
  const LEVEL = {
    hard: Object.assign({}, BASE, { noise: 0.05 }),
    medium: Object.assign({}, BASE, { noise: 0.35, slip: 0.12, keep: 0.35 }),
    easy: Object.assign({}, BASE, { noise: 0.8, slip: 0.3, plan: false, keep: 0, trigger: 2.5 })
  };
  if (typeof process !== 'undefined' && process.env && process.env.M60_HARD) Object.assign(LEVEL.hard, JSON.parse(process.env.M60_HARD));
  if (typeof process !== 'undefined' && process.env && process.env.M60_VAL) Object.assign(VAL, JSON.parse(process.env.M60_VAL));

  /* Noise is a hash of what is being decided — never Math.random — so seeded
     games, holds and undo-by-replay all stay reproducible. */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

  /* ---------------- the one valuation ---------------- */
  const PX = { '-4': 0.06, '-3': 0.15, '-2': 0.26, '-1': 0.37, '1': 0.63, '2': 0.74, '3': 0.85, '4': 0.93, '5': 0.955, '6': 0.97 };
  /* The chance state st ends with `side`, given signed support v. */
  function stateP(C, st, v, side) {
    const x = v * D.signOf(side);
    if (x === 0) {
      const e = D.leadOf(C.pub.end[D.STATE[st].reg]);
      if (e) return e === side ? 0.62 : 0.38;
      return D.STATE[st].edge === side ? 0.56 : 0.44;
    }
    if (x >= 6) return 0.975;
    if (x <= -4) return 0.06;
    return PX[String(x)];
  }
  /* What k more cubes for `side` in st are worth, with checks drawn at the
     side's share of the bag where they are needed. */
  function addGain(C, st, k, side, chk) {
    const v = C.sup[st];
    const ev = D.STATE[st].ev;
    const q = chk ? share(C, side) : 1;
    const got = k * q;
    const lo = Math.floor(got), hi = Math.ceil(got), f = got - lo;
    const s = D.signOf(side);
    const p = x => stateP(C, st, v + s * x, side);
    return ev * ((1 - f) * p(lo) + f * p(hi) - p(0));
  }
  const share = (C, side) => { const t = C.pub.bag.K + C.pub.bag.N; return t ? C.pub.bag[side] / t : 0.5; };

  function ctx(pub, me) {
    const mine = pub.players.find(p => p.id === me.id);
    const lv = LEVEL[mine.level] || LEVEL.medium;
    return { pub, me, side: me.side, opp: other(me.side), lv, sup: Object.assign({}, pub.sup), key: me.id + '|' + pub.turn + '|' + pub.ap + '|' + pub.logN };
  }
  function noisy(C, key, v) {
    if (!C.lv.noise) return v;
    const r = hash(C.key + '|' + key) * 2 - 1;
    return v + r * C.lv.noise * Math.max(3, Math.abs(v));
  }
  const slips = (C, key) => C.lv.slip && hash('slip|' + C.key + '|' + key) < C.lv.slip;
  /* Would `side` have to check in st? (the engine's rule, from the public view) */
  function needsCheck(C, side, st, mode) {
    const o = other(side), pub = C.pub;
    const req = D.carried(C.sup[st], o) || pub.tok[o] === st || (mode === 'camp' && side === 'N' && pub.fx.hostile);
    if (!req) return false;
    if (D.mine(pub.media[D.STATE[st].reg], side) > 0) return false;
    if (mode === 'camp' && pub.fx.advance && pub.fx.advance[side]) return false;
    return true;
  }
  /* Greedy: the best way to place n cubes for `side` among states, cap a
     state. Returns { v, map }. */
  function bestAdd(C, side, states, n, cap, mode) {
    const map = {};
    let v = 0;
    const capOf = typeof cap === 'function' ? cap : () => cap;
    for (let k = 0; k < n; k++) {
      let best = null, bv = 0.0001;
      for (const st of states) {
        const have = map[st] || 0;
        if (have >= capOf(st)) continue;
        const chk = needsCheck(C, side, st, mode);
        const g = addGain(C, st, have + 1, side, chk) - addGain(C, st, have, side, chk);
        if (g > bv) { bv = g; best = st; }
      }
      if (!best) break;
      map[best] = (map[best] || 0) + 1;
      v += bv;
    }
    return { v, map };
  }
  /* Taking up to n of `from`'s cubes, valued for `forSide`. */
  function bestSub(C, from, states, n, cap, forSide) {
    const map = {};
    let v = 0;
    for (let k = 0; k < n; k++) {
      let best = null, bv = -1e9;
      for (const st of states) {
        const have = map[st] || 0;
        const can = Math.min(cap, D.mine(C.sup[st], from));
        if (have >= can) continue;
        const s = D.signOf(from);
        const ev = D.STATE[st].ev;
        const g = ev * (stateP(C, st, C.sup[st] - s * (have + 1), from) - stateP(C, st, C.sup[st] - s * have, from));   // negative: from loses
        const val = forSide === from ? g : -g;
        if (val > bv) { bv = val; best = st; }
      }
      if (!best) break;
      map[best] = (map[best] || 0) + 1;
      v += bv;
    }
    return { v, map };
  }

  /* ---------------- issues and media ---------------- */
  const rankW = (C, i) => VAL.issue[C.pub.order.indexOf(i)] * (C.pub.turn >= 8 ? 0.5 : 1) * C.lv.issueMul;
  function issueVal(C, side, iss) {
    let v = 0;
    for (const i of D.ISSUES) {
      const x = iss[i] * D.signOf(side);
      const f = x >= 2 ? 1 : x === 1 ? 0.7 : x === 0 ? 0 : x === -1 ? -0.7 : -1;
      v += f * rankW(C, i);
    }
    return v;
  }
  function bestIssues(C, side, cp, banned, oneCost) {
    /* Try every split of up to cp cubes over the three issues (costs 1, 3, 5…). */
    let best = { v: 0, map: {} };
    const base = issueVal(C, side, C.pub.iss);
    for (let a = 0; a <= cp; a++) for (let b = 0; b <= cp; b++) for (let c = 0; c <= cp; c++) {
      const m = { def: a, eco: b, cr: c };
      if (banned && m[banned]) continue;
      const cost = oneCost ? a + b + c : D.ISSUES.reduce((t, i) => t + (m[i] ? 2 * m[i] - 1 : 0), 0);
      if (cost > cp || cost === 0) continue;
      const iss = Object.assign({}, C.pub.iss);
      D.ISSUES.forEach(i => { iss[i] += D.signOf(side) * m[i]; });
      const v = issueVal(C, side, iss) - base;
      if (v > best.v + 1e-9) best = { v, map: m };
    }
    return best;
  }
  function mediaVal(C, side, r) {
    const o = other(side);
    let v = VAL.media;
    if (D.mine(C.pub.media[r], o) > 0) v += 1.2;                 // removes theirs
    D.statesIn(r).forEach(st => { if (D.carried(C.sup[st], o) || C.pub.tok[o] === st) v += D.STATE[st].ev / 30; });
    return v;
  }
  function bestMedia(C, side, n) {
    const map = {};
    let v = 0;
    for (let k = 0; k < n; k++) {
      let best = null, bv = -1;
      for (const r of D.REGIONS) { const x = mediaVal(C, side, r) * (map[r] ? 0.55 : 1); if (x > bv) { bv = x; best = r; } }
      map[best] = (map[best] || 0) + 1;
      v += bv;
    }
    return { v, map };
  }
  function endorseRegion(C, side) {
    let best = 'MW', bv = -1e9;
    for (const r of D.REGIONS) {
      let v = 0;
      D.statesIn(r).forEach(st => { const x = Math.abs(C.sup[st]); if (x <= 1) v += D.STATE[st].ev * (x === 0 ? 1 : 0.3); });
      if (D.mine(C.pub.end[r], other(side)) > 0) v += 15;
      if (D.mine(C.pub.end[r], side) > 0) v -= 12;
      if (v > bv) { bv = v; best = r; }
    }
    return best;
  }

  /* ---------------- campaigning ---------------- */
  const remain = C => Math.max(0, 5 - C.pub.ap) + 1;
  function campBlocked(C, side, st) {
    const fx = C.pub.fx, r = D.STATE[st].reg;
    if (fx.noCamp && fx.noCamp[side] && fx.noCamp[side].indexOf(r) >= 0) return true;
    if (fx.oldSouth === side && r === 'S') return true;
    if (side === 'N' && fx.ikeSilence && D.leadOf(C.sup[st]) === 'K') return true;
    return false;
  }
  function travelCost(C, side, a, b) {
    const fx = C.pub.fx;
    if ((side === 'K' && fx.kenAir) || (fx.advance && fx.advance[side])) return 0;
    return D.travelCost(a, b);
  }
  /* The best campaign from where the candidate stands with cp to spend:
     which travel region, and where the cubes go. */
  function planCampaign(C, side, cp, whistle, tokOverride) {
    const at = D.moveRegionOf(tokOverride || C.pub.tok[side]);
    let best = { v: 0, region: at, cost: 0, map: {} };
    for (const mr of D.MOVE_REGIONS) {
      const cost = mr === at ? 0 : travelCost(C, side, at, mr);
      if (cost >= cp) continue;
      const states = D.statesInMove(mr).filter(st => !campBlocked(C, side, st));
      const r = bestAdd(C, side, states, cp - cost, whistle ? 1 : 99, 'camp');
      const v = r.v - cost * 0.15;
      if (v > best.v) best = { v, region: mr, cost, map: r.map };
    }
    return best;
  }

  /* ================================================================
     What a card's event is worth to the viewer, resolved by `rs`
     ================================================================ */
  function whoOf(C, w, me) {
    if (!w) return null;
    if (w === 'K' || w === 'N') return w;
    if (w === 'me') return me;
    if (w === 'opp') return other(me);
    if (w.indexOf('lead:') === 0) return D.leadOf(C.pub.iss[w.slice(5)]);
    if (w.indexOf('media:') === 0) return D.leadOf(C.pub.media[w.slice(6)]);
    if (w === 'akhi') { const k = D.mine(C.sup.AK, 'K') + D.mine(C.sup.HI, 'K'), n = D.mine(C.sup.AK, 'N') + D.mine(C.sup.HI, 'N'); return k > n ? 'K' : n > k ? 'N' : null; }
    return null;
  }
  const sgnFor = (C, s) => s === C.side ? 1 : -1;
  function whereStates(C, s, where) {
    if (!where || where === 'any') return D.STATES.slice();
    if (where.sts) return where.sts.slice();
    if (where.reg) return D.statesIn(where.reg);
    if (where.regs) return D.STATES.filter(st => where.regs.indexOf(D.STATE[st].reg) >= 0 && (where.evMax == null || D.STATE[st].ev <= where.evMax));
    if (where.evMin) return D.STATES.filter(st => D.STATE[st].ev >= where.evMin);
    if (where.empty) return D.STATES.filter(st => C.sup[st] === 0);
    if (where.mediaReg) {
      let best = [];
      let bv = -1;
      D.REGIONS.filter(r => D.mine(C.pub.media[r], s) > 0).forEach(r => { const v = bestAdd(C, s, D.statesIn(r), 5, 2, 'event').v; if (v > bv) { bv = v; best = D.statesIn(r); } });
      return best;
    }
    return D.STATES.slice();
  }
  const FXV = { knee: ['N', -1.4], cpUp: [null, 1], kenAir: ['K', 1], profiles: ['K', 0.8], noMom: [null, -0.8], hostile: ['N', -1.3], ikeSilence: ['N', -1], pledge: ['K', 1], peaceCorps: ['K', 0.5], jackie: ['N', -0.8], stature: ['K', -0.5], cpDown: ['K', -1.4], advance: [null, 1], noCamp: [null, -0.7], oldSouth: [null, -0.5] };
  function opsValue(C, ops, rs, card) {
    let v = 0;
    const left = remain(C) / 6;
    for (const o of ops) {
      switch (o.op) {
        case 'add': { const s = whoOf(C, o.who, rs); if (!s) break; v += sgnFor(C, s) * bestAdd(C, s, whereStates(C, s, o.where), o.n, o.cap, 'event').v; break; }
        case 'gain': { const s = whoOf(C, o.who, rs); if (!s) break; v += sgnFor(C, s) * addGain(C, o.st, o.n, s, needsCheck(C, s, o.st, 'event')); break; }
        case 'sub': { const from = whoOf(C, o.from, rs); if (!from) break; v += bestSub(C, from, whereStates(C, from, o.where), o.n, o.cap, C.side).v; break; }
        case 'lose': { const s = whoOf(C, o.who, rs); if (!s) break; const st = o.st === 'token' ? C.pub.tok[s] : o.st; v += bestSub(C, s, [st], o.n, o.n, C.side).v; break; }
        case 'mom': { const s = whoOf(C, o.who, rs); if (!s) break; const n = o.n < 0 ? -Math.min(-o.n, C.pub.mom[s]) : o.n; v += sgnFor(C, s) * n * VAL.mom; break; }
        case 'iss': { const s = whoOf(C, o.who, rs); if (!s) break; const iss = Object.assign({}, C.pub.iss); (o.iss === 'each' ? D.ISSUES : [o.iss]).forEach(i => { if (o.n > 0) iss[i] += D.signOf(s) * o.n; else iss[i] -= D.signOf(s) * Math.min(-o.n, D.mine(iss[i], s)); }); v += issueVal(C, C.side, iss) - issueVal(C, C.side, C.pub.iss); break; }
        case 'issPick': { const s = whoOf(C, o.who, rs); v += sgnFor(C, s) * bestIssues(C, s, o.n, null, true).v; break; }
        case 'issLose': { const s = whoOf(C, o.who, rs); v -= sgnFor(C, s) * Math.min(o.n, D.ISSUES.reduce((t, i) => t + D.mine(C.pub.iss[i], s), 0)) * 2; break; }
        case 'up': { const L = D.leadOf(C.pub.iss[o.iss]); if (L) v += sgnFor(C, L) * 1.5 * o.n; break; }
        case 'tok': break;
        case 'fx': { const f = FXV[o.key] || [null, 0]; const s = o.who ? whoOf(C, o.who, rs) : f[0]; if (!s) break; v += sgnFor(C, s) * f[1] * VAL.fx * 2 * left; break; }
        case 'media': { const s = whoOf(C, o.who, rs); v += sgnFor(C, s) * bestMedia(C, s, o.n).v; break; }
        case 'mediaAt': { const s = whoOf(C, o.who, rs); v += sgnFor(C, s) * o.n * mediaVal(C, s, o.reg); break; }
        case 'mediaOff': { const n = Math.min(o.n, D.REGIONS.reduce((t, r) => t + D.mine(C.pub.media[r], o.from), 0)); v -= sgnFor(C, o.from) * n * VAL.media; break; }
        case 'endorse': { const s = whoOf(C, o.who, rs); v += sgnFor(C, s) * o.n * VAL.end * C.lv.endMul; break; }
        case 'reclaim': { const s = whoOf(C, o.who, rs); if (!C.pub.cand[s]) v += sgnFor(C, s) * VAL.cand; break; }
        case 'exhaust': { const s = whoOf(C, o.who, rs); if (C.pub.cand[s]) v -= sgnFor(C, s) * VAL.cand; break; }
        case 'retrieve': { const s = whoOf(C, o.who, rs); if (o.card ? C.pub.disc.indexOf(o.card) >= 0 : C.pub.disc.length) v += sgnFor(C, s) * VAL.card; break; }
        case 'draw': { const s = whoOf(C, o.who, rs); v += sgnFor(C, s) * o.n * VAL.card; break; }
        case 'swap': { const s = whoOf(C, o.who, rs); v += sgnFor(C, s) * 1.5; break; }
        case 'equal': { const s = whoOf(C, o.who, rs), q = other(s); if (C.pub.mom[q] > C.pub.mom[s]) v += sgnFor(C, s) * (C.pub.mom[q] - C.pub.mom[s]) * VAL.mom; break; }
        case 'if': {
          const c = o.cond;
          let okc = false;
          if (c.leads) okc = D.leadOf(C.pub.iss[c.leads[1]]) === c.leads[0];
          if (c.multi) okc = D.ISSUES.filter(i => D.leadOf(C.pub.iss[i]) === c.multi).length >= 2;
          if (okc) v += opsValue(C, o.ops, rs, card);
          break;
        }
        case 'medal': { const L = o.iss.map(i => D.leadOf(C.pub.iss[i])); o.iss.forEach((i, k) => { if (L[k]) v -= sgnFor(C, L[k]) * 2; }); if (L[0] && L[0] === L[1]) v -= sgnFor(C, L[0]) * VAL.mom; break; }
        case 'gm': {
          const k = D.statesLed(C.sup, o.reg, 'K'), n = D.statesLed(C.sup, o.reg, 'N');
          const s = k > n ? 'K' : n > k ? 'N' : null;
          if (!s) break;
          let g = VAL.mom;
          D.statesIn(o.reg).forEach(st => { if (C.sup[st] === 0) g += addGain(C, st, 1, s, needsCheck(C, s, st, 'event')); });
          v += sgnFor(C, s) * g;
          break;
        }
        case 'gallup': v += sgnFor(C, rs) * 3; break;
        case 'swing': {
          const s = whoOf(C, o.who, rs), q = other(s);
          let b = 0;
          D.STATES.forEach(st => { if (D.leadOf(C.sup[st]) === q && !D.carried(C.sup[st], q)) b = Math.max(b, addGain(C, st, 5, s, needsCheck(C, s, st, 'event'))); });
          v += sgnFor(C, s) * b;
          break;
        }
        case 'whistle': { const s = whoOf(C, o.who, rs); v += sgnFor(C, s) * planCampaign(C, s, 7, true).v; break; }
        case 'oppo': v += sgnFor(C, 'N') * 6; break;
        case 'highHopes': v += sgnFor(C, 'K') * 5; break;
        case 'tricky': v += sgnFor(C, 'N') * (C.pub.disc.length ? 7 : 0); break;
      }
    }
    return v;
  }
  /* The whole event: its ops, plus what a persistent card does later. */
  function eventValue(C, id, rs) {
    const c = D.CARD[id];
    let v = opsValue(C, c.ops, rs, id);
    if (c.persist === 'prev') v += sgnFor(C, c.icon) * 3;
    if (c.persist === 'debate') v += C.pub.turn < 6 ? sgnFor(C, 'K') * 7 : 0;
    if (c.persist === 'eday') {
      const e = c.eday;
      if (e.unpledged) v += sgnFor(C, 'N') * 6;
      else if (e.who === 'leadCT') { const s = D.leadOf(C.sup.CT); if (s) v += sgnFor(C, s) * 5; else v += 1; }
      else v += sgnFor(C, e.who) * (e.st ? addGain(C, e.st, e.n, e.who, true) + 2 : 6);
    }
    return v;
  }

  /* What keeping a card is worth (the Debates before turn 6, Election Day
     after): the strategy plan. */
  function stratValue(C, id) {
    const c = D.CARD[id];
    if (c.noStrat) return -99;
    if (C.pub.turn < 6) {
      const own = c.icon === C.side || c.icon === 'B';
      return own ? c.cp * 1.4 + (c.icon === 'B' ? 0.3 : 0.6) : -c.cp * 0.6;
    }
    const st = c.st;
    return addGain(C, st, 3, C.side, true) + 0.2;
  }
  function reserved(C, hand) {
    if (!C.lv.plan || C.pub.turn === 6 || C.pub.turn >= 9) return [];
    const need = D.RULES.strat(C.pub.turn);
    return hand.slice().sort((a, b) => stratValue(C, b) - stratValue(C, a)).slice(0, need).filter(id => stratValue(C, id) > 0);
  }

  /* ================================================================
     The turn
     ================================================================ */
  function turnChoice(C) {
    const can = C.me.can;
    const opts = [];
    const res = reserved(C, C.me.hand);
    const momLeft = can.mom;
    const oppMom = can.oppMom;
    const consider = (card, h, cp0, isCand) => {
      const actions = [];
      if (!isCand && h.event.ok) {
        let v = eventValue(C, card, C.side) - (h.event.mom ? VAL.mom : 0);
        actions.push({ how: 'event', v });
      }
      const risk = !isCand && h.trig ? Math.max(0, -eventValue(C, card, C.opp)) : 0;
      const oppWould = risk > VAL.mom * C.lv.trigger && oppMom > 0;
      const tax = !isCand && h.trig && oppWould ? risk : 0;
      const pre = !isCand && h.pre && h.pre.ok && C.lv.plan && tax > h.pre.cost * VAL.mom + 1 ? h.pre.cost * VAL.mom : null;
      const loss = pre != null ? pre : tax;
      if ((isCand ? h.camp : h.camp).ok) {
        const p = planCampaign(C, C.side, h.camp.cp, false);
        actions.push({ how: 'camp', v: p.v * C.lv.campMul - (h.camp.mom ? VAL.mom : 0) - loss, pre: pre != null });
      }
      if (h.adv.ok) actions.push({ how: 'adv', v: bestMedia(C, C.side, Math.round(h.adv.cp * share(C, C.side))).v * C.lv.mediaMul - loss, pre: pre != null });
      if (h.pos.ok) actions.push({ how: 'pos', v: bestIssues(C, C.side, h.pos.cp, h.pos.banned).v - loss, pre: pre != null });
      const keepCost = isCand ? VAL.cand * (C.pub.turn >= 8 ? 0.2 : 0.55) : (res.indexOf(card) >= 0 ? stratValue(C, card) * C.lv.keep * 1.4 : 0);
      for (const a of actions) {
        const restBonus = isCand ? 0 : D.CARD[card].rest * VAL.rest;
        opts.push({ card: isCand ? 'cand' : card, how: a.how, pre: !!a.pre, v: noisy(C, (isCand ? 'c' : card) + a.how, a.v + restBonus - keepCost) });
      }
    };
    can.hand.forEach(h => consider(h.card, h, h.cp, false));
    if (can.cand) consider('cand', can.cand, 5, true);
    if (!opts.length) return can.pass ? { t: 'pass' } : null;
    opts.sort((a, b) => b.v - a.v);
    let pickI = 0;
    if (opts.length > 1 && slips(C, 'turn')) pickI = 1;
    const o = opts[pickI];
    return { t: 'play', card: o.card, how: o.how, pre: o.pre };
  }

  /* ================================================================
     Answering a question
     ================================================================ */
  function answer(pub, me, pr) {
    const C = ctx(pub, me);
    if (!pr) return null;
    if (pr.t === 'turn') { const a = turnChoice(C); return a ? Object.assign({ n: pr.n }, a) : { n: pr.n, t: 'pass' }; }
    if (pr.t === 'camp') return Object.assign({ n: pr.n }, campStep(C, pr));
    if (pr.t === 'alloc') return { n: pr.n, t: 'alloc', map: allocAnswer(C, pr) };
    return Object.assign({ n: pr.n }, pickAnswer(C, pr));
  }
  function campStep(C, pr) {
    const plan = planCampaign(C, C.side, pr.left, /Whistlestop/.test(pr.why), null);
    const here = D.moveRegionOf(C.pub.tok[C.side]);
    if (!Object.keys(plan.map).length) return { t: 'pick', id: 'end' };
    if (plan.region !== here) {
      const o = pr.options.find(x => x.id === 'go:' + plan.region && !x.bad);
      if (o) return { t: 'pick', id: o.id };
    }
    /* Spend on the plan's states, saving the most valuable for last so the
       candidate ends the action standing in it. */
    const sts = Object.keys(plan.map).sort((a, b) => D.STATE[a].ev - D.STATE[b].ev);
    for (const st of sts) {
      const o = pr.options.find(x => (x.id === 'add:' + st || x.id === 'chk:' + st) && !x.bad);
      if (o) return { t: 'pick', id: o.id };
    }
    return { t: 'pick', id: 'end' };
  }
  function allocAnswer(C, pr) {
    const opts = pr.options.filter(o => !o.bad && o.cap > 0);
    const ids = opts.map(o => o.id);
    const capOf = id => (opts.find(o => o.id === id) || { cap: 0 }).cap;
    let map = {};
    switch (pr.what) {
      case 'add': map = bestAdd(C, C.side, ids, pr.total, capOf, 'event').map; break;
      case 'award': map = bestAdd(C, C.side, ids, pr.total, capOf, null).map; break;
      case 'sub': {
        /* Taking the other side's cubes — or, under Old South, choosing which
           of my own to lose: the least harmful. */
        const from = opts.length && D.leadOf(opts[0].sup) ? D.leadOf(opts[0].sup) : C.opp;
        map = bestSub(C, from, ids, pr.total, 99, C.side).map;
        Object.keys(map).forEach(k => { map[k] = Math.min(map[k], capOf(k)); });
        break;
      }
      case 'iss': map = bestIssues(C, C.side, pr.total, null, true).map; break;
      case 'pos': map = bestIssues(C, C.side, pr.budget, (opts.length < 3 ? D.ISSUES.find(i => ids.indexOf(i) < 0) : null)).map; break;
      case 'issLose': {
        let left = pr.total;
        const order = ids.slice().sort((a, b) => rankW(C, a) - rankW(C, b));
        for (const i of order) { const k = Math.min(left, capOf(i)); if (k) { map[i] = k; left -= k; } }
        break;
      }
      case 'media': map = bestMedia(C, C.side, pr.total).map; break;
      case 'mediaOff': {
        let left = pr.total;
        const order = ids.slice().sort((a, b) => mediaVal(C, C.opp, b) - mediaVal(C, C.opp, a));
        for (const r of order) { const k = Math.min(left, capOf(r)); if (k) { map[r] = k; left -= k; } }
        break;
      }
      default: { let left = pr.total; for (const id of ids) { const k = Math.min(left, capOf(id)); if (k) { map[id] = k; left -= k; } } }
    }
    /* Never fewer than the minimum. */
    let tot = Object.values(map).reduce((a, b) => a + b, 0);
    for (const id of ids) { if (tot >= pr.min) break; const room = capOf(id) - (map[id] || 0); const k = Math.min(room, pr.min - tot); if (k > 0) { map[id] = (map[id] || 0) + k; tot += k; } }
    return map;
  }
  function pickAnswer(C, pr) {
    const legal = pr.options.filter(o => !o.bad);
    const first = legal[0];
    const by = f => { let b = null, bv = -1e9; for (const o of legal) { const v = f(o); if (v > bv) { bv = v; b = o; } } return b; };
    switch (pr.what) {
      case 'first': return { t: 'pick', id: legal.find(o => o.id === C.opp) ? C.opp : first.id };
      case 'trigger': {
        const v = eventValue(C, pr.card, C.side);
        const want = C.lv.plan ? v > VAL.mom * 1.1 : hash(C.key + 'trig') < 0.5 && v > 0;
        return { t: 'pick', id: want ? 'yes' : 'no' };
      }
      case 'shift': return { t: 'pick', id: by(o => { const iss = C.pub.iss; let v = 0; o.order.forEach((i, k) => { const L = D.leadOf(iss[i]); if (L) v += (L === C.side ? 1 : -1) * VAL.issue[k]; }); return noisy(C, 'sh' + o.id, v); }).id };
      case 'award': return { t: 'pick', id: C.pub.turn >= 8 ? 'mom' : 'end' };
      case 'region': return { t: 'pick', id: legal.find(o => o.id === endorseRegion(C, C.side)) ? endorseRegion(C, C.side) : first.id };
      case 'issue': return { t: 'pick', id: by(o => { const iss = Object.assign({}, C.pub.iss); iss[o.id] += D.signOf(C.side) * 3; return issueVal(C, C.side, iss); }).id };
      case 'order': return { t: 'pick', id: by(o => { let v = 0; o.id.split(',').forEach((i, k) => { const L = D.leadOf(C.pub.iss[i]); if (L) v += (L === C.side ? 1 : -1) * VAL.issue[k]; }); return v + (o.cur ? 0.01 : 0); }).id };
      case 'tok': return { t: 'pick', id: by(o => { const v = C.sup[o.id] * D.signOf(C.side); return (v > 0 && v < 4 ? D.STATE[o.id].ev : 0) + (D.carried(C.sup[o.id], C.opp) ? -5 : 0) + D.STATE[o.id].ev * 0.05; }).id };
      case 'declare': {
        const max = +legal[legal.length - 1].id;
        const plan = planCampaign(C, C.side, max, false);
        const k = Math.max(1, Math.min(max, (plan.map && plan.map[pr.st]) || 1));
        return { t: 'pick', id: String(k) };
      }
      case 'retrieve': return { t: 'pick', id: by(o => Math.max(D.CARD[o.card].cp, eventValue(C, o.card, C.side))).id };
      case 'tricky': {
        const b = by(o => eventValue(C, o.card, C.side));
        return b && eventValue(C, b.card, C.side) > 0 ? { t: 'pick', id: b.id } : { t: 'skip' };
      }
      case 'swap': {
        const ids = legal.filter(o => { const c = D.CARD[o.card]; return (c.icon === C.opp && c.cp <= 3) || (c.noStrat && C.pub.turn >= 5); }).map(o => o.id);
        return { t: 'pick', ids: ids.slice(0, pr.max) };
      }
      case 'swing': return { t: 'pick', id: by(o => addGain(C, o.id, 5, C.side, o.chk)).id };
      case 'oppo': {
        const camp = planCampaign(C, 'N', 3, false).v, adv = 3 * share(C, 'N') * VAL.media, pos = bestIssues(C, 'N', 3).v;
        const best = Math.max(camp, adv, pos);
        return { t: 'pick', id: best === camp ? 'camp' : best === adv ? 'adv' : 'pos' };
      }
      case 'strat': {
        const ids = legal.slice().sort((a, b) => stratValue(C, b.card) - stratValue(C, a.card)).slice(0, pr.max).map(o => o.id);
        return { t: 'pick', ids };
      }
      case 'debate': return { t: 'pick', id: debatePick(C, legal).id };
      case 'dside': return { t: 'pick', id: legal.find(o => o.id === C.side) ? C.side : first.id };
      case 'dfirst': return { t: 'pick', id: legal.find(o => o.id === C.opp) ? C.opp : first.id };
      case 'edayOrder': return { t: 'pick', id: first.id };
      case 'recount': return { t: 'pick', id: by(o => addGain(C, o.id, 3, C.side, true)).id };
    }
    if (pr.multi) return { t: 'pick', ids: legal.slice(0, pr.min).map(o => o.id) };
    if (!first) return pr.skip ? { t: 'skip' } : { t: 'pick', id: pr.options[0] && pr.options[0].id };
    return { t: 'pick', id: first.id };
  }
  /* The Debates: put a card where it wins an issue — your own side of an
     open issue, closing it only when your total would come out on top. */
  function debatePick(C, legal) {
    const d = C.pub.debate;
    const open = d.pos.filter(i => !d.won.some(w => w.iss === i));
    let best = legal[0], bv = -1e9;
    for (const o of legal) {
      const c = D.CARD[o.card];
      let v;
      if (open.indexOf(c.iss) < 0) v = -c.cp * 0.2 - 1;
      else {
        const to = c.icon === 'B' ? C.side : c.icon;
        const b = d.board[c.iss], t = d.totals[c.iss];
        const mineT = t[C.side] + (to === C.side ? c.cp : 0), theirs = t[C.opp] + (to !== C.side ? c.cp : 0);
        const closes = (to === C.side ? b[C.side].length : b[C.opp].length) + 1 >= 2;
        const weight = [4, 3, 2][d.won.length] || 2;
        if (to !== C.side) v = -c.cp * 0.8 + (closes && theirs > mineT ? -weight : 0) + (closes && mineT >= theirs ? weight * 0.5 : 0);
        else if (closes) v = (mineT > theirs || (mineT === theirs && d.init === C.side)) ? weight * 2 + c.cp * 0.2 : -c.cp * 0.6;
        else v = c.cp * 0.8 + (mineT > theirs ? 1 : 0);
        v -= c.cp * 0.25;                          // spend small cards where they suffice
      }
      v = noisy(C, 'd' + o.id, v);
      if (v > bv) { bv = v; best = o; }
    }
    return best;
  }

  /* A refused answer gets a plain legal one instead, so the house never
     stalls (LESSONS-CHECKLIST G). */
  function fallback(pub, me, pr) {
    if (!pr) return null;
    if (pr.t === 'turn') {
      const can = me.can;
      if (!can) return { n: pr.n, t: 'pass' };
      for (const h of can.hand) for (const how of ['adv', 'pos', 'camp', 'event']) if (h[how] && h[how].ok) return { n: pr.n, t: 'play', card: h.card, how, pre: false };
      if (can.cand) for (const how of ['adv', 'pos', 'camp']) if (can.cand[how].ok) return { n: pr.n, t: 'play', card: 'cand', how, pre: false };
      return { n: pr.n, t: 'pass' };
    }
    if (pr.t === 'camp') return { n: pr.n, t: 'pick', id: 'end' };
    if (pr.t === 'alloc') {
      const map = {};
      let left = pr.min;
      for (const o of pr.options) { if (o.bad) continue; const k = Math.min(left, o.cap); if (k) { map[o.id] = k; left -= k; } }
      return { n: pr.n, t: 'alloc', map: pr.what === 'pos' ? {} : map };
    }
    const legal = pr.options.filter(o => !o.bad);
    if (pr.multi) return { n: pr.n, t: 'pick', ids: legal.slice(0, pr.min).map(o => o.id) };
    if (pr.skip) return { n: pr.n, t: 'skip' };
    return { n: pr.n, t: 'pick', id: legal[0] ? legal[0].id : null };
  }

  /* ================================================================
     The coach (How to play). The hard house's own choice for a phone,
     from that phone's (publicView, seatView) and nothing more, with the
     reason said in words. No noise and no slips: it is advice, not a
     sparring partner. Returns { line, keep, pre, card, how } or null.
     ================================================================ */
  const regionWords = r => r === 'AK' ? 'Alaska' : r === 'HI' ? 'Hawaii' : 'the ' + D.REGION[r].name;
  const cardWords = id => { if (id === 'cand' || id === 'K' || id === 'N') return 'your candidate card'; const nm = D.CARD[id].name; return /^[“"‘']/.test(nm) ? nm : '“' + nm + '”'; };
  function coach(pub, me) {
    if (!pub || !me) return null;
    const pr = (me.prompts || [])[0];
    if (!pr) return null;
    const C = ctx(pub, me);
    C.lv = Object.assign({}, LEVEL.hard, { noise: 0, slip: 0 });
    if (pr.t === 'turn' && me.can) {
      const a = turnChoice(C);
      if (!a) return null;
      if (a.t === 'pass') return { line: 'Nothing here can be played well: pass.' };
      const h = a.card === 'cand' ? me.can.cand : me.can.hand.find(x => x.card === a.card);
      if (!h) return null;
      let why = '';
      if (a.how === 'event') why = 'play its event: it is worth more to you than its ' + D.CARD[a.card].cp + ' CP';
      else if (a.how === 'camp') {
        const p = planCampaign(C, C.side, h.camp.cp, false);
        const sts = Object.keys(p.map).sort((x, y) => p.map[y] - p.map[x] || D.STATE[y].ev - D.STATE[x].ev)
          .map(st => D.STATE[st].name + (p.map[st] > 1 ? ' ×' + p.map[st] : ''));
        why = 'Campaign' + (p.cost ? ' — travel to ' + regionWords(p.region) + ' first' : '') + (sts.length ? ': ' + sts.join(', ') : '');
      } else if (a.how === 'adv') {
        const m = bestMedia(C, C.side, Math.max(1, Math.round(h.adv.cp * share(C, C.side)))).map;
        why = 'Advertise, for media cubes in ' + Object.keys(m).map(r => D.REGION[r].name).join(' and ') + ': no support checks there, and more media than ' + D.SIDE[C.opp].name + ' lets you shift the issues';
      } else if (a.how === 'pos') {
        const b = bestIssues(C, C.side, h.pos.cp, h.pos.banned).map;
        const is = D.ISSUES.filter(i => b[i]).map(i => D.issueName(i) + (b[i] > 1 ? ' ×' + b[i] : ''));
        why = 'Position on ' + (is.join(', ') || 'the issues') + ': leading the first issue pays momentum and an endorsement every turn';
      }
      const keep = reserved(C, me.hand).filter(x => x !== a.card);
      const opp = C.opp;
      return {
        card: a.card, how: a.how,
        line: 'Play ' + cardWords(a.card) + ' — ' + why + '.',
        pre: a.pre ? 'Preempt it: its event would help ' + D.SIDE[opp].name + '.' : (a.card !== 'cand' && h.trig && D.benefits(D.CARD[a.card], opp) ? D.SIDE[opp].name + ' may trigger it; worth the risk this time.' : ''),
        keep: keep.length && pub.turn !== 6 && pub.turn < 9 ? 'Keep ' + keep.map(cardWords).join(' and ') + ' back for ' + (pub.turn < 6 ? 'the Debates (high CP, your face).' : 'Election Day (the state on it).') : ''
      };
    }
    if (pr.t === 'pick' && pr.what === 'trigger') {
      const a = pickAnswer(C, pr);
      const id = a && a.id;
      const o = pr.options.find(x => x.id === id);
      const v = eventValue(C, pr.card, C.side);
      return { line: (o ? o.label : 'Let it go') + ' — ' + (v > VAL.mom ? 'its event is worth more to you than a momentum marker.' : 'its event is not worth a momentum marker to you.') };
    }
    if (pr.t === 'pick' && pr.what === 'first') {
      const a = pickAnswer(C, pr);
      const o = pr.options.find(x => x.id === (a && a.id));
      return { line: (o ? o.label : 'Let the other side play first') + ' — usually the stronger choice: going second, you answer every card they play.' };
    }
    if (pr.t === 'pick' && pr.what === 'strat') {
      const best = pr.options.slice().sort((x, y) => stratValue(C, +y.card) - stratValue(C, +x.card)).slice(0, pr.max).map(o => cardWords(+o.card));
      return { line: 'Keep ' + best.join(' and ') + ': ' + (pub.turn < 6 ? 'high CP with your own face wins the Debates.' : 'each is three support checks in the state on it on Election Day.') };
    }
    return null;
  }

  const Bots = { VERSION, LEVEL, VAL, answer, fallback, coach, eventValue: (pub, me, id, rs) => eventValue(ctx(pub, me), id, rs), planCampaign: (pub, me, cp) => planCampaign(ctx(pub, me), me.side, cp, false) };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.M60Bots = Bots;
})(typeof window !== 'undefined' ? window : this);
