'use strict';
/* Glory to Rome — the house players.
 *
 * A house seat decides from (publicView, seatView) and nothing else: it
 * never sees another hand, the deck's order or what is in anybody's Vault
 * but its own. One brain, three levels (LESSONS-CHECKLIST G1): Hard is the
 * brain as well as it plays; Medium and Easy are the same brain with its
 * values jogged (`noise`), now and then a good move forgotten (`slip`), and
 * Easy also plays without its plan — it stops building towards the
 * materials its foundations need and stops weighing what a lead gives the
 * rest of the table. Noise is a hash of what is being decided, never
 * Math.random(), so seeded games replay exactly.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gtr-data.js') : root.GtrData;
  const VERSION = 1;
  const K = id => String(id).split('.')[0];
  const isJack = id => K(id) === 'jack';
  const matOf = id => D.matOf(K(id));
  const roleOf = id => D.roleOf(K(id));

  /* plan: 2 reads the table (what a lead hands the others, the Merchant
     Bonus race, when to end the game); 1 builds towards its own needs only;
     0 has no plan at all. */
  const LV = {
    hard:   { noise: 0,    slip: 0,    plan: 2, giveW: 1.5 },
    medium: { noise: 0.45, slip: 0.1,  plan: 1 },
    easy:   { noise: 1.2,  slip: 0.3,  plan: 0 }
  };
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /* What a finished building is worth to its owner beyond the influence:
     one number per building, in "actions" (a point of influence is ~1). */
  const FN = {
    bar: 0.7, insula: 1, latrine: 0.4, road: 0.8, castra: 0.2,
    dock: 0.8, market: 1.1, palisade: 0.7, crane: 0.6, circus: 0.9, domus: 0.7,
    academy: 0.8, archway: 1.2, atrium: 1.4, bath: 0.8, foundry: 1.3, gate: 0.6, school: 1.3, shrine: 1, castrapraetoria: 0.5, watermill: 0.6,
    amphitheatre: 1.4, aqueduct: 1.1, bridge: 1, storeroom: 1, tower: 1.4, vomitorium: 0.4, wall: 1.6, tribunal: 0.8, senate: 0.6, solarium: 0.5, aerarium: 0.8,
    catacomb: 0, circusmaximus: 1.8, garden: 1.6, prison: 0.6, scriptorium: 1.5, sewer: 1.1, villa: 1.3, domusaurea: 1, colosseum: 1.2, watchpost: 0.1, bacchanalia: 1,
    basilica: 1.3, fountain: 1.4, ludusmagnus: 1, palace: 1.4, stairway: 0.5, statue: 3, temple: 1.8, forumromanum: 1.5, forum: 2, triclinium: 0.6, plebeiancouncil: 0.8
  };

  function ctx(pub, me) {
    const p = pub.players.find(x => x.id === me.id);
    const others = pub.players.filter(x => x.id !== me.id);
    const has = k => p.powers.indexOf(k) >= 0;
    const lv = LV[p.level] || LV.medium;
    /* What my unfinished buildings still need, by material. */
    const need = {};
    for (const b of p.builds) {
      if (b.done) continue;
      const left = Math.max(0, b.need - b.mats.length);
      need[b.site] = (need[b.site] || 0) + left;
      if (b.card === 'statue') need.marble = (need.marble || 0) + left * 0.5;
      if (has('scriptorium')) need.marble = (need.marble || 0) + 0.6;
      if (has('road') && D.matOf(b.card) === 'stone') D.MATS.forEach(m => { need[m] = (need[m] || 0) + left * 0.3; });
    }
    const open = p.builds.filter(b => !b.done).length;
    /* Turns left, roughly: the deck goes ~2.4 cards a turn, the in-town
       sites one every ~2.5 turns. */
    const R = Math.max(1, Math.min(pub.deckN / 2.4, pub.inTown * 2.5));
    const late = R < 12;
    const myVault = (me.vault || []).reduce((s2, k) => s2 + (k ? D.card(k).value : 2), 0);
    const myTotal = p.inf + myVault;
    const lead = myTotal - Math.max.apply(null, others.map(o => o.inf + o.vaultN * 2));
    return { pub, me, p, others, has, lv, need, open, late, lead, R, key: me.id + ':' + pub.turnN + ':' };
  }
  /* A table-reading feature of the full plan (Hard), unless switched off for a measurement. */
  const on = (c, f) => c.lv.plan > 1 && !(c.lv.off && c.lv.off.indexOf(f) >= 0);
  const noise = (c, key) => c.lv.noise ? (hash(c.key + key) - 0.5) * c.lv.noise : 0;
  const needOf = (c, m) => c.lv.plan ? (c.need[m] || 0) : 0;

  /* The value of a building card as a foundation for me now. */
  function buildValue(c, k, site, ot) {
    const def = D.card(k);
    const s = site || def.mat;
    let v = D.MAT[s].value + (FN[k] || 0.5) * Math.min(1, c.R / 20);
    if (k === 'catacomb') v = on(c, 'end') ? (c.lead > 2 ? 4 : -2) : 2;
    if ((k === 'forum' || k === 'forumromanum') && c.p.clients.length >= 4) v += 2;
    /* Can I finish it? Materials in hand and stockpile that fit. */
    const fit = c.me.hand.filter(x => !isJack(x) && matOf(x) === s).length + c.p.stock.filter(m => m === s).length;
    const need = D.MAT[s].value;
    v *= 0.45 + 0.55 * Math.min(1, fit / need);
    v -= Math.max(0, c.open - (c.lv.plan ? 1 : 3)) * 0.9;
    if (ot) v -= 0.6;
    if (c.late) v -= on(c, 'late') ? 1.2 + Math.max(0, need - fit) * 0.8 : 1.2;
    return v;
  }
  /* What one more (or one fewer) card in a hand of h is worth: a lot when
     the hand is thin, little once it is past its size. */
  const handFactor = (c, h) => Math.max(0.2, Math.min(1.2, (c.p.handSize + 1 - h) / c.p.handSize));
  /* What keeping a card in hand is worth. */
  function cardKeep(c, id) {
    const f = handFactor(c, c.me.hand.length - 1);
    if (isJack(id)) return 1.5 * Math.max(0.6, f);
    const k = K(id);
    const m = matOf(id);
    let v = 0.35 + 0.1 * (FN[k] || 0.5) + 0.1 * D.MAT[m].value;
    if (needOf(c, m)) v += 0.4;
    return v * f;
  }

  /* One action's worth, for leading and following. */
  function roleWorth(c, role, forP) {
    const p = forP || c.p;
    const pub = c.pub;
    const mine = p === c.p;
    const hand = mine ? c.me.hand.filter(x => !isJack(x)) : [];
    switch (role) {
      case 'laborer': {
        if (!pub.pool.length) return mine && p.powers.indexOf('dock') >= 0 && hand.length ? 0.6 : 0.05;
        if (!mine) return 0.9;
        let best = 0;
        const room = p.vaultRoom - p.vaultN - p.stock.length;
        for (const k of pub.pool) { const m = D.matOf(k); best = Math.max(best, room > 0 ? D.MAT[m].value * 0.55 : 0.15, 0.3 + needOf(c, m) * 0.9); }
        return best;
      }
      case 'patron': {
        if (!pub.pool.length || p.clients.length >= p.clientRoom) return 0.05;
        return mine ? clientWorth(c) : 1.3;
      }
      case 'merchant': {
        if (!p.stock.length || p.vaultN >= p.vaultRoom) return mine && p.powers.indexOf('atrium') >= 0 && p.vaultN < p.vaultRoom ? 1.6 : 0.05;
        if (!mine) return 1.4;
        let best = 0;
        for (const m of p.stock) best = Math.max(best, D.MAT[m].value * 0.95 - needOf(c, m) * 0.8);
        return Math.max(0.2, best);
      }
      case 'craftsman': case 'architect': {
        if (!mine) return p.builds.some(b => !b.done) ? 1.5 : 0.9;
        let best = 0;
        const src = role === 'craftsman' ? hand.map(matOf) : p.stock.slice();
        for (const b of p.builds) {
          if (b.done) continue;
          const left = b.need - b.mats.length;
          if (src.indexOf(b.site) >= 0 || (b.card === 'statue' && src.indexOf('marble') >= 0)) best = Math.max(best, 2 + (left <= 1 ? D.MAT[b.site].value + (FN[b.card] || 0.5) : 0.4));
        }
        for (const x of hand) {
          const k = K(x);
          if (p.builds.some(b => b.card === k)) continue;
          if (!pub.sites[D.matOf(k)].in && k !== 'statue') continue;
          best = Math.max(best, buildValue(c, k) * 0.55);
        }
        return best;
      }
      case 'legionary': {
        if (!mine) return 0.8;
        if (!hand.length) return 0.05;
        const mats = {};
        hand.forEach(x => { mats[matOf(x)] = 1; });
        let best = 0;
        for (const m of Object.keys(mats)) {
          const inPool = pub.pool.some(k => D.matOf(k) === m) ? 1 : 0;
          const vict = c.others.filter(o => o.powers.indexOf('wall') < 0 && o.powers.indexOf('palisade') < 0);
          best = Math.max(best, (inPool + vict.length * 0.28) * (0.6 + 0.25 * D.MAT[m].value + needOf(c, m) * 0.4));
        }
        return best;
      }
    }
    return 0;
  }
  /* A client acts every time its role is played from now on. */
  function clientWorth(c) { return Math.max(0.3, Math.min(3.2, 0.075 * c.R * (c.lv.plan ? 1 : 0.6))) - c.p.clients.length * 0.05; }
  function thinkWorth(c, menu) {
    let draw = 0;
    for (let j = 0; j < (menu.refill || (menu.one ? 1 : 0)); j++) draw += 0.75 * handFactor(c, menu.hand + j);
    const jack = menu.jack ? 1.4 * Math.max(0.5, handFactor(c, menu.hand)) : 0;
    return Math.max(draw, jack);
  }
  function bestThink(c, menu) {
    const a = { t: 'think' };
    if (menu.refill >= 2) a.how = 'refill';
    else if (menu.jack && (menu.hand >= menu.size - 1)) a.how = 'jack';
    else if (menu.refill) a.how = 'refill';
    else if (menu.one) a.how = 'one';
    else a.how = 'jack';
    return a;
  }
  /* How much a lead of this role hands everybody else. */
  function giveAway(c, role) {
    if (!on(c, 'give')) return 0;
    let v = 0;
    for (const o of c.others) {
      const cl = o.clients.filter(k => D.roleOf(k) === role).length + (o.powers.indexOf('ludusmagnus') >= 0 ? o.clients.filter(k => D.roleOf(k) === 'merchant').length : 0);
      v += (cl * roleWorth(c, role, o) * 0.55 + 0.25 * roleWorth(c, role, o) * Math.min(1, o.handN / 5)) * (c.lv.giveW || 1);
    }
    return v;
  }

  /* ---------------- leading and following ---------------- */
  function choosePlay(c, pr) {
    const lead = pr.t === 'lead';
    const think = bestThink(c, pr.think);
    let best = { a: think, v: thinkWorth(c, pr.think) + noise(c, 'think') };
    const myCl = role => c.p.clients.filter(k => D.roleOf(k) === role || (c.has('ludusmagnus') && D.roleOf(k) === 'merchant') || (role === 'laborer' && c.has('storeroom'))).length;
    for (const pl of pr.plays) {
      const per = roleWorth(c, pl.role);
      const cl = myCl(pl.role) * (c.has('circusmaximus') ? 2 : 1);
      let v = (pl.units + (lead ? cl : 0)) * per - pl.cards.reduce((s, x) => s + cardKeep(c, x), 0);
      if (lead) v -= giveAway(c, pl.role);
      /* A follower's clients act anyway: following adds only the cards' actions. */
      v += noise(c, 'play:' + pl.role + ':' + pl.how);
      if (v > best.v) best = { a: { t: pr.t, role: pl.role, cards: pl.cards }, v };
    }
    return best.a;
  }

  /* ---------------- one action ---------------- */
  /* Whether one more of this material in my Vault might win its bonus.
     I know my own Vault; the others' are only counts. */
  function bonusEdge(c, m) {
    const mine = (c.me.vault || []).filter(k => k && D.matOf(k) === m).length;
    return mine === 0 ? 0.25 : mine === 1 ? 0.45 : 0.3;
  }
  function optValue(c, o) {
    const p = c.p;
    switch (o.kind) {
      case 'stop': return 0;
      case 'take': {
        const room = c.p.vaultRoom - c.p.vaultN - c.p.stock.length;
        const forVault = room > 0 ? D.MAT[o.mat].value * 0.55 : 0.15;
        return Math.max(forVault, 0.3 + needOf(c, o.mat) * 0.9) + (c.has('wall') ? 0.25 : 0) - (o.from === 'hand' ? cardKeep(c, o.card) * 0.8 : 0);
      }
      case 'client': {
        if (o.from === 'deck') return 1.1;
        let v = clientWorth(c) + (c.lv.plan ? 0.25 * D.MAT[D.ROLE[o.role].mat].value : 0);
        /* A role the others hold clients of gets led often: my client rides along. */
        if (on(c, 'ride')) v += 0.12 * c.others.reduce((s2, x) => s2 + x.clients.filter(k => D.roleOf(k) === o.role).length, 0);
        const role = o.role;
        const cnt = p.clients.filter(k => D.roleOf(k) === role).length;
        if (role === 'architect' || role === 'craftsman') v += c.open ? 0.5 : 0.1;
        if (role === 'merchant') v += 0.3;
        if (role === 'laborer') v += 0.2;
        if ((c.has('forum') || c.has('forumromanum')) && !cnt) v += 1.5;
        if (o.from === 'hand') v -= cardKeep(c, o.card) * 0.7;
        return v - cnt * 0.08;
      }
      case 'vault': {
        if (o.from === 'deck') return 1.9;
        const m = o.mat || matOf(o.card);
        let v = D.MAT[m].value * 0.95 - needOf(c, m) * 0.9 + (on(c, 'bonus') ? bonusEdge(c, m) : 0);
        if (o.from === 'hand') v -= cardKeep(c, o.card) * 0.5;
        return v;
      }
      case 'lay': {
        /* Taking the last site in town ends the game: only when ahead. */
        if (!o.ot && c.pub.inTown === 1 && on(c, 'end')) return c.lead > 0 ? 9 : -9;
        return buildValue(c, K(o.card), o.site, o.ot) - cardKeep(c, o.card) * 0.4 - (o.cost > 1 ? 0.6 : 0);
      }
      case 'fill': {
        const b = p.builds.find(x => x.uid === o.b);
        if (!b) return 0;
        const left = b.need - b.mats.length;
        let v = 2.1;
        if (left <= 1 || (o.mat === 'marble' && c.has('scriptorium')) || (b.card === 'villa' && o.from !== 'hand')) v += D.MAT[b.site].value + (FN[b.card] || 0.5) + (b.card === 'catacomb' && on(c, 'end') ? (c.lead > 0 ? 6 : -8) : 0);
        if (o.from === 'hand') v -= cardKeep(c, o.card) * 0.3;
        return v;
      }
      case 'fountain': return 1.6;
      case 'tear': return -3;
    }
    return 0;
  }
  function chooseAct(c, pr) {
    let best = null, second = null;
    for (const o of pr.options) {
      const v = optValue(c, o) + noise(c, 'act:' + o.id.replace(/\.\d+/g, ''));
      if (!best || v > best.v) { second = best; best = { o, v }; }
      else if (!second || v > second.v) second = { o, v };
    }
    if (c.lv.slip && second && second.o.kind !== 'stop' && hash(c.key + 'slip:' + pr.role + pr.left) < c.lv.slip) best = second;
    if (!best || best.v <= 0) return { t: 'act', id: 'stop' };
    return { t: 'act', id: best.o.id };
  }

  /* ---------------- every other question ---------------- */
  function choosePick(c, pr) {
    const opts = pr.options.filter(o => !o.bad);
    const by = f => opts.slice().sort((a, b) => f(b) - f(a));
    const skip = pr.skip ? { t: 'skip' } : null;
    switch (pr.what) {
      case 'demand': {
        const score = o => (c.pub.pool.some(k => D.matOf(k) === o.mat) ? 1 : 0) + c.others.length * 0.3 + needOf(c, o.mat) * 0.5 + D.MAT[o.mat].value * 0.2 + noise(c, 'dem:' + o.mat);
        const ids = [], usedMat = {};
        for (const o of by(score)) { if (ids.length >= pr.max) break; if (usedMat[o.mat] && ids.length < opts.length - 1 && opts.some(x => !usedMat[x.mat] && ids.indexOf(x.id) < 0)) continue; ids.push(o.id); usedMat[o.mat] = 1; }
        while (ids.length < pr.min) ids.push(opts.find(o => ids.indexOf(o.id) < 0).id);
        return { t: 'pick', ids };
      }
      case 'give': return { t: 'pick', id: by(o => -(FN[o.card] || 0.5))[0].id };
      case 'site': return { t: 'pick', id: by(o => c.pub.sites[o.id] ? c.pub.sites[o.id].in : 0)[0].id };
      case 'bar': return { t: 'pick', id: 'yes' };
      case 'dock': case 'basilica': case 'aqueduct': {
        const val = o => {
          if (pr.what === 'dock') return 0.3 + needOf(c, matOf(o.id)) * 0.8 - cardKeep(c, o.id) * 0.8;
          if (pr.what === 'basilica') return D.MAT[matOf(o.id)].value * (c.late ? 1.1 : 0.7) - cardKeep(c, o.id);
          return 1 - cardKeep(c, o.id) * 0.6 + (c.late ? -0.6 : 0);
        };
        const best = by(val)[0];
        return best && val(best) > 0 ? { t: 'pick', id: best.id } : skip;
      }
      case 'solarium': return { t: 'pick', id: by(o => D.MAT[o.mat].value + needOf(c, o.mat))[0].id };
      case 'prison': {
        const best = by(o => FN[o.card] || 0)[0];
        return best && (FN[best.card] || 0) >= 1.7 && !c.late ? { t: 'pick', id: best.id } : skip;
      }
      case 'stairway': {
        const best = by(o => FN[o.card] || 0)[0];
        return best && (FN[best.card] || 0) >= 1.2 && c.p.powers.indexOf(best.card) < 0 ? { t: 'pick', id: best.id } : skip;
      }
      case 'fountain': {
        const lay = opts.filter(o => o.id.indexOf('lay:') === 0 && !o.id.endsWith(':1'));
        const fill = opts.find(o => o.id.indexOf('fill:') === 0);
        if (fill) return { t: 'pick', id: fill.id };
        if (lay.length && c.open < 2 && !c.late) return { t: 'pick', id: lay[0].id };
        return { t: 'pick', id: 'keep' };
      }
      case 'praetoria': return { t: 'pick', ids: opts.slice(0, pr.max).map(o => o.id) };
      case 'aerarium': return opts.length ? { t: 'pick', id: by(o => FN[o.card] || 0)[0].id } : skip;
      case 'bacchanalia': return { t: 'pick', id: by(o => FN[o.card] || 0)[0].id };
      case 'triclinium': {
        if (!c.late) return { t: 'pick', ids: [] };
        return { t: 'pick', ids: opts.filter(o => /, (2|3)\)/.test(o.label)).slice(0, pr.max).map(o => o.id) };
      }
    }
    if (pr.multi) return { t: 'pick', ids: opts.slice(0, Math.max(pr.min, 0)).map(o => o.id) };
    if (opts.some(o => o.id === 'yes')) return { t: 'pick', id: 'yes' };
    return opts.length ? { t: 'pick', id: opts[0].id } : skip;
  }

  function answer(pub, me, pr) {
    pr = pr || me.prompt;
    const c = ctx(pub, me);
    let a;
    if (pr.t === 'lead' || pr.t === 'follow') a = choosePlay(c, pr);
    else if (pr.t === 'think') a = bestThink(c, pr.think);
    else if (pr.t === 'act') a = chooseAct(c, pr);
    else a = choosePick(c, pr) || fallback(pub, me, pr);
    return Object.assign({ n: pr.n }, a);
  }
  /* Always legal, never clever: for a refused answer, and a quiet phone. */
  function fallback(pub, me, pr) {
    pr = pr || me.prompt;
    const think = pr.think ? bestThink(null, pr.think) : null;
    if (pr.t === 'lead' || pr.t === 'follow') return Object.assign({ n: pr.n }, think);
    if (pr.t === 'think') return pr.optional ? { t: 'skip', n: pr.n } : Object.assign({ n: pr.n }, think);
    if (pr.t === 'act') return { t: 'act', id: 'stop', n: pr.n };
    const legal = pr.options.filter(o => !o.bad);
    if (pr.multi) return { t: 'pick', ids: legal.slice(0, pr.min).map(o => o.id), n: pr.n };
    if (pr.skip) return { t: 'skip', n: pr.n };
    return { t: 'pick', id: legal[0].id, n: pr.n };
  }

  const Bots = { VERSION, answer, fallback, LV, FN };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.GtrBots = Bots;
})(typeof window !== 'undefined' ? window : this);
