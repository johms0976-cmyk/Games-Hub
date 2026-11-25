'use strict';
/* A Gest of Robin Hood — the words. The log as one line a move, with what
 * the move earned folded onto the end of its line ("… — +2 shillings · +1
 * Justice"), shared by the telly's crier, the phone's feed and the house's
 * "Just now" (LESSONS-CHECKLIST D, "one line per move with what it earned").
 *
 * Nothing here may name the Hidden Robin Hood: the log is public, and every
 * event that could give him away carries only what the table saw.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./rh-data.js') : root.RhData;
  const VERSION = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nm = id => (D.SPACES[id] ? D.SPACES[id].name : id === 'prison' ? 'Prison' : id === 'avail' ? 'Available' : id);
  const K = id => String(id).split('.')[0];
  const tname = id => (D.TRAVELLERS[K(id)] || {}).name || id;
  const men = (n, w) => n + ' ' + (w || 'Merry M') + (n === 1 ? 'an' : 'en');
  const hm = n => n + ' Henchm' + (n === 1 ? 'an' : 'en');
  const sh = n => n + ' shilling' + (n === 1 ? '' : 's');
  const fav = f => (f > 0 ? f + ' Order' : -f + ' Justice');
  const BOX = { single: 'a Single Plot', event: 'the Event', pd: 'Plots & Deeds' };
  const STATE = { sub: 'Submissive', rev: 'Revolting', pas: 'Passive' };
  /* Events where a seat made a choice of its own: "since your last move"
     counts back to the last of these. */
  const CHOSE = { choose: 1, pass: 1, placed: 1, deed: 1 };

  function who(e, pub) {
    const p = pub && pub.players.find(x => x.id === e.by);
    return p ? p.name : (e.side ? (e.side === 'robin' ? 'Robin Hood' : 'The Sheriff') : 'Someone');
  }
  function sideName(side, pub) {
    const p = pub && pub.players.find(x => x.side === side);
    return p ? p.name : side === 'robin' ? 'Robin Hood' : 'the Sheriff';
  }

  /* The text of one event, or null for an event folded into the line before
     it (gains, payments, the favour) or not told at all. */
  function say(e, pub) {
    const W = who(e, pub);
    switch (e.t) {
      case 'setup': return { text: 'The Shire is set: the Sheriff holds six Parishes, Remston is in revolt.', turn: true };
      case 'placed': return { text: W + ' hides four men in the greenwood: ' + Object.keys(e.at).map(k => e.at[k] + ' in ' + nm(k)).join(', ') + '. One of them is Robin Hood.' };
      case 'ballad': return { text: 'Ballad ' + ['', 'one', 'two', 'three'][e.n] + ' begins.', turn: true };
      case 'card': { const c = D.EVENTS[e.id]; return { text: (c.inspection ? '' : 'Card: ') + c.name + (c.fortune ? ' — a Fortune event' : '') + (c.c ? ' · Carriages to roll: ' + c.c : ''), turn: true }; }
      case 'carriage': return { text: 'A Carriage rolls from ' + nm(e.from) + ' to ' + nm(e.to) + (e.escort ? ', a Henchman riding with it' : '') + '.', small: true };
      case 'arrive': { const c = D.CARRIAGES[e.kind]; return { text: 'The ' + c.name + ' Carriage reaches Nottingham' }; }
      case 'eligible': return { text: sideName(e.first, pub) + ' will be first eligible.', quiet: true };
      case 'pass': return { text: W + ' passes' + (e.side === 'sheriff' ? ', leaving the cylinder on ' + BOX[e.box].replace(/^(a|the) /, '') : '') };
      case 'choose': return { text: W + ' takes ' + BOX[e.box] + '.', small: true };
      case 'plot': return null;
      case 'deed': return null;
      case 'event': { const c = D.EVENTS[e.id], h = e.half || (e.side === 'robin' ? 'rh' : 'sh'), half = c[h]; const other = (h === 'rh') !== (e.side === 'robin'); return { text: W + ' plays ' + c.name + ': ' + half.title + (other ? ' (the other side’s half)' : '') + '.' }; }
      case 'fortune': return { text: 'Fortune: ' + D.EVENTS[e.id].title + '.', quiet: true };
      case 'recruit': return { text: e.why === 'miller' ? 'The Miller’s Son joins Robin Hood’s band in ' + nm(e.at) : W + ' recruits ' + men(e.n) + ' in ' + nm(e.at) };
      case 'hide': return { text: W + ' hides the men in ' + nm(e.at) };
      case 'toCamp': return { text: W + ' turns a Merry Man into a Camp in ' + nm(e.at) };
      case 'camp': return e.why === 'recruit' ? null : { text: 'A Camp goes up in ' + nm(e.at) };
      case 'campGone': return { text: 'The Camp in ' + nm(e.at) + ' is torn down' };
      case 'move': {
        const verb = { sneak: 'sneak', boats: 'row', ambush: 'gather', horn: 'answer the horn', redeploy: 'fall back', event: 'slip', mercy: 'are driven' }[e.why] || 'move';
        return { text: men(e.n) + (e.robin ? ' (Robin Hood among them)' : '') + ' ' + verb + ' from ' + nm(e.from) + ' to ' + nm(e.to) + (e.rev ? ' — and are seen' : ''), small: e.why === 'redeploy' };
      }
      case 'robbers': return { text: W + ' robs in ' + nm(e.at) + ' with ' + (e.robin ? (e.n > 1 ? men(e.n - 1) + ' and ' : '') + 'Robin Hood himself' : men(e.n)) };
      case 'tdraw': return { text: 'On the road: ' + tname(e.card) + '.', small: true };
      case 'carRevealed': return { text: 'The Carriage in ' + nm(e.at) + ' is a ' + D.CARRIAGES[e.kind].name + '.', small: true };
      case 'rob': {
        const tgt = e.target === 'treasury' ? 'the Treasury' : e.target === 'traveller' ? tname(e.card) + (e.opt && D.TRAVELLERS[K(e.card)][e.opt] ? ' (' + D.TRAVELLERS[K(e.card)][e.opt].name + ')' : '') : 'the ' + D.CARRIAGES[e.kind].name;
        if (e.noRoll) return { text: 'Robin Hood lends Richard at the Lea the money' };
        return { text: 'Rob: ' + tgt + ' — ' + e.robbers + (e.roll >= 0 ? ' + ' + e.roll : ' − ' + (-e.roll)) + (e.bonus ? ' + ' + e.bonus : '') + ' = ' + e.total + ' against ' + e.need + ': ' + (e.win ? 'success' : 'failure') };
      }
      case 'captured': return e.n ? { text: men(e.n) + ' taken to Prison' + (e.why === 'trap' ? ' — it was a trap' : '') } : null;
      case 'tgo': return e.to === 'victims' ? { text: tname(e.card) + ' joins the Victims.', small: true } : e.to === 'out' ? { text: tname(e.card) + ' leaves the game.', small: true } : null;
      case 'robinAt': return { text: 'Robin Hood shows himself in ' + nm(e.at) };
      case 'robinTaken': return { text: 'Robin Hood is captured' + (D.SPACES[e.from] ? ' in ' + nm(e.from) : '') + '!' };
      case 'hire': return { text: W + ' hires ' + hm(e.n) + ' in ' + nm(e.at) };
      case 'patrolMove': return { text: hm(e.n) + ' march from ' + nm(e.from) + ' to ' + nm(e.to), small: true };
      case 'patrol': return { text: (e.why ? '' : W + ' patrols ' + nm(e.at) + ': ') + (e.n ? men(e.n) + ' Revealed' + (e.why ? ' in ' + nm(e.at) : '') : 'nobody found') + (e.robin ? ' — one of them is Robin Hood!' : '') };
      case 'capture': return { text: W + ' captures in ' + nm(e.at) + ': ' + ([e.men ? men(e.men) + ' to Prison' : '', e.robin ? 'Robin Hood to Prison' : '', e.camps ? e.camps + ' Camp' + (e.camps > 1 ? 's' : '') + ' torn down' : ''].filter(Boolean).join(', ') || 'nothing') };
      case 'turncoat': return { text: e.why === 'fair' ? 'At Nottingham Fair ' + hm(e.n || 1) + ' change sides' : 'A Henchman in ' + nm(e.at) + ' turns his coat' };
      case 'breakout': return { text: 'Robin Hood breaks out of Prison into ' + nm(e.at) + '!' };
      case 'swash': return { text: (e.to.length > 1 ? 'Two men slip' : 'A man slips') + ' out of ' + nm(e.from) + ' to ' + e.to.map(nm).join(' and ') + (e.robinTo ? ' — Robin Hood to ' + nm(e.robinTo) : '') };
      case 'inspire': return { text: (e.robin ? 'Robin Hood' : 'A Merry Man') + ' stirs ' + nm(e.at) };
      case 'ride': return { text: W + ' rides out with ' + hm(e.n) + ' to ' + nm(e.to) };
      case 'confiscate': return { text: W + ' confiscates in ' + nm(e.at) + ': a face-down Carriage' };
      case 'removed': return { text: (e.robin ? 'Robin Hood' : 'A Merry Man') + ' in ' + nm(e.at) + ' goes back to ' + nm(e.to) + ({ disperse: ' (Disperse)', poison: ' — poisoned', ale: ' — too much ale' }[e.why] || '') };
      case 'parish': return { text: nm(e.at) + ' is now ' + STATE[e.st], small: !!e.why && e.why !== 'event' };
      case 'decoy': return { text: 'A decoy! Robin Hood has changed places with one of his men.' };
      case 'escape': return { text: men(e.n) + (e.robin ? ', Robin Hood among them,' : '') + ' walk out of Prison into ' + nm(e.at) };
      case 'bridge': return { text: 'A bridge now joins ' + nm(e.a) + ' and ' + nm(e.b) };
      case 'oak': return { text: 'The Major Oak: the spaces round Ollerton Hill are all one to Robin Hood now' };
      case 'allan': return { text: men(e.n) + ' step out to sing in ' + nm(e.at) };
      case 'released': return e.n ? { text: men(e.n) + (e.robin ? ', Robin Hood among them,' : '') + ' freed from Prison' } : null;
      case 'carUsed': return { text: 'A Carriage in ' + nm(e.from) + ' is sent home empty' };
      case 'defect': return { text: (e.robin ? 'Robin Hood' : 'A Merry Man') + ' in ' + nm(e.at) + ' defects to the Sheriff' };
      case 'stutely': return { text: 'A cunning ruse in ' + nm(e.to) + (e.h ? ': ' + hm(e.h) + ' march back to Nottingham' : '') };
      case 'wedding': return { text: 'A wedding in ' + nm(e.at) + ': a Merry Man' + (e.h ? ' and ' + hm(e.h) : '') + ' leave the game' };
      case 'hench': return { text: hm(e.n) + ' arrive in ' + nm(e.at) };
      case 'home': return { text: (e.men ? 'A Merry Man' : hm(e.n)) + ' go' + (e.n === 1 && !e.men ? 'es' : e.men ? 'es' : '') + ' home from ' + nm(e.at), small: true };
      case 'unrest': return { text: 'Royal Inspection — Unrest: ' + e.subs + ' Submissive Parish' + (e.subs === 1 ? '' : 'es'), turn: true };
      case 'redeployH': return { text: hm(e.n) + ' redeploy from ' + nm(e.from) + ' to ' + nm(e.to), small: true };
      case 'allHidden': return { text: 'Every Merry Man on the map is Hidden again.', small: true };
      case 'robinBack': return { text: 'Robin Hood returns to ' + nm(e.at) };
      case 'tin': return { text: tname(e.card) + ' joins the Travellers.' };
      case 'tout': return { text: tname(e.card) + (e.to === 'victims' ? ' joins the Victims.' : ' leaves the game.') };
      case 'tshuffle': case 'treshuffle': return { text: 'The Travellers are shuffled.', quiet: true };
      case 'nowait': return { text: 'The table moves on without waiting.', quiet: true };
      case 'hurried': return { text: 'The remote plays the move for a quiet phone.', quiet: true };
      case 'over': return { text: e.how === 'king' ? 'King Richard has returned.' : 'The Royal Favour has tipped.', turn: true };
    }
    return null;
  }
  /* What a gain, a payment or a shift of favour adds to the line before. */
  function tail(e, pub) {
    if (e.t === 'gain') return '+' + sh(e.n) + (e.from ? ' from ' + (e.from === 'sheriff' ? 'the Sheriff' : 'Robin Hood') : '') + (e.side === 'robin' ? '' : '') + ' to ' + sideName(e.side, pub);
    if (e.t === 'paid') return '−' + sh(e.n);
    if (e.t === 'favour') return (e.k > 0 ? '+' + e.k + ' Order' : '+' + (-e.k) + ' Justice') + ' (now ' + fav(e.now) + ')';
    return null;
  }

  /* The log as lines: [{i, t, by, text, quiet, turn, small}]. `base` is the
     absolute index of log[0] (the broadcast log is a window). */
  function lines(log, pub, base) {
    const out = [];
    base = base || 0;
    for (let k = 0; k < log.length; k++) {
      const e = log[k];
      const tl = tail(e, pub);
      if (tl) {
        const prev = out[out.length - 1];
        if (prev && !prev.turn) { prev.extra.push(tl); continue; }
        out.push({ i: base + k, t: e.t, by: e.by || null, text: tl.charAt(0).toUpperCase() + tl.slice(1), extra: [], small: true });
        continue;
      }
      const s = say(e, pub);
      if (!s) continue;
      out.push(Object.assign({ i: base + k, t: e.t, by: e.by || null, extra: [] }, s));
    }
    for (const l of out) { l.full = l.text + (l.extra.length ? ' — ' + l.extra.join(' · ') : '') + (/[.!?]$/.test(l.text) && !l.extra.length ? '' : '.'); }
    return out;
  }
  function html(l, pub) {
    const p = pub && l.by ? pub.players.find(x => x.id === l.by) : null;
    const t = esc(l.full || l.text);
    return p ? '<span class="wl" style="--h:' + esc(p.hex) + '">' + t + '</span>' : t;
  }

  /* ================================================================
     The Ballad's opening card (D: "open every Age on its own card, the
     first one included"). Looks back at the Royal Inspection just held,
     and forward: who is first, the clock, both factions' stats.
     ================================================================ */
  function holdCardHtml(pub) {
    if (!pub) return '';
    const b = pub.ballad;
    const rob = pub.players.find(p => p.side === 'robin'), shf = pub.players.find(p => p.side === 'sheriff');
    const subs = D.PARISHES.filter(k => pub.spaces[k].state === 'sub').length;
    const revs = D.PARISHES.filter(k => pub.spaces[k].state === 'rev').length;
    let h = '<div class="rc-h">Ballad ' + ['', 'one', 'two', 'three'][b] + ' of three</div>';
    h += '<div class="rc-sub">' + (b === 3 ? 'The last Ballad: King Richard returns at its end, and whoever holds the Royal Favour then wins.' : 'Seven cards, then a Royal Inspection. Reach 5 on the Royal Favour at an Inspection and you win at once.') + '</div>';
    const R = pub.lastRi;
    if (R && b > 1) {
      h += '<div class="rc-sec"><h4>The Royal Inspection just held</h4><ul>' + R.pages.map(pg => '<li><b>' + esc(PAGE_NAME[pg.k]) + ':</b> ' + esc(pg.lines.join(' ')) + '</li>').join('') + '</ul></div>';
    }
    const pc = (p, side) => '<div class="rc-p"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b> <span class="rc-role">' + (side === 'robin' ? 'Robin Hood and the Merry Men' : 'the Sheriff of Nottingham') + (p.bot ? ' · house ' + esc(p.level) : '') + '</span><span class="rc-t">' +
      (side === 'robin' ? sh(pub.sh.robin) + ' · ' + countMen(pub) + ' Merry Men on the map, ' + pub.prison.n + ' in Prison · ' + countCamps(pub) + ' Camp' + (countCamps(pub) === 1 ? '' : 's') : sh(pub.sh.sheriff) + ' · ' + countH(pub) + ' Henchmen on the map · ' + carsOnMap(pub) + ' Carriages on the roads') + '</span></div>';
    h += '<div class="rc-sc">' + pc(rob, 'robin') + pc(shf, 'sheriff') + '</div>';
    h += '<div class="rc-sec"><h4>Where it stands</h4><ul><li>The Royal Favour: <b>' + fav(pub.favour) + '</b>.</li><li>' + subs + ' Submissive Parishes, ' + revs + ' Revolting. At the Inspection 5 or more Submissive is +1 Order; 3–4 is +1 Justice, 1–2 is +2, none is +3.</li><li>' + esc(rob.name) + ' is first eligible.</li></ul></div>';
    if (b === 1) h += '<div class="rc-sec"><h4>How a card works</h4><ul><li>Each card first rolls the Carriages it shows towards Nottingham.</li><li>The first eligible player takes a Single Plot, the Event, or Plots & Deeds (or passes); the second chooses among what is left.</li><li>Whoever sits on the leftmost box is first next card: a Single Plot buys the initiative, Plots & Deeds gives it away.</li></ul></div>';
    return h;
  }
  const PAGE_NAME = { unrest: 'Unrest', mischief: 'Mischief', governance: 'Governance', redeploy: 'Redeployment', reset: 'Reset' };
  const PAGE_RULE = {
    unrest: 'Count the Submissive Parishes: 5–7 is +1 Order, 3–4 +1 Justice, 1–2 +2 Justice, none +3 Justice. At 5 on either side, the game is won.',
    mischief: 'Robin Hood poaches a shilling for each Camp in a Forest, may Rob once and Donate in up to two Parishes; half the men in Prison go free.',
    governance: 'The Sheriff takes a shilling from each Submissive space; Revolting Parishes lose half their Henchmen, and those the Henchmen still outnumber submit.',
    redeploy: 'Henchmen leave Revolting Parishes and Forests; Merry Men leave Submissive spaces for the Forests and Camps, and all are Hidden.',
    reset: 'The Travellers are shuffled and Robin Hood is first eligible again.'
  };
  function countMen(pub) { let n = 0; for (const k of D.IDS) n += pub.spaces[k].hidden + pub.spaces[k].rev + (pub.spaces[k].robin ? 1 : 0); return n; }
  function countH(pub) { let n = 0; for (const k of D.IDS) n += pub.spaces[k].h; return n; }
  function countCamps(pub) { let n = 0; for (const k of D.IDS) n += pub.spaces[k].camps; return n; }
  function carsOnMap(pub) { let n = 0; for (const k of D.IDS) n += pub.spaces[k].cars.length; return n; }

  const ENDS = {
    king: 'King Richard has come home from the Crusade, and the Royal Favour decides it.',
    favour: 'The Royal Favour reached 5 at a Royal Inspection.'
  };

  const Words = { VERSION, lines, html, holdCardHtml, CHOSE, ENDS, PAGE_NAME, PAGE_RULE, esc, nm, fav, men, hm, sh, countMen, countH, countCamps, carsOnMap, tname };
  if (typeof module !== 'undefined' && module.exports) module.exports = Words;
  else root.RhWords = Words;
})(typeof window !== 'undefined' ? window : this);
