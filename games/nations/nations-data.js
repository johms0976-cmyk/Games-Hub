'use strict';
/* Nations — the components.
 *
 * Every number here was read off the printed card faces in the user's VASSAL
 * module (Nations.vmod, images/1xx-4xx.jpg base, adv_N_(k).jpg advanced,
 * exp_N_(k).jpg expert, event_N_(k).jpg events), checked against the user's
 * card-list spreadsheet. Where the two disagree the printed card wins; the
 * disagreements are listed in ARCHITECTURE.md ("Where the numbers came from").
 * Card text is written fresh — the effect DESCRIPTORS are what the engine
 * reads, and the text on screen is generated from them where possible.
 *
 * Shape of a progress card:
 *   { id, name, age 1-4, set 'base'|'adv'|'exp', type, img, ... }
 *   type 'building'  prod {gold,stone,food,book,stab} per worker, vp [..], dep (stone)
 *        'military'  str per worker, up {res|stab: n} per worker, raid, vp, dep
 *        'colony'    req (strength), prod {..} incl. str/stab, vp
 *        'war'       loss {res: n}   (every War also costs the defeated 1 VP)
 *        'battle'    —  (gain = your raid value in book, food or stone)
 *        'golden'    res 'stone'|'book' (+2, or pay `age` resources for 1 VP)
 *        'wonder'    cost [stone per section], vp, prod {..}, fx [..]
 *        'advisor'   prod {..}, fx [..]
 * `fx` is a list of effect descriptors; the key is at the bottom of this file.
 */
(function (root) {

  const RES = ['gold', 'stone', 'food', 'book'];
  const AGE_NAME = ['', 'Antiquity', 'Medieval', 'Renaissance', 'Industrial'];
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];

  /* Growth bonus by difficulty (the score board's four rings). */
  const DIFFICULTY = [
    { id: 'chieftain', name: 'Chieftain', bonus: 4 },
    { id: 'prince', name: 'Prince', bonus: 3 },
    { id: 'king', name: 'King', bonus: 2 },
    { id: 'emperor', name: 'Emperor', bonus: 1 }
  ];
  /* Architects on the score board before the event's own, by table size. */
  const ARCHITECTS = [0, 0, 1, 2, 2, 3];
  /* Progress board columns in use, by table size. */
  const COLUMNS = [0, 4, 4, 5, 6, 7];
  /* Price of a card by row (row 0 is the top row). */
  const ROW_PRICE = [3, 2, 1];

  /* ---------------- helpers for writing the tables ---------------- */
  const BVP = { 1: [1, 1], 2: [1, 1, 1], 3: [2, 1, 1], 4: [2, 2, 1] };
  const BDEP = { 1: 1, 2: 2, 3: 3, 4: 4 };
  function bld(id, name, age, set, img, prod, extra) {
    return Object.assign({ id, name, age, set, img, type: 'building', prod, vp: BVP[age], dep: BDEP[age] }, extra || {});
  }
  function mil(id, name, age, set, img, str, up, raid, vp, dep, extra) {
    return Object.assign({ id, name, age, set, img, type: 'military', str, up, raid, vp, dep }, extra || {});
  }
  function col(id, name, age, set, img, req, prod, vp) {
    return { id, name, age, set, img, type: 'colony', req, prod, vp };
  }
  function war(id, name, age, set, img, loss) { return { id, name, age, set, img, type: 'war', loss }; }
  function bat(id, name, age, set, img) { return { id, name, age, set, img, type: 'battle' }; }
  function ga(id, name, age, set, img, res) { return { id, name, age, set, img, type: 'golden', res }; }
  function won(id, name, age, set, img, cost, vp, prod, fx, text) {
    return { id, name, age, set, img, type: 'wonder', cost, vp, prod: prod || {}, fx: fx || [], text: text || '' };
  }
  function adv(id, name, age, set, img, prod, fx, text) {
    return { id, name, age, set, img, type: 'advisor', prod: prod || {}, fx: fx || [], text: text || '' };
  }

  /* ================================================================
     The progress cards
     ================================================================ */
  const CARDS = [
    /* ---------- Age I, base (images 101-136) ---------- */
    bat('cannae', 'Battle of Cannae', 1, 'base', '101'),
    war('hunnic', 'Hunnic Invasions', 1, 'base', '102', { food: 4 }),
    bld('synagogue', 'Synagogue', 1, 'base', '103', { gold: 2, book: 1 }),
    mil('chariot', 'Chariot', 1, 'base', '104', 3, { gold: 1 }, 3, [1, 1], 1),
    ga('ironworking', 'Iron Working', 1, 'base', '105', 'stone'),
    war('alexander', 'Wars of Alexander', 1, 'base', '106', { food: 2 }),
    bat('kadesh', 'Battle of Kadesh', 1, 'base', '107'),
    ga('mapmaking', 'Map Making', 1, 'base', '108', 'stone'),
    bld('brewery', 'Brewery', 1, 'base', '109', { food: 2, book: 1 }),
    bld('lyceum', 'Lyceum', 1, 'base', '110', { book: 2, stone: 1 }),
    bld('ziggurat', 'Ziggurat', 1, 'base', '111', { stab: 2, stone: 1 }),
    bld('citywall', 'City Wall', 1, 'base', '112', { stone: 2, stab: 1 }),
    bld('aqueduct', 'Aqueduct', 1, 'base', '113', { food: 2, stab: 1 }),
    bat('troy', 'Siege of Troy', 1, 'base', '114'),
    ga('aeneid', 'Aeneid', 1, 'base', '115', 'book'),
    bat('alesia', 'Siege of Alesia', 1, 'base', '116'),
    bld('forum', 'Forum', 1, 'base', '117', { gold: 2, food: 1 }),
    adv('augustine', 'Saint Augustine', 1, 'base', '118', { stab: 1 }, [{ on: 'prod', if: 'mostStab', gain: { book: 2 } }]),
    ga('bible', 'The Bible', 1, 'base', '119', 'book'),
    col('macedonia', 'Macedonia', 1, 'base', '120', 4, { str: 2 }, 0),
    war('peloponnesian', 'Peloponnesian War', 1, 'base', '121', { book: 4 }),
    won('pyramids', 'Pyramids', 1, 'base', '122', [2, 1, 0], 3, { gold: 2, food: -2 }),
    adv('hatshepsut', 'Hatshepsut', 1, 'base', '123', { gold: 1 }, [{ on: 'wonderReady', gain: { book: 3 } }]),
    war('warring', 'Warring States', 1, 'base', '124', { book: 3 }),
    won('stonehenge', 'Stonehenge', 1, 'base', '125', [1, 1, 1], 0, {}, [{ on: 'ready', gain: { book: 6, food: 4 } }]),
    won('colosseum', 'Colosseum', 1, 'base', '126', [2, 2], 1, { str: 3 }, [{ on: 'ready', gain: { food: -2 } }]),
    mil('hoplite', 'Hoplite', 1, 'base', '127', 3, { stone: 1 }, 3, [1, 1], 1),
    col('nubia', 'Nubia', 1, 'base', '128', 3, { gold: 2 }, 0),
    bld('lighthouse', 'Lighthouse', 1, 'base', '129', { gold: 2, stone: 1 }),
    won('gardens', 'Hanging Gardens', 1, 'base', '130', [1, 2], 1, { food: 2, stone: -1, stab: 1 }),
    col('israel', 'Israel', 1, 'base', '131', 5, { book: 2 }, 0),
    adv('augustus', 'Augustus', 1, 'base', '132', { str: 1 }, [{ on: 'prod', if: 'mostStr', gain: { stone: 2 } }]),
    mil('immortal', 'Immortal', 1, 'base', '133', 3, { stab: 1 }, 3, [1, 1], 1),
    adv('qinshihuang', 'Qin Shi Huang', 1, 'base', '134', { food: 3 }, [{ remove: 'leastStab' }]),
    col('hispania', 'Hispania', 1, 'base', '135', 4, { food: 2 }, 0),
    mil('legionary', 'Legionary', 1, 'base', '136', 3, { food: 1 }, 3, [1, 1], 1),

    /* ---------- Age II, base (201-236) ---------- */
    ga('plough', 'Heavy Plough', 2, 'base', '201', 'stone'),
    ga('divina', 'Divina Commedia', 2, 'base', '202', 'book'),
    bld('cathedral', 'Cathedral', 2, 'base', '203', { stone: 2, stab: 2 }),
    ga('compass', 'Compass', 2, 'base', '204', 'stone'),
    mil('camelarcher', 'Camel Archer', 2, 'base', '205', 5, { stab: 1 }, 4, [1, 1, 2], 2),
    adv('aquino', 'Thomas Aquino', 2, 'base', '206', { stab: 1 }, [{ on: 'prod', if: 'mostStab', gain: { book: 4 } }]),
    war('hundredyears', 'Hundred Years War', 2, 'base', '207', { food: 5 }),
    col('greenland', 'Greenland', 2, 'base', '208', 7, { food: 3 }, 1),
    war('byzarab', 'Byzantine-Arab War', 2, 'base', '209', { book: 3 }),
    bld('windmill', 'Windmill', 2, 'base', '210', { food: 3, gold: 1 }),
    bld('madrasa', 'Madrasa', 2, 'base', '211', { book: 2, gold: 2 }),
    bat('poitiers', 'Battle of Poitiers', 2, 'base', '212'),
    bat('hastings', 'Battle of Hastings', 2, 'base', '213'),
    war('firstcrusade', 'First Crusade', 2, 'base', '214', { book: 6 }),
    won('notredame', 'Notre Dame', 2, 'base', '215', [2, 1], 1, { book: 2 }, [{ on: 'prod', if: 'mostStab', gain: { book: 3 } }]),
    bat('tannenberg', 'Battle of Tannenberg', 2, 'base', '216'),
    bld('university', 'University', 2, 'base', '217', { stone: 2, book: 2 }),
    mil('chokonu', 'Cho-Ko-Nu', 2, 'base', '218', 5, { gold: 1 }, 4, [1, 1, 2], 2),
    mil('horsearcher', 'Horse Archer', 2, 'base', '219', 5, { food: 1 }, 4, [1, 1, 2], 2),
    ga('magnacarta', 'Magna Carta', 2, 'base', '220', 'book'),
    bld('market', 'Market', 2, 'base', '221', { gold: 2, food: 2 }),
    war('reconquista', 'Reconquista', 2, 'base', '222', { gold: 4 }),
    adv('harald', 'Harald Hardrada', 2, 'base', '223', { gold: 4 }, [{ remove: 'leastStr' }]),
    col('tibet', 'Tibet', 2, 'base', '224', 8, { stab: 3 }, 1),
    bld('watermill', 'Watermill', 2, 'base', '225', { stone: 3, food: 1 }),
    adv('sejong', 'Sejong the Great', 2, 'base', '226', { food: 2 }, [{ on: 'buyGA', gain: { stone: 2 } }]),
    won('alhambra', 'Alhambra', 2, 'base', '227', [1, 1], 1, {}, [{ privArch: 1 }]),
    col('lombardy', 'Lombardy', 2, 'base', '228', 9, { book: 3 }, 1),
    won('sankore', 'Sankore University', 2, 'base', '229', [1, 2, 3], 2, {}, [{ on: 'ready', gain: { book: 8 } }]),
    bat('agincourt', 'Battle of Agincourt', 2, 'base', '230'),
    bld('monastery', 'Monastery', 2, 'base', '231', { book: 3, food: 1 }),
    col('sicily', 'Sicily', 2, 'base', '232', 12, { food: 3 }, 1),
    adv('komnene', 'Anna Komnene', 2, 'base', '233', { book: 1 }, [{ noMilUpkeep: true }]),
    bld('mosque', 'Mosque', 2, 'base', '234', { gold: 2, stab: 2 }),
    won('porcelain', 'Porcelain Tower', 2, 'base', '235', [1, 0], 0, {}, [{ advisorSpace: true }]),
    mil('longships', 'Longships', 2, 'base', '236', 5, { book: 1 }, 4, [1, 1, 2], 2),

    /* ---------- Age III, base (301-336) ---------- */
    bld('parliament', 'Parliament', 3, 'base', '301', { stone: 3, stab: 2 }),
    war('jenkins', "War of Jenkins' Ear", 3, 'base', '302', { gold: 6 }),
    war('mughal', 'Mughal Invasion', 3, 'base', '303', { book: 7 }),
    col('quebec', 'Québec', 3, 'base', '304', 12, { book: 4 }, 1),
    ga('romeo', 'Romeo and Juliet', 3, 'base', '305', 'book'),
    ga('gutenberg', 'Gutenberg Bible', 3, 'base', '306', 'book'),
    ga('microscope', 'Microscope', 3, 'base', '307', 'stone'),
    bat('rhodes', 'Siege of Rhodes', 3, 'base', '308'),
    war('imjin', 'Imjin War', 3, 'base', '309', { stone: 5 }),
    bld('dike', 'Dike', 3, 'base', '310', { stone: 3, food: 2 }),
    bat('constantinople', 'Fall of Constantinople', 3, 'base', '311'),
    adv('montezuma', 'Montezuma', 3, 'base', '312', { food: 2 }, [{ on: 'buyWarOrBattle', gain: { book: 3 } }]),
    mil('samurai', 'Samurai', 3, 'base', '313', 7, { gold: 1 }, 5, [1, 2, 2], 3),
    col('incan', 'Incan Empire', 3, 'base', '314', 17, { gold: 4 }, 1),
    bat('nochetriste', 'La Noche Triste', 3, 'base', '315'),
    bld('sawmill', 'Sawmill', 3, 'base', '316', { gold: 3, food: 2 }),
    adv('galileo', 'Galileo Galilei', 3, 'base', '317', { book: 2 }, [{ act: 'galileo', once: true }]),
    mil('conquistador', 'Conquistador', 3, 'base', '318', 7, { book: 1 }, 5, [1, 2, 2], 3),
    col('southafrica', 'South Africa', 3, 'base', '319', 13, { food: 4 }, 1),
    ga('clocks', 'Clocks', 3, 'base', '320', 'stone'),
    bat('poltava', 'Battle of Poltava', 3, 'base', '321'),
    adv('isabella', 'Isabella', 3, 'base', '322', { food: 2 }, [{ on: 'prod', perColonyAge: 3, gain: { gold: 3 } }]),
    adv('elizabeth', 'Elizabeth', 3, 'base', '323', { stone: 2 }, [{ warStr: 8 }]),
    war('greatnorthern', 'Great Northern War', 3, 'base', '324', { food: 8 }),
    bld('courthouse', 'Courthouse', 3, 'base', '325', { stab: 3, book: 2 }),
    won('sistine', 'Sistine Chapel', 3, 'base', '326', [1, 1], 1, { book: 1 }, [{ on: 'hire', gain: { book: 3 } }]),
    mil('jaguar', 'Jaguar Warrior', 3, 'base', '327', 7, { stab: 1 }, 5, [1, 2, 2], 3),
    won('versailles', 'Versailles', 3, 'base', '328', [4, 0, 1], 4, {}, [{ on: 'ready', leastStabRound: true }]),
    won('tajmahal', 'Taj Mahal', 3, 'base', '329', [3, 1, 2], 1, {}, [{ on: 'ready', gain: { book: 15 } }]),
    bld('colonialtrading', 'Colonial Trading', 3, 'base', '330', { gold: 3, stab: 2 }),
    bld('theatre', 'Theatre', 3, 'base', '331', { book: 3, gold: 2 }),
    won('machupicchu', 'Machu Picchu', 3, 'base', '332', [0, 2, 0], 0, { gold: 6 }),
    bld('observatory', 'Observatory', 3, 'base', '333', { book: 3, stone: 2 }),
    col('aztec', 'Aztec Empire', 3, 'base', '334', 15, { gold: 4 }, 1),
    bld('terrace', 'Terrace Farming', 3, 'base', '335', { food: 3, stone: 2 }),
    mil('redcoat', 'Redcoat', 3, 'base', '336', 7, { food: 1 }, 5, [1, 2, 2], 3),

    /* ---------- Age IV, base (401-436) ---------- */
    ga('dynamite', 'Dynamite', 4, 'base', '401', 'stone'),
    war('francoprussian', 'Franco-Prussian War', 4, 'base', '402', { stone: 9 }),
    mil('hussar', 'Hussar', 4, 'base', '403', 9, { gold: 1 }, 6, [1, 2, 2, 2], 4),
    mil('rifleman', 'Rifleman', 4, 'base', '404', 9, { food: 1 }, 6, [1, 2, 2, 2], 4),
    war('boer', 'Second Boer War', 4, 'base', '405', { food: 8 }),
    won('darwin', "Darwin's Voyage", 4, 'base', '406', [3, 2], 1, {}, [{ on: 'ready', gain: { gold: 15 } }]),
    adv('nightingale', 'Florence Nightingale', 4, 'base', '407', { book: 6 }, [{ noLackVP: true }]),
    bat('waterloo', 'Battle of Waterloo', 4, 'base', '408'),
    bat('yorktown', 'Surrender at Yorktown', 4, 'base', '409'),
    bld('hospital', 'Hospital', 4, 'base', '410', { book: 4, food: 2 }),
    won('suez', 'Suez Canal', 4, 'base', '411', [2, 1], 1, { gold: 3, str: 4 }),
    mil('cossack', 'Cossack', 4, 'base', '412', 9, { stab: 1 }, 6, [1, 2, 2, 2], 4),
    bat('tsushima', 'Battle of Tsushima', 4, 'base', '413'),
    mil('cavalry', 'Cavalry', 4, 'base', '414', 9, { book: 1 }, 6, [1, 2, 2, 2], 4),
    col('india', 'India', 4, 'base', '415', 25, { book: 5 }, 2),
    col('ostafrika', 'Ostafrika', 4, 'base', '416', 22, { food: 5 }, 2),
    bat('fashoda', 'Fashoda Incident', 4, 'base', '417'),
    col('nigeria', 'Nigeria', 4, 'base', '418', 20, { book: 5 }, 2),
    adv('frederick', 'Frederick the Great', 4, 'base', '419', { str: 2 }, [{ milDeployDiscount: 2 }]),
    adv('antoinette', 'Marie Antoinette', 4, 'base', '420', { book: 10, stab: -3 }),
    ga('vaccine', 'Vaccine', 4, 'base', '421', 'stone'),
    ga('origin', 'Origin of Species', 4, 'base', '422', 'book'),
    ga('kapital', 'Das Kapital', 4, 'base', '423', 'book'),
    war('opium', 'Opium War', 4, 'base', '424', { gold: 8 }),
    won('ford', 'Ford Motor Company', 4, 'base', '425', [2, 2], 1, { stone: 6 }),
    bld('urban', 'Urban Center', 4, 'base', '426', { gold: 3, stab: 3 }),
    war('balkan', 'Balkan Wars', 4, 'base', '427', { book: 7 }),
    bld('zeppelin', 'Zeppelin', 4, 'base', '428', { book: 4, stab: 2 }),
    adv('linzexu', 'Lin Zexu', 4, 'base', '429', { food: 4, gold: 4 }, [{ on: 'prod', if: 'leastStr', gain: { book: -8 } }]),
    won('southpole', 'South Pole Expedition', 4, 'base', '430', [2, 1], 3, {}, [{ on: 'ready', gain: { food: -5 } }]),
    bld('voortrekker', 'Voortrekker', 4, 'base', '431', { food: 3, stone: 3 }),
    bld('railroad', 'Railroad', 4, 'base', '432', { stone: 3, stab: 3 }),
    col('congo', 'Congo', 4, 'base', '433', 23, { gold: 5 }, 2),
    bld('penal', 'Penal Colony', 4, 'base', '434', { food: 4, stab: 2 }),
    bld('hydro', 'Hydro Plant', 4, 'base', '435', { food: 3, gold: 3 }),
    bld('factory', 'Factory', 4, 'base', '436', { gold: 3, stone: 3 }),

    /* ---------- Age I, advanced (adv_1_ 1-19) ---------- */
    won('oracle', 'The Oracle', 1, 'adv', 'adv_1_ (1)', [2, 1], 1, { stab: 2 }),
    war('threekingdoms', 'Three Kingdoms', 1, 'adv', 'adv_1_ (2)', { gold: 5 }),
    bld('mine', 'Mine', 1, 'adv', 'adv_1_ (3)', { stone: 2, gold: 1 }),
    won('sphinx', 'Sphinx', 1, 'adv', 'adv_1_ (4)', [2, 2], 1, { stone: 1 }, [{ on: 'otherWonderReady', gain: { stone: 5 } }]),
    bld('pagoda', 'Pagoda', 1, 'adv', 'adv_1_ (5)', { book: 2, stab: 1 }),
    ga('silk', 'Silk', 1, 'adv', 'adv_1_ (6)', 'stone'),
    mil('archer', 'Archer', 1, 'adv', 'adv_1_ (7)', 2, {}, 4, [1, 1], 1),
    mil('trireme', 'Trireme', 1, 'adv', 'adv_1_ (8)', 3, {}, 3, [1, 1], 2),
    ga('odyssey', 'The Odyssey', 1, 'adv', 'adv_1_ (9)', 'book'),
    won('greatlighthouse', 'Great Lighthouse', 1, 'adv', 'adv_1_ (10)', [1, 3], 2, { gold: 1 }, [{ on: 'buyAt', price: 3, gain: { book: 1 } }]),
    war('parthian', 'Parthian Wars', 1, 'adv', 'adv_1_ (11)', { gold: 3 }),
    bld('granary', 'Granary', 1, 'adv', 'adv_1_ (12)', { food: 2, stone: 1 }),
    adv('boudica', 'Boudica', 1, 'adv', 'adv_1_ (13)', { str: 1, gold: 1, food: 1 }, [{ remove: 'milWorker' }]),
    adv('archimedes', 'Archimedes', 1, 'adv', 'adv_1_ (14)', { stone: 1 }, [{ privArch: 1 }]),
    adv('cyrus', 'Cyrus the Great', 1, 'adv', 'adv_1_ (15)', {}, [{ on: 'prod', ifColonyBought: true, gain: { gold: 3 } }]),
    col('babylonia', 'Babylonia', 1, 'adv', 'adv_1_ (16)', 5, { gold: 2 }, 0),
    col('gaul', 'Gaul', 1, 'adv', 'adv_1_ (17)', 7, { food: 2 }, 0),
    bat('thermopylae', 'Battle of Thermopylae', 1, 'adv', 'adv_1_ (18)'),
    bat('milvian', 'Milvian Bridge', 1, 'adv', 'adv_1_ (19)'),

    /* ---------- Age I, expert (exp_1_ 1-19) ---------- */
    bat('alps', 'Crossing the Alps', 1, 'exp', 'exp_1_ (1)'),
    won('petra', 'Petra', 1, 'exp', 'exp_1_ (2)', [2, 0, 1], 0, {}, [{ act: 'petra', once: true }]),
    bat('issus', 'Battle of Issus', 1, 'exp', 'exp_1_ (3)'),
    adv('suntzu', 'Sun Tzu', 1, 'exp', 'exp_1_ (4)', {}, [{ twoFirst: true }]),
    adv('hannibal', 'Hannibal', 1, 'exp', 'exp_1_ (5)', {}, [{ raid: 1 }, { othersBattleCost: 1 }]),
    mil('elephant', 'Elephant', 1, 'exp', 'exp_1_ (6)', 4, { food: 2 }, 3, [1, 1], 1),
    adv('buddha', 'Buddha', 1, 'exp', 'exp_1_ (7)', { stab: 3 }, [{ skipFirst: true }]),
    col('armenia', 'Armenia', 1, 'exp', 'exp_1_ (8)', 6, { stone: 2 }, 0),
    bld('forge', 'Forge', 1, 'exp', 'exp_1_ (9)', { stone: 2, food: 1 }),
    bld('library', 'Library', 1, 'exp', 'exp_1_ (10)', { book: 2, gold: 1 }),
    ga('mahabharata', 'Mahabharata', 1, 'exp', 'exp_1_ (11)', 'book'),
    bld('confucian', 'Confucian Academy', 1, 'exp', 'exp_1_ (12)', { stab: 2, gold: 1 }),
    ga('coinage', 'Coinage', 1, 'exp', 'exp_1_ (13)', 'stone'),
    won('terracotta', 'Terracotta Army', 1, 'exp', 'exp_1_ (14)', [0, 0, 3], 2, { str: 1 }, [{ on: 'ready', sel: 'leastStab', gain: { gold: -4 } }]),
    mil('phalanx', 'Phalanx', 1, 'exp', 'exp_1_ (15)', 4, { stone: 2 }, 3, [1, 1], 1),
    won('solomon', "Solomon's Temple", 1, 'exp', 'exp_1_ (16)', [1, 1], 0, {}, [{ endAge: { vp: 1 } }, { removeIfDefeated: true }]),
    war('punic', 'Punic Wars', 1, 'exp', 'exp_1_ (17)', { food: 6 }),
    war('hyksos', 'Hyksos Invasion', 1, 'exp', 'exp_1_ (18)', { stone: 4 }),
    col('hindukush', 'Hindu Kush', 1, 'exp', 'exp_1_ (19)', 9, { stone: 3 }, 0),

    /* ---------- Age II, advanced ---------- */
    won('chichenitza', 'Chichen Itza', 2, 'adv', 'adv_2_ (1)', [2, 2], 1, {}, [{ on: 'buyWar', gain: { vp: 1 } }]),
    adv('mansamusa', 'Mansa Musa', 2, 'adv', 'adv_2_ (2)', { gold: 1 }, [{ lastGold: { book: 2, food: 1 } }]),
    adv('eleanor', 'Eleanor of Aquitaine', 2, 'adv', 'adv_2_ (3)', {}, [{ on: 'prod', ifColonyBought: true, gain: { gold: 5 } }]),
    bat('hattin', 'The Horns of Hattin', 2, 'adv', 'adv_2_ (4)'),
    bat('manzikert', 'Battle of Manzikert', 2, 'adv', 'adv_2_ (5)'),
    adv('abubakr', 'Abu Bakr', 2, 'adv', 'adv_2_ (6)', { str: 2 }, [{ on: 'buyBattle', gain: { book: 2 } }]),
    col('prussia', 'Prussia', 2, 'adv', 'adv_2_ (7)', 12, { book: 3 }, 1),
    col('england', 'England', 2, 'adv', 'adv_2_ (8)', 11, { gold: 3 }, 1),
    ga('threekingdomsga', 'Three Kingdoms', 2, 'adv', 'adv_2_ (9)', 'book'),
    won('moai', 'Moai Statues', 2, 'adv', 'adv_2_ (10)', [1, 1, 1], 2, { food: -1 }, [{ on: 'ready', gain: { stone: 12 } }]),
    war('roses', 'War of the Roses', 2, 'adv', 'adv_2_ (11)', { gold: 7 }),
    won('angkorwat', 'Angkor Wat', 2, 'adv', 'adv_2_ (12)', [3, 1], 1, { food: 4 }, [{ on: 'prod', if: 'leastStr', gain: { book: -4 } }]),
    bld('ballcourt', 'Ball Court', 2, 'adv', 'adv_2_ (13)', { gold: 3, food: 1 }),
    bld('castle', 'Castle', 2, 'adv', 'adv_2_ (14)', { stab: 3, stone: 1 }),
    mil('knight', 'Knight', 2, 'adv', 'adv_2_ (15)', 5, { stone: 1 }, 4, [1, 1, 2], 2),
    mil('longbowman', 'Longbowman', 2, 'adv', 'adv_2_ (16)', 4, {}, 4, [1, 1, 2], 2),
    ga('spectacles', 'Spectacles', 2, 'adv', 'adv_2_ (17)', 'stone'),
    bld('guildhall', 'Guild Hall', 2, 'adv', 'adv_2_ (18)', { stone: 3, book: 1 }),
    war('vikingraids', 'Viking Raids', 2, 'adv', 'adv_2_ (19)', { book: 4 }),

    /* ---------- Age II, expert ---------- */
    bat('siegeconstantinople', 'Siege of Constantinople', 2, 'exp', 'exp_2_ (1)'),
    ga('quoran', 'The Quoran', 2, 'exp', 'exp_2_ (2)', 'book'),
    won('krak', 'Krak des Chevaliers', 2, 'exp', 'exp_2_ (3)', [5, 5], 2, { str: 6 }),
    col('saharan', 'Saharan Trade', 2, 'exp', 'exp_2_ (4)', 15, { stone: 4 }, 1),
    won('greatwall', 'Great Wall', 2, 'exp', 'exp_2_ (5)', [1, 1], 1, { stab: 2 }, [{ passFirstNoWarVP: true }]),
    adv('alhazen', 'Alhazen', 2, 'exp', 'exp_2_ (6)', { book: 2 }, [{ act: 'alhazen', once: true }]),
    won('piazza', 'Piazza San Marco', 2, 'exp', 'exp_2_ (7)', [3, 2, 1], 1, {}, [{ act: 'piazza', once: true }]),
    adv('genghis', 'Genghis Khan', 2, 'exp', 'exp_2_ (8)', { str: 3 }, [{ allStab: -3 }]),
    col('crusader', 'Crusader States', 2, 'exp', 'exp_2_ (9)', 13, { str: 3 }, 2),
    bld('hippodrome', 'Hippodrome', 2, 'exp', 'exp_2_ (10)', { stab: 3, book: 1 }),
    bld('oceanfishing', 'Ocean Fishing', 2, 'exp', 'exp_2_ (11)', { food: 2, stone: 2 }),
    war('mongol', 'Mongol Invasions', 2, 'exp', 'exp_2_ (12)', { food: 10 }),
    ga('gunpowder', 'Gunpowder', 2, 'exp', 'exp_2_ (13)', 'stone'),
    mil('cataphract', 'Cataphract', 2, 'exp', 'exp_2_ (14)', 6, { stone: 2 }, 4, [1, 1, 2], 2),
    mil('greekfire', 'Greek Fire Galley', 2, 'exp', 'exp_2_ (15)', 6, { food: 2 }, 4, [1, 1, 2], 2),
    bat('ainjalut', 'Battle of Ain Jalut', 2, 'exp', 'exp_2_ (16)'),
    adv('marcopolo', 'Marco Polo', 2, 'exp', 'exp_2_ (17)', {}, [{ act: 'marco', once: true }]),
    war('vandalic', 'Vandalic War', 2, 'exp', 'exp_2_ (18)', { stone: 6 }),
    bld('mint', 'Mint', 2, 'exp', 'exp_2_ (19)', { gold: 3, stab: 1 }),

    /* ---------- Age III, advanced ---------- */
    war('cortes', 'Cortés Expedition', 3, 'adv', 'adv_3_ (1)', { food: 6 }),
    bat('noryang', 'Battle of Noryang', 3, 'adv', 'adv_3_ (2)'),
    adv('pocahontas', 'Pocahontas', 3, 'adv', 'adv_3_ (3)', { food: 4 }, [{ allColonyReq: 4 }]),
    adv('luther', 'Martin Luther', 3, 'adv', 'adv_3_ (4)', { gold: 4 }, [{ allDefeatFood: 4 }]),
    col('brazil', 'Brazil', 3, 'adv', 'adv_3_ (5)', 14, { stone: 4 }, 1),
    bat('cajamarca', 'Battle of Cajamarca', 3, 'adv', 'adv_3_ (6)'),
    adv('tokugawa', 'Tokugawa', 3, 'adv', 'adv_3_ (7)', { str: 2 }, [{ on: 'prod', perCurAgeBM: true, gain: { stone: 2 } }]),
    col('philippines', 'Philippines', 3, 'adv', 'adv_3_ (8)', 18, { stone: 4 }, 1),
    mil('ranger', 'Ranger', 3, 'adv', 'adv_3_ (9)', 6, {}, 5, [1, 2, 2], 3),
    won('royalsociety', 'Royal Society', 3, 'adv', 'adv_3_ (10)', [3, 2], 1, {}, [{ act: 'royal', once: true }]),
    won('uraniborg', 'Uraniborg', 3, 'adv', 'adv_3_ (11)', [0, 3, 2], 2, { book: 2 }, [{ gaBonus: 2 }]),
    bld('shipyard', 'Shipyard', 3, 'adv', 'adv_3_ (12)', { stone: 3, gold: 2 }),
    bld('altar', 'Sacrificial Altar', 3, 'adv', 'adv_3_ (13)', { stab: 3, food: 2 }),
    bld('bank', 'Bank', 3, 'adv', 'adv_3_ (14)', { gold: 3, book: 2 }),
    ga('telescope', 'Telescope', 3, 'adv', 'adv_3_ (15)', 'stone'),
    ga('quixote', 'Don Quixote', 3, 'adv', 'adv_3_ (16)', 'book'),
    mil('frigate', 'Frigate', 3, 'adv', 'adv_3_ (17)', 8, { stone: 1 }, 6, [1, 2, 2], 4),
    war('dutchliberation', 'Dutch Liberation War', 3, 'adv', 'adv_3_ (18)', { gold: 9 }),
    won('potala', 'Potala Palace', 3, 'adv', 'adv_3_ (19)', [1, 1], 1, {}, [{ score: 'perAdvisor' }]),

    /* ---------- Age III, expert ---------- */
    bat('louisburg', 'Fall of Louisburg', 3, 'exp', 'exp_3_ (1)'),
    bld('hammam', 'Hammam', 3, 'exp', 'exp_3_ (2)', { food: 3, stab: 2 }),
    war('cyprus', 'War of Cyprus', 3, 'exp', 'exp_3_ (3)', { stone: 7 }),
    bld('chateau', 'Château', 3, 'exp', 'exp_3_ (4)', { stab: 3, gold: 2 }),
    war('thirtyyears', 'Thirty Years War', 3, 'exp', 'exp_3_ (5)', { food: 9 }),
    bld('printingpress', 'Printing Press', 3, 'exp', 'exp_3_ (6)', { stone: 3, book: 2 }),
    mil('hakkapeliitta', 'Hakkapeliitta', 3, 'exp', 'exp_3_ (7)', 8, { stab: 2 }, 5, [1, 2, 2], 3),
    mil('mercenary', 'Mercenary', 3, 'exp', 'exp_3_ (8)', 8, { gold: 2 }, 4, [1, 2, 2], 2),
    ga('thermometer', 'Thermometer', 3, 'exp', 'exp_3_ (9)', 'stone'),
    won('forbidden', 'Forbidden Palace', 3, 'exp', 'exp_3_ (10)', [2, 1], 1, {}, [{ passFirst: { vp: 1 } }]),
    col('virginia', 'Virginia', 3, 'exp', 'exp_3_ (11)', 21, { stone: 5 }, 1),
    won('himeji', 'Himeji Castle', 3, 'exp', 'exp_3_ (12)', [1, 1, 1], 1, {}, [{ replaceNewer: { stone: 4 } }]),
    adv('peter', 'Peter the Great', 3, 'exp', 'exp_3_ (13)', {}, [{ on: 'prod', ifStrGtWar: true, choose: [{ stone: 5 }, { gold: 5 }, { book: 5 }] }]),
    won('redfort', 'Red Fort', 3, 'exp', 'exp_3_ (14)', [0, 3], 1, {}, [{ on: 'buyAt', price: 1, gain: { food: 2 } }]),
    adv('machiavelli', 'Niccolo Machiavelli', 3, 'exp', 'exp_3_ (15)', { book: 4 }, [{ eventChoose: true }]),
    adv('suleiman', 'Suleiman I', 3, 'exp', 'exp_3_ (16)', { str: 3 }, [{ act: 'suleiman' }]),
    ga('principia', 'Principia', 3, 'exp', 'exp_3_ (17)', 'book'),
    col('caribbean', 'The Caribbean', 3, 'exp', 'exp_3_ (18)', 15, { stab: 4 }, 1),
    bat('vienna', 'Siege of Vienna', 3, 'exp', 'exp_3_ (19)'),

    /* ---------- Age IV, advanced ---------- */
    bat('austerlitz', 'Battle of Austerlitz', 4, 'adv', 'adv_4_ (1)'),
    bat('borodino', 'Battle of Borodino', 4, 'adv', 'adv_4_ (2)'),
    adv('curie', 'Marie Curie', 4, 'adv', 'adv_4_ (3)', { stone: 4 }, [{ privArch: 2 }]),
    adv('lincoln', 'Abraham Lincoln', 4, 'adv', 'adv_4_ (4)', { stab: 3 }, [{ act: 'lincoln' }]),
    col('algeria', 'Algeria', 4, 'adv', 'adv_4_ (5)', 25, { str: 5 }, 2),
    adv('disraeli', 'Benjamin Disraeli', 4, 'adv', 'adv_4_ (6)', { gold: 2 }, [{ on: 'prod', ifColonyBought: true, gain: { food: 8 } }]),
    ga('candide', 'Candide', 4, 'adv', 'adv_4_ (7)', 'book'),
    ga('electricity', 'Electricity', 4, 'adv', 'adv_4_ (8)', 'stone'),
    war('napoleonic', 'Napoleonic War', 4, 'adv', 'adv_4_ (9)', { food: 11 }),
    won('bigben', 'Big Ben', 4, 'adv', 'adv_4_ (10)', [3, 0], 1, {}, [{ score: 'perIndColony' }]),
    bld('engineering', 'Engineering School', 4, 'adv', 'adv_4_ (11)', { stone: 4, book: 2 }),
    bld('sewer', 'Sewer System', 4, 'adv', 'adv_4_ (12)', { food: 4, stab: 2 }),
    bld('stockexchange', 'Stock Exchange', 4, 'adv', 'adv_4_ (13)', { gold: 4, stone: 2 }),
    mil('conscript', 'Conscript', 4, 'adv', 'adv_4_ (14)', 7, {}, 4, [1, 1, 1, 1], 2),
    mil('submarine', 'Submarine', 4, 'adv', 'adv_4_ (15)', 8, {}, 5, [1, 2, 2, 2], 3),
    col('hongkong', 'Hong Kong', 4, 'adv', 'adv_4_ (16)', 27, { book: 5 }, 2),
    won('britishmuseum', 'British Museum', 4, 'adv', 'adv_4_ (17)', [0, 1, 3], 2, {}, [{ on: 'ready', sel: 'leastStr', gain: { book: -10 } }]),
    won('brandenburg', 'Brandenburg Gate', 4, 'adv', 'adv_4_ (18)', [2, 2], 2, {}, [{ on: 'ready', sel: 'mostStr', gain: { gold: 6, stone: 6 } }]),
    war('angloafghan', 'Anglo-Afghan War', 4, 'adv', 'adv_4_ (19)', { stone: 7 }),

    /* ---------- Age IV, expert ---------- */
    bat('balaclava', 'Battle of Balaclava', 4, 'exp', 'exp_4_ (1)'),
    /* The module's exp_4_ (2) is a second copy of Fall of Louisburg's scan.
       The card that belongs here, by the spreadsheet and by the deck's shape
       (every other expert deck has three buildings and two battles), is
       Radio. Numbers from the spreadsheet; art stands in. */
    bld('radio', 'Radio', 4, 'exp', null, { gold: 2, stab: 4 }, { inferred: 'art and numbers from the spreadsheet — the module scan is a duplicate' }),
    bld('coalmine', 'Coal Mine', 4, 'exp', 'exp_4_ (3)', { stone: 4, gold: 2 }),
    war('civilwar', 'American Civil War', 4, 'exp', 'exp_4_ (4)', { book: 12 }),
    bld('nationalpark', 'National Park', 4, 'exp', 'exp_4_ (5)', { book: 4, stone: 2 }),
    war('crimean', 'Crimean War', 4, 'exp', 'exp_4_ (6)', { gold: 10 }),
    ga('kalevala', 'Kalevala', 4, 'exp', 'exp_4_ (7)', 'book'),
    ga('jenny', 'Spinning Jenny', 4, 'exp', 'exp_4_ (8)', 'stone'),
    mil('dreadnought', 'Dreadnought', 4, 'exp', 'exp_4_ (9)', 14, { stone: 3 }, 7, [1, 2, 3], 6),
    col('libya', 'Libya', 4, 'exp', 'exp_4_ (10)', 30, { stone: 6 }, 2),
    won('titanic', 'Titanic', 4, 'exp', 'exp_4_ (11)', [2, 0, 2], 3, {}, [{ on: 'ready', titanic: true }]),
    won('mit', 'MIT', 4, 'exp', 'exp_4_ (12)', [0, 1], 1, {}, [{ mitDeploy: true }]),
    adv('nobel', 'Alfred Nobel', 4, 'exp', 'exp_4_ (13)', {}, [{ noWar: true }, { on: 'prod', perIndWorker: true, gain: { stone: 3 } }]),
    won('liberty', 'Statue of Liberty', 4, 'exp', 'exp_4_ (14)', [0, 2], 1, {}, [{ score: 'mostWorkers' }]),
    adv('bolivar', 'Simon Bolivar', 4, 'exp', 'exp_4_ (15)', {}, [{ act: 'bolivar' }]),
    adv('shaka', 'Shaka Zulu', 4, 'exp', 'exp_4_ (16)', { str: 8 }, [{ othersColony: { stone: 5 } }]),
    mil('machinegunner', 'Machine Gunner', 4, 'exp', 'exp_4_ (17)', 10, { gold: 2 }, 6, [1, 2, 2, 2], 4),
    col('australia', 'Australia', 4, 'exp', 'exp_4_ (18)', 24, { stab: 5 }, 2),
    bat('trafalgar', 'Battle of Trafalgar', 4, 'exp', 'exp_4_ (19)')
  ];

  /* ================================================================
     Nations: Dynasties — the 43 new progress cards (set 'dyn', a "D" in
     the corner), and the promo cards that came with the user's print
     sheets (set 'promo', a dot instead of the D). Read off the user's A3
     print-and-play sheets (Expansion/<n> - Front.pdf, 520×804 per card);
     the age comes from each card's BACK on the matching Back sheet (the
     same picture, sepia for Antiquity to full colour for the Industrial
     age). `img` is the card's place on the sheet: <sheet>-<row>-<col>.
     Natural Wonders are bought like wonders and then explored: `spy` is
     the number of spyglasses printed down their left edge.
     ================================================================ */
  function nat(id, name, age, set, img, spy, vp, prod, fx, extra) {
    return Object.assign({ id, name, age, set, img, type: 'natural', spy, vp, prod: prod || {}, fx: fx || [], text: '' }, extra || {});
  }
  /* A Golden Age with its own first option in place of "+2 of a resource";
     the second is always "pay `vpCost` resources for 1 VP". */
  function gax(id, name, age, set, img, alt, vpCost) { return { id, name, age, set, img, type: 'golden', res: null, alt, vpCost }; }
  const DYN_CARDS = [
    /* ---------- Antiquity ---------- */
    nat('vesuvius', 'Vesuvius', 1, 'dyn', '4-3-8', 2, 4, { food: 1 }, [{ endAgeReturn: 1 }]),
    bld('vatican', 'Vatican', 1, 'dyn', '7-0-0', { book: 3, gold: 1 }, { vp: [2], dep: 2, max: 1 }),
    nat('pillar', 'The Pillar of Hercules', 1, 'dyn', '7-0-1', 1, 0, {}, [{ on: 'discover', tempStr: 7 }]),
    nat('siwa', 'Siwa Oasis', 1, 'dyn', '7-0-2', 1, 0, {}, [{ on: 'buyColony', gain: { book: 3 } }]),
    bld('silkroad', 'Silk Road', 1, 'dyn', '7-0-3', { gold: 5, stone: -1 }, { vp: [3], dep: 2, max: 1 }),
    mil('praetorian', 'Praetorian Guard', 1, 'dyn', '7-0-4', 3, { stab: -1 }, 3, [2], 1, { max: 1 }),
    nat('kailash', 'Mount Kailash', 1, 'dyn', '7-0-5', 3, 2, {}, []),
    nat('ararat', 'Mount Ararat', 1, 'dyn', '7-0-6', 1, 0, {}, [{ on: 'discover', others: { food: -3 } }]),
    adv('hypatia', 'Hypatia', 1, 'dyn', '7-0-7', {}, [{ remove: 'stabOver2' }, { on: 'prod', hypatia: true }]),
    won('greatlibrary', 'Great Library', 1, 'dyn', '7-0-8', [1], 0, { book: 2 }, [{ gaBonus: 1 }, { lostIf: 'leastStab' }]),

    /* ---------- Medieval ---------- */
    ga('arabiannights', 'Arabian Nights', 2, 'dyn', '3-3-0', null),
    adv('zhuxi', 'Zhu Xi', 2, 'dyn', '3-3-1', { stab: 1, gold: 1 }, [{ keepOnce: true }]),
    nat('siberia', 'Siberia', 2, 'dyn', '3-3-3', 2, 2, { stone: 2 }, [], { spaces: 2 }),
    mil('assassin', 'Assassin', 2, 'dyn', '4-3-0', 0, {}, 5, [2], 1, { assassin: true }),
    nat('aurora', 'Aurora Borealis', 2, 'dyn', '4-3-1', 1, 1, {}, [{ on: 'discover', gain: { gold: 2 } }]),
    nat('grandbanks', 'Grand Banks', 2, 'dyn', '4-3-2', 2, 0, { food: 2 }, []),
    bld('hansa', 'Hansa', 2, 'dyn', '4-3-3', { food: 4, stab: 1 }, { vp: [2, 2], dep: 4, max: 2 }),
    won('shwedagon', 'Shwedagon Pagoda', 2, 'dyn', '4-3-4', [3, 2], 1, {}, [{ act: 'shwedagon' }]),
    nat('sahara', 'Sahara', 2, 'dyn', '4-3-5', 1, 1, {}, [{ warStr: 4 }]),
    bld('templar', 'Knights Templar', 2, 'dyn', '4-3-6', { stone: 2, str: 4 }, { vp: [2], dep: 2, max: 1 }),
    nat('hawaii', 'Hawaii', 2, 'dyn', '4-3-7', 4, -1, {}, [{ on: 'discover', freeWorker: 1 }]),

    /* ---------- Renaissance ---------- */
    nat('spiceislands', 'Spice Islands', 3, 'dyn', '2-3-3', 2, 0, {}, [{ growthPlus: 4 }]),
    mil('privateer', 'Privateer', 3, 'dyn', '2-3-4', 4, {}, 7, [2, 2, 1], 2),
    bld('potosi', 'Potosí', 3, 'dyn', '2-3-5', { gold: 7 }, { vp: [1], dep: 3, max: 1 }),
    won('oresund', 'Øresund Dues', 3, 'dyn', '2-3-6', [2, 1, 0], 1, {}, [{ passedOver: { stone: 2 } }]),
    gax('levite', 'Le Vite', 3, 'dyn', '2-3-7', 'levite', 3),
    nat('greatplains', 'Great Plains', 3, 'dyn', '2-3-8', 1, 0, {}, [{ on: 'discover', addBM: 1 }]),
    nat('capegoodhope', 'Cape of Good Hope', 3, 'dyn', '3-3-4', 1, 1, {}, [{ colonyReq: -4 }]),
    adv('linnaeus', 'Carolus Linnaeus', 3, 'dyn', '3-3-5', { stab: 1 }, [{ gaVpPlus: 1 }]),
    bld('coffeehouse', 'Coffee House', 3, 'dyn', '3-3-6', { food: 2, gold: 2 }, { vp: [2, 1, 1, 2], dep: 3, passLastPer: { book: 2 } }),
    nat('grandcanyon', 'Grand Canyon', 3, 'dyn', '3-3-7', 2, 0, {}, [{ score: 'perNatural' }]),
    nat('reef', 'Great Barrier Reef', 3, 'dyn', '3-3-8', 3, 2, {}, [{ act: 'reef', once: true }]),

    /* ---------- Industrial ---------- */
    won('wardenclyffe', 'Wardenclyffe Tower', 4, 'dyn', '1-3-2', [1, 1], 1, {}, [{ on: 'ready', moreActions: 3 }]),
    nat('victoria', 'Victoria Falls', 4, 'dyn', '1-3-3', 2, 2, {}, [{ on: 'discover', victoria: 20 }]),
    gax('uncletom', 'Uncle Tom’s Cabin', 4, 'dyn', '1-3-4', 'uncletom', 4),
    nat('uluru', 'Uluru', 4, 'dyn', '1-3-5', 4, 0, {}, [{ on: 'discover', perPassedVP: 1 }]),
    nat('titusville', 'Titusville', 4, 'dyn', '1-3-6', 2, 1, {}, [{ score: 'stoneDouble' }]),
    bld('shantytown', 'Shantytown', 4, 'dyn', '1-3-7', { stone: 7, stab: -1 }, { vp: [1, 1, 1, 1], dep: 1 }),
    nat('northwest', 'Northwest Passage', 4, 'dyn', '1-3-8', 2, 4, {}, [{ on: 'discover', returnWorkers: 2 }]),
    adv('chopin', 'Frédéric Chopin', 4, 'dyn', '2-3-0', {}, [{ bookDouble: true }, { chopin: 5 }]),
    bld('deptstore', 'Department Store', 4, 'dyn', '2-3-1', { gold: 3, book: 1 }, { vp: [4], dep: 6, max: 1 }),
    mil('boxers', 'Boxers', 4, 'dyn', '2-3-2', 6, {}, 2, [1, 1, 2, 2, 3], 1),

    /* ---------- Promo cards (lobby option) ---------- */
    gax('antikythera', 'Antikythera Mechanism', 1, 'promo', '7-1-0', 'antikythera', 1),
    won('turk', 'Mechanical Turk', 3, 'promo', '7-1-8', [4, 0], 1, { gold: -4 }, [{ on: 'ready', gain: { vp: 2 } }, { act: 'turk' }]),
    won('kremlin', 'Kremlin', 3, 'promo', '7-2-8', [2, 1, 2], 1, { str: 5 }, [{ kremlin: 4 }]),
    col('grandduchy', 'Grand Duchy of Finland', 4, 'promo', '1-3-0', 21, { stone: 5 }, 2),
    adv('tesla', 'Nikola Tesla', 4, 'promo', '1-3-1', {}, [{ act: 'tesla' }]),
    gax('powergrid', 'Power Grid', 4, 'promo', '7-2-5', 'powergrid', 4)
  ];
  /* Arabian Nights is a Golden Age with two printed options of its own. */
  Object.assign(DYN_CARDS.find(c => c.id === 'arabiannights'), { res: null, alt: 'arabian', vpCost: 2 });
  /* The Grand Duchy's action: skip a turn without passing. */
  DYN_CARDS.find(c => c.id === 'grandduchy').fx = [{ act: 'duchy', once: true }];
  /* Siberia fills a second wonder space with this card ("…is a vast
     region"). It is never in a deck. */
  const SIBERIA2 = nat('s-siberia', 'Siberia …is a vast region', 0, 'start', '3-3-2', 0, 0, {}, []);

  /* The cards printed on the player boards. They are ordinary cards of
     Antiquity for every purpose (a Tokugawa counts none of them — they are
     "start"); age 0 keeps them out of every deck. */
  const START = [
    bld('s-temple', 'Temple', 0, 'start', 'board', { book: 1, gold: 1 }, { vp: [1], dep: 1 }),
    bld('s-quarry', 'Quarry', 0, 'start', 'board', { stone: 1, gold: 1 }, { vp: [1], dep: 1 }),
    mil('s-axeman', 'Axeman', 0, 'start', 'board', 2, { food: 1 }, 2, [1], 1),
    bld('s-farm', 'Farm', 0, 'start', 'board', { stone: 1, food: 1 }, { vp: [1], dep: 1 }),
    bld('s-caravan', 'Caravan', 0, 'start', 'board', { stab: 1, gold: 1 }, { vp: [1], dep: 1 }),
    /* B-side boards print a few Antiquity cards on the board itself. */
    bld('s-brewery', 'Brewery', 0, 'start', '109', { food: 2, book: 1 }, { vp: [1, 1], dep: 1 }),
    bld('s-pagoda', 'Pagoda', 0, 'start', 'adv_1_ (5)', { book: 2, stab: 1 }, { vp: [1, 1], dep: 1 }),
    mil('s-hoplite', 'Hoplite', 0, 'start', '127', 3, { stone: 1 }, 3, [1, 1], 1),
    bld('s-lyceum', 'Lyceum', 0, 'start', '110', { book: 2, stone: 1 }, { vp: [1, 1], dep: 1 }),
    bld('s-ziggurat', 'Ziggurat', 0, 'start', '111', { stab: 2, stone: 1 }, { vp: [1, 1], dep: 1 }),
    mil('s-legionary', 'Legionary', 0, 'start', '136', 3, { food: 1 }, 3, [1, 1], 1),
    bld('s-aqueduct', 'Aqueduct', 0, 'start', '113', { food: 2, stab: 1 }, { vp: [1, 1], dep: 1 }),
    won('s-pyramids', 'Pyramids', 0, 'start', '122', [2, 1, 0], 3, { gold: 2, food: -2 }),
    /* The Dynasties boards (pictures cut from each board, `img` = the
       board's sheet side). Same rules: age 0, never in a deck. */
    bld('s-lighthouse', 'Lighthouse', 0, 'start', 'board', { gold: 2, stone: 1 }, { vp: [1, 1], dep: 1 }),
    bld('s-forge', 'Forge', 0, 'start', 'board', { stone: 2, food: 1 }, { vp: [1, 1], dep: 1 }),
    bld('s-kaba', 'Kaba', 0, 'start', 'board', { gold: 2, book: 2 }, { vp: [2], dep: 2, max: 1 }),
    bld('s-bazaar', 'Bazaar', 0, 'start', 'board', { food: 1, gold: 1 }, { vp: [1], dep: 1 }),
    bld('s-buffalo', 'Buffalo Horde', 0, 'start', 'board', { food: 4 }, { vp: [1], dep: 1, max: 1 }),
    bld('s-teepee', 'Teepee', 0, 'start', 'board', { stone: 1, book: 1 }, { vp: [1], dep: 1 }),
    mil('s-brave', 'Brave', 0, 'start', 'board', 1, { gold: -1 }, 2, [1], 1),
    bld('s-adobe', 'Adobe', 0, 'start', 'board', { stab: 2 }, { vp: [1], dep: 1 }),
    mil('s-chariot', 'Chariot', 0, 'start', 'board', 3, { gold: 1 }, 3, [2], 1),
    bld('s-stele', 'Stele', 0, 'start', 'board', { gold: 1, stab: 1, book: 1 }, { vp: [1], dep: 1 }),
    bld('s-glassblower', 'Glass Blower', 0, 'start', 'board', { book: 2 }, { vp: [1], dep: 1 }),
    mil('s-trireme', 'Trireme', 0, 'start', 'board', 3, {}, 3, [1, 1], 2),
    bld('s-stavechurch', 'Stave Church', 0, 'start', 'board', { stab: 1, book: 1 }, { vp: [1], dep: 1 }),
    mil('s-berserkers', 'Berserkers', 0, 'start', 'board', 3, { food: 2 }, 3, [1], 1),
    mil('s-archer', 'Archer', 0, 'start', 'board', 2, {}, 4, [1, 1], 1),
    bld('s-confucian', 'Confucian Academy', 0, 'start', 'board', { stab: 2, gold: 1 }, { vp: [1, 1], dep: 1 }),
    bld('s-ricefields', 'Rice Fields', 0, 'start', 'board', { food: 3 }, { vp: [1], dep: 1 }),
    bld('s-yurt', 'Yurt', 0, 'start', 'board', { food: 1, gold: 1 }, { vp: [1], dep: 1 }),
    mil('s-horsearcher', 'Horse Archer', 0, 'start', 'board', 5, { food: 1 }, 4, [1, 1, 2], 2),
    bld('s-saltcaravan', 'Salt Caravan', 0, 'start', 'board', { food: 1, stab: 1, book: 1 }, { vp: [1], dep: 2 }),
    bld('s-goldmine', 'Gold Mine', 0, 'start', 'board', { gold: 3 }, { vp: [1], dep: 1, max: 1 }),
    /* Printed in a wonder, colony or advisor space. */
    won('s-varanasi', 'Varanasi', 0, 'start', 'board', [], 0, {}, [{ on: 'prod', perIdle: true, gain: { book: 1, food: 1 } }]),
    won('s-uppsala', 'Old Uppsala', 0, 'start', 'board', [], -2, {}, [{ act: 'uppsala', once: true }]),
    Object.assign(col('s-constantinople', 'Constantinople', 0, 'start', 'board', 0, {}, 0), { fx: [{ gaVpDiscount: 1 }] }),
    adv('s-emperor', 'Emperor', 0, 'start', 'board', { stab: 2 }, [{ emperor: true }], ''),
    SIBERIA2
  ];
  START.find(c => c.id === 's-emperor').permanent = true;

  /* ================================================================
     The nations. The A side is the same board for everybody; the B sides
     differ (images nation_<x>.jpg). `track` is the population track: how
     many workers stand in the Food and the Stability sections at the start.
     ================================================================ */
  const A_SIDE = {
    bm: ['s-temple', 's-quarry', 's-axeman', 's-farm', 's-caravan'],
    res: { food: 3, stone: 6, gold: 6, vp: 7 }, workers: 5,
    track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [], special: []
  };
  const NATIONS = [
    { id: 'china', name: 'China', hex: '#c8463c',
      B: { bm: ['s-farm', 's-quarry', 's-axeman', 's-pagoda'], res: { food: 1, stone: 5, gold: 5, vp: 3 }, workers: 6,
        track: { food: 3, stab: 4 }, advisors: 1, colonies: 1, wonders: 6, ready: [],
        special: [{ on: 'prod', if: 'passedFirst', gain: { food: 1 } }], specialText: 'Production: if you passed first, +1 food' } },
    { id: 'egypt', name: 'Egypt', hex: '#d9a92c',
      B: { bm: ['s-brewery', 's-quarry', 's-temple', 's-caravan'], res: { food: 2, stone: 7, gold: 5, vp: 4 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: ['s-pyramids'],
        special: [{ privArch: 1 }], specialText: 'One private architect every round' } },
    { id: 'greece', name: 'Greece', hex: '#4a86d9',
      B: { bm: ['s-farm', 's-quarry', 's-hoplite', 's-lyceum'], res: { food: 3, stone: 6, gold: 6, vp: 5 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ gaBonus: 1 }], specialText: 'Golden Age bonus 1' } },
    { id: 'persia', name: 'Persia', hex: '#8e5bc4',
      B: { bm: ['s-quarry', 's-axeman', 's-ziggurat', 's-temple'], res: { food: 3, stone: 5, gold: 7, vp: 4 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 3, wonders: 5, ready: [],
        special: [], specialText: 'Room for three colonies' } },
    { id: 'rome', name: 'Rome', hex: '#3fae67',
      B: { bm: ['s-farm', 's-quarry', 's-legionary', 's-aqueduct'], res: { food: 2, stone: 6, gold: 6, vp: 4 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ str: 2 }], specialText: '+2 strength' } },

    /* ---------- Nations: Dynasties — one side each, read off the boards ---------- */
    { id: 'portugal', name: 'Portugal', hex: '#2f9c8f', dyn: true, img: '1F',
      B: { bm: ['s-temple', 's-lighthouse', 's-caravan', 's-farm'], res: { food: 2, stone: 6, gold: 5, vp: 2 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ rowDiscount: { row: 2, n: 1 } }], specialText: 'Cards in the bottom row cost 1 gold less' } },
    { id: 'poland', name: 'Poland', hex: '#d24b5a', dyn: true, img: '1B',
      B: { bm: ['s-temple', 's-forge', 's-axeman', 's-quarry'], res: { food: 3, stone: 5, gold: 5, vp: 3 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 1, wonders: 6, ready: [],
        special: [{ warSafe: { book: 3 } }], specialText: 'War: +3 books if there is one and you are not defeated' } },
    { id: 'arabs', name: 'Arabs', hex: '#9aa3ad', dyn: true, img: '2F',
      B: { bm: ['s-kaba', 's-quarry', 's-axeman', 's-bazaar'], res: { food: 2, stone: 5, gold: 8, vp: 5 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ on: 'buyBattle', takeWorker: 1 }], specialText: 'Buy a Battle: you may also take a worker' } },
    { id: 'america', name: 'America', hex: '#c98a3c', dyn: true, img: '2B',
      B: { bm: ['s-buffalo', 's-teepee', 's-brave', 's-adobe'], res: { food: 2, stone: 5, gold: 7, vp: 5 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ on: 'discover', gain: { food: 2 } }], specialText: 'Discover a Natural Wonder: +2 food' } },
    { id: 'india', name: 'India', hex: '#e07a3a', dyn: true, img: '3F',
      B: { bm: ['s-temple', 's-quarry', 's-chariot', 's-farm'], res: { food: 3, stone: 4, gold: 6, vp: 4 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: ['s-varanasi'],
        special: [{ on: 'prod', always: true, gain: { food: 2 } }], specialText: 'Production: +2 food' } },
    { id: 'ethiopia', name: 'Ethiopia', hex: '#a8433a', dyn: true, img: '3B',
      B: { bm: ['s-stele', 's-quarry', 's-axeman', 's-farm'], res: { food: 4, stone: 7, gold: 5, vp: 5 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ orderStab: true }], specialText: 'Player order: your stability counts as strength too' } },
    { id: 'venice', name: 'Venice', hex: '#3a6fb0', dyn: true, img: '4F',
      B: { bm: ['s-glassblower', 's-quarry', 's-trireme', 's-farm'], res: { food: 3, stone: 6, gold: 6, vp: 5 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, startColonies: ['s-constantinople'], wonders: 5, ready: [],
        special: [{ passLast: { book: 2 } }], specialText: 'Pass last: +2 books' } },
    { id: 'vikings', name: 'Vikings', hex: '#7c8a96', dyn: true, img: '4B',
      B: { bm: ['s-stavechurch', 's-quarry', 's-berserkers', 's-farm'], res: { food: 2, stone: 5, gold: 6, vp: 3 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: ['s-uppsala'],
        special: [{ vikingTax: 1 }], specialText: 'After production: name a resource — every other nation loses 1 of it' } },
    { id: 'korea', name: 'Korea', hex: '#5b8f5a', dyn: true, img: '5F',
      B: { bm: ['s-temple', 's-quarry', 's-archer', 's-confucian'], res: { food: 2, stone: 6, gold: 5, vp: 4 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ on: 'buyGA', freeArch: 2 }], specialText: 'Buy a Golden Age: you may also build 2 wonder sections free' } },
    { id: 'japan', name: 'Japan', hex: '#d9d2c3', dyn: true, img: '5B',
      B: { bm: ['s-temple', 's-quarry', 's-axeman', 's-ricefields', null], res: { food: 3, stone: 6, gold: 7, vp: 5 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, startAdvisors: ['s-emperor'], colonies: 2, wonders: 5, ready: [],
        special: [], specialText: 'The Emperor holds your advisor space: an advisor you buy is discarded and gives him +1 strength for good. Hokkaido is an empty space',
        dynCovers: 'bm' } },
    { id: 'mongolia', name: 'Mongolia', hex: '#6b5a8e', dyn: true, img: '6F',
      B: { bm: ['s-yurt', 's-caravan', 's-horsearcher', null], res: { food: 3, stone: 6, gold: 7, vp: 4 }, workers: 4,
        track: { food: 3, str: 5 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ allDefeatExtra: 2 }], specialText: 'Every defeat costs 2 more of the War’s resource, for everybody. Workers come off a Strength track; the Steppe is an empty space' } },
    { id: 'mali', name: 'Mali', hex: '#c4a23a', dyn: true, img: '6B',
      B: { bm: ['s-saltcaravan', 's-quarry', 's-goldmine', 's-farm'], res: { food: 3, stone: 7, gold: 5, vp: 4 }, workers: 5,
        track: { food: 4, stab: 4 }, advisors: 1, colonies: 2, wonders: 5, ready: [],
        special: [{ growthBonus: { gold: 1 } }, { gaBonus: 1 }], specialText: 'Growth in gold: +1 gold. Golden Age bonus 1' } }
  ];
  /* Persia's dynasty card lies over a colony space; Japan's over a
     building/military space (Dynasties rulebook). */
  NATIONS.find(n => n.id === 'persia').B.dynCovers = 'colony';

  /* ================================================================
     The 34 Dynasty cards (two a nation, the five base B sides too) and
     Turmoil. A dynasty, once played, REPLACES the nation's special rule.
     ================================================================ */
  const dy = (id, nation, name, fx, text) => ({ id, nation, name, type: 'dynasty', fx, text });
  const DYNASTIES = [
    dy('qin', 'china', 'Qin Dynasty', [{ act: 'qin', max: 3 }], 'Action, up to 3 a round: return a worker → build a wonder section free'),
    dy('ming', 'china', 'Ming Dynasty', [{ onTakeWorker: { food: 4 } }], 'Take a worker: +4 food'),
    dy('newkingdom', 'egypt', 'New Kingdom', [{ battleDiscount: 2 }], 'Battles cost you 2 gold less'),
    dy('oldkingdom', 'egypt', 'Old Kingdom', [{ act: 'oldkingdom' }, { on: 'prod', perToken: 'oldkingdom', gain: { book: 2 } }], 'Action: give up your advisor for a token here. Production: +2 books a token. Defeated: lose a token'),
    dy('sparta', 'greece', 'Sparta', [{ spartaStr: 4 }], 'Exactly one worker on military: +4 strength'),
    dy('athens', 'greece', 'Athens', [{ afterProd: { if: 'mostBook', gain: { gold: 3 } } }], 'After production: most books → +3 gold'),
    dy('achaemenid', 'persia', 'Achaemenid Empire', [{ growthFreeDeploy: true }], 'Grow a worker: your first action may put it to work free'),
    dy('sassanid', 'persia', 'Sassanid Empire', [{ turmoilGoldFree: true }], 'Take Turmoil for 2 gold: the Turmoil card is discarded at once (no stability lost)'),
    dy('romanempire', 'rome', 'Roman Empire', [{ on: 'prod', if: 'mostStrStab', gain: { vp: 1 } }, { on: 'prod', if: 'onlyMostStab', gain: { book: 2 } }], 'Production: strongest and most stable → +1 VP; only most stable → +2 books'),
    dy('romanrepublic', 'rome', 'Roman Republic', [{ act: 'romanrep' }], 'Action: discard one of this round’s architects → +1 stability this round'),
    dy('leon', 'portugal', 'Kingdom of León', [{ warAsBattle: true }], 'Buy a War: you also raid, as if you had bought a Battle'),
    dy('portugueseempire', 'portugal', 'Portuguese Empire', [{ colonyOnWonder: true }], 'Buy a colony: it may go in a free wonder space'),
    dy('jagellonian', 'poland', 'Jagiellonian Dynasty', [{ extraFirst: 1 }], 'Before the first turn: pay 1 gold to the first player (the second if you are first) for an extra action before everybody'),
    dy('plc', 'poland', 'Polish–Lithuanian Commonwealth', [{ advisorOnWonder: true }, { othersBuyAdvisor: 3 }], 'Buy an advisor: it may go in a free wonder space. Others may pay you 3 gold, as an action, to buy one from there'),
    dy('umayyad', 'arabs', 'Umayyad Caliphate', [{ colonyReq: -4 }], 'Colonies need 4 less strength'),
    dy('abbasid', 'arabs', 'Abbasid Caliphate', [{ othersGAvp: true }], 'Someone else buys a Golden Age: you may buy its VP too'),
    dy('federalist', 'america', 'Federalist Party', [{ on: 'buyBuilding', gain: { stone: 2 } }], 'Buy a building: +2 stone'),
    dy('demrep', 'america', 'Democratic-Republicans', [{ act: 'demrep' }], 'Action: the weakest must change dynasty now → +3 books for each that does'),
    dy('mauryan', 'india', 'Mauryan Empire', [{ growthExtra: 2 }], 'Grow a worker: you may take 2 more'),
    dy('mughalempire', 'india', 'Mughal Empire', [{ on: 'wonderReady', gain: { vp: 1 } }], 'A wonder of yours is finished: +1 VP'),
    dy('axumite', 'ethiopia', 'Axumite Kingdom', [{ axumite: 3 }], 'After the event: mark a card on the board — anybody else who buys it pays you 3 gold'),
    dy('sheba', 'ethiopia', 'Sheba', [{ on: 'buyColony', noUpkeepRound: true }], 'Buy a colony: no military upkeep this round'),
    dy('domains', 'venice', 'Domains of the Sea', [{ colonyDiscard: { vp: 1, gold: 2 } }], 'Buy a colony: you may discard it for +1 VP and +2 gold'),
    dy('pactum', 'venice', 'Pactum Warmundi', [{ othersBattleColony: { gold: 1 } }], 'Someone else buys a Battle or a colony: +1 gold'),
    dy('varangians', 'vikings', 'Varangians', [{ on: 'buyAdvisor', gain: { book: 4 } }], 'Buy an advisor: +4 books'),
    dy('normans', 'vikings', 'Normans', [{ raid: 3 }], 'Raid +3'),
    dy('koryo', 'korea', 'Koryo Kingdom', [{ warStrPerMil: 3 }], 'Against the War: +3 strength per worker on military'),
    dy('joseon', 'korea', 'Joseon Kingdom', [{ act: 'joseon', once: true }], 'Action, once a round: store up to 3 of food, stone or gold here — after the round you get twice that back'),
    dy('heian', 'japan', 'Heian Period', [{ gaBookPlus: 4 }], 'A Golden Age’s books: +4 more'),
    dy('edo', 'japan', 'Edo Period', [{ noDefeat: true }, { noColonyNatural: true }], 'Defeat in a War costs nothing. You may not buy colonies or Natural Wonders'),
    dy('goldenhorde', 'mongolia', 'Golden Horde', [{ othersWarGold: true }], 'Someone else buys a War: you get the gold they paid'),
    dy('yuan', 'mongolia', 'Yuan Dynasty', [{ onPlay: { takeWorkers: 3 } }], 'When played: take 3 workers'),
    dy('songhai', 'mali', 'Songhai Empire', [{ songhai: 3 }], 'Famine: the weakest of the others pay 3 food more'),
    dy('maliempire', 'mali', 'Mali Empire', [{ act: 'maliempire' }], 'Action: give up your advisor and 2 gold → +3 books, +1 VP')
  ];
  const DYN_BY_ID = {};
  for (const d of DYNASTIES) DYN_BY_ID[d.id] = d;
  /* Six Turmoil cards; as many go out each round as architects do. */
  const TURMOIL = 6;

  /* ================================================================
     The events. Architects and famine read off the cards (and match the
     spreadsheet); the two effects are descriptors, key below.
     ================================================================ */
  function ev(id, age, img, arch, famine, a, b) { return { id, age, img, arch, famine, a, b }; }
  const E = (name, fx, text) => ({ name, fx: Array.isArray(fx) ? fx : [fx], text });
  const EVENTS = [
    /* Antiquity */
    ev('rigveda', 1, 'event_1_ (1)', 0, 2,
      E('Rigveda', { sel: 'all', perWarBattle: { book: 1 } }, 'Everyone: +1 book for each War and Battle they bought this round'),
      E('Exodus', { sel: 'mostFood', gain: { food: 4 } }, 'Most food: +4 food')),
    ev('yellowturban', 1, 'event_1_ (2)', 1, 2,
      E('Yellow Turban Rebellion', { sel: 'leastStr', gain: { food: -3 } }, 'Weakest: −3 food'),
      E('Spartacus Revolt', { sel: 'leastStab', last: true, gain: { gold: -1 } }, 'Least stable: goes last and −1 gold')),
    ev('taoism', 1, 'event_1_ (3)', 1, 1,
      E('Taoism', { sel: 'firstPass', gain: { book: 3 } }, 'First to pass: +3 books'),
      E('Philosophy', { sel: 'mostStab', gain: { vp: 1 } }, 'Most stable: +1 VP')),
    ev('breadgames', 1, 'event_1_ (4)', 2, 0,
      E('Bread and Games', { sel: 'mostStab', gain: { food: 3 } }, 'Most stable: +3 food'),
      E('Christianity', { sel: 'all', mayPay: { food: 4 }, get: { book: 6 } }, 'Everyone may pay 4 food for 6 books')),
    ev('shang', 1, 'event_1_ (5)', 1, 1,
      E('Shang Oracle Bones', { sel: 'leastStab', gain: { book: -3 } }, 'Least stable: −3 books'),
      E('Ionian Colonisation', { sel: 'mostFood', gain: { gold: 3 } }, 'Most food: +3 gold')),
    ev('attila', 1, 'event_1_ (6)', 2, 3,
      E('Attila', { sel: 'leastStr', gain: { gold: -3 } }, 'Weakest: −3 gold'),
      E('Zoroastrian Revival', { sel: 'mostStab', either: [{ gain: { stone: 4 } }, { othersGain: { food: -3 } }] }, 'Most stable chooses: +4 stone for themselves, or −3 food for everybody else')),
    ev('qinunification', 1, 'event_1_ (7)', 1, 1,
      E('Qin Unification', { sel: 'all', ifStrGtWar: { vp: 1 } }, 'Everyone stronger than the War: +1 VP'),
      E('Olympic Games', { sel: 'mostStab', first: true }, 'Most stable: goes first')),
    ev('aryan', 1, 'event_1_ (8)', 2, 1,
      E('Aryan Migration', { sel: 'leastStr', gain: { book: -3 } }, 'Weakest: −3 books'),
      E('Code of Hammurabi', { sel: 'allButLeastStab', gain: { food: 3 } }, 'Everyone but the least stable: +3 food')),
    ev('hellenism', 1, 'event_1_ (9)', 0, 1,
      E('Hellenism', { sel: 'mostStr', gain: { stone: 2 }, othersGain: { food: -2 } }, 'Strongest: +2 stone, and everybody else −2 food'),
      E("Ashoka's Conversion", { sel: 'all', undeployFor: { kind: 'military', per: { book: 2 } } }, 'Everyone may take workers off military: +2 books each')),
    ev('assyrian', 1, 'event_1_ (10)', 1, 0,
      E('Assyrian Deportations', { sel: 'leastStr', returnWorker: 1 }, 'Weakest: return a worker to the population track'),
      E('Jain Ascetism', { sel: 'mostStab', regainWar: 'vp' }, 'Most stable: win back any VP lost to the War this round')),
    ev('seapeoples', 1, 'event_1_ (11)', 1, 2,
      E('Sea Peoples', { sel: 'leastStr', either: [{ removeArch: 1 }, { gain: { vp: -1 } }] }, 'Weakest: take an architect off your wonder, or −1 VP'),
      E('Bronze Age Collapse', { sel: 'allButMostStrStab', gain: { vp: -1 } }, 'Everyone except the strongest and the most stable: −1 VP')),
    ev('paxromana', 1, 'event_1_ (12)', 0, 2,
      E('Pax Romana', { sel: 'mostStr', gain: { vp: 1 } }, 'Strongest: +1 VP'),
      E('Han Dynasty', { sel: 'mostStab', mayTakeWorker: 1, gain: { food: 3 } }, 'Most stable: +3 food and may take a worker')),
    /* Medieval */
    ev('ecological', 2, 'event_2_ (1)', 2, 4,
      E('Ecological Collapse', { sel: 'all', either: [{ gain: { food: -2 } }, { last: true }] }, 'Everyone: pay 2 food or go last'),
      E('Caste System', { sel: 'leastStab', gain: { book: -4 } }, 'Least stable: −4 books')),
    ev('benedictine', 2, 'event_2_ (2)', 3, 1,
      E('Benedictine Rule', { sel: 'mostStab', gain: { food: 4 } }, 'Most stable: +4 food'),
      E('Paper Money', { sel: 'all', mayPay: { food: 3 }, get: { gold: 5 } }, 'Everyone may pay 3 food for 5 gold')),
    ev('peaceofgod', 2, 'event_2_ (3)', 0, 2,
      E('Peace of God', { sel: 'mostStr', ifOtherWar: { book: 4 } }, 'Strongest: +4 books if somebody else bought the War'),
      E('Council of Clermont', { sel: 'all', perColonyAge: { age: 2, gain: { vp: 1 } } }, 'Everyone: +1 VP for each Medieval colony')),
    ev('blackdeath', 2, 'event_2_ (4)', 1, 3,
      E('Black Death', { sel: 'all', returnWorker: 1 }, 'Everyone: return a worker to the population track'),
      E('Hunt for Prester John', { sel: 'mostStr', gain: { book: 3 } }, 'Strongest: +3 books')),
    ev('imperialexam', 2, 'event_2_ (5)', 1, 0,
      E('Imperial Examination', { sel: 'advisorAge', ages: [2], gain: { vp: 1 } }, 'Everyone with a Medieval advisor: +1 VP'),
      E('Justinian Code', { sel: 'mostStab', gain: { vp: 1 } }, 'Most stable: +1 VP')),
    ev('martyrdom', 2, 'event_2_ (6)', 1, 1,
      E('Martyrdom of Ali', { sel: 'leastStr', gain: { vp: -1 } }, 'Weakest: −1 VP'),
      E('Scholasticism', { sel: 'mostStab', gain: { book: 3 } }, 'Most stable: +3 books')),
    ev('fourthcrusade', 2, 'event_2_ (7)', 1, 2,
      E('Fourth Crusade', [{ sel: 'mostStr', mayPay: { gold: 3 }, get: { vp: 1 } }, { sel: 'leastStr', gain: { book: -4 } }], 'Strongest may pay 3 gold for 1 VP; weakest −4 books'),
      E('Song Resistance', { sel: 'mostStab', regainWar: 'all' }, 'Most stable: win back everything lost to the War this round')),
    ev('feudal', 2, 'event_2_ (8)', 0, 2,
      E('Feudal Dues', { sel: 'all', noOrderChange: true }, 'The player order does not change this round'),
      E('Hajj from Mali', { sel: 'leastStab', keepGold: 2 }, 'Least stable: lose all gold but 2')),
    ev('lindisfarne', 2, 'event_2_ (9)', 2, 1,
      E('Raid on Lindisfarne', { sel: 'leastStr', gain: { gold: -4 } }, 'Weakest: −4 gold'),
      E('Iconoclasm', { sel: 'leastStab', gain: { food: -2, gold: -2 } }, 'Least stable: −2 food, −2 gold')),
    ev('roland', 2, 'event_2_ (10)', 1, 3,
      E('Chanson de Roland', [{ sel: 'leastStr', gain: { book: -1 } }, { sel: 'mostStr', gain: { book: 3 } }], 'Weakest −1 book; strongest +3 books'),
      E('Zanj Revolt', { sel: 'leastStab', last: true, gain: { food: -2 } }, 'Least stable: goes last and −2 food')),
    ev('baghdad', 2, 'event_2_ (11)', 0, 2,
      E('Sack of Baghdad', { sel: 'leastStr', gain: { book: -5 } }, 'Weakest: −5 books'),
      E('Hanseatic Salt Trade', { sel: 'mostFood', gain: { gold: 4 } }, 'Most food: +4 gold')),
    ev('stupormundi', 2, 'event_2_ (12)', 2, 1,
      E('Stupor Mundi', { sel: 'mostGA', gain: { book: 4 } }, 'Most Golden Ages bought this round: +4 books'),
      E('Great Schism', { sel: 'leastStab', gain: { gold: -3 } }, 'Least stable: −3 gold')),
    /* Renaissance */
    ev('littleiceage', 3, 'event_3_ (1)', 1, 3,
      E('Little Ice Age', { sel: 'all', either: [{ gain: { food: -3 } }, { gain: { book: -5 } }] }, 'Everyone: −3 food or −5 books'),
      E('City Upon a Hill', { sel: 'mostStab', gain: { book: 6 } }, 'Most stable: +6 books')),
    ev('slavetrade', 3, 'event_3_ (2)', 1, 4,
      E('African Slave Trade', { sel: 'leastStr', gain: { vp: -1 } }, 'Weakest: −1 VP'),
      E('Glorious Revolution', { sel: 'mostStab', mayLast: true, get: { gold: 6 } }, 'Most stable may go last for +6 gold')),
    ev('janissaries', 3, 'event_3_ (3)', 1, 2,
      E('Janissaries', { sel: 'mostStr', mayTakeWorker: 2, gain: { stone: 4 } }, 'Strongest: +4 stone and may take 2 workers'),
      E('Council of Trent', { sel: 'mostStab', gain: { stone: 5 } }, 'Most stable: +5 stone')),
    ev('croprotation', 3, 'event_3_ (4)', 2, 4,
      E('Crop Rotation', { sel: 'mostStab', gain: { food: 6 } }, 'Most stable: +6 food'),
      E('Mercantilism', { sel: 'all', undeployFor: { kind: 'building', per: { stone: 2 } } }, 'Everyone may take workers off buildings: +2 stone each')),
    ev('vasa', 3, 'event_3_ (5)', 0, 0,
      E('Sinking of the Vasa', { sel: 'leastStab', either: [{ gain: { gold: -3 } }, { westphalia: 10 }] }, 'Least stable: −3 gold, or −10 strength for Peace of Westphalia'),
      E('Peace of Westphalia', { sel: 'leastStr', gain: { food: -5 } }, 'Weakest: −5 food')),
    ev('pilgrims', 3, 'event_3_ (6)', 3, 3,
      E('Pilgrims', { sel: 'mostFood', takeWorker: 1 }, 'Most food: take a worker'),
      E('Dutch Revolt', { sel: 'leastStab', last: true, gain: { gold: -3 } }, 'Least stable: goes last and −3 gold')),
    ev('spicetrade', 3, 'event_3_ (7)', 0, 2,
      E('Spice Trade', { sel: 'mostFood', gain: { gold: 4 } }, 'Most food: +4 gold'),
      E('Müntzer Revolt', { sel: 'leastStab', last: true, gain: { stone: -3 } }, 'Least stable: goes last and −3 stone')),
    ev('absolutemonarchy', 3, 'event_3_ (8)', 2, 5,
      E('Absolute Monarchy', { sel: 'advisorAge', ages: [1, 2], gain: { book: -4 } }, 'Everyone with an Antiquity or Medieval advisor: −4 books'),
      E('Salem Witch Trials', { sel: 'leastStab', either: [{ gain: { gold: -3 } }, { removeAdvisor: true }] }, 'Least stable: −3 gold or lose your advisor')),
    ev('columbian', 3, 'event_3_ (9)', 1, 1,
      E('Columbian Exchange', [{ sel: 'mostStr', gain: { food: 3 } }, { sel: 'leastStr', gain: { food: -3 } }], 'Strongest +3 food; weakest −3 food'),
      E('Expulsion of Jews', { sel: 'leastStab', gain: { gold: -5 } }, 'Least stable: −5 gold')),
    ev('tulipmania', 3, 'event_3_ (10)', 0, 1,
      E('Tulip Mania', { sel: 'lastPass', gain: { vp: -1 } }, 'Last to pass: −1 VP'),
      E('Kangxi Era', { sel: 'mostStab', first: true, gain: { gold: 3 } }, 'Most stable: goes first and +3 gold')),
    ev('magellan', 3, 'event_3_ (11)', 2, 3,
      E("Magellan's Expedition", { sel: 'all', perColonyBought: { gold: 5 } }, 'Everyone: +5 gold for each colony bought this round'),
      E('Papal Indulgence', { sel: 'mostStab', freeArch: 1, othersGain: { gold: -2 } }, 'Most stable may hire an architect free; everybody else −2 gold')),
    ev('blackbeard', 3, 'event_3_ (12)', 1, 2,
      E('Blackbeard', { sel: 'leastStr', gain: { gold: -5 } }, 'Weakest: −5 gold'),
      E('Habeas Corpus Act', { sel: 'mostStab', gain: { vp: 1 } }, 'Most stable: +1 VP')),
    /* Industrial */
    ev('tonghak', 4, 'event_4_ (1)', 0, 5,
      E('Tonghak Movement', { sel: 'leastStr', gain: { book: -8, stone: 2 } }, 'Weakest: −8 books, +2 stone'),
      E('Sepoy Mutiny', { sel: 'leastStab', last: true, gain: { gold: -5 } }, 'Least stable: goes last and −5 gold')),
    ev('sokoto', 4, 'event_4_ (2)', 0, 3,
      E('Sokoto Caliphate', { sel: 'all', mayPay: { food: 4 }, get: { gold: 8 } }, 'Everyone may pay 4 food for 8 gold'),
      E('Tennis Court Oath', { sel: 'leastStab', gain: { gold: -7 } }, 'Least stable: −7 gold')),
    ev('romanticism', 4, 'event_4_ (3)', 2, 6,
      E('Romanticism', { sel: 'firstPass', gain: { book: 5 } }, 'First to pass: +5 books'),
      E('Industrial Revolution', { sel: 'mostIndWorkers', gain: { vp: 1 } }, 'Most workers on Industrial buildings: +1 VP')),
    ev('sickman', 4, 'event_4_ (4)', 3, 1,
      E('Sick Man of Europe', { sel: 'leastStr', gain: { gold: -8 } }, 'Weakest: −8 gold'),
      E("Women's Suffrage", { sel: 'mostStab', gain: { vp: 1 } }, 'Most stable: +1 VP')),
    ev('krakatoa', 4, 'event_4_ (5)', 1, 3,
      E('Eruption of Krakatoa', { sel: 'leastFood', gain: { vp: -1 } }, 'Least food: −1 VP'),
      E('First Vatican Council', { sel: 'mostStab', gain: { book: 10 } }, 'Most stable: +10 books')),
    ev('entente', 4, 'event_4_ (6)', 2, 4,
      E('Entente Cordiale', { sel: 'mostStr', freeMilDeploy: 2 }, 'Strongest may put 2 workers on military for free'),
      E('General Strike', { sel: 'leastStab', gain: { stone: -6 } }, 'Least stable: −6 stone')),
    ev('weltpolitik', 4, 'event_4_ (7)', 2, 2,
      E('Weltpolitik', { sel: 'all', perColonyAge: { age: 4, gain: { gold: 5, stone: 5 } } }, 'Everyone: +5 gold and +5 stone for each Industrial colony'),
      E('Emigration', { sel: 'leastStab', returnWorker: 1 }, 'Least stable: return a worker to the population track')),
    ev('goldrush', 4, 'event_4_ (8)', 0, 3,
      E('Californian Gold Rush', { sel: 'mostStr', gain: { gold: 8 } }, 'Strongest: +8 gold'),
      E('Irish Potato Blight', { sel: 'leastStab', gain: { food: -8 } }, 'Least stable: −8 food')),
    ev('moscow', 4, 'event_4_ (9)', 1, 5,
      E('March to Moscow', { sel: 'leastFood', removeColony: 1 }, 'Least food: lose a colony, or −1 VP if you have none'),
      E('Taiping Rebellion', { sel: 'leastStab', last: true, gain: { book: -10 } }, 'Least stable: goes last and −10 books')),
    ev('anarchism', 4, 'event_4_ (10)', 1, 4,
      E('Anarchism', { sel: 'leastStr', removeAdvisors: true, gain: { vp: -1 } }, 'Weakest: lose your advisors and −1 VP'),
      E('Great Exhibition', { sel: 'mostStab', freeArch: 2 }, 'Most stable may hire 2 architects free')),
    ev('americanrev', 4, 'event_4_ (11)', 1, 2,
      E('American Revolution', { sel: 'leastStr', removeColony: 1 }, 'Weakest: lose a colony, or −1 VP if you have none'),
      E('French Revolution', { sel: 'leastStab', removeAdvisorOr: 2 }, 'Least stable: lose your advisor, or −2 VP if you have none')),
    ev('scramble', 4, 'event_4_ (12)', 1, 4,
      E('Scramble for Africa', { sel: 'all', ifColonyAge: 4, gain: { vp: 1 } }, 'Everyone with an Industrial colony: +1 VP'),
      E('Dreyfus Affair', { sel: 'leastStab', gain: { book: -8 } }, 'Least stable: −8 books')),
    /* Promo events (lobby option), from the user's print sheet 7. */
    Object.assign(ev('solareclipse', 1, '7-2-7', 2, 2,
      E('Solar Eclipse', { sel: 'all', orderByPass: true }, 'Next round’s order is the order everybody passed in'),
      E('Spring and Autumn Period', { sel: 'all', springAutumn: { one: { stone: 2 }, both: { vp: 1 } } }, 'Everyone: stronger than one neighbour → +2 stone; stronger than both → +1 VP instead')), { promo: true }),
    Object.assign(ev('imperiumrex', 3, '7-1-7', 3, 6,
      E('Imperium Rex', { sel: 'all', endGame: true }, 'The game ends after this round: famine, books, then the final score'), null), { promo: true })
  ];

  /* ================================================================
     Words for the effects the telly and phone print on a card. Written
     fresh; generated from the descriptors wherever they carry numbers.
     ================================================================ */
  const TEXT = {
    augustine: 'Production: most stable → +2 books',
    hatshepsut: 'Each of your wonders finished → +3 books',
    qinshihuang: 'Removed the moment you are least stable',
    aquino: 'Production: most stable → +4 books',
    harald: 'Removed the moment you are weakest',
    sejong: 'Buy a Golden Age → +2 stone',
    komnene: 'Production: military workers cost no upkeep',
    montezuma: 'Buy a War or a Battle → +3 books',
    galileo: 'Action, once a round: buy a Golden Age or a Wonder for nothing',
    isabella: 'Production: +3 gold per Renaissance colony',
    elizabeth: 'Against the War: +8 strength',
    nightingale: 'Running short never costs you VP',
    frederick: 'Military cost 2 stone less to deploy on (at least 1)',
    antoinette: '',
    linzexu: 'Production: weakest → −8 books',
    boudica: 'Removed the moment you have a worker on military',
    archimedes: 'One private architect every round',
    cyrus: 'Production: bought a colony this round → +3 gold',
    suntzu: 'Your first turn each round is two actions',
    hannibal: 'Raid +1. Everybody else pays 1 gold more for a Battle',
    buddha: 'Your first turn each round is skipped',
    mansamusa: 'Spend your last gold → +2 books, +1 food',
    eleanor: 'Production: bought a colony this round → +5 gold',
    abubakr: 'Buy a Battle → +2 books',
    genghis: 'Every nation, yours too: −3 stability',
    alhazen: 'Action, once a round: swap two cards on the progress board',
    marcopolo: 'Action, once a round: pay 2 food or 2 stone → +4 gold',
    pocahontas: 'Every colony needs 4 more strength, for everybody',
    luther: 'Every defeat costs 4 food more, for everybody',
    tokugawa: 'Production: +2 stone per Renaissance building and military you have',
    peter: 'Production: stronger than the War → +5 stone, gold or books',
    machiavelli: 'New events: draw two, keep one',
    suleiman: 'Action, when strongest: take a worker',
    curie: 'Two private architects every round',
    lincoln: 'Action: take a worker',
    disraeli: 'Production: bought a colony this round → +8 food',
    nobel: 'You may not buy a War. Production: +3 stone per worker on Industrial buildings',
    bolivar: 'Action: give up a colony → +4 gold, +4 stone',
    shaka: 'Whenever someone else buys a colony, you get 5 stone',
    stonehenge: 'When ready: +6 books, +4 food',
    colosseum: 'When ready: −2 food',
    notredame: 'Production: most stable → +3 books',
    alhambra: 'One private architect every round',
    sankore: 'When ready: +8 books',
    porcelain: 'This wonder space can hold an advisor',
    sistine: 'Hire an architect → +3 books',
    versailles: 'When ready: you are least stable for the rest of the round',
    tajmahal: 'When ready: +15 books',
    darwin: 'When ready: +15 gold',
    southpole: 'When ready: −5 food',
    sphinx: 'Each wonder you finish after this → +5 stone',
    greatlighthouse: 'Buy a card for 3 gold → +1 book',
    petra: 'Action, once a round: pay 1 food → +3 books, gold or stone',
    terracotta: 'When ready: the least stable lose 4 gold',
    solomon: 'End of each age: +1 VP. Removed if you are defeated in a War',
    chichenitza: 'Buy a War → +1 VP',
    moai: 'When ready: +12 stone',
    angkorwat: 'Production: weakest → −4 books',
    greatwall: 'Passed first: no VP lost to the War',
    piazza: 'Action, once a round: pay 2 gold → +5 books, food or stone',
    royalsociety: 'Action, once a round: put a worker to work for free',
    uraniborg: 'Golden Age bonus 2',
    potala: 'Final score: +1 VP per advisor you have',
    forbidden: 'Pass first → +1 VP',
    himeji: 'Replace a building with a newer age one → +4 stone',
    redfort: 'Buy a card for 1 gold → +2 food',
    bigben: 'Final score: +1 VP per Industrial colony',
    britishmuseum: 'When ready: the weakest lose 10 books',
    brandenburg: 'When ready: strongest → +6 gold, +6 stone',
    titanic: 'When ready: everybody pays 4 gold or loses their advisor',
    mit: 'Buy a new building → one worker onto it for free',
    liberty: 'Final score: +2 VP if you have the most workers',
    /* Dynasties */
    assassin: 'Buy a Battle with a worker here: everybody else pays 3 food or loses their advisor',
    coffeehouse: 'Pass last: +2 books per worker here',
    vesuvius: 'End of each age: return a worker',
    pillar: 'Discovered: +7 strength this round',
    siwa: 'Buy a colony → +3 books',
    ararat: 'Discovered: everybody else −3 food',
    hypatia: 'Production: +1 token, then +1 book a token. Removed above 2 stability',
    greatlibrary: 'Golden Age bonus 1. Lost while you are least stable',
    zhuxi: 'Stays when first replaced: the new advisor joins him',
    siberia: 'Fills two wonder spaces',
    aurora: 'Discovered: +2 gold',
    shwedagon: 'Action, before anybody has passed: +1 stability this round',
    sahara: 'Against the War: +4 strength',
    hawaii: 'Discovered: a worker that costs no upkeep',
    spiceislands: 'Growth in food, stone or gold: +4 more',
    oresund: 'Passed and skipped in turn order → +2 stone',
    greatplains: 'Discovered: a new building/military space',
    capegoodhope: 'Colonies need 4 less strength',
    linnaeus: 'A Golden Age’s VP: +1 more',
    grandcanyon: 'Final score: +1 VP per other Natural Wonder',
    reef: 'Action, once a round: −1 VP → +5 food',
    wardenclyffe: 'When ready: take 3 more actions',
    victoria: 'Discovered: deal 20 cards — the colonies make a 4th row, 4 gold each, for everybody',
    uluru: 'Discovered: +1 VP per nation that has passed',
    titusville: 'Final score: your stone counts double',
    northwest: 'Discovered: return 2 workers',
    chopin: 'Your book production doubles. Others may buy him from you for 5 gold before you pass',
    turk: 'When ready: +2 VP. Action: give it to a less stable nation',
    kremlin: 'Strongest: +4 stability',
    grandduchy: 'Action, once a round: skip your turn without passing',
    tesla: 'Action: pay 2 gold, roll a die → that much strength this round',
    's-varanasi': 'Production: +1 book and +1 food per idle worker',
    's-uppsala': 'Action, once a round: −1 food → +3 strength this round',
    's-constantinople': 'A Golden Age’s VP costs 1 resource less',
    's-emperor': 'An advisor you buy is discarded: +1 strength for good',
    's-siberia': 'The second space Siberia fills'
  };
  /* What the Golden Ages with their own first option do instead of +2. */
  const GA_ALT = {
    arabian: 'This round, each time you are skipped for having passed: +2 books',
    levite: '+3 architects this round, and yours cost 1 stone less a section this round',
    uncletom: 'Every nation loses its buildings that cost 1 stone to deploy on',
    powergrid: 'Refill the empty places on the board and take 2 gold',
    antikythera: 'Turn up the next age’s cards to the first Golden Age, wonder or building — and take it free'
  };

  /* ================================================================
     The manifest — what is real, what is inferred, what is not built.
     ================================================================ */
  const MANIFEST = {
    real: [
      'All 296 progress cards of the base game (base, advanced, expert), numbers read off the printed cards',
      'All 48 event cards',
      'The five nations, A and B sides',
      'The four difficulty levels',
      'Wars, battles, golden ages, colonies, wonders and architects as the rulebook plays them',
      'Book scoring at the end of each age and the full final score'
    ],
    inferred: [
      'Radio (Industrial expert building): the module carries a duplicate scan in its place — its numbers come from the spreadsheet'
    ],
    notBuilt: [
      'The solo shadow opponent (house players fill the chairs instead)',
      'Hagia Sophia (the one promo card not on the print sheets)'
    ],
    decisions: [
      'Growth is chosen by everybody at once rather than in reverse order — nobody learns anything from anybody else’s choice.',
      'With no War bought, the War stands at strength 0 (the marker never left the space): "stronger than the War" then means any strength at all.',
      'An effect that hits "everybody else" when a strongest or most stable nation gains (Hellenism, Papal Indulgence) happens only if there IS a single strongest / most stable nation.',
      'Sea Peoples’ "remove an architect" takes the last architect off your wonder under construction; you may take the VP loss instead.',
      'A ready wonder goes into a free wonder space if there is one; only a full board asks which wonder it covers.',
      'Statue of Liberty’s "most workers" counts every worker you own (idle and at work).',
      'Mansa Musa pays out when an action of yours leaves you on exactly 0 gold.',
      'Dynasties: the Democratic-Republicans’ action touches only the OTHER weakest nations.',
      'Dynasties: Ming’s +4 food comes with every worker you take, in growth or from a card.',
      'Dynasties: while a Natural Wonder is being explored you may not pass either — exploring is your only action.',
      'Dynasties: Victoria Falls’ fourth row stays out until its colonies are bought.',
      'Dynasties: a colony or an advisor in a wonder space works like any other, but events that count colonies or advisors count it too.',
      'Promo: Imperium Rex ends the game after its round — books are scored then, as at the end of an age.'
    ]
  };
  MANIFEST.real.push(
    'Nations: Dynasties — the 12 new nations, the 34 dynasty cards (the five base B sides too), Turmoil, the 43 new progress cards and the 20 Natural Wonders, read off the user’s print-and-play sheets',
    'Promo cards from the same sheets as a lobby option: Antikythera Mechanism, Mechanical Turk, Kremlin, Grand Duchy of Finland, Nikola Tesla, Power Grid, and the events Solar Eclipse and Imperium Rex'
  );

  const card = id => BY_ID[id] || DYN_BY_ID[id] || null;
  const BY_ID = {};
  const ALL = CARDS.concat(DYN_CARDS, START);
  for (const c of ALL) BY_ID[c.id] = c;
  for (const c of ALL) if (!c.text) c.text = TEXT[c.id] || TEXT[c.id.replace(/^s-/, '')] || (c.alt ? GA_ALT[c.alt] : '') || '';
  const EV_BY_ID = {};
  for (const e of EVENTS) EV_BY_ID[e.id] = e;

  const Data = {
    RES, AGE_NAME, ROMAN, DIFFICULTY, ARCHITECTS, COLUMNS, ROW_PRICE,
    CARDS, DYN_CARDS, START, NATIONS, A_SIDE, EVENTS, MANIFEST, DYNASTIES, TURMOIL, GA_ALT,
    card, event: id => EV_BY_ID[id] || null, dynasty: id => DYN_BY_ID[id] || null,
    deck: (age, sets) => CARDS.concat(DYN_CARDS).filter(c => c.age === age && sets.indexOf(c.set) >= 0).map(c => c.id)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.NationsData = Data;

  /* ---------------- the key to `fx` ----------------
   on:'prod'            during production. `if` mostStab|mostStr|leastStr|passedFirst;
                        ifColonyBought; perColonyAge N; perCurAgeBM; perIndWorker;
                        ifStrGtWar + choose [..]. `gain` is added (negative = loss).
   on:'ready'           when this wonder is finished (for its owner, or `sel` others).
   on:'wonderReady'     each time one of your wonders is finished.
   on:'otherWonderReady' each wonder you finish after this one.
   on:'buyGA' | 'buyWar' | 'buyBattle' | 'buyWarOrBattle' | 'hire'
   on:'buyAt', price    buying a card at exactly that price.
   remove: leastStab|leastStr|milWorker     checked after every change.
   privArch N, gaBonus N, str N, raid N, othersBattleCost N, warStr N,
   noMilUpkeep, noLackVP, milDeployDiscount N, allStab N, allColonyReq N,
   allDefeatFood N, noWar, othersColony {..}, lastGold {..}, eventChoose,
   twoFirst, skipFirst, advisorSpace, passFirstNoWarVP, passFirst {vp},
   replaceNewer {..}, mitDeploy, endAge {vp}, removeIfDefeated,
   score perAdvisor|perIndColony|mostWorkers, act <name> [once].
  */
})(typeof window !== 'undefined' ? window : globalThis);
