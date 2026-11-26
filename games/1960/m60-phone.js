'use strict';
/* 1960: The Making of the President — the handset. All of it, with no
 * networking of its own: controller.html gives it a socket to the hub,
 * solo.html gives it the in-page host (LESSONS-CHECKLIST F1). It paints from
 * two messages — {t:'m60'} (the public table) and {t:'m60-me'} (this seat's
 * half: the hand, the turn menu, the cards kept back, a hand shown to it) —
 * and sends orders back with `send`.
 *
 * Tabs: Play (the gauges, the house's newest move, the question, since your
 * last turn, the campaign in brief, your hand) and Map (the printed map, the
 * whole country and one region at a time, for when there is no telly).
 * NEVER-HIDE LIST (F, 360x500): the question and its buttons; the electoral
 * votes, the turn and momentum; the card you are deciding about. The phone
 * never offers what the engine would refuse: the turn menu comes from the
 * engine, a greyed button says why. Campaigning and placing support are the
 * map itself: every state on offer is a button over its own box.
 */
(function (root) {
  const D = root.M60Data, A = root.M60Art, W = root.M60Words;
  const VERSION = 1;
  const esc = A.esc;
  const SN = s => (s ? D.SIDE[s].name : 'nobody');
  /* Phones synthesise a click ~300ms after a touch. Everything is inert for
     this long after a send and after the screen changes shape. */
  const LOCK_MS = 450;
  const SKINS = { paper: 'Front Page', tv: 'Broadcast' };
  const SKIN_KEY = 'm60.skin';
  /* The map one region at a time, each state box at least ~50 px (a region
     wider than the phone scrolls sideways). Alaska and Hawaii sit in the West. */
  const VIEWS = [['W', 'West'], ['MW', 'Midwest'], ['S', 'South'], ['E', 'East']];
  const VBOX = {};
  function viewBox(v) {
    if (VBOX[v]) return VBOX[v];
    const bs = D.STATES.filter(s => D.STATE[s].reg === v).map(s => D.STATE[s].box);
    const x = Math.min(...bs.map(b => b[0])) - 60, y = Math.min(...bs.map(b => b[1])) - 60;
    const w = Math.max(...bs.map(b => b[2])) + 60 - x, h = Math.max(...bs.map(b => b[3])) + 60 - y;
    const k = Math.max(0.22, Math.min(0.3, 370 / w, 400 / h));
    return (VBOX[v] = { x, y, w, h, k, W: Math.round(w * k), H: Math.round(h * k) });
  }
  /* The whole country, small: who leads where at a glance. */
  const OVK = 366 / D.MAP_W;
  const CUBE_MS = { slow: 650, relaxed: 480, brisk: 300 };

  function create(o) {
    const S = {
      id: null, name: '', hex: '#f1c75b',
      pub: null, me: null, undo: null, coach: null,
      sel: null,          // the hand card being looked at (a card id, or 'cand')
      pre: false,         // preempt the event of the card being played
      multi: [], amap: {}, sinceAll: false, lockUntil: 0, shape: '', myTurn: false, finStage: '',
      tab: 'play', solo: !!o.solo,
      view: null,         // the region on the map (placing, or looking)
      alist: false,       // the states as a list instead of the map
      sx: {},             // how far each region view is scrolled sideways
      skin: 'paper'
    };
    /* The look: Front Page (newsprint on a desk, campaign red and blue) or
       Broadcast (the 1960 television studio). This phone's own choice, kept
       on it; it changes nothing anyone else sees. */
    function applySkin(k) {
      S.skin = SKINS[k] ? k : 'paper';
      if (typeof document === 'undefined') return;
      const c = document.documentElement.classList;
      Object.keys(SKINS).forEach(x => c.remove('skin-' + x));
      c.add('skin-' + S.skin);
    }
    function setSkin(k) {
      applySkin(k);
      try { localStorage.setItem(SKIN_KEY, S.skin); } catch (e) {}
      paint();
    }
    { let k = null; try { k = localStorage.getItem(SKIN_KEY); } catch (e) {} applySkin(k); }
    const send = m => o.send(m);
    const scrollTop = () => { if (o.scrollTop) o.scrollTop(); };
    const locked = () => Date.now() < S.lockUntil;
    const lock = () => { S.lockUntil = Date.now() + LOCK_MS; };
    const buzz = ms => { if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
    let flashTimer = null;
    function flash(text, tone) {
      if (!o.flashEl) return;
      clearTimeout(flashTimer);
      o.flashEl.textContent = text;
      o.flashEl.className = tone === 'good' ? 'good' : '';
      buzz(40);
      flashTimer = setTimeout(() => o.flashEl.classList.add('hide'), Math.max(2600, String(text).length * 45));
    }
    function receive(m) {
      if (m.t === 'm60') { S.pub = m; if (!m.game) S.me = null; paint(); return; }
      if (m.t === 'm60-me') { S.me = m.me; S.undo = m.undo || null; S.coach = m.coach || null; paint(); return; }
      if (m.t === 'flash') flash(m.text, m.tone);
    }
    function setMe(id, name, hex) { S.id = id; S.name = name; S.hex = hex || S.hex; paint(); }

    /* ---------- helpers ---------- */
    const game = () => S.pub && S.pub.game;
    const mine = () => { const g = game(); return g ? g.players.find(p => p.id === S.id) : null; };
    const mySide = () => { const m = mine(); return m ? m.side : null; };
    const isRemote = () => S.pub && S.pub.remote === S.id;
    const myPrompt = () => {
      if (!S.me || !S.me.prompts || !S.me.prompts.length) return null;
      const g = game();
      /* The public view and this seat's own half arrive as two messages: only
         draw a question the table itself still lists as open. */
      const open = S.me.prompts.filter(pr => g && g.prompts.some(x => x.n === pr.n && x.seat === S.id));
      if (!open.length) return 'stale';
      return open[0];
    };
    const act = a => { if (locked()) return; lock(); send({ t: 'do', a }); };
    const TICK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="#1b140c" stroke-width="2.4" fill="none"/></svg>';
    const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
    const supTxt = v => v === 0 ? 'empty' : SN(D.leadOf(v)) + ' ' + Math.abs(v) + (Math.abs(v) >= 4 ? ' (carried)' : '');
    const cardText = id => (id === 'K' || id === 'N' ? '5 CP, played instead of a hand card; then exhausted.' : D.CARD[id].text);
    const cardRow = (id, extra, attrs) => '<button class="hc"' + (attrs || '') + '>' + A.spine(id) + '<span class="tx">' + esc(cardText(id)) + '</span>' + (extra || '') + '</button>';
    /* A card in the tray: its face, and its name under it (the spine). */
    const trayCard = (id, attrs, tags, cls) => '<button class="tc' + (cls ? ' ' + cls : '') + '"' + attrs + ' aria-label="' + esc(D.cardName(id)) + '"><span class="tf">' + A.face(id) + '</span><span class="tcap">' + A.spine(id) + (tags || '') + '</span></button>';
    const pace = () => (S.pub && S.pub.opts && S.pub.opts.pace) || 'relaxed';
    const sceneOn = () => typeof document !== 'undefined' && document.documentElement.classList.contains('m60scene');
    const img = (f, c) => '<img class="sb-l' + (c ? ' ' + c : '') + '" alt="" src="' + esc(A.sceneUrl(f)) + '">';

    /* ================================================================
       Painting
       ================================================================ */
    function paint() {
      const pr = myPrompt();
      const t = S.pub && S.pub.tbl;
      const holdKey = t ? 'tbl' + t.n + (t.waiting.indexOf(S.id) >= 0 ? 'w' : 'd') + (t.grace ? 'g' : '') + (t.page != null ? 'p' + t.page : '') : '';
      const shape = [S.pub && S.pub.screen, pr && pr !== 'stale' ? pr.t + pr.n : '-', holdKey, S.pub && S.pub.draw ? 'd' + S.pub.draw.n + S.pub.draw.landed : '', S.pub && S.pub.timed ? 'x' + S.pub.timed.n : ''].join('|');
      if (shape !== S.shape) {
        const wasTurn = S.shape.split('|')[1] && S.shape.split('|')[1].indexOf('turn') === 0;
        const isTurn = pr && pr !== 'stale' && pr.t === 'turn';
        if (!(wasTurn && isTurn)) { S.sel = null; S.pre = false; }
        S.multi = []; S.amap = {};
        const newQ = S.shape.split('|')[1] !== shape.split('|')[1] && shape.split('|')[1] !== '-';
        if (newQ) { S.view = null; S.tab = 'play'; }
        /* A new question, or a card coming up or going, starts at the top. */
        const top = (!!t !== (S.shape.split('|')[2] || '').length > 0) || (newQ && !(wasTurn && isTurn));
        S.shape = shape; lock();
        if (top) scrollTop();
      }
      const g0 = game();
      const mineNow = !!(g0 && g0.phase === 'act' && g0.active === S.id && !(S.pub && S.pub.tbl));
      if (mineNow && !S.myTurn) buzz([90, 60, 90]);
      S.myTurn = mineNow;
      const fst = S.pub && S.pub.finale ? S.pub.finale.n + S.pub.finale.stage : '';
      if (fst !== S.finStage) {
        const f = S.pub && S.pub.finale;
        if (f && f.stage === 'winner' && g0 && g0.result) { const r = g0.result.rows.find(x => x.id === S.id); buzz(r && r.won ? [200, 90, 200, 90, 500] : 120); }
        S.finStage = fst;
      }
      const me = mine();
      if (me && o.onMe) o.onMe(me);
      const m = o.root;
      o.bar.classList.add('hide'); o.bar.innerHTML = '';
      if (!S.pub) { m.innerHTML = waitCard(S.solo ? 'Setting up' : 'Waiting for the telly', S.solo ? '' : '1960 has not been started yet.'); return; }
      if (S.pub.screen === 'lobby') { m.innerHTML = lobbyHtml(); fitBar(); wire(); return; }
      if (S.pub.screen === 'over') { m.innerHTML = overHtml(); fitBar(); wire(); return; }
      if (!game()) { m.innerHTML = waitCard('Hold tight', ''); return; }
      if (!me) { m.innerHTML = tracksHtml() + waitCard('Watching', '1960 is for two; the chairs were taken when this campaign started.') + boardHtml(); wire(); return; }
      if (!S.me) { m.innerHTML = waitCard('Dealing you in', ''); return; }
      /* The Map tab: the board itself, for when there is no telly (F1). A
         question waiting for you, or a card to read, pulls you back to Play. */
      const busy = t || S.pub.draw || S.pub.timed;
      if (busy) S.tab = 'play';
      if (S.tab === 'map') { m.innerHTML = tabsHtml() + tracksHtml() + mapTabHtml(); wire(); return; }
      if (S.pub.paused) { m.innerHTML = tabsHtml() + tracksHtml() + waitCard('Paused', 'The house waits while your screen is away.'); wire(); return; }
      const head = tabsHtml() + tracksHtml();
      if (t) m.innerHTML = head + tblHtml() + debateHtml() + handHtml();
      else if (S.pub.draw) m.innerHTML = head + drawHtml() + handHtml();
      else if (S.pub.timed) m.innerHTML = head + timedHtml() + debateHtml() + handHtml();
      else {
        /* A chosen card, or a share-out, is the whole screen: the feed waits. */
        const choosing = pr && pr !== 'stale' && ((pr.t === 'turn' && S.sel != null) || pr.t === 'camp' || pr.t === 'alloc');
        const mineT = pr && pr !== 'stale' && pr.t === 'turn';
        /* Your own turn opens with the newest line above the decision; the
           whole "since your last turn" list waits beneath it (F1). */
        m.innerHTML = (choosing ? tracksHtml() : head) + reelHtml(pr) + (choosing || mineT ? '' : sinceHtml()) + undoHtml() + seenHtml() + askHtml(pr) + (mineT && !choosing ? sinceHtml() : '') + hurryHtml() + debateHtml() +
          (choosing ? '' : boardHtml()) + (pr && pr !== 'stale' && (pr.t === 'turn' || pr.what === 'strat' || pr.what === 'swap' || pr.what === 'debate') ? '' : handHtml());
      }
      fitBar();
      wire();
    }
    /* The pinned bar grows with what is in it, so the page keeps that much room
       at its foot: nothing scrolls under the bar for good. */
    function fitBar() {
      if (typeof document === 'undefined') return;
      const b = o.bar;
      const h = b.classList.contains('hide') ? 0 : b.offsetHeight;
      document.body.style.paddingBottom = h ? (h + 14) + 'px' : '';
    }
    function waitCard(title, sub, extra) {
      return '<div class="card"><div class="title">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + (extra || '') + '</div>';
    }
    function goOn(n) {
      if (!S.solo) return '';
      o.bar.innerHTML = '<button class="btn" id="goon" data-n="' + n + '">Go on</button>';
      o.bar.classList.remove('hide');
      return '';
    }

    /* ---------- the tabs and the gauges, never hidden ---------- */
    function tabsHtml() {
      const t = (k, l) => '<button class="tab' + (S.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + l + '</button>';
      return '<div class="tabs">' + t('play', 'Play') + t('map', 'Map') + '</div>';
    }
    /* Both candidates, the electoral votes each leads (269 wins), the turn,
       momentum, the issues and the bag. */
    function tracksHtml() {
      const g = game();
      if (!g || !g.sup) return '';
      const ev = D.leadingEv(g.sup);
      const pl = s => g.players.find(p => p.side === s) || {};
      const who = s => { const p = pl(s); return p.id === S.id ? 'you' : p.bot ? 'house · ' + (p.level || '') : (p.name || ''); };
      const pct = n => (n / 537 * 100).toFixed(1);
      const stars = s => '<span class="mom" aria-label="' + esc(SN(s)) + ' momentum ' + g.mom[s] + '">' + A.icon('mom', 13) + '<b>' + g.mom[s] + '</b></span>';
      const phase = g.phase === 'act' ? ' · ' + g.ap + '/5' : g.phase === 'mom' ? ' · momentum' : g.phase === 'strat' ? ' · strategy' : g.phase === 'debate' ? ' · Debates' : g.phase === 'eday' ? ' · Election Day' : '';
      const iss = g.order.map((i, k) => { const L = D.leadOf(g.iss[i]); return '<span class="gi' + (L ? ' ' + L.toLowerCase() : '') + '" title="' + esc(D.issueName(i)) + '">' + (k + 1) + A.icon(i, 14) + (L ? '<b>' + Math.abs(g.iss[i]) + '</b>' : '') + '</span>'; }).join('');
      return '<div class="gauge" role="group" aria-label="The campaign">' +
        '<div class="gs k">' + A.portrait('K', 'gpt') + '<span><b>Kennedy</b><small>' + esc(who('K')) + '</small></span>' + stars('K') + '</div>' +
        '<div class="gv"><span class="evw"><b class="k">' + ev.K + '</b><em>269 to win</em><b class="n">' + ev.N + '</b></span>' +
        '<span class="evbar"><i class="k" style="width:' + pct(ev.K) + '%"></i><i class="n" style="width:' + pct(ev.N) + '%"></i><u></u></span></div>' +
        '<div class="gs n">' + stars('N') + '<span><b>Nixon</b><small>' + esc(who('N')) + '</small></span>' + A.portrait('N', 'gpt') + '</div>' +
        '<div class="gt"><span class="gn">Turn ' + (g.turn || 1) + '/9' + phase + '</span><span class="gis">' + iss + '</span>' +
        '<span class="gn">' + A.icon('bag', 14) + ' <b class="k">' + g.bag.K + '</b>·<b class="n">' + g.bag.N + '</b></span></div></div>';
    }

    /* ---------- the held cards (the telly holds the table) ---------- */
    function holdBody(g, h, page) {
      switch (h.k) {
        case 'turnStart': return W.turnStartHtml(g, h);
        case 'mom': { const base = (g.logN || g.log.length) - g.log.length; return W.momHtml(g, h, g.log.slice(Math.max(0, h.from - base), h.to - base), page); }
        case 'debateStart': return (S.solo ? debateBanner(null) : '') + W.debateStartHtml(g, h);
        case 'debateEnd': return W.debateEndHtml(g, h);
        case 'edayStart': return (S.solo && sceneOn() ? '<div class="sban eday">' + img(A.SCENES.eday.room) + img(A.SCENES.eday.lights, 'tw') + '</div>' : '') + W.edayStartHtml(g, h);
        case 'lesson': return W.lessonHtml(g, h, S.solo);
      }
      return '';
    }
    function tblHtml() {
      const t = S.pub.tbl;
      const g = game();
      const h = g.hold;
      const others = t.waiting.filter(id => id !== S.id);
      const pname = id => { const p = g.players.find(x => x.id === id); return p ? p.name : '?'; };
      let foot = '';
      if (t.waiting.indexOf(S.id) >= 0) {
        o.bar.innerHTML = '<button class="btn" id="cont">' + (t.page != null && t.page < t.pages ? 'Continue (the telly is on page ' + (t.page + 1) + ' of ' + t.pages + ')' : 'Continue') + '</button>';
        o.bar.classList.remove('hide');
        foot = S.solo ? '' : '<div class="sub" style="margin-top:8px">The game waits until everybody has read this.</div>';
      } else if (others.length) {
        foot = '<div class="sub" style="margin-top:8px">Waiting for ' + esc(others.map(pname).join(', ')) + ' to read it.</div>' +
          (t.grace && t.done.indexOf(S.id) >= 0 ? '<button class="btn ghost" id="nowait">Don’t wait for ' + esc(others.map(pname).join(' and ')) + '</button>' : '');
      }
      return '<div class="card mine held">' + (h ? holdBody(g, h, t.page) : '') + foot + '</div>';
    }
    /* A draw from the bag. On the hub the telly shows the cubes; alone, the
       bag shakes here, then the cubes come out one by one and say what they
       did, and "Go on" moves on (the timer would anyway). */
    function drawHtml() {
      const g = game(), h = g.hold, d = S.pub.draw;
      const why = h ? (h.why || 'Support checks') : 'Drawing from the bag';
      const where = h && h.rows ? h.rows.filter(r => r.st).map(r => D.STATE[r.st].name + ' (' + r.k + ')').join(', ') : '';
      if (!S.solo) return waitCard(why, 'Cubes are coming out of the bag — watch the telly.' + (where ? ' ' + where + '.' : ''));
      const need = h && h.side ? SN(h.side) + ' needs ' + (h.side === 'K' ? 'blue' : 'red') + ' cubes' : '';
      let body;
      if (!d.landed || !h || !h.rows || h.rows.some(r => r.cubes == null)) {
        body = '<div class="bagbox shake">' + A.icon('bag', 64) + '</div><div class="sub" style="text-align:center">' + esc(h && h.init ? 'Cubes are drawn until one side has two.' : need + (where ? ' · ' + where : '')) + '</div>';
      } else {
        const cm = CUBE_MS[pace()] || 480;
        let k = 0;
        body = h.rows.map(r => {
          const cubes = (r.cubes || []).map(c => { const x = A.cube(c.c || null, '', c.re ? 're' : '').replace('class="mcu', 'style="animation-delay:' + (k * cm) + 'ms" class="drop mcu'); k++; return x; }).join('');
          let res;
          if (h.init) res = SN(r.winner) + ' has the initiative';
          else if (r.st) res = r.got ? '+' + r.got + ' ' + SN(h.side) : 'nothing';
          else res = r.got ? r.got + ' media cube' + (r.got === 1 ? '' : 's') : 'no media cubes';
          return '<div class="dr">' + (r.st ? '<span class="st">' + esc(D.STATE[r.st].name) + ' <small>' + D.STATE[r.st].ev + '</small></span>' : '') + '<span class="cubes">' + cubes + '</span><span class="got' + (r.got || h.init ? ' yes' : '') + '" style="animation-delay:' + (k * cm) + 'ms">' + esc(res) + '</span></div>';
        }).join('') || '<div class="dr">Nothing to draw.</div>';
        body += '<div class="sub">' + esc(need) + (h.rows.length && !h.init ? ' · the bag now: ' + g.bag.K + ' blue, ' + g.bag.N + ' red' : '') + '</div>';
      }
      return '<div class="card mine showc drawp"><div class="title">' + esc(h && h.init ? h.why : why) + '</div>' + body + '</div>' + goOn(d.n);
    }
    /* The Debates' studio above a solo reveal (html.m60scene): the stage, and
       each candidate standing or making his point. */
    function debateBanner(h) {
      if (!sceneOn()) return '';
      const SC = A.SCENES.debate;
      const rv = h && h.k === 'reveal' ? h : null, won = h && h.k === 'won' ? h : null;
      const lay = s => img(SC[s][(rv && rv[s] != null) || (won && won.side === s) ? 'speak' : 'stand'], won && won.side === s ? 'lit' : '');
      return '<div class="sban deb">' + img(SC.stage) + lay('K') + lay('N') + '</div>';
    }
    function timedHtml() {
      const g = game(), h = g.hold;
      const n = S.pub.timed.n;
      if (!h) return waitCard(S.solo ? 'One moment' : 'Watch the telly', '');
      if (!S.solo) {
        if (h.k === 'reveal') return waitCard('Debate round ' + h.round, D.SIDES.filter(s => h[s] != null).map(s => SN(s) + ': ' + D.CARD[h[s]].name + ' (' + D.CARD[h[s]].cp + ' CP, ' + D.issueName(D.CARD[h[s]].iss) + ')').join(' · '));
        if (h.k === 'won') return waitCard(SN(h.side) + ' wins ' + D.issueName(h.iss), h.K + ' to ' + h.N + (h.tie ? ' — a tie, and the initiative decides' : '') + '. ' + h.award + ' state support to place.');
        if (h.k === 'tips') return waitCard('The undecided states fall', D.SIDES.map(s => SN(s) + ': ' + (h.tips.filter(x => x.side === s).map(x => x.st).join(' ') || 'none')).join(' · '));
        return waitCard('Watch the telly', '');
      }
      let out = '';
      if (h.k === 'reveal') {
        out = '<div class="card mine showc">' + debateBanner(h) + '<div class="title">Debate round ' + h.round + '</div><div class="sub">Both cards turn over together.</div><div class="duo">' +
          D.SIDES.filter(s => h[s] != null).map(s => '<div class="dcard ' + s.toLowerCase() + '"><span class="who">' + A.portrait(s, 'dpt') + esc(SN(s)) + '</span>' + A.face(h[s]) + '<small>' + D.CARD[h[s]].cp + ' CP · ' + esc(D.issueName(D.CARD[h[s]].iss)) + '</small></div>').join('') + '</div></div>';
      } else if (h.k === 'won') {
        out = '<div class="card mine showc">' + debateBanner(h) + '<div class="title">' + esc(SN(h.side)) + ' wins ' + esc(D.issueName(h.iss)) + '</div>' +
          '<div class="score2"><b class="k">' + h.K + '</b><span>' + A.icon(h.iss, 26) + '</span><b class="n">' + h.N + '</b></div>' +
          '<div class="sub">' + (h.tie ? 'A tie — the initiative decides. ' : '') + h.award + ' state support to place.</div><span class="stamp ' + h.side.toLowerCase() + '">' + esc(SN(h.side)) + '</span></div>';
      } else if (h.k === 'tips') {
        out = '<div class="card mine showc">' + (sceneOn() ? '<div class="sban eday">' + img(A.SCENES.eday.room) + img(A.SCENES.eday.lights, 'tw') + '</div>' : '') + '<div class="title">The undecided states fall</div>' +
          D.SIDES.map(s => '<div class="tipr"><b class="' + s.toLowerCase() + '">' + esc(SN(s)) + '</b><span>' + (h.tips.filter(x => x.side === s).map(x => esc(D.STATE[x.st].name) + ' ' + D.STATE[x.st].ev).join(' · ') || 'none') + '</span></div>').join('') + '</div>';
      } else out = waitCard('One moment', '');
      return out + goOn(n);
    }

    /* ---------- the house's newest move, and since your last turn ---------- */
    function allLines() {
      const g = game();
      if (!g || !g.log || !g.log.length) return [];
      const base = (g.logN || g.log.length) - g.log.length;
      return W.lines(g.log, g, base);
    }
    function reelHtml(pr) {
      const g = game();
      if (!g || g.phase === 'over') return '';
      const ls = allLines().filter(l => l.by && l.by !== S.id && W.CHOSE[l.t]);
      const l = ls[ls.length - 1];
      if (!l) return '';
      const p = g.players.find(x => x.id === l.by);
      if (!p || !p.bot || l.tn !== g.turn) return '';
      const sp = S.pub.spot && S.pub.spot.side === p.side ? S.pub.spot : null;
      return '<div class="reel">' + (sp && D.CARD[sp.card] ? '<span class="rf" data-zoom="' + sp.card + '">' + A.face(sp.card) + '</span>' : '') + '<div><small>Just now' + (pr && pr !== 'stale' && pr.t === 'turn' ? ' · your turn' : '') + '</small>' + W.html(l, g) + '</div></div>';
    }
    function sinceLines() {
      const all = allLines();
      let i = all.length - 1;
      while (i >= 0 && all[i].by === S.id) i--;
      const out = [];
      let reached = false;
      for (; i >= 0; i--) {
        const l = all[i];
        if (l.by === S.id && W.CHOSE[l.t]) { reached = true; break; }
        if (l.by === S.id) continue;
        out.unshift(l);
      }
      return { lines: out, first: !reached };
    }
    function sinceHtml() {
      const g = game();
      if (!g || g.phase === 'over') return '';
      const s = sinceLines();
      const lastBy = s.lines.length && g.players.find(p => p.id === s.lines[s.lines.length - 1].by);
      if (lastBy && lastBy.bot && s.lines[s.lines.length - 1].tn === g.turn && W.CHOSE[s.lines[s.lines.length - 1].t]) s.lines = s.lines.slice(0, -1);
      if (!s.lines.length) return '';
      const MAX = 6;
      const shown = S.sinceAll ? s.lines : s.lines.slice(-MAX);
      const hidden = s.lines.length - shown.length;
      return '<div class="since"><div class="sh">' + (s.first ? 'So far' : 'Since your last turn') + '</div>' +
        (hidden ? '<button class="more" id="sinceMore">' + hidden + ' earlier</button>' : '') +
        shown.map((l, k) => '<div class="sl' + (k === shown.length - 1 ? ' new' : '') + '">' + W.html(l, g) + '</div>').join('') +
        (S.sinceAll && s.lines.length > MAX ? '<button class="more" id="sinceLess">Show fewer</button>' : '') + '</div>';
    }
    function undoHtml() {
      if (!S.undo) return '';
      return '<button class="undo" id="undo"><b>Take back</b><span>' + esc(S.undo.what.replace(/\.$/, '')) + '</span></button>';
    }
    function hurryHtml() {
      const h = S.pub && S.pub.hurry;
      if (!h || !isRemote()) return '';
      const others = h.ids.filter(id => id !== S.id);
      if (!others.length) return '';
      const g = game();
      return '<button class="btn ghost" id="hurry">Play the house’s move for ' + esc(others.map(id => (g.players.find(p => p.id === id) || {}).name).join(' and ')) + '</button>';
    }
    /* Opposition Research: Kennedy's hand, shown to Nixon's phone alone. */
    function seenHtml() {
      const s = S.me && S.me.seen;
      if (!s) return '';
      return '<div class="card seen"><div class="title">Kennedy’s hand (Opposition Research)</div><div class="tray">' + s.ids.map(id => trayCard(id, ' data-zoom="' + id + '"')).join('') + '</div></div>';
    }

    /* ================================================================
       The question at the top
       ================================================================ */
    function askHtml(pr) {
      const g = game();
      if (pr === 'stale') return waitCard('Hold on', 'The table is moving on.');
      if (!pr) {
        if (!g.prompts.length) return waitCard(S.solo ? 'One moment' : 'Watch the telly', g.phase === 'over' ? 'The polls have closed.' : '');
        const x = g.prompts[0];
        const p = g.players.find(q => q.id === x.seat);
        const next = g.phase === 'act' && g.cur && g.cur !== mySide();
        return waitCard((p ? SN(p.side) : '?') + (x.t === 'turn' ? '’s turn' : ''), (p && p.bot ? 'The house is thinking. ' : '') + (x.why || ''), next ? '<div class="upnext" id="upnext">You’re up next — plan your card.</div>' : '');
      }
      if (pr.t === 'turn') return turnHtml(pr);
      if (pr.t === 'camp') return campHtml(pr);
      if (pr.t === 'alloc') return allocHtml(pr);
      return pickHtml(pr);
    }

    /* ---------------- the turn: a card, and how to play it ---------------- */
    function turnHtml(pr) {
      const c = S.me.can;
      if (!c) return waitCard('Your turn', '');
      const g = game(), side = mySide(), opp = D.other(side);
      let out = '<div class="card mine"><div class="title">Your turn · activity ' + g.ap + ' of 5</div>' +
        '<div class="sub">You have ' + c.mom + ' momentum · ' + SN(opp) + ' has ' + c.oppMom + '. Your candidate is in ' + D.STATE[g.tok[side]].name + '.</div>';
      const sel = S.sel;
      const h = sel === 'cand' ? Object.assign({ card: side }, c.cand) : sel != null && c.hand.find(x => x.card === sel);
      if (h) {
        const id = sel === 'cand' ? side : sel;
        out += '<div class="selbox">' + A.face(id, { exhausted: false }) + '<div class="st"><b>' + esc(D.cardName(id)) + '</b>' + esc(sel === 'cand' ? 'Play it for 5 CP instead of a card from your hand. It is then exhausted until an event turns it face up.' : D.CARD[id].text) + '</div></div>';
        if (h.keep) out += '<div class="warnline">' + esc(h.keep) + '</div>';
        /* What each way of playing it does, said once in the card; the buttons
           themselves sit in the pinned bar, short enough for four at 360x500. */
        const how = [];
        if (sel !== 'cand') how.push(h.event.ok ? (h.event.mom ? 'Event: costs 1 momentum (Jackie Kennedy).' : D.benefits(D.CARD[id], side) ? 'Event: the event on it is yours to use.' : 'Event: careful — it helps ' + SN(opp) + '.') : '');
        if (h.camp.ok) how.push('Campaign: 1 CP a cube in your candidate’s region; 1 CP to cross a border.' + (h.camp.mom ? ' Costs 1 momentum (Nixon’s Knee).' : ''));
        if (h.adv.ok) how.push('Advertise: ' + h.adv.cp + ' draws; each ' + (side === 'K' ? 'blue' : 'red') + ' cube is a media cube.');
        if (h.pos.ok) how.push('Issues: the first cube on an issue 1 CP, each more 2.' + (h.pos.banned ? ' Not ' + D.issueName(h.pos.banned) + ' (Restricted Positioning).' : ''));
        out += '<ul class="how">' + how.filter(Boolean).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
        if (sel !== 'cand' && h.trig) out += '<div class="warnline">Played for CP, ' + esc(SN(opp)) + ' may trigger its event for 1 momentum' + (D.benefits(D.CARD[id], opp) ? ' — and it helps them.' : '.') + '</div>';
        out += '</div>';
        const opts = [];
        if (sel !== 'cand') opts.push(['event', 'Event', h.event.ok ? (D.benefits(D.CARD[id], side) ? 'yours' : 'helps ' + SN(opp)) : null, h.event]);
        opts.push(['camp', 'Campaign ' + h.camp.cp, h.camp.ok ? 'CP in states' : null, h.camp]);
        opts.push(['adv', 'Advertise ' + h.adv.cp, h.adv.ok ? 'media cubes' : null, h.adv]);
        opts.push(['pos', 'Issues ' + h.pos.cp, h.pos.ok ? 'position' : null, h.pos]);
        let bar = '';
        if (sel !== 'cand' && h.trig && h.pre) bar += '<button class="pre' + (S.pre ? ' on' : '') + '" id="pre"' + (h.pre.ok ? '' : ' disabled') + '><span class="tick">' + (S.pre ? TICK : '') + '</span><span>' + (h.pre.ok ? 'Preempt it: ' + (h.pre.cost ? 'spend 2 momentum so they cannot trigger it.' : 'free this turn (Peace Corps).') : esc(h.pre.why)) + '</span></button>';
        const tip = S.coach && S.coach.card === sel ? S.coach.how : null;
        bar += '<div class="grid">' + opts.map(([k, l, sub, x]) => '<button class="opt' + (tip === k ? ' tip' : '') + '" data-how="' + k + '"' + (x.ok ? '' : ' disabled') + '><span class="lab"><b>' + esc(l) + '</b>' + (x.ok ? '<small>' + esc(sub || '') + '</small>' : '<span class="why">' + esc(x.why || '') + '</span>') + '</span></button>').join('') + '</div>' +
          '<button class="back" id="unsel">Back to your hand</button>';
        o.bar.innerHTML = bar;
        o.bar.classList.remove('hide');
        return out;
      }
      out += coachHtml(true);
      out += '<h2>Your hand · ' + c.hand.length + ' — tap a card</h2><div class="tray">' + c.hand.map(x => trayCard(x.card, ' data-sel="' + x.card + '"', x.keep ? '<span class="x">' + esc(x.keep) + '</span>' : '', S.coach && S.coach.card === x.card ? 'tip' : '')).join('') +
        (c.cand ? trayCard(side, ' data-sel="cand"', '', 'cand') : '') + '</div>';
      if (!c.cand) out += '<div class="sub" style="margin-top:6px">Your candidate card is exhausted.</div>';
      if (S.me.strat && S.me.strat.length) out += '<h2>Kept for ' + (g.turn < 6 ? 'the Debates' : 'Election Day') + ' · ' + S.me.strat.length + '</h2><div class="sub">' + esc(S.me.strat.map(id => D.CARD[id].name).join(', ')) + '</div>';
      out += '</div>';
      if (c.pass) { o.bar.innerHTML = '<button class="btn" id="pass">Nothing to play — pass</button>'; o.bar.classList.remove('hide'); }
      return out;
    }
    /* How to play: the coach's suggestion, with its reason. "Show me" opens the
       card it means; the choice stays the player's. */
    function coachHtml(canShow) {
      const c = S.coach;
      if (!c || !c.line) return '';
      const show = canShow && c.card != null && S.me && S.me.can && (c.card === 'cand' ? S.me.can.cand : S.me.can.hand.some(x => x.card === c.card));
      return '<div class="coach"><small>Coach</small>' + esc(c.line) + (c.pre ? '<div class="cx">' + esc(c.pre) + '</div>' : '') + (c.keep ? '<div class="cx">' + esc(c.keep) + '</div>' : '') +
        (show ? '<button class="cshow" id="coachShow">Show me</button>' : '') + '</div>';
    }

    /* ---------------- the map, one region at a time ---------------- */
    /* The printed board cropped to one region; `btns` sit over the state boxes. */
    function regionMap(g, v, hi, btns, sx) {
      const vb = viewBox(v), k = vb.k;
      return '<div class="amap" data-rv="' + v + '" data-sx="' + (sx || 0) + '"><div class="amin" style="width:' + vb.W + 'px;height:' + vb.H + 'px">' +
        '<div class="abd" style="width:' + Math.round(D.MAP_W * k) + 'px;height:' + Math.round(D.MAP_H * k) + 'px;left:' + (-Math.round(vb.x * k)) + 'px;top:' + (-Math.round(vb.y * k)) + 'px">' + A.board(g, { hi: hi || {} }) + '</div>' +
        (btns || '') + '</div></div>';
    }
    function boxAt(v, st) {
      const vb = viewBox(v), b = D.STATE[st].box, k = vb.k;
      return { L: Math.round((b[0] - vb.x) * k), T: Math.round((b[1] - vb.y) * k), W: Math.round((b[2] - b[0]) * k), H: Math.round((b[3] - b[1]) * k) };
    }
    /* Opens on the states on offer (a wide region scrolls sideways). */
    function scrollFor(v, sts) {
      if (S.sx[v] != null) return S.sx[v];
      const vb = viewBox(v);
      if (!sts.length) return 0;
      const xs = sts.map(st => (D.STATE[st].box[0] + D.STATE[st].box[2]) / 2);
      return Math.max(0, Math.round(((Math.min(...xs) + Math.max(...xs)) / 2 - vb.x) * vb.k - 183));
    }
    function viewTabs(count, extra) {
      return '<div class="vtabs">' + VIEWS.filter(([v]) => count == null || count[v] || (extra && extra(v))).map(([v, l]) =>
        '<button class="vt' + (v === S.view ? ' on' : '') + '" data-view="' + v + '" style="--rc:' + D.REGION[v].hex + '">' + esc(l) + (count ? '<small>' + count[v] + '</small>' : '') + '</button>').join('') + '</div>';
    }

    /* ---------------- campaigning, a CP at a time ---------------- */
    function campHtml(pr) {
      const g = game(), side = mySide();
      const states = pr.options.filter(o => o.st);
      const travel = pr.options.filter(o => o.go);
      const where = pr.region === 'AK' ? 'Alaska' : pr.region === 'HI' ? 'Hawaii' : 'the ' + D.REGION[pr.region].name;
      const v = states.length ? D.STATE[states[0].st].reg : D.STATE[pr.tok].reg;
      S.view = v;
      let out = '<div class="card mine camp"><div class="title">Campaigning: ' + pr.left + ' CP left</div><div class="sub">Your candidate is in ' + esc(D.STATE[pr.tok].name) + ', ' + esc(where) + '. Tap a lit state for one cube' + (states.some(o => o.chk && !o.bad) ? '; a state marked “checks” is drawn for instead — you say how many CP once' : '') + '.</div>';
      out += '<div class="pips" aria-hidden="true">' + Array.from({ length: Math.min(pr.left, 12) }, () => '<i class="on"></i>').join('') + '</div>';
      const hi = {};
      states.forEach(o => { if (!o.bad) hi[o.st] = 'hot'; });
      const btns = states.map(o => {
        const b = boxAt(v, o.st);
        const say = o.label + ', ' + o.ev + ' votes, ' + supTxt(o.sup) + (o.chk ? ', support checks' : ', one cube');
        return '<button class="mst' + (o.chk ? ' chk' : '') + (o.bad ? ' bad' : '') + '" data-pick="' + o.id + '" style="left:' + b.L + 'px;top:' + b.T + 'px;width:' + b.W + 'px;height:' + b.H + 'px"' + (o.bad ? ' disabled' : '') + ' aria-label="' + esc(say) + '"><span class="mtag">' + (o.bad ? '' : o.chk ? 'checks' : '+1') + '</span></button>';
      }).join('');
      out += regionMap(g, v, hi, btns, scrollFor(v, states.filter(o => !o.bad).map(o => o.st)));
      if (travel.length) out += '<h2>Travel</h2><div class="opts trav">' + travel.map(o => '<button class="opt" data-pick="' + o.id + '"' + (o.bad ? ' disabled' : '') + '><span class="lab"><b>' + esc(o.label) + '</b><small>' + esc(o.sub || '') + '</small>' + (o.bad ? '<span class="why">' + esc(o.bad) + '</span>' : '') + '</span></button>').join('') + '</div>';
      out += '<button class="lsw" id="aList">' + (S.alist ? 'Hide the list' : 'Show the states as a list') + '</button><div class="opts alist' + (S.alist ? '' : ' hide') + '">' +
        states.slice().sort((a, b) => b.ev - a.ev).map(o => '<button class="opt" data-pick="' + o.id + '"' + (o.bad ? ' disabled' : '') + '><span class="lab"><b>' + esc(o.label) + ' · ' + o.ev + ' votes</b><small>' + esc(supTxt(o.sup)) + (g.tok[D.other(side)] === o.st ? ' · ' + SN(D.other(side)) + ' is here' : '') + '</small>' + (o.bad ? '<span class="why">' + esc(o.bad) + '</span>' : '') + '</span>' +
          '<span class="val">' + (o.chk ? '<span class="chk">checks</span>' : '+1') + '</span></button>').join('') + '</div></div>';
      o.bar.innerHTML = '<button class="btn ghost" id="campEnd">Stop here — lose the ' + pr.left + ' CP left</button>';
      o.bar.classList.remove('hide');
      return out;
    }

    /* ---------------- sharing out: support, issues, media ---------------- */
    function allocHtml(pr) {
      const g = game();
      const m = S.amap;
      const pos = pr.what === 'pos';
      const used = Object.values(m).reduce((a, b) => a + b, 0);
      const cost = pos ? D.ISSUES.reduce((t, i) => t + (m[i] ? 2 * m[i] - 1 : 0), 0) : used;
      const room = pos ? pr.budget - cost : pr.total - used;
      const canAdd = o => { const k = m[o.id] || 0; if (pos) return !o.bad && (k === 0 ? 1 : 2) <= room; return !o.bad && k < o.cap && room > 0; };
      const onMap = !pos && pr.options.some(x => D.STATE[x.id]);
      let out = '<div class="card mine alloc"><div class="title">' + esc(pr.why) + '</div>';
      out += '<div class="tot">' + (pos ? 'CP spent <b>' + cost + '</b> of ' + pr.budget : 'Placed <b>' + used + '</b> of ' + pr.total + (pr.min ? ' (at least ' + pr.min + ')' : '')) + '</div>';
      const total = pos ? pr.budget : pr.total;
      out += '<div class="pips" aria-hidden="true">' + Array.from({ length: Math.min(total, 12) }, (x, k) => '<i class="' + (k < cost ? 'on' : '') + '"></i>').join('') + '</div>';
      if (onMap) out += allocMap(pr, m, canAdd);
      const opts = pr.options.slice().sort((a, b) => (b.ev || 0) - (a.ev || 0));
      const rows = opts.map(o => {
        const k = m[o.id] || 0;
        const sub = o.ev != null ? o.ev + ' votes · ' + supTxt(o.sup) + (o.chk ? ' · support checks' : '') : o.sup != null ? (o.sup ? SN(D.leadOf(o.sup)) + ' ' + Math.abs(o.sup) : 'nobody') : '';
        return '<div class="ed"><span class="nm">' + (D.ISSUE[o.id] ? A.icon(o.id, 18) + ' ' : '') + esc(o.label || o.id) + '<small' + (o.chk ? ' class="chk"' : '') + '>' + esc(sub) + (o.bad ? ' — ' + esc(o.bad) : '') + (!pos && o.cap < pr.total ? ' · at most ' + o.cap : '') + '</small></span>' +
          '<span class="stp"><button data-dec="' + o.id + '"' + (k ? '' : ' disabled') + '>−</button><b>' + k + '</b><button data-inc="' + o.id + '"' + (canAdd(o) ? '' : ' disabled') + '>+</button></span></div>';
      }).join('');
      if (onMap) out += '<button class="lsw" id="aList">' + (S.alist ? 'Hide the list' : 'Show it as a list') + '</button><div class="alist' + (S.alist ? '' : ' hide') + '">' + rows + '</div>';
      else out += '<div class="eds">' + rows + '</div>';
      const okNow = pos ? cost <= pr.budget : used >= pr.min && used <= pr.total;
      o.bar.innerHTML = '<button class="btn" id="allocGo"' + (okNow ? '' : ' disabled') + '>' + (used ? 'Confirm' : pr.min ? 'Place them first' : 'Place none') + '</button>';
      o.bar.classList.remove('hide');
      return out + '</div>';
    }
    /* The states on offer as buttons over their boxes: a tap adds one, its
       mark takes one back. The regions with a state on offer are the tabs. */
    function allocMap(pr, m, canAdd) {
      const g = game();
      const sts = pr.options.filter(x => D.STATE[x.id]);
      const count = {};
      VIEWS.forEach(([v]) => { count[v] = sts.filter(x => !x.bad && D.STATE[x.id].reg === v).length; });
      const placedIn = v => Object.keys(m).some(st => m[st] && D.STATE[st] && D.STATE[st].reg === v);
      if (!S.view || !(count[S.view] || placedIn(S.view))) S.view = VIEWS.map(x => x[0]).find(placedIn) || VIEWS.map(x => x[0]).slice().sort((a, b) => count[b] - count[a])[0];
      const v = S.view;
      const hi = {};
      sts.forEach(x => { if (!x.bad && D.STATE[x.id].reg === v) hi[x.id] = 'hot'; });
      const vb = viewBox(v);
      const btns = sts.filter(x => D.STATE[x.id].reg === v).map(x => {
        const b = boxAt(v, x.id), k = m[x.id] || 0;
        const say = 'Add one to ' + D.STATE[x.id].name + ', ' + D.STATE[x.id].ev + ' votes' + (x.chk ? ', support checks' : '') + (k ? ', ' + k + ' so far' : '');
        return '<button class="mst' + (x.chk ? ' chk' : '') + (x.bad ? ' bad' : '') + '" data-inc="' + x.id + '" style="left:' + b.L + 'px;top:' + b.T + 'px;width:' + b.W + 'px;height:' + b.H + 'px"' + (canAdd(x) ? '' : ' disabled') + ' aria-label="' + esc(say) + '"><span class="mtag">' + (x.chk && !x.bad ? 'checks' : '') + '</span></button>' +
          (k ? '<button class="mk" data-dec="' + x.id + '" style="left:' + Math.min(vb.W - 40, b.L + b.W - 18) + 'px;top:' + Math.max(2, b.T - 12) + 'px" aria-label="Take one back from ' + esc(D.STATE[x.id].name) + '">+' + k + '</button>' : '');
      }).join('');
      const placed = Object.keys(m).filter(id => m[id]).map(id => '<button class="pc" data-dec="' + id + '" aria-label="Take one back from ' + esc((D.STATE[id] || {}).name || id) + '">' + esc((D.STATE[id] || {}).name || id) + ' <b>+' + m[id] + '</b><span aria-hidden="true">×</span></button>').join('');
      return viewTabs(count, placedIn) + regionMap(g, v, hi, btns, scrollFor(v, sts.filter(x => !x.bad && D.STATE[x.id].reg === v).map(x => x.id))) +
        '<div class="placed">' + (placed || '<span class="sub">Tap a lit state to add one; tap its mark to take it back.</span>') + '</div>';
    }

    /* ---------------- any other question ---------------- */
    function pickHtml(pr) {
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div>' + (pr.what === 'trigger' || pr.what === 'strat' || pr.what === 'first' ? coachHtml(false) : '');
      if (pr.card && pr.what === 'trigger' && D.CARD[pr.card]) out += '<div class="selbox">' + A.face(pr.card) + '<div class="st"><b>' + esc(D.CARD[pr.card].name) + '</b>' + esc(D.CARD[pr.card].text) + '</div></div>';
      const multi = pr.multi;
      if (multi) out += '<div class="sub">Choose ' + (pr.min === pr.max ? pr.min : pr.min + ' to ' + pr.max) + '.</div>';
      const withCards = pr.options.some(o => o.card != null && o.card !== '' && D.CARD[o.card]) && pr.what !== 'trigger';
      if (withCards) {
        out += '<div class="tray wrap">' + pr.options.map(o => {
          const on = multi && S.multi.indexOf(o.id) >= 0;
          return trayCard(+o.card, ' data-pick="' + esc(o.id) + '"' + (o.bad ? ' disabled' : ''), (o.sub ? '<span class="x dim">' + esc(o.sub) + '</span>' : '') + (multi && on ? '<span class="x gold">chosen</span>' : ''), on ? 'sel' : '');
        }).join('') + '</div>';
      } else {
        const list = '<div class="opts">' + pr.options.map(o => {
          const on = multi && S.multi.indexOf(o.id) >= 0;
          return '<button class="opt' + (on ? ' on' : '') + '" data-pick="' + esc(o.id) + '"' + (o.bad ? ' disabled' : '') + '>' + (multi ? '<span class="tick">' + (on ? TICK : '') + '</span>' : '') +
            '<span class="lab"><b>' + esc(o.label || o.id) + '</b>' + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + (o.bad ? '<span class="why">' + esc(o.bad) + '</span>' : '') + '</span></button>';
        }).join('') + '</div>';
        /* A short answer (trigger it? which side?) goes under the thumb. */
        if (!multi && !pr.skip && pr.options.length <= 3) { o.bar.innerHTML = list; o.bar.classList.remove('hide'); }
        else out += list;
      }
      if (multi) {
        o.bar.innerHTML = '<button class="btn" id="pickGo"' + (S.multi.length >= pr.min && S.multi.length <= pr.max ? '' : ' disabled') + '>Confirm (' + S.multi.length + ' of ' + pr.max + ')</button>';
        o.bar.classList.remove('hide');
      }
      if (pr.skip) out += '<button class="btn ghost" id="skip">' + esc(pr.skip) + '</button>';
      return out + '</div>';
    }

    /* ================================================================
       The Debates, the campaign in brief, the Map tab, the hand
       ================================================================ */
    function debateHtml() {
      const g = game();
      const d = g && g.debate;
      if (!d || g.phase !== 'debate') return '';
      return '<h2>The Debates · ' + esc(SN(d.init)) + ' wins ties</h2><div class="card debp">' + d.pos.map((i, k) => {
        const w = d.won.find(x => x.iss === i), t = d.totals[i];
        const names = s => d.board[i][s].map(c => esc(D.CARD[c].name) + ' <b>' + D.CARD[c].cp + '</b>').join('<br>') || '—';
        return '<div class="dbrow' + (w ? ' won ' + w.side.toLowerCase() : '') + '"><span class="l">' + names('K') + '</span><span class="c">' + A.icon(i, 20) + '<b>' + esc(D.issueName(i)) + '</b><span class="tt"><i class="k">' + t.K + '</i> · <i class="n">' + t.N + '</i></span>' +
          (w ? '<em>' + esc(SN(w.side)) + ' +' + w.award + '</em>' : '<small>' + ['1st', '2nd', '3rd'][k] + ' issue</small>') + '</span><span class="r">' + names('N') + '</span></div>';
      }).join('') + (d.shown ? '<div class="sub">Lazy Shave: Nixon’s card this round is ' + esc(D.CARD[d.shown].name) + ' (' + D.CARD[d.shown].cp + ' CP, ' + esc(D.issueName(D.CARD[d.shown].iss)) + ').</div>' : '') + '</div>';
    }
    /* The campaign in brief: the issues, each region's media and endorsement,
       what is in force. The states themselves are the Map tab. */
    function boardHtml() {
      const g = game();
      if (!g || !g.sup) return '';
      const side = mySide() || 'K';
      let out = '<h2>The campaign</h2><div class="card brief">';
      out += '<div class="iss">' + g.order.map((i, k) => { const L = D.leadOf(g.iss[i]); return '<span style="--ic:' + D.ISSUE[i].hex + '">' + ['1st', '2nd', '3rd'][k] + A.icon(i, 18) + esc(D.issueName(i)) + (L ? A.cube(L, Math.abs(g.iss[i])) : '<i class="dim">nobody</i>') + '</span>'; }).join('') + '</div>';
      out += '<div class="regs">' + D.REGIONS.map(r => {
        const m = g.media[r], e = g.end[r];
        const ev = D.statesIn(r).reduce((a, s) => { const L = D.leadOf(g.sup[s]); if (L) a[L] += D.STATE[s].ev; return a; }, { K: 0, N: 0 });
        return '<button class="reg" data-goview="' + r + '" style="--rc:' + D.REGION[r].hex + '"><b>' + esc(D.REGION[r].name) + '</b><span class="rv"><i class="k">' + ev.K + '</i>·<i class="n">' + ev.N + '</i></span><span>' + A.icon('media', 14) + (m ? A.cube(D.leadOf(m), Math.abs(m)) : '0') + '</span><span>end. ' + (e ? A.cube(D.leadOf(e), Math.abs(e)) : '—') + '</span></button>';
      }).join('') + '</div>';
      out += '<div class="facts"><span>' + esc(SN(side)) + ' is in ' + esc(D.STATE[g.tok[side]].name) + ' · ' + esc(SN(D.other(side))) + ' in ' + esc(D.STATE[g.tok[D.other(side)]].name) + '</span><span>' + g.handN[side] + ' cards · ' + SN(D.other(side)) + ' ' + g.handN[D.other(side)] + '</span><span>candidate card ' + (g.cand[side] ? 'ready' : 'exhausted') + '</span><span>rest ' + g.rest.K + '·' + g.rest.N + '</span></div>';
      if (g.fxCards && g.fxCards.length) out += '<div class="facts">In force this turn: ' + g.fxCards.map(f => '<b>' + esc(D.CARD[f.id].name) + '</b> (' + esc(W.fxWords(f)) + ')').join(', ') + '</div>';
      if (g.board) {
        const pe = ['prev', 'debate', 'eday'].filter(k => g.board[k].length).map(k => ({ prev: 'Prevention', debate: 'Debates', eday: 'Election Day' })[k] + ': ' + g.board[k].map(c => D.CARD[c].name).join(', '));
        if (pe.length) out += '<div class="facts">' + esc(pe.join(' · ')) + '</div>';
      }
      return out + '</div>';
    }
    /* The Map tab: the whole country (tap a region), then that region as
       the board draws it, wide enough to read and scrolled sideways. */
    function mapTabHtml() {
      const g = game();
      if (!S.view) S.view = D.STATE[g.tok[mySide() || 'K']].reg;
      const v = S.view;
      const ev = D.leadingEv(g.sup);
      const nK = D.STATES.filter(s => D.leadOf(g.sup[s]) === 'K').length, nN = D.STATES.filter(s => D.leadOf(g.sup[s]) === 'N').length;
      let out = '<div class="card ovc"><div class="ovh"><b>The country</b><span>tap a region</span></div><div class="ov"><div class="abd" style="width:' + Math.round(D.MAP_W * OVK) + 'px;height:' + Math.round(D.MAP_H * OVK) + 'px">' + A.board(g, {}) + '</div></div>' +
        '<div class="ovl"><span><i class="k"></i>Kennedy leads ' + nK + ' states, ' + ev.K + ' votes</span><span><i class="n"></i>Nixon ' + nN + ', ' + ev.N + '</span></div></div>';
      out += viewTabs(null) + regionMap(g, v, {}, '', S.sx[v] || 0);
      const m = g.media[v], e = g.end[v];
      const sts = D.statesIn(v).sort((a, b) => D.STATE[b].ev - D.STATE[a].ev);
      out += '<div class="card"><div class="rgt" style="color:' + D.REGION[v].hex + '">' + esc(D.REGION[v].name) + ' · ' + sts.reduce((t, s) => t + D.STATE[s].ev, 0) + ' votes</div>' +
        '<div class="facts"><span>media ' + (m ? A.cube(D.leadOf(m), Math.abs(m)) : '0') + '</span><span>endorsed ' + (e ? A.cube(D.leadOf(e), Math.abs(e)) : '—') + '</span>' + D.SIDES.filter(s => D.STATE[g.tok[s]].reg === v).map(s => '<span>' + A.icon('pawn', 14) + ' ' + esc(SN(s)) + ' is in ' + esc(D.STATE[g.tok[s]].name) + '</span>').join('') + '</div>' +
        '<div class="sts">' + sts.map(s => { const x = g.sup[s], L = D.leadOf(x); return '<span class="sc' + (L ? ' ' + L.toLowerCase() : '') + (L && Math.abs(x) >= 4 ? ' car' : '') + '">' + s + ' <b>' + D.STATE[s].ev + '</b>' + (L ? A.cube(L, Math.abs(x)) : '') + '</span>'; }).join('') + '</div></div>';
      if (g.disc && g.disc.length) out += '<div class="facts">Discards (' + g.disc.length + '): ' + esc(g.disc.slice(-8).map(c => D.CARD[c].name).join(', ')) + (g.disc.length > 8 ? '…' : '') + '</div>';
      return out + boardHtml() + lookHtml();
    }
    /* Your hand, to plan with while you wait. */
    function handHtml() {
      if (!S.me || !S.me.hand) return '';
      const hand = S.me.hand;
      let out = '<h2>Your hand · ' + hand.length + '</h2>' + (hand.length ? '<div class="tray">' + hand.map(c => trayCard(c, ' data-zoom="' + c + '"')).join('') + '</div>' : '<div class="sub">Empty.</div>');
      if (S.me.strat && S.me.strat.length) out += '<h2>Kept face down · ' + S.me.strat.length + '</h2><div class="tray">' + S.me.strat.map(c => trayCard(c, ' data-zoom="' + c + '"')).join('') + '</div>';
      if (S.me.debateHand && S.me.debateHand.length) out += '<h2>Your debate cards · ' + S.me.debateHand.length + '</h2><div class="tray">' + S.me.debateHand.map(c => trayCard(c, ' data-zoom="' + c + '"')).join('') + '</div>';
      return out;
    }

    /* ---------------- lobby and the end ---------------- */
    function lookHtml() {
      return '<div class="looks"><span>Look</span>' + Object.keys(SKINS).map(k => '<button class="lk' + (S.skin === k ? ' on' : '') + '" data-skin="' + k + '">' + esc(SKINS[k]) + '</button>').join('') + '</div>';
    }
    function lobbyHtml() {
      const lv = S.pub.lobby || { seated: [], house: [] };
      const rows = lv.seated.map(p => '<div class="siteL"><b style="color:' + D.SIDE[p.side].hex + '">' + esc(p.name) + '</b><span class="sub">' + esc(SN(p.side)) + ' · ' + (p.id === S.id ? 'you' : 'phone') + '</span></div>').join('') +
        lv.house.map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">' + esc(SN(p.side)) + ' · house · ' + esc(p.level) + '</span></div>').join('') +
        (lv.watching || []).map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">watching</span></div>').join('');
      let opts = '';
      if (isRemote()) {
        const seg = (key, list, cur) => '<div class="opts segs">' + list.map(([k, l]) => '<button class="opt' + (String(k) === String(cur) ? ' on' : '') + '" data-opt="' + key + '" data-v="' + esc(k) + '">' + esc(l) + '</button>').join('') + '</div>';
        opts = '<h2>Mode</h2>' + seg('mode', [['play', 'Campaign'], ['learn', 'How to play']], lv.mode || 'play') +
          (lv.mode === 'learn' ? '<div class="sub">A lesson before each new rule, a coach on your phone, and an Easy house.</div>' : '') +
          '<h2>You play</h2>' + seg('side', [['K', 'Kennedy'], ['N', 'Nixon'], ['R', 'Random']], lv.side) +
          (lv.house.length && lv.mode !== 'learn' ? '<h2>How well the house plays</h2>' + seg('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], lv.level) : '') +
          '<h2>Restricted Positioning (optional rule)</h2>' + seg('restricted', [['off', 'Off'], ['on', 'On']], lv.restricted ? 'on' : 'off') +
          '<h2>Pace</h2>' + seg('pace', [['slow', 'Slow'], ['relaxed', 'Relaxed'], ['brisk', 'Brisk']], lv.pace) +
          (S.solo ? '<h2>Sound</h2>' + seg('sound', [['on', 'On'], ['off', 'Off']], lv.sound ? 'on' : 'off') : '');
        o.bar.innerHTML = '<button class="btn" id="go">' + (lv.mode === 'learn' ? 'Start learning' : 'Start the campaign') + '</button>';
        o.bar.classList.remove('hide');
      }
      const holder = S.pub.remote && (lv.seated.find(p => p.id === S.pub.remote) || {}).name;
      return (o.lobbyTop ? o.lobbyTop() : '') +
        '<div class="card poster"><div class="ptop">' + A.portrait('K', 'lpt') + '<div class="ptx"><div class="title">1960</div><div class="sub">The Making of the President</div></div>' + A.portrait('N', 'lpt') + '</div><div class="sub">Kennedy against Nixon. 269 electoral votes wins.</div>' + rows + '</div>' + opts +
        (isRemote() ? '' : '<div class="sub" style="margin-top:12px">' + esc(holder || 'The first phone') + ' starts the campaign.</div>') + lookHtml() +
        (o.soloUrl ? '<a class="btn ghost" id="soloGo" href="' + esc(o.soloUrl) + '" style="text-align:center;text-decoration:none">Play alone on this phone</a>' : '') +
        '<button class="btn ghost" id="menu">' + (S.solo ? 'Back to the Games hub' : 'Games menu') + '</button>' +
        '<div class="sub" style="margin-top:10px;text-align:center;font-size:11px">build ' + esc(root.M60_BUILD || '?') + '</div>';
    }
    function overHtml() {
      const f = S.pub.finale;
      const told = !f || f.stage === 'winner' || f.stage === 'table';
      const g0 = game();
      const R = told && g0 && g0.result;
      const block = f && root.HubFinale ? root.HubFinale.phoneHtml(f, { meId: S.id, rows: R ? R.rows.map(r => Object.assign({}, r, { name: SN(r.side), total: r.ev, place: r.won ? 1 : 2 })) : null, esc,
        winSmall: 'is the next President', loseSmall: me => 'You took ' + me.ev + ' electoral votes.',
        lines: { title: 'The polls have closed', count: 'Counting the votes region by region', decider: 'The closest region' } }) : '';
      if (f && f.stage !== 'table') return block + (isRemote() ? '<button class="btn ghost" id="skipFin">Skip to the table</button>' : '');
      const pay = (S.pub.pay || []).find(p => mine() && p.name === mine().name);
      const mineR = R && R.rows.find(r => r.id === S.id);
      return block + (R ? '<div class="card poster"><div class="title">' + (R.side ? esc(D.SIDE[R.side].full) + ' wins' : 'A tied election') + '</div>' + (pay ? '<div class="sub">' + esc(pay.detail) + '</div>' : mineR ? '<div class="sub">' + esc(mineR.won ? 'You won the White House with ' + mineR.ev + ' electoral votes.' : 'You took ' + mineR.ev + ' electoral votes.') + '</div>' : '') +
        R.rows.map(r => '<div class="siteL"><b style="color:' + D.SIDE[r.side].hex + '">' + esc(SN(r.side)) + ' · ' + esc(r.name) + '</b><span class="sub">' + r.ev + ' votes · ' + r.states + ' states</span></div>').join('') +
        '<div class="regs fin">' + D.REGIONS.map(x => '<span><b>' + esc(D.REGION[x].name) + '</b><i class="k">' + R.rows.find(r => r.side === 'K').byReg[x] + '</i>·<i class="n">' + R.rows.find(r => r.side === 'N').byReg[x] + '</i></span>').join('') + '</div></div>' : '') +
        (isRemote() ? '<button class="btn" id="again">Play again</button>' : '') + '<button class="btn ghost" id="menu">' + (S.solo ? 'Back to the Games hub' : 'Games menu') + '</button>';
    }

    /* ================================================================
       Wiring every button of the current paint
       ================================================================ */
    function wire() {
      if (typeof document === 'undefined') return;
      const on = (sel, fn) => o.root.parentNode.querySelectorAll(sel).forEach(x => { x.onclick = ev => { ev.stopPropagation(); if (!locked()) fn(x, ev); }; });
      const pr = myPrompt();
      const P = pr && pr !== 'stale' ? pr : null;
      on('#cont', () => { lock(); send({ t: 'cont', n: S.pub.tbl && S.pub.tbl.n }); });
      on('#nowait', () => { lock(); send({ t: 'nowait' }); });
      on('#undo', () => { lock(); send({ t: 'undo' }); });
      on('#hurry', () => { lock(); send({ t: 'hurry' }); });
      on('#goon', x => { lock(); send({ t: 'goon', n: +x.dataset.n }); });
      on('#sinceMore', () => { S.sinceAll = true; paint(); });
      on('#sinceLess', () => { S.sinceAll = false; paint(); });
      on('#menu', () => { if (o.onMenu) o.onMenu(); else send({ t: 'menu' }); });
      on('#again', () => send({ t: 'again' }));
      on('#skipFin', () => send({ t: 'skip' }));
      on('#go', () => send({ t: 'start' }));
      on('[data-opt]', x => send({ t: 'opt', key: x.dataset.opt, value: x.dataset.v }));
      on('[data-tab]', x => { S.tab = x.dataset.tab; paint(); scrollTop(); });
      on('[data-view]', x => { S.view = x.dataset.view; paint(); });
      on('[data-goview]', x => { S.view = x.dataset.goview; S.tab = 'map'; paint(); scrollTop(); });
      on('[data-skin]', x => setSkin(x.dataset.skin));
      on('#aList', () => { S.alist = !S.alist; paint(); });
      /* The country map: a tap picks the region it landed in. */
      o.root.querySelectorAll('.ov').forEach(x => { x.onclick = ev => { const b = ev.target.closest && ev.target.closest('[data-st]'); if (b && D.STATE[b.dataset.st]) { S.view = D.STATE[b.dataset.st].reg; paint(); } }; });
      /* Each region keeps how far it was scrolled sideways (every tap repaints). */
      o.root.querySelectorAll('.amap').forEach(x => {
        const v = x.dataset.rv;
        x.scrollLeft = S.sx[v] != null ? S.sx[v] : +x.dataset.sx || 0;
        x.onscroll = () => { S.sx[v] = x.scrollLeft; };
      });
      o.root.parentNode.querySelectorAll('[data-zoom]').forEach(x => { x.onclick = ev => { ev.stopPropagation(); zoom(+x.dataset.zoom); }; });
      if (o.zoomEl) o.zoomEl.onclick = () => o.zoomEl.classList.add('hide');
      if (!P) return;
      const n = P.n;
      if (P.t === 'turn') {
        on('[data-sel]', x => { S.sel = x.dataset.sel === 'cand' ? 'cand' : +x.dataset.sel; S.pre = false; lock(); paint(); scrollTop(); });
        on('#coachShow', () => { const c = S.coach; if (!c) return; S.sel = c.card; S.pre = false; lock(); paint(); scrollTop(); });
        on('#unsel', () => { S.sel = null; S.pre = false; lock(); paint(); });
        on('#pre', () => { S.pre = !S.pre; paint(); });
        on('[data-how]', x => act({ t: 'play', n, card: S.sel, how: x.dataset.how, pre: x.dataset.how !== 'event' && S.pre }));
        on('#pass', () => act({ t: 'pass', n }));
        return;
      }
      if (P.t === 'camp') {
        on('[data-pick]', x => act({ t: 'pick', n, id: x.dataset.pick }));
        on('#campEnd', x => {
          if (x.dataset.armed !== '1') { x.dataset.armed = '1'; x.textContent = 'Tap again to stop'; return; }
          act({ t: 'pick', n, id: 'end' });
        });
        return;
      }
      if (P.t === 'alloc') {
        on('[data-inc]', x => { S.amap[x.dataset.inc] = (S.amap[x.dataset.inc] || 0) + 1; paint(); });
        on('[data-dec]', x => { const k = x.dataset.dec; S.amap[k] = Math.max(0, (S.amap[k] || 0) - 1); if (!S.amap[k]) delete S.amap[k]; paint(); });
        on('#allocGo', () => act({ t: 'alloc', n, map: Object.assign({}, S.amap) }));
        return;
      }
      on('[data-pick]', x => {
        if (P.multi) {
          const id = x.dataset.pick;
          if (S.multi.indexOf(id) < 0 && S.multi.length >= P.max) { if (P.max === 1) S.multi = []; else return; }
          toggle(S.multi, id);
          return paint();
        }
        act({ t: 'pick', n, id: x.dataset.pick });
      });
      on('#pickGo', () => act({ t: 'pick', n, ids: S.multi.slice() }));
      on('#skip', () => act({ t: 'skip', n }));
    }
    function zoom(id) {
      if (!D.CARD[id] || !o.zoomEl) return;
      const z = o.zoomEl;
      z.innerHTML = A.face(id) + '<div class="ztx"><b>' + esc(D.CARD[id].name) + '</b><br>' + esc(D.CARD[id].text) + '</div>';
      z.classList.remove('hide');
    }

    return { S, receive, paint, setMe, flash, setSkin, P: S };
  }

  /* ================================================================
     The look. Base (both skins), then the two skins as variables and a
     few rules of their own.
     ================================================================ */
  const STYLES = `
:root{--bg:#0f1626;--desk:#0f1626;--panel:#1b2540;--panel2:#141c31;--line:#34446b;--ink:#f3ecdb;--dim:#b3b9c9;
  --gold:#f1c75b;--k:#3e7bfa;--n:#e5484d;--kink:#7fb0ff;--nink:#ff8f93;--good:#6fcf7f;--bad:#ff6a6a;
  --headF:Georgia,"Times New Roman",serif;--headW:800;--bodyF:Georgia,"Times New Roman",serif;--uiF:system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
[hidden],.hide{display:none !important}
html,body{margin:0;min-height:100%}
body{background:var(--desk);color:var(--ink);font:16px/1.4 var(--bodyF);
  padding:var(--inset-top, env(safe-area-inset-top)) 12px calc(96px + var(--inset-bottom, env(safe-area-inset-bottom)));
  -webkit-touch-callout:none;-webkit-user-select:none;user-select:none;overscroll-behavior-y:none;touch-action:manipulation;-webkit-text-size-adjust:100%}
input,textarea{font-size:16px;-webkit-user-select:text;user-select:text}
header{display:flex;align-items:center;gap:8px;padding:10px 0 8px;position:sticky;top:0;background:var(--desk);z-index:5}
#dot{width:12px;height:12px;border-radius:3px;background:var(--gold);flex:none}
#dot.pt{width:26px;height:auto;background:none !important}
#dot .m60-pt{width:26px;border-radius:4px}
#who{font-weight:800;font-family:var(--headF)}
#side{font-size:12px;color:var(--dim);font-family:var(--uiF)}
#link{margin-left:auto;font-size:11px;color:var(--dim)}
#link.ok{color:var(--good)} #link.bad{color:var(--bad)}
h2{margin:16px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-family:var(--uiF)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:8px;color:var(--ink)}
.card.mine{border-color:var(--gold)}
.title{font-weight:var(--headW);font-size:19px;color:var(--gold);font-family:var(--headF);line-height:1.2}
.sub{color:var(--dim);font-size:13px;margin-top:2px}
.dim{color:var(--dim)}
button{font:inherit;color:inherit}
.btn{display:block;width:100%;background:var(--gold);border:0;color:#1b140c;font-weight:800;font-size:17px;border-radius:14px;padding:14px;margin-top:10px;font-family:var(--uiF)}
.btn:disabled{opacity:.4}
.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--dim);font-weight:600;font-size:15px}
.opts{display:flex;flex-direction:column;gap:7px;margin-top:10px}
.opts.segs{flex-direction:row;flex-wrap:wrap}
.opts.segs .opt{width:auto;flex:1;justify-content:center}
.opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:10px 11px;font-size:15px}
.opt:disabled{opacity:.42}
.opt.on{border-color:var(--gold);background:rgba(241,199,91,.13)}
.opt .lab{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.opt .lab small{color:var(--dim);font-size:12px;line-height:1.25}
.opt .val{font-weight:800;font-size:13px;text-align:right;flex:none;font-family:var(--uiF)}
.why{color:#ffab9a;font-size:12px}
.tick{width:22px;height:22px;border-radius:6px;border:2px solid var(--line);flex:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#1b140c}
.on .tick{background:var(--gold);border-color:var(--gold)}
.hc{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:9px 10px;font-size:14px}
.hc .tx{font-size:12.5px;color:var(--dim);line-height:1.3;font-family:var(--uiF)}
.x{font-size:11px;color:#ffab9a;font-family:var(--uiF)}
.x.dim{color:var(--dim)} .x.gold{color:var(--gold)}
/* the hand as cards: a tray that scrolls sideways */
.tray{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 8px;margin:6px -12px 0;padding-left:12px;padding-right:12px;scroll-snap-type:x proximity}
.tray.wrap{flex-wrap:wrap;overflow:visible;margin:6px 0 0;padding:4px 0}
.tc{flex:none;width:112px;display:flex;flex-direction:column;gap:4px;background:transparent;border:0;padding:0;text-align:left;scroll-snap-align:start}
.tc:disabled{opacity:.42}
.tc .tf{display:block;border-radius:9px;box-shadow:0 3px 10px rgba(0,0,0,.45);overflow:hidden;font-size:8.6px;transition:transform .15s}
.tc .tf .mc{width:100%}
.tc .tcap{display:flex;flex-direction:column;gap:2px;font-size:11px;line-height:1.2;color:var(--ink)}
.tc .tcap .msp{font-size:11.5px;font-weight:700}
.tc .tcap .msp>*:not(.msp-nm){display:none}
.tc .tcap .msp-nm{white-space:normal;line-height:1.15}
.tc.sel .tf,.tc.tip .tf{box-shadow:0 0 0 3px var(--gold),0 3px 10px rgba(0,0,0,.45);transform:translateY(-3px)}
.tc.tip .tf{box-shadow:0 0 0 3px var(--good),0 3px 10px rgba(0,0,0,.45)}
.tc.cand .tf{box-shadow:0 0 0 2px var(--gold),0 3px 10px rgba(0,0,0,.45)}
.selbox{display:flex;gap:12px;margin-top:10px;align-items:flex-start}
.selbox .mc{width:42%;font-size:11px;flex:none;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.selbox .st{flex:1;min-width:0;font-size:13.5px;font-family:var(--uiF)}
.selbox .st b{display:block;font-size:16px;color:var(--gold);margin-bottom:3px;font-family:var(--headF)}
.pre{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px;border-radius:12px;border:1px dashed var(--line);background:var(--panel2);font-size:14px;width:100%;color:var(--ink);text-align:left}
.pre.on{border-color:var(--gold);background:rgba(241,199,91,.13)}
.warnline{margin-top:8px;font-size:13px;color:#ffcf8a;font-family:var(--uiF)}
.ed{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:14px}
.ed:first-child{border-top:0}
.ed .nm{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:0 4px}
.ed .nm small{display:block;flex-basis:100%;color:var(--dim);font-size:11.5px;font-family:var(--uiF)}
.ed .stp{display:flex;align-items:center;gap:6px;flex:none;font-family:var(--uiF)}
.ed .stp button{width:40px;height:40px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font-size:20px;font-weight:800}
.ed .stp button:disabled{opacity:.3}
.ed .stp b{min-width:28px;text-align:center;font-size:17px}
.tot{background:var(--panel);padding:6px 0;font-family:var(--uiF);font-size:14px;color:var(--dim);border-bottom:1px solid var(--line)}
.tot b{color:var(--ink);font-size:17px}
.chk{color:#ffcf8a}
.pips{display:flex;gap:4px;margin:8px 0 2px;flex-wrap:wrap}
.pips i{width:14px;height:14px;border-radius:3px;border:2px solid var(--gold);opacity:.55}
.pips i.on{background:var(--gold);opacity:1}
.facts{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px;font-size:13px;color:var(--dim);font-family:var(--uiF);align-items:center}
.facts b{color:var(--ink)}
.iss{display:flex;gap:6px;margin-top:2px}
.iss span{flex:1;background:var(--panel2);border:1px solid var(--line);border-top:3px solid var(--ic);border-radius:10px;padding:5px;text-align:center;font-size:12px;font-family:var(--uiF);display:flex;flex-direction:column;align-items:center;gap:3px}
.regs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.reg{display:flex;flex-wrap:wrap;align-items:center;gap:3px 8px;text-align:left;background:var(--panel2);border:1px solid var(--line);border-left:4px solid var(--rc);border-radius:10px;padding:6px 8px;font-size:12px;font-family:var(--uiF);color:var(--dim)}
.reg b{flex-basis:100%;color:var(--ink);font-size:13px}
.regs.fin{grid-template-columns:repeat(4,1fr)}
.regs.fin span{display:flex;flex-direction:column;align-items:center;font-size:12px;font-family:var(--uiF);background:var(--panel2);border-radius:9px;padding:5px}
i.k,b.k{color:var(--kink);font-style:normal} i.n,b.n{color:var(--nink);font-style:normal}
.sts{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.sc{display:inline-flex;align-items:center;gap:3px;border-radius:7px;padding:2px 5px;font-size:12px;font-family:var(--uiF);background:var(--panel2);color:var(--dim);border:1px solid transparent}
.sc b{color:var(--ink)}
.sc.k{background:rgba(62,123,250,.25);border-color:rgba(62,123,250,.6)}
.sc.n{background:rgba(229,72,77,.22);border-color:rgba(229,72,77,.6)}
.sc.car{font-weight:800}
.sc .mcu{font-size:10.5px;margin-left:2px}
.since{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:9px 11px;margin-top:8px;font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:4px}
.since .sh{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;font-family:var(--uiF)}
.since .sl.new{color:var(--ink)}
.since .more{align-self:flex-start;background:transparent;border:1px solid var(--line);color:var(--dim);border-radius:9px;padding:4px 10px;font-size:12px}
.reel{display:flex;gap:10px;align-items:center;margin-top:8px;padding:9px 11px;border-radius:12px;background:rgba(241,199,91,.1);border:1px solid rgba(241,199,91,.5);font-size:14px}
.reel small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:800;font-family:var(--uiF)}
.reel .rf{flex:none;width:58px;font-size:4.6px;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.reel .rf .mc{width:100%}
.coach{margin-top:8px;padding:9px 11px;border-radius:12px;background:rgba(111,207,127,.1);border:1px solid rgba(111,207,127,.55);font-size:14px;line-height:1.35}
.coach small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--good);font-weight:800;font-family:var(--uiF)}
.coach .cx{margin-top:4px;font-size:12.5px;color:var(--dim)}
.coach .cshow{margin-top:7px;background:transparent;border:1px solid var(--good);color:var(--good);border-radius:9px;padding:5px 12px;font-size:13px;font-weight:700}
.upnext{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(241,199,91,.14);border:1px solid var(--gold);color:var(--gold);font-weight:800}
.undo{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;background:var(--panel2);border:1px dashed var(--gold);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:14px;text-align:left}
.undo b{color:var(--gold);flex:none}
.seen{border-color:#9a7ad8}
.seen .title{color:#c8b0ff}
#flash{position:fixed;left:12px;right:12px;bottom:calc(96px + var(--inset-bottom, env(safe-area-inset-bottom)));background:#2a1610;border:1px solid var(--bad);color:#ffd9de;border-radius:12px;padding:11px 13px;font-size:14px;z-index:40;font-family:var(--uiF)}
#flash.good{background:#12301c;border-color:var(--good);color:#d6ffe0}
#bar{position:fixed;left:0;right:0;bottom:0;z-index:20;padding:9px 12px calc(10px + var(--inset-bottom, env(safe-area-inset-bottom)));background:var(--desk);border-top:1px solid var(--line);box-shadow:0 -12px 18px rgba(0,0,0,.45)}
#bar .btn{margin-top:0}
#bar .btn+.btn{margin-top:7px}
/* The decision lives under the thumb (PRINCIPLES 11). */
#bar .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
#bar .grid .opt{padding:8px 9px;font-size:14px;align-items:flex-start;min-height:52px}
#bar .grid .opt .lab small,#bar .grid .opt .why{font-size:11px}
#bar .grid .opt.tip{border-color:var(--good);box-shadow:0 0 0 2px rgba(111,207,127,.35)}
#bar .grid .opt .why{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.how{margin:8px 0 0;padding-left:1.1em;font-size:12.5px;color:var(--dim);font-family:var(--uiF);line-height:1.3}
.how li{margin:2px 0}
#bar .opts{margin-top:0}
#bar .pre{margin:0 0 7px;padding:7px 9px;font-size:13px}
#bar .pre .tick{width:18px;height:18px}
#bar .back{display:block;width:100%;margin-top:7px;background:transparent;border:0;color:var(--dim);font-size:13px;padding:4px;text-decoration:underline}
.rc-h{font-weight:900;font-size:24px;color:var(--gold);line-height:1.15;font-family:var(--headF)}
.rc-sub{font-size:14px;margin-top:3px}
.rc-sc{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px}
.rc-p{display:flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:7px 10px;font-size:14px;flex-wrap:wrap}
.rc-p i{width:11px;height:11px;border-radius:2px;flex:none}
.rc-role{font-size:10px;color:var(--dim);text-transform:uppercase}
.rc-t{flex-basis:100%;color:var(--dim);font-size:12.5px}
.rc-sec{margin-top:10px}
.rc-sec h4{margin:0 0 3px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.rc-sec ul{margin:0;padding-left:1.1em;font-size:13.5px}
.rc-what{font-size:12.5px;color:var(--dim)}
.rc-strip{display:flex;gap:4px;margin:8px 0}
.rc-strip span{flex:1;text-align:center;padding:4px 2px;border-radius:7px;background:var(--panel2);border:1px solid var(--line);font-size:10.5px;color:var(--dim);font-family:var(--uiF)}
.rc-strip span.on{background:var(--gold);color:#1b140c;font-weight:800}
.rc-strip span.done{color:var(--ink)}
.siteL{display:flex;align-items:center;gap:6px;font-size:14px;padding:6px 0;border-top:1px solid var(--line)}
.siteL b{flex:1}
#zoom{position:fixed;inset:0;z-index:50;background:rgba(6,9,18,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:12px}
#zoom .mc{width:min(70vw,300px);font-size:18px}
#zoom .ztx{max-width:420px;font-size:15px;text-align:center;color:#f3ecdb}
/* the tabs and the gauges */
.tabs{display:flex;gap:6px;margin-top:2px}
.tab{flex:1;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);font-weight:800;font-size:14px;font-family:var(--uiF);letter-spacing:.06em;text-transform:uppercase}
.tab.on{background:var(--gold);color:#1b140c;border-color:var(--gold)}
.gauge{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;align-items:center;margin-top:8px;padding:8px 9px;border-radius:14px;background:var(--panel);border:1px solid var(--line);font-family:var(--uiF)}
.gs{display:flex;align-items:center;gap:6px;min-width:0}
.gs span{display:flex;flex-direction:column;line-height:1.1}
.gs b{font-size:13px;font-family:var(--headF)}
.gs.k b{color:var(--kink)} .gs.n b{color:var(--nink)}
.gs.n span{text-align:right}
.gs small{font-size:10px;color:var(--dim);white-space:nowrap}
.gpt{width:26px !important;border-radius:4px}
.mom{display:inline-flex;align-items:center;gap:1px;font-size:12px;color:var(--gold)}
.gv{display:flex;flex-direction:column;gap:3px;min-width:0}
.evw{display:flex;justify-content:space-between;align-items:baseline;font-size:16px;font-weight:900}
.evw em{font-style:normal;font-size:9.5px;color:var(--dim);font-weight:600;letter-spacing:.04em;white-space:nowrap}
.evbar{position:relative;height:9px;border-radius:5px;background:var(--panel2);overflow:hidden;border:1px solid var(--line)}
.evbar i{position:absolute;top:0;bottom:0}
.evbar i.k{left:0;background:var(--k)} .evbar i.n{right:0;background:var(--n)}
.evbar u{position:absolute;left:50.1%;top:-2px;bottom:-2px;width:2px;background:var(--ink);opacity:.8}
.gt{grid-column:1/4;display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;color:var(--dim)}
.gn{white-space:nowrap;display:inline-flex;align-items:center;gap:2px}
.gis{display:flex;gap:4px}
.gi{display:inline-flex;align-items:center;gap:1px;padding:1px 4px;border-radius:6px;background:var(--panel2);font-size:11px}
.gi.k{box-shadow:inset 0 -2px 0 var(--k)} .gi.n{box-shadow:inset 0 -2px 0 var(--n)}
.gi b{font-size:11px}
/* the map */
.amap{overflow-x:auto;overflow-y:hidden;margin:8px -12px 0;padding:0 12px;-webkit-overflow-scrolling:touch}
.amin{position:relative;overflow:hidden;border-radius:12px;box-shadow:0 3px 14px rgba(0,0,0,.45)}
.abd{position:absolute}
.abd .mb{border-radius:0;font-size:10px}
.abd .sb{border-radius:6px;border-width:1.5px}
.abd .sb-ab{font-size:15px;margin-top:-9px}
.abd .sb-ev{font-size:10px;right:3px;top:1px}
.abd .sb-cu{font-size:12px;bottom:3px}
.abd .sb-edge{width:7px;height:7px;bottom:5px}
.abd .sb-tok{right:-5px;bottom:-4px}
.abd .sb-tok svg{width:18px;height:18px}
.abd .mb-rl{font-size:14px}
.abd .mb-tr,.abd .mb-iss,.abd .mb-rest,.abd .mb-strat{font-size:9px}
.abd .mb-in{font-size:8px}.abd .mb-none{font-size:10px}
.abd .mb-iss .mcu,.abd .mb-med .mcu,.abd .mb-rest .mcu{font-size:12px}
.abd .mb-em{width:22px;height:22px;font-size:12px;border-width:2px}
.abd .mb-strat b{font-size:16px}.abd .mb-strat small{font-size:7px}
.abd .mb-pe{font-size:7px;padding:3px}.abd .mb-pe em{font-size:7px}
.abd .mb-play .mc{font-size:4px}
html.art .abd .sb.lK{box-shadow:inset 0 0 0 3px rgba(62,123,250,.95)}
html.art .abd .sb.lN{box-shadow:inset 0 0 0 3px rgba(229,72,77,.95)}
.abd .sb.hot{box-shadow:0 0 0 3px #f1c75b,0 0 10px #f1c75b !important}
.abd .sb.car .sb-cu{box-shadow:0 0 0 2px #f1c75b}
.mst{position:absolute;z-index:4;background:transparent;border:0;border-radius:6px;padding:0;display:flex;align-items:flex-start;justify-content:center}
.mst:disabled{background:rgba(10,12,20,.35)}
.mst .mtag{margin-top:-9px;padding:1px 6px;border-radius:7px;background:var(--gold);color:#1b140c;font:800 10px/1.3 var(--uiF);box-shadow:0 1px 4px rgba(0,0,0,.5)}
.mst.chk .mtag{background:#ffcf8a}
.mst:disabled .mtag{display:none}
.mst:active{background:rgba(241,199,91,.3)}
.mk{position:absolute;z-index:5;min-width:30px;height:24px;border-radius:12px;border:2px solid #fff;background:var(--k);color:#fff;font:900 12px/1 var(--uiF);padding:0 6px;box-shadow:0 2px 6px rgba(0,0,0,.6)}
html.side-N .mk{background:var(--n)}
.placed{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pc{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:9px;border:1px solid var(--gold);background:rgba(241,199,91,.12);color:var(--ink);font-size:13px;font-family:var(--uiF)}
.pc span{color:var(--dim)}
.lsw{margin-top:8px;background:transparent;border:0;color:var(--dim);text-decoration:underline;font-size:13px;padding:4px 0;font-family:var(--uiF)}
.vtabs{display:flex;gap:5px;margin-top:10px;overflow-x:auto}
.vt{flex:1;display:flex;flex-direction:column;align-items:center;padding:6px 4px;border-radius:9px;border:1px solid var(--line);border-bottom:3px solid var(--rc);background:var(--panel2);color:var(--dim);font-size:12.5px;font-weight:800;font-family:var(--uiF)}
.vt small{font-size:10px;font-weight:600}
.vt.on{background:var(--rc);color:#fff;border-color:var(--rc)}
.ov{position:relative;width:${Math.round(5100 * 366 / 5100)}px;max-width:100%;height:${Math.round(3300 * 366 / 5100)}px;overflow:hidden;border-radius:10px;margin-top:6px}
.ov .abd{left:0;top:0}
.ov .sb>*{display:none}
.ov .mb>*:not(.mb-img):not(.sb){display:none}
.ov .sb{border-radius:2px;border-width:1px}
.ov .sb.lK{background:rgba(40,95,210,.92) !important;box-shadow:none !important}
.ov .sb.lN{background:rgba(205,52,60,.92) !important;box-shadow:none !important}
.ov .sb.car{outline:1.5px solid #f1c75b}
.ovh{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--uiF)}
.ovh span{font-size:11px;color:var(--dim)}
.ovl{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12px;font-family:var(--uiF);color:var(--dim)}
.ovl i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.ovl i.k{background:var(--k)} .ovl i.n{background:var(--n)}
.rgt{font-weight:900;font-family:var(--headF);font-size:17px}
.looks{display:flex;align-items:center;gap:6px;margin-top:14px;font-size:12px;color:var(--dim);font-family:var(--uiF)}
.looks .lk{flex:1;padding:7px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);font-size:13px;font-weight:700}
.looks .lk.on{border-color:var(--gold);color:var(--ink)}
/* a draw from the bag, alone */
.bagbox{display:flex;justify-content:center;margin:12px 0 6px;color:var(--gold)}
.bagbox.shake svg{animation:bagShake .35s ease-in-out infinite}
@keyframes bagShake{25%{transform:rotate(-9deg)}75%{transform:rotate(9deg)}}
.dr{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-top:1px solid var(--line);font-family:var(--uiF)}
.dr:first-of-type{border-top:0}
.dr .st{flex-basis:100%;font-weight:800;font-size:15px}
.dr .st small{color:var(--dim);font-weight:600}
.dr .cubes{display:flex;gap:4px;flex-wrap:wrap}
.dr .cubes .mcu{font-size:17px}
.mcu.drop{animation:cubeIn .35s ease-out both}
@keyframes cubeIn{from{opacity:0;transform:translateY(-14px) scale(.6)}to{opacity:1;transform:none}}
.dr .got{margin-left:auto;font-weight:900;font-size:15px;color:var(--dim);animation:cubeIn .35s ease-out both}
.dr .got.yes{color:var(--gold)}
/* scenes above a solo reveal */
.sban{position:relative;margin:-12px -12px 10px;border-radius:13px 13px 0 0;overflow:hidden;aspect-ratio:1600/1035;background:#05070c}
.sban.eday{aspect-ratio:1920/1080}
.sban .sb-l{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sban .sb-l.tw{animation:twinkle 2.4s ease-in-out infinite}
.sban .sb-l.lit{filter:drop-shadow(0 0 18px rgba(255,220,140,.7))}
@keyframes twinkle{50%{opacity:.55}}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.dcard{display:flex;flex-direction:column;gap:5px;font-family:var(--uiF);font-size:12px}
.dcard .who{display:flex;align-items:center;gap:6px;font-weight:800;font-size:14px}
.dcard.k .who{color:var(--kink)} .dcard.n .who{color:var(--nink)}
.dcard .mc{width:100%;font-size:9px;border-radius:9px;box-shadow:0 3px 10px rgba(0,0,0,.45)}
.dpt{width:24px !important;border-radius:4px}
.score2{display:flex;align-items:center;justify-content:center;gap:16px;margin:10px 0;font-size:40px;font-weight:900;font-family:var(--headF)}
.stamp{display:inline-block;margin-top:8px;padding:3px 12px;border:3px solid currentColor;border-radius:6px;font:900 20px/1.2 var(--headF);letter-spacing:.08em;text-transform:uppercase;transform:rotate(-4deg)}
.stamp.k{color:var(--kink)} .stamp.n{color:var(--nink)}
.tipr{display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:13px;font-family:var(--uiF)}
.tipr b{flex:none;width:70px}
.debp .dbrow{display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;font-size:12px;font-family:var(--uiF);padding:7px 0;border-top:1px solid var(--line)}
.debp .dbrow:first-child{border-top:0}
.debp .c{display:flex;flex-direction:column;align-items:center;text-align:center;gap:1px}
.debp .c b{font-size:13px}
.debp .c em{font-style:normal;font-weight:900;color:var(--gold)}
.debp .c small{color:var(--dim);font-size:10px}
.debp .l{text-align:right;color:var(--kink)} .debp .r{color:var(--nink)}
.debp .dbrow.won.k .c{color:var(--kink)} .debp .dbrow.won.n .c{color:var(--nink)}
.poster .ptop{display:flex;align-items:center;gap:10px}
.poster .ptx{flex:1;text-align:center}
.poster .ptx .title{font-size:34px;letter-spacing:.06em}
.lpt{width:48px !important;border-radius:6px}
/* The browser's furniture off on the game surface (PHONE-APP-LESSONS D). */
@media (prefers-reduced-motion:reduce){.mcu.drop,.dr .got,.bagbox.shake svg,.sban .sb-l.tw{animation:none}}
/* The shortest real phone is ~360x500 with its browser bars showing
   (PRINCIPLES 10): the chosen card shrinks so its words and the bar both fit. */
@media (max-height:640px){
  html body .selbox .mc{width:30%}
  html body .selbox{gap:10px;margin-top:8px}
  html body .selbox .st{font-size:12.5px}
  html body .title{font-size:17px}
  html body .card{padding:10px}
  html body .tc{width:96px}
  html body .tab{padding:5px}
  html body .gauge{padding:5px 8px;gap:2px 6px;margin-top:6px}
  html body .gpt{width:20px !important}
  html body .gs small{font-size:9px}
  html body .reel,html body .coach{font-size:13px;padding:7px 9px;margin-top:6px}
  html body .coach .cx{font-size:12px}
  html body header{padding:6px 0 5px}
}
/* Turned sideways (in bed): the same portrait column in the middle. */
@media (orientation:landscape) and (min-width:700px){
  html body{max-width:520px;margin:0 auto}
  html body #bar{left:50%;right:auto;width:520px;transform:translateX(-50%)}
}
`;
  const SKIN_CSS = `
/* ============ Front Page: newsprint on the desk, campaign red and blue ============ */
html.skin-paper{--desk:#211c17;--panel:#f2ead6;--panel2:#e7dcc2;--line:#c4b38f;--ink:#1f1a14;--dim:#5f5444;
  --gold:#b8331f;--kink:#1f4fb8;--nink:#b82a31;--good:#2f7d3e;--bad:#b8331f;
  --headF:"Avenir Next Condensed","Futura","Franklin Gothic Medium","Arial Narrow",Impact,sans-serif;--headW:800;--bodyF:Georgia,"Times New Roman",serif}
html.skin-paper body{background:var(--desk) radial-gradient(ellipse at 50% 0%,#3a3027,#211c17 70%) fixed;color:#f2ead6}
html.skin-paper header{background:#211c17;color:#f2ead6;border-bottom:4px solid transparent;border-image:repeating-linear-gradient(90deg,#b82a31 0 18px,#f2ead6 18px 36px,#1f4fb8 36px 54px) 4}
html.skin-paper #side,html.skin-paper #link{color:#c9bc9f}
html.skin-paper h2{color:#d8c9a6}
html.skin-paper .card h2{color:var(--dim)}
html.skin-paper .card,html.skin-paper .gauge,html.skin-paper .since{box-shadow:0 3px 12px rgba(0,0,0,.45);background-image:linear-gradient(rgba(255,255,255,.18),rgba(0,0,0,.03))}
html.skin-paper .card.mine{border:1px solid var(--line);border-top:5px solid #b82a31}
html.skin-paper .title{text-transform:uppercase;letter-spacing:.02em;color:#1f1a14}
html.skin-paper .card.mine>.title:first-child,html.skin-paper .card.mine .title{color:#b82a31}
html.skin-paper .btn{background:#b82a31;color:#fff6e6;letter-spacing:.04em;text-transform:uppercase;font-family:var(--headF);box-shadow:0 2px 0 #7a1a1e}
html.skin-paper .btn.ghost{background:transparent;color:#d8c9a6;border-color:#6a5c48;text-transform:none;box-shadow:none;font-family:var(--uiF)}
html.skin-paper .card .btn.ghost{color:var(--dim);border-color:var(--line)}
html.skin-paper #bar{background:#211c17;border-top:4px solid transparent;border-image:repeating-linear-gradient(90deg,#b82a31 0 18px,#f2ead6 18px 36px,#1f4fb8 36px 54px) 4}
html.skin-paper #bar .opt{background:#f2ead6;color:#1f1a14;border-color:#c4b38f}
html.skin-paper #bar .opt .lab small{color:#5f5444}
html.skin-paper #bar .back{color:#c9bc9f}
html.skin-paper #bar .pre{background:#f2ead6;color:#1f1a14}
html.skin-paper .tab{background:#2e2720;color:#c9bc9f;border-color:#4a3f33}
html.skin-paper .tab.on{background:#f2ead6;color:#b82a31;border-color:#f2ead6}
html.skin-paper .tc .tcap{color:#f2ead6}
html.skin-paper .card .tc .tcap,html.skin-paper .card .tray .tcap{color:var(--ink)}
html.skin-paper .reel{background:#fff8e6;border-color:#b82a31;color:#1f1a14}
html.skin-paper .reel small{color:#b82a31}
html.skin-paper .upnext{background:#fff8e6;color:#b82a31;border-color:#b82a31}
html.skin-paper .why,html.skin-paper .x,html.skin-paper .warnline,html.skin-paper .chk{color:#9a3412}
html.skin-paper .coach{background:#eef6e6;color:#1f1a14}
html.skin-paper .pips i{border-color:#b82a31}
html.skin-paper .pips i.on{background:#b82a31}
html.skin-paper .mst .mtag{background:#b82a31;color:#fff6e6}
html.skin-paper .mst.chk .mtag{background:#f2b33d;color:#1f1a14}
html.skin-paper .pc{background:#fff8e6;border-color:#b82a31}
html.skin-paper .vt.on{color:#fff}
html.skin-paper .looks,html.skin-paper .lsw{color:#d8c9a6}
html.skin-paper .card .lsw{color:var(--dim)}
html.skin-paper .card .looks{color:var(--dim)}
html.skin-paper .stamp{border-width:3px;mix-blend-mode:multiply}
html.skin-paper .poster{text-align:left;border-top:6px solid transparent;border-image:repeating-linear-gradient(90deg,#b82a31 0 18px,#f2ead6 18px 36px,#1f4fb8 36px 54px) 6}
html.skin-paper .poster .ptx .title{color:#b82a31;font-size:42px;line-height:1}
html.skin-paper .poster .ptx .sub{text-transform:uppercase;letter-spacing:.14em;font-family:var(--headF);color:#1f4fb8;font-weight:800}
html.skin-paper .opt{background:#e7dcc2;color:#1f1a14;border-color:#c4b38f}
html.skin-paper .opt .lab small{color:#5f5444}
html.skin-paper .opt.on{border-color:#b82a31;background:#b82a31;color:#fff6e6}
html.skin-paper .opt.on .lab small{color:#ffe2d0}
html.skin-paper #main>.sub,html.skin-paper #main>.facts,html.skin-paper #main>.placed .sub{color:#c9bc9f}
html.skin-paper #main>.facts b{color:#f2ead6}
html.skin-paper .on .tick{background:#b82a31;border-color:#b82a31}
html.skin-paper .rc-h{color:#b82a31;text-transform:uppercase}
html.skin-paper .rc-strip span.on{background:#b82a31;color:#fff}
html.skin-paper .evbar u{background:#1f1a14}
html.skin-paper .mom{color:#b8331f}
html.skin-paper #flash{background:#fff8e6;color:#7a1a1e;border-color:#b82a31}
html.skin-paper #flash.good{background:#eef6e6;color:#1f4d2a;border-color:#2f7d3e}
/* the side inks the words set inline, darkened for paper */
html.skin-paper .card [style*="#7fb0ff"],html.skin-paper .card [style*="#9ec0ff"],html.skin-paper .card [style*="#3e7bfa"],html.skin-paper .since [style*="#7fb0ff"]{color:#1f4fb8 !important}
html.skin-paper .card [style*="#ff8f93"],html.skin-paper .card [style*="#ffb0b3"],html.skin-paper .card [style*="#e5484d"],html.skin-paper .since [style*="#ff8f93"]{color:#b82a31 !important}
html.skin-paper .siteL b[style]{filter:brightness(.7)}
/* ============ Broadcast: the 1960 studio — charcoal, tube glow, gold ============ */
html.skin-tv{--desk:#0c0d10;--panel:#181a20;--panel2:#22252d;--line:#3a3e48;--ink:#eceae4;--dim:#a3a39c;
  --gold:#f1c75b;--kink:#8fb8ff;--nink:#ff9a9e;
  --headF:"Avenir Next Condensed","Futura","Franklin Gothic Medium","Arial Narrow",Impact,sans-serif;--headW:800;--bodyF:Georgia,"Times New Roman",serif}
html.skin-tv body{background:#0c0d10 radial-gradient(ellipse at 50% -10%,#272a33,#0c0d10 65%) fixed}
html.skin-tv header{background:#0c0d10}
html.skin-tv .card,html.skin-tv .gauge{background:linear-gradient(#1c1f26,#15171c);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 4px 14px rgba(0,0,0,.5)}
html.skin-tv .card.mine{border-color:#6b5a2a;box-shadow:inset 0 0 0 1px rgba(241,199,91,.25),0 0 24px rgba(241,199,91,.08)}
html.skin-tv .title{text-transform:uppercase;letter-spacing:.05em}
html.skin-tv .btn{text-transform:uppercase;letter-spacing:.06em;font-family:var(--headF);box-shadow:0 0 18px rgba(241,199,91,.25)}
html.skin-tv .btn.ghost{text-transform:none;font-family:var(--uiF);box-shadow:none}
html.skin-tv .sban::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(rgba(0,0,0,.12) 0 1px,transparent 1px 3px);pointer-events:none}
html.skin-tv .poster .ptx .title{font-size:42px;line-height:1;color:#eceae4;text-shadow:0 0 14px rgba(241,199,91,.45)}
html.skin-tv .poster .ptx .sub{text-transform:uppercase;letter-spacing:.14em;font-family:var(--headF);color:var(--gold)}
html.skin-tv .tab.on{box-shadow:0 0 14px rgba(241,199,91,.3)}
`;

  const Phone = { VERSION, create, SKINS, VIEWS, viewBox, STYLES: STYLES + SKIN_CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Phone;
  else root.M60Phone = Phone;
})(typeof window !== 'undefined' ? window : this);
