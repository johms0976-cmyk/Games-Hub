'use strict';
/* Inscryption — Kaycee's Mod. The run.
 *
 * Choose a starter deck and challenges, then cross three regions in a random
 * order (the Woodlands, the Wetlands, the Snow Line), each a short branching
 * map ending in its boss, and face Leshy (or Royal Dominguez) in the cabin.
 * Two candles: lose a battle and one goes out; beat a boss and both relight.
 *
 * No DOM, no timers; one seeded rng whose state lives in run.rs, so a run is
 * plain JSON and saves whole (battle included). Every action is
 * R.<verb>(run, ...) returning { ok, why }; the page re-renders from
 * run.screen ('map' | 'node' | 'battle' | 'over' | 'won').
 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./in-data.js') : root.InscData;
  const E = isNode ? require('./in-engine.js') : root.InscEngine;
  const VERSION = 1;
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const no = why => ({ ok: false, why });

  /* ---------------- rng: state in run.rs ---------------- */
  function rnd(run) {
    run.rs = (run.rs + 0x6D2B79F5) >>> 0;
    let t = run.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (run, a, b) => a + Math.floor(rnd(run) * (b - a + 1));
  const pick = (run, list) => list[Math.floor(rnd(run) * list.length)];
  function shuffled(run, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(run) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function weighted(run, pairs) {
    const tot = pairs.reduce((t, p) => t + p[1], 0);
    let x = rnd(run) * tot;
    for (const p of pairs) { x -= p[1]; if (x < 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }
  const on = (run, id) => run.ch.indexOf(id) >= 0;

  /* ---------------- deck entries ----------------
     { id, a, h, x: [gained sigils], n: name, fused } — a and h are on top of the printed stats */
  const entry = (id, x) => ({ id, a: 0, h: 0, x: (x || []).slice() });
  const cardOf = e => D.card(e.id);
  function statsOf(e) {
    const d = cardOf(e);
    return { atk: d.stat ? null : d.atk + (e.a || 0), hp: d.hp + (e.h || 0), sig: d.sig.concat(e.x || []) };
  }
  const nameOf = e => e.n || cardOf(e).name;
  const isPelt = e => !!cardOf(e).pelt;

  /* ================================================================
     A new run
     ================================================================ */
  const ROWS = 10;           // rows of nodes before a region's boss
  const FINAL_ROWS = 2;      // the short walk to the cabin

  function newRun(opts) {
    opts = opts || {};
    const deck = D.DECK[opts.deck] || D.DECK.vanilla;
    const ch = (opts.ch || []).filter(id => D.CHALLENGE[id]);
    const run = {
      v: VERSION, rs: (opts.seed >>> 0) || ((Math.random() * 4294967296) >>> 0), seed: 0,
      deckId: deck.id, ch, cp: ch.reduce((t, id) => t + D.CHALLENGE[id].cp, 0),
      deck: deck.cards.map(id => entry(id, on({ ch }, 'annoying') ? ['annoying'] : [])).concat([entry('rabbitpelt'), entry('rabbitpelt')]),
      items: on({ ch }, 'nohook') ? [] : ['hook'],
      itemCap: on({ ch }, 'smallpack') ? 2 : 3,
      teeth: 0, candles: on({ ch }, 'onecandle') ? 1 : 2, maxCandles: on({ ch }, 'onecandle') ? 1 : 2,
      boons: 0, heads: [], bodies: [], totem: null, carver: 0, survivorsDead: false,
      regions: [], ri: 0, beaten: 0, met: {},
      map: null, pos: null, screen: 'map', node: null, battle: null,
      stats: { battles: 0, won: 0, lost: 0, teeth: 0, cards: 0, turns: 0 },
      log: [], over: null
    };
    run.seed = run.rs;
    run.regions = (opts.regions && opts.regions.length === 3) ? opts.regions.slice() : shuffled(run, D.REGION_IDS.slice());
    run.say = pick(run, OPEN_LINES);
    buildMap(run);
    return run;
  }

  /* ---------------- flavour (written fresh) ---------------- */
  const OPEN_LINES = [
    'The candles are lit. The path begins at the edge of the map.',
    'Leshy slides a card across the table. “Again,” he says. “Let us begin.”',
    'A new challenger. The map unfolds before you.'
  ];
  const NODE_TEXT = {
    battle: 'Creatures block the path.',
    totem: 'A totem stands among the creatures ahead. It lends its tribe a sigil.',
    choice: 'Three cards lie face up in the grass.',
    cost: 'Three cards lie face down, their costs scratched on the backs.',
    tribe: 'Three cards lie face down, each marked with a tribe.',
    trial: 'A beast in a cave mouth offers to join you — if your deck passes its trial.',
    trapper: 'The Trapper. Pelts for teeth.',
    trader: 'The Trader. Pelts for cards.',
    campfire: 'Starving survivors huddle round a campfire. “Warm one of your creatures,” they say.',
    stones: 'Mysterious stones. Sacrifice one creature and another inherits its sigils.',
    myco: 'The Mycologists offer to fuse two copies of one card.',
    carver: 'An old woman sets out her carvings: totem heads and bodies.',
    backpack: 'An abandoned pack, bulging with trinkets.',
    altar: 'A bone altar. Give a card to the Bone Lord, and Bones will come to you.',
    goobert: 'A small, nervous mass of goo holds up a paintbrush. “I can copy one of your cards! Mostly.”',
    prospector: 'The Prospector, caught off guard by the path. “Pick a boulder — iffen it’s gold, it’s yours!”',
    boss: 'The boss of this region waits.'
  };

  /* ================================================================
     The map
     ================================================================
     Three lanes, ROWS rows, then the boss. Battle rows are narrow (paths
     come together to fight); event rows spread to three. The first region
     opens at the Trader, where your two Rabbit Pelts can go at once. */
  const PATTERN = ['ev', 'battle', 'ev', 'ev', 'battle', 'ev', 'battle', 'ev', 'battle', 'ev'];
  const EVENT_WEIGHTS = [
    ['choice', 12], ['cost', 7], ['tribe', 6], ['trial', 6], ['trapper', 6], ['trader', 5],
    ['campfire', 8], ['stones', 7], ['myco', 5], ['carver', 6], ['backpack', 6], ['altar', 4], ['goobert', 4], ['prospector', 3]
  ];

  function regionId(run) { return run.ri < 3 ? run.regions[run.ri] : 'cabin'; }

  function buildMap(run) {
    const final = run.ri >= 3;
    const pattern = final ? ['ev', 'ev'] : PATTERN;
    const rows = [];
    pattern.forEach((kind, r) => {
      let lanes;
      if (r === 0) lanes = [1];
      else if (kind === 'battle') lanes = rnd(run) < 0.55 ? [pick(run, [0, 1, 2])] : pick(run, [[0, 2], [0, 1], [1, 2]]);
      else lanes = rnd(run) < 0.7 ? [0, 1, 2] : pick(run, [[0, 2], [0, 1], [1, 2]]);
      const used = [];
      const row = lanes.map(c => {
        let k;
        if (kind === 'battle') k = (on(run, 'alltotems') || rnd(run) < 0.28) ? 'totem' : 'battle';
        else if (r === 0 && run.ri === 0) k = 'trader';
        else if (r === 0) k = pick(run, ['choice', 'cost', 'tribe']);
        else {
          for (let t = 0; t < 20; t++) {
            k = weighted(run, EVENT_WEIGHTS.filter(([x]) => {
              if (x === 'prospector' && (run.met.prospector || final)) return false;
              if ((x === 'trapper' || x === 'trader') && final) return false;
              return true;
            }));
            if (used.indexOf(k) < 0) break;
          }
        }
        used.push(k);
        return { c, k, done: false };
      });
      rows.push(row);
    });
    rows.push([{ c: 1, k: 'boss', done: false }]);
    // links: straight ahead where there is a node, sometimes a diagonal too;
    // never two diagonals that cross; every node reachable
    const links = [];
    const has = (r, a, b) => links.some(l => l[0] === r && l[1] === a && l[3] === b);
    for (let r = 0; r < rows.length - 1; r++) {
      const A = rows[r], B = rows[r + 1];
      const near = c => B.reduce((best, x) => Math.abs(x.c - c) < Math.abs(best.c - c) ? x : best, B[0]).c;
      A.forEach(a => {
        const straight = B.some(x => x.c === a.c) ? a.c : near(a.c);
        links.push([r, a.c, r + 1, straight]);
        if (B.length > 1 && rnd(run) < 0.45) {
          const opts = [a.c - 1, a.c + 1].filter(c => c !== straight && B.some(x => x.c === c) && Math.abs(c - a.c) === 1 && !has(r, c, a.c) && !(c > a.c ? has(r, a.c + 1, a.c) : has(r, a.c - 1, a.c)));
          if (opts.length) links.push([r, a.c, r + 1, pick(run, opts)]);
        }
      });
      B.forEach(bn => {
        if (!links.some(l => l[0] === r && l[3] === bn.c)) {
          const a = A.reduce((best, x) => Math.abs(x.c - bn.c) < Math.abs(best.c - bn.c) ? x : best, A[0]);
          links.push([r, a.c, r + 1, bn.c]);
        }
      });
    }
    run.map = { region: regionId(run), rows, links };
    run.pos = null;
  }

  /* Nodes you may walk to now. */
  function nextNodes(run) {
    if (run.screen !== 'map') return [];
    const rows = run.map.rows;
    if (!run.pos) return rows[0].map(n => ({ r: 0, c: n.c }));
    return run.map.links.filter(l => l[0] === run.pos.r && l[1] === run.pos.c).map(l => ({ r: l[2], c: l[3] }));
  }
  const nodeAt = (run, r, c) => (run.map.rows[r] || []).find(n => n.c === c);

  /* Difficulty: two steps a region (a step at mid-region), six at the cabin. */
  function difficulty(run, r) {
    if (run.ri >= 3) return 6;
    return run.ri * 2 + (r >= 5 ? 1 : 0);
  }
  const harder = run => (on(run, 'harder') ? 1 : 0) + (on(run, 'harder2') ? 1 : 0);

  function go(run, r, c) {
    if (run.screen !== 'map') return no('Finish here first.');
    if (!nextNodes(run).some(n => n.r === r && n.c === c)) return no('You cannot reach that from here.');
    const n = nodeAt(run, r, c);
    run.pos = { r, c };
    run.say = NODE_TEXT[n.k] || '';
    return enter(run, n, r);
  }

  /* ================================================================
     Entering a node
     ================================================================ */
  function enter(run, n, r) {
    const k = n.k;
    if (k === 'battle' || k === 'totem' || k === 'boss') return startBattle(run, k, r);
    const node = { k };
    run.node = node;
    run.screen = 'node';
    switch (k) {
      case 'choice': node.offers = commonOffers(run, 3).map(id => ({ e: entry(id), shown: true })); node.clover = !on(run, 'cloverless'); break;
      case 'cost': node.offers = costOffers(run); node.clover = !on(run, 'cloverless'); break;
      case 'tribe': node.offers = tribeOffers(run); node.clover = !on(run, 'cloverless'); break;
      case 'trial': node.trials = shuffled(run, TRIALS.map(t => t.id)).slice(0, 3); break;
      case 'trapper':
        node.free = true;
        run.deck.push(entry('rabbitpelt'));
        run.say = (run.met.trapperDead ? 'The Trapper’s outpost stands empty. Out of respect, you take only what you can pay for — and the pelt left out for you.' : 'The Trapper grins and hands you a Rabbit Pelt for nothing. The rest will cost you.');
        break;
      case 'trader': traderSetup(run, node); break;
      case 'campfire': node.stat = rnd(run) < 0.5 ? 'atk' : 'hp'; node.di = null; node.times = 0; break;
      case 'stones': break;
      case 'myco': mycoSetup(run, node); break;
      case 'carver': carverSetup(run, node); break;
      case 'backpack': backpackSetup(run, node); break;
      case 'altar': break;
      case 'goobert': break;
      case 'prospector': run.met.prospector = true; node.boulders = [0, 1, 2].map(() => rnd(run) < 0.34 ? 'gold' : 'bug'); break;
    }
    return yes();
  }

  function leave(run) {
    if (run.screen !== 'node') return no('Nothing to leave.');
    const n = nodeAt(run, run.pos.r, run.pos.c);
    if (n) n.done = true;
    run.node = null;
    run.screen = 'map';
    run.say = '';
    return yes();
  }

  /* ---------------- card choices ---------------- */
  function commonOffers(run, n, filter) {
    let pool = D.COMMONS.filter(id => !filter || filter(D.card(id)));
    pool = shuffled(run, pool);
    return pool.slice(0, n);
  }
  function costOffers(run) {
    const groups = [
      { label: '1 Blood', f: d => d.blood === 1 },
      { label: '2 Blood', f: d => d.blood === 2 },
      { label: '3+ Blood', f: d => d.blood >= 3 },
      { label: 'Bones', f: d => d.bones > 0 }
    ];
    return shuffled(run, groups).slice(0, 3).map(g => ({ e: entry(pick(run, D.COMMONS.filter(id => g.f(D.card(id))))), shown: false, label: g.label, cost: g.label }));
  }
  function tribeOffers(run) {
    return shuffled(run, D.TRIBE_LIST).slice(0, 3).map(t => ({ e: entry(pick(run, D.COMMONS.filter(id => D.card(id).tribes.indexOf(t) >= 0))), shown: false, label: D.TRIBES[t].name, tribe: t }));
  }
  function reroll(run) {
    const node = run.node;
    if (!node || !node.offers || !node.clover) return no('No Clover to use.');
    node.clover = false;
    if (node.k === 'choice') node.offers = commonOffers(run, 3).map(id => ({ e: entry(id), shown: true }));
    else if (node.k === 'cost') node.offers = costOffers(run);
    else if (node.k === 'tribe') node.offers = tribeOffers(run);
    return yes();
  }
  function choose(run, i) {
    const node = run.node;
    if (!node || !node.offers) return no('Nothing to choose.');
    if (node.taken != null) return no('You have chosen.');
    const o = node.offers[i];
    if (!o) return no('No such card.');
    node.taken = i;
    node.offers.forEach(x => { x.shown = true; });
    addCard(run, o.e);
    if (node.k === 'carver') return yes();
    return yes();
  }
  function addCard(run, e) {
    run.deck.push(JSON.parse(JSON.stringify(e)));
    run.stats.cards += 1;
  }

  /* ---------------- the cave trial ---------------- */
  const TRIALS = [
    { id: 'bones', name: 'Trial of Bones', text: 'The three cards drawn cost at least 5 Bones between them.' },
    { id: 'blood', name: 'Trial of Blood', text: 'The three cards drawn cost at least 4 Blood between them.' },
    { id: 'power', name: 'Trial of Power', text: 'The three cards drawn have at least 4 Power between them.' },
    { id: 'health', name: 'Trial of Health', text: 'The three cards drawn have at least 6 Health between them.' },
    { id: 'wisdom', name: 'Trial of Wisdom', text: 'The three cards drawn bear at least 3 sigils between them.' },
    { id: 'kin', name: 'Trial of Kin', text: 'Two of the three cards drawn share a tribe (or are the same card).' }
  ];
  function trialPasses(id, cards) {
    const sum = f => cards.reduce((t, e) => t + f(e), 0);
    switch (id) {
      case 'bones': return sum(e => cardOf(e).bones) >= 5;
      case 'blood': return sum(e => cardOf(e).blood) >= 4;
      case 'power': return sum(e => { const d = cardOf(e); if (d.pelt) return 0; if (d.stat === 'ants') return 1; if (d.stat) return 0; return d.atk + (e.a || 0); }) >= 4;
      case 'health': return sum(e => cardOf(e).hp + (e.h || 0)) >= 6;
      case 'wisdom': return sum(e => statsOf(e).sig.length) >= 3;
      case 'kin': {
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
          const a = cards[i], b = cards[j];
          if (!a || !b) continue;
          if (a.id === b.id) return true;
          if (cardOf(a).tribes.some(t => cardOf(b).tribes.indexOf(t) >= 0)) return true;
        }
        return false;
      }
    }
    return false;
  }
  function trial(run, i) {
    const node = run.node;
    if (!node || node.k !== 'trial' || node.drawn) return no('No trial here.');
    const id = node.trials[i];
    if (!id) return no('No such trial.');
    node.chosen = id;
    node.drawn = shuffled(run, run.deck.map((e, di) => di)).slice(0, 3);
    node.passed = trialPasses(id, node.drawn.map(di => run.deck[di]));
    if (node.passed) {
      // Kaycee's Mod: each reward wears two extra sigils
      node.offers = commonOffers(run, 3).map(cid => {
        const own = D.card(cid).sig;
        const pool = D.MODULAR.filter(s => own.indexOf(s) < 0 && s !== 'amorphous' && D.SIGILS[s].p <= 5);
        const s = shuffled(run, pool).slice(0, 2);
        return { e: entry(cid, s), shown: true };
      });
      run.say = 'The beast is satisfied. Choose your new companion.';
    } else run.say = 'The beast turns away, unimpressed.';
    return yes({ passed: node.passed });
  }

  /* ---------------- the Trapper and the Trader ---------------- */
  function prices(run) {
    const base = D.PELT_PRICE[Math.min(3, run.beaten)];
    const up = on(run, 'pricey') ? { rabbit: 1, wolf: 2, golden: 3 } : { rabbit: 0, wolf: 0, golden: 0 };
    return { rabbit: base.rabbit + up.rabbit, wolf: base.wolf + up.wolf, golden: base.golden + up.golden, knife: D.KNIFE_PRICE };
  }
  function buy(run, what) {
    const node = run.node;
    if (!node || node.k !== 'trapper') return no('The Trapper is not here.');
    const p = prices(run)[what];
    if (p == null) return no('He does not sell that.');
    if (run.teeth < p) return no('You need ' + p + ' teeth.');
    if (what === 'knife') {
      if (run.items.length >= run.itemCap) return no('Your pack is full.');
      run.teeth -= p; run.items.push('knife');
      return yes();
    }
    run.teeth -= p;
    run.deck.push(entry(what + 'pelt'));
    return yes();
  }
  const TRADE_N = { rabbit: 8, wolf: 8, golden: 4 };
  function traderSetup(run, node) {
    const have = k => run.deck.some(e => e.id === k + 'pelt');
    if (!['rabbit', 'wolf', 'golden'].some(have)) {
      run.teeth += 5;
      run.say = 'You have no pelts. The Trader sighs and presses five teeth into your hand.';
      node.empty = true;
      return;
    }
    node.offers = {};
    ['rabbit', 'wolf', 'golden'].forEach(k => {
      if (!have(k)) return;
      const fused = run.deck.some(e => e.id === k + 'pelt' && e.fused);
      const ids = k === 'golden' ? shuffled(run, D.RARES).slice(0, TRADE_N[k]) : commonOffers(run, TRADE_N[k]);
      node.offers[k] = ids.map(id => {
        const e = entry(id);
        if (k === 'wolf') { const s = pick(run, D.MODULAR.filter(x => D.card(id).sig.indexOf(x) < 0 && x !== 'amorphous')); e.x.push(s); }
        if (fused) fuseInto(e, JSON.parse(JSON.stringify(e)));
        return { e, taken: false, shown: true };
      });
    });
  }
  function trade(run, kind, i) {
    const node = run.node;
    if (!node || node.k !== 'trader' || !node.offers || !node.offers[kind]) return no('Nothing to trade for.');
    const o = node.offers[kind][i];
    if (!o || o.taken) return no('That is gone.');
    const pi = run.deck.findIndex(e => e.id === kind + 'pelt');
    if (pi < 0) return no('You have no ' + kind + ' pelt left.');
    run.deck.splice(pi, 1);
    o.taken = true;
    addCard(run, o.e);
    return yes();
  }

  /* ---------------- the campfire ---------------- */
  /* Kaycee's Mod: two warmings at most; the second risks the card (one in
     two) unless the survivors have been poisoned. */
  function warm(run, di) {
    const node = run.node;
    if (!node || node.k !== 'campfire') return no('No fire here.');
    if (node.times >= 2) return no('The fire has done what it can.');
    if (node.di != null && node.di !== di) return no('Only one creature by the fire.');
    const e = run.deck[di];
    if (!e) return no('No such card.');
    if (isPelt(e) || cardOf(e).terrain) return no('That will not warm.');
    if (node.times === 1 && !run.survivorsDead && rnd(run) < 0.5) {
      // eaten
      run.deck.splice(di, 1);
      node.eaten = nameOf(e);
      node.times = 2;
      node.di = null;
      const poison = cardOf(e).kills || statsOf(e).sig.indexOf('touch') >= 0;
      if (poison) { run.survivorsDead = true; run.say = 'The survivors ate your ' + nameOf(e) + '... and it poisoned them. They will trouble no fire again.'; }
      else run.say = 'You turned away a moment too long. The survivors ate your ' + nameOf(e) + '.';
      if (run.items.length < run.itemCap) { run.items.push('hoggybank'); run.say += ' They leave a Hoggy Bank behind, ashamed.'; }
      return yes({ eaten: true });
    }
    if (node.stat === 'atk') e.a = (e.a || 0) + 1; else e.h = (e.h || 0) + 2;
    node.di = di;
    node.times += 1;
    run.say = node.times === 1 ? 'Your ' + nameOf(e) + ' warms by the fire. Warm it again? The survivors are hungry.' : 'Your ' + nameOf(e) + ' warms again. Enough.';
    return yes({ eaten: false });
  }

  /* ---------------- the mysterious stones ---------------- */
  /* The host must have no gained sigils; the sacrifice must have a sigil. */
  function canHost(e) { return !isPelt(e) && !cardOf(e).terrain && !(e.x && e.x.length) && e.id !== 'ijiraq'; }
  function canGive(e) { return !isPelt(e) && e.id !== 'ijiraq' && statsOf(e).sig.length > 0; }
  function transfer(run, host, victim) {
    const node = run.node;
    if (!node || node.k !== 'stones' || node.done) return no('No stones here.');
    if (host === victim) return no('Choose two different cards.');
    const h = run.deck[host], v = run.deck[victim];
    if (!h || !v) return no('No such card.');
    if (!canHost(h)) return no('That card already bears a gained sigil.');
    if (!canGive(v)) return no('That card has no sigil to give.');
    const sigs = statsOf(v).sig.filter(s => statsOf(h).sig.indexOf(s) < 0);
    if (!sigs.length) return no(nameOf(h) + ' already has those sigils.');
    h.x = (h.x || []).concat(sigs);
    run.deck.splice(victim, 1);
    node.done = true;
    run.say = 'The ' + nameOf(v) + ' is gone. Your ' + nameOf(h) + ' now bears ' + sigs.map(s => D.SIGILS[s].name).join(' and ') + '.';
    return yes();
  }

  /* ---------------- the Mycologists ---------------- */
  function dupGroups(run) {
    const by = {};
    run.deck.forEach((e, di) => { if (!isPelt(e) && e.id !== 'ijiraq') (by[e.id] = by[e.id] || []).push(di); });
    return Object.keys(by).filter(k => by[k].length >= 2).map(k => by[k]);
  }
  function mycoSetup(run, node) {
    if (!dupGroups(run).length) {
      const pool = run.deck.filter(e => !isPelt(e) && !cardOf(e).unique && e.id !== 'ijiraq');
      if (pool.length) {
        const e = JSON.parse(JSON.stringify(pick(run, pool)));
        addCard(run, e);
        node.gift = nameOf(e);
        run.say = 'You have no two of a kind. The Mycologists grow you a second ' + nameOf(e) + ' instead.';
      }
      node.done = true;
    }
  }
  function fuseInto(a, b) {
    const base = cardOf(a);
    a.a = (a.a || 0) + (b.a || 0) + base.atk;
    a.h = (a.h || 0) + (b.h || 0) + base.hp;
    (b.x || []).forEach(s => { if ((a.x || []).indexOf(s) < 0) a.x.push(s); });
    a.fused = 1;
  }
  function fuse(run, d1, d2) {
    const node = run.node;
    if (!node || node.k !== 'myco' || node.done) return no('The Mycologists are not here.');
    const a = run.deck[d1], b = run.deck[d2];
    if (!a || !b || d1 === d2) return no('Choose two cards.');
    if (a.id !== b.id) return no('They must be the same card.');
    fuseInto(a, b);
    run.deck.splice(d2, 1);
    node.done = true;
    run.say = 'Fused. Your ' + nameOf(a) + ' is ' + (statsOf(a).atk == null ? '' : statsOf(a).atk + '/') + statsOf(a).hp + '.';
    return yes();
  }

  /* ---------------- the Woodcarver ---------------- */
  function carverSetup(run, node) {
    run.carver += 1;
    if (run.heads.length + run.bodies.length >= 7) {
      const e = entry('amalgam', [pick(run, D.MODULAR.filter(s => s !== 'amorphous'))]);
      addCard(run, e);
      node.amalgam = true;
      run.say = 'She has nothing left to carve for you. She hands you an Amalgam instead.';
      return;
    }
    const heads = D.TRIBE_LIST.filter(t => run.heads.indexOf(t) < 0).map(t => ({ head: t }));
    const bodies = D.MODULAR.filter(s => run.bodies.indexOf(s) < 0 && s !== 'amorphous').map(s => ({ body: s }));
    let offers;
    if (!run.heads.length && !run.bodies.length) offers = [pick(run, heads), pick(run, bodies)].concat(shuffled(run, heads.concat(bodies)).slice(0, 1));
    else offers = shuffled(run, heads.concat(bodies)).slice(0, 3);
    // no duplicates
    const seen = [];
    node.pieces = offers.filter(o => { const k = o.head || o.body; if (seen.indexOf(k) >= 0) return false; seen.push(k); return true; });
    while (node.pieces.length < 3) {
      const o = pick(run, heads.concat(bodies));
      const k = o.head || o.body;
      if (seen.indexOf(k) < 0) { seen.push(k); node.pieces.push(o); }
    }
  }
  function carve(run, i) {
    const node = run.node;
    if (!node || node.k !== 'carver' || !node.pieces || node.taken != null) return no('Nothing to take.');
    const p = node.pieces[i];
    if (!p) return no('No such piece.');
    node.taken = i;
    if (p.head) run.heads.push(p.head); else run.bodies.push(p.body);
    // a first totem assembles itself; later the page lets you change it
    if (!run.totem && run.heads.length && run.bodies.length) run.totem = { tribe: run.heads[0], sigil: run.bodies[0] };
    else if (run.totem && p.head) run.say = 'A new head. You may set it on your totem.';
    return yes();
  }
  function setTotem(run, tribe, sigil) {
    if (run.heads.indexOf(tribe) < 0 || run.bodies.indexOf(sigil) < 0) return no('You do not have those pieces.');
    if (!run.node || run.node.k !== 'carver') return no('Only at the Woodcarver’s.');
    run.totem = { tribe, sigil };
    return yes();
  }

  /* ---------------- the backpack ---------------- */
  function backpackSetup(run, node) {
    if (run.items.length >= run.itemCap) {
      addCard(run, entry('packrat'));
      node.rat = true;
      run.say = 'Your pack is already full. A Pack Rat crawls out of this one and joins you.';
      return;
    }
    node.items = shuffled(run, D.ITEM_POOL).slice(0, 3);
  }
  function takeItem(run, i) {
    const node = run.node;
    if (!node || node.k !== 'backpack' || !node.items) return no('No pack here.');
    if (run.items.length >= run.itemCap) return no('Your pack is full.');
    const it = node.items[i];
    if (!it) return no('No such item.');
    run.items.push(it);
    node.items = run.items.length < run.itemCap ? shuffled(run, D.ITEM_POOL).slice(0, 3) : null;
    if (!node.items) node.full = true;
    return yes();
  }

  /* ---------------- the bone altar ---------------- */
  function altar(run, di) {
    const node = run.node;
    if (!node || node.k !== 'altar' || node.done) return no('No altar here.');
    const e = run.deck[di];
    if (!e) return no('No such card.');
    if (run.deck.length <= 3) return no('Your deck is too thin to give more.');
    run.deck.splice(di, 1);
    node.done = true;
    if (isPelt(e)) { node.boon = 0; run.say = 'The Bone Lord has no use for a pelt. Nothing comes of it.'; }
    else if (e.id === 'goat') { run.boons += 8; node.boon = 8; run.say = 'The Black Goat pleases the Bone Lord. You will begin every battle with 8 more Bones.'; }
    else { run.boons += 1; node.boon = 1; run.say = 'A minor boon: you will begin every battle with 1 more Bone.'; }
    return yes();
  }

  /* ---------------- Goobert ---------------- */
  function goobert(run, di) {
    const node = run.node;
    if (!node || node.k !== 'goobert' || node.done) return no('Goobert is not here.');
    const e = run.deck[di];
    if (!e) return no('No such card.');
    if (cardOf(e).unique || isPelt(e) || e.id === 'ijiraq') return no('Goobert will not copy that one.');
    const copy = JSON.parse(JSON.stringify(e));
    delete copy.fused;
    const m = int(run, 0, 2);
    let what = 'He gets it exactly right.';
    if (m === 0 && copy.x && copy.x.length) {
      const k = int(run, 0, copy.x.length - 1);
      const s = pick(run, D.MODULAR.filter(x => x !== copy.x[k] && x !== 'amorphous'));
      what = 'He paints ' + D.SIGILS[s].name + ' where ' + D.SIGILS[copy.x[k]].name + ' should be.';
      copy.x[k] = s;
    } else if (m === 1 && statsOf(copy).atk > 0) {
      const d = rnd(run) < 0.5 ? -1 : 1;
      copy.a = (copy.a || 0) + d;
      what = d > 0 ? 'He gives it an extra point of Power.' : 'He forgets a point of Power.';
    } else if (m === 2 && statsOf(copy).hp > 1) {
      const d = rnd(run) < 0.5 ? -2 : 2;
      copy.h = (copy.h || 0) + Math.max(d, 1 - statsOf(copy).hp);
      what = d > 0 ? 'He gives it two extra Health.' : 'He leaves off some Health.';
    }
    addCard(run, copy);
    node.done = true;
    node.copy = copy;
    run.say = 'Goobert’s copy of your ' + nameOf(e) + ': ' + what;
    return yes();
  }

  /* ---------------- the Prospector's boulders ---------------- */
  function boulder(run, i) {
    const node = run.node;
    if (!node || node.k !== 'prospector' || node.picked != null) return no('No boulders here.');
    if (!(i >= 0 && i < 3)) return no('Pick a boulder.');
    node.picked = i;
    if (node.boulders[i] === 'gold') {
      run.deck.push(entry('goldenpelt'));
      node.got = entry('goldenpelt');
      run.say = '“Heeee-haw! Gold!” He can barely bring himself to hand over the Golden Pelt.';
    } else {
      const id = pick(run, D.COMMONS.filter(x => D.card(x).tribes.indexOf('I') >= 0 && x !== 'ringworm'));
      const e = entry(id, [pick(run, D.MODULAR.filter(s => D.card(id).sig.indexOf(s) < 0 && s !== 'amorphous'))]);
      addCard(run, e);
      node.got = e;
      run.say = '“Dag nab it... no gold. But that’s a funny-lookin’ varmint. Keep it.”';
    }
    return yes();
  }

  /* ================================================================
     Battles
     ================================================================ */
  /* The Curious Egg's lights: Power 1–5, Health 1–5 and every tribe in the deck. */
  function eggLights(run) {
    const pw = new Set(), hp = new Set(), tr = new Set();
    let wild = 0;
    run.deck.forEach(e => {
      const s = statsOf(e), d = cardOf(e);
      if (s.atk != null) pw.add(s.atk);
      hp.add(s.hp);
      if (d.id === 'amalgam') wild++;
      else d.tribes.forEach(t => tr.add(t));
    });
    const powers = [1, 2, 3, 4, 5].filter(n => pw.has(n)).length;
    const healths = [1, 2, 3, 4, 5].filter(n => hp.has(n)).length;
    const tribes = Math.min(5, D.TRIBE_LIST.filter(t => tr.has(t)).length + wild);
    return { power: powers === 5, health: healths === 5, tribe: tribes === 5, powers, healths, tribes };
  }

  function bossFor(run) {
    if (run.ri >= 3) return on(run, 'royal') ? 'royal' : 'leshy';
    return D.REGIONS[run.regions[run.ri]].boss;
  }

  function startBattle(run, kind, r) {
    const region = run.ri < 3 ? run.regions[run.ri] : run.regions[2];
    const R = D.REGIONS[region];
    const foe = { kind, region, d: difficulty(run, r), harder: harder(run) };
    if (kind === 'boss') {
      foe.boss = bossFor(run);
      foe.order = run.beaten;
      foe.totems = on(run, 'bosstotems');
      foe.grizzly = on(run, 'grizzly');
      run.say = D.BOSSES[foe.boss].text;
    } else {
      // don't meet the same encounter twice in a region if it can be helped
      run.seenEnc = run.seenEnc || [];
      const fresh = R.enc.filter(e => run.seenEnc.indexOf(e.name) < 0);
      const enc = pick(run, fresh.length ? fresh : R.enc);
      run.seenEnc.push(enc.name);
      foe.enc = enc.name;
    }
    const lights = eggLights(run);
    run.battle = E.newBattle({
      seed: (rnd(run) * 4294967296) >>> 0,
      deck: run.deck,
      sideDeck: on(run, 'squirrelfish') ? 'aquasquirrel' : 'squirrel',
      items: run.items, itemCap: run.itemCap,
      bones: run.boons, totem: run.totem, tipped: on(run, 'tipped'),
      hatch: lights.power && lights.health && lights.tribe,
      foe
    });
    run.screen = 'battle';
    run.node = null;
    run.stats.battles += 1;
    return yes();
  }

  /* The battle is over: bank it. */
  function finishBattle(run) {
    const b = run.battle;
    if (!b || !b.result) return no('The battle is not over.');
    run.items = b.items.slice();
    run.stats.turns += b.turn;
    // Ouroboros grows for the rest of the run
    if (b.ouroBy) Object.keys(b.ouroBy).forEach(di => { const e = run.deck[+di]; if (e && e.id === 'ouroboros') { e.a = (e.a || 0) + b.ouroBy[di]; e.h = (e.h || 0) + b.ouroBy[di]; } });
    const n = nodeAt(run, run.pos.r, run.pos.c);
    const boss = n && n.k === 'boss';
    const bossId = b.foe.boss;
    run.battle = null;
    if (b.result === 'win') {
      run.stats.won += 1;
      run.teeth += b.teeth;
      run.stats.teeth += b.teeth;
      if (boss) {
        run.met[bossId] = true;
        if (bossId === 'trapper') run.met.trapperDead = true;
        run.beaten += 1;
        run.candles = run.maxCandles;
        if (run.ri >= 3) {
          run.screen = 'won';
          run.over = { won: true };
          run.say = bossId === 'royal' ? 'The Limoncello sinks. Royal laughs all the way down.' : 'The Moon falls. Leshy sets down his camera. “Well played.”';
          return yes({ won: true });
        }
        // a rare (or not) for the boss
        run.node = { k: 'rare', offers: (on(run, 'norares') ? commonOffers(run, 3) : shuffled(run, D.RARES.filter(id => !(id === 'ouroboros' && run.deck.some(e => e.id === id)))).slice(0, 3)).map(id => ({ e: entry(id), shown: true })) };
        run.screen = 'node';
        run.say = on(run, 'norares') ? '“These are not rare cards,” Leshy mutters. Choose one anyway.' : 'Your candles burn anew. Choose a rare card.';
        if (n) n.done = true;
        return yes();
      }
      if (n) n.done = true;
      run.screen = 'map';
      run.say = b.teeth ? 'You win, and pocket ' + b.teeth + ' teeth from the overflowing scales.' : 'You win.';
      return yes();
    }
    // lost
    run.stats.lost += 1;
    run.candles -= 1;
    if (run.candles <= 0) {
      run.screen = 'over';
      run.over = { won: false, by: b.foe.name };
      run.say = 'Your last candle gutters out.';
      return yes({ dead: true });
    }
    if (boss) {
      run.say = 'A candle goes out. ' + D.BOSSES[bossId].name + ' waits for you to try again.';
      run.screen = 'map';
      // the boss is the only way on: stand on the row before it again
      const pr = run.map.rows.length - 2;
      run.pos = { r: pr, c: run.map.rows[pr][0].c };
      return yes();
    }
    if (n) n.done = true;
    run.screen = 'map';
    run.say = 'A candle goes out. The creatures let you pass.';
    return yes();
  }

  /* After the boss's rare: on to the next region. */
  function nextRegion(run) {
    run.ri += 1;
    run.seenEnc = [];
    run.node = null;
    buildMap(run);
    run.screen = 'map';
    run.say = run.ri >= 3 ? 'The path winds back to the cabin. Leshy waits.' : 'You come to ' + D.REGIONS[run.regions[run.ri]].name + '. ' + D.REGIONS[run.regions[run.ri]].text;
    return yes();
  }
  /* Leaving a node may move the run on (the boss's rare ends a region). */
  function done(run) {
    if (run.screen !== 'node') return no('Nothing to finish.');
    const k = run.node && run.node.k;
    if (k === 'rare') {
      if (run.node.taken == null) return no('Choose a card first.');
      return nextRegion(run);
    }
    return leave(run);
  }

  function removeHint(run) { return run.deck.length; }

  /* ---------------- reading ---------------- */
  function cpOf(ch) { return (ch || []).reduce((t, id) => t + (D.CHALLENGE[id] ? D.CHALLENGE[id].cp : 0), 0); }
  function where(run) {
    if (run.ri >= 3) return { name: 'Leshy’s Cabin', g: '🕯️' };
    const R = D.REGIONS[run.regions[run.ri]];
    return { name: R.name, g: R.g, n: run.ri + 1 };
  }

  const api = {
    VERSION, ROWS, FINAL_ROWS, TRIALS, NODE_TEXT, TRADE_N,
    newRun, nextNodes, nodeAt, go, leave, done, choose, reroll, trial, trialPasses, buy, prices, trade,
    warm, transfer, canHost, canGive, fuse, dupGroups, carve, setTotem, takeItem, altar, goobert, boulder,
    finishBattle, eggLights, statsOf, nameOf, isPelt, entry, cpOf, where, difficulty, bossFor, removeHint
  };
  if (isNode) module.exports = api;
  else root.InscRun = api;
})(typeof window !== 'undefined' ? window : this);
