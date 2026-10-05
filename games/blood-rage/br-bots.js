/* Blood Rage — the house clans.
 *
 * They decide from (publicView, seatView) and nothing else: the board, the
 * sheets, their own hand. No reach into the Game — a clan that could see the
 * card you are holding face down is not an opponent. tests/engine.js greps
 * this file for any such reach.
 *
 * The play is honest rather than clever: draft a balanced hand, get figures
 * into provinces worth pillaging, pillage when the numbers say it wins, throw
 * a card away in a battle that is already lost (a loser keeps its cards), and
 * sit in the doomed province late in an Age for the Ragnarök glory.
 */
(function (root) {
  'use strict';
  const D = root.BRData, E = root.BREngine;

  const TOKEN_VAL = { all: 7, rage: 4, axes: 3, horns: 3, glory: 3 };
  /* Hard: what a pillage token is worth to THIS clan now. The end-of-game stat
     bonuses decide games (measured: the winner's average 37 of 58 Glory, everyone
     else's 13), and a pillage raises a fixed stat — so a raise that crosses a bonus
     line (+10 at the 4th step, +20 at the 6th) is worth far more than one that
     does not, and a raise to a full track is worth nothing. */
  const STEP_VAL = [2.5, 3.5, 7, 3.5, 7, 0];
  function tokenVal(pub, id, tok) {
    const p = me(pub, id);
    if (!hard(pub, id) || !p) return TOKEN_VAL[tok];
    if (tok === 'glory') return 3;
    const one = s2 => STEP_VAL[p.stats[s2]] + (s2 === 'rage' && pub.age < 3 ? 1 : 0);
    const K = 1.5;
    if (tok === 'all') return K * (one('rage') + one('axes') + one('horns'));
    return K * one(tok);
  }
  const CLAN_VAL = {
    lokidomain: 3, lokiemin: 3, lokiwrath: 4, friggacharm: 3, thorglory: 3, succor: 3, tyrdomain: 2, tyrwrath: 3,
    lokiblessing: 2, odininsp: 3, tyrchallenge: 3, friggaprot: 3, tyrprowess: 2, thordomain: 3, friggadomain: 3,
    odinthrone: 5, thorconquest: 5, friggasac: 3,
    fchosen: 3, ochosen: 3.5, tchosen: 3.5
  };
  /* how many Mystics this clan already has out of the box */
  const mysticsOut = (pub, id) => { const p = me(pub, id); if (!p) return 0;
    return pub.figs.filter(f => f.owner === id && f.kind === 'mystic').length + p.reserve.concat(p.valhalla).filter(f => f.kind === 'mystic').length; };

  const mem = {};   // per seat, per Age: provinces this clan has already failed to take
  const remember = (pub, id) => { const k = pub.gid + ':' + id + ':' + pub.age; return mem[k] || (mem[k] = { failed: {} }); };

  function me(pub, id) { return pub.players.find(p => p.id === id); }

  /* ---------------- difficulty ----------------
     'hard' is the house's best brain plus what the game turned out to be about:
     the end-of-game stat bonuses (the winner's average 37 of 58 Glory), so it
     values each pillage token by how near that stat is to a bonus line and
     raises stats onto the lines. 'medium' is the same brain, a little sloppy —
     values misjudged a bit, one upgrade in five forgotten, now and then any old
     battle card. 'easy' misjudges badly, attacks recklessly, forgets half its
     upgrades, never plays a late Heimdall card and picks stats at random.
     Levers measured and dropped: counting every neighbour that could join a
     fight (made it timid: 19.6% of wins against a fair 29%), stacking the doomed
     province, marching into it late, bolder attacks, keener quests, cheaper
     upgrades (all within noise of the plain brain).
     The level is public (the room chose it). Easy's "randomness" is a hash of what
     it is deciding — never of a prompt number, or a pause on the telly would
     change the game (the Forbidden Stars lesson). Measured by the tournament in
     tests/engine.js: hard beats medium beats easy. */
  const lvl = (pub, id) => { const p = me(pub, id); return (p && p.level) || 'medium'; };
  const hard = (pub, id) => lvl(pub, id) === 'hard';
  function h01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  /* a stable wobble in [-amp, amp] for an easy clan; nothing for the others */
  const NOISE = { easy: 1, medium: 0.45, hard: 0 };        // how much a clan misjudges values
  const SLIP = { easy: 0.5, medium: 0.2, hard: 0 };         // how often it forgets to upgrade
  const WILD = { easy: 1, medium: 0.15, hard: 0 };          // how often it throws any old card into a battle
  const wob = (pub, id, key, amp) => (h01(id + '|' + pub.age + '|' + key) - 0.5) * 2 * amp * (NOISE[lvl(pub, id)] || 0);
  function str(pub, id, prov) { return E.viewStr(pub, id, prov, false); }
  function enemyMax(pub, id, prov) {
    let m = 0;
    for (const q of pub.players) if (q.id !== id) m = Math.max(m, str(pub, q.id, prov));
    return m;
  }
  function provOf(pub, id) { return pub.provs.find(p => p.id === id); }
  function alive(pub, id) { const p = provOf(pub, id); return p && !p.destroyed; }
  function adjacentEnemyReach(pub, id, prov) {
    /* what the others could walk in during a Call to Battle */
    let m = 0;
    for (const q of pub.players) {
      if (q.id === id) continue;
      const figs = pub.figs.filter(f => f.owner === q.id && f.at !== prov && D.prov(f.at) && D.adjacent(f.at, prov) && f.kind !== 'ship' &&
        !(f.kind === 'monster' && D.CARDS[f.key].fx === 'isShip'));
      const best = figs.reduce((b, f) => Math.max(b, f.kind === 'monster' ? D.CARDS[f.key].str : f.kind === 'leader' ? 3 : f.kind === 'mystic' ? 2 : 1), 0);
      m = Math.max(m, best);
    }
    return m;
  }
  const cardGuess = age => [0, 3, 4, 5][age] || 4;

  /* ---------------- valuing a card ---------------- */
  function cardValue(pub, mine, c, hand) {
    return cardValue0(pub, mine, c, hand) + (mine ? wob(pub, mine.id, 'card' + (c.id || c.key) + (hand || []).length, 4) : 0);
  }
  function cardValue0(pub, mine, c, hand) {
    const d = D.CARDS[c.key];
    const age = pub.age;
    const kinds = (hand || []).map(x => D.CARDS[x.key].kind);
    const count = k => kinds.filter(x => x === k).length;
    switch (d.kind) {
      case 'battle': {
        let v = d.value;
        if (d.fx === 'sight') v = 3 + age;
        if (d.late) v += 1.5;
        if (d.fx === 'watch') v = 3;
        if (d.fx === 'primacy') v += 1.5;
        if (d.fx === 'tide' || d.fx === 'smite') v += 1;
        if (d.fx === 'judgement') v += 2;
        if (d.fx === 'hammer' || d.fx === 'oath' || d.fx === 'ascension' || d.fx === 'grace') v += 1.5;
        if (d.fx === 'trickery' || d.fx === 'backstab' || d.fx === 'poison') v = 2;
        return v + (count('battle') < 2 ? 2 : 0) - (count('battle') > 4 ? 2 : 0);
      }
      case 'quest': {
        let v = c.glory / 2;
        if (d.fx === 'death') v -= 1;
        return v - count('quest') * 1.5;
      }
      case 'monster': return 3 + d.str * 0.8 + (d.fx === 'free' ? 1.5 : 0) + (mine && mine.up.monster.length >= 2 ? -3 : 0);
      case 'warrior': return mine && mine.up.warrior.length ? 2 : 5 + age * 0.5;
      case 'leader': return mine && mine.up.leader.length ? 2 : 4 + age * 0.5;
      case 'ship': return mine && mine.up.ship.length ? 1 : 3;
      case 'clan': return (CLAN_VAL[d.key] || 2) + (mine && mine.up.clan.length >= 3 ? -2 : 0) +
        (d.mystic && mine && mysticsOut(pub, mine.id) < 2 ? 1.5 : 0);
    }
    return 1;
  }

  /* ---------------- where to put a figure ---------------- */
  function provScore(pub, id, to, hand, quests) {
    const P = provOf(pub, to);
    if (!P) return -99;
    const late = me(pub, id).rage <= 3;
    let s = 0;
    if (!P.pillaged) s += 2 + tokenVal(pub, id, P.token) * 0.6;
    const realm = D.prov(to).realm;
    const qs = (quests || []).concat(hand || []).filter(c => D.CARDS[c.key].kind === 'quest');
    for (const q of qs) {
      const d = D.CARDS[q.key];
      if (d.fx === 'realm' && d.realm === realm) s += 2;
      if (d.fx === 'ygg' && to === 'ygg') s += 2;
    }
    const foe = enemyMax(pub, id, to), mine = str(pub, id, to);
    /* an unpillaged province with a rival in it is a fight worth setting up,
       as long as we would be the bigger side once we arrive */
    if (foe > 0 && !P.pillaged) s += (mine + 2 > foe) ? 2.5 : -foe * 0.6;
    else s -= foe * 0.5;
    s += mine > 0 && mine <= foe ? 1.5 : 0;
    if (pub.doom === to) s += late ? 1.5 : -2;
    return s + wob(pub, id, 'at' + to + me(pub, id).rage, 3);
  }
  function fjordScore(pub, id, f, hand, quests) {
    const F = D.fjord(f);
    return Math.max.apply(null, F.supports.filter(p => alive(pub, p)).map(p => provScore(pub, id, p, hand, quests)).concat([-5]));
  }
  function bestPlace(pub, id, options, hand, quests) {
    let best = null, bs = -Infinity;
    for (const to of options) {
      const s = E.isFjord(to) ? fjordScore(pub, id, to, hand, quests) : provScore(pub, id, to, hand, quests);
      if (s > bs) { bs = s; best = to; }
    }
    return { to: best, score: bs };
  }

  /* ---------------- the turn ---------------- */
  function turn(pub, meView, pr) {
    const id = pr.seat;
    const p = me(pub, id);
    const L = pr.legal;
    const hand = meView.hand, quests = meView.quests;
    const mem = remember(pub, id);

    /* 1. Pillage what we can win. A lost battle is cheaper than it looks —
       the loser keeps its cards and its dead feed Valhalla — so even odds
       are worth a swing. */
    let bestP = null, bestPS = -Infinity;
    const myBest = hand.reduce((m, c) => Math.max(m, D.CARDS[c.key].kind === 'battle' ? D.CARDS[c.key].value : 0), 0);
    for (const prov of L.pillage.concat(L.repillage)) {
      if (mem.failed[prov] >= 2) continue;
      const again = L.pillage.indexOf(prov) < 0;
      const mine = str(pub, id, prov);
      const held = enemyMax(pub, id, prov), reach = adjacentEnemyReach(pub, id, prov);
      const foeCards = pub.players.some(q => q.id !== id && q.hand > 0 && (str(pub, q.id, prov) > 0 || reach > 0));
      const opposed = held > 0 || reach > 0;
      const L_ = lvl(pub, id);
      const margin = mine + myBest - held - reach * 0.5 - (foeCards && held > 0 ? cardGuess(pub.age) * 0.7 : 0);
      const tok = tokenVal(pub, id, provOf(pub, prov).token);
      const s = (opposed ? margin + 2 : 6) + tok - (again ? 3 : 0) + wob(pub, id, 'pil' + prov + p.rage, 3);
      const nerve = L_ === 'easy' ? -3 : 0;
      if ((!opposed || margin >= nerve) && s > bestPS) { bestPS = s; bestP = prov; }
    }
    if (bestP) {
      if (enemyMax(pub, id, bestP) > 0) mem.failed[bestP] = (mem.failed[bestP] || 0) + 1;
      return { t: L.pillage.indexOf(bestP) >= 0 ? 'pillage' : 'repillage', prov: bestP };
    }

    /* 2. A good upgrade, early. */
    const ups = L.upgrade.map(u => {
      const c = hand.find(x => x.id === u.card);
      let v = cardValue(pub, p, c, hand) - u.cost * 0.6;
      let replace = null;
      if (u.replace.length) {
        const worst = u.replace.map(r => ({ r, v: cardValue(pub, p, { key: p.up[D.CARDS[c.key].kind].find(x => x.id === r).key }, []) }))
          .sort((a, b) => a.v - b.v)[0];
        v -= worst.v + 1;
        replace = worst.r;
      }
      return { u, v, replace };
    }).filter(x => x.v > 2).sort((a, b) => b.v - a.v);
    const skipUp = h01(id + '|up|' + pub.age + '|' + p.rage + '|' + hand.length) < (SLIP[lvl(pub, id)] || 0);
    if (!skipUp && ups.length && (p.rage >= 3 || ups[0].u.cost === 0)) return { t: 'upgrade', card: ups[0].u.card, replace: ups[0].replace };

    /* 3. Commit a quest we are on track for (free, but a turn). */
    for (const cid of L.quest) {
      const c = hand.find(x => x.id === cid);
      const d = D.CARDS[c.key];
      let on = false;
      if (d.fx === 'realm') on = pub.provs.some(x => !x.destroyed && D.prov(x.id).realm === d.realm && str(pub, id, x.id) > enemyMax(pub, id, x.id));
      if (d.fx === 'ygg') on = str(pub, id, 'ygg') > enemyMax(pub, id, 'ygg');
      if (d.fx === 'death') on = p.valhalla.length >= 2;
      if (d.fx === 'wide') on = pub.provs.filter(x => !x.destroyed && str(pub, id, x.id) > enemyMax(pub, id, x.id)).length >= 2;
      const near = d.fx === 'realm' && pub.figs.some(f => f.owner === id && D.prov(f.at) && D.prov(f.at).realm === d.realm);
      if (on || near || p.rage <= 2 || L.quest.length >= 2) return { t: 'quest', card: cid };
    }

    /* 4. Invade. Leaders first (free), then the cheapest useful figure. */
    const inv = L.invade.map(x => {
      const figStr = x.kind === 'leader' ? 3 : x.kind === 'ship' ? 2 : x.kind === 'mystic' ? 2 : x.kind === 'monster' ? D.CARDS[x.key].str : 1;
      const roomy = x.to.filter(t => { const P = provOf(pub, t); return E.isFjord(t) || t === 'ygg' || (P && P.room > 0); });
      const pl = roomy.length ? bestPlace(pub, id, roomy, hand, quests) : { to: null, score: -Infinity };
      let best = { x, to: pl.to, s: pl.score + figStr * 0.7 - (pl.to ? x.costs[x.to.indexOf(pl.to)] : 0) * 0.8 };
      /* Odin's Chosen: taking a village from the enemy who holds the province is worth more than an empty one */
      for (const t in (x.victims || {})) {
        const vs = x.victims[t].slice().sort((a, b) => (b.kind === 'mystic') - (a.kind === 'mystic') || str(pub, b.owner, t) - str(pub, a.owner, t));
        const sc = provScore(pub, id, t, hand, quests) + 2.5 + figStr * 0.7;
        if (sc > best.s) best = { x, to: t, s: sc, victim: vs[0].fig };
      }
      return best;
    }).filter(c => c.to).sort((a, b) => b.s - a.s);
    const invOrder = c => Object.assign({ t: 'invade', fig: c.x.fig, to: c.to }, c.victim ? { victim: c.victim } : {});
    if (inv.length && inv[0].s > -3) return invOrder(inv[0]);

    /* 5. Out of Valhalla. */
    if (L.valhalla.length && p.rage >= 2) {
      const v = L.valhalla[0];
      return { t: 'valhalla', fig: v.fig, to: bestPlace(pub, id, v.to, hand, quests).to };
    }

    /* 6. March the strongest group to an unpillaged province we would win. */
    for (const m of L.march) {
      for (const t of m.to) {
        const P = provOf(pub, t.prov);
        if (P.pillaged) continue;
        if (provOf(pub, m.from) && !provOf(pub, m.from).pillaged && str(pub, id, m.from) > enemyMax(pub, id, m.from)) continue;
        const figs = m.figs.slice(0, t.room);
        if (figs.length >= 2 && enemyMax(pub, id, t.prov) < figs.length + 1) return { t: 'march', from: m.from, to: t.prov, figs };
      }
    }

    /* 7. Quests we have been sitting on. */
    if (L.quest.length) return { t: 'quest', card: L.quest[0] };
    /* 8. Rage left over is wasted at the end of the Age: put anything on the
       board, or walk a group in beside an enemy to pick a fight next turn. */
    if (inv.length) return invOrder(inv[0]);
    for (const m of L.march) {
      for (const t of m.to) {
        const P = provOf(pub, t.prov);
        if (P.pillaged || t.prov === m.from) continue;
        const figs = m.figs.slice(0, t.room);
        if (enemyMax(pub, id, t.prov) > 0 && str(pub, id, m.from) >= enemyMax(pub, id, t.prov)) return { t: 'march', from: m.from, to: t.prov, figs };
      }
    }
    return { t: 'pass' };
  }

  /* ---------------- battles ---------------- */
  function battleCard(pub, meView, pr) {
    const id = pr.seat;
    const b = pub.battle;
    const hand = meView.hand;
    if (h01(id + '|wild|' + pub.age + '|' + b.prov + '|' + hand.length) < (WILD[lvl(pub, id)] || 0)) {
      const k = Math.floor(h01(id + '|bc|' + pub.age + '|' + b.prov + '|' + hand.map(c => c.key).join()) * hand.length);
      return { t: 'card', card: hand[Math.min(k, hand.length - 1)].id };
    }
    const mine = b.totals[id].figs;
    let foe = 0;
    for (const o of b.parts) {
      if (o === id) continue;
      const shown = b.open && (b.ready || []).indexOf(o) >= 0 && b.totals[o].total != null;
      foe = Math.max(foe, shown ? b.totals[o].total : b.totals[o].figs + (me(pub, o).hand > 0 ? cardGuess(pub.age) : 0));
    }
    const battles = hand.filter(c => D.CARDS[c.key].kind === 'battle')
      .map(c => ({ c, v: D.CARDS[c.key].fx === 'sight' ? cardGuess(pub.age) : D.CARDS[c.key].value }))
      .sort((a, b2) => a.v - b2.v);
    const winners = battles.filter(x => mine + x.v > foe);
    if (winners.length) return { t: 'card', card: winners[0].c.id };
    /* Lost anyway: a Loki card pays for losing, and anything else comes back. */
    const loki = hand.find(c => ['trickery', 'backstab', 'poison'].indexOf(D.CARDS[c.key].fx) >= 0);
    if (loki) return { t: 'card', card: loki.id };
    const cheap = hand.slice().sort((a, b2) => cardValue(pub, me(pub, id), a, hand) - cardValue(pub, me(pub, id), b2, hand));
    if (battles.length && mine + battles[battles.length - 1].v >= foe - 1) return { t: 'card', card: battles[battles.length - 1].c.id };
    return { t: 'card', card: cheap[0].id };
  }

  function late(pub, meView, pr) {
    const id = pr.seat;
    if (lvl(pub, id) === 'easy') return { t: 'pass' };
    const T = pr.totals || {};
    const mineT = T[id] ? T[id].total : 0;
    let foe = 0;
    for (const o in T) if (o !== id) foe = Math.max(foe, T[o].total);
    const cards = meView.promptCards || [];
    for (const c of cards.sort((a, b) => D.CARDS[a.key].value - D.CARDS[b.key].value)) {
      if (mineT <= foe && mineT + D.CARDS[c.key].value > foe) return { t: 'late', card: c.id };
    }
    return { t: 'pass' };
  }

  function join(pub, meView, pr) {
    const id = pr.seat;
    const b = pub.battle;
    const involved = b && (b.pillager === id || pub.figs.some(f => f.owner === id && (f.at === pr.prov)));
    if (!involved || !pr.options.length) return { t: 'pass' };
    /* don't leave a province we are holding for a quest undefended by the last figure */
    const best = pr.options.slice().sort((a, c) => figVal(c) - figVal(a))[0];
    return { t: 'join', fig: best.fig, from: best.from };
  }
  function figVal(o) { return o.kind === 'monster' ? D.CARDS[o.key].str : o.kind === 'leader' ? 3 : o.kind === 'mystic' ? 2 : 1; }

  /* Where to send a god we have just pillaged past: the kind ones where we are
     strong, the ones that blunt a strong side where the others are. */
  function godTo(pub, id, pr) {
    const kind = pr.god === 'odin' || pr.god === 'thor' || pr.god === 'frigga';
    let best = pr.options[0], bs = -Infinity;
    for (const t of pr.options) {
      const mine = str(pub, id, t), foe = enemyMax(pub, id, t);
      const sc = kind ? mine - foe * 0.5 : foe - mine;
      if (sc > bs) { bs = sc; best = t; }
    }
    return { t: 'god', to: best };
  }

  function stat(pub, meView, pr) {
    const p = me(pub, pr.seat);
    const L_ = lvl(pub, pr.seat);
    if (L_ === 'easy') return { t: 'stat', stat: pr.options[Math.floor(h01(pr.seat + '|st|' + pub.age + '|' + JSON.stringify(p.stats)) * pr.options.length)] };
    if (hard(pub, pr.seat)) {
      /* a step that crosses a bonus line (+10 at step 4, +20 at step 6) first, then Rage early, Horns, Axes late */
      const cross = pr.options.filter(s2 => p.stats[s2] === 2 || p.stats[s2] === 4).sort((a, b) => p.stats[b] - p.stats[a]);
      if (cross.length && (pub.age >= 2 || p.stats[cross[0]] === 4)) return { t: 'stat', stat: cross[0] };
    }
    const order = pub.age >= 3 ? ['axes', 'rage', 'horns'] : ['rage', 'horns', 'axes'];
    const opts = pr.options.slice().sort((a, b) => (p.stats[a] - p.stats[b]) || (order.indexOf(a) - order.indexOf(b)));
    /* push a stat over a bonus line if it is one step away */
    const near = pr.options.find(s => p.stats[s] === 2 || p.stats[s] === 4);
    return { t: 'stat', stat: (pub.age === 3 && near) ? near : opts[0] };
  }

  /* ---------------- dispatch ---------------- */
  function answer(pub, meView, pr) {
    const id = pr.seat;
    switch (pr.t) {
      case 'draft': {
        const cards = (meView.promptCards || []).slice();
        const p = me(pub, id);
        const hand = meView.hand.slice();
        const out = [];
        for (let k = 0; k < pr.need; k++) {
          cards.sort((a, b) => cardValue(pub, p, b, hand) - cardValue(pub, p, a, hand));
          const c = cards.shift();
          out.push(c.id);
          hand.push(c);
        }
        return { t: 'draft', cards: out };
      }
      case 'turn': return turn(pub, meView, pr);
      case 'card': return battleCard(pub, meView, pr);
      case 'late': return late(pub, meView, pr);
      case 'join': return join(pub, meView, pr);
      case 'stat': return stat(pub, meView, pr);
      case 'keep': {
        const p = me(pub, id);
        const cards = (meView.promptCards || []).slice().sort((a, b) => cardValue(pub, p, b, []) - cardValue(pub, p, a, []));
        return { t: 'keep', card: cards[0].id };
      }
      case 'tide': {
        const best = pr.options.slice().sort((a, b) => figVal(b) - figVal(a))[0];
        return { t: 'keep', fig: best.fig };
      }
      case 'protect': {
        const p = me(pub, id);
        const n = Math.min(pr.max, pr.options.length, Math.max(1, p.rage - 1));
        return { t: 'protect', figs: pr.options.slice(0, n) };
      }
      case 'prowess': {
        const cards = (meView.promptCards || []).filter(c => D.CARDS[c.key].kind === 'battle' && D.CARDS[c.key].value >= 4);
        return { t: 'prowess', cards: cards.slice(0, Math.min(pr.max, 1)).map(c => c.id) };
      }
      case 'place': {
        if (pr.move) {
          const good = pr.options.find(to => { const P = provOf(pub, to); return P && !P.pillaged && enemyMax(pub, id, to) === 0; });
          return good ? { t: 'place', to: good } : { t: 'skip' };
        }
        const pl = bestPlace(pub, id, pr.options, meView.hand, meView.quests);
        return pl.to && pl.score > -4 ? { t: 'place', to: pl.to } : { t: 'skip' };
      }
      case 'retreat': {
        const pl = bestPlace(pub, id, pr.options, meView.hand, meView.quests);
        return pl.to ? { t: 'retreat', to: pl.to } : { t: 'stay' };
      }
      case 'god': return godTo(pub, id, pr);
      case 'yesno': {
        if (pr.q === 'thordomain') return { t: enemyMax(pub, id, pr.prov) < str(pub, id, pr.prov) ? 'yes' : 'no' };
        return { t: 'yes' };
      }
    }
    return { t: 'pass' };
  }

  root.BRBots = { answer, cardValue };
})(typeof window !== 'undefined' ? window : globalThis);
