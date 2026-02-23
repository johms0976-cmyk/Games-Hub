/* ============================================
   WAR OF THE RING - Digital Edition
   Main Game Engine
   ============================================ */

// ═══════════════════════════════════════════
// GAME DATA - Regions, Nations, Characters
// ═══════════════════════════════════════════

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

// Political track steps: 3=top, 2=second, 1=third (above At War), 0=At War
const POLITICS_LABELS = { 3: 'Not At War', 2: 'Not At War', 1: 'Not At War', 0: 'At War' };

// Map regions with approximate coordinates for display
// x,y are percentage-based on 1800x1200 map canvas
const REGIONS = {
    // ── Free Peoples Strongholds ──
    'rivendell':       { name: 'Rivendell',       x: 560, y: 320, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'grey-havens':     { name: 'Grey Havens',     x: 200, y: 320, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'woodland-realm':  { name: 'Woodland Realm',  x: 900, y: 180, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'lorien':          { name: 'Lórien',          x: 740, y: 430, nation: 'elves',   settlement: 'stronghold', vp: 2 },
    'helms-deep':      { name: "Helm's Deep",     x: 560, y: 600, nation: 'rohan',   settlement: 'stronghold', vp: 2 },
    'minas-tirith':    { name: 'Minas Tirith',    x: 850, y: 680, nation: 'gondor',  settlement: 'stronghold', vp: 2 },
    'dol-amroth':      { name: 'Dol Amroth',      x: 700, y: 780, nation: 'gondor',  settlement: 'city', vp: 1 },
    'erebor':          { name: 'Erebor',           x: 1050, y: 140, nation: 'dwarves', settlement: 'stronghold', vp: 2 },

    // ── Free Peoples Cities/Towns ──
    'edoras':          { name: 'Edoras',           x: 620, y: 650, nation: 'rohan',   settlement: 'city', vp: 1 },
    'dale':            { name: 'Dale',             x: 1020, y: 170, nation: 'north',  settlement: 'city', vp: 1 },
    'pelargir':        { name: 'Pelargir',         x: 780, y: 760, nation: 'gondor',  settlement: 'city', vp: 1 },
    'bree':            { name: 'Bree',             x: 380, y: 340, nation: 'north',   settlement: 'town' },
    'the-shire':       { name: 'The Shire',        x: 260, y: 310, nation: 'north',   settlement: 'town' },
    'north-downs':     { name: 'North Downs',      x: 380, y: 260, nation: 'north',   settlement: 'town' },
    'carrock':         { name: 'Carrock',          x: 760, y: 240, nation: 'north',   settlement: 'town' },
    'ered-luin':       { name: 'Ered Luin',        x: 180, y: 230, nation: 'dwarves', settlement: 'town' },
    'iron-hills':      { name: 'Iron Hills',       x: 1150, y: 160, nation: 'dwarves', settlement: 'town' },

    // ── Fortifications ──
    'osgiliath':       { name: 'Osgiliath',        x: 880, y: 660, nation: 'gondor',  settlement: 'fortification' },
    'fords-of-isen':   { name: 'Fords of Isen',    x: 500, y: 610, nation: 'rohan',  settlement: 'fortification' },

    // ── Shadow Strongholds ──
    'barad-dur':       { name: 'Barad-dûr',        x: 1100, y: 650, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'dol-guldur':      { name: 'Dol Guldur',       x: 880, y: 380, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'minas-morgul':    { name: 'Minas Morgul',     x: 1000, y: 680, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'orthanc':         { name: 'Orthanc',          x: 520, y: 560, nation: 'isengard', settlement: 'stronghold', vp: 2 },
    'mount-gundabad':  { name: 'Mount Gundabad',   x: 720, y: 140, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'morannon':        { name: 'Morannon',         x: 1020, y: 610, nation: 'sauron', settlement: 'stronghold', vp: 2 },
    'umbar':           { name: 'Umbar',            x: 700, y: 920, nation: 'southrons', settlement: 'stronghold', vp: 2 },

    // ── Shadow Cities/Towns ──
    'moria':           { name: 'Moria',            x: 640, y: 400, nation: 'sauron', settlement: 'town' },
    'gorgoroth':       { name: 'Gorgoroth',        x: 1060, y: 700, nation: 'sauron', settlement: 'town' },
    'nurn':            { name: 'Nurn',             x: 1120, y: 760, nation: 'sauron', settlement: 'town' },
    'far-harad':       { name: 'Far Harad',        x: 820, y: 920, nation: 'southrons', settlement: 'town' },
    'near-harad':      { name: 'Near Harad',       x: 920, y: 850, nation: 'southrons', settlement: 'town' },
    'north-rhun':      { name: 'North Rhûn',       x: 1200, y: 300, nation: 'southrons', settlement: 'town' },
    'south-rhun':      { name: 'South Rhûn',       x: 1250, y: 450, nation: 'southrons', settlement: 'town' },
    'north-dunland':   { name: 'North Dunland',    x: 440, y: 500, nation: 'isengard', settlement: 'town' },
    'south-dunland':   { name: 'South Dunland',    x: 460, y: 560, nation: 'isengard', settlement: 'town' },

    // ── Wilderness / Key Locations ──
    'mount-doom':      { name: 'Mount Doom',       x: 1080, y: 680, nation: null, settlement: null, mordor: true },
    'fangorn':         { name: 'Fangorn',          x: 580, y: 520, nation: null, settlement: null },
    'dead-marshes':    { name: 'Dead Marshes',     x: 960, y: 600, nation: null, settlement: null },
    'druadan-forest':  { name: 'Druadan Forest',   x: 760, y: 680, nation: null, settlement: null },
    'westemnet':       { name: 'Westemnet',        x: 560, y: 660, nation: null, settlement: null },
    'eastemnet':       { name: 'Eastemnet',        x: 700, y: 600, nation: null, settlement: null },
    'gap-of-rohan':    { name: 'Gap of Rohan',     x: 500, y: 580, nation: null, settlement: null },
    'cardolan':        { name: 'Cardolan',         x: 360, y: 400, nation: null, settlement: null },
    'enedwaith':       { name: 'Enedwaith',        x: 380, y: 480, nation: null, settlement: null },
    'minhiriath':      { name: 'Minhiriath',       x: 300, y: 460, nation: null, settlement: null },
    'andrast':         { name: 'Andrast',          x: 440, y: 720, nation: null, settlement: null },
    'anfalas':         { name: 'Anfalas',          x: 560, y: 740, nation: null, settlement: null },
    'lamedon':         { name: 'Lamedon',          x: 660, y: 740, nation: null, settlement: null },
    'lebennin':        { name: 'Lebennin',         x: 780, y: 720, nation: null, settlement: null },
    'west-harondor':   { name: 'West Harondor',    x: 820, y: 800, nation: null, settlement: null },
    'east-harondor':   { name: 'East Harondor',    x: 920, y: 780, nation: null, settlement: null },
    'ithilien':        { name: 'Ithilien',         x: 940, y: 700, nation: null, settlement: null },
    'south-ithilien':  { name: 'South Ithilien',   x: 960, y: 740, nation: null, settlement: null },
    'dagorlad':        { name: 'Dagorlad',         x: 1000, y: 560, nation: null, settlement: null },
    'ash-mountains':   { name: 'Ash Mountains',    x: 1140, y: 600, nation: null, settlement: null },
    'southern-mirkwood':{ name: 'S. Mirkwood',     x: 840, y: 320, nation: null, settlement: null },
    'northern-mirkwood':{ name: 'N. Mirkwood',     x: 880, y: 220, nation: null, settlement: null },
    'western-mirkwood': { name: 'W. Mirkwood',     x: 800, y: 280, nation: null, settlement: null },
    'old-forest-road': { name: 'Old Forest Road',  x: 860, y: 260, nation: null, settlement: null },
    'vale-of-anduin':  { name: 'Vale of Anduin',   x: 780, y: 350, nation: null, settlement: null },
    'dimrill-dale':    { name: 'Dimrill Dale',     x: 680, y: 380, nation: null, settlement: null },
    'gladden-fields':  { name: 'Gladden Fields',   x: 740, y: 330, nation: null, settlement: null },
    'parth-celebrant': { name: 'Parth Celebrant',  x: 710, y: 480, nation: null, settlement: null },
    'south-anduin-vale':{ name: 'S. Anduin Vale',  x: 740, y: 540, nation: null, settlement: null },
    'weather-hills':   { name: 'Weather Hills',    x: 440, y: 300, nation: null, settlement: null },
    'angmar':          { name: 'Angmar',           x: 500, y: 180, nation: null, settlement: null },
    'ettenmoors':      { name: 'Ettenmoors',       x: 540, y: 220, nation: null, settlement: null },
    'withered-heath':  { name: 'Withered Heath',   x: 900, y: 100, nation: null, settlement: null },
    'iron-mountains':  { name: 'Iron Mountains',   x: 1100, y: 100, nation: null, settlement: null },
};

// Adjacency connections for the map (simplified - key connections)
const ADJACENCIES = [
    ['the-shire', 'bree'], ['bree', 'cardolan'], ['bree', 'weather-hills'], ['bree', 'north-downs'],
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
    ['osgiliath', 'ithilien'], ['osgiliath', 'dead-marshes'],
    ['pelargir', 'lebennin'], ['pelargir', 'dol-amroth'],
    ['dol-amroth', 'lamedon'], ['dol-amroth', 'anfalas'],
    ['lamedon', 'lebennin'], ['lebennin', 'west-harondor'],
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
    ['angmar', 'ettenmoors'], ['ettenmoors', 'rivendell'],
    ['rivendell', 'weather-hills'], ['rivendell', 'dimrill-dale'],
    ['grey-havens', 'the-shire'], ['grey-havens', 'ered-luin'],
    ['north-downs', 'weather-hills'],
    ['southern-mirkwood', 'dol-guldur'], ['dol-guldur', 'lorien'],
    ['near-harad', 'far-harad'], ['far-harad', 'umbar'],
    ['north-rhun', 'south-rhun'], ['south-rhun', 'ash-mountains'],
    ['andrast', 'anfalas'], ['andrast', 'fords-of-isen'],
    ['fangorn', 'south-anduin-vale'], ['parth-celebrant', 'south-anduin-vale'],
    ['minas-morgul', 'gorgoroth'],
];

// ── Characters ──
const COMPANIONS = {
    gandalf_grey: { name: 'Gandalf the Grey', level: 3, leadership: 1, nation: null, guide: true, canUpgrade: 'gandalf_white' },
    strider:      { name: 'Strider',          level: 3, leadership: 1, nation: null, guide: false, canUpgrade: 'aragorn' },
    legolas:      { name: 'Legolas',           level: 2, leadership: 1, nation: 'elves' },
    gimli:        { name: 'Gimli',             level: 2, leadership: 1, nation: 'dwarves' },
    boromir:      { name: 'Boromir',           level: 2, leadership: 1, nation: 'gondor' },
    merry:        { name: 'Meriadoc',          level: 1, leadership: 1, nation: null },
    pippin:       { name: 'Peregrin',          level: 1, leadership: 1, nation: null },
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

// ── Starting Army Setup ──
const STARTING_ARMIES = {
    // Free Peoples
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
    // Shadow
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

// Reinforcement pools
const REINFORCEMENTS = {
    fp: {
        gondor:  { regular: 6, elite: 4, leaders: 3 },
        rohan:   { regular: 6, elite: 4, leaders: 3 },
        north:   { regular: 6, elite: 4, leaders: 3 },
        dwarves: { regular: 2, elite: 4, leaders: 3 },
        elves:   { regular: 2, elite: 4, leaders: 0 },
    },
    sp: {
        sauron:    { regular: 8, elite: 4, nazgul: 4 },
        isengard:  { regular: 6, elite: 5 },
        southrons: { regular: 10, elite: 3 },
    }
};

// Action die faces
const FP_DIE_FACES = ['character', 'character', 'army', 'muster', 'muster_army', 'will_of_west'];
const SP_DIE_FACES = ['character', 'character', 'army', 'army', 'muster', 'eye'];

const DIE_ICONS = {
    character: '⚔️', army: '🏴', muster: '⚒️', muster_army: '🏴⚒️',
    will_of_west: '🌟', eye: '👁️', event: '📜'
};

const DIE_NAMES = {
    character: 'Character', army: 'Army', muster: 'Muster', muster_army: 'Army/Muster',
    will_of_west: 'Will of the West', eye: 'Eye of Sauron', event: 'Event'
};

// ═══════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════

class GameState {
    constructor() {
        this.turn = 0;
        this.phase = 'setup'; // setup, draw_cards, fellowship, hunt_allocation, action_roll, action_resolution, victory_check
        this.playerSide = null; // 'fp' or 'shadow'
        this.currentPlayer = 'fp'; // who acts next

        // Political track: nation -> step (3=top, 2, 1, 0=at war)
        this.politics = {};

        // Regions: regionId -> { fp: {regular,elite,leaders,characters:[]}, sp: {regular,elite,nazgul,characters:[]}, control: 'fp'|'sp'|null }
        this.regions = {};

        // Fellowship
        this.fellowship = {
            position: 'rivendell',
            progress: 0,       // steps on fellowship track (0-12)
            corruption: 0,     // corruption counter (0-12)
            hidden: true,
            guide: 'gandalf_grey',
            companions: ['gandalf_grey', 'strider', 'legolas', 'gimli', 'boromir', 'merry', 'pippin'],
            inMordor: false,
        };

        // Separated companions: companionId -> regionId
        this.separatedCompanions = {};
        this.eliminatedCompanions = [];

        // Minions
        this.minionsInPlay = {}; // minionId -> regionId
        this.minionsAvailable = ['witch_king', 'saruman', 'mouth'];

        // Action dice
        this.fpDice = [];
        this.spDice = [];
        this.fpDiceUsed = [];
        this.spDiceUsed = [];
        this.huntBox = 0; // dice allocated to hunt

        // Cards (simplified)
        this.fpHand = [];
        this.spHand = [];

        // VPs
        this.fpVP = 0;
        this.spVP = 0;

        // Elven rings
        this.elvenRings = { fp: 3, sp: 0 };

        // Hunt tiles pool
        this.huntPool = this.initHuntPool();

        // Reinforcements remaining
        this.reinforcements = JSON.parse(JSON.stringify(REINFORCEMENTS));

        // Game log
        this.log = [];

        // Selected region
        this.selectedRegion = null;
    }

    initHuntPool() {
        // Standard hunt tiles: mix of damage values and special effects
        const tiles = [];
        for (let i = 0; i < 4; i++) tiles.push({ damage: 0, reveal: false, type: 'standard' });
        for (let i = 0; i < 4; i++) tiles.push({ damage: 1, reveal: false, type: 'standard' });
        for (let i = 0; i < 3; i++) tiles.push({ damage: 1, reveal: true, type: 'standard' });
        for (let i = 0; i < 2; i++) tiles.push({ damage: 2, reveal: false, type: 'standard' });
        for (let i = 0; i < 2; i++) tiles.push({ damage: 2, reveal: true, type: 'standard' });
        tiles.push({ damage: 3, reveal: true, type: 'standard' });
        return this.shuffle(tiles);
    }

    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    init() {
        // Initialize politics
        Object.entries(NATIONS).forEach(([id, n]) => {
            this.politics[id] = { step: n.startPolitics, active: n.startActive };
        });

        // Initialize regions
        Object.keys(REGIONS).forEach(rid => {
            this.regions[rid] = {
                fp: { regular: 0, elite: 0, leaders: 0, characters: [] },
                sp: { regular: 0, elite: 0, nazgul: 0, characters: [] },
                control: null,
            };
            const r = REGIONS[rid];
            if (r.nation) {
                this.regions[rid].control = NATIONS[r.nation].side;
            }
        });

        // Place starting armies
        Object.entries(STARTING_ARMIES).forEach(([rid, armies]) => {
            if (armies.fp) {
                this.regions[rid].fp.regular = armies.fp.regular || 0;
                this.regions[rid].fp.elite = armies.fp.elite || 0;
                this.regions[rid].fp.leaders = armies.fp.leaders || 0;
            }
            if (armies.sp) {
                this.regions[rid].sp.regular = armies.sp.regular || 0;
                this.regions[rid].sp.elite = armies.sp.elite || 0;
                this.regions[rid].sp.nazgul = armies.sp.nazgul || 0;
            }
        });

        this.turn = 1;
        this.phase = 'draw_cards';
        this.addLog('The War of the Ring begins. Turn 1.', 'system');
    }

    addLog(msg, type = 'system') {
        this.log.unshift({ msg, type, turn: this.turn });
        if (this.log.length > 100) this.log.pop();
    }

    // Calculate VP for each side
    calculateVP() {
        let fpVP = 0, spVP = 0;
        Object.entries(this.regions).forEach(([rid, state]) => {
            const region = REGIONS[rid];
            if (!region.vp) return;
            const originalSide = region.nation ? NATIONS[region.nation].side : null;
            // Shadow captures FP settlements
            if (originalSide === 'fp' && state.control === 'sp') {
                spVP += region.vp;
            }
            // FP captures Shadow settlements
            if (originalSide === 'shadow' && state.control === 'fp') {
                fpVP += region.vp;
            }
        });
        this.fpVP = fpVP;
        this.spVP = spVP;
    }

    // Get FP dice pool size
    getFPDicePool() {
        let count = 4;
        if (this.separatedCompanions.aragorn || this.separatedCompanions.strider_upgraded) count++;
        if (this.separatedCompanions.gandalf_white) count++;
        return Math.min(count, 6);
    }

    // Get SP dice pool size
    getSPDicePool() {
        let count = 7;
        Object.keys(this.minionsInPlay).forEach(mid => { count++; });
        return Math.min(count, 10);
    }

    // Roll action dice
    rollDice() {
        const fpPool = this.getFPDicePool();
        const spPool = this.getSPDicePool() - this.huntBox;

        this.fpDice = [];
        for (let i = 0; i < fpPool; i++) {
            this.fpDice.push(FP_DIE_FACES[Math.floor(Math.random() * 6)]);
        }

        this.spDice = [];
        let eyeCount = 0;
        for (let i = 0; i < spPool; i++) {
            const face = SP_DIE_FACES[Math.floor(Math.random() * 6)];
            if (face === 'eye') {
                eyeCount++;
            } else {
                this.spDice.push(face);
            }
        }
        // Eyes go to hunt box
        this.huntBox += eyeCount;

        this.fpDiceUsed = [];
        this.spDiceUsed = [];

        this.addLog(`Dice rolled. FP: ${fpPool} dice. Shadow: ${spPool} dice (+${eyeCount} eyes to hunt).`, 'system');
    }

    isNationAtWar(nationId) {
        return this.politics[nationId]?.step === 0;
    }

    getRegionArmyTotal(rid, side) {
        const a = this.regions[rid]?.[side];
        if (!a) return 0;
        if (side === 'fp') return a.regular + a.elite;
        return a.regular + a.elite;
    }

    getAdjacentRegions(rid) {
        const adj = [];
        ADJACENCIES.forEach(([a, b]) => {
            if (a === rid) adj.push(b);
            if (b === rid) adj.push(a);
        });
        return adj;
    }
}


// ═══════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════

class GameRenderer {
    constructor(state) {
        this.state = state;
        this.mapZoom = 0.65;
        this.mapOffsetX = -200;
        this.mapOffsetY = -50;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
    }

    // ── Setup Screen ──
    renderSetup() {
        const el = document.getElementById('setup-screen');
        if (!el) return;
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
            <div style="color: var(--text-dim); font-size: 12px; font-style: italic;">
                AI opponent will play the other side
            </div>
        `;
    }

    // ── Full Game Board ──
    renderBoard() {
        this.renderHeader();
        this.renderLeftSidebar();
        this.renderMap();
        this.renderRightSidebar();
    }

    renderHeader() {
        const el = document.getElementById('header');
        const phaseNames = {
            setup: 'Setup', draw_cards: 'Draw Cards', fellowship: 'Fellowship Phase',
            hunt_allocation: 'Hunt Allocation', action_roll: 'Action Roll',
            action_resolution: 'Action Resolution', victory_check: 'Victory Check'
        };
        el.innerHTML = `
            <div class="logo">War of the Ring</div>
            <div class="turn-info">
                <span>Turn ${this.state.turn}</span>
                <span class="phase-badge">${phaseNames[this.state.phase] || this.state.phase}</span>
                <span>Playing: ${this.state.playerSide === 'fp' ? 'Free Peoples' : 'Shadow'}</span>
            </div>
            <div class="controls">
                <button class="btn btn-gold btn-sm" onclick="game.nextPhase()">Next Phase</button>
                <button class="btn btn-gold btn-sm" onclick="game.showLeaderCards()">Leaders</button>
            </div>
        `;
    }

    renderLeftSidebar() {
        const el = document.getElementById('left-sidebar');
        el.innerHTML = `
            ${this.renderVPPanel()}
            ${this.renderPoliticalTrack()}
            ${this.renderFellowshipTrack()}
            ${this.renderHuntBox()}
            ${this.renderDicePanel()}
        `;
    }

    renderRightSidebar() {
        const el = document.getElementById('right-sidebar');
        el.innerHTML = `
            ${this.renderCompanionsPanel()}
            ${this.renderSelectedRegion()}
            ${this.renderLogPanel()}
        `;
    }

    // ── VP Panel ──
    renderVPPanel() {
        return `
        <div class="panel">
            <div class="panel-header">Victory Points</div>
            <div class="panel-body">
                <div class="vp-display">
                    <div class="vp-side fp">
                        <div class="vp-number">${this.state.fpVP}</div>
                        <div class="vp-label">Free Peoples</div>
                    </div>
                    <div class="vp-divider"></div>
                    <div class="vp-side shadow">
                        <div class="vp-number">${this.state.spVP}</div>
                        <div class="vp-label">Shadow</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── Political Track ──
    renderPoliticalTrack() {
        const steps = [
            { label: 'Not at War (3)', step: 3 },
            { label: 'Not at War (2)', step: 2 },
            { label: 'Not at War (1)', step: 1 },
            { label: 'At War', step: 0 },
        ];

        let html = '<div class="panel"><div class="panel-header">Political Track</div><div class="panel-body"><div class="political-track">';
        steps.forEach(s => {
            const nations = Object.entries(this.state.politics)
                .filter(([_, p]) => p.step === s.step)
                .map(([nid, p]) => {
                    const statusClass = p.active ? 'active' : 'passive';
                    return `<span class="nation-token ${nid}"><span class="status-dot ${statusClass}"></span>${NATIONS[nid].name}</span>`;
                }).join('');
            const cls = s.step === 0 ? 'political-step at-war' : 'political-step';
            html += `<div class="${cls}"><span class="step-label">${s.step === 0 ? '⚔️ War' : s.step}</span><div class="nations-in-step">${nations}</div></div>`;
        });
        html += '</div></div></div>';
        return html;
    }

    // ── Fellowship Track ──
    renderFellowshipTrack() {
        const f = this.state.fellowship;
        let progressSteps = '';
        for (let i = 0; i <= 12; i++) {
            const cls = i === f.progress ? 'track-step active' : (i >= 9 ? 'track-step mordor-step' : 'track-step');
            progressSteps += `<div class="${cls}">${i}</div>`;
        }
        let corruptionSteps = '';
        for (let i = 0; i <= 12; i++) {
            const cls = i === f.corruption ? 'track-step corruption' : 'track-step';
            corruptionSteps += `<div class="${cls}">${i}</div>`;
        }

        return `
        <div class="panel">
            <div class="panel-header">
                Fellowship
                <span style="font-size:9px;color:var(--text-dim);font-weight:400;text-transform:none;letter-spacing:0">
                    ${f.hidden ? '🟢 Hidden' : '🔴 Revealed'} · ${f.companions.length} companions
                </span>
            </div>
            <div class="panel-body">
                <div class="track-row"><span class="track-label">Progress</span><div class="track-steps">${progressSteps}</div></div>
                <div class="track-row"><span class="track-label">Corruption</span><div class="track-steps">${corruptionSteps}</div></div>
                <div style="margin-top:6px;font-size:10px;color:var(--text-dim)">
                    Guide: <strong style="color:var(--gold)">${COMPANIONS[f.guide]?.name || 'Gollum'}</strong>
                    · Location: <strong style="color:var(--text-secondary)">${REGIONS[f.position]?.name || f.position}</strong>
                </div>
            </div>
        </div>`;
    }

    // ── Hunt Box ──
    renderHuntBox() {
        let slots = '';
        for (let i = 0; i < Math.max(this.state.huntBox, 3); i++) {
            const filled = i < this.state.huntBox ? 'filled' : '';
            slots += `<div class="hunt-slot ${filled}">${i < this.state.huntBox ? '👁️' : ''}</div>`;
        }
        return `
        <div class="panel">
            <div class="panel-header">Hunt Box <span style="font-size:9px;color:var(--text-dim);font-weight:400">${this.state.huntBox} dice</span></div>
            <div class="panel-body"><div class="hunt-box-display">${slots}</div></div>
        </div>`;
    }

    // ── Action Dice ──
    renderDicePanel() {
        const renderDice = (dice, used, side) => {
            return dice.map((face, i) => {
                const isUsed = used.includes(i);
                const cls = `action-die ${side} ${isUsed ? 'used' : ''}`;
                return `<div class="${cls}" onclick="game.useDie('${side}', ${i})" title="${DIE_NAMES[face]}">${DIE_ICONS[face]}</div>`;
            }).join('');
        };

        return `
        <div class="panel">
            <div class="panel-header">Action Dice</div>
            <div class="panel-body">
                <div style="font-size:10px;color:var(--fp-color);margin-bottom:3px;font-family:'Cinzel',serif;">Free Peoples (${this.state.fpDice.length})</div>
                <div class="dice-area">${renderDice(this.state.fpDice, this.state.fpDiceUsed, 'fp')}</div>
                <div style="font-size:10px;color:var(--shadow-color);margin-top:8px;margin-bottom:3px;font-family:'Cinzel',serif;">Shadow (${this.state.spDice.length})</div>
                <div class="dice-area">${renderDice(this.state.spDice, this.state.spDiceUsed, 'shadow')}</div>
                ${this.state.phase === 'action_roll' ? '<button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="game.rollDice()">Roll Dice</button>' : ''}
            </div>
        </div>`;
    }

    // ── Companions ──
    renderCompanionsPanel() {
        let html = '<div class="panel"><div class="panel-header">Characters</div><div class="panel-body"><div class="companions-grid">';
        
        // All companions
        Object.entries(COMPANIONS).forEach(([cid, c]) => {
            const inFellowship = this.state.fellowship.companions.includes(cid);
            const separated = this.state.separatedCompanions[cid];
            const eliminated = this.state.eliminatedCompanions.includes(cid);
            let cls = 'companion-card';
            if (eliminated) cls += ' eliminated';
            else if (inFellowship) cls += ' in-fellowship';
            else if (separated) cls += ' separated';

            const location = inFellowship ? 'Fellowship' : (separated ? REGIONS[separated]?.name : 'N/A');
            html += `
                <div class="${cls}">
                    <div class="comp-name">${c.name}</div>
                    <div class="comp-info">L${c.level} · ${location}</div>
                </div>`;
        });

        // Minions
        html += '</div><div style="margin-top:8px;font-family:\'Cinzel\',serif;font-size:10px;color:var(--shadow-color);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Shadow Minions</div><div class="companions-grid">';
        
        Object.entries(MINIONS).forEach(([mid, m]) => {
            const inPlay = this.state.minionsInPlay[mid];
            const available = this.state.minionsAvailable.includes(mid);
            const cls = `companion-card ${inPlay ? 'separated' : available ? '' : 'eliminated'}`;
            const location = inPlay ? REGIONS[inPlay]?.name : (available ? 'Available' : 'Eliminated');
            html += `
                <div class="${cls}" style="border-color:rgba(191,74,74,0.15)">
                    <div class="comp-name" style="color:var(--shadow-color)">${m.name}</div>
                    <div class="comp-info">${location}</div>
                </div>`;
        });

        html += '</div></div></div>';
        return html;
    }

    // ── Selected Region Detail ──
    renderSelectedRegion() {
        const rid = this.state.selectedRegion;
        if (!rid) {
            return `<div class="panel"><div class="panel-header">Region</div><div class="panel-body"><div style="font-size:11px;color:var(--text-dim);font-style:italic">Click a region on the map to inspect it</div></div></div>`;
        }

        const region = REGIONS[rid];
        const rState = this.state.regions[rid];
        if (!region || !rState) return '';

        const nation = region.nation ? NATIONS[region.nation] : null;
        const settlement = region.settlement ? region.settlement.charAt(0).toUpperCase() + region.settlement.slice(1) : 'Wilderness';
        const nationStr = nation ? ` · ${nation.name}` : '';
        const vpStr = region.vp ? ` · ${region.vp} VP` : '';

        let armyHtml = '';
        const fpTotal = rState.fp.regular + rState.fp.elite;
        const spTotal = rState.sp.regular + rState.sp.elite;

        if (fpTotal > 0 || rState.fp.leaders > 0) {
            armyHtml += '<div style="font-size:10px;color:var(--fp-color);margin-bottom:2px;font-weight:600">Free Peoples</div>';
            if (rState.fp.regular) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--fp-color)">${rState.fp.regular}</span> Regular</div>`;
            if (rState.fp.elite) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--fp-color)">${rState.fp.elite}</span> Elite</div>`;
            if (rState.fp.leaders) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--fp-color)">${rState.fp.leaders}</span> Leaders</div>`;
        }
        if (spTotal > 0 || rState.sp.nazgul > 0) {
            armyHtml += '<div style="font-size:10px;color:var(--shadow-color);margin-top:4px;margin-bottom:2px;font-weight:600">Shadow</div>';
            if (rState.sp.regular) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--shadow-color)">${rState.sp.regular}</span> Regular</div>`;
            if (rState.sp.elite) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--shadow-color)">${rState.sp.elite}</span> Elite</div>`;
            if (rState.sp.nazgul) armyHtml += `<div class="army-unit-row"><span class="unit-count" style="color:var(--shadow-color)">${rState.sp.nazgul}</span> Nazgûl</div>`;
        }

        if (!armyHtml) armyHtml = '<div style="font-size:11px;color:var(--text-dim);font-style:italic">No armies present</div>';

        const adjacent = this.state.getAdjacentRegions(rid).map(a => REGIONS[a]?.name || a).join(', ');

        return `
        <div class="panel">
            <div class="panel-header">Region Detail</div>
            <div class="panel-body region-detail">
                <div class="region-name">${region.name}</div>
                <div class="region-meta">${settlement}${nationStr}${vpStr}</div>
                ${armyHtml}
                <div style="margin-top:8px;font-size:9px;color:var(--text-dim)">
                    Adjacent: ${adjacent}
                </div>
            </div>
        </div>`;
    }

    // ── Game Log ──
    renderLogPanel() {
        const entries = this.state.log.slice(0, 30).map(e => 
            `<div class="log-entry ${e.type === 'fp' ? 'fp-action' : e.type === 'shadow' ? 'shadow-action' : 'system'}">${e.msg}</div>`
        ).join('');
        return `
        <div class="panel">
            <div class="panel-header">Game Log</div>
            <div class="panel-body"><div class="game-log">${entries}</div></div>
        </div>`;
    }

    // ── MAP ──
    renderMap() {
        const container = document.getElementById('map-container');
        const mapEl = document.getElementById('game-map');
        if (!mapEl) return;

        // Draw connections SVG
        let svgLines = '';
        ADJACENCIES.forEach(([a, b]) => {
            const ra = REGIONS[a], rb = REGIONS[b];
            if (ra && rb) {
                svgLines += `<line x1="${ra.x}" y1="${ra.y}" x2="${rb.x}" y2="${rb.y}"/>`;
            }
        });

        let mapHTML = `<svg id="map-connections" viewBox="0 0 1800 1200">${svgLines}</svg>`;

        // Draw regions
        Object.entries(REGIONS).forEach(([rid, r]) => {
            const rState = this.state.regions[rid];
            const selected = this.state.selectedRegion === rid ? ' selected' : '';
            const nationCls = r.nation ? ` ${r.nation}-r` : '';
            const settlementCls = r.settlement ? ` ${r.settlement}` : '';

            // Army pips
            let pips = '';
            if (rState) {
                const fp = rState.fp;
                const sp = rState.sp;
                let pipHtml = '';
                for (let i = 0; i < Math.min(fp.regular, 5); i++) pipHtml += '<div class="army-pip fp-r"></div>';
                for (let i = 0; i < Math.min(fp.elite, 3); i++) pipHtml += '<div class="army-pip fp-e"></div>';
                for (let i = 0; i < Math.min(fp.leaders, 2); i++) pipHtml += '<div class="army-pip leader"></div>';
                for (let i = 0; i < Math.min(sp.regular, 5); i++) pipHtml += '<div class="army-pip sp-r"></div>';
                for (let i = 0; i < Math.min(sp.elite, 3); i++) pipHtml += '<div class="army-pip sp-e"></div>';
                for (let i = 0; i < Math.min(sp.nazgul, 2); i++) pipHtml += '<div class="army-pip nazgul"></div>';
                if (pipHtml) pips = `<div class="map-armies">${pipHtml}</div>`;
            }

            mapHTML += `
                <div class="map-region${selected}" style="left:${r.x - 12}px;top:${r.y - 12}px" onclick="game.selectRegion('${rid}')">
                    <div class="region-dot${nationCls}${settlementCls}"></div>
                    <div class="region-label">${r.name}</div>
                    ${pips}
                </div>`;
        });

        // Fellowship marker
        const fPos = REGIONS[this.state.fellowship.position];
        if (fPos) {
            mapHTML += `
                <div class="fellowship-marker" style="left:${fPos.x - 14}px;top:${fPos.y - 36}px" title="The Fellowship">
                    💍
                </div>`;
        }

        mapEl.innerHTML = mapHTML;
        this.updateMapTransform();
    }

    updateMapTransform() {
        const mapEl = document.getElementById('game-map');
        if (mapEl) {
            mapEl.style.transform = `translate(${this.mapOffsetX}px, ${this.mapOffsetY}px) scale(${this.mapZoom})`;
        }
    }

    setupMapControls() {
        const container = document.getElementById('map-container');
        if (!container) return;

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            this.mapZoom = Math.max(0.3, Math.min(1.5, this.mapZoom + delta));
            this.updateMapTransform();
        });

        container.addEventListener('mousedown', (e) => {
            if (e.target.closest('.map-region') || e.target.closest('.fellowship-marker')) return;
            this.isDragging = true;
            this.dragStart = { x: e.clientX - this.mapOffsetX, y: e.clientY - this.mapOffsetY };
        });

        container.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.mapOffsetX = e.clientX - this.dragStart.x;
            this.mapOffsetY = e.clientY - this.dragStart.y;
            this.updateMapTransform();
        });

        container.addEventListener('mouseup', () => { this.isDragging = false; });
        container.addEventListener('mouseleave', () => { this.isDragging = false; });
    }
}


// ═══════════════════════════════════════════
// GAME CONTROLLER
// ═══════════════════════════════════════════

class GameController {
    constructor() {
        this.state = new GameState();
        this.renderer = new GameRenderer(this.state);
    }

    init() {
        this.renderer.renderSetup();
    }

    chooseSide(side) {
        this.state.playerSide = side;
        this.state.init();

        // Hide setup screen
        document.getElementById('setup-screen').classList.add('hidden');
        setTimeout(() => {
            document.getElementById('setup-screen').style.display = 'none';
            this.renderer.renderBoard();
            this.renderer.setupMapControls();
        }, 500);
    }

    selectRegion(rid) {
        this.state.selectedRegion = rid;
        // Re-render right sidebar and map highlights
        this.renderer.renderRightSidebar();
        this.renderer.renderMap();
    }

    nextPhase() {
        const phases = ['draw_cards', 'fellowship', 'hunt_allocation', 'action_roll', 'action_resolution', 'victory_check'];
        const idx = phases.indexOf(this.state.phase);
        if (idx >= 0 && idx < phases.length - 1) {
            this.state.phase = phases[idx + 1];
            this.state.addLog(`Phase: ${this.state.phase.replace(/_/g, ' ')}`, 'system');
        } else {
            // New turn
            this.state.turn++;
            this.state.phase = 'draw_cards';
            this.state.huntBox = 0;
            this.state.fpDice = [];
            this.state.spDice = [];
            this.state.fpDiceUsed = [];
            this.state.spDiceUsed = [];
            this.state.addLog(`Turn ${this.state.turn} begins.`, 'system');
        }
        this.state.calculateVP();
        this.renderer.renderBoard();
        this.renderer.setupMapControls();
    }

    rollDice() {
        this.state.rollDice();
        this.renderer.renderBoard();
        this.renderer.setupMapControls();
    }

    useDie(side, index) {
        if (side === 'fp' && !this.state.fpDiceUsed.includes(index)) {
            this.state.fpDiceUsed.push(index);
            const face = this.state.fpDice[index];
            this.state.addLog(`FP used ${DIE_NAMES[face]} die.`, 'fp');
        } else if (side === 'shadow' && !this.state.spDiceUsed.includes(index)) {
            this.state.spDiceUsed.push(index);
            const face = this.state.spDice[index];
            this.state.addLog(`Shadow used ${DIE_NAMES[face]} die.`, 'shadow');
        }
        this.renderer.renderBoard();
        this.renderer.setupMapControls();
    }

    showLeaderCards() {
        // Show modal with leader card gallery
        let modal = document.getElementById('modal-overlay');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-overlay';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">Leaders of Middle-earth</div>
                <div class="modal-body">
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
                        ${this.renderLeaderList()}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-gold" onclick="game.closeModal()">Close</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(); });
    }

    renderLeaderList() {
        const leaders = [
            // FP Companions
            { name: 'Gandalf the Grey', side: 'fp', level: 3, leadership: 1, abilities: 'Guide. If Event die plays Event card, draw same type.' },
            { name: 'Strider', side: 'fp', level: 3, leadership: 1, abilities: 'Guide. Cannot activate Gondor. First FSP move each turn not added to Hunt Box.' },
            { name: 'Aragorn', side: 'fp', level: 3, leadership: 2, abilities: 'Heir to Isildur. +1 Action Die. Activates Gondor.' },
            { name: 'Gandalf the White', side: 'fp', level: 3, leadership: 1, abilities: 'White Rider: cancel Nazgûl Leadership. +1 Action Die.' },
            { name: 'Boromir', side: 'fp', level: 2, leadership: 1, abilities: 'At Gondor City/Stronghold: Activate Gondor, Politics +1.' },
            { name: 'Legolas', side: 'fp', level: 2, leadership: 1, abilities: 'At Elf Stronghold: Politics +1 step.' },
            { name: 'Gimli', side: 'fp', level: 2, leadership: 1, abilities: 'At Erebor: Activate Dwarves, Politics +1.' },
            { name: 'Meriadoc', side: 'fp', level: 1, leadership: 1, abilities: 'Can activate nations at City/Stronghold.' },
            { name: 'Peregrin', side: 'fp', level: 1, leadership: 1, abilities: 'If a Hobbit eliminated as Guide, put back in play.' },
            // Shadow Minions
            { name: 'Witch-king (Black Captain)', side: 'shadow', level: '∞', leadership: 2, abilities: 'Sorcerer. +1 Action Die. Nazgûl leader.' },
            { name: 'Saruman', side: 'shadow', level: 0, leadership: 1, abilities: 'Cannot leave Orthanc. +1 Action Die. Voice of Saruman.' },
            { name: 'Mouth of Sauron', side: 'shadow', level: 3, leadership: 2, abilities: '+1 Action Die. May use Muster as Army die.' },
        ];

        return leaders.map(l => {
            const borderColor = l.side === 'fp' ? 'var(--fp-color)' : 'var(--shadow-color)';
            const bgColor = l.side === 'fp' ? 'var(--fp-bg)' : 'var(--shadow-bg)';
            return `
                <div style="background:var(--bg-card);border:1px solid ${borderColor};border-radius:8px;padding:12px;background:${bgColor}">
                    <div style="font-family:'Cinzel',serif;font-size:13px;font-weight:700;color:${borderColor};margin-bottom:4px">${l.name}</div>
                    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">
                        Level: ${l.level} · Leadership: ${l.leadership}
                    </div>
                    <div style="font-size:10px;color:var(--text-dim);line-height:1.4">${l.abilities}</div>
                </div>
            `;
        }).join('');
    }

    closeModal() {
        const modal = document.getElementById('modal-overlay');
        if (modal) modal.classList.remove('active');
    }

    zoomIn() {
        this.renderer.mapZoom = Math.min(1.5, this.renderer.mapZoom + 0.1);
        this.renderer.updateMapTransform();
    }

    zoomOut() {
        this.renderer.mapZoom = Math.max(0.3, this.renderer.mapZoom - 0.1);
        this.renderer.updateMapTransform();
    }

    resetView() {
        this.renderer.mapZoom = 0.65;
        this.renderer.mapOffsetX = -200;
        this.renderer.mapOffsetY = -50;
        this.renderer.updateMapTransform();
    }
}


// ═══════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════

let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new GameController();
    game.init();
});
