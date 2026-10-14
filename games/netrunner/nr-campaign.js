'use strict';
/* Android: Netrunner — the Terminal Directive campaign (my reading of the box).
 *
 * The box's own campaign is told on stickers and sealed packs whose text was
 * never published; what is certain is on the campaign cards themselves
 * (sets/tdc.js) and in the reviews of the time. This module plays that shape:
 *
 *   - The same two sides play a run of games with Core Set + Terminal Directive
 *     decks: the Corp as Seidr Laboratories or Skorpios Defense Systems, the
 *     Runner as Steve Cambridge or Ayla “Bios” Rahim.
 *   - Before the first game each side chooses an ethos: Protector or Predator.
 *     It decides which campaign cards that side is given as it advances.
 *   - Each side has an evidence card in its deck: the Corp an Evidence
 *     Collection agenda, the Runner Investigator Inez Delgado. Win a game with
 *     it in your score area and your next data set opens (level 1 → 2 → 3 → 4,
 *     the card's own "reveal set 2 / 5 / 8"), with a new version of the card.
 *   - Data sets bring each side's rewards:
 *       Corp    level 2: Inez Delgado A (Protector) or Lt. Todachine (Predator);
 *               level 3: their stronger versions, and Machicolation A or B.
 *       Runner  level 2: Surveillance Network Key; level 3: its stronger
 *               version, and BMI Buffer (Protector) or The Masque A (Predator);
 *               level 4: BMI Buffer 2 or The Masque B.
 *   - Cautions: a Corp that ends a turn on 20 credits or more, or clicks to draw
 *     twice in a turn, has Trojan shuffled into its next deck and Security Leak
 *     in the Runner's; a Runner who ends a turn on fewer than 3 credits, or makes
 *     no run in a turn, has Shadow Team in its next deck and Net Watchlist in the
 *     Corp's. Each for the next game only.
 *   - Emergency (data set 9): a side two or more wins behind is given its
 *     emergency card — Corporate Oversight (A Protector, B Predator) or
 *     Sneakdoor Prime (A, B). Win with Corporate Oversight scored and it is
 *     destroyed for the rest of the campaign.
 *   - The final chapter: once a side reaches level 4 the next game is the last,
 *     played to 9 agenda points; its winner wins the campaign. (After 12 games
 *     the next one is the last regardless.)
 */
(function (root) {
  const req = n => (typeof module !== 'undefined' && module.exports) ? require('./' + n) : null;
  const D = req('nr-data.js') || root.NrData;

  const IDENTS = { corp: { hb: 'seidr_labs', weyland: 'skorpios' }, runner: { criminal: 'steve_cambridge', shaper: 'ayla' } };
  const FACS = { corp: Object.keys(IDENTS.corp), runner: Object.keys(IDENTS.runner) };
  const SETS = 'core+td';
  const ETHOS = { protector: 'Protector', predator: 'Predator' };
  const CAUTION_WORDS = { rich: 'ended a turn on 20 credits or more', draw: 'clicked to draw twice in a turn', broke: 'ended a turn on fewer than 3 credits', idle: 'made no run in a turn' };

  function fresh() {
    return { v: 1, games: 0, corp: { level: 1, wins: 0, ethos: null, oversightGone: false }, runner: { level: 1, wins: 0, ethos: null }, cautions: { corp: [], runner: [] }, history: [], done: null };
  }
  const finale = st => st.corp.level >= 4 || st.runner.level >= 4 || st.games >= 12;
  const behind = (st, side) => st[side === 'corp' ? 'runner' : 'corp'].wins - st[side].wins >= 2;

  /* The campaign cards a side's deck is given for the next game. */
  function cardsFor(st, side) {
    const me = st[side], pro = (me.ethos || 'protector') === 'protector', L = me.level, out = [];
    if (side === 'corp') {
      out.push('evidence_' + L);
      if (L >= 2) out.push(pro ? (L >= 3 ? 'inez_corp_a2' : 'inez_corp_a') : (L >= 3 ? 'todachine_2' : 'todachine'));
      if (L >= 3) out.push(pro ? 'machicolation_a' : 'machicolation_b');
      if (st.cautions.corp.length) out.push('trojan');
      if (st.cautions.runner.length) out.push('net_watchlist');
      if (behind(st, 'corp') && !me.oversightGone) out.push(pro ? 'oversight_a' : 'oversight_b');
    } else {
      out.push('inez_' + L);
      if (L >= 2) out.push(L >= 3 ? 'snk_2' : 'snk');
      if (L >= 3) out.push(pro ? (L >= 4 ? 'bmi_buffer_2' : 'bmi_buffer') : (L >= 4 ? 'masque_b' : 'masque_a'));
      if (st.cautions.runner.length) out.push('shadow_team');
      if (st.cautions.corp.length) out.push('security_leak');
      if (behind(st, 'runner')) out.push(pro ? 'sneakdoor_a' : 'sneakdoor_b');
    }
    return out;
  }
  /* A side's deck for a campaign game: its own (legal for Core + TD, with a
     Terminal Directive identity) or the faction's starter around the TD identity. */
  function baseDeck(side, fac, own) {
    if (own && D.CARDS[own.ident] && D.CARDS[own.ident].set === 'td' && !D.checkDeck(own, 'one', SETS).length) return JSON.parse(JSON.stringify(own));
    const d = D.starterDeck(fac);
    d.ident = IDENTS[side][fac];
    d.name = 'Campaign ' + (side === 'corp' ? 'Corp' : 'Runner');
    return d;
  }
  function decksFor(st, facs, own) {
    const out = {};
    for (const side of ['corp', 'runner']) {
      const d = baseDeck(side, facs[side], (own || {})[side]);
      for (const k of cardsFor(st, side)) d.cards[k] = (d.cards[k] || 0) + 1;
      out[side] = d;
    }
    return out;
  }

  /* After a game: who advanced, cautions for the next game, the end. */
  function record(st, g) {
    const s = JSON.parse(JSON.stringify(st));
    const R = g.result || {};
    const won = R.side;
    const pub = g.publicView();
    const lines = [];
    s.games++;
    const wasFinale = finale(st);
    if (won === 'corp' || won === 'runner') s[won].wins++;
    if (won === 'corp' && pub.corp.score.some(x => /^evidence_[123]$/.test(x.k)) && s.corp.level < 4) { s.corp.level++; lines.push('The Corp won with Evidence Collection scored: data set ' + [0, 0, 2, 5, 8][s.corp.level] + ' opens (level ' + s.corp.level + ').'); }
    if (won === 'runner' && pub.runner.score.some(k => /^inez_[123]$/.test(k)) && s.runner.level < 4) { s.runner.level++; lines.push('The Runner won with Inez Delgado in the score area: data set ' + [0, 0, 2, 5, 8][s.runner.level] + ' opens (level ' + s.runner.level + ').'); }
    if (won === 'corp' && pub.corp.score.some(x => /^oversight_/.test(x.k)) && !s.corp.oversightGone) { s.corp.oversightGone = true; lines.push('Corporate Oversight is destroyed.'); }
    const c = g.cautions || { corp: [], runner: [] };
    s.cautions = { corp: c.corp.slice(), runner: c.runner.slice() };
    for (const k of c.corp) lines.push('Caution — the Corp ' + CAUTION_WORDS[k] + ': Trojan for the Corp and Security Leak for the Runner next game.');
    for (const k of c.runner) lines.push('Caution — the Runner ' + CAUTION_WORDS[k] + ': Shadow Team for the Runner and Net Watchlist for the Corp next game.');
    s.history.push({ game: s.games, won: won || null, corpLevel: s.corp.level, runnerLevel: s.runner.level, finale: wasFinale });
    if (wasFinale && (won === 'corp' || won === 'runner')) { s.done = won; lines.push('That was the final chapter: the ' + (won === 'corp' ? 'Corp' : 'Runner') + ' wins the campaign.'); }
    else if (finale(s)) lines.push('The next game is the final chapter, played to 9 agenda points.');
    return { state: s, lines };
  }

  /* A few lines for the lobby. */
  function describe(st) {
    const side = x => 'level ' + st[x].level + ' · ' + st[x].wins + ' win' + (st[x].wins === 1 ? '' : 's') + (st[x].ethos ? ' · ' + ETHOS[st[x].ethos] : '');
    const lines = [];
    if (st.done) lines.push('The campaign is over: the ' + (st.done === 'corp' ? 'Corp' : 'Runner') + ' won it after ' + st.games + ' games.');
    else lines.push(st.games ? 'Game ' + (st.games + 1) + (finale(st) ? ' — the final chapter, to 9 points' : '') + '.' : 'A new campaign. Choose each side’s ethos, then play the first game.');
    lines.push('Corp: ' + side('corp') + '. In the deck: ' + cardsFor(st, 'corp').map(k => D.CARDS[k].name).join(', ') + '.');
    lines.push('Runner: ' + side('runner') + '. In the deck: ' + cardsFor(st, 'runner').map(k => D.CARDS[k].name).join(', ') + '.');
    return lines;
  }

  const Campaign = { VERSION: 1, IDENTS, FACS, SETS, ETHOS, fresh, finale, cardsFor, decksFor, record, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = Campaign;
  else root.NrCampaign = Campaign;
})(typeof window !== 'undefined' ? window : this);
