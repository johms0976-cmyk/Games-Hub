'use strict';
/* Bow to Your Partner — the AI seats (West, North, East, and a stand-in for you
 * in tests).
 *
 * Every seat uses the same card play; a partner differs only in how it bids
 * (the design rule: a partner never plays worse). The play keeps a floor that
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
    const h = L.h, trump = h.trump, legal = E.legalPlays(L, seat);
    if (legal.length === 1) return legal[0];
    if (h.misere) return misPlay(L, seat, legal);
    if (h.leader === null || !h.trick[h.leader]) return lead(L, seat, legal);
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
    const trumps = legal.filter(isT), plain = legal.filter(c => !isT(c));
    const sure = legal.filter(c => safe(L, seat, c, out));
    const sureT = sure.filter(isT), sureP = sure.filter(c => !isT(c));
    if (trump && ours && trumps.length) {
      if (seat === h.contractor) {
        // draw trumps with sure winners, cash a sure side card, else push a trump
        if (sureT.length) return dearest(L, seat, sureT);
        if (sureP.length) return dearest(L, seat, sureP);
        if (trumps.length >= 2 || !plain.length) return dearest(L, seat, trumps);
        return cheapest(L, seat, plain);
      }
      // the contractor's partner leads back the suit they bid
      if (sureT.length) return dearest(L, seat, sureT);
      return cheapest(L, seat, trumps);
    }
    if (sureP.length) return dearest(L, seat, sureP);
    const aces = plain.filter(c => rankOf(c) === 'A');
    if (aces.length) return aces[0];
    if (plain.length) {
      // the cheapest card of the longest plain suit
      const by = {};
      plain.forEach(c => { const s = kSuit(K(L, seat, c), trump); (by[s] = by[s] || []).push(c); });
      const long = Object.values(by).sort((a, b) => b.length - a.length)[0];
      return cheapest(L, seat, long);
    }
    return sure.length ? dearest(L, seat, sure) : cheapest(L, seat, legal);
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
    if (L.boss === 'wallflowers' && team(seat) === 1) return null;      // the Wallflowers never bid
    const legal = E.legalBids(L);
    let best = null;
    const mis = legal.find(b => b.s === 'MIS'), omis = legal.find(b => b.s === 'OMIS');
    // open misère is judged on the hand as dealt (no help from the kitty) and never with the Joker
    if (omis && !h.hands[seat].includes('JK') && Object.values(misCardDanger(h.hands[seat], L.act)).reduce((x, y) => x + y, 0) <= OPEN_SAFE[team(seat)]) return { t: 0, s: 'OMIS' };
    const hustling = L.boss === 'hustlers' && team(seat) === 1;
    if (mis && misDanger(h.hands[seat], L.act) <= (hustling ? api.HUSTLE : (MIS_SAFE_ACT[L.act] || MIS_SAFE)[team(seat)])) return { t: 0, s: 'MIS' };
    for (const b of legal) {
      if (b.s === 'MIS' || b.s === 'OMIS') continue;
      const e = estimate(h.hands[seat], b.s, L.act, L, seat);
      if (e < b.t + MARGIN[team(seat)]) continue;
      const slack = e - b.t;
      if (!best || slack > best.slack + 0.25 || (Math.abs(slack - best.slack) <= 0.25 && b.v < best.b.v)) best = { b, slack };
    }
    if (!best && E.mustBid(L, seat)) {
      // made to bid (the Wallflowers): the lowest level, in the denomination this hand is best in
      const low = legal.filter(b => b.s !== 'MIS' && b.s !== 'OMIS'), t0 = Math.min(...low.map(b => b.t));
      let pick = null;
      for (const b of low.filter(b => b.t === t0)) { const e = estimate(h.hands[seat], b.s, L.act, L, seat); if (!pick || e > pick.e) pick = { b, e }; }
      return { t: pick.b.t, s: pick.b.s };
    }
    return best ? { t: best.b.t, s: best.b.s } : null;
  }
  /* Partner's Nod: the denomination this seat's hand is best in, or null if
     nothing is worth a nod. */
  function nod(L, seat) {
    seat = seat === undefined ? 2 : seat;
    const h = L.h, A = ACTS[L.act], denoms = Object.keys(A.bids[Object.keys(A.bids)[0]]);
    let best = null;
    for (const s of denoms) {
      const e = estimate(h.hands[seat], s, L.act, L, seat) - A.hand * SHARE[L.act];
      if (!best || e > best.e) best = { s, e };
    }
    return best && best.e >= A.hand * 0.3 ? best.s : null;
  }

  /* The contractor keeps its trumps and aces and throws the cheapest card. */
  function discard(L, seat) {
    const h = L.h;
    if (h.misere && seat === h.contractor) return misWorst(h.hands[seat], L.act);
    return cheapest(L, seat, h.hands[seat]);
  }

  /* ---------------- the Act II bosses ---------------- */
  /* The Card Sharps can see the cards dealt to you from your own (the boss's
     public rule). On lead they go after one: the highest card they hold that
     beats a seeded card in its own suit, so that if you have to follow with it,
     it's theirs. They only know your seeded cards, not the rest of your hand. */
  function sharpsHunt(L, seat, legal) {
    const h = L.h, trump = h.trump;
    if (L.boss !== 'sharps' || team(seat) !== 1 || h.misere) return null;
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

  const api = { misCardDanger, MIS_SAFE_ACT, OPEN_SAFE, HUSTLE: 6, sharpsHunt, MARGIN, SHARE, MIS_SAFE, misDanger, misWorst, misPlay, cost, cheapest, dearest, unseen, after, safe, wins, play, lead, estimate, bid, nod, discard, gift, legacyPlay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BtpAI = api;
})(typeof window !== 'undefined' ? window : this);
