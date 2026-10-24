'use strict';
/* Bow to Your Partner — the run: each act's five-level path around the hand engine.
 * Act I is the Church Hall; Act II, the Barn Dance, follows in the same run.
 *
 *   Act start   pick 1 of 3 cards to own (Act II offers the new black suits)
 *   1 Dance     the easy objective pool
 *   2 Dance  or Barn Gossip (an event)
 *   3 Punch Bowl (one action: General Store, Rest, Polish or Cleanse; Cash in is free)
 *   4 Dance  or Dance-off (an elite: one curse, pays a buff)
 *   5 Hoedown   the act's rival pair, a race (see BOSS)
 *
 * Your running 500 score is the run's health (-500 ends it). The run is plain
 * JSON (L), saved by the page after every step. Every number here is a first
 * guess from the design doc, to be retuned after play.
 *
 *   newRun({ seed, objective, tips })  the run, at the act-start pick
 *   act(L, kind, arg)                  your move (see the switch at the foot)
 *   aiStep(L, stand)                   one AI seat moves; false when it is yours
 *   whoseMove(L)                       'you' | 'ai' | 'hold' | 'summary' | 'over' | 'screen' | 'end'
 *   coach(L)                           Nan's tip for this moment on a first run, or null
 *
 * Run phases on L.phase: 'actstart', 'map', 'hand' (see L.h.phase), 'summary',
 * 'over' (a level's stars), 'reward', 'target' (put an enhancement on a card),
 * 'event', 'camp', 'shop', 'polish', 'release', 'victory', 'runover'.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const E = node ? require('./btp-engine.js') : root.BtpEngine;
  const AI = node ? require('./btp-ai.js') : root.BtpAI;

  /* Hands per level, by act: shorter levels as hands get bigger (the design's 3 / 3 / 2). */
  const HANDS = { 1: { dance: 3, elite: 3, boss: 4 }, 2: { dance: 3, elite: 3, boss: 3 } };
  const LAST_ACT = 2;                       // Act III isn't built yet
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
  const PARTNERS = {
    nan: { id: 'nan', name: 'Nan', title: 'the Steady One', start: 'AH', ability: 'nod',
           lines: { won: ['Lovely, dear.', 'That’s the way.', 'Steady does it.'],
                    lost: ['Never mind, dear.', 'Chin up.', 'We’ll have the next one.'],
                    made: ['Well bid!', 'Just as we planned.'], set: ['We stopped them, dear!', 'Not today, thank you.'],
                    failed: ['Oh dear. We’ll get it back.'], theirs: ['They earned that one.'] } }
  };

  /* Objectives, with the acts they appear in. Team-wide: North's tricks count.
     Act I accident rates with the AI in every seat and nobody trying
     (tests/measure.js, 400 levels): every 45% (the easy opener), lowly9 23%,
     harvest 33%, setthem 22% (40% once the opponents bid bolder), lastword 31%,
     bagjack 41%. The design doc aims for 20-35%. Act II (400 levels, 2026-10-24):
     blacks at 21 cards 33%, showoff at 3 tricks 34%, setthem 43% (2 contracts: 10%),
     acehunter at 3 Aces 18% (2: 43%), ruff at 2 tricks 29%, lefthook 42% (2: 8%),
     holdline with no opponents' contract 21% (at most one: 63%), smoke 36% (the
     Joker anywhere before the last trick happened in 98% of levels, so it must
     fall to your team's lead). makemis 3%, so it is for Dance-offs only.
     kind 'limit': holds until it breaks, judged at the end of the level. */
  const OBJECTIVES = {
    every:    { name: 'Every Hand', text: 'Win a trick in every hand', of: 3, easy: true, acts: [1] },
    lowly9:   { name: 'Small Fry', text: 'Win a trick with a 9 or a 10', of: 1, acts: [1] },
    harvest:  { name: 'Red Harvest', text: 'Win 11 hearts across the level', of: 11, acts: [1] },
    setthem:  { name: 'Set Them', text: 'Defeat an opponents\u2019 contract', of: 1, acts: [1, 2] },
    lastword: { name: 'Strong Finish', text: 'Win the last trick of hands 2 and 3', of: 2, acts: [1] },
    bagjack:  { name: 'Bag a Jack', text: 'Win 3 tricks that hold a red Jack', of: 3, acts: [1] },
    blacks:   { name: 'Black Suits Rising', text: 'Win BLACKS black cards across the level', of: 0, acts: [2], easy: true },
    showoff:  { name: 'Show Off', text: 'Win SHOWOFF tricks with cards you own', of: 0, acts: [2] },
    acehunter: { name: 'Ace Hunter', text: 'Capture 3 Aces the opponents played', of: 3, acts: [2] },
    ruff:     { name: 'Ruff Stuff', text: 'Win 2 tricks by trumping a suit you\u2019re out of', of: 2, acts: [2] },
    lefthook: { name: 'Left Hook', text: 'Win a trick with the left bower', of: 1, acts: [2] },
    holdline: { name: 'Hold the Line', text: 'The opponents make no contract this level', of: 0, acts: [2], kind: 'limit' },
    smoke:    { name: 'Smoke Out the Joker', text: 'Make an opponent play the Joker on a trick your team led', of: 1, acts: [2] },
    makemis:  { name: 'Make a Mis\u00e8re', text: 'You or Nan make a mis\u00e8re', of: 1, acts: [2], elite: true }
  };
  /* The Hoedown: a race. Both objectives are public; checked at the end of each
     hand; the first team to finish wins, and a tie or no finish goes to the
     higher score this level. */
  const BOSS = {
    twins:  { name: 'The Twins', short: 'Twins', act: 1, rule: 'West and East are always dealt the two red Jacks, one each.',
              yours: { text: 'Win 2 tricks that hold a red Jack', of: 2 },
              theirs: { text: 'Make 2 contracts', of: 2 },
              hint: 'In diamonds or hearts they hold both bowers. In no trumps their Jacks are just Jacks; the Joker beats them either way.' },
    sharps: { name: 'The Card Sharps', short: 'Sharps', act: 2, rule: 'They can see your seeded cards.',
              yours: { text: 'Win 3 tricks with your seeded cards', of: 3 },
              theirs: { text: 'Capture 3 of your seeded cards', of: 3 },
              hint: 'Lead your seeded cards when they can\u2019t be beaten, or let Nan cover them. Every one they catch counts.' },
    hustlers: { name: 'The Hustlers', short: 'Hustlers', act: 2, rule: 'They bid mis\u00e8re whenever they dare.',
              yours: { text: 'Defeat 2 of their mis\u00e8res', of: 2 },
              theirs: { text: 'Make 2 mis\u00e8res', of: 2 },
              hint: 'One trick sinks a mis\u00e8re: lead low and stay under their card. Or outbid them with a 6 to keep them out.' }
  };
  /* Act II race targets, measured with the stand-in (400 Hoedowns each, 2026-10-24): the Card Sharps at
     3 against 3 are beaten 44% (3 against 2: 23%; 2 against 2: 36%); the Hustlers, with AI.HUSTLE 6, 46%
     (their misère in about 1.6 hands a level, made 54%). The Twins: 41%. */
  /* Which bosses can end each act, one drawn per run (the user's call, 2026-10-24: Act II draws from the Card Sharps and the Hustlers). */
  const BOSS_POOL = { 1: ['twins'], 2: ['sharps', 'hustlers'] };
  /* Buffs (relics). A partner's own ability is never offered. */
  const BUFFS = {
    nod:      { name: 'Partner’s Nod', text: 'Your partner shows their strongest suit while you bid.' },
    swing:    { name: 'Swing Your Partner', text: 'After the kitty, swap one card with Nan, every hand.' },
    peek:     { name: 'Peek', text: 'See the kitty before you bid.' },
    bowertie: { name: 'Remove the Bower Order', text: 'Your bowers tie the Joker: whichever is played first wins.' },
    nearmiss: { name: 'Near Miss', text: 'Miss your contract by one trick and lose nothing.' }
  };
  /* Card enhancements, by the act that adds them to the reward pool (one new
     system per act). Act III adds Glass and the Triple Threat (not built yet). */
  const ENH = {
    growing: { name: 'Growing', text: '+1 rank each time it wins a trick, for the whole run; stops at Ace.', acts: [1, 2, 3] },
    sworn:   { name: 'Trump-sworn', text: 'Counts as the trump suit at its printed rank and ties the real card; plain in no trumps.', acts: [1, 2, 3] },
    giant:   { name: 'Giant-killer', text: 'Beats the Ace of its own suit, and only the Ace.', acts: [1, 2, 3] },
    magnet:  { name: 'Magnet', text: 'Counts double toward collect objectives (Red Harvest, Black Suits Rising).', acts: [1, 2, 3] },
    gilded:  { name: 'Gilded', text: 'Earns 5 gold each time it wins a trick.', acts: [1, 2, 3] },
    outcast: { name: 'Outcast', text: 'Has no suit: it can always be played, and never wins a trick. A safe throw, and a mis\u00e8re\u2019s best friend.', acts: [2, 3] },
    reverse: { name: 'Reverse', text: 'If you lead it, the lowest card of the suit led wins the trick, and nobody can trump in.', acts: [2, 3] },
    sanctuary: { name: 'Sanctuary', text: 'If you lead it, nobody can trump in: the highest card of the suit led wins.', acts: [2, 3] },
    herald:  { name: 'Herald', text: 'When you lead it, Nan tells you how many of that suit she holds.', acts: [2, 3] },
    twoface: { name: 'Two-faced', text: 'Counts as either suit of its colour: it may follow either, and it ruffs when its twin suit is trumps.', acts: [2, 3] },
    double:  { name: 'Doubly Woubly', text: 'A trick it wins counts as two toward your contract (and your defending tricks). Holding it lets you bid one trick more than the hand.', acts: [2, 3] }
  };
  const enhPool = L => Object.keys(ENH).filter(k => ENH[k].acts.includes(L.act));
  const CURSES = {
    locked:  { name: 'Locked', text: 'One card in your hand is chained until your team wins a trick.' },
    ticking: { name: 'Ticking', text: 'One card must be played by trick 2, or −20 health.' },
    nokitty: { name: 'No Kitty', text: 'The contractor never picks up the kitty.' }
  };
  /* Hexes (from Act II): on a card, they hit whoever holds it (see the engine's header). */
  const HEXES = {
    loose:   { name: 'Loose Lips', short: 'Lips', text: 'Shown face-up to the table while held.' },
    potato:  { name: 'Hot Potato', short: 'Hot', text: 'The team that captures it loses 20.' },
    itchy:   { name: 'Itchy Feet', short: 'Itch', text: 'If it\u2019s legal to play, it must be played.' },
    stepped: { name: 'Stepped On', short: '−1', text: '\u22121 rank, tying the card below.' },
    twoleft: { name: 'Two Left Feet', short: '2LF', text: 'Can never win a trick. A curse card you own: it takes a seed slot when dealt.' }
  };
  const BOSS_HEXES = ['stepped', 'loose', 'itchy', 'potato'];
  const CLEANSE_PRICE = 60;
  /* Barn Gossip. fx: gold, health, enh (pick 1 of n), card ('face'), release,
     hex { kind, on: 'owned' | 'table' }, curse ('twoleft': a new owned card).
     acts: where the event can come up (Act II adds the hex events). */
  const EVENTS = {
    fiddler:  { name: 'The Fiddler’s Wager', text: 'The fiddler bets you can’t name the next tune. You can.',
                options: [{ text: 'Take the purse: +30 gold', fx: { gold: 30 } }, { text: 'Take the encore: +50 health', fx: { health: 50 } }] },
    punch:    { name: 'Spilled Punch', text: 'Someone has knocked the punch bowl over your shoes.',
                options: [{ text: 'Help mop up: −40 health, then pick 1 of 2 enhancements', fx: { health: -40, enh: 2 } }, { text: 'Walk on by', fx: {} }] },
    stranger: { name: 'A Stranger’s Card', text: 'A stranger in a string tie presses a card into your hand.',
                options: [{ text: 'Keep it: own a random face card, −20 health', fx: { health: -20, card: 'face' } }, { text: 'Hand it back politely', fx: {} }] },
    knitting: { name: 'Nan’s Knitting Circle', text: 'Nan’s friends offer to tidy up your cards.',
                options: [{ text: 'Let them: release a card you own, free', fx: { release: true } }, { text: 'Tea and gossip instead: +20 gold', fx: { gold: 20 } }] },
    apprentice: { name: 'The Caller\u2019s Apprentice', text: 'A young caller offers to teach you a fancy step.', acts: [2],
                options: [{ text: 'Learn it: pick 1 of 2 enhancements, but a random card in the deck is Stepped On', fx: { enh: 2, hex: { kind: 'stepped', on: 'table' } } }, { text: 'Watch from the side', fx: {} }] },
    gossip:   { name: 'Gossip Spreads', text: 'Word of your bidding is going round the barn.', acts: [2],
                options: [{ text: 'Pay them to hush: \u221240 gold', fx: { gold: -40 } }, { text: 'Let them talk: Loose Lips lands on one of your cards', fx: { hex: { kind: 'loose', on: 'owned' } } }] },
    jig:      { name: 'The Hot Potato Jig', text: 'The band strikes up a jig and a potato starts flying round the room.', acts: [2],
                options: [{ text: 'Join in: +60 health, and a Hot Potato lands on a random card in the deck', fx: { health: 60, hex: { kind: 'potato', on: 'table' } } }, { text: 'Sit this one out', fx: {} }] },
    cousin:   { name: 'The Clumsy Cousin', text: 'Nan\u2019s cousin asks you for a dance. He is not light on his feet.', acts: [2],
                options: [{ text: 'Dance with him: +60 gold, but he leaves you Two Left Feet (a curse card you own)', fx: { gold: 60, curse: 'twoleft' } }, { text: 'Make your excuses', fx: {} }] },
    dare:     { name: 'The Fiddler\u2019s Dare', text: 'The fiddler dares you to keep up with his fastest reel.', acts: [2],
                options: [{ text: 'Take the dare: pick 1 of 3 enhancements, and Itchy Feet lands on one of your cards', fx: { enh: 3, hex: { kind: 'itchy', on: 'owned' } } }, { text: 'Decline', fx: {} }] }
  };
  Object.keys(EVENTS).forEach(k => { if (!EVENTS[k].acts) EVENTS[k].acts = [1, 2]; });
  const PAY = { dance: [0, 10, 25, 40], elite: [0, 20, 40, 60] };
  /* Every act walks the same five stops (the short map). */
  const MAPS = { 1: [['dance'], ['dance', 'event'], ['camp'], ['dance', 'elite'], ['boss']],
                 2: [['dance'], ['dance', 'event'], ['camp'], ['dance', 'elite'], ['boss']] };
  const MAP = MAPS[1];
  const mapOf = L => MAPS[L.act];
  const KIND_NAME = { dance: 'Dance', event: 'Barn Gossip', camp: 'Punch Bowl', elite: 'Dance-off', boss: 'Hoedown' };
  const REST = { 1: 50, 2: 100 }, CASH = { health: 200, gold: 100 };
  const restOf = L => REST[L.act];
  /* Act II's targets, tuned on accident rates: see the header of OBJECTIVES. */
  const ACT2 = { blacks: 21, showoff: 3 };
  OBJECTIVES.blacks.of = ACT2.blacks; OBJECTIVES.blacks.text = OBJECTIVES.blacks.text.replace('BLACKS', ACT2.blacks);
  OBJECTIVES.showoff.of = ACT2.showoff; OBJECTIVES.showoff.text = OBJECTIVES.showoff.text.replace('SHOWOFF', ACT2.showoff);
  const cardPrice = c => c === 'JK' ? 150 : E.rankOf(c) === 'A' ? 90 : ['J', 'Q', 'K'].includes(E.rankOf(c)) ? 70 : 50;
  const ENH_PRICE = 70, REROLL = 15, TONIC = { price: 40, health: 50 };

  const has = (L, b) => (L.buffs || []).includes(b);
  function note(L, text) { L.note = text; }

  function newRun(o) {
    o = o || {};
    const P = PARTNERS.nan;
    const L = { v: 2, rs: (o.seed >>> 0) || 1, act: o.act || 1, health: 0, gold: 0, partner: P.id,
                owned: [P.start], mods: {}, hexes: {}, buffs: [P.ability], releases: 0, extraPrice: 40,
                pos: 0, path: [], pastPaths: [], actLevels: 0, levelsDone: 0, level: 0, log: [], history: [], dealer: 3,
                tips: o.tips !== false, seen: {}, firstObjective: o.objective || null, note: '' };
    E.rnd(L);
    actStart(L);
    return L;
  }
  /* The act-start pick: 1 of 3 cards to own. A new act offers the cards it adds
     (Act II: the black suits). */
  function actStart(L) {
    const deck = E.deckFor(L.act), before = L.act > 1 ? E.deckFor(L.act - 1) : [];
    let pool = deck.filter(c => !L.owned.includes(c) && !before.includes(c));
    if (pool.length < 3) pool = deck.filter(c => !L.owned.includes(c));
    L.offer = E.shuffle(L, pool).slice(0, 3);
    L.phase = 'actstart';
  }
  /* After an act's Hoedown: on to the next act, or the end of what is built. */
  function nextAct(L) {
    if (L.act >= LAST_ACT) { L.phase = 'victory'; return; }
    L.pastPaths = (L.pastPaths || []).concat([L.path]);
    L.act++;
    L.pos = 0; L.path = []; L.actLevels = 0;
    note(L, 'Act ' + ROMAN[L.act - 1] + ' is done. On to the ' + E.ACTS[L.act].name + '!');
    actStart(L);
  }

  /* ---------------- map ---------------- */
  function goTo(L, kind) {
    if (L.phase !== 'map') return no('not on the map');
    const choices = mapOf(L)[L.pos];
    if (!choices || !choices.includes(kind)) return no('not a choice here');
    L.path.push(kind);
    L.note = '';
    if (kind === 'event') {
      const fit = Object.keys(EVENTS).filter(id => EVENTS[id].acts.includes(L.act));
      const ids = fit.filter(id => !(L.eventsSeen || []).includes(id));
      L.event = E.pick(L, ids.length ? ids : fit);
      L.eventsSeen = (L.eventsSeen || []).concat(L.event);
      L.phase = 'event';
    } else if (kind === 'camp') {
      L.phase = 'camp'; L.cashed = false;
    } else startLevel(L, kind);
    return yes();
  }
  function nextStop(L) {
    L.pos++;
    if (L.pos >= mapOf(L).length) { nextAct(L); return; }
    L.phase = 'map';
  }

  /* ---------------- a level ---------------- */
  function startLevel(L, kind, objective) {
    kind = kind || 'dance';
    const ids = Object.keys(OBJECTIVES).filter(k => OBJECTIVES[k].acts.includes(L.act));
    L.level++;
    L.kind = kind;
    L.curse = null; L.dealRule = null; L.race = null; L.boss = null;
    if (kind === 'boss') {
      L.boss = E.pick(L, BOSS_POOL[L.act]);
      const B = BOSS[L.boss];
      if (L.boss === 'twins') L.dealRule = 'twins';
      L.race = { you: 0, them: 0, of: B.yours.of, ofThem: B.theirs.of, winner: null };
      L.obj = { id: 'boss', n: 0, of: B.yours.of, done: false, fail: false };
    } else {
      const first = (L.actLevels || 0) === 0;
      const fit = ids.filter(k => kind === 'elite' || !OBJECTIVES[k].elite);
      const pool = first ? fit.filter(k => OBJECTIVES[k].easy) : fit;
      const want = objective || (L.levelsDone === 0 ? L.firstObjective : null);
      const id = OBJECTIVES[want] && OBJECTIVES[want].acts.includes(L.act) ? want : E.pick(L, pool.length ? pool : fit);
      L.obj = { id, n: 0, of: OBJECTIVES[id].of, fail: false, done: false };
      if (kind === 'elite') L.curse = E.pick(L, Object.keys(CURSES));
    }
    L.you = 0; L.opp = 0; L.startHealth = L.health; L.startGold = L.gold;
    L.handNo = 1; L.hands = HANDS[L.act][kind]; L.baseHands = L.hands; L.extraBought = false;
    L.captured = [];
    L.phase = 'hand';
    L.reaction = null;
    L.log = [];
    L.result = null;
    if (kind === 'boss') E.say(L, 'Level ' + L.level + ' \u00b7 the Hoedown: ' + BOSS[L.boss].name + '. ' + BOSS[L.boss].rule, 'level');
    else E.say(L, 'Level ' + L.level + ' · ' + KIND_NAME[kind] + ' · objective: ' + OBJECTIVES[L.obj.id].text + '.' + (L.curse ? ' Curse: ' + CURSES[L.curse].name + ' — ' + CURSES[L.curse].text : ''), 'level');
    dealHand(L);
    return L;
  }
  function dealHand(L) {
    E.deal(L);
    if (L.curse === 'ticking') {
      L.h.ticking = E.pick(L, L.h.hands[0]);
      E.say(L, 'Ticking: play your ' + E.label(L.h.ticking) + ' by trick 2, or lose 20 health.', 'rule');
    }
  }

  function whoseMove(L) {
    if (L.phase === 'victory' || L.phase === 'runover') return 'end';
    if (L.phase === 'over') return 'over';
    if (L.phase === 'summary') return 'summary';
    if (L.phase !== 'hand') return 'screen';
    const h = L.h;
    if (h.phase === 'swing') return 'you';
    if (h.phase === 'trick' || h.phase === 'intent') return 'hold';
    return h.turn === 0 ? 'you' : 'ai';
  }

  /* ---------------- tracking ---------------- */
  function track(L, trick) {
    const h = L.h, mine = E.team(trick.winner) === 0;
    const wk = E.K(L, trick.winner, trick.cards[trick.winner]);
    if (mine) {
      L.captured.push(...trick.cards.filter(Boolean));
      if (wk.m && wk.m.enh === 'gilded') { L.gold += 5; E.say(L, E.label(wk.c) + ' is Gilded: +5 gold.', 'gold'); }
      if (wk.m && wk.m.enh === 'growing' && (wk.m.up || 0) < E.maxUp(wk.c)) {
        wk.m.up = (wk.m.up || 0) + 1;
        E.say(L, E.label(wk.c) + ' grows: it is now ' + E.kLabel(wk).replace(/^.*\(now /, '').replace(')', '') + '.', 'rule');
      }
    }
    if (h.ticking && trick.no === 2) {
      if (h.hands[0].includes(h.ticking)) { L.health -= 20; L.tickLoss = (L.tickLoss || 0) + 20; E.say(L, 'Ticking: your ' + E.label(h.ticking) + ' was not played by trick 2: −20 health.', 'rule'); }
      h.ticking = null;
    } else if (h.ticking && trick.cards[0] === h.ticking) h.ticking = null;
    if (L.race) {
      const r = L.race, seeded = h.seeded || [];
      if (L.boss === 'twins' && mine && trick.cards.some(c => c === 'JH' || c === 'JD')) r.you = Math.min(r.of, r.you + 1);
      if (L.boss === 'sharps') {
        if (trick.winner === 0 && seeded.includes(trick.cards[0])) r.you = Math.min(r.of, r.you + 1);
        if (!mine && seeded.includes(trick.cards[0])) { r.them = Math.min(r.ofThem, r.them + 1); E.say(L, 'The Card Sharps caught your ' + E.label(trick.cards[0]) + '.', 'rule'); }
      }
      L.obj.n = r.you;
      return;
    }
    const o = L.obj, id = o.id;
    if (o.done || o.fail) return;
    const wc = trick.cards[trick.winner];
    if (id === 'lowly9' && mine && ['9', '10'].includes(E.rankOf(wc))) o.n++;
    if (id === 'harvest' && mine) trick.cards.forEach((c, s) => { if (c && E.suitOf(c) === 'H') { const k = E.K(L, s, c); o.n += k.m && k.m.enh === 'magnet' ? 2 : 1; } });
    if (id === 'bagjack' && mine && trick.cards.some(c => c === 'JH' || c === 'JD')) o.n++;
    if (id === 'lastword' && mine && trick.no === E.ACTS[L.act].hand && (L.handNo === L.baseHands - 1 || L.handNo === L.baseHands)) o.n++;
    if (id === 'blacks' && mine) trick.cards.forEach((c, s) => { if (c && (E.suitOf(c) === 'S' || E.suitOf(c) === 'C')) { const k = E.K(L, s, c); o.n += k.m && k.m.enh === 'magnet' ? 2 : 1; } });
    if (id === 'showoff' && mine && L.owned.includes(wc)) o.n++;
    if (id === 'acehunter' && mine) o.n += trick.cards.filter((c, s) => c && s % 2 === 1 && E.rankOf(c) === 'A').length;
    if (id === 'ruff' && mine && h.trump && E.kSuit(E.K(L, trick.leader, trick.cards[trick.leader]), h.trump) !== h.trump && E.kIsTrump(wk, h.trump)) o.n++;
    if (id === 'lefthook' && mine && h.trump && wc !== 'JK' && E.rankOf(wc) === 'J' && E.suitOf(wc) === E.TWIN[h.trump]) o.n++;
    if (id === 'smoke' && trick.leader % 2 === 0 && trick.cards.some((c, s) => c === 'JK' && s % 2 === 1)) o.n++;
    if (OBJECTIVES[id].kind === 'limit') return;         // judged at the end of the level
    o.n = Math.min(o.n, o.of);
    if (o.n >= o.of) finishObjective(L);
  }
  function trackHand(L) {
    const o = L.obj, r = L.h.result;
    if (L.race) {
      const race = L.race, B = BOSS[L.boss], ofThem = race.ofThem || race.of;
      if (L.boss === 'twins' && E.team(r.contractor) === 1 && r.made) race.them = Math.min(ofThem, race.them + 1);
      if (L.boss === 'hustlers' && r.misere && E.team(r.contractor) === 1) {
        if (r.made) race.them = Math.min(ofThem, race.them + 1); else race.you = Math.min(race.of, race.you + 1);
        L.obj.n = race.you;
      }
      const youDone = race.you >= race.of, themDone = race.them >= ofThem;
      if (youDone && themDone) race.winner = L.you >= L.opp ? 'you' : 'them';
      else if (youDone) race.winner = 'you';
      else if (themDone) race.winner = 'them';
      if (race.winner) E.say(L, race.winner === 'you' ? 'You win the race against ' + B.name.replace(/^The/, 'the') + '!' : B.name + ' win the race.', 'objective');
      return;
    }
    if (o.done || o.fail) return;
    if (o.id === 'every') { if (r.tricks[0] > 0) o.n++; else o.fail = true; }
    if (o.id === 'setthem' && E.team(r.contractor) === 1 && !r.made) o.n++;
    if (o.id === 'makemis' && r.misere && E.team(r.contractor) === 0 && r.made) o.n++;
    if (o.id === 'holdline') {
      if (E.team(r.contractor) === 1 && r.made) { o.n++; o.fail = true; E.say(L, 'Hold the Line is broken: the opponents made a contract.', 'objective'); }
      return;
    }
    o.n = Math.min(o.n, o.of);
    if (o.n >= o.of) finishObjective(L);
    if (!o.done && o.id === 'lastword' && L.handNo >= L.baseHands - 1 && o.n + (L.baseHands - L.handNo) < o.of) o.fail = true;
  }
  function finishObjective(L) {
    L.obj.done = true;
    E.say(L, 'Objective complete: ' + OBJECTIVES[L.obj.id].text + '!', 'objective');
  }

  /* ---------------- moves inside a hand ---------------- */
  function react(L, kind) {
    const lines = PARTNERS[L.partner].lines[kind];
    if (lines) L.reaction = { kind, text: lines[Math.floor(E.rnd(L) * lines.length)] };
  }
  function after(L, res) {
    if (!res.ok) return res;
    if (L.h.herald && L.h.herald.trick === L.h.trickNo + 1 && L.h.herald.partner === 2 && !L.h.herald.said) {
      L.h.herald.said = true;
      L.reaction = { kind: 'herald', text: 'I\u2019ve got ' + (L.h.herald.n ? L.h.herald.n : 'no') + ' ' + (E.NAME[L.h.herald.suit] || 'of those') + ', dear.' };
    }
    if (res.trick) { track(L, res.trick); const good = L.h.misere ? E.team(res.trick.winner) === 1 : E.team(res.trick.winner) === 0; react(L, good ? 'won' : 'lost'); }
    const h = L.h;
    // Swing Your Partner: after the kitty, before the intent and the first trick
    if ((h.phase === 'intent' || h.phase === 'play') && h.trickNo === 0 && !h.trick.some(Boolean) && has(L, 'swing') && !h.swingDone && !h.misere) {
      h.swingNext = h.phase;
      h.phase = 'swing';
    }
    if (h.phase === 'done') endHand(L);
    return res;
  }
  function swing(L, card) {
    const h = L.h;
    if (h.phase !== 'swing') return no('nothing to swap');
    if (card) {
      if (!h.hands[0].includes(card)) return no('not in your hand');
      const back = AI.gift(L, 2);
      h.hands[0].splice(h.hands[0].indexOf(card), 1);
      h.hands[2].splice(h.hands[2].indexOf(back), 1);
      h.hands[0].push(back); h.hands[2].push(card);
      if (h.locked === card) h.locked = null;
      if (h.ticking === card) h.ticking = null;
      E.sort(L, 0); E.sort(L, 2);
      E.say(L, 'Swing Your Partner: you gave Nan your ' + E.label(card) + ' and she gave you her ' + E.label(back) + '.', 'rule');
    } else E.say(L, 'You kept your hand.', 'rule');
    h.swingDone = true;
    h.phase = h.swingNext;
    return yes();
  }
  function endHand(L) {
    const r = L.h.result;
    L.health += r.delta;
    L.you += r.pts[0];
    L.opp += r.pts[1];
    trackHand(L);
    react(L, E.team(r.contractor) === 0 ? (r.made || r.near ? 'made' : 'failed') : (r.made ? 'theirs' : 'set'));
    L.history.push({ level: L.level, kind: L.kind, hand: L.handNo, contract: L.h.contract, contractor: r.contractor, made: r.made, delta: r.delta, health: L.health });
    E.say(L, 'Health ' + (r.delta >= 0 ? '+' : '−') + Math.abs(r.delta) + ' → ' + L.health + '.', 'health');
    if (L.health <= -500) {
      L.phase = 'runover';
      E.say(L, 'Health has fallen to −500: the run is over.', 'end');
      return;
    }
    L.phase = 'summary';
  }
  /* The extra hand: on the last hand's summary, while the objective can still be met. */
  function canExtra(L) {
    return L.phase === 'summary' && !L.race && L.handNo >= L.hands && !L.extraBought && !L.obj.done && !L.obj.fail && L.gold >= L.extraPrice &&
      OBJECTIVES[L.obj.id].kind !== 'limit';
  }
  function buyExtra(L) {
    if (!canExtra(L)) return no('no extra hand on offer');
    L.gold -= L.extraPrice;
    E.say(L, 'One more hand for ' + L.extraPrice + ' gold (no third star this level).', 'gold');
    L.extraPrice = 80;
    L.extraBought = true;
    L.hands++;
    return next(L);
  }
  /* After the summary: the next hand, or the level's stars. */
  function next(L) {
    if (L.phase !== 'summary') return no('no summary showing');
    if (L.handNo >= L.hands || (L.race && L.race.winner)) { finishLevel(L); return yes(); }
    L.handNo++;
    L.dealer = (L.dealer + 1) % 4;
    L.phase = 'hand';
    L.reaction = null;
    dealHand(L);
    return yes();
  }
  function finishLevel(L) {
    const o = L.obj, outscored = L.you > L.opp;
    let stars = 1, gold = 0, won = null;
    if (L.race) {
      if (!L.race.winner) L.race.winner = L.you >= L.opp ? 'you' : 'them';
      won = L.race.winner === 'you';
      stars = won ? (outscored ? 3 : 2) : 1;
      gold = won ? 100 : 50;
      if (!won) {
        L.health -= 100;
        E.say(L, 'Losing to ' + BOSS[L.boss].name.replace(/^The/, 'the') + ' costs 100 health.', 'health');
        // the user's call (2026-10-24): a lost Hoedown also leaves a hex on a card for the rest of the run
        L.bossLosses = (L.bossLosses || []).concat(L.boss);
        const card = hexTarget(L, 'owned');
        if (card) {
          const kind = E.pick(L, BOSS_HEXES);
          placeHex(L, card, kind);
          L.bossHex = { card, kind, boss: L.boss };
          E.say(L, BOSS[L.boss].name + ' leave a hex on your ' + E.label(card) + ': ' + HEXES[kind].name + ' (' + HEXES[kind].text + ') Beat the next Hoedown to lift it.', 'rule');
        }
      } else if (L.bossHex && L.bossHex.boss !== L.boss) {
        if (L.hexes && L.hexes[L.bossHex.card] === L.bossHex.kind) delete L.hexes[L.bossHex.card];
        E.say(L, 'Beating ' + BOSS[L.boss].name.replace(/^The/, 'the') + ' lifts the hex on your ' + E.label(L.bossHex.card) + '.', 'rule');
        L.bossHex = null;
      }
    } else {
      if (OBJECTIVES[o.id] && OBJECTIVES[o.id].kind === 'limit' && !o.fail && !o.done) finishObjective(L);
      if (o.done) stars = 2;
      if (o.done && outscored && !L.extraBought) stars = 3;
      gold = PAY[L.kind][stars];
    }
    L.gold += gold;
    L.levelsDone++;
    L.actLevels = (L.actLevels || 0) + 1;
    L.result = { kind: L.kind, stars, gold, objective: L.race ? won : o.done, outscored, won, you: L.you, opp: L.opp,
                 health: L.health, change: L.health - L.startHealth, goldChange: L.gold - L.startGold, extra: L.extraBought };
    L.phase = L.health <= -500 ? 'runover' : 'over';
    E.say(L, 'Level ' + L.level + ' over: ' + stars + ' star' + (stars > 1 ? 's' : '') + ', ' + gold + ' gold.', 'end');
    L.curse = null; L.dealRule = null;
  }

  /* ---------------- rewards ---------------- */
  const freeBuffs = L => Object.keys(BUFFS).filter(b => !L.buffs.includes(b) && b !== PARTNERS[L.partner].ability);
  function draw(L, ids, n) { return E.shuffle(L, ids.slice()).slice(0, n); }
  /* Any card your team won this level, except the Joker (the user's call, 2026-10-23: too strong a gift). */
  function claimable(L) { return [...new Set(L.captured || [])].filter(c => c !== 'JK' && !L.owned.includes(c)).sort(); }
  /* The level's reward, as a list of steps the page walks through. */
  function collect(L) {
    if (L.phase !== 'over') return no('no level to collect');
    const r = L.result, steps = [];
    if (r.kind === 'dance') {
      if (r.stars === 2) steps.push({ type: 'enh', options: draw(L, enhPool(L), 2) });
      if (r.stars === 3) steps.push({ type: 'enh', options: draw(L, enhPool(L), 3), claim: claimable(L) });
    } else if (r.kind === 'elite') {
      const fb = freeBuffs(L);
      if (r.stars === 2 && fb.length) { const b = E.pick(L, fb); grantBuff(L, b); note(L, 'Dance-off prize: ' + BUFFS[b].name + '.'); }
      if (r.stars === 3 && fb.length) steps.push({ type: 'buff', options: draw(L, fb, 2) });
    } else if (r.kind === 'boss' && r.won) {
      const fb = freeBuffs(L);
      if (fb.length) steps.push({ type: 'buff', options: draw(L, fb, 3) });
    }
    L.reward = { steps };
    advanceReward(L);
    return yes();
  }
  function advanceReward(L, back) {
    const steps = L.reward ? L.reward.steps : [];
    if (steps.length) { L.phase = 'reward'; return; }
    L.reward = null;
    if (back) { L.phase = back; return; }
    nextStop(L);
  }
  /* Reroll the current reward's options for 15 gold (any number of times). */
  function reroll(L) {
    const s = L.reward && L.reward.steps[0];
    if (L.phase !== 'reward' || !s) return no('nothing to reroll');
    if (L.gold < REROLL) return no('not enough gold');
    const pool = s.type === 'buff' ? freeBuffs(L) : enhPool(L);
    if (pool.length <= s.options.length && s.type === 'buff') return no('no other buffs to draw');
    L.gold -= REROLL;
    const n = s.options.length, fresh = pool.filter(x => !s.options.includes(x));
    s.options = draw(L, fresh.length >= n ? fresh : pool, n);
    note(L, 'Rerolled for ' + REROLL + ' gold.');
    return yes();
  }
  function grantBuff(L, b) { if (!L.buffs.includes(b)) L.buffs.push(b); }
  function choose(L, arg) {
    const s = L.reward && L.reward.steps[0];
    if (L.phase !== 'reward' || !s) return no('nothing to choose');
    if (arg && arg.skip) { L.reward.steps.shift(); advanceReward(L, L.reward.back); return yes(); }
    if (s.type === 'buff') {
      if (!s.options.includes(arg)) return no('not on offer');
      grantBuff(L, arg); note(L, 'New buff: ' + BUFFS[arg].name + '.');
      L.reward.steps.shift(); advanceReward(L, L.reward.back); return yes();
    }
    if (s.type === 'enh') {
      if (arg && arg.claim) {
        if (!(s.claim || []).includes(arg.claim)) return no('not claimable');
        L.owned.push(arg.claim); note(L, 'You now own the ' + E.label(arg.claim) + '.');
        L.reward.steps.shift(); advanceReward(L, L.reward.back); return yes();
      }
      if (!s.options.includes(arg)) return no('not on offer');
      L.target = arg; L.targetBack = L.reward.back || null; L.phase = 'target';
      L.reward.steps.shift();
      return yes();
    }
    return no('unknown reward');
  }
  /* Put the chosen enhancement on an owned card (one per card: it replaces). */
  function enhance(L, card) {
    if (L.phase !== 'target') return no('no enhancement to place');
    if (!L.owned.includes(card) || card === 'JK') return no('pick a card you own (not the Joker)');
    const m = L.mods[card] || (L.mods[card] = {});
    const old = m.enh;
    m.enh = L.target;
    note(L, E.label(card) + ' is now ' + ENH[L.target].name + (old ? ' (it was ' + ENH[old].name + ')' : '') + '.');
    L.target = null;
    advanceReward(L, L.targetBack);
    return yes();
  }
  const enhanceable = L => L.owned.filter(c => c !== 'JK');

  /* ---------------- events ---------------- */
  function option(L, i) {
    if (L.phase !== 'event') return no('no event');
    const ev = EVENTS[L.event], o = ev.options[i];
    if (!o) return no('no such option');
    const fx = o.fx;
    if (fx.release && L.owned.length < 2) return no('you have only one card to keep');
    if (fx.gold < 0 && L.gold < -fx.gold) return no('not enough gold');
    if (fx.gold) L.gold += fx.gold;
    if (fx.health) L.health += fx.health;
    let msg = o.text.replace(/:.*/, '') + '.';
    if (fx.card === 'face') {
      const pool = E.deckFor(L.act).filter(c => ['J', 'Q', 'K'].includes(E.rankOf(c)) && !L.owned.includes(c));
      if (pool.length) { const c = E.pick(L, pool); L.owned.push(c); msg = 'The stranger’s card is the ' + E.label(c) + '. It’s yours now.'; }
    }
    if (fx.hex) {
      const card = hexTarget(L, fx.hex.on);
      if (card) { placeHex(L, card, fx.hex.kind); msg += ' ' + HEXES[fx.hex.kind].name + ' lands on ' + (L.owned.includes(card) ? 'your ' : 'the ') + E.label(card) + '.'; }
    }
    if (fx.curse === 'twoleft') {
      const pool = E.deckFor(L.act).filter(c => c !== 'JK' && E.rankOf(c) !== 'J' && !L.owned.includes(c) && !(L.hexes || {})[c] && ['9', '10'].includes(E.rankOf(c)));
      if (pool.length) { const c = E.pick(L, pool); L.owned.push(c); placeHex(L, c, 'twoleft'); msg += ' You now own the ' + E.label(c) + ', with Two Left Feet.'; }
    }
    note(L, msg);
    if (L.health <= -500) { L.phase = 'runover'; return yes(); }
    if (fx.enh) { L.reward = { steps: [{ type: 'enh', options: draw(L, enhPool(L), fx.enh) }] }; advanceReward(L); return yes(); }
    if (fx.release) { L.releaseBack = 'map-next'; L.phase = 'release'; return yes(); }
    nextStop(L);
    return yes();
  }

  /* ---------------- the Punch Bowl and the General Store ---------------- */
  function camp(L, what) {
    if (L.phase !== 'camp') return no('not at the Punch Bowl');
    if (what === 'cashin') {
      if (L.cashed) return no('you have cashed in here already');
      L.health -= CASH.health; L.gold += CASH.gold; L.cashed = true;
      note(L, 'Cashed in ' + CASH.health + ' health for ' + CASH.gold + ' gold.');
      if (L.health <= -500) L.phase = 'runover';
      return yes();
    }
    if (what === 'rest') { L.health += restOf(L); note(L, 'A rest and a cup of punch: +' + restOf(L) + ' health.'); nextStop(L); return yes(); }
    if (what === 'polish') { if (!polishable(L).length) return no('nothing to polish'); L.phase = 'polish'; return yes(); }
    if (what === 'cleanse') { if (!hexed(L).length) return no('no hexes to cleanse'); L.cleanseBack = 'map-next'; L.phase = 'cleanse'; return yes(); }
    if (what === 'shop') { stock(L); L.phase = 'shop'; return yes(); }
    return no('unknown action');
  }
  const polishable = L => L.owned.filter(c => c !== 'JK' && ((L.mods[c] && L.mods[c].up) || 0) < E.maxUp(c));
  function polish(L, card) {
    if (L.phase !== 'polish') return no('not polishing');
    if (!polishable(L).includes(card)) return no('that card can’t be polished');
    const m = L.mods[card] || (L.mods[card] = {});
    m.up = (m.up || 0) + 1;
    note(L, 'Polished: your ' + E.kLabel({ c: card, m }) + '.');
    nextStop(L);
    return yes();
  }
  function stock(L) {
    const cards = E.shuffle(L, E.deckFor(L.act).filter(c => !L.owned.includes(c))).slice(0, 2);
    const fb = freeBuffs(L);
    L.stock = cards.map(c => ({ type: 'card', id: c, price: cardPrice(c) }))
      .concat([{ type: 'enh', id: E.pick(L, enhPool(L)), price: ENH_PRICE }])
      .concat(fb.length ? [{ type: 'buff', id: E.pick(L, fb), price: 150 + 25 * Math.floor(E.rnd(L) * 3) }] : [])
      .concat([{ type: 'tonic', id: 'tonic', price: TONIC.price }])
      .concat(hexed(L).length ? [{ type: 'cleanse', id: 'cleanse', price: CLEANSE_PRICE }] : []);
  }
  const releasePrice = L => 50 + 25 * L.releases;
  function buy(L, i) {
    if (L.phase !== 'shop') return no('the store is closed');
    if (i === 'release') {
      if (L.owned.length < 2) return no('keep at least one card');
      if (L.gold < releasePrice(L)) return no('not enough gold');
      L.releaseBack = 'shop'; L.releasePaid = true; L.phase = 'release'; return yes();
    }
    const it = L.stock[i];
    if (!it || it.sold) return no('sold out');
    if (L.gold < it.price) return no('not enough gold');
    if (it.type === 'cleanse' && !hexed(L).length) return no('no hexes to cleanse');
    L.gold -= it.price; it.sold = true;
    if (it.type === 'card') { L.owned.push(it.id); note(L, 'Bought the ' + E.label(it.id) + '.'); }
    if (it.type === 'buff') { grantBuff(L, it.id); note(L, 'Bought ' + BUFFS[it.id].name + '.'); }
    if (it.type === 'enh') { L.target = it.id; L.targetBack = 'shop'; L.phase = 'target'; }
    if (it.type === 'tonic') { L.health += TONIC.health; note(L, 'Drank the tonic: +' + TONIC.health + ' health.'); }
    if (it.type === 'cleanse') { L.cleanseBack = 'shop'; L.phase = 'cleanse'; }
    return yes();
  }
  function release(L, card) {
    if (L.phase !== 'release') return no('not releasing');
    if (!L.owned.includes(card)) return no('you don’t own that');
    if (L.owned.length < 2) return no('keep at least one card');
    if (L.releasePaid) { L.gold -= releasePrice(L); L.releases++; L.releasePaid = false; }
    L.owned.splice(L.owned.indexOf(card), 1);
    delete L.mods[card];
    if (L.hexes && L.hexes[card] === 'twoleft') delete L.hexes[card];   // a curse card goes with you
    note(L, 'Released the ' + E.label(card) + '.');
    if (L.releaseBack === 'shop') L.phase = 'shop'; else nextStop(L);
    return yes();
  }

  /* ---------------- hexes ---------------- */
  const hexed = L => Object.keys(L.hexes || {});
  function placeHex(L, card, kind) { L.hexes = L.hexes || {}; L.hexes[card] = kind; }
  /* A card to hex: one you own, or one in the deck you don't; never the Joker, a
     Jack (it may be a bower) or a card already hexed. */
  function hexTarget(L, on) {
    const free = c => c !== 'JK' && E.rankOf(c) !== 'J' && !(L.hexes || {})[c];
    let pool = on === 'owned' ? L.owned.filter(free) : E.deckFor(L.act).filter(c => free(c) && !L.owned.includes(c));
    if (!pool.length) pool = E.deckFor(L.act).filter(free);
    return pool.length ? E.pick(L, pool) : null;
  }
  function cleanse(L, card) {
    if (L.phase !== 'cleanse') return no('not cleansing');
    if (!(L.hexes || {})[card]) return no('that card has no hex');
    const kind = L.hexes[card];
    delete L.hexes[card];
    if (L.bossHex && L.bossHex.card === card) L.bossHex = null;
    note(L, 'Cleansed: ' + HEXES[kind].name + ' is gone from the ' + E.label(card) + '.');
    if (L.cleanseBack === 'shop') L.phase = 'shop'; else nextStop(L);
    return yes();
  }

  /* ---------------- Nan's coaching (first run) ---------------- */
  /* One tip at a time, each once a run; tips at the table only in the first three
     levels, as the design doc says. */
  function coach(L) {
    if (!L.tips) return null;
    const tip = (id, text) => L.seen[id] ? null : { id, text };
    const ph = L.phase;
    if (ph === 'actstart' && L.act === 2) return tip('actstart2', 'Spades and clubs join us now, dear, and two of your cards come to you each hand. A black Jack is a bower when black is trumps.');
    if (ph === 'actstart') return tip('actstart', 'The Joker wins every trick it’s in. A red Jack becomes a bower whenever red is trumps. A 9 or 10 is a gamble that enhancements can make special.');
    if (ph === 'map' && L.pos === 4 && L.act === 2) return tip('boss2', 'Act II ends with the Card Sharps or the Hustlers. The Sharps can see the cards dealt to you from your own; the Hustlers bid mis\u00e8re all night, so lead low and stay under them.');
    if (ph === 'map') return L.pos === 4 ? tip('boss', 'The Twins always hold both red Jacks. Bid no trumps and their Jacks are just Jacks.') : tip('map', 'This is tonight’s dance card. Where it splits, pick a path: Barn Gossip is a gamble, and a Dance-off is harder but pays a buff.');
    if (ph === 'map' && hexed(L).length) { const t = tip('hex', 'A hex! Hexed cards are marked in red, and they hurt whoever holds them. Cleanse one at the Punch Bowl.'); if (t) return t; }
    if (ph === 'reward') return tip('reward', 'A reward! An enhancement goes on a card you own and stays all run.');
    if (ph === 'camp') return tip('camp', 'The Punch Bowl: do one thing — shop, rest or polish a card. Cashing in health for gold is extra.');
    if (ph !== 'hand' || L.levelsDone >= 3) return null;
    const h = L.h;
    if (h.phase === 'bid' && h.turn === 0) return tip('bid', 'Count sure tricks: the Joker, a bower, the Ace of trumps. We need more than half the tricks. Weak hand? Pass — defending pays 10 a trick.');
    if (h.phase === 'kitty' && h.turn === 0) return tip('kitty', 'You took the kitty card. Put back your weakest card that isn’t a trump.');
    if (h.phase === 'swing') return tip('swing', 'Swing Your Partner: give me a card you don’t want and I’ll hand you my best one.');
    if (h.phase === 'intent') return tip('intent', 'Their bid is their attack. Take enough tricks to stop them and it misses.');
    if (h.phase !== 'play' || h.turn !== 0) return null;
    if (h.trump && h.hands[0].some(c => E.rankOf(c) === 'J' && E.suitOf(c) === E.TWIN[h.trump]))
      { const t = tip('bower', 'Your J' + E.SYM[E.TWIN[h.trump]] + ' is the left bower this hand: it counts as a ' + E.NAME[h.trump].slice(0, -1) + ', and only the Joker and J' + E.SYM[h.trump] + ' beat it.'); if (t) return t; }
    if (h.locked && !h.unlocked && h.hands[0].includes(h.locked)) { const t = tip('locked', 'That chained card can’t be played until we win a trick.'); if (t) return t; }
    const led = E.ledSuit(L);
    if (!led) return tip('lead', 'Your lead. A sure winner is a fine lead; if we bid, lead trumps to draw theirs out.');
    if (h.trick[2] && AI.after(h, 0).length === 0 && E.winnerOf(h.trick, h.leader, h.trump, L) === 2)
      { const t = tip('partner', 'I’ve got this trick, dear. Throw your smallest card and save the good ones.'); if (t) return t; }
    const legal = E.legalPlays(L, 0), follows = legal.some(c => E.kSuit(E.K(L, 0, c), h.trump) === led);
    if (follows) return tip('follow', 'You must follow the suit that was led if you can. The raised cards are the ones you may play.');
    if (h.trump && legal.some(c => E.kIsTrump(E.K(L, 0, c), h.trump))) return tip('ruff', 'Out of that suit? Play a trump and the trick is ours — unless someone trumps higher.');
    return null;
  }

  /* ---------------- moves ---------------- */
  const yes = x => Object.assign({ ok: true }, x || {});
  function no(why) { return { ok: false, why }; }
  function act(L, kind, arg) {
    switch (kind) {
      case 'take':
        if (L.phase !== 'actstart' || !L.offer.includes(arg)) return no('not on offer');
        L.owned.push(arg); note(L, 'You now own the ' + E.label(arg) + '.'); L.offer = null; L.phase = 'map'; return yes();
      case 'go': return goTo(L, arg);
      case 'tip': if (arg) L.seen[arg] = true; return yes();
      case 'next': return next(L);
      case 'extra': return buyExtra(L);
      case 'collect': return collect(L);
      case 'choose': return choose(L, arg);
      case 'reroll': return reroll(L);
      case 'enhance': return enhance(L, arg);
      case 'option': return option(L, arg);
      case 'camp': return camp(L, arg);
      case 'polish': return polish(L, arg);
      case 'buy': return buy(L, arg);
      case 'leave': if (L.phase !== 'shop') return no('not in the store'); nextStop(L); return yes();
      case 'release': return release(L, arg);
      case 'cleanse': return cleanse(L, arg);
    }
    if (L.phase !== 'hand') return no('the hand is not in play');
    if (kind === 'ack') return after(L, E.ack(L));
    if (kind === 'swing') return after(L, swing(L, arg));
    if (L.h.turn !== 0) return no('not your turn');
    if (kind === 'bid') return after(L, E.bid(L, 0, arg || null));
    if (kind === 'discard') return after(L, E.discard(L, 0, arg));
    if (kind === 'play') return after(L, E.play(L, 0, arg));
    return no('unknown move ' + kind);
  }
  /* One AI move. `stand` plays your seat too (tests and autoplay). */
  function aiStep(L, stand) {
    if (L.phase !== 'hand') return false;
    const h = L.h, seat = h.turn;
    if (h.phase === 'trick' || h.phase === 'intent') return false;
    if (h.phase === 'swing') return stand ? after(L, swing(L, AI.cheapest(L, 0, h.hands[0]))) : false;
    if (seat === 0 && !stand) return false;
    if (h.phase === 'bid') return after(L, E.bid(L, seat, AI.bid(L, seat)));
    if (h.phase === 'kitty') return after(L, E.discard(L, seat, AI.discard(L, seat)));
    if (h.phase === 'play') return after(L, E.play(L, seat, AI.play(L, seat)));
    return false;
  }
  /* Play the current level to its stars with the AI in every seat. */
  function autoLevel(L) {
    let guard = 0;
    while (L.phase === 'hand' || L.phase === 'summary') {
      if (++guard > 5000) throw new Error('level did not finish');
      if (L.phase === 'summary') { next(L); continue; }
      const w = whoseMove(L);
      if (w === 'hold') { after(L, E.ack(L)); continue; }
      aiStep(L, true);
    }
    return L;
  }

  /* How the objective's progress reads on screen. */
  function objProgress(L) {
    const o = L.obj, O = OBJECTIVES[o.id];
    if (o.done) return '\u2713 done';
    if (o.fail) return 'missed';
    if (O && O.kind === 'limit') return 'holding';
    return o.n + ' / ' + o.of;
  }
  const api = { enhPool, HEXES, BOSS_HEXES, CLEANSE_PRICE, hexed, hexTarget, placeHex, objProgress, HANDS, LAST_ACT, ROMAN, PARTNERS, OBJECTIVES, BOSS, BOSS_POOL, BUFFS, ENH, CURSES, EVENTS, PAY, MAP, MAPS, mapOf, KIND_NAME, REST, restOf, ACT2, CASH, ENH_PRICE, REROLL, TONIC,
    cardPrice, releasePrice, polishable, enhanceable, claimable, freeBuffs, canExtra,
    newRun, startLevel, whoseMove, act, aiStep, next, autoLevel, track, coach, has };
  if (node) module.exports = api;
  else root.BtpRun = api;
})(typeof window !== 'undefined' ? window : this);
