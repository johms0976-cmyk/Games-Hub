'use strict';
/* Nations — card faces, tokens and icons.
 *
 * A card is the user's blank template (NationsCardTemplates/card-*.png) with
 * the picture cut from their VASSAL scans (art/cards/<id>.webp) laid in its
 * window, and everything else — name, production, costs, VP, workers, text —
 * drawn here in HTML from the data. So the numbers on a face are the numbers
 * the engine plays with; a face cannot claim what the code does not do.
 *
 * Sizes are in container units: a face is as big as whatever holds it, and
 * everything on it scales with it (`container-type:inline-size`).
 *
 * The art is never load-bearing: with no picture the window is plain
 * parchment and the card still reads.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nations-data.js') : root.NationsData;
  const VERSION = 2;
  const ART_VER = 2;
  const BASE = (root.NATIONS_BASE != null ? root.NATIONS_BASE : '');
  const TPL = BASE + 'NationsCardTemplates/';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const C = id => D.card(id);

  const TEMPLATE = { advisor: 'card-advisor', battle: 'card-battle', building: 'card-building', colony: 'card-colony',
    golden: 'card-goldenage', military: 'card-military', war: 'card-war', wonder: 'card-wonder', natural: 'card-wonder' };
  const TYPE_NAME = { advisor: 'Advisor', battle: 'Battle', building: 'Building', colony: 'Colony', golden: 'Golden Age',
    military: 'Military', war: 'War', wonder: 'Wonder', natural: 'Natural Wonder', dynasty: 'Dynasty' };
  const TYPE_HEX = { advisor: '#f08a1c', battle: '#8d8d8d', building: '#39a8e8', colony: '#46b83a', golden: '#e8cf1f',
    military: '#d8262a', war: '#222', wonder: '#9a5a22', natural: '#6f8f3c', dynasty: '#2a4f8f' };
  const ICON = { gold: 'gold', stone: 'stone', food: 'food', book: 'book', stab: 'stability', str: 'strength', worker: 'worker', raid: 'raid' };
  const RES_NAME = { gold: 'gold', stone: 'stone', food: 'food', book: 'books', stab: 'stability', str: 'strength', vp: 'VP' };

  /* ---------------- the style sheet, once ---------------- */
  const CSS = `
.nc{position:relative;width:100%;aspect-ratio:693/1071;background:#e9e1cf 0 0/100% 100% no-repeat;container-type:inline-size;
  font-family:"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif;color:#2b2216;border-radius:6%/4%;user-select:none;overflow:hidden}
.nc>*{position:absolute}
.nc .nc-pic{left:13.7%;width:72.6%;background:#efe6d2 center/cover no-repeat;
  clip-path:polygon(4% 0,96% 0,100% 4%,100% 96%,96% 100%,4% 100%,0 96%,0 4%)}
.nc .nc-type{left:10%;right:10%;top:4.4%;height:5.2%;display:flex;align-items:center;justify-content:center;
  font:700 5cqw/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b5a3e}
.nc .nc-name{left:6%;right:6%;display:flex;align-items:center;justify-content:center;text-align:center;
  font-weight:700;font-size:9.4cqw;line-height:.95;letter-spacing:-.01em}
.nc .nc-name.long{font-size:7.6cqw}
.nc .nc-name.xlong{font-size:6.4cqw}
.nc .nc-top{left:7%;right:7%;top:5.5%;height:17%;display:flex;align-items:center;justify-content:space-around}
.nc .nc-low{left:8%;right:8%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5cqw;text-align:center}
.nc .nc-txt{font:600 6.4cqw/1.12 system-ui,sans-serif;color:#3a2f1f}
.nc .nc-txt b{font-weight:800}
.nc .nc-row{display:flex;align-items:center;justify-content:center;gap:2cqw;flex-wrap:wrap}
.nc .nc-vps{display:flex;gap:.6cqw}
.nc .nc-wk{display:flex;gap:2.2cqw}
.nc .nc-raid{left:15%;top:35.5%}
.nc .nc-sec{display:flex;gap:2.5cqw;align-items:flex-end}
.nc .nc-sec>span{display:flex;flex-direction:column;align-items:center;gap:1cqw}
.nc .nc-dim{opacity:.35}
.nc.nc-small .nc-txt{display:none}
/* A small face still says what an advisor or a wonder does: the words are
   what the card IS, so they go over the picture where they can be big. */
.nc .nc-sum{display:none;left:13.7%;width:72.6%;top:22.5%;height:43.1%;align-items:center;justify-content:center;text-align:center;padding:1.5cqw;
  background:rgba(243,235,215,.94);font:700 12cqw/1.05 system-ui,sans-serif;color:#2b2216;
  clip-path:polygon(4% 0,96% 0,100% 4%,100% 96%,96% 100%,4% 100%,0 96%,0 4%)}
.nc .nc-sum.m{font-size:10.5cqw}
.nc .nc-sum.l{font-size:9cqw}
.nc.nc-small .nc-sum{display:flex}
.nc .nc-sum.won{height:35%}
.nc .nc-sum.won.m{font-size:9.5cqw}
.nc .nc-sum.won.l{font-size:8.2cqw}
.nt{display:inline-flex;align-items:center;flex:none;position:relative;line-height:1}
.nt .nt-n{display:flex;align-items:center;justify-content:center;color:#fff;font:900 calc(var(--s)*.62)/1 system-ui,sans-serif;
  width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle at 35% 30%,#ef5b52,#c3151b 70%);
  box-shadow:0 0 0 calc(var(--s)*.06) rgba(255,255,255,.55) inset,0 calc(var(--s)*.04) calc(var(--s)*.1) rgba(0,0,0,.35);z-index:1}
.nt.sq .nt-n{border-radius:calc(var(--s)*.14)}
.nt.neg .nt-n{background:radial-gradient(circle at 35% 30%,#555,#161616 70%)}
.nt .nt-i{width:calc(var(--s)*1.05);height:calc(var(--s)*.95);margin-left:calc(var(--s)*-.18);background:center/contain no-repeat}
.ni{display:inline-block;width:var(--s);height:var(--s);background:center/contain no-repeat;vertical-align:middle;flex:none}
.ni.ni-worker{background:currentColor;-webkit-mask:url(${TPL}worker.png) center/contain no-repeat;mask:url(${TPL}worker.png) center/contain no-repeat}
.nvp{display:inline-flex;align-items:center;justify-content:center;width:var(--s);height:var(--s);flex:none;position:relative;vertical-align:middle}
.nvp svg{position:absolute;inset:0;width:100%;height:100%}
.nvp b{position:relative;font:900 calc(var(--s)*.46)/1 system-ui,sans-serif;color:#3a2b00}
.nvp.neg b{color:#fff}
.narch{display:inline-block;width:var(--s);height:var(--s);border-radius:calc(var(--s)*.12);background:linear-gradient(160deg,#8a5a2b,#4a2c12);
  box-shadow:0 0 0 calc(var(--s)*.07) #2a1808 inset;position:relative;vertical-align:middle;flex:none}
.narch::after{content:"";position:absolute;left:22%;right:22%;top:28%;bottom:34%;border-left:calc(var(--s)*.09) solid #e8c48a;border-top:calc(var(--s)*.09) solid #e8c48a;transform:rotate(45deg) translate(15%,15%)}
.narch.on{background:linear-gradient(160deg,#f2cf6a,#b8861c)}
.nev{position:relative;width:100%;aspect-ratio:591/874;background:url(${TPL}card-event.png) 0 0/100% 100% no-repeat;container-type:inline-size;
  font-family:"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif;color:#2b2216;border-radius:5%/3.4%;overflow:hidden}
.nev>*{position:absolute}
.nev .ev-arch{left:3.5%;top:2.4%;display:flex;gap:1.6cqw}
.nev .ev-fam{left:70.2%;top:11.4%;transform:translate(-50%,-50%);font:900 10cqw/1 system-ui,sans-serif;color:#fff}
.nev .ev-name{left:10%;right:10%;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;font-size:8.6cqw;line-height:1}
.nev .ev-txt{left:11%;right:11%;display:flex;align-items:center;justify-content:center;text-align:center;font:600 6.8cqw/1.15 system-ui,sans-serif;color:#3a2f1f}
.nspy{display:inline-block;width:var(--s);height:var(--s);border-radius:calc(var(--s)*.12);background:linear-gradient(160deg,#9a7a4a,#4f3a1c);
  box-shadow:0 0 0 calc(var(--s)*.07) #2a1808 inset;position:relative;vertical-align:middle;flex:none}
.nspy::after{content:"";position:absolute;left:16%;right:16%;top:42%;height:22%;border-radius:999px;transform:rotate(-38deg);
  background:linear-gradient(90deg,#f2d08a 0 55%,#c99a45 55% 70%,#f2d08a 70%)}
.nspy.on{background:linear-gradient(160deg,#a7c46a,#4d6f22)}
.nc .nc-max{font:900 6cqw/1 system-ui,sans-serif;background:#f3ecdc;color:#2b2216;border:.5cqw solid #6b5a3e;border-radius:1.4cqw;padding:.6cqw 1.2cqw;margin-right:1.5cqw}
.nc .nc-set{position:absolute;right:9%;top:23.5%;font:900 6cqw/1 system-ui;color:#2b2216;background:rgba(243,235,215,.85);border-radius:1cqw;padding:.4cqw 1cqw}
.ndy{position:relative;width:100%;aspect-ratio:693/1071;container-type:inline-size;border-radius:6%/4%;overflow:hidden;user-select:none;
  background:#2a4f8f;font-family:"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif;color:#2b2216}
.ndy.turm{background:#8f2a2a}
.ndy>.in{position:absolute;inset:3.2%;border-radius:4%/2.6%;background:linear-gradient(170deg,#f2e8cf,#e6d6b0);display:flex;flex-direction:column;align-items:center;
  padding:6cqw 6cqw;gap:3cqw;text-align:center}
.ndy .dy-era{font:700 5cqw/1.1 system-ui,sans-serif;color:#6b5a3e}
.ndy .dy-name{font-weight:700;font-size:10cqw;line-height:1;border-bottom:.5cqw solid #b9a57c;padding-bottom:3cqw;width:100%}
.ndy .dy-name.long{font-size:8cqw}
.ndy .dy-txt{flex:1;display:flex;align-items:center;justify-content:center;font:700 7.6cqw/1.15 system-ui,sans-serif;color:#2b2216}
.ndy .dy-txt.m{font-size:6.6cqw}
.ndy .dy-txt.l{font-size:5.8cqw}
.ndy .dy-foot{font:900 5cqw/1 system-ui;color:#6b5a3e}
.ndy.used{filter:grayscale(.7) brightness(.85)}
.nchip{display:inline-flex;align-items:center;gap:.35em;padding:.05em .45em .05em .3em;border-radius:.45em;background:#efe6d2;color:#2b2216;
  border:1px solid rgba(0,0,0,.25);font-weight:700;white-space:nowrap;vertical-align:middle;line-height:1.25}
.nchip i{width:.62em;height:.62em;border-radius:2px;flex:none}
`;
  function css() { return '<style id="nationsArtCss">' + CSS + '</style>'; }
  function install(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.getElementById('nationsArtCss')) return;
    doc.head.insertAdjacentHTML('beforeend', css());
  }

  /* ---------------- icons ---------------- */
  const LAUREL = (fill, ring) => '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="' + fill + '" stroke="' + ring + '" stroke-width="2"/>' +
    [0, 1].map(side => {
      const sx = side ? -1 : 1;
      return '<g transform="translate(20 20) scale(' + sx + ' 1)">' + [0, 1, 2, 3, 4].map(k => {
        const a = (200 + k * 32) * Math.PI / 180;
        const x = Math.cos(a) * 16, y = Math.sin(a) * -16;
        return '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="2.2" ry="4.4" fill="#7fa82c" stroke="#3f5a10" stroke-width=".8" transform="rotate(' + (-(200 + k * 32) + 90) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
      }).join('') + '</g>';
    }).join('') + '</svg>';
  const VP_POS = LAUREL('#f4cf34', '#b58a12');
  const VP_NEG = LAUREL('#1c1c1c', '#555');
  function vp(n, px, neg) {
    return '<span class="nvp' + (neg ? ' neg' : '') + '" style="--s:' + px + '">' + (neg ? VP_NEG : VP_POS) + (n == null ? '' : '<b>' + esc(n) + '</b>') + '</span>';
  }
  const unit = px => typeof px === 'number' ? px + 'px' : px;
  function res(k, px, hex) {
    if (k === 'vp') return vp(null, unit(px));
    if (k === 'worker') return '<i class="ni ni-worker" style="--s:' + unit(px) + (hex ? ';color:' + esc(hex) : '') + '"></i>';
    return '<i class="ni" style="--s:' + unit(px) + ';background-image:url(' + TPL + (ICON[k] || k) + '.png)"></i>';
  }
  /* A number on a red (gain) or black (cost) disc — a square for stability
     and strength, as the printed cards have it. */
  function tok(k, n, px, neg) {
    if (k === 'vp') return vp(n, unit(px), neg || n < 0);
    const sq = k === 'stab' || k === 'str';
    const bad = neg != null ? neg : n < 0;
    return '<span class="nt' + (sq ? ' sq' : '') + (bad ? ' neg' : '') + '" style="--s:' + unit(px) + '"><span class="nt-n">' + esc(bad ? -Math.abs(n) : n) + '</span>' +
      '<span class="nt-i" style="background-image:url(' + TPL + ICON[k] + '.png)"></span></span>';
  }
  function arch(px, on) { return '<span class="narch' + (on ? ' on' : '') + '" style="--s:' + unit(px) + '"></span>'; }
  const picUrl = id => BASE + 'art/cards/' + id + '.webp?v=' + ART_VER;

  /* The tokens a card's production row shows, in the printed order. */
  function prodToks(prod, px, negOnly) {
    const out = [];
    for (const k of ['str', 'gold', 'stone', 'food', 'book', 'stab']) {
      const v = prod[k];
      if (!v) continue;
      out.push(tok(k, v, px));
    }
    return out.join('');
  }
  function nameClass(name) { return name.length > 17 ? ' xlong' : name.length > 12 ? ' long' : ''; }

  /* ================================================================
     A progress card face.
     opts: { w: workers on it, hex: their colour, built: wonder sections
     done, small: hide the words, dim: grey it }
     ================================================================ */
  function card(id, opts) {
    opts = opts || {};
    const c = C(id);
    if (!c) return '<div class="nc"></div>';
    if (c.type === 'dynasty') return dynasty(id, opts);
    const bm = c.type === 'building' || c.type === 'military';
    const tpl = TPL + TEMPLATE[c.type] + '.png';
    const age = c.age ? D.ROMAN[c.age] : '';
    const typeLine = TYPE_NAME[c.type] + (age ? ' · ' + age : '') + (c.set === 'adv' ? ' · A' : c.set === 'exp' ? ' · E' : c.set === 'dyn' ? ' · D' : c.set === 'promo' ? ' · promo' : '');
    const parts = [];
    const pic = c.img ? '<div class="nc-pic" style="top:' + (bm ? '38.3%' : '22.5%') + ';height:43.1%;background-image:url(' + picUrl(c.id) + ')"></div>'
      : '<div class="nc-pic" style="top:' + (bm ? '38.3%' : '22.5%') + ';height:43.1%"></div>';
    parts.push(pic);
    if (bm) {
      /* Production across the top, the name under it. */
      const top = c.type === 'building' ? prodToks(c.prod, '14cqw') :
        (c.str ? tok('str', c.str, '14cqw') : '') + Object.keys(c.up).map(k => tok(k, -c.up[k], '14cqw', c.up[k] > 0)).join('');
      parts.push('<div class="nc-top">' + top + '</div>');
      parts.push('<div class="nc-name' + nameClass(c.name) + '" style="top:26%;height:8.5%">' + esc(c.name) + '</div>');
      if (c.type === 'military') parts.push('<div class="nc-raid">' + raidTok(c.raid, '11cqw') + '</div>');
      /* VP per worker over the picture's foot, the workers under it. */
      const w = opts.w || 0;
      parts.push('<div class="nc-vps" style="right:15%;top:73.5%">' + c.vp.map(v => vp(v, '10.5cqw')).join('') + '</div>');
      parts.push('<div style="left:9%;top:85.5%">' + tok('stone', -c.dep, '10cqw', true) + '</div>');
      const slots = Math.max(c.vp.length, w);
      parts.push('<div class="nc-wk" style="right:12%;top:86%;align-items:center">' + (c.max ? '<span class="nc-max">MAX</span>' : '') + Array.from({ length: c.max ? Math.max(c.max, w) : slots }, (x, k) =>
        res('worker', '8.5cqw', k < w ? (opts.hex || '#222') : 'rgba(0,0,0,.72)').replace('class="ni ni-worker"', 'class="ni ni-worker' + (k < w ? '' : ' nc-dim') + '"')).join('') +
        (w > c.vp.length ? '' : '') + '</div>');
      if (w) parts.push('<div style="left:9%;top:74%;font:900 11cqw/1 system-ui;color:' + esc(opts.hex || '#222') + ';text-shadow:0 0 1cqw #fff,0 0 2cqw #fff">×' + w + '</div>');
    } else {
      parts.push('<div class="nc-type">' + esc(typeLine) + '</div>');
      parts.push('<div class="nc-name' + nameClass(c.name) + '" style="top:10.6%;height:8.8%">' + esc(c.name) + '</div>');
      const low = [];
      switch (c.type) {
        case 'colony':
          parts.push('<div style="right:16%;top:57.5%">' + vp(c.vp, '11cqw') + '</div>');
          if (c.req) low.push('<div class="nc-row">' + res('str', '11cqw') + '<span style="font:900 9cqw/1 system-ui">≥ ' + c.req + '</span></div>');
          if (prodToks(c.prod, '13cqw')) low.push('<div class="nc-row">' + prodToks(c.prod, '13cqw') + '</div>');
          if (c.text) low.push('<div class="nc-txt">' + esc(c.text) + '</div>');
          break;
        case 'war':
          parts.push('<div style="right:16%;top:57.5%">' + vp(-1, '11cqw', true) + '</div>');
          low.push('<div class="nc-row">' + Object.keys(c.loss).map(k => tok(k, -c.loss[k], '16cqw', true)).join('') + '</div>');
          low.push('<div class="nc-txt">If you are weaker than this War: lose it, less your stability, and 1 VP</div>');
          break;
        case 'battle':
          low.push('<div class="nc-row">' + res('book', '16cqw') + '<b>/</b>' + res('food', '16cqw') + '<b>/</b>' + res('stone', '16cqw') + '</div>');
          low.push('<div class="nc-row"><span class="nc-txt">× your</span>' + raidTok('?', '9cqw') + '</div>');
          break;
        case 'golden':
          if (c.alt) {
            low.push('<div class="nc-txt">' + esc(c.text) + '</div>');
            low.push('<div class="nc-row"><span class="nc-txt">or −' + c.vpCost + ' resources:</span>' + vp('+1', '10cqw') + '</div>');
            break;
          }
          low.push('<div class="nc-row"><span style="font:900 9cqw/1 system-ui">+2</span>' + res(c.res, '13cqw') +
            '<span style="font:300 16cqw/1 system-ui;color:#6b5a3e">/</span><span class="nc-txt">−' + c.age + ' resource' + (c.age > 1 ? 's' : '') + ':</span>' + vp('+1', '10cqw') + '</div>');
          break;
        case 'natural': {
          parts.push('<div style="right:16%;top:57.5%">' + vp(c.vp, '11cqw', c.vp < 0) + '</div>');
          const seen = opts.built || 0;
          if (c.spy) parts.push('<div class="nc-sec" style="left:16%;top:59%">' + Array.from({ length: c.spy }, (x, k) => spy('9.5cqw', k < seen)).join('') + '</div>');
          const pr = prodToks(c.prod, '11cqw');
          if (pr) low.push('<div class="nc-row">' + pr + '</div>');
          if (c.text) low.push('<div class="nc-txt">' + esc(c.text) + '</div>');
          break;
        }
        case 'wonder': {
          parts.push('<div style="right:16%;top:57.5%">' + vp(c.vp, '11cqw', c.vp < 0) + '</div>');
          const built = opts.built || 0;
          parts.push('<div class="nc-sec" style="left:16%;top:58.5%">' + c.cost.map((s, k) =>
            '<span>' + arch('9.5cqw', k < built) + tok('stone', -s, '9cqw', true) + '</span>').join('') + '</div>');
          const pr = prodToks(c.prod, '11cqw');
          if (pr) low.push('<div class="nc-row">' + pr + '</div>');
          if (c.text) low.push('<div class="nc-txt">' + esc(c.text) + '</div>');
          break;
        }
        case 'advisor': {
          if (c.text) low.push('<div class="nc-txt">' + esc(c.text) + '</div>');
          const pr = prodToks(c.prod, '12cqw');
          if (pr) low.push('<div class="nc-row">' + pr + '</div>');
          break;
        }
      }
      if ((c.type === 'advisor' || c.type === 'wonder' || c.type === 'natural' || c.alt || (c.type === 'colony' && c.text)) && c.text) {
        const n = c.text.length;
        const won = c.type === 'wonder' || c.type === 'natural';
        parts.push('<div class="nc-sum' + (won ? ' won' : '') + (n > 70 ? ' l xl' : n > 52 ? ' l' : n > 32 ? ' m' : '') + '">' + esc(c.text) + '</div>');
      }
      const lowTop = c.type === 'wonder' || c.type === 'natural' ? 74 : 67.5;
      parts.push('<div class="nc-low" style="top:' + lowTop + '%;bottom:6%">' + low.join('') + '</div>');
    }
    const cls = 'nc' + (opts.small ? ' nc-small' : '') + (opts.cls ? ' ' + opts.cls : '');
    return '<div class="' + cls + '" data-cid="' + esc(id) + '" style="background-image:url(' + tpl + ')' + (opts.dim ? ';filter:grayscale(.8) brightness(.8)' : '') + '">' + parts.join('') + '</div>';
  }
  function spy(px, on) { return '<span class="nspy' + (on ? ' on' : '') + '" style="--s:' + unit(px) + '"></span>'; }
  /* A dynasty card, or a Turmoil card ('turmoil'). Drawn whole: the printed
     cards are words on parchment. */
  function dynasty(id, opts) {
    opts = opts || {};
    if (id === 'turmoil') return '<div class="ndy turm"><div class="in"><div class="dy-name">Turmoil</div>' +
      '<div class="dy-txt">Play a dynasty, or take 2 gold</div><div>' + tok('stab', -2, '16cqw', true) + '</div><div class="dy-era">back at the end of the round</div><div class="dy-foot">D</div></div></div>';
    const d = D.dynasty(id);
    if (!d) return '<div class="ndy"></div>';
    const nat = D.NATIONS.find(n => n.id === d.nation);
    const n = d.text.length;
    return '<div class="ndy' + (opts.used ? ' used' : '') + '" data-dyn="' + esc(id) + '"><div class="in"><div class="dy-era">' + esc(nat ? nat.name : '') + '</div>' +
      '<div class="dy-name' + (d.name.length > 16 ? ' long' : '') + '">' + esc(d.name) + '</div>' +
      '<div class="dy-txt' + (n > 90 ? ' l' : n > 55 ? ' m' : '') + '">' + esc(d.text) + '</div><div class="dy-foot">D</div></div></div>';
  }
  const boardUrl = nation => BASE + 'art/boards/' + nation + '.webp?v=' + ART_VER;
  function raidTok(n, px) {
    return '<span style="position:relative;display:inline-flex;width:' + px + ';height:' + px + ';background:url(' + TPL + 'raid.png) center/contain no-repeat;align-items:center;justify-content:center">' +
      '<b style="font:900 calc(' + px + '*.5)/1 system-ui;color:#fff;margin-top:12%">' + esc(n) + '</b></span>';
  }

  /* An event card: architects and famine across the top, two events. */
  function event(id) {
    const e = D.event(id);
    if (!e) return '<div class="nev"></div>';
    /* Name band and text box, as fractions of the template (measured). */
    const box = (x, nameTop, txtTop, txtBot) => '<div class="ev-name" style="top:' + nameTop + '%;height:7.5%' + (x.name.length > 20 ? ';font-size:7cqw' : '') + '">' + esc(x.name) + '</div>' +
      '<div class="ev-txt" style="top:' + txtTop + '%;bottom:' + (100 - txtBot) + '%">' + esc(x.text) + '</div>';
    return '<div class="nev" data-event="' + esc(id) + '">' +
      '<div class="ev-arch">' + Array.from({ length: e.arch }, () => arch('11cqw')).join('') + '</div>' +
      '<div class="ev-fam">' + (e.famine ? '−' + e.famine : '0') + '</div>' +
      (e.b ? box(e.a, 24.2, 32.5, 52) + box(e.b, 61.4, 69.8, 91) : box(e.a, 24.2, 32.5, 91)) + '</div>';
  }

  /* A name in a line of text, with its type's colour. */
  function chip(id) {
    const c = C(id);
    if (!c) return '';
    return '<span class="nchip"><i style="background:' + TYPE_HEX[c.type] + '"></i>' + esc(c.name) + '</span>';
  }

  /* What a card does, in one line of words (the phone's list, the log). */
  function summary(id) {
    const c = C(id);
    if (!c) return '';
    const f = o => Object.keys(o || {}).filter(k => o[k]).map(k => (o[k] > 0 ? '+' : '−') + Math.abs(o[k]) + ' ' + RES_NAME[k]).join(', ');
    switch (c.type) {
      case 'building': return 'Each worker: ' + f(c.prod) + ' · ' + c.dep + ' stone to deploy' + (c.max ? ' · at most ' + c.max + ' worker' + (c.max > 1 ? 's' : '') : '') + (c.text ? ' · ' + c.text : '');
      case 'military': return 'Each worker: ' + (c.str ? '+' + c.str + ' strength' : 'no strength') + (Object.keys(c.up).length ? ', ' + f(Object.fromEntries(Object.entries(c.up).map(([k, v]) => [k, -v]))) : '') + ' · raid ' + c.raid + ' · ' + c.dep + ' stone' + (c.max ? ' · at most ' + c.max : '') + (c.text ? ' · ' + c.text : '');
      case 'colony': return (c.req ? 'Needs strength ' + c.req : 'Printed on your board') + (f(c.prod) ? ' · ' + f(c.prod) : '') + (c.vp ? ' · ' + c.vp + ' VP' : '') + (c.text ? ' · ' + c.text : '');
      case 'natural': return 'Natural Wonder: ' + c.spy + ' explore action' + (c.spy > 1 ? 's' : '') + ' to discover' + (f(c.prod) ? ' · ' + f(c.prod) : '') + (c.vp ? ' · ' + c.vp + ' VP' : '') + (c.text ? ' · ' + c.text : '');
      case 'dynasty': return c.text;
      case 'war': return 'The weaker lose ' + f(Object.fromEntries(Object.entries(c.loss).map(([k, v]) => [k, -v]))) + ' and 1 VP';
      case 'battle': return 'Your raid value in books, food or stone';
      case 'golden': return c.alt ? c.text + ' — or pay ' + c.vpCost + ' resources for 1 VP' : '+2 ' + RES_NAME[c.res] + ', or pay ' + c.age + ' resource' + (c.age > 1 ? 's' : '') + ' for 1 VP';
      case 'wonder': return (c.cost.length ? c.cost.length + ' sections (' + c.cost.join('/') + ' stone)' : 'Printed on your board') + (f(c.prod) ? ' · ' + f(c.prod) : '') + (c.vp ? ' · ' + c.vp + ' VP' : '') + (c.text ? ' · ' + c.text : '');
      case 'advisor': return (f(c.prod) ? f(c.prod) : '') + (c.text ? (f(c.prod) ? ' · ' : '') + c.text : '');
    }
    return '';
  }

  const Art = { VERSION, ART_VER, esc, css, install, card, event, chip, summary, tok, res, vp, arch, spy, dynasty, boardUrl, raidTok, TYPE_HEX, TYPE_NAME, RES_NAME, picUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  else root.NationsArt = Art;
})(typeof window !== 'undefined' ? window : globalThis);
