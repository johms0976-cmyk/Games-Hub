'use strict';
/* Gwent — the house. Decides from (publicView, seatView) and nothing else:
   it never sees your hand or your deck. No reaches into the Game;
   tests/engine.js greps this file for them.

   One brain, three levels (LESSONS-CHECKLIST G1). Gwent is won on cards,
   not points: a round is two of three, so the brain values every play as
   what it does to the two totals NOW (the engine's own preview, `delta`)
   less what the card would have been worth later, and it values passing by
   the round's situation — gems, hands, the lead, whether the other side has
   passed. Medium and Easy are the same brain made sloppier (noise, slips);
   Easy also loses the plan: it does not count cards, so it neither saves
   its heroes for the last round nor passes to make the other side spend. */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gw-data.js') : root.GwentData;
  const VERSION = 1;
  /* What a card in hand is worth, in points of strength, for the round(s)
     still to come. One number in one place; everything else falls out of it. */
  const CARD = 6;
  const BASE = { noise: 0, slip: 0, plan: true, look: false, cost: 0.45, r1lead: 0, r1big: 14, dry: 25, mustLead: 12, theyMustPass: 'lead', spy: 2,
    k: 0.7, k3: 0.85, gem: 0.85, avg: 7, floor: 0, giveUp: 2, top: 8, cheap: true, leaderFirst: true, stall: 8, spySwap: true };
  const LEVEL = {
    hard: Object.assign({}, BASE, { noise: 0.06, look: true }),
    medium: Object.assign({}, BASE, { noise: 0.3, slip: 0.1 }),
    easy: Object.assign({}, BASE, { noise: 0.7, slip: 0.25, plan: false, spy: 0.5, cheap: false, leaderFirst: false, stall: 0, spySwap: false })
  };
  /* floor: a play must be worth more than this now, or it is never made (0:
     no Scorch on your own best, no Clear for the other side, no spy into an
     empty deck). giveUp: with the other side passed, pass when even this many
     times the best each card can add would not catch them (sums of single
     cards miss combos — a Horn after units, bonded pairs — hence 2, not 1).
     Measured 2026-10-18 against the brain without them, same level: about
     even between two houses — the plays they stop are the ones a person
     punishes and a house does not.
     cheap, leaderFirst, stall, spySwap, top: how the house picks its card once it has
     decided to play (2026-10-18, below `cheapest`). Easy keeps the old way —
     its strongest card first. */
  /* Tuning: GW_HARD='{"cost":0.6}' overrides the Hard brain in a test run. */
  if (typeof process !== 'undefined' && process.env && process.env.GW_HARD) Object.assign(LEVEL.hard, JSON.parse(process.env.GW_HARD));
  if (typeof process !== 'undefined' && process.env && process.env.GW_MED) Object.assign(LEVEL.medium, JSON.parse(process.env.GW_MED));

  /* Noise is a hash of what is being decided — never Math.random — so seeded
     games, holds and undo-by-replay all stay reproducible. */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

  function ctx(pub, me) {
    const mine = pub.players.find(p => p.id === me.id);
    const them = pub.players.find(p => p.id !== me.id);
    const lv = LEVEL[mine.level] || LEVEL.medium;
    const si = pub.players.indexOf(mine);
    const b = pub.board;
    return { pub, me, mine, them, lv, si, b, my: b.sides[si].total, their: b.sides[1 - si].total, key: me.id + '|' + pub.round + '|' + pub.logN };
  }
  function noisy(C, key, v) {
    if (!C.lv.noise) return v;
    const r = hash(C.me.id + '|' + key) * 2 - 1;
    return v + r * C.lv.noise * Math.max(4, Math.abs(v));
  }

  /* A spy is worth the cards it draws — and it draws only what is left in
     the deck (2026-10-18: the house played spies, and fetched them back with
     Decoys and medics, into an empty deck, which only fed the other side). */
  const spyCards = C => Math.max(0, Math.min(C.mine.deckN == null ? 2 : C.mine.deckN, 2 + ((C.mine.mods && C.mine.mods.spyDraw) || 0)));
  const spyBonus = C => C.lv.spy * CARD * spyCards(C) / 2;
  /* A unit brought back from a discard pile (a medic, a leader): a spy only
     if it would draw, otherwise it is strength handed to the other side. */
  const backValue = (C, c) => c.ab === 'spy' ? (spyCards(C) ? 6 * spyCards(C) : -c.str) : c.ab === 'medic' ? c.str + 6 : c.str + (c.ab === 'muster' ? 2 : 0);
  /* How much a card is worth KEEPING — what it would do in a later round. */
  function keepValue(C, id) {
    const c = D.card(id);
    if (!c) return CARD;
    if (c.kind === 'special') {
      if (c.sp === 'decoy') return 5;
      if (c.sp === 'scorch') return 7;
      if (c.sp === 'horn') return 7;
      if (c.sp === 'mardroeme') return berserkers(C) ? 7 : 2;
      return 4;
    }
    let v = c.str * 0.75;
    if (c.ab === 'spy') v = 4.5 * spyCards(C);
    if (c.ab === 'medic') v += 5;
    if (c.ab === 'muster' || c.ab === 'summon') v += 4;
    if (c.ab === 'berserk') v = (D.card(c.into).str * 0.75) * (mardroemes(C) ? 0.8 : 0.35) + 1;
    if (c.ab === 'avenger') v = D.card(c.avenger).str * 0.6;
    if (c.ab === 'mardroeme') v += berserkers(C) ? 3 : 0;
    if (c.hero) v += 2;
    return Math.max(2, v);
  }
  /* Skellige: what the house can see of its own Berserkers and Mardroemes
     (its hand, its deck list, its board). */
  const mine = (C, f) => C.me.hand.filter(x => f(D.card(x.id))).length + Object.keys(C.me.deckLeft || {}).filter(id => f(D.card(id))).reduce((t, id) => t + C.me.deckLeft[id], 0);
  const berserkers = C => mine(C, c => c && c.ab === 'berserk') + C.b.sides[C.si].rows.reduce((t, r) => t + r.units.filter(u => D.card(u.id) && D.card(u.id).ab === 'berserk').length, 0);
  const mardroemes = C => mine(C, c => c && (c.sp === 'mardroeme' || c.ab === 'mardroeme'));
  /* The best unit in a discard pile, as a medic or a leader would take it. */
  function discardBest(C, list, unitsOnly) {
    let best = null, bv = -1;
    for (const x of list) {
      const c = D.card(x.id);
      if (!c) continue;
      if (unitsOnly && (c.kind !== 'unit' || c.hero)) continue;
      const v = c.kind === 'unit' ? backValue(C, c) : keepValue(C, x.id);
      if (v > bv) { bv = v; best = x; }
    }
    return { best, v: Math.max(0, bv) };
  }

  /* ================================================================
     The turn
     ================================================================ */
  function playValue(C, h, pl) {
    const c = D.card(h.card);
    const d = pl.delta || { me: 0, them: 0 };
    let v = d.me - d.them;
    if (c.ab === 'spy') v += spyBonus(C);                      // two cards for one — if the deck has them
    if (c.ab === 'medic') v += discardBest(C, C.pub.players[C.si].disc, true).v * 0.9;
    if (c.kind === 'special' && c.weather && c.rows.every(r => C.pub.board.wx[r])) v -= 20;
    if (c.ab === 'avenger') v += D.card(c.avenger).str * 0.6;      // Kambi: Hemdall to come
    /* (A Berserker no longer waits for a Mardroeme: playing it now measured
       +7 to +12 points a move against waiting, 2026-10-18.) */
    if (c.sp === 'clear' && !C.pub.board.wx.some(Boolean)) v -= 20;
    if (c.sp === 'decoy') {
      const t = D.card(pl.card);
      /* Take back a spy (worth it only with a deck to draw from) or a medic (only with someone to revive). */
      v += t && t.ab === 'spy' ? (spyCards(C) ? spyBonus(C) + 2 : 0) : t && t.ab === 'medic' ? Math.min(5, discardBest(C, C.pub.players[C.si].disc, true).v * 0.5) : -2;
    }
    return v;
  }
  function leaderValue(C, L) {
    const ab = D.LEADER[L.id].ab;
    const d = L.delta;
    if (d) return d.me - d.them;
    if (ab === 'swap21') return 3;
    if (ab === 'peek3') return 1.5;
    if (ab === 'restoreHand') return discardBest(C, C.pub.players[C.si].disc, false).v * 0.8 - 1;
    if (ab === 'stealDiscard') return discardBest(C, C.pub.players[1 - C.si].disc, false).v * 0.8;
    if (ab === 'anyWeather') return weatherGain(C);
    if (ab === 'shuffleBack') {
      /* Crach an Craite: worth it when my pile is richer than theirs and the hand is running low. */
      const worth = q => C.pub.players[q].disc.reduce((t, x) => { const c = D.card(x.id); return t + (c && c.kind === 'unit' && !c.token ? c.str : 2); }, 0);
      return (worth(C.si) - worth(1 - C.si)) * 0.15 - C.me.hand.length * 0.6;
    }
    return 0;
  }
  /* The best weather against the other side, worked out from the board. */
  function weatherGain(C) {
    let best = 0;
    for (let r = 0; r < 3; r++) {
      if (C.b.wx[r]) continue;
      const loss = s => C.b.sides[s].rows[r].units.reduce((t, u) => { const c = D.card(u.id); return t + (c && !c.hero ? Math.max(0, u.v - Math.min(1, c.str)) : 0); }, 0);
      best = Math.max(best, loss(1 - C.si) - loss(C.si));
    }
    return best;
  }

  /* Should the house pass now? From the round's situation alone. */
  function wantPass(C, can, bestGain) {
    const lead = C.my - C.their;
    const myHand = C.me.hand.length, theirHand = C.them.handN;
    const mustWin = C.mine.gems === 1;
    const theyMust = C.them.gems === 1;
    if (C.them.passed) {
      if (lead > 0) return true;                               // already winning it
      const need = -lead + 1;
      const reach = topGains(C, can, mustWin ? 10 : 3);
      let sum = 0, k = 0;
      for (const g of reach) { sum += g; k++; if (sum >= need) break; }
      /* Out of reach even with every card: playing on only spends them. (A
         spy that draws might find the difference, so it keeps the hope.) */
      const drawing = spyCards(C) && can.hand.some(h => D.card(h.card).ab === 'spy');
      if (C.lv.giveUp && sum * C.lv.giveUp < need && !drawing) return true;
      if (mustWin) return false;                              // losing it loses the game
      /* Not fatal: win it only if it is cheap. */
      if (sum < need) return true;
      if (C.lv.look) return afterRound(C, true, myHand - k, theirHand) <= afterRound(C, false, myHand, theirHand);
      return C.lv.plan ? (k > 1 && myHand - k < theirHand) : false;
    }
    if (!myHand && !(can.leader && can.leader.ok)) return true;
    if (!C.lv.plan) return lead > 8 || bestGain <= 0;           // Easy: ahead is enough
    if (mustWin) return false;                                  // the last round: everything in
    if (theyMust) {
      /* I can afford this round: make them spend, keep my cards for the last. */
      if (lead > 0) return true;
      if (C.lv.theyMustPass === 'always') return myHand >= theirHand;
      return -lead > C.lv.mustLead && myHand <= theirHand + 1;
    }
    /* Round one, two gems each: win it with fewer cards, or let it go cheaply. */
    if (lead > C.lv.r1lead && myHand >= theirHand) return true;
    if (lead > C.lv.r1big && myHand >= theirHand - 1) return true;
    if (-lead > C.lv.dry && myHand < theirHand) return true;    // a dry pass: they spent a lot
    return false;
  }
  /* ================================================================
     Hard's look-ahead: the chance of winning the GAME from the start of the
     next round, given gems and cards in hand, and a two-step look at the
     round in hand — pass now, or play one card, let them answer, then pass.
     ================================================================ */
  const sig = x => 1 / (1 + Math.exp(-x));
  function pGame(C, gm, gt, cm, ct) {
    if (gm <= 0 && gt <= 0) return 0.5;
    if (gm <= 0) return 0;
    if (gt <= 0) return 1;
    /* Measured from 2,400 medium-v-medium games (ARCHITECTURE.md "Levels"). */
    return sig((gm === 1 && gt === 1 ? C.lv.k3 : C.lv.k) * (cm - ct) + C.lv.gem * (gm - gt));
  }
  /* The round ends with me ahead (win) or behind (lose) — what is the game worth then? */
  function afterRound(C, win, cm, ct) {
    const gm = C.mine.gems - (win === false || win === null ? 1 : 0);
    const gt = C.them.gems - (win === true || win === null ? 1 : 0);
    let bonus = 0;
    if (win === true && C.mine.fac === 'nr') bonus = 1;
    if (win === false && C.them.fac === 'nr') bonus = -1;
    return pGame(C, gm, gt, cm + Math.max(0, bonus), ct + Math.max(0, -bonus));
  }
  /* I pass with this lead; the other side answers as well as it can. */
  function valuePass(C, lead, cm, ct) {
    if (lead < 0 || (lead === 0 && C.them.fac === 'ng' && C.mine.fac !== 'ng')) return afterRound(C, false, cm, ct);
    if (lead === 0 && C.mine.fac === 'ng' && C.them.fac !== 'ng') return Math.min(afterRound(C, true, cm, ct), answerValue(C, 1, cm, ct));
    return Math.min(afterRound(C, lead === 0 ? null : true, cm, ct), answerValue(C, lead + 1, cm, ct));
  }
  /* They need `need` more strength: they spend the cards it takes, if they have them. */
  function answerValue(C, need, cm, ct) {
    const k = Math.ceil(need / C.lv.avg);
    if (k > ct) return 1;
    return afterRound(C, false, cm, ct - k);
  }
  function lookAhead(C, cands) {
    const lead = C.my - C.their;
    const cm = C.me.hand.length, ct = C.them.handN;
    const pass = valuePass(C, lead, cm, ct);
    let best = null, bv = -1;
    for (const x of cands.slice(0, C.lv.top)) {
      if (x.a.t !== 'play' && x.a.t !== 'leader') continue;
      const h = x.a.t === 'play' ? C.me.can.hand.find(y => y.uid === x.a.uid) : null;
      const spy = h && D.card(h.card).ab === 'spy';
      const cm2 = cm - (x.a.t === 'play' ? 1 : 0) + (spy ? 2 : 0);
      const gain = x.raw - (spy ? C.lv.spy * CARD : 0);
      const lead2 = lead + gain;
      /* They answer with a card if they are behind, else they pass and keep theirs. */
      const v = lead2 >= 0 && ct > 0 ? Math.min(valuePass(C, lead2, cm2, ct), valuePass(C, lead2 - C.lv.avg, cm2, ct - 1)) : valuePass(C, lead2, cm2, ct);
      if (v > bv) { bv = v; best = x; }
    }
    return { pass, best, bv };
  }

  function topGains(C, can, n) {
    const gains = [];
    for (const h of can.hand) {
      let b = -1e9;
      /* A medic's delta is the medic alone: the unit it brings back counts too. */
      const back = D.card(h.card).ab === 'medic' ? discardBest(C, C.pub.players[C.si].disc, true).v * 0.9 : 0;
      for (const pl of h.plays) b = Math.max(b, (pl.delta ? pl.delta.me - pl.delta.them : 0) + back);
      if (b > 0) gains.push(b);
    }
    return gains.sort((a, b) => b - a).slice(0, n);
  }

  function turnAnswer(C, view) {
    const can = C.me.can;
    const cands = [];
    const finalRound = C.mine.gems === 1 && C.them.gems === 1;
    const roundLeft = !C.them.passed;
    for (const h of can.hand) {
      for (const pl of h.plays) {
        let v = playValue(C, h, pl);
        /* The price of a card is what it would do later; in the last round
           there is no later, so nothing is saved. */
        const cost = finalRound || !C.lv.plan ? 0 : keepValue(C, h.card) * C.lv.cost;
        v -= cost;
        const key = 'play:' + h.uid + ':' + (pl.row == null ? '' : pl.row) + ':' + (pl.target || '');
        cands.push({ key, v: noisy(C, key, v), a: { t: 'play', n: view.n, uid: h.uid, row: pl.row == null ? null : pl.row, target: pl.target || null }, raw: v + cost });
      }
    }
    if (can.leader && can.leader.ok) {
      const v = leaderValue(C, can.leader) - (finalRound ? 0 : 2.5);
      cands.push({ key: 'leader', v: noisy(C, 'leader' + C.pub.round, v), a: { t: 'leader', n: view.n }, raw: v });
    }
    /* A play that does nothing or costs more than it gains is never made
       (2026-10-18: a Scorch on its own best units, a Clear Weather that
       frees the other side's row, a spy into an empty deck). Gwent has no
       "wait": with nothing worth playing, the house passes. */
    for (let i = cands.length - 1; i >= 0; i--) if (!(cands[i].raw > C.lv.floor)) cands.splice(i, 1);
    cands.sort((x, y) => y.v - x.v);
    const best = cands[0];
    const bestGain = best ? best.raw : 0;
    /* Nothing left that helps: a card that costs strength is no way to wait.
       Ahead, pass; behind with the round lost anyway, keep the cards. */
    if (C.lv.plan && best && best.raw <= 0 && (C.my > C.their || C.them.passed)) return { t: 'pass', n: view.n };
    if (C.lv.look && best && !C.them.passed && !(C.mine.gems === 1 && C.them.gems === 1)) {
      const L = lookAhead(C, cands);
      if (L.pass > L.bv) return { t: 'pass', n: view.n };
      return cheapest(C, cands, (L.best || best).a);
    }
    if (!best || wantPass(C, can, bestGain)) {
      /* Passing with an opponent who has not passed and a card that is pure
         gain (a spy, a muster) still in hand wastes it: play that first. */
      const free = cands.find(x => x.raw >= 2 * CARD && roundLeft && C.lv.plan && !(C.my - C.their > 0 && C.them.passed));
      if (free && !C.them.passed) return free.a;
      return { t: 'pass', n: view.n };
    }
    /* With the other side passed, play the cheapest card that takes the lead. */
    if (C.them.passed && C.lv.plan) {
      const need = C.their - C.my + 1;
      const enough = cands.filter(x => x.raw >= need).sort((x, y) => keepOf(C, x) - keepOf(C, y));
      if (enough.length) return enough[0].a;
    }
    let pickI = 0;
    if (C.lv.slip && cands.length > 1 && hash(C.key + '|slip|' + best.key) < C.lv.slip) pickI = 1;
    return pickI ? cands[pickI].a : cheapest(C, cands, cands[0].a);
  }

  /* ================================================================
     Which card, once the house has decided to play (2026-10-18)
     ================================================================
     Measured by forking 2,400 Hard-v-Hard games at every turn and playing
     each alternative out (scratchpad fork.js; ARCHITECTURE.md "The house
     gets stronger"). The old way — the card worth most now, less a share of
     what it would be worth later — spent heroes in round one. Now:
     1. the leader first, before the last round: a play that costs no card;
     2. a Decoy as a stall, before the last round: it swaps one of the
        house's own units back to hand — a card for a card, so the hand
        keeps its size — and the round goes on with nothing real spent. Only
        a swap that loses at most `stall` strength, never a hero;
     3. otherwise the cheapest card that still helps (`handVal`): the least
        strength out of the hand. */
  function handVal(C, id, up) {
    const c = D.card(id);
    if (!c || c.kind !== 'unit') return 6;
    if (c.ab === 'spy') return 4.5 * spyCards(C);
    return c.str + (up || 0) + (c.ab === 'medic' ? 5 : 0) + (c.ab === 'muster' ? 4 : 0);
  }
  function cheapest(C, cands, a) {
    if (!C.lv.cheap || a.t !== 'play') return a;
    const fin = C.mine.gems === 1 && C.them.gems === 1;
    if (C.lv.spySwap) { const W = spySwap(C, a.n, fin); if (W) return W; }
    if (C.lv.leaderFirst && !fin) { const L = cands.find(x => x.a.t === 'leader'); if (L) return L.a; }
    if (C.lv.stall && !fin) { const S = stall(C, a.n); if (S) return S; }
    let best = null, bv = 1e9, br = -1e9;
    for (const x of cands) {
      if (x.a.t !== 'play') continue;
      const hx = C.me.hand.find(y => y.uid === x.a.uid);
      const v = hx ? handVal(C, hx.id, hx.up) : 99;
      if (v < bv || (v === bv && x.raw > br)) { bv = v; br = x.raw; best = x; }
    }
    return best ? best.a : a;
  }
  /* A Decoy that takes a spy home (theirs, planted on the house's side) to
     play it back: worth it while the deck still holds two cards and what is
     left in it is worth more than the strength the spy hands over — twice
     that in the last round, where the spy's strength leaves her side AND
     goes to theirs, and there is no later round to keep cards for. Before
     this (2026-10-20, the user: it "will sometimes use decoy on a weak card
     and leave the spy") the stall took the weakest unit, never the spy.
     Measured: fires in ~4% of house games, +0.2 overall (40,000 games), so
     about +5 points in the games where it happens. */
  function spySwap(C, n, fin) {
    if (spyCards(C) < 2) return null;
    const left = C.me.deckLeft || {};
    let t = 0, k = 0;
    for (const id of Object.keys(left)) { t += left[id] * handVal(C, id, 0); k += left[id]; }
    let best = null, bs = 1e9;
    for (const h of C.me.can.hand) {
      if (D.card(h.card).sp !== 'decoy') continue;
      for (const pl of h.plays) {
        const sp = D.card(pl.card);
        if (!sp || sp.ab !== 'spy' || !k || spyCards(C) * t / k <= sp.str * (fin ? 2 : 1)) continue;
        if (sp.str < bs) { bs = sp.str; best = { t: 'play', n, uid: h.uid, row: pl.row == null ? null : pl.row, target: pl.target }; }
      }
    }
    return best;
  }
  function stall(C, n) {
    let best = null, bd = -1e9;
    for (const h of C.me.can.hand) {
      if (D.card(h.card).sp !== 'decoy') continue;
      for (const pl of h.plays) {
        const t = D.card(pl.card);
        if (!t || t.hero) continue;
        const d = pl.delta ? pl.delta.me - pl.delta.them : 0;
        if (d > bd) { bd = d; best = { t: 'play', n, uid: h.uid, row: pl.row == null ? null : pl.row, target: pl.target }; }
      }
    }
    return best && -bd <= C.lv.stall ? best : null;
  }
  const keepOf = (C, x) => { if (x.a.t !== 'play') return 3; const h = C.me.can.hand.find(y => y.uid === x.a.uid); return h ? keepValue(C, h.card) : 3; };

  /* ================================================================
     Every other question
     ================================================================ */
  function pickAnswer(C, view) {
    const legal = view.options.filter(o => !o.bad);
    const by = f => { let b = null, bv = -1e18; for (const o of legal) { const v = f(o); if (v > bv) { bv = v; b = o; } } return b; };
    const one = o => o ? { t: 'pick', n: view.n, id: o.id } : (view.skip ? { t: 'skip', n: view.n } : null);
    switch (view.what) {
      case 'redraw': {
        /* Change the card that will do least: a spare weather, a lone bond card. */
        const hand = C.me.hand;
        const score = o => {
          const c = D.card(o.card);
          let v = keepValue(C, o.card);
          if (c.kind === 'special' && c.weather && hand.filter(x => D.card(x.id).weather).length > 2) v -= 3;
          if (c.ab === 'bond' && hand.filter(x => x.id === o.card).length === 1) v -= 1;
          return -v;
        };
        const worst = by(score);
        return worst && -score(worst) < 4.5 ? one(worst) : { t: 'skip', n: view.n };
      }
      case 'leads': return one(legal.find(o => o.id === (C.lv.plan ? 'them' : (hash(C.key) < 0.5 ? 'me' : 'them'))) || legal[0]);
      case 'row': return one(by(o => o.delta ? o.delta.me - o.delta.them + (o.row === 1 ? 0.01 : 0) : 0));
      case 'revive': {
        /* Nobody worth bringing back (a spy into an empty deck): skip, if allowed. */
        const o = by(x => backValue(C, D.card(x.card)));
        return o && backValue(C, D.card(o.card)) <= 0 && view.skip ? { t: 'skip', n: view.n } : one(o);
      }
      case 'discard2': {
        const ids = legal.slice().sort((a, b) => keepValue(C, a.card) - keepValue(C, b.card)).slice(0, view.min).map(o => o.id);
        return { t: 'pick', n: view.n, ids };
      }
      case 'fromDeck': return one(by(o => keepValue(C, o.card) + (D.card(o.card).hero ? 3 : 0)));
      case 'weatherDeck': {
        return one(by(o => {
          const rows = D.card(o.card).rows.filter(r => !C.b.wx[r]);
          if (!rows.length) return -50;
          const loss = (s, r) => C.b.sides[s].rows[r].units.reduce((t, u) => { const c = D.card(u.id); return t + (c && !c.hero ? Math.max(0, u.v - Math.min(1, c.str)) : 0); }, 0);
          return rows.reduce((t, r) => t + loss(1 - C.si, r) - loss(C.si, r), 0);
        }));
      }
      case 'restoreHand': case 'steal': return one(by(o => keepValue(C, o.card)));
    }
    if (view.multi) return { t: 'pick', n: view.n, ids: legal.slice(0, view.min).map(o => o.id) };
    return one(legal[0]);
  }

  function deckAnswer(C, view) {
    const facs = ['nr', 'ng', 'mo', 'st'];
    const fac = facs[Math.floor(hash(C.me.id + '|deck') * 4)];
    return { t: 'deck', n: view.n, fac, leader: D.HOUSE_LEADER[fac], cards: D.STANDARD[fac].slice() };
  }

  function answer(pub, me, view) {
    const C = ctx(pub, me);
    if (view.t === 'deck') return deckAnswer(C, view);
    if (view.t === 'turn') return turnAnswer(C, view);
    return pickAnswer(C, view);
  }
  /* A legal answer whatever happens (the telly's retry after a refusal). */
  function fallback(pub, me, view) {
    if (view.t === 'deck') return deckAnswer(ctx(pub, me), view);
    if (view.t === 'turn') return { t: 'pass', n: view.n };
    const legal = view.options.filter(o => !o.bad);
    if (view.multi) return { t: 'pick', n: view.n, ids: legal.slice(0, view.min).map(o => o.id) };
    return legal.length ? { t: 'pick', n: view.n, id: legal[0].id } : { t: 'skip', n: view.n };
  }

  const Bots = { VERSION, answer, fallback, LEVEL, CARD, keepValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.GwentBots = Bots;
})(typeof window !== 'undefined' ? window : this);
