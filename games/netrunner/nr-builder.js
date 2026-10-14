'use strict';
/* Android: Netrunner — the deck builder, on the phone.
 *
 * Decks live on the phone (localStorage via `o.store`), never on the server:
 * a deck is the player's own business until they choose it for a game, and
 * then only its name and identity are shown to the room. The rules are
 * nr-data.js's — `checkDeck`, `cardBad`, `deckStats` — the same functions the
 * host uses to accept a deck, so the builder never offers a deck the game would
 * refuse.
 *
 *   const B = NrBuilder.create({ store, pool: () => 'one'|'three', side: () => 'corp'|'runner'|null,
 *                                use(deck|null), close(), zoom(cardId), flash(text) })
 *   B.html()  the screen;  B.wire(root)  its buttons
 */
(function (root) {
  const D = root.NrData, A = root.NrArt;
  const CARD = D.CARDS;
  const VERSION = 1;
  const KEY = 'nr.decks.v1';
  const esc = A.esc;
  const TYPES = { corp: ['agenda', 'ice', 'asset', 'upgrade', 'operation'], runner: ['program', 'hardware', 'resource', 'event'] };
  const TYPE_NAME = { agenda: 'Agendas', ice: 'Ice', asset: 'Assets', upgrade: 'Upgrades', operation: 'Operations', program: 'Programs', hardware: 'Hardware', resource: 'Resources', event: 'Events' };

  function create(o) {
    const B = { view: 'list', edit: null, filter: 'all', armed: null, newSide: null };
    const load = () => { try { const v = JSON.parse(o.store.get(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    const save = list => o.store.set(KEY, JSON.stringify(list));
    const uid = () => 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const facOf = d => CARD[d.ident].fac;
    const sideOf = d => CARD[d.ident].side;

    /* ---------------- the list ---------------- */
    function listHtml() {
      const list = load();
      const want = o.side();
      const pool = o.pool(), sets = o.sets ? o.sets() : 'core';
      let out = '<div class="card"><div class="title">Your decks</div><div class="sub">Kept on this phone. ' +
        (want ? 'You are playing the ' + (want === 'corp' ? 'Corp' : 'Runner') + ' — choose a ' + (want === 'corp' ? 'Corp' : 'Runner') + ' deck, or keep the starter. ' : '') +
        'The card pool is ' + (pool === 'one' ? 'one Core Set (no more of a card than the box holds)' : 'three Core Sets (up to three of anything)') + (D.setList(sets).length > 1 ? ', with ' + D.setList(sets).slice(1).map(c => (D.PRODUCTS.find(p => p.code === c) || {}).short || c).join(', ') + ' (their deck limits)' : ', Core Set cards only') + '.</div></div>';
      if (!list.length) out += '<div class="card"><div class="sub">No decks yet. Start from a starter deck, or from an empty one.</div></div>';
      for (const d of list) {
        const st = D.deckStats(d), bad = D.checkDeck(d, pool, sets);
        const fit = !want || sideOf(d) === want;
        out += '<div class="deckrow" style="--f:' + D.FACTIONS[facOf(d)].hex + '"><div class="dr-h"><b>' + esc(d.name) + '</b><span>' + esc(CARD[d.ident].name) + ' · ' + st.n + ' cards' + (sideOf(d) === 'corp' ? ' · ' + st.pts + ' points' : '') + ' · ' + st.inf + '/' + st.limit + ' influence</span>' +
          (bad.length ? '<span class="why">' + esc(bad[0]) + (bad.length > 1 ? ' (and ' + (bad.length - 1) + ' more)' : '') + '</span>' : '<span class="okd">Legal</span>') + '</div>' +
          '<div class="dr-b">' + (o.use && fit ? '<button class="btn small" data-duse="' + esc(d.id) + '"' + (bad.length ? ' disabled' : '') + '>Use it</button>' : '') +
          '<button class="btn ghost small" data-dedit="' + esc(d.id) + '">Edit</button><button class="btn ghost small" data-dcopy="' + esc(d.id) + '">Copy</button>' +
          '<button class="btn ghost small" data-ddel="' + esc(d.id) + '">' + (B.armed === d.id ? 'Tap again to delete' : 'Delete') + '</button></div></div>';
      }
      const facBtns = (side, attr) => (side === 'corp' ? D.CORPS : D.RUNNERS).map(f => '<button class="facb" style="--f:' + D.FACTIONS[f].hex + '" data-' + attr + '="' + f + '"><b>' + esc(D.FACTIONS[f].short) + '</b><small>' + esc(CARD[D.IDENTITY[f]].name) + '</small></button>').join('');
      const sides = want ? [want] : ['corp', 'runner'];
      out += '<h2>Start from a starter deck</h2>' + sides.map(sd => '<div class="facs">' + facBtns(sd, 'dstart') + '</div>').join('');
      const idBtns = side => D.identities(sets).filter(k => CARD[k].side === side).map(k => '<button class="facb" style="--f:' + D.FACTIONS[CARD[k].fac].hex + '" data-dnew="' + k + '"><b>' + esc(CARD[k].corpName || CARD[k].name) + '</b><small>' + esc(CARD[k].corpName ? CARD[k].name : CARD[k].title || '') + (CARD[k].set !== 'core' ? ' · ' + ((D.PRODUCTS.find(p => p.code === CARD[k].set) || {}).short || '') : '') + '</small></button>').join('');
      out += '<h2>Start from an empty deck — choose an identity</h2>' + sides.map(sd => '<div class="facs">' + idBtns(sd) + '</div>').join('');
      if (o.use) out += '<button class="btn ghost" id="dStarter">Play with the starter deck instead</button>';
      o.bar(o.close ? '<button class="btn" id="dClose">Back</button>' : '');
      return out;
    }

    /* ---------------- the editor ---------------- */
    function editHtml() {
      const d = B.edit, pool = o.pool(), sets = o.sets ? o.sets() : 'core';
      const id = CARD[d.ident], st = D.deckStats(d), bad = D.checkDeck(d, pool, sets);
      const side = id.side;
      let out = '<div class="card mine"><div class="namein"><input id="dName" maxlength="30" value="' + esc(d.name) + '" autocomplete="off"></div>' +
        '<div class="sub"><b style="color:' + D.FACTIONS[id.fac].hex + '">' + esc(id.name) + '</b> · ' + esc(id.text) + '</div>' +
        '<div class="dstats"><span class="' + (st.n < st.min ? 'bad' : 'good') + '"><b>' + st.n + '</b> cards<small>at least ' + st.min + '</small></span>' +
        '<span class="' + (st.inf > st.limit ? 'bad' : 'good') + '"><b>' + st.inf + '/' + st.limit + '</b> influence<small>other factions’ cards</small></span>' +
        (side === 'corp' ? '<span class="' + (st.pts < st.range[0] || st.pts > st.range[1] ? 'bad' : 'good') + '"><b>' + st.pts + '</b> agenda points<small>needs ' + st.range[0] + ' or ' + st.range[1] + '</small></span>' : '') + '</div>' +
        (bad.length ? '<div class="dbad">' + bad.slice(0, 4).map(x => '<div>' + esc(x) + '</div>').join('') + '</div>' : '<div class="okd">A legal deck.</div>') + '</div>';
      const chip = (k, l) => '<button class="chipb' + (B.filter === k ? ' on' : '') + '" data-dfil="' + k + '">' + l + '</button>';
      out += '<div class="chips dfil">' + chip('all', 'All') + chip('in', 'In the deck') + TYPES[side].map(t => chip(t, TYPE_NAME[t])).join('') + chip('fac', D.FACTIONS[id.fac].short) + chip('neutral', 'Neutral') + chip('other', 'Other factions') + '</div>';
      const cards = Object.values(CARD).filter(c => c.side === side && c.type !== 'identity' && D.inSets(c.id, sets)).filter(c => {
        const f = B.filter;
        if (f === 'all') return true;
        if (f === 'in') return (d.cards[c.id] | 0) > 0;
        if (f === 'fac') return c.fac === id.fac;
        if (f === 'neutral') return c.fac === 'neutral';
        if (f === 'other') return c.fac !== id.fac && c.fac !== 'neutral';
        return c.type === f;
      }).sort((a, b) => TYPES[side].indexOf(a.type) - TYPES[side].indexOf(b.type) || (a.fac === id.fac ? 0 : a.fac === 'neutral' ? 1 : 2) - (b.fac === id.fac ? 0 : b.fac === 'neutral' ? 1 : 2) || a.name.localeCompare(b.name));
      let lastType = null;
      out += '<div class="dlist">';
      for (const c of cards) {
        if (c.type !== lastType) { lastType = c.type; out += '<h2>' + TYPE_NAME[c.type] + '</h2>'; }
        const m = d.cards[c.id] | 0;
        const more = D.cardBad(d, c.id, pool, sets);
        const out1 = c.fac !== id.fac && c.inf ? '<i class="pips">' + '●'.repeat(c.inf) + '</i>' : '';
        const nums = c.type === 'agenda' ? c.adv + '/' + c.pts : c.type === 'ice' ? c.cost + ' · str ' + c.str : (c.cost != null ? c.cost + ' cr' : '');
        out += '<div class="dcard' + (m ? ' in' : '') + '" style="--f:' + D.FACTIONS[c.fac].hex + '">' +
          '<button class="dc-n" data-zoom="' + esc(c.id) + '"><b>' + esc(c.name) + '</b><small>' + esc(nums) + ' · ' + esc(D.FACTIONS[c.fac].short) + (c.set !== 'core' ? ' · ' + ((D.PRODUCTS.find(p => p.code === c.set) || {}).short || c.set) : '') + ' · ' + D.maxCopies(c.id, pool) + ' allowed</small>' + out1 + '</button>' +
          '<button class="dc-b" data-dminus="' + esc(c.id) + '"' + (m ? '' : ' disabled') + '>−</button><span class="dc-m">' + m + '</span>' +
          '<button class="dc-b" data-dplus="' + esc(c.id) + '"' + (more ? ' disabled title="' + esc(more) + '"' : '') + '>+</button>' +
          (more && m < 3 && B.filter !== 'in' && !/copies|in the box/.test(more) ? '<span class="dc-why">' + esc(more) + '</span>' : '') + '</div>';
      }
      out += '</div>';
      o.bar('<div class="dbar"><button class="btn ghost" id="dCancel">Back</button><button class="btn" id="dSave">Save</button></div>');
      return out;
    }

    function html() { return B.view === 'edit' && B.edit ? editHtml() : listHtml(); }
    function storeEdit() {
      const list = load();
      const i = list.findIndex(x => x.id === B.edit.id);
      if (i >= 0) list[i] = B.edit; else list.unshift(B.edit);
      save(list);
    }
    function wire(scope, repaint) {
      const on = (sel, fn) => scope.querySelectorAll(sel).forEach(x => { x.onclick = ev => { if (ev && ev.stopPropagation) ev.stopPropagation(); fn(x); }; });
      const list = load();
      const find = id => list.find(x => x.id === id);
      on('[data-duse]', x => { const d = find(x.dataset.duse); if (d && o.use) o.use({ ident: d.ident, cards: d.cards, name: d.name, side: sideOf(d) }); });
      on('[data-dedit]', x => { B.edit = JSON.parse(JSON.stringify(find(x.dataset.dedit))); B.view = 'edit'; B.filter = 'in'; repaint(); });
      on('[data-dcopy]', x => { const d = JSON.parse(JSON.stringify(find(x.dataset.dcopy))); d.id = uid(); d.name = (d.name + ' (copy)').slice(0, 30); list.unshift(d); save(list); repaint(); });
      on('[data-ddel]', x => { const id = x.dataset.ddel; if (B.armed !== id) { B.armed = id; repaint(); return; } save(list.filter(d => d.id !== id)); B.armed = null; repaint(); });
      on('[data-dstart]', x => { const s = D.starterDeck(x.dataset.dstart); B.edit = Object.assign(s, { id: uid(), name: D.FACTIONS[x.dataset.dstart].short + ' deck' }); B.view = 'edit'; B.filter = 'all'; repaint(); });
      on('[data-dnew]', x => { const k = x.dataset.dnew, c = CARD[k]; B.edit = { id: uid(), side: c.side, ident: k, cards: {}, name: 'New ' + (c.corpName ? c.name : c.name.split(' ')[0]) + ' deck' }; B.view = 'edit'; B.filter = 'fac'; repaint(); });
      on('#dStarter', () => { if (o.use) o.use(null); });
      on('#dClose', () => { if (o.close) o.close(); });
      on('[data-dfil]', x => { B.filter = x.dataset.dfil; repaint(); });
      on('[data-dplus]', x => { const k = x.dataset.dplus; if (D.cardBad(B.edit, k, o.pool(), o.sets ? o.sets() : 'core')) return; B.edit.cards[k] = (B.edit.cards[k] | 0) + 1; repaint(true); });
      on('[data-dminus]', x => { const k = x.dataset.dminus; const m = (B.edit.cards[k] | 0) - 1; if (m <= 0) delete B.edit.cards[k]; else B.edit.cards[k] = m; repaint(true); });
      on('#dCancel', () => { B.view = 'list'; B.edit = null; repaint(); });
      on('#dSave', () => { const n = scope.querySelector('#dName'); if (n) B.edit.name = n.value.trim().slice(0, 30) || 'My deck'; storeEdit(); if (o.flash) o.flash('Saved “' + B.edit.name + '”.', 'good'); B.view = 'list'; B.edit = null; repaint(); });
      const nm = scope.querySelector('#dName');
      if (nm) nm.oninput = () => { B.edit.name = nm.value.slice(0, 30); };
      scope.querySelectorAll('[data-zoom]').forEach(x => { x.onclick = ev => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (o.zoom) o.zoom(x.dataset.zoom); }; });
    }
    B.html = html; B.wire = wire; B.load = load; B.save = save;
    return B;
  }

  const STYLES = `
.deckrow{border:1px solid var(--line);border-left:4px solid var(--f);border-radius:12px;padding:9px 10px;margin-top:8px;background:var(--panel)}
.dr-h{display:flex;flex-direction:column;gap:2px}
.dr-h b{font-size:16px}
.dr-h span{font-size:12px;color:var(--dim)}
.dr-b{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.dr-b .btn{width:auto;flex:1;min-width:30%;margin-top:0}
.okd{color:var(--good);font-size:12px;font-weight:800}
.facs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.facb{display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;background:var(--panel2);border:1px solid var(--f);color:var(--ink);border-radius:12px;padding:8px 10px;min-width:0}
.facb b{color:var(--f)}
.facb small{color:var(--dim);font-size:11px}
.namein{display:flex;gap:8px}
.namein input{flex:1;min-width:0;font:inherit;font-weight:800;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:9px}
.dstats{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.dstats span{flex:1;min-width:28%;display:flex;flex-direction:column;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:6px 4px;font-size:12px}
.dstats b{font-size:20px}
.dstats small{color:var(--dim);font-size:10px}
.dstats .bad b{color:var(--bad)} .dstats .good b{color:var(--good)}
.dbad{margin-top:8px;color:#ffab9a;font-size:12.5px}
.dfil{position:sticky;top:88px;z-index:3;background:var(--bg);padding:6px 0;margin-top:6px;flex-wrap:nowrap;overflow-x:auto}
.dfil .chipb{flex:none}
.dfil .chipb{border:1px solid var(--line);border-radius:999px;padding:5px 10px;background:var(--panel2);font-size:12.5px}
.dfil .chipb.on{background:var(--hi);color:#04121c;border-color:var(--hi);font-weight:800}
.dlist{display:flex;flex-direction:column;gap:5px}
.dcard{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-left:4px solid var(--f);border-radius:10px;padding:5px 6px;background:var(--panel);flex-wrap:wrap}
.dcard.in{background:color-mix(in srgb,var(--f) 14%,var(--panel))}
.dc-n{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:1px;background:none;border:0;color:var(--ink);text-align:left;padding:2px}
.dc-n b{font-size:14px}
.dc-n small{color:var(--dim);font-size:11px}
.pips{font-style:normal;color:var(--f);font-size:10px;letter-spacing:1px}
.dc-b{width:38px;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font-size:20px;font-weight:900;flex:none}
.dc-b:disabled{opacity:.3}
.dc-m{width:22px;text-align:center;font-weight:900;font-size:17px;flex:none}
.dc-why{flex-basis:100%;font-size:11px;color:#ffab9a;padding-left:4px}
.dbar{display:flex;gap:8px}
.dbar .btn{margin-top:0}
.mydeck{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:12px;padding:8px 10px;margin-top:8px;background:var(--panel2)}
.mydeck div{flex:1;min-width:0}
.mydeck b{display:block}
.mydeck small{color:var(--dim)}
.mydeck .btn{width:auto;margin-top:0;padding:9px 14px}
`;
  root.NrBuilder = { VERSION, create, STYLES, KEY };
})(typeof window !== 'undefined' ? window : this);
