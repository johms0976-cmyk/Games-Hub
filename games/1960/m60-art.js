'use strict';
/* 1960 — drawn icons, card faces and the board; the module's pictures as a
 * layer.
 *
 * The pictures in art/ are cut from the user's VASSAL module
 * (tools/cut-art.py): the printed map and every card, GMT's, for this private
 * hub only. They are NEVER load-bearing (LESSONS-CHECKLIST E): every face is
 * drawn — CP, rest, icons, issue, state, the event text — and every state box
 * is drawn where the module's zone puts it, so the board reads with no
 * picture at all. The pictures go under/over only once `probe()` has seen one
 * load and set html.art. jsdom tests and a missing folder get the drawn faces,
 * and the privacy guard's markup never depends on a picture.
 */
(function (root) {
  const D = root.M60Data;
  const VERSION = 1;
  /* The one build number (m60-build.js) busts every picture; Node has none. */
  const ART_VER = root.M60_BUILD || 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const url = f => 'art/' + f + '?v=' + ART_VER;

  /* Icons, drawn (no emoji). 24x24 viewBox. */
  const W = '#fffaf0';
  const SVG = {
    K: '<rect x="1" y="1" width="22" height="22" rx="5" fill="#2f62b8"/><path d="M6 7 L9 7 L9 11 L13.5 7 L17.5 7 L12 12 L18 18 L14 18 L9 13 L9 18 L6 18 Z" fill="' + W + '"/>',
    N: '<rect x="1" y="1" width="22" height="22" rx="5" fill="#c8383e"/><path d="M6 18 L6 6 L9 6 L15 13.5 L15 6 L18 6 L18 18 L15 18 L9 10.5 L9 18 Z" fill="' + W + '"/>',
    def: '<rect x="1" y="1" width="22" height="22" rx="5" fill="#c2433c"/><path d="M4 15 H20 V18 H4 Z M7 11 H15 V15 H7 Z M15 12 H21 V13.4 H15 Z" fill="' + W + '"/><circle cx="7" cy="18" r="1.4" fill="#c2433c"/><circle cx="12" cy="18" r="1.4" fill="#c2433c"/><circle cx="17" cy="18" r="1.4" fill="#c2433c"/>',
    eco: '<rect x="1" y="1" width="22" height="22" rx="5" fill="#8fa83a"/><path d="M4 17 L9 11 L13 14 L20 6" stroke="' + W + '" stroke-width="2.4" fill="none" stroke-linejoin="round"/><path d="M4 19 H20" stroke="' + W + '" stroke-width="1.4"/>',
    cr: '<rect x="1" y="1" width="22" height="22" rx="5" fill="#4c8a93"/><circle cx="9" cy="12" r="4.6" fill="none" stroke="' + W + '" stroke-width="2.2"/><circle cx="15" cy="12" r="4.6" fill="none" stroke="#1d2a44" stroke-width="2.2"/>',
    mom: '<path d="M12 2 L14.6 8.6 L21.5 9 L16.2 13.4 L18 20.2 L12 16.4 L6 20.2 L7.8 13.4 L2.5 9 L9.4 8.6 Z" fill="#f1c75b" stroke="#6b4d0f" stroke-width="1"/>',
    pawn: '<circle cx="12" cy="6.5" r="4" fill="currentColor"/><path d="M8 21 C8 14 10 12 12 12 C14 12 16 14 16 21 Z" fill="currentColor"/><rect x="6" y="20" width="12" height="2.5" rx="1" fill="currentColor"/>',
    bag: '<path d="M7 7 C7 4 17 4 17 7 L20 20 C20 22 4 22 4 20 Z" fill="#7a5a32"/><path d="M8 7 C10 9 14 9 16 7" stroke="#e8d7b4" stroke-width="1.4" fill="none"/>',
    card: '<rect x="5" y="3" width="14" height="18" rx="2" fill="#efe6d2" stroke="#1d2a44" stroke-width="1.4"/><rect x="5" y="3" width="14" height="5" rx="2" fill="#c8383e"/>',
    endorse: '<circle cx="12" cy="12" r="9" fill="#efe6d2" stroke="#1d2a44" stroke-width="1.6"/><path d="M7.5 12.5 L10.5 15.5 L16.5 8.5" stroke="#1d2a44" stroke-width="2.4" fill="none"/>',
    media: '<rect x="3" y="5" width="18" height="13" rx="2" fill="#2a2f3a" stroke="#efe6d2" stroke-width="1.4"/><rect x="5.5" y="7.5" width="13" height="8" fill="#9fb7c9"/><path d="M9 21 H15" stroke="#efe6d2" stroke-width="1.6"/>',
    rest: '<path d="M12 3 C7 3 4 7 4 12 C4 17 8 21 12 21 C9 18 8 15 8 12 C8 8 10 5 12 3 Z" fill="#c9b37a"/>'
  };
  function icon(name, size, cls) {
    const s = SVG[name];
    if (!s) return '';
    return '<svg class="mi' + (cls ? ' ' + cls : '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' + s + '</svg>';
  }
  /* A cube in a side's colour, with an optional count. */
  const cube = (s, n, cls) => '<span class="mcu ' + (s === 'K' ? 'k' : s === 'N' ? 'n' : 'x') + (cls ? ' ' + cls : '') + '">' + (n != null ? n : '') + '</span>';

  /* ---------------- a card ---------------- */
  /* face: the whole printed card, drawn; the picture over it with html.art. */
  function face(id, o) {
    o = o || {};
    if (id === 'K' || id === 'N') return candFace(id, !!o.exhausted, o);
    const c = D.CARD[id];
    if (!c) return '';
    const bar = c.persist ? { prev: 'Prevention event', debate: 'Debate event', eday: 'Election Day event' }[c.persist] : c.noStrat ? 'In the ' + ({ 14: 'South', 15: 'East', 16: 'Midwest', 17: 'West' })[id] : '';
    const reg = c.st ? D.REGION[D.STATE[c.st].reg] : null;
    return '<div class="mc' + (o.cls ? ' ' + o.cls : '') + '" data-card="' + id + '">' +
      '<div class="mc-h">' + esc(c.name) + '</div>' + (bar ? '<div class="mc-bar">' + esc(bar) + '</div>' : '') +
      '<div class="mc-tx">' + esc(c.text) + '</div>' +
      '<div class="mc-low"><div class="mc-l"><b class="mc-cp">' + c.cp + '</b><small>CP</small>' + D.icons(c).map(s => icon(s, 22)).join('') + '</div>' +
      '<div class="mc-r"><b class="mc-rest">+' + c.rest + '</b><small>REST</small>' + (c.iss ? icon(c.iss, 22) : '') + '</div></div>' +
      (c.st ? '<span class="mc-st" style="background:' + reg.hex + '">' + c.st + '</span>' : '<span class="mc-st none">!</span>') +
      '<span class="mc-n">' + id + '</span>' +
      '<img class="pic" alt="" loading="lazy" src="' + url('c' + id + '.webp') + '"></div>';
  }
  function candFace(s, ex, o) {
    const S = D.SIDE[s];
    return '<div class="mc cand ' + (s === 'K' ? 'ck' : 'cn') + (ex ? ' ex' : '') + (o && o.cls ? ' ' + o.cls : '') + '">' +
      '<div class="mc-h">' + esc(S.full) + '</div><div class="mc-tx">' + (ex ? 'Exhausted. Out of play until an event turns it face up again.' : 'Play it for 5 CP instead of a card from your hand; then it is exhausted.') + '</div>' +
      '<div class="mc-low"><div class="mc-l">' + (ex ? '<b class="mc-cp">—</b>' : '<b class="mc-cp">5</b><small>CP</small>') + icon(s, 22) + '</div></div>' +
      '<span class="mc-st" style="background:' + (s === 'K' ? '#d1584f' : '#c9a35b') + '">' + S.home + '</span>' +
      '<img class="pic" alt="" loading="lazy" src="' + url('cand_' + s + (ex ? 'X' : '') + '.webp') + '"></div>';
  }
  /* spine: one line — CP, name, icons, issue, state — for lists on a phone
     or a strip of the telly (a small face must still say what it does). */
  function spine(id, o) {
    o = o || {};
    if (id === 'K' || id === 'N') return '<span class="msp cand"><b class="msp-cp">5</b><span class="msp-nm">' + esc(D.SIDE[id].full) + ' (candidate card)</span>' + icon(id, 16) + '</span>';
    const c = D.CARD[id];
    if (!c) return '';
    return '<span class="msp' + (o.cls ? ' ' + o.cls : '') + '"><b class="msp-cp">' + c.cp + '</b><span class="msp-nm">' + esc(c.name) + '</span>' +
      D.icons(c).map(s => icon(s, 16)).join('') + (c.iss ? icon(c.iss, 16) : '') + (c.st ? '<span class="msp-st" style="background:' + D.REGION[D.STATE[c.st].reg].hex + '">' + c.st + '</span>' : '') +
      (c.rest ? '<span class="msp-rest">+' + c.rest + '</span>' : '') + '</span>';
  }

  /* ---------------- the board ---------------- */
  const pct = (b) => 'left:' + (b[0] / D.MAP_W * 100).toFixed(3) + '%;top:' + (b[1] / D.MAP_H * 100).toFixed(3) + '%;width:' + ((b[2] - b[0]) / D.MAP_W * 100).toFixed(3) + '%;height:' + ((b[3] - b[1]) / D.MAP_H * 100).toFixed(3) + '%';
  function stateBox(pub, st, o) {
    const S = D.STATE[st], v = pub.sup[st], L = D.leadOf(v);
    const car = L && Math.abs(v) >= D.RULES.carry;
    const tok = D.SIDES.filter(s => pub.tok[s] === st);
    const hi = o.hi && o.hi[st] ? ' ' + o.hi[st] : '';
    return '<div class="sb r' + S.reg + (L ? ' l' + L : '') + (car ? ' car' : '') + hi + '" style="' + pct(S.box) + '" data-st="' + st + '">' +
      '<span class="sb-ab">' + st + '</span><span class="sb-ev">' + S.ev + '</span>' +
      (L ? cube(L, Math.abs(v), 'sb-cu') : '<span class="sb-edge e' + S.edge + '"></span>') +
      tok.map(s => '<span class="sb-tok t' + s + '">' + icon('pawn', 22) + '</span>').join('') + '</div>';
  }
  function board(pub, o) {
    o = o || {};
    const Z = D.ZONE;
    let h = '<div class="mb">';
    h += '<img class="mb-img" alt="" src="' + url('map.webp') + '">';
    /* Region names, for the drawn board (the printed map has its own). */
    h += [['W', [1300, 2380]], ['MW', [3150, 520]], ['S', [3350, 2300]], ['E', [4300, 1840]]].map(([r, xy]) =>
      '<span class="mb-rl" style="left:' + (xy[0] / D.MAP_W * 100) + '%;top:' + (xy[1] / D.MAP_H * 100) + '%;color:' + D.REGION[r].hex + '">' + D.REGION[r].name.toUpperCase() + '</span>').join('');
    /* The turn and phase tracks. */
    Z.turn.forEach((b, k) => { h += '<div class="mb-tr' + (pub.turn === k + 1 ? ' on' : pub.turn > k + 1 ? ' past' : '') + '" style="' + pct(b) + '"><span>' + (k === 5 ? 'DEB' : k === 8 ? 'ELEC' : k + 1) + '</span></div>'; });
    const ph = pub.phase === 'act' ? pub.ap - 1 : pub.phase === 'mom' ? 5 : pub.phase === 'strat' ? 6 : -1;
    Z.phase.forEach((b, k) => { h += '<div class="mb-tr ph' + (ph === k ? ' on' : '') + '" style="' + pct(b) + '"><span>' + (k < 5 ? k + 1 : k === 5 ? 'MOM' : 'STRAT') + '</span></div>'; });
    /* The issues track. */
    pub.order.forEach((i, k) => {
      const L = D.leadOf(pub.iss[i]);
      h += '<div class="mb-iss' + (o.issHi === i ? ' hot' : '') + '" style="' + pct(Z.issue[k]) + ';--c:' + D.ISSUE[i].hex + '">' + icon(i, 26) + '<span class="mb-in">' + esc(D.ISSUE[i].name) + '</span>' + (L ? cube(L, Math.abs(pub.iss[i])) : '<span class="mb-none">—</span>') + '</div>';
    });
    /* Media and endorsements, region by region. */
    D.REGIONS.forEach(r => {
      const m = pub.media[r], e = pub.end[r];
      h += '<div class="mb-med" style="' + pct(Z.media[r]) + '">' + icon('media', 22) + (m ? cube(D.leadOf(m), Math.abs(m)) : '<span class="mb-none">0</span>') + '</div>';
      h += '<div class="mb-end" style="' + pct(Z.endorse[r]) + '">' + (e ? '<span class="mb-em ' + (e > 0 ? 'k' : 'n') + '">' + Math.abs(e) + '</span>' : '') + '</div>';
    });
    /* Rest cubes and the Campaign Strategy stacks. */
    D.SIDES.forEach(s => {
      h += '<div class="mb-rest" style="' + pct(Z.rest[s]) + '"><span>REST</span>' + cube(s, pub.rest[s]) + '</div>';
      const n = pub.stratN[s];
      h += '<div class="mb-strat" style="' + pct(Z.strat[s]) + '"><span>STRATEGY</span><b>' + n + '</b><small>card' + (n === 1 ? '' : 's') + ' face down</small></div>';
    });
    /* The persistent events, and the two Prevention markers. */
    ['prev', 'debate', 'eday'].forEach(k => {
      const list = pub.board[k] || [];
      h += '<div class="mb-pe" style="' + pct(Z[k]) + '"><span>' + ({ prev: 'PREVENTION', debate: 'DEBATE', eday: 'ELECTION DAY' })[k] + '</span>' +
        list.map(c => '<em>' + esc(D.CARD[c].name) + '</em>').join('') + '</div>';
    });
    [1, 18].forEach(c => { if ((pub.board.prev || []).indexOf(c) >= 0) h += '<div class="mb-pm" style="' + pct(Z.prevMark[c]) + '"></div>'; });
    /* The last card each side played. */
    D.SIDES.forEach(s => {
      const c = o.last && o.last[s];
      h += '<div class="mb-play p' + s + '" style="' + pct(Z.play[s]) + '">' + (c ? face(c) : '') + '</div>';
    });
    D.STATES.forEach(st => { h += stateBox(pub, st, o); });
    return h + '</div>';
  }

  /* The candidates' pixel portraits (tools/portraits.py, from the 1960 broadcast stills): 32x40
     cells on a duotone in the side's colour, drawn with hard square pixels at any size. Never
     load-bearing: a portrait that fails to load removes itself, and every place one stands also
     names the candidate in words. */
  const portrait = (side, cls) => '<img class="m60-pt ' + (cls || '') + '" alt="" src="portraits/' + side + '.png?v=' + ART_VER + '" onerror="this.remove()">';

  function styles() {
    return '<style>' + `
.m60-pt{display:block;aspect-ratio:4/5;object-fit:cover;image-rendering:pixelated;image-rendering:crisp-edges;border-radius:.4vh;box-shadow:0 0 0 .25vh rgba(243,236,219,.55)}
.mi{flex:none;vertical-align:middle}
.mcu{display:inline-flex;align-items:center;justify-content:center;min-width:1.5em;height:1.5em;padding:0 .2em;border-radius:.22em;font-weight:900;font-family:system-ui,sans-serif;line-height:1;
  box-shadow:inset 0 -.12em 0 rgba(0,0,0,.35),0 .05em .2em rgba(0,0,0,.4)}
.mcu.k{background:#2f62b8;color:#fff}.mcu.n{background:#c8383e;color:#fff}.mcu.x{background:#7a7a7a;color:#fff}
/* a card face */
.mc{position:relative;aspect-ratio:343/481;background:#efe6d2;color:#1d2a44;border-radius:.6em;overflow:hidden;font-family:system-ui,"Segoe UI",sans-serif;
  box-shadow:0 .2em .7em rgba(0,0,0,.45);display:flex;flex-direction:column;font-size:inherit}
.mc-h{background:#b8333a;color:#fff;font-weight:900;font-size:1.05em;line-height:1.08;padding:.45em .55em .4em;letter-spacing:.01em;font-family:Georgia,serif}
.mc-bar{background:#3d6b6a;color:#fff;font-size:.66em;letter-spacing:.08em;text-transform:uppercase;padding:.2em .8em}
.mc-tx{flex:1;font-size:.72em;line-height:1.2;padding:.45em .65em;overflow:hidden}
.mc-low{display:flex;justify-content:space-between;align-items:flex-end;padding:0 .55em 1.9em}
.mc-l,.mc-r{display:flex;flex-direction:column;align-items:center;gap:.15em}
.mc-cp{font-size:2em;line-height:.9;color:#3d6b6a}.mc-rest{font-size:1.5em;line-height:.9;color:#b8333a}
.mc-l small,.mc-r small{font-size:.55em;font-weight:800;color:#3d6b6a;letter-spacing:.06em}
.mc-st{position:absolute;right:.4em;bottom:.35em;width:2.1em;height:2.1em;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:.8em;border:.12em solid rgba(255,255,255,.7)}
.mc-st.none{background:linear-gradient(180deg,#2f62b8 50%,#c8383e 50%)}
.mc-n{position:absolute;left:.6em;bottom:.45em;font-size:.55em;color:#7a6f5a}
.mc.cand.ck{background:#2f5aa8;color:#fff}.mc.cand.cn{background:#a8323a;color:#fff}
.mc.cand .mc-h{background:rgba(0,0,0,.25)}.mc.cand .mc-cp{color:#fff}.mc.cand small{color:#fff}
.mc.cand.ex{filter:grayscale(.5) brightness(.8)}
.mc .pic{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none}
html.art .mc .pic{display:block}
/* a spine */
.msp{display:inline-flex;align-items:center;gap:.35em;min-width:0;max-width:100%}
.msp-cp{display:inline-flex;align-items:center;justify-content:center;min-width:1.5em;height:1.5em;border-radius:.3em;background:#3d6b6a;color:#fff;font-family:system-ui,sans-serif;flex:none}
.msp-nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.msp-st{font-size:.75em;font-weight:900;color:#fff;border-radius:999px;padding:.1em .45em;flex:none;font-family:system-ui,sans-serif}
.msp-rest{font-size:.75em;color:#c9b37a;flex:none;font-family:system-ui,sans-serif}
/* the board */
.mb{position:relative;width:100%;height:100%;background:radial-gradient(ellipse at 50% 45%,#2a3a58,#16203a 75%);border-radius:1.2vh;overflow:hidden;font-family:system-ui,"Segoe UI",sans-serif}
.mb>*{position:absolute}
.mb-img{inset:0;width:100%;height:100%;display:none}
html.art .mb-img{display:block}
.mb-rl{transform:translate(-50%,-50%);font-weight:900;letter-spacing:.3em;font-size:2.4vh;opacity:.55}
html.art .mb-rl{display:none}
.mb-tr{display:flex;align-items:center;justify-content:center;border-radius:.6vh;background:rgba(184,51,58,.55);color:#fff;font-weight:900;font-size:1.6vh}
.mb-tr.ph{background:rgba(61,107,106,.55)}
.mb-tr.past{opacity:.55}
.mb-tr.on{box-shadow:0 0 0 .45vh #f1c75b,0 0 2vh #f1c75b;background:rgba(241,199,91,.35)}
html.art .mb-tr{background:transparent;color:transparent}
html.art .mb-tr.on{background:rgba(241,199,91,.25)}
.mb-iss{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3vh;background:color-mix(in srgb,var(--c) 70%,#111);border-radius:.8vh;color:#fff;font-size:1.7vh;font-weight:800;box-shadow:0 .3vh 1vh rgba(0,0,0,.5)}
.mb-iss .mcu{font-size:2.4vh}
.mb-iss.hot{box-shadow:0 0 0 .4vh #f1c75b}
.mb-in{font-size:1.45vh;line-height:1}
.mb-none{color:rgba(255,255,255,.6);font-size:1.8vh}
.mb-med{display:flex;align-items:center;justify-content:center;gap:.5vh;border-radius:50%;background:rgba(20,26,40,.55)}
.mb-med .mcu{font-size:2.6vh}
html.art .mb-med{background:transparent}
.mb-end{display:flex;align-items:flex-end;justify-content:center;padding-bottom:1vh}
.mb-em{display:inline-flex;align-items:center;justify-content:center;width:4.4vh;height:4.4vh;border-radius:50%;font-weight:900;font-size:2.6vh;color:#fff;border:.4vh solid #efe6d2;box-shadow:0 .3vh 1vh rgba(0,0,0,.6)}
.mb-em.k{background:#2f62b8}.mb-em.n{background:#c8383e}
.mb-rest,.mb-strat{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4vh;color:#efe6d2;font-weight:800;font-size:1.5vh;background:rgba(10,14,24,.55);border-radius:1vh}
.mb-rest .mcu{font-size:2.6vh}
.mb-strat b{font-size:3.4vh;line-height:1}.mb-strat small{font-size:1.3vh;opacity:.8}
.mb-pe{display:flex;flex-direction:column;gap:.4vh;padding:.8vh;background:rgba(10,14,24,.7);border-radius:1vh;color:#efe6d2;font-size:1.3vh;overflow:hidden}
.mb-pe span{font-weight:900;letter-spacing:.08em;opacity:.8}
.mb-pe em{font-style:normal;background:#efe6d2;color:#1d2a44;border-radius:.5vh;padding:.3vh .5vh;font-weight:800;font-size:1.35vh;line-height:1.15}
.mb-pm{border-radius:1vh;box-shadow:0 0 0 .5vh #f1c75b,0 0 3vh #f1c75b}
.mb-play{display:flex;align-items:center;justify-content:center}
.mb-play .mc{height:100%;font-size:1.05vh}
.sb{display:flex;align-items:center;justify-content:center;border-radius:1vh;border:.25vh solid rgba(255,255,255,.35);color:#fff;transition:box-shadow .4s}
.sb.rW{background:#9a7c3f}.sb.rMW{background:#2f5554}.sb.rS{background:#4d6f98}.sb.rE{background:#a8443e}
.sb-ab{font-weight:900;font-size:2.5vh;letter-spacing:.02em;margin-top:-1.2vh}
.sb-ev{position:absolute;right:.3vh;top:.2vh;font-size:1.45vh;font-weight:800;opacity:.9}
.sb-cu{position:absolute;left:50%;bottom:.4vh;transform:translateX(-50%);font-size:2.3vh}
.sb.car .sb-cu{box-shadow:0 0 0 .3vh #f1c75b,inset 0 -.12em 0 rgba(0,0,0,.35)}
.sb.lK{border-color:#7fb0ff}.sb.lN{border-color:#ff8f93}
.sb-edge{position:absolute;left:50%;bottom:.8vh;transform:translateX(-50%);width:1.2vh;height:1.2vh;border-radius:50%;opacity:.7}
.sb-edge.eK{background:#7fb0ff}.sb-edge.eN{background:#ff8f93}
.sb-tok{position:absolute;right:-.6vh;bottom:-.4vh;filter:drop-shadow(0 .2vh .3vh rgba(0,0,0,.8))}
.sb-tok svg{width:3vh;height:3vh}
.sb-tok.tK{color:#5d93f0}.sb-tok.tN{color:#ff5d63}
.sb-tok.tK+.sb-tok.tN{right:auto;left:-.6vh}
html.art .sb{background:transparent;border-color:transparent}
html.art .sb-ab,html.art .sb-ev,html.art .sb-edge{display:none}
html.art .sb.lK{box-shadow:inset 0 0 0 .45vh rgba(62,123,250,.9)}
html.art .sb.lN{box-shadow:inset 0 0 0 .45vh rgba(229,72,77,.9)}
.sb.hot{box-shadow:0 0 0 .5vh #f1c75b,0 0 2.5vh #f1c75b !important;z-index:3}
.sb.gain{animation:sbPulse .9s ease-in-out 3}
@keyframes sbPulse{50%{box-shadow:0 0 0 .7vh #fff,0 0 3vh #fff}}
` + '</style>';
  }

  /* The pictures are a layer: switched on only once one has loaded. */
  function probe() {
    if (typeof Image === 'undefined' || !root.document) return;
    const im = new Image();
    im.onload = () => { if (im.naturalWidth > 0) root.document.documentElement.classList.add('art'); };
    im.src = url('c1.webp');
    probeScenes();
  }

  /* The baked scenes (LESSONS-CHECKLIST H1; bakery/scenes.py). Our own Blender bakes, not the
     module's pictures. THE CAMERA CONTRACT: every plate of a scene is the same full frame from
     the same camera, so the layers stack at 0,0 with no offsets. Debates 1600x1035 (the map
     box, 5100:3300), Election Night 1920x1080. `at` is where each candidate stands in the frame
     (fractions, measured off the alpha of the bake): the spotlight and the card he plays are
     placed by it. html.m60scene is set only once the stage has loaded — with no plates the
     Debates are the drawn panel, as before (art is never load-bearing). */
  const SCENES = {
    debate: { w: 1600, h: 1035, stage: 'debate-stage.webp',
      K: { stand: 'debate-K-stand.webp', speak: 'debate-K-speak.webp', at: { x: 0.282, top: 0.40, bottom: 0.553 } },
      N: { stand: 'debate-N-stand.webp', speak: 'debate-N-speak.webp', at: { x: 0.718, top: 0.40, bottom: 0.553 } } },
    eday: { w: 1920, h: 1080, room: 'eday-room.webp', lights: 'eday-lights.webp' }
  };
  const sceneUrl = f => 'scenes/' + f + '?v=' + ART_VER;
  function probeScenes() {
    if (typeof Image === 'undefined' || !root.document) return;
    const im = new Image();
    im.onload = () => {
      if (im.naturalWidth <= 0) return;
      root.document.documentElement.classList.add('m60scene');
      /* Warm the other plates so the first swap does not flash. */
      const D2 = SCENES.debate, E2 = SCENES.eday;
      [D2.K.stand, D2.K.speak, D2.N.stand, D2.N.speak, E2.room, E2.lights].forEach(f => { const x = new Image(); x.src = sceneUrl(f); });
      root.document.documentElement.style.setProperty('--m60-eday', 'url("' + sceneUrl(E2.room) + '")');
      root.document.documentElement.style.setProperty('--m60-lights', 'url("' + sceneUrl(E2.lights) + '")');
      /* The page painted before the plate arrived: tell it to paint again. */
      try { root.dispatchEvent(new root.Event('m60scene')); } catch (e) { /* no events: the next paint picks it up */ }
    };
    im.src = sceneUrl(SCENES.debate.stage);
  }

  const Art = { VERSION, ART_VER, esc, icon, cube, face, spine, board, stateBox, styles, probe, url, SCENES, sceneUrl, probeScenes, portrait };
  root.M60Art = Art;
})(typeof window !== 'undefined' ? window : this);
