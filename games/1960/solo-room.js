'use strict';
/* 1960 with no server (the GitHub Pages copy; PRINCIPLES F1, "phones only").
 *
 * The telly and the handset are the same code as the hub's: telly.html runs
 * hub.js and 1960.html unchanged, and the phone runs controller.html
 * unchanged. Between them sits this room, which speaks the same wire
 * messages the hub server speaks (hello, players, join, input, to, all,
 * kick), so neither page can tell it is not the server.
 *
 * The phone page (index.html) loads this first. It creates the room, makes
 * the phone's WebSocket a socket into the room, and runs the telly in a
 * hidden iframe. The telly is never shown: the phone is the whole screen.
 * Nothing leaves the browser, and a reload starts a new room.
 */
(function (root) {
  const HEX = '#f1c75b';
  const SEAT_ID = 'p1';
  const TOKEN = 'solo-' + Math.random().toString(36).slice(2, 10);
  const room = { host: null, player: null, seat: null, hostUp: false, frame: null };

  /* A socket that opens on the next tick and hands messages across. */
  function socketFor(kind) {
    const s = { kind, readyState: 0, onopen: null, onmessage: null, onclose: null };
    s.send = function (text) {
      if (s.readyState !== 1) return;
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      setTimeout(() => (kind === 'host' ? fromHost(m) : fromPlayer(m)), 0);
    };
    s.close = function () { s.readyState = 3; };
    setTimeout(() => {
      s.readyState = 1;
      if (s.onopen) s.onopen({});
    }, 0);
    return s;
  }
  function toHost(m) {
    const s = room.host;
    if (!s || s.readyState !== 1 || !s.onmessage) return;
    setTimeout(() => s.onmessage({ data: JSON.stringify(m) }), 0);
  }
  function toPlayer(m) {
    const s = room.player;
    if (!s || s.readyState !== 1 || !s.onmessage) return;
    setTimeout(() => s.onmessage({ data: JSON.stringify(m) }), 0);
  }
  function seatList() {
    return room.seat ? [{ id: room.seat.id, name: room.seat.name, hex: room.seat.hex, connected: true, idleMs: 0 }] : [];
  }

  function fromHost(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      room.hostUp = true;
      toHost({ t: 'hello-ok', joinUrl: '', joinAlts: [] });
      toHost({ t: 'players', list: seatList() });
      toPlayer({ t: 'lobby', host: true });
      return;
    }
    if (m.t === 'to') {
      if (room.seat && m.id === room.seat.id) toPlayer({ t: 'msg', msg: m.msg });
      return;
    }
    if (m.t === 'all') { toPlayer({ t: 'msg', msg: m.msg }); return; }
    if (m.t === 'kick' || m.t === 'kickAll') {
      if (room.seat && (m.t === 'kickAll' || m.id === room.seat.id)) {
        room.seat = null;
        toHost({ t: 'players', list: [] });
      }
      return;
    }
  }

  function fromPlayer(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      /* A new visitor types a name first; a returning one has a stored name. */
      const name = String(m.name || '').trim().slice(0, 14) || (room.seat ? room.seat.name : '');
      if (!name) return;
      const fresh = !room.seat;
      if (fresh) room.seat = { id: SEAT_ID, name, hex: HEX };
      else room.seat.name = name;
      toPlayer({ t: 'hello-ok', id: room.seat.id, name, hex: HEX, token: TOKEN, host: room.hostUp });
      toHost({ t: 'players', list: seatList() });
      toHost({ t: fresh ? 'join' : 'rejoin', id: room.seat.id });
      return;
    }
    if (!room.seat) return;
    toHost({ t: 'input', from: room.seat.id, msg: m });
  }

  /* The telly page calls this in its iframe to take its socket from the room. */
  root.M60Room = {
    hostSocket: function () { room.host = socketFor('host'); return room.host; },
    playerSocket: function () { room.player = socketFor('player'); return room.player; },
    frame: null
  };

  /* The phone's own WebSocket becomes the room's player socket. */
  root.WebSocket = function FakeWebSocket() { return root.M60Room.playerSocket(); };
  root.WebSocket.OPEN = 1;

  /* The telly, hidden. It must still be laid out and painted (scenes measure
     themselves; animations run on frames), so it sits in the corner at full
     size, fully transparent, and takes no pointer. */
  function openTelly() {
    const f = document.createElement('iframe');
    f.src = 'telly.html?solo=1';
    f.title = 'the table (telly)';
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:800px;border:0;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(f);
    root.M60Room.frame = f;
  }
  if (document.body) openTelly();
  else document.addEventListener('DOMContentLoaded', openTelly);
})(typeof window !== 'undefined' ? window : globalThis);
