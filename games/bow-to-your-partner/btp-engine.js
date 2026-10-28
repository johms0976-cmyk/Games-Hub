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
 * Your own cards. L.mods[card] = { enh, enh2, up } holds an owned card's enhancements
 * (two make it Legendary, 2026-10-29; read them with en(k, id)) and its rank bumps
 * (Growing, the Punch Bowl's Polish). They only work in
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
 *
 * The gang's debuffs (2026-10-29) live on L.foe.traits and are read with foeHas(L, id): 'rusty' (your cards
 * play a rank lower), 'sand' (your team's cards play as printed on the first trick), 'sleeve' (West and East
 * are each dealt an Ace), 'marked' (none of your own cards are dealt to you), 'bushwhack' (West leads the first
 * trick of your team's contracts), 'armour' (your defending tricks don't hurt them), 'snakebite' (each trick they
 * take hits you for 5 more) and 'gutshot' (you bleed 10 a hand). 'gag' and 'shakedown' are the run's.
 * A Steady Aim card shrugs off hexes and the gang's rank debuffs.
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
    1: { name: 'Dustwater', suits: ['D', 'H'], low: { D: 9, H: 9 }, hand: 3, seeds: 1,
         bids: { 2: { D: 20, H: 30, NT: 40 }, 3: { D: 60, H: 80, NT: 100 } } },
    2: { name: 'the Westbound Express', suits: SUITS, low: { S: 9, C: 9, D: 9, H: 9 }, hand: 6, seeds: 2,
         bids: { 4: { S: 20, C: 30, D: 40, H: 50, NT: 60 }, 5: { S: 80, C: 90, D: 100, H: 110, NT: 120 },
                 6: { S: 140, C: 150, D: 160, H: 170, NT: 180 } } },
    3: { name: 'the County Fair', suits: SUITS, low: { S: 5, C: 5, D: 4, H: 4 }, hand: 10, seeds: 3, bids: (() => {
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
  ACTS[3].openMisere = 500;
  ACTS[3].forge = true;            // Forge and Remove at the Punch Bowl
  /* Bids above the hand size, open only to you when your hand holds a card that
     counts a won trick more than once (Doubly Woubly +1; Act III's Triple Threat,
     not built yet, +2). Act I's step up follows its table; Act II's adds 60 a level. */
  ACTS[1].extra = { 4: { D: 100, H: 130, NT: 160 } };
  ACTS[2].extra = { 7: { S: 200, C: 210, D: 220, H: 230, NT: 240 } };
  // Triple Threat opens two rows above the hand: 11 and 12 tricks, on the 500 scale (+100 a level)
  ACTS[3].extra = { 11: { S: 540, C: 560, D: 580, H: 600, NT: 620 }, 12: { S: 640, C: 660, D: 680, H: 700, NT: 720 } };

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
  /* A Forged copy has its own id, the card's id plus '~n' (AS~1): it reads as the card, and ties it. */
  const base = c => c.split('~')[0];
  const rankOf = c => c === 'JK' ? 'JK' : base(c).slice(0, -1);
  const suitOf = c => c === 'JK' ? null : base(c).slice(-1);
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
  /* Does this card (as a seat holds it) carry enhancement `id`? A Legendary card carries two. */
  const en = (k, id) => !!k.m && (k.m.enh === id || k.m.enh2 === id);
  const enhsOf = m => m ? [m.enh, m.enh2].filter(Boolean) : [];
  const foeHas = (L, id) => !!(L && L.foe && L.foe.traits && L.foe.traits.includes(id));
  const hasBuff = (L, b) => !!(L && L.buffs && L.buffs.includes(b));

  /* A card as a seat holds it: with its enhancement and your buffs when the seat
     is on your team, plain otherwise. Every rule below reads cards this way. */
  /* k.b: rank steps this card plays at from the rules of the moment (High Noon, Desperado, Brass Knuckles, the
     gang's Rusty Guns); k.hole: Ace in the Hole on the last trick. Spurs and Last to Draw depend on where the card
     sits in the trick, so winnerOf adds k.led and k.last. */
  function K(L, seat, c) {
    const own = !!L && seat !== null && seat !== undefined && team(seat) === 0;
    let m = own && L.mods ? (L.mods[c] || null) : null;
    const steady = !!m && (m.enh === 'steady' || m.enh2 === 'steady'), h = L && L.h;
    // Sand in the Eyes: on the first trick of a hand your team's own cards play as printed
    if (m && !steady && foeHas(L, 'sand') && h && h.trickNo === 0) m = null;
    const k = { c, seat, m, tie: own && hasBuff(L, 'bowertie'), x: L && L.hexes && !steady ? (L.hexes[c] || null) : null, al: !!L && L.call === 'allemande', b: 0 };
    if (m && h && c !== 'JK') {
      if (en(k, 'highnoon') && h.trickNo === 0) k.b += 2;
      if (en(k, 'desperado')) k.b += h.tricks[1 - team(seat)];
      if (en(k, 'knuckles') && h.contract && !h.trump) k.b += 2;
      if (en(k, 'hole') && h.trickNo === ACTS[L.act].hand - 1) k.hole = true;
    }
    if (own && seat === 0 && !steady && foeHas(L, 'rusty')) k.b -= 1;
    return k;
  }
  const plainK = c => ({ c, seat: null, m: null, tie: false, x: null });
  function kSuit(k, trump) {
    const c = k.c;
    if (k.forced) return k.forced;
    if (c === 'JK') return trump || '*';
    if (en(k, 'outcast')) return '#';     // Outcast: no suit at all
    if (trump && (en(k, 'sworn') || en(k, 'glass'))) return trump;
    if (trump && rankOf(c) === 'J' && suitOf(c) === TWIN[trump]) return trump;
    return suitOf(c);
  }
  /* Stepped On: one rank down, tying the card below (a Queen ties the plain Jack;
     in trumps the Jacks are bowers, so a Stepped Queen sits between 10 and King). */
  function stepDown(c, v) { return Math.max(2, v - 1); }
  function kRank(k) {
    if (k.c === 'JK') return 100;
    let v = grown(k.c, k.m && k.m.up);
    const b = (k.b || 0) + (k.led && en(k, 'spurs') ? 1 : 0) + (k.last && en(k, 'lastdraw') ? 2 : 0);
    if (b) v = Math.max(2, Math.min(14, v + b));
    if (k.hole) v = Math.max(v, 14);
    return k.x === 'stepped' ? stepDown(k.c, v) : v;
  }
  function kTrumpRank(k, trump) {
    const c = k.c;
    if (c === 'JK') return 100;
    // the Caller's Allemande Left swaps the bowers: the left outranks the right
    if (rankOf(c) === 'J' && suitOf(c) === trump) return k.tie ? 100 : k.al ? 98 : 99;      // right bower
    if (rankOf(c) === 'J' && suitOf(c) === TWIN[trump]) return k.tie ? 100 : k.al ? 99 : 98; // left bower
    if (en(k, 'glass')) return RANKV.A;      // Glass: the Ace of trumps, tying the real one
    return kRank(k);
  }
  const kIsTrump = (k, trump) => k.c === 'JK' || (!!trump && kSuit(k, trump) === trump);
  /* Does k take the trick from w? Ties never do: the card played first keeps it. */
  function kBeats(k, w, led, trump) {
    if (k.x === 'twoleft' || (en(k, 'outcast'))) return false;   // never takes a trick
    const kt = kIsTrump(k, trump) ? kTrumpRank(k, trump) : 0;
    const wt = kIsTrump(w, trump) ? kTrumpRank(w, trump) : 0;
    if (wt === 100) return false;                 // the Joker, or your bower tied with it
    if (kt === 100) return true;
    const ks = kSuit(k, trump), ws = kSuit(w, trump);
    if (en(w, 'giant') && rankOf(k.c) === 'A' && ks === ws) return false;
    if (en(k, 'giant') && rankOf(w.c) === 'A' && ks === ws) return true;
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
    if (!(en(k, 'twoface')) || k.c === 'JK') return k;
    const s = suitOf(k.c);
    if (led === s || led === TWIN[s]) return Object.assign({}, k, { forced: led });
    if (trump && (trump === s || trump === TWIN[s])) return Object.assign({}, k, { forced: trump });
    return k;
  }
  const playRank = (k, trump) => kIsTrump(k, trump) ? kTrumpRank(k, trump) : kRank(k);
  // the order cards were played in from the leader: anticlockwise when the Caller calls Honour Your Corner
  const dirOf = L => L && L.h && L.h.dir === -1 ? 3 : 1;
  const seatAfter = (L, p, i) => (p + i * dirOf(L)) % 4;
  // the Caller's Reverse: the first trick of the hand goes to the lowest card of the suit led
  const callReverse = L => !!L && L.call === 'reverse' && !!L.h && L.h.winners && L.h.winners.length === 0;
  function winnerOf(cards, leader, trump, L) {
    let w = leader, wk = Object.assign(K(L, leader, cards[leader]), { led: true });
    const led = kSuit(wk, trump);
    const seats = [];
    for (let i = 0; i < 4; i++) { const p = seatAfter(L, leader, i); if (cards[p]) seats.push({ p, k: i ? resolveTwo(K(L, p, cards[p]), led, trump) : wk }); }
    // the last card into a full trick (three cards in a misère, when a partner sits out)
    const full = seats.length === (L && L.h && L.h.out !== null && L.h.out !== undefined ? 3 : 4);
    if (full && seats.length > 1) { const x = seats[seats.length - 1]; x.k = Object.assign({}, x.k, { last: true }); }
    // Reverse or Sanctuary led: only cards of the suit led count (no trumping in);
    // Reverse gives the trick to the lowest of them, Sanctuary to the highest.
    const mode = en(wk, 'reverse') ? 'reverse' : en(wk, 'sanctuary') ? 'sanctuary' : callReverse(L) ? 'reverse' : null;
    // (an Outcast or Two Left Feet led has no suit to count: the trick goes by the ordinary rules)
    const inSuit = mode ? seats.filter(x => kSuit(x.k, trump) === led && x.k.x !== 'twoleft' && !(en(x.k, 'outcast'))) : [];
    if (inSuit.length) {
      let best = inSuit[0];
      for (const x of inSuit.slice(1)) {
        const a = playRank(x.k, trump), b = playRank(best.k, trump);
        if (mode === 'reverse' ? a < b : a > b) best = x;
      }
      return best.p;
    }
    for (const x of seats.slice(1)) if (kBeats(x.k, wk, led, trump)) { w = x.p; wk = x.k; }
    // Two Left Feet or an Outcast led and never beaten: the trick goes to the best of the other cards
    if (wk.x === 'twoleft' || (en(wk, 'outcast'))) {
      const rest = [];
      for (let i = 1; i < 4; i++) { const p = seatAfter(L, leader, i); if (cards[p]) rest.push(p); }
      if (rest.length) {
        let w2 = rest[0], k2 = K(L, w2, cards[w2]);
        const led2 = kSuit(k2, trump);
        for (const p of rest.slice(1)) { const k = K(L, p, cards[p]); if (kBeats(k, k2, led2, trump)) { w2 = p; k2 = k; } }
        return w2;
      }
    }
    return w;
  }
  const ENH_WORD = { growing: 'Growing', sworn: 'Trump-sworn', giant: 'Giant-killer', magnet: 'Magnet', gilded: 'Gilded', glass: 'Glass', triple: 'Triple Threat' };
  function kLabel(k) {
    const up = k.m && k.m.up ? ' (now ' + (/^[AEIOU8]/.test(VNAME[kRank(k)]) ? 'an ' : 'a ') + VNAME[kRank(k)] + ')' : '';
    return label(k.c) + up;
  }
  /* Why a trick went where it did, in words for the log. */
  function explain(cards, leader, winner, trump, L) {
    const k = K(L, winner, cards[winner]), c = k.c, lk = K(L, leader, cards[leader]);
    let led = kSuit(K(L, leader, cards[leader]), trump), who = SEATS[winner];
    if (L && L.call === 'reverse' && L.h && L.h.trickNo === 1 && !(en(lk, 'sanctuary')) && winner !== null) {
      const nm = NAME[led] ? NAME[led].slice(0, -1) : 'card';
      return SEATS[winner] + (winner === 0 ? ' win' : ' wins') + ' with ' + kLabel(k) + ': the Caller called Reverse, so the lowest ' + nm + ' takes the first trick and nobody can trump in.';
    }
    if (en(lk, 'reverse') && winner !== null) {
      const nm = NAME[led] ? NAME[led].slice(0, -1) : 'card';
      return SEATS[winner] + (winner === 0 ? ' win' : ' wins') + ' with ' + kLabel(k) + ': Reverse was led, so the lowest ' + nm + ' takes it and nobody can trump in.';
    }
    if (en(lk, 'sanctuary')) {
      const nm = NAME[led] ? NAME[led].slice(0, -1) : 'card';
      return SEATS[winner] + (winner === 0 ? ' win' : ' wins') + ' with ' + kLabel(k) + ': Sanctuary was led, so nobody could trump in and the highest ' + nm + ' takes it.';
    }
    let lead2 = '';
    if (winner !== leader && (lk.x === 'twoleft' || (en(lk, 'outcast')))) { lead2 = ' (the ' + label(lk.c) + ' that was led can never win)'; led = kSuit(resolveTwo(k, null, trump), trump); }
    if (!NAME[led]) led = kSuit(k, trump);
    const verb = winner === 0 ? 'win' : 'wins';
    const jokerOut = cards.some((x, s) => x === 'JK' && s !== winner);
    if (c === 'JK') return who + ' ' + verb + ' with the Joker, the highest card in the game.';
    if (k.tie && trump && rankOf(c) === 'J' && (suitOf(c) === trump || suitOf(c) === TWIN[trump]) && jokerOut)
      return who + ' ' + verb + ' with ' + label(c) + ': under Quick Draw your bowers tie the Joker, and it was played first.';
    if (trump && rankOf(c) === 'J' && suitOf(c) === trump) return who + ' ' + verb + ' with the right bower (J' + SYM[trump] + '), the top trump after the Joker.';
    if (trump && rankOf(c) === 'J' && suitOf(c) === TWIN[trump]) return who + ' ' + verb + ' with the left bower: ' + label(c) + ' counts as a ' + NAME[trump].slice(0, -1) + ' this hand and ranks just under J' + SYM[trump] + '.';
    const beatAce = en(k, 'giant') && cards.some((x, s) => s !== winner && x && rankOf(x) === 'A' && kSuit(K(L, s, x), trump) === kSuit(k, trump));
    if (beatAce) return who + ' ' + verb + ' with ' + kLabel(k) + ': a Giant-killer beats the Ace of its own suit.';
    const twinOut = cards.some((x, s) => s !== winner && x && x !== c && kIsTrump(K(L, s, x), trump) && kTrumpRank(K(L, s, x), trump) === kTrumpRank(k, trump));
    const sworn = en(k, 'sworn') && trump && suitOf(c) !== trump ? ' (Trump-sworn: it counts as a ' + VNAME[kRank(k)] + ' of trumps)' :
      en(k, 'glass') && trump && !(rankOf(c) === 'J' && (suitOf(c) === trump || suitOf(c) === TWIN[trump])) ? ' (Glass: it counts as the Ace of trumps)' : '';
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
    // open misère scores 500 but ranks between 10♦ (480) and 10♥ (500), so it carries its own rank
    if (ACTS[act].openMisere) out.push({ t: 0, s: 'OMIS', v: ACTS[act].openMisere, r: 490 });
    return out.sort((a, b) => (a.r || a.v) - (b.r || b.v));
  }
  /* A sweep scores the top-level value of the bid suit. */
  function sweepValue(act, s) { const ts = Object.keys(ACTS[act].bids).map(Number); return ACTS[act].bids[Math.max(...ts)][s]; }
  const bidText = b => b.s === 'MIS' ? 'Mis\u00e8re' : b.s === 'OMIS' ? 'Open mis\u00e8re' : b.t + (b.s === 'NT' ? 'NT' : SYM[b.s]);
  /* The opponents' attack (the fight redesign, 2026-10-27): every point they score in a hand (a made contract,
     10 a defending trick) hits your health at the act's share, to the nearest 5. The share shrinks as the acts'
     scores grow (Act I bids are 20-100, Act III's 40-520). A gang's Dead Eye (L.foe.hitMul) hits harder.
     Without a run (L), half. */
  const HIT = { 1: 0.5, 2: 0.35, 3: 0.22 };   // tuned over whole stand-in runs (btp-run.js, FOE); 0.3 / 0.2 / 0.15 until 2026-10-29
  const hitShare = L => L ? HIT[L.act] * ((L.foe && L.foe.hitMul) || 1) : 1 / 2;
  const hitWord = L => Math.round(100 * hitShare(L)) + '%';
  const damageOf = (v, L) => Math.round(Math.max(0, v) * hitShare(L) / 5) * 5;

  /* ---------------- the hand ---------------- */
  function say(L, text, kind) { L.log.push({ n: L.log.length, hand: L.handNo, text, kind: kind || '' }); }

  /* Deal a hand. Owned cards fill seat 0's seed slots first; owned cards not
     seeded go into the deck as plain cards. */
  /* The table deck as this run has changed it: the act's deck, less the cards Removed (or shattered
     Glass), plus Forged copies. The kitty takes whatever is over the four hands. */
  function deckOf(L) {
    const gone = L.removed || [];
    return deckFor(L.act).filter(c => !gone.includes(c)).concat((L.forged || []).filter(c => !gone.includes(c) && deckFor(L.act).includes(base(c))));
  }
  /* Every card of the table deck is somewhere, exactly once: in a hand, the kitty, put back under it, on the
     table, or in a team's tricks (once a trick is scored its cards are in `taken` until it is cleared). */
  function census(L) {
    const h = L.h, seen = {};
    const add = c => { if (c) seen[c] = (seen[c] || 0) + 1; };
    h.hands.forEach(x => x.forEach(add));
    (h.kitty || []).forEach(add);
    (h.discards || []).forEach(add);
    h.taken[0].concat(h.taken[1]).forEach(add);
    if (h.phase !== 'trick') h.trick.forEach(add);
    // against the deck this hand was dealt from: Glass can shatter out of the table deck mid-hand
    const deck = h.deck || deckOf(L), missing = deck.filter(c => !seen[c]);
    const extra = Object.keys(seen).filter(c => !deck.includes(c) || seen[c] > 1);
    return { ok: !missing.length && !extra.length, missing, extra };
  }
  function deal(L) {
    const A = ACTS[L.act];
    const deck = deckOf(L);
    const hands = [[], [], [], []];
    let pool = deck.slice();
    if (L.dealRule === 'twins') {
      const js = shuffle(L, ['JH', 'JD']);
      hands[1].push(js[0]); hands[3].push(js[1]);
      pool = pool.filter(c => c !== 'JH' && c !== 'JD');
    }
    if (foeHas(L, 'sleeve')) {
      // Ace up the Sleeve: West and East are each dealt an Ace (never one you own)
      const aces = shuffle(L, pool.filter(c => c !== 'JK' && rankOf(c) === 'A' && !(L.owned || []).includes(c))).slice(0, 2);
      aces.forEach((c, i) => hands[i ? 3 : 1].push(c));
      pool = pool.filter(c => !aces.includes(c));
    }
    const owned = (L.owned || []).filter(c => pool.includes(c));
    const seeds = foeHas(L, 'marked') ? 0 : A.seeds + (hasBuff(L, 'holdout') ? 1 : 0);
    const seeded = shuffle(L, owned.slice()).slice(0, seeds);
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
      locked: null, unlocked: false, misere: false, out: null, fail: false, dir: L.call === 'corner' ? -1 : 1, deck
    };
    if (L.curse === 'locked') {
      L.h.locked = pick(L, hands[0]);
      say(L, 'Handcuffed: your ' + label(L.h.locked) + ' is chained until your team wins a trick.', 'rule');
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
    return L.h.hands[0].reduce((n, c) => { const k = K(L, 0, c); return n + (en(k, 'double') ? 1 : en(k, 'triple') ? 2 : 0); }, 0);
  }
  function extraBids(L, seat) {
    const A = ACTS[L.act], room = extraTricks(L, seat), out = [];
    for (const t of Object.keys(A.extra || {}).map(Number)) if (t - A.hand <= room) for (const s of Object.keys(A.extra[t])) out.push({ t, s, v: A.extra[t][s] });
    return out;
  }
  const rankOfBid = b => b.r || b.v;
  function legalBids(L) {
    const min = L.h.high ? rankOfBid(L.h.high) : 0;
    return bidList(L.act).concat(extraBids(L, L.h.turn)).filter(b => rankOfBid(b) > min && !tooLow(L, L.h.turn, b)).sort((a, b) => rankOfBid(a) - rankOfBid(b));
  }
  const no = why => ({ ok: false, why });
  /* The Wallflowers never bid, so your team must: the second of you to speak may not pass with no bid made. */
  // and with them at the table your team's contracts start at this many tricks (misère aside)
  const WALL = { min: 8 };   // the fight redesign (2026-10-27): at 7 the Undertakers were beaten 98% of the time, at 8 about 65%
  const tooLow = (L, seat, b) => L.boss === 'wallflowers' && team(seat) === 0 && b.t > 0 && b.t < WALL.min;
  const mustBid = (L, seat) => L.boss === 'wallflowers' && team(seat) === 0 && !!L.h && !L.h.high && L.h.passed[partnerOf(seat)];
  function bid(L, seat, b) {
    const h = L.h;
    if (h.phase !== 'bid' || h.turn !== seat) return no('not your turn to bid');
    if (!b && mustBid(L, seat)) return no('the Undertakers never bid: your team must bid this hand');
    if (b && tooLow(L, seat, b)) return no('against the Undertakers your team must bid at least ' + WALL.min);
    if (b) {
      const ex = extraBids(L, seat).find(x => x.t === b.t && x.s === b.s);
      const v = b.s === 'MIS' ? ACTS[L.act].misere : b.s === 'OMIS' ? ACTS[L.act].openMisere : ex ? ex.v : ACTS[L.act].bids[b.t] && ACTS[L.act].bids[b.t][b.s];
      if (!v) return no('no such bid');
      const r = b.s === "OMIS" ? 490 : v;
      if (h.high && r <= rankOfBid(h.high)) return no('a bid must beat ' + bidText(h.high));
      h.high = { seat, t: b.t, s: b.s, v, r };
      h.bids.push({ seat, t: b.t, s: b.s, v, r });
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
    h.trump = c.s === 'NT' || c.s === 'MIS' || c.s === 'OMIS' ? null : c.s;
    if (c.s === 'MIS' || c.s === 'OMIS') {
      h.misere = true;
      h.open = c.s === 'OMIS';            // open misère: the hand goes face up after the first trick
      h.out = partnerOf(c.seat);
      say(L, SEATS[c.seat] + (c.seat === 0 ? ' win' : ' wins') + ' the auction with misère: ' + (c.seat === 0 ? 'you' : SEATS[c.seat]) + ' must lose every trick, playing alone. ' +
        (h.out === 0 ? 'You sit' : (h.out === 2 ? 'Nan' : SEATS[h.out]) + ' sits') + ' this hand out. No trumps; the Joker wins any trick it is in.' + (h.open ? ' Open mis\u00e8re: the hand goes face up after the first trick.' : ''), 'contract');
    } else
    say(L, SEATS[c.seat] + (c.seat === 0 ? ' win' : ' wins') + ' the auction with ' + bidText(c) + '. ' +
      (h.trump ? NAME[h.trump][0].toUpperCase() + NAME[h.trump].slice(1) + ' are trumps; J' + SYM[h.trump] + ' is the right bower and J' + SYM[TWIN[h.trump]] + ' the left bower.' : 'No trumps: only the Joker is above the suits.'), 'contract');
    h.turn = c.seat;
    for (let p = 0; p < 4; p++) sort(L, p);
    if (L.curse === 'nokitty' || L.call === 'nokitty') {
      say(L, L.call === 'nokitty' ? 'No Kitty, calls the Caller: the kitty stays face down.' : 'No kitty this level: the kitty stays face down.', 'rule');
      afterKitty(L);
      return;
    }
    if (!h.kitty.length) { afterKitty(L); return; }
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
    if (foeHas(L, 'bushwhack') && team(h.contractor) === 0) {
      h.leader = h.turn = 1;
      say(L, 'Bushwhacked: West leads the first trick.', 'rule');
    } else if (L.call === 'promenade' && !h.misere) {
      h.leader = h.turn = partnerOf(h.contractor);
      say(L, 'Promenade: ' + (h.leader === 0 ? 'you lead' : (h.leader === 2 ? 'Nan leads' : SEATS[h.leader] + ' leads')) + ' the first trick for ' + (h.contractor === 0 ? 'you' : h.contractor === 2 ? 'Nan' : SEATS[h.contractor]) + '.', 'rule');
    }
    if (team(h.contractor) === 1) {
      const v = h.contract.v;
      h.intent = { seat: h.contractor, contract: h.contract, dmg: damageOf(v, L), dmgSweep: h.misere ? damageOf(v, L) : damageOf(sweepValue(L.act, h.contract.s), L) };
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
    if (leading && en(k, 'herald') && h.out !== partnerOf(seat)) {
      const p = partnerOf(seat), suit = kSuit(k, h.trump);
      const n = h.hands[p].filter(x => kSuit(K(L, p, x), h.trump) === suit).length;
      h.herald = { seat, partner: p, suit, n, trick: h.trickNo + 1 };
      say(L, 'Herald: ' + (p === 2 ? 'Nan holds ' : 'You hold ') + n + ' ' + (suit === '*' || suit === '#' ? 'cards of that suit' : NAME[suit]) + '.', 'rule');
    }
    if (leading && h.trickNo === 0 && L.call === 'reverse' && !(en(k, 'sanctuary'))) say(L, 'Reverse, calls the Caller: the lowest ' + (NAME[kSuit(k, h.trump)] || 'card').replace(/s$/, '') + ' wins this first trick, and nobody can trump in.', 'rule');
    else if (en(k, 'reverse') && leading) say(L, 'Reverse: the lowest ' + (NAME[kSuit(k, h.trump)] || 'card').replace(/s$/, '') + ' wins this trick, and nobody can trump in.', 'rule');
    if (en(k, 'sanctuary') && leading) say(L, 'Sanctuary: nobody can trump in on this trick.', 'rule');
    if (h.trump && rankOf(card) === 'J' && suitOf(card) === TWIN[h.trump])
      say(L, label(card) + ' is the left bower: it counts as a ' + NAME[h.trump].slice(0, -1) + ' this hand.', 'rule');
    else if (h.trump && en(k, 'glass')) say(L, label(card) + ' is Glass: it counts as the Ace of ' + NAME[h.trump] + ' this hand.', 'rule');
    else if (h.trump && en(k, 'sworn') && suitOf(card) !== h.trump)
      say(L, label(card) + ' is Trump-sworn: it counts as a ' + VNAME[kRank(k)] + ' of ' + NAME[h.trump] + ' this hand.', 'rule');
    const players = h.out === null || h.out === undefined ? 4 : 3;
    if (h.trick.filter(Boolean).length < players) { do h.turn = (h.turn + dirOf(L)) % 4; while (h.turn === h.out); return { ok: true }; }
    const w = winnerOf(h.trick, h.leader, h.trump, L);
    const t = team(w);
    h.tricks[t]++;
    h.trickNo++;
    h.taken[t].push(...h.trick.filter(Boolean));
    h.winners.push(w);
    h.last = { cards: h.trick.slice(), leader: h.leader, winner: w, reason: explain(h.trick, h.leader, w, h.trump, L), no: h.trickNo };
    h.played = (h.played || []).concat([{ cards: h.last.cards, leader: h.leader, winner: w }]);
    const wk2 = K(L, w, h.trick[w]);
    if ((en(wk2, 'double') || en(wk2, 'triple')) && !h.misere) {
      const more = en(wk2, 'triple') ? 2 : 1;
      h.bonus = h.bonus || [0, 0];
      h.bonus[t] += more;
      say(L, label(h.trick[w]) + (more === 2 ? ' is a Triple Threat: that trick counts as three.' : ' is Doubly Woubly: that trick counts as two.'), 'rule');
    }
    const hot = L.hexes ? h.trick.filter(c => c && L.hexes[c] === 'potato') : [];
    if (hot.length) {
      h.potato = h.potato || [0, 0];
      h.potato[t] += 20 * hot.length;
      say(L, (t === 0 ? 'Your team catches' : 'They catch') + ' the Dynamite (' + hot.map(label).join(', ') + '): \u2212' + 20 * hot.length + '.', 'rule');
    }
    // in a misère the opponents taking a trick is good for your side, whoever bid it
    say(L, h.last.reason, (h.misere ? t === 1 : t === 0) ? 'won' : 'lost');
    if (h.open && h.trickNo === 1) say(L, (h.contractor === 0 ? 'Your' : SEATS[h.contractor] + '\u2019s') + ' hand goes face up: ' + h.hands[h.contractor].map(label).join(' ') + '.', 'rule');
    if (h.misere && t === team(h.contractor)) {
      h.fail = true;
      say(L, (h.contractor === 0 ? 'You took' : SEATS[h.contractor] + ' took') + ' a trick: the misère fails.', 'rule');
    }
    if (t === 0 && h.locked && !h.unlocked) { h.unlocked = true; if (h.hands[0].includes(h.locked)) say(L, 'Your ' + label(h.locked) + ' is unlocked.', 'rule'); }
    h.phase = 'trick';
    return { ok: true, trick: h.last };
  }

  /* Score the hand. Your team's points shoot the gang's health down (the run adds them up); theirs hit your
     health at the act's share (damageOf). A set takes its value off the side that bid. */
  function score(L) {
    const h = L.h, act = L.act, c = h.contract, ct = team(h.contractor), dt = 1 - ct;
    if (h.misere) return scoreMisere(L);
    const got = counted(h, ct), gotD = counted(h, dt);
    const made = got >= c.t;
    const sweep = made && h.tricks[ct] === ACTS[act].hand;
    const value = sweep ? Math.max(c.v, sweepValue(act, c.s)) : c.v;
    const near = !made && ct === 0 && got === c.t - 1 && hasBuff(L, 'nearmiss');
    const pts = [0, 0];
    pts[ct] += made ? value : (near ? 0 : -c.v);
    pts[dt] += 10 * gotD;
    const lines = [];
    const who = ct === 0 ? (h.contractor === 0 ? 'You' : 'North') : SEATS[h.contractor];
    if (made) lines.push(who + ' made ' + bidText(c) + (sweep && value > c.v ? ' and swept every trick, scoring ' + value + ' instead of ' + c.v : '') + ': ' + (ct === 0 ? '+' : 'they score ') + value + '.');
    else if (near) lines.push(who + ' needed ' + c.t + ' tricks and took ' + got + ', one short: Just a Flesh Wound, so it costs nothing.');
    else lines.push(who + ' needed ' + c.t + ' tricks and took ' + got + ': ' + (ct === 0 ? '−' + c.v + ' for your team.' : 'set! They lose ' + c.v + ' and their attack misses.'));
    if (gotD) lines.push((dt === 0 ? 'Your team' : 'They') + ' took ' + gotD + ' trick' + (gotD > 1 ? 's' : '') + ' defending: ' + (dt === 0 ? '+' : '') + 10 * gotD + '.');
    if (h.bonus && (h.bonus[0] || h.bonus[1])) lines.push('(Doubly Woubly and Triple Threat cards counted ' + (h.bonus[0] + h.bonus[1]) + ' extra trick' + (h.bonus[0] + h.bonus[1] > 1 ? 's' : '') + '.)');
    potatoLines(h, pts, lines);
    const f = fight(L, pts, lines, { ct, made, near, value, defend: dt === 0 ? gotD : 0 });
    h.result = { made, sweep, value, pts, hit: f.hit, dmg: f.dmg, backfire: f.backfire, delta: f.hit - f.dmg, lines, tricks: h.tricks.slice(), counted: [counted(h, 0), counted(h, 1)], contractor: h.contractor, near };
    lines.forEach(t => say(L, t, 'score'));
    h.phase = 'done';
  }
  /* What the hand does in the fight, after the 500 score (the user's, 2026-10-29: losing a hand must hurt). `hit`
     comes off the gang's health: your team's points, never below nothing (a set can't heal them), with your cards'
     and buffs' extras. `dmg` comes off yours: their points at the act's share; your own failed contract BACKFIRES,
     hitting you for its value at that share as if they had made it (Just a Flesh Wound spares you; a Lucky
     Horseshoe that won a trick halves it); then the gang's debuffs, your armour and your cards' Iron Plates.
     Without a run (L) or a fight, hit and dmg are the plain scores. */
  const FX = { backfire: 1, hollow: 15, plate: 15, ricochet: 10, bullseye: 40, deadman: 25, keg: 30, kegBurn: 15, vest: 5, bandolier: 5, snakebite: 5, gutshot: 10, scope: 0.25 };
  function fight(L, pts, lines, o) {
    const h = L.h, fx = h.fx || { hit: 0, block: 0, burn: 0 };
    let hit = pts[0];
    if (o.defend && hasBuff(L, 'bandolier')) { hit += FX.bandolier * o.defend; lines.push('Bandolier: your defending tricks hit ' + FX.bandolier * o.defend + ' harder.'); }
    if (o.defend && foeHas(L, 'armour')) { const d = 10 * o.defend + (hasBuff(L, 'bandolier') ? FX.bandolier * o.defend : 0); hit -= d; lines.push('Thick Hide: your defending tricks don\u2019t hurt them (' + d + ').'); }
    if (o.ct === 0 && o.made && hasBuff(L, 'scope') && !h.misere) { const x = Math.round(o.value * FX.scope / 5) * 5; hit += x; lines.push('Rifle Scope: your contract hits ' + x + ' harder.'); }
    if (fx.hit) { hit += fx.hit; lines.push('Your cards\u2019 shots this hand: +' + fx.hit + '.'); }
    if (hasBuff(L, 'holster') && L.handNo === 1 && L.foe && hit > 0) { lines.push('Quick Holster: the fight\u2019s first hand hits double (+' + hit + ').'); hit *= 2; }
    hit = Math.max(0, hit);
    let dmg = damageOf(pts[1], L);
    if (dmg) lines.push('Their ' + pts[1] + ' points hit you: \u2212' + dmg + ' health (' + hitWord(L) + ').');
    let backfire = 0;
    if (L.foe && o.ct === 0 && !o.made && !o.near) {
      backfire = damageOf(FX.backfire * h.contract.v, L);
      if (h.shoe) backfire = Math.round(backfire / 10) * 5;
      if (backfire) lines.push('Your contract backfires: \u2212' + backfire + ' health' + (h.shoe ? ' (halved by your Lucky Horseshoe)' : '') + '.');
      dmg += backfire;
    }
    if (foeHas(L, 'snakebite') && h.tricks[1]) { dmg += FX.snakebite * h.tricks[1]; lines.push('Snakebite: each trick they took bit you for ' + FX.snakebite + ' (\u2212' + FX.snakebite * h.tricks[1] + ').'); }
    if (foeHas(L, 'gutshot')) { dmg += FX.gutshot; lines.push('Gut Shot: you bleed \u2212' + FX.gutshot + '.'); }
    if (dmg && hasBuff(L, 'vest')) { const v = Math.min(dmg, FX.vest); dmg -= v; lines.push('Leather Vest: \u2212' + v + ' of it turned aside.'); }
    if (dmg && fx.block) { const b = Math.min(dmg, fx.block); dmg -= b; lines.push('Iron Plate: ' + b + ' of it blocked.'); }
    if (fx.burn) { dmg += fx.burn; lines.push('Powder Keg burns: \u2212' + fx.burn + '.'); }
    return { hit, dmg, backfire };
  }

  /* Misère: made if the contractor took no trick. No defender points; a made
     opponents' misère hits you like any other points they score. */
  function scoreMisere(L) {
    const h = L.h, c = h.contract, ct = team(h.contractor);
    const made = h.tricks[ct] === 0, pts = [0, 0];
    pts[ct] = made ? c.v : -c.v;
    const who = h.contractor === 0 ? 'You' : h.contractor === 2 ? 'Nan' : SEATS[h.contractor];
    const lines = [made ? who + ' lost every trick: misère made, ' + (ct === 0 ? '+' : 'they score ') + c.v + '.'
      : who + (h.contractor === 0 ? ' were' : ' was') + ' made to take a trick: misère failed, ' + (ct === 0 ? '\u2212' + c.v + ' for your team.' : 'they lose ' + c.v + ' and their attack misses.')];
    potatoLines(h, pts, lines);
    const f = fight(L, pts, lines, { ct, made, near: false, value: c.v, defend: 0 });
    h.result = { made, sweep: false, value: c.v, pts, hit: f.hit, dmg: f.dmg, backfire: f.backfire, delta: f.hit - f.dmg, lines, tricks: h.tricks.slice(), contractor: h.contractor, near: false, misere: true };
    lines.forEach(t => say(L, t, 'score'));
    h.phase = 'done';
  }

  /* Tricks that count toward a contract: Doubly Woubly wins count twice. */
  const counted = (h, t) => h.tricks[t] + (h.bonus ? h.bonus[t] : 0);
  /* Hot Potatoes caught this hand come off each team's points. */
  function potatoLines(h, pts, lines) {
    if (!h.potato) return;
    for (const t of [0, 1]) if (h.potato[t]) { pts[t] -= h.potato[t]; lines.push((t === 0 ? 'Your team' : 'They') + ' caught the Dynamite: \u2212' + h.potato[t] + '.'); }
  }

  const api = {
    SUITS, SYM, NAME, TWIN, RED, RANKV, VNAME, SEATS, ACTS, ENH_WORD,
    rnd, shuffle, pick, rankOf, suitOf, base, label, deckFor, deckOf, census, team, partnerOf, grown, maxUp, stepDown,
    K, plainK, kSuit, kRank, kTrumpRank, kIsTrump, kBeats, kLabel,
    effSuit, trumpRank, isTrump, canPlay, winnerOf, beats, explain,
    bidValue, bidList, sweepValue, bidText, damageOf, HIT, hitShare, hitWord, rankOfBid, mustBid, WALL, extraTricks, extraBids, counted, resolveTwo,
    en, enhsOf, foeHas, hasBuff, FX, fight,
    say, deal, sort, legalBids, bid, discard, afterKitty, ack, ledSuit, legalPlays, play, score
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BtpEngine = api;
})(typeof window !== 'undefined' ? window : this);
