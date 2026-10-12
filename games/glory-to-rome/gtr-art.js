'use strict';
/* Glory to Rome — card faces and icons, as HTML strings.
 *
 * Every face is drawn first (colour band, role, name, material, value, the
 * power in our own words), so the game is complete with no pictures at all.
 * The printed pictures (art/<kind>.webp, cut from the user's print-and-play
 * sheets by tools/cut-art.py) are a LAYER: `A.probe()` loads one, and only
 * when it arrives does the page get `html.art`, which lays the picture over
 * the drawn face. The art is never load-bearing (LESSONS-CHECKLIST E): jsdom
 * tests and a missing folder get the drawn faces, and the markup is the same
 * either way, so the privacy guard never sees a difference. `?noart` turns
 * it off. No emoji anywhere: the role marks are SVG.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./gtr-data.js') : root.GtrData;
  const VERSION = 1;
  const ART_VER = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let base = 'art/';
  const url = f => base + f + '?v=' + ART_VER;

  /* The role marks, drawn small and flat like the cards' own. */
  const ICON = {
    laborer: '<path d="M14 3l3 3-6.5 6.5-1.6-.4-.4-1.6z" fill="currentColor"/><path d="M7.5 11.5l2 2-4.2 4.2a1.4 1.4 0 0 1-2-2z" fill="currentColor"/>',
    craftsman: '<path d="M3 15L15 3l2 2-1 1 1 1-1.2 1.2-1-1-1 1 1 1-1.2 1.2-1-1-1 1 1 1L5 17z" fill="currentColor"/>',
    legionary: '<path d="M4 3h12v9c0 3-3 5-6 6-3-1-6-3-6-6z" fill="currentColor"/><path d="M10 5v11M6 9h8" stroke="#fff" stroke-width="1.3"/>',
    architect: '<path d="M4 3h3v11h11v3H4z" fill="currentColor"/><path d="M7 6h2M7 9h2M7 12h2M10 14v2M13 14v2" stroke="#fff" stroke-width="1"/>',
    merchant: '<path d="M10 2v15M5 5h10M3 17h14" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5 5l-3 6h6zM15 5l-3 6h6z" fill="currentColor"/>',
    patron: '<path d="M4 3h12c0 5-2.5 7-5 7.5V15h3v2H6v-2h3v-4.5C6.5 10 4 8 4 3z" fill="currentColor"/>',
    thinker: '<rect x="6" y="3" width="10" height="13" rx="1.5" fill="currentColor" opacity=".55"/><rect x="3" y="5" width="10" height="13" rx="1.5" fill="currentColor"/>',
    jack: '<path d="M10 1l1.6 3v8h-3.2V4z" fill="currentColor"/><path d="M6.5 12h7v1.6h-7zM9 13.6h2v4.4H9z" fill="currentColor"/>',
    vault: '<rect x="3" y="5" width="14" height="12" rx="2" fill="currentColor"/><circle cx="10" cy="11" r="2.4" fill="#fff"/><path d="M6 5V4a4 4 0 0 1 8 0v1" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    coin: '<circle cx="10" cy="10" r="7.5" fill="#e3b94a" stroke="#6b4b10" stroke-width="1.2"/><circle cx="10" cy="10" r="4.6" fill="none" stroke="#6b4b10" stroke-width=".9"/>',
    deck: '<rect x="5" y="2" width="11" height="15" rx="1.6" fill="currentColor" opacity=".5"/><rect x="3" y="4" width="11" height="15" rx="1.6" fill="currentColor"/>',
    site: '<path d="M2 17L17 2M2 11L11 2M8 17L17 8M2 5L5 2M14 17l3-3" stroke="currentColor" stroke-width="2.2"/>',
    leader: '<path d="M10 3c-3 2-5 5-5 9M10 3c3 2 5 5 5 9" stroke="#5a7a3a" stroke-width="2" fill="none"/><path d="M5 8l-2-1M5 11l-2.4 0M15 8l2-1M15 11l2.4 0" stroke="#5a7a3a" stroke-width="1.6"/>',
    influence: '<path d="M10 2l2.4 5 5.4.6-4 3.7 1.1 5.4L10 14l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" fill="currentColor"/>'
  };
  function icon(name, size, color) {
    const s = size || 18;
    return '<svg class="gi" width="' + s + '" height="' + s + '" viewBox="0 0 20 20" aria-hidden="true"' + (color ? ' style="color:' + esc(color) + '"' : '') + '>' + (ICON[name] || '') + '</svg>';
  }
  const roleHex = role => role && D.ROLE[role] && D.ROLE[role].mat ? D.MAT[D.ROLE[role].mat].hex : '#111';
  const coins = n => '<span class="gcoins">' + Array.from({ length: n }, () => icon('coin', 14)).join('') + '</span>';

  /* A card face. size: 'full' (a hand card, a zoom) | 'tile' (the Pool, a
     building) | 'mini' (narrow). o: { dim, sel, tag, note } */
  function card(k, size, o) {
    o = o || {};
    size = size || 'full';
    if (k === 'jack') {
      return '<div class="gc ' + size + ' jack' + (o.dim ? ' dim' : '') + (o.sel ? ' sel' : '') + '" data-k="jack" style="--pic:url(' + url('jack_quill.webp') + ')">' +
        '<div class="gpic"></div><div class="gname">Jack</div><div class="gmark">' + icon('jack', size === 'full' ? 42 : 26, '#fff') + '</div>' +
        '<div class="gtext">Lead or follow any role (not Think).</div>' + (o.tag ? '<div class="gtag">' + esc(o.tag) + '</div>' : '') + '</div>';
    }
    if (k === 'back') return '<div class="gc ' + size + ' back" style="--pic:url(' + url('back.webp') + ')"><div class="gpic"></div><div class="gname">Glory to Rome</div></div>';
    const c = D.card(k);
    if (!c) return '<div class="gc ' + size + '">?</div>';
    const m = D.MAT[c.mat];
    const role = D.ROLE[c.role];
    return '<div class="gc ' + size + (o.dim ? ' dim' : '') + (o.sel ? ' sel' : '') + '" data-k="' + esc(k) + '" style="--c:' + m.hex + ';--ci:' + m.ink + ';--pic:url(' + url(k + '.webp') + ')">' +
      '<div class="gpic"></div>' +
      '<div class="grole">' + icon(c.role, size === 'full' ? 20 : 15, m.hex) + '<span>' + esc(role.name) + '</span></div>' +
      '<div class="gname">' + esc(size === 'mini' ? (c.short || c.name) : c.name) + '</div>' +
      '<div class="gtext">' + esc(c.text) + '</div>' +
      '<div class="gfoot">' + coins(m.value) + '<span class="gmat">' + esc(m.name) + '</span></div>' +
      (c.set === 'rep' ? '<div class="gset" title="Republic only">R</div>' : c.set === 'imp' ? '<div class="gset" title="Imperium only">I</div>' : c.set === 'geek' ? '<div class="gset" title="Geek expansion">G</div>' : '') +
      (o.tag ? '<div class="gtag">' + esc(o.tag) + '</div>' : '') + (o.note ? '<div class="gnote">' + esc(o.note) + '</div>' : '') + '</div>';
  }
  /* A material or a client as a chip: the colour, the word, a count. */
  function mat(m, n, o) {
    o = o || {};
    const x = D.MAT[m];
    return '<span class="gm' + (o.big ? ' big' : '') + '" style="--c:' + x.hex + ';--ci:' + x.ink + '">' + (n != null && n !== 1 ? '<b>' + n + '</b>' : '') + esc(o.label || x.name) + '</span>';
  }
  function client(role, n, o) {
    o = o || {};
    const hex = roleHex(role);
    return '<span class="gcl' + (o.big ? ' big' : '') + '" style="--c:' + hex + '">' + icon(role, o.big ? 20 : 15, '#fff') + (n != null && n !== 1 ? '<b>' + n + '</b>' : '') + '<span>' + esc(D.ROLE[role].name) + '</span></span>';
  }
  /* A building in play: its name on the colour of its site, the materials in
     it as pips out of what it needs. */
  function building(b, o) {
    o = o || {};
    const c = D.card(b.card);
    const m = D.MAT[c.mat];
    const s = D.MAT[b.site];
    const pips = b.done ? '' : '<span class="gpips">' + Array.from({ length: b.need }, (_, i) => '<i style="background:' + (b.mats[i] ? D.MAT[b.mats[i]].hex : 'transparent') + '"></i>').join('') + '</span>';
    return '<div class="gb' + (b.done ? ' done' : '') + (b.works ? ' works' : '') + (b.pub ? ' public' : '') + (o.lit ? ' lit' : '') + '" data-k="' + esc(b.card) + '" style="--c:' + m.hex + ';--ci:' + m.ink + ';--s:' + s.hex + '">' +
      '<span class="gbn">' + esc(o.short ? (c.short || c.name) : c.name) + '</span>' + pips +
      (b.done ? '<span class="gbv">' + coins(s.value) + '</span>' : '') +
      (b.site !== c.mat ? '<span class="gbs">on ' + esc(s.name) + '</span>' : '') + (b.ot ? '<span class="gbs">out of town</span>' : '') +
      (b.pub ? '<span class="gbs">public</span>' : '') + (b.works ? '<span class="gbs">works (Gate)</span>' : '') + '</div>';
  }
  /* One site stack: in town, and out of town under it. */
  function site(m, s) {
    const x = D.MAT[m];
    return '<div class="gs" style="--c:' + x.hex + ';--ci:' + x.ink + '"><div class="gsn">' + esc(x.name) + '</div><div class="gsv">' + coins(x.value) + '</div>' +
      '<div class="gsi"><b>' + s.in + '</b> in town</div><div class="gso">' + s.out + ' out of town</div></div>';
  }

  function styles() {
    return '<style>' + `
.gi{flex:none;vertical-align:-.15em}
.gc{position:relative;border-radius:.7em;background:#fbf8f0;color:#1b1712;border:.12em solid #2b241b;overflow:hidden;display:flex;flex-direction:column;
  aspect-ratio:330/460;padding:.45em .55em .4em 1.25em;box-shadow:0 .2em .5em rgba(0,0,0,.35);text-align:left;font-size:13px;line-height:1.2}
.gc::before{content:"";position:absolute;left:0;top:0;bottom:0;width:.75em;background:var(--c,#111)}
.gc .gpic{position:absolute;inset:0;background:var(--pic) center/cover no-repeat;display:none;z-index:2}
html.art .gc .gpic{display:block}
.gc .grole{display:flex;align-items:center;gap:.25em;font-weight:900;font-size:.72em;letter-spacing:.08em;text-transform:uppercase;color:var(--c,#111)}
.gc .gname{font-weight:900;letter-spacing:.06em;text-transform:uppercase;font-size:1.05em;margin:.15em 0 .3em;line-height:1.05}
.gc .gtext{flex:1;font-size:.82em;color:#3a3127;overflow:hidden}
.gc .gfoot{display:flex;align-items:center;justify-content:space-between;gap:.3em;margin-top:.2em}
.gc .gmat{font-weight:900;letter-spacing:.1em;text-transform:uppercase;font-size:.78em;color:var(--c,#111)}
.gcoins{display:inline-flex;gap:.08em}
.gc .gset{position:absolute;right:.35em;top:.3em;font-size:.62em;font-weight:900;color:#fff;background:#2b241b;border-radius:.6em;padding:.05em .4em;z-index:3}
.gc .gtag{position:absolute;left:.3em;right:.3em;bottom:.3em;background:rgba(20,16,10,.88);color:#fff;font-weight:800;font-size:.75em;text-align:center;border-radius:.4em;padding:.15em;z-index:4}
.gc .gnote{position:absolute;left:0;right:0;top:0;background:#c9a84c;color:#1b1712;font-weight:900;font-size:.72em;text-align:center;padding:.1em;z-index:4}
.gc.tile{font-size:10px}
.gc.mini{font-size:8.5px;padding:.35em .35em .3em 1em}
.gc.mini .gtext{display:none}
html.art .gc.mini .gpic{display:none}
.gc.jack{background:#141414;color:#fff;align-items:center;justify-content:center;text-align:center;padding:.5em}
.gc.jack::before{display:none}
.gc.jack .gmark{margin:.4em 0}
.gc.jack .gtext{color:#ddd;flex:none}
.gc.back{background:#141414;color:#e9e1cc;align-items:center;justify-content:center;padding:.4em}
.gc.back::before{display:none}
.gc.dim{filter:grayscale(.7) brightness(.7)}
.gc.sel{outline:.25em solid #c9a84c;outline-offset:-.25em}
.gm{display:inline-flex;align-items:center;gap:.25em;background:var(--c);color:var(--ci);font-weight:800;border-radius:.45em;padding:.1em .45em;font-size:.85em;white-space:nowrap}
.gm b{font-weight:900}
.gm.big{font-size:1em;padding:.18em .55em}
.gcl{display:inline-flex;align-items:center;gap:.25em;background:var(--c);color:#fff;font-weight:800;border-radius:.45em;padding:.1em .45em;font-size:.85em;white-space:nowrap;text-shadow:0 0 .2em rgba(0,0,0,.5)}
.gcl.big{font-size:1em}
.gb{display:flex;align-items:center;flex-wrap:wrap;gap:.3em .45em;border-radius:.5em;background:#fbf8f0;color:#1b1712;border-left:.55em solid var(--c);padding:.2em .5em;font-size:.9em;
  background-image:repeating-linear-gradient(135deg,transparent 0 .6em,color-mix(in srgb,var(--s) 22%,transparent) .6em 1.1em)}
.gb.done{background-image:none;box-shadow:inset 0 0 0 .12em var(--s)}
.gb .gbn{font-weight:900;letter-spacing:.04em;text-transform:uppercase}
.gb .gbs{font-size:.78em;color:#5a4f40}
.gb.works{outline:.15em dashed #8c2a77}
.gb.public{outline:.15em solid #c9a84c}
.gb.lit{box-shadow:0 0 0 .2em #c9a84c}
.gpips{display:inline-flex;gap:.18em}
.gpips i{width:.75em;height:.75em;border-radius:.2em;border:.12em solid var(--s);display:inline-block}
.gs{border-radius:.5em;padding:.25em .4em;color:var(--ci);background:repeating-linear-gradient(135deg,var(--c) 0 .55em,color-mix(in srgb,var(--c) 70%,#fff) .55em 1.1em);text-align:center;font-weight:800;text-shadow:0 0 .25em rgba(0,0,0,.25)}
.gs .gsn{letter-spacing:.08em;text-transform:uppercase}
.gs .gsi b{font-size:1.25em}
.gs .gso{font-size:.8em;opacity:.9}
` + '</style>';
  }
  /* Switch the printed pictures on once one has really arrived. */
  function probe(dir) {
    if (dir) base = dir;
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    const img = new Image();
    img.onload = () => { if (img.naturalWidth > 0) document.documentElement.classList.add('art'); };
    img.src = url('school.webp');
  }

  const Art = { VERSION, ART_VER, esc, icon, card, mat, client, building, site, coins, styles, probe, url, roleHex, setBase: b => { base = b; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  else root.GtrArt = Art;
})(typeof window !== 'undefined' ? window : this);
