'use strict';
/* A Gest of Robin Hood — what things look like: the board, the cards, the
 * dice, the icons.
 *
 * The board is one SVG in board pixels (2062 x 2676, rh-data.js BOARD): the
 * module's map picture (art/board.webp) underneath, and everything that
 * matters drawn over it — each Parish tinted by its state, its marker, the
 * pieces, the Carriages, the Bridge, the Camp on Ollerton Hill. The picture
 * is NEVER load-bearing (LESSONS-CHECKLIST E): without it the spaces are
 * drawn as plain outlines and the game reads the same. It is a layer shown
 * only once A.probe() has seen it load (class `rh-art` on <html>), so jsdom
 * tests and a missing folder get the drawn board and the privacy guard's
 * markup never changes.
 *
 * Two things only one seat may see are drawn ONLY when that seat's own
 * secrets are passed in: `robinAt` (Robin Hood's phone) and `cars`
 * (the Sheriff's phone). The telly never passes either.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./rh-data.js') : root.RhData;
  const VERSION = 1;
  /* One version for the art and every script tag (E: "one cache version"). */
  const ART_VER = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const K = id => String(id).split('.')[0];

  /* The spaces' outlines in board pixels, from the module's zones. */
  const OUTLINE = {
    blyth: '1152,269 1078,321 990,352 979,398 1023,460 1156,498 1174,571 1132,619 1152,679 1216,847 1115,878 1026,962 1052,991 1001,1046 1017,1130 1059,1145 1040,1166 975,1170 930,1196 910,1156 905,1115 798,1070 766,1035 667,996 569,992 603,857 706,787 727,697 804,644 815,594 775,541 805,485 750,444 797,369 771,321 969,157 1008,165 1056,236 1057,274',
    retford: '1179,490 1026,445 1004,372 1206,267 1214,236 1287,198 1384,225 1466,481 1523,525 1511,599 1478,684 1497,718 1494,751 1394,668 1289,670 1203,679 1169,659 1156,641 1189,584',
    shirewood: '585,1010 642,1025 755,1048 776,1084 887,1123 919,1193 884,1234 903,1275 936,1293 894,1333 890,1361 824,1402 769,1396 697,1409 641,1446 619,1389 615,1242 646,1225 646,1163 582,1119',
    southwell: '1054,1686 1121,1671 1183,1578 1207,1535 1271,1484 1180,1420 1195,1397 1149,1373 1156,1323 1111,1281 1077,1304 1042,1287 963,1294 933,1319 907,1384 854,1411 909,1450 973,1574 961,1661 918,1738 960,1754 1025,1728',
    mansfield: '613,1409 630,1452 589,1520 574,1600 597,1689 642,1748 691,1776 660,1811 612,1815 516,1862 476,1876 474,1827 448,1801 463,1751 407,1711 378,1565 322,1477 390,1355 424,1295 402,1257 349,1223 381,1183 460,1161 513,1163 549,1142 580,1143 628,1173 616,1216 598,1241 593,1393',
    remston: '545,1876 605,1842 658,1839 705,1804 859,1794 892,1833 940,1861 933,1888 974,1925 995,1931 1026,2013 1062,2014 1087,2044 1122,2052 1151,2092 1157,2132 1110,2156 1079,2178 1031,2174 1015,2191 984,2207 943,2193 882,2207 844,2188 803,2204 758,2203 694,2222 642,2182 601,2183 573,2154 532,2144 553,1928',
    nottingham: '774,1416 852,1438 924,1503 947,1583 944,1659 905,1722 831,1766 739,1769 675,1735 609,1649 607,1556 633,1493 688,1439',
    tuxford: '1169,701 1241,694 1297,682 1332,693 1368,696 1417,701 1423,731 1460,738 1488,771 1500,836 1487,857 1487,895 1477,937 1507,963 1475,979 1454,1022 1418,1065 1435,1088 1448,1148 1430,1180 1436,1213 1388,1305 1358,1332 1356,1372 1319,1409 1305,1472 1290,1480 1259,1458 1249,1443 1206,1417 1216,1389 1196,1372 1178,1369 1181,1346 1172,1315 1158,1289 1166,1242 1145,1209 1120,1202 1107,1177 1071,1174 1069,1129 1035,1119 1016,1047 1079,999 1061,950 1131,893 1167,888 1204,876 1226,851 1207,792 1179,754',
    newark: '1521,751 1575,764 1670,812 1738,839 1714,872 1728,963 1646,1008 1637,1116 1629,1203 1635,1277 1611,1329 1618,1420 1530,1494 1512,1584 1534,1683 1564,1760 1451,1733 1320,1693 1265,1620 1211,1586 1279,1502 1343,1438 1373,1374 1403,1325 1454,1171 1451,1102 1443,1065 1497,936 1508,853 1506,789',
    bingham: '926,1769 982,1770 1033,1745 1059,1712 1140,1679 1190,1611 1234,1607 1246,1646 1270,1644 1288,1686 1323,1716 1416,1736 1446,1743 1461,1783 1492,1798 1470,1845 1454,1871 1398,1891 1390,1926 1392,1969 1366,1984 1286,2012 1260,2051 1262,2082 1241,2105 1182,2122 1130,2039 1097,2030 1079,2005 1042,1998 1014,1960 1008,1918 975,1906 950,1882 964,1856 920,1835 875,1780 912,1754',
    ollerton: '967,1179 1045,1171 1059,1191 1089,1182 1107,1215 1145,1221 1159,1251 1142,1269 1108,1268 1073,1284 1046,1276 1007,1278 949,1286 912,1259 904,1235 918,1207 959,1203'
  };
  const COL = { robin: '#3f9d4a', robinHi: '#7fd36b', sheriff: '#5b8fd6', gold: '#e8c25a', sub: '#5b8fd6', rev: '#4caf50', pas: '#a59b86' };

  /* ---------------- icons (SVG, no emoji) ---------------- */
  const PATHS = {
    coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.6"/><path d="M12 8.5v7M9.5 12h5" stroke="#000" stroke-opacity=".35" stroke-width="1.6"/>',
    crown: '<path d="M3 18h18l1-11-5.5 4.5L12 4 7.5 11.5 2 7z"/><rect x="3" y="19.2" width="18" height="2.3" rx=".8"/>',
    man: '<path d="M12 2l7 4v12l-7 4-7-4V6z"/>',
    hidden: '<path d="M12 2l7 4v12l-7 4-7-4V6z" fill-opacity=".35" stroke="currentColor" stroke-width="2"/>',
    hench: '<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.4"/>',
    camp: '<ellipse cx="12" cy="13" rx="10" ry="7"/><path d="M8 15c2-4 3-6 4-8 1 2 2 4 4 8" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6"/>',
    cart: '<path d="M2 7h15v7H2zM17 9h3l2 3v2h-5z"/><circle cx="6" cy="17" r="2.4"/><circle cx="17" cy="17" r="2.4"/>',
    prison: '<rect x="3" y="3" width="18" height="18" rx="2" fill-opacity=".25"/><path d="M7 3v18M12 3v18M17 3v18" stroke="currentColor" stroke-width="2.2"/>',
    card: '<rect x="5" y="2.5" width="14" height="19" rx="2.2"/><path d="M8 7h8M8 11h8M8 15h5" stroke="#000" stroke-opacity=".35" stroke-width="1.6"/>',
    bow: '<path d="M5 3c9 3 13 9 16 18" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 3l16 18" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/><path d="M3 13l10-1 2 2-1 3z"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z"/>',
    road: '<path d="M8 2h3l-1 20H6zM13 2h3l2 20h-4z"/>'
  };
  function icon(k, size, fill) {
    return '<svg class="ri" width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="' + (fill || 'currentColor') + '" aria-hidden="true">' + (PATHS[k] || '') + '</svg>';
  }

  /* ================================================================
     The board
     ================================================================ */
  const ptsOf = s => s.split(' ').map(p => p.split(',').map(Number));
  const STATE_WORD = { sub: 'SUBMISSIVE', rev: 'REVOLTING', pas: 'PASSIVE' };
  function board(pub, o) {
    o = o || {};
    const W = D.BOARD.w, H = D.BOARD.h;
    const light = new Set(o.light || []);
    const carKind = {};
    for (const c of o.cars || []) carKind[c.id] = c.kind;
    /* `fit`: zoom to these spaces (the phone's pick map), at least ~900
       board pixels a side so the neighbours stay in view. */
    let vb = '0 0 ' + W + ' ' + H;
    if (o.fit && o.fit.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const id of o.fit) for (const [x, y] of ptsOf(OUTLINE[id] || '')) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (x1 > x0) {
        const pad = 90, min = 900;
        let w = Math.max(min, x1 - x0 + 2 * pad), h = Math.max(min, y1 - y0 + 2 * pad);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const bx = Math.max(0, Math.min(W - w, cx - w / 2)), by = Math.max(0, Math.min(H - h, cy - h / 2));
        vb = Math.round(bx) + ' ' + Math.round(by) + ' ' + Math.round(Math.min(w, W)) + ' ' + Math.round(Math.min(h, H));
      }
    }
    let s = '<svg class="rboard" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect class="rb-bg" width="' + W + '" height="' + H + '"/>';
    s += '<image class="rb-img" href="art/board.webp?v=' + ART_VER + '" width="' + W + '" height="' + H + '"/>';
    /* outlines (the vector board) and the state tint (always) */
    for (const id of D.IDS) {
      const st = pub && pub.spaces[id] ? pub.spaces[id].state : null;
      const sp = D.SPACES[id];
      s += '<polygon class="rb-sp rb-' + sp.kind + (st ? ' st-' + st : '') + '" points="' + OUTLINE[id] + '"/>';
    }
    /* the rivers that are not bridged, and the bridges */
    const mid = (a, b) => [(D.SPACES[a].p[0] + D.SPACES[b].p[0]) / 2, (D.SPACES[a].p[1] + D.SPACES[b].p[1]) / 2];
    if (pub && pub.bridge) { const [x, y] = mid(pub.bridge[0], pub.bridge[1]); s += '<g class="rb-bridge"><rect x="' + (x - 70) + '" y="' + (y - 26) + '" width="140" height="52" rx="14"/><text x="' + x + '" y="' + (y + 16) + '">BRIDGE</text></g>'; }
    /* names (the vector board only: the picture prints its own) */
    for (const id of D.IDS) {
      const sp = D.SPACES[id];
      const at = sp.m || [sp.p[0], sp.p[1] - 150];
      if (id === 'ollerton') { s += '<text class="rb-name" x="' + sp.p[0] + '" y="' + (sp.p[1] - 20) + '">Ollerton Hill</text>'; continue; }
      if (id === 'nottingham') { s += '<text class="rb-name" x="' + sp.p[0] + '" y="' + (sp.p[1] + 150) + '">Nottingham</text>'; continue; }
      s += '<text class="rb-name" x="' + at[0] + '" y="' + (at[1] + (sp.m ? 120 : 0)) + '">' + esc(sp.short || sp.name) + '</text>';
    }
    if (!pub) return s + '</svg>';
    /* the Parish markers */
    for (const id of D.PARISHES) {
      const st = pub.spaces[id].state, m = D.SPACES[id].m;
      s += '<g class="rb-mark st-' + st + '"><rect x="' + (m[0] - 110) + '" y="' + (m[1] - 52) + '" width="220" height="104" rx="18"/><text x="' + m[0] + '" y="' + (m[1] + 17) + '">' + STATE_WORD[st] + '</text></g>';
    }
    /* light */
    for (const id of light) if (OUTLINE[id]) s += '<polygon class="rb-light" points="' + OUTLINE[id] + '"/>';
    /* pieces: a short grid of counters at each space's anchor */
    for (const id of D.IDS) {
      const v = pub.spaces[id];
      const items = [];
      if (v.h) items.push({ k: 'hench', n: v.h, c: COL.sheriff, cls: 'h' });
      if (v.robin) items.push({ k: 'star', n: 0, c: COL.gold, cls: 'robin', label: 'RH' });
      if (v.rev) items.push({ k: 'man', n: v.rev, c: COL.robinHi, cls: 'rv' });
      if (v.hidden) items.push({ k: 'hidden', n: v.hidden, c: COL.robin, cls: 'hd', mine: o.robinAt === id });
      if (v.camps) items.push({ k: 'camp', n: v.camps, c: '#2f7d3a', cls: 'cp' });
      for (const c of v.cars) items.push({ k: 'cart', n: 0, c: '#c9a24c', cls: 'car', label: c.kind ? D.CARRIAGES[c.kind].name.slice(0, 3).toUpperCase() : carKind[c.id] ? D.CARRIAGES[carKind[c.id]].name.slice(0, 3).toLowerCase() : '?', secret: !c.kind && !!carKind[c.id] });
      if (!items.length) continue;
      const [cx, cy] = D.SPACES[id].p;
      const per = 3, cw = 134, ch = 128;
      const rows = Math.ceil(items.length / per);
      items.forEach((it, k) => {
        const r = Math.floor(k / per), col = k % per, inRow = Math.min(per, items.length - r * per);
        const x = cx + (col - (inRow - 1) / 2) * cw, y = cy + (r - (rows - 1) / 2) * ch;
        s += '<g class="rb-pc ' + it.cls + (it.mine ? ' mine' : '') + (it.secret ? ' secret' : '') + '" transform="translate(' + x + ',' + y + ')">' +
          '<circle r="62"/><svg x="-44" y="-50" width="88" height="88" viewBox="0 0 24 24" fill="' + it.c + '">' + PATHS[it.k] + '</svg>' +
          (it.n ? '<text class="rb-n" x="40" y="58">' + it.n + '</text>' : '') + (it.label ? '<text class="rb-l" y="58">' + esc(it.label) + '</text>' : '') +
          (it.mine ? '<text class="rb-me" y="-58">ROBIN</text>' : '') + '</g>';
      });
    }
    /* tap targets on top (the phone's board) */
    if (o.taps) for (const id of D.IDS) s += '<polygon class="rb-tap" data-space="' + id + '" points="' + OUTLINE[id] + '"/>';
    return s + '</svg>';
  }

  /* ================================================================
     The Royal Favour track: Justice 7..1 · Order 1..7
     ================================================================ */
  function favour(f, o) {
    o = o || {};
    let h = '<div class="rf' + (o.small ? ' small' : '') + '">';
    for (let k = -7; k <= 7; k++) {
      if (k === 0) { h += '<i class="rf-mid"></i>'; continue; }
      const on = k === f;
      h += '<span class="rf-c ' + (k < 0 ? 'j' : 'o') + (on ? ' on' : '') + (Math.abs(k) >= D.WIN_AT ? ' win' : '') + '">' + (on ? icon('crown', 18, '#d9452b') : Math.abs(k)) + '</span>';
    }
    return h + '</div><div class="rf-lab"><span>Justice</span><b>' + (f > 0 ? f + ' Order' : -f + ' Justice') + '</b><span>Order</span></div>';
  }

  /* ================================================================
     Cards
     ================================================================ */
  function eventCard(id, o) {
    o = o || {};
    const c = D.EVENTS[id];
    if (!c) return '';
    const n = String(id).padStart(2, '0');
    let h = '<div class="rc' + (c.fortune ? ' fortune' : '') + (c.inspection ? ' insp' : '') + (o.cls ? ' ' + o.cls : '') + '">' +
      '<div class="rc-pic" style="background-image:url(art/e' + n + '.webp?v=' + ART_VER + ')"></div>' +
      '<div class="rc-top"><span class="rc-cars" title="Carriages that move">' + icon('cart', 18, '#c9a24c') + c.c + '</span><b class="rc-name">' + esc(c.name) + '</b></div>';
    if (c.fortune) h += '<div class="rc-half f"><small>Fortune event — happens at once</small><i>' + esc(c.title) + '</i><p>' + esc(c.text) + '</p></div>';
    else if (c.inspection) h += '<div class="rc-half f"><i>' + (c.last ? 'The end' : 'Royal Inspection') + '</i><p>' + esc(c.text) + '</p></div>';
    else {
      h += '<div class="rc-half rh' + (o.mark === 'robin' ? ' on' : '') + '"><small>Robin Hood</small><i>' + esc(c.rh.title) + '</i><p>' + esc(c.rh.text) + '</p></div>';
      h += '<div class="rc-half sh' + (o.mark === 'sheriff' ? ' on' : '') + '"><small>The Sheriff</small><i>' + esc(c.sh.title) + '</i><p>' + esc(c.sh.text) + '</p></div>';
    }
    return h + '</div>';
  }
  function traveller(card, o) {
    o = o || {};
    const T = D.TRAVELLERS[K(card)];
    if (!T) return '';
    const art = D.TRAVELLER_ART[card];
    const half = (k, H) => H ? '<div class="tv-half ' + k + (o.opt === k ? ' on' : '') + '"><i>' + esc(H.name) + '</i><p><b>Success:</b> ' + esc(H.win) + (H.lose ? ' <b>Failure:</b> ' + esc(H.lose) : '') + '</p></div>' : '';
    return '<div class="tv">' + (art ? '<div class="tv-pic" style="background-image:url(art/' + art.toLowerCase() + '.webp?v=' + ART_VER + ')"></div>' : '') +
      '<div class="tv-top"><span class="tv-def">' + T.def + '</span><b>' + esc(T.name) + '</b></div>' + half('a', T.a) + half('b', T.b) + '</div>';
  }
  function carriage(kind) {
    const C = D.CARRIAGES[kind];
    return '<div class="tv car"><div class="tv-top"><span class="tv-def">' + C.def + '</span><b>' + esc(C.name) + '</b></div><div class="tv-half"><p>' + esc(C.text) + ' Robbed: ' + C.rh + ' shillings' + (C.justice ? ', +1 Justice' : '') + '. Home: ' + C.sh + ' shillings, +' + C.order + ' Order.</p></div></div>';
  }
  /* A Rob die: its six faces, and the one that came up. */
  function die(kind, face, rolling) {
    const faces = D.DICE[kind];
    const v = face == null ? null : faces[face];
    return '<span class="rd ' + kind + (rolling ? ' rolling' : '') + '">' + (v == null ? '?' : (v > 0 ? '+' + v : v === 0 ? '0' : '−' + (-v))) + '</span>';
  }
  function dieFaces(kind) { return D.DICE[kind].map(v => (v > 0 ? '+' + v : v === 0 ? '0' : '−' + (-v))).join(' '); }

  function styles() {
    return '<style>' + `
.ri{vertical-align:-.15em;flex:none}
.rboard{display:block;width:100%;height:100%}
.rboard .rb-bg{fill:#d8c79f}
.rboard .rb-img{display:none}
.rh-art .rboard .rb-img{display:inline}
.rboard .rb-sp{fill:rgba(245,230,190,.55);stroke:rgba(80,55,25,.55);stroke-width:7}
.rboard .rb-forest{fill:rgba(110,160,80,.45)}
.rboard .rb-castle{fill:rgba(200,200,215,.6)}
.rboard .rb-hill{fill:rgba(150,150,140,.5)}
.rh-art .rboard .rb-sp{fill:transparent;stroke:none}
.rboard .rb-sp.st-rev{fill:rgba(76,175,80,.30)}
.rboard .rb-sp.st-sub{fill:rgba(91,143,214,.20)}
.rboard .rb-sp.st-pas{fill:rgba(120,110,90,.22)}
.rh-art .rboard .rb-sp.st-rev{fill:rgba(76,175,80,.24);stroke:rgba(40,120,45,.7);stroke-width:8;stroke-dasharray:28 16}
.rh-art .rboard .rb-sp.st-sub{fill:rgba(91,143,214,.12)}
.rboard text{font-family:ui-rounded,system-ui,sans-serif;text-anchor:middle}
.rboard .rb-name{fill:#3a2713;font-weight:900;font-size:56px;paint-order:stroke;stroke:#f3e6c6;stroke-width:12px}
.rh-art .rboard .rb-name{display:none}
.rboard .rb-mark rect{stroke:#1b1309;stroke-width:6}
.rboard .rb-mark text{fill:#fff;font-weight:900;font-size:40px;letter-spacing:.04em}
.rboard .rb-mark.st-sub rect{fill:#3b6fb6}
.rboard .rb-mark.st-rev rect{fill:#2e8a3a}
.rboard .rb-mark.st-pas rect{fill:#8b8170}
.rboard .rb-bridge rect{fill:#7a5a32;stroke:#f3e6c6;stroke-width:6}
.rboard .rb-bridge text{fill:#fff3d6;font-weight:900;font-size:34px}
.rboard .rb-pc circle{fill:rgba(20,14,8,.78);stroke:rgba(255,240,200,.55);stroke-width:5}
.rboard .rb-pc.h circle{stroke:#9cc0f0}
.rboard .rb-pc.robin circle{stroke:#e8c25a;stroke-width:10}
.rboard .rb-pc.mine circle{stroke:#e8c25a;stroke-width:10;stroke-dasharray:18 10}
.rboard .rb-pc.car circle{stroke:#c9a24c}
.rboard .rb-pc.secret circle{stroke-dasharray:10 8}
.rboard .rb-n{fill:#fff;font-weight:900;font-size:56px;paint-order:stroke;stroke:#120c05;stroke-width:10px}
.rboard .rb-l{fill:#ffe9a0;font-weight:900;font-size:34px;paint-order:stroke;stroke:#120c05;stroke-width:8px}
.rboard .rb-me{fill:#e8c25a;font-weight:900;font-size:34px;paint-order:stroke;stroke:#120c05;stroke-width:8px}
.rboard .rb-light{fill:rgba(255,233,160,.22);stroke:#ffe27a;stroke-width:18;stroke-opacity:.85;animation:rbPulse 1.1s ease-in-out infinite alternate}
.rboard .rb-tap{fill:transparent;cursor:pointer}
@keyframes rbPulse{from{stroke-opacity:.55}to{stroke-opacity:1}}
.rf{display:flex;align-items:stretch;gap:.12em}
.rf-c{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;font-weight:900;border-radius:.3em;padding:.15em 0;font-size:.9em;color:#fff;opacity:.62}
.rf-c.j{background:#2e7d38}.rf-c.o{background:#3b6fb6}
.rf-c.win{box-shadow:inset 0 0 0 .12em rgba(255,233,160,.6)}
.rf-c.on{opacity:1;background:#fff4d6;box-shadow:0 0 0 .15em #d9452b}
.rf-mid{width:.25em;background:#e8c25a;border-radius:.2em}
.rf-lab{display:flex;justify-content:space-between;font-size:.8em;color:#cdbb95;margin-top:.15em}
.rf-lab b{color:#fff4d6}
.rc{position:relative;display:flex;flex-direction:column;background:#efe3c4;color:#2b1d0e;border:.15em solid #8a6a36;border-radius:.7em;overflow:hidden;min-width:0}
.rc-pic{display:none;height:5.5em;background-size:cover;background-position:center 30%}
.rh-art .rc-pic{display:block}
.rc-top{display:flex;align-items:center;gap:.5em;padding:.35em .55em;background:#5b3d1c;color:#fff4d6}
.rc-cars{display:inline-flex;align-items:center;gap:.15em;font-weight:900;flex:none}
.rc-name{font-size:1.05em;letter-spacing:.03em}
.rc-half{padding:.35em .6em .45em;font-size:.82em;line-height:1.28}
.rc-half small{display:block;font-size:.72em;letter-spacing:.1em;text-transform:uppercase;opacity:.7}
.rc-half i{display:block;font-weight:800}
.rc-half p{margin:.1em 0 0}
.rc-half.sh{background:#3f5a3a;color:#eef2e6}
.rc-half.on{box-shadow:inset 0 0 0 .2em #e8c25a}
.rc.fortune .rc-top{background:#6b4a8a}
.rc.insp .rc-top{background:#8a2a1c}
.tv{position:relative;display:flex;flex-direction:column;background:#efe3c4;color:#2b1d0e;border:.15em solid #6b5232;border-radius:.7em;overflow:hidden;min-width:0}
.tv-pic{display:none;height:5em;background-size:cover;background-position:center 30%}
.rh-art .tv-pic{display:block}
.tv-top{display:flex;align-items:center;gap:.5em;padding:.3em .55em;background:#4a3a24;color:#fff4d6}
.tv-def{display:inline-flex;align-items:center;justify-content:center;width:1.5em;height:1.5em;border-radius:50% 50% 45% 45%;background:#cfd6de;color:#1b1309;font-weight:900;flex:none}
.tv-half{padding:.3em .55em .4em;font-size:.8em;line-height:1.26}
.tv-half i{font-weight:800;display:block}
.tv-half p{margin:.05em 0 0}
.tv-half.b{background:#3f5a3a;color:#eef2e6}
.tv-half.on{box-shadow:inset 0 0 0 .2em #e8c25a}
.rd{display:inline-flex;align-items:center;justify-content:center;width:2em;height:2em;border-radius:.35em;font-weight:900;font-size:1.4em;border:.12em solid #1b1309}
.rd.green{background:#3f9d4a;color:#fff}
.rd.white{background:#f6f1e4;color:#1b1309}
.rd.rolling{animation:rdTumble .35s linear infinite}
@keyframes rdTumble{0%{transform:rotate(0)}25%{transform:rotate(90deg) scale(.92)}50%{transform:rotate(180deg)}75%{transform:rotate(270deg) scale(.92)}100%{transform:rotate(360deg)}}
.wl{color:inherit}
` + '</style>';
  }

  /* The printed pictures are a layer, switched on only once one loads. */
  function probe() {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    const im = new Image();
    im.onload = () => { if (im.naturalWidth > 0) document.documentElement.classList.add('rh-art'); };
    im.src = 'art/board.webp?v=' + ART_VER;
  }

  const Art = { VERSION, ART_VER, esc, icon, board, favour, eventCard, traveller, carriage, die, dieFaces, styles, probe, OUTLINE, COL };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  else root.RhArt = Art;
})(typeof window !== 'undefined' ? window : this);
