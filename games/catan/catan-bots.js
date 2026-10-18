/* Catan — the house players.
 *
 * A house player is a headless phone: it decides from exactly what a handset
 * gets — the public view and its own seat's half — and answers through the
 * same validated door. It is never handed the Game.
 *
 *   B.answer(pub, me, prompt, ctx)  → an action for the prompt in front of it
 *   B.reply(pub, me, offer)         → {t:'reply', offer, yes} for someone's offer
 *
 * It plays honestly and sensibly, not brilliantly: good starting spots, a
 * build goal with trades towards it, a robber aimed at the leader, knights
 * out when the barbarians are near. `ctx.waited` is the display telling it
 * an offer has had long enough.
 */
(function (root) {
  'use strict';
  const D = root.CatanData || (typeof require === 'function' ? require('./catan-data.js') : null);
  const Board = root.CatanBoard || (typeof require === 'function' ? require('./catan-board.js') : null);

  /* Memory is per game (pub.gid) and per seat, or it leaks between games. */
  const MEM = {};
  function mem(pub, me) {
    const k = pub.gid + ':' + me.id;
    let m = MEM[k];
    if (!m) {
      for (const x of Object.keys(MEM)) if (!x.startsWith(pub.gid + ':')) delete MEM[x];
      m = MEM[k] = { turn: -1 };
    }
    if (m.turn !== pub.turnNo) { m.turn = pub.turnNo; m.bank = 0; m.offered = 0; m.plan = null; m.moves = 0; }
    return m;
  }

  /* ---------------- reading the board ---------------- */
  function view(pub, me) {
    const B = Board.build(pub.layout);
    const idx = {};
    pub.players.forEach(p => { idx[p.id] = p.i; });
    const build = {}, road = {}, knight = {};
    for (const b of pub.builds) build[b.at] = b;
    for (const r of pub.roads) road[r.at] = r.owner;
    for (const k of pub.knights) knight[k.at] = k;
    const V = { pub, me, B, build, road, knight, idx, my: me.id };
    V.pl = id => pub.players.find(p => p.id === id);
    V.mine = pub.players.find(p => p.id === me.id);
    /* How often each resource comes in, board-wide — rarer is dearer. */
    const board = {};
    for (const k of D.RES) board[k] = 0;
    pub.hexes.forEach(h => { const r = D.TERRAIN[h.t].res; if (r && h.n) board[r] += D.PIPS[h.n]; });
    V.scarce = {};
    for (const k of D.RES) V.scarce[k] = 1 + Math.max(0, 12 - board[k]) / 18;
    V.income = income(V, me.id);
    return V;
  }
  function hexPips(V, h) {
    const x = V.pub.hexes[h];
    if (!x.n || h === V.pub.robber) return 0;
    return D.PIPS[x.n] || 0;
  }
  /* Expected cards per 36 rolls, per resource, for a seat. */
  function income(V, id) {
    const out = {};
    for (const k of D.RES) out[k] = 0;
    for (const b of V.pub.builds) {
      if (b.owner !== id) continue;
      for (const h of V.B.corners[b.at].hexes) {
        const r = D.TERRAIN[V.pub.hexes[h].t].res;
        if (r) out[r] += hexPips(V, h) * (b.kind === 'city' ? 2 : 1);
      }
    }
    return out;
  }
  function cornerValue(V, c, weights) {
    let v = 0;
    const seen = {};
    for (const h of V.B.corners[c].hexes) {
      const x = V.pub.hexes[h];
      const r = D.TERRAIN[x.t].res;
      if (!r || !x.n) continue;
      const w = (weights && weights[r]) || 1;
      v += D.PIPS[x.n] * V.scarce[r] * w;
      /* A resource you do not make yet is worth more than a second helping. */
      if (!V.income[r] && !seen[r]) v += 1.6;
      seen[r] = true;
      if (V.pub.ck && D.TERRAIN[x.t].com) v += D.PIPS[x.n] * 0.25;
    }
    /* A harbour on the crossing. */
    for (const pt of V.pub.ports) {
      const e = V.B.edges[pt.edge];
      if (e.a !== c && e.b !== c) continue;
      if (pt.kind === 'any') v += 1.2;
      else v += 0.35 * (V.income[pt.kind] || 0) / 3 + 0.4;
    }
    return v;
  }
  function freeForSettlement(V, c) {
    if (V.build[c] || V.knight[c]) return false;
    return V.B.corners[c].adj.every(a => !V.build[a]);
  }
  function has(hand, cost) { for (const k in cost) if ((hand[k] || 0) < cost[k]) return false; return true; }
  function missing(hand, cost) { let n = 0; for (const k in cost) n += Math.max(0, cost[k] - (hand[k] || 0)); return n; }
  function total(hand) { return Object.keys(hand).reduce((s, k) => s + (hand[k] || 0), 0); }
  function vpLead(V) {
    const others = V.pub.players.filter(p => p.id !== V.my);
    return others.reduce((a, p) => (p.vp > a.vp ? p : a), others[0]);
  }

  /* ---------------- the build goal ----------------
     Not a fixed priority: every build worth having is scored by what it is
     worth over how far away it is — counting what the hand could trade into
     it at this player's own rates. A fixed "city first" had house players
     sitting on wood and brick for turns and losing them to the next 7. */
  /* The engine's own list of spots, when it has sent one. */
  const listed = V => V.me.can && (V.me.can.stage === 'main' || V.me.can.stage === 'special');
  function settleSpots(V) {
    if (listed(V)) return V.me.can.settlement;
    const out = [];
    for (const c of V.B.corners) {
      if (!freeForSettlement(V, c.id)) continue;
      if (c.edges.some(e => V.road[e] === V.my)) out.push(c.id);
    }
    return out;
  }
  function citySpots(V) {
    if (listed(V)) return V.me.can.city;
    return V.pub.builds.filter(b => b.owner === V.my && b.kind === 'settlement').map(b => b.at);
  }
  function reach(V, cost) {
    /* How many cards short, after trading the surplus at this player's rates. */
    const hand = V.me.hand, rates = (V.me.can && V.me.can.bank) || V.me.rates || {};
    const short = missing(hand, cost);
    if (!short) return 0;
    let spareTrades = 0;
    for (const k of Object.keys(hand)) {
      const r = rates[k] || 4;
      const extra = (hand[k] || 0) - (cost[k] || 0);
      if (extra >= r) spareTrades += Math.floor(extra / r);
    }
    return Math.max(0, short - spareTrades) + Math.min(short, spareTrades) * 0.35;
  }
  function goal(V) {
    const P = V.mine;
    if (V.pub.ck) {
      /* Barbarians near and my cities exposed: knights first. */
      const threat = V.pub.barb >= 4 && P.strength === 0 && V.pub.builds.some(b => b.owner === V.my && b.kind === 'city' && !b.metro);
      if (threat && P.kn[1] > 0 && (!V.me.can || V.me.can.knight.length)) return { what: 'knight', cost: D.COST.knight };
    }
    const cands = [];
    if (P.pieces.city > 0 && citySpots(V).length) cands.push({ what: 'city', cost: D.COST.city, value: 3.2 });
    if (P.pieces.settlement > 0 && settleSpots(V).length) cands.push({ what: 'settlement', cost: D.COST.settlement, value: 3.5 });
    else if (P.pieces.settlement > 0 && P.pieces.road > 0 && roadTarget(V)) cands.push({ what: 'road', cost: D.COST.road, value: 2.3 });
    if (!V.pub.ck && V.pub.devLeft > 0) cands.push({ what: 'dev', cost: D.COST.dev, value: 1.7 });
    if (V.pub.ck && V.pub.builds.some(b => b.owner === V.my && b.kind === 'city')) {
      const t = bestTrack(V, true);
      if (t) {
        const next = P.impr[t] + 1;
        cands.push({ what: 'improve', track: t, cost: { [D.TRACK[t].com]: next }, value: 2.2 + (next === 3 ? 1.2 : 0) + (next >= 4 ? 1.4 : 0) });
      }
    }
    if (!cands.length) return { what: V.pub.ck ? 'knight' : 'dev', cost: V.pub.ck ? D.COST.knight : D.COST.dev };
    let best = cands[0], bv = -1;
    for (const c of cands) {
      const s = c.value / (1 + 0.8 * reach(V, c.cost));
      if (s > bv) { bv = s; best = c; }
    }
    return best;
  }
  function bestTrack(V, any) {
    const me = V.me, P = V.mine;
    let best = null, bv = -1;
    for (const t of D.TRACKS) {
      const lvl = P.impr[t];
      if (lvl >= 5) continue;
      const com = D.TRACK[t].com;
      let v = (me.hand[com] || 0) - (lvl + 1) + 4;
      if (lvl + 1 === 3) v += 1.5;
      if (lvl + 1 >= 4) {
        const m = V.pub.metro[t];
        if (!m || (!m.perm && m.seat !== V.mine.i && lvl + 1 === 5)) v += 2; else if (m && m.seat !== V.mine.i) v -= 1.5;
      }
      if (v > bv) { bv = v; best = t; }
    }
    return any || bv > 3 ? best : null;
  }
  /* The best crossing a road or two away that a settlement could take. */
  function roadTarget(V) {
    const me = V.my;
    const mineRoad = e => V.road[e] === me;
    let best = null, bv = -1;
    /* Corners on my network (road ends not cut by an opponent). */
    const net = new Set();
    for (const r of V.pub.roads) if (r.owner === me) { const e = V.B.edges[r.at]; net.add(e.a); net.add(e.b); }
    for (const b of V.pub.builds) if (b.owner === me) net.add(b.at);
    for (const c of net) {
      const bb = V.build[c], kk = V.knight[c];
      if ((bb && bb.owner !== me) || (kk && kk.owner !== me)) continue;
      for (const e of V.B.corners[c].edges) {
        if (V.road[e] != null) continue;
        const d = V.B.other(e, c);
        const cand = [];
        if (freeForSettlement(V, d)) cand.push({ c: d, dist: 1, e });
        if (!V.build[d] && !(V.knight[d] && V.knight[d].owner !== me)) {
          for (const e2 of V.B.corners[d].edges) {
            if (e2 === e || V.road[e2] != null) continue;
            const f = V.B.other(e2, d);
            if (freeForSettlement(V, f)) cand.push({ c: f, dist: 2, e });
          }
        }
        for (const x of cand) {
          const v = cornerValue(V, x.c) - (x.dist - 1) * 1.5;
          if (v > bv) { bv = v; best = { corner: x.c, edge: x.e, value: v }; }
        }
      }
    }
    if (!best || bv < 2) return null;
    return mineRoad(best.edge) ? null : best;
  }

  /* ---------------- trades towards a goal ---------------- */
  function spare(V, hand, cost) {
    /* Cards beyond the goal, largest pile first. */
    return V.pub.ck ? D.RES.concat(D.COM).filter(k => (hand[k] || 0) > (cost[k] || 0)).sort((a, b) => (hand[b] - (cost[b] || 0)) - (hand[a] - (cost[a] || 0)))
      : D.RES.filter(k => (hand[k] || 0) > (cost[k] || 0)).sort((a, b) => (hand[b] - (cost[b] || 0)) - (hand[a] - (cost[a] || 0)));
  }
  function bankTrade(V, cost) {
    const me = V.me, hand = me.hand, rates = me.can.bank;
    const need = Object.keys(cost).filter(k => (hand[k] || 0) < cost[k] && V.pub.bank[k] > 0);
    if (!need.length) return null;
    /* Only when the surplus can actually close the gap (the goal within
       reach of this turn's trades), and never out of a card the goal needs. */
    const short = missing(hand, cost);
    let spareTrades = 0;
    for (const k of Object.keys(rates)) { const r = rates[k]; if (r) spareTrades += Math.max(0, Math.floor(((hand[k] || 0) - (cost[k] || 0)) / r)); }
    if (short > spareTrades + 1 || short > 3) return null;
    /* Give from the biggest spare pile, at the best rate; take what is shortest. */
    let give = null, gv = -1;
    for (const k of Object.keys(rates)) {
      const r = rates[k];
      if (!r) continue;
      const extra = (hand[k] || 0) - (cost[k] || 0);
      if (extra < r) continue;
      const v = extra / r + (4 - r);
      if (v > gv) { gv = v; give = k; }
    }
    if (!give) return null;
    const get = need.sort((a, b) => (cost[b] - (hand[b] || 0)) - (cost[a] - (hand[a] || 0)))[0];
    return get && get !== give ? { t: 'bank', give, get } : null;
  }

  /* ---------------- where to put the robber ---------------- */
  function robberHex(V, options) {
    let best = options[0], bv = -1e9;
    const lead = vpLead(V);
    for (const h of options) {
      let v = 0, mine = false, victims = 0;
      for (const c of V.B.hexes[h].corners) {
        const b = V.build[c];
        if (!b) continue;
        if (b.owner === V.my) { mine = true; continue; }
        const p = V.pl(b.owner);
        const pips = V.pub.hexes[h].n ? D.PIPS[V.pub.hexes[h].n] : 0;
        v += pips * (b.kind === 'city' ? 2 : 1) * (1 + p.vp / 6) + (p.cards > 0 ? 1.5 : 0);
        if (lead && p.id === lead.id) v += 2;
        victims++;
      }
      if (mine) v -= 12;
      if (!victims) v -= 3;
      if (v > bv) { bv = v; best = h; }
    }
    return best;
  }
  function richest(V, ids) {
    return ids.slice().sort((a, b) => {
      const pa = V.pl(a), pb = V.pl(b);
      return (pb.vp * 2 + pb.cards) - (pa.vp * 2 + pa.cards);
    })[0];
  }
  /* Keep the goal; throw the biggest piles away first. */
  function discardFor(V, need) {
    const hand = Object.assign({}, V.me.hand);
    const g = goal(V);
    const out = {};
    for (let n = 0; n < need; n++) {
      const ks = Object.keys(hand).filter(k => hand[k] > 0);
      ks.sort((a, b) => ((hand[b] - (g.cost[b] || 0)) - (hand[a] - (g.cost[a] || 0))));
      const k = ks[0];
      hand[k]--; out[k] = (out[k] || 0) + 1;
    }
    return out;
  }
  /* Give away what hurts least. */
  function giveFor(V, need, types) {
    const hand = {};
    for (const k of types || Object.keys(V.me.hand)) if (V.me.hand[k]) hand[k] = V.me.hand[k];
    const g = goal(V);
    const out = {};
    for (let n = 0; n < need; n++) {
      const ks = Object.keys(hand).filter(k => hand[k] > 0);
      if (!ks.length) break;
      ks.sort((a, b) => ((hand[b] - (g.cost[b] || 0)) - (hand[a] - (g.cost[a] || 0))));
      hand[ks[0]]--; out[ks[0]] = (out[ks[0]] || 0) + 1;
    }
    return out;
  }
  /* What the other players are probably holding, from the bank alone — five
     or six players play with a bigger bank. */
  function heldElsewhere(V, k) {
    const S = V.pub.supply || { res: D.BANK, com: D.COMMODITIES };
    const totalN = D.RES.indexOf(k) >= 0 ? S.res : S.com;
    return totalN - V.pub.bank[k] - (V.me.hand[k] || 0);
  }

  /* ================================================================ */
  function answer(pub, me, pr, ctx) {
    ctx = ctx || {};
    const V = view(pub, me);
    const M = mem(pub, me);
    switch (pr.t) {
      case 'place': {
        let best = pr.options[0], bv = -1;
        const w = pr.kind === 'city' && pub.ck ? { ore: 1.15, wheat: 1.1, wood: 1.05, wool: 1.05 } : null;
        for (const c of pr.options) { const v = cornerValue(V, c, w); if (v > bv) { bv = v; best = c; } }
        return { t: 'place', at: best };
      }
      case 'setupRoad': case 'freeRoad': {
        if (pr.t === 'freeRoad' && !pr.options.length) return { t: 'skip' };
        const tgt = roadTarget(V);
        if (tgt && pr.options.indexOf(tgt.edge) >= 0) return { t: 'road', at: tgt.edge };
        /* Head for the best open ground from the road's far end. */
        let best = pr.options[0], bv = -1;
        for (const e of pr.options) {
          const E = V.B.edges[e];
          let v = 0;
          for (const c of [E.a, E.b]) {
            if (freeForSettlement(V, c)) v = Math.max(v, cornerValue(V, c) * 0.6);
            for (const d of V.B.corners[c].adj) if (freeForSettlement(V, d)) v = Math.max(v, cornerValue(V, d));
          }
          if (v > bv) { bv = v; best = e; }
        }
        return { t: 'road', at: best };
      }
      case 'turn': return turn(V, M, ctx);
      case 'special': return special(V, M);
      case 'discard': return { t: 'discard', cards: discardFor(V, pr.need) };
      case 'robber': return { t: 'robber', hex: robberHex(V, pr.options) };
      case 'steal': return { t: 'steal', from: richest(V, pr.options) };
      case 'plenty': {
        const g = goal(V);
        const want = [];
        for (const k in g.cost) for (let n = (me.hand[k] || 0); n < g.cost[k]; n++) want.push(k);
        const list = want.filter(k => pr.options.indexOf(k) >= 0).concat(['ore', 'wheat', 'brick', 'wood', 'wool'].filter(k => pr.options.indexOf(k) >= 0));
        return { t: 'pick', res: [list[0], list[1] || list[0]] };
      }
      case 'monopoly': {
        const best = D.RES.slice().sort((a, b) => heldElsewhere(V, b) - heldElsewhere(V, a))[0];
        return { t: 'pick', res: best };
      }
      case 'aqueduct': {
        /* The bank as it is NOW — other players are choosing from it too. */
        const g = goal(V);
        const left = D.RES.filter(k => pub.bank[k] > 0);
        const need = left.filter(k => (me.hand[k] || 0) < (g.cost[k] || 0));
        return { t: 'pick', res: need[0] || left.sort((a, b) => pub.bank[a] - pub.bank[b])[0] || 'ore' };
      }
      case 'bounce': case 'metroCity': case 'wallAt': case 'medicine': {
        let best = pr.options[0], bv = -1;
        for (const c of pr.options) { const v = cornerValue(V, c); if (v > bv) { bv = v; best = c; } }
        return { t: 'x', at: best };
      }
      case 'pillage': {
        let best = pr.options[0], bv = 1e9;
        for (const c of pr.options) { const v = cornerValue(V, c) - (V.build[c] && V.build[c].wall ? 3 : 0); if (v < bv) { bv = v; best = c; } }
        return { t: 'x', at: best };
      }
      case 'defDeck': {
        const pref = ['science', 'politics', 'trade'].filter(t => pr.options.indexOf(t) >= 0);
        return { t: 'deck', deck: pref[0] };
      }
      case 'progDiscard': {
        const order = me.prog.slice().sort((a, b) => progWorth(V, a) - progWorth(V, b));
        return { t: 'discard', cards: order.slice(0, pr.need) };
      }
      case 'alchemy': {
        let best = [3, 5], bv = -1;
        for (let y = 1; y <= 6; y++) for (let r = 1; r <= 6; r++) {
          if (y + r === 7) continue;
          const v = rollValue(V, y + r);
          if (v > bv) { bv = v; best = [y, r]; }
        }
        return { t: 'dice', y: best[0], r: best[1] };
      }
      case 'crane': return { t: 'track', track: pr.options.indexOf(bestTrack(V, true)) >= 0 ? bestTrack(V, true) : pr.options[0] };
      case 'invention': return inventionSwap(V, pr.options);
      case 'smith': {
        if (!pr.options.length) return { t: 'skip' };
        const ks = pr.options.map(id => pub.knights.find(k => k.id === id)).filter(Boolean).sort((a, b) => b.level - a.level);
        return { t: 'knight', knight: (ks[0] || { id: pr.options[0] }).id };
      }
      case 'harborOffer': {
        const g = goal(V);
        const sp = pr.options.filter(k => (me.hand[k] || 0) > (g.cost[k] || 0));
        return sp.length ? { t: 'give', res: sp.sort((a, b) => me.hand[b] - me.hand[a])[0] } : { t: 'skip' };
      }
      case 'harborReply': {
        const cards = giveFor(V, 1, pr.options);
        return { t: 'give', com: Object.keys(cards)[0] || pr.options[0] };
      }
      case 'duesWho': case 'spyWho': case 'treasonWho': {
        const pick = pr.t === 'spyWho'
          ? pr.options.slice().sort((a, b) => V.pl(b).prog - V.pl(a).prog)[0]
          : pr.t === 'treasonWho'
            ? pr.options.slice().sort((a, b) => V.pl(b).strength - V.pl(a).strength)[0]
            : richest(V, pr.options);
        return { t: 'who', who: pick };
      }
      case 'duesTake': {
        const g = goal(V);
        const hand = Object.assign({}, pr.hand), out = {};
        for (let n = 0; n < pr.need; n++) {
          const ks = Object.keys(hand).filter(k => hand[k] > 0);
          ks.sort((a, b) => ((g.cost[b] || 0) - (me.hand[b] || 0)) - ((g.cost[a] || 0) - (me.hand[a] || 0)) || (hand[b] - hand[a]));
          hand[ks[0]]--; out[ks[0]] = (out[ks[0]] || 0) + 1;
        }
        return { t: 'take', cards: out };
      }
      case 'spyTake': {
        const best = pr.cards.slice().sort((a, b) => progWorth(V, b) - progWorth(V, a))[0];
        return best ? { t: 'take', card: best } : { t: 'skip' };
      }
      case 'merchant': {
        let best = pr.options[0], bv = -1;
        for (const h of pr.options) {
          const x = pub.hexes[h], r = D.TERRAIN[x.t].res;
          const v = (r ? (V.income[r] || 0) + (x.n ? D.PIPS[x.n] : 0) : -5);
          if (v > bv) { bv = v; best = h; }
        }
        return { t: 'hex', hex: best };
      }
      case 'fleet': {
        const g = goal(V);
        const best = pr.options.slice().sort((a, b) => ((me.hand[b] || 0) - (g.cost[b] || 0)) - ((me.hand[a] || 0) - (g.cost[a] || 0)))[0];
        return { t: 'pick', type: best };
      }
      case 'resmono': case 'trademono': {
        const best = pr.options.slice().sort((a, b) => heldElsewhere(V, b) - heldElsewhere(V, a))[0];
        return { t: 'pick', type: best };
      }
      case 'diplomacy': {
        /* An opponent's loose road, the longest-road holder's first. */
        const hold = pub.longest && pub.longest.seat;
        const theirs = pr.options.filter(e => V.road[e] !== V.my);
        const pick = theirs.find(e => V.road[e] === hold) || theirs[0] || pr.options[0];
        return { t: 'road', at: pick };
      }
      case 'intrigue': case 'treasonGive': {
        const ks = pr.options.map(id => pub.knights.find(k => k.id === id) || { id, level: 0 });
        ks.sort((a, b) => (pr.t === 'treasonGive' ? a.level - b.level : b.level - a.level));
        return { t: 'knight', knight: ks[0].id };
      }
      case 'treasonPlace': {
        let best = pr.options[0], bv = -1;
        for (const c of pr.options) { const v = cornerValue(V, c); if (v > bv) { bv = v; best = c; } }
        return { t: 'place', at: best, level: Math.max.apply(null, pr.levels) };
      }
      case 'weddingGive': return { t: 'give', cards: giveFor(V, pr.need) };
    }
    return { t: 'skip' };
  }

  function rollValue(V, sum) {
    let v = 0;
    V.pub.hexes.forEach((h, id) => {
      if (h.n !== sum || id === V.pub.robber) return;
      for (const c of V.B.hexes[id].corners) {
        const b = V.build[c];
        if (!b) continue;
        const n = b.kind === 'city' ? 2 : 1;
        v += b.owner === V.my ? n : -0.3 * n;
      }
    });
    return v;
  }
  function inventionSwap(V, options) {
    let best = null, bv = 0;
    const myPips = h => V.B.hexes[h].corners.reduce((s, c) => { const b = V.build[c]; return s + (b ? (b.owner === V.my ? 1 : -0.4) * (b.kind === 'city' ? 2 : 1) : 0); }, 0);
    for (const a of options) for (const b of options) {
      if (a >= b) continue;
      const na = D.PIPS[V.pub.hexes[a].n], nb = D.PIPS[V.pub.hexes[b].n];
      const gain = (nb - na) * myPips(a) + (na - nb) * myPips(b);
      if (gain > bv) { bv = gain; best = [a, b]; }
    }
    if (!best) best = [options[0], options[1]];
    return { t: 'swap', a: best[0], b: best[1] };
  }
  /* How much a progress card is worth holding. */
  function progWorth(V, key) {
    const W = { alchemy: 6, merchant: 7, crane: 5, resmono: 6, wedding: 6, dues: 5, medicine: 5, encouragement: 4, smithing: 4,
      irrigation: 5, mining: 5, roads: 4, engineering: 4, invention: 3, fleet: 3, trademono: 4, harbor: 3, espionage: 3,
      intrigue: 2, taxation: 3, treason: 3, diplomacy: 2, sabotage: 4 };
    return W[key] || 3;
  }

  /* ---------------- a turn, one action at a time ---------------- */
  function turn(V, M, ctx) {
    const pub = V.pub, me = V.me, can = me.can, P = V.mine;
    M.moves++;
    if (M.moves > 60) return can.stage === 'roll' ? { t: 'roll' } : { t: 'end' };
    if (can.stage === 'roll') {
      if (!pub.ck) {
        /* A knight before the roll when the robber sits on our own ground. */
        if (can.play.knight === null && robberOnMe(V)) return { t: 'play', card: 'knight' };
      } else if (can.play.alchemy === null) {
        let best = 0;
        for (let s = 2; s <= 12; s++) if (s !== 7) best = Math.max(best, rollValue(V, s));
        if (best >= 3) return { t: 'play', card: 'alchemy' };
      }
      return { t: 'roll' };
    }
    /* Deals in flight come first. */
    const mine = pub.offers.find(o => o.by === me.id && !o.counter);
    if (mine) {
      const yes = Object.keys(mine.replies).filter(id => mine.replies[id]);
      if (yes.length) return { t: 'deal', offer: mine.id, with: yes.sort((a, b) => V.pl(a).vp - V.pl(b).vp)[0] };
      const asked = (mine.to || pub.players.filter(p => p.id !== me.id).map(p => p.id));
      const all = asked.every(id => id in mine.replies);
      if (all || ctx.waited) return { t: 'withdraw', offer: mine.id };
      return { t: 'wait' };
    }
    /* A counter-offer that moves the goal along is taken. */
    const g = goal(V);
    for (const o of pub.offers.filter(x => x.counter)) {
      if (!has(me.hand, o.get)) continue;
      const after = Object.assign({}, me.hand);
      for (const k in o.get) after[k] -= o.get[k];
      for (const k in o.give) after[k] = (after[k] || 0) + o.give[k];
      const lead = V.pl(o.by);
      if (missing(after, g.cost) < missing(me.hand, g.cost) && lead.vp < pub.target - 2) return { t: 'deal', offer: o.id };
    }

    const A = can.afford;
    /* Progress / development cards worth playing now. */
    const card = cardToPlay(V, g);
    if (card) return { t: 'play', card };

    /* Knights: chase the robber off our land; defend when the ship is close. */
    if (pub.ck) {
      for (const id of can.chase) if (robberOnMe(V)) return { t: 'chase', knight: id };
      if (pub.barb >= 4 && A.activate && can.activate.length && (me.hand.wheat || 0) >= 1) {
        const exposed = pub.builds.some(b => b.owner === me.id && b.kind === 'city' && !b.metro);
        const def = pub.players.reduce((s, p) => s + p.strength, 0);
        if (exposed && (def < pub.barbStrength || P.strength <= Math.min.apply(null, pub.players.map(p => p.strength))))
          return { t: 'activate', knight: can.activate[0] };
      }
    }

    /* Build towards the goal, in the goal's order of worth. */
    if (A.city && can.city.length) return { t: 'build', what: 'city', at: bestCorner(V, can.city) };
    if (A.settlement && can.settlement.length) return { t: 'build', what: 'settlement', at: bestCorner(V, can.settlement) };
    if (pub.ck) {
      for (const t of D.TRACKS) {
        const im = can.improve[t];
        if (!im.why && (me.hand[im.com] || 0) >= im.cost && (g.what !== 'city' || im.com !== 'coin' || true)) {
          if (g.what === 'improve' && g.track === t) return { t: 'improve', track: t };
          if (im.level <= 3 || bestTrack(V, false) === t) return { t: 'improve', track: t };
        }
      }
      if (A.knight && can.knight.length && P.kn[1] > 0) {
        const myKnights = pub.knights.filter(k => k.owner === me.id).length;
        if (g.what === 'knight' || (myKnights < 2 && pub.barb >= 2) || (myKnights < 1)) return { t: 'build', what: 'knight', at: bestKnightSpot(V, can.knight) };
      }
      if (A.promote && can.promote.length && pub.barb >= 3 && (me.hand.wool || 0) + (me.hand.ore || 0) >= 4) return { t: 'promote', knight: can.promote[0] };
      if (A.wall && can.wall.length && total(me.hand) >= 6 && (me.hand.brick || 0) >= 3) return { t: 'build', what: 'wall', at: can.wall[0] };
    }
    if (g.what === 'road' && A.road) {
      const tgt = roadTarget(V);
      if (tgt && can.road.indexOf(tgt.edge) >= 0) return { t: 'build', what: 'road', at: tgt.edge };
    }
    /* Long road race: a spare road when it would take or keep the card. */
    if (A.road && can.road.length && g.what !== 'city' && total(me.hand) > 5) {
      const tgt = roadTarget(V);
      if (tgt && can.road.indexOf(tgt.edge) >= 0) return { t: 'build', what: 'road', at: tgt.edge };
    }
    if (!pub.ck && A.dev && can.buy) {
      /* A card when it is the goal — or when the hand is fat and buying one
         costs the goal nothing. */
      const after = Object.assign({}, me.hand);
      for (const k in D.COST.dev) after[k] -= D.COST.dev[k];
      if (g.what === 'dev' || (total(me.hand) >= 6 && missing(after, g.cost) <= missing(me.hand, g.cost))) return { t: 'buy' };
    }

    /* Trade towards the goal: the bank if it closes it, else ask the table once. */
    if (M.bank < 4) {
      const bt = bankTrade(V, g.cost);
      if (bt) { M.bank++; return bt; }
    }
    /* (Not on a paired turn: that is the bank or nothing.) */
    if (can.trade !== false && !M.offered && missing(me.hand, g.cost) === 1 && pub.players.length > 1) {
      const need = Object.keys(g.cost).find(k => (me.hand[k] || 0) < g.cost[k]);
      const sp = spare(V, me.hand, g.cost).filter(k => D.RES.indexOf(k) >= 0 || pub.ck);
      if (need && sp.length) {
        M.offered = 1;
        return { t: 'offer', give: { [sp[0]]: 1 }, get: { [need]: 1 } };
      }
    }
    /* Seven in hand is asking for the robber: spend down. */
    if (total(me.hand) > P.limit) {
      if (A.road && can.road.length) {
        const tgt = roadTarget(V);
        return { t: 'build', what: 'road', at: tgt && can.road.indexOf(tgt.edge) >= 0 ? tgt.edge : can.road[0] };
      }
      if (!pub.ck && A.dev && can.buy) return { t: 'buy' };
      if (M.bank < 5) {
        const sp = spare(V, me.hand, g.cost);
        for (const k of sp) {
          const r = can.bank[k];
          if (r && me.hand[k] >= r) {
            const get = Object.keys(g.cost).find(x => (me.hand[x] || 0) < g.cost[x] && pub.bank[x] > 0) || D.RES.find(x => x !== k && pub.bank[x] > 0);
            if (get && get !== k) { M.bank++; return { t: 'bank', give: k, get }; }
          }
        }
      }
    }
    return { t: 'end' };
  }
  /* The special building phase: build what the goal says with what is in the
     hand — there is nobody to trade with — then be done. */
  function special(V, M) {
    const pub = V.pub, me = V.me, can = me.can, P = V.mine;
    M.moves++;
    if (!can || M.moves > 30) return { t: 'done' };
    const A = can.afford;
    if (A.city && can.city.length) return { t: 'build', what: 'city', at: bestCorner(V, can.city) };
    if (A.settlement && can.settlement.length) return { t: 'build', what: 'settlement', at: bestCorner(V, can.settlement) };
    const g = goal(V);
    if (pub.ck) {
      for (const t of D.TRACKS) {
        const im = can.improve[t];
        if (!im.why && ((g.what === 'improve' && g.track === t) || im.level <= 3)) return { t: 'improve', track: t };
      }
      const mineK = pub.knights.filter(k => k.owner === me.id).length;
      if (A.knight && can.knight.length && P.kn[1] > 0 && (g.what === 'knight' || mineK < 1)) return { t: 'build', what: 'knight', at: bestKnightSpot(V, can.knight) };
      if (pub.barb >= 4 && A.activate && can.activate.length) return { t: 'activate', knight: can.activate[0] };
    }
    if (g.what === 'road' && A.road) {
      const tgt = roadTarget(V);
      if (tgt && can.road.indexOf(tgt.edge) >= 0) return { t: 'build', what: 'road', at: tgt.edge };
    }
    if (!pub.ck && A.dev && can.buy && g.what === 'dev') return { t: 'buy' };
    /* A fat hand is the robber's: spend it down while nobody can stop you. */
    if (total(me.hand) > P.limit) {
      if (!pub.ck && A.dev && can.buy) return { t: 'buy' };
      if (A.road && can.road.length) {
        const tgt = roadTarget(V);
        return { t: 'build', what: 'road', at: tgt && can.road.indexOf(tgt.edge) >= 0 ? tgt.edge : can.road[0] };
      }
    }
    return { t: 'done' };
  }
  function robberOnMe(V) {
    const h = V.pub.robber;
    if (h == null) return false;
    return V.B.hexes[h].corners.some(c => V.build[c] && V.build[c].owner === V.my);
  }
  function bestCorner(V, list) {
    let best = list[0], bv = -1;
    for (const c of list) { const v = cornerValue(V, c); if (v > bv) { bv = v; best = c; } }
    return best;
  }
  function bestKnightSpot(V, list) {
    /* Beside the robber's hex if it is on us; else guarding a good open crossing. */
    let best = list[0], bv = -1e9;
    for (const c of list) {
      let v = 0;
      if (V.pub.robber != null && V.B.hexes[V.pub.robber].corners.indexOf(c) >= 0) v += 3;
      if (freeForSettlement(V, c)) v -= 2;
      v += V.B.corners[c].adj.filter(a => freeForSettlement(V, a)).length * 0.5;
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }
  function cardToPlay(V, g) {
    const pub = V.pub, me = V.me, can = me.can, P = V.mine;
    const ok = k => can.play[k] === null;
    if (!pub.ck) {
      if (ok('knight') && (robberOnMe(V) || (P.knightsPlayed >= 2 && (!pub.largest || pub.largest.seat !== me.id)))) return 'knight';
      if (ok('roads') && P.pieces.road >= 2 && roadTarget(V)) return 'roads';
      if (ok('plenty') && missing(me.hand, g.cost) >= 1 && missing(me.hand, g.cost) <= 2) return 'plenty';
      if (ok('monopoly') && D.RES.some(k => heldElsewhere(V, k) >= 4)) return 'monopoly';
      return null;
    }
    const lead = vpLead(V);
    const mineVP = P.vp;
    for (const k of me.prog) {
      if (!ok(k)) continue;
      switch (k) {
        case 'merchant': case 'wedding': if (k === 'merchant' || pub.players.some(p => p.id !== me.id && p.vp > mineVP)) return k; break;
        case 'dues': if (pub.players.some(p => p.id !== me.id && p.vp > mineVP && p.cards >= 2)) return k; break;
        case 'irrigation': case 'mining': {
          const terr = k === 'irrigation' ? 'fields' : 'mountains';
          const n = new Set();
          for (const b of pub.builds) if (b.owner === me.id) for (const h of V.B.corners[b.at].hexes) if (pub.hexes[h].t === terr) n.add(h);
          if (n.size) return k;
          break;
        }
        case 'resmono': if (D.RES.some(x => heldElsewhere(V, x) >= 3)) return k; break;
        case 'trademono': if (D.COM.some(x => heldElsewhere(V, x) >= 2)) return k; break;
        case 'crane': if (D.TRACKS.some(t => can.improve[t] && can.improve[t].cost - 1 <= (me.hand[can.improve[t].com] || 0) && can.improve[t].level <= 5 && P.impr[t] < 5)) return k; break;
        case 'medicine': if (can.city.length && (me.hand.ore || 0) >= 2 && (me.hand.wheat || 0) >= 1) return k; break;
        case 'engineering': if (can.wall.length) return k; break;
        case 'roads': if (P.pieces.road >= 1 && roadTarget(V)) return k; break;
        case 'smithing': if (can.promote.length) return k; break;
        case 'encouragement': if (pub.barb >= 4 && can.activate.length >= 2) return k; break;
        case 'fleet': if (Object.keys(me.hand).some(x => (me.hand[x] || 0) - (g.cost[x] || 0) >= 4)) return k; break;
        case 'harbor': if (D.RES.some(x => (me.hand[x] || 0) > (g.cost[x] || 0))) return k; break;
        case 'espionage': if (pub.players.some(p => p.id !== me.id && p.prog >= 2)) return k; break;
        case 'taxation': if (pub.robber != null) return k; break;
        case 'treason': if (pub.players.some(p => p.id !== me.id && p.strength + pub.knights.filter(x => x.owner === p.id).length >= 2)) return k; break;
        case 'intrigue': if (pub.knights.some(x => x.owner !== me.id && pub.roads.some(r => r.owner === me.id && (V.B.edges[r.at].a === x.at || V.B.edges[r.at].b === x.at)))) return k; break;
        case 'sabotage': if (lead && lead.vp >= mineVP && lead.cards >= 6) return k; break;
        case 'diplomacy': if (pub.longest && pub.longest.seat !== me.id) return k; break;
        case 'invention': return k;
      }
    }
    /* Over the limit on our own turn: play the least useful rather than lose it. */
    if (me.prog.length > D.PROGRESS_LIMIT) {
      const playable = me.prog.filter(ok).sort((a, b) => progWorth(V, a) - progWorth(V, b));
      if (playable.length) return playable[0];
    }
    return null;
  }

  /* ---------------- someone else's offer ---------------- */
  function reply(pub, me, o) {
    const V = view(pub, me);
    const t = { t: 'reply', offer: o.id, yes: false };
    if (!has(me.hand, o.get)) return t;
    const them = V.pl(o.by);
    if (them && them.vp >= pub.target - 2) return t;
    const g = goal(V);
    const after = Object.assign({}, me.hand);
    for (const k in o.get) after[k] -= o.get[k];
    for (const k in o.give) after[k] = (after[k] || 0) + o.give[k];
    const before = missing(me.hand, g.cost), now = missing(after, g.cost);
    const fair = sum(o.give) >= sum(o.get);
    t.yes = now < before || (now === before && fair && sum(o.give) > sum(o.get));
    return t;
  }
  function sum(o) { return Object.keys(o || {}).reduce((s, k) => s + (o[k] || 0), 0); }

  const B = { answer, reply, goal: (pub, me) => goal(view(pub, me)) };
  if (typeof module === 'object' && module.exports) module.exports = B;
  else root.CatanBots = B;
})(typeof window !== 'undefined' ? window : globalThis);
