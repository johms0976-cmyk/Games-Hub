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
  // Misère (Act II) and open misère (Act III) are in the design, not built yet.

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
    return { c, seat, m: own && L.mods ? (L.mods[c] || null) : null, tie: own && !!(L.buffs && L.buffs.includes('bowertie')) };
  }
  const plainK = c => ({ c, seat: null, m: null, tie: false });
  function kSuit(k, trump) {
    const c = k.c;
    if (c === 'JK') return trump || '*';
    if (trump && k.m && k.m.enh === 'sworn') return trump;
    if (trump && rankOf(c) === 'J' && suitOf(c) === TWIN[trump]) return trump;
    return suitOf(c);
  }
  const kRank = k => k.c === 'JK' ? 100 : grown(k.c, k.m && k.m.up);
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
  function winnerOf(cards, leader, trump, L) {
    let w = leader, wk = K(L, leader, cards[leader]);
    const led = kSuit(wk, trump);
    for (let i = 1; i < 4; i++) {
      const p = (leader + i) % 4, c = cards[p];
      if (!c) continue;
      const k = K(L, p, c);
      if (kBeats(k, wk, led, trump)) { w = p; wk = k; }
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
    const k = K(L, winner, cards[winner]), c = k.c, led = kSuit(K(L, leader, cards[leader]), trump), who = SEATS[winner];
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
    if (kIsTrump(k, trump) && led !== trump) return who + ' ' + verb + ' by trumping in with ' + kLabel(k) + sworn + '.' + tieNote;
    return who + ' ' + verb + ' with ' + kLabel(k) + sworn + ', the highest ' + (led === trump ? 'trump' : NAME[led].slice(0, -1)) + ' played.' + tieNote;
  }

  /* ---------------- bids ---------------- */
  const bidValue = (act, t, s) => ACTS[act].bids[t][s];
  function bidList(act) {
    const out = [];
    for (const t of Object.keys(ACTS[act].bids).map(Number))
      for (const s of Object.keys(ACTS[act].bids[t])) out.push({ t, s, v: ACTS[act].bids[t][s] });
    return out.sort((a, b) => a.v - b.v);
  }
  /* A sweep scores the top-level value of the bid suit. */
  function sweepValue(act, s) { const ts = Object.keys(ACTS[act].bids).map(Number); return ACTS[act].bids[Math.max(...ts)][s]; }
  const bidText = b => b.t + (b.s === 'NT' ? 'NT' : SYM[b.s]);
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
      locked: null, unlocked: false
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

  function legalBids(L) {
    const min = L.h.high ? L.h.high.v : 0;
    return bidList(L.act).filter(b => b.v > min);
  }
  const no = why => ({ ok: false, why });
  function bid(L, seat, b) {
    const h = L.h;
    if (h.phase !== 'bid' || h.turn !== seat) return no('not your turn to bid');
    if (b) {
      const v = ACTS[L.act].bids[b.t] && ACTS[L.act].bids[b.t][b.s];
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
    h.trump = c.s === 'NT' ? null : c.s;
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
      h.intent = { seat: h.contractor, contract: h.contract, dmg: damageOf(v), dmgSweep: damageOf(sweepValue(L.act, h.contract.s)) };
      say(L, SEATS[h.contractor] + "'s intent: " + bidText(h.contract) + ' costs you ' + h.intent.dmg + ' if they make it. Stop them taking ' + h.contract.t + ' tricks to block it.', 'intent');
      h.phase = 'intent';
    } else h.phase = 'play';
  }
  function ack(L) {
    const h = L.h;
    if (h.phase === 'intent') { h.phase = 'play'; return { ok: true }; }
    if (h.phase === 'trick') {
      h.trick = [null, null, null, null];
      if (h.trickNo >= ACTS[L.act].hand) { score(L); return { ok: true }; }
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
    if (led && hand.some(x => kSuit(K(L, seat, x), tr) === led)) legal = hand.filter(x => kSuit(K(L, seat, x), tr) === led);
    if (seat === 0 && h.locked && !h.unlocked && legal.length > 1) legal = legal.filter(c => c !== h.locked);
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
    h.trick[seat] = card;
    const k = K(L, seat, card);
    if (h.trump && rankOf(card) === 'J' && suitOf(card) === TWIN[h.trump])
      say(L, label(card) + ' is the left bower: it counts as a ' + NAME[h.trump].slice(0, -1) + ' this hand.', 'rule');
    else if (h.trump && k.m && k.m.enh === 'sworn' && suitOf(card) !== h.trump)
      say(L, label(card) + ' is Trump-sworn: it counts as a ' + VNAME[kRank(k)] + ' of ' + NAME[h.trump] + ' this hand.', 'rule');
    if (h.trick.filter(Boolean).length < 4) { h.turn = (h.turn + 1) % 4; return { ok: true }; }
    const w = winnerOf(h.trick, h.leader, h.trump, L);
    const t = team(w);
    h.tricks[t]++;
    h.trickNo++;
    h.taken[t].push(...h.trick);
    h.winners.push(w);
    h.last = { cards: h.trick.slice(), leader: h.leader, winner: w, reason: explain(h.trick, h.leader, w, h.trump, L), no: h.trickNo };
    say(L, h.last.reason, t === 0 ? 'won' : 'lost');
    if (t === 0 && h.locked && !h.unlocked) { h.unlocked = true; if (h.hands[0].includes(h.locked)) say(L, 'Your ' + label(h.locked) + ' is unlocked.', 'rule'); }
    h.phase = 'trick';
    return { ok: true, trick: h.last };
  }

  /* Score the hand. Health is your team's running score; a made opponent
     contract also costs you half its value. */
  function score(L) {
    const h = L.h, act = L.act, c = h.contract, ct = team(h.contractor), dt = 1 - ct;
    const made = h.tricks[ct] >= c.t;
    const sweep = made && h.tricks[ct] === ACTS[act].hand;
    const value = sweep ? Math.max(c.v, sweepValue(act, c.s)) : c.v;
    const near = !made && ct === 0 && h.tricks[ct] === c.t - 1 && (L.buffs || []).includes('nearmiss');
    const pts = [0, 0];
    pts[ct] += made ? value : (near ? 0 : -c.v);
    pts[dt] += 10 * h.tricks[dt];
    const dmg = (ct === 1 && made) ? damageOf(value) : 0;
    const lines = [];
    const who = ct === 0 ? (h.contractor === 0 ? 'You' : 'North') : SEATS[h.contractor];
    if (made) lines.push(who + ' made ' + bidText(c) + (sweep && value > c.v ? ' and swept every trick, scoring ' + value + ' instead of ' + c.v : '') + ': ' + (ct === 0 ? '+' : 'they score ') + value + '.');
    else if (near) lines.push(who + ' needed ' + c.t + ' tricks and took ' + h.tricks[ct] + ', one short: Near Miss, so it costs nothing.');
    else lines.push(who + ' needed ' + c.t + ' tricks and took ' + h.tricks[ct] + ': ' + (ct === 0 ? '−' + c.v + ' for your team.' : 'set! They lose ' + c.v + ' and their attack misses.'));
    if (h.tricks[dt]) lines.push((dt === 0 ? 'Your team' : 'They') + ' took ' + h.tricks[dt] + ' trick' + (h.tricks[dt] > 1 ? 's' : '') + ' defending: ' + (dt === 0 ? '+' : '') + 10 * h.tricks[dt] + '.');
    if (dmg) lines.push('Their contract lands: −' + dmg + ' health (half of ' + value + ').');
    const delta = pts[0] - dmg;
    h.result = { made, sweep, value, pts, dmg, delta, lines, tricks: h.tricks.slice(), contractor: h.contractor, near };
    lines.forEach(t => say(L, t, 'score'));
    h.phase = 'done';
  }

  const api = {
    SUITS, SYM, NAME, TWIN, RED, RANKV, VNAME, SEATS, ACTS, ENH_WORD,
    rnd, shuffle, pick, rankOf, suitOf, label, deckFor, team, partnerOf, grown, maxUp,
    K, plainK, kSuit, kRank, kTrumpRank, kIsTrump, kBeats, kLabel,
    effSuit, trumpRank, isTrump, canPlay, winnerOf, beats, explain,
    bidValue, bidList, sweepValue, bidText, damageOf,
    say, deal, sort, legalBids, bid, discard, afterKitty, ack, ledSuit, legalPlays, play, score
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BtpEngine = api;
})(typeof window !== 'undefined' ? window : this);
