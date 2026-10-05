'use strict';
/* Lost Ruins of Arnak — the drawn bits, as SVG and HTML strings.
 *
 * Two layers. The DRAWN one (vector tokens, travel discs, idols, guardians
 * and card faces) is always in the markup and works on its own. The PICTURE
 * one is the publisher's art from the user's own VASSAL module, cut into
 * art/ by tools/cut-art.py (which picture is which: tools/art-map.js). The
 * page puts `art` on <html> once a probe picture has loaded (A.probe); only
 * then do the pictures show and the drawn bits they replace hide — so a
 * missing art folder, a test under jsdom, or a phone that cannot fetch it
 * still gets a whole, working game. The art is never load-bearing.
 *
 * Pictures are CSS backgrounds carried as `--pic` on the element, so the
 * markup is the same string whether they load or not (the privacy guard
 * compares markup). Both pages build their markup by assignment, so
 * everything is a string.
 *
 * Gradient ids are FIXED. A random id would make every repaint different,
 * and the telly's privacy guard — which repaints the page with every secret
 * rewritten and demands that not one character change — would then fail
 * every time and prove nothing.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./arnak-data.js') : root.ArnakData;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (s, body, vb, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="' + (vb || '0 0 24 24') + '" width="' + s + '" height="' + s + '" aria-hidden="true">' + body + '</svg>';

  /* ---------------- tokens ---------------- */

  const TOK = {
    coin: '<circle cx="12" cy="12" r="10" fill="url(#akCoin)" stroke="#6b4a08" stroke-width="1.2"/>' +
      '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#fff3b8" stroke-opacity=".55" stroke-width="1.1"/>' +
      '<path d="M12 7.6l1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4z" fill="#8a6012" opacity=".75"/>',
    compass: '<circle cx="12" cy="12" r="10" fill="url(#akComp)" stroke="#1f5e1c" stroke-width="1.2"/>' +
      '<circle cx="12" cy="12" r="6.8" fill="#dcefc8" stroke="#3f8a37" stroke-width="1"/>' +
      '<path d="M12 5.8l1.7 6.2L12 18.2l-1.7-6.2z" fill="#b8541a"/><path d="M5.8 12l6.2-1.7 6.2 1.7-6.2 1.7z" fill="#7a3a12" opacity=".7"/>',
    tablet: '<path d="M5 3.6h11.4l2.6 3.2V20.4H5z" fill="url(#akTab)" stroke="#7d6a57" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M7.6 7.4h2.4M11.4 7.4h3.6M7.6 10.6h3.8M12.8 10.6h3M7.6 13.8h2M11 13.8h4.4M7.6 17h4.8" stroke="#6c5a48" stroke-width="1.2" stroke-linecap="round"/>',
    arrowhead: '<path d="M12 2.2l6.4 10.4L13.6 21h-3.2L5.6 12.6z" fill="url(#akArrow)" stroke="#14306e" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M12 2.2v18.8M5.6 12.6l6.4 1.6 6.4-1.6" stroke="#bcd3ff" stroke-opacity=".6" stroke-width=".9" fill="none"/>',
    jewel: '<path d="M7 4h10l4 5.4L12 21 3 9.4z" fill="url(#akJewel)" stroke="#6a0c18" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M3 9.4h18M7 4l2.6 5.4L12 21l2.4-11.6L17 4M9.6 9.4L12 4l2.4 5.4" stroke="#ffc9cf" stroke-opacity=".55" stroke-width=".9" fill="none"/>',
    idol: '<path d="M12 2.6c2 0 3.4 1.6 3.4 3.5 0 1.3-.6 2.3-1.5 2.9l2.8 2.1-1 1.5-1.6-1v3.3l2.2 5.6H7.7l2.2-5.6v-3.3l-1.6 1-1-1.5L10.1 9C9.2 8.4 8.6 7.4 8.6 6.1c0-1.9 1.4-3.5 3.4-3.5z" fill="url(#akIdol)" stroke="#6b4a08" stroke-width="1"/>' +
      '<circle cx="10.8" cy="5.9" r=".8" fill="#6b4a08"/><circle cx="13.2" cy="5.9" r=".8" fill="#6b4a08"/>'
  };
  const TRAVEL = {
    boot: { bg: '#f2ede4', ink: '#5b3a22', d: '<path d="M8 4.5h4.2l.3 7.4 4.3 2.1c1.4.7 2.2 1.7 2.2 3.1V19H5.4v-2.4l1.4-1.1z" />' },
    car: { bg: '#f6c9a1', ink: '#4a2c1a', d: '<path d="M5 13.2l1.6-4.4h7.6l2.4 3.2 2.6.6c.9.2 1.4.9 1.4 1.8V16H3.4v-2.2z"/><circle cx="7.6" cy="16.6" r="2.2"/><circle cx="16.6" cy="16.6" r="2.2"/>' },
    ship: { bg: '#bfe5dc', ink: '#23413c', d: '<path d="M3.4 14h17.2l-2.8 4.6H6z"/><path d="M8 14V10.2h7.4V14zM10.8 10.2V6.6h1.8v3.6z"/>' },
    plane: { bg: '#bcd8f6', ink: '#27405e', d: '<path d="M3 10.6h8.4l1.4-4.6h1.8l-.6 4.6H20c.8 0 1.4.6 1.4 1.3S20.8 13.2 20 13.2h-5.9l.6 4.6h-1.8l-1.4-4.6H3z"/><path d="M2.6 8.4h1.8v7H2.6z"/>' }
  };


  /* ---------------- the pictures ---------------- */

  /* Bump after re-running tools/cut-art.py, or the telly and phones keep the
     old pictures. */
  const ART_VER = 1;
  const url = rel => 'art/' + rel + '?v=' + ART_VER;
  const pic = rel => ' style="--pic:url(' + url(rel) + ')"';
  /* Which picture a card is. */
  function cardPic(uid) {
    const p = String(uid).split(':');
    if (p[0] === 'art' || p[0] === 'item') return 'cards/' + p[1] + '.webp';
    if (p[0] === 'fear') return 'cards/fear.webp';
    if (p[0] === 'basic') return 'cards/' + p[2] + '.webp';
    return null;
  }

  /* Where things are on the board plate (art/board-<side>.webp), in the
     plate's own pixels: 1500 x 1567, cut from the module's board at
     tools/cut-art.py BOARD_CROP. Measured off gridded crops of both sides
     (2026-09-28). The island is the same on both sides; the research track
     is not. A site: `d` the dig spaces' centres, `i` where its idols lie
     (undiscovered), `t` the tile's rectangle (camp tiles are printed). A
     research square: its rectangle. */
  const PLATE = {
    w: 1500, h: 1567,
    sites: {
      c1: { t: [30, 1205, 195, 1400], d: [[73, 1418], [143, 1418]] },
      c2: { t: [225, 1175, 390, 1365], d: [[270, 1385], [345, 1385]] },
      c3: { t: [425, 1160, 590, 1335], d: [[465, 1355], [540, 1355]] },
      c4: { t: [620, 1170, 790, 1365], d: [[668, 1385], [740, 1385]] },
      c5: { t: [815, 1200, 980, 1400], d: [[855, 1418], [930, 1418]] },
      j1: { d: [[130, 717]], i: [128, 663] }, j2: { d: [[375, 690]], i: [373, 633] },
      j3: { d: [[612, 740]], i: [612, 685] }, j4: { d: [[880, 742]], i: [880, 690] },
      j5: { d: [[135, 1065]], i: [135, 1010] }, j6: { d: [[385, 995]], i: [380, 942] },
      j7: { d: [[628, 1050]], i: [628, 998] }, j8: { d: [[870, 1060]], i: [870, 1005] },
      h1: { d: [[135, 352]], i: [128, 295] }, h2: { d: [[375, 330]], i: [372, 268] },
      h3: { d: [[625, 290]], i: [628, 228] }, h4: { d: [[880, 355]], i: [872, 305] }
    },
    /* A discovered tile stands on its dig space, this wide. */
    tileW: 168,
    /* The discover plaques, for the "tiles left" counts beside them. */
    stacks: { 2: [630, 383], 1: [560, 1097] },
    temple: {
      t11: [1152, 15, 1273, 95], t6a: [1090, 110, 1213, 180], t6b: [1222, 110, 1343, 180],
      t2a: [1025, 195, 1148, 250], t2b: [1152, 195, 1276, 250], t2c: [1280, 195, 1403, 250],
      arrive: [[1095, 338], [1172, 338], [1250, 338], [1327, 338]]
    },
    tracks: {
      bird: {
        0: [1010, 1472, 1470, 1545], 1: [1005, 1305, 1225, 1425], 2: [1245, 1305, 1400, 1425],
        3: [1005, 1150, 1155, 1265], 4: [1170, 1150, 1400, 1265], 5: [1005, 990, 1405, 1105],
        6: [1010, 840, 1135, 950], 7: [1150, 840, 1275, 950], 8: [1290, 840, 1410, 950],
        9: [1010, 695, 1405, 795], 10: [1010, 553, 1170, 665], 11: [1190, 553, 1400, 665],
        12: [1010, 405, 1235, 520], 13: [1265, 405, 1400, 520]
      },
      snake: {
        0: [1010, 1472, 1470, 1545], 1: [1005, 1325, 1200, 1425], 2: [1215, 1325, 1400, 1425],
        3: [1005, 1170, 1130, 1280], 4: [1150, 1170, 1270, 1280], 5: [1285, 1170, 1405, 1280],
        6: [1005, 1025, 1195, 1130], 7: [1215, 1025, 1405, 1130], 8: [1005, 850, 1405, 980],
        9: [1005, 705, 1225, 815], 10: [1240, 705, 1385, 815], 11: [1010, 560, 1135, 670],
        12: [1160, 560, 1400, 670], 13: [1010, 405, 1400, 520]
      }
    },
    /* Snake: the stranded assistants' frame inside square 8. */
    rescue: [1125, 858, 1280, 980]
  };

  /* The rules both pages need for the pictures: shown only under html.art,
     and the drawn things they stand for hidden only then. */
  const STYLES = 'html:not(.art) .art-only{display:none !important}' +
    'html.art .vec{display:none !important}' +
    'html.art .pic,html.art .art-only{background-image:var(--pic);background-size:contain;background-position:center;background-repeat:no-repeat}' +
    'html.art svg.res>*{display:none}' +
    ['coin', 'compass', 'tablet', 'arrowhead', 'jewel', 'idol'].map(k => 'html.art svg.res-' + k + '{background:url(' + url('tokens/' + k + '.webp') + ') center/contain no-repeat}').join('') +
    '.cpic{display:block;aspect-ratio:330/461;border-radius:7px;flex:none}' +
    '.apic{display:inline-block;aspect-ratio:4/5;border-radius:5px;flex:none;vertical-align:middle}' +
    '.gpic{display:inline-block;aspect-ratio:1;flex:none;vertical-align:middle}' +
    '.tpic{display:inline-block;flex:none;vertical-align:middle}';

  const A = {
    VERSION: 2,
    ART_VER, PLATE, url, pic, cardPic,
    esc,

    /* The shared picture rules, once per page. */
    styles() { return '<style>' + STYLES + '</style>'; },

    /* Turn the pictures on once one of them has actually loaded. `done` is
       called then (the page repaints nothing: only a class changes). */
    probe(done) {
      if (typeof Image === 'undefined' || typeof document === 'undefined') return;
      const im = new Image();
      im.onload = () => { document.documentElement.classList.add('art'); if (done) done(); };
      im.src = url('tokens/coin.webp');
    },

    /* The shared gradients, once per page. */
    defs() {
      return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
        '<radialGradient id="akCoin" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff0a8"/><stop offset=".55" stop-color="#e8b923"/><stop offset="1" stop-color="#a87412"/></radialGradient>' +
        '<radialGradient id="akComp" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#b9e59a"/><stop offset="1" stop-color="#3e8f35"/></radialGradient>' +
        '<linearGradient id="akTab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eee2d2"/><stop offset="1" stop-color="#bba58c"/></linearGradient>' +
        '<linearGradient id="akArrow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fb4ff"/><stop offset=".5" stop-color="#3563d6"/><stop offset="1" stop-color="#1b3a8e"/></linearGradient>' +
        '<linearGradient id="akJewel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a95"/><stop offset=".5" stop-color="#d42b3e"/><stop offset="1" stop-color="#7c0f1f"/></linearGradient>' +
        '<linearGradient id="akIdol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe089"/><stop offset="1" stop-color="#b98318"/></linearGradient>' +
        '<linearGradient id="akVp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a86ae0"/><stop offset="1" stop-color="#5d2a93"/></linearGradient>' +
        '<linearGradient id="akFear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a5e"/><stop offset="1" stop-color="#150d26"/></linearGradient>' +
        '<linearGradient id="akSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3f7"/><stop offset="1" stop-color="#9aa3b2"/></linearGradient>' +
        '<linearGradient id="akGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset="1" stop-color="#c8911d"/></linearGradient>' +
        '</defs></svg>';
    },

    /* A resource token (or an idol). */
    res(k, size) { return TOK[k] ? svg(size || 18, TOK[k], null, 'res res-' + k) : ''; },

    /* A travel disc. */
    travel(k, size) {
      const t = TRAVEL[k];
      if (!t) return '';
      return svg(size || 18, '<circle cx="12" cy="12" r="11" fill="' + t.bg + '" stroke="' + t.ink + '" stroke-width="1.2"/>' +
        '<g fill="' + t.ink + '" transform="translate(1.6 1.2) scale(.87)">' + t.d + '</g>', null, 'tr tr-' + k);
    },
    travels(list, size) { return (list || []).map(k => A.travel(k, size)).join(''); },

    /* Points, in the purple hexagon every tile and card uses. */
    vp(n, size) {
      const s = size || 20;
      return svg(s, '<path d="M12 1.6l9 5.2v10.4l-9 5.2-9-5.2V6.8z" fill="url(#akVp)" stroke="#3a1463" stroke-width="1"/>' +
        '<text x="12" y="16.2" text-anchor="middle" font-size="' + (String(n).length > 1 ? 9.6 : 11.5) + '" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">' + esc(n) + '</text>', null, 'vp');
    },

    /* Small symbols used in effects. */
    icon(name, size) {
      const s = size || 18;
      switch (name) {
        case 'draw': return svg(s, '<rect x="5" y="3" width="14" height="18" rx="2.2" fill="#a9463b" stroke="#5a1f19"/><path d="M12 8v8M8 12h8" stroke="#8dff84" stroke-width="2.6" stroke-linecap="round"/>');
        case 'drawBottom': return svg(s, '<rect x="5" y="3" width="14" height="18" rx="2.2" fill="#a9463b" stroke="#5a1f19"/><path d="M12 7v8M8.4 11.6L12 15.2l3.6-3.6" stroke="#8dff84" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
        case 'exile': return svg(s, '<rect x="5" y="3" width="14" height="18" rx="2.2" fill="#c98a7e" stroke="#5a1f19"/><path d="M8 8l8 8M16 8l-8 8" stroke="#4a0f0b" stroke-width="4.2" stroke-linecap="round"/><path d="M8 8l8 8M16 8l-8 8" stroke="#ff3b30" stroke-width="2.4" stroke-linecap="round"/>');
        case 'useCard': return svg(s, '<rect x="4" y="3" width="13" height="18" rx="2.2" fill="#b3574b" stroke="#5a1f19"/><path d="M9 7c5 .5 8 3 8.4 8.4" stroke="#ffc740" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M14.4 13.6l3 2.6 2.4-3.2" stroke="#ffc740" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
        case 'upgrade': return svg(s, '<path d="M4 19L18 5M18 5h-6.4M18 5v6.4" stroke="#8a5a2b" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<rect x="3" y="15.6" width="4.6" height="5.4" rx=".8" fill="#d8c8b4"/><path d="M9.6 10.4l2 3.2-2 3.2-2-3.2z" fill="#3563d6"/><path d="M14.2 4.6h3.4l1.4 1.8-3.1 4-3.1-4z" fill="#d42b3e"/>');
        case 'refresh': return svg(s, '<path d="M18.4 9.2A7 7 0 1 0 19 14" stroke="#8a5a2b" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M19.4 4.8v5h-5" stroke="#8a5a2b" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
        case 'fear': return svg(s, '<rect x="4" y="3" width="16" height="18" rx="2.4" fill="url(#akFear)" stroke="#0b0614"/><path d="M7 11.4c1.6-1.2 3-1.2 3.8 0-1 1.2-2.4 1.4-3.8 0zM13.2 11.4c.8-1.2 2.2-1.2 3.8 0-1.4 1.4-2.8 1.2-3.8 0z" fill="#ff9d1c"/>');
        case 'bolt': return svg(s, '<path d="M13.4 2L5.6 13.2h5.2L9.6 22l8.2-11.6h-5.4z" fill="#7a4a24"/>');
        case 'guardian': return svg(s, '<path d="M12 2.4c4.6 0 8.2 3.2 8.2 8 0 5.2-3.6 9.4-8.2 11.2C7.4 19.8 3.8 15.6 3.8 10.4c0-4.8 3.6-8 8.2-8z" fill="#d9a441" stroke="#6b3f10" stroke-width="1.1"/>' +
          '<path d="M7.6 9.4l2.6 1.2M16.4 9.4l-2.6 1.2" stroke="#3a1d06" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.4" cy="11.6" r="1.1" fill="#b60f0f"/><circle cx="14.6" cy="11.6" r="1.1" fill="#b60f0f"/>' +
          '<path d="M8.6 15.4l1.4 2.4 1-1.6 1 1.6 1-1.6 1 1.6 1.4-2.4" stroke="#fff4dc" stroke-width="1.1" fill="none" stroke-linejoin="round"/>');
        case 'overcome': return svg(s, '<path d="M12 2.4c4.6 0 8.2 3.2 8.2 8 0 5.2-3.6 9.4-8.2 11.2C7.4 19.8 3.8 15.6 3.8 10.4c0-4.8 3.6-8 8.2-8z" fill="#d9a441" stroke="#6b3f10" stroke-width="1.1"/>' +
          '<path d="M7 12.4l3.4 3.6L17.6 7" stroke="#2cc74a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
        case 'meeple': return A.meeple('#b98a4a', s);
        case 'dig': return A.meeple('#b98a4a', s);
        case 'glass': return A.glass('#caa15b', s);
        case 'book': return A.book('#caa15b', s);
        case 'camp': return svg(s, '<rect x="2" y="3" width="20" height="18" rx="3" fill="#ece3d2" stroke="#8d7c63"/><path d="M5 18L12 6l7 12zM12 6v12" stroke="#4d3c26" stroke-width="1.8" fill="#6d5a40" stroke-linejoin="round"/>');
        case 'level1': return svg(s, '<rect x="2" y="3" width="20" height="18" rx="3" fill="#ece3d2" stroke="#8d7c63"/><path d="M10 6h4v3h-1v6h1v3h-4v-3h1V9h-1z" fill="#4d3c26"/>');
        case 'level2': return svg(s, '<rect x="2" y="3" width="20" height="18" rx="3" fill="#ece3d2" stroke="#8d7c63"/><path d="M6 6h4v3H9v6h1v3H6v-3h1V9H6zM14 6h4v3h-1v6h1v3h-4v-3h1V9h-1z" fill="#4d3c26"/>');
        case 'item': return svg(s, '<rect x="4" y="3" width="16" height="18" rx="2.2" fill="#e8d1a8" stroke="#7a5a2c"/><path d="M8 15.6l6.6-6.6 1.6 1.6-6.6 6.6zM14.6 9l1.6-3.2 2 2L15 9.8" fill="#8a5a2b"/>');
        case 'art': return svg(s, '<rect x="4" y="3" width="16" height="18" rx="2.2" fill="#a9c1ea" stroke="#2c4d86"/><path d="M9 7h6l-1 2.4c1.6.8 2.4 2.4 2.4 4.2 0 2.8-2 4.4-4.4 4.4S7.6 16.4 7.6 13.6c0-1.8.8-3.4 2.4-4.2z" fill="#2f57a8"/>');
        case 'free': return svg(s, '<circle cx="12" cy="12" r="9.4" fill="none" stroke="#2cc74a" stroke-width="2"/><path d="M7.4 16.6L16.6 7.4" stroke="#e5484d" stroke-width="2.6" stroke-linecap="round"/>');
        case 'assistant': return A.assistant(null, false, s);
        case 'pass': return svg(s, '<path d="M5 12h12M13 7l5 5-5 5" stroke="#9aa7c4" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
        case 'moon': return svg(s, '<circle cx="12" cy="12" r="9" fill="#f4ecd0" stroke="#8d7c63"/>');
        case 'temple': return svg(s, '<path d="M3 20h18M5 20V10h14v10M3 10l9-6 9 6z" stroke="#6d5a40" stroke-width="1.8" fill="#e6d4a8" stroke-linejoin="round"/><path d="M9 20v-6h6v6" fill="#6d5a40"/>');
      }
      return '';
    },

    /* An archaeologist, a magnifying glass, a notebook — in a seat's colour. */
    meeple(hex, size) {
      return svg(size || 18, '<path d="M12 2.4c1.8 0 3.1 1.3 3.1 3 0 1-.5 1.9-1.3 2.4l4.4 2.4-1.2 2.4-2.6-1v3.2l2 6.4h-3.6L12 16l-.8 4.8H7.6l2-6.4v-3.2L7 12.2l-1.2-2.4 4.4-2.4c-.8-.5-1.3-1.4-1.3-2.4 0-1.7 1.3-3 3.1-3z" fill="' + esc(hex) + '" stroke="rgba(0,0,0,.55)" stroke-width="1"/>' +
        '<path d="M7.6 4.4h8.8" stroke="rgba(0,0,0,.55)" stroke-width="1.4" stroke-linecap="round"/>', null, 'meeple');
    },
    glass(hex, size) {
      return svg(size || 18, '<circle cx="10" cy="10" r="6.4" fill="rgba(255,255,255,.35)" stroke="' + esc(hex) + '" stroke-width="3"/><path d="M14.6 14.6l6 6" stroke="' + esc(hex) + '" stroke-width="3.6" stroke-linecap="round"/>' +
        '<circle cx="10" cy="10" r="8" fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".8"/>', null, 'glass');
    },
    book(hex, size) {
      return svg(size || 18, '<rect x="4.6" y="3" width="14.8" height="18" rx="2" fill="' + esc(hex) + '" stroke="rgba(0,0,0,.55)" stroke-width="1"/>' +
        '<path d="M8 3v18" stroke="rgba(0,0,0,.4)" stroke-width="1.4"/><path d="M11 8h6M11 11h6" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/>', null, 'book');
    },

    /* A guardian token: its cost along the bottom, its boon up top. */
    guardian(gid, opts) {
      const gd = D.GUARD[gid];
      if (!gd) return '';
      opts = opts || {};
      const z = opts.size || 16;
      const boon = gd.boon.travel ? A.travels(gd.boon.travel, z) : A.fx(gd.boon.fx, z, true);
      const head = opts.small ? Math.round(z * 1.25) : Math.round(z * 1.6);
      return '<span class="guard' + (opts.used ? ' used' : '') + (opts.small ? ' small' : '') + '" title="' + esc(gd.name) + '">' +
        '<span class="vec">' + A.icon('guardian', head) + '</span>' +
        '<i class="gpic art-only" style="--pic:url(' + url('guardians/' + gid + '.webp') + ');width:' + Math.round(head * (opts.small ? 1.3 : 1.9)) + 'px"></i>' +
        (opts.small ? '' : '<span class="gname">' + esc(gd.name) + '</span>') +
        (opts.cost === false ? '' : '<span class="gcost">' + A.guardCost(gid, z) + '</span>') +
        '<span class="gboon">' + (gd.boon.fx ? A.icon('bolt', Math.round(z * 0.75)) : '') + boon + '</span></span>';
    },
    guardCost(gid, size) {
      const c = D.GUARD[gid].cost;
      let out = '';
      if (c.useCard) out += A.icon('useCard', size);
      if (c.travel) out += A.travels(c.travel, size);
      for (const k of D.RES) if (c[k]) for (let i = 0; i < c[k]; i++) out += A.res(k, size);
      return out;
    },

    /* An assistant: a bust on silver or gold, its effect beside it. */
    assistant(id, gold, size, opts) {
      const s = size || 22;
      opts = opts || {};
      const face = svg(s, '<rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="url(#' + (gold ? 'akGold' : 'akSilver') + ')" stroke="' + (gold ? '#7a520c' : '#5c6472') + '"/>' +
        '<circle cx="12" cy="9.4" r="3.8" fill="#6b5037"/><path d="M5 21c.6-4.4 3.4-6.8 7-6.8s6.4 2.4 7 6.8z" fill="#6b5037"/>', null, 'asst' + (opts.tired ? ' tired' : ''));
      if (!id) return face;
      const d = D.ASST[id];
      /* The printed assistant, its silver or gold side: portrait and effect. */
      const w = Math.round(s * (opts.big ? 2.6 : 1.5));
      return '<span class="asstw' + (opts.tired ? ' tired' : '') + '"><span class="vec">' + face + '</span>' +
        '<i class="apic art-only" style="--pic:url(' + url('asst/' + id + '-' + (gold ? 'gold' : 'silver') + '.webp') + ');width:' + w + 'px"></i>' +
        (opts.name === false ? '' : '<span class="aname">' + esc(d.name) + '</span>') +
        (opts.fx === false ? '' : '<span class="afx">' + (d.main ? '' : A.icon('bolt', 11)) + A.fx((gold ? d.gold : d.silver).fx, 14, true) + '</span>') + '</span>';
    },

    /* A cost in resources, as tokens. */
    cost(c, size) {
      let out = '';
      for (const k of D.RES) if (c && c[k]) out += c[k] > 3 ? '<b class="n">' + c[k] + '</b>' + A.res(k, size) : Array(c[k] + 1).join(A.res(k, size));
      if (c && c.idol) out += A.res('idol', size);
      return out;
    },

    /* An effect as icons. Returns '' for anything that needs words; the
       caller then shows the card's text. `lenient` draws what it can. */
    fx(list, size, lenient) {
      const s = size || 18;
      const parts = [];
      for (const st of (list || [])) {
        let p = null;
        if (st.g) p = A.cost(st.g, s);
        else if (st.fear) p = A.icon('fear', s);
        else if (st.draw) p = Array(st.draw + 1).join(A.icon('draw', s));
        else if (st.drawBottom) p = A.icon('drawBottom', s);
        else if (st.exile) p = A.icon('exile', s);
        else if (st.upgrade) p = A.icon('upgrade', s);
        else if (st.refresh) p = Array(st.refresh + 1).join(A.icon('refresh', s));
        else if (st.travel) p = A.travels(st.travel, s);
        else if (st.pay) { const t = A.fx(st.then, s, lenient); p = t ? A.cost(st.pay, s) + '<span class="to">▸</span>' + t : null; }
        else if (st.useCard) { const t = st.then ? A.fx(st.then, s, lenient) : ''; p = A.icon('useCard', s) + (t ? '<span class="to">▸</span>' + t : ''); }
        else if (st.travelPay) { const t = A.fx(st.then, s, lenient); p = t ? A.travels(st.travelPay, s) + '<span class="to">▸</span>' + t : null; }
        else if (st.gain) p = A.icon(st.gain.type === 'art' ? 'art' : 'item', s) + A.icon('free', s * 0.8);
        else if (st.overcome) p = A.icon('overcome', s);
        else if (st.choose) {
          const opts = st.choose.map(c => (c.pay ? A.cost(c.pay, s) + '<span class="to">▸</span>' : '') + A.fx(c.fx, s, lenient));
          p = opts.every(Boolean) ? opts.join('<span class="or">/</span>') : null;
        } else if (lenient) {
          if (st.dig) p = A.icon('dig', s);
          else if (st.buy) p = A.icon(st.buy.type === 'art' ? 'art' : 'item', s);
          else if (st.research) p = A.icon('glass', s);
        }
        if (p == null) return lenient ? parts.join('') : '';
        parts.push(p);
      }
      return parts.join('');
    },

    /* A card face. `mode`: 'full' (name, icons and words), 'row' (for the
       card row on the telly), 'chip' (one line). */
    card(uid, mode, extra) {
      const c = D.card(uid);
      if (!c) return '';
      mode = mode || 'full';
      extra = extra || {};
      const kind = c.kind;
      const tr = A.travels(c.travel, mode === 'chip' ? 14 : 18);
      const free = c.free || (c.opts && c.opts.some(o => o.free));
      const icons = c.opts
        ? c.opts.map(o => (o.pass ? '<span class="passw">pass</span>' : (o.free ? A.icon('bolt', 13) : '')) + A.fx(o.fx, mode === 'chip' ? 14 : 18)).join('<span class="or">/</span>')
        : (c.fx ? (free ? A.icon('bolt', 13) : '') + A.fx(c.fx, mode === 'chip' ? 14 : 18) : '');
      const hasIcons = c.opts ? c.opts.every(o => A.fx(o.fx)) : !!(c.fx && A.fx(c.fx));
      const price = (kind === 'art' || kind === 'item') && !extra.noPrice ? '<span class="price">' + (extra.cost != null ? extra.cost : c.cost) +
        A.res(kind === 'art' ? 'compass' : 'coin', mode === 'chip' ? 13 : 16) + '</span>' : '';
      const vp = c.vp ? A.vp(c.vp, mode === 'chip' ? 16 : 20) : '';
      if (mode === 'chip') {
        return '<span class="cchip k-' + kind + '">' + '<span class="ctr">' + tr + '</span><span class="cnm">' + esc(c.name) + '</span>' +
          (hasIcons ? '<span class="cfx">' + icons + '</span>' : '') + (c.vp ? '<span class="cvp">' + vp + '</span>' : '') + '</span>';
      }
      const words = (mode === 'full' || !hasIcons) ? '<div class="ctext">' + (c.kind === 'art' ? '<span class="tabcost">' + A.res('tablet', 13) + '▸</span> ' : '') + esc(c.text) + '</div>' : '';
      const face = cardPic(uid);
      /* The telly's row: with the pictures on, the printed card IS the face
         (cost, points, travel and effect are all on it); the drawn face is
         underneath for when they are not. */
      if (mode === 'row') {
        return '<div class="acard k-' + kind + (face ? ' pic' : '') + (extra.cls ? ' ' + extra.cls : '') + '"' + (face ? pic(face) : '') + (extra.attr || '') + '>' +
          '<div class="vec cbody"><div class="chead"><span class="ctr">' + tr + '</span><span class="cnm">' + esc(c.name) + '</span></div>' +
          (hasIcons ? '<div class="cfx">' + icons + '</div>' : '') + words +
          '<div class="cfoot">' + price + '<span class="sp"></span>' + vp + '</div></div></div>';
      }
      /* A card in the hand: the printed card beside the words (tap it to see
         it large), the price for you under them. */
      return '<div class="acard k-' + kind + (extra.cls ? ' ' + extra.cls : '') + '"' + (extra.attr || '') + '>' +
        (face ? '<i class="cpic art-only" data-zoom="' + esc(face) + '"' + pic(face) + '></i>' : '') +
        '<div class="chead"><span class="ctr vec">' + tr + '</span><span class="cnm">' + esc(c.name) + '</span></div>' +
        (hasIcons ? '<div class="cfx vec">' + icons + '</div>' : '') + words +
        '<div class="cfoot">' + price + '<span class="sp"></span><span class="vec">' + vp + '</span></div></div>';
    },

    /* A site tile's face: its name and what it gives. */
    siteFace(tile, size) {
      const d = D.site(tile);
      if (!d) return '';
      const icons = A.fx(d.fx, size || 18);
      return '<span class="sname">' + esc(d.name) + '</span><span class="sfx">' + (icons || esc(d.text || '')) + '</span>';
    },

    /* An idol's discovery gift, or a research bonus tile. */
    reward(r, size) {
      if (r == null) return '<span class="idol back">' + A.res('idol', size || 18) + '</span>';
      return A.fx(D.REWARD[r].fx, size || 18, true);
    },
    idolTile(r, size) {
      const s = size || 20;
      return '<span class="idolt' + (r == null ? ' back' : '') + '"><span class="vec">' + A.res('idol', s) + (r == null ? '' : '<span class="ig">' + A.reward(r, Math.round(s * 0.8)) + '</span>') + '</span>' +
        '<i class="tpic art-only" style="--pic:url(' + url(r == null ? 'tokens/idol.webp' : 'idols/' + r + '.webp') + ');width:' + Math.round(s * 1.25) + 'px;height:' + Math.round(s * 1.5) + 'px"></i></span>';
    },
    bonusTile(r, size) {
      const s = size || 16;
      return '<span class="bonust"><span class="vec">' + A.reward(r, s) + '</span>' +
        '<i class="tpic art-only" style="--pic:url(' + url('bonus/' + r + '.webp') + ');width:' + Math.round(s * 1.5) + 'px;height:' + Math.round(s * 1.5) + 'px;border-radius:4px"></i></span>';
    },
    /* A discovered site's printed tile, with the drawn face for when there
       is no picture. */
    siteTile(tile) {
      return '<span class="stile"><i class="spic art-only"' + pic('sites/' + tile + '.webp') + '></i>' +
        '<span class="vec sface">' + A.siteFace(tile) + '</span></span>';
    },

    /* Words for things, shared by both pages. */
    resWords(c) {
      const out = [];
      for (const k of D.RES) if (c && c[k]) out.push(c[k] + ' ' + (c[k] === 1 ? D.RES_NAME[k] : D.RES_PLURAL[k]));
      if (c && c.idol) out.push('an idol');
      return out.join(', ') || 'nothing';
    },
    travelWords(list) {
      if (!list || !list.length) return 'no travel';
      const cnt = {};
      for (const k of list) cnt[k] = (cnt[k] || 0) + 1;
      return Object.keys(cnt).map(k => cnt[k] + ' ' + k + (cnt[k] > 1 ? 's' : '')).join(' + ');
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else root.ArnakArt = A;
})(typeof window !== 'undefined' ? window : this);
