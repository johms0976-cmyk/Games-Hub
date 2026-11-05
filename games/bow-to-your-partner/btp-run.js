'use strict';
/* Bow to Your Partner — the run: each act's five-level path around the hand engine.
 * Act I is the Church Hall; Act II, the Barn Dance, follows in the same run.
 *
 *   Act start   pick 1 of 3 cards to own (Act II offers the new black suits)
 *   1 Dance     the easy objective pool
 *   2 Dance  or Barn Gossip (an event)
 *   3 Punch Bowl (one action: General Store, Rest, Polish or Cleanse; Cash in is free)
 *   4 Dance  or Dance-off (an elite: one curse, pays a buff)
 *   5 Hoedown   the act's Showdown: a boss gang with health and an ability (see BOSS)
 *
 * Every table is a fight (2026-10-27): a gang with health (L.foe), played hand after hand until your team's
 * points reach it; their points hit your health (500 to start, 0 ends the run anywhere). See FIGHT. The run is
 * plain JSON (L), saved by the page after every step. Every number here is a first guess, to be retuned after play.
 *
 *   newRun({ seed, objective, tips })  the run, at the act-start pick
 *   act(L, kind, arg)                  your move (see the switch at the foot)
 *   aiStep(L, stand)                   one AI seat moves; false when it is yours
 *   whoseMove(L)                       'you' | 'ai' | 'hold' | 'summary' | 'over' | 'screen' | 'end'
 *   coach(L)                           your partner's tip for this moment on a first run, or null
 *
 * Run phases on L.phase: 'actstart', 'map', 'hand' (see L.h.phase), 'summary',
 * 'over' (a level's stars), 'reward', 'target' (put an enhancement on a card),
 * 'event', 'camp', 'shop', 'polish', 'release', 'victory', 'runover'.
 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const E = node ? require('./btp-engine.js') : root.BtpEngine;
  const AI = node ? require('./btp-ai.js') : root.BtpAI;

  /* Fights (the user's redesign, 2026-10-27: "enemies need health; you play 500 until your total score for
     that fight is equal to or greater than the enemy's health"). A gang's health: Card tables rise up the map
     (base + step a floor), a Duel is half as tough again and always has an ability, the Showdowns are 100 / 300 /
     500 (the user's numbers: the last is a real game of 500). Measured before the build (1,200 AI hands an act):
     your side gains about 20 / 35 / 54 points a hand, so a Card table is about three hands. Your health starts
     at 500 and never goes above HEALTH.max; nothing heals it during a fight. Their points hit it at the engine's
     share (E.HIT); a Showdown's gang hits harder (`bossHit`, or the boss's own `hit`). PAR: win within this many
     hands for a star (about the median). STACK: the chance, rising up the map, that the gang gets the better of
     two deals (by `gangStrength`); a Showdown deals at the top floor's chance. From floor TRAIT.floor a Card
     table gang may have a trait.
     Tuned 2026-10-27 over whole stand-in runs (250-300 a setting, two seed sets; the stand-in rests below 300
     health and walks the map blindly). The first guesses (hit 1/2, 1/3, 1/4; tables 50 / 90 / 130 + 5 / 8 / 12 a
     floor; stack 45%; no boss hit) won 11% of runs: scoring is lumpy (a quarter of Act I hands score nothing for
     you, then a contract lands), so a 50-health Card table took 4 hands, not 2.5. With softer hits and tables,
     runs were won 46%, but nearly every death was attrition at Card tables and the Showdowns were beaten 93-100%,
     so the Showdowns now hit harder and the tables softer. Now: runs won 34-37%; the Twins beaten 91%, the
     Hustlers 80% (they stall a fight: a defeated misère scores you nothing, hence their 200 health and lighter
     hit), the Sharps 91%, the Caller 77-84%, the Undertakers 62-70% (bids from 8; from 7 they were beaten 98%).
     Fights last about 4.5 / 3.7 / 3 hands at Card tables, 5.5 / 4.8 / 4.2 in Duels, 8 / 10 / 8 at Showdowns. */
  const HEALTH = { start: 500, max: 500 };
  const FOE = { base: { 1: 64, 2: 128, 3: 176 }, step: { 1: 8, 2: 13, 3: 16 }, elite: 1.5, boss: { 1: 100, 2: 300, 3: 500 }, bossHit: 2 };
  /* The Showdowns went up 15% with the trail of clues (2026-10-29) and back down when the clues were cut (the
     user's, 2026-10-30: "the clues didn't really seem to do anything"). */
  const PAR = { dance: { 1: 4, 2: 3, 3: 3 }, elite: { 1: 5, 2: 4, 3: 4 }, boss: { 1: 7, 2: 9, 3: 8 } };
  const STACK = { max: 0.3 };
  /* From floor TRAIT.floor a Card table gang may have one ability (TRAIT.p by act): a trait or a debuff. A Duel
     always has one, and two from Act II (the second a trait or a debuff, never a second curse). */
  const TRAIT = { floor: 1, p: { 1: 0.3, 2: 0.45, 3: 0.6 }, pool: ['tough', 'lucky', 'deadeye'], duel2: 2 };
  const TRAITS = {
    tough:   { name: 'Tough', text: 'A quarter more health.' },
    lucky:   { name: 'Lucky', text: 'A stacked deck every hand: they get the better of two deals.' },
    deadeye: { name: 'Dead Eye', text: 'Their points hit you half as hard again.' }
  };
  /* Who you face: a name and the two figures that sit at West and East. Since 2026-10-29 every gang has two people
     of its own (bakery/gang.py, baked for the table by bakery/saloon_px.py as g<key>); the Showdowns keep their
     wanted-poster outlaws. A Duel draws its abilities from DUEL_ABILITIES and DEBUFFS (see makeFoe). */
  const GANGS = {
    1: [['Two Cowpokes', 'gJcp1', 'gJcp2'], ['The Miller Brothers', 'gKmb1', 'gKmb2'], ['A Pair of Drifters', 'gJdr1', 'gJdr2'], ['Two Prospectors', 'gKpr1', 'gKpr2'],
        ['The Ranch Hands', 'gJrh1', 'gJrh2'], ['The Barber and His Cousin', 'gKbb', 'gJbc'], ['Two Mule Skinners', 'gJms1', 'gKms2']],
    2: [['Two Gamblers', 'gKgb1', 'gJgb2'], ['The Brakemen', 'gJbk1', 'gKbk2'], ['Two Snake-oil Salesmen', 'gKsn1', 'gJsn2'], ['The Cattle Buyers', 'gKcb1', 'gKcb2'],
        ['Two Pickpockets', 'gJpp1', 'gJpp2'], ['The Mail Clerks', 'gJmc1', 'gJmc2'], ['Two Card Counters', 'gJcc1', 'gKcc2']],
    3: [['The Pie Judges', 'gQpj', 'gKpj'], ['Two Rodeo Riders', 'gJrr1', 'gJrr2'], ['The Carnival Barkers', 'gKcbk', 'gJcbk'], ['The Strongman and His Manager', 'gKsm', 'gKmg'],
        ['Two Horse Traders', 'gKht1', 'gJht2'], ['The Shooting-gallery Men', 'gJsg1', 'gKsg2'], ['Two Fortune Tellers', 'gQft1', 'gQft2']]
  };
  // three more gangs an act (2026-10-30), dressed from the figures already baked
  GANGS[1].push(['The Saddle Thieves', 'gJdr2', 'gJcp1'], ['The Widow and Her Boy', 'gQsal', 'gJrh2'], ['The Blacksmith Brothers', 'gKbb', 'gKmb1']);
  GANGS[2].push(['The Pullman Porters', 'gJmc2', 'gJbk1'], ['Two Oil Speculators', 'gKcb2', 'gKgb1'], ['The Lady Gamblers', 'gQlou', 'gQmags']);
  GANGS[3].push(['The Pie-eating Champions', 'gKpj', 'gKpf1'], ['Two Lemonade Sellers', 'gQpj', 'gJsn2'], ['The Ferris Wheel Men', 'gJcbk', 'gKsg2']);
  /* Gang manners (2026-11-02, the third review's "the gangs still play alike"): every Card-table gang and Duel pair
     has a way of playing, named on its poster. Cycled through each act's list, so a map shows a mix. */
  const MANNERS = {
    bold:    { name: 'Bids bold', text: 'They bid on hands half a trick short of what they need: big contracts, and they get set more often.' },
    cagey:   { name: 'Cagey', text: 'They bid only on a sure thing, and sit back to set yours.' },
    misere:  { name: 'Loves a mis\u00e8re', text: 'They bid mis\u00e8re on any hand that looks like it could lose every trick.' },
    trumper: { name: 'Leads trumps', text: 'Defending your contract, they lead trumps at you to strip yours.' }
  };
  const MANNER_ORDER = ['bold', 'cagey', 'misere', 'trumper'];
  function mannerOf(a, kind, name) {
    const list = (kind === 'elite' ? DUELISTS : GANGS)[a] || [], i = list.findIndex(g => g[0] === name);
    return MANNER_ORDER[((i < 0 ? 0 : i) + a + (kind === 'elite' ? 1 : 0)) % MANNER_ORDER.length];
  }
  /* Wanted levels (2026-11-02, the review's "difficulty levels"): win a story and the next one can be a notch
     harder. Each level adds the next of these, on top of the ones before (the profile keeps the highest unlocked,
     the partner pick chooses). The Daily Challenge rides with one of them, the day's twist. */
  const WANTED = [
    { id: 'tough', name: 'Tougher gangs', text: 'Card-table gangs and Duels have a tenth more health.' },
    { id: 'thin',  name: 'Thin walls', text: 'Hotels heal a quarter less.' },
    { id: 'sharp', name: 'Sharper shooters', text: 'Every gang hits a tenth harder.' },
    { id: 'purse', name: 'Short of breath', text: 'You start with 450 health.' },
    { id: 'dead',  name: 'Dead or alive', text: 'Showdowns have 15% more health.' },
    { id: 'dear',  name: 'Dear goods', text: 'Everything in the stores costs a fifth more.' },
    { id: 'hard',  name: 'Hard men', text: 'Every Card-table gang has an ability.' },
    { id: 'head',  name: 'A head start', text: 'If the boss bolts, they start the Getaway a length further off.' }
  ];
  const wants = (L, id) => !!(L && L.wanted && L.wanted.includes(id));
  const wantedFor = n => WANTED.slice(0, Math.max(0, Math.min(WANTED.length, n | 0))).map(w => w.id);
  const startHealth = L => HEALTH.start - (wants(L, 'purse') ? 50 : 0);
  // the run's Wanted twists: what they set at the start (health, the engine's hit boost)
  function applyWanted(L, ids) {
    L.wanted = ids.slice();
    L.health = startHealth(L);
    L.hitBoost = wants(L, 'sharp') ? 1.1 : 1;
  }
  /* The partner pick chooses the level, up to what the profile has unlocked (L.maxWanted). The map was drawn
     before, so it is drawn again with the level's gangs. */
  function chooseWanted(L, n) {
    if (L.phase !== 'partner' || L.daily) return no('the level is chosen with your partner');
    n = n | 0;
    if (n < 0 || n > (L.maxWanted || 0)) return no('that level isn\u2019t open yet');
    L.wantedLevel = n;
    applyWanted(L, wantedFor(n));
    genMap(L);
    return yes();
  }
  /* The Daily Challenge (2026-11-02): one ride a day, the same seed for everyone, your horse, and the day's twist. */
  function dailySeed(date) {
    let h = 2166136261;
    for (const ch of 'draw-partner:' + date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h || 1;
  }
  const dailyTwist = date => WANTED[dailySeed(date) % WANTED.length];
  /* The Fair's big-ticket goods (2026-11-02, the review's "nothing to spend Act III gold on": a won run ended with
     ~440): sold in Act III's stores (the last floor's hotel always has one), once a run each. */
  const FAIR_GOODS = { gunhand: 220, handcar: 160 };
  const DUELISTS = {
    1: [['Quick-draw Quinn and Pa', 'gJqq', 'gKpa'], ['The Dutton Kid and Sal', 'gJdk', 'gQsal'], ['Two-gun Tess and Hank', 'gQtess', 'gKhank']],
    2: [['Diamond Jim and Lou', 'gKdj', 'gQlou'], ['The Railroad Baron\u2019s Boys', 'gJrb1', 'gJrb2'], ['Silent Sam and Mags', 'gJss', 'gQmags']],
    3: [['The Champion Sharpshooters', 'gQcs', 'gJcs'], ['One-eyed Jack and Rosa', 'gJoj', 'gQrosa'], ['The Prize Fighters', 'gKpf1', 'gKpf2']]
  };
  DUELISTS[1].push(['Dead-eye Dora and Clem', 'gQtess', 'gJdk'], ['The Hangman and the Judge', 'gKpa', 'gKhank']);
  DUELISTS[2].push(['The Brakeman and Rosa', 'gKbk2', 'gQrosa'], ['Gentleman Jim and Sal', 'gKdj', 'gQsal']);
  DUELISTS[3].push(['The Rodeo Queen and Her Rider', 'gQcs', 'gJrr1'], ['Two Trick Shooters', 'gJsg1', 'gJcs']);
  const DUEL_ABILITIES = ['locked', 'ticking', 'nokitty', 'lucky', 'deadeye'];
  /* The gang's debuffs on you (the user's ask, 2026-10-29: "some enemies need to apply a debuff, e.g. the
     player's cards are worth one rank less"). The engine reads them (E.foeHas); Gagged and Shakedown are read
     here. A Steady Aim card shrugs off Rusty Guns and Sand in Your Eyes. */
  const DEBUFFS = {
    rusty:     { name: 'Rusty Guns', text: 'Your cards play one rank lower (not the Joker or the bowers).' },
    sand:      { name: 'Sand in Your Eyes', text: 'On each hand\u2019s first trick your own cards play as printed: no enhancements, no polish.' },
    shakedown: { name: 'Shakedown', text: 'Every trick they take costs you 5 gold.' },
    gutshot:   { name: 'Gut Shot', text: 'You bleed 10 health every hand of the fight.' },
    armour:    { name: 'Thick Hide', text: 'Your defending tricks and your sets don\u2019t hurt them: only your contracts do.' },
    sleeve:    { name: 'Aces up Their Sleeves', text: 'West and East are each dealt an Ace.' },
    gag:       { name: 'Gagged', text: 'Your partner is gagged: she can\u2019t bid.' },
    marked:    { name: 'Marked Deck', text: 'None of your own cards are dealt to you.' },
    snakebite: { name: 'Snakebite', text: 'Every trick they take hits you for 5 more.' },
    bushwhack: { name: 'Bushwhack', text: 'When your team wins the bid, West leads the first trick.' }
  };
  /* The standoff (the user's, 2026-11-01): before every fight the gang says something smart or silly, then "Now
     Draw!": each fight of cards is a gunfight. A Showdown has its own lines; a gang's are drawn from its kind's.
     taunt(L) is fixed by the run's seed and the fight, so a reload says the same thing. */
  const TAUNTS = {
    dance: ['This town ain\u2019t big enough for the four of us.', 'We don\u2019t take kindly to strangers. We take their money.',
      'Deal \u2019em, and kiss your boots goodbye.', 'You look like somebody who folds.', 'Last fella in that chair still owes us a horse.',
      'Read \u2019em and weep. Actually, just weep.', 'Sit down, stranger. The chair\u2019s still warm from the last one we cleaned out.',
      'Ma told us never to gamble. So we cheat.', 'Hope you brought more than that hat.', 'I\u2019ve seen tumbleweeds hold better hands.',
      'Draw, partner. Cards, that is. We\u2019re civilised.', 'We play fair. We just win fairer.', 'Bounty on us? Cute. There\u2019s a bounty on everybody.',
      'You\u2019re the one with the poster? You got our good side wrong.', 'Pull up a chair. Leave your luck at the door.'],
    elite: ['Just you and me, and two more at this table.', 'They call me quick. Nobody calls you anything.',
      'I\u2019ve outdrawn better than you. Mostly at cards. Once at breakfast.', 'Sun\u2019s at my back, cards in my hand, and your luck\u2019s in your saddlebag.',
      'One of us leaves this table on a stretcher. I already booked yours.', 'Fastest shuffle in the territory. Watch my hands. No, closer.',
      'I\u2019ll count to three. Then I\u2019ll lose count and deal anyway.', 'My trigger finger itches. So does my card finger. Same finger.',
      'High noon. Or high card. Whichever comes first.', 'I don\u2019t lose. I occasionally fail to win.'],
    bank: ['Nobody move! Unless it\u2019s to deal.', 'This here\u2019s a robbery. Hands up. Then hands down: you\u2019ll need \u2019em for the cards.',
      'Stand aside, hero. We\u2019ve a safe to empty and a hand to win.', 'One hand. Winner takes the loot. Loser takes the long walk home.'],
    twins: ['Two of us, two red Jacks. Too bad for you.', 'Pa said share everything. So we share the Jacks.', 'You\u2019ve been looking for us? We\u2019ve been looking at your cards.', 'Grandma\u2019s gonna hear about this.'],
    sharps: ['Revenge is a dish best served face down.', 'We\u2019ve seen every card you own. Twice.', 'The Twins owed us. Now you do.', 'Every gang in this county is somebody\u2019s cousin. Mostly ours.'],
    hustlers: ['Our little brothers send their regards. From jail.', 'We lose on purpose. You\u2019ll lose by accident.', 'Bet you can\u2019t lose every trick. We can.', 'Grandma always said you\u2019d turn up. She didn\u2019t say you\u2019d be this slow.'],
    caller: ['Swing your partner, lose your shirt!', 'Bow to your partner, bow to your corner, then bow to me.', 'The band plays, I call, you dance. Simple.', 'Bow to your partner, bow to your corner, and wave to your auntie.'],
    wallflowers: ['We\u2019ve already measured you.', 'Nobody passes at our table. Except away.', 'Take your time. We\u2019re very patient. Professionally.', 'We\u2019ve measured the whole family. You\u2019re the only one left.'],
    pie: ['Judges like a flaky crust and a full plate. Mostly the full plate.', 'Grandma\u2019s recipe. Grandma\u2019s rolling pin, too, if you cheat.', 'Hearts, partner. Every slice is a heart.'],
    turkey: ['Pull! No, wait, that\u2019s the clay pigeons.', 'Aces high, turkeys low.', 'Steady hands win the shoot. Mine are very steady. Look.'],
    bell: ['Swing like you mean it, stranger!', 'Last fella rang it so hard the bell\u2019s still humming.', 'Big bid, big swing. Small bid, small ding.'],
    race: ['And they\u2019re off! Well, after the deal.', 'My horse has never lost. My horse has never raced.', 'Keep \u2019em coming in a row, or eat our dust.'],
    regulars: ['Evenin\u2019. Friendly game? First to five hundred.', 'Same table, same chairs, same old story. Deal.']
  };
  TAUNTS.ghost = ['Remember us? We remember you. We were you.', 'Boot Hill was cold. Your old cards kept us warm.', 'Same cards, partner. Different side of the table.', 'We died on this road once. Your turn.'];
  TAUNTS.stranger = ['Five marked cards. You kept every one. I knew you would.', 'I\u2019ve sat across from all of them. Now I\u2019ll play like all of them.', 'Every Showdown you ever lost, I was watching.'];
  /* More to say (2026-11-05, LINES.md: the new lines that scored 80/100 or over). "My grandmother bids better than
     you, and she's been dead since spring" made the cut but is left out: the gangs are Grandma Hollis's grandchildren. */
  TAUNTS.dance.push('Funny. You don\u2019t look like a bounty hunter. You look like a bounty.', 'Before we start: are you left-handed? Asking for the gravestone.',
    'Sit. Stay. Lose. Good stranger.', 'Ma was a card sharp. Pa was a shark. We get it from both sides.', 'Easy now. Hands where we can see \u2019em. On the table. Face up, ideally.',
    'I\u2019d say \u201cmay the best hand win\u201d, but I\u2019ve got the best hand. I checked. Before the deal.', 'Five hundred to win. Five dollars for the coffin. We take both.',
    'The cards don\u2019t lie. That\u2019s why we don\u2019t let them talk.', 'Mind the spittoon. The last fella who beat us is in it.', 'We don\u2019t bluff. We just lie with confidence.',
    'We cut the deck. Then we cut whoever complains.', 'You hunt bounties? We hunt bounty hunters. Pays better. Fewer posters.');
  TAUNTS.elite.push('I\u2019ve only lost one hand in my life. I keep it in a jar.', 'They say I\u2019m the fastest dealer alive. The slowest one\u2019s out back, under a cactus.',
    'One, two\u2026 I\u2019ll be honest, I went on two.', 'My hands are faster than lightning. My brain\u2019s catching up. Don\u2019t rush it.',
    'One of us walks away from this table. I\u2019ve already ordered my supper.');
  TAUNTS.bank.push('Everybody on the floor! Not you. You, at the table. We need a fourth.', 'Don\u2019t mind the dynamite. It only goes off if somebody leads trumps.',
    'Fill the bags, boys! And somebody deal the bounty hunter in.');
  TAUNTS.twins.push('We finish each other\u2019s\u2014 \u2014tricks.', 'One of us is the evil twin. Guess which. Wrong.');
  TAUNTS.sharps.push('We counted the cards. Then we counted your gold. Both came up short.');
  TAUNTS.hustlers.push('We\u2019re terrible at this. Ask anyone we\u2019ve robbed.');
  TAUNTS.caller.push('Grab your partner, do-si-do, hand me your gold and out you go!', 'Nobody dances in my hall without paying the fiddler. I\u2019m the fiddler.');
  TAUNTS.wallflowers.push('Stand still a moment. Five foot ten. \u2026Five foot eleven with the hat. Lovely.', 'Don\u2019t fret. We do a lovely funeral. Two for one on Tuesdays.');
  TAUNTS.pie.push('Blue ribbon three years running. Nobody\u2019s tasted it. Nobody\u2019s dared.');
  TAUNTS.turkey.push('Not the turkey! The clay! \u2026Ah. Well, that\u2019s supper.');
  TAUNTS.ghost.push('Don\u2019t look so pale. That\u2019s our job now.', 'We\u2019re you, from the run you lost. Spoiler: you lose.');
  TAUNTS.stranger.push('I\u2019ve been behind you since the first town. You never once looked back.');
  /* A run's lines without repeats (2026-11-05, the user's "the witty lines are quite repetitive"): every pool is dealt
     in an order shuffled by the run's seed and the pool's name, so no line comes round again until the whole pool has
     been said; the n-th line of a pool is the same on a reload. */
  function dealt(L, tag, pool, n) {
    const len = pool.length;
    if (!len) return null;
    n = Math.max(0, n | 0);
    let h = ((L.rs >>> 0) ^ Math.imul(Math.floor(n / len) + 1, 2654435761)) >>> 0;
    for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 16777619) >>> 0;
    const order = pool.map((_, i) => i);
    for (let i = len - 1; i > 0; i--) {
      h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
      const j = h % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t;
    }
    return pool[order[n % len]];
  }
  /* Insults and comebacks (the user's, 2026-11-03: "a Monkey Island type vibe"): at a Card table or a Duel the gang
     opens with an insult and your partner fires one back. The Quiet One answers with a look; Biscuit sometimes just
     neighs. One pair a fight, by the same hash as the taunt. */
  const INSULTS = [
    ['I\u2019ve seen better hands on a clock.', 'And I\u2019ve seen better faces on one. Deal.'],
    ['I eat greenhorns like you for breakfast.', 'That explains the breath.'],
    ['There\u2019s a rope out back with your name on it.', 'Spelled right this time? The last one said \u201cPardner.\u201d'],
    ['I\u2019ve never lost a hand in this town.', 'You\u2019ve never played one fair in it, either.'],
    ['Every card you hold is crying for help.', 'They recognise you. You marked half of them.'],
    ['You couldn\u2019t win a trick if it was handed to you.', 'Lucky you\u2019ll be handing me so many.'],
    ['I\u2019ll take your gold, your boots and your horse.', 'The horse has opinions about that.'],
    ['The last fella in that chair ain\u2019t sat anywhere since.', 'Must be the chair. It can\u2019t be the company. Well. It can.'],
    ['You bid like a scarecrow plays the fiddle.', 'At least a scarecrow knows when to keep still. Unlike your eyebrows.'],
    ['My dog plays a better game of five hundred.', 'Then send the dog. We\u2019d like a challenge.'],
    ['I\u2019ve got an Ace up my sleeve and a Colt under the table.', 'And a shirt that says you\u2019ve lost both before.'],
    ['You\u2019re the worst card player west of the Mississippi.', 'Then you\u2019re in for a very confusing evening.'],
    // 2026-11-05 (LINES.md)
    ['I\u2019m worth a hundred gold, dead or alive.', 'Bit ambitious for alive.'],
    ['I\u2019ve had horses smarter than you.', 'So have I. One of them\u2019s sitting at this table.'],
    ['People pay good money to watch me play.', 'They pay better money to watch you lose. I\u2019ve seen the poster.'],
    ['I could beat you with my eyes closed.', 'That explains how you dress.'],
    ['I\u2019m the meanest hand west of the river.', 'And the dirtiest east of the soap.'],
    ['I\u2019m going to clean you out.', 'First thing in this saloon you\u2019d have cleaned.'],
    ['I could outdraw you with a broken arm.', 'That can be arranged. Deal.'],
    ['Folks round here call me the Undertaker\u2019s Friend.', 'Well, the man must be lonely.'],
    ['You\u2019ll be pushing up daisies by sundown.', 'Daisies? In this dirt? I\u2019ll be lucky to push up a cactus.'],
    ['Your partner looks like a sack of feed in a hat.', 'Careful. The sack\u2019s holding the right bower.'],
    ['Every card you play, I\u2019ve already seen.', 'Then you know what\u2019s coming. Must be awful.'],
    ['When I\u2019m done, they\u2019ll call you Lucky.', 'When I\u2019m done, they\u2019ll call you \u201cthe other fella in the story\u201d.'],
    ['I\u2019ve seen more spine in a jellyfish.', 'Out here? You\u2019ve never seen a jellyfish. You\u2019ve never seen the sea.']
  ];
  // the partners who don't talk back: the Quiet One always, Biscuit one time in four
  const SILENT_BACKS = {
    quiet: ['(The Quiet One just looks at them. It lands harder than words.)', '(The Quiet One writes something on a napkin and slides it across. They read it and go pale.)'],
    horse: ['Neigh. (Biscuit means something rude.)', '(Biscuit eats the corner of their best card.)', 'Neigh. (In horse, that\u2019s about their mother.)', '(Biscuit sneezes on their hand. All of it.)']
  };
  function insult(L) {
    let x = ((L.rs >>> 0) ^ Math.imul((L.level || 1) + 7, 2246822519)) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 3266489917) >>> 0;
    const [text, back] = dealt(L, 'insult', INSULTS, (L.level | 0) - 1), quiet = SILENT_BACKS[L.partner];
    return { text, back: L.partner === 'quiet' ? quiet[x % quiet.length] : L.partner === 'horse' && x % 4 === 0 ? quiet[(x >>> 4) % quiet.length] : back };
  }
  /* Your partner's one-off quips (2026-11-03): the first time a run meets each of these, said over the table as the
     fight starts. The horse on the train roof was the user's own example. */
  const QUIPS = {
    roof: { horse: 'Partner, I want it noted: I am a horse, on the roof of a moving train, playing cards. My mother wanted me to pull a plough.',
            nan: 'Seventy-one years old and on the roof of a train, dear. The sewing circle will never believe me.',
            showboat: 'Finally, a stage worthy of me! Windy, though. Hold my hat. No, really, hold it.',
            sharp: 'The chance of a card blowing off up here is one in six. I\u2019ve weighted mine with a biscuit.',
            quiet: '(The Quiet One looks at the plains rushing by, the drop to the tracks, then at you. Mostly at you.)' },
    bank: { horse: 'A horse in a bank. If the manager asks, I\u2019m here about a loan. A hay loan.',
            nan: 'Forty years I\u2019ve banked here, dear, and I\u2019ve never had to play cards for my savings.',
            showboat: 'A robbery! At last, an audience that can\u2019t leave.',
            sharp: 'Interest rates in this town are criminal. Today, literally.',
            quiet: '(The Quiet One quietly moves the deposit slips out of the line of fire.)' },
    duel: { horse: 'High noon. I\u2019ll stand behind you. Mostly because that\u2019s where the shade is.',
            nan: 'A duel with cards, dear. So much more civilised than the other sort. Fewer funerals.',
            showboat: 'Main Street, high noon, the whole town at the windows. I may weep.',
            sharp: 'They always draw at noon. Nobody ever asks why not half past two.',
            quiet: '(The Quiet One squints at the sun, then at them. They look away first.)' },
    train: { horse: 'Do you know how hard it is to buy a train ticket with hooves? Make this one count.',
             nan: 'The smoking car, dear. I\u2019ll hold my breath and you hold your trumps.',
             showboat: 'A captive audience on a moving stage. I was born for the railroad.',
             sharp: 'Forty miles an hour. Plenty of time to count every card twice.',
             quiet: '(The Quiet One opens the window an inch. The smoke goes out. So does the gang\u2019s confidence.)' },
    fair: { horse: 'If anybody tries to put me on that carousel, I\u2019m going home. On foot. Well. On hoof.',
            nan: 'I came for the pie contest, dear, not for this. Though I suppose we can do both.',
            showboat: 'Someone out there is selling my face on a souvenir plate, and I want a cut.',
            sharp: 'The ring toss is rigged. I checked. Twice. Then I bought it.',
            quiet: '(The Quiet One wins a stuffed bear at the ring toss without looking, and hands it to you.)' }
  };
  // 2026-11-05 (LINES.md): the Getaway, a stop you couldn't read, the hotel and the store; a partner without a line here stays quiet
  Object.assign(QUIPS, {
    getaway: { horse: 'Finally, something I\u2019m built for. Hold on to your hat. And your cards. And me.',
               nan: 'I haven\u2019t chased a man this fast since 1831, dear. Married him, too.' },
    mystery: { horse: 'A question mark. The last time I walked toward one of those, it was a barn fire.',
               nan: 'A surprise, dear. At my age they\u2019re either a party or a funeral.',
               showboat: 'Mystery! Intrigue! Possibly a trapdoor. I\u2019ll go first. No, you go first.' },
    hotel: { horse: 'They let me in the hotel, partner. I\u2019ll be sleeping in the bath. Don\u2019t ask.',
             nan: 'Clean sheets and a kettle. I could cry, dear. I won\u2019t, but I could.',
             sharp: 'Eight hours\u2019 sleep raises a player\u2019s win rate eleven percent. I made that up, but sleep anyway.',
             quiet: '(The Quiet One sleeps sitting up in a chair facing the door. Hat on. Boots on. Snoring politely.)' },
    store: { nan: 'Don\u2019t pay the first price, dear. Or the second. I\u2019ll handle the third.',
             sharp: 'Every price in here is marked up forty percent. I respect it.' }
  });
  function takeQuip(L, when) {
    if (!when || !QUIPS[when] || !QUIPS[when][L.partner] || (L.quipped || []).includes(when)) return null;
    L.quipped = (L.quipped || []).concat(when);
    return QUIPS[when][L.partner];
  }
  // a store or a hotel: said on its slip (L.stopQuip) when you walk in
  const stopQuip = (L, kind, id) => kind !== 'store' && kind !== 'camp' ? null : (L.revealed === id ? takeQuip(L, 'mystery') : null) || takeQuip(L, kind === 'store' ? 'store' : 'hotel');
  function quipFor(L) {
    const n = L.pos && L.map && L.map.floors ? mapNode(L, L.pos) : null;
    const when = L.kind === 'bank' ? 'bank' : L.act === 2 && n && n.lane === 'roof' && (L.kind === 'dance' || L.kind === 'elite') ? 'roof'
      : L.act === 1 && L.kind === 'elite' ? 'duel' : L.act === 2 && (L.kind === 'dance' || L.kind === 'elite') ? 'train' : L.act === 3 && L.kind === 'dance' ? 'fair' : null;
    return (L.kind !== 'chase' && L.revealed && L.revealed === L.pos ? takeQuip(L, 'mystery') : null) || takeQuip(L, L.kind === 'chase' ? 'getaway' : when);
  }
  function taunt(L) {
    const pool = L.foe && L.foe.ghost ? TAUNTS.ghost : L.mode === 'standard' ? TAUNTS[(L.std && L.std.id) || 'regulars'] || TAUNTS.regulars : L.kind === 'contest' && L.contest ? TAUNTS[L.contest.id] : L.kind === 'boss' ? TAUNTS[L.boss] || TAUNTS.elite : TAUNTS[L.kind] || TAUNTS.dance;
    let x = ((L.rs >>> 0) ^ Math.imul(L.level || 1, 2654435761)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0;
    const who = L.mode === 'standard' ? L.std.name : L.kind === 'contest' && L.contest ? 'Your fellow contestants' : L.kind === 'boss' ? BOSS[L.boss].name : L.kind === 'bank' ? 'The robbers' : L.foe ? L.foe.name : 'The gang';
    return { who, text: dealt(L, 't:' + pool[0], pool, (L.level | 0) - 1) };
  }
  const LAST_ACT = 3;                       // the County Fair ends the run
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
  /* Who rides with you. Your horse first (the user's, 2026-11-01: "thematically it works better if the starting
     partner was your horse"); Nan is the first partner unlocked. A partner differs only in a name, an ability and
     the card they bring (with its enhancement); the card play is the same AI for everyone. */
  const PARTNERS = {
    horse: { id: 'horse', name: E.PARTNER_NAME.horse, title: 'your Horse', start: 'KH', mods: { KH: { enh: 'horseshoe' } }, ability: 'horse',
           lines: { won: ['Neigh-ce one, partner.', 'That’s the way.', 'Steady as she goes.'],
                    lost: ['Hold your horses. We’ll get the next.', 'Chin up, partner.', 'Whoa. Never mind.'],
                    made: ['Well bid, partner!', 'Just like we planned it.'], set: ['Stopped them in their tracks!', 'Not today, thank you.'],
                    failed: ['Shoot. We’ll win it back.'], theirs: ['They earned that one.'] } },
    showboat: { id: 'showboat', name: E.PARTNER_NAME.showboat, title: 'the Big Talker', start: '9H', mods: { '9H': { enh: 'sworn' } }, ability: 'swing', style: 'bold',
           lines: { won: ['Ta-da!', 'And the crowd goes wild!', 'Did you see that?'], lost: ['A minor setback, partner.', 'The show goes on!', 'Hold the applause.'],
                    made: ['Told you we could make it!', 'Big bid, big finish!'], set: ['Not on my stage!', 'Booed off!'], failed: ['Well. The critics were harsh.'], theirs: ['Amateurs got lucky.'] } },
    sharp: { id: 'sharp', name: E.PARTNER_NAME.sharp, title: 'the Card Counter', start: '10D', mods: { '10D': { enh: 'giant' } }, ability: 'count', style: 'precise',
           lines: { won: ['As calculated.', 'Expected.', 'One down.'], lost: ['Within tolerances.', 'Noted.', 'Variance, partner.'],
                    made: ['Exactly as counted.', 'The numbers held.'], set: ['They miscounted.', 'Their sums were off.'], failed: ['I\u2019ll recount.'], theirs: ['Their math worked. This time.'] } },
    quiet: { id: 'quiet', name: E.PARTNER_NAME.quiet, title: 'the Silent Partner', start: 'KD', ability: 'peek', style: 'silent',
           lines: { won: ['(a nod)', '(a small smile)', '(taps the table)'], lost: ['(a shrug)', '(a long look)', '(silence)'],
                    made: ['(a thumbs up)', '(a slow nod)'], set: ['(a grin)', '(a tip of the hat)'], failed: ['(a sigh)'], theirs: ['(a frown)'] } },
    nan: { id: 'nan', name: E.PARTNER_NAME.nan, title: 'the Steady Hand', start: 'AH', ability: 'nod',
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
     Act III (300 levels, 2026-10-25): bowerhunt 73% at one trick, 40% at 2 (the
     easy opener), royal 36%, setbig 0% at a bid of 8 (the opponents almost never
     bid it) and 14% at 7, little4 10% (steerable: you may own a 4), showoff 8% at
     3 tricks (49% at 2; kept at 3, since you choose when to lead your own cards),
     make8 2% and openmis 1%, so those two are for Dance-offs only.
     kind 'limit': holds until it breaks, judged at the end of the level. */
  const OBJECTIVES = {
    every:    { name: 'Every Hand', text: 'Win a trick in every hand of the fight', of: 0, easy: true, acts: [1], kind: 'limit' },
    lowly9:   { name: 'Small Fry', text: 'Win a trick with a 9 or a 10', of: 1, acts: [1] },
    harvest:  { name: 'Red Rush', text: 'Win 13 hearts across the fight', of: 13, acts: [1] },
    setthem:  { name: 'Ambush', text: 'Defeat 2 of the opponents\u2019 contracts', of: 2, acts: [1, 2] },
    lastword: { name: 'Last Man Standing', text: 'Take the last trick yourself in 2 hands', of: 2, acts: [1] },
    bagjack:  { name: 'Wanted: Jacks', text: 'Win 4 tricks that hold a red Jack', of: 4, acts: [1] },
    blacks:   { name: 'Black Hats', text: 'Win BLACKS black cards across the fight', of: 0, acts: [2], easy: true },
    showoff:  { name: 'Show Off', text: 'Win SHOWOFF tricks with cards you own', of: 0, acts: [2, 3] },
    acehunter: { name: 'Aces High', text: 'Capture 3 Aces the opponents played', of: 3, acts: [2] },
    ruff:     { name: 'Ruff Stuff', text: 'Win 2 tricks by trumping a suit you\u2019re out of', of: 2, acts: [2] },
    lefthook: { name: 'Left Hook', text: 'Take a trick yourself with the left bower', of: 1, acts: [2] },
    holdline: { name: 'Hold the Fort', text: 'The opponents make no contract this fight', of: 0, acts: [2], kind: 'limit' },
    smoke:    { name: 'Smoke Out the Joker', text: 'Make an opponent play the Joker on a trick your team led', of: 1, acts: [2] },
    makemis:  { name: 'Make a Mis\u00e8re', text: 'You or your partner make a mis\u00e8re', of: 1, acts: [2], elite: true },
    little4:  { name: 'Small Change', text: 'Win 2 tricks with a 4 or a 5', of: 2, acts: [3] },
    setbig:   { name: 'Set the Big One', text: 'Defeat an opponents\u2019 bid of BIG or more', of: 1, acts: [3] },
    royal:    { name: 'Royal Flush', text: 'Capture all four Kings and all four Queens', of: 8, acts: [3] },
    bowerhunt: { name: 'Bower Hunt', text: 'Win 2 tricks that hold a bower', of: 2, acts: [3], easy: true },
    make8:    { name: 'Make 8', text: 'You or your partner make a contract of 8 or more', of: 1, acts: [3], elite: true },
    openmis:  { name: 'Open Mis\u00e8re', text: 'You or your partner make an open mis\u00e8re', of: 1, acts: [3], elite: true },
    // the Bank's only objective, never drawn anywhere else (see BANK)
    robbery:  { name: 'Stop the Robbery', text: 'Outscore the gang this hand', of: 1, acts: [1, 2], bank: true }
  };
  /* The Showdowns. Since the fight redesign each boss is a gang with health (FOE.boss) whose old race rule is now
     its ability; beat its health or run out of your own. */
  const BOSS = {
    // 2026-11-05, the set pays (E.FX.setPay): gangs x1.6 and every Showdown retuned to its old win rate, 800 stand-in runs
    // (run won 23% as before; Twins 84%, Hustlers 77%, Undertakers 65%, Caller 66%, Sharps 71%; the Stranger x1.5, unmeasured)
    // with their last stands (2026-11-02, fights.js 3 x 2000): Twins 79%, Sharps 70%, Hustlers 68%, Caller 70%, Undertakers ~68%
    twins:  { name: 'The Twins', short: 'Twins', act: 1, look: ['pJT', 'pJT'], hp: 120, hit: 1, rule: 'West and East are always dealt the two red Jacks, one each.',
              hint: 'In diamonds or hearts they hold both bowers. In no trumps their Jacks are just Jacks; the Joker beats them either way.' },
    sharps: { name: 'The Card Sharps', short: 'Sharps', act: 2, look: ['pKX', 'pKX'], hp: 330, hit: 2, rule: 'They can see your seeded cards, and hunt them.',
              revenge: 'Cousins of the Twins, by the look of the noses. Every carriage up ahead seems to be family.',
              hint: 'Lead your seeded cards when they can\u2019t be beaten, or let your partner cover them.' },
    hustlers: { name: 'The Hustlers', short: 'Hustlers', act: 2, look: ['pJY', 'pJY'], hp: 480, hit: 1.25, rule: 'They bid mis\u00e8re whenever they dare.',
              revenge: 'The Twins\u2019 big brothers. Every carriage up ahead seems to be family.',
              hint: 'One trick sinks a mis\u00e8re: lead low and stay under their card. Or outbid them with a 6 to keep them out.' },
    // Act III's two evened out (2026-11-02, fights.js 1500 x 2 seed sets: Caller 77% -> 69%, Undertakers 57-60% -> 66-69%)
    caller: { name: 'The Caller', short: 'Caller', act: 3, look: ['sJK', 'sQD'], hp: 1200, hit: 2, rule: 'Before each hand he calls a figure that changes the rules, aimed at the cards you were dealt from your own.',
              hint: 'Each call is chosen to hurt your seeded cards, and he tells you why. A run that only works one way gets punished.' },
    wallflowers: { name: 'The Undertakers', short: 'Undertakers', act: 3, look: ['pKU', 'pKU'], hp: 280, hit: 1.6, rule: 'They never bid, so your team must bid every hand, and at least 8.',
              hint: 'Nobody can pass the hand out: if your partner passes, you must bid. Bid what you can make, not what you hope.' },
    // never drawn: he takes the Fair's place when five marked cards call him (STRANGER)
    stranger: { name: 'The Stranger', short: 'Stranger', act: 3, look: ['gKstr', 'gKstr'], hp: 900, hit: 1.8, secret: true,
              rule: 'Each hand he plays by another Showdown\u2019s rule: the Twins\u2019 Jacks, the Sharps\u2019 hunt, the Hustlers\u2019 mis\u00e8re, the Caller\u2019s calls or the Undertakers\u2019 silence.',
              hint: 'He tells you whose rule he\u2019s playing at every deal. Read it before you bid.' }
  };
  /* Keeping you on your toes (2026-11-02, the fourth review's Inscryption ideas). Every surprise arrives at the deal,
     never mid-hand, and is either a rule you can see or a risk you choose (REVIEW.md's tension: 500 is a counting game).

     Last stands (#1): at half health every Showdown changes the table, announced at the next deal, once a fight.
     L.stand is the boss whose last stand is on; the engine and dealHand read it. */
  const LAST_STAND = { at: 0.5,
    twins:  { name: 'Two of a Kind', text: 'One of them is dealt the Joker in place of a red Jack.' },
    sharps: { name: 'Sleight of Hand', text: 'Each deal they palm your best seeded card and slip you one of theirs.' },
    hustlers: { name: 'All In', text: 'Their mis\u00e8res are played open now, and one they make hits you half as hard again.' },
    caller: { name: 'Do-si-do', text: 'Every hand, on top of his call, everyone passes one card to the left.' },
    wallflowers: { name: 'Dig a Grave', text: 'Each deal one of your cards is buried: it can never win a trick that hand.' }
  };
  /* The Stranger (#7): five marked cards, one a run from the stranger in the string tie, and he waits at the County
     Fair in the next story instead of its boss. Each hand he plays by another Showdown's rule (L.borrow, read through
     E.bossRule), never the same twice running. */
  const STRANGER = { marks: 5, rules: ['twins', 'sharps', 'hustlers', 'caller', 'wallflowers'] };
  // the Twins' rule, the Caller's rule
  const poss = s => s + (/s$/.test(s) ? '\u2019' : '\u2019s');
  /* A new rule every deal at the Duels (#2): the Caller's trick, spread. Only rules a player can see at the deal
     (Dealer's Lead and Gentleman's Lead change who leads the first trick, which nobody notices). */
  const DUEL_RULES = { 1: ['facekitty', 'corner', 'nokitty'],
                       2: ['facekitty', 'corner', 'nokitty', 'reverse', 'allemande', 'grand'] };
  DUEL_RULES[3] = DUEL_RULES[2];
  /* The rodeo clown talks (#6): dealt the Joker in a fight, he makes one dare a fight, before you bid. A quarter of
     the time he's lying, and owns up when you've done it: his next dare pays double. */
  const DARE_LIE = 0.25;
  const jk = (t, s) => t.cards[s] === 'JK';
  const DARES = {
    take:  { pay: 15, say: p => 'Win a trick with me in it, partner, and there\u2019s ' + p + ' gold in it for you.', met: (L, t) => t.winner === 0 && jk(t, 0) },
    early: { pay: 20, say: p => 'Play me on the first trick. Go on. ' + p + ' gold says you won\u2019t.', met: (L, t) => t.no === 1 && jk(t, 0) },
    ace:   { pay: 30, say: p => 'Take one of their Aces with me and I\u2019ll pay you ' + p + ' gold.', met: (L, t) => t.winner === 0 && jk(t, 0) && t.cards.some((c, s) => c && s % 2 === 1 && c !== 'JK' && E.rankOf(c) === 'A') },
    last:  { pay: 40, say: p => 'Save me for the last trick and win it with me: ' + p + ' gold.', met: (L, t) => t.no === E.ACTS[E.actOf(L)].hand && t.winner === 0 && jk(t, 0) }
  };
  function settleDare(L) {
    const d = L.dare;
    d.done = true; d.met = true;
    if (d.lie) { L.jokerOwes = true; E.say(L, 'The Joker: \u201cHa! Rodeo clown, partner. I never had a cent.\u201d He owes you one: his next dare pays double.', 'joker'); return; }
    L.jokerOwes = false; L.gold += d.pay;
    E.say(L, 'The Joker pays up: +' + d.pay + ' gold.', 'gold');
  }
  /* A second polish at the hotel (#4): push your luck. Each polish past the first shows its odds; a cracked card is
     lost to you, with everything on it (it stays in the deck as a plain card). */
  const HEAT = { crack: [0.25, 0.45, 0.65] };
  const heatOdds = L => L.heat ? HEAT.crack[Math.min(L.heat.n - 1, HEAT.crack.length - 1)] : 0;
  /* A stop you can't read (#7 of the review's list, "?"): one a map, a Card table, a Duel or a Gossip until you get
     there. Half the time, for a player who has ridden before, the stranger waits behind it. */
  const MYSTERY = { kinds: ['dance', 'elite', 'event'], stranger: 0.5 };
  /* The ghost of your last ride (#5): a run that died leaves its cards at Boot Hill (the page keeps them in the
     profile), and the next story meets them as a Card table on the act where it died: the gang plays your old cards
     with the enhancements that bend a trick (E.K reads L.ghostFight for West and East). Beat it and the best of them
     is yours again. */
  const GHOST = { hp: 1.2, bounty: 1.5, manner: { horse: 'bold', nan: 'cagey', showboat: 'bold', sharp: 'trumper', quiet: 'cagey' } };
  const ghostFoe = (F, g) => Object.assign({}, F, { name: 'The Ghosts of Your Last Ride', ghost: true, partner: g.partner, hp: Math.round(F.hp * GHOST.hp / 10) * 10,
    traits: [], bounty: GHOST.bounty, manner: GHOST.manner[g.partner] || 'bold' });
  // the best of the old cards that isn't yours now: the most work done on it
  function ghostCard(L) {
    const g = L.ghost, work = c => { const m = g.mods[c] || {}; return (m.enh ? 2 : 0) + (m.enh2 ? 2 : 0) + (m.up || 0); };
    const deck = E.deckOf(L);
    const can = g.owned.filter(c => !L.owned.includes(c) && deck.includes(c));
    return can.sort((a, b) => work(b) - work(a))[0] || null;
  }

  /* The Caller's calls (Act III's Hoedown). Before each hand he picks the one that hurts the cards
     dealt to you from your own the most, never the same call twice in a Hoedown, and says why.
     hurt(L) gives a score and the reason. */
  const lbl = c => E.label(c);
  const CALLS = {
    allemande: { name: 'Allemande Left', text: 'The left bower outranks the right this hand.',
      hurt: L => { const j = L.h.seeded.filter(c => c !== 'JK' && E.rankOf(c) === 'J'); return j.length ? { score: 3 * j.length, why: 'Your ' + lbl(j[0]) + ' would be a right bower; tonight the left bower beats it.' } : { score: 0.5, why: 'Bowers swap places, just to keep you on your toes.' }; } },
    reverse: { name: 'Reverse', text: 'The lowest card of the suit led wins the first trick, and nobody can trump in.',
      hurt: L => { const hi = L.h.seeded.filter(c => c === 'JK' || ['A', 'K'].includes(E.rankOf(c))); return hi.length ? { score: 1 + 0.4 * hi.length, why: 'Your ' + lbl(hi[0]) + ' can\u2019t take the first trick: the lowest card wins it.' } : { score: 0.5, why: 'The first trick goes to the lowest card.' }; } },
    promenade: { name: 'Promenade', text: 'The contractor\u2019s partner leads the first trick.',
      hurt: L => { const a = L.h.seeded.filter(c => c === 'JK' || E.rankOf(c) === 'A'); return { score: 0.8 + 0.3 * a.length, why: a.length ? 'If you win the bid, your partner leads, not you: no opening with your ' + lbl(a[0]) + '.' : 'Whoever wins the bid, their partner leads.' }; } },
    grand: { name: 'Grand Right and Left', text: 'Everyone passes one card to the left: you to West, East to you.',
      hurt: () => ({ score: 1, why: 'You give West a card, and East chooses what you get.' }) },
    swing: { name: 'Swing Your Partner', text: 'Swap one card with your partner.',
      hurt: () => ({ score: 0.4, why: 'A kindly call. Take the breather.' }) },
    nokitty: { name: 'No Kitty', text: 'The contractor never picks up the kitty.',
      hurt: L => ({ score: 1, why: 'No kitty to mend a hand: bid on the ' + E.ACTS[E.actOf(L)].hand + ' cards you hold.' }) },
    corner: { name: 'Honour Your Corner', text: 'Play goes the other way round: East plays after you, West before.',
      hurt: () => ({ score: 1, why: 'Everyone\u2019s position at the table changes.' }) }
  };
  /* Table rules (2026-10-30, the review's #1: hands at the Card tables all felt the same). Every Card-table gang
     plays by one rule for the whole fight, shown on its poster and nameplate. Each is one of the engine's switches
     (the Caller's calls) under a saloon name, or one of two new ones: the kitty dealt face up (you see it while
     bidding) and the dealer's lead. Act I draws from the gentle ones; the trick-bending ones join from Act II. */
  const TABLE_RULES = {
    facekitty:   { name: 'Open Kitty', text: 'The kitty is dealt face up: you can see it while you bid.' },
    dealerleads: { name: 'Dealer\u2019s Lead', text: 'The dealer leads the first trick, whoever wins the bid.' },
    promenade:   { name: 'Gentleman\u2019s Lead', text: 'The bid winner\u2019s partner leads the first trick.' },
    corner:      { name: 'Widdershins', text: 'Play goes the other way round: East plays after you, West before.' },
    nokitty:     { name: 'Closed Kitty', text: 'Nobody picks up the kitty: bid on the cards you hold.' },
    reverse:     { name: 'Low Card Takes It', text: 'The lowest card of the suit led wins the first trick, and nobody can trump in.' },
    allemande:   { name: 'Left Hand Rules', text: 'The left bower outranks the right.' },
    grand:       { name: 'Pass to the Left', text: 'Before play, everyone passes one card to the left: you to West, East to you.' }
  };
  const RULE_POOL = { 1: ['facekitty', 'dealerleads', 'promenade', 'corner', 'nokitty'],
                      2: ['facekitty', 'dealerleads', 'promenade', 'corner', 'nokitty', 'reverse', 'allemande', 'grand'] };
  RULE_POOL[3] = RULE_POOL[2];
  // the rule in force this fight: a next-fight rule (an event's) over the gang's own
  const ruleOf = L => (L.fight && L.fight.rule) || (L.foe && L.foe.rule) || null;
  /* What the next fight brings (events and the General Store, 2026-10-30): { peek, spy, double, tough, rule }, taken
     up when the fight starts (L.fight) and gone when it ends. sees(L, x): a buff, or this fight's gift. */
  const sees = (L, x) => has(L, x) || !!(L.fight && L.fight[x]);
  function chooseCall(L) {
    let best = null;
    for (const id of Object.keys(CALLS)) {
      if ((L.calls || []).includes(id)) continue;
      const h = CALLS[id].hurt(L), score = h.score + 0.8 * E.rnd(L);
      if (!best || score > best.score) best = { id, score, why: h.why };
    }
    return best;
  }
  /* Before the fight redesign the Showdowns were races, tuned over stand-in runs (see ARCHITECTURE.md's
     history); the Wallflowers' 7-trick floor (E.WALL.min) and the Hustlers' AI.HUSTLE come from then. */
  /* Which bosses can end each act, one drawn per run (the user's call, 2026-10-24: Act II draws from the Card Sharps and the Hustlers). */
  const BOSS_POOL = { 1: ['twins'], 2: ['sharps', 'hustlers'], 3: ['caller', 'wallflowers'] };   // Act III (the user's call, 2026-10-25)
  /* Buffs (relics). A partner's own ability is never offered. */
  const BUFFS = {
    // that change how a hand is played (2026-10-30, the review's #5)
    spyglass: { name: 'Spyglass', text: 'While you bid, you see one card from West\u2019s hand and one from East\u2019s.' },
    freshdeck: { name: 'Fresh Deck', text: 'Once a fight, before you bid, call for a new deal.' },
    firstdraw: { name: 'First Draw', text: 'When your partner wins the bid, you lead the first trick.' },
    sleeve:   { name: 'Card up Your Sleeve', text: 'Once a hand, before you bid, swap one of your cards for the kitty\u2019s top card, unseen.' },
    // the Act II bosses' secrets, carried by the risky train's last gang (COUNTER); never drawn or sold
    tell:     { name: 'The Sharps\u2019 Signals', text: 'You know their signals: the Card Sharps can\u2019t see your seeded cards, or hunt them, and they start the Showdown a quarter down.', secret: 'sharps' },
    bluff:    { name: 'Called Bluff', text: 'The Hustlers\u2019 mis\u00e8re is always played open: their hand goes face up after the first trick, and they start the Showdown a quarter down.', secret: 'hustlers' },
    count:    { name: 'Trump Count', text: 'Your partner keeps count: you see how many trumps are still out.', partner: true },
    nod:      { name: 'Partner’s Nod', text: 'Your partner shows their strongest suit while you bid.' },
    swing:    { name: 'Under the Table', text: 'After the kitty, slip your partner a card and she slips you one back, every hand.' },
    peek:     { name: 'Peek', text: 'See the kitty before you bid.' },
    bowertie: { name: 'Quick Draw', text: 'Your bowers tie the Joker: whichever is played first wins.' },
    nearmiss: { name: 'Just a Flesh Wound', text: 'Miss your contract by one trick and lose nothing: no backfire.' },
    // fifteen more (2026-10-29), most of them about the fight
    vest:     { name: 'Leather Vest', text: 'Every hand that hurts you hurts 5 less.' },
    canteen:  { name: 'Canteen', text: '+25 health after every fight you win.' },
    ledger:   { name: 'Bounty Ledger', text: '+15 gold for every gang you bring in.' },
    horse:    { name: 'Fast Horse', text: 'Par is one hand longer in every fight.' },
    watch:    { name: 'Pocket Watch', text: 'Once an act, a hit that would finish you stops at the watch: you hang on with 1 health.' },
    holster:  { name: 'Quick Holster', text: 'The first hand of every fight hits the gang double.' },
    scope:    { name: 'Rifle Scope', text: 'Your team\u2019s made contracts hit the gang a quarter harder.' },
    map:      { name: 'Treasure Map', text: 'Every pick of enhancements or buffs offers one more.' },
    credit:   { name: 'Store Credit', text: 'Everything at the General Store costs a fifth less.' },
    holdout:  { name: 'Holdout Sleeve', text: 'One more of your own cards is dealt to you each hand.' },
    bandolier: { name: 'Bandolier', text: 'Your defending tricks hit the gang for 15, not 10.' },
    iron:     { name: 'Iron Constitution', text: 'Your health goes up to 600, and you heal 100 now.' },
    pillow:   { name: 'Feather Pillow', text: 'A night at the Hotel heals 100 more.' },
    warrant:  { name: 'Signed Warrant', text: 'Every gang starts with a tenth less health.' },
    dice:     { name: 'Loaded Dice', text: 'Rerolling a reward is free.' }
  };
  /* Card enhancements, by the act that adds them to the reward pool (one new
     system per act). Act III adds Glass and the Triple Threat (not built yet). */
  const ENH = {
    growing: { name: 'Growing', text: '+1 rank each time it wins a trick, for the whole run; stops at Ace.', acts: [1, 2, 3] },
    sworn:   { name: 'Trump-sworn', text: 'Counts as the trump suit at its printed rank and ties the real card; plain in no trumps.', acts: [1, 2, 3] },
    giant:   { name: 'Giant-killer', text: 'Beats the Ace of its own suit, and only the Ace.', acts: [1, 2, 3] },
    magnet:  { name: 'Magnet', text: 'Counts double toward collect objectives (Red Rush, Black Hats).', acts: [1, 2, 3] },
    gilded:  { name: 'Gilded', text: 'Earns 5 gold each time it wins a trick.', acts: [1, 2, 3] },
    outcast: { name: 'Outcast', text: 'Has no suit: it can always be played, and never wins a trick. A safe throw, and a mis\u00e8re\u2019s best friend.', acts: [2, 3] },
    reverse: { name: 'Reverse', text: 'If you lead it, the lowest card of the suit led wins the trick, and nobody can trump in.', acts: [2, 3] },
    sanctuary: { name: 'Sanctuary', text: 'If you lead it, nobody can trump in: the highest card of the suit led wins.', acts: [2, 3] },
    herald:  { name: 'Herald', text: 'When you lead it, your partner tells you how many of that suit she holds.', acts: [2, 3] },
    twoface: { name: 'Two-faced', text: 'Counts as either suit of its colour: it may follow either, and it ruffs when its twin suit is trumps.', acts: [2, 3] },
    glass:   { name: 'Glass', text: 'Counts as the Ace of trumps (a tie: the first played wins). Leaves the deck the third time it wins a trick.', acts: [3] },
    triple:  { name: 'Triple Threat', text: 'A trick it wins counts as three toward your contract (and your defending tricks). Holding it lets you bid two tricks more than the hand.', acts: [3] },
    double:  { name: 'Doubly Woubly', text: 'A trick it wins counts as two toward your contract (and your defending tricks). Holding it lets you bid one trick more than the hand.', acts: [2, 3] },
    // fifteen more (2026-10-29): shots and armour for the fight, ranks that move with the trick, and a few oddities
    hollow:   { name: 'Hollow Point', text: 'A trick it wins hits the gang for 15 more.', acts: [1, 2, 3] },
    plate:    { name: 'Iron Plate', text: 'A trick it wins blocks 15 of the damage you take this hand.', acts: [1, 2, 3] },
    ricochet: { name: 'Ricochet', text: 'A trick the gang takes from it still hits them for 10.', acts: [1, 2, 3] },
    bullseye: { name: 'Bullseye', text: 'Win the hand\u2019s last trick with it and the gang takes 40.', acts: [1, 2, 3] },
    highnoon: { name: 'High Noon', text: 'Two ranks higher on the hand\u2019s first trick (no higher than an Ace).', acts: [1, 2, 3] },
    spurs:    { name: 'Spurs', text: 'One rank higher when you lead it (no higher than an Ace).', acts: [1, 2, 3] },
    steady:   { name: 'Steady Aim', text: 'No hex touches it, and nor do the gang\u2019s Rusty Guns or Sand in Your Eyes.', acts: [1, 2, 3] },
    hole:     { name: 'Ace in the Hole', text: 'On the hand\u2019s last trick it plays as the Ace of its suit (tying the real one).', acts: [2, 3] },
    lastdraw: { name: 'Last to Draw', text: 'Two ranks higher when it is the last card played to a trick.', acts: [2, 3] },
    desperado: { name: 'Desperado', text: 'One rank higher for every trick the gang has taken this hand.', acts: [2, 3] },
    knuckles: { name: 'Brass Knuckles', text: 'Two ranks higher in no trumps (and mis\u00e8res).', acts: [2, 3] },
    poster:   { name: 'Wanted Poster', text: 'A trick it wins counts twice toward the fight\u2019s bonus.', acts: [2, 3] },
    keg:      { name: 'Powder Keg', text: 'A trick it wins hits the gang for 30 more; a trick the gang takes from it burns you for 15.', acts: [3] },
    deadman:  { name: 'Dead Man\u2019s Hand', text: 'A trick it wins that holds an Ace or an 8 hits the gang for 25 more.', acts: [3] },
    horseshoe: { name: 'Lucky Horseshoe', text: 'If it wins a trick in a hand your contract fails, the backfire is halved.', acts: [3] },
    // four that grow over the run or pay off when they bid (2026-11-05, ESCALATION.md: the set pays, now build on it)
    notched:  { name: 'Notched', text: 'Each trick it wins carves a notch that stays all run, then hits the gang for 5 a notch.', acts: [1, 2, 3] },
    ambush:   { name: 'Ambush', text: 'When the gang holds the contract, a trick it wins hits them for 25.', acts: [1, 2, 3] },
    grudge:   { name: 'Grudge', text: 'Each time you set them with it in your hand it bears one more grudge, all run; every set hits them 20 more a grudge.', acts: [1, 2, 3] },
    spoiler:  { name: 'Spoiler', text: 'Win a trick with it in a hand you set them, and the set hits them twice.', acts: [2, 3] }
  };
  /* Legendary cards (the user's, 2026-10-29: "stack buffs into Legendary cards", and an enhancement on a card
     can't be overwritten). A card takes a second enhancement and becomes Legendary; a Legendary card is full.
     Pairs that cancel or repeat each other never share a card, and an Outcast (which never wins) only pairs with
     what works without winning. */
  const LEGEND = { slots: 2, clash: [['reverse', 'sanctuary'], ['sworn', 'glass'], ['double', 'triple']], outcastOk: ['herald', 'ricochet', 'steady', 'magnet', 'twoface', 'grudge'] };
  function fits(L, card, id) {
    if (!L.owned.includes(card) || card === 'JK' || !ENH[id]) return false;
    const have = E.enhsOf(L.mods[card]);
    if (have.length >= LEGEND.slots || have.includes(id)) return false;
    return have.every(x => !LEGEND.clash.some(pr => pr.includes(x) && pr.includes(id)) &&
      (x !== 'outcast' || LEGEND.outcastOk.includes(id)) && (id !== 'outcast' || LEGEND.outcastOk.includes(x)));
  }
  const legendary = (L, c) => E.enhsOf(L.mods && L.mods[c]).length >= LEGEND.slots;
  const enhPool = L => Object.keys(ENH).filter(k => ENH[k].acts.includes(L.act));
  const CURSES = {
    locked:  { name: 'Handcuffed', text: 'One card in your hand is chained until your team wins a trick.' },
    ticking: { name: 'Lit Fuse', text: 'One card must be played by trick 2, or −20 health.' },
    nokitty: { name: 'No Kitty', text: 'The contractor never picks up the kitty.' }
  };
  /* Hexes (from Act II): on a card, they hit whoever holds it (see the engine's header). */
  const HEXES = {
    loose:   { name: 'A Tell', short: 'Tell', text: 'Shown face-up to the table while held.' },
    potato:  { name: 'Dynamite', short: 'Dyn', text: 'The team that captures it loses 20.' },
    itchy:   { name: 'Itchy Trigger Finger', short: 'Itch', text: 'If it\u2019s legal to play, it must be played.' },
    stepped: { name: 'Dog-eared', short: '−1', text: '\u22121 rank, tying the card below.' },
    twoleft: { name: 'Misfire', short: 'Dud', text: 'Can never win a trick. A curse card you own: it takes a seed slot when dealt.' }
  };
  const BOSS_HEXES = ['stepped', 'loose', 'itchy', 'potato'];
  const CLEANSE_PRICE = 60;
  /* Barn Gossip. fx: gold, health, enh (pick 1 of n), card ('face'), release,
     hex { kind, on: 'owned' | 'table' }, curse ('twoleft': a new owned card).
     acts: where the event can come up (Act II adds the hex events). */
  const EVENTS = {
    fiddler:  { name: 'The Piano Player\u2019s Wager', text: 'The saloon pianist bets you can\u2019t name his next tune. You can.',
                options: [{ text: 'Take the purse: +30 gold', fx: { gold: 30 } }, { text: 'Take the encore: +50 health', fx: { health: 50 } }] },
    punch:    { name: 'Spilled Sarsaparilla', text: 'Someone knocks a whole jug of sarsaparilla over your boots.',
                options: [{ text: 'Help mop up: \u221240 health, then pick 1 of 2 enhancements', fx: { health: -40, enh: 2 } }, { text: 'Walk on by', fx: {} }] },
    stranger: { name: 'A Stranger\u2019s Card', text: 'A stranger in a string tie presses a card into your hand.',
                options: [{ text: 'Keep it: own a random face card, \u221220 health', fx: { health: -20, card: 'face' } }, { text: 'Hand it back politely', fx: {} }] },
    knitting: { name: 'Nan\u2019s Sewing Circle', text: 'Nan\u2019s friends offer to tidy up your cards over tea.',
                options: [{ text: 'Let them: turn loose a card you own, free', fx: { release: true } }, { text: 'Tea and gossip instead: +20 gold', fx: { gold: 20 } }] },
    apprentice: { name: 'The Card Sharp\u2019s Apprentice', text: 'A kid in the smoking car offers to teach you a fancy shuffle.', acts: [2],
                options: [{ text: 'Learn it: pick 1 of 2 enhancements, but a random card in the deck is Dog-eared', fx: { enh: 2, hex: { kind: 'stepped', on: 'table' } } }, { text: 'Watch from your seat', fx: {} }] },
    gossip:   { name: 'Word Gets Around', text: 'Word of your bidding is going up and down the carriages.', acts: [2],
                options: [{ text: 'Pay them to hush: \u221240 gold', fx: { gold: -40 } }, { text: 'Let them talk: one of your cards gets A Tell', fx: { hex: { kind: 'loose', on: 'owned' } } }] },
    jig:      { name: 'Dynamite in the Dining Car', text: 'A lit stick of dynamite skids down the dining car, and everybody passes it on.', acts: [2],
                options: [{ text: 'Grab it and throw it clear: +60 health, and the Dynamite lands on a random card in the deck', fx: { health: 60, hex: { kind: 'potato', on: 'table' } } }, { text: 'Duck under the table', fx: {} }] },
    cousin:   { name: 'The Clumsy Deputy', text: 'Nan\u2019s nephew, a brand-new deputy, insists on helping. He is not careful.', acts: [2],
                options: [{ text: 'Let him help: +60 gold, but he leaves you a Misfire (a curse card you own)', fx: { gold: 60, curse: 'twoleft' } }, { text: 'Make your excuses', fx: {} }] },
    // events that change the next fight (2026-10-30, the review's #9: Act I had four events)
    faro:     { name: 'The Faro Dealer\u2019s Lesson', text: 'An old faro dealer offers to show you how to read a kitty without lifting it.',
                options: [{ text: 'Take the lesson: see the kitty in every hand of your next fight', fx: { next: { peek: true } } }, { text: 'Buy him a drink instead: +20 gold from his tips', fx: { gold: 20 } }] },
    swapper:  { name: 'The Drunk Gambler', text: 'A gambler with one boot on offers to swap you a card, sight unseen.',
                options: [{ text: 'Swap: one of your cards (and anything on it) for a random card from the deck', fx: { swap: true } }, { text: 'Walk on by', fx: {} }] },
    preacher: { name: 'The Travelling Preacher', text: 'A preacher on a crate says the meek shall win the first trick.',
                options: [{ text: 'Take his blessing: +60 health, and in your next fight the lowest card takes the first trick', fx: { health: 60, next: { rule: 'reverse' } } }, { text: 'Slip away', fx: {} }] },
    telegraph: { name: 'The Telegraph Clerk', text: 'The clerk has read the gangs\u2019 telegrams, and he\u2019ll sell what he knows.',
                options: [{ text: 'Pay 30 gold: in your next fight, see one card from each opponent\u2019s hand while you bid', fx: { gold: -30, next: { spy: true } } }, { text: 'Not today', fx: {} }] },
    posting:  { name: 'Deputised', text: 'The sheriff is short a deputy and long on paperwork. He offers you the badge: double the bounty on the next gang, but they\u2019re tougher than they look.',
                options: [{ text: 'Take it: your next fight pays double, and its gang has a quarter more health', fx: { next: { double: true, tough: true } } }, { text: 'Leave it on the board', fx: {} }] },
    // the controlled shunt (2026-10-29, the user's idea): swap two carriages ahead on one stretch of line, to replan
    // off the train with the braided tracks (2026-10-30: nothing there is left to switch); the Fair still has him
    switchman: { name: 'The Switchman', text: 'At a siding the switchman leans on his lever. \u201cWant a couple of cars shuffled up the line? Nobody\u2019ll know.\u201d', acts: [],
                options: [{ text: 'Throw the switch: swap two carriages on one stretch of line ahead', fx: { shunt: true } }, { text: 'Tip your hat: he hands you 25 gold he found on the tracks', fx: { gold: 25 } }] },
    dare:     { name: 'The Gunslinger\u2019s Dare', text: 'A gunslinger dares you to match his fastest shuffle.', acts: [2],
                options: [{ text: 'Take the dare: pick 1 of 3 enhancements, and one of your cards gets an Itchy Trigger Finger', fx: { enh: 3, hex: { kind: 'itchy', on: 'owned' } } }, { text: 'Decline', fx: {} }] }
  };
  Object.keys(EVENTS).forEach(k => { if (!EVENTS[k].acts) EVENTS[k].acts = [1, 2, 3]; else if (!EVENTS[k].acts.includes(3)) EVENTS[k].acts.push(3); });
  const PAY = { dance: [0, 10, 25, 40], elite: [0, 20, 40, 60] };
  /* The Bank (2026-10-27): one building on Euchre-ka!'s map (Dustwater's until 2026-11-04), on a middle floor. Walk in and a gang is robbing
     it: one hand of 500 against them, the stakes shown at the door, and you may still walk on by. Outscore
     them and the bank pays a bounty and lets you pick an enhancement; lose and they ride off with a share of
     your gold. Either way the teller will then cash in health for gold. Tuned in tests/bank.js. */
  /* The train robbery (the user's, 2026-10-30): lose and they take all your gold; win and you pick an enhancement
     from their haul, no gold; and no express agent cashes in health afterwards (`teller`). */
  const BANK = { acts: [1, 2], floors: [1, 2, 4, 5], hands: 1, bounty: { 1: 60, 2: 0 }, take: { 1: 0.5, 2: 1 }, teller: { 1: true, 2: false }, enh: 2 };
  /* The same stop on the train (2026-10-29): the gang is blowing the express car's safe, and the express company
     pays the bounty. Only the words and the bounty change with the act. */
  const HOLDUP = {
    1: { place: 'The bank of Euchre-ka!', what: 'a gang is robbing the bank', payer: 'The bank', gone: 'the bank\u2019s gold', window: 'The teller\u2019s window', clerk: 'the teller', out: 'Back to the street' },
    2: { place: 'The express car', what: 'a gang is blowing the express car\u2019s safe', payer: 'The express company', gone: 'the express company\u2019s gold', window: 'The express agent', clerk: 'the express agent', out: 'Back to your seat' }
  };
  const holdup = L => HOLDUP[L.act] || HOLDUP[1];
  const bankBounty = L => BANK.bounty[L.act] != null ? BANK.bounty[L.act] : BANK.bounty[1];
  const takeOf = L => BANK.take[(L && L.act) || 1] || BANK.take[1];
  const bankTake = L => Math.floor(L.gold * takeOf(L));
  const bankShare = L => ({ 0.25: 'a quarter', 0.5: 'half', 0.75: 'three quarters', 1: 'all' })[takeOf(L)] || Math.round(100 * takeOf(L)) + '%';
  /* The map (2026-10-26, after Gwent's The Path, which is after Slay the Spire): each act is seven floors on
     a grid five wide, four paths up it that never cross, and the Hoedown above them all. Floor 1 is always a
     Dance, floor 4 the Raffle (a free buff), floor 7 a Punch Bowl; the rest are drawn at Gwent's odds, with no
     Dance-off or Punch Bowl on the first two floors, and no two stores, Punch Bowls or Dance-offs in a row. */
  const MAPSHAPE = { floors: 7, cols: 5, paths: 4, raffle: 3 };
  /* Act III is two floors shorter (the user's, 2026-11-02: "cutting two floors pays for the chase"): its 10-card
     hands make it the longest act. A floor's gang is as strong as the same height up a seven-floor map (eqFloor),
     the gold strike sits at the same height, and the last floor is still the rest. */
  const floorsFor = act => act === 3 ? 5 : MAPSHAPE.floors;
  const raffleOf = FL => Math.round(MAPSHAPE.raffle * (FL - 1) / (MAPSHAPE.floors - 1));
  const eqFloor = (f, FL) => f * (MAPSHAPE.floors - 1) / (FL - 1);
  const mapFloors = L => L.map && L.map.floors ? L.map.floors.length : MAPSHAPE.floors;
  // the Westbound Express also stops for water (2026-10-29): floors 2, 3, 5 and 6, never two in a row
  const ROOMS = (f, act, FL = MAPSHAPE.floors) => [['dance', 45], ['event', 22], ['elite', f >= 2 ? 14 : 0], ['store', f >= 2 ? 12 : 3], ['camp', f >= 2 && f !== FL - 2 ? 9 : 0],
    ['water', WATER.acts.includes(act) && f >= 1 && f !== raffleOf(FL) && f !== FL - 1 ? WATER.weight : 0]];
  /* The water stop: the train takes on water and you step down. Do one thing: fill your canteen, help the fireman
     load wood for a few coins (it was scouting for a clue until the clues went, 2026-10-30), or have him scrub a
     hex off a card. */
  const WATER = { acts: [2], weight: 12, health: 75, gold: 20 };
  const RAFFLE = { gold: 25, noBuff: 60, buff: true, pick: 2 };   // pick: buffs to choose from (0 = one drawn for you)
  /* What players read for each stop type (the western glossary): KIND_NAME is the rules name, used in the
     legend, the rules and the screens; PLACE is where each act puts that stop on its map. The ids stay. */
  /* The Getaway (the user's, 2026-11-02: "an Act 3 twist that completely changes the game play: the boss escapes
     into a mine cart, or a ghost train if the haunted house"). The Fair's Showdown is won, and they bolt: the Caller
     in a mine cart into the old silver mine behind the barn, the Undertakers on the ghost train out of the haunted
     house. You give chase on a handcar, CHASE.stretches stretches of track, each ONE quick hand by Act I's rules
     (L.rules: 3 cards, hearts and diamonds), nothing at stake but the gap. Before each stretch, pick a way: the main
     line (a won stretch closes a length, a lost one opens one) or the cut-off (two either way). Outscore them on the
     stretch to gain (a tie is theirs). Gap at nothing: caught, for the strongbox (CHASE.bounty) and a partner who
     rides with you from your next story (CHASE.ride[boss].unlock; a catch without losing a stretch also brings The
     Sharp). Gap at CHASE.away, or the track runs out: they get away, and the run is still won. The chase can never
     lose a run: it decides how big the win is. */
  const CHASE = { stretches: 5, gap: 2, away: 4, rules: 1, bounty: 150, clean: 'sharp',
    ride: { caller: { cart: 'the mine cart', into: 'into the old silver mine behind the barn', unlock: 'showboat' },
            wallflowers: { cart: 'the ghost train', into: 'onto the ghost train out of the haunted house', unlock: 'quiet' } },
    // the cut-off branches off after the first stretch (taken first, the whole chase was one coin flip)
    forks: { main: { name: 'The main line', text: 'Take the stretch and you close a length; lose it and they gain one.', step: 1 },
             cutoff: { name: 'The cut-off', text: 'Steep and fast: two lengths either way.', step: 2 } } };
  const chaseRide = c => CHASE.ride[c && c.boss] || CHASE.ride.caller;
  function startChase(L) {
    const boss = BOSS_POOL[3].includes(L.boss) ? L.boss : L.map && L.map.boss;
    // a faster handcar (the Fair's goods) is a spare: the first lost stretch costs no ground (it's still lost)
    const gap = CHASE.gap + (wants(L, 'head') ? 1 : 0);
    L.chase = { boss, n: 0, gap, spare: L.fastCar ? 1 : 0, won: 0, lost: 0, stage: 'start', fork: null, last: null, result: null, unlock: [] };
    L.phase = 'chase';
    E.say(L, BOSS[boss].name + ' bolt ' + chaseRide(L.chase).into + '! After them!', 'level');
  }
  function chase(L, what) {
    if (L.phase !== 'chase' || !L.chase) return no('no chase on');
    const c = L.chase;
    if (c.result) {
      if (what !== 'finish') return no('the chase is over');
      L.rules = null; L.phase = 'victory';
      return yes();
    }
    if (!CHASE.forks[what]) return no('the main line or the cut-off');
    if (what === 'cutoff' && c.n === 0) return no('the cut-off branches off after the first stretch');
    c.fork = what; c.stage = 'ride';
    startLevel(L, 'chase');
    return yes();
  }
  // a stretch is run: the gap moves, and the chase goes on, or ends
  function chaseStretch(L) {
    const c = L.chase, F = CHASE.forks[c.fork] || CHASE.forks.main, won = L.you > L.opp;
    c.n++;
    const spared = !won && c.spare > 0;
    if (spared) c.spare--;
    c.gap += won ? -F.step : spared ? 0 : F.step;
    if (won) c.won++; else c.lost++;
    c.last = { won, you: L.you, them: L.opp, fork: c.fork, step: spared ? 0 : F.step, spared };
    L.record = (L.record || []).concat({ act: L.act, level: L.level, kind: 'chase', id: c.boss, stars: won ? 3 : 1, won });
    E.say(L, (won ? 'You gain on them' : 'They pull away') + ' (' + L.you + ' to ' + L.opp + '): ' + (c.gap <= 0 ? 'right on their tail!' : c.gap + ' length' + (c.gap > 1 ? 's' : '') + ' between you.'), 'objective');
    L.result = null;
    if (c.gap <= 0) endChase(L, true);
    else if (c.gap >= CHASE.away || c.n >= CHASE.stretches) endChase(L, false);
    else c.stage = 'fork';
    L.phase = 'chase';
    L.curse = null; L.dealRule = null; L.fight = null; L.rules = null;
  }
  function endChase(L, caught) {
    const c = L.chase, B = BOSS[c.boss].name;
    c.result = caught ? 'caught' : 'escaped'; c.stage = 'end';
    c.unlock = caught ? [chaseRide(c).unlock].concat(c.lost === 0 ? [CHASE.clean] : []) : [];
    if (caught) {
      L.gold += CHASE.bounty;
      E.say(L, 'You catch ' + B.replace(/^The /, 'the ') + ' at the end of the line! Their strongbox is yours: +' + CHASE.bounty + ' gold.', 'gold');
    } else E.say(L, B + ' get away ' + chaseRide(c).into.replace(/^(into|onto) /, 'down ') + ', strongbox and all.', 'objective');
    L.record = (L.record || []).concat({ act: L.act, level: L.level, kind: 'getaway', id: c.boss, stars: 0, won: caught, clean: caught && c.lost === 0 });
  }
  /* Prize contests (Act III, the user's, 2026-11-01: the County Fair's signature stop, "a fun side bet rather than
     another fight"). One hand against two fellow contestants, judged on one thing; it costs only the entry, never
     health. A ribbon by the score: white gives the entry back and a little more, red a pick of enhancements, blue a
     pick of buffs; no ribbon, the entry is gone. Two contests a Fair map, each where a gossip stop would have been
     (else a Card table), on CONTEST.floors, never two on one floor. `tiers` is the score for white, red and blue
     (tests/contests.js measures them). */
  /* Quick contests (the user's, 2026-11-02: "if the chase's quick hands feel good, convert the contests to quick
     hands"): CONTEST.quick plays a contest as quickHands hands by Act I's rules (3 cards, hearts and diamonds), the
     Getaway's hands, instead of one 10-card hand; each contest keeps both sets of ribbon tiers (`full`, `quick`)
     and setQuick picks one. Turn it off with setQuick(false) if the quick hands don't feel right. */
  const CONTEST = { acts: [3], per: 2, floors: [1, 3], fee: 20, white: 10, hands: 1, quick: true, quickHands: 2, list: {
    pie:    { name: 'The Pie Contest', place: 'The big top', what: 'Every heart in a trick your team takes is a slice of pie.', unit: ['slice', 'slices'], full: [6, 9, 11], quick: [5, 7, 9], look: ['gQpj', 'gKpj'], host: 'The pie judges' },
    turkey: { name: 'The Turkey Shoot', place: 'The shooting range', what: 'Every trick your team wins with an Ace or the Joker is a turkey down.', unit: ['turkey', 'turkeys'], full: [2, 3, 4], quick: [1, 2, 3], look: ['gJsg1', 'gKsg2'], host: 'The range master' },
    bell:   { name: 'Ring the Bell', place: 'The strongman\u2019s bell', what: 'Your team’s score for the hand rings the bell: make a big contract and it rings high.', unit: ['point', 'points'], full: [40, 120, 250], quick: [30, 80, 110], look: ['gKsm', 'gKmg'], host: 'The strongman' },
    race:   { name: 'The Horse Race', place: 'The race track', what: 'Take tricks in a row: your team\u2019s longest run is your horse\u2019s lead.', unit: ['length', 'lengths'], full: [4, 6, 10], quick: [2, 3, 4], look: ['gKht1', 'gJht2'], host: 'The starter' }
  } };
  const RIBBON = ['no ribbon', 'a white ribbon', 'a red ribbon', 'a blue ribbon'];
  function setQuick(on) {
    CONTEST.quick = !!on;
    for (const id in CONTEST.list) CONTEST.list[id].tiers = on ? CONTEST.list[id].quick : CONTEST.list[id].full;
  }
  setQuick(CONTEST.quick);
  const ribbonOf = (id, score) => CONTEST.list[id].tiers.filter(t => score >= t).length;
  function placeContests(L, floors) {
    const ids = E.shuffle(L, Object.keys(CONTEST.list)), fl = E.shuffle(L, CONTEST.floors.slice());
    let k = 0;
    for (const f of fl) {
      if (k >= CONTEST.per) break;
      const row = floors[f] || [], pool = ['event', 'dance', 'elite', 'store'].flatMap(k => row.filter(n => n.kind === k));
      if (!pool.length) continue;
      Object.assign(pool[0], { kind: 'contest', contest: ids[k++] });
    }
  }
  /* At the contest: enter (the fee) or walk on by. */
  function contest(L, what) {
    if (L.phase !== 'contest' || !L.contest) return no('no contest here');
    const C = CONTEST.list[L.contest.id];
    if (what === 'leave') { note(L, 'You walk on by. ' + C.name + ' goes on without you.'); L.contest = null; nextStop(L); return yes(); }
    if (what === 'enter') {
      if (L.gold < CONTEST.fee) return no('the entry is ' + CONTEST.fee + ' gold');
      L.gold -= CONTEST.fee;
      Object.assign(L.contest, { stage: 'play', score: 0, run: 0 });
      startLevel(L, 'contest');
      return yes();
    }
    return no('enter, or walk on by');
  }
  const KIND_NAME = { dance: 'Card table', event: 'Gossip', camp: 'Hotel', elite: 'Duel', boss: 'Showdown', store: 'General Store', raffle: 'Gold strike', bank: 'Bank', water: 'Water stop', contest: 'Prize contest', mystery: 'A stop you can\u2019t read' };
  // where an act calls a stop something else (the train's Bank is a robbery on the express car)
  const KIND_BY_ACT = { 2: { bank: 'Train robbery' } };
  const kindName = (act, k) => (KIND_BY_ACT[act] || {})[k] || KIND_NAME[k];
  const PLACE = {
    1: { dance: 'A card table', event: 'The barber shop', camp: 'The hotel', elite: 'High noon on Main Street', boss: 'The Saloon', store: 'The general store', raffle: 'The town square', bank: 'The bank of Euchre-ka!' },
    2: { dance: 'The smoking car', event: 'A passenger\u2019s tale', camp: 'The sleeper car', elite: 'On the carriage roof', boss: 'The locomotive', store: 'The candy butcher\u2019s cart', raffle: 'The observation car', bank: 'The express car', water: 'The water tower' },
    3: { dance: 'The card tent', event: 'The fortune teller\u2019s tent', camp: 'The chuck wagon', elite: 'The shooting gallery', boss: 'The grandstand', store: 'Merchants\u2019 row', raffle: 'The prize raffle' }
  };
  const int = (L, a, b) => a + Math.floor(E.rnd(L) * (b - a + 1));
  function weighted(L, pairs) {
    const live = pairs.filter(p => p[1] > 0), tot = live.reduce((n, p) => n + p[1], 0);
    let x = E.rnd(L) * tot;
    for (const p of live) if ((x -= p[1]) < 0) return p[0];
    return live[live.length - 1][0];
  }
  /* Act II, the Westbound Express (the user's, 2026-10-30; it replaces the five braided tracks, which didn't read):
     Train 1 runs straight through three carriages to its engine cab, where the boss's engineer waits (a Duel with a
     debuff: the boss sent him). Beat him and his train runs off the rails into a ravine as two trains draw level and
     you jump: the LEFT one is safe (two of the store, the water stop and gossip, then the sleeper car's rest) but
     powers up few of your cards; the RIGHT one is risky (a card table and the robbery in either order, then a Duel
     whose gang carries the boss's secret: beat them and the boss loses its trick, COUNTER). Both run on to the boss,
     drawn at random with the map and fixed from the start. Floors 0-2 Train 1 (column 2), 3 the cab, 4-6 the two
     trains (columns 1 and 3); MAPSHAPE's seven floors, so floorOf and the stacked deck read the same. */
  const EXPRESS = { first: [['dance', 1], ['event', 3], ['store', 2], ['water', 2]], safe: ['store', 'water', 'event'], risky: ['dance', 'bank'], driver: 0.8, cut: 0.4, secretHp: 0.7 };
  // the engineer: a Duel's health at the cab's floor (times EXPRESS.driver), with one of the gangs' debuffs on you
  const DRIVER = { look: ['gKbk2', 'gJbk1'], name: { sharps: 'Lucky Lou, the Sharps\u2019 engineer', hustlers: 'Coal-eyed Pete, the Hustlers\u2019 engineer' } };
  // what the risky train's last gang carries: the boss's secret, as a buff that takes away its trick and a
  // quarter of its health (EXPRESS.cut); gone when the act is
  const COUNTER = { sharps: 'tell', hustlers: 'bluff' };
  function makeDriver(L, boss) {
    const hp = Math.round((FOE.base[2] + FOE.step[2] * 3) * FOE.elite * EXPRESS.driver / 10) * 10;
    return { name: DRIVER.name[boss] || 'The engineer', look: DRIVER.look.slice(), hp, traits: [E.pick(L, Object.keys(DEBUFFS))], hitMul: 1, bounty: 1, driver: boss };
  }
  /* Act II rebuilt again (the user's, 2026-11-01: "the level is a 2D train going along on the track; the players
     can move between the interior carriages and the carriage roofs; occasionally they can use a roof hatch to
     change"). One train seen side on, the caboose at the back, the locomotive (the Showdown) at the front. Every
     carriage f (floors 0-6) has two stops: inside it (column 1, lane 'in') and on its roof (column 3, lane 'roof').
     You go car to car in your lane (through the vestibule doors, or jumping the gap along the roofs); a carriage
     with a roof hatch (`hatch`) also lets you climb up or drop down as you go on to the next one. Three hatches a
     train, never side by side, one of them in the last two carriages, so the last choice is always yours to make.
       inside: the safer, quieter lane: the candy butcher's cart (the store), the parlour car's gossip, the express
               car being robbed, the water stop, and the sleeper car's rest before the locomotive
       roof:   the risky lane: a Duel and a card game fought on the roof, the water stop as the train passes the
               tower, the gold strike, a stranger, and last the gang carrying the boss's secret (as the risky train had)
     Both lanes start at a card table in the caboose's end of the train.
     Old saves keep their old map (`express`, the three trains): the page still draws it. */
  const SIDE = { floors: 7, hatches: [[0, 2, 4], [0, 2, 5], [0, 3, 5], [1, 3, 5]],
                 inside: ['store', 'event', 'bank', 'event', 'water'], roof: ['elite', 'water', 'raffle', 'dance', 'event'] };
  /* (Measured with tests/fights.js, 600-900 stand-in runs: two Duels and two card tables a lane let 28% of Act II
     runs through and won 10%; this mix, the old safe train's few fights inside and the risky train's on the roof,
     lets 46% through and wins 15%, against 48% and 18% on the three trains.) */
  // a lane's middle five, reshuffled until its rule holds (the robbery and the strike mid-train, no Duels back to back)
  function sideLane(L, kinds, ok) {
    for (let t = 0; t < 60; t++) { const a = E.shuffle(L, kinds.slice()); if (ok(a)) return a; }
    return kinds.slice();
  }
  function genExpress(L) {
    const boss = E.pick(L, BOSS_POOL[2]), F = SIDE.floors;
    // who waits at the County Fair is settled now, so your partner can say why you're on this train
    L.fairBoss = E.pick(L, BOSS_POOL[3]);
    // the robbery on one of the Bank's floors and the strike mid-train, and never a way from one water stop
    // straight on to another (along a lane, or through a hatch to the other lane's)
    let hatch, inside, roof;
    for (let t = 0; t < 40; t++) {
      hatch = E.pick(L, SIDE.hatches);
      inside = ['dance'].concat(sideLane(L, SIDE.inside, a => BANK.floors.includes(a.indexOf('bank') + 1) && a[0] !== 'event'), ['camp']);
      roof = ['dance'].concat(sideLane(L, SIDE.roof, a => { const r = a.indexOf('raffle') + 1; return r >= 2 && r <= 4 && a[4] !== 'elite'; }), ['elite']);
      const wi = inside.indexOf('water'), wr = roof.indexOf('water');
      const touch = (a, b) => b === a + 1 && hatch.includes(a);
      if (!touch(wi, wr) && !touch(wr, wi)) break;
    }
    const floors = [];
    for (let f = 0; f < F; f++) {
      const on = c => f === F - 1 ? ['boss'] : hatch.includes(f) ? [(f + 1) + ':1', (f + 1) + ':3'] : [(f + 1) + ':' + c];
      floors.push([{ id: f + ':1', f, c: 1, lane: 'in', kind: inside[f], next: on(1), hatch: hatch.includes(f) },
                   { id: f + ':3', f, c: 3, lane: 'roof', kind: roof[f], next: on(3), hatch: hatch.includes(f) }]);
    }
    const seen = [];
    for (const row of floors) for (const n of row) if (n.kind === 'dance' || n.kind === 'elite') n.foe = makeFoe(L, n.kind, n.f, seen);
    // the secret's carriers, on the last roof: one trick up their sleeve, not a Duel's two
    const sf = floors[F - 1][1].foe;
    Object.assign(sf, { tipoff: boss, traits: sf.traits.slice(0, 1), bounty: 1, hp: Math.round(sf.hp * EXPRESS.secretHp / 10) * 10 });
    L.map = { floors, boss, side: true };
    L.map.loot = pickLoot(L);
    dressMap(L);
    L.pos = null; L.path = []; L.route = [];
  }
  /* The Showdown's loot (the user's, 2026-11-01: the wanted poster should say what you win, not just the 100 gold, and
     the ledger should list it): one buff you don't have, drawn with the map, named on the poster and handed over on
     payday. Already yours by then? The old pick of three instead. None at the Fair: winning it ends the run. */
  const pickLoot = L => { const fb = L.act < LAST_ACT ? freeBuffs(L) : []; return fb.length ? E.pick(L, fb) : null; };
  /* The three trains' map (2026-10-30), kept for runs saved on it: nothing generates it any more. */
  function genThreeTrains(L) {
    const boss = E.pick(L, BOSS_POOL[2]), floors = [];
    const stop = (f, c, kind, next) => ({ id: f + ':' + c, f, c, kind, next: [next] });
    // the third carriage is the observation car's gold strike (the free buff the old map gave halfway up)
    ['dance', weighted(L, EXPRESS.first), 'raffle'].forEach((k, f) => floors.push([stop(f, 2, k, (f + 1) + ':2')]));
    floors.push([Object.assign(stop(3, 2, 'elite', '4:1'), { next: ['4:1', '4:3'], driver: true })]);
    const safe = E.shuffle(L, EXPRESS.safe.slice()).slice(0, 2).concat('camp'), risky = E.shuffle(L, EXPRESS.risky.slice()).concat('elite');
    for (let i = 0; i < 3; i++) {
      const f = 4 + i, on = c => f === 6 ? 'boss' : (f + 1) + ':' + c;
      floors.push([Object.assign(stop(f, 1, safe[i], on(1)), { train: 'safe' }), Object.assign(stop(f, 3, risky[i], on(3)), { train: 'risky' })]);
    }
    const seen = [];
    for (const row of floors) for (const n of row) if (n.kind === 'dance' || n.kind === 'elite') n.foe = n.driver ? makeDriver(L, boss) : makeFoe(L, n.kind, n.f, seen);
    // the secret's carriers: one trick up their sleeve, not a Duel's two
    const sf = floors[6][1].foe;
    Object.assign(sf, { tipoff: boss, traits: sf.traits.slice(0, 1), bounty: 1, hp: Math.round(sf.hp * EXPRESS.secretHp / 10) * 10 });
    floors.slice(0, 4).forEach(row => row.forEach(n => { n.train = 'first'; }));
    L.map = { floors, boss, express: true };
    L.pos = null; L.path = []; L.route = [];
  }
  function genMap(L) {
    if (L.act === 2) return genExpress(L);
    const { cols: CO, paths: PA } = MAPSHAPE, FL = floorsFor(L.act);
    const edges = {}, used = {};
    // a step from (f, a) to (f+1, b) crosses an existing edge from floor f if they swap sides
    const crosses = (f, a, b) => Object.keys(edges).some(k => {
      const [ff, cc] = k.split(':').map(Number);
      return ff === f && edges[k].some(dd => (a < cc && b > dd) || (a > cc && b < dd));
    });
    const starts = E.shuffle(L, Array.from({ length: CO }, (_, c) => c));
    for (let p = 0; p < PA; p++) {
      let col = p < 2 ? starts[p] : int(L, 0, CO - 1);
      used['0:' + col] = true;
      for (let f = 0; f < FL - 1; f++) {
        let next = col;
        for (let t = 0; t < 12; t++) {
          const c2 = Math.max(0, Math.min(CO - 1, col + int(L, -1, 1)));
          if (!crosses(f, col, c2)) { next = c2; break; }
        }
        const k = f + ':' + col;
        edges[k] = edges[k] || [];
        if (!edges[k].includes(next)) edges[k].push(next);
        used[(f + 1) + ':' + next] = true;
        col = next;
      }
    }
    const floors = [];
    for (let f = 0; f < FL; f++) {
      const row = [];
      for (let c = 0; c < CO; c++) if (used[f + ':' + c])
        row.push({ id: f + ':' + c, f, c, kind: null, next: f < FL - 1 ? (edges[f + ':' + c] || []).slice().sort().map(n => (f + 1) + ':' + n) : ['boss'] });
      floors.push(row);
    }
    for (const row of floors) for (const n of row)
      n.kind = n.f === 0 ? 'dance' : n.f === raffleOf(FL) ? 'raffle' : n.f === FL - 1 ? 'camp' : weighted(L, ROOMS(n.f, L.act, FL));
    const byId = {};
    floors.forEach(row => row.forEach(n => { byId[n.id] = n; }));
    for (const row of floors) for (const n of row) for (const id of n.next) {
      const m = byId[id];
      if (m && m.kind === n.kind && ['store', 'camp', 'elite', 'water'].includes(m.kind) && m.f !== FL - 1) m.kind = 'dance';
    }
    if (BANK.acts.includes(L.act)) {
      const spots = floors.filter((row, f) => BANK.floors.includes(f)).flat();
      if (spots.length) E.pick(L, spots).kind = 'bank';
    }
    if (TOWN.acts.includes(L.act)) townRules(floors);
    if (CONTEST.acts.includes(L.act)) placeContests(L, floors);
    // every gang is drawn with the map, so its wanted poster can be read before you choose a way (no gang twice
    // on one map while there are others to draw)
    const seen = [];
    for (const row of floors) for (const n of row) if (n.kind === 'dance' || n.kind === 'elite') n.foe = makeFoe(L, n.kind, eqFloor(n.f, FL), seen);
    L.map = { floors, boss: L.act === 3 && BOSS_POOL[3].includes(L.fairBoss) ? L.fairBoss : E.pick(L, BOSS_POOL[L.act]) };
    if (L.act === LAST_ACT && L.strangerDue) L.map.boss = 'stranger';
    L.map.loot = pickLoot(L);
    dressMap(L);
    L.pos = null; L.path = []; L.route = [];
  }
  /* What every map gets once its stops are drawn: the ghost of your last ride on the act where it died, and one stop
     you can't read (n.kind 'mystery', the real kind in n.hid until you arrive). */
  function dressMap(L) {
    const all = L.map.floors.flat(), F = L.map.floors.length, g = L.ghost;
    const odd = n => n.foe && (n.foe.ghost || n.foe.tipoff || n.foe.driver);
    if (g && !g.met && g.act === L.act) {
      const spots = all.filter(n => n.kind === 'dance' && n.f >= 1 && n.f <= F - 2 && !odd(n));
      if (spots.length) { const n = E.pick(L, spots); n.foe = ghostFoe(n.foe, g); }
    }
    const hide = all.filter(n => MYSTERY.kinds.includes(n.kind) && n.f >= 1 && n.f <= F - 2 && !odd(n) && !n.span);
    if (!hide.length) return;
    const n = E.pick(L, hide);
    n.hid = n.kind; n.kind = 'mystery';
    if (L.memory && L.memory.runs && !L.metStranger && E.rnd(L) < MYSTERY.stranger) { n.hid = 'event'; n.event = 'stranger'; delete n.foe; }
  }
  /* Dustwater's town rules (2026-10-27, the user's: a town this size has one hotel, and two hotels side by side
     are one hotel). The last floor's Hotels become the one Hotel every route reaches (every route rested there
     anyway). Side-by-side stops of the same building kind on a floor become one stop: both ways in reach it,
     and it leads on to everywhere either did. `span` keeps the columns a merged stop covers, so the town draws
     it between them. No randomness: a seed's map is the same up to here. */
  const TOWN = { acts: [1], merge: ['camp', 'store', 'bank'] };
  const spanOf = n => n.span || [n.c, n.c];
  function mergeInto(floors, keep, gone) {
    keep.span = [Math.min(spanOf(keep)[0], spanOf(gone)[0]), Math.max(spanOf(keep)[1], spanOf(gone)[1])];
    keep.next = [...new Set(keep.next.concat(gone.next))].sort();
    for (const row of floors) for (const n of row) if (n.next.includes(gone.id)) n.next = [...new Set(n.next.map(id => id === gone.id ? keep.id : id))].sort();
    floors[gone.f].splice(floors[gone.f].indexOf(gone), 1);
  }
  function townRules(floors) {
    const last = floors[floors.length - 1];
    while (last.length > 1) mergeInto(floors, last[0], last[1]);
    for (let f = 1; f < floors.length - 1; f++) {
      const row = floors[f];
      for (let i = 0; i + 1 < row.length;) {
        const a = row[i], b = row[i + 1];
        if (a.kind === b.kind && TOWN.merge.includes(a.kind) && b.c === spanOf(a)[1] + 1) mergeInto(floors, a, b);
        else i++;
      }
    }
  }
  function mapNode(L, id) {
    if (id === 'boss') return { id: 'boss', f: mapFloors(L), c: (MAPSHAPE.cols - 1) / 2, kind: 'boss', next: [] };
    for (const row of L.map.floors) for (const n of row) if (n.id === id) return n;
    return null;
  }
  function reachable(L) {
    if (L.phase !== 'map' || !L.map) return [];
    if (!L.pos) return L.map.floors[0].map(n => n.id);
    const n = mapNode(L, L.pos);
    return n ? n.next.slice() : [];
  }
  const floorOf = L => !L.pos ? -1 : mapNode(L, L.pos).f;
  /* A wanted gang's health when you sit down with it (Signed Warrant takes a tenth off), and its bounty: an
     ability beyond what its kind always has adds BOUNTY.ability to what the stars pay. */
  const BOUNTY = { ability: 0.5 };
  /* The Hot Hand (2026-11-03, the user's: "a streak of contracts made, with a flame on the nameplate and a growing
     multiplier"; brainstormed, then built behind a switch to A/B test). It runs the whole story. Your team's made
     contract stokes it by the contract's value (a bold bid more: HOT.unit by act, at least 1); your own failed
     contract puts it out; their made contract cools it a point (HOT.cool); setting theirs keeps it. Its stage multiplies
     a Card table's or a Duel's bounty. Only in a fight (a Card table, a Duel, a Showdown, the bank), only when the
     page turns it on (L.hotOn), never in Standard 500. Tuned with tests/fights.js {"hot":1} (300-400 stand-in runs):
     the first cut (units 30/60/100, a whole stage lost to their contract) reached Flame in 6% of stories and Blaze in
     none; these reach Spark 95%, Flame 59%, Blaze 17%, Wildfire 5%, add about 8% to a run's bounties, and leave the
     win rate where it was. The stand-in bids the same either way: whether players bid bolder is the A/B test's. */
  const HOT = { unit: { 1: 15, 2: 30, 3: 55 }, at: [3, 7, 12, 18], cool: 1, mult: [1, 1.1, 1.2, 1.35, 1.5], names: ['', 'Spark', 'Flame', 'Blaze', 'Wildfire'],
                kinds: ['dance', 'elite', 'boss', 'bank'] };
  const hotStage = n => HOT.at.filter(x => (n | 0) >= x).length;
  const hotMult = L => L && L.hotOn ? HOT.mult[hotStage(L.hot)] : 1;
  function stoke(L, r) {
    if (!L.hotOn || L.mode === 'standard' || !L.h || !L.h.contract || !HOT.kinds.includes(L.kind)) return;
    const ours = E.team(r.contractor) === 0, was = L.hot | 0;
    if (ours && r.made) L.hot = was + Math.max(1, Math.round(L.h.contract.v / (HOT.unit[E.actOf(L)] || 60)));
    else if (ours) L.hot = 0;
    else if (r.made) { const s = hotStage(was); L.hot = typeof HOT.cool === 'number' ? Math.max(0, was - HOT.cool) : s > 1 ? HOT.at[s - 2] : 0; }
    L.hotBest = Math.max(L.hotBest | 0, L.hot | 0);
    L.hotLast = { from: was, to: L.hot | 0, at: L.level + ':' + L.handNo };
    if (hotStage(L.hot) !== hotStage(was)) E.say(L, L.hot > was ? 'Hot Hand: ' + HOT.names[hotStage(L.hot)] + '! Bounties pay \u00d7' + HOT.mult[hotStage(L.hot)] + '.' : L.hot ? 'Hot Hand cools to ' + (HOT.names[hotStage(L.hot)] || 'embers') + '.' : 'Hot Hand: doused.', 'gold');
  }
  /* Beginner's luck (2026-11-03, the user's: "I want the first couple of rounds to be quite easy and quick, i.e. the
     chances of getting a joker are quite high for the player and their chances decrease as the game progresses").
     A story's first fights: the Joker comes to you more often (joker: your chance of holding it, by fights done; it
     is about 1 in 5 dealt fair), and the first two gangs are smaller (hp). A player's first stories (rookieRuns) get
     a little more. Never on the Daily or in Standard 500 (the same deal for everyone is the point there), from
     Wanted level 2, or in a Showdown, a contest or the Getaway. Measured with tests/fights.js {"early":1}. */
  const LUCK = { joker: [0.5, 0.4, 0.3], rookie: [0.6, 0.5, 0.4, 0.3], rookieRuns: 3, hp: [0.6, 0.8], kinds: ['dance', 'elite', 'bank'] };
  const lucky = L => L.mode !== 'standard' && !L.daily && (L.wantedLevel || 0) < 2;
  const jokerOdds = L => lucky(L) && LUCK.kinds.includes(L.kind) ? (L.rookie ? LUCK.rookie : LUCK.joker)[L.levelsDone] || 0 : 0;
  const foeHp = (L, F) => Math.round(F.hp * (has(L, 'warrant') ? 0.9 : 1) * (lucky(L) && !F.boss ? LUCK.hp[L.levelsDone] || 1 : 1) / 10) * 10;
  // the Joker into your hand, from wherever it was dealt, for your plainest card (never a seeded one)
  function luckyJoker(L) {
    const h = L.h, mine = h.hands[0];
    if (mine.includes('JK') || !h.deck.includes('JK')) return false;
    const base = mine.length / h.deck.length, p = jokerOdds(L);
    if (!(p > base) || E.rnd(L) >= (p - base) / (1 - base)) return false;
    const give = mine.filter(c => c !== h.locked && !(h.seeded || []).includes(c)).sort((a, b) => E.RANKV[E.rankOf(a)] - E.RANKV[E.rankOf(b)])[0];
    if (!give) return false;
    const where = h.kitty.includes('JK') ? h.kitty : h.hands.find(x => x.includes('JK'));
    where[where.indexOf('JK')] = give;
    mine[mine.indexOf(give)] = 'JK';
    E.sort(L, 0);
    h.lucky = true;
    return true;
  }
  const bountyOf = (kind, F, stars) => Math.round((PAY[kind] || [0, 0, 0, 0])[stars] * ((F && F.bounty) || 1) / 5) * 5;
  const REST = { 1: 150, 2: 150, 3: 250 }, CASH = { health: 200, gold: 100 };
  const restOf = L => Math.round(REST[L.act] * (wants(L, 'thin') ? 0.75 : 1) / 5) * 5 + (has(L, 'pillow') ? 100 : 0);
  /* Act II's targets, tuned on accident rates: see the header of OBJECTIVES. */
  const ACT2 = { blacks: 21, showoff: 4 };
  OBJECTIVES.blacks.of = ACT2.blacks; OBJECTIVES.blacks.text = OBJECTIVES.blacks.text.replace('BLACKS', ACT2.blacks);
  OBJECTIVES.showoff.of = ACT2.showoff; OBJECTIVES.showoff.text = OBJECTIVES.showoff.text.replace('SHOWOFF', ACT2.showoff);
  /* Act III's targets (tests/measure.js): see the header of OBJECTIVES. */
  const ACT3 = { big: 7 };
  OBJECTIVES.setbig.text = OBJECTIVES.setbig.text.replace('BIG', ACT3.big);
  const cardPrice = c => c === 'JK' ? 150 : E.rankOf(c) === 'A' ? 90 : ['J', 'Q', 'K'].includes(E.rankOf(c)) ? 70 : 50;
  const ENH_PRICE = 70, REROLL = 15, TONIC = { price: 40, health: 50 };

  const has = (L, b) => (L.buffs || []).includes(b);
  function note(L, text) { L.note = text; }
  /* Health goes up to HEALTH.max and no further; heal returns what it actually added. */
  const maxHealth = L => HEALTH.max + (has(L, 'iron') ? 100 : 0);
  function heal(L, n) { const before = L.health; L.health = Math.min(maxHealth(L), L.health + n); return L.health - before; }
  // the General Store's prices, less a fifth with Store Credit (to the nearest 5)
  const priced = (L, n) => Math.round(n * (has(L, 'credit') ? 0.8 : 1) * (wants(L, 'dear') ? 1.2 : 1) / 5) * 5;
  // one more option in every pick of enhancements or buffs, with the Treasure Map
  const picks = (L, n) => n + (has(L, 'map') ? 1 : 0);
  /* Cash in health for gold (the Hotel and the bank's teller), once a visit, never down to nothing. */
  const canCash = L => !L.cashed && L.health > CASH.health;
  function cashIn(L) {
    if (L.cashed) return no('you have cashed in here already');
    if (!canCash(L)) return no('you need more than ' + CASH.health + ' health to cash in');
    L.health -= CASH.health; L.gold += CASH.gold; L.cashed = true;
    note(L, 'Cashed in ' + CASH.health + ' health for ' + CASH.gold + ' gold.');
    return yes();
  }

  function newRun(o) {
    o = o || {};
    const P = PARTNERS[o.partner] || PARTNERS.horse;
    const L = { v: 3, rs: (o.seed >>> 0) || 1, act: o.act || 1, health: HEALTH.start, gold: 0, partner: P.id,
                owned: [P.start], mods: JSON.parse(JSON.stringify(P.mods || {})), hexes: {}, buffs: [P.ability], releases: 0,
                unlocked: (o.unlocked || []).slice(),
                pos: null, path: [], route: [], pastPaths: [], actLevels: 0, levelsDone: 0, level: 0, log: [], history: [], dealer: 3,
                tips: o.tips !== false, seen: {}, firstObjective: o.objective || null, note: '' };
    if (o.daily) { L.daily = { date: o.daily, twist: dailyTwist(o.daily).id }; L.rs = dailySeed(o.daily); }
    // what the page remembers between stories (never on the Daily: one ride, the same for everyone)
    if (!o.daily) {
      if (o.ghost && Array.isArray(o.ghost.owned) && o.ghost.owned.length) L.ghost = { owned: o.ghost.owned.slice(), mods: JSON.parse(JSON.stringify(o.ghost.mods || {})), partner: o.ghost.partner, act: o.ghost.act | 0 || 1, lostTo: o.ghost.lostTo || null, met: false };
      if (o.memory && o.memory.runs) L.memory = Object.assign({}, o.memory);
      if (o.stranger) L.strangerDue = true;
      if (o.bonds && typeof o.bonds === 'object') L.bonds = Object.assign({}, o.bonds);
      // a player's first few stories (the page passes memory, with runs 0 on the very first)
      if (o.memory && (o.memory.runs | 0) < LUCK.rookieRuns) L.rookie = true;
    }
    if (o.hot) { L.hotOn = true; L.hot = 0; }        // the Hot Hand, when the page turns it on (an A/B test, 2026-11-03)
    L.maxWanted = Math.max(0, Math.min(WANTED.length, o.maxWanted | 0));
    L.wantedLevel = L.daily ? 0 : Math.min(L.maxWanted, o.wanted | 0);
    applyWanted(L, L.daily ? [L.daily.twist] : wantedFor(L.wantedLevel));
    E.rnd(L);
    actStart(L);
    // a New Story from the title chooses a partner before Act I's card pick (the user's, 2026-10-30)
    if (o.pickPartner) L.phase = 'partner';
    return L;
  }
  /* Who can ride with you. Your horse always; Nan once the Twins are beaten in any story (`unlock`: the page passes
     the profile's beaten Showdowns in as L.unlocked); the rest are the design doc's, shown locked on the pick. */
  const ROSTER = [
    { id: 'horse', name: E.PARTNER_NAME.horse, title: 'your Horse', text: 'Steady bidder. Fast Horse: par is one hand longer in every fight. Brings the K♥, shod with a Lucky Horseshoe.',
      intro: 'Don’t look so surprised, partner. Who else was going to sit across the table from you? Steady bids, no funny business. I’m a fast horse, so every fight gives us a hand’s grace on par, and I’ve brought the K♥ with a Lucky Horseshoe on it.' },
    { id: 'nan', name: E.PARTNER_NAME.nan, title: 'the Steady Hand', unlock: 'twins', unlockText: 'Beat the Twins at the Saloon to meet her.', text: 'Cautious bidder. Shows you her strongest suit while you bid. Brings her A♥.',
      // what she says once you've chosen her (the user's, 2026-10-30: a partner speaks only after being picked)
      intro: 'Steady does it, dear. We take this town one table at a time and walk into that Saloon with health to spare. I\u2019ll nod at my best suit while you bid, and I\u2019ve brought my A\u2665 for the ride.' },
    // the Getaway's (2026-11-02): catch the Caller, the Undertakers, or either without losing a stretch
    { id: 'showboat', name: 'Showboat', title: 'the Big Talker', unlock: 'getaway:caller', unlockText: 'Catch the Caller\u2019s mine cart at the end of the Getaway.',
      text: 'Bids bold. Slips you a card under the table every hand. Brings a Trump-sworn 9♥.',
      intro: 'Ladies and gentlemen, partner: the Showboat rides again! I bid big and I play bigger. Every hand I\u2019ll slip you a card under the table, and I\u2019ve brought a 9\u2665 sworn to the trumps.' },
    { id: 'sharp', name: 'The Sharp', title: 'the Card Counter', unlock: 'getaway:clean', unlockText: 'Catch a Getaway without losing a single stretch.',
      text: 'Bids precise. Keeps count of the trumps still out. Brings a Giant-killer 10♦.',
      intro: 'I watched you catch that cart without dropping a stretch, partner. I count every trump that falls and I\u2019ll tell you how many are still out. I\u2019ve brought a 10\u2666 that kills Aces.' },
    { id: 'quiet', name: 'The Quiet One', title: 'the Silent Partner', unlock: 'getaway:wallflowers', unlockText: 'Catch the Undertakers\u2019 ghost train at the end of the Getaway.',
      text: 'Never bids. Lets you see the kitty before you bid. Brings the K♦.',
      intro: '\u2026 (a nod, and the K\u2666 slid across the table. The Quiet One never bids, but lifts the corner of the kitty for you before you do.)' }
  ];
  // 2026-11-05 (LINES.md): more for every partner to say after a trick or a hand
  const MORE_LINES = {
    horse: { won: ['That\u2019s one for the feed bag.', '(a proud snort)'], lost: ['I\u2019m not mad. My ears are just like this.', 'Nobody saw that. Well, I did. I\u2019ve got eyes on the sides.', 'Horse feathers.'],
             made: ['Stable genius, partner.', 'Told you I could count. One stamp per trick.'], set: ['They bit off more than they could chew. Trust me, I know chewing.'],
             failed: ['I\u2019d blame the jockey, but you\u2019re the jockey.'] },
    nan: { won: ['Just like knitting. Over, under, take it.', 'Lovely. Now don\u2019t get cocky.'], lost: ['I\u2019ll remember that one, dear. I remember everything.', 'Pish. Didn\u2019t want it anyway.'],
           made: ['Bid what you can, make what you bid. Your mother would be proud.'], set: ['Serves them right for cheating, dear. They were, weren\u2019t they?'],
           failed: ['We\u2019ll say no more about it. I\u2019ll say a bit more about it later.'], theirs: ['Hmph. Beginner\u2019s luck, and they\u2019re not even beginners.'] },
    showboat: { won: ['That trick\u2019s going in my memoirs. Chapter nine.', 'And the crowd goes\u2014 well, I go wild.'],
                lost: ['Deliberate. Builds tension.', 'An artistic choice, partner.', 'The hero always drops a round first. It\u2019s in all the dime novels.'],
                made: ['Encore! Encore! Somebody say encore.'], set: ['Exit, pursued by us.'], failed: ['The reviews are in. Let\u2019s not read them.'] },
    sharp: { lost: ['I had that at forty percent. Annoying, but forty percent.', 'Recalculating.'], made: ['Q.E.D., partner.', 'The arithmetic thanks you.'],
             set: ['They bid on hope. Hope has terrible odds.'], failed: ['I\u2019ll be in my notebook.'], theirs: ['They got the one-in-five. It happens one time in five.'] },
    quiet: { won: ['(tips their hat a quarter of an inch)'], lost: ['(stares at the trick until it apologises)'], made: ['(almost smiles. Almost.)'],
             set: ['(blows on the end of a finger, like a gun barrel)'], failed: ['(pulls their hat down over their eyes)'], theirs: ['(writes something in a little book)'] }
  };
  Object.keys(MORE_LINES).forEach(id => Object.keys(MORE_LINES[id]).forEach(k => { PARTNERS[id].lines[k] = (PARTNERS[id].lines[k] || []).concat(MORE_LINES[id][k]); }));
  const partnerStyle = L => (PARTNERS[L.partner] || {}).style || null;
  /* Partner bond (2026-11-03, the user's list: "the reasons to come back"): the stories you've finished with a
     partner. At each step (BOND.at, rides) something new: their own greeting (2), a sheriff's star on their portrait
     (3), another greeting (4), and at 5 their second trick, a purse to start the story with (BOND.gold). The page
     keeps the count (profile.bond) and passes it in as o.bonds; never on the Daily. */
  const BOND = { at: [1, 3, 6, 10, 15], gold: 40,
    lines: {
      horse: ['Three rides, partner. You still hold your cards like they owe you money. I\u2019m fond of it.', 'Ten rides. I\u2019ve stopped counting the times a horse at a card table got funny looks. Mostly.'],
      nan: ['There you are, dear. I\u2019ve knitted you a scarf for luck. It\u2019s mostly holes, like your bidding, but it\u2019s warm.', 'Ten rides together. My late husband never sat across from me this often, and he lived in the house.'],
      showboat: ['The partnership the papers are calling \u201cthe greatest in the territory\u201d. The papers being me, mostly.', 'Ten rides, partner! I\u2019ve had a poster made of us. You\u2019re in the background. Small. But present.'],
      sharp: ['Three rides. I\u2019ve counted your tells: four. I\u2019ll keep them between us. And the gang.', 'Ten rides. By my count we\u2019ve won more than we\u2019ve lost, and I\u2019m never wrong about counting.'],
      quiet: ['(The Quiet One nods at you. Twice. That\u2019s practically a speech.)', '(The Quiet One hands you a bandana of your own. Then looks away, embarrassed.)']
    } };
  const bondOf = n => BOND.at.filter(x => (n | 0) >= x).length;
  const partnerOpen = (L, p) => !!p && !p.locked && !!PARTNERS[p.id] && (!p.unlock || (L.unlocked || []).includes(p.unlock));
  function choosePartner(L, id) {
    if (L.phase !== 'partner') return no('not choosing a partner');
    const p = ROSTER.find(x => x.id === id);
    if (!partnerOpen(L, p)) return no('that partner isn’t riding yet');
    const P = PARTNERS[id];
    L.partner = id;
    L.owned = [P.start];
    L.mods = JSON.parse(JSON.stringify(P.mods || {}));
    L.buffs = [P.ability];
    L.partnerStyle = P.style || null;
    // their second trick, at the fifth step of your bond: a purse to start with
    if (L.bonds && bondOf(L.bonds[id]) >= BOND.at.length && !L.bondGold) { L.bondGold = BOND.gold; L.gold += BOND.gold; }
    // the card pick was dealt for the first partner: never offer the card the chosen one brings
    if (L.offer && L.offer.includes(P.start)) {
      const spare = E.deckOf(L).filter(c => c !== P.start && !L.offer.includes(c));
      L.offer[L.offer.indexOf(P.start)] = spare[0];
    }
    L.phase = 'actstart';
    return yes();
  }
  /* A partner other than Nan says "partner" where she says "dear" (her tips and lines are written in her voice). */
  const voice = (L, text) => !L || L.partner === 'nan' || !L.partner ? text : text.replace(/\bdear\b/g, 'partner');

  /* ---------------- Standard 500 (the user's, 2026-10-30) ---------------- */
  /* A plain game of 500 from the title: the whole 43-card pack (Act III's deck, bids and open misère), you and Nan
     against a pair you have beaten in a story (each keeps its Showdown rule) or the Dustwater Regulars, who play it
     straight. No health, gold, owned cards or buffs; first to 500. Defending tricks score 10 each but can't take a
     side past 490, so 500 is won by making a bid (the common rule); a side that falls to -500 loses. */
  const STANDARD = { win: 500, lose: -500, cap: 490 };
  const REGULARS = { name: 'The Euchre-ka! Regulars', look: GANGS[1][0].slice(1, 3) };
  // a Showdown rule as it reads without owned cards (nothing is seeded in a plain game)
  const STD_RULE = { sharps: 'Card sharps: with nothing of yours to spot, they play it straight.', caller: 'Before each hand he calls a figure that changes the rules.' };
  const standardFoe = id => BOSS[id] ? { name: BOSS[id].name, look: BOSS[id].look, rule: STD_RULE[id] || BOSS[id].rule } : Object.assign({ rule: 'They play it straight.' }, REGULARS);
  function newStandard(o) {
    o = o || {};
    const boss = BOSS[o.boss] ? o.boss : null;
    const L = { v: 3, mode: 'standard', rs: (o.seed >>> 0) || 1, act: 3, health: HEALTH.start, gold: 0, partner: PARTNERS[o.partner] ? o.partner : 'horse',
                owned: [], mods: {}, hexes: {}, buffs: [], releases: 0, log: [], history: [], record: [], dealer: 3,
                tips: false, seen: {}, note: '', level: 1, levelsDone: 0, kind: 'standard', boss, curse: null,
                dealRule: boss === 'twins' ? 'twins' : null, call: null, calls: [], callWhy: null, obj: null, foe: null,
                std: Object.assign(standardFoe(boss), { id: boss || 'regulars', winner: null }),
                you: 0, opp: 0, handNo: 1, hands: null, captured: [], phase: 'hand', reaction: null, result: null };
    E.rnd(L);
    E.say(L, 'Standard 500 against ' + L.std.name.replace(/^The /, 'the ') + ': first to ' + STANDARD.win + ' wins. ' + L.std.rule, 'level');
    dealHand(L);
    return L;
  }
  function endStandardHand(L) {
    const r = L.h.result, ct = E.team(r.contractor), got = [r.pts[0], r.pts[1]];
    for (const t of [0, 1]) {
      const was = t ? L.opp : L.you;
      let now = was + got[t];
      // defending tricks stop at 490: a game of 500 is won with a bid
      if (t !== ct && got[t] > 0 && now >= STANDARD.win) now = Math.max(was, STANDARD.cap);
      if (t) L.opp = now; else L.you = now;
    }
    react(L, ct === 0 ? (r.made || r.near ? 'made' : 'failed') : (r.made ? 'theirs' : 'set'));
    L.history.push({ mode: 'standard', hand: L.handNo, contract: L.h.contract, contractor: r.contractor, made: r.made, delta: got[0] - got[1], you: L.you, opp: L.opp });
    E.say(L, 'Score: you and ' + E.pname(L) + ' ' + L.you + ', ' + L.std.name.replace(/^The /, 'the ') + ' ' + L.opp + '.', 'score');
    const winner = (ct === 0 && r.made && L.you >= STANDARD.win) || L.opp <= STANDARD.lose ? 0
      : (ct === 1 && r.made && L.opp >= STANDARD.win) || L.you <= STANDARD.lose ? 1 : null;
    if (winner !== null) {
      L.std.winner = winner;
      L.result = { kind: 'standard', won: winner === 0, you: L.you, opp: L.opp, hands: L.handNo };
      E.say(L, winner === 0 ? 'You and ' + E.pname(L) + ' win the game!' : L.std.name + ' win the game.', 'end');
    }
    L.phase = 'summary';
  }
  /* The act-start pick: 1 of 3 cards to own. A new act offers the cards it adds
     (Act II: the black suits). */
  function actStart(L) {
    const deck = E.deckOf(L), before = L.act > 1 ? E.deckFor(L.act - 1) : [];
    let pool = deck.filter(c => !L.owned.includes(c) && !before.includes(c));
    if (pool.length < 3) pool = deck.filter(c => !L.owned.includes(c));
    L.offer = E.shuffle(L, pool).slice(0, 3);
    genMap(L);
    L.phase = 'actstart';
  }
  /* After an act's Showdown (always won: losing one means your health ran out): on to the next act, or the
     run is won. */
  function nextAct(L) {
    if (L.act >= LAST_ACT) { if (!L.chase && L.map && BOSS_POOL[3].includes(L.map.boss)) startChase(L); else L.phase = 'victory'; return; }
    L.pastPaths = (L.pastPaths || []).concat([L.path]);
    L.buffs = L.buffs.filter(b => !BUFFS[b].secret);       // a boss's secret is no use past its act
    L.act++;
    L.actLevels = 0;
    note(L, 'Act ' + ROMAN[L.act - 1] + ' is done. On to ' + E.ACTS[E.actOf(L)].name + '!');
    if (L.act === 3) note(L, 'Act II is done. On to the County Fair: the 4s to 8s join the deck, hands are 10 cards, and three of your cards are dealt to you.');
    actStart(L);
  }

  /* The run's ending: what the record and the hand history add up to. */
  function runSummary(L) {
    const rec = L.record || [], hist = L.history || [];
    const ours = hist.filter(x => x.contractor % 2 === 0), theirs = hist.filter(x => x.contractor % 2 === 1);
    const best = hist.reduce((b, x) => !b || x.delta > b.delta ? x : b, null);
    // the fight that ended a lost run is on the record (its Showdown shows as lost) but not among the fights finished
    const done = rec.filter(r => !r.lost && r.kind !== 'getaway' && r.kind !== 'chase'), dances = done.filter(r => !['boss', 'contest'].includes(r.kind));   // a Getaway's stretches are no fights
    return { levels: done.length, stars: done.reduce((n, r) => n + r.stars, 0), maxStars: 3 * done.length,
             objectives: dances.filter(r => r.won).length, objectiveLevels: dances.length,
             hoedowns: rec.filter(r => r.kind === 'boss').map(r => ({ act: r.act, boss: r.id, won: r.won })),
             hands: hist.length, ours: ours.length, made: ours.filter(x => x.made).length, theirs: theirs.length, set: theirs.filter(x => !x.made).length,
             best: best && best.delta > 0 ? best : null };
  }

  /* ---------------- map ---------------- */
  /* Walk to a node: its id, or a kind (the first reachable node of it). */
  function goTo(L, target) {
    if (L.phase !== 'map') return no('not on the map');
    const can = reachable(L);
    const id = can.includes(target) ? target : can.find(x => mapNode(L, x).kind === target);
    if (!id) return no('not a choice here');
    const nd = mapNode(L, id);
    if (nd.kind === 'mystery') { nd.kind = nd.hid; delete nd.hid; nd.revealed = true; L.revealed = id; }
    const kind = nd.kind;
    L.pos = id; L.route.push(id); L.path.push(kind);
    L.note = '';
    L.stopQuip = stopQuip(L, kind, id);
    if (kind === 'event') {
      const fit = Object.keys(EVENTS).filter(id => EVENTS[id].acts.includes(L.act));
      const ids = fit.filter(id => !(L.eventsSeen || []).includes(id));
      L.event = nd.event || E.pick(L, ids.length ? ids : fit);
      if (L.event === 'stranger') L.metStranger = true;
      L.eventsSeen = (L.eventsSeen || []).concat(L.event);
      L.phase = 'event';
    } else if (kind === 'camp') {
      L.phase = 'camp'; L.cashed = false;
    } else if (kind === 'store') {
      L.restocks = 0; stock(L); L.phase = 'shop';
    } else if (kind === 'raffle') {
      raffle(L);
    } else if (kind === 'bank') {
      L.phase = 'bank'; L.bank = { stage: 'door', take: bankTake(L) }; L.cashed = false;
    } else if (kind === 'water') {
      L.phase = 'water';
    } else if (kind === 'contest') {
      L.phase = 'contest'; L.contest = { id: mapNode(L, id).contest, stage: 'door' };
    } else startLevel(L, kind);
    return yes();
  }
  /* The Bank: at the door, stop the robbery or walk on by; after it, cash in or leave. */
  function bank(L, what) {
    if (L.phase !== 'bank') return no('not at the bank');
    const door = L.bank.stage === 'door';
    if (what === 'fight' && door) { startLevel(L, 'bank'); return yes(); }
    if (what === 'cashin' && !door) return cashIn(L);
    if (what === 'leave') {
      if (door) note(L, 'You tip your hat and walk on by. The gang rides off with ' + holdup(L).gone + '.');
      L.bank = null; nextStop(L); return yes();
    }
    return no(door ? 'the gang is still inside' : 'the robbery is over');
  }
  /* The water stop: one thing, then back aboard. */
  function water(L, what) {
    if (L.phase !== 'water') return no('not at the water stop');
    if (what === 'drink') { const got = heal(L, WATER.health); note(L, 'You fill your canteen at the water tower: +' + got + ' health.'); nextStop(L); return yes(); }
    if (what === 'wood') { L.gold += WATER.gold; note(L, 'You help the fireman load the tender: he slips you ' + WATER.gold + ' gold.'); nextStop(L); return yes(); }
    if (what === 'cleanse') { if (!hexed(L).length) return no('no hexes to scrub'); L.cleanseBack = 'map-next'; L.phase = 'cleanse'; return yes(); }
    return no('unknown action');
  }
  /* The Switchman's shunt: pick a carriage on a stretch of line ahead (a floor above the one you stand on, with two
     or more stops), then another on the same stretch; they swap tracks. What happens there moves with the
     carriage (its kind and its gang), the rails stay, so the ways to it change. `null` leaves it. */
  function shuntable(L) {
    if (!L.map) return [];
    const here = floorOf(L), pick = L.shunt && L.shunt.pick ? mapNode(L, L.shunt.pick) : null;
    if (pick) return L.map.floors[pick.f].filter(n => n.id !== pick.id).map(n => n.id);
    return L.map.floors.filter((row, f) => f > here && row.length >= 2).flat().map(n => n.id);
  }
  function shunt(L, id) {
    if (L.phase !== 'shunt') return no('no switch to throw');
    if (id === null) { L.shunt = null; note(L, 'You leave the lever alone.'); nextStop(L); return yes(); }
    if (L.shunt.pick === id) { L.shunt.pick = null; return yes(); }
    if (!shuntable(L).includes(id)) return no(L.shunt.pick ? 'pick a carriage on the same stretch of line' : 'pick a carriage on a stretch ahead with two or more');
    if (!L.shunt.pick) { L.shunt.pick = id; return yes(); }
    const a = mapNode(L, L.shunt.pick), b = mapNode(L, id);
    // what a carriage holds, mid-sentence: the gang's name for a fight, else the place ("the sleeper car")
    const low = t => t.charAt(0).toLowerCase() + t.slice(1);
    const kindOf = n => n.kind === 'mystery' ? 'a stop nobody can read' : n.foe ? (n.kind === 'elite' ? 'the duel with ' : 'the table with ') + low(n.foe.name) : low((PLACE[L.act] || {})[n.kind] || KIND_NAME[n.kind]);
    for (const k of ['kind', 'foe', 'contest', 'hid', 'event']) { const t = a[k]; if (b[k] === undefined) delete a[k]; else a[k] = b[k]; if (t === undefined) delete b[k]; else b[k] = t; }
    L.shunted = (L.shunted || []).concat([[a.id, b.id]]);
    note(L, 'The switchman throws the lever: ' + kindOf(b) + ' and ' + kindOf(a) + ' swap tracks.');
    L.shunt = null;
    nextStop(L);
    return yes();
  }
  /* The Raffle (floor 4): a little gold, and the ticket wins a buff (pick 1 of 2). */
  function raffle(L) {
    const fb = freeBuffs(L);
    if (!fb.length || !RAFFLE.buff) { L.gold += RAFFLE.noBuff; note(L, 'Gold strike: you hold every buff already, so the claim pays ' + RAFFLE.noBuff + ' gold.'); nextStop(L); return; }
    L.gold += RAFFLE.gold;
    note(L, 'Gold strike: +' + RAFFLE.gold + ' gold, and a buff.');
    if (!RAFFLE.pick) { const b = E.pick(L, fb); grantBuff(L, b); note(L, 'Gold strike: +' + RAFFLE.gold + ' gold, and ' + BUFFS[b].name + '.'); nextStop(L); return; }
    L.reward = { steps: [{ type: 'buff', options: draw(L, fb, picks(L, RAFFLE.pick)) }], raffle: true };
    advanceReward(L);
  }
  function nextStop(L) {
    if (L.pos === 'boss') { nextAct(L); return; }
    L.phase = 'map';
  }

  /* ---------------- a level ---------------- */
  function startLevel(L, kind, objective) {
    kind = kind || 'dance';
    const ids = Object.keys(OBJECTIVES).filter(k => OBJECTIVES[k].acts.includes(L.act) && !OBJECTIVES[k].bank);
    L.level++;
    L.kind = kind;
    L.curse = null; L.dealRule = null; L.boss = null; L.call = null; L.calls = []; L.callWhy = null; L.obj = null; L.foe = null;
    L.stand = null; L.borrow = null; L.dare = null; L.ghostFight = null;
    if (kind === 'boss') {
      L.boss = L.map && L.map.boss && (BOSS_POOL[L.act].includes(L.map.boss) || (L.map.boss === 'stranger' && L.act === LAST_ACT)) ? L.map.boss : E.pick(L, BOSS_POOL[L.act]);
      if (L.boss === 'twins') L.dealRule = 'twins';
    } else if (kind === 'contest' || kind === 'chase') {
      L.obj = null;
    } else {
      const first = (L.actLevels || 0) === 0;
      const fit = ids.filter(k => kind === 'elite' || !OBJECTIVES[k].elite);
      const pool = first ? fit.filter(k => OBJECTIVES[k].easy) : fit;
      const want = objective || (L.levelsDone === 0 ? L.firstObjective : null);
      const id = kind === 'bank' ? 'robbery' : OBJECTIVES[want] && OBJECTIVES[want].acts.includes(L.act) ? want : E.pick(L, pool.length ? pool : fit);
      L.obj = { id, n: 0, of: OBJECTIVES[id].of, fail: false, done: false };
      if (kind === 'bank') L.bank = Object.assign({ take: bankTake(L) }, L.bank, { stage: 'fight' });
    }
    L.rules = kind === 'chase' ? CHASE.rules : kind === 'contest' && CONTEST.quick ? 1 : null;     // quick hands: Act I's rules (E.actOf)
    if (kind !== 'bank' && kind !== 'contest' && kind !== 'chase') {
      const n = kind !== 'boss' && L.pos && L.map ? mapNode(L, L.pos) : null;
      const F = n && n.kind === kind && n.foe ? n.foe : makeFoe(L, kind);
      L.foe = Object.assign({}, F, { traits: F.traits.slice(), hp: kind === 'boss' ? F.hp : foeHp(L, F) });
      // a Duel's ability that is one of the old curses also sets L.curse, which the engine reads
      for (const t of L.foe.traits) if (CURSES[t]) L.curse = t;
      if (L.foe.ghost && L.ghost) L.ghostFight = { owned: L.ghost.owned, mods: L.ghost.mods };
    }
    L.fight = null;
    // (a Card table's or a Duel's: a Showdown is no "next gang", so what was bought waits for the next one)
    if ((kind === 'dance' || kind === 'elite') && L.nextFight) {
      L.fight = L.nextFight; L.nextFight = null;
      if (L.fight.tough && L.foe) L.foe.hp = Math.round(L.foe.hp * 1.25 / 10) * 10;
    }
    L.freshUsed = false;
    L.you = 0; L.opp = 0; L.startHealth = L.health; L.startGold = L.gold;
    L.handNo = 1; L.hands = kind === 'bank' ? BANK.hands : kind === 'contest' ? (CONTEST.quick ? CONTEST.quickHands : CONTEST.hands) : kind === 'chase' ? 1 : null;
    L.captured = [];
    L.phase = 'hand';
    L.reaction = null;
    const q = L.mode === 'standard' ? null : quipFor(L);
    if (q) L.reaction = { kind: 'quip', text: q };
    L.log = [];
    L.result = null;
    const F = L.foe, ab = F ? F.traits.map(t => abilityOf(t).name + ' (' + abilityOf(t).text + ')') : [];
    if (kind === 'chase') { const c = L.chase; E.say(L, 'Stretch ' + (c.n + 1) + ' of ' + CHASE.stretches + ', ' + CHASE.forks[c.fork].name.toLowerCase() + ': ' + c.gap + ' length' + (c.gap > 1 ? 's' : '') + ' behind ' + chaseRide(c).cart + '. Outscore them on this hand to gain.', 'level'); }
    else if (kind === 'contest') { const C = CONTEST.list[L.contest.id]; E.say(L, 'Game ' + L.level + ' \u00b7 ' + C.name + ': ' + C.what + ' Ribbons at ' + C.tiers.join(', ') + ' ' + C.unit[1] + '.', 'level'); }
    else if (kind === 'boss') E.say(L, 'Game ' + L.level + ' \u00b7 the Showdown: ' + BOSS[L.boss].name + ', ' + F.hp + ' health. ' + BOSS[L.boss].rule, 'level');
    else if (kind === 'bank') E.say(L, 'Game ' + L.level + ' \u00b7 ' + holdup(L).place + ': ' + holdup(L).what + '. Outscore them this hand for ' + bankBounty(L) + ' gold and an enhancement; lose and they take ' + L.bank.take + ' gold.', 'level');
    else E.say(L, 'Game ' + L.level + ' \u00b7 ' + KIND_NAME[kind] + ', wanted: ' + F.name + ', ' + F.hp + ' health' + (ab.length ? ', ' + ab.join(', ') : '') + '. Bonus: ' + OBJECTIVES[L.obj.id].text + '.', 'level');
    dealHand(L);
    return L;
  }
  /* The gang across the table: its name, figures, health, abilities and bounty. Drawn with the map (genMap, for
     the wanted posters) at its floor `f`; `seen` keeps one map's gangs apart. A Showdown's comes at the fight,
     with Signed Warrant in its health. */
  const abilityOf = id => TRAITS[id] || CURSES[id] || DEBUFFS[id];
  function makeFoe(L, kind, f, seen) {
    const a = L.act;
    if (f == null) f = eqFloor(Math.max(0, Math.min(mapFloors(L) - 1, floorOf(L))), mapFloors(L));
    if (kind === 'boss') return { name: BOSS[L.boss].name, look: BOSS[L.boss].look, hp: Math.round((BOSS[L.boss].hp || FOE.boss[a]) * (wants(L, 'dead') ? 1.15 : 1) * (a === 3 && L.gunhand ? 0.75 : 1) * (has(L, 'warrant') ? 0.9 : 1) * (has(L, COUNTER[L.boss]) ? 1 - EXPRESS.cut : 1) / 10) * 10, traits: [], hitMul: BOSS[L.boss].hit || FOE.bossHit, boss: L.boss };
    const traits = [], debuffs = Object.keys(DEBUFFS);
    if (kind === 'elite') {
      const ab = E.pick(L, DUEL_ABILITIES.concat(debuffs));
      traits.push(ab);
      if (a >= TRAIT.duel2) traits.push(E.pick(L, TRAIT.pool.concat(debuffs).filter(x => x !== ab)));
    } else if ((f >= TRAIT.floor && E.rnd(L) < TRAIT.p[a]) || wants(L, 'hard')) traits.push(E.pick(L, TRAIT.pool.concat(debuffs)));
    const rule = kind === 'dance' ? E.pick(L, RULE_POOL[a] || RULE_POOL[2]) : null;
    let hp = (FOE.base[a] + FOE.step[a] * f) * (kind === 'elite' ? FOE.elite : 1) * (traits.includes('tough') ? 1.25 : 1) * (wants(L, 'tough') ? 1.1 : 1);
    hp = Math.round(hp / 10) * 10;
    const all = (kind === 'elite' ? DUELISTS : GANGS)[a], fresh = seen ? all.filter(g => !seen.includes(g[0])) : all;
    const g = E.pick(L, fresh.length ? fresh : all);
    if (seen) seen.push(g[0]);
    const extra = traits.length - (kind === 'elite' ? 1 : 0);
    return Object.assign({ name: g[0], look: [g[1], g[2]], hp, traits, hitMul: traits.includes('deadeye') ? 1.5 : 1, bounty: 1 + BOUNTY.ability * extra, manner: mannerOf(a, kind, g[0]) }, rule ? { rule } : {});
  }
  /* How good a deal is for West and East (the stacked deck keeps the better of two for them). */
  function gangStrength(h) {
    const v = c => c === 'JK' ? 4 : ({ J: 2, A: 1.5, K: 1, Q: 0.5 })[E.rankOf(c)] || 0;
    return h.hands[1].concat(h.hands[3]).reduce((n, c) => n + v(c), 0);
  }
  const stackChance = L => !L.foe ? 0 : L.foe.traits.includes('lucky') ? 1 :
    STACK.max * (L.kind === 'boss' ? 1 : Math.max(0, floorOf(L)) / (mapFloors(L) - 1));
  function dealHand(L) {
    unbury(L);
    // the Duels: a new rule every deal, never the one before (an event's rule for the fight still holds)
    if (L.kind === 'elite' && L.foe && !(L.fight && L.fight.rule)) L.foe.rule = E.pick(L, (DUEL_RULES[L.act] || DUEL_RULES[2]).filter(r => r !== L.foe.rule));
    // the Stranger: another Showdown's rule every hand
    if (L.boss === 'stranger') {
      L.borrow = E.pick(L, STRANGER.rules.filter(b => b !== L.borrow));
      L.dealRule = L.borrow === 'twins' ? 'twins' : null;
      E.say(L, 'The Stranger plays by ' + poss(BOSS[L.borrow].name.replace(/^The /, 'the ')) + ' rule this hand: ' + BOSS[L.borrow].rule, 'call');
    }
    // a Showdown at half health makes its last stand, from this deal on
    if (L.kind === 'boss' && L.foe && !L.stand && L.handNo > 1 && LAST_STAND[L.boss] && L.you >= L.foe.hp * LAST_STAND.at) {
      L.stand = L.boss;
      E.say(L, BOSS[L.boss].name + (L.boss === 'caller' ? ' makes his' : ' make their') + ' last stand! ' + LAST_STAND[L.boss].name + ': ' + LAST_STAND[L.boss].text, 'stand');
    }
    const rule = ruleOf(L);
    L.call = L.callFor = rule; L.callName = rule ? TABLE_RULES[rule].name : null; L.callBy = rule ? 'the table rule' : null;
    const n = L.log.length;
    E.deal(L);
    const p = stackChance(L);
    if (p && E.rnd(L) < p) {
      const first = L.h, said = L.log.slice(n);
      L.log.length = n;
      E.deal(L);
      if (gangStrength(first) > gangStrength(L.h)) { L.h = first; L.log.length = n; L.log.push(...said); }
      L.h.stacked = true;
      E.say(L, 'A stacked deck: ' + L.foe.name + ' get the better of two deals.', 'rule');
    }
    if (!L.dealRule && !(L.foe && L.foe.ghost)) luckyJoker(L);
    if (E.bossRule(L) === 'caller') {
      if (Object.keys(CALLS).every(id => L.calls.includes(id))) L.calls = [];     // a long Showdown: he starts the round again
      const c = chooseCall(L);
      L.call = c.id; L.calls.push(c.id); L.callWhy = c.why; L.callFor = c.id; L.callName = CALLS[c.id].name; L.callBy = 'calls the Caller';
      L.h.dir = c.id === 'corner' ? -1 : 1;
      E.say(L, 'The Caller calls ' + CALLS[c.id].name + '! ' + CALLS[c.id].text + ' ' + c.why, 'call');
    }
    if (rule && L.kind === 'elite' && !(L.fight && L.fight.rule)) E.say(L, 'This deal\u2019s rule: ' + TABLE_RULES[rule].name + '. ' + TABLE_RULES[rule].text, 'rule');
    else if (rule && L.handNo === 1) E.say(L, 'Table rule: ' + TABLE_RULES[rule].name + '. ' + TABLE_RULES[rule].text, 'rule');
    lastStandDeal(L);
    // the rodeo clown's dare: dealt the Joker in a fight, once a fight
    if (L.foe && !L.dare && L.h.hands[0].includes('JK')) {
      const id = E.pick(L, Object.keys(DARES)), lie = E.rnd(L) < DARE_LIE, pay = DARES[id].pay * (L.jokerOwes ? 2 : 1);
      L.dare = { id, lie, pay, hand: L.handNo, done: false, text: DARES[id].say(pay) };
      E.say(L, 'The Joker: \u201c' + L.dare.text + '\u201d', 'joker');
    }
    // the Spyglass: one card from each opponent's hand, seen while bidding
    if (sees(L, 'spyglass')) L.h.spy = [E.pick(L, L.h.hands[1]), E.pick(L, L.h.hands[3])];
    if (L.curse === 'ticking') {
      L.h.ticking = E.pick(L, L.h.hands[0]);
      E.say(L, 'Lit Fuse: play your ' + E.label(L.h.ticking) + ' by trick 2, or lose 20 health.', 'rule');
    }
  }

  /* What a last stand does to a fresh deal: the Sharps palm your best seeded card, the Undertakers bury one of yours
     (a Misfire hex for the hand, dug up by unbury). The Twins' Joker is the engine's deal; the Hustlers' and the
     Caller's live where their misère and the passing are played. */
  function lastStandDeal(L) {
    const h = L.h;
    if (L.stand === 'sharps' && h.seeded.length) {
      const v = c => c === 'JK' ? 20 : E.rankOf(c) === 'J' ? 15 : E.RANKV[E.rankOf(c)];
      const best = h.seeded.slice().sort((a, b) => v(b) - v(a))[0], s = E.rnd(L) < 0.5 ? 1 : 3, back = E.pick(L, h.hands[s]);
      h.hands[0][h.hands[0].indexOf(best)] = back; h.hands[s][h.hands[s].indexOf(back)] = best;
      h.seeded = h.seeded.filter(c => c !== best); h.palmed = { card: best, seat: s, back };
      E.sort(L, 0); E.sort(L, s);
      E.say(L, 'Sleight of Hand: ' + E.SEATS[s] + ' palms your ' + E.label(best) + ' and slips you the ' + E.label(back) + '.', 'rule');
    }
    if (L.stand === 'wallflowers') {
      const free = h.hands[0].filter(c => c !== 'JK' && E.rankOf(c) !== 'J' && !(L.hexes || {})[c]);
      if (free.length) { const c = E.pick(L, free); placeHex(L, c, 'twoleft'); h.grave = c; E.say(L, 'Dig a Grave: your ' + E.label(c) + ' is buried this hand. It can\u2019t win a trick.', 'rule'); }
    }
  }
  function unbury(L) {
    const h = L.h;
    if (h && h.grave && L.hexes && L.hexes[h.grave] === 'twoleft') delete L.hexes[h.grave];
    if (h) h.grave = null;
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
    if (L.kind === 'contest' && L.contest) trackContest(L, trick, mine);
    if (L.dare && !L.dare.done && L.dare.hand === L.handNo && DARES[L.dare.id].met(L, trick)) settleDare(L);
    const wk = E.K(L, trick.winner, trick.cards[trick.winner]), X = E.FX;
    h.fx = h.fx || { hit: 0, block: 0, burn: 0 };
    const shot = (n, text) => { h.fx.hit += n; E.say(L, text, 'rule'); };
    if (mine && wk.m) {
      const lb = E.label(wk.c);
      if (E.en(wk, 'hollow')) shot(X.hollow, lb + ' is a Hollow Point: +' + X.hollow + ' to the gang.');
      if (E.en(wk, 'keg')) shot(X.keg, lb + ' is a Powder Keg: +' + X.keg + ' to the gang.');
      if (E.en(wk, 'bullseye') && trick.no === E.ACTS[E.actOf(L)].hand) shot(X.bullseye, 'Bullseye! ' + lb + ' took the last trick: +' + X.bullseye + ' to the gang.');
      if (E.en(wk, 'deadman') && trick.cards.some(c => c && c !== 'JK' && ['A', '8'].includes(E.rankOf(c)))) shot(X.deadman, lb + ' holds a Dead Man\u2019s Hand: +' + X.deadman + ' to the gang.');
      if (E.en(wk, 'notched')) { wk.m.notch = (wk.m.notch || 0) + 1; shot(X.notch * wk.m.notch, lb + ' carves notch ' + wk.m.notch + ': +' + X.notch * wk.m.notch + ' to the gang.'); }
      if (E.en(wk, 'ambush') && h.contract && E.team(h.contractor) === 1) shot(X.ambush, lb + ' springs an Ambush on their contract: +' + X.ambush + ' to the gang.');
      if (E.en(wk, 'spoiler') && h.contract && E.team(h.contractor) === 1) h.spoil = (h.spoil || 0) + 1;
      if (E.en(wk, 'plate')) { h.fx.block += X.plate; E.say(L, lb + ' is an Iron Plate: ' + X.plate + ' of this hand\u2019s damage will be blocked.', 'rule'); }
      if (E.en(wk, 'horseshoe')) h.shoe = true;
    }
    if (!mine) {
      // your team's cards in a trick the gang took
      trick.cards.forEach((c, s) => {
        if (!c || E.team(s) !== 0) return;
        const k = E.K(L, s, c);
        if (E.en(k, 'ricochet')) shot(X.ricochet, E.label(c) + ' ricochets: +' + X.ricochet + ' to the gang.');
        if (E.en(k, 'keg')) { h.fx.burn += X.kegBurn; E.say(L, E.label(c) + ' is a Powder Keg, and it went off in your hands: ' + X.kegBurn + ' burn.', 'rule'); }
      });
      if (E.foeHas(L, 'shakedown') && L.gold > 0) { const g = Math.min(5, L.gold); L.gold -= g; E.say(L, 'Shakedown: they take ' + g + ' gold.', 'gold'); }
    }
    if (mine) {
      L.captured.push(...trick.cards.filter(Boolean));
      if (E.en(wk, 'gilded')) { L.gold += 5; E.say(L, E.label(wk.c) + ' is Gilded: +5 gold.', 'gold'); }
      if (E.en(wk, 'glass')) {
        wk.m.wins = (wk.m.wins || 0) + 1;
        if (wk.m.wins >= GLASS_WINS) shatter(L, wk.c);
        else E.say(L, E.label(wk.c) + ' is Glass: ' + (GLASS_WINS - wk.m.wins) + ' more win' + (GLASS_WINS - wk.m.wins > 1 ? 's' : '') + ' before it shatters.', 'rule');
      }
      if (E.en(wk, 'growing') && (wk.m.up || 0) < E.maxUp(wk.c)) {
        wk.m.up = (wk.m.up || 0) + 1;
        E.say(L, E.label(wk.c) + ' grows: it is now ' + E.kLabel(wk).replace(/^.*\(now /, '').replace(')', '') + '.', 'rule');
      }
    }
    if (h.ticking && trick.no === 2) {
      if (h.hands[0].includes(h.ticking)) { L.health = Math.max(0, L.health - 20); L.tickLoss = (L.tickLoss || 0) + 20; E.say(L, 'Lit Fuse: your ' + E.label(h.ticking) + ' was not played by trick 2: −20 health.', 'rule'); }
      h.ticking = null;
    } else if (h.ticking && trick.cards[0] === h.ticking) h.ticking = null;
    if (E.bossRule(L) === 'sharps' && !mine && (h.seeded || []).includes(trick.cards[0])) E.say(L, 'The Card Sharps caught your ' + E.label(trick.cards[0]) + '.', 'rule');
    if (!L.obj) return;
    const o = L.obj, id = o.id;
    if (o.done || o.fail) return;
    const wc = trick.cards[trick.winner], n0 = o.n;
    if (id === 'lowly9' && mine && ['9', '10'].includes(E.rankOf(wc))) o.n++;
    if (id === 'harvest' && mine) trick.cards.forEach((c, s) => { if (c && E.suitOf(c) === 'H') { const k = E.K(L, s, c); o.n += E.en(k, 'magnet') ? 2 : 1; } });
    if (id === 'bagjack' && mine && trick.cards.some(c => c === 'JH' || c === 'JD')) o.n++;
    if (id === 'lastword' && trick.winner === 0 && trick.no === E.ACTS[E.actOf(L)].hand) o.n++;
    if (id === 'blacks' && mine) trick.cards.forEach((c, s) => { if (c && (E.suitOf(c) === 'S' || E.suitOf(c) === 'C')) { const k = E.K(L, s, c); o.n += E.en(k, 'magnet') ? 2 : 1; } });
    if (id === 'showoff' && mine && L.owned.includes(wc)) o.n++;
    if (id === 'acehunter' && mine) o.n += trick.cards.filter((c, s) => c && s % 2 === 1 && E.rankOf(c) === 'A').length;
    if (id === 'ruff' && mine && h.trump && E.kSuit(E.K(L, trick.leader, trick.cards[trick.leader]), h.trump) !== h.trump && E.kIsTrump(wk, h.trump)) o.n++;
    if (id === 'lefthook' && trick.winner === 0 && h.trump && wc !== 'JK' && E.rankOf(wc) === 'J' && E.suitOf(wc) === E.TWIN[h.trump]) o.n++;
    if (id === 'little4' && mine && wc !== 'JK' && ['4', '5'].includes(E.rankOf(wc))) o.n++;
    if (id === 'royal' && mine) { o.got = o.got || []; trick.cards.forEach(c => { if (c && c !== 'JK' && ['K', 'Q'].includes(E.rankOf(c)) && !o.got.includes(E.base(c))) o.got.push(E.base(c)); }); o.n = o.got.length; }
    if (id === 'bowerhunt' && mine && h.trump && trick.cards.some(c => c && c !== 'JK' && E.rankOf(c) === 'J' && (E.suitOf(c) === h.trump || E.suitOf(c) === E.TWIN[h.trump]))) o.n++;
    if (id === 'smoke' && trick.leader % 2 === 0 && trick.cards.some((c, s) => c === 'JK' && s % 2 === 1)) o.n++;
    // a Wanted Poster that won the trick counts its progress twice
    if (mine && o.n > n0 && E.en(wk, 'poster')) { o.n += o.n - n0; E.say(L, E.label(wk.c) + ' is a Wanted Poster: that counts twice toward the bonus.', 'objective'); }
    if (OBJECTIVES[id].kind === 'limit') return;         // judged at the end of the level
    o.n = Math.min(o.n, o.of);
    if (o.n >= o.of) finishObjective(L);
  }
  /* Glass leaves the deck the third time it wins: no longer yours, and gone from the table for the rest
     of the run (unless the deck is down to the four hands, when it only stops being yours). */
  const GLASS_WINS = 3;
  function shatter(L, c) {
    L.owned = L.owned.filter(x => x !== c);
    delete L.mods[c];
    if (L.hexes) delete L.hexes[c];
    if (L.bossHex && L.bossHex.card === c) L.bossHex = null;
    if (E.deckOf(L).length > 4 * E.ACTS[E.actOf(L)].hand) { L.removed = (L.removed || []).concat(c); E.say(L, E.label(c) + ' is Glass, and that was its third win: it shatters and leaves the deck.', 'rule'); }
    else E.say(L, E.label(c) + ' is Glass, and that was its third win: it shatters. It stays in the deck as a plain card, no longer yours.', 'rule');
  }
  // the contest's score as tricks come in: slices of pie, turkeys, the race's run (Ring the Bell is judged at the end)
  function trackContest(L, trick, mine) {
    const c = L.contest, C = CONTEST.list[c.id];
    let add = 0;
    if (c.id === 'pie' && mine) add = trick.cards.filter(x => x && x !== 'JK' && E.suitOf(x) === 'H').length;
    if (c.id === 'turkey' && mine) { const w = trick.cards[trick.winner]; add = w === 'JK' || E.rankOf(w) === 'A' ? 1 : 0; }
    if (c.id === 'race') { c.run = mine ? c.run + 1 : 0; add = Math.max(0, c.run - c.score); }
    if (add) { c.score += add; E.say(L, C.name + ': ' + c.score + ' ' + C.unit[c.score === 1 ? 0 : 1] + '.', 'objective'); }
  }
  function trackHand(L) {
    const o = L.obj, r = L.h.result;
    if (!o || o.done || o.fail) return;
    if (o.id === 'every') { if (r.tricks[0] === 0) { o.fail = true; E.say(L, OBJECTIVES.every.name + ' is broken: a hand without a trick.', 'objective'); } return; }
    if (o.id === 'robbery') { if (L.you > L.opp) o.n++; else { o.fail = true; E.say(L, 'The gang outscored you: the robbery goes ahead.', 'objective'); } }
    if (o.id === 'setthem' && E.team(r.contractor) === 1 && !r.made) o.n++;
    if (o.id === 'makemis' && r.misere && E.team(r.contractor) === 0 && r.made) o.n++;
    const ct = L.h.contract;
    if (o.id === 'setbig' && E.team(r.contractor) === 1 && !r.misere && !r.made && ct.t >= ACT3.big) o.n++;
    if (o.id === 'make8' && E.team(r.contractor) === 0 && !r.misere && r.made && ct.t >= 8) o.n++;
    if (o.id === 'openmis' && r.misere && L.h.open && E.team(r.contractor) === 0 && r.made) o.n++;
    if (o.id === 'holdline') {
      if (E.team(r.contractor) === 1 && r.made) { o.n++; o.fail = true; E.say(L, OBJECTIVES.holdline.name + ' is broken: the opponents made a contract.', 'objective'); }
      return;
    }
    o.n = Math.min(o.n, o.of);
    if (o.n >= o.of) finishObjective(L);
  }
  function finishObjective(L) {
    L.obj.done = true;
    E.say(L, 'Objective complete: ' + OBJECTIVES[L.obj.id].text + '!', 'objective');
  }

  /* ---------------- moves inside a hand ---------------- */
  function react(L, kind) {
    const lines = PARTNERS[L.partner].lines[kind];
    if (!lines) return;
    E.rnd(L);                     // still drawn, so a seed deals the same cards as before
    const said = L.saidN || (L.saidN = {}), n = said[kind] | 0;
    said[kind] = n + 1;
    L.reaction = { kind, text: dealt(L, 'r:' + L.partner + ':' + kind, lines, n) };
  }
  function after(L, res) {
    if (!res.ok) return res;
    if (L.h.herald && L.h.herald.trick === L.h.trickNo + 1 && L.h.herald.partner === 2 && !L.h.herald.said) {
      L.h.herald.said = true;
      L.reaction = { kind: 'herald', text: 'I\u2019ve got ' + (L.h.herald.n ? L.h.herald.n : 'no') + ' ' + (E.NAME[L.h.herald.suit] || 'of those') + ', dear.' };
    }
    if (res.trick) { track(L, res.trick); const good = L.h.misere ? E.team(res.trick.winner) === 1 : E.team(res.trick.winner) === 0; react(L, good ? 'won' : 'lost'); }
    const h = L.h;
    // Swing Your Partner (a buff or the Caller's call) and Grand Right and Left: after the kitty, before the intent and the first trick
    if ((h.phase === 'intent' || h.phase === 'play') && h.trickNo === 0 && !h.trick.some(Boolean) && !h.misere) {
      const want = (L.call === 'grand' || L.stand === 'caller') && !h.grandDone ? 'grand' : (has(L, 'swing') || L.call === 'swing') && !h.swingDone ? 'swing' : null;
      if (want) { h.swingNext = h.phase; h.phase = 'swing'; h.pass = want; }
    }
    if (h.phase === 'done') endHand(L);
    return res;
  }
  function swing(L, card) {
    const h = L.h;
    if (h.phase !== 'swing') return no('nothing to swap');
    if (h.pass === 'grand') {
      // everyone passes one card to the left at once: you to West, West to Nan, Nan to East, East to you
      if (!card || !h.hands[0].includes(card)) return no('pick a card to pass to West');
      const give = [card, AI.cheapest(L, 1, h.hands[1]), AI.cheapest(L, 2, h.hands[2]), AI.cheapest(L, 3, h.hands[3])];
      for (let p = 0; p < 4; p++) h.hands[p].splice(h.hands[p].indexOf(give[p]), 1);
      for (let p = 0; p < 4; p++) h.hands[(p + 1) % 4].push(give[p]);
      if (h.locked === card) h.locked = null;
      if (h.ticking === card) h.ticking = null;
      for (let p = 0; p < 4; p++) E.sort(L, p);
      E.say(L, E.callWords(L, 'Grand Right and Left')[0] + ': you passed your ' + E.label(card) + ' to West, and East passed you the ' + E.label(give[3]) + '.', 'rule');
      h.grandDone = true;
      if ((has(L, 'swing') || L.call === 'swing') && !h.swingDone) { h.pass = 'swing'; return yes(); }    // Do-si-do on a Swing call
      h.phase = h.swingNext;
      h.pass = null;
      return yes();
    }
    if (card) {
      if (!h.hands[0].includes(card)) return no('not in your hand');
      const back = AI.gift(L, 2);
      h.hands[0].splice(h.hands[0].indexOf(card), 1);
      h.hands[2].splice(h.hands[2].indexOf(back), 1);
      h.hands[0].push(back); h.hands[2].push(card);
      if (h.locked === card) h.locked = null;
      if (h.ticking === card) h.ticking = null;
      E.sort(L, 0); E.sort(L, 2);
      E.say(L, (L.call === 'swing' ? CALLS.swing.name : BUFFS.swing.name) + ': you gave ' + E.pname(L) + ' your ' + E.label(card) + ' and she gave you her ' + E.label(back) + '.', 'rule');
    } else E.say(L, 'You kept your hand.', 'rule');
    h.swingDone = true;
    h.phase = h.swingNext;
    h.pass = null;
    return yes();
  }
  /* After each hand: your points shoot the gang, theirs hit you. The fight goes on until your total reaches
     their health (the Bank: its one hand), or your health runs out, which ends the run wherever you are. */
  function endHand(L) {
    unbury(L);
    if (L.dare && !L.dare.done && L.dare.hand === L.handNo) L.dare.done = true;     // a dare lasts its hand
    if (L.mode === 'standard') { endStandardHand(L); return; }
    const r = L.h.result;
    if (r.dmg >= L.health && L.health > 1 && has(L, 'watch') && L.watchAct !== L.act) {
      r.dmg = L.health - 1; L.watchAct = L.act;
      E.say(L, 'Pocket Watch: the shot stops at your watch! You hang on with 1 health.', 'health');
    }
    L.health = Math.max(0, L.health - r.dmg);
    // Ring the Bell: your team's 500 score, hand by hand (never below nothing), the bigger the contracts made the higher it rings
    if (L.kind === 'contest' && L.contest && L.contest.id === 'bell') L.contest.score += Math.max(0, r.pts[0]);
    // in a fight your shots only ever bring the gang down (r.hit is never below nothing); the Bank keeps the score
    L.you += L.foe ? r.hit : r.pts[0];
    L.opp += r.pts[1];
    stoke(L, r);
    trackHand(L);
    react(L, E.team(r.contractor) === 0 ? (r.made || r.near ? 'made' : 'failed') : (r.made ? 'theirs' : 'set'));
    L.history.push({ act: L.act, level: L.level, kind: L.kind, hand: L.handNo, contract: L.h.contract, contractor: r.contractor, made: r.made, delta: r.delta, hit: L.foe ? r.hit : r.pts[0], dmg: r.dmg, health: L.health });
    if (L.foe) E.say(L, (r.hit > 0 ? 'You hit ' + L.foe.name + ' for ' + r.hit : 'You didn\u2019t touch ' + L.foe.name) + ': ' + Math.max(0, L.foe.hp - L.you) + ' of their ' + L.foe.hp + ' health left.', 'health');
    E.say(L, r.dmg ? 'They hit you for ' + r.dmg + ': health ' + L.health + '.' : 'They didn\u2019t touch you: health ' + L.health + '.', 'health');
    if (L.health <= 0) {
      L.phase = 'runover';
      L.lostTo = L.kind === 'boss' ? L.boss : (L.foe ? L.foe.name : 'the gang');
      L.record = (L.record || []).concat({ act: L.act, level: L.level, kind: L.kind, id: L.kind === 'boss' ? L.boss : L.obj.id, stars: 0, won: false, lost: true });
      E.say(L, 'Your health is gone: the run is over.', 'end');
      return;
    }
    L.phase = 'summary';
  }
  const fightOver = L => L.mode === 'standard' ? L.std.winner != null : L.kind === 'bank' || L.kind === 'contest' || L.kind === 'chase' ? L.handNo >= L.hands : L.you >= L.foe.hp;
  const parOf = L => ((PAR[L.kind] || {})[L.act] || 1) + (has(L, 'horse') && L.kind !== 'bank' ? 1 : 0);
  /* After the summary: the next hand, or the fight's stars. */
  function next(L) {
    if (L.phase !== 'summary') return no('no summary showing');
    if (L.mode === 'standard' && fightOver(L)) { L.phase = 'stdover'; return yes(); }
    if (fightOver(L)) { finishLevel(L); return yes(); }
    L.handNo++;
    L.dealer = (L.dealer + 1) % 4;
    L.phase = 'hand';
    L.reaction = null;
    dealHand(L);
    return yes();
  }
  /* A won fight's stars: one for the win, one for the bounty, one for winning within par. A Showdown has no
     bounty: two stars, three within par. */
  function finishLevel(L) {
    if (L.kind === 'chase') { chaseStretch(L); return; }
    const o = L.obj, par = parOf(L), fast = L.kind !== 'bank' && L.handNo <= par;
    let stars = 1, gold = 0, won = true, loot = null;
    /* The payout, line by line (2026-10-30: the stars pop-up and the Showdown's desk count it out), adding up to
       `gold`: { t: what, g: gold } and { t, h: health } for the Canteen. */
    const pay = [];
    if (L.kind === 'boss') {
      stars = fast ? 3 : 2;
      gold = 100;
      pay.push({ t: 'Bounty: ' + BOSS[L.boss].name.replace(/^The /, 'the '), g: gold });
      E.say(L, BOSS[L.boss].name + ' are brought to justice!', 'objective');
      const lt = L.map && L.map.loot;
      if (lt && BUFFS[lt] && !L.buffs.includes(lt)) {
        grantBuff(L, lt); loot = lt;
        pay.push({ t: 'Their loot: ' + BUFFS[lt].name, buff: lt });
        E.say(L, 'Their loot is yours: ' + BUFFS[lt].name + '. ' + BUFFS[lt].text, 'objective');
      }
      if (L.bossHex && L.bossHex.boss !== L.boss) {     // a hex from a lost Showdown (saved runs from before the redesign)
        if (L.hexes && L.hexes[L.bossHex.card] === L.bossHex.kind) delete L.hexes[L.bossHex.card];
        L.bossHex = null;
      }
    } else if (L.kind === 'contest') {
      const C = CONTEST.list[L.contest.id], tier = ribbonOf(L.contest.id, L.contest.score);
      won = tier > 0; stars = Math.max(1, tier); Object.assign(L.contest, { stage: 'after', ribbon: tier });
      L.ribbons = (L.ribbons || []).concat({ id: L.contest.id, tier, act: L.act });
      if (tier === 1) { gold = CONTEST.fee + CONTEST.white; pay.push({ t: 'White ribbon: your entry back', g: CONTEST.fee }, { t: 'and the prize money', g: CONTEST.white }); }
      else if (tier) pay.push({ t: (tier === 3 ? 'Blue' : 'Red') + ' ribbon: ' + (tier === 3 ? 'a pick of buffs' : 'a pick of enhancements'), g: 0 });
      else pay.push({ t: 'No ribbon: the entry is the judges’', g: 0 });
      E.say(L, C.name + ': ' + L.contest.score + ' ' + C.unit[L.contest.score === 1 ? 0 : 1] + ', ' + RIBBON[tier] + '.', 'objective');
    } else {
      if (OBJECTIVES[o.id] && OBJECTIVES[o.id].kind === 'limit' && !o.fail && !o.done) finishObjective(L);
      if (L.kind === 'bank') {
        // the stakes were fixed at the door: what you win and lose doesn't move with gold earned in the hand
        won = o.done; stars = won ? 3 : 1; L.bank.stage = 'after';
        gold = won ? bankBounty(L) : -Math.min(L.gold, L.bank.take);
        pay.push(won ? (gold ? { t: holdup(L).payer + '’s bounty', g: gold } : { t: 'Their haul: an enhancement', g: 0 }) : { t: 'The gang rode off with', g: gold });
        E.say(L, won ? 'You stopped the robbery! ' + (gold ? holdup(L).payer + ' pays a ' + gold + ' gold bounty.' : 'Their haul is yours to pick from.') : 'The gang gets away with ' + -gold + ' of your gold.', 'gold');
      } else {
        stars = 1 + (o.done ? 1 : 0) + (fast ? 1 : 0);
        gold = bountyOf(L.kind, L.foe, stars);
        // the star by star rise of PAY, then what the gang's extra tricks add on top
        const P = PAY[L.kind], plain = P[stars], b = o.done ? 1 : 0;
        pay.push({ t: 'Bounty: ' + L.foe.name.replace(/^The /, 'the '), g: P[1] });
        if (b) pay.push({ t: 'Bonus: ' + OBJECTIVES[o.id].name, g: P[1 + b] - P[1], star: true });
        if (fast) pay.push({ t: 'Within par (' + par + ' hands)', g: P[stars] - P[1 + b], star: true });
        if (gold !== plain) pay.push({ t: 'Wanted for their tricks', g: gold - plain });
        if (L.fight && L.fight.double) { pay.push({ t: 'Deputised: paid double', g: gold }); gold *= 2; }
        if (hotMult(L) > 1) { const add = Math.round(gold * (hotMult(L) - 1)); pay.push({ t: 'Hot Hand: ' + HOT.names[hotStage(L.hot)] + ' \u00d7' + hotMult(L), g: add, hot: true }); gold += add; }
        if (L.foe.ghost && L.ghost) {
          const back = ghostCard(L);
          L.ghost.met = true;
          if (back) {
            L.owned.push(back);
            if (L.ghost.mods[back]) L.mods[back] = JSON.parse(JSON.stringify(L.ghost.mods[back]));
            pay.push({ t: 'Back from Boot Hill: your old ' + E.label(back), g: 0, card: back });
            E.say(L, 'The ghosts fade, and your old ' + E.kLabel({ c: back, m: L.mods[back] || null }) + ' is yours again.', 'objective');
          }
        }
        E.say(L, L.foe.name + ' are brought in after ' + L.handNo + ' hand' + (L.handNo > 1 ? 's' : '') + (fast ? ' (par ' + par + ')' : ', over par ' + par) + '.', 'objective');
      }
    }
    if (won && L.foe && L.foe.driver) {
      E.say(L, L.foe.name + ' is down, and his train runs off the rails into a ravine: two trains draw level, left and right, and you jump.', 'objective');
      note(L, 'The engineer\u2019s train goes over into the ravine! Two trains draw level beside you: the left one looks quiet, the right one is crawling with gangs. Jump.');
    }
    if (won && L.foe && L.foe.tipoff && COUNTER[L.foe.tipoff] && !has(L, COUNTER[L.foe.tipoff])) {
      const b = COUNTER[L.foe.tipoff];
      L.buffs.push(b);
      pay.push({ t: 'Their secret: ' + BUFFS[b].name, buff: b });
      E.say(L, 'They were carrying ' + BOSS[L.foe.tipoff].name.replace(/^The /, 'the ') + '\u2019 secret: ' + BUFFS[b].name + '. ' + BUFFS[b].text, 'objective');
    }
    if (won && L.foe) {
      if (has(L, 'ledger')) { gold += 15; pay.push({ t: BUFFS.ledger.name, g: 15 }); E.say(L, 'Bounty Ledger: +15 gold.', 'gold'); }
      if (has(L, 'canteen')) { const got = heal(L, 25); if (got) { pay.push({ t: BUFFS.canteen.name, h: got }); E.say(L, 'Canteen: +' + got + ' health.', 'health'); } }
    }
    L.gold += gold;
    L.levelsDone++;
    L.actLevels = (L.actLevels || 0) + 1;
    L.result = { kind: L.kind, stars, gold, objective: o ? o.done : null, fast, hands: L.handNo, par, won, you: L.you, opp: L.opp,
                 health: L.health, change: L.health - L.startHealth, goldChange: L.gold - L.startGold, foe: L.foe, pay, boss: L.boss, act: L.act, loot };
    // one line per level for the run's ending
    L.record = (L.record || []).concat({ act: L.act, level: L.level, kind: L.kind, id: L.kind === 'boss' ? L.boss : L.kind === 'contest' ? L.contest.id : o.id, stars, won: L.kind === 'boss' ? true : L.kind === 'contest' ? won : o.done });
    L.phase = 'over';
    E.say(L, 'Game ' + L.level + ' over: ' + stars + ' star' + (stars > 1 ? 's' : '') + ', ' + (gold < 0 ? '\u2212' + -gold : gold) + ' gold.', 'end');
    L.curse = null; L.dealRule = null; L.fight = null; L.rules = null;   // a quick contest's rules end with it
  }

  /* ---------------- rewards ---------------- */
  const freeBuffs = L => Object.keys(BUFFS).filter(b => !L.buffs.includes(b) && b !== PARTNERS[L.partner].ability && !BUFFS[b].secret && !BUFFS[b].partner);
  function draw(L, ids, n) { return E.shuffle(L, ids.slice()).slice(0, n); }
  /* Any card your team won this level, except the Joker (the user's call, 2026-10-23: too strong a gift). */
  function claimable(L) { return [...new Set(L.captured || [])].filter(c => c !== 'JK' && !L.owned.includes(c)).sort(); }
  /* The level's reward, as a list of steps the page walks through. */
  function collect(L) {
    if (L.phase !== 'over') return no('no level to collect');
    const r = L.result, steps = [];
    if (r.kind === 'dance') {
      if (r.stars === 2) steps.push({ type: 'enh', options: draw(L, enhPool(L), picks(L, 2)) });
      if (r.stars === 3) steps.push({ type: 'enh', options: draw(L, enhPool(L), picks(L, 3)), claim: claimable(L) });
    } else if (r.kind === 'elite') {
      const fb = freeBuffs(L);
      if (r.stars === 2 && fb.length) { const b = E.pick(L, fb); grantBuff(L, b); note(L, 'Duel prize: ' + BUFFS[b].name + '.'); }
      if (r.stars === 3 && fb.length) steps.push({ type: 'buff', options: draw(L, fb, picks(L, 2)) });
    } else if (r.kind === 'boss' && r.won && !r.loot) {
      const fb = freeBuffs(L);
      if (fb.length) steps.push({ type: 'buff', options: draw(L, fb, picks(L, 3)) });
    } else if (r.kind === 'bank' && r.won) steps.push({ type: 'enh', options: draw(L, enhPool(L), picks(L, BANK.enh)) });
    else if (r.kind === 'contest' && r.stars >= 2 && r.won) {
      const fb = freeBuffs(L);
      if (r.stars === 3 && fb.length) steps.push({ type: 'buff', options: draw(L, fb, picks(L, 2)) });
      else steps.push({ type: 'enh', options: draw(L, enhPool(L), picks(L, 2)) });
    }
    // after the robbery, back inside to the teller
    L.reward = { steps, back: r.kind === 'bank' && BANK.teller[L.act] ? 'bank' : undefined };
    advanceReward(L, L.reward.back);
    return yes();
  }
  /* Silver-mounted rewards (2026-11-03, the user's: "rewards come face down and flip with a rarity glow; rare gilded
     versions"; named Gilded until 2026-11-04, when the user found it confused with the Gilded enhancement, so the
     code still says gild). Each pick may have one such offer (GILD.p): a silver-mounted buff comes with a purse of
     gold, a silver-mounted enhancement also polishes the card it goes on a rank (or pays the purse when the card can rise no further). A
     story's first pick always has one, so a new player meets it. Decided when the pick comes up, and again on a
     reroll. */
  const GILD = { p: 0.12, gold: 30 };
  function gildStep(L, s) {
    if (!s || s.gilded !== undefined || !s.options || !s.options.length) return;
    const first = !L.gildMet;
    L.gildMet = true;
    s.gilded = first || E.rnd(L) < GILD.p ? E.pick(L, s.options) : null;
  }
  function advanceReward(L, back) {
    const steps = L.reward ? L.reward.steps : [];
    if (steps.length) { gildStep(L, steps[0]); L.phase = 'reward'; return; }
    L.reward = null;
    if (back) { L.phase = back; return; }
    nextStop(L);
  }
  /* Reroll the current reward's options for 15 gold (any number of times; free with Loaded Dice). */
  const rerollPrice = L => has(L, 'dice') ? 0 : REROLL;
  function reroll(L) {
    const s = L.reward && L.reward.steps[0];
    if (L.phase !== 'reward' || !s) return no('nothing to reroll');
    if (L.gold < rerollPrice(L)) return no('not enough gold');
    const pool = s.type === 'buff' ? freeBuffs(L) : enhPool(L);
    if (pool.length <= s.options.length && s.type === 'buff') return no('no other buffs to draw');
    L.gold -= rerollPrice(L);
    const n = s.options.length, fresh = pool.filter(x => !s.options.includes(x));
    s.options = draw(L, fresh.length >= n ? fresh : pool, n);
    s.gilded = undefined; gildStep(L, s);
    note(L, rerollPrice(L) ? 'Rerolled for ' + REROLL + ' gold.' : 'Rerolled with the Loaded Dice.');
    return yes();
  }
  function grantBuff(L, b) {
    if (L.buffs.includes(b)) return;
    L.buffs.push(b);
    if (b === 'iron') heal(L, 100);
  }
  function choose(L, arg) {
    const s = L.reward && L.reward.steps[0];
    if (L.phase !== 'reward' || !s) return no('nothing to choose');
    if (arg && arg.skip) { L.reward.steps.shift(); advanceReward(L, L.reward.back); return yes(); }
    if (s.type === 'buff') {
      if (!s.options.includes(arg)) return no('not on offer');
      grantBuff(L, arg); note(L, 'New buff: ' + BUFFS[arg].name + '.');
      if (s.gilded === arg) { L.gold += GILD.gold; note(L, 'New buff: ' + BUFFS[arg].name + ', silver-mounted: +' + GILD.gold + ' gold.'); }
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
      L.targetStep = L.reward.steps.shift();      // kept, so you can go back to the pick (unplace)
      return yes();
    }
    return no('unknown reward');
  }
  /* The enhancement and its card in one go (the reward screen, Balatro's way: choose both, then Use). */
  function place(L, arg) {
    const s = L.reward && L.reward.steps[0];
    if (L.phase !== 'reward' || !s || s.type !== 'enh') return no('no enhancement to place');
    if (!arg || !s.options.includes(arg.enh)) return no('not on offer');
    const why = cantTake(L, arg.card, arg.enh);
    if (why) return no(why);
    choose(L, arg.enh);
    return enhance(L, arg.card);
  }
  // why a card can't take an enhancement, or '' when it can
  function cantTake(L, card, id) {
    if (card === 'JK') return 'the Joker takes no enhancements';
    if (!L.owned.includes(card)) return 'pick a card you own';
    if (!fits(L, card, id)) return legendary(L, card) ? 'that card is Legendary already: it holds two enhancements' : 'that card can’t take ' + ENH[id].name + ' with what it has';
    return '';
  }
  /* Changing your mind (the user's, 2026-10-30: they took Hollow Point for the Joker, found it can't take one, and
     were stuck putting it on another card). Nothing is spent until a card is chosen: from a reward the pick comes
     back as it was; from the General Store, the price comes back. */
  function unplace(L) {
    if (L.phase !== 'target') return no('no enhancement to put back');
    if (L.targetBack === 'shop' && L.targetBuy != null && L.stock && L.stock[L.targetBuy]) {
      const it = L.stock[L.targetBuy];
      it.sold = false; L.gold += it.price; L.phase = 'shop';
      note(L, 'You hand ' + ENH[L.target].name + ' back across the counter: ' + it.price + ' gold refunded.');
    } else if (L.targetStep) {
      L.reward = L.reward || { steps: [], back: L.targetBack || undefined };
      L.reward.steps.unshift(L.targetStep);
      L.phase = 'reward';
    } else return no('it can’t go back now');
    L.target = L.targetStep = L.targetBuy = null;
    return yes();
  }
  /* Put the chosen enhancement on an owned card: a card's first, or its second, which makes it Legendary. An
     enhancement is never overwritten; `null` leaves it unused (when no card can take it, or you'd rather not). */
  function enhance(L, card) {
    if (L.phase !== 'target') return no('no enhancement to place');
    if (card === null || card === undefined || (card && card.skip)) {
      note(L, 'You leave ' + ENH[L.target].name + ' unused.');
      L.target = L.targetStep = L.targetBuy = null; advanceReward(L, L.targetBack); return yes();
    }
    const why = cantTake(L, card, L.target);
    if (why) return no(why);
    const m = L.mods[card] || (L.mods[card] = {});
    if (m.enh) {
      m.enh2 = L.target;
      note(L, E.label(card) + ' is Legendary: ' + ENH[m.enh].name + ' and ' + ENH[m.enh2].name + '.');
    } else {
      m.enh = L.target;
      note(L, E.label(card) + ' is now ' + ENH[L.target].name + '.');
    }
    if (L.targetStep && L.targetStep.gilded === L.target) {
      if ((m.up || 0) < E.maxUp(card)) { m.up = (m.up || 0) + 1; note(L, L.note + ' Silver-mounted: polished up a rank too.'); }
      else { L.gold += GILD.gold; note(L, L.note + ' Silver-mounted: +' + GILD.gold + ' gold.'); }
    }
    L.target = L.targetStep = L.targetBuy = null;
    advanceReward(L, L.targetBack);
    return yes();
  }
  // the cards that can take the enhancement being placed (every card you own but the Joker, outside that)
  const enhanceable = L => L.owned.filter(c => c !== 'JK' && (L.phase !== 'target' || !L.target || fits(L, c, L.target)));

  /* ---------------- events ---------------- */
  function option(L, i) {
    if (L.phase !== 'event') return no('no event');
    const ev = EVENTS[L.event], o = ev.options[i];
    if (!o) return no('no such option');
    const fx = o.fx;
    if (fx.release && L.owned.length < 2) return no('you have only one card to keep');
    if (fx.gold < 0 && L.gold < -fx.gold) return no('not enough gold');
    if (fx.health < 0 && L.health + fx.health <= 0) return no('that would finish you');
    if (fx.shunt && !shuntable(L).length) return no('no stretch ahead has two carriages to swap');
    if (fx.shunt) { L.shunt = { pick: null }; L.phase = 'shunt'; return yes(); }
    if (fx.swap && !L.owned.some(c => c !== 'JK')) return no('you have no card to swap');
    if (fx.gold) L.gold += fx.gold;
    if (fx.next) L.nextFight = Object.assign(L.nextFight || {}, fx.next);
    if (fx.health > 0) heal(L, fx.health);
    else if (fx.health) L.health += fx.health;
    let msg = o.text.replace(/:.*/, '') + '.';
    if (fx.card === 'face') {
      const pool = E.deckOf(L).filter(c => ['J', 'Q', 'K'].includes(E.rankOf(c)) && !L.owned.includes(c));
      if (pool.length) {
        const c = E.pick(L, pool); L.owned.push(c); msg = 'The stranger’s card is the ' + E.label(c) + '. It’s yours now.';
        // one marked card a story: five, kept across stories by the page, and he waits at the Fair (STRANGER)
        if (L.event === 'stranger' && !L.daily && !L.marked) { L.marked = c; msg += ' A corner of it is marked.'; }
      }
    }
    if (fx.swap) {
      const mine = L.owned.filter(c => c !== 'JK'), out = E.pick(L, mine), pool = E.deckOf(L).filter(c => !L.owned.includes(c) && c !== 'JK');
      const got = E.pick(L, pool);
      L.owned = L.owned.filter(c => c !== out).concat(got); delete L.mods[out];
      msg = 'The gambler takes your ' + E.label(out) + ' and hands you the ' + E.label(got) + '.';
    }
    if (fx.hex) {
      const card = hexTarget(L, fx.hex.on);
      if (card) { placeHex(L, card, fx.hex.kind); msg += ' ' + HEXES[fx.hex.kind].name + ' lands on ' + (L.owned.includes(card) ? 'your ' : 'the ') + E.label(card) + '.'; }
    }
    if (fx.curse === 'twoleft') {
      const pool = E.deckOf(L).filter(c => c !== 'JK' && E.rankOf(c) !== 'J' && !L.owned.includes(c) && !(L.hexes || {})[c] && ['9', '10'].includes(E.rankOf(c)));
      if (pool.length) { const c = E.pick(L, pool); L.owned.push(c); placeHex(L, c, 'twoleft'); msg += ' You now own the ' + E.label(c) + ', a Misfire: it can never win a trick.'; }
    }
    note(L, msg);
    if (fx.enh) { L.reward = { steps: [{ type: 'enh', options: draw(L, enhPool(L), picks(L, fx.enh)) }] }; advanceReward(L); return yes(); }
    if (fx.release) { L.releaseBack = 'map-next'; L.phase = 'release'; return yes(); }
    nextStop(L);
    return yes();
  }

  /* The stranger remembers you (2026-11-02): with past rides in the profile (L.memory) he says where the last one
     ended, and counts the marked cards. Every other event reads its own text. */
  function eventText(L, id) {
    const ev = EVENTS[id];
    if (id !== 'stranger') return ev.text;
    const m = L.memory, marked = (m && m.marked) || 0;
    const count = !L.daily ? ' A corner of it is marked' + (marked ? ': keep it and that\u2019s ' + Math.min(STRANGER.marks, marked + 1) + ' of ' + STRANGER.marks + '.' : '.') : '';
    if (!m || !m.runs) return ev.text + count;
    const who = m.lostTo ? (BOSS[m.lostTo] ? BOSS[m.lostTo].name : m.lostTo).replace(/^The /, 'the ') : null;
    const where = ['', ' in Euchre-ka!', ' on the Westbound Express', ' at the County Fair'][m.lastAct | 0] || '';
    const last = m.lastWon ? 'Last time you rode the whole way and brought them in.' : who ? 'Last time ' + who + ' put you in the ground' + where + '.' : 'Last time didn\u2019t end well.';
    return 'The stranger in the string tie again. \u201cYou\u2019re back. ' + last + ' That makes ' + (m.runs + 1) + ' rides.\u201d He presses a card into your hand.' + count;
  }

  /* ---------------- the Punch Bowl and the General Store ---------------- */
  function camp(L, what) {
    if (L.phase !== 'camp') return no('not at the Hotel');
    if (what === 'cashin') return cashIn(L);
    if (what === 'rest') { const got = heal(L, restOf(L)); note(L, 'A night’s rest: +' + got + ' health.'); nextStop(L); return yes(); }
    if (what === 'polish') { if (!polishable(L).length) return no('nothing to polish'); L.phase = 'polish'; return yes(); }
    if (what === 'cleanse') { if (!hexed(L).length) return no('no hexes to cleanse'); L.cleanseBack = 'map-next'; L.phase = 'cleanse'; return yes(); }
    if (what === 'shop') { L.restocks = 0; stock(L); L.phase = 'shop'; return yes(); }
    if (what === 'forge') { if (!forgeable(L).length) return no('nothing to forge'); L.phase = 'forge'; return yes(); }
    if (what === 'remove') { if (!removable(L).length) return no('nothing to remove'); L.phase = 'remove'; return yes(); }
    return no('unknown action');
  }
  /* Table-deck changes (Act III; they affect everyone). The kitty takes the difference, kept between
     KITTY.min and KITTY.max cards, so Forge and Remove each have a limit. */
  const KITTY = { min: 1, max: 6 };
  const kittyOf = L => E.deckOf(L).length - 4 * E.ACTS[E.actOf(L)].hand;
  const deckChanges = L => E.ACTS[E.actOf(L)].forge;
  const forgeable = L => deckChanges(L) && kittyOf(L) < KITTY.max ? L.owned.filter(c => c !== 'JK' && !(L.hexes && L.hexes[c] === 'twoleft')) : [];
  const removable = L => deckChanges(L) && kittyOf(L) > KITTY.min ? E.deckOf(L).filter(c => c !== 'JK' && !L.owned.includes(c)) : [];
  function forge(L, card) {
    if (L.phase !== 'forge') return no('not at the forge');
    if (!forgeable(L).includes(card)) return no('that card can\u2019t be forged');
    const n = (L.forged || []).filter(c => E.base(c) === E.base(card)).length + 1, copy = E.base(card) + '~' + n;
    L.forged = (L.forged || []).concat(copy);
    L.owned.push(copy);
    note(L, 'Forged: a second ' + E.label(card) + ' is yours and joins the deck. The two tie, so the first played wins. The kitty is now ' + kittyOf(L) + ' cards.');
    nextStop(L);
    return yes();
  }
  function removeCard(L, card) {
    if (L.phase !== 'remove') return no('not removing');
    if (!removable(L).includes(card)) return no('that card can\u2019t be removed');
    L.removed = (L.removed || []).concat(card);
    if (L.hexes) delete L.hexes[card];      // a hex leaves with its card
    if (L.bossHex && L.bossHex.card === card) L.bossHex = null;
    note(L, 'Removed: the ' + E.label(card) + ' is out of the deck for the rest of the run. The kitty is now ' + kittyOf(L) + ' card' + (kittyOf(L) > 1 ? 's' : '') + '.');
    nextStop(L);
    return yes();
  }
  const polishable = L => L.owned.filter(c => c !== 'JK' && ((L.mods[c] && L.mods[c].up) || 0) < E.maxUp(c));
  function polish(L, card) {
    if (L.phase !== 'polish') return no('not polishing');
    if (!polishable(L).includes(card)) return no('that card can’t be polished');
    const m = L.mods[card] || (L.mods[card] = {});
    m.up = (m.up || 0) + 1;
    note(L, 'Polished: your ' + E.kLabel({ c: card, m }) + '.');
    // push your luck: again, while it can go higher
    if (polishable(L).includes(card)) { L.heat = { card, n: 1 }; L.phase = 'heat'; return yes(); }
    nextStop(L);
    return yes();
  }
  function heat(L, what) {
    if (L.phase !== 'heat' || !L.heat) return no('nothing on the polishing cloth');
    const card = L.heat.card, m = L.mods[card] || (L.mods[card] = {});
    if (what !== 'again') { L.heat = null; nextStop(L); return yes(); }
    if (E.rnd(L) < heatOdds(L)) {
      L.owned = L.owned.filter(c => c !== card); delete L.mods[card];
      if (L.hexes) delete L.hexes[card];
      if (L.bossHex && L.bossHex.card === card) L.bossHex = null;
      L.heat = null; L.cracked = (L.cracked || 0) + 1;
      note(L, 'You rub too hard and the ' + E.label(card) + ' cracks: it\u2019s no longer yours, and everything on it is gone. It stays in the deck as a plain card.');
      nextStop(L);
      return yes();
    }
    m.up = (m.up || 0) + 1; L.heat.n++;
    note(L, 'Polished again: your ' + E.kLabel({ c: card, m }) + '.');
    if (!polishable(L).includes(card)) { L.heat = null; nextStop(L); }
    return yes();
  }
  function stock(L) {
    const cards = E.shuffle(L, E.deckOf(L).filter(c => !L.owned.includes(c))).slice(0, 2);
    const fb = freeBuffs(L);
    L.stock = cards.map(c => ({ type: 'card', id: c, price: priced(L, cardPrice(c)) }))
      .concat([{ type: 'enh', id: E.pick(L, enhPool(L)), price: priced(L, ENH_PRICE) }])
      .concat(fb.length ? [{ type: 'buff', id: E.pick(L, fb), price: priced(L, 150 + 25 * Math.floor(E.rnd(L) * 3)) }] : [])
      .concat([{ type: 'tonic', id: 'tonic', price: priced(L, TONIC.price) }])
      .concat(hexed(L).length ? [{ type: 'cleanse', id: 'cleanse', price: priced(L, CLEANSE_PRICE) }] : [])
      // things to spend gold on (2026-10-30, the review's #10: gold piled up), each changing a fight to come.
      // The boss's secret is NOT sold here: it is the risky train's reward, and the safe train always has a Hotel
      // (the second review found the store handing the safe side the risky side's prize).
      .concat([{ type: 'marked', id: 'marked', price: priced(L, SHOP.marked), name: 'A marked deck', text: 'See the kitty in every hand of your next fight.' },
               { type: 'posting', id: 'posting', price: priced(L, SHOP.posting), name: 'Deputise', text: 'A deputy\u2019s badge: your next fight pays double bounty. A bet on bringing them in with two stars or more.' }])
      .concat(L.act === 3 && !L.gunhand ? [{ type: 'gunhand', id: 'gunhand', price: priced(L, FAIR_GOODS.gunhand), name: 'Hire a gunhand', text: 'He rides with you to the Showdown: the boss starts a quarter down.' }] : [])
      .concat(L.act === 3 && !L.fastCar ? [{ type: 'handcar', id: 'handcar', price: priced(L, FAIR_GOODS.handcar), name: 'A faster handcar', text: 'If the boss bolts after the Showdown, your first lost stretch of the chase costs no ground.' }] : [])
      .concat([{ type: 'restock', id: 'restock', price: restockPrice(L), name: 'Ask what\u2019s out back', text: 'A new set of goods on the shelves. Costs more each time you ask.' }]);
  }
  /* The posting is a bet (a Card table pays 10 / 25 / 40 by stars: two stars breaks even, three wins); a restock
     costs 15 more each time in one visit, so the store can't be rerolled for free. */
  const SHOP = { marked: 45, posting: 25, restock: 15 };
  const restockPrice = L => priced(L, SHOP.restock * (1 + (L.restocks || 0)));
  const releasePrice = L => priced(L, 50 + 25 * L.releases);
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
    if (it.type === 'enh' && !L.owned.some(c => fits(L, c, it.id))) return no('none of your cards can take it');
    L.gold -= it.price; it.sold = true;
    if (it.type === 'card') { L.owned.push(it.id); note(L, 'Bought the ' + E.label(it.id) + '.'); }
    if (it.type === 'buff') { grantBuff(L, it.id); note(L, 'Bought ' + BUFFS[it.id].name + '.'); }
    if (it.type === 'enh') { L.target = it.id; L.targetBack = 'shop'; L.targetBuy = i; L.phase = 'target'; }
    if (it.type === 'tonic') { const got = heal(L, TONIC.health); note(L, 'Drank the tonic: +' + got + ' health.'); }
    if (it.type === 'cleanse') { L.cleanseBack = 'shop'; L.phase = 'cleanse'; }
    if (it.type === 'marked') { L.nextFight = Object.assign(L.nextFight || {}, { peek: true }); note(L, 'A marked deck: your next fight, you\u2019ll see the kitty every hand.'); }
    if (it.type === 'posting') { L.nextFight = Object.assign(L.nextFight || {}, { double: true }); note(L, 'Deputised: your next fight pays double.'); }
    if (it.type === 'restock') { L.restocks = (L.restocks || 0) + 1; stock(L); note(L, 'The storekeeper brings out new goods.'); }
    if (it.type === 'gunhand') { L.gunhand = true; note(L, 'A gunhand rides with you: the Showdown\u2019s boss will start a quarter down.'); }
    if (it.type === 'handcar') { L.fastCar = true; note(L, 'A faster handcar waits by the line, in case the boss bolts.'); }
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

  /* Fresh Deck: once a fight, before you bid, a new deal. Card up Your Sleeve: once a hand, before you bid, one of
     your cards for the kitty's top card. */
  const beforeYouBid = L => L.phase === 'hand' && L.h.phase === 'bid' && L.h.turn === 0 && !L.h.raise && !L.h.bids.some(b => b.seat === 0);
  function freshDeal(L) {
    if (!has(L, 'freshdeck')) return no('you have no Fresh Deck');
    if (L.freshUsed) return no('the fresh deal is used for this fight');
    if (!beforeYouBid(L)) return no('only before you bid');
    L.freshUsed = true;
    E.say(L, BUFFS.freshdeck.name + ': you call for a new deal.', 'rule');
    dealHand(L);
    return yes();
  }
  function sleeveSwap(L, card) {
    const h = L.h;
    if (!has(L, 'sleeve')) return no('nothing up your sleeve');
    if (!beforeYouBid(L) || h.sleeved) return no('once a hand, before you bid');
    if (!h.hands[0].includes(card) || card === h.locked) return no('pick a card from your hand');
    if (!h.kitty.length) return no('the kitty is empty');
    const got = h.kitty[0];
    h.hands[0].splice(h.hands[0].indexOf(card), 1, got); h.kitty[0] = card; h.sleeved = true;
    E.sort(L, 0);
    E.say(L, BUFFS.sleeve.name + ': you slip your ' + E.label(card) + ' under the kitty and come up with the ' + E.label(got) + '.', 'rule');
    return yes();
  }

  /* ---------------- hexes ---------------- */
  const hexed = L => Object.keys(L.hexes || {});
  function placeHex(L, card, kind) { L.hexes = L.hexes || {}; L.hexes[card] = kind; }
  /* A card to hex: one you own, or one in the deck you don't; never the Joker, a
     Jack (it may be a bower) or a card already hexed. */
  function hexTarget(L, on) {
    const free = c => c !== 'JK' && E.rankOf(c) !== 'J' && !(L.hexes || {})[c];
    let pool = on === 'owned' ? L.owned.filter(free) : E.deckOf(L).filter(c => free(c) && !L.owned.includes(c));
    if (!pool.length) pool = E.deckOf(L).filter(free);
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
    const tip = (id, text) => L.seen[id] ? null : { id, text: voice(L, text) };
    const ph = L.phase;
    if (ph === 'actstart' && L.act === 3) return tip('actstart3', 'The County Fair, dear: the little cards join in and we play the whole deck. A failed 10 no trumps can finish us, so bid carefully.');
    if (ph === 'actstart' && L.act === 2) return tip('actstart2', 'All aboard, dear. Spades and clubs join us on the train, and two of your cards come to you each hand. A black Jack is a bower when black is trumps.');
    if (ph === 'actstart') return tip('actstart', 'The Joker wins every trick it’s in. A red Jack becomes a bower whenever red is trumps. A 9 or 10 is a gamble that enhancements can make special.');
    if (ph === 'map' && reachable(L).includes('boss') && L.act === 2) return tip('boss2', 'Act II ends with the Card Sharps or the Hustlers. The Sharps can see the cards dealt to you from your own; the Hustlers bid mis\u00e8re all night, so lead low and stay under them.');
    if (ph === 'map' && L.act === 2 && L.map.side && !reachable(L).includes('boss')) { const t = tip('hatch', 'Inside the carriages it’s quieter, dear; up on the roofs is where they fight. See the ladders? A carriage with a roof hatch lets us climb up or drop down as we go on to the next one.'); if (t) return t; }
    if (ph === 'map') return reachable(L).includes('boss') ? (L.act === 1 ? tip('boss', 'That\u2019s the Saloon, dear, and the Twins are waiting in it. They always hold both red Jacks: bid no trumps and their Jacks are just Jacks.') : null) : tip('map', 'Welcome to Euchre-ka!, dear. Every gang on this map has a price on its head: we work our way up the trail a stop at a time and bring them in. Gossip is a gamble, a duel is harder but pays a buff, and the gold strike halfway always gives one.');
    if (ph === 'map' && L.pos && L.act === 1) { const t = tip('posters', 'Every gang on the map has its wanted poster under it, dear: who they are, their health, what tricks they carry and what they\u2019re worth. A tougher gang pays more.'); if (t) return t; }
    if (ph === 'water') { const t = tip('water', 'The train\u2019s taking on water, dear. Fill your canteen, or lend the fireman a hand with the wood for a few coins.'); if (t) return t; }
    if (ph === 'map' && hexed(L).length) { const t = tip('hex', 'A hex! Hexed cards are marked in red, and they hurt whoever holds them. The Doc at the Hotel can lift one.'); if (t) return t; }
    if (ph === 'reward') return tip('reward', 'A reward! An enhancement goes on a card you own and stays all run.');
    if (ph === 'bank') return L.bank.stage !== 'door' ? null : tip('bank', (L.act === 2 ? 'They\u2019re blowing the safe, dear! ' : 'Robbers, dear! ') + 'It’s one hand: make our bid or set theirs and we win. Lose, and they take ' + bankShare() + ' of your purse. Walking on by costs nothing.');
    if (ph === 'camp') return tip('camp', 'The Hotel: do one thing — shop, rest or polish a card. Cashing in health for gold is extra.');
    if (ph !== 'hand' || L.levelsDone >= 3) return null;
    const h = L.h;
    if (L.foe && L.handNo === 1 && h.phase === 'bid') { const t = tip('fight', 'They\u2019re wanted, dear, so let\u2019s bring them in. Our points shoot their health down, hand after hand; their points hit ours, and a bid of ours that fails backfires on us. Nothing heals us until it\u2019s over.'); if (t) return t; }
    if (h.phase === 'bid' && h.turn === 0) return tip('bid', 'Count sure tricks: the Joker, a bower, the Ace of trumps. We need more than half the tricks. Weak hand? Pass — defending pays 10 a trick, and setting them hits them for their whole contract.');
    if (h.phase === 'kitty' && h.turn === 0) return tip('kitty', 'You took the kitty card. Put back your weakest card that isn’t a trump.');
    if (h.phase === 'swing') return tip('swing', 'Under the table, dear: slip me a card you don’t want and I’ll slip you my best one.');
    if (h.phase === 'intent') return tip('intent', 'Their bid is their attack. Take enough tricks to stop them and it misses.');
    if (h.phase !== 'play' || h.turn !== 0) return null;
    if (h.trump && h.hands[0].some(c => E.rankOf(c) === 'J' && E.suitOf(c) === E.TWIN[h.trump]))
      { const t = tip('bower', 'Your J' + E.SYM[E.TWIN[h.trump]] + ' is the left bower this hand: it counts as a ' + E.NAME[h.trump].slice(0, -1) + ', and only the Joker and J' + E.SYM[h.trump] + ' beat it.'); if (t) return t; }
    if (h.hands[0].some(c => (L.mods[c] && (L.mods[c].enh || L.mods[c].up)) || (L.hexes || {})[c])) { const t = tip('hold', 'See the marked card, dear? Hold any card down to see what it does: its buff, its hex, what it is this hand.'); if (t) return t; }
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
      case 'collect': return collect(L);
      case 'choose': return choose(L, arg);
      case 'reroll': return reroll(L);
      case 'enhance': return enhance(L, arg);
      case 'option': return option(L, arg);
      case 'camp': return camp(L, arg);
      case 'polish': return polish(L, arg);
      case 'forge': return forge(L, arg);
      case 'heat': return heat(L, arg);
      case 'remove': return removeCard(L, arg);
      case 'buy': return buy(L, arg);
      case 'leave': if (L.phase !== 'shop') return no('not in the store'); nextStop(L); return yes();
      case 'release': return release(L, arg);
      case 'cleanse': return cleanse(L, arg);
      case 'bank': return bank(L, arg);
      case 'contest': return contest(L, arg);
      case 'chase': return chase(L, arg);
      case 'wanted': return chooseWanted(L, arg);
      case 'water': return water(L, arg);
      case 'shunt': return shunt(L, arg);
      case 'place': return place(L, arg);
      case 'unplace': return unplace(L);
      case 'partner': return choosePartner(L, arg);
      case 'freshdeal': return freshDeal(L);
      case 'sleeve': return sleeveSwap(L, arg);
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
    // the stand-in keeps its bid when the others pass on it (outbidding yourself is a choice for you)
    if (h.phase === 'bid' && h.raise) return after(L, E.bid(L, seat, null));
    if (h.phase === 'bid') return after(L, E.bid(L, seat, seat === 2 && (E.foeHas(L, 'gag') || partnerStyle(L) === 'silent') && !E.mustBid(L, seat) ? null : AI.bid(L, seat)));
    if (h.phase === 'kitty') return after(L, E.discard(L, seat, AI.discard(L, seat)));
    if (h.phase === 'play') return after(L, E.play(L, seat, AI.play(L, seat)));
    return false;
  }
  /* A refused computer move must never spin (the page would ask again for ever): take the first legal move
     instead and say so in the log. Counted on the run (`L.fallbacks`), so a test can demand zero. */
  function aiFallback(L) {
    if (L.phase !== 'hand') return no('not in a hand');
    const h = L.h, seat = h.turn, who = E.SEATS[seat];
    let res = no('nothing it could do'), what = '';
    if (h.phase === 'bid') {
      const b = E.mustBid(L, seat) ? E.legalBids(L).find(x => x.s !== 'MIS' && x.s !== 'OMIS') : null;
      what = b ? 'bids ' + E.bidText(b) : 'passes';
      E.say(L, '(' + who + '’s move was refused, so it ' + what + ' instead.)', 'rule');
      res = E.bid(L, seat, b ? { t: b.t, s: b.s } : null);
    } else if (h.phase === 'kitty') {
      const c = h.hands[seat][0];
      E.say(L, '(' + who + '’s move was refused, so it puts back its first card instead.)', 'rule');
      res = E.discard(L, seat, c);
    } else if (h.phase === 'play') {
      const c = E.legalPlays(L, seat)[0];
      if (c) { E.say(L, '(' + who + '’s move was refused, so it plays the ' + E.label(c) + ' instead.)', 'rule'); res = E.play(L, seat, c); }
    }
    L.fallbacks = (L.fallbacks || 0) + 1;
    return after(L, res);
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
    const o = L.obj, O = o && OBJECTIVES[o.id];
    if (!o) return '';
    if (o.done) return '\u2713 done';
    if (o.fail) return 'missed';
    if (o.id === 'robbery') return L.you > L.opp ? 'ahead' : 'not ahead';
    if (O && O.kind === 'limit') return 'holding';
    return o.n + ' / ' + o.of;
  }
  const api = { HOT, hotStage, hotMult, stoke, BOND, bondOf, GILD, gildStep, LUCK, lucky, jokerOdds, luckyJoker, INSULTS, insult, QUIPS, quipFor, dealt, SILENT_BACKS, poss, eventText, LAST_STAND, STRANGER, DUEL_RULES, DARES, DARE_LIE, HEAT, heatOdds, MYSTERY, GHOST, ghostFoe, DEBUFFS, LEGEND, fits, legendary, maxHealth, priced, picks, rerollPrice, enhPool, HEXES, BOSS_HEXES, CLEANSE_PRICE, hexed, hexTarget, placeHex, objProgress, HEALTH, FOE, PAR, STACK, TRAIT, TRAITS, GANGS, DUELISTS, DUEL_ABILITIES, abilityOf, makeFoe, gangStrength, stackChance, heal, canCash, fightOver, parOf, LAST_ACT, ROMAN, PARTNERS, OBJECTIVES, BOSS, BOSS_POOL, CALLS, chooseCall, BUFFS, ENH, CURSES, EVENTS, PAY, MAPSHAPE, ROOMS, RAFFLE, genMap, node: mapNode, reachable, floorOf, KIND_NAME, KIND_BY_ACT, kindName, PLACE, BANK, HOLDUP, holdup, bankBounty, bankTake, bankShare, WATER, shuntable, BOUNTY, foeHp, bountyOf, TOWN, REST, restOf, ACT2, ACT3, CASH, runSummary, KITTY, kittyOf, forgeable, removable, GLASS_WINS, ENH_PRICE, REROLL, TONIC,
    TAUNTS, taunt, cardPrice, releasePrice, polishable, enhanceable, claimable, freeBuffs, cantTake, TABLE_RULES, RULE_POOL, ruleOf, sees, SHOP, freshDeal, sleeveSwap, stock, restockPrice, MANNERS, WANTED, wantedFor, wants, dailySeed, dailyTwist, FAIR_GOODS, setQuick, floorsFor, CHASE, chaseRide, CONTEST, RIBBON, ribbonOf, EXPRESS, SIDE, genThreeTrains, DRIVER, COUNTER, makeDriver, ROSTER, partnerOpen, voice, STANDARD, standardFoe, newStandard,
    newRun, startLevel, whoseMove, act, aiStep, next, autoLevel, aiFallback, track, trackHand, coach, has };
  if (node) module.exports = api;
  else root.BtpRun = api;
})(typeof window !== 'undefined' ? window : this);
