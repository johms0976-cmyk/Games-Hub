'use strict';
/* 1960 — the public log as one line a move, shared by the telly and the
   phones (LESSONS-CHECKLIST D: "one line per move with what it earned"). A
   move (a card played, an event triggered, an initiative, a debate round)
   starts a line; everything it caused — support, checks drawn, momentum,
   issues, media, endorsements — is folded into it. Also the cards that hold
   the table: each turn's opening card, the Momentum phase page by page, the
   Debates and Election Day. */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./m60-data.js') : root.M60Data;
  const VERSION = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const HEAD = { deal: 1, first: 1, play: 1, trigger: 1, pass: 1, momStart: 1, strat: 1, debateStart: 1, dreveal: 1, dwon: 1, debateEnd: 1, bonus: 1, edayCards: 1, edayEvent: 1, tips: 1, over: 1, init: 1 };
  /* Moves a player chose (for "since your last turn" and undo's wording). */
  const CHOSE = { play: 1, trigger: 1, pass: 1 };
  const SN = s => s ? D.SIDE[s].name : 'nobody';
  const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const num = n => NUM[n] || String(n);
  const cn = id => id === 'K' || id === 'N' ? 'the ' + D.SIDE[id].name + ' candidate card' : D.CARD[id] ? D.CARD[id].name : String(id);
  const HOW = { camp: 'campaigning', adv: 'advertising', pos: 'positioning on issues' };
  const cubeWord = c => c === 'K' ? 'blue' : c === 'N' ? 'red' : 'none';
  const ST = st => st ? st : '';
  const FXW = {
    knee: 'Nixon must spend 1 momentum to Campaign', cpUp: s => SN(s) + '’s cards +1 CP', kenAir: 'Kennedy travels free, Campaigning +1 CP',
    profiles: 'Kennedy redraws failed checks', noMom: s => SN(s) + ' may not spend momentum', hostile: 'Nixon checks everywhere he Campaigns',
    ikeSilence: 'Nixon may not Campaign where Kennedy leads', pledge: 'Kennedy +1 momentum when Nixon does not Campaign',
    peaceCorps: 'Kennedy preempts free', jackie: 'Nixon’s events cost 1 momentum', stature: 'Kennedy’s Positioning −2 CP',
    cpDown: 'Kennedy’s cards −2 CP', advance: s => SN(s) + ' travels free, no checks', noCamp: s => SN(s) + ' barred from Campaigning in some regions',
    oldSouth: s => SN(s) + ' may not Campaign in the South'
  };
  function fxWords(f) { const w = FXW[f.key]; return typeof w === 'function' ? w(f.side) : (w || f.key); }

  function cubesTxt(cubes, side) {
    const got = cubes.filter(c => c === side).length;
    return got + ' of ' + cubes.length;
  }
  function clause(e, cur) {
    switch (e.t) {
      case 'sup': return (!cur.side || e.side !== cur.side ? SN(e.side) + ' ' : '') + '+' + e.n + ' ' + e.st;
      case 'lose': return e.st ? SN(e.side) + ' −' + e.n + ' ' + e.st : (e.n ? null : SN(e.side) + ' had nothing to lose');
      case 'checks': return e.rows.map(r => (r.st ? r.st + ': ' : 'checks: ') + cubesTxt(r.cubes, e.side) + ' drawn ' + SN(e.side)).join(', ');
      case 'mom': return e.n ? (!cur.side || e.side !== cur.side ? SN(e.side) + ' ' : '') + (e.n > 0 ? '+' : '−') + Math.abs(e.n) + ' momentum' : (e.level ? 'momentum already level' : e.want < 0 ? SN(e.side) + ' had no momentum to lose' : null);
      case 'iss': return e.n ? SN(e.side) + ' ' + (e.n > 0 ? '+' : '−') + Math.abs(e.n) + ' ' + D.issueName(e.iss) : null;
      case 'media': return e.n ? SN(e.side) + ' +' + e.n + ' media in the ' + D.REGION[e.reg].name : (e.reg === null ? 'no media cubes drawn' : null);
      case 'mediaOff': return e.n ? SN(e.side) + ' −' + e.n + ' media in the ' + D.REGION[e.reg].name : 'no media to remove';
      case 'endorse': return SN(e.side) + (e.removed ? ' removes an endorsement in the ' : ' endorsed in the ') + D.REGION[e.reg].name;
      case 'tok': return e.via === 'camp' ? null : SN(e.side) + ' to ' + D.STATE[e.st].name;
      case 'travel': return 'travels to ' + D.STATE[e.st].name + (e.cost ? ' (' + e.cost + ' CP)' : ' (free)');
      case 'fx': return 'this turn: ' + fxWords(e);
      case 'cand': return e.via ? (e.ready ? SN(e.side) + '’s candidate card is ready again' : e.already ? SN(e.side) + '’s candidate card was already exhausted' : SN(e.side) + '’s candidate card is exhausted') : null;
      case 'retrieve': return e.card ? SN(e.side) + ' takes ' + cn(e.card) + ' from the discards' : (e.want ? cn(e.want) + ' is not in the discards' : 'nothing taken from the discards');
      case 'draw': return SN(e.side) + ' draws ' + num(e.n) + ' card' + (e.n === 1 ? '' : 's');
      case 'swap': return SN(e.side) + ' changes ' + num(e.n) + ' card' + (e.n === 1 ? '' : 's');
      case 'up': return e.from === e.to ? D.issueName(e.iss) + ' is already first' : D.issueName(e.iss) + ' up to ' + ['first', 'second', 'third'][e.to];
      case 'order': return 'issues now ' + e.order.map(D.issueName).join(', ');
      case 'gm': return e.side ? SN(e.side) + ' leads the ' + D.REGION[e.reg].name + ' ' + Math.max(e.K, e.N) + ' states to ' + Math.min(e.K, e.N) : 'the ' + D.REGION[e.reg].name + ' is level (' + e.K + ' each): nothing happens';
      case 'hh': return 'turns over ' + cn(e.card) + (e.ok ? ' — it takes effect' : ' — no Kennedy icon, discarded');
      case 'oppo': return 'Kennedy shows Nixon his hand (' + num(e.n) + ' cards)';
      case 'reseed': return 'the bag is empty: 12 cubes each go back in';
      case 'nobody': return e.what === 'media' ? 'no media support to use' : e.what === 'swing' ? 'no state qualifies' : 'nobody qualifies';
      case 'cond': return e.ok ? null : 'the condition is not met: nothing happens';
      case 'persist': return { prev: 'stays on the board as a Prevention event', debate: 'kept for the Debates', eday: 'kept for Election Day' }[e.where];
      case 'notrigger': return null;
      case 'campEnd': return e.left + ' CP unspent';
      case 'decay': return null;
    }
    return null;
  }
  function head(e) {
    const who = SN(e.side);
    switch (e.t) {
      case 'deal': return 'Turn ' + e.tn + ': ' + num(e.n) + ' cards each';
      case 'init': return 'Initiative' + (e.why === 'debates' ? ' for the Debates' : e.why === 'election' ? ' for Election Day' : '') + ': ' + e.cubes.map(cubeWord).join(', ') + ' — ' + SN(e.winner);
      case 'first': return who + ' has the initiative: ' + (e.first === e.side ? who + ' plays first' : SN(e.first) + ' plays first');
      case 'play':
        if (e.cand) return who + ' plays the candidate card, ' + e.cp + ' CP ' + HOW[e.how];
        if (e.how === 'event') return who + ' plays ' + cn(e.card) + ' as an event';
        return who + ' plays ' + cn(e.card) + ', ' + e.cp + ' CP ' + HOW[e.how] + (e.pre ? ' (preempted)' : '');
      case 'trigger': return who + ' spends a momentum to trigger ' + cn(e.card);
      case 'pass': return who + (e.why ? ' has no card to play' : ' passes');
      case 'momStart': return 'Momentum phase';
      case 'strat': return 'Campaign Strategy';
      case 'debateStart': return 'The Debates: ' + SN(e.init) + ' has the initiative';
      case 'dreveal': return 'Debate round ' + e.round + ': ' + [e.K != null ? 'Kennedy plays ' + cn(e.K) : null, e.N != null ? 'Nixon plays ' + cn(e.N) : null].filter(Boolean).join(', ');
      case 'dwon': return who + ' wins ' + D.issueName(e.iss) + ', ' + Math.max(e.K, e.N) + ' to ' + Math.min(e.K, e.N) + (e.tie ? ' (a tie: the initiative)' : '') + ' — ' + e.award + ' state support';
      case 'debateEnd': return 'The Debates are over';
      case 'bonus': return 'Election Day: bonus cubes into the bag';
      case 'edayCards': return who + ' turns over ' + e.cards.length + ' Campaign Strategy card' + (e.cards.length === 1 ? '' : 's');
      case 'tips': { const by = s => e.tips.filter(x => x.side === s).map(x => x.st); return 'The undecided states fall: ' + D.SIDES.map(s => SN(s) + ' ' + (by(s).length ? by(s).join(' ') : 'none')).join(' · '); }
      case 'over': return e.side ? SN(e.side) + ' wins the election, ' + e.ev[e.side] + ' electoral votes to ' + e.ev[D.other(e.side)] : 'The election is tied, ' + e.ev.K + ' each';
    }
    return who;
  }

  /* lines(log, pub, base): base is the absolute index of log[0]. */
  function lines(log, pub, base) {
    base = base || 0;
    const out = [];
    let cur = null;
    log.forEach((e, k) => {
      if (HEAD[e.t]) {
        if (e.t === 'init' && log[k + 1] && log[k + 1].t === 'first') return;    // the first-player line says it
        if (e.t === 'strat' && cur && cur.t === 'strat') { cur.bits.push(SN(e.side) + ' keeps ' + num(e.n)); return; }
        cur = { i: base + k, side: e.side || null, t: e.t, card: e.card || null, head: head(e), bits: [], tn: e.tn, ap: e.ap,
          turn: e.t === 'deal' || e.t === 'momStart' || e.t === 'debateStart' || e.t === 'bonus' };
        if (e.t === 'strat') cur.bits.push(SN(e.side) + ' keeps ' + num(e.n));
        if (e.t === 'dwon') cur.side = e.side;
        out.push(cur);
        if (e.t === 'over') cur = null;
        return;
      }
      if (!cur) return;
      if (e.t === 'rest' && cur.t === 'strat') { cur.bits.push('rest cubes into the bag (' + e.rest.K + ' blue, ' + e.rest.N + ' red)'); return; }
      const c = clause(e, cur);
      if (c) cur.bits.push(c);
    });
    for (const l of out) {
      l.by = l.side ? (pub ? (pub.players.find(p => p.side === l.side) || {}).id : null) : null;
      l.text = l.head + (l.bits.length ? ': ' + l.bits.join(', ') : '') + (l.turn ? '' : '.');
    }
    return out;
  }
  function html(l, pub) {
    const t = esc(l.text);
    if (!l.side) return t;
    const n = esc(D.SIDE[l.side].name);
    const p = pub && pub.players.find(x => x.side === l.side);
    return t.indexOf(n) === 0 ? '<b style="color:' + esc(D.SIDE[l.side].hex) + '">' + n + '</b>' + t.slice(n.length) + (p && p.bot ? '' : '') : t;
  }

  /* ---------------- the cards that hold the table ---------------- */
  const who = (pub, s) => { const p = pub.players.find(x => x.side === s); return p ? p.name : D.SIDE[s].name; };
  const dot = s => '<i style="background:' + D.SIDE[s].hex + '"></i>';
  function sideRow(pub, s, extra) {
    const p = pub.players.find(x => x.side === s);
    const ev = D.leadingEv(pub.sup);
    return '<div class="rc-p">' + dot(s) + '<b>' + esc(D.SIDE[s].name) + '</b><span class="rc-role">' + esc(p ? p.name + (p.bot ? ' · house · ' + p.level : '') : '') + '</span>' +
      '<span class="rc-t">' + pub.mom[s] + ' momentum · ' + (pub.cand[s] ? 'candidate card ready' : 'candidate card exhausted') + ' · leads states worth ' + ev[s] + ' votes · ' + pub.handN[s] + ' cards in hand' + (extra ? ' · ' + extra : '') + '</span></div>';
  }
  function issuesLine(pub) {
    return pub.order.map((i, k) => ['First', 'Second', 'Third'][k] + ': ' + D.issueName(i) + (D.leadOf(pub.iss[i]) ? ' (' + SN(D.leadOf(pub.iss[i])) + ' ' + Math.abs(pub.iss[i]) + ')' : ' (nobody)')).join(' · ');
  }
  function turnStartHtml(pub, h) {
    const t = h.turn;
    const left = t < 6 ? (6 - t === 1 ? 'The Debates are next turn.' : 'The Debates in ' + (6 - t) + ' turns.') : (9 - t === 1 ? 'Election Day is next.' : 'Election Day in ' + (9 - t) + ' turns.');
    let out = '<div class="rc-h">Turn ' + t + ' of 9</div><div class="rc-sub"><b>' + esc(SN(h.init)) + '</b> won the initiative and chose <b>' + esc(SN(h.first)) + '</b> to play first in all five activity phases. ' + esc(left) + '</div>' +
      '<div class="rc-sc">' + sideRow(pub, 'K') + sideRow(pub, 'N') + '</div>' +
      '<div class="rc-sec"><h4>The issues</h4><ul><li>' + esc(issuesLine(pub)) + '</li></ul></div>';
    if (t === 1 && !pub.teach) {
      out += '<div class="rc-sec"><h4>A turn</h4><ul>' +
        '<li>Five activity phases: each player plays <b>one card</b> a phase — as its <b>event</b>, or for its <b>CP</b> to Campaign (support in states of the region your candidate is in, 1 CP each; crossing into another region costs 1 CP), Advertise (a support check a CP, for media cubes) or Position (issue cubes: 1 CP, then 2 more for each extra on the same issue).</li>' +
        '<li>Played for CP, the card’s event can be <b>triggered</b> by the other side for 1 momentum — unless you spend 2 to preempt it.</li>' +
        '<li>Where the other side carries a state (4+ cubes) or stands in it, each CP is a <b>support check</b>: a cube drawn from the bag, yours or nothing. Media support in that region spares you the checks.</li>' +
        '<li>Keep one card back each turn for the Debates (high CP, your own icon), and two after the Debates for Election Day (the state on the card).</li></ul></div>';
    } else if (t === 7) {
      out += '<div class="rc-sec"><h4>After the Debates</h4><ul><li>Seven cards a turn now, and <b>two</b> go aside each turn for Election Day: each is three support checks in the state printed on it.</li></ul></div>';
    }
    return out;
  }
  /* The Momentum phase, page by page (the rulebook's four steps). */
  const MOM_STEPS = ['Momentum decay', 'Issue shift', 'Awards', 'Issue decay'];
  function momPages(pub, h, log) {
    const ev = log;
    const pages = [];
    const decay = ev.find(e => e.t === 'decay');
    pages.push({ step: 0, title: 'Momentum decay', what: 'Each side throws away half its momentum markers, rounded down.',
      items: decay ? D.SIDES.map(s => SN(s) + ' loses ' + decay.lost[s] + ', keeps ' + decay.left[s]) : [] });
    const sh = ev.find(e => e.t === 'shift');
    pages.push({ step: 1, title: 'Issue shift', what: 'Whoever has more media cubes on the board may swap two neighbouring issues.',
      items: [!sh || !sh.side ? 'Media support is level' + (sh && sh.media ? ' (' + sh.media[0] + ' each)' : '') + ': nobody shifts the issues.' : sh.order ? SN(sh.side) + ' shifts them: ' + sh.order.map(D.issueName).join(', ') + '.' : SN(sh.side) + ' leaves them as they are.'] });
    const aw = [];
    ev.forEach(e => {
      if (e.t === 'award') aw.push(['Third', 'Second', 'First'][2 - e.pos] + ' issue, ' + D.issueName(e.iss) + ': ' + (e.side ? SN(e.side) + (e.what === 'mom' ? ' takes 1 momentum' : e.what === 'end' ? ' takes an endorsement' : ' takes 1 momentum and an endorsement') : 'nobody leads it'));
      if (e.t === 'endorse') aw.push(SN(e.side) + (e.removed ? ' removes one of the other side’s endorsements in the ' : ' puts an endorsement in the ') + D.REGION[e.reg].name + (e.via === 'major' ? ' (a Major Endorsement)' : ''));
    });
    pages.push({ step: 2, title: 'Awards', what: 'Third issue: 1 momentum. Second: 1 momentum or an endorsement. First: both.', items: aw });
    const dc = ev.find(e => e.t === 'issDecay');
    const dl = dc ? Object.keys(dc.dec).map(i => SN(dc.dec[i]) + ' loses a cube on ' + D.issueName(i)) : [];
    pages.push({ step: 3, title: 'Issue decay', what: 'One cube comes off every issue that has any.', items: dl.length ? dl : ['No issue had any cubes.'] });
    return pages;
  }
  function stripHtml(cur) {
    return '<div class="rc-strip">' + MOM_STEPS.map((s, k) => '<span class="' + (k === cur ? 'on' : k < cur ? 'done' : '') + '">' + esc(s) + '</span>').join('') + '</div>';
  }
  function momHtml(pub, h, log, page) {
    const pages = momPages(pub, h, log);
    const all = page == null || page >= pages.length;
    let out = '<div class="rc-h">Momentum phase · turn ' + h.turn + '</div>' + stripHtml(all ? 4 : page);
    const show = all ? pages : [pages[page]];
    out += show.map(p => '<div class="rc-sec"><h4>' + esc(p.title) + '</h4><div class="rc-what">' + esc(p.what) + '</div><ul>' + p.items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>').join('');
    if (all) out += '<div class="rc-sc">' + sideRow(pub, 'K') + sideRow(pub, 'N') + '</div><div class="rc-sec"><h4>Next</h4><ul><li>' + esc(h.turn < 5 ? 'Campaign Strategy: each side puts one card aside for the Debates.' : h.turn === 5 ? 'Campaign Strategy: the last card for the Debates — then the Debates.' : h.turn === 7 ? 'Campaign Strategy: two cards each for Election Day.' : 'Campaign Strategy: two more for Election Day — then Election Day.') + '</li></ul></div>';
    return out;
  }
  /* ================================================================
     How to play: the lessons (ARCHITECTURE.md, "What a newcomer meets,
     ranked"). One idea a card, said in a few short lines, with the live
     board as the example wherever there is one. Five before the first card;
     the rest the first time they bite.
     ================================================================ */
  function lessonBody(pub, id) {
    const ev = D.leadingEv(pub.sup);
    const big = D.STATES.slice().sort((a, b) => D.STATE[b].ev - D.STATE[a].ev).slice(0, 3).map(s => D.STATE[s].name + ' ' + D.STATE[s].ev).join(', ');
    switch (id) {
      case 'votes': return { h: 'The goal: 269 electoral votes', li: [
        'Every state is worth its electoral votes — ' + big + '. There are 537 in all; <b>269 wins</b>.',
        'Cubes in a state mean you <b>lead</b> it: on Election Day it gives you all its votes. Blue cubes are Kennedy’s, red are Nixon’s, and a state never holds both — adding a cube where the other side has some takes one of theirs off instead.',
        'An empty state goes to whoever has an <b>endorsement</b> in its region, or else to the side printed on its edge.',
        'Right now: Kennedy leads states worth <b>' + ev.K + '</b>, Nixon <b>' + ev.N + '</b>.'], tip: 'The board on the telly is the map. A state’s box shows its votes and its cubes.', tipSolo: 'The Map tab is the board: the whole country, then one region at a time. A state’s box shows its votes and its cubes.' };
      case 'cards': return { h: 'A card is points — or an event', li: [
        'Every card has <b>campaign points</b> (CP, the big number) and an <b>event</b>.',
        'Spend the CP one of three ways: <b>Campaign</b> — a cube a CP in the states of your candidate’s region, 1 CP to cross into the next region; <b>Advertise</b> — a draw from the bag a CP for media cubes; or <b>Position</b> on the three issues.',
        'Or play the <b>event</b> instead. An event that helps you shows your candidate’s face.',
        'Your <b>candidate card</b> is a 5 CP card you can play once; then it is exhausted.'], tip: 'On your phone, tap a card: every way to play it is at the bottom, with its CP.' };
      case 'checks': return { h: 'Carrying a state, and the bag', li: [
        'Four or more cubes and you <b>carry</b> the state.',
        'Campaigning where the other side carries the state, or where their candidate stands, takes <b>support checks</b>: a cube from the bag for each CP, and only your colour counts.',
        '<b>Media cubes</b> in a region spare you the checks there.',
        'The bag holds <b>' + pub.bag.K + '</b> blue and <b>' + pub.bag.N + '</b> red. The rest cubes on the cards you play go into it at the end of each turn — so playing cards with rest cubes fills the bag in your colour.'], tip: 'Every draw comes out on the telly one cube at a time before it counts.', tipSolo: 'Every draw comes out of the bag on your phone one cube at a time before it counts.' };
      case 'faces': return { h: 'Whose face is on the card', li: [
        'Play a card for its CP and the other side may <b>trigger</b> its event for <b>1 momentum</b>, as if they had played it themselves.',
        'So a card showing the <b>other candidate’s face</b> is a gift to them unless you plan for it: pay <b>2 momentum</b> as you play it to <b>preempt</b> them.',
        'Kennedy has <b>' + pub.mom.K + '</b> momentum and Nixon <b>' + pub.mom.N + '</b>; leading the issues earns more at the end of every turn.'], tip: 'Your phone warns you before you play a card the other side could trigger, and asks you when you can trigger one of theirs.' };
      case 'turns': return { h: 'Nine turns', li: [
        'A turn: <b>five cards each</b>, one at a time. Then the <b>Momentum phase</b>, and each side keeps a card face down.',
        'Turn 6 is <b>the Debates</b>: the cards you kept fight over the three issues.',
        'Turn 9 is <b>Election Day</b>: the last cubes go in, then the votes are counted.'], tip: 'In this game a coach on your phone suggests a card every turn, and says why. Take its advice or don’t — it is the hard house’s own pick, and it never sees the other hand.' };
      case 'momentum': return { h: 'The Momentum phase', li: [
        'Momentum markers are <b>halved</b>, rounded down.',
        'Whoever has more <b>media cubes</b> may swap two neighbouring issues on the track.',
        'Each issue pays whoever leads it: third place <b>1 momentum</b>; second, 1 momentum <b>or</b> an endorsement; first, <b>both</b>.',
        '<b>Endorsements</b> are markers in a region: on Election Day they hand that region’s empty states to you.',
        'Then every issue loses one cube.'], tip: 'The issues track now: ' + esc(issuesLine(pub)) + '.' };
      case 'strategy': return { h: 'Keeping cards back', li: [
        'Now each side puts <b>one card face down</b>. The five you keep before turn 6 are your whole hand for <b>the Debates</b>.',
        'Keep cards with <b>high CP</b> that show <b>your own face</b>; the issue icon on a card is where it fights.',
        'Gathering Momentum cards cannot be kept. Anything else left in your hand is discarded.'], tip: 'The coach marks the cards worth keeping while you play.' };
      case 'eday': return { h: 'Cards for Election Day', li: [
        'From now on <b>two cards a turn</b> go face down, for Election Day.',
        'On Election Day each is <b>three support checks</b> in the state printed on it: keep cards naming big, close states you want.',
        'Bonus cubes go in the bag for your media, issues and momentum before they are drawn.'], tip: 'Seven cards a turn now, so there is more to choose from.' };
    }
    return { h: id, li: [], tip: '' };
  }
  function lessonHtml(pub, h, solo) {
    const L = lessonBody(pub, h.id);
    if (solo && L.tipSolo) L.tip = L.tipSolo;
    return '<div class="rc-what">' + (h.of ? 'How to play · lesson ' + h.i + ' of ' + h.of : 'How to play · a new rule') + '</div>' +
      '<div class="rc-h">' + esc(L.h) + '</div>' +
      '<div class="rc-sec"><ul>' + L.li.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
      (L.tip ? '<div class="rc-sub" style="margin-top:1vh;color:var(--gold)">' + L.tip + '</div>' : '');
  }
  function debateStartHtml(pub, h) {
    const d = pub.debate;
    return '<div class="rc-h">The Debates</div><div class="rc-sub"><b>' + esc(SN(h.init)) + '</b> has the initiative: every tie goes that way.</div>' +
      '<div class="rc-sec"><h4>How it goes</h4><ul>' +
      '<li>Each side has the Campaign Strategy cards it kept: Kennedy ' + d.handN.K + ', Nixon ' + d.handN.N + '.</li>' +
      '<li>Each round both choose a card and turn it over together. It goes to its issue, on the side of the candidate whose icon it shows (both icons: its player chooses).</li>' +
      '<li>When one side of an issue has two cards, the bigger CP total wins it. The first issue won is worth 2 state support anywhere, the second 3, the last 4 — no checks.</li>' +
      (pub.board.debate.length ? '<li>In effect: ' + esc(pub.board.debate.map(c => D.CARD[c].name).join(', ')) + '.</li>' : '') +
      '</ul></div><div class="rc-sec"><h4>The issues, first place first</h4><ul><li>' + esc(d.pos.map(D.issueName).join(' · ')) + '</li></ul></div>';
  }
  function debateEndHtml(pub) {
    const d = pub.debate;
    return '<div class="rc-h">The Debates are over</div>' +
      '<div class="rc-sec"><ul>' + d.won.map(w => '<li>' + esc(SN(w.side) + ' won ' + D.issueName(w.iss) + ', ' + Math.max(w.K, w.N) + ' to ' + Math.min(w.K, w.N) + (w.tie ? ' on the initiative' : '') + ': ' + w.award + ' state support.') + '</li>').join('') + '</ul></div>' +
      '<div class="rc-sec"><h4>The issues track now</h4><ul><li>' + esc(issuesLine(pub)) + '</li></ul></div>' +
      '<div class="rc-sc">' + sideRow(pub, 'K') + sideRow(pub, 'N') + '</div>' +
      '<div class="rc-sec"><h4>Next</h4><ul><li>Turn 7: seven cards each, and two a turn go aside for Election Day.</li></ul></div>';
  }
  function edayStartHtml(pub, h) {
    const b = pub.eday.bonus;
    return '<div class="rc-h">Election Day</div><div class="rc-sub"><b>' + esc(SN(h.init)) + '</b> has the initiative and goes first.</div>' +
      '<div class="rc-sec"><h4>Into the bag</h4><ul>' + D.SIDES.map(s => '<li>' + esc(SN(s) + ': ' + b[s].media + ' media (and as many again), ' + b[s].issues + ' issue, ' + b[s].mom + ' momentum × 2 — ' + b[s].total + ' cubes.') + '</li>').join('') +
      '<li>' + esc('The bag holds ' + pub.bag.K + ' blue and ' + pub.bag.N + ' red. It is not refilled now.') + '</li></ul></div>' +
      '<div class="rc-sec"><h4>What happens</h4><ul><li>Each Campaign Strategy card: three support checks in the state on it.</li>' +
      (pub.board.eday.length ? '<li>Then the Election Day events: ' + esc(pub.board.eday.map(c => D.CARD[c].name).join(', ')) + '.</li>' : '') +
      '<li>Every state still empty goes to whoever has an endorsement in its region, or else to its printed edge.</li><li>Then the votes are counted: 269 wins.</li></ul></div>';
  }
  function tipsHtml(pub, h) {
    const by = { K: [], N: [] };
    h.tips.forEach(x => by[x.side].push(x));
    return '<div class="rc-h">The undecided states</div>' + D.SIDES.map(s => '<div class="rc-sec"><h4>' + esc(SN(s)) + '</h4><ul><li>' +
      (by[s].length ? esc(by[s].map(x => x.st + (x.why === 'endorse' ? ' (endorsement)' : ' (edge)')).join(', ')) : 'none') + '</li></ul></div>').join('');
  }

  const Words = { VERSION, lines, html, esc, CHOSE, turnStartHtml, momHtml, momPages, MOM_STEPS, debateStartHtml, debateEndHtml, edayStartHtml, tipsHtml, lessonHtml, lessonBody, issuesLine, fxWords, cn };
  if (typeof module !== 'undefined' && module.exports) module.exports = Words;
  else root.M60Words = Words;
})(typeof window !== 'undefined' ? window : this);
