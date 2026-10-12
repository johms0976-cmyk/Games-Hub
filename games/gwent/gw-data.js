'use strict';
/* Gwent — the components, read off the card faces in Reference/Gwent Art
 * (one picture per printed card), plus the board arithmetic that the engine,
 * the house and the phones all share, so a strength printed on a phone and a
 * strength the telly scores cannot drift apart.
 *
 * Sources, best first (ARCHITECTURE.md "Where the numbers came from"):
 *   1. the card faces (strength, row icon, ability icon, hero corner, the
 *      leaders' printed ability line);
 *   2. the five rules cards (Rules/*.png);
 *   3. where both are silent, The Witcher 3's own Gwent, as remembered —
 *      every such ruling is in MANIFEST.decisions and marked INFERRED below.
 *
 * Card text is written fresh. The pictures are CD PROJEKT RED's, used on this
 * private hub only.
 */
(function (root) {
  const VERSION = 1;

  const ROWS = ['close', 'ranged', 'siege'];
  const ROW_NAME = ['Close Combat', 'Ranged Combat', 'Siege'];
  const ROW_SHORT = ['Close', 'Ranged', 'Siege'];

  const FACTIONS = [
    { id: 'nr', name: 'Northern Realms', short: 'the North', hex: '#3e78d8', folder: 'Northern Realms', back: 'Northern Realms back.jpg',
      bonus: 'Draws one card from the deck every time it wins a round.' },
    { id: 'ng', name: 'Nilfgaardian Empire', short: 'Nilfgaard', hex: '#d9b04a', folder: 'Nilfgaardian Empire', back: 'Nilfgaardian Empire back.jpg',
      bonus: 'Wins any round that ends in a draw.' },
    { id: 'mo', name: 'Monsters', short: 'the Monsters', hex: '#c8343a', folder: 'Monsters', back: 'Monsters back.jpg',
      bonus: 'Keeps one random unit on the board after each round.' },
    { id: 'st', name: 'Scoia’tael', short: 'the Scoia’tael', hex: '#3fa354', folder: 'Scoia\'tael', back: 'Scoia\'tael back.jpg',
      bonus: 'Chooses who begins each round.' },
    /* Skellige, from Blood and Wine: read off the Witcher Wiki's "Skellige
       Gwent deck" page (archived 2024-12-25), which the user pointed to. The
       pictures (Reference/Gwent Art/Skellige, added by the user 2026-10-12)
       are The Witcher 3's in-game cards, taller than the printed ones:
       tools/cut-art.py fits them. No Skellige card back: the drawn one. */
    { id: 'sk', name: 'Skellige', short: 'Skellige', hex: '#2fa3a3', folder: 'Skellige', back: null,
      bonus: 'At the start of round three, two random units from its discard pile return to the board.' }
  ];

  /* Abilities, with the rules-card wording rewritten. */
  const ABIL = {
    spy: { name: 'Spy', text: 'Goes on the opponent’s side (it counts for them) and you draw two cards.' },
    bond: { name: 'Tight Bond', text: 'Each copy in the same row multiplies the strength of all of them.' },
    muster: { name: 'Muster', text: 'Every card of the same name in your deck is played at once.' },
    morale: { name: 'Morale Boost', text: '+1 to every other unit in its row.' },
    medic: { name: 'Medic', text: 'Play a unit from your discard pile at once (no heroes, no specials).' },
    horn: { name: 'Commander’s Horn', text: 'Doubles every other unit in its row.' },
    agile: { name: 'Agile', text: 'Close Combat or Ranged — your choice. It stays where it is put.' },
    scorch: { name: 'Scorch', text: 'If the opponent’s units in this row add up to 10 or more, their strongest there are destroyed.' },
    scorchAll: { name: 'Scorch', text: 'When played, destroys the strongest unit or units on the whole board, either side — itself included.' },
    berserk: { name: 'Berserker', text: 'Turns into a bear when a Mardroeme is on its row.' },
    mardroeme: { name: 'Mardroeme', text: 'Every Berserker in its row turns into a bear, now and while it stays.' },
    summon: { name: 'Summon Shield Maidens', text: 'Every Clan Drummond Shield Maiden in your deck and your hand is played at once.' },
    avenger: { name: 'Summon Avenger', text: 'When it leaves the board, a powerful new unit takes its place.' },
    hero: { name: 'Hero', text: 'Nothing changes it: no weather, horn, boost, scorch, decoy or medic.' }
  };

  const SPECIALS = {
    frost: { name: 'Biting Frost', row: 0, text: 'Every Close Combat unit on both sides fights at strength 1.' },
    fog: { name: 'Impenetrable Fog', row: 1, text: 'Every Ranged unit on both sides fights at strength 1.' },
    rain: { name: 'Torrential Rain', row: 2, text: 'Every Siege unit on both sides fights at strength 1.' },
    clear: { name: 'Clear Weather', text: 'Ends every weather effect on the board.' },
    horn: { name: 'Commander’s Horn', text: 'Doubles every unit in one of your rows. One to a row.' },
    decoy: { name: 'Decoy', text: 'Takes the place of one of your units on the board; that unit goes back to your hand.' },
    scorch: { name: 'Scorch', text: 'Destroys the strongest unit or units on the whole board, either side.' },
    storm: { name: 'Skellige Storm', rows: [1, 2], text: 'Every Ranged and every Siege unit on both sides fights at strength 1.' },
    mardroeme: { name: 'Mardroeme', fac: 'sk', slot: true, text: 'Goes on one of your rows (where a horn would go): every Berserker there turns into a bear, now and while it stays.' }
  };

  /* ---------------- the cards ----------------
     [name, strength, row, ability, hero, picture files]
     row: c close · r ranged · s siege · a agile (close or ranged)
     The number of picture files is the number of copies in the collection
     (Arachas 1-3 are three Arachas). Neutral units are the exception: their
     two files are two paintings of ONE card (see NEUTRAL below). */
  const RAW = {
    mo: [
      ['Arachas', 4, 'c', 'muster', 0, ['Arachas 1', 'Arachas 2', 'Arachas 3']],
      ['Arachas Behemoth', 6, 's', 'muster', 0, ['Arachas Behemoth']],
      ['Botchling', 4, 'c', null, 0, ['Botchling']],
      ['Celaeno Harpy', 2, 'a', null, 0, ['Celaeno Harpy']],
      ['Cockatrice', 2, 'r', null, 0, ['Cockatrice']],
      ['Crone: Brewess', 6, 'c', 'muster', 0, ['Crone Brewess']],
      ['Crone: Weavess', 6, 'c', 'muster', 0, ['Crone Weavess']],
      ['Crone: Whispess', 6, 'c', 'muster', 0, ['Crone Whispess']],
      ['Draug', 10, 'c', null, 1, ['Draug']],
      ['Earth Elemental', 6, 's', null, 0, ['Earth Elemental']],
      ['Endrega', 2, 'r', null, 0, ['Endrega']],
      ['Fiend', 6, 'c', null, 0, ['Fiend']],
      ['Fire Elemental', 6, 's', null, 0, ['Fire Elemental']],
      ['Foglet', 2, 'c', null, 0, ['Foglet']],
      ['Forktail', 5, 'c', null, 0, ['Forktail']],
      ['Frightener', 5, 'c', null, 0, ['Frightener']],
      ['Gargoyle', 2, 'r', null, 0, ['Gargoyle']],
      ['Ghoul', 1, 'c', 'muster', 0, ['Ghoul 1', 'Ghoul 2', 'Ghoul 3']],
      ['Grave Hag', 5, 'r', null, 0, ['Grave Hag']],
      ['Griffin', 5, 'c', null, 0, ['Griffin']],
      ['Harpy', 2, 'a', null, 0, ['Harpy']],
      ['Ice Giant', 6, 's', null, 0, ['Ice Giant']],
      ['Imlerith', 10, 'c', null, 1, ['Imlerith']],
      ['Kayran', 8, 'a', 'morale', 1, ['Kayran']],
      ['Leshen', 10, 'r', null, 1, ['Leshen']],
      ['Nekker', 2, 'c', 'muster', 0, ['Nekker 1', 'Nekker 2', 'Nekker 3']],
      ['Plague Maiden', 5, 'c', null, 0, ['Plague Maiden']],
      ['Toad', 7, 'r', 'scorch', 0, ['Toad']],
      ['Vampire: Bruxa', 4, 'c', 'muster', 0, ['Vampire Bruxa']],
      ['Vampire: Ekimmara', 4, 'c', 'muster', 0, ['Vampire Ekimmara']],
      ['Vampire: Fleder', 4, 'c', 'muster', 0, ['Vampire Fleder']],
      ['Vampire: Garkain', 4, 'c', 'muster', 0, ['Vampire Garkain']],
      ['Vampire: Katakan', 5, 'c', 'muster', 0, ['Vampire Katakan']],
      ['Werewolf', 5, 'c', null, 0, ['Werewolf']],
      ['Wyvern', 2, 'r', null, 0, ['Wyvern']]
    ],
    ng: [
      ['Albrich', 2, 'r', null, 0, ['Albrich']],
      ['Assire var Anahid', 6, 'r', null, 0, ['Assire var Anahid']],
      ['Black Infantry Archer', 10, 'r', null, 0, ['Black Infantry Archer 1', 'Black Infantry Archer 2']],
      ['Cahir Mawr Dyffryn aep Ceallach', 6, 'c', null, 0, ['Cahir Mawr Dyffryn aep Ceallach']],
      ['Cynthia', 4, 'r', null, 0, ['Cynthia']],
      ['Etolian Auxiliary Archers', 1, 'r', 'medic', 0, ['Etolian Auxiliary Archers 1', 'Etolian Auxiliary Archers 2']],
      ['Fringilla Vigo', 6, 'r', null, 0, ['Fringilla Vigo']],
      ['Heavy Zerrikanian Fire Scorpion', 10, 's', null, 0, ['Heavy Zerrikanian Fire Scorpion']],
      ['Impera Brigade Guard', 3, 'c', 'bond', 0, ['Impera Brigade Guard 1', 'Impera Brigade Guard 2', 'Impera Brigade Guard 3', 'Impera Brigade Guard 4']],
      ['Letho of Gulet', 10, 'c', null, 1, ['Letho of Gulet']],
      ['Menno Coehoorn', 10, 'c', 'medic', 1, ['Menno Coehoorn']],
      ['Morteisen', 3, 'c', null, 0, ['Morteisen']],
      ['Morvran Voorhis', 10, 's', null, 1, ['Morvran Voorhis']],
      ['Nausicaa Cavalry Rider', 2, 'c', 'bond', 0, ['Nausicaa Cavalry Rider 1', 'Nausicaa Cavalry Rider 2', 'Nausicaa Cavalry Rider 3']],
      ['Puttkammer', 3, 'r', null, 0, ['Puttkammer']],
      ['Rainfarn', 4, 'c', null, 0, ['Rainfarn']],
      ['Renuald aep Matsen', 5, 'r', null, 0, ['Renuald aep Matsen']],
      ['Rotten Mangonel', 3, 's', null, 0, ['Rotten Mangonel']],
      ['Shilard Fitz-Oesterlen', 7, 'c', 'spy', 0, ['Shilard Fitz-Oesterlen']],
      ['Siege Engineer', 6, 's', null, 0, ['Siege Engineer']],
      ['Siege Technician', 0, 's', 'medic', 0, ['Siege Technician']],
      ['Stefan Skellen', 9, 'c', 'spy', 0, ['Stefan Skellen']],
      ['Sweers', 2, 'r', null, 0, ['Sweers']],
      ['Tibor Eggebracht', 10, 'r', null, 1, ['Tibor Eggebracht']],
      ['Vanhemar', 4, 'r', null, 0, ['Vanhemar']],
      ['Vattier de Rideaux', 4, 'c', 'spy', 0, ['Vattier de Rideaux']],
      ['Vreemde', 2, 'c', null, 0, ['Vreemde']],
      ['Young Emissary', 5, 'c', 'bond', 0, ['Young Emissary 1', 'Young Emissary 2']],
      ['Zerrikanian Fire Scorpion', 5, 's', null, 0, ['Zerrikanian Fire Scorpion']]
    ],
    nr: [
      ['Ballista', 6, 's', null, 0, ['Ballista 1', 'Ballista 2']],
      ['Blue Stripes Commando', 4, 'c', 'bond', 0, ['Blue Stripes Commando 1', 'Blue Stripes Commando 2', 'Blue Stripes Commando 3', 'Blue Stripes Commando 4', 'Blue Stripes Commando 5']],
      ['Catapult', 8, 's', 'bond', 0, ['Catapult 1', 'Catapult 2']],
      ['Crinfrid Reavers Dragon Hunter', 5, 'r', 'bond', 0, ['Crinfrid Reavers Dragon Hunter 1', 'Crinfrid Reavers Dragon Hunter 2', 'Crinfrid Reavers Dragon Hunter 3']],
      ['Dethmold', 6, 'r', null, 0, ['Dethmold']],
      ['Dun Banner Medic', 5, 's', 'medic', 0, ['Dun Banner Medic']],
      ['Esterad Thyssen', 10, 'c', null, 1, ['Esterad Thyssen']],
      ['John Natalis', 10, 'c', null, 1, ['John Natalis']],
      ['Kaedweni Siege Expert', 1, 's', 'morale', 0, ['Kaedweni Siege Expert 1', 'Kaedweni Siege Expert 2', 'Kaedweni Siege Expert 3']],
      ['Keira Metz', 5, 'r', null, 0, ['Keira Metz']],
      ['Philippa Eilhart', 10, 'r', null, 1, ['Philippa Eilhart']],
      ['Poor Fucking Infantry', 1, 'c', 'bond', 0, ['Poor Fucking Infantry 1', 'Poor Fucking Infantry 2', 'Poor Fucking Infantry 3']],
      ['Prince Stennis', 5, 'c', 'spy', 0, ['Prince Stennis']],
      ['Redanian Foot Soldier', 1, 'c', null, 0, ['Redanian Foot Soldier 1', 'Redanian Foot Soldier 2']],
      ['Sabrina Glevissig', 4, 'r', null, 0, ['Sabrina Glevissig']],
      ['Sheldon Skaggs', 4, 'r', null, 0, ['Shelden Skaggs']],
      ['Siege Tower', 6, 's', null, 0, ['Siege Tower 1', 'Siege Tower 2']],
      ['Siegfried of Denesle', 5, 'c', null, 0, ['Siegfried of Denesle']],
      ['Sigismund Dijkstra', 4, 'c', 'spy', 0, ['Sigismund Dijkstra']],
      ['Síle de Tansarville', 5, 'r', null, 0, ['Sile de Tansarville']],
      ['Thaler', 1, 's', 'spy', 0, ['Thaler']],
      ['Trebuchet', 6, 's', null, 0, ['Trebuchet  1', 'Trebuchet  2']],
      ['Vernon Roche', 10, 'c', null, 1, ['Vernon Roche']],
      ['Ves', 5, 'c', null, 0, ['Ves']],
      ['Yarpen Zigrin', 2, 'c', null, 0, ['Yarpen Zigrin']]
    ],
    st: [
      ['Barclay Els', 6, 'a', null, 0, ['Barclay Els']],
      ['Ciaran aep Easnillien', 3, 'a', null, 0, ['Ciaran aep Easnillien']],
      ['Dennis Cranmer', 6, 'c', null, 0, ['Dennis Cranmer']],
      ['Dol Blathanna Archer', 4, 'r', null, 0, ['Dol Blathanna Archer']],
      ['Dol Blathanna Scout', 6, 'a', null, 0, ['Dol Blathanna Scout 1', 'Dol Blathanna Scout 2', 'Dol Blathanna Scout 3']],
      ['Dwarven Skirmisher', 3, 'c', 'muster', 0, ['Dwarven Skirmisher 1', 'Dwarven Skirmisher 2', 'Dwarven Skirmisher 3']],
      ['Eithné', 10, 'r', null, 1, ['Eithné']],
      ['Elven Skirmisher', 2, 'r', 'muster', 0, ['Elven Skirmisher 1', 'Elven Skirmisher 2', 'Elven Skirmisher 3']],
      ['Filavandrel aén Fidháil', 6, 'a', null, 0, ['Filavandrel aen Fidhail']],
      ['Havekar Healer', 0, 'r', 'medic', 0, ['Havekar Healer 1', 'Havekar Healer 2', 'Havekar Healer 3']],
      ['Havekar Smuggler', 5, 'c', 'muster', 0, ['Havekar Smuggler 1', 'Havekar Smuggler 2', 'Havekar Smuggler 3']],
      ['Ida Emean aep Sivney', 6, 'r', null, 0, ['Ida Emean aep Sivney']],
      ['Iorveth', 10, 'r', null, 1, ['Iorveth']],
      ['Isengrim Faoiltiarna', 10, 'c', 'morale', 1, ['Isengrim Faolitarna']],
      ['Mahakaman Defender', 5, 'c', null, 0, ['Mahakaman Defender 1', 'Mahakaman Defender 2', 'Mahakaman Defender 3', 'Mahakaman Defender 4', 'Mahakaman Defender 5']],
      ['Milva', 10, 'r', 'morale', 1, ['Milva']],
      ['Riordain', 1, 'r', null, 0, ['Riordain']],
      ['Saesenthessis', 10, 'r', null, 1, ['Saesenthessis']],
      ['Schirrú', 8, 's', 'scorch', 0, ['Schirru']],
      ['Toruviel', 2, 'r', null, 0, ['Toruviel']],
      ['Vrihedd Brigade Recruit', 4, 'r', null, 0, ['Vrihedd Brigade Recruit']],
      ['Vrihedd Brigade Veteran', 5, 'a', null, 0, ['Vrihedd Brigade Veteran 1', 'Vrihedd Brigade Veteran 2']],
      ['Yaevinn', 6, 'a', null, 0, ['Yaevinn']]
    ],
    /* Neutral units: two paintings of one card where there are two files
       (Geralt 1 and Geralt 2 are the same Geralt) — a unique hero, one to a
       deck, as in The Witcher 3. Gaunter O'Dimm: Darkness is three identical
       files, so three copies. INFERRED: the reading of "1/2" as alternate art. */
    /* Copies as the wiki's "Source" column counts them ("2 are part of the base
       deck, 1 won from …" = three). The three transformed cards are tokens:
       never in a deck, they replace a card on the board. */
    sk: [
      ['Berserker', 4, 'c', 'berserk', 0, ['Berserker'], 1, { into: 'transformed_vildkaarl' }],
      ['Birna Bran', 2, 'c', 'medic', 0, ['Birna_Bran'], 1],
      ['Blueboy Lugos', 6, 'c', null, 0, ['Blueboy_Lugos'], 1],
      ['Cerys', 10, 'c', 'summon', 1, ['Cerys'], 1, { calls: 'clan_drummond_shield_maiden' }],
      ['Clan Brokvar Archer', 6, 'r', null, 0, ['Clan_Brokvar_Archer'], 3],
      ['Clan Dimun Pirate', 6, 'r', 'scorchAll', 0, ['Clan_Dimun_Pirate'], 1],
      ['Clan Drummond Shield Maiden', 4, 'c', 'bond', 0, ['Clan_Drummond_Shield_Maiden_2'], 3],
      ['Clan Heymaey Skald', 4, 'c', null, 0, ['Clan_Heymaey_Skald'], 1],
      ['Clan Tordarroch Armorsmith', 4, 'c', null, 0, ['Clan_Tordarroch_Armorsmith'], 1],
      ['Clan an Craite Warrior', 6, 'c', 'bond', 0, ['Clan_an_Craite_Warrior'], 1],
      ['Donar an Hindar', 4, 'c', null, 0, ['Donar_an_Hindar'], 1],
      ['Draig Bon-Dhu', 2, 's', 'horn', 0, ['Draig_Bon-Dhu'], 1],
      ['Ermion', 8, 'r', 'mardroeme', 1, ['Ermion'], 1],
      ['Hemdall', 11, 'c', null, 1, ['Hemdall'], 0, { token: true }],
      ['Hjalmar', 10, 'r', null, 1, ['Hjalmar'], 1],
      ['Holger Blackhand', 4, 's', null, 0, ['Holger_Blackhand'], 1],
      ['Kambi', 0, 'c', 'avenger', 0, ['Kambi'], 1, { avenger: 'hemdall' }],
      ['Light Longship', 4, 'r', 'muster', 0, ['Light_Longship'], 3],
      ['Madman Lugos', 6, 'c', null, 0, ['Madman_Lugos'], 1],
      ['Olaf', 12, 'a', 'morale', 0, ['Olaf'], 1],
      ['Svanrige', 4, 'c', null, 0, ['Svanrige'], 1],
      ['Transformed Vildkaarl', 14, 'c', 'morale', 0, ['Transformed_Vildkaarl'], 0, { token: true }],
      ['Transformed Young Vildkaarl', 8, 'r', 'bond', 0, ['Transformed_young_vildkaarl'], 0, { token: true }],
      ['Udalryk', 4, 'c', null, 0, ['Udalryk'], 1],
      ['War Longship', 6, 's', 'bond', 0, ['War_Longship'], 3],
      ['Young Berserker', 2, 'r', 'berserk', 0, ['Young_Berserker'], 3, { into: 'transformed_young_vildkaarl' }]
    ],
    ne: [
      ['Bovine Defense Force', 8, 'c', null, 0, ['Bovine Defense Force'], 1],
      ['Cirilla Fiona Elen Riannon', 15, 'c', null, 1, ['Cirilla Fiona Elen Rianno 1', 'Cirilla Fiona Elen Rianno 2'], 1],
      ['Cow', 0, 'r', null, 0, ['Cow'], 1],
      ['Dandelion', 2, 'c', 'horn', 0, ['Dandelion 1', 'Dandelion 2'], 1],
      ['Emiel Regis Rohellec Terzieff', 5, 'c', null, 0, ['Emiel Regis Rohellec Terzieff 1', 'Emiel Regis Rohellec Terzieff 2'], 1],
      ['Gaunter O’Dimm: Darkness', 4, 'r', 'muster', 0, ['Gaunter O\'Dimm Darkness 1', 'Gaunter O\'Dimm Darkness 2', 'Gaunter O\'Dimm Darkness 3'], 3],
      ['Gaunter O’Dimm', 2, 's', 'muster', 0, ['Gaunter O\'Dimm'], 1],
      ['Geralt of Rivia', 15, 'c', null, 1, ['Geralt of Rivia 1', 'Geralt of Rivia 2'], 1],
      ['Mysterious Elf', 0, 'c', 'spy', 1, ['Mysterious Elf 1', 'Mysterious Elf 2'], 1],
      ['Olgierd von Everec', 6, 'a', 'morale', 0, ['Olgierd von Everec'], 1],
      ['Triss Merigold', 7, 'c', null, 1, ['Triss Merigold 1', 'Triss Merigold 2'], 1],
      ['Vesemir', 6, 'c', null, 0, ['Vesemir 1', 'Vesemir 2'], 1],
      ['Villentretenmerth', 7, 'c', 'scorch', 0, ['Villentretenmerth 1', 'Villentretenmerth 2'], 1],
      ['Yennefer of Vengerberg', 7, 'r', 'medic', 1, ['Yennefer of Vengerberg 1', 'Yennefer of Vengerberg 2'], 1],
      ['Zoltan Chivay', 5, 'c', null, 0, ['Zoltan Chivay 1', 'Zoltan Chivay 2'], 1]
    ]
  };
  /* The neutral special cards: copies as the files count them. */
  const SPECIAL_FILES = {
    frost: ['Biting Frost  1', 'Biting Frost  2', 'Biting Frost  3'],
    fog: ['Impenetrable Fog 1', 'Impenetrable Fog 2', 'Impenetrable Fog 3'],
    rain: ['Torrential Rain 1', 'Torrential Rain 2', 'Torrential Rain 3'],
    clear: ['Clear Weather 1', 'Clear Weather 2', 'Clear Weather 3'],
    horn: ['Commander\'s Horn 1', 'Commander\'s Horn 2', 'Commander\'s Horn 3', 'Commander\'s Horn 4'],
    decoy: ['Decoy 1', 'Decoy 2', 'Decoy 3'],
    scorch: ['Scorch 1', 'Scorch 2', 'Scorch 3'],
    storm: ['Skellige/Skellige_Storm', null, null],      // three copies, one painting
    mardroeme: ['Skellige/Mardroeme', null, null]
  };

  /* The twenty leaders, each with its printed ability. `passive` ones are
     always on (no button); the rest are used once a game, as a turn. */
  const LEADERS = [
    { id: 'eredin_treacherous', fac: 'mo', name: 'Eredin Bréacc Glas', title: 'The Treacherous', file: 'Eredin Breacc Glas The Treacherous', ab: 'spies2', passive: true,
      text: 'Every spy on the board, on either side, has double strength. Always on.' },
    { id: 'eredin_bringer', fac: 'mo', name: 'Eredin', title: 'Bringer of Death', file: 'Eredin Bringer of Death', ab: 'swap21',
      text: 'Discard two cards from your hand, then take any one card you like from your deck.' },
    { id: 'eredin_commander', fac: 'mo', name: 'Eredin', title: 'Commander of the Red Riders', file: 'Eredin Commander of the Red Riders', ab: 'anyWeather',
      text: 'Take any weather card from your deck and play it at once.' },
    { id: 'eredin_destroyer', fac: 'mo', name: 'Eredin', title: 'Destroyer of Worlds', file: 'Eredin Destroyer of Worlds', ab: 'restoreHand',
      text: 'Take a card from your discard pile back into your hand.' },
    { id: 'eredin_king', fac: 'mo', name: 'Eredin', title: 'King of the Wild Hunt', file: 'Eredin King of the Wild Hunt', ab: 'horn0',
      text: 'Doubles all your Close Combat units (not if a Commander’s Horn is already on that row).' },
    { id: 'emhyr_emperor', fac: 'ng', name: 'Emhyr var Emreis', title: 'Emperor of Nilfgaard', file: 'Emhyr var Emreis Emperor of Nilfgaard', ab: 'peek3',
      text: 'Look at three random cards from your opponent’s hand.' },
    { id: 'emhyr_majesty', fac: 'ng', name: 'Emhyr var Emreis', title: 'His Imperial Majesty', file: 'Emhyr var Emreis His Imperial Majesty', ab: 'rain',
      text: 'Take a Torrential Rain from your deck and play it at once.' },
    { id: 'emhyr_invader', fac: 'ng', name: 'Emhyr var Emreis', title: 'Invader of the North', file: 'Emhyr var Emreis Invader of The North', ab: 'randomRevive', passive: true,
      text: 'Any ability that brings a unit back to the field brings back one chosen at random — for both players. Always on.' },
    { id: 'emhyr_relentless', fac: 'ng', name: 'Emhyr var Emreis', title: 'The Relentless', file: 'Emhyr var Emreis the Relentless', ab: 'stealDiscard',
      text: 'Take a card from your opponent’s discard pile into your hand.' },
    { id: 'emhyr_whiteflame', fac: 'ng', name: 'Emhyr var Emreis', title: 'The White Flame', file: 'Emhyr var Emreis the White Flame', ab: 'cancel', passive: true,
      text: 'Your opponent’s leader ability does nothing. Always on.' },
    { id: 'foltest_king', fac: 'nr', name: 'Foltest', title: 'King of Temeria', file: 'Foltest King of Temeria', ab: 'fog',
      text: 'Take an Impenetrable Fog from your deck and play it at once.' },
    { id: 'foltest_lord', fac: 'nr', name: 'Foltest', title: 'Lord Commander of the North', file: 'Foltest Lord Commander of the North', ab: 'clear',
      text: 'Clears every weather effect in play.' },
    { id: 'foltest_son', fac: 'nr', name: 'Foltest', title: 'Son of Medell', file: 'Foltest Son of Medell', ab: 'burn1',
      text: 'Destroys the strongest unit or units in your opponent’s Ranged row.' },
    { id: 'foltest_siege', fac: 'nr', name: 'Foltest', title: 'The Siegemaster', file: 'Foltest the Siegemaster', ab: 'horn2',
      text: 'Doubles all your Siege units (not if a Commander’s Horn is already on that row).' },
    { id: 'foltest_steel', fac: 'nr', name: 'Foltest', title: 'The Steel-Forged', file: 'Foltest the Steel-Forged', ab: 'burn2at10',
      text: 'If your opponent’s Siege units add up to 10 or more, their strongest there are destroyed.' },
    { id: 'francesca_daisy', fac: 'st', name: 'Francesca Findabair', title: 'Daisy of the Valley', file: 'Francesca Findabair Daisy of The Valle', ab: 'extraCard', passive: true,
      text: 'You start the battle with one extra card in hand. Always on.' },
    { id: 'francesca_hope', fac: 'st', name: 'Francesca Findabair', title: 'Hope of the Aen Seidhe', file: 'Francesca Findabair Hope of the Aen Seidhe', ab: 'agileBest',
      text: 'Moves each of your Agile units to whichever of its two rows makes it strongest.' },
    { id: 'francesca_pureblood', fac: 'st', name: 'Francesca Findabair', title: 'Pureblood Elf', file: 'Francesca Findabair Pureblood Elf', ab: 'frost',
      text: 'Take a Biting Frost from your deck and play it at once.' },
    { id: 'francesca_queen', fac: 'st', name: 'Francesca Findabair', title: 'Queen of Dol Blathanna', file: 'Francesca Findabair Queen of Dol Blathanna', ab: 'burn0at10',
      text: 'If your opponent’s Close Combat units add up to 10 or more, their strongest there are destroyed.' },
    { id: 'francesca_beautiful', fac: 'st', name: 'Francesca Findabair', title: 'The Beautiful', file: 'Francesca Findabair the Beautiful', ab: 'horn1',
      text: 'Doubles all your Ranged units (not if a Commander’s Horn is already on that row).' },
    { id: 'crach', fac: 'sk', name: 'Crach an Craite', title: 'Jarl of Ard Skellig', file: 'Crach_an_Craite', ab: 'shuffleBack',
      text: 'Each player shuffles their whole discard pile back into their deck.' },
    { id: 'bran', fac: 'sk', name: 'King Bran', title: 'King of Skellige', file: 'King_Bran', ab: 'halfWeather', passive: true,
      text: 'Bad weather costs your units only half their strength. Always on.' }
  ];

  /* ---------------- building the card table ---------------- */
  const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const CARDS = {};
  const ORDER = [];
  const ROWCODE = { c: [0], r: [1], s: [2], a: [0, 1] };
  /* Muster: "every card with the same name" — read as the name before the
     colon, so the three Crones, the five Vampires and Gaunter O'Dimm with his
     Darkness muster each other; Arachas Behemoth musters with the Arachas.
     INFERRED (W3 reads them this way; the rules card says only "same name"). */
  const groupOf = name => /^Arachas/.test(name) ? 'arachas' : slug(name.split(':')[0]);
  for (const fac of Object.keys(RAW)) {
    const folder = fac === 'ne' ? 'Neutral Units' : FACTIONS.find(f => f.id === fac).folder;
    for (const r of RAW[fac]) {
      const [name, str, row, ab, hero, files, copies, extra] = r;
      const id = slug(name);
      CARDS[id] = Object.assign({
        id, name, fac, kind: 'unit', str, rows: ROWCODE[row], agile: row === 'a', ab: ab || null, hero: !!hero,
        group: ab === 'muster' ? groupOf(name) : null,
        count: copies != null ? copies : files.length,
        files: files.map(f => folder + '/' + f), pics: files.length
      }, extra || {});
      ORDER.push(id);
    }
  }
  for (const k of Object.keys(SPECIALS)) {
    const id = 'sp_' + k;
    const files = SPECIAL_FILES[k];
    const X = SPECIALS[k];
    const rows = X.rows || (X.row != null ? [X.row] : []);
    const real = files.filter(Boolean);
    CARDS[id] = { id, name: X.name, fac: X.fac || 'ne', kind: 'special', sp: k, str: 0, rows, ab: null, hero: false, slot: !!X.slot,
      count: files.length, files: real.map(f => f.indexOf('/') >= 0 ? f : 'Neutrals/' + f), pics: real.length ? 1 : 0, text: X.text, weather: !X.slot && rows.length > 0 };
    ORDER.push(id);
  }
  const LEADER = {};
  for (const L of LEADERS) {
    const fac = FACTIONS.find(f => f.id === L.fac);
    LEADER[L.id] = Object.assign({ kind: 'leader', files: L.file ? [fac.folder + '/' + L.file] : [], pics: L.file ? 1 : 0 }, L);
  }

  /* The number in the art file name, for cards whose copies are each painted
     differently: copy k of a card uses picture k (mod the paintings). */
  const artFile = (id, k) => {
    const c = CARDS[id] || LEADER[id];
    if (!c || !c.pics) return null;
    const n = c.pics;
    return n > 1 ? id + '_' + (((k || 0) % n) + 1) + '.webp' : id + '.webp';
  };

  /* What a faction may put in a deck: its own cards plus every neutral one. */
  function collection(fac) {
    return ORDER.filter(id => (CARDS[id].fac === fac || CARDS[id].fac === 'ne') && CARDS[id].count > 0).map(id => ({ id, max: CARDS[id].count }));
  }
  const leadersOf = fac => LEADERS.filter(L => L.fac === fac).map(L => L.id);

  /* The deck rules of The Witcher 3 (INFERRED, the rules cards are silent):
     at least 22 unit cards, at most 10 special cards. */
  const DECK = { minUnits: 22, maxSpecials: 10, hand: 10, redraws: 2 };

  /* A standard deck for each faction, hand-built: every hero the faction
     has, its spies and medics, one strong muster or bond package, four
     neutral heroes, and ten specials. The house plays these; a phone can
     take one as it is or change it. */
  const SPECIAL_SET = ['sp_decoy', 'sp_decoy', 'sp_horn', 'sp_horn', 'sp_scorch', 'sp_scorch', 'sp_frost', 'sp_fog', 'sp_rain', 'sp_clear'];
  const NEUTRAL_SET = ['geralt_of_rivia', 'cirilla_fiona_elen_riannon', 'yennefer_of_vengerberg', 'triss_merigold'];
  const STANDARD = {
    nr: NEUTRAL_SET.concat(['philippa_eilhart', 'vernon_roche', 'esterad_thyssen', 'john_natalis', 'prince_stennis', 'sigismund_dijkstra', 'thaler',
      'blue_stripes_commando', 'blue_stripes_commando', 'blue_stripes_commando', 'catapult', 'catapult', 'crinfrid_reavers_dragon_hunter', 'crinfrid_reavers_dragon_hunter',
      'crinfrid_reavers_dragon_hunter', 'dun_banner_medic', 'keira_metz', 'sile_de_tansarville', 'dethmold', 'trebuchet', 'ballista', 'siege_tower', 'kaedweni_siege_expert', 'kaedweni_siege_expert']),
    ng: NEUTRAL_SET.concat(['letho_of_gulet', 'menno_coehoorn', 'morvran_voorhis', 'tibor_eggebracht', 'shilard_fitz_oesterlen', 'stefan_skellen', 'vattier_de_rideaux',
      'black_infantry_archer', 'black_infantry_archer', 'heavy_zerrikanian_fire_scorpion', 'impera_brigade_guard', 'impera_brigade_guard', 'impera_brigade_guard', 'impera_brigade_guard',
      'young_emissary', 'young_emissary', 'etolian_auxiliary_archers', 'etolian_auxiliary_archers', 'siege_technician', 'assire_var_anahid', 'fringilla_vigo']),
    st: NEUTRAL_SET.concat(['mysterious_elf', 'eithne', 'iorveth', 'isengrim_faoiltiarna', 'saesenthessis', 'milva', 'havekar_smuggler', 'havekar_smuggler', 'havekar_smuggler',
      'dwarven_skirmisher', 'dwarven_skirmisher', 'dwarven_skirmisher', 'elven_skirmisher', 'elven_skirmisher', 'elven_skirmisher', 'havekar_healer', 'schirru',
      'dol_blathanna_scout', 'dol_blathanna_scout']),
    mo: NEUTRAL_SET.concat(['draug', 'imlerith', 'kayran', 'leshen', 'arachas', 'arachas', 'arachas', 'arachas_behemoth', 'nekker', 'nekker', 'nekker', 'ghoul',
      'ghoul', 'ghoul', 'griffin', 'werewolf', 'fire_elemental', 'earth_elemental', 'ice_giant']),
    /* Measured: Berserkers drag a deck down unless the Mardroeme turns up,
       so the standard deck keeps two and one Mardroeme for the flavour. */
    sk: NEUTRAL_SET.concat(['mysterious_elf', 'cerys', 'hjalmar', 'ermion', 'olaf', 'clan_dimun_pirate', 'clan_drummond_shield_maiden', 'clan_drummond_shield_maiden',
      'clan_drummond_shield_maiden', 'light_longship', 'light_longship', 'light_longship', 'war_longship', 'war_longship', 'war_longship', 'clan_brokvar_archer',
      'kambi', 'birna_bran', 'young_berserker', 'young_berserker'])
  };
  for (const k of Object.keys(STANDARD)) STANDARD[k] = STANDARD[k].concat(k === 'sk'
    ? ['sp_mardroeme', 'sp_decoy', 'sp_decoy', 'sp_horn', 'sp_horn', 'sp_scorch', 'sp_scorch', 'sp_storm', 'sp_frost', 'sp_clear'] : SPECIAL_SET);
  /* The house's leader for each faction when the room leaves it to the house. */
  const HOUSE_LEADER = { nr: 'foltest_siege', ng: 'emhyr_relentless', mo: 'eredin_king', st: 'francesca_pureblood', sk: 'bran' };

  /* Is this a legal deck for that faction? Returns a reason or null. */
  function deckProblem(fac, cards) {
    if (!FACTIONS.some(f => f.id === fac)) return 'Choose a faction.';
    if (!Array.isArray(cards)) return 'Choose your cards.';
    const n = {};
    let units = 0, specials = 0;
    for (const id of cards) {
      const c = CARDS[id];
      if (!c) return 'An unknown card.';
      if (c.fac !== fac && c.fac !== 'ne') return c.name + ' is not a ' + FACTIONS.find(f => f.id === fac).name + ' card.';
      n[id] = (n[id] || 0) + 1;
      if (n[id] > c.count) return 'Only ' + c.count + ' ' + c.name + (c.count === 1 ? '' : 's') + ' in the collection.';
      if (c.kind === 'unit') units++; else specials++;
    }
    if (units < DECK.minUnits) return 'A deck needs at least ' + DECK.minUnits + ' unit cards (this has ' + units + ').';
    if (specials > DECK.maxSpecials) return 'A deck may hold at most ' + DECK.maxSpecials + ' special cards (this has ' + specials + ').';
    return null;
  }
  function deckStats(cards) {
    let units = 0, specials = 0, heroes = 0, str = 0;
    for (const id of cards) { const c = CARDS[id]; if (!c) continue; if (c.kind === 'unit') { units++; str += c.str; if (c.hero) heroes++; } else specials++; }
    return { units, specials, heroes, str, size: cards.length };
  }

  /* ================================================================
     The board arithmetic — shared by the engine, the house and the phones
     ================================================================
     board = { wx: [bool, bool, bool], spies2: bool,
               sides: [ { rows: [ { units: [unit], horn: card|null, lhorn: bool } x3 ] } x2 ] }
     unit  = { uid, id }   (a Decoy on the board is a unit with id 'sp_decoy') */
  const isDecoy = u => u.id === 'sp_decoy';
  /* A row's special slot holds a Commander's Horn or a Mardroeme. */
  function hornOn(row) { return !!((row.horn && row.horn.id === 'sp_horn') || row.lhorn); }
  function mardOn(row) { return !!((row.horn && row.horn.id === 'sp_mardroeme') || row.units.some(x => CARDS[x.id] && CARDS[x.id].ab === 'mardroeme')); }
  /* The strength of one unit where it stands. The Witcher 3's order: weather
     first (a unit fights at 1, never more than it is), then Tight Bond
     multiplies, Morale Boost adds, and a horn doubles. Heroes are untouched. */
  function strengthOf(board, s, r, u) {
    const c = CARDS[u.id];
    if (!c || isDecoy(u)) return 0;
    let v = c.str + (u.up || 0);   // a card honed in the run (gw-run.js)
    if (c.ab === 'spy' && board.spies2) v *= 2;
    if (c.hero) return v;
    const row = board.sides[s].rows[r];
    /* King Bran: his side loses only half its strength to the weather. */
    if (board.wx[r]) v = board.half && board.half[s] ? Math.max(Math.min(v, 1), Math.floor(v / 2)) : Math.min(v, 1);
    if (c.ab === 'bond') v *= row.units.filter(x => x.id === u.id).length;
    v += row.units.filter(x => x !== u && CARDS[x.id] && CARDS[x.id].ab === 'morale').length;
    if (hornOn(row) || row.units.some(x => x !== u && CARDS[x.id] && CARDS[x.id].ab === 'horn')) v *= 2;
    return v;
  }
  function rowTotal(board, s, r) { return board.sides[s].rows[r].units.reduce((t, u) => t + strengthOf(board, s, r, u), 0); }
  function sideTotal(board, s) { return [0, 1, 2].reduce((t, r) => t + rowTotal(board, s, r), 0); }
  /* Scorch: the strongest non-hero units on the whole board (both sides),
     all of them if they tie. Nothing at strength 0 burns. */
  function scorchVictims(board) {
    let best = 0;
    const all = [];
    board.sides.forEach((sd, s) => sd.rows.forEach((row, r) => row.units.forEach(u => {
      const c = CARDS[u.id];
      if (!c || c.hero || isDecoy(u)) return;
      const v = strengthOf(board, s, r, u);
      all.push({ s, r, u, v });
      if (v > best) best = v;
    })));
    return best > 0 ? all.filter(x => x.v === best) : [];
  }
  /* The row scorch of Villentretenmerth, Toad, Schirrú and two leaders:
     the strongest non-hero units in one of the opponent's rows, if that row
     adds up to `min` or more (min 0 = always, Foltest Son of Medell). */
  function rowScorchVictims(board, s, r, min) {
    if (rowTotal(board, s, r) < (min || 0)) return [];
    let best = 0;
    const list = [];
    board.sides[s].rows[r].units.forEach(u => {
      const c = CARDS[u.id];
      if (!c || c.hero || isDecoy(u)) return;
      const v = strengthOf(board, s, r, u);
      list.push({ s, r, u, v });
      if (v > best) best = v;
    });
    return best > 0 ? list.filter(x => x.v === best) : [];
  }
  /* Where an Agile unit is strongest (Francesca, Hope of the Aen Seidhe):
     the row that gives it the higher strength; a tie leaves it where it is. */
  function agileBest(board, s, u, from) {
    const vals = [0, 1].map(r => {
      const row = board.sides[s].rows[r];
      const had = row.units.indexOf(u);
      if (had < 0) row.units.push(u);
      const v = strengthOf(board, s, r, u);
      if (had < 0) row.units.pop();
      return v;
    });
    if (vals[0] === vals[1]) return from;
    return vals[0] > vals[1] ? 0 : 1;
  }
  function emptyBoard() {
    return { wx: [false, false, false], spies2: false, half: [false, false], sides: [0, 1].map(() => ({ rows: [0, 1, 2].map(() => ({ units: [], horn: null, lhorn: false })) })) };
  }

  const nameOf = id => { const c = CARDS[id] || LEADER[id]; return c ? c.name + (c.kind === 'leader' ? ' — ' + c.title : '') : String(id); };
  const card = id => CARDS[id] || LEADER[id] || null;
  const faction = id => FACTIONS.find(f => f.id === id) || null;
  /* What a card does, in a line. */
  function textOf(id) {
    const c = card(id);
    if (!c) return '';
    if (c.kind === 'leader') return c.text;
    if (c.kind === 'special') return c.text;
    const bits = [];
    if (c.hero) bits.push(ABIL.hero.text);
    if (c.agile) bits.push(ABIL.agile.text);
    if (c.ab) bits.push(c.ab === 'scorch' ? 'Scorch — ' + ROW_NAME[c.rows[0]] + ': if the opponent’s ' + ROW_NAME[c.rows[0]] + ' units add up to 10 or more, their strongest there are destroyed.' : ABIL[c.ab].text);
    if (c.into) bits.push('It becomes ' + CARDS[c.into].name + ' (' + CARDS[c.into].str + (CARDS[c.into].ab ? ', ' + ABIL[CARDS[c.into].ab].name : '') + ').');
    if (c.avenger) bits.push('It becomes ' + CARDS[c.avenger].name + ', a hero of ' + CARDS[c.avenger].str + '.');
    if (c.token) bits.push('Never in a deck: it takes the place of another card on the board.');
    return bits.join(' ');
  }

  const MANIFEST = {
    built: [
      'The five factions of The Witcher 3’s Gwent: Northern Realms, Nilfgaardian Empire, Monsters and Scoia’tael with their printed bonuses, and Skellige from Blood and Wine.',
      'Every card in the collection the art folder holds: 156 faction unit cards, 15 neutral units (17 copies) and 22 special cards, with the printed strength, row and ability.',
      'All twenty-two leaders: twenty from the printed cards (twelve used once a game as a turn, four always on), and Skellige’s Crach an Craite and King Bran.',
      'Skellige in full, from the Witcher Wiki’s card list: Berserkers that turn into bears under Mardroeme, Cerys and her Shield Maidens, Kambi who becomes Hemdall, the Clan Dimun Pirate’s Scorch, Skellige Storm, and two units back from the dead at the start of round three. Its pictures are The Witcher 3’s in-game cards (no Skellige card back).',
      'Decks: a standard deck for each faction, or build your own on your phone (at least 22 units, at most 10 specials).',
      'Ten cards in hand, then redraw up to two. Two out of three rounds; two gems each.',
      'House players at three levels, the house’s turns paced for reading, undo back to the start of your turn, a card at the start and end of every round, and the winner reveal.'
    ],
    notBuilt: [
      'A Skellige card back (the drawn one stands in).',
      'A baked Blender scene for Scorch or the end of a round — they are held cards on the telly.',
      'Phones-only solo play without the telly.'
    ],
    decisions: [
      'Copies: a card with several picture files has that many copies (three Arachas, five Blue Stripes Commandos), except neutral units, whose two files are two paintings of one card: Geralt, Ciri, Yennefer, Triss and the others are one to a deck. Gaunter O’Dimm: Darkness is three identical files, so three copies.',
      'Muster reads "the same name" as the name before the colon: the three Crones muster each other, so do the five Vampires, and Gaunter O’Dimm with his Darkness; Arachas Behemoth musters with the Arachas. Muster draws only from the deck, never the hand.',
      'Row scorch (Villentretenmerth, Toad, Schirrú) hits the opponent’s row of the card’s own row: Close for Villentretenmerth, Ranged for Toad, Siege for Schirrú.',
      'Foltest, Son of Medell destroys the strongest unit in the Ranged row with no minimum, as his card is printed (The Witcher 3 needed the row to add up to 10).',
      'Weather sets a unit to strength 1 but never raises one: a Cow or a Havekar Healer stays at 0.',
      'Strength is worked out in The Witcher 3’s order: weather, then Tight Bond multiplies, Morale Boost adds, a horn doubles. A spy doubled by Eredin the Treacherous is doubled first.',
      'A Commander’s Horn and Dandelion on the same row double it once, not twice. The leaders’ "double a row" abilities are a horn on that row, so they do nothing where a horn already is.',
      'Decoy swaps with a unit on your own side of the board, a spy the opponent put there included (it comes back to your hand). Heroes cannot be decoyed.',
      'Scorch (the special card) burns the strongest non-hero units on both sides, all of them on a tie; nothing at strength 0 burns.',
      'A card destroyed or cleared away goes to the discard pile of the side it was on, so a spy dies into its victim’s pile (and their medic can bring it back as their own spy).',
      'The Monsters keep one random unit card (heroes included, a Decoy never) on the board at the end of a round.',
      'Who begins: a coin flip in round one, then the winner of the last round begins the next (on a drawn round, the player who did not begin it). A Scoia’tael player chooses instead, every round, as the card says. If both players are Scoia’tael, the usual rule applies.',
      'A drawn round costs both players a gem, unless exactly one of them is Nilfgaard. Both out of gems at once is a drawn game.',
      'A player with no cards in hand and no leader ability left passes automatically.',
      'Eredin the Treacherous, Emhyr Invader of the North, Emhyr the White Flame and Francesca Daisy of the Valley are always on (The Witcher 3 plays them that way); the White Flame switches the opponent’s leader off, passive or not.',
      'A second copy of a weather already on the board does nothing more and goes straight to the discard pile.',
      'Skellige comes from the Witcher Wiki’s card list (archived 2024-12-25), copies as its Source column counts them. That gives one Clan an Craite Warrior: a Tight Bond card with nobody to bond with, as listed.',
      'Mardroeme goes in a row’s special slot, the one a Commander’s Horn uses: one or the other. Ermion carries a Mardroeme on his own row. A Berserker turns into its bear when a Mardroeme arrives on its row, or when it arrives on a row that has one. A bear stays a bear, in the discard pile too.',
      'Cerys summons the Shield Maidens from the deck and the hand alike.',
      'Kambi becomes Hemdall when it leaves the board — destroyed, or cleared at the end of a round (Hemdall then stands into the next round) — but not when a Decoy takes it back to hand. Hemdall never enters a deck: Crach an Craite leaves him in the discard pile.',
      'The Clan Dimun Pirate’s Scorch is the whole-board kind and can burn the Pirate itself.',
      'King Bran halves strength lost to the weather on his own side only, rounding down, never below 1 (a unit of 0 stays 0).',
      'Skellige’s round-three revival picks two random non-hero units from its own discard pile and sets them in their row (an Agile one in Close Combat). Their abilities do not fire: they are summoned, not played.',
      'Skellige Storm is a neutral card, as the wiki notes: any deck may hold it.'
    ]
  };

  const Data = {
    VERSION, ROWS, ROW_NAME, ROW_SHORT, FACTIONS, ABIL, SPECIALS, CARDS, ORDER, LEADERS, LEADER, DECK, STANDARD, HOUSE_LEADER, MANIFEST,
    card, nameOf, textOf, faction, collection, leadersOf, deckProblem, deckStats, artFile, slug,
    emptyBoard, strengthOf, rowTotal, sideTotal, scorchVictims, rowScorchVictims, agileBest, hornOn, mardOn, isDecoy
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.GwentData = Data;
})(typeof window !== 'undefined' ? window : this);
