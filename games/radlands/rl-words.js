'use strict';
/* Radlands — the public log as one line a move, shared by the telly and the
   phones (LESSONS-CHECKLIST D: "one line per move with what it earned").
   A move (play, junk, use, an event going off) starts a line; everything it
   caused — damage, deaths, draws, water, punks — is folded into that line. */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./rl-data.js') : root.RadData;
  const VERSION = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const HEAD = { turn: 1, start: 1, camps: 1, enter: 1, event: 1, goesoff: 1, junk: 1, use: 1, buy: 1, silo: 1, reshuffle: 1, over: 1, raid: 0 };
  /* Moves a player chose (for "since your last turn"). */
  const CHOSE = { enter: 1, event: 1, junk: 1, use: 1, buy: 1, silo: 1 };
  const FX = { damage: 'damage', injure: 'injure', restore: 'restore', draw: 'draw', water: 'extra water', punk: 'a punk', raid: 'raid' };

  function names(pub) { const m = {}; if (pub) pub.players.forEach(p => { m[p.id] = p.name; }); return m; }
  const nm = id => D.nameOf(id);

  function clause(e, N) {
    const of = e.of ? N[e.of] + '’s ' : '';
    const what = e.camp ? nm(e.card) : (e.punk ? 'punk' : (e.card ? nm(e.card) : 'card'));
    switch (e.t) {
      case 'hit':
        if (e.res === 'damaged') return (e.how === 'injure' ? 'injures ' : e.how === 'self' ? 'damages its own ' : 'damages ') + (e.how === 'self' ? what : of + what);
        if (e.how === 'room') return 'clears ' + what + ' to make room';
        if (e.how === 'own') return 'gives up ' + (e.punk ? 'a punk' : what);
        if (e.how === 'octagon') return N[e.of] + ' must give up ' + (e.punk ? 'a punk' : what);
        if (e.how === 'famine') return N[e.of] + ' loses ' + (e.punk ? 'a punk' : what);
        if (e.how === 'adrenaline') return what + ' burns out';
        return (e.camp ? 'destroys ' : 'kills ') + of + what;
      case 'campDown': return e.setup ? N[e.of] + '’s ' + nm(e.card) + ' starts destroyed' : '— ' + N[e.of] + ' has ' + e.left + ' camp' + (e.left === 1 ? '' : 's') + ' left';
      case 'restore': return 'restores ' + (e.of === e.by ? '' : of) + (e.camp ? nm(e.card) : (e.punk ? 'a punk' : nm(e.card)));
      case 'draw': return e.why === 'replenish' ? null : 'draws ' + e.n;
      case 'discard': return 'discards ' + e.cards.map(c => c === 'silo' ? 'the Water Silo' : nm(c)).join(', ');
      case 'water': return '+' + e.n + ' water';
      case 'punk': return 'gains a punk';
      case 'enter': return e.how === 'parachute' ? 'drops in ' + nm(e.card) : null;
      case 'flip': return null;
      case 'reveal': return 'the punk was ' + nm(e.card);
      case 'raid':
        if (e.res === 'out') return 'the Raiders ride out (' + e.slot + ' turn' + (e.slot === 1 ? '' : 's') + ' away)';
        if (e.res === 'closer') return 'the Raiders close in (' + e.slot + ' away)';
        if (e.res === 'now') return 'the Raiders strike';
        if (e.res === 'blocked') return 'the Raiders are stuck behind another event';
        return 'no room in the queue for the Raiders';
      case 'tohand': return (e.of === e.by ? 'picks up ' : 'sends back ') + of + (e.punk ? 'a punk' : nm(e.card));
      case 'mill': return 'turns over ' + e.cards.map(nm).join(', ');
      case 'borrow': return 'uses its junk (' + FX[e.fx] + ')';
      case 'pushback': return 'pushes ' + N[e.of] + '’s events back';
      case 'highground': return 'every one of their cards is open this turn';
      case 'advance': return e.now ? 'sets off ' + N[e.of] + '’s ' + nm(e.card) + ' early' : 'moves ' + N[e.of] + '’s ' + nm(e.card) + ' up to space ' + e.slot;
      case 'roll': return e.moves === 3 ? 'the Juggernaut comes home' : 'the Juggernaut rolls forward (' + e.moves + ' of 3)';
      case 'rebuild': return 'rebuilds ' + nm(e.card);
      case 'copy': return 'copying ' + nm(e.card);
      case 'miss': return 'nothing to hit';
      case 'goesoff': return nm(e.card) + ' goes off';
      case 'use': return 'uses ' + nm(e.card);
      case 'event': return 'plays ' + nm(e.card);
    }
    return null;
  }

  function head(e, N) {
    const who = N[e.by] || '?';
    switch (e.t) {
      case 'turn': return who + '’s turn';
      case 'start': return who + ' goes first. Hands: ' + e.hands.join(' and ') + ' cards.';
      case 'camps': return 'Camps — ' + e.camps.map(c => N[c.by] + ': ' + c.ids.map(nm).join(', ')).join(' · ');
      case 'enter': return who + ' plays ' + nm(e.card);
      case 'event': return e.now ? who + ' sets off ' + nm(e.card) + (e.zeto ? ' (Zeto: at once)' : '') : who + ' queues ' + nm(e.card) + ' — goes off in ' + e.slot + ' turn' + (e.slot === 1 ? '' : 's');
      case 'goesoff': return e.card === 'raiders' ? who + '’s Raiders arrive' : who + '’s ' + nm(e.card) + ' goes off';
      case 'junk': return who + ' junks ' + (e.card === 'silo' ? 'the Water Silo' : nm(e.card)) + ' for ' + FX[e.fx];
      case 'use': return who + ' uses ' + (e.punk && e.card === 'argo_yesky' ? 'a punk (Argo’s gift)' : nm(e.card)) + (e.via ? ' through ' + nm(e.via) : '') + (e.vera ? ' (Vera keeps it ready)' : '');
      case 'buy': return who + ' pays two water for a card';
      case 'silo': return who + ' takes the Water Silo';
      case 'reshuffle': return 'The deck runs out and is reshuffled — the next time it runs out, the game is a draw';
      case 'over': return e.how === 'deck' ? 'The deck has run out twice: the game is a draw' : who + ' has destroyed every camp';
      case 'raid': return who + ' raids';
    }
    return who;
  }

  /* lines(log, pub, base): base is the absolute index of log[0]. */
  function lines(log, pub, base) {
    const N = names(pub);
    base = base || 0;
    const out = [];
    let cur = null;
    log.forEach((e, k) => {
      if (e.t === 'die' || e.t === 'endturn' || e.t === 'flip') return;
      if (e.t === 'enter' && e.how !== 'play') { if (cur && e.how === 'parachute') cur.bits.push(clause(e, N)); return; }
      const isHead = HEAD[e.t] || (e.t === 'raid' && !cur);
      if (isHead || !cur) {
        cur = { i: base + k, by: e.by || null, t: e.t, turn: e.t === 'turn', card: e.card || null, head: head(e, N), bits: [] };
        out.push(cur);
        if (e.t === 'turn' || e.t === 'start' || e.t === 'camps' || e.t === 'reshuffle' || e.t === 'over') cur = e.t === 'turn' ? cur : null;
        if (e.t === 'turn') { cur.text = cur.head; return; }
        return;
      }
      const c = clause(e, N);
      if (c) cur.bits.push(c);
    });
    for (const l of out) l.text = l.head + (l.bits.length ? ': ' + l.bits.join(', ') : '') + (l.turn ? '' : '.');
    return out.filter(l => !(l.turn && l.bits.length === 0 && false));
  }
  function html(l, pub) {
    const p = pub && pub.players.find(x => x.id === l.by);
    const t = esc(l.text);
    if (!p) return t;
    const n = esc(p.name);
    return t.indexOf(n) === 0 ? '<b style="color:' + esc(p.hex) + '">' + n + '</b>' + t.slice(n.length) : t;
  }

  /* The card that opens the game (checklist D: "open on its own card"). */
  function startCardHtml(pub) {
    const first = pub.players.find(p => p.id === pub.start);
    const rows = pub.players.map(p => '<div class="rc-p"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b>' +
      (p.bot ? '<span class="rc-role">house · ' + esc(p.level) + '</span>' : '') +
      '<span class="rc-t">' + p.camps.map(c => esc(D.nameOf(c.id)) + (c.dead ? ' (destroyed)' : '')).join(' · ') + '</span>' +
      '<span class="rc-d">' + p.handN + ' cards</span></div>').join('');
    return '<div class="rc-h">The wasteland</div>' +
      '<div class="rc-sub">Destroy all three of the other player’s camps. <b>' + esc(first ? first.name : '?') + '</b> goes first — with just one water on that first turn.</div>' +
      '<div class="rc-sc">' + rows + '</div>' +
      '<div class="rc-sec"><h4>A turn</h4><ul>' +
      '<li><b>Events</b> — the event in space 1 goes off; the rest move up a space.</li>' +
      '<li><b>Replenish</b> — draw a card and take three water.</li>' +
      '<li><b>Actions</b> — play people (two to a column, in front of your camps) and events, junk a card for its icon, use a ready card’s ability, buy a card for two water or the Water Silo for one.</li>' +
      '</ul></div>' +
      '<div class="rc-sec"><h4>Remember</h4><ul><li>Damage hits only an unprotected card — one with nothing of yours in front of it. A second damage destroys it; a punk dies at the first.</li>' +
      '<li>Raiders hit a camp of the victim’s choosing, protected or not.</li><li>The deck reshuffles once. If it runs out again, the game is a draw.</li></ul></div>';
  }

  const Words = { VERSION, lines, html, esc, CHOSE, FX, startCardHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = Words;
  else root.RadWords = Words;
})(typeof window !== 'undefined' ? window : this);
