'use strict';
/* Twilight Struggle — the words. One line per thing that happened, shared by
 * the telly's crier and the phone's feed (LESSONS-CHECKLIST D, "one line per
 * move with what it earned"), and the held cards: the turn opening, a region
 * scored, the turn closing, final scoring.
 *
 * Everything here reads the public view and the public log only.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./ts-data.js') : root.TSData;
  const VERSION = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const SN = s => (s ? D.SIDE[s].name : 'nobody');
  const CN = c => (D.COUNTRY[c] ? D.COUNTRY[c].name : c);
  const CARD = id => (D.CARD[id] ? D.CARD[id].name : '?');
  const RN = r => (r === 'SEA' ? 'Southeast Asia' : D.REGION[r] ? D.REGION[r].name : r);
  const vpWords = v => (v === 0 ? 'level' : (v > 0 ? 'USA ' : 'USSR ') + Math.abs(v));
  const HOW = { inf: 'influence', coup: 'a coup', realign: 'realignment' };
  /* The lines a player chose (the "Just now" reel and "since your last turn"
     count from these). */
  const CHOSE = { play: 1, pass: 1, defuse: 1, headline: 1 };

  /* Lines from the log. `base` is the absolute index of log[0], so a line
     knows its place in the whole game (the phone's feed counts on it). */
  function lines(log, pub, base) {
    const out = [];
    const by = s => { const p = s && pub.players.find(x => x.side === s); return p ? p.id : null; };
    const push = (e, i, text, side, extra) => out.push(Object.assign({ i: (base || 0) + i, t: e.t, tn: e.tn, side: side || null, by: by(side), text }, extra || {}));
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      switch (e.t) {
        case 'setup': push(e, i, 'The Cold War begins: the USSR sets up in Eastern Europe, then the USA in Western Europe.'); break;
        case 'deal': if (e.turn > 1) push(e, i, 'Turn ' + e.turn + ': both hands are dealt up to ' + D.RULES.hand(e.turn) + '.', null, { turn: true }); break;
        case 'era': push(e, i, (e.era === 'M' ? 'The Mid War' : 'The Late War') + ' begins: ' + e.n + ' new cards are shuffled into the deck.', null, { turn: true }); break;
        case 'reshuffle': push(e, i, 'The discards are shuffled into a new deck (' + e.n + ' cards).'); break;
        case 'inf': {
          /* A run of influence changes by one side for one reason is one line. */
          const run = [e];
          while (i + 1 < log.length && log[i + 1].t === 'inf' && log[i + 1].side === e.side && log[i + 1].via === e.via) run.push(log[++i]);
          const parts = run.map(x => (x.n > 0 ? '+' : '−') + Math.abs(x.n) + ' ' + CN(x.c));
          push(e, i, SN(e.side) + ' influence ' + parts.join(', ') + (e.via && e.via !== 'ops' && e.via !== 'event' ? ' (' + e.via + ')' : '') + '.', e.side, { cs: run.map(x => x.c) });
          break;
        }
        case 'vp': push(e, i, SN(e.side) + ' +' + e.n + ' VP' + (e.why ? ' (' + e.why + ')' : '') + ' — now ' + vpWords(e.vp) + '.', e.side, { vp: true }); break;
        case 'defcon': push(e, i, 'DEFCON ' + (e.to < e.from ? 'falls' : 'rises') + ' to ' + e.to + (e.why ? ' (' + e.why + ')' : '') + '.', null, { defcon: e.to }); break;
        case 'play': {
          const how = e.how === 'event' ? 'for its event' : e.how === 'space' ? 'into the space race' : 'for ' + e.ops + ' Ops: ' + HOW[e.how];
          const c = D.CARD[e.card];
          const theirs = c && c.side === D.other(e.side) && e.how !== 'event' && e.how !== 'space';
          push(e, i, SN(e.side) + ' plays ' + CARD(e.card) + ' ' + how + (theirs ? (e.evFirst ? ' — ' + SN(c.side) + '’s event first' : ' — then ' + SN(c.side) + '’s event') : '') + '.', e.side, { card: e.card });
          break;
        }
        case 'event': if (e.how === 'trigger') push(e, i, CARD(e.card) + ': the ' + SN(e.side) + '’s event happens.', e.side, { card: e.card }); else if (e.how === 'headline') push(e, i, 'Headline: ' + CARD(e.card) + ' (' + SN(e.by) + ').', e.by, { card: e.card }); break;
        case 'noevent': push(e, i, CARD(e.card) + ': its event cannot happen now.', null, { card: e.card }); break;
        case 'gone': push(e, i, CARD(e.card) + ' is removed from the game.', null, { card: e.card }); break;
        case 'pass': push(e, i, SN(e.side) + ' passes' + (e.why ? ' (' + e.why + ')' : '') + '.', e.side); break;
        case 'place': break;
        case 'noop': push(e, i, SN(e.side) + ': ' + e.why + '.', e.side); break;
        case 'coup': push(e, i, SN(e.side) + ' attempts a ' + (e.free ? 'free ' : '') + 'coup in ' + CN(e.c) + ' with ' + e.ops + ' Ops.', e.side, { cs: [e.c] }); break;
        case 'couped': {
          const tot = e.r + e.ops + e.mod, need = 2 * D.COUNTRY[e.c].stab;
          push(e, i, 'Coup in ' + CN(e.c) + ': rolled ' + e.r + ' + ' + e.ops + (e.mod ? (e.mod > 0 ? ' + ' : ' − ') + Math.abs(e.mod) : '') + ' = ' + tot + ' against ' + need + (e.net > 0 ? ' — ' + e.removed + ' removed' + (e.added ? ', ' + e.added + ' added' : '') : ' — it fails') + '.', e.side, { cs: [e.c] });
          break;
        }
        case 'realigned': {
          const a = e.rs + e.ms, b = e.ro + e.mo, o = D.other(e.side);
          push(e, i, 'Realignment in ' + CN(e.c) + ': ' + SN(e.side) + ' ' + e.rs + (e.ms ? '+' + e.ms : '') + ' against ' + SN(o) + ' ' + e.ro + (e.mo ? '+' + e.mo : '') +
            (a > b ? ' — ' + SN(o) + ' loses ' + e.removed : b > a ? ' — ' + SN(e.side) + ' loses ' + e.lost : ' — no change') + '.', e.side, { cs: [e.c] });
          break;
        }
        case 'spacetry': push(e, i, SN(e.side) + '’s space shot for ' + D.SPACE[e.box].name + ': rolled ' + e.r + ', needed 1-' + e.need + (e.ok ? ' — success!' : ' — it fails.'), e.side); break;
        case 'space': push(e, i, SN(e.side) + ' reaches ' + e.name + (e.first ? ' first' : '') + (e.vp ? ' (+' + e.vp + ' VP)' : '') + '.', e.side); break;
        case 'mil': break;
        case 'score': push(e, i, RN(e.r) + ' scored' + (e.final ? ' (final)' : '') + ': USA ' + e.us + ', USSR ' + e.su + (e.euroWin ? ' — ' + SN(e.euroWin) + ' controls Europe!' : e.net ? ' — ' + SN(e.net > 0 ? 'US' : 'SU') + ' +' + Math.abs(e.net) + ' VP' : ' — even') + '.', null, { score: e.r }); break;
        case 'shuttle': push(e, i, 'Shuttle Diplomacy takes one USSR battleground out of that count, and is discarded.'); break;
        case 'war': push(e, i, CARD(e.card) + ' in ' + CN(e.c) + ': rolled ' + e.r + (e.minus ? ' − ' + e.minus : '') + ', needed ' + e.need + ' — ' + (e.won ? SN(e.side) + ' wins.' : SN(e.side) + ' fails.'), e.side, { cs: [e.c] }); break;
        case 'discard': push(e, i, SN(e.side) + ' discards ' + CARD(e.card) + (e.random ? ' at random' : '') + (e.why ? ' (' + e.why + ')' : '') + '.', e.side, { card: e.card }); break;
        case 'china': push(e, i, 'The China Card ' + (e.why === 'turn end' ? 'turns face up with ' + SN(e.side) : 'goes to ' + SN(e.side) + (e.up ? ', face up' : ', face down') + (e.why && e.why !== 'played' ? ' (' + e.why + ')' : '')) + '.', e.side); break;
        case 'formosanEnds': push(e, i, 'Formosan Resolution ends: the USA played the China Card.'); break;
        case 'olympics': push(e, i, SN(e.side) + (e.a === 'boycott' ? ' boycotts the Olympic Games.' : ' takes part in the Olympic Games.'), e.side); break;
        case 'olytie': push(e, i, 'The Olympics: a tie, they roll again.'); break;
        case 'olywin': push(e, i, SN(e.side) + ' wins the Olympic Games.', e.side); break;
        case 'summit': push(e, i, 'Summit: ' + SN(e.side) + ' ' + e.rs + '+' + e.ms + ' against ' + SN(D.other(e.side)) + ' ' + e.ro + '+' + e.mo + '.'); break;
        case 'salt': push(e, i, SN(e.side) + ' takes ' + CARD(e.card) + ' from the discards (SALT).', e.side, { card: e.card }); break;
        case 'envy': push(e, i, 'Missile Envy: ' + SN(e.from) + ' hands over ' + CARD(e.card) + '.', e.side, { card: e.card }); break;
        case 'wwbystop': push(e, i, 'UN Intervention stops We Will Bury You.'); break;
        case 'un': push(e, i, SN(e.side) + ' plays UN Intervention with ' + CARD(e.card) + ': its event will not happen.', e.side, { card: e.card }); break;
        case 'reveal': push(e, i, SN(e.side) + ' shows its hand (' + e.n + ' cards) to ' + SN(e.to) + '.', e.side); break;
        case 'grain': push(e, i, 'Grain Sales: the USA draws a card from the USSR’s hand.', 'US'); break;
        case 'grainplay': push(e, i, 'The USA plays the card it drew: ' + CARD(e.card) + '.', 'US', { card: e.card }); break;
        case 'grainback': push(e, i, 'The USA gives the card back.', 'US'); break;
        case 'asknot': push(e, i, 'Ask Not: the USA discards ' + e.cards.map(CARD).join(', ') + '.', 'US'); break;
        case 'draw': if (e.n) push(e, i, SN(e.side) + ' draws ' + e.n + ' card' + (e.n === 1 ? '' : 's') + ' (' + e.why + ').', e.side); break;
        case 'cambridge': push(e, i, 'The Cambridge Five: the USA holds ' + (e.cards.length ? e.cards.map(CARD).join(', ') : 'no scoring cards') + '.'); break;
        case 'tehran': push(e, i, 'Our Man in Tehran turns over: ' + e.cards.map(CARD).join(', ') + '.'); break;
        case 'tehrandisc': push(e, i, 'The USA discards ' + e.cards.map(CARD).join(', ') + '.', 'US'); break;
        case 'chernobyl': push(e, i, 'Chernobyl: no USSR influence by Ops in ' + RN(e.r) + ' this turn.'); break;
        case 'defuse': push(e, i, SN(e.side) + ' defuses the Cuban Missile Crisis, taking 2 influence out of ' + CN(e.c) + '.', e.side); break;
        case 'headfirst': push(e, i, SN(e.side) + ' must show its headline first: ' + CARD(e.card) + '.', e.side, { card: e.card }); break;
        case 'headline': push(e, i, 'The headlines: USSR ' + (e.SU != null ? CARD(e.SU) : 'none') + ' · USA ' + (e.US != null ? CARD(e.US) : 'none') + '.', null, { headline: true }); break;
        case 'defectors': push(e, i, 'Defectors! The USSR’s headline, ' + CARD(e.card) + ', is cancelled.', 'US'); break;
        case 'milcheck': {
          const sh = D.SIDES.filter(s => e.short[s]);
          push(e, i, 'Military operations against DEFCON ' + e.defcon + ': USSR ' + e.mil.SU + ', USA ' + e.mil.US + (sh.length ? ' — ' + sh.map(s => SN(s) + ' short ' + e.short[s]).join(', ') : ' — both met it') + '.', null, { turn: true });
          break;
        }
        case 'stuck': push(e, i, SN(e.side) + ' rolls ' + e.r + ' against ' + e.name + (e.out ? ' and gets out.' : ' — still stuck.'), e.side); break;
        case 'over': push(e, i, OVER_WORDS(e), e.side); break;
        case 'nowait': push(e, i, 'The table went on without ' + e.who.length + ' phone' + (e.who.length === 1 ? '' : 's') + '.'); break;
        case 'hurried': push(e, i, 'The remote holder played a move for a quiet phone.'); break;
      }
    }
    return out;
  }
  function OVER_WORDS(e) {
    const w = e.side ? SN(e.side) : null;
    switch (e.how) {
      case 'vp': return w + ' reaches 20 VP and wins.';
      case 'europe': return w + ' controls Europe and wins.';
      case 'defcon': return 'Nuclear war: DEFCON 1 on ' + SN(e.extra && e.extra.by) + '’s turn. ' + w + ' wins.';
      case 'cmc': return 'A coup during the Cuban Missile Crisis: nuclear war. ' + w + ' wins.';
      case 'scoring': return w ? 'A scoring card was held past the turn. ' + w + ' wins.' : 'Both held scoring cards: a draw.';
      case 'wargames': return w ? 'Wargames ends the game. ' + w + ' wins.' : 'Wargames ends the game in a draw.';
      case 'final': return w ? 'Final scoring: ' + w + ' wins.' : 'Final scoring: a draw.';
    }
    return w ? w + ' wins.' : 'A draw.';
  }
  function html(l, pub) {
    const col = l.side ? D.SIDE[l.side].ink : '#f1d58a';
    return '<span style="color:' + col + '">' + esc(l.text) + '</span>';
  }

  /* What is in force, for the panels. */
  const FX = {
    nato: 'NATO: no USSR coups or realignment in US-controlled Europe', japan: 'US/Japan pact: Japan is off limits to the USSR',
    formosan: 'Formosan Resolution: Taiwan counts as a battleground for the USA', flower: 'Flower Power: US war events cost 2 VP',
    ironLady: 'The Iron Lady: no Socialist Governments', campDavid: 'Camp David: no Arab-Israeli War', jp2: 'John Paul II: Solidarity playable',
    awacs: 'AWACS: no Muslim Revolution', nso: 'North Sea Oil: no OPEC', reformer: 'The Reformer: no USSR coups in Europe',
    tearDown: 'Tear Down This Wall: no Willy Brandt', brandt: 'Willy Brandt: NATO does not cover West Germany',
    deGaulle: 'De Gaulle: NATO does not cover France', evilEmpire: 'An Evil Empire: no Flower Power', hostage: 'Hostage Crisis: Terrorism doubled against the USA',
    norad: 'NORAD: the USA adds influence when DEFCON falls to 2', quag: 'Quagmire: the USA is stuck', bear: 'Bear Trap: the USSR is stuck',
    shuttle: 'Shuttle Diplomacy waits for the next Middle East or Asia scoring', marshall: 'Marshall Plan: NATO playable', warsaw: 'Warsaw Pact: NATO playable'
  };
  const TFX = {
    containment: 'Containment: US cards +1 Op', brezhnev: 'Brezhnev Doctrine: USSR cards +1 Op', vietnam: 'Vietnam Revolts: USSR +1 Op all in Southeast Asia',
    subs: 'Nuclear Subs: US battleground coups leave DEFCON alone', salt: 'SALT: coups roll 1 lower', u2: 'U2 Incident: UN Intervention gives the USSR 1 VP',
    contra: 'Iran-Contra: US realignment rolls 1 lower', yuri: 'Yuri and Samantha: each US coup gives the USSR 1 VP', nso8: 'North Sea Oil: an eighth US action round',
    wwby: 'We Will Bury You: 3 VP to the USSR unless UN Intervention', seeSU: 'CIA Created: the USSR’s hand is shown to the USA', seeUS: 'The USA’s hand is shown to the USSR'
  };
  function inForce(pub) {
    const out = [];
    Object.keys(FX).forEach(k => { if (pub.fx[k]) out.push(FX[k]); });
    const t = pub.tfx || {};
    Object.keys(TFX).forEach(k => { if (t[k]) out.push(TFX[k]); });
    if (t.redScare) out.push('Red Scare/Purge: ' + SN(D.other(t.redScare)) + ' cards 1 Op less');
    if (t.cmc) out.push('Cuban Missile Crisis: a coup by ' + SN(D.other(t.cmc)) + ' is nuclear war');
    if (t.squads) out.push('Death Squads: ' + SN(t.squads) + ' coups in the Americas +1, the other side −1');
    if (t.chernobyl) out.push('Chernobyl: no USSR Ops influence in ' + RN(t.chernobyl));
    if (t.envy) out.push('Missile Envy: ' + SN(t.envy) + ' must play it for Ops');
    return out;
  }

  /* ================================================================
     The held cards
     ================================================================ */
  const era = t => (t >= 8 ? 'Late War' : t >= 4 ? 'Mid War' : 'Early War');
  function sidesHtml(pub, f) {
    return '<div class="rc-sc">' + D.SIDES.map(s => {
      const p = pub.players.find(x => x.side === s);
      return '<div class="rc-p"><i style="background:' + D.SIDE[s].hex + '"></i><b>' + SN(s) + '</b> <span class="rc-role">' + esc(p ? p.name + (p.bot ? ' · house · ' + p.level : '') : '') + '</span><span class="rc-t">' + f(s) + '</span></div>';
    }).join('') + '</div>';
  }
  function turnStartHtml(pub, h) {
    const t = h.turn;
    let x = '<div class="rc-h">Turn ' + t + ' of 10 · ' + era(t) + '</div>' +
      '<div class="rc-sub">DEFCON <b>' + h.defcon + '</b> · VP ' + esc(vpWords(h.vp)) + ' · ' + h.rounds + ' action rounds each</div>';
    x += sidesHtml(pub, s => pub.handN[s] + ' cards in hand · space race: ' + esc(D.SPACE[pub.space[s]].name) + (pub.china === s ? ' · holds the China Card' + (pub.chinaUp ? '' : ' (face down)') : ''));
    const notes = [];
    if (t === 1) {
      notes.push('A turn: both sides choose a headline at once and its event happens; then six action rounds, the USSR first in each.');
      notes.push('A card is played for its event, or for its Ops: influence, a coup, realignment, or the space race.');
      notes.push('Play the other side’s card for Ops and its event happens too. A scoring card held at the end of a turn loses the game.');
      notes.push('20 VP wins at once; so does controlling Europe when it is scored. DEFCON 1 on your turn loses.');
    }
    if (t === 4) notes.push('The Mid War cards are in the deck: Central America, Southeast Asia, Africa and South America can now be scored. Hands are 9, rounds 7.');
    if (t === 8) notes.push('The Late War cards are in the deck. After turn 10, every region is scored.');
    if (t > 1) notes.push('DEFCON improved by one at the start of the turn. Each side needs ' + h.defcon + ' military operations by the end of it.');
    if (notes.length) x += '<div class="rc-sec"><ul>' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>';
    return x;
  }
  const LVL = { presence: 'Presence', domination: 'Domination', control: 'Control' };
  function scoreHtml(pub, h) {
    const r = h.res;
    let x = '<div class="rc-h">' + esc(RN(h.r)) + ' scored</div>';
    if (h.r === 'SEA') {
      x += sidesHtml(pub, s => r[s] + ' VP from ' + (r.rows.filter(y => y.side === s).map(y => CN(y.c)).join(', ') || 'nothing'));
    } else {
      x += sidesHtml(pub, s => (r.lv[s] ? LVL[r.lv[s]] : 'Nothing') + ' · ' + r.bg[s] + ' battleground' + (r.bg[s] === 1 ? '' : 's') + (r.adj[s] ? ' · ' + r.adj[s] + ' next to the enemy' : '') + ' — <b>' + r[s] + ' VP</b>');
    }
    x += '<div class="rc-sub" style="margin-top:8px">' + (r.euroWin ? esc(SN(r.euroWin)) + ' controls Europe — the game is won.' : r.net ? esc(SN(r.net > 0 ? 'US' : 'SU')) + ' gains <b>' + Math.abs(r.net) + ' VP</b>: the score goes to ' + esc(vpWords(h.vpBefore + r.net)) + '.' : 'Even: no VP change.') + '</div>';
    return x;
  }
  function turnEndHtml(pub, h) {
    let x = '<div class="rc-h">End of turn ' + h.turn + '</div>' +
      '<div class="rc-sub">Military operations needed: <b>' + h.defcon + '</b> (the DEFCON level)</div>';
    x += sidesHtml(pub, s => h.mil[s] + ' military ops' + (h.short[s] ? ' — <b>' + h.short[s] + ' short</b>: ' + esc(SN(D.other(s))) + ' +' + h.short[s] + ' VP' : ' — enough'));
    x += '<div class="rc-sub" style="margin-top:8px">VP: ' + esc(vpWords(h.vp)) + (h.turn < 10 ? '. Next: turn ' + (h.turn + 1) + (h.turn + 1 === 4 ? ', the Mid War' : h.turn + 1 === 8 ? ', the Late War' : '') + '.' : '. Next: final scoring.') + '</div>';
    return x;
  }
  function finalHtml(pub, h) {
    let x = '<div class="rc-h">Final scoring</div><div class="rc-sec"><ul>' +
      h.rows.map(r => '<li>' + esc(RN(r.r)) + ': USA ' + r.us + ', USSR ' + r.su + (r.euroWin ? ' — ' + esc(SN(r.euroWin)) + ' controls Europe!' : r.net ? ' — ' + esc(SN(r.net > 0 ? 'US' : 'SU')) + ' +' + Math.abs(r.net) : '') + '</li>').join('') +
      (h.china ? '<li>The China Card: ' + esc(SN(h.china)) + ' +1</li>' : '') + '</ul></div>';
    return x;
  }

  /* A die (or two): rolling, then landed with what it did. The telly and the
     solo phone draw the same card; until it lands the faces are not even in
     the hold (the host strips them), so a rolling die shows a blank tumble. */
  function diceHtml(h, landed, A, where) {
    const dice = h.rolls.map(r => '<div>' + A.die(landed && r.r ? r.r : 1 + ((r.side === 'US' ? 3 : 0) % 6), r.side, landed ? 'land' : 'roll') +
      '<span style="color:' + D.SIDE[r.side].ink + '">' + esc(SN(r.side)) + (r.mod ? ' ' + (r.mod > 0 ? '+' : '−') + Math.abs(r.mod) : '') + '</span></div>').join('');
    let res = '';
    if (landed && h.rolls[0].r != null) {
      if (h.what === 'coup') res = (h.net > 0 ? 'Success: ' + h.net + ' influence' : 'It fails') + ' — ' + (h.rolls[0].r + h.ops + (h.mod || 0)) + ' against ' + (2 * h.stab);
      else if (h.what === 'space') res = h.rolls[0].r <= h.need ? 'Lift-off!' : 'Scrubbed — needed 1-' + h.need;
      else if (h.what === 'war') res = (h.rolls[0].r + (h.rolls[0].mod || 0) >= h.need ? 'Victory' : 'Defeat') + ' — needed ' + h.need;
      else if (h.what === 'stuck') res = h.rolls[0].r <= 4 ? 'Out!' : 'Still stuck';
      else if (h.rolls.length === 2) { const x = h.rolls[0].r + (h.rolls[0].mod || 0), y = h.rolls[1].r + (h.rolls[1].mod || 0); res = x === y ? 'Level' : SN(x > y ? h.rolls[0].side : h.rolls[1].side) + ' by ' + Math.abs(x - y); }
    }
    const sub = h.what === 'coup' ? 'Roll + ' + h.ops + ' Ops' + (h.mod ? (h.mod > 0 ? ' + ' : ' − ') + Math.abs(h.mod) : '') + ' must beat twice the stability (' + (2 * h.stab) + ')'
      : h.what === 'space' ? 'Needs 1-' + h.need + ' for ' + D.SPACE[h.box].name
      : h.what === 'war' ? 'Needs ' + h.need + ' or more after the modifier'
      : h.what === 'realign' ? 'Each adds its modifiers; the higher removes the difference'
      : h.what === 'stuck' ? 'Needs 1-4 to get out' : '';
    return '<div class="dh">' + esc(h.why || 'The dice') + '</div><div class="ds">' + esc(sub) + '</div><div class="dice">' + dice + '</div><div class="res">' + esc(res || (landed ? '' : 'Rolling…')) + '</div>';
  }
  /* A DEFCON fall, said once: where it went, why, what it now forbids, and
     the danger that comes with 2. */
  function defconHtml(h) {
    const warn = h.to === 2 ? 'One more step is nuclear war: a battleground coup now loses the game for whoever makes it.' : '';
    return '<div class="dh">DEFCON falls to ' + h.to + '</div><div class="ds">' + esc(h.why ? 'Because of ' + h.why : '') + '</div>' +
      '<div class="res">' + esc(defconNote(h.to)) + '</div>' + (warn ? '<div class="ds" style="color:#ff9a9e">' + esc(warn) + '</div>' : '');
  }
  function defconNote(d) {
    return d >= 5 ? 'Peace: coups anywhere' : d === 4 ? 'No coups in Europe' : d === 3 ? 'No coups in Europe, Asia' : 'No coups in Europe, Asia, Middle East';
  }

  /* ================================================================
     How to play: the lessons, ranked (ARCHITECTURE.md). Each says the rule
     in a sentence or two, then what to look at now. Our own words.
     ================================================================ */
  const LESSON = {
    welcome: { h: 'How to play: the Cold War in ten turns', p: [
      'You and the other side push for influence around the world. Regions are scored when their scoring card is played, and the points move one victory-point marker.',
      'Reach 20 VP and you win at once. Otherwise the side ahead after turn 10 wins.',
      'This tutorial covers the first three turns. The coach on your phone suggests a move each time; you decide.'] },
    control: { h: 'Influence and control', p: [
      'Each country has a stability number. You control it when your influence is at least that number and that far ahead of the other side.',
      'Battlegrounds (BG on the phone, red names on the map) are the countries scoring cares about most.',
      'First, both sides place their starting influence: the USSR in Eastern Europe, the USA in Western Europe.'] },
    cards: { h: 'A card is an event or Ops', p: [
      'Each card has an event and an Ops number (1 to 4). Play it for its event, or for its Ops: influence, a coup, realignment, or the space race.',
      'The catch: if you play the other side’s card for Ops, their event happens too. Half your hand is theirs; choosing when to let it happen is the game.'] },
    headline: { h: 'The headline', p: [
      'Each turn starts with both sides choosing one card at the same time. Both are shown, and their events happen, higher Ops first.',
      'A scoring card makes a good headline if you are ahead in its region. Avoid headlining the other side’s card: it is their event that happens.'] },
    ops: { h: 'Spending Ops', p: [
      'Influence: one point per Op, next to where you already have some. A country the other side controls costs 2 per point.',
      'Coup: roll a die, add the Ops; beat twice the stability to remove their influence. Realignment: both roll; the winner removes the difference.',
      'Space race: no influence, but the other side’s event on the card never happens. Once a turn.'] },
    trigger: { h: 'Their event happens too', p: [
      'This card belongs to the other side, so its event happens as well as the Ops. You may take their event first or your Ops first.',
      'If the event would hurt, the space race is the usual way to bury a card.'] },
    coup: { h: 'A coup', p: [
      'Die + Ops against twice the stability. Every point over removes one of their influence; any left over becomes yours.',
      'A coup in a battleground lowers DEFCON by one. And the Ops count as military operations, which you need by the end of the turn.'] },
    defcon: { h: 'DEFCON', p: [
      'DEFCON starts at 5 and rises one step each turn. Battleground coups and some events lower it.',
      'At 4 there are no coups in Europe; at 3 none in Asia either; at 2 none in the Middle East. If it reaches 1 on your turn, you lose.'] },
    realign: { h: 'Realignment', p: [
      'Both sides roll. Each adds 1 for every neighbour it controls, 1 if it has more influence there, and 1 if the country borders its superpower.',
      'The higher total removes the difference from the other side’s influence. It never lowers DEFCON.'] },
    space: { h: 'The space race', p: [
      'Send a card with enough Ops and roll: success moves you along the track. Reaching a box first scores VP, and some boxes give a lasting advantage.',
      'The card’s event never happens, which is why players send the other side’s worst cards into space.'] },
    china: { h: 'The China Card', p: [
      'Worth 4 Ops, or 5 if every Op is spent in Asia. It has no event.',
      'After it is played it goes to the other side face down, and turns face up at the end of the turn. Whoever holds it after turn 10 gains 1 VP.'] },
    scoring: { h: 'Scoring a region', p: [
      'Presence: you control a country there. Domination: more countries and more battlegrounds than the other side, and at least one that is not a battleground. Control: more countries and every battleground.',
      'Each level is worth more, plus 1 per battleground you control and 1 per country you control next to the other superpower.',
      'A scoring card must be played the turn you hold it. Holding one at the end of a turn loses the game.'] },
    milops: { h: 'Military operations', p: [
      'Each side needs military operations equal to DEFCON by the end of every turn. Coups and wars count.',
      'For every point short, the other side gains 1 VP.'] },
    done: { h: 'Tutorial complete', p: [
      'That is the Early War: influence, coups, DEFCON, scoring, the space race and the China Card.',
      'Play on from here (the coach stays), or set up a real game. Turn 4 brings the Mid War cards, with four more regions to score.'] },
    midwar: { h: 'The Mid War', p: [
      'New cards are shuffled in, among them the scoring cards for Central America, Southeast Asia, Africa and South America.',
      'Hands grow to nine cards and each turn has seven action rounds.'] }
  };
  function lessonHtml(pub, h) {
    const L = LESSON[h.id];
    if (!L) return '';
    const n = Object.keys(LESSON).length;
    return '<div class="rc-h">' + esc(L.h) + '</div>' + (h.id === 'done' ? '' : '<div class="rc-sub" style="color:#b2b9c9">How to play · lesson ' + h.i + ' of ' + n + '</div>') +
      '<div class="rc-sec"><ul>' + L.p.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  }

  const Words = { VERSION, lines, html, CHOSE, inForce, turnStartHtml, scoreHtml, turnEndHtml, finalHtml, vpWords, esc, era, diceHtml, defconNote, defconHtml, LESSON, lessonHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = Words;
  else root.TSWords = Words;
})(typeof window !== 'undefined' ? window : this);
