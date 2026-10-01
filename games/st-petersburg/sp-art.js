'use strict';
/* Saint Petersburg — the drawn bits, as SVG strings.
 *
 * The telly and the phones both draw from here, so a Lumberjack is the same
 * axe in the same green in a hand as it is across the room. Everything is a
 * string because both pages build their markup by assignment.
 *
 * Gradient and filter ids are FIXED, never random. A random id makes every
 * repaint different, and the telly's privacy guard — which repaints the page
 * with the hands rewritten and demands not one character change — would then
 * fail every time and so prove nothing.
 */
(function (root) {

const D = (typeof module !== 'undefined' && module.exports) ? require('./sp-data.js') : root.SPData;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* The five worker symbols, in a 24x24 box. Their only job in the base game is
   to say which worker a green trading card is allowed to be built over, so
   they are drawn on the worker and on its pair and nowhere else. */
const SYM = {
  wood:  '<path d="M4 17 L14 7 l3 3 L7 20 Z"/><path d="M13 6 l4-3 4 4 -3 4 z"/>',
  gold:  '<circle cx="9" cy="15" r="4"/><circle cx="16" cy="12" r="3.2"/><circle cx="14" cy="18" r="2.6"/>',
  cloth: '<rect x="3" y="7" width="18" height="10" rx="1.6"/><path d="M3 10h18M3 14h18" stroke="rgba(0,0,0,.35)" stroke-width="1.2" fill="none"/>',
  fur:   '<path d="M12 3c4 0 7 3 7 7 0 5-3 8-7 11-4-3-7-6-7-11 0-4 3-7 7-7z"/>',
  ship:  '<path d="M3 16h18l-3 4H6z"/><path d="M11 3h1.6v11H11z"/><path d="M13 4l6 4-6 3z"/>',
  /* The Czar wears every worker symbol at once. Drawn as four marks rather
     than a question mark, because the market roundel beside it is already a
     question mark and two identical '?' on one card say nothing twice. */
  any:   '<circle cx="7" cy="7" r="3.1"/><rect x="14" y="4" width="6" height="6" rx="1.4"/>' +
         '<path d="M7 14l3.4 6H3.6z"/><path d="M17 13.6l3.4 3.4-3.4 3.4-3.4-3.4z"/>'
};

/* The five goods, in a 24x24 box, plus the '?' the Czar wears. Drawn rather
   than lifted: the roundel has to read at sixteen pixels from a sofa, so these
   are silhouettes with one internal line each and nothing else. */
const GOOD = {
  apple:   '<path d="M12 6c3-3 7-2 8 2 1 4-2 11-5 12-1.2.4-2-.4-3-.4s-1.8.8-3 .4c-3-1-6-8-5-12 1-4 5-5 8-2z"/>' +
           '<path d="M12 6V3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  grain:   '<path d="M6 21c0-7 2-12 6-15 4 3 6 8 6 15z"/>' +
           '<path d="M6 16h12M7 12h10" stroke="rgba(0,0,0,.35)" stroke-width="1.4" fill="none"/>',
  fish:    '<path d="M3 12c4-5 10-6 14-3 1.6 1.2 2 2 2 3s-.4 1.8-2 3c-4 3-10 2-14-3z"/>' +
           '<path d="M19 9l3-3v12l-3-3z"/><circle cx="8" cy="11" r="1.1" fill="rgba(0,0,0,.5)"/>',
  cabbage: '<circle cx="12" cy="13" r="8"/>' +
           '<path d="M12 5c-3 3-4 6-3 10M12 5c3 3 4 6 3 10" stroke="rgba(0,0,0,.3)" stroke-width="1.4" fill="none"/>',
  chicken: '<path d="M8 20c-2-1-3-3-3-5 0-4 3-7 7-7h3c2 0 3 1 3 3 0 3-2 5-5 6l-1 3z"/>' +
           '<path d="M12 5c1-2 3-2 3 0" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
           '<circle cx="15" cy="10" r=".9" fill="rgba(0,0,0,.55)"/>',
  any:     '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
           '<text x="12" y="17" text-anchor="middle" font-size="13" font-weight="800" fill="currentColor">?</text>'
};
/* One colour a good, so a track and a roundel and a card border all agree. */
const GOOD_HEX = {
  apple: '#e0553f', grain: '#d8ad3c', fish: '#4aa3c4',
  cabbage: '#5aa653', chicken: '#e6dcc8', any: '#c9a227'
};

/* The five phases as tokens. A start-player stone is the one thing on the
   table a player has to recognise across a room, so each is a shape and not
   just a colour. */
const PHASE_GLYPH = {
  worker:     '<rect x="10.5" y="9" width="3" height="12" rx="1"/><rect x="5" y="3.5" width="14" height="6" rx="1.8"/>',
  market:     '<path d="M4 9h16l-2 11H6z"/><path d="M8 9a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  building:   '<path d="M3 11 12 4l9 7v10H3z"/><rect x="10" y="14" width="4" height="7" fill="rgba(0,0,0,.4)"/>',
  aristocrat: '<path d="M3 8l4 4 5-7 5 7 4-4v11H3z"/>',
  trading:    '<path d="M4 9h11V6l5 5-5 5v-3H4z"/><path d="M20 17H9v3l-5-5 5-5v3h11z" opacity=".55"/>'
};

const A = {
  VERSION: 1,
  esc,
  GOOD_HEX,

  /* Once per page: the gradients everything else refers to. */
  defs() {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<linearGradient id="spCoin" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffe89a"/><stop offset="1" stop-color="#e0aa2a"/></linearGradient>' +
      '<linearGradient id="spVp" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#d98b1f"/></linearGradient>' +
      '<linearGradient id="spGreen" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#3f8f4a"/><stop offset="1" stop-color="#256133"/></linearGradient>' +
      '<linearGradient id="spBlue" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#3a7fd0"/><stop offset="1" stop-color="#1f4c86"/></linearGradient>' +
      '<linearGradient id="spRed" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#b6323c"/><stop offset="1" stop-color="#7a1c24"/></linearGradient>' +
      '</defs></svg>';
  },

  /* A ruble. */
  coin(v, size) {
    const s = size || 34;
    return '<svg class="coin" viewBox="0 0 40 40" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<circle cx="20" cy="20" r="18" fill="url(#spCoin)" stroke="rgba(0,0,0,.45)" stroke-width="1.4"/>' +
      '<text x="20" y="27" text-anchor="middle" font-size="20" font-weight="800" fill="#4a3208">' + esc(v) + '</text>' +
      '</svg>';
  },

  /* A victory point, on its shield. */
  vp(v, size) {
    const s = size || 34;
    return '<svg class="vp" viewBox="0 0 40 40" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<path d="M4 4h32v20c0 8-9 12-16 15C13 36 4 32 4 24Z" fill="url(#spVp)" stroke="rgba(0,0,0,.4)" stroke-width="1.4"/>' +
      '<text x="20" y="27" text-anchor="middle" font-size="19" font-weight="800" fill="#4a2c08">' + esc(v) + '</text>' +
      '</svg>';
  },

  /* One market roundel. `n` draws it as a stack with a count, because a
     Chicken Coop is three chickens and drawing three of them at this size is
     three smudges. */
  good(id, size, n) {
    if (!id || !GOOD[id]) return '';
    const s = size || 18;
    return '<span class="good" style="--g:' + (GOOD_HEX[id] || '#c9a227') + '">' +
      '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<g fill="currentColor">' + GOOD[id] + '</g></svg>' +
      (n > 1 ? '<i>' + esc(n) + '</i>' : '') + '</span>';
  },

  goodName(id) {
    const g = D.MARKET_GOODS.find(x => x.id === id);
    return g ? g.name : (id === 'any' ? 'any good' : id);
  },

  symbol(sym, size) {
    if (!sym || !SYM[sym]) return '';
    const s = size || 17;
    return '<svg class="sym" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<g fill="currentColor">' + SYM[sym] + '</g></svg>';
  },

  /* The income band every card carries: rubles on the left, points on the
     right, and the two counting cards saying what they count instead. */
  incomeBits(c, size) {
    const out = [];
    if (c.fn === 'mariinsky') out.push('<span class="per">' + A.vp(1, size) + '<em>× red</em></span>');
    else if (c.fn === 'taxman') out.push('<span class="per">' + A.coin(1, size) + '<em>× green</em></span>');
    else if (c.fn === 'coffeehouse') out.push('<span class="per">' + A.coin(1, size) + '<em>× red</em></span>');
    else if (c.fn === 'mayor') out.push('<span class="per">' + A.coin(1, size) + '<em>× blue</em></span>');
    else if (c.fn === 'textile') out.push('<span class="per">' + A.vp(2, size) + '<em>× weaving</em></span>');
    else if (c.fn === 'guildhall') out.push('<span class="nix">4, split however</span>');
    else if (c.fn === 'tradinghouse') out.push('<span class="per">' + A.coin(3, size) + '<em>→</em>' + A.vp(2, size) + '</span>');
    else if (c.fn === 'debtorsprison') out.push('<span class="nix">1, unless searched</span>');
    else if (c.fn === 'pub') out.push('<span class="per">' + A.coin(2, size) + '<em>→</em>' + A.vp(1, size) + '</span>');
    else {
      if (c.r) out.push(A.coin(c.r, size));
      if (c.vp) out.push(A.vp(c.vp, size));
    }
    if (!out.length && c.fn !== 'warehouse' && c.fn !== 'potemkin') out.push('<span class="nix">—</span>');
    if (c.fn === 'warehouse') out.push('<span class="nix">hand 4</span>');
    /* Module 1 adds two more Potemkin Villages at their own cost and worth —
       never the base card's printed 2 / 6, so this reads off the card
       instead of assuming it is always the one that started the deck. */
    if (c.fn === 'potemkin') out.push('<span class="nix">' + esc(c.cost) + ' / ' + esc(c.worth) + '</span>');
    return out.join('');
  },

  /* A whole card face. `opts` carries what this particular seat is being shown:
       price   what it would cost them (null when they cannot build it)
       row     'top' | 'bottom' | 'hand'
       small   a tighter face, for a play area rather than the board
       tag     a line under the name (why it is refused, what it goes over) */
  card(key, opts) {
    opts = opts || {};
    const c = D.card(key);
    if (!c) return '';
    const col = D.COLORS[c.color];
    const cls = 'spc ' + c.color + (opts.small ? ' small' : '') +
      (c.group === 'trading' ? ' trade' : '') + (c.purple ? ' purple' : '') + (opts.cls ? ' ' + opts.cls : '');
    const price = opts.price == null ? '' :
      '<span class="pr' + (opts.afford === false ? ' no' : '') + '">' + esc(opts.price) + '</span>';
    const cost = '<span class="cost">' + esc(c.cost) + '</span>';
    /* Module 1's purple cards keep whichever deck they were dealt into for
       pacing, but read as their own thing on screen — purple on the front,
       same as the printed cards. */
    return '<div class="' + cls + (c.orange ? ' orange' : '') + '" style="--c:' + (c.purple ? '#8e4ec6' : col.hex) + '">' +
      '<div class="chead">' + cost + (c.sym ? A.symbol(c.sym, opts.small ? 14 : 17) : '') +
      (c.good ? A.good(opts.wild || c.good, opts.small ? 15 : 19, c.goods) : '') + price + '</div>' +
      '<div class="cname">' + esc(c.name) + '</div>' +
      (opts.tag ? '<div class="ctag">' + esc(opts.tag) + '</div>' : '') +
      '<div class="cinc">' + A.incomeBits(c, opts.small ? 22 : 30) + '</div>' +
      '</div>';
  },

  /* One line of a play area.
   *
   * A whole card face is right on the board, where eight of them are the thing
   * everybody is choosing between. It is wrong in a play area: by the last
   * round somebody has seven buildings, and seven faces in a column a third of
   * a telly high are seven faces nobody can see. So a played card is a spine —
   * cost, name, what it pays — and identical cards stack the way they do on a
   * real table, with a count rather than a pile. */
  spine(key, count, wild) {
    const c = D.card(key);
    if (!c) return '';
    const col = D.COLORS[c.color];
    let inc = '';
    if (c.fn === 'mariinsky') inc = '<b class="r-vp">1</b><i>/red</i>';
    else if (c.fn === 'taxman') inc = '<b class="r-r">1</b><i>/grn</i>';
    else if (c.fn === 'pub') inc = '<i>2\u2192 1</i>';
    else if (c.fn === 'warehouse') inc = '<i>hand 4</i>';
    else if (c.fn === 'potemkin') inc = '<i>' + esc(c.cost) + ' / ' + esc(c.worth) + '</i>';
    else {
      if (c.r) inc += '<b class="r-r">' + c.r + '</b>';
      if (c.vp) inc += '<b class="r-vp">' + c.vp + '</b>';
      if (!inc) inc = '<i>\u2014</i>';
    }
    return '<div class="stk' + (c.group === 'trading' ? ' trade' : '') + (c.orange ? ' orange' : '') +
      '" style="--c:' + col.hex + '">' +
      '<span class="c">' + esc(c.cost) + '</span>' +
      '<span class="n">' + esc(c.short || c.name) + '</span>' +
      (count > 1 ? '<span class="x">\u00d7' + esc(count) + '</span>' : '') +
      (c.good ? A.good(wild || c.good, 13, c.goods * count) : '') +
      '<span class="i">' + inc + '</span></div>';
  },

  /* The back of a stack, with how many are left in it. */
  back(deck, left) {
    return '<div class="spback" data-deck="' + esc(deck) + '"><b>' + esc(left) + '</b><span>' + esc(deck) + '</span></div>';
  },

  /* A start-player stone: whoever holds it goes first in that phase, and
     hands it to their left neighbour at the end of the round. Drawn as the
     phase's own shape in the phase's own colour, because four or five plain
     discs on a player board tell nobody anything. */
  stone(phase, size) {
    const p = D.PHASE[phase];
    const hex = p && p.color ? D.COLORS[p.color].hex : '#8a7cc4';
    const s = size || 16;
    return '<svg class="stone" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" ' +
      'aria-hidden="true"><title>Goes first in the ' + esc(p ? p.name : phase) + '</title>' +
      '<circle cx="12" cy="12" r="11.2" fill="' + hex + '" stroke="rgba(0,0,0,.5)" stroke-width="1.2"/>' +
      '<g fill="rgba(255,255,255,.92)" transform="translate(12 12) scale(.66) translate(-12 -12)">' +
      (PHASE_GLYPH[phase] || '') + '</g></svg>';
  },

  /* The market's tracks: one row a good, with everybody's roundel count and
     the two places that score. */
  marketPanel(view, opts) {
    opts = opts || {};
    const val = view.marketValue || [0, 0];
    const name = id => { const q = view.players.find(x => x.id === id); return q ? q.name : '?'; };
    const hexOf = id => { const q = view.players.find(x => x.id === id); return q ? q.hex : '#888'; };
    let out = '<div class="mkt"><div class="mkthead"><span>The market pays</span>' +
      '<b>' + esc(val[0]) + '</b><u>first</u><b>' + esc(val[1]) + '</b><u>second</u></div>';
    for (const g of D.GOOD_IDS) {
      const st = (view.standings && view.standings[g]) || { first: [], second: [] };
      const rows = view.players.map(q => ({ id: q.id, hex: q.hex, n: (q.goods && q.goods[g]) || 0 }))
        .filter(r => r.n > 0).sort((x, y) => y.n - x.n);
      out += '<div class="mktrow">' + A.good(g, 17) +
        '<span class="mktname">' + esc(A.goodName(g)) + '</span>' +
        '<span class="mktbars">' +
        (rows.length ? rows.map(r =>
          '<i class="' + (st.first.indexOf(r.id) >= 0 ? 'one' : (st.second.indexOf(r.id) >= 0 ? 'two' : '')) + '"' +
          ' style="--p:' + esc(r.hex) + '" title="' + esc(name(r.id)) + '">' + esc(r.n) + '</i>').join('')
          : '<em>nobody</em>') +
        '</span></div>';
    }
    return out + '</div>';
  },

  /* The aristocrat strip along the bottom of the board, with this player's own
     step lit. Purely informational and drawn from the printed table. */
  nobleStrip(kinds) {
    let out = '<div class="nstrip">';
    for (let k = 1; k <= 10; k++)
      out += '<span class="' + (k === Math.min(10, kinds) ? 'on' : '') + '"><b>' + (k === 10 ? '10+' : k) +
        '</b>' + D.NOBLE_STEPS[k] + '</span>';
    return out + '</div>';
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = A;
root.SPArt = A;

})(typeof window !== 'undefined' ? window : globalThis);
