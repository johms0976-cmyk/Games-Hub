'use strict';
/* The house of Saint Petersburg — the players who fill the empty chairs.
 *
 * They decide from the two views a person gets and nothing else: `publicView()`
 * and their own `seatView(id)`. That is not politeness. This game keeps two
 * things secret — the cards behind somebody's hand and what is in their purse —
 * and a house player that could read either would be an opponent nobody can
 * speculate against, which is the whole middle of the game gone. The public
 * view simply does not carry another player's rubles, so the house cannot read
 * a purse even by accident; `tests/engine.js` greps this file for any reach
 * into `g.players`, `g.decks`, `g.top`, `g.bottom` or the queue.
 *
 * The valuation is deliberately one number in one place: **what is this card
 * worth, in victory points, between now and the end of the game** — minus what
 * it costs, converted at the same exchange rate. Everything else (which card to
 * build over, how many points to buy at the pub, whether to hold a card back)
 * falls out of that rather than being its own table of weights, so there is one
 * thing to tune and one thing to be wrong.
 */
(function (root) {

const D = (typeof module !== 'undefined' && module.exports) ? require('./sp-data.js') : root.SPData;

/* How many more times each colour will be scored. The game ends when a stack
   runs out, and the stacks go down by roughly the number of cards the table
   takes off the board in a round, so this is read off the thinnest stack
   rather than guessed from the round number. Floored at one: there is always
   this round's scoring still to come. */
function roundsLeft(pub) {
  const players = pub.players.length;
  const perRound = Math.max(4, players * 2.2);        // cards the board loses in a round
  let thin = Infinity;
  for (const k of Object.keys(pub.decks)) thin = Math.min(thin, pub.decks[k]);
  const byDeck = thin / perRound;
  const left = pub.lastRound ? 0.4 : Math.min(8, byDeck);
  return Math.max(0.5, left);
}

/* What a ruble is worth in points. During the game money compounds — it buys
   the card that pays for the next one — so it is worth much more than the flat
   1-point-per-10 it is cashed in for at the end. On the last round it is worth
   exactly what the rulebook pays for it. */
function rubleVp(left) { return left > 1.2 ? 0.22 : (left > 0.6 ? 0.14 : 0.10); }

/* How much game has to be left before holding a card back is worth the five
   points it costs if it is still there at the end. Measured rather than
   chosen: at 1.2 rounds the house strands about a third of a card a player,
   and at 1.8 it barely strands any. */
const HOLD_LEFT = 1.8;

const count = (me, color) => me.area[color].length;

/* ---------- the market ----------
 *
 * One function decides everything the house does about the market: what a
 * track position is worth in points. Buying a card, paying rent on an orange
 * crate and naming the Czar's good are all "how many points does this move me",
 * so none of them needs a rule of its own.
 */
function vpFor(counts, mine, val) {
  if (mine <= 0) return 0;
  const rows = counts.filter(c => c > 0);
  const top = rows.reduce((m, c) => Math.max(m, c), 0);
  if (mine >= top) return val[0];                    // a tie for first takes first
  /* Second place exists only when somebody is alone in front. */
  if (counts.filter(c => c === top).length > 1) return 0;
  const rest = rows.filter(c => c < top);
  const next = rest.reduce((m, c) => Math.max(m, c), 0);
  return mine === next ? val[1] : 0;
}

/* What moving `add` further up one good's track is worth, per market scoring.
   Hedged, because everybody else is moving too and this reads the board as it
   stands rather than as it will be. */
function marketGain(good, add, me, pub) {
  if (!pub.market || !good) return 0;
  const val = pub.marketValue;
  const others = pub.players.filter(q => q.id !== me.id).map(q => (q.goods && q.goods[good]) || 0);
  const mine = (me.goods && me.goods[good]) || 0;
  const now = vpFor(others.concat([mine]), mine, val);
  const then = vpFor(others.concat([mine + add]), mine + add, val);
  return (then - now) * 0.75;
}

/* Which good the Czar should be declared to be: the one where one more roundel
   buys the most, and failing that the one nobody has touched. */
function bestGood(me, pub, choices) {
  let best = choices[0], bestV = -Infinity;
  for (const g of choices) {
    const v = marketGain(g, 1, me, pub) * 10 -
      pub.players.reduce((n, q) => n + ((q.goods && q.goods[g]) || 0), 0);
    if (v > bestV) { bestV = v; best = g; }
  }
  return best;
}
const distinctNobles = me => new Set(me.area.red.map(i => i.key)).size;

/* The marginal worth of one more DIFFERENT aristocrat: going from k kinds to
   k+1 is worth exactly k+1 points, and that is the biggest single number in
   the game by the time anyone has five of them. */
function nobleBonus(me, key) {
  if (me.area.red.some(i => i.key === key)) return 0;
  const k = distinctNobles(me);
  return D.nobleScore(k + 1) - D.nobleScore(k);
}

/* What owning this card is worth from here to the end, in points. */
function worth(c, me, left, pub) {
  const rv = rubleVp(left);
  let v = c.vp * left + c.r * left * rv;

  /* Market roundels: worth whatever they move you up the track, every market
     phase from here on. The '?' is worth the best good still in the supply. */
  if (pub && pub.market && c.good) {
    const good = c.good === 'any' ? (pub.wilds.length ? bestGood(me, pub, pub.wilds) : null) : c.good;
    if (good) v += marketGain(good, c.goods, me, pub) * left;
  }

  switch (c.fn) {
    case 'mariinsky':   v += (count(me, 'red') + 1) * left; break;
    case 'taxman':      v += count(me, 'green') * left * rv; break;
    case 'observatory': v += left; break;                    // the printed point, once a round
    /* Five points a round for ten rubles, when there are ten rubles spare. */
    case 'pub':         v += D.PUB_POINTS * left * (1 - D.PUB_COST * rv) * 0.7; break;
    case 'warehouse':   v += 1.2; break;                     // a fourth card to speculate with
    case 'potemkin':    v += 6 * rv * 0.5; break;            // cheap now, worth six to knock down
    case 'discountBlue':
    case 'discountRed':  v += left * 1.1 * rv; break;         // about a card a round, a ruble off
    case 'discountBoth': v += left * 2.2 * rv; break;         // Module 1's Czar-Superstar: both at once
    /* An orange crate is four roundels for a ruble and then rent for the rest
       of the game, at the market's rising value. The roundels are already in
       `v` above; this is the rent. */
    case 'orange':      v -= (pub ? pub.marketValue[0] : 3) * left * rubleVp(left); break;
  }
  if (c.anyGreen) v += 0.8;                                   // any green trading card fits over him
  if (c.color === 'red') v += nobleBonus(me, c.key);
  return v;
}

/* Net worth of an offer: what it brings in, less what it costs, less whatever
   it is built over. */
function net(o, me, left, lost, pub) {
  const c = D.card(o.key);
  return worth(c, me, left, pub) - o.price * rubleVp(left) - (lost || 0);
}

/* ---------- the four questions ---------- */

function answer(g, prompt) {
  const pub = g.publicView();
  /* The two views a person gets, and nothing else. The public record carries
     what this player has built — which the whole room can see — and the seat
     view carries the hand and the prices only this player pays. */
  const seen = pub.players.find(p => p.id === prompt.seat) || {};
  const me = Object.assign({}, seen, g.seatView(prompt.seat));
  const pick = choose(prompt.t, pub, me, prompt);
  return { t: prompt.t, pick };
}

function choose(kind, pub, me, prompt) {
  const opts = me.prompt ? me.prompt.options : [];
  if (!opts.length) return null;
  if (kind === 'turn') return turn(pub, me, opts);
  if (kind === 'trade') return trade(pub, me, opts);
  if (kind === 'pub') return pubPoints(pub, me, opts);
  if (kind === 'obs') return observe(pub, me, opts);
  if (kind === 'wild') return bestGood(me, pub, opts);
  if (kind === 'upkeep') return upkeep(pub, me, opts);
  if (kind === 'tradinghouse') return tradingHousePoints(pub, me, opts);
  if (kind === 'guildhall') return guildHallSplit(pub, me, opts);
  /* Module 1's follow-up prompts (which card to assign a Jester to, which
     opponent's card to mooch, and so on) are rare, low-stakes choices next
     to the four kinds above — answering with the first legal option keeps
     the house from ever stalling on one without pretending to weigh it. */
  return opts[0];
}

/* Like the pub, but a better rate — 3 rubles for 2 points — and capped at
   once a round rather than five times. */
function tradingHousePoints(pub, me, opts) {
  const left = roundsLeft(pub);
  const reserve = left < 1.2 ? 0 : Math.round(6 + 6 * Math.min(1, left / 4));
  const spare = Math.max(0, me.rubles - reserve);
  const want = Math.floor(spare / 3);
  let best = '0';
  for (const o of opts) if (+o <= want && +o > +best) best = o;
  return best;
}

/* Four points of income, split however you like: take it all in rubles while
   a ruble is worth more than a point, all in points once it is not. */
function guildHallSplit(pub, me, opts) {
  const rv = rubleVp(roundsLeft(pub));
  return rv > 1 ? opts[opts.length - 1] : opts[0];
}

function turn(pub, me, opts) {
  const left = roundsLeft(pub);
  const rv = rubleVp(left);
  const has = o => opts.includes(o);

  /* The opening: two workers each and no choice about it. They all pay the
     same three rubles, so the cheapest is strictly the best one. */
  if (pub.first) {
    let best = null, bestPrice = Infinity;
    for (const o of me.board) {
      if (!has('buy:' + o.uid)) continue;
      if (o.price < bestPrice) { bestPrice = o.price; best = o; }
    }
    return best ? 'buy:' + best.uid : 'pass';
  }

  const offers = me.board.concat(me.hand);
  let bestBuy = null, bestBuyV = 0;
  for (const o of offers) {
    const playable = o.row === 'hand' ? has('play:' + o.uid) : has('buy:' + o.uid);
    if (!playable || o.price == null) continue;
    /* Building over something costs its income as well as its price. */
    let lost = 0;
    const c = D.card(o.key);
    if (c.group === 'trading') lost = cheapestLoss(me, c, left, pub);
    /* A card in hand is already paid for in board position, and leaving it
       there costs five points at the end. */
    const v = net(o, me, left, lost, pub) + (o.row === 'hand' ? 5 * (left < HOLD_LEFT ? 1 : 0.3) : 0);
    if (v > bestBuyV) { bestBuyV = v; bestBuy = o; }
  }

  /* Taking a card in hand is free and buys a round's thinking time, but every
     one left there at the end is minus five. Worth it for something expensive
     that is worth having and cannot be paid for yet — never in the last round. */
  let bestHold = null, bestHoldV = 0;
  if (left > HOLD_LEFT) for (const o of me.board) {
    if (!has('hand:' + o.uid)) continue;
    const c = D.card(o.key);
    const lost = c.group === 'trading' ? cheapestLoss(me, c, left, pub) : 0;
    const v = worth(c, me, left, pub) - o.price * rv - lost;
    /* Only interesting if it is out of reach right now — otherwise buy it. */
    if (v > bestHoldV && o.price > me.rubles) { bestHoldV = v; bestHold = o; }
  }

  if (bestBuy && bestBuyV >= bestHoldV * 0.8) return (bestBuy.row === 'hand' ? 'play:' : 'buy:') + bestBuy.uid;
  if (bestHold) return 'hand:' + bestHold.uid;

  /* The observatory: a free look at a stack, worth taking when nothing on the
     board is worth buying. It costs this round's point, so only when the board
     is genuinely dead. */
  const obs = opts.filter(o => o.slice(0, 4) === 'obs:');
  if (obs.length && !bestBuy) {
    /* The stack this player most wants to see more of. */
    const want = { worker: 0.5, building: 1, aristocrat: 1.2, trading: 0.9 };
    obs.sort((a, b) => want[b.slice(4)] - want[a.slice(4)]);
    return obs[0];
  }
  return 'pass';
}

/* What the cheapest thing this trading card could be built over is worth —
   the income the table gives up by covering it. */
function cheapestLoss(me, c, left, pub) {
  const col = me.area ? me.area[c.color] : null;
  if (!col || !col.length) return 0;
  let worst = Infinity;
  for (const inst of col) {
    const t = D.card(inst.key);
    if (t.group === 'trading') continue;
    worst = Math.min(worst, worth(t, me, left, pub));
  }
  return worst === Infinity ? 0 : worst;
}

/* Which card to build over: the one where the money saved most outweighs the
   income given up. */
function trade(pub, me, opts) {
  const left = roundsLeft(pub);
  const rv = rubleVp(left);
  const list = (me.prompt && me.prompt.targets) || [];
  let best = opts[0], bestV = -Infinity;
  for (const t of list) {
    if (!opts.includes(t.uid)) continue;
    const c = D.card(t.key);
    const v = -t.price * rv - worth(c, me, left, pub);
    if (v > bestV) { bestV = v; best = t.uid; }
  }
  return best;
}

/* Two rubles a point is a better rate than the ten a point money is cashed in
   for, so the pub is always worth using — but a purse spent here is a card not
   bought next round. Keep a float until the end is in sight, then empty it. */
function pubPoints(pub, me, opts) {
  const left = roundsLeft(pub);
  const reserve = left < 1.2 ? 0 : Math.round(6 + 6 * Math.min(1, left / 4));
  const spare = Math.max(0, me.rubles - reserve);
  const want = Math.floor(spare / D.PUB_COST);
  let best = '0';
  for (const o of opts) if (+o <= want && +o > +best) best = o;
  return best;
}

/* Rent on an orange crate. Pay it only while the four roundels it is holding
   up are still buying a place on the track — an orange card whose good has
   been overtaken is a standing order for nothing. */
function upkeep(pub, me, opts) {
  if (!opts.includes('pay')) return 'drop';
  const left = roundsLeft(pub);
  const rent = (me.prompt && me.prompt.rent) || pub.marketValue[0];
  const card = me.prompt && me.prompt.card ? D.card(me.prompt.card.key) : null;
  const good = card && card.good;
  if (!good) return 'drop';
  const val = pub.marketValue;
  const others = pub.players.filter(q => q.id !== me.id).map(q => (q.goods && q.goods[good]) || 0);
  const mine = (me.goods && me.goods[good]) || 0;
  const keeping = vpFor(others.concat([mine]), mine, val) -
                  vpFor(others.concat([mine - 4]), mine - 4, val);
  return keeping > rent * rubleVp(left) ? 'pay' : 'drop';
}

/* The observatory has turned a card up. Buy it if it is worth buying, hold it
   if it is worth holding, otherwise it goes away. */
function observe(pub, me, opts) {
  const left = roundsLeft(pub);
  const o = me.pending;
  if (!o) return opts[0];
  const c = D.card(o.key);
  const lost = c.group === 'trading' ? cheapestLoss(me, c, left, pub) : 0;
  const v = worth(c, me, left, pub) - (o.price || 0) * rubleVp(left) - lost;
  if (opts.includes('buy') && v > 0) return 'buy';
  if (opts.includes('hand') && left > HOLD_LEFT && v > 0) return 'hand';
  return 'discard';
}

const B = { answer, worth, roundsLeft, rubleVp, nobleBonus, marketGain, vpFor, bestGood };
if (typeof module !== 'undefined' && module.exports) module.exports = B;
root.SPBots = B;

})(typeof window !== 'undefined' ? window : globalThis);
