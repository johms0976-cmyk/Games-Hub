'use strict';
/* Radlands — the house. Decides from (publicView, seatView) and nothing
   else: it never sees your hand or what a punk really is (its own included).
   No reaches into the Game; tests/engine.js greps this file for them.

   One brain, three levels (LESSONS-CHECKLIST G1). Every candidate move gets a
   value in one currency — "points of advantage", water costing WATER each —
   and the house takes the best move worth more than ending the turn.
   Medium and Easy are the same brain made sloppier: misjudged values (NOISE),
   forgotten good moves (SLIP), and Easy also loses the plan that makes the
   house good (protecting its camps, finishing damaged camps first). */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./rl-data.js') : root.RadData;
  const VERSION = 1;
  const WATER = 2.4;

  /* What each person is worth on the board. */
  const WORTH = {
    zeto_khan: 5, vera_vosh: 6, molgur_stang: 9, magnus_karv: 7, karli_blaze: 6, argo_yesky: 7,
    wounded_soldier: 3, vigilante: 3.5, vanguard: 4, sniper: 6, scout: 4, scientist: 3, rescue_team: 2.5,
    repair_bot: 4, rabble_rouser: 4.5, pyromaniac: 4.5, mutant: 4, muse: 5, mimic: 5, looter: 5,
    holdout: 4, gunner: 5, exterminator: 4, doomsayer: 3, cult_leader: 3, assassin: 6
  };
  const CAMP = {
    watchtower: 3, warehouse: 5, victory_totem: 7, transplant_lab: 4, training_camp: 4, supply_depot: 6, scud_launcher: 5,
    scavenger_camp: 6, resonator: 6, reactor: 4, railgun: 8, pillbox: 6, parachute_base: 5, outpost: 7, omen_clock: 4,
    the_octagon: 4, obelisk: -8, oasis: 4, nest_of_spies: 4, mulcher: 4, mercenary_camp: 6, labor_camp: 4, juggernaut: 6,
    garage: 6, construction_yard: 3, command_post: 6, catapult: 6, cannon: 6, cache: 5, bonfire: 4, blood_bank: 5,
    atomic_garden: 5, arcade: 5, adrenaline_lab: 4
  };
  const LEVEL = { hard: { noise: 0, slip: 0, plan: true }, medium: { noise: 0.35, slip: 0.12, plan: true }, easy: { noise: 0.9, slip: 0.3, plan: false } };

  /* Noise is a hash of what is being decided — never Math.random — so seeded
     games, holds and undo-by-replay all stay reproducible. */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

  function ctx(pub, me) {
    const mine = pub.players.find(p => p.id === me.id);
    const them = pub.players.find(p => p.id !== me.id);
    const lv = LEVEL[mine.level] || LEVEL.medium;
    return { pub, me, mine, them, lv };
  }
  const liveCamps = p => p.camps.filter(c => !c.dead);
  const peopleOf = p => { const o = []; p.cols.forEach(col => col.forEach(e => { if (e.kind === 'person') o.push(e); })); return o; };
  const worthOf = e => e.punk ? 1.5 : (WORTH[D.typeOf(e.card)] || 3);
  const campOfUid = (p, uid) => p.camps.find(c => c.uid === uid);
  /* Exposed cards of p, as an attacker sees them. */
  function exposed(p, all) {
    const out = [];
    p.cols.forEach((col, k) => col.forEach((e, i) => {
      if (e.kind === 'camp') { const c = campOfUid(p, e.uid); if (c.dead) return; if (all || i === col.length - 1) out.push({ kind: 'camp', c, col: k }); return; }
      if (all || i === col.length - 1) out.push({ kind: 'person', e, col: k });
    }));
    return out;
  }
  /* How good is it to damage this card of the opponent's? */
  function hitValue(x, them, plan) {
    if (x.kind === 'camp') {
      const left = liveCamps(them).length;
      if (x.c.dmg) return left === 1 ? 1000 : (plan ? 32 : 20);
      return left === 1 ? 26 : 13;
    }
    const w = worthOf(x.e);
    if (x.e.punk) return 3.5;
    return x.e.dmg ? w * 2 + 3 : w + 2.5;
  }
  function bestHit(C, kind, o) {
    o = o || {};
    const hg = C.pub.hg === C.mine.id;
    let best = 0;
    for (const x of exposed(C.them, o.any || hg)) {
      if (kind === 'person' && x.kind !== 'person') continue;
      if (kind === 'camp' && x.kind !== 'camp') continue;
      if (o.dmgOnly && !(x.kind === 'camp' ? x.c.dmg : x.e.dmg)) continue;
      best = Math.max(best, o.kill ? (x.kind === 'camp' ? hitValue({ kind: 'camp', c: Object.assign({}, x.c, { dmg: true }) }, C.them, true) : worthOf(x.e) * 2 + 3) : hitValue(x, C.them, C.lv.plan));
    }
    return best;
  }
  function bestRestore(C, peopleOnly) {
    let best = 0;
    for (const e of peopleOf(C.mine)) if (e.dmg) best = Math.max(best, worthOf(e) + 2);
    if (!peopleOnly) for (const c of C.mine.camps) if (c.dmg && !c.dead && c.id !== 'bonfire') best = Math.max(best, liveCamps(C.mine).length === 1 ? 22 : 12);
    return best;
  }
  const cheapestOwn = C => { const ps = peopleOf(C.mine); return ps.length ? Math.min.apply(null, ps.map(worthOf)) : 99; };
  /* Hurting one of my own camps ("this camp takes a damage"). */
  function selfCampCost(C, uid) {
    const c = campOfUid(C.mine, uid);
    if (!c) return 0;
    if (!c.dmg) return 6;
    return liveCamps(C.mine).length === 1 ? 2000 : 40;
  }
  function raidValue(C) {
    const at = C.mine.q.indexOf('raiders');
    const their = liveCamps(C.them);
    const strike = their.every(c => c.dmg) ? (their.length === 1 ? 1000 : 30) : 12;
    if (at === 0) return strike;
    if (at < 0) return 5.5;
    return C.mine.q[at - 1] ? 0 : 5;
  }

  /* An ability's value, by the card that owns it. */
  function abilityValue(C, card, k, src) {
    const them = C.them, mine = C.mine;
    const camp = src && src.camp;
    switch (card) {
      case 'molgur_stang': return liveCamps(them).length === 1 ? 1000 : 34;
      case 'magnus_karv': {
        let best = 0;
        them.cols.forEach(col => { let v = 0; col.forEach(e => { if (e.kind === 'camp') { const c = campOfUid(them, e.uid); if (!c.dead) v += hitValue({ kind: 'camp', c }, them, C.lv.plan); } else v += hitValue({ kind: 'person', e }, them); }); best = Math.max(best, v); });
        return best;
      }
      case 'sniper': return bestHit(C, 'any', { any: true });
      case 'catapult': return bestHit(C, 'any', { any: true }) - cheapestOwn(C) - 1;
      case 'vera_vosh': case 'vigilante': case 'victory_totem': if (card === 'victory_totem' && k === 1) return raidValue(C); return bestHit(C, 'person');
      case 'vanguard': return bestHit(C, 'any') - 7;
      case 'scout': case 'garage': return raidValue(C);
      case 'outpost': return k === 0 ? raidValue(C) : bestRestore(C);
      case 'scavenger_camp': return k === 0 ? raidValue(C) : bestRestore(C);
      case 'scientist': return 4.5;
      case 'rescue_team': return -1;
      case 'repair_bot': case 'transplant_lab': return bestRestore(C);
      case 'atomic_garden': return bestRestore(C, true) + 2;
      case 'rabble_rouser': return k === 0 ? 5 : bestHit(C, 'any');
      case 'pyromaniac': return bestHit(C, 'camp');
      case 'mutant': return Math.max(bestHit(C, 'any'), 0) + Math.max(bestRestore(C), 0) - 4;
      case 'muse': return WATER * 0.9;
      case 'mimic': return 0;   // decided when the copy is chosen
      case 'looter': return bestHit(C, 'any') + 2;
      case 'gunner': { let v = 0; exposed(them, C.pub.hg === mine.id).forEach(x => { if (x.kind === 'person') v += hitValue(x, them); }); return v; }
      case 'exterminator': return peopleOf(them).filter(e => e.dmg).reduce((s, e) => s + worthOf(e) * 2 + 3, 0);
      case 'cult_leader': return bestHit(C, 'any') - cheapestOwn(C) - 1;
      case 'assassin': return bestHit(C, 'person', { kill: true });
      case 'zeto_khan': return 6;
      case 'watchtower': case 'railgun': case 'pillbox': case 'command_post': case 'nest_of_spies': case 'doomsayer':
      case 'karli_blaze': case 'argo_yesky': case 'wounded_soldier': case 'holdout': return bestHit(C, 'any');
      case 'cannon': return bestHit(C, 'any') - selfCampCost(C, src.uid);
      case 'warehouse': return 5 - selfCampCost(C, src.uid);
      case 'cache': return 6 - selfCampCost(C, src.uid);
      case 'bonfire': return bestRestore(C) * 1.2 - selfCampCost(C, src.uid);
      case 'supply_depot': return 8;
      case 'training_camp': return 6;
      case 'scud_launcher': return 4;
      case 'mercenary_camp': return 8;
      case 'resonator': return bestHit(C, 'any', { dmgOnly: true });
      case 'reactor': {
        const theirs = peopleOf(them).reduce((s, e) => s + worthOf(e) * 2, 0), ours = peopleOf(mine).reduce((s, e) => s + worthOf(e) * 2, 0);
        return theirs - ours - (liveCamps(mine).length === 1 ? 2000 : 30);
      }
      case 'parachute_base': return 6;
      case 'omen_clock': return mine.q[0] ? 8 : (mine.q[1] && !mine.q[0] ? 3 : -1);
      case 'the_octagon': { const t = peopleOf(them); return t.length ? Math.min.apply(null, t.map(worthOf)) * 2 - cheapestOwn(C) * 2 : -5; }
      case 'mulcher': return 6 - cheapestOwn(C);
      case 'labor_camp': return bestRestore(C) - cheapestOwn(C);
      case 'blood_bank': return WATER - cheapestOwn(C) + 0.5;
      case 'juggernaut': { const c = campOfUid(mine, src.uid); return c && c.moves >= 2 ? (liveCamps(them).length === 1 ? 1000 : 34) : 4; }
      case 'construction_yard': return mine.camps.some(c => c.dead) ? 12 : -5;
      case 'arcade': return 5;
      case 'adrenaline_lab': return 5;
    }
    return 2;
  }
  function eventValue(C, card) {
    const them = C.them, mine = C.mine;
    const sum = (list, f) => list.reduce((s, e) => s + f(e), 0);
    switch (D.typeOf(card)) {
      case 'uprising': return [0, 1, 2].reduce((s, k) => s + Math.max(0, 2 - mine.cols[k].filter(e => e.kind === 'person').length), 0) >= 2 ? 13 : 5;
      case 'truce': return sum(peopleOf(them), e => worthOf(e) * 0.8) - sum(peopleOf(mine), e => worthOf(e) * 0.5);
      case 'strafe': { let v = 0; exposed(them, false).forEach(x => { if (x.kind === 'person') v += hitValue(x, them); }); return v; }
      case 'radiation': return sum(peopleOf(them), e => e.punk ? 3 : worthOf(e) + 2) - sum(peopleOf(mine), e => e.punk ? 3 : worthOf(e) + 2);
      case 'napalm': { let best = 0; them.cols.forEach(col => { best = Math.max(best, col.filter(e => e.kind === 'person').reduce((s, e) => s + worthOf(e) * 2 + 2, 0)); }); return best; }
      case 'interrogate': return 9;
      case 'high_ground': return 9;
      case 'famine': {
        const loss = p => { const ws = peopleOf(p).map(worthOf).sort((a, b) => b - a); return ws.slice(1).reduce((s, w) => s + w * 2, 0); };
        return loss(them) - loss(mine);
      }
      case 'bombardment': return liveCamps(them).reduce((s, c) => s + (c.dmg ? 30 : 12), 0) + 4;
      case 'banish': { const ps = peopleOf(them); return ps.length ? Math.max.apply(null, ps.map(e => worthOf(e) * 2 + 3)) : 0; }
    }
    return 0;
  }
  function junkValue(C, fx, can) {
    switch (fx) {
      case 'damage': return bestHit(C, 'any');
      case 'injure': return bestHit(C, 'person');
      case 'restore': return bestRestore(C);
      case 'draw': return 5.5;
      case 'water': return can.use.some(u => !u.ok && /^Costs (\d+) water/.test(u.why || '') && +RegExp.$1 <= can.water + 1) || can.hand.some(h => h.play && !h.play.ok && h.play.cost <= can.water + 1) ? WATER * 0.9 : 0.5;
      case 'punk': return [0, 1, 2].some(k => C.mine.cols[k].filter(e => e.kind === 'person').length < 2) ? 4.5 : 0;
      case 'raid': return raidValue(C);
    }
    return 0;
  }
  /* Where a person should stand: cover an open camp (a damaged one first),
     the valuable one behind. */
  function bestPlace(C, places, type) {
    let best = null, bv = -1e9;
    const w = type ? (WORTH[type] || 3) : 1.5;
    for (const o of places) {
      const col = C.mine.cols[o.col];
      const camp = C.mine.camps[o.col];
      const n = col.filter(e => e.kind === 'person').length;
      let v = -o.cost * WATER;
      if (C.lv.plan) {
        if (n === 0 && !camp.dead) v += camp.dmg ? 9 : 6;
        if (camp.dead) v -= 2;
      }
      if (n === 1) { const front = o.at === col.length; v += front ? (w < 4 ? 1 : -1) : (w >= 4 ? 1.5 : -0.5); }
      if (v > bv) { bv = v; best = o; }
    }
    return { o: best, v: bv };
  }
  function playValue(C, h, can) {
    const type = D.typeOf(h.card);
    if (h.kind === 'event') return eventValue(C, h.card) * (h.play.now ? 1 : Math.pow(0.88, h.play.slot)) - h.play.cost * WATER;
    let v = (WORTH[type] || 3) + 1.5;
    if (type === 'wounded_soldier') v += 2;
    if (type === 'vanguard' || type === 'argo_yesky') v += 3;
    if (type === 'repair_bot') v += bestRestore(C) * 0.8;
    if (h.play.full) return v - h.play.cost * WATER - cheapestOwn(C) * 1.2 - 2;
    const pl = bestPlace(C, h.play.places.filter(o => o.cost <= can.water), type);
    return pl.o ? v + pl.v : -99;
  }

  function noisy(C, key, v) {
    if (!C.lv.noise || v >= 500) return v;
    const r = hash(C.me.id + '|' + C.pub.turnN + '|' + key) * 2 - 1;
    return v + r * C.lv.noise * Math.max(3, Math.abs(v));
  }

  /* ---------------- the turn ---------------- */
  function turnAnswer(C, view) {
    const can = C.me.can;
    if (!can) return { t: 'end', n: view.n };
    const cands = [];
    const add = (a, v, key) => cands.push({ a: Object.assign({ n: view.n }, a), v: noisy(C, key, v), key });
    for (const u of can.use) {
      if (!u.ok) continue;
      let v = abilityValue(C, u.card, u.k, u);
      if (u.card === 'mimic') {
        /* worth the best ability it could copy, less what that costs */
        v = 0;
        const consider = (e, ok) => { if (!ok || e.punk) return; const def = D.card(e.card); if (!def || !def.ab) return; def.ab.forEach((ab, k) => { if (ab.cost == null) return; v = Math.max(v, abilityValue(C, def.id, k, null) - ab.cost * WATER); }); };
        peopleOf(C.mine).forEach(e => consider(e, e.ready && e.uid !== u.uid));
        peopleOf(C.them).forEach(e => consider(e, !e.dmg));
        v += (u.cost || 0) * WATER;
      }
      v -= (u.cost || 0) * WATER;
      add({ t: 'use', uid: u.uid, k: u.k }, v, 'use' + u.uid + u.k);
    }
    for (const h of can.hand) {
      if (h.play && h.play.ok) {
        const v = playValue(C, h, can);
        if (h.kind === 'event') add({ t: 'play', card: h.card }, v, 'ev' + h.card);
        else if (h.play.full) {
          const ps = peopleOf(C.mine);
          const victim = h.play.destroy.slice().sort((a, b) => worthOf(ps.find(e => e.uid === a.uid) || {}) - worthOf(ps.find(e => e.uid === b.uid) || {}))[0];
          if (victim) add({ t: 'play', card: h.card, destroy: victim.uid }, v, 'pl' + h.card);
        } else {
          const pl = bestPlace(C, h.play.places.filter(o => o.cost <= can.water), D.typeOf(h.card));
          if (pl.o) add({ t: 'play', card: h.card, col: pl.o.col, at: pl.o.at }, v, 'pl' + h.card);
        }
      }
      if (h.junk && h.junk.ok) {
        const type = D.typeOf(h.card);
        const keep = h.card === 'silo' ? 0 : (h.kind === 'person' ? (WORTH[type] || 3) * 0.55 + 1 : Math.max(2, eventValue(C, h.card) * 0.5));
        const tookSilo = h.card === 'silo' && C.pub.log.some(e => e.tn === C.pub.turnN && e.t === 'silo' && e.by === C.me.id);
        if (!tookSilo) add({ t: 'junk', card: h.card }, junkValue(C, h.junk.fx, can) - keep - (h.card === 'silo' ? 0.4 : 0), 'jk' + h.card);
      }
    }
    if (can.draw.ok) add({ t: 'draw' }, 5.5 - 2 * WATER * 0.9, 'draw');
    const junkedSilo = C.pub.log.some(e => e.tn === C.pub.turnN && e.t === 'junk' && e.card === 'silo' && e.by === C.me.id);
    if (can.silo.ok && !junkedSilo) add({ t: 'silo' }, can.water === 1 ? 1.2 : -0.5, 'silo');
    cands.sort((a, b) => b.v - a.v);
    let pickI = 0;
    if (C.lv.slip && cands.length > 1 && cands[0].v < 500 && hash(C.me.id + '|slip|' + C.pub.turnN + '|' + cands[0].key) < C.lv.slip) pickI = 1;
    const best = cands[pickI];
    if (!best || best.v <= 0.2) return { t: 'end', n: view.n };
    return best.a;
  }

  /* ---------------- questions ---------------- */
  function optValue(C, o, what) {
    const t = o.tgt;
    if (t) {
      if (t.side === 'opp') {
        const p = C.them;
        if (t.camp) { const c = p.camps.find(x => x.uid === o.id); return hitValue({ kind: 'camp', c: c || { dmg: t.dmg } }, p, C.lv.plan); }
        const e = peopleOf(p).find(x => x.uid === o.id) || { punk: t.punk, card: t.card, dmg: t.dmg };
        if (what === 'destroy') return worthOf(e) * 2 + 3;
        return hitValue({ kind: 'person', e }, p);
      }
      /* my own card */
      if (t.camp) { const c = C.mine.camps.find(x => x.uid === o.id) || {}; return (c.dmg ? 40 : 10) + (CAMP[c.id] || 4); }
      const e = peopleOf(C.mine).find(x => x.uid === o.id) || { punk: t.punk, card: t.card };
      return worthOf(e) + (e.dmg ? -1 : 0);
    }
    return 0;
  }
  function argmax(list, f) { let b = null, bv = -1e18; for (const x of list) { const v = f(x); if (v > bv) { bv = v; b = x; } } return b; }
  function argmin(list, f) { return argmax(list, x => -f(x)); }

  function pickAnswer(C, view) {
    const legal = view.options.filter(o => !o.bad);
    const n = view.n;
    const one = o => o ? { t: 'pick', n, id: o.id } : (view.skip ? { t: 'skip', n } : { t: 'pick', n, id: legal[0] && legal[0].id });
    const many = ids => ({ t: 'pick', n, ids });
    const handWorth = id => { const c = D.card(id); if (!c) return 0; return c.kind === 'person' ? (WORTH[c.id] || 3) : Math.max(1, eventValue(C, id) * 0.6); };
    switch (view.what) {
      case 'camps': {
        const ids = legal.slice().sort((a, b) => (CAMP[b.id] + D.card(b.id).draw * 1.6) - (CAMP[a.id] + D.card(a.id).draw * 1.6)).slice(0, view.max).map(o => o.id);
        return many(ids);
      }
      case 'damage': case 'injure': case 'destroy': case 'hitback':
        return one(argmax(legal, o => optValue(C, o, view.what)));
      case 'restore': return one(argmax(legal, o => optValue(C, o, 'restore')));
      case 'restoreMany': return many(legal.map(o => o.id));
      case 'raided': case 'loseCamp':
        /* the least painful camp: an undamaged one, the least useful */
        return one(argmin(legal, o => { const c = C.mine.camps.find(x => x.uid === o.id) || {}; return (c.dmg ? 50 : 0) + (CAMP[c.id] || 4); }));
      case 'scud':
        return one(argmin(legal, o => {
          const t = o.tgt;
          if (t.camp) { const c = C.mine.camps.find(x => x.uid === o.id) || {}; return c.dmg ? 90 : 14 + (CAMP[c.id] || 4) * 0.3; }
          if (t.punk) return 2;
          const e = peopleOf(C.mine).find(x => x.uid === o.id) || {};
          return e.dmg ? worthOf(e) * 2 + 3 : worthOf(e) + 1;
        }));
      case 'mercenary': {
        const hand = C.me.hand.filter(x => x !== 'silo');
        const dis = legal.find(o => o.id === 'discard');
        const cheapest = argmin(legal.filter(o => o.id !== 'discard'), o => o.tgt.camp ? 60 : o.tgt.punk ? 1.5 : worthOf(peopleOf(C.mine).find(x => x.uid === o.id) || {}) * 1.5);
        const handCost = hand.map(handWorth).sort((a, b) => a - b).slice(0, 2).reduce((s, x) => s + x, 0);
        const cost = cheapest ? (cheapest.tgt.camp ? 60 : cheapest.tgt.punk ? 1.5 : worthOf(peopleOf(C.mine).find(x => x.uid === cheapest.id) || {}) * 1.5) : 999;
        return one(dis && handCost < cost ? dis : cheapest || dis);
      }
      case 'destroyOwn': case 'makeRoom':
        return one(argmin(legal, o => optValue(C, o, 'own')));
      case 'keep': return one(argmax(legal, o => optValue(C, o, 'own')));
      case 'place': {
        const places = legal.map(o => ({ id: o.id, col: +o.id.split(':')[0], at: +o.id.split(':')[1], cost: o.cost || 0 }));
        const b = bestPlace(C, places, null);
        return one(legal.find(o => b.o && o.id === b.o.id));
      }
      case 'rearrange': return one(argmin(legal, o => C.mine.cols[+o.id].filter(e => e.kind === 'person').length));
      case 'discard': {
        if (!view.multi) return one(argmin(legal, o => handWorth(o.id)));
        const k = view.min;
        const ids = legal.slice().sort((a, b) => handWorth(a.id) - handWorth(b.id)).slice(0, Math.max(k, Math.min(view.max, k))).map(o => o.id);
        return many(ids);
      }
      case 'column': {
        return one(argmax(legal, o => {
          const col = C.them.cols[+o.id];
          return col.reduce((s, e) => s + (e.kind === 'person' ? worthOf(e) * 2 : 0), 0) + (view.why.indexOf('Damage every') === 0 ? col.reduce((s, e) => { if (e.kind !== 'camp') return s; const c = campOfUid(C.them, e.uid); return s + (c && !c.dead ? hitValue({ kind: 'camp', c }, C.them, true) : 0); }, 0) : 0);
        }));
      }
      case 'mutant': return one(legal.find(o => o.id === 'dr') || legal[0]);
      case 'copy': {
        const b = argmax(legal, o => abilityValue(C, o.card, o.k, null) - (o.cost || 0) * WATER);
        return one(b);
      }
      case 'adrenaline': return one(argmax(legal, o => abilityValue(C, o.card, o.k, null) - (o.cost || 0) * WATER));
      case 'useNow': return one(legal[0] ? argmax(legal, o => -(o.cost || 0)) : null);
      case 'parachute': return one(argmax(legal, o => WORTH[D.typeOf(o.id)] || 3));
      case 'advance': return one(argmax(legal, o => (o.of === C.me.id ? 10 : -10) + (o.k === 0 ? 5 : 0)));
      case 'cache': return one(legal.find(o => o.id === 'restore' && bestRestore(C) > 9) || legal.find(o => o.id === 'draw'));
      case 'junkOf': {
        const b = argmax(legal, o => junkValue(C, o.fx, { use: [], hand: [], water: 0 }));
        return b && junkValue(C, b.fx, { use: [], hand: [], water: 0 }) > 1 ? one(b) : { t: 'skip', n };
      }
      case 'doomsayer': return one(legal.find(o => o.id === 'yes'));
      case 'rebuild': return one(argmax(legal, o => CAMP[(C.mine.camps.find(c => c.uid === o.id) || {}).id] || 0));
      case 'toHand': return one(argmax(legal, o => o.tgt && o.tgt.dmg ? 5 : 0));
    }
    if (view.multi) return many(legal.slice(0, view.min).map(o => o.id));
    return one(legal[0]);
  }

  function answer(pub, me, view) {
    const C = ctx(pub, me);
    if (view.t === 'turn') return turnAnswer(C, view);
    return pickAnswer(C, view);
  }
  /* A refused answer must never stall the table: the plainest legal one. */
  function fallback(pub, me, view) {
    if (view.t === 'turn') return { t: 'end', n: view.n };
    const legal = view.options.filter(o => !o.bad);
    if (view.multi) return { t: 'pick', n: view.n, ids: legal.slice(0, view.min).map(o => o.id) };
    if (legal.length) return { t: 'pick', n: view.n, id: legal[0].id };
    return { t: 'skip', n: view.n };
  }

  const Bots = { VERSION, answer, fallback, WORTH, CAMP, LEVEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.RadBots = Bots;
})(typeof window !== 'undefined' ? window : this);
