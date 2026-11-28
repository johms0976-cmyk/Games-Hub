/* scenes/gate.js: STORY-PLAN.md [1.2]-[1.3], the gate of Euchre-ka!, as a beat list for btp-scene.js, played ON THE
   MAP (2026-11-10, the user's: after the opening "ride up the road here and stop out by the Sheriff and then the
   interaction should happen here. Someone should stop you from entering the town").

   REWRITTEN 2026-11-13, twice, to the user's notes ("doesn't quite make sense"; Pettibone tougher, the straight man
   of a comedy act, never "sir" to you; undercover as an inmate, no badge, no Marshal; the stamp is the cover; the
   player types their name into the ledger; the deadline said plainly; no cards at the gate; their own words for the
   guns and for the gates closing on "A dead man, sir."). Then WORKSHOPPED by the writers' room, 2026-11-16, at the
   user's ask, and built from its draft two (docs/writers-room/gate/DRAFT-2.md) on the user's "Yes, build it", with
   the room's recommended answers to its five questions.

   What the room changed: the offer comes whole (price, alive, the Gazette's man at sun-up) and so do the odds ("You'd
   be the fourth hunter" / "In. In. And in.") before your answer, so your yes knows both; "You've got an army" comes
   after it and runs straight into the stamp, so the stamp follows its reason; the catch is sprung once, as the
   answer to "I'm stuck in there?", with Pettibone's "Miss sun-up, and you're an inmate." the last word and INMATE
   held over you until the hat comes round; Pettibone stops explaining things to you (he corrects the Sheriff, gives
   you orders, talks about you) and is harder by saying less; you hold out a hand for the stamp yourself (an answer
   that is done, not said); a crash of glass, not an explosion, so nothing argues with "Everyone in there is"; the
   saying is "digging for daylight with a spoon". The room's rule, learnt the hard way: moving a fact helped every
   time, adding a trick never did.

   The staging: the gates are shut; you come up the road through the siege camp; Pettibone steps into the road under
   DANGER! DO NOT ENTER; the Sheriff strolls over and faces front (the voters), never quite at you; things go up over
   heads; the choices are a dock at the screen's foot; then the law steps aside, the gates slide open, you ride in to
   where the map has you start, and they close. Riding up the map you are seen from behind. The lines are the plan's,
   word for word (tests/scenes.js checks); the player splits any balloon over its limit at a full stop.

   BTP_SCENES.gate(ctx) builds the scene for one visit. ctx: art(file) -> url; marks (btp-euchreka.js MARKS, art
   pixels on the map) and sprites (art/euchreka/sprites.js: the cast's walk strips); rider { img, w, h, ay, frames }
   (the opening's own rider) and pal (your partner's rider strip, or null on Biscuit); partner (their id: horse, nan,
   showboat, sharp, quiet; worked out from pal when missing); name (yours, once this story knows it: then nobody
   asks) and suggest (the name you gave last story, to start the field with); buff { id, name, text, sher } or null
   (the one confiscated buff, with the Sheriff's wrong description); elixirs [{ name, text }]; greet (which replay
   greeting, 0-2); won (a story has been won: the Sheriff's "I'm sure I paid you"); lost (your last story was lost:
   the short cut's "Still not crossed off"). */
(function (root) {
  'use strict';
  const GREET = ['Ah! A voter! …Oh, it’s you. Still a voter?', 'Back again? I’ll put you down as a regular.', 'Have I kissed you? I kiss a lot of babies.'];
  const NAME_MAX = 12;
  /* Your partner's two lines (STORY-PLAN [1.2] beats 4 and 5): on the three hunters who went in before you, and on
     being stamped. The Quiet One says nothing: a stage direction for the Script, and something to watch. Nobody says
     "partner" at the gate (it's kept for the story's end). */
  const PARTNER = {
    horse: { name: 'BISCUIT', three: 'Three went in. Nobody’s mentioned their horses.', hand: 'Hoof.',
      stamp: 'INMATE. For the record, I’m the honest one.' },
    nan: { name: 'NAN', three: 'Three went in, dear. That’s three good coats going spare.', hand: 'And yours.',
      stamp: 'Mind the knuckles, dear. …INMATE. Well. It’s been said before.' },
    showboat: { name: 'SHOWBOAT', three: 'Three opening acts, folks. And now, the headliner.', hand: 'And yours.',
      stamp: 'Bigger letters! It has to read from the back row.' },
    sharp: { name: 'THE SHARP', three: 'Three in, none out. Nil from three. …Small sample.', hand: 'And yours.',
      stamp: 'County ink. Nine dollars a bottle. Odd, for a disguise.' },
    quiet: { name: 'THE QUIET ONE', quiet: true,
      three: 'The Quiet One counts three on one hand. Then holds up a fourth finger, at you.',
      stamp: 'The Quiet One already has a hand out.', thanks: 'Most people argue.' }
  };

  function gate(ctx) {
    const A = f => ctx.art(f), M = ctx.marks, SP = (ctx.sprites && ctx.sprites.a) || {}, R = ctx.rider || { img: 'stage', w: 40, h: 34, ay: 32, frames: 4 };
    const icon = n => A('euchreka/i_' + n + '.webp');
    // a walker: front, right and left strips (bakery/euchreka_px.py)
    const folk = (key, short, at) => {
      const v = {};
      ['m', 'r', 'l'].forEach(f => { const d = (SP[key] || {})[f] || [22, 30, 11, 27]; v[f] = { img: A('euchreka/a_' + f + '_' + key + '.webp'), w: d[0], h: d[1], ax: d[2], ay: d[3], frames: 4 }; });
      return { short, views: v, at, face: 'm' };
    };
    // a rider: the opening's own side-on strip, and (bakery/riders_up.py) the same rider from behind, for riding up
    // the map: "ride in facing toward the prison no riding side on" (the user's, 2026-11-10)
    // (and side on the map's own big-headed strip, ride_<who>.webp, before the opening's)
    const UPS = (ctx.sprites && ctx.sprites.u) || {}, SIDES = (ctx.sprites && ctx.sprites.r) || {};
    const rider = (img, who, short, at, warm) => {
      const sd = SIDES[who], u = UPS[who];
      const side = sd ? { img: A('euchreka/ride_' + who + '.webp'), w: sd[0], h: sd[1], ax: sd[2], ay: sd[3], frames: 4 }
        : { img: A('title/' + img + '.webp'), w: R.w, h: R.h, ax: R.w / 2, ay: R.ay, frames: R.frames || 4 };
      const views = { r: side };
      if (u) views.u = { img: A('euchreka/up_' + who + '.webp'), w: u[0], h: u[1], ax: u[2], ay: u[3], frames: 4 };
      return { short, rider: true, warm, views, at, face: u ? 'u' : 'r', headY: 2 };
    };
    const pid = ctx.pal ? ctx.pal.replace(/^ride_/, '') : 'horse';
    const PA = PARTNER[ctx.partner] || PARTNER[pid] || PARTNER.horse;
    const below = [M.halt[0], M.foot + 36], belowPal = [M.pal[0], M.foot + 70];
    // the gate's two doors (bakery/gate_leaves_px.py), shut until you ride in: things, not people
    const GT = M.gates || { w: 23, h: 35, y: M.gy + 1, shut: [71, 94], open: [48, 117] };
    const leaf = (key, x) => ({ short: 'THE GATE', prop: true, img: A('euchreka/' + key + '.webp'), w: GT.w, h: GT.h, ax: 0, ay: GT.h - 1, at: [x, GT.y] });
    const cast = {
      sher: folk('Ksher', 'SHERIFF HARDCASTLE', M.sher),
      pet: folk('Jpet', 'DEPUTY PETTIBONE', M.pet),
      you: Object.assign(rider(R.img, 'you', 'YOU', below, true), { var: 'name' }),
      gl: leaf('gate_l', GT.shut[0]), gr: leaf('gate_r', GT.shut[1])
    };
    // your partner rides a length behind you; Biscuit is the horse under you, a voice from the saddle
    if (ctx.pal) cast.pal = rider(ctx.pal, pid, PA.name, belowPal);
    else cast.bis = { short: PARTNER.horse.name, on: 'you', dx: 5, dy: 13 };
    const P = ctx.pal ? 'pal' : 'bis', PON = ctx.pal ? 'pal' : 'you';        // who speaks for your partner, and where they are
    // the two of you move together, your partner a length behind
    const ride = (to, palTo, ms, ease) => [{ go: 'you', to, ms, ease }].concat(ctx.pal ? [{ go: 'pal', to: palTo, ms, ease }] : []);
    const gy = M.gy, UP = 3400;
    const camp = M.camp || [44, gy + 236], mouth = [M.halt[0], gy - 40];
    const palStamp = [M.pal[0] + 22, M.pal[1] + 2];
    const book = { raise: 'pet', img: icon('buff_ledger'), hold: 850 };
    const doors = (how, ms) => [{ go: 'gl', to: [GT[how][0], GT.y], ms, ease: 'inout' }, { go: 'gr', to: [GT[how][1], GT.y], ms, ease: 'inout' }];

    // your partner's say, or (the Quiet One) what they do
    const partnerThree = PA.quiet ? [{ dir: PA.three }, { emote: PON, text: '…', ms: 700 }, { hop: PON, h: 1 }, { hold: 350 }] : [{ say: P, text: PA.three }];
    const partnerStamp = (ctx.pal ? [{ go: 'pet', to: palStamp, ms: 700, face: 'l' }] : []).concat(
      PA.quiet ? [{ dir: PA.stamp }, { emote: PON, text: '…', ms: 500 }] : [{ say: 'pet', text: PA.hand }],
      [{ sfx: 'KA-CHUNK', on: PON, dy: -14, shake: 2, stop: 100 }, { raise: PON, text: 'INMATE', cls: 'inmate', hold: 700 }],
      PA.quiet ? [{ say: 'pet', text: PA.thanks }] : [{ say: P, text: PA.stamp }],
      ctx.pal ? [{ go: 'pet', to: M.stamp, ms: 700, face: 'l' }] : []);
    // the ledger: Pettibone asks, you type it, you say it
    const askName = id => [
      { id: id + 'a', steps: [{ say: 'pet', text: 'Name. For the ledger.' }] },
      { id, dir: 'Pettibone holds his pen over the ledger.', input: { key: 'name', max: NAME_MAX, cam: M.halt[1], value: ctx.suggest || '',
        prompt: 'Pettibone holds his pen over the ledger. Your name?', label: 'Your name, for the ledger', button: 'Sign',
        hint: 'Twelve letters at most. It’s what the game will call you.', wrote: 'You give your name for the ledger:' } },
      { id: id + 'c', steps: [{ say: 'you', text: '{name}.' }] }];

    const b = ctx.buff, els = ctx.elixirs || [];
    const pick = last => ({
      cam: M.halt[1],
      prompt: 'Pick one to look at it',
      hint: 'Take one. Tap a tag to hear what it is.',
      options: [
        b ? { id: 'buff', label: b.name, take: 'Take the ' + b.name, icon: A('goods/buff_' + b.id + '.webp'), rules: b.text, steps: [
          { raise: 'sher', img: icon('buff_' + b.id), keep: true },
          { say: 'sher', text: b.sher },
          { say: 'pet', topper: true, text: b.text }] }
          : { id: 'buff', label: 'Nothing left on the shelf', take: '', off: true, rules: '', steps: [] },
        { id: 'elixirs', label: 'Two bottles of evidence', take: 'Take the bottles', icon: A('goods/tonic.webp'),
          rules: els.map(x => x.name + ': ' + x.text.replace(/\.$/, '')).join('. ') + (els.length ? '.' : ''), steps: [
          { raise: 'sher', img: icon('tonic'), keep: true },
          { say: 'sher', text: 'Two bottles of evidence. I’ve tested them thoroughly.' },
          { say: 'pet', topper: true, text: 'That one was full this morning, sir.' }] },
        // (the room's question 5, answered with its recommendation: the lucky card stays as built. It's a joke about
        // the Sheriff, not about how fights work, and [3.6b] pays off the word "card")
        { id: 'upgrade', label: 'His lucky card', take: 'Take the lucky card', icon: A('goods/marked.webp'),
          rules: 'Pick an enhancement and put it on one of your cards.', steps: [
          { raise: 'sher', img: icon('marked'), keep: true },
          { say: 'sher', text: 'My lucky card. It’s never lost.' },
          { say: 'pet', topper: true, text: 'He’s never played it.' }] }],
      /* It's yours (the user's own beat, 2026-11-13): "Remember son, Sun-up. Both Twins. And your Freedom." The law
         steps out of the road, the gates open, you ride in under the sign to where the map has you start, and they
         slowly close behind you, over "who was that?" / "A dead man, sir." Then they shut. */
      after: [{ give: 'sher', to: 'you', ms: 450, hold: 450 }].concat(
        last ? [{ say: 'sher', text: 'Remember, son. Sun-up. Both Twins. And your freedom.' }] : [],
        [{ all: [{ go: 'pet', to: M.pet, ms: 800, face: 'm' }, { go: 'sher', to: M.sher, ms: 800, face: 'm' }] },
          { all: doors('open', 1100).concat([{ sfx: 'CREEEAK', at: mouth, small: true }]) },
          { all: ride(M.start, M.palStart, 2300, 'inout').concat([{ cam: M.start[1], at: 0.62, ms: 2300 }]) },
          // inside, they turn side on: how the map draws them standing there
          { face: 'you', to: 'r' }], ctx.pal ? [{ face: 'pal', to: 'r' }] : [],
        last ? [{ all: doors('shut', 5200).concat([{ seq: [{ hold: 500 }, { say: 'sher', text: 'Splendid! …Pettibone, who was that?' }, { say: 'pet', topper: true, text: 'A dead man, sir.' }] }]) }]
          : [{ all: doors('shut', 1400) }],
        [{ sfx: 'THUD', at: mouth, shake: 2, stop: 80 }, { hold: 350 }])
    });
    const greet = ctx.won ? [{ say: 'sher', text: 'You again? I’m sure I paid you.' }, { say: 'pet', topper: true, text: 'Scrip, sir.' }]
      : [{ say: 'sher', text: GREET[(ctx.greet || 0) % GREET.length] }];

    return {
      id: 'gate', tags: '[1.2]-[1.3]', title: 'The gate of Euchre-ka!', cast,
      vars: ctx.name ? { name: ctx.name } : {},
      stateLabels: { job: 'the job: both Twins, at this gate at sun-up', stamp: 'INMATE on your hand (your cover)', guns: 'guns: evidence' },

      first: [
        /* 1. WHY YOU CAME. The gates are shut. You come up the road through the siege camp, the camera with you;
           Pettibone steps out and stops you; you show him the poster; he turns his back on you to call the Sheriff. */
        { id: 'G01', dir: 'EXT. THE ROAD TO EUCHRE-KA!, THROUGH THE SIEGE CAMP. SUNSET. The gates are shut. You ride up. Deputy Pettibone steps into the road.', steps: [
          { cam: 'foot' }, { hold: 450 },
          { all: ride(M.halt, M.pal, UP, 'out').concat([
            { cam: gy, at: 0.4, ms: UP },
            { seq: [{ hold: 150 }, { note: camp, text: 'Day four hundred. Siege is going great.', ms: 1500 }] },
            { seq: [{ hold: 1300 }, { note: M.lookout, text: 'Got eyes on a suspect. It’s you.', ms: 1700 }] },
            { seq: [{ hold: 1500 }, { emote: 'pet', text: '!', ms: 450 }, { go: 'pet', to: M.block, ms: 750, face: 'm' }] }]) },
          { sfx: 'WHOA!', on: 'you', dy: -14, shake: 1 },
          { say: 'pet', text: 'Hold it. Nobody goes in.' }] },
        { id: 'G01b', dir: 'You hold up a poster: WANTED, THE TWINS.', steps: [
          { all: [{ raise: 'you', text: 'WANTED: THE TWINS', cls: 'wanted', hold: 2700 }, { seq: [{ hold: 600 }, { say: 'you', text: 'I’m here for the Twins.' }] }] },
          { say: 'pet', text: 'Another one.' },
          { dir: 'He turns his back on you, to the camp.' }, { face: 'pet', to: 'r' },
          { say: 'pet', text: 'Sheriff! Your poster’s caught something.' }] },
        { id: 'G02', dir: 'Sheriff Hardcastle, shaking hands with nobody, sees you.', steps: [
          { emote: 'sher', text: '!', ms: 450 }, { all: [{ go: 'sher', to: M.talk, ms: 800, face: 'm' }, { face: 'pet', to: 'm' }] }, { hop: 'sher' },
          { say: 'sher', text: 'Ah! A voter!' }] },
        { id: 'G03', steps: [{ say: 'you', text: 'Bounty hunter.' }, { hold: 300 }] },
        { id: 'G04', steps: [{ say: 'sher', text: 'Even better. Voters want roads.' }, { say: 'pet', topper: true, text: 'This one wants paying, sir.' }] },

        /* 2. THE TOWN. */
        { id: 'G05', steps: [
          { say: 'you', text: 'Where are the Twins?' },
          { say: 'sher', text: 'In there! Euchre-ka! The safest town in Bower County.' },
          { say: 'sher', text: 'The gold ran out and everybody left.' },
          { say: 'sher', text: 'So I walled it in and put every crook in the county inside.' },
          { emote: 'sher', text: '♪', ms: 500 },
          { say: 'sher', text: 'Crime’s down a hundred percent.' }] },
        { id: 'G06', dir: 'Glass breaks, somewhere in town.', steps: [
          { sfx: 'CRASH!', at: [M.halt[0], gy - 66], shake: 1, stop: 80 },
          { all: [{ emote: 'sher', text: '!', ms: 600 }, { emote: 'pet', text: '!', ms: 600 }, { emote: 'you', text: '!', ms: 600 }] },
          { say: 'sher', text: '…Pettibone, what was that?' },
          { say: 'pet', topper: true, text: 'Crime, sir.' },
          { say: 'sher', text: 'Inside the wall! Doesn’t count.' }] },

        /* 3. THE TWINS, AND WHY NOW. The fact first: they broke in. The Sheriff knows; it's why the poster is up. */
        { id: 'G06b', steps: [
          { say: 'you', text: 'They’re already in prison.' },
          { hop: 'sher', h: 3 },
          { say: 'sher', text: 'They broke in! Nobody breaks into a bad prison.' },
          { dir: 'Pettibone holds up the ledger.' }, book,
          { say: 'pet', text: 'Not by my gate, or they’d both be in the ledger.' },
          { say: 'sher', text: 'And now they *run* it. That’s not prison. That’s office.' },
          { say: 'pet', topper: true, text: 'It’s a saloon, sir. Top of the street.' },
          { say: 'sher', text: 'Election’s coming, and the Gazette asks who runs my prison.' }] },

        /* 4. THE OFFER, THE ODDS, AND YOUR ANSWER. The whole offer (price, alive, the Gazette's man at sun-up), then
           the three who went in before you, then your partner, then you answer. */
        { id: 'G07', steps: [
          { say: 'sher', text: 'I want them out. In a proper cell. In a photograph. With me.' },
          { say: 'sher', text: 'A thousand gold for the pair.' },
          { say: 'sher', text: 'Alive, mind. They’ve got to stand up in the photograph.' },
          { say: 'sher', text: 'The Gazette’s man gets here at sun-up. One photograph.' },
          { say: 'sher', text: 'You, me and two Twins. Mostly me.' }] },
        { id: 'G07c', dir: 'Pettibone, without looking up from the ledger.', steps: [
          { say: 'pet', text: 'You’d be the fourth hunter through this gate.' },
          { say: 'you', text: 'The other three?' },
          { dir: 'He turns three pages.' }, book,
          { say: 'pet', text: 'In. In. And in.' }] },
        { id: 'G07d', dir: 'Your partner, on the three.', steps: partnerThree },
        { id: 'G08a', ask: { cam: M.halt[1], prompt: 'The Sheriff is waiting. What do you say?', options: [
          { id: 'deal', label: 'A thousand. Paid at this gate.', steps: [] },
          { id: 'two', label: 'Two thousand.', steps: [
            { hop: 'sher' }, { say: 'sher', text: 'Done! Two thousand!' },
            { say: 'pet', topper: true, text: 'The county has one thousand, sir.' },
            { say: 'sher', text: 'One thousand, then. And a firm handshake.' },
            { say: 'you', text: 'Paid at this gate.' }] },
          { id: 'no', label: 'No.', again: true, steps: [
            { say: 'sher', text: 'A yes! I heard a yes. Pettibone, did you hear a yes?' },
            { say: 'pet', topper: true, text: 'It was no, sir.' },
            { say: 'sher', text: 'To a thousand gold? ‘No’ isn’t on the ballot. Ask again.' }] }] } },
        { id: 'G08b', steps: [
          { say: 'sher', text: 'In full! The minute they’re in the photograph.' },
          { say: 'pet', text: 'Sir, the county’s cash box is in—' },
          { say: 'sher', text: 'In *full*, Pettibone.' }, { set: 'job' }] },

        /* 5. WHY ONE STRANGER, AND HOW: THE STAMP. The reason, then the stamp, with your own hand held out. */
        { id: 'G09', steps: [
          { say: 'you', text: 'You’ve got an army.' },
          { say: 'pet', text: 'Thirty-one deputies. Thirty awake.' }, { emote: M.sleeper, text: 'Zzz', ms: 900 },
          { say: 'sher', text: 'Send thirty and I’m at the back of my own photograph.' },
          { say: 'pet', text: 'Thirty badges get as far as the first corner.' },
          { say: 'pet', text: 'One more crook, nobody looks twice.' },
          { say: 'you', text: 'So I go in a crook.' },
          { dir: 'Pettibone looks you over, boots to hat. A beat too long.' }, { hold: 900 },
          { say: 'pet', text: 'You’ll pass.' }] },
        { id: 'G11', dir: 'Pettibone comes round to your horse with his stamp.', steps: [
          { go: 'pet', to: M.stamp, ms: 900, face: 'l' },
          { say: 'pet', text: 'Hand.' }] },
        { id: 'G11h', ask: { cam: M.halt[1], prompt: 'Pettibone is waiting.', options: [{ id: 'hand', label: 'Hold out a hand', do: true, steps: [] }] } },
        { id: 'G11a', dir: 'You hold out your left.', steps: [
          { say: 'pet', text: 'Left? Suit yourself.' },
          { hop: 'pet', h: 2 }, { hop: 'pet', h: 4 },
          { sfx: 'KA-CHUNK', on: 'you', dy: -14, shake: 2, stop: 100 },
          { raise: 'you', text: 'INMATE', cls: 'inmate', hold: 900 }, { set: 'stamp' },
          { say: 'you', text: 'It says inmate.' },
          { say: 'pet', text: 'So does every man in there. No stamp, and they smell law.' },
          { say: 'sher', text: 'Genuine county ink! A disguise that never slips.' }] },
        { id: 'G11c', dir: 'Your partner is stamped too.', steps: partnerStamp }
      ].concat(
        /* 6. THE LEDGER: your name. The player types it; the game calls them by it from here on. */
        askName('G13'),
        [{ id: 'G13b', dir: 'He writes it. He stops, and looks at you.', steps: [
          book, { emote: 'pet', text: '…', ms: 700 },
          { say: 'pet', text: 'You been through this gate before?' },
          { say: 'you', text: 'Never.' },
          { say: 'pet', text: 'No. You’d be in the ledger.' },
          { dir: 'Under your name, he writes your partner’s.' }, book,
          { say: 'pet', text: 'Everyone in, I write down. Everyone out, I cross off.' },
          { say: 'you', text: 'Many crossed off?' },
          { say: 'pet', text: 'You’d be the first.' },
          // he tries: the open ledger held out to a Sheriff who is shaking hands with nobody (twist one, unasked)
          { dir: 'He holds the open ledger out to the Sheriff, who is shaking hands with nobody. He shuts it.' },
          { all: [{ raise: 'pet', img: icon('buff_ledger'), hold: 1100 }, { face: 'sher', to: 'r' }] },
          { sfx: 'THUMP', on: 'pet', small: true }, { face: 'sher', to: 'm' },
          { say: 'pet', text: 'Nobody asks the ledger.' }] },

        /* 7. THE CATCH, sprung once. In the story only: nothing in the game counts down. */
        { id: 'G13d', steps: [
          { say: 'sher', text: 'Be at this gate at sun-up, with both Twins, and it opens.' },
          { say: 'pet', topper: true, text: 'Once.' },
          { say: 'sher', text: 'If you’re not, well…', append: ' you’re digging for daylight with a spoon.', after: 700 },
          { say: 'you', text: 'I’m stuck in there?' },
          { dir: 'You look at your hand.' }, { hold: 500 },
          { say: 'pet', text: 'That ink doesn’t wash off.' },
          { say: 'you', text: 'You tell me that now?' },
          { say: 'sher', text: 'I always read out the small print. Afterwards.' },
          { dir: 'Pettibone opens the ledger and reads it off the page.' }, book,
          { say: 'pet', text: '{name}. Stamped. In the ledger.' },
          { say: 'pet', text: 'Miss sun-up, and you’re an inmate.' },
          // nobody speaks; INMATE goes up over you again, and stays there until the hat comes round
          { dir: 'Nobody speaks. INMATE goes up over your head again.' },
          { raise: 'you', text: 'INMATE', cls: 'inmate', keep: true }, { hold: 1500 }] },

        /* 8. THE TOLL. The coin takes INMATE's place over your head. */
        { id: 'G14', dir: 'Pettibone holds out his hat.', steps: [
          { say: 'pet', text: 'Gate toll. Twenty-five cents.' },
          { sfx: 'CLINK', on: 'pet', small: true }, { raise: 'you', text: '25¢', cls: 'coin', hold: 700 },
          { say: 'pet', text: 'Out’s free.' }] },

        /* 9. YOUR GUNS (the user's words). */
        { id: 'G15', dir: 'Your guns.', steps: [
          { go: 'pet', to: M.block, ms: 900, face: 'm' },
          { say: 'sher', text: 'Now, hand over your guns.' },
          { say: 'you', text: 'I go in unarmed?' },
          { say: 'pet', text: 'It’s a prison. Everyone in there is.' },
          { sfx: 'CLUNK', on: 'you', small: true }, { raise: 'you', img: icon('gunhand'), hold: 800 }, { set: 'guns' }] },

        /* 10. THE EVIDENCE SHELF, then in you go (the user's words). */
        { id: 'G18', steps: [
          { say: 'sher', text: 'Now. Something off the evidence shelf.' },
          { say: 'sher', text: 'Take one.' }, { say: 'sher', text: 'Trials are after the election.' }] },
        { id: 'G19', choice: pick(true) }]),

      // the replay cut: the ride up (shorter), a greeting, the terms, your name if the game doesn't know it yet, the
      // stamp, "Take one.", the pick, and in through the gates
      fast: [
        { id: 'F1', dir: 'EXT. THE GATE OF EUCHRE-KA! SUNSET. Again.', steps: [
          { cam: 'foot' }, { go: 'pet', to: M.block, ms: 0, face: 'm' }, { go: 'sher', to: M.talk, ms: 0, face: 'm' }, { hold: 300 },
          { all: ride(M.halt, M.pal, 1900, 'out').concat([{ cam: gy, at: 0.4, ms: 1900 }]) }].concat(greet,
          [{ say: 'sher', text: 'Same terms. Both Twins. This gate, at sun-up. A thousand gold.' }, { set: 'job' }]) }
      ].concat(ctx.name ? [] : askName('F1n'), [
        { id: 'F2', dir: 'Hand stamped, guns taken.', steps: [
          { raise: 'you', text: 'INMATE', cls: 'inmate', hold: 450 }, { set: 'stamp' }, { set: 'guns' },
          ctx.lost ? { say: 'pet', text: '{name}. Still not crossed off.' } : { say: 'pet', text: 'Miss sun-up, and you’re an inmate.' }] },
        { id: 'F3', steps: [{ say: 'sher', text: 'Take one.' }] },
        { id: 'G19', choice: pick(false) }
      ])
    };
  }
  gate.GREET = GREET;
  gate.PARTNER = PARTNER;
  gate.NAME_MAX = NAME_MAX;
  /* Which script the first cut plays: the date of the draft it is built from (the writers' room's DRAFT-2, built
     2026-11-16). The page keeps the version a player watched to its pick (profile.scenes.gate) and plays the short cut
     only to someone who has seen THIS one, so a rewrite is seen in full once. (2026-11-28, the user: "The game seems to
     be on an old version of the script": the flag was a plain true, set by the 2026-11-09 film, so anyone who had
     watched an older gate got the short cut ever after and never saw the rewrite.) Change it whenever the first
     cut's lines change. */
  gate.VERSION = '2026-11-16';
  root.BTP_SCENES = root.BTP_SCENES || {};
  root.BTP_SCENES.gate = gate;
})(typeof window !== 'undefined' ? window : globalThis);
