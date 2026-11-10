/* scenes/gate.js: STORY-PLAN.md [1.2]-[1.3], the gate of Euchre-ka!, as a beat list for btp-scene.js, played ON THE
   MAP (2026-11-10, the user's: after the opening "ride up the road here and stop out by the Sheriff and then the
   interaction should happen here. Someone should stop you from entering the town"). You come up the road through the
   siege camp; Pettibone steps into the road under DANGER! DO NOT ENTER and stops you; the Sheriff strolls over, faces
   front (the voters) and never quite at you; the badge, INMATE, the coin and your guns go up over your head; the pick
   is a dock at the screen's foot while the Sheriff holds each thing up; then Pettibone steps aside and you ride in
   under the sign, between the watchtowers, to where the map has you start. Riding up the map you are seen from
   behind (facing the prison), never side on. The lines are the plan's (the first cut's are checked against it,
   word for word); the player splits any balloon over its limit at a full stop. Beat ids keep the storyboard's G01-G19.

   BTP_SCENES.gate(ctx) builds the scene for one visit. ctx: art(file) -> url; marks (btp-euchreka.js MARKS, art
   pixels on the map) and sprites (art/euchreka/sprites.js: the cast's walk strips); rider { img, w, h, ay, frames }
   (the opening's own rider) and pal (your partner's rider strip, or null on Biscuit); buff { id, name, text, sher }
   or null (the one confiscated buff, with the Sheriff's wrong description); elixirs [{ name, text }]; greet (which
   replay greeting, 0-2); won (a story has been won: the Sheriff's "I'm sure I paid you"). */
(function (root) {
  'use strict';
  const GREET = ['Ah! A voter! …Oh, it’s you. Still a voter?', 'Back again? I’ll put you down as a regular.', 'Have I kissed you? I kiss a lot of babies.'];

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
    const below = [M.halt[0], M.foot + 36], belowPal = [M.pal[0], M.foot + 70];
    const cast = {
      sher: folk('Ksher', 'SHERIFF HARDCASTLE', M.sher),
      pet: folk('Jpet', 'DEPUTY PETTIBONE', M.pet),
      you: rider(R.img, 'you', 'YOU', below, true)
    };
    if (ctx.pal) cast.pal = rider(ctx.pal, ctx.pal.replace(/^ride_/, ''), 'YOUR PARTNER', belowPal);
    // the two of you move together, your partner a length behind
    const ride = (to, palTo, ms, ease) => [{ go: 'you', to, ms, ease }].concat(ctx.pal ? [{ go: 'pal', to: palTo, ms, ease }] : []);
    const gy = M.gy, UP = 3400;

    const b = ctx.buff, els = ctx.elixirs || [];
    const PICK = {
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
        { id: 'upgrade', label: 'His lucky card', take: 'Take the lucky card', icon: A('goods/marked.webp'),
          rules: 'Pick an enhancement and put it on one of your cards.', steps: [
          { raise: 'sher', img: icon('marked'), keep: true },
          { say: 'sher', text: 'My lucky card. It’s never lost.' },
          { say: 'pet', topper: true, text: 'He’s never played it.' }] }],
      // it's yours; the law steps out of the road, and you ride in under the sign to where the map has you start
      after: [
        { give: 'sher', to: 'you', ms: 450, hold: 450 },
        { all: [{ go: 'pet', to: M.pet, ms: 800, face: 'm' }, { go: 'sher', to: M.sher, ms: 800, face: 'm' }] },
        { all: ride(M.start, M.palStart, 2300, 'inout').concat([{ cam: M.start[1], at: 0.62, ms: 2300 }]) },
        // inside, they turn side on: how the map draws them standing there
        { face: 'you', to: 'r' }].concat(ctx.pal ? [{ face: 'pal', to: 'r' }] : [], [{ hold: 250 }])
    };
    const greet = ctx.won ? [{ say: 'sher', text: 'You again? I’m sure I paid you.' }, { say: 'pet', topper: true, text: 'Scrip, sir.' }]
      : [{ say: 'sher', text: GREET[(ctx.greet || 0) % GREET.length] }];

    return {
      id: 'gate', tags: '[1.2]-[1.3]', title: 'The gate of Euchre-ka!', cast,
      stateLabels: { badge: 'the Marshal’s badge', stamp: 'INMATE on your hand', guns: 'guns: evidence' },

      first: [
        // you come up the road through the siege camp, the camera with you; Pettibone steps out and stops you
        { id: 'G01', dir: 'EXT. THE ROAD TO EUCHRE-KA!, THROUGH THE SIEGE CAMP. DAY. You ride up to the gate. Deputy Pettibone steps into the road.', steps: [
          { cam: 'foot' }, { hold: 450 },
          { all: ride(M.halt, M.pal, UP, 'out').concat([
            { cam: gy, at: 0.4, ms: UP },
            { seq: [{ hold: 500 }, { note: M.lookout, text: 'Got eyes on a suspect. It’s you.', ms: 1700 }] },
            { seq: [{ hold: 1500 }, { emote: 'pet', text: '!', ms: 450 }, { go: 'pet', to: M.block, ms: 750, face: 'm' }] }]) },
          { sfx: 'WHOA!', on: 'you', dy: -14, shake: 1 },
          { say: 'pet', text: 'Hold it, sir. Nobody goes in.' }] },
        { id: 'G02', dir: 'Sheriff Hardcastle, shaking hands with nobody, sees you.', steps: [
          { emote: 'sher', text: '!', ms: 450 }, { go: 'sher', to: M.talk, ms: 800, face: 'm' }, { hop: 'sher' },
          { say: 'sher', text: 'Ah! A voter!' }] },
        { id: 'G03', steps: [{ say: 'you', text: 'Bounty hunter.' }, { hold: 300 }] },
        { id: 'G04', steps: [{ say: 'sher', text: 'Even better. You travel.' }] },
        { id: 'G05', steps: [
          { say: 'sher', text: 'Gold ran out, so I filled the town with every crook in the county.' },
          { emote: 'sher', text: '♪', ms: 500 },
          { say: 'sher', text: 'Crime’s down a hundred percent.' }] },
        { id: 'G06', dir: 'A gunshot in town.', steps: [
          { sfx: 'BANG!', at: [M.halt[0], gy - 66], shake: 2, stop: 80 },
          { all: [{ emote: 'sher', text: '!', ms: 600 }, { emote: 'pet', text: '!', ms: 600 }, { emote: 'you', text: '!', ms: 600 }] },
          { face: 'pet', to: 'r' },
          { say: 'pet', text: 'The Twins let themselves in, sir.' }, { say: 'pet', text: 'Now they run it.' }] },
        { id: 'G07', steps: [{ say: 'sher', text: 'I’d go in myself, but I’ve a baby to kiss at four.' }] },
        // the siege (2026-11-09): thirty-one deputies outside, and he still sends one stranger
        { id: 'G07b', steps: [
          { say: 'pet', text: 'We have thirty-one deputies, sir. Thirty awake.' }, { emote: M.sleeper, text: 'Zzz', ms: 900 }] },
        { id: 'G07c', steps: [
          { say: 'sher', text: 'Send thirty, it’s their photo. Send one, it’s mine.' }, { hold: 300 },
          { say: 'sher', text: 'I deputise you, Mr…', append: ' Voter.', after: 600 }] },
        { id: 'G08', dir: 'He pins the Marshal’s badge on you without looking.', steps: [
          { sfx: 'CLINK', on: 'you', small: true }, { raise: 'you', img: icon('badge'), hold: 900 }, { set: 'badge' }] },
        { id: 'G09', steps: [{ say: 'pet', text: 'That’s the Marshal’s badge, sir.' }, { hold: 300 }] },
        { id: 'G10', steps: [{ say: 'sher', text: 'Then don’t lose it.' }, { hold: 300 }] },
        { id: 'G11', dir: 'Pettibone comes round to your horse with his stamp. He can’t reach.', steps: [
          { go: 'pet', to: M.stamp, ms: 900, face: 'l' }, { hop: 'pet', h: 2 }, { hop: 'pet', h: 4 },
          { sfx: 'KA-CHUNK', on: 'you', dy: -14, shake: 2, stop: 100 },
          { raise: 'you', text: 'INMATE', cls: 'inmate', hold: 900 }, { set: 'stamp' },
          { say: 'pet', text: 'Doesn’t wash off.' }] },
        { id: 'G12', steps: [{ say: 'pet', text: 'Name, for the book?' }] },
        // evidence I: the gate book. Your name goes in it, and the Sheriff talks over it
        { id: 'G13', dir: 'You tell him your name. We never hear it.', steps: [
          { emote: 'you', text: '…', ms: 500, nowait: true }, { sfx: 'AHEM!', on: 'sher', dy: -14, stop: 80, hold: 600 }] },
        { id: 'G13b', steps: [{ say: 'pet', text: 'Thank you.' }, { say: 'pet', text: 'Nobody asks the book.' }] },
        { id: 'G14', dir: 'He holds out his hat.', steps: [
          { say: 'pet', text: 'Getting out’s impossible.' }, { hold: 300 },
          { say: 'pet', text: 'Getting in’s twenty-five cents.' },
          { sfx: 'CLINK', on: 'pet', small: true }, { raise: 'you', text: '25¢', cls: 'coin', hold: 700 }] },
        { id: 'G15', dir: '[1.3] CONFISCATED AT THE GATE.', steps: [
          { say: 'sher', text: 'Hand over your guns.' }, { say: 'sher', text: 'It’s all evidence.' },
          { sfx: 'CLUNK', on: 'you', small: true }, { raise: 'you', img: icon('gunhand'), hold: 800 }, { set: 'guns' }] },
        { id: 'G17', dir: 'Pettibone goes back to his place in the road.', steps: [
          { go: 'pet', to: M.block, ms: 900, face: 'm' }, { hop: 'pet' },
          { say: 'pet', text: 'In there, sir, when a man says *draw*, he means a card.' }] },
        { id: 'G18', steps: [{ say: 'sher', text: 'Take one.' }, { say: 'sher', text: 'Trials are after the election.' }] },
        { id: 'G19', choice: PICK }
      ],

      // the replay cut: the ride up (shorter), a greeting, the badge and the stamp, "Take one.", the pick
      fast: [
        { id: 'F1', dir: 'EXT. THE GATE OF EUCHRE-KA! DAY. Again.', steps: [
          { cam: 'foot' }, { go: 'pet', to: M.block, ms: 0, face: 'm' }, { go: 'sher', to: M.talk, ms: 0, face: 'm' }, { hold: 300 },
          { all: ride(M.halt, M.pal, 1900, 'out').concat([{ cam: gy, at: 0.4, ms: 1900 }]) }].concat(greet) },
        { id: 'F2', dir: 'Badge pinned, hand stamped, guns taken.', steps: [
          { raise: 'you', img: icon('badge'), hold: 450 }, { set: 'badge' },
          { raise: 'you', text: 'INMATE', cls: 'inmate', hold: 450 }, { set: 'stamp' }, { set: 'guns' }] },
        { id: 'F3', steps: [{ say: 'sher', text: 'Take one.' }] },
        { id: 'G19', choice: PICK }
      ]
    };
  }
  gate.GREET = GREET;
  root.BTP_SCENES = root.BTP_SCENES || {};
  root.BTP_SCENES.gate = gate;
})(typeof window !== 'undefined' ? window : globalThis);
