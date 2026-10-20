/* Catan — the handset. Every screen of the phone, with no networking.
 *
 * LESSONS-CHECKLIST F1: controller.html gives it the hub's socket; solo.html
 * gives it the in-page host (catan-host.js) — the same phone either way. It
 * paints from two messages: the table ('catan', the public view) and this
 * seat's own half ('catan-me'), and sends the bare orders back through
 * opts.send.
 *
 *   CatanPhone.create({ root, flashEl, send, solo, onMenu, onVp, lobbyTop })
 *     -> { receive(msg), setMe(id, name, hex), flash(text, tone), paint(), S }
 */
(function (root0) {
  'use strict';
  const STYLES = '\n:root{\n  --bg:#0a1322; --panel:#141d33; --panel2:#0f1728; --line:#26304d;\n  --ink:#f3efe4; --dim:#9aa7c4; --gold:#e8c267; --good:#4ac08a; --bad:#e5484d;\n}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\nhtml,body{margin:0;min-height:100%}\nbody{background:var(--bg);color:var(--ink);font:16px/1.4 ui-rounded,-apple-system,"Segoe UI",system-ui,sans-serif;\n  padding:env(safe-area-inset-top) 10px calc(18px + env(safe-area-inset-bottom))}\n.hide{display:none !important}\n[hidden]{display:none !important}\nheader{display:flex;align-items:center;gap:8px;padding:9px 2px 7px;position:sticky;top:0;background:var(--bg);z-index:6}\n#dot{width:12px;height:12px;border-radius:50%;background:var(--gold);flex:none}\n#who{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n#vpTop{font-size:13px;color:var(--gold);font-weight:800;white-space:nowrap}\n#link{margin-left:auto;font-size:11px;color:var(--dim);white-space:nowrap}\n#link.ok{color:var(--good)} #link.bad{color:var(--bad)}\nh2{margin:14px 2px 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);display:flex;align-items:center;gap:6px}\nh2 small{margin-left:auto;letter-spacing:0;text-transform:none;font-size:12px}\n.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px}\n.card.hot{border-color:var(--gold);box-shadow:0 0 0 1px rgba(232,194,103,.3)}\n.title{font-weight:800;font-size:19px;color:var(--gold)}\n.sub{color:var(--dim);font-size:13px;margin-top:3px}\nbutton{font:inherit;color:inherit}\n.btn{display:block;width:100%;background:var(--gold);border:0;color:#0b1020;font-weight:800;font-size:17px;border-radius:14px;padding:14px;margin-top:10px}\n.btn:disabled{opacity:.38}\n.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--dim);font-weight:600;font-size:15px}\n.btn.red{background:#e0584f;color:#fff}\n.btn.small{display:inline-block;width:auto;padding:9px 14px;font-size:14px;margin-top:0}\n.row2{display:flex;gap:8px}\n.row2 .btn{flex:1}\n\n/* ---------- cards in hand ---------- */\n.chip-card{display:inline-flex;align-items:center;gap:4px;background:var(--cc);color:var(--ci);border-radius:9px;padding:4px 8px;\n  font-weight:800;font-size:16px;line-height:1.1;box-shadow:inset 0 -2px 0 rgba(0,0,0,.25)}\n.chip-card.dim{opacity:.3}\n.hand{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}\n.hand.ck{grid-template-columns:repeat(4,1fr)}\n.hc{display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--hcc);color:var(--hci);border-radius:12px;padding:7px 2px 6px;\n  border:2px solid transparent;min-height:66px;justify-content:center;position:relative}\n.hc b{font-size:20px;line-height:1}\n.hc small{font-size:10px;opacity:.85;font-weight:700}\n.hc.zero{opacity:.28}\n.hc.sel{border-color:#fff;box-shadow:0 0 0 2px var(--gold)}\n.hc em{position:absolute;top:-7px;right:-4px;background:#fff;color:#0b1020;border-radius:999px;font-style:normal;font-weight:800;font-size:12px;padding:1px 7px}\n.handnote{color:var(--dim);font-size:12px;margin-top:6px}\n.handnote.warn{color:#ffb4a8}\n\n/* ---------- the island ---------- */\n.boardbox{margin-top:10px;border-radius:12px;overflow:auto;background:#0d2238;border:1px solid var(--line);touch-action:manipulation}\n.boardbox svg.island{display:block;width:100%;height:auto}\n.boardbox.zoom svg.island{width:175%}\n.boardbar{display:flex;gap:8px;align-items:center;margin-top:8px}\n.boardbar .sel{flex:1;font-size:13px;color:var(--dim)}\n.pk{cursor:pointer}\n\n/* ---------- menus and pickers ---------- */\n.tabs{display:flex;gap:4px;margin-top:10px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:3px}\n.tabs button{flex:1;background:transparent;border:0;color:var(--dim);font-weight:700;font-size:14px;padding:9px 2px;border-radius:9px}\n.tabs button.on{background:var(--gold);color:#0b1020}\n.acts{display:flex;flex-direction:column;gap:8px;margin-top:10px}\n.act{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px 11px}\n.act:disabled{opacity:.42}\n.act .lab{flex:1;min-width:0}\n.act .lab b{display:block;font-size:15px}\n.act .lab small{display:block;color:var(--dim);font-size:12px;line-height:1.25}\n.act .cost{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end}\n.act .cost .chip-card{font-size:12px;padding:2px 5px}\n.opts{display:flex;flex-direction:column;gap:8px;margin-top:10px}\n.opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:11px 12px;font-size:15px}\n.opt.on{border-color:var(--gold);background:rgba(232,194,103,.12)}\n.opt:disabled{opacity:.4}\n.opt i.dotc{width:12px;height:12px;border-radius:50%;flex:none}\n.opt .lab{flex:1;min-width:0}\n.opt .lab small{display:block;color:var(--dim);font-size:12px}\n.opt .val{font-weight:800;color:var(--gold)}\n.types{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}\n.types button{background:transparent;border:2px solid transparent;border-radius:12px;padding:1px}\n.types button.on{border-color:#fff;box-shadow:0 0 0 2px var(--gold)}\n.types button:disabled{opacity:.3}\n.types .chip-card{font-size:15px;padding:7px 10px}\n.tg{display:grid;grid-template-columns:auto 1fr 1fr;gap:6px 8px;align-items:center;margin-top:8px}\n.tg .th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);text-align:center}\n.tg .pm{display:flex;align-items:center;justify-content:space-between;gap:4px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:3px}\n.tg .pm.on{border-color:var(--gold)}\n.tg .pm b{min-width:1.4em;text-align:center;font-size:17px}\n.tg .pm button{width:34px;height:32px;border-radius:9px;border:1px solid var(--line);background:#1a2440;font-weight:800;font-size:18px;line-height:1}\n.tg .pm button:disabled{opacity:.3}\n.seg.names button{min-width:40%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.seg{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}\n.seg button{flex:1;min-width:60px;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:11px;padding:11px 8px;font-size:15px;font-weight:600}\n.seg button.on{background:var(--gold);border-color:var(--gold);color:#0b1020;font-weight:800}\n.seg button:disabled{opacity:.35}\n.dice{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}\n.dice button{background:transparent;border:2px solid transparent;border-radius:10px;padding:1px}\n.dice button.on{border-color:#fff}\n\n/* ---------- cards you hold ---------- */\n.pc{display:flex;gap:10px;align-items:flex-start;background:var(--panel2);border:1px solid var(--line);border-left:5px solid var(--dc);border-radius:12px;padding:10px 11px}\n.pc + .pc{margin-top:7px}\n.pc .lab{flex:1;min-width:0}\n.pc .lab b{display:block}\n.pc .lab small{display:block;color:var(--dim);font-size:12px;line-height:1.3}\n.pc .lab em{font-style:normal;color:var(--dim);font-size:11px}\n.pc.on{border-color:var(--gold)}\n\n/* ---------- offers ---------- */\n.offer{background:var(--panel2);border:1px solid #4a5f99;border-radius:12px;padding:10px 11px}\n.offer + .offer{margin-top:7px}\n.offer .line{display:flex;align-items:center;gap:6px;flex-wrap:wrap}\n.offer .rep{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:13px;color:var(--dim)}\n.offer .rep .y{color:#8ee6b4}.offer .rep .n{color:#ff8a80}\n\n/* ---------- something waiting on you: it comes to you ---------- */\n.modal{position:fixed;inset:0;z-index:15;background:rgba(4,8,16,.72);display:flex;align-items:flex-end;justify-content:center;\n  padding:12px 10px calc(14px + env(safe-area-inset-bottom))}\n.modal .sheet{width:100%;max-width:480px;max-height:100%;overflow:auto;background:var(--panel);border:1px solid var(--gold);border-radius:16px;padding:14px;\n  box-shadow:0 10px 40px rgba(0,0,0,.6)}\n.modal .sheet.fresh{animation:sheetUp .22s ease-out}\n@keyframes sheetUp{from{transform:translateY(24px);opacity:.4}to{transform:none;opacity:1}}\n.modal .deal{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:16px}\n.modal .deal>span:not(.chip-card){color:var(--dim);font-size:13px}\n.modal .held{margin-top:10px;font-size:13px;color:var(--dim);display:flex;gap:6px;align-items:center;flex-wrap:wrap}\n.modal .btn .chip-card{font-size:12px;padding:2px 5px;vertical-align:middle}\n/* what just happened to you: the robber, a card taken */\n.modal .sheet.bad{border-color:var(--bad)}\n.modal .sheet.bad .title{color:#ffb4a8}\n.modal .nl{margin-top:7px;font-size:15px;line-height:1.35}\n.modal .nl + .nl{margin-top:4px}\n.modal .lost{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding:9px 11px;border-radius:12px;background:rgba(229,72,77,.14);border:1px solid rgba(229,72,77,.55);color:#ffd9de;font-weight:800}\n.modal .nisle{margin-top:10px;border-radius:12px;overflow:hidden;background:#0d2238;border:1px solid var(--line)}\n.modal .nisle svg{display:block;width:100%;height:auto;max-height:40vh}\n\n/* ---------- the table ---------- */\n.rows{display:flex;flex-direction:column;gap:6px}\n.prow{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--dim)}\n.prow i{width:10px;height:10px;border-radius:50%;flex:none}\n.prow .nm{color:var(--ink);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.prow .me{color:var(--gold)}\n.prow span.x{display:inline-flex;align-items:center;gap:2px}\n.prow .vp{margin-left:auto;color:var(--gold);font-weight:800}\n.status{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.status .dice svg{width:30px;height:30px}\n#flash{position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));background:#2a1220;border:1px solid var(--bad);\n  color:#ffd9de;border-radius:12px;padding:11px 13px;font-size:14px;z-index:20}\n#flash.good{background:#12281e;border-color:var(--good);color:#d6ffe9}\n#name{display:flex;gap:8px;margin:10px 0}\n#name input{flex:1;font:inherit;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:12px;padding:12px}\n.glyph{vertical-align:-3px}\n\n/* ---------- solo: the table on the phone ---------- */\n.isle{margin:0 0 10px}\n.isle .boardbox{margin-top:0}\n.status .barbline{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:var(--dim)}\n.status .barbline b{font-size:15px}\n.reel{background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--rc);border-radius:12px;padding:9px 12px;margin:0 0 10px;font-size:16px;font-weight:700}\n.reel small{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-weight:600}\n.reel.fresh{animation:reelIn .5s ease-out}\n@keyframes reelIn{from{transform:translateY(-6px);opacity:.3}to{transform:none;opacity:1}}\n.btn.undo{display:block;margin:0 0 10px;width:100%}\n.card.attack .vs{display:flex;justify-content:space-around;margin:10px 0}\n.card.attack .vs div{display:flex;flex-direction:column;align-items:center}\n.card.attack .vs b{font:800 44px/1 Georgia,serif}\n.card.attack .vs small{color:var(--dim);font-size:12px}\n.card.attack .verdict{margin-top:10px;font-weight:800;font-size:17px}\n.card.attack .verdict.win{color:#8ee6b4}.card.attack .verdict.lose{color:#ff8a80}\n.card.log{font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:4px}\n.card.log .new{color:var(--ink)}\n.piece-ico,.ship-ico{vertical-align:middle}\n';

  function create(opts) {
    const D = root0.CatanData, A = root0.CatanArt, BoardLib = root0.CatanBoard;
    const $ = id => document.getElementById(id);
    const esc = A.esc;
    const root = opts.root, flashEl = opts.flashEl;


    /* Phones synthesise a click ~300ms after a touch. Everything is inert for this
       long after a send and after a new question lands, so the tap that answered
       one question cannot land on whatever is drawn under the finger next. */
    const LOCK_MS = 380;
    /* A pop-up nobody tapped for (an offer arriving, the knight reminder) holds
       a little longer: the thumb may already be on its way to something else. */
    const MODAL_LOCK_MS = 550;

    const S = {
      id: null, name: '', hex: '#e8c267', undo: null,
      pub: null, me: null,
      tab: 'build',            // the turn menu: build | trade | knights | improve
      pick: null,              // a board pick of our own making: {kind, options, what, knight, label}
      sel: null,               // what is picked on the board / in a list
      multi: {},               // cards chosen for a discard, a gift, a take
      list: [],                // progress cards chosen to put back
      draft: { give: {}, get: {}, to: null },
      bank: { give: null, get: null },
      arm: null,               // a card waiting for its second tap
      zoom: false,
      endAsk: false,           // End turn was tapped with a knight still lying down
      offerHide: {},           // pop-ups put off with "Later": they stay on the page
      modalKey: '',
      notices: [],             // what happened to you on somebody else's move, oldest first
      lockUntil: 0, shape: ''
    };
    if (opts.expose !== false) window.__CATANPHONE = S;
    const locked = () => Date.now() < S.lockUntil;
    const lock = ms => { S.lockUntil = Math.max(S.lockUntil, Date.now() + (ms || LOCK_MS)); };
    const buzz = ms => { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };

    /* ---------- what the host says ---------- */
    const send = m => opts.send(m);
    function receive(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'flash') { flash(msg.text, msg.tone); return; }
      if (msg.t === 'catan') {
        const was = S.pub && S.pub.game && S.pub.game.gid;
        S.pub = msg;
        if (!msg.game || msg.game.gid !== was) { S.me = null; S.undo = null; resetUi(); }
        /* An offer put to you buzzes once. */
        if (msg.game) {
          S.seenOffers = S.seenOffers || {};
          for (const o of msg.game.offers || []) {
            const toMe = o.by !== S.id && (o.counter ? msg.game.cur === S.id : (!o.to || o.to.indexOf(S.id) >= 0));
            if (toMe && !S.seenOffers[o.id + ':' + msg.game.gid]) { S.seenOffers[o.id + ':' + msg.game.gid] = true; buzz(60); }
            /* Your own offer turned down by everyone asked: say so, rather than
               leave it sitting there looking like it is still being thought about. */
            if (o.by === S.id && !o.counter) {
              const asked = o.to || msg.game.players.filter(p => p.id !== S.id).map(p => p.id);
              const key = 'no:' + msg.game.gid + ':' + o.id;
              if (asked.length && asked.every(id => o.replies[id] === false) && !S.seenOffers[key]) {
                S.seenOffers[key] = true;
                setTimeout(() => flash(asked.length > 1 ? 'Nobody wants that trade — withdraw it or try another.' : pname(asked[0]) + ' says no to that trade.'), 0);
              }
            }
          }
          /* "Since your last turn": the newest line when your turn last ended. */
          const cur = msg.game.cur;
          if (S.curSeen === S.id && cur !== S.id) S.endLine = (msg.crier && msg.crier[0] ? msg.crier[0].i : 0);
          if (S.curSeen !== S.id && cur === S.id) S.lastTurnLine = S.endLine || 0;
          S.curSeen = cur;
        }
        /* The reveal reaching the winner: a long buzz for whoever won. */
        const fst = msg.finale ? msg.finale.n + msg.finale.stage : '';
        if (fst !== S.finStage) {
          if (msg.finale && msg.finale.stage === 'winner' && msg.game && msg.game.result) {
            const r = msg.game.result.rows.find(x => x.id === S.id);
            buzz(r && r.won ? [200, 90, 200, 90, 500] : 120);
          }
          S.finStage = fst;
        }
        paint();
        return;
      }
      if (msg.t === 'catan-me') {
        S.me = msg.me;
        S.undo = msg.undo || null;
        S.notices = (msg.notices || []).filter(n => !(S.noticeDone && S.noticeDone[n.k]));
        paint();
      }
    }
    function setMe(id, name, hex) {
      S.id = id; S.name = name || S.name; S.hex = hex || S.hex;
      paint();
    }
    function resetUi() {
      S.pick = null; S.sel = null; S.multi = {}; S.list = []; S.arm = null; S.endAsk = false; S.offerHide = {};
      S.draft = { give: {}, get: {}, to: null }; S.bank = { give: null, get: null }; S.tab = 'build';
    }

    let flashTimer = null;
    function flash(text, tone) {
      clearTimeout(flashTimer);
      flashEl.textContent = text;
      flashEl.className = tone === 'good' ? 'good' : '';
      buzz(40);
      flashTimer = setTimeout(() => flashEl.classList.add('hide'), Math.max(2600, String(text).length * 45));
    }

    /* ---------- helpers ---------- */
    const game = () => S.pub && S.pub.game;
    const player = id => { const g = game(); return g ? g.players.find(p => p.id === id) : null; };
    const pname = id => { const p = player(id); return p ? p.name : '?'; };
    const mine = () => player(S.id);
    const isRemote = () => S.pub && S.pub.remote === S.id;
    const act = a => { if (locked()) return; lock(); send({ t: 'do', a }); };
    const types = () => (game() && game().ck ? D.RES.concat(D.COM) : D.RES.slice());
    const handTotal = h => Object.keys(h || {}).reduce((s, k) => s + (h[k] || 0), 0);
    const costChips = cost => A.cards(cost, 14);
    /* The question in front of this seat — if the table still agrees it is open.
       The public state and this seat's half are two messages, so there is always
       a moment holding one new and one old: never draw a question the table has
       already moved past. */
    function myPrompt() {
      const me = S.me, g = game();
      if (!me || !me.prompt || !g) return null;
      return g.prompts.some(p => p.n === me.prompt.n && p.seat === S.id) ? me.prompt : 'stale';
    }

    /* ================================================================
       Painting
       ================================================================ */
    function paint() {
      const pr = myPrompt();
      const shape = [S.pub && S.pub.screen, game() && game().gid, pr && pr !== 'stale' ? pr.t + pr.n : '-'].join('|');
      if (shape !== S.shape) {
        const was = S.shape.split('|')[2] || '';
        const promptChanged = was !== shape.split('|')[2];
        /* A new KIND of question starts at the top of the screen; the next step
           of the same turn stays where the thumb already is. */
        const kindChanged = was.replace(/\d+$/, '') !== shape.split('|')[2].replace(/\d+$/, '');
        S.shape = shape;
        if (promptChanged) { S.sel = null; S.multi = {}; S.list = []; S.arm = null; S.endAsk = false; if (!pr || pr === 'stale' || pr.t !== 'turn') S.pick = null; }
        if (kindChanged && pr && pr !== 'stale') { try { window.scrollTo(0, 0); } catch (e) {} }
        /* A new kind of question in your hand buzzes once — across a noisy
           table, that is how you notice it is your move. */
        if (kindChanged && pr && pr !== 'stale') buzz(70);
        lock();
      }
      const m = root;
      const g = game();
      const me = mine();
      /* A new turn starts with a clean trading desk. */
      if (g && g.turnNo !== S.turnSeen) { S.turnSeen = g.turnNo; S.bank = { give: null, get: null }; S.draft = { give: {}, get: {}, to: null }; }
      if (opts.onVp) opts.onVp(me && S.me ? S.me.vp + ' / ' + g.target + ' pts' : '');
      if (!S.pub) { m.innerHTML = waitCard(opts.solo ? 'Setting the table…' : 'Waiting for the telly', opts.solo ? '' : 'Catan has not been opened on the telly yet.'); return; }
      if (S.pub.screen === 'lobby') { m.innerHTML = lobbyHtml(); wire(); return; }
      if (S.pub.screen === 'over') { m.innerHTML = overHtml(); wire(); return; }
      if (!g) { m.innerHTML = waitCard('Hold tight', ''); return; }
      if (!me) {
        m.innerHTML = waitCard('Watching', 'The island was full when this game started. You are in for the next one.') + tableHtml();
        wire();
        return;
      }
      /* The table and this seat's own half are two messages: until the second
         lands there is no hand to draw. */
      if (!S.me) { m.innerHTML = statusHtml() + waitCard('Dealing you in…', '') + tableHtml(); wire(); return; }
      const attack = attackHtml();
      const picking = pr && pr !== 'stale' && (S.pick || /^(place|setupRoad|robber|freeRoad|pillage|bounce|metroCity|wallAt|invention|medicine|smith|merchant|diplomacy|intrigue|treasonGive|treasonPlace)$/.test(pr.t));
      m.innerHTML = statusHtml() + reelHtml() + (S.pub.paused ? waitCard('Paused', 'The house waits while your screen is off.') : '') + undoHtml() +
        (attack || ((picking ? '' : islandHtml()) + askHtml(pr))) + hurryHtml() + offersHtml() + handHtml(pr) + cardsHtml(pr) + tableHtml() + logHtml() +
        (attack ? noModal() : modalHtml(pr));
      wire();
    }

    /* ================================================================
       Something waiting on you comes to you: what somebody else's move did
       to you (the robber, a card taken — these hold the house until
       Continue), an offer put to you, a yes to your own offer, a knight left
       lying down as you end the turn. The offers and the knight are ALSO on
       the page, so "Later" only puts those pop-ups away.
       ================================================================ */
    function noModal() { S.modalKey = ''; return ''; }
    function modalHtml(pr) {
      let ask = noticeAsk();
      if (!ask && S.endAsk && pr && pr !== 'stale' && pr.t === 'turn' && knightNag()) ask = { key: 'end:' + pr.n, html: endAskHtml() };
      if (!ask) ask = offerAsk();
      if (!ask) return noModal();
      /* Repaints redraw it: only a pop-up seen for the first time slides in. */
      const fresh = ask.key !== S.modalKey;
      if (fresh) { S.modalKey = ask.key; lock(MODAL_LOCK_MS); }
      return '<div class="modal" id="modal" role="dialog" aria-modal="true"><div class="sheet' + (fresh ? ' fresh' : '') + (ask.bad ? ' bad' : '') + '">' + ask.html + '</div></div>';
    }
    const hasCards = (hand, set) => Object.keys(set).every(k => (hand[k] || 0) >= set[k]);
    function heldHtml() {
      const h = {};
      for (const k of types()) if (S.me.hand[k]) h[k] = S.me.hand[k];
      return '<div class="held">You hold ' + (Object.keys(h).length ? A.cards(h, 14) : 'no cards') + '</div>';
    }
    /* Somebody else's move took something from you, or moved the robber:
       said here, and the house waits for Continue. */
    function noticeAsk() {
      const g = game(), n = S.notices[0];
      if (!g || !n || !S.me) return null;
      let html = '<div class="title">' + esc(n.title) + '</div>' +
        (n.lines || []).map(l => '<div class="nl">' + esc(l) + '</div>').join('');
      if (n.lose) html += '<div class="lost">' + (n.robbed ? 'Robbed! ' : '') + 'You lose ' + A.cards(n.lose, 18) + '</div>';
      else if (n.loseProg) html += '<div class="lost">You lose ' + esc(D.progName(n.loseProg)) + '</div>';
      else if (n.robbed) html += '<div class="lost">Robbed! You lose a card.</div>';
      if (n.hex != null) html += '<div class="nisle">' + A.board(g, { mode: 'phone', marks: { hexes: [n.hex] } }) + '</div>';
      if (n.lose || n.robbed) html += heldHtml();
      html += '<button class="btn" id="noticeGo" data-k="' + n.k + '">Continue</button>';
      return { key: 'nt:' + n.k, html, bad: n.kind !== 'seven' };
    }
    function offerAsk() {
      const g = game(), me = S.me;
      if (!g || !me || !tradeOpen()) return null;
      const later = key => '<button class="btn ghost" data-hide="' + esc(key) + '">Later — it stays under Trades</button>';
      for (const o of g.offers) {
        if (!o.counter && o.by !== S.id) {
          /* Somebody's offer to you, not yet answered. */
          if ((o.to && o.to.indexOf(S.id) < 0) || o.replies[S.id] !== undefined) continue;
          const key = 'in:' + g.gid + ':' + o.id;
          if (S.offerHide[key]) continue;
          const have = hasCards(me.hand, o.get);
          return { key, html: '<div class="title">' + esc(pname(o.by)) + ' offers you a trade</div>' +
            '<div class="deal"><span>you get</span>' + A.cards(o.give, 18) + '<span>for your</span>' + A.cards(o.get, 18) + '</div>' + heldHtml() +
            '<div class="row2"><button class="btn" data-do=\'' + JSON.stringify({ t: 'reply', offer: o.id, yes: true }) + '\'' + (have ? '' : ' disabled') + '>' + (have ? 'Accept' : 'You do not have that') + '</button>' +
            '<button class="btn ghost" data-do=\'' + JSON.stringify({ t: 'reply', offer: o.id, yes: false }) + '\'>No thanks</button></div>' + later(key) };
        }
        if (o.counter && g.cur === S.id) {
          /* A counter-offer to you, on your own turn. */
          const key = 'ctr:' + g.gid + ':' + o.id;
          if (S.offerHide[key]) continue;
          const have = hasCards(me.hand, o.get);
          return { key, html: '<div class="title">' + esc(pname(o.by)) + ' offers you a trade</div>' +
            '<div class="deal"><span>you get</span>' + A.cards(o.give, 18) + '<span>for your</span>' + A.cards(o.get, 18) + '</div>' + heldHtml() +
            '<button class="btn" data-do=\'' + JSON.stringify({ t: 'deal', offer: o.id }) + '\'' + (have ? '' : ' disabled') + '>' + (have ? 'Accept the trade' : 'You do not have that') + '</button>' +
            '<button class="btn ghost" data-hide="' + esc(key) + '">Not now</button>' };
        }
        if (!o.counter && o.by === S.id) {
          /* A yes to your own offer: the deal is yours to close. */
          const asked = o.to || g.players.filter(p => p.id !== S.id).map(p => p.id);
          for (const id of asked) {
            const key = 'yes:' + g.gid + ':' + o.id + ':' + id;
            if (o.replies[id] !== true || S.offerHide[key]) continue;
            const waiting = asked.filter(x => o.replies[x] === undefined).length;
            return { key, html: '<div class="title">' + esc(pname(id)) + ' accepts your offer</div>' +
              '<div class="deal"><span>you give</span>' + A.cards(o.give, 18) + '<span>for</span>' + A.cards(o.get, 18) + '</div>' +
              '<button class="btn" data-do=\'' + JSON.stringify({ t: 'deal', offer: o.id, with: id }) + '\'>Deal with ' + esc(pname(id)) + '</button>' +
              '<button class="btn ghost" data-hide="' + esc(key) + '">' + (waiting ? 'Wait — ' + waiting + ' still to answer' : 'Not yet') + '</button>' };
          }
        }
      }
      return null;
    }
    /* Cities & Knights: an inactive knight and a wheat to wake it with. */
    function knightNag() {
      const g = game(), can = S.me && S.me.can;
      return !!(g && g.ck && can && can.stage === 'main' && can.activate && can.activate.length && can.afford && can.afford.activate);
    }
    function endAskHtml() {
      const g = game(), p = mine(), can = S.me.can;
      const ks = g.knights.filter(k => k.owner === S.id && can.activate.indexOf(k.id) >= 0);
      const wheat = S.me.hand.wheat || 0;
      const def = g.players.reduce((s, x) => s + x.strength, 0);
      const left = g.barbTrack - g.barb;
      return '<div class="title">Wake your knight?</div>' +
        '<div class="sub">You have ' + (ks.length === 1 ? 'a knight' : ks.length + ' knights') + ' lying down and ' + wheat + ' wheat. Only active knights fight the barbarians — ' +
        (left > 0 ? left + ' more ship' + (left === 1 ? '' : 's') + ' and they land' : 'they land next ship') + ' (cities ' + g.barbStrength + ' against knights ' + def + ').</div>' +
        ks.map(k => '<button class="btn" data-knight="activate:' + k.id + '">Activate your ' + esc(D.KNIGHT_NAME[k.level]) + ' knight ' + costChips(D.COST.activate) + '</button>').join('') +
        '<div class="row2"><button class="btn ghost" id="endBack">Back to my turn</button><button class="btn ghost" id="endAnyway">End my turn anyway</button></div>';
    }

    function waitCard(title, sub) {
      return '<div class="card"><div class="title">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
    }

    function lobbyHtml() {
      const lv = S.pub.lobby || { seated: [], house: [], size: 0 };
      const rows = lv.seated.map(p => '<div class="prow"><i style="background:' + esc(p.hex) + '"></i><span class="nm">' + esc(p.name) + '</span><span class="vp">' + (p.id === S.id ? 'you' : 'phone') + '</span></div>').join('') +
        lv.house.map(p => '<div class="prow"><i style="background:' + esc(p.hex) + '"></i><span class="nm">' + esc(p.name) + '</span><span class="vp" style="color:var(--dim)">house</span></div>').join('');
      let optHtml = '';
      if (isRemote()) {
        const seg = (key, choices, cur) => '<div class="seg">' + choices.map(c => '<button class="' + (String(c[0]) === String(cur) ? 'on' : '') + '" data-opt="' + key + '" data-v="' + c[0] + '"' + (c[2] ? ' disabled' : '') + '>' + c[1] + '</button>').join('') + '</div>';
        optHtml = '<h2>The game</h2>' + seg('ck', [[0, 'Catan'], [1, 'Cities &amp; Knights']], lv.ck ? 1 : 0) +
          '<h2>Settlers</h2>' + seg('table', [[3, '3', 3 < lv.minSize], [4, '4']], lv.size) +
          '<h2>Points to win</h2>' + seg('vp', (lv.vpChoices || []).map(v => [v, String(v)]), lv.vp) +
          '<h2>House pace</h2>' + seg('pace', [['relaxed', 'relaxed'], ['brisk', 'brisk']], lv.pace) +
          '<button class="btn" id="go">Settle the island</button>';
      }
      return (opts.lobbyTop ? opts.lobbyTop() : '') + '<div class="card"><div class="title">Catan' + (lv.ck ? ': Cities &amp; Knights' : '') + '</div>' +
        '<div class="sub">Build, trade and race to ' + (lv.vp || 10) + ' points. ' + (opts.solo ? 'You against the house: the island, the dice and every card are on this phone.' : 'Your cards stay on this phone; the island is on the telly.') + '</div>' +
        '<div class="rows" style="margin-top:10px">' + rows + '</div></div>' + optHtml +
        (isRemote() ? '' : '<div class="sub" style="margin-top:12px">' + esc(pname(S.pub.remote) !== '?' ? pname(S.pub.remote) : 'The first phone') + ' starts the game.</div>') +
        (opts.solo ? '' : (opts.soloUrl ? '<a class="btn ghost" id="soloLink" href="' + esc(opts.soloUrl) + '" style="text-align:center;text-decoration:none">Play alone on this phone — the telly stays free</a>' : '') +
          '<button class="btn ghost" id="menu">Games menu</button>');
    }

    function overHtml() {
      /* The reveal on the telly first: this phone follows its stage, and is
         handed the result only once the winner is out (shared/finale.js). */
      const f = S.pub.finale;
      const told = !f || f.stage === 'winner' || f.stage === 'table';
      const g0 = game();
      const rows = told && g0 && g0.result ? g0.result.rows.map(r => ({ id: r.id, name: r.name, hex: r.hex, total: r.vp, place: r.place, won: r.won })) : null;
      const block = f && window.HubFinale ? HubFinale.phoneHtml(f, { meId: S.id, rows, esc, lines: { title: 'The island is settled' } }) : '';
      if (f && f.stage !== 'table') return block + (isRemote() ? '<button class="btn ghost" id="skipFin">Skip to the table</button>' : '');
      return block + overSheet() + tableHtml();
    }
    function overSheet() {
      const g = game();
      const R = g && g.result;
      const pay = (S.pub.pay || []).find(p => p.name === S.name);
      const row = R && R.rows.find(r => r.id === S.id);
      const w = R ? R.rows[0] : null;
      /* Under the reveal's own block the headline is already said. */
      const head = S.pub.finale ? '' : '<div class="title">' + (w ? (w.id === S.id ? 'You settled Catan!' : esc(w.name) + ' wins') : 'The game is over') + '</div>';
      return '<div class="card' + (S.pub.finale ? '' : ' hot') + '" style="margin-top:10px">' + head +
        '<div class="sub">' + (row ? row.vp + ' points' + (row.vpDev ? ' (' + row.vpDev + ' from hidden cards)' : '') : '') + (pay ? ' · ' + esc(pay.detail) : '') + '</div></div>' +
        (isRemote() ? '<button class="btn" id="again">Play again</button>' : '') +
        (opts.solo ? '' : '<button class="btn ghost" id="menu">Games menu</button>');
    }

    function statusHtml() {
      const g = game();
      const cur = player(g.cur);
      const d = g.dice;
      const dice = d ? '<span class="dice">' + A.die(d.y, 'y', 30) + A.die(d.r, 'r', 30) + (d.e ? A.die(d.e, 'e', 30) : '') + '</span><b>' + d.sum + '</b>' : '';
      const turn = g.phase === 'setup' ? 'Setting up' : (cur ? (cur.id === S.id ? 'Your turn' : esc(cur.name) + '’s turn') : '');
      const barb = g.ck ? ' · <span title="barbarians">' + A.glyph('ship', 16) + ' ' + g.barb + '/' + g.barbTrack + '</span>' : '';
      return '<div class="status" style="margin:2px 2px 10px"><b style="color:' + (cur && cur.id === S.id ? 'var(--gold)' : 'var(--ink)') + '">' + turn + '</b>' + dice + barb + '</div>';
    }

    /* Only the remote holder is offered this, and only for somebody else. */
    function hurryHtml() {
      const h = S.pub && S.pub.hurry;
      if (!h || !isRemote()) return '';
      const others = h.ids.filter(id => id !== S.id);
      if (!others.length) return '';
      return '<button class="btn ghost" id="hurry">Play the house’s move for ' + esc(others.map(pname).join(' and ')) + '</button>';
    }

    /* ================================================================
       The question in front of you
       ================================================================ */
    function askHtml(pr) {
      const g = game();
      if (pr === 'stale') return waitCard('Hold on', 'The table is moving on.');
      if (!pr) return idleHtml();
      switch (pr.t) {
        case 'place': return pickHtml('Place your ' + (pr.second ? 'second ' : 'first ') + pr.kind, pr.why, 'corner', pr.options, 'Place the ' + pr.kind + ' here', a => ({ t: 'place', at: a }));
        case 'setupRoad': return pickHtml('A road off it', 'Pick one of the paths leaving your ' + (g.ck && g.phase === 'setup' ? 'building' : 'settlement') + '.', 'edge', pr.options, 'Lay the road here', a => ({ t: 'road', at: a }));
        case 'turn': return pr.stage === 'roll' ? rollHtml() : turnHtml();
        case 'discard': case 'weddingGive': return chooseCardsHtml(pr, S.me.hand, pr.t === 'weddingGive' ? 'Give ' + pr.need + ' to ' + pname(pr.to) : 'Throw back ' + pr.need,
          pr.why, pr.t === 'weddingGive' ? 'Give them' : 'Discard');
        case 'robber': return pickHtml(pr.mode === 'each' ? 'Taxation' : 'Move the robber', pr.why, 'hex', pr.options, 'Move the robber here', a => ({ t: 'robber', hex: a }));
        case 'steal': return listHtml('Whom do you rob?', 'A random card from their hand.', pr.options.map((id, k) => ({ v: id, label: pname(id), note: (pr.counts ? pr.counts[k] : '?') + ' cards', hex: (player(id) || {}).hex })), v => ({ t: 'steal', from: v }));
        case 'freeRoad': return pickHtml(pr.left > 1 ? 'Two free roads' : 'One free road', pr.why, 'edge', pr.options, 'Lay the road here', a => ({ t: 'road', at: a }), '<button class="btn ghost" data-do=\'{"t":"skip"}\'>Stop — no more roads</button>');
        case 'plenty': return plentyHtml(pr);
        case 'monopoly': return typeHtml('Monopoly', 'Every other player hands you all of the resource you name.', pr.options, v => ({ t: 'pick', res: v }));
        case 'aqueduct': return typeHtml('The Aqueduct', pr.why, D.RES.filter(k => g.bank[k] > 0), v => ({ t: 'pick', res: v }));
        case 'defDeck': return listHtml('Draw a progress card', pr.why, pr.options.map(t => ({ v: t, label: D.TRACK[t].name, note: g.decks[t] + ' left', hex: D.TRACK[t].hex })), v => ({ t: 'deck', deck: v }));
        case 'progDiscard': return progDiscardHtml(pr);
        case 'pillage': return pickHtml('The barbarians pillage', pr.why, 'corner', pr.options, 'This city falls', a => ({ t: 'x', at: a }));
        case 'bounce': return pickHtml('Your knight was displaced', pr.why, 'corner', pr.options, 'Move it here', a => ({ t: 'x', at: a }));
        case 'metroCity': return pickHtml('The ' + D.TRACK[pr.track].name + ' metropolis', pr.why, 'corner', pr.options, 'Crown this city', a => ({ t: 'x', at: a }));
        case 'alchemy': return alchemyHtml(pr);
        case 'crane': return listHtml('Crane', pr.why, pr.options.map(t => ({ v: t, label: D.TRACK[t].name + ': ' + D.TRACK[t].levels[S.me && mine() ? mine().impr[t] + 1 : 1], note: 'one ' + D.cardName(D.TRACK[t].com).toLowerCase() + ' less', hex: D.TRACK[t].hex })), v => ({ t: 'track', track: v }));
        case 'wallAt': return pickHtml('Engineering', pr.why, 'corner', pr.options, 'Wall this city', a => ({ t: 'x', at: a }));
        case 'invention': return pickHtml('Invention', pr.why + ' Pick two.', 'hex', pr.options, 'Swap these two', sel => ({ t: 'swap', a: sel[0], b: sel[1] }), '', 2);
        case 'medicine': return pickHtml('Medicine', pr.why, 'corner', pr.options, 'Make it a city', a => ({ t: 'x', at: a }));
        case 'smith': return pickHtml('Smithing', pr.why, 'knight', pr.options, 'Promote this knight', a => ({ t: 'knight', knight: a }), '<button class="btn ghost" data-do=\'{"t":"skip"}\'>That is enough</button>');
        case 'harborOffer': return typeHtml('Commercial Harbor', pr.why, pr.options, v => ({ t: 'give', res: v }), '<button class="btn ghost" data-do=\'{"t":"skip"}\'>Skip ' + esc(pname(pr.to)) + '</button>');
        case 'harborReply': return typeHtml('Commercial Harbor', pr.why, pr.options, v => ({ t: 'give', com: v }));
        case 'duesWho': case 'spyWho': case 'treasonWho': {
          const title = pr.t === 'duesWho' ? 'Guild Dues' : pr.t === 'spyWho' ? 'Espionage' : 'Treason';
          return listHtml(title, pr.why, pr.options.map(id => { const p = player(id); return { v: id, label: p.name, note: p.vp + ' pts · ' + (pr.t === 'spyWho' ? p.prog + ' progress cards' : pr.t === 'treasonWho' ? g.knights.filter(k => k.owner === id).length + ' knights' : p.cards + ' cards'), hex: p.hex }; }), v => ({ t: 'who', who: v }));
        }
        case 'duesTake': return chooseCardsHtml(pr, pr.hand, 'Take ' + pr.need + ' from ' + pname(pr.from), 'Their whole hand, for your eyes only.', 'Take them');
        case 'spyTake': return spyHtml(pr);
        case 'merchant': return pickHtml('The merchant', pr.why, 'hex', pr.options, 'Stand him here', a => ({ t: 'hex', hex: a }));
        case 'fleet': return typeHtml('Merchant Fleet', pr.why, pr.options, v => ({ t: 'pick', type: v }));
        case 'resmono': case 'trademono': return typeHtml(pr.t === 'resmono' ? 'Resource Monopoly' : 'Trade Monopoly', pr.why, pr.options, v => ({ t: 'pick', type: v }));
        case 'diplomacy': return pickHtml('Diplomacy', pr.why, 'edge', pr.options, 'Lift this road', a => ({ t: 'road', at: a }));
        case 'intrigue': return pickHtml('Intrigue', pr.why, 'knight', pr.options, 'Displace this knight', a => ({ t: 'knight', knight: a }));
        case 'treasonGive': return pickHtml('Treason', pr.why, 'knight', pr.options, 'This one leaves', a => ({ t: 'knight', knight: a }));
        case 'treasonPlace': return treasonPlaceHtml(pr);
      }
      return waitCard('Your move', pr.why || '');
    }

    /* Nothing asked of you: whose turn it is, and — if the trading is open — the
       offer on the table and a way to put your own to them. */
    function idleHtml() {
      const g = game();
      const cur = player(g.cur);
      const asked = g.prompts.filter(p => p.seat !== S.id);
      const what = asked.length ? asked.map(p => pname(p.seat) + ' ' + promptWords(p)).join(' · ') : '';
      let html = waitCard(g.phase === 'setup' ? (cur ? cur.name + ' is placing' : 'Setting up') : (cur ? cur.name + '’s turn' : 'Waiting'), what);
      if (tradeOpen() && g.cur !== S.id) html += counterHtml();
      return html;
    }
    function promptWords(pr) {
      switch (pr.t) {
        case 'turn': return pr.stage === 'roll' ? 'is about to roll' : 'is trading and building';
        case 'place': return 'is placing a ' + (pr.kind || 'settlement');
        case 'setupRoad': return 'is placing a road';
        case 'discard': return 'is discarding ' + pr.need;
        case 'robber': return 'is moving the robber';
        case 'steal': return 'is choosing whom to rob';
        case 'pillage': return 'is choosing a city to lose';
      }
      return pr.card ? 'is playing ' + D.progName(pr.card) : 'is deciding';
    }
    function tradeOpen() {
      const g = game();
      return g && g.phase === 'play' && g.stage === 'main' && g.prompts.length === 1 && g.prompts[0].t === 'turn' && g.prompts[0].seat === g.cur;
    }

    /* ---------- the roll ---------- */
    function rollHtml() {
      const can = S.me.can || {};
      const pre = Object.keys(can.play || {}).filter(k => can.play[k] === null);
      return '<div class="card hot"><div class="title">Your turn</div><div class="sub">Roll for production' +
        (pre.length ? ' — or play ' + pre.map(k => cardName(k)).join(' / ') + ' first (below).' : '.') + '</div>' +
        '<button class="btn" data-do=\'{"t":"roll"}\' id="roll">Roll the dice</button></div>';
    }

    /* ---------- the turn menu ---------- */
    function turnHtml() {
      const g = game(), can = S.me.can;
      if (S.pick) return ownPickHtml();
      const tabs = [['build', 'Build'], ['trade', 'Trade']];
      if (g.ck) tabs.push(['knights', 'Knights'], ['improve', 'Improve']);
      if (!tabs.some(t => t[0] === S.tab)) S.tab = 'build';
      let body = '';
      if (S.tab === 'build') body = buildHtml(can);
      else if (S.tab === 'trade') body = tradeHtml(can);
      else if (S.tab === 'knights') body = knightsHtml(can);
      else if (S.tab === 'improve') body = improveHtml(can);
      return '<div class="card hot"><div class="title">Your turn</div>' +
        '<div class="tabs">' + tabs.map(t => '<button data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>' +
        /* Your own offer and anything put to you sit right here, whatever tab is
           open — the answers are what you are waiting for. */
        (offerCards().length ? '<div style="margin-top:10px">' + offerCards().join('') + '</div>' : '') +
        body + '<button class="btn red" id="end">End your turn</button></div>';
    }
    function buildHtml(can) {
      const g = game(), p = mine();
      const row = (what, label, note, cost, spots, afford, disabledWhy) => {
        const ok = afford && spots && !disabledWhy;
        const why = disabledWhy || (!spots ? 'nowhere to put one' : (!afford ? 'not enough cards' : note));
        return '<button class="act" data-build="' + what + '"' + (ok ? '' : ' disabled') + '>' + A.piece(what === 'dev' ? 'settlement' : what, p.hex, 26) +
          '<span class="lab"><b>' + label + '</b><small>' + esc(why) + '</small></span><span class="cost">' + costChips(cost) + '</span></button>';
      };
      let html = '<div class="acts">';
      html += row('road', 'Road', can.road.length + ' paths open · ' + p.pieces.road + ' left', D.COST.road, can.road.length, can.afford.road, p.pieces.road ? null : 'all fifteen are out');
      html += row('settlement', 'Settlement', can.settlement.length + ' spots · ' + p.pieces.settlement + ' left', D.COST.settlement, can.settlement.length, can.afford.settlement, p.pieces.settlement ? null : 'all five are out — upgrade one first');
      html += row('city', 'City', can.city.length + ' settlements to upgrade · ' + p.pieces.city + ' left', D.COST.city, can.city.length, can.afford.city, null);
      if (g.ck) {
        html += row('wall', 'City wall', 'keep two more cards on a 7 · ' + p.pieces.wall + ' left', D.COST.wall, can.wall.length, can.afford.wall, null);
        html += row('knight', 'Basic knight', 'stands inactive on your roads · ' + p.kn[1] + ' left', D.COST.knight, can.knight.length, can.afford.knight, p.kn[1] ? null : 'both basic knights are out — promote one');
      } else {
        const ok = can.buy && can.afford.dev;
        html += '<button class="act" data-build="dev"' + (ok ? '' : ' disabled') + '>' + A.glyph('dev', 26, '#b9a5e8') +
          '<span class="lab"><b>Development card</b><small>' + (can.buy ? g.devLeft + ' left in the deck' : 'the deck is empty') + '</small></span><span class="cost">' + costChips(D.COST.dev) + '</span></button>';
      }
      return html + '</div>';
    }

    /* A board pick started from the turn menu: build here, move there. */
    function startPick(what) {
      const can = S.me.can;
      const labels = { road: ['edge', 'Build a road here'], settlement: ['corner', 'Build a settlement here'], city: ['corner', 'Make this a city'], wall: ['corner', 'Wall this city'], knight: ['corner', 'Recruit a knight here'] };
      if (what === 'dev') { act({ t: 'buy' }); return; }
      const L = labels[what];
      S.pick = { kind: L[0], options: can[what], what, label: L[1] };
      S.sel = null;
      paint();
    }
    function ownPickHtml() {
      const pk = S.pick;
      const titles = { road: 'Build a road', settlement: 'Build a settlement', city: 'Build a city', wall: 'Build a city wall', knight: 'Recruit a knight',
        kmove: 'Move your knight', displace: 'Displace a knight', chooseKnight: pk.title || 'Which knight?' };
      return '<div class="card hot"><div class="title">' + esc(titles[pk.what] || 'Pick') + '</div><div class="sub">' + esc(pk.sub || 'Tap a highlighted spot, then confirm.') + '</div>' +
        boardHtml(pk.kind, pk.options, S.sel) +
        '<div class="row2"><button class="btn ghost" id="cancelPick">Back</button><button class="btn" id="confirmPick"' + (S.sel == null ? ' disabled' : '') + '>' + esc(pk.label) + '</button></div></div>';
    }
    function boardHtml(kind, options, sel) {
      const g = game();
      return '<div class="boardbox' + (S.zoom ? ' zoom' : '') + '" id="bb">' + A.board(g, { mode: 'phone', pick: { kind, options, sel }, hot: null }) + '</div>' +
        '<div class="boardbar"><span class="sel">' + (options.length ? options.length + ' to choose from' : 'nothing to choose') + '</span>' +
        '<button class="btn ghost small" id="zoom">' + (S.zoom ? 'Fit the board' : 'Zoom in') + '</button></div>';
    }
    /* A board pick for a question: the confirm button answers it. */
    function pickHtml(title, sub, kind, options, label, answer, extra, many) {
      const sel = many ? (Array.isArray(S.sel) ? S.sel : []) : S.sel;
      const ready = many ? sel.length === many : sel != null;
      S.answerPick = () => (ready ? answer(sel) : null);
      S.pickMany = many || 0;
      S.pickKind = kind; S.pickOptions = options;
      return '<div class="card hot"><div class="title">' + esc(title) + '</div><div class="sub">' + esc(sub || '') + '</div>' +
        boardHtml(kind, options, sel) +
        '<button class="btn" id="answerPick"' + (ready ? '' : ' disabled') + '>' + esc(label) + '</button>' + (extra || '') + '</div>';
    }
    function listHtml(title, sub, items, answer) {
      S.answerList = answer;
      return '<div class="card hot"><div class="title">' + esc(title) + '</div><div class="sub">' + esc(sub || '') + '</div><div class="opts">' +
        items.map((it, k) => '<button class="opt" data-li="' + k + '" data-v="' + esc(it.v) + '"><i class="dotc" style="background:' + esc(it.hex || '#888') + '"></i>' +
          '<span class="lab"><b>' + esc(it.label) + '</b>' + (it.note ? '<small>' + esc(it.note) + '</small>' : '') + '</span></button>').join('') + '</div></div>';
    }
    function typeHtml(title, sub, list, answer, extra) {
      S.answerType = answer;
      return '<div class="card hot"><div class="title">' + esc(title) + '</div><div class="sub">' + esc(sub || '') + '</div>' +
        '<div class="types">' + list.map(k => '<button data-type="' + k + '">' + A.chip(k, null, 22) + '</button>').join('') + '</div>' + (extra || '') + '</div>';
    }

    /* ---------- choosing cards: a discard, a gift, a take ---------- */
    function chooseCardsHtml(pr, from, title, sub, label) {
      const picked = handTotal(S.multi);
      const ks = types().filter(k => (from[k] || 0) > 0);
      const tiles = ks.map(k => {
        const c = D.CARD[k];
        const n = S.multi[k] || 0;
        return '<button class="hc' + (n ? ' sel' : '') + '" data-add="' + k + '" style="--hcc:' + c.hex + ';--hci:' + c.ink + '">' + A.glyph(k, 22, c.ink) +
          '<b>' + ((from[k] || 0) - n) + '</b><small>' + esc(c.name) + '</small>' + (n ? '<em>' + n + '</em>' : '') + '</button>';
      }).join('');
      const back = Object.keys(S.multi).filter(k => S.multi[k] > 0).map(k => '<button data-sub="' + k + '">' + A.chip(k, S.multi[k], 18) + '</button>').join('');
      S.chooseFrom = from; S.chooseNeed = pr.need;
      S.answerCards = () => (pr.t === 'duesTake' ? { t: 'take', cards: Object.assign({}, S.multi) } : pr.t === 'weddingGive' ? { t: 'give', cards: Object.assign({}, S.multi) } : { t: 'discard', cards: Object.assign({}, S.multi) });
      return '<div class="card hot"><div class="title">' + esc(title) + '</div><div class="sub">' + esc(sub || '') + '</div>' +
        '<div class="hand' + (game().ck ? ' ck' : '') + '" style="margin-top:10px">' + tiles + '</div>' +
        '<div class="types" style="min-height:34px">' + (back || '<span class="sub">Tap cards above to choose them; tap here to put one back.</span>') + '</div>' +
        '<button class="btn" id="answerCards"' + (picked === pr.need ? '' : ' disabled') + '>' + esc(label) + ' (' + picked + ' of ' + pr.need + ')</button></div>';
    }
    function plentyHtml(pr) {
      const picks = Array.isArray(S.sel) ? S.sel : [];
      S.answerPlenty = () => ({ t: 'pick', res: picks.slice() });
      return '<div class="card hot"><div class="title">Year of Plenty</div><div class="sub">Any two resources from the bank — the same one twice if you like.</div>' +
        '<div class="types">' + pr.options.map(k => '<button data-plenty="' + k + '">' + A.chip(k, null, 22) + '</button>').join('') + '</div>' +
        '<div class="types" style="min-height:34px">' + picks.map((k, i) => '<button data-unplenty="' + i + '">' + A.chip(k, null, 20) + '</button>').join('') + '</div>' +
        '<button class="btn" id="answerPlenty"' + (picks.length === 2 ? '' : ' disabled') + '>Take them</button></div>';
    }
    function alchemyHtml(pr) {
      const sel = S.sel && typeof S.sel === 'object' ? S.sel : { y: 0, r: 0 };
      const row = kind => '<div class="dice">' + [1, 2, 3, 4, 5, 6].map(v => '<button data-die="' + kind + v + '" class="' + (sel[kind] === v ? 'on' : '') + '">' + A.die(v, kind, 40) + '</button>').join('') + '</div>';
      const ok = sel.y && sel.r;
      return '<div class="card hot"><div class="title">Alchemy</div><div class="sub">' + esc(pr.why) + ' The event die still rolls.</div>' +
        '<h2>Yellow die</h2>' + row('y') + '<h2>Red die' + (game().ck ? ' <small>it also decides progress cards</small>' : '') + '</h2>' + row('r') +
        '<button class="btn" id="answerAlchemy"' + (ok ? '' : ' disabled') + '>' + (ok ? 'Roll with ' + (sel.y + sel.r) : 'Choose both dice') + '</button></div>';
    }
    function progDiscardHtml(pr) {
      const chosen = S.list;
      return '<div class="card hot"><div class="title">Too many progress cards</div><div class="sub">' + esc(pr.why) + '</div><div class="opts">' +
        S.me.prog.map((k, i) => '<button class="opt' + (chosen.indexOf(i) >= 0 ? ' on' : '') + '" data-pd="' + i + '"><i class="dotc" style="background:' + D.TRACK[D.deckOf(k)].hex + '"></i><span class="lab"><b>' + esc(cardName(k)) + '</b><small>' + esc(D.PROGRESS[k].text) + '</small></span></button>').join('') +
        '</div><button class="btn" id="answerPd"' + (chosen.length === pr.need ? '' : ' disabled') + '>Put ' + pr.need + ' back</button></div>';
    }
    function spyHtml(pr) {
      return '<div class="card hot"><div class="title">Espionage</div><div class="sub">' + esc(pr.why) + '</div><div class="opts">' +
        pr.cards.map(k => '<button class="opt" data-do=\'' + JSON.stringify({ t: 'take', card: k }) + '\'><i class="dotc" style="background:' + D.TRACK[D.deckOf(k)].hex + '"></i><span class="lab"><b>' + esc(cardName(k)) + '</b><small>' + esc(D.PROGRESS[k].text) + '</small></span><span class="val">take</span></button>').join('') +
        '</div><button class="btn ghost" data-do=\'{"t":"skip"}\'>Take nothing</button></div>';
    }
    function treasonPlaceHtml(pr) {
      const lvl = S.list.length ? S.list[0] : Math.max.apply(null, pr.levels);
      S.answerPick = () => (S.sel != null ? { t: 'place', at: S.sel, level: lvl } : null);
      S.pickMany = 0; S.pickKind = 'corner'; S.pickOptions = pr.options;
      return '<div class="card hot"><div class="title">Treason</div><div class="sub">' + esc(pr.why) + '</div>' +
        '<div class="seg">' + pr.levels.map(l => '<button class="' + (l === lvl ? 'on' : '') + '" data-level="' + l + '">' + D.KNIGHT_NAME[l] + '</button>').join('') + '</div>' +
        boardHtml('corner', pr.options, S.sel) +
        '<button class="btn" id="answerPick"' + (S.sel != null ? '' : ' disabled') + '>Stand a ' + D.KNIGHT_NAME[lvl] + ' knight here</button>' +
        '<button class="btn ghost" data-do=\'{"t":"skip"}\'>Place nothing</button></div>';
    }

    /* ---------- trading ---------- */
    function tradeHtml(can) {
      const g = game(), me = S.me;
      let html = '';
      /* The bank, one card at a time, at your best rate. */
      const give = S.bank.give, getK = S.bank.get;
      const rate = give ? can.bank[give] : 0;
      html += '<h2>With the bank <small>your rates</small></h2>' +
        '<div class="types">' + types().map(k => {
          const r = can.bank[k];
          const ok = (me.hand[k] || 0) >= r;
          return '<button data-bgive="' + k + '" class="' + (give === k ? 'on' : '') + '"' + (ok ? '' : ' disabled') + '>' + A.chip(k, r + ':1', 18) + '</button>';
        }).join('') + '</div>' +
        '<div class="sub" style="margin-top:6px">' + (give ? 'For ' + rate + ' ' + D.cardName(give).toLowerCase() + ', take:' : 'Choose what to give.') + '</div>' +
        (give ? '<div class="types">' + types().filter(k => k !== give).map(k => '<button data-bget="' + k + '" class="' + (getK === k ? 'on' : '') + '"' + (g.bank[k] > 0 ? '' : ' disabled') + '>' + A.chip(k, null, 18) + '</button>').join('') + '</div>' : '') +
        '<button class="btn" id="bankGo"' + (give && getK ? '' : ' disabled') + '>' + (give && getK ? 'Trade ' + rate + ' ' + D.cardName(give).toLowerCase() + ' for a ' + D.cardName(getK).toLowerCase() : 'Trade with the bank') + '</button>';
      /* The table. */
      html += '<h2>With the table</h2>' + draftHtml(true);
      return html;
    }
    /* The offer composer: yours on your turn, a counter to the active player on theirs. */
    function draftHtml(mineTurn) {
      const g = game(), me = S.me, d = S.draft;
      const ks = types();
      const step = (side, k) => {
        const n = d[side][k] || 0;
        const max = side === 'give' ? (me.hand[k] || 0) : 19;
        return '<div class="pm' + (n ? ' on' : '') + '"><button data-step="' + side + ':' + k + ':-1"' + (n ? '' : ' disabled') + '>−</button><b>' + n + '</b>' +
          '<button data-step="' + side + ':' + k + ':1"' + (n < max ? '' : ' disabled') + '>+</button></div>';
      };
      const giveN = handTotal(d.give), getN = handTotal(d.get);
      const others = g.players.filter(p => p.id !== S.id);
      let to = '';
      if (mineTurn) {
        to = '<div class="sub" style="margin-top:8px">Offer it to</div><div class="seg names">' + ['all'].concat(others.map(p => p.id)).map(id => '<button class="' + ((d.to || 'all') === id ? 'on' : '') + '" data-to="' + esc(id) + '">' +
          (id === 'all' ? 'Everyone' : esc(pname(id))) + '</button>').join('') + '</div>';
      }
      return '<div class="tg"><span></span><span class="th">You give</span><span class="th">You want</span>' +
        ks.map(k => A.chip(k, me.hand[k] || 0, 16) + step('give', k) + step('get', k)).join('') + '</div>' + to +
        '<button class="btn" id="offerGo"' + (giveN && getN ? '' : ' disabled') + '>' + (mineTurn ? 'Make the offer' : 'Offer it to ' + esc(pname(g.cur))) + '</button>';
    }
    function counterHtml() {
      return '<h2>Offer ' + esc(pname(game().cur)) + ' a trade</h2><div class="card">' + draftHtml(false) + '</div>';
    }
    function offersHtml() {
      const g = game();
      if (!g || !g.offers.length) return '';
      /* On your own turn they are drawn inside the turn card instead. */
      const pr = myPrompt();
      if (pr && pr !== 'stale' && pr.t === 'turn' && g.cur === S.id) return '';
      const out = offerCards();
      return out.length ? '<h2>Trades on the table</h2>' + out.join('') : '';
    }
    function offerCards() {
      const g = game();
      if (!g || !g.offers.length || !S.me) return [];
      const me = S.me;
      const out = [];
      for (const o of g.offers) {
        const mineOffer = o.by === S.id;
        if (!o.counter) {
          const asked = o.to || g.players.filter(p => p.id !== o.by).map(p => p.id);
          if (mineOffer) {
            const reps = asked.map(id => {
              const r = o.replies[id];
              return '<span class="' + (r === true ? 'y' : r === false ? 'n' : '') + '">' + esc(pname(id)) + ' ' + (r === true ? '✓' : r === false ? '✗' : '…') + '</span>';
            }).join('');
            const deals = asked.filter(id => o.replies[id] === true).map(id => '<button class="btn small" data-do=\'' + JSON.stringify({ t: 'deal', offer: o.id, with: id }) + '\'>Deal with ' + esc(pname(id)) + '</button>').join(' ');
            out.push('<div class="offer"><div class="line"><b>Your offer:</b> ' + A.cards(o.give, 16) + ' for ' + A.cards(o.get, 16) + '</div><div class="rep">' + reps + '</div>' +
              '<div class="row2" style="margin-top:8px;flex-wrap:wrap">' + deals + '<button class="btn ghost small" data-do=\'' + JSON.stringify({ t: 'withdraw', offer: o.id }) + '\'>Withdraw</button></div></div>');
          } else if (asked.indexOf(S.id) >= 0) {
            const have = Object.keys(o.get).every(k => (me.hand[k] || 0) >= o.get[k]);
            const r = o.replies[S.id];
            out.push('<div class="offer"><div class="line"><b>' + esc(pname(o.by)) + '</b> offers you ' + A.cards(o.give, 16) + ' for ' + A.cards(o.get, 16) + '</div>' +
              (r === undefined
                ? '<div class="row2" style="margin-top:8px"><button class="btn small" style="flex:1" data-do=\'' + JSON.stringify({ t: 'reply', offer: o.id, yes: true }) + '\'' + (have ? '' : ' disabled') + '>' + (have ? 'Accept' : 'You do not have that') + '</button>' +
                  '<button class="btn ghost small" style="flex:1" data-do=\'' + JSON.stringify({ t: 'reply', offer: o.id, yes: false }) + '\'>No thanks</button></div>'
                : '<div class="rep">' + (r ? 'You said yes — ' + esc(pname(o.by)) + ' decides.' : 'You said no.') + '</div>') + '</div>');
          }
        } else {
          /* A counter: to the active player, from somebody. */
          if (g.cur === S.id) {
            const have = Object.keys(o.get).every(k => (me.hand[k] || 0) >= o.get[k]);
            out.push('<div class="offer"><div class="line"><b>' + esc(pname(o.by)) + '</b> offers ' + A.cards(o.give, 16) + ' for your ' + A.cards(o.get, 16) + '</div>' +
              '<div class="row2" style="margin-top:8px"><button class="btn small" style="flex:1" data-do=\'' + JSON.stringify({ t: 'deal', offer: o.id }) + '\'' + (have && tradeOpen() ? '' : ' disabled') + '>Accept</button></div></div>');
          } else if (mineOffer) {
            out.push('<div class="offer"><div class="line"><b>You offered ' + esc(pname(g.cur)) + ':</b> ' + A.cards(o.give, 16) + ' for ' + A.cards(o.get, 16) + '</div>' +
              '<div class="row2" style="margin-top:8px"><button class="btn ghost small" data-do=\'' + JSON.stringify({ t: 'withdraw', offer: o.id }) + '\'>Withdraw</button></div></div>');
          }
        }
      }
      return out;
    }

    /* ---------- knights (Cities & Knights) ---------- */
    function knightsHtml(can) {
      const g = game();
      const mineK = g.knights.filter(k => k.owner === S.id);
      const out = [];
      const exposed = g.builds.some(b => b.owner === S.id && b.kind === 'city' && !b.metro);
      const def = g.players.reduce((s, p) => s + p.strength, 0);
      const holds = def >= g.barbStrength;
      const mineStr = (mine() || {}).strength || 0;
      const verdict = holds
        ? ' Catan would hold today — the strongest defender earns a point.'
        : (exposed ? ' Catan would fall today, and whoever defends least loses a city' + (mineStr === 0 ? ' — you have no active knights.' : '.') : ' Catan would fall today.');
      out.push('<div class="sub" style="margin-top:8px">Barbarians ' + g.barb + ' of ' + g.barbTrack + ' · cities ' + g.barbStrength + ' against active knights ' + def + '.' + verdict + '</div>');
      if (!mineK.length) out.push('<div class="sub" style="margin-top:8px">No knights yet — recruit one from Build.</div>');
      for (const k of mineK) {
        const acts = [];
        if (can.activate.indexOf(k.id) >= 0) acts.push(['activate', 'Activate', can.afford.activate, D.COST.activate]);
        if (can.promote.indexOf(k.id) >= 0) acts.push(['promote', 'Promote', can.afford.promote, D.COST.promote]);
        if (can.kmove[k.id]) acts.push(['kmove', 'Move', true, null]);
        if (can.displace[k.id]) acts.push(['displace', 'Displace', true, null]);
        if (can.chase.indexOf(k.id) >= 0) acts.push(['chase', 'Chase the robber', true, null]);
        const state = k.active ? (k.fresh ? 'active — rests this turn' : 'active') : 'inactive';
        out.push('<div class="pc" style="--dc:' + esc(mine().hex) + '">' + A.piece('knight', mine().hex, 26) + '<span class="lab"><b>' + D.KNIGHT_NAME[k.level] + ' knight (' + k.level + ')</b><small>' + state + '</small>' +
          '<span class="row2" style="flex-wrap:wrap;margin-top:6px">' + (acts.length ? acts.map(a => '<button class="btn small" data-knight="' + a[0] + ':' + k.id + '"' + (a[2] ? '' : ' disabled') + '>' + a[1] + (a[3] ? ' ' + costChips(a[3]) : '') + '</button>').join('') : '<small>nothing to do</small>') + '</span></span></div>');
      }
      return '<div style="margin-top:6px">' + out.join('') + '</div>';
    }
    function knightAct(kind, id) {
      const can = S.me.can;
      if (kind === 'activate' || kind === 'promote' || kind === 'chase') { act({ t: kind, knight: id }); return; }
      const options = kind === 'kmove' ? can.kmove[id] : can.displace[id];
      S.pick = { kind: 'corner', options, what: kind, knight: id, label: kind === 'kmove' ? 'Move here' : 'Displace this knight', sub: kind === 'kmove' ? 'Along your own roads, to an empty crossing. It lies down afterwards.' : 'A weaker knight your roads reach. Yours lies down afterwards.' };
      S.sel = null;
      paint();
    }
    /* ---------- city improvements (Cities & Knights) ---------- */
    function improveHtml(can) {
      const p = mine();
      return '<div class="acts">' + D.TRACKS.map(t => {
        const T = D.TRACK[t], im = can.improve[t];
        const lvl = p.impr[t];
        const next = lvl < 5 ? T.levels[lvl + 1] : null;
        const draws = D.drawsOn(lvl);
        const note = next ? (im.why || ('draws on red ' + (draws.length ? draws.join(',') : '—') + ' now; ' + D.drawsOn(lvl + 1).join(',') + ' after')) : 'complete';
        return '<button class="act" data-improve="' + t + '"' + (next && !im.why ? '' : ' disabled') + '>' + A.glyph(t, 26, T.hex) +
          '<span class="lab"><b>' + T.name + ' ' + lvl + (next ? ' → ' + next : '') + '</b><small>' + esc(note) + '</small></span>' +
          '<span class="cost">' + (next ? A.chip(T.com, im.cost, 14) : '') + '</span></button>';
      }).join('') + '<div class="sub" style="margin-top:4px">Level 3: ' + D.TRACKS.map(t => esc(D.TRACK[t].ability)).join(' ') + ' First to level 4 takes the metropolis; first to 5 keeps it.</div></div>';
    }

    /* ---------- your hand ---------- */
    function handHtml(pr) {
      const me = S.me, p = mine(), g = game();
      if (!me) return '';
      const ks = types();
      const tiles = ks.map(k => {
        const c = D.CARD[k], n = me.hand[k] || 0;
        return '<div class="hc' + (n ? '' : ' zero') + '" style="--hcc:' + c.hex + ';--hci:' + c.ink + '">' + A.glyph(k, 22, c.ink) + '<b>' + n + '</b><small>' + esc(c.name) + '</small></div>';
      }).join('');
      const tot = handTotal(me.hand);
      const warn = tot > p.limit;
      return '<h2>Your hand <small>' + tot + ' card' + (tot === 1 ? '' : 's') + '</small></h2><div class="hand' + (g.ck ? ' ck' : '') + '">' + tiles + '</div>' +
        '<div class="handnote' + (warn ? ' warn' : '') + '">' + (warn ? 'Over ' + p.limit + ': a 7 now would cost you ' + Math.floor(tot / 2) + '.' : 'A 7 costs you half once you hold more than ' + p.limit + '.') + '</div>';
    }

    /* ---------- your development / progress cards ---------- */
    function cardName(k) {
      if (game() && game().ck) { const c = D.PROGRESS[k]; return c ? c.name + (c.alt ? ' (' + c.alt + ')' : '') : k; }
      const c = D.DEV[k]; return c ? c.name : k;
    }
    function cardsHtml(pr) {
      const g = game(), me = S.me;
      const can = pr && pr !== 'stale' && pr.t === 'turn' ? me.can : null;
      const rows = [];
      if (g.ck) {
        me.prog.forEach((k, i) => {
          const c = D.PROGRESS[k];
          const why = can ? can.play[k] : 'on your turn';
          rows.push(cardRow(k, c.name + (c.alt ? ' · ' + c.alt : ''), c.text, D.TRACK[c.deck].hex, why, i));
        });
        const p = mine();
        if (p.vpCards.length) rows.push('<div class="sub" style="margin-top:6px">Face up: ' + p.vpCards.map(k => esc(D.progName(k))).join(', ') + ' (a point each)</div>');
        if (!rows.length) return '<h2>Progress cards</h2><div class="sub">None yet — raise a city improvement to draw them.</div>';
        return '<h2>Progress cards <small>' + me.prog.length + ' of ' + D.PROGRESS_LIMIT + '</small></h2>' + rows.join('');
      }
      const seen = {};
      me.dev.forEach((d, i) => {
        if (d.key === 'vp') { rows.push(cardRow('vp', 'Victory Point', 'Counts already — stays face down until it wins you the game.', '#c9a227', 'kept hidden', i)); return; }
        const c = D.DEV[d.key];
        const why = d.fresh ? 'bought this turn — play it next turn' : (can ? (can.play[d.key] === undefined ? null : can.play[d.key]) : 'on your turn');
        rows.push(cardRow(d.key, c.name, c.text, d.key === 'knight' ? '#c0473d' : '#3fa06a', seen[d.key] && why === null ? null : why, i));
        seen[d.key] = true;
      });
      if (!rows.length) return '<h2>Development cards</h2><div class="sub">None yet — a wool, a wheat and an ore buys one.</div>';
      return '<h2>Development cards</h2>' + rows.join('');
    }
    function cardRow(key, name, text, colour, why, i) {
      const armed = S.arm === key + ':' + i;
      const playable = why === null;
      return '<div class="pc' + (armed ? ' on' : '') + '" style="--dc:' + colour + '"><span class="lab"><b>' + esc(name) + '</b><small>' + esc(text) + '</small>' +
        (playable ? '' : '<em>' + esc(why || '') + '</em>') + '</span>' +
        (playable ? '<button class="btn small" data-play="' + esc(key) + ':' + i + '">' + (armed ? 'Sure? Play' : 'Play') + '</button>' : '') + '</div>';
    }

    /* ---------- the table, so a phone can see what the telly shows ---------- */
    function tableHtml() {
      const g = game();
      if (!g) return '';
      const rows = g.players.map(p => {
        const extra = [];
        if (g.longest && g.longest.seat === p.id) extra.push('road ' + g.longest.len);
        if (g.largest && g.largest.seat === p.id) extra.push('army');
        if (g.ck && g.merchant && g.merchant.seat === p.id) extra.push('merchant');
        return '<div class="prow"><i style="background:' + esc(p.hex) + '"></i><span class="nm' + (p.id === S.id ? ' me' : '') + '">' + esc(p.name) + '</span>' +
          '<span class="x">' + A.glyph('cards', 14) + p.cards + '</span>' +
          (g.ck ? '<span class="x">' + A.glyph('dev', 14, '#b9a5e8') + p.prog + '</span><span class="x">' + A.glyph('knight', 14) + p.strength + '</span>'
            : '<span class="x">' + A.glyph('dev', 14, '#b9a5e8') + p.dev + '</span><span class="x">' + A.glyph('knight', 14) + p.knightsPlayed + '</span>') +
          (extra.length ? '<span class="x" style="color:var(--gold)">' + esc(extra.join(' · ')) + '</span>' : '') +
          '<span class="vp">' + p.vp + '</span></div>';
      }).join('');
      return '<h2>The table <small>first to ' + g.target + '</small></h2><div class="card"><div class="rows">' + rows + '</div></div>' +
        (opts.solo ? '' : '<button class="btn ghost" id="menuPlay">Games menu</button>') +
        (isRemote() && !opts.solo && S.pub.screen === 'play' ? '<button class="btn ghost" id="abandon">' + (S.arm === 'abandon' ? 'Sure? End it — nobody banks anything' : 'End this game early') + '</button>' : '');
    }

    /* ================================================================
       With no telly (solo, F1): the phone carries the table — the island, the
       dice and the barbarians, what the house just did, the landing, the log.
       On the hub these are the telly's; the phone shows only the undo.
       ================================================================ */
    const solo = () => !!(S.pub && S.pub.solo);
    /* Take back your last move, while nothing hidden has come out since. */
    function undoHtml() {
      const u = S.undo;
      const msg = S.pub && S.pub.undone ? '<div class="sub" style="margin:0 2px 8px;color:var(--gold)">' + esc(S.pub.undone) + '</div>' : '';
      if (!u) return msg;
      return msg + '<button class="btn ghost small undo" id="undo">↶ Take back ' + esc(u.what) + '</button>';
    }
    /* The newest house line, large: "Just now · Elsa builds a road". */
    function reelHtml() {
      const r = S.pub && S.pub.reel;
      if (!solo() || !r) return '';
      const fresh = r.i !== S.reelSeen;
      S.reelSeen = r.i;
      return '<div class="reel' + (fresh ? ' fresh' : '') + '" style="--rc:' + esc(r.hex || '#e8c267') + '"><small>Just now</small>' + esc(r.text) + '</div>';
    }
    function islandHtml() {
      const g = game();
      if (!solo() || !g) return '';
      const hot = g.dice && g.dice.sum !== 7 && g.phase === 'play' ? g.dice.sum : null;
      let barb = '';
      if (g.ck) {
        const def = g.players.reduce((s, p) => s + p.strength, 0);
        barb = '<span class="barbline">' + A.ship(16, '#e9e4d6') + ' ' + (g.barbTrack - g.barb) + ' to land · cities <b style="color:#ff8a80">' + g.barbStrength + '</b> · knights <b style="color:' + (def >= g.barbStrength ? '#8ee6b4' : '#ff8a80') + '">' + def + '</b></span>';
      }
      return '<div class="isle"><div class="boardbox' + (S.zoom ? ' zoom' : '') + '" id="isle">' + A.board(g, { mode: 'phone', hot, marks: marksOf(g) }) + '</div>' +
        '<div class="boardbar"><span class="sel status">' + barb + '</span><button class="btn ghost small" id="zoomIsle">' + (S.zoom ? 'Fit' : 'Zoom') + '</button></div></div>';
    }
    /* This turn's changes on the island, as the telly marks them. */
    function marksOf(pub) {
      const m = { corners: [], edges: [], hexes: [] };
      let list = pub.log.filter(e => e.turn === pub.turnNo && e.by === pub.cur);
      if (pub.phase === 'setup') list = list.slice(-2);
      for (const e of list) {
        if (e.t === 'build') (e.what === 'road' ? m.edges : m.corners).push(e.at);
        else if (e.t === 'kmove' || e.t === 'displace') m.corners.push(e.to);
        else if (e.t === 'robber') m.hexes.push(e.to);
        else if (e.t === 'merchant') m.hexes.push(e.hex);
      }
      return m;
    }
    /* The barbarians land. On the hub the telly shows it; alone, it is a card
       that waits for Continue. */
    function attackHtml() {
      const at = S.pub && S.pub.attack;
      if (!at) return '';
      if (!solo()) return waitCard('The barbarians land!', 'Watch the telly.');
      return '<div class="card hot attack"><div class="title">The barbarians land!</div>' +
        '<div class="vs"><div><b style="color:#ff8a80">' + at.barb + '</b><small>barbarians — one per city</small></div><div><b style="color:#8ee6b4">' + at.def + '</b><small>active knights</small></div></div>' +
        '<div class="rows">' + at.rows.map(p => '<div class="prow"><i style="background:' + esc(p.hex) + '"></i><span class="nm">' + esc(p.name) + '</span><span class="vp">' + p.n + '</span></div>').join('') + '</div>' +
        (at.stage === 'verdict' ? '<div class="verdict ' + (at.win ? 'win' : 'lose') + '">' + esc(at.verdict) + '</div><button class="btn" id="cont">Continue</button>' : '<div class="sub" style="margin-top:8px">Counting the knights…</div>') + '</div>';
    }
    /* Everything said at the table, newest first. */
    function logHtml() {
      const lines = (S.pub && S.pub.crier) || [];
      if (!solo() || !lines.length) return '';
      const mine = S.lastTurnLine || 0;
      const n = S.logOpen ? 40 : 6;
      return '<h2>At the table <small><button class="btn ghost small" id="logMore">' + (S.logOpen ? 'Fewer' : 'More') + '</button></small></h2><div class="card log">' +
        lines.slice(0, n).map(l => '<div class="' + (l.i > mine ? 'new' : '') + '">' + esc(l.text) + '</div>').join('') + '</div>';
    }

    /* ================================================================
       Wiring
       ================================================================ */
    function wire() {
      const m = $('main');
      const on = (sel, fn) => m.querySelectorAll(sel).forEach(el => { el.onclick = ev => { if (!locked()) fn(el, ev); }; });

      on('#menu', () => (opts.onMenu ? opts.onMenu() : send({ t: 'menu' })));
      on('#menuPlay', () => { if (isRemote()) send({ t: 'menu' }); else flash('Only ' + pname(S.pub.remote) + '’s phone can go back to the menu.'); });
      on('#abandon', () => {
        if (S.arm !== 'abandon') { S.arm = 'abandon'; paint(); setTimeout(() => { if (S.arm === 'abandon') { S.arm = null; paint(); } }, 4000); return; }
        S.arm = null; lock(); send({ t: 'abandon' });
      });
      on('#hurry', () => { lock(); send({ t: 'hurry' }); });
      on('#go', () => { lock(); send({ t: 'start' }); });
      on('#again', () => { lock(); send({ t: 'again' }); });
      on('#skipFin', () => { lock(); send({ t: 'skipFin' }); });
      on('[data-opt]', el => { lock(); send({ t: 'opt', key: el.dataset.opt, value: el.dataset.v }); });

      /* any ready-made answer */
      on('[data-do]', el => { let a; try { a = JSON.parse(el.dataset.do); } catch (e) { return; } act(a); if (a.t === 'end' || a.t === 'deal') S.pick = null; });
      on('[data-tab]', el => { S.tab = el.dataset.tab; S.pick = null; paint(); });
      on('[data-build]', el => startPick(el.dataset.build));
      on('[data-knight]', el => { const [kind, id] = el.dataset.knight.split(':'); S.endAsk = false; knightAct(kind, +id); });
      /* End turn asks first when a knight could still be woken (Cities & Knights). */
      on('#end', () => {
        if (!S.endAsk && knightNag()) { S.endAsk = true; paint(); return; }
        S.endAsk = false; S.pick = null; act({ t: 'end' });
      });
      on('#endAnyway', () => { S.endAsk = false; S.pick = null; act({ t: 'end' }); });
      on('#endBack', () => { S.endAsk = false; S.tab = 'knights'; paint(); });
      on('[data-hide]', el => { S.offerHide[el.dataset.hide] = true; paint(); });
      on('#noticeGo', el => {
        const k = +el.dataset.k;
        S.noticeDone = S.noticeDone || {};
        S.noticeDone[k] = true;
        S.notices = S.notices.filter(n => n.k !== k);
        lock(); send({ t: 'seen', k }); paint();
      });
      on('[data-improve]', el => act({ t: 'improve', track: el.dataset.improve }));
      on('#cancelPick', () => { S.pick = null; S.sel = null; paint(); });
      on('#confirmPick', () => {
        const pk = S.pick;
        if (!pk || S.sel == null) return;
        const a = pk.what === 'kmove' ? { t: 'kmove', knight: pk.knight, to: S.sel }
          : pk.what === 'displace' ? { t: 'displace', knight: pk.knight, to: S.sel }
          : { t: 'build', what: pk.what, at: S.sel };
        S.pick = null; S.sel = null;
        act(a);
      });
      on('#zoom', () => { S.zoom = !S.zoom; paint(); });
      on('#zoomIsle', () => { S.zoom = !S.zoom; paint(); });
      on('#undo', () => { lock(); send({ t: 'undo' }); });
      on('#cont', () => { lock(); send({ t: 'cont' }); });
      on('#logMore', () => { S.logOpen = !S.logOpen; paint(); });
      /* The board: a tap on a marker, or near one. */
      const bb = $('bb');
      if (bb) bb.onclick = ev => {
        if (locked()) return;
        const kind = S.pick ? S.pick.kind : S.pickKind;
        const options = S.pick ? S.pick.options : S.pickOptions;
        if (!kind || !options) return;
        const t = ev.target && ev.target.closest ? ev.target.closest('[data-pick]') : null;
        let id = t ? +t.dataset.pick : null;
        if (id == null) {
          const svg = bb.querySelector('svg');
          if (svg && svg.getScreenCTM && svg.createSVGPoint) {
            const m2 = svg.getScreenCTM();
            if (m2) {
              const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
              const p = pt.matrixTransform(m2.inverse());
              id = A.nearest(game(), { kind, options }, p.x, p.y, 75);
            }
          }
        }
        if (id == null || options.indexOf(id) < 0) return;
        if (!S.pick && S.pickMany) {
          const cur = Array.isArray(S.sel) ? S.sel.slice() : [];
          const k = cur.indexOf(id);
          if (k >= 0) cur.splice(k, 1); else if (cur.length < S.pickMany) cur.push(id);
          S.sel = cur;
        } else S.sel = id;
        buzz(10);
        paint();
      };
      on('#answerPick', () => { const a = S.answerPick && S.answerPick(); if (a) act(a); });
      on('[data-li]', el => act(S.answerList(el.dataset.v)));
      on('[data-type]', el => act(S.answerType(el.dataset.type)));

      /* choosing cards */
      on('[data-add]', el => {
        const k = el.dataset.add;
        if (handTotal(S.multi) >= S.chooseNeed) return;
        if ((S.multi[k] || 0) >= (S.chooseFrom[k] || 0)) return;
        S.multi[k] = (S.multi[k] || 0) + 1; paint();
      });
      on('[data-sub]', el => { const k = el.dataset.sub; if (S.multi[k]) { S.multi[k]--; if (!S.multi[k]) delete S.multi[k]; } paint(); });
      on('#answerCards', () => act(S.answerCards()));
      on('[data-plenty]', el => { const cur = Array.isArray(S.sel) ? S.sel : []; if (cur.length < 2) S.sel = cur.concat([el.dataset.plenty]); paint(); });
      on('[data-unplenty]', el => { const cur = Array.isArray(S.sel) ? S.sel.slice() : []; cur.splice(+el.dataset.unplenty, 1); S.sel = cur; paint(); });
      on('#answerPlenty', () => act(S.answerPlenty()));
      on('[data-die]', el => { const k = el.dataset.die[0], v = +el.dataset.die.slice(1); const cur = S.sel && typeof S.sel === 'object' && !Array.isArray(S.sel) ? S.sel : { y: 0, r: 0 }; cur[k] = v; S.sel = cur; paint(); });
      on('#answerAlchemy', () => { const s = S.sel; if (s && s.y && s.r) act({ t: 'dice', y: s.y, r: s.r }); });
      on('[data-pd]', el => { const i = +el.dataset.pd; const k = S.list.indexOf(i); if (k >= 0) S.list.splice(k, 1); else S.list.push(i); paint(); });
      on('#answerPd', () => act({ t: 'discard', cards: S.list.map(i => S.me.prog[i]) }));
      on('[data-level]', el => { S.list = [+el.dataset.level]; paint(); });

      /* cards in hand: two taps to play */
      on('[data-play]', el => {
        const id = el.dataset.play;
        if (S.arm !== id) { S.arm = id; paint(); setTimeout(() => { if (S.arm === id) { S.arm = null; paint(); } }, 4000); return; }
        S.arm = null;
        act({ t: 'play', card: id.split(':')[0] });
      });

      /* trading */
      on('[data-bgive]', el => { S.bank.give = el.dataset.bgive; if (S.bank.get === S.bank.give) S.bank.get = null; paint(); });
      on('[data-bget]', el => { S.bank.get = el.dataset.bget; paint(); });
      on('#bankGo', () => { if (S.bank.give && S.bank.get) { act({ t: 'bank', give: S.bank.give, get: S.bank.get }); S.bank.get = null; if ((S.me.hand[S.bank.give] || 0) - S.me.can.bank[S.bank.give] < S.me.can.bank[S.bank.give]) S.bank.give = null; } });
      on('[data-step]', el => {
        const [side, k, dv] = el.dataset.step.split(':');
        const d = S.draft[side];
        d[k] = Math.max(0, (d[k] || 0) + (+dv));
        if (!d[k]) delete d[k];
        const other = side === 'give' ? 'get' : 'give';
        if (d[k] && S.draft[other][k]) delete S.draft[other][k];
        paint();
      });
      on('[data-to]', el => { S.draft.to = el.dataset.to === 'all' ? null : el.dataset.to; paint(); });
      on('#offerGo', () => {
        const g = game();
        const d = S.draft;
        const mineTurn = g.cur === S.id;
        const a = { t: mineTurn ? 'offer' : 'counter', give: Object.assign({}, d.give), get: Object.assign({}, d.get) };
        if (mineTurn && d.to) a.to = [d.to];
        act(a);
        S.draft = { give: {}, get: {}, to: d.to };
      });
    }
    document.body.insertAdjacentHTML('afterbegin', A.defs());
    if (A.onReady) A.onReady(() => paint());
    return { receive, setMe, flash, paint, S };
  }

  const Phone = { VERSION: 1, STYLES, create };
  root0.CatanPhone = Phone;
})(window);
