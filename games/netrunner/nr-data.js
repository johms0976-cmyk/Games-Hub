'use strict';
/* Android: Netrunner (the 2012 Core Set) — the components.
 *
 * Every number here was read off the card faces in the user's VASSAL module
 * (reference/Android_Netrunner_1.2.vmod, images/*.png), and the copies of
 * each card off the module's own faction decks (buildFile DrawPiles
 * HB_Deck … Neutral_Runner_Deck). Sources, ranked (LESSONS-CHECKLIST A):
 *   1. the printed card faces in the module
 *   2. the module's deck piles (how many of each card)
 *   3. the Core Set rules as we know them — no rulebook was supplied; where a
 *      rule is decided here it is in MANIFEST.decisions, on screen.
 *
 * Every line of card text below is written fresh: the card faces carry the
 * publisher's wording, and the pictures are the user's own copies.
 *
 * A card's data says WHAT it is; the engine (nr-engine.js) says what it does,
 * keyed by the card's id. `subs` on ice and `brk`/`pump` on icebreakers are
 * data the engine reads directly.
 */
(function (root) {
  const VERSION = 1;

  const FACTIONS = {
    hb:       { name: 'Haas-Bioroid', side: 'corp', hex: '#8a5cc8', short: 'HB' },
    jinteki:  { name: 'Jinteki', side: 'corp', hex: '#c8443a', short: 'Jinteki' },
    nbn:      { name: 'NBN', side: 'corp', hex: '#e4ad2c', short: 'NBN' },
    weyland:  { name: 'Weyland Consortium', side: 'corp', hex: '#4f8a6a', short: 'Weyland' },
    anarch:   { name: 'Anarch', side: 'runner', hex: '#ec6a24', short: 'Anarch' },
    criminal: { name: 'Criminal', side: 'runner', hex: '#3a7be0', short: 'Criminal' },
    shaper:   { name: 'Shaper', side: 'runner', hex: '#5cb85c', short: 'Shaper' },
    neutral:  { name: 'Neutral', side: null, hex: '#9aa3ad', short: 'Neutral' },
    /* Data and Destiny's mini-factions */
    apex:     { name: 'Apex', side: 'runner', hex: '#9b2f2f', short: 'Apex', mini: true },
    adam:     { name: 'Adam', side: 'runner', hex: '#b39a3b', short: 'Adam', mini: true },
    sunny:    { name: 'Sunny Lebeau', side: 'runner', hex: '#6d6f73', short: 'Sunny', mini: true }
  };

  /* Subroutine kinds (ice):
       etr            end the run
       loseClick      the Runner loses a click, if able
       trashProg      trash 1 program (the Corp chooses which)
       brain/net n    damage
       gain n         the Corp gains credits
       trace n then   a trace at base strength n; on success `then` happens:
                      'tag' (1 tag), 'ichi' (1 tag and 1 brain), 'raven'
                      (a power counter on this ice)
       cell           the Runner goes back to the outermost ice; derez this
       chum           the next ice this run is +2 strength and does 3 net
                      damage unless every subroutine on it is broken
       dataMine       1 net damage, then trash this ice */
  const C = {};
  const card = (id, o) => { C[id] = Object.assign({ id }, o); };

  /* ================================================================
     THE CORP — neutral
     ================================================================ */
  card('priority_req', { name: 'Priority Requisition', side: 'corp', fac: 'neutral', type: 'agenda', kw: 'Security', adv: 5, pts: 3,
    text: 'When you score it, you may rez one piece of ice for free.', img: 'Corp_Agenda_Priority_Requisition' });
  card('psf', { name: 'Private Security Force', side: 'corp', fac: 'neutral', type: 'agenda', kw: 'Security', adv: 4, pts: 2,
    text: 'While the Runner is tagged: spend a click to do 1 meat damage.', img: 'Corp_Agenda_Private_Security_Force' });
  card('melange', { name: 'Melange Mining Corp.', side: 'corp', fac: 'neutral', type: 'asset', cost: 1, trash: 1,
    text: 'Spend three clicks: gain 7 credits.', img: 'Corp_Asset_Melange_Mining_Corp' });
  card('pad', { name: 'PAD Campaign', side: 'corp', fac: 'neutral', type: 'asset', kw: 'Advertisement', cost: 2, trash: 4,
    text: 'At the start of your turn, gain 1 credit.', img: 'Corp_Asset_Pad_Campaign' });
  card('enigma', { name: 'Enigma', side: 'corp', fac: 'neutral', type: 'ice', ice: ['code gate'], cost: 3, str: 2,
    subs: [{ k: 'loseClick' }, { k: 'etr' }], img: 'Corp_Ice_Enigma' });
  card('hunter', { name: 'Hunter', side: 'corp', fac: 'neutral', type: 'ice', ice: ['sentry'], kw: 'Tracer · Observer', cost: 1, str: 4,
    subs: [{ k: 'trace', n: 3, then: 'tag' }], img: 'Corp_Ice_Hunter' });
  card('wall_of_static', { name: 'Wall of Static', side: 'corp', fac: 'neutral', type: 'ice', ice: ['barrier'], cost: 3, str: 3,
    subs: [{ k: 'etr' }], img: 'Corp_Ice_Wall_Of_Static' });
  card('hedge_fund', { name: 'Hedge Fund', side: 'corp', fac: 'neutral', type: 'operation', kw: 'Transaction', cost: 5,
    text: 'Gain 9 credits.', img: 'Corp_Operation_Hedge_Fund' });

  /* ================================================================
     Haas-Bioroid
     ================================================================ */
  card('etf', { name: 'Engineering the Future', corpName: 'Haas-Bioroid', side: 'corp', fac: 'hb', type: 'identity', kw: 'Megacorp', min: 45, inf: 15,
    text: 'The first time you install a card each turn, gain 1 credit.', img: 'HB_Identity_Engineering_The_Future' });
  card('abt', { name: 'Accelerated Beta Test', side: 'corp', fac: 'hb', type: 'agenda', kw: 'Research', adv: 3, pts: 2,
    text: 'When you score it, look at the top 3 cards of R&D: install and rez any ice among them for free, and trash the rest.', img: 'HB_Agenda_Accelerated_Beta_Test' });
  card('adonis', { name: 'Adonis Campaign', side: 'corp', fac: 'hb', type: 'asset', kw: 'Advertisement', cost: 4, trash: 3,
    text: 'Put 12 credits on it when rezzed. At the start of your turn, take 3 of them. Trash it when it is empty.', img: 'HB_Asset_Adonis_Campaign' });
  card('agg_sec', { name: 'Aggressive Secretary', side: 'corp', fac: 'hb', type: 'asset', kw: 'Ambush', cost: 0, trash: 0, advable: true,
    text: 'Can be advanced. When the Runner accesses it, you may pay 2 credits to trash one of their programs for every advancement token on it.', img: 'HB_Asset_Aggressive_Secretary' });
  card('heimdall', { name: 'Heimdall 1.0', side: 'corp', fac: 'hb', type: 'ice', ice: ['barrier'], kw: 'Bioroid · AP', cost: 8, str: 6, clickBreak: true,
    subs: [{ k: 'brain', n: 1 }, { k: 'etr' }, { k: 'etr' }], img: 'HB_Ice_Heimdall_1.0' });
  card('ichi', { name: 'Ichi 1.0', side: 'corp', fac: 'hb', type: 'ice', ice: ['sentry'], kw: 'Bioroid · Tracer · Destroyer', cost: 5, str: 4, clickBreak: true,
    subs: [{ k: 'trashProg' }, { k: 'trashProg' }, { k: 'trace', n: 1, then: 'ichi' }], img: 'HB_Ice_Ichi_1.0' });
  card('rototurret', { name: 'Rototurret', side: 'corp', fac: 'hb', type: 'ice', ice: ['sentry'], kw: 'Destroyer', cost: 4, str: 0,
    subs: [{ k: 'trashProg' }, { k: 'etr' }], img: 'HB_Ice_Rototurret' });
  card('viktor', { name: 'Viktor 1.0', side: 'corp', fac: 'hb', type: 'ice', ice: ['code gate'], kw: 'Bioroid · AP', cost: 3, str: 3, clickBreak: true,
    subs: [{ k: 'brain', n: 1 }, { k: 'etr' }], img: 'HB_Ice_Viktor_1.0' });
  card('archived_memories', { name: 'Archived Memories', side: 'corp', fac: 'hb', type: 'operation', cost: 0,
    text: 'Take one card from Archives back into HQ.', img: 'HB_Operation_Archived_Memories' });
  card('biotic_labor', { name: 'Biotic Labor', side: 'corp', fac: 'hb', type: 'operation', cost: 4,
    text: 'Gain two clicks.', img: 'HB_Operation_Biotic_Labor' });
  card('mirrormorph', { name: 'Shipment from MirrorMorph', side: 'corp', fac: 'hb', type: 'operation', cost: 1,
    text: 'Install up to three cards from HQ at once, without spending clicks (you still pay their install costs).', img: 'HB_Operation_Shipment_From_Mirrormorph' });
  card('troubleshooter', { name: 'Corporate Troubleshooter', side: 'corp', fac: 'hb', type: 'upgrade', kw: 'Connection', cost: 0, trash: 2,
    text: 'Pay X credits and trash it: one rezzed ice protecting this server gets +X strength for the rest of the turn.', img: 'HB_Upgrade_Corporate_Troubleshooter' });
  card('exp_data', { name: 'Experiential Data', side: 'corp', fac: 'hb', type: 'upgrade', cost: 2, trash: 2,
    text: 'Every ice protecting this server has +1 strength.', img: 'HB_Upgrade_Experiential_Data' });

  /* ================================================================
     Jinteki
     ================================================================ */
  card('pe', { name: 'Personal Evolution', corpName: 'Jinteki', side: 'corp', fac: 'jinteki', type: 'identity', kw: 'Megacorp', min: 45, inf: 15,
    text: 'Whenever an agenda is scored or stolen, do 1 net damage.', img: 'Jinteki_Identity_Personal_Evolution' });
  card('nisei', { name: 'Nisei MK II', side: 'corp', fac: 'jinteki', type: 'agenda', kw: 'Initiative', adv: 4, pts: 2,
    text: 'Gets 1 agenda counter when scored. Spend that counter to end a run.', img: 'Jinteki_Agenda_Nisei_MK_II' });
  card('junebug', { name: 'Project Junebug', side: 'corp', fac: 'jinteki', type: 'asset', kw: 'Ambush · Research', cost: 0, trash: 0, advable: true,
    text: 'Can be advanced. When the Runner accesses it, you may pay 1 credit to do 2 net damage for every advancement token on it.', img: 'Jinteki_Asset_Project_Junebug' });
  card('snare', { name: 'Snare!', side: 'corp', fac: 'jinteki', type: 'asset', kw: 'Ambush', cost: 0, trash: 0,
    text: 'When the Runner accesses it (but not in Archives), you may pay 4 credits: 3 net damage and 1 tag. Found in R&D, it is shown to all.', img: 'Jinteki_Asset_Snare' });
  card('zaibatsu', { name: 'Zaibatsu Loyalty', side: 'corp', fac: 'jinteki', type: 'asset', cost: 0, trash: 4,
    text: 'You may rez it just as the Runner is about to expose a card. Pay 1 credit, or trash it, to stop that card being exposed.', img: 'Jinteki_Asset_Zaibatsu_Loyalty' });
  card('cell_portal', { name: 'Cell Portal', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['code gate'], kw: 'Deflector', cost: 5, str: 7,
    subs: [{ k: 'cell' }], img: 'Jinteki_Ice_Cell_Portal' });
  card('chum', { name: 'Chum', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['code gate'], cost: 1, str: 4,
    subs: [{ k: 'chum' }], img: 'Jinteki_Ice_Chum' });
  card('data_mine', { name: 'Data Mine', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['trap'], kw: 'AP', cost: 0, str: 2,
    subs: [{ k: 'dataMine' }], img: 'Jinteki_Ice_Data_Mine' });
  card('katana', { name: 'Neural Katana', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['sentry'], kw: 'AP', cost: 4, str: 3,
    subs: [{ k: 'net', n: 3 }], img: 'Jinteki_Ice_Neural_Katana' });
  card('wall_of_thorns', { name: 'Wall of Thorns', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['barrier'], kw: 'AP', cost: 8, str: 5,
    subs: [{ k: 'net', n: 2 }, { k: 'etr' }], img: 'Jinteki_Ice_Wall_Of_Thorns' });
  card('neural_emp', { name: 'Neural EMP', side: 'corp', fac: 'jinteki', type: 'operation', kw: 'Gray Ops', cost: 2, need: 'ranLast',
    text: 'Only if the Runner made a run on their last turn: 1 net damage.', img: 'Jinteki_Operation_Neural_EMP' });
  card('precognition', { name: 'Precognition', side: 'corp', fac: 'jinteki', type: 'operation', cost: 0,
    text: 'Look at the top 5 cards of R&D and put them back in the order you like.', img: 'Jinteki_Operation_Precognition' });
  card('akitaro', { name: 'Akitaro Watanabe', side: 'corp', fac: 'jinteki', type: 'upgrade', kw: 'Sysop · Unorthodox', uniq: true, cost: 1, trash: 3,
    text: 'Ice protecting this server costs 2 less to rez.', img: 'Jinteki_Upgrade_Akitaro_Watanabe' });

  /* ================================================================
     NBN
     ================================================================ */
  card('making_news', { name: 'Making News', corpName: 'NBN', side: 'corp', fac: 'nbn', type: 'identity', kw: 'Megacorp', min: 45, inf: 15, recur: { n: 2, for: 'trace' },
    text: '2 credits each turn that may only be spent on traces.', img: 'NBN_Identity_Making_News' });
  card('astroscript', { name: 'AstroScript Pilot Program', side: 'corp', fac: 'nbn', type: 'agenda', kw: 'Initiative', adv: 3, pts: 2,
    text: 'Gets 1 agenda counter when scored. Spend that counter to put an advancement token on a card that can be advanced.', img: 'NBN_Agenda_Astroscript_Pilot_Program' });
  card('breaking_news', { name: 'Breaking News', side: 'corp', fac: 'nbn', type: 'agenda', adv: 2, pts: 1,
    text: 'When you score it, the Runner takes 2 tags — and loses them again when that turn ends.', img: 'NBN_Agenda_Breaking_News' });
  card('ghost_branch', { name: 'Ghost Branch', side: 'corp', fac: 'nbn', type: 'asset', kw: 'Ambush · Facility', cost: 0, trash: 0, advable: true,
    text: 'Can be advanced. When the Runner accesses it, you may give them 1 tag for every advancement token on it.', img: 'NBN_Asset_Ghost_Branch' });
  card('data_raven', { name: 'Data Raven', side: 'corp', fac: 'nbn', type: 'ice', ice: ['sentry'], kw: 'Tracer · Observer', cost: 4, str: 4, onEnc: 'raven',
    encText: 'On encounter the Runner takes 1 tag or ends the run. Spend a power counter on it: 1 tag.',
    subs: [{ k: 'trace', n: 3, then: 'raven' }], img: 'NBN_Ice_Data_Raven' });
  card('matrix_analyzer', { name: 'Matrix Analyzer', side: 'corp', fac: 'nbn', type: 'ice', ice: ['sentry'], kw: 'Tracer · Observer', cost: 1, str: 3, onEnc: 'matrix',
    encText: 'On encounter you may pay 1 credit to put an advancement token on a card that can be advanced.',
    subs: [{ k: 'trace', n: 2, then: 'tag' }], img: 'NBN_Ice_Matrix_Analyzer' });
  card('tollbooth', { name: 'Tollbooth', side: 'corp', fac: 'nbn', type: 'ice', ice: ['code gate'], cost: 8, str: 5, onEnc: 'toll',
    encText: 'On encounter the Runner pays 3 credits; if they cannot, the run ends.',
    subs: [{ k: 'etr' }], img: 'NBN_Ice_Tollbooth' });
  card('anon_tip', { name: 'Anonymous Tip', side: 'corp', fac: 'nbn', type: 'operation', cost: 0,
    text: 'Draw 3 cards.', img: 'NBN_Operation_Anonymous_Tip' });
  card('closed_accounts', { name: 'Closed Accounts', side: 'corp', fac: 'nbn', type: 'operation', kw: 'Gray Ops', cost: 1, need: 'tagged',
    text: 'Only if the Runner is tagged: they lose every credit in their pool.', img: 'NBN_Operation_Closed_Accounts' });
  card('psychographics', { name: 'Psychographics', side: 'corp', fac: 'nbn', type: 'operation', cost: 'X', need: 'tagged',
    text: 'Pay X, up to the Runner’s tags: put X advancement tokens on a card that can be advanced.', img: 'NBN_Operation_Psychographics' });
  card('sea_source', { name: 'SEA Source', side: 'corp', fac: 'nbn', type: 'operation', kw: 'Gray Ops', cost: 2, need: 'successLast',
    text: 'Only if the Runner made a successful run on their last turn: trace 3 — on success, 1 tag.', img: 'NBN_Operation_Sea_Source' });
  card('red_herrings', { name: 'Red Herrings', side: 'corp', fac: 'nbn', type: 'upgrade', cost: 2, trash: 1,
    text: 'To steal an agenda from this server the Runner must also pay 5 credits — even on the run where they trash this.', img: 'NBN_Upgrade_Red_Herrings' });
  card('sansan', { name: 'SanSan City Grid', side: 'corp', fac: 'nbn', type: 'upgrade', kw: 'Region', cost: 6, trash: 5,
    text: 'Agendas in this server need one advancement fewer. One region per server.', img: 'NBN_Upgrade_Sansan_City_Grid' });

  /* ================================================================
     Weyland Consortium
     ================================================================ */
  card('babw', { name: 'Building a Better World', corpName: 'Weyland Consortium', side: 'corp', fac: 'weyland', type: 'identity', kw: 'Megacorp', min: 45, inf: 15,
    text: 'Gain 1 credit whenever you play a transaction operation.', img: 'WC_Identity_Building_A_Better_World' });
  card('hostile_takeover', { name: 'Hostile Takeover', side: 'corp', fac: 'weyland', type: 'agenda', kw: 'Expansion', adv: 2, pts: 1,
    text: 'When you score it, gain 7 credits and take 1 bad publicity.', img: 'WC_Agenda_Hostile_Takeover' });
  card('posted_bounty', { name: 'Posted Bounty', side: 'corp', fac: 'weyland', type: 'agenda', kw: 'Security', adv: 3, pts: 1,
    text: 'When you score it, you may forfeit it: the Runner takes 1 tag and you take 1 bad publicity.', img: 'WC_Agenda_Posted_Bounty' });
  card('sec_sub', { name: 'Security Subcontract', side: 'corp', fac: 'weyland', type: 'asset', kw: 'Transaction', cost: 0, trash: 3,
    text: 'Spend a click and trash one of your rezzed ice: gain 4 credits.', img: 'WC_Asset_Security_Subcontract' });
  card('archer', { name: 'Archer', side: 'corp', fac: 'weyland', type: 'ice', ice: ['sentry'], kw: 'Destroyer', cost: 4, str: 6, rezForfeit: true,
    encText: 'To rez it you must also forfeit an agenda.',
    subs: [{ k: 'gain', n: 2 }, { k: 'trashProg' }, { k: 'trashProg' }, { k: 'etr' }], img: 'WC_Ice_Archer' });
  card('hadrians', { name: 'Hadrian’s Wall', side: 'corp', fac: 'weyland', type: 'ice', ice: ['barrier'], cost: 10, str: 7, advable: true, advStr: 1,
    subs: [{ k: 'etr' }, { k: 'etr' }], img: 'WC_Ice_Hadrians_Wall' });
  card('ice_wall', { name: 'Ice Wall', side: 'corp', fac: 'weyland', type: 'ice', ice: ['barrier'], cost: 1, str: 1, advable: true, advStr: 1,
    subs: [{ k: 'etr' }], img: 'WC_Ice_Ice_Wall' });
  card('shadow', { name: 'Shadow', side: 'corp', fac: 'weyland', type: 'ice', ice: ['sentry'], kw: 'Tracer', cost: 3, str: 1, advable: true, advStr: 1,
    subs: [{ k: 'gain', n: 2 }, { k: 'trace', n: 3, then: 'tag' }], img: 'WC_Ice_Shadow' });
  card('agg_neg', { name: 'Aggressive Negotiation', side: 'corp', fac: 'weyland', type: 'operation', cost: 1, need: 'scoredThisTurn',
    text: 'Only if you scored an agenda this turn: find any card in R&D, take it into HQ, then shuffle R&D.', img: 'WC_Operation_Aggressive_Negotiation' });
  card('beanstalk', { name: 'Beanstalk Royalties', side: 'corp', fac: 'weyland', type: 'operation', kw: 'Transaction', cost: 0,
    text: 'Gain 3 credits.', img: 'WC_Operation_Beanstalk_Royalties' });
  card('scorched', { name: 'Scorched Earth', side: 'corp', fac: 'weyland', type: 'operation', kw: 'Black Ops', cost: 3, need: 'tagged',
    text: 'Only if the Runner is tagged: 4 meat damage.', img: 'WC_Operation_Scorched_Earth' });
  card('kaguya', { name: 'Shipment from Kaguya', side: 'corp', fac: 'weyland', type: 'operation', cost: 0,
    text: 'Put an advancement token on each of up to two different installed cards that can be advanced.', img: 'WC_Operation_Shipment_From_Kaguya' });
  card('research_station', { name: 'Research Station', side: 'corp', fac: 'weyland', type: 'upgrade', kw: 'Facility', cost: 2, trash: 3, hqOnly: true,
    text: 'Install it only in the root of HQ. Your maximum hand size is 2 higher.', img: 'WC_Upgrade_Research_Station' });

  /* ================================================================
     THE RUNNER — neutral
     ================================================================ */
  card('infiltration', { name: 'Infiltration', side: 'runner', fac: 'neutral', type: 'event', cost: 0,
    text: 'Gain 2 credits, or expose one installed card.', img: 'Runner_Event_Infiltration' });
  card('sure_gamble', { name: 'Sure Gamble', side: 'runner', fac: 'neutral', type: 'event', cost: 5,
    text: 'Gain 9 credits.', img: 'Runner_Event_Sure_Gamble' });
  card('crypsis', { name: 'Crypsis', side: 'runner', fac: 'neutral', type: 'program', kw: 'Icebreaker · AI · Virus', cost: 5, mu: 1, str: 0, virus: true,
    brk: { type: 'any', cost: 1, n: 1 }, pump: { cost: 1, by: 1 },
    text: '1 credit: break any subroutine. 1 credit: +1 strength. Spend a click: add a virus counter. After an encounter where it broke something, it loses a virus counter — or is trashed if it has none.', img: 'Runner_Program_Crypsis' });
  card('globalsec', { name: 'Access to Globalsec', side: 'runner', fac: 'neutral', type: 'resource', kw: 'Link', cost: 1, link: 1,
    text: '+1 link.', img: 'Runner_Resource_Access_To_Globalsec' });
  card('armitage', { name: 'Armitage Codebusting', side: 'runner', fac: 'neutral', type: 'resource', kw: 'Job', cost: 1, load: 12,
    text: 'Put 12 credits on it when installed. Spend a click: take 2 of them. Trash it when it is empty.', img: 'Runner_Resource_Armitage_Codebusting' });

  /* ================================================================
     Anarch
     ================================================================ */
  card('noise', { name: 'Noise', title: 'Hacker Extraordinaire', side: 'runner', fac: 'anarch', type: 'identity', kw: 'G-mod', min: 45, inf: 15, link: 0,
    text: 'Whenever you install a virus program, the Corp trashes the top card of R&D.', img: 'Anarch_Identity_Noise_Hacker_Extraordinaire' });
  card('deja_vu', { name: 'Déjà Vu', side: 'runner', fac: 'anarch', type: 'event', cost: 2,
    text: 'Take one card — or up to two virus cards — from your heap back into your grip.', img: 'Anarch_Event_Deja_Vu' });
  card('demolition_run', { name: 'Demolition Run', side: 'runner', fac: 'anarch', type: 'event', kw: 'Run · Sabotage', cost: 2,
    text: 'Run HQ or R&D. You may trash any card you access there for free, even one that has no trash cost.', img: 'Anarch_Event_Demolition_Run' });
  card('stimhack', { name: 'Stimhack', side: 'runner', fac: 'anarch', type: 'event', kw: 'Run', cost: 0,
    text: 'Make a run with 9 extra credits for that run only. When it is over, take 1 brain damage that cannot be prevented; unspent credits go back.', img: 'Anarch_Event_Stimhack' });
  card('cyberfeeder', { name: 'Cyberfeeder', side: 'runner', fac: 'anarch', type: 'hardware', kw: 'Chip', cost: 2, recur: { n: 1, for: 'feeder' },
    text: '1 credit each turn for using icebreakers or installing virus programs.', img: 'Anarch_Hardware_Cyberfeeder' });
  card('grimoire', { name: 'Grimoire', side: 'runner', fac: 'anarch', type: 'hardware', kw: 'Console', uniq: true, console: true, cost: 3, memory: 2,
    text: '+2 memory. Each virus program you install starts with a virus counter. One console only.', img: 'Anarch_Hardware_Grimoire' });
  card('corroder', { name: 'Corroder', side: 'runner', fac: 'anarch', type: 'program', kw: 'Icebreaker · Fracter', cost: 2, mu: 1, str: 2,
    brk: { type: 'barrier', cost: 1, n: 1 }, pump: { cost: 1, by: 1 },
    text: '1 credit: break a barrier subroutine. 1 credit: +1 strength.', img: 'Anarch_Program_Corroder' });
  card('datasucker', { name: 'Datasucker', side: 'runner', fac: 'anarch', type: 'program', kw: 'Virus', cost: 1, mu: 1, virus: true,
    text: 'A virus counter after each successful run on HQ, R&D or Archives. Spend one: the ice you are encountering is −1 strength for this encounter.', img: 'Anarch_Program_Datasucker' });
  card('djinn', { name: 'Djinn', side: 'runner', fac: 'anarch', type: 'program', kw: 'Daemon', cost: 2, mu: 1, hosts: 3,
    text: 'Can carry up to 3 memory of non-icebreaker programs, which then use none of yours. Spend a click and 1 credit: find a virus program in your stack.', img: 'Anarch_Program_Djinn' });
  card('medium', { name: 'Medium', side: 'runner', fac: 'anarch', type: 'program', kw: 'Virus', cost: 3, mu: 1, virus: true,
    text: 'A virus counter after each successful run on R&D. Every counter after the first lets you access one more card from R&D.', img: 'Anarch_Program_Medium' });
  card('mimic', { name: 'Mimic', side: 'runner', fac: 'anarch', type: 'program', kw: 'Icebreaker · Killer', cost: 3, mu: 1, str: 3,
    brk: { type: 'sentry', cost: 1, n: 1 },
    text: '1 credit: break a sentry subroutine.', img: 'Anarch_Program_Mimic' });
  card('parasite', { name: 'Parasite', side: 'runner', fac: 'anarch', type: 'program', kw: 'Virus', cost: 2, mu: 1, virus: true, onIce: true,
    text: 'Install it on a rezzed ice. That ice is −1 strength per virus counter here and is trashed at 0. A virus counter at the start of each of your turns.', img: 'Anarch_Program_Parasite' });
  card('wyrm', { name: 'Wyrm', side: 'runner', fac: 'anarch', type: 'program', kw: 'Icebreaker · AI', cost: 1, mu: 1, str: 1,
    brk: { type: 'any', cost: 3, n: 1, zero: true }, pump: { cost: 1, by: 1 }, lower: { cost: 1, by: 1 },
    text: '3 credits: break a subroutine on ice of strength 0 or less. 1 credit: the ice is −1 strength. 1 credit: +1 strength.', img: 'Anarch_Program_Wyrm' });
  card('yog', { name: 'Yog.0', side: 'runner', fac: 'anarch', type: 'program', kw: 'Icebreaker · Decoder', cost: 5, mu: 1, str: 3,
    brk: { type: 'code gate', cost: 0, n: 1 },
    text: 'Free: break a code gate subroutine.', img: 'Anarch_Program_Yog.0' });
  card('ice_carver', { name: 'Ice Carver', side: 'runner', fac: 'anarch', type: 'resource', kw: 'Virtual', uniq: true, cost: 3,
    text: 'Every ice is encountered at 1 less strength.', img: 'Anarch_Resource_Ice_Carver' });
  card('wyldside', { name: 'Wyldside', side: 'runner', fac: 'anarch', type: 'resource', kw: 'Location · Seedy', uniq: true, cost: 3,
    text: 'At the start of your turn, draw 2 cards and lose a click.', img: 'Anarch_Resource_Wyldside' });

  /* ================================================================
     Criminal
     ================================================================ */
  card('gabriel', { name: 'Gabriel Santiago', title: 'Consummate Professional', side: 'runner', fac: 'criminal', type: 'identity', kw: 'Cyborg', min: 45, inf: 15, link: 0,
    text: 'The first successful run on HQ each turn gains you 2 credits.', img: 'Criminal_Identity_Gabriel_Santiago_Consummate_Professional' });
  card('account_siphon', { name: 'Account Siphon', side: 'runner', fac: 'criminal', type: 'event', kw: 'Run · Sabotage', cost: 0,
    text: 'Run HQ. If it succeeds you may, instead of accessing, make the Corp lose up to 5 credits; gain 2 for each one they lose, and take 2 tags.', img: 'Criminal_Event_Account_Siphon' });
  card('easy_mark', { name: 'Easy Mark', side: 'runner', fac: 'criminal', type: 'event', kw: 'Job', cost: 0,
    text: 'Gain 3 credits.', img: 'Criminal_Event_Easy_Mark' });
  card('forged', { name: 'Forged Activation Orders', side: 'runner', fac: 'criminal', type: 'event', kw: 'Sabotage', cost: 1,
    text: 'Pick an unrezzed ice: the Corp must rez it (paying for it) or trash it.', img: 'Criminal_Event_Forged_Activation_Orders' });
  card('inside_job', { name: 'Inside Job', side: 'runner', fac: 'criminal', type: 'event', kw: 'Run', cost: 2,
    text: 'Make a run, and slip straight past the first ice you encounter.', img: 'Criminal_Event_Inside_Job' });
  card('special_order', { name: 'Special Order', side: 'runner', fac: 'criminal', type: 'event', cost: 1,
    text: 'Find an icebreaker in your stack, show it, and take it into your grip.', img: 'Criminal_Event_Special_Order' });
  card('desperado', { name: 'Desperado', side: 'runner', fac: 'criminal', type: 'hardware', kw: 'Console', uniq: true, console: true, cost: 3, memory: 1,
    text: '+1 memory. Gain 1 credit after every successful run. One console only.', img: 'Criminal_Hardware_Desperado' });
  card('lemuria', { name: 'Lemuria Codecracker', side: 'runner', fac: 'criminal', type: 'hardware', cost: 1,
    text: 'After a successful run on HQ this turn: spend a click and 1 credit to expose one installed card.', img: 'Criminal_Hardware_Lemuria_Codecracker' });
  card('aurora', { name: 'Aurora', side: 'runner', fac: 'criminal', type: 'program', kw: 'Icebreaker · Fracter', cost: 3, mu: 1, str: 1,
    brk: { type: 'barrier', cost: 2, n: 1 }, pump: { cost: 2, by: 3 },
    text: '2 credits: break a barrier subroutine. 2 credits: +3 strength.', img: 'Criminal_Program_Aurora' });
  card('femme_fatale', { name: 'Femme Fatale', side: 'runner', fac: 'criminal', type: 'program', kw: 'Icebreaker · Killer', cost: 9, mu: 1, str: 2,
    brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 2, by: 1 }, marks: true,
    text: '1 credit: break a sentry subroutine. 2 credits: +1 strength. When installed, mark an installed ice: when you meet it you may pay 1 credit a subroutine to slip past.', img: 'Criminal_Program_Femme_Fatale' });
  card('ninja', { name: 'Ninja', side: 'runner', fac: 'criminal', type: 'program', kw: 'Icebreaker · Killer', cost: 4, mu: 1, str: 0,
    brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 3, by: 5 },
    text: '1 credit: break a sentry subroutine. 3 credits: +5 strength.', img: 'Criminal_Program_Ninja' });
  card('sneakdoor', { name: 'Sneakdoor Beta', side: 'runner', fac: 'criminal', type: 'program', cost: 4, mu: 2,
    text: 'Spend a click: run Archives; if it succeeds, it counts as a successful run on HQ instead.', img: 'Criminal_Program_Sneakdoor_Beta' });
  card('bank_job', { name: 'Bank Job', side: 'runner', fac: 'criminal', type: 'resource', kw: 'Job', cost: 1, load: 8,
    text: 'Put 8 credits on it when installed. After a successful run on a remote server you may, instead of accessing, take any of them. Trash it when empty.', img: 'Criminal_Resource_Bank_Job' });
  card('crash_space', { name: 'Crash Space', side: 'runner', fac: 'criminal', type: 'resource', kw: 'Location', cost: 2, recur: { n: 2, for: 'tag' },
    text: '2 credits each turn for removing tags. Trash it: prevent up to 3 meat damage.', img: 'Criminal_Resource_Crash_Space' });
  card('data_dealer', { name: 'Data Dealer', side: 'runner', fac: 'criminal', type: 'resource', kw: 'Connection · Seedy', cost: 0,
    text: 'Spend a click and forfeit an agenda you stole: gain 9 credits.', img: 'Criminal_Resource_Data_Dealer' });
  card('decoy', { name: 'Decoy', side: 'runner', fac: 'criminal', type: 'resource', kw: 'Connection', cost: 1,
    text: 'Trash it: avoid one tag.', img: 'Criminal_Resource_Decoy' });

  /* ================================================================
     Shaper
     ================================================================ */
  card('kate', { name: 'Kate “Mac” McCaffrey', title: 'Digital Tinker', side: 'runner', fac: 'shaper', type: 'identity', kw: 'Natural', min: 45, inf: 15, link: 1,
    text: 'The first program or hardware you install each turn costs 1 less.', img: 'Shaper_Identity_Kate_Mac_McCaffrey_Digital_Tinker' });
  card('diesel', { name: 'Diesel', side: 'runner', fac: 'shaper', type: 'event', cost: 0,
    text: 'Draw 3 cards.', img: 'Shaper_Event_Diesel' });
  card('modded', { name: 'Modded', side: 'runner', fac: 'shaper', type: 'event', kw: 'Mod', cost: 0,
    text: 'Install a program or hardware from your grip for 3 credits less.', img: 'Shaper_Event_Modded' });
  card('makers_eye', { name: 'The Maker’s Eye', side: 'runner', fac: 'shaper', type: 'event', kw: 'Run', cost: 2,
    text: 'Run R&D. If it succeeds, access 2 more cards from it.', img: 'Shaper_Event_The_Makers_Eye' });
  card('tinkering', { name: 'Tinkering', side: 'runner', fac: 'shaper', type: 'event', kw: 'Mod', cost: 0,
    text: 'Pick any ice: until the end of the turn it is a sentry, a code gate and a barrier as well.', img: 'Shaper_Event_Tinkering' });
  card('akamatsu', { name: 'Akamatsu Mem Chip', side: 'runner', fac: 'shaper', type: 'hardware', kw: 'Chip', cost: 1, memory: 1,
    text: '+1 memory.', img: 'Shaper_Hardware_Akamatsu_Mem_Chip' });
  card('rabbit_hole', { name: 'Rabbit Hole', side: 'runner', fac: 'shaper', type: 'hardware', kw: 'Link', cost: 2, link: 1,
    text: '+1 link. When installed you may find another Rabbit Hole in your stack and install it too, paying for it.', img: 'Shaper_Hardware_Rabbit_Hole' });
  card('personal_touch', { name: 'The Personal Touch', side: 'runner', fac: 'shaper', type: 'hardware', kw: 'Mod', cost: 2, onBreaker: true,
    text: 'Install it on one of your icebreakers: that icebreaker has +1 strength.', img: 'Shaper_Hardware_The_Personal_Touch' });
  card('toolbox', { name: 'The Toolbox', side: 'runner', fac: 'shaper', type: 'hardware', kw: 'Console', uniq: true, console: true, cost: 9, memory: 2, link: 2, recur: { n: 2, for: 'breaker' },
    text: '+2 memory, +2 link, and 2 credits each turn for using icebreakers. One console only.', img: 'Shaper_Hardware_The_Toolbox' });
  card('battering_ram', { name: 'Battering Ram', side: 'runner', fac: 'shaper', type: 'program', kw: 'Icebreaker · Fracter', cost: 5, mu: 2, str: 3,
    brk: { type: 'barrier', cost: 2, n: 2 }, pump: { cost: 1, by: 1, run: true },
    text: '2 credits: break up to two barrier subroutines. 1 credit: +1 strength for the rest of the run.', img: 'Shaper_Program_Battering_Ram' });
  card('gordian', { name: 'Gordian Blade', side: 'runner', fac: 'shaper', type: 'program', kw: 'Icebreaker · Decoder', cost: 4, mu: 1, str: 2,
    brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 1, by: 1, run: true },
    text: '1 credit: break a code gate subroutine. 1 credit: +1 strength for the rest of the run.', img: 'Shaper_Program_Gordian_Blade' });
  card('magnum_opus', { name: 'Magnum Opus', side: 'runner', fac: 'shaper', type: 'program', cost: 5, mu: 2,
    text: 'Spend a click: gain 2 credits.', img: 'Shaper_Program_Magnum_Opus' });
  card('net_shield', { name: 'Net Shield', side: 'runner', fac: 'shaper', type: 'program', cost: 2, mu: 1,
    text: '1 credit: prevent the first point of net damage each turn.', img: 'Shaper_Program_Net_Shield' });
  card('pipeline', { name: 'Pipeline', side: 'runner', fac: 'shaper', type: 'program', kw: 'Icebreaker · Killer', cost: 3, mu: 1, str: 1,
    brk: { type: 'sentry', cost: 1, n: 1 }, pump: { cost: 2, by: 1, run: true },
    text: '1 credit: break a sentry subroutine. 2 credits: +1 strength for the rest of the run.', img: 'Shaper_Program_Pipeline' });
  card('aesops', { name: 'Aesop’s Pawnshop', side: 'runner', fac: 'shaper', type: 'resource', kw: 'Location · Connection', uniq: true, cost: 1,
    text: 'At the start of your turn you may trash another of your installed cards to gain 3 credits.', img: 'Shaper_Resource_Aesops_Pawnshop' });
  card('sac_construct', { name: 'Sacrificial Construct', side: 'runner', fac: 'shaper', type: 'resource', kw: 'Remote', cost: 0,
    text: 'Trash it: stop one of your installed programs or hardware from being trashed.', img: 'Shaper_Resource_Sacrificial_Construct' });

  /* ================================================================
     THE GENESIS CYCLE (2012–13): six data packs, 120 cards — What Lies
     Ahead, Trace Amount, Cyber Exodus, A Study in Static, Humanity's Shadow,
     Future Proof. Numbers off the printed faces (netrunnerdb's card
     pictures, netrunnerdb/<code>.jpg) checked against its data; where its
     text is today's errata the PRINTED card wins (Midori, Disrupter,
     Doppelgänger, Crescentus, False Lead). Three copies of each in a pack.
     ================================================================ */
  const G = (id, code, o) => card(id, Object.assign({ set: 'genesis', code, img: code }, o));
  /* ---------------- identities ---------------- */
  G('whizzard', '02001', { name: 'Whizzard', title: 'Master Gamer', side: 'runner', fac: 'anarch', type: 'identity', kw: 'Natural', min: 45, inf: 15, link: 0, recur: { n: 3, for: 'trashCost' },
    text: '3 credits each turn that may only be spent trashing cards.' });
  G('stronger', '02010', { name: 'Stronger Together', corpName: 'Haas-Bioroid', side: 'corp', fac: 'hb', type: 'identity', kw: 'Megacorp', min: 45, inf: 15,
    text: 'Every bioroid ice has +1 strength.' });
  G('replicating', '02031', { name: 'Replicating Perfection', corpName: 'Jinteki', side: 'corp', fac: 'jinteki', type: 'identity', kw: 'Megacorp', min: 45, inf: 15,
    text: 'The Runner may not run a remote server until they have run HQ, R&D or Archives this turn.' });
  G('chaos', '02046', { name: 'Chaos Theory', title: 'Wünderkind', side: 'runner', fac: 'shaper', type: 'identity', kw: 'G-mod', min: 40, inf: 15, link: 0, memory: 1,
    text: '+1 memory.' });
  G('bwbi', '02076', { name: 'Because We Built It', corpName: 'Weyland Consortium', side: 'corp', fac: 'weyland', type: 'identity', kw: 'Megacorp', min: 45, inf: 15, recur: { n: 1, for: 'advIce' },
    text: '1 credit each turn that may only be spent advancing ice.' });
  G('andromeda', '02083', { name: 'Andromeda', title: 'Dispossessed Ristie', side: 'runner', fac: 'criminal', type: 'identity', kw: 'Natural', min: 45, inf: 15, link: 1, hand: 9,
    text: 'Your starting hand is 9 cards.' });
  G('twiy', '02114', { name: 'The World is Yours*', corpName: 'NBN', side: 'corp', fac: 'nbn', type: 'identity', kw: 'Megacorp', min: 40, inf: 12, handPlus: 1,
    text: 'Your maximum hand size is 1 higher.' });

  /* ---------------- the Runner ---------------- */
  G('spinal_modem', '02002', { name: 'Spinal Modem', side: 'runner', fac: 'anarch', type: 'hardware', kw: 'Console', uniq: true, console: true, cost: 4, memory: 1, recur: { n: 2, for: 'breaker' },
    text: '+1 memory, and 2 credits each turn for icebreakers. A successful trace during a run gives you 1 brain damage. One console only.' });
  G('imp', '02003', { name: 'Imp', side: 'runner', fac: 'anarch', type: 'program', kw: 'Virus', cost: 2, mu: 1, virus: true, startVirus: 2,
    text: 'Starts with 2 virus counters. Once a turn, spend one to trash a card you are accessing, for free — even one that cannot normally be trashed.' });
  G('morning_star', '02004', { name: 'Morning Star', side: 'runner', fac: 'anarch', type: 'program', kw: 'Icebreaker · Fracter', cost: 8, mu: 2, str: 5,
    brk: { type: 'barrier', cost: 1, n: 99 }, text: '1 credit: break every barrier subroutine.' });
  G('cortez', '02005', { name: 'Cortez Chip', side: 'runner', fac: 'criminal', type: 'hardware', kw: 'Chip', cost: 0,
    text: 'Trash it: pick an ice; this turn it costs the Corp 2 more to rez.' });
  G('peacock', '02006', { name: 'Peacock', side: 'runner', fac: 'criminal', type: 'program', kw: 'Icebreaker · Decoder', cost: 3, mu: 1, str: 2,
    brk: { type: 'code gate', cost: 2, n: 1 }, pump: { cost: 2, by: 3 }, text: '2 credits: break a code gate subroutine. 2 credits: +3 strength.' });
  G('zu13', '02007', { name: 'ZU.13 Key Master', side: 'runner', fac: 'shaper', type: 'program', kw: 'Icebreaker · Decoder · Cloud', cost: 1, mu: 1, str: 1, cloud: true,
    brk: { type: 'code gate', cost: 1, n: 1 }, pump: { cost: 1, by: 1 }, text: 'Uses no memory while you have 2 link. 1 credit: break a code gate subroutine. 1 credit: +1 strength.' });
  G('helpful_ai', '02008', { name: 'The Helpful AI', side: 'runner', fac: 'shaper', type: 'resource', kw: 'Connection · Link · Virtual', uniq: true, cost: 2, link: 1,
    text: '+1 link. Trash it: an icebreaker has +2 strength for the rest of the turn.' });
  G('plascrete', '02009', { name: 'Plascrete Carapace', side: 'runner', fac: 'neutral', type: 'hardware', kw: 'Gear', cost: 3, power: 4,
    text: 'Starts with 4 power counters. Spend one: prevent 1 meat damage. Trash it when empty.' });
  G('vamp', '02021', { name: 'Vamp', side: 'runner', fac: 'anarch', type: 'event', kw: 'Run · Sabotage', cost: 0,
    text: 'Run HQ. If it succeeds you may, instead of accessing, pay X: the Corp loses X credits, and you take 1 tag.' });
  G('liberated', '02022', { name: 'Liberated Account', side: 'runner', fac: 'anarch', type: 'resource', cost: 6, load: 16,
    text: 'Put 16 credits on it when installed. Spend a click: take 4 of them. Trash it when empty.' });
  G('sat_uplink', '02023', { name: 'Satellite Uplink', side: 'runner', fac: 'criminal', type: 'event', cost: 2,
    text: 'Expose up to two installed cards.' });
  G('e3', '02024', { name: 'e3 Feedback Implants', side: 'runner', fac: 'criminal', type: 'hardware', kw: 'Mod', cost: 2,
    text: 'After you break a subroutine on an ice, you may pay 1 credit to break another subroutine on it.' });
  G('comp_employee', '02025', { name: 'Compromised Employee', side: 'runner', fac: 'criminal', type: 'resource', kw: 'Connection · Link', cost: 2, recur: { n: 1, for: 'trace' },
    text: '1 credit each turn for traces. Gain 1 credit whenever the Corp rezzes an ice.' });
  G('notoriety', '02026', { name: 'Notoriety', side: 'runner', fac: 'shaper', type: 'event', cost: 1, scorePts: 1,
    text: 'Only after successful runs on R&D, HQ and Archives this turn: it goes to your score area as an agenda worth 1 point.' });
  G('snowball', '02027', { name: 'Snowball', side: 'runner', fac: 'shaper', type: 'program', kw: 'Icebreaker · Fracter', cost: 4, mu: 1, str: 1,
    brk: { type: 'barrier', cost: 1, n: 1 }, pump: { cost: 1, by: 1 }, snow: true, text: '1 credit: break a barrier subroutine. 1 credit: +1 strength. Each break adds +1 strength for the rest of the run.' });
  G('dyson', '02028', { name: 'Dyson Mem Chip', side: 'runner', fac: 'neutral', type: 'hardware', kw: 'Chip · Link', cost: 3, memory: 1, link: 1,
    text: '+1 memory, +1 link.' });
  G('nerve_agent', '02041', { name: 'Nerve Agent', side: 'runner', fac: 'anarch', type: 'program', kw: 'Virus', cost: 3, mu: 1, virus: true,
    text: 'A virus counter after each successful run on HQ. Every counter after the first lets you access one more card from HQ.' });
  G('joshua', '02042', { name: 'Joshua B.', side: 'runner', fac: 'anarch', type: 'resource', kw: 'Connection', uniq: true, cost: 1,
    text: 'At the start of your turn you may gain a click; if you do, take a tag when the turn ends.' });
  G('em_shutdown', '02043', { name: 'Emergency Shutdown', side: 'runner', fac: 'criminal', type: 'event', kw: 'Sabotage', cost: 0,
    text: 'Only after a successful run on HQ this turn: derez one ice.' });
  G('muresh', '02044', { name: 'Muresh Bodysuit', side: 'runner', fac: 'criminal', type: 'hardware', kw: 'Gear', cost: 1,
    text: 'Prevents the first point of meat damage each turn.' });
  G('snitch', '02045', { name: 'Snitch', side: 'runner', fac: 'criminal', type: 'program', cost: 3, mu: 1,
    text: 'Once a run, as you approach an unrezzed ice you may expose it — and then jack out.' });
  G('test_run', '02047', { name: 'Test Run', side: 'runner', fac: 'shaper', type: 'event', cost: 3,
    text: 'Find a program in your stack or heap and install it free. When the turn ends it goes back on top of your stack, if still installed.' });
  G('dinosaurus', '02048', { name: 'Dinosaurus', side: 'runner', fac: 'shaper', type: 'hardware', kw: 'Console', uniq: true, console: true, cost: 5,
    text: 'Can carry one icebreaker that is not an AI: it uses none of your memory and has +2 strength. One console only.' });
  G('workshop', '02049', { name: 'Personal Workshop', side: 'runner', fac: 'shaper', type: 'resource', kw: 'Location', cost: 1,
    text: 'Spend a click: put a program or hardware from your grip here with power counters equal to its cost. 1 credit: remove one. One comes off at the start of your turn. At none, it installs free.' });
  G('sympathy', '02050', { name: 'Public Sympathy', side: 'runner', fac: 'neutral', type: 'resource', cost: 2, handPlus: 2,
    text: 'Your maximum hand size is 2 higher.' });
  G('disrupter', '02061', { name: 'Disrupter', side: 'runner', fac: 'anarch', type: 'program', cost: 1, mu: 1,
    text: 'Trash it: stop a trace; it starts again at base strength 0.' });
  G('force_nature', '02062', { name: 'Force of Nature', side: 'runner', fac: 'anarch', type: 'program', kw: 'Icebreaker · Decoder', cost: 5, mu: 1, str: 1,
    brk: { type: 'code gate', cost: 2, n: 2 }, pump: { cost: 1, by: 1 }, text: '2 credits: break up to two code gate subroutines. 1 credit: +1 strength.' });
  G('scrubber', '02063', { name: 'Scrubber', side: 'runner', fac: 'anarch', type: 'resource', kw: 'Connection · Seedy', cost: 2, recur: { n: 2, for: 'trashCost' },
    text: '2 credits each turn for trashing cards.' });
  G('doppelganger', '02064', { name: 'Doppelgänger', side: 'runner', fac: 'criminal', type: 'hardware', kw: 'Console', uniq: true, console: true, cost: 3, memory: 1,
    text: '+1 memory. Once a turn, when a successful run ends, you may make another run straight away. One console only.' });
  G('crescentus', '02065', { name: 'Crescentus', side: 'runner', fac: 'criminal', type: 'program', cost: 1, mu: 1,
    text: 'Trash it: derez an ice, once you have broken every subroutine on it in one encounter.' });
  G('deus_x', '02066', { name: 'Deus X', side: 'runner', fac: 'shaper', type: 'program', kw: 'Icebreaker', cost: 3, mu: 1, str: 10,
    text: 'Trash it: break every subroutine on an AP ice. Trash it: prevent any amount of net damage.' });
  G('all_nighter', '02067', { name: 'All-nighter', side: 'runner', fac: 'shaper', type: 'resource', cost: 0,
    text: 'Spend a click and trash it: gain two clicks.' });
  G('inside_man', '02068', { name: 'Inside Man', side: 'runner', fac: 'neutral', type: 'resource', kw: 'Connection', cost: 3, recur: { n: 2, for: 'hardware' },
    text: '2 credits each turn for installing hardware.' });
  G('underworld', '02069', { name: 'Underworld Contact', side: 'runner', fac: 'neutral', type: 'resource', kw: 'Connection', cost: 2,
    text: 'At the start of your turn, gain 1 credit if you have at least 2 link.' });
  G('surge', '02081', { name: 'Surge', side: 'runner', fac: 'anarch', type: 'event', cost: 0,
    text: 'Only if you put a virus counter on a program this turn: put 2 more on it.' });
  G('xanadu', '02082', { name: 'Xanadu', side: 'runner', fac: 'anarch', type: 'resource', kw: 'Virtual', uniq: true, cost: 3,
    text: 'Every ice costs 1 more to rez.' });
  G('networking', '02084', { name: 'Networking', side: 'runner', fac: 'criminal', type: 'event', cost: 0,
    text: 'Remove a tag. You may pay 1 credit to take this back into your grip.' });
  G('hq_interface', '02085', { name: 'HQ Interface', side: 'runner', fac: 'criminal', type: 'hardware', cost: 4,
    text: 'Access one more card from HQ.' });
  G('pheromones', '02086', { name: 'Pheromones', side: 'runner', fac: 'criminal', type: 'program', kw: 'Virus', cost: 2, mu: 1, virus: true,
    text: 'A virus counter after each successful run on HQ. Each turn, a credit per counter for runs on HQ.' });
  G('quality_time', '02087', { name: 'Quality Time', side: 'runner', fac: 'shaper', type: 'event', cost: 3,
    text: 'Draw 5 cards.' });
  G('replicator', '02088', { name: 'Replicator', side: 'runner', fac: 'shaper', type: 'hardware', cost: 2,
    text: 'When you install hardware (this included) you may find another copy of it in your stack and take it into your grip.' });
  G('creeper', '02089', { name: 'Creeper', side: 'runner', fac: 'shaper', type: 'program', kw: 'Icebreaker · Killer · Cloud', cost: 5, mu: 1, str: 2, cloud: true,
    brk: { type: 'sentry', cost: 2, n: 1 }, pump: { cost: 1, by: 1 }, text: 'Uses no memory while you have 2 link. 2 credits: break a sentry subroutine. 1 credit: +1 strength.' });
  G('kraken', '02090', { name: 'Kraken', side: 'runner', fac: 'neutral', type: 'event', cost: 3,
    text: 'Only after you steal an agenda this turn: pick a server; the Corp trashes one ice protecting it.' });
  G('kati', '02091', { name: 'Kati Jones', side: 'runner', fac: 'neutral', type: 'resource', kw: 'Connection', uniq: true, cost: 2,
    text: 'Once a turn, spend a click: put 3 credits on it — or take every credit on it.' });
  G('retrieval', '02101', { name: 'Retrieval Run', side: 'runner', fac: 'anarch', type: 'event', kw: 'Run', cost: 3,
    text: 'Run Archives. If it succeeds you may, instead of accessing, install a program from your heap for free.' });
  G('darwin', '02102', { name: 'Darwin', side: 'runner', fac: 'anarch', type: 'program', kw: 'Icebreaker · AI · Virus', cost: 3, mu: 1, str: 0, virus: true, strVirus: true,
    brk: { type: 'any', cost: 2, n: 1 }, text: 'Strength is its virus counters. 2 credits: break any subroutine. At the start of your turn you may pay 1 credit for a virus counter.' });
  G('dlr', '02103', { name: 'Data Leak Reversal', side: 'runner', fac: 'anarch', type: 'resource', kw: 'Virtual · Sabotage', cost: 0,
    text: 'Install only after a successful run on HQ, R&D or Archives this turn. While you are tagged: spend a click and the Corp trashes the top card of R&D.' });
  G('faerie', '02104', { name: 'Faerie', side: 'runner', fac: 'criminal', type: 'program', kw: 'Icebreaker · Killer', cost: 0, mu: 1, str: 2,
    brk: { type: 'sentry', cost: 0, n: 1 }, pump: { cost: 1, by: 1 }, faerie: true, text: 'Free: break a sentry subroutine. 1 credit: +1 strength. Trashed after an encounter where it broke something.' });
  G('mr_li', '02105', { name: 'Mr. Li', side: 'runner', fac: 'criminal', type: 'resource', kw: 'Connection', uniq: true, cost: 3,
    text: 'Spend a click: draw 2 cards and put one of them on the bottom of your stack.' });
  G('indexing', '02106', { name: 'Indexing', side: 'runner', fac: 'shaper', type: 'event', kw: 'Run', cost: 0,
    text: 'Run R&D. If it succeeds you may, instead of accessing, look at its top 5 cards and put them back in any order.' });
  G('rd_interface', '02107', { name: 'R&D Interface', side: 'runner', fac: 'shaper', type: 'hardware', cost: 4,
    text: 'Access one more card from R&D.' });
  G('deep_thought', '02108', { name: 'Deep Thought', side: 'runner', fac: 'shaper', type: 'program', kw: 'Virus', cost: 1, mu: 1, virus: true,
    text: 'A virus counter after each successful run on R&D. With 3 or more, you see the top card of R&D at the start of your turn.' });
  G('nach', '02109', { name: 'New Angeles City Hall', side: 'runner', fac: 'neutral', type: 'resource', kw: 'Location · Government', uniq: true, cost: 1,
    text: '2 credits: avoid a tag. Trashed when you steal an agenda.' });

  /* ---------------- the Corp ---------------- */
  G('mandatory', '02011', { name: 'Mandatory Upgrades', side: 'corp', fac: 'hb', type: 'agenda', kw: 'Initiative', adv: 6, pts: 2,
    text: 'While you hold it, you have one more click each turn.' });
  G('janus', '02012', { name: 'Janus 1.0', side: 'corp', fac: 'hb', type: 'ice', ice: ['sentry'], kw: 'Bioroid · AP', cost: 15, str: 8, clickBreak: true,
    subs: [{ k: 'brain', n: 1 }, { k: 'brain', n: 1 }, { k: 'brain', n: 1 }, { k: 'brain', n: 1 }] });
  G('ash', '02013', { name: 'Ash 2X3ZB9CY', side: 'corp', fac: 'hb', type: 'upgrade', kw: 'Bioroid', uniq: true, cost: 2, trash: 3,
    text: 'After a successful run on this server: trace 4 — on success the Runner may access only Ash this run.' });
  G('braintrust', '02014', { name: 'Braintrust', side: 'corp', fac: 'jinteki', type: 'agenda', kw: 'Research', adv: 3, pts: 2,
    text: 'Scored with extra advancement tokens: an agenda counter for every 2 over 3. Every ice costs 1 less to rez per counter.' });
  G('snowflake', '02015', { name: 'Snowflake', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['barrier'], kw: 'Psi', cost: 1, str: 3,
    subs: [{ k: 'psi', then: 'etr' }] });
  G('datapool', '02016', { name: 'Restructured Datapool', side: 'corp', fac: 'nbn', type: 'agenda', kw: 'Initiative', adv: 5, pts: 3,
    text: 'Spend a click: trace 2 — on success, 1 tag.' });
  G('tmi', '02017', { name: 'TMI', side: 'corp', fac: 'nbn', type: 'ice', ice: ['barrier'], cost: 3, str: 5, onRez: 'tmi',
    encText: 'When rezzed: trace 2; if it fails, it derezzes.', subs: [{ k: 'etr' }] });
  G('atlas', '02018', { name: 'Project Atlas', side: 'corp', fac: 'weyland', type: 'agenda', kw: 'Research', adv: 3, pts: 2,
    text: 'Scored with extra advancement tokens: an agenda counter for each over 3. Spend one: find any card in R&D, take it into HQ.' });
  G('caduceus', '02019', { name: 'Caduceus', side: 'corp', fac: 'weyland', type: 'ice', ice: ['sentry'], kw: 'Tracer', cost: 3, str: 3,
    subs: [{ k: 'trace', n: 3, then: 'gain3' }, { k: 'trace', n: 2, then: 'etr' }] });
  G('draco', '02020', { name: 'Dracō', side: 'corp', fac: 'neutral', type: 'ice', ice: ['sentry'], kw: 'Tracer', cost: 1, str: 0, onRez: 'draco',
    encText: 'When rezzed you may pay X for X power counters: +1 strength each.', subs: [{ k: 'trace', n: 2, then: 'draco' }] });
  G('encryption', '02029', { name: 'Encryption Protocol', side: 'corp', fac: 'hb', type: 'asset', cost: 0, trash: 2,
    text: 'Every installed card costs 1 more to trash.' });
  G('sherlock', '02030', { name: 'Sherlock 1.0', side: 'corp', fac: 'hb', type: 'ice', ice: ['sentry'], kw: 'Bioroid · Tracer', cost: 6, str: 5, clickBreak: true,
    subs: [{ k: 'trace', n: 4, then: 'sherlock' }, { k: 'trace', n: 4, then: 'sherlock' }] });
  G('fetal_ai', '02032', { name: 'Fetal AI', side: 'corp', fac: 'jinteki', type: 'agenda', kw: 'Ambush', adv: 5, pts: 2,
    text: 'Accessed anywhere but Archives: 2 net damage (shown to all when found in R&D). Stealing it costs 2 credits.' });
  G('trick_light', '02033', { name: 'Trick of Light', side: 'corp', fac: 'jinteki', type: 'operation', cost: 1,
    text: 'Move up to 2 advancement tokens from one installed card to another that can be advanced.' });
  G('sensei', '02034', { name: 'Sensei', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['code gate'], cost: 3, str: 5,
    subs: [{ k: 'sensei' }] });
  G('big_brother', '02035', { name: 'Big Brother', side: 'corp', fac: 'nbn', type: 'operation', kw: 'Gray Ops', cost: 0, need: 'tagged',
    text: 'Only while the Runner is tagged: 2 more tags.' });
  G('chilo', '02036', { name: 'ChiLo City Grid', side: 'corp', fac: 'nbn', type: 'upgrade', kw: 'Region', cost: 3, trash: 6,
    text: 'A successful trace during a run on this server also gives 1 tag. One region per server.' });
  G('pgo', '02037', { name: 'Power Grid Overload', side: 'corp', fac: 'weyland', type: 'operation', cost: 1, need: 'successLast',
    text: 'Only after a successful run on the Runner’s last turn: trace 2 — trash a hardware costing no more than the margin.' });
  G('aiz', '02038', { name: 'Amazon Industrial Zone', side: 'corp', fac: 'weyland', type: 'upgrade', kw: 'Region', cost: 4, trash: 2,
    text: 'When you install an ice protecting this server you may rez it at once for 3 less. One region per server.' });
  G('exec_retreat', '02039', { name: 'Executive Retreat', side: 'corp', fac: 'neutral', type: 'agenda', adv: 5, pts: 3,
    text: 'When scored: an agenda counter, and HQ is shuffled into R&D. Spend a click and the counter: draw 5.' });
  G('freelancer', '02040', { name: 'Freelancer', side: 'corp', fac: 'neutral', type: 'operation', kw: 'Gray Ops', cost: 0, need: 'tagged',
    text: 'Only while the Runner is tagged: trash up to two resources.' });
  G('vitruvius', '02051', { name: 'Project Vitruvius', side: 'corp', fac: 'hb', type: 'agenda', kw: 'Research', adv: 3, pts: 2,
    text: 'Scored with extra advancement tokens: an agenda counter for each over 3. Spend one: take a card from Archives into HQ.' });
  G('viper', '02052', { name: 'Viper', side: 'corp', fac: 'hb', type: 'ice', ice: ['code gate'], kw: 'Tracer', cost: 3, str: 4,
    subs: [{ k: 'trace', n: 3, then: 'loseClick' }, { k: 'trace', n: 3, then: 'etr' }] });
  G('edge', '02053', { name: 'Edge of World', side: 'corp', fac: 'jinteki', type: 'asset', kw: 'Ambush', cost: 0, trash: 0,
    text: 'Installed, when accessed: you may pay 3 for 1 brain damage per ice protecting this server.' });
  G('sunset', '02054', { name: 'Sunset', side: 'corp', fac: 'jinteki', type: 'operation', cost: 0,
    text: 'Put the ice protecting one server in the order you like.' });
  G('marked', '02055', { name: 'Marked Accounts', side: 'corp', fac: 'nbn', type: 'asset', kw: 'Transaction', cost: 0, trash: 5,
    text: 'At the start of your turn take 1 credit from it. Spend a click: put 3 credits on it.' });
  G('popup', '02056', { name: 'Pop-up Window', side: 'corp', fac: 'nbn', type: 'ice', ice: ['code gate'], kw: 'Advertisement', cost: 0, str: 0, onEnc: 'popup',
    encText: 'On encounter the Corp gains 1 credit.', subs: [{ k: 'payOrEnd', n: 1 }] });
  G('woodcutter', '02057', { name: 'Woodcutter', side: 'corp', fac: 'weyland', type: 'ice', ice: ['sentry'], kw: 'AP', cost: 4, str: 2, advable: true, advRezzed: true,
    advSub: { k: 'net', n: 1 }, encText: 'Advanced only while rezzed: a “1 net damage” subroutine per token.', subs: [] });
  G('commercialization', '02058', { name: 'Commercialization', side: 'corp', fac: 'weyland', type: 'operation', kw: 'Transaction', cost: 0,
    text: 'Pick an ice: gain 1 credit per advancement token on it.' });
  G('private_contracts', '02059', { name: 'Private Contracts', side: 'corp', fac: 'neutral', type: 'asset', kw: 'Transaction', cost: 3, trash: 5, load: 14,
    text: 'Put 14 credits on it when rezzed. Spend a click: take 2. Trash it when empty.' });
  G('chimera', '02060', { name: 'Chimera', side: 'corp', fac: 'neutral', type: 'ice', ice: [], kw: 'Mythic', cost: 2, str: 0, onRez: 'chimera',
    encText: 'When rezzed, choose sentry, code gate or barrier: it is that until derezzed. It derezzes as each turn ends.', subs: [{ k: 'etr' }] });
  G('green_level', '02070', { name: 'Green Level Clearance', side: 'corp', fac: 'hb', type: 'operation', kw: 'Transaction', cost: 1,
    text: 'Gain 3 credits and draw a card.' });
  G('hourglass', '02071', { name: 'Hourglass', side: 'corp', fac: 'hb', type: 'ice', ice: ['code gate'], cost: 5, str: 4,
    subs: [{ k: 'loseClick' }, { k: 'loseClick' }, { k: 'loseClick' }] });
  G('ded_server', '02072', { name: 'Dedicated Server', side: 'corp', fac: 'jinteki', type: 'asset', kw: 'Facility', cost: 3, trash: 3, recur: { n: 2, for: 'rezIce' },
    text: '2 credits each turn for rezzing ice.' });
  G('bullfrog', '02073', { name: 'Bullfrog', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['code gate'], kw: 'Deflector · Psi', cost: 3, str: 4,
    subs: [{ k: 'psi', then: 'bullfrog' }] });
  G('uroboros', '02074', { name: 'Uroboros', side: 'corp', fac: 'nbn', type: 'ice', ice: ['sentry'], kw: 'Tracer', cost: 6, str: 4,
    subs: [{ k: 'trace', n: 4, then: 'noRun' }, { k: 'trace', n: 4, then: 'etr' }] });
  G('net_police', '02075', { name: 'Net Police', side: 'corp', fac: 'nbn', type: 'asset', cost: 1, trash: 1, recur: { n: 'link', for: 'trace' },
    text: 'Each turn, a credit per point of the Runner’s link, for traces.' });
  G('gov_contracts', '02077', { name: 'Government Contracts', side: 'corp', fac: 'weyland', type: 'agenda', adv: 5, pts: 3,
    text: 'Spend two clicks: gain 4 credits.' });
  G('tyrant', '02078', { name: 'Tyrant', side: 'corp', fac: 'weyland', type: 'ice', ice: ['barrier'], cost: 7, str: 4, advable: true, advRezzed: true,
    advSub: { k: 'etr' }, encText: 'Advanced only while rezzed: an “End the run” subroutine per token.', subs: [] });
  G('oversight', '02079', { name: 'Oversight AI', side: 'corp', fac: 'weyland', type: 'operation', kw: 'Condition', cost: 1,
    text: 'Rez an ice for free. If every subroutine on it is broken in one encounter, it is trashed.' });
  G('false_lead', '02080', { name: 'False Lead', side: 'corp', fac: 'neutral', type: 'agenda', kw: 'Security', adv: 3, pts: 1,
    text: 'Forfeit it (during a run): the Runner loses two clicks, if they have them.' });
  G('eve', '02092', { name: 'Eve Campaign', side: 'corp', fac: 'hb', type: 'asset', kw: 'Advertisement', cost: 5, trash: 5, load: 16,
    text: 'Put 16 credits on it when rezzed. At the start of your turn take 2. Trash it when empty.' });
  G('rework', '02093', { name: 'Rework', side: 'corp', fac: 'hb', type: 'operation', cost: 0,
    text: 'Shuffle a card from HQ into R&D.' });
  G('whirlpool', '02094', { name: 'Whirlpool', side: 'corp', fac: 'jinteki', type: 'ice', ice: ['trap'], cost: 0, str: 1,
    subs: [{ k: 'whirlpool' }] });
  G('hokusai', '02095', { name: 'Hokusai Grid', side: 'corp', fac: 'jinteki', type: 'upgrade', kw: 'Region', cost: 2, trash: 4,
    text: 'A successful run on this server: 1 net damage. One region per server.' });
  G('data_hound', '02096', { name: 'Data Hound', side: 'corp', fac: 'nbn', type: 'ice', ice: ['sentry'], kw: 'Tracer · Observer', cost: 1, str: 2,
    subs: [{ k: 'trace', n: 2, then: 'hound' }] });
  G('bernice', '02097', { name: 'Bernice Mai', side: 'corp', fac: 'nbn', type: 'upgrade', kw: 'Sysop', uniq: true, cost: 0, trash: 3,
    text: 'After a successful run on this server: trace 5 — 1 tag; if it fails, Bernice is trashed.' });
  G('salvage', '02098', { name: 'Salvage', side: 'corp', fac: 'weyland', type: 'ice', ice: ['code gate'], kw: 'Tracer', cost: 2, str: 0, advable: true, advRezzed: true,
    advSub: { k: 'trace', n: 2, then: 'tag' }, encText: 'Advanced only while rezzed: a “trace 2 — 1 tag” subroutine per token.', subs: [] });
  G('simone', '02099', { name: 'Simone Diego', side: 'corp', fac: 'weyland', type: 'upgrade', kw: 'Sysop', uniq: true, cost: 4, trash: 3, recur: { n: 2, for: 'advance', here: true },
    text: '2 credits each turn for advancing cards in or protecting this server.' });
  G('foxfire', '02100', { name: 'Foxfire', side: 'corp', fac: 'neutral', type: 'operation', cost: 0,
    text: 'Trace 7 — trash a virtual resource or a link card.' });
  G('eli', '02110', { name: 'Eli 1.0', side: 'corp', fac: 'hb', type: 'ice', ice: ['barrier'], kw: 'Bioroid', cost: 3, str: 4, clickBreak: true,
    subs: [{ k: 'etr' }, { k: 'etr' }] });
  G('ruhr', '02111', { name: 'Ruhr Valley', side: 'corp', fac: 'hb', type: 'upgrade', kw: 'Region', cost: 6, trash: 4,
    text: 'Running this server costs the Runner an extra click. One region per server.' });
  G('ronin', '02112', { name: 'Ronin', side: 'corp', fac: 'jinteki', type: 'asset', kw: 'Hostile', cost: 0, trash: 2, advable: true,
    text: 'Can be advanced. With 4 or more tokens: spend a click and trash it for 3 net damage.' });
  G('midori', '02113', { name: 'Midori', side: 'corp', fac: 'jinteki', type: 'upgrade', kw: 'Sysop', uniq: true, cost: 0, trash: 3,
    text: 'Once a run, as the Runner approaches an ice protecting this server, you may swap it for an ice from HQ (installed unrezzed).' });
  G('beale', '02115', { name: 'Project Beale', side: 'corp', fac: 'nbn', type: 'agenda', kw: 'Research', adv: 3, pts: 2,
    text: 'Scored with extra advancement tokens: an agenda counter for every 2 over 3, each worth 1 more point.' });
  G('midseason', '02116', { name: 'Midseason Replacements', side: 'corp', fac: 'nbn', type: 'operation', cost: 5, need: 'stoleLast',
    text: 'Only if the Runner stole an agenda on their last turn: trace 6 — a tag for every point of the margin.' });
  G('flare', '02117', { name: 'Flare', side: 'corp', fac: 'nbn', type: 'ice', ice: ['sentry'], kw: 'Tracer · AP', cost: 9, str: 6,
    subs: [{ k: 'trace', n: 6, then: 'flare' }] });
  G('drt', '02118', { name: 'Dedicated Response Team', side: 'corp', fac: 'weyland', type: 'asset', kw: 'Hostile', cost: 2, trash: 3,
    text: 'While the Runner is tagged: whenever a successful run ends, 2 meat damage.' });
  G('burke', '02119', { name: 'Burke Bugs', side: 'corp', fac: 'weyland', type: 'ice', ice: ['sentry'], kw: 'Destroyer', cost: 0, str: 0,
    subs: [{ k: 'trace', n: 0, then: 'burke' }] });
  G('corp_war', '02120', { name: 'Corporate War', side: 'corp', fac: 'neutral', type: 'agenda', kw: 'Expansion', adv: 4, pts: 2,
    text: 'When you score it: with 7 credits or more, gain 7; otherwise lose every credit.' });

  /* Influence: the printed pips, as netrunnerdb records them (code: pips). */
  const G_INF = { '02001': 0, '02002': 2, '02003': 3, '02004': 4, '02005': 2, '02006': 2, '02007': 2, '02008': 2, '02009': 0, '02010': 0, '02011': 0, '02012': 3, '02013': 2, '02014': 0, '02015': 2, '02016': 0, '02017': 1, '02018': 0, '02019': 2, '02020': 0, '02021': 2, '02022': 2, '02023': 3, '02024': 2, '02025': 1, '02026': 1, '02027': 2, '02028': 0, '02029': 1, '02030': 2, '02031': 0, '02032': 0, '02033': 3, '02034': 1, '02035': 1, '02036': 2, '02037': 1, '02038': 1, '02039': 0, '02040': 0, '02041': 2, '02042': 3, '02043': 2, '02044': 1, '02045': 2, '02046': 0, '02047': 3, '02048': 2, '02049': 4, '02050': 0, '02051': 0, '02052': 1, '02053': 2, '02054': 1, '02055': 1, '02056': 1, '02057': 3, '02058': 1, '02059': 0, '02060': 0, '02061': 1, '02062': 1, '02063': 1, '02064': 2, '02065': 1, '02066': 1, '02067': 2, '02068': 0, '02069': 0, '02070': 1, '02071': 2, '02072': 2, '02073': 2, '02074': 2, '02075': 2, '02076': 0, '02077': 0, '02078': 2, '02079': 2, '02080': 0, '02081': 1, '02082': 2, '02083': 0, '02084': 1, '02085': 2, '02086': 2, '02087': 1, '02088': 2, '02089': 1, '02090': 0, '02091': 0, '02092': 3, '02093': 1, '02094': 2, '02095': 2, '02096': 1, '02097': 2, '02098': 2, '02099': 2, '02100': 0, '02101': 2, '02102': 3, '02103': 1, '02104': 3, '02105': 2, '02106': 3, '02107': 2, '02108': 2, '02109': 0, '02110': 1, '02111': 3, '02112': 4, '02113': 3, '02114': 0, '02115': 0, '02116': 4, '02117': 3, '02118': 3, '02119': 1, '02120': 0 };
  for (const k of Object.keys(C)) if (C[k].set === 'genesis' && C[k].type !== 'identity') C[k].inf = C[k].fac === 'neutral' || C[k].type === 'agenda' ? 0 : G_INF[C[k].code];
  for (const k of Object.keys(C)) if (!C[k].set) C[k].set = 'core';

  /* ================================================================
     The decks — the module's own faction piles. A side's deck is its
     faction's pile plus that side's neutral pile (the Core Set's starter
     decks): 27 + 22 = 49 for a Corp, 32 + 15 = 47 for a Runner.
     ================================================================ */
  const PILES = {
    hb: { abt: 3, adonis: 3, agg_sec: 2, heimdall: 2, ichi: 3, rototurret: 2, viktor: 2, archived_memories: 2, biotic_labor: 3, mirrormorph: 2, troubleshooter: 1, exp_data: 2 },
    jinteki: { nisei: 3, junebug: 3, snare: 3, zaibatsu: 1, cell_portal: 2, chum: 2, data_mine: 2, katana: 3, wall_of_thorns: 3, neural_emp: 2, precognition: 2, akitaro: 1 },
    nbn: { astroscript: 2, breaking_news: 2, ghost_branch: 3, data_raven: 3, matrix_analyzer: 3, tollbooth: 3, anon_tip: 2, closed_accounts: 2, psychographics: 2, sea_source: 2, red_herrings: 2, sansan: 1 },
    weyland: { hostile_takeover: 3, posted_bounty: 2, sec_sub: 1, archer: 2, hadrians: 2, ice_wall: 3, shadow: 3, agg_neg: 2, beanstalk: 3, scorched: 2, kaguya: 2, research_station: 2 },
    neutralCorp: { priority_req: 3, psf: 3, melange: 2, pad: 3, enigma: 3, hunter: 2, wall_of_static: 3, hedge_fund: 3 },
    anarch: { deja_vu: 2, demolition_run: 3, stimhack: 3, cyberfeeder: 3, grimoire: 1, corroder: 2, datasucker: 2, djinn: 2, medium: 2, mimic: 2, parasite: 3, wyrm: 2, yog: 2, ice_carver: 1, wyldside: 2 },
    criminal: { account_siphon: 2, easy_mark: 3, forged: 3, inside_job: 3, special_order: 3, desperado: 1, lemuria: 2, aurora: 2, femme_fatale: 2, ninja: 2, sneakdoor: 2, bank_job: 2, crash_space: 2, data_dealer: 1, decoy: 2 },
    shaper: { diesel: 3, modded: 2, makers_eye: 3, tinkering: 3, akamatsu: 2, rabbit_hole: 2, personal_touch: 2, toolbox: 1, battering_ram: 2, gordian: 3, magnum_opus: 2, net_shield: 2, pipeline: 2, aesops: 1, sac_construct: 2 },
    neutralRunner: { infiltration: 3, sure_gamble: 3, crypsis: 3, globalsec: 3, armitage: 3 }
  };
  /* The seven identities, by faction. */
  const IDENTITY = { hb: 'etf', jinteki: 'pe', nbn: 'making_news', weyland: 'babw', anarch: 'noise', criminal: 'gabriel', shaper: 'kate' };
  const CORPS = ['hb', 'jinteki', 'nbn', 'weyland'];
  const RUNNERS = ['anarch', 'criminal', 'shaper'];
  function deckList(fac) {
    const side = FACTIONS[fac].side;
    const out = [];
    const add = pile => { for (const id of Object.keys(pile)) for (let k = 0; k < pile[id]; k++) out.push(id); };
    add(PILES[fac]);
    add(side === 'corp' ? PILES.neutralCorp : PILES.neutralRunner);
    return out;
  }

  /* Influence: the lit pips on each card face (read off the module's scans,
     see ARCHITECTURE.md). Neutral cards and agendas carry none. */
  const INF = {
    adonis: 2, agg_sec: 2, heimdall: 2, ichi: 2, rototurret: 1, viktor: 2, archived_memories: 2, biotic_labor: 4, mirrormorph: 2, troubleshooter: 1, exp_data: 1,
    junebug: 1, snare: 2, zaibatsu: 1, cell_portal: 2, chum: 1, data_mine: 2, katana: 2, wall_of_thorns: 1, neural_emp: 2, precognition: 3, akitaro: 2,
    ghost_branch: 1, data_raven: 2, matrix_analyzer: 2, tollbooth: 2, anon_tip: 1, closed_accounts: 1, psychographics: 3, sea_source: 2, red_herrings: 2, sansan: 3,
    sec_sub: 1, archer: 2, hadrians: 3, ice_wall: 1, shadow: 1, agg_neg: 1, beanstalk: 1, scorched: 4, kaguya: 1, research_station: 1,
    deja_vu: 2, demolition_run: 2, stimhack: 1, cyberfeeder: 1, grimoire: 2, corroder: 2, datasucker: 1, djinn: 2, medium: 3, mimic: 1, parasite: 2, wyrm: 2, yog: 1, ice_carver: 3, wyldside: 3,
    account_siphon: 4, easy_mark: 1, forged: 2, inside_job: 3, special_order: 2, desperado: 3, lemuria: 1, aurora: 1, femme_fatale: 1, ninja: 2, sneakdoor: 3, bank_job: 2, crash_space: 2, data_dealer: 2, decoy: 2,
    diesel: 2, modded: 2, makers_eye: 2, tinkering: 4, akamatsu: 1, rabbit_hole: 1, personal_touch: 2, toolbox: 2, battering_ram: 2, gordian: 3, magnum_opus: 2, net_shield: 1, pipeline: 1, aesops: 2, sac_construct: 1
  };
  for (const k of Object.keys(C)) if (C[k].set === 'core' && C[k].type !== 'identity') C[k].inf = C[k].fac === 'neutral' || C[k].type === 'agenda' ? 0 : INF[k];
  /* How many of each card one Core Set holds (the piles). */
  const IN_BOX = {};
  for (const pile of Object.keys(PILES)) for (const k of Object.keys(PILES[pile])) IN_BOX[k] = (IN_BOX[k] || 0) + PILES[pile][k];

  /* ================================================================
     Deck building — the Core Set rules, one pure checker for the engine,
     the host and the phone.
       a deck: { side, ident (an identity card id), cards: { cardId: copies }, name }
       pool:   'one' (no more of a card than one Core Set holds) or 'three'
               (up to 3 of anything, as with three Core Sets)
     ================================================================ */
  /* How many of a card a deck may hold. The Core Set: what one box holds, or
     three (pool 'three'). Every later product: its deck limit (3, or 1 for a
     "Limit 1 per deck" card) — a data pack holds three of each, and a deluxe
     box as many as netrunnerdb counts (`qty`) when the pool is one box. */
  function maxCopies(k, pool) {
    const c = C[k];
    if (!c) return 0;
    if (c.set === 'core') return pool === 'one' ? IN_BOX[k] || 0 : 3;
    const lim = c.lim == null ? 3 : c.lim;
    return pool === 'one' && c.qty ? Math.min(lim, c.qty) : lim;
  }
  /* The products, in release order. A table plays the Core Set and any of the
     rest: `sets` is a list of codes ('core+genesis+cac'), or one of the old
     names ('core', 'genesis'), or 'all'. A card marked `unbuilt` is in no set. */
  const PRODUCTS = [
    { code: 'core', name: 'Core Set', short: 'Core' },
    { code: 'genesis', name: 'Genesis cycle', short: 'Genesis' },
    { code: 'cac', name: 'Creation and Control', short: 'C&C' },
    { code: 'spin', name: 'Spin cycle', short: 'Spin' },
    { code: 'hap', name: 'Honor and Profit', short: 'H&P' },
    { code: 'lunar', name: 'Lunar cycle', short: 'Lunar' },
    { code: 'oac', name: 'Order and Chaos', short: 'O&C' },
    { code: 'sansan', name: 'SanSan cycle', short: 'SanSan' },
    { code: 'dad', name: 'Data and Destiny', short: 'D&D' },
    { code: 'mumbad', name: 'Mumbad cycle', short: 'Mumbad' },
    { code: 'flashpoint', name: 'Flashpoint cycle', short: 'Flashpoint' },
    { code: 'redsand', name: 'Red Sand cycle', short: 'Red Sand' },
    { code: 'td', name: 'Terminal Directive', short: 'TD' }
  ];
  const SETS = { core: { core: 1 }, genesis: { core: 1, genesis: 1 } };
  /* The products a `sets` value names (always with the Core Set). */
  function setList(sets) {
    if (Array.isArray(sets)) return ['core'].concat(sets.filter(x => x !== 'core'));
    if (sets === 'all') return PRODUCTS.filter(p => built(p.code)).map(p => p.code);
    if (SETS[sets]) return Object.keys(SETS[sets]);
    const want = String(sets || 'core').split('+');
    return PRODUCTS.filter(p => p.code === 'core' || want.indexOf(p.code) >= 0).map(p => p.code);
  }
  /* A `sets` value, normalised: the codes in release order, joined by '+'. */
  const setKey = sets => setList(sets).join('+');
  const built = code => code === 'core' || Object.keys(C).some(k => C[k].set === code && !C[k].unbuilt);
  const SET_CACHE = {};
  function inSets(k, sets) {
    const c = C[k];
    if (!c || c.unbuilt) return false;
    const key = typeof sets === 'string' ? sets : setKey(sets);
    const m = SET_CACHE[key] || (SET_CACHE[key] = setList(sets).reduce((o, x) => { o[x] = 1; return o; }, {}));
    return !!m[c.set];
  }
  /* Agenda points a Corp deck must carry: 18-19 for 40-44 cards, 20-21 for
     45-49, 2 more for every 5 cards beyond. */
  function agendaRange(n) { const lo = 2 * Math.floor(Math.max(n, 40) / 5) + 2; return [lo, lo + 1]; }
  /* The influence a card costs a deck: nothing in its own faction; The
     Professor's first copy of each program is free. */
  /* Mumbad's alliance cards cost no influence when the deck meets their
     condition — ally: { fac, n } (n non-alliance cards of that faction),
     { iceMax }, { deckMin }, { pads } (PAD Campaigns) or { assets }. */
  function allyFree(c, deck) {
    const a = c.ally;
    if (!a || !deck) return false;
    let n = 0;
    const cards = deck.cards || {};
    for (const k of Object.keys(cards)) {
      const x = C[k], m = cards[k] | 0;
      if (!x || m <= 0) continue;
      if (a.fac && x.fac === a.fac && !/\bAlliance\b/.test(x.kw || '')) n += m;
      if (a.iceMax != null && x.type === 'ice') n += m;
      if (a.deckMin && x.type !== 'identity') n += m;
      if (a.pads && k === 'pad') n += m;
      if (a.assets && x.type === 'asset') n += m;
    }
    if (a.iceMax != null) return n <= a.iceMax;
    return n >= (a.n || a.deckMin || a.pads || a.assets);
  }
  function infOf(id, c, copies, deck) {
    if (!c.inf || c.fac === id.fac) return 0;
    if (allyFree(c, deck)) return 0;
    if (id.freeFirstProgram && c.type === 'program') return c.inf * Math.max(0, copies - 1);
    return c.inf * copies;
  }
  function deckStats(deck) {
    const id = C[deck.ident] || {};
    let n = 0, inf = 0, pts = 0;
    for (const k of Object.keys(deck.cards || {})) {
      const c = C[k], m = deck.cards[k] | 0;
      if (!c || m <= 0) continue;
      n += m;
      inf += infOf(id, c, m, deck);
      pts += (c.pts || 0) * m;
    }
    return { n, inf, pts, min: id.min || 45, limit: id.inf == null ? 15 : id.inf, range: agendaRange(n) };
  }
  /* What an identity forbids outright (Custom Biotics: no Jinteki; the
     mini-factions: no other mini-faction's cards). */
  function identBars(id, c) {
    if (id.noFac && id.noFac.indexOf(c.fac) >= 0) return id.name + ' cannot include ' + FACTIONS[c.fac].name + ' cards';
    if (c.fac && FACTIONS[c.fac] && FACTIONS[c.fac].mini && c.fac !== id.fac) return FACTIONS[c.fac].name + ' cards go only in ' + FACTIONS[c.fac].name + ' decks';
    return null;
  }
  /* Why a card cannot go in (or have one more copy), or null. */
  function cardBad(deck, k, pool, sets) {
    const c = C[k], id = C[deck.ident];
    if (!c || !id) return 'Unknown card';
    if (!inSets(k, sets)) return 'Not in the card sets for this table';
    if (c.type === 'identity') return 'An identity is chosen separately';
    if (c.side !== id.side) return 'A ' + c.side + ' card';
    if (c.type === 'agenda' && c.fac !== 'neutral' && c.fac !== id.fac) return 'Agendas of another faction cannot be used';
    const bar = identBars(id, c);
    if (bar) return bar;
    const have = (deck.cards || {})[k] | 0;
    if (have >= maxCopies(k, pool)) return maxCopies(k, pool) === 1 && c.set !== 'core' ? 'One per deck' : pool === 'one' ? 'All ' + maxCopies(k, pool) + ' in the box are in' : 'Three copies at most';
    /* One more copy may change what an alliance card costs: compare whole decks. */
    if (c.inf && c.fac !== id.fac) {
      const st = deckStats(deck);
      const st2 = deckStats(Object.assign({}, deck, { cards: Object.assign({}, deck.cards || {}, { [k]: have + 1 }) }));
      const more = st2.inf - st.inf;
      if (more > 0 && st2.inf > st2.limit) return 'Not enough influence (' + more + ' more; ' + (st.limit - st.inf) + ' left)';
    }
    return null;
  }
  /* Everything wrong with a deck; an empty list is a legal deck. */
  function checkDeck(deck, pool, sets) {
    const bad = [];
    const id = deck && C[deck.ident];
    if (!id || id.type !== 'identity') return ['Choose an identity'];
    const notHere = c => { const pn = (PRODUCTS.find(p => p.code === c.set) || {}).name || 'another set'; return c.name + ' is from ' + (/cycle$/.test(pn) ? 'the ' : '') + pn + ' — not in the card sets for this table'; };
    if (!inSets(deck.ident, sets)) bad.push(notHere(id));
    if (deck.side && deck.side !== id.side) bad.push('That identity is not a ' + deck.side);
    const st = deckStats(deck);
    for (const k of Object.keys(deck.cards || {})) {
      const c = C[k], m = deck.cards[k] | 0;
      if (!c) { bad.push('Unknown card ' + k); continue; }
      if (m <= 0) continue;
      if (!inSets(k, sets)) { bad.push(notHere(c)); continue; }
      if (c.type === 'identity' || c.side !== id.side) bad.push(c.name + ' is not a ' + id.side + ' card');
      else if (c.type === 'agenda' && c.fac !== 'neutral' && c.fac !== id.fac) bad.push(c.name + ': agendas of another faction cannot be used');
      else if (identBars(id, c)) bad.push(identBars(id, c));
      if (m > maxCopies(k, pool)) bad.push(c.name + ': ' + m + ' copies, ' + maxCopies(k, pool) + ' allowed');
    }
    if (st.n < st.min) bad.push(st.n + ' cards — at least ' + st.min);
    if (st.inf > st.limit) bad.push(st.inf + ' influence — at most ' + st.limit);
    if (id.side === 'corp' && (st.pts < st.range[0] || st.pts > st.range[1])) bad.push(st.pts + ' agenda points — a ' + st.n + '-card deck needs ' + st.range[0] + ' or ' + st.range[1]);
    return bad;
  }
  function starterDeck(fac) {
    const cards = {};
    for (const k of deckList(fac)) cards[k] = (cards[k] || 0) + 1;
    return { side: FACTIONS[fac].side, ident: IDENTITY[fac], cards, name: FACTIONS[fac].short + ' starter' };
  }
  function listOf(deck) { const out = []; for (const k of Object.keys(deck.cards).sort()) for (let m = 0; m < (deck.cards[k] | 0); m++) out.push(k); return out; }

  /* The rules' numbers. */
  const WIN = 7;               // agenda points
  const START_CREDITS = 5;
  const HAND = 5;              // starting hand and maximum hand size
  const CLICKS = { corp: 3, runner: 4 };
  const MU = 4;

  const MANIFEST = {
    built: [
      'The whole Core Set: all seven identities and every one of the 113 cards — the starter decks, or decks you build on your phone.',
      'Deck building by the Core Set rules: an identity, at least 45 cards, influence for other factions’ cards, no other faction’s agendas, and 20–21 agenda points in a 45–49 card Corp deck (2 more for every 5 cards beyond). Up to three of a card, or only what one Core Set holds.',
      'Corp v Runner for two phones, or one phone against the house playing the other side (Easy, Medium or Hard).',
      'Runs ice by ice: the Corp rezzes as you approach, you break subroutines with your icebreakers (or by spending clicks on bioroids), what you do not break fires.',
      'Access from HQ, R&D, Archives and remote servers; stealing, trashing, and the Corp’s ambushes.',
      'Traces, tags, bad publicity, net, meat and brain damage, flatlining, virus counters and purging, recurring credits.',
      'Each player may take one mulligan. Undo back to the start of your own action until something is revealed.',
      'Phones only: one phone against the house with the telly left alone, saved on the phone.',
      'Every product after the Core Set, from Genesis to Terminal Directive (about 1,100 cards), for built decks: choose the card sets in the lobby. Psi games, currents, double and triple actions, priority and terminal cards, alliances, the mini-factions, face-down cards and more.',
      'How to play: a lesson game to 5 points with lesson cards, a coach on your phone and a gentle house.',
      'The Terminal Directive campaign, as a lobby choice: a run of games that remembers itself, each side advancing through its data sets — my reading of the box (its stickers were never published).'
    ],
    notBuilt: [
      'The Terminal Directive campaign exactly as boxed: its stickers and sealed-pack texts were never published.',
      'A baked scene for a run (the run is a panel on the telly and the phones).',
      'The Corp trashing its own installed cards at other moments than an install (the rules allow it only then).'
    ],
    decisions: [
      'The starter decks are read off the module: a faction’s cards plus that side’s neutral cards (Corp 49, Runner 47).',
      'The Corp may rez cards at the start of its turn, during its turn, when the Runner approaches a piece of ice (that ice) or the server (anything but ice).',
      'The Runner may jack out when approaching the second and later pieces of ice, and when approaching the server after passing at least one.',
      'Accessed cards are shown to the whole table: the Corp knows them already.',
      'Upgrades in a server are accessed before the cards in R&D or HQ; Archives in the order the cards went there.',
      'The Runner’s slip-past effects (Inside Job, Femme Fatale) come before the ice’s own “when encountered” effects, so a bypassed Tollbooth asks for nothing.',
      'Recurring and run-only credits are spent first, automatically, wherever they are allowed — they are never worth saving.',
      'Installing a second console, or a second copy of a unique card, trashes the first. A new agenda or asset in a remote replaces the one there.',
      'A Corp agenda or asset installed over another one trashes the old one face down.',
      'The Runner must spend all clicks; the last one can always be a credit.',
      'Psychographics, Shipment from Kaguya and AstroScript may advance any installed card that can be advanced, including ice.',
      'A bypassed ice does not spare the Runner a Chum’s damage: bypassing breaks nothing.',
      'Demolition Run may trash an accessed agenda instead of stealing it (the card says it can trash cards that cannot normally be trashed).',
      'The Corp is asked at every rez window whether or not it has anything to rez, so the question never gives away a face-down card.',
      'If the Runner loses memory (a chip or console trashed), programs over the limit are trashed at once, the newest first.',
      'There is no round limit: a game always ends, at the latest when the Corp must draw from an empty R&D.',
      'House players decide from what their seat can see, never from hidden cards.',
      'Before installing ice in front of ice, the Corp may trash any of its cards in that server (each ice trashed makes the new one cheaper). Agendas and assets already replace the one in a remote.'
    ]
  };

  /* Card scripts: what a later product's card does, keyed by its id. A set
     file (sets/<code>.js) adds its cards with `Data.add` and their behaviour
     with `Data.script`; the engine calls the scripts at fixed moments (see
     the "Card scripts" section of nr-engine.js). */
  const SCRIPT = {};
  const Data = { VERSION, FACTIONS, CARDS: C, PILES, IDENTITY, CORPS, RUNNERS, deckList, WIN, START_CREDITS, HAND, CLICKS, MU, MANIFEST,
    IN_BOX, maxCopies, agendaRange, deckStats, cardBad, checkDeck, starterDeck, listOf, SETS, inSets, PRODUCTS, setList, setKey, built, infOf,
    identities: sets => Object.keys(C).filter(k => C[k].type === 'identity' && inSets(k, sets)),
    SCRIPT, SET_LOADED: {},
    add: (id, o) => { if (C[id]) throw new Error('card id used twice: ' + id); card(id, o); for (const key of Object.keys(SET_CACHE)) delete SET_CACHE[key]; },
    script: (id, s) => { SCRIPT[id] = Object.assign(SCRIPT[id] || {}, s); } };
  /* The set files, in release order. In a browser each page loads them after
     this file (<script src="sets/cac.js">…); under node they load here. */
  Data.SET_FILES = ['cac', 'spin', 'hap', 'lunar', 'oac', 'sansan', 'dad', 'mumbad', 'flashpoint', 'redsand', 'td', 'tdc'];
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Data;
    for (const f of Data.SET_FILES) require('./sets/' + f + '.js');
  } else root.NrData = Data;
})(typeof window !== 'undefined' ? window : this);
