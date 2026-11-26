'use strict';
/* Twilight Struggle — the data. No DOM, no rules beyond pure arithmetic that
 * the engine, the house and the phone must all agree on (control, costs,
 * scoring), so none of them can disagree (LESSONS-CHECKLIST B).
 *
 * Sources, ranked (ARCHITECTURE.md "Sources"):
 *   1. The printed map and cards as the user's VASSAL module carries them
 *      (Twilight-Struggle-3.2.vmod, "Deluxe Edition"): every country's
 *      stability, battleground flag, region and map position came out of its
 *      buildFile.xml (tools/extract.py), the links between countries out of
 *      its Influence.java, and each card's number, era, Ops, side, star and
 *      scoring flag out of its CardSlot entries. The space race track was read
 *      off the map picture and agrees with the module's CardEvent.java.
 *   2. The published Deluxe rules, from memory where the module is silent
 *      (setup, turn order, scoring). Rulings where the text is silent are in
 *      MANIFEST.decisions.
 * Every line of card text below is written fresh, in our own words: it says
 * what the event does in this game, not what the card says.
 */
(function (root) {
  const VERSION = 1;
  const SIDES = ['SU', 'US'];
  const SIDE = {
    US: { key: 'US', name: 'USA', full: 'the United States', hex: '#3b7be0', ink: '#9cc2ff' },
    SU: { key: 'SU', name: 'USSR', full: 'the Soviet Union', hex: '#d8323a', ink: '#ff9a9e' }
  };
  const other = s => (s === 'US' ? 'SU' : 'US');
  /* Victory points are one number: positive is the USA's lead. */
  const sgn = s => (s === 'US' ? 1 : -1);

  const REGIONS = ['EU', 'AS', 'ME', 'AF', 'CA', 'SA'];
  /* Presence / Domination / Control, as the map prints them. Europe's control
     wins the game outright. */
  const REGION = {
    EU: { key: 'EU', name: 'Europe', p: 3, d: 7, c: 'win', hex: '#8f7fc2' },
    AS: { key: 'AS', name: 'Asia', p: 3, d: 7, c: 9, hex: '#e8923a' },
    ME: { key: 'ME', name: 'Middle East', p: 3, d: 5, c: 7, hex: '#7fb7dd' },
    AF: { key: 'AF', name: 'Africa', p: 1, d: 4, c: 6, hex: '#e5cf7a' },
    CA: { key: 'CA', name: 'Central America', p: 1, d: 3, c: 5, hex: '#c9d77c' },
    SA: { key: 'SA', name: 'South America', p: 2, d: 5, c: 6, hex: '#79b56b' }
  };
  const SUBS = { EE: 'Eastern Europe', WE: 'Western Europe', SEA: 'Southeast Asia' };

  /* [id, printed name, region, stability, battleground, subregions, map x, map y
     (the centre of its box on the module's 5100x3300 map), neighbours]. USA and
     USSR in a neighbour list mean "adjacent to that superpower". Made by
     tools/countries-js.py from the module. */
  const COUNTRY_ROWS = [
  ['Austria', "Austria", 'EU', 4, 0, ['EE','WE'], 2269, 926, ['EGermany','Hungary','Italy','WGermany']],
  ['Benelux', "Benelux", 'EU', 3, 0, ['WE'], 1954, 772, ['UK','WGermany']],
  ['Bulgaria', "Bulgaria", 'EU', 3, 0, ['EE'], 2664, 1079, ['Greece','Turkey']],
  ['Canada', "Canada", 'EU', 4, 0, ['WE'], 937, 794, ['UK','USA']],
  ['Czechoslovakia', "Czechoslovakia", 'EU', 3, 0, ['EE'], 2441, 773, ['EGermany','Hungary','Poland']],
  ['Denmark', "Denmark", 'EU', 3, 0, ['WE'], 2078, 472, ['Sweden','WGermany']],
  ['EGermany', "E. Germany", 'EU', 3, 1, ['EE'], 2254, 626, ['Austria','Czechoslovakia','Poland','WGermany']],
  ['Finland', "Finland", 'EU', 4, 0, ['EE','WE'], 2619, 328, ['Sweden','USSR']],
  ['France', "France", 'EU', 3, 1, ['WE'], 1914, 943, ['Algeria','Italy','SpainPortugal','UK','WGermany']],
  ['Greece', "Greece", 'EU', 2, 0, ['WE'], 2488, 1240, ['Bulgaria','Italy','Turkey','Yugoslavia']],
  ['Hungary', "Hungary", 'EU', 3, 0, ['EE'], 2491, 926, ['Austria','Czechoslovakia','Romania','Yugoslavia']],
  ['Italy', "Italy", 'EU', 2, 1, ['WE'], 2210, 1081, ['Austria','France','Greece','SpainPortugal','Yugoslavia']],
  ['Norway', "Norway", 'EU', 4, 0, ['WE'], 2028, 320, ['Sweden','UK']],
  ['Poland', "Poland", 'EU', 3, 1, ['EE'], 2481, 622, ['Czechoslovakia','EGermany','USSR']],
  ['Romania', "Romania", 'EU', 3, 0, ['EE'], 2712, 924, ['Hungary','Turkey','USSR','Yugoslavia']],
  ['SpainPortugal', "Spain/Portugal", 'EU', 2, 0, ['WE'], 1755, 1160, ['France','Italy','Morocco']],
  ['Sweden', "Sweden", 'EU', 4, 0, ['WE'], 2330, 453, ['Denmark','Finland','Norway']],
  ['Turkey', "Turkey", 'EU', 2, 0, ['WE'], 2885, 1100, ['Bulgaria','Greece','Romania','Syria']],
  ['UK', "U.K.", 'EU', 5, 0, ['WE'], 1785, 612, ['Benelux','Canada','France','Norway']],
  ['WGermany', "W. Germany", 'EU', 4, 1, ['WE'], 2173, 770, ['Austria','Benelux','Denmark','EGermany','France']],
  ['Yugoslavia', "Yugoslavia", 'EU', 3, 0, ['EE'], 2437, 1079, ['Greece','Hungary','Italy','Romania']],
  ['Afghanistan', "Afghanistan", 'AS', 2, 0, [], 3443, 1302, ['Iran','Pakistan','USSR']],
  ['Australia', "Australia", 'AS', 4, 0, [], 4553, 2485, ['Malaysia']],
  ['Burma', "Burma", 'AS', 2, 0, ['SEA'], 3960, 1632, ['India','LaosCambodia']],
  ['India', "India", 'AS', 3, 1, [], 3690, 1602, ['Burma','Pakistan']],
  ['Indonesia', "Indonesia", 'AS', 1, 0, ['SEA'], 4545, 2223, ['Malaysia','Philippines']],
  ['Japan', "Japan", 'AS', 4, 1, [], 4803, 1397, ['Philippines','SKorea','Taiwan','USA']],
  ['LaosCambodia', "Laos/Cambodia", 'AS', 1, 0, ['SEA'], 4173, 1645, ['Burma','Thailand','Vietnam']],
  ['Malaysia', "Malaysia", 'AS', 2, 0, ['SEA'], 4184, 2041, ['Australia','Indonesia','Thailand']],
  ['NKorea', "N. Korea", 'AS', 3, 1, [], 4583, 1095, ['SKorea','USSR']],
  ['Pakistan', "Pakistan", 'AS', 2, 1, [], 3450, 1494, ['Afghanistan','India','Iran']],
  ['Philippines', "Philippines", 'AS', 2, 0, ['SEA'], 4630, 1802, ['Indonesia','Japan']],
  ['SKorea', "S. Korea", 'AS', 3, 1, [], 4629, 1246, ['Japan','NKorea','Taiwan']],
  ['Taiwan', "Taiwan", 'AS', 3, 0, [], 4533, 1572, ['Japan','SKorea']],
  ['Thailand', "Thailand", 'AS', 2, 1, ['SEA'], 4082, 1804, ['LaosCambodia','Malaysia','Vietnam']],
  ['Vietnam', "Vietnam", 'AS', 1, 0, ['SEA'], 4304, 1811, ['LaosCambodia','Thailand']],
  ['Egypt', "Egypt", 'ME', 2, 1, [], 2614, 1547, ['Israel','Libya','Sudan']],
  ['GulfStates', "Gulf States", 'ME', 3, 0, [], 3110, 1543, ['Iraq','SaudiArabia']],
  ['Iran', "Iran", 'ME', 2, 1, [], 3186, 1401, ['Afghanistan','Iraq','Pakistan']],
  ['Iraq', "Iraq", 'ME', 3, 1, [], 2972, 1399, ['GulfStates','Iran','Jordan','SaudiArabia']],
  ['Israel', "Israel", 'ME', 4, 1, [], 2719, 1399, ['Egypt','Jordan','Lebanon','Syria']],
  ['Jordan', "Jordan", 'ME', 2, 0, [], 2861, 1560, ['Iraq','Israel','Lebanon','SaudiArabia']],
  ['Lebanon', "Lebanon", 'ME', 1, 0, [], 2756, 1247, ['Israel','Jordan','Syria']],
  ['Libya', "Libya", 'ME', 2, 1, [], 2388, 1535, ['Egypt','Tunisia']],
  ['SaudiArabia', "Saudi Arabia", 'ME', 3, 1, [], 3048, 1697, ['GulfStates','Iraq','Jordan']],
  ['Syria', "Syria", 'ME', 2, 0, [], 2971, 1241, ['Israel','Lebanon','Turkey']],
  ['Algeria', "Algeria", 'AF', 2, 1, [], 2035, 1377, ['France','Morocco','SaharanStates','Tunisia']],
  ['Angola', "Angola", 'AF', 1, 1, [], 2378, 2334, ['Botswana','SouthAfrica','Zaire']],
  ['Botswana', "Botswana", 'AF', 2, 0, [], 2576, 2571, ['Angola','SouthAfrica','Zimbabwe']],
  ['Cameroon', "Cameroon", 'AF', 1, 0, [], 2311, 2084, ['Nigeria','Zaire']],
  ['Ethiopia', "Ethiopia", 'AF', 1, 0, [], 2811, 1890, ['Somalia','Sudan']],
  ['IvoryCoast', "Ivory Coast", 'AF', 2, 0, [], 1936, 1927, ['Nigeria','WestAfricanStates']],
  ['Kenya', "Kenya", 'AF', 2, 0, [], 2835, 2081, ['SEAfricanStates','Somalia']],
  ['Morocco', "Morocco", 'AF', 3, 0, [], 1815, 1444, ['Algeria','SpainPortugal','WestAfricanStates']],
  ['Nigeria', "Nigeria", 'AF', 1, 1, [], 2209, 1908, ['Cameroon','IvoryCoast','SaharanStates']],
  ['SEAfricanStates', "SE African States", 'AF', 1, 0, [], 2866, 2300, ['Kenya','Zimbabwe']],
  ['SaharanStates', "Saharan States", 'AF', 1, 0, [], 2125, 1700, ['Algeria','Nigeria']],
  ['Somalia', "Somalia", 'AF', 2, 0, [], 3053, 1957, ['Ethiopia','Kenya']],
  ['SouthAfrica', "South Africa", 'AF', 3, 1, [], 2471, 2736, ['Angola','Botswana']],
  ['Sudan', "Sudan", 'AF', 1, 0, [], 2653, 1731, ['Egypt','Ethiopia']],
  ['Tunisia', "Tunisia", 'AF', 2, 0, [], 2263, 1360, ['Algeria','Libya']],
  ['WestAfricanStates', "West African States", 'AF', 2, 0, [], 1794, 1640, ['IvoryCoast','Morocco']],
  ['Zaire', "Zaire", 'AF', 1, 1, [], 2572, 2155, ['Angola','Cameroon','Zimbabwe']],
  ['Zimbabwe', "Zimbabwe", 'AF', 1, 0, [], 2648, 2412, ['Botswana','SEAfricanStates','Zaire']],
  ['CostaRica', "Costa Rica", 'CA', 3, 0, [], 595, 1871, ['Honduras','Nicaragua','Panama']],
  ['Cuba', "Cuba", 'CA', 3, 1, [], 850, 1524, ['Haiti','Nicaragua','USA']],
  ['DominicanRep', "Dominican Rep", 'CA', 1, 0, [], 1283, 1661, ['Haiti']],
  ['ElSalvador', "El Salvador", 'CA', 1, 0, [], 394, 1729, ['Guatemala','Honduras']],
  ['Guatemala', "Guatemala", 'CA', 1, 0, [], 464, 1568, ['ElSalvador','Honduras','Mexico']],
  ['Haiti', "Haiti", 'CA', 1, 0, [], 1067, 1663, ['Cuba','DominicanRep']],
  ['Honduras', "Honduras", 'CA', 2, 0, [], 616, 1718, ['CostaRica','ElSalvador','Guatemala','Nicaragua']],
  ['Mexico', "Mexico", 'CA', 2, 1, [], 274, 1412, ['Guatemala','USA']],
  ['Nicaragua', "Nicaragua", 'CA', 1, 0, [], 837, 1719, ['CostaRica','Cuba','Honduras']],
  ['Panama', "Panama", 'CA', 2, 1, [], 841, 1874, ['Colombia','CostaRica']],
  ['Argentina', "Argentina", 'SA', 2, 1, [], 1060, 2906, ['Chile','Paraguay','Uruguay']],
  ['Bolivia', "Bolivia", 'SA', 2, 0, [], 1105, 2429, ['Paraguay','Peru']],
  ['Brazil', "Brazil", 'SA', 2, 1, [], 1483, 2275, ['Uruguay','Venezuela']],
  ['Chile', "Chile", 'SA', 3, 1, [], 986, 2612, ['Argentina','Peru']],
  ['Colombia', "Colombia", 'SA', 1, 0, [], 982, 2058, ['Ecuador','Panama','Venezuela']],
  ['Ecuador', "Ecuador", 'SA', 2, 0, [], 751, 2125, ['Colombia','Peru']],
  ['Paraguay', "Paraguay", 'SA', 2, 0, [], 1234, 2592, ['Argentina','Bolivia','Uruguay']],
  ['Peru', "Peru", 'SA', 2, 0, [], 876, 2291, ['Bolivia','Chile','Ecuador']],
  ['Uruguay', "Uruguay", 'SA', 2, 0, [], 1301, 2788, ['Argentina','Brazil','Paraguay']],
  ['Venezuela', "Venezuela", 'SA', 2, 1, [], 1103, 1893, ['Brazil','Colombia']]
  ];
  const COUNTRY = {};
  const COUNTRIES = COUNTRY_ROWS.map(([id, name, reg, stab, bg, subs, x, y, adj]) => {
    COUNTRY[id] = { id, name, reg, stab, bg: !!bg, subs, x, y,
      adj: adj.filter(a => a !== 'USA' && a !== 'USSR'),
      sup: adj.indexOf('USA') >= 0 ? 'US' : adj.indexOf('USSR') >= 0 ? 'SU' : null };
    return id;
  });
  const inReg = r => COUNTRIES.filter(c => r === 'SEA' || r === 'EE' || r === 'WE' ? COUNTRY[c].subs.indexOf(r) >= 0 : COUNTRY[c].reg === r);
  const inWhere = (c, where) => !where || (where === 'SEA' || where === 'EE' || where === 'WE' ? COUNTRY[c].subs.indexOf(where) >= 0 : COUNTRY[c].reg === where);

  /* The board at the start (Deluxe setup). The open placements come after:
     USSR 6 anywhere in Eastern Europe, then the USA 7 in Western Europe. */
  const SETUP = {
    SU: { Syria: 1, Iraq: 1, NKorea: 3, EGermany: 3, Finland: 1 },
    US: { Canada: 2, Iran: 1, Israel: 1, Japan: 1, Australia: 4, Philippines: 1, SKorea: 1, Panama: 1, SouthAfrica: 1, UK: 5 },
    free: { SU: { n: 6, where: 'EE' }, US: { n: 7, where: 'WE' } }
  };

  /* The space race track, read off the map: [name, ops needed, highest roll
     that succeeds, VP to the first there, VP to the second, the advantage]. */
  const SPACE = [
    { name: 'Start', ops: 0, roll: 0, vp: [0, 0] },
    { name: 'Earth Satellite', ops: 2, roll: 3, vp: [2, 1] },
    { name: 'Animal in Space', ops: 2, roll: 4, vp: [0, 0], adv: 'Two space race attempts a turn' },
    { name: 'Man in Space', ops: 2, roll: 3, vp: [2, 0] },
    { name: 'Man in Earth Orbit', ops: 2, roll: 4, vp: [0, 0], adv: 'The other side shows its headline first' },
    { name: 'Lunar Orbit', ops: 3, roll: 3, vp: [3, 1] },
    { name: 'Eagle/Bear has Landed', ops: 3, roll: 4, vp: [0, 0], adv: 'May discard one held card at the end of each turn' },
    { name: 'Space Shuttle', ops: 3, roll: 3, vp: [4, 2] },
    { name: 'Space Station', ops: 4, roll: 2, vp: [2, 0], adv: 'May take an eighth action round each turn' }
  ];

  const RULES = {
    turns: 10, hand: t => (t <= 3 ? 8 : 9), rounds: t => (t <= 3 ? 6 : 7),
    midTurn: 4, lateTurn: 8, vpWin: 20, defconStart: 5
  };
  const ERA = { E: 'Early War', M: 'Mid War', L: 'Late War' };

  /* ================================================================
     The cards. [number, name, Ops, side (US, SU, N for both), era, starred
     (removed once its event happens), scoring region or null, optional card,
     our text]. Number, name, era, Ops, side, star and scoring come off the
     module's card list; the text is ours.
     ================================================================ */
  const CARD_ROWS = [
    [1, 'Asia Scoring', 0, 'N', 'E', 0, 'AS', 0, 'Score Asia: Presence 3, Domination 7, Control 9; +1 a battleground you control there, +1 a country you control next to the other superpower.'],
    [2, 'Europe Scoring', 0, 'N', 'E', 0, 'EU', 0, 'Score Europe: Presence 3, Domination 7, and Control wins the game; +1 a battleground, +1 a country next to the other superpower.'],
    [3, 'Middle East Scoring', 0, 'N', 'E', 0, 'ME', 0, 'Score the Middle East: Presence 3, Domination 5, Control 7; +1 a battleground, +1 a country next to the other superpower.'],
    [4, 'Duck and Cover', 3, 'US', 'E', 0, null, 0, 'DEFCON drops one step. Then the USA gains VP equal to 5 minus the new DEFCON.'],
    [5, 'Five Year Plan', 3, 'US', 'E', 0, null, 0, 'The USSR discards a card at random. If it carries a US event, that event happens now; anything else is simply discarded.'],
    [6, 'The China Card', 4, 'N', 'E', 0, null, 0, 'Played for Ops only, never as an event or a headline: 4 Ops, 5 if every Op is spent in Asia. Then it goes face down to the other side. Its holder after turn 10 gains 1 VP.'],
    [7, 'Socialist Governments', 3, 'SU', 'E', 0, null, 0, 'Take 3 US influence out of Western Europe, no more than 2 from any one country. Not as an event while The Iron Lady is in effect.'],
    [8, 'Fidel', 2, 'SU', 'E', 1, null, 0, 'All US influence leaves Cuba, and the USSR adds just enough influence to control it.'],
    [9, 'Vietnam Revolts', 2, 'SU', 'E', 1, null, 0, 'The USSR adds 2 influence to Vietnam. For the rest of the turn a USSR card spent wholly in Southeast Asia gets +1 Op.'],
    [10, 'Blockade', 1, 'SU', 'E', 1, null, 0, 'The USA must discard a card worth 3 or more Ops, or lose all its influence in West Germany.'],
    [11, 'Korean War', 2, 'SU', 'E', 1, null, 0, 'North Korea invades the South. Roll: 4-6 wins (less 1 for each US-controlled neighbour of South Korea): USSR +2 VP and takes over the US influence there. USSR +2 military ops either way.'],
    [12, 'Romanian Abdication', 1, 'SU', 'E', 1, null, 0, 'All US influence leaves Romania, and the USSR adds just enough to control it.'],
    [13, 'Arab-Israeli War', 2, 'SU', 'E', 0, null, 0, 'An invasion of Israel. Roll: 4-6 wins (less 1 for Israel itself and each neighbour the USA controls): USSR +2 VP and takes over the US influence in Israel. USSR +2 military ops. Not as an event after Camp David.'],
    [14, 'COMECON', 3, 'SU', 'E', 1, null, 0, 'The USSR adds 1 influence to each of 4 countries in Eastern Europe that the USA does not control.'],
    [15, 'Nasser', 1, 'SU', 'E', 1, null, 0, 'The USSR adds 2 influence to Egypt, and half the US influence there (rounded up) is removed.'],
    [16, 'Warsaw Pact Formed', 3, 'SU', 'E', 1, null, 0, 'Either clear all US influence from 4 Eastern European countries, or add 5 USSR influence there, at most 2 a country. NATO becomes playable.'],
    [17, 'De Gaulle Leads France', 3, 'SU', 'E', 1, null, 0, 'Remove 2 US influence from France and add 1 USSR. NATO no longer protects France.'],
    [18, 'Captured Nazi Scientist', 1, 'N', 'E', 1, null, 0, 'Whoever plays it moves one box up the space race, with that box’s VP.'],
    [19, 'Truman Doctrine', 1, 'US', 'E', 1, null, 0, 'Clear all USSR influence from one uncontrolled country in Europe.'],
    [20, 'Olympic Games', 2, 'N', 'E', 0, null, 0, 'The player hosts; the other side takes part or boycotts. Taking part: both roll, the host +2, ties rolled again, the winner gains 2 VP. A boycott: DEFCON drops one, and the host spends 4 Ops.'],
    [21, 'NATO', 4, 'US', 'E', 1, null, 0, 'Only after the Marshall Plan or the Warsaw Pact. The USSR may no longer coup or realign in European countries the USA controls.'],
    [22, 'Independent Reds', 2, 'US', 'E', 1, null, 0, 'In one of Yugoslavia, Romania, Bulgaria, Hungary or Czechoslovakia, raise US influence to match the USSR’s.'],
    [23, 'Marshall Plan', 4, 'US', 'E', 1, null, 0, 'The USA adds 1 influence to each of 7 Western European countries the USSR does not control. NATO becomes playable.'],
    [24, 'Indo-Pakistani War', 2, 'N', 'E', 0, null, 0, 'India or Pakistan invades the other. Roll: 4-6 wins (less 1 for each neighbour of the target the enemy controls): +2 VP and the enemy’s influence there becomes yours. +2 military ops.'],
    [25, 'Containment', 3, 'US', 'E', 1, null, 0, 'For the rest of the turn every card the USA plays for Ops is worth 1 more, up to 4.'],
    [26, 'CIA Created', 1, 'US', 'E', 1, null, 0, 'The USSR shows its hand to the USA for the rest of the turn. Then the USA spends 1 Op.'],
    [27, 'US/Japan Mutual Defense Pact', 4, 'US', 'E', 1, null, 0, 'The USA adds enough influence to control Japan, and the USSR may no longer coup or realign there.'],
    [28, 'Suez Crisis', 3, 'SU', 'E', 1, null, 0, 'Remove 4 US influence from France, the UK and Israel together, no more than 2 from any one.'],
    [29, 'East European Unrest', 3, 'US', 'E', 0, null, 0, 'Remove 1 USSR influence from each of 3 Eastern European countries; in the Late War, 2 from each.'],
    [30, 'Decolonization', 2, 'SU', 'E', 0, null, 0, 'The USSR adds 1 influence to each of 4 countries in Africa or Southeast Asia.'],
    [31, 'Red Scare/Purge', 4, 'N', 'E', 0, null, 0, 'For the rest of the turn every card the other side plays for Ops is worth 1 less (never below 1).'],
    [32, 'UN Intervention', 1, 'N', 'E', 0, null, 0, 'Play it with one of the other side’s cards from your hand: you spend that card’s Ops and its event never happens. Not as a headline.'],
    [33, 'De-Stalinization', 3, 'SU', 'E', 1, null, 0, 'The USSR may move up to 4 of its influence to countries the USA does not control, no more than 2 into any one.'],
    [34, 'Nuclear Test Ban', 4, 'N', 'E', 0, null, 0, 'The player gains VP equal to DEFCON minus 2, then DEFCON improves by 2.'],
    [35, 'Formosan Resolution', 2, 'US', 'E', 1, null, 0, 'While it lasts, Taiwan counts as a battleground for scoring whenever the USA controls it. Ends when the USA plays the China Card.'],
    [36, 'Brush War', 3, 'N', 'M', 0, null, 0, 'Attack a country of stability 1 or 2. Roll: 3-6 wins (less 1 for each neighbour the enemy controls): +1 VP and the enemy’s influence there becomes yours. +3 military ops.'],
    [37, 'Central America Scoring', 0, 'N', 'M', 0, 'CA', 0, 'Score Central America: Presence 1, Domination 3, Control 5; +1 a battleground, +1 a country next to the other superpower.'],
    [38, 'Southeast Asia Scoring', 0, 'N', 'M', 1, 'SEA', 0, 'Score Southeast Asia once: 1 VP for each of Burma, Laos/Cambodia, Vietnam, Malaysia, Indonesia and the Philippines you control, 2 for Thailand.'],
    [39, 'Arms Race', 3, 'N', 'M', 0, null, 0, 'If you have more military ops than the other side, +1 VP; +3 instead if you have also met this turn’s requirement.'],
    [40, 'Cuban Missile Crisis', 3, 'N', 'M', 1, null, 0, 'DEFCON goes to 2. For the rest of the turn any coup by the other side ends the game in their defeat, unless they defuse it first by taking 2 of their influence out of Cuba (USSR) or West Germany or Turkey (USA).'],
    [41, 'Nuclear Subs', 2, 'US', 'M', 1, null, 0, 'For the rest of the turn US coups in battlegrounds do not lower DEFCON.'],
    [42, 'Quagmire', 3, 'SU', 'M', 1, null, 0, 'From its next action round the USA is stuck: each round it must discard a card worth 2+ Ops and roll 1-4 to get out. Cancels NORAD.'],
    [43, 'SALT Negotiations', 3, 'N', 'M', 1, null, 0, 'DEFCON improves by 2. For the rest of the turn every coup rolls 1 lower. The player may take a non-scoring card from the discards into hand.'],
    [44, 'Bear Trap', 3, 'US', 'M', 1, null, 0, 'From its next action round the USSR is stuck: each round it must discard a card worth 2+ Ops and roll 1-4 to get out.'],
    [45, 'Summit', 1, 'N', 'M', 0, null, 0, 'Both sides roll, +1 for each region they dominate or control. The higher roll gains 2 VP and may move DEFCON one step either way. A tie does nothing.'],
    [46, 'How I Learned to Stop Worrying', 2, 'N', 'M', 1, null, 0, 'The player sets DEFCON to any level and gains 5 military ops.'],
    [47, 'Junta', 2, 'N', 'M', 0, null, 0, 'Add 2 influence to one country in Central or South America, then you may coup or realign there with this card’s Ops.'],
    [48, 'Kitchen Debates', 1, 'US', 'M', 1, null, 0, 'If the USA controls more battlegrounds than the USSR, it gains 2 VP.'],
    [49, 'Missile Envy', 2, 'N', 'M', 0, null, 0, 'Swap this card for the other side’s highest-Ops card. If that card’s event is yours or both sides’, it happens now; otherwise you spend its Ops. They must play Missile Envy for Ops in their next round.'],
    [50, '“We Will Bury You”', 4, 'SU', 'M', 1, null, 0, 'DEFCON drops one step. Unless the USA plays UN Intervention as an event in its next round, the USSR gains 3 VP first.'],
    [51, 'Brezhnev Doctrine', 3, 'SU', 'M', 1, null, 0, 'For the rest of the turn every card the USSR plays for Ops is worth 1 more, up to 4.'],
    [52, 'Portuguese Empire Crumbles', 2, 'SU', 'M', 1, null, 0, 'The USSR adds 2 influence to SE African States and 2 to Angola.'],
    [53, 'South African Unrest', 2, 'SU', 'M', 0, null, 0, 'The USSR adds 2 influence to South Africa, or 1 there and 2 shared between Angola and Botswana.'],
    [54, 'Allende', 1, 'SU', 'M', 1, null, 0, 'The USSR adds 2 influence to Chile.'],
    [55, 'Willy Brandt', 2, 'SU', 'M', 1, null, 0, 'USSR +1 VP and 1 influence in West Germany; NATO no longer protects West Germany. Not as an event after Tear Down This Wall.'],
    [56, 'Muslim Revolution', 4, 'SU', 'M', 0, null, 0, 'Clear all US influence from 2 of Sudan, Iran, Iraq, Egypt, Libya, Saudi Arabia, Syria and Jordan. Not as an event after the AWACS sale.'],
    [57, 'ABM Treaty', 4, 'N', 'M', 0, null, 0, 'DEFCON improves by 1, then the player spends 4 Ops.'],
    [58, 'Cultural Revolution', 3, 'SU', 'M', 1, null, 0, 'If the USA holds the China Card, the USSR takes it face up; if the USSR already has it, +1 VP instead.'],
    [59, 'Flower Power', 4, 'SU', 'M', 1, null, 0, 'From now on the USSR gains 2 VP each time the USA plays a war card as an event (Arab-Israeli, Korean, Brush, Indo-Pakistani, Iran-Iraq). Ends with An Evil Empire.'],
    [60, 'U2 Incident', 3, 'SU', 'M', 1, null, 0, 'USSR +1 VP, and +1 more if UN Intervention is played as an event later this turn.'],
    [61, 'OPEC', 3, 'SU', 'M', 0, null, 0, 'USSR +1 VP for each of Egypt, Iran, Libya, Saudi Arabia, Iraq, the Gulf States and Venezuela it controls. Not as an event after North Sea Oil.'],
    [62, '“Lone Gunman”', 1, 'SU', 'M', 1, null, 0, 'The USA shows its hand to the USSR for the rest of the turn. Then the USSR spends 1 Op.'],
    [63, 'Colonial Rear Guards', 2, 'US', 'M', 0, null, 0, 'The USA adds 1 influence to each of 4 countries in Africa or Southeast Asia.'],
    [64, 'Panama Canal Returned', 1, 'US', 'M', 1, null, 0, 'The USA adds 1 influence each to Panama, Costa Rica and Venezuela.'],
    [65, 'Camp David Accords', 2, 'US', 'M', 1, null, 0, 'USA +1 VP and 1 influence each in Israel, Jordan and Egypt. The Arab-Israeli War can no longer be played as an event.'],
    [66, 'Puppet Governments', 2, 'US', 'M', 1, null, 0, 'The USA adds 1 influence to each of 3 countries where neither side has any.'],
    [67, 'Grain Sales to Soviets', 2, 'US', 'M', 0, null, 0, 'The USA draws a random card from the USSR’s hand and may play it; if it gives it back (or there is none), the USA spends this card’s Ops.'],
    [68, 'John Paul II Elected Pope', 2, 'US', 'M', 1, null, 0, 'Remove 2 USSR influence from Poland and add 1 US. Solidarity becomes playable.'],
    [69, 'Latin American Death Squads', 2, 'N', 'M', 0, null, 0, 'For the rest of the turn your coups in Central and South America roll 1 higher, and the other side’s roll 1 lower.'],
    [70, 'OAS Founded', 1, 'US', 'M', 1, null, 0, 'The USA adds 2 influence in Central and/or South America.'],
    [71, 'Nixon Plays the China Card', 2, 'US', 'M', 1, null, 0, 'If the USA holds the China Card, +2 VP; otherwise the USA takes it, face down for the rest of this turn.'],
    [72, 'Sadat Expels Soviets', 1, 'US', 'M', 1, null, 0, 'Clear all USSR influence from Egypt and add 1 US.'],
    [73, 'Shuttle Diplomacy', 3, 'US', 'M', 0, null, 0, 'Kept in front of the USA until the next Middle East or Asia scoring card: there the USSR counts one battleground fewer. Then it is discarded.'],
    [74, 'The Voice of America', 2, 'US', 'M', 0, null, 0, 'Remove 4 USSR influence from countries outside Europe, no more than 2 from any one.'],
    [75, 'Liberation Theology', 2, 'SU', 'M', 0, null, 0, 'The USSR adds 3 influence in Central America, no more than 2 to any one country.'],
    [76, 'Ussuri River Skirmish', 3, 'US', 'M', 1, null, 0, 'If the USSR holds the China Card, the USA takes it face up; if the USA has it already, it adds 4 influence in Asia instead, no more than 2 a country.'],
    [77, '“Ask Not What Your Country Can Do For You”', 3, 'US', 'M', 1, null, 0, 'The USA may discard any of its hand (not the China Card) and draw that many again.'],
    [78, 'Alliance for Progress', 3, 'US', 'M', 1, null, 0, 'USA +1 VP for each battleground it controls in Central and South America.'],
    [79, 'Africa Scoring', 0, 'N', 'M', 0, 'AF', 0, 'Score Africa: Presence 1, Domination 4, Control 6; +1 a battleground you control there.'],
    [80, '“One Small Step”', 2, 'N', 'M', 0, null, 0, 'If you are behind in the space race, jump two boxes, gaining only the second box’s VP.'],
    [81, 'South America Scoring', 0, 'N', 'M', 0, 'SA', 0, 'Score South America: Presence 2, Domination 5, Control 6; +1 a battleground you control there.'],
    [82, 'Iranian Hostage Crisis', 3, 'SU', 'L', 1, null, 0, 'Clear all US influence from Iran and add 2 USSR. Terrorism hits the USA twice as hard from now on.'],
    [83, 'The Iron Lady', 3, 'US', 'L', 1, null, 0, 'USA +1 VP; the USSR adds 1 influence to Argentina and loses all its influence in the UK. Socialist Governments can no longer be played as an event.'],
    [84, 'Reagan Bombs Libya', 2, 'US', 'L', 1, null, 0, 'USA +1 VP for every 2 USSR influence in Libya.'],
    [85, 'Star Wars', 2, 'US', 'L', 1, null, 0, 'Only if the USA leads the space race: it picks any non-scoring card from the discards and its event happens now.'],
    [86, 'North Sea Oil', 3, 'US', 'L', 1, null, 0, 'OPEC can no longer be played as an event, and the USA may take an eighth action round this turn.'],
    [87, 'The Reformer', 3, 'SU', 'L', 1, null, 0, 'The USSR adds 4 influence in Europe, 6 if it leads on VP, no more than 2 a country. The USSR may never again coup in Europe. Glasnost gets stronger.'],
    [88, 'Marine Barracks Bombing', 2, 'SU', 'L', 1, null, 0, 'Clear all US influence from Lebanon and remove 2 more US influence anywhere in the Middle East.'],
    [89, 'Soviets Shoot Down KAL-007', 4, 'US', 'L', 1, null, 0, 'DEFCON drops one step and the USA gains 2 VP. If the USA controls South Korea it then spends 4 Ops on influence or realignment.'],
    [90, 'Glasnost', 4, 'SU', 'L', 1, null, 0, 'USSR +2 VP and DEFCON improves by 1. With The Reformer in effect, the USSR also spends 4 Ops on influence or realignment.'],
    [91, 'Ortega Elected in Nicaragua', 2, 'SU', 'L', 1, null, 0, 'Clear all US influence from Nicaragua; the USSR may then coup a neighbour of Nicaragua with this card’s Ops for free.'],
    [92, 'Terrorism', 2, 'N', 'L', 0, null, 0, 'The other side discards a card at random (two if it is the USA and the Iranian Hostage Crisis happened). Its event does not happen.'],
    [93, 'Iran-Contra Scandal', 2, 'SU', 'L', 1, null, 0, 'For the rest of the turn US realignment rolls are 1 lower.'],
    [94, 'Chernobyl', 3, 'US', 'L', 1, null, 0, 'The USA names a region: for the rest of the turn the USSR cannot place influence there with Ops.'],
    [95, 'Latin American Debt Crisis', 2, 'SU', 'L', 0, null, 0, 'The USA must discard a card worth 3 or more Ops, or the USSR doubles its influence in 2 South American countries.'],
    [96, 'Tear Down This Wall', 3, 'US', 'L', 1, null, 0, 'The USA adds 3 influence to East Germany and may then coup or realign in Europe with this card’s Ops for free. Cancels Willy Brandt.'],
    [97, '“An Evil Empire”', 3, 'US', 'L', 1, null, 0, 'USA +1 VP. Flower Power ends and cannot be played.'],
    [98, 'Aldrich Ames Remix', 3, 'SU', 'L', 1, null, 0, 'The USA shows its hand for the rest of the turn, and the USSR picks one card from it to discard.'],
    [99, 'Pershing II Deployed', 3, 'SU', 'L', 1, null, 0, 'USSR +1 VP, and 1 US influence comes off each of up to 3 Western European countries.'],
    [100, 'Wargames', 4, 'N', 'L', 1, null, 0, 'Only at DEFCON 2: the player may end the game at once by giving the other side 6 VP; whoever then leads wins.'],
    [101, 'Solidarity', 2, 'US', 'L', 1, null, 0, 'Only after John Paul II: the USA adds 3 influence to Poland.'],
    [102, 'Iran-Iraq War', 2, 'N', 'L', 1, null, 0, 'Iran or Iraq invades the other. Roll: 4-6 wins (less 1 for each neighbour of the target the enemy controls): +2 VP and the enemy’s influence there becomes yours. +2 military ops.'],
    [103, 'Defectors', 2, 'US', 'E', 0, null, 0, 'As the US headline it cancels the USSR’s headline. Played by the USSR in its own action round (not to space), the USA gains 1 VP.'],
    [104, 'The Cambridge Five', 2, 'SU', 'E', 0, null, 1, 'The USA shows the scoring cards in its hand; the USSR may add 1 influence in one region named on them. Not as an event in the Late War.'],
    [105, 'Special Relationship', 2, 'US', 'E', 0, null, 1, 'If the USA controls the UK: with NATO, 2 influence anywhere in Western Europe and +2 VP; without, 1 influence next to the UK.'],
    [106, 'NORAD', 3, 'US', 'E', 1, null, 1, 'While the USA controls Canada, each time DEFCON falls to 2 in an action round the USA adds 1 influence where it already has some. Ends with Quagmire.'],
    [107, 'Che', 3, 'SU', 'M', 0, null, 1, 'The USSR may coup a non-battleground in Central or South America or Africa with this card’s Ops; if that removes US influence, a second coup elsewhere is allowed.'],
    [108, 'Our Man in Tehran', 2, 'US', 'M', 1, null, 1, 'If the USA controls a Middle Eastern country, it turns over the top 5 cards, discards any it likes and shuffles the rest back.'],
    [109, 'Yuri and Samantha', 2, 'SU', 'L', 1, null, 1, 'For the rest of the turn the USSR gains 1 VP for every US coup.'],
    [110, 'AWACS Sale to Saudis', 3, 'US', 'L', 1, null, 1, 'The USA adds 2 influence to Saudi Arabia. Muslim Revolution can no longer be played as an event.']
  ];
  const CARD = {};
  const CARDS = CARD_ROWS.map(([id, name, ops, side, era, star, score, opt, text]) => {
    CARD[id] = { id, name, ops, side, era, star: !!star, score, opt: !!opt, text };
    return id;
  });
  const CHINA = 6;
  /* Short names for spines and the narrow phone. */
  const SHORT = { 27: 'US/Japan Pact', 77: 'Ask Not', 89: 'KAL-007', 50: 'We Will Bury You', 46: 'How I Learned…', 52: 'Portuguese Empire', 95: 'Latin Am. Debt Crisis', 69: 'Death Squads', 91: 'Ortega in Nicaragua', 110: 'AWACS Sale', 68: 'John Paul II', 71: 'Nixon/China Card', 65: 'Camp David', 33: 'De-Stalinization' };
  const shortName = id => SHORT[id] || (CARD[id] ? CARD[id].name.replace(/[“”]/g, '') : '?');
  /* The war cards Flower Power counts. */
  const WARS = [11, 13, 24, 36, 102];

  /* ================================================================
     Board arithmetic — shared by engine, house and phone.
     inf is { country: { US, SU } }.
     ================================================================ */
  const infOf = (inf, c, s) => (inf[c] ? inf[c][s] || 0 : 0);
  /* Control: at least the stability, and ahead by at least the stability. */
  function ctrl(inf, c) {
    const st = COUNTRY[c].stab, u = infOf(inf, c, 'US'), v = infOf(inf, c, 'SU');
    if (u >= st && u - v >= st) return 'US';
    if (v >= st && v - u >= st) return 'SU';
    return null;
  }
  /* What `side` pays to add k more influence, one at a time (2 for each point
     added while the other side controls it). */
  function addCost(inf, c, side, k) {
    let u = infOf(inf, c, 'US'), v = infOf(inf, c, 'SU'), cost = 0;
    const st = COUNTRY[c].stab;
    for (let j = 0; j < k; j++) {
      const opp = side === 'US' ? v : u, me = side === 'US' ? u : v;
      cost += (opp >= st && opp - me >= st) ? 2 : 1;
      if (side === 'US') u++; else v++;
    }
    return cost;
  }
  function placeCost(inf, side, map) {
    return Object.keys(map).reduce((t, c) => t + addCost(inf, c, side, map[c] | 0), 0);
  }
  /* The Ops a bonus adds when every point lands in its area (China Card: Asia;
     Vietnam Revolts: Southeast Asia). */
  function bonusFor(bonus, countries) {
    if (!bonus || !countries.length) return 0;
    return bonus.reduce((t, b) => t + (countries.every(c => inWhere(c, b.where)) ? b.n : 0), 0);
  }
  const controlled = (inf, side, list) => (list || COUNTRIES).filter(c => ctrl(inf, c) === side);

  /* Scoring one region (or Southeast Asia). taiwanBg: Formosan Resolution;
     shuttle: Shuttle Diplomacy takes one USSR battleground out of the count.
     Returns { US, SU, net, lv: {US: 'presence'|...}, rows, euroWin }. */
  function scoreRegion(inf, r, o) {
    o = o || {};
    if (r === 'SEA') {
      const out = { US: 0, SU: 0, rows: [], r };
      inReg('SEA').forEach(c => {
        const w = ctrl(inf, c);
        const v = c === 'Thailand' ? 2 : 1;
        if (w) { out[w] += v; out.rows.push({ c, side: w, vp: v }); }
      });
      out.net = out.US - out.SU;
      return out;
    }
    const R = REGION[r];
    const list = inReg(r);
    const isBg = c => COUNTRY[c].bg || (o.taiwanBg && c === 'Taiwan' && ctrl(inf, c) === 'US');
    const bgs = list.filter(isBg);
    const st = {};
    for (const s of SIDES) {
      const mine = list.filter(c => ctrl(inf, c) === s);
      let bg = mine.filter(isBg).length;
      if (s === 'SU' && o.shuttle && bg > 0) bg--;
      st[s] = { n: mine.length - (s === 'SU' && o.shuttle && mine.filter(isBg).length > 0 ? 1 : 0), bg, nonbg: mine.filter(c => !isBg(c)).length,
        adj: mine.filter(c => COUNTRY[c].sup === other(s)).length, list: mine };
    }
    const out = { US: 0, SU: 0, lv: {}, r, bg: {}, adj: {}, euroWin: null };
    for (const s of SIDES) {
      const a = st[s], b = st[other(s)];
      let lv = null;
      if (a.n > 0) lv = 'presence';
      if (a.n > b.n && a.bg > b.bg && a.nonbg > 0) lv = 'domination';
      if (a.n > b.n && a.bg === bgs.length && bgs.length > 0) lv = 'control';
      out.lv[s] = lv;
      let v = lv === 'presence' ? R.p : lv === 'domination' ? R.d : lv === 'control' ? (R.c === 'win' ? 0 : R.c) : 0;
      if (lv === 'control' && R.c === 'win') out.euroWin = s;
      out.bg[s] = a.bg; out.adj[s] = a.adj;
      v += a.bg + a.adj;
      out[s] = v;
    }
    out.net = out.US - out.SU;
    return out;
  }

  /* The DEFCON ban on coups and realignment: 4 Europe, 3 also Asia, 2 also the
     Middle East. */
  function defconBans(defcon, reg) {
    if (reg === 'EU') return defcon <= 4;
    if (reg === 'AS') return defcon <= 3;
    if (reg === 'ME') return defcon <= 2;
    return false;
  }

  const MANIFEST = {
    built: [
      'The whole game for two: ten turns, the Early, Mid and Late War decks, the headline, six or seven action rounds, DEFCON, military operations, the space race and final scoring.',
      'All 103 cards of the Deluxe deck as events, with the seven optional cards (The Cambridge Five to AWACS) as a lobby option.',
      'Influence, coups and realignment with every printed modifier; the China Card with its Asia bonus; DEFCON bans by region.',
      'Every win: 20 VP, control of Europe when it is scored, DEFCON 1 against the player whose turn it was, a scoring card held past the turn, and final scoring.',
      'A house player (Easy, Medium, Hard) for either superpower, deciding from what its own seat can see.',
      'Undo back to the start of your own action round until a die is rolled, a card is drawn or the other side moves.',
      'Play alone on one phone with no telly (solo.html): saved after every move, paused while the screen is away, nothing banked.',
      'How to play: a lesson as each rule first matters, a coach on your phone, an Easy house; three turns, then play on or set up a real game.',
      'Baked scenes of our own: a launch pad at dusk for the space race, a situation room for coups and wars, a desk for the headlines, the DEFCON panel when it falls, a study with a globe behind scoring, and a city skyline behind the winner reveal.'
    ],
    notBuilt: [
      'The Chinese Civil War and other optional rules on the map; the tournament bid of extra US influence.',
      'More baked scenes: the round cards other than scoring, the space race boxes.'
    ],
    decisions: [
      'Ops modifiers (Containment, Brezhnev Doctrine, Red Scare/Purge) also apply to "spend N Ops" events and to the card values Blockade, Quagmire and the Debt Crisis ask for.',
      'A hand revealed by CIA Created, Lone Gunman or Aldrich Ames stays visible to the other phone until the end of the turn.',
      'An optional card that is not in play is set aside; nothing else changes.',
      'Space Station and North Sea Oil give one extra action round at the end of the turn, taken only by the side that has it.',
      'Missile Envy: the card handed over must be played for Ops in its new owner’s next action round; its own event never happens then.',
      'Shuttle Diplomacy works on the next Middle East or Asia scoring card, not on final scoring.',
      'Headlines are resolved highest printed Ops first, the USA first on a tie.',
      'Cuban Missile Crisis can be defused at the start of your own action round, before you choose a card.',
      'Quagmire and Bear Trap: the stuck side may play a scoring card instead of discarding; with no card worth 2+ Ops it must play a scoring card if it has one, and otherwise passes the round.',
      'Wargames ends the game at once with no final scoring: whoever leads after the 6 VP wins, and a tie is a draw.'
    ]
  };

  const Data = {
    VERSION, SIDES, SIDE, other, sgn, REGIONS, REGION, SUBS, COUNTRIES, COUNTRY, SETUP, SPACE, RULES, ERA,
    CARDS, CARD, CHINA, WARS, MANIFEST,
    inReg, inWhere, infOf, ctrl, addCost, placeCost, bonusFor, controlled, scoreRegion, defconBans, shortName,
    cardName: id => (CARD[id] ? CARD[id].name : '?'),
    sideName: s => SIDE[s] ? SIDE[s].name : 'nobody'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data;
  else root.TSData = Data;
})(typeof window !== 'undefined' ? window : this);
