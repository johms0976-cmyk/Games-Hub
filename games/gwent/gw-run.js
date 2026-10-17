'use strict';
/* Gwent — The Path: a single-player deck-building run, in the manner of
 * Slay the Spire and Inscryption. No DOM, no timers; one seeded rng whose
 * state lives in the run itself, so a run is plain JSON and saves whole.
 *
 * A run: choose a faction and a leader, take a weak starter deck down three
 * acts of a branching map (battles, contracts, merchants, campfires, strange
 * encounters, treasure), and beat each act's boss. Battles are ordinary
 * Gwent against the house (gw-engine.js + gw-bots.js), played by run.html.
 * Between them the deck grows: a card after every win (or none — a weak card
 * dilutes a ten-card hand), honing at a campfire (+2 strength on that one
 * copy), removal at a merchant, and trinkets that bend the rules of every
 * battle (gw-engine.js `mods`).
 *
 * Lives, not hit points: lose a battle and you lose a life (or, once an act,
 * take a wound on your best card instead). Lose a boss and you lose a life
 * and face it again. No lives left ends the run.
 *
 * Added 2026-10-12, Inscryption-style: every boss has a second phase that
 * strikes once you take a round off it (gw-engine.js bossPhases); CHALLENGES
 * chosen at the start for a score multiplier; cursed trinkets (a gift and a
 * price); and in Act III the Wild Hunt on your trail.
 *
 * Added 2026-10-16, THE LONG ROAD (`run.long`): Slay the Spire's length and
 * node rules — seventeen floors an act (sixteen on a seven-wide map, then
 * the boss), potions, card rewards with a rare-card pity counter, a bigger
 * merchant, chests of three sizes and generic shrines among the encounters.
 * A run without `long` plays exactly as before.
 *
 * Every action is `R.<verb>(run, ...)` and returns { ok, why } like the
 * engine; the page re-renders from `run.screen`.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gw-data.js') : root.GwentData;
  const VERSION = 1;
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const no = why => ({ ok: false, why });
  const C = id => D.card(id);

  /* ---------------- the rng: state in run.rs ---------------- */
  function rnd(run) {
    run.rs = (run.rs + 0x6D2B79F5) >>> 0;
    let t = run.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (run, a, b) => a + Math.floor(rnd(run) * (b - a + 1));
  const pickOne = (run, list) => list[Math.floor(rnd(run) * list.length)];
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

  /* ================================================================
     Settings
     ================================================================ */
  const DIFFICULTY = {
    apprentice: { name: 'Just the Story', lives: 4, shift: -1, foeHand: 0, text: 'Four lives, and every opponent plays a notch more gently.' },
    witcher: { name: 'Witcher', lives: 3, shift: 0, foeHand: 0, text: 'Three lives. The house plays as it was tuned.' },
    deathmarch: { name: 'Death March!', lives: 3, shift: 1, foeHand: 1, text: 'Three lives, the house at its sharpest, and every opponent holds one extra card.' }
  };
  const LEVELS = ['easy', 'medium', 'hard'];
  const ACTS = [
    { n: 1, name: 'Velen', sub: 'No Man’s Land', text: 'Bogs, burned villages and deserters. Everyone here plays for scraps.' },
    { n: 2, name: 'Novigrad', sub: 'The Free City', text: 'Spies, smugglers and witch hunters — the card tables are richer, and crueller.' },
    { n: 3, name: 'Skellige', sub: 'And the White Frost', text: 'The clans of the isles, the Empire’s best, and the Wild Hunt itself.' }
  ];
  /* Chosen before a run; each adds to the score multiplier. */
  /* Weighted by measurement (2026-10-12, 60 runs each, the house at Hard in
     your seat, Witcher, seed 33 — none: 50% of runs won): Weakened 15%,
     One Life 20%, Iron Bosses 20%, Short Hand 27%, Leaderless 35%, Empty
     Purse 38%, Cattle Plague 40%. All seven: 0%. */
  const CHALLENGES = [
    { id: 'onelife', name: 'One Life', w: 0.45, text: 'You have a single life, and campfires offer no rest.' },
    { id: 'weak', name: 'Weakened', w: 0.5, text: 'Your non-hero units fight at −1 (never below 1).' },
    { id: 'short', name: 'Short Hand', w: 0.35, text: 'You are dealt nine cards instead of ten.' },
    { id: 'gems', name: 'Iron Bosses', w: 0.45, text: 'Every boss holds three gems: win three rounds to beat one.' },
    { id: 'cows', name: 'Cattle Plague', w: 0.15, text: 'Two Cows (0 strength) start in your deck.' },
    { id: 'leaderless', name: 'Leaderless', w: 0.2, text: 'Your leader’s ability does nothing.' },
    { id: 'poor', name: 'Empty Purse', w: 0.15, text: 'Battles pay half as many crowns.' }
  ];
  const CHALLENGE = {};
  CHALLENGES.forEach(c => { CHALLENGE[c.id] = c; });
  const on = (run, id) => !!(run.ch && run.ch.indexOf(id) >= 0);
  const multiplier = run => 1 + (run.ch || []).reduce((t, id) => t + (CHALLENGE[id] ? CHALLENGE[id].w : 0), 0);
  /* Each boss's second phase (gw-engine.js bossPhases): what it is called and
     what it does at its first and second strength. */
  const PHASES = {
    crones: { name: 'The Crones’ Bargain', when: 'Take a round off them and they bargain:', lvl: ['At every new round they take the strongest card from your hand — face up — and leave you a Cow.', 'Now they take two.'] },
    rage: { name: 'Drunken Rage', when: 'Take a round off him and he rages:', lvl: ['His Siege row is doubled every round after.', 'His Siege and Ranged rows are doubled.'] },
    ambush: { name: 'Ambush', when: 'Take a round off her and she springs it:', lvl: ['At every new round, her two strongest units walk on from her deck for free.', 'Three walk on.'] },
    levy: { name: 'The King’s Levy', when: 'Take a round off him and he calls the levy:', lvl: ['At every new round, two Poor Fucking Infantry (Tight Bond) march onto his Close row from nowhere.', 'Three march in.'] },
    whiteFrost: { name: 'The White Frost', when: 'Take a round off him and it falls:', lvl: ['Biting Frost covers Close Combat and cannot be cleared.', 'Impenetrable Fog joins it, and cannot be cleared either.'] },
    edict: { name: 'Imperial Edict', when: 'Take a round off him and he decrees:', lvl: ['At every new round he names the row you were strongest in last round: your units there fight at −2.', 'At −3.'] }
  };
  /* The Wild Hunt on your trail (Act III): every floor +1, and +1 more for
     stopping (merchant, campfire, encounter, treasure). At HUNT it catches
     you: a contract-strength fight before you reach where you were going. */
  const HUNT = 10;
  const FLOORS = 7;            // floors before the boss
  const COLS = 5;
  const PATHS = 4;
  const MIN_DECK = 10;         // you are dealt ten: a deck can thin no further
  const HONE = 2;              // strength a hone adds
  const HONE_MAX = 6;          // a card can be honed three times
  const PRICE = { common: 40, uncommon: 65, rare: 110, legendary: 160 };
  const TRINKET_PRICE = { common: 110, uncommon: 140, rare: 175 };
  /* The Long Road, after Slay the Spire's map: sixteen floors on a grid seven
     wide, six paths, treasure fixed on the ninth floor and a campfire on the
     sixteenth, no contract or campfire in the first five, and the boss as
     floor seventeen. Room odds are Slay the Spire's (battle 53, encounter 22,
     campfire 12, contract 8, merchant 5). */
  /* `scale`: three times the fights means three times the rewards, so the
     opponents grow with the climb — extra cards in hand (battles: before and
     after the treasure floor) and a sharper house for the big fights. Tuned
     by tests/run.js with GW_LONG=1 (2026-10-16, 60 runs, the house at Hard
     in your seat, seed 33): the Long Road wins 60% / 53% / 38% of runs on
     Just the Story / Witcher / Death March against The Path's 55 / 50 / 25.
     Battles: a card more after the treasure (Act I) or all the way (II-III,
     two late in III); contracts +1 (+2 in III) at a level up; bosses +2/+3/+4
     cards a level up. Three lives, as on The Path: a fourth made it 70%. */
  const LONG = { floors: 16, cols: 7, paths: 6, treasure: 8, early: 5, hunt: 12, removeCost: 75, belt: 3, lives: 0,
    scale: { battle: [[0, 1], [1, 1], [1, 2]], elite: [1, 1, 2], hunt: 2, boss: [2, 3, 4], lvl: { battle: 0, elite: 1, hunt: 1, boss: 1 } },
    rooms: [['battle', 53], ['event', 22], ['camp', 12], ['elite', 8], ['shop', 5]] };
  const SHORT = { floors: FLOORS, cols: COLS, paths: PATHS, treasure: 3 };
  const shapeOf = run => run && run.long ? LONG : SHORT;
  const floorsOf = run => shapeOf(run).floors;
  const huntOf = run => run && run.long ? LONG.hunt : HUNT;
  /* Card rewards on the Long Road: the chance of a rare starts 5 points down,
     climbs a point for every common you are shown and drops back when a rare
     appears. Contracts add 10 points. */
  const LUCK0 = -5, ELITE_RARE = 10;
  /* Potions drop 40% of the time after a won battle or contract: 10 points
     less after a drop, 10 more after none. */
  const POTION0 = 40, POTION_STEP = 10;
  /* A chest: small, medium or large, and what it holds. */
  const CHESTS = {
    small: { odds: 50, crowns: [25, 35], rarity: [['common', 75], ['uncommon', 25]] },
    medium: { odds: 33, crowns: [50, 70], rarity: [['common', 35], ['uncommon', 50], ['rare', 15]] },
    large: { odds: 17, crowns: [75, 95], rarity: [['uncommon', 75], ['rare', 25]] }
  };
  /* Any encounter on the Long Road is a generic shrine this often (%). */
  const SHRINE_ODDS = 11.25;

  /* ================================================================
     The cards: rarity, worked out from the face
     ================================================================ */
  const AB_WORTH = { spy: 5, medic: 5, muster: 3, bond: 2, morale: 2, horn: 5, scorch: 4, scorchAll: 4, summon: 4, avenger: 6, berserk: 3, mardroeme: 3 };
  const CURSE = 'cow';         // the Cow: 0 strength, a curse in this mode
  function rarityOf(id) {
    const c = C(id);
    if (!c) return 'common';
    if (c.kind === 'special') {
      if (c.sp === 'scorch') return 'rare';
      if (c.sp === 'decoy' || c.sp === 'horn' || c.sp === 'mardroeme') return 'uncommon';
      return 'common';
    }
    if (c.hero) return c.str >= 15 ? 'legendary' : 'rare';
    const v = c.str + (AB_WORTH[c.ab] || 0);
    return v <= 5 ? 'common' : v <= 8 ? 'uncommon' : 'rare';
  }
  /* How many copies a run deck may hold: a hero once, a special three times,
     a unit as many as were printed (at least three, so a muster can grow). */
  function capOf(id) {
    const c = C(id);
    if (!c) return 0;
    if (c.hero) return 1;
    if (c.kind === 'special') return 3;
    return Math.max(3, c.count);
  }
  /* What a faction may be offered: its own cards and every neutral one,
     never a token, never the Cow, never another faction's special. */
  function poolFor(fac) {
    return D.ORDER.filter(id => {
      const c = C(id);
      if (!c || c.token || c.count === 0 || id === CURSE) return false;
      if (c.fac !== fac && c.fac !== 'ne') return false;
      if (c.sp === 'storm' && fac !== 'sk') return false;
      return true;
    });
  }

  /* ================================================================
     Starter decks: thirteen weak cards, a decoy and a weather
     ================================================================ */
  const STARTER = {
    nr: ['poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'kaedweni_siege_expert', 'yarpen_zigrin', 'sabrina_glevissig',
      'sheldon_skaggs', 'siegfried_of_denesle', 'ves', 'keira_metz', 'ballista', 'sp_decoy', 'sp_fog'],
    ng: ['nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'morteisen', 'vanhemar', 'vattier_de_rideaux', 'rotten_mangonel',
      'rainfarn', 'cynthia', 'renuald_aep_matsen', 'etolian_auxiliary_archers', 'sp_decoy', 'sp_rain'],
    mo: ['nekker', 'nekker', 'nekker', 'ghoul', 'foglet', 'harpy', 'endrega', 'botchling', 'forktail', 'grave_hag', 'frightener', 'sp_decoy', 'sp_fog'],
    st: ['elven_skirmisher', 'elven_skirmisher', 'elven_skirmisher', 'dwarven_skirmisher', 'dwarven_skirmisher', 'dol_blathanna_scout', 'ciaran_aep_easnillien',
      'vrihedd_brigade_recruit', 'dol_blathanna_archer', 'ida_emean_aep_sivney', 'havekar_healer', 'sp_decoy', 'sp_frost'],
    sk: ['clan_heymaey_skald', 'svanrige', 'udalryk', 'donar_an_hindar', 'holger_blackhand', 'young_berserker', 'young_berserker',
      'young_berserker', 'light_longship', 'light_longship', 'birna_bran', 'sp_decoy', 'sp_storm']
  };

  /* ================================================================
     Trinkets. `mods` go to the engine for every battle (summed); `run`
     ones change the run itself.
     ================================================================ */
  const TRINKETS = [
    { id: 'seal', name: 'Ducal Seal', rarity: 'common', mods: { tieWin: true }, text: 'You win every round that ends in a draw.' },
    { id: 'cat', name: 'Cat Potion', rarity: 'common', mods: { redraws: 1 }, text: 'One more redraw before each battle.' },
    { id: 'purse', name: 'Dwarven Purse', rarity: 'common', run: 'purse', text: 'Half as many crowns again from every battle.' },
    { id: 'ledger', name: 'Merchant’s Ledger', rarity: 'common', run: 'ledger', text: 'Merchants charge a quarter less.' },
    { id: 'banner', name: 'Temerian Banner', rarity: 'uncommon', mods: { winDraw: 1 }, text: 'Draw a card every time you win a round.' },
    { id: 'trophy', name: 'Griffin Trophy', rarity: 'uncommon', mods: { keep: true }, text: 'One random unit of yours stays on the board after each round.' },
    { id: 'oriole', name: 'Golden Oriole', rarity: 'uncommon', mods: { halfWeather: true }, text: 'Bad weather costs your units only half their strength.' },
    { id: 'signet', name: 'Spymaster’s Signet', rarity: 'uncommon', mods: { spyDraw: 1 }, text: 'Your spies draw three cards, not two.' },
    { id: 'medallion', name: 'Witcher Medallion', rarity: 'uncommon', mods: { start: ['sp_decoy'] }, text: 'Begin every battle with an extra Decoy in hand.' },
    { id: 'eye', name: 'Collector’s Eye', rarity: 'uncommon', run: 'eye', text: 'Card rewards offer four cards instead of three.' },
    { id: 'decoction', name: 'Raffard’s Decoction', rarity: 'uncommon', run: 'decoction', text: 'One more life, and it is full now.' },
    { id: 'whetstone', name: 'Mahakam Whetstone', rarity: 'uncommon', run: 'whetstone', text: 'Honing adds +3 strength instead of +2.' },
    { id: 'mutagen', name: 'Greater Mutagen', rarity: 'rare', mods: { hand: 1 }, text: 'You are dealt eleven cards instead of ten.' },
    { id: 'swallow', name: 'Swallow', rarity: 'rare', mods: { roundDraw: 1 }, text: 'Draw a card at the start of the second and third rounds.' },
    { id: 'crown', name: 'Crown of the Leader', rarity: 'rare', mods: { leaderUses: 2 }, text: 'Your leader’s ability can be used twice a battle.' },
    { id: 'bugle', name: 'Commander’s Bugle', rarity: 'rare', mods: { start: ['sp_horn'] }, text: 'Begin every battle with an extra Commander’s Horn in hand.' },
    /* The second set (2026-10-18). Row bonuses (plusRows), choosing who
       begins (leads) and a revival each round (roundRevive) are engine hooks
       added for them; `run` ones are read where the run does that thing. */
    { id: 'mistletoe', name: 'Druid’s Mistletoe', rarity: 'common', mods: { start: ['sp_clear'] }, text: 'Begin every battle with an extra Clear Weather in hand.' },
    { id: 'shield', name: 'Mahakaman Shield', rarity: 'common', mods: { plusRows: [1, 0, 0] }, text: 'Your Close Combat units fight at +1 (heroes excepted).' },
    { id: 'quiver', name: 'Zerrikanian Quiver', rarity: 'common', mods: { plusRows: [0, 1, 0] }, text: 'Your Ranged units fight at +1 (heroes excepted).' },
    { id: 'plans', name: 'Siege Engineer’s Plans', rarity: 'common', mods: { plusRows: [0, 0, 1] }, text: 'Your Siege units fight at +1 (heroes excepted).' },
    { id: 'collar', name: 'Black Cat’s Collar', rarity: 'common', foe: { redraws: -1 }, text: 'Your opponent may redraw one card fewer before each battle.' },
    { id: 'note', name: 'Vivaldi Promissory Note', rarity: 'common', run: 'note', text: '50 crowns now, and 15 more every time you meet a merchant.' },
    { id: 'razor', name: 'Barber’s Razor', rarity: 'common', run: 'razor', text: 'Removing a card at a merchant always costs 25 crowns.' },
    { id: 'kettle', name: 'Camp Kettle', rarity: 'common', run: 'kettle', text: 'Resting at a campfire also hones a random unit.' },
    { id: 'cloak', name: 'Wolven Cloak', rarity: 'common', run: 'cloak', text: 'In Act III, stopping no longer brings the Wild Hunt closer — only the floors do.' },
    { id: 'shackles', name: 'Dimeritium Shackles', rarity: 'uncommon', foe: { noLeader: true }, text: 'Your opponent’s leader is silent: no ability, and no passive.' },
    { id: 'die', name: 'Gambler’s Die', rarity: 'uncommon', mods: { leads: true }, text: 'You choose who begins every round, as the Scoia’tael do (against them, nobody chooses).' },
    { id: 'pipe', name: 'Zoltan’s Pipe', rarity: 'uncommon', run: 'pipe', text: 'Regain a life at the start of every act.' },
    { id: 'bestiary', name: 'Witcher’s Bestiary', rarity: 'uncommon', run: 'bestiary', text: 'Contracts and the Wild Hunt pay twice the crowns, and offer one card more.' },
    { id: 'saddle', name: 'Ofieri Saddle', rarity: 'uncommon', run: 'saddle', text: 'One card in every card reward is a rarity better.' },
    { id: 'freya', name: 'Freya’s Blessing', rarity: 'rare', mods: { plusRows: [1, 1, 1] }, text: 'Every unit of yours fights at +1 (heroes excepted).' },
    { id: 'amulet', name: 'Necromancer’s Amulet', rarity: 'rare', mods: { roundRevive: 1 }, text: 'At the start of the second and third rounds, a random unit from your discard pile returns to your hand.' },
    { id: 'scale', name: 'Golden Dragon Scale', rarity: 'rare', mods: { start: ['sp_scorch'] }, text: 'Begin every battle with a Scorch in hand.' },
    /* Cursed: a gift and a price. Only the Man of Glass's Wares offer them. */
    { id: 'mirror', name: 'Gaunter’s Mirror', rarity: 'cursed', mods: { hand: 2 }, foe: { hand: 1 }, text: 'You are dealt two extra cards — and your opponent one.' },
    { id: 'unstable', name: 'Unstable Mutagen', rarity: 'cursed', mods: { hand: 1, minusRows: [0, 0, 1] }, text: 'You are dealt an extra card, but your Siege units fight at −1.' },
    { id: 'bloodied', name: 'Bloodied Banner', rarity: 'cursed', mods: { winDraw: 1 }, foe: { tieWin: true }, text: 'Draw a card every time you win a round — but your opponent wins every drawn round.' },
    { id: 'cursedpurse', name: 'Cursed Purse', rarity: 'cursed', run: 'cursedpurse', text: '150 crowns now — and a Cow joins your deck at the start of every act.' },
    /* Cursed, the second set: only the Witch's Hut offers them. */
    { id: 'henfoot', name: 'Hen’s Foot Charm', rarity: 'cursed', mods: { gems: 3 }, foe: { hand: 2 }, text: 'Three gems in every battle — but your opponent is dealt two extra cards.' },
    { id: 'pearl', name: 'Black Pearl', rarity: 'cursed', mods: { start: ['sp_scorch', 'sp_horn'], hand: -3 }, text: 'Begin every battle with a Scorch and a Commander’s Horn in hand — but you are dealt three cards fewer.' },
    { id: 'bloodcoin', name: 'Coin of Blood', rarity: 'cursed', run: 'bloodcoin', text: 'Twice the crowns from every battle — but a campfire no longer lets you rest.' }
  ];
  const TRINKET = {};
  TRINKETS.forEach(t => { TRINKET[t.id] = t; });
  /* Potions (the Long Road): carried on a belt of three, drunk before a battle
     for that battle only. `mods` go to you, `foe` to your opponent. A first
     set, built from the engine's existing hooks. */
  const POTIONS = [
    { id: 'thunderbolt', name: 'Thunderbolt', rarity: 'common', mods: { start: ['sp_horn'] }, text: 'Begin the battle with a Commander’s Horn in hand.' },
    { id: 'whitehoney', name: 'White Honey', rarity: 'common', mods: { start: ['sp_clear'] }, text: 'Begin the battle with a Clear Weather in hand.' },
    { id: 'owl', name: 'Tawny Owl', rarity: 'common', mods: { redraws: 2 }, text: 'Two more redraws before the battle.' },
    { id: 'petri', name: 'Petri’s Philter', rarity: 'uncommon', mods: { winDraw: 1 }, text: 'Draw a card every time you win a round.' },
    { id: 'blizzard', name: 'Blizzard', rarity: 'uncommon', mods: { roundDraw: 1 }, text: 'Draw a card at the start of the second and third rounds.' },
    { id: 'dancingstar', name: 'Dancing Star', rarity: 'uncommon', mods: { start: ['sp_scorch'] }, text: 'A bomb: begin the battle with a Scorch in hand.' },
    { id: 'fullmoon', name: 'Full Moon', rarity: 'rare', mods: { hand: 1 }, text: 'You are dealt an extra card.' },
    { id: 'moondust', name: 'Moon Dust', rarity: 'rare', foe: { hand: -1 }, text: 'A bomb: your opponent is dealt one card fewer.' }
  ];
  const POTION = {};
  POTIONS.forEach(p => { POTION[p.id] = p; });
  const POTION_PRICE = { common: 50, uncommon: 70, rare: 95 };
  function randomPotion(run, rarities) {
    const r = rarities ? weighted(run, rarities) : weighted(run, [['common', 65], ['uncommon', 25], ['rare', 10]]);
    return pickOne(run, POTIONS.filter(p => p.rarity === r)).id;
  }
  const beltFull = run => (run.potions || []).length >= LONG.belt;
  const has = (run, id) => run.trinkets.indexOf(id) >= 0;
  /* Every battle trinket summed into one `mods` for the engine. */
  function playerMods(run) {
    const m = { hand: 0, redraws: 0, winDraw: 0, spyDraw: 0, roundDraw: 0, leaderUses: 1, start: [], weak: 0, minusRows: [0, 0, 0], plusRows: [0, 0, 0], noLeader: false };
    for (const id of run.trinkets) addMods(m, TRINKET[id] && TRINKET[id].mods);
    if (on(run, 'weak')) m.weak += 1;
    if (on(run, 'short')) m.hand -= 1;
    if (on(run, 'leaderless')) m.noLeader = true;
    return m;
  }
  function addMods(m, add) {
    if (!add) return m;
    for (const k of Object.keys(add)) {
      const v = add[k];
      if (k === 'start') m.start = (m.start || []).concat(v);
      else if (k === 'minusRows' || k === 'plusRows') m[k] = [0, 1, 2].map(r => ((m[k] || [])[r] || 0) + (v[r] || 0));
      else if (k === 'leaderUses') m.leaderUses = Math.max(m.leaderUses || 1, v);
      else if (typeof v === 'boolean' || typeof v === 'string') m[k] = v || m[k];
      else m[k] = (m[k] || 0) + v;
    }
    return m;
  }
  /* What your cursed trinkets give the other side. */
  function foeMods(run) {
    const m = {};
    for (const id of run.trinkets) addMods(m, TRINKET[id] && TRINKET[id].foe);
    return m;
  }

  /* ================================================================
     The opponents. A deck is `size` cards drawn from `core`, so the same
     name plays a little differently each time. Levels are the house's.
     ================================================================ */
  /* Geralt and Ciri wait for Act III. */
  const BIG = { geralt_of_rivia: 1, cirilla_fiona_elen_riannon: 1 };
  const ENEMIES = {
    1: {
      battle: [
        { id: 'bandits', name: 'Crossroads Bandits', fac: 'nr', leader: 'foltest_lord', size: 12, text: 'Deserters with a stolen deck and nothing to lose.',
          core: ['poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'redanian_foot_soldier', 'redanian_foot_soldier', 'yarpen_zigrin', 'sabrina_glevissig',
            'sheldon_skaggs', 'siegfried_of_denesle', 'ves', 'kaedweni_siege_expert', 'sp_frost', 'sp_rain'] },
        { id: 'nekkers', name: 'Nekker Warren', fac: 'mo', leader: 'eredin_bringer', size: 12, text: 'Small, many, and all at once.',
          core: ['nekker', 'nekker', 'nekker', 'ghoul', 'ghoul', 'ghoul', 'foglet', 'harpy', 'celaeno_harpy', 'endrega', 'wyvern', 'gargoyle', 'cockatrice'] },
        { id: 'deserters', name: 'Nilfgaardian Deserters', fac: 'ng', leader: 'emhyr_emperor', size: 12, text: 'Out of uniform, never out of cards.',
          core: ['nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'sweers', 'albrich', 'vreemde', 'morteisen', 'puttkammer', 'rotten_mangonel',
            'rainfarn', 'cynthia', 'etolian_auxiliary_archers', 'sp_fog'] },
        { id: 'raiders', name: 'Elven Raiders', fac: 'st', leader: 'francesca_hope', size: 12, text: 'Arrows from the treeline, then nobody there.',
          core: ['elven_skirmisher', 'elven_skirmisher', 'elven_skirmisher', 'dwarven_skirmisher', 'dwarven_skirmisher', 'dwarven_skirmisher', 'toruviel', 'riordain',
            'ciaran_aep_easnillien', 'vrihedd_brigade_recruit', 'dol_blathanna_archer', 'havekar_healer'] },
        { id: 'drowned', name: 'Drowned Dead', fac: 'mo', leader: 'eredin_commander', size: 12, text: 'The bog keeps what it takes, and brings fog with it.',
          core: ['ghoul', 'ghoul', 'ghoul', 'foglet', 'botchling', 'endrega', 'cockatrice', 'gargoyle', 'harpy', 'wyvern', 'grave_hag', 'sp_fog', 'sp_frost'] }
      ],
      elite: [
        { id: 'griffin', name: 'The Griffin of White Orchard', fac: 'mo', leader: 'eredin_commander', size: 13, text: 'A royal griffin and everything that feeds on its leavings. Its leader brings the weather.',
          core: ['griffin', 'forktail', 'frightener', 'cockatrice', 'wyvern', 'harpy', 'celaeno_harpy', 'endrega', 'gargoyle', 'foglet', 'sp_frost', 'sp_fog', 'werewolf'] },
        { id: 'baronsmen', name: 'The Baron’s Guard', fac: 'nr', leader: 'foltest_lord', size: 13, text: 'Drilled, well fed and fond of siege engines. Their leader clears the weather.',
          core: ['poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'ves', 'siegfried_of_denesle', 'sheldon_skaggs', 'sabrina_glevissig',
            'ballista', 'kaedweni_siege_expert', 'kaedweni_siege_expert', 'dun_banner_medic', 'yarpen_zigrin', 'sp_decoy'] },
        { id: 'vanguard', name: 'Imperial Vanguard', fac: 'ng', leader: 'emhyr_emperor', size: 13, text: 'Tight ranks, and an officer who has seen your hand.',
          core: ['impera_brigade_guard', 'impera_brigade_guard', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'renuald_aep_matsen',
            'vanhemar', 'rainfarn', 'cahir_mawr_dyffryn_aep_ceallach', 'puttkammer', 'sweers', 'etolian_auxiliary_archers', 'albrich'] }
      ],
      boss: [
        { id: 'crones', name: 'The Ladies of the Wood', fac: 'mo', leader: 'eredin_commander', size: 15, boss: true, mods: { phase: 'crones' },
          text: 'Three sisters of Crookback Bog who play as one: one Crone brings the other two. They bring the fog with them.',
          core: ['crone_brewess', 'crone_weavess', 'crone_whispess', 'grave_hag', 'foglet', 'botchling', 'nekker', 'nekker', 'ghoul',
            'gargoyle', 'harpy', 'endrega', 'wyvern', 'sp_fog', 'sp_frost'] },
        { id: 'baron', name: 'The Bloody Baron', fac: 'nr', leader: 'foltest_lord', size: 15, boss: true, mods: { phase: 'rage' },
          text: 'Phillip Strenger, master of Crow’s Perch, and his siege engines. His leader clears the weather.',
          core: ['ballista', 'siege_tower', 'kaedweni_siege_expert', 'redanian_foot_soldier', 'dun_banner_medic', 'poor_fucking_infantry', 'poor_fucking_infantry',
            'poor_fucking_infantry', 'ves', 'siegfried_of_denesle', 'yarpen_zigrin', 'sheldon_skaggs', 'redanian_foot_soldier', 'sp_horn', 'sp_frost'] }
      ]
    },
    2: {
      battle: [
        { id: 'hunters', name: 'Witch Hunters', fac: 'nr', leader: 'foltest_steel', size: 15, text: 'Radovid’s zealots. They burn anything that stands too tall.',
          core: ['crinfrid_reavers_dragon_hunter', 'crinfrid_reavers_dragon_hunter', 'poor_fucking_infantry', 'dethmold', 'sile_de_tansarville', 'keira_metz',
            'sabrina_glevissig', 'ves', 'siegfried_of_denesle', 'ballista', 'yarpen_zigrin', 'trebuchet', 'siege_tower', 'dun_banner_medic', 'sp_frost', 'redanian_foot_soldier'] },
        { id: 'darkness', name: 'The Man of Glass’s Debtors', fac: 'ng', leader: 'emhyr_majesty', size: 15, text: 'Gamblers who bet more than coin, and the darkness that follows them.',
          core: ['gaunter_odimm', 'gaunter_odimm_darkness', 'gaunter_odimm_darkness', 'gaunter_odimm_darkness', 'zoltan_chivay', 'emiel_regis_rohellec_terzieff', 'olgierd_von_everec',
            'renuald_aep_matsen', 'vanhemar', 'cynthia', 'siege_engineer', 'zerrikanian_fire_scorpion', 'black_infantry_archer', 'sp_rain', 'sp_decoy'] },
        { id: 'vampires', name: 'Catacomb Vampires', fac: 'mo', leader: 'eredin_bringer', size: 15, text: 'A whole nest under the Temple Isle. Wake one and the rest come too.',
          core: ['vampire_bruxa', 'vampire_ekimmara', 'vampire_fleder', 'ghoul', 'ghoul', 'ghoul', 'fiend', 'plague_maiden', 'foglet', 'harpy',
            'grave_hag', 'gargoyle', 'endrega', 'sp_fog', 'sp_decoy'] },
        { id: 'commando', name: 'Scoia’tael Commando', fac: 'st', leader: 'francesca_queen', size: 15, text: 'Smugglers in the sewers, archers on the roofs.',
          core: ['havekar_smuggler', 'havekar_smuggler', 'havekar_smuggler', 'dol_blathanna_scout', 'dol_blathanna_scout', 'mahakaman_defender', 'mahakaman_defender',
            'mahakaman_defender', 'havekar_healer', 'vrihedd_brigade_veteran', 'vrihedd_brigade_veteran', 'barclay_els', 'yaevinn', 'sp_frost', 'sp_decoy'] },
        { id: 'traders', name: 'Skellige Traders', fac: 'sk', leader: 'crach', size: 15, text: 'Islanders in port for the fair, and spoiling for a game.',
          core: ['clan_brokvar_archer', 'clan_brokvar_archer', 'clan_brokvar_archer', 'light_longship', 'light_longship', 'light_longship', 'clan_heymaey_skald', 'svanrige',
            'udalryk', 'donar_an_hindar', 'holger_blackhand', 'birna_bran', 'madman_lugos', 'sp_storm', 'sp_decoy'] }
      ],
      elite: [
        { id: 'dijkstra', name: 'Dijkstra’s Informants', fac: 'nr', leader: 'foltest_son', size: 16, mods: { spyDraw: 1 }, text: 'Every one of them works for someone else. Their spies draw three.',
          core: ['sigismund_dijkstra', 'prince_stennis', 'thaler', 'ves', 'siegfried_of_denesle', 'keira_metz', 'sile_de_tansarville', 'dethmold', 'trebuchet', 'siege_tower',
            'kaedweni_siege_expert', 'kaedweni_siege_expert', 'dun_banner_medic', 'poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'sp_decoy'] },
        { id: 'berserkers', name: 'Ermion’s Berserkers', fac: 'sk', leader: 'bran', size: 16, text: 'Mushrooms, mead and bears. Their king halves the weather for them.',
          core: ['berserker', 'young_berserker', 'young_berserker', 'young_berserker', 'ermion', 'sp_mardroeme', 'svanrige', 'udalryk', 'war_longship',
            'war_longship', 'war_longship', 'madman_lugos', 'clan_heymaey_skald', 'donar_an_hindar', 'clan_drummond_shield_maiden', 'clan_drummond_shield_maiden'] },
        { id: 'skellen', name: 'Stefan Skellen’s Agents', fac: 'ng', leader: 'emhyr_invader', size: 16, mods: { hand: 1 }, text: 'Imperial intelligence. An extra card, and every medic brings back a stranger.',
          core: ['stefan_skellen', 'shilard_fitz_oesterlen', 'vattier_de_rideaux', 'black_infantry_archer', 'black_infantry_archer', 'fringilla_vigo', 'assire_var_anahid',
            'cahir_mawr_dyffryn_aep_ceallach', 'heavy_zerrikanian_fire_scorpion', 'siege_engineer', 'impera_brigade_guard', 'impera_brigade_guard', 'impera_brigade_guard',
            'etolian_auxiliary_archers', 'sp_decoy', 'sp_decoy'] }
      ],
      boss: [
        { id: 'francesca', name: 'Francesca Findabair', fac: 'st', leader: 'francesca_beautiful', size: 20, boss: true, mods: { phase: 'ambush' },
          text: 'The Daisy of the Valley and the best of the Scoia’tael. She chooses who begins every round and doubles her Ranged row.',
          core: D.STANDARD.st.filter(id => !BIG[id]) },
        { id: 'foltest', name: 'King Foltest', fac: 'nr', leader: 'foltest_king', size: 20, boss: true, mods: { phase: 'levy' },
          text: 'The King of Temeria at his own table. He draws a card every time he wins a round, and brings the fog when he likes.',
          core: D.STANDARD.nr.filter(id => !BIG[id]) }
      ]
    },
    3: {
      battle: [
        { id: 'ancraite', name: 'Clan an Craite', fac: 'sk', leader: 'crach', size: 18, text: 'Kaer Trolde’s finest. They can bring the whole war back from the dead.',
          core: D.STANDARD.sk.filter(id => !C(id).hero) },
        { id: 'riders', name: 'Riders of the Wild Hunt', fac: 'mo', leader: 'eredin_commander', size: 18, text: 'Frost in their wake and the elements in their train.',
          core: ['arachas', 'arachas', 'arachas', 'arachas_behemoth', 'earth_elemental', 'fire_elemental', 'ice_giant', 'fiend', 'griffin', 'werewolf', 'forktail',
            'frightener', 'plague_maiden', 'toad', 'sp_frost', 'sp_frost', 'sp_fog', 'sp_scorch'] },
        { id: 'legion', name: 'The Imperial Legion', fac: 'ng', leader: 'emhyr_whiteflame', size: 18, text: 'Their emperor’s White Flame cancels your leader. Win without it.',
          core: D.STANDARD.ng.filter(id => !C(id).hero || id === 'yennefer_of_vengerberg') },
        { id: 'redania', name: 'The Redanian Army', fac: 'nr', leader: 'foltest_siege', size: 18, text: 'Siege engines and bonded companies, and a king who doubles them.',
          core: D.STANDARD.nr.filter(id => !C(id).hero) },
        { id: 'dolblathanna', name: 'The Dol Blathanna Host', fac: 'st', leader: 'francesca_daisy', size: 18, text: 'Elves of the Valley of Flowers. Their queen deals them an extra card.',
          core: D.STANDARD.st.filter(id => !C(id).hero) }
      ],
      elite: [
        { id: 'imlerith', name: 'Imlerith', fac: 'mo', leader: 'eredin_king', size: 20, mods: { hand: 1, keep: true }, text: 'The Hunt’s general. An extra card, and a unit of his stays on the board every round.',
          core: D.STANDARD.mo.slice() },
        { id: 'hjalmar', name: 'Hjalmar’s Crew', fac: 'sk', leader: 'crach', size: 20, mods: { roundDraw: 1 }, text: 'The young an Craite and his shield maidens. They draw a card every new round.',
          core: D.STANDARD.sk.slice() },
        { id: 'letho', name: 'Letho of Gulet', fac: 'ng', leader: 'emhyr_relentless', size: 20, mods: { hand: 1, redraws: 1 }, text: 'The Kingslayer. An extra card and an extra redraw.',
          core: D.STANDARD.ng.slice() }
      ],
      boss: [
        { id: 'eredin', name: 'Eredin, King of the Wild Hunt', fac: 'mo', leader: 'eredin_king', size: 24, mods: { hand: 2, keep: true, roundDraw: 1, phase: 'whiteFrost' }, boss: true,
          text: 'The White Frost is coming. He holds two extra cards, draws one every new round, doubles his Close row, and keeps a unit on the board every round.',
          core: D.STANDARD.mo.concat(['crone_brewess', 'crone_weavess', 'crone_whispess', 'vampire_katakan']) },
        { id: 'emhyr', name: 'Emhyr var Emreis', fac: 'ng', leader: 'emhyr_whiteflame', size: 24, mods: { hand: 2, roundDraw: 1, phase: 'edict' }, boss: true,
          text: 'The White Flame Dancing on the Barrows of his Enemies. Two extra cards and one more every new round, every drawn round is his, and your leader does nothing.',
          core: D.STANDARD.ng.slice() }
      ]
    }
  };
  /* The Wild Hunt when it catches you (Act III). */
  ENEMIES[3].hunt = [
    { id: 'hunt', name: 'The Wild Hunt', fac: 'mo', leader: 'eredin_commander', size: 18, mods: { hand: 2, keep: true }, text: 'Riders out of the frost, on your trail since you landed. They hold two extra cards, and one of their units stays on the board every round.',
      core: ['imlerith', 'arachas', 'arachas', 'arachas', 'arachas_behemoth', 'earth_elemental', 'fire_elemental', 'ice_giant', 'fiend', 'griffin', 'werewolf',
        'frightener', 'plague_maiden', 'forktail', 'sp_frost', 'sp_frost', 'sp_fog', 'sp_horn'] }
  ];
  /* The house's level for each act and kind of fight, before the difficulty shift. */
  const LEVEL_BY = { 1: { battle: 0, elite: 1, boss: 1 }, 2: { battle: 1, elite: 1, boss: 2 }, 3: { battle: 2, elite: 2, boss: 2 } };

  /* ================================================================
     Encounters ("?" on the map). An option may need a card picked from
     the deck first (`pick`: which cards qualify).
     ================================================================ */
  const units = run => run.deck.filter(c => C(c.id).kind === 'unit');
  const honable = run => run.deck.filter(c => C(c.id).kind === 'unit' && (c.up || 0) < HONE_MAX);
  const lifeFull = run => run.lives >= run.maxLives;
  const EVENTS = [
    { id: 'inn', title: 'The Crossroads Inn', acts: [1, 2, 3],
      text: 'The innkeeper keeps a box of curiosities behind the bar, and a regular at the fire wants a friendly hand for a few crowns.',
      options: [
        { label: 'Buy from the box (40 crowns)', sub: 'A random uncommon card for your deck.', need: run => run.crowns >= 40 ? null : 'Not enough crowns.',
          go: run => { run.crowns -= 40; const id = randomCard(run, 'uncommon'); addCard(run, id); return 'You take ' + D.nameOf(id) + ' from the box.'; } },
        { label: 'Play the regular (stake 20)', sub: 'Even odds: win 40 crowns, or lose your 20.', need: run => run.crowns >= 20 ? null : 'Not enough crowns.',
          go: run => { if (rnd(run) < 0.5) { run.crowns += 20; return 'He folds on the last round. You pocket 40.'; } run.crowns -= 20; return 'He passes with a hero still in hand. Your 20 crowns are his.'; } },
        { label: 'Leave', go: () => 'You finish your ale and go.' }
      ] },
    { id: 'glass', title: 'A Man of Glass', acts: [1, 2, 3],
      text: 'A smiling stranger in a plain coat knows your name. He offers you a card you would never otherwise find. His price is only a little cow.',
      options: [
        { label: 'Take his card', sub: 'A random rare card — and a Cow (0 strength) joins your deck.',
          go: run => { const id = randomCard(run, 'rare'); addCard(run, id); addCard(run, CURSE); return D.nameOf(id) + ' joins your deck. So does a Cow, chewing thoughtfully.'; } },
        { label: 'Take his gold', sub: '75 crowns — and a Cow joins your deck.', go: run => { run.crowns += 75; addCard(run, CURSE); return 'The purse is heavy. The Cow is heavier.'; } },
        { label: 'Refuse him', go: () => 'He shrugs, smiles, and is not there any more.' }
      ] },
    { id: 'shrine', title: 'A Shrine of Melitele', acts: [1, 2, 3], shrine: true,
      text: 'A wayside shrine, candles still burning. A priestess tends it.',
      options: [
        { label: 'Pray', sub: 'Regain a life.', need: run => lifeFull(run) ? 'Your lives are full.' : null, go: run => { run.lives++; return 'You rise feeling lighter.'; } },
        { label: 'Leave an offering (25 crowns)', sub: 'Remove a card from your deck.', pick: 'remove', need: run => run.crowns < 25 ? 'Not enough crowns.' : run.deck.length <= MIN_DECK ? 'Your deck is as thin as it can be.' : null,
          go: (run, c) => { run.crowns -= 25; removeCard(run, c.rid); return D.nameOf(c.id) + ' is left at the shrine.'; } },
        { label: 'Leave', go: () => 'You bow your head and walk on.' }
      ] },
    { id: 'vesemir', title: 'An Old Witcher', acts: [1, 2],
      text: 'Vesemir sits by a campfire, shuffling a battered deck. “Sit. Let me show you something.”',
      options: [
        { label: 'Learn from him', sub: 'Hone a unit: +' + HONE + ' strength.', pick: 'hone', need: run => honable(run).length ? null : 'Nothing left to hone.',
          go: (run, c) => { hone(run, c.rid); return D.nameOf(c.id) + ' is sharper now.'; } },
        { label: 'Ask him to join you', sub: 'Vesemir (6, Close) joins your deck.', need: run => countOf(run, 'vesemir') >= capOf('vesemir') ? 'He is already with you.' : null,
          go: run => { addCard(run, 'vesemir'); return '“Fine. Someone has to keep you alive.”'; } }
      ] },
    { id: 'collector', title: 'The Card Collector', acts: [2, 3],
      text: 'A Novigrad collector with a ledger of every card printed. He trades, and he buys.',
      options: [
        { label: 'Trade a card', sub: 'Give a card; get a random card one rarity better.', pick: 'any', need: run => run.deck.length ? null : 'Nothing to trade.',
          go: (run, c) => { const r = { common: 'uncommon', uncommon: 'rare', rare: 'rare', legendary: 'legendary' }[rarityOf(c.id)]; removeCard(run, c.rid); const id = randomCard(run, r); addCard(run, id); return 'He takes ' + D.nameOf(c.id) + ' and gives you ' + D.nameOf(id) + '.'; } },
        { label: 'Sell a card (30 crowns)', sub: 'Remove a card and take 30 crowns.', pick: 'remove', need: run => run.deck.length <= MIN_DECK ? 'Your deck is as thin as it can be.' : null,
          go: (run, c) => { removeCard(run, c.rid); run.crowns += 30; return 'Sold: ' + D.nameOf(c.id) + '.'; } },
        { label: 'Leave', go: () => 'He is already reading his ledger again.' }
      ] },
    { id: 'baron', title: 'The Bloody Baron’s Table', acts: [1],
      text: 'The Baron of Crow’s Perch is drunk, generous and in need of company.',
      options: [
        { label: 'Drink with him', sub: 'Two random units are honed (+' + HONE + ') — and you wake up with a Cow.', need: run => honable(run).length ? null : 'Nothing to hone.',
          go: run => { const list = shuffled(run, honable(run)).slice(0, 2); list.forEach(c => hone(run, c.rid)); addCard(run, CURSE); return 'You remember ' + list.map(c => D.nameOf(c.id)).join(' and ') + ' getting stronger. You do not remember the Cow.'; } },
        { label: 'Play him for coin', sub: '35 crowns.', go: run => { run.crowns += 35; return 'He loses cheerfully and pays.'; } }
      ] },
    { id: 'ambush', title: 'Ambush on the Bridge', acts: [1, 2, 3],
      text: 'Armed men block the bridge. Their captain has a deck out already.',
      options: [
        { label: 'Fight them', sub: 'A contract-strength battle. Win for a trinket and a card.', go: run => ({ fight: 'elite' }) },
        { label: 'Pay them (30 crowns)', need: run => run.crowns >= 30 ? null : 'Not enough crowns.', go: run => { run.crowns -= 30; return 'They let you through, counting.'; } },
        { label: 'Run for it', sub: 'Lose a life.', need: run => run.lives > 1 ? null : 'You would not survive it.', go: run => { run.lives--; return 'You get away, bleeding.'; } }
      ] },
    { id: 'camp', title: 'An Abandoned Camp', acts: [1, 2, 3],
      text: 'Cold fire, torn tents, and a chest nobody came back for. Something large has been sleeping nearby.',
      options: [
        { label: 'Search the chest', sub: 'Most likely a trinket. Perhaps whatever sleeps nearby.', need: run => run.lives > 1 ? null : 'Too dangerous with one life left.',
          go: run => { if (rnd(run) < 0.62) { const t = randomTrinket(run, ['common', 'uncommon']); if (t) { run.trinkets.push(t); applyTrinket(run, t); return 'Inside: ' + TRINKET[t].name + '.'; } run.crowns += 40; return 'Inside: 40 crowns.'; } run.lives--; return 'It wakes. You lose a life getting away.'; } },
        { label: 'Leave it', go: () => 'You leave it for someone braver.' }
      ] },
    { id: 'bard', title: 'A Bard in the Square', acts: [2, 3],
      text: 'Dandelion, viscount de Lettenhove, is between verses and between patrons.',
      options: [
        { label: 'Hire him (30 crowns)', sub: 'Dandelion (2, Close, doubles his row) joins your deck.', need: run => run.crowns < 30 ? 'Not enough crowns.' : countOf(run, 'dandelion') >= capOf('dandelion') ? 'He is already with you.' : null,
          go: run => { run.crowns -= 30; addCard(run, 'dandelion'); return '“A wise investment. I shall write you into a ballad.”'; } },
        { label: 'Ask for a ballad', sub: 'Regain a life — or, if you are well, lose your Cows.', go: run => {
          const cows = run.deck.filter(c => c.id === CURSE);
          if (cows.length) { cows.forEach(c => removeCard(run, c.rid, true)); return 'The song is so bad the Cows wander off (' + cows.length + ').'; }
          if (!lifeFull(run)) { run.lives++; return 'You feel better. Somehow.'; }
          return 'A lovely song. Nothing else happens.'; } }
      ] },
    { id: 'mirror', title: 'The Hall of Mirrors', acts: [2, 3],
      text: 'A ruined mage’s tower. In one mirror your deck lies face up — and the cards in the reflection are real.',
      options: [
        { label: 'Copy a card', sub: 'Lose a life: one card is duplicated, honing and all.', pick: 'copy', need: run => run.lives > 1 ? null : 'Too dangerous with one life left.',
          go: (run, c) => { run.lives--; run.deck.push({ rid: 'c' + (++run.ridN), id: c.id, up: c.up || 0 }); return 'Now there are two of ' + D.nameOf(c.id) + '. The mirror takes its price.'; } },
        { label: 'Smash the mirror', sub: '25 crowns in silver frame.', go: run => { run.crowns += 25; return 'Seven years’ bad luck. 25 crowns.'; } }
      ] }
  ];
  /* The Man of Glass's wares: the cursed trinkets, one of them or none. */
  const cursedOpt = id => ({ label: 'Take ' + TRINKET[id].name, sub: TRINKET[id].text, need: run => has(run, id) ? 'You carry it already.' : null,
    go: run => { run.trinkets.push(id); applyTrinket(run, id); return 'He smiles. ' + TRINKET[id].name + ' is yours.'; } });
  EVENTS.push({ id: 'wares', title: 'The Man of Glass’s Wares', acts: [1, 2, 3],
    text: 'Gaunter O’Dimm has a cloth spread on a milestone, and on it four curiosities. Each, he says, is a gift. Each, he does not say, has a price.',
    options: ['mirror', 'unstable', 'bloodied', 'cursedpurse'].map(cursedOpt).concat([{ label: 'Walk on', go: () => 'You keep your hands in your pockets.' }]) });
  /* ---------------- the second set of encounters (2026-10-18) ----------------
     `when`: offered only if it holds for the run; `long`: the Long Road only.
     A fight may carry a `bonus` paid on a win (battleDone): crowns, a named
     card, a card of a rarity, or the Wild Hunt thrown off your trail. */
  const cowsOf = run => run.deck.filter(c => c.id === CURSE);
  const room = (run, id) => countOf(run, id) < capOf(id);
  const UP = { common: 'uncommon', uncommon: 'rare', rare: 'rare', legendary: 'legendary' };
  const gain = (run, n) => { run.crowns += n; run.stats.crowns += n; };
  const newest = run => run.trinkets[run.trinkets.length - 1];
  EVENTS.push(
    { id: 'passiflora', title: 'Gwent at the Passiflora', acts: [2, 3],
      text: 'Novigrad’s finest house of ill repute is holding a gwent tournament. The purse is real; so are the players.',
      options: [
        { label: 'Enter the tournament (30 crowns)', sub: 'A contract-strength battle. Win for 80 crowns on top of the usual spoils.', need: run => run.crowns >= 30 ? null : 'Not enough crowns.',
          go: run => { run.crowns -= 30; return { fight: 'elite', bonus: { crowns: 80 } }; } },
        { label: 'Watch the final from the bar (15 crowns)', sub: 'Learn from the best: hone a unit of your choice.', pick: 'hone', need: run => run.crowns < 15 ? 'Not enough crowns.' : honable(run).length ? null : 'Nothing left to hone.',
          go: (run, c) => { run.crowns -= 15; hone(run, c.rid); return 'You steal a trick from the champion. ' + D.nameOf(c.id) + ' is sharper.'; } },
        { label: 'Leave', go: () => 'You leave them to it.' }
      ] },
    { id: 'forge', title: 'Hattori’s Forge', acts: [2, 3],
      text: 'An elven smith in the Elven quarter who once made blades for the Scoia’tael. He will work on anything, he says — even cards.',
      options: [
        { label: 'Reforge a unit (50 crowns)', sub: 'Hone one unit twice.', pick: 'hone', need: run => run.crowns < 50 ? 'Not enough crowns.' : honable(run).length ? null : 'Nothing left to hone.',
          go: (run, c) => { run.crowns -= 50; hone(run, c.rid); hone(run, c.rid); return D.nameOf(c.id) + ' comes back from the anvil much the better.'; } },
        { label: 'Melt a card down', sub: 'Remove a card of your choice and take 25 crowns.', pick: 'remove', need: run => run.deck.length <= MIN_DECK ? 'Your deck is as thin as it can be.' : null,
          go: (run, c) => { removeCard(run, c.rid); gain(run, 25); return D.nameOf(c.id) + ' goes into the crucible. 25 crowns.'; } },
        { label: 'Leave', go: () => 'The hammer starts again before you are out of the door.' }
      ] },
    { id: 'trial', title: 'The Trial of the Grasses', acts: [1, 2],
      text: 'The old laboratory at Kaer Morhen still works. The mutagens are stronger than you are — or so say the notes in the margin.',
      options: [
        { label: 'Undergo the trial', sub: 'One life fewer, for good: three random units are honed.', need: run => run.maxLives <= 1 || run.lives <= 1 ? 'You would not survive it.' : honable(run).length ? null : 'Nothing to hone.',
          go: run => { run.maxLives--; run.lives = Math.min(run.lives - 1, run.maxLives); const list = shuffled(run, honable(run)).slice(0, 3); list.forEach(c => hone(run, c.rid)); return 'You wake days later, changed. ' + list.map(c => D.nameOf(c.id)).join(', ') + ' are stronger.'; } },
        { label: 'Drink a weaker draught (25 crowns)', sub: 'Hone a unit of your choice.', pick: 'hone', need: run => run.crowns < 25 ? 'Not enough crowns.' : honable(run).length ? null : 'Nothing left to hone.',
          go: (run, c) => { run.crowns -= 25; hone(run, c.rid); return 'It burns going down. ' + D.nameOf(c.id) + ' is sharper.'; } },
        { label: 'Leave', go: () => 'Some doors are better left shut.' }
      ] },
    { id: 'scribe', title: 'An Oxenfurt Scribe', acts: [1, 2, 3],
      text: 'A student copyist, behind on his rent, offers to “improve” your deck with a steady hand and a loose conscience.',
      options: [
        { label: 'Have a card recopied', sub: 'A card of your choice becomes a random card of the same rarity.', pick: 'any', need: run => run.deck.length ? null : 'Nothing to copy.',
          go: (run, c) => { const r = rarityOf(c.id); removeCard(run, c.rid, true); const id = randomCard(run, r, [c.id]); addCard(run, id); return D.nameOf(c.id) + ' comes back as ' + D.nameOf(id) + '. Nobody will know.'; } },
        { label: 'Sell him your Cows', sub: '15 crowns for every Cow, and they leave your deck.', need: run => cowsOf(run).length ? null : 'You have no Cows.',
          go: run => { const cows = cowsOf(run); cows.forEach(c => removeCard(run, c.rid, true)); gain(run, 15 * cows.length); return 'He has a cousin with a farm. ' + (15 * cows.length) + ' crowns.'; } },
        { label: 'Leave', go: () => 'He goes back to his ledger, and his rent.' }
      ] },
    { id: 'zoltan', title: 'Zoltan Chivay’s Table', acts: [1, 2],
      text: 'A dwarf with a parrot, a pipe and a firm opinion on everything. He is between jobs, and between drinks.',
      options: [
        { label: 'Hire him (35 crowns)', sub: 'Zoltan Chivay (5, Close) joins your deck.', need: run => run.crowns < 35 ? 'Not enough crowns.' : room(run, 'zoltan_chivay') ? null : 'He is already with you.',
          go: run => { run.crowns -= 35; addCard(run, 'zoltan_chivay'); return '“Right. Who are we hitting?”'; } },
        { label: 'Drink with him (20 crowns)', sub: 'Regain a life.', need: run => run.crowns < 20 ? 'Not enough crowns.' : lifeFull(run) ? 'Your lives are full.' : null,
          go: run => { run.crowns -= 20; run.lives++; return 'Mahakam spirit. You feel immortal, and a little of it lasts.'; } },
        { label: 'Leave', go: () => 'The parrot says something rude as you go.' }
      ] },
    { id: 'regis', title: 'A Barber-Surgeon at Midnight', acts: [2, 3],
      text: 'His shop is open at an hour when no barber’s should be, and he never seems to eat. He offers one kindness — only one.',
      options: [
        { label: 'Let him tend you', sub: 'Regain all your lives.', need: run => lifeFull(run) ? 'Your lives are full.' : null, go: run => { run.lives = run.maxLives; return 'Mandrake, and a steady hand. You are whole again.'; } },
        { label: 'Let him operate', sub: 'Remove a card of your choice.', pick: 'remove', need: run => run.deck.length <= MIN_DECK ? 'Your deck is as thin as it can be.' : null,
          go: (run, c) => { removeCard(run, c.rid); return 'A clean cut. ' + D.nameOf(c.id) + ' is gone.'; } },
        { label: 'Ask him to come along', sub: 'Emiel Regis (5, Close) joins your deck.', need: run => room(run, 'emiel_regis_rohellec_terzieff') ? null : 'He is already with you.',
          go: run => { addCard(run, 'emiel_regis_rohellec_terzieff'); return '“Why not? The nights are long, and I am curious.”'; } }
      ] },
    { id: 'olgierd', title: 'Olgierd’s Wager', acts: [2, 3],
      text: 'Olgierd von Everec, sabre at his hip and a rose in his lapel, is bored. “A game, then. Win, and I ride with you.”',
      options: [
        { label: 'Accept the wager', sub: 'A contract-strength battle. Win and Olgierd von Everec (6, Morale Boost) joins you too.', need: run => room(run, 'olgierd_von_everec') ? null : 'He is already with you.',
          go: () => ({ fight: 'elite', bonus: { card: 'olgierd_von_everec' } }) },
        { label: 'Buy his finest card (70 crowns)', sub: 'A random rare card.', need: run => run.crowns >= 70 ? null : 'Not enough crowns.',
          go: run => { run.crowns -= 70; const id = randomCard(run, 'rare'); addCard(run, id); return '“Take it. I have more than I can lose.” ' + D.nameOf(id) + ' joins your deck.'; } },
        { label: 'Decline', go: () => '“Pity.” He is already looking for someone else.' }
      ] },
    { id: 'triss', title: 'A Sorceress in Hiding', acts: [2],
      text: 'Witch hunters are searching the docks. In a fishmonger’s cellar, a red-haired sorceress asks you not to have seen her.',
      options: [
        { label: 'Smuggle her out (40 crowns)', sub: 'Triss Merigold (7, hero) joins your deck.', need: run => run.crowns < 40 ? 'Not enough crowns.' : room(run, 'triss_merigold') ? null : 'She is already with you.',
          go: run => { run.crowns -= 40; addCard(run, 'triss_merigold'); return 'A boat at midnight, and a sorceress in your debt.'; } },
        { label: 'Turn her in', sub: '90 crowns — and your conscience: a Cow joins your deck.', go: run => { gain(run, 90); addCard(run, CURSE); return 'The reward is generous. The Cow follows you out.'; } },
        { label: 'Walk past', go: () => 'You saw nothing.' }
      ] },
    { id: 'avallach', title: 'The Mysterious Elf', acts: [3],
      text: 'An elf in a white hood steps out of the air, says he knows the way, and steps back into it.',
      options: [
        { label: 'Follow him through the portal', sub: 'Lose a life: ' + D.nameOf('mysterious_elf') + ' (Spy, hero) joins your deck.', need: run => run.lives <= 1 ? 'You would not survive the crossing.' : room(run, 'mysterious_elf') ? null : 'He is already with you.',
          go: run => { run.lives--; addCard(run, 'mysterious_elf'); return 'The world folds. He is waiting on the other side.'; } },
        { label: 'Ask what he knows', sub: 'He leads the Wild Hunt astray: it falls four behind.', go: run => { run.hunt = Math.max(0, (run.hunt || 0) - 4); return '“They are fast. I am faster.”'; } },
        { label: 'Let him go', go: () => 'The air closes behind him.' }
      ] },
    { id: 'dragon', title: 'The Golden Dragon', acts: [2, 3],
      text: 'A knight called Borch Three Jackdaws shares your fire, then admits he is a dragon. He needs someone to guard what he loves, and offers himself in trade.',
      options: [
        { label: 'Leave your strongest unit to guard his eggs', sub: 'Your strongest unit leaves your deck; Villentretenmerth (7, Scorch) joins it.',
          need: run => !room(run, 'villentretenmerth') ? 'He is already with you.' : woundable(run) ? null : 'You have no unit to leave.',
          go: run => { const c = woundable(run); removeCard(run, c.rid, true); addCard(run, 'villentretenmerth'); return D.nameOf(c.id) + ' stays behind. A dragon rides with you.'; } },
        { label: 'Ask for his gold', sub: '45 crowns.', go: run => { gain(run, 45); return 'Dragons are generous with what they have hoarded.'; } },
        { label: 'Wish him well', go: () => 'He bows, and is gone before dawn.' }
      ] },
    { id: 'bovine', title: 'The Bovine Defense Force', acts: [1, 2, 3], when: run => cowsOf(run).length > 0,
      text: 'A village militia drills with farm animals. Their sergeant eyes your Cow with professional interest.',
      options: [
        { label: 'Enlist your Cow', sub: 'A Cow leaves your deck; the Bovine Defense Force (8, Close) joins it.', need: run => !cowsOf(run).length ? 'You have no Cow.' : room(run, 'bovine_defense_force') ? null : 'They are already with you.',
          go: run => { removeCard(run, cowsOf(run)[0].rid, true); addCard(run, 'bovine_defense_force'); return 'Your Cow is a soldier now. The regiment marches with you.'; } },
        { label: 'Sell them a Cow (25 crowns)', need: run => cowsOf(run).length ? null : 'You have no Cow.',
          go: run => { removeCard(run, cowsOf(run)[0].rid, true); gain(run, 25); return 'Conscripted. 25 crowns.'; } },
        { label: 'Keep your Cow', go: () => 'She was not cut out for the army anyway.' }
      ] },
    { id: 'fence', title: 'A Fence in Oxenfurt', acts: [2, 3], when: run => run.trinkets.length > 0,
      text: 'Behind a bookbinder’s, a man who asks no questions buys trinkets — even the ones that bite.',
      options: [
        { label: 'Sell your newest trinket', sub: run => { const t = TRINKET[newest(run)]; return t ? t.name + ': ' + (t.rarity === 'cursed' ? 'he takes it off your hands for nothing.' : Math.round(TRINKET_PRICE[t.rarity] / 2) + ' crowns.') : ''; },
          need: run => run.trinkets.length ? null : 'You carry no trinkets.',
          go: run => { const id = newest(run), t = TRINKET[id]; dropTrinket(run, id); if (t.rarity !== 'cursed') gain(run, Math.round(TRINKET_PRICE[t.rarity] / 2)); return t.name + (t.rarity === 'cursed' ? ' is his problem now.' : ' is sold.'); } },
        { label: 'Trade it up', sub: run => { const t = TRINKET[newest(run)]; return t ? t.name + ' for a random trinket ' + (t.rarity === 'cursed' ? '(a common one).' : 'a rarity better.') : ''; },
          need: run => { const t = TRINKET[newest(run)]; return !t ? 'You carry no trinkets.' : randomTrinket(run, [t.rarity === 'cursed' ? 'common' : UP[t.rarity]]) ? null : 'He has nothing better.'; },
          go: run => { const id = newest(run), t = TRINKET[id]; const got = randomTrinket(run, [t.rarity === 'cursed' ? 'common' : UP[t.rarity]]); dropTrinket(run, id); run.trinkets.push(got); applyTrinket(run, got); return t.name + ' for ' + TRINKET[got].name + '.'; } },
        { label: 'Leave', go: () => 'He goes back to his bookbinding.' }
      ] },
    { id: 'hillock', title: 'The Whispering Hillock', acts: [1],
      text: 'A spirit bound under an old oak whispers promises. Free it, it says, and it will reward you. The orphans of Crookback Bog say otherwise.',
      options: [
        { label: 'Free the spirit', sub: 'A random uncommon trinket — and two Cows join your deck (the village pays).',
          go: run => { const t = randomTrinket(run, ['uncommon']); addCard(run, CURSE); addCard(run, CURSE); if (t) { run.trinkets.push(t); applyTrinket(run, t); return 'It keeps its word: ' + TRINKET[t].name + '. Somewhere a village loses its cattle.'; } gain(run, 60); return 'It keeps its word: 60 crowns. Somewhere a village loses its cattle.'; } },
        { label: 'Destroy it', sub: 'Regain a life, and remove a card of your choice.', pick: 'remove', need: run => run.deck.length <= MIN_DECK ? 'Your deck is as thin as it can be.' : null,
          go: (run, c) => { removeCard(run, c.rid); if (!lifeFull(run)) run.lives++; return 'The oak burns, and ' + D.nameOf(c.id) + ' with it. The air is lighter.'; } },
        { label: 'Leave', go: () => 'The whispering follows you a long way.' }
      ] },
    { id: 'wedding', title: 'A Wedding in Vegelbud', acts: [2, 3],
      text: 'A Toussaint wedding at full gallop: music, wine, a table of gifts, and nobody watching the table.',
      options: [
        { label: 'Dance', sub: 'Regain a life.', need: run => lifeFull(run) ? 'Your lives are full.' : null, go: run => { run.lives++; return 'You dance until dawn, and wake the better for it.'; } },
        { label: 'Give the couple a gift (40 crowns)', sub: 'They give one back: a random common trinket.', need: run => run.crowns < 40 ? 'Not enough crowns.' : randomTrinket(run, ['common']) ? null : 'You have every common trinket.',
          go: run => { run.crowns -= 40; const t = randomTrinket(run, ['common']); run.trinkets.push(t); applyTrinket(run, t); return 'The bride presses ' + TRINKET[t].name + ' into your hand.'; } },
        { label: 'Pocket the gifts', sub: '70 crowns now — and then the guards: a battle.', go: run => { gain(run, 70); return { fight: 'battle' }; } }
      ] },
    { id: 'pyres', title: 'The Witch Hunters’ Pyres', acts: [2],
      text: 'In the square a pyre is stacked and a mage is tied to the stake. The hunters’ captain shuffles a deck while he waits for a torch.',
      options: [
        { label: 'Challenge the captain', sub: 'A contract-strength battle. Win and the mage you save adds a random rare card to your deck.', go: () => ({ fight: 'elite', bonus: { rarity: 'rare' } }) },
        { label: 'Bribe the guards (50 crowns)', sub: 'The mage slips away, and leaves you a random uncommon card.', need: run => run.crowns >= 50 ? null : 'Not enough crowns.',
          go: run => { run.crowns -= 50; const id = randomCard(run, 'uncommon'); addCard(run, id); return 'A grateful note, and ' + D.nameOf(id) + '.'; } },
        { label: 'Look away', go: () => 'You hear the crowd behind you for a long time.' }
      ] },
    { id: 'scouts', title: 'Wild Hunt Scouts', acts: [3],
      text: 'Three riders in skull helms are watering their horses. They have not seen you yet.',
      options: [
        { label: 'Ambush them', sub: 'A battle. Win and the Hunt loses your trail entirely.', go: () => ({ fight: 'battle', bonus: { hunt: true } }) },
        { label: 'Hide and rest', sub: 'Regain a life — but the Hunt comes three closer.', need: run => lifeFull(run) ? 'Your lives are full.' : null,
          go: run => { run.lives++; run.hunt = (run.hunt || 0) + 3; return 'You rest in the cold. When you rise, the hoofbeats are nearer.'; } },
        { label: 'Slip away', go: () => 'You lead your horse off by the bridle, quietly.' }
      ] },
    { id: 'noonwraith', title: 'The Noonwraith of the Well', acts: [1],
      text: 'At midday a woman in a burial dress rises from a dry well, weeping. The villagers say her dowry is still down there.',
      options: [
        { label: 'Burn her remains', sub: 'A battle. Win for 30 crowns more.', go: () => ({ fight: 'battle', bonus: { crowns: 30 } }) },
        { label: 'Climb down for the dowry', sub: 'Half the time 60 crowns; half the time she catches you and you lose a life.', need: run => run.lives > 1 ? null : 'Too dangerous with one life left.',
          go: run => { if (rnd(run) < 0.5) { gain(run, 60); return 'Silver in a rotted chest: 60 crowns.'; } run.lives--; return 'Cold hands find you in the dark. You lose a life getting out.'; } },
        { label: 'Leave', go: () => 'You draw water elsewhere.' }
      ] },
    { id: 'herbalist', title: 'A Herbalist’s Garden', acts: [1, 2, 3], long: true,
      text: 'An old herbalist sells what she grows and gives away what she cannot sell.',
      options: [
        { label: 'Ask what she can spare', sub: 'A random potion.', need: run => !run.potions ? 'Potions are for the Long Road.' : beltFull(run) ? 'Your belt is full.' : null,
          go: run => { const p = randomPotion(run); run.potions.push(p); return 'She hands you ' + POTION[p].name + '.'; } },
        { label: 'Buy a bundle (45 crowns)', sub: 'Two random potions (as many as your belt holds).', need: run => !run.potions ? 'Potions are for the Long Road.' : run.crowns < 45 ? 'Not enough crowns.' : beltFull(run) ? 'Your belt is full.' : null,
          go: run => { run.crowns -= 45; const got = []; for (let k = 0; k < 2 && !beltFull(run); k++) { const p = randomPotion(run); run.potions.push(p); got.push(POTION[p].name); } return 'Wrapped in paper: ' + got.join(' and ') + '.'; } },
        { label: 'Leave', go: () => 'She waves you off with a trowel.' }
      ] },
    { id: 'ciri', title: 'A Girl with Ashen Hair', acts: [3],
      text: 'A young woman with a scar and a sword too big for her sits at your fire. She is hunted too. She asks for nothing — but she is watching your purse.',
      options: [
        { label: 'Give her everything you carry', sub: 'All your crowns (at least 60): a random legendary card.', need: run => run.crowns >= 60 ? null : 'You carry less than 60 crowns.',
          go: run => { run.crowns = 0; const id = randomCard(run, 'legendary'); addCard(run, id); return 'She leaves before dawn. In her place, ' + D.nameOf(id) + '.'; } },
        { label: 'Share your fire', sub: 'Regain a life.', need: run => lifeFull(run) ? 'Your lives are full.' : null, go: run => { run.lives++; return 'You keep watch by turns. Both of you sleep.'; } },
        { label: 'Teach her a hand of gwent', sub: 'Hone a unit of your choice.', pick: 'hone', need: run => honable(run).length ? null : 'Nothing left to hone.',
          go: (run, c) => { hone(run, c.rid); return 'She learns fast, and so do you: ' + D.nameOf(c.id) + ' is sharper.'; } }
      ] }
  );
  /* The Witch's Hut: the second set of cursed trinkets. */
  EVENTS.push({ id: 'hut', title: 'The Witch’s Hut', acts: [2, 3],
    text: 'A hut on stilts in the marsh. The witch inside has three charms on a string, and a smile with too many teeth.',
    options: ['henfoot', 'pearl', 'bloodcoin'].map(cursedOpt).concat([{ label: 'Walk on', go: () => 'You do not look back. You hear her laughing anyway.' }]) });
  const EVENT = {};
  EVENTS.forEach(e => { EVENT[e.id] = e; });

  /* ================================================================
     Deck helpers
     ================================================================ */
  const countOf = (run, id) => run.deck.filter(c => c.id === id).length;
  function addCard(run, id, up) { const c = { rid: 'c' + (++run.ridN), id, up: up || 0 }; run.deck.push(c); return c; }
  function removeCard(run, rid, free) {
    const i = run.deck.findIndex(c => c.rid === rid);
    if (i < 0) return null;
    if (!free && run.deck.length <= MIN_DECK) return null;
    return run.deck.splice(i, 1)[0];
  }
  function hone(run, rid) {
    const c = run.deck.find(x => x.rid === rid);
    if (!c || C(c.id).kind !== 'unit') return false;
    c.up = Math.min(HONE_MAX, (c.up || 0) + (has(run, 'whetstone') ? 3 : HONE));
    return true;
  }
  /* A random card of one rarity for this run's faction (neutral a quarter of the time). */
  function randomCard(run, rarity, exclude) {
    exclude = exclude || [];
    const pool = poolFor(run.fac).filter(id => rarityOf(id) === rarity && countOf(run, id) < capOf(id) && exclude.indexOf(id) < 0);
    if (!pool.length) return rarity === 'legendary' ? randomCard(run, 'rare', exclude) : rarity === 'rare' ? randomCard(run, 'uncommon', exclude) : 'sp_decoy';
    const own = pool.filter(id => C(id).fac === run.fac);
    const ne = pool.filter(id => C(id).fac !== run.fac);
    const from = own.length && (!ne.length || rnd(run) < 0.72) ? own : ne;
    return pickOne(run, from);
  }
  function randomTrinket(run, rarities) {
    const pool = TRINKETS.filter(t => run.trinkets.indexOf(t.id) < 0 && t.rarity !== 'cursed' && (!rarities || rarities.indexOf(t.rarity) >= 0) &&
      !((t.id === 'decoction' || t.id === 'pipe') && on(run, 'onelife')));
    return pool.length ? pickOne(run, pool).id : null;
  }
  function applyTrinket(run, id) {
    if (id === 'decoction') { run.maxLives++; run.lives = run.maxLives; }
    if (id === 'cursedpurse') { run.crowns += 150; run.stats.crowns += 150; }
    if (id === 'note') { run.crowns += 50; run.stats.crowns += 50; }
  }
  /* A trinket leaves you (the Fence): what it gave for good goes with it. */
  function dropTrinket(run, id) {
    const i = run.trinkets.indexOf(id);
    if (i < 0) return;
    run.trinkets.splice(i, 1);
    if (id === 'decoction') { run.maxLives = Math.max(1, run.maxLives - 1); run.lives = Math.min(run.lives, run.maxLives); }
  }
  /* The card choice after a win: rarity weights by act and fight. */
  const RARITY_W = {
    battle: { 1: [64, 31, 5, 0], 2: [50, 39, 11, 0], 3: [38, 44, 18, 0] },
    elite: { 1: [30, 52, 18, 0], 2: [22, 52, 26, 0], 3: [14, 50, 36, 0] },
    boss: { 1: [0, 0, 80, 20], 2: [0, 0, 70, 30], 3: [0, 0, 60, 40] }
  };
  function cardChoice(run, kind) {
    const n = (has(run, 'eye') ? 4 : 3) + (has(run, 'bestiary') && (kind === 'elite' || kind === 'hunt') ? 1 : 0);
    const w = RARITY_W[kind === 'hunt' ? 'elite' : kind][run.act];
    const out = [];
    /* The Long Road's pity counter (battles, contracts and the Hunt; a boss pays rares anyway). */
    const pity = run.long && kind !== 'boss';
    /* The Ofieri Saddle: the first card a rarity better (a rare stays rare). */
    const saddle = (k, r) => k === 0 && has(run, 'saddle') ? { common: 'uncommon', uncommon: 'rare', rare: 'rare', legendary: 'legendary' }[r] : r;
    for (let k = 0; k < n; k++) {
      let r;
      if (pity) {
        const rare = Math.max(0, w[2] + (kind === 'battle' ? 0 : ELITE_RARE) + run.luck);
        r = saddle(k, weighted(run, [['common', Math.max(0, 100 - w[1] - rare)], ['uncommon', w[1]], ['rare', rare]]));
        if (r === 'rare') run.luck = LUCK0;
        else if (r === 'common') run.luck++;
      } else r = saddle(k, weighted(run, [['common', w[0]], ['uncommon', w[1]], ['rare', w[2]], ['legendary', w[3]]]));
      out.push(randomCard(run, r, out));
    }
    return out;
  }

  /* ================================================================
     The map: StS-style — four paths up a five-wide grid that never
     cross, the nodes they touch, and the boss above them all.
     ================================================================ */
  function genMap(run) {
    const edges = {};          // 'f:c' -> Set of next cols
    const used = {};
    const crosses = (f, a, b) => {
      for (const k of Object.keys(edges)) {
        const [ff, cc] = k.split(':').map(Number);
        if (ff !== f) continue;
        for (const d of edges[k]) if ((a < cc && b > d) || (a > cc && b < d)) return true;
      }
      return false;
    };
    const { floors: FL, cols: CO, paths: PA } = shapeOf(run);
    const starts = shuffled(run, Array.from({ length: CO }, (_, c) => c));
    for (let p = 0; p < PA; p++) {
      let col = p < 2 ? starts[p] : int(run, 0, CO - 1);
      used['0:' + col] = true;
      for (let f = 0; f < FL - 1; f++) {
        let next = col;
        for (let t = 0; t < 12; t++) {
          const c2 = Math.max(0, Math.min(CO - 1, col + int(run, -1, 1)));
          if (!crosses(f, col, c2)) { next = c2; break; }
        }
        const k = f + ':' + col;
        (edges[k] = edges[k] || []);
        if (edges[k].indexOf(next) < 0) edges[k].push(next);
        used[(f + 1) + ':' + next] = true;
        col = next;
      }
    }
    const floors = [];
    for (let f = 0; f < FL; f++) {
      const row = [];
      for (let c = 0; c < CO; c++) {
        if (!used[f + ':' + c]) continue;
        row.push({ id: f + ':' + c, f, c, kind: null, next: f < FL - 1 ? (edges[f + ':' + c] || []).slice().sort().map(n => (f + 1) + ':' + n) : ['boss'] });
      }
      floors.push(row);
    }
    /* What each node is. */
    for (const row of floors) for (const n of row) {
      const f = n.f;
      if (run.long) {
        if (f === 0) n.kind = 'battle';
        else if (f === LONG.treasure) n.kind = 'treasure';
        else if (f === FL - 1) n.kind = 'camp';
        else n.kind = weighted(run, LONG.rooms.filter(p => !((p[0] === 'elite' || p[0] === 'camp') && f < LONG.early) && !(p[0] === 'camp' && f === FL - 2)));
        continue;
      }
      if (f === 0) n.kind = 'battle';
      else if (f === 3) n.kind = 'treasure';
      else if (f === FLOORS - 1) n.kind = 'camp';
      else n.kind = weighted(run, [['battle', 45], ['event', 22], ['elite', f >= 2 ? 14 : 0], ['shop', f >= 2 ? 12 : 3], ['camp', f >= 2 && f !== FLOORS - 2 ? 9 : 0]]);
    }
    /* No two merchants or two campfires straight after one another on a path. */
    const byId = {};
    floors.forEach(row => row.forEach(n => { byId[n.id] = n; }));
    for (const row of floors) for (const n of row) for (const id of n.next) {
      const m = byId[id];
      if (m && (m.kind === n.kind) && (m.kind === 'shop' || m.kind === 'camp' || m.kind === 'elite')) m.kind = 'battle';
    }
    const boss = pickOne(run, ENEMIES[run.act].boss).id;
    run.map = { floors, boss };
    run.pos = null;
    run.path = [];
  }
  function node(run, id) {
    if (id === 'boss') return { id: 'boss', f: floorsOf(run), kind: 'boss', next: [] };
    for (const row of run.map.floors) for (const n of row) if (n.id === id) return n;
    return null;
  }
  function reachable(run) {
    if (run.screen.k !== 'map') return [];
    if (!run.pos) return run.map.floors[0].map(n => n.id);
    const n = node(run, run.pos);
    return n ? n.next.slice() : [];
  }

  /* ================================================================
     A new run
     ================================================================ */
  function newRun(o) {
    o = o || {};
    const fac = o.fac;
    if (!STARTER[fac]) throw new Error('Choose a faction.');
    const leader = o.leader && D.LEADER[o.leader] && D.LEADER[o.leader].fac === fac ? o.leader : D.HOUSE_LEADER[fac];
    const diff = DIFFICULTY[o.diff] ? o.diff : 'witcher';
    const seed = o.seed == null ? (Date.now() >>> 0) : (o.seed >>> 0);
    const run = {
      v: VERSION, seed, rs: seed || 1, name: o.name || 'You', fac, leader, diff,
      lives: DIFFICULTY[diff].lives, maxLives: DIFFICULTY[diff].lives, crowns: 0, trinkets: [], deck: [], ridN: 0,
      act: 1, map: null, pos: null, path: [], removeCost: 60, battleN: 0,
      screen: { k: 'map' }, history: [], stats: { won: 0, lost: 0, cards: 0, removed: 0, honed: 0, crowns: 0, wounds: 0 }, over: null, started: o.now || null,
      ch: (o.challenges || []).filter(id => CHALLENGE[id]), woundAct: 0, hunt: 0, after: null
    };
    if (o.long) {
      run.long = true;
      run.lives += LONG.lives; run.maxLives += LONG.lives;
      run.removeCost = LONG.removeCost;
      run.potions = []; run.potionP = POTION0; run.luck = LUCK0;
    }
    if (on(run, 'onelife')) { run.lives = 1; run.maxLives = 1; }
    STARTER[fac].forEach(id => addCard(run, id));
    if (on(run, 'cows')) { addCard(run, CURSE); addCard(run, CURSE); }
    genMap(run);
    run.screen = { k: 'act', act: 1 };
    return run;
  }

  /* ================================================================
     Moving on the map
     ================================================================ */
  function go(run, id) {
    if (run.over) return no('The run is over.');
    if (run.screen.k !== 'map') return no('Finish what is in front of you first.');
    if (reachable(run).indexOf(id) < 0) return no('You cannot reach that from here.');
    const n = node(run, id);
    run.pos = id;
    run.path.push(id);
    if (run.act === 3 && n.kind !== 'boss') {
      run.hunt = (run.hunt || 0) + 1 + (n.kind === 'battle' || n.kind === 'elite' || has(run, 'cloak') ? 0 : 1);
      if (run.hunt >= huntOf(run)) {
        run.hunt = 0;
        run.after = id;
        run.screen = battleScreen(run, 'hunt', 'hunt');
        return yes({ hunt: true });
      }
    }
    return enter(run, n);
  }
  /* What a node does once you are on it. */
  function enter(run, n) {
    switch (n.kind) {
      case 'battle': case 'elite': case 'boss': run.screen = battleScreen(run, n.kind); break;
      case 'shop': run.screen = shopScreen(run); if (has(run, 'note')) { gain(run, 15); run.screen.interest = 15; } break;
      case 'camp': run.screen = { k: 'camp', done: null }; break;
      case 'treasure': {
        if (run.long) {
          const size = weighted(run, Object.keys(CHESTS).map(k => [k, CHESTS[k].odds]));
          const ch = CHESTS[size];
          const want = weighted(run, ch.rarity);
          const t = randomTrinket(run, [want]) || randomTrinket(run, ['common', 'uncommon', 'rare']);
          const crowns = int(run, ch.crowns[0], ch.crowns[1]) + run.act * 10;
          run.crowns += crowns; run.stats.crowns += crowns;
          if (t) { run.trinkets.push(t); applyTrinket(run, t); }
          run.screen = { k: 'treasure', crowns, trinket: t, chest: size };
          break;
        }
        const t = randomTrinket(run, ['common', 'uncommon', 'rare']);
        const crowns = int(run, 25, 45) + run.act * 10;
        run.crowns += crowns; run.stats.crowns += crowns;
        if (t) { run.trinkets.push(t); applyTrinket(run, t); }
        run.screen = { k: 'treasure', crowns, trinket: t };
        break;
      }
      case 'event': {
        const inAct = e => e.acts.indexOf(run.act) >= 0;
        const shrine = !!run.long && rnd(run) * 100 < SHRINE_ODDS;
        /* (The Path ignores the shrine mark: Melitele's is an ordinary encounter there.) */
        const kindOk = e => (!run.long || !!e.shrine === shrine) && (!e.long || !!run.long) && (!e.when || e.when(run));
        const pool = EVENTS.filter(e => inAct(e) && kindOk(e) && (shrine || (run.seen || []).indexOf(e.id) < 0));
        const ev = (pool.length ? pickOne(run, pool) : pickOne(run, EVENTS.filter(e => inAct(e) && kindOk(e)))).id;
        run.seen = (run.seen || []).concat(ev);
        run.screen = { k: 'event', ev, result: null };
        break;
      }
    }
    return yes();
  }
  function battleScreen(run, kind, from) {
    const list = kind === 'hunt' ? ENEMIES[3].hunt : ENEMIES[run.act][kind];
    let e;
    if (kind === 'boss') e = list.find(x => x.id === run.map.boss) || list[0];
    else {
      /* Not the same opponent twice in a row in an act if it can be helped. */
      const fresh = list.filter(x => (run.met || []).indexOf(x.id) < 0);
      e = pickOne(run, fresh.length ? fresh : list);
    }
    run.met = (run.met || []).concat(e.id);
    const seed = (int(run, 1, 0x7fffffff) >>> 0) || 7;
    return { k: 'battle', kind, foe: e.id, seed, from: from || null, moves: [], tries: 0, drunk: [], prep: !!(run.potions && run.potions.length) };
  }
  function enemyOf(run, id) {
    for (const a of [1, 2, 3]) for (const k of ['battle', 'elite', 'boss', 'hunt']) { const e = (ENEMIES[a][k] || []).find(x => x.id === id); if (e) return e; }
    return null;
  }
  /* How much harder a Long Road fight is than the same fight on The Path. */
  function longScale(run, s) {
    if (!run.long) return { hand: 0, lvl: 0 };
    const S = LONG.scale;
    const f = run.pos === 'boss' ? LONG.floors : ((run.pos && node(run, run.pos)) || { f: 0 }).f;
    /* A knob is one number, or one an act. */
    const byAct = v => Array.isArray(v) ? v[run.act - 1] : v;
    const hand = s.kind === 'battle' ? byAct(S.battle)[f >= LONG.treasure ? 1 : 0] : (byAct(S[s.kind]) || 0);
    return { hand, lvl: byAct(S.lvl[s.kind]) || 0 };
  }
  /* The two players for gw-engine.create — the run's deck and trinkets, and
     the opponent's sampled deck. The opponent's deck is drawn from the
     battle's seed, so a resumed battle meets the same deck. */
  function battleSetup(run) {
    const s = run.screen;
    if (s.k !== 'battle') return null;
    const e = enemyOf(run, s.foe);
    const tmp = { rs: (s.seed ^ 0x5bd1e995) >>> 0 };
    const cards = shuffled(tmp, e.core).slice(0, Math.min(e.size, e.core.length));
    const dif = DIFFICULTY[run.diff];
    const sc = longScale(run, s);
    const lvl = Math.max(0, Math.min(2, LEVEL_BY[run.act][s.kind === 'hunt' ? 'elite' : s.kind] + dif.shift + sc.lvl));
    const mods = addMods(Object.assign({}, e.mods || {}), foeMods(run));
    const mine = playerMods(run);
    for (const id of s.drunk || []) { addMods(mine, POTION[id].mods); addMods(mods, POTION[id].foe); }
    if (dif.foeHand) mods.hand = (mods.hand || 0) + dif.foeHand;
    if (sc.hand) mods.hand = (mods.hand || 0) + sc.hand;
    if (s.kind === 'boss' && on(run, 'gems')) mods.gems = 3;
    const F = D.faction(e.fac);
    return {
      seed: s.seed + s.tries * 7919,
      foe: e,
      players: [
        { id: 'you', name: run.name, hex: '#e0b456', fac: run.fac, leader: run.leader, cards: run.deck.map(c => c.up ? { id: c.id, up: c.up } : c.id), mods: mine },
        { id: 'foe', name: e.name, hex: F ? F.hex : '#c8343a', bot: true, level: LEVELS[lvl], fac: e.fac, leader: e.leader, cards, mods }
      ]
    };
  }

  /* A battle ended: result = { won, draw, rounds: [{ winner }] }. */
  function battleDone(run, result) {
    const s = run.screen;
    if (s.k !== 'battle') return no('There is no battle.');
    const e = enemyOf(run, s.foe);
    run.battleN++;
    run.history.push({ act: run.act, floor: run.pos === 'boss' ? floorsOf(run) : (node(run, run.pos) || {}).f, kind: s.kind, foe: e.id, won: !!result.won });
    if (!result.won) {
      run.stats.lost++;
      const best = woundable(run);
      /* Once an act you may take a wound on your best card instead of a life. */
      if (best && run.woundAct !== run.act) {
        run.screen = { k: 'lost', kind: s.kind, foe: e.id, retry: s.kind === 'boss', prev: s, choice: true, chose: null, best: best.id };
        return yes();
      }
      run.lives--;
      if (run.lives <= 0) return endRun(run, false, e.name);
      run.screen = { k: 'lost', kind: s.kind, foe: e.id, retry: s.kind === 'boss', prev: s, chose: 'life' };
      return yes();
    }
    run.stats.won++;
    const flawless = result.rounds && result.rounds.every(r => r.winner === 'you');
    const base = s.kind === 'boss' ? 70 + run.act * 15 : s.kind === 'elite' || s.kind === 'hunt' ? int(run, 28, 38) + run.act * 6 : int(run, 12, 20) + run.act * 4;
    let crowns = base + (flawless ? Math.round(base * 0.25) : 0);
    if (has(run, 'purse')) crowns = Math.round(crowns * 1.5);
    if (has(run, 'bloodcoin')) crowns *= 2;
    if (has(run, 'bestiary') && (s.kind === 'elite' || s.kind === 'hunt')) crowns *= 2;
    if (on(run, 'poor')) crowns = Math.round(crowns / 2);
    run.crowns += crowns; run.stats.crowns += crowns;
    const rw = { k: 'reward', from: s.from || null, kind: s.kind, foe: e.id, crowns, flawless: !!flawless, cards: cardChoice(run, s.kind), took: null, trinket: null, leaders: null, leaderTook: null, healed: 0 };
    if (s.kind === 'elite' || s.kind === 'boss' || s.kind === 'hunt') {
      const t = randomTrinket(run, s.kind === 'boss' ? ['rare', 'uncommon'] : ['common', 'uncommon', 'rare']);
      if (t) { run.trinkets.push(t); applyTrinket(run, t); rw.trinket = t; }
    }
    /* An encounter's fight may promise more (EVENTS: `bonus`). */
    if (s.bonus) {
      const b = s.bonus, got = [];
      if (b.crowns) { gain(run, b.crowns); got.push(b.crowns + ' crowns'); }
      if (b.card && room(run, b.card)) { addCard(run, b.card); run.stats.cards++; got.push(D.nameOf(b.card) + ' joins your deck'); }
      if (b.rarity) { const id = randomCard(run, b.rarity); addCard(run, id); run.stats.cards++; got.push(D.nameOf(id) + ' joins your deck'); }
      if (b.hunt) { run.hunt = 0; got.push('the Wild Hunt loses your trail'); }
      rw.bonus = got.join(' · ');
    }
    /* The Long Road: a potion, perhaps (not from a boss). */
    if (run.long && s.kind !== 'boss') {
      if (rnd(run) * 100 < run.potionP) {
        run.potionP -= POTION_STEP;
        rw.potion = randomPotion(run);
        if (!beltFull(run)) { run.potions.push(rw.potion); rw.potionTook = true; }
      } else run.potionP += POTION_STEP;
    }
    if (s.kind === 'boss') {
      if (!lifeFull(run)) { run.lives++; rw.healed = 1; }
      const others = D.leadersOf(run.fac).filter(id => id !== run.leader);
      rw.leaders = shuffled(run, others).slice(0, 2);
    }
    run.screen = rw;
    return yes();
  }
  function retry(run) {
    const s = run.screen;
    if (s.k !== 'lost') return no('Nothing to retry.');
    if (s.choice && !s.chose) return no('Lose a life or take a wound first.');
    if (s.retry) { run.screen = Object.assign({}, s.prev, { tries: (s.prev.tries || 0) + 1, moves: [], drunk: [], prep: !!(run.potions && run.potions.length) }); return yes(); }
    return toMap(run);
  }
  /* Back to the map — or on to where you were going when the Hunt caught you. */
  function toMap(run) {
    run.screen = { k: 'map' };
    if (run.after) { const n = node(run, run.after); run.after = null; if (n) return enter(run, n); }
    return yes();
  }
  /* The card a wound would fall on: your strongest unit. */
  function woundable(run) {
    return run.deck.filter(c => C(c.id).kind === 'unit' && C(c.id).str + (c.up || 0) > 0)
      .sort((a, b) => (C(b.id).str + (b.up || 0)) - (C(a.id).str + (a.up || 0)))[0] || null;
  }
  const WOUND = 3;
  /* After a lost battle: a life, or (once an act) a wound on your best card. */
  function takeLoss(run, how) {
    const s = run.screen;
    if (s.k !== 'lost' || !s.choice || s.chose) return no('Nothing to choose.');
    if (how === 'wound') {
      const c = woundable(run);
      if (!c) return no('Nothing left to wound.');
      c.up = (c.up || 0) - WOUND;
      run.woundAct = run.act;
      run.stats.wounds++;
      s.chose = 'wound'; s.wounded = c.id; s.left = Math.max(0, C(c.id).str + c.up);
      return yes();
    }
    run.lives--;
    s.chose = 'life';
    if (run.lives <= 0) return endRun(run, false, enemyOf(run, s.foe).name);
    return yes();
  }
  function takeCard(run, i) {
    const s = run.screen;
    if (s.k !== 'reward' || s.took) return no('No card to take.');
    if (i == null) { s.took = 'skip'; return yes(); }
    const id = s.cards[i];
    if (!id) return no('That is not one of the cards.');
    addCard(run, id); run.stats.cards++;
    s.took = id;
    return yes();
  }
  function takeLeader(run, id) {
    const s = run.screen;
    if (s.k !== 'reward' || !s.leaders || s.leaderTook) return no('No leader on offer.');
    if (id == null) { s.leaderTook = 'keep'; return yes(); }
    if (s.leaders.indexOf(id) < 0) return no('That leader is not on offer.');
    run.leader = id; s.leaderTook = id;
    return yes();
  }

  /* ================================================================
     Potions
     ================================================================ */
  /* Before a battle: drink these (indices into your belt), then fight. */
  function fight(run, which) {
    const s = run.screen;
    if (s.k !== 'battle' || !s.prep) return no('There is nothing to prepare.');
    const idx = Array.from(new Set(which || [])).filter(i => run.potions[i] != null).sort((a, b) => b - a);
    const drunk = idx.map(i => run.potions.splice(i, 1)[0]).reverse();
    s.drunk = drunk;
    s.prep = false;
    run.stats.potions = (run.stats.potions || 0) + drunk.length;
    return yes({ drunk });
  }
  /* A potion found with your belt full: swap it for one of yours, or leave it. */
  function takePotion(run, swap) {
    const s = run.screen;
    if (s.k !== 'reward' || !s.potion || s.potionTook) return no('No potion here.');
    if (swap == null) { s.potionTook = 'left'; return yes(); }
    if (run.potions[swap] == null) return no('Choose one of your potions.');
    s.poured = run.potions[swap];
    run.potions[swap] = s.potion;
    s.potionTook = true;
    return yes();
  }
  /* Pour one out, any time but mid-battle. */
  function pour(run, i) {
    if (!run.potions || run.potions[i] == null) return no('No such potion.');
    if (run.screen.k === 'battle' && !run.screen.prep) return no('Not in the middle of a battle.');
    run.potions.splice(i, 1);
    return yes();
  }

  /* ================================================================
     The merchant
     ================================================================ */
  const priceOf = (run, base) => Math.round(base * (has(run, 'ledger') ? 0.75 : 1) * 1);
  /* The Long Road's merchant, after Slay the Spire's: two plain units, two
     units with an ability, one special card, three trinkets and three potions;
     one card at half price. */
  function longShop(run) {
    const items = [];
    const seen = [];
    const kinds = [['plain', 2], ['ability', 2], ['special', 1]];
    const fits = (id, kind) => { const c = C(id); return kind === 'special' ? c.kind === 'special' : c.kind === 'unit' && (kind === 'plain' ? !c.ab : !!c.ab); };
    for (const [kind, n] of kinds) for (let k = 0; k < n; k++) {
      let id = null;
      for (let t = 0; t < 30 && !id; t++) {
        const r = weighted(run, [['common', 40], ['uncommon', 42], ['rare', 16], ['legendary', run.act === 3 ? 4 : 1]]);
        const pool = poolFor(run.fac).filter(x => rarityOf(x) === r && fits(x, kind) && countOf(run, x) < capOf(x) && seen.indexOf(x) < 0);
        if (pool.length) id = pickOne(run, pool);
      }
      if (!id) id = randomCard(run, 'uncommon', seen);
      seen.push(id);
      items.push({ t: 'card', id, price: priceOf(run, Math.round(PRICE[rarityOf(id)] * (0.9 + rnd(run) * 0.2))), sold: false });
    }
    const sale = int(run, 0, items.length - 1);
    items[sale].sale = true;
    items[sale].price = Math.round(items[sale].price / 2);
    const tr = [];
    for (let k = 0; k < 6 && tr.length < 3; k++) {
      const t = randomTrinket(run, null);
      if (!t || tr.indexOf(t) >= 0) continue;
      tr.push(t);
      items.push({ t: 'trinket', id: t, price: priceOf(run, TRINKET_PRICE[TRINKET[t].rarity] + int(run, -10, 10)), sold: false });
    }
    for (let k = 0; k < 3; k++) {
      const p = randomPotion(run);
      items.push({ t: 'potion', id: p, price: priceOf(run, POTION_PRICE[POTION[p].rarity] + int(run, -5, 5)), sold: false });
    }
    return { k: 'shop', items, removed: false, honed: false };
  }
  function shopScreen(run) {
    if (run.long) return longShop(run);
    const items = [];
    const seen = [];
    for (let k = 0; k < 5; k++) {
      const r = weighted(run, [['common', 40], ['uncommon', 42], ['rare', 16], ['legendary', run.act === 3 ? 4 : 1]]);
      const id = randomCard(run, r, seen);
      seen.push(id);
      const base = PRICE[rarityOf(id)];
      items.push({ t: 'card', id, price: priceOf(run, Math.round(base * (0.9 + rnd(run) * 0.2))), sold: false });
    }
    const tr = [];
    for (let k = 0; k < 2; k++) {
      const t = randomTrinket(run, null);
      if (!t || tr.indexOf(t) >= 0) continue;
      tr.push(t);
      items.push({ t: 'trinket', id: t, price: priceOf(run, TRINKET_PRICE[TRINKET[t].rarity] + int(run, -10, 10)), sold: false });
    }
    return { k: 'shop', items, removed: false, honed: false };
  }
  function buy(run, i) {
    const s = run.screen;
    if (s.k !== 'shop') return no('There is no merchant here.');
    const it = s.items[i];
    if (!it || it.sold) return no('Sold out.');
    if (run.crowns < it.price) return no('Not enough crowns.');
    if (it.t === 'card' && countOf(run, it.id) >= capOf(it.id)) return no('You hold as many as you may.');
    if (it.t === 'potion' && beltFull(run)) return no('Your belt holds ' + LONG.belt + ' potions. Pour one out first.');
    run.crowns -= it.price;
    it.sold = true;
    if (it.t === 'card') { addCard(run, it.id); run.stats.cards++; }
    else if (it.t === 'potion') run.potions.push(it.id);
    else { run.trinkets.push(it.id); applyTrinket(run, it.id); }
    return yes();
  }
  function shopRemove(run, rid) {
    const s = run.screen;
    if (s.k !== 'shop') return no('There is no merchant here.');
    if (s.removed) return no('The merchant removes one card a visit.');
    const cost = removePrice(run);
    if (run.crowns < cost) return no('Not enough crowns.');
    if (run.deck.length <= MIN_DECK) return no('Your deck is as thin as it can be (' + MIN_DECK + ').');
    const c = removeCard(run, rid);
    if (!c) return no('That card is not in your deck.');
    run.crowns -= cost;
    run.removeCost += 25;
    run.stats.removed++;
    s.removed = c.id;
    return yes();
  }
  const removePrice = run => has(run, 'razor') ? 25 : priceOf(run, run.removeCost);

  /* ================================================================
     The campfire: rest or hone
     ================================================================ */
  /* Anything to do at this fire? (Lives full or no rest allowed, every unit
     honed as far as it goes, the deck at its floor: then you may walk on.) */
  const campCan = run => (!on(run, 'onelife') && !has(run, 'bloodcoin') && !lifeFull(run)) || honable(run).length > 0 || run.deck.length > MIN_DECK;
  function camp(run, what, rid) {
    const s = run.screen;
    if (s.k !== 'camp') return no('There is no campfire here.');
    if (s.done) return no('You have already rested here.');
    if (what === 'rest') {
      if (on(run, 'onelife')) return no('One Life: there is no rest on this road.');
      if (has(run, 'bloodcoin')) return no('The Coin of Blood: no rest for you.');
      if (lifeFull(run)) return no('Your lives are full.');
      run.lives++;
      s.done = 'rest';
      if (has(run, 'kettle')) { const c = pickOne(run, honable(run).length ? honable(run) : [null]); if (c) { hone(run, c.rid); run.stats.honed++; s.kettle = c.id; } }
      return yes();
    }
    if (what === 'hone') {
      const c = run.deck.find(x => x.rid === rid);
      if (!c) return no('Choose a card.');
      if (C(c.id).kind !== 'unit') return no('Only units can be honed.');
      if ((c.up || 0) >= HONE_MAX) return no('That card is honed as far as it goes.');
      hone(run, rid);
      run.stats.honed++;
      s.done = 'hone'; s.card = c.id;
      return yes();
    }
    if (what === 'cull') {
      /* Burn a card in the fire. */
      if (run.deck.length <= MIN_DECK) return no('Your deck is as thin as it can be (' + MIN_DECK + ').');
      const c = removeCard(run, rid);
      if (!c) return no('Choose a card.');
      run.stats.removed++;
      s.done = 'cull'; s.card = c.id;
      return yes();
    }
    return no('Rest, hone or burn.');
  }

  /* ================================================================
     Encounters
     ================================================================ */
  function eventNeed(run, opt, rid) {
    const why = opt.need ? opt.need(run) : null;
    if (why) return why;
    if (opt.pick) {
      const c = run.deck.find(x => x.rid === rid);
      if (!c) return 'Choose a card.';
      if (opt.pick === 'hone' && (C(c.id).kind !== 'unit' || (c.up || 0) >= HONE_MAX)) return 'Choose a unit that can still be honed.';
    }
    return null;
  }
  function choose(run, i, rid) {
    const s = run.screen;
    if (s.k !== 'event' || s.result) return no('There is nothing to choose.');
    const ev = EVENT[s.ev];
    const opt = ev.options[i];
    if (!opt) return no('That is not a choice.');
    const why = eventNeed(run, opt, rid);
    if (why) return no(why);
    const c = opt.pick ? run.deck.find(x => x.rid === rid) : null;
    const out = opt.go(run, c ? { rid: c.rid, id: c.id, up: c.up } : null);
    if (out && out.fight) {
      run.screen = battleScreen(run, out.fight, 'event');
      if (out.bonus) run.screen.bonus = out.bonus;
      return yes({ fight: true });
    }
    s.result = String(out || '');
    s.chose = i;
    if (run.lives <= 0) return endRun(run, false, ev.title);
    return yes();
  }

  /* ================================================================
     Leaving a screen
     ================================================================ */
  function leave(run) {
    const s = run.screen;
    if (run.over) return no('The run is over.');
    if (s.k === 'act') { run.screen = { k: 'map' }; return yes(); }
    if (s.k === 'reward') {
      if (!s.took) return no('Take a card or skip it first.');
      if (s.leaders && s.leaders.length && !s.leaderTook) return no('Keep your leader or take a new one first.');
      if (s.kind === 'boss') {
        if (run.act >= 3) return endRun(run, true, null);
        run.act++;
        run.met = [];
        run.hunt = 0;
        run.woundAct = 0;
        if (has(run, 'cursedpurse')) addCard(run, CURSE);
        const pipe = has(run, 'pipe') && !lifeFull(run);
        if (pipe) run.lives++;
        genMap(run);
        run.screen = { k: 'act', act: run.act, pipe };
        return yes();
      }
      return toMap(run);
    }
    if (s.k === 'event' && !s.result) return no('Choose first.');
    if (s.k === 'camp' && !s.done && campCan(run)) return no('Rest, hone or burn a card first.');
    if (s.k === 'lost') return retry(run);
    if (s.k === 'battle') return no('Finish the battle first.');
    return toMap(run);
  }
  function endRun(run, won, by) {
    run.over = { won, by: by || null, act: run.act };
    run.screen = { k: 'over', won };
    return yes({ over: true });
  }
  /* A score for the hall of fame: how far, how well. */
  function score(run) {
    const floors = run.history.length;
    return Math.round(((run.act - 1) * 100 + floors * 10 + run.stats.won * 5 + (run.over && run.over.won ? 250 + run.lives * 40 : 0)) * multiplier(run));
  }

  const Run = {
    VERSION, DIFFICULTY, ACTS, FLOORS, COLS, MIN_DECK, HONE, HONE_MAX, STARTER, TRINKETS, TRINKET, ENEMIES, EVENTS, EVENT, CURSE,
    CHALLENGES, CHALLENGE, PHASES, HUNT, WOUND, on, multiplier, takeLoss, woundable, foeMods,
    rarityOf, capOf, poolFor, playerMods, newRun, genMap, node, reachable, go, battleSetup, battleDone, retry, takeCard, takeLeader,
    buy, shopRemove, removePrice, camp, choose, eventNeed, leave, enemyOf, score, countOf, honable, has,
    LONG, CHESTS, POTIONS, POTION, SHRINE_ODDS, LUCK0, ELITE_RARE, POTION0, POTION_STEP, shapeOf, floorsOf, huntOf, fight, takePotion, pour, beltFull, TRINKET_PRICE, campCan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Run;
  else root.GwentRun = Run;
})(typeof window !== 'undefined' ? window : this);
