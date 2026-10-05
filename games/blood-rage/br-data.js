/* Blood Rage — the components.
 *
 * Everything here was READ, not recalled:
 *   - the deck rows come from the card list spreadsheet dropped beside this
 *     file (Blood-Rage-card-list.xls), one row per physical card. Each Age
 *     comes to exactly 34 base cards, with eight 4+ and six 3+ — the numbers
 *     the rulebook prints on page 11 — and tests/engine.js asserts both;
 *   - the stat tracks are the printed clan sheet (rulebook p.7 art), which
 *     the spreadsheet's second sheet agrees with: the fifth and sixth steps
 *     carry the same value, and only the sixth is worth +20;
 *   - the board is read off the rulebook's p.6 board image: eight provinces
 *     in a ring round Yggdrasil, four fjords on four of the seams. The village
 *     counts were then CONFIRMED by the user against their own board
 *     (2026-09-25) — the first reading had Horgr at 3; it has 4.
 *
 * Card wording is written fresh. The mechanics are the designer's; the
 * sentences are not the card's.
 */
(function (root) {
  'use strict';

  /* ---------------- the board ---------------- */
  const REALMS = {
    manheim:   { name: 'Manheim',   hex: '#d9a93c' },
    jotunheim: { name: 'Jotunheim', hex: '#5d9bd6' },
    alfheim:   { name: 'Alfheim',   hex: '#a9aeb8' }
  };

  /* Clockwise from the top of the board. The ring order IS the adjacency:
     each outer province borders the two either side of it, and every one of
     them borders Yggdrasil. */
  const RING = ['elvagar', 'anger', 'musp', 'horgr', 'utgard', 'andlang', 'gimle', 'myrk'];

  const VILLAGES = { elvagar: 4, anger: 5, musp: 5, horgr: 4, utgard: 3, andlang: 3, gimle: 5, myrk: 3 };

  const PROVINCES = [
    { id: 'ygg',     name: 'Yggdrasil',  realm: null,        villages: Infinity },
    { id: 'elvagar', name: 'Elvagar',    realm: 'manheim' },
    { id: 'anger',   name: 'Angerboda',  realm: 'manheim' },
    { id: 'musp',    name: 'Muspelheim', realm: 'jotunheim' },
    { id: 'horgr',   name: 'Horgr',      realm: 'jotunheim' },
    { id: 'utgard',  name: 'Utgard',     realm: 'jotunheim' },
    { id: 'andlang', name: 'Andlang',    realm: 'alfheim' },
    { id: 'gimle',   name: 'Gimle',      realm: 'alfheim' },
    { id: 'myrk',    name: 'Myrkulor',   realm: 'manheim' }
  ];
  for (const p of PROVINCES) if (p.id !== 'ygg') p.villages = VILLAGES[p.id];

  /* A fjord supports the two provinces on its seam. Anything that happens to
     a province happens to its fjord too. */
  const FJORDS = [
    { id: 'fn', name: 'the northern fjord', supports: ['elvagar', 'anger'] },
    { id: 'fe', name: 'the eastern fjord',  supports: ['musp', 'horgr'] },
    { id: 'fs', name: 'the southern fjord', supports: ['utgard', 'andlang'] },
    { id: 'fw', name: 'the western fjord',  supports: ['gimle', 'myrk'] }
  ];

  function adjacent(a, b) {
    if (a === b) return false;
    if (a === 'ygg' || b === 'ygg') return true;
    const i = RING.indexOf(a), j = RING.indexOf(b);
    if (i < 0 || j < 0) return false;
    const d = Math.abs(i - j);
    return d === 1 || d === RING.length - 1;
  }

  /* Pillage tokens: Yggdrasil's is fixed, the other eight are shuffled. */
  const PILLAGE_TOKENS = ['rage', 'rage', 'rage', 'axes', 'axes', 'horns', 'horns', 'glory'];
  const PILLAGE_NAMES = { rage: '+1 Rage', axes: '+1 Axes', horns: '+1 Horns', glory: '+5 Glory', all: '+1 to all three' };

  /* ---------------- clans ---------------- */
  const CLANS = [
    { id: 'wolf',    name: 'Wolf',    hex: '#c8413b' },
    { id: 'raven',   name: 'Raven',   hex: '#3d7fd6' },
    { id: 'serpent', name: 'Serpent', hex: '#d8b23a' },
    { id: 'bear',    name: 'Bear',    hex: '#9a6a3f' },
    { id: 'ram',     name: 'Ram',     hex: '#4fa04a' }      // 5th Player Expansion: green, confirmed by the user
  ];

  /* The printed tracks. Steps 4 and 5 (index 3, 4) are worth +10 at the end,
     step 6 (index 5) +20. */
  const STATS = {
    rage:  [6, 7, 8, 9, 12, 12],
    axes:  [3, 4, 5, 6, 8, 8],
    horns: [4, 5, 6, 7, 10, 10]
  };
  const STAT_IDS = ['rage', 'axes', 'horns'];
  const STAT_NAMES = { rage: 'Rage', axes: 'Axes', horns: 'Horns' };
  const statBonus = step => step >= 5 ? 20 : step >= 3 ? 10 : 0;

  const FIGURES = { warriors: 8, leader: 1, ship: 1, mystics: 2 };
  /* A Mystic is STR 2 and invades for free (its clan's reference card, Mystics of Midgard) */
  const BASE_STR = { leader: 3, warrior: 1, ship: 2, mystic: 2 };

  /* Glory for each figure Ragnarök takes, by Age. */
  const RAGNAROK_GLORY = [0, 2, 3, 4];

  /* Provinces already swallowed before Age 1, by table size. */
  const PRE_DESTROYED = { 2: 3, 3: 2, 4: 1, 5: 0 };

  /* ---------------- the cards ---------------- */
  /* `kind`: monster · leader · warrior · ship · clan · quest · battle.
     Upgrades (the first five) cost their STR in Rage to play; a slot's type
     is its kind. `fx` names the hook the engine reads — the engine never
     switches on a card's name. */
  const CARDS = {
    /* monsters */
    troll:      { name: 'Troll', kind: 'monster', str: 2, fx: 'invadeKillWarriors', god: 'monster',
                  text: 'When it invades a province, every enemy Warrior there dies.' },
    dwarf:      { name: 'Dwarf Chieftain', kind: 'monster', str: 2, fx: 'free', god: 'monster',
                  text: 'Upgrading with it and invading with it cost no Rage.' },
    mgiant:     { name: 'Mountain Giant', kind: 'monster', str: 3, fx: 'isLeader', god: 'monster', ks: true,
                  text: 'Counts as a Leader — invades for free and triggers your Leader upgrade.' },
    fenrir:     { name: 'Fenrir', kind: 'monster', str: 2, fx: 'fenrir', god: 'monster', ks: true,
                  text: 'At Ragnarök his province falls instead of the doomed one — unless he stands in Yggdrasil.' },
    serpent:    { name: 'Sea Serpent', kind: 'monster', str: 3, fx: 'isShip', god: 'monster',
                  text: 'A ship in every way: it invades fjords only and never moves.' },
    valkyrie:   { name: 'Valkyrie', kind: 'monster', str: 2, fx: 'valkyrie', god: 'monster',
                  text: '2 Glory for every enemy figure that dies in a battle she fights in.' },
    darkelf:    { name: 'Dark Elf', kind: 'monster', str: 1, fx: 'darkelf', god: 'monster',
                  text: 'May invade Yggdrasil directly, and is STR 3 while there.' },
    wolfman:    { name: 'Wolfman', kind: 'monster', str: 3, fx: 'wolfman', god: 'monster', ks: true,
                  text: 'In any battle he fights, only Monsters add their STR.' },
    firegiant:  { name: 'Fire Giant', kind: 'monster', str: 4, fx: 'invadeKillMortals', god: 'monster',
                  text: 'When it invades a province, every enemy figure there that is not a Monster dies.' },
    frostgiant: { name: 'Frost Giant', kind: 'monster', str: 4, fx: 'frostgiant', god: 'monster',
                  text: 'A pillage it takes part in pays its reward twice.' },
    hel:        { name: 'Soldier of Hel', kind: 'monster', str: 3, fx: 'free', god: 'monster',
                  text: 'Upgrading with it and invading with it cost no Rage.' },
    mtroll:     { name: 'Mystic Troll', kind: 'monster', str: 2, fx: 'mtroll', god: 'monster', ks: true,
                  text: 'Your figures invade the province it stands in for free.' },
    volur:      { name: 'Volur Witch', kind: 'monster', str: 3, fx: 'volur', god: 'monster',
                  text: 'When she would die in an outer province, she may flee to Yggdrasil instead.' },

    /* leader, warrior and ship upgrades */
    hammers:  { name: 'Lord of Hammers', kind: 'leader', str: 3, fx: 'leaderMove', god: 'thor',
                text: 'After a successful pillage with your Leader in it, he may step into a neighbouring province.' },
    axes:     { name: 'Lord of Axes', kind: 'leader', str: 3, fx: 'leaderStat', god: 'tyr',
                text: 'After a successful pillage with your Leader in it, raise one clan stat.' },
    spears:   { name: 'Lord of Spears', kind: 'leader', str: 3, fx: 'leaderAll', god: 'odin',
                text: 'After a successful pillage with your Leader in it, raise all three clan stats.' },
    brothers: { name: 'Brothers in Arms', kind: 'warrior', str: 1, fx: 'pairs3', god: 'tyr',
                text: 'Warriors fight in pairs: every two in a province are STR 3 between them.' },
    experts:  { name: 'Experts in Arms', kind: 'warrior', str: 2, fx: 'str2', god: 'tyr',
                text: 'Your Warriors are STR 2.' },
    masters:  { name: 'Masters in Arms', kind: 'warrior', str: 2, fx: 'pairs6', god: 'tyr',
                text: 'Warriors are STR 2, and every two in a province are STR 6 between them.' },
    lokidragons:    { name: "Loki's Dragons", kind: 'ship', str: 2, fx: 'dragons', glory: 4, god: 'loki',
                      text: '4 Glory whenever one of your ships dies.' },
    firedragons:    { name: 'Fire Dragons', kind: 'ship', str: 2, fx: 'dragons', glory: 8, god: 'loki',
                      text: '8 Glory whenever one of your ships dies.' },
    eternaldragons: { name: 'Eternal Dragons', kind: 'ship', str: 2, fx: 'dragons', glory: 12, god: 'loki',
                      text: '12 Glory whenever one of your ships dies.' },

    /* clan upgrades */
    lokidomain:   { name: "Loki's Domain", kind: 'clan', str: 1, fx: 'release', glory: 1, god: 'loki',
                    text: '1 Glory for every figure of yours that comes back from Valhalla.' },
    lokiemin:     { name: "Loki's Eminence", kind: 'clan', str: 2, fx: 'release', glory: 2, god: 'loki',
                    text: '2 Glory for every figure of yours that comes back from Valhalla.' },
    lokiwrath:    { name: "Loki's Wrath", kind: 'clan', str: 3, fx: 'release', glory: 3, god: 'loki',
                    text: '3 Glory for every figure of yours that comes back from Valhalla.' },
    friggacharm:  { name: "Frigga's Charm", kind: 'clan', str: 0, fx: 'cheapUpgrades', god: 'frigga',
                    text: 'Every upgrade costs you 1 Rage less.' },
    thorglory:    { name: "Thor's Glory", kind: 'clan', str: 2, fx: 'thorglory', god: 'thor',
                    text: '2 Glory from any battle you are in where two or more enemy figures die.' },
    succor:       { name: "Frigga's Succor", kind: 'clan', str: 2, fx: 'succor', god: 'frigga',
                    text: 'Whenever you invade, a Warrior from your reserve may follow into the same province for free.' },
    tyrdomain:    { name: "Tyr's Domain", kind: 'clan', str: 0, fx: 'questBattle', value: 3, god: 'tyr',
                    text: 'A Quest you reveal in battle fights as a +3 battle card.' },
    tyrwrath:     { name: "Tyr's Wrath", kind: 'clan', str: 1, fx: 'questBattle', value: 5, god: 'tyr',
                    text: 'A Quest you reveal in battle fights as a +5 battle card.' },
    lokiblessing: { name: "Loki's Blessing", kind: 'clan', str: 1, fx: 'lokiblessing', god: 'loki',
                    text: 'When you lose a battle, a Warrior from your reserve may invade that province for free.' },
    odininsp:     { name: "Odin's Inspiration", kind: 'clan', str: 2, fx: 'doubleRagnarok', god: 'odin',
                    text: 'Glory for dying in Ragnarök is doubled.' },
    tyrchallenge: { name: "Tyr's Challenge", kind: 'clan', str: 0, fx: 'repillage', god: 'tyr',
                    text: 'As an action, pay 2 Rage to pillage a province that has already been pillaged this Age.' },
    friggaprot:   { name: "Frigga's Protection", kind: 'clan', str: 0, fx: 'protect', god: 'frigga',
                    text: 'Pay 1 Rage to save a figure of yours from dying.' },
    tyrprowess:   { name: "Tyr's Prowess", kind: 'clan', str: 2, fx: 'prowess', god: 'tyr',
                    text: 'When you win a battle, pay 1 Rage per card to take your played cards back into your hand.' },
    thordomain:   { name: "Thor's Domain", kind: 'clan', str: 1, fx: 'thordomain', god: 'thor',
                    text: 'After you invade a province you may pay 2 Rage to pillage it at once.' },
    friggadomain: { name: "Frigga's Domain", kind: 'clan', str: 0, fx: 'valhallaInvade', god: 'frigga',
                    text: 'As an action, pay 1 Rage to invade with a figure straight out of Valhalla.' },
    odinthrone:   { name: "Odin's Throne", kind: 'clan', str: 2, fx: 'doubleQuests', god: 'odin',
                    text: 'Glory from your completed Quests is doubled.' },
    thorconquest: { name: "Thor's Conquest", kind: 'clan', str: 3, fx: 'conquest', god: 'thor',
                    text: 'At the end of the game, 3 Glory for every figure you still have on the board.' },
    friggasac:    { name: "Frigga's Sacrifice", kind: 'clan', str: 1, fx: 'sacrifice', god: 'frigga',
                    text: 'As an action, destroy two of your own figures to raise a clan stat.' },

    /* Mystics of Midgard: Clan Upgrades (a clan slot, no Rage). Each one brings one of the clan's two
       Mystic figures into its reserve — never a third — and gives ALL its Mystics the ability; two of
       the same card do not stack, and discarding one later loses the ability, not the figure. */
    fchosen: { name: 'Frigga’s Chosen', kind: 'clan', str: 0, fx: 'mysticRetreat', mystic: true, god: 'frigga',
               text: 'A Mystic joins your reserve. Your Mystics may retreat to a neighbouring province instead of being destroyed.' },
    ochosen: { name: 'Odin’s Chosen', kind: 'clan', str: 0, fx: 'mysticAssassin', mystic: true, god: 'odin',
               text: 'A Mystic joins your reserve. Your Mystics may invade a village held by an enemy Warrior or Mystic, destroying it.' },
    tchosen: { name: 'Thor’s Chosen', kind: 'clan', str: 0, fx: 'mysticGlory', mystic: true, god: 'thor',
               text: 'A Mystic joins your reserve. Win a battle and gain 3 Glory for each of your Mystics in it.' },

    /* quests — the Glory is on each physical card, see DECK */
    'q-alfheim':   { name: 'Alfheim', kind: 'quest', fx: 'realm', realm: 'alfheim', god: 'quest',
                     text: 'Hold the most STR in at least one Alfheim province.' },
    'q-jotunheim': { name: 'Jotunheim', kind: 'quest', fx: 'realm', realm: 'jotunheim', god: 'quest',
                     text: 'Hold the most STR in at least one Jotunheim province.' },
    'q-manheim':   { name: 'Manheim', kind: 'quest', fx: 'realm', realm: 'manheim', god: 'quest',
                     text: 'Hold the most STR in at least one Manheim province.' },
    'q-death':     { name: 'Glorious Death', kind: 'quest', fx: 'death', god: 'quest',
                     text: 'Have four or more figures in Valhalla when the Quests are counted.' },
    'q-ygg':       { name: 'Yggdrasil', kind: 'quest', fx: 'ygg', god: 'quest',
                     text: 'Hold the most STR in Yggdrasil.' },
    'q-wide':      { name: 'Widespread', kind: 'quest', fx: 'wide', god: 'quest',
                     text: 'Hold the most STR in two or more provinces.' },

    /* battle cards — `value` is the +STR, `late` may be played after the reveal */
    tyr2: { name: "Tyr's Bash",      kind: 'battle', value: 2, god: 'tyr', text: '' },
    tyr3: { name: "Tyr's Smash",     kind: 'battle', value: 3, god: 'tyr', text: '' },
    tyr4: { name: "Tyr's Crush",     kind: 'battle', value: 4, god: 'tyr', text: '' },
    tyr5: { name: "Tyr's Smite",     kind: 'battle', value: 5, god: 'tyr', text: '' },
    tyr6: { name: "Tyr's Rage",      kind: 'battle', value: 6, god: 'tyr', text: '' },
    tyr8: { name: "Tyr's Judgement", kind: 'battle', value: 8, god: 'tyr', text: '' },
    odinsmite: { name: "Odin's Smite", kind: 'battle', value: 1, fx: 'smite', god: 'odin',
                 text: 'Before strengths are compared, each opponent loses one Warrior from this province.' },
    tide:      { name: "Odin's Tide", kind: 'battle', value: 1, fx: 'tide', god: 'odin',
                 text: 'Before strengths are compared, every clan in the battle keeps one figure of its choice and loses the rest.' },
    judgement: { name: "Odin's Judgement", kind: 'battle', value: 2, fx: 'judgement', god: 'odin',
                 text: '2 Glory for every figure that dies in this battle — yours included.' },
    sight:     { name: "Heimdall's Sight", kind: 'battle', value: 0, fx: 'sight', god: 'heimdall',
                 text: 'Worth as much as the best card an opponent reveals.' },
    eye:       { name: "Heimdall's Eye", kind: 'battle', value: 2, late: true, god: 'heimdall',
                 text: 'May be played after the cards are revealed, adding its STR then.' },
    gaze:      { name: "Heimdall's Gaze", kind: 'battle', value: 3, late: true, god: 'heimdall',
                 text: 'May be played after the cards are revealed, adding its STR then.' },
    watch:     { name: "Heimdall's Watch", kind: 'battle', value: 0, fx: 'watch', god: 'heimdall',
                 text: 'Every revealed card is thrown away and you gain their +STR in Glory. Then everyone plays again.' },
    grace:     { name: "Frigga's Grace", kind: 'battle', value: 2, fx: 'grace', god: 'frigga',
                 text: 'If this pillage succeeds, raise a second clan stat as well.' },
    hammer:    { name: "Thor's Hammer", kind: 'battle', value: 1, fx: 'hammer', god: 'thor',
                 text: 'Win, and gain 3 Glory.' },
    oath:      { name: "Thor's Oath", kind: 'battle', value: 1, fx: 'oath', god: 'thor',
                 text: 'Win, and raise a clan stat.' },
    ascension: { name: "Thor's Ascension", kind: 'battle', value: 1, fx: 'ascension', god: 'thor',
                 text: 'Win, and gain 3 Rage and 3 Glory.' },
    primacy:   { name: "Thor's Primacy", kind: 'battle', value: 3, fx: 'primacy', god: 'thor',
                 text: 'Every opponent’s card loses its text before it can act.' },
    trickery:  { name: "Loki's Trickery", kind: 'battle', value: 0, fx: 'trickery', god: 'loki',
                 text: 'Lose, and take 1 Rage from the winner.' },
    backstab:  { name: "Loki's Backstab", kind: 'battle', value: 0, fx: 'backstab', god: 'loki',
                 text: 'Lose, and take 2 Glory from the winner.' },
    poison:    { name: "Loki's Poison", kind: 'battle', value: 0, fx: 'poison', god: 'loki',
                 text: 'Lose, and the winner’s revealed cards go into your hand.' }
  };
  for (const k in CARDS) CARDS[k].key = k;
  /* A Quest is named for a REGION (p.6: Manheim, Alfheim, Jotunheim), and the
     map is labelled by province — so every region Quest says which provinces
     it means, in the board's own order. */
  for (const k in CARDS) {
    const d = CARDS[k];
    if (d.fx !== 'realm') continue;
    const names = PROVINCES.filter(p => p.realm === d.realm).map(p => p.name);
    d.provinces = names;
    d.text = 'Hold the most STR in at least one ' + REALMS[d.realm].name + ' province: ' +
      names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] + '.';
  }

  /* Gods of Asgard: two of the six are drawn each game. A god stands in a province (never in a
     village) and changes the rules of battle there — and in its fjords — while it stays; its rule
     supersedes every other. Wording written fresh from the god cards. */
  const DEITIES = {
    odin:     { name: 'Odin',     title: 'the All-Father',       hex: '#c9a227',
                text: 'Pillage this province successfully and take its reward a second time.' },
    thor:     { name: 'Thor',     title: 'the Victorious',       hex: '#d65a3a',
                text: 'Whoever wins a battle here gains 2 Glory for every enemy figure destroyed in it.' },
    tyr:      { name: 'Tyr',      title: 'the Lord of Battle',   hex: '#d0d4dc',
                text: 'In a battle here every figure is STR 0: only the battle cards count.' },
    heimdall: { name: 'Heimdall', title: 'the Watcher Guardian', hex: '#9bb6ff',
                text: 'In a battle here the cards are played face up, one at a time, the pillager last.' },
    frigga:   { name: 'Frigga',   title: 'the Mother Protector', hex: '#e39acb',
                text: 'Nothing can be destroyed here, for any reason, during a battle.' },
    loki:     { name: 'Loki',     title: 'the Trickster',        hex: '#4ac08a',
                text: 'After a battle here the losers gain the battle Glory (their Axes), not the winner.' }
  };
  const DEITY_IDS = Object.keys(DEITIES);

  const UPGRADE_KINDS = ['leader', 'warrior', 'ship', 'monster', 'clan'];
  const SLOTS = { leader: 1, warrior: 1, ship: 1, monster: 2, clan: 3 };

  const GODS = {
    odin: '#c9a227', thor: '#d65a3a', loki: '#4ac08a', frigga: '#e39acb', heimdall: '#9bb6ff', tyr: '#d0d4dc',
    monster: '#b98cf0', quest: '#5fbf6a'
  };
  const KIND_HEX = { battle: '#c8413b', quest: '#4ea55a', monster: '#8a7cc4', leader: '#6b7280',
    warrior: '#6b7280', ship: '#6b7280', clan: '#6b7280' };

  /* One row per physical card: [age, key, minPlayers, source, questGlory?].
     source: base · ks (Kickstarter monsters) · p5 (5th player) · p5ks.
     Generated from Blood-Rage-card-list.xls; the Mystics of Midgard rows are
     left out because the Mystic figures are not built. */
  const DECK = [
  /* Age 1 */
  [1,'troll',1,'base'], [1,'dwarf',1,'base'], [1,'mgiant',1,'ks'], [1,'fenrir',1,'ks'], [1,'serpent',3,'base'], [1,'dwarf',5,'p5ks'],
  [1,'hammers',1,'base'], [1,'brothers',1,'base'], [1,'lokidragons',1,'base'], [1,'lokidomain',1,'base'], [1,'friggacharm',1,'base'], [1,'thorglory',1,'base'],
  [1,'succor',3,'base'], [1,'tyrdomain',3,'base'], [1,'lokiblessing',4,'base'], [1,'hammers',5,'p5'], [1,'brothers',5,'p5'], [1,'lokidragons',5,'p5'],
  [1,'q-alfheim',1,'base',5], [1,'q-jotunheim',1,'base',5], [1,'q-manheim',1,'base',5], [1,'q-death',1,'base',6], [1,'q-ygg',3,'base',6], [1,'q-alfheim',4,'base',5],
  [1,'q-jotunheim',4,'base',5], [1,'q-manheim',4,'base',5], [1,'q-death',4,'base',6], [1,'q-wide',5,'p5',7], [1,'q-death',5,'p5',6], [1,'odinsmite',1,'base'],
  [1,'tyr2',1,'base'], [1,'sight',1,'base'], [1,'grace',1,'base'], [1,'trickery',1,'base'], [1,'tyr3',1,'base'], [1,'tyr5',1,'base'],
  [1,'hammer',1,'base'], [1,'odinsmite',3,'base'], [1,'tyr3',3,'base'], [1,'tyr4',4,'base'], [1,'grace',4,'base'], [1,'trickery',4,'base'],
  [1,'tyr3',5,'p5'], [1,'tyr5',5,'p5'], [1,'hammer',5,'p5'],
  /* Age 2 */
  [2,'valkyrie',1,'base'], [2,'darkelf',1,'base'], [2,'wolfman',1,'ks'], [2,'firegiant',3,'base'], [2,'darkelf',5,'p5ks'], [2,'axes',1,'base'],
  [2,'experts',1,'base'], [2,'firedragons',1,'base'], [2,'odininsp',1,'base'], [2,'tyrchallenge',1,'base'], [2,'friggaprot',1,'base'], [2,'lokiemin',3,'base'],
  [2,'tyrprowess',3,'base'], [2,'thordomain',4,'base'], [2,'axes',5,'p5'], [2,'experts',5,'p5'], [2,'firedragons',5,'p5'], [2,'q-alfheim',1,'base',7],
  [2,'q-jotunheim',1,'base',7], [2,'q-manheim',1,'base',7], [2,'q-death',1,'base',8], [2,'q-ygg',3,'base',8], [2,'q-alfheim',4,'base',7], [2,'q-jotunheim',4,'base',7],
  [2,'q-manheim',4,'base',7], [2,'q-death',4,'base',8], [2,'q-wide',5,'p5',10], [2,'q-death',5,'p5',8], [2,'tyr4',1,'base'], [2,'eye',1,'base'],
  [2,'tide',1,'base'], [2,'backstab',1,'base'], [2,'tyr6',1,'base'], [2,'watch',1,'base'], [2,'eye',1,'base'], [2,'oath',1,'base'],
  [2,'tyr5',3,'base'], [2,'eye',3,'base'], [2,'tide',4,'base'], [2,'backstab',4,'base'], [2,'tyr3',4,'base'], [2,'tyr3',5,'p5'],
  [2,'eye',5,'p5'], [2,'oath',5,'p5'],
  /* Age 3 */
  [3,'frostgiant',1,'base'], [3,'hel',1,'base'], [3,'mtroll',1,'ks'], [3,'volur',3,'base'], [3,'hel',5,'p5ks'], [3,'spears',1,'base'],
  [3,'masters',1,'base'], [3,'eternaldragons',1,'base'], [3,'friggadomain',1,'base'], [3,'odinthrone',1,'base'], [3,'thorconquest',1,'base'], [3,'friggasac',3,'base'],
  [3,'tyrwrath',3,'base'], [3,'lokiwrath',4,'base'], [3,'spears',5,'p5'], [3,'masters',5,'p5'], [3,'eternaldragons',5,'p5'], [3,'q-alfheim',1,'base',9],
  [3,'q-jotunheim',1,'base',9], [3,'q-manheim',1,'base',9], [3,'q-death',1,'base',11], [3,'q-ygg',3,'base',11], [3,'q-alfheim',4,'base',9], [3,'q-jotunheim',4,'base',9],
  [3,'q-manheim',4,'base',9], [3,'q-death',4,'base',11], [3,'q-wide',5,'p5',15], [3,'q-death',5,'p5',11], [3,'gaze',1,'base'], [3,'primacy',1,'base'],
  [3,'ascension',1,'base'], [3,'judgement',1,'base'], [3,'tyr6',1,'base'], [3,'watch',1,'base'], [3,'tyr4',1,'base'], [3,'poison',1,'base'],
  [3,'gaze',3,'base'], [3,'primacy',3,'base'], [3,'ascension',4,'base'], [3,'judgement',4,'base'], [3,'tyr5',4,'base'], [3,'tyr8',5,'p5'],
  [3,'tyr4',5,'p5'], [3,'poison',5,'p5'],
  /* Mystics of Midgard — shuffled into their Age's deck; the 4+ copy stays out below four clans */
  [1,'fchosen',1,'mom'], [1,'fchosen',4,'mom'], [2,'ochosen',1,'mom'], [2,'ochosen',4,'mom'], [3,'tchosen',1,'mom'], [3,'tchosen',4,'mom']
  ];

  /* The cards dealt at a table of `n`, for one Age. The rulebook's rule for
     2–4 plus the 5th-player box's 5+ cards; Kickstarter monsters only when
     asked for. */
  function deckFor(age, n, opts) {
    const ks = !!(opts && opts.ks);   // opts.mystics adds the Mystics of Midgard cards
    const out = [];
    DECK.forEach((r, i) => {
      const [a, key, min, src, glory] = r;
      if (a !== age || min > n) return;
      if ((src === 'ks' || src === 'p5ks') && !ks) return;
      if (src === 'mom' && !(opts && opts.mystics)) return;
      out.push({ id: 'c' + a + '-' + String(i).padStart(3, '0'), key, age: a, glory: glory || 0 });
    });
    return out;
  }

  function cardText(c) {
    const d = CARDS[c.key];
    if (!d) return '';
    if (d.kind === 'quest') return d.text + ' Reward: ' + c.glory + ' Glory and a clan stat.';
    return d.text;
  }
  function cardLabel(c) {
    const d = CARDS[c.key];
    if (!d) return '?';
    if (d.kind === 'battle') return d.key === 'sight' ? '+X' : '+' + d.value;
    if (d.kind === 'quest') return c.glory + '';
    return d.str + '';
  }

  const MANIFEST = {
    built: [
      'The base game for 2 to 4 clans and the 5th-player box for a fifth: all three Ages, the draft, the five actions, Call to Battle, every battle card, the Quest, Ragnarök and Valhalla phases, and the end-of-game stat bonuses.',
      'All 102 base cards and the 5th-player cards with their real effects, including the awkward ones — Heimdall’s Watch replaying the battle, Odin’s Tide, Thor’s Primacy cancelling text, the late Heimdall cards, Frigga’s Protection saving figures, the Volur Witch fleeing to Yggdrasil.',
      'The four Kickstarter monsters (Mountain Giant, Fenrir, Wolfman, Mystic Troll) as a lobby option.',
      'The 5th Player Expansion: the green Ram clan, its Leader, eight Warriors and ship, the 5th-player cards, and no province lost before Age 1.',
      'Mystics of Midgard (lobby option): two Mystics a clan, brought in by Frigga’s, Odin’s and Thor’s Chosen — STR 2, free to invade, and every ability they give.',
      'Gods of Asgard (lobby option): two of the six gods each game, placed from the spare Ragnarök tokens, moved by whoever pillages their province, and placed afresh each Age.',
      'House clans fill the empty chairs and decide from what a player could see.',
      'Every clan’s Leader, Warrior and Ship and all 13 monsters as baked miniatures, one camera and one scale for all of them.',
      'The map itself baked in Blender: realm by realm terrain, mountain ranges on the borders, the fjords as inlets of the sea, a hamlet at every village and the World Tree’s roots round Yggdrasil — built in the board’s own units, so every village and figure lands where the rules put it.',
      'Every battle is fought on the telly: the province as a baked diorama, the figures in the fight on its ground, each clan’s strength and face-down card — then the clash, in the dust, and only the victors standing when it settles. The cards turn over after that, and no phone or line of the log knows the result any sooner.',
      'Ragnarök at the end of every Age is played on the telly: the doomed province with everyone standing in it, the sky going black and the land burning (each province baked a second time, on fire), the doomed sinking into the fissures and rising as ghosts, then the Glory each clan earned.',
      'The map names its three regions — Manheim, Jotunheim, Alfheim — as the printed board does, every region Quest lists its provinces, and your phone says where each of your Quests stands right now.'
    ],
    not: []
  };

  root.BRData = {
    REALMS, RING, PROVINCES, FJORDS, VILLAGES, adjacent,
    PILLAGE_TOKENS, PILLAGE_NAMES, CLANS, STATS, STAT_IDS, STAT_NAMES, statBonus,
    FIGURES, BASE_STR, RAGNAROK_GLORY, PRE_DESTROYED, DEITIES, DEITY_IDS,
    CARDS, UPGRADE_KINDS, SLOTS, GODS, KIND_HEX, DECK, deckFor, cardText, cardLabel, MANIFEST,
    prov: id => PROVINCES.find(p => p.id === id) || null,
    fjord: id => FJORDS.find(f => f.id === id) || null,
    card: key => CARDS[key] || null
  };
})(typeof window !== 'undefined' ? window : globalThis);
