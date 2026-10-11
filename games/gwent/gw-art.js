'use strict';
/* Gwent — drawn icons and card faces, and the printed cards as a layer.
 *
 * The pictures in art/ are squeezed from Reference/Gwent Art (tools/cut-art.py):
 * each is a whole printed card, CD PROJEKT RED's, for this private hub only.
 * They are NEVER load-bearing (LESSONS-CHECKLIST E): every face is drawn —
 * strength, row, ability, name — and the picture only goes over it once
 * `probe()` has seen one load and set html.art. jsdom tests and a missing
 * folder get the drawn faces, and the privacy guard's markup never depends on
 * a picture. With the pictures on, the drawn strength badge stays on top: it
 * shows the strength the card has NOW (weather, horns, bonds), which the
 * printed number cannot.
 */
(function (root) {
  const D = root.GwentData;
  const VERSION = 1;
  const ART_VER = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const url = f => 'art/' + f + '?v=' + ART_VER;
  const FAC_COL = { nr: ['#2f5fae', '#16294d'], ng: ['#3a3426', '#14110b'], mo: ['#8e2228', '#360c10'], st: ['#2f7a3c', '#11301a'], sk: ['#1f7a7a', '#0c2e33'], ne: ['#6a5a44', '#2a2218'] };

  /* Icons, drawn (no emoji). 24x24 viewBox. */
  const W = '#f4ecd8', K = '#1b140c';
  const SVG = {
    close: '<path d="M5 19 L16 8 L18 6 L19 5 L18.5 7 L17 9 L6 20 Z" fill="' + W + '"/><path d="M4 16 L8 20" stroke="' + W + '" stroke-width="2.2" stroke-linecap="round"/><circle cx="4.5" cy="20" r="1.6" fill="' + W + '"/>',
    ranged: '<path d="M6 4 C15 7 15 17 6 20" stroke="' + W + '" stroke-width="2" fill="none"/><path d="M6 4 L6 20" stroke="' + W + '" stroke-width="1" /><path d="M3 12 L20 12 M17 9.5 L20.5 12 L17 14.5" stroke="' + W + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    siege: '<path d="M3 18 L21 18" stroke="' + W + '" stroke-width="2"/><circle cx="7" cy="19" r="2.2" fill="' + W + '"/><circle cx="17" cy="19" r="2.2" fill="' + W + '"/><path d="M6 17 L18 6" stroke="' + W + '" stroke-width="2.2" stroke-linecap="round"/><circle cx="18.5" cy="5.5" r="2.3" fill="' + W + '"/>',
    agile: '<path d="M5 12 A7 7 0 0 1 17 7" stroke="' + W + '" stroke-width="2.2" fill="none"/><path d="M15 4 L18 7.5 L13.8 8.6" fill="' + W + '"/><path d="M19 12 A7 7 0 0 1 7 17" stroke="' + W + '" stroke-width="2.2" fill="none"/><path d="M9 20 L6 16.5 L10.2 15.4" fill="' + W + '"/>',
    spy: '<path d="M2 12 C6 6 18 6 22 12 C18 18 6 18 2 12 Z" fill="none" stroke="' + W + '" stroke-width="1.8"/><circle cx="12" cy="12" r="3.4" fill="' + W + '"/>',
    bond: '<path d="M2 13 L7 9 L11 11 L15 9 L22 13 L16 17 L12 15 L8 17 Z" fill="' + W + '"/><path d="M8 13 L12 15 L15 13" stroke="' + K + '" stroke-width="1" fill="none"/>',
    muster: '<rect x="3" y="8" width="7" height="9" rx="2" fill="' + W + '"/><rect x="14" y="8" width="7" height="9" rx="2" fill="' + W + '"/><path d="M4 8 C4 4 9 4 9 8 M15 8 C15 4 20 4 20 8" stroke="' + W + '" stroke-width="1.6" fill="none"/>',
    morale: '<path d="M10 4 H14 V10 H20 V14 H14 V20 H10 V14 H4 V10 H10 Z" fill="' + W + '"/>',
    medic: '<path d="M12 21 C4 15 2 11 2 8 A5 5 0 0 1 12 6 A5 5 0 0 1 22 8 C22 11 20 15 12 21 Z" fill="' + W + '"/><path d="M10.5 8 H13.5 V10.5 H16 V13.5 H13.5 V16 H10.5 V13.5 H8 V10.5 H10.5 Z" fill="' + K + '"/>',
    horn: '<path d="M3 15 C8 15 15 10 19 4 L21 6 C18 13 18 17 21 20 L19 21 C15 18 9 17 3 18 Z" fill="' + W + '"/>',
    scorch: '<path d="M12 3 C6 3 4 7 4 11 C4 14 6 15 7 16 V20 H17 V16 C18 15 20 14 20 11 C20 7 18 3 12 3 Z" fill="' + W + '"/><circle cx="9" cy="11" r="2" fill="' + K + '"/><circle cx="15" cy="11" r="2" fill="' + K + '"/><path d="M10 20 V17 M12 20 V17 M14 20 V17" stroke="' + K + '" stroke-width="1"/>',
    frost: [0, 60, 120].map(a => '<path d="M12 2 L12 22 M9 4.5 L12 7 L15 4.5 M9 19.5 L12 17 L15 19.5" stroke="' + W + '" stroke-width="1.7" fill="none" transform="rotate(' + a + ' 12 12)"/>').join(''),
    fog: '<path d="M4 8 C8 6 12 10 20 7 M3 12 C8 10 14 14 21 11 M4 16 C9 14 13 18 20 15" stroke="' + W + '" stroke-width="2" fill="none" stroke-linecap="round"/>',
    rain: '<path d="M7 4 C9 8 10 10 8 12 C6 12 5 10 7 4 Z M15 8 C17 12 18 14 16 16 C14 16 13 14 15 8 Z M10 13 C12 17 13 19 11 21 C9 21 8 19 10 13 Z" fill="' + W + '"/>',
    clear: '<circle cx="12" cy="12" r="5" fill="' + W + '"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => '<path d="M12 2 L12 5" stroke="' + W + '" stroke-width="2" stroke-linecap="round" transform="rotate(' + a + ' 12 12)"/>').join(''),
    decoy: '<circle cx="12" cy="6" r="3" fill="' + W + '"/><path d="M12 9 V21 M6 12 H18" stroke="' + W + '" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="13" r="5" fill="none" stroke="' + W + '" stroke-width="1.4"/>',
    hero: '<path d="M12 2 L14.6 8.6 L21.5 9 L16.2 13.4 L18 20.2 L12 16.4 L6 20.2 L7.8 13.4 L2.5 9 L9.4 8.6 Z" fill="#f1c75b"/>',
    leader: '<path d="M3 18 L5 7 L9.5 12 L12 5 L14.5 12 L19 7 L21 18 Z" fill="#f1c75b"/><rect x="3" y="18.5" width="18" height="2.5" fill="#f1c75b"/>',
    pass: '<circle cx="12" cy="12" r="9" fill="none" stroke="' + W + '" stroke-width="2"/><path d="M7 12 H17" stroke="' + W + '" stroke-width="2.4" stroke-linecap="round"/>',
    berserk: '<ellipse cx="12" cy="15" rx="5.5" ry="4.5" fill="' + W + '"/><circle cx="6" cy="8.5" r="2" fill="' + W + '"/><circle cx="10" cy="6" r="2" fill="' + W + '"/><circle cx="14" cy="6" r="2" fill="' + W + '"/><circle cx="18" cy="8.5" r="2" fill="' + W + '"/>',
    mardroeme: '<path d="M3 11 C3 5 21 5 21 11 Z" fill="' + W + '"/><rect x="9.5" y="11" width="5" height="9" rx="2" fill="' + W + '"/><circle cx="8" cy="8.5" r="1.2" fill="' + K + '"/><circle cx="14" cy="7.5" r="1.2" fill="' + K + '"/>',
    summon: '<rect x="3" y="8" width="7" height="9" rx="2" fill="' + W + '"/><rect x="14" y="8" width="7" height="9" rx="2" fill="' + W + '"/><path d="M12 3 L12 20" stroke="' + W + '" stroke-width="1.6"/>',
    avenger: '<path d="M12 3 L19 11 H15 V21 H9 V11 H5 Z" fill="' + W + '"/>',
    scorchAll: '<path d="M12 3 C6 3 4 7 4 11 C4 14 6 15 7 16 V20 H17 V16 C18 15 20 14 20 11 C20 7 18 3 12 3 Z" fill="#ffb070"/><circle cx="9" cy="11" r="2" fill="' + K + '"/><circle cx="15" cy="11" r="2" fill="' + K + '"/>',
    storm: '<path d="M4 9 C8 7 12 11 20 8" stroke="' + W + '" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 11 L9 17 H12 L10 22 L16 14 H13 L15 11 Z" fill="' + W + '"/>',
    deck: '<rect x="6" y="5" width="13" height="17" rx="2" fill="#5a4630"/><rect x="4" y="3" width="13" height="17" rx="2" fill="#a07c4c" stroke="#1b140c" stroke-width="1"/>'
  };
  const ROWI = ['close', 'ranged', 'siege'];
  function icon(name, size, extra) {
    const s = SVG[name];
    if (!s) return '';
    return '<svg class="gi" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"' + (extra ? ' ' + extra : '') + '>' + s + '</svg>';
  }
  const rowIcon = (r, size) => icon(ROWI[r], size);

  /* The picture file for a card on the table: copy k of a card uses
     painting k, so the three Arachas are three different spiders. */
  const picOf = (id, k) => D.artFile(id, k || 0);

  /* A card face.
       c     a card: { id, k } or just an id
       face  'tile'  a unit on a row (the telly and the phone's board)
             'hand'  the phone's hand card
             'big'   the zoomed or spotlit card
             'chip'  a name with its strength, one line
       o     { v: strength now, sel, dim } */
  function card(c, face, o) {
    o = o || {};
    const id = typeof c === 'string' ? c : c.id;
    const k = typeof c === 'string' ? 0 : (c.k || 0);
    const d = D.card(id);
    if (!d) return '';
    if (face === 'chip') return '<span class="gchip ' + (d.hero ? 'hero' : '') + '">' + (d.kind === 'unit' ? '<b>' + (o.v != null ? o.v : d.str) + '</b>' : icon(d.sp || 'leader', 15)) + esc(d.name) + '</span>';
    const fac = d.fac;
    const col = FAC_COL[fac] || FAC_COL.ne;
    /* A card with no picture (Skellige) keeps its drawn face with the pictures on. */
    const file = picOf(id, k);
    const pic = 'style="' + (file ? '--pic:url(' + url(file) + ');' : '') + '--c1:' + col[0] + ';--c2:' + col[1] + '"';
    let badge = '', icons = '';
    if (d.kind === 'unit') {
      const v = o.v != null ? o.v : d.str;
      const tone = v > d.str ? ' up' : v < d.str ? ' down' : '';
      badge = '<span class="gs' + (d.hero ? ' hero' : '') + tone + '">' + v + '</span>';
      icons = '<span class="gic">' + (d.agile ? icon('agile', 20) : rowIcon(d.rows[0], 20)) + (d.ab ? icon(d.ab, 20) : '') + (d.hero ? icon('hero', 20) : '') + '</span>';
    } else if (d.kind === 'special') {
      badge = '<span class="gs sp">' + icon(d.sp, 26) + '</span>';
    } else {
      badge = '<span class="gs sp">' + icon('leader', 26) + '</span>';
    }
    const name = d.kind === 'leader' ? d.name + ' — ' + d.title : d.name;
    const words = face === 'big' || face === 'hand' ? '<span class="gtx">' + esc(D.textOf(id)) + '</span>' : '';
    return '<div class="gc ' + face + ' ' + d.kind + (file ? '' : ' noart') + (d.hero ? ' hero' : '') + (o.sel ? ' sel' : '') + (o.dim ? ' dim' : '') + '" ' + pic + ' data-card="' + esc(id) + '">' +
      '<i class="gpic"></i>' + badge + icons + '<span class="gnm">' + esc(name) + '</span>' + words + '</div>';
  }
  /* The back of a card (a hand you cannot see). */
  function back(fac, face) {
    return '<div class="gc back ' + (face || 'tile') + '" style="--pic:url(' + url('back_' + (fac || 'ne') + '.webp') + ')"><i class="gpic"></i></div>';
  }

  function styles() {
    return '<style id="gwArt">' +
      '.gi{display:inline-block;vertical-align:middle;flex:none}' +
      '.gc{position:relative;overflow:hidden;border-radius:.5em;aspect-ratio:674/1048;background:linear-gradient(170deg,var(--c1),var(--c2));border:2px solid #000;' +
        'box-shadow:0 .15em .4em rgba(0,0,0,.5);color:#f4ecd8;display:block;flex:none;font-size:1em}' +
      '.gc.hero{border-color:#c99a2e}' +
      '.gc.sel{outline:.18em solid #f1c75b;outline-offset:.05em}' +
      '.gc.dim{opacity:.38}' +
      '.gc .gpic{position:absolute;inset:0;background:var(--pic) center/cover no-repeat;opacity:0;pointer-events:none}' +
      'html.art .gc .gpic{opacity:1}' +
      '.gc.back{background:linear-gradient(170deg,#4b3a26,#1d150c)}' +
      '.gc .gs{position:absolute;left:3%;top:2%;width:38%;aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'background:radial-gradient(circle at 40% 35%,#fffaf0,#d9cdb2);color:#1b140c;font-weight:900;font-size:1.25em;border:.12em solid #b98b3a;box-shadow:0 .1em .3em rgba(0,0,0,.6);z-index:2}' +
      '.gc .gs.hero{background:radial-gradient(circle at 40% 35%,#3a2c16,#120d06);color:#f6e2a8;border-color:#f1c75b}' +
      '.gc .gs.up{color:#0d5a1d;box-shadow:0 0 0 .14em #4fd06b,0 .1em .3em rgba(0,0,0,.6)}' +
      '.gc .gs.hero.up{color:#8ff0a4}' +
      '.gc .gs.down{color:#9c1420;box-shadow:0 0 0 .14em #ff5a6a,0 .1em .3em rgba(0,0,0,.6)}' +
      '.gc .gs.sp{background:radial-gradient(circle at 40% 35%,#5a4630,#20170d);border-color:#c99a2e}' +
      '.gc .gic{position:absolute;left:5%;top:44%;display:flex;flex-direction:column;gap:.15em;z-index:1}' +
      '.gc .gic .gi{width:1.15em;height:1.15em;background:rgba(0,0,0,.55);border-radius:50%;padding:.08em}' +
      '.gc .gnm{position:absolute;left:0;right:0;bottom:0;padding:.25em .3em;background:linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,.5));font-weight:800;font-size:.62em;line-height:1.1;text-align:center;z-index:1}' +
      '.gc .gtx{position:absolute;left:0;right:0;bottom:0;padding:.35em .45em;background:rgba(14,10,6,.92);font-size:.6em;line-height:1.25;z-index:3;display:none}' +
      /* The pictures carry the printed name and icons: hide the drawn ones. */
      'html.art .gc .gic,html.art .gc .gnm{display:none}' +
      'html.art .gc.noart .gic{display:flex}html.art .gc.noart .gnm{display:block}html.art .gc.noart .gs.sp{display:flex}html.art .gc.noart .gpic{opacity:0}' +
      'html.art .gc.special .gs.sp,html.art .gc.leader .gs.sp{display:none}' +
      '.gc.big .gtx{display:block;font-size:.5em}' +
      'html.art .gc .gtx{display:none}' +
      '.gchip{display:inline-flex;align-items:center;gap:.3em;background:#2a2016;border:1px solid #5a4630;border-radius:999px;padding:.05em .55em .05em .15em;font-weight:700;white-space:nowrap}' +
      '.gchip b{display:inline-flex;align-items:center;justify-content:center;min-width:1.5em;height:1.5em;border-radius:50%;background:#e9dfc6;color:#1b140c;font-size:.85em}' +
      '.gchip.hero b{background:#20170d;color:#f1c75b;border:1px solid #f1c75b}' +
      '.gw-gems{display:inline-flex;gap:.25em;align-items:center}' +
      '.gw-gems i{width:.9em;height:.9em;transform:rotate(45deg);border-radius:.15em;background:#3a1a1c;border:1px solid #6a3a3c}' +
      '.gw-gems i.on{background:radial-gradient(circle at 35% 30%,#ff8a8a,#c01c2c 60%,#5a0a12);border-color:#ff9a9a;box-shadow:0 0 .4em rgba(255,60,80,.6)}' +
      '</style>';
  }

  /* Turn the pictures on once one has loaded (never in jsdom). */
  function probe() {
    try {
      const im = new Image();
      im.onload = () => { if (im.naturalWidth > 0) document.documentElement.classList.add('art'); };
      im.src = url('geralt_of_rivia_1.webp');
    } catch (e) {}
  }

  const Art = { VERSION, ART_VER, esc, url, icon, rowIcon, card, back, styles, probe, picOf, FAC_COL };
  root.GwentArt = Art;
})(typeof window !== 'undefined' ? window : this);
