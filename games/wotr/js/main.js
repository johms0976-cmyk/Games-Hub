/* ============================================
   WAR OF THE RING - Digital Edition
   Main Game Engine + Board Overlay + Event Cards
   ============================================ */

// Board image is 1344x896. Game canvas is 2x = 2688x1792
const BOARD_SCALE = 2;

const NATIONS = {
    gondor:    { name: 'Gondor',     side: 'fp', color: '#3a6fbf', startPolitics: 2, startActive: false },
    rohan:     { name: 'Rohan',      side: 'fp', color: '#2a7a3a', startPolitics: 3, startActive: false },
    north:     { name: 'The North',  side: 'fp', color: '#5a9abf', startPolitics: 3, startActive: false },
    dwarves:   { name: 'Dwarves',    side: 'fp', color: '#8a6a3a', startPolitics: 3, startActive: false },
    elves:     { name: 'Elves',      side: 'fp', color: '#4aaa5a', startPolitics: 3, startActive: true },
    sauron:    { name: 'Sauron',     side: 'shadow', color: '#bf3a3a', startPolitics: 1, startActive: true },
    isengard:  { name: 'Isengard',   side: 'shadow', color: '#bfaa3a', startPolitics: 1, startActive: true },
    southrons: { name: 'Southrons & Easterlings', side: 'shadow', color: '#bf7a3a', startPolitics: 2, startActive: true },
};

const POLITICS_LABELS = { 3: 'Not At War', 2: 'Not At War', 1: 'Not At War', 0: 'At War' };

// Coordinates mapped to 2688x1792 canvas (2x board image 1344x896)
// Each x,y is the pixel position on the 2x-scaled board
const REGIONS = {
    // Free Peoples Strongholds
    'rivendell':       { name: 'Rivendell',       x: 880, y: 400, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'grey-havens':     { name: 'Grey Havens',     x: 365, y: 432, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'woodland-realm':  { name: 'Woodland Realm',  x: 1396, y: 198, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'lorien':          { name: 'Lórien',          x: 1138, y: 556, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'helms-deep':      { name: "Helm's Deep",     x: 836, y: 856, nation: 'rohan',   settlement: 'stronghold', vp: 2 },
    'minas-tirith':    { name: 'Minas Tirith',    x: 1268, y: 932, nation: 'gondor',  settlement: 'stronghold', vp: 2 },
    'dol-amroth':      { name: 'Dol Amroth',      x: 1040, y: 1056, nation: 'gondor',  settlement: 'city', vp: 1 },
    'erebor':          { name: 'Erebor',           x: 1540, y: 170, nation: 'dwarves', settlement: 'stronghold', vp: 2 },
    // Free Peoples Cities/Towns
    'edoras':          { name: 'Edoras',           x: 940, y: 932, nation: 'rohan',   settlement: 'city', vp: 1 },
    'dale':            { name: 'Dale',             x: 1466, y: 204, nation: 'north',  settlement: 'city', vp: 1 },
    'pelargir':        { name: 'Pelargir',         x: 1150, y: 1080, nation: 'gondor',  settlement: 'city', vp: 1 },
    'bree':            { name: 'Bree',             x: 608, y: 448, nation: 'north',   settlement: 'town' },
    'the-shire':       { name: 'The Shire',        x: 458, y: 436, nation: 'north',   settlement: 'town' },
    'north-downs':     { name: 'North Downs',      x: 638, y: 382, nation: 'north',   settlement: 'town' },
    'carrock':         { name: 'Carrock',          x: 1110, y: 302, nation: 'north',   settlement: 'town' },
    'ered-luin':       { name: 'Ered Luin',        x: 334, y: 338, nation: 'dwarves', settlement: 'town' },
    'iron-hills':      { name: 'Iron Hills',       x: 1688, y: 184, nation: 'dwarves', settlement: 'town' },
    // Fortifications
    'osgiliath':       { name: 'Osgiliath',        x: 1308, y: 920, nation: 'gondor',  settlement: 'fortification' },
    'fords-of-isen':   { name: 'Fords of Isen',    x: 754, y: 844, nation: 'rohan',  settlement: 'fortification' },
    // Shadow Strongholds
    'barad-dur':       { name: 'Barad-dûr',        x: 1710, y: 880, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'dol-guldur':      { name: 'Dol Guldur',       x: 1290, y: 516, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'minas-morgul':    { name: 'Minas Morgul',     x: 1480, y: 960, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'orthanc':         { name: 'Orthanc',          x: 782, y: 740, nation: 'isengard', settlement: 'stronghold', vp: 2 },
    'mount-gundabad':  { name: 'Mount Gundabad',   x: 1010, y: 136, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'morannon':        { name: 'Morannon',         x: 1530, y: 824, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'umbar':           { name: 'Umbar',            x: 1118, y: 1376, nation: 'southrons', settlement: 'stronghold', vp: 2 },
    // Shadow Cities/Towns
    'moria':           { name: 'Moria',            x: 944, y: 544, nation: 'sauron', settlement: 'town' },
    'gorgoroth':       { name: 'Gorgoroth',        x: 1618, y: 952, nation: 'sauron', settlement: 'town' },
    'nurn':            { name: 'Nurn',             x: 1694, y: 1048, nation: 'sauron', settlement: 'town' },
    'far-harad':       { name: 'Far Harad',        x: 1280, y: 1316, nation: 'southrons', settlement: 'town' },
    'near-harad':      { name: 'Near Harad',       x: 1440, y: 1232, nation: 'southrons', settlement: 'town' },
    'north-rhun':      { name: 'North Rhûn',       x: 1808, y: 440, nation: 'southrons', settlement: 'town' },
    'south-rhun':      { name: 'South Rhûn',       x: 1858, y: 618, nation: 'southrons', settlement: 'town' },
    'north-dunland':   { name: 'N. Dunland',    x: 700, y: 668, nation: 'isengard', settlement: 'town' },
    'south-dunland':   { name: 'S. Dunland',    x: 734, y: 734, nation: 'isengard', settlement: 'town' },
    // Wilderness / Key Locations
    'mount-doom':      { name: 'Mount Doom',       x: 1640, y: 916, nation: null, settlement: null, mordor: true },
    'fangorn':         { name: 'Fangorn',          x: 856, y: 718, nation: null, settlement: null },
    'dead-marshes':    { name: 'Dead Marshes',     x: 1408, y: 790, nation: null, settlement: null },
    'druadan-forest':  { name: 'Druadan Forest',   x: 1124, y: 930, nation: null, settlement: null },
    'westemnet':       { name: 'Westemnet',        x: 878, y: 908, nation: null, settlement: null },
    'eastemnet':       { name: 'Eastemnet',        x: 1050, y: 828, nation: null, settlement: null },
    'gap-of-rohan':    { name: 'Gap of Rohan',     x: 764, y: 796, nation: null, settlement: null },
    'cardolan':        { name: 'Cardolan',         x: 584, y: 574, nation: null, settlement: null },
    'enedwaith':       { name: 'Enedwaith',        x: 616, y: 684, nation: null, settlement: null },
    'minhiriath':      { name: 'Minhiriath',       x: 494, y: 664, nation: null, settlement: null },
    'andrast':         { name: 'Andrast',          x: 716, y: 1036, nation: null, settlement: null },
    'anfalas':         { name: 'Anfalas',          x: 836, y: 1052, nation: null, settlement: null },
    'lamedon':         { name: 'Lamedon',          x: 990, y: 1082, nation: null, settlement: null },
    'lebennin':        { name: 'Lebennin',         x: 1168, y: 1038, nation: null, settlement: null },
    'west-harondor':   { name: 'W. Harondor',  x: 1250, y: 1136, nation: null, settlement: null },
    'east-harondor':   { name: 'E. Harondor',  x: 1376, y: 1116, nation: null, settlement: null },
    'ithilien':        { name: 'Ithilien',         x: 1380, y: 960, nation: null, settlement: null },
    'south-ithilien':  { name: 'S. Ithilien',  x: 1408, y: 1032, nation: null, settlement: null },
    'dagorlad':        { name: 'Dagorlad',         x: 1470, y: 734, nation: null, settlement: null },
    'ash-mountains':   { name: 'Ash Mountains',    x: 1738, y: 788, nation: null, settlement: null },
    'southern-mirkwood':{ name: 'S. Mirkwood',  x: 1240, y: 418, nation: null, settlement: null },
    'northern-mirkwood':{ name: 'N. Mirkwood',  x: 1298, y: 240, nation: null, settlement: null },
    'western-mirkwood': { name: 'W. Mirkwood',  x: 1178, y: 310, nation: null, settlement: null },
    'old-forest-road': { name: 'Old Forest Road',  x: 1260, y: 330, nation: null, settlement: null },
    'vale-of-anduin':  { name: 'Vale of Anduin',   x: 1124, y: 420, nation: null, settlement: null },
    'dimrill-dale':    { name: 'Dimrill Dale',     x: 990, y: 498, nation: null, settlement: null },
    'gladden-fields':  { name: 'Gladden Fields',   x: 1080, y: 432, nation: null, settlement: null },
    'parth-celebrant': { name: 'Parth Celebrant',  x: 1090, y: 626, nation: null, settlement: null },
    'south-anduin-vale':{ name: 'S. Anduin Vale', x: 1084, y: 718, nation: null, settlement: null },
    'weather-hills':   { name: 'Weather Hills',    x: 710, y: 416, nation: null, settlement: null },
    'angmar':          { name: 'Angmar',           x: 780, y: 256, nation: null, settlement: null },
    'ettenmoors':      { name: 'Ettenmoors',       x: 854, y: 310, nation: null, settlement: null },
    'withered-heath':  { name: 'Withered Heath',   x: 1300, y: 112, nation: null, settlement: null },
    'iron-mountains':  { name: 'Iron Mountains',   x: 1636, y: 108, nation: null, settlement: null },
    'erech':           { name: 'Erech',            x: 900, y: 1000, nation: null, settlement: null },
    'lossarnach':      { name: 'Lossarnach',       x: 1210, y: 980, nation: null, settlement: null },
    'old-forest':      { name: 'Old Forest',       x: 530, y: 492, nation: null, settlement: null },
    'trollshaws':      { name: 'Trollshaws',       x: 810, y: 360, nation: null, settlement: null },
};

const ADJACENCIES = [
    ['the-shire', 'bree'], ['bree', 'cardolan'], ['bree', 'weather-hills'], ['bree', 'north-downs'],
    ['the-shire', 'old-forest'], ['old-forest', 'bree'], ['old-forest', 'cardolan'],
    ['cardolan', 'enedwaith'], ['cardolan', 'minhiriath'], ['enedwaith', 'minhiriath'],
    ['enedwaith', 'north-dunland'], ['enedwaith', 'gap-of-rohan'],
    ['north-dunland', 'south-dunland'], ['south-dunland', 'orthanc'], ['south-dunland', 'gap-of-rohan'],
    ['orthanc', 'fangorn'], ['orthanc', 'gap-of-rohan'],
    ['gap-of-rohan', 'fords-of-isen'], ['fords-of-isen', 'helms-deep'], ['fords-of-isen', 'westemnet'],
    ['helms-deep', 'westemnet'], ['westemnet', 'edoras'], ['westemnet', 'eastemnet'],
    ['edoras', 'eastemnet'], ['edoras', 'druadan-forest'],
    ['eastemnet', 'parth-celebrant'], ['eastemnet', 'south-anduin-vale'],
    ['druadan-forest', 'minas-tirith'], ['druadan-forest', 'anfalas'],
    ['minas-tirith', 'osgiliath'], ['minas-tirith', 'pelargir'], ['minas-tirith', 'lebennin'],
    ['minas-tirith', 'lossarnach'],
    ['osgiliath', 'ithilien'], ['osgiliath', 'dead-marshes'],
    ['pelargir', 'lebennin'], ['pelargir', 'dol-amroth'], ['pelargir', 'lamedon'],
    ['dol-amroth', 'lamedon'], ['dol-amroth', 'anfalas'],
    ['lamedon', 'lebennin'], ['lamedon', 'erech'],
    ['lebennin', 'west-harondor'], ['lebennin', 'lossarnach'],
    ['west-harondor', 'east-harondor'], ['east-harondor', 'near-harad'],
    ['ithilien', 'south-ithilien'], ['ithilien', 'minas-morgul'], ['ithilien', 'dead-marshes'],
    ['south-ithilien', 'minas-morgul'], ['south-ithilien', 'east-harondor'],
    ['dead-marshes', 'dagorlad'], ['dead-marshes', 'morannon'],
    ['dagorlad', 'morannon'], ['morannon', 'gorgoroth'], ['morannon', 'barad-dur'],
    ['gorgoroth', 'barad-dur'], ['gorgoroth', 'mount-doom'], ['gorgoroth', 'minas-morgul'],
    ['barad-dur', 'nurn'], ['nurn', 'ash-mountains'],
    ['mount-doom', 'barad-dur'],
    ['lorien', 'parth-celebrant'], ['lorien', 'dimrill-dale'], ['lorien', 'south-anduin-vale'],
    ['dimrill-dale', 'moria'], ['dimrill-dale', 'gladden-fields'],
    ['moria', 'fangorn'], ['moria', 'dimrill-dale'],
    ['gladden-fields', 'vale-of-anduin'], ['gladden-fields', 'carrock'],
    ['carrock', 'vale-of-anduin'], ['carrock', 'western-mirkwood'],
    ['vale-of-anduin', 'western-mirkwood'], ['vale-of-anduin', 'lorien'],
    ['western-mirkwood', 'old-forest-road'], ['western-mirkwood', 'northern-mirkwood'],
    ['old-forest-road', 'southern-mirkwood'], ['old-forest-road', 'northern-mirkwood'],
    ['northern-mirkwood', 'woodland-realm'], ['woodland-realm', 'dale'],
    ['dale', 'erebor'], ['erebor', 'iron-hills'], ['dale', 'withered-heath'],
    ['withered-heath', 'iron-mountains'], ['iron-mountains', 'iron-hills'],
    ['mount-gundabad', 'angmar'], ['mount-gundabad', 'ettenmoors'], ['mount-gundabad', 'northern-mirkwood'],
    ['angmar', 'ettenmoors'], ['ettenmoors', 'rivendell'], ['ettenmoors', 'trollshaws'],
    ['rivendell', 'weather-hills'], ['rivendell', 'dimrill-dale'], ['rivendell', 'trollshaws'],
    ['grey-havens', 'the-shire'], ['grey-havens', 'ered-luin'],
    ['north-downs', 'weather-hills'],
    ['southern-mirkwood', 'dol-guldur'], ['dol-guldur', 'lorien'],
    ['near-harad', 'far-harad'], ['far-harad', 'umbar'],
    ['north-rhun', 'south-rhun'], ['south-rhun', 'ash-mountains'],
    ['andrast', 'anfalas'], ['andrast', 'fords-of-isen'],
    ['fangorn', 'south-anduin-vale'], ['parth-celebrant', 'south-anduin-vale'],
    ['minas-morgul', 'gorgoroth'],
    ['trollshaws', 'weather-hills'],
    ['erech', 'anfalas'],
    ['lossarnach', 'osgiliath'],
];

const COMPANIONS = {
    gandalf_grey: { name: 'Gandalf the Grey', level: 3, leadership: 1, guide: true, canUpgrade: 'gandalf_white' },
    strider:      { name: 'Strider',          level: 3, leadership: 1, guide: false, canUpgrade: 'aragorn' },
    legolas:      { name: 'Legolas',           level: 2, leadership: 1, nation: 'elves' },
    gimli:        { name: 'Gimli',             level: 2, leadership: 1, nation: 'dwarves' },
    boromir:      { name: 'Boromir',           level: 2, leadership: 1, nation: 'gondor' },
    merry:        { name: 'Meriadoc',          level: 1, leadership: 1 },
    pippin:       { name: 'Peregrin',          level: 1, leadership: 1 },
};

const UPGRADED_COMPANIONS = {
    gandalf_white: { name: 'Gandalf the White', level: 3, leadership: 1, extraDie: true },
    aragorn:       { name: 'Aragorn',           level: 3, leadership: 2, extraDie: true, nation: 'gondor' },
};

const MINIONS = {
    witch_king: { name: 'The Witch-king', leadership: 2, moveRange: Infinity, extraDie: true, nation: 'sauron' },
    saruman:    { name: 'Saruman',        leadership: 1, moveRange: 0, extraDie: true, nation: 'isengard' },
    mouth:      { name: 'Mouth of Sauron', leadership: 2, moveRange: 3, extraDie: true, nation: 'sauron' },
};

const STARTING_ARMIES = {
    'erebor':         { fp: { regular: 1, elite: 1, leaders: 1 } },
    'ered-luin':      { fp: { regular: 1, elite: 0, leaders: 0 } },
    'iron-hills':     { fp: { regular: 1, elite: 0, leaders: 0 } },
    'grey-havens':    { fp: { regular: 1, elite: 1, leaders: 1 } },
    'rivendell':      { fp: { regular: 0, elite: 2, leaders: 1 } },
    'woodland-realm': { fp: { regular: 1, elite: 1, leaders: 1 } },
    'lorien':         { fp: { regular: 1, elite: 2, leaders: 1 } },
    'minas-tirith':   { fp: { regular: 3, elite: 1, leaders: 1 } },
    'dol-amroth':     { fp: { regular: 3, elite: 0, leaders: 0 } },
    'osgiliath':      { fp: { regular: 2, elite: 0, leaders: 0 } },
    'pelargir':       { fp: { regular: 1, elite: 0, leaders: 0 } },
    'bree':           { fp: { regular: 1, elite: 0, leaders: 0 } },
    'carrock':        { fp: { regular: 1, elite: 0, leaders: 0 } },
    'dale':           { fp: { regular: 1, elite: 0, leaders: 1 } },
    'north-downs':    { fp: { regular: 0, elite: 1, leaders: 0 } },
    'the-shire':      { fp: { regular: 1, elite: 0, leaders: 0 } },
    'edoras':         { fp: { regular: 1, elite: 1, leaders: 0 } },
    'fords-of-isen':  { fp: { regular: 2, elite: 0, leaders: 1 } },
    'helms-deep':     { fp: { regular: 1, elite: 0, leaders: 0 } },
    'barad-dur':      { sp: { regular: 4, elite: 1, nazgul: 1 } },
    'dol-guldur':     { sp: { regular: 5, elite: 1, nazgul: 1 } },
    'gorgoroth':      { sp: { regular: 3, elite: 0, nazgul: 0 } },
    'minas-morgul':   { sp: { regular: 5, elite: 0, nazgul: 1 } },
    'moria':          { sp: { regular: 2, elite: 0, nazgul: 0 } },
    'mount-gundabad':  { sp: { regular: 2, elite: 0, nazgul: 0 } },
    'nurn':           { sp: { regular: 2, elite: 0, nazgul: 0 } },
    'morannon':       { sp: { regular: 5, elite: 0, nazgul: 1 } },
    'far-harad':      { sp: { regular: 3, elite: 1, nazgul: 0 } },
    'near-harad':     { sp: { regular: 3, elite: 1, nazgul: 0 } },
    'north-rhun':     { sp: { regular: 2, elite: 0, nazgul: 0 } },
    'south-rhun':     { sp: { regular: 3, elite: 1, nazgul: 0 } },
    'umbar':          { sp: { regular: 3, elite: 0, nazgul: 0 } },
    'orthanc':        { sp: { regular: 4, elite: 1, nazgul: 0 } },
    'north-dunland':  { sp: { regular: 1, elite: 0, nazgul: 0 } },
    'south-dunland':  { sp: { regular: 1, elite: 0, nazgul: 0 } },
};

const REINFORCEMENTS = {
    fp: { gondor: {regular:6,elite:4,leaders:3}, rohan: {regular:6,elite:4,leaders:3}, north: {regular:6,elite:4,leaders:3}, dwarves: {regular:2,elite:4,leaders:3}, elves: {regular:2,elite:4,leaders:0} },
    sp: { sauron: {regular:8,elite:4,nazgul:4}, isengard: {regular:6,elite:5}, southrons: {regular:10,elite:3} }
};

const FP_DIE_FACES = ['character','character','army','muster','muster_army','will_of_west'];
const SP_DIE_FACES = ['character','character','army','army','muster','eye'];
const DIE_ICONS = { character:'⚔️', army:'🏴', muster:'⚒️', muster_army:'🏴⚒️', will_of_west:'🌟', eye:'👁️' };
const DIE_NAMES = { character:'Character', army:'Army', muster:'Muster', muster_army:'Army/Muster', will_of_west:'Will of the West', eye:'Eye of Sauron' };


// ═══════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════

class GameState {
    constructor() {
        this.turn = 0;
        this.phase = 'setup';
        this.playerSide = null;
        this.currentPlayer = 'fp';
        this.politics = {};
        this.regions = {};
        this.fellowship = { position:'rivendell', progress:0, corruption:0, hidden:true, guide:'gandalf_grey', companions:['gandalf_grey','strider','legolas','gimli','boromir','merry','pippin'], inMordor:false };
        this.separatedCompanions = {};
        this.eliminatedCompanions = [];
        this.minionsInPlay = {};
        this.minionsAvailable = ['witch_king','saruman','mouth'];
        this.fpDice = []; this.spDice = []; this.fpDiceUsed = []; this.spDiceUsed = [];
        this.huntBox = 0;
        // Cards
        this.fpCharDeck = []; this.fpStratDeck = [];
        this.spCharDeck = []; this.spStratDeck = [];
        this.fpHand = []; this.spHand = [];
        this.tableCards = []; // persistent cards in play
        this.allCards = [];
        this.fpVP = 0; this.spVP = 0;
        this.elvenRings = { fp: 3, sp: 0 };
        this.huntPool = this.initHuntPool();
        this.reinforcements = JSON.parse(JSON.stringify(REINFORCEMENTS));
        this.log = [];
        this.selectedRegion = null;
    }

    initHuntPool() {
        const tiles = [];
        for(let i=0;i<4;i++) tiles.push({damage:0,reveal:false,type:'standard'});
        for(let i=0;i<4;i++) tiles.push({damage:1,reveal:false,type:'standard'});
        for(let i=0;i<3;i++) tiles.push({damage:1,reveal:true,type:'standard'});
        for(let i=0;i<2;i++) tiles.push({damage:2,reveal:false,type:'standard'});
        for(let i=0;i<2;i++) tiles.push({damage:2,reveal:true,type:'standard'});
        tiles.push({damage:3,reveal:true,type:'standard'});
        return this.shuffle(tiles);
    }

    shuffle(arr) { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

    initCards(allCards) {
        this.allCards = allCards;
        const fpCards = allCards.filter(c => c.faction === 'free_peoples');
        const spCards = allCards.filter(c => c.faction === 'shadow');
        this.fpCharDeck = this.shuffle(fpCards.filter(c => c.card_type === 'character_event'));
        this.fpStratDeck = this.shuffle(fpCards.filter(c => c.card_type !== 'character_event'));
        this.spCharDeck = this.shuffle(spCards.filter(c => c.card_type === 'character_event'));
        this.spStratDeck = this.shuffle(spCards.filter(c => c.card_type !== 'character_event'));
    }

    drawCards(side, charCount, stratCount) {
        const hand = side === 'fp' ? this.fpHand : this.spHand;
        const charDeck = side === 'fp' ? this.fpCharDeck : this.spCharDeck;
        const stratDeck = side === 'fp' ? this.fpStratDeck : this.spStratDeck;
        for(let i=0;i<charCount && charDeck.length;i++) hand.push(charDeck.pop());
        for(let i=0;i<stratCount && stratDeck.length;i++) hand.push(stratDeck.pop());
    }

    init() {
        Object.entries(NATIONS).forEach(([id,n]) => { this.politics[id] = {step:n.startPolitics, active:n.startActive}; });
        Object.keys(REGIONS).forEach(rid => {
            this.regions[rid] = { fp:{regular:0,elite:0,leaders:0,characters:[]}, sp:{regular:0,elite:0,nazgul:0,characters:[]}, control:null };
            const r = REGIONS[rid];
            if(r.nation) this.regions[rid].control = NATIONS[r.nation].side;
        });
        Object.entries(STARTING_ARMIES).forEach(([rid,armies]) => {
            if(armies.fp) { this.regions[rid].fp.regular=armies.fp.regular||0; this.regions[rid].fp.elite=armies.fp.elite||0; this.regions[rid].fp.leaders=armies.fp.leaders||0; }
            if(armies.sp) { this.regions[rid].sp.regular=armies.sp.regular||0; this.regions[rid].sp.elite=armies.sp.elite||0; this.regions[rid].sp.nazgul=armies.sp.nazgul||0; }
        });
        this.turn = 1;
        this.phase = 'draw_cards';
        // Initial card draw
        this.drawCards('fp', 1, 1);
        this.drawCards('sp', 1, 1);
        this.addLog('The War of the Ring begins. Turn 1.','system');
        this.addLog('Each side draws their starting cards.','system');
    }

    addLog(msg, type='system') { this.log.unshift({msg,type,turn:this.turn}); if(this.log.length>100) this.log.pop(); }

    calculateVP() {
        let fpVP=0, spVP=0;
        Object.entries(this.regions).forEach(([rid,state]) => {
            const region = REGIONS[rid]; if(!region.vp) return;
            const origSide = region.nation ? NATIONS[region.nation].side : null;
            if(origSide==='fp' && state.control==='sp') spVP += region.vp;
            if(origSide==='shadow' && state.control==='fp') fpVP += region.vp;
        });
        this.fpVP = fpVP; this.spVP = spVP;
    }

    getFPDicePool() { let c=4; if(this.separatedCompanions.aragorn) c++; if(this.separatedCompanions.gandalf_white) c++; return Math.min(c,6); }
    getSPDicePool() { let c=7; Object.keys(this.minionsInPlay).forEach(() => c++); return Math.min(c,10); }

    rollDice() {
        const fpPool = this.getFPDicePool();
        const spPool = this.getSPDicePool() - this.huntBox;
        this.fpDice = []; for(let i=0;i<fpPool;i++) this.fpDice.push(FP_DIE_FACES[Math.floor(Math.random()*6)]);
        this.spDice = []; let eyeCount=0;
        for(let i=0;i<spPool;i++) { const f=SP_DIE_FACES[Math.floor(Math.random()*6)]; if(f==='eye') eyeCount++; else this.spDice.push(f); }
        this.huntBox += eyeCount;
        this.fpDiceUsed = []; this.spDiceUsed = [];
        this.addLog(`Dice rolled. FP: ${fpPool} dice. Shadow: ${spPool} dice (+${eyeCount} eyes).`,'system');
    }

    isNationAtWar(nid) { return this.politics[nid]?.step === 0; }
    getRegionArmyTotal(rid,side) { const a=this.regions[rid]?.[side]; return a?(a.regular+a.elite):0; }
    getAdjacentRegions(rid) { const adj=[]; ADJACENCIES.forEach(([a,b]) => { if(a===rid) adj.push(b); if(b===rid) adj.push(a); }); return adj; }
}

// ═══════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════

class GameRenderer {
    constructor(state) {
        this.state = state;
        this.mapZoom = 0.48;
        this.mapOffsetX = -100;
        this.mapOffsetY = -40;
        this.isDragging = false;
        this.dragStart = {x:0,y:0};
    }

    renderSetup() {
        const el = document.getElementById('setup-screen');
        if(!el) return;
        el.innerHTML = `
            <div class="setup-title">War of the Ring</div>
            <div class="setup-subtitle">The fate of Middle-earth rests in your hands</div>
            <div class="side-selection">
                <div class="side-option fp" onclick="game.chooseSide('fp')">
                    <div class="side-icon">🛡️</div>
                    <div class="side-name">Free Peoples</div>
                    <div class="side-desc">Guide the Fellowship, defend the West, and destroy the One Ring</div>
                </div>
                <div class="side-option shadow" onclick="game.chooseSide('shadow')">
                    <div class="side-icon">👁️</div>
                    <div class="side-name">Shadow</div>
                    <div class="side-desc">Command the armies of Mordor and Isengard, hunt the Ring-bearer</div>
                </div>
            </div>
            <div style="color:var(--text-dim);font-size:12px;font-style:italic">AI opponent will play the other side</div>`;
    }

    renderBoard() {
        this.renderHeader();
        this.renderLeftSidebar();
        this.renderMap();
        this.renderRightSidebar();
    }

    renderHeader() {
        const el = document.getElementById('header');
        const pn = {setup:'Setup',draw_cards:'Draw Cards',fellowship:'Fellowship Phase',hunt_allocation:'Hunt Allocation',action_roll:'Action Roll',action_resolution:'Action Resolution',victory_check:'Victory Check'};
        el.innerHTML = `
            <div class="logo">War of the Ring</div>
            <div class="turn-info">
                <span>Turn ${this.state.turn}</span>
                <span class="phase-badge">${pn[this.state.phase]||this.state.phase}</span>
                <span>Playing: ${this.state.playerSide==='fp'?'Free Peoples':'Shadow'}</span>
            </div>
            <div class="controls">
                <button class="btn btn-gold btn-sm" onclick="game.nextPhase()">Next Phase</button>
                <button class="btn btn-gold btn-sm" onclick="game.showCardBrowser()">📜 Cards</button>
                <button class="btn btn-gold btn-sm" onclick="game.showLeaderCards()">Leaders</button>
            </div>`;
    }

    renderLeftSidebar() {
        document.getElementById('left-sidebar').innerHTML = `
            ${this.renderVPPanel()}
            ${this.renderPoliticalTrack()}
            ${this.renderFellowshipTrack()}
            ${this.renderHuntBox()}
            ${this.renderDicePanel()}
            ${this.renderCardHandPanel()}`;
    }

    renderRightSidebar() {
        document.getElementById('right-sidebar').innerHTML = `
            ${this.renderCompanionsPanel()}
            ${this.renderTableCardsPanel()}
            ${this.renderSelectedRegion()}
            ${this.renderLogPanel()}`;
    }

    renderVPPanel() {
        return `<div class="panel"><div class="panel-header">Victory Points</div><div class="panel-body"><div class="vp-display">
            <div class="vp-side fp"><div class="vp-number">${this.state.fpVP}</div><div class="vp-label">Free Peoples</div></div>
            <div class="vp-divider"></div>
            <div class="vp-side shadow"><div class="vp-number">${this.state.spVP}</div><div class="vp-label">Shadow</div></div>
        </div></div></div>`;
    }

    renderPoliticalTrack() {
        const steps = [{label:'Not at War (3)',step:3},{label:'Not at War (2)',step:2},{label:'Not at War (1)',step:1},{label:'At War',step:0}];
        let html = '<div class="panel"><div class="panel-header">Political Track</div><div class="panel-body"><div class="political-track">';
        steps.forEach(s => {
            const nations = Object.entries(this.state.politics).filter(([_,p])=>p.step===s.step)
                .map(([nid,p]) => `<span class="nation-token ${nid}"><span class="status-dot ${p.active?'active':'passive'}"></span>${NATIONS[nid].name}</span>`).join('');
            html += `<div class="political-step${s.step===0?' at-war':''}"><span class="step-label">${s.step===0?'⚔️ War':s.step}</span><div class="nations-in-step">${nations}</div></div>`;
        });
        return html + '</div></div></div>';
    }

    renderFellowshipTrack() {
        const f = this.state.fellowship;
        let prog='', corr='';
        for(let i=0;i<=12;i++) { prog += `<div class="track-step${i===f.progress?' active':''}${i>=9?' mordor-step':''}">${i}</div>`; }
        for(let i=0;i<=12;i++) { corr += `<div class="track-step${i===f.corruption?' corruption':''}">${i}</div>`; }
        return `<div class="panel"><div class="panel-header">Fellowship <span style="font-size:8px;color:var(--text-dim);font-weight:400;text-transform:none;letter-spacing:0">${f.hidden?'🟢 Hidden':'🔴 Revealed'} · ${f.companions.length} comp.</span></div>
        <div class="panel-body">
            <div class="track-row"><span class="track-label">Progress</span><div class="track-steps">${prog}</div></div>
            <div class="track-row"><span class="track-label">Corruption</span><div class="track-steps">${corr}</div></div>
            <div style="margin-top:4px;font-size:9px;color:var(--text-dim)">Guide: <strong style="color:var(--gold)">${COMPANIONS[f.guide]?.name||'Gollum'}</strong> · Location: <strong style="color:var(--text-secondary)">${REGIONS[f.position]?.name||f.position}</strong></div>
        </div></div>`;
    }

    renderHuntBox() {
        let slots = '';
        for(let i=0;i<Math.max(this.state.huntBox,3);i++) { const filled=i<this.state.huntBox?'filled':''; slots+=`<div class="hunt-slot ${filled}">${i<this.state.huntBox?'👁️':''}</div>`; }
        return `<div class="panel"><div class="panel-header">Hunt Box <span style="font-size:8px;color:var(--text-dim);font-weight:400">${this.state.huntBox} dice</span></div><div class="panel-body"><div class="hunt-box-display">${slots}</div></div></div>`;
    }

    renderDicePanel() {
        const rd = (dice,used,side) => dice.map((f,i) => {
            const cls = `action-die ${side} ${used.includes(i)?'used':''}`;
            return `<div class="${cls}" onclick="game.useDie('${side}',${i})" title="${DIE_NAMES[f]}">${DIE_ICONS[f]}</div>`;
        }).join('');
        return `<div class="panel"><div class="panel-header">Action Dice</div><div class="panel-body">
            <div style="font-size:9px;color:var(--fp-color);margin-bottom:2px;font-family:'Cinzel',serif">Free Peoples (${this.state.fpDice.length})</div>
            <div class="dice-area">${rd(this.state.fpDice,this.state.fpDiceUsed,'fp')}</div>
            <div style="font-size:9px;color:var(--shadow-color);margin-top:6px;margin-bottom:2px;font-family:'Cinzel',serif">Shadow (${this.state.spDice.length})</div>
            <div class="dice-area">${rd(this.state.spDice,this.state.spDiceUsed,'shadow')}</div>
            ${this.state.phase==='action_roll'?'<button class="btn btn-gold btn-sm" style="margin-top:6px" onclick="game.rollDice()">Roll Dice</button>':''}
        </div></div>`;
    }

    renderCardHandPanel() {
        const side = this.state.playerSide;
        const hand = side === 'fp' ? this.state.fpHand : this.state.spHand;
        const charDeck = side === 'fp' ? this.state.fpCharDeck : this.state.spCharDeck;
        const stratDeck = side === 'fp' ? this.state.fpStratDeck : this.state.spStratDeck;

        let cardsHtml = '';
        if(!hand.length) {
            cardsHtml = '<div style="font-size:9px;color:var(--text-dim);font-style:italic;padding:4px">No cards in hand</div>';
        } else {
            cardsHtml = '<div class="cards-hand">';
            hand.forEach((card,i) => {
                const factionCls = card.faction === 'free_peoples' ? 'fp-card' : 'sp-card';
                const typeCls = card.card_type === 'combat' ? 'combat' : (card.card_type === 'character_event' ? 'character' : 'strategy');
                const displayName = card.display_name || card.title;
                cardsHtml += `<div class="event-card ${factionCls}" onclick="game.showCardDetail(${i})">
                    <div class="card-title">${displayName} <span class="card-type-badge ${typeCls}">${typeCls}</span></div>
                    <div class="card-text">${card.rules_text.substring(0,80)}${card.rules_text.length>80?'...':''}</div>
                </div>`;
            });
            cardsHtml += '</div>';
        }

        return `<div class="panel"><div class="panel-header">Your Hand (${hand.length}) <span style="font-size:7px;color:var(--text-dim);font-weight:400;text-transform:none;letter-spacing:0">
            Char: ${charDeck.length} · Strat: ${stratDeck.length}</span></div>
            <div class="panel-body">
                ${this.state.phase==='draw_cards'?'<button class="btn btn-gold btn-sm" style="margin-bottom:4px" onclick="game.drawPhaseCards()">Draw Cards</button>':''}
                ${cardsHtml}
            </div></div>`;
    }

    renderTableCardsPanel() {
        const tc = this.state.tableCards;
        if(!tc.length) return `<div class="panel"><div class="panel-header">Cards in Play</div><div class="panel-body"><div style="font-size:9px;color:var(--text-dim);font-style:italic">No persistent cards on table</div></div></div>`;
        let html = '<div class="table-cards">';
        tc.forEach((card,i) => {
            html += `<div class="table-card"><span>${card.display_name||card.title}</span><button class="discard-btn" onclick="game.discardTableCard(${i})" title="Discard">✕</button></div>`;
        });
        html += '</div>';
        return `<div class="panel"><div class="panel-header">Cards in Play (${tc.length})</div><div class="panel-body">${html}</div></div>`;
    }

    renderCompanionsPanel() {
        let html = '<div class="panel"><div class="panel-header">Characters</div><div class="panel-body"><div class="companions-grid">';
        Object.entries(COMPANIONS).forEach(([cid,c]) => {
            const inF = this.state.fellowship.companions.includes(cid);
            const sep = this.state.separatedCompanions[cid];
            const elim = this.state.eliminatedCompanions.includes(cid);
            let cls = 'companion-card'; if(elim) cls+=' eliminated'; else if(inF) cls+=' in-fellowship'; else if(sep) cls+=' separated';
            const loc = inF ? 'Fellowship' : (sep ? REGIONS[sep]?.name : 'N/A');
            html += `<div class="${cls}"><div class="comp-name">${c.name}</div><div class="comp-info">L${c.level} · ${loc}</div></div>`;
        });
        html += '</div><div style="margin-top:6px;font-family:\'Cinzel\',serif;font-size:9px;color:var(--shadow-color);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Shadow Minions</div><div class="companions-grid">';
        Object.entries(MINIONS).forEach(([mid,m]) => {
            const inPlay = this.state.minionsInPlay[mid];
            const avail = this.state.minionsAvailable.includes(mid);
            const cls = `companion-card ${inPlay?'separated':avail?'':'eliminated'}`;
            const loc = inPlay ? REGIONS[inPlay]?.name : (avail?'Available':'Eliminated');
            html += `<div class="${cls}" style="border-color:rgba(191,74,74,.15)"><div class="comp-name" style="color:var(--shadow-color)">${m.name}</div><div class="comp-info">${loc}</div></div>`;
        });
        return html + '</div></div></div>';
    }

    renderSelectedRegion() {
        const rid = this.state.selectedRegion;
        if(!rid) return `<div class="panel"><div class="panel-header">Region</div><div class="panel-body"><div style="font-size:10px;color:var(--text-dim);font-style:italic">Click a region on the map</div></div></div>`;
        const region = REGIONS[rid]; const rState = this.state.regions[rid];
        if(!region||!rState) return '';
        const nation = region.nation ? NATIONS[region.nation] : null;
        const settlement = region.settlement ? region.settlement.charAt(0).toUpperCase()+region.settlement.slice(1) : 'Wilderness';
        let armyHtml = '';
        const fpT = rState.fp.regular+rState.fp.elite, spT = rState.sp.regular+rState.sp.elite;
        if(fpT>0||rState.fp.leaders>0) {
            armyHtml += '<div style="font-size:9px;color:var(--fp-color);margin-bottom:2px;font-weight:600">Free Peoples</div>';
            if(rState.fp.regular) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--fp-color)">${rState.fp.regular}</span> Regular</div>`;
            if(rState.fp.elite) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--fp-color)">${rState.fp.elite}</span> Elite</div>`;
            if(rState.fp.leaders) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--fp-color)">${rState.fp.leaders}</span> Leaders</div>`;
        }
        if(spT>0||rState.sp.nazgul>0) {
            armyHtml += '<div style="font-size:9px;color:var(--shadow-color);margin-top:3px;margin-bottom:2px;font-weight:600">Shadow</div>';
            if(rState.sp.regular) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--shadow-color)">${rState.sp.regular}</span> Regular</div>`;
            if(rState.sp.elite) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--shadow-color)">${rState.sp.elite}</span> Elite</div>`;
            if(rState.sp.nazgul) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--shadow-color)">${rState.sp.nazgul}</span> Nazgûl</div>`;
        }
        if(!armyHtml) armyHtml = '<div style="font-size:10px;color:var(--text-dim);font-style:italic">No armies present</div>';
        const adj = this.state.getAdjacentRegions(rid).map(a => REGIONS[a]?.name||a).join(', ');
        return `<div class="panel"><div class="panel-header">Region Detail</div><div class="panel-body region-detail">
            <div class="region-name">${region.name}</div>
            <div class="region-meta">${settlement}${nation?' · '+nation.name:''}${region.vp?' · '+region.vp+' VP':''}</div>
            ${armyHtml}
            <div style="margin-top:6px;font-size:8px;color:var(--text-dim)">Adjacent: ${adj}</div>
        </div></div>`;
    }

    renderLogPanel() {
        const entries = this.state.log.slice(0,30).map(e => `<div class="log-entry ${e.type==='fp'?'fp-action':e.type==='shadow'?'shadow-action':'system'}">${e.msg}</div>`).join('');
        return `<div class="panel"><div class="panel-header">Game Log</div><div class="panel-body"><div class="game-log">${entries}</div></div></div>`;
    }

    // ── MAP ──
    renderMap() {
        const mapEl = document.getElementById('game-map');
        if(!mapEl) return;

        // Draw connections SVG
        let svgLines = '';
        ADJACENCIES.forEach(([a,b]) => {
            const ra = REGIONS[a], rb = REGIONS[b];
            if(ra && rb) svgLines += `<line x1="${ra.x}" y1="${ra.y}" x2="${rb.x}" y2="${rb.y}"/>`;
        });
        let mapHTML = `<svg id="map-connections" viewBox="0 0 2688 1792">${svgLines}</svg>`;

        // Draw regions
        const adjacentRegions = this.state.selectedRegion ? this.state.getAdjacentRegions(this.state.selectedRegion) : [];
        Object.entries(REGIONS).forEach(([rid,r]) => {
            const rState = this.state.regions[rid];
            const selected = this.state.selectedRegion===rid ? ' selected' : '';
            const adjacent = adjacentRegions.includes(rid) ? ' adjacent' : '';
            const nationCls = r.nation ? ` ${r.nation}-r` : '';
            const settlementCls = r.settlement ? ` ${r.settlement}` : '';

            let pips = '';
            if(rState) {
                const {fp,sp} = rState; let pipHtml = '';
                for(let i=0;i<Math.min(fp.regular,5);i++) pipHtml += '<div class="army-pip fp-r"></div>';
                for(let i=0;i<Math.min(fp.elite,3);i++) pipHtml += '<div class="army-pip fp-e"></div>';
                for(let i=0;i<Math.min(fp.leaders,2);i++) pipHtml += '<div class="army-pip leader"></div>';
                for(let i=0;i<Math.min(sp.regular,5);i++) pipHtml += '<div class="army-pip sp-r"></div>';
                for(let i=0;i<Math.min(sp.elite,3);i++) pipHtml += '<div class="army-pip sp-e"></div>';
                for(let i=0;i<Math.min(sp.nazgul,2);i++) pipHtml += '<div class="army-pip nazgul"></div>';
                if(pipHtml) pips = `<div class="map-armies">${pipHtml}</div>`;
            }

            mapHTML += `<div class="map-region${selected}${adjacent}" style="left:${r.x-8}px;top:${r.y-8}px" onclick="game.selectRegion('${rid}')">
                <div class="region-dot${nationCls}${settlementCls}"></div>
                <div class="region-label">${r.name}</div>
                ${pips}
            </div>`;
        });

        // Fellowship marker
        const fPos = REGIONS[this.state.fellowship.position];
        if(fPos) mapHTML += `<div class="fellowship-marker" style="left:${fPos.x-14}px;top:${fPos.y-36}px" title="The Fellowship">💍</div>`;

        mapEl.innerHTML = mapHTML;
        this.updateMapTransform();
    }

    updateMapTransform() {
        const mapEl = document.getElementById('game-map');
        if(mapEl) mapEl.style.transform = `translate(${this.mapOffsetX}px,${this.mapOffsetY}px) scale(${this.mapZoom})`;
    }

    setupMapControls() {
        const container = document.getElementById('map-container');
        if(!container || container._controlsSetup) return;
        container._controlsSetup = true;

        container.addEventListener('wheel', e => {
            e.preventDefault();
            this.mapZoom = Math.max(0.25, Math.min(1.5, this.mapZoom + (e.deltaY>0?-0.04:0.04)));
            this.updateMapTransform();
        });
        container.addEventListener('mousedown', e => {
            if(e.target.closest('.map-region')||e.target.closest('.fellowship-marker')) return;
            this.isDragging = true;
            this.dragStart = {x:e.clientX-this.mapOffsetX, y:e.clientY-this.mapOffsetY};
        });
        container.addEventListener('mousemove', e => {
            if(!this.isDragging) return;
            this.mapOffsetX = e.clientX - this.dragStart.x;
            this.mapOffsetY = e.clientY - this.dragStart.y;
            this.updateMapTransform();
        });
        container.addEventListener('mouseup', () => this.isDragging=false);
        container.addEventListener('mouseleave', () => this.isDragging=false);
    }
}


// ═══════════════════════════════════════════
// GAME CONTROLLER
// ═══════════════════════════════════════════

class GameController {
    constructor() {
        this.state = new GameState();
        this.renderer = new GameRenderer(this.state);
        this.cardsLoaded = false;
    }

    async init() {
        await this.loadCards();
        this.renderer.renderSetup();
    }

    async loadCards() {
        try {
            const resp = await fetch('data/cards_final.json');
            const data = await resp.json();
            this.state.initCards(data);
            this.cardsLoaded = true;
            console.log(`Loaded ${data.length} event cards`);
        } catch(e) {
            console.warn('Could not load cards, using empty decks:', e);
        }
    }

    chooseSide(side) {
        this.state.playerSide = side;
        this.state.init();
        document.getElementById('setup-screen').classList.add('hidden');
        setTimeout(() => {
            document.getElementById('setup-screen').style.display = 'none';
            this.renderer.renderBoard();
            this.renderer.setupMapControls();
        }, 500);
    }

    selectRegion(rid) {
        this.state.selectedRegion = rid;
        this.renderer.renderRightSidebar();
        this.renderer.renderMap();
    }

    nextPhase() {
        const phases = ['draw_cards','fellowship','hunt_allocation','action_roll','action_resolution','victory_check'];
        const idx = phases.indexOf(this.state.phase);
        if(idx>=0 && idx<phases.length-1) {
            this.state.phase = phases[idx+1];
            this.state.addLog(`Phase: ${this.state.phase.replace(/_/g,' ')}`,'system');
        } else {
            this.state.turn++;
            this.state.phase = 'draw_cards';
            this.state.huntBox = 0;
            this.state.fpDice = []; this.state.spDice = [];
            this.state.fpDiceUsed = []; this.state.spDiceUsed = [];
            this.state.addLog(`Turn ${this.state.turn} begins.`,'system');
        }
        this.state.calculateVP();
        this.renderer.renderBoard();
    }

    rollDice() { this.state.rollDice(); this.renderer.renderBoard(); }

    useDie(side, index) {
        if(side==='fp' && !this.state.fpDiceUsed.includes(index)) {
            this.state.fpDiceUsed.push(index);
            this.state.addLog(`FP used ${DIE_NAMES[this.state.fpDice[index]]} die.`,'fp');
        } else if(side==='shadow' && !this.state.spDiceUsed.includes(index)) {
            this.state.spDiceUsed.push(index);
            this.state.addLog(`Shadow used ${DIE_NAMES[this.state.spDice[index]]} die.`,'shadow');
        }
        this.renderer.renderBoard();
    }

    drawPhaseCards() {
        this.state.drawCards('fp', 1, 1);
        this.state.drawCards('sp', 1, 1);
        this.state.addLog('Both sides draw event cards.','system');
        this.renderer.renderBoard();
    }

    showCardDetail(handIndex) {
        const hand = this.state.playerSide === 'fp' ? this.state.fpHand : this.state.spHand;
        const card = hand[handIndex];
        if(!card) return;
        this.showCardModal(card, handIndex);
    }

    showCardModal(card, handIndex) {
        const modal = document.getElementById('modal-overlay');
        const factionCls = card.faction === 'free_peoples' ? 'fp-card' : 'sp-card';
        const flags = [];
        const ef = card.engine_flags || {};
        if(ef.modifies_combat_roll) flags.push('Combat Roll');
        if(ef.modifies_leader_reroll) flags.push('Leader Re-roll');
        if(ef.affects_hunt) flags.push('Hunt');
        if(ef.recruitment) flags.push('Recruitment');
        if(ef.movement) flags.push('Movement');
        if(ef.political_track) flags.push('Politics');
        if(ef.persistent_effect) flags.push('Persistent');

        const displayName = card.display_name || card.title;
        const canPlay = handIndex !== undefined && handIndex !== null;
        const isPersistent = ef.persistent_effect;

        modal.innerHTML = `<div class="modal" style="max-width:440px">
            <div class="modal-body" style="padding-top:20px">
                <div class="card-detail ${factionCls}">
                    <div class="card-banner">${displayName}</div>
                    <div class="card-rules">${card.rules_text}</div>
                    <div class="card-flags">${flags.map(f=>`<span class="card-flag">${f}</span>`).join('')}</div>
                </div>
            </div>
            <div class="modal-footer">
                ${canPlay ? `<button class="btn btn-gold" onclick="game.playCard(${handIndex})">▶ Play Card</button>` : ''}
                ${canPlay && isPersistent ? `<button class="btn btn-gold" onclick="game.playCardToTable(${handIndex})">📌 Play to Table</button>` : ''}
                <button class="btn btn-gold" onclick="game.closeModal()">Close</button>
            </div>
        </div>`;
        modal.classList.add('active');
        modal.addEventListener('click', e => { if(e.target === modal) this.closeModal(); });
    }

    playCard(handIndex) {
        const hand = this.state.playerSide === 'fp' ? this.state.fpHand : this.state.spHand;
        const card = hand.splice(handIndex, 1)[0];
        if(!card) return;
        this.state.addLog(`${this.state.playerSide==='fp'?'FP':'SP'} played: ${card.display_name||card.title}`, this.state.playerSide==='fp'?'fp':'shadow');
        this.closeModal();
        this.renderer.renderBoard();
    }

    playCardToTable(handIndex) {
        const hand = this.state.playerSide === 'fp' ? this.state.fpHand : this.state.spHand;
        const card = hand.splice(handIndex, 1)[0];
        if(!card) return;
        this.state.tableCards.push(card);
        this.state.addLog(`${card.display_name||card.title} played to table.`, this.state.playerSide==='fp'?'fp':'shadow');
        this.closeModal();
        this.renderer.renderBoard();
    }

    discardTableCard(index) {
        const card = this.state.tableCards.splice(index, 1)[0];
        if(card) this.state.addLog(`${card.display_name||card.title} discarded from table.`,'system');
        this.renderer.renderBoard();
    }

    showCardBrowser() {
        const modal = document.getElementById('modal-overlay');
        const allCards = this.state.allCards;
        if(!allCards.length) { modal.innerHTML = '<div class="modal"><div class="modal-header">Event Cards</div><div class="modal-body"><p style="color:var(--text-dim)">No cards loaded.</p></div><div class="modal-footer"><button class="btn btn-gold" onclick="game.closeModal()">Close</button></div></div>'; modal.classList.add('active'); return; }

        this._browserFilter = this._browserFilter || 'all';
        const filter = this._browserFilter;

        let filtered = allCards;
        if(filter==='fp') filtered = allCards.filter(c=>c.faction==='free_peoples');
        else if(filter==='shadow') filtered = allCards.filter(c=>c.faction==='shadow');
        else if(filter==='combat') filtered = allCards.filter(c=>c.card_type==='combat');
        else if(filter==='character') filtered = allCards.filter(c=>c.card_type==='character_event');
        else if(filter==='strategy') filtered = allCards.filter(c=>c.card_type!=='combat'&&c.card_type!=='character_event');

        // Deduplicate by display_name for browsing
        const seen = new Set();
        const unique = [];
        filtered.forEach(c => {
            const key = (c.display_name||c.title) + c.faction;
            if(!seen.has(key)) { seen.add(key); unique.push(c); }
        });

        const tabs = [
            {id:'all',label:'All'},{id:'fp',label:'Free Peoples'},{id:'shadow',label:'Shadow'},
            {id:'character',label:'Character'},{id:'combat',label:'Combat'},{id:'strategy',label:'Strategy'}
        ];

        let cardsGrid = '<div class="card-browser">';
        unique.forEach(card => {
            const fCls = card.faction==='free_peoples'?'fp-card':'sp-card';
            cardsGrid += `<div class="browser-card ${fCls}" onclick='game.showBrowserCardDetail(${JSON.stringify(card.id)})'>
                <div class="bc-title">${card.display_name||card.title}</div>
                <div class="bc-text">${card.rules_text.substring(0,100)}${card.rules_text.length>100?'...':''}</div>
            </div>`;
        });
        cardsGrid += '</div>';

        modal.innerHTML = `<div class="modal">
            <div class="modal-header">Event Cards (${unique.length} unique)</div>
            <div class="modal-body">
                <div class="filter-tabs">${tabs.map(t=>`<div class="filter-tab${filter===t.id?' active':''}" onclick="game.filterCards('${t.id}')">${t.label}</div>`).join('')}</div>
                ${cardsGrid}
            </div>
            <div class="modal-footer"><button class="btn btn-gold" onclick="game.closeModal()">Close</button></div>
        </div>`;
        modal.classList.add('active');
        modal.addEventListener('click', e => { if(e.target === modal) this.closeModal(); });
    }

    filterCards(filter) {
        this._browserFilter = filter;
        this.showCardBrowser();
    }

    showBrowserCardDetail(cardId) {
        const card = this.state.allCards.find(c => c.id === cardId);
        if(card) this.showCardModal(card, null);
    }

    showLeaderCards() {
        const modal = document.getElementById('modal-overlay');
        const leaders = [
            {name:'Gandalf the Grey',side:'fp',level:3,leadership:1,abilities:'Guide. If Event die plays Event card, draw same type.'},
            {name:'Strider',side:'fp',level:3,leadership:1,abilities:'Guide. First FSP move each turn not added to Hunt Box.'},
            {name:'Aragorn',side:'fp',level:3,leadership:2,abilities:'Heir to Isildur. +1 Action Die. Activates Gondor.'},
            {name:'Gandalf the White',side:'fp',level:3,leadership:1,abilities:'White Rider: cancel Nazgûl Leadership. +1 Action Die.'},
            {name:'Boromir',side:'fp',level:2,leadership:1,abilities:'At Gondor City/Stronghold: Activate Gondor, Politics +1.'},
            {name:'Legolas',side:'fp',level:2,leadership:1,abilities:'At Elf Stronghold: Politics +1 step.'},
            {name:'Gimli',side:'fp',level:2,leadership:1,abilities:'At Erebor: Activate Dwarves, Politics +1.'},
            {name:'Meriadoc',side:'fp',level:1,leadership:1,abilities:'Can activate nations at City/Stronghold.'},
            {name:'Peregrin',side:'fp',level:1,leadership:1,abilities:'If a Hobbit eliminated as Guide, put back in play.'},
            {name:'Witch-king',side:'shadow',level:'∞',leadership:2,abilities:'Sorcerer. +1 Action Die. Nazgûl leader.'},
            {name:'Saruman',side:'shadow',level:0,leadership:1,abilities:'Cannot leave Orthanc. +1 Action Die. Voice of Saruman.'},
            {name:'Mouth of Sauron',side:'shadow',level:3,leadership:2,abilities:'+1 Action Die. May use Muster as Army die.'},
        ];
        modal.innerHTML = `<div class="modal"><div class="modal-header">Leaders of Middle-earth</div><div class="modal-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
            ${leaders.map(l => {
                const bc = l.side==='fp'?'var(--fp-color)':'var(--shadow-color)';
                const bg = l.side==='fp'?'var(--fp-bg)':'var(--shadow-bg)';
                return `<div style="background:${bg};border:1px solid ${bc};border-radius:8px;padding:10px">
                    <div style="font-family:'Cinzel',serif;font-size:12px;font-weight:700;color:${bc};margin-bottom:3px">${l.name}</div>
                    <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">Level: ${l.level} · Leadership: ${l.leadership}</div>
                    <div style="font-size:9px;color:var(--text-dim);line-height:1.4">${l.abilities}</div>
                </div>`;
            }).join('')}
            </div>
        </div><div class="modal-footer"><button class="btn btn-gold" onclick="game.closeModal()">Close</button></div></div>`;
        modal.classList.add('active');
        modal.addEventListener('click', e => { if(e.target === modal) this.closeModal(); });
    }

    closeModal() { document.getElementById('modal-overlay').classList.remove('active'); }
    zoomIn() { this.renderer.mapZoom = Math.min(1.5, this.renderer.mapZoom+0.08); this.renderer.updateMapTransform(); }
    zoomOut() { this.renderer.mapZoom = Math.max(0.25, this.renderer.mapZoom-0.08); this.renderer.updateMapTransform(); }
    resetView() { this.renderer.mapZoom=0.48; this.renderer.mapOffsetX=-100; this.renderer.mapOffsetY=-40; this.renderer.updateMapTransform(); }
}


// ═══════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════

let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new GameController();
    game.init();
});
