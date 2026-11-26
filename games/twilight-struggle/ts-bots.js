'use strict';
/* Twilight Struggle — the house. It decides from (publicView, seatView) and
 * nothing else: no reach into the Game (tests/engine.js greps this file).
 *
 * One valuation in one place (`value`): every region scored as if its card
 * came up now, weighted by how much that region matters, plus each country's
 * control and lean. Placement, coups, realignment, events and the space race
 * are all priced as changes to that one number, so they compare.
 *
 * Levels (LESSONS-CHECKLIST G1, "Easy is the house without its plan"):
 *   hard    the whole brain, a pinch of noise
 *   medium  the same brain with misjudged values now and then
 *   easy    no realignment, no space race unless a card is dangerous, half
 *           blind to what the other side's events do, much noisier
 * Noise is a hash of what is being decided, never Math.random(), so seeded
 * games replay identically (undo, holds).
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./ts-data.js') : root.TSData;
  const VERSION = 1;
  const C = D.COUNTRY;
  const other = D.other;
  /* Easy is the house without its plan (G1): it does not read what the other
     side's events will do to it, never uses the space race to bury a card,
     never realigns, and only half believes in coups. Medium sees half the
     harm. Measured 2026-11-25, `node tests/levels.js 30`, sides alternated:
     hard v medium 65.5% ± 8.8, medium v easy 82.8% ± 7.0, hard v easy
     80.0% ± 7.3. Noise alone (0.12 / 0.5 / 1.4 with harm 1 / 0.9 / 0.5)
     measured flat — 53%, 50%, 45% — and was dropped (G1). */
  const LV = {
    easy: { noise: 0.8, realign: false, harm: 0, space: false, coup: 0.5 },
    medium: { noise: 0.4, realign: true, harm: 0.55, space: true, coup: 0.85 },
    hard: { noise: 0.1, realign: true, harm: 1, space: true, coup: 1 }
  };
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0) / 4294967296;
  }

  /* ================================================================
     The one valuation
     ================================================================ */
  const BASE = { EU: 1.5, AS: 1.35, ME: 1.3, AF: 0.85, CA: 0.75, SA: 0.85 };
  function weights(pub) {
    const w = Object.assign({}, BASE);
    /* Before the Mid War the Africa, Central and South America cards are not
       in the deck yet. */
    if (pub.turn < 4) { w.AF *= 0.6; w.CA *= 0.6; w.SA *= 0.6; }
    if (pub.turn >= 8) { w.CA *= 1.1; w.SA *= 1.1; w.AF *= 1.1; }
    return w;
  }
  function countryTerm(inf, c, side, w) {
    const k = C[c];
    const opp = other(side);
    let W = (k.bg ? 2.2 : 0.7) * w[k.reg];
    if (k.sup === opp) W += 0.35;
    const m = inf[c][side], o = inf[c][opp], s = k.stab;
    const ct = D.ctrl(inf, c);
    if (ct === side) return W + 0.12 * W * Math.min(2, m - o - s);
    if (ct === opp) return -W - 0.12 * W * Math.min(2, o - m - s);
    return 0.35 * W * Math.max(-1, Math.min(1, (m - o) / s));
  }
  function regionTerm(inf, r, side, w) {
    const sc = D.scoreRegion(inf, r, {});
    let v = 0.6 * w[r] * (sc[side] - sc[other(side)]);
    if (sc.euroWin === side) v += 40;
    if (sc.euroWin === other(side)) v -= 40;
    return v;
  }
  function seaTerm(inf, side) {
    const sc = D.scoreRegion(inf, 'SEA');
    return 0.3 * (sc[side] - sc[other(side)]);
  }
  function value(inf, side, w) {
    let v = 0;
    for (const r of D.REGIONS) v += regionTerm(inf, r, side, w);
    v += seaTerm(inf, side);
    for (const c of D.COUNTRIES) v += countryTerm(inf, c, side, w);
    return v;
  }
  /* The change in value from changes [{c, s, n}] — only the regions touched
     are scored again. */
  function delta(inf, side, w, changes) {
    const regs = new Set(), cs = new Set();
    for (const x of changes) { regs.add(C[x.c].reg); cs.add(x.c); }
    const sea = changes.some(x => C[x.c].subs.indexOf('SEA') >= 0);
    let before = 0;
    regs.forEach(r => { before += regionTerm(inf, r, side, w); });
    cs.forEach(c => { before += countryTerm(inf, c, side, w); });
    if (sea) before += seaTerm(inf, side);
    const nf = Object.assign({}, inf);
    cs.forEach(c => { nf[c] = { US: inf[c].US, SU: inf[c].SU }; });
    for (const x of changes) nf[x.c][x.s] = Math.max(0, nf[x.c][x.s] + x.n);
    let after = 0;
    regs.forEach(r => { after += regionTerm(nf, r, side, w); });
    cs.forEach(c => { after += countryTerm(nf, c, side, w); });
    if (sea) after += seaTerm(nf, side);
    return { d: after - before, inf: nf };
  }
  const copyInf = inf => { const o = {}; for (const c in inf) o[c] = { US: inf[c].US, SU: inf[c].SU }; return o; };

  /* ================================================================
     Pricing the ways to spend Ops
     ================================================================ */
  /* Greedy placement, one point at a time, best value per Op. With a regional
     bonus it also tries "everything in that area" and keeps the better. */
  function planPlace(inf, side, w, cands, budget, bonus, noiseKey, lv) {
    const plans = [{ list: cands, budget }];
    (bonus || []).forEach(b => {
      const inArea = cands.filter(c => D.inWhere(c, b.where));
      if (inArea.length) plans.push({ list: inArea, budget: budget + b.n });
    });
    let best = { v: -Infinity, map: {} };
    for (const p of plans) {
      let cur = copyInf(inf), spent = 0, v = 0;
      const map = {};
      for (let step = 0; step < 12 && spent < p.budget; step++) {
        let pick = null;
        for (const c of p.list) {
          const cost = D.addCost(cur, c, side, 1);
          if (spent + cost > p.budget) continue;
          const dd = delta(cur, side, w, [{ c, s: side, n: 1 }]).d;
          const jitter = lv ? (hash(noiseKey + c + step) - 0.5) * lv.noise * 0.6 : 0;
          const score = dd / cost + jitter;
          if (!pick || score > pick.score) pick = { c, cost, dd, score };
        }
        if (!pick) break;
        cur[pick.c][side]++;
        spent += pick.cost; v += pick.dd;
        map[pick.c] = (map[pick.c] || 0) + 1;
      }
      /* A plan that leans on the bonus must keep every point in its area. */
      if (v > best.v) best = { v, map };
    }
    return best;
  }
  /* A coup's worth: the six results, averaged, plus military ops the turn
     still needs, less what a battleground coup does to DEFCON. */
  function coupEV(pub, side, w, c, ops, mod, free) {
    const k = C[c], opp = other(side);
    let ev = 0;
    for (let r = 1; r <= 6; r++) {
      const net = r + ops + mod - 2 * k.stab;
      if (net <= 0) continue;
      const rem = Math.min(net, pub.inf[c][opp]);
      ev += delta(pub.inf, side, w, [{ c, s: opp, n: -rem }, { c, s: side, n: net - rem }]).d / 6;
    }
    if (!free) {
      const need = Math.max(0, pub.defcon - pub.mil[side]);
      ev += Math.min(ops, need) * 0.9;
    }
    if (k.bg && !(side === 'US' && pub.tfx && pub.tfx.subs)) {
      const nd = pub.defcon - 1;
      if (nd <= 1) return -1000;
      if (nd === 2) ev -= 2.5;
      if (nd === 3) ev -= 0.6;
    }
    if (pub.tfx && pub.tfx.cmc === opp) return -1000;
    return ev;
  }
  function realignMods(pub, side, c) {
    const inf = pub.inf;
    let m = C[c].adj.filter(a => D.ctrl(inf, a) === side).length;
    if (inf[c][side] > inf[c][other(side)]) m++;
    if (C[c].sup === side) m++;
    if (side === 'US' && pub.tfx && pub.tfx.contra) m--;
    return m;
  }
  function realignEV(pub, side, w, c) {
    const opp = other(side), ms = realignMods(pub, side, c), mo = realignMods(pub, opp, c);
    let ev = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const d = (a + ms) - (b + mo);
      if (d > 0) ev += delta(pub.inf, side, w, [{ c, s: opp, n: -Math.min(d, pub.inf[c][opp]) }]).d / 36;
      else if (d < 0) ev += delta(pub.inf, side, w, [{ c, s: side, n: -Math.min(-d, pub.inf[c][side]) }]).d / 36;
    }
    return ev;
  }
  function coupTargets(pub, side, o) {
    o = o || {};
    const opp = other(side);
    return D.COUNTRIES.filter(c => {
      if (pub.inf[c][opp] <= 0) return false;
      if (!o.free && D.defconBans(pub.defcon, C[c].reg)) return false;
      if (side === 'SU') {
        if (c === 'Japan' && pub.fx.japan) return false;
        if (pub.fx.nato && C[c].reg === 'EU' && D.ctrl(pub.inf, c) === 'US' && !(c === 'France' && pub.fx.deGaulle) && !(c === 'WGermany' && pub.fx.brandt)) return false;
        if (o.coup && pub.fx.reformer && C[c].reg === 'EU') return false;
      }
      return true;
    });
  }
  function coupModFor(pub, side, c) {
    let m = 0;
    if (pub.tfx && pub.tfx.salt) m--;
    if (pub.tfx && pub.tfx.squads && (C[c].reg === 'CA' || C[c].reg === 'SA')) m += pub.tfx.squads === side ? 1 : -1;
    return m;
  }
  function bestCoup(pub, side, w, ops, bonus, o) {
    let best = { v: -Infinity, c: null };
    for (const c of coupTargets(pub, side, Object.assign({ coup: true }, o || {}))) {
      const v = coupEV(pub, side, w, c, ops + D.bonusFor(bonus || [], [c]), coupModFor(pub, side, c), o && o.free);
      if (v > best.v) best = { v, c };
    }
    return best;
  }
  function bestRealign(pub, side, w) {
    let best = { v: -Infinity, c: null };
    for (const c of coupTargets(pub, side, {})) {
      const v = realignEV(pub, side, w, c);
      if (v > best.v) best = { v, c };
    }
    return best;
  }
  function placeable(pub, side) {
    return D.COUNTRIES.filter(c => {
      if (side === 'SU' && pub.tfx && pub.tfx.chernobyl && C[c].reg === pub.tfx.chernobyl) return false;
      if (pub.inf[c][side] > 0 || C[c].sup === side) return true;
      return C[c].adj.some(a => pub.inf[a][side] > 0);
    });
  }
  /* What `ops` are worth to `side`, spent the best way. */
  function opsWorth(pub, side, w, ops, bonus, lv, memo) {
    const key = ops + '|' + JSON.stringify(bonus || []);
    if (memo && memo[key]) return memo[key];
    const inf = planPlace(pub.inf, side, w, placeable(pub, side), ops, bonus);
    const coup = bestCoup(pub, side, w, ops, bonus);
    let realign = { v: -Infinity };
    if (lv.realign) { const r = bestRealign(pub, side, w); realign = { v: r.v * ops * 0.85, c: r.c }; }
    const out = { inf: inf.v, coup: coup.v, coupBg: !!(coup.c && C[coup.c].bg), realign: realign.v, best: Math.max(inf.v, coup.v, realign.v) };
    if (memo) memo[key] = out;
    return out;
  }

  /* ================================================================
     What an event is worth to the side it belongs to. A rough price in the
     same units as `value`; the house uses it for its own events and, for the
     other side's, as the harm of letting it happen.
     ================================================================ */
  function evValue(pub, id, s, w, lv) {
    const inf = pub.inf, opp = other(s);
    const ctrl = c => D.ctrl(inf, c);
    const d = ch => delta(inf, s, w, ch).d;
    const card = D.CARD[id];
    const vp = n => n * 1.0;
    const sc = r => { const x = D.scoreRegion(inf, r, { taiwanBg: pub.fx.formosan, shuttle: (r === 'ME' || r === 'AS') && pub.fx.shuttle }); return x.euroWin ? (x.euroWin === s ? 60 : -60) : (x[s] - x[opp]); };
    const greedyAdd = (n, list, per) => {
      let cur = copyInf(inf), v = 0; const used = {};
      for (let k = 0; k < n; k++) {
        let b = null;
        for (const c of list) { if ((used[c] || 0) >= (per || n)) continue; const dd = delta(cur, s, w, [{ c, s, n: 1 }]).d; if (!b || dd > b.dd) b = { c, dd }; }
        if (!b) break; cur[b.c][s]++; used[b.c] = (used[b.c] || 0) + 1; v += b.dd;
      }
      return v;
    };
    const greedyRem = (n, list, per) => {
      let cur = copyInf(inf), v = 0; const used = {};
      for (let k = 0; k < n; k++) {
        let b = null;
        for (const c of list) { if ((used[c] || 0) >= (per || n) || cur[c][opp] <= 0) continue; const dd = delta(cur, s, w, [{ c, s: opp, n: -1 }]).d; if (!b || dd > b.dd) b = { c, dd }; }
        if (!b) break; cur[b.c][opp]--; used[b.c] = (used[b.c] || 0) + 1; v += b.dd;
      }
      return v;
    };
    const eachAdd = (k, list) => { const vals = list.map(c => d([{ c, s, n: 1 }])).sort((a, b) => b - a); return vals.slice(0, k).reduce((a, b) => a + b, 0); };
    const clearIt = c => d([{ c, s: opp, n: -inf[c][opp] }]);
    const toControl = c => { const need = C[c].stab + inf[c][opp] - inf[c][s]; return need > 0 ? d([{ c, s, n: need }]) : 0; };
    const war = (t, win, vpn, mil) => {
      const minus = C[t].adj.filter(a => ctrl(a) === opp).length;
      const p = Math.max(0, Math.min(6, 7 - win + minus * -1)) / 6;
      return p * (vpn + d([{ c: t, s: opp, n: -inf[t][opp] }, { c: t, s, n: inf[t][opp] }])) + Math.min(mil, Math.max(0, pub.defcon - pub.mil[s])) * 0.8;
    };
    const defconDrop = () => (pub.defcon <= 2 ? -1000 : pub.defcon === 3 ? -2 : -0.3);
    const ops = n => opsWorth(pub, s, w, n, [], lv).best;
    const AF_SEA = D.COUNTRIES.filter(c => C[c].reg === 'AF' || C[c].subs.indexOf('SEA') >= 0);
    switch (id) {
      case 1: return sc('AS'); case 2: return sc('EU'); case 3: return sc('ME'); case 37: return sc('CA');
      case 38: return sc('SEA'); case 79: return sc('AF'); case 81: return sc('SA');
      case 4: return pub.defcon <= 2 ? -1000 : vp(5 - (pub.defcon - 1)) + (pub.defcon === 3 ? -1 : 0);
      case 5: return 1.5;
      case 7: return greedyRem(3, D.inReg('WE'), 2);
      case 8: return clearIt('Cuba') + toControl('Cuba');
      case 9: return d([{ c: 'Vietnam', s, n: 2 }]) + 0.8;
      case 10: return inf.WGermany.US > 0 ? 2.5 : 0.3;
      case 11: return war('SKorea', 4, 2, 2);
      case 12: return clearIt('Romania') + toControl('Romania');
      case 13: return war('Israel', 4 + (ctrl('Israel') === 'US' ? 1 : 0), 2, 2);
      case 14: return eachAdd(4, D.inReg('EE').filter(c => ctrl(c) !== 'US'));
      case 15: return d([{ c: 'Egypt', s, n: 2 }, { c: 'Egypt', s: opp, n: -Math.ceil(inf.Egypt.US / 2) }]);
      case 16: return Math.max(greedyAdd(5, D.inReg('EE'), 2), 4);
      case 17: return d([{ c: 'France', s: opp, n: -2 }, { c: 'France', s, n: 1 }]) + (pub.fx.nato ? 1 : 0);
      case 18: return 1.5;
      case 19: { const l = D.inReg('EU').filter(c => !ctrl(c) && inf[c].SU > 0); return l.length ? Math.max.apply(null, l.map(clearIt)) : 0; }
      case 20: return pub.defcon <= 2 ? -1000 : 1;
      case 21: return 3;
      case 22: { const l = ['Yugoslavia', 'Romania', 'Bulgaria', 'Hungary', 'Czechoslovakia'].filter(c => inf[c].SU > inf[c].US); return l.length ? Math.max.apply(null, l.map(c => d([{ c, s: 'US', n: inf[c].SU - inf[c].US }]))) : 0; }
      case 23: return eachAdd(7, D.inReg('WE').filter(c => ctrl(c) !== 'SU')) + 1;
      case 24: return Math.max(war('India', 4, 2, 2), war('Pakistan', 4, 2, 2));
      case 25: case 51: return 2.5;
      case 26: return 1.2 + ops(1) * 0.8;
      case 27: return toControl('Japan') + 1;
      case 28: return greedyRem(4, ['France', 'UK', 'Israel'], 2);
      case 29: return greedyRem(pub.turn >= 8 ? 6 : 3, D.inReg('EE'), pub.turn >= 8 ? 2 : 1);
      case 30: return eachAdd(4, AF_SEA);
      case 31: return 3;
      case 32: return 1.5;
      case 33: return 2.5;
      case 34: return vp(Math.max(0, pub.defcon - 2)) + 0.5;
      case 35: return 0.8;
      case 36: return 1.5;
      case 39: return pub.mil[s] > pub.mil[opp] ? (pub.mil[s] >= pub.defcon ? 3 : 1) : 0;
      case 40: return 1;
      case 41: return 0.8;
      case 42: case 44: return 3.5;
      case 43: return 1.2;
      case 45: return pub.defcon <= 2 ? -1000 : 1;
      case 46: return 2;
      case 47: return greedyAdd(2, D.COUNTRIES.filter(c => C[c].reg === 'CA' || C[c].reg === 'SA'), 2) + 1;
      case 48: { const bg = x => D.COUNTRIES.filter(c => C[c].bg && ctrl(c) === x).length; return bg('US') > bg('SU') ? 2 : 0; }
      case 49: return 1.5;
      case 50: return pub.defcon <= 2 ? -1000 : 3 + defconDrop();
      case 52: return d([{ c: 'SEAfricanStates', s, n: 2 }, { c: 'Angola', s, n: 2 }]);
      case 53: return Math.max(d([{ c: 'SouthAfrica', s, n: 2 }]), d([{ c: 'SouthAfrica', s, n: 1 }]) + greedyAdd(2, ['Angola', 'Botswana'], 2));
      case 54: return d([{ c: 'Chile', s, n: 2 }]);
      case 55: return 1 + d([{ c: 'WGermany', s, n: 1 }]);
      case 56: { const l = ['Sudan', 'Iran', 'Iraq', 'Egypt', 'Libya', 'SaudiArabia', 'Syria', 'Jordan'].map(clearIt).sort((a, b) => b - a); return (l[0] || 0) + (l[1] || 0); }
      case 57: return ops(4) + 0.3;
      case 58: return pub.china === 'US' ? 3 : 1;
      case 59: return 2.5;
      case 60: return 1.2;
      case 61: return ['Egypt', 'Iran', 'Libya', 'SaudiArabia', 'Iraq', 'GulfStates', 'Venezuela'].filter(c => ctrl(c) === 'SU').length;
      case 62: return 0.8 + ops(1) * 0.8;
      case 63: return eachAdd(4, AF_SEA);
      case 64: return d([{ c: 'Panama', s, n: 1 }, { c: 'CostaRica', s, n: 1 }, { c: 'Venezuela', s, n: 1 }]);
      case 65: return 1 + d([{ c: 'Israel', s, n: 1 }, { c: 'Jordan', s, n: 1 }, { c: 'Egypt', s, n: 1 }]);
      case 66: return eachAdd(3, D.COUNTRIES.filter(c => !inf[c].US && !inf[c].SU));
      case 67: return 2;
      case 68: return d([{ c: 'Poland', s: opp, n: -2 }, { c: 'Poland', s, n: 1 }]);
      case 69: return 1;
      case 70: return greedyAdd(2, D.COUNTRIES.filter(c => C[c].reg === 'CA' || C[c].reg === 'SA'), 2);
      case 71: return pub.china === 'US' ? 2 : 2.5;
      case 72: return clearIt('Egypt') + d([{ c: 'Egypt', s, n: 1 }]);
      case 73: return 2;
      case 74: return greedyRem(4, D.COUNTRIES.filter(c => C[c].reg !== 'EU'), 2);
      case 75: return greedyAdd(3, D.inReg('CA'), 2);
      case 76: return pub.china === 'SU' ? 3 : greedyAdd(4, D.inReg('AS'), 2);
      case 77: return 1.5;
      case 78: return D.COUNTRIES.filter(c => (C[c].reg === 'CA' || C[c].reg === 'SA') && C[c].bg && ctrl(c) === 'US').length;
      case 80: return pub.space[s] < pub.space[opp] ? 2.5 : 0;
      case 82: return clearIt('Iran') + d([{ c: 'Iran', s, n: 2 }]);
      case 83: return 1 + d([{ c: 'UK', s: opp, n: -inf.UK.SU }]) - 0.3;
      case 84: return Math.floor(inf.Libya.SU / 2);
      case 85: return 2;
      case 86: return 2;
      case 87: return greedyAdd(pub.vp < 0 ? 6 : 4, D.inReg('EU'), 2);
      case 88: return clearIt('Lebanon') + greedyRem(2, D.inReg('ME'), 2);
      case 89: return pub.defcon <= 2 ? -1000 : 2 + defconDrop() + (ctrl('SKorea') === 'US' ? ops(4) * 0.7 : 0);
      case 90: return 2.3 + (pub.fx.reformer ? ops(4) * 0.7 : 0);
      case 91: return clearIt('Nicaragua') + 1;
      case 92: return 1.5;
      case 93: return 0.8;
      case 94: return 1.5;
      case 95: return 2;
      case 96: return d([{ c: 'EGermany', s, n: 3 }]) + 1;
      case 97: return 1 + (pub.fx.flower ? 1.5 : 0);
      case 98: return 2;
      case 99: return 1 + greedyRem(3, D.inReg('WE'), 1);
      case 100: { const after = pub.vp + D.sgn(opp) * 6; return (s === 'US' ? after > 0 : after < 0) ? 50 : 0; }
      case 101: return d([{ c: 'Poland', s, n: 3 }]);
      case 102: return Math.max(war('Iran', 4, 2, 2), war('Iraq', 4, 2, 2));
      case 103: return 0.3;
      case 104: return 0.8;
      case 105: return ctrl('UK') === 'US' ? (pub.fx.nato ? 3.5 : 1) : 0;
      case 106: return 1.2;
      case 107: return 2;
      case 108: return 1;
      case 109: return 1;
      case 110: return d([{ c: 'SaudiArabia', s, n: 2 }]) + 0.5;
    }
    return card.ops * 0.8;
  }

  /* ================================================================
     Answering
     ================================================================ */
  function answer(pub, me, pr, lvName) {
    const side = me.side, opp = other(side);
    const p = pub.players.find(x => x.id === me.id);
    const lv = lvName ? Object.assign({}, LV[lvName], { noise: 0 }) : (LV[(p && p.level) || 'medium'] || LV.medium);
    const w = weights(pub);
    const key = [pub.turn, pub.ar, pr.what || pr.t, side, pub.logN].join(':');
    const jit = (k, scale) => (hash(key + ':' + k) - 0.5) * lv.noise * (scale || 1);
    if (pr.t === 'turn') return turn(pub, me, pr, lv, w, key, jit);
    if (pr.t === 'alloc') return alloc(pub, me, pr, lv, w, key);
    return pickAns(pub, me, pr, lv, w, key, jit);
  }

  function harmOf(pub, id, side, w, lv) {
    const opp = other(side);
    const v = evValue(pub, id, opp, w, lv);
    return Math.max(0, v) * lv.harm;
  }

  function turn(pub, me, pr, lv, w, key, jit) {
    const side = me.side, opp = other(side), c = me.can;
    const memo = {};
    const plays = [];
    const roundsLeft = c.of - c.ar + 1;
    const scoring = c.hand.filter(h => h.score);
    for (const h of c.hand) {
      const id = h.card, card = D.CARD[id];
      const bonus = id === D.CHINA ? [{ n: 1, where: 'AS' }] : (side === 'SU' && pub.tfx && pub.tfx.vietnam ? [{ n: 1, where: 'SEA' }] : []);
      const ow = h.inf.ok || h.coup.ok || h.realign.ok ? opsWorth(pub, side, w, h.ops, bonus, lv, memo) : null;
      const harm = h.trig ? harmOf(pub, id, side, w, lv) : 0;
      /* DEFCON 1 on your own turn loses: the other side's DEFCON-lowering
         event, triggered at DEFCON 2 (or after your own battleground coup has
         brought it there), is never worth it. */
      const drop = DROPS[id] && h.trig ? DROPS[id] : 0;
      const fiveYear = id === 5 && h.trig && pub.defcon <= 2 && me.hand.some(x => x === 4 || x === 89);
      const lethal = mode => fiveYear || (drop && (pub.defcon - drop <= 1 || (mode === 'coup' && pub.defcon - 1 - drop <= 1)));
      /* Spending the China Card hands it over: it costs a little. */
      const chinaCost = id === D.CHINA ? 2.2 : 0;
      if (h.event.ok) {
        let v = evValue(pub, id, card.side === 'N' ? side : card.side, w, lv);
        if (h.score) {
          /* A scoring card must go this turn; hold a bad one only while there
             are rounds to spare. */
          if (roundsLeft <= scoring.length) v += 100;
          else if (v < 0) v -= 2;
          else v += 1.5;
        }
        plays.push({ v: v + jit(id + 'e'), a: { t: 'play', n: c.n, card: id, how: 'event' } });
      }
      if (ow) {
        if (h.inf.ok) plays.push({ v: (lethal('inf') ? -1000 : 0) + ow.inf - harm - chinaCost + jit(id + 'i'), a: { t: 'play', n: c.n, card: id, how: 'inf', evFirst: h.trig && evFirstBetter(id) } });
        if (h.coup.ok) plays.push({ v: (lethal('coup') ? -1000 : 0) + ow.coup * (ow.coup > 0 ? lv.coup : 1) - harm - chinaCost + jit(id + 'c'), a: { t: 'play', n: c.n, card: id, how: 'coup', evFirst: h.trig && evFirstBetter(id) } });
        if (h.realign.ok && lv.realign) plays.push({ v: (lethal('realign') ? -1000 : 0) + ow.realign - harm - chinaCost + jit(id + 'r'), a: { t: 'play', n: c.n, card: id, how: 'realign', evFirst: h.trig && evFirstBetter(id) } });
      }
      if (h.space.ok && lv.space) {
        const p = h.space.need / 6;
        const box = D.SPACE[pub.space[side] + 1];
        const first = pub.space[opp] < pub.space[side] + 1;
        const sv = p * ((first ? box.vp[0] : box.vp[1]) + (box.adv ? 1 : 0.3)) + 0.4;
        /* Space is where a dangerous card goes to die. */
        plays.push({ v: sv + (h.trig ? 0 : -h.ops * 0.9) + jit(id + 's'), a: { t: 'play', n: c.n, card: id, how: 'space' } });
      }
    }
    if (c.pass) plays.push({ v: c.ar > c.of ? 0.5 : -50, a: { t: 'pass', n: c.n } });
    if (c.defuse && c.defuse.length && pub.defcon <= 2) {
      /* Defuse the crisis only if a coup is wanted; the house simply never
         coups under it, so it leaves its influence where it is. */
    }
    plays.sort((a, b) => b.v - a.v);
    const best = plays.find(x => x.v > -900) || plays[0];
    return best ? best.a : { t: 'pass', n: c.n };
  }
  /* Take the other side's event first when it removes influence we are about
     to spend Ops next to; otherwise Ops first. A simple rule: events that add
     the other side's influence go first (we can answer them), the rest after. */
  /* The events with a free coup or realignment, where, and their Ops. */
  const FREE = { 47: { where: ['CA', 'SA'], ops: 2 }, 96: { where: ['EU'], ops: 3 } };
  /* The events that lower DEFCON, and by how much. */
  const DROPS = { 4: 1, 50: 1, 89: 1 };
  function evFirstBetter(id) {
    return [8, 12, 14, 15, 16, 30, 52, 54, 63, 64, 65, 66, 70, 75, 76, 82, 87, 96, 101, 110].indexOf(id) >= 0;
  }

  function alloc(pub, me, pr, lv, w, key) {
    const side = me.side;
    if (pr.what === 'inf') {
      const plan = planPlace(pub.inf, side, w, pr.options.map(o => o.id), pr.budget, pr.bonus, key, lv);
      /* Never break the budget: the plan already respects it. */
      return { t: 'alloc', n: pr.n, map: plan.map };
    }
    const who = pr.who || side;
    const caps = {};
    pr.options.forEach(o => { caps[o.id] = o.cap; });
    const cur = copyInf(pub.inf);
    const map = {};
    let left = pr.total, placed = 0;
    const opt = pr.act === 'rem' && who === side && !pr.min;
    for (let k = 0; k < 40 && left > 0; k++) {
      let b = null;
      for (const o of pr.options) {
        if ((map[o.id] || 0) >= caps[o.id]) continue;
        const n = pr.act === 'rem' ? -1 : 1;
        if (n < 0 && cur[o.id][who] <= 0) continue;
        const dd = delta(cur, side, w, [{ c: o.id, s: who, n }]).d + (hash(key + o.id + k) - 0.5) * lv.noise * 0.3;
        if (!b || dd > b.dd) b = { id: o.id, dd, n };
      }
      if (!b) break;
      /* Taking your own influence off (De-Stalinization) only where it does
         little; it all goes back down somewhere better. */
      if (opt && b.dd < -0.4) break;
      cur[b.id][who] += b.n;
      map[b.id] = (map[b.id] || 0) + 1;
      left--; placed++;
    }
    if (placed < pr.min) {
      for (const o of pr.options) { while (placed < pr.min && (map[o.id] || 0) < caps[o.id]) { map[o.id] = (map[o.id] || 0) + 1; placed++; } }
    }
    return { t: 'alloc', n: pr.n, map };
  }

  function pickAns(pub, me, pr, lv, w, key, jit) {
    const side = me.side, opp = other(side);
    const legal = pr.options.filter(o => !o.bad);
    const first = () => (legal.length ? { t: 'pick', n: pr.n, id: legal[0].id } : (pr.skip ? { t: 'skip', n: pr.n } : { t: 'pick', n: pr.n, id: pr.options[0].id }));
    const best = (score, minV) => {
      let b = null;
      for (const o of legal) { const v = score(o) + jit(o.id); if (!b || v > b.v) b = { v, o }; }
      if (!b || (minV != null && b.v < minV && pr.skip)) return pr.skip ? { t: 'skip', n: pr.n } : first();
      return { t: 'pick', n: pr.n, id: b.o.id };
    };
    const inf = pub.inf;
    const dAdd = (c, s, n) => delta(inf, side, w, [{ c, s, n }]).d;
    const cardVal = id => { const cd = D.CARD[id]; if (cd.score) return D.scoreRegion(inf, cd.score, {}).net * D.sgn(side) * -0.5 + 3; return cd.side === opp ? -harmOf(pub, id, side, w, lv) + cd.ops * 0.5 : evValue(pub, id, side, w, lv) * 0.5 + cd.ops; };
    if (pr.multi) {
      const k = pr.max;
      let ids = [];
      if (pr.what === 'countries') {
        const who = pr.who || side;
        const act = pr.act;
        const scored = legal.map(o => {
          const c = o.id;
          let v;
          if (act === 'add') v = dAdd(c, who, 1);
          else if (act === 'rem') v = dAdd(c, who, -(pub.turn >= 8 && pr.card === 29 ? 2 : 1));
          else if (act === 'clear') v = dAdd(c, who, -inf[c][who]);
          else v = 0;
          return { id: o.id, v: v + jit(o.id, 0.3) };
        }).sort((a, b) => b.v - a.v);
        ids = scored.slice(0, k).map(x => x.id);
      } else if (pr.what === 'asknot' || pr.what === 'tehran') {
        /* Throw away the other side's dangerous cards and bad scoring cards. */
        ids = legal.filter(o => { const id = +o.id; const cd = D.CARD[id]; if (cd.score) return D.scoreRegion(inf, cd.score, {}).net * D.sgn(side) < 0; return cd.side === opp && harmOf(pub, id, side, w, lv) > 1.5; }).map(o => o.id).slice(0, k);
      } else ids = legal.slice(0, Math.max(pr.min, 0)).map(o => o.id);
      while (ids.length < pr.min) { const o = legal.find(x => ids.indexOf(x.id) < 0); if (!o) break; ids.push(o.id); }
      return { t: 'pick', n: pr.n, ids };
    }
    switch (pr.what) {
      case 'headline': {
        return best(o => {
          const id = +o.id, cd = D.CARD[id];
          const evSide = cd.side === 'N' ? side : cd.side;
          let v = evValue(pub, id, evSide, w, lv) * (evSide === side ? 1 : -lv.harm);
          if (cd.score) v += 1;
          return v - cd.ops * 0.55;
        });
      }
      case 'mode': {
        const scores = { inf: 1, coup: 0, realign: lv.realign ? -0.2 : -9, sa: 0, adj: 0.1, rem: 0, add: 0.2 };
        if (legal.some(o => o.id === 'coup') && legal.some(o => o.id === 'inf')) {
          const n = guessOps(pr);
          const ow = opsWorth(pub, side, w, n, [], lv);
          scores.inf = ow.inf; scores.coup = ow.coup; scores.realign = lv.realign ? ow.realign : -9;
        } else if (FREE[pr.card]) {
          /* An event's free coup or realignment (Junta, Tear Down This Wall):
             priced on its own targets, and skipped when nothing is worth it. */
          const f = FREE[pr.card];
          const where = c => f.where.indexOf(C[c].reg) >= 0;
          let bc = -Infinity, br = -Infinity;
          for (const c of coupTargets(pub, side, { coup: true, free: true }).filter(where)) bc = Math.max(bc, coupEV(pub, side, w, c, f.ops, coupModFor(pub, side, c), true));
          if (lv.realign) for (const c of coupTargets(pub, side, { free: true }).filter(where)) br = Math.max(br, realignEV(pub, side, w, c) * f.ops * 0.85);
          scores.coup = bc; scores.realign = br;
          return best(o => scores[o.id], 0.2);
        }
        return best(o => (scores[o.id] != null ? scores[o.id] : 0));
      }
      case 'coup': {
        return best(o => (o.warn ? -1000 : coupEV(pub, side, w, o.id, guessCoupOps(o), coupModFor(pub, side, o.id), pr.card && [47, 91, 96, 107].indexOf(pr.card) >= 0)), pr.skip ? 0.2 : null);
      }
      case 'realign': return best(o => realignEV(pub, side, w, o.id), 0.35);
      case 'target': {
        return best(o => {
          const t = o.id, minus = C[t].adj.filter(a => D.ctrl(inf, a) === opp).length;
          const win = pr.card === 36 ? 3 : 4;
          const pw = Math.max(0, 7 - win - minus) / 6;
          return pw * (2 + delta(inf, side, w, [{ c: t, s: opp, n: -inf[t][opp] }, { c: t, s: side, n: inf[t][opp] }]).d);
        });
      }
      case 'country': case 'norad': {
        const who = pr.who || side;
        return best(o => {
          const c = o.id;
          if (pr.act === 'clear') return dAdd(c, who, -inf[c][who]);
          if (pr.act === 'match') return dAdd(c, side, inf[c][other(side)] - inf[c][side]);
          const n = pr.card === 47 || pr.card === 105 && pub.fx.nato ? 2 : 1;
          return dAdd(c, side, n);
        });
      }
      case 'discard': {
        /* Pay with a card, or take the hit? */
        const worst = legal.map(o => ({ o, v: cardVal(+o.id) })).sort((a, b) => a.v - b.v)[0];
        const hit = pr.card === 10 ? -dAdd('WGermany', 'US', -inf.WGermany.US) : 3.5;
        return worst && worst.v < hit ? { t: 'pick', n: pr.n, id: worst.o.id } : (pr.skip ? { t: 'skip', n: pr.n } : first());
      }
      case 'stuck': {
        /* A scoring card that must go this turn goes now; otherwise the
           cheapest card is thrown away. */
        const sc = legal.filter(o => /^play:/.test(o.id));
        const left = (pub.rounds || 7) - pub.ar + 1;
        if (sc.length && left <= sc.length) return { t: 'pick', n: pr.n, id: sc[0].id };
        const disc = legal.filter(o => !/^play:/.test(o.id));
        if (!disc.length) return first();
        return { t: 'pick', n: pr.n, id: disc.map(o => ({ o, v: -cardVal(+o.id) })).sort((a, b) => b.v - a.v)[0].o.id };
      }
      case 'envy': {
        return best(o => -cardVal(+o.id));
      }
      case 'eagle': {
        const b = legal.map(o => ({ o, h: D.CARD[+o.id].side === opp ? harmOf(pub, +o.id, side, w, lv) : 0 })).sort((a, b) => b.h - a.h)[0];
        return b && b.h > 1 ? { t: 'pick', n: pr.n, id: b.o.id } : { t: 'skip', n: pr.n };
      }
      case 'salt': return best(o => { const cd = D.CARD[+o.id]; return cd.side === opp ? -5 : evValue(pub, +o.id, side, w, lv) + cd.ops * 0.3; }, 1.5);
      case 'starwars': return best(o => { const cd = D.CARD[+o.id]; return cd.side === opp ? -5 : evValue(pub, +o.id, side, w, lv); });
      case 'un': return best(o => harmOf(pub, +o.id, side, w, lv) + D.CARD[+o.id].ops * 0.5);
      case 'ames': return best(o => cardVal(+o.id));
      case 'grain': {
        const x = pr.card;
        const cd = D.CARD[x];
        const good = cd && !cd.score && (cd.side !== opp || cd.ops >= 3);
        return { t: 'pick', n: pr.n, id: good ? 'play' : 'back' };
      }
      /* A boycott at DEFCON 2 drops it to 1 on the host's turn: the host loses. */
      case 'olympics': return { t: 'pick', n: pr.n, id: pub.defcon <= 2 ? 'boycott' : 'go' };
      case 'warsaw': return { t: 'pick', n: pr.n, id: legal.some(o => o.id === 'rem') && D.inReg('EE').filter(c => inf[c].US >= 2).length >= 2 ? 'rem' : 'add' };
      case 'defcon': {
        /* Never DEFCON 1, rarely 2. Summit winners leave it alone; How I
           Learned sets a calm 4 unless it already is higher. */
        if (legal.some(o => o.id === '0')) {
          /* The Summit's winner may push DEFCON to 1 on the other side's turn. */
          if (pub.defcon === 2 && pub.cur && pub.cur !== side && legal.some(o => o.id === '-1')) return { t: 'pick', n: pr.n, id: '-1' };
          return { t: 'pick', n: pr.n, id: '0' };
        }
        const want = String(Math.max(3, Math.min(5, pub.defcon >= 4 ? pub.defcon : 4)));
        return legal.some(o => o.id === want) ? { t: 'pick', n: pr.n, id: want } : first();
      }
      case 'wargames': {
        const after = pub.vp + D.sgn(opp) * 6;
        const win = side === 'US' ? after > 0 : after < 0;
        return { t: 'pick', n: pr.n, id: win ? 'end' : 'no' };
      }
      case 'region': {
        /* Chernobyl: shut the USSR out of where it would gain most. */
        return best(o => D.inReg(o.id).reduce((t, c) => t + Math.max(0, delta(inf, 'SU', w, [{ c, s: 'SU', n: 1 }]).d), 0));
      }
      case 'first': case 'trigger': return first();
    }
    return first();
  }
  /* The Ops behind a mode question, from its wording ("spend 4 Ops"). */
  function guessOps(pr) { const m = /(\d) Op/.exec(pr.why || ''); return m ? +m[1] : 2; }
  function guessCoupOps(o) { return o.need != null ? Math.max(1, 2 * o.stab - o.need + 1) : 2; }

  /* A legal answer when the first one was refused (it should never be). */
  function fallback(pub, me, pr) {
    if (pr.t === 'turn') {
      const c = me.can;
      if (c.pass) return { t: 'pass', n: c.n };
      for (const h of c.hand) for (const how of ['event', 'inf', 'space', 'coup', 'realign']) if (h[how] && h[how].ok) return { t: 'play', n: c.n, card: h.card, how };
      return { t: 'pass', n: c.n };
    }
    if (pr.t === 'alloc') {
      if (pr.what === 'inf') return { t: 'alloc', n: pr.n, map: {} };
      const m = {}; let k = 0;
      for (const o of pr.options) { while (k < pr.min && (m[o.id] || 0) < o.cap) { m[o.id] = (m[o.id] || 0) + 1; k++; } }
      return { t: 'alloc', n: pr.n, map: m };
    }
    const legal = pr.options.filter(o => !o.bad);
    if (pr.multi) return { t: 'pick', n: pr.n, ids: legal.slice(0, pr.min).map(o => o.id) };
    if (legal.length) return { t: 'pick', n: pr.n, id: legal[0].id };
    return { t: 'skip', n: pr.n };
  }

  /* ================================================================
     The coach (How to play): the Hard house's own choice for this seat, from
     this seat's views alone and with no noise, said in one sentence. It is
     honest because the house is; it never sees the other hand. The phone
     lights what it names: a card, a way to play it, an option, countries.
     ================================================================ */
  const CN = c => (C[c] ? C[c].name : c);
  function coach(pub, me) {
    if (!pub || !me || !me.prompts || !me.prompts.length) return null;
    const pr = me.prompts[0];
    let a;
    try { a = answer(pub, me, pr, 'hard'); } catch (e) { return null; }
    if (!a) return null;
    const side = me.side, opp = other(side);
    if (pr.t === 'turn') {
      if (a.t === 'pass') return { n: pr.n, line: 'Nothing here is worth playing: pass.' };
      if (a.t === 'defuse') return { n: pr.n, line: 'Defuse the crisis first: take your 2 influence out of ' + CN(a.id) + '.', defuse: a.id };
      const card = D.CARD[a.card];
      const row = me.can && me.can.hand.find(x => x.card === a.card);
      const ops = row ? row.ops : card.ops;
      let why;
      if (a.how === 'event') why = card.score ? 'score ' + (card.score === 'SEA' ? 'Southeast Asia' : D.REGION[card.score].name) + ' now' : 'for its event: it does more for you than its ' + ops + ' Ops would';
      else if (a.how === 'space') why = 'into the space race' + (row && row.trig ? ': the ' + D.SIDE[opp].name + '’s event on it never happens' : ': a chance at the next box');
      else if (a.how === 'coup') {
        const w = weights(pub);
        const b = bestCoup(pub, side, w, ops, a.card === D.CHINA ? [{ n: 1, where: 'AS' }] : []);
        why = 'for a coup' + (b.c ? ' in ' + CN(b.c) : '') + ' (' + ops + ' Ops)';
      } else if (a.how === 'realign') why = 'for ' + ops + ' realignment roll' + (ops === 1 ? '' : 's');
      else why = 'for ' + ops + ' Ops of influence';
      const trig = row && row.trig && a.how !== 'space' ? ' Its ' + D.SIDE[opp].name + ' event happens too' + (a.evFirst ? ' — take it first.' : ' — take it after your Ops.') : '';
      return { n: pr.n, card: a.card, how: a.how, evFirst: !!a.evFirst, line: 'Play ' + card.name + ' ' + why + '.' + trig };
    }
    if (pr.t === 'alloc') {
      const m = a.map || {};
      const ks = Object.keys(m).filter(k => m[k] > 0).sort((x, y) => m[y] - m[x]);
      if (!ks.length) return { n: pr.n, line: 'Place none here.', map: {} };
      const verb = pr.act === 'rem' ? 'Take ' : 'Put ';
      return { n: pr.n, map: m, line: verb + ks.map(k => m[k] + (pr.act === 'rem' ? ' from ' : ' in ') + CN(k)).join(', ') + '.' };
    }
    if (a.t === 'skip') return { n: pr.n, skip: true, line: (pr.skip || 'Skip') + '.' };
    const lab = id => { const o = pr.options.find(x => x.id === id); return o ? (o.label || id) : id; };
    if (a.ids) return { n: pr.n, ids: a.ids.slice(), line: 'Choose ' + a.ids.map(lab).join(', ') + '.' };
    return { n: pr.n, id: a.id, line: (pr.what === 'headline' ? 'Headline ' : 'Choose ') + lab(a.id) + '.' };
  }

  const Bots = { VERSION, LV, answer, fallback, coach, value, weights, evValue, opsWorth };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.TSBots = Bots;
})(typeof window !== 'undefined' ? window : this);
