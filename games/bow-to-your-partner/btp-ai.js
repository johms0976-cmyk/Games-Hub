'use strict';
/* Bow to Your Partner — the AI seats (West, North, East, and a stand-in for you
 * in tests).
 *
 * Your side (North, and the stand-in for you) follows with the reading play
 * (readPlay, 2026-11-06): it counts the suits each seat has shown out of and
 * weighs every card by its chance of taking the trick less what it costs. The
 * gangs keep the older floor play, so the fights' balance is unchanged. Partners
 * differ only in how they bid (the design rule: a partner never plays worse).
 * Both plays keep a floor that
 * the tests measure: it never takes a trick from a partner who is already
 * winning when it plays last, never ruffs with a trump that can't win when it
 * could throw a plain card, never wastes the Joker or right bower on a trick
 * its partner already has, and never lets a trick go when it plays last and
 * could take it.
 *
 * The AI sees only its own hand, the cards played so far and its own discards.
 * Your team's enhanced cards are read through E.K, so North plays them right;
 * a card it can't see is judged as a plain card.
 *
 *   bid(L, seat)      -> { t, s } or null
 *   discard(L, seat)  -> card to put back
 *   play(L, seat)     -> card
 *   gift(L, seat)     -> the card North hands you under Swing Your Partner
 *   nod(L)            -> Nan's strongest denomination, for Partner's Nod
 *   legacyPlay(L, seat) the original single-file game's card play, kept so
 *                     the tests can show what the floor fixed
 */
(function (root) {
  const E = (typeof module !== 'undefined' && module.exports) ? require('./btp-engine.js') : root.BtpEngine;
  const { ACTS, rankOf, team, partnerOf, K, kSuit, kIsTrump, kTrumpRank, kRank, kBeats, plainK, winnerOf } = E;

  /* How much a card costs to give up: plain cards by rank, trumps above them,
     the Joker most of all. Discards and throw-aways pick the cheapest. */
  function cost(L, seat, c) {
    const k = K(L, seat, c), trump = L.h.trump;
    if (c === 'JK') return 200;
    if (E.en(k, 'outcast')) return 1;          // it never wins, so it's the first card to throw
    if (kIsTrump(k, trump)) return 50 + kTrumpRank(k, trump);
    return kRank(k);
  }
  const cheapest = (L, seat, cards) => cards.slice().sort((a, b) => cost(L, seat, a) - cost(L, seat, b))[0];
  const dearest = (L, seat, cards) => cards.slice().sort((a, b) => cost(L, seat, b) - cost(L, seat, a))[0];

  /* Cards this seat cannot account for: not in its hand, not played this hand,
     not its own discards. */
  function unseen(L, seat) {
    const h = L.h, seen = new Set(h.hands[seat]);
    h.trick.forEach(c => c && seen.add(c));
    h.taken[0].concat(h.taken[1]).forEach(c => seen.add(c));
    if (h.contractor === seat) (h.discards || []).forEach(c => seen.add(c));
    return E.deckOf(L).filter(c => !seen.has(c));
  }
  function withCard(h, seat, c) { const t = h.trick.slice(); t[seat] = c; return t; }
  const leaderOf = (h, seat) => h.trick[h.leader] ? h.leader : seat;
  /* Seats still to play after this one in the current trick. */
  function after(h, seat) {
    const out = [];
    const d = h.dir === -1 ? 3 : 1;      // Honour Your Corner: play goes the other way round
    for (let p = (seat + d) % 4; p !== leaderOf(h, seat); p = (p + d) % 4) if (!h.trick[p] && p !== h.out) out.push(p);
    return out;
  }
  /* Nothing still out could beat this trick's best card if c is played. */
  function safe(L, seat, c, out) {
    const h = L.h, t = withCard(h, seat, c), ld = leaderOf(h, seat);
    const bs = winnerOf(t, ld, h.trump, L), best = K(L, bs, t[bs]);
    const led = kSuit(K(L, ld, t[ld]), h.trump);
    return !(out || unseen(L, seat)).some(u => kBeats(plainK(u), best, led, h.trump));
  }
  const wins = (L, seat, c) => { const h = L.h; return winnerOf(withCard(h, seat, c), leaderOf(h, seat), h.trump, L) === seat; };

  /* ---------------- card play ---------------- */
  function play(L, seat) {
    const h = L.h, legal = E.legalPlays(L, seat);
    if (legal.length === 1) return legal[0];
    if (h.misere) return misPlay(L, seat, legal);
    if (h.leader === null || !h.trick[h.leader]) return lead(L, seat, legal);
    if (api.READ[team(seat)] && !oddTrick(L)) return readPlay(L, seat, legal);
    return floorPlay(L, seat, legal);
  }

  /* Your side's card play (2026-11-06). The floor below treats every unseen
     trump as if the next opponent could ruff with it, so with an opponent still
     to play it threw the Joker over its partner's winning Ace, or ducked with a
     10 when its Ace was the top heart left. This reads the table instead: the
     suits each seat has shown out of, and how likely the seats still to play
     are to hold a card that beats the trick (from how many such cards are
     unseen and how many cards each holds). Each card is weighed as its chance of
     taking the trick for your side less what it costs to give up, so a low
     trump that almost surely holds beats the Joker that surely does, and the
     Ace that only a ruff can beat is played rather than kept.
     The gangs keep the floor's play, so their strength (and the fights'
     balance) is unchanged. */
  const READ = { 0: true, 1: false };
  const TUNE = {
    price: 0.3,           // a card's cost (cost() / 100) in tricks: the Joker over a low trump needs ~0.45 of a trick more safety
                          // (0.1 / 0.2 / 0.3 measured on the same frozen hands; 0.3 took the most tricks)
    loyal: 0.15           // taking a trick your partner is winning must save at least this much more
  };
  function oddTrick(L) {
    const h = L.h, k = K(L, h.leader, h.trick[h.leader]);
    // Reverse / Sanctuary: only the suit led counts, so ruffs and rank-reading don't apply
    return E.en(k, 'reverse') || E.en(k, 'sanctuary') || (L.call === 'reverse' && h.winners && h.winners.length === 0);
  }
  /* The suits each seat has shown out of this hand. */
  function voidsOf(L) {
    const h = L.h, v = [0, 1, 2, 3].map(() => new Set());
    const scan = (cards, leader) => {
      if (leader === null || leader === undefined || !cards[leader]) return;
      const led = kSuit(K(L, leader, cards[leader]), h.trump);
      for (let p = 0; p < 4; p++) {
        if (p === leader || !cards[p]) continue;
        const k = K(L, p, cards[p]), s = kSuit(k, h.trump);
        if (s !== led && s !== '#' && kSuit(E.resolveTwo(k, led, h.trump), h.trump) !== led) v[p].add(led);
      }
    };
    (h.played || []).forEach(t => scan(t.cards, t.leader));
    scan(h.trick, h.leader);
    return v;
  }
  /* The chance that m cards drawn from U hold none of k marked ones. */
  function none(U, m, k) {
    let p = 1;
    for (let i = 0; i < m; i++) { if (U - i <= 0) break; p *= Math.max(0, U - k - i) / (U - i); }
    return p;
  }
  /* The chance that one of `opps` (still to play) beats trick t. */
  function beatChance(L, seat, t, opps, pool, v) {
    const h = L.h, trump = h.trump, ld = h.leader;
    const bs = winnerOf(t, ld, trump, L), best = K(L, bs, t[bs]);
    const led = kSuit(K(L, ld, t[ld]), trump);
    let hold = 1;
    for (const p of opps) {
      const m = h.hands[p].length, can = pool.filter(x => !v[p].has(x.s)), U = can.length;
      const beats = x => kBeats(x.k, best, led, trump);
      const kO = can.filter(x => x.s !== led && beats(x)).length;
      let pb;
      if (v[p].has(led)) pb = 1 - none(U, m, kO);
      else {
        const nLed = can.filter(x => x.s === led).length, kF = can.filter(x => x.s === led && beats(x)).length;
        pb = (1 - none(U, m, kF)) + none(U, m, nLed) * (1 - none(U - nLed, m, kO));
      }
      hold *= 1 - Math.min(1, pb);
    }
    return 1 - hold;
  }
  function readPlay(L, seat, legal) {
    const h = L.h, trump = h.trump;
    const opps = after(h, seat).filter(p => team(p) !== team(seat));
    const cur = winnerOf(h.trick, h.leader, trump, L), ours = team(cur) === team(seat);
    const w = legal.filter(c => wins(L, seat, c)), under = legal.filter(c => !w.includes(c));
    if (!opps.length) return ours ? cheapest(L, seat, under.length ? under : legal) : cheapest(L, seat, w.length ? w : legal);
    const pool = unseen(L, seat).map(u => { const k = plainK(u); return { k, s: kSuit(k, trump) }; }), v = voidsOf(L);
    const price = c => TUNE.price * cost(L, seat, c) / 100;
    let pick = null;
    const weigh = (c, u) => { if (!pick || u > pick.u + 1e-9) pick = { c, u }; };
    if (under.length) {
      const duck = cheapest(L, seat, under);
      weigh(duck, (ours ? 1 - beatChance(L, seat, h.trick, opps, pool, v) : 0) - price(duck));
    }
    for (const c of w) weigh(c, 1 - beatChance(L, seat, withCard(h, seat, c), opps, pool, v) - price(c) - (ours && under.length ? TUNE.loyal : 0));
    return pick.c;
  }

  /* The floor: every seat's play before 2026-11-06, still the gangs'. */
  function floorPlay(L, seat, legal) {
    const h = L.h, trump = h.trump;
    const out = unseen(L, seat);
    const last = after(h, seat).length === 0;
    const cur = winnerOf(h.trick, h.leader, trump, L);
    const w = legal.filter(c => wins(L, seat, c));
    if (cur === partnerOf(seat)) {
      const under = legal.filter(c => !w.includes(c));
      if (last) return cheapest(L, seat, under.length ? under : legal);
      const led = kSuit(K(L, h.leader, h.trick[h.leader]), trump);
      const partnerSafe = !out.some(u => kBeats(plainK(u), K(L, cur, h.trick[cur]), led, trump));
      if (!partnerSafe) {
        const sure = w.filter(c => safe(L, seat, c, out));
        if (sure.length) return cheapest(L, seat, sure);
      }
      return cheapest(L, seat, under.length ? under : legal);
    }
    if (w.length) {
      if (last) return cheapest(L, seat, w);
      const sure = w.filter(c => safe(L, seat, c, out));
      return cheapest(L, seat, sure.length ? sure : w);
    }
    return cheapest(L, seat, legal);
  }

  function lead(L, seat, legal) {
    const h = L.h, trump = h.trump, out = unseen(L, seat);
    const hunt = sharpsHunt(L, seat, legal);
    if (hunt) return hunt;
    const ours = h.contractor !== null && team(h.contractor) === team(seat);
    const isT = c => kIsTrump(K(L, seat, c), trump);
    const reads = api.READ[team(seat)];
    const trumps = legal.filter(isT);
    let plain = legal.filter(c => !isT(c));
    if (reads && trump) {
      // your side (2026-11-06) keeps its plain leads out of suits an opponent has shown out of and can ruff
      const v = voidsOf(L), ruffer = s => [0, 1, 2, 3].some(p => team(p) !== team(seat) && p !== h.out && h.hands[p].length && v[p].has(s) && !v[p].has(trump));
      const clean = plain.filter(c => !ruffer(kSuit(K(L, seat, c), trump)));
      if (clean.length) plain = clean;
    }
    const sure = legal.filter(c => safe(L, seat, c, out));
    // among sure winners your side leads the cheapest (the trick is the same, and the Joker stays home)
    const top = cs => reads ? cheapest(L, seat, cs) : dearest(L, seat, cs);
    const sureT = sure.filter(isT), sureP = sure.filter(c => !isT(c));
    // a gang that leads trumps (2026-11-02) pulls yours when it's defending: its best trump first
    if (trump && !ours && h.contractor !== null && trumps.length && team(seat) === 1 && L.foe && L.foe.manner === 'trumper') return dearest(L, seat, trumps);
    if (trump && ours && trumps.length) {
      if (seat === h.contractor) {
        // draw trumps with sure winners, cash a sure side card, else push a trump
        if (sureT.length) return top(sureT);
        if (sureP.length) return top(sureP);
        if (trumps.length >= 2 || !plain.length) return dearest(L, seat, trumps);
        return cheapest(L, seat, plain);
      }
      // the contractor's partner leads back the suit they bid
      if (sureT.length) return top(sureT);
      return cheapest(L, seat, trumps);
    }
    if (sureP.length) return top(sureP);
    const aces = plain.filter(c => rankOf(c) === 'A');
    if (aces.length) return aces[0];
    if (plain.length) {
      // the cheapest card of the longest plain suit
      const by = {};
      plain.forEach(c => { const s = kSuit(K(L, seat, c), trump); (by[s] = by[s] || []).push(c); });
      const long = Object.values(by).sort((a, b) => b.length - a.length)[0];
      return cheapest(L, seat, long);
    }
    return sure.length ? top(sure) : cheapest(L, seat, legal);
  }

  /* ---------------- bidding ---------------- */
  /* Tricks this hand is worth in suit s (or NT), plus a share from partner. Your
     team's enhanced cards count as they will play. */
  function estimate(hand, s, act, L, seat) {
    const trump = s === 'NT' ? null : s, A = ACTS[act];
    let est = 0, nTrump = 0;
    for (const c of hand) {
      const k = L ? K(L, seat, c) : plainK(c);
      if (c === 'JK') { est += 1; if (trump) nTrump++; continue; }
      const v = kRank(k);
      if (trump && kIsTrump(k, trump)) {
        nTrump++;
        const tr = kTrumpRank(k, trump);
        est += tr >= 99 ? 0.9 : tr === 98 ? 0.8 : v === 14 ? 0.7 : v === 13 ? 0.45 : v === 12 ? 0.3 : 0.2;
      } else if (trump) {
        est += v === 14 ? 0.65 : v === 13 ? 0.2 : 0;
      } else {
        est += v === 14 ? 0.75 : v === 13 ? 0.35 : v === 12 ? 0.1 : 0;
      }
      if (E.en(k, 'giant')) est += 0.15;
    }
    if (trump) est += Math.max(0, nTrump - Math.ceil(A.hand / 3)) * 0.3;
    return est + A.hand * SHARE[act];
  }
  /* The tricks a seat counts on from its partner, per card in the hand, by act
     (tuned on redeals and made rates: tests/measure.js). */
  const SHARE = { 1: 0.2, 2: 0.3, 3: 0.4 };
  /* How sure a seat must be before it bids: Nan (and you, as the stand-in) are
     steady; West and East bid a little bolder, so more intents come up. */
  const MARGIN = { 0: 0.15, 1: -0.15 };
  /* The cheapest legal bid in this seat's best denomination, or a pass. North,
     like every AI, never outbids its own partner. */
  function bid(L, seat) {
    const h = L.h;
    if (h.high && team(h.high.seat) === team(seat)) return null;
    if (E.bossRule(L) === 'wallflowers' && team(seat) === 1) return null;      // the Wallflowers never bid
    const legal = E.legalBids(L);
    let best = null;
    const mis = legal.find(b => b.s === 'MIS'), omis = legal.find(b => b.s === 'OMIS');
    // open misère is judged on the hand as dealt (no help from the kitty) and never with the Joker
    if (omis && !h.hands[seat].includes('JK') && Object.values(misCardDanger(h.hands[seat], E.actOf(L))).reduce((x, y) => x + y, 0) <= OPEN_SAFE[team(seat)]) return { t: 0, s: 'OMIS' };
    const hustling = E.bossRule(L) === 'hustlers' && team(seat) === 1;
    const misLover = team(seat) === 1 && L.foe && L.foe.manner === 'misere';
    if (mis && misDanger(h.hands[seat], E.actOf(L)) <= (hustling ? api.HUSTLE : (MIS_SAFE_ACT[E.actOf(L)] || MIS_SAFE)[team(seat)] * (misLover ? 2.5 : 1))) return { t: 0, s: 'MIS' };
    for (const b of legal) {
      if (b.s === 'MIS' || b.s === 'OMIS') continue;
      const e = estimate(h.hands[seat], b.s, E.actOf(L), L, seat);
      // the Showboat (2026-11-02) bids on half a trick less than a hand is worth
      // a gang's manner (2026-11-02): bold gangs bid half a trick short, cagey ones want half a trick to spare
      const manner = team(seat) === 1 && L.foe ? L.foe.manner : null;
      if (e < b.t + MARGIN[team(seat)] - (seat === 2 && L.partnerStyle === 'bold' ? 0.5 : 0) - (manner === 'bold' ? 0.6 : 0) + (manner === 'cagey' ? 0.5 : 0)) continue;
      const slack = e - b.t;
      if (!best || slack > best.slack + 0.25 || (Math.abs(slack - best.slack) <= 0.25 && b.v < best.b.v)) best = { b, slack };
    }
    if (!best && E.mustBid(L, seat)) {
      // made to bid (the Wallflowers): the lowest level, in the denomination this hand is best in
      const low = legal.filter(b => b.s !== 'MIS' && b.s !== 'OMIS'), t0 = Math.min(...low.map(b => b.t));
      let pick = null;
      for (const b of low.filter(b => b.t === t0)) { const e = estimate(h.hands[seat], b.s, E.actOf(L), L, seat); if (!pick || e > pick.e) pick = { b, e }; }
      return { t: pick.b.t, s: pick.b.s };
    }
    return best ? { t: best.b.t, s: best.b.s } : null;
  }
  /* Partner's Nod: the denomination this seat's hand is best in, or null if
     nothing is worth a nod. */
  function nod(L, seat) {
    seat = seat === undefined ? 2 : seat;
    const h = L.h, A = ACTS[E.actOf(L)], denoms = Object.keys(A.bids[Object.keys(A.bids)[0]]);
    let best = null;
    for (const s of denoms) {
      const e = estimate(h.hands[seat], s, E.actOf(L), L, seat) - A.hand * SHARE[E.actOf(L)];
      if (!best || e > best.e) best = { s, e };
    }
    return best && best.e >= A.hand * 0.3 ? best.s : null;
  }

  /* The contractor keeps its trumps and aces and throws the cheapest card. */
  function discard(L, seat) {
    const h = L.h;
    if (h.misere && seat === h.contractor) return misWorst(h.hands[seat], E.actOf(L));
    return cheapest(L, seat, h.hands[seat]);
  }

  /* ---------------- the Act II bosses ---------------- */
  /* The Card Sharps can see the cards dealt to you from your own (the boss's
     public rule). On lead they go after one: the highest card they hold that
     beats a seeded card in its own suit, so that if you have to follow with it,
     it's theirs. They only know your seeded cards, not the rest of your hand. */
  function sharpsHunt(L, seat, legal) {
    const h = L.h, trump = h.trump;
    if (E.bossRule(L) !== 'sharps' || team(seat) !== 1 || h.misere || (L.buffs || []).includes('tell')) return null;    // their signals are known
    let best = null;
    for (const c0 of (h.seeded || []).filter(c => h.hands[0].includes(c))) {
      const k0 = K(L, 0, c0), s0 = kSuit(k0, trump);
      const catchers = legal.filter(c => kSuit(K(L, seat, c), trump) === s0 && kBeats(K(L, seat, c), k0, s0, trump));
      if (!catchers.length) continue;
      const pick = dearest(L, seat, catchers), worth = cost(L, 0, c0);
      if (!best || worth > best.worth) best = { pick, worth };
    }
    return best ? best.pick : null;
  }

  /* ---------------- misère ---------------- */
  /* How likely a hand is to be forced to win a trick: each card scores by how
     high it sits above the low cards that shelter it in its suit, and the Joker
     (which wins any trick it is in) scores most. The kitty lets the contractor
     throw the worst card, so it is left out. */
  const mrank = c => c === 'JK' ? 100 : E.RANKV[rankOf(c)];
  function misCardDanger(hand, act) {
    const lows = act ? ACTS[act].low : null;
    const by = {}, out = {};
    hand.forEach(c => { const s = c === 'JK' ? '*' : E.suitOf(c); (by[s] = by[s] || []).push(c); });
    for (const s in by) {
      if (s === '*') { by[s].forEach(c => out[c] = 8); continue; }
      by[s].sort((a, b) => mrank(a) - mrank(b)).forEach((c, i) => { out[c] = Math.max(0, mrank(c) - ((lows && lows[s] ? lows[s] : 9) + 1.6 * i)); });
    }
    return out;
  }
  function misDanger(hand, act) {
    const d = Object.values(misCardDanger(hand, act)).sort((a, b) => b - a);
    const kitty = act ? E.deckFor(act).length - 4 * ACTS[act].hand : 1;   // the contractor throws this many
    return d.slice(kitty).reduce((a, b) => a + b, 0);
  }
  function misWorst(hand, act) {
    const d = misCardDanger(hand, act);
    return hand.slice().sort((a, b) => d[b] - d[a] || mrank(b) - mrank(a))[0];
  }
  /* How safe a hand must be before a seat bids misère: Nan (and you, as the
     stand-in) are steady, West and East bolder (tests/measure.js). */
  const MIS_SAFE = { 0: 0.25, 1: 0.5 };
  // Act III: ten cards and a 3-card kitty, so the danger sum runs higher. Measured (2, 4): misère in ~10% of hands, ~70% made
  const MIS_SAFE_ACT = { 1: MIS_SAFE, 2: MIS_SAFE, 3: { 0: 2, 1: 4 } };
  // Open misère (Act III, 500): judged on the raw hand, no kitty. Measured: the sum is ≥ 8 in every
  // hand dealt; (10, 12) gives an open misère in ~2% of hands, about three in four made
  const OPEN_SAFE = { 0: 10, 1: 12 };
  // The Hustlers (an Act II boss) bid misère whenever their hand is at most this exposed.
  /* Playing a misère: the contractor ducks every trick it can; the defenders
     try to leave the contractor holding the winning card. */
  function misPlay(L, seat, legal) {
    const h = L.h, C = h.contractor, led = E.ledSuit(L);
    const noJoker = cs => { const x = cs.filter(c => c !== 'JK'); return x.length ? x : cs; };
    const low = cs => cs.slice().sort((a, b) => mrank(a) - mrank(b))[0];
    const high = cs => cs.slice().sort((a, b) => mrank(b) - mrank(a))[0];
    const winsNow = c => wins(L, seat, c);
    if (!led && seat !== C && h.open && h.trickNo >= 1) {
      // open misère: the contractor's hand is on the table. Lead a card from a suit where
      // the contractor's lowest card is above it, so they have to go over
      const open = h.hands[C], best = [];
      for (const c of noJoker(legal)) {
        const s0 = E.suitOf(c), theirs = open.filter(x => x !== 'JK' && E.suitOf(x) === s0);
        if (theirs.length && mrank(low(theirs)) > mrank(c)) best.push(c);
      }
      if (best.length) return low(best);
    }
    if (!led && seat !== C) {
      // defending: lead low in a suit the contractor still holds, so they must duck under it
      const voids = new Set((h.played || []).filter(t => t.cards[C] && E.effSuit(t.cards[C], null) !== E.effSuit(t.cards[t.leader], null)).map(t => E.effSuit(t.cards[t.leader], null)));
      const live = noJoker(legal).filter(c => !voids.has(E.suitOf(c)));
      return low(live.length ? live : noJoker(legal));
    }
    if (!led) return low(noJoker(legal));                         // lead your lowest card
    if (seat === C) {
      const safe = legal.filter(c => !winsNow(c));
      if (safe.length) return high(noJoker(safe));               // shed the highest card that still ducks
      return low(noJoker(legal));                               // forced over: as low as possible
    }
    const cur = winnerOf(h.trick, h.leader, h.trump, L), cPlayed = !!h.trick[C];
    if (cPlayed && cur === C) {                                  // keep the contractor on top
      const under = legal.filter(c => !winsNow(c));
      return under.length ? high(under) : low(legal);
    }
    if (cPlayed) return high(legal);                             // the trick is lost to them anyway: shed high
    return low(noJoker(legal));                                  // the contractor plays after you: go low
  }
  /* Swing Your Partner: North hands you its most useful card. */
  function gift(L, seat) { return dearest(L, seat, L.h.hands[seat]); }

  /* ---------------- the original game's card play ---------------- */
  function legacyPlay(L, seat) {
    const h = L.h, trump = h.trump, all = E.legalPlays(L, seat), legal = h.hands[seat].filter(c => all.includes(c));
    const led = E.ledSuit(L);
    if (!led) { const a = legal.filter(c => rankOf(c) === 'A'); return a.length ? a[0] : legal[legal.length - 1]; }
    const partnerWinning = winnerOf(h.trick, h.leader, trump, L) === partnerOf(seat);
    const follow = legal.filter(c => kSuit(K(L, seat, c), trump) === led);
    if (follow.length) {
      if (partnerWinning) return follow[0];
      const w = follow.filter(c => wins(L, seat, c));
      return w.length ? w[0] : follow[0];
    }
    if (partnerWinning) return legal[0];
    const t = legal.filter(c => trump && kIsTrump(K(L, seat, c), trump));
    return t.length ? t[0] : legal[0];
  }

  const api = { READ, TUNE, readPlay, floorPlay, voidsOf, beatChance, misCardDanger, MIS_SAFE_ACT, OPEN_SAFE, HUSTLE: 6, sharpsHunt, MARGIN, SHARE, MIS_SAFE, misDanger, misWorst, misPlay, cost, cheapest, dearest, unseen, after, safe, wins, play, lead, estimate, bid, nod, discard, gift, legacyPlay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BtpAI = api;
})(typeof window !== 'undefined' ? window : this);
