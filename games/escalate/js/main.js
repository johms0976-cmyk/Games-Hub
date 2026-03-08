// ============================================================
// TRICK ESCALATION ENGINE v6.0 — FULL OVERHAUL
// resolveTrick, Strategic AI, Keywords+Synergies, Archetypes,
// Score Spectacle, Audio System, Encounter Rework, Forge Redesign
// ============================================================

// ============================================================
// AUDIO SYSTEM — SFX + Ambient Score
// ============================================================
const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let currentMusic = null;
  let musicNodes = [];
  let initialized = false;
  let muted = false;
  let musicMuted = false;
  let comboBaseFreq = 440;

  function init() {
    if (initialized) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.7;
      sfxGain.connect(masterGain);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.15;
      musicGain.connect(masterGain);

      initialized = true;
    } catch(e) { console.warn('Audio init failed:', e); }
  }

  function ensureCtx() {
    if (!initialized) init();
    if (ctx?.state === 'suspended') ctx.resume();
  }

  // ---- SFX Primitives ----
  function playTone(freq, duration, type, gainVal, delay) {
    if (muted || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainVal || 0.3, ctx.currentTime + (delay || 0));
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (delay || 0) + duration);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(ctx.currentTime + (delay || 0));
    osc.stop(ctx.currentTime + (delay || 0) + duration);
  }

  function playNoise(duration, gainVal, delay) {
    if (muted || !ctx) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    gain.gain.setValueAtTime(gainVal || 0.15, ctx.currentTime + (delay || 0));
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (delay || 0) + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    source.start(ctx.currentTime + (delay || 0));
  }

  // ---- Named SFX ----
  function cardPlay(suit) {
    ensureCtx();
    const suitFreqs = { hearts: 523, diamonds: 587, clubs: 392, spades: 440, stars: 659 };
    const freq = suitFreqs[suit] || 440;
    playTone(freq, 0.08, 'triangle', 0.4);
    playNoise(0.04, 0.12);
    playTone(freq * 1.5, 0.06, 'sine', 0.15, 0.03);
  }

  function cardSelect() {
    ensureCtx();
    playTone(880, 0.05, 'sine', 0.15);
  }

  function trickWin(combo) {
    ensureCtx();
    // Escalating pitch based on combo
    const base = 440 + (combo || 0) * 40;
    comboBaseFreq = base;
    playTone(base, 0.12, 'triangle', 0.35);
    playTone(base * 1.25, 0.12, 'triangle', 0.3, 0.08);
    playTone(base * 1.5, 0.15, 'sine', 0.25, 0.16);
    // Shimmer on high combos
    if (combo >= 3) {
      playTone(base * 2, 0.2, 'sine', 0.12, 0.22);
      playTone(base * 2.5, 0.15, 'sine', 0.08, 0.28);
    }
  }

  function trickLose() {
    ensureCtx();
    comboBaseFreq = 440;
    playTone(220, 0.2, 'sawtooth', 0.15);
    playTone(180, 0.25, 'sawtooth', 0.12, 0.1);
  }

  function scoreSlam(score) {
    ensureCtx();
    if (!ctx) return;
    // The satisfying SLAM on score breakdown total
    const intensity = Math.min(1, score / 200);
    playNoise(0.15, 0.2 + intensity * 0.3);
    playTone(80 + intensity * 40, 0.3, 'sawtooth', 0.25 + intensity * 0.2);
    playTone(160 + intensity * 80, 0.15, 'square', 0.15 + intensity * 0.1, 0.02);
    // Bass thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4 + intensity * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  function breakdownStep(index, total) {
    ensureCtx();
    const progress = index / Math.max(total, 1);
    const freq = 300 + progress * 400;
    playTone(freq, 0.06, 'sine', 0.12 + progress * 0.1);
  }

  function phaseTransition() {
    ensureCtx();
    // Boss phase change — dramatic descending arpeggio then rising
    playTone(660, 0.15, 'sawtooth', 0.25);
    playTone(440, 0.15, 'sawtooth', 0.2, 0.12);
    playTone(330, 0.2, 'sawtooth', 0.25, 0.24);
    playNoise(0.25, 0.2, 0.24);
    // Rising resolution
    playTone(440, 0.12, 'triangle', 0.2, 0.5);
    playTone(554, 0.12, 'triangle', 0.2, 0.6);
    playTone(660, 0.2, 'triangle', 0.25, 0.7);
  }

  function encounterVictory() {
    ensureCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      playTone(f, 0.2, 'triangle', 0.25 - i * 0.03, i * 0.12);
      playTone(f * 0.5, 0.25, 'sine', 0.1, i * 0.12);
    });
    playNoise(0.1, 0.15, 0.48);
  }

  function encounterDefeat() {
    ensureCtx();
    const notes = [440, 370, 311, 261];
    notes.forEach((f, i) => {
      playTone(f, 0.3, 'sawtooth', 0.15, i * 0.15);
    });
  }

  function surgeTrigger(row) {
    ensureCtx();
    const freqs = { crown: [784, 988, 1175], heart: [659, 831, 988], foundation: [523, 659, 784] };
    const arp = freqs[row] || freqs.crown;
    arp.forEach((f, i) => {
      playTone(f, 0.15, 'triangle', 0.2, i * 0.08);
    });
    playNoise(0.08, 0.12, 0.24);
  }

  function forgeUpgrade() {
    ensureCtx();
    playTone(220, 0.15, 'sawtooth', 0.2);
    playTone(330, 0.12, 'triangle', 0.25, 0.1);
    playTone(440, 0.12, 'triangle', 0.25, 0.2);
    playTone(660, 0.2, 'sine', 0.2, 0.3);
    playNoise(0.1, 0.15, 0.3);
  }

  function relicPickup() {
    ensureCtx();
    playTone(880, 0.1, 'sine', 0.2);
    playTone(1100, 0.1, 'sine', 0.15, 0.08);
    playTone(1320, 0.15, 'sine', 0.12, 0.16);
  }

  function uiClick() {
    ensureCtx();
    playTone(600, 0.03, 'sine', 0.08);
  }

  function keywordTrigger() {
    ensureCtx();
    playTone(988, 0.08, 'sine', 0.12);
    playTone(1175, 0.06, 'sine', 0.08, 0.05);
  }

  function personalBest() {
    ensureCtx();
    // Fanfare!
    const fanfare = [523, 659, 784, 1047, 784, 1047, 1319];
    fanfare.forEach((f, i) => {
      playTone(f, 0.18, 'triangle', 0.2, i * 0.1);
    });
  }

  // TIER2v3-7: Boss entrance stinger — unique arpeggio per boss
  function bossStinger(notes) {
    ensureCtx();
    if (!notes || !ctx) return;
    // Dramatic bass rumble
    playTone(55, 0.6, 'sawtooth', 0.2);
    playNoise(0.3, 0.15, 0.1);
    // Stinger notes
    notes.forEach((f, i) => {
      playTone(f, 0.2, 'sawtooth', 0.2, 0.3 + i * 0.12);
      playTone(f * 0.5, 0.25, 'sine', 0.08, 0.3 + i * 0.12);
    });
    // Final impact
    playTone(55, 0.5, 'sine', 0.3, 0.3 + notes.length * 0.12);
    playNoise(0.15, 0.2, 0.3 + notes.length * 0.12);
  }

  // ---- Ambient Music System ----
  function startMusic(act) {
    if (musicMuted) return;
    stopMusic();
    ensureCtx();
    if (!ctx) return;

    const actConfigs = {
      1: { root: 55, scale: [0,2,3,7,8], tempo: 2.5, type: 'sine', filterFreq: 800 },
      2: { root: 49, scale: [0,3,5,7,10], tempo: 2.0, type: 'triangle', filterFreq: 1200 },
      3: { root: 44, scale: [0,1,5,7,8], tempo: 1.5, type: 'sawtooth', filterFreq: 600 },
    };
    const config = actConfigs[act] || actConfigs[1];

    // Pad drone
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    const droneFilter = ctx.createBiquadFilter();
    drone.type = 'sine';
    drone.frequency.value = config.root;
    droneGain.gain.value = 0.06;
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = config.filterFreq;
    drone.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(musicGain);
    drone.start();
    musicNodes.push(drone, droneGain, droneFilter);

    // Fifth drone
    const drone5 = ctx.createOscillator();
    const d5Gain = ctx.createGain();
    drone5.type = 'sine';
    drone5.frequency.value = config.root * 1.5;
    d5Gain.gain.value = 0.03;
    drone5.connect(d5Gain);
    d5Gain.connect(musicGain);
    drone5.start();
    musicNodes.push(drone5, d5Gain);

    // Slow arpeggiated melody
    const melodyOsc = ctx.createOscillator();
    const melGain = ctx.createGain();
    const melFilter = ctx.createBiquadFilter();
    melodyOsc.type = config.type;
    melGain.gain.value = 0.04;
    melFilter.type = 'lowpass';
    melFilter.frequency.value = config.filterFreq * 0.8;
    melodyOsc.connect(melFilter);
    melFilter.connect(melGain);
    melGain.connect(musicGain);
    melodyOsc.start();
    musicNodes.push(melodyOsc, melGain, melFilter);

    // Schedule melody notes
    let noteIndex = 0;
    const playMelody = () => {
      if (!melodyOsc || musicMuted) return;
      try {
        const semitone = config.scale[noteIndex % config.scale.length];
        const octave = Math.floor(noteIndex / config.scale.length) % 3;
        const freq = config.root * 2 * Math.pow(2, (semitone + octave * 12) / 12);
        melodyOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.3);
        melGain.gain.setTargetAtTime(0.02 + Math.random() * 0.03, ctx.currentTime, 0.1);
        noteIndex++;
        currentMusic = setTimeout(playMelody, config.tempo * 1000 + Math.random() * 500);
      } catch(e) {}
    };
    currentMusic = setTimeout(playMelody, 1000);
  }

  function stopMusic() {
    if (currentMusic) { clearTimeout(currentMusic); currentMusic = null; }
    musicNodes.forEach(node => {
      try { if (node.stop) node.stop(); node.disconnect(); } catch(e) {}
    });
    musicNodes = [];
  }

  function toggleMute() { muted = !muted; return muted; }
  function toggleMusic() { musicMuted = !musicMuted; if (musicMuted) stopMusic(); return musicMuted; }
  function isMuted() { return muted; }
  function isMusicMuted() { return musicMuted; }

  return {
    init, cardPlay, cardSelect, trickWin, trickLose, scoreSlam,
    breakdownStep, phaseTransition, encounterVictory, encounterDefeat,
    surgeTrigger, forgeUpgrade, relicPickup, uiClick, keywordTrigger,
    personalBest, startMusic, stopMusic, toggleMute, toggleMusic,
    isMuted, isMusicMuted, bossStinger, ensureCtx
  };
})();

// ===== DATA LOADING =====
let SUITS, SUIT_SYMBOLS, SUIT_COLORS, RANK_NAMES, CARD_NAMES_PREFIX, KEYWORDS, BATTLE_SUITS;
let KEYWORD_DESCRIPTIONS, KEYWORD_SYNERGIES, ARCHETYPE_DATA;
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
  KEYWORD_DESCRIPTIONS = cardsData.keywordDescriptions || {};
  KEYWORD_SYNERGIES = cardsData.keywordSynergies || {};
  ARCHETYPE_DATA = cardsData.archetypes || {};
  BATTLE_SUITS = cardsData.battleSuits;
  RELIC_POOL = relicsData;
  ASCENSION_DATA = ascensionData;
  ENEMY_DATA = enemiesData;

  // TIER3-11: Register cursed suit for Corruption mechanic rendering
  SUIT_SYMBOLS['cursed'] = '🌑';
  SUIT_COLORS['cursed'] = '#5a3d6a';
  KEYWORD_DESCRIPTIONS['Curse'] = 'Corrupted card. Cannot win tricks. Deals self-damage when played. Remove at Rest Sites.';

  buildAscensionMods();
  await loadProgressionData();
  updateMetaDisplay();
  // TIER1-REC2v4: Render daily challenge section
  renderDailyChallenge();
  // TIER2-REC5v6: Load accessibility preferences
  loadAccessibilityPrefs();
  // TIER3-REC13: Start title screen idle particles
  initTitleParticles();
}

// ============================================================
// TIER3-REC13: IDLE ANIMATION & POLISH LAYER
// Title screen floating particles, card hover lift, surge-ready glow
// ============================================================
let _titleParticleAnimId = null;
function initTitleParticles() {
  const screen = document.getElementById('title-screen');
  if (!screen) return;
  let canvas = document.getElementById('title-particle-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'title-particle-canvas';
    canvas.className = 'title-particle-canvas';
    screen.insertBefore(canvas, screen.firstChild);
  }
  canvas.width = screen.offsetWidth;
  canvas.height = screen.offsetHeight;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const MAX = 35;

  function spawnParticle() {
    particles.push({
      x: Math.random() * canvas.width,
      y: canvas.height + 10,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.5,
      life: 1.0,
      decay: 0.001 + Math.random() * 0.002,
      size: 1 + Math.random() * 2,
      hue: 35 + Math.random() * 20, // warm gold tones
    });
  }

  let lastSpawn = 0;
  function animate(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Spawn new particles slowly
    if (time - lastSpawn > 400 && particles.length < MAX) {
      spawnParticle();
      lastSpawn = time;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx + Math.sin(time * 0.001 + i) * 0.1;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0 || p.y < -10) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life * 0.4;
      ctx.fillStyle = `hsl(${p.hue}, 70%, ${55 + p.life * 25}%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    _titleParticleAnimId = requestAnimationFrame(animate);
  }
  _titleParticleAnimId = requestAnimationFrame(animate);

  // Resize observer
  const ro = new ResizeObserver(() => {
    canvas.width = screen.offsetWidth;
    canvas.height = screen.offsetHeight;
  });
  ro.observe(screen);
}

// ===== FEATURE 4: META-PROGRESSION =====
const META_KEY = 'tee_meta_v2';
const META_DEFAULTS = {
  totalRuns: 0, totalVictories: 0, totalLosses: 0,
  highestAscension: 0, unlockedAscension: 0,
  totalDamageAllTime: 0, relicsFound: [], cardsPlayed: 0, bestTrickScore: 0,
  tricksWonTotal: 0, bossesKilled: 0, elitesKilled: 0,
  forgeUpgrades: 0, cardsBurned: 0, trumpWins: 0,
  classWins: { ember: 0, chrome: 0, stellar: 0 },
  archetypeMaxLevels: {},
  victoryStreak: 0, // TIER1-REC4v4: Track consecutive victories
  // Unlock & Achievement tracking
  unlockedIds: [],
  achievementIds: [],
  achievementPoints: 0,
  // Collection: Codex & Bestiary
  codex: [],      // unique card name+suit+rarity combos seen
  bestiary: [],   // unique relic ids found
  enemyLog: [],   // unique enemy names defeated
  // Run-specific flags that get checked at end of run
  bestTrickEver: 0,
  // Progressive onboarding: stage 1-4 (1=beginner, 4+=full game)
  onboardingStage: 1,
  // TIER2-11: Balance Analytics
  analytics: {
    enemiesKilledByName: {},   // { name: count }
    totalDamageByEncounter: [], // [{ enemy, damage, act, result }] — last 50
    archetypeSelections: {},    // { archetypeKey: count }
    keywordTakeRates: {},      // { keyword: count }
    deathCauses: {},           // { enemyName: count }
    classPickRates: {},        // { className: count }
    avgRunLength: { total: 0, count: 0 },
    forgePathUsage: { boost: 0, resuit: 0, condition: 0 },
    rowWinRates: { crown: { wins: 0, plays: 0 }, heart: { wins: 0, plays: 0 }, foundation: { wins: 0, plays: 0 } },
    encounterRulesSeen: {},  // TIER2v5-4: { ruleKey: count }
  },
  // TIER2v4-7: Contextual help tooltip seen-flags
  tooltipsSeen: {},
  // TIER3-10: Combo Discovery Codex
  combosDiscovered: [],
};

function loadMeta() {
  try {
    // Try v2 first, then migrate v1
    let raw = localStorage.getItem(META_KEY);
    if (raw) {
      const loaded = { ...META_DEFAULTS, ...JSON.parse(raw) };
      // TIER2-11: Ensure analytics sub-object exists with all keys
      loaded.analytics = { ...META_DEFAULTS.analytics, ...(loaded.analytics || {}) };
      loaded.analytics.rowWinRates = { ...META_DEFAULTS.analytics.rowWinRates, ...(loaded.analytics.rowWinRates || {}) };
      // TIER2v4-7: Ensure tooltipsSeen exists
      loaded.tooltipsSeen = loaded.tooltipsSeen || {};
      // TIER3-10: Ensure combosDiscovered exists
      loaded.combosDiscovered = loaded.combosDiscovered || [];
      return loaded;
    }
    raw = localStorage.getItem('tee_meta_v1');
    if (raw) {
      const old = JSON.parse(raw);
      const migrated = { ...META_DEFAULTS, ...old };
      migrated.analytics = { ...META_DEFAULTS.analytics };
      saveMeta(migrated);
      return migrated;
    }
  } catch(e) {}
  return { ...META_DEFAULTS };
}
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch(e) {} }
let META = loadMeta();

// ============================================================
// TIER1-REC2v4: DAILY CHALLENGE SYSTEM — Seeded PRNG + Daily Runs
// ============================================================
const DAILY_KEY = 'tee_daily_v1';

// Mulberry32 seeded PRNG
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Generate a daily seed from date string
function getDailySeed() {
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return { seed: Math.abs(hash), dateStr };
}

// Get the daily challenge number (days since epoch reference)
function getDailyNumber() {
  const epoch = new Date('2025-01-01').getTime();
  const now = new Date();
  now.setHours(0,0,0,0);
  return Math.floor((now.getTime() - epoch) / 86400000);
}

// Daily challenge state
let _dailyChallenge = {
  active: false,
  seed: 0,
  dateStr: '',
  number: 0,
  rng: null, // seeded RNG function
  class: null,
  ascLevel: 0,
};

// Deterministic daily parameters from seed
function getDailyParams(seed) {
  const rng = mulberry32(seed);
  const classes = ['ember', 'chrome', 'stellar'];
  const classIdx = Math.floor(rng() * classes.length);
  const ascLevel = Math.min(Math.floor(rng() * (META.unlockedAscension + 1)), 20);
  return { class: classes[classIdx], ascLevel, rng };
}

// Load daily best scores
function loadDailyScores() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveDailyScore(dateStr, score, bestTrick) {
  try {
    const scores = loadDailyScores();
    const existing = scores[dateStr];
    if (!existing || score > existing.score) {
      scores[dateStr] = { score, bestTrick, timestamp: Date.now() };
      // Keep only last 30 days
      const keys = Object.keys(scores).sort().reverse();
      if (keys.length > 30) {
        keys.slice(30).forEach(k => delete scores[k]);
      }
      localStorage.setItem(DAILY_KEY, JSON.stringify(scores));
    }
  } catch(e) {}
}

function getDailyBest(dateStr) {
  const scores = loadDailyScores();
  return scores[dateStr] || null;
}

// Override Math.random with seeded version during daily challenge
let _originalRandom = null;
function enableSeededRandom(rng) {
  _originalRandom = Math.random;
  Math.random = rng;
}
function restoreRandom() {
  if (_originalRandom) {
    Math.random = _originalRandom;
    _originalRandom = null;
  }
}

function startDailyChallenge() {
  AudioEngine.init();
  AudioEngine.uiClick();
  clearRunState();

  const { seed, dateStr } = getDailySeed();
  const dailyNum = getDailyNumber();
  const params = getDailyParams(seed);

  _dailyChallenge = {
    active: true,
    seed,
    dateStr,
    number: dailyNum,
    rng: mulberry32(seed + 12345), // separate RNG for gameplay
    class: params.class,
    ascLevel: params.ascLevel,
  };

  // Enable seeded RNG
  enableSeededRandom(_dailyChallenge.rng);

  // Force class and ascension for daily
  initState(params.class);
  G.ascension = params.ascLevel;
  G._isDailyChallenge = true;
  G._dailyDateStr = dateStr;
  G._dailyNumber = dailyNum;

  META.totalRuns++;
  saveMeta(META);
  generateMap();

  // Show daily indicator
  const indicator = document.getElementById('daily-run-indicator');
  if (indicator) {
    indicator.textContent = '☀ DAILY #' + dailyNum;
    indicator.classList.add('visible');
  }

  showMap();
  setTimeout(() => showActTransitionFlavour(1), 400);
}

// Render daily challenge section on title screen
function renderDailyChallenge() {
  const container = document.getElementById('daily-challenge-section');
  if (!container) return;

  const { seed, dateStr } = getDailySeed();
  const dailyNum = getDailyNumber();
  const params = getDailyParams(seed);
  const best = getDailyBest(dateStr);

  const classNames = { ember: '🔥 Ember Dealer', chrome: '⚙️ Chrome Tactician', stellar: '⭐ Star Weaver' };
  const classLocked = params.class === 'stellar' && META.totalVictories < 3;

  container.innerHTML = `
    <div class="daily-challenge-badge">☀ Daily Challenge #${dailyNum}</div>
    <div class="daily-challenge-params">
      <span class="daily-param">${classNames[params.class] || params.class}</span>
      <span class="daily-param">Asc ${params.ascLevel}</span>
    </div>
    ${best ? '<div class="daily-best-score">Your Best: ' + best.score.toLocaleString() + ' pts · Best Trick: ' + best.bestTrick + '</div>' : '<div class="daily-best-score">Not attempted today</div>'}
    <button class="btn-daily" onclick="startDailyChallenge()" ${classLocked ? 'disabled title="Unlock Star Weaver first (3 wins)"' : ''}>
      ${classLocked ? '🔒 Locked Class' : 'Play Daily'}
    </button>
  `;
}

// ============================================================
// RUN PERSISTENCE SYSTEM — Save/Resume mid-run
// ============================================================
const RUN_STATE_KEY = 'tee_run_state_v1';

// TIER3-10: Throttled save — prevents excessive localStorage writes
let _lastSaveTime = 0;
let _saveThrottleTimer = null;
const SAVE_THROTTLE_MS = 5000; // 5 seconds minimum between saves

function _doSaveRunState() {
  try {
    const state = { ...G };
    if (state._uniqueSynergies instanceof Set) {
      state._uniqueSynergies = [...state._uniqueSynergies];
    }
    // TIER2-6: Convert round suits Set
    if (state._roundSuitsPlayed instanceof Set) {
      state._roundSuitsPlayed = [...state._roundSuitsPlayed];
    }
    state._savedAscension = getAscensionLevel();
    state._savedTimestamp = Date.now();
    localStorage.setItem(RUN_STATE_KEY, JSON.stringify(state));
    _lastSaveTime = Date.now();
  } catch(e) { console.warn('Run state save failed:', e); }
}

function saveRunState(force) {
  const now = Date.now();
  if (force || (now - _lastSaveTime >= SAVE_THROTTLE_MS)) {
    // Enough time has passed or forced — save immediately
    if (_saveThrottleTimer) { clearTimeout(_saveThrottleTimer); _saveThrottleTimer = null; }
    _doSaveRunState();
  } else if (!_saveThrottleTimer) {
    // Schedule a deferred save
    const delay = SAVE_THROTTLE_MS - (now - _lastSaveTime);
    _saveThrottleTimer = setTimeout(() => {
      _saveThrottleTimer = null;
      _doSaveRunState();
    }, delay);
  }
}

function loadRunState() {
  try {
    const raw = localStorage.getItem(RUN_STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // Restore Set from array
    if (Array.isArray(state._uniqueSynergies)) {
      state._uniqueSynergies = new Set(state._uniqueSynergies);
    } else {
      state._uniqueSynergies = new Set();
    }
    // TIER2-6: Restore round suits Set
    if (Array.isArray(state._roundSuitsPlayed)) {
      state._roundSuitsPlayed = new Set(state._roundSuitsPlayed);
    } else {
      state._roundSuitsPlayed = new Set();
    }
    return state;
  } catch(e) { console.warn('Run state load failed:', e); return null; }
}

function clearRunState() {
  try { localStorage.removeItem(RUN_STATE_KEY); } catch(e) {}
}

function hasRunState() {
  try { return !!localStorage.getItem(RUN_STATE_KEY); } catch(e) { return false; }
}

function resumeRun() {
  AudioEngine.init();
  AudioEngine.uiClick();
  const state = loadRunState();
  if (!state) { alert('No saved run found.'); return; }

  // Restore game state
  G = state;
  // Restore Set if it wasn't properly converted
  if (!(G._uniqueSynergies instanceof Set)) {
    G._uniqueSynergies = new Set(G._uniqueSynergies || []);
  }
  // TIER2-6: Restore round suits Set
  if (!(G._roundSuitsPlayed instanceof Set)) {
    G._roundSuitsPlayed = new Set(G._roundSuitsPlayed || []);
  }

  // Set ascension select to match saved value
  const ascSel = document.getElementById('ascension-select');
  if (ascSel && state._savedAscension !== undefined) {
    ascSel.value = state._savedAscension.toString();
  }

  // Resume at map screen
  showMap();
}

// Update title screen to show Continue Run button
function updateContinueButton() {
  const btn = document.getElementById('continue-run-btn');
  if (!btn) return;
  const state = loadRunState();
  if (state) {
    btn.style.display = 'inline-block';
    const timeAgo = Date.now() - (state._savedTimestamp || 0);
    const mins = Math.floor(timeAgo / 60000);
    let timeStr = mins < 60 ? mins + 'm ago' : Math.floor(mins / 60) + 'h ago';
    if (mins < 1) timeStr = 'just now';
    const classNames = { ember: 'Ember', chrome: 'Chrome', stellar: 'Stellar' };
    btn.innerHTML = `Continue Run <span class="continue-info">${classNames[state.playerClass] || '?'} · Act ${state.act} · ${timeStr}</span>`;
  } else {
    btn.style.display = 'none';
  }
}

// ============================================================
// PROGRESSIVE ONBOARDING SYSTEM
// Stage 1 (Run 1): Hearts/Diamonds only, no keywords, Crown row only
// Stage 2 (Run 2): +Clubs/Spades, all 3 rows unlocked
// Stage 3 (Run 3): Keywords introduced
// Stage 4+ (Run 4+): Full system (Stars suit, synergies, everything)
// ============================================================
function getOnboardingStage() {
  return Math.min(META.onboardingStage || 1, 4);
}

function advanceOnboarding() {
  const stage = getOnboardingStage();
  if (stage < 4) {
    META.onboardingStage = stage + 1;
    saveMeta(META);
  }
}

function getAvailableBattleSuits() {
  const stage = getOnboardingStage();
  if (stage <= 1) return ['hearts', 'diamonds'];
  return ['hearts', 'diamonds', 'clubs', 'spades']; // BATTLE_SUITS (no stars)
}

function getAvailableAllSuits() {
  const stage = getOnboardingStage();
  if (stage <= 1) return ['hearts', 'diamonds'];
  if (stage <= 3) return ['hearts', 'diamonds', 'clubs', 'spades'];
  return SUITS; // includes stars at stage 4+
}

function getAvailableRows() {
  const stage = getOnboardingStage();
  if (stage <= 1) return ['crown'];
  return ['crown', 'heart', 'foundation'];
}

function areKeywordsEnabled() {
  return getOnboardingStage() >= 3;
}

function areSynergiesEnabled() {
  return getOnboardingStage() >= 4;
}

// Contextual tooltips for newly unlocked mechanics
const ONBOARDING_INTROS = {
  1: {
    title: 'Welcome, Card Master!',
    lines: [
      'Match the enemy\'s suit with a higher rank to win tricks.',
      'Play on the <strong style="color:var(--crown-row)">Crown row</strong> to multiply your damage.',
      '<strong>♥ Hearts</strong> boost your multiplier. <strong>♦ Diamonds</strong> boost your chips.',
      'Win tricks to build your escalation engine!',
    ],
    hint: 'Tip: Focus on winning — your scores grow with every trick!',
  },
  2: {
    title: '⚔️ New Suits & Rows Unlocked!',
    lines: [
      '<strong style="color:var(--clubs)">♣ Clubs</strong> deal direct damage. <strong style="color:var(--spades)">♠ Spades</strong> reveal enemy cards.',
      'Two new rows: <strong style="color:var(--heart-row)">Heart</strong> (+chips per trick) and <strong style="color:var(--foundation-row)">Shield</strong> (defense).',
      'Win streaks on a row to trigger powerful <strong>Surges</strong>!',
    ],
    hint: 'Tip: Off-suit cards can\'t win but provide defense on Shield row!',
  },
  3: {
    title: '✨ Keywords Unlocked!',
    lines: [
      'Cards can now have <strong style="color:var(--gold)">Keywords</strong> — special abilities.',
      '<strong>Swift</strong> boosts chips, <strong>Burn</strong> triples on streaks, <strong>Echo</strong> carries modifiers...',
      'Rare+ cards carry keywords. Look for powerful combinations!',
    ],
    hint: 'Tip: Keywords are the key to explosive damage combos!',
  },
  4: {
    title: '🌟 Full System Unlocked!',
    lines: [
      'The <strong style="color:var(--stars)">⭐ Stars</strong> suit is now available — it matches any suit!',
      '<strong>Keyword Synergies</strong> are active — pair keywords for bonus effects.',
      'All archetypes, forge mechanics, and advanced systems are online.',
      'Master the escalation engine and push your scores to the limit!',
    ],
    hint: 'You\'ve graduated! The full depth of the game awaits.',
  },
};

function showOnboardingIntro(stage) {
  const intro = ONBOARDING_INTROS[stage];
  if (!intro) return;

  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  document.getElementById('onboarding-title').textContent = intro.title;
  document.getElementById('onboarding-text').innerHTML = intro.lines.map(l =>
    `<div class="onboarding-line">${l}</div>`
  ).join('');
  document.getElementById('onboarding-hint').textContent = intro.hint;

  // Stage indicator
  const indicator = document.getElementById('onboarding-stage-indicator');
  indicator.innerHTML = '';
  for (let i = 1; i <= 4; i++) {
    const dot = document.createElement('div');
    dot.className = 'onboarding-stage-dot' + (i === stage ? ' active' : i < stage ? ' done' : '');
    dot.title = 'Stage ' + i;
    indicator.appendChild(dot);
  }

  overlay.classList.add('active');
}

function dismissOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.classList.remove('active');
  // BUGFIX: Flush any deferred contextual tips
  if (G._deferContextualTips) {
    G._deferContextualTips = false;
    const pending = G._pendingTips || [];
    G._pendingTips = [];
    setTimeout(() => {
      pending.forEach(t => showContextualTip(t.tipKey, t.dataFn));
    }, 400);
  }
}

// ===== PROGRESSION DATA =====
let UNLOCK_DATA = [];
let ACHIEVEMENT_DATA = [];

async function loadProgressionData() {
  try {
    const resp = await fetch('data/progression.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    UNLOCK_DATA = data.unlocks || [];
    ACHIEVEMENT_DATA = data.achievements || [];
  } catch(e) {
    console.warn('Progression data load failed, using inline fallback:', e);
    UNLOCK_DATA = [];
    ACHIEVEMENT_DATA = [];
    // TIER3-13: Show fallback UI notification
    setTimeout(() => {
      const notice = document.createElement('div');
      notice.className = 'progression-load-warning';
      notice.innerHTML = '⚠️ Progression data unavailable — unlocks & achievements disabled this session. <button onclick="this.parentElement.remove()">Dismiss</button>';
      document.body.appendChild(notice);
    }, 1000);
  }
}

// ===== UNLOCK ENGINE =====
function getUnlockedRelics() {
  return UNLOCK_DATA
    .filter(u => u.reward.type === 'relic' && META.unlockedIds.includes(u.id))
    .map(u => u.reward.data);
}

function getUnlockedEvents() {
  return UNLOCK_DATA
    .filter(u => u.reward.type === 'event' && META.unlockedIds.includes(u.id))
    .map(u => u.reward.data);
}

function getUnlockedKeywords() {
  return UNLOCK_DATA
    .filter(u => u.reward.type === 'keyword' && META.unlockedIds.includes(u.id))
    .map(u => u.reward.data);
}

function checkUnlockCondition(cond) {
  switch(cond.type) {
    case 'win_with_archetype': {
      const lead = getLeadArchetype();
      return lead && lead.key === cond.archetype;
    }
    case 'total_runs': return META.totalRuns >= cond.value;
    case 'total_victories': return META.totalVictories >= cond.value;
    case 'total_losses': return META.totalLosses >= cond.value;
    case 'total_damage': return META.totalDamageAllTime >= cond.value;
    case 'highest_ascension': return META.highestAscension >= cond.value;
    case 'beat_ascension': return META.highestAscension >= cond.value;
    case 'cards_played': return META.cardsPlayed >= cond.value;
    case 'forge_upgrades': return META.forgeUpgrades >= cond.value;
    case 'cards_burned': return META.cardsBurned >= cond.value;
    case 'best_trick': return META.bestTrickScore >= cond.value;
    case 'perfect_run': return G.tricksLost === 0 && G.tricksWon > 0;
    case 'win_low_hp': return G.hp <= cond.value && G.hp > 0;
    case 'tricks_in_run': return G.tricksWon >= cond.value;
    case 'all_archetypes_active': {
      if (!G.archetypeProgress) return false;
      return Object.values(G.archetypeProgress).every(v => v >= cond.value);
    }
    case 'achievements_earned': return META.achievementIds.length >= cond.value;
    default: return false;
  }
}

function processUnlocks(isVictory) {
  const newUnlocks = [];
  UNLOCK_DATA.forEach(u => {
    if (META.unlockedIds.includes(u.id)) return;
    // Some unlocks only apply on victory
    const needsVictory = ['win_with_archetype','perfect_run','win_low_hp'].includes(u.condition.type);
    if (needsVictory && !isVictory) return;
    if (checkUnlockCondition(u.condition)) {
      META.unlockedIds.push(u.id);
      newUnlocks.push(u);
    }
  });
  return newUnlocks;
}

// ===== ACHIEVEMENT ENGINE =====
function checkAchievementCondition(cond) {
  switch(cond.type) {
    case 'tricks_won_total': return META.tricksWonTotal >= cond.value;
    case 'best_trick': return META.bestTrickScore >= cond.value;
    case 'total_victories': return META.totalVictories >= cond.value;
    case 'total_runs': return META.totalRuns >= cond.value;
    case 'highest_ascension': return META.highestAscension >= cond.value;
    case 'total_damage': return META.totalDamageAllTime >= cond.value;
    case 'cards_played': return META.cardsPlayed >= cond.value;
    case 'archetype_level': {
      const maxLvl = META.archetypeMaxLevels[cond.archetype] || 0;
      return maxLvl >= cond.value;
    }
    case 'all_archetypes_active': {
      if (!G.archetypeProgress) return false;
      return Object.values(G.archetypeProgress).every(v => v >= cond.value);
    }
    case 'relics_in_run': return G.relics && G.relics.length >= cond.value;
    case 'modifiers_active': return G.modifiers && G.modifiers.length >= cond.value;
    case 'win_streak': return G.consecutiveWins >= cond.value;
    case 'perfect_encounter': return G._perfectEncounter === true;
    case 'perfect_run': return G.tricksLost === 0 && G.tricksWon > 0;
    case 'win_low_hp': return G.hp <= cond.value && G.hp > 0;
    case 'win_as_class': return META.classWins[cond.class] > 0;
    case 'win_all_classes': return META.classWins.ember > 0 && META.classWins.chrome > 0 && META.classWins.stellar > 0;
    case 'trump_wins': return META.trumpWins >= cond.value;
    case 'synergies_in_run': return (G._uniqueSynergies || new Set()).size >= cond.value;
    case 'burn_pile_size': return G.burnPile && G.burnPile.length >= cond.value;
    case 'deck_size': return G.deck && G.deck.length >= cond.value;
    case 'win_small_deck': return G.deck && G.deck.length <= cond.value;
    case 'codex_cards': return META.codex.length >= cond.value;
    case 'bestiary_relics': return META.bestiary.length >= cond.value;
    case 'bestiary_all_relics': {
      const totalRelics = RELIC_POOL.length + getUnlockedRelics().length;
      return META.bestiary.length >= totalRelics;
    }
    case 'max_shield': return G.shield >= cond.value;
    case 'bosses_killed': return META.bossesKilled >= cond.value;
    case 'elites_killed': return META.elitesKilled >= cond.value;
    case 'all_surges': return G.surgeFired && G.surgeFired.crown && G.surgeFired.heart && G.surgeFired.foundation;
    case 'total_losses': return META.totalLosses >= cond.value;
    default: return false;
  }
}

function processAchievements() {
  const newAchievements = [];
  ACHIEVEMENT_DATA.forEach(a => {
    if (META.achievementIds.includes(a.id)) return;
    if (checkAchievementCondition(a.condition)) {
      META.achievementIds.push(a.id);
      META.achievementPoints += a.points;
      newAchievements.push(a);
    }
  });
  return newAchievements;
}

// ===== ACHIEVEMENT NOTIFICATION =====
let achievementQueue = [];
let achievementShowing = false;

function queueAchievementNotification(achievement) {
  achievementQueue.push(achievement);
  if (!achievementShowing) showNextAchievement();
}

function showNextAchievement() {
  if (achievementQueue.length === 0) { achievementShowing = false; return; }
  achievementShowing = true;
  const a = achievementQueue.shift();
  const el = document.getElementById('achievement-notification');
  if (!el) { achievementShowing = false; return; }
  el.querySelector('.achv-icon').textContent = a.icon;
  el.querySelector('.achv-name').textContent = a.name || a.reward?.data?.name || 'Unlocked!';
  el.querySelector('.achv-desc').textContent = a.desc || '';
  const isUnlock = !!a.reward;
  el.querySelector('.achv-label').textContent = isUnlock ? '🔓 UNLOCKED' : '🏆 ACHIEVEMENT';
  el.querySelector('.achv-points').textContent = isUnlock ? '' : `+${a.points} pts`;
  el.classList.add('active');
  AudioEngine.ensureCtx?.();
  AudioEngine.relicPickup?.();
  setTimeout(() => {
    el.classList.remove('active');
    setTimeout(() => showNextAchievement(), 300);
  }, 2800);
}

// ===== CODEX & BESTIARY TRACKING =====
function trackCardInCodex(card) {
  const key = `${card.suit}|${card.rank}|${card.rarity}|${card.keywords.sort().join(',')}`;
  if (!META.codex.includes(key)) {
    META.codex.push(key);
  }
}

function trackRelicInBestiary(relic) {
  if (!META.bestiary.includes(relic.id)) {
    META.bestiary.push(relic.id);
  }
}

function trackEnemyDefeated(enemy) {
  if (!META.enemyLog.includes(enemy.name)) {
    META.enemyLog.push(enemy.name);
  }
}

// ===== INTEGRATED CHECK: Called after key events =====
function runProgressionChecks(context) {
  // Check achievements
  const newAchievements = processAchievements();
  newAchievements.forEach(a => queueAchievementNotification(a));

  // Check unlocks on run end
  if (context === 'run_end_victory' || context === 'run_end_defeat') {
    const isVictory = context === 'run_end_victory';
    const newUnlocks = processUnlocks(isVictory);
    newUnlocks.forEach(u => queueAchievementNotification(u));
  }

  saveMeta(META);
}

function updateMetaDisplay() {
  const el = document.getElementById('meta-stats');
  const unlockCount = META.unlockedIds.length;
  const achvCount = META.achievementIds.length;
  el.innerHTML = `<span>Runs: <span class="meta-val">${META.totalRuns}</span></span>
    <span>Wins: <span class="meta-val">${META.totalVictories}</span></span>
    <span>Best Asc: <span class="meta-val">${META.highestAscension}</span></span>
    <span class="meta-achv-badge" onclick="showProgressionScreen()" title="Achievements & Unlocks">🏆 ${achvCount} | 🔓 ${unlockCount}</span>`;

  const stellarCard = document.getElementById('class-stellar');
  if (META.totalVictories >= 3) stellarCard.classList.remove('locked');

  const ascBar = document.getElementById('ascension-bar');
  const ascSel = document.getElementById('ascension-select');
  if (META.unlockedAscension > 0) {
    ascBar.style.display = 'flex';
    ascSel.innerHTML = '<option value="0">None</option>';
    for (let i = 1; i <= META.unlockedAscension; i++) {
      ascSel.innerHTML += `<option value="${i}">Level ${i}</option>`;
    }
  }

  // Onboarding stage badge on title screen
  const stageBadge = document.getElementById('title-stage-badge');

  // TIER1-REC1: Update continue button
  updateContinueButton();
  if (stageBadge) {
    const stage = getOnboardingStage();
    const stageInfo = {
      1: { label: 'Beginner', desc: '♥♦ Hearts & Diamonds · Crown Row', color: '#e63946' },
      2: { label: 'Apprentice', desc: '♥♦♣♠ All Suits · 3 Rows', color: '#2a9d8f' },
      3: { label: 'Adept', desc: 'Keywords Active · All Suits · 3 Rows', color: '#6c5ce7' },
      4: { label: 'Master', desc: 'Full Game — All Systems Online', color: 'var(--gold)' },
    };
    const info = stageInfo[stage] || stageInfo[4];
    if (stage < 4) {
      stageBadge.innerHTML = `<span class="stage-label" style="color:${info.color}">Stage ${stage}: ${info.label}</span><span class="stage-desc">${info.desc}</span>`;
      stageBadge.style.display = 'block';
    } else {
      stageBadge.style.display = 'none'; // Hide once fully unlocked
    }
  }
}

// ===== FEATURE 3: ASCENSION SYSTEM =====
let ASCENSION_MODS = [];

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
    level: entry.level, desc: entry.desc,
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

// ===== GAME STATE =====
let G = {};

function initState(playerClass) {
  const asc = getAscensionLevel();
  let startHp = playerClass === 'ember' ? 100 : playerClass === 'stellar' ? 95 : 90;
  if (asc >= 2) startHp -= 10;
  if (asc >= 16) startHp -= 20;

  G = {
    playerClass,
    hp: startHp, maxHp: startHp,
    ink: 0, embers: 0,
    deck: [], hand: [], burnPile: [],
    modifiers: [], relics: [],
    revealedEnemyCards: [],
    act: 1, ascension: asc,
    mapNodes: [], mapConnections: [],
    currentNode: -1,
    totalDamage: 0, tricksWon: 0, tricksLost: 0,
    encountersWon: 0, roundScore: 0,
    rowStreaks: { crown: 0, heart: 0, foundation: 0 },
    selectedCard: null, selectedRow: null,
    enemy: null, roundNum: 0, trickNum: 0,
    tricksPerRound: 3, enemyCard: null,
    phase: 'idle',
    consecutiveWins: 0, shield: 0,
    echoNextTrick: false, echoSuit: null,
    resilience: 0, enemyRow: null, playerLeads: false,
    surgeFired: { crown: false, heart: false, foundation: false },
    crownSurgeActive: false, trumpSuit: null,
    // NEW: Archetype tracking
    archetypeProgress: {},
    bestTrickThisRun: 0,
    // Progression tracking for this run
    _perfectEncounter: true,
    _uniqueSynergies: new Set(),
    _maxStreakThisRun: 0,
    // TIER1-2: Sacrifice system — lose tricks to charge a vengeance multiplier
    sacrificeCharge: 0,
    crownGambitStored: 0, // stored damage from Crown losses
    // TIER1-3: Encounter format tracking
    encounterFormat: 'standard', // 'standard', 'gauntlet', 'puzzle', 'bid'
    gauntletWave: 0,
    gauntletMaxWaves: 5,
    puzzleTargetWins: 0,
    puzzleTricksDone: 0,
    puzzleTricksWon: 0,
    bidPrediction: -1,
    bidLevel: 0, // TIER2v5-7: Bid difficulty tier (1-4)
    bidTricksWon: 0,
    // TIER1-4: UI state
    modStripExpanded: false,
    // TIER1-REC4: Encounter rule state
    _activeEncounterRule: null,
    _encounterSuitsPlayed: null,
    _lastRowPlayed: null,
    _countdownRounds: 0,
    _rotationSuits: null,
    _rotationIdx: 0,
    // TIER1-REC5: Competitive row power states
    heartChipDoubler: false,    // Heart streak 4: doubles all chip mods for encounter
    shieldBreakerReady: false,  // Shield streak 4: next win converts shield to damage
    // TIER1-REC5v3: Mid-run disruption events
    _disruptionTriggeredAct2: false,
    _disruptionTriggeredAct3: false,
    _nodesCompletedThisAct: 0,
    _activeDisruption: null,   // current disruption effect key (if any)
    _betrayalDmgBoost: 0,     // encounters remaining with ×1.5 incoming damage
    // TIER2-REC4v6: Encounter pacing — progressive wrinkle escalation
    _combatEncounterIndex: 0,  // How many combat encounters completed this run
    // TIER3-REC9: Run insights tracking
    _offSuitLosses: 0,         // Count of tricks lost to off-suit plays
    _vengeanceTriggers: 0,     // Count of Vengeance ×2.5 activations
    _surgesTriggered: [],      // Which row surges fired ['crown', 'heart', etc]
    _bestTrickRow: null,       // Row of the best trick
    _bestTrickKeywords: [],    // Keywords on the best trick card
    _bestTrickModifiers: [],   // Active modifier names during best trick
    _nearMissSurges: [],       // Rows that reached streak 3 but never surged
    _bossPhasesSeen: [],       // Boss phase names encountered
    _maxRowStreaks: { crown: 0, heart: 0, foundation: 0 }, // Max streak per row this run
    // REC1-v7: Loss reason tracking for run insights
    _lossReasonCounts: { offsuit: 0, outranked: 0, cursed: 0 },
    _lastLossReason: '',
    // REC6-v7: Mid-battle twist state
    _crowdFavoriteActive: false,
    _desperateSurgeRound: false,
    _desperateSurgeWins: 0,
  };

  // Initialize archetype progress
  Object.keys(ARCHETYPE_DATA).forEach(k => { G.archetypeProgress[k] = 0; });

  if (playerClass === 'ember') {
    G.modifiers.push({ name: 'Hearts Spark', suit: 'hearts', type: 'mult', value: 0.1, tier: 'spark', persistent: false });
  } else if (playerClass === 'stellar') {
    // Stars suit only available at stage 4+; use hearts spark at earlier stages
    if (getOnboardingStage() >= 4) {
      G.modifiers.push({ name: 'Star Spark', suit: 'stars', type: 'mult', value: 0.15, tier: 'spark', persistent: false });
    } else {
      G.modifiers.push({ name: 'Hearts Spark', suit: 'hearts', type: 'mult', value: 0.1, tier: 'spark', persistent: false });
    }
  } else {
    // Chrome: clubs only available at stage 2+; use hearts at stage 1
    if (getOnboardingStage() >= 2) {
      G.modifiers.push({ name: 'Clubs Spark', suit: 'clubs', type: 'mult', value: 0.1, tier: 'spark', persistent: false });
    } else {
      G.modifiers.push({ name: 'Hearts Spark', suit: 'hearts', type: 'mult', value: 0.1, tier: 'spark', persistent: false });
    }
  }

  buildStartingDeck();
}

function buildStartingDeck() {
  G.deck = [];
  const stage = getOnboardingStage();
  let bias;

  if (stage <= 1) {
    // Stage 1: hearts and diamonds only
    bias = ['hearts','diamonds','hearts','diamonds','hearts','diamonds'];
  } else if (G.playerClass === 'stellar') {
    bias = stage >= 4
      ? ['stars','hearts','stars','diamonds','clubs','spades','stars']
      : ['hearts','diamonds','hearts','diamonds','clubs','spades'];
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

  // TIER3-11: Corruption mechanic — inject Cursed cards at Ascension 18+
  const asc = getAscensionLevel();
  if (asc >= 18) {
    const numCursed = asc >= 19 ? 3 : 2;
    for (let i = 0; i < numCursed; i++) {
      G.deck.push(makeCorruptedCard());
    }
  }

  shuffleArray(G.deck);
}

// TIER3-11: Create a Corrupted card — rank 1, no useful suit, keyword Curse
function makeCorruptedCard() {
  const id = 'cursed_' + Math.random().toString(36).slice(2, 9);
  return {
    id,
    suit: 'cursed',
    rank: 1,
    name: '🌑 Corrupted Card',
    baseChips: 0,
    baseMult: 0,
    keywords: ['Curse'],
    rarity: 'cursed',
    _isCursed: true,
  };
}

function makeCard(suit, rank, rarity) {
  rarity = rarity || (Math.random() < 0.6 ? 'common' : Math.random() < 0.8 ? 'uncommon' : 'rare');
  const rarityBonus = { common: 0, uncommon: 2, rare: 4, epic: 8, legendary: 15 };
  const rarityMult = { common: 1.0, uncommon: 1.1, rare: 1.3, epic: 1.5, legendary: 2.0 };
  const prefixes = CARD_NAMES_PREFIX[suit];
  const name = prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + RANK_NAMES[rank];
  let keywords = [];

  // Only assign keywords if onboarding stage allows them
  if (areKeywordsEnabled()) {
    if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') {
      keywords.push(KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)]);
    }
    if (rarity === 'legendary' && Math.random() < 0.5) {
      const second = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
      if (!keywords.includes(second)) keywords.push(second);
    }
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

// Onboarding-aware random suit picker
function randomBattleSuit() {
  const suits = getAvailableBattleSuits();
  return suits[Math.floor(Math.random() * suits.length)];
}

// Onboarding-aware random suit picker (all suits including stars)
function randomSuit() {
  const suits = getAvailableAllSuits();
  return suits[Math.floor(Math.random() * suits.length)];
}

function hasRelic(id) { return G.relics.some(r => r.id === id); }

// ============================================================
// 2.2 BUILD ARCHETYPE SYSTEM
// ============================================================
function getArchetypeProgress(card) {
  const results = {};
  Object.entries(ARCHETYPE_DATA).forEach(([key, arch]) => {
    let points = 0;
    card.keywords.forEach(kw => { if (arch.keywords.includes(kw)) points++; });
    if (arch.suits.includes(card.suit)) points++;
    if (points > 0) results[key] = points;
  });
  return results;
}

function updateArchetypeOnWin(card) {
  const progress = getArchetypeProgress(card);
  Object.entries(progress).forEach(([key, pts]) => {
    G.archetypeProgress[key] = (G.archetypeProgress[key] || 0) + pts;
  });
}

function getActiveArchetypeMilestones() {
  const active = [];
  Object.entries(ARCHETYPE_DATA).forEach(([key, arch]) => {
    const progress = G.archetypeProgress[key] || 0;
    arch.milestones.forEach(m => {
      if (progress >= m.threshold) active.push({ archetype: key, ...m });
    });
  });
  return active;
}

function hasArchetypeMilestone(type) {
  return getActiveArchetypeMilestones().some(m => m.type === type);
}

function getLeadArchetype() {
  let best = null, bestScore = 0;
  Object.entries(G.archetypeProgress).forEach(([key, val]) => {
    if (val > bestScore) { bestScore = val; best = key; }
  });
  return best && bestScore > 0 ? { key: best, ...ARCHETYPE_DATA[best], progress: bestScore } : null;
}

// ============================================================
// 2.1 KEYWORD SYNERGY SYSTEM
// ============================================================
function getKeywordSynergies(card) {
  if (!areSynergiesEnabled()) return [];
  if (!card.keywords || card.keywords.length < 2) return [];
  const synergies = [];
  for (let i = 0; i < card.keywords.length; i++) {
    for (let j = i + 1; j < card.keywords.length; j++) {
      const k1 = card.keywords[i], k2 = card.keywords[j];
      const combo = KEYWORD_SYNERGIES[k1 + '+' + k2] || KEYWORD_SYNERGIES[k2 + '+' + k1];
      if (combo) synergies.push(combo);
    }
  }
  return synergies;
}

// ============================================================
// TIER3-10: COMBO DISCOVERY CODEX
// Named combos that reward specific modifier + keyword + state combinations
// ============================================================
const COMBO_DEFINITIONS = [
  {
    id: 'underdogs_gambit',
    name: "The Underdog's Gambit",
    desc: 'Win with Vengeance active using a rank ≤5 card',
    icon: '🎲',
    check: (ctx) => ctx.vengeanceApplied && ctx.pCard.rank <= 5 && ctx.playerWins,
  },
  {
    id: 'inferno_cascade',
    name: 'Inferno Cascade',
    desc: 'Deal 100+ damage with an Inferno-tier modifier active',
    icon: '🌋',
    check: (ctx) => ctx.playerWins && ctx.finalDmg >= 100 && G.modifiers.some(m => m.tier === 'inferno'),
  },
  {
    id: 'crown_emperor',
    name: 'Crown Emperor',
    desc: 'Win on Crown row with Crown Surge and a Crown keyword card',
    icon: '👑',
    check: (ctx) => ctx.playerWins && ctx.row === 'crown' && ctx.crownSurgeApplied && ctx.pCard.keywords.includes('Crown'),
  },
  {
    id: 'phoenix_strike',
    name: 'Phoenix Strike',
    desc: 'Win with a Burn card while HP is below 30%',
    icon: '🔥',
    check: (ctx) => ctx.playerWins && ctx.pCard.keywords.includes('Burn') && G.hp < G.maxHp * 0.3,
  },
  {
    id: 'ghost_sovereign',
    name: 'Ghost Sovereign',
    desc: 'Activate the Ghost Gambler synergy (Phantom + Gambit)',
    icon: '👻',
    check: (ctx) => ctx.ghostGambler,
  },
  {
    id: 'iron_fortress',
    name: 'Iron Fortress',
    desc: 'Win on Foundation with 15+ shield',
    icon: '🏰',
    check: (ctx) => ctx.playerWins && ctx.row === 'foundation' && G.shield >= 15,
  },
  {
    id: 'stars_aligned',
    name: 'Stars Aligned',
    desc: 'Win a trick with a Stars suit card that has 2+ keywords',
    icon: '⭐',
    check: (ctx) => ctx.playerWins && ctx.pCard.suit === 'stars' && ctx.pCard.keywords.length >= 2,
  },
  {
    id: 'vengeance_surge',
    name: 'Vengeance Surge',
    desc: 'Combine Vengeance ×2.5 with Crown Surge ×2',
    icon: '⚡',
    check: (ctx) => ctx.playerWins && ctx.vengeanceApplied && ctx.crownSurgeApplied,
  },
  {
    id: 'heart_engine',
    name: 'Heart Engine',
    desc: 'Win 3+ consecutive tricks on the Heart row',
    icon: '❤️',
    check: (ctx) => ctx.playerWins && ctx.row === 'heart' && (G.rowStreaks.heart || 0) >= 3,
  },
  {
    id: 'trump_master',
    name: 'Trump Master',
    desc: 'Win via trump suit override with a rank ≤6 card',
    icon: '🃏',
    check: (ctx) => ctx.playerWins && ctx.isTrump && ctx.pCard.rank <= 6,
  },
  {
    id: 'streak_breaker',
    name: 'Streak Breaker',
    desc: 'Deal 50+ damage with a streak of 4+',
    icon: '🔗',
    check: (ctx) => ctx.playerWins && ctx.finalDmg >= 50 && G.consecutiveWins >= 4,
  },
  {
    id: 'gambit_royale',
    name: 'Gambit Royale',
    desc: 'Win with a Gambit card on Crown row for ×4 total (Gambit ×2 + Crown)',
    icon: '💎',
    check: (ctx) => ctx.playerWins && ctx.pCard.keywords.includes('Gambit') && ctx.row === 'crown',
  },
  {
    id: 'anchor_wall',
    name: 'Anchor Wall',
    desc: 'Lose a trick with Anchor keyword and 10+ shield',
    icon: '⚓',
    check: (ctx) => !ctx.playerWins && ctx.pCard.keywords.includes('Anchor') && G.shield >= 10,
  },
  {
    id: 'siphon_siege',
    name: 'Siphon Siege',
    desc: 'Steal 10+ armor with Siphon keyword',
    icon: '🔮',
    check: (ctx) => ctx.playerWins && ctx.siphonChips >= 10,
  },
  {
    id: 'clutch_victory',
    name: 'Clutch Victory',
    desc: 'Deal lethal damage to a boss while below 10 HP',
    icon: '💀',
    check: (ctx) => ctx.playerWins && G.hp <= 10 && G.enemy.tier === 'boss' && (G.enemy.hp - ctx.finalDmg) <= 0,
  },
];

function checkComboDiscovery(ctx) {
  if (META.onboardingStage < 3) return; // Only after core mechanics are learned
  COMBO_DEFINITIONS.forEach(combo => {
    if (META.combosDiscovered.includes(combo.id)) return;
    try {
      if (combo.check(ctx)) {
        META.combosDiscovered.push(combo.id);
        saveMeta(META);
        showComboDiscoveredPopup(combo);
      }
    } catch(e) { /* gracefully skip if check fails */ }
  });
}

function showComboDiscoveredPopup(combo) {
  // Play a celebratory sound
  AudioEngine.ensureCtx();
  AudioEngine.personalBest();
  AudioEngine.keywordTrigger();

  const popup = document.createElement('div');
  popup.className = 'combo-discovered-popup';
  popup.innerHTML = `
    <div class="combo-discovered-flash"></div>
    <div class="combo-discovered-icon">${combo.icon}</div>
    <div class="combo-discovered-label">COMBO DISCOVERED</div>
    <div class="combo-discovered-name">${combo.name}</div>
    <div class="combo-discovered-desc">${combo.desc}</div>
  `;
  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add('visible'));
  setTimeout(() => {
    popup.classList.remove('visible');
    setTimeout(() => popup.remove(), 500);
  }, 3000);
}

// ===== SCREENS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // TIER2v3-8: Hide mobile play button when leaving battle
  if (id !== 'battle-screen') {
    const mpb = document.getElementById('mobile-play-btn');
    if (mpb) mpb.classList.remove('visible');
  }
  // TIER3-REC13: Stop title screen particles when leaving title
  if (id !== 'title-screen' && _titleParticleAnimId) {
    cancelAnimationFrame(_titleParticleAnimId);
    _titleParticleAnimId = null;
  }
  // TIER3-REC13: Restart title particles when returning to title
  if (id === 'title-screen' && !_titleParticleAnimId) {
    initTitleParticles();
  }
}

// ===== TITLE =====
document.querySelectorAll('.class-card').forEach(c => {
  c.addEventListener('click', () => {
    if (c.classList.contains('locked')) return;
    document.querySelectorAll('.class-card').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected');
  });
});

loadGameData().catch(err => console.error('Failed to load game data:', err));

// ============================================================
// FEATURE 1: GUIDED FIRST-RUN TUTORIAL
// ============================================================
const TUTORIAL_KEY = 'tee_tutorial_done_v1';
let TUTORIAL = {
  active: false,
  step: 0,
  steps: [
    {
      title: 'Welcome, Card Master!',
      text: 'This is a trick-taking game. The enemy plays a card — you must <strong>match its suit</strong> with a higher rank to win the trick.',
      hint: '👆 Look at the enemy card above. Match its suit!',
      action: 'show', // just show, no requirement
      highlight: null,
    },
    {
      title: 'Suit Powers',
      text: 'Each suit grants a unique reward on win:<br>♥ Hearts = +mult, ♦ Diamonds = +chips, ♣ Clubs = direct damage, ♠ Spades = reveal enemy cards.',
      hint: 'Hover over any card to see its suit effect!',
      action: 'show',
      highlight: 'hand',
    },
    {
      title: 'Choose Your Row',
      text: 'Play your card on a <strong>row</strong>: Crown (×mult), Heart (+chips), or Shield (defend). Winning on the same row builds a <strong>streak</strong> for bonus damage!',
      hint: 'Select a card, pick a row, then Play Card!',
      action: 'show',
      highlight: 'rows',
    },
    {
      title: 'The Escalation Payoff',
      text: 'Every trick you win adds <strong>modifiers</strong> to your escalation engine. The more you win, the crazier your scores get. Watch the modifier strip grow above your hand!',
      hint: '⚡ Win tricks → earn modifiers → scores EXPLODE!',
      action: 'show',
      highlight: null,
    },
    {
      title: 'Off-Suit Tactics',
      text: "Can't match the enemy suit? Off-suit plays can't win but still help: <strong>Foundation row</strong> grants double shield, <strong>Heart row</strong> boosts a random modifier.",
      hint: 'Dead cards become tactical retreats!',
      action: 'show',
      highlight: null,
    },
    {
      title: 'You\'re Ready!',
      text: 'Win tricks, stack modifiers, and watch your damage <strong>escalate</strong>. Good luck!',
      hint: '',
      action: 'end',
      highlight: null,
    }
  ],
};

function isFirstRun() {
  try { return !localStorage.getItem(TUTORIAL_KEY); } catch(e) { return false; }
}

function markTutorialDone() {
  try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch(e) {}
}

function startTutorial() {
  TUTORIAL.active = true;
  TUTORIAL.step = 0;
  showTutorialStep();
}

function showTutorialStep() {
  const overlay = document.getElementById('tutorial-overlay');
  const step = TUTORIAL.steps[TUTORIAL.step];
  if (!step) { endTutorial(); return; }

  overlay.classList.add('active');
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-text').innerHTML = step.text;
  document.getElementById('tutorial-highlight-hint').textContent = step.hint;

  const btn = document.getElementById('tutorial-btn');
  btn.textContent = step.action === 'end' ? 'Let\'s Go!' : 'Got it!';

  // Step indicator
  const indicator = document.getElementById('tutorial-step-indicator');
  indicator.innerHTML = '';
  TUTORIAL.steps.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'step-dot' + (i === TUTORIAL.step ? ' active' : i < TUTORIAL.step ? ' done' : '');
    indicator.appendChild(dot);
  });

  // Remove old highlights
  document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));

  // Apply highlight
  if (step.highlight === 'hand') {
    document.querySelector('.hand-area')?.classList.add('tutorial-highlight');
  } else if (step.highlight === 'rows') {
    document.querySelector('.rows-area')?.classList.add('tutorial-highlight');
  }
}

function advanceTutorial() {
  const step = TUTORIAL.steps[TUTORIAL.step];
  if (step?.action === 'end') { endTutorial(); return; }
  TUTORIAL.step++;
  if (TUTORIAL.step >= TUTORIAL.steps.length) { endTutorial(); return; }
  showTutorialStep();
}

function endTutorial() {
  TUTORIAL.active = false;
  document.getElementById('tutorial-overlay').classList.remove('active');
  document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
  markTutorialDone();
}

// ============================================================
// TIER1-REC2v6: FIRST-RUN "AHA MOMENT" ACCELERATION
// On the very first run, the 3rd trick of the 1st encounter is
// engineered to produce a spectacular score (80-120).
// A pre-seeded high card + weak enemy + hidden multiplier creates
// the "THIS is what escalation feels like" moment that hooks players.
// ============================================================
const AHA_KEY = 'tee_aha_done_v1';

function isAhaMomentEligible() {
  // Only trigger on the very first run ever, first encounter, 3rd trick
  try {
    if (localStorage.getItem(AHA_KEY)) return false;
  } catch(e) { return false; }
  // Must be onboarding stage 1 and a standard encounter (not daily, not resumed)
  if (getOnboardingStage() > 1) return false;
  if (G._isDailyChallenge) return false;
  if (G.encountersWon > 0) return false; // Only first encounter
  return true;
}

function markAhaDone() {
  try { localStorage.setItem(AHA_KEY, '1'); } catch(e) {}
}

function seedSpectacleTrick() {
  // Add the "Ember Ace" to player's hand if not already there
  const aceId = 'spectacle_ace_' + Date.now();
  const spectacleCard = {
    id: aceId,
    suit: 'hearts',
    rank: 14, // Ace
    name: 'Ember Ace',
    baseChips: 12,
    baseMult: 0.5,
    rarity: 'rare',
    keywords: [],
    _isSpectacleCard: true,
  };
  // Replace the weakest card in hand with the Ember Ace
  if (G.hand.length > 0) {
    const weakestIdx = G.hand.reduce((minI, c, i, arr) => c.rank < arr[minI].rank ? i : minI, 0);
    G.hand[weakestIdx] = spectacleCard;
  } else {
    G.hand.push(spectacleCard);
  }

  // Force enemy to play a very weak card on Crown
  G.enemyCard = { suit: 'hearts', rank: 4, id: 'e_spectacle_weak' };
  G.enemyRow = 'crown';

  // Mark that spectacle is active for this trick
  G._spectacleTrickActive = true;
}

function applySpectacleMultiplier(scoreResult) {
  // Boost score to 80-120 range for maximum "wow" factor
  if (!G._spectacleTrickActive) return scoreResult;
  const targetScore = 80 + Math.floor(Math.random() * 41); // 80-120
  if (scoreResult.total < targetScore) {
    const boostMult = Math.ceil(targetScore / Math.max(1, scoreResult.total));
    scoreResult.total = targetScore;
    scoreResult.steps.push({ label: '⚡ ESCALATION!', value: '×' + boostMult, colorClass: 'bonus-color' });
  }
  return scoreResult;
}

function showAhaPopup(score) {
  G._spectacleTrickActive = false;
  markAhaDone();

  // REC3-v7: Escalation Preview — animated demo showing damage scaling
  const baseScore = Math.max(12, Math.floor(score / 8));
  const withMods = Math.floor(baseScore * 3.5);
  const withSurge = withMods * 2;
  const withVengeance = Math.floor(withSurge * 2.5);

  const popup = document.createElement('div');
  popup.className = 'aha-moment-popup';
  popup.innerHTML = `
    <div class="aha-flash"></div>
    <div class="aha-icon">⚡</div>
    <div class="aha-title">The Escalation Engine</div>
    <div class="aha-score">${score} DAMAGE</div>
    <div class="aha-escalation-demo">
      <div class="aha-demo-step" id="aha-step-1">
        <span class="aha-demo-label">Your first win</span>
        <span class="aha-demo-value">${baseScore}</span>
      </div>
      <div class="aha-demo-arrow" id="aha-arrow-1">↓ + stacked modifiers</div>
      <div class="aha-demo-step" id="aha-step-2">
        <span class="aha-demo-label">With 3 modifiers</span>
        <span class="aha-demo-value">${withMods}</span>
      </div>
      <div class="aha-demo-arrow" id="aha-arrow-2">↓ + Crown Surge ×2</div>
      <div class="aha-demo-step" id="aha-step-3">
        <span class="aha-demo-label">Crown Surge</span>
        <span class="aha-demo-value">${withSurge}</span>
      </div>
      <div class="aha-demo-arrow" id="aha-arrow-3">↓ + Vengeance ×2.5</div>
      <div class="aha-demo-step" id="aha-step-4">
        <span class="aha-demo-label">Full escalation</span>
        <span class="aha-demo-value">${withVengeance}</span>
      </div>
    </div>
    <div class="aha-final-msg" id="aha-final">This is where you're heading. Every trick makes the next one stronger.</div>
    <button class="btn-small aha-dismiss" onclick="this.parentElement.remove()">Let's Go!</button>
  `;
  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add('visible'));
  AudioEngine.personalBest();

  // Animate escalation steps sequentially
  const steps = [
    { id: 'aha-step-1', arrow: null, delay: 600 },
    { id: 'aha-step-2', arrow: 'aha-arrow-1', delay: 1200 },
    { id: 'aha-step-3', arrow: 'aha-arrow-2', delay: 1800 },
    { id: 'aha-step-4', arrow: 'aha-arrow-3', delay: 2400 },
  ];
  steps.forEach(s => {
    setTimeout(() => {
      const el = document.getElementById(s.id);
      if (el) el.classList.add('revealed');
      if (s.arrow) {
        const arrowEl = document.getElementById(s.arrow);
        if (arrowEl) arrowEl.classList.add('revealed');
      }
      // Play escalating sound for each step
      AudioEngine.breakdownStep(steps.indexOf(s), steps.length);
    }, s.delay);
  });
  // Show final message
  setTimeout(() => {
    const final = document.getElementById('aha-final');
    if (final) final.classList.add('revealed');
    AudioEngine.scoreSlam(withVengeance);
  }, 3000);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (popup.parentElement) {
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 500);
    }
  }, 10000);
}

function startGame() {
  AudioEngine.init();
  AudioEngine.uiClick();
  // TIER1-REC2v4: Restore original random if daily was active
  restoreRandom();
  _dailyChallenge.active = false;
  const indicator = document.getElementById('daily-run-indicator');
  if (indicator) indicator.classList.remove('visible');
  // TIER1-REC1: Clear any old saved run
  clearRunState();
  const cls = document.querySelector('.class-card.selected')?.dataset.class || 'ember';
  initState(cls);
  G._isDailyChallenge = false;
  META.totalRuns++;
  saveMeta(META);
  generateMap();
  showMap();

  // Show progressive onboarding intro
  const stage = getOnboardingStage();
  if (stage <= 4) {
    // For stage 1, enter first encounter then show intro
    if (stage === 1) {
      // Skip act flavour text — onboarding will cover the screen
      // Defer contextual tips (encounter rule) until onboarding is dismissed
      G._deferContextualTips = true;
      const firstEncounter = G.mapNodes.find(n => n.type === 'encounter' && !n.completed);
      if (firstEncounter) {
        enterNode(firstEncounter.id);
        setTimeout(() => showOnboardingIntro(stage), 600);
        return;
      }
    }
    // For stages 2-4, show act flavour first, then intro after it fades
    setTimeout(() => showActTransitionFlavour(1), 400);
    setTimeout(() => showOnboardingIntro(stage), 3600);
  } else {
    // No onboarding — just show act flavour text
    setTimeout(() => showActTransitionFlavour(1), 400);
  }
}

// ============================================================
// FEATURE 2: TRUE BRANCHING MAP
// ============================================================
function generateMap() {
  G.mapNodes = [];
  G.mapConnections = [];

  const nodeTypes = [
    { type: 'encounter', icon: '⚔️', label: 'Encounter', weight: 25 },
    { type: 'elite', icon: '💀', label: 'Elite', weight: 12 },
    { type: 'event', icon: '❓', label: 'Event', weight: 12 },
    { type: 'rest', icon: '🔥', label: 'Rest', weight: 10 },
    { type: 'shop', icon: '🏪', label: 'Shop', weight: 8 },
    { type: 'treasure', icon: '💎', label: 'Treasure', weight: 5 },
    { type: 'shrine', icon: '✨', label: 'Shrine', weight: 5 },
    // TIER2-REC4v6: Increased alternate format weights for better variety (was 7/6/5, now 9/8/8)
    { type: 'gauntlet', icon: '🏟️', label: 'Gauntlet', weight: 9 },
    { type: 'puzzle', icon: '🧩', label: 'Puzzle', weight: 8 },
    { type: 'bid', icon: '🎲', label: 'Bid', weight: 8 },
  ];

  function pickType() {
    const roll = Math.random() * 100;
    let cumul = 0;
    for (const nt of nodeTypes) { cumul += nt.weight; if (roll < cumul) return nt; }
    return nodeTypes[0];
  }

  const numRows = 6 + Math.floor(Math.random() * 2);
  let nodeId = 0;

  const startNode = { id: nodeId++, row: 0, col: 0, type: 'encounter', icon: '⚔️', label: 'Encounter', completed: false, children: [] };
  G.mapNodes.push(startNode);

  let prevRow = [startNode];

  for (let r = 1; r < numRows; r++) {
    const nodesInRow = 2 + Math.floor(Math.random() * 2);
    const row = [];
    for (let c = 0; c < nodesInRow; c++) {
      const t = pickType();
      const node = { id: nodeId++, row: r, col: c, type: t.type, icon: t.icon, label: t.label, completed: false, children: [], parents: [] };
      G.mapNodes.push(node);
      row.push(node);
    }

    const childConnected = new Set();
    prevRow.forEach((parent, pi) => {
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

  const bossNode = { id: nodeId++, row: numRows, col: 0, type: 'boss', icon: '👑', label: 'Boss', completed: false, children: [], parents: [] };
  G.mapNodes.push(bossNode);
  prevRow.forEach(p => {
    p.children.push(bossNode.id);
    bossNode.parents.push(p.id);
    G.mapConnections.push({ from: p.id, to: bossNode.id });
  });

  // TIER2-5: Convert branching-point encounters to mini-bosses
  // A branching point is a node with 3+ children (major junction)
  G.mapNodes.forEach(node => {
    if (node.type === 'encounter' && node.children.length >= 3 && node.row > 0 && node.row < numRows) {
      node.type = 'mini_boss';
      node.icon = '⚡';
      node.label = 'Mini-Boss';
    }
  });

  // TIER2-7: Pre-assign preview info and danger ratings to nodes
  G.mapNodes.forEach(node => {
    node._preview = generateNodePreview(node);
    node._danger = getNodeDanger(node);
  });

  G.currentNode = -1;
}

// TIER2-7: Generate preview info for map node tooltip
function generateNodePreview(node) {
  switch (node.type) {
    case 'encounter': {
      const pool = ENEMY_DATA?.standard || [];
      const enemy = pool[Math.floor(Math.random() * pool.length)];
      node._previewEnemy = enemy?.name || 'Unknown Foe';
      node._previewHp = enemy ? Math.floor(enemy.baseHp + G.act * enemy.hpPerAct) : 40;
      return { line1: enemy?.name || 'Standard Enemy', line2: 'Standard · ' + (3 + G.act) + ' tricks', tier: 'standard' };
    }
    case 'mini_boss': {
      const pool = (ENEMY_DATA?.standard || []).filter(t => t.passiveKey);
      const enemy = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
      node._previewEnemy = enemy?.name || 'Mini-Boss';
      node._previewHp = enemy ? Math.floor((enemy.baseHp + G.act * enemy.hpPerAct) * 1.3) : 60;
      return { line1: '⚡ ' + (enemy?.name || 'Mini-Boss'), line2: 'Tougher + gameplay wrinkle', tier: 'mini_boss' };
    }
    case 'elite': {
      const pool = ENEMY_DATA?.elite || [];
      const enemy = pool[Math.floor(Math.random() * pool.length)];
      node._previewEnemy = enemy?.name || 'Elite Foe';
      node._previewHp = enemy ? Math.floor(enemy.baseHp + G.act * enemy.hpPerAct) : 80;
      return { line1: '💀 ' + (enemy?.name || 'Elite'), line2: 'Elite · Relic reward', tier: 'elite' };
    }
    case 'boss':
      node._previewHp = 150 + G.act * 50;
      return { line1: '👑 Act Boss', line2: 'Multi-phase · Major rewards', tier: 'boss' };
    case 'event':
      return { line1: '❓ Event', line2: '3 choices · Risk/reward', tier: 'safe' };
    case 'rest':
      return { line1: '🔥 Rest Site', line2: '6 options · Heal ~' + Math.min(30, Math.floor(G.maxHp * 0.3)) + ' HP', tier: 'safe' };
    case 'shop':
      return { line1: '🏪 Card Shop', line2: '5 items · Ink: ' + (G.ink || 0), tier: 'safe' };
    case 'treasure':
      return { line1: '💎 Treasure', line2: 'Flame mod + Ink + Relic', tier: 'safe' };
    case 'shrine':
      return { line1: '✨ Modifier Shrine', line2: '3 modifier blessings', tier: 'safe' };
    case 'gauntlet':
      return { line1: '🏟️ Gauntlet', line2: '5 waves · Hand carries · +Ink', tier: 'hard' };
    case 'puzzle':
      return { line1: '🧩 Puzzle', line2: 'Win exactly 2 of 4 tricks', tier: 'medium' };
    case 'bid':
      return { line1: '🎲 Bid Challenge', line2: 'Risk/reward wager', tier: 'medium' };
    default:
      return { line1: node.label, line2: '', tier: 'standard' };
  }
}

// ============================================================
// TIER1-REC3v6: MAP MICRO-HOOKS — Dynamic Difficulty & Path Previews
// ============================================================

// Estimate player's approximate damage per trick based on current modifiers + deck
function getPlayerPowerEstimate() {
  let totalMult = 1.0;
  let totalChips = 0;
  G.modifiers.forEach(m => {
    if (m.type === 'mult') totalMult += m.value;
    else totalChips += m.value;
  });
  // Average card base chips ≈ 6, base mult ≈ 0.3
  const avgCardBase = 6;
  const avgDmgPerTrick = Math.floor((avgCardBase + totalChips) * totalMult);
  // Assume winning ~60% of tricks (2 of 3) with 2 rounds
  const tricksPerEncounter = (3 + (G.act || 1)) * 0.6;
  return Math.floor(avgDmgPerTrick * tricksPerEncounter);
}

// Compare player power to node enemy HP → green/yellow/red difficulty
function getNodeDifficultyVsPlayer(node) {
  if (!node._previewHp) return 'unknown';
  const playerPower = getPlayerPowerEstimate();
  const ratio = playerPower / node._previewHp;
  if (ratio >= 1.5) return 'easy';      // Green — player significantly stronger
  if (ratio >= 0.8) return 'fair';      // Yellow — roughly matched
  if (ratio >= 0.4) return 'hard';      // Orange — challenging
  return 'deadly';                        // Red — significantly outmatched
}

// Get difficulty indicator dot color and label
function getDifficultyIndicator(node) {
  const combatTypes = ['encounter', 'mini_boss', 'elite', 'boss', 'gauntlet'];
  if (!combatTypes.includes(node.type)) {
    return { dot: '🟢', color: '#4ade80', label: 'Safe' };
  }
  const diff = getNodeDifficultyVsPlayer(node);
  switch (diff) {
    case 'easy': return { dot: '🟢', color: '#4ade80', label: 'Easy' };
    case 'fair': return { dot: '🟡', color: '#facc15', label: 'Fair' };
    case 'hard': return { dot: '🟠', color: '#f97316', label: 'Hard' };
    case 'deadly': return { dot: '🔴', color: '#ef4444', label: 'Deadly' };
    default: return { dot: '⚪', color: '#999', label: '' };
  }
}

// Generate path preview text: what the next nodes on each branch offer
function getPathPreviewText(node) {
  if (!node.children || node.children.length === 0) return '';
  const previews = node.children.map(cid => {
    const child = G.mapNodes.find(n => n.id === cid);
    if (!child || child.completed) return null;
    const p = child._preview;
    return p ? p.line1 : child.label;
  }).filter(Boolean);
  if (previews.length === 0) return '';
  return 'Next: ' + previews.join(' / ');
}

// TIER2-7: Calculate danger rating for a node (0-3 scale)
function getNodeDanger(node) {
  const dangerMap = {
    encounter: 1, mini_boss: 2, elite: 2, boss: 3,
    gauntlet: 2, puzzle: 1, bid: 1,
    event: 0, rest: 0, shop: 0, treasure: 0, shrine: 0,
  };
  return dangerMap[node.type] ?? 1;
}

// TIER2-7: Calculate path danger (average danger of reachable nodes from a node)
function getPathDanger(nodeId) {
  const node = G.mapNodes.find(n => n.id === nodeId);
  if (!node || node.children.length === 0) return 0;
  const childDangers = node.children.map(cid => {
    const child = G.mapNodes.find(n => n.id === cid);
    return child ? (child._danger || 0) : 0;
  });
  return childDangers.reduce((a, b) => a + b, 0) / childDangers.length;
}

// ===== MAP RENDERING =====
function showMap() {
  // TIER1-REC5v3: Check for mid-run disruption event before showing map
  if (shouldTriggerDisruption()) {
    showDisruptionEvent();
    return;
  }

  showScreen('map-screen');
  // TIER1-REC1: Save run state after each node completion
  // TIER3-10: Force immediate save at map checkpoints
  saveRunState(true);
  const actNames = ['Act 1 — The Outskirts','Act 2 — The Contested Lands','Act 3 — The Monarch\'s Domain'];
  document.getElementById('map-act-title').textContent = actNames[G.act - 1] || 'Act ' + G.act;
  document.getElementById('map-hp').textContent = G.hp;
  document.getElementById('map-ink').textContent = G.ink;
  document.getElementById('map-embers').textContent = G.embers;
  document.getElementById('map-deck').textContent = G.deck.length;
  document.getElementById('map-mods').textContent = G.modifiers.length;
  document.getElementById('map-resilience').textContent = G.resilience;

  renderRelicBar('map-relics');
  renderArchetypeProgress();

  // TIER1-REC3v6: Refresh node previews with current player power for dynamic difficulty
  G.mapNodes.forEach(node => {
    if (!node.completed) {
      node._preview = generateNodePreview(node);
    }
  });

  const nodesLayer = document.getElementById('map-nodes-layer');
  nodesLayer.innerHTML = '';

  const rows = {};
  G.mapNodes.forEach(n => { if (!rows[n.row]) rows[n.row] = []; rows[n.row].push(n); });

  const availableIds = new Set();
  if (G.currentNode === -1) {
    Object.values(rows)[0]?.forEach(n => availableIds.add(n.id));
  } else {
    const currentNodeObj = G.mapNodes.find(n => n.id === G.currentNode);
    if (currentNodeObj) currentNodeObj.children.forEach(cid => {
      const child = G.mapNodes.find(n => n.id === cid);
      if (child && !child.completed) availableIds.add(cid);
    });
  }

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
      el.dataset.type = node.type;
      if (node.type === 'boss') el.classList.add('boss');
      if (node.type === 'mini_boss') el.classList.add('mini-boss');
      if (node.completed) el.classList.add('completed');
      if (availableIds.has(node.id)) {
        el.classList.add('available');
        el.addEventListener('click', () => {
          const burst = document.createElement('div');
          burst.className = 'node-activate-burst';
          el.appendChild(burst);
          setTimeout(() => burst.remove(), 600);
          setTimeout(() => enterNode(node.id), 200);
        });
      }
      if (node.id === G.currentNode) el.classList.add('current');

      // TIER1-REC3v6: Dynamic difficulty indicator dot
      const diffIndicator = getDifficultyIndicator(node);

      // REC4-v7: Enhanced hover preview card with power gauge, encounter rule, path risk
      const preview = node._preview;
      const danger = node._danger || 0;
      let tooltipHtml = '';
      if (preview && availableIds.has(node.id) && !node.completed) {
        const pathPreview = getPathPreviewText(node);
        const hpLine = node._previewHp ? `<div class="npt-hp">HP: ~${node._previewHp}</div>` : '';
        const diffLine = `<div class="npt-difficulty" style="color:${diffIndicator.color}">${diffIndicator.dot} ${diffIndicator.label}</div>`;
        const pathLine = pathPreview ? `<div class="mhp-path-ribbon">${pathPreview}</div>` : '';

        // REC4-v7: Power vs enemy gauge
        let gaugeHtml = '';
        const combatTypes = ['encounter', 'mini_boss', 'elite', 'boss', 'gauntlet'];
        if (combatTypes.includes(node.type) && node._previewHp) {
          const playerPower = getPlayerPowerEstimate();
          const ratio = Math.min(2, playerPower / Math.max(1, node._previewHp));
          const pct = Math.min(100, Math.round(ratio * 50));
          const gaugeColor = ratio >= 1.5 ? '#4ade80' : ratio >= 0.8 ? '#facc15' : ratio >= 0.4 ? '#f97316' : '#ef4444';
          const gaugeLabel = ratio >= 1.5 ? 'You can handle this' : ratio >= 0.8 ? 'Roughly matched' : ratio >= 0.4 ? 'Challenging fight' : 'Dangerous!';
          gaugeHtml = `<div class="mhp-gauge-wrap"><div class="mhp-gauge-fill" style="width:${pct}%;background:${gaugeColor}"></div></div><div class="mhp-gauge-label" style="color:${gaugeColor}">${gaugeLabel}</div>`;
        }

        // REC4-v7: Show encounter rule if available
        let ruleHtml = '';
        if (node._previewEnemy && node.type !== 'boss') {
          const enemyPool = ENEMY_DATA?.[node.type === 'elite' ? 'elite' : 'standard'] || [];
          const enemyT = enemyPool.find(e => e.name === node._previewEnemy);
          if (enemyT) {
            const rKey = enemyT.ruleKey || (enemyT.passiveKey ? PASSIVE_TO_RULE[enemyT.passiveKey] : null);
            const rule = rKey ? ENCOUNTER_RULES[rKey] : null;
            if (rule) {
              ruleHtml = `<div class="mhp-rule"><span class="mhp-rule-icon">${rule.icon}</span> <span>${rule.name}: ${rule.desc}</span></div>`;
            }
          }
        }

        // REC4-v7: Path danger ribbon
        let pathRiskHtml = '';
        if (node.children && node.children.length > 0) {
          const avgDanger = getPathDanger(node.id);
          const riskColor = avgDanger >= 2.5 ? '#ef4444' : avgDanger >= 1.5 ? '#f97316' : avgDanger >= 0.5 ? '#facc15' : '#4ade80';
          const riskLabel = avgDanger >= 2.5 ? 'Perilous path ahead' : avgDanger >= 1.5 ? 'Dangerous path' : avgDanger >= 0.5 ? 'Mixed path' : 'Safe path ahead';
          pathRiskHtml = `<div class="mhp-path-ribbon" style="color:${riskColor}">${riskLabel}</div>`;
        }

        tooltipHtml = `<div class="map-node-hover-preview">
          <div class="mhp-title">${preview.line1}</div>
          <div class="mhp-desc">${preview.line2}</div>
          ${hpLine}${diffLine}${gaugeHtml}${ruleHtml}${pathLine}${pathRiskHtml}
        </div>`;
        el.dataset.danger = danger;
        el.dataset.difficulty = getNodeDifficultyVsPlayer(node);
      } else if (preview) {
        // Completed or unavailable nodes: simple tooltip
        tooltipHtml = `<div class="node-preview-tooltip"><div class="npt-title">${preview.line1}</div><div class="npt-desc">${preview.line2}</div></div>`;
      }

      // TIER1-REC3v6: Difficulty dot on the node itself
      const diffDot = (availableIds.has(node.id) && !node.completed) 
        ? `<span class="node-diff-dot" style="background:${diffIndicator.color}" title="${diffIndicator.label}"></span>` 
        : '';

      el.innerHTML = `${node.icon}${diffDot}${tooltipHtml}`;
      rowDiv.appendChild(el);
    });

    nodesLayer.appendChild(rowDiv);
  });

  requestAnimationFrame(() => {
    const svg = document.getElementById('map-svg');
    const container = document.getElementById('map-container');
    svg.innerHTML = '';

    const rect = container.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.style.width = rect.width + 'px';
    svg.style.height = rect.height + 'px';

    document.querySelectorAll('.map-node').forEach(el => {
      const id = parseInt(el.dataset.nodeId);
      const r = el.getBoundingClientRect();
      nodePositions[id] = { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 };
    });

    G.mapConnections.forEach(conn => {
      const from = nodePositions[conn.from];
      const to = nodePositions[conn.to];
      if (!from || !to) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);

      const fromNode = G.mapNodes.find(n => n.id === conn.from);
      const toNode = G.mapNodes.find(n => n.id === conn.to);

      if (fromNode?.completed && toNode?.completed) line.classList.add('completed-path');
      else if (fromNode?.completed && availableIds.has(conn.to)) {
        line.classList.add('active-path');
        // TIER2-7: Color-code active paths by danger
        const targetDanger = toNode?._danger || 0;
        if (targetDanger >= 3) line.classList.add('path-extreme');
        else if (targetDanger >= 2) line.classList.add('path-dangerous');
        else if (targetDanger >= 1) line.classList.add('path-standard');
        else line.classList.add('path-safe');
      }

      svg.appendChild(line);
    });
  });
}

// 2.2: Render archetype progress on map
function renderArchetypeProgress() {
  const container = document.getElementById('map-archetype-progress');
  if (!container) return;
  container.innerHTML = '';

  const lead = getLeadArchetype();
  if (!lead) { container.style.display = 'none'; return; }
  container.style.display = 'flex';

  const arch = ARCHETYPE_DATA[lead.key];
  const nextMilestone = arch.milestones.find(m => lead.progress < m.threshold) || arch.milestones[arch.milestones.length - 1];
  const maxT = nextMilestone.threshold;
  const pct = Math.min(100, (lead.progress / maxT) * 100);

  container.innerHTML = `
    <div class="archetype-badge" style="color:${arch.color}">${arch.icon} ${arch.name}</div>
    <div class="archetype-bar-wrap">
      <div class="archetype-bar-fill" style="width:${pct}%;background:${arch.color}"></div>
    </div>
    <div class="archetype-milestone-hint">${lead.progress}/${maxT}: ${nextMilestone.reward}</div>
  `;
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
  // TIER1-REC5v3: Track nodes completed for disruption event trigger
  G._nodesCompletedThisAct = (G._nodesCompletedThisAct || 0) + 1;

  switch (node.type) {
    case 'encounter': startEncounter(generateEnemy('standard')); break;
    case 'mini_boss': startEncounter(generateMiniBoss()); break;
    case 'elite': startEncounter(generateEnemy('elite')); break;
    case 'boss': {
      // TIER2v3-7: Boss Entrance Spectacle
      const bossEnemy = generateEnemy('boss');
      showBossEntrance(bossEnemy, () => startEncounter(bossEnemy));
      break;
    }
    case 'event': showEvent(); break;
    case 'rest': showRest(); break;
    case 'shop': showShop(); break;
    case 'treasure': showTreasure(); break;
    case 'shrine': showShrine(); break;
    // TIER1-3: New encounter formats
    case 'gauntlet': startGauntletEncounter(); break;
    case 'puzzle': startPuzzleEncounter(); break;
    case 'bid': startBidEncounter(); break;
    default: showMap();
  }
}

// ============================================================
// TIER1-3: ENCOUNTER VARIETY — Gauntlet, Puzzle, Bid
// ============================================================

function startGauntletEncounter() {
  // TIER2v4-6: Gauntlet Rework — hand carries across waves, temp mods per kill, final wave double HP
  G.encounterFormat = 'gauntlet';
  G.gauntletWave = 0;
  G.gauntletMaxWaves = 5;
  G.gauntletTotalReward = 0;
  G._gauntletTempMods = []; // Track temp gauntlet mods for cleanup
  // TIER2v4-7: Contextual tip on first gauntlet
  showContextualTip('gauntlet', CONTEXTUAL_TIPS.gauntlet);
  advanceGauntletWave();
}

function advanceGauntletWave() {
  G.gauntletWave++;
  if (G.gauntletWave > G.gauntletMaxWaves) {
    // Gauntlet complete! Clean up temp mods
    G.modifiers = G.modifiers.filter(m => !m._gauntletTemp);
    G.encounterFormat = 'standard';
    const bonusInk = G.gauntletTotalReward + 20;
    G.ink += bonusInk;
    G.encountersWon++;
    G._combatEncounterIndex = (G._combatEncounterIndex || 0) + 1; // TIER2-REC4v6
    spawnKeywordPopup('🏟️ GAUNTLET COMPLETE! +' + bonusInk + ' Ink!', 30);
    AudioEngine.encounterVictory();
    setTimeout(() => showMap(), 1200);
    return;
  }

  // Generate a mini-enemy with reduced stats
  const template = ENEMY_DATA.standard[Math.floor(Math.random() * ENEMY_DATA.standard.length)];
  let miniHp = Math.floor((template.baseHp + G.act * template.hpPerAct) * 0.3);
  
  // TIER2v4-6: Final wave enemy has double HP
  const isFinalWave = G.gauntletWave === G.gauntletMaxWaves;
  if (isFinalWave) {
    miniHp *= 2;
  }

  const enemy = {
    name: (isFinalWave ? '🔥 ' : '⚡ ') + template.name + (isFinalWave ? ' (CHAMPION)' : ''),
    hp: miniHp, maxHp: miniHp,
    passive: template.passive,
    passiveKey: template.passiveKey,
    passiveValue: template.passiveValue,
    armor: 0, tier: 'standard',
    hand: [],
    tricksPerRound: 1,
    intent: 'attack', intentQueue: [isFinalWave ? 'heavy_attack' : 'attack'],
    currentPhase: 0, disabledModIdx: -1,
  };

  // Generate one enemy card (final wave gets +2 rank bonus)
  const suit = randomBattleSuit();
  const rank = Math.min(14, Math.floor(Math.random() * 10) + 2 + G.act + (isFinalWave ? 2 : 0));
  enemy.hand.push({ suit, rank, id: 'e' + Math.random().toString(36).substr(2, 6) });

  applyAscensionToEnemy(enemy);

  // Set up encounter with proper state
  G.enemy = enemy;
  G.roundNum = 1; G.trickNum = 0; G.roundScore = 0;
  G.playerLeads = G.gauntletWave % 2 === 1; // Alternate leads
  G.tricksPerRound = 1;
  G.enemyRow = null;
  G.enemyCard = null;

  // TIER2v4-6: Only draw hand on first wave — hand carries across all waves
  if (G.gauntletWave === 1) {
    G.consecutiveWins = 0; G.shield = 0;
    G.rowStreaks = { crown: 0, heart: 0, foundation: 0 };
    G.selectedCard = null; G.selectedRow = null;
    G.revealedEnemyCards = [];
    G.echoNextTrick = false; G.echoSuit = null;
    G.surgeFired = { crown: false, heart: false, foundation: false };
    G.crownSurgeActive = false;
    G._crownSurgeUsedThisEncounter = false;
    G.modifiers = G.modifiers.filter(m => m.tier !== 'spark' || m.persistent);
    G.hand = []; G.burnPile = [];
    showScreen('battle-screen');
    AudioEngine.startMusic(G.act);
    document.getElementById('matrix-panel').classList.remove('open');
    clearRows();

    // Draw hand — this hand carries for all 5 waves
    if (G.deck.length < 7) { G.deck.push(...G.burnPile); G.burnPile = []; shuffleArray(G.deck); }
    shuffleArray(G.deck);
    const drawCount = Math.min(G.ascension >= 8 ? 6 : 7, G.deck.length);
    G.hand = G.deck.splice(0, drawCount);
    if (G.hand.length === 0) {
      for (let i = 0; i < 5; i++) G.hand.push(makeCard(randomBattleSuit(), Math.floor(Math.random()*8)+2, 'common'));
    }
  } else {
    // TIER2v4-6: Hand carries — only reset selection state, not the hand
    G.selectedCard = null; G.selectedRow = null;
    G.enemyCard = null;
    // If hand is empty, draw emergency cards
    if (G.hand.length === 0) {
      for (let i = 0; i < 3; i++) G.hand.push(makeCard(randomBattleSuit(), Math.floor(Math.random()*6)+2, 'common'));
    }
  }

  // Update UI to show gauntlet wave
  updateBattleUI();
  startTrick();
}

function startPuzzleEncounter() {
  // Puzzle: Must win EXACTLY 2 of 4 tricks
  G.encounterFormat = 'puzzle';
  G.puzzleTargetWins = 2;
  G.puzzleTricksDone = 0;
  G.puzzleTricksWon = 0;
  // TIER2v4-7: Contextual tip on first puzzle
  showContextualTip('puzzle', CONTEXTUAL_TIPS.puzzle);

  // Generate a puzzle-specific enemy
  const enemy = {
    name: '🧩 Puzzle Construct',
    hp: 999, maxHp: 999, // Doesn't die from damage
    passive: 'Win exactly 2 of 4 tricks!',
    armor: 0, tier: 'standard',
    hand: [],
    tricksPerRound: 4,
    intent: 'attack', intentQueue: ['attack', 'defend', 'attack', 'defend'],
    currentPhase: 0, disabledModIdx: -1,
  };

  // Generate 4 varied enemy cards
  for (let i = 0; i < 4; i++) {
    const suit = randomBattleSuit();
    const rank = Math.min(14, Math.floor(Math.random() * 8) + 4 + G.act);
    enemy.hand.push({ suit, rank, id: 'e' + Math.random().toString(36).substr(2, 6) });
  }

  startEncounter(enemy);
}

function startBidEncounter() {
  // TIER2v5-7: Bid Format Enhancement — risk-reward dial that changes encounter difficulty
  G.encounterFormat = 'bid';
  G.bidPrediction = -1;
  G.bidTricksWon = 0;
  G.bidLevel = 0; // TIER2v5-7: Track bid difficulty level (1-4)
  // TIER2v4-7: Contextual tip on first bid
  showContextualTip('bid', CONTEXTUAL_TIPS.bid);

  const enemy = generateEnemy('standard');
  enemy.name = '🎲 ' + enemy.name;
  G.enemy = enemy; // Store for later

  // Show bid selection screen
  showScreen('event-screen');
  document.getElementById('event-title').textContent = '🎲 The Bid Master';
  document.getElementById('event-text').textContent = `A spectral dealer appears. "Choose your wager — the higher the bid, the tougher the fight, but the greater the spoils."`;
  const container = document.getElementById('event-choices');
  container.innerHTML = '';

  // TIER2v5-7: Four bid tiers with different risk-reward profiles
  const bidTiers = [
    { level: 1, label: '🟢 Cautious Bid', desc: 'Enemy -1 rank per card. Normal rewards.', color: '#27ae60' },
    { level: 2, label: '🟡 Standard Bid', desc: 'Normal difficulty. +25% Ink reward.', color: '#f39c12' },
    { level: 3, label: '🟠 Bold Bid', desc: 'Enemy +1 rank per card. +75% Ink reward.', color: '#e67e22' },
    { level: 4, label: '🔴 Reckless Bid', desc: 'Enemy +2 rank per card. ×2 Ink + chance of rare modifier!', color: '#e74c3c' },
  ];

  bidTiers.forEach(tier => {
    const el = document.createElement('div');
    el.className = 'event-choice bid-tier-choice';
    el.style.borderLeftColor = tier.color;
    el.innerHTML = `<div class="choice-label" style="color:${tier.color}">${tier.label}</div><div class="choice-desc">${tier.desc}</div>`;
    el.addEventListener('click', () => {
      G.bidLevel = tier.level;
      G.bidPrediction = tier.level; // Store for display purposes

      // TIER2v5-7: Apply rank modification to enemy hand based on bid level
      const rankMod = tier.level === 1 ? -1 : tier.level === 3 ? 1 : tier.level === 4 ? 2 : 0;
      if (rankMod !== 0) {
        enemy.hand.forEach(c => {
          c.rank = Math.max(2, Math.min(14, c.rank + rankMod));
        });
      }

      startEncounter(enemy);
    });
    container.appendChild(el);
  });
}

function checkSpecialEncounterEnd() {
  // Called at end of trick resolution for special encounter formats
  if (G.encounterFormat === 'gauntlet') {
    // Gauntlet: always advance wave after each trick (1 trick per wave)
    if (G.enemy.hp <= 0) {
      G.gauntletTotalReward += 10;
      // TIER2v4-6: Each defeated enemy drops +0.1× temp mult for remaining waves
      G.modifiers.push({ name: 'Wave Momentum', suit: null, type: 'mult', value: 0.1, tier: 'spark', persistent: false, _gauntletTemp: true });
      const waveLabel = G.gauntletWave === G.gauntletMaxWaves ? 'CHAMPION' : `Wave ${G.gauntletWave}/${G.gauntletMaxWaves}`;
      spawnKeywordPopup(`🏟️ ${waveLabel} CLEAR! +0.1× mult!`, 30);
    } else {
      // Survived! Take some damage for failing the wave
      const waveDmg = Math.floor(G.enemy.hp * 0.3) + G.act;
      G.hp = Math.max(1, G.hp - waveDmg);
      spawnKeywordPopup(`🏟️ Wave ${G.gauntletWave} survived! -${waveDmg} HP`, 30);
    }
    if (G.hp <= 0) {
      G.encounterFormat = 'standard';
      setTimeout(() => gameOver(false), 800);
      return true;
    }
    setTimeout(() => advanceGauntletWave(), 800);
    return true;
  }

  if (G.encounterFormat === 'puzzle') {
    G.puzzleTricksDone++;
    if (G.puzzleTricksDone >= 4) {
      // Puzzle complete — check accuracy
      setTimeout(() => {
        if (G.puzzleTricksWon === G.puzzleTargetWins) {
          // Perfect!
          const bonusInk = 60;
          G.ink += bonusInk;
          G.encountersWon++;
          G._combatEncounterIndex = (G._combatEncounterIndex || 0) + 1; // TIER2-REC4v6
          const bonusMod = randomSuit();
          G.modifiers.push({ name: bonusMod.charAt(0).toUpperCase() + bonusMod.slice(1) + ' Puzzle Flame', suit: bonusMod, type: 'mult', value: 0.25, tier: 'flame', persistent: true });
          spawnKeywordPopup(`🧩 PUZZLE SOLVED! +${bonusInk} Ink + Flame mod!`, 30);
          AudioEngine.encounterVictory();
          setTimeout(() => showMap(), 1500);
        } else {
          // Failed puzzle — penalty but NO encounter credit
          const penalty = Math.abs(G.puzzleTricksWon - G.puzzleTargetWins) * 5 * G.act;
          G.hp = Math.max(1, G.hp - penalty);
          G.ink += 15; // consolation ink
          spawnKeywordPopup(`🧩 Puzzle failed! Won ${G.puzzleTricksWon}/${G.puzzleTargetWins}. -${penalty} HP`, 30);
          setTimeout(() => showMap(), 1500);
        }
        G.encounterFormat = 'standard';
      }, 800);
      return true;
    }
    return false;
  }

  if (G.encounterFormat === 'bid') {
    // Bid tracking happens naturally — check at encounter end
    return false;
  }

  return false;
}

// ============================================================
// TIER2v3-7: BOSS ENTRANCE SPECTACLE
// Full-screen dramatic entrance, unique stingers, phase announcements,
// and boss defeat screen with stats comparison.
// ============================================================
const BOSS_LORE = {
  'The Crimson Regent': {
    title: 'Sovereign of Blood',
    icon: '🩸',
    flavour: 'The throne room runs red. Every wound you inflict only feeds the Regent\'s hunger.',
    stinger: [660, 440, 330, 220, 330, 440, 660],
  },
  'The Golden Archon': {
    title: 'Herald of the Diamond Sun',
    icon: '💎',
    flavour: 'Light bends to the Archon\'s will. Diamonds cut deeper in this radiant domain.',
    stinger: [880, 784, 880, 988, 1047, 988, 880],
  },
  'The Iron Marshal': {
    title: 'Commander of the Steel Legions',
    icon: '⚙️',
    flavour: 'Walls of iron rise with every heartbeat. Break through — or be buried.',
    stinger: [220, 220, 293, 220, 220, 293, 349],
  },
  'The Void Librarian': {
    title: 'Keeper of Forgotten Pages',
    icon: '📖',
    flavour: 'The ink of reality warps around the Librarian. Your modifiers may not be what they seem.',
    stinger: [440, 554, 659, 554, 440, 370, 311],
  },
};

function showBossEntrance(enemy, callback) {
  const lore = BOSS_LORE[enemy.name] || {
    title: 'Act Boss', icon: '👑', flavour: 'A powerful foe blocks your path.',
    stinger: [440, 554, 659, 784],
  };

  const overlay = document.getElementById('boss-entrance-overlay');
  document.getElementById('boss-entrance-icon').textContent = lore.icon;
  document.getElementById('boss-entrance-name').textContent = enemy.name;
  document.getElementById('boss-entrance-title').textContent = '— ' + lore.title + ' —';
  document.getElementById('boss-entrance-flavour').textContent = lore.flavour;

  overlay.classList.add('active');

  // Play unique boss stinger
  AudioEngine.init();
  AudioEngine.bossStinger(lore.stinger);

  // Auto-dismiss after animation
  setTimeout(() => {
    overlay.classList.remove('active');
    callback();
  }, 2300);
}

function showBossDefeat(enemy, callback) {
  const overlay = document.getElementById('boss-defeat-overlay');
  document.getElementById('boss-defeat-name').textContent = enemy.name + ' has fallen';

  // Compile boss fight stats
  const totalDmgDealt = G.totalDamage;
  const turnsToKill = G.roundNum * G.tricksPerRound + G.trickNum;
  const bestTrick = G.bestTrickThisRun;

  document.getElementById('boss-defeat-stats').innerHTML = `
    <div class="boss-stat-row"><span class="boss-stat-label">Your Damage</span><span class="boss-stat-value">${totalDmgDealt.toLocaleString()}</span></div>
    <div class="boss-stat-row"><span class="boss-stat-label">Boss Max HP</span><span class="boss-stat-value">${enemy.maxHp}</span></div>
    <div class="boss-stat-row"><span class="boss-stat-label">Turns to Kill</span><span class="boss-stat-value">${turnsToKill}</span></div>
    <div class="boss-stat-row"><span class="boss-stat-label">Best Trick</span><span class="boss-stat-value">${bestTrick.toLocaleString()}</span></div>
    <div class="boss-stat-row"><span class="boss-stat-label">HP Remaining</span><span class="boss-stat-value">${G.hp}/${G.maxHp}</span></div>
    <div class="boss-stat-row"><span class="boss-stat-label">Modifiers Active</span><span class="boss-stat-value">${G.modifiers.length}</span></div>
  `;

  overlay.classList.add('active');
  document.getElementById('boss-defeat-continue').onclick = () => {
    overlay.classList.remove('active');
    callback();
  };
}

// Enhanced phase transition dramatic announcement
function showPhaseAnnouncement(phaseIdx, phaseName, effect) {
  const el = document.createElement('div');
  el.className = 'phase-announcement';
  el.innerHTML = `
    <div class="phase-announce-label">PHASE ${phaseIdx + 1}</div>
    <div class="phase-announce-effect">${phaseName || 'The boss grows stronger...'}</div>
  `;
  document.body.appendChild(el);
  AudioEngine.phaseTransition();
  setTimeout(() => el.remove(), 1600);
}

// ============================================================
// TIER2v3-10: PROCEDURAL RUN NARRATIVE
// Generate 2-3 sentences of run story on game-over.
// ============================================================
const NARRATIVE_TEMPLATES = {
  victory: [
    'Your {archetype} deck carved a path through {enemies} enemies across {acts} act{actPlural}.',
    'The escalation engine roared — {bestTrick} damage in a single trick, a testament to {class} mastery.',
    'With {mods} modifiers blazing and {hp} HP to spare, you claimed victory at Ascension {asc}.',
  ],
  defeat: [
    'Your {archetype} journey ended after {enemies} encounters in Act {act}.',
    '{deathEnemy} proved too much — but your best trick of {bestTrick} damage won\'t be forgotten.',
    'With {mods} modifiers and {tricksWon} tricks won, the escalation engine fell silent at {hp} HP.',
  ],
  keyMoments: [
    'The defining moment: a {bestTrick}-damage trick that shook the battlefield.',
    'At your peak, {mods} modifiers combined for devastating escalation.',
    'The {row} row strategy proved decisive, with {rowWins} wins fuelling your climb.',
  ],
};

const ACT_FLAVOUR = {
  1: { title: 'The Outskirts', text: 'The frontier crumbles. Ink-stained roads lead toward contested lands, where every card drawn carries the weight of choice.' },
  2: { title: 'The Contested Lands', text: 'Power shifts like sand. Old enemies grow stronger, and the escalation engine hums with dangerous potential.' },
  3: { title: 'The Monarch\'s Domain', text: 'The final threshold. Here, only the boldest builds survive. The throne room awaits.' },
};

function generateRunNarrative(victory) {
  const lead = getLeadArchetype();
  const archName = lead ? ARCHETYPE_DATA[lead.key].name : 'unspecialized';
  const classNames = { ember: 'Ember', chrome: 'Chrome', stellar: 'Stellar' };

  const vars = {
    archetype: archName,
    class: classNames[G.playerClass] || G.playerClass,
    enemies: G.encountersWon,
    acts: G.act,
    actPlural: G.act !== 1 ? 's' : '',
    act: G.act,
    bestTrick: G.bestTrickThisRun.toLocaleString(),
    mods: G.modifiers.length,
    hp: G.hp,
    asc: G.ascension,
    tricksWon: G.tricksWon,
    deathEnemy: G.enemy ? G.enemy.name : 'the unknown',
    row: 'Crown',
    rowWins: 0,
  };

  // Find dominant row
  const a = META.analytics?.rowWinRates || {};
  let bestRow = 'Crown', bestWins = 0;
  ['crown', 'heart', 'foundation'].forEach(r => {
    const w = a[r]?.wins || 0;
    if (w > bestWins) { bestWins = w; bestRow = r === 'foundation' ? 'Shield' : r.charAt(0).toUpperCase() + r.slice(1); }
  });
  vars.row = bestRow;
  vars.rowWins = bestWins;

  const pool = victory ? NARRATIVE_TEMPLATES.victory : NARRATIVE_TEMPLATES.defeat;
  const keyPool = NARRATIVE_TEMPLATES.keyMoments;

  // Pick 2 from main pool + 1 key moment
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const keyShuffled = [...keyPool].sort(() => Math.random() - 0.5);
  const sentences = [shuffled[0], keyShuffled[0]];
  if (shuffled[1]) sentences.push(shuffled[1]);

  return sentences.map(tmpl => {
    return tmpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] !== undefined ? vars[key] : key);
  }).join(' ');
}

function showActTransitionFlavour(act) {
  const data = ACT_FLAVOUR[act];
  if (!data) return;
  const el = document.createElement('div');
  el.className = 'act-transition-flavour';
  el.innerHTML = `
    <div class="act-flavour-title">${data.title}</div>
    <div class="act-flavour-text">${data.text}</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ============================================================
// TIER3-REC9: RUN INSIGHTS — Actionable learning tips at game over
// ============================================================
function generateRunInsights(victory) {
  const insights = [];
  const rowNames = { crown: 'Crown', heart: 'Heart', foundation: 'Shield' };
  const surgeThreshold = 4;

  // 1. Best trick breakdown — what made it so strong
  if (G.bestTrickThisRun > 0 && G._bestTrickRow) {
    let desc = `Your highest damage trick (${G.bestTrickThisRun.toLocaleString()}) landed on ${rowNames[G._bestTrickRow] || G._bestTrickRow}`;
    if (G._bestTrickKeywords && G._bestTrickKeywords.length > 0) {
      desc += ` with ${G._bestTrickKeywords.join(' + ')}`;
    }
    desc += '.';
    // Actionable tip
    if (G._bestTrickKeywords && G._bestTrickKeywords.includes('Burn')) {
      desc += ' <strong>Build more Burn cards</strong> to recreate this.';
    } else if (G._bestTrickKeywords && G._bestTrickKeywords.includes('Cascade')) {
      desc += ' <strong>Cascade chains</strong> reward high-rank consecutive wins.';
    } else if (G._bestTrickRow === 'crown') {
      desc += ' <strong>Crown row tricks</strong> multiply your score — prioritise ×mult modifiers.';
    }
    insights.push({ icon: '⚡', text: desc, type: 'highlight' });
  }

  // 2. Off-suit loss analysis
  const offSuitLosses = G._offSuitLosses || 0;
  // REC1-v7: Use tracked loss reason counts for richer insight
  const lossReasons = G._lossReasonCounts || { offsuit: 0, outranked: 0, cursed: 0 };
  if (lossReasons.offsuit >= 3) {
    insights.push({
      icon: '🎴',
      text: `You lost ${lossReasons.offsuit} tricks to off-suit plays (couldn't match enemy's suit). <strong>Build more suit coverage</strong> or use <strong>Stars cards</strong> as universal answers.`,
      type: 'warning'
    });
  } else if (lossReasons.outranked >= 3) {
    insights.push({
      icon: '⬆️',
      text: `${lossReasons.outranked} tricks lost to being outranked (same suit, lower card). Consider <strong>keeping high-rank cards</strong> for key moments.`,
      type: 'tip'
    });
  } else if (G.tricksLost > 4 && offSuitLosses < 2) {
    insights.push({
      icon: '🗡️',
      text: `You lost ${G.tricksLost} tricks but kept most on-suit. Your losses were strategic — <strong>Sacrifice/Vengeance</strong> rewards deliberate losing.`,
      type: 'tip'
    });
  }

  // 3. Row streak near-misses (streak hit 3 but never surged)
  const maxStreaks = G._maxRowStreaks || { crown: 0, heart: 0, foundation: 0 };
  const surgesTriggered = G._surgesTriggered || [];
  ['crown', 'heart', 'foundation'].forEach(r => {
    if (maxStreaks[r] === 3 && !surgesTriggered.includes(r)) {
      const surgeReward = r === 'crown' ? '×2 damage multiplier' : r === 'heart' ? 'CHIP DOUBLER ×2' : 'SHIELDBREAKER ×1.5';
      insights.push({
        icon: '🔥',
        text: `Your ${rowNames[r]} row hit a ×3 streak but never surged. <strong>One more ${rowNames[r]} win</strong> would have triggered ${surgeReward}!`,
        type: 'near-miss'
      });
    }
  });

  // 4. Vengeance usage analysis
  const vengeanceTriggers = G._vengeanceTriggers || 0;
  if (vengeanceTriggers > 0) {
    insights.push({
      icon: '💀',
      text: `Vengeance ×2.5 fired ${vengeanceTriggers} time${vengeanceTriggers > 1 ? 's' : ''}. ${vengeanceTriggers >= 3 ? '<strong>Masterful sacrifice play!</strong>' : 'Each Vengeance win is a massive power spike — lose deliberately when you can.'}`,
      type: 'highlight'
    });
  } else if (G.tricksLost >= 6 && G.sacrificeCharge < 3) {
    insights.push({
      icon: '🗡️',
      text: 'You lost many tricks but never triggered Vengeance ×2.5. <strong>Let sacrifice charges build to 3</strong> before winning for massive payoffs.',
      type: 'tip'
    });
  }

  // 5. Surge analysis — did they fire all surges?
  if (surgesTriggered.length >= 3) {
    insights.push({
      icon: '🌟',
      text: 'You triggered <strong>all three row surges</strong> this run — that\'s peak escalation! Each surge compounds your power dramatically.',
      type: 'highlight'
    });
  } else if (surgesTriggered.length === 0 && G.encountersWon >= 2) {
    insights.push({
      icon: '📈',
      text: 'No row surges triggered this run. <strong>Win 4 consecutive tricks on the same row</strong> to unlock powerful surge bonuses.',
      type: 'tip'
    });
  }

  // 6. Modifier count analysis
  if (G.modifiers.length <= 2 && G.encountersWon >= 3) {
    insights.push({
      icon: '✦',
      text: `Only ${G.modifiers.length} modifiers by encounter ${G.encountersWon}. <strong>Hearts wins add ×mult, Diamond wins add +chips</strong> — both compound with every trick.`,
      type: 'warning'
    });
  } else if (G.modifiers.length >= 8) {
    insights.push({
      icon: '✦',
      text: `${G.modifiers.length} modifiers stacked — your escalation engine was running hot! Visit the <strong>Forge</strong> to upgrade Flame → Inferno for even bigger numbers.`,
      type: 'highlight'
    });
  }

  // 7. Boss phase hints (for defeat scenarios)
  if (!victory && G.enemy && G.enemy.phases && G.enemy.phases.length > 1) {
    const boss = G.enemy;
    if (boss.name.includes('Void Librarian')) {
      insights.push({
        icon: '🪞',
        text: 'The Void Librarian\'s <strong>Mirror Realm</strong> reverses suits in Phase 2: ♥↔♠, ♦↔♣. Plan your hand accordingly!',
        type: 'boss'
      });
    } else if (boss.name.includes('Iron Marshal')) {
      insights.push({
        icon: '🔒',
        text: 'The Iron Marshal\'s <strong>Siege Lock</strong> requires 2 consecutive wins before damage applies. Build streaks first!',
        type: 'boss'
      });
    }
  }

  // 8. Class-specific tips
  if (G.playerClass === 'chrome' && vengeanceTriggers === 0) {
    insights.push({
      icon: '⚙️',
      text: 'Chrome Tactician excels at <strong>deliberate losing → Vengeance payoff</strong>. Each loss adds Calculated Risk mult — then win big!',
      type: 'tip'
    });
  } else if (G.playerClass === 'stellar' && G.deck.filter(c => c.suit === 'stars').length < 3) {
    insights.push({
      icon: '⭐',
      text: 'Star Weaver benefits from <strong>more Stars cards</strong>. Stars suit wins grant universal modifiers that boost ALL other suits.',
      type: 'tip'
    });
  }

  // Limit to 4 most relevant insights
  return insights.slice(0, 4);
}

// ============================================================
// TIER1-REC4: ENCOUNTER IDENTITY RULES
// Each standard enemy gets a unique "encounter rule" that
// changes the decision tree, not just the math. Displayed as
// a rule banner and enforced during trick resolution.
// ============================================================
const ENCOUNTER_RULES = {
  // --- Standard enemies: rules that change HOW you play ---
  suit_variety: {
    name: 'Suit Binder',
    icon: '🔗',
    desc: 'Play 2+ different suits this round or take damage',
    color: '#e06040',
    // Tracked per-round: unique suits played
    init: () => { G._encounterSuitsPlayed = new Set(); },
    onCardPlayed: (card) => { G._encounterSuitsPlayed.add(card.suit); },
    onRoundEnd: () => {
      if (G._encounterSuitsPlayed && G._encounterSuitsPlayed.size < 2) {
        const penalty = 5 + G.act * 3;
        G.hp = Math.max(1, G.hp - penalty);
        spawnCriticalPopup(`🔗 SUIT BIND: Only 1 suit! -${penalty} HP`, 35);
      }
      G._encounterSuitsPlayed = new Set();
    }
  },
  last_trick_only: {
    name: 'Fade Wraith',
    icon: '👻',
    desc: 'Only the LAST trick each round deals full damage',
    color: '#aa88cc',
    damageMod: (dmg, trickNum, tricksPerRound) => {
      if (trickNum < tricksPerRound) return Math.floor(dmg * 0.15); // 15% damage on non-final tricks
      return dmg; // full damage on last trick
    }
  },
  descending_ranks: {
    name: 'Gravity Well',
    icon: '⬇️',
    desc: 'Your cards lose 1 rank per trick this round',
    color: '#6688cc',
    onTrickStart: () => {
      if (G.trickNum > 1) {
        G.hand.forEach(c => { c.rank = Math.max(2, c.rank - 1); });
      }
    }
  },
  mirror_rows: {
    name: 'Mirror Fiend',
    icon: '🪞',
    desc: 'Enemy mirrors your row — every play is a Clash!',
    color: '#cc88aa',
    forceEnemyRow: (playerRow) => playerRow  // enemy always plays your row
  },
  no_repeat_row: {
    name: 'Path Warden',
    icon: '🚧',
    desc: "Can't play the same row twice in a row",
    color: '#88aa66',
    init: () => { G._lastRowPlayed = null; },
    isRowBlocked: (row) => row === G._lastRowPlayed,
    onCardPlayed: (card, row) => { G._lastRowPlayed = row; }
  },
  escalating_cost: {
    name: 'Toll Keeper',
    icon: '💰',
    desc: 'Each trick costs +2 Ink. No Ink = +5 enemy armor',
    color: '#ddaa44',
    onTrickStart: () => {
      const cost = 2;
      if (G.ink >= cost) {
        G.ink -= cost;
      } else {
        G.enemy.armor += 5;
        spawnCriticalPopup('💰 No Ink for toll! Enemy +5 armor', 35);
      }
    }
  },
  countdown: {
    name: 'Ticking Horror',
    icon: '⏱️',
    desc: 'Win within 2 rounds or take escalating damage',
    color: '#ff6666',
    init: () => { G._countdownRounds = 0; },
    onRoundEnd: () => {
      G._countdownRounds = (G._countdownRounds || 0) + 1;
      if (G._countdownRounds >= 2) {
        const tickDmg = G._countdownRounds * 5 * G.act;
        G.hp = Math.max(1, G.hp - tickDmg);
        spawnCriticalPopup(`⏱️ TICK! -${tickDmg} HP (Round ${G._countdownRounds})`, 35);
      }
    }
  },
  high_card_only: {
    name: 'Crown Guard',
    icon: '👑',
    desc: 'Only cards rank 8+ deal damage. Lower cards deal 0',
    color: '#cc9944',
    damageMod: (dmg, trickNum, tricksPerRound, card) => {
      if (card && card.rank < 8) return 0;
      return dmg;
    }
  },
  suit_rotation: {
    name: 'Prismatic Drake',
    icon: '🌈',
    desc: 'Required suit rotates each trick — match for ×2 damage!',
    color: '#44ccaa',
    init: () => {
      const suits = getAvailableBattleSuits();
      G._rotationSuits = suits;
      G._rotationIdx = 0;
    },
    getRequiredSuit: () => {
      if (!G._rotationSuits) return null;
      return G._rotationSuits[G._rotationIdx % G._rotationSuits.length];
    },
    onTrickStart: () => {
      G._rotationIdx = (G._rotationIdx || 0);
      const reqSuit = G._rotationSuits ? G._rotationSuits[G._rotationIdx % G._rotationSuits.length] : null;
      if (reqSuit) {
        G.enemy._requiredSuit = reqSuit;
      }
    },
    damageMod: (dmg, trickNum, tricksPerRound, card) => {
      if (card && G.enemy?._requiredSuit && card.suit === G.enemy._requiredSuit) {
        return dmg * 2; // double for matching rotation
      }
      return dmg;
    },
    onCardPlayed: () => { G._rotationIdx = (G._rotationIdx || 0) + 1; }
  },

  // --- TIER1-REC4v3: New encounter rules for previously passiveless enemies ---
  page_tear: {
    name: 'Page Scratcher',
    icon: '📜',
    desc: 'Scratches weaken your best — highest card loses 2 rank per trick',
    color: '#cc7744',
    onTrickStart: () => {
      if (G.trickNum > 1 && G.hand.length > 0) {
        // Find highest rank card and reduce it
        let highest = G.hand[0];
        G.hand.forEach(c => { if (c.rank > highest.rank) highest = c; });
        const oldRank = highest.rank;
        highest.rank = Math.max(2, highest.rank - 2);
        if (oldRank !== highest.rank) {
          highest._pageTorn = true; // Visual feedback flag
        }
      }
    }
  },
  rising_ranks: {
    name: 'Smudge Sprite',
    icon: '🌊',
    desc: 'Enemy cards gain +1 rank each round — finish fast!',
    color: '#55aacc',
    _roundCount: 0,
    init: () => { G._risingRoundsElapsed = 0; },
    onRoundEnd: () => {
      G._risingRoundsElapsed = (G._risingRoundsElapsed || 0) + 1;
      if (G.enemy && G.enemy.hand) {
        G.enemy.hand.forEach(c => { c.rank = Math.min(14, c.rank + 1); });
      }
    }
  },
  blot_spread: {
    name: 'Blot Fiend',
    icon: '🖤',
    desc: 'Ink blots punish retreats — off-suit plays cost 4 extra HP',
    color: '#8855aa',
    // Applied in playCard loss path — checked via getActiveEncounterRule
  },
};

// TIER1-REC4v3: Fixed enemy identity — every enemy has a ruleKey in enemies.json
// Legacy fallback map for enemies that only have passiveKey (backward compat)
const PASSIVE_TO_RULE = {
  suit_restrict: 'suit_variety',
  damage_reduction: 'last_trick_only',
  win_punish: 'countdown',
  armor_on_player_win: 'mirror_rows',
  ink_steal: 'escalating_cost',
  ember_drain: 'descending_ranks',
  double_play: 'high_card_only',
  regen_armor: 'no_repeat_row',
};

function getEncounterRule(enemy) {
  if (enemy.tier !== 'standard') return null;
  // TIER3-13: Mini-bosses now get encounter rules from their template
  // (removed _isMiniBoss exclusion)
  // TIER1-REC4v3: Use fixed ruleKey from enemies.json (primary lookup)
  if (enemy.ruleKey && ENCOUNTER_RULES[enemy.ruleKey]) {
    return ENCOUNTER_RULES[enemy.ruleKey];
  }
  // Legacy fallback: passiveKey → rule mapping
  if (enemy.passiveKey && PASSIVE_TO_RULE[enemy.passiveKey]) {
    return ENCOUNTER_RULES[PASSIVE_TO_RULE[enemy.passiveKey]] || null;
  }
  // No random assignment — every enemy should have a fixed identity
  return null;
}

function initEncounterRule(enemy) {
  // TIER1-REC4: Don't apply encounter rules during special formats
  if (G.encounterFormat && G.encounterFormat !== 'standard') {
    G._activeEncounterRule = null;
    return;
  }
  const rule = getEncounterRule(enemy);
  if (!rule) { G._activeEncounterRule = null; return; }
  G._activeEncounterRule = rule;
  if (rule.init) rule.init();
  // TIER2v4-7: Contextual tip on first encounter with this rule
  const ruleKey = Object.keys(ENCOUNTER_RULES).find(k => ENCOUNTER_RULES[k] === rule);
  if (ruleKey) {
    showContextualTip('rule_' + ruleKey, CONTEXTUAL_TIPS.encounter_rule(rule));
    // TIER2v5-4: Track encounter rule for Codex
    if (!META.analytics.encounterRulesSeen) META.analytics.encounterRulesSeen = {};
    META.analytics.encounterRulesSeen[ruleKey] = (META.analytics.encounterRulesSeen[ruleKey] || 0) + 1;
  }
}

function getActiveEncounterRule() {
  return G._activeEncounterRule || null;
}

// ============================================================
// TIER1-REC5: COMPETITIVE ROW SURGES
// Heart and Shield rows get escalation fantasies that rival Crown.
// Heart: "Chip Doubler" — at streak 4, ALL chip modifiers doubled
//        for the rest of the encounter (permanent power spike).
// Shield: "Shieldbreaker" — at streak 4, next win converts total
//         shield into bonus damage, then shield resets to 0.
// ============================================================

// ============================================================
// TIER2-6: DECISION-CHANGING MODIFIERS
// These modifiers change WHICH card you want to play — not just numbers.
// Dropped from elite/boss encounters as rare Flame/Inferno-tier mods.
// ============================================================
const DECISION_MODIFIERS = [
  {
    id: 'underdog',
    name: 'Underdog\'s Edge',
    desc: 'Lowest-rank card in hand deals ×2 chips',
    icon: '🐕',
    tier: 'flame',
    // Applied in calculateScoreDetailed
  },
  {
    id: 'offsuitcrown',
    name: 'Crown Retreat Mastery',
    desc: 'Off-suit plays on Crown give +0.3× mult',
    icon: '👑',
    tier: 'flame',
    // Applied in playCard loss path
  },
  {
    id: 'lowcard_ember',
    name: 'Ember Siphon',
    desc: 'Win with rank ≤5: +1 Ember per rank below 6',
    icon: '🔥',
    tier: 'flame',
    // Applied in trick resolution
  },
  {
    id: 'suitchain',
    name: 'Suit Chain',
    desc: 'Play same suit as your last card: +0.2× mult bonus',
    icon: '🔗',
    tier: 'flame',
    // Applied in calculateScoreDetailed
  },
  {
    id: 'highrisk',
    name: 'High Stakes',
    desc: 'Playing your highest-rank card triples its base mult',
    icon: '🎰',
    tier: 'flame',
    // Applied in calculateScoreDetailed
  },
  {
    id: 'diversify',
    name: 'Rainbow Weave',
    desc: '+3 chips per unique suit played this round',
    icon: '🌈',
    tier: 'flame',
    // Applied in calculateScoreDetailed — tracked via G._roundSuitsPlayed
  },
];

function hasDecisionModifier(id) {
  return G.modifiers.some(m => m._decisionId === id);
}

function grantRandomDecisionModifier(tierOverride) {
  // Pick a random decision modifier not already owned
  const available = DECISION_MODIFIERS.filter(dm => !hasDecisionModifier(dm.id));
  if (available.length === 0) return null;
  const dm = available[Math.floor(Math.random() * available.length)];
  const tier = tierOverride || dm.tier;
  const mod = {
    name: dm.icon + ' ' + dm.name,
    suit: null, type: 'mult', value: 0, // Value is 0 — effect is special
    tier: tier, persistent: true,
    _decisionId: dm.id,
    _decisionDesc: dm.desc,
  };
  G.modifiers.push(mod);
  return dm;
}

// Track round suits played for Rainbow Weave
function trackRoundSuitPlayed(suit) {
  if (!G._roundSuitsPlayed) G._roundSuitsPlayed = new Set();
  G._roundSuitsPlayed.add(suit);
}

function getDecisionModBonuses(card, row) {
  const bonuses = { chipsMult: 1, multAdd: 0, extraChips: 0, steps: [] };

  // Underdog's Edge: lowest-rank card in hand deals ×2 chips
  if (hasDecisionModifier('underdog')) {
    const lowestRank = Math.min(...G.hand.map(c => c.rank), card.rank);
    if (card.rank === lowestRank) {
      bonuses.chipsMult = 2;
      bonuses.steps.push({ label: '🐕 Underdog ×2 chips', value: '×2', colorClass: 'keyword-color' });
    }
  }

  // High Stakes: highest-rank card triples base mult
  if (hasDecisionModifier('highrisk')) {
    const highestRank = Math.max(...G.hand.map(c => c.rank), card.rank);
    if (card.rank === highestRank) {
      bonuses.multAdd += card.baseMult * 2; // effectively triples (base + 2x base)
      bonuses.steps.push({ label: '🎰 High Stakes ×3 base mult', value: '+' + (card.baseMult * 2).toFixed(2) + '×', colorClass: 'keyword-color' });
    }
  }

  // Suit Chain: same suit as last played card
  if (hasDecisionModifier('suitchain') && G._lastPlayedSuit && G._lastPlayedSuit === card.suit) {
    bonuses.multAdd += 0.2;
    bonuses.steps.push({ label: '🔗 Suit Chain +0.2×', value: '+0.2×', colorClass: 'keyword-color' });
  }

  // Rainbow Weave: +3 chips per unique suit played this round
  if (hasDecisionModifier('diversify') && G._roundSuitsPlayed) {
    const uniqueCount = G._roundSuitsPlayed.size;
    if (uniqueCount > 0) {
      bonuses.extraChips += uniqueCount * 3;
      bonuses.steps.push({ label: '🌈 Rainbow (' + uniqueCount + ' suits)', value: '+' + (uniqueCount * 3), colorClass: 'keyword-color' });
    }
  }

  return bonuses;
}

// 1.3 STRATEGIC ENEMY AI
// ============================================================
function generateEnemy(tier) {
  const actMult = G.act;
  const pool = ENEMY_DATA[tier].map(t => {
    const entry = { name: t.name, hp: t.baseHp + actMult * t.hpPerAct, passive: t.passive };
    if (t.phases) entry.phases = t.phases;
    if (t.signaturePattern) entry.signaturePattern = t.signaturePattern;
    if (t.passiveKey) { entry.passiveKey = t.passiveKey; entry.passiveValue = t.passiveValue || 0; }
    if (t.ruleKey) entry.ruleKey = t.ruleKey; // TIER1-REC4v3: Fixed encounter identity
    if (t.eliteMechanic) { entry.eliteMechanic = t.eliteMechanic; entry.mechanicValue = t.mechanicValue || 0; }
    return entry;
  });
  const template = pool[Math.floor(Math.random() * pool.length)];

  const hand = [];
  const config = ENEMY_DATA.tierConfig[tier];
  const handSize = config.handSize;
  const rankBonus = config.rankBonus;
  const ascRankFloor = G.ascension >= 18 ? 2 : G.ascension >= 6 ? 1 : 0;
  for (let i = 0; i < handSize; i++) {
    const suit = randomBattleSuit();
    const rank = Math.min(14, Math.max(2 + ascRankFloor, Math.floor(Math.random() * 13) + 2 + rankBonus));
    hand.push({ suit, rank, id: 'e' + Math.random().toString(36).substr(2, 6) });
  }

  const enemy = {
    ...template, maxHp: template.hp, armor: 0, tier, hand,
    tricksPerRound: config.tricksPerRound,
    intent: 'attack', intentQueue: [],
    currentPhase: 0, disabledModIdx: -1,
  };

  applyAscensionToEnemy(enemy);
  return enemy;
}

// TIER2-5: Mini-Boss Generator — Tougher than standard, with a gameplay wrinkle
function generateMiniBoss() {
  const pool = ENEMY_DATA.standard.filter(t => t.passiveKey); // Only enemies with mechanics
  const template = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : ENEMY_DATA.standard[0];

  const hp = Math.floor((template.baseHp + G.act * template.hpPerAct) * 1.5);
  const hand = [];
  const handSize = 7; // Between standard (6) and elite (8)
  const rankBonus = 1;
  const ascRankFloor = G.ascension >= 18 ? 2 : G.ascension >= 6 ? 1 : 0;

  for (let i = 0; i < handSize; i++) {
    const suit = randomBattleSuit();
    const rank = Math.min(14, Math.max(2 + ascRankFloor, Math.floor(Math.random() * 13) + 2 + rankBonus));
    hand.push({ suit, rank, id: 'e' + Math.random().toString(36).substr(2, 6) });
  }

  // Pick a random gameplay wrinkle for the mini-boss
  const wrinkles = [
    { name: 'Suit Lock', desc: 'Locks your most-played suit for 1 trick', wrinkleKey: 'suit_lock' },
    { name: 'Mirror Match', desc: 'Copies your last card\'s suit', wrinkleKey: 'mirror_match' },
    { name: 'Rising Fury', desc: '+1 rank per trick this round', wrinkleKey: 'rising_fury' },
    { name: 'Shield Breaker', desc: 'Halves your shield on win', wrinkleKey: 'shield_break' },
  ];
  const wrinkle = wrinkles[Math.floor(Math.random() * wrinkles.length)];

  const enemy = {
    name: '⚡ ' + template.name,
    hp, maxHp: hp,
    passive: template.passive ? template.passive + ' | ' + wrinkle.desc : wrinkle.desc,
    passiveKey: template.passiveKey || null,
    passiveValue: template.passiveValue || 0,
    ruleKey: template.ruleKey || null, // TIER3-13: Mini-bosses inherit encounter rule from template
    wrinkleKey: wrinkle.wrinkleKey,
    armor: 2, tier: 'standard',
    hand,
    tricksPerRound: 3,
    intent: 'attack', intentQueue: [],
    currentPhase: 0, disabledModIdx: -1,
    _isMiniBoss: true,
  };

  applyAscensionToEnemy(enemy);
  return enemy;
}

// TIER2-5: Apply encounter wrinkle effects during tricks
function applyEncounterWrinkle(enemy, context) {
  if (!enemy.wrinkleKey) return;

  if (context === 'trick_start') {
    if (enemy.wrinkleKey === 'rising_fury') {
      enemy.hand.forEach(c => { c.rank = Math.min(14, c.rank + 1); });
      if (G.trickNum > 1) spawnKeywordPopup('⚡ Rising Fury! Enemy +1 rank', 30);
    }
  }

  if (context === 'enemy_win') {
    if (enemy.wrinkleKey === 'shield_break' && G.shield > 0) {
      const lost = Math.floor(G.shield / 2);
      G.shield -= lost;
      if (lost > 0) spawnKeywordPopup(`⚡ Shield Breaker! −${lost} shield`, 30);
    }
    if (enemy.wrinkleKey === 'suit_lock' && G.hand.length > 0) {
      // Find most common suit in player hand
      const suitCounts = {};
      G.hand.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
      const topSuit = Object.entries(suitCounts).sort((a,b) => b[1] - a[1])[0]?.[0];
      if (topSuit) {
        enemy.restrictedSuit = topSuit;
        spawnKeywordPopup(`⚡ Suit Lock! ${SUIT_SYMBOLS[topSuit]} restricted!`, 30);
      }
    }
  }

  if (context === 'player_play' && enemy.wrinkleKey === 'mirror_match') {
    // Enemy's next card tries to match player's suit
    const pSuit = G.selectedCard?.suit;
    if (pSuit) {
      const matching = enemy.hand.filter(c => c.suit === pSuit);
      if (matching.length > 0 && Math.random() < 0.5) {
        // Silently boost a matching card for next trick
        matching[0].rank = Math.min(14, matching[0].rank + 1);
      }
    }
  }
}

// ============================================================
// TIER2-REC4v6: PROGRESSIVE WRINKLE ESCALATION
// Encounters get mechanically richer as the run progresses.
// Encounter 1-2: Pure mechanics (learning)
// Encounter 3: Encounter rule only (already from initEncounterRule)
// Encounter 4-5: Rule + 1 wrinkle applied
// Encounter 6+: Rule + 2 wrinkles layered
// ============================================================
const PROGRESSIVE_WRINKLES = [
  { name: 'Rising Fury', desc: 'Enemy gains +1 rank per trick', wrinkleKey: 'rising_fury' },
  { name: 'Shield Breaker', desc: 'Halves your shield on enemy win', wrinkleKey: 'shield_break' },
  { name: 'Suit Lock', desc: 'Locks your most-played suit for 1 trick', wrinkleKey: 'suit_lock' },
  { name: 'Mirror Match', desc: 'Enemy copies your suit', wrinkleKey: 'mirror_match' },
  { name: 'Ember Tax', desc: 'Lose 1 Ember per lost trick', wrinkleKey: 'ember_tax' },
  { name: 'Escalating Armor', desc: 'Enemy gains +2 armor per round', wrinkleKey: 'escalating_armor' },
];

function applyProgressiveWrinkles(enemy) {
  // Don't apply to bosses, mini-bosses already have wrinkles, or special formats
  if (enemy.tier === 'boss' || enemy._isMiniBoss) return;
  if (G.encounterFormat !== 'standard') return;
  
  const idx = G._combatEncounterIndex || 0;
  
  // Encounters 1-2: No wrinkles (learning phase)
  if (idx < 2) return;
  
  // Encounter 3: Rule only (already applied by initEncounterRule), no extra wrinkle
  if (idx === 2) return;
  
  // Encounter 4-5: Apply 1 wrinkle
  // Encounter 6+: Apply 2 wrinkles
  const wrinkleCount = idx >= 5 ? 2 : 1;
  
  // Pick wrinkles using encounter index as seed for variety
  const available = [...PROGRESSIVE_WRINKLES];
  const applied = [];
  
  for (let i = 0; i < wrinkleCount && available.length > 0; i++) {
    const pick = available.splice((idx + i * 3) % available.length, 1)[0];
    applied.push(pick);
  }
  
  if (applied.length === 0) return;
  
  // Apply first wrinkle as primary wrinkleKey
  if (!enemy.wrinkleKey) {
    enemy.wrinkleKey = applied[0].wrinkleKey;
  }
  
  // Store additional wrinkles for layered application
  enemy._progressiveWrinkles = applied.map(w => w.wrinkleKey);
  
  // Update passive text to show wrinkles
  const wrinkleDescs = applied.map(w => w.desc).join(' | ');
  const wrinkleLabel = applied.map(w => '⚡ ' + w.name).join('  ');
  enemy.passive = enemy.passive ? enemy.passive + ' | ' + wrinkleDescs : wrinkleDescs;
  
  // Show wrinkle announcement
  if (applied.length > 0) {
    setTimeout(() => {
      spawnCriticalPopup(wrinkleLabel, 35);
    }, 800);
  }
}

// TIER2-REC4v6: Apply layered wrinkle effects (extends existing applyEncounterWrinkle)
function applyProgressiveWrinkleEffects(enemy, context) {
  if (!enemy._progressiveWrinkles) return;
  
  for (const wKey of enemy._progressiveWrinkles) {
    if (context === 'trick_start') {
      if (wKey === 'rising_fury') {
        enemy.hand.forEach(c => { c.rank = Math.min(14, c.rank + 1); });
        if (G.trickNum > 1) spawnKeywordPopup('⚡ Rising Fury! Enemy +1 rank', 30);
      }
      if (wKey === 'escalating_armor') {
        const armorGain = 2;
        enemy.armor = (enemy.armor || 0) + armorGain;
        if (G.trickNum === 1) spawnKeywordPopup(`⚡ Escalating Armor: +${armorGain} armor`, 30);
      }
    }
    
    if (context === 'enemy_win') {
      if (wKey === 'shield_break' && G.shield > 0) {
        const lost = Math.floor(G.shield / 2);
        G.shield -= lost;
        if (lost > 0) spawnKeywordPopup(`⚡ Shield Breaker! −${lost} shield`, 30);
      }
      if (wKey === 'suit_lock' && G.hand.length > 0) {
        const suitCounts = {};
        G.hand.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
        const topSuit = Object.entries(suitCounts).sort((a,b) => b[1] - a[1])[0]?.[0];
        if (topSuit) {
          enemy.restrictedSuit = topSuit;
          spawnKeywordPopup(`⚡ Suit Lock! ${SUIT_SYMBOLS[topSuit]} restricted!`, 30);
        }
      }
      if (wKey === 'ember_tax') {
        if (G.embers > 0) {
          G.embers = Math.max(0, G.embers - 1);
          spawnKeywordPopup('⚡ Ember Tax: −1 Ember', 30);
        }
      }
    }
    
    if (context === 'player_play' && wKey === 'mirror_match') {
      const pSuit = G.selectedCard?.suit;
      if (pSuit) {
        const matching = enemy.hand.filter(c => c.suit === pSuit);
        if (matching.length > 0 && Math.random() < 0.5) {
          matching[0].rank = Math.min(14, matching[0].rank + 1);
        }
      }
    }
  }
}
function generateEnemyIntents(enemy) {
  const intents = [];
  const hpPct = enemy.hp / enemy.maxHp;

  // Elite/Boss: use signature patterns if available (with some variation)
  if ((enemy.tier === 'elite' || enemy.tier === 'boss') && enemy.signaturePattern) {
    for (let i = 0; i < enemy.tricksPerRound; i++) {
      if (i < enemy.signaturePattern.length && Math.random() < 0.7) {
        intents.push(enemy.signaturePattern[i]);
      } else {
        // Reactive fallback
        intents.push(getReactiveIntent(enemy, hpPct, i));
      }
    }
    enemy.intentQueue = intents;
    return;
  }

  // REACTIVE INTENTS based on player state
  for (let i = 0; i < enemy.tricksPerRound; i++) {
    intents.push(getReactiveIntent(enemy, hpPct, i));
  }
  enemy.intentQueue = intents;
}

function getReactiveIntent(enemy, hpPct, trickIdx) {
  // Check player streaks - if player has a big streak, be more aggressive
  const maxStreak = Math.max(G.rowStreaks.crown, G.rowStreaks.heart, G.rowStreaks.foundation);
  const playerHasStreak = maxStreak >= 3;

  // Low HP: aggressive
  if (hpPct < 0.33) {
    const roll = Math.random();
    return roll < 0.6 ? 'heavy_attack' : roll < 0.85 ? 'attack' : 'buff';
  }

  // Mid HP: reactive
  if (hpPct < 0.66) {
    if (playerHasStreak && Math.random() < 0.5) return 'heavy_attack'; // Punish streaks
    const roll = Math.random();
    return roll < 0.4 ? 'attack' : roll < 0.6 ? 'heavy_attack' : roll < 0.8 ? 'debuff' : 'defend';
  }

  // High HP: strategic
  if (playerHasStreak && Math.random() < 0.4) return 'debuff'; // Disrupt
  if (G.modifiers.length > 5 && Math.random() < 0.3) return 'debuff';
  const roll = Math.random();
  return roll < 0.35 ? 'attack' : roll < 0.55 ? 'defend' : roll < 0.75 ? 'buff' : 'debuff';
}

// STRATEGIC ENEMY ROW TARGETING
function selectEnemyRow(enemy) {
  const rows = ['crown', 'heart', 'foundation'];

  // TIER3-12: Advanced AI (Ascension 10+) — track and counter player row preferences
  if (G.ascension >= 10 && G._playerRowHistory && G._playerRowHistory.length > 0) {
    const rowCounts = { crown: 0, heart: 0, foundation: 0 };
    G._playerRowHistory.forEach(r => { rowCounts[r] = (rowCounts[r] || 0) + 1; });
    const sortedRows = Object.entries(rowCounts).sort((a, b) => b[1] - a[1]);
    const favoriteRow = sortedRows[0][0];

    // TIER3-12: At Asc 15+, enemies sometimes bait — play a different row to lure player
    if (G.ascension >= 15 && Math.random() < 0.25) {
      // Pick the row the player uses LEAST to force them out of comfort zone
      const leastUsed = sortedRows[sortedRows.length - 1][0];
      return leastUsed;
    }

    // TIER3-12: Counter-pick player's favorite row (70% at Asc 10+, 85% at Asc 15+)
    const counterChance = G.ascension >= 15 ? 0.85 : 0.70;
    if (Math.random() < counterChance) return favoriteRow;
  }

  // Target player's strongest streak
  let maxStreak = 0, targetRow = null;
  rows.forEach(r => {
    if (G.rowStreaks[r] > maxStreak) { maxStreak = G.rowStreaks[r]; targetRow = r; }
  });

  // 60% chance to target highest streak, otherwise random
  if (targetRow && maxStreak >= 2 && Math.random() < 0.6) return targetRow;
  return rows[Math.floor(Math.random() * 3)];
}

// STRATEGIC CARD SELECTION
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

  // TIER3-12: Advanced AI — at Asc 15+, occasional weak card bait
  // Play a weak card to lure player into spending strong cards, then counter next trick
  if (G.ascension >= 15 && G.trickNum === 1 && G.tricksPerRound >= 3 && Math.random() < 0.3) {
    hand.sort((a, b) => a.rank - b.rank);
    const weakCard = hand[0];
    if (weakCard.rank <= 6) {
      G.enemy._baitedLastTrick = true;
      return hand.splice(0, 1)[0];
    }
  }

  // TIER3-12: After a bait trick, play strongest card to capitalize
  if (G.enemy._baitedLastTrick) {
    G.enemy._baitedLastTrick = false;
    hand.sort((a, b) => b.rank - a.rank);
    return hand.splice(0, 1)[0];
  }

  // TIER3-12: Advanced AI — prioritize winning tricks that reset player streaks
  if (G.ascension >= 10) {
    // Find which row has the highest player streak
    let maxStreakRow = null, maxStreakVal = 0;
    ['crown', 'heart', 'foundation'].forEach(r => {
      if ((G.rowStreaks[r] || 0) > maxStreakVal) {
        maxStreakVal = G.rowStreaks[r]; maxStreakRow = r;
      }
    });
    // If player has a big streak, enemy plays strongest card to try to win and break it
    if (maxStreakVal >= 3 && Math.random() < 0.65) {
      hand.sort((a, b) => b.rank - a.rank);
      return hand.splice(0, 1)[0];
    }
  }

  // STRATEGIC: Check revealed player hand via Spades and counter-pick suit
  if (G.enemy.tier !== 'standard') {
    // Try to pick suits the player might play
    const playerSuits = G.hand.map(c => c.suit);
    const suitCounts = {};
    playerSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });

    // Find enemy cards that match player's most common suit
    const sortedPlayerSuits = Object.entries(suitCounts).sort((a,b) => b[1] - a[1]);
    if (sortedPlayerSuits.length > 0 && Math.random() < 0.5) {
      const targetSuit = sortedPlayerSuits[0][0];
      const matchingCards = hand.filter(c => c.suit === targetSuit).sort((a,b) => b.rank - a.rank);
      if (matchingCards.length > 0) {
        const chosen = matchingCards[0];
        const idx = hand.indexOf(chosen);
        return hand.splice(idx, 1)[0];
      }
    }
  }

  // Default behavior with HP-based logic
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
  // Find the most advanced phase the boss should be in
  // Phases are ordered with descending thresholds [1.0, 0.66, 0.33]
  // We want the LAST phase whose threshold is >= hpPct (highest index that matches)
  let newPhaseIdx = 0;
  for (let i = 0; i < G.enemy.phases.length; i++) {
    if (hpPct <= G.enemy.phases[i].threshold) newPhaseIdx = i;
  }
  if (newPhaseIdx > oldPhase) {
    G.enemy.currentPhase = newPhaseIdx;
    const phase = G.enemy.phases[newPhaseIdx];
    AudioEngine.phaseTransition();
    // TIER2v4-7: Contextual tip on first boss phase transition
    showContextualTip('boss_phase', CONTEXTUAL_TIPS.boss_phase);
    const flash = document.createElement('div');
    flash.className = 'phase-flash';
    document.getElementById('battle-screen').appendChild(flash);
    setTimeout(() => flash.remove(), 800);
    document.getElementById('battle-screen').classList.add('screen-shake');
    setTimeout(() => document.getElementById('battle-screen').classList.remove('screen-shake'), 400);
    // TIER2v3-7: Dramatic phase announcement
    showPhaseAnnouncement(newPhaseIdx, phase.name, phase.effect);
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
    // TIER2v4-8: Reset siege lock consecutive win counter at round start
    if (phase.effect === 'siege_lock') G._siegeConsecutiveWins = 0;
  }
  if (context === 'enemy_card_boost') {
    if (phase.effect === 'diamond_boost' && eCard?.suit === 'diamonds') return 3;
    if (phase.effect === 'double_play') return 3;
  }
  return extra;
}

// TIER2v4-8: Get effective suit under Void Librarian's Mirror Realm (suit reversal)
function getBossEffectiveSuit(suit) {
  const phase = getCurrentPhase();
  if (!phase || phase.effect !== 'suit_reversal') return suit;
  const SUIT_REVERSAL = { hearts: 'spades', spades: 'hearts', diamonds: 'clubs', clubs: 'diamonds', stars: 'stars' };
  return SUIT_REVERSAL[suit] || suit;
}

// TIER2v4-8: Check if boss siege lock blocks damage (Iron Marshal Phase 3)
function isSiegeLockBlocking() {
  const phase = getCurrentPhase();
  if (!phase || phase.effect !== 'siege_lock') return false;
  return (G._siegeConsecutiveWins || 0) < 2;
}

// TIER2v4-8: Update siege lock counter after trick
function updateSiegeLockCounter(won) {
  const phase = getCurrentPhase();
  if (!phase || phase.effect !== 'siege_lock') return;
  if (won) {
    G._siegeConsecutiveWins = (G._siegeConsecutiveWins || 0) + 1;
  } else {
    G._siegeConsecutiveWins = 0;
  }
}

// ============================================================
// TIER2-9: ENHANCED ENEMY TELEGRAPH SYSTEM
// ============================================================
const INTENT_CONFIG = {
  attack:       { icon: '⚔️', label: 'Attack',  threat: 'medium', color: '#e06040', desc: 'Deals standard damage' },
  heavy_attack: { icon: '🔥', label: 'Heavy',   threat: 'high',   color: '#ff3333', desc: 'Deals increased damage (+2 rank)' },
  defend:       { icon: '🛡️', label: 'Defend',  threat: 'low',    color: '#55aa88', desc: 'Gains armor, reduced aggression' },
  buff:         { icon: '⬆️', label: 'Buff',    threat: 'low',    color: '#ddaa44', desc: 'Strengthens remaining cards (+1 rank)' },
  debuff:       { icon: '💀', label: 'Debuff',  threat: 'high',   color: '#aa55cc', desc: 'Weakens your scoring (×1.3 dmg)' },
};

function getIntentIcon(intent) {
  const cfg = INTENT_CONFIG[intent] || INTENT_CONFIG.attack;
  return `${cfg.icon} ${cfg.label}`;
}
function getIntentColor(intent) {
  const cfg = INTENT_CONFIG[intent] || INTENT_CONFIG.attack;
  return cfg.color;
}

function getEnemyDamageRange(enemy, intent) {
  // Calculate estimated damage range the enemy will deal if they win a trick
  const hand = enemy.hand || [];
  if (hand.length === 0) return { min: 0, max: 0 };

  const ranks = hand.map(c => c.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);

  const calcDmg = (rank) => {
    let dmg = Math.floor(rank * 0.8 * G.act);
    if (enemy.tier === 'boss') dmg = Math.floor(dmg * 1.5);
    if (intent === 'debuff') dmg = Math.floor(dmg * 1.3);
    if (intent === 'heavy_attack') dmg = Math.floor((Math.min(14, rank + 2)) * 0.8 * G.act * (enemy.tier === 'boss' ? 1.5 : 1));
    if (G.ascension >= 12) dmg = Math.floor(dmg * 1.2);
    return dmg;
  };

  return { min: calcDmg(minRank), max: calcDmg(maxRank) };
}

function getThreatLevel(intent) {
  return (INTENT_CONFIG[intent] || INTENT_CONFIG.attack).threat;
}

function renderEnemyIntentDisplay(enemy, intent) {
  const cfg = INTENT_CONFIG[intent] || INTENT_CONFIG.attack;
  const dmgRange = getEnemyDamageRange(enemy, intent);
  const threat = cfg.threat;

  // Build threat bar segments
  const threatBars = threat === 'high' ? '◆◆◆' : threat === 'medium' ? '◆◆◇' : '◆◇◇';

  let html = `<div class="intent-display intent-threat-${threat}">`;
  html += `<span class="intent-icon-large">${cfg.icon}</span>`;
  html += `<div class="intent-details">`;
  html += `<span class="intent-label" style="color:${cfg.color}">${cfg.label}</span>`;
  html += `<span class="intent-threat-bar" style="color:${cfg.color}">${threatBars}</span>`;

  // Show damage range for attack intents
  if (intent === 'attack' || intent === 'heavy_attack' || intent === 'debuff') {
    if (dmgRange.min === dmgRange.max) {
      html += `<span class="intent-damage">~${dmgRange.min} dmg</span>`;
    } else {
      html += `<span class="intent-damage">${dmgRange.min}–${dmgRange.max} dmg</span>`;
    }
  } else {
    html += `<span class="intent-damage intent-nodmg">${cfg.desc}</span>`;
  }

  html += `</div></div>`;

  // Show upcoming intents (next 1-2)
  if (enemy.intentQueue && enemy.intentQueue.length > 1) {
    const currentIdx = G.trickNum - 1;
    const upcoming = enemy.intentQueue.slice(currentIdx + 1, currentIdx + 3);
    if (upcoming.length > 0) {
      html += `<div class="intent-upcoming">`;
      html += `<span class="intent-upcoming-label">Next:</span>`;
      upcoming.forEach(ni => {
        const ncfg = INTENT_CONFIG[ni] || INTENT_CONFIG.attack;
        html += `<span class="intent-upcoming-pip intent-threat-${ncfg.threat}" title="${ncfg.label}" style="color:${ncfg.color}">${ncfg.icon}</span>`;
      });
      html += `</div>`;
    }
  }

  return html;
}

// ============================================================
// 1.2 UNIFIED resolveTrick() — Single source of truth
// ============================================================
function resolveTrick(pCard, row, eCard) {
  // Pure calculation — does NOT mutate G
  const playerLeads = G.playerLeads;

  // TIER3-11: Cursed cards always lose and deal self-damage
  if (pCard._isCursed || pCard.keywords.includes('Curse')) {
    const curseDmg = G.ascension >= 19 ? 5 : 3;
    return {
      playerWins: false,
      isTrump: false,
      suitMatches: false,
      isClash: false,
      effectiveMatch: false,
      crownOnLoss: false,
      hasAnchor: false,
      scoreResult: null,
      incomingDamage: { raw: curseDmg, afterShield: curseDmg, shieldUsed: 0, absorbed: false, isCurseDamage: true },
      synergies: [],
      ghostGambler: false,
      suitsReversed: false,
      wins: false,
      _cursedPlayed: true,
    };
  }
  
  // TIER2v4-8: Void Librarian Mirror Realm — reverse suits for comparison
  const pEffSuit = getBossEffectiveSuit(pCard.suit);
  const eEffSuit = getBossEffectiveSuit(eCard.suit);
  const suitsReversed = (pEffSuit !== pCard.suit || eEffSuit !== eCard.suit);
  
  // Suit matching depends on who leads
  // Stars is UNIVERSAL — it matches ANY suit from either side
  // When player leads: enemy must match PLAYER's suit — suitMatches checks if enemy followed
  // When enemy leads: player must match ENEMY's suit — suitMatches checks if player followed
  const suitMatches = pEffSuit === eEffSuit || pEffSuit === 'stars' || eEffSuit === 'stars';

  let isTrump = false;
  if (G.trumpSuit && pCard.suit === G.trumpSuit && pEffSuit !== eEffSuit) isTrump = true;
  if (hasRelic('wild_trump') && pCard.keywords.length >= 2 && pEffSuit !== eEffSuit) isTrump = true;

  const effectiveMatch = suitMatches || isTrump;
  const hasSwift = pCard.keywords.includes('Swift');

  // Check if the FOLLOWER failed to match the leader's suit
  // Stars is universal — playing Stars always counts as following suit
  const enemyFollowedSuit = (eEffSuit === pEffSuit) || (eEffSuit === 'stars') || (pEffSuit === 'stars');
  const playerFollowedSuit = suitMatches; // Stars universal both ways

  let playerWins = false;
  
  if (playerLeads && !enemyFollowedSuit && !isTrump) {
    // PLAYER LED and enemy played off-suit — player auto-wins (standard trick-taking rule)
    playerWins = true;
  } else if (isTrump) {
    playerWins = hasSwift ? pCard.rank >= eCard.rank : pCard.rank > eCard.rank;
  } else if (suitMatches) {
    // Both playing same suit — higher rank wins
    // Mirror keyword: copy enemy rank before comparison
    let effectiveRank = pCard.rank;
    if (pCard.keywords.includes('Mirror')) effectiveRank = eCard.rank;
    playerWins = hasSwift ? effectiveRank >= eCard.rank : effectiveRank > eCard.rank;
  }
  // else: player is following and played off-suit — playerWins stays false (correct)

  const isClash = row === G.enemyRow;
  const crownOnLoss = !playerWins && row === 'crown' && hasRelic('shattered_crown');
  const hasAnchor = pCard.keywords.includes('Anchor');

  // Keyword synergies
  const synergies = getKeywordSynergies(pCard);

  // Ghost Gambler synergy: Phantom+Gambit = no damage on loss + card returns
  const ghostGambler = synergies.some(s => s.effect === 'ghost_gambler');

  // Score calculation for wins
  let scoreResult = null;
  if (playerWins || crownOnLoss) {
    scoreResult = calculateScoreDetailed(pCard, row, synergies);

    // Apply Burn keyword: ×3 damage (or ×4 with archetype milestone)
    if (pCard.keywords.includes('Burn')) {
      const burnMult = hasArchetypeMilestone('burn_upgrade') ? 4 : 3;
      scoreResult.total = Math.floor(scoreResult.total * burnMult);
      scoreResult.steps.push({ label: `Burn ×${burnMult}`, value: '×' + burnMult, colorClass: 'keyword-color' });
    }

    // Gambit keyword: double score on win
    if (pCard.keywords.includes('Gambit')) {
      scoreResult.total *= 2;
      scoreResult.steps.push({ label: 'Gambit ×2', value: '×2', colorClass: 'keyword-color' });
    }

    // Crown Surge
    let crownSurgeApplied = false;
    if (G.crownSurgeActive) {
      scoreResult.total *= 2;
      scoreResult.steps.push({ label: 'Crown Surge', value: '×2', colorClass: 'bonus-color' });
      crownSurgeApplied = true;
    }

    // Siphon keyword: steal enemy armor as bonus chips
    let siphonChips = 0;
    if (pCard.keywords.includes('Siphon') && (G.enemy?.armor || 0) > 0) {
      siphonChips = Math.min(G.enemy.armor, 15);
      scoreResult.total += siphonChips;
      scoreResult.steps.push({ label: `Siphon +${siphonChips}`, value: '+' + siphonChips, colorClass: 'keyword-color' });
    }

    // Siege Engine synergy: remove ALL enemy armor
    const siegeEngine = synergies.some(s => s.effect === 'siege_engine');

    // Archetype milestone: shield_damage - shield converts to bonus dmg
    if (hasArchetypeMilestone('shield_damage') && G.shield > 0) {
      const shieldBonus = Math.floor(G.shield * 0.5);
      scoreResult.total += shieldBonus;
      scoreResult.steps.push({ label: 'Iron Wall', value: '+' + shieldBonus, colorClass: 'bonus-color' });
    }

    // TIER1-2: Vengeance multiplier from sacrifice charges
    let vengeanceApplied = false;
    if (G.sacrificeCharge >= 3) {
      scoreResult.total = Math.floor(scoreResult.total * 2.5);
      scoreResult.steps.push({ label: 'VENGEANCE ×2.5', value: '×2.5', colorClass: 'keyword-color' });
      vengeanceApplied = true;
    }

    // TIER1-2: Crown Gambit — bonus chips from stored Crown losses
    if (row === 'crown' && G.crownGambitStored > 0) {
      scoreResult.total += G.crownGambitStored;
      scoreResult.steps.push({ label: 'Crown Gambit', value: '+' + G.crownGambitStored, colorClass: 'bonus-color' });
    }

    scoreResult.vengeanceApplied = vengeanceApplied;

    scoreResult.crownSurgeApplied = crownSurgeApplied;
    scoreResult.siphonChips = siphonChips;
    scoreResult.siegeEngine = siegeEngine;
    scoreResult.vengeanceApplied = scoreResult.vengeanceApplied || false;
  }

  // Incoming damage on loss
  let incomingDamage = { raw: 0, afterShield: 0, shieldUsed: 0, absorbed: false };
  if (!(playerWins || crownOnLoss)) {
    const hasAbsorb = pCard.keywords.includes('Absorb') || ghostGambler;
    if (hasAbsorb) {
      incomingDamage = { raw: 0, afterShield: 0, shieldUsed: 0, absorbed: true };
    } else {
      let eDmg = Math.floor(eCard.rank * 0.8 * G.act);
      if (G.enemy?.tier === 'boss') eDmg = Math.floor(eDmg * 1.5);
      if (G.enemy?.intent === 'debuff') eDmg = Math.floor(eDmg * 1.3);
      if (isClash) eDmg = Math.floor(eDmg * 1.5);
      if (G.ascension >= 12) eDmg = Math.floor(eDmg * 1.2);

      // TIER1-REC5v3: Betrayal disruption — ×1.5 damage while active
      if (G._betrayalDmgBoost > 0) eDmg = Math.floor(eDmg * 1.5);

      // Gambit keyword: double damage on loss
      if (pCard.keywords.includes('Gambit') && !ghostGambler) eDmg *= 2;

      const shieldUsed = Math.min(eDmg, G.shield);
      const afterShield = Math.max(0, eDmg - G.shield);
      incomingDamage = { raw: eDmg, afterShield, shieldUsed };
    }
  }

  return {
    playerWins,
    isTrump,
    suitMatches,
    isClash,
    effectiveMatch,
    crownOnLoss,
    hasAnchor,
    scoreResult,
    incomingDamage,
    synergies,
    ghostGambler,
    suitsReversed, // TIER2v4-8: Void Librarian Mirror Realm
    wins: playerWins || crownOnLoss,
  };
}

// ===== ENCOUNTER =====
function startEncounter(enemy) {
  G.enemy = enemy;
  G.roundNum = 0; G.trickNum = 0; G.roundScore = 0;
  G.playerLeads = false;
  G.consecutiveWins = 0; G.shield = 0;
  G.tricksPerRound = enemy.tricksPerRound;
  G._battleFocus = 'hand'; // TIER1-REC1v3: Focus mode state

  // TIER2-5: Run Pacing Curve — shorter Act 1 standard encounters
  if (G.act === 1 && enemy.tier === 'standard') {
    G.tricksPerRound = 2;
    enemy.tricksPerRound = 2;
  }
  // Mini-boss encounters get an extra trick
  if (enemy._isMiniBoss) {
    G.tricksPerRound = Math.min(G.tricksPerRound + 1, 5);
    enemy.tricksPerRound = G.tricksPerRound;
  }

  G.rowStreaks = { crown: 0, heart: 0, foundation: 0 };
  G.hand = []; G.burnPile = [];
  G.selectedCard = null; G.selectedRow = null;
  G.revealedEnemyCards = [];
  G.echoNextTrick = false; G.echoSuit = null;
  // TIER3-12: Advanced AI — track player row preferences this encounter
  G._playerRowHistory = [];
  G.enemyRow = null;
  G.surgeFired = { crown: false, heart: false, foundation: false };
  G.crownSurgeActive = false;
  // TIER1-2: Reset sacrifice on new encounter
  G.sacrificeCharge = 0;
  G.crownGambitStored = 0;
  // TIER1-3: Preserve format if already set (bid/puzzle set it before calling startEncounter)
  if (G.encounterFormat !== 'bid' && G.encounterFormat !== 'puzzle') {
    G.encounterFormat = 'standard';
  }

  if (hasRelic('suit_trump')) {
    const sc = {};
    SUITS.forEach(s => { sc[s] = G.deck.filter(c => c.suit === s).length; });
    G.trumpSuit = Object.entries(sc).sort((a,b) => b[1] - a[1])[0][0];
  } else G.trumpSuit = null;

  G.modifiers = G.modifiers.filter(m => m.tier !== 'spark' || m.persistent);
  if (hasRelic('iron_scales')) G.shield = 5;
  if (hasArchetypeMilestone('round_shield')) G.shield += 15;
  if (hasRelic('cracked_monocle') && enemy.hand.length >= 2)
    G.revealedEnemyCards = [{ ...enemy.hand[0] }, { ...enemy.hand[1] }];
  if (hasArchetypeMilestone('reveal_all'))
    G.revealedEnemyCards = enemy.hand.map(c => ({ ...c }));
  // Unlocked relic effects at encounter start
  if (hasRelic('crown_jewel')) G.rowStreaks.crown = 2;
  if (hasRelic('ink_reservoir')) G.ink += 15;
  if (hasRelic('memorial')) {
    const memMult = (META.totalLosses || 0) * 0.01;
    if (memMult > 0) G.modifiers.push({ name: 'Memorial', suit: null, type: 'mult', value: +memMult.toFixed(2), tier: 'spark', persistent: false });
  }
  if (hasRelic('first_trick_triple')) G._firstTrickTriple = true;

  // TIER1-REC4: Initialize encounter identity rule
  initEncounterRule(enemy);

  // TIER2-REC4v6: Progressive wrinkle escalation based on encounter count
  applyProgressiveWrinkles(enemy);

  // TIER1-REC5: Reset competitive row states per encounter
  G.heartChipDoubler = false;
  G.shieldBreakerReady = false;
  G._crownSurgeUsedThisEncounter = false; // TIER2v4-9: Crown Surge once per encounter
  G._shieldBreakerRate = 1.0;

  showScreen('battle-screen');
  AudioEngine.startMusic(G.act);
  document.getElementById('matrix-panel').classList.remove('open');
  // TIER1-REC1v6: Reset Layer 3 encounter rule auto-dismiss for new encounter
  const ruleBannerReset = document.getElementById('encounter-rule-banner');
  if (ruleBannerReset) {
    ruleBannerReset._initialShown = false;
    ruleBannerReset.classList.remove('rule-dismissed');
  }
  // TIER1-REC1v6: Reset Layer 2 expansion state
  _layer2Expanded = false;
  const bs = document.getElementById('battle-screen');
  if (bs) bs.classList.remove('layer2-expanded');
  clearRows();
  startRound();
}

function startRound() {
  G.roundNum++; G.trickNum = 0; G.roundScore = 0; G.consecutiveWins = 0;
  // TIER2-6: Reset round tracking for Rainbow Weave
  G._roundSuitsPlayed = new Set();
  // TIER3-13: Reset Path Warden's _lastRowPlayed at round boundaries
  G._lastRowPlayed = null;

  if (G.deck.length < 7) { G.deck.push(...G.burnPile); G.burnPile = []; shuffleArray(G.deck); }
  shuffleArray(G.deck);
  const drawCount = Math.min(G.ascension >= 8 ? 6 : 7, G.deck.length);
  G.hand = G.deck.splice(0, drawCount);

  // TIER3-11: Contextual tip for cursed cards in hand
  if (G.hand.some(c => c._isCursed)) {
    showContextualTip('cursed_card', '🌑 <strong>Corrupted Card</strong> in hand — it cannot win tricks and deals self-damage when played. Remove Cursed cards at Rest Sites using Purify.');
  }

  if (G.hand.length === 0) {
    for (let i = 0; i < 5; i++) G.hand.push(makeCard(randomBattleSuit(), Math.floor(Math.random()*8)+2, 'common'));
  }

  while (G.enemy.hand.length < G.tricksPerRound) {
    const availSuits = getAvailableBattleSuits();
    const suit = availSuits[Math.floor(Math.random() * availSuits.length)];
    const rank = Math.min(14, Math.floor(Math.random() * 13) + 2 + (G.enemy.tier === 'boss' ? 3 : G.enemy.tier === 'elite' ? 1 : 0));
    G.enemy.hand.push({ suit, rank, id: 'e' + Math.random().toString(36).substr(2, 6) });
  }

  applyBossPhaseEffects('round_start', null, null, false, 0);
  generateEnemyIntents(G.enemy);

  // REC6-v7: Desperate Surge twist — force heavy attacks this round
  if (G.enemy._desperateSurge) {
    G.enemy.intentQueue = G.enemy.intentQueue.map(() => 'heavy_attack');
    G.enemy._desperateSurge = false;
    G._desperateSurgeRound = true; // Track for ×2 damage if player wins all tricks
    G._desperateSurgeWins = 0;
    spawnCriticalPopup('💥 DESPERATE SURGE! Enemy goes all-in!', 32);
  } else {
    G._desperateSurgeRound = false;
  }

  // --- ENEMY PASSIVES at round start ---
  // Legacy name-based passives
  if (G.enemy.name === 'Page Golem') G.enemy.armor += 5;
  if (G.enemy.name === 'Eraser Wraith' && G.modifiers.length > 0) {
    const sorted = G.modifiers.map((m,i) => ({val: m.value, idx: i})).sort((a,b) => a.val - b.val);
    G.enemy.disabledModIdx = sorted[0].idx;
  }

  // New passiveKey-based system
  if (G.enemy.passiveKey === 'regen_armor') {
    const armorGain = G.enemy.passiveValue || 3;
    G.enemy.armor += armorGain;
    spawnKeywordPopup(`🛡️ ${G.enemy.name}: +${armorGain} armor`, 30);
  }
  if (G.enemy.passiveKey === 'suit_restrict') {
    // Restrict a random suit for this round
    G.enemy.restrictedSuit = randomBattleSuit();
    spawnKeywordPopup(`🚫 ${G.enemy.name} restricts ${SUIT_SYMBOLS[G.enemy.restrictedSuit]}!`, 30);
  }
  if (G.enemy.passiveKey === 'ember_drain') {
    const drain = G.enemy.passiveValue || 2;
    G.embers = Math.max(0, G.embers - drain);
    spawnKeywordPopup(`🦋 Ember Moth burns ${drain} Embers!`, 30);
  }

  // Elite mechanics: disable_mod, copy_mod
  if (G.enemy.eliteMechanic === 'disable_mod' && G.modifiers.length > 0) {
    const sorted = G.modifiers.map((m,i) => ({val: m.value, idx: i})).sort((a,b) => a.val - b.val);
    G.enemy.disabledModIdx = sorted[0].idx;
  }
  if (G.enemy.eliteMechanic === 'armor_stack') {
    G.enemy.armor += 5 + G.act;
    spawnKeywordPopup(`🛡️ ${G.enemy.name}: +${5 + G.act} armor`, 30);
  }

  // Alternating immune: reset trick counter for the round
  if (G.enemy.eliteMechanic === 'alternating_immune') {
    G.enemy.immuneThisTrick = false; // first trick: vulnerable
  }

  if (hasRelic('ember_core')) G.modifiers.push({ name: 'Ember Core', suit: null, type: 'mult', value: 0.1, tier: 'spark', persistent: false });

  updateBattleUI();
  startTrick();
}

function startTrick() {
  G.trickNum++;
  G.selectedCard = null; G.selectedRow = null; G.enemyCard = null;
  G._spectacleTrickActive = false; // Reset each trick
  G._lastLossReason = ''; // REC1-v7: Clear loss reason each trick
  setBattleFocus('hand'); // TIER1-REC1v3: Focus mode — hand prominent

  // TIER1-REC2v6: Check for Aha Moment spectacle trick
  if (G.trickNum === 3 && isAhaMomentEligible() && G.tricksWon >= 2) {
    seedSpectacleTrick();
    // Skip normal enemy card generation — we've pre-seeded it
    G.phase = 'player_choose';
    enableRowSelection(true);
    updateBattleUI();
    // Show hint on the spectacle card
    setTimeout(() => {
      const aceEl = document.querySelector('.hand-card[data-spectacle="true"]');
      if (aceEl) aceEl.classList.add('spectacle-highlight');
    }, 300);
    return;
  }

  const currentIntent = G.enemy.intentQueue[G.trickNum - 1] || 'attack';
  G.enemy.intent = currentIntent;

  // TIER2-5: Apply encounter wrinkle effects at trick start
  applyEncounterWrinkle(G.enemy, 'trick_start');
  // TIER2-REC4v6: Apply progressive wrinkle effects
  applyProgressiveWrinkleEffects(G.enemy, 'trick_start');

  // TIER1-REC4: Apply encounter rule at trick start
  const encounterRule = getActiveEncounterRule();
  if (encounterRule && encounterRule.onTrickStart) encounterRule.onTrickStart();

  if (currentIntent === 'defend') G.enemy.armor += Math.floor(2 + G.act);
  else if (currentIntent === 'buff') G.enemy.hand.forEach(c => { c.rank = Math.min(14, c.rank + 1); });

  if (G.playerLeads) {
    // Player leads: they choose first, enemy responds after
    G.phase = 'player_choose';
    G.enemyRow = null;
    enableRowSelection(true);
    updateBattleUI();
  } else {
    // Enemy leads: pick card and row first (original flow)
    G.phase = 'enemy_led';
    G.enemyRow = selectEnemyRow(G.enemy);
    G.enemyCard = enemySelectCard();
    if (!G.enemyCard) G.enemyCard = { suit: randomBattleSuit(), rank: 2, id: 'epass' };

    if (currentIntent === 'heavy_attack') G.enemyCard.rank = Math.min(14, G.enemyCard.rank + 2);

    const rankBoost = applyBossPhaseEffects('enemy_card_boost', null, G.enemyCard, false, 0);
    if (rankBoost) G.enemyCard.rank = Math.min(14, G.enemyCard.rank + rankBoost);

    updateBattleUI();
    // BUGFIX: Mark that enemy has played so focus-hand shows their card
    const bs = document.getElementById('battle-screen');
    if (bs && G.enemyCard) bs.classList.add('enemy-has-played');
    G.phase = 'player_choose';
    enableRowSelection(true);
  }
}

// Enemy responds reactively when player leads
function enemyRespondToPlayer(pCard, pRow) {
  const currentIntent = G.enemy.intent || 'attack';

  // Strategic row selection: try to clash with player's row or target strategically
  const rows = ['crown', 'heart', 'foundation'];

  // TIER1-REC4: Encounter rule — force enemy row if applicable
  const respRule = getActiveEncounterRule();
  if (respRule && respRule.forceEnemyRow) {
    G.enemyRow = respRule.forceEnemyRow(pRow);
  } else if (G.ascension >= 10 && (G.rowStreaks[pRow] || 0) >= 3 && Math.random() < 0.8) {
    // TIER3-12: Advanced AI — if player has a big streak on this row, always contest to break it
    G.enemyRow = pRow;
  } else if (Math.random() < 0.55) {
    // Try to contest the player's chosen row (clash)
    G.enemyRow = pRow;
  } else {
    G.enemyRow = selectEnemyRow(G.enemy);
  }

  // Strategic card selection: try to beat the player's card
  const hand = G.enemy.hand;
  if (hand.length === 0) {
    G.enemyCard = { suit: randomBattleSuit(), rank: 2, id: 'epass' };
    return;
  }

  // TIER3-12: Advanced AI (Asc 10+) — smarter card selection when responding
  if (G.ascension >= 10 && G.enemyRow === pRow) {
    // When contesting (same row = clash), try harder to win
    const matchingSuit = hand.filter(c => c.suit === pCard.suit).sort((a, b) => b.rank - a.rank);
    const higherMatching = matchingSuit.filter(c => c.rank > pCard.rank);

    // Asc 10+: higher probability of playing winning cards
    const winChance = G.ascension >= 15 ? 0.85 : 0.75;
    if (higherMatching.length > 0 && Math.random() < winChance) {
      // Play the lowest card that still beats the player (efficient use of resources)
      const chosen = higherMatching[higherMatching.length - 1];
      const idx = hand.indexOf(chosen);
      G.enemyCard = hand.splice(idx, 1)[0];
    } else {
      // Fall back to strongest card available
      hand.sort((a, b) => b.rank - a.rank);
      G.enemyCard = hand.splice(0, 1)[0];
    }
  } else {
    // Original response logic for non-advanced or non-contesting
    // Try to counter player's suit with a winning card
    const matchingSuit = hand.filter(c => c.suit === pCard.suit).sort((a,b) => b.rank - a.rank);
    const higherMatching = matchingSuit.filter(c => c.rank > pCard.rank);

    if (higherMatching.length > 0 && Math.random() < 0.7) {
      // Play the lowest card that still beats the player
      const chosen = higherMatching[higherMatching.length - 1];
      const idx = hand.indexOf(chosen);
      G.enemyCard = hand.splice(idx, 1)[0];
    } else if (matchingSuit.length > 0 && Math.random() < 0.4) {
      // Play a matching suit card even if it might lose
      const chosen = matchingSuit[0];
      const idx = hand.indexOf(chosen);
      G.enemyCard = hand.splice(idx, 1)[0];
    } else {
      // Fall back to standard selection
      G.enemyCard = enemySelectCard();
      if (!G.enemyCard) G.enemyCard = { suit: randomBattleSuit(), rank: 2, id: 'epass' };
    }
  }

  if (currentIntent === 'heavy_attack') G.enemyCard.rank = Math.min(14, G.enemyCard.rank + 2);

  const rankBoost = applyBossPhaseEffects('enemy_card_boost', null, G.enemyCard, false, 0);
  if (rankBoost) G.enemyCard.rank = Math.min(14, G.enemyCard.rank + rankBoost);
}

function selectCard(cardId) {
  if (G.phase !== 'player_choose') return;
  G.selectedCard = G.hand.find(c => c.id === cardId) || null;
  AudioEngine.cardSelect();

  // Auto-select row if only one is available (onboarding stage 1)
  const availRows = getAvailableRows();
  if (availRows.length === 1 && !G.selectedRow) {
    G.selectedRow = availRows[0];
    updateRowHighlight();
  }

  if (G.selectedCard?.keywords.includes('Linked')) {
    const synergies = getKeywordSynergies(G.selectedCard);
    const pullCount = synergies.some(s => s.effect === 'chain_reaction') ? 2 : 1;
    const sameInDeck = G.deck.filter(c => c.suit === G.selectedCard.suit).sort((a,b) => b.rank - a.rank);
    for (let p = 0; p < pullCount && p < sameInDeck.length && G.hand.length < 10; p++) {
      const pulled = sameInDeck[p];
      G.deck = G.deck.filter(c => c.id !== pulled.id);
      G.hand.push(pulled);
      spawnKeywordPopup('LINKED: +' + RANK_NAMES[pulled.rank] + SUIT_SYMBOLS[pulled.suit], 60 - p*10);
    }
  }

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

// ===== CORE: PLAY CARD (now uses resolveTrick) =====
function playCard() {
  if (!G.selectedCard || !G.selectedRow || G.phase !== 'player_choose') return;
  G.phase = 'resolving';
  setBattleFocus('resolving'); // TIER1-REC1v3: Focus mode — resolving trick
  enableRowSelection(false);
  META.cardsPlayed++;
  // TIER2v3-8: Hide mobile play button on play
  const mpb = document.getElementById('mobile-play-btn');
  if (mpb) mpb.classList.remove('visible');

  // TIER1-REC3: Reset trick effects collector
  _trickEffects = [];

  const pCard = G.selectedCard;
  let eCard = G.enemyCard;
  const row = G.selectedRow;

  // TIER2-11: Track row play and win analytics (moved after row declaration)
  const rowAnalytics = META.analytics.rowWinRates;
  if (rowAnalytics[row]) {
    rowAnalytics[row].plays = (rowAnalytics[row].plays || 0) + 1;
  }
  // TIER3-12: Track player row preference for advanced AI
  if (G._playerRowHistory) G._playerRowHistory.push(row);

  // Track card in codex
  trackCardInCodex(pCard);
  
  // TIER2v4-7: Contextual tip for first-time keyword encounters
  if (pCard.keywords && pCard.keywords.length > 0) {
    pCard.keywords.forEach(kw => {
      showContextualTip('keyword_' + kw, CONTEXTUAL_TIPS.keyword(kw));
    });
  }

  AudioEngine.cardPlay(pCard.suit);

  // TIER2-6: Track suit for decision modifiers
  G._lastPlayedSuit = pCard.suit;
  trackRoundSuitPlayed(pCard.suit);

  G.hand = G.hand.filter(c => c.id !== pCard.id);

  // TIER1-REC4: Encounter rule — track card played
  const encounterRule = getActiveEncounterRule();
  if (encounterRule && encounterRule.onCardPlayed) encounterRule.onCardPlayed(pCard, row);

  // If player is leading, enemy responds now
  if (G.playerLeads && !eCard) {
    enemyRespondToPlayer(pCard, row);
    eCard = G.enemyCard;
    updateBattleUI(); // Show enemy's response card
  }

  // *** USE UNIFIED resolveTrick ***
  const outcome = resolveTrick(pCard, row, eCard);

  // TIER1-REC2v6: Apply spectacle multiplier for first-run aha moment
  if (G._spectacleTrickActive && outcome.wins && outcome.scoreResult) {
    applySpectacleMultiplier(outcome.scoreResult);
    outcome.scoreResult.total = Math.max(outcome.scoreResult.total, 80);
  }

  // TIER1-REC3v3: Consolidated into score breakdown instead of floating popups
  if (outcome.isClash) collectTrickEffect('⚡ CLASH! (' + row.toUpperCase() + ')', 'bonus-color');
  if (outcome.isTrump && outcome.playerWins) collectTrickEffect('🃏 TRUMP! Suit overridden', 'bonus-color');
  // TIER2v4-8: Suit reversal notification
  if (outcome.suitsReversed) collectTrickEffect('🪞 MIRROR REALM: Suits reversed!', 'bonus-color');

  // Update streaks
  if (outcome.wins) {
    G.rowStreaks[row]++;
    // TIER3-REC9: Track max row streaks for run insights
    if (!G._maxRowStreaks) G._maxRowStreaks = { crown: 0, heart: 0, foundation: 0 };
    if (G.rowStreaks[row] > (G._maxRowStreaks[row] || 0)) G._maxRowStreaks[row] = G.rowStreaks[row];
  }
  else {
    // On loss: reset streak to 0 unless Anchor keyword preserves it
    // Ascension 13+ disables Anchor's streak preservation
    if (outcome.hasAnchor && !(G.ascension >= 13)) {
      // Anchor: keep current streak (don't increment, don't reset)
    } else {
      G.rowStreaks[row] = 0;
    }
  }

  if (hasRelic('blood_pact')) G.hp = Math.max(1, G.hp - 1);

  let trickScore = 0;
  let breakdownData = null;

  if (outcome.wins) {
    trickScore = outcome.scoreResult.total;
    breakdownData = outcome.scoreResult;
    G.consecutiveWins++;
    G.tricksWon++;
    META.tricksWonTotal++;
    // TIER2-11: Track row win rate
    if (META.analytics.rowWinRates[row]) {
      META.analytics.rowWinRates[row].wins = (META.analytics.rowWinRates[row].wins || 0) + 1;
    }
    if (G.consecutiveWins > G._maxStreakThisRun) G._maxStreakThisRun = G.consecutiveWins;

    // TIER1-3: Track format-specific wins
    if (G.encounterFormat === 'puzzle') G.puzzleTricksWon++;
    if (G.encounterFormat === 'bid') G.bidTricksWon++;

    // Track trump wins
    if (outcome.isTrump) META.trumpWins++;

    // Track synergies
    outcome.synergies.forEach(s => { if (G._uniqueSynergies) G._uniqueSynergies.add(s.effect); });

    // Archetype progress
    updateArchetypeOnWin(pCard);

    // Suit rewards
    if (pCard.suit === 'stars') {
      addSparkModifier(null, 'mult');
      collectTrickEffect('⭐ Star Power: Universal modifier', 'keyword-color');

      // TIER2v5-5: Star Catalyst — star wins trigger mini-surges on other rows
      if (hasArchetypeMilestone('star_catalyst') || hasArchetypeMilestone('star_catalyst_all')) {
        const triggerAll = hasArchetypeMilestone('star_catalyst_all');
        const otherRows = ['crown', 'heart', 'foundation'].filter(r => r !== row);
        const targetRows = triggerAll ? ['crown', 'heart', 'foundation'].filter(r => r !== row) : [otherRows[Math.floor(Math.random() * otherRows.length)]];

        targetRows.forEach(r => {
          applyStarMiniSurge(r);
        });
        if (triggerAll) {
          collectTrickEffect('⭐ Star Catalyst: ALL row mini-surges!', 'stars-color');
        } else {
          collectTrickEffect('⭐ Star Catalyst: Mini-surge on ' + targetRows[0], 'stars-color');
        }
      }
    } else {
      addSuitSpecificReward(pCard.suit);
    }

    if (outcome.isClash) { addSuitSpecificReward(pCard.suit); collectTrickEffect('⚡ Clash Bonus: Double modifier', 'bonus-color'); }
    if (G.rowStreaks[row] >= 4 && !G.surgeFired[row]) {
      G.surgeFired[row] = true;
      // TIER3-REC9: Track surges for run insights
      if (!G._surgesTriggered) G._surgesTriggered = [];
      G._surgesTriggered.push(row);
      applyRowSurge(row);
    }

    // Cascade keyword: trigger all row surges at half power (or full with Resonance synergy)
    if (pCard.keywords.includes('Cascade')) {
      const fullPower = outcome.synergies.some(s => s.effect === 'resonance');
      collectTrickEffect(fullPower ? '🌊 Resonance Cascade!' : '🌊 Cascade: All row surges', 'keyword-color');
      ['crown','heart','foundation'].forEach(r => {
        if (r !== row) applyCascadeSurge(r, fullPower);
      });
    }

    if (pCard.keywords.includes('Echo')) {
      G.echoNextTrick = true; G.echoSuit = pCard.suit;
      collectTrickEffect('Echo: Modifier carries to next', 'keyword-color');
      if (hasRelic('echo_chamber')) { addSuitSpecificReward(pCard.suit); collectTrickEffect('Echo Chamber: ×2', 'relic-color'); }
    }

    // Synergy: Momentum (Swift+Echo) = bonus mult
    if (outcome.synergies.some(s => s.effect === 'momentum')) {
      G.modifiers.push({ name: 'Momentum', suit: null, type: 'mult', value: 0.2, tier: 'spark', persistent: false, duration: 2 });
      collectTrickEffect('✨ Momentum: +0.2× mult', 'keyword-color');
    }

    // Synergy: Immolation (Pyre+Burn) = burn pile damage
    if (outcome.synergies.some(s => s.effect === 'immolation') && G.burnPile.length > 0) {
      const immDmg = G.burnPile.length * 2;
      G.enemy.hp = Math.max(0, G.enemy.hp - immDmg);
      G.totalDamage += immDmg;
      collectTrickEffect('🔥 Immolation: ' + immDmg + ' burn dmg', 'keyword-color');
    }

    if (G.playerClass === 'ember' && G.trickNum === 1 && !(G.ascension >= 17)) {
      G.modifiers.push({ name: 'Warming Up', suit: pCard.suit, type: 'mult', value: 0.1, tier: 'spark', persistent: false });
    }

    applyBossPhaseEffects('on_win', pCard, eCard, true, trickScore);

    if (pCard.keywords.includes('Fracture') && G.enemy.armor > 0) {
      const maxRemove = outcome.scoreResult.siegeEngine ? G.enemy.armor : Math.min(G.enemy.armor, 10);
      G.enemy.armor -= maxRemove;
      collectTrickEffect('Fracture: -' + maxRemove + ' armor', 'keyword-color');
    }

    // Siphon: steal armor
    if (outcome.scoreResult.siphonChips > 0) {
      G.enemy.armor -= outcome.scoreResult.siphonChips;
      collectTrickEffect('Siphon: +' + outcome.scoreResult.siphonChips + ' from armor', 'keyword-color');
    }

    // Inscription keyword: permanent +1 chip to all same-suit cards
    if (pCard.keywords.includes('Inscription')) {
      const insBonus = outcome.synergies.some(s => s.effect === 'final_testament') ? 3 : 1;
      G.deck.forEach(c => { if (c.suit === pCard.suit) c.baseChips += insBonus; });
      G.hand.forEach(c => { if (c.suit === pCard.suit) c.baseChips += insBonus; });
      collectTrickEffect(`Inscription: +${insBonus}♦ to all ${pCard.suit}`, 'keyword-color');
    }

    let finalDmg = Math.max(1, Math.floor(trickScore));
    if (outcome.scoreResult.crownSurgeApplied) G.crownSurgeActive = false;

    // TIER1-REC4: Apply encounter rule damage modifier
    const encounterRuleWin = getActiveEncounterRule();
    if (encounterRuleWin && encounterRuleWin.damageMod) {
      finalDmg = Math.max(0, Math.floor(encounterRuleWin.damageMod(finalDmg, G.trickNum, G.tricksPerRound, pCard)));
    }

    // TIER2v4-8: Iron Marshal Siege Lock — must win 2 consecutive tricks to deal damage
    if (isSiegeLockBlocking()) {
      collectTrickEffect(`⚙️ SIEGE MODE: Need ${2 - (G._siegeConsecutiveWins || 0)} more consecutive win(s)!`, 'mult-color');
      finalDmg = 0;
    }
    updateSiegeLockCounter(true); // Track win for siege lock

    // TIER1-REC5 + TIER2v4-9: Shieldbreaker — convert shield to bonus damage at 1.5× rate
    if (G.shieldBreakerReady && G.shield > 0) {
      const conversionRate = G._shieldBreakerRate || 1.0;
      const shieldDmg = Math.floor(G.shield * conversionRate);
      finalDmg += shieldDmg;
      G.shield = 0;
      G.shieldBreakerReady = false;
      G._shieldBreakerRate = 1.0;
      collectTrickEffect(`🛡️→⚔️ Shieldbreaker ×${conversionRate}: +${shieldDmg} from shield`, 'bonus-color');
    }

    // TIER1-2: Reset vengeance if used
    if (outcome.scoreResult.vengeanceApplied) {
      G.sacrificeCharge = 0;
      spawnCriticalPopup('⚡ VENGEANCE UNLEASHED!', 32);
      // TIER3-REC9: Track vengeance trigger for run insights
      G._vengeanceTriggers = (G._vengeanceTriggers || 0) + 1;
    }
    // TIER1-2: Clear Crown Gambit storage on Crown win
    if (row === 'crown' && G.crownGambitStored > 0) {
      G.crownGambitStored = 0;
    }

    // ENCOUNTER MECHANICS: Damage reduction (Fade Wraith, etc.)
    // TIER3-13: Don't apply damage_reduction passive if encounter rule already has damageMod (prevents double-dipping)
    const activeRuleForDR = getActiveEncounterRule();
    const encounterAlreadyReducedDmg = activeRuleForDR && activeRuleForDR.damageMod;
    if (G.enemy.passiveKey === 'damage_reduction' && G.enemy.hp > G.enemy.maxHp * 0.5 && !encounterAlreadyReducedDmg) {
      const reduction = G.enemy.passiveValue || 0.3;
      const reduced = Math.floor(finalDmg * reduction);
      finalDmg -= reduced;
      if (reduced > 0) collectTrickEffect(`🌫️ Damage reduced: -${reduced}`, 'mult-color');
    }

    // ENCOUNTER MECHANICS: Alternating immune (Clockwork Duelist)
    if (G.enemy.eliteMechanic === 'alternating_immune' && G.enemy.immuneThisTrick) {
      collectTrickEffect('⚙️ Immune — Clockwork phase', 'mult-color');
      finalDmg = 0;
    }

    // ENCOUNTER MECHANICS: Suit restriction — halve damage for restricted suit
    if (G.enemy.passiveKey === 'suit_restrict' && G.enemy.restrictedSuit === pCard.suit) {
      finalDmg = Math.floor(finalDmg * 0.5);
      collectTrickEffect(`🚫 Restricted suit: halved`, 'mult-color');
    }

    // REC6-v7: Desperate Surge — track wins, apply ×2 if sweeping round
    if (G._desperateSurgeRound) {
      G._desperateSurgeWins = (G._desperateSurgeWins || 0) + 1;
      if (G._desperateSurgeWins >= G.tricksPerRound) {
        finalDmg *= 2;
        collectTrickEffect('💥 DESPERATE SWEEP ×2!', 'bonus-color');
        spawnCriticalPopup('💥 SWEPT THE SURGE! ×2 DAMAGE!', 30);
      }
    }

    // REC6-v7: Crowd Favorite — double modifier gains on 3+ streak
    if (G._crowdFavoriteActive && (G.rowStreaks[row] || 0) >= 3) {
      // Grant an extra modifier for the crowd favorite bonus
      const bonusSuit = pCard.suit === 'stars' ? null : pCard.suit;
      addSparkModifier(bonusSuit, pCard.suit === 'hearts' ? 'mult' : 'chips');
      collectTrickEffect('🎭 CROWD FAVORITE! Bonus modifier!', 'bonus-color');
      G._crowdFavoriteActive = false; // One-time use
    }

    // REC6-v7: Reinforcement twist bonus ink on kill
    if (G.enemy._twistBonusInk && G.enemy.hp <= finalDmg) {
      G.ink += G.enemy._twistBonusInk;
      collectTrickEffect(`🛡️ Reinforcement drop: +${G.enemy._twistBonusInk} Ink`, 'bonus-color');
    }

    const armorBlock = Math.min(finalDmg, G.enemy.armor);
    G.enemy.armor -= armorBlock;
    const actualDmg = finalDmg - armorBlock;
    const preHitHp = G.enemy.hp;
    G.enemy.hp = Math.max(0, G.enemy.hp - actualDmg);
    G.roundScore += finalDmg;
    G.totalDamage += finalDmg;

    // ENCOUNTER MECHANICS: Reflect damage (Mirror Knight, etc.)
    if (G.enemy.eliteMechanic === 'reflect_damage' && actualDmg > 0) {
      const reflectPct = G.enemy.mechanicValue || 0.2;
      const reflectedDmg = Math.floor(actualDmg * reflectPct);
      if (reflectedDmg > 0) {
        G.hp = Math.max(1, G.hp - reflectedDmg);
        collectTrickEffect(`🪞 Reflect: ${reflectedDmg} dmg to you`, 'mult-color');
      }
    }

    // TIER1-2: Enemy Fury — punish consecutive wins
    if (G.enemy.passiveKey === 'win_punish' && G.consecutiveWins >= 3) {
      const furyDmg = Math.floor(G.enemy.passiveValue || 8) * G.act;
      G.hp = Math.max(1, G.hp - furyDmg);
      spawnCriticalPopup(`😤 FURY: -${furyDmg} HP!`, 38);
    }

    // TIER1-2: Patience Weaver — gains armor when player wins
    if (G.enemy.passiveKey === 'armor_on_player_win') {
      const armorGain = G.enemy.passiveValue || 2;
      G.enemy.armor += armorGain;
      collectTrickEffect(`🛡️ ${G.enemy.name}: +${armorGain} armor`, 'mult-color');
    }

    // Track personal best
    if (finalDmg > G.bestTrickThisRun) {
      G.bestTrickThisRun = finalDmg;
      // TIER3-REC9: Track best trick details for run insights
      G._bestTrickRow = row;
      G._bestTrickKeywords = [...(pCard.keywords || [])];
      G._bestTrickModifiers = G.modifiers.filter(m => !m.suit || m.suit === pCard.suit || m.suit === null).map(m => m.name).slice(0, 5);
    }
    const isPersonalBest = finalDmg > (META.bestTrickScore || 0);
    if (isPersonalBest) META.bestTrickScore = finalDmg;

    // Embers on win
    let emberGain = 1 + Math.floor(finalDmg / 20);
    if (hasRelic('molten_heart')) emberGain += 2;
    // TIER2-6: Ember Siphon — win with rank ≤5 grants +1 Ember per rank below 6
    if (hasDecisionModifier('lowcard_ember') && pCard.rank <= 5) {
      const emberBonus = 6 - pCard.rank;
      emberGain += emberBonus;
      collectTrickEffect(`🔥 Ember Siphon: +${emberBonus} Embers (rank ${pCard.rank})`, 'keyword-color');
    }
    G.embers += emberGain;

    if (G.enemy.hp <= 0 && actualDmg > preHitHp) {
      const overkillInk = Math.floor((actualDmg - preHitHp) / 2);
      if (overkillInk > 0) { G.ink += overkillInk; collectTrickEffect('Overkill! +' + overkillInk + ' Ink', 'bonus-color'); }
    }

    if (hasRelic('ink_per_win') || hasRelic('ink_siphon')) G.ink += 5;
    if (hasRelic('bleeding_heart') && pCard.suit === 'hearts') G.hp = Math.min(G.maxHp, G.hp + 2);

    // Burn keyword: destroy card
    if (pCard.keywords.includes('Burn')) {
      G.deck = G.deck.filter(c => c.id !== pCard.id);
      G.hand = G.hand.filter(c => c.id !== pCard.id);
      collectTrickEffect('🔥 Burn: Card consumed', 'keyword-color');
    }

    checkPhaseTransition();

    // TIER3-10: Check for combo discoveries
    checkComboDiscovery({
      playerWins: true, pCard, row, finalDmg, actualDmg,
      vengeanceApplied: outcome.scoreResult.vengeanceApplied,
      crownSurgeApplied: outcome.scoreResult.crownSurgeApplied,
      isTrump: outcome.isTrump,
      isClash: outcome.isClash,
      ghostGambler: outcome.ghostGambler,
      siphonChips: outcome.scoreResult.siphonChips || 0,
      synergies: outcome.synergies,
    });

    // Add breakdown personal best flag
    if (breakdownData) {
      breakdownData.isPersonalBest = isPersonalBest;
      breakdownData.actualDmg = actualDmg;
      breakdownData.armorBlock = armorBlock;
      breakdownData.enemyHpBefore = preHitHp + actualDmg;
      breakdownData.enemyHpAfter = G.enemy.hp;
      breakdownData.enemyMaxHp = G.enemy.maxHp;
    }

    // TIER1-REC2v6: Show Aha Moment popup after spectacle trick
    if (pCard._isSpectacleCard && G._spectacleTrickActive) {
      setTimeout(() => showAhaPopup(finalDmg), 3400);
    }

  } else {
    // LOSS
    G.consecutiveWins = 0;
    G.tricksLost++;
    G._perfectEncounter = false;

    // REC1-v7: "Why Did I Lose?" — determine contextual loss reason
    if (outcome._cursedPlayed) {
      G._lastLossReason = '🌑 Cursed: corrupted cards always lose';
    } else if (!outcome.effectiveMatch && !G.playerLeads) {
      // Player was following and played off-suit
      G._lastLossReason = `Off-suit: ${SUIT_SYMBOLS[pCard.suit]} can't beat ${SUIT_SYMBOLS[eCard.suit]} when enemy led`;
    } else if (!outcome.effectiveMatch && G.playerLeads) {
      // Player led, enemy matched suit with higher rank
      G._lastLossReason = `Outranked: your ${RANK_NAMES[pCard.rank]} vs enemy's ${RANK_NAMES[eCard.rank]}`;
    } else if (outcome.effectiveMatch) {
      G._lastLossReason = `Outranked: your ${pCard.rank} vs enemy's ${eCard.rank} (same suit)`;
    } else {
      G._lastLossReason = '';
    }
    // REC1-v7: Track loss reason for run insights
    if (!G._lossReasonCounts) G._lossReasonCounts = { offsuit: 0, outranked: 0, cursed: 0 };
    if (outcome._cursedPlayed) G._lossReasonCounts.cursed++;
    else if (!outcome.effectiveMatch) G._lossReasonCounts.offsuit++;
    else G._lossReasonCounts.outranked++;
    
    // TIER2v4-8: Reset siege lock consecutive wins on loss
    updateSiegeLockCounter(false);

    // TIER1-REC3: Collect loss effects for consolidated display
    let _lossEffects = [];

    // TIER3-11: Cursed card played — skip normal loss mechanics, apply self-damage directly
    if (outcome._cursedPlayed) {
      const curseDmg = outcome.incomingDamage.raw;
      G.hp = Math.max(0, G.hp - curseDmg);
      _lossEffects.push(`🌑 Corruption: -${curseDmg} HP (self-inflicted)`);
      _lossEffects.push('💀 Cursed cards can be removed at Rest Sites');
      // Don't charge sacrifice or give other loss benefits for cursed plays
    } else {

    // TIER1-2: Charge sacrifice counter
    G.sacrificeCharge = Math.min(G.sacrificeCharge + 1, 3);
    // TIER2v4-7: Contextual tip on first sacrifice
    if (G.sacrificeCharge === 1) showContextualTip('sacrifice', CONTEXTUAL_TIPS.sacrifice);
    if (G.sacrificeCharge >= 3) {
      spawnCriticalPopup('⚡ VENGEANCE READY! Next win ×2.5!', 35);
    } else {
      _lossEffects.push('🗡️ Sacrifice ' + G.sacrificeCharge + '/3');
    }

    // TIER1-2: Crown Gambit — store enemy damage as future bonus
    if (row === 'crown') {
      const stored = Math.floor(eCard.rank * 1.5);
      G.crownGambitStored += stored;
      _lossEffects.push('👑 Crown Gambit: +' + stored + ' stored');
    }

    // TIER1-2: Heart Drain — heal on heart row loss
    if (row === 'heart') {
      const healAmt = Math.min(3 + (hasRelic('bleeding_heart') ? 2 : 0), G.maxHp - G.hp);
      if (healAmt > 0) {
        G.hp += healAmt;
        _lossEffects.push('❤️ Heart Drain: +' + healAmt + ' HP');
      }
    }

    let resGain = 1;
    if (hasRelic('resilient_heart')) resGain += 1;
    G.resilience += resGain;
    _lossEffects.push('+' + resGain + ' Resilience');

    if (pCard.keywords.includes('Phantom') || outcome.ghostGambler) {
      G.hand.push(pCard);
      _lossEffects.push(outcome.ghostGambler ? 'Ghost Gambler: Card returns' : 'Phantom: Card returns');
    }

    if (outcome.ghostGambler) {
      _lossEffects.push('Ghost Gambler: No damage');
    } else if (!outcome.incomingDamage.absorbed) {
      let eDmg = outcome.incomingDamage.raw;
      eDmg = Math.max(0, eDmg - G.shield);
      G.shield = Math.max(0, G.shield - outcome.incomingDamage.raw);
      G.hp = Math.max(0, G.hp - outcome.incomingDamage.afterShield);
    } else {
      _lossEffects.push('Absorb: No damage');
    }

    if (G.playerClass === 'chrome') {
      const ec = G.modifiers.filter(m => m.name === 'Calculated Risk');
      if (ec.length < 3) G.modifiers.push({ name: 'Calculated Risk', suit: null, type: 'mult', value: 0.3, tier: 'spark', persistent: false, duration: 2 });
    }

    // TIER2-5: Apply encounter wrinkle on enemy win
    applyEncounterWrinkle(G.enemy, 'enemy_win');
    // TIER2-REC4v6: Apply progressive wrinkle effects on enemy win
    applyProgressiveWrinkleEffects(G.enemy, 'enemy_win');

    if (row === 'foundation') G.shield += hasArchetypeMilestone('shield_boost') ? 8 : 3;

    // FEATURE 2: Off-Suit Tactical Retreats (ENHANCED by TIER1-2)
    if (!outcome.effectiveMatch) {
      // TIER3-REC9: Track off-suit losses for run insights
      G._offSuitLosses = (G._offSuitLosses || 0) + 1;
      if (row === 'foundation') {
        const extraShield = (hasArchetypeMilestone('shield_boost') ? 8 : 3) * 2;
        G.shield += extraShield;
        _lossEffects.push('🛡️ Bait Shield: +' + (extraShield + (hasArchetypeMilestone('shield_boost') ? 8 : 3)) + ' total');
      }
      if (row === 'heart' && G.modifiers.length > 0) {
        const eligible = G.modifiers.filter(m => m.type === 'mult');
        if (eligible.length > 0) {
          const target = eligible[Math.floor(Math.random() * eligible.length)];
          target.value = +(target.value + 0.08).toFixed(2);
          _lossEffects.push('❤️ Retreat Boost: ' + target.name + ' +0.08×');
        } else {
          addSparkModifier(null, 'chips');
          _lossEffects.push('❤️ Retreat Boost: +chip modifier');
        }
      }
      if (row === 'crown') {
        const extraStored = Math.floor(eCard.rank);
        G.crownGambitStored += extraStored;
        _lossEffects.push('👑 Crown Retreat: +' + extraStored + ' stored');
        // TIER2-6: Crown Retreat Mastery — off-suit on Crown gives +0.3× mult
        if (hasDecisionModifier('offsuitcrown')) {
          G.modifiers.push({ name: 'Crown Retreat Mult', suit: null, type: 'mult', value: 0.3, tier: 'spark', persistent: false, duration: 2 });
          _lossEffects.push('👑 Retreat Mastery: +0.3× mult (2 rounds)');
        }
      }
    }

    // Drain Shield synergy: convert blocked damage to shield
    if (outcome.synergies.some(s => s.effect === 'drain_shield') && outcome.incomingDamage.shieldUsed > 0) {
      G.shield += Math.floor(outcome.incomingDamage.shieldUsed * 0.5);
      _lossEffects.push('Drain Shield: Recovered');
    }

    // ENCOUNTER MECHANICS on LOSS:
    if (G.enemy.eliteMechanic === 'streak_reset') {
      G.rowStreaks = { crown: 0, heart: 0, foundation: 0 };
      spawnCriticalPopup('💥 STREAK BREAKER: All streaks reset!', 35);
    }
    if (G.enemy.eliteMechanic === 'mod_steal') {
      if (G.modifiers.length > 0 && Math.random() < 0.5) {
        const stolen = G.modifiers.splice(Math.floor(Math.random() * G.modifiers.length), 1)[0];
        spawnCriticalPopup(`🌀 VOID SIPHON: Stole ${stolen.name}!`, 38);
      }
      const healAmt = Math.floor(G.enemy.maxHp * 0.05);
      G.enemy.hp = Math.min(G.enemy.maxHp, G.enemy.hp + healAmt);
    }
    if (G.enemy.passiveKey === 'ink_steal') {
      const stolen = Math.min(G.ink, G.enemy.passiveValue || 5);
      G.ink -= stolen;
      if (stolen > 0) _lossEffects.push(`🧛 Ink Leech: -${stolen} Ink`);
    }

    // TIER1-REC4v3: Blot Spread — off-suit plays cost extra HP
    const activeRule = getActiveEncounterRule();
    if (activeRule === ENCOUNTER_RULES.blot_spread && !outcome.effectiveMatch) {
      const blotDmg = 4;
      G.hp = Math.max(1, G.hp - blotDmg);
      _lossEffects.push(`🖤 Blot Spread: -${blotDmg} extra HP`);
    }

    } // TIER3-11: Close non-curse loss else block

    // TIER1-REC3: Show consolidated loss summary
    spawnLossSummary(_lossEffects);

    // TIER3-10: Check for combo discoveries on loss
    checkComboDiscovery({
      playerWins: false, pCard, row, finalDmg: 0, actualDmg: 0,
      vengeanceApplied: false, crownSurgeApplied: false,
      isTrump: outcome.isTrump, isClash: outcome.isClash,
      ghostGambler: outcome.ghostGambler,
      siphonChips: 0, synergies: outcome.synergies,
    });
  }

  // Burn pile
  if (outcome.wins) G.burnPile.push(eCard);
  else if (!pCard.keywords.includes('Phantom') && !outcome.ghostGambler) G.burnPile.push(pCard);

  addMiniCard(row, pCard);

  if (outcome.wins && breakdownData) showScoreBreakdown(breakdownData);

  // TIER1-REC1v6: Build resolution narrative for the WHY strip
  G._lastResolutionNarrative = buildResolutionNarrative(outcome, pCard, eCard, row, outcome.wins ? Math.floor(trickScore) : 0);

  showTrickResult(outcome.wins, trickScore, pCard);

  if (!pCard.keywords.includes('Echo') && G.echoNextTrick) G.echoNextTrick = false;
  if (pCard.keywords.includes('Volatile') || pCard.keywords.includes('Burn')) {
    G.deck = G.deck.filter(c => c.id !== pCard.id);
    G.hand = G.hand.filter(c => c.id !== pCard.id);
  }
  // TIER3-11: Cursed cards are consumed after being played
  if (pCard._isCursed) {
    G.deck = G.deck.filter(c => c.id !== pCard.id);
  }

  // Winner leads next trick
  G.playerLeads = outcome.wins;

  // Track burn pile cards for progression
  if (pCard.keywords.includes('Burn') || pCard.keywords.includes('Volatile')) META.cardsBurned = (META.cardsBurned || 0) + 1;

  // Mid-play progression checks (achievements that can trigger during play)
  runProgressionChecks('trick_end');

  // ENCOUNTER MECHANIC: Toggle alternating immune for Clockwork Duelist
  if (G.enemy.eliteMechanic === 'alternating_immune') {
    G.enemy.immuneThisTrick = !G.enemy.immuneThisTrick;
  }

  const delay = outcome.wins && breakdownData ? 3200 : 800;

  setTimeout(() => {
    // TIER1-3: Check for special encounter format completion
    if (checkSpecialEncounterEnd()) return;

    if (G.enemy.hp <= 0) {
      // TIER2v5-7: Bid encounter — apply risk-reward tier bonuses
      if (G.encounterFormat === 'bid' && G.bidLevel > 0) {
        const bidLevel = G.bidLevel;
        let rewardMult = 1.0;
        let bidLabel = '';
        if (bidLevel === 1) { rewardMult = 1.0; bidLabel = 'Cautious'; }
        else if (bidLevel === 2) { rewardMult = 1.25; bidLabel = 'Standard'; }
        else if (bidLevel === 3) { rewardMult = 1.75; bidLabel = 'Bold'; }
        else if (bidLevel === 4) { rewardMult = 2.0; bidLabel = 'Reckless'; }

        // Apply reward multiplier as bonus ink
        if (rewardMult > 1.0) {
          const bonusInk = Math.floor(30 * (rewardMult - 1.0)); // Base encounter ink is 30
          G.ink += bonusInk;
          spawnKeywordPopup(`🎲 ${bidLabel} Bid! +${bonusInk} bonus Ink!`, 30);
        } else {
          spawnKeywordPopup(`🎲 ${bidLabel} Bid — Victory!`, 30);
        }

        // TIER2v5-7: Reckless bid grants chance of decision modifier drop
        if (bidLevel === 4 && Math.random() < 0.6) {
          const dm = grantRandomDecisionModifier('flame');
          if (dm) {
            spawnKeywordPopup(`${dm.icon} RECKLESS REWARD: ${dm.name}!`, 35);
          }
        }

        G.encounterFormat = 'standard';
      }
      encounterVictory(); return;
    }
    if (G.hp <= 0) {
      // Phoenix Rebirth relic: revive once per run
      if (hasRelic('phoenix_rebirth') && !G._phoenixUsed) {
        G._phoenixUsed = true;
        G.hp = 1;
        spawnKeywordPopup('🦅 PHOENIX REBIRTH! Revived with 1 HP!', 30);
      } else {
        gameOver(false); return;
      }
    }

    if (G.trickNum >= G.tricksPerRound) {
      G.phase = 'round_end';
      G.deck.push(...G.hand);
      G.hand = [];
      G.modifiers = G.modifiers.filter(m => { if (m.duration) { m.duration--; return m.duration > 0; } return true; });

      // TIER1-REC4: Apply encounter rule at round end
      const roundEndRule = getActiveEncounterRule();
      if (roundEndRule && roundEndRule.onRoundEnd) roundEndRule.onRoundEnd();

      if (G.enemy.hp > 0) {
        // REC6-v7: Mid-Battle Twist — 20% chance after round 2 of encounters with 3+ rounds
        if (G.roundNum >= 2 && G.tricksPerRound >= 3 && Math.random() < 0.20 && G.encounterFormat === 'standard') {
          showMidBattleTwist(() => {
            setBattleFocus('summary');
            setTimeout(() => startRound(), 600);
          });
        } else {
          setBattleFocus('summary'); // TIER1-REC1v3: Brief summary before next round
          setTimeout(() => startRound(), 600);
        }
      }
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
      collectTrickEffect('♣ Club Strike: +' + dd + ' direct dmg', 'bonus-color');
      break;
    case 'spades':
      if (G.enemy.hand.length > 0) {
        const ri = Math.floor(Math.random() * G.enemy.hand.length);
        G.revealedEnemyCards.push({ ...G.enemy.hand[ri] });
        collectTrickEffect('♠ Revealed: ' + RANK_NAMES[G.enemy.hand[ri].rank] + SUIT_SYMBOLS[G.enemy.hand[ri].suit], 'keyword-color');
      }
      // Void Walker archetype: spades wins grant bonus mult
      if (hasArchetypeMilestone('spades_mult')) {
        G.modifiers.push({ name: 'Void Mult', suit: null, type: 'mult', value: 0.2, tier: 'spark', persistent: false });
      }
      break;
    case 'stars': addSparkModifier(null, 'mult'); break;
  }

  if (hasRelic('gamblers_coin') && Math.random() < 0.2 && suit !== 'clubs') {
    addSparkModifier(suit, suit === 'diamonds' ? 'chips' : 'mult');
    collectTrickEffect("🎲 Gambler's Coin: Double mod!", 'relic-color');
  }

  if (G.echoNextTrick && G.echoSuit && G.echoSuit !== suit) {
    addSparkModifier(G.echoSuit, G.echoSuit === 'diamonds' ? 'chips' : 'mult');
  }
}

function applyRowSurge(row) {
  AudioEngine.surgeTrigger(row);
  // TIER2v4-7: Contextual tip on first surge per row type
  if (row === 'crown') showContextualTip('surge_crown', CONTEXTUAL_TIPS.surge_crown);
  if (row === 'heart') showContextualTip('surge_heart', CONTEXTUAL_TIPS.surge_heart);
  if (row === 'foundation') showContextualTip('surge_foundation', CONTEXTUAL_TIPS.surge_foundation);
  switch (row) {
    case 'crown':
      // TIER2v4-9: Crown Surge capped — ×2 once per encounter, then +0.3× persistent mult
      if (!G._crownSurgeUsedThisEncounter) {
        G.crownSurgeActive = true;
        G._crownSurgeUsedThisEncounter = true;
        if (hasArchetypeMilestone('crown_perma')) {
          spawnCriticalPopup('👑 CROWN SURGE PERMANENT!', 30);
        } else {
          spawnCriticalPopup('👑 CROWN SURGE! Next ×2!', 30);
        }
      } else {
        // Subsequent Crown streaks: grant +0.3× persistent mult instead
        G.modifiers.push({ name: 'Crown Dominion', suit: null, type: 'mult', value: 0.3, tier: 'spark', persistent: false });
        spawnCriticalPopup('👑 CROWN DOMINION! +0.3× mult!', 30);
      }
      break;
    case 'heart':
      // TIER1-REC5 + TIER2v4-9: Heart Chip Doubler + bonus mult per chip mod doubled
      if (!G.heartChipDoubler) {
        G.heartChipDoubler = true;
        // TIER2v4-9: Count chip mods being doubled, grant +0.1× per one
        const chipModCount = G.modifiers.filter(m => m.type === 'chips').length;
        if (chipModCount > 0) {
          const heartMultBonus = +(chipModCount * 0.1).toFixed(2);
          G.modifiers.push({ name: 'Heart Engine', suit: null, type: 'mult', value: heartMultBonus, tier: 'spark', persistent: false });
          spawnCriticalPopup(`❤️🔥 CHIP DOUBLER + ${heartMultBonus}× mult!`, 28);
        } else {
          spawnCriticalPopup('❤️🔥 CHIP DOUBLER! All chip mods ×2 this encounter!', 28);
        }
      } else {
        // If already active, grant a huge chip bonus instead
        const megaChips = G.modifiers.length * 3;
        G.modifiers.push({ name: 'Heart Overflow', suit: null, type: 'chips', value: megaChips, tier: 'spark', persistent: false });
        spawnCriticalPopup('❤️ HEART OVERFLOW! +' + megaChips + ' chips!', 30);
      }
      break;
    case 'foundation':
      // TIER1-REC5 + TIER2v4-9: Shieldbreaker — convert shield at 1.5× rate
      const shieldSurge = Math.floor(G.maxHp * 0.5);
      G.shield += shieldSurge;
      G.shieldBreakerReady = true;
      G._shieldBreakerRate = 1.5; // TIER2v4-9: 1.5× conversion rate
      spawnCriticalPopup('🛡️⚔️ SHIELDBREAKER ×1.5! Shield→Damage on next win!', 28);
      break;
  }
}

function applyCascadeSurge(row, fullPower) {
  const scale = fullPower ? 1.0 : 0.5;
  switch (row) {
    case 'crown':
      // TIER2v4-9: Cascade respects once-per-encounter Crown Surge cap
      if (scale >= 1.0 && !G._crownSurgeUsedThisEncounter) {
        G.crownSurgeActive = true;
        G._crownSurgeUsedThisEncounter = true;
      } else {
        G.modifiers.push({ name: 'Cascade Mult', suit: null, type: 'mult', value: 0.3, tier: 'spark', persistent: false, duration: 1 });
      }
      break;
    case 'heart':
      // TIER1-REC5: Cascade on heart at full power triggers chip doubler
      if (scale >= 1.0 && !G.heartChipDoubler) {
        G.heartChipDoubler = true;
      } else {
        const chipBonus = Math.floor(G.modifiers.length * scale);
        if (chipBonus > 0) G.modifiers.push({ name: 'Cascade Chips', suit: null, type: 'chips', value: chipBonus, tier: 'spark', persistent: false, duration: 1 });
      }
      break;
    case 'foundation':
      G.shield += Math.floor(G.maxHp * 0.25 * scale);
      // TIER1-REC5: Cascade on foundation at full power triggers shieldbreaker
      if (scale >= 1.0) G.shieldBreakerReady = true;
      break;
  }
}

// TIER2v5-5: Star Catalyst — mini-surges triggered by Star card wins
function applyStarMiniSurge(row) {
  switch (row) {
    case 'crown':
      G.modifiers.push({ name: 'Star Catalyst ×', suit: null, type: 'mult', value: 0.1, tier: 'spark', persistent: false });
      break;
    case 'heart':
      G.modifiers.push({ name: 'Star Catalyst ♦', suit: null, type: 'chips', value: 2, tier: 'spark', persistent: false });
      break;
    case 'foundation':
      G.shield += 5;
      break;
  }
}

function addSparkModifier(suit, type) {
  if (type === 'chips') {
    const chipVal = 2 + (hasRelic('diamond_lens') && suit === 'diamonds' ? 1 : 0);
    const multiplier = hasArchetypeMilestone('double_chips') ? 2 : 1;
    const existing = G.modifiers.find(m => m.tier === 'spark' && m.suit === suit && m.type === 'chips' && !m.persistent);
    if (existing) { existing.value += chipVal * multiplier; }
    else G.modifiers.push({ name: (suit ? suit.charAt(0).toUpperCase()+suit.slice(1) : 'Universal') + ' Chips', suit, type: 'chips', value: chipVal * multiplier, tier: 'spark', persistent: false });
  } else {
    const existing = G.modifiers.find(m => m.tier === 'spark' && m.suit === suit && m.type === 'mult' && !m.persistent);
    if (existing) { existing.value += 0.1; existing.value = Math.min(existing.value, 2.0); }
    else G.modifiers.push({ name: (suit ? suit.charAt(0).toUpperCase()+suit.slice(1) : 'Universal') + ' Spark', suit, type: 'mult', value: 0.1, tier: 'spark', persistent: false });
  }
}

// ===== SCORE CALCULATION =====
function calculateScoreDetailed(card, row, synergies) {
  synergies = synergies || [];
  const steps = [];
  let chips = card.baseChips;

  // Archetype: global_chips
  if (hasArchetypeMilestone('global_chips')) chips += 5;

  if (hasRelic('loaded_dice') && card.rank % 2 === 0) { chips += 2; steps.push({ label: 'Loaded Dice', value: '+2', colorClass: 'relic-color' }); }
  if (hasRelic('void_lens') && card.suit === 'spades') { chips += 3; steps.push({ label: 'Void Lens', value: '+3', colorClass: 'relic-color' }); }
  if (hasRelic('star_prism') && card.suit === 'stars') { chips += 4; steps.push({ label: 'Star Prism', value: '+4', colorClass: 'stars-color' }); }

  // Pyre keyword
  if (card.keywords.includes('Pyre')) {
    const pyreBase = hasRelic('phoenix_ash') ? 2 : 1;
    const pyreBonusMilestone = hasArchetypeMilestone('chip_boost') && card.keywords.includes('Pyre') ? 2 : 0;
    const pyreBonus = (G.burnPile.length * pyreBase) + pyreBonusMilestone;
    if (pyreBonus > 0) { chips += pyreBonus; steps.push({ label: `Pyre (${G.burnPile.length} burned)`, value: '+' + pyreBonus, colorClass: 'keyword-color' }); }
  }

  // Royal Garden synergy: Crown+Bloom = +3 chips per modifier on Crown row
  if (synergies.some(s => s.effect === 'royal_garden') && row === 'crown') {
    const rgBonus = G.modifiers.length * 3;
    chips += rgBonus;
    steps.push({ label: 'Royal Garden', value: '+' + rgBonus, colorClass: 'keyword-color' });
  }

  steps.unshift({ label: 'Base Chips', value: card.baseChips.toString(), colorClass: 'chips-color' });

  // TIER2-6: Apply Decision-Changing Modifier bonuses
  const decBonuses = getDecisionModBonuses(card, row);
  if (decBonuses.chipsMult > 1) {
    chips = Math.floor(chips * decBonuses.chipsMult);
  }
  if (decBonuses.extraChips > 0) {
    chips += decBonuses.extraChips;
  }
  decBonuses.steps.forEach(s => steps.push(s));

  let chipMod = 0;
  G.modifiers.forEach((m, idx) => {
    if (idx === G.enemy?.disabledModIdx) return;
    const isUniversal = m.suit === null || m.suit === 'stars' || hasArchetypeMilestone('all_universal');
    if (m.type === 'chips' && (m.suit === card.suit || isUniversal)) chipMod += m.value;
  });

  const heartRowBoost = hasArchetypeMilestone('heart_boost') ? 2.0 : 1.5;
  if (row === 'heart') chipMod *= heartRowBoost;

  // TIER1-REC5: Heart Chip Doubler — doubles ALL chip mods for the encounter
  if (G.heartChipDoubler && chipMod > 0) {
    chipMod *= 2;
    steps.push({ label: '❤️ Chip Doubler', value: '×2', colorClass: 'bonus-color' });
  }

  if (chipMod > 0) steps.push({ label: `Chip Mods${row === 'heart' ? ' (×' + heartRowBoost + ')' : ''}`, value: '+' + chipMod.toFixed(1), colorClass: 'chips-color' });
  chips += chipMod;

  if (card.keywords.includes('Bloom')) { const bc = G.modifiers.length; chips += bc; if (bc > 0) steps.push({ label: 'Bloom', value: '+' + bc, colorClass: 'keyword-color' }); }
  if (card.keywords.includes('Volatile')) { chips *= 2; steps.push({ label: 'Volatile ×2', value: chips.toFixed(0), colorClass: 'keyword-color' }); }

  let mult = card.baseMult;
  // TIER2-6: Decision modifier mult bonuses (reuse decBonuses from above — single call)
  if (decBonuses.multAdd > 0) {
    mult += decBonuses.multAdd;
  }
  if (hasRelic('blood_pact')) { mult += 0.2; steps.push({ label: 'Blood Pact', value: '+0.2×', colorClass: 'relic-color' }); }
  if (hasRelic('star_prism') && card.suit === 'stars') { mult += 0.2; steps.push({ label: 'Star Prism Mult', value: '+0.2×', colorClass: 'stars-color' }); }

  steps.push({ label: 'Base Mult', value: mult.toFixed(2) + '×', colorClass: 'mult-color' });

  let sparkMult = 0, flameMult = 0, infernoMult = 0;
  G.modifiers.forEach((m, idx) => {
    if (idx === G.enemy?.disabledModIdx) return;
    if (m.type !== 'mult') return;
    const isUniversal = m.suit === null || m.suit === 'stars' || hasArchetypeMilestone('all_universal');
    if (m.suit !== null && !isUniversal && m.suit !== card.suit) return;
    let val = m.value;
    if (isUniversal && m.suit === null && hasArchetypeMilestone('star_catalyst_all')) val *= 1.25; // TIER2v5-5: Star Catalyst All provides modest universal boost

    // Apply conditional forge effects
    if (m.condition) {
      if (m.condition === 'crown_double' && row === 'crown') val *= 2;
      if (m.condition === 'streak_amp' && (G.rowStreaks[row] || 0) >= 3) val *= 1.5;
      if (m.condition === 'combo_fuel') val += G.consecutiveWins * 0.1;
      if (m.condition === 'clutch_power' && G.hp < G.maxHp * 0.3) val *= 2;
    }

    if (m.tier === 'spark') sparkMult += val;
    else if (m.tier === 'flame') flameMult += val;
    else if (m.tier === 'inferno') infernoMult += val;
  });

  const crownBonus = row === 'crown' ? (hasArchetypeMilestone('crown_boost') ? 2.0 : 1.5) : (hasArchetypeMilestone('all_row_mult') ? 1.25 : 1.0);
  if (sparkMult > 0) { mult *= (1 + sparkMult * crownBonus); steps.push({ label: `Spark Mods${row === 'crown' ? ' (×' + crownBonus.toFixed(1) + ')' : ''}`, value: '×' + (1 + sparkMult * crownBonus).toFixed(2), colorClass: 'mult-color' }); }
  if (flameMult > 0) { mult *= (1 + flameMult * crownBonus); steps.push({ label: `Flame Mods${row === 'crown' ? ' (×' + crownBonus.toFixed(1) + ')' : ''}`, value: '×' + (1 + flameMult * crownBonus).toFixed(2), colorClass: 'mult-color' }); }
  if (infernoMult > 0) { mult *= (1 + infernoMult * crownBonus); steps.push({ label: `Inferno Mods${row === 'crown' ? ' (×' + crownBonus.toFixed(1) + ')' : ''}`, value: '×' + (1 + infernoMult * crownBonus).toFixed(2), colorClass: 'mult-color' }); }

  const streak = G.rowStreaks[row] || 0;
  const streakBonus = streak >= 4 ? 1.5 : streak >= 3 ? 1.25 : streak >= 2 ? 1.1 : 1.0;
  if (streakBonus > 1) { mult *= streakBonus; steps.push({ label: `Streak (×${streak})`, value: '×' + streakBonus.toFixed(2), colorClass: 'bonus-color' }); }
  if (G.consecutiveWins > 0) { const cm = 1 + 0.1 * G.consecutiveWins; mult *= cm; steps.push({ label: `Combo (${G.consecutiveWins})`, value: '×' + cm.toFixed(2), colorClass: 'bonus-color' }); }
  if (card.keywords.includes('Crown') && row === 'crown') { mult *= 1.5; steps.push({ label: 'Crown KW', value: '×1.5', colorClass: 'keyword-color' }); }

  // Burn pile mult from archetype
  if (hasArchetypeMilestone('burn_mult') && G.burnPile.length > 0) {
    const bmBonus = 1 + G.burnPile.length * 0.03;
    mult *= bmBonus;
    steps.push({ label: `Pyre Master`, value: '×' + bmBonus.toFixed(2), colorClass: 'keyword-color' });
  }

  return { steps, total: Math.max(1, Math.floor(chips * mult)), chips: Math.floor(chips), mult: mult.toFixed(2) };
}

function calculateScore(card, row) { return calculateScoreDetailed(card, row).total; }

// ============================================================
// 2.3 SCORE BREAKDOWN: SPECTACLE SYSTEM
// ============================================================
function showScoreBreakdown(data) {
  const overlay = document.getElementById('score-breakdown-overlay');
  const stepsContainer = document.getElementById('breakdown-steps');
  const finalEl = document.getElementById('breakdown-final');
  const totalEl = document.getElementById('breakdown-total');
  stepsContainer.innerHTML = '';
  finalEl.classList.remove('visible', 'slam', 'personal-best');
  totalEl.textContent = '0';

  // Remove any previous threshold classes
  overlay.classList.remove('threshold-50', 'threshold-100', 'threshold-250', 'threshold-500', 'inferno-glow', 'edge-pulse-green', 'edge-pulse-gold', 'edge-pulse-orange', 'edge-pulse-red');

  // TIER2v5-3: Create/reset particle canvas for visual spectacle
  let particleCanvas = overlay.querySelector('.breakdown-particle-canvas');
  if (!particleCanvas) {
    particleCanvas = document.createElement('canvas');
    particleCanvas.className = 'breakdown-particle-canvas';
    particleCanvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
    overlay.insertBefore(particleCanvas, overlay.firstChild);
  }

  // TIER2v3-9: Check if any inferno mods contributed to this score
  const hasInfernoMods = G.modifiers.some(m => m.tier === 'inferno');

  // Step-by-step reveal
  const allSteps = [...data.steps];
  // TIER1-REC3: Append collected keyword effects as labeled steps
  if (_trickEffects.length > 0) {
    allSteps.push({ label: '── Effects ──', value: '', colorClass: 'separator-step' });
    _trickEffects.forEach(e => allSteps.push(e));
  }

  // TIER2v3-9: Mark inferno-tier modifier steps
  let hasInfernoStep = false;

  // TIER3-10: Use DocumentFragment for batch DOM insertion of breakdown steps
  const stepsFragment = document.createDocumentFragment();

  allSteps.forEach((step, i) => {
    const el = document.createElement('div');
    el.className = 'breakdown-step';
    // TIER2v3-9: Identify inferno-tier modifier steps
    const isInferno = step.label && (step.label.includes('Inferno') || step.label.includes('Crucible') || step.label.includes('VENGEANCE') || step.label.includes('Transcendence'));
    if (isInferno) {
      el.classList.add('inferno-step');
      hasInfernoStep = true;
    }
    el.innerHTML = `<span class="step-label">${step.label}</span><span class="step-value ${step.colorClass}">${step.value}</span>`;
    stepsFragment.appendChild(el);
  });
  stepsContainer.appendChild(stepsFragment);

  // TIER3-10: rAF-based staggered step reveal (replaces setTimeout chain)
  const stepEls = stepsContainer.querySelectorAll('.breakdown-step');
  let stepRevealIdx = 0;
  let lastStepRevealTime = 0;
  const STEP_REVEAL_INTERVAL = 100; // ms between reveals

  function revealNextStep(now) {
    if (stepRevealIdx >= stepEls.length) return;
    if (!lastStepRevealTime) lastStepRevealTime = now;
    const elapsed = now - lastStepRevealTime;
    const targetIdx = Math.min(stepEls.length, Math.floor(elapsed / STEP_REVEAL_INTERVAL) + 1);

    while (stepRevealIdx < targetIdx) {
      const el = stepEls[stepRevealIdx];
      el.classList.add('visible');
      AudioEngine.breakdownStep(stepRevealIdx, allSteps.length);
      if (allSteps[stepRevealIdx].colorClass === 'mult-color' || allSteps[stepRevealIdx].colorClass === 'bonus-color') {
        el.classList.add('crunch');
      }
      stepRevealIdx++;
    }

    if (stepRevealIdx < stepEls.length) {
      requestAnimationFrame(revealNextStep);
    }
  }
  requestAnimationFrame(revealNextStep);

  const totalDelay = 100 * (allSteps.length + 1) + 300;

  // TIER2v5-3: Particle system for score breakdown spectacle
  let particleAnimId = null;
  const particles = [];

  function startBreakdownParticles(canvas, finalVal) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.65; // Around where the damage number is

    function spawnParticle(intensity) {
      // TIER3-REC11: Particle count cap for performance on low-end devices
      const MAX_PARTICLES = window.matchMedia('(max-width: 480px)').matches ? 60 : 120;
      if (particles.length >= MAX_PARTICLES) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2 * intensity;
      const hue = finalVal >= 500 ? 45 + Math.random() * 30 : // gold
                  finalVal >= 250 ? 30 + Math.random() * 20 : // orange
                  finalVal >= 100 ? 40 + Math.random() * 30 : // gold-yellow
                  120 + Math.random() * 40; // green
      particles.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        life: 1.0,
        decay: 0.008 + Math.random() * 0.015,
        size: 1 + Math.random() * 2.5 * intensity,
        hue: hue,
      });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.01; // slight upward drift
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }

        ctx.globalAlpha = p.life * 0.8;
        ctx.fillStyle = `hsl(${p.hue}, 90%, ${50 + p.life * 30}%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();

        // Trail
        ctx.globalAlpha = p.life * 0.3;
        ctx.beginPath();
        ctx.arc(p.x - p.vx * 2, p.y - p.vy * 2, p.size * p.life * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      particleAnimId = requestAnimationFrame(animate);
    }

    animate();
    return spawnParticle;
  }

  // Animated counter with visual spectacle
  setTimeout(() => {
    const finalVal = data.total;
    const duration = Math.min(1200, 400 + finalVal * 2);
    const startTime = performance.now();

    // TIER2v5-3: Start particle system
    const spawnParticle = startBreakdownParticles(particleCanvas, finalVal);

    function animateCounter(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Eased progress
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * finalVal);
      totalEl.textContent = current.toLocaleString();

      // TIER2v5-3: Spawn particles during counter animation
      const intensity = 0.3 + eased * 1.2;
      if (Math.random() < 0.3 + eased * 0.5) spawnParticle(intensity);
      if (finalVal >= 250 && Math.random() < eased * 0.3) spawnParticle(intensity * 1.5);

      // TIER2v5-3: Screen-edge colour pulse during counter
      if (current >= 500 && !overlay.classList.contains('edge-pulse-red')) {
        overlay.classList.remove('edge-pulse-green', 'edge-pulse-gold', 'edge-pulse-orange');
        overlay.classList.add('edge-pulse-red');
      } else if (current >= 250 && current < 500 && !overlay.classList.contains('edge-pulse-orange')) {
        overlay.classList.remove('edge-pulse-green', 'edge-pulse-gold');
        overlay.classList.add('edge-pulse-orange');
      } else if (current >= 100 && current < 250 && !overlay.classList.contains('edge-pulse-gold')) {
        overlay.classList.remove('edge-pulse-green');
        overlay.classList.add('edge-pulse-gold');
      } else if (current >= 50 && current < 100 && !overlay.classList.contains('edge-pulse-green')) {
        overlay.classList.add('edge-pulse-green');
      }

      if (progress < 1) requestAnimationFrame(animateCounter);
      else {
        // SLAM: final number lands
        totalEl.textContent = finalVal.toLocaleString();
        finalEl.classList.add('slam');
        AudioEngine.scoreSlam(finalVal);

        // TIER2v5-3: Burst of particles on SLAM
        for (let i = 0; i < Math.min(30, 10 + finalVal / 20); i++) {
          spawnParticle(2.0);
        }

        // TIER2v5-3: Radial pulse on final SLAM
        const radialPulse = document.createElement('div');
        radialPulse.className = 'slam-radial-pulse';
        overlay.appendChild(radialPulse);
        setTimeout(() => radialPulse.remove(), 800);

        // Threshold effects
        if (finalVal >= 500) overlay.classList.add('threshold-500');
        else if (finalVal >= 250) overlay.classList.add('threshold-250');
        else if (finalVal >= 100) overlay.classList.add('threshold-100');
        else if (finalVal >= 50) overlay.classList.add('threshold-50');

        // TIER2v3-9: Inferno edge glow when inferno mods contributed
        if (hasInfernoStep || hasInfernoMods) {
          overlay.classList.add('inferno-glow');
        }

        // Personal best indicator
        if (data.isPersonalBest) {
          finalEl.classList.add('personal-best');
          const pbEl = document.createElement('div');
          pbEl.className = 'personal-best-badge';
          pbEl.textContent = '⭐ NEW PERSONAL BEST!';
          finalEl.appendChild(pbEl);
          AudioEngine.personalBest();
        }

        // Screen shake on big hits
        if (finalVal >= 100) {
          document.getElementById('battle-screen').classList.add('screen-shake');
          setTimeout(() => document.getElementById('battle-screen').classList.remove('screen-shake'), 400);
        }
      }
    }

    finalEl.classList.add('visible');
    requestAnimationFrame(animateCounter);
  }, totalDelay);

  // Enemy HP drain animation — synced with counter
  if (data.actualDmg > 0 && data.enemyHpBefore !== undefined) {
    const hpBar = document.getElementById('enemy-hp-fill');
    const hpText = document.getElementById('enemy-hp-text');
    const startPct = (data.enemyHpBefore / data.enemyMaxHp) * 100;
    const endPct = Math.max(0, (data.enemyHpAfter / data.enemyMaxHp) * 100);

    // TIER2v5-3: Sync HP drain timing with counter animation
    const counterDuration = Math.min(1200, 400 + data.total * 2);
    setTimeout(() => {
      hpBar.style.transition = `width ${counterDuration}ms ease-out`;
      hpBar.style.width = endPct + '%';
      // Add HP drain colour flash
      hpBar.classList.add('hp-draining');
      setTimeout(() => hpBar.classList.remove('hp-draining'), counterDuration + 200);
      // Animate HP text
      const hpStart = data.enemyHpBefore;
      const hpEnd = data.enemyHpAfter;
      const hpDuration = counterDuration;
      const hpStartTime = performance.now();

      function animateHp(now) {
        const elapsed = now - hpStartTime;
        const progress = Math.min(1, elapsed / hpDuration);
        const current = Math.floor(hpStart - (hpStart - hpEnd) * progress);
        hpText.textContent = current + ' / ' + data.enemyMaxHp + (G.enemy.armor > 0 ? ' [🛡' + G.enemy.armor + ']' : '');
        if (progress < 1) requestAnimationFrame(animateHp);
      }
      requestAnimationFrame(animateHp);
    }, totalDelay + 200);
  }

  overlay.classList.add('active');
  setTimeout(() => {
    overlay.classList.remove('active', 'edge-pulse-green', 'edge-pulse-gold', 'edge-pulse-orange', 'edge-pulse-red');
    // TIER2v5-3: Stop particle animation
    if (particleAnimId) cancelAnimationFrame(particleAnimId);
    particles.length = 0;
    const hpBar = document.getElementById('enemy-hp-fill');
    if (hpBar) { hpBar.style.transition = ''; hpBar.classList.remove('hp-draining'); }
  }, totalDelay + 2000);
}

function showTrickResult(won, score, card) {
  const el = document.getElementById('trick-result');
  el.className = 'trick-result visible ' + (won ? 'win' : 'lose');
  if (won) {
    el.innerHTML = `Won! +${score}`;
    AudioEngine.trickWin(G.consecutiveWins);
  } else {
    // REC1-v7: "Why Did I Lose?" — contextual loss reason subtitle
    const reason = G._lastLossReason || '';
    el.innerHTML = `Lost!${reason ? '<div class="loss-reason">' + reason + '</div>' : ''}`;
    AudioEngine.trickLose();
  }
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

  // TIER1-REC1v6: Show resolution narrative if we have the cached data
  if (G._lastResolutionNarrative) {
    showResolutionNarrative(G._lastResolutionNarrative, won);
    G._lastResolutionNarrative = null;
  }

  updateBattleUI();
}

// ============================================================
// TIER1-REC3: CONSOLIDATED POPUP SYSTEM
// Keyword effects collect into score breakdown instead of spawning
// scattered floating popups. Only critical state-change popups
// remain as floating notifications.
// ============================================================
let _trickEffects = []; // Collected during trick resolution

function collectTrickEffect(label, colorClass) {
  _trickEffects.push({ label, value: '✓', colorClass: colorClass || 'keyword-color' });
}

// ============================================================
// REC6-v7: MID-BATTLE TWIST SYSTEM
// After round 2, 20% chance of a dramatic twist event
// ============================================================
const MID_BATTLE_TWISTS = [
  {
    id: 'wind_shift',
    icon: '🌪️',
    title: 'The Wind Shifts',
    desc: 'Trump suit changes to a random suit for the remaining rounds!',
    apply: () => {
      const suits = getAvailableBattleSuits();
      const newTrump = suits[Math.floor(Math.random() * suits.length)];
      G.trumpSuit = newTrump;
      return `Trump is now ${SUIT_SYMBOLS[newTrump]} ${newTrump}!`;
    }
  },
  {
    id: 'reinforcement',
    icon: '🛡️',
    title: 'Reinforcement',
    desc: 'Enemy gains +5 armor but drops +10 Ink on death.',
    apply: () => {
      G.enemy.armor = (G.enemy.armor || 0) + 5;
      G.enemy._twistBonusInk = 10;
      return 'Enemy +5 armor · You +10 bonus Ink on kill';
    }
  },
  {
    id: 'desperate_surge',
    icon: '💥',
    title: 'Desperate Surge',
    desc: 'Enemy goes all-in! Heavy attacks next round, but ×2 damage if you win all tricks.',
    apply: () => {
      // Force heavy_attack intents for next round
      G.enemy._desperateSurge = true;
      return 'Enemy rages — sweep the round for ×2 damage!';
    }
  },
  {
    id: 'crowd_favorite',
    icon: '🎭',
    title: 'Crowd Favorite',
    desc: 'Next trick with a streak of 3+ grants double modifiers!',
    apply: () => {
      G._crowdFavoriteActive = true;
      return 'Win on a 3+ streak for double modifier gains!';
    }
  },
];

function showMidBattleTwist(onComplete) {
  const twist = MID_BATTLE_TWISTS[Math.floor(Math.random() * MID_BATTLE_TWISTS.length)];
  const result = twist.apply();

  const banner = document.createElement('div');
  banner.className = 'mid-battle-twist-banner';
  banner.innerHTML = `
    <div class="twist-icon">${twist.icon}</div>
    <div class="twist-title">${twist.title}</div>
    <div class="twist-desc">${twist.desc}</div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('visible'));

  // Play dramatic audio
  AudioEngine.phaseTransition();
  // Screen shake
  document.getElementById('battle-screen')?.classList.add('screen-shake');
  setTimeout(() => document.getElementById('battle-screen')?.classList.remove('screen-shake'), 400);

  // Auto-dismiss after 2.5s then continue
  setTimeout(() => {
    banner.classList.remove('visible');
    setTimeout(() => {
      banner.remove();
      if (onComplete) onComplete();
    }, 400);
  }, 2500);
}

// Critical-only popup: only for game-state changes that need immediate visibility
function spawnCriticalPopup(text, topPct) {
  AudioEngine.keywordTrigger();
  const p = document.createElement('div');
  p.className = 'keyword-popup critical-popup';
  p.textContent = text;
  p.style.left = (30 + Math.random() * 40) + '%';
  p.style.top = (topPct || 40) + '%';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1200);
}

// Loss summary popup: consolidated single popup for loss effects
function spawnLossSummary(effects) {
  if (effects.length === 0) return;
  const p = document.createElement('div');
  p.className = 'keyword-popup loss-summary-popup';
  p.innerHTML = effects.map(e => `<span class="loss-effect-line">${e}</span>`).join('');
  p.style.left = '50%';
  p.style.top = '45%';
  p.style.transform = 'translateX(-50%)';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1500);
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
  AudioEngine.keywordTrigger();
  const p = document.createElement('div');
  p.className = 'keyword-popup';
  p.textContent = text;
  p.style.left = (30 + Math.random() * 40) + '%';
  p.style.top = (topPct || 45) + '%';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1000);
}

// ============================================================
// TIER1-REC5v3: MID-RUN DISRUPTION EVENTS
// Dramatic events that reshape mid-run strategy in Acts 2 & 3
// ============================================================
const DISRUPTION_EVENTS = [
  {
    id: 'void_storm',
    name: 'The Void Storm',
    icon: '🌀',
    text: 'Reality buckles. A rift tears across the sky and void energy floods your modifiers — sparks ignite into flames, but the storm saps your life force.',
    choices: [
      {
        label: 'Embrace the Storm',
        desc: 'All spark modifiers become flames (×2 value). Lose 40% current HP.',
        fn: () => {
          G.modifiers.forEach(m => {
            if (m.tier === 'spark') { m.tier = 'flame'; m.value = +(m.value * 2).toFixed(2); m.persistent = true; }
          });
          G.hp = Math.max(1, Math.floor(G.hp * 0.6));
        }
      },
      {
        label: 'Shield Against It',
        desc: 'Gain 25 shield and +20 max HP, but lose your 2 weakest modifiers.',
        fn: () => {
          G.shield += 25;
          G.maxHp += 20; G.hp += 20;
          const sorted = [...G.modifiers].sort((a, b) => a.value - b.value);
          const toRemove = sorted.slice(0, 2);
          toRemove.forEach(m => { const idx = G.modifiers.indexOf(m); if (idx >= 0) G.modifiers.splice(idx, 1); });
        }
      },
      {
        label: 'Channel the Void',
        desc: 'Gain a powerful Void Inferno modifier (+0.5× mult). All cards lose 2 base chips.',
        fn: () => {
          G.modifiers.push({ name: 'Void Inferno', suit: null, type: 'mult', value: 0.5, tier: 'inferno', persistent: true });
          G.deck.forEach(c => { c.baseChips = Math.max(1, c.baseChips - 2); });
          G.hand.forEach(c => { c.baseChips = Math.max(1, c.baseChips - 2); });
        }
      }
    ]
  },
  {
    id: 'convergence',
    name: 'The Convergence',
    icon: '✨',
    text: 'The cards in your deck shimmer and rearrange themselves. Fate is weaving something extraordinary — your next rewards will be exceptional, but at a cost.',
    choices: [
      {
        label: 'Accept the Gift',
        desc: 'Add 3 legendary cards with 2 keywords each to your deck.',
        fn: () => {
          for (let i = 0; i < 3; i++) {
            const card = makeCard(randomSuit(), Math.min(14, 11 + Math.floor(Math.random() * 4)), 'legendary');
            if (areKeywordsEnabled() && card.keywords.length < 2) {
              while (card.keywords.length < 2) {
                const kw = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
                if (!card.keywords.includes(kw)) card.keywords.push(kw);
              }
            }
            G.deck.push(card);
          }
        }
      },
      {
        label: 'Distill Power',
        desc: 'Remove 5 weakest cards. Remaining cards gain +3 base chips.',
        fn: () => {
          const allCards = [...G.deck].sort((a, b) => a.baseChips - b.baseChips);
          const removeIds = allCards.slice(0, Math.min(5, G.deck.length - 10)).map(c => c.id);
          G.deck = G.deck.filter(c => !removeIds.includes(c.id));
          G.deck.forEach(c => { c.baseChips += 3; });
          G.hand.forEach(c => { c.baseChips += 3; });
        }
      },
      {
        label: 'Refuse Fate',
        desc: 'Gain 50 Ink and 15 Embers. Your deck stays unchanged.',
        fn: () => {
          G.ink += 50;
          G.embers += 15;
        }
      }
    ]
  },
  {
    id: 'betrayal',
    name: 'The Betrayal',
    icon: '🗡️',
    text: 'One of your strongest modifiers flickers and darkens — it has been claimed by the enemy. You\'ll need to fight harder to compensate, or find a new path to power.',
    choices: [
      {
        label: 'Accept the Loss',
        desc: 'Lose your strongest modifier. Gain Vengeance charge (×2.5 next win).',
        fn: () => {
          if (G.modifiers.length > 0) {
            const sorted = [...G.modifiers].sort((a, b) => b.value - a.value);
            const strongest = sorted[0];
            const idx = G.modifiers.indexOf(strongest);
            if (idx >= 0) G.modifiers.splice(idx, 1);
          }
          G.sacrificeCharge = 3; // Full vengeance charge
        }
      },
      {
        label: 'Fight to Reclaim',
        desc: 'Keep your modifier but next 2 encounters deal ×1.5 damage to you.',
        fn: () => {
          G._betrayalDmgBoost = 2; // Tracked encounters remaining with boosted damage
        }
      },
      {
        label: 'Forge a Replacement',
        desc: 'Lose your strongest modifier. Gain 2 flame-tier mods of random types.',
        fn: () => {
          if (G.modifiers.length > 0) {
            const sorted = [...G.modifiers].sort((a, b) => b.value - a.value);
            const idx = G.modifiers.indexOf(sorted[0]);
            if (idx >= 0) G.modifiers.splice(idx, 1);
          }
          const s1 = randomSuit(), s2 = randomSuit();
          G.modifiers.push({ name: s1.charAt(0).toUpperCase()+s1.slice(1)+' Flame', suit: s1, type: 'mult', value: 0.2, tier: 'flame', persistent: true });
          G.modifiers.push({ name: s2.charAt(0).toUpperCase()+s2.slice(1)+' Flame', suit: s2, type: Math.random() < 0.5 ? 'mult' : 'chips', value: Math.random() < 0.5 ? 0.2 : 8, tier: 'flame', persistent: true });
        }
      }
    ]
  },
  {
    id: 'crucible',
    name: 'The Crucible',
    icon: '🔥',
    text: 'The ground splits open and molten energy surges upward. Your cards are drawn toward the fire — sacrifice now for devastating power, or protect what you\'ve built.',
    choices: [
      {
        label: 'Feed the Crucible',
        desc: 'Burn 4 random cards from your deck. Each adds +0.15× mult permanently.',
        fn: () => {
          const burnCount = Math.min(4, G.deck.length - 8);
          for (let i = 0; i < burnCount; i++) {
            if (G.deck.length <= 8) break;
            const idx = Math.floor(Math.random() * G.deck.length);
            const card = G.deck.splice(idx, 1)[0];
            G.burnPile.push(card);
          }
          G.modifiers.push({ name: 'Crucible Flame', suit: null, type: 'mult', value: +(burnCount * 0.15).toFixed(2), tier: 'inferno', persistent: true });
        }
      },
      {
        label: 'Temper Your Deck',
        desc: 'All cards gain +2 base chips and +0.1× base mult. Lose 15 HP.',
        fn: () => {
          G.deck.forEach(c => { c.baseChips += 2; c.baseMult = +(c.baseMult + 0.1).toFixed(2); });
          G.hand.forEach(c => { c.baseChips += 2; c.baseMult = +(c.baseMult + 0.1).toFixed(2); });
          G.hp = Math.max(1, G.hp - 15);
        }
      }
    ]
  },
  {
    id: 'mirror_realm',
    name: 'The Mirror Realm',
    icon: '🪞',
    text: 'The world flips. Everything you see is reversed — weaknesses become strengths, losses become opportunities. The rules of engagement shift fundamentally.',
    choices: [
      {
        label: 'Enter the Mirror',
        desc: 'Swap all chip mods to mult and vice versa (keeping values). Heal to full.',
        fn: () => {
          G.modifiers.forEach(m => {
            if (m.type === 'chips') m.type = 'mult';
            else if (m.type === 'mult') m.type = 'chips';
          });
          G.hp = G.maxHp;
        }
      },
      {
        label: 'Shatter the Mirror',
        desc: 'Gain a unique Shard modifier: +0.4× mult, permanent. Take 20 damage.',
        fn: () => {
          G.modifiers.push({ name: 'Mirror Shard', suit: null, type: 'mult', value: 0.4, tier: 'inferno', persistent: true });
          G.hp = Math.max(1, G.hp - 20);
        }
      },
      {
        label: 'Walk Past',
        desc: 'Gain +30 max HP and full heal. No modifier changes.',
        fn: () => {
          G.maxHp += 30; G.hp = G.maxHp;
        }
      }
    ]
  },
  {
    id: 'eclipse',
    name: 'The Eclipse',
    icon: '🌑',
    text: 'Darkness swallows the light. Your suit affinities dissolve — for the remainder of this act, all cards resonate with raw, unaligned power.',
    choices: [
      {
        label: 'Embrace Darkness',
        desc: 'Convert all suit-specific mods to universal mods. Gain +0.1× to each.',
        fn: () => {
          G.modifiers.forEach(m => {
            if (m.suit) {
              m.suit = null;
              m.name = 'Eclipse ' + (m.type === 'mult' ? 'Spark' : 'Chips');
              m.value = +(m.value + 0.1).toFixed(2);
            }
          });
        }
      },
      {
        label: 'Hold the Light',
        desc: 'Double the value of your 3 strongest suit-specific mods.',
        fn: () => {
          const suited = G.modifiers.filter(m => m.suit).sort((a, b) => b.value - a.value);
          suited.slice(0, 3).forEach(m => { m.value = +(m.value * 2).toFixed(2); });
        }
      }
    ]
  }
];

function shouldTriggerDisruption() {
  // Only in Act 2 and Act 3
  if (G.act < 2) return false;
  // Check if already triggered for this act
  if (G.act === 2 && G._disruptionTriggeredAct2) return false;
  if (G.act === 3 && G._disruptionTriggeredAct3) return false;
  // Trigger after completing 3+ nodes in this act (roughly mid-map)
  if (G._nodesCompletedThisAct < 3) return false;
  // 100% chance at node 4+, graduated chance at node 3
  if (G._nodesCompletedThisAct === 3) return Math.random() < 0.6;
  return true;
}

function showDisruptionEvent() {
  // Mark as triggered
  if (G.act === 2) G._disruptionTriggeredAct2 = true;
  if (G.act === 3) G._disruptionTriggeredAct3 = true;

  // Pick a random disruption (avoid repeating if possible)
  const lastDisruption = G._activeDisruption;
  let pool = DISRUPTION_EVENTS.filter(d => d.id !== lastDisruption);
  if (pool.length === 0) pool = DISRUPTION_EVENTS;
  const evt = pool[Math.floor(Math.random() * pool.length)];
  G._activeDisruption = evt.id;

  // Use the event screen with disruption-specific styling
  showScreen('event-screen');
  const titleEl = document.getElementById('event-title');
  const textEl = document.getElementById('event-text');
  const container = document.getElementById('event-choices');

  titleEl.textContent = evt.icon + ' ' + evt.name;
  titleEl.classList.add('disruption-title');
  textEl.textContent = evt.text;
  textEl.classList.add('disruption-text');
  container.innerHTML = '';

  // Add disruption banner
  const banner = document.createElement('div');
  banner.className = 'disruption-banner';
  banner.innerHTML = `<span class="disruption-banner-icon">${evt.icon}</span><span class="disruption-banner-label">⚡ DISRUPTION EVENT ⚡</span>`;
  container.parentElement.insertBefore(banner, container);

  evt.choices.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'event-choice disruption-choice';
    el.innerHTML = `<div class="choice-label">${ch.label}</div><div class="choice-desc">${ch.desc}</div>`;
    el.addEventListener('click', () => {
      AudioEngine.phaseTransition();
      ch.fn();
      // Clean up disruption styling
      titleEl.classList.remove('disruption-title');
      textEl.classList.remove('disruption-text');
      const existingBanner = document.querySelector('.disruption-banner');
      if (existingBanner) existingBanner.remove();
      showMap();
    });
    container.appendChild(el);
  });

  // Play dramatic audio
  AudioEngine.phaseTransition();
}

// ===== ENCOUNTER VICTORY =====
function encounterVictory() {
  G.encountersWon++;
  G._combatEncounterIndex = (G._combatEncounterIndex || 0) + 1; // TIER2-REC4v6: Progressive wrinkle tracking
  AudioEngine.encounterVictory();

  // Track enemy defeat for progression
  if (G.enemy) {
    trackEnemyDefeated(G.enemy);
    if (G.enemy.tier === 'boss') META.bossesKilled = (META.bossesKilled || 0) + 1;
    if (G.enemy.tier === 'elite') META.elitesKilled = (META.elitesKilled || 0) + 1;
    // TIER2-11: Analytics — track enemy kills and encounter damage
    const a = META.analytics;
    a.enemiesKilledByName[G.enemy.name] = (a.enemiesKilledByName[G.enemy.name] || 0) + 1;
    if (!a.totalDamageByEncounter) a.totalDamageByEncounter = [];
    a.totalDamageByEncounter.push({ enemy: G.enemy.name, damage: G.totalDamage, act: G.act, result: 'win' });
    if (a.totalDamageByEncounter.length > 50) a.totalDamageByEncounter.shift();
  }

  // TIER1-REC5v3: Decrement Betrayal disruption counter
  if (G._betrayalDmgBoost > 0) G._betrayalDmgBoost--;

  // Track archetype max levels
  if (G.archetypeProgress) {
    Object.entries(G.archetypeProgress).forEach(([key, val]) => {
      if (!META.archetypeMaxLevels[key] || val > META.archetypeMaxLevels[key]) {
        META.archetypeMaxLevels[key] = val;
      }
    });
  }

  const inkGain = G.enemy.tier === 'boss' ? 80 : G.enemy.tier === 'elite' ? 50 : 30;
  G.ink += inkGain;

  G.deck.push(...G.hand);
  G.hand = [];

  if (G.enemy.tier === 'elite' || G.enemy.tier === 'boss') {
    const suit = randomSuit();
    G.modifiers.push({
      name: suit.charAt(0).toUpperCase() + suit.slice(1) + (G.enemy.tier === 'boss' ? ' Inferno' : ' Flame'),
      suit, type: 'mult', value: G.enemy.tier === 'boss' ? 0.3 : 0.2,
      tier: G.enemy.tier === 'boss' ? 'inferno' : 'flame', persistent: true
    });
    // TIER2-6: Decision-Changing Modifier drop — 50% chance from elite, guaranteed from boss
    const dropChance = G.enemy.tier === 'boss' ? 1.0 : 0.5;
    if (Math.random() < dropChance) {
      const dm = grantRandomDecisionModifier(G.enemy.tier === 'boss' ? 'inferno' : 'flame');
      if (dm) {
        spawnKeywordPopup(`${dm.icon} NEW: ${dm.name}!`, 35);
      }
    }
  }

  if (G.enemy.tier === 'boss') {
    // TIER2v3-7: Boss Defeat Screen
    const defeatedEnemy = G.enemy;
    G.act++;
    G._nodesCompletedThisAct = 0; // TIER1-REC5v3: Reset for new act
    if (G.act > 3) {
      showBossDefeat(defeatedEnemy, () => gameOver(true));
      return;
    }
    generateMap();
    showBossDefeat(defeatedEnemy, () => {
      showRewardScreen(inkGain, true);
      // TIER2v3-10: Act transition flavour
      setTimeout(() => showActTransitionFlavour(G.act), 800);
    });
  } else {
    showRewardScreen(inkGain, false);
  }
}

function showRewardScreen(inkGain, isBoss) {
  AudioEngine.stopMusic();
  showScreen('reward-screen');
  document.getElementById('reward-ink').textContent = '+' + inkGain + ' Ink' + (isBoss ? '  •  Act Complete!' : '');
  document.getElementById('reward-title').textContent = 'Victory!';

  // FEATURE 4: Render deck context
  renderDeckContext();

  const container = document.getElementById('reward-cards');
  container.innerHTML = '';

  const tier = G.enemy?.tier || 'standard';
  const baseRewards = G.ascension >= 11 ? 3 : 4; // 4 rewards (1 more than original)
  const numRewards = baseRewards;

  // Archetype-leaning rewards
  const lead = getLeadArchetype();

  // FEATURE 4: Guaranteed keyword card matching lead archetype (only when keywords enabled)
  let guaranteedIndex = (lead && areKeywordsEnabled()) ? Math.floor(Math.random() * numRewards) : -1;

  for (let i = 0; i < numRewards; i++) {
    let suit, rank, rarity, card;

    if (i === guaranteedIndex && lead) {
      // Guaranteed archetype keyword card
      const archKws = ARCHETYPE_DATA[lead.key].keywords;
      const archSuits = ARCHETYPE_DATA[lead.key].suits.filter(s => getAvailableAllSuits().includes(s));
      suit = archSuits.length > 0 ? archSuits[Math.floor(Math.random() * archSuits.length)] : randomSuit();
      rank = Math.min(14, Math.floor(Math.random() * 8) + 6 + (tier === 'boss' ? 2 : tier === 'elite' ? 1 : 0));
      rarity = tier === 'boss' ? 'rare' : (Math.random() < 0.5 ? 'uncommon' : 'rare');
      card = makeCard(suit, rank, rarity);
      // Force archetype keyword
      const kw = archKws[Math.floor(Math.random() * archKws.length)];
      if (!card.keywords.includes(kw)) {
        if (card.keywords.length === 0) card.keywords = [kw];
        else card.keywords[0] = kw;
      }
    } else {
      // 40% chance to lean toward archetype suit
      if (lead && Math.random() < 0.4) {
        const archSuits = ARCHETYPE_DATA[lead.key].suits.filter(s => getAvailableAllSuits().includes(s));
        suit = archSuits.length > 0 ? archSuits[Math.floor(Math.random() * archSuits.length)] : randomSuit();
      } else {
        suit = randomSuit();
      }
      rank = Math.min(14, Math.floor(Math.random() * 13) + 2 + (tier === 'boss' ? 3 : tier === 'elite' ? 2 : 0));
      rarity = tier === 'boss' ? 'rare' : tier === 'elite' ? (Math.random() < 0.5 ? 'uncommon' : 'rare') : (Math.random() < 0.7 ? 'common' : 'uncommon');
      card = makeCard(suit, rank, rarity);
    }

    const el = document.createElement('div');
    el.className = 'reward-card-option';
    el.innerHTML = `
      ${i === guaranteedIndex && lead ? '<div class="reward-guaranteed-badge">✦ ' + ARCHETYPE_DATA[lead.key].name + '</div>' : ''}
      <div class="card-rank" style="color:${SUIT_COLORS[suit]}">${RANK_NAMES[rank]}</div>
      <div class="card-suit">${SUIT_SYMBOLS[suit]}</div>
      <div class="card-name">${card.name}</div>
      <div style="font-size:9px;color:var(--text-dim);margin-top:2px">${card.baseChips}♦ ${card.baseMult}×</div>
      ${card.keywords.length ? '<div style="font-size:10px;color:var(--gold);margin-top:2px">'+card.keywords.join(', ')+'</div>' : ''}
    `;
    el.addEventListener('click', () => {
      // TIER2v3-6: If this is the guaranteed archetype card with keywords, offer keyword draft
      if (i === guaranteedIndex && lead && areKeywordsEnabled() && card.keywords.length > 0) {
        showRewardKeywordDraft(card, el, (finalCard) => {
          G.deck.push(finalCard);
          showMap();
        });
        return;
      }
      G.deck.push(card);
      showMap();
    });
    container.appendChild(el);
  }

  // FEATURE 4: Transform option (available if deck > 15)
  const transformArea = document.getElementById('transform-area');
  if (G.deck.length > 15) {
    transformArea.style.display = 'block';
  } else {
    transformArea.style.display = 'none';
  }

  const relicArea = document.getElementById('relic-reward-area');
  const relicContainer = document.getElementById('relic-reward-cards');
  relicContainer.innerHTML = '';

  if ((tier === 'elite' || tier === 'boss') && G.relics.length < 8) {
    relicArea.style.display = 'block';
    // Merge base relics with unlocked relics
    const fullRelicPool = [...RELIC_POOL, ...getUnlockedRelics()];
    const available = fullRelicPool.filter(r => !G.relics.some(gr => gr.id === r.id));
    shuffleArray(available);
    available.slice(0, 3).forEach(relic => {
      const el = document.createElement('div');
      el.className = 'relic-reward-option';
      const isUnlocked = getUnlockedRelics().some(ur => ur.id === relic.id);
      el.innerHTML = `<div class="relic-big-icon">${relic.icon}</div><div class="relic-r-name">${relic.name}${isUnlocked ? ' <span style="color:var(--gold);font-size:9px">🔓</span>' : ''}</div><div class="relic-r-desc">${relic.desc}</div>`;
      el.addEventListener('click', () => { G.relics.push({ ...relic }); trackRelicInBestiary(relic); AudioEngine.relicPickup(); relicArea.style.display = 'none'; });
      relicContainer.appendChild(el);
    });
  } else relicArea.style.display = 'none';
}

// FEATURE 4: Deck Context Display
function renderDeckContext() {
  const container = document.getElementById('deck-context-stats');
  if (!container) return;
  container.innerHTML = '';

  const deck = G.deck;
  if (deck.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:10px;">Empty deck</div>';
    return;
  }

  // Suit distribution
  const suitCounts = {};
  SUITS.forEach(s => { suitCounts[s] = 0; });
  deck.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });

  // Keyword count
  let totalKeywords = 0;
  deck.forEach(c => { totalKeywords += c.keywords.length; });

  // Avg rank
  const avgRank = (deck.reduce((sum, c) => sum + c.rank, 0) / deck.length).toFixed(1);

  // Build display
  SUITS.forEach(s => {
    const count = suitCounts[s] || 0;
    const pct = Math.round((count / deck.length) * 100);
    const color = getComputedSuitColor(s);
    const stat = document.createElement('div');
    stat.className = 'deck-stat';
    stat.innerHTML = `
      <div class="ds-label">${SUIT_SYMBOLS[s]}</div>
      <div class="ds-value" style="color:${color}">${count}</div>
      <div class="ds-bar"><div class="ds-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    `;
    container.appendChild(stat);
  });

  // Separator + stats
  const sep = document.createElement('div');
  sep.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.1);margin:0 4px;';
  container.appendChild(sep);

  const kwStat = document.createElement('div');
  kwStat.className = 'deck-stat';
  kwStat.innerHTML = `<div class="ds-label">KWs</div><div class="ds-value" style="color:var(--gold)">${totalKeywords}</div>`;
  container.appendChild(kwStat);

  const rankStat = document.createElement('div');
  rankStat.className = 'deck-stat';
  rankStat.innerHTML = `<div class="ds-label">Avg Rank</div><div class="ds-value">${avgRank}</div>`;
  container.appendChild(rankStat);

  const sizeStat = document.createElement('div');
  sizeStat.className = 'deck-stat';
  sizeStat.innerHTML = `<div class="ds-label">Size</div><div class="ds-value">${deck.length}</div>`;
  container.appendChild(sizeStat);
}

// FEATURE 4: Transform System
function showTransformPicker() {
  const overlay = document.getElementById('transform-overlay');
  const container = document.getElementById('transform-cards');
  container.innerHTML = '';

  if (G.deck.length <= 15) {
    closeTransformPicker();
    return;
  }

  // Sort deck by rank to show weakest first
  const sortedDeck = [...G.deck].sort((a, b) => a.rank - b.rank);

  sortedDeck.forEach(card => {
    const el = document.createElement('div');
    el.className = 'transform-card-option';
    el.innerHTML = `
      <div class="tc-rank" style="color:${SUIT_COLORS[card.suit]}">${RANK_NAMES[card.rank]}</div>
      <div class="tc-suit">${SUIT_SYMBOLS[card.suit]}</div>
      <div class="tc-info">${card.baseChips}♦ ${card.rarity || 'c'}</div>
      ${card.keywords.length ? '<div class="tc-info" style="color:var(--gold)">' + card.keywords[0] + '</div>' : ''}
    `;
    el.addEventListener('click', () => {
      executeTransform(card);
    });
    container.appendChild(el);
  });

  overlay.classList.add('active');
}

function closeTransformPicker() {
  document.getElementById('transform-overlay').classList.remove('active');
}

function executeTransform(sacrificeCard) {
  // Remove sacrificed card from deck
  G.deck = G.deck.filter(c => c.id !== sacrificeCard.id);

  // Generate a random rare card
  const suit = randomSuit();
  const rank = Math.min(14, Math.floor(Math.random() * 5) + 10);
  const newCard = makeCard(suit, rank, 'rare');

  G.deck.push(newCard);
  closeTransformPicker();

  // Update the deck context
  renderDeckContext();

  // Hide transform button after use
  document.getElementById('transform-area').style.display = 'none';

  spawnKeywordPopup('🔄 TRANSFORMED: ' + sacrificeCard.name + ' → ' + newCard.name, 40);
}

function skipReward() { showMap(); }

// ===== EVENTS =====
const EVENTS = [
  { title: 'The Ink Well', text: 'A bubbling well of pure Ink. Its depths seem bottomless.',
    choices: [
      { label: 'Drink Deep', desc: '+80 Ink, add 3 common cards', fn: () => { G.ink += 80; for(let i=0;i<3;i++) G.deck.push(makeCard(randomBattleSuit(), Math.floor(Math.random()*8)+2, 'common')); }},
      { label: 'Bottle It', desc: '+35 Ink', fn: () => { G.ink += 35; }},
      { label: 'Drown a Card', desc: 'Remove a random card', fn: () => { if(G.deck.length>15) G.deck.splice(Math.floor(Math.random()*G.deck.length),1); }},
    ]},
  { title: 'The Modifier Merchant', text: 'A cloaked figure offers a glowing sigil.',
    choices: [
      { label: 'Trade HP', desc: '-15 max HP, +Flame modifier', fn: () => { G.maxHp-=15; G.hp=Math.min(G.hp,G.maxHp); const s=randomSuit(); G.modifiers.push({name:s.charAt(0).toUpperCase()+s.slice(1)+' Flame',suit:s,type:'mult',value:0.3,tier:'flame',persistent:true}); }},
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
      { label: 'Merge Timelines', desc: 'Add 2 rare cards', fn: () => { for(let i=0;i<2;i++) G.deck.push(makeCard(randomSuit(), Math.floor(Math.random()*5)+10, 'rare')); }},
      { label: 'Shatter It', desc: '+5 chips modifier', fn: () => { G.modifiers.push({name:'Fracture Chips',suit:null,type:'chips',value:5,tier:'flame',persistent:true}); }},
    ]},
  { title: 'The Pyre Keeper', text: 'A figure tends a bonfire of discarded cards. "I can reshape what was lost."',
    choices: [
      { label: 'Feed the Pyre', desc: '+15 Embers, gain Pyre keyword on next card', fn: () => { G.embers += 15; }},
      { label: 'Salvage Ashes', desc: 'Add a random Stars card to deck', fn: () => { G.deck.push(makeCard('stars', Math.floor(Math.random()*5)+10, 'uncommon')); }},
    ]},
  // Archetype-themed event
  { title: 'The Path Shrine', text: 'Ancient stones hum with purpose. They sense your growing power.',
    choices: [
      { label: 'Embrace Your Path', desc: '+3 archetype progress to your strongest path', fn: () => { const lead = getLeadArchetype(); if (lead) G.archetypeProgress[lead.key] += 3; }},
      { label: 'Branch Out', desc: 'Add keyword card matching your archetype', fn: () => { const lead = getLeadArchetype(); if (lead) { const kw = ARCHETYPE_DATA[lead.key].keywords[0]; const c = makeCard(randomSuit(), Math.floor(Math.random()*5)+8, 'rare'); if (areKeywordsEnabled()) c.keywords = [kw]; G.deck.push(c); } else { G.ink += 20; } }},
    ]},
];

function showEvent() {
  showScreen('event-screen');
  // Merge base events with unlocked events
  const unlockedEvents = getUnlockedEvents();
  const allEvents = [...EVENTS];
  unlockedEvents.forEach(ue => {
    allEvents.push({
      title: ue.title,
      text: ue.text,
      choices: ue.choices.map(ch => ({
        label: ch.label,
        desc: ch.desc,
        fn: () => applyUnlockedEventEffect(ch.effectKey),
      })),
      isUnlocked: true,
    });
  });
  const evt = allEvents[Math.floor(Math.random() * allEvents.length)];
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

// ===== UNLOCKED EVENT EFFECTS =====
function applyUnlockedEventEffect(effectKey) {
  switch(effectKey) {
    // Ember Oracle
    case 'oracle_peek':
      spawnKeywordPopup('🔮 Oracle: Future sight granted!', 40);
      break;
    case 'oracle_burn':
      if (G.deck.length > 3) {
        G.deck.sort((a,b) => a.baseChips - b.baseChips);
        G.deck.splice(0, 3);
      }
      G.embers += 10;
      break;
    case 'oracle_embrace':
      G.modifiers.push({ name: 'Oracle\'s Flame', suit: null, type: 'mult', value: 0.4, tier: 'inferno', persistent: true });
      G.maxHp = Math.floor(G.maxHp * 0.8);
      G.hp = Math.min(G.hp, G.maxHp);
      break;
    // Void Merchant
    case 'void_trade_relic':
      if (G.relics.length > 0) {
        G.relics.pop();
        const s1 = randomSuit();
        const s2 = randomSuit();
        G.modifiers.push({ name: s1.charAt(0).toUpperCase()+s1.slice(1)+' Flame', suit: s1, type: 'mult', value: 0.2, tier: 'flame', persistent: true });
        G.modifiers.push({ name: s2.charAt(0).toUpperCase()+s2.slice(1)+' Flame', suit: s2, type: 'mult', value: 0.2, tier: 'flame', persistent: true });
      }
      break;
    case 'void_trade_hand':
      G.deck.push(...G.hand);
      G.hand = [];
      for (let i = 0; i < 7; i++) {
        G.deck.push(makeCard(randomSuit(), Math.floor(Math.random()*5)+10, 'rare'));
      }
      break;
    case 'void_trade_hp':
      G.hp = 1;
      G.deck.forEach(c => c.baseChips += 5);
      G.hand.forEach(c => c.baseChips += 5);
      break;
    // Chronos Dealer
    case 'chronos_legendary':
      for (let i = 0; i < 2; i++) {
        G.deck.push(makeCard(randomSuit(), 14, 'legendary'));
      }
      break;
    case 'chronos_loop':
      buildStartingDeck();
      break;
    case 'chronos_gambit':
      G.modifiers.forEach(m => { if (typeof m.value === 'number') m.value *= 2; });
      G.maxHp -= 30;
      G.hp = Math.min(G.hp, G.maxHp);
      break;
    // Forge Spirit
    case 'forge_masterwork':
      G.modifiers.push({ name: 'Masterwork', suit: null, type: 'mult', value: 0.5, tier: 'inferno', persistent: true });
      break;
    case 'forge_temper':
      G.deck.forEach(c => c.baseChips += 3);
      G.hand.forEach(c => c.baseChips += 3);
      break;
    case 'forge_anneal':
      G.maxHp += 20; G.hp += 20;
      G.shield += 10;
      break;
    // Star Gate
    case 'stargate_transform':
      for (let i = 0; i < 5 && G.deck.length > 0; i++) {
        const idx = Math.floor(Math.random() * G.deck.length);
        G.deck[idx] = makeCard('stars', Math.floor(Math.random()*5)+10, 'rare');
      }
      break;
    case 'stargate_channel':
      G.deck.forEach(c => { if (c.suit === 'stars') c.baseMult = (c.baseMult || 1) + 0.1; });
      break;
    case 'stargate_absorb':
      G.maxHp += 25; G.hp += 25;
      break;
    // Card Graveyard
    case 'graveyard_reclaim':
      for (let i = 0; i < 3; i++) {
        const c = makeCard(randomSuit(), Math.floor(Math.random()*5)+10, 'rare');
        if (areKeywordsEnabled()) c.keywords = ['Resurrect'];
        G.deck.push(c);
      }
      break;
    case 'graveyard_harvest':
      G.embers += 20;
      G.deck.forEach(c => { if (c.keywords.includes('Pyre')) c.baseChips += 5; });
      break;
    case 'graveyard_rest':
      G.hp = G.maxHp;
      G.maxHp += 5;
      G.hp += 5;
      break;
    // Ascension Altar
    case 'altar_transcend':
      G.modifiers.push({ name: 'Transcendence', suit: null, type: 'mult', value: 0.3, tier: 'inferno', persistent: true });
      break;
    case 'altar_reflect':
      G.maxHp += 15; G.hp += 15;
      break;
    case 'altar_extend':
      if (META.unlockedAscension < 25) META.unlockedAscension = 25;
      saveMeta(META);
      break;
    default:
      G.ink += 20; // Fallback reward
  }
}

function showRest() {
  showScreen('rest-screen');
  const container = document.getElementById('rest-choices');
  container.innerHTML = '';
  const hpLoss = G.ascension >= 4 ? 1 : 0;
  const healAmount = Math.floor(G.maxHp * 0.3);

  // TIER2-7: Enhanced Rest Sites — 6 meaningful choices
  // TIER3-11: Add Purify option when deck contains Cursed cards
  const hasCursedCards = G.deck.some(c => c._isCursed);

  const choices = [
    {
      label: '🔥 Rest & Heal',
      desc: `Recover 30% HP (+${healAmount})${hpLoss ? ' then lose 1 HP' : ''}`,
      icon: '🔥',
      category: 'recovery',
      fn: () => {
        G.hp = Math.min(G.maxHp, G.hp + healAmount);
        if (hpLoss) G.hp = Math.max(1, G.hp - 1);
        showMap();
      }
    },
    // TIER3-11: Purify — remove a Cursed card (only shown when cursed cards exist)
    ...(hasCursedCards ? [{
      label: '🌟 Purify — Remove Curse',
      desc: `Cleanse a Corrupted card from your deck (${G.deck.filter(c => c._isCursed).length} cursed)`,
      icon: '🌟',
      category: 'recovery',
      needsCardSelect: true,
      _curseOnly: true,
      fn: (card) => {
        G.deck = G.deck.filter(c => c.id !== card.id);
        spawnKeywordPopup('🌟 Corruption Cleansed!', 40);
        showMap();
      }
    }] : []),
    {
      label: '⚒️ Smith — Upgrade Card',
      desc: 'Choose a card: +60% base chips & upgrade rarity',
      icon: '⚒️',
      category: 'cards',
      needsCardSelect: true,
      fn: (card) => {
        card.baseChips = Math.floor(card.baseChips * 1.6);
        if (card.rarity === 'common') card.rarity = 'uncommon';
        else if (card.rarity === 'uncommon') card.rarity = 'rare';
        card.name = '★ ' + card.name.replace(/^★ /, '');
        showMap();
      }
    },
    {
      label: '🗑️ Remove Card',
      desc: `Remove a weak card from your deck (${G.deck.length} cards)`,
      icon: '🗑️',
      category: 'cards',
      needsCardSelect: true,
      disabled: G.deck.length <= 12,
      disabledReason: 'Deck too small (min 12)',
      fn: (card) => {
        G.deck = G.deck.filter(c => c.id !== card.id);
        showMap();
      }
    },
    {
      label: '🔑 Enchant — Add Keyword',
      desc: 'Choose a card, then pick from 3 keywords',
      icon: '🔑',
      category: 'cards',
      needsCardSelect: true,
      fn: (card) => {
        showKeywordDraft(card, () => showMap());
      }
    },
    {
      label: '🧘 Meditate',
      desc: 'Gain +3 progress toward your lead archetype',
      icon: '🧘',
      category: 'power',
      fn: () => {
        const lead = getLeadArchetype();
        if (lead && G.archetypeProgress) {
          G.archetypeProgress[lead.key] = (G.archetypeProgress[lead.key] || 0) + 3;
          spawnKeywordPopup(`🧘 ${ARCHETYPE_DATA[lead.key]?.name || lead.key}: +3 progress`, 40);
        } else {
          // Fallback: grant a small modifier if no archetype yet
          const s = randomSuit();
          G.modifiers.push({ name: s.charAt(0).toUpperCase() + s.slice(1) + ' Flame', suit: s, type: 'mult', value: 0.15, tier: 'flame', persistent: true });
        }
        showMap();
      }
    },
    {
      label: '🎲 Reforge — Reroll Stats',
      desc: 'Choose a card: reroll its rank (±3) and suit randomly',
      icon: '🎲',
      category: 'cards',
      needsCardSelect: true,
      fn: (card) => {
        const delta = Math.floor(Math.random() * 7) - 3; // -3 to +3
        card.rank = Math.max(2, Math.min(14, card.rank + delta));
        card.suit = randomSuit();
        card.baseChips = Math.floor(card.rank * 1.5) + Math.floor(Math.random() * 3);
        card.name = '⚡ ' + CARD_NAMES_PREFIX[card.suit][Math.floor(Math.random() * CARD_NAMES_PREFIX[card.suit].length)] + ' ' + RANK_NAMES[card.rank];
        spawnKeywordPopup(`Reforged: ${RANK_NAMES[card.rank]}${SUIT_SYMBOLS[card.suit]}!`, 40);
        showMap();
      }
    },
  ];

  choices.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'event-choice rest-choice';
    if (ch.disabled) el.classList.add('rest-choice-disabled');

    el.innerHTML = `
      <div class="rest-choice-header">
        <span class="rest-choice-icon">${ch.icon}</span>
        <span class="choice-label">${ch.label}</span>
        <span class="rest-choice-category">${ch.category}</span>
      </div>
      <div class="choice-desc">${ch.disabled ? ch.disabledReason : ch.desc}</div>
    `;

    if (!ch.disabled) {
      el.addEventListener('click', () => {
        if (ch.needsCardSelect) {
          showRestCardSelector(ch);
        } else {
          ch.fn();
        }
      });
    }

    container.appendChild(el);
  });
}

// TIER2-7: Card selection UI for rest site choices
function showRestCardSelector(choice) {
  const container = document.getElementById('rest-choices');
  container.innerHTML = '';

  // Title
  const header = document.createElement('div');
  header.className = 'rest-card-selector-header';
  header.innerHTML = `
    <div class="rest-selector-title">${choice.icon} ${choice.label}</div>
    <div class="rest-selector-desc">${choice.desc}</div>
    <button class="btn-small rest-back-btn" id="rest-back-btn">← Back</button>
  `;
  container.appendChild(header);

  // Sort deck by rank for easier browsing
  // TIER3-11: Filter to cursed cards only for Purify option
  let sortedDeck = [...G.deck].sort((a, b) => a.rank - b.rank);
  if (choice._curseOnly) {
    sortedDeck = sortedDeck.filter(c => c._isCursed);
  }

  const grid = document.createElement('div');
  grid.className = 'rest-card-grid';

  sortedDeck.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = `rest-card-option rarity-${card.rarity || 'common'}`;
    // TIER3-11: Cursed card visual treatment in selector
    if (card._isCursed) cardEl.classList.add('rest-card-cursed');
    const suitColor = SUIT_COLORS[card.suit] || 'var(--text-primary)';
    const keywords = card.keywords.length > 0 ? card.keywords.join(', ') : '';

    cardEl.innerHTML = `
      <div class="rest-card-rank" style="color:${suitColor}">${RANK_NAMES[card.rank]}${SUIT_SYMBOLS[card.suit]}</div>
      <div class="rest-card-name">${card.name}</div>
      <div class="rest-card-stats">${card.baseChips}♦ ${card.baseMult || 1}×</div>
      ${keywords ? `<div class="rest-card-keywords">${keywords}</div>` : ''}
    `;

    cardEl.addEventListener('click', () => {
      // Apply choice to the actual deck card (not the sorted copy)
      const realCard = G.deck.find(c => c.id === card.id);
      if (realCard) {
        choice.fn(realCard);
      } else {
        showMap();
      }
    });

    grid.appendChild(cardEl);
  });

  container.appendChild(grid);

  document.getElementById('rest-back-btn').addEventListener('click', () => showRest());
}

// ============================================================
// TIER2v3-6: KEYWORD DRAFTING SYSTEM
// Offer choice of 3 keywords weighted toward lead archetype.
// Used by rest site Enchant and reward screen archetype card.
// ============================================================
function getWeightedKeywordChoices(card, count) {
  const available = KEYWORDS.filter(kw => !card.keywords.includes(kw));
  if (available.length === 0) return [];
  const lead = getLeadArchetype();
  const archKeywords = lead ? (ARCHETYPE_DATA[lead.key]?.keywords || []) : [];
  const choices = [];
  const used = new Set();

  for (let i = 0; i < Math.min(count, available.length); i++) {
    let pick = null;
    // 60% chance to pick an archetype keyword (if available)
    if (Math.random() < 0.6 && archKeywords.length > 0) {
      const archAvail = archKeywords.filter(kw => available.includes(kw) && !used.has(kw));
      if (archAvail.length > 0) {
        pick = archAvail[Math.floor(Math.random() * archAvail.length)];
      }
    }
    if (!pick) {
      const remaining = available.filter(kw => !used.has(kw));
      if (remaining.length === 0) break;
      pick = remaining[Math.floor(Math.random() * remaining.length)];
    }
    used.add(pick);
    choices.push({ keyword: pick, isArchetype: archKeywords.includes(pick) });
  }
  return choices;
}

function showKeywordDraft(card, onComplete) {
  const overlay = document.getElementById('keyword-draft-overlay');
  const header = document.getElementById('keyword-draft-header');
  const cardInfo = document.getElementById('keyword-draft-card-info');
  const choicesEl = document.getElementById('keyword-draft-choices');
  const cancelBtn = document.getElementById('keyword-draft-cancel');

  const choices = getWeightedKeywordChoices(card, 3);
  if (choices.length === 0) {
    spawnKeywordPopup('No keywords available!', 30);
    onComplete();
    return;
  }

  header.textContent = '🔑 Choose a Keyword';
  cardInfo.innerHTML = `Enchanting: <strong style="color:${SUIT_COLORS[card.suit]}">${RANK_NAMES[card.rank]}${SUIT_SYMBOLS[card.suit]}</strong> ${card.name}`;
  choicesEl.innerHTML = '';

  const lead = getLeadArchetype();

  choices.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'keyword-draft-option' + (ch.isArchetype ? ' archetype-weighted' : '');
    const desc = KEYWORD_DESCRIPTIONS[ch.keyword] || '';
    el.innerHTML = `
      <div class="kd-name">${ch.keyword}</div>
      <div class="kd-desc">${desc}</div>
      ${ch.isArchetype && lead ? '<div class="kd-archetype-badge">✦ ' + ARCHETYPE_DATA[lead.key].name + ' synergy</div>' : ''}
    `;
    el.addEventListener('click', () => {
      card.keywords.push(ch.keyword);
      card.name = '✦ ' + card.name.replace(/^✦ /, '');
      spawnKeywordPopup(`Enchanted: ${ch.keyword}!`, 40);
      // TIER2-11: Track keyword take rates
      if (META.analytics?.keywordTakeRates) {
        META.analytics.keywordTakeRates[ch.keyword] = (META.analytics.keywordTakeRates[ch.keyword] || 0) + 1;
      }
      overlay.classList.remove('active');
      onComplete();
    });
    choicesEl.appendChild(el);
  });

  cancelBtn.onclick = () => {
    overlay.classList.remove('active');
    showRest(); // Go back to rest choices
  };

  overlay.classList.add('active');
}

// TIER2v3-6: Keyword draft for reward screen cards
function showRewardKeywordDraft(card, el, onComplete) {
  const choices = getWeightedKeywordChoices(card, 2);
  if (choices.length === 0) {
    onComplete(card);
    return;
  }
  // Show inline keyword choice on the reward card
  el.innerHTML = '';
  const header = document.createElement('div');
  header.style.cssText = 'font-family:Cinzel,serif;font-size:12px;color:var(--gold);margin-bottom:8px;';
  header.textContent = 'Choose keyword for ' + RANK_NAMES[card.rank] + SUIT_SYMBOLS[card.suit];
  el.appendChild(header);

  choices.forEach(ch => {
    const opt = document.createElement('div');
    opt.className = 'keyword-draft-option';
    opt.style.cssText = 'padding:8px 12px;margin-bottom:4px;';
    const desc = KEYWORD_DESCRIPTIONS[ch.keyword] || '';
    opt.innerHTML = `<div class="kd-name" style="font-size:13px">${ch.keyword}</div><div class="kd-desc">${desc}</div>`;
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!card.keywords.includes(ch.keyword)) {
        if (card.keywords.length === 0) card.keywords = [ch.keyword];
        else card.keywords[0] = ch.keyword;
      }
      onComplete(card);
    });
    el.appendChild(opt);
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
    { label: `Uncommon Card (${Math.floor(60*priceScale)} Ink)`, desc: 'Random uncommon card', fn: () => { const c=Math.floor(60*priceScale); if(G.ink>=c){G.ink-=c;G.deck.push(makeCard(randomSuit(),Math.floor(Math.random()*8)+5,'uncommon'));showShop();}else{showShop();} }},
    { label: `Rare Card (${Math.floor(120*priceScale)} Ink)`, desc: 'Rare card rank 10+', fn: () => { const c=Math.floor(120*priceScale); if(G.ink>=c){G.ink-=c;G.deck.push(makeCard(randomSuit(),Math.floor(Math.random()*5)+10,'rare'));showShop();}else{showShop();} }},
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
  const suit = randomSuit();
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

// ===== FORGE =====
// TIER2v4-5: Forge Visual Upgrade — ember particles and upgrade spectacle
let _forgeParticleInterval = null;

function startForgeParticles() {
  stopForgeParticles();
  const screen = document.getElementById('forge-screen');
  if (!screen) return;
  
  // Remove old particle container
  let container = screen.querySelector('.forge-particles');
  if (!container) {
    container = document.createElement('div');
    container.className = 'forge-particles';
    screen.insertBefore(container, screen.firstChild);
  }
  container.innerHTML = '';
  
  _forgeParticleInterval = setInterval(() => {
    if (!screen.classList.contains('active')) { stopForgeParticles(); return; }
    const particle = document.createElement('div');
    particle.className = 'forge-ember-particle';
    particle.style.left = (Math.random() * 100) + '%';
    particle.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    particle.style.opacity = (0.3 + Math.random() * 0.7).toFixed(2);
    const size = 3 + Math.floor(Math.random() * 5);
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    container.appendChild(particle);
    setTimeout(() => particle.remove(), 3500);
  }, 200);
}

function stopForgeParticles() {
  if (_forgeParticleInterval) { clearInterval(_forgeParticleInterval); _forgeParticleInterval = null; }
}

function playForgeUpgradeEffect(btnEl, type) {
  // Create a burst of ember particles converging on the button
  const rect = btnEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  
  // Flash overlay on the forge screen
  const flash = document.createElement('div');
  flash.className = 'forge-upgrade-flash forge-flash-' + type;
  document.getElementById('forge-screen').appendChild(flash);
  setTimeout(() => flash.remove(), 800);
  
  // Burst particles toward the button
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'forge-burst-particle';
    const angle = (Math.PI * 2 * i) / 12;
    const dist = 60 + Math.random() * 40;
    p.style.left = (cx + Math.cos(angle) * dist) + 'px';
    p.style.top = (cy + Math.sin(angle) * dist) + 'px';
    p.style.setProperty('--target-x', cx + 'px');
    p.style.setProperty('--target-y', cy + 'px');
    p.style.animationDelay = (i * 30) + 'ms';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
  
  // Button glow pulse
  btnEl.classList.add('forge-btn-upgrading');
  setTimeout(() => btnEl.classList.remove('forge-btn-upgrading'), 800);
}
function showForge() {
  showScreen('forge-screen');
  // TIER2v4-7: Contextual tip on first Forge visit
  showContextualTip('forge_intro', CONTEXTUAL_TIPS.forge_intro);
  // TIER2v4-5: Start ember particle effect on forge background
  startForgeParticles();
  document.getElementById('forge-embers').textContent = `Embers: ${G.embers}`;
  const container = document.getElementById('forge-mods');
  container.innerHTML = '';

  // REC8-v7: First-visit comparison panel — show on first ever forge visit
  if (!META.tooltipsSeen?.forge_comparison) {
    META.tooltipsSeen = META.tooltipsSeen || {};
    META.tooltipsSeen.forge_comparison = true;
    saveMeta(META);

    const compPanel = document.createElement('div');
    compPanel.className = 'forge-comparison-panel';
    compPanel.innerHTML = `
      <div class="forge-compare-card">
        <div class="fcc-icon">🔥</div>
        <div class="fcc-name">Inferno (Power)</div>
        <div class="fcc-desc">Doubles the modifier's value. Raw damage increase.</div>
        <div class="fcc-best-for">Best for: Your strongest suit modifier</div>
      </div>
      <div class="forge-compare-card">
        <div class="fcc-icon">🎨</div>
        <div class="fcc-name">Re-suit (Flexibility)</div>
        <div class="fcc-desc">Changes the modifier's suit. Redirect power where you need it.</div>
        <div class="fcc-best-for">Best for: Too many of one suit</div>
      </div>
      <div class="forge-compare-card">
        <div class="fcc-icon">✨</div>
        <div class="fcc-name">Conditional (Strategy)</div>
        <div class="fcc-desc">Adds a triggered bonus effect. High-risk, high-reward.</div>
        <div class="fcc-best-for">Best for: Crown/streak-focused builds</div>
      </div>
    `;
    container.appendChild(compPanel);
  }

  const flameMods = G.modifiers.filter(m => m.tier === 'flame' && m.persistent);
  if (flameMods.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;font-style:italic">No Flame modifiers to upgrade. Win elite/boss encounters to earn them.</p>';
    return;
  }

  // TIER2-REC7v6: Total modifier contribution summary
  const totalContrib = calculateModifierContribution();
  const summaryEl = document.createElement('div');
  summaryEl.className = 'forge-contribution-summary';
  summaryEl.innerHTML = `<div class="fcs-label">Current Modifier Power</div>
    <span class="fcs-stat">~${totalContrib.totalMult.toFixed(2)}×</span> mult · <span class="fcs-stat">+${totalContrib.totalChips}</span> chips · <span class="fcs-stat">${flameMods.length}</span> Flame mods`;
  container.appendChild(summaryEl);

  // TIER2-REC7v6: Detect lead archetype for synergy hints
  const leadArch = getLeadArchetype();

  flameMods.forEach((mod, i) => {
    const baseCost = Math.floor(12 + mod.value * 15);
    const el = document.createElement('div');
    el.className = 'forge-mod-item';

    // Current modifier display
    const valStr = mod.type === 'mult' ? mod.value.toFixed(2) + '×' : '+' + mod.value;
    const suitIcon = mod.suit ? SUIT_SYMBOLS[mod.suit] : '✦';
    const suitName = mod.suit ? mod.suit.charAt(0).toUpperCase() + mod.suit.slice(1) : 'Universal';

    let html = `<div class="forge-mod-info">
      <div class="forge-mod-name">${suitIcon} ${mod.name}</div>
      <div class="forge-mod-desc">${valStr} ${mod.type} (${suitName})</div>
    </div>`;

    // TIER2-REC7v6: Calculate upgrade values for all three paths
    const boostCost = baseCost;
    const boostedVal = mod.type === 'mult' ? (mod.value * 1.5).toFixed(2) : Math.floor(mod.value * 1.5);
    const boostedStr = mod.type === 'mult' ? boostedVal + '×' : '+' + boostedVal;
    const boostPctGain = '+' + Math.round((1.5 - 1) * 100) + '%';

    const suitCost = Math.floor(baseCost * 0.8);
    const condCost = Math.floor(baseCost * 1.2);

    // TIER2-REC7v6: Calculate contribution change for Inferno boost
    const newContrib = calculateModifierContribution(mod, 'boost');
    const multGain = (newContrib.totalMult - totalContrib.totalMult).toFixed(2);

    // TIER2-REC7v6: Determine recommended path based on archetype + build
    const recommended = getRecommendedForgePath(mod, leadArch);

    // Path A: Boost Value (promote to Inferno with ×1.5 value)
    const boostRecommended = recommended === 'boost';
    html += `<div class="forge-path">
      <button class="forge-upgrade-btn forge-path-a${boostRecommended ? ' recommended' : ''}" ${G.embers < boostCost ? 'disabled' : ''} data-action="boost" data-mod-idx="${G.modifiers.indexOf(mod)}">
        ${boostRecommended ? '<span class="forge-recommended-badge">★ Best</span>' : ''}
        🔥 Inferno (${boostCost}🔥)
        <div class="forge-before-after">${valStr} <span class="fa-arrow">→</span> <span class="fa-new">${boostedStr}</span> <span class="fa-pct">(${boostPctGain})</span></div>
        <div class="forge-before-after"><span class="fa-pct">Total mult: ${totalContrib.totalMult.toFixed(2)}× → ${newContrib.totalMult.toFixed(2)}× (+${multGain}×)</span></div>
        ${boostRecommended && leadArch ? '<div class="forge-synergy-hint">Synergises with ' + leadArch.name + '</div>' : ''}
      </button>`;

    // Path B: Change Modifier Suit
    const resuitRecommended = recommended === 'resuit';
    const resuitSynergyHint = getResuitSynergyHint(mod, leadArch);
    html += `<button class="forge-upgrade-btn forge-path-b${resuitRecommended ? ' recommended' : ''}" ${G.embers < suitCost ? 'disabled' : ''} data-action="resuit" data-mod-idx="${G.modifiers.indexOf(mod)}">
        ${resuitRecommended ? '<span class="forge-recommended-badge">★ Best</span>' : ''}
        🎨 Re-suit (${suitCost}🔥)
        <div class="forge-before-after">${suitIcon} ${suitName} <span class="fa-arrow">→</span> <span class="fa-new">any suit</span></div>
        ${resuitSynergyHint ? '<div class="forge-synergy-hint">' + resuitSynergyHint + '</div>' : ''}
      </button>`;

    // Path C: Add Conditional Effect
    const condEffects = [
      { name: 'Crown Surge', desc: 'Triggers ×2 on Crown row', key: 'crown_double' },
      { name: 'Streak Amp', desc: '+50% at streak ≥3', key: 'streak_amp' },
      { name: 'Combo Fuel', desc: '+0.1× per consecutive win', key: 'combo_fuel' },
      { name: 'Clutch Power', desc: '×2 when HP < 30%', key: 'clutch_power' },
    ];
    // TIER3-13: Use _forgeCondKey stored on modifier for persistent identity.
    if (!mod._forgeCondKey) {
      if (mod._seededCondIdx !== undefined && mod._seededCondIdx !== null) {
        mod._forgeCondKey = condEffects[mod._seededCondIdx % condEffects.length].key;
      } else {
        let hash = 0;
        const seedStr = (mod.id || '') + (mod.name || '') + (mod.suit || '') + (mod.value || '') + i;
        for (let ci = 0; ci < seedStr.length; ci++) {
          hash = ((hash << 5) - hash) + seedStr.charCodeAt(ci);
          hash |= 0;
        }
        const idx = Math.abs(hash) % condEffects.length;
        mod._forgeCondKey = condEffects[idx].key;
      }
    }
    const randomCond = condEffects.find(c => c.key === mod._forgeCondKey) || condEffects[0];
    const condRecommended = recommended === 'condition';
    html += `<button class="forge-upgrade-btn forge-path-c${condRecommended ? ' recommended' : ''}" ${G.embers < condCost ? 'disabled' : ''} data-action="condition" data-mod-idx="${G.modifiers.indexOf(mod)}" data-cond-key="${randomCond.key}">
        ${condRecommended ? '<span class="forge-recommended-badge">★ Best</span>' : ''}
        ✨ ${randomCond.name} (${condCost}🔥)
        <div class="forge-before-after"><span class="fa-new">+ ${randomCond.desc}</span></div>
        ${condRecommended && leadArch ? '<div class="forge-synergy-hint">Great with ' + leadArch.name + '</div>' : ''}
      </button>
    </div>`;

    el.innerHTML = html;

    // Event listeners for each path
    el.querySelectorAll('.forge-upgrade-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.modIdx);
        const action = btn.dataset.action;
        const theMod = G.modifiers[idx];
        if (!theMod) return;

        if (action === 'boost') {
          if (G.embers < boostCost) return;
          G.embers -= boostCost;
          theMod.tier = 'inferno';
          theMod.value = mod.type === 'mult' ? +(theMod.value * 1.5).toFixed(2) : Math.floor(theMod.value * 1.5);
          theMod.name = theMod.name.replace('Flame', 'Inferno');
          AudioEngine.forgeUpgrade();
          META.forgeUpgrades = (META.forgeUpgrades || 0) + 1;
          // TIER2-11: Track forge path usage
          META.analytics.forgePathUsage.boost = (META.analytics.forgePathUsage.boost || 0) + 1;
          saveMeta(META);
          // TIER2v4-5: Forge upgrade spectacle — flash + particles
          playForgeUpgradeEffect(btn, 'inferno');
          spawnKeywordPopup('🔥 FORGED TO INFERNO!', 40);
          setTimeout(() => showForge(), 600);
        }

        else if (action === 'resuit') {
          if (G.embers < suitCost) return;
          // TIER2-11: Track forge path usage
          META.analytics.forgePathUsage.resuit = (META.analytics.forgePathUsage.resuit || 0) + 1;
          // Show suit picker
          showForgeSuitPicker(idx, suitCost);
        }

        else if (action === 'condition') {
          if (G.embers < condCost) return;
          G.embers -= condCost;
          const condKey = btn.dataset.condKey;
          theMod.condition = condKey;
          theMod.name = theMod.name + ' (' + randomCond.name + ')';
          AudioEngine.forgeUpgrade();
          // TIER2-11: Track forge path usage
          META.analytics.forgePathUsage.condition = (META.analytics.forgePathUsage.condition || 0) + 1;
          // TIER2v4-5: Forge condition effect
          playForgeUpgradeEffect(btn, 'condition');
          spawnKeywordPopup(`✨ ${randomCond.name} added!`, 40);
          setTimeout(() => showForge(), 600);
        }
      });
    });

    container.appendChild(el);
  });
}

// TIER2-REC7v6: Calculate total modifier contribution across all modifiers
function calculateModifierContribution(upgradeMod, upgradeType) {
  let totalMult = 0;
  let totalChips = 0;
  
  G.modifiers.forEach(m => {
    if (!m.persistent && m.tier === 'spark') return; // Skip temporary spark mods
    let val = m.value;
    
    // If we're simulating an upgrade on this modifier
    if (upgradeMod && m === upgradeMod && upgradeType === 'boost') {
      val = m.type === 'mult' ? +(m.value * 1.5).toFixed(2) : Math.floor(m.value * 1.5);
    }
    
    if (m.type === 'mult') totalMult += val;
    else if (m.type === 'chips') totalChips += val;
  });
  
  return { totalMult: Math.max(1, 1 + totalMult), totalChips };
}

// TIER2-REC7v6: Determine which forge path is recommended based on archetype + build
function getRecommendedForgePath(mod, leadArch) {
  if (!leadArch) return 'boost'; // Default to raw power if no archetype
  
  const archKey = leadArch.key;
  
  // Pyre Master: Benefits from high multipliers → Inferno boost
  if (archKey === 'pyre_master') return 'boost';
  
  // Crown Sovereign: Benefits from Crown conditions → condition if crown_double
  if (archKey === 'crown_sovereign') {
    if (mod._forgeCondKey === 'crown_double') return 'condition';
    return 'boost';
  }
  
  // Heart Engine: Benefits from chip modifiers → boost for chips, resuit to hearts
  if (archKey === 'heart_engine') {
    if (mod.suit !== 'hearts' && mod.type === 'mult') return 'resuit';
    return 'boost';
  }
  
  // Void Walker: Benefits from variety → condition for combo mechanics
  if (archKey === 'void_walker') return 'condition';
  
  // Star Weaver: Benefits from universal → resuit to stars if not already
  if (archKey === 'star_weaver') {
    if (mod.suit && mod.suit !== 'stars') return 'resuit';
    return 'boost';
  }
  
  // Iron Wall: Benefits from shield synergy → condition for clutch_power or streak_amp
  if (archKey === 'iron_wall') {
    if (mod._forgeCondKey === 'clutch_power' || mod._forgeCondKey === 'streak_amp') return 'condition';
    return 'boost';
  }
  
  return 'boost'; // Default
}

// TIER2-REC7v6: Generate a synergy hint for the re-suit option
function getResuitSynergyHint(mod, leadArch) {
  if (!leadArch) return '';
  const archKey = leadArch.key;
  
  if (archKey === 'heart_engine' && mod.suit !== 'hearts') return 'Tip: Re-suit to Hearts for Heart Engine synergy';
  if (archKey === 'star_weaver' && mod.suit !== 'stars') return 'Tip: Re-suit to Stars for Star Weaver universal bonus';
  if (archKey === 'pyre_master' && mod.suit !== 'hearts' && mod.suit !== 'diamonds') return 'Tip: Hearts/Diamonds fuel Pyre Master';
  return '';
}

function showForgeSuitPicker(modIdx, cost) {
  const container = document.getElementById('forge-mods');
  container.innerHTML = '';

  const mod = G.modifiers[modIdx];
  if (!mod) { showForge(); return; }

  const title = document.createElement('div');
  title.innerHTML = `<div style="text-align:center;color:var(--gold);font-family:'Cinzel',serif;font-size:16px;margin-bottom:12px;">🎨 Choose new suit for: ${mod.name}</div>`;
  container.appendChild(title);

  const suitOptions = [...SUITS, null]; // null = universal
  suitOptions.forEach(suit => {
    const btn = document.createElement('button');
    const label = suit ? SUIT_SYMBOLS[suit] + ' ' + suit.charAt(0).toUpperCase() + suit.slice(1) : '✦ Universal';
    const color = suit ? getComputedSuitColor(suit) : 'var(--gold)';
    btn.className = 'forge-suit-pick-btn';
    btn.innerHTML = `<span style="color:${color};font-size:18px">${label}</span>`;
    btn.style.cssText = `display:block;width:100%;max-width:280px;margin:6px auto;padding:10px 16px;background:var(--bg-card);border:1px solid ${color};border-radius:8px;cursor:pointer;font-family:'Crimson Text',serif;font-size:14px;color:var(--text-primary);transition:all 0.2s;`;
    btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(212,168,67,0.15)'; });
    btn.addEventListener('mouseout', () => { btn.style.background = 'var(--bg-card)'; });
    btn.addEventListener('click', () => {
      G.embers -= cost;
      mod.suit = suit;
      const suitName = suit ? suit.charAt(0).toUpperCase() + suit.slice(1) : 'Universal';
      mod.name = suitName + (mod.tier === 'inferno' ? ' Inferno' : ' Flame');
      AudioEngine.forgeUpgrade();
      spawnKeywordPopup(`🎨 Re-suited to ${suitName}!`, 40);
      showForge();
    });
    container.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-small';
  cancelBtn.style.cssText = 'margin:12px auto;display:block;';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => showForge());
  container.appendChild(cancelBtn);
}

// ===== BURN PILE =====
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

  const scavBtn = document.getElementById('btn-scavenge');
  scavBtn.style.display = (G.burnPile.length > 0 && G.embers >= 3 && G.phase === 'player_choose') ? 'inline-block' : 'none';
  overlay.classList.add('active');
}

function closeBurnPile() { document.getElementById('burn-pile-overlay').classList.remove('active'); }

function scavengeFromBurn() {
  if (G.burnPile.length === 0 || G.embers < 3 || G.hand.length >= 10) return;
  G.embers -= 3;
  G.burnPile.sort((a,b) => (b.rank||0) - (a.rank||0));
  const card = G.burnPile.shift();
  if (card) {
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
  // TIER1-REC1: Clear saved run state — run is over
  clearRunState();

  // TIER1-REC2v4: Restore original Math.random if daily challenge
  if (_dailyChallenge.active) {
    restoreRandom();
    // Hide daily indicator
    const indicator = document.getElementById('daily-run-indicator');
    if (indicator) indicator.classList.remove('visible');
  }

  showScreen('gameover-screen');
  AudioEngine.stopMusic();
  if (victory) AudioEngine.encounterVictory();
  else AudioEngine.encounterDefeat();
  const titleEl = document.getElementById('gameover-title');
  titleEl.textContent = victory ? 'Victory!' : 'Defeat';
  titleEl.className = 'gameover-title ' + (victory ? 'victory' : 'defeat');

  META.totalDamageAllTime += G.totalDamage;
  if (victory) {
    META.totalVictories++;
    META.classWins[G.playerClass] = (META.classWins[G.playerClass] || 0) + 1;
    // TIER1-REC4v4: Track victory streak
    META.victoryStreak = (META.victoryStreak || 0) + 1;
    if (G.ascension >= META.unlockedAscension && META.unlockedAscension < 20) {
      META.unlockedAscension = Math.min(20, G.ascension + 1);
    }
    if (G.ascension > META.highestAscension) META.highestAscension = G.ascension;
  } else {
    META.totalLosses = (META.totalLosses || 0) + 1;
    META.victoryStreak = 0; // Reset streak on loss
  }

  // Track archetype max levels at end of run
  if (G.archetypeProgress) {
    Object.entries(G.archetypeProgress).forEach(([key, val]) => {
      if (!META.archetypeMaxLevels[key] || val > META.archetypeMaxLevels[key]) {
        META.archetypeMaxLevels[key] = val;
      }
    });
  }

  // Run end-of-run progression checks
  runProgressionChecks(victory ? 'run_end_victory' : 'run_end_defeat');

  // TIER2-11: Analytics tracking at run end
  const a = META.analytics;
  const lead = getLeadArchetype(); // Moved here — was referenced before declaration
  // Class pick rates
  a.classPickRates[G.playerClass] = (a.classPickRates[G.playerClass] || 0) + 1;
  // Run length
  a.avgRunLength.total += G.encountersWon;
  a.avgRunLength.count++;
  // Archetype selections
  if (lead) {
    a.archetypeSelections[lead.key] = (a.archetypeSelections[lead.key] || 0) + 1;
  }
  // Death cause (on defeat)
  if (!victory && G.enemy) {
    a.deathCauses[G.enemy.name] = (a.deathCauses[G.enemy.name] || 0) + 1;
  }
  // Keyword take rates (from deck)
  G.deck.forEach(c => {
    c.keywords.forEach(kw => {
      a.keywordTakeRates[kw] = (a.keywordTakeRates[kw] || 0) + 1;
    });
  });

  // Advance progressive onboarding stage
  advanceOnboarding();

  saveMeta(META);

  const score = G.totalDamage + (G.tricksWon * 10) + (G.modifiers.length * 50) + (G.hp * 20) + (G.relics.length * 100) + (G.resilience * 5) + (G.embers * 3);

  // TIER1-REC2v4: Save daily challenge score
  if (G._isDailyChallenge) {
    saveDailyScore(G._dailyDateStr, score, G.bestTrickThisRun);
    _dailyChallenge.active = false;
  }

  // TIER2v3-10: Procedural run narrative
  const narrativeEl = document.getElementById('gameover-narrative');
  if (narrativeEl) {
    narrativeEl.textContent = generateRunNarrative(victory);
  }
  
  // Build unlock notification for game over screen
  const newUnlockCount = META.unlockedIds.length;
  const achvCount = META.achievementIds.length;

  // Onboarding stage-up messaging
  const stageUpMsgs = {
    2: '🆕 Next run: Clubs ♣ & Spades ♠ + Heart & Shield rows!',
    3: '🆕 Next run: Keywords on cards unlocked!',
    4: '🆕 Next run: Stars ⭐ suit + Keyword Synergies!',
  };
  const stageUpMsg = stageUpMsgs[META.onboardingStage] || '';

  // TIER1-REC3v4: Generate share score card data
  const classIcons = { ember: '🔥', chrome: '⚙️', stellar: '⭐' };
  const classIcon = classIcons[G.playerClass] || '🃏';
  const archName = lead ? lead.icon + ' ' + lead.name : 'Explorer';
  const dailyTag = G._isDailyChallenge ? ' Daily #' + G._dailyNumber + ' ·' : '';
  const shareText = [
    'TEE' + dailyTag + ' ' + classIcon + ' ' + archName + ' · Asc ' + G.ascension,
    '━━━━━━━━━━━━',
    '🎯 Score: ' + score.toLocaleString(),
    '⚡ Best Trick: ' + G.bestTrickThisRun,
    '⚔️ Encounters: ' + G.encountersWon + ' · Act ' + G.act,
    '🃏 Tricks: ' + G.tricksWon + 'W/' + G.tricksLost + 'L',
    (victory ? '👑 VICTORY' : '💀 Defeated' + (G.enemy ? ' by ' + G.enemy.name : '')),
    '━━━━━━━━━━━━',
    'Trick Escalation Engine',
  ].join('\n');
  
  document.getElementById('gameover-stats').innerHTML = `
    Total Damage: ${G.totalDamage}<br>
    Tricks Won: ${G.tricksWon} | Lost: ${G.tricksLost}<br>
    Best Trick: ${G.bestTrickThisRun}${G.bestTrickThisRun >= (META.bestTrickScore||0) ? ' ⭐' : ''}<br>
    Encounters: ${G.encountersWon} | Act: ${G.act}<br>
    ${lead ? 'Archetype: ' + lead.icon + ' ' + lead.name + ' (Lv.' + lead.progress + ')<br>' : ''}
    Ascension: ${G.ascension}<br>
    Modifiers: ${G.modifiers.length} | Relics: ${G.relics.map(r => r.icon).join(' ') || 'None'}<br>
    Embers: ${G.embers} | Resilience: ${G.resilience}<br>
    ${G._isDailyChallenge ? '<br><span style="color:var(--gold)">☀ Daily Challenge #' + G._dailyNumber + ' · Score: ' + score.toLocaleString() + '</span>' : ''}
    ${victory && META.unlockedAscension > G.ascension ? '<br><span style="color:var(--ember)">🔥 Ascension ' + META.unlockedAscension + ' Unlocked!</span>' : ''}
    ${stageUpMsg ? '<br><span class="stage-up-msg">' + stageUpMsg + '</span>' : ''}
    <br><span class="gameover-collection-line">🏆 ${achvCount} Achievements | 🔓 ${newUnlockCount} Unlocks | 📖 ${META.codex.length} Cards | 🎯 ${(META.combosDiscovered||[]).length} Combos | 🔍 ${META.bestiary.length} Relics</span>
    <br><span style="color:var(--gold);font-family:'Cinzel',serif;font-size:20px;">Final Score: ${score.toLocaleString()}</span>
  `;

  // TIER3-REC9: Run Insights — actionable learning tips
  const insights = generateRunInsights(victory);
  if (insights.length > 0) {
    let insightsHtml = '<div class="run-insights"><div class="run-insights-header">💡 Run Insights</div>';
    insights.forEach(insight => {
      insightsHtml += `<div class="run-insight-item run-insight-${insight.type}">
        <span class="insight-icon">${insight.icon}</span>
        <span class="insight-text">${insight.text}</span>
      </div>`;
    });
    insightsHtml += '</div>';
    document.getElementById('gameover-stats').innerHTML += insightsHtml;
  }

  // TIER1-REC3v4: Render share button
  const buttonsEl = document.getElementById('gameover-buttons');
  // Remove old share button if exists
  const oldShare = document.getElementById('share-score-btn');
  if (oldShare) oldShare.remove();

  const shareBtn = document.createElement('button');
  shareBtn.id = 'share-score-btn';
  shareBtn.className = 'share-score-btn';
  shareBtn.innerHTML = '📋 Copy Score Card';
  shareBtn.onclick = function() {
    navigator.clipboard.writeText(shareText).then(() => {
      shareBtn.innerHTML = '✅ Copied!';
      shareBtn.classList.add('copied');
      setTimeout(() => {
        shareBtn.innerHTML = '📋 Copy Score Card';
        shareBtn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = shareText;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); shareBtn.innerHTML = '✅ Copied!'; shareBtn.classList.add('copied'); } catch(e) {}
      document.body.removeChild(ta);
      setTimeout(() => { shareBtn.innerHTML = '📋 Copy Score Card'; shareBtn.classList.remove('copied'); }, 2000);
    });
  };
  buttonsEl.insertBefore(shareBtn, buttonsEl.firstChild.nextSibling);

  // TIER1-REC4v4: Post-Victory Hook — show next challenge
  const oldVictoryHook = document.getElementById('victory-next-challenge');
  if (oldVictoryHook) oldVictoryHook.remove();

  if (victory) {
    const nextAsc = Math.min(G.ascension + 1, 20);
    const nextAscData = ASCENSION_DATA ? ASCENSION_DATA.find(a => a.level === nextAsc) : null;
    const streak = META.victoryStreak || 1;

    // Find a class-specific achievement tease
    const classAchvTease = getClassAchievementTease(G.playerClass);

    const hookEl = document.createElement('div');
    hookEl.id = 'victory-next-challenge';
    hookEl.className = 'victory-next-challenge';
    hookEl.innerHTML = `
      ${streak > 1 ? '<div class="victory-streak">🔥 Victory Streak: <span class="streak-num">' + streak + '</span></div>' : ''}
      <div class="victory-next-label">Next Challenge</div>
      <div class="victory-next-asc">🔥 Ascension ${nextAsc}</div>
      <div class="victory-next-desc">${nextAscData ? nextAscData.desc : 'The ultimate challenge awaits.'}</div>
      ${nextAsc <= META.unlockedAscension ? '<button class="btn-next-ascension" onclick="startNextAscension(' + nextAsc + ')">Begin Ascension ' + nextAsc + '</button>' : '<div style="font-size:11px;color:var(--text-dim);">Already at highest unlocked Ascension.</div>'}
      ${classAchvTease ? '<div class="victory-class-tease">' + classAchvTease + '</div>' : ''}
    `;

    buttonsEl.parentElement.insertBefore(hookEl, buttonsEl);
  }
}

// TIER1-REC4v4: Quick-start next ascension level from victory screen
function startNextAscension(level) {
  AudioEngine.init();
  AudioEngine.uiClick();
  clearRunState();
  // Set the ascension select to the desired level
  const ascSelect = document.getElementById('ascension-select');
  if (ascSelect) ascSelect.value = level;
  // Use same class
  initState(G.playerClass);
  G.ascension = level;
  META.totalRuns++;
  saveMeta(META);
  generateMap();
  showMap();
  setTimeout(() => showActTransitionFlavour(1), 400);
}

// TIER1-REC4v4: Get a class-specific achievement tease for victory screen
function getClassAchievementTease(playerClass) {
  const classWins = META.classWins[playerClass] || 0;
  if (classWins < 3) return '🎯 Win ' + (3 - classWins) + ' more with this class to unlock a special achievement!';
  if (classWins < 5) return '🎯 ' + classWins + '/5 wins with this class — keep going for mastery!';
  if (classWins < 10) return '💪 ' + classWins + ' wins — can you reach 10 for legendary status?';
  return null;
}

// ===== BATTLE UI =====
function updateBattleUI() {
  document.getElementById('battle-hp').textContent = G.hp + (G.shield > 0 ? ' (🛡' + G.shield + ')' : '');
  
  // TIER1-REC1v6: Sacrifice charge dots below HP — Layer 2 compact indicator
  let sacDotsEl = document.getElementById('sacrifice-dots');
  if (!sacDotsEl) {
    sacDotsEl = document.createElement('div');
    sacDotsEl.id = 'sacrifice-dots';
    sacDotsEl.className = 'sacrifice-dots';
    document.getElementById('battle-hp').closest('.stat-badge')?.appendChild(sacDotsEl);
  }
  if (G.sacrificeCharge > 0) {
    sacDotsEl.style.display = 'flex';
    sacDotsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'sac-dot' + (i < G.sacrificeCharge ? ' filled' : '') + (G.sacrificeCharge >= 3 ? ' ready' : '');
      sacDotsEl.appendChild(dot);
    }
  } else {
    sacDotsEl.style.display = 'none';
  }
  document.getElementById('battle-ink').textContent = G.ink;
  document.getElementById('battle-embers').textContent = G.embers;
  document.getElementById('battle-round').textContent = G.roundNum;
  document.getElementById('battle-act').textContent = G.act;

  // TIER1-3: Show encounter format info in trick counter
  let trickText = G.trickNum + '/' + G.tricksPerRound;
  if (G.encounterFormat === 'gauntlet') trickText = `Wave ${G.gauntletWave}/${G.gauntletMaxWaves}`;
  else if (G.encounterFormat === 'puzzle') trickText = `${G.puzzleTricksWon}/${G.puzzleTargetWins} wins (${G.puzzleTricksDone}/4)`;
  else if (G.encounterFormat === 'bid') trickText = `Bid Lv${G.bidLevel} (${G.trickNum}/${G.tricksPerRound})`;
  document.getElementById('battle-trick').textContent = trickText;

  // TIER1-4: Smart counter hiding — only show counters when relevant
  const emberBadge = document.getElementById('battle-embers')?.closest('.stat-badge');
  const resBadge = document.getElementById('battle-resilience')?.closest('.stat-badge');
  const inkBadge = document.getElementById('battle-ink')?.closest('.stat-badge');
  if (emberBadge) emberBadge.style.display = G.embers > 0 ? '' : 'none';
  if (resBadge) resBadge.style.display = G.resilience > 0 ? '' : 'none';
  // Ink always visible (important resource)

  document.getElementById('battle-resilience').textContent = G.resilience;
  const resBtn = document.getElementById('btn-resilience');
  resBtn.style.display = G.resilience >= 3 ? 'inline-block' : 'none';

  document.getElementById('round-score').textContent = G.roundScore;

  const trumpBadge = document.getElementById('trump-badge');
  if (G.trumpSuit) {
    trumpBadge.style.display = 'flex';
    document.getElementById('battle-trump').innerHTML = `<span style="color:${getComputedSuitColor(G.trumpSuit)}">${SUIT_SYMBOLS[G.trumpSuit]}</span>`;
  } else trumpBadge.style.display = 'none';

  renderRelicBar('battle-relics');

  if (G.enemy) {
    document.getElementById('enemy-name').textContent = G.enemy.name;
    // TIER1-REC1v6: Tap enemy name to toggle encounter rule banner (Layer 3 recall)
    const nameEl = document.getElementById('enemy-name');
    if (!nameEl._ruleToggleBound) {
      nameEl._ruleToggleBound = true;
      nameEl.style.cursor = 'pointer';
      nameEl.addEventListener('click', () => {
        const rb = document.getElementById('encounter-rule-banner');
        if (rb && getActiveEncounterRule()) {
          rb.classList.toggle('rule-dismissed');
          if (!rb.classList.contains('rule-dismissed')) {
            clearTimeout(rb._autoDismiss);
            rb._autoDismiss = setTimeout(() => rb.classList.add('rule-dismissed'), 5000);
          }
        }
      });
    }

    // TIER1-REC4v3: Show enemy passive identity (learnable identity)
    let passiveEl = document.getElementById('enemy-passive-id');
    if (!passiveEl) {
      passiveEl = document.createElement('div');
      passiveEl.id = 'enemy-passive-id';
      passiveEl.className = 'enemy-passive-identity';
      document.getElementById('enemy-name').after(passiveEl);
    }
    if (G.enemy.passive && G.enemy.tier === 'standard') {
      passiveEl.textContent = G.enemy.passive;
      passiveEl.style.display = 'block';
    } else {
      passiveEl.style.display = 'none';
    }

    // TIER1-3: Show encounter format banner
    const formatBanner = document.getElementById('encounter-format-banner');
    if (formatBanner) {
      if (G.encounterFormat === 'gauntlet') {
        formatBanner.style.display = 'block';
        formatBanner.className = 'encounter-format-banner gauntlet';
        const isFinal = G.gauntletWave === G.gauntletMaxWaves;
        const tempMods = G.modifiers.filter(m => m._gauntletTemp).length;
        const modText = tempMods > 0 ? ` · +${(tempMods * 0.1).toFixed(1)}× from kills` : '';
        formatBanner.textContent = `🏟️ GAUNTLET — ${isFinal ? '🔥 CHAMPION' : 'Wave ' + G.gauntletWave + '/' + G.gauntletMaxWaves}${modText}`;
      } else if (G.encounterFormat === 'puzzle') {
        formatBanner.style.display = 'block';
        formatBanner.className = 'encounter-format-banner puzzle';
        formatBanner.textContent = `🧩 PUZZLE — Win exactly ${G.puzzleTargetWins} of 4 tricks (${G.puzzleTricksWon} won)`;
      } else if (G.encounterFormat === 'bid') {
        formatBanner.style.display = 'block';
        formatBanner.className = 'encounter-format-banner bid';
        formatBanner.textContent = `🎲 BID Lv${G.bidLevel || '?'} — ${['','Cautious','Standard','Bold','Reckless'][G.bidLevel || 0]} Wager`;
      } else {
        formatBanner.style.display = 'none';
      }

      // TIER1-REC4: Show encounter identity rule banner
      const ruleBanner = document.getElementById('encounter-rule-banner');
      const rule = getActiveEncounterRule();
      if (ruleBanner && rule) {
        ruleBanner.style.display = 'block';
        let ruleHtml = `<span class="rule-icon">${rule.icon}</span> <span class="rule-name">${rule.name}</span>: <span class="rule-desc">${rule.desc}</span>`;

        // TIER1-REC2v3: Enhanced visual feedback per rule type
        // Prismatic Drake — pulsing required suit indicator
        if (rule.getRequiredSuit) {
          const reqSuit = rule.getRequiredSuit();
          if (reqSuit) {
            ruleHtml += ` <span class="rule-suit-pulse" style="color:${getComputedSuitColor(reqSuit)}">${SUIT_SYMBOLS[reqSuit]}</span>`;
          }
        }
        // Ticking Horror — visible countdown clock
        if (rule === ENCOUNTER_RULES.countdown) {
          const rounds = G._countdownRounds || 0;
          const urgency = rounds >= 2 ? 'critical' : rounds >= 1 ? 'warning' : 'safe';
          ruleHtml += ` <span class="rule-clock ${urgency}">⏱️ Rd ${rounds + 1}</span>`;
        }
        // Gravity Well — rank decay indicator
        if (rule === ENCOUNTER_RULES.descending_ranks && G.trickNum > 1) {
          ruleHtml += ` <span class="rule-decay">⬇️ -${G.trickNum - 1} rank</span>`;
        }
        // Rising Ranks — enemy power indicator
        if (rule === ENCOUNTER_RULES.rising_ranks) {
          const elapsed = G._risingRoundsElapsed || 0;
          if (elapsed > 0) ruleHtml += ` <span class="rule-rising">🌊 +${elapsed} enemy rank</span>`;
        }
        // Crown Guard — rank gate reminder
        if (rule === ENCOUNTER_RULES.high_card_only) {
          ruleHtml += ` <span class="rule-gate">👑 8+</span>`;
        }

        // Show shieldbreaker/chip doubler status
        if (G.heartChipDoubler) ruleHtml = '❤️🔥 CHIP DOUBLER ACTIVE · ' + ruleHtml;
        if (G.shieldBreakerReady) ruleHtml = '🛡️⚔️ SHIELDBREAKER READY · ' + ruleHtml;
        // TIER1-REC5v3: Betrayal disruption indicator
        if (G._betrayalDmgBoost > 0) ruleHtml += ` <span class="rule-betrayal">🗡️ Betrayal: ×1.5 dmg (${G._betrayalDmgBoost} left)</span>`;
        ruleBanner.innerHTML = ruleHtml;
        ruleBanner.style.borderColor = rule.color;
        ruleBanner.style.color = rule.color;
        // TIER1-REC2v3: Add rule-specific class for targeted animations
        ruleBanner.className = 'encounter-rule-banner rule-active';
        if (rule === ENCOUNTER_RULES.countdown && (G._countdownRounds || 0) >= 2) ruleBanner.classList.add('rule-urgent');
        if (rule === ENCOUNTER_RULES.descending_ranks) ruleBanner.classList.add('rule-gravity');
        if (rule === ENCOUNTER_RULES.suit_rotation) ruleBanner.classList.add('rule-prismatic');
        // TIER1-REC1v6: Auto-dismiss encounter rule banner after 5s (Layer 3)
        // Only auto-dismiss if not urgent and not recently shown
        if (!ruleBanner._initialShown) {
          ruleBanner._initialShown = true;
          clearTimeout(ruleBanner._autoDismiss);
          ruleBanner._autoDismiss = setTimeout(() => {
            ruleBanner.classList.add('rule-dismissed');
          }, 5000);
        }
      } else if (ruleBanner) {
        // Still show row power banners even without encounter rules
        if (G.heartChipDoubler || G.shieldBreakerReady || G._betrayalDmgBoost > 0) {
          ruleBanner.style.display = 'block';
          let powerText = '';
          if (G.heartChipDoubler) powerText += '❤️🔥 CHIP DOUBLER ACTIVE';
          if (G.shieldBreakerReady) powerText += (powerText ? ' · ' : '') + '🛡️⚔️ SHIELDBREAKER READY';
          if (G._betrayalDmgBoost > 0) powerText += (powerText ? ' · ' : '') + '🗡️ Betrayal: ×1.5 dmg (' + G._betrayalDmgBoost + ' left)';
          ruleBanner.innerHTML = powerText;
          ruleBanner.style.borderColor = G.heartChipDoubler ? '#e63946' : G._betrayalDmgBoost > 0 ? '#ff6b6b' : '#55aa88';
          ruleBanner.style.color = G.heartChipDoubler ? '#e63946' : G._betrayalDmgBoost > 0 ? '#ff6b6b' : '#55aa88';
        } else {
          ruleBanner.style.display = 'none';
        }
      }
    }

    const phaseEl = document.getElementById('enemy-phase');
    if (G.enemy.phases) {
      const phase = getCurrentPhase();
      // TIER2v4-8: Highlight structural phases with distinct styling
      if (phase && phase.structural) {
        phaseEl.innerHTML = `<span style="color:#ff6666;text-shadow:0 0 8px rgba(255,102,102,0.3)">⚠️ Phase: ${phase.name} — ${phase.desc}</span>`;
        // Show siege lock progress if applicable
        if (phase.effect === 'siege_lock') {
          const siegeWins = G._siegeConsecutiveWins || 0;
          phaseEl.innerHTML += `<div class="siege-lock-indicator">⚔️ SIEGE: ${siegeWins}/2 consecutive wins</div>`;
        }
      } else {
        phaseEl.textContent = phase ? `Phase: ${phase.name} — ${phase.desc}` : '';
      }
      const markers = document.getElementById('enemy-phase-markers');
      markers.innerHTML = '';
      G.enemy.phases.forEach(p => {
        if (p.threshold < 1.0) { const m = document.createElement('div'); m.className = 'phase-marker'; m.style.left = (p.threshold*100)+'%'; markers.appendChild(m); }
      });
    } else phaseEl.textContent = '';

    // TIER2-9: Enhanced enemy intent telegraph with visual icons and damage range
    const intentHtml = renderEnemyIntentDisplay(G.enemy, G.enemy.intent || 'attack');
    document.getElementById('enemy-intent').innerHTML = intentHtml + (G.enemy.passive ? '<div class="enemy-passive-tag">' + G.enemy.passive + '</div>' : '');

    const enemyRowEl = document.getElementById('enemy-row-indicator');
    if (G.enemyRow) {
      const rowColors = { crown: 'var(--crown-row)', heart: 'var(--heart-row)', foundation: 'var(--foundation-row)' };
      const rowNames = { crown: '👑 Crown', heart: '❤️ Heart', foundation: '🛡️ Shield' };
      enemyRowEl.innerHTML = `Target: <span style="color:${rowColors[G.enemyRow]}">${rowNames[G.enemyRow]}</span>`;
    } else if (G.playerLeads && G.phase === 'player_choose') {
      enemyRowEl.innerHTML = '<span style="color:var(--text-dim)">Responding...</span>';
    } else enemyRowEl.innerHTML = '';

    document.getElementById('enemy-hp-fill').style.width = Math.max(0, (G.enemy.hp / G.enemy.maxHp) * 100) + '%';
    document.getElementById('enemy-hp-text').textContent = G.enemy.hp + ' / ' + G.enemy.maxHp + (G.enemy.armor > 0 ? ' [🛡' + G.enemy.armor + ']' : '');
  }

  const ecs = document.getElementById('enemy-card-slot');
  if (G.enemyCard) {
    ecs.className = 'enemy-card-slot has-card';
    ecs.style.borderColor = getComputedSuitColor(G.enemyCard.suit);
    ecs.innerHTML = `<div style="text-align:center"><div style="font-family:'Cinzel',serif;font-size:24px;font-weight:900;color:${SUIT_COLORS[G.enemyCard.suit]}">${RANK_NAMES[G.enemyCard.rank]}</div><div style="font-size:22px">${SUIT_SYMBOLS[G.enemyCard.suit]}</div></div>`;
  } else if (G.playerLeads && G.phase === 'player_choose') {
    ecs.className = 'enemy-card-slot';
    ecs.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--gold);line-height:1.3">⚔️<br>YOUR LEAD<br><span style="font-size:9px;color:var(--text-dim)">Play first!</span></div>';
  } else { ecs.className = 'enemy-card-slot'; ecs.innerHTML = 'Waiting...'; }

  // Lead indicator
  const leadEl = document.getElementById('lead-indicator');
  if (leadEl) {
    if (G.phase === 'player_choose') {
      leadEl.style.display = 'block';
      if (G.playerLeads && !G.enemyCard) {
        leadEl.innerHTML = '<span style="color:var(--gold)">⚔️ You lead this trick</span>';
      } else if (!G.playerLeads) {
        leadEl.innerHTML = '<span style="color:var(--text-dim)">Enemy led</span>';
      } else {
        leadEl.style.display = 'none';
      }
    } else {
      leadEl.style.display = 'none';
    }
  }

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

  // TIER2v3-8: Mobile play button — show when card+row selected on narrow screens
  const mobilePlayBtn = document.getElementById('mobile-play-btn');
  if (mobilePlayBtn) {
    const canPlay = G.selectedCard && G.selectedRow && G.phase === 'player_choose';
    const isNarrow = window.innerWidth <= 480;
    mobilePlayBtn.classList.toggle('visible', canPlay && isNarrow);
  }

  // Render unified preview
  renderPlayPreview();

  ['crown','heart','foundation'].forEach(r => {
    document.getElementById(r + '-streak').textContent = (G.rowStreaks[r] || 0) > 0 ? '×' + G.rowStreaks[r] : '';
    const lane = document.querySelector(`.row-lane.${r}`);
    lane.classList.toggle('clash-target', G.enemyRow === r && G.phase === 'player_choose' && !G.playerLeads);
    lane.classList.toggle('surge-ready', G.rowStreaks[r] === 3 && !G.surgeFired[r]);
    // TIER1-REC5: Visual indicators for active row powers
    lane.classList.toggle('chip-doubler-active', r === 'heart' && G.heartChipDoubler);
    lane.classList.toggle('shieldbreaker-ready', r === 'foundation' && G.shieldBreakerReady);
  });

  renderMatrix();
  renderModifierStrip();
}

// ===== PLAY PREVIEW (now uses resolveTrick) =====
function renderPlayPreview() {
  const panel = document.getElementById('play-preview-panel');
  const rows = ['crown', 'heart', 'foundation'];

  rows.forEach(r => {
    const hint = document.getElementById(r + '-preview-hint');
    if (hint) { hint.innerHTML = ''; hint.className = 'row-preview-hint'; }
  });

  if (G.phase !== 'player_choose' || !G.selectedCard) {
    panel.classList.remove('active', 'win-preview', 'lose-preview', 'nomatch-preview');
    return;
  }

  // Player is leading — no enemy card yet, show card stats and row bonuses
  if (G.playerLeads && !G.enemyCard) {
    if (!G.selectedRow) {
      panel.classList.add('active', 'nomatch-preview');
      panel.classList.remove('win-preview', 'lose-preview');
      panel.innerHTML = `<div style="text-align:center;color:var(--gold);font-size:11px;padding:2px 0;">⚔️ You're leading — select a row to commit</div>`;
      // Show row hints with estimated stats
      rows.forEach(r => {
        const hint = document.getElementById(r + '-preview-hint');
        if (!hint) return;
        const isClash = false; // Can't know clash when enemy hasn't picked
        const streak = (G.rowStreaks[r] || 0) + 1;
        const willSurge = streak >= 4 && !G.surgeFired[r];
        hint.className = 'row-preview-hint hint-win';
        hint.innerHTML = `×${streak}${willSurge ? ' → SURGE!' : ''}`;
      });
      return;
    }

    // Row selected but no enemy card — show what we know
    panel.classList.add('active', 'win-preview');
    panel.classList.remove('lose-preview', 'nomatch-preview');

    const streak = (G.rowStreaks[G.selectedRow] || 0) + 1;
    const willSurge = streak >= 4 && !G.surgeFired[G.selectedRow];
    const suitReward = getSuitRewardPreview(G.selectedCard.suit);
    const rowNames = { crown: '👑 Crown', heart: '❤️ Heart', foundation: '🛡️ Shield' };

    let html = `<div class="preview-header"><div class="preview-outcome win"><span class="outcome-icon">⚔️</span> YOUR LEAD</div></div>`;
    html += `<div class="preview-body">`;
    html += `<div class="preview-row"><span class="pr-label">Card</span><span class="pr-value">${RANK_NAMES[G.selectedCard.rank]} ${SUIT_SYMBOLS[G.selectedCard.suit]}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">Row</span><span class="pr-value">${rowNames[G.selectedRow]}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">Streak</span><span class="pr-value ${willSurge ? 'gold' : ''}">${streak}${willSurge ? ' → SURGE!' : ''}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">Reward</span><span class="pr-value" style="color:${suitReward.color}">${suitReward.icon} ${suitReward.text}</span></div>`;
    html += `</div>`;
    html += `<div class="preview-tags"><span class="preview-tag reward" style="opacity:0.7">Enemy will respond after you play</span></div>`;

    // Show keyword tags
    if (G.selectedCard.keywords.includes('Burn')) html = html.replace('</div>\n', '') + `<span class="preview-tag danger-tag">🔥 Burn: Card consumed for ×3</span></div>`;

    panel.innerHTML = html;

    // Update row hints
    rows.forEach(r => {
      const hint = document.getElementById(r + '-preview-hint');
      if (!hint) return;
      const rStreak = (G.rowStreaks[r] || 0) + 1;
      const rSurge = rStreak >= 4 && !G.surgeFired[r];
      hint.className = r === G.selectedRow ? 'row-preview-hint hint-win' : 'row-preview-hint';
      hint.innerHTML = r === G.selectedRow ? `► ×${rStreak}${rSurge ? ' SURGE!' : ''}` : `×${rStreak}`;
    });
    return;
  }

  if (!G.enemyCard) {
    panel.classList.remove('active', 'win-preview', 'lose-preview', 'nomatch-preview');
    return;
  }

  // When card selected but no row: show per-row hints
  if (!G.selectedRow) {
    panel.classList.remove('active', 'win-preview', 'lose-preview', 'nomatch-preview');
    rows.forEach(r => {
      const hint = document.getElementById(r + '-preview-hint');
      if (!hint) return;
      const outcome = resolveTrick(G.selectedCard, r, G.enemyCard);
      if (outcome.wins) {
        hint.className = 'row-preview-hint hint-win';
        hint.innerHTML = `≈${outcome.scoreResult.total} dmg${outcome.isClash ? ' ⚡' : ''}`;
      } else if (outcome.effectiveMatch) {
        hint.className = 'row-preview-hint hint-lose';
        hint.innerHTML = outcome.incomingDamage.absorbed ? 'Absorb' : `−${outcome.incomingDamage.afterShield} HP`;
      } else {
        hint.className = 'row-preview-hint hint-nomatch';
        hint.innerHTML = outcome.incomingDamage.absorbed ? 'Absorb' : `−${outcome.incomingDamage.afterShield} HP`;
      }
    });
    panel.classList.add('active', 'nomatch-preview');
    panel.classList.remove('win-preview', 'lose-preview');
    panel.innerHTML = `<div style="text-align:center;color:var(--text-dim);font-size:11px;padding:2px 0;">Select a row to see full preview — scores shown on each lane above</div>`;
    return;
  }

  // Full preview
  const outcome = resolveTrick(G.selectedCard, G.selectedRow, G.enemyCard);

  panel.classList.add('active');
  panel.classList.toggle('win-preview', outcome.wins);
  panel.classList.toggle('lose-preview', outcome.effectiveMatch && !outcome.wins);
  panel.classList.toggle('nomatch-preview', !outcome.effectiveMatch && !outcome.wins);

  let html = '';

  if (outcome.wins) {
    const result = outcome.scoreResult;
    let finalDmg = Math.max(1, result.total);
    const armorBlock = Math.min(finalDmg, G.enemy?.armor || 0);
    const actualDmg = finalDmg - armorBlock;
    const streak = (G.rowStreaks[G.selectedRow] || 0) + 1;
    const willSurge = streak >= 4 && !G.surgeFired[G.selectedRow];
    const suitReward = getSuitRewardPreview(G.selectedCard.suit);
    const emberGain = 1 + Math.floor(finalDmg / 20) + (hasRelic('molten_heart') ? 2 : 0);

    html += `<div class="preview-header"><div class="preview-outcome win"><span class="outcome-icon">⚔️</span> WIN TRICK</div><div class="preview-damage">${actualDmg}</div></div>`;
    html += `<div class="preview-body">`;
    html += `<div class="preview-row"><span class="pr-label">Chips</span><span class="pr-value chips">${result.chips}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">× Mult</span><span class="pr-value mult">${result.mult}×</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">= Score</span><span class="pr-value gold">${result.total}</span></div>`;

    const rowNames = { crown: '👑 Crown', heart: '❤️ Heart', foundation: '🛡️ Shield' };
    html += `<div class="preview-row"><span class="pr-label">Row</span><span class="pr-value">${rowNames[G.selectedRow]}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">Streak</span><span class="pr-value ${willSurge ? 'gold' : ''}">${streak}${willSurge ? ' → SURGE!' : ''}</span></div>`;

    if (armorBlock > 0) html += `<div class="preview-row"><span class="pr-label">Armor blocks</span><span class="pr-value danger">−${armorBlock}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">Embers</span><span class="pr-value ember">+${emberGain}</span></div>`;
    html += `<div class="preview-row"><span class="pr-label">Reward</span><span class="pr-value" style="color:${suitReward.color}">${suitReward.icon} ${suitReward.text}</span></div>`;
    html += `</div>`;

    html += `<div class="preview-tags">`;
    if (outcome.isClash) html += `<span class="preview-tag clash">⚡ CLASH: Double reward</span>`;
    if (outcome.isTrump) html += `<span class="preview-tag surge">TRUMP: Suit override</span>`;
    outcome.synergies.forEach(s => { html += `<span class="preview-tag reward">✨ ${s.name}: ${s.desc}</span>`; });
    if (G.selectedCard.keywords.includes('Burn')) html += `<span class="preview-tag danger-tag">🔥 Burn: Card consumed for ×3</span>`;
    if (G.selectedCard.keywords.includes('Gambit')) html += `<span class="preview-tag surge">Gambit: Double score!</span>`;
    if (G.selectedCard.keywords.includes('Inscription')) html += `<span class="preview-tag reward">Inscription: +1♦ to all ${G.selectedCard.suit}</span>`;
    if (G.selectedCard.keywords.includes('Cascade')) html += `<span class="preview-tag reward">Cascade: All row surges</span>`;
    if (G.selectedCard.keywords.includes('Echo')) html += `<span class="preview-tag reward">Echo: Modifier carries</span>`;
    if (G.selectedCard.keywords.includes('Volatile')) html += `<span class="preview-tag danger-tag">Volatile: Card destroyed</span>`;
    if (willSurge) {
      const surgeNames = { crown: '👑 Crown Surge: Next ×2', heart: '❤️ Chip Doubler: All chip mods ×2!', foundation: '🛡️⚔️ Shieldbreaker: Shield→Damage!' };
      html += `<span class="preview-tag surge">${surgeNames[G.selectedRow]}</span>`;
    }
    if (G.enemy && actualDmg >= G.enemy.hp) html += `<span class="preview-tag surge">💀 LETHAL!</span>`;
    // TIER1-2: Sacrifice/Vengeance info
    if (G.sacrificeCharge >= 3) html += `<span class="preview-tag surge">⚡ VENGEANCE ×2.5 active!</span>`;
    if (G.selectedRow === 'crown' && G.crownGambitStored > 0) html += `<span class="preview-tag reward">👑 Crown Gambit: +${G.crownGambitStored} bonus</span>`;
    // TIER1-REC5: Show active row powers
    if (G.heartChipDoubler) html += `<span class="preview-tag surge">❤️🔥 Chip Doubler active</span>`;
    if (G.shieldBreakerReady) html += `<span class="preview-tag surge">🛡️⚔️ Shieldbreaker: +${G.shield} from shield</span>`;
    html += `</div>`;

  } else if (outcome.effectiveMatch) {
    const dmg = outcome.incomingDamage;
    const resGain = 1 + (hasRelic('resilient_heart') ? 1 : 0);
    const foundationShield = G.selectedRow === 'foundation' ? (hasArchetypeMilestone('shield_boost') ? 8 : 3) : 0;

    html += `<div class="preview-header"><div class="preview-outcome lose"><span class="outcome-icon">💔</span> LOSE — Outranked</div>`;
    if (!dmg.absorbed) html += `<div class="preview-damage incoming">−${dmg.afterShield}</div>`;
    else html += `<div class="preview-damage" style="color:var(--clubs)">0</div>`;
    html += `</div><div class="preview-body">`;

    if (!dmg.absorbed) {
      html += `<div class="preview-row"><span class="pr-label">Enemy damage</span><span class="pr-value danger">${dmg.raw}</span></div>`;
      if (dmg.shieldUsed > 0) html += `<div class="preview-row"><span class="pr-label">Shield absorbs</span><span class="pr-value shield">−${dmg.shieldUsed}</span></div>`;
      html += `<div class="preview-row"><span class="pr-label">HP after</span><span class="pr-value ${(G.hp - dmg.afterShield) <= 0 ? 'danger' : ''}">${Math.max(0, G.hp - dmg.afterShield)} / ${G.maxHp}</span></div>`;
    } else {
      html += `<div class="preview-row"><span class="pr-label">${outcome.ghostGambler ? 'Ghost Gambler' : 'Absorb'}</span><span class="pr-value bonus">No damage!</span></div>`;
    }

    html += `<div class="preview-row"><span class="pr-label">Resilience</span><span class="pr-value keyword">+${resGain}</span></div>`;
    if (foundationShield > 0) html += `<div class="preview-row"><span class="pr-label">Foundation</span><span class="pr-value shield">+${foundationShield} shield</span></div>`;
    html += `</div><div class="preview-tags">`;
    // TIER1-2: Show strategic loss benefits
    const nextSac = Math.min(G.sacrificeCharge + 1, 3);
    if (nextSac < 3) html += `<span class="preview-tag tactical">🗡️ Sacrifice: ${nextSac}/3 → Vengeance</span>`;
    else html += `<span class="preview-tag surge">⚡ Sacrifice: VENGEANCE READY after this!</span>`;
    if (G.selectedRow === 'crown') html += `<span class="preview-tag reward">👑 Crown Gambit: Store +${Math.floor((G.enemyCard?.rank || 5) * 1.5)} damage</span>`;
    if (G.selectedRow === 'heart') html += `<span class="preview-tag reward">❤️ Heart Drain: Heal ~3 HP</span>`;
    if (outcome.isClash) html += `<span class="preview-tag danger-tag">⚡ CLASH LOSS: +50% enemy dmg</span>`;
    if (G.selectedCard.keywords.includes('Phantom') || outcome.ghostGambler) html += `<span class="preview-tag reward">Phantom: Card returns to hand</span>`;
    if (G.selectedCard.keywords.includes('Gambit') && !outcome.ghostGambler) html += `<span class="preview-tag danger-tag">Gambit: Double damage!</span>`;
    outcome.synergies.forEach(s => { html += `<span class="preview-tag reward">✨ ${s.name}</span>`; });
    if (!dmg.absorbed && (G.hp - dmg.afterShield) <= 0) html += `<span class="preview-tag danger-tag">☠️ FATAL!</span>`;
    html += `</div>`;

  } else {
    const dmg = outcome.incomingDamage;
    const resGain = 1 + (hasRelic('resilient_heart') ? 1 : 0);
    const foundationShield = G.selectedRow === 'foundation' ? (hasArchetypeMilestone('shield_boost') ? 8 : 3) : 0;

    html += `<div class="preview-header"><div class="preview-outcome nomatch"><span class="outcome-icon">✗</span> OFF-SUIT — Tactical Retreat</div>`;
    if (!dmg.absorbed) html += `<div class="preview-damage incoming">−${dmg.afterShield}</div>`;
    else html += `<div class="preview-damage" style="color:var(--clubs)">0</div>`;
    html += `</div><div class="preview-body single-col">`;

    if (!dmg.absorbed) {
      html += `<div class="preview-row"><span class="pr-label">Enemy damage</span><span class="pr-value danger">${dmg.raw}${dmg.shieldUsed > 0 ? ' (−' + dmg.shieldUsed + ' shield)' : ''}</span></div>`;
      html += `<div class="preview-row"><span class="pr-label">HP after</span><span class="pr-value ${(G.hp - dmg.afterShield) <= 0 ? 'danger' : ''}">${Math.max(0, G.hp - dmg.afterShield)} / ${G.maxHp}</span></div>`;
    } else {
      html += `<div class="preview-row"><span class="pr-label">Absorb</span><span class="pr-value bonus">No damage</span></div>`;
    }
    html += `<div class="preview-row"><span class="pr-label">Resilience</span><span class="pr-value keyword">+${resGain}</span></div>`;
    if (foundationShield > 0) html += `<div class="preview-row"><span class="pr-label">Foundation</span><span class="pr-value shield">+${foundationShield} shield</span></div>`;

    // Feature 2: Off-suit tactical retreat bonuses (ENHANCED by TIER1-2)
    if (G.selectedRow === 'foundation') {
      const extraShieldVal = (hasArchetypeMilestone('shield_boost') ? 8 : 3) * 2;
      html += `<div class="preview-row"><span class="pr-label">Bait Shield</span><span class="pr-value shield">+${extraShieldVal + foundationShield} total (3× bait!)</span></div>`;
    }
    if (G.selectedRow === 'heart' && G.modifiers.length > 0) {
      html += `<div class="preview-row"><span class="pr-label">Retreat Boost</span><span class="pr-value keyword">+0.08× random mod + heal</span></div>`;
    }
    if (G.selectedRow === 'crown') {
      html += `<div class="preview-row"><span class="pr-label">Crown Store</span><span class="pr-value bonus">+${Math.floor((G.enemyCard?.rank || 5))} Crown Gambit</span></div>`;
    }

    html += `</div><div class="preview-tags">`;
    // TIER1-2: Show sacrifice benefit
    const nextSac2 = Math.min(G.sacrificeCharge + 1, 3);
    if (nextSac2 < 3) html += `<span class="preview-tag tactical">🗡️ Sacrifice: ${nextSac2}/3 → Vengeance</span>`;
    else html += `<span class="preview-tag surge">⚡ VENGEANCE READY after this!</span>`;
    html += `<span class="preview-tag tactical">🛡️ Tactical Retreat — off-suit bonus active</span>`;
    if (outcome.isClash) html += `<span class="preview-tag danger-tag">⚡ CLASH: +50% enemy dmg</span>`;
    if (G.selectedCard.keywords.includes('Phantom')) html += `<span class="preview-tag reward">Phantom: Card returns</span>`;
    if (!dmg.absorbed && (G.hp - dmg.afterShield) <= 0) html += `<span class="preview-tag danger-tag">☠️ FATAL!</span>`;
    html += `</div>`;
  }

  panel.innerHTML = html;

  // Also update row hints when row is selected
  rows.forEach(r => {
    const hint = document.getElementById(r + '-preview-hint');
    if (!hint) return;
    const rOutcome = resolveTrick(G.selectedCard, r, G.enemyCard);
    if (rOutcome.wins) {
      hint.className = 'row-preview-hint hint-win';
      hint.innerHTML = r === G.selectedRow ? `► ${rOutcome.scoreResult.total}${rOutcome.isClash ? ' ⚡' : ''}` : `${rOutcome.scoreResult.total}${rOutcome.isClash ? ' ⚡' : ''}`;
    } else if (rOutcome.effectiveMatch) {
      hint.className = 'row-preview-hint hint-lose';
      hint.innerHTML = rOutcome.incomingDamage.absorbed ? 'Absorb' : `−${rOutcome.incomingDamage.afterShield} HP`;
    } else {
      hint.className = 'row-preview-hint hint-nomatch';
      hint.innerHTML = rOutcome.incomingDamage.absorbed ? 'Absorb' : `−${rOutcome.incomingDamage.afterShield} HP`;
    }
  });
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

// ============================================================
// FEATURE 3: MODIFIER STRIP + TIER2-9 BUILD IDENTITY DISPLAY
// ============================================================
let _prevModCount = 0;

function renderModifierStrip() {
  const strip = document.getElementById('modifier-strip');
  if (!strip) return;
  strip.innerHTML = '';

  if (G.modifiers.length === 0) {
    strip.classList.remove('has-mods');
    strip.innerHTML = '<div class="power-level-indicator power-empty" onclick="toggleModStripExpand()"><span class="pl-label">⚡ Power</span><span class="pl-value">—</span></div>';
    return;
  }
  strip.classList.add('has-mods');

  const isNew = G.modifiers.length > _prevModCount;
  _prevModCount = G.modifiers.length;

  // TIER1-4: Calculate Power Level — a single intuitive number
  let totalMult = 1.0;
  let totalChips = 0;
  G.modifiers.forEach(m => {
    if (m.type === 'mult') totalMult += m.value;
    else totalChips += m.value;
  });
  const powerLevel = Math.floor(totalMult * 10 + totalChips);
  const tierLabel = powerLevel >= 100 ? 'INFERNO' : powerLevel >= 50 ? 'FLAME' : powerLevel >= 20 ? 'SPARK' : 'LOW';
  const tierColor = powerLevel >= 100 ? '#b3a4ff' : powerLevel >= 50 ? '#ff7a7a' : powerLevel >= 20 ? '#ffb366' : 'var(--text-dim)';

  // TIER2-9: Build Identity Display
  const lead = getLeadArchetype();
  const buildDiv = document.createElement('div');
  buildDiv.className = 'build-identity' + (G.modStripExpanded ? ' expanded' : '') + (isNew ? ' pl-flash' : '');
  buildDiv.onclick = () => { G.modStripExpanded = !G.modStripExpanded; renderModifierStrip(); };

  // Top row: archetype + power level
  let archHtml = '';
  if (lead) {
    const arch = ARCHETYPE_DATA[lead.key];
    archHtml = `<span class="build-arch" style="color:${arch.color}">${arch.icon} ${arch.name}</span>`;
  }

  // Suit distribution mini-bar
  const suitCounts = {};
  const availSuits = getAvailableAllSuits();
  availSuits.forEach(s => { suitCounts[s] = 0; });
  G.modifiers.forEach(m => {
    if (m.suit && suitCounts[m.suit] !== undefined) suitCounts[m.suit]++;
  });
  const totalSuitMods = Object.values(suitCounts).reduce((a, b) => a + b, 0) || 1;
  let suitBarHtml = '<div class="build-suit-bar">';
  availSuits.forEach(s => {
    const pct = Math.max(2, (suitCounts[s] / totalSuitMods) * 100);
    if (suitCounts[s] > 0) {
      suitBarHtml += `<div class="bsb-seg" style="width:${pct}%;background:${getComputedSuitColor(s)}" title="${SUIT_SYMBOLS[s]} ${suitCounts[s]}"></div>`;
    }
  });
  suitBarHtml += '</div>';

  // Top 3 modifiers by impact value
  const sortedByImpact = [...G.modifiers]
    .filter(m => m.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  let topModsHtml = '';
  if (sortedByImpact.length > 0 && G.modStripExpanded) {
    topModsHtml = '<div class="build-top-mods">';
    sortedByImpact.forEach(m => {
      const valStr = m.type === 'mult' ? m.value.toFixed(2) + '×' : '+' + m.value;
      const suitIcon = m.suit ? SUIT_SYMBOLS[m.suit] : '✦';
      const tierCls = m.tier || 'spark';
      topModsHtml += `<span class="build-mod-chip ${tierCls}">${suitIcon} ${valStr}</span>`;
    });
    topModsHtml += '</div>';
  }

  // TIER2-6: Decision modifier badges
  let decisionHtml = '';
  const decMods = G.modifiers.filter(m => m._decisionId);
  if (decMods.length > 0 && G.modStripExpanded) {
    decisionHtml = '<div class="build-decision-mods">';
    decMods.forEach(m => {
      decisionHtml += `<span class="build-decision-badge" title="${m._decisionDesc || ''}">${m.name}</span>`;
    });
    decisionHtml += '</div>';
  }

  buildDiv.innerHTML = `
    <div class="build-header">
      ${archHtml}
      <span class="build-power" style="color:${tierColor}">⚡ ${tierLabel} ${powerLevel}</span>
      <span class="build-detail">${G.modifiers.length} mods · ${totalMult.toFixed(1)}× · +${totalChips}</span>
      <span class="pl-expand">${G.modStripExpanded ? '▲' : '▼'}</span>
    </div>
    ${suitBarHtml}
    ${topModsHtml}
    ${decisionHtml}
  `;
  strip.appendChild(buildDiv);

  // TIER1-2: Sacrifice charge indicator
  if (G.sacrificeCharge > 0) {
    const sacDiv = document.createElement('div');
    sacDiv.className = 'sacrifice-indicator' + (G.sacrificeCharge >= 3 ? ' ready' : '');
    sacDiv.innerHTML = `🗡️ ${'●'.repeat(G.sacrificeCharge)}${'○'.repeat(3 - G.sacrificeCharge)}${G.sacrificeCharge >= 3 ? ' VENGEANCE!' : ''}`;
    strip.appendChild(sacDiv);
  }

  // Crown Gambit indicator
  if (G.crownGambitStored > 0) {
    const cgDiv = document.createElement('div');
    cgDiv.className = 'crown-gambit-indicator';
    cgDiv.innerHTML = `👑 Gambit: +${G.crownGambitStored}`;
    strip.appendChild(cgDiv);
  }

  // Expanded: show individual modifier pips
  if (G.modStripExpanded) {
    const modsContainer = document.createElement('div');
    modsContainer.className = 'mod-pips-expanded';
    // TIER3-10: Use DocumentFragment for batch DOM insertion
    const modFragment = document.createDocumentFragment();

    const sorted = [...G.modifiers].sort((a, b) => {
      const order = { inferno: 0, flame: 1, spark: 2 };
      return (order[a.tier] || 3) - (order[b.tier] || 3);
    });

    sorted.forEach((m, i) => {
      const globalIdx = G.modifiers.indexOf(m);
      const isDisabled = globalIdx === G.enemy?.disabledModIdx;
      const pip = document.createElement('div');
      pip.className = 'mod-pip ' + (m.tier || 'spark');
      if (isDisabled) pip.classList.add('disabled');
      if (isNew && globalIdx >= G.modifiers.length - 1) pip.classList.add('mod-new');
      if (m._decisionId) pip.classList.add('decision-mod');

      const valStr = m._decisionId ? m._decisionDesc : (m.type === 'mult' ? (typeof m.value === 'number' ? m.value.toFixed(2) : m.value) + '×' : '+' + m.value);
      const suitIcon = m.suit ? (SUIT_SYMBOLS[m.suit] || m.suit[0]) : '✦';
      pip.innerHTML = `${suitIcon} ${m._decisionId ? m.name.slice(2) : valStr}<div class="mod-pip-tooltip">${m.name}: ${valStr} ${m._decisionId ? '' : m.type}${m.suit ? ' (' + m.suit + ')' : ' (all)'}${m.condition ? ' · ' + m.condition : ''}${isDisabled ? ' — DISABLED' : ''}</div>`;
      modFragment.appendChild(pip);
    });

    modsContainer.appendChild(modFragment);
    strip.appendChild(modsContainer);

    // REC5-v7: Modifier Contribution Visualization — highlight active mods when card selected
    if (G.selectedCard) {
      strip.classList.add('card-selected');
      const selSuit = G.selectedCard.suit;
      let activeChips = 0, activeMult = 0;
      modsContainer.querySelectorAll('.mod-pip').forEach((pip, idx) => {
        const m = sorted[idx];
        if (!m) return;
        const isUniversal = m.suit === null || m.suit === 'stars' || hasArchetypeMilestone('all_universal');
        const applies = m.suit === selSuit || isUniversal;
        if (applies) {
          pip.classList.add('mod-active');
          if (m.type === 'chips') activeChips += m.value;
          else if (m.type === 'mult') activeMult += m.value;
        } else {
          pip.classList.add('mod-inactive');
        }
      });
      // Show contribution summary
      const summaryEl = document.createElement('div');
      summaryEl.className = 'mod-contribution-summary';
      summaryEl.innerHTML = `Active for ${SUIT_SYMBOLS[selSuit] || '?'}: <span class="mod-contrib-chips">+${activeChips.toFixed(1)} chips</span> · <span class="mod-contrib-mult">×${(1 + activeMult).toFixed(2)} mult</span>`;
      strip.appendChild(summaryEl);
    } else {
      strip.classList.remove('card-selected');
    }
  }
}

// ===== HAND RENDERING =====
function renderHand() {
  const container = document.getElementById('hand-cards');
  container.innerHTML = '';
  const activeRule = getActiveEncounterRule();
  // TIER3-10: Use DocumentFragment for batch DOM insertion
  const fragment = document.createDocumentFragment();

  // Sort hand by suit then rank descending
  const suitOrder = { spades: 0, hearts: 1, clubs: 2, diamonds: 3, stars: 4 };
  G.hand.sort((a, b) => {
    const suitDiff = (suitOrder[a.suit] ?? 5) - (suitOrder[b.suit] ?? 5);
    if (suitDiff !== 0) return suitDiff;
    return b.rank - a.rank;
  });

  G.hand.forEach(card => {
    const matchesSuit = G.enemyCard && (card.suit === G.enemyCard.suit || card.suit === 'stars');
    const el = document.createElement('div');
    el.className = 'card hand-card ' + card.suit + ' rarity-' + (card.rarity || 'common');
    el.dataset.suit = card.suit; // TIER2-REC5v6: Suit attribute for watermark CSS
    // TIER3-11: Cursed card distinct visual
    if (card._isCursed) el.classList.add('card-cursed');
    // TIER1-REC2v6: Spectacle card glow
    if (card._isSpectacleCard) {
      el.dataset.spectacle = 'true';
      el.classList.add('spectacle-card');
    }
    if (G.selectedCard?.id === card.id) el.classList.add('selected');
    if (G.phase !== 'player_choose') el.classList.add('disabled');
    if (matchesSuit && G.phase === 'player_choose') el.style.boxShadow = '0 0 12px rgba(212,168,67,0.25)';

    // TIER1-REC2v3: Encounter Rule Visual Feedback on cards
    if (activeRule && G.phase === 'player_choose') {
      // Crown Guard: dim cards rank < 8
      if (activeRule === ENCOUNTER_RULES.high_card_only && card.rank < 8) {
        el.classList.add('rule-dimmed');
      }
      // Gravity Well: show rank decay visual
      if (activeRule === ENCOUNTER_RULES.descending_ranks && G.trickNum > 1) {
        el.classList.add('gravity-affected');
      }
      // Page Tear: highlight the torn card
      if (card._pageTorn) {
        el.classList.add('page-torn');
        card._pageTorn = false; // Clear after rendering
      }
      // Prismatic Drake: highlight matching suit, dim non-matching
      if (activeRule === ENCOUNTER_RULES.suit_rotation && activeRule.getRequiredSuit) {
        const reqSuit = activeRule.getRequiredSuit();
        if (reqSuit) {
          if (card.suit === reqSuit || card.suit === 'stars') {
            el.classList.add('prismatic-match');
          } else {
            el.classList.add('prismatic-mismatch');
          }
        }
      }
      // Suit Binder: after 1 suit played, dim same-suit cards
      if (activeRule === ENCOUNTER_RULES.suit_variety && G._encounterSuitsPlayed?.size === 1 && G.trickNum > 1) {
        const playedSuit = [...G._encounterSuitsPlayed][0];
        if (card.suit === playedSuit) el.classList.add('suit-bind-warn');
      }
    }

    // Build keyword display - show all keywords at larger size
    // TIER2v5-8: Keywords more prominent on rare+ cards
    let kwHtml = '';
    if (card.keywords.length > 0) {
      const isHighRarity = card.rarity === 'rare' || card.rarity === 'epic' || card.rarity === 'legendary';
      kwHtml = '<div class="card-keywords' + (isHighRarity ? ' kw-prominent' : '') + '">' + card.keywords.map(kw => `<span class="card-kw-tag" data-kw="${kw}">${kw}</span>`).join('') + '</div>';
    }

    // TIER2v5-8: Rarity corner pip for rare+ cards
    let rarityPip = '';
    if (card.rarity === 'rare') rarityPip = '<div class="rarity-pip rarity-pip-rare">◆</div>';
    else if (card.rarity === 'epic') rarityPip = '<div class="rarity-pip rarity-pip-epic">◆</div>';
    else if (card.rarity === 'legendary') rarityPip = '<div class="rarity-pip rarity-pip-legendary">★</div>';

    // Synergy indicator
    const synergies = getKeywordSynergies(card);
    const synergyDot = synergies.length > 0 ? '<div class="synergy-dot" title="Synergy active!">✨</div>' : '';

    // Suit tooltip text
    const suitTooltips = {
      hearts: '♥ = +mult',
      diamonds: '♦ = +chips',
      clubs: '♣ = direct dmg',
      spades: '♠ = reveal card',
      stars: '⭐ = universal mod',
    };
    const suitTip = suitTooltips[card.suit] || '';

    // TIER1-4: Show estimated damage range instead of raw chips/mult
    let dmgEstimate = '';
    if (G.phase === 'player_choose' && G.enemy) {
      // Calculate approximate damage for this card
      const baseScore = card.baseChips * card.baseMult;
      let totalMult = 1.0;
      G.modifiers.forEach(m => {
        if (m.type === 'mult' && (m.suit === null || m.suit === card.suit)) totalMult += m.value;
      });
      const estLow = Math.floor(baseScore * totalMult * 0.8);
      const estHigh = Math.floor(baseScore * totalMult * 1.5);
      dmgEstimate = `<div class="card-dmg-estimate">~${estLow}-${estHigh} dmg</div>`;
    } else {
      dmgEstimate = `<div class="card-chips">${card.baseChips}♦ ${card.baseMult}×</div>`;
    }

    // TIER2v4-8: Suit reversal indicator for Void Librarian Mirror Realm
    let suitReversalHint = '';
    const effSuit = getBossEffectiveSuit(card.suit);
    if (effSuit !== card.suit) {
      suitReversalHint = `<div class="suit-reversed-indicator">→${SUIT_SYMBOLS[effSuit]}</div>`;
    }

    el.innerHTML = `
      <div class="suit-tooltip">${suitTip}</div>
      <div class="card-rank">${RANK_NAMES[card.rank]}</div>
      <div class="card-suit">${SUIT_SYMBOLS[card.suit]}</div>
      ${suitReversalHint}
      ${dmgEstimate}
      ${kwHtml}
      ${synergyDot}
      ${rarityPip}
      ${matchesSuit && G.phase === 'player_choose' ? '<div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--gold)">match</div>' : ''}
      <div class="swipe-hint">⬆ swipe to play</div>
    `;
    // TIER2-REC5v6: Accessibility — ARIA label for screen readers
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${RANK_NAMES[card.rank]} of ${card.suit}${card.keywords.length ? ', keywords: ' + card.keywords.join(', ') : ''}${matchesSuit ? ', matches enemy suit' : ''}`);
    el.setAttribute('tabindex', '0');

    el.addEventListener('click', () => selectCard(card.id));

    // Mobile touch handling
    let pressTimer = null;
    let touchStartY = 0, touchStartX = 0;
    let longPressTriggered = false, touchStartTime = 0;

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
      if (moveX > 10 || moveY > 10) clearTimeout(pressTimer);
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      clearTimeout(pressTimer);
      if (longPressTriggered) return;

      const touchEndY = e.changedTouches[0].clientY;
      const touchEndX = e.changedTouches[0].clientX;
      const diffY = touchStartY - touchEndY;
      const diffX = Math.abs(touchEndX - touchStartX);
      const elapsed = Date.now() - touchStartTime;

      // TIER3-14: Disable swipe-to-play below 480px — use mobile play button instead
      const isSmallScreen = window.innerWidth <= 480;
      if (!isSmallScreen && diffY > 50 && diffX < 80 && G.selectedCard?.id === card.id && G.selectedRow) {
        e.preventDefault(); playCard();
      } else if (!isSmallScreen && diffY < -50 && diffX < 80) {
        e.preventDefault(); G.selectedCard = null; updateBattleUI();
      } else if (Math.abs(diffY) < 20 && diffX < 20 && elapsed < 400) {
        e.preventDefault(); selectCard(card.id);
      }
    });

    // TIER3-10: Append to fragment for batch DOM insertion
    fragment.appendChild(el);
  });
  container.appendChild(fragment);
}

function showCardInspect(card) {
  const overlay = document.getElementById('card-inspect-overlay');
  const detail = document.getElementById('card-inspect-detail');
  const synergies = getKeywordSynergies(card);
  detail.innerHTML = `
    <div class="inspect-rank" style="color:${SUIT_COLORS[card.suit]}">${RANK_NAMES[card.rank]}</div>
    <div class="inspect-suit">${SUIT_SYMBOLS[card.suit]}</div>
    <div class="inspect-name">${card.name || ''}</div>
    <div class="inspect-stats">${card.baseChips}♦ chips  •  ${card.baseMult}× mult</div>
    <div style="font-size:11px;color:var(--text-dim);margin:4px 0">${card.rarity || 'common'}</div>
    ${card.keywords.length ? '<div class="inspect-keywords">' + card.keywords.map(kw =>
      `<div class="inspect-kw"><span class="inspect-kw-name">${kw}</span><span class="inspect-kw-desc">${KEYWORD_DESCRIPTIONS[kw] || ''}</span></div>`
    ).join('') + '</div>' : '<div style="font-size:11px;color:var(--text-dim)">No keywords</div>'}
    ${synergies.length ? '<div class="inspect-synergies">' + synergies.map(s =>
      `<div class="inspect-synergy">✨ ${s.name}: ${s.desc}</div>`
    ).join('') + '</div>' : ''}
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
  const availableRows = getAvailableRows();
  const encounterRule = getActiveEncounterRule();
  document.querySelectorAll('.row-lane').forEach(el => {
    const row = el.dataset.row;
    const isAvailable = availableRows.includes(row);
    // TIER1-REC4: Check if encounter rule blocks this row
    const isRuleBlocked = enable && isAvailable && encounterRule && encounterRule.isRowBlocked && encounterRule.isRowBlocked(row);
    if (enable && isAvailable && !isRuleBlocked) {
      el.classList.add('selectable');
      el.classList.remove('onboarding-locked', 'rule-blocked');
      el.onclick = () => selectRow(el.dataset.row);
    } else {
      el.classList.remove('selectable', 'selected');
      el.onclick = null;
      if (!isAvailable) {
        el.classList.add('onboarding-locked');
      }
      if (isRuleBlocked) {
        el.classList.add('rule-blocked');
      }
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

// TIER1-REC2: Visual Hierarchy — collapsible detail bar
function toggleTopBarExpand() {
  const bar = document.getElementById('battle-detail-bar');
  const btn = document.getElementById('topbar-toggle');
  bar.classList.toggle('expanded');
  btn.textContent = bar.classList.contains('expanded') ? '▲' : '⋯';
}

// ============================================================
// TIER1-REC1v6: BATTLE SCREEN VISUAL HIERARCHY — Three-Layer Progressive Disclosure
// Layer 1 (Always visible): Enemy card, hand, row selector, play btn, HP, trick counter
// Layer 2 (Collapsed indicators): Modifier power, enemy intent summary, row pips, sacrifice dots
// Layer 3 (On-demand): Relics, encounter rule, revealed cards, burn pile, matrix
// Focus states: hand → resolving → summary (CSS transitions manage layer visibility)
// ============================================================
let _layer2Expanded = false;

function setBattleFocus(state) {
  const screen = document.getElementById('battle-screen');
  if (!screen) return;
  G._battleFocus = state;
  screen.classList.remove('focus-hand', 'focus-resolving', 'focus-summary');
  screen.classList.add('focus-' + state);
  // BUGFIX: Show enemy card slot when enemy has already played during hand phase
  if (state === 'hand' && G.enemyCard) {
    screen.classList.add('enemy-has-played');
  } else {
    screen.classList.remove('enemy-has-played');
  }
  // Layer management: collapse Layer 2 during resolving for focus
  if (state === 'resolving') {
    _layer2Expanded = false;
    screen.classList.remove('layer2-expanded');
  }
}

function toggleLayer2() {
  _layer2Expanded = !_layer2Expanded;
  const screen = document.getElementById('battle-screen');
  if (screen) screen.classList.toggle('layer2-expanded', _layer2Expanded);
}

// ============================================================
// TIER1-REC1v6: RESOLUTION NARRATIVE STRIP
// After each trick, show a plain-language explanation of WHY
// the player won or lost. Uses data from resolveTrick().
// ============================================================
function buildResolutionNarrative(outcome, pCard, eCard, row, finalDmg) {
  const pName = RANK_NAMES[pCard.rank] + SUIT_SYMBOLS[pCard.suit];
  const eName = eCard ? (RANK_NAMES[eCard.rank] + SUIT_SYMBOLS[eCard.suit]) : '?';
  const rowName = row.charAt(0).toUpperCase() + row.slice(1);
  let parts = [];

  if (outcome.wins) {
    // Win narrative — explain WHY the player won
    if (outcome.isTrump) {
      parts.push(`🃏 TRUMP — your ${pName} overrides their ${eName}`);
    } else if (G.playerLeads && !outcome.suitMatches) {
      parts.push(`⚔️ YOUR LEAD — enemy played off-suit ${eName} → auto-win!`);
    } else if (!G.playerLeads && !outcome.suitMatches) {
      // Player following but enemy was off-suit
      parts.push(`✅ Enemy led off-suit — your ${pName} wins!`);
    } else if (outcome.suitMatches) {
      if (pCard.keywords.includes('Mirror')) {
        parts.push(`🪞 Mirror — copied rank, your ${pName} ties their ${eName}`);
      } else if (pCard.keywords.includes('Swift') && pCard.rank === eCard.rank) {
        parts.push(`⚡ SWIFT TIE — your ${pName} ties → you win!`);
      } else {
        parts.push(`✅ ${pName} beats ${eName} (same suit, higher rank)`);
      }
    }
    // Bonus context — show what boosted the score
    if (outcome.isClash) parts.push(`⚡ CLASH on ${rowName}!`);
    const streak = G.rowStreaks[row] || 0;
    if (streak >= 2) parts.push(`🔗 ${rowName} streak ×${streak}`);
    if (outcome.scoreResult?.vengeanceApplied) parts.push(`💀 VENGEANCE ×2.5!`);
    if (outcome.scoreResult?.crownSurgeApplied) parts.push(`👑 Crown Surge ×2!`);
    if (finalDmg) parts.push(`→ +${finalDmg} dmg on ${rowName}`);
  } else if (outcome._cursedPlayed) {
    parts.push(`🌑 Cursed card — self-damage, cannot win`);
  } else {
    // Loss narrative — explain WHY the player lost to teach them
    if (!outcome.effectiveMatch && !G.playerLeads) {
      parts.push(`❌ Off-suit — your ${pName} can't beat their lead ${eName}`);
    } else if (!outcome.effectiveMatch && G.playerLeads) {
      // Player led, enemy matched suit + higher rank
      parts.push(`❌ Their ${eName} followed suit and outranked your ${pName}`);
    } else if (outcome.effectiveMatch) {
      parts.push(`❌ Their ${eName} outranks your ${pName} (same suit, higher rank)`);
    } else {
      parts.push(`❌ Lost to ${eName}`);
    }
    
    // Show HP impact on loss
    if (outcome.incomingDamage.absorbed) {
      parts.push(`🛡️ Absorbed! No damage`);
    } else if (outcome.incomingDamage.raw > 0) {
      const shieldInfo = outcome.incomingDamage.shieldUsed > 0 ? ` (${outcome.incomingDamage.shieldUsed} blocked)` : '';
      parts.push(`💔 −${outcome.incomingDamage.afterShield} HP${shieldInfo}`);
    }
    
    // Show sacrifice progress toward Vengeance
    if (G.sacrificeCharge >= 3) parts.push(`⚡ VENGEANCE CHARGED — next win ×2.5!`);
    else if (G.sacrificeCharge > 0) parts.push(`🗡️ Sacrifice ${G.sacrificeCharge}/3 → Vengeance at 3`);
    if (outcome.crownOnLoss) parts.push(`👑 Crown Gambit stored!`);
  }

  return parts.join('  ·  ');
}

function showResolutionNarrative(text, isWin) {
  const strip = document.getElementById('resolution-narrative');
  if (!strip) return;
  strip.textContent = text;
  strip.className = 'resolution-narrative visible ' + (isWin ? 'win' : 'lose');
  // TIER2-REC6v6: Extended display time for readability (was 2.5s, now 3.5s)
  clearTimeout(strip._dismissTimer);
  strip._dismissTimer = setTimeout(() => {
    strip.classList.remove('visible');
  }, 3500);
}

function useResilience() {
  if (G.resilience >= 3) { G.resilience -= 3; G.shield += 5; spawnKeywordPopup('🔮 Resilience: +5 Shield!', 45); updateBattleUI(); }
}

// ============================================================
// TIER2-REC5v6: ACCESSIBILITY FOUNDATION
// High contrast mode, reduced motion, suit shape watermarks
// ============================================================
function toggleAccessibilityPanel() {
  const panel = document.getElementById('a11y-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function toggleHighContrast(enabled) {
  document.body.classList.toggle('high-contrast', enabled);
  try { localStorage.setItem('tee_a11y_highContrast', enabled ? '1' : '0'); } catch(e) {}
}

function toggleReducedMotion(enabled) {
  document.body.classList.toggle('reduced-motion', enabled);
  try { localStorage.setItem('tee_a11y_reducedMotion', enabled ? '1' : '0'); } catch(e) {}
}

function toggleSuitShapes(enabled) {
  document.body.classList.toggle('suit-shapes', enabled);
  try { localStorage.setItem('tee_a11y_suitShapes', enabled ? '1' : '0'); } catch(e) {}
}

function loadAccessibilityPrefs() {
  try {
    const hc = localStorage.getItem('tee_a11y_highContrast') === '1';
    const rm = localStorage.getItem('tee_a11y_reducedMotion') === '1';
    const ss = localStorage.getItem('tee_a11y_suitShapes') !== '0'; // Default on
    
    if (hc) { document.body.classList.add('high-contrast'); const cb = document.getElementById('a11y-high-contrast'); if (cb) cb.checked = true; }
    if (rm) { document.body.classList.add('reduced-motion'); const cb = document.getElementById('a11y-reduced-motion'); if (cb) cb.checked = true; }
    if (ss) { document.body.classList.add('suit-shapes'); const cb = document.getElementById('a11y-suit-shapes'); if (cb) cb.checked = true; }
    
    // Also respect OS prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduced-motion');
      const cb = document.getElementById('a11y-reduced-motion');
      if (cb) cb.checked = true;
    }
  } catch(e) {}
}

function showHelp() { document.getElementById('help-overlay').style.display = 'flex'; }

// ============================================================
// TIER2v4-7: CONTEXTUAL HELP TOOLTIPS
// Micro-tooltips that trigger on first-encounter events.
// Store "seen" flags in META.tooltipsSeen to avoid repeating.
// ============================================================
const CONTEXTUAL_TIPS = {
  encounter_rule: (rule) => ({
    title: `📋 Encounter Rule: ${rule.name}`,
    body: rule.desc,
    icon: rule.icon || '📋',
  }),
  keyword: (kw) => ({
    title: `✨ New Keyword: ${kw}`,
    body: KEYWORD_DESCRIPTIONS?.[kw] || `${kw} — a special card ability. Check the help overlay for details.`,
    icon: '✨',
  }),
  forge_intro: () => ({
    title: '🔥 The Ember Forge',
    body: 'Upgrade your Flame modifiers to powerful Infernos! Choose from three paths: Boost (×1.5 value), Re-suit (change suit), or add a Conditional Effect.',
    icon: '🔥',
  }),
  surge_crown: () => ({
    title: '👑 Crown Surge!',
    body: 'Win 4+ tricks on Crown row to trigger ×2 damage on your next win! This fires once per encounter — subsequent Crown streaks grant +0.3× mult.',
    icon: '👑',
  }),
  surge_heart: () => ({
    title: '❤️ Heart Surge!',
    body: 'Chip Doubler activated! All chip modifiers are doubled for this encounter, plus bonus mult based on your chip mod count.',
    icon: '❤️',
  }),
  surge_foundation: () => ({
    title: '🛡️ Shield Surge!',
    body: 'Shieldbreaker ready! Your next win converts ALL shield into bonus damage at 1.5× rate.',
    icon: '🛡️',
  }),
  sacrifice: () => ({
    title: '🗡️ Sacrifice System',
    body: 'Each lost trick charges Sacrifice (max 3). At 3 charges, your next WIN gets a massive ×2.5 Vengeance multiplier! Losing strategically is powerful.',
    icon: '🗡️',
  }),
  boss_phase: () => ({
    title: '⚡ Boss Phase Shift!',
    body: 'As you damage bosses, they shift to new phases with escalating effects. Some phases change the rules entirely — read the phase description carefully!',
    icon: '⚡',
  }),
  gauntlet: () => ({
    title: '🏟️ Gauntlet Format',
    body: 'Face 5 waves with ONE hand — cards don\'t refresh between waves! Each kill grants +0.1× mult for remaining waves. The final Champion has double HP.',
    icon: '🏟️',
  }),
  puzzle: () => ({
    title: '🧩 Puzzle Format',
    body: 'Win EXACTLY 2 of 4 tricks for a perfect score. Winning too many or too few results in a penalty — think carefully about when to throw a trick!',
    icon: '🧩',
  }),
  bid: () => ({
    title: '🎲 Bid Format',
    body: 'Choose a wager level before the fight. Higher bids make the enemy stronger but increase your rewards. Reckless bids can drop rare modifiers!',
    icon: '🎲',
  }),
};

function showContextualTip(tipKey, dataFn) {
  if (!META.tooltipsSeen) META.tooltipsSeen = {};
  if (META.tooltipsSeen[tipKey]) return; // Already seen

  // BUGFIX: Defer tips while onboarding overlay is visible
  if (G._deferContextualTips) {
    if (!G._pendingTips) G._pendingTips = [];
    G._pendingTips.push({ tipKey, dataFn });
    return;
  }

  META.tooltipsSeen[tipKey] = true;
  saveMeta(META);

  const tipData = typeof dataFn === 'function' ? dataFn() : dataFn;
  if (!tipData) return;

  const el = document.createElement('div');
  el.className = 'contextual-tooltip';
  el.innerHTML = `
    <div class="ctx-tip-header">
      <span class="ctx-tip-icon">${tipData.icon || '💡'}</span>
      <span class="ctx-tip-title">${tipData.title}</span>
    </div>
    <div class="ctx-tip-body">${tipData.body}</div>
    <button class="ctx-tip-dismiss" onclick="this.parentElement.remove()">Got it!</button>
  `;
  document.body.appendChild(el);

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    if (el.parentElement) {
      el.classList.add('ctx-tip-fade');
      setTimeout(() => el.remove(), 400);
    }
  }, 8000);
}

function toggleSFX() {
  const muted = AudioEngine.toggleMute();
  document.querySelectorAll('#sfx-toggle, #battle-sfx-toggle').forEach(el => {
    el.textContent = muted ? '🔇' : '🔊';
    if (el.id === 'sfx-toggle') el.textContent += ' SFX';
    el.classList.toggle('muted', muted);
  });
}
function toggleMusic() {
  const muted = AudioEngine.toggleMusic();
  document.querySelectorAll('#music-toggle, #battle-music-toggle').forEach(el => {
    el.textContent = muted ? '🎵' : '🎵';
    if (el.id === 'music-toggle') el.textContent += ' Music';
    el.classList.toggle('muted', muted);
  });
}

// ===== PROGRESSION / COLLECTION SCREENS =====
function showProgressionScreen() {
  const screen = document.getElementById('progression-screen');
  screen.style.display = 'flex';
  renderProgressionTabs('unlocks');
}

function closeProgressionScreen() {
  document.getElementById('progression-screen').style.display = 'none';
}

function renderProgressionTabs(activeTab) {
  const tabsEl = document.getElementById('prog-tabs');
  const contentEl = document.getElementById('prog-content');
  const tabs = [
    { id: 'unlocks', label: '🔓 Unlocks', count: META.unlockedIds.length + '/' + UNLOCK_DATA.length },
    { id: 'achievements', label: '🏆 Achievements', count: META.achievementIds.length + '/' + ACHIEVEMENT_DATA.length },
    { id: 'codex', label: '📖 Card Codex', count: META.codex.length },
    { id: 'combos', label: '🎯 Combos', count: (META.combosDiscovered || []).length + '/' + COMBO_DEFINITIONS.length },
    { id: 'rules', label: '📋 Rules', count: Object.keys(META.analytics.encounterRulesSeen || {}).length + '/' + Object.keys(ENCOUNTER_RULES).length },
    { id: 'bestiary', label: '🔍 Relic Bestiary', count: META.bestiary.length },
    { id: 'enemies', label: '💀 Enemy Log', count: (META.enemyLog || []).length },
    { id: 'stats', label: '📊 Stats', count: '' },
  ];
  tabsEl.innerHTML = tabs.map(t =>
    `<button class="prog-tab ${t.id === activeTab ? 'active' : ''}" onclick="renderProgressionTabs('${t.id}')">${t.label} <span class="prog-tab-count">${t.count}</span></button>`
  ).join('');

  switch(activeTab) {
    case 'unlocks': renderUnlocksTab(contentEl); break;
    case 'achievements': renderAchievementsTab(contentEl); break;
    case 'codex': renderCodexTab(contentEl); break;
    case 'combos': renderCombosTab(contentEl); break;
    case 'rules': renderRulesTab(contentEl); break;
    case 'bestiary': renderBestiaryTab(contentEl); break;
    case 'enemies': renderEnemyLogTab(contentEl); break;
    case 'stats': renderStatsTab(contentEl); break;
  }
}

function renderUnlocksTab(el) {
  const categories = { relic: '🎁 Relics', event: '📜 Events', keyword: '🔑 Keywords' };
  let html = '<div class="prog-points">🔓 ' + META.unlockedIds.length + ' / ' + UNLOCK_DATA.length + ' Unlocked</div>';
  Object.entries(categories).forEach(([cat, label]) => {
    const items = UNLOCK_DATA.filter(u => u.category === cat);
    if (items.length === 0) return;
    html += `<div class="prog-section-header">${label}</div><div class="prog-grid">`;
    items.forEach(u => {
      const unlocked = META.unlockedIds.includes(u.id);
      html += `<div class="prog-item ${unlocked ? 'unlocked' : 'locked'}">
        <div class="prog-item-icon">${unlocked ? u.icon : '❓'}</div>
        <div class="prog-item-name">${unlocked ? u.name : '???'}</div>
        <div class="prog-item-desc">${unlocked ? u.desc : 'Keep playing to discover...'}</div>
        ${unlocked && u.reward ? '<div class="prog-item-reward">' + getRewardDesc(u.reward) + '</div>' : ''}
      </div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

function getRewardDesc(reward) {
  if (reward.type === 'relic') return '→ Unlocked: ' + reward.data.icon + ' ' + reward.data.name;
  if (reward.type === 'event') return '→ Unlocked: 📜 ' + reward.data.title;
  if (reward.type === 'keyword') return '→ Unlocked: ' + reward.data.keyword + ' — ' + reward.data.desc;
  return '';
}

function renderAchievementsTab(el) {
  const categories = {
    combat: '⚔️ Combat', scoring: '💥 Scoring', progression: '📈 Progression',
    ascension: '🔥 Ascension', archetype: '🎭 Archetypes', collection: '📚 Collection',
    class: '🎴 Classes', special: '✨ Special'
  };
  let html = '<div class="prog-points">🏆 ' + META.achievementIds.length + ' / ' + ACHIEVEMENT_DATA.length + ' — ' + META.achievementPoints + ' pts</div>';
  Object.entries(categories).forEach(([cat, label]) => {
    const items = ACHIEVEMENT_DATA.filter(a => a.category === cat);
    if (items.length === 0) return;
    const earned = items.filter(a => META.achievementIds.includes(a.id)).length;
    html += `<div class="prog-section-header">${label} <span class="prog-section-count">${earned}/${items.length}</span></div><div class="prog-grid achv-grid">`;
    items.forEach(a => {
      const done = META.achievementIds.includes(a.id);
      html += `<div class="prog-item achv-item ${done ? 'unlocked' : 'locked'}">
        <div class="achv-row">
          <span class="prog-item-icon">${done ? a.icon : '🔒'}</span>
          <span class="prog-item-name">${a.name}</span>
          <span class="achv-pts">${done ? '✓ ' : ''}${a.points}pts</span>
        </div>
        <div class="prog-item-desc">${a.desc}</div>
      </div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

// TIER3-10: Combo Codex tab
function renderCombosTab(el) {
  const discovered = META.combosDiscovered || [];
  let html = `<div class="prog-points">🎯 ${discovered.length} / ${COMBO_DEFINITIONS.length} Combos Discovered</div>`;
  html += '<div class="combo-codex-grid">';
  COMBO_DEFINITIONS.forEach(combo => {
    const found = discovered.includes(combo.id);
    html += `<div class="combo-codex-item ${found ? 'discovered' : 'undiscovered'}">
      <div class="combo-codex-icon">${found ? combo.icon : '❓'}</div>
      <div class="combo-codex-info">
        <div class="combo-codex-name">${found ? combo.name : '???'}</div>
        <div class="combo-codex-desc">${found ? combo.desc : 'Play more to discover this combo...'}</div>
      </div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

// TIER2v5-4: Encounter Rule Codex tab
function renderRulesTab(el) {
  const seen = META.analytics.encounterRulesSeen || {};
  const totalRules = Object.keys(ENCOUNTER_RULES).length;
  const seenCount = Object.keys(seen).length;
  let html = `<div class="prog-points">📋 ${seenCount} / ${totalRules} Encounter Rules Discovered</div>`;

  // Categorize rules
  const categories = {
    restrict: { label: '🚧 Restrict Your Choices', desc: 'Rules that limit how you can play', keys: [] },
    math: { label: '🔢 Change the Math', desc: 'Rules that alter damage or scoring', keys: [] },
    pressure: { label: '⏱️ Apply Pressure', desc: 'Rules that create urgency or escalation', keys: [] },
  };

  // Categorization mapping
  const RULE_CATEGORIES = {
    suit_variety: 'restrict', no_repeat_row: 'restrict', high_card_only: 'restrict',
    suit_rotation: 'restrict', page_tear: 'restrict',
    last_trick_only: 'math', descending_ranks: 'math', mirror_rows: 'math',
    blot_spread: 'math', rising_ranks: 'math',
    escalating_cost: 'pressure', countdown: 'pressure',
  };

  Object.keys(ENCOUNTER_RULES).forEach(key => {
    const cat = RULE_CATEGORIES[key] || 'math';
    if (categories[cat]) categories[cat].keys.push(key);
  });

  Object.entries(categories).forEach(([catKey, cat]) => {
    if (cat.keys.length === 0) return;
    const catSeen = cat.keys.filter(k => seen[k]).length;
    html += `<div class="prog-section-header">${cat.label} <span class="prog-section-count">${catSeen}/${cat.keys.length}</span></div>`;
    html += `<div class="prog-section-desc">${cat.desc}</div>`;
    html += '<div class="prog-grid rules-grid">';
    cat.keys.forEach(key => {
      const rule = ENCOUNTER_RULES[key];
      const found = !!seen[key];
      const count = seen[key] || 0;
      html += `<div class="prog-item rule-item ${found ? 'unlocked' : 'locked'}">
        <div class="rule-item-header">
          <span class="rule-icon">${found ? rule.icon : '❓'}</span>
          <span class="rule-name">${found ? rule.name : '???'}</span>
          ${found ? `<span class="rule-seen-count">Seen ${count}×</span>` : ''}
        </div>
        <div class="rule-desc">${found ? rule.desc : 'Encounter more enemies to discover this rule...'}</div>
        ${found ? `<div class="rule-color-bar" style="background:${rule.color}"></div>` : ''}
      </div>`;
    });
    html += '</div>';
  });

  if (totalRules === 0) html += '<div class="prog-empty">No encounter rules found!</div>';
  el.innerHTML = html;
}

function renderCodexTab(el) {
  const suitOrder = ['hearts','diamonds','clubs','spades','stars'];
  const rarityOrder = ['common','uncommon','rare','epic','legendary'];
  let html = '<div class="prog-points">📖 ' + META.codex.length + ' unique cards discovered</div>';
  // Group by suit
  suitOrder.forEach(suit => {
    const suitCards = META.codex.filter(c => c.startsWith(suit + '|'));
    if (suitCards.length === 0 && META.codex.length > 0) return;
    const sym = SUIT_SYMBOLS ? SUIT_SYMBOLS[suit] : suit;
    html += `<div class="prog-section-header" style="color:${getComputedSuitColor(suit)}">${sym} ${suit.charAt(0).toUpperCase()+suit.slice(1)} <span class="prog-section-count">${suitCards.length}</span></div>`;
    html += '<div class="codex-grid">';
    suitCards.slice(0, 30).forEach(key => {
      const parts = key.split('|');
      const rank = parts[1];
      const rarity = parts[2];
      const kws = parts[3] || '';
      const rankName = RANK_NAMES ? RANK_NAMES[rank] : rank;
      html += `<div class="codex-card" style="border-color:${getComputedSuitColor(suit)}">
        <span class="codex-rank">${rankName}${sym}</span>
        <span class="codex-rarity ${rarity}">${rarity}</span>
        ${kws ? '<span class="codex-kw">' + kws.replace(/,/g, ' ') + '</span>' : ''}
      </div>`;
    });
    if (suitCards.length > 30) html += `<div class="codex-more">+${suitCards.length - 30} more...</div>`;
    html += '</div>';
  });
  if (META.codex.length === 0) html += '<div class="prog-empty">Play games to discover cards!</div>';
  el.innerHTML = html;
}

function renderBestiaryTab(el) {
  const allRelics = [...RELIC_POOL, ...getUnlockedRelics()];
  let html = '<div class="prog-points">🔍 ' + META.bestiary.length + ' / ' + allRelics.length + ' relics discovered</div>';
  html += '<div class="prog-grid bestiary-grid">';
  allRelics.forEach(r => {
    const found = META.bestiary.includes(r.id);
    html += `<div class="prog-item bestiary-item ${found ? 'unlocked' : 'locked'}">
      <div class="bestiary-icon">${found ? r.icon : '❓'}</div>
      <div class="bestiary-name">${found ? r.name : '???'}</div>
      <div class="bestiary-desc">${found ? r.desc : 'Find this relic to reveal its power'}</div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

function renderEnemyLogTab(el) {
  let html = '<div class="prog-points">💀 ' + (META.enemyLog || []).length + ' enemies defeated</div>';
  html += '<div class="prog-grid enemy-grid">';
  (META.enemyLog || []).forEach(name => {
    html += `<div class="prog-item enemy-item unlocked">
      <div class="prog-item-icon">💀</div>
      <div class="prog-item-name">${name}</div>
    </div>`;
  });
  if ((META.enemyLog || []).length === 0) html += '<div class="prog-empty">Defeat enemies to log them here!</div>';
  html += '</div>';
  el.innerHTML = html;
}

// ============================================================
// TIER2-11: BALANCE ANALYTICS STATS TAB
// ============================================================
function renderStatsTab(el) {
  const a = META.analytics || {};
  let html = '<div class="prog-points">📊 Balance Analytics</div>';

  // --- Enemy Kill Rates ---
  html += '<div class="prog-section-header">💀 Enemies Killed</div>';
  const enemyKills = Object.entries(a.enemiesKilledByName || {}).sort((x, y) => y[1] - x[1]);
  if (enemyKills.length > 0) {
    html += '<div class="stats-table">';
    const maxKills = enemyKills[0]?.[1] || 1;
    enemyKills.slice(0, 15).forEach(([name, count]) => {
      const pct = Math.round((count / maxKills) * 100);
      html += `<div class="stats-row"><span class="stats-name">${name}</span><div class="stats-bar-wrap"><div class="stats-bar-fill" style="width:${pct}%"></div></div><span class="stats-val">${count}</span></div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="prog-empty">No enemy data yet</div>';
  }

  // --- Death Causes ---
  html += '<div class="prog-section-header">☠️ Death Causes</div>';
  const deaths = Object.entries(a.deathCauses || {}).sort((x, y) => y[1] - x[1]);
  if (deaths.length > 0) {
    html += '<div class="stats-table">';
    const maxDeaths = deaths[0]?.[1] || 1;
    deaths.slice(0, 10).forEach(([name, count]) => {
      const pct = Math.round((count / maxDeaths) * 100);
      html += `<div class="stats-row"><span class="stats-name">${name}</span><div class="stats-bar-wrap"><div class="stats-bar-fill death" style="width:${pct}%"></div></div><span class="stats-val">${count}</span></div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="prog-empty">No defeats yet — impressive!</div>';
  }

  // --- Archetype Selection Rates ---
  html += '<div class="prog-section-header">🎭 Archetype Popularity</div>';
  const archSelections = Object.entries(a.archetypeSelections || {}).sort((x, y) => y[1] - x[1]);
  if (archSelections.length > 0) {
    html += '<div class="stats-table">';
    const maxArch = archSelections[0]?.[1] || 1;
    archSelections.forEach(([key, count]) => {
      const arch = ARCHETYPE_DATA[key];
      const name = arch ? arch.icon + ' ' + arch.name : key;
      const color = arch?.color || 'var(--text-primary)';
      const pct = Math.round((count / maxArch) * 100);
      html += `<div class="stats-row"><span class="stats-name" style="color:${color}">${name}</span><div class="stats-bar-wrap"><div class="stats-bar-fill archetype" style="width:${pct}%;background:${color}"></div></div><span class="stats-val">${count}</span></div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="prog-empty">No archetype data yet</div>';
  }

  // --- Keyword Take Rates ---
  html += '<div class="prog-section-header">🔑 Keyword Take Rates</div>';
  const kwRates = Object.entries(a.keywordTakeRates || {}).sort((x, y) => y[1] - x[1]);
  if (kwRates.length > 0) {
    html += '<div class="stats-table">';
    const maxKw = kwRates[0]?.[1] || 1;
    kwRates.slice(0, 12).forEach(([kw, count]) => {
      const pct = Math.round((count / maxKw) * 100);
      html += `<div class="stats-row"><span class="stats-name" style="color:var(--gold)">${kw}</span><div class="stats-bar-wrap"><div class="stats-bar-fill keyword" style="width:${pct}%"></div></div><span class="stats-val">${count}</span></div>`;
    });
    html += '</div>';
  } else {
    html += '<div class="prog-empty">No keyword data yet</div>';
  }

  // --- Row Win Rates ---
  html += '<div class="prog-section-header">🎯 Row Win Rates</div>';
  const rwrData = a.rowWinRates || {};
  const rowColors = { crown: 'var(--crown-row)', heart: 'var(--heart-row)', foundation: 'var(--foundation-row)' };
  const rowNames = { crown: '👑 Crown', heart: '❤️ Heart', foundation: '🛡️ Shield' };
  html += '<div class="stats-table">';
  ['crown', 'heart', 'foundation'].forEach(r => {
    const data = rwrData[r] || { wins: 0, plays: 0 };
    const rate = data.plays > 0 ? Math.round((data.wins / data.plays) * 100) : 0;
    html += `<div class="stats-row"><span class="stats-name" style="color:${rowColors[r]}">${rowNames[r]}</span><div class="stats-bar-wrap"><div class="stats-bar-fill" style="width:${rate}%;background:${rowColors[r]}"></div></div><span class="stats-val">${rate}% (${data.wins}/${data.plays})</span></div>`;
  });
  html += '</div>';

  // --- Forge Path Usage ---
  html += '<div class="prog-section-header">⚒️ Forge Path Usage</div>';
  const fpd = a.forgePathUsage || {};
  html += '<div class="stats-table">';
  html += `<div class="stats-row"><span class="stats-name">🔥 Inferno (Boost)</span><span class="stats-val">${fpd.boost || 0}</span></div>`;
  html += `<div class="stats-row"><span class="stats-name">🎨 Re-suit</span><span class="stats-val">${fpd.resuit || 0}</span></div>`;
  html += `<div class="stats-row"><span class="stats-name">✨ Conditional</span><span class="stats-val">${fpd.condition || 0}</span></div>`;
  html += '</div>';

  // --- Class Pick Rates ---
  html += '<div class="prog-section-header">🎴 Class Pick Rates</div>';
  const cpr = a.classPickRates || {};
  html += '<div class="stats-table">';
  const classNames = { ember: '🔥 Ember', chrome: '⚙️ Chrome', stellar: '⭐ Stellar' };
  const totalPicks = Object.values(cpr).reduce((s, v) => s + v, 0) || 1;
  ['ember', 'chrome', 'stellar'].forEach(cls => {
    const count = cpr[cls] || 0;
    const pct = Math.round((count / totalPicks) * 100);
    html += `<div class="stats-row"><span class="stats-name">${classNames[cls] || cls}</span><div class="stats-bar-wrap"><div class="stats-bar-fill" style="width:${pct}%"></div></div><span class="stats-val">${count} (${pct}%)</span></div>`;
  });
  html += '</div>';

  // --- Summary Stats ---
  html += '<div class="prog-section-header">📈 Summary</div>';
  const avgLen = a.avgRunLength?.count > 0 ? (a.avgRunLength.total / a.avgRunLength.count).toFixed(1) : '—';
  html += `<div class="stats-summary">
    <div class="stats-summary-item"><span class="ss-label">Avg Encounters/Run</span><span class="ss-val">${avgLen}</span></div>
    <div class="stats-summary-item"><span class="ss-label">Total Runs</span><span class="ss-val">${META.totalRuns}</span></div>
    <div class="stats-summary-item"><span class="ss-label">Win Rate</span><span class="ss-val">${META.totalRuns > 0 ? Math.round((META.totalVictories / META.totalRuns) * 100) : 0}%</span></div>
    <div class="stats-summary-item"><span class="ss-label">All-Time Damage</span><span class="ss-val">${(META.totalDamageAllTime || 0).toLocaleString()}</span></div>
    <div class="stats-summary-item"><span class="ss-label">Best Trick</span><span class="ss-val">${META.bestTrickScore || 0}</span></div>
  </div>`;

  el.innerHTML = html;
}

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
    document.getElementById('progression-screen').style.display = 'none';
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
