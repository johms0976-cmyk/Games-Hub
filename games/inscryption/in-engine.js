'use strict';
/* Inscryption — Kaycee's Mod. The battle.
 *
 * One card battle against Leshy (or a boss): four lanes a side, Leshy's
 * queue behind his front row, the scales, Blood and Bones, every Act I and
 * Kaycee's Mod sigil, the items, and the bosses' phases. No DOM, no timers,
 * one seeded rng whose state lives in the battle (b.rs), so a battle is plain
 * JSON and the run can save mid-fight.
 *
 * Actions return { ok, why } and change `b` in place:
 *   draw(b, 'deck' | 'side')       the draw that opens your turn
 *   play(b, handIndex, slot, sacs) sacs = your slots to sacrifice
 *   useItem(b, itemIndex, slot)    slot only for items that target Leshy's row
 *   answer(b, choice)              a pending b.ask (Hoarder, Lens, the Trader)
 *   bell(b)                        your creatures attack, Leshy takes his turn
 * Every step that should be seen is pushed onto b.ev as a snapshot
 * ({ note, mark, st }); the page plays them back, then clears b.ev.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./in-data.js') : root.InscData;
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const no = why => ({ ok: false, why });
  const WIN = 5;

  /* ---------------- rng (state in b.rs) ---------------- */
  function rnd(b) {
    b.rs = (b.rs + 0x6D2B79F5) >>> 0;
    let t = b.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pick = (b, list) => list[Math.floor(rnd(b) * list.length)];
  function shuffle(b, list) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd(b) * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }

  /* ---------------- card instances ---------------- */
  /* From a deck entry { id, a, h, x, n } (or a bare id): a card for this battle. */
  function mk(b, src, owner, extra) {
    if (typeof src === 'string') src = { id: src };
    const def = D.card(src.id);
    if (!def) throw new Error('no card ' + src.id);
    const c = {
      u: ++b.uid, id: def.id, name: src.n || def.name, owner,
      atk: def.atk + (src.a || 0), hp: def.hp + (src.h || 0), dmg: 0,
      stat: def.stat, blood: def.blood, bones: def.bones,
      tribes: def.tribes.slice(), sig: def.sig.slice(), x: (src.x || []).slice(),
      dir: 1, lust: 0
    };
    if (src.di != null) c.di = src.di;          // which deck entry it came from
    if (src.fused) c.fused = 1;
    return Object.assign(c, extra || {});
  }
  const def = c => D.card(c.id);
  const isTerrain = c => !!def(c).terrain;
  const isPelt = c => !!def(c).pelt;

  /* Every sigil a creature bears now: printed, gained, and its side's totem. */
  function sigils(b, c) {
    if (c.bleached) return [];
    const out = c.sig.concat(c.x);
    const side = c.owner === 'me' ? b.me : b.foe;
    const t = side.totem;
    if (t && t.sigil && c.tribes.indexOf(t.tribe) >= 0 && out.indexOf(t.sigil) < 0) out.push(t.sigil);
    if (c.noFec) return out.filter(s => s !== 'fecundity');
    return out;
  }
  const has = (b, c, s) => !!c && sigils(b, c).indexOf(s) >= 0;
  const side = (b, k) => k === 'me' ? b.me : b.foe;
  const other = k => k === 'me' ? 'foe' : 'me';
  const hpLeft = c => c.hp - c.dmg;
  function slotOf(b, c) {
    const s = side(b, c.owner);
    for (let i = 0; i < 4; i++) if (s.board[i] === c) return i;
    return -1;
  }
  /* The creatures on a row, each once (the Moon fills all four spaces). */
  function inPlay(b, k) {
    const seen = [];
    side(b, k).board.forEach(c => { if (c && seen.indexOf(c) < 0) seen.push(c); });
    return seen;
  }

  /* Power right now, everything counted. */
  function power(b, c) {
    if (!c) return 0;
    const k = c.owner, s = side(b, k), i = slotOf(b, c);
    let p;
    switch (c.stat) {
      case 'ants': p = inPlay(b, k).filter(x => def(x).ant || x.id === 'amalgam' || x.id === 'hydra').length; break;
      case 'bell': p = i < 0 ? 0 : 4 - i; break;
      case 'hand': p = k === 'me' ? b.me.hand.length : s.queue.filter(Boolean).length; break;
      case 'mirror': {
        const o = i < 0 ? null : side(b, other(k)).board[i];
        p = o && o.stat !== 'mirror' ? power(b, o) : 0;
        break;
      }
      case 'bones': p = Math.floor((k === 'me' ? b.me.bones : 0) / 2); break;
      case 'spilled': p = b.sacrifices; break;
      default: p = c.atk;
    }
    if (c.stat) p += c.atk - def(c).atk;    // campfire and fusion on top of a variable stat
    p += c.lust + (c.morselA || 0);
    if (i >= 0) {
      [i - 1, i + 1].forEach(j => { const n = s.board[j]; if (n && n !== c && has(b, n, 'leader')) p += 1; });
      const o = side(b, other(k)).board[i];
      if (o && o !== c) {
        if (has(b, o, 'stinky') && !has(b, c, 'madeofstone')) p -= 1;
        if (has(b, o, 'annoying')) p += 1;
      }
    }
    return Math.max(0, p);
  }

  /* ---------------- snapshots for the page ----------------
     A card as the page draws it: Power where it stands now, Health left,
     every sigil it bears (and which were gained / come from a totem). */
  function view(b, c, where) {
    if (!c) return null;
    const d = def(c);
    const t = c.owner === 'me' ? b.me.totem : b.foe.totem;
    const list = sigils(b, c);
    let p;
    if (where === 'board') p = power(b, c);
    else p = c.stat ? null : c.atk + c.lust + (c.morselA || 0);
    const v = {
      u: c.u, id: c.id, name: c.name, p, h: hpLeft(c), mh: c.hp, stat: c.stat,
      sig: list, gx: c.x.slice(), tt: t && list.indexOf(t.sigil) >= 0 && c.sig.indexOf(t.sigil) < 0 && c.x.indexOf(t.sigil) < 0 ? t.sigil : null,
      blood: c.blood, bones: c.bones, tribes: c.tribes, dir: c.dir
    };
    if (c.as) { const a = D.card(c.as); v.as = c.as; v.name = a.name + '?'; v.blood = a.blood; v.bones = a.bones; v.p = a.stat ? null : a.atk; v.h = a.hp; v.mh = a.hp; v.sig = a.sig.slice(); v.stat = a.stat; }
    if (c.hooked) v.hooked = 1;
    if (c.sleepy) v.sleepy = 1;
    if (c.temp) v.temp = 1;
    if (c.fused) v.fused = 1;
    if (c.armorUsed) v.armorUsed = 1;
    if (d.giant) v.giant = 1;
    if (c.starveN) v.starveN = c.starveN;
    return v;
  }
  function snapshot(b) {
    return {
      me: { board: b.me.board.map(c => view(b, c, 'board')), hand: b.me.hand.map(c => view(b, c, 'hand')), bones: b.me.bones, deck: b.me.deck.length, side: b.me.side.length },
      foe: { board: b.foe.board.map(c => view(b, c, 'board')), queue: b.foe.queue.map(c => view(b, c, 'queue')), mask: b.foe.mask, hook: b.foe.hook, cannon: b.foe.cannon, phase: b.foe.phase },
      scale: b.scale, candles: b.foe.candles
    };
  }
  function shot(b, note, mark) {
    if (b.quiet) return;
    b.ev.push({ note: note || '', mark: mark || null, st: snapshot(b) });
  }
  function say(b, text) { b.log.push(text); shot(b, text); }

  /* ================================================================
     Setting up
     ================================================================ */
  /* opts: {
       seed, deck: [deck entries], sideDeck: 'squirrel' | 'aquasquirrel',
       items: [ids], itemCap, bones (boons), totem: { tribe, sigil } | null,
       tipped, hatch (Finical Hatchling's lights are all lit),
       foe: { kind: 'battle' | 'totem' | 'boss', region, d, enc, totem, boss, order, grizzly, harder }
     } */
  function newBattle(o) {
    const b = {
      v: 1, rs: (o.seed >>> 0) || 1, uid: 0, turn: 0, step: 'draw', ask: null, result: null,
      scale: o.tipped ? -1 : 0, teeth: 0, sacrifices: 0, fan: false, skipFoe: false,
      items: (o.items || []).slice(), itemCap: o.itemCap || 3, hatch: !!o.hatch,
      ev: [], log: [], starve: 0, ouro: 0, gained: [],
      me: { deck: [], side: [], hand: [], board: [null, null, null, null], bones: o.bones || 0, totem: o.totem || null, lastPlayed: 0 },
      foe: { board: [null, null, null, null], queue: [null, null, null, null], plan: [], ti: 0, totem: null, candles: 1, phase: 1, backlog: [], mask: null, maskN: 0, hook: null, cannon: null }
    };
    const f = o.foe || { kind: 'battle', region: 'woods', d: 0 };
    b.foeInfo = f;
    // your deck: shuffled; the opening hand holds a cheap card if there is one
    o.deck.forEach((e, i) => b.me.deck.push(mk(b, Object.assign({ di: i }, e), 'me')));
    shuffle(b, b.me.deck);
    const sid = o.sideDeck || 'squirrel';
    for (let i = 0; i < 10; i++) b.me.side.push(mk(b, sid, 'me'));
    const cheap = b.me.deck.findIndex(c => c.blood <= 1 && !c.bones && !isPelt(c));
    if (cheap > 2) { const [c] = b.me.deck.splice(cheap, 1); b.me.deck.unshift(c); }
    toHand(b, b.me.side.shift());
    for (let i = 0; i < 3 && b.me.deck.length; i++) toHand(b, b.me.deck.shift());
    shuffle(b, b.me.hand.slice(1)).forEach((c, i) => { b.me.hand[i + 1] = c; });
    setupFoe(b, f);
    b.quiet = false;
    b.ev = [];
    shot(b, 'The battle begins.');
    return b;
  }

  /* Which turns Leshy will play, resolved against the difficulty now. */
  function resolvePlan(turns, d) {
    return turns.map(t => {
      const out = [];
      t.forEach(e => {
        const m = /^([a-z0-9_]+)(?:>([a-z0-9_]+))?(?:@(\d+))?$/.exec(e);
        if (!m) return;
        const need = m[3] ? +m[3] : 0;
        if (m[2]) out.push(d >= need ? m[2] : m[1]);
        else if (d >= need) out.push(m[1]);
      });
      return out;
    });
  }

  /* Leshy's cards grow better as the run goes on: an extra sigil, or a point
     of Power or Health (More Difficult makes it likelier). */
  function hardenFoe(b, c) {
    const f = b.foeInfo, d = f.d || 0;
    if (isTerrain(c) || c.id === 'squirrel') return c;
    const chance = Math.max(0, (d - 2) * 0.08) + (f.harder || 0) * 0.12;
    if (rnd(b) < chance) {
      const r = rnd(b);
      if (r < 0.45) { const s = pick(b, D.FOE_TOTEM.filter(x => !has(b, c, x))); if (s) c.x.push(s); }
      else if (r < 0.75) c.hp += 1;
      else c.atk += 1;
    }
    return c;
  }

  function setupFoe(b, f) {
    const R = D.REGIONS[f.region] || D.REGIONS.woods;
    if (f.kind === 'boss') return setupBoss(b, f);
    const enc = R.enc.find(e => e.name === f.enc) || R.enc[0];
    b.foe.name = enc.name;
    b.foe.plan = resolvePlan(enc.turns, f.d || 0);
    // More Difficult: an extra card on some turns
    const extra = (f.harder || 0) + (f.d >= 5 ? 1 : 0);
    if (extra) b.foe.plan.forEach((t, i) => { if (i > 0 && rnd(b) < 0.22 * extra) t.push(pick(b, R.fill)); });
    (enc.board || []).forEach(id => { const i = pick(b, [0, 1, 2, 3].filter(j => !b.foe.board[j])); b.foe.board[i] = mk(b, id, 'foe'); });
    if (f.kind === 'totem') {
      const tribe = enc.tribe || pick(b, D.TRIBE_LIST);
      b.foe.totem = { tribe, sigil: f.totemSigil || pick(b, D.FOE_TOTEM) };
      // a totem battle leans on its tribe: swap a filler for one of the tribe
      if (!enc.tribe) b.foe.totem.tribe = tribeOfPlan(b) || tribe;
    }
    queueTurn(b);
  }
  function tribeOfPlan(b) {
    const n = {};
    b.foe.plan.forEach(t => t.forEach(id => D.card(id).tribes.forEach(tr => { n[tr] = (n[tr] || 0) + 1; })));
    let best = null;
    Object.keys(n).forEach(k => { if (k !== 'S' && (!best || n[k] > n[best])) best = k; });
    return best;
  }

  /* ---------------- the bosses ---------------- */
  /* Plans by boss, by how many bosses you have beaten before it (0, 1, 2).
     Kaycee's Mod: the Prospector and the Angler grow stronger later in the
     run, the Trapper weaker earlier. The lists are my design. */
  const BOSS_PLAN = {
    prospector: [
      [['coyote'], [], ['stoat'], ['wolfcub'], [], ['coyote'], [], ['stoat', 'coyote'], [], ['wolfcub']],
      [['coyote'], ['wolfcub'], [], ['coyote', 'stoat'], [], ['wolf'], [], ['coyote'], ['wolfcub']],
      [['wolfcub'], ['coyote'], ['wolf'], [], ['coyote', 'wolfcub'], [], ['alpha'], ['wolf'], []]
    ],
    prospector2: [
      [[], [], ['coyote'], [], ['wolfcub'], [], ['coyote']],
      [[], ['coyote'], [], ['wolfcub'], [], ['coyote', 'stoat']],
      [['coyote'], [], ['wolfcub'], ['coyote'], [], ['wolf']]
    ],
    angler: [
      [['kingfisher'], ['otter'], [], ['kingfisher', 'otter'], [], ['kingfisher'], ['otter'], [], ['kingfisher']],
      [['kingfisher', 'otter'], [], ['greatwhite'], ['kingfisher'], ['otter'], [], ['kingfisher', 'greatwhite'], []],
      [['kingfisher', 'otter'], ['greatwhite'], [], ['kingfisher', 'otter'], ['greatwhite'], [], ['kingfisher', 'otter'], ['greatwhite']]
    ],
    trapper: [
      [['rabbit'], [], ['bullfrog'], ['rabbit'], [], ['strangefrog'], [], ['rabbit']],
      [['bullfrog'], [], ['rabbit'], ['strangefrog'], [], ['bullfrog'], [], ['strangefrog']],
      [['bullfrog'], ['strangefrog'], [], ['wolf'], ['bullfrog'], [], ['strangefrog', 'wolf']]
    ],
    leshy: [['ravenegg'], ['amalgam'], [], ['mantisgod'], ['packrat'], [], ['urayuli'], [], ['daus', 'amoeba'], ['amalgam'], []],
    leshy2: [['dc_lost'], [], ['dc_hungry'], ['dc_pale'], [], ['dc_frozen'], ['dc_bone'], [], ['dc_shut'], ['dc_lost']],
    royal: [['skelcrew'], [], ['zparrot'], ['skelcrew'], [], ['zparrot', 'skelcrew'], [], ['skelcrew'], ['zparrot']],
    royal2: [['zparrot'], ['skelcrew'], [], ['skelcrew', 'zparrot'], [], ['skelcrew'], ['zparrot'], []]
  };
  const TRADER_POOL = ['wolf', 'raven', 'bloodhound', 'elk', 'mantis', 'porcupine', 'sparrow', 'bullfrog', 'stoat', 'skink', 'mudturtle', 'otter', 'coyote', 'wildbull', 'beaver', 'snapper'];

  function setupBoss(b, f) {
    const B = D.BOSSES[f.boss];
    b.foe.name = B.name;
    b.foe.boss = f.boss;
    b.foe.order = f.order || 0;
    b.foe.candles = (f.boss === 'leshy' || f.boss === 'royal') ? 3 : 2;
    if (f.totems) b.foe.totem = { tribe: B.head, sigil: f.totemSigil || pick(b, D.FOE_TOTEM) };
    const ord = Math.min(2, b.foe.order);
    if (f.boss === 'prospector') {
      b.foe.board[0] = mk(b, 'packmule', 'foe');
      b.foe.plan = BOSS_PLAN.prospector[ord].map(t => t.slice());
    } else if (f.boss === 'angler') {
      if (ord >= 2) [1, 2].forEach(i => { b.foe.board[i] = mk(b, 'baitbucket', 'foe'); });
      b.foe.plan = BOSS_PLAN.angler[ord].map(t => t.slice());
    } else if (f.boss === 'trapper') {
      const lanes = shuffle(b, [0, 1, 2, 3]);
      b.foe.board[lanes[0]] = mk(b, 'strangefrog', 'foe');
      b.foe.board[lanes[1]] = mk(b, 'strangefrog', 'foe');
      b.foe.board[lanes[2]] = mk(b, 'leapingtrap', 'foe');
      b.foe.plan = BOSS_PLAN.trapper[ord].map(t => t.slice());
    } else if (f.boss === 'leshy') {
      b.foe.board[pick(b, [1, 2])] = mk(b, 'moleman', 'foe');
      b.foe.plan = BOSS_PLAN.leshy.map(t => t.slice());
    } else if (f.boss === 'royal') {
      b.foe.board[0] = mk(b, 'moleseaman', 'foe');
      b.foe.board[3] = mk(b, 'moleseaman', 'foe');
      b.foe.plan = BOSS_PLAN.royal.map(t => t.slice());
    }
    queueTurn(b);
  }

  /* The boss loses a candle: the scales reset and the next phase begins. */
  function bossPhase(b) {
    const f = b.foeInfo, boss = b.foe.boss;
    b.foe.phase += 1;
    b.scale = 0;
    b.foe.mask = null;
    b.foe.hook = null;
    b.foe.cannon = null;
    const ord = Math.min(2, b.foe.order);
    if (f.grizzly && b.foe.phase === 2 && ['prospector', 'angler', 'trapper'].indexOf(boss) >= 0) {
      clearFoe(b);
      for (let i = 0; i < 4; i++) {
        b.foe.board[i] = mk(b, 'grizzly', 'foe', { x: ['mightyleap'] });
        b.foe.queue[i] = mk(b, 'grizzly', 'foe', { x: ['mightyleap'] });
      }
      b.foe.plan = [];
      say(b, 'Too fast. Too soon. Eight Grizzlies lumber out of the dark.');
      return;
    }
    if (boss === 'prospector') {
      say(b, '“Thar’s gold in them cards!” The Prospector swings his pickaxe.');
      goldRush(b);
      // (my design) his own creatures scatter too — only the Pack Mule stays
      for (let i = 0; i < 4; i++) { b.foe.queue[i] = null; if (b.foe.board[i] && b.foe.board[i].id !== 'packmule') b.foe.board[i] = null; }
      b.foe.backlog = [];
      const hound = mk(b, 'bloodhound', 'foe');
      if (ord > 1) hound.x.push(pick(b, ['touch', 'bifurcated']));
      placeQueue(b, hound);
      b.foe.plan = BOSS_PLAN.prospector2[ord].map(t => t.slice());
    } else if (boss === 'angler') {
      clearFoe(b);
      say(b, 'The Angler empties his side and baits the water.');
      b.foe.plan = [];
      b.foe.bait = ord >= 2 ? 'greatwhite' : 'baitbucket';
      for (let i = 0; i < 4; i++) if (b.me.board[i]) b.foe.board[i] = mk(b, b.foe.bait, 'foe');
    } else if (boss === 'trapper') {
      clearFoe(b);
      say(b, 'The Trapper turns his mask upside down. It is the Trader.');
      // met first, she is weaker: small front-row cards, sigils only behind
      for (let i = 0; i < 4; i++) {
        b.foe.board[i] = ord >= 1 ? traderCard(b, ord >= 2) : mk(b, pick(b, ['rabbit', 'squirrel', 'stoat', 'bullfrog', 'sparrow', 'skunk']), 'foe');
        b.foe.queue[i] = traderCard(b, true);
      }
      // your Wolf Pelts in play come back, and she gives you one more
      for (let i = 0; i < 4; i++) {
        const c = b.me.board[i];
        if (c && c.id === 'wolfpelt') { b.me.board[i] = null; c.dmg = 0; b.me.hand.push(c); }
      }
      b.me.hand.push(mk(b, 'wolfpelt', 'me', { temp: 1 }));
      b.foe.plan = [['wolf'], [], ['raven'], [], ['bloodhound']];
      openTrade(b, 99);
    } else if (boss === 'leshy') {
      if (b.foe.phase === 2) {
        clearFoe(b);
        say(b, 'Leshy blocks your creatures with trees and stumps, and reaches for the deathcards.');
        for (let i = 0; i < 4; i++) {
          const c = b.me.board[i];
          if (c && !has(b, c, 'bifurcated')) b.foe.board[i] = mk(b, has(b, c, 'airborne') ? 'grandfir' : 'stump', 'foe');
        }
        b.foe.plan = BOSS_PLAN.leshy2.map(t => t.slice());
      } else {
        clearFoe(b);
        say(b, 'Leshy turns to the window and photographs the Moon.');
        const moon = mk(b, 'moon', 'foe');
        for (let i = 0; i < 4; i++) b.foe.board[i] = moon;
        b.foe.plan = [];
        b.foe.moon = true;
      }
    } else if (boss === 'royal') {
      if (b.foe.phase === 2) {
        say(b, '“Fresh crew!” Royal runs out two more Mole Seamen, and tosses you a pack of vermin.');
        [0, 3].forEach(i => { if (b.foe.board[i]) b.foe.board[i] = null; b.foe.board[i] = mk(b, 'moleseaman', 'foe'); });
        const pack = shuffle(b, D.VERMIN.slice()).slice(0, 4);
        pack.forEach(id => toHand(b, mk(b, id, 'me', { temp: 1 })));
        b.foe.plan = BOSS_PLAN.royal2.map(t => t.slice());
      } else {
        clearFoe(b);
        say(b, 'The cannons fall silent. The Limoncello sails onto the table.');
        const ship = mk(b, 'limoncello', 'foe');
        for (let i = 0; i < 4; i++) b.foe.board[i] = ship;
        b.foe.plan = [];
        b.foe.moon = true;
      }
    }
    b.foe.ti = 0;
    // what a boss brings out at a phase change waits a turn before it attacks
    inPlay(b, 'foe').forEach(c => { c.sleepy = true; });
    shot(b, 'Phase ' + b.foe.phase + '.');
  }
  function clearFoe(b) {
    for (let i = 0; i < 4; i++) { b.foe.board[i] = null; b.foe.queue[i] = null; }
    b.foe.backlog = [];
  }
  function traderCard(b, withSigil) {
    const c = mk(b, pick(b, TRADER_POOL), 'foe');
    if (withSigil) { const s = pick(b, D.MODULAR.filter(x => !has(b, c, x) && x !== 'amorphous')); if (s) c.x.push(s); }
    return c;
  }
  /* Your creatures turn to gold. Corpse Eaters in your hand take the spaces first. */
  function goldRush(b) {
    for (let i = 0; i < 4; i++) {
      const c = b.me.board[i];
      if (!c) continue;
      kill(b, 'me', i, 'effect');
      if (!b.me.board[i]) b.me.board[i] = mk(b, 'goldnugget', 'me', { temp: 1 });
    }
    shot(b, 'Gold.');
  }
  /* Trading with the Trader (her boss phase, or Leshy's Trader mask): each
     Wolf Pelt in your hand buys one of her cards, into your hand. */
  function openTrade(b, limit) {
    const pelts = b.me.hand.filter(c => c.id === 'wolfpelt').length;
    if (!pelts) return;
    b.ask = { k: 'trade', left: Math.min(pelts, limit) };
    shot(b, 'Trade your Wolf Pelts for her cards.');
  }

  /* ================================================================
     Leshy's placements
     ================================================================ */
  function queueTurn(b) {
    if (b.foe.moon) return;
    let ids = b.foe.backlog.splice(0);
    if (b.foe.boss === 'angler' && b.foe.phase === 2) {
      // only bait: one opposite each of your creatures that has nothing facing it
      for (let i = 0; i < 4; i++) if (b.me.board[i] && !b.foe.board[i] && !b.foe.queue[i]) b.foe.queue[i] = mk(b, b.foe.bait, 'foe');
      return;
    }
    if (b.foe.ti < b.foe.plan.length) ids = ids.concat(b.foe.plan[b.foe.ti]);
    else if (!b.foe.boss && b.foe.ti % 2 === 0) ids.push(pick(b, (D.REGIONS[b.foeInfo.region] || D.REGIONS.woods).fill));
    else if (b.foe.boss && b.foe.ti % 2 === 0 && b.foe.plan.length) ids = ids.concat(b.foe.plan[b.foe.ti % b.foe.plan.length]);
    b.foe.ti += 1;
    ids.forEach(id => {
      const c = typeof id === 'string' ? hardenFoe(b, mk(b, id, 'foe')) : id;
      if (!placeQueue(b, c)) b.foe.backlog.push(c);
    });
  }
  /* Pick a queue space: where it lands soonest, kills something, or hits you. */
  function placeQueue(b, c) {
    const open = [0, 1, 2, 3].filter(i => !b.foe.queue[i]);
    if (!open.length) return false;
    let best = open[0], bestScore = -1e9;
    const p = c.stat ? 1 : c.atk;
    open.forEach(i => {
      let s = rnd(b) * 1.2;
      if (!b.foe.board[i]) s += 2.5;
      const mine = b.me.board[i];
      if (isTerrain(c)) s += mine ? power(b, mine) : -1;
      else if (p > 0) {
        if (!mine) s += 1.6;
        else if (p >= hpLeft(mine) && !has(b, mine, 'repulsive')) s += 2.2 + mine.blood;
        else s += 0.3;
        if (mine && power(b, mine) >= c.hp) s -= 1.2;
      } else s += mine ? 0.8 : 0;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    b.foe.queue[best] = c;
    return true;
  }

  /* ================================================================
     Your hand
     ================================================================ */
  /* Whatever enters your hand: Amorphous resolves, the egg checks its lights,
     the Ijiraq puts on a disguise. */
  function toHand(b, c) {
    if (!c) return;
    c.owner = 'me';
    ['sig', 'x'].forEach(k => {
      const i = c[k].indexOf('amorphous');
      if (i >= 0) c[k][i] = pick(b, D.MODULAR.filter(s => s !== 'amorphous' && s !== c[k][i]));
    });
    if (c.id === 'egg' && b.hatch) {
      const h = mk(b, { id: 'hydra', x: c.x, a: c.atk - D.card('egg').atk, h: c.hp - D.card('egg').hp }, 'me');
      h.di = c.di;
      b.log.push('The Curious Egg hatches. It is the Hydra.');
      c = h;
    }
    if (c.id === 'ijiraq' && !c.as) {
      const others = b.me.deck.concat(b.me.hand).filter(x => x.id !== 'ijiraq' && !isPelt(x));
      const as = others.length ? pick(b, others) : null;
      c.as = as ? as.id : 'stoat';
    }
    b.me.hand.push(c);
  }
  /* What a hand card costs to play (an Ijiraq costs what it pretends to be). */
  function costOf(c) {
    if (c.as) { const d = D.card(c.as); return { blood: d.blood, bones: d.bones, fake: true }; }
    return { blood: c.blood, bones: c.bones };
  }
  const sacValue = (b, c) => has(b, c, 'worthy') ? 3 : 1;
  function canSacrifice(b, c) {
    return !!c && c.owner === 'me' && !isTerrain(c) && !def(c).noSac && !def(c).giant;
  }

  function draw(b, from) {
    if (b.result) return no('The battle is over.');
    if (b.step !== 'draw') return no('You have drawn this turn.');
    const pile = from === 'side' ? b.me.side : b.me.deck;
    if (!pile.length) return no(from === 'side' ? 'No squirrels left.' : 'Your deck is empty.');
    toHand(b, pile.shift());
    b.step = 'main';
    return yes();
  }

  /* How much you could pay right now: a cheap test for the page. */
  function playable(b, hi) {
    const c = b.me.hand[hi];
    if (!c) return no('No such card.');
    const cost = costOf(c);
    if (cost.bones > b.me.bones) return no('Needs ' + cost.bones + ' Bones.');
    const blood = inPlay(b, 'me').filter(x => canSacrifice(b, x)).reduce((t, x) => t + sacValue(b, x), 0);
    if (cost.blood > blood) return no('Needs ' + cost.blood + ' Blood: not enough creatures to sacrifice.');
    if (!cost.blood && !b.me.board.some(x => !x)) return no('No empty space.');
    if (cost.blood) {
      // after the sacrifices, will a space be free? (Many Lives stay put)
      const canFree = inPlay(b, 'me').some(x => canSacrifice(b, x) && !has(b, x, 'manylives'));
      if (!canFree && !b.me.board.some(x => !x)) return no('No space would come free.');
    }
    return yes({ blood: cost.blood, bones: cost.bones });
  }

  function play(b, hi, slot, sacs) {
    if (b.result) return no('The battle is over.');
    if (b.ask) return no('Answer first.');
    if (b.step !== 'main') return no('Draw first.');
    const c = b.me.hand[hi];
    if (!c) return no('No such card.');
    if (!(slot >= 0 && slot < 4)) return no('Choose a space.');
    sacs = (sacs || []).filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < 4);
    const cost = costOf(c);
    if (cost.bones > b.me.bones) return no('Needs ' + cost.bones + ' Bones.');
    if (cost.blood) {
      let total = 0, min = 9;
      for (const s of sacs) {
        const x = b.me.board[s];
        if (!canSacrifice(b, x)) return no('That cannot be sacrificed.');
        const v = sacValue(b, x);
        total += v; min = Math.min(min, v);
      }
      if (total < cost.blood) return no('Needs ' + cost.blood + ' Blood.');
      if (total - min >= cost.blood) return no('One sacrifice too many.');
    } else if (sacs.length) return no('It costs no Blood.');
    // the space must be free once the sacrifices are made
    const freed = s => sacs.indexOf(s) >= 0 && !has(b, b.me.board[s], 'manylives');
    if (b.me.board[slot] && !freed(slot)) return no('That space is taken.');
    // pay
    b.me.hand.splice(hi, 1);
    if (!cost.fake) b.me.bones -= cost.bones;
    let morselA = 0, morselH = 0;
    sacs.forEach(s => {
      const x = b.me.board[s];
      b.sacrifices += 1;
      if (has(b, x, 'morsel')) { morselA += power(b, x); morselH += x.hp; }
      if (has(b, x, 'manylives')) {
        x.sacN = (x.sacN || 0) + 1;
        if (x.id === 'child13' || x.id === 'child13w') transform(b, x, x.id === 'child13' ? 'child13w' : 'child13');
        else if (x.id === 'cat' && x.sacN >= 9) { transform(b, x, 'undeadcat'); b.log.push('The Cat has spent its ninth life. It rises, undead.'); }
        shot(b, x.name + ' is sacrificed — and lives.', { side: 'me', slot: s, k: 'sac' });
      } else {
        kill(b, 'me', s, 'sac');
      }
    });
    // the Ijiraq shows its face
    if (c.as) { b.log.push('It was the Ijiraq all along.'); delete c.as; }
    if (morselA || morselH) { c.morselA = (c.morselA || 0) + morselA; c.morselH = (c.morselH || 0) + morselH; c.hp += morselH; }
    place(b, 'me', slot, c);
    b.me.lastPlayed = c.u;
    shot(b, 'You play ' + c.name + '.', { side: 'me', slot, k: 'play' });
    onPlay(b, c, slot);
    checkEnd(b);
    return yes();
  }

  function place(b, k, slot, c) {
    c.owner = k;
    side(b, k).board[slot] = c;
    c.fresh = true;
    if (k === 'me' && isPelt(c)) peltLice(b);
    guard(b, k, slot);
  }
  /* Guardian: an enemy arrives opposite an empty space — move to face it. */
  function guard(b, k, slot) {
    const o = other(k), os = side(b, o);
    if (os.board[slot]) return;
    const g = inPlay(b, o).find(x => has(b, x, 'guardian') && !def(x).giant);
    if (!g) return;
    const from = slotOf(b, g);
    os.board[from] = null;
    os.board[slot] = g;
    shot(b, g.name + ' guards.', { side: o, slot, k: 'move' });
  }
  /* Playing a pelt calls any Pelt Lice in your deck or hand onto open spaces (three at most). */
  function peltLice(b) {
    let n = 0;
    for (const pile of [b.me.hand, b.me.deck]) {
      for (let i = pile.length - 1; i >= 0 && n < 3; i--) {
        if (pile[i].id !== 'peltlice') continue;
        const s = b.me.board.findIndex(x => !x);
        if (s < 0) return;
        const [l] = pile.splice(i, 1);
        b.me.board[s] = l; l.owner = 'me'; l.fresh = true; n++;
        shot(b, 'Pelt Lice leap onto the table.', { side: 'me', slot: s, k: 'play' });
      }
    }
  }

  /* What a card does as it lands. */
  function onPlay(b, c, slot) {
    const k = c.owner;
    const give = id => {
      if (k === 'me') toHand(b, mk(b, id, 'me', { temp: 1 }));
      else placeQueue(b, mk(b, id, 'foe'));
    };
    if (has(b, c, 'rabbithole')) give('rabbit');
    if (has(b, c, 'antspawner')) give('ant');
    if (has(b, c, 'fecundity') && k === 'me') {
      const copy = mk(b, { id: c.id, x: c.x, n: c.name }, 'me', { temp: 1, noFec: true });
      copy.atk = c.atk; copy.hp = c.hp - (c.morselH || 0);
      toHand(b, copy);
    }
    if (has(b, c, 'dam')) [slot - 1, slot + 1].forEach(j => { if (j >= 0 && j < 4 && !side(b, k).board[j]) place(b, k, j, mk(b, 'dam', k, { temp: 1 })); });
    if (has(b, c, 'bellist')) [slot - 1, slot + 1].forEach(j => { if (j >= 0 && j < 4 && !side(b, k).board[j]) place(b, k, j, mk(b, 'chime', k, { temp: 1 })); });
    if (has(b, c, 'brood')) {
      const o = other(k);
      if (!side(b, o).board[slot]) { side(b, o).board[slot] = mk(b, 'brokenegg', o, { temp: 1 }); shot(b, 'An egg is laid opposite.', { side: o, slot, k: 'play' }); }
    }
    if (has(b, c, 'trinket') && k === 'me') {
      if (b.items.length < b.itemCap) { const it = pick(b, D.ITEM_POOL); b.items.push(it); b.gained.push(it); say(b, 'The Pack Rat brings you ' + D.ITEMS[it].name + '.'); }
    }
    if (has(b, c, 'hoarder') && k === 'me' && b.me.deck.length) b.ask = { k: 'hoard' };
  }

  /* ================================================================
     Death
     ================================================================ */
  /* how: 'combat' | 'sac' | 'effect' */
  function kill(b, k, slot, how) {
    const s = side(b, k), c = s.board[slot];
    if (!c) return;
    for (let i = 0; i < 4; i++) if (s.board[i] === c) s.board[i] = null;
    const d = def(c);
    // bones: yours always; theirs too while you have a Scavenger in play
    const bonesFor = has(b, c, 'boneking') ? 4 : 1;
    if (k === 'me') b.me.bones += bonesFor;
    else if (inPlay(b, 'me').some(x => has(b, x, 'scavenger'))) b.me.bones += bonesFor;
    if (how !== 'sac') shot(b, c.name + ' perishes.', { side: k, slot, k: 'die' });
    if (has(b, c, 'unkillable')) {
      if (c.id === 'ouroboros') {
        c.atk += 1; c.hp += 1;
        if (k === 'me') { b.ouro += 1; if (c.di != null) { b.ouroBy = b.ouroBy || {}; b.ouroBy[c.di] = (b.ouroBy[c.di] || 0) + 1; } }
      }
      const copy = mk(b, { id: c.id, x: c.x, n: c.name }, k, { temp: c.temp, di: c.di });
      copy.atk = c.atk; copy.hp = c.hp; copy.lust = 0;
      if (k === 'me') toHand(b, copy);
      else placeQueue(b, copy);
    }
    if (has(b, c, 'frozenaway')) s.board[slot] = mk(b, 'opossum', k, { temp: 1 });
    if (c.id === 'baitbucket') { s.board[slot] = mk(b, 'greatwhite', k); shot(b, 'A Great White bursts from the bucket.', { side: k, slot, k: 'play' }); }
    if (c.id === 'strangefrog') { s.board[slot] = mk(b, 'leapingtrap', k); shot(b, 'A Leaping Trap springs up.', { side: k, slot, k: 'play' }); }
    if (has(b, c, 'steeltrap')) {
      const o = other(k);
      if (side(b, o).board[slot] && !def(side(b, o).board[slot]).giant) { shot(b, 'The trap snaps shut.', { side: o, slot, k: 'hit' }); kill(b, o, slot, 'effect'); }
      toHand(b, mk(b, 'wolfpelt', 'me', { temp: 1 }));
    }
    if (c.id === 'packmule' && k === 'foe') {
      say(b, 'The Pack Mule falls, and its pack spills open.');
      toHand(b, mk(b, 'squirrel', 'me', { temp: 1 }));
      const by = f => D.COMMONS.filter(id => f(D.card(id)));
      toHand(b, mk(b, pick(b, by(x => x.blood === 1)), 'me', { temp: 1 }));
      toHand(b, mk(b, pick(b, by(x => x.blood === 2)), 'me', { temp: 1 }));
      toHand(b, mk(b, pick(b, by(x => x.bones > 0)), 'me', { temp: 1 }));
    }
    if (d.giant) { b.foe.moonDown = true; say(b, c.name + ' is destroyed.'); }
    // Corpse Eater: one of yours died fighting — a Corpse Eater in hand takes its space
    if (k === 'me' && how === 'combat' && !s.board[slot]) {
      const ce = b.me.hand.findIndex(x => has(b, x, 'corpseeater'));
      if (ce >= 0) {
        const [x] = b.me.hand.splice(ce, 1);
        delete x.as;
        place(b, 'me', slot, x);
        shot(b, x.name + ' feeds on the fallen.', { side: 'me', slot, k: 'play' });
        onPlay(b, x, slot);
      }
    }
  }

  function transform(b, c, id) {
    const nd = D.card(id), od = def(c);
    c.atk += nd.atk - od.atk;
    c.hp += nd.hp - od.hp;
    c.id = id; c.name = nd.name; c.stat = nd.stat;
    c.sig = nd.sig.slice(); c.tribes = nd.tribes.slice();
  }
  /* Fledgling: grow up. Printed forms where Act I has them, else "Elder". */
  function evolve(b, c) {
    const d = def(c);
    if (d.evo) {
      transform(b, c, d.evo);
      // a gained Fledgling is spent too
      c.x = c.x.filter(s => s !== 'fledgling');
    } else {
      c.atk += 1; c.hp += 2;
      c.name = d.evoName || ('Elder ' + c.name);
      c.sig = c.sig.filter(s => s !== 'fledgling');
      c.x = c.x.filter(s => s !== 'fledgling');
      c.grown = 1;
    }
  }

  /* ================================================================
     Combat
     ================================================================ */
  function strikes(b, c, i) {
    if (has(b, c, 'omni')) return ['omni'];
    const bi = has(b, c, 'bifurcated'), tri = has(b, c, 'trifurcated');
    let t;
    if (bi && tri) t = [i - 1, i - 1, i, i + 1, i + 1];
    else if (tri) t = [i - 1, i, i + 1];
    else if (bi) t = [i - 1, i + 1];
    else t = [i];
    t = t.filter(j => j >= 0 && j < 4);
    if (has(b, c, 'doublestrike')) t = t.concat(t);
    return t;
  }
  const submerged = (b, c) => has(b, c, 'waterborne') || has(b, c, 'kraken');

  function combat(b, k) {
    const s = side(b, k), done = [];
    for (let i = 0; i < 4; i++) {
      const a = s.board[i];
      if (!a || done.indexOf(a) >= 0) continue;
      done.push(a);
      if (a.sleepy) { a.sleepy = false; continue; }
      if (power(b, a) <= 0) continue;
      const list = strikes(b, a, i);
      for (const t of list) {
        if (slotOf(b, a) < 0 || b.result) break;
        if (t === 'omni') {
          const targets = inPlay(b, other(k));
          if (!targets.length) direct(b, k, a, power(b, a));
          else targets.forEach(x => { const j = slotOf(b, x); if (j >= 0 && slotOf(b, a) >= 0) strike(b, k, a, j); });
        } else strike(b, k, a, t);
      }
    }
  }

  function direct(b, k, a, p) {
    b.scale += k === 'me' ? p : -p;
    shot(b, a.name + ' strikes ' + (k === 'me' ? 'Leshy' : 'you') + ' for ' + p + '.', { side: other(k), slot: slotOf(b, a), k: 'direct', n: p });
  }

  function strike(b, k, a, t) {
    const o = other(k), os = side(b, o);
    let p = power(b, a);
    if (p <= 0) return;
    const flying = has(b, a, 'airborne') || (k === 'me' && b.fan);
    let d = os.board[t];
    // Burrower: tunnel into an empty space about to be hit
    if (!d) {
      const bur = inPlay(b, o).find(x => has(b, x, 'burrower') && !def(x).giant);
      if (bur && (!flying || has(b, bur, 'mightyleap'))) {
        os.board[slotOf(b, bur)] = null; os.board[t] = bur; d = bur;
        shot(b, bur.name + ' burrows into the way.', { side: o, slot: t, k: 'move' });
      }
    }
    if (d && submerged(b, d)) d = null;
    if (d && flying && !has(b, d, 'mightyleap')) d = null;
    if (d && has(b, d, 'repulsive')) { shot(b, a.name + ' will not touch ' + d.name + '.', { side: o, slot: t, k: 'miss' }); return; }
    if (!d) { direct(b, k, a, p); return; }
    // Loose Tail: shed a tail and scurry away
    if (has(b, d, 'loosetail') && !d.shed) {
      const to = [t + 1, t - 1].find(j => j >= 0 && j < 4 && !os.board[j]);
      if (to != null) {
        os.board[t] = null; os.board[to] = d; d.shed = true;
        d.sig = d.sig.filter(x => x !== 'loosetail'); d.x = d.x.filter(x => x !== 'loosetail');
        const tl = mk(b, D.tailFor(def(d)), o, { temp: 1 });
        os.board[t] = tl;
        shot(b, d.name + ' drops its tail and scurries off.', { side: o, slot: to, k: 'move' });
        d = tl;
      }
    }
    hurt(b, a, d, p, t);
  }

  /* Attacker a deals p to defender d in lane t. */
  function hurt(b, a, d, p, t) {
    const k = a.owner, o = d.owner, os = side(b, o);
    const before = hpLeft(d);
    if (has(b, d, 'armored') && !d.armorUsed) {
      d.armorUsed = true;
      shot(b, d.name + '’s armour takes the blow.', { side: o, slot: t, k: 'hit', n: 0 });
    } else {
      d.dmg += p;
      if (has(b, a, 'touch') && !has(b, d, 'madeofstone')) d.dmg = Math.max(d.dmg, d.hp);
      shot(b, a.name + ' hits ' + d.name + ' for ' + p + '.', { side: o, slot: t, k: 'hit', n: p });
    }
    if (has(b, d, 'beeswithin')) {
      if (o === 'me') toHand(b, mk(b, 'bee', 'me', { temp: 1 }));
      else placeQueue(b, mk(b, 'bee', 'foe'));
    }
    if (d.id === 'chime') {
      const daus = inPlay(b, o).find(x => has(b, x, 'bellist'));
      if (daus && slotOf(b, a) >= 0 && power(b, daus) > 0) {
        shot(b, 'The chime rings. The Daus answers.', { side: k, slot: slotOf(b, a), k: 'hit' });
        const dp = power(b, daus);
        a.dmg += dp;
        if (has(b, daus, 'touch') && !has(b, a, 'madeofstone')) a.dmg = Math.max(a.dmg, a.hp);
        if (hpLeft(a) <= 0) kill(b, k, slotOf(b, a), 'combat');
      }
    }
    if (has(b, d, 'quills') && slotOf(b, a) >= 0) {
      a.dmg += 1;
      shot(b, a.name + ' is pricked by quills.', { side: k, slot: slotOf(b, a), k: 'hit', n: 1 });
      if (hpLeft(a) <= 0) kill(b, k, slotOf(b, a), 'combat');
    }
    if (hpLeft(d) <= 0 && slotOf(b, d) >= 0) {
      const over = p - Math.max(0, before);
      const j = slotOf(b, d);
      kill(b, o, j, 'combat');
      if (slotOf(b, a) >= 0 && has(b, a, 'bloodlust')) { a.lust += 1; shot(b, a.name + ' grows stronger.', { side: k, slot: slotOf(b, a), k: 'buff' }); }
      // Act I overkill: your excess damage carries into the card queued behind
      if (k === 'me' && over > 0 && b.foe.queue[t] && !has(b, a, 'touch')) {
        const q = b.foe.queue[t];
        q.dmg += over;
        shot(b, 'The blow carries through to ' + q.name + '.', { side: 'foe', slot: t, k: 'hitq', n: over });
        if (hpLeft(q) <= 0) { b.foe.queue[t] = null; shot(b, q.name + ' perishes in the queue.', { side: 'foe', slot: t, k: 'dieq' }); }
      }
    }
  }

  /* The scales: has anyone won? */
  function checkScale(b) {
    if (b.result) return true;
    if (b.scale >= WIN) {
      b.teeth += b.scale - WIN;
      b.foe.candles -= 1;
      if (b.foe.candles <= 0) {
        b.result = 'win';
        b.teeth = Math.max(b.teeth, 0);
        say(b, b.foe.boss ? D.BOSSES[b.foe.boss].name + ' is beaten.' : 'The scales tip. You win.');
        return true;
      }
      shot(b, 'A candle goes out on ' + b.foe.name + '’s side.');
      bossPhase(b);
      return true;
    }
    if (b.scale <= -WIN) {
      b.result = 'lose';
      say(b, 'The scales tip against you.');
      return true;
    }
    return false;
  }
  function checkEnd(b) { if (!b.result) checkScale(b); }

  /* ================================================================
     Turns
     ================================================================ */
  function startTurn(b, k) {
    const s = side(b, k);
    inPlay(b, k).forEach(c => {
      if (has(b, c, 'fledgling') && !c.fresh) { const n = c.name; evolve(b, c); shot(b, n + ' grows into ' + c.name + '.', { side: k, slot: slotOf(b, c), k: 'buff' }); }
      if (has(b, c, 'kraken') && !c.fresh) {
        const t = pick(b, ['belltentacle', 'cardtentacle', 'mirrortentacle']);
        transform(b, c, t);
        c.x = c.x.filter(x => x !== 'kraken');
        shot(b, 'The Great Kraken surfaces as ' + c.name + '.', { side: k, slot: slotOf(b, c), k: 'buff' });
      }
    });
    if (inPlay(b, k).some(c => has(b, c, 'tidallock'))) {
      ['me', 'foe'].forEach(kk => inPlay(b, kk).forEach(x => {
        if (x.id === 'squirrel' || x.id === 'aquasquirrel' || x.id === 'rabbit') { const j = slotOf(b, x); kill(b, kk, j, 'effect'); }
      }));
    }
  }

  /* Sprinter, Hefty, Rampager; Bone Digger. */
  function endTurn(b, k) {
    const s = side(b, k);
    const movers = inPlay(b, k).filter(c => !def(c).giant && (has(b, c, 'sprinter') || has(b, c, 'hefty') || has(b, c, 'rampager')));
    movers.forEach(c => {
      const i = slotOf(b, c);
      if (i < 0) return;
      for (let tries = 0; tries < 2; tries++) {
        const j = i + c.dir;
        if (j < 0 || j > 3) { c.dir = -c.dir; continue; }
        if (has(b, c, 'rampager')) {
          const occ = s.board[j];
          if (occ && def(occ).giant) { c.dir = -c.dir; continue; }
          s.board[j] = c; s.board[i] = occ || null;
          shot(b, c.name + ' rampages.', { side: k, slot: j, k: 'move' });
          if (!occ) guard(b, k, j);
          return;
        }
        if (has(b, c, 'hefty')) {
          // push the chain ahead into the first empty space
          let e = j;
          while (e >= 0 && e < 4 && s.board[e]) e += c.dir;
          if (e < 0 || e > 3 || s.board.slice(Math.min(i, e), Math.max(i, e) + 1).some(x => x && def(x).giant)) { c.dir = -c.dir; continue; }
          for (let m = e; m !== i; m -= c.dir) s.board[m] = s.board[m - c.dir];
          s.board[i] = null;
          shot(b, c.name + ' shoves ahead.', { side: k, slot: j, k: 'move' });
          guard(b, k, j);
          return;
        }
        if (s.board[j]) { c.dir = -c.dir; continue; }
        s.board[j] = c; s.board[i] = null;
        shot(b, c.name + ' moves.', { side: k, slot: j, k: 'move' });
        guard(b, k, j);
        return;
      }
    });
    if (k === 'me') inPlay(b, 'me').forEach(c => { if (has(b, c, 'bonedigger')) b.me.bones += 1; });
    if (k === 'me') b.fan = false;
    // what was placed this turn has now survived until the turn's end
    inPlay(b, k).forEach(c => { c.fresh = false; });
  }

  /* Ring the bell. */
  function bell(b) {
    if (b.result) return no('The battle is over.');
    if (b.ask) return no('Answer first.');
    if (b.step !== 'main') return no('Draw first.');
    b.ev = [];
    shot(b, 'You ring the bell.');
    combat(b, 'me');
    checkScale(b);
    if (b.result) return yes();
    if (b.ask) { b.pending = 'afterMine'; return yes(); }
    afterMine(b);
    return yes();
  }
  function afterMine(b) {
    endTurn(b, 'me');
    foeTurn(b);
    if (!b.result && !b.ask) myTurn(b);
  }

  function foeTurn(b) {
    if (b.skipFoe) {
      b.skipFoe = false;
      say(b, 'The hourglass runs. Leshy does nothing.');
      return;
    }
    startTurn(b, 'foe');
    // the queue steps forward
    for (let i = 0; i < 4; i++) {
      const q = b.foe.queue[i];
      if (q && !b.foe.board[i]) {
        b.foe.queue[i] = null;
        place(b, 'foe', i, q);
        q.fresh = false;
        shot(b, q.name + ' steps forward.', { side: 'foe', slot: i, k: 'play' });
        if (has(b, q, 'dam') || has(b, q, 'brood') || has(b, q, 'rabbithole') || has(b, q, 'antspawner')) onPlay(b, q, i);
      }
    }
    preAttack(b);
    if (b.result || b.ask) { if (b.ask) b.pending = 'attack'; return; }
    finishFoe(b);
  }
  function finishFoe(b) {
    combat(b, 'foe');
    if (checkScale(b) && (b.result || b.ask)) return;
    if (b.foe.moon && !b.foe.moonDown && !b.me.deck.length && !b.me.side.length) {
      const m = inPlay(b, 'foe').find(c => def(c).giant);
      if (m) { m.atk += 1; shot(b, m.name + ' swells.'); }
    }
    endTurn(b, 'foe');
    postAttack(b);
    // Starvation: nine and more add weight every turn
    inPlay(b, 'foe').forEach(c => { if (c.id === 'starvation' && c.starveN >= 9) { b.scale -= 1; shot(b, 'Starvation gnaws at the scales.'); } });
    if (checkScale(b)) return;
    if (!b.foe.moonDown) queueTurn(b);
    b.turn += 1;
  }

  /* Masks, hooks, cannons: before Leshy's creatures attack. */
  function preAttack(b) {
    const boss = b.foe.boss;
    if (boss === 'leshy' && !b.foe.moon) {
      if (!b.foe.mask) {
        b.foe.mask = ['prospector', 'angler', 'trader'][b.foe.maskN % 3];
        b.foe.maskN += 1;
        shot(b, 'Leshy puts on the mask of ' + (b.foe.mask === 'trader' ? 'the Trader' : D.BOSSES[b.foe.mask].name) + '.');
      } else {
        const m = b.foe.mask;
        b.foe.mask = null;
        if (m === 'prospector') { say(b, 'The Prospector’s mask: your creatures turn to gold.'); goldRush(b); }
        else if (m === 'angler') steal(b);
        else {
          say(b, 'The Trader’s mask: two cards with strange sigils, and a pelt for you.');
          placeQueue(b, traderCard(b, true)); placeQueue(b, traderCard(b, true));
          toHand(b, mk(b, 'wolfpelt', 'me', { temp: 1 }));
          openTrade(b, 1);
        }
      }
    }
    if (boss === 'royal' && !b.foe.moon && b.foe.cannon != null) {
      const lane = b.foe.cannon;
      b.foe.cannon = null;
      say(b, 'BOOM. The cannon fires down lane ' + (lane + 1) + '.');
      ['me', 'foe'].forEach(k => {
        const c = side(b, k).board[lane];
        if (c && !def(c).giant) { c.dmg += 10; shot(b, c.name + ' takes 10.', { side: k, slot: lane, k: 'hit', n: 10 }); if (hpLeft(c) <= 0) kill(b, k, lane, 'effect'); }
      });
    }
  }
  function postAttack(b) {
    const boss = b.foe.boss;
    if (boss === 'angler' && b.foe.phase === 1) {
      if (b.foe.hook) {
        const tgt = inPlay(b, 'me').find(c => c.u === b.foe.hook);
        b.foe.hook = null;
        if (tgt) steal(b, tgt);
      } else if (b.turn % 2 === 1) {
        const tgt = inPlay(b, 'me').find(c => c.u === b.me.lastPlayed);
        if (tgt) { b.foe.hook = tgt.u; shot(b, 'The Angler aims his hook at ' + tgt.name + '.', { side: 'me', slot: slotOf(b, tgt), k: 'aim' }); }
      }
    }
    if (boss === 'royal' && !b.foe.moon && b.turn >= 1 && b.foe.cannon == null && b.turn % 3 === 1) {
      // aim at your strongest creature's lane
      let lane = 0, best = -1;
      for (let i = 0; i < 4; i++) { const c = b.me.board[i]; const v = c ? power(b, c) + hpLeft(c) : 0; if (v > best) { best = v; lane = i; } }
      b.foe.cannon = lane;
      shot(b, 'Royal aims a cannon down lane ' + (lane + 1) + '.', { side: 'me', slot: lane, k: 'aim' });
    }
  }
  /* The Angler's hook (or Leshy's Angler mask): your newest creature crosses over. */
  function steal(b, tgt) {
    tgt = tgt || inPlay(b, 'me').find(c => c.u === b.me.lastPlayed) || inPlay(b, 'me').slice(-1)[0];
    if (!tgt) return;
    const i = slotOf(b, tgt);
    b.me.board[i] = null;
    const front = b.foe.board[i];
    if (front && !def(front).giant) { if (!b.foe.queue[i]) b.foe.queue[i] = front; b.foe.board[i] = null; }
    if (!b.foe.board[i]) { tgt.owner = 'foe'; tgt.hooked = 1; b.foe.board[i] = tgt; }
    shot(b, 'The hook drags ' + tgt.name + ' to the other side.', { side: 'foe', slot: i, k: 'move' });
  }

  function myTurn(b) {
    startTurn(b, 'me');
    if (b.result) return;
    if (!b.me.deck.length && !b.me.side.length) {
      if (b.foe.moon && !b.foe.moonDown) { b.step = 'main'; return; }
      // Starvation: each one stronger
      b.starve += 1;
      const n = b.starve;
      const st = mk(b, 'starvation', 'foe', { starveN: n });
      st.atk = n; st.hp = n;
      if (n >= 5) st.x.push('airborne');
      let i = b.foe.board.findIndex(x => !x);
      if (i < 0) { i = 0; for (let j = 0; j < 4; j++) if (b.foe.board[j] && !def(b.foe.board[j]).giant) { i = j; break; } }
      if (!def(b.foe.board[i] || { id: 'squirrel' }).giant) { b.foe.board[i] = st; st.fresh = false; }
      say(b, 'You have nothing left to draw. Starvation comes for you.');
      b.step = 'main';
      return;
    }
    b.step = 'draw';
    shot(b, 'Your turn.');
  }

  /* ================================================================
     Items
     ================================================================ */
  function useItem(b, ii, slot) {
    if (b.result) return no('The battle is over.');
    if (b.ask) return no('Answer first.');
    if (b.step !== 'main') return no('Draw first.');
    const id = b.items[ii];
    const it = D.ITEMS[id];
    if (!it) return no('No such item.');
    const used = () => { b.items.splice(ii, 1); b.usedItems = (b.usedItems || []).concat(id); };
    const foeCard = () => (slot >= 0 && slot < 4) ? b.foe.board[slot] : null;
    switch (id) {
      case 'squirrelbottle': used(); toHand(b, mk(b, 'squirrel', 'me', { temp: 1 })); break;
      case 'boulderbottle': used(); toHand(b, mk(b, 'boulder', 'me', { temp: 1 })); break;
      case 'goatbottle': used(); toHand(b, mk(b, 'goat', 'me', { temp: 1 })); break;
      case 'opossumbottle': used(); toHand(b, mk(b, 'frozenopossum', 'me', { temp: 1 })); break;
      case 'hoggybank': used(); b.me.bones += 4; break;
      case 'hourglass': used(); b.skipFoe = true; break;
      case 'fan': used(); b.fan = true; break;
      case 'pliers': used(); b.scale += 1; shot(b, 'You pull a tooth and lay it on the scales.'); checkEnd(b); break;
      case 'lens': if (!b.me.deck.length) return no('Your deck is empty.'); used(); b.ask = { k: 'lens' }; break;
      case 'bleach': {
        const all = inPlay(b, 'foe').concat(b.foe.queue.filter(Boolean));
        if (!all.length) return no('Leshy has nothing in play.');
        used();
        all.forEach(c => { c.bleached = true; });
        if (b.foe.totem) b.foe.totem.bleached = true;
        shot(b, 'The bleach washes every sigil from Leshy’s cards.');
        break;
      }
      case 'wiseclock': {
        if (inPlay(b, 'foe').some(c => def(c).giant)) return no('The Moon will not budge.');
        used();
        // clockwise round the table: Leshy's row left to right, then yours right to left
        const ring = [['foe', 0], ['foe', 1], ['foe', 2], ['foe', 3], ['me', 3], ['me', 2], ['me', 1], ['me', 0]];
        const cards = ring.map(([k, i]) => side(b, k).board[i]);
        ring.forEach(([k, i], n) => {
          const c = cards[(n + 7) % 8];
          side(b, k).board[i] = c;
          if (c) c.owner = k;
        });
        shot(b, 'The Wiseclock turns the table.');
        break;
      }
      case 'scissors': case 'knife': {
        const c = foeCard();
        if (!c) return no('Choose one of Leshy’s creatures.');
        if (def(c).uncut) return no(c.name + ' is too thick to cut.');
        used();
        shot(b, (id === 'knife' ? 'You skin ' : 'You cut up ') + c.name + '.', { side: 'foe', slot, k: 'hit' });
        kill(b, 'foe', slot, 'effect');
        if (id === 'knife') toHand(b, mk(b, 'wolfpelt', 'me', { temp: 1 }));
        break;
      }
      case 'hook': {
        const c = foeCard();
        if (!c) return no('Choose one of Leshy’s creatures.');
        if (def(c).uncut || def(c).giant) return no(c.name + ' cannot be hooked.');
        if (b.me.board[slot]) return no('Your space opposite it must be empty.');
        used();
        b.foe.board[slot] = null;
        c.owner = 'me'; c.hooked = 1; c.dir = 1;
        b.me.board[slot] = c;
        shot(b, 'You hook ' + c.name + '.', { side: 'me', slot, k: 'play' });
        break;
      }
      default: return no('That item does nothing here.');
    }
    checkEnd(b);
    return yes();
  }

  /* ================================================================
     Pending questions
     ================================================================ */
  /* hoard / lens: choice = index into b.me.deck (or -1 to decline a hoard)
     trade: choice = { row: 'board' | 'queue', slot } or 'done' */
  function answer(b, choice) {
    const a = b.ask;
    if (!a) return no('Nothing to answer.');
    if (a.k === 'hoard' || a.k === 'lens') {
      if (choice === -1 && a.k === 'hoard') { b.ask = null; return yes(); }
      const c = b.me.deck[choice];
      if (!c) return no('Choose a card from your deck.');
      b.me.deck.splice(choice, 1);
      toHand(b, c);
      shuffle(b, b.me.deck);
      b.ask = null;
      return yes();
    }
    if (a.k === 'trade') {
      if (choice === 'done') { b.ask = null; resumeFoe(b); return yes(); }
      const row = choice && choice.row === 'queue' ? b.foe.queue : b.foe.board;
      const c = row[choice && choice.slot];
      if (!c || def(c).giant || isTerrain(c) && c.id !== 'stump') return no('Choose one of her cards.');
      const pi = b.me.hand.findIndex(x => x.id === 'wolfpelt');
      if (pi < 0) { b.ask = null; resumeFoe(b); return no('You have no Wolf Pelt to trade.'); }
      b.me.hand.splice(pi, 1);
      for (let i = 0; i < 4; i++) if (row[i] === c) row[i] = null;
      c.dmg = 0;
      c.owner = 'me'; c.temp = 1; c.dir = 1;
      toHand(b, c);
      shot(b, 'You trade a Wolf Pelt for ' + c.name + '.');
      a.left -= 1;
      if (a.left <= 0 || !b.me.hand.some(x => x.id === 'wolfpelt')) { b.ask = null; resumeFoe(b); }
      return yes();
    }
    return no('Unknown question.');
  }
  /* The Trader's mask asked mid-turn: Leshy carries on once you are done. */
  function resumeFoe(b) {
    const p = b.pending;
    b.pending = null;
    if (p === 'afterMine') afterMine(b);
    else if (p === 'attack') { finishFoe(b); if (!b.result && !b.ask) myTurn(b); }
  }

  /* ================================================================
     Reading the battle (for the page and the bots)
     ================================================================ */
  function info(b, c) {
    const d = def(c);
    const list = sigils(b, c);
    const totem = c.owner === 'me' ? b.me.totem : b.foe.totem;
    return {
      power: slotOf(b, c) >= 0 ? power(b, c) : (c.stat ? null : c.atk + c.lust + (c.morselA || 0)),
      health: hpLeft(c), maxHealth: c.hp,
      sigils: list.map(s => ({ id: s, gained: c.x.indexOf(s) >= 0, totem: !!(totem && totem.sigil === s && c.sig.indexOf(s) < 0 && c.x.indexOf(s) < 0) })),
      cost: costOf(c), terrain: !!d.terrain, pelt: !!d.pelt, giant: !!d.giant
    };
  }

  const api = {
    WIN, newBattle, draw, play, playable, bell, useItem, answer, snapshot, view,
    power, sigils, has, info, inPlay, slotOf, hpLeft, costOf, canSacrifice, sacValue, mk,
    resolvePlan, BOSS_PLAN, rnd
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InscEngine = api;
})(typeof window !== 'undefined' ? window : this);
