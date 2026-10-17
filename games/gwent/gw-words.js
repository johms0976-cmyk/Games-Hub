'use strict';
/* Gwent — the public log as one line a move, shared by the telly and the
   phones (LESSONS-CHECKLIST D: "one line per move with what it earned").
   A move (a card, a leader, a pass) starts a line; everything it caused —
   musters, revives, burns, draws, weather — is folded into it, and the line
   ends on the score it left. Also the cards that open and close a round. */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gw-data.js') : root.GwentData;
  const VERSION = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const HEAD = { decks: 1, round: 1, leads: 1, play: 1, leader: 1, pass: 1, roundEnd: 1, over: 1, redraw: 1 };
  /* Moves a player chose (for "since your last turn"). */
  const CHOSE = { play: 1, leader: 1, pass: 1 };
  const WORD = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];

  /* A boss's second phase (the single-player run), one clause. */
  const PHASE_LINE = {
    whiteFrost: e => 'the White Frost falls — ' + e.rows.map(r => D.ROW_NAME[r]).join(' and ') + ' frozen for good',
    crones: (e, N) => 'the Crones take ' + e.ids.map(short).join(' and ') + ' from ' + N[e.of] + '’s hand and leave a Cow',
    edict: (e, N) => 'an imperial edict: ' + N[e.of] + '’s ' + D.ROW_NAME[e.row] + ' units fight at −' + e.n,
    ambush: e => 'ambush! ' + e.ids.map(short).join(' and ') + ' walk on from the deck',
    rage: e => 'the Baron’s rage doubles his ' + e.rows.map(r => D.ROW_NAME[r]).join(' and ') + ' row' + (e.rows.length > 1 ? 's' : ''),
    levy: e => 'the king’s levy: ' + e.n + ' Poor Fucking Infantry march in'
  };
  function names(pub) { const m = {}; if (pub) pub.players.forEach(p => { m[p.id] = p.name; }); return m; }
  const nm = id => D.nameOf(id);
  const short = id => { const c = D.card(id); return c ? c.name : String(id); };

  function clause(e, N, cur) {
    switch (e.t) {
      case 'enter':
        if (e.how === 'play') return e.side !== e.by ? 'a spy on ' + N[e.side] + '’s ' + D.ROW_SHORT[e.row] + ' row' : (D.card(e.card).agile ? 'to ' + D.ROW_SHORT[e.row] : null);
        if (e.how === 'muster') return null;              // counted in finish()
        if (e.how === 'revive') return null;
        return null;
      case 'draw': return e.why === 'spy' ? 'draws 2' : e.why === 'nr' ? null : null;
      case 'revive': return e.card ? 'brings back ' + short(e.card) + (e.random ? ' (at random, Emhyr’s rule)' : '') : 'nobody to bring back';
      case 'burn': return (e.how === 'scorch' ? 'burns ' : 'burns ') + N[e.of] + '’s ' + short(e.card);
      case 'fizzle': return 'no scorch — ' + N[e.of] + '’s ' + D.ROW_SHORT[e.row] + ' row is only ' + e.total + (e.min ? ' (10 needed)' : '');
      case 'weather': return e.wasted ? 'that weather is already here — it does nothing' : (e.rows || [e.row]).map(r => D.ROW_NAME[r]).join(' and ') + ' fall' + ((e.rows || []).length > 1 ? '' : 's') + ' to strength 1 on both sides';
      case 'transform': return short(e.from) + ' turns into ' + short(e.card);
      case 'summon': return short(e.from) + ' becomes ' + short(e.card) + ' (' + N[e.by] + ')';
      case 'mardroeme': return 'Mardroeme on the ' + D.ROW_SHORT[e.row] + ' row';
      case 'shuffle': return 'both discard piles go back into the decks (' + e.n.join(' and ') + ' cards)';
      case 'clear': return 'the skies clear';
      case 'horn': return 'the ' + D.ROW_SHORT[e.row] + ' row is doubled';
      case 'decoy': return short(e.card) + ' goes back to hand';
      case 'scorch': return e.n ? null : 'nothing strong enough to burn';
      case 'discard': return 'discards ' + e.ids.map(short).join(' and ');
      case 'tutor': return 'takes a card from the deck';
      case 'restore': return 'takes ' + short(e.card) + ' back into hand';
      case 'peek': return 'looks at ' + (WORD[e.n - 1] || e.n) + ' of ' + N[e.of] + '’s cards';
      case 'steal': return 'takes ' + short(e.card) + ' from ' + N[e.of] + '’s discard pile';
      case 'agile': return e.n ? 'moves ' + e.n + ' Agile unit' + (e.n === 1 ? '' : 's') : 'nothing to move';
      case 'gem': return N[e.of] + ' loses a gem (' + e.left + ' left)';
      case 'bonus':
        if (e.what === 'nr') return N[e.by] + ' draws a card (Northern Realms)';
        if (e.what === 'mo') return N[e.by] + '’s ' + short(e.card) + ' stays on the board (Monsters)';
        if (e.what === 'keep') return N[e.by] + '’s ' + short(e.card) + ' stays on the board';
        if (e.what === 'winDraw') return N[e.by] + ' draws for winning the round';
        if (e.what === 'roundDraw') return N[e.by] + ' draws a card for the new round';
        if (e.what === 'revive') return e.ids.length ? N[e.by] + ' takes ' + e.ids.map(short).join(' and ') + ' back from the discard pile (a trinket)' : N[e.by] + ' has nobody to take back (a trinket)';
        if (e.what === 'start') return N[e.by] + ' starts with ' + e.ids.map(short).join(' and ') + ' in hand';
        if (e.what === 'sk') return e.ids.length ? N[e.by] + ' raises ' + e.ids.map(short).join(' and ') + ' from the discard pile (Skellige)' : N[e.by] + ' has nobody to raise (Skellige)';
        return null;
      case 'score': cur.score = e.totals; return null;
      case 'phase': return PHASE_LINE[e.what] ? PHASE_LINE[e.what](e, N) : null;
    }
    return null;
  }

  function head(e, N) {
    const who = N[e.by] || '?';
    switch (e.t) {
      case 'decks': return 'The decks: ' + e.list.map(x => N[x.by] + ' plays ' + D.faction(x.fac).name + ' under ' + nm(x.leader)).join(' · ');
      case 'redraw': return who + ' redraws a card';
      case 'round': return 'Round ' + WORD[e.round - 1] + ' — ' + who + ' begins';
      case 'leads': return who + ' chooses: ' + (N[e.starter]) + ' begins (' + (e.how === 'trinket' ? 'a trinket' : 'Scoia’tael') + ')';
      case 'play': return who + ' plays ' + short(e.card);
      case 'leader': return who + '’s leader: ' + nm(e.leader);
      case 'pass': return who + (e.auto ? ' has no cards left and passes' : ' passes');
      case 'roundEnd': return e.winner ? 'Round ' + WORD[e.round - 1] + ' to ' + N[e.winner] + ', ' + Math.max(e.totals[0], e.totals[1]) + ' to ' + Math.min(e.totals[0], e.totals[1]) + (e.how === 'nilfgaard' ? ' — a draw, and Nilfgaard takes draws' : e.how === 'trinket' ? ' — a draw, and the Ducal Seal takes draws' : '')
        : 'Round ' + WORD[e.round - 1] + ' is a draw at ' + e.totals[0];
      case 'over': return e.how === 'draw' ? 'Both out of gems at once: the game is a draw' : who + ' wins the game';
    }
    return who;
  }

  /* lines(log, pub, base): base is the absolute index of log[0]. */
  function lines(log, pub, base) {
    const N = names(pub);
    base = base || 0;
    const out = [];
    let cur = null;
    const redraws = {};
    log.forEach((e, k) => {
      if (e.t === 'draw' && (e.why === 'deal' || e.why === 'nr')) return;
      if (HEAD[e.t]) {
        /* Each player's redraws are one line, however they interleave. */
        if (e.t === 'redraw' && redraws[e.by]) { redraws[e.by].n++; return; }
        cur = { i: base + k, by: e.by || null, t: e.t, turn: e.t === 'round', card: e.card || null, head: head(e, N), bits: [], muster: 0, n: 1, score: null, round: e.r };
        out.push(cur);
        if (e.t === 'redraw') redraws[e.by] = cur;
        if (e.t === 'decks' || e.t === 'over') cur = null;
        return;
      }
      if (!cur) return;
      if (e.t === 'enter' && e.how === 'muster') { cur.muster++; return; }
      const c = clause(e, N, cur);
      if (c) cur.bits.push(c);
    });
    for (const l of out) {
      if (l.muster) l.bits.unshift(l.card === 'cerys' ? 'calls ' + l.muster + ' Shield Maiden' + (l.muster === 1 ? '' : 's') : 'musters ' + l.muster + ' more from the deck');
      if (l.t === 'redraw' && l.n > 1) l.head = l.head.replace('redraws a card', 'redraws ' + l.n + ' cards');
      const sc = l.score && pub ? ' — ' + pub.players.map((p, i) => p.name + ' ' + l.score[i]).join(', ') : '';
      /* "burns X, burns X, burns X" reads as "burns X ×3". */
      const bits = [];
      for (const b of l.bits) { const last = bits[bits.length - 1]; if (last && last.t === b) last.n++; else bits.push({ t: b, n: 1 }); }
      l.text = l.head + (bits.length ? ': ' + bits.map(b => b.t + (b.n > 1 ? ' ×' + b.n : '')).join(', ') : '') + sc + (l.turn ? '' : '.');
    }
    return out;
  }
  function html(l, pub) {
    const p = pub && pub.players.find(x => x.id === l.by);
    const t = esc(l.text);
    if (!p) return t;
    const n = esc(p.name);
    return t.indexOf(n) === 0 ? '<b style="color:' + esc(p.hex) + '">' + n + '</b>' + t.slice(n.length) : t;
  }

  const gemMax = p => Math.max(2, (p && p.mods && p.mods.gems) || 2);
  const gemsHtml = (n, max) => '<span class="gw-gems">' + Array.from({ length: max || 2 }, (_, k) => '<i class="' + (k < n ? 'on' : '') + '"></i>').join('') + '</span>';

  /* The card that opens a round (checklist D: every round opens on its own
     card, the first one included — and the first says how a turn works). */
  function roundStartHtml(pub, h) {
    const first = pub.players.find(p => p.id === h.by);
    const rows = pub.players.map(p => {
      const F = p.fac ? D.faction(p.fac) : null;
      const L = p.leader ? D.LEADER[p.leader] : null;
      return '<div class="rc-p"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b>' +
        (p.bot ? '<span class="rc-role">house · ' + esc(p.level) + '</span>' : '') + gemsHtml(p.gems, gemMax(p)) +
        '<span class="rc-t">' + (F ? esc(F.name) + ' — ' + esc(F.bonus) : '') + (L ? '<br>Leader: ' + esc(L.name + ', ' + L.title) + (p.leaderOff ? ' (cancelled by the White Flame)' : p.leaderUsed ? ' (used)' : '') : '') + '</span>' +
        '<span class="rc-d">' + p.handN + ' cards in hand</span></div>';
    }).join('');
    const last = pub.history && pub.history.length ? pub.history[pub.history.length - 1] : null;
    const decider = pub.players.every(p => p.gems === 1);
    let sub = '<b>' + esc(first ? first.name : '?') + '</b> begins.';
    /* With three gems (the run's Iron Bosses) nobody need be down to one yet. */
    const lastGem = pub.players.filter(p => p.gems === 1);
    if (h.round > 1) sub += decider ? ' One gem each: this round decides the game.' : lastGem.length ? ' ' + esc(lastGem[0].name) + ' is down to the last gem — lose this round and the game is gone.' : ' Gems: ' + pub.players.map(p => esc(p.name) + ' ' + p.gems).join(', ') + '.';
    let out = '<div class="rc-h">Round ' + WORD[h.round - 1] + '</div><div class="rc-sub">' + sub + '</div><div class="rc-sc">' + rows + '</div>';
    if (h.round === 1) {
      out += '<div class="rc-sec"><h4>A turn</h4><ul>' +
        '<li>Play <b>one card</b>: a unit into its row (Close, Ranged or Siege), or a special card — or use your leader once a game.</li>' +
        '<li>Or <b>pass</b>: you play no more this round. The other side may carry on alone.</li>' +
        '<li>When both have passed, the bigger total wins the round. Lose two rounds and you lose the game.</li></ul></div>' +
        '<div class="rc-sec"><h4>Remember</h4><ul><li>Cards are not drawn between rounds — your hand is all you have for all three. Win with fewer cards.</li>' +
        '<li>Weather drops a row to strength 1 on both sides. Heroes (gold corner) ignore everything.</li></ul></div>';
    } else if (last) {
      out += '<div class="rc-sec"><h4>Last round</h4><ul><li>' + esc(roundLine(pub, last)) + '</li>' +
        (pub.log || []).filter(e => e.t === 'bonus' && (e.what === 'sk' || e.what === 'mo') && e.r === h.round - (e.what === 'mo' ? 1 : 0))
          .map(e => '<li>' + esc(clause(e, names(pub), {})) + '</li>').join('') +
        (pub.log || []).filter(e => e.t === 'summon' && e.r === h.round - 1).map(e => '<li>' + esc(short(e.from) + ' became ' + short(e.card) + ', who stands on ' + names(pub)[e.by] + '’s side this round.') + '</li>').join('') +
        '</ul></div>';
    }
    return out;
  }
  function roundLine(pub, r) {
    const N = names(pub);
    if (!r.winner) return 'A draw at ' + r.totals[0] + ': both lost a gem.';
    return N[r.winner] + ' won ' + Math.max(r.totals[0], r.totals[1]) + ' to ' + Math.min(r.totals[0], r.totals[1]) + (r.how === 'nilfgaard' ? ' (a draw, which Nilfgaard wins)' : r.how === 'trinket' ? ' (a draw, which the Ducal Seal wins)' : '') + '.';
  }
  /* The card that ends a round: the totals row by row, who won, the gems,
     and the bonuses that fire. */
  function roundEndHtml(pub, h) {
    const N = names(pub);
    const rows = pub.players.map((p, i) => '<div class="rc-p' + (h.winner === p.id ? ' won' : '') + '"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b>' + gemsHtml(h.gems[i], gemMax(p)) +
      '<span class="rc-t">Close ' + h.rows[i][0] + ' · Ranged ' + h.rows[i][1] + ' · Siege ' + h.rows[i][2] + '</span><span class="rc-d big">' + h.totals[i] + '</span></div>').join('');
    const title = h.winner ? N[h.winner] + ' takes round ' + WORD[h.round - 1] : 'Round ' + WORD[h.round - 1] + ' is a draw';
    const notes = [];
    if (h.how === 'nilfgaard') notes.push('The totals are level — and Nilfgaard wins every drawn round.');
    if (h.how === 'trinket') notes.push('The totals are level — and the Ducal Seal wins every drawn round.');
    if (!h.winner) notes.push('Both sides lose a gem.');
    else notes.push(N[pub.players.find(p => p.id !== h.winner).id] + ' loses a gem.');
    if (h.nrDraw) notes.push(N[h.nrDraw] + ' draws a card for winning (Northern Realms).');
    if (h.winDraw) notes.push(N[h.winDraw] + ' draws for winning (a trinket).');
    (h.keep || []).forEach(k => { const kp = pub.players.find(p => p.id === k.by); notes.push(D.nameOf(k.card) + ' stays on ' + N[k.by] + '’s side for the next round' + (kp && kp.fac === 'mo' ? ' (Monsters).' : '.')); });
    const out = h.gems.some(x => x <= 0);
    if (out) notes.push(h.gems.every(x => x <= 0) ? 'Both are out of gems.' : N[pub.players[h.gems.indexOf(0)].id] + ' is out of gems.');
    return '<div class="rc-h">' + esc(title) + '</div><div class="rc-sc">' + rows + '</div>' +
      '<div class="rc-sec"><ul>' + notes.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  }

  const Words = { VERSION, lines, html, esc, CHOSE, roundStartHtml, roundEndHtml, roundLine, gemsHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = Words;
  else root.GwentWords = Words;
})(typeof window !== 'undefined' ? window : this);
