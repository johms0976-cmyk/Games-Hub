'use strict';
/* Lost Ruins of Arnak — the house explorers.
 *
 * A house player decides from exactly what a phone is given: the public view
 * of the table and its own seat's view (hand, wallet, open questions and the
 * list of everything it could do). Never the Game. `tests/engine.js` greps
 * this file for any reach into the engine's state.
 *
 * The method is one greedy step with a value on everything, in points:
 * resources at a rough exchange rate, research at the points it moves plus
 * whatever the row hands out, a card at its printed points plus what its
 * effect is likely to be worth over the rounds left. Free actions come first
 * — assistants, idols worth their slot, free-action cards whose travel icon
 * is not going to be needed — then the best main action, and a pass when
 * nothing is worth doing.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./arnak-data.js') : root.ArnakData;
  const E = (typeof module !== 'undefined' && module.exports) ? require('./arnak-engine.js') : root.ArnakEngine;

  /* ---------------- levels ----------------
     One brain, three levels (docs/LESSONS-CHECKLIST.md G1). 'hard' is the
     best the house has. 'medium' is the same brain a little sloppy: it
     misjudges what a main action is worth (NOISE) and now and then forgets
     an assistant or a boon (SLIP). 'easy' misjudges more, forgets more, and
     plays without the research plan — no extra value on what the next step
     up the track is short of, nothing for being high early. That plan is
     what took the house from 28 to ~43 points a game (section 5 of
     ARCHITECTURE.md), so switching it off is a real step down, and one a
     person makes: buying a nice card instead of saving for the temple.
     Every wobble is a hash of what is being decided (seat, round, cards
     played, archaeologists out, the option) — never Math.random() and never
     a prompt number, so a hold on the telly or a take-back changes nothing.
     Measured by the tournament in tests/engine.js: hard > medium > easy. */
  const LEVEL = { easy: { noise: 2.4, slip: 0.4, plan: false },
                  medium: { noise: 1.6, slip: 0.25, plan: true },
                  hard: { noise: 0, slip: 0, plan: true } };
  let LV = LEVEL.medium, AT = '';
  function h01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  /* What this decision is about, as a key: the same table gives the same key. */
  function decisionKey(pub, pl) {
    return pl.id + '|' + pub.round + '|' + pl.play.length + '|' + pl.handN + '|' +
      pl.arch.map(a => a ? a.site + a.space : '-').join('') + '|' + (pl.mainDone ? 1 : 0);
  }
  const slips = what => LV.slip > 0 && h01(AT + '|slip|' + what) < LV.slip;

  /* ---------------- valuing things ---------------- */

  /* What a resource is worth this round. In the last round anything that
     cannot be turned into points before the end is worth less; and a
     resource the next step up the research track is short of is worth more
     — that is what makes a house explorer go and dig for arrowheads rather
     than buy a fourth item. NEED is set at the top of every decision. */
  let NEED = {};
  function resValue(pub, k) {
    const base = D.RES_VALUE[k] || 1;
    let v = pub.round >= 5 ? base * 0.75 : base;
    if (NEED[k]) v *= 1.6;
    return v;
  }
  /* What the next move of each research token is short of. */
  function computeNeed(pub, pl) {
    const T = D.TRACKS[pub.side];
    const need = {};
    const add = (cost, w) => {
      for (const k in cost) {
        /* The Snake side's bridge wants an idol out of the crates. */
        const have = k === 'idol' ? pl.idols : (pl.res[k] || 0);
        const d = cost[k] - have;
        if (d > 0) need[k] = Math.max(need[k] || 0, d * w);
        else if (k === 'idol') need.keepIdol = 1;
      }
    };
    const cheapest = (tok, fromId) => {
      const from = T.squares[fromId];
      let best = null;
      for (const to of from.next) {
        const s = T.squares[to];
        if (tok === 'book' && (s.temple || s.row > T.squares[pl.glass].row)) continue;
        let v = 0;
        for (const k in s.cost) v += (D.RES_VALUE[k] || 3) * s.cost[k];
        if (!best || v < best.v) best = { v, s };
      }
      return best && best.s;
    };
    if (T.squares[pl.glass].temple) add(T.templeCosts[1], 1);
    else {
      const a = cheapest('glass', pl.glass);
      if (a) {
        add(a.cost, 1);
        const b = cheapest('glass', a.id);
        if (b) add(b.cost, 0.5);
      }
    }
    const c = cheapest('book', pl.book);
    if (c) add(c.cost, 0.7);
    return need;
  }
  function gainValue(pub, gains) { let v = 0; for (const k in gains) v += resValue(pub, k) * gains[k]; return v; }
  function costValue(pub, cost) { let v = 0; for (const k in cost) v += (k === 'idol' ? 3.5 : resValue(pub, k)) * cost[k]; return v; }

  /* What an effect is worth, roughly, when it resolves. */
  function fxValue(pub, fx, me) {
    let v = 0;
    for (const s of (fx || [])) {
      if (s.g) v += gainValue(pub, s.g);
      else if (s.fear) v -= 1.6 * s.fear;
      else if (s.draw) v += 1.1 * s.draw;
      else if (s.drawBottom) v += 1.1;
      else if (s.exile) v += hasFear(me) ? 1.3 : 0.2;
      else if (s.upgrade) v += 0.9;
      else if (s.refresh) v += 1.2;
      else if (s.pay) v += Math.max(0, fxValue(pub, s.then, me) - costValue(pub, s.pay));
      else if (s.useCard) v += Math.max(0, fxValue(pub, s.then, me) - 0.8);
      else if (s.travelPay) v += Math.max(0, fxValue(pub, s.then, me) - 0.8);
      else if (s.dig) v += 1.8 + (s.dig.twice ? 1.5 : 0);
      else if (s.research) v += 2.4;
      else if (s.buy) v += 1 + (s.buy.disc || 0) * 0.7;
      else if (s.gain) v += s.gain.type === 'art' ? 4.5 : 3;
      else if (s.overcome) v += 4.5;
      else if (s.activate) v += 2.2 * (s.activate.n || 1);
      else if (s.activateTop) v += s.activateTop === 2 ? 4.5 : 2.8;
      else if (s.relocate) v += 2;
      else if (s.recall) v += 0.8;
      else if (s.ocarina) v += 1;
      else if (s.warMask) v += 0.8;
      else if (s.crown) v += 2.5;
      else if (s.supplyAsst) v += s.supplyAsst === 'gold' ? 2.4 : 1.8;
      else if (s.swapAsst) v += 0.3;
      else if (s.stoneKey) v += 1.5;
      else if (s.earring) v += 1.3;
      else if (s.hammer) v += 2;
      else if (s.per) v += 1.6;
      else if (s.choose) v += Math.max.apply(null, s.choose.map(c => fxValue(pub, c.fx, me) - (c.pay ? costValue(pub, c.pay) : 0)));
      else if (s.choose2) v += 2.4;
      else if (s.travel) v += 0.6;
    }
    return v;
  }
  const hasFear = me => !!me && me.hand.some(uid => D.kindOf(uid) === 'fear');
  const cardFx = c => c.opts ? c.opts[0].fx : c.fx;

  /* A card bought now is used about once a round from next round on. */
  function cardWorth(pub, uid, me, useNow) {
    const c = D.card(uid);
    if (!c) return 0;
    const left = Math.max(0, 5 - pub.round);
    const per = Math.max(0.3, fxValue(pub, cardFx(c), me) - (c.kind === 'art' ? 1.4 : 0));
    let v = c.vp + per * left * 0.4 + 0.35 * c.travel.length;
    if (useNow && c.kind === 'art') v += Math.max(0, fxValue(pub, cardFx(c), me));
    return v;
  }

  /* Points a research move is worth to this player. */
  function researchWorth(pub, me, mv, player) {
    const T = D.TRACKS[pub.side];
    if (mv.t === 'temple') return mv.vp - costValue(pub, mv.cost) * 0.9;
    const sq = T.squares[mv.to];
    const from = T.squares[player[mv.token]];
    const rowVp = (r, tok) => {
      if (r <= 0) return 0;
      if (r >= 8) return D.TEMPLE_ARRIVAL[pub.players.filter(q => q.arrival != null).length] || 19;
      return T.rows[r][tok].vp;
    };
    let v = rowVp(sq.row, mv.token) - rowVp(from.row, mv.token);
    if (sq.row < 8) {
      const r = T.rows[sq.row][mv.token].r;
      v += rowRewardValue(pub, r, player);
      const tiles = pub.research.bonus[mv.to];
      if (tiles && tiles.length) v += 1.2;
    } else v += 1.5;
    /* Being further up is worth something in itself: every row above pays
       more than the one below, and the temple pays most to whoever is first. */
    const early = LV.plan ? [0, 3.2, 3.0, 2.6, 1.6, 0.2][pub.round] || 0 : 0;
    v += mv.token === 'glass' ? early : early * 0.55;
    return v - costValue(pub, mv.cost) * 0.7;
  }
  function rowRewardValue(pub, r, player) {
    const left = Math.max(0, 5 - pub.round);
    switch (r) {
      case 'coin': return resValue(pub, 'coin');
      case 'coin2': return 2 * resValue(pub, 'coin');
      case 'compass': return resValue(pub, 'compass');
      case 'compass3': return 3 * resValue(pub, 'compass');
      case 'jewel': return resValue(pub, 'jewel');
      case 'draw': return 1.1;
      case 'fear': return -1.6;
      case 'exile': return 0.8;
      case 'recruit': return player.asst.length >= 2 ? 0 : 1.5 + left * 1.4;
      case 'upAsst': return player.asst.some(a => !a.gold) ? 1 + left * 0.7 : 0;
      case 'refreshAsst': return player.asst.length ? 1.2 : 0;
      case 'freeArt': return 4;
      case 'guard': return 3;
      case 'rescue': return player.asst.length >= 2 ? 0 : 1 + left * 1.2;
    }
    return 0;
  }

  function siteFx(tile) { const d = D.site(tile); return d ? d.fx : []; }
  const AVG_TILE = { 1: 3.4, 2: 6.2 };

  /* ---------------- the turn ---------------- */

  function me2player(pub, me) { return pub.players.find(p => p.id === me.id); }

  function turn(pub, me, pr) {
    const can = me.can;
    const pl = me2player(pub, me);
    const n = can.n;
    const w = me.wallet;

    /* Assistants first: they are back every round, so an unused one is waste. */
    for (const a of can.assist) {
      if (!a.ok || a.main) continue;
      if (slips('asst' + a.id)) continue;
      const d = D.ASST[a.id];
      const side = a.gold ? d.gold : d.silver;
      const first = side.fx[0];
      if (first.choose) {
        /* Resources, not travel — travel is offered at the payment. */
        const opts = (a.opts || []).filter(o => o.ok);
        const resOpt = opts.find(o => !first.choose[o.i].fx.some(s => s.travel));
        if (resOpt) return { t: 'assist', id: a.id, opt: resOpt.i, n };
        continue;
      }
      if (first.travelPay && !cheapTravel(me, first.travelPay)) continue;
      if (first.exile && !hasFear(me) && !pl.play.some(uid => D.kindOf(uid) === 'fear')) continue;
      if (first.useCard !== undefined && first.useCard) continue;
      return { t: 'assist', id: a.id, n };
    }

    /* Boons that are free actions: an exile when there is Fear to lose, the
       rest whenever. */
    for (const b of can.boon) {
      if (slips('boon' + b.id)) continue;
      const fx = D.GUARD[b.id].boon.fx;
      if (fx[0].exile && !hasFear(me) && !pl.play.some(uid => D.kindOf(uid) === 'fear')) continue;
      if (fx[0].upgrade && !(pl.res.tablet > 1 || pl.res.arrowhead > 0)) continue;
      return { t: 'boon', id: b.id, n };
    }

    /* The best main action, if it has not been taken. */
    let best = null;
    if (can.main) {
      best = bestMain(pub, me, pl);
      /* A little resource short? A free-action card or an idol might fix it. */
      if (!best || best.v < 2.5) {
        const lift = freeLift(pub, me, pl, can);
        if (lift) return Object.assign(lift, { n });
      }
      if (best && best.v > 0.4) return Object.assign(best.a, { n });
    }

    /* Nothing worth a main action: use the free cards before going. */
    const free = can.play.find(x => x.ok && x.free && D.card(x.card) && !needTravel(pub, me, pl, x.card));
    if (free) {
      const c = D.card(free.card);
      return { t: 'play', card: free.card, opt: c.opts ? c.opts.findIndex(o => o.free) : undefined, n };
    }
    if (can.idol.ok && idolWorth(pub, pl, can) > 0) return idolAction(pub, pl, can, n);
    if (can.main) {
      /* The pass cards: pass for their bigger payout. */
      const passer = can.play.find(x => x.ok && x.opts && x.opts.some(o => o.pass && o.ok));
      if (passer) return { t: 'play', card: passer.card, opt: passer.opts.findIndex(o => o.pass), n };
      return { t: 'pass', n };
    }
    return { t: 'end', n };
  }

  /* A card's travel is worth keeping if an archaeologist is still at camp
     and this is one of the few travel cards in hand. */
  function needTravel(pub, me, pl, uid) {
    if (!pl.arch.some(a => !a)) return false;
    const travelCards = me.hand.filter(x => D.card(x) && D.card(x).travel.length && D.kindOf(x) !== 'fear');
    const fears = me.hand.filter(x => D.kindOf(x) === 'fear').length;
    const camp = pl.arch.filter(a => !a).length;
    /* Fear cards walk to the camp sites; keep one real travel card besides. */
    return travelCards.length + fears <= camp + 1 && D.card(uid).travel.some(t => t !== 'boot') && fears < camp;
  }
  function cheapTravel(me, cost) {
    const pay = E.suggestPay(me.wallet, cost, null, me.wallet.res.coin);
    if (!pay) return false;
    return pay.pilots === 0 && pay.boons.length === 0 && pay.cards.every(uid => D.kindOf(uid) === 'fear');
  }

  function idolWorth(pub, pl, can) {
    /* On the Snake side an idol in the crates is the fare across the bridge:
       do not slot the one the research track is about to ask for. */
    if ((NEED.idol || NEED.keepIdol) && pl.idols <= 1) return -9;
    const slot = can.idol.cost;
    let best = -9;
    for (const o of can.idol.opts) if (o.ok) best = Math.max(best, idolOptValue(pub, pl, o.id));
    return best - slot;
  }
  function idolOptValue(pub, pl, id) {
    const o = D.IDOL_SLOT.find(x => x.id === id);
    return fxValue(pub, o.fx) - (o.pay ? costValue(pub, o.pay) : 0);
  }
  function idolAction(pub, pl, can, n) {
    let best = null;
    for (const o of can.idol.opts) {
      if (!o.ok) continue;
      const v = idolOptValue(pub, pl, o.id);
      if (!best || v > best.v) best = { v, i: o.i };
    }
    return { t: 'idol', opt: best.i, n };
  }

  /* If one free action would unlock a clearly better main action, take it. */
  function freeLift(pub, me, pl, can) {
    const T = D.TRACKS[pub.side];
    /* A research move short by exactly what an idol or a free card gives. */
    const shortOf = [];
    for (const mv of can.research) if (!mv.ok) {
      const need = {};
      for (const k in mv.cost) { if (k === 'idol') continue; const d = mv.cost[k] - (pl.res[k] || 0); if (d > 0) need[k] = d; }
      const total = Object.values(need).reduce((a, b) => a + b, 0);
      if (total === 1) shortOf.push({ need, mv });
    }
    for (const s of shortOf) {
      const k = Object.keys(s.need)[0];
      const worth = researchWorth(pub, me, s.mv, pl);
      if (worth < 2) continue;
      /* A free card that gives it. */
      const card = can.play.find(x => x.ok && x.free && (() => {
        const c = D.card(x.card); const fx = c.opts ? c.opts.find(o => o.free).fx : c.fx;
        return fx.some(st => st.g && st.g[k]);
      })());
      if (card) {
        const c = D.card(card.card);
        return { t: 'play', card: card.card, opt: c.opts ? c.opts.findIndex(o => o.free) : undefined };
      }
      /* An idol that gives it. */
      if (can.idol.ok) {
        const map = { arrowhead: 'arrow', tablet: 'tabs', jewel: 'jewel', coin: 'coco', compass: 'coco' };
        const o = can.idol.opts.find(x => x.id === map[k] && x.ok);
        if (o && worth - can.idol.cost > 1 && !((NEED.idol || NEED.keepIdol) && pl.idols <= 1)) return { t: 'idol', opt: o.i };
      }
    }
    /* Compasses for a discovery or an artifact, from free cards. */
    const compassCards = can.play.filter(x => x.ok && x.free && (() => {
      const c = D.card(x.card); const fx = c.opts ? c.opts.find(o => o.free).fx : c.fx;
      return fx.some(st => st.g && (st.g.compass || st.g.coin));
    })());
    if (compassCards.length && !compassCards.every(x => needTravel(pub, me, pl, x.card))) {
      const x = compassCards.find(y => !needTravel(pub, me, pl, y.card));
      const c = D.card(x.card);
      return { t: 'play', card: x.card, opt: c.opts ? c.opts.findIndex(o => o.free) : undefined };
    }
    return null;
  }

  function bestMain(pub, me, pl) {
    const can = me.can;
    const w = me.wallet;
    const cands = [];
    const payCost = pay => {
      if (!pay) return 99;
      let v = 0;
      for (const uid of pay.cards) {
        const c = D.card(uid);
        v += c.kind === 'fear' ? 0 : (c.kind === 'basic' ? 0.9 : Math.max(0.6, fxValue(pub, cardFx(c), me) * 0.7));
      }
      v += pay.boons.length * 1.5 + pay.assts.length * 1 + pay.pilots * 2 * resValue(pub, 'coin');
      return v;
    };
    const fearRisk = (slot) => {
      const s = pub.sites.find(x => x.id === slot);
      return s && s.guardian ? 1.6 : 0;
    };

    /* Digging at a known site. */
    for (const t of can.dig) {
      if (!t.ok) continue;
      const s = pub.sites.find(x => x.id === t.slot);
      if (t.t === 'dig') {
        const pay = E.suggestPay(w, t.cost, null, w.res.coin);
        if (!pay) continue;
        const v = fxValue(pub, siteFx(s.tile), me) - payCost(pay) - fearRisk(t.slot) + 0.3;
        cands.push({ v, a: { t: 'dig', slot: t.slot, space: t.space, pay } });
      } else {
        const pay = E.suggestPay(w, t.cost, null, w.res.coin);
        if (!pay) continue;
        const idols = t.level === 2 ? 2 : 1;
        const idolGift = s.idols[0] ? fxValue(pub, D.REWARD[s.idols[0]].fx, me) : 0.8;
        /* A guardian comes with it; worth something if we can beat it. */
        const v = idols * 3 + idolGift + AVG_TILE[t.level] - t.comp * resValue(pub, 'compass') * 0.9 - payCost(pay) - 1.4 + (pub.round <= 3 ? 0.6 : 0)
          + (NEED.idol ? 3 : 0);
        cands.push({ v, a: { t: 'discover', slot: t.slot, pay } });
      }
    }
    /* Guardians at our sites. */
    for (const o of can.overcome) {
      if (!o.ok) continue;
      const cost = o.cost;
      const wUse = cost.useCard ? pickUseCard(me.hand) : null;
      let pay = null;
      if (cost.travel.length) {
        const w2 = wUse ? Object.assign({}, w, { hand: w.hand.filter(x => x !== wUse) }) : w;
        pay = E.suggestPay(w2, cost.travel, null, w.res.coin - (cost.res.coin || 0));
        if (!pay) continue;
      }
      const v = D.GUARDIAN_VP + 2 + 1.6 - costValue(pub, cost.res) * 0.9 - (pay ? payCost(pay) : 0) - (wUse ? 0.7 : 0);
      cands.push({ v, a: { t: 'overcome', slot: o.slot, pay: pay || undefined, use: wUse || undefined } });
    }
    /* Buying. */
    for (const b of can.buy) {
      if (!b.ok) continue;
      const c = D.card(b.card);
      const use = c.kind === 'art' && fxValue(pub, cardFx(c), me) > 0;
      const v = cardWorth(pub, b.card, me, use) - b.cost * resValue(pub, b.res) * 0.95;
      cands.push({ v, a: { t: 'buy', card: b.card, use, opt: c.opts ? 0 : undefined } });
    }
    /* Research. */
    for (const mv of can.research) {
      if (!mv.ok) continue;
      const v = researchWorth(pub, me, mv, pl);
      cands.push({ v, a: mv.t === 'temple' ? { t: 'temple', stack: mv.stack } : { t: 'research', token: mv.token, to: mv.to } });
    }
    /* Main-action cards in hand. */
    for (const x of can.play) {
      if (!x.ok) continue;
      const c = D.card(x.card);
      if (x.free && !c.opts) continue;
      if (c.opts) {
        const pi = x.opts.findIndex(o => o.pass && o.ok);
        /* The pass half is weighed at the end, as a way to go out. */
        continue;
      }
      let v = fxValue(pub, c.fx, me) - (c.kind === 'art' ? resValue(pub, 'tablet') : 0);
      if (!usefulNow(pub, me, pl, c)) v -= 5;
      cands.push({ v, a: { t: 'play', card: x.card } });
    }
    /* The Quartermaster. */
    for (const a of can.assist) if (a.ok && a.main) cands.push({ v: 1.2, a: { t: 'assist', id: a.id } });
    if (!cands.length) return null;
    /* A small tie-break at every level, and the level's misjudgement. */
    for (const c of cands) {
      const k = AT + '|' + JSON.stringify(c.a);
      c.v += h01(k + '|tie') * 0.3 + (h01(k + '|noise') - 0.5) * 2 * LV.noise;
    }
    cands.sort((a, b) => b.v - a.v);
    return cands[0];
  }

  /* Would this card's effect actually do anything now? */
  function usefulNow(pub, me, pl, c) {
    const fx = cardFx(c) || [];
    const first = fx[0] || {};
    const campFree = pl.arch.some(a => !a);
    if (first.overcome || (first.pay && first.then && first.then[0].overcome)) {
      return pub.sites.some(s => s.guardian && s.spaces.some(sp => sp.who === pl.id));
    }
    if (first.relocate || first.recall) return pl.arch.some(Boolean);
    if (first.crown) return pub.sites.some(s => s.guardian && s.spaces.some(sp => sp.who === pl.id));
    if (fx.some(s => s.dig) && !campFree) return fx.some(s => s.draw || s.g);
    if (first.stoneKey) return pl.slots > 0;
    if (first.swapAsst) return false;
    if (first.activate && first.activate.mine) return pl.arch.some(Boolean);
    if (first.research) return true;
    return true;
  }
  function pickUseCard(hand) {
    const order = hand.slice().sort((a, b) => rank(a) - rank(b));
    return order[0] || null;
    function rank(uid) { const k = D.kindOf(uid); return k === 'fear' ? 0 : k === 'basic' ? 1 : 2; }
  }

  /* ---------------- sub-questions ---------------- */

  function answer(pub, me, pr) {
    if (!pr) return null;
    const pl = me2player(pub, me);
    LV = LEVEL[pl.level] || LEVEL.medium;
    AT = decisionKey(pub, pl);
    NEED = LV.plan ? computeNeed(pub, pl) : {};
    switch (pr.t) {
      case 'turn': return turn(pub, me, pr);
      case 'keep': return { t: 'keep', keep: [], n: pr.n };
      case 'pay': {
        const pay = E.suggestPay(me.wallet, pr.cost, null, me.wallet.res.coin);
        return pay ? { t: 'pay', pay, n: pr.n } : { t: 'skip', n: pr.n };
      }
      case 'dig': {
        let best = null;
        for (const t of (pr.targets || [])) {
          if (!t.ok) continue;
          const pay = pr.o.free ? {} : E.suggestPay(me.wallet, t.cost, pr.o.disc || null, me.wallet.res.coin);
          if (!pay) continue;
          const s = pub.sites.find(x => x.id === t.slot);
          const v = t.t === 'dig' ? fxValue(pub, siteFx(s.tile), me) * (pr.o.twice ? 2 : 1) - (s.guardian ? 1.6 : 0)
            : (t.level === 2 ? 6 : 3) + AVG_TILE[t.level] - t.comp - 1.4;
          const cost = pay.cards ? pay.cards.length * 0.8 + (pay.pilots || 0) * 2 : 0;
          if (!best || v - cost > best.v) best = { v: v - cost, a: { t: t.t, slot: t.slot, space: t.space, pay } };
        }
        if (best && best.v > 0) return Object.assign(best.a, { n: pr.n });
        return { t: 'skip', n: pr.n };
      }
      case 'research': {
        let best = null;
        for (const mv of (pr.moves || [])) {
          if (!mv.ok) continue;
          const v = researchWorth(pub, me, mv, pl);
          if (!best || v > best.v) best = { v, mv };
        }
        if (!best) return { t: 'skip', n: pr.n };
        const mv = best.mv;
        return mv.t === 'temple' ? { t: 'temple', stack: mv.stack, n: pr.n } : { t: 'research', token: mv.token, to: mv.to, n: pr.n };
      }
      case 'buy': {
        let best = null;
        for (const c of (pr.cards || [])) {
          if (!c.ok) continue;
          const v = cardWorth(pub, c.card, me, true) - c.cost * resValue(pub, c.res) * 0.95;
          if (!best || v > best.v) best = { v, c };
        }
        if (!best || best.v < 0) return { t: 'skip', n: pr.n };
        const card = D.card(best.c.card);
        return { t: 'buy', card: best.c.card, use: card.kind === 'art', opt: card.opts ? 0 : undefined, n: pr.n };
      }
      case 'multi': {
        if (pr.what === 'choose2') {
          const vals = pr.options.map(o => ({ id: o.id, v: o.id === 'exile' ? (hasFear(me) ? 1.5 : 0.1) : resValue(pub, o.id) }));
          vals.sort((a, b) => b.v - a.v);
          return { t: 'multi', picks: vals.slice(0, 2).map(x => x.id), n: pr.n };
        }
        return { t: 'multi', picks: pr.options.slice(0, pr.min).map(o => o.id), n: pr.n };
      }
      case 'pick': return pick(pub, me, pl, pr);
    }
    return null;
  }

  function pick(pub, me, pl, pr) {
    const opts = pr.options || [];
    const n = pr.n;
    const skip = { t: 'pick', pick: null, n };
    const take = id => ({ t: 'pick', pick: id, n });
    const bestBy = f => { let b = null; for (const o of opts) { const v = f(o); if (b == null || v > b.v) b = { v, o }; } return b; };
    switch (pr.what) {
      case 'exile': {
        const f = opts.find(o => o.id === 'feartile') || opts.find(o => o.card && D.kindOf(o.card) === 'fear');
        if (f) return take(f.id);
        return pr.skip ? skip : take(opts[0].id);
      }
      case 'upgrade': {
        const aj = opts.find(o => o.id === 'aj'), ta = opts.find(o => o.id === 'ta');
        if (aj && pl.res.arrowhead >= 2) return take('aj');
        if (ta) return take('ta');
        if (aj) return take('aj');
        return skip;
      }
      case 'useCard': {
        const id = pickUseCard(opts.map(o => o.id));
        return id ? take(id) : skip;
      }
      case 'tales': case 'templeBonus': {
        const b = bestBy(o => fxValue(pub, D.REWARD[o.id].fx, me));
        return take(b.o.id);
      }
      case 'gain': {
        const b = bestBy(o => cardWorth(pub, o.id, me, true));
        const c = D.card(b.o.id);
        return { t: 'pick', pick: b.o.id, use: c.kind === 'art', opt: c.opts ? 0 : undefined, n };
      }
      case 'overcome': return take(opts[0].id);
      case 'activate': case 'crown': {
        const b = bestBy(o => { const s = pub.sites.find(x => x.id === o.slot); return fxValue(pub, siteFx(s.tile), me); });
        return b.v > 0 ? take(b.o.id) : (pr.skip ? skip : take(b.o.id));
      }
      case 'relocate': {
        const b = bestBy(o => {
          const s = pub.sites.find(x => x.id === o.slot);
          const from = pub.sites.find(x => x.id === o.from);
          return fxValue(pub, siteFx(s.tile), me) + (from && from.guardian ? 1.6 : 0) - (s.guardian ? 1.6 : 0);
        });
        return take(b.o.id);
      }
      case 'recall': {
        const g = opts.find(o => { const s = pub.sites.find(x => x.id === o.from); return s && s.guardian; });
        return take((g || opts[0]).id);
      }
      case 'supplyAsst': {
        const b = bestBy(o => fxValue(pub, (pr.gold ? D.ASST[o.asst].gold : D.ASST[o.asst].silver).fx, me));
        return take(b.o.id);
      }
      case 'swapAsst': return skip;
      case 'earringN': return take(opts[opts.length - 1].id);
      case 'earringKeep': case 'earringBack': {
        const b = bestBy(o => cardWorth(pub, o.card, me, false) + (D.kindOf(o.card) === 'fear' ? -5 : 0));
        if (pr.what === 'earringBack' && D.kindOf(b.o.card) === 'fear') return skip;
        return take(b.o.id);
      }
      case 'hammer': {
        const b = bestBy(o => cardWorth(pub, o.card, me, false));
        return b && b.v > 1 ? take(b.o.id) : skip;
      }
      case 'choose': {
        /* Travel from an assistant is offered at the payment instead, so a
           choice between resources and travel takes the resources. */
        const b = bestBy(o => (o.fx || []).some(s => s.travel) ? -1 : fxValue(pub, o.fx, me) - (o.pay ? costValue(pub, o.pay) : 0));
        return take(b.o.id);
      }
      case 'recruit': case 'rescue': {
        const b = bestBy(o => fxValue(pub, D.ASST[o.asst].silver.fx, me) + (D.ASST[o.asst].main ? -0.5 : 0));
        return take(b.o.id);
      }
      case 'upAsst': case 'refresh': return take(opts[0].id);
    }
    return pr.skip ? skip : take(opts[0].id);
  }

  /* When the engine refuses a house move, this is always legal. */
  function fallback(pub, me, pr) {
    if (!pr) return null;
    if (pr.t === 'turn') return me.can && me.can.main ? { t: 'pass', n: pr.n } : { t: 'end', n: pr.n };
    if (pr.t === 'keep') return { t: 'keep', keep: [], n: pr.n };
    if (pr.skip) return pr.t === 'pick' ? { t: 'pick', pick: null, n: pr.n } : { t: 'skip', n: pr.n };
    if (pr.t === 'pick') return { t: 'pick', pick: pr.options[0].id, n: pr.n };
    if (pr.t === 'multi') return { t: 'multi', picks: pr.options.slice(0, pr.min).map(o => o.id), n: pr.n };
    return null;
  }

  const Bots = { answer, fallback, fxValue, cardWorth, researchWorth, LEVEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.ArnakBots = Bots;
})(typeof window !== 'undefined' ? window : this);
