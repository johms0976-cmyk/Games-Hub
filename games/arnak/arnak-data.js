'use strict';
/* Lost Ruins of Arnak — the components.
 *
 * Every number in this file was READ, not recalled: the card costs, points,
 * travel icons and effects off the printed card faces the user's rules link
 * points at (yucata.de/en/Rules/Arnak and the plugin images behind it), the
 * sites, guardians and assistants off their tiles, and both boards — the dig
 * spaces, the discover costs and the whole of each research track — off the
 * two board images. The few things no picture shows (how many idols of each
 * kind are in the box, the eighteen research bonus tiles) were taken from a
 * published implementation of the game and checked against the art the rules
 * page uses: six kinds of idol, six kinds of bonus tile, each count adding up
 * to the box total. `tests/engine.js` pins all of it.
 *
 * The wording is not the publisher's. Every line of card text below is
 * written fresh, and the names of the sites, guardians and assistants — which
 * the printed tiles do not carry — are descriptions of their pictures.
 *
 * The engine reads effects from here and nowhere else. An effect is a list of
 * steps (see the key at the bottom); adding a card is data entry.
 */
(function (root) {

  const RES = ['coin', 'compass', 'tablet', 'arrowhead', 'jewel'];
  const RES_NAME = { coin: 'coin', compass: 'compass', tablet: 'tablet', arrowhead: 'arrowhead', jewel: 'jewel' };
  const RES_PLURAL = { coin: 'coins', compass: 'compasses', tablet: 'tablets', arrowhead: 'arrowheads', jewel: 'jewels' };
  /* Rough exchange value of each resource, used only by the house explorers
     and by the phone's "what does this cost me" hints. */
  const RES_VALUE = { coin: 1, compass: 1, tablet: 1.3, arrowhead: 2.2, jewel: 3.2 };

  /* Travel, cheapest first. A plane pays for anything; a car or a ship pays
     for its own kind or a boot; a boot pays only for a boot. */
  const TRAVEL = ['boot', 'car', 'ship', 'plane'];
  const TRAVEL_NAME = { boot: 'boot', car: 'car', ship: 'ship', plane: 'plane' };
  const pays = (have, need) => have === 'plane' || need === 'boot' || have === need;

  /* ================================================================
     Cards
     ================================================================ */

  /* The four every expedition starts with. Two Fear go in as well. */
  const BASIC = {
    fundcar:  { name: 'Funding', kind: 'basic', travel: ['car'], vp: 0, free: true, fx: [{ g: { coin: 1 } }], text: 'Gain a coin.' },
    fundship: { name: 'Funding', kind: 'basic', travel: ['ship'], vp: 0, free: true, fx: [{ g: { coin: 1 } }], text: 'Gain a coin.' },
    explcar:  { name: 'Exploration', kind: 'basic', travel: ['car'], vp: 0, free: true, fx: [{ g: { compass: 1 } }], text: 'Gain a compass.' },
    explship: { name: 'Exploration', kind: 'basic', travel: ['ship'], vp: 0, free: true, fx: [{ g: { compass: 1 } }], text: 'Gain a compass.' }
  };
  const START_DECK = ['fundcar', 'fundship', 'explcar', 'explship', 'fear', 'fear'];

  const FEAR = { name: 'Fear', kind: 'fear', travel: ['boot'], vp: -1, fx: null,
    text: 'Does nothing but walk you somewhere. −1 at the end.' };
  const FEAR_CARDS = 19;
  const FEAR_TILES = 10;

  /* Artifacts: bought with compasses, straight into play with their effect
     (the tablet is not paid then). Played from hand later they cost a tablet,
     and every artifact effect is a main action. All travel as a plane. */
  const ARTIFACTS = [
    { id: 'sandals', name: 'Pathfinder’s Sandals', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ relocate: { levels: [0] } }],
      text: 'Move one of your archaeologists already out on the island to a free space at a camp site, and use that site.' },
    { id: 'staff', name: 'Pathfinder’s Staff', cost: 4, vp: 1, travel: ['plane'],
      fx: [{ relocate: { levels: [0, 1] } }],
      text: 'Move one of your archaeologists already out on the island to a free space at a camp or level I site, and use it.' },
    { id: 'mask', name: 'War Mask', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ g: { arrowhead: 1 } }, { warMask: 1 }],
      text: 'Gain an arrowhead. Guardians give you no Fear at the end of this round.' },
    { id: 'earring', name: 'Crystal Earring', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ earring: { max: 3, from: 'top', back: true } }],
      text: 'Draw up to three. Keep one; you may put one back on top of your deck; the rest go to your play area unused.' },
    { id: 'dagger', name: 'Ritual Dagger', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ exile: 1 }, { g: { arrowhead: 1 } }],
      text: 'Exile a card from your hand or play area, and gain an arrowhead.' },
    { id: 'chest', name: 'Treasure Chest', cost: 4, vp: 3, travel: ['plane'],
      fx: [{ draw: 1 }, { g: { coin: 1 } }],
      text: 'Draw a card and gain a coin.' },
    { id: 'mortar', name: 'Mortar', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ exile: 1 }, { g: { coin: 2 } }],
      text: 'Exile a card, and gain two coins.' },
    { id: 'sgold', name: 'Serpent’s Gold', cost: 3, vp: 2, travel: ['plane'],
      fx: [{ fear: 1 }, { g: { coin: 4 } }],
      text: 'Take a Fear and gain four coins.' },
    { id: 'sidol', name: 'Serpent Idol', cost: 2, vp: 1, travel: ['plane'],
      fx: [{ fear: 1 }, { g: { jewel: 1 } }],
      text: 'Take a Fear and gain a jewel.' },
    { id: 'monkey', name: 'Monkey Medallion', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ gain: { type: 'item', to: 'top' } }],
      text: 'Take any item from the row for nothing, and put it on top of your deck.' },
    { id: 'araanu', name: 'Idol of Ara-Anu', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ research: { disc: { jewel: 1 } } }],
      text: 'Research, with a jewel knocked off the cost (a temple tile too).' },
    { id: 'blade', name: 'Inscribed Blade', cost: 2, vp: 1, travel: ['plane'],
      fx: [{ research: { discOr: [{ arrowhead: 1 }, { tablet: 2 }] } }],
      text: 'Research, with an arrowhead or two tablets knocked off the cost (a temple tile too).' },
    { id: 'ocarina', name: 'Guardian’s Ocarina', cost: 4, vp: 2, travel: ['plane', 'plane'],
      fx: [{ recall: 1 }, { ocarina: 1 }],
      text: 'Bring one of your archaeologists home from the island. Until the round ends, every travel icon you have counts as a plane.' },
    { id: 'hairpin', name: 'Tigerclaw Hairpin', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ exile: 1 }, { activate: { levels: [0], unocc: true } }],
      text: 'Exile a card, then use a camp site nobody is standing on.' },
    { id: 'club', name: 'War Club', cost: 4, vp: 1, travel: ['plane'],
      fx: [{ overcome: { where: 'mine' } }],
      text: 'Overcome a guardian at a site you occupy, without paying for it.' },
    { id: 'sundial', name: 'Sundial', cost: 2, vp: 1, travel: ['plane'],
      opts: [{ label: 'Two tablets', fx: [{ g: { tablet: 2 } }] },
             { label: 'Pass, and gain a jewel', pass: true, fx: [{ g: { jewel: 1 } }] }],
      text: 'Gain two tablets — or pass for the round, and gain a jewel.' },
    { id: 'scales', name: 'Trader’s Scales', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ upgrade: 1 }, { g: { coin: 3 } }],
      text: 'Trade a tablet up to an arrowhead, or an arrowhead up to a jewel. Gain three coins.' },
    { id: 'arrows', name: 'Hunting Arrows', cost: 4, vp: 1, travel: ['plane'],
      fx: [{ fear: 1 }, { g: { arrowhead: 2 } }],
      text: 'Take a Fear and gain two arrowheads.' },
    { id: 'coconut', name: 'Coconut Flask', cost: 3, vp: 2, travel: ['plane'],
      fx: [{ g: { coin: 2 } }, { supplyAsst: 'silver' }],
      text: 'Gain two coins, then borrow the silver side of an assistant waiting on the supply board.' },
    { id: 'cauldron', name: 'Cleansing Cauldron', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ draw: 1 }, { exile: 1 }],
      text: 'Draw a card, then exile a card.' },
    { id: 'wine', name: 'Ancient Wine', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ g: { coin: 1 } }, { supplyAsst: 'gold' }],
      text: 'Gain a coin, then borrow the gold side of an assistant waiting on the supply board.' },
    { id: 'horn', name: 'Decorated Horn', cost: 2, vp: 1, travel: ['plane'],
      fx: [{ swapAsst: 1 }],
      text: 'Swap one of your assistants for one on the supply board. The newcomer keeps the old one’s level and is ready to use.' },
    { id: 'hammer', name: 'Ornate Hammer', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ hammer: 1 }],
      text: 'Exile the item at the far end of the row. Then take any exiled item for nothing, to the bottom of your deck.' },
    { id: 'charts', name: 'Star Charts', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ pay: { coin: 1 }, then: [{ activate: { levels: [0], n: 2 } }] }],
      text: 'Pay a coin to use two different camp sites.' },
    { id: 'jar', name: 'Stone Jar', cost: 2, vp: 1, travel: ['plane'],
      fx: [{ draw: 1 }],
      text: 'Draw a card.' },
    { id: 'shell', name: 'Passage Shell', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ dig: { levels: [0], free: true, twice: true } }],
      text: 'Send an archaeologist to a camp site with no travel cost. You may use the site twice.' },
    { id: 'rattle', name: 'Ceremonial Rattle', cost: 3, vp: 2, travel: ['plane'],
      fx: [{ refresh: 1 }],
      text: 'Make one of your assistants ready to use again.' },
    { id: 'drum', name: 'Sacred Drum', cost: 4, vp: 1, travel: ['plane'],
      fx: [{ useCard: 1, then: [{ refresh: 2 }] }],
      text: 'Put a card from your hand into play unused, to make both your assistants ready again.' },
    { id: 'coins', name: 'Trader’s Coins', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ upgrade: 1 }, { g: { coin: 2 } }],
      text: 'Trade a tablet up to an arrowhead, or an arrowhead up to a jewel. Gain two coins.' },
    { id: 'key', name: 'Stone Key', cost: 3, vp: 2, travel: ['plane'],
      fx: [{ stoneKey: 1 }],
      text: 'Lift an idol out of a slot on your board and back into your supply crates.' },
    { id: 'obsidian', name: 'Obsidian Earring', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ earring: { max: 2, from: 'bottom', back: false } }],
      text: 'Draw one or two from the bottom of your deck. Keep one; the other goes to your play area unused.' },
    { id: 'gstone', name: 'Guiding Stone', cost: 3, vp: 1, travel: ['plane'],
      fx: [{ activateTop: 1 }],
      text: 'Turn up the top level I site tile, use it, and slide it under the stack.' },
    { id: 'gskull', name: 'Guiding Skull', cost: 4, vp: 1, travel: ['plane'],
      fx: [{ pay: { compass: 1 }, then: [{ activateTop: 2 }] }],
      text: 'Pay a compass: turn up the top level II site tile, use it, and slide it under the stack.' },
    { id: 'runes', name: 'Runes of the Dead', cost: 4, vp: 1, travel: ['plane'],
      fx: [{ fear: 1 }, { g: { coin: 1, tablet: 3 } }],
      text: 'Take a Fear, and gain a coin and three tablets.' },
    { id: 'crown', name: 'Guardian’s Crown', cost: 4, vp: 2, travel: ['plane'],
      fx: [{ crown: 1 }],
      text: 'Lead a guardian away from a site you occupy to a camp or level I site where nobody stands and no guardian waits. Use that site.' }
  ];

  /* Items: bought with coins, to the BOTTOM of your deck. Some effects are
     free actions (the lightning bolt); the rest take your turn's main action. */
  const ITEMS = [
    { id: 'turtle', name: 'Sea Turtle', cost: 3, vp: 1, travel: ['ship', 'ship'],
      fx: [{ draw: 1 }, { dig: { disc: ['ship'] } }],
      text: 'Draw a card. Then send an archaeologist out, a ship cheaper.' },
    { id: 'ostrich', name: 'Ostrich', cost: 3, vp: 1, travel: ['car', 'car'],
      fx: [{ draw: 1 }, { dig: { disc: ['car'] } }],
      text: 'Draw a card. Then send an archaeologist out, a car cheaper.' },
    { id: 'donkey', name: 'Pack Donkey', cost: 4, vp: 1, travel: ['car', 'car'],
      fx: [{ draw: 2 }],
      text: 'Draw two cards.' },
    { id: 'horse', name: 'Horse', cost: 4, vp: 1, travel: ['car', 'car'],
      fx: [{ draw: 1 }, { g: { coin: 1, compass: 1 } }],
      text: 'Draw a card, and gain a coin and a compass.' },
    { id: 'steamboat', name: 'Steam Boat', cost: 3, vp: 3, travel: ['ship', 'ship'], free: true,
      fx: [{ g: { compass: 2 } }],
      text: 'Gain two compasses.' },
    { id: 'automobile', name: 'Automobile', cost: 3, vp: 3, travel: ['car', 'car'], free: true,
      fx: [{ g: { compass: 2 } }],
      text: 'Gain two compasses.' },
    { id: 'boots', name: 'Sturdy Boots', cost: 1, vp: 1, travel: ['car', 'car'],
      fx: [{ g: { compass: 1 } }, { dig: { disc: ['boot', 'boot'] } }],
      text: 'Gain a compass. Then send an archaeologist out, two boots cheaper.' },
    { id: 'goldpan', name: 'Gold Pan', cost: 1, vp: 1, travel: ['ship', 'ship'], free: true,
      fx: [{ g: { coin: 2 } }],
      text: 'Gain two coins.' },
    { id: 'trowel', name: 'Trowel', cost: 1, vp: 1, travel: ['car'],
      fx: [{ pay: { compass: 1 }, then: [{ g: { jewel: 1 } }] }],
      text: 'Pay a compass for a jewel.' },
    { id: 'pickaxe', name: 'Pickaxe', cost: 1, vp: 1, travel: ['car'],
      fx: [{ pay: { compass: 1 }, then: [{ g: { tablet: 1, arrowhead: 1 } }] }],
      text: 'Pay a compass for a tablet and an arrowhead.' },
    { id: 'balloon', name: 'Hot Air Balloon', cost: 2, vp: 1, travel: ['plane'], exileSelf: true,
      fx: [{ dig: { disc: ['plane'], comp: 3 } }],
      text: 'Exile this to send an archaeologist out a plane cheaper — and three compasses cheaper if you are discovering a site.' },
    { id: 'aeroplane', name: 'Aeroplane', cost: 4, vp: 3, travel: ['plane', 'plane'],
      fx: [{ dig: { disc: ['plane'], comp: 2 } }],
      text: 'Send an archaeologist out a plane cheaper — and two compasses cheaper if you are discovering a site.' },
    { id: 'journal', name: 'Journal', cost: 3, vp: 1, travel: ['car', 'ship'], exileSelf: true,
      fx: [{ research: { token: 'book', free: true } }],
      text: 'Exile this to move your notebook up a row for nothing.' },
    { id: 'parrot', name: 'Parrot', cost: 2, vp: 2, travel: ['ship'],
      fx: [{ useCard: 1, then: [{ g: { jewel: 1 } }] }],
      text: 'Put a card from your hand into play unused, for a jewel.' },
    { id: 'watch', name: 'Watch', cost: 1, vp: 1, travel: ['ship'],
      opts: [{ label: 'Two coins', free: true, fx: [{ g: { coin: 2 } }] },
             { label: 'Pass, and gain three coins', pass: true, fx: [{ g: { coin: 3 } }] }],
      text: 'Free action: gain two coins — or pass for the round, and gain three.' },
    { id: 'knife', name: 'Army Knife', cost: 3, vp: 1, travel: ['car', 'ship'],
      fx: [{ choose2: ['exile', 'coin', 'compass', 'tablet'] }],
      text: 'Pick two different: exile a card, a coin, a compass, a tablet.' },
    { id: 'binoculars', name: 'Binoculars', cost: 4, vp: 1, travel: ['ship'],
      fx: [{ activate: { levels: [1] } }],
      text: 'Use any level I site that has been discovered.' },
    { id: 'tent', name: 'Tent', cost: 4, vp: 2, travel: ['car'],
      fx: [{ activate: { mine: true, l2pay: { compass: 2 } } }],
      text: 'Use a site you occupy. A level II site costs two compasses first.' },
    { id: 'rod', name: 'Fishing Rod', cost: 2, vp: 2, travel: ['ship'],
      fx: [{ buy: { type: 'item', disc: 3, peek: true } }],
      text: 'Buy an item three coins cheaper. The top card of the item deck is on offer too.' },
    { id: 'pcompass', name: 'Precision Compass', cost: 4, vp: 1, travel: ['ship'],
      fx: [{ buy: { type: 'art', disc: 3, peek: true } }],
      text: 'Buy an artifact three compasses cheaper. The top card of the artifact deck is on offer too.' },
    { id: 'bow', name: 'Bow and Arrows', cost: 2, vp: 2, travel: ['car'],
      fx: [{ per: { what: 'guardians', res: 'compass', max: 3 } }],
      text: 'A compass for each guardian at a site you occupy and each you have overcome — three at most.' },
    { id: 'pigeon', name: 'Carrier Pigeon', cost: 2, vp: 1, travel: ['ship'], free: true,
      fx: [{ g: { tablet: 2 } }],
      text: 'Gain two tablets.' },
    { id: 'whip', name: 'Whip', cost: 2, vp: 1, travel: ['car'], exileSelf: true,
      fx: [{ buy: { type: 'art', disc: 4 } }],
      text: 'Exile this to buy an artifact four compasses cheaper.' },
    { id: 'roughmap', name: 'Rough Map', cost: 1, vp: 1, travel: ['ship'], exileSelf: true,
      fx: [{ g: { compass: 3 } }],
      text: 'Exile this for three compasses.' },
    { id: 'airdrop', name: 'Airdrop', cost: 2, vp: 1, travel: ['plane'], exileSelf: true,
      fx: [{ gain: { type: 'item', to: 'hand' } }],
      text: 'Exile this to take any item from the row for nothing, straight into your hand.' },
    { id: 'flask', name: 'Flask', cost: 2, vp: 1, travel: ['ship'], exileSelf: true,
      fx: [{ draw: 3 }],
      text: 'Exile this to draw three cards.' },
    { id: 'machete', name: 'Machete', cost: 4, vp: 1, travel: ['car'],
      fx: [{ exile: 1 }, { g: { compass: 2 } }],
      text: 'Exile a card, and gain two compasses.' },
    { id: 'torch', name: 'Torch', cost: 2, vp: 2, travel: ['ship'],
      fx: [{ exile: 1 }, { g: { tablet: 1 } }],
      text: 'Exile a card, and gain a tablet.' },
    { id: 'backpack', name: 'Large Backpack', cost: 3, vp: 1, travel: ['car'],
      fx: [{ g: { coin: 1 } }, { drawBottom: 1 }],
      text: 'Gain a coin, and draw the bottom card of your deck.' },
    { id: 'rope', name: 'Rope', cost: 2, vp: 1, travel: ['ship'],
      fx: [{ useCard: 1, then: [{ draw: 2 }] }],
      text: 'Put a card from your hand into play unused, to draw two.' },
    { id: 'revolver', name: 'Revolver', cost: 4, vp: 1, travel: ['ship', 'ship'],
      fx: [{ pay: { compass: 1 }, then: [{ overcome: { where: 'mine' } }] }],
      text: 'Pay a compass to overcome a guardian at a site you occupy.' },
    { id: 'hat', name: 'Hat', cost: 1, vp: 1, travel: ['ship'], free: true,
      fx: [{ g: { coin: 1, compass: 1 } }],
      text: 'Gain a coin and a compass.' },
    { id: 'beartrap', name: 'Bear Trap', cost: 2, vp: 1, travel: ['car'], exileSelf: true,
      fx: [{ overcome: { where: 'noOther' } }],
      text: 'Exile this to overcome a guardian at a site no other player occupies — you need not be there yourself.' },
    { id: 'hook', name: 'Grappling Hook', cost: 2, vp: 2, travel: ['car'],
      fx: [{ useCard: 1, then: [{ draw: 1 }, { exile: 1 }] }],
      text: 'Put a card from your hand into play unused, to draw a card and then exile one.' },
    { id: 'lantern', name: 'Lantern', cost: 3, vp: 2, travel: ['car'],
      fx: [{ activate: { levels: [0] } }],
      text: 'Use any camp site.' },
    { id: 'dog', name: 'Dog', cost: 3, vp: 1, travel: ['car'],
      fx: [{ g: { compass: 1 } }, { activate: { levels: [0], unocc: true } }],
      text: 'Gain a compass, then use a camp site nobody is standing on.' },
    { id: 'brush', name: 'Brush', cost: 3, vp: 3, travel: ['car'],
      fx: [{ per: { what: 'idols', res: 'compass', max: 3 } }],
      text: 'A compass for each idol you own, slotted or not — three at most.' },
    { id: 'axe', name: 'Axe', cost: 2, vp: 2, travel: ['ship'],
      fx: [{ exile: 1 }, { g: { compass: 1 } }],
      text: 'Exile a card, and gain a compass.' },
    { id: 'chronometer', name: 'Chronometer', cost: 3, vp: 2, travel: ['ship', 'ship'],
      opts: [{ label: 'A coin and a compass', free: true, fx: [{ g: { coin: 1, compass: 1 } }] },
             { label: 'Pass, and gain three compasses', pass: true, fx: [{ g: { compass: 3 } }] }],
      text: 'Free action: gain a coin and a compass — or pass for the round, and gain three compasses.' },
    { id: 'theodolite', name: 'Theodolite', cost: 3, vp: 1, travel: ['ship'],
      fx: [{ g: { coin: 1 } }, { per: { what: 'placed', res: 'compass' } }],
      text: 'Gain a coin, and a compass for each of your archaeologists already out on the island.' }
  ];

  /* ================================================================
     Sites
     ================================================================ */

  /* The five camp sites are printed on the board and are the same on both
     sides. Each has two dig spaces: one boot, and two boots. */
  const CAMP = [
    { id: 'beach',  name: 'Beach camp',   fx: [{ g: { coin: 2 } }] },
    { id: 'canyon', name: 'Canyon rim',   fx: [{ g: { compass: 2 } }] },
    { id: 'stack',  name: 'Sea stack',    fx: [{ g: { tablet: 2 } }] },
    { id: 'wall',   name: 'Serpent wall', fx: [{ g: { arrowhead: 1 } }] },
    { id: 'cove',   name: 'Parrot cove',  fx: [{ useCard: 1, then: [{ g: { jewel: 1 } }] }],
      text: 'Put a card from your hand into play unused, for a jewel.' }
  ];

  /* Site tiles, turned up when a site is discovered. Ten for level I and six
     for level II — more than the board has room for, so some stay hidden. */
  const SITES = {
    1: [
      { id: 'wreck',    name: 'Crashed plane',
        fx: [{ choose: [{ label: 'Two compasses', fx: [{ g: { compass: 2 } }] },
                        { label: 'An item for nothing', fx: [{ gain: { type: 'item', to: 'bottom' } }] }] }],
        text: 'Two compasses — or any item from the row for nothing, to the bottom of your deck.' },
      { id: 'warrior',  name: 'Stone warrior', fx: [{ g: { coin: 1, arrowhead: 1 } }] },
      { id: 'roots',    name: 'Root tower',    fx: [{ draw: 1 }, { g: { coin: 1, tablet: 1 } }] },
      { id: 'blue',     name: 'Blue shrine',   fx: [{ g: { compass: 1, arrowhead: 1 } }] },
      { id: 'silver',   name: 'Silver tree',   fx: [{ g: { coin: 1, tablet: 2 } }] },
      { id: 'altar',    name: 'Serpent altar', fx: [{ g: { tablet: 1, arrowhead: 1 } }] },
      { id: 'stair',    name: 'Jungle stair',  fx: [{ draw: 1 }, { g: { arrowhead: 1 } }] },
      { id: 'redshrine', name: 'Red shrine',   fx: [{ fear: 1 }, { g: { tablet: 1, jewel: 1 } }] },
      { id: 'bones',    name: 'Bone cave',     fx: [{ fear: 1 }, { g: { compass: 1, jewel: 1 } }] },
      { id: 'sentinel', name: 'Red sentinel',  fx: [{ g: { jewel: 1 } }] }
    ],
    2: [
      { id: 'ridge',   name: 'Ridge fort',   fx: [{ g: { compass: 2, jewel: 1 } }] },
      { id: 'crystal', name: 'Crystal cave', fx: [{ g: { coin: 1, compass: 1, tablet: 1, arrowhead: 1 } }] },
      { id: 'spires',  name: 'Red spires',   fx: [{ g: { arrowhead: 1, jewel: 1 } }] },
      { id: 'arch',    name: 'Bird arch',    fx: [{ draw: 1 }, { g: { tablet: 1, jewel: 1 } }] },
      { id: 'owl',     name: 'Owl cliff',    fx: [{ g: { tablet: 2, jewel: 1 } }] },
      { id: 'sunken',  name: 'Sunken court', fx: [{ fear: 1 }, { g: { tablet: 2, arrowhead: 2 } }] }
    ]
  };

  /* ================================================================
     Guardians. Overcoming one is a main action at a site you occupy; the
     cost is along the bottom (travel icons in it are paid like any travel
     cost, a card symbol means put a card from hand into play unused). The
     boon is used once, ever: travel, or a free action. Five points each.
     ================================================================ */
  const GUARDIANS = [
    { id: 'serpent',  name: 'Jungle serpent',  cost: { compass: 1, coin: 1, arrowhead: 1 }, boon: { travel: ['ship'] } },
    { id: 'spider',   name: 'Giant spider',    cost: { useCard: 1, coin: 1, arrowhead: 1 }, boon: { fx: [{ exile: 1 }] } },
    { id: 'hog',      name: 'Tusked hog',      cost: { travel: ['boot'], coin: 1, arrowhead: 1 }, boon: { travel: ['car'] } },
    { id: 'beetle',   name: 'Armoured beetle', cost: { coin: 2, arrowhead: 1 }, boon: { travel: ['car'] } },
    { id: 'lizard',   name: 'Thorn lizard',    cost: { travel: ['boot'], tablet: 1, arrowhead: 1 }, boon: { fx: [{ exile: 1 }] } },
    { id: 'raptor',   name: 'Plumed raptor',   cost: { travel: ['plane'], arrowhead: 1 }, boon: { fx: [{ exile: 1 }] } },
    { id: 'scorpion', name: 'Sand scorpion',   cost: { useCard: 1, compass: 1, arrowhead: 1 }, boon: { fx: [{ draw: 1 }] } },
    { id: 'hound',    name: 'Shadow hound',    cost: { coin: 4 }, boon: { fx: [{ upgrade: 1 }] } },
    { id: 'boar',     name: 'Charging boar',   cost: { travel: ['ship'], arrowhead: 1 }, boon: { travel: ['car'] } },
    { id: 'toad',     name: 'Swamp toad',      cost: { travel: ['car'], arrowhead: 1 }, boon: { travel: ['ship'] } },
    { id: 'ants',     name: 'Ant swarm',       cost: { travel: ['boot', 'boot'], compass: 1 }, boon: { fx: [{ exile: 1 }] } },
    { id: 'fowl',     name: 'Crested fowl',    cost: { travel: ['boot'], jewel: 1 }, boon: { travel: ['plane'] } },
    { id: 'owl',      name: 'Great owl',       cost: { tablet: 3 }, boon: { travel: ['plane'] } },
    { id: 'wyvern',   name: 'Red wyvern',      cost: { travel: ['plane'], arrowhead: 1 }, boon: { fx: [{ exile: 1 }] } },
    { id: 'cat',      name: 'Stripe cat',      cost: { compass: 2, arrowhead: 1 }, boon: { travel: ['ship'] } }
  ];

  /* ================================================================
     Assistants: silver side, gold side. All free actions except the
     Quartermaster, whose discounted purchase is a main action. Seven, eight
     and nine offer resources OR travel.
     ================================================================ */
  const ASSISTANTS = [
    { id: 'miner',  name: 'Miner',
      silver: { fx: [{ g: { coin: 2 } }], text: 'Two coins.' },
      gold:   { fx: [{ g: { coin: 3 } }], text: 'Three coins.' } },
    { id: 'scholar', name: 'Scholar',
      silver: { fx: [{ g: { tablet: 1 } }], text: 'A tablet.' },
      gold:   { fx: [{ g: { coin: 1, tablet: 1 } }], text: 'A coin and a tablet.' } },
    { id: 'cutter', name: 'Gem cutter',
      silver: { fx: [{ travelPay: ['boot'], then: [{ g: { arrowhead: 1 } }] }], text: 'Pay a boot of travel for an arrowhead.' },
      gold:   { fx: [{ g: { arrowhead: 1 } }], text: 'An arrowhead.' } },
    { id: 'trader', name: 'Trader',
      silver: { fx: [{ pay: { coin: 1 }, then: [{ g: { arrowhead: 1 } }] }], text: 'Pay a coin for an arrowhead.' },
      gold:   { fx: [{ choose: [{ label: 'A coin for an arrowhead', pay: { coin: 1 }, fx: [{ g: { arrowhead: 1 } }] },
                                { label: 'A coin for a jewel', pay: { coin: 1 }, fx: [{ g: { jewel: 1 } }] }] }],
                text: 'Pay a coin for an arrowhead or a jewel.' } },
    { id: 'medic', name: 'Medic',
      silver: { fx: [{ exile: 1 }], text: 'Exile a card.' },
      gold:   { fx: [{ g: { compass: 1 } }, { exile: 1 }], text: 'A compass, and exile a card.' } },
    { id: 'porter', name: 'Porter',
      silver: { fx: [{ draw: 1 }, { useCard: 1 }], text: 'Draw a card, then put a card from your hand into play unused.' },
      gold:   { fx: [{ draw: 1 }], text: 'Draw a card.' } },
    { id: 'aviator', name: 'Aviator',
      silver: { fx: [{ choose: [{ label: 'A coin', fx: [{ g: { coin: 1 } }] }, { label: 'A plane', fx: [{ travel: ['plane'] }] }] }],
                travel: ['plane'], text: 'A coin, or a plane.' },
      gold:   { fx: [{ choose: [{ label: 'Two coins', fx: [{ g: { coin: 2 } }] }, { label: 'Two planes', fx: [{ travel: ['plane', 'plane'] }] }] }],
                travel: ['plane', 'plane'], text: 'Two coins, or two planes.' } },
    { id: 'driver', name: 'Driver',
      silver: { fx: [{ choose: [{ label: 'A compass', fx: [{ g: { compass: 1 } }] }, { label: 'A car', fx: [{ travel: ['car'] }] }] }],
                travel: ['car'], text: 'A compass, or a car.' },
      gold:   { fx: [{ choose: [{ label: 'A coin and a compass', fx: [{ g: { coin: 1, compass: 1 } }] }, { label: 'Two cars', fx: [{ travel: ['car', 'car'] }] }] }],
                travel: ['car', 'car'], text: 'A coin and a compass, or two cars.' } },
    { id: 'captain', name: 'Sea captain',
      silver: { fx: [{ choose: [{ label: 'A compass', fx: [{ g: { compass: 1 } }] }, { label: 'A ship', fx: [{ travel: ['ship'] }] }] }],
                travel: ['ship'], text: 'A compass, or a ship.' },
      gold:   { fx: [{ choose: [{ label: 'A coin and a compass', fx: [{ g: { coin: 1, compass: 1 } }] }, { label: 'Two ships', fx: [{ travel: ['ship', 'ship'] }] }] }],
                travel: ['ship', 'ship'], text: 'A coin and a compass, or two ships.' } },
    { id: 'quartermaster', name: 'Quartermaster', main: true,
      silver: { fx: [{ buy: { type: 'any', disc: 1 } }], text: 'Main action: buy a card, one cheaper.' },
      gold:   { fx: [{ buy: { type: 'any', disc: 2 } }], text: 'Main action: buy a card, two cheaper.' } },
    { id: 'naturalist', name: 'Naturalist',
      silver: { fx: [{ upgrade: 1 }], text: 'Trade a tablet up to an arrowhead, or an arrowhead up to a jewel.' },
      gold:   { fx: [{ upgrade: 1 }, { g: { compass: 1 } }], text: 'Trade one up, and gain a compass.' } },
    { id: 'guide', name: 'Guide',
      silver: { fx: [{ g: { compass: 1 } }], text: 'A compass.' },
      gold:   { fx: [{ g: { compass: 2 } }], text: 'Two compasses.' } }
  ];

  /* ================================================================
     Idols, bonus tiles, the player board
     ================================================================ */

  /* What an idol gives the moment its site is found. Sixteen in the box:
     three each of coin, compass, tablet and exile, two each of trading up
     and refreshing an assistant. */
  const IDOLS = ['coin', 'coin', 'coin', 'compass', 'compass', 'compass', 'tablet', 'tablet', 'tablet',
    'exile', 'exile', 'exile', 'upgrade', 'upgrade', 'refresh', 'refresh'];
  const REWARD = {
    coin: { fx: [{ g: { coin: 1 } }], text: 'a coin' },
    compass: { fx: [{ g: { compass: 1 } }], text: 'a compass' },
    tablet: { fx: [{ g: { tablet: 1 } }], text: 'a tablet' },
    exile: { fx: [{ exile: 1 }], text: 'exile a card' },
    upgrade: { fx: [{ upgrade: 1 }], text: 'trade a resource up' },
    refresh: { fx: [{ refresh: 1 }], text: 'refresh an assistant' },
    draw: { fx: [{ draw: 1 }], text: 'draw a card' }
  };
  /* Eighteen research bonus tiles: three of each. */
  const BONUS = ['coin', 'coin', 'coin', 'compass', 'compass', 'compass', 'tablet', 'tablet', 'tablet',
    'exile', 'exile', 'exile', 'draw', 'draw', 'draw', 'upgrade', 'upgrade', 'upgrade'];

  /* Putting an idol in a slot (a free action) buys one of these. */
  const IDOL_SLOT = [
    { id: 'jewel',  label: 'A coin for a jewel', pay: { coin: 1 }, fx: [{ g: { jewel: 1 } }] },
    { id: 'arrow',  label: 'An arrowhead', fx: [{ g: { arrowhead: 1 } }] },
    { id: 'tabs',   label: 'Two tablets', fx: [{ g: { tablet: 2 } }] },
    { id: 'coco',   label: 'A coin and a compass', fx: [{ g: { coin: 1, compass: 1 } }] },
    { id: 'draw',   label: 'Draw a card', fx: [{ draw: 1 }] }
  ];
  /* Each slot still empty at the end is worth this much. Slots fill from the
     left, so the first idol you use costs you one point, the fourth four. */
  const SLOT_VALUE = [1, 2, 3, 4];
  const IDOL_VP = 3, GUARDIAN_VP = 5;

  /* Starting resources by seat in the first round's order. */
  const START_RES = [{ coin: 2 }, { coin: 1, compass: 1 }, { coin: 2, compass: 1 }, { coin: 1, compass: 2 }];

  /* ================================================================
     The two boards
     ================================================================ */

  const CAMP_SPACES = [['boot'], ['boot', 'boot']];

  /* Sites on the island that start undiscovered. `row` 0 is the band nearer
     the camp, 1 the band nearer the highlands; `col` is left to right as
     printed. Travel cost is per board side. */
  function slots(side) {
    const L1 = side === 'snake'
      ? [['car'], ['boot', 'boot'], ['plane'], ['ship'], ['car'], ['car'], ['ship'], ['ship']]
      : [['car'], ['car'], ['ship'], ['ship'], ['car'], ['car'], ['ship'], ['ship']];
    const L2 = side === 'snake'
      ? [['car', 'car'], ['boot', 'plane'], ['car', 'ship'], ['ship', 'ship']]
      : [['car', 'car'], ['car', 'car'], ['ship', 'ship'], ['ship', 'ship']];
    const out = [];
    CAMP.forEach((c, i) => out.push({ id: 'c' + (i + 1), level: 0, col: i, row: 0, camp: c.id, spaces: CAMP_SPACES }));
    /* Level I: the upper band of four (row 1) and the lower band (row 0). */
    L1.forEach((cost, i) => out.push({ id: 'j' + (i + 1), level: 1, row: i < 4 ? 1 : 0, col: i % 4, spaces: [cost], idols: 1 }));
    L2.forEach((cost, i) => out.push({ id: 'h' + (i + 1), level: 2, row: 0, col: i, spaces: [cost], idols: 2 }));
    return out;
  }
  const DISCOVER = { 1: 3, 2: 6 };

  /* Research. A square is a space on the track; `row` 0 is the start line
     and 8 the Lost Temple. `cost` is printed on the bridge INTO the square.
     `next` lists the squares reachable from it. `bonus` says how many bonus
     tiles it gets for 2, 3 and 4 players. Read off both board images; the
     links where a bridge sits between two spaces were settled by a published
     implementation's table and agree with where the bridges are drawn. */
  const TRACKS = {
    bird: {
      squares: [
        { id: 0,  row: 0, col: 0, span: 4, cost: {}, next: [1, 2] },
        { id: 1,  row: 1, col: 0, span: 2, cost: { compass: 1, arrowhead: 1 }, next: [3, 4] },
        { id: 2,  row: 1, col: 2, span: 2, cost: { jewel: 1 }, next: [4] },
        { id: 3,  row: 2, col: 0, span: 1.5, cost: { jewel: 1 }, next: [5], bonus: [1, 1, 1] },
        { id: 4,  row: 2, col: 1.5, span: 2.5, cost: { tablet: 1, arrowhead: 1 }, next: [5], bonus: [1, 1, 1] },
        { id: 5,  row: 3, col: 0, span: 4, cost: { tablet: 2, arrowhead: 1 }, next: [6, 7, 8], bonus: [0, 0, 1] },
        { id: 6,  row: 4, col: 0, span: 4 / 3, cost: { coin: 1, tablet: 1, arrowhead: 1 }, next: [9], bonus: [1, 1, 1] },
        { id: 7,  row: 4, col: 4 / 3, span: 4 / 3, cost: { tablet: 1, jewel: 1 }, next: [9], bonus: [1, 1, 1] },
        { id: 8,  row: 4, col: 8 / 3, span: 4 / 3, cost: { arrowhead: 2 }, next: [9], bonus: [1, 1, 1] },
        { id: 9,  row: 5, col: 0, span: 4, cost: { coin: 1, jewel: 1 }, next: [10, 11], bonus: [0, 0, 1] },
        { id: 10, row: 6, col: 0, span: 1.5, cost: { compass: 1, jewel: 1 }, next: [12], bonus: [1, 1, 1] },
        { id: 11, row: 6, col: 1.5, span: 2.5, cost: { tablet: 2, arrowhead: 1 }, next: [12, 13], bonus: [1, 1, 1] },
        { id: 12, row: 7, col: 0, span: 2.5, cost: { coin: 1, tablet: 1, arrowhead: 1 }, next: [14], bonus: [0, 1, 1] },
        { id: 13, row: 7, col: 2.5, span: 1.5, cost: { tablet: 1, jewel: 1 }, next: [14], bonus: [0, 1, 1] },
        { id: 14, row: 8, col: 0, span: 4, cost: { coin: 1, compass: 1, jewel: 1 }, next: [], temple: true }
      ],
      /* What moving INTO a row gives, and what a token standing there scores. */
      rows: [
        null,
        { glass: { r: 'coin', vp: 1 },     book: { r: 'recruit', vp: 0 } },
        { glass: { r: 'compass', vp: 2 },  book: { r: 'recruit', vp: 1 } },
        { glass: { r: 'compass', vp: 4 },  book: { r: 'upAsst', vp: 2 } },
        { glass: { r: 'compass', vp: 6 },  book: { r: 'upAsst', vp: 4 } },
        { glass: { r: 'compass', vp: 9 },  book: { r: 'compass3', vp: 6 } },
        { glass: { r: 'draw', vp: 12 },    book: { r: 'freeArt', vp: 8 } },
        { glass: { r: 'compass', vp: 16 }, book: { r: 'guard', vp: 10 } }
      ],
      /* Temple tiles: the three costs printed under the temple, and which
         of them each stack asks for. */
      templeCosts: [{ coin: 1, tablet: 2 }, { jewel: 1 }, { compass: 1, arrowhead: 1 }]
    },
    snake: {
      squares: [
        { id: 0,  row: 0, col: 0, span: 4, cost: {}, next: [1, 2] },
        { id: 1,  row: 1, col: 0, span: 2, cost: { compass: 1, tablet: 2 }, next: [3, 4] },
        { id: 2,  row: 1, col: 2, span: 2, cost: { jewel: 1 }, next: [4, 5] },
        { id: 3,  row: 2, col: 0, span: 4 / 3, cost: { coin: 1, compass: 1, arrowhead: 1 }, next: [6], bonus: [1, 1, 1] },
        { id: 4,  row: 2, col: 4 / 3, span: 4 / 3, cost: { tablet: 1, jewel: 1 }, next: [6, 7], bonus: [0, 1, 1] },
        { id: 5,  row: 2, col: 8 / 3, span: 4 / 3, cost: { arrowhead: 2 }, next: [7], bonus: [1, 1, 1] },
        { id: 6,  row: 3, col: 0, span: 2, cost: { tablet: 2, arrowhead: 1 }, next: [8], bonus: [1, 1, 1] },
        { id: 7,  row: 3, col: 2, span: 2, cost: { coin: 1, jewel: 1 }, next: [8], bonus: [1, 1, 1] },
        { id: 8,  row: 4, col: 0, span: 4, cost: { idol: 1 }, next: [9, 10], rescue: true },
        { id: 9,  row: 5, col: 0, span: 2, cost: { arrowhead: 2 }, next: [11, 12], bonus: [0, 0, 1] },
        { id: 10, row: 5, col: 2, span: 2, cost: { tablet: 1, jewel: 1 }, next: [12], bonus: [0, 0, 1] },
        { id: 11, row: 6, col: 0, span: 1.5, cost: { tablet: 1, jewel: 1 }, next: [13], bonus: [1, 1, 1] },
        { id: 12, row: 6, col: 1.5, span: 2.5, cost: { compass: 1, tablet: 3 }, next: [13], bonus: [1, 1, 1] },
        { id: 13, row: 7, col: 0, span: 4, cost: { coin: 1, tablet: 1, arrowhead: 1 }, next: [14], bonus: [2, 3, 3], pick: true },
        { id: 14, row: 8, col: 0, span: 4, cost: { compass: 1, arrowhead: 1, jewel: 1 }, next: [], temple: true }
      ],
      rows: [
        null,
        { glass: { r: 'coin', vp: 1 },    book: { r: 'recruit', vp: 0 } },
        { glass: { r: 'coin2', vp: 2 },   book: { r: 'exile', vp: 3 } },
        { glass: { r: 'draw', vp: 3 },    book: { r: 'upAsst', vp: 4 } },
        { glass: { r: 'rescue', vp: 4 },  book: { r: 'freeArt', vp: 5 } },
        { glass: { r: 'upAsst', vp: 5 },  book: { r: 'refreshAsst', vp: 8 } },
        { glass: { r: 'fear', vp: 10 },   book: { r: 'draw', vp: 12 } },
        { glass: { r: 'fear', vp: 15 },   book: { r: 'jewel', vp: 15 } }
      ],
      templeCosts: [{ compass: 1, tablet: 2 }, { jewel: 1 }, { coin: 1, arrowhead: 1 }]
    }
  };
  /* The Lost Temple scores by order of arrival. */
  const TEMPLE_ARRIVAL = [23, 21, 20, 19];
  /* The temple's six stacks: which of the three printed costs each wants. */
  const TEMPLE_STACKS = [
    { id: 't11', vp: 11, uses: [0, 1, 2] },
    { id: 't6a', vp: 6, uses: [0, 1] }, { id: 't6b', vp: 6, uses: [1, 2] },
    { id: 't2a', vp: 2, uses: [0] }, { id: 't2b', vp: 2, uses: [1] }, { id: 't2c', vp: 2, uses: [2] }
  ];
  /* What each row effect means, for the words on the screens. */
  const ROW_TEXT = {
    coin: 'a coin', coin2: 'two coins', compass: 'a compass', compass3: 'three compasses', draw: 'draw a card',
    jewel: 'a jewel', fear: 'a Fear card', exile: 'exile a card', recruit: 'recruit an assistant',
    upAsst: 'upgrade an assistant to gold', refreshAsst: 'refresh an assistant', freeArt: 'an artifact for nothing',
    guard: 'overcome a guardian at your site, free', rescue: 'rescue a stranded assistant'
  };

  /* ================================================================
     Lookups
     ================================================================ */
  const ART = {}, ITEM = {};
  for (const c of ARTIFACTS) { c.kind = 'art'; ART[c.id] = c; }
  for (const c of ITEMS) { c.kind = 'item'; ITEM[c.id] = c; }
  const GUARD = {}; for (const g of GUARDIANS) GUARD[g.id] = g;
  const ASST = {}; for (const a of ASSISTANTS) ASST[a.id] = a;
  const SITE = {}; for (const lv of [1, 2]) for (const s of SITES[lv]) { s.level = lv; SITE[s.id] = s; }
  const CAMPS = {}; for (const c of CAMP) { c.level = 0; CAMPS[c.id] = c; }

  /* A card instance id is `kind:def[:n]` — art:mortar, item:hat, fear:7,
     basic:p1:fundcar. The definition is what the id points at. */
  function card(uid) {
    if (!uid) return null;
    const p = String(uid).split(':');
    if (p[0] === 'art') return ART[p[1]] || null;
    if (p[0] === 'item') return ITEM[p[1]] || null;
    if (p[0] === 'fear') return FEAR;
    if (p[0] === 'basic') return BASIC[p[2]] || null;
    return null;
  }
  const kindOf = uid => String(uid).split(':')[0];
  const site = id => SITE[id] || CAMPS[id] || null;

  const MANIFEST = {
    built: [
      'The whole base game: five rounds, both sides of the board (the Bird Temple, and the Snake Temple with its stranded assistants), 2 to 4 expeditions.',
      'All 35 artifacts, all 40 items, the 15 guardians and their boons, the 16 site tiles, the 12 assistants silver and gold, the 16 idols, the 18 research bonus tiles and the temple.',
      'Travel paid the way the book says: any card, boon, assistant or hired pilot, with the leftover icons good for the rest of your turn.',
      'House explorers fill the empty chairs, and decide from the same two views a phone gets.',
      'The printed board, cards and tiles, from the host’s own VASSAL module of the game: the island and research track are the real board, with every piece placed on it.'
    ],
    notBuilt: [
      'The solo rival and the solo campaign (the house explorers are your opponents instead).',
      'The Expedition Leaders and Search for Professor Kutil expansions.'
    ]
  };

  const Data = {
    RES, RES_NAME, RES_PLURAL, RES_VALUE, TRAVEL, TRAVEL_NAME, pays,
    BASIC, START_DECK, FEAR, FEAR_CARDS, FEAR_TILES, ARTIFACTS, ITEMS, ART, ITEM,
    CAMP, CAMPS, SITES, SITE, site, GUARDIANS, GUARD, ASSISTANTS, ASST,
    IDOLS, BONUS, REWARD, IDOL_SLOT, SLOT_VALUE, IDOL_VP, GUARDIAN_VP, START_RES,
    CAMP_SPACES, slots, DISCOVER, TRACKS, TEMPLE_ARRIVAL, TEMPLE_STACKS, ROW_TEXT,
    card, kindOf, MANIFEST
  };

  /* ================================================================
     Effect steps — the key
     ----------------------------------------------------------------
     { g: {coin:2} }                 gain resources
     { fear: 1 }                     take a Fear card into your play area
     { draw: n } / { drawBottom: 1 } draw from the top / the bottom of your deck
     { exile: 1 }                    you may exile a card from hand or play area
     { upgrade: 1 }                  you may trade tablet→arrowhead or arrowhead→jewel
     { refresh: n }                  make up to n of your assistants ready
     { pay: {…}, then: [...] }       pay resources to do `then`
     { useCard: 1, then: [...] }     put a card from hand into play unused
     { travelPay: [...], then }      pay travel icons (a Gem cutter's boot)
     { travel: [...] }               travel icons for the rest of the turn
     { dig: {disc, comp, levels, free, twice} }   send an archaeologist out
     { research: {disc | discOr | token, free} }  research
     { buy: {type, disc, peek} }     buy a card cheaper
     { gain: {type, to} }            a card from the row for nothing
     { overcome: {where} }           overcome a guardian without its cost
     { activate: {levels, unocc, mine, l2pay, n} }  use a site with nobody sent
     { activateTop: level }          use the top tile of a site stack
     { relocate: {levels} }          move a placed archaeologist, use the site
     { recall: 1 } { ocarina: 1 } { warMask: 1 } { crown: 1 }
     { supplyAsst: 'silver'|'gold' } { swapAsst: 1 } { stoneKey: 1 }
     { earring: {max, from, back} }  { hammer: 1 }
     { per: {what, res, max} }       a resource for each guardian / idol / placed archaeologist
     { choose: [{label, pay?, fx}] } one of several
     { choose2: [...] }              two different of several
     ================================================================ */

  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.ArnakData = Data;
})(typeof window !== 'undefined' ? window : this);
