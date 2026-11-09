/* scenes/gate.js: STORY-PLAN.md [1.2]-[1.3], the Marshal's gatehouse, as a shot list for btp-scene.js (the scene
   bible's first FILM, 2026-11-09). The lines are the plan's (step 1c); the player splits any balloon over its limit
   at a full stop. Shot ids follow the storyboard artist's G01-G19 (docs/film-crew/round1/storyboard-artist.md).
   Positions are art pixels: the gate plate is 200x112 and a figure 40x56, measured from the files. A shot's cam z
   is a whole multiple of fit (z2 = fit): z3 medium, z4-5 close, inserts their own.

   BTP_SCENES.gate(ctx) builds the scene for one visit. ctx: art(file) -> url; buff { id, name, text, sher } or null
   (the one confiscated buff, with the Sheriff's wrong description); elixirs [{ name, text }]; greet (which replay
   greeting, 0-2); won (a story has been won: the Sheriff's "I'm sure I paid you"). */
(function (root) {
  'use strict';
  const GREET = ['Ah! A voter! …Oh, it’s you. Still a voter?', 'Back again? I’ll put you down as a regular.', 'Have I kissed you? I kiss a lot of babies.'];

  function gate(ctx) {
    const A = f => ctx.art(f);
    const r = (x, y, w, h, c, front) => ({ x, y, w, h, c, front });
    // a shape in art pixels with a one-pixel outline: every outline first, then the fills
    const outlined = (rs, oc, fc) => rs.map(a => r(a[0] - 1, a[1] - 1, a[2] + 2, a[3] + 2, oc)).concat(rs.map(a => r(a[0], a[1], a[2], a[3], fc)));
    // the Sheriff's podium, a front strip: it cuts him at the waist (rule 3) and puts RE-ELECT behind his head
    const PODIUM = [r(33, 67, 50, 6, '#3a2414'), r(35, 70, 46, 42, '#3a2414'), r(36, 71, 44, 41, '#8a5a32'), r(34, 68, 48, 4, '#5a3a22'),
      r(36, 74, 44, 3, '#b8322a'), r(36, 77, 44, 2, '#f4ecd8'), r(36, 79, 44, 3, '#2e4a8a'), r(36, 92, 44, 1, '#6a4224'), r(36, 103, 44, 1, '#6a4224')]
      .map(x => Object.assign(x, { front: true }));
    const COAT = '#3b322e', STRIPES = n => Array.from({ length: n }, (_, i) => r(0, 6 + i * 8, 200, 2, '#2f2724'));
    // the back of your hand over your coat (a stand-in until the prop sheet's hand is baked)
    const HAND = [r(78, 0, 122, 100, COAT), r(78, 0, 2, 100, '#241c19'), r(30, 74, 46, 30, '#2f2724')]
      .concat(outlined([[36, 50, 34, 26], [37, 34, 7, 18], [45, 31, 7, 21], [53, 32, 7, 20], [61, 36, 7, 16], [68, 56, 12, 8]], '#5a3a2a', '#f0c49a'));
    // Pettibone's stamp: the glove's stamp face (15,60) lands on (53,63)
    const STAMP = [
      { prop: 'glove', img: A('paid/glove_stamp.webp'), w: 140, h: 125, x: 38, y: 3, from: -110, ms: 150, ease: 'in' },
      { sfx: 'KA-CHUNK', x: 34, y: 18, shake: 2, stop: 120 },
      { move: 'glove', dy: -130, ms: 240, gone: true },
      { prop: 'mark', text: 'INMATE', cls: 'inmate', x: 53, y: 63, size: 7 },
      { set: 'stamp' }];
    const SHER = (z, dx) => ({ on: 'sher', dx: dx || 0, z }), PET = z => ({ on: 'pet', dx: -10, z }), WIDE = { x: 100, z: 2 };

    const b = ctx.buff, els = ctx.elixirs || [];
    const PICK = {
      shot: { plate: 'gate', cam: { x: 104, z: 3 } },
      prompt: 'Pick one to look at it',
      hint: 'Take one. Tap a tag to hear what it is.',
      options: [
        b ? { id: 'buff', label: b.name, take: 'Take the ' + b.name, icon: A('goods/buff_' + b.id + '.webp'), rules: b.text, steps: [
          { say: 'sher', text: b.sher },
          { say: 'pet', topper: true, text: b.text }] }
          : { id: 'buff', label: 'Nothing left on the shelf', take: '', off: true, rules: '', steps: [] },
        { id: 'elixirs', label: 'Two bottles of evidence', take: 'Take the bottles', icon: A('goods/tonic.webp'),
          rules: els.map(x => x.name + ': ' + x.text.replace(/\.$/, '')).join('. ') + (els.length ? '.' : ''), steps: [
          { say: 'sher', text: 'Two bottles of evidence. I’ve tested them thoroughly.' },
          { say: 'pet', topper: true, text: 'That one was full this morning, sir.' }] },
        { id: 'upgrade', label: 'His lucky card', take: 'Take the lucky card', icon: A('goods/marked.webp'),
          rules: 'Pick an enhancement and put it on one of your cards.', steps: [
          { say: 'sher', text: 'My lucky card. It’s never lost.' },
          { say: 'pet', topper: true, text: 'He’s never played it.' }] }],
      // a cut on motion into play: the gate swings, and the riders go through it
      after: [{ card: 'CREEEAK…', then: 'SLAM!' }]
    };
    const greet = ctx.won ? [{ say: 'sher', text: 'You again? I’m sure I paid you.' }, { say: 'pet', topper: true, text: 'Scrip, sir.' }]
      : [{ say: 'sher', text: GREET[(ctx.greet || 0) % GREET.length] }];

    return {
      id: 'gate', tags: '[1.2]-[1.3]', title: 'The Marshal’s gatehouse', fitW: 200,
      cast: {
        sher: { short: 'SHERIFF HARDCASTLE', img: A('table/fig_gKsher.webp'), w: 40, h: 56, side: 'left' },
        pet: { short: 'DEPUTY PETTIBONE', img: A('table/fig_gJpet.webp'), w: 40, h: 56, side: 'right' },
        you: { short: 'YOU', w: 40, h: 56, warm: true }
      },
      plates: {
        gate: { img: A('table/wall_gate.webp'), w: 200, h: 112, bg: '#8cc4e4', clouds: { img: A('title/clouds.webp'), w: 320, h: 46 },
          actors: { sher: { x: 58, y: 84 }, pet: { x: 150, y: 112 } }, rects: PODIUM },
        coat: { w: 64, h: 64, bg: COAT, rects: STRIPES(8).concat([r(22, 0, 2, 64, '#241c19'), r(26, 22, 2, 2, '#c8a040'), r(26, 40, 2, 2, '#c8a040')]) },
        hand: { w: 120, h: 100, bg: '#d8b07c', rects: HAND },
        book: { img: A('paid/desk.webp'), w: 200, h: 270, bg: '#5a3a22' },
        crate: { w: 60, h: 60, bg: '#d8b07c', rects: [r(14, 50, 32, 3, '#b8925e')], imgs: [{ img: A('goods/crate.webp'), x: 17, y: 26, w: 26, h: 26 }],
          texts: [{ text: 'EVIDENCE', x: 30, y: 40, size: 4, cls: 'stencil' }] }
      },
      stateLabels: { badge: 'the Marshal’s badge', stamp: 'INMATE on your hand', guns: 'guns: evidence' },

      first: [
        { id: 'G01', dir: 'EXT. EUCHRE-KA!, THE MARSHAL’S GATEHOUSE. DAY. The gate clock has stopped.', plate: 'gate', cam: WIDE, steps: [{ hold: 1400 }] },
        { id: 'G02', plate: 'gate', cam: SHER(3), steps: [{ say: 'sher', text: 'Ah! A voter!' }] },
        { id: 'G03', plate: 'gate', cam: WIDE, brim: true, steps: [{ say: 'you', text: 'Bounty hunter.' }, { hold: 500 }] },
        { id: 'G04', plate: 'gate', cam: SHER(3), steps: [{ say: 'sher', text: 'Even better. You travel.' }] },
        { id: 'G05', plate: 'gate', cam: SHER(4, 12), steps: [
          { say: 'sher', text: 'Gold ran out, so I filled the town with every crook in the county.' },
          { pan: { x: 47 }, ms: 700 },
          { say: 'sher', text: 'Crime’s down a hundred percent.' }] },
        { id: 'G05r', plate: 'gate', cam: PET(4), brim: true, steps: [{ hold: 700 }] },                  // Pettibone's face
        { id: 'G06', plate: 'gate', cam: WIDE, steps: [{ sfx: 'BANG!', x: 100, y: 12, shake: 2, stop: 80, hold: 500 }] },
        { id: 'G06b', plate: 'gate', cam: PET(4), brim: true, steps: [
          { say: 'pet', text: 'The Twins let themselves in, sir.' }, { say: 'pet', text: 'Now they run it.' }] },
        { id: 'G07', plate: 'gate', cam: SHER(4), steps: [
          { say: 'sher', text: 'I’d go in myself, but I’ve a baby to kiss at four.' }] },
        // the siege (2026-11-09): thirty-one deputies outside, and he still sends one stranger
        { id: 'G07b', plate: 'gate', cam: PET(4), brim: true, steps: [
          { say: 'pet', text: 'We have thirty-one deputies, sir. Thirty awake.' }, { hold: 300 }] },
        { id: 'G07c', plate: 'gate', cam: SHER(4), steps: [
          { say: 'sher', text: 'Send thirty, it’s their photo. Send one, it’s mine.' }, { hold: 400 },
          { say: 'sher', text: 'I deputise you, Mr…', append: ' Voter.', after: 600 }] },
        { id: 'G08', dir: 'INSERT: the Marshal’s badge, pinned on your coat.', plate: 'coat', cam: { x: 40, cy: 28, z: 6 }, steps: [
          { prop: 'badge', img: A('goods/badge.webp'), w: 26, h: 26, x: 28, y: 14, from: -60, ms: 180, ease: 'in' },
          { sfx: 'CLINK', x: 50, y: 12, shake: 1, stop: 100 }, { set: 'badge' }, { hold: 700 }] },
        { id: 'G09', plate: 'gate', cam: PET(4), brim: true, steps: [{ say: 'pet', text: 'That’s the Marshal’s badge, sir.' }, { hold: 400 }] },
        { id: 'G10', plate: 'gate', cam: SHER(5), steps: [{ say: 'sher', text: 'Then don’t lose it.' }, { hold: 600 }] },
        { id: 'G11', dir: 'INSERT: the back of your hand. Pettibone’s stamp.', plate: 'hand', cam: { x: 62, cy: 58, z: 4 }, steps: STAMP.concat([
          { say: 'pet', text: 'Doesn’t wash off.' }]) },
        { id: 'G12', plate: 'gate', cam: PET(4), brim: true, steps: [{ say: 'pet', text: 'Name, for the book?' }] },
        // evidence I: the gate book. Your name goes in it, and the Sheriff talks over it
        { id: 'G13', dir: 'INSERT: the gate book. You tell him your name. We never hear it.', plate: 'book', cam: { x: 120, cy: 200, z: 4 }, steps: [
          { prop: 'pencil', img: A('paid/glove_pencil.webp'), w: 149, h: 124, x: 112, y: 160, fromX: 70, ms: 220 },
          { sfx: 'AHEM!', x: 100, y: 168, stop: 80 },
          { move: 'pencil', dx: 4, ms: 110 }, { move: 'pencil', dx: 1, ms: 110 }, { move: 'pencil', dx: 6, ms: 110 },
          { sfx: 'scritch scritch', small: true, x: 140, y: 236 },
          { move: 'pencil', dx: 3, ms: 110 }, { move: 'pencil', dx: 9, ms: 110 }, { hold: 600 }] },
        { id: 'G13b', plate: 'gate', cam: PET(4), brim: true, steps: [{ say: 'pet', text: 'Thank you.' }, { say: 'pet', text: 'Nobody asks the book.' }] },
        { id: 'G14', plate: 'gate', cam: PET(5), brim: true, steps: [
          { say: 'pet', text: 'Getting out’s impossible.' }, { hold: 400 },
          { say: 'pet', text: 'Getting in’s twenty-five cents.' }, { sfx: 'CLINK', x: 128, y: 102, shake: 1 }, { hold: 600 }] },
        { id: 'G15', dir: '[1.3] CONFISCATED AT THE GATE.', plate: 'gate', cam: SHER(3), steps: [
          { say: 'sher', text: 'Hand over your guns.' }, { say: 'sher', text: 'It’s all evidence.' }] },
        { id: 'G16', dir: 'INSERT: your guns go in the evidence crate.', plate: 'crate', cam: { x: 30, cy: 32, z: 6 }, steps: [
          { prop: 'gun', img: A('goods/gunhand.webp'), w: 26, h: 26, x: 18, y: 8, from: -60, ms: 200, ease: 'in' },
          { sfx: 'CLUNK', x: 46, y: 12, shake: 1, stop: 100 }, { set: 'guns' }, { hold: 600 }] },
        { id: 'G17', plate: 'gate', cam: PET(4), brim: true, steps: [{ say: 'pet', text: 'In there, sir, when a man says *draw*, he means a card.' }, { hold: 500 }] },
        { id: 'G18', plate: 'gate', cam: SHER(4), steps: [
          { say: 'sher', text: 'Take one.' }, { say: 'sher', text: 'Trials are after the election.' }, { tap: true }] },
        { id: 'G19', choice: PICK }
      ],

      // the replay cut: a greeting, the badge and the stamp in one insert, "Take one.", the pick (3-5 s)
      fast: [
        { id: 'F1', dir: 'EXT. THE MARSHAL’S GATEHOUSE. DAY. Again.', plate: 'gate', cam: SHER(3), steps: greet },
        { id: 'F2', dir: 'INSERT: badge pinned, hand stamped, guns taken.', plate: 'hand', cam: { x: 70, cy: 52, z: 4 }, steps: [
          { prop: 'badge', img: A('goods/badge.webp'), w: 26, h: 26, x: 80, y: 6, from: -50, ms: 140, ease: 'in' }, { sfx: 'CLINK', x: 94, y: 6 }, { set: 'badge' }]
          .concat(STAMP, [{ set: 'guns' }, { hold: 250 }]) },
        { id: 'F3', plate: 'gate', cam: SHER(4), steps: [{ say: 'sher', text: 'Take one.' }, { tap: true }] },
        { id: 'G19', choice: PICK }
      ]
    };
  }
  gate.GREET = GREET;
  root.BTP_SCENES = root.BTP_SCENES || {};
  root.BTP_SCENES.gate = gate;
})(typeof window !== 'undefined' ? window : globalThis);
