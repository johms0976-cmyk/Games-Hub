'use strict';
/* Inscryption — Kaycee's Mod, as a single-player page. The components.
 *
 * Every creature, sigil, item, starter deck and challenge the run uses.
 * Stats, costs, tribes and printed sigils come from the Inscryption wiki's
 * card table (Reference/wiki-card-table.json, fetched 2026-10-16); rule text
 * is written fresh. Leshy's encounter blueprints, the deathcards, Royal's
 * crew and the region pools are NOT published anywhere — they are my design
 * in the manner of Act I (see ARCHITECTURE.md "Ask the user").
 *
 * No DOM. Loaded by the page as window.InscData and by node as a module.
 */
(function (root) {
  /* ---------------- tribes ---------------- */
  const TRIBES = {
    A: { name: 'Avian', g: '🪶' },
    C: { name: 'Canine', g: '🐺' },
    H: { name: 'Hooved', g: '🦌' },
    I: { name: 'Insect', g: '🦗' },
    R: { name: 'Reptile', g: '🦎' },
    S: { name: 'Squirrel', g: '🐿️' }
  };
  const TRIBE_LIST = ['A', 'C', 'H', 'I', 'R'];

  /* ---------------- sigils ----------------
     p   = power level (Inscryption's hidden quality number, from the wiki)
     mod = may appear on totems, trials, Amorphous, Wolf Pelt trades
     foe = Leshy may carve it into one of his totems (he has no hand) */
  const SIGILS = {
    airborne: { name: 'Airborne', p: 0, mod: 1, foe: 1, text: 'Flies over the creature opposite and strikes the opponent directly.' },
    mightyleap: { name: 'Mighty Leap', p: 1, mod: 1, foe: 1, text: 'Leaps up to block Airborne creatures attacking its space.' },
    waterborne: { name: 'Waterborne', p: 1, mod: 1, foe: 1, text: 'Submerged on the opponent’s turn: attacks aimed at its space hit the owner directly.' },
    sprinter: { name: 'Sprinter', p: 1, mod: 1, foe: 1, text: 'At the end of its owner’s turn it moves one space in the arrow’s direction (turning back at a wall).' },
    hefty: { name: 'Hefty', p: 1, mod: 1, foe: 1, text: 'At the end of its owner’s turn it moves in the arrow’s direction, shoving any creatures in the way.' },
    rampager: { name: 'Rampager', p: 1, mod: 1, foe: 1, text: 'At the end of its owner’s turn it moves in the arrow’s direction, trading places with whatever stands there.' },
    burrower: { name: 'Burrower', p: 1, mod: 1, foe: 1, text: 'Tunnels to any empty space of its owner’s that is about to be attacked, and blocks it.' },
    guardian: { name: 'Guardian', p: 1, mod: 1, foe: 1, text: 'When an enemy is played opposite an empty space, this moves there to face it.' },
    fledgling: { name: 'Fledgling', p: 2, mod: 1, foe: 1, text: 'Having survived a turn, it grows into a stronger form.' },
    bonedigger: { name: 'Bone Digger', p: 2, mod: 1, text: 'At the end of its owner’s turn, dig up 1 Bone.' },
    quills: { name: 'Sharp Quills', p: 2, mod: 1, foe: 1, text: 'Whatever strikes it takes 1 damage.' },
    boneking: { name: 'Bone King', p: 2, mod: 1, text: 'When it dies it leaves 4 Bones instead of 1.' },
    unkillable: { name: 'Unkillable', p: 2, mod: 1, text: 'When it perishes, a copy of it returns to your hand.' },
    loosetail: { name: 'Loose Tail', p: 2, mod: 1, foe: 1, text: 'When it would be struck, it sheds a tail in its place and scurries one space right.' },
    worthy: { name: 'Worthy Sacrifice', p: 2, mod: 1, text: 'Counts as 3 Blood when sacrificed.' },
    stinky: { name: 'Stinky', p: 2, mod: 1, foe: 1, text: 'The creature opposite has 1 less Power.' },
    scavenger: { name: 'Scavenger', p: 2, mod: 1, text: 'While it is in play, the opponent’s creatures leave you Bones when they die.' },
    madeofstone: { name: 'Made of Stone', p: 2, text: 'Immune to Touch of Death and Stinky.' },
    kraken: { name: 'Kraken Waterborne', p: 2, text: 'Waterborne — and when it surfaces it has become a Tentacle.' },
    rabbithole: { name: 'Rabbit Hole', p: 3, mod: 1, text: 'When played, a Rabbit enters your hand.' },
    beeswithin: { name: 'Bees Within', p: 3, mod: 1, text: 'When struck, a Bee enters your hand.' },
    dam: { name: 'Dam Builder', p: 3, mod: 1, foe: 1, text: 'When played, Dams rise on the empty spaces beside it.' },
    fecundity: { name: 'Fecundity', p: 3, mod: 1, text: 'When played, a copy of it (without Fecundity) enters your hand.' },
    corpseeater: { name: 'Corpse Eater', p: 3, mod: 1, text: 'When one of your creatures dies in combat, this leaps from your hand onto its space, free.' },
    antspawner: { name: 'Ant Spawner', p: 3, mod: 1, text: 'When played, a Worker Ant enters your hand.' },
    leader: { name: 'Leader', p: 3, mod: 1, foe: 1, text: 'The creatures beside it have 1 more Power.' },
    morsel: { name: 'Morsel', p: 3, mod: 1, text: 'When sacrificed, its Power and Health pass to the creature it was sacrificed for.' },
    bloodlust: { name: 'Blood Lust', p: 3, mod: 1, foe: 1, text: 'Each time it kills the creature it strikes, it gains 1 Power.' },
    amorphous: { name: 'Amorphous', p: 3, mod: 1, text: 'When drawn, this sigil becomes another at random.' },
    frozenaway: { name: 'Frozen Away', p: 3, text: 'When it perishes, the creature frozen inside takes its place.' },
    touch: { name: 'Touch of Death', p: 4, mod: 1, foe: 1, text: 'Whatever it damages dies.' },
    hoarder: { name: 'Hoarder', p: 4, mod: 1, text: 'When played, choose any card from your deck and draw it.' },
    manylives: { name: 'Many Lives', p: 4, mod: 1, text: 'It does not perish when sacrificed.' },
    bifurcated: { name: 'Bifurcated Strike', p: 4, mod: 1, foe: 1, text: 'Strikes the spaces left and right of the one opposite, instead of that one.' },
    doublestrike: { name: 'Double Strike', p: 4, mod: 1, foe: 1, text: 'Strikes twice.' },
    armored: { name: 'Armored', p: 4, mod: 1, foe: 1, text: 'The first time it would take damage, it takes none.' },
    brood: { name: 'Brood Parasite', p: 4, mod: 1, text: 'When played, an egg is laid on the empty space opposite.' },
    repulsive: { name: 'Repulsive', p: 4, text: 'Creatures will not attack it.' },
    bellist: { name: 'Bellist', p: 4, text: 'When played, Chimes appear beside it. When a Chime is struck, this strikes back at the attacker.' },
    finical: { name: 'Finical Hatchling', p: 4, text: 'When drawn it hatches into the Hydra — if your deck holds Power 1 to 5, Health 1 to 5 and every tribe.' },
    trifurcated: { name: 'Trifurcated Strike', p: 5, mod: 1, foe: 1, text: 'Strikes the space opposite and both spaces beside it.' },
    trinket: { name: 'Trinket Bearer', p: 5, mod: 1, text: 'When played, you get an item if you have room.' },
    steeltrap: { name: 'Steel Trap', p: 5, text: 'When it dies, the creature opposite dies too, and a Wolf Pelt enters your hand.' },
    omni: { name: 'Omni Strike', p: 5, text: 'Strikes every opposing creature, or the opponent directly if there are none.' },
    tidallock: { name: 'Tidal Lock', p: 5, text: 'At the start of its owner’s turn, every Squirrel and Rabbit in play is pulled into orbit.' },
    annoying: { name: 'Annoying', p: -1, text: 'The creature opposite has 1 more Power.' }
  };
  const MODULAR = Object.keys(SIGILS).filter(k => SIGILS[k].mod);
  const FOE_TOTEM = Object.keys(SIGILS).filter(k => SIGILS[k].foe);

  /* Variable Power, printed as a symbol instead of a number. */
  const STATS = {
    ants: { name: 'Ants', text: 'Power equals the number of Ants its owner has in play.' },
    bell: { name: 'Bell Ringer', text: 'Power is 4 in the leftmost space (nearest the bell), down to 1 in the rightmost.' },
    hand: { name: 'Card Counter', text: 'Power equals the number of cards in its owner’s hand.' },
    mirror: { name: 'Mirror', text: 'Power equals the Power of the creature opposite.' },
    bones: { name: 'One Half Bones', text: 'Power is half its owner’s Bones, rounded down.' },
    spilled: { name: 'Spilled Blood', text: 'Power equals the number of sacrifices made this battle.' }
  };

  /* ---------------- cards ----------------
     c(id, name, power, health, cost, tribes, sigils, extra)
     cost: 'b2' = 2 Blood, 'o4' = 4 Bones, '' = free
     extra: pool ('c' common / 'r' rare / '' never offered), g (portrait glyph),
       evo (what Fledgling grows into), terrain, pelt, noSac, uncut, kills
       (poisons the campfire survivors), ant, unique (Goobert will not copy) */
  const CARDS = {};
  function c(id, name, atk, hp, cost, tribes, sig, x) {
    x = x || {};
    const m = /^([bo])(\d+)$/.exec(cost || '');
    CARDS[id] = Object.assign({
      id, name,
      atk: typeof atk === 'number' ? atk : 0,
      stat: typeof atk === 'string' ? atk : null,
      hp,
      blood: m && m[1] === 'b' ? +m[2] : 0,
      bones: m && m[1] === 'o' ? +m[2] : 0,
      tribes: tribes ? tribes.split('') : [],
      sig: sig || [],
      pool: ''
    }, x);
  }
  // --- Act I creatures (Kaycee's Mod stat lines) ---
  c('adder', 'Adder', 1, 1, 'b2', 'R', ['touch'], { pool: 'c', g: '🐍', kills: 1 });
  c('alpha', 'Alpha', 1, 2, 'o4', 'C', ['leader'], { pool: 'c', g: '🐺', evoName: 'Omega' });
  c('amalgam', 'Amalgam', 3, 3, 'b2', 'ACHIRS', [], { pool: 'r', g: '🧬' });
  c('amoeba', 'Amoeba', 1, 2, 'o2', '', ['amorphous'], { pool: 'r', g: '🦠' });
  c('ant', 'Worker Ant', 'ants', 2, 'b1', 'I', [], { pool: 'c', g: '🐜', ant: 1, evo: 'antqueen' });
  c('antqueen', 'Ant Queen', 'ants', 3, 'b2', 'I', ['antspawner'], { pool: 'c', g: '🐜', ant: 1 });
  c('bat', 'Bat', 2, 1, 'o4', '', ['airborne'], { pool: 'c', g: '🦇' });
  c('beaver', 'Beaver', 1, 4, 'b2', '', ['dam'], { pool: 'c', g: '🦫' });
  c('bee', 'Bee', 1, 1, '', 'I', ['airborne'], { g: '🐝' });
  c('beehive', 'Beehive', 0, 2, 'b1', 'I', ['beeswithin'], { pool: 'c', g: '🍯' });
  c('bloodhound', 'Bloodhound', 2, 3, 'b2', 'C', ['guardian'], { pool: 'c', g: '🐕' });
  c('bullfrog', 'Bullfrog', 1, 2, 'b1', 'R', ['mightyleap'], { pool: 'c', g: '🐸' });
  c('cat', 'Cat', 0, 1, 'b1', '', ['manylives'], { pool: 'c', g: '🐈' });
  c('undeadcat', 'Undead Cat', 3, 6, 'b1', '', [], { g: '💀' });
  c('cockroach', 'Cockroach', 1, 1, 'o4', 'I', ['unkillable'], { pool: 'c', g: '🪳' });
  c('coyote', 'Coyote', 2, 1, 'o4', 'C', [], { pool: 'c', g: '🐕‍🦺' });
  c('daus', 'The Daus', 2, 2, 'b2', '', ['bellist'], { pool: 'r', g: '🔔' });
  c('chime', 'Chime', 0, 1, '', '', [], { g: '🎐', terrain: 1 });
  c('elk', 'Elk', 2, 4, 'b2', 'H', ['sprinter'], { pool: 'c', g: '🦌', evo: 'moose' });
  c('elkfawn', 'Elk Fawn', 1, 1, 'b1', 'H', ['sprinter', 'fledgling'], { pool: 'c', g: '🦌', evo: 'elk' });
  c('fieldmice', 'Field Mice', 2, 2, 'b2', '', ['fecundity'], { pool: 'c', g: '🐁' });
  c('geck', 'Geck', 1, 1, '', 'R', [], { g: '🦎' });
  c('goat', 'Black Goat', 0, 1, 'b1', 'H', ['worthy'], { pool: 'c', g: '🐐' });
  c('grizzly', 'Grizzly', 4, 6, 'b3', '', [], { pool: 'c', g: '🐻' });
  c('child13', 'Child 13', 0, 1, 'b1', 'H', ['manylives'], { pool: 'r', g: '👶', evoName: 'Child 14', unique: 1 });
  c('child13w', 'Child 13', 2, 1, 'b1', 'H', ['airborne', 'manylives'], { g: '👁️' });
  c('kingfisher', 'Kingfisher', 1, 1, 'b1', 'A', ['airborne', 'waterborne'], { pool: 'c', g: '🐦' });
  c('maggots', 'Corpse Maggots', 1, 2, 'o5', 'I', ['corpseeater'], { pool: 'c', g: '🐛' });
  c('magpie', 'Magpie', 1, 1, 'b2', 'A', ['airborne', 'hoarder'], { pool: 'c', g: '🐦‍⬛' });
  c('mantis', 'Mantis', 1, 1, 'b1', 'I', ['bifurcated'], { pool: 'c', g: '🦗', evo: 'mantisgod' });
  c('mantisgod', 'Mantis God', 1, 1, 'b1', 'I', ['trifurcated'], { pool: 'r', g: '🦗' });
  c('mole', 'Mole', 0, 4, 'b1', '', ['burrower'], { pool: 'c', g: '🐀', evo: 'moleman' });
  c('moleman', 'Mole Man', 0, 6, 'b1', '', ['burrower', 'mightyleap'], { pool: 'r', g: '⛏️' });
  c('moose', 'Moose Buck', 3, 7, 'b3', 'H', ['hefty'], { pool: 'c', g: '🫎' });
  c('larva', 'Strange Larva', 0, 3, 'b1', 'I', ['fledgling'], { pool: 'r', g: '🐛', evo: 'pupa' });
  c('pupa', 'Strange Pupa', 0, 3, 'b1', 'I', ['fledgling'], { g: '🫘', evo: 'mothman' });
  c('mothman', 'Mothman', 7, 3, 'b1', 'I', ['airborne'], { g: '🦋' });
  c('opossum', 'Opossum', 1, 1, 'o2', '', [], { pool: 'c', g: '🐭' });
  c('otter', 'River Otter', 1, 1, 'b1', '', ['waterborne'], { pool: 'c', g: '🦦' });
  c('ouroboros', 'Ouroboros', 1, 1, 'b2', 'R', ['unkillable'], { pool: 'r', g: '🐉', unique: 1 });
  c('packrat', 'Pack Rat', 2, 2, 'b2', '', ['trinket'], { pool: 'r', g: '🐀' });
  c('porcupine', 'Porcupine', 1, 2, 'b1', '', ['quills'], { pool: 'c', g: '🦔' });
  c('pronghorn', 'Pronghorn', 1, 3, 'b2', 'H', ['sprinter', 'bifurcated'], { pool: 'c', g: '🦌' });
  c('rabbit', 'Rabbit', 0, 1, '', '', [], { g: '🐇' });
  c('ratking', 'Rat King', 2, 1, 'b2', '', ['boneking'], { pool: 'c', g: '👑' });
  c('rattler', 'Rattler', 3, 1, 'o6', 'R', [], { pool: 'c', g: '🐍' });
  c('raven', 'Raven', 2, 3, 'b2', 'A', ['airborne'], { pool: 'c', g: '🐦‍⬛' });
  c('ravenegg', 'Raven Egg', 0, 2, 'b1', 'A', ['fledgling'], { pool: 'c', g: '🥚', evo: 'raven' });
  c('greatwhite', 'Great White', 4, 2, 'b3', '', ['waterborne'], { pool: 'c', g: '🦈' });
  c('skink', 'Skink', 1, 2, 'b1', 'R', ['loosetail'], { pool: 'c', g: '🦎' });
  c('skunk', 'Skunk', 0, 3, 'b1', '', ['stinky'], { pool: 'c', g: '🦨' });
  c('snapper', 'River Snapper', 1, 6, 'b2', 'R', [], { pool: 'c', g: '🐢' });
  c('longelk', 'Long Elk', 1, 2, 'o4', 'H', ['sprinter', 'touch'], { pool: 'r', g: '🦒', kills: 1, unique: 1 });
  c('sparrow', 'Sparrow', 1, 2, 'b1', 'A', ['airborne'], { pool: 'c', g: '🐦' });
  c('belltentacle', 'Bell Tentacle', 'bell', 3, 'b2', '', [], { g: '🐙' });
  c('cardtentacle', 'Hand Tentacle', 'hand', 1, 'b1', '', [], { g: '🐙' });
  c('mirrortentacle', 'Mirror Tentacle', 'mirror', 3, 'b1', '', [], { g: '🐙' });
  c('squirrel', 'Squirrel', 0, 1, '', 'S', [], { g: '🐿️' });
  c('stoat', 'Stoat', 1, 2, 'b1', '', [], { pool: 'c', g: '🦡' });
  c('urayuli', 'Urayuli', 7, 7, 'b4', '', [], { pool: 'r', g: '🦍' });
  c('vulture', 'Turkey Vulture', 3, 3, 'o8', 'A', ['airborne'], { pool: 'c', g: '🦃' });
  c('warren', 'Warren', 0, 2, 'b1', '', ['rabbithole'], { pool: 'c', g: '🕳️' });
  c('wolf', 'Wolf', 3, 2, 'b2', 'C', [], { pool: 'c', g: '🐺' });
  c('wolfcub', 'Wolf Cub', 1, 1, 'b1', 'C', ['fledgling'], { pool: 'c', g: '🐺', evo: 'wolf' });
  c('ringworm', 'Ring Worm', 0, 1, 'b1', 'I', [], { pool: 'c', g: '🪱', kills: 1 });
  // --- Kaycee's Mod creatures ---
  c('wildbull', 'Wild Bull', 3, 2, 'b2', 'H', ['rampager'], { pool: 'c', g: '🐂' });
  c('cuckoo', 'Cuckoo', 1, 1, 'b1', 'A', ['airborne', 'brood'], { pool: 'c', g: '🐦' });
  c('ijiraq', 'Ijiraq', 4, 1, '', '', ['repulsive'], { pool: 'r', g: '👹', unique: 1 });
  c('flyingant', 'Flying Ant', 'ants', 1, 'b1', 'I', ['airborne'], { pool: 'c', g: '🐜', ant: 1, evo: 'antqueen' });
  c('mudturtle', 'Mud Turtle', 2, 2, 'b2', 'R', ['armored'], { pool: 'c', g: '🐢' });
  c('direpup', 'Dire Wolf Pup', 1, 1, 'b2', 'C', ['bonedigger', 'fledgling'], { pool: 'c', g: '🐺', evo: 'direwolf' });
  c('direwolf', 'Dire Wolf', 2, 5, 'b3', 'C', ['doublestrike'], { pool: 'c', g: '🐺' });
  c('mealworm', 'Mealworm', 0, 2, 'o2', 'I', ['morsel'], { pool: 'c', g: '🐛' });
  c('wolverine', 'Wolverine', 1, 3, 'o5', '', ['bloodlust'], { pool: 'c', g: '🦡' });
  c('raccoon', 'Raccoon', 1, 1, 'b1', '', ['scavenger'], { pool: 'c', g: '🦝' });
  c('lammergeier', 'Lammergeier', 'bones', 4, 'b3', 'A', ['airborne'], { pool: 'c', g: '🦅' });
  c('redhart', 'Red Hart', 'spilled', 2, 'b2', 'H', ['sprinter'], { pool: 'c', g: '🦌' });
  c('tadpole', 'Tadpole', 0, 1, '', 'R', ['waterborne', 'fledgling'], { pool: 'c', g: '🐸', evo: 'bullfrog' });
  c('peltlice', 'Pelt Lice', 1, 1, 'b4', 'I', ['doublestrike'], { pool: 'r', g: '🪲' });
  c('hodag', 'Hodag', 1, 5, 'b2', '', ['bloodlust'], { pool: 'r', g: '🐲' });
  c('kraken', 'Great Kraken', 1, 1, 'b1', '', ['kraken'], { pool: 'r', g: '🦑' });
  c('egg', 'Curious Egg', 0, 1, '', '', ['finical'], { g: '🥚', unique: 1 });
  c('hydra', 'Hydra', 1, 5, '', 'ACHIR', ['bifurcated', 'trifurcated'], { g: '🐲' });
  c('aquasquirrel', 'Aquasquirrel', 0, 1, '', 'S', ['waterborne'], { g: '🐿️' });
  // --- tails ---
  c('tail', 'Wriggling Tail', 0, 2, '', 'R', [], { g: '〰️', terrain: 1 });
  c('tailfeathers', 'Tail Feathers', 0, 2, '', '', [], { g: '🪶', terrain: 1 });
  c('furrytail', 'Furry Tail', 0, 2, '', '', [], { g: '〰️', terrain: 1 });
  c('wrigglingleg', 'Wriggling Leg', 0, 2, '', '', [], { g: '🦵', terrain: 1 });
  // --- pelts ---
  c('rabbitpelt', 'Rabbit Pelt', 0, 1, '', '', [], { g: '🐇', pelt: 'rabbit', terrain: 1 });
  c('wolfpelt', 'Wolf Pelt', 0, 2, '', '', [], { g: '🐺', pelt: 'wolf', terrain: 1 });
  c('goldenpelt', 'Golden Pelt', 0, 3, '', '', [], { g: '🌟', pelt: 'golden', terrain: 1 });
  // --- terrain and the bosses' cards ---
  c('boulder', 'Boulder', 0, 5, '', '', ['madeofstone'], { g: '🪨', terrain: 1 });
  c('grandfir', 'Grand Fir', 0, 3, '', '', ['mightyleap'], { g: '🌲', terrain: 1 });
  c('snowyfir', 'Snowy Fir', 0, 4, '', '', ['mightyleap'], { g: '🌲', terrain: 1 });
  c('stump', 'Stump', 0, 3, '', '', [], { g: '🪵', terrain: 1 });
  c('dam', 'Dam', 0, 2, '', '', [], { g: '🪵', terrain: 1, evoName: 'God Dam' });
  c('brokenegg', 'Broken Egg', 0, 1, '', '', [], { g: '🥚', terrain: 1 });
  c('goldnugget', 'Gold Nugget', 0, 2, '', '', [], { g: '🪙', terrain: 1 });
  c('frozenopossum', 'Frozen Opossum', 0, 5, '', '', ['frozenaway'], { g: '🧊', noSac: 1 });
  c('packmule', 'Pack Mule', 0, 5, '', 'H', ['sprinter'], { g: '🫏', uncut: 1, noSac: 1 });
  c('baitbucket', 'Bait Bucket', 0, 1, '', '', [], { g: '🪣', terrain: 1 });
  c('strangefrog', 'Strange Frog', 1, 2, 'b1', 'R', ['mightyleap'], { g: '🐸', noSac: 1 });
  c('leapingtrap', 'Leaping Trap', 0, 1, '', '', ['mightyleap', 'steeltrap'], { g: '🪤', terrain: 1 });
  c('starvation', 'Starvation', 1, 1, '', '', ['repulsive'], { g: '💀', noSac: 1, uncut: 1 });
  c('moon', 'The Moon', 1, 40, '', '', ['mightyleap', 'omni', 'tidallock', 'madeofstone'], { g: '🌕', uncut: 1, giant: 1 });
  // --- Leshy's deathcards (Kaycee's Mod keeps its own; these are my design) ---
  c('dc_lost', 'The Lost Challenger', 2, 3, 'b2', '', ['bifurcated'], { g: '🕯️', death: 1 });
  c('dc_hungry', 'Hungry Wanderer', 3, 2, 'b2', '', ['bloodlust', 'sprinter'], { g: '🦴', death: 1 });
  c('dc_pale', 'Pale Stranger', 1, 5, 'b2', '', ['quills', 'mightyleap'], { g: '🎭', death: 1 });
  c('dc_bone', 'Bone Collector', 2, 2, 'o5', '', ['airborne', 'unkillable'], { g: '☠️', death: 1 });
  c('dc_frozen', 'Frozen Hiker', 4, 3, 'b3', '', ['hefty'], { g: '🥶', death: 1 });
  c('dc_shut', 'The Shut-In', 1, 3, 'b1', '', ['touch', 'guardian'], { g: '🚪', death: 1 });
  // --- Royal Dominguez's crew (the Final Boss challenge; my design) ---
  c('moleseaman', 'Mole Seaman', 1, 6, '', '', ['mightyleap', 'burrower'], { g: '⚓', noSac: 1 });
  c('skelcrew', 'Skeleton Crew', 2, 1, '', '', ['sprinter'], { g: '💀' });
  c('zparrot', 'Zombie Parrot', 1, 2, '', 'A', ['airborne'], { g: '🦜' });
  c('limoncello', 'The Limoncello', 1, 40, '', '', ['mightyleap', 'omni', 'madeofstone'], { g: '⛵', uncut: 1, giant: 1 });

  const card = id => CARDS[id];
  const COMMONS = Object.keys(CARDS).filter(k => CARDS[k].pool === 'c');
  const RARES = Object.keys(CARDS).filter(k => CARDS[k].pool === 'r');

  /* Act I's tails: which one a Loose Tail sheds depends on the tribe. */
  function tailFor(def) {
    const t = def.tribes;
    if (t.indexOf('R') >= 0) return 'tail';
    if (t.indexOf('A') >= 0) return 'tailfeathers';
    if (t.indexOf('I') >= 0) return 'wrigglingleg';
    return 'furrytail';
  }

  /* ---------------- items ---------------- */
  const ITEMS = {
    squirrelbottle: { name: 'Squirrel in a Bottle', g: '🐿️', text: 'A Squirrel enters your hand.' },
    boulderbottle: { name: 'Boulder in a Bottle', g: '🪨', text: 'A Boulder (0 Power, 5 Health) enters your hand.' },
    goatbottle: { name: 'Black Goat in a Bottle', g: '🐐', text: 'A Black Goat (Worthy Sacrifice) enters your hand.' },
    opossumbottle: { name: 'Frozen Opossum in a Bottle', g: '🧊', text: 'A Frozen Opossum (0 Power, 5 Health, an Opossum inside) enters your hand.' },
    scissors: { name: 'Scissors', g: '✂️', target: 'foe', text: 'Cut up one of Leshy’s creatures in play. It is destroyed.' },
    pliers: { name: 'Pliers', g: '🗜️', text: 'Pull one of your teeth and put it on the scales: 1 damage to Leshy.' },
    hoggybank: { name: 'Hoggy Bank', g: '🐖', text: 'Gain 4 Bones at once.' },
    hourglass: { name: 'Hourglass', g: '⌛', text: 'Leshy skips his next turn entirely.' },
    fan: { name: 'Harpie’s Birdleg Fan', g: '🪭', text: 'This turn your creatures in play attack as if they were Airborne.' },
    hook: { name: 'Fish Hook', g: '🪝', target: 'foe', text: 'Hook one of Leshy’s creatures onto the matching empty space of yours. It fights for you this battle.' },
    bleach: { name: 'Magickal Bleach', g: '🧴', text: 'Every one of Leshy’s creatures in play loses its sigils.' },
    wiseclock: { name: 'Wiseclock', g: '🕰️', text: 'Every creature on the table moves one space clockwise.' },
    lens: { name: 'Magpie’s Lens', g: '🔍', text: 'Choose any card in your deck and draw it.' },
    knife: { name: 'Skinning Knife', g: '🔪', target: 'foe', text: 'Skin one of Leshy’s creatures in play: it dies, and its pelt (a Wolf Pelt) enters your hand.' }
  };
  /* What the backpack and Trinket Bearer draw from (the Hook and Knife are never drawn). */
  const ITEM_POOL = ['squirrelbottle', 'boulderbottle', 'goatbottle', 'opossumbottle', 'scissors', 'pliers', 'hoggybank', 'hourglass', 'fan', 'bleach', 'wiseclock', 'lens'];

  /* ---------------- starter decks (Kaycee's Mod) ---------------- */
  const DECKS = [
    { id: 'vanilla', name: 'Vanilla', cards: ['stoat', 'bullfrog', 'wolf'], text: 'A Stoat, a Bullfrog and a Wolf. Balanced, and plain.' },
    { id: 'moose', name: 'Moose Blood', cards: ['goat', 'moose', 'mole'], text: 'The Black Goat pays for the Moose Buck in one sacrifice.' },
    { id: 'ants', name: 'Ants', cards: ['antqueen', 'flyingant', 'skunk'], text: 'Every Ant in play makes every Ant stronger.' },
    { id: 'mantis', name: 'One True God', cards: ['mantisgod', 'ringworm', 'ringworm'], text: 'The Mantis God strikes three ways; the Ring Worms are campfire bait.' },
    { id: 'water', name: 'Submersibles', cards: ['kingfisher', 'kingfisher', 'kraken'], text: 'Two Kingfishers and the Great Kraken, all beneath the surface.' },
    { id: 'bones', name: 'Bones', cards: ['raccoon', 'direpup', 'coyote'], text: 'Dig, scavenge, and spend Bones.' },
    { id: 'reptiles', name: 'Free Reptiles', cards: ['rabbit', 'tadpole', 'geck'], text: 'Three free cards to sacrifice.' },
    { id: 'eggs', name: 'Eggs', cards: ['egg', 'egg', 'egg'], text: 'Three Curious Eggs. Build a deck of every Power, Health and tribe and they hatch into the Hydra.' }
  ];
  const DECK = {};
  DECKS.forEach(d => { DECK[d.id] = d; });

  /* ---------------- challenges (Kaycee's Mod, with their Challenge Points) ---------------- */
  const CHALLENGES = [
    { id: 'nohook', name: 'No Hook', cp: 5, text: 'You do not start with the Fish Hook.' },
    { id: 'smallpack', name: 'Smaller Backpack', cp: 5, text: 'You can carry one item fewer.' },
    { id: 'cloverless', name: 'Cloverless', cp: 5, text: 'No Clover: card choices cannot be rerolled.' },
    { id: 'pricey', name: 'Expensive Pelts', cp: 5, text: 'The Trapper charges more for every pelt.' },
    { id: 'annoying', name: 'Annoying Starters', cp: 10, text: 'Your starting cards bear the Annoying sigil.' },
    { id: 'bosstotems', name: 'Totem Bosses', cp: 15, text: 'Every boss raises a totem for its favourite tribe.' },
    { id: 'norares', name: 'No Boss Rares', cp: 15, text: 'Bosses pay out ordinary cards, not rares.' },
    { id: 'harder', name: 'More Difficult', cp: 15, text: 'Leshy plays more cards, and better ones.' },
    { id: 'harder2', name: 'More Difficult (again)', cp: 15, text: 'Even more, and even better.' },
    { id: 'tipped', name: 'Tipped Scales', cp: 20, text: 'Every battle begins with 1 damage against you.' },
    { id: 'alltotems', name: 'All Totem Battles', cp: 20, text: 'Every ordinary battle is a totem battle.' },
    { id: 'squirrelfish', name: 'Squirrel Fish', cp: 20, text: 'Your side deck is Aquasquirrels: Waterborne, so they block nothing.' },
    { id: 'royal', name: 'Final Boss', cp: 20, text: 'Royal Dominguez waits at the end instead of Leshy.' },
    { id: 'onecandle', name: 'Single Candle', cp: 30, text: 'You have one life.' },
    { id: 'grizzly', name: 'Grizzly Bosses', cp: 50, text: 'The first three bosses’ second phases are eight Grizzlies with Mighty Leap.' }
  ];
  const CHALLENGE = {};
  CHALLENGES.forEach(x => { CHALLENGE[x.id] = x; });

  /* ---------------- regions and Leshy's encounters ----------------
     A blueprint is a list of turns; each turn the cards Leshy queues.
     'wolf'         always
     'wolf@3'       only at difficulty 3 or more
     'cub>wolf@3'   a Wolf Cub, or a Wolf at difficulty 3 or more
     board: cards on Leshy's front row when the battle opens
     The regions come in a random order (Kaycee's Mod); difficulty climbs with
     how far into the run a battle is, not with which region it is in. */
  const REGIONS = {
    woods: {
      name: 'The Woodlands', boss: 'prospector', tree: 'grandfir', g: '🌲',
      text: 'Wolves and ravens under the firs. The Prospector digs at the far edge.',
      fill: ['coyote', 'wolfcub', 'sparrow', 'stoat', 'bullfrog', 'elkfawn'],
      enc: [
        { name: 'Wolf Pack', tribe: 'C', turns: [['wolfcub'], ['coyote@2'], ['wolfcub>wolf@3'], ['coyote'], [], ['wolf', 'alpha@4'], ['wolfcub']] },
        { name: 'Birds of the Canopy', tribe: 'A', board: ['grandfir'], turns: [['sparrow'], [], ['ravenegg', 'sparrow@3'], ['raven@2'], [], ['sparrow', 'raven@4'], ['ravenegg']] },
        { name: 'The Hive', tribe: 'I', turns: [['beehive'], ['mantis@2'], ['bee', 'bee@3'], [], ['mantis', 'beehive@4'], ['bee'], ['bee', 'mantis@3']] },
        { name: 'Elk Crossing', tribe: 'H', board: ['stump'], turns: [['elkfawn'], [], ['elkfawn>elk@3'], ['pronghorn@2'], ['elkfawn'], ['elk'], ['pronghorn@4']] },
        { name: 'Bramble Hollow', tribe: 'C', board: ['boulder'], turns: [['stoat'], ['coyote'], ['porcupine@2'], ['bloodhound>wolf@4'], [], ['coyote', 'stoat'], ['wolf@3']] },
        { name: 'Frog Pond', tribe: 'R', turns: [['bullfrog'], ['stoat@2'], ['bullfrog'], ['skink@3'], [], ['bullfrog', 'wolf@4'], ['coyote']] }
      ]
    },
    wet: {
      name: 'The Wetlands', boss: 'angler', tree: 'stump', g: '🌿',
      text: 'Things that swim, things that bite. The Angler fishes the black pond.',
      fill: ['kingfisher', 'otter', 'skink', 'bullfrog', 'opossum', 'tadpole'],
      enc: [
        { name: 'Murky Water', tribe: 'A', turns: [['kingfisher'], ['otter@2'], ['kingfisher'], [], ['otter', 'kingfisher@3'], ['greatwhite@4'], ['otter']] },
        { name: 'Snakes in the Reeds', tribe: 'R', turns: [['skink'], [], ['adder@2'], ['snapper@3'], ['skink'], ['rattler@4'], ['adder@4']] },
        { name: 'The Swarm', tribe: 'I', board: ['boulder'], turns: [['cockroach'], ['maggots@3'], ['ringworm', 'cockroach@2'], [], ['mantis'], ['cockroach', 'mantis@4'], []] },
        { name: 'Snapping Turtles', tribe: 'R', turns: [['snapper'], ['bullfrog'], [], ['mudturtle@2'], ['snapper@4'], ['bullfrog', 'tadpole'], []] },
        { name: 'Mole Tunnels', tribe: '', board: ['stump'], turns: [['mole'], ['opossum'], ['otter@2'], [], ['opossum', 'mole@3'], ['greatwhite@3'], ['opossum']] },
        { name: 'Toad Chorus', tribe: 'R', turns: [['tadpole', 'tadpole'], [], ['bullfrog'], ['skink@2'], ['tadpole', 'adder@4'], ['bullfrog@3'], []] }
      ]
    },
    snow: {
      name: 'The Snow Line', boss: 'trapper', tree: 'snowyfir', g: '❄️',
      text: 'Big game in the deep cold. The Trapper keeps his snares up here.',
      fill: ['opossum', 'wolf', 'bat', 'porcupine', 'elk', 'raven'],
      enc: [
        { name: 'The Den', tribe: '', board: ['snowyfir'], turns: [['grizzly@3', 'porcupine'], [], ['opossum'], ['grizzly'], [], ['porcupine', 'wolverine@4'], ['opossum']] },
        { name: 'Hunting Wolves', tribe: 'C', turns: [['wolf'], [], ['alpha@2'], ['wolfcub', 'wolf@4'], [], ['direwolf@3'], ['wolf']] },
        { name: 'Moose Herd', tribe: 'H', board: ['snowyfir'], turns: [['elk'], [], ['moose@3'], ['pronghorn'], [], ['elk', 'wildbull@4'], []] },
        { name: 'Cave Bats', tribe: '', turns: [['bat'], ['bat@3'], [], ['opossum', 'bat'], ['vulture@4'], [], ['bat']] },
        { name: 'Frozen Lake', tribe: '', board: ['frozenopossum'], turns: [['opossum'], ['porcupine'], [], ['frozenopossum@2'], ['wolverine@3'], ['opossum', 'grizzly@4'], []] },
        { name: 'Carrion Birds', tribe: 'A', turns: [['raven'], [], ['vulture@3'], ['sparrow', 'raven@2'], [], ['raven'], ['vulture@4']] }
      ]
    }
  };
  const REGION_IDS = ['woods', 'wet', 'snow'];

  /* Bosses: name, totem head (Totem Bosses challenge), mask glyph. */
  const BOSSES = {
    prospector: { name: 'The Prospector', head: 'C', g: '⛏️', text: 'He keeps a monstrous Bloodhound. Take his first candle and he turns your creatures to gold.' },
    angler: { name: 'The Angler', head: 'A', g: '🪝', text: 'He hooks your newest creature to his side. Take his first candle and the bait goes in.' },
    trapper: { name: 'The Trapper', head: 'R', g: '🪤', text: 'Frogs and snares. Take his first candle and he turns his mask over: the Trader.' },
    leshy: { name: 'Leshy', head: 'I', g: '🦉', text: 'He wears the masks of all three. Then the deathcards. Then the Moon.' },
    royal: { name: 'Royal Dominguez', head: 'A', g: '🏴‍☠️', text: 'Mole Seamen on the flanks, cannons on the rail, and at the last his ship.' }
  };

  /* The vermin pack Royal hands you in his second phase. */
  const VERMIN = ['squirrel', 'rabbit', 'mole', 'moleman', 'beaver', 'opossum', 'fieldmice', 'packrat', 'stoat'];

  /* The Trapper's price list: rabbit / wolf / golden, by how many bosses are behind you. */
  const PELT_PRICE = [
    { rabbit: 2, wolf: 4, golden: 7 },
    { rabbit: 3, wolf: 5, golden: 9 },
    { rabbit: 4, wolf: 7, golden: 11 },
    { rabbit: 4, wolf: 7, golden: 11 }
  ];
  const KNIFE_PRICE = 7;

  const MANIFEST = {
    title: 'Inscryption — Kaycee’s Mod',
    sources: [
      'Card stats, costs, tribes and printed sigils: the Inscryption wiki card table (Act I + Kaycee’s Mod tabs), fetched 2026-10-16.',
      'Sigil, item, event and boss behaviour: the wiki pages for each, rewritten in my own words.'
    ],
    decisions: [
      'Leshy’s encounters, the region card pools and difficulty steps are my design — the real blueprints are not published.',
      'Leshy’s deathcards and Royal Dominguez’s Mole Seamen, crew, parrots and ship are my design.',
      'Mysterious Stones move every sigil of the sacrificed card onto the host.',
      'Cards taken from the Trader in her boss phase (and from Leshy’s Trader mask) fight for you that battle only.',
      'Losing an ordinary battle costs a candle and the battle (no reward); losing to a boss costs a candle and you face it again.',
      'Every starter deck and challenge is open from the first run (Kaycee’s Mod unlocks them one by one).',
      'There is no card art yet: each card shows a drawn glyph. Real portraits drop into art/<card id>.png.'
    ]
  };

  const api = {
    TRIBES, TRIBE_LIST, SIGILS, MODULAR, FOE_TOTEM, STATS, CARDS, card, COMMONS, RARES, tailFor,
    ITEMS, ITEM_POOL, DECKS, DECK, CHALLENGES, CHALLENGE, REGIONS, REGION_IDS, BOSSES, VERMIN,
    PELT_PRICE, KNIFE_PRICE, MANIFEST
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InscData = api;
})(typeof window !== 'undefined' ? window : this);
