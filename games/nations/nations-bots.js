'use strict';
/* Nations — the house players.
 *
 * They decide from (publicView, seatView) and nothing else: the same two
 * things a phone is sent. Greedy, one step deep: every legal order on the
 * seat's `can` list is given a value in "resource-equivalents" and the best
 * one is played, or the nation passes when nothing is worth its gold.
 *
 * One valuation, `worth()`, and everything falls out of it (Saint
 * Petersburg's lesson): a resource is worth more when the coming production
 * and famine would leave you short of it, a VP is worth about five
 * resources, and the value of a card is what it will make over the rounds
 * that are left.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nations-data.js') : root.NationsData;
  const C = id => D.card(id);
  const RES = ['gold', 'stone', 'food', 'book'];
  const VPV = 6;

  function ctx(pub, me) {
    const p = pub.players.find(x => x.id === me.id);
    const others = pub.players.filter(x => x.id !== me.id);
    const R = Math.max(1, pub.lastRound - pub.round + 1);
    const ev = pub.event ? D.event(pub.event) : null;
    const famine = ev ? ev.famine : 2;
    /* How short each resource will be after this round's production and
       famine, and so how badly more of it is wanted. */
    const val = { gold: 1.1, stone: 1.0, food: 1.0, book: 0.75 };
    for (const r of RES) {
      const after = p.res[r] + (p.prod[r] || 0) - (r === 'food' ? famine : 0);
      if (after < 0) val[r] *= 2.6;
      else if (after < 3) val[r] *= 1.4;
      if ((p.prod[r] || 0) < 0 && r !== 'book') val[r] *= 1.3;
    }
    /* Stone is what every deployment and every wonder section costs: a
       nation with none can do nothing about a War. Keep some. */
    if (p.res.stone < 3) val.stone *= 1.7; else if (p.res.stone < 6) val.stone *= 1.25;
    if ((p.prod.stone || 0) <= 0) val.stone *= 1.2;
    /* Late in the game gold has less to buy. */
    /* In the last round a resource left over is a tenth of a VP. */
    if (R <= 1) { val.gold = 0.65; val.stone = Math.min(val.stone, 0.9); }
    const maxStr = Math.max(0, ...others.map(o => o.str));
    const minStr = Math.min(...others.map(o => o.str));
    const strV = p.str <= minStr ? 0.7 : (p.str < maxStr ? 0.5 : 0.3);
    /* Where strength stops mattering for the War: the War bought this round,
       or — while a War is still on the board — the strongest rival, who
       could buy it at their own strength. */
    let warT = null, warCost = 0;
    const warCards = pub.board.some(row => row.some(id => id && D.card(id).type === 'war'));
    const lossOf = id => Math.max(0, Object.values(D.card(id).loss)[0] - Math.max(0, p.stab));
    if (pub.war) { warT = pub.war.str; warCost = lossOf(pub.war.card) * 0.9 + VPV; }
    else if (warCards && pub.phase === 'action') {
      warT = Math.max(1, maxStr);
      const ids = []; pub.board.forEach(row => row.forEach(id => { if (id && D.card(id).type === 'war') ids.push(id); }));
      warCost = (Math.max(...ids.map(lossOf)) * 0.9 + VPV) * 0.55;
    }
    /* The value of strength going from `a` to `b` (either way). */
    const strGain = (a, b) => {
      let v = (b - a) * strV;
      if (warT != null && warT > 0) {
        if (a < warT && b >= warT) v += warCost;
        if (a >= warT && b < warT) v -= warCost;
        /* Part of the way there is worth part of it. */
        if (a < warT && b < warT && b > a) v += warCost * 0.35 * (b - a) / warT;
      }
      return v;
    };
    const stabV = p.stab < 0 ? 2.6 : (p.stab < 3 ? 0.9 : (p.stab < 8 ? 0.55 : 0.25));
    return { pub, me, p, others, R, val, strV, stabV, famine, ev, strGain };
  }

  /* What one worker on a card is worth per round. */
  function perWorker(x, card) {
    let v = 0;
    if (card.type === 'building') {
      for (const r of RES) v += (card.prod[r] || 0) * x.val[r];
      v += (card.prod.stab || 0) * x.stabV;
    } else if (card.type === 'military') {
      /* Strength is valued once, where it changes (strGain), not per round. */
      for (const r of RES) v -= (card.up[r] || 0) * x.val[r];
      v -= (card.up.stab || 0) * x.stabV;
    }
    return v;
  }
  const slotValue = (x, s) => s && s.card ? perWorker(x, C(s.card)) * s.w * x.R : 0;
  function flatValue(x, card) {
    let v = 0;
    for (const r of RES) v += (card.prod[r] || 0) * x.val[r] * x.R;
    v += (card.prod.stab || 0) * x.stabV * 1.5;
    if (card.prod.str) v += x.strGain(x.p.str, x.p.str + card.prod.str) + card.prod.str * 0.25 * x.R;
    return v;
  }
  /* A guess at an advisor's or wonder's text, in the same units. */
  const FX_GUESS = {
    augustine: 3, augustus: 3, aquino: 5, notredame: 4, hatshepsut: 2, sejong: 1, komnene: 3,
    montezuma: 2, galileo: 5, isabella: 2, elizabeth: 3, nightingale: 3, frederick: 2, linzexu: -4,
    archimedes: 3, cyrus: 2, suntzu: 3, hannibal: 1, buddha: -3, mansamusa: 1, eleanor: 2, abubakr: 1,
    genghis: 1, alhazen: 0, marcopolo: 3, pocahontas: 0, luther: 0, tokugawa: 3, peter: 4, machiavelli: 1,
    suleiman: 3, curie: 5, lincoln: 4, disraeli: 2, nobel: 2, bolivar: 1, shaka: 1,
    alhambra: 4, porcelain: 2, sistine: 3, sphinx: 3, greatlighthouse: 2, petra: 5, solomon: 3,
    chichenitza: 1, angkorwat: -2, greatwall: 2, piazza: 6, royalsociety: 4, uraniborg: 2, potala: 2,
    forbidden: 2, himeji: 1, redfort: 2, bigben: 1, mit: 2, liberty: 1, versailles: -3,
    stonehenge: 9, colosseum: -2, sankore: 6, tajmahal: 11, darwin: 13, southpole: -5, moai: 10,
    terracotta: 1, britishmuseum: 2, brandenburg: 5, titanic: 0
  };
  const fxValue = (x, id) => (FX_GUESS[id] || 0) * Math.min(1.5, x.R / 3 + 0.4);

  function wonderValue(x, card) {
    return flatValue(x, card) + (card.vp || 0) * VPV + fxValue(x, card.id);
  }

  /* ---------------- the turn ---------------- */
  function turn(pub, me, can) {
    const x = ctx(pub, me);
    const p = x.p;
    const opts = [];
    const add = (v, a) => opts.push({ v, a });
    const goldV = x.val.gold;

    /* Put a worker to work. */
    for (const d of can.deploy) {
      if (!d || !d.ok) continue;
      const card = C(d.card);
      const s = p.bm[d.slot];
      const vpNext = (card.vp || [])[s.w] || 0;
      const sg = card.type === 'military' ? x.strGain(p.str, p.str + card.str) + card.str * 0.25 * x.R : 0;
      add(perWorker(x, card) * x.R + sg + vpNext * VPV * (x.R <= 2 ? 1 : 0.8) - d.cost * x.val.stone, { t: 'deploy', slot: d.slot });
    }
    /* Move a worker from the worst card to a much better one. */
    if (!p.idle) for (const d of can.deploy) {
      if (!d || !d.canMove || !d.canMove.length) continue;
      const card = C(d.card);
      let worst = null;
      const mv = (from, to) => {
        const fc = C(from), tc = C(to);
        const s0 = p.str, s1 = p.str - (fc.type === 'military' ? fc.str : 0) + (tc.type === 'military' ? tc.str : 0);
        const sg = x.strGain(s0, s1);
        /* A worker moved onto military to meet a War goes back afterwards:
           it costs this round's work and a stone or two, not the rest of the game. */
        const horizon = tc.type === 'military' && sg > 3 ? Math.min(x.R, 1.5) : x.R;
        return (perWorker(x, tc) - perWorker(x, fc)) * horizon + sg;
      };
      for (const j of d.canMove) { const w = -mv(p.bm[j].card, d.card); if (!worst || w < worst.w) worst = { j, w }; }
      if (!worst) continue;
      const gainV = -worst.w - d.cost * x.val.stone;
      if (gainV > 2) add(gainV, { t: 'deploy', slot: d.slot, from: worst.j });
    }
    /* Buy. */
    for (const b of can.board) {
      if (!b.ok) continue;
      const card = C(b.card);
      const cost = b.price * goldV;
      const need = b.need || {};
      switch (card.type) {
        case 'building': case 'military': {
          let best = null;
          for (const k of need.slot || []) {
            const s = p.bm[k];
            const cur = slotValue(x, s);
            const freed = s && s.card ? s.w : 0;
            const pw = perWorker(x, card);
            const keepW = Math.max(freed, p.idle > 0 ? 1 : 0);
            let v = pw * keepW * x.R * 0.85 - cur - freed * card.dep * x.val.stone;
            /* Strength lost with the old card's workers, and a little for what
               the new one could hold. */
            if (s && s.card && C(s.card).type === 'military' && s.w) v += x.strGain(p.str, p.str - C(s.card).str * s.w);
            if (card.type === 'military') {
              v += card.str * 0.25 * x.R * (keepW ? 0.6 : 0.3);
              /* Our strength after the swap, then after a worker goes on. */
              const lost = s && s.card && C(s.card).type === 'military' ? C(s.card).str * s.w : 0;
              v += 0.6 * (x.strGain(p.str - lost, p.str - lost + card.str * Math.max(1, freed)) - x.strGain(p.str - lost, p.str - lost)) * (keepW ? 1 : 0.5);
            }
            if (!s || !s.card) v += 0.5;
            v += (card.vp || [])[0] * VPV * (keepW ? 0.7 : 0.2);
            if (!best || v > best.v) best = { v, k };
          }
          if (best) add(best.v - cost, { t: 'buy', r: b.r, c: b.c, slot: best.k });
          break;
        }
        case 'colony': {
          let v = flatValue(x, card) + (card.vp || 0) * VPV;
          let slot;
          if (need.slot) {
            let worst = null;
            for (const k of need.slot) { const w = flatValue(x, C(p.colonies[k])) + (C(p.colonies[k]).vp || 0) * VPV; if (!worst || w < worst.w) worst = { k, w }; }
            v -= worst.w; slot = worst.k;
          }
          add(v - cost, { t: 'buy', r: b.r, c: b.c, slot });
          break;
        }
        case 'advisor': {
          const slot = need.slot ? need.slot[need.slot.length - 1] : undefined;
          const oldId = p.advisors[slot || 0];
          let v = flatValue(x, card) + fxValue(x, card.id);
          if (oldId) v -= flatValue(x, C(oldId)) + fxValue(x, oldId);
          add(v - cost, { t: 'buy', r: b.r, c: b.c, slot });
          break;
        }
        case 'wonder': {
          const stone = card.cost.reduce((t, k) => t + k, 0);
          const archs = pub.arch + p.privArch;
          let v = wonderValue(x, card) - stone * x.val.stone * 0.8;
          if (x.R < card.cost.length / 2) v -= 20;
          if (!archs && x.R <= 1) v -= 20;
          if (p.uc) v -= wonderValue(x, C(p.uc.card)) * (p.uc.built / C(p.uc.card).cost.length) + 3;
          add(v * 0.9 - cost, { t: 'buy', r: b.r, c: b.c });
          break;
        }
        case 'golden': {
          const resV = need.gaGain * x.val[card.res];
          const pay = canPayMix(p, need.vpCost, b.price) ? payMix(p, need.vpCost, b.price, x) : null;
          const vpV = pay ? VPV - RES.reduce((t, r) => t + pay[r] * x.val[r], 0) : -99;
          if (vpV > resV) add(vpV - cost, { t: 'buy', r: b.r, c: b.c, pick: 'vp', pay });
          else add(resV - cost, { t: 'buy', r: b.r, c: b.c, pick: 'res' });
          break;
        }
        case 'battle': {
          const r = ['book', 'food', 'stone'].sort((a, c) => x.val[c] - x.val[a])[0];
          add(p.raid * x.val[r] - cost, { t: 'buy', r: b.r, c: b.c, pick: r });
          break;
        }
        case 'war': {
          let v = p.str === 0 ? -5 : 0;
          for (const o of x.others) if (o.str < p.str) {
            const loss = Object.values(card.loss)[0] - Math.max(0, o.stab);
            v += (Math.max(0, loss) * 0.8 + VPV) * 0.35;
          }
          /* A War bought here is one a stronger nation cannot buy at us. */
          if (x.others.some(o => o.str > p.str)) v += 2;
          add(v - cost, { t: 'buy', r: b.r, c: b.c });
          break;
        }
      }
    }
    /* Build a wonder. */
    if (can.hire && (can.hire.public || can.hire.private)) {
      const card = C(can.hire.card);
      const left = card.cost.length - can.hire.built;
      const v = wonderValue(x, card) / Math.max(1, left) * (left === 1 ? 1.4 : 1) - can.hire.cost * x.val.stone;
      add(v, { t: 'hire', src: can.hire.private ? 'private' : 'public' });
    }
    /* Card actions. */
    for (const s of can.specials) {
      if (!s.ok) continue;
      switch (s.act) {
        case 'petra': { const r = ['book', 'gold', 'stone'].sort((a, c) => x.val[c] - x.val[a])[0]; add(3 * x.val[r] - x.val.food, { t: 'special', card: s.card, pick: r }); break; }
        case 'piazza': { const r = ['book', 'food', 'stone'].sort((a, c) => x.val[c] - x.val[a])[0]; add(5 * x.val[r] - 2 * goldV, { t: 'special', card: s.card, pick: r }); break; }
        case 'marco': { const r = p.res.food - x.famine > p.res.stone ? 'food' : 'stone'; if (p.res[r] >= 2) add(4 * goldV - 2 * x.val[r], { t: 'special', card: s.card, pick: r }); break; }
        case 'lincoln': case 'suleiman': {
          const sec = p.track.stab - p.taken.stab > 0 && p.stab >= 4 ? 'stab' : 'food';
          const v = (p.prod.food >= 3 || sec === 'stab') ? 4 : -2;
          add(v, { t: 'special', card: s.card, pick: sec });
          break;
        }
        case 'royal': {
          let best = null;
          for (const d of can.deploy) if (d && p.idle) { const v = perWorker(x, C(d.card)) * x.R; if (!best || v > best.v) best = { v, slot: d.slot }; }
          if (best) add(best.v, { t: 'special', card: s.card, slot: best.slot });
          break;
        }
        case 'galileo': {
          for (const b of can.galileo || []) {
            const card = C(b.card);
            if (card.type === 'golden') add(Math.max(b.need.gaGain * x.val[card.res], 0), { t: 'special', card: s.card, r: b.r, c: b.c, pick: 'res' });
            else if (!p.uc) add(wonderValue(x, card) * 0.8, { t: 'special', card: s.card, r: b.r, c: b.c });
          }
          break;
        }
        case 'bolivar': break;
      }
    }
    /* Passing while a War can still be bought by somebody stronger. */
    let passCost = 0;
    if (!pub.war && pub.board.some(row => row.some(id => id && D.card(id).type === 'war'))) {
      const live = x.others.filter(o => !o.passed && o.str > p.str);
      if (live.length) passCost = 3;
    }
    opts.sort((a, b) => b.v - a.v);
    const best = opts[0];
    if (best && passCost && best.v > -passCost) return best.a;
    if (!best || best.v < 0.3) return { t: can.skipOnly ? 'skip' : 'pass' };
    return best.a;
  }
  function canPayMix(p, n, goldHeld) {
    return (p.res.gold - goldHeld) + p.res.stone + p.res.food + p.res.book >= n;
  }
  function payMix(p, n, goldHeld, x) {
    const pay = { gold: 0, stone: 0, food: 0, book: 0 };
    const have = { gold: p.res.gold - goldHeld, stone: p.res.stone, food: p.res.food, book: p.res.book };
    const order = RES.slice().sort((a, b) => (x ? x.val[a] : 1) - (x ? x.val[b] : 1) || have[b] - have[a]);
    let left = n;
    for (const r of order) { const k = Math.min(left, Math.max(0, have[r])); pay[r] += k; left -= k; }
    return pay;
  }

  /* ---------------- every other question ---------------- */
  function answer(pub, me, pr) {
    const p = pub.players.find(x => x.id === me.id);
    switch (pr.t) {
      case 'turn': return !me.can ? { n: pr.n, t: 'pass' } : me.can.skipOnly ? { n: pr.n, t: 'skip' } : Object.assign({ n: pr.n }, turn(pub, me, me.can));
      case 'nation': return { n: pr.n, t: 'nation', nation: pr.options[0].id, side: 'B' };
      case 'growth': {
        const x = ctx(pub, me);
        const food = pr.options.find(o => o.id === 'worker:food');
        const st = pr.options.find(o => o.id === 'worker:stab');
        const top = pr.options.find(o => o.id === 'worker:top');
        const idleUse = p.bm.some(s => s && s.card && C(s.card).type === 'building');
        if (top) return { n: pr.n, t: 'growth', pick: top.id };
        /* Grow while there are rounds to use a worker in and something to
           put it on; pay for it in food if the kitchen can carry 3 more,
           else in stability if there is stability to spare. */
        const room = p.bm.filter(s => s && s.card).reduce((t, s) => t + Math.max(0, (C(s.card).vp || []).length - s.w), 0);
        if (x.R >= 3 && idleUse && room > p.idle) {
          const famine = 2;
          if (food && p.prod.food - 3 - famine >= -1 && p.res.food >= 5) return { n: pr.n, t: 'growth', pick: food.id };
          if (st && p.stab - 3 >= 0) return { n: pr.n, t: 'growth', pick: st.id };
          if (food && p.prod.food - 3 >= 0) return { n: pr.n, t: 'growth', pick: food.id };
        }
        const want = ['gold', 'stone', 'food'].sort((a, b) => x.val[b] - x.val[a])[0];
        return { n: pr.n, t: 'growth', pick: 'bonus:' + want };
      }
      case 'mix': {
        const pay = { gold: 0, stone: 0, food: 0, book: 0 };
        const have = Object.assign({}, p.res);
        let left = Math.min(pr.owe, pr.from.reduce((t, r) => t + have[r], 0));
        while (left > 0) {
          const r = pr.from.filter(k => have[k] - pay[k] > 0).sort((a, b) => (have[b] - pay[b]) - (have[a] - pay[a]))[0];
          if (!r) break;
          pay[r]++; left--;
        }
        return { n: pr.n, t: 'mix', pay };
      }
      case 'choice': return { n: pr.n, t: 'pick', pick: choose(pub, me, pr, p) };
    }
    return { n: pr.n, t: 'pass' };
  }
  function choose(pub, me, pr, p) {
    const x = ctx(pub, me);
    const ids = pr.options.map(o => o.id);
    const has = id => ids.indexOf(id) >= 0;
    switch (pr.what) {
      case 'mayPay': return 'yes';
      case 'mayLast': return p.str < Math.max(...x.others.map(o => o.str)) ? 'yes' : 'no';
      case 'take': return has('food') && p.prod.food >= 3 ? 'food' : (has('stab') && p.stab >= 4 ? 'stab' : (has('no') ? 'no' : ids[0]));
      case 'undeploy': return has('no') ? 'no' : ids[0];
      case 'freeArch': case 'freeMil': return has('yes') ? 'yes' : ids[0];
      case 'returnTo': return p.stab < 3 ? 'stab' : 'food';
      case 'returnFrom': return has('idle') ? 'idle' : ids[ids.length - 1];
      case 'either': {
        /* The cheapest-looking option. */
        let best = null;
        for (const o of pr.options) {
          let cost = 2;
          const m = o.label.match(/−(\d+) (\w+)/);
          if (m) cost = +m[1] * (m[2] === 'VP' ? VPV : (x.val[m[2]] || 1));
          if (/Go last/.test(o.label)) cost = 3;
          if (/architect/.test(o.label)) cost = 4;
          if (/advisor/.test(o.label)) cost = 5;
          if (/Everybody else/.test(o.label)) cost = -2;
          if (/strength/.test(o.label)) cost = 2;
          if (!best || cost < best.cost) best = { id: o.id, cost };
        }
        return best ? best.id : ids[0];
      }
      case 'peter': return ['stone', 'gold', 'book'].sort((a, b) => x.val[b] - x.val[a]).find(has) || ids[0];
      case 'event': return ids[Math.floor(Math.random() * ids.length) % ids.length];
      default: return ids[0];
    }
  }
  /* An answer that is always legal, for when the engine refuses the first. */
  function fallback(pub, me, pr) {
    switch (pr.t) {
      case 'turn': return { n: pr.n, t: me.can && me.can.skipOnly ? 'skip' : 'pass' };
      case 'growth': return { n: pr.n, t: 'growth', pick: pr.options[pr.options.length - 1].id };
      case 'nation': return { n: pr.n, t: 'nation', nation: pr.options[0].id, side: 'A' };
      case 'choice': return { n: pr.n, t: 'pick', pick: pr.options[pr.options.length - 1].id };
      case 'mix': return answer(pub, me, pr);
    }
    return { n: pr.n, t: 'pass' };
  }

  const Bots = { answer, fallback, VERSION: 1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.NationsBots = Bots;
})(typeof window !== 'undefined' ? window : globalThis);
