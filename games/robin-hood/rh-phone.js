'use strict';
/* A Gest of Robin Hood — the handset. All of it, with no networking of its
 * own: controller.html gives it a socket to the hub, solo.html gives it the
 * in-page host. It paints from two messages — {t:'rh'} (the public table)
 * and {t:'rh-me'} (this seat's half: where Robin Hood really is, or what the
 * Carriages hold) — and sends orders back with `send`.
 *
 * Tabs: Play (the card in play, the question, the house's newest move,
 * since your last move, your side), Board (the map, the favour, both sides,
 * the Travellers) and Rules. The checklist's phone rules apply: the menu
 * comes from the engine as ready-made options, a greyed button says why,
 * anything that appears unasked ignores taps for a moment, the primary
 * action is pinned at the bottom, and the two messages may arrive in either
 * order. NEVER-HIDE LIST (F, 360x500): the question and its buttons; the
 * card in play (one line, tap for the whole card); the Royal Favour.
 */
(function (root) {
  const D = root.RhData, A = root.RhArt, W = root.RhWords;
  const VERSION = 1;
  const esc = A.esc;
  const LOCK_MS = 450;
  const nm = id => (D.SPACES[id] ? D.SPACES[id].name : id);
  const SIDE = { robin: 'Robin Hood', sheriff: 'the Sheriff' };

  function create(o) {
    const P = {
      id: null, name: '', hex: '#3f9d4a', pub: null, me: null, undo: null,
      tab: 'play', multi: [], lockUntil: 0, shape: '', myTurn: false, sinceAll: false, finStage: '', solo: !!o.solo, cardOpen: false
    };
    const send = m => o.send(m);
    const locked = () => Date.now() < P.lockUntil;
    const lock = () => { P.lockUntil = Date.now() + LOCK_MS; };
    const buzz = ms => { if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
    const game = () => P.pub && P.pub.game;
    const mine = () => { const g = game(); return g ? g.players.find(p => p.id === P.id) : null; };
    const pl = id => { const g = game(); return g ? g.players.find(x => x.id === id) : null; };
    const pname = id => { const p = pl(id); return p ? p.name : '?'; };
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
    /* This seat's secrets, for the map. */
    const secrets = () => (P.me ? { robinAt: P.me.side === 'robin' && D.SPACES[P.me.robinAt] ? P.me.robinAt : null, cars: P.me.cars || null } : {});

    /* ================================================================
       Messages in
       ================================================================ */
    function receive(m) {
      if (m.t === 'rh') { P.pub = m; if (!m.game) P.me = null; paint(); return; }
      if (m.t === 'rh-me') { P.me = m.me; P.undo = m.undo || null; paint(); return; }
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
      const shape = [pub && pub.screen, pr && pr !== 'stale' ? pr.t + pr.n : '-', tb ? 'tb' + tb.n + (tb.waiting.indexOf(P.id) >= 0 ? 'w' : 'd') : '', show ? 'sh' + show.n : '', P.tab].join('|');
      if (shape !== P.shape) {
        P.multi = [];
        P.shape = shape; lock();
        if (o.scrollTop) o.scrollTop();
      }
      const g0 = game();
      const mineNow = !!(g0 && g0.phase !== 'over' && pr && pr !== 'stale' && !tb);
      if (mineNow && !P.myTurn && pr.t === 'turn') buzz([90, 60, 90]);
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
      if (!pub) { m.innerHTML = waitCard('Waiting for the telly', 'A Gest of Robin Hood has not been started yet.'); return; }
      if (pub.screen === 'lobby') { m.innerHTML = lobbyHtml(); wire(); return; }
      const tabs = tabsHtml();
      if (P.tab === 'board') { m.innerHTML = tabs + boardHtml(); wire(); return; }
      if (P.tab === 'rules') { m.innerHTML = tabs + rulesHtml(); wire(); return; }
      if (pub.screen === 'over') { m.innerHTML = tabs + overHtml(); wire(); return; }
      if (!game()) { m.innerHTML = waitCard('Hold tight', ''); return; }
      if (!me) { m.innerHTML = tabs + waitCard('Watching', 'Two have sat down already.') + boardHtml(); wire(); return; }
      if (!P.me) { m.innerHTML = waitCard('Dealing you in', ''); return; }
      if (pub.paused) { m.innerHTML = tabs + waitCard('Paused', 'The house waits while your screen is away.'); wire(); return; }
      if (tb) m.innerHTML = tabs + tableHtml() + meHtml(me);
      else m.innerHTML = tabs + topHtml() + showHtml() + reelHtml(pr) + undoHtml() + askHtml(pr) + hurryHtml() + sinceHtml() + meHtml(me);
      wire();
    }
    const waitCard = (title, sub, extra) => '<div class="card"><div class="title">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + (extra || '') + '</div>';
    function tabsHtml() {
      const t = (k, l) => '<button class="tab' + (P.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + l + '</button>';
      return '<div class="tabs">' + t('play', 'Play') + t('board', 'Board') + t('rules', 'Rules') + '</div>';
    }
    /* The favour and the card in play: never hidden (F). */
    function topHtml() {
      const g = game();
      const me = mine();
      let h = '<div class="topbar"><div class="tb-fav">' + A.favour(g.favour, { small: true }) + '</div>';
      if (g.card) {
        const c = D.EVENTS[g.card];
        const half = c.rh ? c[me.side === 'robin' ? 'rh' : 'sh'] : null;
        h += '<button class="tb-card" id="cardOpen"><span class="tbc-n">' + A.icon('cart', 14, '#c9a24c') + c.c + '</span><b>' + esc(c.name) + '</b><small>' + esc(half ? 'Your half: ' + half.title : c.fortune ? 'Fortune event' : c.inspection ? 'Royal Inspection' : '') + '</small><span class="tbc-more">' + (P.cardOpen ? 'less' : 'card') + '</span></button>';
        if (P.cardOpen) h += '<div class="tb-full">' + A.eventCard(g.card, { mark: half ? me.side : null }) + '</div>';
      }
      return h + '</div>';
    }

    /* ---------- the Ballad's card (holds everyone) ---------- */
    function tableHtml() {
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
      return '<div class="card mine opencard">' + W.holdCardHtml(game()) + foot + '</div>';
    }
    /* ---------- the shows (on the telly too) ---------- */
    function showHtml() {
      const s = P.pub.show, g = game();
      if (!s) return '';
      let head = '', body = '';
      if (s.k === 'card') { head = 'The next card'; body = '<div class="zcard">' + A.eventCard(s.id) + '</div>'; }
      else if (s.k === 'arrive') { head = 'A Carriage reaches Nottingham'; body = '<div class="zcard">' + A.carriage(s.kind) + '</div>'; }
      else if ((s.k === 'rob' || s.k === 'robLand') && g.rob) { head = 'A Rob in ' + esc(nm(g.rob.at)); body = robHtml(g.rob, g); }
      else if (s.k === 'ri' && g.ri) {
        const pg = g.ri.pages[g.ri.pages.length - 1];
        head = 'Royal Inspection — ' + esc(W.PAGE_NAME[pg.k]);
        body = riStrip(pg.k) + '<div class="sub">' + esc(W.PAGE_RULE[pg.k]) + '</div><ul class="rules">' + pg.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' + A.favour(g.favour, { small: true });
      } else return '';
      const foot = P.solo ? '<button class="btn ghost small" id="showOk">Go on</button>' : '<div class="sub">On the telly now.</div>';
      return '<div class="card showcard"><div class="title">' + head + '</div>' + body + foot + '</div>';
    }
    function riStrip(k) {
      return '<div class="strip">' + ['unrest', 'mischief', 'governance', 'redeploy', 'reset'].map(x => '<span class="' + (x === k ? 'on' : '') + '">' + esc(W.PAGE_NAME[x]) + '</span>').join('') + '</div>';
    }
    function robHtml(R, g) {
      const tgt = R.target === 'treasury' ? '<div class="sub">The Treasury · Defence 0</div>' : R.target === 'traveller' ? A.traveller(R.card, { opt: R.opt }) : A.carriage(R.kind);
      const landed = R.stage === 'landed';
      const sum = landed && !R.noRoll ? '<div class="robsum"><b>' + R.robbers + '</b> robbers ' + (R.roll >= 0 ? '+ ' + R.roll : '− ' + (-R.roll)) + (R.bonus ? ' + ' + R.bonus : '') + ' = <b>' + R.total + '</b> against <b>' + R.need + '</b> (Defence ' + R.def + ' + ' + R.hench + ' Henchmen)</div><div class="bres ' + (R.win ? 'win' : 'lose') + '">' + (R.win ? 'Success!' : 'Failure') + '</div>'
        : R.noRoll ? '<div class="bres win">No roll needed</div>'
        : '<div class="robsum">' + R.robbers + ' robber' + (R.robbers > 1 ? 's' : '') + (R.robin ? ' with Robin Hood' : '') + (R.bonus ? ' +' + R.bonus : '') + ' must beat ' + (R.def + R.hench) + ' · the ' + R.die + ' die (' + A.dieFaces(R.die) + ')</div>';
      return '<div class="robgrid"><div class="robt">' + tgt + '</div><div class="robd">' + (R.noRoll ? '' : A.die(R.die, landed ? R.face : null, !landed)) + '</div></div>' + sum;
    }

    /* ---------- the house's newest move, and since your last move ---------- */
    function allLines() {
      const g = game();
      if (!g || !g.log || !g.log.length) return [];
      return W.lines(g.log, g, (g.logN || g.log.length) - g.log.length);
    }
    function reelHtml(pr) {
      const g = game();
      if (!g || g.phase === 'over') return '';
      const all = allLines();
      const ls = all.filter(l => !l.turn && !l.quiet && l.by && l.by !== P.id);
      const l = ls[ls.length - 1];
      if (!l) return '';
      const lastTurn = all.filter(x => x.turn).slice(-1)[0];
      if (lastTurn && lastTurn.i > l.i) return '';
      const p = pl(l.by);
      if (!p || !p.bot) return '';
      return '<div class="reel" style="--h:' + esc(p.hex) + '"><small>Just now' + (pr && pr !== 'stale' && pr.t === 'turn' ? ' · your turn' : '') + '</small>' + W.html(l, g) + '</div>';
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
        shown.map((l, k) => '<div class="sl' + (k === shown.length - 1 ? ' new' : '') + (l.turn ? ' tl' : '') + '">' + W.html(l, g) + '</div>').join('') +
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
        if (g.phase === 'over') return waitCard('The game is over', '');
        const x = g.prompt;
        if (!x) return g.hold ? '' : waitCard('One moment', '');
        return '<div class="card"><div class="title">' + esc(pname(x.seat)) + '</div><div class="sub">' + esc(x.why || '') + '</div>' + upNext(g) + '</div>';
      }
      if (pr.t === 'turn') return turnHtml(pr);
      return pickHtml(pr);
    }
    function upNext(g) {
      const me = mine();
      if (!g.card || !me || g.phase !== 'play' || !D.EVENTS[g.card].rh) return '';
      const chosen = Object.keys(g.boxes).some(k => g.boxes[k] === me.side);
      if (!chosen && g.active && g.active !== me.side) return '<div class="upnext">You choose next, from the boxes left — read your half of the card.</div>';
      return '';
    }
    function turnHtml(pr) {
      const g = game();
      const me = mine();
      const c = D.EVENTS[pr.card];
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div>';
      const taken = Object.keys(g.boxes).map(k => D.BOXES.find(b => b.id === k).name + ' (' + esc(pname(g.players.find(p => p.side === g.boxes[k]).id)) + ')');
      if (taken.length) out += '<div class="sub">Taken: ' + taken.join(', ') + '.</div>';
      out += '<div class="boxes">' + pr.options.map(x => '<button class="boxb' + (x.bad ? ' bad' : '') + (x.id === 'pass' ? ' pass' : '') + '" data-turn="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + '><b>' + esc(x.label) + '</b><small>' + esc(x.bad || x.sub || '') + '</small></button>').join('') + '</div>';
      out += '<div class="zcard mini">' + A.eventCard(pr.card, { mark: me.side }) + '</div>';
      return out + '</div>';
    }
    function pickHtml(pr) {
      const g = game();
      let out = '<div class="card mine"><div class="title">' + esc(pr.why) + '</div>';
      const lit = pr.options.filter(x => !x.bad && (x.space || D.SPACES[x.id])).map(x => x.space || x.id);
      if (pr.spaces || lit.length >= 2) {
        out += '<div class="minimap fit" id="mapPick">' + A.board(g, Object.assign({ light: lit, taps: true, fit: lit }, secrets())) + '</div><div class="note">Tap a lit space, or choose below.</div>';
      }
      if (pr.what === 'eventHalf') out += '<div class="zcard mini">' + A.eventCard(game().card) + '</div>';
      if (pr.what === 'robOption') {
        const d = (g.log || []).slice().reverse().find(e => e.t === 'tdraw');
        if (d) out += '<div class="zcard mini">' + A.traveller(d.card) + '</div>';
      }
      const multi = pr.multi;
      if (multi) out += '<div class="sub">Choose ' + (pr.min === pr.max ? pr.min : (pr.min ? pr.min + ' to ' + pr.max : 'up to ' + pr.max)) + '.</div>';
      out += '<div class="opts">' + pr.options.map(x => {
        const on = multi && P.multi.indexOf(x.id) >= 0;
        return '<button class="opt' + (on ? ' on' : '') + '" data-pick="' + esc(x.id) + '"' + (x.bad ? ' disabled' : '') + '>' + (multi ? '<span class="tick">' + (on ? '&#10003;' : '') + '</span>' : '') +
          '<span class="lab"><b>' + esc(x.label || x.id) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + (x.bad ? '<span class="why">' + esc(x.bad) + '</span>' : '') + '</span></button>';
      }).join('') + '</div>';
      if (multi) {
        const okN = P.multi.length >= pr.min && P.multi.length <= pr.max;
        o.bar.innerHTML = '<button class="btn" id="pickGo"' + (okN ? '' : ' disabled') + '>Confirm (' + P.multi.length + ')</button>';
        o.bar.classList.remove('hide');
      }
      if (pr.skip) out += '<button class="btn ghost" id="skip">' + esc(pr.skip) + '</button>';
      return out + '</div>';
    }

    /* ================================================================
       You
       ================================================================ */
    function meHtml(p) {
      const g = game();
      const me = P.me;
      const side = p.side;
      const first = g.first === side;
      let out = '<div class="camp"><h2>You · ' + (side === 'robin' ? 'Robin Hood and the Merry Men' : 'the Sheriff of Nottingham') + '</h2>' +
        '<div class="facts"><span>' + A.icon('coin', 15, '#d9d2c0') + '<b>' + g.sh[side] + '</b> shillings</span><span>' + (first ? '<b>First eligible</b>' : 'Second eligible') + '</span><span>Ballad ' + g.ballad + ' of 3 · ' + (g.toInspection > 0 ? g.toInspection + ' card' + (g.toInspection > 1 ? 's' : '') + ' to the Inspection' : 'Inspection now') + '</span></div>';
      if (side === 'robin') {
        const where = me && me.robinAt;
        out += '<div class="secret">' + A.icon('star', 15, '#e8c25a') + ' Robin Hood is ' + (where === 'prison' ? '<b>in Prison</b>' : where === 'avail' ? '<b>Available</b> — he comes back at the next Redeployment' : where === 'gone' ? 'gone' : '<b>in ' + esc(nm(where)) + '</b>, ' + (me.robinRev ? 'Revealed' : 'Hidden — only you know') ) + '</div>';
        out += '<div class="facts"><span>' + A.icon('man', 15, A.COL.robin) + W.countMen(g) + ' on the map</span><span>' + A.icon('man', 15, '#888') + g.avail.men + (g.avail.robin ? ' + Robin' : '') + ' Available</span><span>' + A.icon('prison', 15, '#bbb') + g.prison.n + ' in Prison</span><span>' + A.icon('camp', 15, '#2f7d3a') + W.countCamps(g) + ' Camps · ' + g.avail.camps + ' left</span></div>';
      } else {
        out += '<div class="facts"><span>' + A.icon('hench', 15, A.COL.sheriff) + W.countH(g) + ' on the map · ' + g.avail.h + ' Available</span><span>' + A.icon('prison', 15, '#bbb') + g.prison.n + ' outlaws in Prison</span></div>';
        if (me && me.cars) {
          out += '<h2>Your Carriages · only you see inside</h2><div class="cars">' + (me.cars.length ? me.cars.map(c => '<div class="carL"><b>' + esc(D.CARRIAGES[c.kind].name) + '</b> in ' + esc(nm(c.at)) + (c.rev ? ' · Revealed' : '') + ' <small>' + (D.SPACES[c.at].road === 'nottingham' ? 'one step from home' : 'next: ' + esc(nm(D.SPACES[c.at].road))) + '</small></div>').join('') : '<div class="sub">None on the roads.</div>') +
            '<div class="sub">Available: ' + (Object.keys(me.availCars || {}).map(k => me.availCars[k] + ' ' + D.CARRIAGES[k].name).join(', ') || 'none') + ' · used: ' + (g.used.length ? g.used.map(k => D.CARRIAGES[k].name).join(', ') : 'none') + '</div></div>';
        }
      }
      const subs = D.PARISHES.filter(k => g.spaces[k].state === 'sub').length;
      out += '<div class="sub">' + subs + ' of 7 Parishes Submissive: at the Inspection that is ' + (subs >= 5 ? '+1 Order' : subs >= 3 ? '+1 Justice' : subs >= 1 ? '+2 Justice' : '+3 Justice') + '.</div>';
      return out + '</div>';
    }

    /* ================================================================
       The board tab
       ================================================================ */
    function boardHtml() {
      const g = game();
      if (!g) return waitCard('No game yet', '');
      const last = allLines().filter(l => !l.quiet && !l.turn).slice(-1)[0];
      const e = last ? g.log[last.i - (g.logN - g.log.length)] : null;
      const lz = e ? (e.at || e.to || null) : null;
      let out = '<div class="minimap big">' + A.board(g, Object.assign({ light: lz && D.SPACES[lz] ? [lz] : [] }, secrets())) + '</div>';
      out += '<div class="card">' + A.favour(g.favour) + '</div>';
      out += '<div class="card"><div class="title">Ballad ' + g.ballad + ' of 3</div><div class="sub">' + (g.toInspection > 0 ? g.toInspection + ' card' + (g.toInspection > 1 ? 's' : '') + ' until the Royal Inspection' : 'The Royal Inspection') + (g.ballad === 3 ? ' — King Richard returns at its end.' : '.') + ' First eligible: ' + esc(pname(g.players.find(p => p.side === g.first).id)) + '.</div></div>';
      out += g.players.map(p => '<div class="pcard" style="--h:' + esc(p.hex) + '"><div class="pc-h"><i></i><b>' + esc(p.name) + '</b><span>' + (p.side === 'robin' ? 'Robin Hood' : 'the Sheriff') + (p.bot ? ' · house ' + esc(p.level) : '') + '</span></div>' +
        '<div class="facts"><span>' + A.icon('coin', 14, '#d9d2c0') + g.sh[p.side] + ' shillings</span>' +
        (p.side === 'robin' ? '<span>' + A.icon('man', 14, A.COL.robin) + W.countMen(g) + ' on the map · ' + g.avail.men + ' Available · ' + g.prison.n + ' in Prison</span><span>' + A.icon('camp', 14, '#2f7d3a') + W.countCamps(g) + ' Camps</span><span>Robin Hood: ' + (g.robinAt ? esc(nm(g.robinAt)) : 'Hidden') + '</span>'
          : '<span>' + A.icon('hench', 14, A.COL.sheriff) + W.countH(g) + ' Henchmen · ' + g.avail.h + ' Available</span><span>' + A.icon('cart', 14, '#c9a24c') + W.carsOnMap(g) + ' Carriages out · ' + g.avail.cars + ' Available</span>') + '</div></div>').join('');
      const T = g.trav;
      out += '<div class="card"><div class="title">The Travellers</div><div class="sub">' + T.deck + ' in the deck. Victims: ' + (T.victims.length ? esc(T.victims.map(W.tname).join(', ')) : 'none') + '. Discards: ' + (T.disc.length ? esc(T.disc.map(W.tname).join(', ')) : 'none') + '.' + (T.out.length ? ' Out of the game: ' + esc(T.out.map(W.tname).join(', ')) + '.' : '') + '</div></div>';
      out += '<div class="card"><div class="title">Carriages</div><div class="sub">Used this Ballad: ' + (g.used.length ? esc(g.used.map(k => D.CARRIAGES[k].name).join(', ')) : 'none') + '. Two each of Tallage, Tribute and Trap; a face-down one is anyone’s guess but the Sheriff’s.</div></div>';
      if (g.played.length) out += '<h2>Cards played</h2><div class="sub">' + esc(g.played.map(id => D.EVENTS[id].name).join(' · ')) + '</div>';
      return out;
    }
    function rulesHtml() {
      const M = D.MANIFEST;
      return '<div class="card"><div class="title">A card</div><ul class="rules">' +
        '<li>The card first rolls Carriages towards Nottingham (the number top left). Each that gets home gives the Sheriff shillings and the Royal Favour.</li>' +
        '<li>The first eligible player chooses: a <b>Single Plot</b> (one Plot, one space), the <b>Event</b> (your half of the card), or <b>Plots & Deeds</b> (a Plot in up to 3 spaces, then a Deed) — or passes. The second player chooses from the boxes left.</li>' +
        '<li>Whoever is on the leftmost box is first next card. Passing pays: Robin Hood 1 shilling, the Sheriff the coins on the box.</li></ul></div>' +
        '<div class="card"><div class="title">Robin Hood</div><ul class="rules"><li><b>Recruit</b> (1 a space, not Submissive): a Merry Man, or a Camp (+1 Justice); at a Camp 2 men or hide them all.</li><li><b>Sneak</b> (1 an origin): to adjacent spaces, Hidden — unless they crowd a Submissive space past 3.</li><li><b>Rob</b> (free): reveal robbers, roll; robbers + die must beat Defence + Henchmen. Green die (' + A.dieFaces('green') + ') in Forests and Revolting Parishes, white (' + A.dieFaces('white') + ') elsewhere.</li><li>Deeds: Turncoat, Donate, Swashbuckle, Inspire.</li></ul></div>' +
        '<div class="card"><div class="title">The Sheriff</div><ul class="rules"><li><b>Hire</b> (2 a space): Henchmen in, or a Revolting Parish you outnumber back to Submissive.</li><li><b>Patrol</b> (2 a destination): march in from next door, reveal a man per Henchman (per two in a Forest).</li><li><b>Capture</b> (free): a Revealed piece per Henchman (per two in a Revolting Parish): men to Prison, Robin Hood (+1 Order), Camps last (+1 Order).</li><li>Deeds: Ride, Confiscate, Disperse.</li></ul></div>' +
        '<div class="card"><div class="title">Winning</div><ul class="rules"><li>Every seven cards a Royal Inspection: the Submissive Parishes move the Royal Favour. At 5 or more on either side, that side wins.</li><li>After the third Ballad King Richard returns: whoever holds the Favour wins.</li></ul></div>' +
        '<div class="card"><div class="title">Rulings on this table</div><ul class="rules">' + M.decisions.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
        '<div class="card"><div class="sub">A Gest of Robin Hood is designed by Fred Serval and published by GMT Games. The map and card pictures are the host’s own copies from their VASSAL module; every line of text here is written fresh. Built to sit beside a copy of the game, not to replace one.</div></div>';
    }

    /* ================================================================
       Lobby and the end
       ================================================================ */
    function lobbyHtml() {
      const lv = P.pub.lobby || { seated: [], house: [] };
      const rows = lv.seated.map(p => '<div class="siteL"><b style="color:' + esc(p.hex) + '">' + esc(p.name) + '</b><span class="sub">' + esc(SIDE[p.side]) + ' · ' + (p.id === P.id ? 'you' : 'phone') + '</span></div>').join('') +
        lv.house.map(p => '<div class="siteL"><b style="color:' + esc(p.hex) + '">' + esc(p.name) + '</b><span class="sub">' + esc(SIDE[p.side]) + ' · house · ' + esc(p.level) + '</span></div>').join('') +
        (lv.watching || []).map(p => '<div class="siteL"><b>' + esc(p.name) + '</b><span class="sub">watching</span></div>').join('');
      let opts = '';
      if (isRemote()) {
        const seg = (key, list, cur) => '<div class="seg">' + list.map(([k, l]) => '<button class="' + (String(k) === String(cur) ? 'on' : '') + '" data-opt="' + key + '" data-v="' + esc(k) + '">' + esc(l) + '</button>').join('') + '</div>';
        opts = '<h2>' + (lv.seated.length > 1 ? 'The first phone plays' : 'You play') + '</h2>' + seg('side', [['robin', 'Robin Hood'], ['sheriff', 'The Sheriff']], lv.side) +
          (lv.house.length ? '<h2>How well the house plays</h2>' + seg('level', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], lv.level) : '') +
          '<h2>Pace</h2>' + seg('pace', [['slow', 'Slow'], ['relaxed', 'Relaxed'], ['brisk', 'Brisk']], lv.pace) +
          (P.solo ? '' : '<h2>Sound on the telly</h2>' + seg('sound', [['on', 'On'], ['off', 'Off']], lv.sound ? 'on' : 'off'));
        o.bar.innerHTML = '<button class="btn" id="go">' + (P.solo ? 'Begin' : 'Start the game') + '</button>';
        o.bar.classList.remove('hide');
      }
      return (o.lobbyTop ? o.lobbyTop() : '') + '<div class="card"><div class="title">A Gest of Robin Hood</div><div class="sub">Robin Hood and his Merry Men against the Sheriff of Nottingham: rob the rich, stir the Parishes, tax them, hunt the outlaws. Three Ballads; King Richard decides.</div>' + rows + '</div>' + opts +
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
          winSmall: 'the King’s favour', loseSmall: () => 'The King sided with the other.',
          lines: { title: 'King Richard returns', count: 'The Royal Favour', decider: 'The King’s judgement' } });
      }
      if (f && f.stage !== 'table') return block + (isRemote() ? '<button class="btn ghost" id="skipFin">Skip to the table</button>' : '');
      const pay = (P.pub.pay || []).find(p => mine() && p.name === mine().name);
      return block + (R ? '<div class="card"><div class="title">' + esc(R.name) + ' wins</div>' +
        '<div class="sub">' + esc(W.ENDS[R.how]) + ' The Royal Favour stands at ' + esc(W.fav(R.favour)) + '.</div>' + (pay && !P.solo ? '<div class="sub">Banked: ' + esc(pay.detail) + '</div>' : '') +
        A.favour(R.favour) + '</div>' : '') +
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
      on('#cardOpen', () => { P.cardOpen = !P.cardOpen; paint(); });
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
      on('#soloGo', () => { location.href = o.soloUrl; });
      on('[data-opt]', x => send({ t: 'opt', key: x.dataset.opt, value: x.dataset.v }));
      if (!Q) return;
      const n = Q.n;
      on('[data-turn]', x => {
        const id = x.dataset.turn;
        /* Pass throws the card away: a second tap to be sure (F). */
        if (id === 'pass' && x.dataset.armed !== '1') { x.dataset.armed = '1'; x.querySelector('b').textContent = 'Tap again to pass'; return; }
        act({ t: 'turn', n, id });
      });
      const choose = id => {
        if (Q.multi) {
          const i = P.multi.indexOf(id);
          if (i >= 0) P.multi.splice(i, 1);
          else if (P.multi.length < Q.max) P.multi.push(id);
          return paint();
        }
        act({ t: 'pick', n, id });
      };
      on('[data-pick]', x => choose(x.dataset.pick));
      /* A tap on the map picks the option for that space, if there is one. */
      scope.querySelectorAll('.rb-tap').forEach(x => { x.onclick = () => {
        if (locked()) return;
        const z = x.getAttribute('data-space');
        const opts = Q.options.filter(op => !op.bad && (op.space === z || op.id === z));
        if (opts.length === 1) choose(opts[0].id);
        else if (opts.length > 1) flash('More than one choice there — pick from the list.');
      }; });
      on('#pickGo', () => act({ t: 'pick', n, ids: P.multi.slice() }));
      on('#skip', () => act({ t: 'skip', n }));
    }

    return { receive, paint, flash, P, setMe(id, name, hex) { P.id = id; P.name = name || P.name; P.hex = hex || P.hex; paint(); } };
  }

  const STYLES = `
:root{--bg:#10140c;--panel:#1c2214;--panel2:#151a0f;--line:#3a4428;--ink:#f3eedc;--dim:#b4b08e;--gold:#e8c25a;--red:#d9452b;--good:#5fbf7a;--bad:#ff6b5a}
.tabs{display:flex;gap:6px;margin:4px 0 6px;position:sticky;top:44px;z-index:4;background:var(--bg);padding:4px 0}
.tab{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--dim);border-radius:10px;padding:8px;font-weight:800;font-size:14px}
.tab.on{background:var(--gold);border-color:var(--gold);color:#1b1408}
h2{margin:14px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);display:flex;align-items:center;gap:5px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:8px}
.card.mine{border-color:var(--gold)}
.title{font-weight:900;font-size:19px;color:var(--gold);letter-spacing:.02em}
.sub{color:var(--dim);font-size:13px;margin-top:3px}
.btn{display:block;width:100%;background:var(--gold);border:0;color:#1b1408;font-weight:900;font-size:17px;border-radius:14px;padding:14px;margin-top:10px}
.btn:disabled{opacity:.4}
.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--ink);font-weight:700;font-size:15px}
.btn.small{font-size:14px;padding:10px;margin-top:6px}
.opts{display:flex;flex-direction:column;gap:7px;margin-top:8px}
.opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:10px 11px;font-size:15px}
.opt:disabled{opacity:.45}
.opt.on{border-color:var(--gold);background:rgba(232,194,90,.15)}
.opt .lab{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.opt .lab small{color:var(--dim);font-size:12px;line-height:1.25}
.why{color:#ffab9a;font-size:12px}
.tick{width:22px;height:22px;border-radius:6px;border:2px solid var(--line);flex:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#1b1408}
.opt.on .tick{background:var(--gold);border-color:var(--gold)}
.boxes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}
.boxb{display:flex;flex-direction:column;align-items:flex-start;gap:3px;background:var(--panel2);border:1px solid var(--gold);color:var(--ink);border-radius:12px;padding:9px 8px;text-align:left;min-width:0}
.boxb b{font-size:15px;color:var(--gold)}
.boxb small{font-size:11px;color:var(--dim);line-height:1.2}
.boxb.bad{border-color:var(--line);opacity:.5}
.boxb.pass{grid-column:1 / -1;border-color:var(--line)}
.boxb.pass b{color:var(--ink)}
.zcard{margin:8px auto 0;font-size:14px;max-width:360px}
.zcard.mini{font-size:12.5px}
.topbar{position:sticky;top:88px;z-index:3;background:var(--bg);padding:2px 0 4px}
.tb-fav{font-size:11px}
.tb-card{display:flex;align-items:center;gap:7px;width:100%;margin-top:5px;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:7px 9px;color:var(--ink);text-align:left;font-size:14px}
.tb-card small{color:var(--dim);font-size:12px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tb-card b{white-space:nowrap}
.tbc-n{display:inline-flex;align-items:center;gap:2px;font-weight:900;color:#c9a24c}
.tbc-more{font-size:11px;color:var(--gold);border:1px solid var(--line);border-radius:7px;padding:1px 6px}
.tb-full{font-size:13px;margin-top:6px}
.note{font-size:12.5px;color:var(--dim);margin-top:8px}
.facts{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-size:13px;color:var(--ink)}
.facts span{display:inline-flex;align-items:center;gap:4px}
.camp{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:4px 10px 10px;margin-top:10px}
.secret{margin-top:8px;padding:8px 10px;border-radius:10px;border:1px dashed var(--gold);font-size:14px}
.cars{display:flex;flex-direction:column;gap:4px;font-size:13px}
.carL small{color:var(--dim)}
.minimap{margin-top:8px;border-radius:12px;overflow:hidden;border:1px solid var(--line);aspect-ratio:2062/2676}
.minimap.big{max-height:76vh;margin-left:auto;margin-right:auto}
.minimap.fit{aspect-ratio:auto;height:min(36vh,330px);background:#d8c79f}
.since{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:9px 11px;margin-top:6px;font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:4px}
.since .sh{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.since .sl.new{color:var(--ink)}
.since .sl.tl{color:var(--gold)}
.since .more{align-self:flex-start;background:transparent;border:1px solid var(--line);color:var(--dim);border-radius:9px;padding:4px 10px;font-size:12px}
.reel{margin-top:6px;padding:9px 11px;border-radius:12px;background:color-mix(in srgb,var(--h) 14%,transparent);border:1px solid var(--h);font-size:15px;animation:reelIn .5s ease-out}
@keyframes reelIn{from{opacity:.2;transform:translateY(-4px)}to{opacity:1;transform:none}}
.reel small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--h);font-weight:800}
.upnext{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(232,194,90,.14);border:1px solid var(--gold);color:var(--gold);font-weight:800}
.undo{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;background:var(--panel2);border:1px dashed var(--gold);color:var(--ink);border-radius:12px;padding:10px 12px;font-size:14px;text-align:left}
.undo b{color:var(--gold);flex:none}
.showcard{border-color:var(--red)}
.showcard .title{color:var(--ink)}
.strip{display:flex;gap:3px;margin:6px 0;flex-wrap:wrap}
.strip span{font-size:11px;padding:3px 6px;border-radius:7px;border:1px solid var(--line);color:var(--dim)}
.strip span.on{background:var(--gold);color:#1b1408;border-color:var(--gold);font-weight:800}
.robgrid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-top:8px;font-size:12.5px}
.robd{font-size:18px}
.robsum{font-size:14px;margin-top:8px}
.bres{margin-top:8px;font-weight:900;font-size:19px;text-align:center}
.bres.win{color:var(--good)}.bres.lose{color:var(--bad)}
.pcard{border:1px solid var(--line);border-left:4px solid var(--h);border-radius:12px;padding:8px 10px;margin-top:8px;background:var(--panel)}
.pc-h{display:flex;align-items:center;gap:6px}
.pc-h i{width:12px;height:12px;border-radius:50%;background:var(--h)}
.pc-h span{color:var(--dim);font-size:12px;margin-left:auto}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.seg button{flex:1;min-width:30%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:10px 6px;font-size:14px;font-weight:700}
.seg button.on{background:var(--gold);border-color:var(--gold);color:#1b1408}
.siteL{display:flex;align-items:center;gap:6px;font-size:14px;padding:6px 0;border-top:1px solid var(--line)}
.siteL b{flex:1}
ul.rules{margin:6px 0 0;padding-left:1.1em;font-size:14px;line-height:1.4}
.opencard .rc-h{font-weight:900;font-size:24px;color:var(--gold)}
.opencard .rc-sub{font-size:14px;margin-top:3px}
.opencard .rc-sc{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px}
.opencard .rc-p{display:flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:7px 10px;font-size:13px;flex-wrap:wrap}
.opencard .rc-p i{width:11px;height:11px;border-radius:50%;flex:none}
.opencard .rc-role{font-size:11px;color:var(--dim)}
.opencard .rc-t{flex-basis:100%;color:var(--dim)}
.opencard .rc-sec{margin-top:10px}
.opencard .rc-sec h4{margin:0 0 3px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.opencard .rc-sec ul{margin:0;padding-left:1.1em;font-size:13.5px}
`;
  const Phone = { VERSION, create, STYLES };
  root.RhPhone = Phone;
})(typeof window !== 'undefined' ? window : this);
