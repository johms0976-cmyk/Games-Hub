'use strict';
/* Gwent — The Path: a single-player deck-building run, in the manner of
 * Slay the Spire and Inscryption. No DOM, no timers; one seeded rng whose
 * state lives in the run itself, so a run is plain JSON and saves whole.
 *
 * A run: choose a faction and a leader, take a weak starter deck down three
 * acts of a branching map (battles, contracts, merchants, campfires, strange
 * encounters, treasure), and beat each act's boss. Battles are ordinary
 * Gwent against the house (gw-engine.js + gw-bots.js), played by run.html.
 * Between them the deck grows: a card after every win (or none — a weak card
 * dilutes a ten-card hand), honing at a campfire (+2 strength on that one
 * copy), removal at a merchant, and trinkets that bend the rules of every
 * battle (gw-engine.js `mods`).
 *
 * Lives, not hit points: lose a battle and you lose a life. Lose a boss and
 * you lose a life and face it again. No lives left ends the run.
 *
 * Every action is `R.<verb>(run, ...)` and returns { ok, why } like the
 * engine; the page re-renders from `run.screen`.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gw-data.js') : root.GwentData;
  const VERSION = 1;
  const yes = extra => Object.assign({ ok: true }, extra || {});
  const no = why => ({ ok: false, why });
  const C = id => D.card(id);

  /* ---------------- the rng: state in run.rs ---------------- */
  function rnd(run) {
    run.rs = (run.rs + 0x6D2B79F5) >>> 0;
    let t = run.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (run, a, b) => a + Math.floor(rnd(run) * (b - a + 1));
  const pickOne = (run, list) => list[Math.floor(rnd(run) * list.length)];
  function shuffled(run, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(run) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function weighted(run, pairs) {
    const tot = pairs.reduce((t, p) => t + p[1], 0);
    let x = rnd(run) * tot;
    for (const p of pairs) { x -= p[1]; if (x < 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }

  /* ================================================================
     Settings
     ================================================================ */
  const DIFFICULTY = {
    apprentice: { name: 'Just the Story', lives: 4, shift: -1, foeHand: 0, text: 'Four lives, and every opponent plays a notch more gently.' },
    witcher: { name: 'Witcher', lives: 3, shift: 0, foeHand: 0, text: 'Three lives. The house plays as it was tuned.' },
    deathmarch: { name: 'Death March!', lives: 3, shift: 1, foeHand: 1, text: 'Three lives, the house at its sharpest, and every opponent holds one extra card.' }
  };
  const LEVELS = ['easy', 'medium', 'hard'];
  const ACTS = [
    { n: 1, name: 'Velen', sub: 'No Man’s Land', text: 'Bogs, burned villages and deserters. Everyone here plays for scraps.' },
    { n: 2, name: 'Novigrad', sub: 'The Free City', text: 'Spies, smugglers and witch hunters — the card tables are richer, and crueller.' },
    { n: 3, name: 'Skellige', sub: 'And the White Frost', text: 'The clans of the isles, the Empire’s best, and the Wild Hunt itself.' }
  ];
  const FLOORS = 7;            // floors before the boss
  const COLS = 5;
  const PATHS = 4;
  const MIN_DECK = 10;         // you are dealt ten: a deck can thin no further
  const HONE = 2;              // strength a hone adds
  const HONE_MAX = 6;          // a card can be honed three times
  const PRICE = { common: 40, uncommon: 65, rare: 110, legendary: 160 };
  const TRINKET_PRICE = { common: 110, uncommon: 140, rare: 175 };

  /* ================================================================
     The cards: rarity, worked out from the face
     ================================================================ */
  const AB_WORTH = { spy: 5, medic: 5, muster: 3, bond: 2, morale: 2, horn: 5, scorch: 4, scorchAll: 4, summon: 4, avenger: 6, berserk: 3, mardroeme: 3 };
  const CURSE = 'cow';         // the Cow: 0 strength, a curse in this mode
  function rarityOf(id) {
    const c = C(id);
    if (!c) return 'common';
    if (c.kind === 'special') {
      if (c.sp === 'scorch') return 'rare';
      if (c.sp === 'decoy' || c.sp === 'horn' || c.sp === 'mardroeme') return 'uncommon';
      return 'common';
    }
    if (c.hero) return c.str >= 15 ? 'legendary' : 'rare';
    const v = c.str + (AB_WORTH[c.ab] || 0);
    return v <= 5 ? 'common' : v <= 8 ? 'uncommon' : 'rare';
  }
  /* How many copies a run deck may hold: a hero once, a special three times,
     a unit as many as were printed (at least three, so a muster can grow). */
  function capOf(id) {
    const c = C(id);
    if (!c) return 0;
    if (c.hero) return 1;
    if (c.kind === 'special') return 3;
    return Math.max(3, c.count);
  }
  /* What a faction may be offered: its own cards and every neutral one,
     never a token, never the Cow, never another faction's special. */
  function poolFor(fac) {
    return D.ORDER.filter(id => {
      const c = C(id);
      if (!c || c.token || c.count === 0 || id === CURSE) return false;
      if (c.fac !== fac && c.fac !== 'ne') return false;
      if (c.sp === 'storm' && fac !== 'sk') return false;
      return true;
    });
  }

  /* ================================================================
     Starter decks: thirteen weak cards, a decoy and a weather
     ================================================================ */
  const STARTER = {
    nr: ['poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'kaedweni_siege_expert', 'yarpen_zigrin', 'sabrina_glevissig',
      'sheldon_skaggs', 'siegfried_of_denesle', 'ves', 'keira_metz', 'ballista', 'sp_decoy', 'sp_fog'],
    ng: ['nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'morteisen', 'vanhemar', 'vattier_de_rideaux', 'rotten_mangonel',
      'rainfarn', 'cynthia', 'renuald_aep_matsen', 'etolian_auxiliary_archers', 'sp_decoy', 'sp_rain'],
    mo: ['nekker', 'nekker', 'nekker', 'ghoul', 'foglet', 'harpy', 'endrega', 'botchling', 'forktail', 'grave_hag', 'frightener', 'sp_decoy', 'sp_fog'],
    st: ['elven_skirmisher', 'elven_skirmisher', 'elven_skirmisher', 'dwarven_skirmisher', 'dwarven_skirmisher', 'dol_blathanna_scout', 'ciaran_aep_easnillien',
      'vrihedd_brigade_recruit', 'dol_blathanna_archer', 'ida_emean_aep_sivney', 'havekar_healer', 'sp_decoy', 'sp_frost'],
    sk: ['clan_heymaey_skald', 'svanrige', 'udalryk', 'donar_an_hindar', 'holger_blackhand', 'young_berserker', 'young_berserker',
      'young_berserker', 'light_longship', 'light_longship', 'birna_bran', 'sp_decoy', 'sp_storm']
  };

  /* ================================================================
     Trinkets. `mods` go to the engine for every battle (summed); `run`
     ones change the run itself.
     ================================================================ */
  const TRINKETS = [
    { id: 'seal', name: 'Ducal Seal', rarity: 'common', mods: { tieWin: true }, text: 'You win every round that ends in a draw.' },
    { id: 'cat', name: 'Cat Potion', rarity: 'common', mods: { redraws: 1 }, text: 'One more redraw before each battle.' },
    { id: 'purse', name: 'Dwarven Purse', rarity: 'common', run: 'purse', text: 'Half as many crowns again from every battle.' },
    { id: 'ledger', name: 'Merchant’s Ledger', rarity: 'common', run: 'ledger', text: 'Merchants charge a quarter less.' },
    { id: 'banner', name: 'Temerian Banner', rarity: 'uncommon', mods: { winDraw: 1 }, text: 'Draw a card every time you win a round.' },
    { id: 'trophy', name: 'Griffin Trophy', rarity: 'uncommon', mods: { keep: true }, text: 'One random unit of yours stays on the board after each round.' },
    { id: 'oriole', name: 'Golden Oriole', rarity: 'uncommon', mods: { halfWeather: true }, text: 'Bad weather costs your units only half their strength.' },
    { id: 'signet', name: 'Spymaster’s Signet', rarity: 'uncommon', mods: { spyDraw: 1 }, text: 'Your spies draw three cards, not two.' },
    { id: 'medallion', name: 'Witcher Medallion', rarity: 'uncommon', mods: { start: ['sp_decoy'] }, text: 'Begin every battle with an extra Decoy in hand.' },
    { id: 'eye', name: 'Collector’s Eye', rarity: 'uncommon', run: 'eye', text: 'Card rewards offer four cards instead of three.' },
    { id: 'decoction', name: 'Raffard’s Decoction', rarity: 'uncommon', run: 'decoction', text: 'One more life, and it is full now.' },
    { id: 'whetstone', name: 'Mahakam Whetstone', rarity: 'uncommon', run: 'whetstone', text: 'Honing adds +3 strength instead of +2.' },
    { id: 'mutagen', name: 'Greater Mutagen', rarity: 'rare', mods: { hand: 1 }, text: 'You are dealt eleven cards instead of ten.' },
    { id: 'swallow', name: 'Swallow', rarity: 'rare', mods: { roundDraw: 1 }, text: 'Draw a card at the start of the second and third rounds.' },
    { id: 'crown', name: 'Crown of the Leader', rarity: 'rare', mods: { leaderUses: 2 }, text: 'Your leader’s ability can be used twice a battle.' },
    { id: 'bugle', name: 'Commander’s Bugle', rarity: 'rare', mods: { start: ['sp_horn'] }, text: 'Begin every battle with an extra Commander’s Horn in hand.' }
  ];
  const TRINKET = {};
  TRINKETS.forEach(t => { TRINKET[t.id] = t; });
  const has = (run, id) => run.trinkets.indexOf(id) >= 0;
  /* Every battle trinket summed into one `mods` for the engine. */
  function playerMods(run) {
    const m = { hand: 0, redraws: 0, winDraw: 0, spyDraw: 0, roundDraw: 0, leaderUses: 1, start: [] };
    for (const id of run.trinkets) {
      const t = TRINKET[id];
      if (!t || !t.mods) continue;
      for (const k of Object.keys(t.mods)) {
        const v = t.mods[k];
        if (k === 'start') m.start = m.start.concat(v);
        else if (k === 'leaderUses') m.leaderUses = Math.max(m.leaderUses, v);
        else if (typeof v === 'boolean') m[k] = m[k] || v;
        else m[k] = (m[k] || 0) + v;
      }
    }
    return m;
  }

  /* ================================================================
     The opponents. A deck is `size` cards drawn from `core`, so the same
     name plays a little differently each time. Levels are the house's.
     ================================================================ */
  /* Geralt and Ciri wait for Act III. */
  const BIG = { geralt_of_rivia: 1, cirilla_fiona_elen_riannon: 1 };
  const ENEMIES = {
    1: {
      battle: [
        { id: 'bandits', name: 'Crossroads Bandits', fac: 'nr', leader: 'foltest_lord', size: 12, text: 'Deserters with a stolen deck and nothing to lose.',
          core: ['poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'redanian_foot_soldier', 'redanian_foot_soldier', 'yarpen_zigrin', 'sabrina_glevissig',
            'sheldon_skaggs', 'siegfried_of_denesle', 'ves', 'kaedweni_siege_expert', 'sp_frost', 'sp_rain'] },
        { id: 'nekkers', name: 'Nekker Warren', fac: 'mo', leader: 'eredin_bringer', size: 12, text: 'Small, many, and all at once.',
          core: ['nekker', 'nekker', 'nekker', 'ghoul', 'ghoul', 'ghoul', 'foglet', 'harpy', 'celaeno_harpy', 'endrega', 'wyvern', 'gargoyle', 'cockatrice'] },
        { id: 'deserters', name: 'Nilfgaardian Deserters', fac: 'ng', leader: 'emhyr_emperor', size: 12, text: 'Out of uniform, never out of cards.',
          core: ['nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'sweers', 'albrich', 'vreemde', 'morteisen', 'puttkammer', 'rotten_mangonel',
            'rainfarn', 'cynthia', 'etolian_auxiliary_archers', 'sp_fog'] },
        { id: 'raiders', name: 'Elven Raiders', fac: 'st', leader: 'francesca_hope', size: 12, text: 'Arrows from the treeline, then nobody there.',
          core: ['elven_skirmisher', 'elven_skirmisher', 'elven_skirmisher', 'dwarven_skirmisher', 'dwarven_skirmisher', 'dwarven_skirmisher', 'toruviel', 'riordain',
            'ciaran_aep_easnillien', 'vrihedd_brigade_recruit', 'dol_blathanna_archer', 'havekar_healer'] },
        { id: 'drowned', name: 'Drowned Dead', fac: 'mo', leader: 'eredin_commander', size: 12, text: 'The bog keeps what it takes, and brings fog with it.',
          core: ['ghoul', 'ghoul', 'ghoul', 'foglet', 'botchling', 'endrega', 'cockatrice', 'gargoyle', 'harpy', 'wyvern', 'grave_hag', 'sp_fog', 'sp_frost'] }
      ],
      elite: [
        { id: 'griffin', name: 'The Griffin of White Orchard', fac: 'mo', leader: 'eredin_commander', size: 13, text: 'A royal griffin and everything that feeds on its leavings. Its leader brings the weather.',
          core: ['griffin', 'forktail', 'frightener', 'cockatrice', 'wyvern', 'harpy', 'celaeno_harpy', 'endrega', 'gargoyle', 'foglet', 'sp_frost', 'sp_fog', 'werewolf'] },
        { id: 'baronsmen', name: 'The Baron’s Guard', fac: 'nr', leader: 'foltest_lord', size: 13, text: 'Drilled, well fed and fond of siege engines. Their leader clears the weather.',
          core: ['poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'ves', 'siegfried_of_denesle', 'sheldon_skaggs', 'sabrina_glevissig',
            'ballista', 'kaedweni_siege_expert', 'kaedweni_siege_expert', 'dun_banner_medic', 'yarpen_zigrin', 'sp_decoy'] },
        { id: 'vanguard', name: 'Imperial Vanguard', fac: 'ng', leader: 'emhyr_emperor', size: 13, text: 'Tight ranks, and an officer who has seen your hand.',
          core: ['impera_brigade_guard', 'impera_brigade_guard', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'nausicaa_cavalry_rider', 'renuald_aep_matsen',
            'vanhemar', 'rainfarn', 'cahir_mawr_dyffryn_aep_ceallach', 'puttkammer', 'sweers', 'etolian_auxiliary_archers', 'albrich'] }
      ],
      boss: [
        { id: 'crones', name: 'The Ladies of the Wood', fac: 'mo', leader: 'eredin_commander', size: 15, boss: true,
          text: 'Three sisters of Crookback Bog who play as one: one Crone brings the other two. They bring the fog with them.',
          core: ['crone_brewess', 'crone_weavess', 'crone_whispess', 'grave_hag', 'foglet', 'botchling', 'nekker', 'nekker', 'ghoul',
            'gargoyle', 'harpy', 'endrega', 'wyvern', 'sp_fog', 'sp_frost'] },
        { id: 'baron', name: 'The Bloody Baron', fac: 'nr', leader: 'foltest_lord', size: 15, boss: true,
          text: 'Phillip Strenger, master of Crow’s Perch, and his siege engines. His leader clears the weather.',
          core: ['ballista', 'siege_tower', 'kaedweni_siege_expert', 'redanian_foot_soldier', 'dun_banner_medic', 'poor_fucking_infantry', 'poor_fucking_infantry',
            'poor_fucking_infantry', 'ves', 'siegfried_of_denesle', 'yarpen_zigrin', 'sheldon_skaggs', 'redanian_foot_soldier', 'sp_horn', 'sp_frost'] }
      ]
    },
    2: {
      battle: [
        { id: 'hunters', name: 'Witch Hunters', fac: 'nr', leader: 'foltest_steel', size: 15, text: 'Radovid’s zealots. They burn anything that stands too tall.',
          core: ['crinfrid_reavers_dragon_hunter', 'crinfrid_reavers_dragon_hunter', 'poor_fucking_infantry', 'dethmold', 'sile_de_tansarville', 'keira_metz',
            'sabrina_glevissig', 'ves', 'siegfried_of_denesle', 'ballista', 'yarpen_zigrin', 'trebuchet', 'siege_tower', 'dun_banner_medic', 'sp_frost', 'redanian_foot_soldier'] },
        { id: 'darkness', name: 'The Man of Glass’s Debtors', fac: 'ng', leader: 'emhyr_majesty', size: 15, text: 'Gamblers who bet more than coin, and the darkness that follows them.',
          core: ['gaunter_odimm', 'gaunter_odimm_darkness', 'gaunter_odimm_darkness', 'gaunter_odimm_darkness', 'zoltan_chivay', 'emiel_regis_rohellec_terzieff', 'olgierd_von_everec',
            'renuald_aep_matsen', 'vanhemar', 'cynthia', 'siege_engineer', 'zerrikanian_fire_scorpion', 'black_infantry_archer', 'sp_rain', 'sp_decoy'] },
        { id: 'vampires', name: 'Catacomb Vampires', fac: 'mo', leader: 'eredin_bringer', size: 15, text: 'A whole nest under the Temple Isle. Wake one and the rest come too.',
          core: ['vampire_bruxa', 'vampire_ekimmara', 'vampire_fleder', 'ghoul', 'ghoul', 'ghoul', 'fiend', 'plague_maiden', 'foglet', 'harpy',
            'grave_hag', 'gargoyle', 'endrega', 'sp_fog', 'sp_decoy'] },
        { id: 'commando', name: 'Scoia’tael Commando', fac: 'st', leader: 'francesca_queen', size: 15, text: 'Smugglers in the sewers, archers on the roofs.',
          core: ['havekar_smuggler', 'havekar_smuggler', 'havekar_smuggler', 'dol_blathanna_scout', 'dol_blathanna_scout', 'mahakaman_defender', 'mahakaman_defender',
            'mahakaman_defender', 'havekar_healer', 'vrihedd_brigade_veteran', 'vrihedd_brigade_veteran', 'barclay_els', 'yaevinn', 'sp_frost', 'sp_decoy'] },
        { id: 'traders', name: 'Skellige Traders', fac: 'sk', leader: 'crach', size: 15, text: 'Islanders in port for the fair, and spoiling for a game.',
          core: ['clan_brokvar_archer', 'clan_brokvar_archer', 'clan_brokvar_archer', 'light_longship', 'light_longship', 'light_longship', 'clan_heymaey_skald', 'svanrige',
            'udalryk', 'donar_an_hindar', 'holger_blackhand', 'birna_bran', 'madman_lugos', 'sp_storm', 'sp_decoy'] }
      ],
      elite: [
        { id: 'dijkstra', name: 'Dijkstra’s Informants', fac: 'nr', leader: 'foltest_son', size: 16, mods: { spyDraw: 1 }, text: 'Every one of them works for someone else. Their spies draw three.',
          core: ['sigismund_dijkstra', 'prince_stennis', 'thaler', 'ves', 'siegfried_of_denesle', 'keira_metz', 'sile_de_tansarville', 'dethmold', 'trebuchet', 'siege_tower',
            'kaedweni_siege_expert', 'kaedweni_siege_expert', 'dun_banner_medic', 'poor_fucking_infantry', 'poor_fucking_infantry', 'poor_fucking_infantry', 'sp_decoy'] },
        { id: 'berserkers', name: 'Ermion’s Berserkers', fac: 'sk', leader: 'bran', size: 16, text: 'Mushrooms, mead and bears. Their king halves the weather for them.',
          core: ['berserker', 'young_berserker', 'young_berserker', 'young_berserker', 'ermion', 'sp_mardroeme', 'svanrige', 'udalryk', 'war_longship',
            'war_longship', 'war_longship', 'madman_lugos', 'clan_heymaey_skald', 'donar_an_hindar', 'clan_drummond_shield_maiden', 'clan_drummond_shield_maiden'] },
        { id: 'skellen', name: 'Stefan Skellen’s Agents', fac: 'ng', leader: 'emhyr_invader', size: 16, mods: { hand: 1 }, text: 'Imperial intelligence. An extra card, and every medic brings back a stranger.',
          core: ['stefan_skellen', 'shilard_fitz_oesterlen', 'vattier_de_rideaux', 'black_infantry_archer', 'black_infantry_archer', 'fringilla_vigo', 'assire_var_anahid',
            'cahir_mawr_dyffryn_aep_ceallach', 'heavy_zerrikanian_fire_scorpion', 'siege_engineer', 'impera_brigade_guard', 'impera_brigade_guard', 'impera_brigade_guard',
            'etolian_auxiliary_archers', 'sp_decoy', 'sp_decoy'] }
      ],
      boss: [
        { id: 'francesca', name: 'Francesca Findabair', fac: 'st', leader: 'francesca_beautiful', size: 20, boss: true,
          text: 'The Daisy of the Valley and the best of the Scoia’tael. She chooses who begins every round and doubles her Ranged row.',
          core: D.STANDARD.st.filter(id => !BIG[id]) },
        { id: 'foltest', name: 'King Foltest', fac: 'nr', leader: 'foltest_king', size: 20, boss: true,
          text: 'The King of Temeria at his own table. He draws a card every time he wins a round, and brings the fog when he likes.',
          core: D.STANDARD.nr.filter(id => !BIG[id]) }
      ]
    },
    3: {
      battle: [
        { id: 'ancraite', name: 'Clan an Craite', fac: 'sk', leader: 'crach', size: 18, text: 'Kaer Trolde’s finest. They can bring the whole war back from the dead.',
          core: D.STANDARD.sk.filter(id => !C(id).hero) },
        { id: 'riders', name: 'Riders of the Wild Hunt', fac: 'mo', leader: 'eredin_commander', size: 18, text: 'Frost in their wake and the elements in their train.',
          core: ['arachas', 'arachas', 'arachas', 'arachas_behemoth', 'earth_elemental', 'fire_elemental', 'ice_giant', 'fiend', 'griffin', 'werewolf', 'forktail',
            'frightener', 'plague_maiden', 'toad', 'sp_frost', 'sp_frost', 'sp_fog', 'sp_scorch'] },
        { id: 'legion', name: 'The Imperial Legion', fac: 'ng', leader: 'emhyr_whiteflame', size: 18, text: 'Their emperor’s White Flame cancels your leader. Win without it.',
          core: D.STANDARD.ng.filter(id => !C(id).hero || id === 'yennefer_of_vengerberg') },
        { id: 'redania', name: 'The Redanian Army', fac: 'nr', leader: 'foltest_siege', size: 18, text: 'Siege engines and bonded companies, and a king who doubles them.',
          core: D.STANDARD.nr.filter(id => !C(id).hero) },
        { id: 'dolblathanna', name: 'The Dol Blathanna Host', fac: 'st', leader: 'francesca_daisy', size: 18, text: 'Elves of the Valley of Flowers. Their queen deals them an extra card.',
          core: D.STANDARD.st.filter(id => !C(id).hero) }
      ],
      elite: [
        { id: 'imlerith', name: 'Imlerith', fac: 'mo', leader: 'eredin_king', size: 20, mods: { hand: 1, keep: true }, text: 'The Hunt’s general. An extra card, and a unit of his stays on the board every round.',
          core: D.STANDARD.mo.slice() },
        { id: 'hjalmar', name: 'Hjalmar’s Crew', fac: 'sk', leader: 'crach', size: 20, mods: { roundDraw: 1 }, text: 'The young an Craite and his shield maidens. They draw a card every new round.',
          core: D.STANDARD.sk.slice() },
        { id: 'letho', name: 'Letho of Gulet', fac: 'ng', leader: 'emhyr_relentless', size: 20, mods: { hand: 1, redraws: 1 }, text: 'The Kingslayer. An extra card and an extra redraw.',
          core: D.STANDARD.ng.slice() }
      ],
      boss: [
        { id: 'eredin', name: 'Eredin, King of the Wild Hunt', fac: 'mo', leader: 'eredin_king', size: 24, mods: { hand: 2, keep: true, roundDraw: 1 }, boss: true,
          text: 'The White Frost is coming. He holds two extra cards, draws one every new round, doubles his Close row, and keeps a unit on the board every round.',
          core: D.STANDARD.mo.concat(['crone_brewess', 'crone_weavess', 'crone_whispess', 'vampire_katakan']) },
        { id: 'emhyr', name: 'Emhyr var Emreis', fac: 'ng', leader: 'emhyr_whiteflame', size: 24, mods: { hand: 2, roundDraw: 1 }, boss: true,
          text: 'The White Flame Dancing on the Barrows of his Enemies. Two extra cards and one more every new round, every drawn round is his, and your leader does nothing.',
          core: D.STANDARD.ng.slice() }
      ]
    }
  };
  /* The house's level for each act and kind of fight, before the difficulty shift. */
  const LEVEL_BY = { 1: { battle: 0, elite: 1, boss: 1 }, 2: { battle: 1, elite: 1, boss: 2 }, 3: { battle: 2, elite: 2, boss: 2 } };

  /* ================================================================
     Encounters ("?" on the map). An option may need a card picked from
     the deck first (`pick`: which cards qualify).
     ================================================================ */
  const units = run => run.deck.filter(c => C(c.id).kind === 'unit');
  const honable = run => run.deck.filter(c => C(c.id).kind === 'unit' && (c.up || 0) < HONE_MAX);
  const lifeFull = run => run.lives >= run.maxLives;
  const EVENTS = [
    { id: 'inn', title: 'The Crossroads Inn', acts: [1, 2, 3],
      text: 'The innkeeper keeps a box of curiosities behind the bar, and a regular at the fire wants a friendly hand for a few crowns.',
      options: [
        { label: 'Buy from the box (40 crowns)', sub: 'A random uncommon card for your deck.', need: run => run.crowns >= 40 ? null : 'Not enough crowns.',
          go: run => { run.crowns -= 40; const id = randomCard(run, 'uncommon'); addCard(run, id); return 'You take ' + D.nameOf(id) + ' from the box.'; } },
        { label: 'Play the regular (stake 20)', sub: 'Even odds: win 40 crowns, or lose your 20.', need: run => run.crowns >= 20 ? null : 'Not enough crowns.',
          go: run => { if (rnd(run) < 0.5) { run.crowns += 20; return 'He folds on the last round. You pocket 40.'; } run.crowns -= 20; return 'He passes with a hero still in hand. Your 20 crowns are his.'; } },
        { label: 'Leave', go: () => 'You finish your ale and go.' }
      ] },
    { id: 'glass', title: 'A Man of Glass', acts: [1, 2, 3],
      text: 'A smiling stranger in a plain coat knows your name. He offers you a card you would never otherwise find. His price is only a little cow.',
      options: [
        { label: 'Take his card', sub: 'A random rare card — and a Cow (0 strength) joins your deck.',
          go: run => { const id = randomCard(run, 'rare'); addCard(run, id); addCard(run, CURSE); return D.nameOf(id) + ' joins your deck. So does a Cow, chewing thoughtfully.'; } },
        { label: 'Take his gold', sub: '75 crowns — and a Cow joins your deck.', go: run => { run.crowns += 75; addCard(run, CURSE); return 'The purse is heavy. The Cow is heavier.'; } },
        { label: 'Refuse him', go: () => 'He shrugs, smiles, and is not there any more.' }
      ] },
    { id: 'shrine', title: 'A Shrine of Melitele', acts: [1, 2, 3],
      text: 'A wayside shrine, candles still burning. A priestess tends it.',
      options: [
        { label: 'Pray', sub: 'Regain a life.', need: run => lifeFull(run) ? 'Your lives are full.' : null, go: run => { run.lives++; return 'You rise feeling lighter.'; } },
        { label: 'Leave an offering (25 crowns)', sub: 'Remove a card from your deck.', pick: 'remove', need: run => run.crowns < 25 ? 'Not enough crowns.' : run.deck.length <= MIN_DECK ? 'Your deck is as thin as it can be.' : null,
          go: (run, c) => { run.crowns -= 25; removeCard(run, c.rid); return D.nameOf(c.id) + ' is left at the shrine.'; } },
        { label: 'Leave', go: () => 'You bow your head and walk on.' }
      ] },
    { id: 'vesemir', title: 'An Old Witcher', acts: [1, 2],
      text: 'Vesemir sits by a campfire, shuffling a battered deck. “Sit. Let me show you something.”',
      options: [
        { label: 'Learn from him', sub: 'Hone a unit: +' + HONE + ' strength.', pick: 'hone', need: run => honable(run).length ? null : 'Nothing left to hone.',
          go: (run, c) => { hone(run, c.rid); return D.nameOf(c.id) + ' is sharper now.'; } },
        { label: 'Ask him to join you', sub: 'Vesemir (6, Close) joins your deck.', need: run => countOf(run, 'vesemir') >= capOf('vesemir') ? 'He is already with you.' : null,
          go: run => { addCard(run, 'vesemir'); return '“Fine. Someone has to keep you alive.”'; } }
      ] },
    { id: 'collector', title: 'The Card Collector', acts: [2, 3],
      text: 'A Novigrad collector with a ledger of every card printed. He trades, and he buys.',
      options: [
        { label: 'Trade a card', sub: 'Give a card; get a random card one rarity better.', pick: 'any', need: run => run.deck.length ? null : 'Nothing to trade.',
          go: (run, c) => { const r = { common: 'uncommon', uncommon: 'rare', rare: 'rare', legendary: 'legendary' }[rarityOf(c.id)]; removeCard(run, c.rid); const id = randomCard(run, r); addCard(run, id); return 'He takes ' + D.nameOf(c.id) + ' and gives you ' + D.nameOf(id) + '.'; } },
        { label: 'Sell a card (30 crowns)', sub: 'Remove a card and take 30 crowns.', pick: 'remove', need: run => run.deck.length <= MIN_DECK ? 'Your deck is as thin as it can be.' : null,
          go: (run, c) => { removeCard(run, c.rid); run.crowns += 30; return 'Sold: ' + D.nameOf(c.id) + '.'; } },
        { label: 'Leave', go: () => 'He is already reading his ledger again.' }
      ] },
    { id: 'baron', title: 'The Bloody Baron’s Table', acts: [1],
      text: 'The Baron of Crow’s Perch is drunk, generous and in need of company.',
      options: [
        { label: 'Drink with him', sub: 'Two random units are honed (+' + HONE + ') — and you wake up with a Cow.', need: run => honable(run).length ? null : 'Nothing to hone.',
          go: run => { const list = shuffled(run, honable(run)).slice(0, 2); list.forEach(c => hone(run, c.rid)); addCard(run, CURSE); return 'You remember ' + list.map(c => D.nameOf(c.id)).join(' and ') + ' getting stronger. You do not remember the Cow.'; } },
        { label: 'Play him for coin', sub: '35 crowns.', go: run => { run.crowns += 35; return 'He loses cheerfully and pays.'; } }
      ] },
    { id: 'ambush', title: 'Ambush on the Bridge', acts: [1, 2, 3],
      text: 'Armed men block the bridge. Their captain has a deck out already.',
      options: [
        { label: 'Fight them', sub: 'A contract-strength battle. Win for a trinket and a card.', go: run => ({ fight: 'elite' }) },
        { label: 'Pay them (30 crowns)', need: run => run.crowns >= 30 ? null : 'Not enough crowns.', go: run => { run.crowns -= 30; return 'They let you through, counting.'; } },
        { label: 'Run for it', sub: 'Lose a life.', need: run => run.lives > 1 ? null : 'You would not survive it.', go: run => { run.lives--; return 'You get away, bleeding.'; } }
      ] },
    { id: 'camp', title: 'An Abandoned Camp', acts: [1, 2, 3],
      text: 'Cold fire, torn tents, and a chest nobody came back for. Something large has been sleeping nearby.',
      options: [
        { label: 'Search the chest', sub: 'Most likely a trinket. Perhaps whatever sleeps nearby.', need: run => run.lives > 1 ? null : 'Too dangerous with one life left.',
          go: run => { if (rnd(run) < 0.62) { const t = randomTrinket(run, ['common', 'uncommon']); if (t) { run.trinkets.push(t); applyTrinket(run, t); return 'Inside: ' + TRINKET[t].name + '.'; } run.crowns += 40; return 'Inside: 40 crowns.'; } run.lives--; return 'It wakes. You lose a life getting away.'; } },
        { label: 'Leave it', go: () => 'You leave it for someone braver.' }
      ] },
    { id: 'bard', title: 'A Bard in the Square', acts: [2, 3],
      text: 'Dandelion, viscount de Lettenhove, is between verses and between patrons.',
      options: [
        { label: 'Hire him (30 crowns)', sub: 'Dandelion (2, Close, doubles his row) joins your deck.', need: run => run.crowns < 30 ? 'Not enough crowns.' : countOf(run, 'dandelion') >= capOf('dandelion') ? 'He is already with you.' : null,
          go: run => { run.crowns -= 30; addCard(run, 'dandelion'); return '“A wise investment. I shall write you into a ballad.”'; } },
        { label: 'Ask for a ballad', sub: 'Regain a life — or, if you are well, lose your Cows.', go: run => {
          const cows = run.deck.filter(c => c.id === CURSE);
          if (cows.length) { cows.forEach(c => removeCard(run, c.rid, true)); return 'The song is so bad the Cows wander off (' + cows.length + ').'; }
          if (!lifeFull(run)) { run.lives++; return 'You feel better. Somehow.'; }
          return 'A lovely song. Nothing else happens.'; } }
      ] },
    { id: 'mirror', title: 'The Hall of Mirrors', acts: [2, 3],
      text: 'A ruined mage’s tower. In one mirror your deck lies face up — and the cards in the reflection are real.',
      options: [
        { label: 'Copy a card', sub: 'Lose a life: one card is duplicated, honing and all.', pick: 'copy', need: run => run.lives > 1 ? null : 'Too dangerous with one life left.',
          go: (run, c) => { run.lives--; run.deck.push({ rid: 'c' + (++run.ridN), id: c.id, up: c.up || 0 }); return 'Now there are two of ' + D.nameOf(c.id) + '. The mirror takes its price.'; } },
        { label: 'Smash the mirror', sub: '25 crowns in silver frame.', go: run => { run.crowns += 25; return 'Seven years’ bad luck. 25 crowns.'; } }
      ] }
  ];
  const EVENT = {};
  EVENTS.forEach(e => { EVENT[e.id] = e; });

  /* ================================================================
     Deck helpers
     ================================================================ */
  const countOf = (run, id) => run.deck.filter(c => c.id === id).length;
  function addCard(run, id, up) { const c = { rid: 'c' + (++run.ridN), id, up: up || 0 }; run.deck.push(c); return c; }
  function removeCard(run, rid, free) {
    const i = run.deck.findIndex(c => c.rid === rid);
    if (i < 0) return null;
    if (!free && run.deck.length <= MIN_DECK) return null;
    return run.deck.splice(i, 1)[0];
  }
  function hone(run, rid) {
    const c = run.deck.find(x => x.rid === rid);
    if (!c || C(c.id).kind !== 'unit') return false;
    c.up = Math.min(HONE_MAX, (c.up || 0) + (has(run, 'whetstone') ? 3 : HONE));
    return true;
  }
  /* A random card of one rarity for this run's faction (neutral a quarter of the time). */
  function randomCard(run, rarity, exclude) {
    exclude = exclude || [];
    const pool = poolFor(run.fac).filter(id => rarityOf(id) === rarity && countOf(run, id) < capOf(id) && exclude.indexOf(id) < 0);
    if (!pool.length) return rarity === 'legendary' ? randomCard(run, 'rare', exclude) : rarity === 'rare' ? randomCard(run, 'uncommon', exclude) : 'sp_decoy';
    const own = pool.filter(id => C(id).fac === run.fac);
    const ne = pool.filter(id => C(id).fac !== run.fac);
    const from = own.length && (!ne.length || rnd(run) < 0.72) ? own : ne;
    return pickOne(run, from);
  }
  function randomTrinket(run, rarities) {
    const pool = TRINKETS.filter(t => run.trinkets.indexOf(t.id) < 0 && (!rarities || rarities.indexOf(t.rarity) >= 0));
    return pool.length ? pickOne(run, pool).id : null;
  }
  function applyTrinket(run, id) {
    if (id === 'decoction') { run.maxLives++; run.lives = run.maxLives; }
  }
  /* The card choice after a win: rarity weights by act and fight. */
  const RARITY_W = {
    battle: { 1: [64, 31, 5, 0], 2: [50, 39, 11, 0], 3: [38, 44, 18, 0] },
    elite: { 1: [30, 52, 18, 0], 2: [22, 52, 26, 0], 3: [14, 50, 36, 0] },
    boss: { 1: [0, 0, 80, 20], 2: [0, 0, 70, 30], 3: [0, 0, 60, 40] }
  };
  function cardChoice(run, kind) {
    const n = has(run, 'eye') ? 4 : 3;
    const w = RARITY_W[kind][run.act];
    const out = [];
    for (let k = 0; k < n; k++) {
      const r = weighted(run, [['common', w[0]], ['uncommon', w[1]], ['rare', w[2]], ['legendary', w[3]]]);
      out.push(randomCard(run, r, out));
    }
    return out;
  }

  /* ================================================================
     The map: StS-style — four paths up a five-wide grid that never
     cross, the nodes they touch, and the boss above them all.
     ================================================================ */
  function genMap(run) {
    const edges = {};          // 'f:c' -> Set of next cols
    const used = {};
    const crosses = (f, a, b) => {
      for (const k of Object.keys(edges)) {
        const [ff, cc] = k.split(':').map(Number);
        if (ff !== f) continue;
        for (const d of edges[k]) if ((a < cc && b > d) || (a > cc && b < d)) return true;
      }
      return false;
    };
    const starts = shuffled(run, [0, 1, 2, 3, 4]);
    for (let p = 0; p < PATHS; p++) {
      let col = p < 2 ? starts[p] : int(run, 0, COLS - 1);
      used['0:' + col] = true;
      for (let f = 0; f < FLOORS - 1; f++) {
        let next = col;
        for (let t = 0; t < 12; t++) {
          const c2 = Math.max(0, Math.min(COLS - 1, col + int(run, -1, 1)));
          if (!crosses(f, col, c2)) { next = c2; break; }
        }
        const k = f + ':' + col;
        (edges[k] = edges[k] || []);
        if (edges[k].indexOf(next) < 0) edges[k].push(next);
        used[(f + 1) + ':' + next] = true;
        col = next;
      }
    }
    const floors = [];
    for (let f = 0; f < FLOORS; f++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        if (!used[f + ':' + c]) continue;
        row.push({ id: f + ':' + c, f, c, kind: null, next: f < FLOORS - 1 ? (edges[f + ':' + c] || []).slice().sort().map(n => (f + 1) + ':' + n) : ['boss'] });
      }
      floors.push(row);
    }
    /* What each node is. */
    for (const row of floors) for (const n of row) {
      const f = n.f;
      if (f === 0) n.kind = 'battle';
      else if (f === 3) n.kind = 'treasure';
      else if (f === FLOORS - 1) n.kind = 'camp';
      else n.kind = weighted(run, [['battle', 45], ['event', 22], ['elite', f >= 2 ? 14 : 0], ['shop', f >= 2 ? 12 : 3], ['camp', f >= 2 && f !== FLOORS - 2 ? 9 : 0]]);
    }
    /* No two merchants or two campfires straight after one another on a path. */
    const byId = {};
    floors.forEach(row => row.forEach(n => { byId[n.id] = n; }));
    for (const row of floors) for (const n of row) for (const id of n.next) {
      const m = byId[id];
      if (m && (m.kind === n.kind) && (m.kind === 'shop' || m.kind === 'camp' || m.kind === 'elite')) m.kind = 'battle';
    }
    const boss = pickOne(run, ENEMIES[run.act].boss).id;
    run.map = { floors, boss };
    run.pos = null;
    run.path = [];
  }
  function node(run, id) {
    if (id === 'boss') return { id: 'boss', f: FLOORS, kind: 'boss', next: [] };
    for (const row of run.map.floors) for (const n of row) if (n.id === id) return n;
    return null;
  }
  function reachable(run) {
    if (run.screen.k !== 'map') return [];
    if (!run.pos) return run.map.floors[0].map(n => n.id);
    const n = node(run, run.pos);
    return n ? n.next.slice() : [];
  }

  /* ================================================================
     A new run
     ================================================================ */
  function newRun(o) {
    o = o || {};
    const fac = o.fac;
    if (!STARTER[fac]) throw new Error('Choose a faction.');
    const leader = o.leader && D.LEADER[o.leader] && D.LEADER[o.leader].fac === fac ? o.leader : D.HOUSE_LEADER[fac];
    const diff = DIFFICULTY[o.diff] ? o.diff : 'witcher';
    const seed = o.seed == null ? (Date.now() >>> 0) : (o.seed >>> 0);
    const run = {
      v: VERSION, seed, rs: seed || 1, name: o.name || 'You', fac, leader, diff,
      lives: DIFFICULTY[diff].lives, maxLives: DIFFICULTY[diff].lives, crowns: 0, trinkets: [], deck: [], ridN: 0,
      act: 1, map: null, pos: null, path: [], removeCost: 60, battleN: 0,
      screen: { k: 'map' }, history: [], stats: { won: 0, lost: 0, cards: 0, removed: 0, honed: 0, crowns: 0 }, over: null, started: o.now || null
    };
    STARTER[fac].forEach(id => addCard(run, id));
    genMap(run);
    run.screen = { k: 'act', act: 1 };
    return run;
  }

  /* ================================================================
     Moving on the map
     ================================================================ */
  function go(run, id) {
    if (run.over) return no('The run is over.');
    if (run.screen.k !== 'map') return no('Finish what is in front of you first.');
    if (reachable(run).indexOf(id) < 0) return no('You cannot reach that from here.');
    const n = node(run, id);
    run.pos = id;
    run.path.push(id);
    switch (n.kind) {
      case 'battle': case 'elite': case 'boss': run.screen = battleScreen(run, n.kind); break;
      case 'shop': run.screen = shopScreen(run); break;
      case 'camp': run.screen = { k: 'camp', done: null }; break;
      case 'treasure': {
        const t = randomTrinket(run, ['common', 'uncommon', 'rare']);
        const crowns = int(run, 25, 45) + run.act * 10;
        run.crowns += crowns; run.stats.crowns += crowns;
        if (t) { run.trinkets.push(t); applyTrinket(run, t); }
        run.screen = { k: 'treasure', crowns, trinket: t };
        break;
      }
      case 'event': {
        const pool = EVENTS.filter(e => e.acts.indexOf(run.act) >= 0 && (run.seen || []).indexOf(e.id) < 0);
        const ev = (pool.length ? pickOne(run, pool) : pickOne(run, EVENTS.filter(e => e.acts.indexOf(run.act) >= 0))).id;
        run.seen = (run.seen || []).concat(ev);
        run.screen = { k: 'event', ev, result: null };
        break;
      }
    }
    return yes();
  }
  function battleScreen(run, kind, from) {
    const list = ENEMIES[run.act][kind === 'boss' ? 'boss' : kind];
    let e;
    if (kind === 'boss') e = list.find(x => x.id === run.map.boss) || list[0];
    else {
      /* Not the same opponent twice in a row in an act if it can be helped. */
      const fresh = list.filter(x => (run.met || []).indexOf(x.id) < 0);
      e = pickOne(run, fresh.length ? fresh : list);
    }
    run.met = (run.met || []).concat(e.id);
    const seed = (int(run, 1, 0x7fffffff) >>> 0) || 7;
    return { k: 'battle', kind, foe: e.id, seed, from: from || null, moves: [], tries: 0 };
  }
  function enemyOf(run, id) {
    for (const a of [1, 2, 3]) for (const k of ['battle', 'elite', 'boss']) { const e = ENEMIES[a][k].find(x => x.id === id); if (e) return e; }
    return null;
  }
  /* The two players for gw-engine.create — the run's deck and trinkets, and
     the opponent's sampled deck. The opponent's deck is drawn from the
     battle's seed, so a resumed battle meets the same deck. */
  function battleSetup(run) {
    const s = run.screen;
    if (s.k !== 'battle') return null;
    const e = enemyOf(run, s.foe);
    const tmp = { rs: (s.seed ^ 0x5bd1e995) >>> 0 };
    const cards = shuffled(tmp, e.core).slice(0, Math.min(e.size, e.core.length));
    const dif = DIFFICULTY[run.diff];
    const lvl = Math.max(0, Math.min(2, LEVEL_BY[run.act][s.kind] + dif.shift));
    const mods = Object.assign({}, e.mods || {});
    if (dif.foeHand) mods.hand = (mods.hand || 0) + dif.foeHand;
    const F = D.faction(e.fac);
    return {
      seed: s.seed + s.tries * 7919,
      foe: e,
      players: [
        { id: 'you', name: run.name, hex: '#e0b456', fac: run.fac, leader: run.leader, cards: run.deck.map(c => c.up ? { id: c.id, up: c.up } : c.id), mods: playerMods(run) },
        { id: 'foe', name: e.name, hex: F ? F.hex : '#c8343a', bot: true, level: LEVELS[lvl], fac: e.fac, leader: e.leader, cards, mods }
      ]
    };
  }

  /* A battle ended: result = { won, draw, rounds: [{ winner }] }. */
  function battleDone(run, result) {
    const s = run.screen;
    if (s.k !== 'battle') return no('There is no battle.');
    const e = enemyOf(run, s.foe);
    run.battleN++;
    run.history.push({ act: run.act, floor: run.pos === 'boss' ? FLOORS : (node(run, run.pos) || {}).f, kind: s.kind, foe: e.id, won: !!result.won });
    if (!result.won) {
      run.stats.lost++;
      run.lives--;
      if (run.lives <= 0) return endRun(run, false, e.name);
      run.screen = { k: 'lost', kind: s.kind, foe: e.id, retry: s.kind === 'boss', prev: s };
      return yes();
    }
    run.stats.won++;
    const flawless = result.rounds && result.rounds.every(r => r.winner === 'you');
    const base = s.kind === 'boss' ? 70 + run.act * 15 : s.kind === 'elite' ? int(run, 28, 38) + run.act * 6 : int(run, 12, 20) + run.act * 4;
    let crowns = base + (flawless ? Math.round(base * 0.25) : 0);
    if (has(run, 'purse')) crowns = Math.round(crowns * 1.5);
    run.crowns += crowns; run.stats.crowns += crowns;
    const rw = { k: 'reward', kind: s.kind, foe: e.id, crowns, flawless: !!flawless, cards: cardChoice(run, s.kind), took: null, trinket: null, leaders: null, leaderTook: null, healed: 0 };
    if (s.kind === 'elite' || s.kind === 'boss') {
      const t = randomTrinket(run, s.kind === 'boss' ? ['rare', 'uncommon'] : ['common', 'uncommon', 'rare']);
      if (t) { run.trinkets.push(t); applyTrinket(run, t); rw.trinket = t; }
    }
    if (s.kind === 'boss') {
      if (!lifeFull(run)) { run.lives++; rw.healed = 1; }
      const others = D.leadersOf(run.fac).filter(id => id !== run.leader);
      rw.leaders = shuffled(run, others).slice(0, 2);
    }
    run.screen = rw;
    return yes();
  }
  function retry(run) {
    const s = run.screen;
    if (s.k !== 'lost') return no('Nothing to retry.');
    if (s.retry) { run.screen = Object.assign({}, s.prev, { tries: (s.prev.tries || 0) + 1, moves: [] }); return yes(); }
    run.screen = { k: 'map' };
    return yes();
  }
  function takeCard(run, i) {
    const s = run.screen;
    if (s.k !== 'reward' || s.took) return no('No card to take.');
    if (i == null) { s.took = 'skip'; return yes(); }
    const id = s.cards[i];
    if (!id) return no('That is not one of the cards.');
    addCard(run, id); run.stats.cards++;
    s.took = id;
    return yes();
  }
  function takeLeader(run, id) {
    const s = run.screen;
    if (s.k !== 'reward' || !s.leaders || s.leaderTook) return no('No leader on offer.');
    if (id == null) { s.leaderTook = 'keep'; return yes(); }
    if (s.leaders.indexOf(id) < 0) return no('That leader is not on offer.');
    run.leader = id; s.leaderTook = id;
    return yes();
  }

  /* ================================================================
     The merchant
     ================================================================ */
  const priceOf = (run, base) => Math.round(base * (has(run, 'ledger') ? 0.75 : 1) * 1);
  function shopScreen(run) {
    const items = [];
    const seen = [];
    for (let k = 0; k < 5; k++) {
      const r = weighted(run, [['common', 40], ['uncommon', 42], ['rare', 16], ['legendary', run.act === 3 ? 4 : 1]]);
      const id = randomCard(run, r, seen);
      seen.push(id);
      const base = PRICE[rarityOf(id)];
      items.push({ t: 'card', id, price: priceOf(run, Math.round(base * (0.9 + rnd(run) * 0.2))), sold: false });
    }
    const tr = [];
    for (let k = 0; k < 2; k++) {
      const t = randomTrinket(run, null);
      if (!t || tr.indexOf(t) >= 0) continue;
      tr.push(t);
      items.push({ t: 'trinket', id: t, price: priceOf(run, TRINKET_PRICE[TRINKET[t].rarity] + int(run, -10, 10)), sold: false });
    }
    return { k: 'shop', items, removed: false, honed: false };
  }
  function buy(run, i) {
    const s = run.screen;
    if (s.k !== 'shop') return no('There is no merchant here.');
    const it = s.items[i];
    if (!it || it.sold) return no('Sold out.');
    if (run.crowns < it.price) return no('Not enough crowns.');
    if (it.t === 'card' && countOf(run, it.id) >= capOf(it.id)) return no('You hold as many as you may.');
    run.crowns -= it.price;
    it.sold = true;
    if (it.t === 'card') { addCard(run, it.id); run.stats.cards++; }
    else { run.trinkets.push(it.id); applyTrinket(run, it.id); }
    return yes();
  }
  function shopRemove(run, rid) {
    const s = run.screen;
    if (s.k !== 'shop') return no('There is no merchant here.');
    if (s.removed) return no('The merchant removes one card a visit.');
    const cost = priceOf(run, run.removeCost);
    if (run.crowns < cost) return no('Not enough crowns.');
    if (run.deck.length <= MIN_DECK) return no('Your deck is as thin as it can be (' + MIN_DECK + ').');
    const c = removeCard(run, rid);
    if (!c) return no('That card is not in your deck.');
    run.crowns -= cost;
    run.removeCost += 25;
    run.stats.removed++;
    s.removed = c.id;
    return yes();
  }
  const removePrice = run => priceOf(run, run.removeCost);

  /* ================================================================
     The campfire: rest or hone
     ================================================================ */
  function camp(run, what, rid) {
    const s = run.screen;
    if (s.k !== 'camp') return no('There is no campfire here.');
    if (s.done) return no('You have already rested here.');
    if (what === 'rest') {
      if (lifeFull(run)) return no('Your lives are full.');
      run.lives++;
      s.done = 'rest';
      return yes();
    }
    if (what === 'hone') {
      const c = run.deck.find(x => x.rid === rid);
      if (!c) return no('Choose a card.');
      if (C(c.id).kind !== 'unit') return no('Only units can be honed.');
      if ((c.up || 0) >= HONE_MAX) return no('That card is honed as far as it goes.');
      hone(run, rid);
      run.stats.honed++;
      s.done = 'hone'; s.card = c.id;
      return yes();
    }
    if (what === 'cull') {
      /* Burn a card in the fire. */
      if (run.deck.length <= MIN_DECK) return no('Your deck is as thin as it can be (' + MIN_DECK + ').');
      const c = removeCard(run, rid);
      if (!c) return no('Choose a card.');
      run.stats.removed++;
      s.done = 'cull'; s.card = c.id;
      return yes();
    }
    return no('Rest, hone or burn.');
  }

  /* ================================================================
     Encounters
     ================================================================ */
  function eventNeed(run, opt, rid) {
    const why = opt.need ? opt.need(run) : null;
    if (why) return why;
    if (opt.pick) {
      const c = run.deck.find(x => x.rid === rid);
      if (!c) return 'Choose a card.';
      if (opt.pick === 'hone' && (C(c.id).kind !== 'unit' || (c.up || 0) >= HONE_MAX)) return 'Choose a unit that can still be honed.';
    }
    return null;
  }
  function choose(run, i, rid) {
    const s = run.screen;
    if (s.k !== 'event' || s.result) return no('There is nothing to choose.');
    const ev = EVENT[s.ev];
    const opt = ev.options[i];
    if (!opt) return no('That is not a choice.');
    const why = eventNeed(run, opt, rid);
    if (why) return no(why);
    const c = opt.pick ? run.deck.find(x => x.rid === rid) : null;
    const out = opt.go(run, c ? { rid: c.rid, id: c.id, up: c.up } : null);
    if (out && out.fight) {
      run.screen = battleScreen(run, out.fight, 'event');
      return yes({ fight: true });
    }
    s.result = String(out || '');
    s.chose = i;
    if (run.lives <= 0) return endRun(run, false, ev.title);
    return yes();
  }

  /* ================================================================
     Leaving a screen
     ================================================================ */
  function leave(run) {
    const s = run.screen;
    if (run.over) return no('The run is over.');
    if (s.k === 'act') { run.screen = { k: 'map' }; return yes(); }
    if (s.k === 'reward') {
      if (!s.took) return no('Take a card or skip it first.');
      if (s.leaders && s.leaders.length && !s.leaderTook) return no('Keep your leader or take a new one first.');
      if (s.kind === 'boss') {
        if (run.act >= 3) return endRun(run, true, null);
        run.act++;
        run.met = [];
        genMap(run);
        run.screen = { k: 'act', act: run.act };
        return yes();
      }
      run.screen = { k: 'map' };
      return yes();
    }
    if (s.k === 'event' && !s.result) return no('Choose first.');
    if (s.k === 'camp' && !s.done) return no('Rest, hone or burn a card first.');
    if (s.k === 'lost') return retry(run);
    if (s.k === 'battle') return no('Finish the battle first.');
    run.screen = { k: 'map' };
    return yes();
  }
  function endRun(run, won, by) {
    run.over = { won, by: by || null, act: run.act };
    run.screen = { k: 'over', won };
    return yes({ over: true });
  }
  /* A score for the hall of fame: how far, how well. */
  function score(run) {
    const floors = run.history.length;
    return (run.act - 1) * 100 + floors * 10 + run.stats.won * 5 + (run.over && run.over.won ? 250 + run.lives * 40 : 0);
  }

  const Run = {
    VERSION, DIFFICULTY, ACTS, FLOORS, COLS, MIN_DECK, HONE, HONE_MAX, STARTER, TRINKETS, TRINKET, ENEMIES, EVENTS, EVENT, CURSE,
    rarityOf, capOf, poolFor, playerMods, newRun, genMap, node, reachable, go, battleSetup, battleDone, retry, takeCard, takeLeader,
    buy, shopRemove, removePrice, camp, choose, eventNeed, leave, enemyOf, score, countOf, honable, has
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Run;
  else root.GwentRun = Run;
})(typeof window !== 'undefined' ? window : this);
