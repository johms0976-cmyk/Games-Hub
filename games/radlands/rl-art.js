'use strict';
/* Radlands — icons, drawn card faces, and the module's pictures as a layer.
 *
 * The art in art/ is cut from the user's own VASSAL module (tools/cut-art.py)
 * for this private hub only. It is NEVER load-bearing (LESSONS-CHECKLIST E):
 * every face is drawn — name, cost, junk icon, ability text — and the picture
 * only goes behind it once `probe()` has seen one load and set html.art. jsdom
 * tests and a missing folder get the drawn faces, and the privacy guard's
 * markup never depends on a picture.
 */
(function (root) {
  const D = root.RadData;
  const VERSION = 1;
  const ART_VER = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const url = f => 'art/' + f + '?v=' + ART_VER;

  /* The player aid's eight effect icons, drawn (no emoji). */
  const COL = { damage: '#d94fd0', injure: '#f06aa0', destroy: '#e9c43a', restore: '#2fb36a', draw: '#8e5ad6', water: '#2a9fc0', punk: '#e0408c', raid: '#9ad43a' };
  function burst(c, r1, r2, n) {
    let d = '';
    for (let k = 0; k < n * 2; k++) { const a = Math.PI * k / n, r = k % 2 ? r2 : r1; d += (k ? 'L' : 'M') + (12 + r * Math.cos(a)).toFixed(2) + ' ' + (12 + r * Math.sin(a)).toFixed(2); }
    return '<path d="' + d + 'Z" fill="' + c + '"/>';
  }
  const SVG = {
    damage: burst(COL.damage, 11, 6.5, 12) + '<circle cx="12" cy="12" r="4.5" fill="#ffd2f4"/>',
    injure: burst(COL.injure, 11, 7, 12) + '<circle cx="12" cy="11" r="4.6" fill="#fff"/><rect x="9.6" y="14" width="4.8" height="3" rx="1" fill="#fff"/><circle cx="10.3" cy="11" r="1.2" fill="' + COL.injure + '"/><circle cx="13.7" cy="11" r="1.2" fill="' + COL.injure + '"/>',
    destroy: '<circle cx="12" cy="12" r="11" fill="#2a1d3a" stroke="' + COL.destroy + '" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="' + COL.destroy + '"/>' +
      [0, 120, 240].map(a => '<path d="M12 12 L' + (12 + 8.6 * Math.cos((a - 90 - 30) * Math.PI / 180)).toFixed(2) + ' ' + (12 + 8.6 * Math.sin((a - 90 - 30) * Math.PI / 180)).toFixed(2) + ' A8.6 8.6 0 0 1 ' + (12 + 8.6 * Math.cos((a - 90 + 30) * Math.PI / 180)).toFixed(2) + ' ' + (12 + 8.6 * Math.sin((a - 90 + 30) * Math.PI / 180)).toFixed(2) + 'Z" fill="' + COL.destroy + '"/>').join(''),
    restore: '<rect x="2" y="3" width="20" height="18" rx="3" fill="' + COL.restore + '"/><path d="M15 16 V10 H8 M11 7 L8 10 L11 13" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    draw: '<rect x="5" y="6" width="15" height="15" rx="3" fill="#5f3aa0"/><rect x="3" y="3" width="15" height="15" rx="3" fill="' + COL.draw + '"/><path d="M10.5 14 V7 M7.5 10 L10.5 7 L13.5 10" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
    water: '<path d="M12 2 C12 2 4 11 4 15.5 A8 8 0 0 0 20 15.5 C20 11 12 2 12 2Z" fill="' + COL.water + '"/><path d="M12 11 V19 M8 15 H16" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
    punk: '<rect x="5" y="2" width="14" height="20" rx="2.4" fill="' + COL.punk + '"/><path d="M12 6 C9 6 8.4 8 8.4 10 V14 C8.4 15.5 9.5 16 12 18 C14.5 16 15.6 15.5 15.6 14 V10 C15.6 8 15 6 12 6Z" fill="#170b16"/><circle cx="10.5" cy="11.5" r="1.1" fill="#fff"/><circle cx="13.5" cy="11.5" r="1.1" fill="#fff"/>',
    raid: '<path d="M12 2 C14 7 19 9 19 15 A7 7 0 0 1 5 15 C5 11 8 10 9 6 C10 9 11 9 12 2Z" fill="' + COL.raid + '"/><circle cx="12" cy="15.5" r="3.4" fill="#151515"/><circle cx="12" cy="15.5" r="1.3" fill="#fff"/>',
    bomb: '<circle cx="11" cy="13" r="8.5" fill="#151515"/><path d="M16 6 L19 3" stroke="#e9c43a" stroke-width="2" stroke-linecap="round"/>',
    drop: '<path d="M12 2 C12 2 4 11 4 15.5 A8 8 0 0 0 20 15.5 C20 11 12 2 12 2Z" fill="#2a9fc0"/>',
    ready: '<circle cx="12" cy="12" r="9" fill="none" stroke="#5fd18a" stroke-width="3"/><path d="M7.5 12.5 L10.7 15.5 L16.5 8.8" stroke="#5fd18a" stroke-width="3" fill="none" stroke-linecap="round"/>',
    used: '<circle cx="12" cy="12" r="10" fill="#151515" stroke="#e0408c" stroke-width="2"/><rect x="6.5" y="10.8" width="11" height="2.6" rx="1.3" fill="#e0408c"/>',
    camp: '<path d="M12 3 L22 21 H2 Z" fill="#f2e9ff"/><path d="M12 10 L16 21 H8 Z" fill="#1d1028"/>',
    deck: '<rect x="6" y="5" width="13" height="17" rx="2" fill="#3d2a5c"/><rect x="4" y="3" width="13" height="17" rx="2" fill="#7a55b8" stroke="#1d1028" stroke-width="1"/>'
  };
  function icon(name, size, extra) {
    const s = SVG[name];
    if (!s) return '';
    return '<svg class="ri" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"' + (extra ? ' ' + extra : '') + '>' + s + '</svg>';
  }
  /* A number in a water drop / a bomb (the event countdown). */
  function cost(n, size) {
    return '<span class="rcost" style="--z:' + size + 'px">' + icon('drop', size) + '<b>' + (n == null ? '?' : n) + '</b></span>';
  }
  function bomb(n, size) {
    return '<span class="rcost bomb" style="--z:' + size + 'px">' + icon('bomb', size) + '<b>' + n + '</b></span>';
  }

  /* A card's face. kind of face:
       'tile'  the telly's board card (sized by the page's CSS)
       'full'  the phone's readable card
       'chip'  a name with its cost, one line
     o: { dmg, ready, used, dead, punk, small } */
  function card(inst, face, o) {
    o = o || {};
    if (o.punk) {
      return '<div class="rcard punk ' + face + (o.dmg ? ' dmg' : '') + '" style="--pic:url(' + url('punk.webp') + ')"><i class="rpic art-only"></i>' +
        '<div class="rch">' + icon('punk', 22) + '<b class="rnm">Punk</b>' + stateTag(o) + '</div>' +
        (o.gift ? '<div class="rab">' + cost(1, 18) + '<span>Damage (Argo’s gift)</span></div>' : '<div class="rtr">A person with no ability. Dies at the first damage.</div>') + '</div>';
    }
    const c = D.card(inst);
    if (!c) return '';
    if (face === 'chip') return '<span class="rchip ' + c.kind + '">' + (c.kind === 'camp' ? icon('camp', 16) : cost(c.cost, 16)) + esc(c.name) + '</span>';
    const pic = 'style="--pic:url(' + url((c.id === 'silo' ? 'silo' : c.id) + '.webp') + ')"';
    let head, body = '';
    if (c.kind === 'camp') {
      if (o.dead) {
        return '<div class="rcard camp dead ' + face + '" style="--pic:url(' + url('camp_back.webp') + ')"><i class="rpic art-only"></i><div class="rch">' + icon('camp', 20) + '<b class="rnm">' + esc(c.name) + '</b></div><div class="rgone">DESTROYED</div></div>';
      }
      head = '<span class="rdraw" title="cards drawn at the start">' + c.draw + '</span><b class="rnm">' + esc(c.name) + '</b>' + stateTag(o);
      body = c.ab.map(a => '<div class="rab">' + cost(a.cost, face === 'full' ? 20 : 18) + '<span>' + esc(a.text) + '</span></div>').join('') +
        (c.tr || []).map(t => '<div class="rtr">' + esc(t) + '</div>').join('');
    } else if (c.kind === 'person') {
      head = cost(c.cost, face === 'full' ? 22 : 20) + '<b class="rnm">' + esc(c.name) + '</b>' + stateTag(o) + '<span class="rjunk" title="junk: ' + esc(D.JUNK[c.junk]) + '">' + icon(c.junk, face === 'full' ? 22 : 20) + '</span>';
      body = c.ab.map(a => '<div class="rab">' + cost(a.cost, face === 'full' ? 20 : 18) + '<span>' + esc(a.text) + '</span></div>').join('') +
        (c.tr || []).map(t => '<div class="rtr">' + esc(t) + '</div>').join('') +
        (o.gift ? '<div class="rab gift">' + cost(1, 18) + '<span>Damage (Argo’s gift)</span></div>' : '');
    } else if (c.kind === 'event') {
      head = cost(c.cost, face === 'full' ? 22 : 20) + '<b class="rnm">' + esc(c.name) + '</b>' + (c.id === 'raiders' ? '' : bomb(c.slot, face === 'full' ? 22 : 20)) + (c.junk ? '<span class="rjunk">' + icon(c.junk, face === 'full' ? 22 : 20) + '</span>' : '');
      body = '<div class="rab ev"><span>' + esc(c.text) + '</span></div>';
    } else {
      head = '<b class="rnm">' + esc(c.name) + '</b><span class="rjunk">' + icon('water', 20) + '</span>';
      body = '<div class="rtr">' + esc(c.text) + '</div>';
    }
    const junk = face === 'full' && c.junk ? '<div class="rjk">Junk: ' + icon(c.junk, 16) + ' ' + esc(D.JUNK[c.junk]) + '</div>' : '';
    return '<div class="rcard ' + c.kind + ' ' + face + (o.dmg ? ' dmg' : '') + (o.used ? ' used' : '') + '" ' + pic + '><i class="rpic art-only"></i>' +
      '<div class="rch">' + head + '</div>' + body + junk + '</div>';
  }
  function stateTag(o) {
    if (o.dmg) return '<span class="rtag dmgt">damaged</span>';
    if (o.ready === false) return '<span class="rtag nr">' + (o.campUsed ? 'used' : 'not ready') + '</span>';
    if (o.ready === true) return '<span class="rtag rd">ready</span>';
    return '';
  }

  function styles() {
    return '<style id="radArt">' +
      '.ri{display:inline-block;vertical-align:middle;flex:none}' +
      '.rcost{position:relative;display:inline-flex;align-items:center;justify-content:center;width:var(--z);height:var(--z);flex:none}' +
      '.rcost svg{position:absolute;inset:0;width:100%;height:100%}' +
      '.rcost b{position:relative;color:#fff;font-weight:900;font-size:calc(var(--z)*.55);top:calc(var(--z)*.1)}' +
      '.rcost.bomb b{color:#fff;top:calc(var(--z)*.06);left:calc(var(--z)*-.04)}' +
      '.rcard{position:relative;overflow:hidden;border-radius:10px;background:linear-gradient(160deg,#2b1745,#1a0f2b);border:2px solid #4a3270;color:#f6eefe;display:flex;flex-direction:column;gap:.25em;padding:.35em .5em;min-width:0}' +
      '.rcard.camp{background:linear-gradient(160deg,#22172e,#0f0a16);border-color:#141016;box-shadow:inset 0 0 0 2px #3a2c49}' +
      '.rcard.event{border-style:dashed;border-color:#e9c43a}' +
      '.rcard.punk{background:repeating-linear-gradient(45deg,#3a0f2c 0 10px,#2a0b20 10px 20px);border-color:#e0408c}' +
      '.rcard.dmg{border-color:#ff5a7a;box-shadow:0 0 0 2px rgba(255,90,122,.35)}' +
      '.rcard.dead{background:#120c18;border-color:#2a2030;color:#8a7c99}' +
      '.rcard .rpic{position:absolute;inset:0;background:var(--pic) center 30%/cover no-repeat;opacity:0;pointer-events:none}' +
      'html.art .rcard .rpic{opacity:.34}' +
      'html.art .rcard.dead .rpic{opacity:.5;filter:grayscale(.6)}' +
      '.rcard>*:not(.rpic){position:relative}' +
      '.rch{display:flex;align-items:center;gap:.35em;min-width:0}' +
      '.rnm{font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-shadow:0 1px 3px #000}' +
      '.rjunk{margin-left:auto;display:inline-flex}' +
      '.rdraw{display:inline-flex;align-items:center;justify-content:center;min-width:1.4em;height:1.4em;border:2px solid #f6eefe;border-radius:5px;font-weight:900;font-size:.85em;flex:none}' +
      '.rab{display:flex;align-items:flex-start;gap:.35em;background:rgba(8,4,12,.72);border-radius:7px;padding:.18em .35em;line-height:1.2}' +
      '.rab.ev{background:rgba(233,196,58,.16);border:1px solid rgba(233,196,58,.5)}' +
      '.rab.gift{border:1px dashed #d94fd0}' +
      '.rtr{font-size:.86em;color:#bff3cf;background:rgba(10,30,18,.72);border-radius:7px;padding:.15em .35em;line-height:1.2}' +
      '.rjk{font-size:.82em;color:#d8c9ea}' +
      '.rtag{font-size:.68em;font-weight:900;text-transform:uppercase;letter-spacing:.05em;border-radius:5px;padding:.05em .4em;flex:none}' +
      '.rtag.dmgt{background:#ff5a7a;color:#1a0710}.rtag.nr{background:#3a2c49;color:#d8c9ea}.rtag.rd{background:#1f5a38;color:#bff3cf}' +
      '.rgone{font-weight:900;letter-spacing:.2em;color:#ff5a7a;text-align:center;margin:auto 0}' +
      '.rchip{display:inline-flex;align-items:center;gap:.3em;background:#2b1745;border:1px solid #4a3270;border-radius:999px;padding:.1em .6em .1em .2em;font-weight:800}' +
      '.rchip.event{border-color:#e9c43a}' +
      '</style>';
  }

  /* Turn the pictures on once one has loaded (never in jsdom). */
  function probe() {
    try {
      const im = new Image();
      im.onload = () => { if (im.naturalWidth > 0) document.documentElement.classList.add('art'); };
      im.src = url('railgun.webp');
    } catch (e) {}
  }

  const Art = { VERSION, ART_VER, esc, url, icon, cost, bomb, card, styles, probe, COL };
  root.RadArt = Art;
})(typeof window !== 'undefined' ? window : this);
