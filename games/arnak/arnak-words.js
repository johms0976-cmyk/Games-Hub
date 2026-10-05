'use strict';
/* Lost Ruins of Arnak — the log, said out loud.
 *
 * The telly's crier, the phone's "since your last turn" list and the round
 * card are all built here, from the PUBLIC log and nothing else, so every
 * screen says the same thing and none of them can say more than the table
 * saw. The engine is not loaded for any of it.
 *
 * A move is one line: what the player chose (a HEAD event — dig, buy, play,
 * research …) with everything it caused folded in behind it, so the room
 * reads "Ada digs at the wall — +1 arrowhead" instead of the dig on one line
 * and the arrowhead nowhere. The engine logs the consequences straight after
 * the choice (a sub-question answered later still lands next in the log), so
 * a consequence belongs to the open line if it is the same player's, and
 * stands on its own otherwise.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./arnak-data.js') : root.ArnakData;

  const VERSION = 1;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  const TOKEN = { glass: 'magnifying glass', book: 'notebook' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* What a player chose. Everything else is a consequence of one of these. */
  const HEAD = { dig: 1, discover: 1, overcome: 1, buy: 1, play: 1, research: 1, pass: 1, assist: 1, idol: 1, boon: 1 };
  /* The table's own lines: they close whatever line was open. */
  const TABLE = { round: 1, staff: 1, awaken: 1, hurried: 1, nowait: 1, over: 1 };

  /* Names, from anything with `players` and `sites` — a public view (a
     phone), or the game itself (the telly, which only reads names here). */
  function ctx(src) {
    const names = {}, sites = {};
    for (const p of (src.players || [])) names[p.id] = p.name;
    const list = Array.isArray(src.sites) ? src.sites : Object.values(src.sites || {});
    for (const s of list) sites[s.id] = s;
    const C = uid => {
      if (D.kindOf(uid) === 'fear') return 'a Fear card';
      const c = D.card(uid);
      return c ? c.name : 'a card';
    };
    const TILE = id => { const d = D.site(id); return d ? 'the ' + d.name.toLowerCase().replace(/^the /, '') : 'a site'; };
    return {
      P: id => names[id] || '?',
      C,
      TILE,
      SITE: id => {
        const s = sites[id];
        if (!s) return 'a site';
        if (s.tile) return TILE(s.tile);
        return 'a level ' + (s.level === 1 ? 'I' : 'II') + ' site';
      },
      GU: id => D.GUARD[id] ? 'the ' + D.GUARD[id].name.toLowerCase() : 'a guardian',
      AS: id => D.ASST[id] ? 'the ' + D.ASST[id].name.toLowerCase() : 'an assistant'
    };
  }

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const resWords = res => D.RES.filter(k => res[k]).map(k => '+' + res[k] + ' ' + (res[k] === 1 ? D.RES_NAME[k] : D.RES_PLURAL[k]));

  /* The opening of a line: what was chosen, by whom. */
  function headText(x, e) {
    const who = x.P(e.by);
    switch (e.t) {
      case 'dig': return who + ' digs at ' + x.SITE(e.site);
      case 'discover': return who + ' discovers ' + x.TILE(e.tile) + (e.idols > 1 ? ' and takes two idols' : ' and takes the idol');
      case 'overcome': return who + ' overcomes ' + x.GU(e.guardian) + (e.how === 'free' ? ', without a fight' : '');
      case 'buy': return who + ' buys ' + x.C(e.card) + (e.paid ? ' for ' + plural(e.paid, D.RES_NAME[e.res], D.RES_PLURAL[e.res]) : ' for nothing');
      case 'play': return who + ' plays ' + x.C(e.card);
      case 'research': return who + '’s ' + TOKEN[e.token] + ' climbs to row ' + e.row;
      case 'pass': return who + ' passes';
      case 'assist': return who + ' calls on ' + x.AS(e.asst);
      case 'idol': return who + ' puts an idol in a slot';
      case 'boon': return who + ' uses the boon of ' + x.GU(e.guardian);
    }
    return null;
  }

  /* What a consequence adds to an open line — no subject, lower case. */
  function clauseText(x, e) {
    switch (e.t) {
      case 'draw': return 'draws ' + plural(e.n, 'card', 'cards') + (e.bottom ? ' from the bottom' : '');
      case 'fear': return e.n > 1 ? 'takes ' + e.n + ' Fear cards' : 'takes a Fear card';
      case 'bonus': return 'a bonus tile: ' + (D.REWARD[e.bonus] ? D.REWARD[e.bonus].text : e.bonus);
      case 'exile': return 'exiles ' + (e.card === 'feartile' ? 'a fear tile' : x.C(e.card));
      case 'upgrade': return e.how === 'ta' ? 'trades a tablet up to an arrowhead' : 'trades an arrowhead up to a jewel';
      case 'temple': return 'reaches the Lost Temple for ' + e.vp + ' points';
      case 'templeTile': return 'takes a ' + e.vp + '-point temple tile';
      case 'peek': return 'turns up ' + x.C(e.card);
      case 'reveal': return 'turns up ' + x.TILE(e.tile);
      case 'refresh': return 'refreshes ' + (e.ids && e.ids.length > 1 ? e.ids.length + ' assistants' : 'an assistant');
      case 'travel': {
        const cnt = {};
        for (const k of (e.icons || [])) cnt[k] = (cnt[k] || 0) + 1;
        return 'gets ' + Object.keys(cnt).map(k => plural(cnt[k], D.TRAVEL_NAME[k] || k, (D.TRAVEL_NAME[k] || k) + 's')).join(' and ') + ' to travel with';
      }
      case 'gain-card': return 'takes ' + x.C(e.card) + (e.from === 'exile' ? ' back out of exile' : ' for nothing');
      case 'mask': return 'puts on the War Mask';
      case 'ocarina': return 'plays the ocarina — planes all round';
      case 'recruit': return 'recruits ' + x.AS(e.asst);
      case 'rescue': return 'rescues ' + x.AS(e.asst) + ' from the first expedition';
      case 'upAsst': return 'turns ' + x.AS(e.asst) + ' gold';
      case 'key': return 'lifts an idol back out of its slot';
      case 'hammer': return 'smashes ' + x.C(e.card) + ' out of the row';
      case 'relocate': return 'moves an archaeologist to ' + x.SITE(e.site);
      case 'recall': return 'brings an archaeologist home';
      case 'crown': return 'leads ' + x.GU(e.guardian) + ' to ' + x.SITE(e.site);
      case 'activate': return 'uses ' + x.SITE(e.site);
      case 'borrow': return 'borrows ' + x.AS(e.asst);
      case 'swapAsst': return 'swaps ' + x.AS(e.gave) + ' for ' + x.AS(e.got);
    }
    return null;
  }

  function tableText(x, e) {
    switch (e.t) {
      case 'round': return e.n === 1
        ? 'The expedition lands on Arnak. ' + x.P(e.start) + ' goes first.'
        : 'Round ' + ROMAN[e.n] + '. ' + x.P(e.start) + ' starts.';
      case 'staff': {
        const gone = [e.art, e.item].filter(Boolean).map(x.C);
        return 'The moon staff moves on' + (gone.length ? ', taking ' + gone.join(' and ') + ' out of the row.' : '.');
      }
      case 'awaken': return 'A guardian wakes there: ' + x.GU(e.guardian) + '.';
      case 'hurried': return 'The table stopped waiting for ' + (e.who || []).map(x.P).join(' and ') + '.';
      case 'nowait': return 'The table went on without ' + (e.who || []).map(x.P).join(' and ') + ' reading the round card.';
      case 'over': return 'The expedition is over. Time for the count.';
    }
    return null;
  }

  /* The log as lines, oldest first. `base` is the absolute position of
     events[0] in the whole game's log (a phone gets a sliding window).
     A line: { i, by, t, head, gains:{res:n}, bits:[…], table, home }. */
  function lines(events, src, base) {
    const x = ctx(src);
    const out = [];
    let open = null;
    (events || []).forEach((e, k) => {
      const i = (base || 0) + k;
      if (TABLE[e.t]) {
        const text = tableText(x, e);
        if (text) out.push({ i, by: null, t: e.t, head: text, gains: {}, bits: [], table: true });
        open = null;
        return;
      }
      /* Fear for a guardian still at your site when everyone comes home. */
      if (e.t === 'fear' && e.why === 'guardian') {
        out.push({ i, by: e.by, t: 'home', head: x.P(e.by) + ' comes home with ' + (e.n > 1 ? e.n + ' Fear cards' : 'a Fear card') + ' from a guardian', gains: {}, bits: [], home: true });
        open = null;
        return;
      }
      if (HEAD[e.t]) {
        open = { i, by: e.by, t: e.t, head: headText(x, e), gains: {}, bits: [] };
        out.push(open);
        return;
      }
      /* A consequence. Some say nothing a room needs to hear. */
      if (e.t === 'gain') {
        if (!open || open.by !== e.by) { open = { i, by: e.by, t: 'gain', head: x.P(e.by) + ' gets', gains: {}, bits: [], bare: true }; out.push(open); }
        for (const r in e.res) open.gains[r] = (open.gains[r] || 0) + e.res[r];
        return;
      }
      const clause = clauseText(x, e);
      if (!clause) return;
      if (open && open.by === e.by) { open.bits.push(clause); return; }
      open = { i, by: e.by, t: e.t, head: x.P(e.by) + ' ' + clause, gains: {}, bits: [] };
      out.push(open);
    });
    return out;
  }

  /* One line as a sentence. `icon(res, n)` draws a gain; plain text without. */
  function render(line, icon) {
    const head = icon ? esc(line.head) : line.head;
    if (line.table) return head;
    const gained = icon
      ? D.RES.filter(k => line.gains[k]).map(k => '<span class="wg">+' + line.gains[k] + icon(k) + '</span>')
      : resWords(line.gains);
    const bits = line.bits.map(b => icon ? esc(b) : b);
    if (line.bare) return head + ' ' + gained.concat(bits).join(', ') + '.';
    const parts = (gained.length ? [gained.join(icon ? ' ' : ', ')] : []).concat(bits);
    return head + (parts.length ? ' — ' + parts.join(', ') : '') + '.';
  }
  const text = line => render(line, null);
  const html = (line, A) => render(line, k => A.res(k, 15));

  /* ================================================================
     The round card: what the round just did, and what the next one is.
     Built once by the telly from public things, sent to every phone as
     plain data, and drawn the same way on both.
     ================================================================ */
  function roundCardHtml(card, A) {
    const n = card.round;
    const sub = (n === 5 ? 'Round V — the last round' : 'Round ' + ROMAN[n] + ' of V') + ' · ' + esc(card.startName) + ' goes first';
    const chips = list => list.map(uid => '<span class="rc-chip">' + A.card(uid, 'chip') + '</span>').join('');
    const scores = card.players.map(p => '<div class="rc-p"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b>' +
      '<span class="rc-t">' + p.total + '<small> points</small></span>' +
      '<span class="rc-d' + (p.delta < 0 ? ' neg' : '') + '">' + (p.delta >= 0 ? '+' : '−') + Math.abs(p.delta) + ' this round</span></div>').join('');
    const camp = card.fear.map(f => esc(f.name) + ' came home with ' + (f.n > 1 ? f.n + ' Fear cards' : 'a Fear card') + ' from a guardian.')
      .concat(card.kept.map(k => esc(k.name) + ' kept ' + plural(k.n, 'card', 'cards') + ' in hand.'));
    const row = [];
    if (card.exiled.length) row.push('<div class="rc-row"><span>The moon staff took</span>' + chips(card.exiled) + '<span>out of the row.</span></div>');
    if (card.dealt.length) row.push('<div class="rc-row"><span>New on offer:</span>' + chips(card.dealt) + '</div>');
    row.push('<div class="rc-row"><span>' + plural(card.shape.art, 'artifact', 'artifacts') + ' and ' + plural(card.shape.item, 'item', 'items') + ' on offer this round.</span></div>');
    return '<div class="rc">' +
      '<div class="rc-h">Round ' + ROMAN[card.ended] + ' is over</div>' +
      '<div class="rc-sub">' + sub + '</div>' +
      '<div class="rc-sc">' + scores + '</div>' +
      '<div class="rc-sec"><h4>Back at camp</h4><ul>' + (camp.length ? camp.map(t => '<li>' + t + '</li>').join('') : '<li>Everybody came home safely.</li>') + '</ul></div>' +
      (card.highlights.length ? '<div class="rc-sec"><h4>This round</h4><ul>' + card.highlights.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="rc-sec"><h4>The row</h4>' + row.join('') + '</div>' +
      '</div>';
  }

  /* The round's headlines, from its log: discoveries, guardians, the temple. */
  function highlights(events, src) {
    const x = ctx(src);
    const out = [];
    for (const e of events) {
      if (e.t === 'discover') out.push(x.P(e.by) + ' discovered ' + x.TILE(e.tile) + '.');
      else if (e.t === 'overcome') out.push(x.P(e.by) + ' overcame ' + x.GU(e.guardian) + '.');
      else if (e.t === 'temple') out.push(x.P(e.by) + ' reached the Lost Temple — ' + e.vp + ' points.');
    }
    return out;
  }

  const W = { VERSION, ROMAN, HEAD, ctx, lines, text, html, roundCardHtml, highlights };
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.ArnakWords = W;
})(typeof window !== 'undefined' ? window : this);
