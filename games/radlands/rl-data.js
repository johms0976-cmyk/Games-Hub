'use strict';
/* Radlands — the components.
 *
 * Read off the card faces in the user's VASSAL module (Radlands.vmod,
 * images/p1–p66 for the draw deck, c1–c34 for the camps) and the v2.0
 * rulebook. Every line of text below is written fresh: the mechanics are the
 * designer's, the words are ours.
 *
 * Icons (the player aid's "Effect icons"): damage, injure, destroy, restore,
 * draw, water, punk, raid. A card's JUNK icon is the one in its top corner.
 *
 * Two camp faces in the module disagree with the v2.0 rulebook — see
 * MANIFEST.decisions. They are built as the module prints them and marked
 * INFERRED-worth-asking.
 */
(function (root) {
  const VERSION = 1;

  /* ---------------- the draw deck: people ---------------- */
  /* ab: abilities in printed order — cost in water, then what it does.
     tr: traits (the [green brackets]). copies: how many in the deck. */
  const PEOPLE = [
    { id: 'zeto_khan', name: 'Zeto Khan', cost: 3, junk: 'punk', copies: 1, img: 'p1',
      ab: [{ cost: 1, text: 'Draw three cards, then discard three (never the Water Silo).' }],
      tr: ['The first event you play each turn goes off at once, as if its countdown were zero.'] },
    { id: 'vera_vosh', name: 'Vera Vosh', cost: 3, junk: 'injure', copies: 1, img: 'p2',
      ab: [{ cost: 1, text: 'Injure.' }],
      tr: ['The first card whose ability you use each turn stays ready.'] },
    { id: 'molgur_stang', name: 'Molgur Stang', cost: 4, junk: 'punk', copies: 1, img: 'p3',
      ab: [{ cost: 1, text: 'Destroy any one of the opponent’s camps, protected or not.' }] },
    { id: 'magnus_karv', name: 'Magnus Karv', cost: 3, junk: 'punk', copies: 1, img: 'p4',
      ab: [{ cost: 2, text: 'Damage every card in one of the opponent’s columns.' }] },
    { id: 'karli_blaze', name: 'Karli Blaze', cost: 3, junk: 'punk', copies: 1, img: 'p5',
      ab: [{ cost: 1, text: 'Damage.' }],
      tr: ['Your people (Karli too) are ready the moment they enter play.'] },
    { id: 'argo_yesky', name: 'Argo Yesky', cost: 3, junk: 'damage', copies: 1, img: 'p6',
      ab: [{ cost: 1, text: 'Damage.' }],
      tr: ['Every one of your people has this ability too.', 'When Argo enters play, gain a punk.'] },
    { id: 'wounded_soldier', name: 'Wounded Soldier', cost: 1, junk: 'injure', copies: 2, img: 'p7',
      ab: [{ cost: 1, text: 'Damage.' }],
      tr: ['When this enters play, draw a card — then this card takes a damage.'] },
    { id: 'vigilante', name: 'Vigilante', cost: 1, junk: 'raid', copies: 2, img: 'p8',
      ab: [{ cost: 1, text: 'Injure.' }] },
    { id: 'vanguard', name: 'Vanguard', cost: 1, junk: 'raid', copies: 2, img: 'p9',
      ab: [{ cost: 1, text: 'Damage — and then the opponent damages one of your cards in return.' }],
      tr: ['When this enters play, gain a punk.'] },
    { id: 'sniper', name: 'Sniper', cost: 1, junk: 'restore', copies: 2, img: 'p10',
      ab: [{ cost: 2, text: 'Damage any one of the opponent’s cards, protected or not.' }] },
    { id: 'scout', name: 'Scout', cost: 1, junk: 'water', copies: 2, img: 'p11',
      ab: [{ cost: 1, text: 'Raid.' }] },
    { id: 'scientist', name: 'Scientist', cost: 1, junk: 'raid', copies: 2, img: 'p12',
      ab: [{ cost: 1, text: 'Turn the top three cards of the deck into the discard pile; you may use one of their junk effects.' }] },
    { id: 'rescue_team', name: 'Rescue Team', cost: 1, junk: 'injure', copies: 2, img: 'p13',
      ab: [{ cost: 0, text: 'Pick up one of your people (punks count) back into your hand.' }],
      tr: ['Enters play ready.'] },
    { id: 'repair_bot', name: 'Repair Bot', cost: 1, junk: 'injure', copies: 2, img: 'p14',
      ab: [{ cost: 2, text: 'Restore.' }],
      tr: ['When this enters play, restore.'] },
    { id: 'rabble_rouser', name: 'Rabble Rouser', cost: 1, junk: 'raid', copies: 2, img: 'p15',
      ab: [{ cost: 1, text: 'Gain a punk.' }, { cost: 1, text: 'Damage — only if you have a punk in play.' }] },
    { id: 'pyromaniac', name: 'Pyromaniac', cost: 1, junk: 'injure', copies: 2, img: 'p16',
      ab: [{ cost: 1, text: 'Damage an unprotected camp.' }] },
    { id: 'mutant', name: 'Mutant', cost: 1, junk: 'injure', copies: 2, img: 'p17',
      ab: [{ cost: 0, text: 'Damage, restore, or both — then this card takes a damage.' }] },
    { id: 'muse', name: 'Muse', cost: 1, junk: 'injure', copies: 2, img: 'p18',
      ab: [{ cost: 0, text: 'Gain an extra water.' }] },
    { id: 'mimic', name: 'Mimic', cost: 1, junk: 'injure', copies: 2, img: 'p19',
      ab: [{ cost: null, text: 'Copy the ability of one of your ready people, or of any undamaged enemy — paying what it costs.' }] },
    { id: 'looter', name: 'Looter', cost: 1, junk: 'water', copies: 2, img: 'p20',
      ab: [{ cost: 2, text: 'Damage. If it hit a camp, draw a card.' }] },
    { id: 'holdout', name: 'Holdout', cost: 2, junk: 'raid', copies: 2, img: 'p21',
      ab: [{ cost: 1, text: 'Damage.' }],
      tr: ['Costs nothing to play in the column of one of your destroyed camps.'] },
    { id: 'gunner', name: 'Gunner', cost: 1, junk: 'restore', copies: 2, img: 'p22',
      ab: [{ cost: 2, text: 'Injure every unprotected enemy.' }] },
    { id: 'exterminator', name: 'Exterminator', cost: 1, junk: 'draw', copies: 2, img: 'p23',
      ab: [{ cost: 1, text: 'Destroy every damaged enemy.' }] },
    { id: 'doomsayer', name: 'Doomsayer', cost: 1, junk: 'draw', copies: 2, img: 'p24',
      ab: [{ cost: 1, text: 'Damage — only while the opponent has an event in their queue.' }],
      tr: ['When this enters play, you may push all the opponent’s events one space back.'] },
    { id: 'cult_leader', name: 'Cult Leader', cost: 1, junk: 'draw', copies: 2, img: 'p25',
      ab: [{ cost: 0, text: 'Destroy one of your own people, then damage.' }] },
    { id: 'assassin', name: 'Assassin', cost: 1, junk: 'raid', copies: 2, img: 'p26',
      ab: [{ cost: 2, text: 'Destroy an unprotected enemy.' }] }
  ];

  /* ---------------- the draw deck: events ---------------- */
  /* slot: the bomb number — how many turns until it goes off (0 = at once). */
  const EVENTS = [
    { id: 'uprising', name: 'Uprising', cost: 1, slot: 2, junk: 'injure', copies: 2, img: 'p47', text: 'Gain three punks.' },
    { id: 'truce', name: 'Truce', cost: 2, slot: 0, junk: 'injure', copies: 2, img: 'p48', text: 'Every person in play goes back to its owner’s hand (punks too, face up).' },
    { id: 'strafe', name: 'Strafe', cost: 2, slot: 0, junk: 'draw', copies: 2, img: 'p49', text: 'Injure every unprotected enemy.' },
    { id: 'radiation', name: 'Radiation', cost: 2, slot: 1, junk: 'raid', copies: 2, img: 'p50', text: 'Injure every person in play — yours as well.' },
    { id: 'napalm', name: 'Napalm', cost: 2, slot: 1, junk: 'restore', copies: 2, img: 'p51', text: 'Destroy every enemy in one column.' },
    { id: 'interrogate', name: 'Interrogate', cost: 1, slot: 0, junk: 'water', copies: 2, img: 'p52', text: 'Draw four cards, then discard three of those four.' },
    { id: 'high_ground', name: 'High Ground', cost: 0, slot: 1, junk: 'water', copies: 2, img: 'p53', text: 'Rearrange your people. For the rest of the turn every one of the opponent’s cards is unprotected.' },
    { id: 'famine', name: 'Famine', cost: 1, slot: 1, junk: 'injure', copies: 2, img: 'p54', text: 'Both players, you first, destroy all their people but one.' },
    { id: 'bombardment', name: 'Bombardment', cost: 4, slot: 3, junk: 'restore', copies: 2, img: 'p55', text: 'Damage every one of the opponent’s camps, then draw a card for each of their destroyed camps.' },
    { id: 'banish', name: 'Banish', cost: 1, slot: 1, junk: 'raid', copies: 2, img: 'p56', text: 'Destroy any one enemy, protected or not.' }
  ];

  /* Every player's own two cards. */
  const RAIDERS = { id: 'raiders', name: 'Raiders', slot: 2, img: 'raiders',
    text: 'The opponent picks one of their camps and it takes a damage — protected or not. Then Raiders come home.' };
  const SILO = { id: 'silo', name: 'Water Silo', junk: 'water', img: 'water_silo',
    text: 'Pay a water to pick this up. Junk it for an extra water; it then goes back to your play area.' };

  /* ---------------- the camps ---------------- */
  /* draw: the number in the black box — cards you start with. */
  const CAMPS = [
    { id: 'watchtower', name: 'Watchtower', draw: 0, img: 'c1', ab: [{ cost: 1, text: 'Damage — only if an event has gone off this turn.' }] },
    { id: 'warehouse', name: 'Warehouse', draw: 1, img: 'c2', ab: [{ cost: 0, text: 'This camp takes a damage. Then discard one or more cards (not the Water Silo) and draw that many plus one.' }] },
    { id: 'victory_totem', name: 'Victory Totem', draw: 1, img: 'c3', ab: [{ cost: 2, text: 'Injure.' }, { cost: 2, text: 'Raid.' }] },
    { id: 'transplant_lab', name: 'Transplant Lab', draw: 2, img: 'c4', ab: [{ cost: 1, text: 'Restore — only once you have put two or more people into play this turn.' }] },
    { id: 'training_camp', name: 'Training Camp', draw: 1, img: 'c5', ab: [{ cost: 1, text: 'Turn one of your punks face up. A person stays there as itself (not ready); an event is discarded and you gain a punk and an extra water.' }] },
    { id: 'supply_depot', name: 'Supply Depot', draw: 2, img: 'c6', ab: [{ cost: 2, text: 'Draw two cards, then discard one of them.' }] },
    { id: 'scud_launcher', name: 'Scud Launcher', draw: 0, img: 'c7', ab: [{ cost: 1, text: 'The opponent picks one of their own cards and it takes a damage.' }] },
    { id: 'scavenger_camp', name: 'Scavenger Camp', draw: 1, img: 'c8', ab: [{ cost: 2, text: 'Raid.' }, { cost: 1, text: 'Restore — only if your Raiders went off this turn.' }] },
    { id: 'resonator', name: 'Resonator', draw: 2, img: 'c9', ab: [{ cost: 2, text: 'Destroy an unprotected card that is already damaged.' }] },
    { id: 'reactor', name: 'Reactor', draw: 1, img: 'c10', ab: [{ cost: 2, text: 'Destroy this camp and every person in play.' }] },
    { id: 'railgun', name: 'Railgun', draw: 0, img: 'c11', ab: [{ cost: 2, text: 'Damage.' }] },
    { id: 'pillbox', name: 'Pillbox', draw: 1, img: 'c12', ab: [{ cost: 3, text: 'Damage. Costs one less for each of your destroyed camps.' }] },
    { id: 'parachute_base', name: 'Parachute Base', draw: 1, img: 'c13', ab: [{ cost: 0, text: 'Play a person from your hand and use its ability straight away (paying for both) — then it takes a damage.' }] },
    { id: 'outpost', name: 'Outpost', draw: 1, img: 'c14', ab: [{ cost: 2, text: 'Raid.' }, { cost: 2, text: 'Restore.' }] },
    { id: 'omen_clock', name: 'Omen Clock', draw: 1, img: 'c15', ab: [{ cost: 1, text: 'Move any event (either queue) one space forward.' }] },
    { id: 'the_octagon', name: 'The Octagon', draw: 0, img: 'c16', ab: [{ cost: 1, text: 'Destroy one of your people — and then the opponent must destroy one of theirs.' }] },
    { id: 'obelisk', name: 'Obelisk', draw: 3, img: 'c17', ab: [], tr: ['Destroyed before the game begins.'] },
    { id: 'oasis', name: 'Oasis', draw: 1, img: 'c18', ab: [], tr: ['While this column has none of your people, a person costs one less to play here.'] },
    { id: 'nest_of_spies', name: 'Nest of Spies', draw: 1, img: 'c19', ab: [{ cost: 1, text: 'Damage — only once you have put two or more people into play this turn.' }] },
    { id: 'mulcher', name: 'Mulcher', draw: 0, img: 'c20', ab: [{ cost: 0, text: 'Destroy one of your people, then draw a card.' }] },
    { id: 'mercenary_camp', name: 'Mercenary Camp', draw: 0, img: 'c21', ab: [{ cost: 2, text: 'The opponent destroys one of their own cards of their choosing — unless they discard two cards (not the Water Silo).' }] },
    { id: 'labor_camp', name: 'Labor Camp', draw: 1, img: 'c22', ab: [{ cost: 0, text: 'Destroy one of your people, then restore.' }] },
    { id: 'juggernaut', name: 'Juggernaut', draw: 0, img: 'c23', ab: [{ cost: 1, text: 'Roll one space forward (people drop behind). On the third roll it goes home, and the opponent destroys one of their own camps.' }] },
    { id: 'garage', name: 'Garage', draw: 0, img: 'c24', ab: [{ cost: 1, text: 'Raid.' }] },
    { id: 'construction_yard', name: 'Construction Yard', draw: 2, img: 'c25', ab: [{ cost: 1, text: 'Only while undamaged: bring one of your destroyed camps back, and destroy this one.' }] },
    { id: 'command_post', name: 'Command Post', draw: 2, img: 'c26', ab: [{ cost: 3, text: 'Damage. Costs one less for each punk you have.' }] },
    { id: 'catapult', name: 'Catapult', draw: 0, img: 'c27', ab: [{ cost: 2, text: 'Damage any card, protected or not — then destroy one of your own people.' }] },
    { id: 'cannon', name: 'Cannon', draw: 1, img: 'c28', ab: [{ cost: 1, text: 'Damage — then this camp takes a damage.' }] },
    { id: 'cache', name: 'Cache', draw: 1, img: 'c29', ab: [{ cost: 0, text: 'This camp takes a damage. Then draw, restore, or gain a punk.' }] },
    { id: 'bonfire', name: 'Bonfire', draw: 1, img: 'c30', ab: [{ cost: 0, text: 'This camp takes a damage, then restore as many cards as you like.' }], tr: ['Can never be restored.'] },
    { id: 'blood_bank', name: 'Blood Bank', draw: 1, img: 'c31', ab: [{ cost: 0, text: 'Destroy one of your people, then gain an extra water.' }] },
    { id: 'atomic_garden', name: 'Atomic Garden', draw: 1, img: 'c32', ab: [{ cost: 2, text: 'Restore a damaged person — who is ready again at once.' }] },
    { id: 'arcade', name: 'Arcade', draw: 1, img: 'c33', ab: [{ cost: 1, text: 'Gain a punk — only while you have no more than one person in play.' }] },
    { id: 'adrenaline_lab', name: 'Adrenaline Lab', draw: 1, img: 'c34', ab: [{ cost: 0, text: 'Use the ability of one of your damaged people (paying for it) — then destroy that person.' }] }
  ];

  /* The rulebook's first game (page 5). */
  const BOOK = {
    experienced: ['arcade', 'victory_totem', 'mercenary_camp'],
    newcomer: ['garage', 'railgun', 'supply_depot']
  };

  const ICONS = {
    damage: 'Damage', injure: 'Injure', destroy: 'Destroy', restore: 'Restore',
    draw: 'Draw', water: 'Extra water', punk: 'Gain a punk', raid: 'Raid'
  };
  /* What a junk icon does, in a phrase. */
  const JUNK = {
    damage: 'damage an unprotected enemy card', injure: 'injure an unprotected enemy',
    restore: 'restore one of your damaged cards', draw: 'draw a card',
    water: 'gain an extra water', punk: 'gain a punk', raid: 'raid'
  };

  const START = { water: 3, firstWater: 1, campsDealt: 6, campsKept: 3, drawCost: 2, siloCost: 1 };

  /* ---------------- lookups ---------------- */
  const BY = {};
  PEOPLE.forEach(c => { c.kind = 'person'; BY[c.id] = c; });
  EVENTS.forEach(c => { c.kind = 'event'; BY[c.id] = c; });
  CAMPS.forEach(c => { c.kind = 'camp'; BY[c.id] = c; });
  RAIDERS.kind = 'event'; BY.raiders = RAIDERS;
  SILO.kind = 'silo'; BY.silo = SILO;

  /* A card in the deck is an instance: "<type>.<copy>" ("muse.2"). */
  const typeOf = inst => inst == null ? null : String(inst).split('.')[0];
  const card = inst => BY[typeOf(inst)] || null;
  const nameOf = inst => { const c = card(inst); return c ? c.name : '?'; };

  function deckList() {
    const out = [];
    for (const c of PEOPLE.concat(EVENTS)) for (let k = 1; k <= c.copies; k++) out.push(c.id + '.' + k);
    return out;
  }

  const MANIFEST = {
    built: [
      'The whole base game: 46 people and 20 events in the draw deck, all 34 camps, Raiders and the Water Silo.',
      'Camp draft (deal six, keep three, chosen face down) or the rulebook’s first-game camps.',
      'The turn as the book has it — events, replenish, actions — with every action: play, junk, draw, take the Water Silo, use an ability.',
      'Every ability, trait and event, including Mimic, Adrenaline Lab, Parachute Base, Juggernaut, Omen Clock, High Ground and Famine.',
      'Punks stay face down to everybody (no peeking), and go back on top of the deck when they die.',
      'The deck reshuffles once; running out a second time is a draw.',
      'House players at three levels, a game that can be played by one phone against the house or two phones head to head.',
      'Take back a move to the start of your turn, until something new is drawn or turned over.'
    ],
    notBuilt: [
      'The Cult of Chrome expansion (its camps and cards are not in the module).',
      'Phones-only solo play with no telly (checklist F1).',
      'A baked Blender scene for the big moments — events and Raiders play out as a card held on the telly instead.'
    ],
    decisions: [
      'Obelisk: the module’s card says it is destroyed before the game begins (you start with two camps and three extra cards). Built that way — INFERRED, worth checking against the box.',
      'Construction Yard: the module’s card brings back one of your destroyed camps (while undamaged, destroying itself); the v2.0 rulebook FAQ describes a different card that moves people. Built as the module prints it — worth checking against the box.',
      'Resonator carries a small triangle icon in the module that the rulebook never explains; it is ignored.',
      'Scud Launcher and Mercenary Camp: “a card of their choice” means any of their cards, people or camps, protected or not.',
      'Where an ability needs a target and has none, it cannot be used (the phone greys it out with the reason); a junk effect with nothing to hit can still be junked and simply does nothing.',
      'High Ground rearranges by placing your people one at a time, each going to the front of the column you pick.',
      'Juggernaut: a person played into its column goes in front of it when it is home, and may go either side once it has rolled forward.',
      'The discard pile shows only its top card (the book’s “no dumpster diving”); the log names every card as it is discarded.'
    ]
  };

  const Data = { VERSION, PEOPLE, EVENTS, CAMPS, RAIDERS, SILO, BOOK, ICONS, JUNK, START, MANIFEST, BY, typeOf, card, nameOf, deckList };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.RadData = Data;
})(typeof window !== 'undefined' ? window : this);
