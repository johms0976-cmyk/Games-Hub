/* Catan — the components.
 *
 * Everything the box holds that the rules need to count: terrain, number
 * discs, harbours, the bank, the pieces in each colour, the development deck
 * and — for Cities & Knights — commodities, the three city-improvement tracks
 * and the three progress decks.
 *
 * Where the numbers come from:
 *   base game   the Completely Annotated Rules & Almanac 1.5 dropped in
 *               Resources/ (4th-edition rules, transcribed by Derek Whaley)
 *   C&K         the 6th-edition Cities & Knights rulebook (CATAN Studio, 2025,
 *               CN3087 v6.2504) — its card counts, costs and card names. The
 *               older 4th/5th-edition name of each progress card rides along as
 *               `alt`, because that is the name printed on most copies at a
 *               real table.
 *   5–6 players the Almanac's 5–6 extension pages and the 2025 CATAN 5–6
 *               (CN3082) and Cities & Knights 5–6 (CN3088) rulebooks, which
 *               agree on every count below.
 *
 * Every line of card text here is written fresh. The mechanics are the
 * designers'; the words are not theirs.
 */
(function (root) {
  'use strict';
  const D = {};
  D.VERSION = 1;

  /* ---------------- cards in hand ---------------- */
  D.RES = ['wood', 'brick', 'wool', 'wheat', 'ore'];
  D.COM = ['paper', 'cloth', 'coin'];
  D.CARD = {
    wood:  { name: 'Wood',  hex: '#3f8a3a', ink: '#eaf6e6' },
    brick: { name: 'Brick', hex: '#c0582f', ink: '#fff0e8' },
    wool:  { name: 'Wool',  hex: '#8fcf5b', ink: '#16300a' },
    wheat: { name: 'Wheat', hex: '#e6b83a', ink: '#3a2a04' },
    ore:   { name: 'Ore',   hex: '#8d94a3', ink: '#14171d' },
    paper: { name: 'Paper', hex: '#2e9d74', ink: '#e8fff6', com: true },
    cloth: { name: 'Cloth', hex: '#d9a82e', ink: '#2e2204', com: true },
    coin:  { name: 'Coin',  hex: '#3f6fd0', ink: '#eef3ff', com: true }
  };
  D.cardName = k => (D.CARD[k] ? D.CARD[k].name : k);

  /* ---------------- terrain ----------------
     `com` is what a CITY adds on that terrain in Cities & Knights; fields and
     hills give a city two of the resource instead. */
  D.TERRAIN = {
    forest:    { name: 'Forest',    res: 'wood',  com: 'paper', art: 'forest',    hex: '#2f6b33' },
    hills:     { name: 'Hills',     res: 'brick', com: null,    art: 'hills',     hex: '#a8582f' },
    pasture:   { name: 'Pasture',   res: 'wool',  com: 'cloth', art: 'pasture',   hex: '#79b64a' },
    fields:    { name: 'Fields',    res: 'wheat', com: null,    art: 'fields',    hex: '#d8a933' },
    mountains: { name: 'Mountains', res: 'ore',   com: 'coin',  art: 'mountains', hex: '#7b7f88' },
    desert:    { name: 'Desert',    res: null,    com: null,    art: 'desert',    hex: '#d9c08a' }
  };
  /* The island: 19 hexes. */
  D.MIX = { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 };
  D.NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  /* Nine harbours: four 3:1 and one 2:1 of each resource. */
  D.PORTS = ['any', 'any', 'any', 'any', 'wood', 'brick', 'wool', 'wheat', 'ore'];
  /* Ways to roll each total with two dice — the pips under the number. */
  D.PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

  /* ---------------- the bank and the pieces ---------------- */
  D.BANK = 19;               // of each resource
  D.COMMODITIES = 12;        // of each commodity (C&K)
  D.PIECES = { road: 15, settlement: 5, city: 4, wall: 3 };
  D.KNIGHTS = { 1: 2, 2: 2, 3: 2 };   // basic, strong, mighty — two of each
  D.KNIGHT_NAME = { 1: 'basic', 2: 'strong', 3: 'mighty' };
  D.HAND_LIMIT = 7;          // more than this on a 7 and you lose half
  D.WALL_BONUS = 2;          // each city wall lets you keep two more
  D.PROGRESS_LIMIT = 4;      // progress cards in hand (VP cards do not count)
  D.WIN = { base: 10, ck: 13 };
  D.LONGEST_MIN = 5;
  D.ARMY_MIN = 3;
  D.DEFENDER_TOKENS = 6;
  D.BARB_TRACK = 7;          // ship results before the barbarians land

  D.COST = {
    road:       { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, wool: 1, wheat: 1 },
    city:       { wheat: 2, ore: 3 },
    dev:        { wool: 1, wheat: 1, ore: 1 },
    wall:       { brick: 2 },
    knight:     { wool: 1, ore: 1 },
    promote:    { wool: 1, ore: 1 },
    activate:   { wheat: 1 },
    medicine:   { wheat: 1, ore: 2 }
  };
  D.COST_NAME = {
    road: 'Road', settlement: 'Settlement', city: 'City', dev: 'Development card',
    wall: 'City wall', knight: 'Knight', promote: 'Promote a knight', activate: 'Activate a knight'
  };

  /* ---------------- base game: the development deck ---------------- */
  D.DEV = {
    knight:   { name: 'Knight', count: 14,
                text: 'Move the robber and take a random card from someone with a building beside it. Played knights count towards the Largest Army.' },
    vp:       { name: 'Victory Point', count: 5,
                text: 'Worth one point, kept face down until it wins you the game.' },
    roads:    { name: 'Road Building', count: 2,
                text: 'Lay two roads for nothing.' },
    plenty:   { name: 'Year of Plenty', count: 2,
                text: 'Take any two resources from the bank.' },
    monopoly: { name: 'Monopoly', count: 2,
                text: 'Name a resource: every other player hands you all of theirs.' }
  };
  D.DEV_KEYS = ['knight', 'vp', 'roads', 'plenty', 'monopoly'];

  /* ---------------- Cities & Knights: the three tracks ----------------
     Level L costs L commodities of the track's kind. At level L a player draws
     a card of that colour when the event die shows it and the red die is at
     most L + 1. Level 3 brings a permanent ability; the first to level 4 takes
     the metropolis for a while, the first to level 5 keeps it for good. */
  D.TRACKS = ['trade', 'politics', 'science'];
  D.TRACK = {
    trade: {
      name: 'Trade', com: 'cloth', hex: '#e2b53a', ink: '#2b2003',
      levels: ['Basic city', 'Market', 'Trading House', 'Merchant Guild', 'Bank', 'Great Exchange'],
      ability: 'Merchant Guild: trade any two identical commodities for any one resource or commodity.'
    },
    politics: {
      name: 'Politics', com: 'coin', hex: '#3d6fd0', ink: '#eef3ff',
      levels: ['Basic city', 'Town Hall', 'Embassy', 'Fortress', 'Courthouse', 'High Assembly'],
      ability: 'Fortress: promote strong knights to mighty ones.'
    },
    science: {
      name: 'Science', com: 'paper', hex: '#35a06f', ink: '#eafff5',
      levels: ['Basic city', 'School', 'Library', 'Aqueduct', 'Theater', 'University'],
      ability: 'Aqueduct: whenever a roll other than 7 brings you nothing, take one resource of your choice.'
    }
  };
  /* Red-die results that draw a card at each level (index = level). */
  D.drawsOn = level => (level <= 0 ? [] : Array.from({ length: Math.min(6, level + 1) }, (_, i) => i + 1));
  /* The event die: three ship faces and one gate of each colour. */
  D.EVENT_FACES = ['ship', 'ship', 'ship', 'trade', 'politics', 'science'];

  /* ---------------- Cities & Knights: progress cards ----------------
     `when`: 'roll' — only before the dice; 'vp' — played the moment it is
     drawn; otherwise any time in your own Action phase. */
  D.PROGRESS = {
    /* science (green) */
    alchemy:       { deck: 'science', count: 2, name: 'Alchemy', alt: 'Alchemist', when: 'roll',
                     text: 'Before you roll, choose what the two production dice will show. The event die is still rolled.' },
    crane:         { deck: 'science', count: 2, name: 'Crane',
                     text: 'Raise one city improvement for one commodity less than it costs.' },
    engineering:   { deck: 'science', count: 1, name: 'Engineering', alt: 'Engineer',
                     text: 'Build a city wall for nothing.' },
    invention:     { deck: 'science', count: 2, name: 'Invention', alt: 'Inventor',
                     text: 'Swap two number discs on the board — neither may be a 2, 6, 8 or 12.' },
    irrigation:    { deck: 'science', count: 2, name: 'Irrigation',
                     text: 'Take two wheat for every fields hex touching one of your buildings.' },
    medicine:      { deck: 'science', count: 2, name: 'Medicine',
                     text: 'Upgrade a settlement to a city for two ore and one wheat.' },
    mining:        { deck: 'science', count: 2, name: 'Mining',
                     text: 'Take two ore for every mountains hex touching one of your buildings.' },
    printing:      { deck: 'science', count: 1, name: 'Printing', alt: 'Printer', when: 'vp',
                     text: 'One victory point, laid face up the moment it is drawn.' },
    roads:         { deck: 'science', count: 2, name: 'Road Building',
                     text: 'Build two roads for nothing.' },
    smithing:      { deck: 'science', count: 2, name: 'Smithing', alt: 'Smith',
                     text: 'Promote up to two of your knights for nothing.' },
    /* trade (yellow) */
    harbor:        { deck: 'trade', count: 2, name: 'Commercial Harbor',
                     text: 'Offer every other player one of your resources; each must hand you a commodity of their choosing for it.' },
    dues:          { deck: 'trade', count: 2, name: 'Guild Dues', alt: 'Master Merchant',
                     text: 'Look through the hand of a player with more points than you and take any two cards from it.' },
    merchant:      { deck: 'trade', count: 6, name: 'Merchant',
                     text: 'Stand the merchant on a land hex beside one of your buildings. While he is yours, trade that hex’s resource at 2:1 — and he is worth a point.' },
    fleet:         { deck: 'trade', count: 2, name: 'Merchant Fleet',
                     text: 'Name one resource or commodity: for the rest of this turn it trades with the bank at 2:1.' },
    resmono:       { deck: 'trade', count: 4, name: 'Resource Monopoly',
                     text: 'Name a resource: every other player hands you two of it — or the one they have.' },
    trademono:     { deck: 'trade', count: 2, name: 'Trade Monopoly',
                     text: 'Name a commodity: every other player hands you one of it, if they have one.' },
    /* politics (blue) */
    diplomacy:     { deck: 'politics', count: 2, name: 'Diplomacy', alt: 'Diplomat',
                     text: 'Lift an open road off the board. If it was yours, you may lay it again anywhere for nothing.' },
    espionage:     { deck: 'politics', count: 3, name: 'Espionage', alt: 'Spy',
                     text: 'Look at another player’s progress cards and take one of them.' },
    encouragement: { deck: 'politics', count: 2, name: 'Encouragement', alt: 'Warlord',
                     text: 'Activate every one of your knights for nothing.' },
    intrigue:      { deck: 'politics', count: 2, name: 'Intrigue',
                     text: 'Displace an opposing knight that stands on a crossing your roads reach — no knight of yours needed.' },
    taxation:      { deck: 'politics', count: 2, name: 'Taxation', alt: 'Bishop',
                     text: 'Move the robber, then take a random card from every player with a building on its new hex. Not before the barbarians first land.' },
    constitution:  { deck: 'politics', count: 1, name: 'Constitution', when: 'vp',
                     text: 'One victory point, laid face up the moment it is drawn.' },
    treason:       { deck: 'politics', count: 2, name: 'Treason', alt: 'Deserter',
                     text: 'Another player takes one of their knights off the board; you may stand one of yours of the same strength or less on your own roads.' },
    wedding:       { deck: 'politics', count: 2, name: 'Wedding',
                     text: 'Every player with more points than you gives you two cards of their choosing.' },
    sabotage:      { deck: 'politics', count: 2, name: 'Sabotage', alt: 'Saboteur',
                     text: 'Every other player with at least as many points as you discards half of their hand.' }
  };
  D.PROGRESS_KEYS = Object.keys(D.PROGRESS);
  D.deckOf = key => (D.PROGRESS[key] ? D.PROGRESS[key].deck : null);
  D.progName = key => {
    const c = D.PROGRESS[key];
    return c ? c.name : key;
  };

  /* ---------------- five and six players ----------------
     The extension box on top of the base box: eleven more hexes (one of them a
     second desert), its own 28 number discs in place of the base 18, two more
     harbours (a 3:1 and a second wool 2:1), five more of each resource, nine
     more development cards; with Cities & Knights, six more of each commodity
     and two more Defender of Catan points. Pieces per player do not change,
     nor do the progress decks. */
  D.SEATS_MAX = 6;
  D.BIG = {
    layout: 'big',
    mix: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['any', 'any', 'any', 'any', 'any', 'wood', 'brick', 'wool', 'wool', 'wheat', 'ore'],
    bank: 24,
    commodities: 18,
    dev: { knight: 20, vp: 5, roads: 3, plenty: 3, monopoly: 3 },
    defender: 8
  };
  /* What happens between turns with five or six. `paired` is the 2025 rule of
     both 5–6 rulebooks: the player three seats on from the one who rolled
     takes an action phase of their own straight after them — bank trades,
     building, a card — but no trading with other players. `build` is the
     older special building phase (the Almanac): when a turn ends, everybody
     else in turn may build with the cards in hand, and do nothing else. */
  D.BETWEEN = {
    paired: { name: 'Paired turns', note: 'The 2025 rule: the player three seats on takes an action phase after each turn.' },
    build: { name: 'Special building', note: 'The older rule: when a turn ends, everyone else in turn may build with the cards in hand.' }
  };

  /* ---------------- the house players ----------------
     A mid-century settler for each empty chair. */
  D.HOUSE = [
    { name: 'Wilhelmina', hex: '#f0ede4' }, { name: 'Bartholomew', hex: '#f08a2c' },
    { name: 'Ottilie', hex: '#8e4ec6' }, { name: 'Casimir', hex: '#1f9e9e' },
    { name: 'Leopoldine', hex: '#30a46c' }, { name: 'Ambrose', hex: '#f5c542' }
  ];
  /* Piece colours a house player may take when a human already has theirs. */
  D.PIECE_COLOURS = ['#e5484d', '#3e7bfa', '#f0ede4', '#f08a2c', '#8e4ec6', '#1f9e9e', '#30a46c', '#f5c542'];

  D.MANIFEST = true;

  if (typeof module === 'object' && module.exports) module.exports = D;
  else root.CatanData = D;
})(typeof window !== 'undefined' ? window : globalThis);
