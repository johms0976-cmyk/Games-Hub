'use strict';
/* 1960: The Making of the President — the components.
 *
 * Sources, best first (ARCHITECTURE.md "Where the numbers came from"):
 *   1. the card faces in the user's VASSAL module (1960_GMT_v1.3.vmod,
 *      images/NN <name>.jpg) — CP, rest cubes, candidate icons, debate issue,
 *      state, persistent bar and the event, read by eye from contact sheets;
 *   2. the module's build file — every state's region, electoral votes,
 *      starting support and edge (the SetupStack "Setup" property, signed:
 *      Kennedy positive), and the zone rectangles on the 5100x3300 map;
 *   3. the 2017 rulebook (1960_MOTP_Rules_Final.pdf, tools/rulebook.txt).
 * The totals the tests demand: 537 electoral votes, 97 campaign cards, 4
 * Gathering Momentum cards, 16 endorsement cards (3 a region + 4 major).
 *
 * Every line of card text below is written fresh. Each event is ALSO data:
 * `ops`, a small list of steps the engine runs (m60-engine.js `runOps`) and
 * the house reads to value a card (m60-bots.js `opsValue`), so the two
 * cannot disagree about what a card does.
 *
 * Sides are 'K' (Kennedy, blue) and 'N' (Nixon, red). Every count on the
 * board is SIGNED, Kennedy positive: a state at +3 is three Kennedy cubes, at
 * -4 four Nixon cubes (carried). Gaining one cube where the other side has
 * cubes removes one of theirs instead — which is exactly "add the sign".
 */
(function (root) {
  const VERSION = 1;

  const SIDES = ['K', 'N'];
  const SIDE = {
    K: { id: 'K', name: 'Kennedy', full: 'John F. Kennedy', party: 'Democrat', hex: '#3e7bfa', dark: '#163a86', home: 'MA', sign: 1 },
    N: { id: 'N', name: 'Nixon', full: 'Richard M. Nixon', party: 'Republican', hex: '#e5484d', dark: '#7a1a1e', home: 'CA', sign: -1 }
  };
  const other = s => s === 'K' ? 'N' : 'K';

  const REGIONS = ['W', 'MW', 'S', 'E'];
  const REGION = {
    W: { id: 'W', name: 'West', hex: '#c9a35b' },
    MW: { id: 'MW', name: 'Midwest', hex: '#3d6b6a' },
    S: { id: 'S', name: 'South', hex: '#6f93bd' },
    E: { id: 'E', name: 'East', hex: '#d1584f' }
  };
  /* For MOVING only, Alaska and Hawaii are regions of their own, each behind
     a boundary that is crossed from the West (rulebook p9). The regions a
     candidate travels between, and the crossings between them. */
  const MOVE_REGIONS = ['W', 'MW', 'S', 'E', 'AK', 'HI'];
  const MOVE_EDGES = [['W', 'MW'], ['W', 'S'], ['MW', 'S'], ['MW', 'E'], ['S', 'E'], ['W', 'AK'], ['W', 'HI']];

  const ISSUES = ['def', 'eco', 'cr'];
  const ISSUE = {
    def: { id: 'def', name: 'Defense', hex: '#c2433c' },
    eco: { id: 'eco', name: 'Economy', hex: '#8fa83a' },
    cr: { id: 'cr', name: 'Civil Rights', hex: '#4c8a93' }
  };
  /* The issues track at the start, first place first. */
  const ISSUE_START = ['def', 'eco', 'cr'];

  /* The fifty states. start: starting support, signed (Kennedy positive);
     edge: who an empty state falls to on Election Day with no endorsement in
     its region; box: the state's box on the 5100x3300 map (px). */
  const STATE = {
    WA: { name: "Washington", reg: 'W', ev: 9, start: 0, edge: 'N', box: [729, 352, 955, 582] },
    OR: { name: "Oregon", reg: 'W', ev: 6, start: 0, edge: 'N', box: [820, 720, 1050, 950] },
    CA: { name: "California", reg: 'W', ev: 32, start: 0, edge: 'N', box: [721, 1544, 952, 1774] },
    AK: { name: "Alaska", reg: 'W', ev: 3, start: 0, edge: 'N', box: [160, 1574, 387, 1800] },
    HI: { name: "Hawaii", reg: 'W', ev: 3, start: 0, edge: 'N', box: [103, 2203, 330, 2425] },
    AZ: { name: "Arizona", reg: 'W', ev: 4, start: -1, edge: 'N', box: [1251, 1757, 1481, 1985] },
    NV: { name: "Nevada", reg: 'W', ev: 3, start: 0, edge: 'K', box: [946, 1197, 1177, 1424] },
    UT: { name: "Utah", reg: 'W', ev: 4, start: -1, edge: 'N', box: [1346, 1300, 1577, 1532] },
    ID: { name: "Idaho", reg: 'W', ev: 4, start: 0, edge: 'N', box: [1251, 855, 1482, 1082] },
    MT: { name: "Montana", reg: 'W', ev: 4, start: 0, edge: 'N', box: [1752, 552, 1960, 764] },
    WY: { name: "Wyoming", reg: 'W', ev: 3, start: -1, edge: 'N', box: [1751, 917, 1980, 1144] },
    CO: { name: "Colorado", reg: 'W', ev: 6, start: -1, edge: 'N', box: [1750, 1300, 1980, 1531] },
    NM: { name: "New Mexico", reg: 'W', ev: 4, start: 0, edge: 'K', box: [1695, 1752, 1925, 1985] },
    ND: { name: "North Dakota", reg: 'W', ev: 4, start: -1, edge: 'N', box: [2251, 490, 2485, 721] },
    SD: { name: "South Dakota", reg: 'W', ev: 4, start: -1, edge: 'N', box: [2253, 789, 2482, 1018] },
    NE: { name: "Nebraska", reg: 'W', ev: 6, start: -2, edge: 'N', box: [2255, 1086, 2482, 1314] },
    KS: { name: "Kansas", reg: 'W', ev: 8, start: -2, edge: 'N', box: [2487, 1373, 2715, 1608] },
    OK: { name: "Oklahoma", reg: 'W', ev: 8, start: -1, edge: 'N', box: [2484, 1706, 2716, 1937] },
    TX: { name: "Texas", reg: 'S', ev: 24, start: 0, edge: 'K', box: [2482, 2139, 2718, 2375] },
    AR: { name: "Arkansas", reg: 'S', ev: 8, start: 1, edge: 'K', box: [2861, 1697, 3089, 1918] },
    LA: { name: "Louisiana", reg: 'S', ev: 10, start: 2, edge: 'K', box: [2873, 2259, 3102, 2491] },
    MS: { name: "Mississippi", reg: 'S', ev: 8, start: 2, edge: 'K', box: [3084, 1928, 3315, 2157] },
    TN: { name: "Tennessee", reg: 'S', ev: 11, start: 0, edge: 'N', box: [3405, 1599, 3637, 1829] },
    AL: { name: "Alabama", reg: 'S', ev: 11, start: 1, edge: 'K', box: [3407, 1930, 3636, 2160] },
    GA: { name: "Georgia", reg: 'S', ev: 12, start: 2, edge: 'K', box: [3721, 1928, 3950, 2157] },
    FL: { name: "Florida", reg: 'S', ev: 10, start: 0, edge: 'N', box: [3980, 2401, 4210, 2636] },
    SC: { name: "South Carolina", reg: 'S', ev: 8, start: 1, edge: 'K', box: [4102, 1868, 4333, 2096] },
    NC: { name: "North Carolina", reg: 'S', ev: 14, start: 1, edge: 'K', box: [4108, 1625, 4337, 1848] },
    VA: { name: "Virginia", reg: 'S', ev: 12, start: 0, edge: 'N', box: [4110, 1374, 4341, 1599] },
    MN: { name: "Minnesota", reg: 'MW', ev: 11, start: 0, edge: 'K', box: [2681, 668, 2909, 898] },
    IA: { name: "Iowa", reg: 'MW', ev: 10, start: -1, edge: 'N', box: [2682, 1029, 2907, 1258] },
    MO: { name: "Missouri", reg: 'MW', ev: 13, start: 1, edge: 'K', box: [2853, 1331, 3081, 1557] },
    WI: { name: "Wisconsin", reg: 'MW', ev: 12, start: 0, edge: 'N', box: [3059, 671, 3289, 899] },
    IL: { name: "Illinois", reg: 'MW', ev: 27, start: 0, edge: 'K', box: [3090, 1028, 3314, 1255] },
    MI: { name: "Michigan", reg: 'MW', ev: 20, start: 0, edge: 'K', box: [3469, 669, 3698, 903] },
    IN: { name: "Indiana", reg: 'MW', ev: 13, start: -1, edge: 'N', box: [3369, 1023, 3597, 1258] },
    OH: { name: "Ohio", reg: 'MW', ev: 25, start: -1, edge: 'N', box: [3651, 1026, 3882, 1258] },
    KY: { name: "Kentucky", reg: 'MW', ev: 10, start: 0, edge: 'N', box: [3408, 1329, 3639, 1562] },
    WV: { name: "West Virginia", reg: 'E', ev: 8, start: 0, edge: 'K', box: [3720, 1405, 3952, 1632] },
    ME: { name: "Maine", reg: 'E', ev: 5, start: -1, edge: 'N', box: [4670, 180, 4900, 408] },
    VT: { name: "Vermont", reg: 'E', ev: 3, start: -1, edge: 'N', box: [4302, 376, 4525, 602] },
    NH: { name: "New Hampshire", reg: 'E', ev: 4, start: 0, edge: 'N', box: [4673, 470, 4901, 699] },
    NY: { name: "New York", reg: 'E', ev: 45, start: 0, edge: 'K', box: [4051, 636, 4282, 864] },
    MA: { name: "Massachusetts", reg: 'E', ev: 16, start: 2, edge: 'K', box: [4671, 723, 4900, 949] },
    PA: { name: "Pennsylvania", reg: 'E', ev: 32, start: 0, edge: 'K', box: [4055, 880, 4282, 1108] },
    CT: { name: "Connecticut", reg: 'E', ev: 8, start: 0, edge: 'K', box: [4409, 941, 4632, 1165] },
    RI: { name: "Rhode Island", reg: 'E', ev: 4, start: 2, edge: 'K', box: [4671, 970, 4899, 1199] },
    MD: { name: "Maryland", reg: 'E', ev: 9, start: 0, edge: 'K', box: [3930, 1141, 4157, 1372] },
    DE: { name: "Delaware", reg: 'E', ev: 3, start: 0, edge: 'K', box: [4406, 1192, 4636, 1416] },
    NJ: { name: "New Jersey", reg: 'E', ev: 16, start: 0, edge: 'K', box: [4406, 1428, 4634, 1660] }
  };
  const STATES = Object.keys(STATE);
  STATES.forEach(k => { STATE[k].id = k; });
  const moveRegionOf = st => (st === 'AK' || st === 'HI') ? st : STATE[st].reg;
  const statesIn = reg => STATES.filter(s => STATE[s].reg === reg);
  const statesInMove = mr => STATES.filter(s => moveRegionOf(s) === mr);
  /* Crossings between two travel regions (breadth first over MOVE_EDGES). */
  const DIST = {};
  MOVE_REGIONS.forEach(a => {
    const d = { [a]: 0 };
    const q = [a];
    while (q.length) {
      const x = q.shift();
      for (const [p, r] of MOVE_EDGES) {
        const y = p === x ? r : r === x ? p : null;
        if (y && d[y] == null) { d[y] = d[x] + 1; q.push(y); }
      }
    }
    DIST[a] = d;
  });
  const travelCost = (from, to) => DIST[from][to];

  /* The other places on the printed map (5100x3300 px), from the module's
     zones — where the telly draws the tracks, boxes and markers. */
  const ZONE = {
    turn: [[832, 76, 1029, 276], [1040, 77, 1237, 273], [1245, 77, 1442, 276], [1451, 80, 1648, 273], [1657, 77, 1855, 276], [1863, 75, 2060, 275], [2069, 73, 2268, 273], [2276, 79, 2475, 275], [2482, 79, 2681, 275]],
    phase: [[3083, 75, 3279, 272], [3286, 75, 3482, 272], [3493, 74, 3692, 271], [3698, 75, 3896, 271], [3905, 73, 4101, 275], [4111, 75, 4307, 272], [4316, 72, 4514, 273]],
    rest: { N: [79, 150, 557, 628], K: [4500, 2708, 4973, 3194] },
    strat: { N: [84, 674, 625, 1068], K: [4462, 2260, 5005, 2655] },
    prev: [175, 2650, 570, 3195], debate: [633, 2649, 1027, 3196], eday: [1086, 2648, 1483, 3197],
    prevMark: { 1: [1542, 2727, 1714, 2893], 18: [1540, 2951, 1717, 3119] },
    issue: [[3511, 2870, 3706, 3067], [3801, 2869, 4000, 3066], [4101, 2872, 4297, 3067]],
    media: { W: [1011, 2240, 1280, 2513], S: [3605, 2434, 3871, 2702], MW: [3868, 343, 4137, 608], E: [4689, 1638, 4965, 1908] },
    endorse: { W: [744, 2070, 1090, 2411], S: [3273, 2432, 3603, 2762], MW: [3512, 287, 3872, 602], E: [4668, 1360, 5002, 1643] },
    play: { N: [1855, 2801, 2301, 3302], K: [2764, 2810, 3328, 3300] }
  };
  const MAP_W = 5100, MAP_H = 3300;

  /* ================================================================
     The game's shape (rulebook p6, p11-14)
     ================================================================ */
  const RULES = {
    turns: 9, debateTurn: 6, electionTurn: 9,
    hand: t => t < 6 ? 6 : 7,
    strat: t => t < 6 ? 1 : 2,
    phases: 5,
    momentum: 2, bagSeed: 12, carry: 4, candCp: 5,
    debateAward: [2, 3, 4], edayChecks: 3, toWin: 269, ev: 537
  };

  /* ================================================================
     The campaign cards. icon: whose candidate icon(s) the card shows
     ('K', 'N' or 'B' for both); iss: its debate issue; st: its state;
     persist: 'prev' | 'debate' | 'eday' for the cards with a bar under
     the name; noStrat: the four Gathering Momentum cards.

     The step language (`ops`, run in order):
       who      'K' | 'N' | 'me' (whoever resolves it) | 'opp' (their opponent)
                | 'lead:<issue>' | 'media:<region>' | 'more:<region>' (leads more
                states there) | 'akhi' (more support in Alaska and Hawaii)
       where    'any' | {reg} | {regs} | {sts} | {empty:true} | {regs, evMax}
                | {evMin} | {mediaReg:true} (one region where who has media)
                | {single:'ledNotCarriedBy'} (Swing State)
       add      who MAY add a total of n, at most cap a state (checks apply)
       gain     who gains n in one state (checks apply)
       sub      `by` may (or `must`) take n off `from`'s support, cap a state;
                with must:true the loser chooses
       lose     who loses n in a state ('token' = where their candidate is)
       mom      who gains (or loses, n<0) momentum markers
       iss      who gains/loses n issue support in iss ('each' = all three)
       issPick  who may add n issue support (one:true = all in one issue)
       issLose  who must take n off their own issue support, choosing where
       up       iss moves up n places on the issues track
       tok      who's candidate token moves to st (or a choice of states)
       fx       a rest-of-the-turn effect (see the engine's FX)
       media / mediaAt / mediaOff / endorse / reclaim / exhaust / retrieve /
       draw / swap / equal / if / medal / gm — see the engine's runOps.
     ================================================================ */
  const C = (id, name, cp, rest, icon, iss, st, text, ops, extra) => Object.assign({ id, name, cp, rest, icon, iss, st, text, ops }, extra || {});
  const CARDS = [
    C(1, 'Greater Houston Ministerial Association', 4, 0, 'K', 'def', 'NY',
      'Kennedy’s candidate moves straight to Texas, free. Kennedy gains 1 momentum and may add 5 state support anywhere, at most 1 a state. From now on Baptist Ministers, Norman Vincent Peale and Puerto Rican Bishops cannot be played as events.',
      [{ op: 'tok', who: 'K', st: 'TX' }, { op: 'mom', who: 'K', n: 1 }, { op: 'add', who: 'K', n: 5, cap: 1, where: 'any' }], { persist: 'prev', prevents: [9, 73, 44] }),
    C(2, 'Nixon’s Knee', 4, 0, 'K', 'eco', 'TX',
      'Nixon’s candidate moves straight to Maryland, free. For the rest of the turn Nixon must spend 1 momentum to play a card as a Campaigning action.',
      [{ op: 'tok', who: 'N', st: 'MD' }, { op: 'fx', key: 'knee' }]),
    C(3, 'Gallup Poll', 3, 1, 'B', 'cr', 'MO',
      'Rearrange the issues track in any order you like.',
      [{ op: 'gallup', who: 'me' }]),
    C(4, 'Citizens for Nixon-Lodge', 2, 2, 'N', 'cr', 'AZ',
      'For the rest of the turn every card Nixon plays is worth 1 more CP (5 at most).',
      [{ op: 'fx', key: 'cpUp', who: 'N' }]),
    C(5, 'Volunteers', 2, 2, 'B', 'def', 'OR',
      'Gain 1 momentum.',
      [{ op: 'mom', who: 'me', n: 1 }]),
    C(6, 'New England', 3, 1, 'K', 'def', 'LA',
      'Kennedy may add 5 state support across Connecticut, Massachusetts, Maine, New York, Rhode Island and Vermont, at most 2 a state.',
      [{ op: 'add', who: 'K', n: 5, cap: 2, where: { sts: ['CT', 'MA', 'ME', 'NY', 'RI', 'VT'] } }]),
    C(7, 'Late Returns from Cook County', 2, 2, 'K', 'eco', 'SC',
      'Election Day: Kennedy makes 5 support checks in Illinois.',
      [], { persist: 'eday', eday: { who: 'K', st: 'IL', n: 5 } }),
    C(8, 'Soviet Economic Growth', 2, 2, 'B', 'eco', 'NH',
      'Economy moves up one place on the issues track. Whoever leads Economy gains 1 state support in New York.',
      [{ op: 'up', iss: 'eco', n: 1 }, { op: 'gain', who: 'lead:eco', st: 'NY', n: 1 }]),
    C(9, 'Baptist Ministers', 3, 1, 'N', 'cr', 'MA',
      'Nixon may take 5 of Kennedy’s state support off the South and Midwest, at most 2 a state. Cannot be played once Greater Houston Ministerial Association is in effect.',
      [{ op: 'sub', by: 'N', from: 'K', n: 5, cap: 2, where: { regs: ['S', 'MW'] } }]),
    C(10, 'Swing State', 3, 1, 'B', 'cr', 'VA',
      'Add 5 state support to one state your opponent leads but does not carry, then move your candidate there, free.',
      [{ op: 'swing', who: 'me' }]),
    C(11, 'Sputnik V', 3, 1, 'B', 'cr', 'MA',
      'Defense moves up one place. Whoever leads Defense may add 3 state support anywhere, at most 1 a state.',
      [{ op: 'up', iss: 'def', n: 1 }, { op: 'add', who: 'lead:def', n: 3, cap: 1, where: 'any' }]),
    C(12, 'Southern Strategy', 3, 1, 'N', 'def', 'KY',
      'Nixon may add 5 state support in the South, at most 2 a state. Kennedy gains 1 issue support in Civil Rights.',
      [{ op: 'add', who: 'N', n: 5, cap: 2, where: { reg: 'S' } }, { op: 'iss', who: 'K', iss: 'cr', n: 1 }]),
    C(13, 'Nikita Krushchev', 3, 1, 'B', 'eco', 'FL',
      'Whoever leads Defense gains 1 momentum and may add 3 state support anywhere, at most 1 a state.',
      [{ op: 'mom', who: 'lead:def', n: 1 }, { op: 'add', who: 'lead:def', n: 3, cap: 1, where: 'any' }]),
    C(14, 'Gathering Momentum in the South', 4, 0, 'B', null, null,
      'Whoever leads more Southern states gains 1 momentum and 1 state support in every Southern state nobody has any support in. Cannot be a Campaign Strategy card.',
      [{ op: 'gm', reg: 'S' }], { noStrat: true }),
    C(15, 'Gathering Momentum in the East', 4, 0, 'B', null, null,
      'Whoever leads more Eastern states gains 1 momentum and 1 state support in every Eastern state nobody has any support in. Cannot be a Campaign Strategy card.',
      [{ op: 'gm', reg: 'E' }], { noStrat: true }),
    C(16, 'Gathering Momentum in the Midwest', 4, 0, 'B', null, null,
      'Whoever leads more Midwestern states gains 1 momentum and 1 state support in every Midwestern state nobody has any support in. Cannot be a Campaign Strategy card.',
      [{ op: 'gm', reg: 'MW' }], { noStrat: true }),
    C(17, 'Gathering Momentum in the West', 4, 0, 'B', null, null,
      'Whoever leads more Western states gains 1 momentum and 1 state support in every Western state nobody has any support in. Cannot be a Campaign Strategy card.',
      [{ op: 'gm', reg: 'W' }], { noStrat: true }),
    C(18, 'Dwight D. Eisenhower', 4, 0, 'N', 'cr', 'PA',
      'Nixon may add 7 state support anywhere, at most 1 a state. From now on Eisenhower’s Silence cannot be played as an event.',
      [{ op: 'add', who: 'N', n: 7, cap: 1, where: 'any' }], { persist: 'prev', prevents: [74] }),
    C(19, 'Old South', 4, 0, 'B', 'def', 'NY',
      'Whoever leads Civil Rights must take 5 of their own state support off the South, and may not spend CP Campaigning in the South for the rest of their turn.',
      [{ op: 'sub', by: 'lead:cr', from: 'lead:cr', n: 5, cap: 99, where: { reg: 'S' }, must: true }, { op: 'fx', key: 'oldSouth', who: 'lead:cr' }]),
    C(20, 'Nixon Egged in Michigan', 2, 2, 'K', 'def', 'HI',
      'Nixon’s candidate moves to Michigan, free. Nixon loses 1 state support in Michigan and may not spend CP Campaigning in the Midwest for the rest of the turn.',
      [{ op: 'tok', who: 'N', st: 'MI' }, { op: 'lose', who: 'N', st: 'MI', n: 1 }, { op: 'fx', key: 'noCamp', who: 'N', regs: ['MW'] }]),
    C(21, 'Fifty Stars', 2, 2, 'B', 'def', 'AK',
      'Whoever has more state support in Alaska and Hawaii together may add 5 state support anywhere, at most 1 a state.',
      [{ op: 'add', who: 'akhi', n: 5, cap: 1, where: 'any' }]),
    C(22, 'Gaffe', 4, 0, 'B', 'eco', 'TX',
      'Your opponent loses 1 momentum and 3 state support in the state their candidate is in.',
      [{ op: 'mom', who: 'opp', n: -1 }, { op: 'lose', who: 'opp', st: 'token', n: 3 }]),
    C(23, 'Martin Luther King Arrested', 4, 0, 'B', 'cr', 'CA',
      'Civil Rights moves up one place. You gain 3 issue support in Civil Rights.',
      [{ op: 'up', iss: 'cr', n: 1 }, { op: 'iss', who: 'me', iss: 'cr', n: 3 }]),
    C(24, 'East Harlem Pledge', 3, 1, 'K', 'eco', 'MI',
      'Nixon loses 1 issue support in Civil Rights. Kennedy may take 5 of Nixon’s state support off the South, at most 2 a state.',
      [{ op: 'iss', who: 'N', iss: 'cr', n: -1 }, { op: 'sub', by: 'K', from: 'N', n: 5, cap: 2, where: { reg: 'S' } }]),
    C(25, '1960 Civil Rights Act', 2, 2, 'N', 'cr', 'ND',
      'Civil Rights moves up one place, and Nixon gains 1 issue support in Civil Rights.',
      [{ op: 'up', iss: 'cr', n: 1 }, { op: 'iss', who: 'N', iss: 'cr', n: 1 }]),
    C(26, 'Ken-Air', 2, 2, 'K', 'cr', 'MD',
      'For the rest of the turn Kennedy pays no travel costs, and every card he plays as a Campaigning action is worth 1 more CP (5 at most).',
      [{ op: 'fx', key: 'kenAir' }]),
    C(27, 'Nelson Rockefeller', 3, 1, 'N', 'def', 'KY',
      'Nixon gains 1 state support in New York and may take any card from the discard pile into his hand.',
      [{ op: 'gain', who: 'N', st: 'NY', n: 1 }, { op: 'retrieve', who: 'N' }]),
    C(28, 'Harry F. Byrd', 2, 2, 'N', 'cr', 'ME',
      'Nixon may take 3 of Kennedy’s state support off Oklahoma, Mississippi and Alabama.',
      [{ op: 'sub', by: 'N', from: 'K', n: 3, cap: 3, where: { sts: ['OK', 'MS', 'AL'] } }]),
    C(29, 'The Great Seal Bug', 3, 1, 'N', 'eco', 'WI',
      'Nixon gains 1 issue support in Defense, and may take Henry Cabot Lodge back from the discard pile if it is there.',
      [{ op: 'iss', who: 'N', iss: 'def', n: 1 }, { op: 'retrieve', who: 'N', card: 42 }]),
    C(30, 'Johnson Jeered in Dallas', 2, 2, 'N', 'eco', 'MO',
      'Kennedy loses 1 state support in Texas and may not spend CP Campaigning in the South for the rest of the turn.',
      [{ op: 'lose', who: 'K', st: 'TX', n: 1 }, { op: 'fx', key: 'noCamp', who: 'K', regs: ['S'] }]),
    C(31, 'Profiles in Courage', 2, 2, 'K', 'cr', 'DE',
      'For the rest of the turn every support check Kennedy fails is drawn again, once.',
      [{ op: 'fx', key: 'profiles' }]),
    C(32, 'Early Returns from Connecticut', 2, 2, 'B', 'cr', 'WY',
      'Election Day: whoever leads Connecticut makes 5 support checks in California.',
      [], { persist: 'eday', eday: { who: 'leadCT', st: 'CA', n: 5 } }),
    C(33, 'Unpledged Electors', 4, 0, 'N', 'eco', 'CA',
      'Election Day: a state Kennedy wins among Alabama, Louisiana and Mississippi with fewer than 4 support gives its votes to nobody.',
      [], { persist: 'eday', eday: { unpledged: true } }),
    C(34, '“Lazy Shave”', 3, 1, 'K', 'def', 'NC',
      'In the Debates, Nixon’s card is shown each round before Kennedy chooses his. No effect after the Debates.',
      [], { persist: 'debate' }),
    C(35, 'Harvard Brain Trust', 4, 0, 'K', 'cr', 'PA',
      'In the Debates, Kennedy adds 1 to his CP total on every issue. No effect after the Debates.',
      [], { persist: 'debate' }),
    C(36, 'Henry Luce', 2, 2, 'K', 'def', 'WV',
      'Kennedy may put 1 endorsement marker in any one region.',
      [{ op: 'endorse', who: 'K', n: 1 }]),
    C(37, 'Lunch Counter Sit-Ins', 3, 1, 'B', 'def', 'NJ',
      'Civil Rights moves up one place. Whoever leads Civil Rights may add 3 state support anywhere, at most 1 a state.',
      [{ op: 'up', iss: 'cr', n: 1 }, { op: 'add', who: 'lead:cr', n: 3, cap: 1, where: 'any' }]),
    C(38, '“High Hopes”', 2, 2, 'K', 'cr', 'AR',
      'Turn over the top two cards of the Campaign deck one at a time. Each that shows Kennedy’s icon takes effect as if Kennedy had played it as an event.',
      [{ op: 'highHopes' }]),
    C(39, 'Lyndon Johnson', 4, 0, 'K', 'cr', 'CA',
      'Kennedy may add 2 state support in Texas and 3 more in the South, at most 2 a state. If his candidate card is exhausted, he may turn it face up again.',
      [{ op: 'add', who: 'K', n: 2, cap: 2, where: { sts: ['TX'] } }, { op: 'add', who: 'K', n: 3, cap: 2, where: { reg: 'S' } }, { op: 'reclaim', who: 'K' }]),
    C(40, 'Northern Blacks', 3, 1, 'B', 'def', 'MN',
      'Whoever leads Civil Rights may add 5 state support across Illinois, Michigan and New York, at most 2 a state.',
      [{ op: 'add', who: 'lead:cr', n: 5, cap: 2, where: { sts: ['IL', 'MI', 'NY'] } }]),
    C(41, 'Pierre Salinger', 3, 1, 'K', 'cr', 'AL',
      'Kennedy may add 3 issue support to one issue.',
      [{ op: 'issPick', who: 'K', n: 3, one: true }]),
    C(42, 'Henry Cabot Lodge', 4, 0, 'N', 'eco', 'NY',
      'Nixon gains 2 state support in Massachusetts and 2 issue support in Defense. If his candidate card is exhausted, he may turn it face up again.',
      [{ op: 'gain', who: 'N', st: 'MA', n: 2 }, { op: 'iss', who: 'N', iss: 'def', n: 2 }, { op: 'reclaim', who: 'N' }]),
    C(43, 'Catholic Support', 4, 0, 'K', 'eco', 'NY',
      'Kennedy may add 7 state support anywhere, at most 2 a state.',
      [{ op: 'add', who: 'K', n: 7, cap: 2, where: 'any' }]),
    C(44, 'Puerto Rican Bishops', 3, 1, 'N', 'cr', 'NE',
      'Kennedy may not spend momentum for the rest of the turn. Cannot be played once Greater Houston Ministerial Association is in effect.',
      [{ op: 'fx', key: 'noMom', who: 'K' }]),
    C(45, 'Compact of Fifth Avenue', 3, 1, 'N', 'eco', 'MI',
      'Nixon’s candidate moves straight to New York, free. Nixon gains 1 issue support in Civil Rights, 2 state support in New York and 1 media support cube in the East.',
      [{ op: 'tok', who: 'N', st: 'NY' }, { op: 'iss', who: 'N', iss: 'cr', n: 1 }, { op: 'gain', who: 'N', st: 'NY', n: 2 }, { op: 'mediaAt', who: 'N', reg: 'E', n: 1 }]),
    C(46, 'Prime-Time Television', 3, 1, 'B', 'cr', 'AL',
      'Pick one region where you have media support: add 5 state support there, at most 2 a state.',
      [{ op: 'add', who: 'me', n: 5, cap: 2, where: { mediaReg: true } }]),
    C(47, 'The Cold War', 3, 1, 'B', 'def', 'MI',
      'Whoever leads Defense may add 5 state support anywhere, at most 1 a state.',
      [{ op: 'add', who: 'lead:def', n: 5, cap: 1, where: 'any' }]),
    C(48, 'Rising Food Prices', 3, 1, 'N', 'cr', 'IA',
      'Economy moves up one place, and Nixon gains 2 issue support in Economy.',
      [{ op: 'up', iss: 'eco', n: 1 }, { op: 'iss', who: 'N', iss: 'eco', n: 2 }]),
    C(49, 'Eleanor Roosevelt’s Speaking Tour', 3, 1, 'K', 'eco', 'FL',
      'Kennedy may add 5 state support in the Midwest, at most 2 a state.',
      [{ op: 'add', who: 'K', n: 5, cap: 2, where: { reg: 'MW' } }]),
    C(50, 'Industrial Midwest', 3, 1, 'N', 'def', 'IN',
      'Nixon may add 5 state support across Illinois, Indiana, Michigan, Minnesota, Ohio and Wisconsin, at most 2 a state.',
      [{ op: 'add', who: 'N', n: 5, cap: 2, where: { sts: ['IL', 'IN', 'MI', 'MN', 'OH', 'WI'] } }]),
    C(51, 'Missile Gap', 3, 1, 'K', 'eco', 'GA',
      'Kennedy gains 3 issue support in Defense.',
      [{ op: 'iss', who: 'K', iss: 'def', n: 3 }]),
    C(52, 'Hurricane Donna', 2, 2, 'B', 'cr', 'MT',
      'Your candidate moves to Florida, free. You gain 1 momentum and 1 state support in Florida.',
      [{ op: 'tok', who: 'me', st: 'FL' }, { op: 'mom', who: 'me', n: 1 }, { op: 'gain', who: 'me', st: 'FL', n: 1 }]),
    C(53, 'Campaign Headquarters', 2, 2, 'B', 'def', 'NM',
      'Discard as many cards from your hand as you like and draw that many from the Campaign deck.',
      [{ op: 'swap', who: 'me' }]),
    C(54, 'Bobby Kennedy', 2, 2, 'K', 'eco', 'CT',
      'For the rest of the turn every card Kennedy plays is worth 1 more CP (5 at most).',
      [{ op: 'fx', key: 'cpUp', who: 'K' }]),
    C(55, 'Hostile Press Corps', 4, 0, 'K', 'def', 'PA',
      'For the rest of the turn Nixon makes support checks when Campaigning in every state, as if Kennedy carried them all.',
      [{ op: 'fx', key: 'hostile' }]),
    C(56, 'Opposition Research', 4, 0, 'N', 'def', 'OH',
      'Kennedy shows Nixon his hand. Nixon may then spend 3 CP.',
      [{ op: 'oppo' }]),
    C(57, '“A New Frontier”', 2, 2, 'K', 'def', 'RI',
      'Kennedy may discard as many cards from his hand as he likes and draw that many from the Campaign deck.',
      [{ op: 'swap', who: 'K' }]),
    C(58, 'Tricky Dick', 4, 0, 'N', 'def', 'IL',
      'Nixon loses 1 momentum and may take any card from the discard pile and play it at once as an event. No rest cubes for that card.',
      [{ op: 'mom', who: 'N', n: -1 }, { op: 'tricky' }]),
    C(59, 'Mid-Atlantic', 3, 1, 'K', 'cr', 'TN',
      'Kennedy may add 5 state support across Delaware, Maryland, New Jersey, New York and Pennsylvania, at most 2 a state.',
      [{ op: 'add', who: 'K', n: 5, cap: 2, where: { sts: ['DE', 'MD', 'NJ', 'NY', 'PA'] } }]),
    C(60, 'World Series Ends', 3, 1, 'B', 'eco', 'UT',
      'Whoever has media support in the East (if anyone) may add 5 state support in the East, at most 2 a state.',
      [{ op: 'add', who: 'media:E', n: 5, cap: 2, where: { reg: 'E' } }]),
    C(61, 'Fatigue Sets In', 4, 0, 'B', 'cr', 'OH',
      'If your opponent’s candidate card is ready to play, turn it to its Exhausted side.',
      [{ op: 'exhaust', who: 'opp' }]),
    C(62, 'Trial of Gary Powers', 3, 1, 'B', 'eco', 'WI',
      'Defense moves up two places. Whoever leads Defense gains 1 momentum.',
      [{ op: 'up', iss: 'def', n: 2 }, { op: 'mom', who: 'lead:def', n: 1 }]),
    C(63, '“Give Me A Week”', 4, 0, 'K', 'eco', 'OH',
      'Nixon loses 2 momentum and 1 issue support in each issue.',
      [{ op: 'mom', who: 'N', n: -2 }, { op: 'iss', who: 'N', iss: 'each', n: -1 }]),
    C(64, 'Stump Speech', 4, 0, 'B', 'eco', 'OH',
      'If your opponent has more momentum than you, gain enough to draw level.',
      [{ op: 'equal', who: 'me' }]),
    C(65, 'Joe Kennedy', 3, 1, 'K', 'def', 'GA',
      'Nixon may not spend momentum for the rest of the turn.',
      [{ op: 'fx', key: 'noMom', who: 'N' }]),
    C(66, 'Adlai Stevenson', 3, 1, 'K', 'cr', 'MA',
      'Kennedy gains 1 state support in Illinois and may take any card from the discard pile into his hand.',
      [{ op: 'gain', who: 'K', st: 'IL', n: 1 }, { op: 'retrieve', who: 'K' }]),
    C(67, 'Voter Registration Drive', 2, 2, 'B', 'cr', 'WA',
      'Add 3 state support to states where nobody has any support, at most 1 a state.',
      [{ op: 'add', who: 'me', n: 3, cap: 1, where: { empty: true } }]),
    C(68, '“Peace Without Surrender”', 2, 2, 'N', 'def', 'CO',
      'Defense moves up one place, and Nixon gains 1 issue support in Defense.',
      [{ op: 'up', iss: 'def', n: 1 }, { op: 'iss', who: 'N', iss: 'def', n: 1 }]),
    C(69, 'Congressional Summer Session', 4, 0, 'N', 'def', 'PA',
      'Every card Kennedy plays for the rest of the turn is worth 2 CP less (1 at least). Kennedy’s candidate moves at once, free, to Maryland or Virginia (his choice).',
      [{ op: 'fx', key: 'cpDown', who: 'K' }, { op: 'tok', who: 'K', st: ['MD', 'VA'] }]),
    C(70, 'The Old Nixon', 4, 0, 'N', 'eco', 'IL',
      'Nixon loses 1 momentum. Kennedy loses 3 momentum.',
      [{ op: 'mom', who: 'N', n: -1 }, { op: 'mom', who: 'K', n: -3 }]),
    C(71, 'Heartland of America', 3, 1, 'N', 'def', 'NJ',
      'Nixon may add 7 state support to Western and Midwestern states of 10 electoral votes or fewer, at most 1 a state.',
      [{ op: 'add', who: 'N', n: 7, cap: 1, where: { regs: ['W', 'MW'], evMax: 10 } }]),
    C(72, 'Southern Revolt', 3, 1, 'N', 'eco', 'IN',
      'If Kennedy leads Civil Rights, Nixon may add 5 state support in the South, at most 2 a state.',
      [{ op: 'if', cond: { leads: ['K', 'cr'] }, ops: [{ op: 'add', who: 'N', n: 5, cap: 2, where: { reg: 'S' } }] }]),
    C(73, 'Norman Vincent Peale', 3, 1, 'N', 'eco', 'VA',
      'Nixon may take 5 of Kennedy’s state support off anywhere, at most 1 a state. Cannot be played once Greater Houston Ministerial Association is in effect.',
      [{ op: 'sub', by: 'N', from: 'K', n: 5, cap: 1, where: 'any' }]),
    C(74, 'Eisenhower’s Silence', 4, 0, 'K', 'cr', 'IL',
      'For the rest of the turn Nixon may not spend CP Campaigning in any state Kennedy leads. Cannot be played once Dwight D. Eisenhower is in effect.',
      [{ op: 'fx', key: 'ikeSilence' }]),
    C(75, 'Republican TV Spots', 4, 0, 'N', 'cr', 'CA',
      'Nixon’s candidate moves to New York, free. Nixon may place 3 media support cubes.',
      [{ op: 'tok', who: 'N', st: 'NY' }, { op: 'media', who: 'N', n: 3 }]),
    C(76, 'Nixon’s Pledge', 4, 0, 'K', 'def', 'IL',
      'For the rest of the turn Kennedy gains 1 momentum every time Nixon plays a card as anything but a Campaigning action.',
      [{ op: 'fx', key: 'pledge' }]),
    C(77, 'Suburban Voters', 3, 1, 'K', 'eco', 'MN',
      'Kennedy may add 5 state support to states of 20 electoral votes or more, at most 2 a state.',
      [{ op: 'add', who: 'K', n: 5, cap: 2, where: { evMin: 20 } }]),
    C(78, 'Stock Market in Decline', 3, 1, 'B', 'def', 'TN',
      'Economy moves up two places. Whoever leads Economy gains 2 state support in New York.',
      [{ op: 'up', iss: 'eco', n: 2 }, { op: 'gain', who: 'lead:eco', st: 'NY', n: 2 }]),
    C(79, 'Advance Men', 2, 2, 'B', 'eco', 'NV',
      'For the rest of the turn you pay no travel costs, and make no support checks when Campaigning in states your opponent carries or where their candidate is.',
      [{ op: 'fx', key: 'advance', who: 'me' }]),
    C(80, 'Herblock', 2, 2, 'K', 'eco', 'MS',
      'Kennedy may remove 2 of Nixon’s media support cubes from the board.',
      [{ op: 'mediaOff', from: 'N', n: 2 }]),
    C(81, 'Kennedy’s Peace Corps', 3, 1, 'K', 'cr', 'LA',
      'For the rest of the turn Kennedy may preempt events without spending momentum.',
      [{ op: 'fx', key: 'peaceCorps' }]),
    C(82, 'Fidel Castro', 2, 2, 'B', 'eco', 'ID',
      'Whoever leads Defense gains 1 momentum and 1 state support in Florida.',
      [{ op: 'mom', who: 'lead:def', n: 1 }, { op: 'gain', who: 'lead:def', st: 'FL', n: 1 }]),
    C(83, 'Whistlestop', 4, 0, 'B', 'def', 'TX',
      'Spend 7 CP on a Campaigning action, no more than 1 CP in any one state.',
      [{ op: 'whistle', who: 'me' }]),
    C(84, 'Quemoy and Matsu', 3, 1, 'B', 'eco', 'NC',
      'Whoever leads Defense gains 1 momentum and may add 3 state support anywhere, at most 1 a state.',
      [{ op: 'mom', who: 'lead:def', n: 1 }, { op: 'add', who: 'lead:def', n: 3, cap: 1, where: 'any' }]),
    C(85, 'Jackie Kennedy', 3, 1, 'K', 'def', 'NJ',
      'For the rest of the turn Nixon must spend 1 momentum to play a card as an event.',
      [{ op: 'fx', key: 'jackie' }]),
    C(86, 'Herb Klein', 3, 1, 'N', 'cr', 'IA',
      'Nixon may add 3 issue support, split among the issues as he likes.',
      [{ op: 'issPick', who: 'N', n: 3 }]),
    C(87, 'Stevenson Loyalists', 2, 2, 'N', 'def', 'SD',
      'Kennedy may not spend CP Campaigning in the West or the Midwest for the rest of the turn.',
      [{ op: 'fx', key: 'noCamp', who: 'K', regs: ['W', 'MW'] }]),
    C(88, 'Stature Gap', 2, 2, 'N', 'eco', 'VT',
      'Every card Kennedy plays as a Positioning action for the rest of the turn is worth 2 CP less (1 at least).',
      [{ op: 'fx', key: 'stature' }]),
    C(89, 'The New Nixon', 2, 2, 'N', 'eco', 'KS',
      'Nixon gains 1 momentum.',
      [{ op: 'mom', who: 'N', n: 1 }]),
    C(90, 'Recount', 4, 0, 'N', 'cr', 'TX',
      'Election Day: Nixon makes 3 support checks in a state of his choice.',
      [], { persist: 'eday', eday: { who: 'N', st: null, n: 3 } }),
    C(91, 'Political Capital', 2, 2, 'N', 'def', 'OK',
      'Nixon may draw two cards from the Campaign deck.',
      [{ op: 'draw', who: 'N', n: 2 }]),
    C(92, 'Give ’Em Hell Harry', 3, 1, 'N', 'eco', 'NY',
      'If Kennedy leads two or more issues, he loses 1 momentum and must take 2 off his issue support.',
      [{ op: 'if', cond: { multi: 'K' }, ops: [{ op: 'mom', who: 'K', n: -1 }, { op: 'issLose', who: 'K', n: 2 }] }]),
    C(93, '“Experience Counts”', 4, 0, 'N', 'def', 'CA',
      'Kennedy loses 1 issue support in each issue. Nixon gains 1 momentum.',
      [{ op: 'iss', who: 'K', iss: 'each', n: -1 }, { op: 'mom', who: 'N', n: 1 }]),
    C(94, 'A Low Blow', 3, 1, 'K', 'eco', 'IL',
      'If Nixon leads two or more issues, Kennedy gains 1 momentum and may discard as many cards as he likes, drawing that many from the Campaign deck.',
      [{ op: 'if', cond: { multi: 'N' }, ops: [{ op: 'mom', who: 'K', n: 1 }, { op: 'swap', who: 'K' }] }]),
    C(95, '“A Time for Greatness”', 4, 0, 'K', 'cr', 'TX',
      'Nixon loses 1 issue support in each issue. Kennedy may add 3 state support anywhere, at most 1 a state.',
      [{ op: 'iss', who: 'N', iss: 'each', n: -1 }, { op: 'add', who: 'K', n: 3, cap: 1, where: 'any' }]),
    C(96, 'Medal Count', 2, 2, 'B', 'def', 'PA',
      'The leaders of Civil Rights and Economy each lose 1 issue support there. If one player leads both, they also lose 1 momentum.',
      [{ op: 'medal', iss: ['cr', 'eco'] }]),
    C(97, 'Cassius Clay Wins Gold', 2, 2, 'B', 'cr', 'OH',
      'The leaders of Defense and Economy each lose 1 issue support there. If one player leads both, they also lose 1 momentum.',
      [{ op: 'medal', iss: ['def', 'eco'] }])
  ];
  const CARD = {};
  CARDS.forEach(c => { CARD[c.id] = c; });
  /* The candidate cards: 5 CP, played in place of a hand card, then exhausted. */
  const CAND = { K: { id: 'K', name: 'John F. Kennedy', cp: 5 }, N: { id: 'N', name: 'Richard M. Nixon', cp: 5 } };

  /* The endorsement deck: three for each region, four Major (any region). */
  const ENDORSE = [];
  REGIONS.forEach(r => { for (let k = 0; k < 3; k++) ENDORSE.push({ id: 'e' + r + k, reg: r }); });
  for (let k = 0; k < 4; k++) ENDORSE.push({ id: 'em' + k, reg: null });

  /* Names. */
  const issueName = id => ISSUE[id] ? ISSUE[id].name : id;
  const cardName = id => id === 'K' || id === 'N' ? CAND[id].name + ' (candidate card)' : CARD[id] ? CARD[id].name : String(id);
  const plain = s => String(s).replace(/[“”]/g, '').replace(/’/g, '\'');
  const icons = c => c.icon === 'B' ? ['K', 'N'] : [c.icon];
  const benefits = (c, side) => c.icon === 'B' || c.icon === side;

  /* The board arithmetic, as pure functions over plain counts, shared by the
     engine, the house and the phones so a number cannot differ between them. */
  const signOf = side => side === 'K' ? 1 : -1;
  const leadOf = v => v > 0 ? 'K' : v < 0 ? 'N' : null;
  const mine = (v, side) => Math.max(0, v * signOf(side));
  const carried = (v, side) => mine(v, side) >= RULES.carry;
  /* The electoral votes each side leads in right now — a projection, never
     the printed score (the board prints none). Empty states are counted for
     nobody. */
  function leadingEv(states) {
    const out = { K: 0, N: 0, none: 0 };
    STATES.forEach(s => { const l = leadOf(states[s]); if (l) out[l] += STATE[s].ev; else out.none += STATE[s].ev; });
    return out;
  }
  function statesLed(states, reg, side) { return statesIn(reg).filter(s => leadOf(states[s]) === side).length; }

  const MANIFEST = {
    built: [
      'The whole game: nine turns, five activity phases a turn, the Momentum and Campaign Strategy phases, the Debates on turn 6 and Election Day on turn 9.',
      'All 97 campaign cards as events, with the 2017 rule that events adding support make support checks where the opponent carries or stands (media exempts).',
      'Campaigning, travel (Alaska and Hawaii behind their own boundaries), Advertising, Positioning, the candidate cards, triggering and preempting.',
      'The Political Capital bag: support and initiative checks, rest cubes, reseeding, and the Election Day bonus cubes.',
      'Endorsements (the 16-card deck), the issues track and its awards, every rest-of-the-turn card, the two Prevention events.',
      'One phone against the house (Easy, Medium or Hard), or two phones head to head; Restricted Positioning as a lobby option.',
      'How to play: a lesson before each new rule and a coach on your phone, against an Easy house.',
      'The Debates acted out in a baked studio, and Election Night behind the Election Day card and the winner reveal.',
      'The phone installs to the home screen and lays out at 360x500, the decision under your thumb.'
    ],
    notBuilt: [
      'The Vice President cards optional rule.',
      'Phones-only solo (no telly).'
    ],
    decisions: [
      'Events adding state support use the 2017 rule: a support check for each point in a state the opponent carries or where their candidate stands, unless you have media support in that region. Advance Men and Hostile Press Corps speak of Campaigning only, so they do not change an event.',
      'Several rest-of-the-turn changes to CP stack: bonuses first (to 5 at most), then penalties (to 1 at least).',
      'A state campaigned in with support checks is declared once in an action: you draw for all the points you put there at once, and cannot come back to it in the same action.',
      'A candidate who travels into a region and then spends nothing there stops in a state of the player’s choice in it.',
      'Gathering Momentum and Fifty Stars do nothing when the two sides are level.',
      '“High Hopes”: each card turned over that shows Kennedy’s icon is resolved by Kennedy as an event and leaves the game; the others go to the discard pile.',
      'Lyndon Johnson: the 3 extra Southern support may include Texas, at most 2 a state.',
      'Old South: the leader of Civil Rights chooses which of their Southern support to lose.',
      'Give ’Em Hell Harry: Kennedy chooses which issue support to lose.',
      'Tricky Dick: the card taken from the discard pile must be one that could be played as an event now; it is resolved by Nixon and leaves the game.',
      'Opposition Research: Kennedy’s hand is shown to the Nixon player’s phone (and only there) for the rest of the turn; the 3 CP are not a card, so Nixon’s Knee and Nixon’s Pledge do not count them.',
      'Nixon’s Pledge counts every card Nixon plays (the candidate card included) for anything but Campaigning.',
      'A player who must keep a Campaign Strategy card is never offered a play that would leave too few in hand; a player who still ends the turn without one places nothing.',
      'The endorsement deck is reshuffled when it runs out.',
      'Debate events leave the game when the Debates end.',
      'A tie on electoral votes (only possible with Unpledged Electors) goes to whoever won more states, then to more total state support (the 2017 tiebreak).',
      'Season ledger: £10,000 to the winner, and everybody banks £20 an electoral vote won. House players are never banked.'
    ]
  };

  const Data = {
    VERSION, SIDES, SIDE, other, REGIONS, REGION, MOVE_REGIONS, MOVE_EDGES, ISSUES, ISSUE, ISSUE_START,
    STATE, STATES, moveRegionOf, statesIn, statesInMove, travelCost, ZONE, MAP_W, MAP_H, RULES,
    CARDS, CARD, CAND, ENDORSE, issueName, cardName, plain, icons, benefits,
    signOf, leadOf, mine, carried, leadingEv, statesLed, MANIFEST,
    card: id => CARD[id] || null
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.M60Data = Data;
})(typeof window !== 'undefined' ? window : this);
