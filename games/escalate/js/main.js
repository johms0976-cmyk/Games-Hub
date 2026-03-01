// ============================================================
// TRICK ESCALATION ENGINE v4.0 — ALL 8 FEATURES
// ============================================================

// ===== DATA LOADING =====
let SUITS, SUIT_SYMBOLS, SUIT_COLORS, RANK_NAMES, CARD_NAMES_PREFIX, KEYWORDS, BATTLE_SUITS;
let RELIC_POOL, ASCENSION_DATA, ENEMY_DATA;

async function loadGameData() {
  const [cardsData, relicsData, ascensionData, enemiesData] = await Promise.all([
    fetch('data/cards.json').then(r => r.json()),
    fetch('data/relics.json').then(r => r.json()),
    fetch('data/ascension.json').then(r => r.json()),
    fetch('data/enemies.json').then(r => r.json()),
  ]);

  SUITS = cardsData.suits;
  SUIT_SYMBOLS = cardsData.suitSymbols;
  SUIT_COLORS = cardsData.suitColors;
  RANK_NAMES = cardsData.rankNames;
  CARD_NAMES_PREFIX = cardsData.cardNamePrefixes;
  KEYWORDS = cardsData.keywords;
  BATTLE_SUITS = cardsData.battleSuits;
  RELIC_POOL = relicsData;
  ASCENSION_DATA = ascensionData;
  ENEMY_DATA = enemiesData;

  // Build ASCENSION_MODS by mapping JSON data to apply functions
  buildAscensionMods();

  // Initialize UI once data is loaded
  updateMetaDisplay();
}

// ===== FEATURE 5: Fifth Suit (Stars) =====

// ===== FEATURE 4: META-PROGRESSION =====
const META_KEY = 'tee_meta_v1';
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { totalRuns: 0, totalVictories: 0, highestAscension: 0, unlockedAscension: 0, totalDamageAllTime: 0, relicsFound: [], cardsPlayed: 0 };
}
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch(e) {} }
let META = loadMeta();

function updateMetaDisplay() {
  const el = document.getElementById('meta-stats');
  el.innerHTML = `<span>Runs: <span class="meta-val">${META.totalRuns}</span></span>
    <span>Wins: <span class="meta-val">${META.totalVictories}</span></span>
    <span>Best Asc: <span class="meta-val">${META.highestAscension}</span></span>`;

  // Unlock Star Weaver after 3 victories
  const stellarCard = document.getElementById('class-stellar');
  if (META.totalVictories >= 3) {
    stellarCard.classList.remove('locked');
  }

  // Ascension selector
  const ascBar = document.getElementById('ascension-bar');
  const ascSel = document.getElementById('ascension-select');
  if (META.unlockedAscension > 0) {
    ascBar.style.display = 'flex';
    ascSel.innerHTML = '<option value="0">None</option>';
    for (let i = 1; i <= META.unlockedAscension; i++) {
      ascSel.innerHTML += `<option value="${i}">Level ${i}</option>`;
    }
  }
}

// ===== FEATURE 3: ASCENSION SYSTEM (20 levels, data from ascension.json) =====
let ASCENSION_MODS = [];

// Maps applyKey from JSON to actual enemy-modifying functions
const ASCENSION_APPLY_FNS = {
  'enemy_hp_10': (e) => { e.hp = Math.floor(e.hp*1.1); e.maxHp = e.hp; },
  'elite_hp_20': (e) => { if(e.tier==='elite'){e.hp=Math.floor(e.hp*1.2);e.maxHp=e.hp;} },
  'boss_hp_25': (e) => { if(e.tier==='boss'){e.hp=Math.floor(e.hp*1.25);e.maxHp=e.hp;} },
  'enemy_hp_15': (e) => { e.hp=Math.floor(e.hp*1.15);e.maxHp=e.hp; },
  'enemy_armor_5': (e) => { e.armor += 5; },
  'boss_tricks_2': (e) => { if(e.tier==='boss') e.tricksPerRound += 2; },
  'enemy_hp_25': (e) => { e.hp=Math.floor(e.hp*1.25);e.maxHp=e.hp; },
  'final_challenge': (e) => { e.hp=Math.floor(e.hp*1.5);e.maxHp=e.hp; e.armor+=10; },
};

function buildAscensionMods() {
  ASCENSION_MODS = ASCENSION_DATA.map(entry => ({
    level: entry.level,
    desc: entry.desc,
    apply: entry.applyKey ? (ASCENSION_APPLY_FNS[entry.applyKey] || null) : null,
  }));
}

function getAscensionLevel() {
  return parseInt(document.getElementById('ascension-select')?.value || '0');
}

function applyAscensionToEnemy(enemy) {
  const asc = getAscensionLevel();
  for (const mod of ASCENSION_MODS) {
    if (mod.level <= asc && mod.apply) mod.apply(enemy);
  }
  return enemy;
}

// ===== RELIC DEFINITIONS (loaded from data/relics.json) =====

// ===== GAME STATE =====
let G = {};

function initState(playerClass) {
  const asc = getAscensionLevel();
  let startHp = playerClass === 'ember' ? 100 : playerClass === 'stellar' ? 95 : 90;
  // Ascension HP penalties
  if (asc >= 2) startHp -= 10;
  if (asc >= 16) startHp -= 20;

  G = {
    playerClass,
    hp: startHp,
    maxHp: startHp,
    ink: 0,
    embers: 0, // FEATURE 7: Ember currency
    deck: [],
    hand: [],
    burnPile: [],
    modifiers: [],
    relics: [],
    revealedEnemyCards: [],
    act: 1,
    ascension: asc,
    mapNodes: [],
    mapConnections: [], // FEATURE 2: branching connections
    currentNode: -1,
    totalDamage: 0,
    tricksWon: 0,
    tricksLost: 0,
    encountersWon: 0,
    roundScore: 0,
    rowStreaks: { crown: 0, heart: 0, foundation: 0 },
    selectedCard: null,
    selectedRow: null,
    enemy: null,
    roundNum: 0,
    trickNum: 0,
    tricksPerRound: 3,
    enemyCard: null,
    phase: 'idle',
    consecutiveWins: 0,
    shield: 0,
    echoNextTrick: false,
    echoSuit: null,
    resilience: 0,
    enemyRow: null,
    surgeFired: { crown: false, heart: false, foundation: false },
    crownSurgeActive: false,
    trumpSuit: null,
  };

  if (playerClass === 'ember') {
    G.modifiers.push({ name: 'Hearts Spark', suit: 'hearts', type: 'mult', value: 0.1, tier: 'spark', persistent: false });
  } else if (playerClass === 'stellar') {
    G.modifiers.push({ name: 'Star Spark', suit: 'stars', type: 'mult', value: 0.15, tier: 'spark', persistent: false });
  } else {
    G.modifiers.push({ name: 'Clubs Spark', suit: 'clubs', type: 'mult', value: 0.1, tier: 'spark', persistent: false });
  }

  buildStartingDeck();
}

function buildStartingDeck() {
  G.deck = [];
  let bias;
  if (G.playerClass === 'stellar') {
    bias = ['stars','hearts','stars','diamonds','clubs','spades','stars'];
  } else if (G.playerClass === 'ember') {
    bias = ['hearts','diamonds','hearts','diamonds','clubs','spades'];
  } else {
    bias = ['spades','clubs','spades','clubs','hearts','diamonds'];
  }

  for (let i = 0; i < 20; i++) {
    const suit = bias[i % bias.length];
    const rank = 2 + (i % 13);
    G.deck.push(makeCard(suit, Math.min(rank, 14)));
  }
  shuffleArray(G.deck);
}

function makeCard(suit, rank, rarity) {
  rarity = rarity || (Math.random() < 0.6 ? 'common' : Math.random() < 0.8 ? 'uncommon' : 'rare');
  const rarityBonus = { common: 0, uncommon: 2, rare: 4, epic: 8, legendary: 15 };
  const rarityMult = { common: 1.0, uncommon: 1.1, rare: 1.3, epic: 1.5, legendary: 2.0 };
  const prefixes = CARD_NAMES_PREFIX[suit];
  const name = prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + RANK_NAMES[rank];
  let keywords = [];
  if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') {
    keywords.push(KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)]);
  }
  if (rarity === 'legendary' && Math.random() < 0.5) {
    const second = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
    if (!keywords.includes(second)) keywords.push(second);
  }
  return {
    id: Math.random().toString(36).substr(2, 8),
    suit, rank, name, rarity,
    baseChips: rank + (rarityBonus[rarity] || 0),
    baseMult: rarityMult[rarity] || 1.0,
    keywords,
  };
}

function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function hasRelic(id) { return G.relics.some(r => r.id === id); }

// ===== SCREENS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== TITLE =====
document.querySelectorAll('.class-card').forEach(c => {
  c.addEventListener('click', () => {
    if (c.classList.contains('locked')) return;
    document.querySelectorAll('.class-card').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected');
  });
});

// Load all JSON data then initialize UI
loadGameData().catch(err => console.error('Failed to load game data:', err));

function startGame() {
  const cls = document.querySelector('.class-card.selected')?.dataset.class || 'ember';
  initState(cls);
  META.totalRuns++;
  saveMeta(META);
  generateMap();
  showMap();
}

// ============================================================
// FEATURE 2: TRUE BRANCHING MAP
// ============================================================
function generateMap() {
  G.mapNodes = [];
  G.mapConnections = [];

  const nodeTypes = [
    { type: 'encounter', icon: '⚔️', label: 'Encounter', weight: 40 },
    { type: 'elite', icon: '💀', label: 'Elite', weight: 15 },
    { type: 'event', icon: '❓', label: 'Event', weight: 15 },
    { type: 'rest', icon: '🔥', label: 'Rest', weight: 10 },
    { type: 'shop', icon: '🏪', label: 'Shop', weight: 10 },
    { type: 'treasure', icon: '💎', label: 'Treasure', weight: 5 },
    { type: 'shrine', icon: '✨', label: 'Shrine', weight: 5 },
  ];

  function pickType() {
    const roll = Math.random() * 100;
    let cumul = 0;
    for (const nt of nodeTypes) {
      cumul += nt.weight;
      if (roll < cumul) return nt;
    }
    return nodeTypes[0];
  }

  const numRows = 6 + Math.floor(Math.random() * 2);
  let nodeId = 0;

  // Row 0: starting encounter
  const startNode = { id: nodeId++, row: 0, col: 0, type: 'encounter', icon: '⚔️', label: 'Encounter', completed: false, children: [] };
  G.mapNodes.push(startNode);

  let prevRow = [startNode];

  // Middle rows: 2-3 nodes each with branching
  for (let r = 1; r < numRows; r++) {
    const nodesInRow = 2 + Math.floor(Math.random() * 2); // 2-3
    const row = [];
    for (let c = 0; c < nodesInRow; c++) {
      const t = pickType();
      const node = { id: nodeId++, row: r, col: c, type: t.type, icon: t.icon, label: t.label, completed: false, children: [], parents: [] };
      G.mapNodes.push(node);
      row.push(node);
    }

    // Connect previous row to this row
    // Each parent connects to 1-2 children, each child needs at least 1 parent
    const childConnected = new Set();

    prevRow.forEach((parent, pi) => {
      // Connect to nearest child and possibly one more
      const nearestIdx = Math.min(Math.floor(pi / prevRow.length * row.length), row.length - 1);
      const targets = [nearestIdx];
      if (Math.random() < 0.6 && nearestIdx + 1 < row.length) targets.push(nearestIdx + 1);
      if (Math.random() < 0.3 && nearestIdx - 1 >= 0 && !targets.includes(nearestIdx - 1)) targets.push(nearestIdx - 1);

      targets.forEach(ti => {
        parent.children.push(row[ti].id);
        row[ti].parents.push(parent.id);
        G.mapConnections.push({ from: parent.id, to: row[ti].id });
        childConnected.add(ti);
      });
    });

    // Ensure all children have at least one parent
    row.forEach((child, ci) => {
      if (!childConnected.has(ci)) {
        const parentIdx = Math.min(ci, prevRow.length - 1);
        prevRow[parentIdx].children.push(child.id);
        child.parents.push(prevRow[parentIdx].id);
        G.mapConnections.push({ from: prevRow[parentIdx].id, to: child.id });
      }
    });

    prevRow = row;
  }

  // Final row: boss
  const bossNode = { id: nodeId++, row: numRows, col: 0, type: 'boss', icon: '👑', label: 'Boss', completed: false, children: [], parents: [] };
  G.mapNodes.push(bossNode);
  prevRow.forEach(p => {
    p.children.push(bossNode.id);
    bossNode.parents.push(p.id);
    G.mapConnections.push({ from: p.id, to: bossNode.id });
  });

  G.currentNode = -1;
}

// ===== FEATURE 1: MAP RENDERING WITH SVG CONNECTIONS =====
function showMap() {
  showScreen('map-screen');
  const actNames = ['Act 1 — The Outskirts','Act 2 — The Contested Lands','Act 3 — The Monarch\'s Domain'];
  document.getElementById('map-act-title').textContent = actNames[G.act - 1] || 'Act ' + G.act;
  document.getElementById('map-hp').textContent = G.hp;
  document.getElementById('map-ink').textContent = G.ink;
  document.getElementById('map-embers').textContent = G.embers;
  document.getElementById('map-deck').textContent = G.deck.length;
  document.getElementById('map-mods').textContent = G.modifiers.length;
  document.getElementById('map-resilience').textContent = G.resilience;

  renderRelicBar('map-relics');

  const nodesLayer = document.getElementById('map-nodes-layer');
  nodesLayer.innerHTML = '';

  // Group nodes by row
  const rows = {};
  G.mapNodes.forEach(n => {
    if (!rows[n.row]) rows[n.row] = [];
    rows[n.row].push(n);
  });

  // Determine available nodes
  const availableIds = new Set();
  if (G.currentNode === -1) {
    // First move: only row 0
    Object.values(rows)[0]?.forEach(n => availableIds.add(n.id));
  } else {
    const currentNodeObj = G.mapNodes.find(n => n.id === G.currentNode);
    if (currentNodeObj) {
      currentNodeObj.children.forEach(cid => {
        const child = G.mapNodes.find(n => n.id === cid);
        if (child && !child.completed) availableIds.add(cid);
      });
    }
  }

  // Render node rows
  const nodePositions = {};
  const sortedRows = Object.keys(rows).sort((a,b) => a - b);

  sortedRows.forEach(rKey => {
    const rowNodes = rows[rKey];
    const rowDiv = document.createElement('div');
    rowDiv.className = 'map-row';
    rowDiv.style.justifyContent = 'space-evenly';

    rowNodes.forEach(node => {
      const el = document.createElement('div');
      el.className = 'map-node';
      el.dataset.nodeId = node.id;
      if (node.type === 'boss') el.classList.add('boss');
      if (node.completed) el.classList.add('completed');
      if (availableIds.has(node.id)) {
        el.classList.add('available');
        el.addEventListener('click', () => {
          // Burst animation
          const burst = document.createElement('div');
          burst.className = 'node-activate-burst';
          el.appendChild(burst);
          setTimeout(() => burst.remove(), 600);
          setTimeout(() => enterNode(node.id), 200);
        });
      }
      if (node.id === G.currentNode) el.classList.add('current');
      el.innerHTML = `${node.icon}<span class="node-tooltip">${node.label}</span>`;
      rowDiv.appendChild(el);
    });

    nodesLayer.appendChild(rowDiv);
  });

  // After rendering, compute SVG connections
  requestAnimationFrame(() => {
    const svg = document.getElementById('map-svg');
    const container = document.getElementById('map-container');
    svg.innerHTML = '';

    const rect = container.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.style.width = rect.width + 'px';
    svg.style.height = rect.height + 'px';

    // Gather positions
    document.querySelectorAll('.map-node').forEach(el => {
      const id = parseInt(el.dataset.nodeId);
      const r = el.getBoundingClientRect();
      nodePositions[id] = {
        x: r.left - rect.left + r.width / 2,
        y: r.top - rect.top + r.height / 2
      };
    });

    // Draw connections
    G.mapConnections.forEach(conn => {
      const from = nodePositions[conn.from];
      const to = nodePositions[conn.to];
      if (!from || !to) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y);

      const fromNode = G.mapNodes.find(n => n.id === conn.from);
      const toNode = G.mapNodes.find(n => n.id === conn.to);

      if (fromNode?.completed && toNode?.completed) {
        line.classList.add('completed-path');
      } else if (fromNode?.completed && availableIds.has(conn.to)) {
        line.classList.add('active-path');
      }

      svg.appendChild(line);
    });
  });
}

function renderRelicBar(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  G.relics.forEach(r => {
    const el = document.createElement('div');
    el.className = containerId === 'map-relics' ? 'relic-icon' : 'battle-relic';
    el.innerHTML = `${r.icon}<span class="relic-tooltip"><span class="relic-tip-name">${r.name}</span><br><span class="relic-tip-desc">${r.desc}</span></span>`;
    container.appendChild(el);
  });
}

function enterNode(nodeId) {
  G.currentNode = nodeId;
  const node = G.mapNodes.find(n => n.id === nodeId);
  if (!node) return;
  node.completed = true;

  switch (node.type) {
    case 'encounter': startEncounter(generateEnemy('standard')); break;
    case 'elite': startEncounter(generateEnemy('elite')); break;
    case 'boss': startEncounter(generateEnemy('boss')); break;
    case 'event': showEvent(); break;
    case 'rest': showRest(); break;
    case 'shop': showShop(); break;
    case 'treasure': showTreasure(); break;
    case 'shrine': showShrine(); break;
    default: showMap();
  }
}

// ===== ENEMIES =====
function generateEnemy(tier) {
  const actMult = G.act;
  // Build enemy pool from JSON data, computing HP from base + act multiplier
  const pool = ENEMY_DATA[tier].map(t => {
    const entry = { name: t.name, hp: t.baseHp + actMult * t.hpPerAct, passive: t.passive };
    if (t.phases) entry.phases = t.phases;
    return entry;
  });
  const template = pool[Math.floor(Math.random() * pool.length)];

  const hand = [];
  const config = ENEMY_DATA.tierConfig[tier];
  const handSize = config.handSize;
  const rankBonus = config.rankBonus;
  const ascRankFloor = G.ascension >= 18 ? 2 : G.ascension >= 6 ? 1 : 0;
  for (let i = 0; i < handSize; i++) {
    const suit = BATTLE_SUITS[Math.floor(Math.random() * 4)];
    const rank = Math.min(14, Math.max(2 + ascRankFloor, Math.floor(Math.random() * 13) + 2 + rankBonus));
    hand.push({ suit, rank, id: 'e' + Math.random().toString(36).substr(2, 6) });
  }

  const enemy = {
    ...template,
    maxHp: template.hp,
    armor: 0,
    tier,
    hand,
    tricksPerRound: config.tricksPerRound,
    intent: 'attack',
    intentQueue: [],
    currentPhase: 0,
    disabledModIdx: -1,
  };

  // FEATURE 3: Ascension modifiers
  applyAscensionToEnemy(enemy);

  return enemy;
}

function generateEnemyIntents(enemy) {
  const intents = [];
  const hpPct = enemy.hp / enemy.maxHp;
  for (let i = 0; i < enemy.tricksPerRound; i++) {
    const roll = Math.random();
    if (hpPct < 0.33) intents.push(roll < 0.7 ? 'heavy_attack' : roll < 0.9 ? 'attack' : 'buff');
    else if (hpPct < 0.66) intents.push(roll < 0.5 ? 'attack' : roll < 0.7 ? 'heavy_attack' : roll < 0.85 ? 'debuff' : 'defend');
    else intents.push(roll < 0.4 ? 'attack' : roll < 0.6 ? 'defend' : roll < 0.8 ? 'buff' : 'debuff');
  }
  enemy.intentQueue = intents;
}

function getIntentIcon(intent) {
  return { attack:'⚔️ Attack', heavy_attack:'💥 Heavy', defend:'🛡️ Defend', buff:'⬆️ Buff', debuff:'⬇️ Debuff' }[intent] || '⚔️ Attack';
}
function getIntentColor(intent) {
  return { attack:'var(--danger)', heavy_attack:'#ff4444', defend:'var(--clubs)', buff:'var(--diamonds)', debuff:'var(--spades)' }[intent] || 'var(--text-secondary)';
}

function enemySelectCard() {
  const hand = G.enemy.hand;
  if (hand.length === 0) return null;
  if (hand.length === 1) return hand.splice(0, 1)[0];
  const hpPct = G.enemy.hp / G.enemy.maxHp;

  if (G.enemy.tier === 'boss' && G.enemy.phases) {
    const phase = getCurrentPhase();
    if (phase?.effect === 'void_surge') hand.forEach(c => { c.rank = Math.max(c.rank, 12); });
    if (phase?.effect === 'all_boost') hand.forEach(c => { c.rank = Math.min(14, c.rank + 2); });
  }

  if (hpPct < 0.33) { hand.sort((a, b) => b.rank - a.rank); return hand.splice(0, 1)[0]; }
  if (hpPct < 0.66) { hand.sort((a, b) => b.rank - a.rank); return hand.splice(0, 1)[0]; }
  hand.sort((a, b) => a.rank - b.rank);
  return hand.splice(0, 1)[0];
}

function getCurrentPhase() {
  if (!G.enemy?.phases) return null;
  const hpPct = G.enemy.hp / G.enemy.maxHp;
  let current = G.enemy.phases[0];
  for (const phase of G.enemy.phases) {
    if (hpPct <= phase.threshold) current = phase;
  }
  return current;
}

function checkPhaseTransition() {
  if (!G.enemy?.phases) return;
  const hpPct = G.enemy.hp / G.enemy.maxHp;
  const oldPhase = G.enemy.currentPhase;
  let newPhaseIdx = 0;
  for (let i = G.enemy.phases.length - 1; i >= 0; i--) {
    if (hpPct <= G.enemy.phases[i].threshold) newPhaseIdx = i;
  }
  if (newPhaseIdx > oldPhase) {
    G.enemy.currentPhase = newPhaseIdx;
    const phase = G.enemy.phases[newPhaseIdx];
    const flash = document.createElement('div');
    flash.className = 'phase-flash';
    document.getElementById('battle-screen').appendChild(flash);
    setTimeout(() => flash.remove(), 800);
    document.getElementById('battle-screen').classList.add('screen-shake');
    setTimeout(() => document.getElementById('battle-screen').classList.remove('screen-shake'), 400);
    spawnKeywordPopup(`PHASE ${newPhaseIdx + 1}: ${phase.name}`, 45);
  }
}

function applyBossPhaseEffects(context, pCard, eCard, playerWins, score) {
  if (!G.enemy?.phases) return 0;
  const phase = getCurrentPhase();
  if (!phase) return 0;
  let extra = 0;

  if (context === 'on_win' && playerWins) {
    if (phase.effect === 'heal') G.enemy.hp = Math.min(G.enemy.maxHp, G.enemy.hp + Math.floor(G.enemy.maxHp * 0.03));
    if (phase.effect === 'recoil') { G.hp = Math.max(1, G.hp - 3); extra = -3; }
    if (phase.effect === 'reflect') { const r = Math.floor(score * 0.25); G.hp = Math.max(1, G.hp - r); extra = -r; }
  }
  if (context === 'round_start') {
    if (phase.effect === 'armor_gain') G.enemy.armor += 8;
    if (phase.effect === 'armor_surge') G.enemy.armor += 12;
    if (phase.effect === 'disable_mod' && G.modifiers.length > 0) G.enemy.disabledModIdx = Math.floor(Math.random() * G.modifiers.length);
    else G.enemy.disabledModIdx = -1;
  }
  if (context === 'enemy_card_boost') {
    if (phase.effect === 'diamond_boost' && eCard?.suit === 'diamonds') return 3;
    if (phase.effect === 'double_play') return 3;
  }
  return extra;
}

// ===== ENCOUNTER =====
function startEncounter(enemy) {
  G.enemy = enemy;
  G.roundNum = 0; G.trickNum = 0; G.roundScore = 0;
  G.consecutiveWins = 0; G.shield = 0;
  G.tricksPerRound = enemy.tricksPerRound;
  G.rowStreaks = { crown: 0, heart: 0, foundation: 0 };
  G.hand = []; G.burnPile = [];
  G.selectedCard = null; G.selectedRow = null;
  G.revealedEnemyCards = [];
  G.echoNextTrick = false; G.echoSuit = null;
  G.enemyRow = null;
  G.surgeFired = { crown: false, heart: false, foundation: false };
  G.crownSurgeActive = false;

  if (hasRelic('suit_trump')) {
    const sc = {};
    SUITS.forEach(s => { sc[s] = G.deck.filter(c => c.suit === s).length; });
    G.trumpSuit = Object.entries(sc).sort((a,b) => b[1] - a[1])[0][0];
  } else G.trumpSuit = null;

  G.modifiers = G.modifiers.filter(m => m.tier !== 'spark' || m.persistent);
  if (hasRelic('iron_scales')) G.shield = 5;
  if (hasRelic('cracked_monocle') && enemy.hand.length >= 2)
    G.revealedEnemyCards = [{ ...enemy.hand[0] }, { ...enemy.hand[1] }];

  showScreen('battle-screen');
  document.getElementById('matrix-panel').classList.remove('open');
  clearRows();
  startRound();
}

function startRound() {
  G.roundNum++; G.trickNum = 0; G.roundScore = 0; G.consecutiveWins = 0;

  if (G.deck.length < 7) { G.deck.push(...G.burnPile); G.burnPile = []; shuffleArray(G.deck); }
  shuffleArray(G.deck);
  const drawCount = Math.min(G.ascension >= 8 ? 6 : 7, G.deck.length);
  G.hand = G.deck.splice(0, drawCount);

  if (G.hand.length === 0) {
    for (let i = 0; i < 5; i++) G.hand.push(makeCard(BATTLE_SUITS[Math.floor(Math.random()*4)], Math.floor(Math.random()*8)+2, 'common'));
  }

  while (G.enemy.hand.length < G.tricksPerRound) {
    const suit = BATTLE_SUITS[Math.floor(Math.random() * 4)];
    const rank = Math.min(14, Math.floor(Math.random() * 13) + 2 + (G.enemy.tier === 'boss' ? 3 : G.enemy.tier === 'elite' ? 1 : 0));
    G.enemy.hand.push({ suit, rank, id: 'e' + Math.random().toString(36).substr(2, 6) });
  }

  applyBossPhaseEffects('round_start', null, null, false, 0);
  generateEnemyIntents(G.enemy);

  if (G.enemy.name === 'Page Golem') G.enemy.armor += 5;
  if (G.enemy.name === 'Eraser Wraith' && G.modifiers.length > 0) {
    const sorted = G.modifiers.map((m,i) => ({val: m.value, idx: i})).sort((a,b) => a.val - b.val);
    G.enemy.disabledModIdx = sorted[0].idx;
  }

  if (hasRelic('ember_core')) G.modifiers.push({ name: 'Ember Core', suit: null, type: 'mult', value: 0.1, tier: 'spark', persistent: false });

  updateBattleUI();
  startTrick();
}

function startTrick() {
  G.trickNum++;
  G.selectedCard = null; G.selectedRow = null; G.enemyCard = null;
  G.phase = 'enemy_led';

  const currentIntent = G.enemy.intentQueue[G.trickNum - 1] || 'attack';
  G.enemy.intent = currentIntent;

  const rows = ['crown', 'heart', 'foundation'];
  G.enemyRow = rows[Math.floor(Math.random() * 3)];

  G.enemyCard = enemySelectCard();
  if (!G.enemyCard) G.enemyCard = { suit: BATTLE_SUITS[Math.floor(Math.random()*4)], rank: 2, id: 'epass' };

  if (currentIntent === 'heavy_attack') G.enemyCard.rank = Math.min(14, G.enemyCard.rank + 2);
  else if (currentIntent === 'defend') G.enemy.armor += Math.floor(2 + G.act);
  else if (currentIntent === 'buff') G.enemy.hand.forEach(c => { c.rank = Math.min(14, c.rank + 1); });

  const rankBoost = applyBossPhaseEffects('enemy_card_boost', null, G.enemyCard, false, 0);
  if (rankBoost) G.enemyCard.rank = Math.min(14, G.enemyCard.rank + rankBoost);

  updateBattleUI();
  G.phase = 'player_choose';
  enableRowSelection(true);
}

function selectCard(cardId) {
  if (G.phase !== 'player_choose') return;
  G.selectedCard = G.hand.find(c => c.id === cardId) || null;

  if (G.selectedCard?.keywords.includes('Linked')) {
    const sameInDeck = G.deck.filter(c => c.suit === G.selectedCard.suit).sort((a,b) => b.rank - a.rank);
    if (sameInDeck.length > 0 && G.hand.length < 10) {
      const pulled = sameInDeck[0];
      G.deck = G.deck.filter(c => c.id !== pulled.id);
      G.hand.push(pulled);
      spawnKeywordPopup('LINKED: +' + RANK_NAMES[pulled.rank] + SUIT_SYMBOLS[pulled.suit], 60);
    }
  }

  // FEATURE 6: Resurrect keyword — pull from burn pile
  if (G.selectedCard?.keywords.includes('Resurrect') && G.burnPile.length > 0) {
    const best = [...G.burnPile].sort((a,b) => (b.rank||0) - (a.rank||0))[0];
    if (best && G.hand.length < 10) {
      G.burnPile = G.burnPile.filter(c => c.id !== best.id);
      G.hand.push(best);
      spawnKeywordPopup('RESURRECT: ' + (best.name || RANK_NAMES[best.rank]) + ' from ashes!', 55);
    }
  }

  updateBattleUI();
}

// ===== CORE: PLAY CARD =====
function playCard() {
  if (!G.selectedCard || !G.selectedRow || G.phase !== 'player_choose') return;
  G.phase = 'resolving';
  enableRowSelection(false);
  META.cardsPlayed++;

  const pCard = G.selectedCard;
  const eCard = G.enemyCard;
  const row = G.selectedRow;

  G.hand = G.hand.filter(c => c.id !== pCard.id);

  let playerWins = false;
  let isTrump = false;

  // FEATURE 5: Stars suit matches ANY suit (universal affinity)
  const suitMatches = pCard.suit === eCard.suit || pCard.suit === 'stars';

  if (G.trumpSuit && pCard.suit === G.trumpSuit && pCard.suit !== eCard.suit) isTrump = true;
  if (hasRelic('wild_trump') && pCard.keywords.length >= 2 && pCard.suit !== eCard.suit) isTrump = true;

  if (isTrump) {
    playerWins = pCard.keywords.includes('Swift') ? pCard.rank >= eCard.rank : pCard.rank > eCard.rank;
    if (playerWins) spawnKeywordPopup('TRUMP! Suit overridden!', 40);
  } else if (suitMatches) {
    playerWins = pCard.keywords.includes('Swift') ? pCard.rank >= eCard.rank : pCard.rank > eCard.rank;
  }

  const isClash = (row === G.enemyRow);
  if (isClash) spawnKeywordPopup('⚡ CLASH! (' + row.toUpperCase() + ')', 38);

  let crownOnLoss = !playerWins && row === 'crown' && hasRelic('shattered_crown');
  const hasAnchor = pCard.keywords.includes('Anchor');

  if (playerWins || crownOnLoss) { G.rowStreaks[row]++; }
  else {
    if (!hasAnchor && !(G.ascension >= 13)) G.rowStreaks[row] = 0;
    else if (G.ascension >= 13) G.rowStreaks[row] = 0; // Asc 13: always reset
    G.rowStreaks[row]++;
  }

  if (hasRelic('blood_pact')) G.hp = Math.max(1, G.hp - 1);

  let trickScore = 0;
  let breakdownData = null;

  if (playerWins || crownOnLoss) {
    const result = calculateScoreDetailed(pCard, row);
    trickScore = result.total;
    breakdownData = result;
    G.consecutiveWins++;
    G.tricksWon++;

    // FEATURE 5: Stars suit gives universal modifier reward
    if (pCard.suit === 'stars') {
      addSparkModifier(null, 'mult'); // universal
      spawnKeywordPopup('⭐ STAR POWER: Universal modifier!', 42);
    } else {
      addSuitSpecificReward(pCard.suit);
    }

    if (isClash) { addSuitSpecificReward(pCard.suit); spawnKeywordPopup('CLASH BONUS: Double modifier!', 45); }
    if (G.rowStreaks[row] >= 4 && !G.surgeFired[row]) { G.surgeFired[row] = true; applyRowSurge(row); }

    if (pCard.keywords.includes('Echo')) {
      G.echoNextTrick = true; G.echoSuit = pCard.suit;
      spawnKeywordPopup('ECHO: Modifier carries!', 55);
      if (hasRelic('echo_chamber')) { addSuitSpecificReward(pCard.suit); spawnKeywordPopup('ECHO ×2!', 50); }
    }

    if (G.playerClass === 'ember' && G.trickNum === 1 && !(G.ascension >= 17)) {
      G.modifiers.push({ name: 'Warming Up', suit: pCard.suit, type: 'mult', value: 0.1, tier: 'spark', persistent: false });
    }

    applyBossPhaseEffects('on_win', pCard, eCard, true, trickScore);

    if (pCard.keywords.includes('Fracture') && G.enemy.armor > 0) {
      const ab = Math.min(G.enemy.armor, 10);
      G.enemy.armor -= ab;
      spawnKeywordPopup('FRACTURE: -' + ab + ' armor', 65);
    }

    let finalDmg = Math.max(1, Math.floor(trickScore));
    if (G.crownSurgeActive) { finalDmg *= 2; G.crownSurgeActive = false; spawnKeywordPopup('CROWN SURGE: ×2!', 35); }

    const armorBlock = Math.min(finalDmg, G.enemy.armor);
    G.enemy.armor -= armorBlock;
    const actualDmg = finalDmg - armorBlock;
    const preHitHp = G.enemy.hp;
    G.enemy.hp = Math.max(0, G.enemy.hp - actualDmg);
    G.roundScore += finalDmg;
    G.totalDamage += finalDmg;

    // FEATURE 7: Earn Embers on win
    let emberGain = 1 + Math.floor(finalDmg / 20);
    if (hasRelic('molten_heart')) emberGain += 2;
    G.embers += emberGain;

    if (G.enemy.hp <= 0 && actualDmg > preHitHp) {
      const overkillInk = Math.floor((actualDmg - preHitHp) / 2);
      if (overkillInk > 0) { G.ink += overkillInk; spawnKeywordPopup('OVERKILL! +' + overkillInk + ' Ink', 30); }
    }

    if (hasRelic('ink_per_win') || hasRelic('ink_siphon')) G.ink += 5;
    if (hasRelic('bleeding_heart') && pCard.suit === 'hearts') G.hp = Math.min(G.maxHp, G.hp + 2);

    checkPhaseTransition();
  } else {
    G.consecutiveWins = 0;
    G.tricksLost++;

    let resGain = 1;
    if (hasRelic('resilient_heart')) resGain += 1;
    G.resilience += resGain;
    spawnKeywordPopup('+' + resGain + ' Resilience', 55);

    if (pCard.keywords.includes('Phantom')) { G.hand.push(pCard); spawnKeywordPopup('PHANTOM: Card returns!', 50); }

    const hasAbsorb = pCard.keywords.includes('Absorb');

    if (G.playerClass === 'chrome') {
      const ec = G.modifiers.filter(m => m.name === 'Calculated Risk');
      if (ec.length < 3) G.modifiers.push({ name: 'Calculated Risk', suit: null, type: 'mult', value: 0.3, tier: 'spark', persistent: false, duration: 2 });
    }

    if (row === 'foundation') G.shield += 3;

    if (!hasAbsorb) {
      let eDmg = Math.floor(eCard.rank * 0.8 * G.act);
      if (G.enemy.tier === 'boss') eDmg = Math.floor(eDmg * 1.5);
      if (G.enemy.intent === 'debuff') eDmg = Math.floor(eDmg * 1.3);
      if (isClash) { eDmg = Math.floor(eDmg * 1.5); spawnKeywordPopup('CLASH LOSS: +50%!', 48); }
      if (G.ascension >= 12) eDmg = Math.floor(eDmg * 1.2); // Asc 12
      eDmg = Math.max(0, eDmg - G.shield);
      G.shield = Math.max(0, G.shield - Math.floor(eCard.rank * 0.8 * G.act));
      G.hp = Math.max(0, G.hp - eDmg);
    } else spawnKeywordPopup('ABSORB: No damage!', 55);
  }

  // Burn pile
  if (playerWins) G.burnPile.push(eCard);
  else if (!pCard.keywords.includes('Phantom')) G.burnPile.push(pCard);

  addMiniCard(row, pCard);

  if ((playerWins || crownOnLoss) && breakdownData) showScoreBreakdown(breakdownData);
  showTrickResult(playerWins || crownOnLoss, trickScore, pCard);

  if (!pCard.keywords.includes('Echo') && G.echoNextTrick) G.echoNextTrick = false;
  if (pCard.keywords.includes('Volatile')) {
    G.deck = G.deck.filter(c => c.id !== pCard.id);
    G.hand = G.hand.filter(c => c.id !== pCard.id);
  }

  const delay = (playerWins || crownOnLoss) && breakdownData ? 2500 : 800;

  setTimeout(() => {
    if (G.enemy.hp <= 0) { encounterVictory(); return; }
    if (G.hp <= 0) { gameOver(false); return; }

    if (G.trickNum >= G.tricksPerRound) {
      G.phase = 'round_end';
      G.deck.push(...G.hand);
      G.hand = [];
      G.modifiers = G.modifiers.filter(m => { if (m.duration) { m.duration--; return m.duration > 0; } return true; });
      if (G.enemy.hp > 0) setTimeout(() => startRound(), 600);
    } else {
      G.phase = 'idle';
      setTimeout(() => startTrick(), 500);
    }
  }, delay);
}

// ===== SUIT-SPECIFIC REWARDS =====
function addSuitSpecificReward(suit) {
  switch(suit) {
    case 'hearts': addSparkModifier('hearts', 'mult'); break;
    case 'diamonds': addSparkModifier('diamonds', 'chips'); break;
    case 'clubs':
      const dd = 2 + G.act;
      G.enemy.hp = Math.max(0, G.enemy.hp - dd);
      G.totalDamage += dd;
      spawnScorePopup(dd);
      break;
    case 'spades':
      if (G.enemy.hand.length > 0) {
        const ri = Math.floor(Math.random() * G.enemy.hand.length);
        G.revealedEnemyCards.push({ ...G.enemy.hand[ri] });
        spawnKeywordPopup('REVEALED: ' + RANK_NAMES[G.enemy.hand[ri].rank] + SUIT_SYMBOLS[G.enemy.hand[ri].suit], 55);
      }
      break;
    case 'stars':
      addSparkModifier(null, 'mult'); // universal
      break;
  }

  if (hasRelic('gamblers_coin') && Math.random() < 0.2 && suit !== 'clubs') {
    addSparkModifier(suit, suit === 'diamonds' ? 'chips' : 'mult');
    spawnKeywordPopup("GAMBLER'S COIN: Double!", 50);
  }

  if (G.echoNextTrick && G.echoSuit && G.echoSuit !== suit) {
    addSparkModifier(G.echoSuit, G.echoSuit === 'diamonds' ? 'chips' : 'mult');
  }
}

function applyRowSurge(row) {
  switch (row) {
    case 'crown':
      G.crownSurgeActive = true;
      spawnKeywordPopup('👑 CROWN SURGE! Next ×2!', 30);
      break;
    case 'heart':
      const hc = G.modifiers.length;
      if (hc > 0) { G.modifiers.push({ name: 'Heart Surge', suit: null, type: 'chips', value: hc, tier: 'spark', persistent: false }); spawnKeywordPopup('❤️ HEART SURGE! +' + hc + ' chips!', 30); }
      break;
    case 'foundation':
      const ss = Math.floor(G.maxHp * 0.5);
      G.shield += ss;
      spawnKeywordPopup('🛡️ SHIELD SURGE! +' + ss + '!', 30);
      break;
  }
}

function addSparkModifier(suit, type) {
  if (type === 'chips') {
    const chipVal = 2 + (hasRelic('diamond_lens') && suit === 'diamonds' ? 1 : 0);
    const existing = G.modifiers.find(m => m.tier === 'spark' && m.suit === suit && m.type === 'chips' && !m.persistent);
    if (existing) { existing.value += chipVal; }
    else G.modifiers.push({ name: (suit ? suit.charAt(0).toUpperCase()+suit.slice(1) : 'Universal') + ' Chips', suit, type: 'chips', value: chipVal, tier: 'spark', persistent: false });
  } else {
    const existing = G.modifiers.find(m => m.tier === 'spark' && m.suit === suit && m.type === 'mult' && !m.persistent);
    if (existing) { existing.value += 0.1; existing.value = Math.min(existing.value, 2.0); }
    else G.modifiers.push({ name: (suit ? suit.charAt(0).toUpperCase()+suit.slice(1) : 'Universal') + ' Spark', suit, type: 'mult', value: 0.1, tier: 'spark', persistent: false });
  }
}

// ===== SCORE CALCULATION =====
function calculateScoreDetailed(card, row) {
  const steps = [];
  let chips = card.baseChips;

  if (hasRelic('loaded_dice') && card.rank % 2 === 0) { chips += 2; steps.push({ label: 'Loaded Dice', value: '+2', colorClass: 'relic-color' }); }
  if (hasRelic('void_lens') && card.suit === 'spades') { chips += 3; steps.push({ label: 'Void Lens', value: '+3', colorClass: 'relic-color' }); }
  if (hasRelic('star_prism') && card.suit === 'stars') { chips += 4; steps.push({ label: 'Star Prism', value: '+4', colorClass: 'stars-color' }); }

  // FEATURE 6: Pyre keyword — +1 chip per burn pile card
  if (card.keywords.includes('Pyre')) {
    const pyreBonus = G.burnPile.length * (hasRelic('phoenix_ash') ? 2 : 1);
    if (pyreBonus > 0) { chips += pyreBonus; steps.push({ label: `Pyre (${G.burnPile.length} burned)`, value: '+' + pyreBonus, colorClass: 'keyword-color' }); }
  }

  steps.unshift({ label: 'Base Chips', value: card.baseChips.toString(), colorClass: 'chips-color' });

  let chipMod = 0;
  G.modifiers.forEach((m, idx) => {
    if (idx === G.enemy?.disabledModIdx) return;
    // FEATURE 5: null suit (universal) or stars suit applies to ALL
    if (m.type === 'chips' && (m.suit === card.suit || m.suit === null || m.suit === 'stars')) chipMod += m.value;
  });

  if (row === 'heart') chipMod *= 1.5;
  if (chipMod > 0) steps.push({ label: `Chip Mods${row === 'heart' ? ' (×1.5)' : ''}`, value: '+' + chipMod.toFixed(1), colorClass: 'chips-color' });
  chips += chipMod;

  if (card.keywords.includes('Bloom')) { const bc = G.modifiers.length; chips += bc; if (bc > 0) steps.push({ label: 'Bloom', value: '+' + bc, colorClass: 'keyword-color' }); }
  if (card.keywords.includes('Volatile')) { chips *= 2; steps.push({ label: 'Volatile ×2', value: chips.toFixed(0), colorClass: 'keyword-color' }); }

  let mult = card.baseMult;
  if (hasRelic('blood_pact')) { mult += 0.2; steps.push({ label: 'Blood Pact', value: '+0.2×', colorClass: 'relic-color' }); }
  if (hasRelic('star_prism') && card.suit === 'stars') { mult += 0.2; steps.push({ label: 'Star Prism Mult', value: '+0.2×', colorClass: 'stars-color' }); }

  steps.push({ label: 'Base Mult', value: mult.toFixed(2) + '×', colorClass: 'mult-color' });

  let sparkMult = 0, flameMult = 0, infernoMult = 0;
  G.modifiers.forEach((m, idx) => {
    if (idx === G.enemy?.disabledModIdx) return;
    if (m.type !== 'mult') return;
    if (m.suit !== null && m.suit !== card.suit && m.suit !== 'stars') return;
    if (m.tier === 'spark') sparkMult += m.value;
    else if (m.tier === 'flame') flameMult += m.value;
    else if (m.tier === 'inferno') infernoMult += m.value;
  });

  const crownBonus = row === 'crown' ? 1.5 : 1.0;
  if (sparkMult > 0) { mult *= (1 + sparkMult * crownBonus); steps.push({ label: `Spark Mods${row === 'crown' ? ' (×1.5)' : ''}`, value: '×' + (1 + sparkMult * crownBonus).toFixed(2), colorClass: 'mult-color' }); }
  if (flameMult > 0) { mult *= (1 + flameMult * crownBonus); steps.push({ label: `Flame Mods${row === 'crown' ? ' (×1.5)' : ''}`, value: '×' + (1 + flameMult * crownBonus).toFixed(2), colorClass: 'mult-color' }); }
  if (infernoMult > 0) { mult *= (1 + infernoMult * crownBonus); steps.push({ label: `Inferno Mods${row === 'crown' ? ' (×1.5)' : ''}`, value: '×' + (1 + infernoMult * crownBonus).toFixed(2), colorClass: 'mult-color' }); }

  const streak = G.rowStreaks[row] || 0;
  const streakBonus = streak >= 4 ? 1.5 : streak >= 3 ? 1.25 : streak >= 2 ? 1.1 : 1.0;
  if (streakBonus > 1) { mult *= streakBonus; steps.push({ label: `Streak (×${streak})`, value: '×' + streakBonus.toFixed(2), colorClass: 'bonus-color' }); }
  if (G.consecutiveWins > 0) { const cm = 1 + 0.1 * G.consecutiveWins; mult *= cm; steps.push({ label: `Combo (${G.consecutiveWins})`, value: '×' + cm.toFixed(2), colorClass: 'bonus-color' }); }
  if (card.keywords.includes('Crown') && row === 'crown') { mult *= 1.5; steps.push({ label: 'Crown KW', value: '×1.5', colorClass: 'keyword-color' }); }

  return { steps, total: Math.max(1, Math.floor(chips * mult)), chips: Math.floor(chips), mult: mult.toFixed(2) };
}

function calculateScore(card, row) { return calculateScoreDetailed(card, row).total; }

// ===== SCORE BREAKDOWN =====
function showScoreBreakdown(data) {
  const overlay = document.getElementById('score-breakdown-overlay');
  const stepsContainer = document.getElementById('breakdown-steps');
  const finalEl = document.getElementById('breakdown-final');
  const totalEl = document.getElementById('breakdown-total');
  stepsContainer.innerHTML = '';
  finalEl.classList.remove('visible');
  totalEl.textContent = '0';

  data.steps.forEach((step, i) => {
    const el = document.createElement('div');
    el.className = 'breakdown-step';
    el.innerHTML = `<span class="step-label">${step.label}</span><span class="step-value ${step.colorClass}">${step.value}</span>`;
    stepsContainer.appendChild(el);
    setTimeout(() => el.classList.add('visible'), 80 * (i + 1));
  });

  const totalDelay = 80 * (data.steps.length + 1) + 200;
  setTimeout(() => { totalEl.textContent = data.total.toLocaleString(); finalEl.classList.add('visible'); }, totalDelay);
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), totalDelay + 1200);
}

function showTrickResult(won, score, card) {
  const el = document.getElementById('trick-result');
  el.textContent = won ? `Won! +${score}` : 'Lost!';
  el.className = 'trick-result visible ' + (won ? 'win' : 'lose');
  if (won && score > 0) {
    const se = document.getElementById('round-score');
    se.classList.add('exploding');
    setTimeout(() => se.classList.remove('exploding'), 600);
    if (score >= 20) spawnScorePopup(score);
    if (score >= 50) {
      document.getElementById('battle-screen').classList.add('screen-shake');
      setTimeout(() => document.getElementById('battle-screen').classList.remove('screen-shake'), 400);
    }
  }
  setTimeout(() => el.classList.remove('visible'), 700);
  updateBattleUI();
}

function spawnScorePopup(score) {
  const p = document.createElement('div');
  p.className = 'score-popup';
  p.textContent = '+' + score;
  p.style.left = (40 + Math.random() * 20) + '%';
  p.style.top = (30 + Math.random() * 20) + '%';
  p.style.fontSize = Math.min(48, 20 + score / 5) + 'px';
  p.style.color = score >= 100 ? '#ffd166' : score >= 50 ? '#f0d078' : 'var(--gold)';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1200);
}

function spawnKeywordPopup(text, topPct) {
  const p = document.createElement('div');
  p.className = 'keyword-popup';
  p.textContent = text;
  p.style.left = (30 + Math.random() * 40) + '%';
  p.style.top = (topPct || 45) + '%';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1000);
}

// ===== ENCOUNTER VICTORY =====
function encounterVictory() {
  G.encountersWon++;
  const inkGain = G.enemy.tier === 'boss' ? 80 : G.enemy.tier === 'elite' ? 50 : 30;
  G.ink += inkGain;

  G.deck.push(...G.hand);
  G.hand = [];

  if (G.enemy.tier === 'elite' || G.enemy.tier === 'boss') {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    G.modifiers.push({
      name: suit.charAt(0).toUpperCase() + suit.slice(1) + (G.enemy.tier === 'boss' ? ' Inferno' : ' Flame'),
      suit, type: 'mult', value: G.enemy.tier === 'boss' ? 0.3 : 0.2,
      tier: G.enemy.tier === 'boss' ? 'inferno' : 'flame', persistent: true
    });
  }

  if (G.enemy.tier === 'boss') {
    G.act++;
    if (G.act > 3) { gameOver(true); return; }
    generateMap();
    showRewardScreen(inkGain, true);
  } else {
    showRewardScreen(inkGain, false);
  }
}

function showRewardScreen(inkGain, isBoss) {
  showScreen('reward-screen');
  document.getElementById('reward-ink').textContent = '+' + inkGain + ' Ink' + (isBoss ? '  •  Act Complete!' : '');
  document.getElementById('reward-title').textContent = 'Victory!';

  const container = document.getElementById('reward-cards');
  container.innerHTML = '';

  const tier = G.enemy?.tier || 'standard';
  const numRewards = G.ascension >= 11 ? 2 : 3;
  for (let i = 0; i < numRewards; i++) {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const rank = Math.min(14, Math.floor(Math.random() * 13) + 2 + (tier === 'boss' ? 3 : tier === 'elite' ? 2 : 0));
    const rarity = tier === 'boss' ? 'rare' : tier === 'elite' ? (Math.random() < 0.5 ? 'uncommon' : 'rare') : (Math.random() < 0.7 ? 'common' : 'uncommon');
    const card = makeCard(suit, rank, rarity);
    const el = document.createElement('div');
    el.className = 'reward-card-option';
    el.innerHTML = `
      <div class="card-rank" style="color:${SUIT_COLORS[suit]}">${RANK_NAMES[rank]}</div>
      <div class="card-suit">${SUIT_SYMBOLS[suit]}</div>
      <div class="card-name">${card.name}</div>
      <div style="font-size:9px;color:var(--text-dim);margin-top:2px">${card.baseChips}♦ ${card.baseMult}×</div>
      ${card.keywords.length ? '<div style="font-size:8px;color:var(--gold);margin-top:2px">'+card.keywords.join(', ')+'</div>' : ''}
    `;
    el.addEventListener('click', () => { G.deck.push(card); showMap(); });
    container.appendChild(el);
  }

  const relicArea = document.getElementById('relic-reward-area');
  const relicContainer = document.getElementById('relic-reward-cards');
  relicContainer.innerHTML = '';

  if ((tier === 'elite' || tier === 'boss') && G.relics.length < 8) {
    relicArea.style.display = 'block';
    const available = RELIC_POOL.filter(r => !G.relics.some(gr => gr.id === r.id));
    shuffleArray(available);
    available.slice(0, 3).forEach(relic => {
      const el = document.createElement('div');
      el.className = 'relic-reward-option';
      el.innerHTML = `<div class="relic-big-icon">${relic.icon}</div><div class="relic-r-name">${relic.name}</div><div class="relic-r-desc">${relic.desc}</div>`;
      el.addEventListener('click', () => { G.relics.push({ ...relic }); relicArea.style.display = 'none'; });
      relicContainer.appendChild(el);
    });
  } else relicArea.style.display = 'none';
}

function skipReward() { showMap(); }

// ===== EVENTS =====
const EVENTS = [
  { title: 'The Ink Well', text: 'A bubbling well of pure Ink. Its depths seem bottomless.',
    choices: [
      { label: 'Drink Deep', desc: '+80 Ink, add 3 common cards', fn: () => { G.ink += 80; for(let i=0;i<3;i++) G.deck.push(makeCard(BATTLE_SUITS[Math.floor(Math.random()*4)], Math.floor(Math.random()*8)+2, 'common')); }},
      { label: 'Bottle It', desc: '+35 Ink', fn: () => { G.ink += 35; }},
      { label: 'Drown a Card', desc: 'Remove a random card', fn: () => { if(G.deck.length>15) G.deck.splice(Math.floor(Math.random()*G.deck.length),1); }},
    ]},
  { title: 'The Modifier Merchant', text: 'A cloaked figure offers a glowing sigil.',
    choices: [
      { label: 'Trade HP', desc: '-15 max HP, +Flame modifier', fn: () => { G.maxHp-=15; G.hp=Math.min(G.hp,G.maxHp); const s=SUITS[Math.floor(Math.random()*SUITS.length)]; G.modifiers.push({name:s.charAt(0).toUpperCase()+s.slice(1)+' Flame',suit:s,type:'mult',value:0.3,tier:'flame',persistent:true}); }},
      { label: 'Trade Ink', desc: 'Pay 50 Ink for +0.2× universal mult', fn: () => { if(G.ink>=50){G.ink-=50;G.modifiers.push({name:'Universal Flame',suit:null,type:'mult',value:0.2,tier:'flame',persistent:true});}else{G.ink+=10;} }},
      { label: 'Refuse', desc: 'Nothing happens.', fn: () => {} },
    ]},
  { title: "The Gambler's Ghost", text: 'A spectral card player materializes. "One trick."',
    choices: [
      { label: 'Accept', desc: '50%: +0.3× mult. 50%: lose a card.', fn: () => { if(Math.random()<0.5){G.modifiers.push({name:"Ghost's Gift",suit:null,type:'mult',value:0.3,tier:'flame',persistent:true});}else if(G.deck.length>15){G.deck.splice(Math.floor(Math.random()*G.deck.length),1);} }},
      { label: 'Decline', desc: 'Ghost vanishes.', fn: () => {} },
    ]},
  { title: 'The Broken Mirror', text: 'A shattered mirror shows a version of you from a lost timeline.',
    choices: [
      { label: 'Merge Timelines', desc: 'Add 2 rare cards', fn: () => { for(let i=0;i<2;i++) G.deck.push(makeCard(SUITS[Math.floor(Math.random()*SUITS.length)], Math.floor(Math.random()*5)+10, 'rare')); }},
      { label: 'Shatter It', desc: '+5 chips modifier', fn: () => { G.modifiers.push({name:'Fracture Chips',suit:null,type:'chips',value:5,tier:'flame',persistent:true}); }},
    ]},
  // FEATURE 6: Burn pile event
  { title: 'The Pyre Keeper', text: 'A figure tends a bonfire of discarded cards. "I can reshape what was lost."',
    choices: [
      { label: 'Feed the Pyre', desc: '+15 Embers, gain Pyre keyword on next card', fn: () => { G.embers += 15; }},
      { label: 'Salvage Ashes', desc: 'Add a random Stars card to deck', fn: () => { G.deck.push(makeCard('stars', Math.floor(Math.random()*5)+10, 'uncommon')); }},
    ]},
];

function showEvent() {
  showScreen('event-screen');
  const evt = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  document.getElementById('event-title').textContent = evt.title;
  document.getElementById('event-text').textContent = evt.text;
  const container = document.getElementById('event-choices');
  container.innerHTML = '';
  evt.choices.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'event-choice';
    el.innerHTML = `<div class="choice-label">${ch.label}</div><div class="choice-desc">${ch.desc}</div>`;
    el.addEventListener('click', () => { ch.fn(); showMap(); });
    container.appendChild(el);
  });
}

function showRest() {
  showScreen('rest-screen');
  const container = document.getElementById('rest-choices');
  container.innerHTML = '';
  const hpLoss = G.ascension >= 4 ? 1 : 0;
  [
    { label: '🔥 Rest & Heal', desc: `Recover 30% HP (+${Math.floor(G.maxHp*0.3)})${hpLoss?' then lose 1 HP':''}`, fn: () => { G.hp = Math.min(G.maxHp, G.hp + Math.floor(G.maxHp * 0.3)); if(hpLoss) G.hp = Math.max(1, G.hp-1); }},
    { label: '⚒️ Upgrade Card', desc: 'Random card +50% base chips', fn: () => { if(G.deck.length>0){ const c=G.deck[Math.floor(Math.random()*G.deck.length)]; c.baseChips=Math.floor(c.baseChips*1.5); c.name='★ '+c.name; } }},
    { label: '✨ Meditate', desc: 'Gain Flame modifier', fn: () => { const s=SUITS[Math.floor(Math.random()*SUITS.length)]; G.modifiers.push({name:s.charAt(0).toUpperCase()+s.slice(1)+' Flame',suit:s,type:'mult',value:0.15,tier:'flame',persistent:true}); }},
  ].forEach(ch => {
    const el = document.createElement('div');
    el.className = 'event-choice';
    el.innerHTML = `<div class="choice-label">${ch.label}</div><div class="choice-desc">${ch.desc}</div>`;
    el.addEventListener('click', () => { ch.fn(); showMap(); });
    container.appendChild(el);
  });
}

function showShop() {
  showScreen('event-screen');
  document.getElementById('event-title').textContent = '🏪 The Card Shop';
  document.getElementById('event-text').textContent = `Ink: ${G.ink} | Embers: ${G.embers}`;
  const container = document.getElementById('event-choices');
  container.innerHTML = '';

  const priceScale = G.ascension >= 7 ? 1.25 : 1.0;
  const items = [
    { label: `Uncommon Card (${Math.floor(60*priceScale)} Ink)`, desc: 'Random uncommon card', fn: () => { const c=Math.floor(60*priceScale); if(G.ink>=c){G.ink-=c;G.deck.push(makeCard(SUITS[Math.floor(Math.random()*SUITS.length)],Math.floor(Math.random()*8)+5,'uncommon'));showShop();}else{showShop();} }},
    { label: `Rare Card (${Math.floor(120*priceScale)} Ink)`, desc: 'Rare card rank 10+', fn: () => { const c=Math.floor(120*priceScale); if(G.ink>=c){G.ink-=c;G.deck.push(makeCard(SUITS[Math.floor(Math.random()*SUITS.length)],Math.floor(Math.random()*5)+10,'rare'));showShop();}else{showShop();} }},
    { label: `Remove Weakest (${Math.floor(50*priceScale)} Ink)`, desc: 'Remove weakest card', fn: () => { const c=Math.floor(50*priceScale); if(G.ink>=c&&G.deck.length>15){G.ink-=c;G.deck.sort((a,b)=>a.rank-b.rank);G.deck.shift();showShop();}else{showShop();} }},
    { label: `Upgrade Card (${Math.floor(75*priceScale)} Ink)`, desc: '+50% chips + keyword', fn: () => { const c=Math.floor(75*priceScale); if(G.ink>=c&&G.deck.length>0){G.ink-=c;const d=G.deck[Math.floor(Math.random()*G.deck.length)];d.baseChips=Math.floor(d.baseChips*1.5);if(d.keywords.length===0)d.keywords.push(KEYWORDS[Math.floor(Math.random()*KEYWORDS.length)]);d.name='★ '+d.name;showShop();}else{showShop();} }},
    { label: `Heal Potion (${Math.floor(40*priceScale)} Ink)`, desc: `+${Math.floor(G.maxHp*0.25)} HP`, fn: () => { const c=Math.floor(40*priceScale); if(G.ink>=c){G.ink-=c;G.hp=Math.min(G.maxHp,G.hp+Math.floor(G.maxHp*0.25));showShop();}else{showShop();} }},
    { label: 'Leave Shop', desc: 'Return to map', fn: () => showMap() },
  ];

  items.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'event-choice';
    const costMatch = ch.label.match(/\((\d+)/);
    const cost = costMatch ? parseInt(costMatch[1]) : 0;
    const affordable = cost === 0 || G.ink >= cost;
    el.style.opacity = affordable ? '1' : '0.5';
    el.innerHTML = `<div class="choice-label">${ch.label}</div><div class="choice-desc">${ch.desc}${!affordable && cost ? ' <span style="color:var(--danger)">(Not enough)</span>' : ''}</div>`;
    el.addEventListener('click', ch.fn);
    container.appendChild(el);
  });
}

function showTreasure() {
  showScreen('event-screen');
  document.getElementById('event-title').textContent = '💎 Treasure Found!';
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  G.modifiers.push({ name: suit.charAt(0).toUpperCase()+suit.slice(1)+' Flame', suit, type: 'mult', value: 0.25, tier: 'flame', persistent: true });
  G.ink += 40;
  G.embers += 10;

  let relicText = '';
  if (G.relics.length < 8) {
    const available = RELIC_POOL.filter(r => !G.relics.some(gr => gr.id === r.id));
    if (available.length > 0) {
      const relic = available[Math.floor(Math.random() * available.length)];
      G.relics.push({ ...relic });
      relicText = ` Also found: ${relic.icon} ${relic.name}!`;
    }
  }

  document.getElementById('event-text').textContent = `Found ${suit} Flame (+0.25×), 40 Ink, 10 Embers!${relicText}`;
  const container = document.getElementById('event-choices');
  container.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'event-choice';
  el.innerHTML = '<div class="choice-label">Continue</div>';
  el.addEventListener('click', () => showMap());
  container.appendChild(el);
}

function showShrine() {
  showScreen('event-screen');
  document.getElementById('event-title').textContent = '✨ Modifier Shrine';
  document.getElementById('event-text').textContent = 'Ancient energy hums. Choose your blessing.';
  const container = document.getElementById('event-choices');
  container.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const suit = SUITS[i % SUITS.length];
    const type = Math.random() < 0.5 ? 'mult' : 'chips';
    const val = type === 'mult' ? +(0.15 + Math.random() * 0.2).toFixed(2) : Math.floor(3 + Math.random() * 5);
    const el = document.createElement('div');
    el.className = 'event-choice';
    el.innerHTML = `<div class="choice-label">${suit.charAt(0).toUpperCase()+suit.slice(1)} ${type === 'mult' ? 'Mult' : 'Chips'}</div>
      <div class="choice-desc">+${val}${type==='mult'?'×':''} ${type} for ${suit} cards (Flame)</div>`;
    el.addEventListener('click', () => { G.modifiers.push({ name: suit.charAt(0).toUpperCase()+suit.slice(1)+' Shrine', suit, type, value: val, tier: 'flame', persistent: true }); showMap(); });
    container.appendChild(el);
  }
}

// ===== FEATURE 7: FORGE (Ember Currency / Flame → Inferno) =====
function showForge() {
  showScreen('forge-screen');
  document.getElementById('forge-embers').textContent = `Embers: ${G.embers}`;
  const container = document.getElementById('forge-mods');
  container.innerHTML = '';

  const flameMods = G.modifiers.filter(m => m.tier === 'flame' && m.persistent);
  if (flameMods.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;font-style:italic">No Flame modifiers to upgrade. Win elite/boss encounters to earn them.</p>';
    return;
  }

  flameMods.forEach((mod, i) => {
    const cost = Math.floor(15 + mod.value * 20);
    const el = document.createElement('div');
    el.className = 'forge-mod-item';
    el.innerHTML = `
      <div class="forge-mod-info">
        <div class="forge-mod-name">${mod.name}</div>
        <div class="forge-mod-desc">${mod.type === 'mult' ? mod.value.toFixed(2) + '×' : '+' + mod.value} ${mod.type} → ${mod.type === 'mult' ? (mod.value * 1.5).toFixed(2) + '×' : '+' + Math.floor(mod.value * 1.5)} ${mod.type} (Inferno)</div>
      </div>
      <button class="forge-upgrade-btn" ${G.embers < cost ? 'disabled' : ''} data-mod-idx="${G.modifiers.indexOf(mod)}">
        🔥 ${cost} Embers
      </button>
    `;
    el.querySelector('.forge-upgrade-btn').addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.modIdx);
      if (G.embers >= cost && G.modifiers[idx]) {
        G.embers -= cost;
        G.modifiers[idx].tier = 'inferno';
        G.modifiers[idx].value = mod.type === 'mult' ? +(mod.value * 1.5).toFixed(2) : Math.floor(mod.value * 1.5);
        G.modifiers[idx].name = G.modifiers[idx].name.replace('Flame', 'Inferno');
        spawnKeywordPopup('🔥 FORGED TO INFERNO!', 40);
        showForge();
      }
    });
    container.appendChild(el);
  });
}

// ===== FEATURE 6: BURN PILE INTERACTIONS =====
function showBurnPile() {
  const overlay = document.getElementById('burn-pile-overlay');
  const container = document.getElementById('burn-pile-cards');
  container.innerHTML = '';
  document.getElementById('burn-pile-count').textContent = G.burnPile.length;

  G.burnPile.forEach(c => {
    const el = document.createElement('div');
    el.className = 'burn-mini';
    el.style.color = getComputedSuitColor(c.suit);
    el.style.borderColor = getComputedSuitColor(c.suit);
    el.innerHTML = `${RANK_NAMES[c.rank] || '?'}<span style="font-size:10px">${SUIT_SYMBOLS[c.suit] || ''}</span>`;
    container.appendChild(el);
  });

  // Scavenge button: pull random card back to hand for 3 embers
  const scavBtn = document.getElementById('btn-scavenge');
  scavBtn.style.display = (G.burnPile.length > 0 && G.embers >= 3 && G.phase === 'player_choose') ? 'inline-block' : 'none';

  overlay.classList.add('active');
}

function closeBurnPile() {
  document.getElementById('burn-pile-overlay').classList.remove('active');
}

function scavengeFromBurn() {
  if (G.burnPile.length === 0 || G.embers < 3 || G.hand.length >= 10) return;
  G.embers -= 3;
  // Pull strongest card from burn pile
  G.burnPile.sort((a,b) => (b.rank||0) - (a.rank||0));
  const card = G.burnPile.shift();
  if (card) {
    // Convert enemy cards to playable cards
    if (!card.baseChips) {
      card.baseChips = card.rank;
      card.baseMult = 1.0;
      card.keywords = [];
      card.name = CARD_NAMES_PREFIX[card.suit]?.[0] + ' ' + RANK_NAMES[card.rank];
      card.rarity = 'common';
    }
    G.hand.push(card);
    spawnKeywordPopup('SCAVENGED: ' + RANK_NAMES[card.rank] + SUIT_SYMBOLS[card.suit], 50);
  }
  closeBurnPile();
  updateBattleUI();
}

// ===== GAME OVER =====
function gameOver(victory) {
  showScreen('gameover-screen');
  const titleEl = document.getElementById('gameover-title');
  titleEl.textContent = victory ? 'Victory!' : 'Defeat';
  titleEl.className = 'gameover-title ' + (victory ? 'victory' : 'defeat');

  // FEATURE 4: Meta-progression
  META.totalDamageAllTime += G.totalDamage;
  if (victory) {
    META.totalVictories++;
    // FEATURE 3: Unlock next ascension on victory
    if (G.ascension >= META.unlockedAscension && META.unlockedAscension < 20) {
      META.unlockedAscension = Math.min(20, G.ascension + 1);
    }
    if (G.ascension > META.highestAscension) META.highestAscension = G.ascension;
  }
  saveMeta(META);

  const score = G.totalDamage + (G.tricksWon * 10) + (G.modifiers.length * 50) + (G.hp * 20) + (G.relics.length * 100) + (G.resilience * 5) + (G.embers * 3);
  document.getElementById('gameover-stats').innerHTML = `
    Total Damage: ${G.totalDamage}<br>
    Tricks Won: ${G.tricksWon} | Lost: ${G.tricksLost}<br>
    Encounters: ${G.encountersWon} | Act: ${G.act}<br>
    Ascension: ${G.ascension}<br>
    Modifiers: ${G.modifiers.length} | Relics: ${G.relics.map(r => r.icon).join(' ') || 'None'}<br>
    Embers: ${G.embers} | Resilience: ${G.resilience}<br>
    ${victory && META.unlockedAscension > G.ascension ? '<br><span style="color:var(--ember)">🔥 Ascension ' + META.unlockedAscension + ' Unlocked!</span>' : ''}
    <br><span style="color:var(--gold);font-family:'Cinzel',serif;font-size:20px;">Final Score: ${score.toLocaleString()}</span>
  `;
}

// ===== UI HELPERS =====
function updateBattleUI() {
  document.getElementById('battle-hp').textContent = G.hp + (G.shield > 0 ? ' (🛡' + G.shield + ')' : '');
  document.getElementById('battle-ink').textContent = G.ink;
  document.getElementById('battle-embers').textContent = G.embers;
  document.getElementById('battle-round').textContent = G.roundNum;
  document.getElementById('battle-trick').textContent = G.trickNum + '/' + G.tricksPerRound;
  document.getElementById('battle-act').textContent = G.act;
  document.getElementById('round-score').textContent = G.roundScore;

  document.getElementById('battle-resilience').textContent = G.resilience;
  const resBtn = document.getElementById('btn-resilience');
  resBtn.style.display = G.resilience >= 3 ? 'inline-block' : 'none';

  const trumpBadge = document.getElementById('trump-badge');
  if (G.trumpSuit) {
    trumpBadge.style.display = 'flex';
    document.getElementById('battle-trump').innerHTML = `<span style="color:${getComputedSuitColor(G.trumpSuit)}">${SUIT_SYMBOLS[G.trumpSuit]}</span>`;
  } else trumpBadge.style.display = 'none';

  renderRelicBar('battle-relics');

  if (G.enemy) {
    document.getElementById('enemy-name').textContent = G.enemy.name;
    const phaseEl = document.getElementById('enemy-phase');
    if (G.enemy.phases) {
      const phase = getCurrentPhase();
      phaseEl.textContent = phase ? `Phase: ${phase.name} — ${phase.desc}` : '';
      const markers = document.getElementById('enemy-phase-markers');
      markers.innerHTML = '';
      G.enemy.phases.forEach(p => {
        if (p.threshold < 1.0) { const m = document.createElement('div'); m.className = 'phase-marker'; m.style.left = (p.threshold*100)+'%'; markers.appendChild(m); }
      });
    } else phaseEl.textContent = '';

    const intentDisplay = getIntentIcon(G.enemy.intent || 'attack');
    const intentColor = getIntentColor(G.enemy.intent || 'attack');
    document.getElementById('enemy-intent').innerHTML = `<span style="color:${intentColor}">${intentDisplay}</span>`;

    const enemyRowEl = document.getElementById('enemy-row-indicator');
    if (G.enemyRow) {
      const rowColors = { crown: 'var(--crown-row)', heart: 'var(--heart-row)', foundation: 'var(--foundation-row)' };
      const rowNames = { crown: '👑 Crown', heart: '❤️ Heart', foundation: '🛡️ Shield' };
      enemyRowEl.innerHTML = `Target: <span style="color:${rowColors[G.enemyRow]}">${rowNames[G.enemyRow]}</span>`;
    } else enemyRowEl.innerHTML = '';

    document.getElementById('enemy-hp-fill').style.width = Math.max(0, (G.enemy.hp / G.enemy.maxHp) * 100) + '%';
    document.getElementById('enemy-hp-text').textContent = G.enemy.hp + ' / ' + G.enemy.maxHp + (G.enemy.armor > 0 ? ' [🛡' + G.enemy.armor + ']' : '');
  }

  const ecs = document.getElementById('enemy-card-slot');
  if (G.enemyCard) {
    ecs.className = 'enemy-card-slot has-card';
    ecs.style.borderColor = getComputedSuitColor(G.enemyCard.suit);
    ecs.innerHTML = `<div style="text-align:center"><div style="font-family:'Cinzel',serif;font-size:24px;font-weight:900;color:${SUIT_COLORS[G.enemyCard.suit]}">${RANK_NAMES[G.enemyCard.rank]}</div><div style="font-size:22px">${SUIT_SYMBOLS[G.enemyCard.suit]}</div></div>`;
  } else { ecs.className = 'enemy-card-slot'; ecs.innerHTML = 'Waiting...'; }

  const revContainer = document.getElementById('revealed-cards');
  revContainer.innerHTML = '';
  G.revealedEnemyCards.forEach(c => {
    const el = document.createElement('div');
    el.className = 'revealed-mini';
    el.style.color = getComputedSuitColor(c.suit);
    el.textContent = RANK_NAMES[c.rank] + SUIT_SYMBOLS[c.suit];
    revContainer.appendChild(el);
  });

  renderHand();

  document.getElementById('btn-play').disabled = !(G.selectedCard && G.selectedRow && G.phase === 'player_choose');

  // Render comprehensive play preview
  renderPlayPreview();

  ['crown','heart','foundation'].forEach(r => {
    document.getElementById(r + '-streak').textContent = (G.rowStreaks[r] || 0) > 0 ? '×' + G.rowStreaks[r] : '';
    const lane = document.querySelector(`.row-lane.${r}`);
    lane.classList.toggle('clash-target', G.enemyRow === r && G.phase === 'player_choose');
    lane.classList.toggle('surge-ready', G.rowStreaks[r] === 3 && !G.surgeFired[r]);
  });

  renderMatrix();
}

// ===== PLAY PREVIEW SYSTEM =====
function getPreviewOutcome(card, row) {
  if (!card || !G.enemyCard) return null;
  const suitMatches = card.suit === G.enemyCard.suit || card.suit === 'stars';
  const hasTrump = (G.trumpSuit && card.suit === G.trumpSuit && card.suit !== G.enemyCard.suit)
    || (hasRelic('wild_trump') && card.keywords.length >= 2 && card.suit !== G.enemyCard.suit);
  const effectiveMatch = suitMatches || hasTrump;
  const hasSwift = card.keywords.includes('Swift');
  const wouldWin = effectiveMatch && (hasSwift ? card.rank >= G.enemyCard.rank : card.rank > G.enemyCard.rank);
  const isClash = row === G.enemyRow;
  return { effectiveMatch, wouldWin, isClash, hasTrump, suitMatches };
}

function estimateIncomingDamage(card, row) {
  if (!G.enemyCard) return { raw: 0, afterShield: 0, shieldUsed: 0 };
  let eDmg = Math.floor(G.enemyCard.rank * 0.8 * G.act);
  if (G.enemy?.tier === 'boss') eDmg = Math.floor(eDmg * 1.5);
  if (G.enemy?.intent === 'debuff') eDmg = Math.floor(eDmg * 1.3);
  const isClash = row === G.enemyRow;
  if (isClash) eDmg = Math.floor(eDmg * 1.5);
  if (G.ascension >= 12) eDmg = Math.floor(eDmg * 1.2);
  const hasAbsorb = card.keywords.includes('Absorb');
  if (hasAbsorb) return { raw: 0, afterShield: 0, shieldUsed: 0, absorbed: true };
  const shieldUsed = Math.min(eDmg, G.shield);
  const afterShield = Math.max(0, eDmg - G.shield);
  return { raw: eDmg, afterShield, shieldUsed };
}

function getSuitRewardPreview(suit) {
  const rewards = {
    hearts: { icon: '♥', text: '+Mult mod', color: 'var(--hearts)' },
    diamonds: { icon: '♦', text: '+Chip mod', color: 'var(--diamonds)' },
    clubs: { icon: '♣', text: `+${2 + G.act} direct dmg`, color: 'var(--clubs)' },
    spades: { icon: '♠', text: 'Reveal card', color: 'var(--spades)' },
    stars: { icon: '⭐', text: 'Universal mod', color: 'var(--stars)' },
  };
  return rewards[suit] || { icon: '?', text: '', color: 'var(--text-dim)' };
}

function renderPlayPreview() {
  const panel = document.getElementById('play-preview-panel');
  const rows = ['crown', 'heart', 'foundation'];

  // Clear row hints
  rows.forEach(r => {
    const hint = document.getElementById(r + '-preview-hint');
    if (hint) { hint.innerHTML = ''; hint.className = 'row-preview-hint'; }
  });

  if (G.phase !== 'player_choose' || !G.selectedCard) {
    panel.classList.remove('active', 'win-preview', 'lose-preview', 'nomatch-preview');
    return;
  }

  // When card selected but no row: show per-row hints
  if (!G.selectedRow) {
    panel.classList.remove('active', 'win-preview', 'lose-preview', 'nomatch-preview');
    // Show inline hints on each row lane
    rows.forEach(r => {
      const hint = document.getElementById(r + '-preview-hint');
      if (!hint) return;
      const outcome = getPreviewOutcome(G.selectedCard, r);
      if (!outcome) return;
      if (outcome.wouldWin) {
        const est = calculateScore(G.selectedCard, r);
        const isClash = r === G.enemyRow;
        hint.className = 'row-preview-hint hint-win';
        hint.innerHTML = `≈${est} dmg${isClash ? ' ⚡' : ''}`;
      } else if (outcome.effectiveMatch) {
        const dmg = estimateIncomingDamage(G.selectedCard, r);
        hint.className = 'row-preview-hint hint-lose';
        hint.innerHTML = dmg.absorbed ? 'Absorb' : `−${dmg.afterShield} HP`;
      } else {
        const dmg = estimateIncomingDamage(G.selectedCard, r);
        hint.className = 'row-preview-hint hint-nomatch';
        hint.innerHTML = dmg.absorbed ? 'Absorb' : `−${dmg.afterShield} HP`;
      }
    });
    // Show a simple prompt in the panel
    panel.classList.add('active', 'nomatch-preview');
    panel.classList.remove('win-preview', 'lose-preview');
    panel.innerHTML = `<div style="text-align:center;color:var(--text-dim);font-size:11px;padding:2px 0;">Select a row to see full preview — scores shown on each lane above</div>`;
    return;
  }

  // Full preview: card + row selected
  const card = G.selectedCard;
  const row = G.selectedRow;
  const outcome = getPreviewOutcome(card, row);
  if (!outcome) { panel.classList.remove('active'); return; }

  panel.classList.add('active');
  panel.classList.toggle('win-preview', outcome.wouldWin);
  panel.classList.toggle('lose-preview', outcome.effectiveMatch && !outcome.wouldWin);
  panel.classList.toggle('nomatch-preview', !outcome.effectiveMatch);

  let html = '';

  if (outcome.wouldWin) {
    // ===== WIN PREVIEW =====
    const result = calculateScoreDetailed(card, row);
    let finalDmg = Math.max(1, result.total);
    const wouldCrownSurge = G.crownSurgeActive;
    if (wouldCrownSurge) finalDmg *= 2;
    const armorBlock = Math.min(finalDmg, G.enemy?.armor || 0);
    const actualDmg = finalDmg - armorBlock;
    const streak = (G.rowStreaks[row] || 0) + 1;
    const willSurge = streak >= 4 && !G.surgeFired[row];
    const suitReward = getSuitRewardPreview(card.suit);
    const emberGain = 1 + Math.floor(finalDmg / 20) + (hasRelic('molten_heart') ? 2 : 0);
    const clubsBonus = card.suit === 'clubs' ? 2 + G.act : 0;

    html += `<div class="preview-header">`;
    html += `<div class="preview-outcome win"><span class="outcome-icon">⚔️</span> WIN TRICK</div>`;
    html += `<div class="preview-damage">${actualDmg}</div>`;
    html += `</div>`;

    html += `<div class="preview-body">`;

    // Left column: score math
    html += `<div class="preview-row"><span class="pr-label">Chips</span><span class="pr-value chips">${result.chips}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">× Mult</span><span class="pr-value mult">${result.mult}×</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">= Score</span><span class="pr-value gold">${result.total}</span></div>`;

    // Right column: context
    const rowNames = { crown: '👑 Crown (×1.5 mult)', heart: '❤️ Heart (×1.5 chips)', foundation: '🛡️ Shield (+3 def)' };
    html += `<div class="preview-row"><span class="pr-label">Row</span><span class="pr-value">${rowNames[row]}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">Streak</span><span class="pr-value ${willSurge ? 'gold' : ''}">${streak}${willSurge ? ' → SURGE!' : ''}</span></div>`;

    if (armorBlock > 0) {
      html += `<div class="preview-row"><span class="pr-label">Armor blocks</span><span class="pr-value danger">−${armorBlock}</span></div>`;
    }
    if (wouldCrownSurge) {
      html += `<div class="preview-row"><span class="pr-label">Crown Surge</span><span class="pr-value gold">×2!</span></div>`;
    }

    html += `<div class="preview-row"><span class="pr-label">Embers</span><span class="pr-value ember">+${emberGain}</span></div>`;

    // Suit reward
    html += `<div class="preview-row"><span class="pr-label">Reward</span><span class="pr-value" style="color:${suitReward.color}">${suitReward.icon} ${suitReward.text}</span></div>`;

    html += `</div>`; // end body

    // Tags
    html += `<div class="preview-tags">`;
    if (outcome.isClash) html += `<span class="preview-tag clash">⚡ CLASH: Double reward</span>`;
    if (outcome.hasTrump) html += `<span class="preview-tag surge">TRUMP: Suit override</span>`;
    if (card.keywords.includes('Echo')) html += `<span class="preview-tag reward">Echo: Modifier carries</span>`;
    if (card.keywords.includes('Volatile')) html += `<span class="preview-tag danger-tag">Volatile: Card destroyed</span>`;
    if (card.keywords.includes('Fracture') && (G.enemy?.armor || 0) > 0) html += `<span class="preview-tag reward">Fracture: −${Math.min(G.enemy.armor, 10)} armor</span>`;
    if (card.suit === 'stars') html += `<span class="preview-tag" style="border-color:var(--stars);color:var(--stars)">⭐ Universal mod</span>`;
    if (willSurge) {
      const surgeNames = { crown: '👑 Crown Surge: Next ×2', heart: '❤️ Heart Surge: +chips', foundation: '🛡️ Shield Surge: +50% maxHP shield' };
      html += `<span class="preview-tag surge">${surgeNames[row]}</span>`;
    }
    if (G.enemy && actualDmg >= G.enemy.hp) html += `<span class="preview-tag surge">💀 LETHAL!</span>`;
    html += `</div>`;

  } else if (outcome.effectiveMatch) {
    // ===== LOSE (outranked) =====
    const dmg = estimateIncomingDamage(card, row);
    const resGain = 1 + (hasRelic('resilient_heart') ? 1 : 0);
    const foundationShield = row === 'foundation' ? 3 : 0;
    const streakResets = !card.keywords.includes('Anchor') && !(G.ascension >= 13);

    html += `<div class="preview-header">`;
    html += `<div class="preview-outcome lose"><span class="outcome-icon">💔</span> LOSE — Outranked</div>`;
    if (!dmg.absorbed) html += `<div class="preview-damage incoming">−${dmg.afterShield}</div>`;
    else html += `<div class="preview-damage" style="color:var(--clubs)">0</div>`;
    html += `</div>`;

    html += `<div class="preview-body">`;

    if (!dmg.absorbed) {
      html += `<div class="preview-row"><span class="pr-label">Enemy damage</span><span class="pr-value danger">${dmg.raw}</span></div>`;
      if (dmg.shieldUsed > 0) html += `<div class="preview-row"><span class="pr-label">Shield absorbs</span><span class="pr-value shield">−${dmg.shieldUsed}</span></div>`;
      html += `<div class="preview-row"><span class="pr-label">Net HP loss</span><span class="pr-value danger">−${dmg.afterShield}</span></div>`;
      html += `<div class="preview-row"><span class="pr-label">HP after</span><span class="pr-value ${(G.hp - dmg.afterShield) <= 0 ? 'danger' : ''}">${Math.max(0, G.hp - dmg.afterShield)} / ${G.maxHp}</span></div>`;
    } else {
      html += `<div class="preview-row"><span class="pr-label">Absorb</span><span class="pr-value bonus">No damage taken!</span></div>`;
    }

    html += `<div class="preview-row"><span class="pr-label">Resilience</span><span class="pr-value keyword">+${resGain}</span></div>`;
    if (foundationShield > 0) html += `<div class="preview-row"><span class="pr-label">Foundation</span><span class="pr-value shield">+${foundationShield} shield</span></div>`;

    html += `</div>`;

    html += `<div class="preview-tags">`;
    if (outcome.isClash) html += `<span class="preview-tag danger-tag">⚡ CLASH LOSS: +50% enemy dmg</span>`;
    if (streakResets && (G.rowStreaks[row] || 0) > 0) html += `<span class="preview-tag danger-tag">Streak ${row} resets → 0</span>`;
    if (card.keywords.includes('Phantom')) html += `<span class="preview-tag reward">Phantom: Card returns to hand</span>`;
    if (G.playerClass === 'chrome') html += `<span class="preview-tag reward">Chrome: +0.3× Calculated Risk</span>`;
    if (!dmg.absorbed && (G.hp - dmg.afterShield) <= 0) html += `<span class="preview-tag danger-tag">☠️ FATAL!</span>`;
    html += `</div>`;

  } else {
    // ===== OFF-SUIT (auto-lose) =====
    const dmg = estimateIncomingDamage(card, row);
    const resGain = 1 + (hasRelic('resilient_heart') ? 1 : 0);
    const foundationShield = row === 'foundation' ? 3 : 0;

    html += `<div class="preview-header">`;
    html += `<div class="preview-outcome nomatch"><span class="outcome-icon">✗</span> OFF-SUIT — Cannot win</div>`;
    if (!dmg.absorbed) html += `<div class="preview-damage incoming">−${dmg.afterShield}</div>`;
    else html += `<div class="preview-damage" style="color:var(--clubs)">0</div>`;
    html += `</div>`;

    html += `<div class="preview-body single-col">`;

    if (!dmg.absorbed) {
      html += `<div class="preview-row"><span class="pr-label">Enemy damage</span><span class="pr-value danger">${dmg.raw}${dmg.shieldUsed > 0 ? ' (−' + dmg.shieldUsed + ' shield)' : ''}</span></div>`;
      html += `<div class="preview-row"><span class="pr-label">HP after</span><span class="pr-value ${(G.hp - dmg.afterShield) <= 0 ? 'danger' : ''}">${Math.max(0, G.hp - dmg.afterShield)} / ${G.maxHp}</span></div>`;
    } else {
      html += `<div class="preview-row"><span class="pr-label">Absorb keyword</span><span class="pr-value bonus">No damage taken</span></div>`;
    }
    html += `<div class="preview-row"><span class="pr-label">Resilience</span><span class="pr-value keyword">+${resGain}</span></div>`;
    if (foundationShield > 0) html += `<div class="preview-row"><span class="pr-label">Foundation</span><span class="pr-value shield">+${foundationShield} shield</span></div>`;

    html += `</div>`;

    html += `<div class="preview-tags">`;
    if (outcome.isClash) html += `<span class="preview-tag danger-tag">⚡ CLASH: +50% enemy dmg</span>`;
    if (card.keywords.includes('Phantom')) html += `<span class="preview-tag reward">Phantom: Card returns</span>`;
    if (!dmg.absorbed && (G.hp - dmg.afterShield) <= 0) html += `<span class="preview-tag danger-tag">☠️ FATAL!</span>`;
    html += `</div>`;
  }

  panel.innerHTML = html;

  // Also update row hints when a row is selected (highlight comparison)
  rows.forEach(r => {
    const hint = document.getElementById(r + '-preview-hint');
    if (!hint) return;
    const rOutcome = getPreviewOutcome(G.selectedCard, r);
    if (!rOutcome) return;
    if (rOutcome.wouldWin) {
      const est = calculateScore(G.selectedCard, r);
      const isClash = r === G.enemyRow;
      hint.className = 'row-preview-hint hint-win';
      hint.innerHTML = r === row ? `► ${est}${isClash ? ' ⚡' : ''}` : `${est}${isClash ? ' ⚡' : ''}`;
    } else if (rOutcome.effectiveMatch) {
      const d = estimateIncomingDamage(G.selectedCard, r);
      hint.className = 'row-preview-hint hint-lose';
      hint.innerHTML = d.absorbed ? 'Absorb' : `−${d.afterShield} HP`;
    } else {
      const d = estimateIncomingDamage(G.selectedCard, r);
      hint.className = 'row-preview-hint hint-nomatch';
      hint.innerHTML = d.absorbed ? 'Absorb' : `−${d.afterShield} HP`;
    }
  });
}

function renderHand() {
  const container = document.getElementById('hand-cards');
  container.innerHTML = '';
  G.hand.forEach(card => {
    const matchesSuit = G.enemyCard && (card.suit === G.enemyCard.suit || card.suit === 'stars');
    const el = document.createElement('div');
    el.className = 'card ' + card.suit;
    if (G.selectedCard?.id === card.id) el.classList.add('selected');
    if (G.phase !== 'player_choose') el.classList.add('disabled');
    if (matchesSuit && G.phase === 'player_choose') el.style.boxShadow = '0 0 12px rgba(212,168,67,0.25)';

    el.innerHTML = `
      <div class="card-rank">${RANK_NAMES[card.rank]}</div>
      <div class="card-suit">${SUIT_SYMBOLS[card.suit]}</div>
      <div class="card-chips">${card.baseChips}♦ ${card.baseMult}×</div>
      ${card.keywords.length ? '<div class="card-keyword">'+card.keywords[0]+'</div>' : ''}
      ${matchesSuit && G.phase === 'player_choose' ? '<div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--gold)">match</div>' : ''}
      <div class="swipe-hint">⬆ swipe to play</div>
    `;

    // Click to select (desktop)
    el.addEventListener('click', () => selectCard(card.id));

    // Mobile touch handling: tap to select, long-press to inspect, swipe to play/deselect
    let pressTimer = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let longPressTriggered = false;
    let touchStartTime = 0;

    el.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchStartTime = Date.now();
      longPressTriggered = false;
      pressTimer = setTimeout(() => {
        longPressTriggered = true;
        showCardInspect(card);
      }, 500);
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      const moveX = Math.abs(e.touches[0].clientX - touchStartX);
      const moveY = Math.abs(e.touches[0].clientY - touchStartY);
      if (moveX > 10 || moveY > 10) {
        clearTimeout(pressTimer);
      }
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      clearTimeout(pressTimer);
      if (longPressTriggered) return;

      const touchEndY = e.changedTouches[0].clientY;
      const touchEndX = e.changedTouches[0].clientX;
      const diffY = touchStartY - touchEndY;
      const diffX = Math.abs(touchEndX - touchStartX);
      const elapsed = Date.now() - touchStartTime;

      if (diffY > 50 && diffX < 80 && G.selectedCard?.id === card.id && G.selectedRow) {
        // Swipe up = play card
        e.preventDefault();
        playCard();
      } else if (diffY < -50 && diffX < 80) {
        // Swipe down = deselect
        e.preventDefault();
        G.selectedCard = null;
        updateBattleUI();
      } else if (Math.abs(diffY) < 20 && diffX < 20 && elapsed < 400) {
        // Tap = select card
        e.preventDefault();
        selectCard(card.id);
      }
    });

    container.appendChild(el);
  });
}

// FEATURE 8: Card inspect (long-press)
function showCardInspect(card) {
  const overlay = document.getElementById('card-inspect-overlay');
  const detail = document.getElementById('card-inspect-detail');
  detail.innerHTML = `
    <div class="inspect-rank" style="color:${SUIT_COLORS[card.suit]}">${RANK_NAMES[card.rank]}</div>
    <div class="inspect-suit">${SUIT_SYMBOLS[card.suit]}</div>
    <div class="inspect-name">${card.name || ''}</div>
    <div class="inspect-stats">${card.baseChips}♦ chips  •  ${card.baseMult}× mult</div>
    <div style="font-size:11px;color:var(--text-dim);margin:4px 0">${card.rarity || 'common'}</div>
    ${card.keywords.length ? '<div class="inspect-keywords">' + card.keywords.join(' • ') + '</div>' : '<div style="font-size:11px;color:var(--text-dim)">No keywords</div>'}
    <div style="font-size:10px;color:var(--text-dim);margin-top:12px">Tap anywhere to close</div>
  `;
  overlay.classList.add('active');
}

function closeCardInspect() {
  document.getElementById('card-inspect-overlay').classList.remove('active');
}

function renderMatrix() {
  const list = document.getElementById('matrix-list');
  list.innerHTML = '';
  if (G.modifiers.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:12px;padding:16px">No modifiers yet.</div>';
    return;
  }
  ['inferno','flame','spark'].forEach(tier => {
    G.modifiers.filter(m => m.tier === tier).forEach(m => {
      const globalIdx = G.modifiers.indexOf(m);
      const isDisabled = globalIdx === G.enemy?.disabledModIdx;
      const el = document.createElement('div');
      el.className = 'mod-item ' + tier;
      if (isDisabled) el.style.opacity = '0.3';
      el.innerHTML = `
        <div class="mod-tier">${tier}${isDisabled ? ' (DISABLED)' : ''}</div>
        <div class="mod-name">${m.name}</div>
        <div class="mod-val">+${typeof m.value === 'number' ? (m.type === 'mult' ? m.value.toFixed(2) + '×' : m.value) : m.value} ${m.type === 'mult' ? 'mult' : 'chips'}${m.suit ? ' ('+m.suit+')' : ' (all)'}</div>
      `;
      list.appendChild(el);
    });
  });
}

function enableRowSelection(enable) {
  document.querySelectorAll('.row-lane').forEach(el => {
    if (enable) {
      el.classList.add('selectable');
      el.onclick = () => selectRow(el.dataset.row);
    } else {
      el.classList.remove('selectable', 'selected');
      el.onclick = null;
    }
  });
  if (enable) updateRowHighlight();
}

function updateRowHighlight() {
  document.querySelectorAll('.row-lane').forEach(el => el.classList.toggle('selected', el.dataset.row === G.selectedRow));
}

function clearRows() {
  ['crown','heart','foundation'].forEach(r => {
    document.getElementById(r + '-row-cards').innerHTML = '';
    document.getElementById(r + '-streak').textContent = '';
  });
}

function addMiniCard(row, card) {
  const container = document.getElementById(row + '-row-cards');
  const el = document.createElement('div');
  el.className = 'mini-card';
  el.style.color = SUIT_COLORS[card.suit];
  el.style.borderColor = getComputedSuitColor(card.suit);
  el.textContent = RANK_NAMES[card.rank];
  container.appendChild(el);
}

function getComputedSuitColor(suit) {
  return { hearts: '#e63946', diamonds: '#f4a300', clubs: '#2a9d8f', spades: '#6c5ce7', stars: '#f5c842' }[suit] || '#888';
}

function toggleMatrix() { document.getElementById('matrix-panel').classList.toggle('open'); }

function useResilience() {
  if (G.resilience >= 3) { G.resilience -= 3; G.shield += 5; spawnKeywordPopup('🔮 Resilience: +5 Shield!', 45); updateBattleUI(); }
}

function showHelp() { document.getElementById('help-overlay').style.display = 'flex'; }

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (G.phase === 'player_choose') {
    if (e.key === '1' || e.key === 'q') selectRow('crown');
    if (e.key === '2' || e.key === 'w') selectRow('heart');
    if (e.key === '3' || e.key === 'e') selectRow('foundation');
    if (e.key === 'Enter' || e.key === ' ') playCard();
  }
  if (e.key === 'm') toggleMatrix();
  if (e.key === 'b') { if (document.getElementById('burn-pile-overlay').classList.contains('active')) closeBurnPile(); else showBurnPile(); }
  if (e.key === 'Escape') {
    document.getElementById('help-overlay').style.display = 'none';
    document.getElementById('matrix-panel').classList.remove('open');
    document.getElementById('score-breakdown-overlay').classList.remove('active');
    closeBurnPile();
    closeCardInspect();
  }
});

window.selectRow = function(row) {
  if (G.phase !== 'player_choose') return;
  G.selectedRow = row;
  document.querySelectorAll('.row-lane').forEach(el => el.classList.toggle('selected', el.dataset.row === row));
  updateBattleUI();
};
