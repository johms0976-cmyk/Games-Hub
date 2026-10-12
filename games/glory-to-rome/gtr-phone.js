'use strict';
/* Glory to Rome — the handset. All of it, with no networking of its own:
 * controller.html gives it a socket to the hub, solo.html gives it the
 * in-page host. It paints from two messages — {t:'gtr'} (the public table)
 * and {t:'gtr-me'} (this seat's half) — and sends orders back with `send`.
 *
 * Tabs: Play (the question, the house's newest move, your camp, your hand),
 * Table (the Pool, the Sites, every camp) and Rules. The checklist's phone
 * rules apply: the menu comes from the engine as ready-made options, a
 * button is never offered that would be refused, everything that appears
 * unasked ignores taps for a moment, the primary action is pinned at the
 * bottom, and the public view and this seat's half may arrive in either
 * order (a question is drawn only while the table still lists it as open).
 */
(function (root) {
  const D = root.GtrData, A = root.GtrArt, W = root.GtrWords;
  const VERSION = 1;
  const esc = A.esc;
  const LOCK_MS = 450;
  const TICK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="#1b1408" stroke-width="2.4" fill="none"/></svg>';

  function create(o) {
    const $ = id => document.getElementById(id);
    const P = {
      id: null, name: '', hex: '#c9a84c', pub: null, me: null, undo: null,
      tab: 'play', drop: null, dropAll: false, multi: [], lockUntil: 0, shape: '', myTurn: false,
      sinceAll: false, finStage: '', solo: !!o.solo, armed: null
    };
    const send = m => o.send(m);
    const locked = () => Date.now() < P.lockUntil;
    const lock = () => { P.lockUntil = Date.now() + LOCK_MS; };
    const buzz = ms => { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
    const game = () => P.pub && P.pub.game;
    const mine = () => { const g = game(); return g ? g.players.find(p => p.id === P.id) : null; };
    const pname = id => { const g = game(); const p = g && g.players.find(x => x.id === id); return p ? p.name : '?'; };
    const isRemote = () => P.pub && P.pub.remote === P.id;
    const act = a => { if (locked()) return; lock(); send({ t: 'do', a }); };
    const myPrompt = () => {
      if (!P.me || !P.me.prompt) return null;
      const g = game();
      if (!g || !g.prompt || g.prompt.n !== P.me.prompt.n || g.prompt.seat !== P.id) return 'stale';
      return P.me.prompt;
    };

    /* ================================================================
       Messages in
       ================================================================ */
    function receive(m) {
      if (m.t === 'gtr') { P.pub = m; if (!m.game) P.me = null; paint(); return; }
      if (m.t === 'gtr-me') { P.me = m.me; P.undo = m.undo || null; paint(); return; }
      if (m.t === 'flash') { flash(m.text, m.tone); }
    }
    let flashTimer = null;
    function flash(text, tone) {
      const el = o.flashEl;
      if (!el) return;
      clearTimeout(flashTimer);
      el.textContent = text;
      el.className = tone === 'good' ? 'good' : '';
      buzz(40);
      flashTimer = setTimeout(() => { el.className = 'hide'; }, Math.max(2600, String(text).length * 45));
    }

    /* ================================================================
       Painting
       ================================================================ */
    function paint() {
      const pr = myPrompt();
      const pub = P.pub;
      const h = pub && pub.hold;
      const show = pub && pub.show;
      const shape = [pub && pub.screen, pr && pr !== 'stale' ? pr.t + pr.n : '-', h ? 'hold' + (h.waiting.indexOf(P.id) >= 0 ? 'w' : 'd') : '', show ? 'sh' + show.n : '', P.tab].join('|');
      if (shape !== P.shape) {
        const was = P.shape.split('|')[1] || '';
        P.multi = []; P.armed = null;
        if (!(pr && pr !== 'stale' && /^(lead|follow|think)/.test(pr.t) && /^(lead|follow|think)/.test(was))) { P.drop = null; P.dropAll = false; }
        P.shape = shape; lock();
        if (o.scrollTop) o.scrollTop();
      }
      const g0 = game();
      const mineNow = !!(g0 && g0.phase !== 'over' && g0.prompt && g0.prompt.seat === P.id && (g0.prompt.t === 'lead' || g0.prompt.t === 'follow') && !h);
      if (mineNow && !P.myTurn) buzz([90, 60, 90]);
      P.myTurn = mineNow;
      const fst = pub && pub.finale ? pub.finale.n + pub.finale.stage : '';
      if (fst !== P.finStage) {
        const f = pub && pub.finale;
        if (f && f.stage === 'winner' && g0 && g0.result) { const r = g0.result.rows.find(x => x.id === P.id); buzz(r && r.won ? [200, 90, 200, 90, 500] : 120); }
        P.finStage = fst;
      }
      const me = mine();
      if (o.onMe) o.onMe(me);
      const m = o.root;
      o.bar.classList.add('hide'); o.bar.innerHTML = '';
      if (!pub) { m.innerHTML = waitCard('Waiting for the telly', 'Glory to Rome has not been started yet.'); return; }
      if (pub.screen === 'lobby') { m.innerHTML = lobbyHtml(); wire(); return; }
      const tabs = tabsHtml();
      if (P.tab === 'table') { m.innerHTML = tabs + tableHtml(); wire(); return; }
      if (P.tab === 'rules') { m.innerHTML = tabs + rulesHtml(); wire(); return; }
      if (pub.screen === 'over') { m.innerHTML = tabs + overHtml(); wire(); return; }
      if (!game()) { m.innerHTML = waitCard('Hold tight', ''); return; }
      if (!me) { m.innerHTML = tabs + waitCard('Watching', 'The table was full when this game started.') + tableHtml(); wire(); return; }
      if (!P.me) { m.innerHTML = waitCard('Dealing you in', ''); return; }
      if (pub.paused) { m.innerHTML = tabs + waitCard('Paused', 'The house waits while your screen is away.'); wire(); return; }
      if (h) m.innerHTML = tabs + holdHtml() + campHtml(me) + handHtml();
      else {
        const turnish = pr && pr !== 'stale' && (pr.t === 'lead' || pr.t === 'follow');
        m.innerHTML = tabs + showHtml() + reelHtml(pr) + sinceHtml() + undoHtml() + askHtml(pr) + hurryHtml() + campHtml(me) + (turnish ? '' : handHtml());
      }
      wire();
    }
    const waitCard = (title, sub, extra) => '<div class="card"><div class="title">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + (extra || '') + '</div>';
    function tabsHtml() {
      const t = (k, l) => '<button class="tab' + (P.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + l + '</button>';
      return '<div class="tabs">' + t('play', 'Play') + t('table', 'Table') + t('rules', 'Rules') + '</div>';
    }

    /* ---------- the opening card ---------- */
    function holdHtml() {
      const h = P.pub.hold;
      const others = h.waiting.filter(id => id !== P.id);
      let foot = '';
      if (h.waiting.indexOf(P.id) >= 0) {
        o.bar.innerHTML = '<button class="btn" id="cont">Continue</button>';
        o.bar.classList.remove('hide');
        foot = P.solo ? '' : '<div class="sub" style="margin-top:8px">The game waits until everybody has read this.</div>';
      } else if (others.length) {
        foot = '<div class="sub" style="margin-top:8px">Waiting for ' + esc(others.map(pname).join(', ')) + ' to read it.</div>' +
          (h.grace && h.done.indexOf(P.id) >= 0 ? '<button class="btn ghost" id="nowait">Don’t wait for ' + esc(others.map(pname).join(' and ')) + '</button>' : '');
      }
      return '<div class="card mine opencard">' + W.startCardHtml(game()) + foot + '</div>';
    }
    /* ---------- a lead, a demand, a building finished (the telly shows it) ---------- */
    function showHtml() {
      const s = P.pub.show;
      if (!s) return '';
      const who = esc(pname(s.by));
      let head = '', body = '';
      if (s.k === 'lead') {
        head = who + ' leads ' + esc(D.ROLE[s.role].name);
        body = '<div class="row">' + s.cards.map(k => '<div class="mcard">' + A.card(k, 'tile') + '</div>').join('') + '</div><div class="sub">' + esc(D.ROLE[s.role].does) + '</div>';
      } else if (s.k === 'demand') {
        head = who + ': “Rome demands ' + s.mats.map(m => D.MAT[m].name).join(' and ') + '!”';
        body = '<div class="row">' + s.mats.map(m => A.mat(m, null, { big: true })).join(' ') + '</div><div class="sub">From the Pool and from ' + (game().players.length > 3 ? 'each neighbour' : 'everyone else') + '. No card of it: “Glory to Rome!”</div>';
      } else if (s.k === 'done') {
        head = who + ' finishes the ' + esc(D.nameOf(s.card));
        body = '<div class="zcard">' + A.card(s.card, 'full') + '</div><div class="sub">+' + D.MAT[s.site].value + ' influence, now ' + s.inf + '.</div>';
      }
      const foot = P.solo ? '<button class="btn ghost small" id="showOk">Go on</button>' : '<div class="sub">On the telly now.</div>';
      return '<div class="card showcard"><div class="title">' + head + '</div>' + body + foot + '</div>';
    }

    /* ---------- the house's newest move, and since your last turn ---------- */
    function allLines() {
      const g = game();
      if (!g || !g.log || !g.log.length) return [];
      return W.lines(g.log, g, (g.logN || g.log.length) - g.log.length);
    }
    function reelHtml(pr) {
      const g = game();
      if (!g || g.phase === 'over') return '';
      const ls = allLines().filter(l => !l.turn && l.by && l.by !== P.id && l.t !== 'acts');
      const l = ls[ls.length - 1];
      if (!l) return '';
      const p = g.players.find(x => x.id === l.by);
      if (!p || !p.bot) return '';
      return '<div class="reel" style="--h:' + esc(p.hex) + '"><small>Just now' + (pr && pr !== 'stale' && (pr.t === 'lead' || pr.t === 'follow') ? ' · your turn' : '') + '</small>' + W.html(l, g) + '</div>';
    }
    function sinceLines() {
      const all = allLines();
      let i = all.length - 1;
      while (i >= 0 && all[i].by === P.id) i--;
      const out = [];
      let reached = false;
      for (; i >= 0; i--) {
        const l = all[i];
        if (l.by === P.id) { if (W.CHOSE[l.t]) { reached = true; break; } continue; }
        if (l.turn || l.t === 'acts') continue;
        out.unshift(l);
      }
      return { lines: out, first: !reached };
    }
    function sinceHtml() {
      const s = sinceLines();
      const g = game();
      const last = s.lines[s.lines.length - 1];
      const lp = last && g.players.find(p => p.id === last.by);
      if (lp && lp.bot) s.lines = s.lines.slice(0, -1);
      if (!s.lines.length) return '';
      const MAX = 6;
      const shown = P.sinceAll ? s.lines : s.lines.slice(-MAX);
      const hidden = s.lines.length - shown.length;
      return '<div class="since"><div class="sh">' + (s.first ? 'So far' : 'Since your last move') + '</div>' +
        (hidden ? '<button class="more" id="sinceMore">' + hidden + ' earlier</button>' : '') +
        shown.map((l, k) => '<div class="sl' + (k === shown.length - 1 ? ' new' : '') + '">' + W.html(l, g) + '</div>').join('') +
        (P.sinceAll && s.lines.length > MAX ? '<button class="more" id="sinceLess">Show fewer</button>' : '') + '</div>';
    }
    const undoHtml = () => P.undo ? '<button class="undo" id="undo"><b>Take back</b><span>' + esc(P.undo.what.replace(/\.$/, '')) + '</span></button>' : '';
    function hurryHtml() {
      const h = P.pub && P.pub.hurry;
      if (!h || !isRemote()) return '';
      const others = h.ids.filter(id => id !== P.id);
      return others.length ? '<button class="btn ghost" id="hurry">Play the house’s move for ' + esc(others.map(pname).join(' and ')) + '</button>' : '';
    }

    /* ================================================================
       The question
       ================================================================ */
    function askHtml(pr) {
      const g = game();
      if (pr === 'stale') return waitCard('Hold on', 'The table is moving on.');
      if (!pr) {
        if (!g.prompt) return waitCard(g.phase === 'over' ? 'The game is over' : 'One moment', '');
        const x = g.prompt;
        const next = g.prompt.t === 'lead' && nextLeader(g) === P.id;
        return '<div class="card"><div class="title">' + esc(pname(x.seat)) + '</div><div class="sub">' + esc(x.why || '') + '</div>' +
          (next ? '<div class="upnext">You lead next — plan your move.</div>' : '') + '</div>';
      }
      if (pr.t === 'lead' || pr.t === 'follow') return playHtml(pr);
      if (pr.t === 'think') return '<div class="card mine"><div class="title">' + esc(pr.why) + '</div>' + thinkHtml(pr, pr.optional) + '</div>';
      if (pr.t === 'act') return actHtml(pr);
      return pickHtml(pr);
    }
    const a1 = w => (/^[AEIOU]/.test(w) ? 'an ' : 'a ') + w;
    function nextLeader(g) { const i = g.players.findIndex(p => p.id === g.leader); return g.players[(i + 1) % g.players.length].id; }

    /* ---------- leading and following ---------- */
    function playHtml(pr) {
      const g = game();
      const lead = pr.t === 'lead';
      const verb = lead ? 'Lead' : 'Follow';
      const hand = P.me.hand;
      const plays = pr.plays || [];
      let out = '<div class="card mine"><div class="title">' + (lead ? 'You lead' : esc(pname(g.leader)) + ' leads ' + esc(D.ROLE[pr.role].name)) + '</div>' +
        '<div class="sub">' + (lead ? 'Play a card to lead its role — or Think and draw.' : 'Follow with a card of the role to act too — or Think. Your clients work either way.') + '</div>';
      /* The hand, each card with the play it makes. */
      out += '<div class="hgrid">' + hand.map(id => {
        const k = id.split('.')[0];
        /* Every role this card can play: its own, and Architect too with a Crane. */
        const mine = plays.filter(x => x.how === 'card' && x.cards[0] === id);
        const pls = mine.length ? mine : plays.filter(x => x.how === 'card' && x.cards[0].split('.')[0] === k);
        const dropping = P.drop === id || P.dropAll;
        const btns = pls.length ? pls.map(pl => '<button class="play" data-play="' + esc(pl.role + '|' + pl.cards.join(',')) + '">' + verb + ' ' + esc(D.ROLE[pl.role].name) + '</button>').join('')
          : '<button disabled>' + (k === 'jack' ? 'Jack (below)' : lead ? '—' : 'Not ' + esc(a1(D.ROLE[pr.role].name))) + '</button>';
        return '<div class="hc' + (dropping ? ' dropping' : '') + '"><div data-zoom="' + esc(k) + '">' + A.card(k, 'tile') + '</div>' + btns + '</div>';
      }).join('') + '</div>';
      const jacks = plays.filter(x => x.how === 'jack');
      if (jacks.length) {
        out += '<h2>With a Jack</h2><div class="rolebtns">' + jacks.map(x => '<button data-play="' + esc(x.role + '|' + x.cards.join(',')) + '" style="--c:' + A.roleHex(x.role) + '">' + A.icon(x.role, 16, '#fff') + esc(D.ROLE[x.role].name) + '</button>').join('') + '</div>';
      }
      const pets = plays.filter(x => x.how === 'petition');
      if (pets.length) {
        out += '<h2>' + (pr.petition === 2 ? 'Two' : 'Three') + ' cards of one role as a Jack</h2><div class="opts">' + pets.map(x => '<button class="opt" data-play="' + esc(x.role + '|' + x.cards.join(',')) + '"><span class="lab"><b>' + verb + ' ' + esc(D.ROLE[x.role].name) + '</b><small>with ' + esc(x.cards.map(c => D.nameOf(c.split('.')[0])).join(' + ')) + '</small></span></button>').join('') + '</div>';
      }
      const pal = plays.filter(x => x.how === 'palace');
      if (pal.length) {
        out += '<h2>Palace: several at once</h2><div class="opts">' + pal.map(x => '<button class="opt" data-play="' + esc(x.role + '|' + x.cards.join(',')) + '"><span class="lab"><b>' + verb + ' ' + esc(D.ROLE[x.role].name) + ' — ' + x.units + ' actions</b><small>' + esc(x.cards.map(c => D.nameOf(c.split('.')[0])).join(', ')) + '</small></span></button>').join('') + '</div>';
      }
      if (!plays.length) out += '<div class="sub" style="margin-top:8px">' + (lead ? 'Nothing to lead with — Think.' : 'Nothing of ' + esc(D.ROLE[pr.role].name) + ' to follow with.') + '</div>';
      out += '<h2>Or Think</h2>' + thinkHtml(pr, false) + '</div>';
      return out;
    }
    function thinkHtml(pr, optional) {
      const m = pr.think || (P.me.prompt && P.me.prompt.think) || {};
      const hand = P.me.hand;
      let n = m.hand;
      if (P.dropAll) n = 0; else if (P.drop) n = m.hand - 1;
      const size = m.size;
      const refill = n < size ? Math.max(0, size - n) : 0;
      let out = '';
      if (m.vomit) out += '<button class="opt' + (P.dropAll ? ' on' : '') + '" id="vomit"><span class="lab"><b>Vomitorium: throw the whole hand away first</b><small>' + (P.dropAll ? 'On — tap to keep your hand' : 'Then draw a fresh hand') + '</small></span></button>';
      if (m.latrine && !P.dropAll) out += '<div class="sub" style="margin-top:6px">Latrine: tap a card to throw it into the Pool first.</div><div class="chips">' + hand.map(id => '<button class="chipb' + (P.drop === id ? ' on' : '') + '" data-drop="' + esc(id) + '">' + esc(D.nameOf(id.split('.')[0])) + '</button>').join('') + '</div>';
      const b = [];
      if (refill) b.push('<button class="btn ghost thinkb" data-think="refill">Draw ' + Math.min(refill, game().deckN) + ' — up to ' + size + '</button>');
      else b.push('<button class="btn ghost thinkb" data-think="one">Draw one card</button>');
      if (m.jack) b.push('<button class="btn ghost thinkb" data-think="jack">Take a Jack (' + game().jacksN + ' left)</button>');
      out += '<div class="row2">' + b.join('') + '</div>';
      if (m.tribunal) out += '<div class="note">Tribunal: you take a Jack as well, afterwards.</div>';
      if (optional) out += '<button class="btn ghost small" id="skip">Not now</button>';
      return out;
    }

    /* ---------- one action ---------- */
    function actHtml(pr) {
      const g = game();
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div><div class="sub">' + esc(D.ROLE[pr.role].does) + '</div>';
      const groups = { lay: [], fill: [], take: [], client: [], vault: [], fountain: [], tear: [] };
      pr.options.forEach(x => { if (groups[x.kind]) groups[x.kind].push(x); });
      const row = x => '<button class="opt" data-act="' + esc(x.id) + '"><span class="lab"><b>' + esc(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span>' +
        (x.mat ? '<span class="val">' + A.mat(x.mat) + '</span>' : x.role ? '<span class="val">' + A.client(x.role) + '</span>' : '') + '</button>';
      if (groups.fill.length) out += '<h2>Into a building</h2><div class="opts">' + groups.fill.map(row).join('') + '</div>';
      if (groups.lay.length) {
        const byCard = {};
        groups.lay.forEach(x => { const k = x.card.split('.')[0]; (byCard[k] = byCard[k] || []).push(x); });
        out += '<h2>Lay a foundation</h2><div class="laygrid">' + Object.keys(byCard).map(k => '<div class="hc"><div data-zoom="' + esc(k) + '">' + A.card(k, 'tile') + '</div>' +
          byCard[k].map(x => '<button class="play" data-act="' + esc(x.id) + '">' + (k === 'statue' ? esc(D.MAT[x.site].name) + ' site' : 'Lay it') + (x.ot ? ' · out of town' + (x.cost > 1 ? ' (2)' : '') : '') + '</button>').join('') + '</div>').join('') + '</div>';
      }
      for (const [k, head] of [['take', 'Take'], ['client', 'Hire'], ['vault', 'Into your Vault'], ['fountain', 'Fountain'], ['tear', 'Watch Post']]) {
        if (groups[k].length) out += '<h2>' + head + '</h2><div class="opts">' + groups[k].map(row).join('') + '</div>';
      }
      const real = pr.options.length > 1;
      o.bar.innerHTML = '<button class="btn' + (real ? ' warn' : '') + '" id="stopAct">' + esc(pr.options.find(x => x.id === 'stop').label) + '</button>';
      o.bar.classList.remove('hide');
      return out + '</div>';
    }

    /* ---------- any other question ---------- */
    function pickHtml(pr) {
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div>';
      const multi = pr.multi;
      if (multi) out += '<div class="sub">Choose ' + (pr.min === pr.max ? pr.min : (pr.min ? pr.min + ' to ' + pr.max : 'up to ' + pr.max)) + '.</div>';
      out += '<div class="opts">' + pr.options.map(x => {
        const on = multi && P.multi.indexOf(x.id) >= 0;
        return '<button class="opt' + (on ? ' on' : '') + '" data-pick="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + '>' + (multi ? '<span class="tick">' + (on ? TICK : '') + '</span>' : '') +
          '<span class="lab"><b>' + esc(x.label || x.id) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + (x.bad ? '<span class="why">' + esc(x.bad) + '</span>' : '') + '</span>' +
          (x.mat ? '<span class="val">' + A.mat(x.mat) + '</span>' : '') + '</button>';
      }).join('') + '</div>';
      if (multi) {
        const okN = P.multi.length >= pr.min && P.multi.length <= pr.max;
        o.bar.innerHTML = '<button class="btn" id="pickGo"' + (okN ? '' : ' disabled') + '>' + (pr.what === 'demand' ? (P.multi.length ? 'Rome demands these (' + P.multi.length + ')' : 'Demand nothing') : 'Confirm (' + P.multi.length + ')') + '</button>';
        o.bar.classList.remove('hide');
      }
      if (pr.skip) out += '<button class="btn ghost" id="skip">' + esc(pr.skip) + '</button>';
      return out + '</div>';
    }

    /* ================================================================
       Your camp, your hand
       ================================================================ */
    function countBy(list) { const c = {}; list.forEach(x => { c[x] = (c[x] || 0) + 1; }); return c; }
    function campHtml(p, other) {
      const g = game();
      const roles = countBy(p.clients.map(k => D.roleOf(k)));
      const mats = countBy(p.stock);
      const vault = !other && P.me ? P.me.vault : null;
      const vk = vault ? countBy(vault.filter(Boolean).map(k => D.matOf(k))) : null;
      const unknown = vault ? vault.filter(x => !x).length : 0;
      const builds = p.builds.slice().sort((a, b) => (b.done ? 1 : 0) - (a.done ? 1 : 0));
      return '<div class="camp' + (other ? ' other' : '') + '">' +
        (other ? '' : '<h2>Your camp</h2>') +
        '<div class="facts"><span>' + A.icon('influence', 16, '#c9a84c') + '<b>' + p.inf + '</b> influence</span><span>' + A.icon('thinker', 16) + '<b>' + p.handN + '</b>/' + p.handSize + ' hand</span>' +
        '<span>' + A.icon('vault', 16) + '<b>' + p.vaultN + '</b>/' + p.vaultRoom + ' vault</span><span>Clients <b>' + p.clients.length + '</b>/' + p.clientRoom + '</span></div>' +
        '<div class="line"><span class="lbl">Clientele</span>' + (Object.keys(roles).length ? D.ROLES.filter(r => roles[r]).map(r => A.client(r, roles[r])).join(' ') : '<span class="none">none yet</span>') + '</div>' +
        '<div class="line"><span class="lbl">Stockpile</span>' + (p.stock.length ? D.MATS.filter(m => mats[m]).map(m => A.mat(m, mats[m])).join(' ') : '<span class="none">empty</span>') + '</div>' +
        (vault ? '<div class="line"><span class="lbl">Vault</span>' + (vault.length ? D.MATS.filter(m => vk[m]).map(m => A.mat(m, vk[m])).join(' ') + (unknown ? ' <span class="none">+ ' + unknown + ' unseen</span>' : '') : '<span class="none">empty</span>') + '<span class="none"> · only you see this</span></div>' : '') +
        '<div class="builds">' + (builds.length ? builds.map(b => '<div data-zoom="' + esc(b.card) + '">' + A.building(b) + '</div>').join('') : '<span class="none">No buildings yet.</span>') + '</div>' +
        (p.powers.length && !other ? '<div class="sub" style="margin-top:4px">Always on: ' + esc(p.powers.map(D.nameOf).join(', ')) + '. Tap a building to read it.</div>' : '') +
        '</div>';
    }
    function handHtml() {
      if (!P.me || !P.me.hand) return '';
      const hand = P.me.hand;
      return '<h2>Your hand · ' + hand.length + '</h2>' + (hand.length ? '<div class="hgrid">' + hand.map(id => '<div class="hc" data-zoom="' + esc(id.split('.')[0]) + '">' + A.card(id.split('.')[0], 'tile') + '</div>').join('') + '</div>' : '<div class="sub">Empty.</div>');
    }

    /* ================================================================
       The table
       ================================================================ */
    function tableHtml() {
      const g = game();
      if (!g) return waitCard('No game yet', '');
      const lead = g.players.find(p => p.id === g.leader);
      let out = '<div class="card"><div class="title">' + (g.role ? esc(lead ? lead.name : '') + ' leads ' + esc(D.ROLE[g.role].name) : 'Turn ' + g.turnN + (lead ? ' · ' + esc(lead.name) + ' leads' : '')) + '</div>' +
        '<div class="facts"><span>' + A.icon('deck', 16) + '<b>' + g.deckN + '</b> in the deck</span><span>' + A.icon('jack', 16) + '<b>' + g.jacksN + '</b> Jacks</span><span><b>' + g.inTown + '</b> sites left in town</span></div>';
      if (g.plays && g.plays.length) out += '<div class="sub">Played this turn: ' + g.plays.map(x => esc(pname(x.by)) + ' — ' + esc(x.cards.map(D.nameOf).join(' + '))).join(' · ') + '</div>';
      out += '</div><h2>The Pool · ' + g.pool.length + '</h2>' + (g.pool.length ? '<div class="pgrid">' + g.pool.map(k => '<div data-zoom="' + esc(k) + '">' + A.card(k, 'mini') + '</div>').join('') + '</div>' : '<div class="sub">Empty.</div>');
      out += '<h2>Sites</h2><div class="sites">' + D.MATS.map(m => A.site(m, g.sites[m])).join('') + '</div>';
      out += g.players.map(p => '<h2 style="color:' + esc(p.hex) + '">' + esc(p.name) + (p.bot ? ' · house ' + esc(p.level) : '') + (p.id === g.leader ? ' · leader' : '') + '</h2>' + campHtml(p, p.id !== P.id)).join('');
      return out;
    }
    function rulesHtml() {
      const g = game();
      const v = g ? g.version : (P.pub.opts && P.pub.opts.version) || 'rep';
      const M = D.MANIFEST;
      return '<div class="card"><div class="title">How a turn works</div><ul class="rules">' +
        '<li><b>Lead</b> a card to choose this turn’s role — or a Jack, or ' + (D.SETS[v].petition === 2 ? 'two' : 'three') + ' cards of one role as a Jack. Or Think instead.</li>' +
        '<li><b>Follow</b> with a card of the same role, or Think: draw up to your hand size, draw one, or take a Jack.</li>' +
        '<li><b>Act</b>: one action for leading or following, one more for each client of that role — clients work even when you Think.</li></ul></div>' +
        '<div class="card"><div class="title">The roles</div>' + D.ROLES.map(r => '<div class="line">' + A.client(r) + ' <span>' + esc(D.ROLE[r].does) + '</span></div>').join('') + '</div>' +
        '<div class="card"><div class="title">Building</div><ul class="rules"><li>A foundation needs a site of its material (in town; out of town takes two actions). Rubble and Wood need 1 material, Brick and Concrete 2, Stone and Marble 3 — of the same material.</li>' +
        '<li>Finished: you gain its site’s influence (1–3), which also sets how many clients and Vault cards you may hold, and its power works from then on.</li></ul></div>' +
        '<div class="card"><div class="title">Scoring</div><ul class="rules"><li>Influence, plus the Vault’s value, plus 3 for each Merchant Bonus (most of a material in the Vault — a tie wins nothing), plus Statue and Wall.</li>' +
        '<li>Level on points: the most cards in hand.</li></ul></div>' +
        '<div class="card"><div class="title">Rulings on this table</div><ul class="rules">' + M.decisions.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
        '<div class="card"><div class="sub">Glory to Rome is designed by Carl Chudyk and Ed Carter, art by Heiko Günther (Cambridge Games Factory, Black Box edition). The card pictures are from the host’s own print-and-play copy; every line of text here is written fresh. This is built to sit beside a copy of the game, not to replace one.</div></div>';
    }

    /* ================================================================
       Lobby and the end
       ================================================================ */
    function lobbyHtml() {
      const lv = P.pub.lobby || { seated: [], house: [] };
      const rows = lv.seated.map(p => '<div class="siteL"><b style="color:' + esc(p.hex) + '">' + esc(p.name) + '</b><span class="sub">' + (p.id === P.id ? 'you' : 'phone') + '</span></div>').join('') +
        lv.house.map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">house · ' + esc(p.level) + '</span></div>').join('') +
        (lv.watching || []).map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">watching</span></div>').join('');
      let opts = '';
      if (isRemote()) {
        const seg = (key, list, cur) => '<div class="seg">' + list.map(([k, l]) => '<button class="' + (String(k) === String(cur) ? 'on' : '') + '" data-opt="' + key + '" data-v="' + esc(k) + '">' + esc(l) + '</button>').join('') + '</div>';
        const hn = [];
        for (let k = lv.minHouse; k <= lv.maxHouse && k <= 4; k++) hn.push([k, k === 0 ? 'None' : String(k)]);
        opts = '<h2>Version</h2>' + seg('version', [['rep', 'Republic (first game)'], ['imp', 'Imperium (cut-throat)']], lv.version) +
          '<div class="sub">' + esc(D.SETS[lv.version].blurb) + '</div>' +
          '<h2>The Geek cards</h2>' + seg('geek', [['off', 'Off'], ['on', 'On — 10 more buildings']], lv.geek ? 'on' : 'off') +
          '<h2>' + (P.solo ? 'Opponents' : 'House players') + '</h2>' + seg('house', hn, Math.max(lv.minHouse, Math.min(lv.maxHouse, lv.houseN))) +
          (lv.house.length ? '<h2>How well the house plays</h2>' + seg('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], lv.level) : '') +
          '<h2>Pace</h2>' + seg('pace', [['slow', 'Slow'], ['relaxed', 'Relaxed'], ['brisk', 'Brisk']], lv.pace) +
          (P.solo ? '' : '<h2>Sound on the telly</h2>' + seg('sound', [['on', 'On'], ['off', 'Off']], lv.sound ? 'on' : 'off'));
        o.bar.innerHTML = '<button class="btn" id="go">' + (P.solo ? 'Begin' : 'Start the game') + '</button>';
        o.bar.classList.remove('hide');
      }
      return (o.lobbyTop ? o.lobbyTop() : '') + '<div class="card"><div class="title">Glory to Rome</div><div class="sub">Rebuild Rome after the fire of 64 AD: lead the roles, hire clients, raise buildings and fill your Vault.</div>' + rows + '</div>' + opts +
        (isRemote() ? '' : '<div class="sub" style="margin-top:12px">' + esc(pname(P.pub.remote) === '?' ? 'The first phone' : pname(P.pub.remote)) + ' starts the game.</div>') +
        (o.menuButton !== false ? '<button class="btn ghost" id="menu">' + (P.solo ? 'Games hub' : 'Games menu') + '</button>' : '');
    }
    function overHtml() {
      const f = P.pub.finale;
      const told = !f || f.stage === 'winner' || f.stage === 'table';
      const g0 = game();
      const R = told && g0 && g0.result;
      let block = '';
      if (f && !P.solo && root.HubFinale) {
        block = root.HubFinale.phoneHtml(f, { meId: P.id, rows: R ? R.rows.map(r => Object.assign({}, r)) : null, esc,
          winSmall: R && /forum|plebeian/.test(R.how) ? 'an instant win' : 'the most points', loseSmall: me => me.total + ' points.',
          lines: { title: 'Rome is rebuilt', count: 'Opening the Vaults', decider: 'The Merchant Bonuses' } });
      }
      if (f && f.stage !== 'table') return block + (isRemote() ? '<button class="btn ghost" id="skipFin">Skip to the table</button>' : '');
      const pay = (P.pub.pay || []).find(p => mine() && p.name === mine().name);
      const rows = R ? R.rows.slice().sort((a, b) => a.place - b.place) : [];
      return block + (R ? '<div class="card"><div class="title">' + (R.winners.length > 1 ? 'A shared win' : esc(R.name) + ' wins') + '</div>' +
        '<div class="sub">' + esc(W.ENDS[R.how] || '') + (R.tiebreak ? ' Level on points — the bigger hand wins.' : '') + '</div>' + (pay && !P.solo ? '<div class="sub">Banked: ' + esc(pay.detail) + '</div>' : '') +
        '<table class="final"><tr><th></th><th>Inf</th><th>Vault</th><th>Bonus</th><th>+</th><th>Total</th></tr>' + rows.map(r => '<tr class="' + (r.won ? 'win' : '') + '"><td><b style="color:' + esc(r.hex) + '">' + esc(r.name) + '</b></td><td>' + r.inf + '</td><td>' + r.vault + '</td><td>' + (r.bonus * 3) + '</td><td>' + r.extra + '</td><td><b>' + r.total + '</b></td></tr>').join('') + '</table></div>' : '') +
        (isRemote() ? '<button class="btn" id="again">' + (P.solo ? 'New game' : 'Play again') + '</button>' : '') + (o.menuButton !== false ? '<button class="btn ghost" id="menu">' + (P.solo ? 'Games hub' : 'Games menu') + '</button>' : '');
    }

    /* ================================================================
       Wiring every button of the current paint
       ================================================================ */
    function wire() {
      const on = (sel, fn) => o.root.parentNode.querySelectorAll(sel).forEach(x => { x.onclick = ev => { ev.stopPropagation(); if (!locked()) fn(x, ev); }; });
      const pr = myPrompt();
      const Q = pr && pr !== 'stale' ? pr : null;
      on('[data-tab]', x => { P.tab = x.dataset.tab; lock(); paint(); });
      on('#cont', () => { lock(); send({ t: 'cont' }); });
      on('#nowait', () => { lock(); send({ t: 'nowait' }); });
      on('#undo', () => { lock(); send({ t: 'undo' }); });
      on('#hurry', () => { lock(); send({ t: 'hurry' }); });
      on('#showOk', () => { lock(); send({ t: 'skip' }); });
      on('#sinceMore', () => { P.sinceAll = true; paint(); });
      on('#sinceLess', () => { P.sinceAll = false; paint(); });
      on('#menu', () => { if (o.onMenu) o.onMenu(); else send({ t: 'menu' }); });
      on('#again', () => send({ t: 'again' }));
      on('#skipFin', () => send({ t: 'skip' }));
      on('#go', () => send({ t: 'start' }));
      on('[data-opt]', x => send({ t: 'opt', key: x.dataset.opt, value: x.dataset.v }));
      o.root.querySelectorAll('[data-zoom]').forEach(x => { x.onclick = () => zoom(x.dataset.zoom); });
      if (!Q) return;
      const n = Q.n;
      on('[data-play]', x => { const [role, cards] = x.dataset.play.split('|'); act({ t: Q.t, n, role, cards: cards.split(',') }); });
      on('[data-think]', x => act(Object.assign({ t: 'think', n, how: x.dataset.think }, P.dropAll ? { dropAll: true } : P.drop ? { drop: P.drop } : {})));
      on('[data-drop]', x => { P.drop = P.drop === x.dataset.drop ? null : x.dataset.drop; paint(); });
      on('#vomit', () => { P.dropAll = !P.dropAll; P.drop = null; paint(); });
      on('[data-act]', x => act({ t: 'act', n, id: x.dataset.act }));
      on('#stopAct', x => {
        if (Q.options.length > 1 && x.dataset.armed !== '1') { x.dataset.armed = '1'; x.textContent = 'Tap again to stop'; return; }
        act({ t: 'act', n, id: 'stop' });
      });
      on('[data-pick]', x => {
        if (Q.multi) {
          const id = x.dataset.pick;
          const i = P.multi.indexOf(id);
          if (i >= 0) P.multi.splice(i, 1);
          else if (P.multi.length < Q.max) P.multi.push(id);
          else if (Q.max === 1) P.multi = [id];
          return paint();
        }
        act({ t: 'pick', n, id: x.dataset.pick });
      });
      on('#pickGo', () => act({ t: 'pick', n, ids: P.multi.slice() }));
      on('#skip', () => act({ t: 'skip', n }));
    }
    function zoom(k) {
      const z = o.zoomEl;
      if (!z) return;
      const c = D.card(k);
      z.innerHTML = '<div class="zin">' + A.card(k, 'full') + (c ? '<div class="ztext"><b>' + esc(c.name) + '</b> · ' + esc(D.MAT[c.mat].name) + ' · ' + esc(D.ROLE[c.role].name) + '<br>' + esc(c.text) + '</div>' : '') + '</div>';
      z.classList.remove('hide');
      z.onclick = () => z.classList.add('hide');
    }

    return { receive, paint, flash, P, setMe(id, name, hex) { P.id = id; P.name = name || P.name; P.hex = hex || P.hex; paint(); } };
  }

  const STYLES = `
:root{--bg:#120f0b;--panel:#201a13;--panel2:#18130e;--line:#3e3324;--ink:#f4ecdc;--dim:#b4a68c;--gold:#c9a84c;--red:#d9302a;--good:#5fbf7a;--bad:#ff6b5a}
.tabs{display:flex;gap:6px;margin:4px 0 6px;position:sticky;top:44px;z-index:4;background:var(--bg);padding:4px 0}
.tab{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--dim);border-radius:10px;padding:8px;font-weight:800;font-size:14px}
.tab.on{background:var(--gold);border-color:var(--gold);color:#1b1408}
h2{margin:14px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:8px}
.card.mine{border-color:var(--gold)}
.title{font-weight:900;font-size:19px;color:var(--gold);letter-spacing:.02em}
.sub{color:var(--dim);font-size:13px;margin-top:3px}
.btn{display:block;width:100%;background:var(--gold);border:0;color:#1b1408;font-weight:900;font-size:17px;border-radius:14px;padding:14px;margin-top:10px}
.btn:disabled{opacity:.4}
.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--ink);font-weight:700;font-size:15px}
.btn.small{font-size:14px;padding:10px;margin-top:6px}
.btn.warn{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
.opts{display:flex;flex-direction:column;gap:7px;margin-top:8px}
.opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:10px 11px;font-size:15px}
.opt:disabled{opacity:.42}
.opt.on{border-color:var(--gold);background:rgba(201,168,76,.15)}
.opt .lab{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.opt .lab small{color:var(--dim);font-size:12px;line-height:1.25}
.opt .val{flex:none}
.why{color:#ffab9a;font-size:12px}
.tick{width:22px;height:22px;border-radius:6px;border:2px solid var(--line);flex:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#1b1408}
.opt.on .tick{background:var(--gold);border-color:var(--gold)}
.hgrid,.laygrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
.hc{display:flex;flex-direction:column;gap:5px;min-width:0}
.hc .gc{font-size:9px;width:100%}
.hc button{border-radius:10px;padding:8px 4px;font-weight:800;font-size:13px;border:1px solid var(--line);background:var(--panel2);color:var(--ink)}
.hc button.play{background:var(--gold);border-color:var(--gold);color:#1b1408}
.hc button:disabled{opacity:.45}
.hc.dropping .gc{opacity:.35}
.rolebtns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.rolebtns button{display:flex;align-items:center;justify-content:center;gap:5px;background:var(--c);border:0;color:#fff;font-weight:800;border-radius:10px;padding:10px 4px;font-size:13px;text-shadow:0 0 .3em rgba(0,0,0,.5)}
.row2{display:flex;gap:8px;margin-top:8px}
.row2 .btn{margin-top:0;font-size:14px;padding:12px 8px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chipb{background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:6px 9px;font-size:13px}
.chipb.on{background:var(--red);border-color:var(--red);color:#fff}
.note{font-size:12px;color:var(--dim);margin-top:4px}
.facts{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-size:13px;color:var(--dim)}
.facts span{display:inline-flex;align-items:center;gap:4px}
.facts b{color:var(--ink)}
.camp{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:4px 10px 10px;margin-top:8px}
.camp.other{margin-top:0}
.line{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:6px;font-size:13px}
.line .lbl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);width:72px;flex:none}
.none{color:var(--dim);font-size:12px}
.builds{display:flex;flex-direction:column;gap:5px;margin-top:8px;font-size:13px}
.pgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
.pgrid .gc{width:100%}
.sites{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;font-size:12px}
.since{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:9px 11px;margin-top:6px;font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:4px}
.since .sh{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.since .sl.new{color:var(--ink)}
.since .more{align-self:flex-start;background:transparent;border:1px solid var(--line);color:var(--dim);border-radius:9px;padding:4px 10px;font-size:12px}
.reel{margin-top:6px;padding:9px 11px;border-radius:12px;background:color-mix(in srgb,var(--h) 14%,transparent);border:1px solid var(--h);font-size:15px;animation:reelIn .5s ease-out}
@keyframes reelIn{from{opacity:.2;transform:translateY(-4px)}to{opacity:1;transform:none}}
.reel small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--h);font-weight:800}
.upnext{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(201,168,76,.14);border:1px solid var(--gold);color:var(--gold);font-weight:800}
.undo{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;background:var(--panel2);border:1px dashed var(--gold);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:14px;text-align:left}
.undo b{color:var(--gold);flex:none}
.showcard{border-color:var(--red)}
.showcard .title{color:var(--ink)}
.showcard .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
.showcard .mcard{width:30%}
.showcard .mcard .gc{font-size:9px}
.zcard{width:60%;margin:8px auto 0}
.zcard .gc{font-size:12px}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{flex:1;min-width:30%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:10px 6px;font-size:14px;font-weight:700}
.seg button.on{background:var(--gold);border-color:var(--gold);color:#1b1408}
.siteL{display:flex;align-items:center;gap:6px;font-size:14px;padding:6px 0;border-top:1px solid var(--line)}
.siteL b{flex:1}
ul.rules{margin:6px 0 0;padding-left:1.1em;font-size:14px;line-height:1.4}
table.final{width:100%;border-collapse:collapse;margin-top:8px;font-size:14px}
table.final th,table.final td{padding:5px 4px;text-align:right;border-bottom:1px solid var(--line)}
table.final th{color:var(--dim);font-size:11px;text-transform:uppercase}
table.final td:first-child,table.final th:first-child{text-align:left}
table.final tr.win td{color:var(--gold)}
.opencard .rc-h{font-weight:900;font-size:24px;color:var(--gold)}
.opencard .rc-sub{font-size:14px;margin-top:3px}
.opencard .rc-sc{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px}
.opencard .rc-p{display:flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:7px 10px;font-size:13px;flex-wrap:wrap}
.opencard .rc-p i{width:11px;height:11px;border-radius:50%;flex:none}
.opencard .rc-role{font-size:10px;color:var(--dim);text-transform:uppercase}
.opencard .rc-t{flex-basis:100%;color:var(--dim)}
.opencard .rc-d{font-size:11px;color:var(--gold);font-weight:800}
.opencard .rc-sec{margin-top:10px}
.opencard .rc-sec h4{margin:0 0 3px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.opencard .rc-sec ul{margin:0;padding-left:1.1em;font-size:13.5px}
#zoom{position:fixed;inset:0;z-index:50;background:rgba(10,8,5,.92);display:flex;align-items:center;justify-content:center;padding:16px}
#zoom .zin{width:min(86vw,360px)}
#zoom .zin .gc{font-size:15px}
#zoom .ztext{margin-top:10px;color:var(--ink);font-size:14px;line-height:1.4}
`;
  const Phone = { VERSION, create, STYLES };
  root.GtrPhone = Phone;
})(typeof window !== 'undefined' ? window : this);
