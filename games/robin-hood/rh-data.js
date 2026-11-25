'use strict';
/* A Gest of Robin Hood — the components. No rules here, only what is printed.
 *
 * SOURCES, RANKED (LESSONS-CHECKLIST A, "rank the sources once"):
 *   1. The printed GMT 2024 components in the user's VASSAL module
 *      (games/A Gest of Robin Hood/A_Gest_of_Robin_Hood_1.02.vmod): the map,
 *      both faction mats, both setup sheets, the Rob summary screen, the
 *      Sequence of Play / Royal Inspection sheet, and the 44 card faces.
 *   2. The module's own automatic setup (Automatically setup game.vsav): the
 *      Royal Favour starts on 1 Order, Remston is Revolting.
 *   3. The rulebook inside the module, "v4.5 30.03.2022" — the print-and-play
 *      DRAFT, not the GMT book. Used only where the printed components say
 *      nothing (the Ballad deck's build, Capture order, Disperse). Where the
 *      two disagree the components win (Royal Inspection's phases, Inspire,
 *      Recruit's locations, the start of the favour track).
 *   4. Our rulings, in MANIFEST.decisions (shown on the telly and every phone).
 *
 * Every line of card text below is written fresh; the mechanics are the
 * designer's (Fred Serval, GMT Games).
 */
(function (root) {
  const VERSION = 1;

  /* ================================================================
     The map. Coordinates are in board pixels: the module's map picture
     cropped to the board (x 730..2792 of the 3521-wide image), so the art
     and the overlay share one frame (2062 x 2676).
     ================================================================ */
  const BOARD = { w: 2062, h: 2676 };
  /* kind: parish | forest | castle | hill. `p` is where pieces stand, `m` the
     printed marker box (parishes), `road` the next space along the road to
     Nottingham (the dotted lines; read off the board). */
  const SPACES = {
    retford:  { name: 'Retford', kind: 'parish', p: [1300, 560], m: [1270, 345], road: 'tuxford' },
    blyth:    { name: 'Blyth', kind: 'parish', p: [770, 900], m: [970, 700], road: 'tuxford' },
    tuxford:  { name: 'Tuxford', kind: 'parish', p: [1320, 875], m: [1280, 1055], road: 'southwell' },
    newark:   { name: 'Newark', kind: 'parish', p: [1560, 1520], m: [1520, 1315], road: 'tuxford' },
    mansfield:{ name: 'Mansfield', kind: 'parish', p: [470, 1700], m: [486, 1455], road: 'shirewood' },
    bingham:  { name: 'Bingham', kind: 'parish', p: [1330, 2010], m: [1210, 1855], road: 'remston' },
    remston:  { name: 'Remston', kind: 'parish', p: [990, 2130], m: [786, 1995], road: 'mansfield' },
    shirewood:{ name: 'Shire Wood', kind: 'forest', p: [770, 1270], road: 'nottingham' },
    southwell:{ name: 'Southwell Forest', short: 'Southwell', kind: 'forest', p: [1010, 1420], road: 'nottingham' },
    nottingham:{ name: 'Nottingham', kind: 'castle', p: [780, 1600] },
    ollerton: { name: 'Ollerton Hill', kind: 'hill', p: [1025, 1240] }
  };
  const IDS = Object.keys(SPACES);
  const PARISHES = IDS.filter(k => SPACES[k].kind === 'parish');
  const FORESTS = IDS.filter(k => SPACES[k].kind === 'forest');
  /* Land borders that are NOT rivers, read off the board picture (the thin
     brown lines) and checked against the module's zone outlines. */
  const BORDERS = [
    ['retford', 'tuxford'], ['blyth', 'tuxford'], ['blyth', 'shirewood'],
    ['shirewood', 'southwell'], ['shirewood', 'mansfield'], ['shirewood', 'nottingham'],
    ['southwell', 'nottingham'], ['southwell', 'tuxford'],
    ['mansfield', 'nottingham'], ['remston', 'bingham']
  ];
  /* Rivers with a printed bridge (adjacent), and rivers without one (not
     adjacent until Boats & Bridges places the Bridge on one). */
  const BRIDGED = [['tuxford', 'newark'], ['mansfield', 'remston']];
  const RIVERS = [['retford', 'blyth'], ['southwell', 'newark'], ['southwell', 'bingham'], ['nottingham', 'remston'], ['newark', 'bingham']];
  /* Ollerton Hill touches these four; nothing may move onto it (the
     v4.5 rules: "impassable"). Major Oak puts a Camp there and joins them. */
  const OLLERTON = ['shirewood', 'southwell', 'blyth', 'tuxford'];
  /* Spaces on a river bank (Boats & Bridges, Robin Hood's half). */
  const RIVERSIDE = ['retford', 'blyth', 'tuxford', 'newark', 'southwell', 'bingham', 'nottingham', 'remston', 'mansfield'];

  /* ================================================================
     Pieces and the economy
     ================================================================ */
  const PIECES = { merry: 11, henchmen: 18, camps: 5, carriages: 6 };
  /* Carriages: two of each. `def` is the Rob defence; `rh` what a successful
     Rob pays Robin Hood; `sh` and `order` what reaching Nottingham pays. */
  const CARRIAGES = {
    tallage: { name: 'Tallage', def: 0, rh: 5, justice: 0, sh: 5, order: 1, text: 'Five shillings of tax.' },
    tribute: { name: 'Tribute', def: 0, rh: 2, justice: 1, sh: 2, order: 2, text: 'Tribute for Prince John: two shillings, and the Royal Favour.' },
    trap:    { name: 'Trap', def: 2, rh: 2, justice: 0, sh: 2, order: 1, capture: true, text: 'Soldiers in the cart. Fail to rob it and the robbers are taken.' }
  };
  const CARRIAGE_LIST = ['tallage', 'tallage', 'tribute', 'tribute', 'trap', 'trap'];
  /* The Rob dice (the module's die faces). */
  const DICE = {
    green: [-1, -1, 0, 1, 2, 3],   /* Forests and Revolting Parishes */
    white: [-2, -1, -1, 0, 1, 2]   /* Submissive and Passive spaces, Nottingham */
  };
  /* Initiative: boxes left to right; a pass pays the Sheriff the box's coins. */
  const BOXES = [
    { id: 'single', name: 'Single Plot', coins: 1 },
    { id: 'event', name: 'Event', coins: 2 },
    { id: 'pd', name: 'Plots & Deeds', coins: 3 }
  ];
  const START = {
    sheriff: { shillings: 9, henchmen: { nottingham: 2, blyth: 1, mansfield: 1, bingham: 1 } },
    robin: { shillings: 5, camp: 'shirewood', placeIn: ['shirewood', 'southwell', 'remston'], merry: 3 },
    revolting: ['remston'],
    favour: 1                  /* +1 = one step towards Order (the setup sheet's silver 1) */
  };
  /* The Royal Favour runs Justice 7..1 then Order 1..7; there is no zero. */
  const FAVOUR_MAX = 7, WIN_AT = 5;

  /* ================================================================
     Plots and Deeds — what the mats print (our words)
     ================================================================ */
  const PLOTS = {
    robin: {
      recruit: { name: 'Recruit', cost: 1, per: 'space', where: 'Up to 3 spaces that are not Submissive.', text: 'Place a Merry Man, or turn a Merry Man into a Camp (+1 Justice). Where a Camp already stands: place up to 2 Merry Men, or hide everyone there.' },
      sneak: { name: 'Sneak', cost: 1, per: 'origin', where: 'Up to 3 spaces with Merry Men.', text: 'Move Merry Men to adjacent spaces. Into a Submissive space where movers plus Henchmen come to more than 3, they arrive Revealed; otherwise all movers are Hidden.' },
      rob: { name: 'Rob', cost: 0, per: 'space', where: 'Up to 3 spaces with Hidden Merry Men or Robin Hood.', text: 'Pick a target — a Traveller off the deck, a Carriage here, or the Treasury in Nottingham — reveal Merry Men and roll. Revealed robbers + die must beat the target’s Defence + Henchmen here.' }
    },
    sheriff: {
      hire: { name: 'Hire', cost: 2, per: 'space', where: 'Up to 3: Submissive Parishes, Nottingham, or Revolting Parishes the Henchmen outnumber.', text: 'Up to 2 Henchmen into a Submissive Parish, up to 4 into Nottingham; or set a Revolting Parish where Henchmen outnumber Merry Men to Submissive.' },
      patrol: { name: 'Patrol', cost: 2, per: 'destination', where: 'Up to 3 destinations.', text: 'Move Henchmen in from adjacent spaces, then reveal one Merry Man per Henchman there (one per two in a Forest).' },
      capture: { name: 'Capture', cost: 0, per: 'space', where: 'Up to 3 spaces with Henchmen.', text: 'Take one Revealed enemy piece per Henchman (per two in a Revolting Parish): Merry Men to Prison, Robin Hood after them, Camps last.' }
    }
  };
  const DEEDS = {
    robin: {
      turncoat: { name: 'Turncoat', cost: 1, text: 'In a Revolting Parish with a Merry Man: swap one Henchman for a Merry Man.' },
      donate: { name: 'Donate', cost: 2, text: 'Up to 2 Submissive Parishes where Merry Men at least match the Henchmen: 2 shillings each to set them Revolting.' },
      swashbuckle: { name: 'Swashbuckle', cost: 0, text: 'Robin Hood and up to one Merry Man with him slip to adjacent spaces, Hidden. Or Robin Hood breaks out of Prison, Revealed, in or beside Nottingham.' },
      inspire: { name: 'Inspire', cost: 0, text: 'In a Parish with Robin Hood Hidden: reveal him to set it Revolting — or, if it already is, +1 Justice.' }
    },
    sheriff: {
      ride: { name: 'Ride', cost: 0, text: 'Up to 4 Henchmen ride from Nottingham to any one Parish.' },
      confiscate: { name: 'Confiscate', cost: 0, text: 'Up to 2 Submissive Parishes with Henchmen: a face-down Carriage into each, and each turns Revolting.' },
      disperse: { name: 'Disperse', cost: 3, text: 'A Parish with Henchmen: remove two enemy pieces to Available, even Hidden ones (Camps last, +1 Order), and it turns Revolting.' }
    }
  };

  /* ================================================================
     The Travellers (Rob targets). `a` is the light half (the easy rob), `b`
     the dark half (the hard one). `to`: where the card goes after.
     ================================================================ */
  const TRAVELLERS = {
    merchant: { name: 'Rich Merchant', n: 2, def: 1,
      a: { name: 'Invitation to dinner', win: 'Gain 2 shillings.', lose: 'Nothing.', gain: 2 },
      b: { name: 'Fleece him!', win: 'Gain 4 shillings; he joins the Victims.', lose: 'The Sheriff gains 2 shillings.', gain: 4, victim: true, loseSheriff: 2 } },
    knight: { name: 'Noble Knight', n: 2, def: 2,
      a: { name: 'Pas d’armes', win: 'Gain 3 shillings.', lose: 'Nothing.', gain: 3 },
      b: { name: 'Mug him!', win: 'Gain 5 shillings; he joins the Victims.', lose: 'The robbers are captured.', gain: 5, victim: true, loseCapture: true } },
    monks: { name: 'Monks', n: 3, def: 0,
      a: { name: 'Forced charity', win: 'Gain 1 shilling.', lose: 'Nothing.', gain: 1 },
      b: { name: 'Brutal punishment!', win: 'Gain 3 shillings; they join the Victims.', lose: 'The space turns Submissive.', gain: 3, victim: true, loseSubmit: true } },
    lea: { name: 'Richard at the Lea', n: 1, def: 1,
      a: { name: 'Extortion', win: 'Gain 2 shillings.', lose: 'Nothing.', gain: 2 },
      b: { name: 'Lend money', win: 'Pay 3 shillings, no roll: Retford turns Revolting and gains a Camp (+1 Justice). The card leaves the game.', lose: '', noRoll: true, cost: 3 } },
    potter: { name: 'The Potter', n: 1, def: 1,
      a: { name: 'Road toll', win: 'Gain 3 shillings.', lose: 'Nothing.', gain: 3 },
      b: { name: 'A clever trick', win: 'Robin Hood appears beside Nottingham, Revealed; 2 shillings from the Sheriff; +1 Justice. A Victim.', lose: 'Robin Hood is captured.', victim: true, fromSheriff: 2, justice: 1, placeRobin: true, loseRobin: true } },
    miller: { name: 'The Miller’s Son', n: 1, def: 0,
      a: { name: 'Quick shilling', win: 'Gain 2 shillings.', lose: 'Nothing.', gain: 2 },
      b: { name: 'A new recruit', win: 'Gain 1 shilling and a Hidden Merry Man here or next door. A Victim.', lose: 'A Henchman appears here.', gain: 1, victim: true, recruit: true, loseHenchman: true } },
    bishop: { name: 'Bishop of Hereford', n: 1, def: 1, extra: true,
      a: { name: 'Forced donation', win: 'Gain 3 shillings.', lose: 'Nothing.', gain: 3 },
      b: { name: 'Repent!', win: 'Gain 6 shillings; he joins the Victims.', lose: 'The Sheriff gains 3 shillings and the space turns Submissive.', gain: 6, victim: true, loseSheriff: 3, loseSubmit: true } },
    guy: { name: 'Guy of Gisborne', n: 1, def: 3, extra: true, single: true,
      a: { name: 'Fight!', win: 'Guy leaves the game.', lose: 'The robbers are captured.', removeCard: true, loseCapture: true } }
  };
  /* Card ids: <kind>.<copy>. The starting deck holds the ten without `extra`. */
  const TRAVELLER_IDS = [];
  for (const k of Object.keys(TRAVELLERS)) for (let i = 1; i <= TRAVELLERS[k].n; i++) TRAVELLER_IDS.push(k + '.' + i);
  /* The module's picture for each card: images/T<n>.png (numbered on the face). */
  const TRAVELLER_ART = { 'merchant.1': 'T1', 'merchant.2': 'T2', 'knight.1': 'T3', 'knight.2': 'T4', 'lea.1': 'T5', 'monks.1': 'T6', 'monks.2': 'T7', 'monks.3': 'T8', 'potter.1': 'T9', 'miller.1': 'T10', 'bishop.1': 'T11', 'guy.1': 'T12' };

  /* ================================================================
     The Ballad deck: 24 events, 5 Fortune events, 2 Royal Inspections and
     King Richard's Return. `c` = Carriages to move when it is drawn. `rh` is
     the light half (Robin Hood's), `sh` the dark half (the Sheriff's).
     ================================================================ */
  const EVENTS = {
    1:  { name: 'Day of Market', c: 2, fortune: true, title: 'Time to make a profit',
          text: 'The Sheriff may send Henchmen home to Available for a shilling each, up to the number of Submissive Parishes. Then Robin Hood may send one Merry Man home for half as many shillings (rounded down).' },
    2:  { name: 'Bishop of Hereford', c: 2,
          rh: { title: 'Easy mark', text: 'The Bishop joins the Travellers, and a Noble Knight leaves the game (from the deck or its discards). Shuffle the Travellers.' },
          sh: { title: 'Seeks sanctuary with the Sheriff', text: 'Gain 2 shillings, and a Monk goes from the Travellers to the Victims.' } },
    3:  { name: 'Queen Eleanor', c: 0, fortune: true, title: 'Morality questioned',
          text: 'The Sheriff may send a Noble Knight from the Travellers to the Victims. Then +1 Order if four or more cards lie among the Victims, otherwise +1 Justice.' },
    4:  { name: 'Guy of Gisborne', c: 1,
          rh: { title: 'Fooled by a decoy', text: 'Robin Hood swaps places with any Merry Man on the map, even from Prison or Available. Robin is Hidden, the other man Revealed.' },
          sh: { title: 'Ruthless second-in-command', text: 'Guy joins the Travellers, and a Monk leaves the game (from the deck or its discards). Shuffle the Travellers.' } },
    5:  { name: 'Little John', c: 1,
          rh: { title: 'Loyal companion', text: 'Reveal Robin Hood: a Hidden Merry Man joins him there, and gain 2 shillings.' },
          sh: { title: 'Foolish bumbler', text: 'A Revolting Parish with a Revealed Merry Man turns Submissive.' } },
    6:  { name: 'Prioress of Kirklees', c: 1,
          rh: { title: 'Robin’s cousin shelters him', text: 'Hide every Merry Man in one Parish. +1 Justice.' },
          sh: { title: 'Poison', text: 'Robin Hood and one Merry Man beside him go back to Available.' } },
    7:  { name: 'Yeomen Revolt', c: 2,
          rh: { title: 'Revolt encouraged', text: 'A Parish with no Henchmen turns Revolting. +1 Justice.' },
          sh: { title: 'Revolt suppressed', text: '+1 Order if more Parishes are Submissive than Revolting.' } },
    8:  { name: 'Warden of the Forest', c: 0, fortune: true, title: 'Surprise inspection',
          text: 'The Sheriff may Hire in up to two Revolting Parishes, then Robin Hood may Donate once. Then +1 Order if five or more Parishes are Submissive, otherwise +1 Justice.' },
    9:  { name: 'Social Bandit', c: 2,
          rh: { title: 'People’s hero', text: 'Reveal Robin Hood in a Parish: a Camp there (+1 Justice), and gain 2 shillings.' },
          sh: { title: 'Out-of-touch outlaw', text: 'Reveal Robin Hood; his space turns Submissive if it can.' } },
    10: { name: 'Tax Collectors', c: 1,
          rh: { title: 'Incompetent administrators', text: 'Up to 4 Merry Men from next door slip into Nottingham, Hidden, and may Rob there at once.' },
          sh: { title: 'Brutal enforcement', text: 'Confiscate in up to two Parishes with Henchmen, Submissive or not.' } },
    11: { name: 'Great Escape', c: 1,
          rh: { title: 'Daring rescue', text: 'Everyone in Prison, Robin Hood too, breaks out into one space beside Nottingham, Revealed.' },
          sh: { title: 'A traitor in the ranks', text: 'Reveal every Merry Man in one space, then Capture there.' } },
    12: { name: 'Boats & Bridges', c: 1,
          rh: { title: 'Crafting boats', text: 'Any Merry Men from one riverside space row to another riverside space, Hidden.' },
          sh: { title: 'Building bridges', text: 'The Bridge goes across one river; that border is now ordinary. +1 Order.' } },
    13: { name: 'Ambush', c: 1,
          rh: { title: 'Perfect hiding places', text: 'Any Merry Men move to a space with a Carriage, Hidden, and Rob there at once.' },
          sh: { title: 'Easy to detect', text: 'Reveal every Merry Man in one Forest. +1 Order.' } },
    14: { name: 'Temporary Truce', c: 0, fortune: true, title: 'Opportunity to escape',
          text: 'The Sheriff may march every Henchman into Submissive spaces for +1 Order. Then Robin Hood may take every Merry Man to Camps or Forests, all Hidden, for +1 Justice.' },
    15: { name: 'Will Scarlet', c: 2,
          rh: { title: 'Talented woodsman', text: 'A Camp in a Forest (+1 Justice), even beside one already there.' },
          sh: { title: 'Robin’s resentful kinsman', text: 'Reveal Robin Hood, then a free Single Patrol.' } },
    16: { name: 'Heavy Rain', c: 0, fortune: true, title: 'Storms slow everything',
          text: 'Each player in turn (first eligible first) may make a Single Plot or take 2 shillings.' },
    17: { name: 'The Red Cap', c: 1,
          rh: { title: 'Robin wins the archery', text: 'Reveal Robin Hood: a Parish next to him turns Revolting. +1 Justice.' },
          sh: { title: 'The chief archer leads Henchmen', text: 'Reveal Robin Hood; up to two Henchmen from anywhere join him.' } },
    18: { name: 'Allan-a-Dale', c: 2,
          rh: { title: 'Flamboyant troubadour', text: 'Reveal any Merry Men in one space for a shilling each. +1 Justice.' },
          sh: { title: 'Noisy troublemaker', text: 'A free Single Patrol; if a Henchman stands in the destination, every Merry Man there is Revealed.' } },
    19: { name: 'Royal Pardon', c: 2,
          rh: { title: 'Empty promise', text: 'Half the Merry Men in Prison (rounded down) walk out into one space beside Nottingham, Revealed.' },
          sh: { title: 'A chance for peace', text: 'Release any Merry Men from Prison to Available: +1 Order for every two.' } },
    20: { name: 'Major Oak', c: 2,
          rh: { title: 'Sanctuary', text: 'A Camp on Ollerton Hill (+1 Justice). From now on the spaces round the Hill are all adjacent to each other, for Robin Hood.' },
          sh: { title: 'Camp destroyed', text: 'Remove a Camp from a Forest. +1 Order.' } },
    21: { name: 'Robin’s Horn', c: 2,
          rh: { title: 'An epic robbery', text: 'Reveal Robin Hood: up to 3 Merry Men from next door join him, Hidden, and may Rob there at once.' },
          sh: { title: 'A common thief', text: 'Henchmen up to half the Victims (rounded up) into any Parishes, then you may Capture in one of them.' } },
    22: { name: 'Fast Carriages', c: 1,
          rh: { title: 'Vulnerable to attack', text: 'A free Single Sneak, then Rob in up to three spaces with +1 on every Rob roll.' },
          sh: { title: 'Rapid transport', text: 'One Carriage moves up to two spaces at once.' } },
    23: { name: 'Friar Tuck', c: 1,
          rh: { title: 'Popular preacher', text: 'Donate in up to three Submissive Parishes with a Merry Man, however many Henchmen, for 1 shilling each.' },
          sh: { title: 'Issues with ale', text: 'Reveal every Merry Man in one space with a Henchman.' } },
    24: { name: 'Maid Marian', c: 1,
          rh: { title: 'Distributed leadership', text: 'A free Single Plot, then Swashbuckle or Inspire using any Merry Man as Robin Hood.' },
          sh: { title: 'The Sheriff shows mercy', text: 'A Carriage on the map goes to Used Carriages, and one Parish turns Submissive; every Merry Man there moves next door.' } },
    25: { name: 'Weapons of the Weak', c: 1,
          rh: { title: 'Passive resistance', text: 'A Submissive Parish loses its marker for good: Passive, neither side’s, though it still counts as Submissive for Rob and Capture.' },
          sh: { title: 'Peasants resigned', text: 'A Revolting Parish turns Submissive.' } },
    26: { name: 'Corruption', c: 2,
          rh: { title: 'The Sheriff’s authority crumbles', text: 'Pay 1 shilling: one Henchman becomes a Merry Man.' },
          sh: { title: 'Hungry men defect', text: 'Pay 2 shillings: up to two Merry Men in one space become Henchmen.' } },
    27: { name: 'Will Stutely', c: 1,
          rh: { title: 'A cunning ruse', text: 'A Hidden Merry Man slips into a Parish next door; every Henchman there goes back to Nottingham.' },
          sh: { title: 'To the gallows!', text: 'Two Revealed Merry Men (not Robin Hood) go to Prison.' } },
    28: { name: 'Nottingham Fair', c: 1,
          rh: { title: 'Little John befriends the cook', text: 'Up to two Henchmen in Nottingham become Merry Men.' },
          sh: { title: 'Too much stout ale', text: 'Up to two Merry Men beside Nottingham go back to Available.' } },
    29: { name: 'A Tale of Two Lovers', c: 1,
          rh: { title: 'Allan-a-Dale marries Ellen', text: 'Pay 1 shilling: in one space a Merry Man and up to two Henchmen leave the game. +1 Justice.' },
          sh: { title: 'Edward of Deirwold backs the Sheriff', text: 'Gain 2 shillings and up to two Henchmen into any one Parish.' } },
    30: { name: 'Royal Inspection', c: 1, inspection: true, text: 'A Royal Inspection Round, then play goes on.' },
    31: { name: 'Royal Inspection', c: 1, inspection: true, text: 'A Royal Inspection Round, then play goes on.' },
    32: { name: 'King Richard’s Return', c: 1, inspection: true, last: true, text: 'The Unrest phase, then the King judges: whoever holds the Royal Favour wins.' }
  };
  const EVENT_IDS = Object.keys(EVENTS).map(Number);
  const REGULAR = EVENT_IDS.filter(k => !EVENTS[k].fortune && !EVENTS[k].inspection);
  const FORTUNE = EVENT_IDS.filter(k => EVENTS[k].fortune);

  const MANIFEST = {
    built: [
      'Two players: Robin Hood and the Merry Men against the Sheriff of Nottingham. One phone each, or one phone against the house.',
      'The Ballad deck built as the rulebook says: three Ballads of seven cards, a Royal Inspection after each of the first two, King Richard’s Return last.',
      'Every Plot and Deed on both mats, all 24 events (both halves), the 5 Fortune events, the 12 Travellers, the 6 Carriages, the Rob dice.',
      'The Royal Inspection’s five phases as pages: Unrest, Mischief, Governance, Redeployment, Reset.',
      'Hidden Merry Men: nobody but Robin Hood’s player knows which one is Robin, or what a face-down Carriage holds.'
    ],
    notBuilt: [
      'A How to play mode (the setup sheets’ opening strategies would be its first lesson).',
      'Baked scenes: a Rob is a held card with the die, not a scene.'
    ],
    decisions: [
      'The rulebook in the module is the 2022 print-and-play draft. Where it and the printed GMT mats disagree, the mats win.',
      'The Royal Favour starts on 1 Order (the Sheriff’s setup sheet and the module’s own setup).',
      'Ollerton Hill is impassable: only a Camp, by Major Oak, ever goes there (1.3.4).',
      'A Plot’s spaces are chosen and done one at a time; Plots & Deeds may skip its Deed (4.1: “if desired”).',
      'Either player may play either half of an event (5.1.1). Whoever plays it gains, pays and picks the spaces; Robin Hood’s men are only ever moved or placed by Robin Hood’s player, the Henchmen and Carriages by the Sheriff.',
      'Sneak moves Revealed Merry Men before Hidden ones (they arrive Hidden anyway); Robin Hood goes only when you say so.',
      'Patrol, Disperse and Corruption cannot see under a Hidden piece: which Hidden man is Revealed or taken is drawn at random, so the Sheriff may find Robin Hood.',
      'Robin Hood may be secretly swapped with any Merry Man at every Redeployment, not only when he came back from Available.',
      'A Passive Parish (Weapons of the Weak) never takes a marker again: it is neither Submissive nor Revolting, and Henchmen and Merry Men need not leave it at Redeployment.',
      'Heavy Rain’s and Warden of the Forest’s plots cost their usual shillings; Maid Marian’s and Fast Carriages’ are free, as printed.',
      'Ambush may gather Merry Men from anywhere on the map; Great Escape and Royal Pardon put everyone in one space.',
      'Day of Market: Robin Hood’s shillings are half the Henchmen the Sheriff sent home.',
      'Tax Collectors’ Confiscate still needs Henchmen in each Parish.',
      'A Rob roll is made only after the target and its option are chosen; Richard at the Lea’s “Lend money” needs no roll but still reveals the robbers.',
      'When the Prison holds Robin Hood alone, the Mischief phase frees nobody (half of one is none); Swashbuckle is his way out.'
    ]
  };

  const Data = {
    VERSION, BOARD, SPACES, IDS, PARISHES, FORESTS, BORDERS, BRIDGED, RIVERS, OLLERTON, RIVERSIDE,
    PIECES, CARRIAGES, CARRIAGE_LIST, DICE, BOXES, START, FAVOUR_MAX, WIN_AT,
    PLOTS, DEEDS, TRAVELLERS, TRAVELLER_IDS, TRAVELLER_ART, EVENTS, EVENT_IDS, REGULAR, FORTUNE, MANIFEST,
    SIDES: { robin: { name: 'Robin Hood', hex: '#3f9d4a', men: 'Merry Men' }, sheriff: { name: 'the Sheriff', title: 'The Sheriff', hex: '#5b8fd6', men: 'Henchmen' } }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.RhData = Data;
})(typeof window !== 'undefined' ? window : this);
