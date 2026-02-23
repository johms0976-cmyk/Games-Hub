/* ═══════════════════════════════════════════
   WAR OF THE RING — DIGITAL EDITION
   Main Game Logic
   ═══════════════════════════════════════════ */

// ——— BOARD DIMENSIONS ———
// Stitched board from leftboard.pdf + rightboard.pdf at 200 DPI
// Left: 1925×2742, Right: 1925×2742 → Combined: 3850×2742
const BOARD_W = 3850;
const BOARD_H = 2742;

// =========================================================
//  REGION DATA — pixel coords on the 3850×2742 board
//  Faction: fp = Free Peoples, sp = Shadow, neutral
// =========================================================
const REGIONS = {
    // ——— ERIADOR & THE NORTH ———
    "The Shire":        { x: 690, y: 260, type: "city", nation: "The North", faction: "fp" },
    "Bree":             { x: 808, y: 220, type: "town", nation: "The North", faction: "fp" },
    "North Downs":      { x: 925, y: 195, type: "wilderness", nation: "The North", faction: "fp" },
    "Arnor":            { x: 745, y: 120, type: "wilderness", nation: "The North", faction: "fp" },
    "Weather Hills":    { x: 930, y: 255, type: "wilderness", nation: "The North", faction: "fp" },
    "Evendim":          { x: 740, y: 170, type: "wilderness", nation: "The North", faction: "fp" },
    "Tower Hills":      { x: 575, y: 330, type: "wilderness", nation: "The North", faction: "fp" },
    "South Ered Luin":  { x: 595, y: 445, type: "wilderness", nation: "The North", faction: "fp" },
    "Grey Havens":      { x: 510, y: 340, type: "stronghold", nation: "Elves", faction: "fp" },
    "Forlindon":        { x: 420, y: 230, type: "wilderness", nation: "Elves", faction: "fp" },
    "North Ered Luin":  { x: 550, y: 170, type: "wilderness", nation: "Elves", faction: "fp" },
    "Ered Luin":        { x: 475, y: 270, type: "wilderness", nation: "Elves", faction: "fp" },
    "Rivendell":        { x: 850, y: 310, type: "stronghold", nation: "Elves", faction: "fp" },
    "Trollshaws":       { x: 950, y: 310, type: "wilderness", nation: "Elves", faction: "fp" },
    "Ettenmoors":       { x: 1000, y: 200, type: "wilderness", nation: "The North", faction: "fp" },
    "Angmar":           { x: 1000, y: 100, type: "stronghold", nation: "The North", faction: "sp" },
    "Mount Gram":       { x: 1090, y: 70, type: "wilderness", nation: "The North", faction: "sp" },
    "Mount Gundabad":   { x: 1210, y: 65, type: "stronghold", nation: "The North", faction: "sp" },
    "Carrock":          { x: 985, y: 445, type: "wilderness", nation: "The North", faction: "fp" },
    "Hollin":           { x: 1050, y: 365, type: "wilderness", nation: "neutral", faction: "neutral" },

    // ——— RHOVANION & MIRKWOOD ———
    "Eagles Eyrie":     { x: 1980, y: 140, type: "wilderness", nation: "neutral", faction: "fp" },
    "Carrock":          { x: 985, y: 445, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Old Forest Road":  { x: 2135, y: 275, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Narrows of the Forest": { x: 2050, y: 340, type: "wilderness", nation: "neutral", faction: "neutral" },
    "North Anduin Vale": { x: 2000, y: 310, type: "wilderness", nation: "neutral", faction: "neutral" },
    "South Anduin Vale": { x: 2000, y: 410, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Western Mirkwood": { x: 2065, y: 200, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Northern Mirkwood":{ x: 2100, y: 130, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Southern Mirkwood":{ x: 2160, y: 410, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Withered Heath":   { x: 2235, y: 100, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Woodland Realm":   { x: 2195, y: 195, type: "stronghold", nation: "Elves", faction: "fp" },
    "Dale":             { x: 2320, y: 120, type: "city", nation: "The North", faction: "fp" },
    "Erebor":           { x: 2335, y: 155, type: "stronghold", nation: "Dwarves", faction: "fp" },
    "Iron Hills":       { x: 2530, y: 120, type: "city", nation: "Dwarves", faction: "fp" },
    "Vale of the Carnen": { x: 2470, y: 210, type: "wilderness", nation: "neutral", faction: "neutral" },
    "North Rhun":       { x: 2600, y: 220, type: "wilderness", nation: "Southrons", faction: "sp" },
    "Northern Dorwinion": { x: 2470, y: 310, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Southern Dorwinion": { x: 2470, y: 440, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Northern Rhovanion": { x: 2365, y: 290, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Southern Rhovanion": { x: 2365, y: 380, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Rhosgobel":        { x: 2065, y: 470, type: "town", nation: "neutral", faction: "neutral" },

    // ——— LORIEN, FANGORN, ROHAN ———
    "Dimrill Dale":     { x: 1945, y: 385, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Lorien":           { x: 1940, y: 440, type: "stronghold", nation: "Elves", faction: "fp" },
    "Parth Celebrant":  { x: 2020, y: 490, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Fangorn":          { x: 1925, y: 570, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Dol Guldur":       { x: 2165, y: 480, type: "stronghold", nation: "Sauron", faction: "sp" },
    "Western Brown Lands": { x: 2120, y: 530, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Eastern Brown Lands": { x: 2250, y: 540, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Noman Lands":      { x: 2310, y: 510, type: "wilderness", nation: "neutral", faction: "neutral" },
    "South Rhun":       { x: 2520, y: 510, type: "town", nation: "Southrons", faction: "sp" },
    "Enedwaith":        { x: 830, y: 635, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Gap of Rohan":     { x: 900, y: 700, type: "wilderness", nation: "Rohan", faction: "fp" },
    "Isengard":         { x: 1100, y: 600, type: "stronghold", nation: "Isengard", faction: "sp" },
    "Orthanc":          { x: 1100, y: 600, type: "stronghold", nation: "Isengard", faction: "sp" },
    "North Dunland":    { x: 1035, y: 530, type: "wilderness", nation: "Isengard", faction: "sp" },
    "South Dunland":    { x: 1060, y: 610, type: "wilderness", nation: "Isengard", faction: "sp" },
    "Helm's Deep":      { x: 1920, y: 640, type: "stronghold", nation: "Rohan", faction: "fp" },
    "Westemnet":        { x: 1960, y: 700, type: "wilderness", nation: "Rohan", faction: "fp" },
    "Edoras":           { x: 2015, y: 740, type: "city", nation: "Rohan", faction: "fp" },
    "Eastemnet":        { x: 2080, y: 680, type: "wilderness", nation: "Rohan", faction: "fp" },
    "Druadan Forest":   { x: 2050, y: 810, type: "wilderness", nation: "Rohan", faction: "fp" },
    "Fords of Isen":    { x: 1930, y: 660, type: "fortification", nation: "Rohan", faction: "fp" },

    // ——— GONDOR ———
    "Minas Tirith":     { x: 2125, y: 820, type: "stronghold", nation: "Gondor", faction: "fp" },
    "Osgiliath":        { x: 2190, y: 815, type: "fortification", nation: "Gondor", faction: "fp" },
    "Pelargir":         { x: 2100, y: 910, type: "city", nation: "Gondor", faction: "fp" },
    "Lamedon":          { x: 2035, y: 860, type: "wilderness", nation: "Gondor", faction: "fp" },
    "Dol Amroth":       { x: 1960, y: 940, type: "stronghold", nation: "Gondor", faction: "fp" },
    "Anfalas":          { x: 1900, y: 870, type: "wilderness", nation: "Gondor", faction: "fp" },
    "Erech":            { x: 1950, y: 790, type: "town", nation: "Gondor", faction: "fp" },
    "Lossarnach":       { x: 2140, y: 870, type: "wilderness", nation: "Gondor", faction: "fp" },
    "South Ithilien":   { x: 2260, y: 885, type: "wilderness", nation: "Gondor", faction: "fp" },
    "North Ithilien":   { x: 2250, y: 810, type: "wilderness", nation: "Gondor", faction: "fp" },
    "East Harondor":    { x: 2250, y: 980, type: "wilderness", nation: "neutral", faction: "neutral" },
    "West Harondor":    { x: 2170, y: 1000, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Umbar":            { x: 1940, y: 1060, type: "stronghold", nation: "Southrons", faction: "sp" },
    "Near Harad":       { x: 2310, y: 1050, type: "wilderness", nation: "Southrons", faction: "sp" },
    "Far Harad":        { x: 2520, y: 990, type: "stronghold", nation: "Southrons", faction: "sp" },
    "Khand":            { x: 2520, y: 930, type: "wilderness", nation: "Southrons", faction: "sp" },

    // ——— MORDOR ———
    "Morannon":         { x: 2310, y: 730, type: "stronghold", nation: "Sauron", faction: "sp" },
    "Minas Morgul":     { x: 2315, y: 800, type: "stronghold", nation: "Sauron", faction: "sp" },
    "Barad-dur":        { x: 2460, y: 720, type: "stronghold", nation: "Sauron", faction: "sp" },
    "Gorgoroth":        { x: 2400, y: 780, type: "wilderness", nation: "Sauron", faction: "sp" },
    "Nurn":             { x: 2470, y: 875, type: "wilderness", nation: "Sauron", faction: "sp" },

    // ——— MISTY MOUNTAINS & MORIA ———
    "Moria":            { x: 1940, y: 350, type: "stronghold", nation: "Sauron", faction: "sp" },
    "Goblin Gate":      { x: 1960, y: 260, type: "town", nation: "Sauron", faction: "sp" },

    // ——— ADDITIONAL ———
    "The Wold":         { x: 1005, y: 480, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Dagorlad":         { x: 2320, y: 650, type: "wilderness", nation: "Sauron", faction: "sp" },
    "Dead Marshes":     { x: 2240, y: 680, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Ash Mountains":    { x: 2530, y: 690, type: "wilderness", nation: "Sauron", faction: "sp" },
    "Druadan Forest":   { x: 2050, y: 810, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Anorien":          { x: 2090, y: 780, type: "wilderness", nation: "Gondor", faction: "fp" },
    "East Emnet":       { x: 2170, y: 650, type: "wilderness", nation: "Rohan", faction: "fp" },
    "Western Kaya Mull": { x: 2200, y: 600, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Eastern Kaya Mull": { x: 2350, y: 590, type: "wilderness", nation: "neutral", faction: "neutral" },
    "Rohan Passage":    { x: 2120, y: 580, type: "wilderness", nation: "neutral", faction: "neutral" },
};

// ——— ADJACENCY MAP ———
const ADJACENCY = {
    "The Shire":       ["Bree","Tower Hills","South Ered Luin"],
    "Bree":            ["The Shire","North Downs","Weather Hills","South Ered Luin"],
    "North Downs":     ["Bree","Arnor","Weather Hills","Ettenmoors"],
    "Arnor":           ["North Downs","Evendim","Ettenmoors"],
    "Weather Hills":   ["Bree","North Downs","Trollshaws","Hollin"],
    "Evendim":         ["Arnor","Tower Hills","North Ered Luin"],
    "Tower Hills":     ["The Shire","Evendim","Grey Havens","South Ered Luin"],
    "Grey Havens":     ["Tower Hills","Forlindon","Ered Luin"],
    "Forlindon":       ["Grey Havens","North Ered Luin"],
    "North Ered Luin": ["Forlindon","Ered Luin","Evendim"],
    "Ered Luin":       ["Grey Havens","North Ered Luin","Forlindon"],
    "South Ered Luin": ["Tower Hills","The Shire","Bree"],
    "Rivendell":       ["Trollshaws","Hollin","Ettenmoors","Carrock"],
    "Trollshaws":      ["Weather Hills","Rivendell","Hollin"],
    "Ettenmoors":      ["North Downs","Arnor","Angmar","Mount Gram","Goblin Gate"],
    "Angmar":          ["Ettenmoors","Mount Gram"],
    "Mount Gram":      ["Angmar","Ettenmoors","Mount Gundabad"],
    "Mount Gundabad":  ["Mount Gram","Goblin Gate","Northern Mirkwood"],
    "Carrock":         ["Rivendell","Goblin Gate","Eagles Eyrie","North Anduin Vale"],
    "Hollin":          ["Weather Hills","Trollshaws","Rivendell","Enedwaith","Moria","North Dunland"],
    "Eagles Eyrie":    ["Carrock","Goblin Gate","Old Forest Road"],
    "Goblin Gate":     ["Carrock","Ettenmoors","Mount Gundabad","Eagles Eyrie"],
    "Moria":           ["Hollin","Dimrill Dale","Lorien","North Anduin Vale"],
    "Dimrill Dale":    ["Moria","Lorien","North Anduin Vale"],
    "Lorien":          ["Dimrill Dale","Parth Celebrant","Fangorn","South Anduin Vale","Moria"],
    "Parth Celebrant": ["Lorien","Fangorn","Rhosgobel","South Anduin Vale"],
    "Fangorn":         ["Lorien","Parth Celebrant","Helm's Deep","Westemnet","Gap of Rohan"],
    "Helm's Deep":     ["Fangorn","Gap of Rohan","Westemnet","Fords of Isen"],
    "Gap of Rohan":    ["Fangorn","Helm's Deep","Enedwaith","Fords of Isen","South Dunland"],
    "Enedwaith":       ["Gap of Rohan","Hollin","South Dunland","North Dunland"],
    "North Dunland":   ["Enedwaith","Hollin","South Dunland"],
    "South Dunland":   ["North Dunland","Gap of Rohan","Enedwaith","Isengard"],
    "Isengard":        ["South Dunland","Fords of Isen","Gap of Rohan"],
    "Fords of Isen":   ["Helm's Deep","Gap of Rohan","Isengard","Westemnet"],
    "Westemnet":       ["Helm's Deep","Fords of Isen","Edoras","Fangorn"],
    "Edoras":          ["Westemnet","Druadan Forest","Erech","Eastemnet"],
    "Eastemnet":       ["Edoras","Druadan Forest","East Emnet"],
    "Druadan Forest":  ["Edoras","Eastemnet","Minas Tirith","Anorien"],
    "Anorien":         ["Druadan Forest","Minas Tirith"],
    "Erech":           ["Edoras","Lamedon","Dol Amroth","Anfalas"],
    "Lamedon":         ["Erech","Dol Amroth","Pelargir","Lossarnach"],
    "Dol Amroth":      ["Erech","Lamedon","Anfalas"],
    "Anfalas":         ["Erech","Dol Amroth"],
    "Minas Tirith":    ["Druadan Forest","Anorien","Osgiliath","Lossarnach","Pelargir"],
    "Osgiliath":       ["Minas Tirith","North Ithilien","South Ithilien","Minas Morgul"],
    "Pelargir":        ["Minas Tirith","Lamedon","Lossarnach","South Ithilien","West Harondor"],
    "Lossarnach":      ["Minas Tirith","Lamedon","Pelargir"],
    "South Ithilien":  ["Osgiliath","Pelargir","North Ithilien","East Harondor"],
    "North Ithilien":  ["Osgiliath","South Ithilien","Minas Morgul","Dead Marshes"],
    "East Harondor":   ["South Ithilien","West Harondor","Near Harad"],
    "West Harondor":   ["Pelargir","East Harondor","Umbar"],
    "Umbar":           ["West Harondor","Near Harad"],
    "Near Harad":      ["East Harondor","Umbar","Khand","Far Harad"],
    "Far Harad":       ["Near Harad","Khand"],
    "Khand":           ["Near Harad","Far Harad","Nurn"],
    "Morannon":        ["Dagorlad","Minas Morgul","Gorgoroth"],
    "Minas Morgul":    ["Osgiliath","North Ithilien","Morannon","Gorgoroth"],
    "Barad-dur":       ["Gorgoroth","Nurn","Ash Mountains"],
    "Gorgoroth":       ["Morannon","Minas Morgul","Barad-dur","Nurn"],
    "Nurn":            ["Gorgoroth","Barad-dur","Khand"],
    "Dagorlad":        ["Morannon","Dead Marshes"],
    "Dead Marshes":    ["Dagorlad","North Ithilien"],
    "Ash Mountains":   ["Barad-dur","South Rhun"],
    "Old Forest Road": ["Eagles Eyrie","Western Mirkwood","Narrows of the Forest","Woodland Realm"],
    "Narrows of the Forest": ["Old Forest Road","Southern Mirkwood","North Anduin Vale"],
    "North Anduin Vale":["Carrock","Dimrill Dale","South Anduin Vale","Moria"],
    "South Anduin Vale":["North Anduin Vale","Lorien","Parth Celebrant","Rhosgobel"],
    "Western Mirkwood": ["Old Forest Road","Northern Mirkwood","Woodland Realm"],
    "Northern Mirkwood":["Western Mirkwood","Withered Heath","Mount Gundabad","Woodland Realm"],
    "Southern Mirkwood":["Narrows of the Forest","Dol Guldur","Rhosgobel"],
    "Withered Heath":  ["Northern Mirkwood","Dale"],
    "Woodland Realm":  ["Western Mirkwood","Northern Mirkwood","Old Forest Road","Dale"],
    "Dale":            ["Woodland Realm","Withered Heath","Erebor","Iron Hills","Vale of the Carnen"],
    "Erebor":          ["Dale","Iron Hills"],
    "Iron Hills":      ["Dale","Erebor","Vale of the Carnen"],
    "Vale of the Carnen":["Dale","Iron Hills","North Rhun","Northern Dorwinion"],
    "North Rhun":      ["Vale of the Carnen","Northern Dorwinion"],
    "Northern Dorwinion":["Vale of the Carnen","North Rhun","Northern Rhovanion","Southern Dorwinion"],
    "Southern Dorwinion":["Northern Dorwinion","Southern Rhovanion"],
    "Northern Rhovanion":["Northern Dorwinion","Southern Rhovanion"],
    "Southern Rhovanion":["Northern Rhovanion","Southern Dorwinion"],
    "Rhosgobel":       ["South Anduin Vale","Parth Celebrant","Southern Mirkwood"],
    "Dol Guldur":      ["Southern Mirkwood","Western Brown Lands","Eastern Brown Lands"],
    "Western Brown Lands":["Dol Guldur","Eastern Brown Lands"],
    "Eastern Brown Lands":["Western Brown Lands","Noman Lands"],
    "Noman Lands":     ["Eastern Brown Lands","Dagorlad","South Rhun"],
    "South Rhun":      ["Noman Lands","Ash Mountains"],
};

// ═══════════════════════════════════════
//  FELLOWSHIP TRACK (Mordor track steps)
// ═══════════════════════════════════════
const FELLOWSHIP_TRACK = [
    "Rivendell", "Hollin", "Moria", "Lorien", "Parth Celebrant",
    "Rhosgobel", "Dead Marshes", "North Ithilien", "Osgiliath",
    "Minas Morgul", "Morannon", "Gorgoroth", "Barad-dur"
];

// ═══════════════════════════════════════
//  ACTION DICE FACES
// ═══════════════════════════════════════
const FP_DICE_FACES = [
    { name: "Character", icon: "⚔️", css: "character" },
    { name: "Army",      icon: "🛡️", css: "army" },
    { name: "Muster",    icon: "🏰", css: "muster" },
    { name: "Event",     icon: "📜", css: "event" },
    { name: "M/A",       icon: "⚔🛡", css: "muster-army" },
    { name: "W.West",    icon: "✨", css: "will-west" },
];
const SP_DICE_FACES = [
    { name: "Character", icon: "⚔️", css: "character" },
    { name: "Army",      icon: "🛡️", css: "army" },
    { name: "Muster",    icon: "🏰", css: "muster" },
    { name: "Event",     icon: "📜", css: "event" },
    { name: "M/A",       icon: "⚔🛡", css: "muster-army" },
    { name: "Eye",       icon: "👁️", css: "eye" },
];

// ═══════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════
const state = {
    turn: 1,
    phase: "Action Phase",
    activePlayer: "fp", // "fp" or "sp"

    // Cards
    allCards: [],
    fpDeck: [], spDeck: [],
    fpHand: [], spHand: [],
    playedCards: [],

    // Dice
    fpDice: [], spDice: [],
    fpDiceCount: 4, spDiceCount: 7,

    // Fellowship
    fellowshipRegion: "Rivendell",
    fellowshipRevealed: true,
    corruption: 0,
    fellowshipTrackPos: 0,

    // Victory points
    fpVP: 0, spVP: 0,

    // Political tracks: 0 = passive, 1-2 = active, 3 = at war
    politics: {
        "Elves": 0, "Dwarves": 0, "The North": 0,
        "Rohan": 0, "Gondor": 0,
        "Isengard": 3, "Sauron": 3, "Southrons": 0
    },

    // Armies: regionName → { fp: {regular, elite, leaders}, sp: {regular, elite, leaders, nazgul} }
    armies: {},

    // Log
    log: [],

    // Board view
    zoom: 1,
    panX: 0, panY: 0,
};

// ═══════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
    await loadCards();
    initArmies();
    renderRegionNodes();
    initBoardPanZoom();
    initPanels();
    initDice();
    initCards();
    initPolitics();
    initModals();
    updateAllUI();
    gameLog("Game initialized. The Fellowship begins at Rivendell.");
    gameLog("Free Peoples: 4 action dice. Shadow: 7 action dice.", "fp");
    centerOnRegion("Rivendell");
});

// ═══════════════════════════════════════
//  CARD LOADING
// ═══════════════════════════════════════
async function loadCards() {
    try {
        const resp = await fetch("assets/cards.json");
        state.allCards = await resp.json();

        // Split into faction decks
        const fpCards = state.allCards.filter(c => c.faction === "free_peoples");
        const spCards = state.allCards.filter(c => c.faction === "shadow");

        state.fpDeck = shuffle([...fpCards]);
        state.spDeck = shuffle([...spCards]);

        gameLog(`Loaded ${state.allCards.length} cards (${fpCards.length} FP, ${spCards.length} Shadow).`);
    } catch (e) {
        console.error("Failed to load cards:", e);
        gameLog("⚠ Failed to load card data.");
    }
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ═══════════════════════════════════════
//  ARMY INITIALIZATION
// ═══════════════════════════════════════
function initArmies() {
    // Set up starting armies per the rules
    const setup = {
        // Free Peoples
        "Rivendell":     { fp: { regular: 2, elite: 1, leaders: 1 }, sp: {} },
        "Grey Havens":   { fp: { regular: 1, elite: 1, leaders: 0 }, sp: {} },
        "The Shire":     { fp: { regular: 1, elite: 0, leaders: 0 }, sp: {} },
        "Dale":          { fp: { regular: 1, elite: 0, leaders: 0 }, sp: {} },
        "Erebor":        { fp: { regular: 2, elite: 1, leaders: 0 }, sp: {} },
        "Woodland Realm":{ fp: { regular: 1, elite: 1, leaders: 1 }, sp: {} },
        "Lorien":        { fp: { regular: 1, elite: 1, leaders: 1 }, sp: {} },
        "Edoras":        { fp: { regular: 1, elite: 1, leaders: 0 }, sp: {} },
        "Helm's Deep":   { fp: { regular: 1, elite: 0, leaders: 0 }, sp: {} },
        "Minas Tirith":  { fp: { regular: 3, elite: 1, leaders: 1 }, sp: {} },
        "Dol Amroth":    { fp: { regular: 2, elite: 0, leaders: 0 }, sp: {} },
        "Pelargir":      { fp: { regular: 1, elite: 0, leaders: 0 }, sp: {} },
        // Shadow
        "Dol Guldur":    { fp: {}, sp: { regular: 5, elite: 1, leaders: 1, nazgul: 1 } },
        "Orthanc":       { fp: {}, sp: { regular: 4, elite: 1, leaders: 1, nazgul: 0 } },
        "Barad-dur":     { fp: {}, sp: { regular: 4, elite: 1, leaders: 1, nazgul: 1 } },
        "Morannon":      { fp: {}, sp: { regular: 5, elite: 0, leaders: 0, nazgul: 0 } },
        "Minas Morgul":  { fp: {}, sp: { regular: 5, elite: 0, leaders: 0, nazgul: 1 } },
        "Gorgoroth":     { fp: {}, sp: { regular: 3, elite: 0, leaders: 0, nazgul: 0 } },
        "Nurn":          { fp: {}, sp: { regular: 2, elite: 0, leaders: 0, nazgul: 0 } },
        "Umbar":         { fp: {}, sp: { regular: 3, elite: 0, leaders: 0, nazgul: 0 } },
        "Far Harad":     { fp: {}, sp: { regular: 3, elite: 0, leaders: 0, nazgul: 0 } },
        "South Rhun":    { fp: {}, sp: { regular: 2, elite: 0, leaders: 0, nazgul: 0 } },
        "North Rhun":    { fp: {}, sp: { regular: 2, elite: 0, leaders: 0, nazgul: 0 } },
    };

    for (const [region, armies] of Object.entries(setup)) {
        state.armies[region] = {
            fp: { regular: 0, elite: 0, leaders: 0, ...armies.fp },
            sp: { regular: 0, elite: 0, leaders: 0, nazgul: 0, ...armies.sp }
        };
    }
}

// ═══════════════════════════════════════
//  BOARD PAN & ZOOM
// ═══════════════════════════════════════
function initBoardPanZoom() {
    const wrapper = document.getElementById("board-wrapper");
    const container = document.getElementById("board-container");
    const img = document.getElementById("board-img");

    // Wait for image to load
    img.onload = () => {
        // Fit board to viewport initially
        const wrapRect = wrapper.getBoundingClientRect();
        const scaleX = wrapRect.width / BOARD_W;
        const scaleY = wrapRect.height / BOARD_H;
        state.zoom = Math.max(scaleX, scaleY);
        state.panX = (wrapRect.width - BOARD_W * state.zoom) / 2;
        state.panY = (wrapRect.height - BOARD_H * state.zoom) / 2;
        updateBoardTransform();
    };

    // Mouse drag
    let dragging = false, lastX, lastY;
    wrapper.addEventListener("mousedown", e => {
        if (e.button !== 0) return;
        dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mousemove", e => {
        if (!dragging) return;
        state.panX += e.clientX - lastX;
        state.panY += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        updateBoardTransform();
    });
    window.addEventListener("mouseup", () => { dragging = false; });

    // Wheel zoom
    wrapper.addEventListener("wheel", e => {
        e.preventDefault();
        const rect = wrapper.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const oldZoom = state.zoom;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        state.zoom = Math.max(0.15, Math.min(3, state.zoom * delta));

        // Zoom towards mouse
        state.panX = mx - (mx - state.panX) * (state.zoom / oldZoom);
        state.panY = my - (my - state.panY) * (state.zoom / oldZoom);
        updateBoardTransform();
    }, { passive: false });

    // Touch support
    let lastTouchDist = 0;
    let lastTouchMid = null;
    wrapper.addEventListener("touchstart", e => {
        if (e.touches.length === 1) {
            dragging = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            dragging = false;
            lastTouchDist = Math.hypot(
                e.touches[1].clientX - e.touches[0].clientX,
                e.touches[1].clientY - e.touches[0].clientY
            );
            lastTouchMid = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
        }
    });
    wrapper.addEventListener("touchmove", e => {
        e.preventDefault();
        if (e.touches.length === 1 && dragging) {
            state.panX += e.touches[0].clientX - lastX;
            state.panY += e.touches[0].clientY - lastY;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            updateBoardTransform();
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[1].clientX - e.touches[0].clientX,
                e.touches[1].clientY - e.touches[0].clientY
            );
            const mid = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
            const rect = wrapper.getBoundingClientRect();
            const mx = mid.x - rect.left;
            const my = mid.y - rect.top;
            const oldZoom = state.zoom;
            state.zoom = Math.max(0.15, Math.min(3, state.zoom * (dist / lastTouchDist)));
            state.panX = mx - (mx - state.panX) * (state.zoom / oldZoom);
            state.panY = my - (my - state.panY) * (state.zoom / oldZoom);

            // Also pan
            if (lastTouchMid) {
                state.panX += mid.x - lastTouchMid.x;
                state.panY += mid.y - lastTouchMid.y;
            }
            lastTouchDist = dist;
            lastTouchMid = mid;
            updateBoardTransform();
        }
    }, { passive: false });
    wrapper.addEventListener("touchend", () => { dragging = false; });
}

function updateBoardTransform() {
    const container = document.getElementById("board-container");
    container.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

function centerOnRegion(regionName) {
    const region = REGIONS[regionName];
    if (!region) return;
    const wrapper = document.getElementById("board-wrapper");
    const rect = wrapper.getBoundingClientRect();
    state.zoom = 0.5;
    state.panX = rect.width / 2 - region.x * state.zoom;
    state.panY = rect.height / 2 - region.y * state.zoom;
    updateBoardTransform();
}

// ═══════════════════════════════════════
//  REGION NODES
// ═══════════════════════════════════════
function renderRegionNodes() {
    const overlay = document.getElementById("region-overlay");
    overlay.innerHTML = "";

    // SVG for adjacency lines
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "adjacency-svg";
    svg.setAttribute("viewBox", `0 0 ${BOARD_W} ${BOARD_H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.width = BOARD_W + "px";
    svg.style.height = BOARD_H + "px";

    // Draw adjacency lines
    const drawn = new Set();
    for (const [from, neighbors] of Object.entries(ADJACENCY)) {
        if (!REGIONS[from]) continue;
        for (const to of neighbors) {
            const key = [from, to].sort().join("|");
            if (drawn.has(key) || !REGIONS[to]) continue;
            drawn.add(key);
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", REGIONS[from].x);
            line.setAttribute("y1", REGIONS[from].y);
            line.setAttribute("x2", REGIONS[to].x);
            line.setAttribute("y2", REGIONS[to].y);
            svg.appendChild(line);
        }
    }
    overlay.appendChild(svg);

    // Create region nodes
    for (const [name, data] of Object.entries(REGIONS)) {
        const node = document.createElement("div");
        node.className = `region-node ${data.type}`;
        node.style.left = data.x + "px";
        node.style.top = data.y + "px";
        node.dataset.region = name;

        // Label
        const label = document.createElement("span");
        label.className = "region-label";
        label.textContent = name;
        node.appendChild(label);

        // Army badges
        updateArmyBadge(node, name);

        node.addEventListener("click", e => {
            e.stopPropagation();
            showRegionModal(name);
        });

        overlay.appendChild(node);
    }

    // Position fellowship marker
    updateFellowshipMarker();
}

function updateArmyBadge(node, regionName) {
    // Remove existing badges
    node.querySelectorAll(".army-badge").forEach(b => b.remove());

    const armies = state.armies[regionName];
    if (!armies) return;

    const fpTotal = (armies.fp.regular || 0) + (armies.fp.elite || 0);
    const spTotal = (armies.sp.regular || 0) + (armies.sp.elite || 0);

    if (fpTotal > 0) {
        const badge = document.createElement("span");
        badge.className = "army-badge fp-army";
        badge.textContent = fpTotal + (armies.fp.leaders ? "+" + armies.fp.leaders + "L" : "");
        node.appendChild(badge);
    }
    if (spTotal > 0) {
        const badge = document.createElement("span");
        badge.className = "army-badge sp-army";
        badge.style.bottom = fpTotal > 0 ? "-20px" : "-10px";
        badge.textContent = spTotal + (armies.sp.nazgul ? "+" + armies.sp.nazgul + "N" : "");
        node.appendChild(badge);
    }
}

function updateFellowshipMarker() {
    const marker = document.getElementById("fellowship-marker");
    const region = REGIONS[state.fellowshipRegion];
    if (region) {
        marker.style.left = region.x + "px";
        marker.style.top = (region.y - 20) + "px";
    }
    document.getElementById("fellowship-pos").textContent =
        `${state.fellowshipRegion} (${state.fellowshipTrackPos})`;
}

// ═══════════════════════════════════════
//  PANELS
// ═══════════════════════════════════════
function initPanels() {
    // Toggle buttons
    document.getElementById("btn-dice").addEventListener("click", () => togglePanel("dice-panel"));
    document.getElementById("btn-cards").addEventListener("click", () => togglePanel("cards-panel"));
    document.getElementById("btn-log").addEventListener("click", () => togglePanel("log-panel"));
    document.getElementById("btn-help").addEventListener("click", () => {
        document.getElementById("help-modal").classList.toggle("hidden");
    });

    // Close buttons
    document.querySelectorAll(".close-panel").forEach(btn => {
        btn.addEventListener("click", () => {
            const panel = document.getElementById(btn.dataset.panel);
            panel.classList.add("hidden");
        });
    });

    // Card tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        });
    });
}

function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle("hidden");
}

// ═══════════════════════════════════════
//  DICE
// ═══════════════════════════════════════
function initDice() {
    document.getElementById("btn-roll-fp").addEventListener("click", () => rollActionDice("fp"));
    document.getElementById("btn-roll-sp").addEventListener("click", () => rollActionDice("sp"));
    document.getElementById("btn-roll-combat").addEventListener("click", rollCombatDice);
}

function rollActionDice(faction) {
    const count = faction === "fp" ? state.fpDiceCount : state.spDiceCount;
    const faces = faction === "fp" ? FP_DICE_FACES : SP_DICE_FACES;
    const results = [];

    for (let i = 0; i < count; i++) {
        results.push(faces[Math.floor(Math.random() * faces.length)]);
    }

    if (faction === "fp") {
        state.fpDice = results;
    } else {
        state.spDice = results;
    }

    renderDiceTray(faction);
    const names = results.map(d => d.name).join(", ");
    gameLog(`${faction === "fp" ? "Free Peoples" : "Shadow"} rolled ${count} dice: ${names}`, faction);
}

function renderDiceTray(faction) {
    const trayId = faction === "fp" ? "fp-dice-tray" : "sp-dice-tray";
    const tray = document.getElementById(trayId);
    const dice = faction === "fp" ? state.fpDice : state.spDice;
    tray.innerHTML = "";

    dice.forEach((die, i) => {
        const el = document.createElement("div");
        el.className = `die ${faction}-die ${die.css} rolling`;
        el.innerHTML = `<div>${die.icon}<br><small>${die.name}</small></div>`;
        el.title = die.name;
        el.addEventListener("click", () => {
            el.classList.toggle("used");
        });
        // Stagger animation
        el.style.animationDelay = (i * 0.08) + "s";
        tray.appendChild(el);
    });
}

function rollCombatDice() {
    const num = parseInt(document.getElementById("combat-dice-num").value) || 5;
    const tray = document.getElementById("combat-dice-tray");
    tray.innerHTML = "";

    let hits = 0;
    for (let i = 0; i < num; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        const isHit = roll >= 5;
        if (isHit) hits++;

        const el = document.createElement("div");
        el.className = `combat-die rolling ${isHit ? "hit" : ""}`;
        el.textContent = roll;
        el.style.animationDelay = (i * 0.06) + "s";
        tray.appendChild(el);
    }

    gameLog(`Combat roll: ${num} dice → ${hits} hits`);
}

// ═══════════════════════════════════════
//  CARDS
// ═══════════════════════════════════════
function initCards() {
    document.getElementById("btn-draw-fp").addEventListener("click", () => drawCard("fp"));
    document.getElementById("btn-draw-sp").addEventListener("click", () => drawCard("sp"));

    // Browser filters
    document.getElementById("filter-faction").addEventListener("change", renderCardBrowser);
    document.getElementById("filter-type").addEventListener("change", renderCardBrowser);
    document.getElementById("filter-search").addEventListener("input", renderCardBrowser);

    updateCardCounts();
    renderCardBrowser();
}

function drawCard(faction) {
    const deck = faction === "fp" ? state.fpDeck : state.spDeck;
    const hand = faction === "fp" ? state.fpHand : state.spHand;

    if (deck.length === 0) {
        gameLog(`${faction === "fp" ? "FP" : "Shadow"} deck is empty!`);
        return;
    }

    const card = deck.pop();
    hand.push(card);
    gameLog(`${faction === "fp" ? "Free Peoples" : "Shadow"} drew: ${card.display_name || card.title}`, faction);
    updateCardCounts();
    renderHand(faction);
}

function renderHand(faction) {
    const containerId = faction === "fp" ? "tab-fp-hand" : "tab-sp-hand";
    const container = document.getElementById(containerId);
    const hand = faction === "fp" ? state.fpHand : state.spHand;
    container.innerHTML = "";

    if (hand.length === 0) {
        container.innerHTML = `<p style="color:var(--text-dim);padding:16px;text-align:center;font-style:italic;">No cards in hand. Draw from the deck.</p>`;
        return;
    }

    hand.forEach((card, idx) => {
        const el = createCardElement(card, faction, idx);
        container.appendChild(el);
    });
}

function createCardElement(card, faction, idx) {
    const el = document.createElement("div");
    el.className = `card-item ${faction === "fp" ? "fp-card" : "sp-card"}`;

    const typeBadge = card.card_type ? card.card_type.replace(/_/g, " ") : "event";
    el.innerHTML = `
        <div class="card-title">${card.display_name || card.title}</div>
        <div class="card-meta">${typeBadge} • ${card.deck_type ? card.deck_type.replace(/_/g, " ") : ""}</div>
        <div class="card-actions">
            <button data-action="view" data-faction="${faction}" data-idx="${idx}">View</button>
            <button data-action="play" data-faction="${faction}" data-idx="${idx}">Play</button>
            <button data-action="discard" data-faction="${faction}" data-idx="${idx}">Discard</button>
        </div>
    `;

    el.querySelector('[data-action="view"]').addEventListener("click", e => {
        e.stopPropagation();
        showCardModal(card);
    });
    el.querySelector('[data-action="play"]').addEventListener("click", e => {
        e.stopPropagation();
        playCard(faction, idx);
    });
    el.querySelector('[data-action="discard"]').addEventListener("click", e => {
        e.stopPropagation();
        discardCard(faction, idx);
    });

    el.addEventListener("click", () => showCardModal(card));
    return el;
}

function playCard(faction, idx) {
    const hand = faction === "fp" ? state.fpHand : state.spHand;
    const card = hand.splice(idx, 1)[0];
    state.playedCards.push({ card, faction, turn: state.turn });
    gameLog(`Played: ${card.display_name || card.title}`, faction);
    renderHand(faction);
    renderPlayedCards();
    updateCardCounts();
}

function discardCard(faction, idx) {
    const hand = faction === "fp" ? state.fpHand : state.spHand;
    const card = hand.splice(idx, 1)[0];
    gameLog(`Discarded: ${card.display_name || card.title}`, faction);
    renderHand(faction);
    updateCardCounts();
}

function renderPlayedCards() {
    const container = document.getElementById("tab-played");
    container.innerHTML = "";

    if (state.playedCards.length === 0) {
        container.innerHTML = `<p style="color:var(--text-dim);padding:16px;text-align:center;font-style:italic;">No cards in play.</p>`;
        return;
    }

    state.playedCards.forEach((entry, idx) => {
        const el = document.createElement("div");
        el.className = `card-item ${entry.faction === "fp" ? "fp-card" : "sp-card"}`;
        el.innerHTML = `
            <div class="card-title">${entry.card.display_name || entry.card.title}</div>
            <div class="card-meta">Played turn ${entry.turn} • ${entry.card.card_type?.replace(/_/g," ") || ""}</div>
        `;
        el.addEventListener("click", () => showCardModal(entry.card));
        container.appendChild(el);
    });
}

function renderCardBrowser() {
    const container = document.getElementById("browser-results");
    const factionFilter = document.getElementById("filter-faction").value;
    const typeFilter = document.getElementById("filter-type").value;
    const search = document.getElementById("filter-search").value.toLowerCase();

    let cards = [...state.allCards];
    if (factionFilter !== "all") cards = cards.filter(c => c.faction === factionFilter);
    if (typeFilter !== "all") cards = cards.filter(c => c.card_type === typeFilter);
    if (search) cards = cards.filter(c =>
        (c.display_name || c.title || "").toLowerCase().includes(search) ||
        (c.rules_text || "").toLowerCase().includes(search)
    );

    container.innerHTML = "";
    cards.slice(0, 50).forEach(card => {
        const el = document.createElement("div");
        el.className = `card-item ${card.faction === "free_peoples" ? "fp-card" : "sp-card"}`;
        el.innerHTML = `
            <div class="card-title">${card.display_name || card.title}</div>
            <div class="card-meta">${card.card_type?.replace(/_/g," ") || ""} • ${card.faction?.replace(/_/g," ") || ""}</div>
        `;
        el.addEventListener("click", () => showCardModal(card));
        container.appendChild(el);
    });

    if (cards.length > 50) {
        container.innerHTML += `<p style="color:var(--text-dim);padding:8px;text-align:center">Showing 50 of ${cards.length} cards</p>`;
    }
}

function updateCardCounts() {
    document.getElementById("fp-deck-count").textContent = state.fpDeck.length;
    document.getElementById("sp-deck-count").textContent = state.spDeck.length;
}

// ═══════════════════════════════════════
//  POLITICS
// ═══════════════════════════════════════
function initPolitics() {
    document.querySelectorAll(".pol-pip").forEach(pip => {
        pip.addEventListener("click", () => {
            const nation = pip.dataset.nation;
            advancePolitics(nation);
        });
    });
    updatePoliticsUI();
}

function advancePolitics(nation) {
    if (state.politics[nation] >= 3) return;
    state.politics[nation]++;
    const level = state.politics[nation];
    const labels = ["Passive", "Active (1)", "Active (2)", "At War"];
    gameLog(`${nation} advanced to: ${labels[level]}`);
    updatePoliticsUI();
}

function updatePoliticsUI() {
    const mapping = {
        "Elves": "pol-elves", "Dwarves": "pol-dwarves", "The North": "pol-north",
        "Rohan": "pol-rohan", "Gondor": "pol-gondor",
        "Isengard": "pol-isengard", "Sauron": "pol-sauron", "Southrons": "pol-southrons"
    };
    for (const [nation, elId] of Object.entries(mapping)) {
        const el = document.getElementById(elId);
        const val = state.politics[nation];
        const abbrev = nation === "The North" ? "N" : nation === "Southrons" ? "So" : nation[0];
        el.textContent = `${abbrev}:${val}`;
        el.classList.toggle("at-war", val >= 3);
    }
}

// ═══════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════
function initModals() {
    document.querySelectorAll(".modal-backdrop, .modal-close").forEach(el => {
        el.addEventListener("click", () => {
            el.closest(".modal").classList.add("hidden");
        });
    });
}

function showCardModal(card) {
    const body = document.getElementById("card-modal-body");
    const factionLabel = card.faction === "free_peoples" ? "Free Peoples" : "Shadow";
    const flags = card.engine_flags || {};
    const activeFlags = Object.entries(flags).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, " "));
    const inactiveFlags = Object.entries(flags).filter(([_, v]) => !v).map(([k]) => k.replace(/_/g, " "));

    body.innerHTML = `
        <h3>${card.display_name || card.title}</h3>
        <div class="cd-meta">${factionLabel} • ${(card.card_type || "").replace(/_/g," ")} • ${(card.deck_type || "").replace(/_/g," ")}
        ${card.combat_strength ? ` • Combat: ${card.combat_strength}` : ""}</div>
        <div class="cd-text">${card.rules_text || "No text."}</div>
        ${card.requirements && card.requirements.length ? `<div class="cd-meta">Requirements: ${card.requirements.join(", ")}</div>` : ""}
        <div class="cd-flags">
            ${activeFlags.map(f => `<span class="cd-flag active">✦ ${f}</span>`).join("")}
            ${inactiveFlags.map(f => `<span class="cd-flag">${f}</span>`).join("")}
        </div>
    `;
    document.getElementById("card-modal").classList.remove("hidden");
}

function showRegionModal(regionName) {
    const data = REGIONS[regionName];
    if (!data) return;

    const body = document.getElementById("region-modal-body");
    const armies = state.armies[regionName] || { fp: { regular: 0, elite: 0, leaders: 0 }, sp: { regular: 0, elite: 0, leaders: 0, nazgul: 0 } };
    const adj = ADJACENCY[regionName] || [];

    const isFellowshipHere = state.fellowshipRegion === regionName;

    body.innerHTML = `
        <h3>${regionName}</h3>
        <div class="rd-meta">${data.type} • ${data.nation || "Neutral"} • ${data.faction === "fp" ? "Free Peoples" : data.faction === "sp" ? "Shadow" : "Neutral"}</div>

        ${isFellowshipHere ? '<div style="color:var(--fp-blue-bright);margin-bottom:8px;">⚪ The Fellowship is here</div>' : ""}

        <div class="rd-section">
            <h4>Free Peoples Forces</h4>
            <div class="army-row">
                Regular: <strong>${armies.fp.regular || 0}</strong>
                <div class="army-controls">
                    <button onclick="modArmy('${regionName}','fp','regular',-1)">−</button>
                    <button onclick="modArmy('${regionName}','fp','regular',1)">+</button>
                </div>
            </div>
            <div class="army-row">
                Elite: <strong>${armies.fp.elite || 0}</strong>
                <div class="army-controls">
                    <button onclick="modArmy('${regionName}','fp','elite',-1)">−</button>
                    <button onclick="modArmy('${regionName}','fp','elite',1)">+</button>
                </div>
            </div>
            <div class="army-row">
                Leaders: <strong>${armies.fp.leaders || 0}</strong>
                <div class="army-controls">
                    <button onclick="modArmy('${regionName}','fp','leaders',-1)">−</button>
                    <button onclick="modArmy('${regionName}','fp','leaders',1)">+</button>
                </div>
            </div>
        </div>

        <div class="rd-section">
            <h4>Shadow Forces</h4>
            <div class="army-row">
                Regular: <strong>${armies.sp.regular || 0}</strong>
                <div class="army-controls">
                    <button onclick="modArmy('${regionName}','sp','regular',-1)">−</button>
                    <button onclick="modArmy('${regionName}','sp','regular',1)">+</button>
                </div>
            </div>
            <div class="army-row">
                Elite: <strong>${armies.sp.elite || 0}</strong>
                <div class="army-controls">
                    <button onclick="modArmy('${regionName}','sp','elite',-1)">−</button>
                    <button onclick="modArmy('${regionName}','sp','elite',1)">+</button>
                </div>
            </div>
            <div class="army-row">
                Leaders: <strong>${armies.sp.leaders || 0}</strong>
                <div class="army-controls">
                    <button onclick="modArmy('${regionName}','sp','leaders',-1)">−</button>
                    <button onclick="modArmy('${regionName}','sp','leaders',1)">+</button>
                </div>
            </div>
            <div class="army-row">
                Nazgûl: <strong>${armies.sp.nazgul || 0}</strong>
                <div class="army-controls">
                    <button onclick="modArmy('${regionName}','sp','nazgul',-1)">−</button>
                    <button onclick="modArmy('${regionName}','sp','nazgul',1)">+</button>
                </div>
            </div>
        </div>

        <div class="rd-section">
            <h4>Adjacent Regions</h4>
            <div class="rd-adj-list">
                ${adj.map(a => `<span class="rd-adj-tag" onclick="showRegionModal('${a}')">${a}</span>`).join("")}
            </div>
        </div>

        <button class="move-fellowship-btn" onclick="moveFellowship('${regionName}')">
            Move Fellowship Here
        </button>
    `;

    document.getElementById("region-modal").classList.remove("hidden");
}

// Global functions for onclick handlers
window.modArmy = function(region, faction, type, delta) {
    if (!state.armies[region]) {
        state.armies[region] = {
            fp: { regular: 0, elite: 0, leaders: 0 },
            sp: { regular: 0, elite: 0, leaders: 0, nazgul: 0 }
        };
    }
    state.armies[region][faction][type] = Math.max(0, (state.armies[region][faction][type] || 0) + delta);
    gameLog(`${region}: ${faction === "fp" ? "FP" : "Shadow"} ${type} → ${state.armies[region][faction][type]}`);
    showRegionModal(region); // Refresh modal
    refreshArmyBadges();
};

window.moveFellowship = function(region) {
    state.fellowshipRegion = region;
    state.fellowshipTrackPos = Math.min(state.fellowshipTrackPos + 1, 12);
    updateFellowshipMarker();
    gameLog(`Fellowship moved to ${region} (track: ${state.fellowshipTrackPos})`, "fp");
    document.getElementById("region-modal").classList.add("hidden");
};

window.showRegionModal = showRegionModal;

function refreshArmyBadges() {
    document.querySelectorAll(".region-node").forEach(node => {
        updateArmyBadge(node, node.dataset.region);
    });
}

// ═══════════════════════════════════════
//  GAME LOG
// ═══════════════════════════════════════
function gameLog(msg, faction = null) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    state.log.push({ time: timeStr, msg, faction });

    const container = document.getElementById("log-entries");
    const entry = document.createElement("div");
    entry.className = `log-entry ${faction === "fp" ? "fp-log" : faction === "sp" ? "sp-log" : ""}`;
    entry.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-msg">${msg}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

// ═══════════════════════════════════════
//  UI UPDATES
// ═══════════════════════════════════════
function updateAllUI() {
    document.getElementById("turn-num").textContent = state.turn;
    document.getElementById("phase-name").textContent = state.phase;

    // Player indicators
    document.getElementById("fp-indicator").classList.toggle("fp-active", state.activePlayer === "fp");
    document.getElementById("sp-indicator").classList.toggle("sp-active", state.activePlayer === "sp");

    // VP
    document.getElementById("fp-vp").textContent = state.fpVP;
    document.getElementById("sp-vp").textContent = state.spVP;

    // Corruption
    const corrPct = (state.corruption / 12) * 100;
    document.getElementById("corruption-fill").style.width = corrPct + "%";
    document.getElementById("corruption-val").textContent = `${state.corruption}/12`;

    // Dice counts
    document.getElementById("fp-dice-count").textContent = state.fpDiceCount;
    document.getElementById("sp-dice-count").textContent = state.spDiceCount;

    updateCardCounts();
    updatePoliticsUI();
    updateFellowshipMarker();
    renderHand("fp");
    renderHand("sp");
    renderPlayedCards();
}
