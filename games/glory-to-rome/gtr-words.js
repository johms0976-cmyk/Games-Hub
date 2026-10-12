'use strict';
/* Glory to Rome — the log, as words. One line a move, with what it earned,
   shared by the telly's crier, the phone's "since your last turn" and the
   solo phone's "Just now" (LESSONS-CHECKLIST D). Built from the public log
   only, so a line can never say more than the room knows. */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gtr-data.js') : root.GtrData;
  const VERSION = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const M = m => m ? D.MAT[m].name : 'a card';
  const R = r => D.ROLE[r] ? D.ROLE[r].name : r;
  const N = k => D.nameOf(k);
  const a = w => (/^[AEIOU]/.test(w) ? 'an ' : 'a ') + w;
  const ENDS = { deck: 'The deck has run out.', sites: 'The last site in town is taken.', catacomb: 'The Catacomb is finished.',
    forum: 'The Forum: a client of every role.', forumromanum: 'The Forum Romanum: every client and every material.', plebeiancouncil: 'The Plebeian Council: the Laborers rise.' };

  /* Which lines are a player's own decisions (for "since your last turn"). */
  const CHOSE = { lead: 1, follow: 1, thinks: 1, lay: 1, fill: 1, take: 1, client: 1, vault: 1, demand: 1, tear: 1 };

  function text(e, nm) {
    const by = nm(e.by);
    switch (e.t) {
      case 'start': return by + ' leads first — ' + (e.dealt || []).map(x => nm(x.by) + ' turned up ' + N(x.card)).join(', ') + '.';
      case 'turn': return by + ' leads.';
      case 'thinks': return by + (e.lead ? ' Thinks instead of leading.' : ' Thinks.');
      case 'draw': return by + ' draws ' + e.n + ' card' + (e.n === 1 ? '' : 's') + ({ think: '', bacchanalia: ' (the Bacchanalia’s leftovers)', fountain: ' (keeps the Fountain’s card)' }[e.why] || '') + '.';
      case 'jack': return by + ' takes a Jack' + (e.why === 'tribunal' ? ' (Tribunal)' : '') + '.';
      case 'lead': case 'follow': {
        const how = e.cards.length === 1 ? (e.cards[0] === 'jack' ? 'a Jack' : a(N(e.cards[0]))) : e.cards.map(N).join(' + ');
        return by + (e.t === 'lead' ? ' leads ' : ' follows ') + R(e.role) + ' with ' + how + (e.units > 1 ? ' (' + e.units + ' actions)' : '') + '.';
      }
      case 'acts': return by + ': ' + e.n + ' ' + R(e.role) + ' action' + (e.n > 1 ? 's' : '') + (e.clients ? ' (' + e.clients + ' from clients)' : '') + '.';
      case 'idle': return by + (e.stop ? ' stops there.' : ' has nothing to do as ' + a(R(e.role)) + '.');
      case 'take': return by + ' takes ' + M(e.mat) + (e.from === 'pool' ? ' from the Pool' : e.from === 'hand' ? ' from the hand' : e.from === 'stockpile' ? ' from ' + nm(e.of) + '’s Stockpile' : '') + (e.why === 'legionary' ? ' (Rome demands)' : '') + ' into the Stockpile.';
      case 'client': return by + ' hires ' + a(R(D.roleOf(e.card))) + ' (' + N(e.card) + ')' + (e.from === 'deck' ? ' off the deck' : e.from === 'hand' ? ' from the hand' : e.from === 'building' ? ' out of the Castra Praetoria' : '') + '.';
      case 'vault': return by + ' vaults ' + (e.mat ? M(e.mat) + ' (' + D.MAT[e.mat].value + ')' : e.from === 'deck' ? 'the top card of the deck, unseen' : 'a card from the hand') + (e.from === 'clientele' ? ' — a client retires' : '') + '.';
      case 'lay': return by + ' lays ' + a(N(e.card)) + (e.ot ? ' out of town' : '') + (e.site !== D.matOf(e.card) ? ' on a ' + M(e.site) + ' site' : '') + '.';
      case 'fill': return by + ' adds ' + M(e.mat) + ' to the ' + N(e.card) + ' (' + e.have + '/' + e.need + ').';
      case 'done': return by + ' finishes the ' + N(e.card) + ': +' + D.MAT[e.site].value + ' influence (now ' + e.inf + ').';
      case 'catacomb': return by + '’s Catacomb is finished — the game ends.';
      case 'prison': return by + '’s Prison takes ' + nm(e.of) + '’s ' + N(e.card) + '; ' + nm(e.of) + ' gets 3 influence.';
      case 'aerarium': return by + '’s Aerarium runs the ' + N(e.card) + ' again.';
      case 'reveal': return by + '’s Bacchanalia turns over ' + e.cards.map(N).join(', ') + '.';
      case 'bacchanalia': return by + '’s Bacchanalia needs more cards than the deck has left.';
      case 'fountain': return by + ' turns over the top card for the Fountain.';
      case 'tear': return by + ' pulls down the ' + N(e.card) + ' (Watch Post).';
      case 'stairway': return by + ' makes ' + nm(e.of) + '’s ' + N(e.card) + ' work for everyone (Stairway).';
      case 'solarium': return by + ' takes ' + M(e.mat) + ' back out of the ' + N(e.card) + ' (Solarium).';
      case 'bath': return by + '’s new ' + R(e.role) + ' gets straight to work (Bath).';
      case 'demand': return by + ': “Rome demands ' + e.mats.map(M).join(' and ') + '!”';
      case 'give': return by + ' hands ' + a(N(e.card)) + ' to ' + nm(e.to) + '.';
      case 'glory': return by + ': “Glory to Rome!” — no ' + M(e.mat) + '.';
      case 'immune': return nm(e.of) + '’s ' + N(e.card) + ' keeps the Legionary out.';
      case 'lions': return by + ' throws ' + nm(e.of) + '’s ' + R(e.role) + ' to the lions (Colosseum).';
      case 'aurea': return by + ' pulls down ' + nm(e.of) + '’s ' + N(e.card) + ' foundation (Domus Aurea).';
      case 'latrine': return by + ' throws ' + (e.card === 'jack' ? 'a Jack' : a(N(e.card))) + ' away first (Latrine).';
      case 'vomit': return by + ' throws the whole hand away first (Vomitorium).';
      case 'senate': return by + ' takes ' + nm(e.of) + '’s Jack (Senate).';
      case 'sewer': return by + '’s ' + M(e.mat) + ' goes down the Sewer into the Stockpile.';
      case 'endturn': return null;
      case 'over': return ENDS[e.how] || 'The game is over.';
      case 'hurried': return 'The remote played for ' + (e.who || []).map(nm).join(' and ') + '.';
      case 'nowait': return 'The table went on without ' + (e.who || []).map(nm).join(' and ') + '.';
    }
    return null;
  }

  /* Lines from a slice of the log; `base` is the absolute index of the first. */
  function lines(log, pub, base) {
    const nm = id => { const p = pub && pub.players && pub.players.find(x => x.id === id); return p ? p.name : (id || '?'); };
    const out = [];
    (log || []).forEach((e, i) => {
      const t = text(e, nm);
      if (!t) return;
      out.push({ text: t, by: e.by || null, t: e.t, turn: e.t === 'turn', k: (base || 0) + i, role: e.role || null, card: e.card || null });
    });
    return out;
  }
  function html(l, pub) {
    const p = pub && pub.players && pub.players.find(x => x.id === l.by);
    let s = esc(l.text);
    if (p) s = s.replace(esc(p.name), '<b style="color:' + esc(p.hex) + '">' + esc(p.name) + '</b>');
    return s;
  }

  /* The opening card (D: open the game on its own card): who leads and why,
     how a turn works, what is different in this version, the clocks. */
  function startCardHtml(pub) {
    const st = pub.start || (pub.log || []).find(e => e.t === 'start');
    const P = id => pub.players.find(p => p.id === id);
    const lead = P(pub.leader);
    const v = D.SETS[pub.version];
    const rows = pub.players.map(p => '<div class="rc-p"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b>' +
      (p.bot ? '<span class="rc-role">house · ' + esc(p.level) + '</span>' : '') + (p.id === pub.leader ? '<span class="rc-d">leads first</span>' : '') +
      '<span class="rc-t">' + p.handN + (p.handN === 1 ? ' card' : ' cards') + ' · influence ' + p.inf + '</span></div>').join('');
    const why = st && st.dealt ? st.dealt.map(x => (P(x.by) ? P(x.by).name : '?') + ': ' + N(x.card)).join(', ') : '';
    return '<div class="rc-h">Glory to Rome</div>' +
      '<div class="rc-sub">' + esc(v.name) + ' version' + (pub.geek ? ' with the Geek cards' : '') + '. ' + esc(lead ? lead.name : '?') + ' leads first — the earliest name in the alphabet (' + esc(why) + ').</div>' +
      '<div class="rc-sc">' + rows + '</div>' +
      '<div class="rc-sec"><h4>A turn</h4><ul>' +
      '<li>The leader plays a card to lead its role — or a Jack, or ' + (v.petition === 2 ? 'two' : 'three') + ' cards of one role as a Jack — or Thinks and draws instead.</li>' +
      '<li>Round the table, everyone follows the role with a card of it, or Thinks.</li>' +
      '<li>Then each acts: one action for leading or following, plus one for every client of that role — clients work even for a player who Thought.</li></ul></div>' +
      '<div class="rc-sec"><h4>The game ends when</h4><ul><li>the deck runs out (' + pub.deckN + ' cards), or the last site in town is taken (' + pub.inTown + ' left), or a Catacomb is finished' +
      (pub.version === 'rep' ? ', or someone completes the Forum Romanum’s set' : ', or someone fills the Forum’s six roles') + '.</li>' +
      '<li>Score your influence, your Vault, and 3 for each Merchant Bonus (most of a material in the Vault).</li></ul></div>';
  }

  const Words = { VERSION, lines, html, text, startCardHtml, CHOSE, ENDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Words;
  else root.GtrWords = Words;
})(typeof window !== 'undefined' ? window : this);
