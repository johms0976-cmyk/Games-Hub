/* Catan — the log, said out loud.
 *
 * One line per engine event, from the public view's names and the island's
 * hexes. Shared by the host (the telly's crier, the solo phone's "just now"
 * and its log) so a line reads the same wherever it is shown.
 */
(function (root) {
  'use strict';
  const D = root.CatanData || (typeof require === 'function' ? require('./catan-data.js') : null);
  const W = { VERSION: 1 };

  function hexName(hexes, h) {
    const x = hexes && hexes[h];
    if (!x) return 'a hex';
    return (x.n ? 'the ' + x.n + ' ' : 'the ') + D.TERRAIN[x.t].name.toLowerCase();
  }
  function cardsWords(set) {
    const ks = Object.keys(set || {}).filter(k => set[k] > 0);
    return ks.map(k => set[k] + ' ' + D.cardName(k).toLowerCase()).join(', ');
  }
  W.cardsWords = cardsWords;

  /* g: anything with players [{id, name}] and hexes [{t, n}] — the engine or
     its public view. */
  W.line = function (g, e) {
    const P = id => { const p = g.players.find(x => x.id === String(id)); return p ? p.name : '?'; };
    const prog = k => D.progName(k);
    const hn = h => hexName(g.hexes, h);
    switch (e.t) {
      case 'setup': return P(e.first) + ' places first; the order snakes back for the second building.';
      case 'build': {
        if (e.setup) return P(e.by) + ' places a ' + (e.what === 'road' ? 'road' : e.what) + '.';
        const what = e.what === 'knight' ? (D.KNIGHT_NAME[e.level || 1] + ' knight') : e.what === 'wall' ? 'city wall' : e.what;
        return P(e.by) + ' builds a ' + what + (e.free ? ' for nothing' : '') + (e.medicine ? ' with Medicine' : '') + '.';
      }
      case 'start': return P(e.by) + ' starts with ' + (cardsWords(e.got) || 'nothing') + '.';
      case 'begin': return 'The island is settled. ' + P(e.first) + ' rolls first.';
      case 'roll': {
        const ev = e.e ? (e.e === 'ship' ? ' — and a ship' : ' — the ' + D.TRACK[e.e].name.toLowerCase() + ' gate') : '';
        return P(e.by) + (e.fixed ? ' sets the dice with Alchemy: ' : ' rolls ') + e.sum + ev + '.';
      }
      case 'produce': {
        const ids = Object.keys(e.gains || {});
        const short = (e.short || []).length ? ' The bank ran short of ' + e.short.map(k => D.cardName(k).toLowerCase()).join(' and ') + '.' : '';
        if (!ids.length) return e.sum + ' pays nobody.' + short;
        return e.sum + ' pays ' + ids.map(id => P(id) + ' ' + cardsWords(e.gains[id])).join(' · ') + '.' + short;
      }
      case 'robberAsleep': return 'A 7 — but the robber waits for the barbarians’ first landing.';
      case 'discard': return P(e.by) + ' throws back ' + cardsWords(e.cards) + (e.cause === 'sabotage' ? ' (Sabotage).' : '.');
      case 'robber': return P(e.by) + ' moves the robber to ' + hn(e.to) + '.';
      case 'robNobody': return 'Nobody there to rob.';
      case 'steal': return P(e.by) + ' robs ' + P(e.from) + '.';
      case 'buy': return P(e.by) + ' buys a development card.';
      case 'dev': return P(e.by) + ' plays ' + (e.card === 'knight' ? 'a Knight' : D.DEV[e.card].name) + '.';
      case 'plenty': return 'Year of Plenty: ' + P(e.by) + ' takes ' + cardsWords(e.got) + '.';
      case 'monopoly': return 'Monopoly on ' + D.cardName(e.res).toLowerCase() + ': ' + P(e.by) + ' collects ' + e.n + '.';
      case 'noRoad': return 'Nowhere left for ' + P(e.by) + '’s road.';
      case 'longest': return P(e.by) + ' takes the Longest Road (' + e.len + ')' + (e.from ? ' from ' + P(e.from) : '') + '.';
      case 'longestLost': return 'The Longest Road is broken and set aside.';
      case 'largest': return P(e.by) + ' takes the Largest Army (' + e.n + ' knights)' + (e.from ? ' from ' + P(e.from) : '') + '.';
      case 'bank': return P(e.by) + ' trades ' + e.n + ' ' + D.cardName(e.give).toLowerCase() + ' to the bank for a ' + D.cardName(e.get).toLowerCase() + '.';
      case 'offer': return P(e.by) + ' offers ' + cardsWords(e.give) + ' for ' + cardsWords(e.get) + '.';
      case 'counter': return P(e.by) + ' offers ' + cardsWords(e.give) + ' for ' + cardsWords(e.get) + '.';
      case 'trade': return P(e.a) + ' and ' + P(e.b) + ' trade: ' + cardsWords(e.gave) + ' for ' + cardsWords(e.got) + '.';
      case 'over': return P(e.by) + ' wins with ' + e.vp + ' points!';
      case 'hurried': return 'The table stopped waiting for ' + e.who.map(P).join(' and ') + '.';
      /* Cities & Knights */
      case 'barb': return 'The barbarians sail closer — ' + e.at + ' of ' + D.BARB_TRACK + '.';
      case 'gate': return D.TRACK[e.track].name + ' gate, red ' + e.red + ': ' + (e.who.length ? e.who.map(P).join(', ') + ' draw' + (e.who.length === 1 ? 's' : '') + ' a card.' : 'nobody draws.');
      case 'vpCard': return P(e.by) + ' lays down ' + prog(e.card) + ' — a point!';
      case 'deckEmpty': return 'The ' + D.TRACK[e.deck].name.toLowerCase() + ' deck is empty.';
      case 'progDiscard': return P(e.by) + ' puts ' + e.n + ' progress card' + (e.n === 1 ? '' : 's') + ' back.';
      case 'attack': return 'The barbarians land: ' + e.barb + ' against ' + e.def + ' — ' + (e.win ? 'Catan holds!' : 'Catan falls!');
      case 'pillage': return P(e.by) + '’s city is pillaged.';
      case 'defender': return P(e.by) + ' is the Defender of Catan!';
      case 'defTie': return 'A shared defence: ' + e.who.map(P).join(' and ') + ' each draw a progress card.';
      case 'barbHome': return 'The barbarians sail home. Every knight lies down.';
      case 'improve': return P(e.by) + ' builds the ' + D.TRACK[e.track].levels[e.level] + ' (' + D.TRACK[e.track].name.toLowerCase() + ' ' + e.level + ').';
      case 'metro': return P(e.by) + ' raises the ' + D.TRACK[e.track].name + ' metropolis' + (e.from ? ', taking it from ' + P(e.from) : '') + (e.perm ? ' — for good.' : '.');
      case 'metroPerm': return P(e.by) + '’s ' + D.TRACK[e.track].name + ' metropolis is theirs for good.';
      case 'activate': return P(e.by) + ' activates a ' + D.KNIGHT_NAME[e.level] + ' knight.';
      case 'promote': return P(e.by) + ' promotes a knight to ' + D.KNIGHT_NAME[e.level] + '.';
      case 'kmove': return P(e.by) + ' moves a ' + D.KNIGHT_NAME[e.level] + ' knight.';
      case 'displace': return P(e.by) + '’s ' + D.KNIGHT_NAME[e.level] + ' knight displaces ' + P(e.whom) + '’s ' + D.KNIGHT_NAME[e.vlevel] + ' knight.';
      case 'bounced': return P(e.by) + '’s knight retreats.';
      case 'kLost': return P(e.by) + '’s knight has nowhere to go and leaves the board.';
      case 'chase': return P(e.by) + '’s knight chases off the robber.';
      case 'aqueduct': return 'The Aqueduct gives ' + P(e.by) + ' a ' + D.cardName(e.res).toLowerCase() + '.';
      case 'prog': return P(e.by) + ' plays ' + prog(e.card) + '.';
      case 'noEffect': return '…to no effect.';
      case 'invention': return P(e.by) + ' swaps the discs on ' + hn(e.a) + ' and ' + hn(e.b) + '.';
      case 'irrigation': case 'mining': return P(e.by) + ' takes ' + e.n + ' ' + D.cardName(e.res).toLowerCase() + '.';
      case 'merchant': return P(e.by) + ' stands the merchant on ' + hn(e.hex) + '.';
      case 'fleet': return P(e.by) + ' trades ' + D.cardName(e.type).toLowerCase() + ' at 2:1 this turn.';
      case 'resmono': case 'trademono': return P(e.by) + ' collects ' + e.n + ' ' + D.cardName(e.type).toLowerCase() + '.';
      case 'diplomacy': return P(e.by) + ' lifts ' + (e.whose === e.by ? 'one of their own roads' : P(e.whose) + '’s road') + '.';
      case 'spy': return P(e.by) + ' looks at ' + P(e.from) + '’s progress cards' + (e.took ? ' and takes one.' : '.');
      case 'encouragement': return P(e.by) + ' rouses ' + e.n + ' knight' + (e.n === 1 ? '' : 's') + '.';
      case 'intrigue': return P(e.by) + ' plots against ' + P(e.whom) + '’s knight.';
      case 'treason': return P(e.whom) + '’s ' + D.KNIGHT_NAME[e.level] + ' knight deserts.';
      case 'wedding': return P(e.by) + ' gives ' + P(e.to) + ' ' + e.n + ' card' + (e.n === 1 ? '' : 's') + ' for the wedding.';
      case 'harbor': return P(e.by) + ' and ' + P(e.to) + ' swap a resource for a commodity.';
      case 'dues': return P(e.by) + ' takes ' + e.n + ' card' + (e.n === 1 ? '' : 's') + ' from ' + P(e.from) + '.';
    }
    return null;
  };

  if (typeof module === 'object' && module.exports) module.exports = W;
  else root.CatanWords = W;
})(typeof window !== 'undefined' ? window : globalThis);
