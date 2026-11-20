'use strict';
/* The Gameshow Hub — everything a show needs that is not the show.
 *
 * Ported from the Swing Golf party hub, where this layer had already been
 * separated out and proved over an evening: the socket, seats and colours,
 * reconnect tokens, removing a player, pruning ghosts, the join code, the
 * network diagnosis. None of it was ever about golf and none of it is about
 * quizzes now.
 *
 * A game page does four things with it:
 *
 *   Hub.connect('host')                     open the socket, become the display
 *   Cards.attach(Hub)                       route phone answers into promises
 *   Hub.onPlayers = list => { ... }         the lobby changed
 *   await Cards.ask(id, { ... })            run the show
 *
 * The server is the hub's memory. Players join once and stay joined while the
 * display walks between the menu and the games, because the seats live on the
 * server rather than in any page.
 */
(function (root) {

const Hub = {
  sock: null,
  role: null,
  seats: [],
  joinUrl: '',
  joinAlts: [],
  diag: null,
  retry: 0,

  /* Filled in by whichever page is using the hub. */
  onPlayers: null,
  onInput: null,
  onRejoin: null,
  onHello: null,
  /* The server closed us on purpose and we are not coming back. */
  onEvicted: null,
  onLost: null,
  onDiag: null,

  /* The bill. `ready:false` still appears on the menu so the room can see
     what is coming, but cannot be started.
     The order here is the order on the menu, so it is also the running order
     of a season. Keep the finished ones first. */
  games: [
    { id: 'tenable', name: 'Tower of Ten', ready: true,
      blurb: 'Fill in a top-ten list. Ten rungs, one tower, no clues.',
      players: '1–5', minutes: 20, art: '#f5c542' },
    { id: 'tipping', name: 'Tipping Point', ready: true,
      blurb: 'Three counters, a buzzer and a machine that owes you nothing.',
      players: '2–4', minutes: 25, art: '#3e7bfa' },
    { id: 'lotr', name: 'Deck of the Rings', ready: true,
      blurb: 'Build a deck, take a row, and cover the player next to you.',
      players: '1–4 co-op', minutes: 40, art: '#d4af37' },
    { id: 'darts', name: 'Oche', ready: true,
      blurb: 'Five hundred and one, double to finish. Flick your phone to throw.',
      players: '1–2', minutes: 15, art: '#c0392b',
      /* A flick has no card kind either, so darts brings its own handset the
         same way golf does. Must match GAME_PHONE in server/server.js. */
      phone: '/game/darts/controller.html' },
    { id: 'golf', name: 'Swing Golf', ready: true,
      blurb: 'Nine holes. Your phone is the club — swing it like you mean it.',
      players: '1–4', minutes: 35, art: '#2f9e44',
      /* Golf wants a swing, which is not one of the seven card kinds, so it
         brings its own phone page. Anything with `phone` set sends the room
         to a different handset screen for the duration; the seat is the same
         one either way. Must match GAME_PHONE in server/server.js. */
      phone: '/game/golf/controller.html' },
    { id: 'races', name: 'Race Day', ready: true,
      blurb: 'Nine horses, four races, and a betting board everyone grabs at once.',
      players: '1–9', minutes: 30, art: '#e0b93f',
      /* The whole betting mat lives on the handset and is live all race, which
         is not a card kind and never will be. Must match GAME_PHONE in
         server/server.js. */
      phone: '/game/races/controller.html' },
    { id: 'racing', name: 'Car Racing', ready: true,
      blurb: 'Shift, play your cards, and pray the corner comes off. The board is on the telly.',
      players: '1–6', minutes: 30, art: '#e3492b',
      /* The board belongs on the big screen and a hand of cards belongs in
         a hand, so this one brings its own handset like golf and the races.
         Must match GAME_PHONE in server/server.js. */
      phone: '/game/racing/controller.html' },
    { id: 'botc', name: 'Blood on the Clocktower', ready: true,
      blurb: 'One of you is a Demon. Find them before there are two of you left.',
      players: '5–15', minutes: 45, art: '#a3262c',
      /* Everything a player holds here is secret — their character, what the
         night told them, who they are about to nominate. A broadcast card
         would leak the game to the room, so this one brings its own handset
         and the display speaks to each seat privately. Must match GAME_PHONE
         in server/server.js. */
      phone: '/game/botc/controller.html' },
    { id: 'sonar', name: 'Captain Sonar', ready: true,
      blurb: 'Two submarine crews hunt each other. Listen to every heading the enemy captain gives.',
      players: '2–8', minutes: 40, art: '#5eead4',
      /* A crew's half of the game is secret from the other crew — the route,
         the mines, the gauges, the engine room — so the handset is the crew's
         side of the screen. Must match GAME_PHONE in server/server.js. */
      phone: '/game/sonar/controller.html' },
    { id: 'qe', name: 'QE', ready: true,
      blurb: 'Print money to bail out the banks. Whoever spends the most is out.',
      players: '1–5', minutes: 30, art: '#e8c267',
      /* A sealed bid, a secret industry token and the prices you have been
         allowed to see are private and last the whole game, so this one
         brings its own handset. Must match GAME_PHONE in server/server.js. */
      phone: '/game/qe/controller.html' },
    { id: 'dow', name: 'Dead of Winter', ready: true,
      blurb: 'A colony, a winter, a shared goal — and a betrayer somewhere round the fire.',
      players: '1–5', minutes: 90, art: '#9fd4f5',
      /* A hand, a secret objective and a Crossroads card held for the next
         player are private all game, so this one brings its own handset.
         Must match GAME_PHONE in server/server.js. */
      phone: '/game/dow/controller.html' },
    { id: 'obsession', name: 'Obsession', ready: true,
      blurb: 'Restore the estate, restore the name, and catch a Fairchild’s eye before the neighbours do.',
      players: '1–4', minutes: 60, art: '#c9a227',
      /* Your objective cards and your victory point cards are secret all game,
         and a turn is eight steps of choosing rather than one card kind, so
         this one brings its own handset. Must match GAME_PHONE in
         server/server.js. */
      phone: '/game/obsession/controller.html' },
    { id: 'nidavellir', name: 'Nidavellir', ready: true,
      blurb: 'Five coins, three taverns, one bid each. Hire the dwarves, crown the heroes.',
      players: '1–5', minutes: 45, art: '#e8c267',
      /* Which coin you put on which tavern is face down until that tavern
         opens — and that is the entire game. Must match GAME_PHONE in
         server/server.js. */
      phone: '/game/nidavellir/controller.html' },
    { id: 'petersburg', name: 'Saint Petersburg', ready: true,
      blurb: 'Twenty-five rubles and a city to build. Workers pay, buildings score, aristocrats do both.',
      players: '1–4', minutes: 45, art: '#3a7fd0',
      /* The cards behind your hand are secret, and every card on the table has
         a different price for every player at the table. Must match GAME_PHONE
         in server/server.js. */
      phone: '/game/petersburg/controller.html' },
    { id: 'bloodrage', name: 'Blood Rage', ready: true,
      blurb: 'Invade, pillage and die gloriously before Ragnarök swallows the world.',
      players: '1–5', minutes: 90, art: '#c8413b',
      /* Your hand of the gods' gifts and your face-down Quests are secret
         all game. Must match GAME_PHONE in server/server.js. */
      phone: '/game/bloodrage/controller.html' },
    { id: 'catan', name: 'Catan', ready: true,
      blurb: 'Settle the island, trade wood for sheep, race to ten — or hold off the barbarians in Cities & Knights.',
      players: '1–4', minutes: 75, art: '#d98b2b',
      /* Your resource cards and your development or progress cards are
         secret all game. Must match GAME_PHONE in server/server.js. */
      phone: '/game/catan/controller.html' },
    { id: '1889', name: 'Shikoku 1889', ready: true,
      blurb: 'Start railways, trade their shares, lay track across Shikoku and run trains until the bank breaks.',
      players: '1–6', minutes: 180, art: '#f2c94c',
      /* An 18xx turn is a hex, a tile and a rotation off a map, or a par
         price, or which shares to sell — none of them a card kind. Every 18xx
         title shares this page and handset; the route names the title. Must
         match GAME_PHONE in server/server.js. */
      phone: '/game/1889/controller.html' },
    { id: 'marcopolo', name: 'The Voyages of Marco Polo', ready: true,
      blurb: 'Roll your dice, trade along the Silk Road, and open trading posts all the way from Venezia to Bejing.',
      players: '1–4', minutes: 75, art: '#c9803a',
      /* Your objective cards are secret all game, and every turn is dice on
         a space plus a journey or a choice to go with it. Must match
         GAME_PHONE in server/server.js. */
      phone: '/game/marcopolo/controller.html' },
    { id: 'arnak', name: 'Lost Ruins of Arnak', ready: true,
      blurb: 'Dig, discover, face the guardians — and research your way up to the Lost Temple first.',
      players: '1–4', minutes: 70, art: '#3fa37a',
      /* Your hand is secret, and a turn is a site, a payment, a research
         move or a card to buy — none of them a card kind. Must match
         GAME_PHONE in server/server.js. */
      phone: '/game/arnak/controller.html' },
    { id: 'nations', name: 'Nations', ready: true,
      blurb: 'Four ages of history in eight rounds: grow, build, fight wars and raise wonders — and keep your people fed.',
      players: '1–5', minutes: 120, art: '#c9922e',
      /* Nothing is secret, but a turn is a card off the progress board and
         where it goes, a worker moved, an architect or a card's action —
         none of them a card kind. Must match GAME_PHONE in server/server.js. */
      phone: '/game/nations/controller.html' },
    { id: 'ti4', name: 'Twilight Imperium', ready: true,
      blurb: 'Seventeen races race for the empty throne of Mecatol Rex: expand, research, trade, fight and sway the Galactic Council.',
      players: '1–6', minutes: 240, art: '#3d6fd8',
      /* Action cards, secrets and promissory notes are hidden, and a turn is a
         system, ships, builds and hits — no card kind. Must match GAME_PHONE
         in server/server.js. */
      phone: '/game/ti4/controller.html' },
    { id: 'forbiddenstars', name: 'Forbidden Stars', ready: true,
      blurb: 'Space Marines, Chaos, Eldar and Orks fight over the lost worlds of the Herakon Cluster: stack secret orders, buy armies, and win battles with dice and combat cards.',
      players: '1–4', minutes: 150, art: '#b0426e',
      /* Order tokens and combat hands are hidden, and a turn is an order on a
         system, units moved or bought, a card in battle — no card kind. Must
         match GAME_PHONE in server/server.js. */
      phone: '/game/forbiddenstars/controller.html' },
    { id: 'oath', name: 'Oath', ready: true,
      blurb: 'Chronicles of Empire and Exile: the Chancellor holds the land, the Exiles want it — as the Usurper, or by making a Vision come true. New to it? Pick How to play in the lobby.',
      players: '1–6', minutes: 150, art: '#8c4fc4',
      /* Face-down advisers, search draws and peeked relics are secret, and a
         turn is six major actions with modifiers and battle plans — no card
         kind. Must match GAME_PHONE in server/server.js. */
      phone: '/game/oath/controller.html' },
    { id: 'radlands', name: 'Radlands', ready: true,
      blurb: 'A two-player duel in the wasteland: guard three camps with people, tick events down, raid — and burn all three of theirs.',
      players: '1–2', minutes: 30, art: '#ff4fb3',
      /* A hand of cards is secret, and a turn is a person into a column, an
         event into the queue, a junk or an ability — no card kind. Must
         match GAME_PHONE in server/server.js. */
      phone: '/game/radlands/controller.html' },
    { id: 'zeds', name: 'Dawn of the Zeds', ready: true,
      blurb: 'Co-op zombie defence: hold Farmingdale’s Town Center against five roads of Zeds until dawn. The Basic Game or Outbreak!',
      players: '1–4', minutes: 60, art: '#d23c3c',
      /* Nothing is secret but the decks, and an Action Phase is every phone
         picking a unit and what it does at once — no card kind. Must match
         GAME_PHONE in server/server.js. */
      phone: '/game/zeds/controller.html' },
    { id: 'gwent', name: 'Gwent', ready: true,
      blurb: 'The Witcher’s card game: two out of three rounds, two gems each. Pick a faction and a leader, build a deck, and win with fewer cards.',
      players: '1–2', minutes: 25, art: '#e0b456',
      /* A hand is secret, there is a deck to build, and a turn is a card, a
         row, a decoy's target or a leader — no card kind. Must match
         GAME_PHONE in server/server.js. */
      phone: '/game/gwent/controller.html' },
    { id: '1960', name: '1960: The Making of the President', ready: true,
      blurb: 'Kennedy against Nixon: nine weeks of cards, cubes and campaign trails, the televised Debates, and Election Day. 269 electoral votes wins.',
      players: '1–2', minutes: 90, art: '#3e7bfa',
      /* A hand and the Campaign Strategy stack are secret, and a turn is a
         card as an event or for CP (Campaigning, Advertising, Positioning),
         a trigger or a debate card — no card kind. Must match GAME_PHONE in
         server/server.js. */
      phone: '/game/1960/controller.html' },
    { id: 'gtr', name: 'Glory to Rome', ready: true,
      blurb: 'Rebuild Rome after the fire: lead the roles, hire clients, raise buildings and fill your Vault. Republic or Imperium, and the Geek cards.',
      players: '1–5', minutes: 75, art: '#c9a84c',
      /* A hand and a Vault are secret, and a turn is a lead and a run of
         actions off a menu — no card kind. Must match GAME_PHONE in
         server/server.js. */
      phone: '/game/gtr/controller.html' },
    { id: 'kemet', name: 'Kemet', ready: true,
      blurb: 'Gods of Egypt at war: pray, raise pyramids, buy powers and monsters, and march on the temples. First to 9 Fame.',
      players: '1–5', minutes: 90, art: '#e0b24a',
      /* Divine Intervention and battle cards are secret, and a turn is an
         action token, a march, a recruit or a tile; a battle is two cards
         chosen at once — no card kind. Must match GAME_PHONE in
         server/server.js. */
      phone: '/game/kemet/controller.html' },
    { id: 'netrunner', name: 'Netrunner', ready: true,
      blurb: 'A megacorp guards its agendas behind ice; a runner breaks in to steal them. Corp v Runner, the Core Set — or one phone against the house.',
      players: '1–2', minutes: 45, art: '#4fc3ff',
      /* Hands and face-down cards are secret, a turn is clicks off a menu and
         a run is ice met one at a time — no card kind. Must match GAME_PHONE
         in server/server.js. */
      phone: '/game/netrunner/controller.html' },
    { id: 'gloomhaven', name: 'Gloomhaven', ready: true,
      blurb: 'A mercenary company in a dark city: two cards a turn, monsters that think for themselves, and a campaign that remembers. The six starting classes; one phone and the house, or a party of four.',
      players: '1–4', minutes: 120, art: '#d9a845',
      /* A hand of cards chosen in secret, a battle goal, and a turn that is
         moves and attacks on a hex map — no card kind. Must match GAME_PHONE
         in server/server.js. */
      phone: '/game/gloomhaven/controller.html' },
    { id: 'words', name: 'Countdown', ready: false,
      blurb: 'Letters, numbers, and a very famous clock.',
      players: '2', minutes: 20, art: '#30a46c' },
    { id: 'chase', name: 'The Chase', ready: false,
      blurb: 'Outrun the chaser down the board.',
      players: '2–4', minutes: 25, art: '#e5484d' },
    { id: 'wheel', name: 'Wheel of Fortune', ready: false,
      blurb: 'Spin, buy a vowel, solve the puzzle.',
      players: '3', minutes: 20, art: '#8e4ec6' },
    { id: 'lingo', name: 'Lingo', ready: false,
      blurb: 'Five letters, five guesses, then the balls.',
      players: '2–4', minutes: 15, art: '#f76b15' },
    { id: 'jeopardy', name: 'Jeopardy', ready: false,
      blurb: 'Answers in the form of a question. Wager it all.',
      players: '3', minutes: 30, art: '#00b4d8' }
  ],

  game: id => Hub.games.find(g => g.id === id) || null
};
root.Hub = Hub;

/* ---------- socket ---------- */

const live = () => Hub.sock && Hub.sock.readyState === 1;
Hub.live = live;

/* Which browser tab this is. Kept in sessionStorage so it survives the tab's
   own walk from the menu to a game and back, which is how the server tells
   "the telly moving to the next page" from "some other tab grabbing the room". */
Hub.tab = (function () {
  const fresh = () => Math.random().toString(36).slice(2, 12);
  try {
    let t = sessionStorage.getItem('hubTab');
    if (!t) { t = fresh(); sessionStorage.setItem('hubTab', t); }
    return t;
  } catch (e) { return fresh(); }
})();

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/* Has this page ever been the display? */
Hub.held = false;

Hub.connect = function (role, opts) {
  Hub.role = role || 'host';
  const force = !!(opts && opts.force);
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  // The headless tests inject a fake socket here; nothing else uses it.
  Hub.sock = Hub.makeSocket
    ? Hub.makeSocket()
    : new WebSocket(proto + location.host + '/ws');

  Hub.sock.onopen = () => {
    Hub.retry = 0;
    /* A display that is only *reconnecting*, or is sitting in a background
     * tab, asks to be the display on standby: the server says no if another
     * screen already has the room.
     *
     * Without this, an old game tab left open from last night reconnects the
     * moment the host starts, and if it lands a beat after the menu it evicts
     * the menu and walks every phone onto that game's handset. From the sofa
     * that reads as "Start Gameshow Hub opens Dead of Winter". A page somebody
     * has just opened and is looking at still takes over, as it always did. */
    const standby = Hub.role === 'host' && !force && (Hub.held || hidden());
    Hub.sock.send(JSON.stringify({ t: 'hello', role: Hub.role, tab: Hub.tab, standby }));
    if (Hub.onLost) Hub.onLost(false);
  };
  Hub.sock.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    onMessage(m);
  };
  Hub.sock.onclose = (ev) => {
    /* Some closes are the server's decision and must NOT be argued with.
     *
     * Opening a second telly makes the server close the first one — reasonable,
     * you are moving the game to another screen. But this handler used to
     * reconnect regardless, so the first display came straight back and evicted
     * the second, which reconnected and evicted the first, for ever. Two tabs
     * on one hub is not a rare thing to do while testing, and the symptom is
     * not "two tellies": it is phones receiving alternating lobby-and-game
     * broadcasts from the pair of them, night prompts being wiped a moment
     * after they arrive, and a game that stalls for no visible reason.
     *
     * 4003 is a display being replaced; 4006 is a standby display told that
     * another screen has the room; 4001 is a player the host removed. None of
     * them should come back on its own. */
    const code = ev && ev.code;
    if (code === 4003 || code === 4006 || code === 4001) {
      Hub.evicted = (ev && ev.reason) || 'closed by the host';
      if (Hub.onEvicted) Hub.onEvicted(Hub.evicted, code);
      else if (Hub.onLost) Hub.onLost(true);
      if (Hub.role === 'host') Hub.standbyOverlay(true, code);
      return;
    }
    // A server restart mid-round should not cost the round.
    Hub.retry = Math.min(Hub.retry + 1, 10);
    setTimeout(() => Hub.connect(Hub.role), 400 * Hub.retry);
    if (Hub.onLost) Hub.onLost(true);
  };
};

Hub.toPlayer = function (id, msg) {
  if (live()) Hub.sock.send(JSON.stringify({ t: 'to', id, msg }));
};

Hub.toAll = function (msg) {
  if (live()) Hub.sock.send(JSON.stringify({ t: 'all', msg }));
};

/* A running total to sit in the corner of every phone, whatever card is up. */
Hub.bank = function (id, text) { Hub.toPlayer(id, { t: 'bank', text }); };

/* A nudge that does not disturb the card underneath: right, wrong, you're next. */
Hub.flash = function (id, text, tone, buzz) {
  Hub.toPlayer(id, { t: 'flash', text, tone, buzz });
};

function onMessage(m) {
  if (m.t === 'hello-ok') {
    // The display may be open on http://localhost, where location.host is the
    // wrong thing to put on the TV. The server knows the LAN address.
    if (m.joinUrl) Hub.joinUrl = m.joinUrl;
    Hub.joinAlts = m.joinAlts || [];
    if (Hub.role === 'host') {
      Hub.held = true;
      Hub.evicted = null;
      Hub.standbyOverlay(false);
      Hub.claimPhones();
    }
    if (Hub.onHello) Hub.onHello(m);
    Hub.fetchDiag();
    return;
  }
  if (m.t === 'players') { syncSeats(m.list); return; }
  /* A seat arriving or coming back. `players` follows and does the bookkeeping;
     what this is for is that whatever was in that phone's hand needs putting
     back into it — a handset that reloaded has a live socket and a blank
     screen, and the host does not otherwise find out. */
  if (m.t === 'join' || m.t === 'rejoin') {
    /* `claimPhones` only reaches phones that were connected when this page
       said hello. One that turns up later may still be on another game's
       handset, waiting for a telly that is not coming. Quiet, so a phone that
       is already in the right place keeps whatever card it is holding. */
    if (Hub.role === 'host') Hub.toPlayer(m.id, Object.assign(Hub.phoneOrder(Hub.here()), { quiet: true }));
    if (Hub.onRejoin) Hub.onRejoin(m.id);
    return;
  }
  if (m.t === 'left') return;
  if (m.t === 'input' && Hub.onInput) Hub.onInput(m.from, m.msg);
}

/* ---------- seats ---------- */

const seat = id => Hub.seats.find(s => s.id === id);
Hub.seat = seat;

/* Seats mirror the server's lobby. A seat mid-game keeps whatever the game
   hung on it even while its phone is away reconnecting, so anything the game
   put on the seat is never thrown away here — only the game decides when a
   player's state is stale. */
function syncSeats(list) {
  const fresh = [];
  for (const p of list) {
    let s = seat(p.id);
    if (!s) {
      s = { id: p.id };
      Hub.seats.push(s);
      fresh.push(s);
    }
    s.name = p.name;
    s.hex = p.hex;
    s.color = p.color;
    s.avatar = p.avatar || null;     // shared/avatar.js; the shirt is s.color
    s.connected = p.connected;
    s.idleMs = p.idleMs || 0;
    if (p.connected) s.pruned = false;   // came back before the kick landed
  }
  const ids = new Set(list.map(p => p.id));
  Hub.seats = Hub.seats.filter(s => ids.has(s.id));
  if (Hub.onPlayers) Hub.onPlayers(Hub.seats, fresh);
}
Hub.syncSeats = syncSeats;

Hub.kick = function (id) { if (live()) Hub.sock.send(JSON.stringify({ t: 'kick', id })); };
Hub.kickAll = function () { if (live()) Hub.sock.send(JSON.stringify({ t: 'kickAll' })); };

/* Drop seats whose phone left and never came back.
 *
 * A seat is deliberately kept when a phone disconnects, because a locked
 * screen should not cost you your game. But between games that rule quietly
 * accumulates a seat for every browser that ever opened the page. Games call
 * this only while nothing is in progress. The `pruned` flag matters because
 * the seat does not vanish until the server answers, and without it every
 * repaint would fire another kick at the same player. */
Hub.STALE_MS = 60000;
Hub.pruneStale = function () {
  const gone = Hub.seats.filter(s =>
    !s.connected && !s.pruned && (s.idleMs || 0) > Hub.STALE_MS);
  for (const s of gone) { s.pruned = true; Hub.kick(s.id); }
  return gone.length;
};

/* Seats that can actually play right now. A game should never deal a round to
   a phone that is not there. */
Hub.playing = () => Hub.seats.filter(s => s.connected);

/* ---------- what the host can see about its own reachability ---------- */

Hub.fetchDiag = function () {
  // Absent under jsdom, and meaningless from file:// where there is no host.
  if (typeof fetch !== 'function') return;
  fetch('/diag', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => {
      Hub.diag = d;
      if (d.joinUrl) Hub.joinUrl = d.joinUrl;
      if (Hub.onDiag) Hub.onDiag(d);
    })
    .catch(() => { /* opened from file://, or the host is gone */ });
};

/* ---------- shared bits of UI ---------- */

Hub.esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

Hub.money = n => '£' + Math.round(Number(n) || 0).toLocaleString('en-GB');

/* A join panel any game page can put up when the lobby is empty.
 *
 * Locking the game tiles until somebody joined turned a connection problem
 * into a dead end: with no phone through, the menu would not even let you open
 * a game to see it. Every game can get people in by itself. */
Hub.joinOverlay = function (show, note) {
  let el = document.getElementById('hubJoin');
  if (!show) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'hubJoin';
    el.innerHTML =
      '<style>' +
      '#hubJoin{position:fixed;inset:0;z-index:70;background:rgba(6,10,24,.97);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:20px;text-align:center;padding:5vh 4vw;color:#eef2ff;' +
      'font:16px/1.45 ui-rounded,-apple-system,"Segoe UI",system-ui,sans-serif}' +
      '#hubJoin h2{font-size:min(4vw,40px);margin:0}' +
      '#hubJoin img{width:min(26vw,260px);background:#fff;padding:10px;border-radius:14px}' +
      '#hubJoin .u{font-size:min(3vw,28px);font-weight:700;background:#141b33;' +
      'border:2px solid #f5c542;border-radius:14px;padding:10px 18px;word-break:break-all}' +
      '#hubJoin .n{color:#93a0c8;max-width:54ch;font-size:min(1.8vw,16px)}' +
      '#hubJoin button{font:inherit;font-size:min(2vw,18px);font-weight:700;' +
      'background:transparent;border:1px solid #2a3459;color:#93a0c8;' +
      'border-radius:12px;padding:11px 22px;cursor:pointer}' +
      '</style>' +
      '<h2>Nobody has joined yet</h2>' +
      '<img id="hubJoinQr" alt="Scan to join">' +
      '<div class="u" id="hubJoinUrl"></div>' +
      '<p class="n" id="hubJoinNote"></p>' +
      '<button id="hubJoinBack">Back to the menu</button>';
    document.body.appendChild(el);
    el.querySelector('#hubJoinBack').onclick = () => Hub.goto(null);
  }
  el.querySelector('#hubJoinQr').src = '/qr?text=' + encodeURIComponent(Hub.joinUrl || '');
  el.querySelector('#hubJoinUrl').textContent = Hub.joinUrl || 'host not running';
  el.querySelector('#hubJoinNote').textContent = note ||
    'Point a phone camera at the code. Everyone must be on the same wifi, and ' +
    'the phone will warn that the certificate is not trusted — that is expected.';
};

/* The screen a display shows when it is not the display.
 *
 * Before this, a menu that had been pushed aside said "Host connection lost —
 * retrying" and never retried, which left no way back short of finding and
 * closing whichever other tab had the room. */
Hub.standbyOverlay = function (show, code) {
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('hubStandby');
  if (!show) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'hubStandby';
    el.innerHTML =
      '<style>' +
      '#hubStandby{position:fixed;inset:0;z-index:90;background:rgba(6,10,24,.96);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:18px;text-align:center;padding:5vh 4vw;color:#eef2ff;' +
      'font:16px/1.45 ui-rounded,-apple-system,"Segoe UI",system-ui,sans-serif}' +
      '#hubStandby h2{font-size:min(4vw,40px);margin:0}' +
      '#hubStandby p{color:#93a0c8;max-width:56ch;font-size:min(2vw,18px);margin:0}' +
      '#hubStandby button{font:inherit;font-size:min(2.4vw,22px);font-weight:700;' +
      'background:#f5c542;border:0;color:#0b1020;border-radius:14px;' +
      'padding:14px 28px;cursor:pointer}' +
      '</style>' +
      '<h2 id="hubStandbyTitle"></h2>' +
      '<p id="hubStandbyBody"></p>' +
      '<button id="hubStandbyTake">Use this screen</button>';
    document.body.appendChild(el);
    el.querySelector('#hubStandbyTake').onclick = () => Hub.takeOver();
  }
  el.querySelector('#hubStandbyTitle').textContent = code === 4003
    ? 'Another screen took over'
    : 'Another screen has the room';
  el.querySelector('#hubStandbyBody').textContent = code === 4003
    ? 'The hub was opened somewhere else, so the phones went with it. ' +
      'If that was an old tab, close it and press the button.'
    : 'Another tab or screen is already showing the hub, so this one stepped ' +
      'aside rather than take the phones away from it. If this is the screen ' +
      'you want, press the button — and close the other tab.';
};

/* Become the display, whoever has it now. */
Hub.takeOver = function () {
  if (!Hub.evicted) return;       // still connected; nothing to take
  Hub.evicted = null;
  Hub.standbyOverlay(false);
  Hub.retry = 0;
  Hub.connect(Hub.role, { force: true });
};

/* A page that stood aside only because it opened in a background tab, and has
   now been brought to the front, is the one somebody wants to look at. */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (Hub.role === 'host' && Hub.evicted && !Hub.held && !hidden()) Hub.takeOver();
  });
}

/* Navigate the display to a game, or back to the menu. Separate pages rather
   than one swapping app: each game stays a self-contained file, and the seats
   survive the trip because they live on the server.
 *
 * The room's phones are walked at the same time. Almost every game asks the
 * handset for one of the seven card kinds, so the phone stays on `/` all
 * evening and this is a no-op. A game with `phone` set brings its own screen
 * because it wants a gesture the cards have no shape for — golf wants a
 * swing — and the room has to be moved to it and moved back afterwards.
 * Nobody should have to re-scan a QR code halfway through the night.
 *
 * The seat is untouched either way: both handset pages send the identical
 * `hello` with the same stored token, so a phone lands back in the seat,
 * name and colour it already had. */
Hub.goto = function (gameId) {
  const jump = () => { location.href = gameId ? ('/game/' + gameId) : '/hub'; };
  if (!live()) { jump(); return; }
  Hub.toAll(Hub.phoneOrder(gameId ? Hub.game(gameId) : null));
  /* Navigating closes this socket, and a message still in the send buffer
     goes with it. One tick is enough to get it onto the wire. */
  setTimeout(jump, 150);
};

/* Where the room's phones belong, given a game (or null for the menu).
 *
 * The `title`/`body` are for a phone that is staying where it is. A game
 * played on the telly alone would otherwise leave the room holding "someone
 * is picking the next game" for the whole of it, which reads as a hub that
 * has lost track of itself. */
Hub.phoneOrder = function (g) {
  return {
    t: 'goto',
    url: (g && g.phone) || '/',
    title: g ? g.name : 'At the menu',
    body: g
      ? (g.phone ? 'Getting your controls up…' : 'This one is played on the telly. Sit back.')
      : 'Someone on the telly is picking the next game.'
  };
};

/* Which game this display is showing, worked out from its own URL. */
Hub.here = function () {
  const m = /^\/game\/([a-z0-9-]+)(\/|$)/.exec(location.pathname);
  return m ? Hub.game(m[1]) : null;
};

/* Claim the room's handsets for whatever this page is.
 *
 * `Hub.goto` walks everyone when a game is picked off the menu, which covers
 * the happy path and nothing else. A display also arrives by a typed URL, by
 * a refresh, by the back button, or by the host being restarted halfway
 * through an evening — and then the room is holding a buzzer while the telly
 * waits for a swing, or holding a golf club at a quiz. That is not a rare
 * case; a refresh is the first thing anyone does when a screen looks stuck.
 *
 * So every host page claims its handsets the moment it connects, and the menu
 * claims them back. Harmless to send twice over: a phone ignores a hop to
 * where it already is. */
Hub.claimPhones = function () { Hub.toAll(Hub.phoneOrder(Hub.here())); };

})(typeof window !== 'undefined' ? window : globalThis);
