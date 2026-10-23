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
    return E.deckFor(L.act).filter(c => !seen.has(c));
  }
  function withCard(h, seat, c) { const t = h.trick.slice(); t[seat] = c; return t; }
  const leaderOf = (h, seat) => h.trick[h.leader] ? h.leader : seat;
  /* Seats still to play after this one in the current trick. */
  function after(h, seat) {
    const out = [];
    for (let p = (seat + 1) % 4; p !== leaderOf(h, seat); p = (p + 1) % 4) if (!h.trick[p]) out.push(p);
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
      if (k.m && k.m.enh === 'giant') est += 0.15;
    }
    if (trump) est += Math.max(0, nTrump - Math.ceil(A.hand / 3)) * 0.3;
    return est + A.hand * 0.2;
  }
  /* How sure a seat must be before it bids: Nan (and you, as the stand-in) are
     steady; West and East bid a little bolder, so more intents come up. */
  const MARGIN = { 0: 0.15, 1: -0.15 };
  /* The cheapest legal bid in this seat's best denomination, or a pass. North,
     like every AI, never outbids its own partner. */
  function bid(L, seat) {
    const h = L.h;
    if (h.high && team(h.high.seat) === team(seat)) return null;
    const legal = E.legalBids(L);
    let best = null;
    for (const b of legal) {
      const e = estimate(h.hands[seat], b.s, L.act, L, seat);
      if (e < b.t + MARGIN[team(seat)]) continue;
      const slack = e - b.t;
      if (!best || slack > best.slack + 0.25 || (Math.abs(slack - best.slack) <= 0.25 && b.v < best.b.v)) best = { b, slack };
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
      const e = estimate(h.hands[seat], s, L.act, L, seat) - A.hand * 0.2;
      if (!best || e > best.e) best = { s, e };
    }
    return best && best.e >= A.hand * 0.3 ? best.s : null;
  }

  /* The contractor keeps its trumps and aces and throws the cheapest card. */
  function discard(L, seat) { return cheapest(L, seat, L.h.hands[seat]); }
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

  const api = { MARGIN, cost, cheapest, dearest, unseen, after, safe, wins, play, lead, estimate, bid, nod, discard, gift, legacyPlay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BtpAI = api;
})(typeof window !== 'undefined' ? window : this);
