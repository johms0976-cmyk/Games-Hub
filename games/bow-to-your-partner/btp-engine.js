'use strict';
/* Bow to Your Partner — the hand of 500.
 *
 * One hand of partnership 500 at any act's size, with no DOM, no timers and
 * one seeded rng whose state lives in the run (L.rs), so a run is plain JSON
 * and the page can save after every step.
 *
 * Seats: 0 You (south), 1 West, 2 North (your partner), 3 East.
 * Teams: 0 = seats 0+2, 1 = seats 1+3.
 *
 * A hand moves through phases on L.h.phase:
 *   'bid'    seat h.turn bids or passes             bid(L, seat, bid | null)
 *   'kitty'  the contractor discards to hand size     discard(L, seat, cardId)
 *   'intent' the opponents won the auction: a hold so the page can show
 *            what their contract will cost you        ack(L)
 *   'play'   seat h.turn plays a card                 play(L, seat, cardId)
 *   'trick'  a hold on the finished trick             ack(L)
 *   'done'   the hand is scored (h.result)            -> the run moves on
 * The run module may insert its own phase ('swing') between the kitty and
 * the first trick. Every rule that changes the outcome is said in L.log.
 *
 * Cards are strings: rank + suit, 'AH', '10D', '9S', or 'JK' for the Joker.
 *
 * Your own cards. L.mods[card] = { enh, up } holds an owned card's enhancement
 * and its rank bumps (Growing, the Punch Bowl's Polish). They only work in
 * your team's hands: a card West or East holds is its plain printed self.
 * Buffs on L.buffs that the hand itself applies: 'bowertie' (your bowers tie
 * the Joker), 'nearmiss' (one trick short of your contract costs nothing).
 * A level's curse on L.curse: 'nokitty', 'locked' (one of your cards is chained
 * until your team wins a trick). L.dealRule 'twins': West and East are always
 * dealt the two red Jacks.
 *
 * Hexes (from Act II). L.hexes[card] = 'loose' | 'potato' | 'itchy' |
 * 'stepped' | 'twoleft'. Unlike enhancements they hit whoever holds the card:
 * Stepped On is -1 rank (tying the card below), Itchy Feet must be played
 * whenever it is legal, a Hot Potato costs the team that captures it 20, Two
 * Left Feet can never win a trick, and Loose Lips is shown face-up (the page's
 * job). The Joker and the bowers are untouchable: a hex never changes them.
 */
(function (root) {
  const SUITS = ['S', 'C', 'D', 'H'];            // bid order, low to high
  const SYM = { S: '♠', C: '♣', D: '♦', H: '♥', NT: 'NT' };
  const NAME = { S: 'spades', C: 'clubs', D: 'diamonds', H: 'hearts', NT: 'no trumps' };
  const TWIN = { S: 'C', C: 'S', D: 'H', H: 'D' };
  const RED = { D: true, H: true };
  const RANKV = { 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
  const VNAME = { 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  const SEATS = ['You', 'West', 'North', 'East'];

  /* The three acts. Hands stay a fixed size per act; the kitty takes the rest. */
  const ACTS = {
    1: { name: 'Church Hall', suits: ['D', 'H'], low: { D: 9, H: 9 }, hand: 3, seeds: 1,
         bids: { 2: { D: 20, H: 30, NT: 40 }, 3: { D: 60, H: 80, NT: 100 } } },
    2: { name: 'Barn Dance', suits: SUITS, low: { S: 9, C: 9, D: 9, H: 9 }, hand: 6, seeds: 2,
         bids: { 4: { S: 20, C: 30, D: 40, H: 50, NT: 60 }, 5: { S: 80, C: 90, D: 100, H: 110, NT: 120 },
                 6: { S: 140, C: 150, D: 160, H: 170, NT: 180 } } },
    3: { name: 'County Fair', suits: SUITS, low: { S: 5, C: 5, D: 4, H: 4 }, hand: 10, seeds: 3, bids: (() => {
      const b = {}, base = { S: 40, C: 60, D: 80, H: 100, NT: 120 };
      for (let t = 6; t <= 10; t++) { b[t] = {}; for (const s in base) b[t][s] = base[s] + (t - 6) * 100; }
      return b; })() }
  };
  /* Misère: the contractor must lose every trick, playing alone while their partner
     sits out, with no trumps (the Joker has no suit and wins any trick it is in).
     Act II's is worth 130 (between 5NT and 6\u2660), Act III's 250. Open misère (Act
     III, 500) is not built yet. */
  ACTS[2].misere = 130;
  ACTS[3].misere = 250;
  /* Bids above the hand size, open only to you when your hand holds a card that
     counts a won trick more than once (Doubly Woubly +1; Act III's Triple Threat,
     not built yet, +2). Act I's step up follows its table; Act II's adds 60 a level. */
  ACTS[1].extra = { 4: { D: 100, H: 130, NT: 160 } };
  ACTS[2].extra = { 7: { S: 200, C: 210, D: 220, H: 230, NT: 240 } };
  ACTS[3].extra = {};

  /* ---------------- rng (state in L.rs) ---------------- */
  function rnd(L) {
    L.rs = (L.rs + 0x6D2B79F5) >>> 0;
    let t = L.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(L, a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(L) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const pick = (L, a) => a[Math.floor(rnd(L) * a.length)];

  /* ---------------- cards ---------------- */
  const rankOf = c => c === 'JK' ? 'JK' : c.slice(0, -1);
  const suitOf = c => c === 'JK' ? null : c.slice(-1);
  function label(c) { return c === 'JK' ? 'Joker' : rankOf(c) + SYM[suitOf(c)]; }
  function deckFor(act) {
    const A = ACTS[act], d = ['JK'];
    for (const s of A.suits) for (const r of ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'])
      if (RANKV[r] >= A.low[s]) d.push(r + s);
    return d;
  }
  const team = seat => seat % 2;
  const partnerOf = seat => (seat + 2) % 4;

  /* A rank after `up` bumps: skips the Jack (a Jack in trumps is a bower) and
     never goes past the Ace (the design's Ace ceiling). */
  function grown(c, up) {
    let v = RANKV[rankOf(c)];
    for (let i = 0; i < (up || 0) && v < 14; i++) v = (v === 10 && rankOf(c) !== 'J') ? 12 : v + 1;
    return v;
  }
  const maxUp = c => c === 'JK' ? 0 : (() => { let n = 0; while (grown(c, n) < 14) n++; return n; })();

  /* A card as a seat holds it: with its enhancement and your buffs when the seat
     is on your team, plain otherwise. Every rule below reads cards this way. */
  function K(L, seat, c) {
    const own = !!L && seat !== null && seat !== undefined && team(seat) === 0;
    return { c, seat, m: own && L.mods ? (L.mods[c] || null) : null, tie: own && !!(L.buffs && L.buffs.includes('bowertie')),
             x: L && L.hexes ? (L.hexes[c] || null) : null };
  }
  const plainK = c => ({ c, seat: null, m: null, tie: false, x: null });
  function kSuit(k, trump) {
    const c = k.c;
    if (k.forced) return k.forced;
    if (c === 'JK') return trump || '*';
    if (k.m && k.m.enh === 'outcast') return '#';     // Outcast: no suit at all
    if (trump && k.m && k.m.enh === 'sworn') return trump;
    if (trump && rankOf(c) === 'J' && suitOf(c) === TWIN[trump]) return trump;
    return suitOf(c);
  }
  /* Stepped On: one rank down, tying the card below (a Queen ties the plain Jack;
     in trumps the Jacks are bowers, so a Stepped Queen sits between 10 and King). */
  function stepDown(c, v) { return Math.max(2, v - 1); }
  const kRank = k => k.c === 'JK' ? 100 : (k.x === 'stepped' ? stepDown(k.c, grown(k.c, k.m && k.m.up)) : grown(k.c, k.m && k.m.up));
  function kTrumpRank(k, trump) {
    const c = k.c;
    if (c === 'JK') return 100;
    if (rankOf(c) === 'J' && suitOf(c) === trump) return k.tie ? 100 : 99;      // right bower
    if (rankOf(c) === 'J' && suitOf(c) === TWIN[trump]) return k.tie ? 100 : 98; // left bower
    return kRank(k);
  }
  const kIsTrump = (k, trump) => k.c === 'JK' || (!!trump && kSuit(k, trump) === trump);
  /* Does k take the trick from w? Ties never do: the card played first keeps it. */
  function kBeats(k, w, led, trump) {
    if (k.x === 'twoleft' || (k.m && k.m.enh === 'outcast')) return false;   // never takes a trick
    const kt = kIsTrump(k, trump) ? kTrumpRank(k, trump) : 0;
    const wt = kIsTrump(w, trump) ? kTrumpRank(w, trump) : 0;
    if (wt === 100) return false;                 // the Joker, or your bower tied with it
    if (kt === 100) return true;
    const ks = kSuit(k, trump), ws = kSuit(w, trump);
    if (w.m && w.m.enh === 'giant' && rankOf(k.c) === 'A' && ks === ws) return false;
    if (k.m && k.m.enh === 'giant' && rankOf(w.c) === 'A' && ks === ws) return true;
    const kT = kt > 0, wT = wt > 0;
    if (kT && !wT) return true;
    if (kT && wT) return kt > wt;
    if (!kT && !wT) return ks === led && (ws !== led || kRank(k) > kRank(w));
    return false;
  }

  /* The plain-card forms, for code that has no seat (tests, the AI's unseen cards). */
  const effSuit = (c, trump) => kSuit(plainK(c), trump);
  const trumpRank = (c, trump) => kTrumpRank(plainK(c), trump);
  const isTrump = (c, trump) => kIsTrump(plainK(c), trump);
  const beats = (c, wc, led, trump) => kBeats(plainK(c), plainK(wc), led, trump);
  /* Must follow the suit led if you can. The Joker in no trumps has no suit, so it
     can only be played when you can't follow (or when you lead it). */
  function canPlay(c, hand, led, trump) {
    if (!led) return true;
    if (!hand.some(x => effSuit(x, trump) === led)) return true;
    return effSuit(c, trump) === led;
  }
  /* Who holds the trick so far. Strictly higher takes the lead, so ties go to
     the card played first. Pass L for your own cards' enhancements. */
  /* A Two-faced card counts as the suit led when that's either suit of its
     colour, as a trump when its colour twin is trumps, otherwise as printed. */
  function resolveTwo(k, led, trump) {
    if (!(k.m && k.m.enh === 'twoface') || k.c === 'JK') return k;
    const s = suitOf(k.c);
    if (led === s || led === TWIN[s]) return Object.assign({}, k, { forced: led });
    if (trump && (trump === s || trump === TWIN[s])) return Object.assign({}, k, { forced: trump });
    return k;
  }
  const playRank = (k, trump) => kIsTrump(k, trump) ? kTrumpRank(k, trump) : kRank(k);
  function winnerOf(cards, leader, trump, L) {
    let w = leader, wk = K(L, leader, cards[leader]);
    const led = kSuit(wk, trump);
    const seats = [];
    for (let i = 0; i < 4; i++) { const p = (leader + i) % 4; if (cards[p]) seats.push({ p, k: i ? resolveTwo(K(L, p, cards[p]), led, trump) : wk }); }
    // Reverse or Sanctuary led: only cards of the suit led count (no trumping in);
    // Reverse gives the trick to the lowest of them, Sanctuary to the highest.
    const mode = wk.m && (wk.m.enh === 'reverse' || wk.m.enh === 'sanctuary') ? wk.m.enh : null;
    if (mode) {
      const inSuit = seats.filter(x => kSuit(x.k, trump) === led && x.k.x !== 'twoleft' && !(x.k.m && x.k.m.enh === 'outcast'));
      let best = inSuit[0];
      for (const x of inSuit.slice(1)) {
        const a = playRank(x.k, trump), b = playRank(best.k, trump);
        if (mode === 'reverse' ? a < b : a > b) best = x;
      }
      return best.p;
    }
    for (const x of seats.slice(1)) if (kBeats(x.k, wk, led, trump)) { w = x.p; wk = x.k; }
    // Two Left Feet or an Outcast led and never beaten: the trick goes to the best of the other cards
    if (wk.x === 'twoleft' || (wk.m && wk.m.enh === 'outcast')) {
      const rest = [];
      for (let i = 1; i < 4; i++) { const p = (leader + i) % 4; if (cards[p]) rest.push(p); }
      if (rest.length) {
        let w2 = rest[0], k2 = K(L, w2, cards[w2]);
        const led2 = kSuit(k2, trump);
        for (const p of rest.slice(1)) { const k = K(L, p, cards[p]); if (kBeats(k, k2, led2, trump)) { w2 = p; k2 = k; } }
        return w2;
      }
    }
    return w;
  }
  const ENH_WORD = { growing: 'Growing', sworn: 'Trump-sworn', giant: 'Giant-killer', magnet: 'Magnet', gilded: 'Gilded' };
  function kLabel(k) {
    const up = k.m && k.m.up ? ' (now ' + (/^[AEIOU8]/.test(VNAME[kRank(k)]) ? 'an ' : 'a ') + VNAME[kRank(k)] + ')' : '';
    return label(k.c) + up;
  }
  /* Why a trick went where it did, in words for the log. */
  function explain(cards, leader, winner, trump, L) {
    const k = K(L, winner, cards[winner]), c = k.c, lk = K(L, leader, cards[leader]);
    let led = kSuit(K(L, leader, cards[leader]), trump), who = SEATS[winner];
    if (lk.m && lk.m.enh === 'reverse' && winner !== null) {
      const nm = NAME[led] ? NAME[led].slice(0, -1) : 'card';
      return SEATS[winner] + (winner === 0 ? ' win' : ' wins') + ' with ' + kLabel(k) + ': Reverse was led, so the lowest ' + nm + ' takes it and nobody can trump in.';
    }
    if (lk.m && lk.m.enh === 'sanctuary') {
      const nm = NAME[led] ? NAME[led].slice(0, -1) : 'card';
      return SEATS[winner] + (winner === 0 ? ' win' : ' wins') + ' with ' + kLabel(k) + ': Sanctuary was led, so nobody could trump in and the highest ' + nm + ' takes it.';
    }
    let lead2 = '';
    if (winner !== leader && (lk.x === 'twoleft' || (lk.m && lk.m.enh === 'outcast'))) { lead2 = ' (the ' + label(lk.c) + ' that was led can never win)'; led = kSuit(resolveTwo(k, null, trump), trump); }
    if (!NAME[led]) led = kSuit(k, trump);
    const verb = winner === 0 ? 'win' : 'wins';
    const jokerOut = cards.some((x, s) => x === 'JK' && s !== winner);
    if (c === 'JK') return who + ' ' + verb + ' with the Joker, the highest card in the game.';
    if (k.tie && trump && rankOf(c) === 'J' && (suitOf(c) === trump || suitOf(c) === TWIN[trump]) && jokerOut)
      return who + ' ' + verb + ' with ' + label(c) + ': under Remove the Bower Order your bowers tie the Joker, and it was played first.';
    if (trump && rankOf(c) === 'J' && suitOf(c) === trump) return who + ' ' + verb + ' with the right bower (J' + SYM[trump] + '), the top trump after the Joker.';
    if (trump && rankOf(c) === 'J' && suitOf(c) === TWIN[trump]) return who + ' ' + verb + ' with the left bower: ' + label(c) + ' counts as a ' + NAME[trump].slice(0, -1) + ' this hand and ranks just under J' + SYM[trump] + '.';
    const beatAce = k.m && k.m.enh === 'giant' && cards.some((x, s) => s !== winner && x && rankOf(x) === 'A' && kSuit(K(L, s, x), trump) === kSuit(k, trump));
    if (beatAce) return who + ' ' + verb + ' with ' + kLabel(k) + ': a Giant-killer beats the Ace of its own suit.';
    const twinOut = cards.some((x, s) => s !== winner && x && x !== c && kIsTrump(K(L, s, x), trump) && kTrumpRank(K(L, s, x), trump) === kTrumpRank(k, trump));
    const sworn = k.m && k.m.enh === 'sworn' && trump && suitOf(c) !== trump ? ' (Trump-sworn: it counts as a ' + VNAME[kRank(k)] + ' of trumps)' : '';
    const tieNote = twinOut ? ' It tied, and was played first.' : '';
    if (kIsTrump(k, trump) && led !== trump) return who + ' ' + verb + ' by trumping in with ' + kLabel(k) + sworn + lead2 + '.' + tieNote;
    return who + ' ' + verb + ' with ' + kLabel(k) + sworn + ', the highest ' + (led === trump ? 'trump' : NAME[led] ? NAME[led].slice(0, -1) : 'card') + ' played' + lead2 + '.' + tieNote;
  }

  /* ---------------- bids ---------------- */
  const bidValue = (act, t, s) => s === 'MIS' ? ACTS[act].misere : ACTS[act].bids[t][s];
  function bidList(act) {
    const out = [];
    for (const t of Object.keys(ACTS[act].bids).map(Number))
      for (const s of Object.keys(ACTS[act].bids[t])) out.push({ t, s, v: ACTS[act].bids[t][s] });
    if (ACTS[act].misere) out.push({ t: 0, s: 'MIS', v: ACTS[act].misere });
    return out.sort((a, b) => a.v - b.v);
  }
  /* A sweep scores the top-level value of the bid suit. */
  function sweepValue(act, s) { const ts = Object.keys(ACTS[act].bids).map(Number); return ACTS[act].bids[Math.max(...ts)][s]; }
  const bidText = b => b.s === 'MIS' ? 'Mis\u00e8re' : b.t + (b.s === 'NT' ? 'NT' : SYM[b.s]);
  /* Half a made opponent contract, to the nearest 5: the opponents' attack. */
  const damageOf = v => Math.round(v / 2 / 5) * 5;

  /* ---------------- the hand ---------------- */
  function say(L, text, kind) { L.log.push({ n: L.log.length, hand: L.handNo, text, kind: kind || '' }); }

  /* Deal a hand. Owned cards fill seat 0's seed slots first; owned cards not
     seeded go into the deck as plain cards. */
  function deal(L) {
    const A = ACTS[L.act];
    const deck = deckFor(L.act);
    const hands = [[], [], [], []];
    let pool = deck.slice();
    if (L.dealRule === 'twins') {
      const js = shuffle(L, ['JH', 'JD']);
      hands[1].push(js[0]); hands[3].push(js[1]);
      pool = pool.filter(c => c !== 'JH' && c !== 'JD');
    }
    const owned = (L.owned || []).filter(c => pool.includes(c));
    const seeded = shuffle(L, owned.slice()).slice(0, A.seeds);
    hands[0].push(...seeded);
    const rest = shuffle(L, pool.filter(c => !seeded.includes(c)));
    let k = 0;
    for (let p = 0; p < 4; p++) while (hands[p].length < A.hand) hands[p].push(rest[k++]);
    const kitty = rest.slice(k);
    const first = (L.dealer + 1) % 4;
    L.h = {
      phase: 'bid', hands, kitty, seeded, turn: first, bids: [], passed: [false, false, false, false], high: null,
      contractor: null, contract: null, trump: null, trick: [null, null, null, null], leader: null,
      tricks: [0, 0], taken: [[], []], trickNo: 0, winners: [], last: null, result: null,
      locked: null, unlocked: false, misere: false, out: null, fail: false
    };
    if (L.curse === 'locked') {
      L.h.locked = pick(L, hands[0]);
      say(L, 'Locked: your ' + label(L.h.locked) + ' is chained until your team wins a trick.', 'rule');
    }
    sort(L, 0);
  }
  /* A hand in suit order, trumps last. */
  function sort(L, seat) {
    const tr = L.h.trump;
    const order = { S: 0, C: 1, D: 2, H: 3, '*': 5 };
    L.h.hands[seat].sort((a, b) => {
      const ka = K(L, seat, a), kb = K(L, seat, b);
      const at = kIsTrump(ka, tr), bt = kIsTrump(kb, tr);
      if (at !== bt) return at ? 1 : -1;
      if (at) return kTrumpRank(ka, tr) - kTrumpRank(kb, tr);
      const as = kSuit(ka, tr), bs = kSuit(kb, tr);
      if (as !== bs) return order[as] - order[bs];
      return kRank(ka) - kRank(kb);
    });
  }

  /* Extra tricks a seat's hand can count (Doubly Woubly +1, Triple Threat +2): only you bid on them. */
  function extraTricks(L, seat) {
    if (seat !== 0 || !L.h) return 0;
    return L.h.hands[0].reduce((n, c) => { const k = K(L, 0, c); return n + (k.m && k.m.enh === 'double' ? 1 : k.m && k.m.enh === 'triple' ? 2 : 0); }, 0);
  }
  function extraBids(L, seat) {
    const A = ACTS[L.act], room = extraTricks(L, seat), out = [];
    for (const t of Object.keys(A.extra || {}).map(Number)) if (t - A.hand <= room) for (const s of Object.keys(A.extra[t])) out.push({ t, s, v: A.extra[t][s] });
    return out;
  }
  function legalBids(L) {
    const min = L.h.high ? L.h.high.v : 0;
    return bidList(L.act).concat(extraBids(L, L.h.turn)).filter(b => b.v > min).sort((a, b) => a.v - b.v);
  }
  const no = why => ({ ok: false, why });
  function bid(L, seat, b) {
    const h = L.h;
    if (h.phase !== 'bid' || h.turn !== seat) return no('not your turn to bid');
    if (b) {
      const ex = extraBids(L, seat).find(x => x.t === b.t && x.s === b.s);
      const v = b.s === 'MIS' ? ACTS[L.act].misere : ex ? ex.v : ACTS[L.act].bids[b.t] && ACTS[L.act].bids[b.t][b.s];
      if (!v) return no('no such bid');
      if (h.high && v <= h.high.v) return no('a bid must beat ' + bidText(h.high));
      h.high = { seat, t: b.t, s: b.s, v };
      h.bids.push({ seat, t: b.t, s: b.s, v });
      say(L, SEATS[seat] + (seat === 0 ? ' bid ' : ' bids ') + bidText(b) + ' (' + v + ').');
    } else {
      h.passed[seat] = true;
      h.bids.push({ seat, pass: true });
      say(L, SEATS[seat] + (seat === 0 ? ' pass.' : ' passes.'));
    }
    const passes = h.passed.filter(Boolean).length;
    if (passes === 4) {
      say(L, 'Everyone passed, so the cards are dealt again.', 'redeal');
      L.dealer = (L.dealer + 1) % 4;
      L.redeals = (L.redeals || 0) + 1;
      deal(L);
      return { ok: true, redeal: true };
    }
    if (h.high && passes === 3) { win(L); return { ok: true }; }
    do h.turn = (h.turn + 1) % 4; while (h.passed[h.turn]);
    return { ok: true };
  }
  /* The auction is over: the contractor picks up the kitty (unless the level's
     curse says no kitty). */
  function win(L) {
    const h = L.h, c = h.high;
    h.contractor = c.seat;
    h.contract = { t: c.t, s: c.s, v: c.v };
    h.trump = c.s === 'NT' || c.s === 'MIS' ? null : c.s;
    if (c.s === 'MIS') {
      h.misere = true;
      h.out = partnerOf(c.seat);
      say(L, SEATS[c.seat] + (c.seat === 0 ? ' win' : ' wins') + ' the auction with misère: ' + (c.seat === 0 ? 'you' : SEATS[c.seat]) + ' must lose every trick, playing alone. ' +
        (h.out === 0 ? 'You sit' : (h.out === 2 ? 'Nan' : SEATS[h.out]) + ' sits') + ' this hand out. No trumps; the Joker wins any trick it is in.', 'contract');
    } else
    say(L, SEATS[c.seat] + (c.seat === 0 ? ' win' : ' wins') + ' the auction with ' + bidText(c) + '. ' +
      (h.trump ? NAME[h.trump][0].toUpperCase() + NAME[h.trump].slice(1) + ' are trumps; J' + SYM[h.trump] + ' is the right bower and J' + SYM[TWIN[h.trump]] + ' the left bower.' : 'No trumps: only the Joker is above the suits.'), 'contract');
    h.turn = c.seat;
    for (let p = 0; p < 4; p++) sort(L, p);
    if (L.curse === 'nokitty') {
      say(L, 'No kitty this level: the kitty stays face down.', 'rule');
      afterKitty(L);
      return;
    }
    h.hands[c.seat].push(...h.kitty);
    h.kitty = [];
    h.phase = 'kitty';
    sort(L, c.seat);
  }
  function discard(L, seat, card) {
    const h = L.h;
    if (h.phase !== 'kitty' || h.turn !== seat) return no('not your discard');
    const i = h.hands[seat].indexOf(card);
    if (i < 0) return no('not in your hand');
    h.hands[seat].splice(i, 1);
    h.discards = (h.discards || []).concat(card);
    if (h.locked === card) h.locked = null;
    if (h.hands[seat].length > ACTS[L.act].hand) return { ok: true };
    say(L, SEATS[seat] + (seat === 0 ? ' put ' : ' puts ') + (seat === 0 ? label(card) : 'a card') + ' back under the kitty.');
    afterKitty(L);
    return { ok: true };
  }
  function afterKitty(L) {
    const h = L.h;
    h.leader = h.turn = h.contractor;
    if (team(h.contractor) === 1) {
      const v = h.contract.v;
      h.intent = { seat: h.contractor, contract: h.contract, dmg: damageOf(v), dmgSweep: h.misere ? damageOf(v) : damageOf(sweepValue(L.act, h.contract.s)) };
      if (h.misere) say(L, SEATS[h.contractor] + "'s intent: misère costs you " + h.intent.dmg + ' if they lose every trick. Make ' + SEATS[h.contractor] + ' win one trick to block it.', 'intent');
      else say(L, SEATS[h.contractor] + "'s intent: " + bidText(h.contract) + ' costs you ' + h.intent.dmg + ' if they make it. Stop them taking ' + h.contract.t + ' tricks to block it.', 'intent');
      h.phase = 'intent';
    } else h.phase = 'play';
  }
  function ack(L) {
    const h = L.h;
    if (h.phase === 'intent') { h.phase = 'play'; return { ok: true }; }
    if (h.phase === 'trick') {
      h.trick = [null, null, null, null];
      if (h.trickNo >= ACTS[L.act].hand || h.fail) { score(L); return { ok: true }; }
      h.phase = 'play';
      h.leader = h.turn = h.last.winner;
      return { ok: true };
    }
    return no('nothing to acknowledge');
  }

  function ledSuit(L) { const h = L.h; return h.trick[h.leader] ? kSuit(K(L, h.leader, h.trick[h.leader]), h.trump) : null; }
  function legalPlays(L, seat) {
    const h = L.h, hand = h.hands[seat], led = ledSuit(L), tr = h.trump;
    let legal = hand;
    if (led && hand.some(x => kSuit(K(L, seat, x), tr) === led)) {
      // follow suit; an Outcast can always be played, a Two-faced card may follow either suit of its colour
      legal = hand.filter(x => { const k = K(L, seat, x); return kSuit(k, tr) === led || kSuit(k, tr) === '#' || kSuit(resolveTwo(k, led, tr), tr) === led; });
    }
    if (seat === 0 && h.locked && !h.unlocked && legal.length > 1) legal = legal.filter(c => c !== h.locked);
    const itchy = L.hexes ? legal.filter(c => L.hexes[c] === 'itchy') : [];
    if (itchy.length) legal = itchy;                     // Itchy Feet: if it can be played, it must be
    return legal;
  }
  function play(L, seat, card) {
    const h = L.h;
    if (h.phase !== 'play' || h.turn !== seat) return no('not your turn');
    if (!h.hands[seat].includes(card)) return no('not in your hand');
    if (!legalPlays(L, seat).includes(card)) {
      if (seat === 0 && card === h.locked && !h.unlocked) return no('that card is locked until your team wins a trick');
      return no('you must follow ' + NAME[ledSuit(L)] + (h.trump ? ' (the left bower counts as a trump)' : ''));
    }
    h.hands[seat].splice(h.hands[seat].indexOf(card), 1);
    const leading = !h.trick.some(Boolean);
    h.trick[seat] = card;
    const k = K(L, seat, card);
    if (leading && k.m && k.m.enh === 'herald' && h.out !== partnerOf(seat)) {
      const p = partnerOf(seat), suit = kSuit(k, h.trump);
      const n = h.hands[p].filter(x => kSuit(K(L, p, x), h.trump) === suit).length;
      h.herald = { seat, partner: p, suit, n, trick: h.trickNo + 1 };
      say(L, 'Herald: ' + (p === 2 ? 'Nan holds ' : 'You hold ') + n + ' ' + (suit === '*' || suit === '#' ? 'cards of that suit' : NAME[suit]) + '.', 'rule');
    }
    if (k.m && k.m.enh === 'reverse' && leading) say(L, 'Reverse: the lowest ' + (NAME[kSuit(k, h.trump)] || 'card').replace(/s$/, '') + ' wins this trick, and nobody can trump in.', 'rule');
    if (k.m && k.m.enh === 'sanctuary' && leading) say(L, 'Sanctuary: nobody can trump in on this trick.', 'rule');
    if (h.trump && rankOf(card) === 'J' && suitOf(card) === TWIN[h.trump])
      say(L, label(card) + ' is the left bower: it counts as a ' + NAME[h.trump].slice(0, -1) + ' this hand.', 'rule');
    else if (h.trump && k.m && k.m.enh === 'sworn' && suitOf(card) !== h.trump)
      say(L, label(card) + ' is Trump-sworn: it counts as a ' + VNAME[kRank(k)] + ' of ' + NAME[h.trump] + ' this hand.', 'rule');
    const players = h.out === null || h.out === undefined ? 4 : 3;
    if (h.trick.filter(Boolean).length < players) { do h.turn = (h.turn + 1) % 4; while (h.turn === h.out); return { ok: true }; }
    const w = winnerOf(h.trick, h.leader, h.trump, L);
    const t = team(w);
    h.tricks[t]++;
    h.trickNo++;
    h.taken[t].push(...h.trick.filter(Boolean));
    h.winners.push(w);
    h.last = { cards: h.trick.slice(), leader: h.leader, winner: w, reason: explain(h.trick, h.leader, w, h.trump, L), no: h.trickNo };
    h.played = (h.played || []).concat([{ cards: h.last.cards, leader: h.leader, winner: w }]);
    const wk2 = K(L, w, h.trick[w]);
    if (wk2.m && wk2.m.enh === 'double' && !h.misere) {
      h.bonus = h.bonus || [0, 0];
      h.bonus[t]++;
      say(L, label(h.trick[w]) + ' is Doubly Woubly: that trick counts as two.', 'rule');
    }
    const hot = L.hexes ? h.trick.filter(c => c && L.hexes[c] === 'potato') : [];
    if (hot.length) {
      h.potato = h.potato || [0, 0];
      h.potato[t] += 20 * hot.length;
      say(L, (t === 0 ? 'Your team catches' : 'They catch') + ' the Hot Potato (' + hot.map(label).join(', ') + '): \u2212' + 20 * hot.length + '.', 'rule');
    }
    // in a misère the opponents taking a trick is good for your side, whoever bid it
    say(L, h.last.reason, (h.misere ? t === 1 : t === 0) ? 'won' : 'lost');
    if (h.misere && t === team(h.contractor)) {
      h.fail = true;
      say(L, (h.contractor === 0 ? 'You took' : SEATS[h.contractor] + ' took') + ' a trick: the misère fails.', 'rule');
    }
    if (t === 0 && h.locked && !h.unlocked) { h.unlocked = true; if (h.hands[0].includes(h.locked)) say(L, 'Your ' + label(h.locked) + ' is unlocked.', 'rule'); }
    h.phase = 'trick';
    return { ok: true, trick: h.last };
  }

  /* Score the hand. Health is your team's running score; a made opponent
     contract also costs you half its value. */
  function score(L) {
    const h = L.h, act = L.act, c = h.contract, ct = team(h.contractor), dt = 1 - ct;
    if (h.misere) return scoreMisere(L);
    const got = counted(h, ct), gotD = counted(h, dt);
    const made = got >= c.t;
    const sweep = made && h.tricks[ct] === ACTS[act].hand;
    const value = sweep ? Math.max(c.v, sweepValue(act, c.s)) : c.v;
    const near = !made && ct === 0 && got === c.t - 1 && (L.buffs || []).includes('nearmiss');
    const pts = [0, 0];
    pts[ct] += made ? value : (near ? 0 : -c.v);
    pts[dt] += 10 * gotD;
    const dmg = (ct === 1 && made) ? damageOf(value) : 0;
    const lines = [];
    const who = ct === 0 ? (h.contractor === 0 ? 'You' : 'North') : SEATS[h.contractor];
    if (made) lines.push(who + ' made ' + bidText(c) + (sweep && value > c.v ? ' and swept every trick, scoring ' + value + ' instead of ' + c.v : '') + ': ' + (ct === 0 ? '+' : 'they score ') + value + '.');
    else if (near) lines.push(who + ' needed ' + c.t + ' tricks and took ' + got + ', one short: Near Miss, so it costs nothing.');
    else lines.push(who + ' needed ' + c.t + ' tricks and took ' + got + ': ' + (ct === 0 ? '−' + c.v + ' for your team.' : 'set! They lose ' + c.v + ' and their attack misses.'));
    if (gotD) lines.push((dt === 0 ? 'Your team' : 'They') + ' took ' + gotD + ' trick' + (gotD > 1 ? 's' : '') + ' defending: ' + (dt === 0 ? '+' : '') + 10 * gotD + '.');
    if (h.bonus && (h.bonus[0] || h.bonus[1])) lines.push('(Doubly Woubly counted ' + (h.bonus[0] + h.bonus[1]) + ' extra trick' + (h.bonus[0] + h.bonus[1] > 1 ? 's' : '') + '.)');
    if (dmg) lines.push('Their contract lands: −' + dmg + ' health (half of ' + value + ').');
    potatoLines(h, pts, lines);
    const delta = pts[0] - dmg;
    h.result = { made, sweep, value, pts, dmg, delta, lines, tricks: h.tricks.slice(), counted: [counted(h, 0), counted(h, 1)], contractor: h.contractor, near };
    lines.forEach(t => say(L, t, 'score'));
    h.phase = 'done';
  }

  /* Misère: made if the contractor took no trick. No defender points; a made
     opponents' misère costs you half its value like any other contract. */
  function scoreMisere(L) {
    const h = L.h, c = h.contract, ct = team(h.contractor);
    const made = h.tricks[ct] === 0, pts = [0, 0];
    pts[ct] = made ? c.v : -c.v;
    const dmg = ct === 1 && made ? damageOf(c.v) : 0;
    const who = h.contractor === 0 ? 'You' : h.contractor === 2 ? 'Nan' : SEATS[h.contractor];
    const lines = [made ? who + ' lost every trick: misère made, ' + (ct === 0 ? '+' : 'they score ') + c.v + '.'
      : who + (h.contractor === 0 ? ' were' : ' was') + ' made to take a trick: misère failed, ' + (ct === 0 ? '\u2212' + c.v + ' for your team.' : 'they lose ' + c.v + ' and their attack misses.')];
    if (dmg) lines.push('Their misère lands: \u2212' + dmg + ' health (half of ' + c.v + ').');
    potatoLines(h, pts, lines);
    const delta = pts[0] - dmg;
    h.result = { made, sweep: false, value: c.v, pts, dmg, delta, lines, tricks: h.tricks.slice(), contractor: h.contractor, near: false, misere: true };
    lines.forEach(t => say(L, t, 'score'));
    h.phase = 'done';
  }

  /* Tricks that count toward a contract: Doubly Woubly wins count twice. */
  const counted = (h, t) => h.tricks[t] + (h.bonus ? h.bonus[t] : 0);
  /* Hot Potatoes caught this hand come off each team's points. */
  function potatoLines(h, pts, lines) {
    if (!h.potato) return;
    for (const t of [0, 1]) if (h.potato[t]) { pts[t] -= h.potato[t]; lines.push((t === 0 ? 'Your team' : 'They') + ' caught a Hot Potato: \u2212' + h.potato[t] + '.'); }
  }

  const api = {
    SUITS, SYM, NAME, TWIN, RED, RANKV, VNAME, SEATS, ACTS, ENH_WORD,
    rnd, shuffle, pick, rankOf, suitOf, label, deckFor, team, partnerOf, grown, maxUp, stepDown,
    K, plainK, kSuit, kRank, kTrumpRank, kIsTrump, kBeats, kLabel,
    effSuit, trumpRank, isTrump, canPlay, winnerOf, beats, explain,
    bidValue, bidList, sweepValue, bidText, damageOf, extraTricks, extraBids, counted, resolveTwo,
    say, deal, sort, legalBids, bid, discard, afterKitty, ack, ledSuit, legalPlays, play, score
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BtpEngine = api;
})(typeof window !== 'undefined' ? window : this);
