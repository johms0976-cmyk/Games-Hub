'use strict';
/* Twilight Struggle — the handset. All of it, with no networking of its own:
 * controller.html gives it a socket to the hub, solo.html gives it the
 * in-page host (LESSONS-CHECKLIST F1). It paints from two messages — {t:'ts'}
 * (the public table) and {t:'ts-me'} (this seat's half: the hand, the turn
 * menu, a hand shown to it) — and sends orders back with `send`.
 *
 * Tabs: Play (the tracks, the house's newest move, the question, since your
 * last turn, the board in miniature, your hand) and Map (the map itself, for
 * when there is no telly). NEVER-HIDE LIST (F, 360x500): the question and its
 * buttons; DEFCON, VP and the turn; the card you are deciding about. The
 * phone never offers what the engine would refuse: the turn menu comes from
 * the engine, a greyed button says why.
 */
(function (root) {
  const D = root.TSData, A = root.TSArt, W = root.TSWords;
  const VERSION = 1;
  const esc = A.esc;
  const SN = s => (s ? D.SIDE[s].name : 'nobody');
  const CN = c => (D.COUNTRY[c] ? D.COUNTRY[c].name : c);
  /* Phones synthesise a click ~300ms after a touch. Everything is inert for
     this long after a send and after the screen changes shape. */
  const LOCK_MS = 450;
  const SKINS = { file: 'Dossier', steel: 'Situation Room' };
  const SKIN_KEY = 'ts.skin';
  /* A country box on the board, in map units (ts-art.js draws the same). */
  const BW = 236, BH = 150;
  /* Where influence is placed: the map one view at a time, each at least
     ~60 px a country (a view wider than the phone scrolls sideways). */
  const VIEWS = [['WE', 'W. Europe'], ['EE', 'E. Europe'], ['ME', 'Mid East'], ['AS', 'Asia'], ['AF', 'Africa'], ['CA', 'C. America'], ['SA', 'S. America']];
  const inView = (c, v) => (v === 'WE' || v === 'EE' ? D.COUNTRY[c].reg === 'EU' && D.inWhere(c, v) : D.COUNTRY[c].reg === v);
  const viewOf = c => { const k = D.COUNTRY[c]; return k.reg !== 'EU' ? k.reg : D.inWhere(c, 'EE') && !D.inWhere(c, 'WE') ? 'EE' : 'WE'; };
  const VBOX = {};
  function viewBox(v) {
    if (VBOX[v]) return VBOX[v];
    const cs = D.COUNTRIES.filter(c => inView(c, v));
    const xs = cs.map(c => D.COUNTRY[c].x), ys = cs.map(c => D.COUNTRY[c].y);
    const x = Math.min(...xs) - BW / 2 - 40, y = Math.min(...ys) - BH / 2 - 50;
    const w = Math.max(...xs) + BW / 2 + 40 - x, h = Math.max(...ys) + BH / 2 + 40 - y;
    const k = Math.max(0.25, Math.min(1, 366 / w, 380 / h));
    return (VBOX[v] = { x, y, w, h, k, W: Math.round(w * k), H: Math.round(h * k) });
  }
  /* The two sides' seals: a white star on blue, a gold star on red. */
  const STAR = f => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.75 6.1 6.65.6-5.03 4.4 1.5 6.5L12 16.8l-5.87 3.4 1.5-6.5L2.6 9.3l6.65-.6z" fill="' + f + '"/></svg>';
  const seal = s => '<span class="seal ' + (s === 'US' ? 'us' : 'su') + '">' + STAR(s === 'US' ? '#fff' : '#ffd23f') + '</span>';

  function create(o) {
    const S = {
      id: null, name: '', hex: '#f1c75b',
      pub: null, me: null, undo: null,
      sel: null,          // the hand card being looked at
      evFirst: false,     // the other side's event before my Ops
      multi: [], amap: {}, sinceAll: false, lockUntil: 0, shape: '', myTurn: false, finStage: '',
      tab: 'play', solo: !!o.solo,
      view: null,         // the map view placing influence (W. Europe, Asia…)
      alist: false,       // placing influence from the list instead of the map
      sx: {},             // how far each map view is scrolled sideways
      skin: 'file'
    };
    /* The look: Dossier (manila, typewriter, stamps) or Situation Room
       (gunmetal, amber, rivets). This phone's own choice, kept on it; it
       changes nothing anyone else sees. */
    function applySkin(k) {
      S.skin = SKINS[k] ? k : 'file';
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
      if (m.t === 'ts') { S.pub = m; if (!m.game) S.me = null; paint(); return; }
      if (m.t === 'ts-me') { S.me = m.me; S.undo = m.undo || null; S.coach = m.coach || null; paint(); return; }
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
    const cardRow = (id, extra, attrs) => '<button class="hc"' + (attrs || '') + '>' + A.spine(id) + '<span class="tx">' + esc(D.CARD[id].text) + '</span>' + (extra || '') + '</button>';
    const infTxt = (inf, c) => A.chip('US', inf[c].US, D.ctrl(inf, c) === 'US') + A.chip('SU', inf[c].SU, D.ctrl(inf, c) === 'SU');
    const cMeta = c => { const k = D.COUNTRY[c]; return D.REGION[k.reg].name + ' · stability ' + k.stab + (k.bg ? ' · battleground' : ''); };

    /* ================================================================
       Painting
       ================================================================ */
    function paint() {
      const pr = myPrompt();
      const t = S.pub && S.pub.tbl;
      const holdKey = t ? 'tbl' + t.n + (t.waiting.indexOf(S.id) >= 0 ? 'w' : 'd') + (t.grace ? 'g' : '') : '';
      const shape = [S.pub && S.pub.screen, pr && pr !== 'stale' ? pr.t + pr.n : '-', holdKey, S.pub && S.pub.dice ? 'd' + S.pub.dice.n + S.pub.dice.landed : '', S.pub && S.pub.timed ? 'x' + S.pub.timed.n : ''].join('|');
      if (shape !== S.shape) {
        const wasTurn = S.shape.split('|')[1] && S.shape.split('|')[1].indexOf('turn') === 0;
        const isTurn = pr && pr !== 'stale' && pr.t === 'turn';
        if (!(wasTurn && isTurn)) { S.sel = null; S.evFirst = false; }
        S.multi = []; S.amap = {}; S.view = null; S.sx = {};
        const top = (!!t !== (S.shape.split('|')[2] || '').length > 0) || (S.shape.split('|')[1] !== shape.split('|')[1] && shape.split('|')[1] !== '-' && !(wasTurn && isTurn));
        /* A new question pulls you back to Play; you may still go and look at
           the map while it waits. */
        if (S.shape.split('|')[1] !== shape.split('|')[1] && shape.split('|')[1] !== '-') S.tab = 'play';
        S.shape = shape; lock();
        if (top) scrollTop();
      }
      const g0 = game();
      const mineNow = !!(g0 && g0.phase === 'ar' && g0.active === S.id && !(S.pub && S.pub.tbl));
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
      if (!S.pub) { m.innerHTML = waitCard(S.solo ? 'Setting up' : 'Waiting for the telly', S.solo ? '' : 'Twilight Struggle has not been started yet.'); return; }
      if (S.pub.screen === 'lobby') { m.innerHTML = lobbyHtml(); fitBar(); wire(); return; }
      if (S.pub.screen === 'over') { m.innerHTML = overHtml(); fitBar(); wire(); return; }
      if (!game()) { m.innerHTML = waitCard('Hold tight', ''); return; }
      if (!me) { m.innerHTML = waitCard('Watching', 'Twilight Struggle is for two; the chairs were taken when this game started.') + boardHtml(); wire(); return; }
      if (!S.me) { m.innerHTML = waitCard('Dealing you in', ''); return; }
      /* The Map tab: the board itself, for when there is no telly (F1). A
         question waiting for you, or a card to read, pulls you back to Play. */
      const busy = t || S.pub.dice || S.pub.timed;
      if (busy) S.tab = 'play';
      if (S.tab === 'map') { m.innerHTML = tabsHtml() + tracksHtml() + mapHtml(); wire(); return; }
      if (S.pub.paused) { m.innerHTML = tabsHtml() + tracksHtml() + waitCard('Paused', 'The house waits while your screen is away.'); wire(); return; }
      const head = tabsHtml() + tracksHtml();
      if (t) m.innerHTML = head + tblHtml() + boardHtml() + handHtml();
      else if (S.pub.dice) m.innerHTML = head + diceHtml() + boardHtml() + handHtml();
      else if (S.pub.timed) m.innerHTML = head + timedHtml() + boardHtml() + handHtml();
      else {
        const choosing = pr && pr !== 'stale' && ((pr.t === 'turn' && S.sel != null) || pr.t === 'alloc');
        /* Your own round opens with the newest line above the decision; the
           whole "since your last turn" list waits beneath it (F1). */
        const mineNowT = pr && pr !== 'stale' && pr.t === 'turn';
        m.innerHTML = (choosing ? '' : head) + reelHtml(pr) + (choosing || mineNowT ? '' : sinceHtml()) + undoHtml() + seenHtml() + askHtml(pr) + (mineNowT && !choosing ? sinceHtml() : '') + hurryHtml() + boardHtml() +
          (pr && pr !== 'stale' && (pr.t === 'turn' || pr.what === 'headline') ? '' : handHtml());
      }
      fitBar();
      wire();
    }
    /* The pinned bar grows with what is in it, so the page keeps that much room
       at its foot: nothing scrolls under the bar for good. */
    function fitBar() {
      const b = o.bar;
      const h = b.classList.contains('hide') ? 0 : b.offsetHeight;
      document.body.style.paddingBottom = h ? (h + 14) + 'px' : '';
    }
    function waitCard(title, sub, extra) {
      return '<div class="card"><div class="title">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + (extra || '') + '</div>';
    }

    /* ---------- the held cards (the telly holds the table) ---------- */
    function holdBody(g, h) {
      switch (h.k) {
        case 'turnStart': return W.turnStartHtml(g, h);
        case 'score': return h.r !== 'SEA' && h.res && h.res.lv && D.REGION[h.r] ? scoreHtml(g, h) : W.scoreHtml(g, h);
        case 'turnEnd': return W.turnEndHtml(g, h);
        case 'final': return W.finalHtml(g, h);
        case 'lesson': return W.lessonHtml(g, h);
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
        const done = h && h.k === 'lesson' && h.id === 'done';
        o.bar.innerHTML = '<button class="btn" id="cont">' + (done ? 'Play on' : 'Continue') + '</button>' +
          (done && isRemote() ? '<button class="btn ghost" id="realGame">Set up a real game</button>' : '');
        o.bar.classList.remove('hide');
        foot = S.solo ? '' : '<div class="sub" style="margin-top:8px">The game waits until everybody has read this.</div>';
      } else if (others.length) {
        foot = '<div class="sub" style="margin-top:8px">Waiting for ' + esc(others.map(pname).join(', ')) + ' to read it.</div>' +
          (t.grace && t.done.indexOf(S.id) >= 0 ? '<button class="btn ghost" id="nowait">Don’t wait for ' + esc(others.map(pname).join(' and ')) + '</button>' : '');
      }
      return '<div class="card mine">' + (h ? holdBody(g, h) : '') + foot + '</div>';
    }
    /* Alone, every roll is a card (F1): the die rolls here, lands, says what
       it did, and "Go on" moves on (the timer would anyway). On the hub the
       telly shows it and the phone says what is being rolled for. */
    function goOn(n) {
      if (!S.solo) return '';
      o.bar.innerHTML = '<button class="btn" id="goon" data-n="' + n + '">Go on</button>';
      o.bar.classList.remove('hide');
      return '';
    }
    function diceHtml() {
      const g = game(), h = g.hold;
      if (!h || !h.rolls) return waitCard('The dice', S.solo ? '' : 'Watch the telly.');
      const landed = S.pub.dice.landed && h.rolls[0].r != null;
      if (S.solo && h.what === 'coup' && h.c && D.COUNTRY[h.c]) return coupHtml(h, landed) + goOn(S.pub.dice.n);
      if (S.solo) return '<div class="card mine showc">' + banner(h, landed) + W.diceHtml(h, landed, A, 'phone') + '</div>' + goOn(S.pub.dice.n);
      return waitCard(h.why || 'The dice', landed ? '' : 'The dice are rolling on the telly.',
        landed ? '<div class="dice">' + h.rolls.map(r => '<span>' + A.die(r.r, r.side) + '</span>').join('') + '</div>' : '');
    }
    /* A country as its box on the board: the name band, stability, both chips. */
    function cbox(c, inf) {
      const a = D.COUNTRY[c], ct = D.ctrl({ [c]: inf }, c);
      const chip = s => '<span class="' + s.toLowerCase() + (ct === s ? ' ctl' : '') + (inf[s] ? '' : ' z') + '">' + inf[s] + '</span>';
      return '<div class="cbx' + (a.bg ? ' bg' : '') + '" style="--rcx:' + D.REGION[a.reg].hex + '"><div class="bn"><span>' + esc(a.name) + '</span><s>' + a.stab + '</s></div><div class="ch">' + chip('US') + chip('SU') + '</div></div>';
    }
    /* A coup, alone on the phone: the card and its Ops, the target and its
       defence, the die and the sum, then what changed and what it costs —
       each said as the engine applies it (ts-engine.js coupAt). */
    function coupHtml(h, landed) {
      const g = game();
      const c = h.c, a = D.COUNTRY[c], s = h.side, opp = D.other(s);
      const before = { US: g.inf[c].US, SU: g.inf[c].SU };
      const r = h.rolls[0].r;
      const def = 2 * h.stab, mod = h.mod || 0;
      const net = h.net;
      const after = { US: before.US, SU: before.SU };
      if (net > 0) { const out = Math.min(net, after[opp]); after[opp] -= out; after[s] += net - out; }
      const card = h.card != null && D.CARD[h.card] ? h.card : null;
      const by = card != null ? 'The ' + SN(s) + ' ' + (h.free ? 'plays ' : 'uses ') + D.CARD[card].name + (h.free ? ' for a free coup' : ' for its Ops') : 'The ' + SN(s) + ' stages a coup';
      const ok = net > 0;
      const sum = h.ops + ' + ' + (landed ? r : '?') + (mod ? (mod > 0 ? ' + ' : ' − ') + Math.abs(mod) : '') + ' − ' + def + (landed ? ' = ' + net : '');
      let out = '<div class="card mine showc pnl coupp">' + banner(h, landed) +
        '<div class="ptl">' + seal(s) + '<span>Coup in ' + esc(a.name) + '</span>' + seal(s) + '</div>' +
        '<div class="pby">' + esc(by) + '</div>' +
        '<div class="g2"><div class="bx"><span class="k">Operations</span>' + (card != null ? '<span class="mini">' + A.face(card) + '</span>' : '') + '<b class="v">' + h.ops + '</b><small>Ops' + (mod ? ', ' + (mod > 0 ? '+' : '−') + Math.abs(mod) + ' in effect' : '') + '</small></div>' +
        '<div class="bx"><span class="k">Target</span>' + cbox(c, before) + '<b class="v">' + def + '</b><small>defence: stability ' + h.stab + ' × 2</small></div></div>' +
        '<div class="eq">' + A.die(landed ? r : 1 + ((s === 'US' ? 3 : 0) % 6), s, landed ? 'land' : 'roll') + '<div class="sum">' + esc(sum) + '<small>Ops + the roll' + (mod ? ' + modifiers' : '') + ' − defence</small></div>' +
        (landed ? '<span class="stamp' + (ok ? '' : ' no') + '">' + (ok ? 'Success' : 'Failed') + '</span>' : '') + '</div>';
      if (landed) {
        out += '<div class="after">' + cbox(c, after) + '<div>' + (ok ? esc(net + (net === 1 ? ' point: ' : ' points: ')) + (net - Math.min(net, before[opp]) ? 'the ' + esc(SN(opp)) + '’s ' + Math.min(net, before[opp]) + ' removed, then ' + (net - Math.min(net, before[opp])) + ' ' + esc(SN(s)) + ' influence placed.' : Math.min(net, before[opp]) + ' ' + esc(SN(opp)) + ' influence removed.') : 'Nothing changes in ' + esc(a.name) + '.') + '</div></div>';
        const facts = [];
        if (a.bg && !(s === 'US' && g.tfx && g.tfx.subs)) facts.push('<div class="fact warn"><i class="lp d' + Math.max(1, g.defcon - 1) + ' on">' + Math.max(1, g.defcon - 1) + '</i><span><b>DEFCON falls to ' + Math.max(1, g.defcon - 1) + '.</b> ' + esc(a.name) + ' is a battleground' + (ok ? '' : ', and the attempt counts even when it fails') + '.</span></div>');
        if (!h.free) facts.push('<div class="fact"><span><b>' + esc(SN(s)) + ' military ops +' + h.ops + '</b> towards the ' + g.defcon + ' this turn asks for.</span></div>');
        out += '<div class="facts2">' + facts.join('') + '</div>';
      }
      return out + '</div>';
    }
    /* A region scored, as a panel: the USA | the scoring card | the USSR, row
       by row, then the VP track moving. Southeast Asia keeps its own words. */
    function scoreHtml(g, h) {
      const r = h.res, reg = h.r;
      const R = D.REGION[reg];
      const LV = { presence: 'Presence', domination: 'Domination', control: 'Control' };
      const PTS = { presence: R.p, domination: R.d, control: R.c };
      const cid = Object.keys(D.CARD).find(k => D.CARD[k].score === reg);
      const own = (s, bg) => D.inReg(reg).filter(c => D.ctrl(g.inf, c) === s && !!D.COUNTRY[c].bg === bg).map(c => D.COUNTRY[c].name);
      const col = s => {
        const bgs = own(s, true), others = own(s, false);
        const lv = r.lv && r.lv[s];
        return '<div class="col ' + s.toLowerCase() + '"><div class="who">' + seal(s) + esc(SN(s)) + '</div>' +
          '<div class="row"><div class="k">Level</div><div class="v"><b>' + esc(LV[lv] || 'Nothing') + '</b><em>' + esc(String(lv ? PTS[lv] : 0)) + '</em></div></div>' +
          '<div class="row"><div class="k">Battlegrounds</div><div class="v"><b>' + r.bg[s] + '</b><em>+' + r.bg[s] + '</em></div><div class="nm">' + esc(bgs.join(', ') || '—') + '</div></div>' +
          '<div class="row"><div class="k">Other countries</div><div class="v"><b>' + others.length + '</b><em>—</em></div><div class="nm">' + esc(others.join(', ') || '—') + '</div></div>' +
          '<div class="row"><div class="k">Next to the enemy</div><div class="v"><b>' + r.adj[s] + '</b><em>+' + r.adj[s] + '</em></div></div>' +
          '<div class="row tot"><div class="v"><b>Total</b><em>' + (r.euroWin === s ? 'wins' : r[s]) + '</em></div></div></div>';
      };
      const v0 = h.vpBefore != null ? h.vpBefore : g.vp, v1 = Math.max(-20, Math.min(20, v0 + (r.net || 0)));
      const at = v => 50 + Math.max(-20, Math.min(20, v)) * 2.5;
      const head = r.euroWin ? esc(SN(r.euroWin)) + ' controls Europe — the game is won' : r.net ? '<span class="' + (r.net > 0 ? 'us' : 'su') + '">' + esc(SN(r.net > 0 ? 'US' : 'SU')) + ' +' + Math.abs(r.net) + ' VP</span> · ' + r.US + ' against ' + r.SU : 'Even · ' + r.US + ' against ' + r.SU;
      return '<div class="pnl scorep"><div class="ptl"><span>' + esc(R.name) + ' scored</span></div>' +
        '<div class="sc3">' + col('US') + '<div class="mid">' + (cid ? A.face(+cid) : '') + '<div class="lvk"><b>Presence ' + R.p + '</b><br><b>Domination ' + R.d + '</b><br><b>Control ' + esc(String(R.c)) + '</b><br>+1 a battleground<br>+1 next to the enemy</div></div>' + col('SU') + '</div>' +
        '<div class="net"><div class="nh">' + head + '</div><div class="vpb"><span class="bar"><u></u></span><i class="was" style="left:' + at(v0) + '%"></i><i class="now" style="left:' + at(v1) + '%"></i></div>' +
        '<div class="ends"><span>USSR wins at 20</span><span>USA wins at 20</span></div><div class="vpl">VP: ' + esc(W.vpWords(v0)) + ' → ' + esc(W.vpWords(v1)) + '</div></div></div>';
    }
    function timedHtml() {
      const g = game(), h = g.hold;
      if (h && h.k === 'headline') return '<div class="card' + (S.solo ? ' mine' : '') + '"><div class="title">The headlines</div><div class="sub">Higher Ops first; the USA first on a tie.</div><div class="hand">' +
        ['SU', 'US'].filter(s => h[s] != null).map(s => cardRow(h[s], '<span class="x" style="color:' + D.SIDE[s].ink + '">' + SN(s) + '’s headline</span>', ' data-zoom="' + h[s] + '"')).join('') + '</div></div>' + goOn(S.pub.timed.n);
      if (h && h.k === 'defcon') {
        if (!S.solo) return waitCard('DEFCON falls to ' + h.to, h.why ? 'Because of ' + h.why + '. ' + W.defconNote(h.to) + '.' : W.defconNote(h.to) + '.');
        const baked = typeof document !== 'undefined' && document.documentElement.classList.contains('tsscene');
        const SC = A.SCENES, img = (f, c) => '<img class="sb-l ' + (c || '') + '" alt="" src="' + esc(A.sceneUrl(f)) + '">';
        const ban = baked ? '<div class="sban">' + img(SC.defcon.panel) + img(SC.defcon.lit[h.to]) + (h.to <= 2 ? img(SC.defcon.beacon) : '') + '</div>' : '';
        return '<div class="card mine showc">' + ban + W.defconHtml(h) + '</div>' + goOn(S.pub.timed.n);
      }
      return waitCard(S.solo ? 'One moment' : 'Watch the telly', '');
    }
    /* The baked scene above a solo die (html.tsscene): the same layers as the
       telly's stage, drawn still — a launched rocket already in the air. */
    function banner(h, landed) {
      const kind = typeof document !== 'undefined' && document.documentElement.classList.contains('tsscene') ? A.SCENE_OF[h.what] : null;
      if (!kind) return '';
      const SC = A.SCENES, img = (f, c) => '<img class="sb-l ' + c + '" alt="" src="' + esc(A.sceneUrl(f)) + '">';
      if (kind === 'war') return '<div class="sban war' + (landed ? '' : ' ring') + '">' + img(SC.war.room, '') + img(SC.war.phone, 'sb-phone') + '</div>';
      const up = landed && h.rolls[0].r <= h.need;
      return '<div class="sban space' + (up ? ' up' : '') + (landed ? '' : ' fire') + '">' + img(SC.space.pad, '') + (landed || !up ? img(SC.space.smoke, 'sb-smoke') : '') +
        '<div class="sb-ship">' + (up || !landed ? img(SC.space.flame, '') : '') + img(SC.space.rocket, '') + '</div></div>';
    }
    /* The tabs, and the strip that is never hidden: DEFCON, VP, the turn. */
    function tabsHtml() {
      const t = (k, l) => '<button class="tab' + (S.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + l + '</button>';
      return '<div class="tabs">' + t('play', 'Play') + t('map', 'Map') + '</div>';
    }
    /* The gauges: both sides, the VP track, the DEFCON lamps, the turn,
       military ops against what DEFCON asks, and the space race. */
    function tracksHtml() {
      const g = game();
      if (!g || !g.inf) return '';
      const d = g.defcon;
      const pl = s => g.players.find(p => p.side === s) || {};
      const who = s => { const p = pl(s); return p.id === S.id ? 'you' : p.bot ? 'house · ' + (p.level || '') : (p.name || ''); };
      const pos = 50 + Math.max(-20, Math.min(20, g.vp)) * 2.5;
      const lamp = k => '<i class="lp d' + k + (k === d ? ' on' : '') + '">' + k + '</i>';
      const mil = s => { const n = Math.min(g.mil[s], 5); let x = ''; for (let k = 1; k <= Math.max(d, n); k++) x += '<i class="' + (k <= n ? s.toLowerCase() : '') + (k > d ? ' over' : '') + '"></i>'; return '<span class="mo" aria-label="' + esc(SN(s)) + ' military ops ' + g.mil[s] + ' of ' + d + '">' + x + '</span>'; };
      return '<div class="gauge" role="group" aria-label="The tracks">' +
        '<div class="gs us">' + seal('US') + '<span><b>USA</b><small>' + esc(who('US')) + '</small></span></div>' +
        '<div class="gv"><span class="vpw ' + (g.vp > 0 ? 'us' : g.vp < 0 ? 'su' : '') + '">VP ' + esc(W.vpWords(g.vp)) + '</span><span class="vbar"><u></u><i style="left:' + pos + '%"></i></span></div>' +
        '<div class="gs su">' + seal('SU') + '<span><b>USSR</b><small>' + esc(who('SU')) + '</small></span></div>' +
        '<div class="gt"><span class="lamps dc l' + d + '" aria-label="DEFCON ' + d + '"><em>DEFCON</em>' + [5, 4, 3, 2, 1].map(lamp).join('') + '</span>' +
        '<span class="gn">Turn ' + (g.turn || 1) + '/10' + (g.phase === 'ar' ? ' · AR ' + g.ar : '') + '</span>' +
        '<span class="gn">Mil ' + mil('US') + mil('SU') + '</span>' +
        '<span class="gn">Space ' + g.space.US + '·' + g.space.SU + '</span></div></div>';
    }
    /* The map tab: the board as the telly draws it, wide enough to read and
       scrolled sideways; the newest moves lit, as on the telly. */
    function mapHtml() {
      const g = game();
      const hi = {};
      allLines().slice(-3).forEach(l => (l.cs || []).forEach(c => { hi[c] = l.side === 'US' ? 'us' : l.side === 'SU' ? 'su' : ''; }));
      const fx = W.inForce(g);
      return '<div class="mapbox"><div class="mapin">' + A.board(g, { hi }) + '</div></div>' +
        '<div class="sub" style="margin-top:4px">Drag sideways to see the whole map.</div>' +
        (fx.length ? '<h2>In effect</h2><div class="facts">' + fx.map(esc).join(' · ') + '</div>' : '') + boardHtml() + lookHtml();
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
      const ls = allLines().filter(l => l.by && l.by !== S.id && l.t === 'play');
      const l = ls[ls.length - 1];
      if (!l) return '';
      const p = g.players.find(x => x.id === l.by);
      if (!p || !p.bot || l.tn !== g.turn) return '';
      return '<div class="reel"><small>Just now' + (pr && pr !== 'stale' && pr.t === 'turn' ? ' · your turn' : '') + '</small>' + W.html(l, g) + '</div>';
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
      if (!s.lines.length) return '';
      const MAX = 6;
      const shown = S.sinceAll ? s.lines : s.lines.slice(-MAX);
      const hidden = s.lines.length - shown.length;
      return '<div class="since"><div class="sh">' + (s.first ? 'So far' : 'Since your last turn') + '</div>' +
        (hidden ? '<button class="more" id="sinceMore">' + hidden + ' earlier</button>' : '') +
        shown.map(l => '<div class="sl">' + W.html(l, g) + '</div>').join('') +
        (S.sinceAll && s.lines.length > MAX ? '<button class="more" id="sinceLess">Show fewer</button>' : '') + '</div>';
    }
    function undoHtml() {
      if (!S.undo) return '';
      return '<button class="undo" id="undo"><b>Take back</b><span>' + esc(S.undo.what) + '</span></button>';
    }
    function hurryHtml() {
      const h = S.pub && S.pub.hurry;
      if (!h || !isRemote()) return '';
      const others = h.ids.filter(id => id !== S.id);
      if (!others.length) return '';
      const g = game();
      return '<button class="btn ghost" id="hurry">Play the house’s move for ' + esc(others.map(id => (g.players.find(p => p.id === id) || {}).name).join(' and ')) + '</button>';
    }
    /* CIA Created, Lone Gunman, Aldrich Ames: the other hand, to this phone only. */
    function seenHtml() {
      const s = S.me && S.me.seen;
      if (!s) return '';
      const o = D.other(mySide());
      return '<div class="card seen"><div class="title" style="color:#c8b0ff">' + esc(SN(o)) + '’s hand (shown to you this turn)</div><div class="tray">' + (s.length ? s.map(id => trayCard(id, ' data-zoom="' + id + '"')).join('') : '<div class="sub">Empty.</div>') + '</div></div>';
    }

    /* ================================================================
       The question at the top
       ================================================================ */
    function askHtml(pr) {
      const g = game();
      if (pr === 'stale') return waitCard('Hold on', 'The table is moving on.');
      if (!pr) {
        if (!g.prompts.length) return waitCard('Watch the telly', g.phase === 'over' ? 'The Cold War is over.' : '');
        const x = g.prompts[0];
        const p = g.players.find(q => q.id === x.seat);
        const next = g.phase === 'ar' && g.cur && g.cur !== mySide();
        const head = S.me.myHead ? '<div class="sub">Your headline: <b>' + esc(D.CARD[S.me.myHead].name) + '</b>. Waiting for the other side.</div>' : '';
        return waitCard((p ? SN(p.side) : '?') + (x.t === 'turn' ? '’s action round' : ''), x.why || '', head + (next ? '<div class="upnext" id="upnext">You’re up next — plan your card.</div>' : ''));
      }
      if (pr.t === 'turn') return turnHtml(pr);
      if (pr.t === 'alloc') return allocHtml(pr);
      return pickHtml(pr);
    }

    /* ---------------- the action round: a card, and how to play it ---------------- */
    const DROPS = { 4: 1, 50: 1, 89: 1 };
    function turnHtml(pr) {
      const c = S.me.can;
      if (!c) return waitCard('Your turn', '');
      const g = game(), side = mySide(), opp = D.other(side);
      let out = '<div class="card mine"><div class="title">' + (pr.only != null ? 'Play the card Grain Sales drew' : 'Your action round · ' + Math.min(c.ar, c.of) + ' of ' + c.of + (c.ar > c.of ? ' (an extra round)' : '')) + '</div>' +
        '<div class="sub">DEFCON ' + g.defcon + ' · VP ' + esc(W.vpWords(g.vp)) + ' · your military ops ' + g.mil[side] + ' of ' + g.defcon + ' needed</div>';
      if (c.forced) out += '<div class="warnline">Missile Envy must be played for its Ops this round.</div>';
      if (c.scoring && c.of - c.ar + 1 <= c.scoring) out += '<div class="dangerline">You hold ' + c.scoring + ' scoring card' + (c.scoring > 1 ? 's' : '') + ' and have ' + (c.of - c.ar + 1) + ' round' + (c.of - c.ar ? 's' : '') + ' left: holding one at the end of the turn loses the game.</div>';
      const sel = S.sel;
      const h = sel != null && c.hand.find(x => x.card === sel);
      if (h) {
        const id = sel, card = D.CARD[id];
        out += '<div class="selbox">' + A.face(id) + '<div class="st"><b>' + esc(card.name) + '</b>' + esc(card.text) + '</div></div>';
        if (h.trig) out += '<div class="warnline">This is the ' + esc(SN(opp)) + '’s card: played for Ops, its event happens too.' + (DROPS[id] && g.defcon - DROPS[id] <= 1 ? '' : '') + '</div>';
        if (h.trig && DROPS[id] && g.defcon - DROPS[id] <= 1) out += '<div class="dangerline">Its event lowers DEFCON to 1 on your turn — you would lose. Send it to the space race, or keep it.</div>';
        if (!h.trig && h.event.ok && DROPS[id] && g.defcon - DROPS[id] <= 1) out += '<div class="dangerline">Its event lowers DEFCON to 1 on your own turn — you would lose.</div>';
        if (h.coup.ok && g.defcon === 2) out += '<div class="warnline">DEFCON 2: a coup in a battleground drops it to 1 and loses the game.</div>';
        out += coachHtml(pr, false) + '</div>';
        const opts = [];
        const opsTxt = h.ops + (h.ops === 1 ? ' Op' : ' Ops') + (id === D.CHINA ? ' (5 all in Asia)' : '');
        if (!h.score) {
          opts.push(['event', 'Event', h.event.ok ? (card.side === 'N' ? 'yours to use' : 'your event') : null, h.event]);
          opts.push(['inf', 'Influence', h.inf.ok ? opsTxt : null, h.inf]);
          opts.push(['coup', 'Coup', h.coup.ok ? opsTxt : null, h.coup]);
          opts.push(['realign', 'Realign', h.realign.ok ? h.ops + (h.ops === 1 ? ' roll' : ' rolls') : null, h.realign]);
          opts.push(['space', 'Space race', h.space.ok ? 'roll 1-' + h.space.need + ': ' + h.space.box : null, h.space]);
        } else opts.push(['event', 'Score it', h.event.ok ? D.REGION[card.score] ? D.REGION[card.score].name : 'Southeast Asia' : null, h.event]);
        let bar = '';
        if (h.trig) bar += '<button class="pre' + (S.evFirst ? ' on' : '') + '" id="evFirst"><span class="tick">' + (S.evFirst ? TICK : '') + '</span><span>' + esc(SN(opp)) + '’s event first, then my Ops</span></button>';
        const cc = coachFor(pr);
        bar += '<div class="grid">' + opts.map(([k, l, sub, x]) => '<button class="opt' + (cc && cc.card === id && cc.how === k ? ' tip' : '') + '" data-how="' + k + '"' + (x.ok ? '' : ' disabled') + '><span class="lab"><b>' + esc(l) + '</b>' + (x.ok ? '<small>' + esc(sub || '') + '</small>' : '<span class="why">' + esc(x.why || '') + '</span>') + '</span></button>').join('') + '</div>' +
          (pr.only == null ? '<button class="back" id="unsel">Back to your hand</button>' : '');
        o.bar.innerHTML = bar;
        o.bar.classList.remove('hide');
        return out;
      }
      if (c.defuse && c.defuse.length) out += '<h2>The Cuban Missile Crisis</h2><div class="sub">A coup by you now is nuclear war. You can defuse it first:</div><div class="opts">' + c.defuse.map(x => '<button class="opt" data-defuse="' + x + '"><span class="lab"><b>Take 2 influence out of ' + esc(CN(x)) + '</b><small>The crisis ends; then play your card.</small></span></button>').join('') + '</div>';
      out += coachHtml(pr, true);
      const cc = coachFor(pr);
      out += '<h2>Your hand · ' + c.hand.length + ' — tap a card</h2><div class="tray">' + c.hand.map(x => {
        const tags = [];
        if (x.score) tags.push('<span class="x">Scoring: play it this turn</span>');
        else if (x.trig) tags.push('<span class="x">' + esc(SN(opp)) + '’s event fires</span>');
        else if (x.event.ok) tags.push('<span class="x ok">Event ready</span>');
        if (x.card === D.CHINA) tags.push('<span class="x ok">Then passes face down</span>');
        return tip(cc && cc.card === x.card, trayCard(x.card, ' data-sel="' + x.card + '"', tags.join('')));
      }).join('') + '</div>';
      out += '</div>';
      if (c.pass) { o.bar.innerHTML = '<button class="btn" id="pass">' + (c.ar > c.of ? 'Skip the extra round' : 'Nothing to play — pass') + '</button>'; o.bar.classList.remove('hide'); }
      return out;
    }

    /* How to play: the coach's suggestion for the question on screen, only
       ever this seat's own (the telly sends it in this seat's message). */
    const coachFor = pr => (S.coach && pr && S.coach.n === pr.n ? S.coach : null);
    function coachHtml(pr, show) {
      const c = coachFor(pr);
      if (!c || !c.line) return '';
      return '<div class="coach"><small>Coach</small>' + esc(c.line) + (show && c.card != null && S.sel !== c.card ? '<button class="cshow" id="coachShow">Show me</button>' : '') + '</div>';
    }
    const tip = (on, html) => (on ? html.replace(/class="(opt|hc|tc)/, 'class="$1 tip') : html);
    /* One card in the tray: the card itself, and under it its name and Ops
       (a button you cannot read is no button) and what playing it means. */
    function trayCard(id, attrs, tags, cls) {
      return '<button class="tc' + (cls || '') + '"' + attrs + ' aria-label="' + esc(D.CARD[id].name) + '"><span class="tf">' + A.face(id) + '</span><span class="tcap">' + A.spine(id, { short: true }) + (tags || '') + '</span></button>';
    }

    /* ---------------- sharing out influence ---------------- */
    function allocHtml(pr) {
      const g = game(), side = mySide();
      const m = S.amap;
      const ops = pr.what === 'inf';
      const used = Object.values(m).reduce((a, b) => a + b, 0);
      const where = Object.keys(m).filter(k => m[k] > 0);
      const cost = ops ? D.placeCost(g.inf, side, m) : used;
      const room = ops ? pr.budget + D.bonusFor(pr.bonus, where) : pr.total;
      const after = Object.assign({}, g.inf);
      const who = pr.who || side;
      const canAdd = o => {
        if (o.bad || (m[o.id] || 0) >= o.cap) return false;
        if (ops) { const t = Object.assign({}, m); t[o.id] = (t[o.id] || 0) + 1; const w2 = Object.keys(t); return D.placeCost(g.inf, side, t) <= pr.budget + D.bonusFor(pr.bonus, w2); }
        return used < pr.total;
      };
      let out = '<div class="card mine alloc"><div class="title">' + esc(pr.why) + '</div>' + coachHtml(pr, false);
      const cmap = (coachFor(pr) || {}).map || {};
      const pips = ops ? room : pr.total;
      out += '<div class="pips" aria-hidden="true">' + Array.from({ length: Math.min(pips, 12) }, (x, k) => '<i class="' + (k < (ops ? cost : used) ? 'on' : '') + '"></i>').join('') + '</div>';
      out += '<div class="tot">' + (ops ? 'Ops used <b>' + cost + '</b> of ' + room + (pr.bonus && pr.bonus.length && !D.bonusFor(pr.bonus, where) ? ' (' + pr.budget + ' + bonus if all in ' + pr.bonus.map(b => b.where === 'AS' ? 'Asia' : D.SUBS[b.where]).join('/') + ')' : '') : (pr.act === 'rem' ? 'Removed' : 'Placed') + ' <b>' + used + '</b> of ' + pr.total + (pr.min && pr.min < pr.total ? ' (at least ' + pr.min + ')' : '')) + '</div>';
      const byReg = {};
      pr.options.forEach(o => { const r = D.COUNTRY[o.id].reg; (byReg[r] = byReg[r] || []).push(o); });
      out += allocMap(pr, m, canAdd, cmap, who, ops);
      out += '<button class="lsw" id="aList">' + (S.alist ? 'Hide the list' : 'Show it as a list') + '</button><div class="alist' + (S.alist ? '' : ' hide') + '">';
      D.REGIONS.forEach(r => {
        const list = byReg[r];
        if (!list) return;
        out += '<div class="rgh" style="color:' + D.REGION[r].hex + '">' + esc(D.REGION[r].name) + '</div>';
        out += list.sort((a, b) => (D.COUNTRY[b.id].bg - D.COUNTRY[a.id].bg) || a.label.localeCompare(b.label)).map(o => {
          const k = m[o.id] || 0;
          const c = o.id;
          const doubled = ops && D.ctrl(g.inf, c) === D.other(side);
          const nowU = g.inf[c].US + (who === 'US' ? (pr.act === 'rem' ? -k : k) : 0), nowS = g.inf[c].SU + (who === 'SU' ? (pr.act === 'rem' ? -k : k) : 0);
          const tmp = {}; tmp[c] = { US: nowU, SU: nowS };
          return '<div class="ed' + (cmap[c] ? ' tip' : '') + '"><span class="nm">' + esc(o.label) + (D.COUNTRY[c].bg ? ' <i class="bgm">BG</i>' : '') + ' ' + A.chip('US', nowU, D.ctrl(tmp, c) === 'US') + A.chip('SU', nowS, D.ctrl(tmp, c) === 'SU') +
            '<small>stability ' + D.COUNTRY[c].stab + (doubled ? ' · <span class="warn">2 Ops a point: ' + esc(SN(D.other(side))) + ' controls it</span>' : '') + (!ops && o.cap < pr.total ? ' · at most ' + o.cap : '') + '</small></span>' +
            '<span class="stp"><button data-dec="' + o.id + '"' + (k ? '' : ' disabled') + '>−</button><b>' + k + '</b><button data-inc="' + o.id + '"' + (canAdd(o) ? '' : ' disabled') + '>+</button></span></div>';
        }).join('');
      });
      out += '</div>';
      void after;
      const okNow = ops ? cost <= room : used >= pr.min && used <= pr.total;
      o.bar.innerHTML = '<button class="btn" id="allocGo"' + (okNow ? '' : ' disabled') + '>' + (!ops && pr.min && used < pr.min ? (pr.act === 'rem' ? 'Take ' : 'Place ') + (pr.min - used) + ' more' : used ? 'Confirm' : pr.min ? 'Choose them first' : (ops ? 'Place none' : 'None')) + '</button>';
      o.bar.classList.remove('hide');
      return out + '</div>';
    }

    /* The map, one view at a time: every country the question offers is a
       button over its own box on the board. A tap adds one; its mark takes
       one back. The views with a country on offer are the tabs, each saying
       how many. */
    function allocMap(pr, m, canAdd, cmap, who, ops) {
      const g = game();
      const rem = pr.act === 'rem';
      const count = {};
      VIEWS.forEach(([v]) => { count[v] = pr.options.filter(o => !o.bad && inView(o.id, v)).length; });
      const placedIn = v => Object.keys(m).some(c => m[c] && inView(c, v));
      if (!S.view || !(count[S.view] || placedIn(S.view))) {
        const tipC = Object.keys(cmap)[0];
        const vs = VIEWS.map(x => x[0]);
        S.view = tipC && D.COUNTRY[tipC] ? viewOf(tipC) : vs.find(placedIn) || vs.slice().sort((a, b) => count[b] - count[a])[0];
      }
      const tabs = '<div class="vtabs">' + VIEWS.filter(([v]) => count[v] || placedIn(v)).map(([v, l]) =>
        '<button class="vt' + (v === S.view ? ' on' : '') + '" data-view="' + v + '" style="--rc:' + D.REGION[v === 'WE' || v === 'EE' ? 'EU' : v].hex + '">' + esc(l) + '<small>' + count[v] + '</small></button>').join('') + '</div>';
      const vb = viewBox(S.view);
      const hi = {};
      pr.options.forEach(o => { if (!o.bad && inView(o.id, S.view)) hi[o.id] = cmap[o.id] ? 'tipc' : 'legal'; });
      const svg = A.board(g, { hi }).replace('viewBox="0 0 5100 3300"', 'viewBox="' + [vb.x, vb.y, vb.w, vb.h].join(' ') + '"');
      const px = n => Math.round(n * vb.k);
      const btns = pr.options.filter(o => inView(o.id, S.view)).map(o => {
        const c = o.id, a = D.COUNTRY[c], k = m[c] || 0;
        const L = px(a.x - BW / 2 - vb.x), T = px(a.y - BH / 2 - vb.y);
        const doubled = ops && D.ctrl(g.inf, c) === D.other(mySide());
        const say = (rem ? 'Take one out of ' : 'Add one to ') + a.name + (doubled ? ' (2 Ops: the other side controls it)' : '') + (k ? ', ' + k + ' so far' : '');
        return '<button class="mc' + (o.bad ? ' bad' : '') + (cmap[c] ? ' tip' : '') + (doubled ? ' dbl' : '') + '" data-inc="' + c + '" style="left:' + L + 'px;top:' + T + 'px;width:' + px(BW) + 'px;height:' + px(BH) + 'px"' + (canAdd(o) ? '' : ' disabled') + ' aria-label="' + esc(say) + '"></button>' +
          (k ? '<button class="mk' + (rem ? ' rem' : '') + '" data-dec="' + c + '" style="left:' + Math.min(vb.W - 40, L + px(BW) - 20) + 'px;top:' + Math.max(2, T - 14) + 'px" aria-label="Take one back from ' + esc(a.name) + '">' + (rem ? '−' : '+') + k + '</button>' : '');
      }).join('');
      const placed = Object.keys(m).filter(c => m[c]).map(c => '<button class="pc" data-dec="' + c + '" aria-label="Take one back from ' + esc(D.COUNTRY[c].name) + '">' + esc(D.COUNTRY[c].name) + ' <b>' + (rem ? '−' : '+') + m[c] + '</b><span aria-hidden="true">×</span></button>').join('');
      void who;
      /* Opens on the countries on offer (a wide view scrolls sideways). */
      const lit = pr.options.filter(o => !o.bad && inView(o.id, S.view)).map(o => D.COUNTRY[o.id].x);
      const sx = lit.length ? Math.max(0, Math.round(((Math.min(...lit) + Math.max(...lit)) / 2 - vb.x) * vb.k - 183)) : 0;
      return tabs + '<div class="amap" data-sx="' + sx + '"><div class="amin" style="width:' + vb.W + 'px;height:' + vb.H + 'px">' + svg + btns + '</div></div>' +
        '<div class="placed">' + (placed || '<span class="sub">' + (rem ? 'Tap a lit country to take one out.' : 'Tap a lit country to add one; tap its mark to take it back.') + '</span>') + '</div>';
    }

    /* ---------------- any other question ---------------- */
    function pickHtml(pr) {
      const g = game();
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div>' + coachHtml(pr, false);
      const cp = coachFor(pr);
      const tipped = id => !!cp && (cp.id === id || (cp.ids && cp.ids.indexOf(id) >= 0));
      if (pr.card && D.CARD[pr.card] && pr.what !== 'headline') out += '<div class="sub">' + A.spine(pr.card) + '</div>';
      const multi = pr.multi;
      if (multi) out += '<div class="sub">Choose ' + (pr.min === pr.max ? pr.min : pr.min + ' to ' + pr.max) + '.</div>';
      const withCards = pr.options.some(o => o.card != null && D.CARD[o.card]) && pr.what !== 'grain';
      if (withCards) {
        out += '<div class="tray">' + pr.options.map(o => {
          const on = multi && S.multi.indexOf(o.id) >= 0;
          const tags = (o.label && !/^\d+$/.test(o.id) ? '<span class="x lab">' + esc(o.label) + '</span>' : '') + (o.sub ? '<span class="x sub2">' + esc(o.sub) + '</span>' : '') + (o.bad ? '<span class="x">' + esc(o.bad) + '</span>' : '') + (on ? '<span class="x ok">Chosen</span>' : '');
          return tip(tipped(o.id), trayCard(+o.card, ' data-pick="' + esc(o.id) + '"' + (o.bad ? ' disabled' : ''), tags, on ? ' sel' : ''));
        }).join('') + '</div>';
      } else {
        const list = '<div class="opts">' + pr.options.map(o => {
          const on = multi && S.multi.indexOf(o.id) >= 0;
          const c = o.c;
          let val = '';
          if (c && g.inf[c]) val = infTxt(g.inf, c);
          let sub = o.sub || '';
          if (c && D.COUNTRY[c]) sub = cMeta(c) + (sub ? ' · ' + sub : '');
          if (pr.what === 'coup') sub = (o.sure ? 'certain to succeed' : o.never ? 'cannot succeed' : 'needs ' + o.need + '+') + ' · ' + sub;
          if (pr.what === 'realign') sub = 'your +' + o.mine + ' against their +' + o.theirs + ' · ' + sub;
          return '<button class="opt' + (on ? ' on' : '') + (tipped(o.id) ? ' tip' : '') + '" data-pick="' + esc(o.id) + '"' + (o.bad ? ' disabled' : '') + '>' + (multi ? '<span class="tick">' + (on ? TICK : '') + '</span>' : '') +
            '<span class="lab"><b>' + esc(o.label || o.id) + (c && D.COUNTRY[c] && D.COUNTRY[c].bg ? ' <i class="bgm">BG</i>' : '') + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + (o.warn ? '<span class="why">' + esc(o.warn) + '</span>' : '') + (o.bad ? '<span class="why">' + esc(o.bad) + '</span>' : '') + '</span>' + (val ? '<span class="val">' + val + '</span>' : '') + '</button>';
        }).join('') + '</div>';
        if (!multi && !pr.skip && pr.options.length <= 3 && !pr.options.some(o => o.c)) { o.bar.innerHTML = list; o.bar.classList.remove('hide'); }
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
       The board in miniature
       ================================================================ */
    function boardHtml() {
      const g = game();
      if (!g || !g.inf) return '';
      const side = mySide();
      let out = '<h2>The board</h2><div class="tracks"><span>DEFCON<b>' + g.defcon + '</b></span><span>VP<b>' + esc(W.vpWords(g.vp)) + '</b></span><span>Turn<b>' + g.turn + (g.phase === 'ar' ? '·' + g.ar : '') + '</b></span></div>';
      const fact = s => '<div class="facts"><b style="color:' + D.SIDE[s].ink + '">' + esc(side === s ? 'You · ' + SN(s) : SN(s)) + '</b><span><b>' + g.handN[s] + '</b> in hand</span><span>military <b>' + g.mil[s] + '</b>/' + g.defcon + '</span><span>space: ' + esc(D.SPACE[g.space[s]].name) + '</span>' + (g.china === s ? '<span>China Card ' + (g.chinaUp ? 'ready' : 'face down') + '</span>' : '') + '</div>';
      out += fact(side || 'SU') + fact(D.other(side || 'SU'));
      const fx = W.inForce(g);
      if (fx.length) out += '<div class="facts">In effect: ' + fx.map(esc).join(' · ') + '</div>';
      out += '<div class="regs">' + D.REGIONS.map(r => {
        const sc = D.scoreRegion(g.inf, r, { taiwanBg: g.fx.formosan });
        const lv = s => sc.lv[s] ? sc.lv[s].slice(0, 3) + '.' : '—';
        return '<div class="reg"><div class="rh"><b style="color:' + D.REGION[r].hex + '">' + esc(D.REGION[r].name) + '</b><span>USSR ' + lv('SU') + ' · USA ' + lv('US') + '</span><span>now: ' + (sc.euroWin ? esc(SN(sc.euroWin)) + ' wins' : sc.net ? esc(SN(sc.net > 0 ? 'US' : 'SU')) + ' +' + Math.abs(sc.net) : 'even') + '</span></div><div class="sts">' +
          D.inReg(r).sort((a, b) => (D.COUNTRY[b].bg - D.COUNTRY[a].bg) || D.COUNTRY[a].name.localeCompare(D.COUNTRY[b].name)).map(c => {
            const ct = D.ctrl(g.inf, c);
            return '<span class="sc' + (D.COUNTRY[c].bg ? ' bg' : '') + (ct ? ' ' + ct.toLowerCase() : '') + '">' + esc(D.COUNTRY[c].name) + '<span class="stb">' + D.COUNTRY[c].stab + '</span>' + infTxt(g.inf, c) + '</span>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
      if (g.disc && g.disc.length) out += '<div class="facts">Discards (' + g.disc.length + '): ' + esc(g.disc.slice(-8).map(c => D.CARD[c].name).join(', ')) + (g.disc.length > 8 ? '…' : '') + '</div>';
      return out;
    }
    /* Your hand, to plan with while you wait. */
    function handHtml() {
      if (!S.me || !S.me.hand) return '';
      const hand = S.me.hand;
      const g = game();
      let out = '<h2>Your hand · ' + hand.length + '</h2>' + (hand.length ? '<div class="tray">' + hand.map(c => trayCard(c, ' data-zoom="' + c + '"')).join('') + '</div>' : '<div class="sub">Empty.</div>');
      if (g && g.china === mySide()) out += '<div class="sub" style="margin-top:6px">You hold the China Card' + (g.chinaUp ? '.' : ', face down until the turn ends.') + '</div>';
      return out;
    }

    /* ---------------- lobby and the end ---------------- */
    function lobbyHtml() {
      const lv = S.pub.lobby || { seated: [], house: [] };
      const rows = lv.seated.map(p => '<div class="siteL"><b style="color:' + D.SIDE[p.side].ink + '">' + esc(p.name) + '</b><span class="sub">' + esc(SN(p.side)) + ' · ' + (p.id === S.id ? 'you' : 'phone') + '</span></div>').join('') +
        lv.house.map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">' + esc(SN(p.side)) + ' · house · ' + esc(p.level) + '</span></div>').join('') +
        (lv.watching || []).map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">watching</span></div>').join('');
      let opts = '';
      if (isRemote()) {
        const seg = (key, list, cur) => '<div class="opts" style="flex-direction:row;flex-wrap:wrap">' + list.map(([k, l]) => '<button class="opt' + (String(k) === String(cur) ? ' on' : '') + '" data-opt="' + key + '" data-v="' + esc(k) + '" style="width:auto;flex:1;justify-content:center">' + esc(l) + '</button>').join('') + '</div>';
        opts = '<h2>Mode</h2>' + seg('mode', [['play', 'Game'], ['learn', 'How to play']], lv.mode || 'play') +
          (lv.mode === 'learn' ? '<div class="sub">A lesson as each rule first matters, a coach on your phone, an Easy house. Three turns, then play on if you like.</div>' : '') +
          '<h2>You play</h2>' + seg('side', [['SU', 'USSR'], ['US', 'USA'], ['R', 'Random']], lv.side) +
          (lv.house.length && lv.mode !== 'learn' ? '<h2>How well the house plays</h2>' + seg('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], lv.level) : '') +
          '<h2>Optional cards</h2>' + seg('optional', [['off', 'Off'], ['on', 'On']], lv.optional ? 'on' : 'off') +
          '<h2>Pace</h2>' + seg('pace', [['slow', 'Slow'], ['relaxed', 'Relaxed'], ['brisk', 'Brisk']], lv.pace);
        o.bar.innerHTML = '<button class="btn" id="go">' + (lv.mode === 'learn' ? 'Start learning' : S.solo ? 'Begin' : 'Start the Cold War') + '</button>';
        o.bar.classList.remove('hide');
      }
      const holder = S.pub.remote && (lv.seated.find(p => p.id === S.pub.remote) || {}).name;
      return (o.lobbyTop ? o.lobbyTop() : '') +
        '<div class="card"><div class="title">Twilight Struggle</div><div class="sub">' + (S.solo ? 'You against the house, on this phone. The USSR against the USA, 1945 to 1989; 20 VP wins.' : 'The USSR against the USA, 1945 to 1989. 20 VP wins.') + '</div>' + (S.solo ? '' : rows) + '</div>' + opts + lookHtml() +
        (isRemote() ? '' : '<div class="sub" style="margin-top:12px">' + esc(holder || 'The first phone') + ' starts the game.</div>') +
        (o.soloUrl ? '<button class="btn ghost" id="soloGo">Play alone on this phone — no telly</button><div class="sub">You against the house, saved on this phone; the telly and the room are left alone.</div>' : '') +
        '<button class="btn ghost" id="menu">' + (S.solo ? 'Games hub' : 'Games menu') + '</button>' +
        '<div class="sub" style="margin-top:10px;text-align:center;font-size:11px">build ' + esc(window.TS_BUILD || '?') + '</div>';
    }
    /* This phone's look; nobody else sees the choice. */
    function lookHtml() {
      return '<h2>Look (this phone)</h2><div class="opts" style="flex-direction:row;flex-wrap:wrap">' + Object.keys(SKINS).map(k =>
        '<button class="opt' + (S.skin === k ? ' on' : '') + '" data-skin="' + k + '" style="width:auto;flex:1;justify-content:center">' + esc(SKINS[k]) + '</button>').join('') + '</div>';
    }
    function overHtml() {
      const f = S.pub.finale;
      const told = !f || f.stage === 'winner' || f.stage === 'table';
      const g0 = game();
      const R = told && g0 && g0.result;
      const block = f && window.HubFinale && !S.solo ? HubFinale.phoneHtml(f, { meId: S.id, rows: R ? R.rows.map(r => Object.assign({}, r, { name: SN(r.side), total: r.bg, place: !R.side ? 1 : r.won ? 1 : 2 })) : null, esc,
        winSmall: 'wins the Cold War', loseSmall: me => 'You held ' + me.bg + ' battlegrounds at the end.',
        lines: { title: 'The Cold War ends', count: 'Scoring the world', decider: 'The last region' } }) : '';
      if (f && f.stage !== 'table') return block + (isRemote() && !S.solo ? '<button class="btn ghost" id="skipFin">Skip to the table</button>' : '');
      const pay = (S.pub.pay || []).find(p => mine() && p.name === mine().name);
      return block + (R ? '<div class="card"><div class="title">' + (R.side ? esc(SN(R.side)) + ' wins' : 'A draw') + '</div>' + (pay ? '<div class="sub">' + esc(pay.detail) + '</div>' : '') +
        '<div class="sub">Final VP: ' + esc(W.vpWords(R.vp)) + ' · turn ' + R.turn + ' · DEFCON ' + R.defcon + '</div>' +
        R.rows.map(r => '<div class="siteL"><b style="color:' + D.SIDE[r.side].ink + '">' + esc(SN(r.side)) + ' · ' + esc(r.name) + '</b><span class="sub">' + r.countries + ' countries · ' + r.bg + ' battlegrounds</span></div>').join('') + '</div>' : '') +
        (isRemote() ? '<button class="btn" id="again">' + (S.solo ? 'New game' : 'Play again') + '</button>' : '') + '<button class="btn ghost" id="menu">' + (S.solo ? 'Games hub' : 'Games menu') + '</button>';
    }

    /* ================================================================
       Wiring every button of the current paint
       ================================================================ */
    function wire() {
      const on = (sel, fn) => document.querySelectorAll(sel).forEach(x => { x.onclick = ev => { ev.stopPropagation(); if (!locked()) fn(x, ev); }; });
      const pr = myPrompt();
      const P = pr && pr !== 'stale' ? pr : null;
      on('#cont', () => { lock(); send({ t: 'cont', n: S.pub.tbl && S.pub.tbl.n }); });
      on('#nowait', () => { lock(); send({ t: 'nowait' }); });
      on('#undo', () => { lock(); send({ t: 'undo' }); });
      on('#hurry', () => { lock(); send({ t: 'hurry' }); });
      on('#sinceMore', () => { S.sinceAll = true; paint(); });
      on('#sinceLess', () => { S.sinceAll = false; paint(); });
      on('#menu', () => { if (o.onMenu) o.onMenu(); else send({ t: 'menu' }); });
      on('#again', () => send({ t: 'again' }));
      on('#skipFin', () => send({ t: 'skip' }));
      on('#go', () => send({ t: 'start' }));
      on('#realGame', () => { lock(); send({ t: 'quit' }); });
      on('[data-tab]', x => { S.tab = x.dataset.tab; lock(); paint(); scrollTop(); });
      on('#goon', x => { lock(); send({ t: 'goon', n: +x.dataset.n }); });
      on('#soloGo', () => { if (o.soloUrl) location.href = o.soloUrl; });
      on('[data-opt]', x => send({ t: 'opt', key: x.dataset.opt, value: x.dataset.v }));
      on('[data-skin]', x => setSkin(x.dataset.skin));
      document.querySelectorAll('[data-zoom]').forEach(x => { x.onclick = ev => { ev.stopPropagation(); zoom(+x.dataset.zoom); }; });
      o.zoomEl.onclick = () => o.zoomEl.classList.add('hide');
      if (!P) return;
      const n = P.n;
      if (P.t === 'turn') {
        on('[data-sel]', x => { S.sel = +x.dataset.sel; S.evFirst = false; lock(); paint(); scrollTop(); });
        on('#coachShow', () => { const c = S.coach; if (!c || c.card == null) return; S.sel = c.card; S.evFirst = !!c.evFirst; lock(); paint(); scrollTop(); });
        on('#unsel', () => { S.sel = null; S.evFirst = false; lock(); paint(); });
        on('#evFirst', () => { S.evFirst = !S.evFirst; paint(); });
        on('[data-how]', x => act({ t: 'play', n, card: S.sel, how: x.dataset.how, evFirst: x.dataset.how !== 'event' && x.dataset.how !== 'space' && S.evFirst }));
        on('[data-defuse]', x => act({ t: 'defuse', n, id: x.dataset.defuse }));
        on('#pass', () => act({ t: 'pass', n }));
        /* A card that came with the question (Grain Sales) is already chosen. */
        if (P.only != null && S.sel == null) { S.sel = P.only; paint(); }
        return;
      }
      if (P.t === 'alloc') {
        on('[data-inc]', x => { S.amap[x.dataset.inc] = (S.amap[x.dataset.inc] || 0) + 1; paint(); });
        on('[data-dec]', x => { const k = x.dataset.dec; S.amap[k] = Math.max(0, (S.amap[k] || 0) - 1); if (!S.amap[k]) delete S.amap[k]; paint(); });
        on('#allocGo', () => act({ t: 'alloc', n, map: Object.assign({}, S.amap) }));
        on('[data-view]', x => { S.view = x.dataset.view; paint(); });
        /* Every tap repaints: the map keeps where you had scrolled it. */
        const am = document.querySelector('.amap');
        if (am) {
          const v = S.view;
          am.scrollLeft = S.sx[v] != null ? S.sx[v] : +am.dataset.sx || 0;
          am.onscroll = () => { S.sx[v] = am.scrollLeft; };
        }
        on('#aList', () => { S.alist = !S.alist; paint(); });
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
      if (!D.CARD[id]) return;
      const z = o.zoomEl;
      z.innerHTML = A.face(id) + '<div class="ztx"><b>' + esc(D.CARD[id].name) + '</b><br>' + esc(D.CARD[id].text) + '</div>';
      z.classList.remove('hide');
    }

    return { P: S, receive, paint, flash, setMe, setSkin };
  }

  const STYLES = `
:root{
  --bg:#0b1220; --panel:#182238; --panel2:#111a2c; --line:#33446a; --ink:#f2ecdc; --dim:#b2b9c9;
  --gold:#f1c75b; --us:#3b7be0; --su:#d8323a; --good:#6fcf7f; --bad:#ff6a6a;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
/* The browser's furniture off on the game surface (PHONE-APP-LESSONS D): no
   long-press callout or text selection on cards and the board, no double-tap
   zoom, no rubber-band scroll; typing still selects. */
html{-webkit-text-size-adjust:100%;overscroll-behavior:none}
body{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}
img,svg{-webkit-user-drag:none}
input,textarea{-webkit-user-select:text;user-select:text;font-size:16px}
/* Turned sideways (in bed): the same portrait column in the middle. */
@media (orientation:landscape) and (min-width:700px){
  html body{padding-left:calc(50vw - 260px);padding-right:calc(50vw - 260px)}
  html #bar{padding-left:calc(50vw - 260px);padding-right:calc(50vw - 260px)}
  html #flash{left:calc(50vw - 260px);right:calc(50vw - 260px)}
}
/* Reduce Motion: the dice cut straight to their faces; the words stay. */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
}
[hidden],.hide{display:none !important}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font:16px/1.4 Georgia,"Times New Roman",serif;
  padding:var(--inset-top, env(safe-area-inset-top)) 12px calc(96px + var(--inset-bottom, env(safe-area-inset-bottom)))}
header{display:flex;align-items:center;gap:8px;padding:10px 0 8px;position:sticky;top:0;background:var(--bg);z-index:5}
#dot{width:14px;height:14px;border-radius:3px;background:var(--gold);flex:none}
#who{font-weight:800}
#side{font-size:12px;color:var(--dim);font-family:system-ui,sans-serif}
#link{margin-left:auto;font-size:11px;color:var(--dim)}
#link.ok{color:var(--good)} #link.bad{color:var(--bad)}
h2{margin:16px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-family:system-ui,sans-serif}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:8px}
.card.mine{border-color:var(--gold)}
.title{font-weight:800;font-size:19px;color:var(--gold)}
.sub{color:var(--dim);font-size:13px;margin-top:2px}
button{font:inherit}
.btn{display:block;width:100%;background:var(--gold);border:0;color:#1b140c;font-weight:800;font-size:17px;border-radius:14px;padding:14px;margin-top:10px}
.btn:disabled{opacity:.4}
.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--dim);font-weight:600;font-size:15px}
.opts{display:flex;flex-direction:column;gap:7px;margin-top:10px}
.opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:10px 11px;font-size:15px}
.opt:disabled{opacity:.42}
.opt.on{border-color:var(--gold);background:rgba(241,199,91,.13)}
.opt .lab{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.opt .lab small{color:var(--dim);font-size:12px;line-height:1.25}
.opt .val{font-weight:800;font-size:13px;text-align:right;flex:none;font-family:system-ui,sans-serif;display:flex;gap:4px;align-items:center}
.why{color:#ffab9a;font-size:12px}
.coach{margin-top:8px;padding:9px 11px;border-radius:12px;background:rgba(111,207,127,.1);border:1px solid rgba(111,207,127,.55);font-size:14px;line-height:1.35}
.coach small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--good);font-weight:800;font-family:system-ui,sans-serif}
.coach .cshow{display:block;margin-top:7px;background:transparent;border:1px solid var(--good);color:var(--good);border-radius:9px;padding:5px 12px;font-size:13px;font-weight:700}
.tip{border-color:var(--good) !important;box-shadow:0 0 0 2px rgba(111,207,127,.4)}
.ed.tip{box-shadow:none;background:rgba(111,207,127,.08);border-radius:8px}
.warn{color:#ffcf8a;font-size:12px;font-family:system-ui,sans-serif}
.tick{width:22px;height:22px;border-radius:6px;border:2px solid var(--line);flex:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#1b140c}
.on .tick{background:var(--gold);border-color:var(--gold)}
.hand{display:flex;flex-direction:column;gap:7px;margin-top:8px}
.hc{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:9px 10px;font-size:14px}
.hc:disabled{opacity:.45}
.hc.sel{border-color:var(--gold);background:rgba(241,199,91,.12)}
.hc .ts-sp{font-size:15px}
.hc .tx{font-size:12.5px;color:var(--dim);line-height:1.3;font-family:system-ui,sans-serif}
.hc .x{font-size:11.5px;color:#ffab9a;font-family:system-ui,sans-serif}
.hc .x.ok{color:var(--good)}
.selbox{display:flex;gap:12px;margin-top:10px;align-items:flex-start}
.selbox .ts-card{width:42%;font-size:10px;flex:none}
.selbox .st{flex:1;min-width:0;font-size:13.5px;font-family:system-ui,sans-serif}
.selbox .st b{display:block;font-size:16px;color:var(--gold);margin-bottom:3px;font-family:Georgia,serif}
.pre{display:flex;align-items:center;gap:10px;margin:0 0 7px;padding:7px 9px;border-radius:12px;border:1px dashed var(--line);background:var(--panel2);font-size:13px;width:100%;color:var(--ink);text-align:left}
.pre.on{border-color:var(--gold);background:rgba(241,199,91,.13)}
.pre .tick{width:18px;height:18px}
.warnline{margin-top:8px;font-size:13px;color:#ffcf8a;font-family:system-ui,sans-serif}
.dangerline{margin-top:8px;font-size:13px;color:#ff9a9a;font-weight:700;font-family:system-ui,sans-serif}
.ed{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:14px}
.ed:first-child{border-top:0}
.ed .nm{flex:1;min-width:0}
.ed .nm small{display:block;color:var(--dim);font-size:11.5px;font-family:system-ui,sans-serif}
.ed .stp{display:flex;align-items:center;gap:6px;flex:none;font-family:system-ui,sans-serif}
.ed .stp button{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font-size:20px;font-weight:800}
.ed .stp button:disabled{opacity:.3}
.ed .stp b{min-width:26px;text-align:center;font-size:17px}
.bgm{font-style:normal;font:800 9px system-ui,sans-serif;background:#8d1d2c;color:#fff;border-radius:3px;padding:1px 3px;vertical-align:2px}
.rgh{margin:12px 0 2px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-family:system-ui,sans-serif;font-weight:800}
.tot{position:sticky;top:44px;background:var(--panel);z-index:2;padding:6px 0;font-family:system-ui,sans-serif;font-size:14px;color:var(--dim);border-bottom:1px solid var(--line)}
.tot b{color:var(--ink);font-size:17px}
.facts{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-size:13px;color:var(--dim);font-family:system-ui,sans-serif;align-items:center}
.facts b{color:var(--ink)}
.regs{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.reg{background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:6px 8px}
.reg .rh{display:flex;align-items:center;gap:8px;font-size:13px;font-family:system-ui,sans-serif;color:var(--dim);flex-wrap:wrap}
.reg .rh b{font-size:14px}
.sts{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.sc{display:inline-flex;align-items:center;gap:3px;border-radius:7px;padding:2px 5px;font-size:12px;font-family:system-ui,sans-serif;background:#232c46;color:var(--dim);border:1px solid transparent}
.sc.bg{border-color:#8d1d2c}
.sc.us{background:rgba(59,123,224,.3)}.sc.su{background:rgba(216,50,58,.3)}
.sc .stb{font-size:10px;opacity:.75}
.ts-ch{font-size:10.5px}
.since{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:9px 11px;margin-top:6px;font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:4px}
.since .sh{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;font-family:system-ui,sans-serif}
.since .more{align-self:flex-start;background:transparent;border:1px solid var(--line);color:var(--dim);border-radius:9px;padding:4px 10px;font-size:12px}
.reel{margin-top:6px;padding:9px 11px;border-radius:12px;background:rgba(241,199,91,.1);border:1px solid rgba(241,199,91,.5);font-size:14px}
.reel small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:800;font-family:system-ui,sans-serif}
.upnext{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(241,199,91,.14);border:1px solid var(--gold);color:var(--gold);font-weight:800}
.undo{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;background:var(--panel2);border:1px dashed var(--gold);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:14px;text-align:left}
.undo b{color:var(--gold);flex:none}
.seen{border-color:#9a7ad8}
.tracks{display:flex;gap:8px;margin-top:6px;font-family:system-ui,sans-serif}
.tracks > span{flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:6px;text-align:center;font-size:11px;color:var(--dim);display:flex;flex-direction:column;gap:2px}
.tracks b{font-size:18px;color:var(--ink)}
.dice{display:flex;gap:18px;justify-content:center;margin-top:10px}
.dice .ts-die{width:54px;height:54px}
#flash{position:fixed;left:12px;right:12px;bottom:calc(96px + var(--inset-bottom, env(safe-area-inset-bottom)));background:#2a1610;border:1px solid var(--bad);color:#ffd9de;border-radius:12px;padding:11px 13px;font-size:14px;z-index:40}
#bar{position:fixed;left:0;right:0;bottom:0;z-index:20;padding:9px 12px calc(10px + var(--inset-bottom, env(safe-area-inset-bottom)));background:var(--bg);border-top:1px solid var(--line);box-shadow:0 -12px 18px rgba(11,18,32,.85)}
#bar .btn{margin-top:0}
/* The decision lives under the thumb: a chosen card's ways to play it, a
   short answer, the lobby's Start — all in the pinned bar. */
#bar .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
#bar .grid .opt{padding:8px 9px;font-size:14px;align-items:flex-start;min-height:50px}
#bar .grid .opt .lab small,#bar .grid .opt .why{font-size:11px}
#bar .grid .opt .why{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#bar .opts{margin-top:0}
#bar .back{display:block;width:100%;margin-top:7px;background:transparent;border:0;color:var(--dim);font-size:13px;padding:4px;text-decoration:underline}
/* The shortest real phone is ~360x500 with its browser bars showing: the
   chosen card shrinks so its words and the bar both fit. */
@media (max-height:640px){
  .selbox .ts-card{width:30%}
  .selbox{gap:10px;margin-top:8px}
  .selbox .st{font-size:12.5px}
  .title{font-size:17px}
  .card{padding:10px}
}
#name{display:flex;gap:8px;margin:10px 0}
#name input{flex:1;font:inherit;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:12px}
.rc-h{font-weight:900;font-size:23px;color:var(--gold);line-height:1.15}
.rc-sub{font-size:14px;margin-top:3px}
.rc-sc{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px}
.rc-p{display:flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:7px 10px;font-size:14px;flex-wrap:wrap}
.rc-p i{width:11px;height:11px;border-radius:2px;flex:none}
.rc-role{font-size:10px;color:var(--dim);text-transform:uppercase}
.rc-t{flex-basis:100%;color:var(--ink);font-size:13px}
.rc-sec{margin-top:10px}
.rc-sec ul{margin:0;padding-left:1.1em;font-size:13.5px}
.siteL{display:flex;align-items:center;gap:6px;font-size:14px;padding:6px 0;border-top:1px solid var(--line)}
.siteL:first-child{border-top:0}
.siteL b{flex:1}
#zoom{position:fixed;inset:0;z-index:50;background:rgba(5,8,16,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:12px}
#zoom .ts-card{width:min(70vw,300px);font-size:15px}
#zoom .ztx{max-width:420px;font-size:15px;text-align:center;color:var(--ink)}
`;
  const STYLES2 = `
.tabs{display:flex;gap:6px;margin:4px 0 6px}
.tab{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--dim);border-radius:10px;padding:7px;font-weight:800;font-size:14px;font-family:system-ui,sans-serif}
.tab.on{background:var(--gold);border-color:var(--gold);color:#1b140c}
.trk{display:flex;gap:6px;font-family:system-ui,sans-serif}
.trk > span{flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:4px 6px;text-align:center;display:flex;flex-direction:column;line-height:1.15}
.trk small{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.trk b{font-size:16px}
.trk .dc.l5 b{color:#5cc46b}.trk .dc.l4 b{color:#b7d35a}.trk .dc.l3 b{color:#f1c75b}.trk .dc.l2 b{color:#ff8a3c}.trk .dc.l1 b{color:#ff3b3b}
.trk .dc.l2,.trk .dc.l1{border-color:#ff8a3c}
.trk .vp.us b{color:#9cc2ff}.trk .vp.su b{color:#ff9a9e}
.mapbox{overflow-x:auto;overflow-y:hidden;border:1px solid var(--line);border-radius:12px;margin-top:6px;-webkit-overflow-scrolling:touch;background:#0d1729}
.mapin{width:780px;aspect-ratio:5100/3300}
.showc{text-align:center}
.showc .dh{font-size:19px;font-weight:900;color:var(--gold)}
.showc .ds{font-size:13px;color:var(--dim);margin:2px 0 8px;font-family:system-ui,sans-serif}
.showc .dice{display:flex;gap:22px;justify-content:center;margin:8px 0}
.showc .dice > div{display:flex;flex-direction:column;align-items:center;gap:4px;font-weight:800;font-size:14px}
.showc .ts-die{width:64px;height:64px}
.showc .ts-die.roll{animation:tsTumble .32s linear infinite}
.showc .ts-die.land{animation:tsLand .45s ease-out}
.showc .res{font-size:18px;font-weight:900;margin-top:4px}
@keyframes tsTumble{0%{transform:rotate(0)}50%{transform:rotate(180deg) translateY(-6px)}100%{transform:rotate(360deg)}}
@keyframes tsLand{from{transform:scale(1.4)}to{transform:none}}
#flash.good{border-color:var(--good);background:#12291a;color:#d6ffe0}
.sban{position:relative;aspect-ratio:16/9;margin:-4px -4px 8px;border-radius:10px;overflow:hidden;background:#05080f}
.sb-l{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sb-ship{position:absolute;inset:0}
.sban.up .sb-ship{transform:translateY(-55%)}
.sban.ring .sb-phone{filter:drop-shadow(0 0 8px rgba(255,40,40,.95)) brightness(1.2)}
`;
  /* The new parts (gauges, the card tray, the map for placing influence, the
     result panels) and the two looks. Every colour a part uses is a variable,
     so a look is a set of variables plus its own decorations. In Dossier the
     desk is dark and the paper is light: the paper sets its own ink. */
  const STYLES3 = `
:root{--head:Georgia,serif;--headW:800;--mono:'Courier New',Courier,monospace;--r:10px;--titlebg:var(--panel2);--titlec:var(--gold);--ptbg:#11161e;--ptc:#f1c75b;
  --stampc:#4fe07a;--stampno:#ff5a5a;--usink:#9cc2ff;--suink:#ff9a9e;--warnink:#ffab9a;--mapB:2px solid var(--line);--mapSh:none}
.gauge{display:grid;grid-template-columns:auto 1fr auto;gap:5px 8px;align-items:center;margin:2px 0 6px;padding:7px 9px 8px;border:1px solid var(--line);border-radius:var(--r);background:var(--panel);position:relative;color:var(--ink)}
.gs{display:flex;align-items:center;gap:6px;min-width:0}
.gs b{display:block;font:var(--headW) 13px/1.05 var(--head);letter-spacing:.06em;text-transform:uppercase}
.gs small{display:block;font:500 10.5px/1.2 system-ui,sans-serif;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:84px}
.gs.su{flex-direction:row-reverse;text-align:right}
.seal{width:26px;height:26px;border-radius:6px;display:inline-grid;place-items:center;flex:none}
.seal.us{background:#1f4f9e;box-shadow:inset 0 0 0 2px #9cc2ff}.seal.su{background:#b5161f;box-shadow:inset 0 0 0 2px #ffb0b0}
.seal svg{width:18px;height:18px}
.gv{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.vpw{font:700 11.5px/1 var(--mono);white-space:nowrap}
.vpw.us{color:var(--usink)}.vpw.su{color:var(--suink)}
.vbar{position:relative;display:block;width:100%;height:12px;border-radius:6px;background:linear-gradient(90deg,#b5161f,#4a2226 46%,#2a2f3a 50%,#1f3560 54%,#1f4f9e);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.vbar u{position:absolute;top:-1px;bottom:-1px;left:50%;width:1px;background:rgba(255,255,255,.65)}
.vbar i{position:absolute;top:-4px;width:8px;height:20px;margin-left:-4px;border-radius:3px;background:#f6f0dc;box-shadow:0 0 0 1.5px #111,0 0 7px rgba(255,240,200,.8)}
.gt{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:5px 8px;font:700 11px/1 var(--mono);white-space:nowrap}
.tc.sel{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold)}
.tc .x.lab{color:var(--gold)}.tc .x.sub2{color:var(--dim)}
.gn{display:inline-flex;align-items:center}
.lamps{display:inline-flex;gap:3px;align-items:center}
.lamps em{font:var(--headW) 10px var(--head);letter-spacing:.08em;color:var(--dim);font-style:normal;margin-right:2px}
.lp{width:16px;height:16px;border-radius:50%;display:inline-grid;place-items:center;font:800 9px/1 system-ui,sans-serif;font-style:normal;color:rgba(255,255,255,.5);background:#2b2f36;box-shadow:inset 0 0 0 1.5px #545a64;flex:none}
.lp.on{color:#111;box-shadow:0 0 0 1.5px #fff,0 0 9px var(--lc)}
.lp.on.d5{--lc:#4fb35d;background:#4fb35d}.lp.on.d4{--lc:#d5cc3c;background:#d5cc3c}.lp.on.d3{--lc:#f08f2a;background:#f08f2a}
.lp.on.d2{--lc:#e3343c;background:#e3343c;color:#fff}.lp.on.d1{--lc:#fff;background:#fff}
.mo{display:inline-flex;gap:2px;margin-left:4px}
.mo + .mo{margin-left:5px}
.mo i{width:5px;height:11px;border-radius:1.5px;background:#3a3f48;box-shadow:inset 0 0 0 1px #5a606b}
.mo i.us{background:#3b7be0;box-shadow:none}.mo i.su{background:#d8323a;box-shadow:none}
.mo i.over{opacity:.6}

/* the hand as cards */
.tray{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
.tc{display:flex;flex-direction:column;gap:5px;padding:5px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);color:var(--ink);text-align:left;min-width:0;font:inherit}
.tc:disabled{opacity:.45}
.tc .tf{display:block}
.tc .ts-card{width:100%;font-size:7.4px;box-shadow:0 2px 6px rgba(0,0,0,.35)}
.tc .tcap{display:flex;flex-direction:column;gap:2px;min-width:0}
.tc .ts-sp{font-size:12px;line-height:1.2}
.tc .ts-sp em{display:none}
.tc .ts-sp{align-items:flex-start}
.tc .ts-sp b{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.15}
.tc .ts-ops{width:1.6em;height:1.6em;font-size:11px}
.tc .x{font:600 10.5px/1.2 system-ui,sans-serif;color:var(--warnink)}
.tc .x.ok{color:var(--good)}
.tc.tip{border-color:var(--good);box-shadow:0 0 0 2px rgba(111,207,127,.45)}

/* placing influence on the map */
.pips{display:flex;gap:4px;margin:6px 0 2px;flex-wrap:wrap}
.pips i{width:20px;height:8px;border-radius:4px;background:rgba(127,127,127,.35)}
.pips i.on{background:#3fbf63;box-shadow:0 0 6px rgba(63,191,99,.6)}
.vtabs{display:flex;gap:4px;flex-wrap:wrap;margin:8px 0 6px}
.vt{flex:1 1 auto;font:var(--headW) 11.5px/1 var(--head);letter-spacing:.03em;text-transform:uppercase;padding:8px 7px 6px;border-radius:8px;border:1px solid var(--line);border-bottom:3px solid var(--rc);background:var(--panel2);color:var(--dim)}
.vt small{margin-left:5px;font:700 10px system-ui,sans-serif;padding:1px 5px;border-radius:7px;background:rgba(0,0,0,.2)}
.vt.on{color:var(--ink);background:var(--panel);box-shadow:inset 0 0 0 1px var(--rc)}
.amap{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;border-radius:8px;background:#0d1729;border:var(--mapB);box-shadow:var(--mapSh);margin:0 -4px}
.amin{position:relative;margin:0 auto}
.amin svg.ts-board{position:absolute;inset:0;width:100%;height:100%}
.mc{position:absolute;background:transparent;border:0;border-radius:6px;padding:0;margin:0}
.mc:not(:disabled):active{background:rgba(255,230,120,.3)}
.mk{position:absolute;min-width:36px;height:30px;padding:0 7px;border-radius:15px;background:#2f9e52;color:#fff;font:900 15px/1 system-ui,sans-serif;border:2px solid #e9ffe9;box-shadow:0 2px 6px rgba(0,0,0,.55);z-index:2}
.mk.rem{background:#b5161f;border-color:#ffd0d0}
.ts-hi.legal{stroke:#ffd24a;stroke-width:9;opacity:.9}
.ts-hi.tipc{stroke:#6fcf7f;stroke-width:16}
.placed{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:30px;align-items:center}
.pc{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:15px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font:600 13px system-ui,sans-serif}
.pc b{color:var(--good)}
.pc span{opacity:.55}
.lsw{display:block;margin-top:8px;background:transparent;border:0;color:var(--dim);text-decoration:underline;font-size:13px;padding:4px 0}
.alloc .tot{position:static}

/* result panels */
.pnl{position:relative;overflow:hidden}
.coupp .sban{aspect-ratio:16/5.2;margin-bottom:0}
.coupp .sban .sb-l{object-position:50% 62%}
.coupp .ptl{margin-top:0}
.ptl{display:flex;align-items:center;justify-content:center;gap:9px;padding:10px;margin:0 -12px;border-bottom:1px solid var(--line);background:var(--titlebg)}
.card > .pnl:first-child > .ptl:first-child{margin-top:-12px;border-radius:13px 13px 0 0}
.ptl span{font:var(--headW) 21px/1 var(--head);letter-spacing:.06em;text-transform:uppercase;color:var(--titlec)}
.ptl .seal{width:24px;height:24px}
.pby{text-align:center;font:600 12px/1.3 var(--mono);color:var(--dim);margin:7px 0 2px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.bx{border-radius:10px;padding:7px 8px 8px;background:var(--panel2);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;min-width:0}
.bx .k{font:var(--headW) 10.5px var(--head);letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.bx .v{font:var(--headW) 26px/1 var(--head);color:var(--ink)}
.bx small{font:600 11px/1.25 var(--mono);color:var(--dim)}
.mini .ts-card{font-size:6.4px;width:12em}
.eq{display:flex;align-items:center;gap:12px;margin-top:8px;padding:10px 112px 10px 10px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);position:relative;text-align:left}
.showc .eq .ts-die{width:60px;height:60px;flex:none}
.sum{font:var(--headW) 23px/1.05 var(--head);color:var(--ink)}
.sum small{display:block;font:600 11px/1.25 var(--mono);color:var(--dim);margin-top:4px;letter-spacing:0}
.stamp{position:absolute;right:8px;top:50%;transform:translateY(-50%) rotate(-11deg);font:400 22px/1 Impact,'Avenir Next Condensed','Arial Narrow',sans-serif;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--stampc);border:3px solid var(--stampc);border-radius:6px;padding:5px 8px 3px}
.stamp.no{color:var(--stampno);border-color:var(--stampno)}
.after{display:flex;gap:10px;align-items:center;margin-top:8px;text-align:left;font-size:13.5px;line-height:1.35}
.facts2{display:flex;flex-direction:column;gap:6px;margin-top:8px;text-align:left}
.fact{display:flex;gap:9px;align-items:center;border-radius:9px;padding:7px 9px;background:var(--panel2);border:1px solid var(--line);font-size:13px;line-height:1.3}
.fact.warn{border-color:#f08f2a}
.fact b{font-family:var(--head);font-weight:var(--headW);letter-spacing:.03em}
.cbx{width:112px;border-radius:7px;overflow:hidden;border:2px solid var(--rcx);background:color-mix(in srgb,var(--rcx) 20%,#141b2c);text-align:left;color:#e9e4d4;flex:none}
.cbx .bn{display:flex;justify-content:space-between;align-items:center;gap:4px;padding:3px 6px;font:800 12px system-ui,sans-serif;background:var(--rcx);color:#111}
.cbx .bn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cbx.bg .bn{background:#8d1d2c;color:#fff}
.cbx .bn s{text-decoration:none;font-weight:900}
.cbx.bg .bn s{color:#ffe1a0}
.cbx .ch{display:flex;gap:6px;padding:6px}
.cbx .ch span{flex:1;height:30px;border-radius:6px;display:grid;place-items:center;font:900 19px system-ui,sans-serif}
.cbx .ch .us{background:#eef4ff;color:#1d4fa8;box-shadow:inset 0 0 0 2.5px #3b7be0}
.cbx .ch .su{background:#fff0ef;color:#a3161d;box-shadow:inset 0 0 0 2.5px #d8323a}
.cbx .ch .us.ctl{background:#2f68cf;color:#fff}.cbx .ch .su.ctl{background:#c8222b;color:#fff}
.cbx .ch .z{opacity:.35}
.sc3{display:grid;grid-template-columns:minmax(0,1fr) 96px minmax(0,1fr);gap:6px;margin-top:8px;align-items:start}
.col{display:flex;flex-direction:column;gap:5px;min-width:0}
.col .who{display:flex;align-items:center;gap:5px;justify-content:center;padding:4px;border-radius:8px;font:var(--headW) 13px var(--head);letter-spacing:.06em;color:#fff;text-transform:uppercase}
.col.us .who{background:linear-gradient(#2c5fb8,#1b3f80)}.col.su .who{background:linear-gradient(#c62a32,#8e141b)}
.col .who .seal{width:20px;height:20px;background:transparent;box-shadow:none}
.row{border-radius:7px;padding:5px 6px;background:var(--panel2);border:1px solid var(--line);text-align:left}
.row .k{font:var(--headW) 9.5px var(--head);letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.row .v{display:flex;justify-content:space-between;align-items:baseline;gap:4px;margin-top:2px}
.row .v b{font:var(--headW) 13.5px/1.1 var(--head);color:var(--ink);min-width:0;overflow-wrap:anywhere}
.row .v em{font:var(--headW) 14px var(--head);font-style:normal;padding:1px 6px;border-radius:5px;background:var(--ptbg);color:var(--ptc)}
.row .nm{font:600 10px/1.25 system-ui,sans-serif;color:var(--dim);margin-top:3px}
.row.tot{border-width:2px}
.col.us .row.tot{border-color:#3b7be0}.col.su .row.tot{border-color:#d8323a}
.mid{display:flex;flex-direction:column;align-items:center;gap:6px}
.mid .ts-card{font-size:7.4px;width:12em}
.lvk{font:600 9.5px/1.3 var(--mono);color:var(--dim);text-align:center}
.lvk b{color:var(--ink)}
.net{margin-top:9px;border-radius:10px;padding:9px 10px 10px;background:var(--panel2);border:1px solid var(--line);text-align:center}
.nh{font:var(--headW) 18px/1.2 var(--head);color:var(--ink)}
.nh .us{color:var(--usink)}.nh .su{color:var(--suink)}
.vpb{position:relative;height:26px;margin:8px 4px 0}
.vpb .bar{position:absolute;left:0;right:0;top:7px;height:12px;border-radius:6px;background:linear-gradient(90deg,#b5161f,#4a2226 46%,#2a2f3a 50%,#1f3560 54%,#1f4f9e);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.vpb .bar u{position:absolute;top:-3px;bottom:-3px;left:50%;width:1.5px;background:rgba(255,255,255,.7)}
.vpb i{position:absolute;top:1px;width:12px;height:24px;margin-left:-6px;border-radius:4px}
.vpb i.was{box-shadow:0 0 0 2px #f6f0dc;opacity:.6}
.vpb i.now{background:#f6f0dc;box-shadow:0 0 0 2px #111,0 0 10px rgba(255,240,200,.9)}
.ends{display:flex;justify-content:space-between;font:600 9.5px var(--mono);color:var(--dim);margin:2px 4px 0}
.vpl{font:600 11.5px var(--mono);color:var(--dim);margin-top:4px}

/* ============ Situation Room: gunmetal, amber, rivets ============ */
html.skin-steel{--bg:#0b0e13;--panel:linear-gradient(180deg,#363d4a,#232832);--panel2:#1a1f27;--line:#59616e;--ink:#ece6d6;--dim:#a6adb8;--gold:#f1c75b;--good:#6fcf7f;--bad:#ff6a6a;
  --head:Impact,Haettenschweiler,'Avenir Next Condensed','Arial Narrow',sans-serif-condensed,sans-serif;--headW:400;--mono:'Courier New',Courier,monospace;--r:10px;
  --titlebg:linear-gradient(#5a1216,#3a0b0e);--titlec:#fff1cf;--ptbg:#11161e;--ptc:#f1c75b;--stampc:#4fe07a;--stampno:#ff5a5a;--usink:#9cc2ff;--suink:#ff9a9e;--warnink:#ffab9a;
  --mapB:3px solid #4b5361;--mapSh:inset 0 0 0 1px #000,0 3px 10px rgba(0,0,0,.6)}
.skin-steel .card,.skin-steel .gauge{box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 2px 6px rgba(0,0,0,.5)}
.skin-steel .card::before,.skin-steel .gauge::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(circle at 7px 7px,#aab2bf 0 1.6px,#3a404b 2.4px,transparent 3px),radial-gradient(circle at calc(100% - 7px) 7px,#aab2bf 0 1.6px,#3a404b 2.4px,transparent 3px),radial-gradient(circle at 7px calc(100% - 7px),#aab2bf 0 1.6px,#3a404b 2.4px,transparent 3px),radial-gradient(circle at calc(100% - 7px) calc(100% - 7px),#aab2bf 0 1.6px,#3a404b 2.4px,transparent 3px)}
.skin-steel .card{position:relative}
.skin-steel :is(.title,h2,.rc-h,.dh,.tab){font-family:var(--head);font-weight:400;letter-spacing:.05em;text-transform:uppercase}
.skin-steel .title{font-size:20px}
.skin-steel .reel{background:linear-gradient(#0f1a14,#0b130f);border-color:#2f5a3a;color:#bfe8c4;font-family:var(--mono);font-size:13px}
.skin-steel .reel small{color:#f1c75b}
.skin-steel .btn:not(.ghost){background:linear-gradient(#f7d777,#d9a83a);border:1px solid #fff2c2;box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.5);font-family:var(--head);font-weight:400;letter-spacing:.06em;text-transform:uppercase}
.skin-steel .tab.on{background:linear-gradient(#f7d777,#d9a83a)}

/* ============ Dossier: manila, typewriter, rubber stamps ============ */
html.skin-file{--bg:#3a2b1f;--panel:#efe2bd;--panel2:#e6d6aa;--line:#6b543b;--ink:#f4ead2;--dim:#d6c49c;--gold:#e8c46a;--good:#7fd08e;--bad:#ff8a7a;
  --head:'American Typewriter','Courier New',Courier,monospace;--headW:700;--mono:'American Typewriter','Courier New',Courier,monospace;--r:4px;
  --titlebg:repeating-linear-gradient(-45deg,#e9dbb2 0 10px,#e2d2a4 10px 20px);--titlec:#a3161d;--ptbg:#2a2218;--ptc:#f6ecd0;--stampc:#a3161d;--stampno:#2a2218;--usink:#9cc2ff;--suink:#ff9a9e;--warnink:#ffab9a;
  --mapB:5px solid #f6f1e3;--mapSh:0 3px 10px rgba(0,0,0,.55)}
html.skin-file body{background:repeating-linear-gradient(90deg,rgba(0,0,0,.06) 0 2px,transparent 2px 11px),linear-gradient(#46341f,#2c2016) fixed;background-color:#3a2b1f}
/* the paper: its own ink */
.skin-file :is(.card,.since,.reel,.hc,.opt,.reg,.coach,.undo,.pre,.gauge,.tc,.tracks > span,.upnext,.pc,.vt,.tab,.lsw,#msheet .msheet){--ink:#2a2218;--dim:#6d5a3f;--line:#b39f73;--panel:#efe2bd;--panel2:#e6d6aa;--gold:#a3161d;--good:#2e7d3e;--bad:#a3161d;--usink:#1d4fa8;--suink:#a3161d;--warnink:#a3161d;color:var(--ink)}
.skin-file :is(.card,.gauge,#msheet .msheet){background:#efe2bd url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .1  0 0 0 .1 0'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>");border-color:#b39f73;box-shadow:0 2px 0 #c8b585,0 5px 12px rgba(0,0,0,.45)}
.skin-file .card.mine{border-color:#a3161d}
.skin-file :is(.title,h2,.rc-h,.dh,.tab,.tot,.lsw){font-family:var(--head)}
.skin-file .title{letter-spacing:.02em}
.skin-file h2{letter-spacing:.08em}
.skin-file .reel{background:repeating-linear-gradient(#fbf6e6 0 19px,#cfe0f0 19px 20px);border-color:#b39f73;font-family:var(--mono);font-size:13.5px}
.skin-file .reel small{color:#a3161d}
.skin-file .btn:not(.ghost){background:#a3161d;color:#fff3e0;border:2px solid #6e0d12;box-shadow:0 3px 0 #5e0a0e,0 4px 10px rgba(0,0,0,.4);font-family:var(--head);letter-spacing:.06em;text-transform:uppercase}
.skin-file .btn.ghost{border-color:#8c7652}
.skin-file .opt.on{background:#f6e3c8;box-shadow:inset 0 0 0 2px #a3161d;color:#2a2218}
.skin-file .namein input{background:#fbf6e6;color:#2a2218;border-color:#b39f73;font-family:var(--mono)}
.skin-file .tab.on{background:#f6ecd0;color:#2a2218;border-color:#a3161d}
.skin-file .tab{background:#d9c89a;color:#5b4a30;border-radius:8px 8px 3px 3px}
.skin-file :is(.why,.hc .x,.dangerline){color:#a3161d}
.skin-file :is(.warn,.warnline){color:#8a4b00}
.skin-file .sc{background:#dccb9b;color:#2a2218}
.skin-file .sc.us{background:rgba(59,123,224,.28)}.skin-file .sc.su{background:rgba(216,50,58,.25)}
.skin-file .gauge .lp:not(.on){background:#cbb98a;box-shadow:inset 0 0 0 1.5px #8c7a52;color:rgba(0,0,0,.45)}
.skin-file .gauge .mo i:not(.us):not(.su){background:#cbb98a;box-shadow:inset 0 0 0 1px #8c7a52}
.skin-file .ptl span{border:3px solid #a3161d;padding:4px 8px 3px;transform:rotate(-1.5deg);border-radius:3px}
.skin-file .pnl::after{content:"TOP SECRET";position:absolute;right:-32px;top:15px;transform:rotate(30deg);font:900 10.5px/1 Impact,'Avenir Next Condensed',sans-serif;letter-spacing:.2em;color:#fff;background:#a3161d;padding:3px 36px;opacity:.85;pointer-events:none}
.skin-file .stamp{mix-blend-mode:multiply;font-family:var(--head)}
/* the side inks the words set inline, darkened for paper */
.skin-file :is(.card,.since,.reel,.hc,.opt,.reg,.gauge,.tc) [style*="#9cc2ff"]{color:#1d4fa8 !important}
.skin-file :is(.card,.since,.reel,.hc,.opt,.reg,.gauge,.tc) [style*="#ff9a9e"]{color:#a3161d !important}
.skin-file :is(.card,.since,.reel,.hc,.opt,.reg,.gauge,.tc) [style*="#f1d58a"]{color:#6d4c0f !important}
.skin-file :is(.card,.since,.reel,.hc,.opt,.reg,.gauge,.tc) [style*="#c8b0ff"]{color:#5b3a9e !important}
.skin-file .seen .title{color:#5b3a9e !important}
.skin-file :is(.card,.tc,.hc,.opt) .ts-sp.us em{color:#1d4fa8}.skin-file :is(.card,.tc,.hc,.opt) .ts-sp.su em{color:#a3161d}
`;
  const Phone = { VERSION, create, SKINS, STYLES: STYLES + STYLES2 + STYLES3 };
  root.TSPhone = Phone;
})(typeof window !== 'undefined' ? window : this);
