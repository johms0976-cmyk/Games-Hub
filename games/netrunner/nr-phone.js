'use strict';
/* Android: Netrunner — the handset. All of it, with no networking of its own:
 * controller.html gives it a socket to the hub, solo.html gives it the in-page
 * host. It paints from two messages — {t:'nr'} (the public table) and
 * {t:'nr-me'} (this seat's half) — and sends orders back with `send`.
 *
 * Tabs: Play (the question, the run as it happens, the other side's newest
 * move, your hand and your side of the table), Table (both sides, every
 * server, the rig) and Rules. The checklist's phone rules apply: the menu
 * comes from the engine as ready-made options, a button is never offered that
 * would be refused (a greyed one says why), everything that appears unasked
 * ignores taps for a moment, the primary action is pinned at the bottom, and
 * the public view and this seat's half may arrive in either order.
 */
(function (root) {
  const D = root.NrData, A = root.NrArt, W = root.NrWords;
  const CARD = D.CARDS;
  const VERSION = 1;
  const esc = A.esc;
  const LOCK_MS = 450;

  function create(o) {
    const P = {
      id: null, name: '', hex: '#7fb6ff', pub: null, me: null, undo: null,
      tab: 'play', multi: [], lockUntil: 0, shape: '', myTurn: false,
      sinceAll: false, finStage: '', solo: !!o.solo
    };
    const send = m => o.send(m);
    /* The deck builder (nr-builder.js), opened from the lobby. */
    const builder = root.NrBuilder && o.store ? root.NrBuilder.create({
      store: o.store,
      pool: () => (P.pub && P.pub.lobby && P.pub.lobby.pool) || 'one',
      sets: () => (P.pub && P.pub.lobby && P.pub.lobby.sets) || 'core',
      side: () => { const lv = P.pub && P.pub.lobby; const me = lv && lv.seated.find(p => p.id === P.id); return me ? me.side : null; },
      use: deck => { send({ t: 'deck', deck }); P.decksOpen = false; paint(); },
      close: () => { P.decksOpen = false; paint(); },
      zoom: k => zoom(k),
      flash: (t, tone) => flash(t, tone),
      bar: h => { o.bar.innerHTML = h; o.bar.classList.toggle('hide', !h); }
    }) : null;
    const locked = () => Date.now() < P.lockUntil;
    const lock = () => { P.lockUntil = Date.now() + LOCK_MS; };
    const buzz = ms => { if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
    const game = () => P.pub && P.pub.game;
    const pl = id => { const g = game(); return g ? g.players.find(x => x.id === id) : null; };
    const pname = id => { const p = pl(id); return p ? p.name : '?'; };
    const mySide = () => { const g = game(); if (!g) return null; return g.corp.seat === P.id ? 'corp' : g.runner.seat === P.id ? 'runner' : null; };
    const isRemote = () => P.pub && P.pub.remote === P.id;
    const act = a => { if (locked()) return; lock(); send({ t: 'do', a }); };
    /* My question — drawn only while the table still lists it as open. */
    const myPrompt = () => {
      if (!P.me || !P.me.prompt) return null;
      const g = game();
      if (!g) return 'stale';
      if (!g.prompts.some(x => x.n === P.me.prompt.n && x.seat === P.id)) return 'stale';
      return P.me.prompt;
    };

    /* ================================================================
       Messages in
       ================================================================ */
    function receive(m) {
      if (m.t === 'nr') { P.pub = m; if (!m.game) P.me = null; paint(); return; }
      if (m.t === 'nr-me') { P.me = m.me; P.undo = m.undo || null; P.coach = m.coach || null; paint(); return; }
      if (m.t === 'flash') flash(m.text, m.tone);
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
      const tb = pub && pub.table;
      const show = pub && pub.show;
      const shape = [pub && pub.screen, pr && pr !== 'stale' ? pr.t + pr.n : '-', tb ? 'tb' + tb.n + (tb.waiting.indexOf(P.id) >= 0 ? 'w' : 'd') : '', show ? 'sh' + show.n : '', P.tab, P.decksOpen && builder ? 'deck' + builder.view + (builder.edit ? builder.edit.id : '') : ''].join('|');
      if (shape !== P.shape) {
        P.multi = [];
        P.shape = shape; lock();
        if (o.scrollTop) o.scrollTop();
      }
      const g0 = game();
      const mineNow = !!(g0 && g0.phase !== 'over' && pr && pr !== 'stale' && (pr.t === 'turn' || pr.t === 'enc') && !tb);
      if (mineNow && !P.myTurn) buzz([90, 60, 90]);
      P.myTurn = mineNow;
      const fst = pub && pub.finale ? pub.finale.n + pub.finale.stage : '';
      if (fst !== P.finStage) {
        const f = pub && pub.finale;
        if (f && f.stage === 'winner' && g0 && g0.result) { const r = g0.result.rows.find(x => x.id === P.id); buzz(r && r.won ? [200, 90, 200, 90, 500] : 120); }
        P.finStage = fst;
      }
      const side = mySide();
      if (o.onMe) o.onMe(side ? { hex: (pl(P.id) || {}).hex || P.hex, side } : null);
      const m = o.root;
      o.bar.classList.add('hide'); o.bar.innerHTML = '';
      if (!pub) { m.innerHTML = waitCard('Waiting for the telly', 'Netrunner has not been started yet.'); return; }
      if (pub.screen === 'lobby' && P.decksOpen && builder) { m.innerHTML = builder.html(); builder.wire(o.root.parentNode || o.root, () => paint()); return; }
      if (pub.screen !== 'lobby') P.decksOpen = false;
      if (pub.screen === 'lobby') { m.innerHTML = lobbyHtml(); wire(); return; }
      const tabs = tabsHtml();
      if (P.tab === 'table') { m.innerHTML = tabs + tableTabHtml(); wire(); return; }
      if (P.tab === 'rules') { m.innerHTML = tabs + rulesHtml(); wire(); return; }
      if (pub.screen === 'over') { m.innerHTML = tabs + overHtml(); wire(); return; }
      if (!game()) { m.innerHTML = waitCard('Hold tight', ''); return; }
      if (!side) { m.innerHTML = tabs + waitCard('Watching', 'Netrunner is for two; the table was full when this game started.') + tableTabHtml(); wire(); return; }
      if (!P.me) { m.innerHTML = waitCard('Dealing you in', ''); return; }
      if (pub.paused) { m.innerHTML = tabs + waitCard('Paused', 'The house waits while your screen is away.'); wire(); return; }
      if (tb) m.innerHTML = tabs + openingHtml() + meHtml(side);
      else m.innerHTML = tabs + showHtml() + reelHtml(pr) + runHtml() + sinceHtml() + lastMoveHtml() + undoHtml() + coachHtml(pr) + askHtml(pr) + hurryHtml() + meHtml(side);
      wire();
    }
    const waitCard = (title, sub, extra) => '<div class="card"><div class="title">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + (extra || '') + '</div>';
    function tabsHtml() {
      const t = (k, l) => '<button class="tab' + (P.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + l + '</button>';
      return '<div class="tabs">' + t('play', 'Play') + t('table', 'Table') + t('rules', 'Rules') + '</div>';
    }

    /* ---------- the opening card ---------- */
    function openingHtml() {
      const h = P.pub.table;
      const others = h.waiting.filter(id => id !== P.id);
      let foot = '';
      if (h.waiting.indexOf(P.id) >= 0) {
        o.bar.innerHTML = '<button class="btn" id="cont" data-id="' + esc(h.id) + '">Continue</button>';
        o.bar.classList.remove('hide');
        foot = P.solo ? '' : '<div class="sub" style="margin-top:8px">The game waits until you have both read this.</div>';
      } else if (others.length) {
        foot = '<div class="sub" style="margin-top:8px">Waiting for ' + esc(others.map(pname).join(', ')) + ' to read it.</div>' +
          (h.grace && h.done.indexOf(P.id) >= 0 ? '<button class="btn ghost" id="nowait">Don’t wait for ' + esc(others.map(pname).join(' and ')) + '</button>' : '');
      }
      if (h.k === 'lesson' && h.lesson) return '<div class="card mine opencard lessoncard"><div class="coach-k">How to play</div><div class="title">' + esc(h.lesson.title) + '</div>' + h.lesson.text.map(t => '<p class="sub">' + esc(t) + '</p>').join('') + foot + '</div>';
      return '<div class="card mine opencard">' + W.holdCardHtml(game()) + foot + '</div>';
    }
    /* ---------- a show (the telly has it big) ---------- */
    function showHtml() {
      const s = P.pub.show, g = game();
      if (!s) return '';
      const body = showBody(s, g);
      if (!body) return '';
      const foot = P.solo ? '<button class="btn ghost small" id="showOk">Go on</button>' : '';
      return '<div class="card showcard k-' + esc(s.k) + '">' + body + foot + '</div>';
    }
    function showBody(s, g) {
      const C = pname(g.corp.seat), R = pname(g.runner.seat);
      switch (s.k) {
        case 'turn': return '<div class="title">' + (s.side === 'corp' ? 'Round ' + s.round + ' · ' + esc(C) + ' (Corp)' : esc(R) + ' (Runner)') + '</div><div class="sub">' + (s.side === 'corp' ? '3 clicks, after drawing a card.' : '4 clicks.') + '</div>';
        case 'rez': return '<div class="title">' + esc(C) + ' rezzes ' + esc(CARD[s.card].name) + '</div><div class="zcard">' + A.face(s.card, { size: 'mid' }) + '</div>';
        case 'score': return '<div class="title">' + esc(s.side === 'corp' ? C + ' scores' : R + ' steals') + ' ' + esc(CARD[s.card].name) + '</div><div class="zcard">' + A.face(s.card, { size: 'mid' }) + '</div>';
        case 'access': return '<div class="title">' + esc(R) + ' accesses ' + esc(W.srv(s.sid)) + '</div><div class="accs">' + s.seen.map(x => '<div class="acc">' + A.face(x.card, { size: 'mid' }) + '<b>' + esc(({ stolen: 'Stolen', trashed: 'Trashed', sprung: 'Sprung!', left: 'Left', kept: 'Left' })[x.did] || ({ arch: 'In Archives', rd: 'From R&D', hq: 'From HQ' })[x.from] || 'Seen') + '</b></div>').join('') + '</div>';
        case 'trace': return '<div class="title">Trace ' + s.base + (s.cause ? ' — ' + esc(s.cause) : '') + '</div><div class="tracebox"><span><b>' + s.str + '</b>trace<small>' + s.base + ' + ' + s.cb + ' spent</small></span><span class="vs">v</span><span><b>' + (s.link + s.rb) + '</b>link<small>' + s.link + ' + ' + s.rb + ' spent</small></span></div><div class="bres ' + (s.ok ? 'bad' : 'good') + '">' + (s.ok ? 'The trace lands' : 'The trace fails') + '</div>';
        case 'damage': return '<div class="title">' + s.n + ' ' + esc(s.kind) + ' damage' + (s.cause ? ' — ' + esc(s.cause) : '') + '</div><div class="sub">' + (s.lost.length ? esc(R) + ' loses ' + esc(s.lost.map(k => CARD[k].name).join(', ')) : 'Nothing in the grip to lose.') + '</div>' + (s.flat ? '<div class="bres bad">FLATLINED</div>' : '');
        case 'expose': return '<div class="title">Exposed: ' + esc(CARD[s.card].name) + '</div><div class="zcard">' + A.face(s.card, { size: 'mid' }) + '</div>';
        case 'psi': return '<div class="title">Psi game' + (s.cause ? ' — ' + esc(s.cause) : '') + '</div><div class="tracebox"><span><b>' + s.cb + '</b>' + esc(C) + '</span><span class="vs">v</span><span><b>' + s.rb + '</b>' + esc(R) + '</span></div><div class="bres ' + (s.cb !== s.rb ? 'bad' : 'good') + '">' + (s.cb !== s.rb ? 'They differ — it works' : 'They match — it fails') + '</div>';
        case 'runend': return '<div class="title">' + (s.how === 'jacked' ? esc(R) + ' jacks out' : 'The run on ' + esc(W.srv(s.sid)) + ' is stopped') + '</div>' + (s.by ? '<div class="sub">by ' + esc(s.by) + '</div>' : '');
      }
      return '';
    }

    /* ---------- the other side's newest move, and since your last move ---------- */
    function allLines() {
      const g = game();
      if (!g || !g.log || !g.log.length) return [];
      return W.lines(g.log, g, (g.logN || g.log.length) - g.log.length);
    }
    function reelHtml(pr) {
      const g = game();
      if (!g || g.phase === 'over') return '';
      const ls = allLines().filter(l => !l.turn && !l.quiet && l.by && l.by !== P.id);
      const l = ls[ls.length - 1];
      if (!l) return '';
      const p = pl(l.by);
      if (!p || !p.bot) return '';
      const lastTurn = allLines().filter(x => x.turn).slice(-1)[0];
      /* Cleared when the house's own next turn has begun: its last line is then
         from a turn ago. Your own turn starting does not clear it — that is
         when "Just now · your turn" matters most. */
      if (lastTurn && lastTurn.i > l.i && lastTurn.by === l.by) return '';
      /* It animates when its line changes, never on a repaint (or it looks dimmed for ever). */
      const fresh = P.reelAt !== l.i;
      P.reelAt = l.i;
      return '<div class="reel' + (fresh ? ' fresh' : '') + '" style="--h:' + esc(p.hex) + '"><small>Just now' + (pr && pr !== 'stale' && pr.t === 'turn' ? ' · your turn' : '') + '</small>' + W.html(l, g) + '</div>';
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
        if (l.quiet) continue;
        out.unshift(l);
      }
      return { lines: out, first: !reached };
    }
    function sinceHtml() {
      const s = sinceLines();
      const g = game();
      const last = s.lines[s.lines.length - 1];
      const lp = last && pl(last.by);
      if (lp && lp.bot) s.lines = s.lines.slice(0, -1);
      if (!s.lines.length) return '';
      const MAX = 6;
      const shown = P.sinceAll ? s.lines : s.lines.slice(-MAX);
      const hidden = s.lines.length - shown.length;
      return '<div class="since"><div class="sh">' + (s.first ? 'So far' : 'Since your last move') + '</div>' +
        (hidden ? '<button class="more" id="sinceMore">' + hidden + ' earlier</button>' : '') +
        shown.map((l, k) => '<div class="sl' + (k === shown.length - 1 ? ' new' : '') + (l.turn ? ' tl' : '') + (l.big ? ' big' : '') + '">' + W.html(l, g) + '</div>').join('') +
        (P.sinceAll && s.lines.length > MAX ? '<button class="more" id="sinceLess">Show fewer</button>' : '') + '</div>';
    }
    /* What your own last action did — a run's accesses, a trace, damage —
       kept on the screen after the telly's show has gone. */
    function lastMoveHtml() {
      const g = game();
      if (!g || g.phase === 'over' || g.run) return '';
      const all = allLines();
      let i = all.length - 1;
      while (i >= 0 && !(all[i].by === P.id && W.CHOSE[all[i].t])) { if (all[i].turn) return ''; i--; }
      if (i < 0) return '';
      const ls = all.slice(i).filter(l => !l.quiet && !l.turn);
      if (ls.length < 2) return '';
      return '<div class="since mine"><div class="sh">Your last move</div>' + ls.slice(0, 10).map(l => '<div class="sl new' + (l.big ? ' big' : '') + '">' + W.html(l, g) + '</div>').join('') + '</div>';
    }
    /* How to play: what the house would do in your place, for this question only. */
    function coachHtml(pr) {
      const c = P.coach;
      if (!c || !pr || pr === 'stale' || c.n !== pr.n) return '';
      return '<div class="card coach"><div class="coach-k">Coach</div><div class="coach-l">' + esc(c.label) + '</div><button class="btn ghost small" id="coachGo">Do what the coach suggests</button></div>';
    }
    const undoHtml = () => P.undo ? '<button class="undo" id="undo"><b>Take back</b><span>' + esc(P.undo.what.replace(/\.$/, '')) + '</span></button>' : '';
    function hurryHtml() {
      const h = P.pub && P.pub.hurry;
      if (!h || !isRemote()) return '';
      const others = h.ids.filter(id => id !== P.id);
      return others.length ? '<button class="btn ghost" id="hurry">Play the house’s move for ' + esc(others.map(pname).join(' and ')) + '</button>' : '';
    }

    /* ---------- the run, as it happens ---------- */
    function runHtml() {
      const g = game(), run = g && g.run;
      if (!run) return '';
      const s = g.corp.servers.find(x => x.id === run.sid);
      const where = run.stage === 'encounter' ? 'meeting the ice' : run.stage === 'approach' ? 'approaching the ice' : run.stage === 'server' ? 'at the server' : run.stage === 'access' || run.stage === 'success' ? 'inside' : run.stage;
      const mine = mySide() === 'corp' && P.me ? P.me.mine : null;
      let out = '<div class="card runcard"><div class="title">' + A.icon('run', 16) + ' Run on ' + esc(W.srv(run.sid)) + ' <small>' + esc(where) + '</small></div>';
      if (run.stim || run.bpc) out += '<div class="sub">' + (run.stim ? run.stim + ' Stimhack credit' + (run.stim === 1 ? '' : 's') : '') + (run.stim && run.bpc ? ' · ' : '') + (run.bpc ? run.bpc + ' bad-publicity credit' + (run.bpc === 1 ? '' : 's') : '') + ' for this run</div>';
      if (s) out += '<div class="runice">' + s.ice.slice().reverse().map(v => A.iceRow(v, { run, mine })).join('') + '<div class="runsrv' + (run.stage === 'server' || run.stage === 'access' ? ' at' : '') + '">' + esc(s.name) + '</div></div>';
      if (run.enc) out += '<div class="sub">Your icebreakers: ' + (run.enc.breakers.length ? run.enc.breakers.map(b => esc(CARD[b.k].name) + ' ' + b.str).join(' · ') : 'none') + ' — the ice is strength <b>' + run.enc.str + '</b></div>';
      if (run.accessing) out += '<div class="zcard">' + A.face(run.accessing.card, { size: 'mid' }) + '</div>';
      return out + '</div>';
    }

    /* ================================================================
       The question
       ================================================================ */
    function askHtml(pr) {
      const g = game();
      if (pr === 'stale') return waitCard('Hold on', 'The table is moving on.');
      if (!pr) {
        if (g.phase === 'over') return waitCard('The game is over', '');
        const x = g.prompt;
        if (!x) return waitCard('One moment', '');
        return '<div class="card"><div class="title">' + esc(pname(x.seat)) + '</div><div class="sub">' + esc(x.why || '') + '</div>' + upNext(g) + '</div>';
      }
      if (pr.t === 'turn') return turnHtml(pr);
      if (pr.t === 'enc') return encHtml(pr);
      return pickHtml(pr);
    }
    function upNext(g) {
      const side = mySide();
      if (!g.active || g.active === side) return '';
      return '<div class="upnext">You’re up next — plan your turn.</div>';
    }
    const optBtn = (x, attr) => '<button class="opt" ' + attr + '="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + '>' + '<span class="lab"><b>' + esc(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + (x.plan ? '<small>' + esc(x.plan) + '</small>' : '') + (x.bad ? '<span class="why">' + esc(x.bad) + '</span>' : '') + '</span>' + '</button>';
    function turnHtml(pr) {
      const g = game();
      const side = mySide();
      const X = side === 'corp' ? g.corp : g.runner;
      const opts = pr.options;
      const by = (...k) => opts.filter(x => k.indexOf(x.kind) >= 0);
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div><div class="clicks">' + clicksHtml(X.clicks, side) + '<span>' + A.icon('credit', 15) + '<b>' + X.credits + '</b> credits</span></div>';
      const runs = by('run');
      if (runs.length) out += '<h2>' + A.icon('run', 13) + ' Run a server</h2><div class="runs">' + runs.map(x => '<button class="runb" data-turn="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + '><b>' + esc(x.label.replace(/^Run /, '').replace(/^Sneakdoor Beta: run Archives as HQ$/, 'Sneakdoor → HQ')) + '</b><small>' + esc(x.sub || '') + '</small></button>').join('') + '</div>';
      const free = by('free');
      if (free.length) out += '<h2>Free — no click</h2><div class="opts">' + free.map(x => optBtn(x, 'data-turn')).join('') + '</div>';
      const hand = by('install', 'play', 'event');
      if (hand.length) out += '<h2>From your hand · one click each</h2><div class="opts">' + hand.map(x => optBtn(x, 'data-turn')).join('') + '</div>';
      const adv = by('adv', 'trashres');
      if (adv.length) out += '<h2>' + (side === 'corp' ? 'Advance and trash' : '') + '</h2><div class="opts">' + adv.map(x => optBtn(x, 'data-turn')).join('') + '</div>';
      const ab = by('ability');
      if (ab.length) out += '<h2>Your cards</h2><div class="opts">' + ab.map(x => optBtn(x, 'data-turn')).join('') + '</div>';
      const basic = by('basic');
      out += '<h2>Basic actions</h2><div class="basics">' + basic.map(x => '<button class="bas" data-turn="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + '><b>' + esc(x.label) + '</b><small>' + esc(x.bad || x.sub || '') + '</small></button>').join('') + '</div>';
      const end = opts.find(x => x.kind === 'end');
      if (end && !end.bad) { o.bar.innerHTML = '<button class="btn" data-turn="end">End your turn</button>'; o.bar.classList.remove('hide'); }
      return out + '</div>';
    }
    function clicksHtml(n, side) {
      const tot = Math.max(n, side === 'corp' ? 3 : 4);
      let s = '<span class="clk">';
      for (let i = 0; i < tot; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>';
      return s + ' <b>' + n + '</b> click' + (n === 1 ? '' : 's') + '</span>';
    }
    function encHtml(pr) {
      const g = game(), run = g.run, enc = run && run.enc;
      let out = '<div class="card mine enc"><div class="title">' + esc(pr.why) + '</div>';
      if (enc) out += '<div class="encice">' + A.iceRow(Object.assign({ iid: enc.iid, k: enc.k, rez: true, str: enc.str, adv: 0 }), { run }) + '</div>';
      out += '<div class="sub">You have ' + g.runner.credits + ' credit' + (g.runner.credits === 1 ? '' : 's') + (run && (run.stim || run.bpc) ? ' + ' + ((run.stim || 0) + (run.bpc || 0)) + ' for this run' : '') + ', ' + g.runner.clicks + ' click' + (g.runner.clicks === 1 ? '' : 's') + '. Unbroken subroutines fire, in order.</div>';
      const opts = pr.options.filter(x => x.kind !== 'done');
      const all = opts.filter(x => x.kind === 'all'), one = opts.filter(x => x.kind !== 'all');
      if (all.length) out += '<h2>Break everything</h2><div class="opts">' + all.map(x => optBtn(x, 'data-enc')).join('') + '</div>';
      if (one.length) out += '<h2>One at a time</h2><div class="opts">' + one.map(x => optBtn(Object.assign({}, x, { sub: x.sub2 || null }), 'data-enc')).join('') + '</div>';
      if (!opts.length) out += '<div class="note">Nothing you have can break this ice.</div>';
      const done = pr.options.find(x => x.kind === 'done');
      if (done) { o.bar.innerHTML = '<button class="btn' + (done.subs && done.subs.length ? ' warn' : '') + '" data-enc="done">' + esc(done.label) + '</button>'; o.bar.classList.remove('hide'); }
      return out + '</div>';
    }
    function pickHtml(pr) {
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div>';
      const multi = pr.multi;
      if (multi) out += '<div class="sub">Choose ' + (pr.min === pr.max ? pr.min : (pr.min ? pr.min + ' to ' + pr.max : 'up to ' + pr.max)) + '.</div>';
      const numeric = pr.options.length > 6 && pr.options.every(x => /^\d+$/.test(x.id));
      if (numeric) out += '<div class="nums">' + pr.options.map(x => '<button class="numb" data-pick="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + ' title="' + esc(x.label) + '"><b>' + esc(x.id) + '</b><small>' + esc(x.label.replace(/^Spend \d+ → /, '').replace(/^Take \d+ from Bank Job instead.*$/, 'take').replace(/^Access the server as normal$/, 'access')) + '</small></button>').join('') + '</div>';
      else out += '<div class="opts">' + pr.options.map(x => {
        const on = multi && P.multi.indexOf(x.id) >= 0;
        return '<button class="opt' + (on ? ' on' : '') + '" data-pick="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + '>' + (multi ? '<span class="tick">' + (on ? '&#10003;' : '') + '</span>' : '') +
          '<span class="lab"><b>' + esc(x.label || x.id) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + (x.bad ? '<span class="why">' + esc(x.bad) + '</span>' : '') + '</span>' + '</button>';
      }).join('') + '</div>';
      if (multi) {
        const okN = P.multi.length >= pr.min && P.multi.length <= pr.max;
        o.bar.innerHTML = '<button class="btn" id="pickGo"' + (okN ? '' : ' disabled') + '>Confirm (' + P.multi.length + ')</button>';
        o.bar.classList.remove('hide');
      } else if (pr.skip) { o.bar.innerHTML = '<button class="btn ghost" id="skip">' + esc(pr.skip) + '</button>'; o.bar.classList.remove('hide'); }
      return out + '</div>';
    }

    /* ================================================================
       You: your side of the table and your hand
       ================================================================ */
    function statsHtml(g, side) {
      const C = g.corp, R = g.runner;
      if (side === 'corp') return '<div class="facts"><span>' + A.icon('credit', 15) + '<b>' + C.credits + '</b> credits</span><span>' + A.icon('agenda', 15) + '<b>' + C.points + '</b>/' + g.win + ' points</span><span>' + A.icon('card', 14) + C.hqN + ' in HQ (max ' + C.handMax + ')</span><span>' + A.icon('deck', 14) + C.rdN + ' in R&D</span>' + (C.bp ? '<span>' + A.icon('bp', 14) + C.bp + ' bad publicity</span>' : '') + (C.recur ? '<span>' + A.icon('credit', 14) + C.recur + ' for traces</span>' : '') + '</div>';
      return '<div class="facts"><span>' + A.icon('credit', 15) + '<b>' + R.credits + '</b> credits</span><span>' + A.icon('agenda', 15) + '<b>' + R.points + '</b>/' + g.win + ' points</span><span>' + A.icon('card', 14) + R.gripN + ' in grip (max ' + R.handMax + ')</span><span>' + A.icon('deck', 14) + R.stackN + ' in stack</span><span>' + A.icon('link', 14) + R.link + ' link</span><span>' + A.icon('mu', 14) + (R.mu.total - R.mu.used) + ' of ' + R.mu.total + ' memory free</span>' +
        (R.tags ? '<span class="warnt">' + A.icon('tag', 14) + R.tags + ' tag' + (R.tags === 1 ? '' : 's') + '</span>' : '') + (R.brain ? '<span class="warnt">' + A.icon('brain', 14) + R.brain + ' brain damage</span>' : '') + '</div>';
    }
    function meHtml(side) {
      const g = game();
      const me = P.me;
      const X = side === 'corp' ? g.corp : g.runner;
      const id = CARD[X.ident];
      let out = '<div class="camp"><h2>You · the ' + (side === 'corp' ? 'Corp' : 'Runner') + ' · ' + esc(D.FACTIONS[X.fac].name) + '</h2>' +
        '<div class="ident"><b>' + esc(id.name) + '</b> <small>' + esc(id.text) + '</small></div>' + statsHtml(g, side);
      if (me && me.hand) out += '<h2>Your hand · ' + me.hand.length + '</h2><div class="hand">' + me.hand.map(h => '<button class="hcard" data-zoom="' + esc(h.k) + '">' + A.face(h.k, { size: 'mid' }) + '</button>').join('') + '</div>';
      if (side === 'corp') out += '<h2>Your servers</h2>' + A.currents(g) + A.servers(g, { mine: me ? me.mine : null, small: false });
      else out += (me && me.peek ? '<div class="note">Deep Thought: the top of R&D is <b>' + esc(CARD[me.peek].name) + '</b></div>' : '') + '<h2>Your rig</h2>' + A.currents(g) + A.rig(g, { wsMine: me ? me.wsMine : null, fdMine: me ? me.fdMine : null });
      const sc = side === 'corp' ? g.corp.score.map(s => s.k) : g.runner.score;
      if (sc.length) out += '<h2>Your score area</h2><div class="chips">' + sc.map(k => '<button class="chipb" data-zoom="' + esc(k) + '">' + A.spine(k) + '</button>').join('') + '</div>';
      if (side === 'corp' && me && me.archDown && me.archDown.length) out += '<div class="sub">Face down in Archives (only you know): ' + esc(me.archDown.map(k => CARD[k].name).join(', ')) + '</div>';
      return out + '</div>';
    }

    /* ================================================================
       The table tab: both sides, all of it public
       ================================================================ */
    function tableTabHtml() {
      const g = game();
      if (!g) return waitCard('No game yet', '');
      const mine = mySide() === 'corp' && P.me ? P.me.mine : null;
      const C = g.corp, R = g.runner;
      const head = (seat, side) => { const p = pl(seat); return '<div class="pc-h" style="--h:' + esc(p.hex) + '"><i></i><b>' + esc(p.name) + '</b><span>' + (side === 'corp' ? 'Corp' : 'Runner') + ' · ' + esc(D.FACTIONS[(side === 'corp' ? C : R).fac].name) + (p.bot ? ' · house ' + esc(p.level) : '') + '</span></div>'; };
      let out = '<div class="card"><div class="title">Round ' + g.round + '</div><div class="sub">' + (g.active ? (g.active === 'corp' ? 'The Corp' : 'The Runner') + ' is taking a turn.' : '') + ' First to ' + g.win + ' points.</div></div>';
      out += '<div class="pcard">' + head(C.seat, 'corp') + '<div class="ident"><b>' + esc(CARD[C.ident].name) + '</b> <small>' + esc(CARD[C.ident].text) + '</small></div>' + statsHtml(g, 'corp') +
        (C.score.length ? '<div class="chips">' + C.score.map(s => '<button class="chipb" data-zoom="' + esc(s.k) + '">' + A.spine(s.k) + (s.agenda ? ' · ' + s.agenda + ' counter' : '') + '</button>').join('') + '</div>' : '') + '</div>';
      out += '<div class="tablesrv">' + A.currents(g) + A.servers(g, { mine }) + '</div>';
      if (C.arch.up.length) out += '<div class="sub">Archives, face up: ' + esc(C.arch.up.map(k => CARD[k].name).join(', ')) + '</div>';
      out += '<div class="pcard">' + head(R.seat, 'runner') + '<div class="ident"><b>' + esc(CARD[R.ident].name) + '</b> <small>' + esc(CARD[R.ident].text) + '</small></div>' + statsHtml(g, 'runner') +
        (R.score.length ? '<div class="chips">' + R.score.map(k => '<button class="chipb" data-zoom="' + esc(k) + '">' + A.spine(k) + '</button>').join('') + '</div>' : '') + A.rig(g, mySide() === 'runner' && P.me ? { wsMine: P.me.wsMine, fdMine: P.me.fdMine } : {}) + '</div>';
      if (R.heap.length) out += '<div class="sub">The heap: ' + esc(R.heap.map(k => CARD[k].name).join(', ')) + '</div>';
      return out;
    }
    function rulesHtml() {
      const M = D.MANIFEST;
      return '<div class="card"><div class="title">A turn</div><ul class="rules">' +
        '<li><b>The Corp</b> draws a card, then has 3 clicks: draw, a credit, install a card (ice in front of a server; agendas and assets in a remote server), play an operation, advance a card (a click and a credit), trash a resource while the Runner is tagged (a click and 2), or purge virus counters (all 3 clicks).</li>' +
        '<li><b>The Runner</b> has 4 clicks: draw, a credit, install a program, hardware or resource, play an event, remove a tag (a click and 2), or run a server.</li>' +
        '<li>Score an agenda for free once it has its advancement tokens. Rez a card by paying its cost — ice usually when the Runner reaches it.</li>' +
        '<li>Hand size is 5 at the end of each turn; brain damage lowers the Runner’s.</li></ul></div>' +
        '<div class="card"><div class="title">A run</div><ul class="rules"><li>The Runner meets the server’s ice from the outside in. The Corp may rez each one as it is approached.</li>' +
        '<li>An icebreaker breaks subroutines on ice of its type (a fracter barriers, a decoder code gates, a killer sentries; an AI any) once its strength is at least the ice’s. What isn’t broken fires — “End the run” stops it.</li>' +
        '<li>Past the ice, the run succeeds: HQ shows one random card, R&D the top card, Archives everything, a remote what is in it. Agendas are stolen; anything with a trash cost may be trashed for it.</li>' +
        '<li>After the first ice you may jack out instead of going on.</li></ul></div>' +
        '<div class="card"><div class="title">Winning</div><ul class="rules"><li>' + (game() ? game().win : 7) + ' agenda points wins, either side.</li><li>The Corp also wins if the Runner takes more damage than they have cards in hand (flatlined); the Runner wins if the Corp must draw from an empty R&D.</li></ul></div>' +
        '<div class="card"><div class="title">Rulings on this table</div><ul class="rules">' + M.decisions.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
        '<div class="card"><div class="sub">Android: Netrunner is designed by Richard Garfield and Lukas Litzsinger and was published by Fantasy Flight Games. The card pictures are the host’s own copies; every line of text here is written fresh. This is built to sit beside a copy of the game, not to replace one.</div></div>';
    }

    /* ================================================================
       Lobby and the end
       ================================================================ */
    function lobbyHtml() {
      const lv = P.pub.lobby || { seated: [], house: [] };
      const sideName = s => s === 'corp' ? 'the Corp' : 'the Runner';
      const deckWords = p => p.deck ? '“' + esc(p.deck.name) + '” · ' + esc(CARD[p.deck.ident].name) + (p.deck.bad ? ' <span class="why">(' + esc(p.deck.bad) + ')</span>' : '') : 'the starter deck';
      const rows = lv.seated.map(p => '<div class="siteL"><b style="color:' + esc(p.hex) + '">' + esc(p.name) + '</b><span class="sub">' + sideName(p.side) + ' · ' + (p.id === P.id ? 'you' : 'phone') + ' · ' + deckWords(p) + '</span></div>').join('') +
        lv.house.map(p => '<div class="siteL"><b style="color:' + esc(p.hex) + '">' + esc(p.name) + '</b><span class="sub">' + sideName(p.side) + ' · house · ' + esc(p.level) + '</span></div>').join('') +
        (lv.watching || []).map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">watching</span></div>').join('');
      let opts = '';
      if (isRemote()) {
        const seg = (key, list, cur) => '<div class="seg">' + list.map(([k, l]) => '<button class="' + (String(k) === String(cur) ? 'on' : '') + '" data-opt="' + key + '" data-v="' + esc(k) + '">' + esc(l) + '</button>').join('') + '</div>';
        const setsSeg = cur => { const have = D.setList(cur); return '<div class="seg wrap">' + D.PRODUCTS.filter(p => p.code !== 'core' && D.built(p.code)).map(p => { const on = have.indexOf(p.code) >= 0; const next = on ? have.filter(x => x !== p.code) : have.concat(p.code); return '<button class="' + (on ? 'on' : '') + '" data-opt="sets" data-v="' + esc(D.setKey(next)) + '">' + esc(p.short) + '</button>'; }).join('') + '</div>'; };
        const camp = lv.mode === 'campaign', cp = lv.campaign || { lines: [] };
        const CAMP_FACS = { corp: [['hb', 'HB · Seidr Laboratories'], ['weyland', 'Weyland · Skorpios']], runner: [['criminal', 'Criminal · Steve Cambridge'], ['shaper', 'Shaper · Ayla Rahim']] };
        const campaignHtml = !camp ? '' : '<div class="card"><div class="title">Terminal Directive</div>' + cp.lines.map(l => '<div class="sub">' + esc(l) + '</div>').join('') +
          (!cp.games && !cp.done ? '<h2>The Corp’s ethos</h2>' + seg('ethos', [['corp:protector', 'Protector'], ['corp:predator', 'Predator']], 'corp:' + (cp.ethos.corp || 'protector')) +
            '<h2>The Runner’s ethos</h2>' + seg('ethos', [['runner:protector', 'Protector'], ['runner:predator', 'Predator']], 'runner:' + (cp.ethos.runner || 'protector')) +
            '<div class="sub">Chosen once, for the whole campaign: it decides which campaign cards each side is given as it advances.</div>' : '') +
          (cp.games ? '<button class="btn ghost" data-opt="campaign" data-v="new">Start a new campaign (this one is forgotten)</button>' : '') + '</div>';
        const learn = lv.mode === 'learn';
        const learnHtml = !learn ? '' : '<div class="card"><div class="title">How to play</div><div class="sub">A short game to 5 points with the Haas-Bioroid and Shaper starter decks. Lesson cards explain each new thing as it first comes up, a coach under every question shows what the house would do in your place, and the house plays gently. Nothing is banked.</div></div>';
        opts = '<h2>What to play</h2>' + seg('mode', [['game', 'One game'], ['learn', 'How to play'], ['campaign', 'Terminal Directive campaign']], lv.mode || 'game') + campaignHtml + learnHtml +
          '<h2>' + (P.solo ? 'You play' : 'The first phone plays') + '</h2>' + seg('side', [['runner', 'The Runner'], ['corp', 'The Corp']], lv.side) +
          (learn ? '' : camp ? '<h2>The Corp</h2>' + seg('corp', [['random', 'Random']].concat(CAMP_FACS.corp), lv.corp) + '<h2>The Runner</h2>' + seg('runner', [['random', 'Random']].concat(CAMP_FACS.runner), lv.runner) +
            '<div class="sub">Core Set and Terminal Directive cards. A deck built on a phone with a Terminal Directive identity replaces the starter deck.</div>' :
          '<h2>The Corp’s starter deck</h2>' + seg('corp', [['random', 'Random']].concat(D.CORPS.map(f => [f, D.FACTIONS[f].short])), lv.corp) +
          '<h2>The Runner’s starter deck</h2>' + seg('runner', [['random', 'Random']].concat(D.RUNNERS.map(f => [f, D.FACTIONS[f].short])), lv.runner) +
          '<div class="sub">A deck built on a phone replaces the starter deck for that side.</div>' +
          '<h2>Card sets for built decks</h2><div class="sub">The Core Set is always in; tap a set to take it out or put it back.</div>' + setsSeg(lv.sets) +
          '<h2>Core Set copies</h2>' + seg('pool', [['one', 'One Core Set'], ['three', 'Three Core Sets']], lv.pool)) +
          (lv.house.length && !learn ? '<h2>How well the house plays</h2>' + seg('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], lv.level) : '') +
          (camp || learn ? '' : '<h2>Agenda points to win</h2>' + seg('win', [['5', '5 · short'], ['6', '6'], ['7', '7 · the book']], lv.win)) +
          '<h2>Pace</h2>' + seg('pace', [['slow', 'Slow'], ['relaxed', 'Relaxed'], ['brisk', 'Brisk']], lv.pace) +
          (P.solo ? '' : '<h2>Sound on the telly</h2>' + seg('sound', [['on', 'On'], ['off', 'Off']], lv.sound ? 'on' : 'off'));
        o.bar.innerHTML = camp && cp.done ? '<div class="sub">The campaign is over — start a new one above, or play one game.</div>' : '<button class="btn" id="go">' + (learn ? 'Start the lesson' : camp ? (cp.games ? 'Play the next campaign game' : 'Begin the campaign') : P.solo ? 'Jack in' : 'Start the game') + '</button>';
        o.bar.classList.remove('hide');
      }
      const meSeat = lv.seated.find(p => p.id === P.id);
      const mydeck = builder && meSeat ? '<div class="mydeck"><div><small>Your deck as the ' + (meSeat.side === 'corp' ? 'Corp' : 'Runner') + '</small><b>' + deckWords(meSeat) + '</b></div><button class="btn ghost" id="deckOpen">Decks</button></div>' : '';
      return (o.lobbyTop ? o.lobbyTop() : '') + mydeck + '<div class="card"><div class="title">Android: Netrunner</div><div class="sub">A megacorp guards its agendas behind ice; a runner breaks in to steal them. Two players — one Corp, one Runner; the house takes an empty side.</div>' + rows + '</div>' + opts +
        (isRemote() ? '' : '<div class="sub" style="margin-top:12px">' + esc(pname(P.pub.remote) === '?' ? 'The first phone' : pname(P.pub.remote)) + ' starts the game.</div>') +
        (o.soloUrl ? '<button class="btn ghost" id="soloGo">Play alone on this phone — no telly</button><div class="sub">You against the house, saved on this phone; the telly and the room are left alone.</div>' : '') +
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
          winSmall: 'wins', loseSmall: me => me.total + ' agenda point' + (me.total === 1 ? '' : 's') + '.',
          lines: { title: 'The game is over', count: 'Counting the agendas' } });
      }
      if (f && f.stage !== 'table') return block + (isRemote() ? '<button class="btn ghost" id="skipFin">Skip to the table</button>' : '');
      const pay = (P.pub.pay || []).find(p => pl(P.id) && p.name === pl(P.id).name);
      if (P.pub.learnDone) {
        const won = R && R.rows.find(r => r.id === P.id && r.won);
        return '<div class="card"><div class="coach-k">How to play</div><div class="title">Tutorial complete</div><div class="sub">' + (R ? esc(R.name) + ' won' + (won ? ' — well played.' : '.') + ' ' : '') + 'You have seen the turns, runs, ice, rezzing and scoring. A full game is played to 7 points, with the house at full strength — and you can build your own decks in the lobby (Decks).</div></div>' +
          (isRemote() ? '<button class="btn" id="again">Set up a real game</button>' : '') + (o.menuButton !== false ? '<button class="btn ghost" id="menu">' + (P.solo ? 'Games hub' : 'Games menu') + '</button>' : '');
      }
      return block + (R ? '<div class="card"><div class="title">' + esc(R.name) + ' wins</div>' +
        '<div class="sub">' + esc(R.how === 'points' ? (R.side === 'corp' ? 'The Corp' : 'The Runner') + ' ' + W.ENDS.points : W.ENDS[R.how] || '') + (R.tiebreak ? ' Level on points: the Corp holds on.' : '') + '</div>' + (pay && !P.solo ? '<div class="sub">Banked: ' + esc(pay.detail) + '</div>' : '') +
        '<table class="final"><tr><th></th><th>Side</th><th>Agendas</th><th>Points</th></tr>' + R.rows.slice().sort((a, b) => a.place - b.place).map(r => '<tr class="' + (r.won ? 'win' : '') + '"><td><b style="color:' + esc(r.hex) + '">' + esc(r.name) + '</b></td><td>' + (r.side === 'corp' ? 'Corp' : 'Runner') + '</td><td>' + esc(r.agendas.map(k => CARD[k].name).join(', ') || '—') + '</td><td><b>' + r.points + '</b></td></tr>').join('') + '</table></div>' : '') +
        (P.pub.campaignNotes ? '<div class="card"><div class="title">The campaign</div>' + P.pub.campaignNotes.map(l => '<div class="sub">' + esc(l) + '</div>').join('') + '</div>' : '') +
        (isRemote() ? '<button class="btn" id="again">' + (P.solo ? 'New game' : 'Play again') + '</button>' : '') + (o.menuButton !== false ? '<button class="btn ghost" id="menu">' + (P.solo ? 'Games hub' : 'Games menu') + '</button>' : '');
    }

    /* ================================================================
       Wiring every button of the current paint
       ================================================================ */
    function wire() {
      const scope = o.root.parentNode || o.root;
      const on = (sel, fn) => scope.querySelectorAll(sel).forEach(x => { x.onclick = ev => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (!locked()) fn(x, ev); }; });
      const pr = myPrompt();
      const Q = pr && pr !== 'stale' ? pr : null;
      on('[data-tab]', x => { P.tab = x.dataset.tab; lock(); paint(); });
      on('#cont', x => { lock(); send({ t: 'cont', id: x.dataset.id }); });
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
      on('#coachGo', () => { if (P.coach) act(P.coach.a); });
      on('#soloGo', () => { location.href = o.soloUrl; });
      on('#deckOpen', () => { P.decksOpen = true; if (builder) builder.view = 'list'; paint(); });
      on('[data-opt]', x => send({ t: 'opt', key: x.dataset.opt, value: x.dataset.v }));
      /* The little card icon on an option shows the card; it never acts. */
      scope.querySelectorAll('[data-zoom]').forEach(x => { x.onclick = ev => { if (ev && ev.stopPropagation) ev.stopPropagation(); zoom(x.dataset.zoom); }; });
      if (!Q) return;
      const n = Q.n;
      on('[data-turn]', x => {
        const id = x.dataset.turn;
        if (id === 'end' && x.dataset.armed !== '1' && Q.options.some(o2 => !o2.bad && o2.kind === 'free')) { x.dataset.armed = '1'; x.textContent = 'Tap again to end your turn'; return; }
        act({ t: 'turn', n, id });
      });
      on('[data-enc]', x => {
        const id = x.dataset.enc;
        if (id === 'done' && x.dataset.armed !== '1') {
          const done = Q.options.find(o2 => o2.id === 'done');
          if (done && done.subs && done.subs.length && Q.options.some(o2 => !o2.bad && o2.id !== 'done')) { x.dataset.armed = '1'; x.textContent = 'Tap again: ' + done.subs.length + ' subroutine' + (done.subs.length === 1 ? '' : 's') + ' will fire'; return; }
        }
        act({ t: 'enc', n, id });
      });
      const choose = id => {
        if (Q.multi) {
          const i = P.multi.indexOf(id);
          if (i >= 0) P.multi.splice(i, 1);
          else if (P.multi.length < Q.max) P.multi.push(id);
          else if (Q.max === 1) P.multi = [id];
          return paint();
        }
        act({ t: 'pick', n, id });
      };
      on('[data-pick]', x => choose(x.dataset.pick));
      on('#pickGo', () => act({ t: 'pick', n, ids: P.multi.slice() }));
      on('#skip', () => act({ t: 'skip', n }));
    }
    function zoom(k) {
      const z = o.zoomEl;
      if (!z || !CARD[k]) return;
      z.innerHTML = '<div class="zin">' + A.face(k, { size: 'big' }) + '<div class="ztext"><b>' + esc(CARD[k].name) + '</b> · ' + esc(A.typeLine(CARD[k])) + '<br>' + (CARD[k].subs ? CARD[k].subs.map(s => '↳ ' + esc(A.subLine(s))).join('<br>') : esc(CARD[k].text)) + '</div><div class="sub">Tap to close</div></div>';
      z.classList.remove('hide');
      z.onclick = () => z.classList.add('hide');
    }

    return { receive, paint, flash, P, setMe(id, name, hex) { P.id = id; P.name = name || P.name; P.hex = hex || P.hex; paint(); } };
  }

  const STYLES = `
:root{--bg:#0b1016;--panel:#141d28;--panel2:#0f1620;--line:#2b3b4f;--ink:#e9f0f7;--dim:#9db0c4;--hi:#4fc3ff;--red:#ff6a50;--good:#5fd18a;--bad:#ff7a66;--gold:#ffd36b}
.tabs{display:flex;gap:6px;margin:4px 0 6px;position:sticky;top:44px;z-index:4;background:var(--bg);padding:4px 0}
.tab{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--dim);border-radius:10px;padding:8px;font-weight:800;font-size:14px}
.tab.on{background:var(--hi);border-color:var(--hi);color:#04121c}
h2{margin:14px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);display:flex;align-items:center;gap:5px}
h2:empty{display:none}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:8px;min-width:0}
.card.mine{border-color:var(--hi)}
.title{font-weight:900;font-size:19px;color:var(--hi);letter-spacing:.01em;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.title small{font-size:12px;color:var(--dim);font-weight:700}
.sub{color:var(--dim);font-size:13px;margin-top:3px}
.btn{display:block;width:100%;background:var(--hi);border:0;color:#04121c;font-weight:900;font-size:17px;border-radius:14px;padding:14px;margin-top:10px}
.btn:disabled{opacity:.4}
.btn.warn{background:#ff9c6e}
.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--ink);font-weight:700;font-size:15px}
.btn.small{font-size:14px;padding:10px;margin-top:6px}
.opts{display:flex;flex-direction:column;gap:7px;margin-top:6px}
.opt{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:10px 11px;font-size:15px;min-width:0}
.opt:disabled{opacity:.45}
.opt.on{border-color:var(--hi);background:rgba(79,195,255,.14)}
.opt .lab{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.opt .lab small{color:var(--dim);font-size:12px;line-height:1.25}
.ospine{display:none}
.zoomb{flex:none;color:var(--dim);padding:6px;border:1px solid var(--line);border-radius:8px}
.why{color:#ffab9a;font-size:12px}
.tick{width:22px;height:22px;border-radius:6px;border:2px solid var(--line);flex:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#04121c}
.opt.on .tick{background:var(--hi);border-color:var(--hi)}
.clicks{display:flex;gap:14px;align-items:center;margin-top:6px;font-size:14px;flex-wrap:wrap}
.clicks span{display:inline-flex;align-items:center;gap:5px}
.clk i{display:inline-block;width:13px;height:13px;border-radius:50%;border:2px solid var(--hi);margin-right:2px}
.clk i.on{background:var(--hi)}
.runs{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}
.runb{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;background:#1a1416;border:1px solid #6b3b35;color:var(--ink);border-radius:12px;padding:9px 10px;min-width:0}
.runb b{color:#ff9c86;font-size:15px}
.runb small{color:var(--dim);font-size:11px;line-height:1.2}
.runb:disabled{opacity:.45}
.basics{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.bas{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:9px 10px;min-width:0}
.bas small{color:var(--dim);font-size:11px}
.bas:disabled{opacity:.45}
.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.numb{display:flex;flex-direction:column;align-items:center;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:8px 2px;min-width:0}
.numb b{font-size:20px;color:var(--hi)}
.numb small{font-size:10px;color:var(--dim);text-align:center;line-height:1.15}
.numb:disabled{opacity:.35}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chipb{background:none;border:0;padding:0;color:var(--ink);font-size:13px}
.note{font-size:12.5px;color:var(--dim);margin-top:8px}
.card.coach{border-color:#7fd3a0;background:rgba(127,211,160,.08)}
.coach-k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7fd3a0;font-weight:800}
.coach-l{font-weight:800;margin:4px 0 8px}
.lessoncard p{margin:.5em 0}
.facts{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-size:13px;color:var(--ink)}
.facts span{display:inline-flex;align-items:center;gap:4px}
.warnt{color:#ffab9a}
.camp{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:4px 10px 10px;margin-top:10px;font-size:13px}
.ident{margin-top:4px;font-size:13px}
.ident small{color:var(--dim)}
.hand{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.hcard{background:none;border:0;padding:0;color:inherit;font-size:9.5px;min-width:0}
.hcard .nf{width:100%}
.since{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:9px 11px;margin-top:6px;font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:4px}
.since .sh{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.since .sl.new{color:var(--ink)}
.since.mine{border-color:var(--hi)}
.since .sl.tl{color:var(--hi)}
.since .sl.big{color:var(--gold);font-weight:800}
.since .more{align-self:flex-start;background:transparent;border:1px solid var(--line);color:var(--dim);border-radius:9px;padding:4px 10px;font-size:12px}
.reel{margin-top:6px;padding:9px 11px;border-radius:12px;background:color-mix(in srgb,var(--h) 14%,transparent);border:1px solid var(--h);font-size:15px}
.reel.fresh{animation:reelIn .5s ease-out}
.encice{margin-top:6px;font-size:13px}
@keyframes reelIn{from{opacity:.2;transform:translateY(-4px)}to{opacity:1;transform:none}}
.reel small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--h);font-weight:800}
.upnext{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(79,195,255,.12);border:1px solid var(--hi);color:var(--hi);font-weight:800}
.undo{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;background:var(--panel2);border:1px dashed var(--hi);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:14px;text-align:left}
.undo b{color:var(--hi);flex:none}
.showcard{border-color:var(--red)}
.showcard .title{color:var(--ink)}
.showcard.k-score{border-color:var(--gold)}
.showcard.k-turn{border-color:var(--hi)}
.zcard{width:58%;margin:8px auto 0;font-size:11px}
.accs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px;font-size:9px}
.acc{display:flex;flex-direction:column;gap:3px;align-items:center;min-width:0}
.acc b{font-size:12px;color:var(--gold)}
.tracebox{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:8px}
.tracebox span{display:flex;flex-direction:column;align-items:center;font-size:12px;color:var(--dim)}
.tracebox b{font-size:30px;color:var(--ink)}
.tracebox .vs{font-size:18px;font-weight:900}
.bres{margin-top:8px;font-weight:900;font-size:17px;text-align:center;color:var(--gold)}
.bres.bad{color:var(--bad)} .bres.good{color:var(--good)}
.runcard{border-color:var(--red);font-size:12px}
.runcard .title{color:#ff9c86;font-size:16px}
.runice{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.runsrv{border:1px dashed var(--line);border-radius:8px;padding:4px 8px;font-weight:800;color:var(--dim);text-align:center}
.runsrv.at{border-color:var(--red);color:var(--ink)}
.enc .encface{width:62%;margin:6px auto;font-size:11px}
.pcard{border:1px solid var(--line);border-left:4px solid var(--h,#555);border-radius:12px;padding:8px 10px;margin-top:8px;background:var(--panel);font-size:12px}
.pc-h{display:flex;align-items:center;gap:6px;font-size:14px}
.pc-h i{width:12px;height:12px;border-radius:50%;background:var(--h)}
.pc-h span{color:var(--dim);font-size:12px;margin-left:auto}
.tablesrv{overflow-x:auto;margin-top:8px;font-size:11px;padding-bottom:4px}
.tablesrv .srvs{min-width:max-content}
.tablesrv .sv{width:9.5em;flex:none}
.camp .srvs{overflow-x:auto;font-size:11px}
.camp .sv{width:9.5em;flex:none}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{flex:1;min-width:22%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:10px 6px;font-size:14px;font-weight:700}
.seg button.on{background:var(--hi);border-color:var(--hi);color:#04121c}
.siteL{display:flex;align-items:center;gap:6px;font-size:14px;padding:6px 0;border-top:1px solid var(--line)}
.siteL b{flex:1}
ul.rules{margin:6px 0 0;padding-left:1.1em;font-size:14px;line-height:1.4}
table.final{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
table.final th,table.final td{padding:5px 4px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
table.final th{color:var(--dim);font-size:11px;text-transform:uppercase}
table.final tr.win td{color:var(--gold)}
.opencard .rc-h{font-weight:900;font-size:24px;color:var(--hi)}
.opencard .rc-sub{font-size:14px;margin-top:3px}
.opencard .rc-sc{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px}
.opencard .rc-p{display:flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:7px 10px;font-size:13px;flex-wrap:wrap}
.opencard .rc-p i{width:11px;height:11px;border-radius:50%;flex:none}
.opencard .rc-role{font-size:11px;color:var(--dim)}
.opencard .rc-t{flex-basis:100%;color:var(--dim)}
.opencard .rc-d{font-size:12px;color:var(--hi);font-weight:800}
.opencard .rc-sec{margin-top:10px}
.opencard .rc-sec h4{margin:0 0 3px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.opencard .rc-sec ul{margin:0;padding-left:1.1em;font-size:13.5px}
#zoom{position:fixed;inset:0;z-index:50;background:rgba(5,8,12,.94);display:flex;align-items:center;justify-content:center;padding:16px}
#zoom .zin{width:min(84vw,340px);font-size:15px}
#zoom .ztext{margin-top:10px;color:var(--ink);font-size:14px;line-height:1.4}
`;
  const Phone = { VERSION, create, STYLES };
  root.NrPhone = Phone;
})(typeof window !== 'undefined' ? window : this);
