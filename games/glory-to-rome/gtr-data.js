'use strict';
/* Glory to Rome (Black Box edition) — the components.
 *
 * Read off the user's print-and-play sheets (reference/GtR_Fronts.pdf, 14
 * sheets of 3x6) and the rulebook (reference/GTR_rules.pdf). Counts are the
 * printed ones and are asserted in tests/engine.js:
 *   159 Order cards in 44 kinds = 129 in both versions + 15 Republic-only
 *   (marked with a laurel) + 15 Imperium-only (a lightning bolt); 36 Sites,
 *   six of each material; 6 Jacks; 6 Merchant Bonus cards. The unofficial
 *   "Geek" expansion (hollow rings) adds 36 more in 10 kinds.
 *
 * Sources ranked: the printed card face first, then the rulebook's appendix
 * (which explains and gives examples), then our own ruling, written in
 * MANIFEST.decisions. Every line of card text below is written fresh.
 */
(function (root) {
  const VERSION = 1;

  /* Material → its role (the card's colour), its value, and its colour. */
  const MATS = ['rubble', 'wood', 'brick', 'concrete', 'stone', 'marble'];
  const MAT = {
    rubble:   { name: 'Rubble',   role: 'laborer',   value: 1, hex: '#f2b229', ink: '#3a2a00' },
    wood:     { name: 'Wood',     role: 'craftsman', value: 1, hex: '#2ea84a', ink: '#04250e' },
    brick:    { name: 'Brick',    role: 'legionary', value: 2, hex: '#e3241b', ink: '#fff' },
    concrete: { name: 'Concrete', role: 'architect', value: 2, hex: '#9a9a88', ink: '#1d1d16' },
    stone:    { name: 'Stone',    role: 'merchant',  value: 3, hex: '#00a8d9', ink: '#00222e' },
    marble:   { name: 'Marble',   role: 'patron',    value: 3, hex: '#8c2a77', ink: '#fff' }
  };
  const ROLES = ['laborer', 'craftsman', 'legionary', 'architect', 'merchant', 'patron'];
  const ROLE = {
    laborer:   { name: 'Laborer',   many: 'Laborers',   mat: 'rubble',   does: 'Take a material from the Pool into your Stockpile.' },
    craftsman: { name: 'Craftsman', many: 'Craftsmen',  mat: 'wood',     does: 'Lay a foundation from your hand, or add a material from your hand to a building.' },
    legionary: { name: 'Legionary', many: 'Legionaries', mat: 'brick',    does: 'Show a card: Rome demands that material from the Pool and your neighbours’ hands.' },
    architect: { name: 'Architect', many: 'Architects', mat: 'concrete', does: 'Lay a foundation from your hand, or add a material from your Stockpile to a building.' },
    merchant:  { name: 'Merchant',  many: 'Merchants',  mat: 'stone',    does: 'Move a material from your Stockpile into your Vault.' },
    patron:    { name: 'Patron',    many: 'Patrons',    mat: 'marble',   does: 'Take a card from the Pool into your Clientele.' },
    thinker:   { name: 'Thinker',   mat: null,       does: 'Draw up to your hand size, or draw one card, or take a Jack.' }
  };

  /* The Order cards. set: base (both versions) | rep | imp | geek.
     when: 'always' (a standing power), 'done' (once, upon completion),
     'win' (an instant win), 'end' (at game end). The text is ours. */
  const CARDS = [
    /* ---- Rubble · Laborer · 1 ---- */
    { k: 'bar', name: 'Bar', mat: 'rubble', n: 6, set: 'base', text: 'Patron: you may also take a client straight off the top of the deck.' },
    { k: 'insula', name: 'Insula', mat: 'rubble', n: 6, set: 'base', text: 'Room for 2 more clients.' },
    { k: 'latrine', name: 'Latrine', mat: 'rubble', n: 6, set: 'base', text: 'Before you Think, you may throw one card from your hand into the Pool.' },
    { k: 'road', name: 'Road', mat: 'rubble', n: 6, set: 'base', text: 'Any material counts towards finishing a Stone building.' },
    { k: 'castra', name: 'Castra', mat: 'rubble', n: 6, set: 'geek', text: 'If a Legionary took a card from your hand this turn, Think at the end of it.' },
    /* ---- Wood · Craftsman · 1 ---- */
    { k: 'dock', name: 'Dock', mat: 'wood', n: 6, set: 'base', text: 'Laborer: you may also move a card from your hand into your Stockpile.' },
    { k: 'market', name: 'Market', mat: 'wood', n: 6, set: 'base', text: 'Room for 2 more cards in your Vault.' },
    { k: 'palisade', name: 'Palisade', mat: 'wood', n: 6, set: 'base', text: 'Legionaries cannot take cards from you (a Bridge still can).' },
    { k: 'crane', name: 'Crane', mat: 'wood', n: 6, set: 'rep', text: 'Any card in your hand can lead or follow Architect.' },
    { k: 'circus', name: 'Circus', mat: 'wood', n: 6, set: 'imp', text: 'Two cards of one role make a Jack (instead of three).' },
    { k: 'domus', name: 'Domus', mat: 'wood', n: 6, set: 'geek', when: 'done', text: 'When finished: take one Patron action.' },
    /* ---- Brick · Legionary · 2 ---- */
    { k: 'academy', name: 'Academy', mat: 'brick', n: 3, set: 'base', text: 'After a turn in which you took any Craftsman action, you may Think once.' },
    { k: 'archway', name: 'Archway', mat: 'brick', n: 3, set: 'base', text: 'Architect: you may take the material from the Pool instead of your Stockpile.' },
    { k: 'atrium', name: 'Atrium', mat: 'brick', n: 3, set: 'base', text: 'Merchant: you may vault the top card of the deck, unseen, instead of a Stockpile card.' },
    { k: 'bath', name: 'Bath', mat: 'brick', n: 3, set: 'base', text: 'Patron: each client you hire acts once, straight away, as it joins.' },
    { k: 'foundry', name: 'Foundry', mat: 'brick', n: 3, set: 'base', when: 'done', text: 'When finished: one Laborer action for each point of your influence.' },
    { k: 'gate', name: 'Gate', mat: 'brick', n: 3, set: 'base', text: 'Your Marble buildings work as soon as their foundation is laid.' },
    { k: 'school', name: 'School', mat: 'brick', n: 3, set: 'base', when: 'done', text: 'When finished: Think once for each point of your influence.' },
    { k: 'shrine', name: 'Shrine', mat: 'brick', n: 3, set: 'base', text: 'Hand size +2.' },
    { k: 'castrapraetoria', name: 'Castra Praetoria', short: 'Castra Praet.', mat: 'brick', n: 3, set: 'geek', when: 'done', text: 'Legionary: you may show an unfinished building instead of a card. When finished: its materials may join your Clientele.' },
    { k: 'watermill', name: 'Watermill', mat: 'brick', n: 3, set: 'geek', text: 'After you lead or follow Laborer, each of your Architect clients acts once.' },
    /* ---- Concrete · Architect · 2 ---- */
    { k: 'amphitheatre', name: 'Amphitheatre', mat: 'concrete', n: 3, set: 'base', when: 'done', text: 'When finished: one Craftsman action for each point of your influence.' },
    { k: 'aqueduct', name: 'Aqueduct', mat: 'concrete', n: 3, set: 'base', text: 'Patron: you may also take a client from your hand. Twice the room for clients.' },
    { k: 'bridge', name: 'Bridge', mat: 'concrete', n: 3, set: 'base', text: 'Legionary: demand from every player, take one from each Stockpile too, and ignore Palisades.' },
    { k: 'storeroom', name: 'Storeroom', mat: 'concrete', n: 3, set: 'base', text: 'Every client of yours also counts as a Laborer.' },
    { k: 'tower', name: 'Tower', mat: 'concrete', n: 3, set: 'base', text: 'Rubble counts towards any building. Out-of-town sites cost one action, not two.' },
    { k: 'vomitorium', name: 'Vomitorium', mat: 'concrete', n: 3, set: 'base', text: 'Before you Think, you may throw your whole hand away.' },
    { k: 'wall', name: 'Wall', mat: 'concrete', n: 3, set: 'base', when: 'end', text: 'Legionaries cannot take cards from you, even with a Bridge. +1 VP for every two Stockpile cards.' },
    { k: 'tribunal', name: 'Tribunal', mat: 'concrete', n: 3, set: 'rep', text: 'After you Think, you may also take a Jack.' },
    { k: 'senate', name: 'Senate', mat: 'concrete', n: 3, set: 'imp', text: 'At the end of each turn you may take the Jacks other players played into your hand.' },
    { k: 'solarium', name: 'Solarium', mat: 'concrete', n: 3, set: 'geek', text: 'When an Architect action finishes a building, you may move one of its materials into your Stockpile.' },
    { k: 'aerarium', name: 'Aerarium', mat: 'concrete', n: 3, set: 'geek', when: 'done', text: 'Your limits use the highest influence at the table. When finished: run one of your buildings’ “when finished” powers again.' },
    /* ---- Stone · Merchant · 3 ---- */
    { k: 'catacomb', name: 'Catacomb', mat: 'stone', n: 3, set: 'base', when: 'done', text: 'When finished, the game ends at once. Score as usual.' },
    { k: 'circusmaximus', name: 'Circus Maximus', short: 'Circus Max.', mat: 'stone', n: 3, set: 'base', text: 'When you lead or follow a role, each of your clients of that role acts twice.' },
    { k: 'garden', name: 'Garden', mat: 'stone', n: 3, set: 'base', when: 'done', text: 'When finished: one Patron action for each point of your influence.' },
    { k: 'prison', name: 'Prison', mat: 'stone', n: 3, set: 'base', when: 'done', text: 'When finished: swap the Prison’s site (3 influence) for another player’s finished building.' },
    { k: 'scriptorium', name: 'Scriptorium', mat: 'stone', n: 3, set: 'base', text: 'One Marble finishes any of your buildings, whatever it costs.' },
    { k: 'sewer', name: 'Sewer', mat: 'stone', n: 3, set: 'base', text: 'At the end of a turn, the cards you led or followed with go into your Stockpile.' },
    { k: 'villa', name: 'Villa', mat: 'stone', n: 3, set: 'base', text: 'An Architect action that puts a material into the Villa finishes it.' },
    { k: 'domusaurea', name: 'Domus Aurea', mat: 'stone', n: 3, set: 'rep', text: 'Legionary: also pull down a matching foundation with no materials from each victim — the card to your Stockpile, its site to your influence.' },
    { k: 'colosseum', name: 'Colosseum', mat: 'stone', n: 3, set: 'imp', text: 'Legionary: also take a matching client from each victim into your Vault.' },
    { k: 'watchpost', name: 'Watch Post', mat: 'stone', n: 3, set: 'geek', text: 'A Craftsman action may pull down one of your finished buildings: the card to your hand, its materials to your Stockpile.' },
    { k: 'bacchanalia', name: 'Bacchanalia', mat: 'stone', n: 3, set: 'geek', when: 'done', text: 'When finished: turn over cards equal to your influence; one each may go to your Vault, Stockpile, Clientele, a new foundation and an unfinished building; the rest to your hand.' },
    /* ---- Marble · Patron · 3 ---- */
    { k: 'basilica', name: 'Basilica', mat: 'marble', n: 3, set: 'base', text: 'Merchant: you may also move a card from your hand into your Vault.' },
    { k: 'fountain', name: 'Fountain', mat: 'marble', n: 3, set: 'base', text: 'Craftsman: you may use the top card of the deck instead of a card from your hand — or keep it.' },
    { k: 'ludusmagnus', name: 'Ludus Magnus', short: 'Ludus Magnus', mat: 'marble', n: 3, set: 'base', text: 'Each Merchant client counts as a client of every role.' },
    { k: 'palace', name: 'Palace', mat: 'marble', n: 3, set: 'base', text: 'You may lead or follow with several cards of one role: one action for each.' },
    { k: 'stairway', name: 'Stairway', mat: 'marble', n: 3, set: 'base', text: 'Architect: you may also add a material to another player’s finished building — its power is then everybody’s.' },
    { k: 'statue', name: 'Statue', mat: 'marble', n: 3, set: 'base', when: 'end', text: '+3 VP. It may be built on any site.' },
    { k: 'temple', name: 'Temple', mat: 'marble', n: 3, set: 'base', text: 'Hand size +4.' },
    { k: 'forumromanum', name: 'Forum Romanum', short: 'Forum Rom.', mat: 'marble', n: 3, set: 'rep', when: 'win', text: 'You win at once if you have a client of every role and a material of every kind in your Stockpile.' },
    { k: 'forum', name: 'Forum', mat: 'marble', n: 3, set: 'imp', when: 'win', text: 'You win at once if you have a client of every role.' },
    { k: 'triclinium', name: 'Triclinium', mat: 'marble', n: 3, set: 'geek', text: 'When you lead or follow, each client may go into your Vault after it acts.' },
    { k: 'plebeiancouncil', name: 'Plebeian Council', short: 'Plebeian C.', mat: 'marble', n: 3, set: 'geek', when: 'win', text: 'You win at once if you have more Laborer clients than anyone else and the table has more Laborer clients than Legionary clients.' }
  ];
  const BY = {};
  CARDS.forEach(c => { BY[c.k] = c; c.role = MAT[c.mat].role; c.value = MAT[c.mat].value; c.when = c.when || 'always'; });

  const SETS = {
    rep: { name: 'Republic', petition: 2, startHand: 5, startJacks: 0, blurb: 'The friendlier deck, and the box’s advice for a first game: Crane, Tribunal, Domus Aurea and Forum Romanum. Two cards of one role make a Jack.' },
    imp: { name: 'Imperium', petition: 3, startHand: 4, startJacks: 1, blurb: 'The cut-throat deck: Circus, Senate, Colosseum, Forum. Three of one role make a Jack; each hand starts with a Jack.' }
  };

  /* The deck for a version, as kind keys (one entry per copy). */
  function deckKinds(version, geek) {
    const out = [];
    for (const c of CARDS) {
      if (c.set === 'geek' && !geek) continue;
      if (c.set === 'rep' && version !== 'rep') continue;
      if (c.set === 'imp' && version !== 'imp') continue;
      for (let i = 0; i < c.n; i++) out.push(c.k);
    }
    return out;
  }

  const COUNTS = { order: 159, kinds: 44, sites: 36, sitesPer: 6, jacks: 6, bonus: 6, geek: 36, geekKinds: 10, deckRep: 144, deckImp: 144 };

  const MANIFEST = {
    built: [
      'The whole game for 2 to 5, either version: Republic (the box’s advice for a first game) or Imperium.',
      'The unofficial Geek expansion, all ten buildings, as a switch in the lobby.',
      'All forty-odd building powers, each one checked by a test that plays it.',
      'Leading, following, Thinking, Jacks and petitions; out-of-town sites; the Merchant Bonuses; the four ways the game ends.',
      'House players at three levels; one phone against the house, or a whole table of phones.',
      'Taking back a move until something new is seen; the opening card; each legionary demand, lead and finished building shown on the telly before it lands.'
    ],
    notBuilt: [
      'Surrender (the rulebook’s “all other players agree”): play it out or go back to the menu.',
      'The training game without building powers.'
    ],
    decisions: [
      'The card face is the rule; the rulebook’s appendix settles what the card leaves open.',
      'The deck running out ends the game the moment the last card is drawn.',
      'The game ends when the last in-town site is taken (that foundation can never be finished).',
      'Starting player: one card is dealt into the Pool per player; the earliest name in the alphabet leads, ties dealing again.',
      'A legionary always takes a matching card from the Pool when there is one. A victim with a choice of cards of that material chooses which to give.',
      'Palisade and Wall owners never give a card to a legionary (the rule lets them; nobody does).',
      'Sewer: the cards you led or followed with go to your Stockpile automatically. Senate: you take the opponents’ Jacks automatically.',
      'Your Vault: everyone sees how many cards are in it; you see what you put in (the phone remembers for you, as a player would), except Atrium cards, which nobody sees until the end.',
      'Storeroom: the card says clients “also” count as Laborers, so they act as Laborers and as themselves; for the Forums each client fills one role only (the rulebook).',
      'Palace: any mix of cards of the role, Jacks and petitions, one action for each.',
      'Aerarium (Geek): “exchange 2 influence” is the rulebook’s example — the site stays yours, and you re-run one of your own buildings’ “when finished” powers.',
      'Watch Post (Geek): the site of a pulled-down building goes back out of town.',
      'Domus (Geek): a client it hires that matches the role being played adds one more action to it.',
      'A tie on points goes to the player with the most cards in hand; still tied, they share the win.'
    ]
  };

  /* How many actions cards played as `role` are worth, or why not. kinds:
     card kinds ('jack' for a Jack). f: { pet, palace, crane }. Jacks and
     cards of the role count one each; other cards only in petitions of
     f.pet. Without a Palace exactly one may be played. The engine and the
     phone both use this one function. */
  function units(kinds, role, f) {
    const no = why => ({ ok: false, why });
    if (!kinds || !kinds.length) return no('Choose the cards to play.');
    if (ROLES.indexOf(role) < 0) return no('Choose a role.');
    const crane = role === 'architect' && f.crane;
    let j = 0, m = 0;
    const groups = {};
    for (const k of kinds) {
      if (k === 'jack') { j++; continue; }
      const r = BY[k] ? BY[k].role : null;
      if (!r) return no('Unknown card.');
      if (crane || r === role) { m++; continue; }
      groups[r] = (groups[r] || 0) + 1;
    }
    let petN = 0;
    for (const r of Object.keys(groups)) {
      if (groups[r] % f.pet) return no('Cards of another role go in ' + (f.pet === 2 ? 'pairs' : 'threes') + ' to stand in for a Jack.');
      petN += groups[r] / f.pet;
    }
    const n = j + m + petN;
    if (n < 1) return no('That plays nothing.');
    if (n > 1 && !f.palace) return no('Only a Palace lets you play more than one card of a role.');
    return { ok: true, units: n, jacks: j, petitions: petN };
  }

  const Data = { VERSION, MATS, MAT, ROLES, ROLE, CARDS, BY, SETS, COUNTS, MANIFEST, deckKinds, units,
    card: k => BY[k] || null,
    nameOf: k => (BY[k] ? BY[k].name : k === 'jack' ? 'Jack' : k),
    shortOf: k => (BY[k] ? (BY[k].short || BY[k].name) : k === 'jack' ? 'Jack' : k),
    roleOf: k => (BY[k] ? BY[k].role : null),
    matOf: k => (BY[k] ? BY[k].mat : null)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.GtrData = Data;
})(typeof window !== 'undefined' ? window : this);
