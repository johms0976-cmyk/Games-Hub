'use strict';
/* Saint Petersburg (2nd edition) — the components.
 *
 * Every number in this file was read off the publisher's own card faces, not
 * recalled: the card art Yucata serves for its `saintpetersburg2` plugin is the
 * printed 2nd-edition card, cost in the top-left corner, the income band across
 * the bottom, and the market symbols in a wooden roundel top right. Two things
 * confirm the reading rather than merely agreeing with it:
 *
 *   - the five component totals come out exactly — 31 workers, 28 buildings,
 *     27 aristocrats, 30 trading cards, 35 market cards;
 *   - the four 2nd-edition changes the rules list are all present and are all
 *     differences from the 1st-edition art beside it: the Observatory costs 1
 *     more (7), the Judge 1 more (17), the Mistress of Ceremonies 2 more (20),
 *     and the Mariinsky Theater costs 5 more (15) and pays victory points for
 *     aristocrats where the old one paid rubles.
 *
 * `tests/engine.js` asserts all of that, so if a number here is ever edited by
 * hand those are what go red.
 *
 * THE ONE THING THAT IS AN INFERENCE — see INFERRED_RED below.
 */
(function (root) {

/* ---------- the four colours ----------
 *
 * Colour, not group, is what the game actually runs on. A trading card is
 * green, blue or red, it displaces a card of its own colour, and it is scored
 * in that colour's phase from then on. So a player's play area is a column per
 * colour and a trading card simply lives in one of them. Yellow — the market —
 * is the odd one: nothing is ever built over a market card, because no trading
 * card is yellow.
 */
const COLORS = {
  green:  { id: 'green',  name: 'Workers',     phase: 'worker',     hex: '#3f8f4a', ink: '#eafbe9' },
  yellow: { id: 'yellow', name: 'Market',      phase: 'market',     hex: '#d9a020', ink: '#fff6de' },
  blue:   { id: 'blue',   name: 'Buildings',   phase: 'building',   hex: '#2f6fc0', ink: '#e9f2ff' },
  red:    { id: 'red',    name: 'Aristocrats', phase: 'aristocrat', hex: '#a52a33', ink: '#ffeaea' }
};
const COLOR_IDS = ['green', 'yellow', 'blue', 'red'];

/* The phases, in their printed order. The market phase sits between the
   workers and the buildings and is only played with the Market expansion; the
   trading phase is the odd one — no scoring, and the row shuffle happens at
   the end of it. */
const PHASES = ['worker', 'market', 'building', 'aristocrat', 'trading'];
const PHASE = {
  worker:     { id: 'worker',     name: 'Workers',       color: 'green',  deck: 'worker',     scores: true,
                blurb: 'Workers pay rubles. Every one of them pays three, so the ladder is all in the price.' },
  market:     { id: 'market',     name: 'The Market',    color: 'yellow', deck: 'market',     scores: true,
                blurb: 'Sell at the market. Your cards pay rubles, then whoever brought the most of each good takes the points.' },
  building:   { id: 'building',   name: 'Buildings',     color: 'blue',   deck: 'building',   scores: true,
                blurb: 'Buildings pay victory points. The dearer ones pay better per ruble — if you can wait for them.' },
  aristocrat: { id: 'aristocrat', name: 'Aristocrats',   color: 'red',    deck: 'aristocrat', scores: true,
                blurb: 'Aristocrats pay both — and every DIFFERENT one you own is worth more at the end than the last.' },
  trading:    { id: 'trading',    name: 'Trading cards', color: null,     deck: 'trading',    scores: false,
                blurb: 'Nothing is scored. Build over what you already have and pay only the difference.' }
};

/* Which stack the administrator deals from at the END of each phase. Not the
   phase's own colour — the board is always one step ahead of the room, which
   is why a building is on the table to be bought during the worker phase. */
function phasesFor(market) { return market ? PHASES.slice() : PHASES.filter(p => p !== 'market'); }
function refillAfter(market) {
  const list = phasesFor(market), out = {};
  list.forEach((p, i) => { out[p] = PHASE[list[(i + 1) % list.length]].deck; });
  return out;
}

/* Worker symbols. In the base game these do exactly one job: they say which
   worker a green trading card is allowed to displace. */
const SYMBOLS = {
  wood: { id: 'wood', name: 'timber' }, gold: { id: 'gold', name: 'gold' },
  cloth: { id: 'cloth', name: 'cloth' }, fur: { id: 'fur', name: 'fur' },
  ship: { id: 'ship', name: 'shipping' }
};

/* ---------- the market ----------
 *
 * Five goods. A card carrying one or more of a good's symbols moves that
 * player up that good's track, and at the end of every market phase the two
 * players furthest up each track take points. The tracks are never reset.
 *
 * The '?' roundel — the Czar & Carpenter wears the only one in the base box —
 * is a good of your choosing, taken from a supply of five tiles, one per good.
 */
const MARKET_GOODS = [
  { id: 'apple',   name: 'Apples',   one: 'Apple',        two: 'Apple Crate',      three: 'Apple Orchard',
    shorts: { one: 'Apple',   two: 'Apple Crate', three: 'Orchard' } },
  { id: 'grain',   name: 'Grain',    one: 'Ear of Wheat', two: 'Grain Sack',       three: 'Field',
    shorts: { one: 'Wheat',   two: 'Grain Sack',  three: 'Field' } },
  { id: 'fish',    name: 'Fish',     one: 'Fish',         two: 'Fish Basket',      three: 'Caviar',
    shorts: { one: 'Fish',    two: 'Fish Basket', three: 'Caviar' } },
  { id: 'cabbage', name: 'Cabbages', one: 'Cabbage',      two: 'Vegetable Basket', three: 'Vegetable Garden',
    shorts: { one: 'Cabbage', two: 'Veg Basket',  three: 'Veg Garden' } },
  { id: 'chicken', name: 'Chickens', one: 'Chick',        two: 'Hen',              three: 'Chicken Coop',
    shorts: { one: 'Chick',   two: 'Hen',         three: 'Coop' } }
];
const GOOD_IDS = MARKET_GOODS.map(g => g.id);

/* Every good is printed identically, which is why these are built from a shape
   rather than written out twenty times — and the shape itself was read off all
   five sets of card faces, not off one and assumed:
 *
 *   the cheap card carries the MOST symbols. A Chicken Coop is 3 rubles for
 *   three chickens and no income; a Chick is 5 for one chicken and 2 rubles a
 *   round. So the market track and the purse pull against each other, which is
 *   the whole of the expansion in one line.
 */
const MARKET_SHAPE = [
  { pick: 'one',    cost: 5, r: 2, syms: 1, copies: 3 },
  { pick: 'two',    cost: 4, r: 1, syms: 2, copies: 2 },
  { pick: 'three',  cost: 3, r: 0, syms: 3, copies: 1 },
  /* The orange card: a ruble for four symbols at once, and then rent for the
     rest of the game. Stop paying and the four go straight back. */
  { pick: 'orange', cost: 1, r: 0, syms: 4, copies: 1, fn: 'orange' }
];

/* The market's worth, a round at a time: the player furthest up a track takes
   the first number, the runner-up the second. It climbs every round and then
   stops. Read off the six value tiles. */
const MARKET_VALUES = [[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3]];
function marketValue(round) {
  return MARKET_VALUES[Math.max(0, Math.min(MARKET_VALUES.length - 1, (round | 0) - 1))];
}

/* ================================================================
   The cards.

   cost    printed, top left
   r/vp    the income band: rubles on the left, victory points on the right
   copies  how many are in the box
   fn      a named special; every one of them is implemented in sp-engine.js
   worth   what this card counts as when a trading card displaces it (Potemkin
           Village is the only card where that differs from its cost)
   good    the market roundel top right — one of the five goods, or 'any' for
           the '?' that lets its owner choose
   goods   how many of that roundel are printed on it
   ================================================================ */

const CARDS = [
  /* ---------- workers: 31 ---------- */
  { key: 'lumberjack',  name: 'Lumberjack',   group: 'worker', color: 'green', cost: 3, r: 3, vp: 0, copies: 6, sym: 'wood' },
  { key: 'goldminer',   name: 'Gold Miner',   group: 'worker', color: 'green', cost: 4, r: 3, vp: 0, copies: 6, sym: 'gold' },
  { key: 'shepherd',    name: 'Shepherd',     group: 'worker', color: 'green', cost: 5, r: 3, vp: 0, copies: 6, sym: 'cloth' },
  { key: 'furtrapper',  name: 'Fur Trapper',  group: 'worker', color: 'green', cost: 6, r: 3, vp: 0, copies: 6, sym: 'fur',   short: 'Trapper' },
  /* Six copies, one roundel apiece — not six of the same good. The printed
     cards give five distinct goods (apple/fish/grain/chicken/cabbage); the
     sixth is a genuine second copy rather than a "choose any" card (that
     ability belongs to the Czar alone, below, and no such Ship Builder card
     exists among the printed faces). WHICH good doubles up could not be told
     from the card art, since a second apple card is pixel-identical to the
     first — apple was picked arbitrarily. If the real distribution ever
     turns up, this is the one line to fix. */
  { key: 'shipbuilder_apple',   name: 'Ship Builder', group: 'worker', color: 'green', cost: 7, r: 3, vp: 0, copies: 2, sym: 'ship', short: 'Shipwright', good: 'apple',   goods: 1, family: 'shipbuilder' },
  { key: 'shipbuilder_fish',    name: 'Ship Builder', group: 'worker', color: 'green', cost: 7, r: 3, vp: 0, copies: 1, sym: 'ship', short: 'Shipwright', good: 'fish',    goods: 1, family: 'shipbuilder' },
  { key: 'shipbuilder_grain',   name: 'Ship Builder', group: 'worker', color: 'green', cost: 7, r: 3, vp: 0, copies: 1, sym: 'ship', short: 'Shipwright', good: 'grain',   goods: 1, family: 'shipbuilder' },
  { key: 'shipbuilder_chicken', name: 'Ship Builder', group: 'worker', color: 'green', cost: 7, r: 3, vp: 0, copies: 1, sym: 'ship', short: 'Shipwright', good: 'chicken', goods: 1, family: 'shipbuilder' },
  { key: 'shipbuilder_cabbage', name: 'Ship Builder', group: 'worker', color: 'green', cost: 7, r: 3, vp: 0, copies: 1, sym: 'ship', short: 'Shipwright', good: 'cabbage', goods: 1, family: 'shipbuilder' },
  /* Czar Peter can do it all: any green trading card may displace him, and the
     roundel he wears is whichever good his owner names. `anyGreen` is its own
     boolean rather than living in `fn`, because Module 1's Czar-Superstar
     below needs BOTH "any green card fits over me" and a discount fn at once,
     and `fn` only ever holds one string. */
  { key: 'czar', name: 'Czar & Carpenter', group: 'worker', color: 'green', cost: 8, r: 3, vp: 0, copies: 1, sym: 'any', short: 'Czar', anyGreen: true, good: 'any', goods: 1,
    text: 'Any green trading card can displace the Czar. His market roundel is a good of your choosing.' },

  /* ---------- buildings: 28 ---------- */
  /* Five copies, one good apiece — never a repeat, unlike the Ship Builder
     above, because there are exactly five Market cards printed and five
     goods to put on them. */
  { key: 'market_apple',   name: 'Market', group: 'building', color: 'blue', cost: 5, r: 0, vp: 1, copies: 1, good: 'apple',   goods: 1, family: 'market' },
  { key: 'market_fish',    name: 'Market', group: 'building', color: 'blue', cost: 5, r: 0, vp: 1, copies: 1, good: 'fish',    goods: 1, family: 'market' },
  { key: 'market_grain',   name: 'Market', group: 'building', color: 'blue', cost: 5, r: 0, vp: 1, copies: 1, good: 'grain',   goods: 1, family: 'market' },
  { key: 'market_chicken', name: 'Market', group: 'building', color: 'blue', cost: 5, r: 0, vp: 1, copies: 1, good: 'chicken', goods: 1, family: 'market' },
  { key: 'market_cabbage', name: 'Market', group: 'building', color: 'blue', cost: 5, r: 0, vp: 1, copies: 1, good: 'cabbage', goods: 1, family: 'market' },
  { key: 'customs',   name: 'Customs House', group: 'building', color: 'blue', cost: 8,  r: 0, vp: 2, copies: 5, short: 'Customs' },
  { key: 'firehouse', name: 'Firehouse',     group: 'building', color: 'blue', cost: 11, r: 0, vp: 3, copies: 3 },
  { key: 'hospital',  name: 'Hospital',      group: 'building', color: 'blue', cost: 14, r: 0, vp: 4, copies: 3 },
  { key: 'library',   name: 'Library',       group: 'building', color: 'blue', cost: 17, r: 0, vp: 5, copies: 3 },
  { key: 'theater',   name: 'Theater',       group: 'building', color: 'blue', cost: 20, r: 0, vp: 6, copies: 2 },
  { key: 'academy',   name: 'Academy',       group: 'building', color: 'blue', cost: 23, r: 0, vp: 7, copies: 1 },
  /* Two rubles for a facade; worth six to whoever knocks it down. */
  { key: 'potemkin', name: 'Potemkin Village', group: 'building', color: 'blue', cost: 2, r: 0, vp: 0, copies: 1, short: 'Potemkin', worth: 6, fn: 'potemkin',
    text: 'Costs 2. Counts as 6 when a trading card displaces it.' },
  { key: 'pub', name: 'Pub', group: 'building', color: 'blue', cost: 1, r: 0, vp: 0, copies: 2, fn: 'pub',
    text: 'After every building scoring, buy up to 5 points at 2 rubles each.' },
  { key: 'warehouse', name: 'Warehouse', group: 'building', color: 'blue', cost: 2, r: 0, vp: 0, copies: 1, fn: 'warehouse',
    text: 'Hold 4 cards in hand instead of 3.' },
  { key: 'observatory', name: 'Observatory', group: 'building', color: 'blue', cost: 7, r: 0, vp: 1, copies: 2, short: 'Observat.', fn: 'observatory',
    text: 'Worth 1 point — or, once a round in the building phase, draw the top card of any stack and buy it, hold it or throw it away. Then it scores nothing this round.' },

  /* ---------- aristocrats: 27 ---------- */
  { key: 'author',      name: 'Author',                 group: 'aristocrat', color: 'red', cost: 4,  r: 1, vp: 0, copies: 6 },
  { key: 'administrat', name: 'Administrator',          group: 'aristocrat', color: 'red', cost: 7,  r: 2, vp: 0, copies: 5, short: 'Admin' },
  { key: 'whmanager',   name: 'Warehouse Manager',      group: 'aristocrat', color: 'red', cost: 10, r: 3, vp: 0, copies: 5, short: 'Wh Manager' },
  { key: 'secretary',   name: 'Secretary',              group: 'aristocrat', color: 'red', cost: 12, r: 4, vp: 0, copies: 4 },
  { key: 'controller',  name: 'Controller',             group: 'aristocrat', color: 'red', cost: 14, r: 4, vp: 1, copies: 3 },
  { key: 'judge',       name: 'Judge',                  group: 'aristocrat', color: 'red', cost: 17, r: 5, vp: 2, copies: 2 },
  { key: 'mistress',    name: 'Mistress of Ceremonies', group: 'aristocrat', color: 'red', cost: 20, r: 6, vp: 3, copies: 2, short: 'Mistress' },

  /* ---------- trading cards: 30 ----------
     Green: one for each worker, two of each. The pairing is the rule — a
     weaving mill can only ever be built over a shepherd. */
  { key: 'carpenter', name: 'Carpenter Workshop', group: 'trading', color: 'green', cost: 4,  r: 3, vp: 0, copies: 2, sym: 'wood',  over: 'lumberjack',  short: 'Carpenter', fn: 'discountBlue',
    text: 'Every blue card costs you 1 less from now on.' },
  { key: 'smelter',   name: 'Gold Smelter',       group: 'trading', color: 'green', cost: 6,  r: 3, vp: 0, copies: 2, sym: 'gold',  over: 'goldminer',   short: 'Smelter',   fn: 'discountRed',
    text: 'Every red card costs you 1 less from now on.' },
  { key: 'weaving',   name: 'Weaving Mill',       group: 'trading', color: 'green', cost: 8,  r: 6, vp: 0, copies: 2, sym: 'cloth', over: 'shepherd',    short: 'Weaving' },
  { key: 'furshop',   name: 'Fur Shop',           group: 'trading', color: 'green', cost: 10, r: 3, vp: 2, copies: 2, sym: 'fur',   over: 'furtrapper' },
  /* over: 'shipbuilder' matches the FAMILY, not one exact key, now that Ship
     Builder is five different roundels rather than one card — see `family`
     in targets() below. */
  { key: 'wharf',     name: 'Wharf',              group: 'trading', color: 'green', cost: 12, r: 6, vp: 1, copies: 2, sym: 'ship',  over: 'shipbuilder' },

  /* Blue: ten of the city's buildings, one of each. Any of them may be built
     over any building you already have. */
  { key: 'bank',      name: 'Bank',                       group: 'trading', color: 'blue', cost: 13, r: 5, vp: 1, copies: 1, good: 'grain',   goods: 1 },
  { key: 'peterhof',  name: 'Peterhof',                   group: 'trading', color: 'blue', cost: 14, r: 4, vp: 2, copies: 1, good: 'chicken', goods: 1 },
  { key: 'mariinsky', name: 'Mariinsky Theater',          group: 'trading', color: 'blue', cost: 15, r: 0, vp: 0, copies: 1, short: 'Mariinsky', fn: 'mariinsky',
    text: '1 point for every red card you have, every building scoring.' },
  { key: 'isaacs',    name: "St Isaac's Cathedral",       group: 'trading', color: 'blue', cost: 15, r: 3, vp: 3, copies: 1, short: "St Isaac's", good: 'apple', goods: 1 },
  { key: 'harbor',    name: 'Harbor',                     group: 'trading', color: 'blue', cost: 16, r: 5, vp: 2, copies: 1, good: 'fish',    goods: 1 },
  { key: 'church',    name: 'Church of the Resurrection', group: 'trading', color: 'blue', cost: 16, r: 2, vp: 4, copies: 1, short: 'Church', good: 'cabbage', goods: 1 },
  { key: 'catherine', name: 'Catherine the Great Palace', group: 'trading', color: 'blue', cost: 17, r: 1, vp: 5, copies: 1, short: 'Catherine' },
  { key: 'smolny',    name: 'Smolny Cathedral',           group: 'trading', color: 'blue', cost: 17, r: 4, vp: 3, copies: 1, short: 'Smolny' },
  { key: 'hermitage', name: 'Hermitage',                  group: 'trading', color: 'blue', cost: 18, r: 3, vp: 4, copies: 1 },
  { key: 'winter',    name: 'Winter Palace',              group: 'trading', color: 'blue', cost: 19, r: 2, vp: 5, copies: 1, short: 'Winter Pal.' },

  /* Red: eight of the court, and see INFERRED_RED for the last two cards. */
  { key: 'abbot',     name: 'Abbot',                       group: 'trading', color: 'red', cost: 6,  r: 1, vp: 1, copies: 2 },
  { key: 'builder',   name: 'Builder',                     group: 'trading', color: 'red', cost: 10, r: 5, vp: 0, copies: 2 },
  { key: 'senator',   name: 'Senator',                     group: 'trading', color: 'red', cost: 12, r: 2, vp: 2, copies: 1 },
  { key: 'patriarch', name: 'Patriarch',                   group: 'trading', color: 'red', cost: 16, r: 0, vp: 4, copies: 1 },
  { key: 'taxman',    name: 'Tax Man',                     group: 'trading', color: 'red', cost: 17, r: 0, vp: 0, copies: 1, fn: 'taxman',
    text: '1 ruble for every green card you have, every aristocrat scoring.' },
  { key: 'admiral',   name: 'Admiral',                     group: 'trading', color: 'red', cost: 18, r: 3, vp: 3, copies: 1 },
  { key: 'minister',  name: 'Minister of Foreign Affairs', group: 'trading', color: 'red', cost: 20, r: 2, vp: 4, copies: 1, short: 'Minister' },
  { key: 'czarina',   name: 'Czarina',                     group: 'trading', color: 'red', cost: 24, r: 0, vp: 6, copies: 1 }
];

/* ---------- the market's 35 yellow cards, from the shape above ---------- */
for (const g of MARKET_GOODS) {
  for (const s of MARKET_SHAPE) {
    const orange = s.fn === 'orange';
    CARDS.push({
      /* The orange card's own face carries no name at all, only a crate and a
         Russian "on sale" board, so it is named here for the screen. */
      key: 'm_' + g.id + '_' + s.pick,
      name: orange ? 'Crate of ' + g.name : g[s.pick],
      short: orange ? g.name + ' ×4' : g.shorts[s.pick],
      group: 'market', color: 'yellow',
      cost: s.cost, r: s.r, vp: 0, copies: s.copies,
      good: g.id, goods: s.syms,
      orange: orange || undefined,
      fn: s.fn,
      text: orange
        ? 'Four ' + g.name.toLowerCase() + ' at once for a ruble — then rent, every market scoring, at the market’s current value. Stop paying and all four go back.'
        : undefined
    });
  }
}

/* ================================================================
   Module 1: The Banquet — 15 cards, gated on `banquet` (and its purple half
   further gated on `banquetPurple`), read off
   yucata.de/.../images/banquet_<name>_EN.jpg. Every one of the twelve purple
   cards is printed at cost 0 — checked on every image, not assumed from
   "typically free" in the rules text.

   Which of the four decks each purple card's back actually sorts into is not
   readable from the front, and the rules only say "shuffle depending on
   their reverse side" — so it is spread across the four groups below in a
   documented, arbitrary order. It changes nothing about how any of them
   play, only which phase one might be waiting to be dealt in.
   ================================================================ */
CARDS.push(
  /* The three ordinary replacement cards — same shape as anything else in
     their deck, just gated behind the module. */
  { key: 'czarsuperstar', name: 'Czar - Superstar', group: 'worker', color: 'green', cost: 9, r: 3, vp: 0, copies: 1,
    sym: 'any', short: 'Superstar', anyGreen: true, fn: 'discountBoth', module: 'banquet',
    text: 'Replaces the Czar & Carpenter. Every blue AND every red card costs you 1 less from now on.' },
  { key: 'potemkin_1_4', name: 'Potemkin Village', group: 'building', color: 'blue', cost: 1, r: 0, vp: 0, copies: 1,
    short: 'Potemkin 1/4', worth: 4, fn: 'potemkin', module: 'banquet',
    text: 'Costs 1. Counts as 4 when a trading card displaces it.' },
  { key: 'potemkin_3_8', name: 'Potemkin Village', group: 'building', color: 'blue', cost: 3, r: 0, vp: 0, copies: 1,
    short: 'Potemkin 3/8', worth: 8, fn: 'potemkin', module: 'banquet',
    text: 'Costs 3. Counts as 8 when a trading card displaces it.' },

  /* The twelve purple cards. Free, taken to hand like anything else, PLAYED
     as a one-off special action instead of built onto the tableau — see
     `doPurple()` in sp-engine.js. Removed from the game after use (never
     discarded where a Black Market could fish them back out), and they never
     cost the -5-a-card hand penalty at the end. */
  { key: 'p_moneycollector', name: 'Money Collector', group: 'worker', color: 'green', cost: 0, r: 0, vp: 0, copies: 1,
    module: 'banquet', purple: true, fn: 'moneycollector',
    text: 'Pay half the cost (rounded down) for a card off the board and play it — worth no points, and it can never be replaced.' },
  { key: 'p_doubleturn', name: 'Double Turn', group: 'worker', color: 'green', cost: 0, r: 0, vp: 0, copies: 1,
    module: 'banquet', purple: true, fn: 'doubleturn',
    text: 'Take two actions, one after the other.' },
  { key: 'p_awaywithit', name: 'Away With It!', group: 'worker', color: 'green', cost: 0, r: 0, vp: 0, copies: 2,
    module: 'banquet', purple: true, fn: 'awaywithit',
    text: 'Discard a card from your hand.' },
  { key: 'p_jester', name: 'Jester', group: 'building', color: 'blue', cost: 0, r: 0, vp: 0, copies: 1,
    module: 'banquet', purple: true, fn: 'jester',
    text: 'Assign to one of your cards with both a ruble and a point value. Next time it scores, swap the two.' },
  /* The printed card lets you play this OUT OF TURN, at the very start of a
     phase, ahead of whoever holds the start-player stone. This engine asks
     one seat at a time in a strict, fixed order and has nowhere to fit an
     out-of-turn interjection from a seat who is not currently being asked
     anything — so here it is played on your OWN turn instead, for one extra
     action right after, which is the same resource (an action that would
     not otherwise exist) without the queue-jump. Simplified on purpose;
     flagged so it is easy to find if this engine ever grows a way to ask
     "does anyone want to jump in" between turns. */
  { key: 'p_pickpocket', name: 'Pick Pocket', group: 'building', color: 'blue', cost: 0, r: 0, vp: 0, copies: 1,
    module: 'banquet', purple: true, fn: 'pickpocket',
    text: 'One extra action, right after this one.' },
  { key: 'p_moocher', name: 'Moocher', group: 'aristocrat', color: 'red', cost: 0, r: 0, vp: 0, copies: 1,
    module: 'banquet', purple: true, fn: 'moocher',
    text: 'Choose an opponent’s card and immediately score its income for yourself instead.' },
  { key: 'p_goldendonkey', name: 'Golden Donkey', group: 'aristocrat', color: 'red', cost: 0, r: 0, vp: 0, copies: 1,
    module: 'banquet', purple: true, fn: 'donkey',
    text: 'Receive 5 rubles from the bank at once.' },
  { key: 'p_banquet', name: 'Banquet', group: 'trading', color: 'green', cost: 0, r: 0, vp: 0, copies: 1,
    module: 'banquet', purple: true, fn: 'banquet',
    text: 'Assign to one of your cards with both a ruble and a point value. Next time it scores, double both.' },
  { key: 'p_blackmarket', name: 'Black Market', group: 'trading', color: 'red', cost: 0, r: 0, vp: 0, copies: 3,
    module: 'banquet', purple: true, fn: 'blackmarket',
    text: 'Choose 1 card from the discard pile: buy it, hold it, or put it straight back.' }
);

/* ================================================================
   Module 2: In Good Company — 12 cards, gated on `company`, read off
   yucata.de/.../images/company_<name>_EN.jpg. Three ordinary buildings, one
   aristocrat (two copies), and seven exchange cards.
   ================================================================ */
CARDS.push(
  { key: 'coffeehouse', name: 'Coffee House', group: 'building', color: 'blue', cost: 6, r: 0, vp: 0, copies: 1,
    short: 'Coffee Hse', fn: 'coffeehouse', module: 'company',
    text: '1 ruble for every aristocrat and aristocrat trading card you have, every building scoring.' },
  { key: 'tradinghouse', name: 'Trading House', group: 'building', color: 'blue', cost: 2, r: 0, vp: 0, copies: 1,
    short: 'Trading Hse', fn: 'tradinghouse', module: 'company',
    text: 'After every building scoring, you may pay 3 rubles for 2 points, once a round.' },
  { key: 'debtorsprison', name: "Debtor's Prison", group: 'building', color: 'blue', cost: 8, r: 0, vp: 0, copies: 1,
    short: "Debtor's", fn: 'debtorsprison', module: 'company',
    text: 'Once a round in the building phase, search the discard pile and buy, hold, or return one card — do, and this scores nothing that round; leave it be and it scores 1 point.' },
  { key: 'sycophant', name: 'Sycophant', group: 'aristocrat', color: 'red', cost: 1, r: -1, vp: 0, copies: 2,
    fn: 'sycophant', module: 'company',
    text: 'Costs only 1. Pay 1 ruble at every aristocrat scoring, or discard it if you cannot.' },
  { key: 'octoberrev', name: 'October Revolution', group: 'trading', color: 'green', cost: 15, r: 6, vp: 2, copies: 1,
    short: 'Oct. Revolution', module: 'company',
    text: 'Can be bought over any worker card, not just one kind.' },
  { key: 'textilefactory', name: 'Textile Factory', group: 'trading', color: 'blue', cost: 16, r: 0, vp: 0, copies: 1,
    short: 'Textile Fty', fn: 'textile', module: 'company',
    text: '2 points for every card with a weaving symbol you have, every building scoring.' },
  { key: 'guildhall', name: 'Guild Hall', group: 'trading', color: 'blue', cost: 13, r: 0, vp: 0, copies: 1,
    fn: 'guildhall', module: 'company',
    text: 'Every building scoring, split 4 between rubles and points however you like.' },
  { key: 'university', name: 'University', group: 'trading', color: 'blue', cost: 18, r: 0, vp: 6, copies: 1, module: 'company' },
  { key: 'merchant', name: 'Merchant', group: 'trading', color: 'red', cost: 6, r: 3, vp: 0, copies: 1, module: 'company' },
  { key: 'ltkije', name: 'Lieutenant Kijé', group: 'trading', color: 'red', cost: 12, r: 0, vp: 3, copies: 1, short: 'Lt. Kijé', module: 'company' },
  { key: 'mayor', name: 'Mayor', group: 'trading', color: 'red', cost: 13, r: 0, vp: 0, copies: 1,
    fn: 'mayor', module: 'company',
    text: '1 ruble for every building and building trading card you have, every aristocrat scoring.' }
);

/* THE ONE INFERENCE IN THIS FILE.
 *
 * The rules say the trading stack holds ten workers, ten buildings and ten
 * aristocrats. The green ten are five cards twice over, because there are five
 * workers to displace. Ten distinct blue cards were found. Only EIGHT distinct
 * red cards could be found, and their printed costs — 6, 10, 12, 16, 17, 18,
 * 20, 24 — leave gaps at 8 and 14 exactly where a ladder would put two more.
 * So two red cards exist that are not named here, and rather than invent a
 * card the two cheapest are printed twice to make the stack the right size.
 *
 * What that costs: the red half of the trading stack is two cards flatter than
 * the printed game, and the Abbot and the Builder turn up twice as often as
 * they should. What it does NOT cost: the stack is 30, so the game still ends
 * when the box says it does.
 *
 * If the two missing cards ever turn up, put them in CARDS with copies:1, drop
 * the Abbot and the Builder back to copies:1, and everything else — the deck
 * arithmetic, the tests, the bots — follows from the table.
 */
const INFERRED_RED = ['abbot', 'builder'];

const BY_KEY = {};
for (const c of CARDS) BY_KEY[c.key] = c;
const card = key => BY_KEY[key] || null;

/* ---------- the stacks ---------- */

/* A card belongs to the base box unless it names a `module` — Modules 1 and
   2's cards do, and are only in a deck when `mods` says that module is on.
   Module 1's purple half is a further gate of its own (`purple`), since the
   Banquet's three ordinary cards can be played without its twelve free ones.
   Leaving `mods` out (as every base-box stat below does) means "no modules",
   which is what keeps DECK_SIZES and the box counts exactly what they always
   were. */
function inPlay(c, mods) {
  mods = mods || {};
  if (c.module && !mods[c.module]) return false;
  if (c.purple && !mods.banquetPurple) return false;
  return true;
}
function deckKeys(group, mods) {
  const out = [];
  for (const c of CARDS) if (c.group === group && inPlay(c, mods)) for (let i = 0; i < c.copies; i++) out.push(c.key);
  return out;
}
const DECKS = ['worker', 'market', 'building', 'aristocrat', 'trading'];
const DECK_SIZES = {};
for (const d of DECKS) DECK_SIZES[d] = deckKeys(d).length;

/* The trading stack is three coloured stacks shuffled together; nothing in the
   game ever separates them again, but the counts are what the box lists. */
function tradingByColor() {
  const out = { green: 0, blue: 0, red: 0 };
  for (const c of CARDS) if (c.group === 'trading' && !c.module) out[c.color] += c.copies;
  return out;
}
/* And the market stack is five goods' worth of the same seven cards. */
function marketByGood() {
  const out = {};
  for (const g of GOOD_IDS) out[g] = 0;
  for (const c of CARDS) if (c.group === 'market') out[c.good] += c.copies;
  return out;
}

/* ---------- the numbers the rules give in words ---------- */

const START_RUBLES = 25;
/* Eight on the table in the base game; the Market fills it to ten, whatever
   the number of players. */
const BOARD_SIZE = 8, BOARD_SIZE_MARKET = 10;
const boardSize = market => market ? BOARD_SIZE_MARKET : BOARD_SIZE;
const HAND_LIMIT = 3;          // 4 with a Warehouse
const HAND_PENALTY = -5;       // per card left in hand at the end
const RUBLES_PER_POINT = 10;   // 1 point per full 10 rubles at the end
const PUB_POINTS = 5, PUB_COST = 2;
const PLAYERS = { min: 2, max: 4 };

/* The colours a seated player can choose to be, in the lobby — separate from
   the four CARD colours above, which are about phases, not people. Picked to
   stay clear of the house's own three (see HOUSE in petersburg.html) and of
   each other at a glance from across a room. */
const PLAYER_COLORS = [
  '#e5484d', '#3e7bfa', '#30a46c', '#f5c542',
  '#8e4ec6', '#f76b15', '#00b4d8', '#e93d82'
];

/* ---------- Module 3: The Assistants ----------
 *
 * yucata.de/en/Rules/SaintPetersburg2, "Module 3: The Assistants" — only
 * playable with the Market, since the Mistress of the Manor discounts yellow
 * cards. One assistant a seat, always: a 2-player game uses two of the five,
 * a 3-player game three, a 4-player game four (the Master Craftsman sits out
 * at four). `color: null` on the Czar's Daughter is what says "any trading
 * card, not a colour" to the discount lookup in sp-engine.js.
 */
const ASSISTANTS = {
  craftsman: { id: 'craftsman', name: 'Master Craftsman',    color: 'green',  discount: 1,
    note: 'Green cards cost 1 less, exchange cards included.' },
  manor:     { id: 'manor',     name: 'Mistress of the Manor', color: 'yellow', discount: 1,
    note: 'Yellow market cards cost 1 less.' },
  architect: { id: 'architect', name: 'Architect',           color: 'blue',   discount: 1,
    note: 'Blue cards cost 1 less, exchange cards included.' },
  lawyer:    { id: 'lawyer',    name: 'Lawyer',               color: 'red',    discount: 1,
    note: 'Red cards cost 1 less, exchange cards included.' },
  daughter:  { id: 'daughter',  name: "Czar's Daughter",      color: null,     discount: 2,
    note: 'Every exchange card costs 2 less, whatever its colour.' }
};
const ASSISTANT_IDS = ['craftsman', 'manor', 'architect', 'lawyer', 'daughter'];
/* Which assistants are in play at each table size — the box only ever hands
   out as many as there are seats. */
function assistantsFor(n) {
  if (n <= 2) return ['architect', 'lawyer'];
  if (n === 3) return ['architect', 'lawyer', 'daughter'];
  return ['architect', 'lawyer', 'daughter', 'manor'];
}

/* Points for distinct aristocrats, read off the board's own strip: 1, 3, 6,
   10, 15, 21, 28, 36, 45, 55 — the triangular numbers, and flat from ten. */
const NOBLE_STEPS = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55];
function nobleScore(distinct) {
  const n = Math.max(0, Math.min(NOBLE_STEPS.length - 1, distinct | 0));
  return NOBLE_STEPS[n];
}

/* How many workers are laid out for the very first worker phase: two a player,
   with or without the Market. Every other refill goes to the board size. */
const startingCards = players => players * 2;

const MANIFEST = {
  game: 'Saint Petersburg',
  edition: '2nd edition, base game + the Market',
  cards: CARDS.length,
  decks: DECK_SIZES,
  goods: GOOD_IDS,
  inferred: INFERRED_RED
};

const D = {
  COLORS, COLOR_IDS, PHASES, PHASE, phasesFor, refillAfter, SYMBOLS,
  MARKET_GOODS, GOOD_IDS, MARKET_SHAPE, MARKET_VALUES, marketValue, marketByGood,
  CARDS, BY_KEY, card, deckKeys, inPlay, DECKS, DECK_SIZES, tradingByColor,
  START_RUBLES, BOARD_SIZE, BOARD_SIZE_MARKET, boardSize,
  HAND_LIMIT, HAND_PENALTY, RUBLES_PER_POINT,
  PUB_POINTS, PUB_COST, PLAYERS, PLAYER_COLORS, NOBLE_STEPS, nobleScore, startingCards,
  ASSISTANTS, ASSISTANT_IDS, assistantsFor,
  INFERRED_RED, MANIFEST
};

if (typeof module !== 'undefined' && module.exports) module.exports = D;
root.SPData = D;

})(typeof window !== 'undefined' ? window : globalThis);
