'use strict';
/* Nations — the log, said out loud.
 *
 * The telly's crier and log, the phone's "since your last turn" and the
 * round card are all built here from the PUBLIC log, so every screen says
 * the same thing. A move is one line: what the nation chose with everything
 * it caused folded in behind it ("Ada buys the Hoplite for 2 gold — +3
 * food"), because the engine logs consequences straight after the choice.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nations-data.js') : root.NationsData;
  const VERSION = 3;
  const ROMAN = D.ROMAN;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAME = { gold: 'gold', stone: 'stone', food: 'food', book: 'books', vp: 'VP', stab: 'stability', str: 'strength' };
  const ORDER = ['vp', 'gold', 'stone', 'food', 'book'];
  const HEAD = { buy: 1, deploy: 1, hire: 1, special: 1, pass: 1, skip: 1, growth: 1, worker: 1, nation: 1, turmoil: 1, explore: 1 };
  const TABLE = { round: 1, event: 1, war: 1, books: 1, over: 1, hurried: 1, nowait: 1, start: 1, resolution: 1 };

  function ctx(src) {
    const names = {};
    for (const p of (src.players || [])) names[p.id] = p.name;
    const C = id => { if (id === 'nation') return 'their nation'; const c = D.card(id); return c ? c.name : 'a card'; };
    return { P: id => names[id] || '?', C };
  }
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const REMOVED_WHY = { leastStab: 'the least stable', leastStr: 'the weakest', milWorker: 'a worker on military', defeated: 'defeated in the War', tower: 'the Porcelain Tower is gone', event: '',
    stabOver2: 'above 2 stability', uncletom: 'Uncle Tom’s Cabin', dynasty: 'the old dynasty’s', noRoom: 'no wonder space for it', replaced: 'replaced' };
  const SPECIAL_SAYS = {
    alhazen: () => ' to swap two cards on the board', lincoln: () => ' to take a worker', suleiman: () => ' to take a worker',
    tesla: e => ' and rolls ' + e.roll + ' — +' + e.roll + ' strength this round', duchy: () => ' to skip a turn',
    uppsala: () => ' — +3 strength this round', shwedagon: () => ' — +1 stability this round', romanrep: () => ' — an architect for +1 stability this round',
    qin: () => ': a worker goes home and a wonder section is built free', demrep: (e, x) => ': ' + (e.hit || []).map(x.P).join(' and ') + ' must change dynasty',
    joseon: e => ' to store ' + Object.keys(e.stored || {}).map(r => e.stored[r] + ' ' + NAME[r]).join(''),
    oldkingdom: (e, x) => ', giving up ' + x.C(e.advisor), maliempire: (e, x) => ', giving up ' + x.C(e.advisor)
  };

  function headText(x, e) {
    const who = x.P(e.by);
    switch (e.t) {
      case 'buy': {
        const c = D.card(e.card);
        let s = who + ' buys ' + x.C(e.card) + (e.price ? ' for ' + e.price + ' gold' : ' for nothing');
        if (c && c.type === 'war') s = who + ' declares ' + x.C(e.card) + ' at strength ' + e.str + (e.price ? ' (' + e.price + ' gold)' : '') + (e.leon ? ', raiding ' + e.n + ' ' + NAME[e.pick] : '');
        if (c && c.type === 'battle') s += ', raiding ' + e.n + ' ' + NAME[e.pick];
        if (c && c.type === 'natural') s += ' to explore';
        if (c && c.type === 'golden' && e.pick === 'vp') s += ' and pays for a VP';
        if (c && c.type === 'golden' && e.alt) s += ({ arabian: ' — books each time play passes them this round', levite: ' — 3 more architects', uncletom: ' — buildings that cost 1 stone to staff go, everybody’s', powergrid: ' — the board refilled', antikythera: ' — turning up the next age' })[e.alt] || '';
        if (e.emperor) s += ' — the Emperor takes it (+1 strength)';
        if (e.discarded) s += ' and lets it go';
        if (e.onWonder) s += ' into a wonder space';
        if (e.kept) s += ' — Zhu Xi stays on';
        if (e.toll) s += ' (+' + e.toll.n + ' gold to ' + x.P(e.toll.to) + ')';
        if (e.replaced) s += ', over ' + x.C(e.replaced);
        return s;
      }
      case 'deploy': return who + (e.free ? ' puts a worker on ' + x.C(e.card) + ' for free' : ' puts a worker on ' + x.C(e.card) + (e.cost ? ' (' + e.cost + ' stone)' : ''));
      case 'hire': return who + (e.src === 'free' ? ' builds a section of ' : ' hires an architect for ') + x.C(e.card) + ' — ' + e.built + ' of ' + e.of + (e.cost ? ' (' + e.cost + ' stone)' : '');
      case 'special':
        if (e.act === 'chopin' || e.act === 'plcbuy') return who + ' buys ' + x.C(e.card) + ' from ' + x.P(e.from) + (e.replaced ? ', over ' + x.C(e.replaced) : '');
        if (e.act === 'turk') return who + ' gives ' + x.C(e.card) + ' to ' + x.P(e.to);
        return who + ' uses ' + x.C(e.card) + (SPECIAL_SAYS[e.act] ? SPECIAL_SAYS[e.act](e, x) : e.act === 'bolivar' ? ' and gives up ' + x.C(e.colony) : '');
      case 'turmoil': return who + ' takes a Turmoil card' + (e.forced ? ' (' + e.forced + ')' : '') + (e.dyn ? ' and plays ' + x.C(e.dyn) : ' and 2 gold' + (e.discarded ? ' — the Sassanids send it straight back' : ''));
      case 'explore': return who + ' explores ' + x.C(e.card) + ' — ' + e.built + ' of ' + e.of;
      case 'pass': return who + ' passes' + (e.k === 1 ? ' first' : '');
      case 'skip': return e.extra ? who + ' lets the extra action go' : who + '’s first turn is skipped';
      case 'growth': return who + ' takes ' + e.n + ' ' + NAME[e.res];
      case 'worker': return who + ' grows' + (e.section === 'food' ? ' (a worker off the Food track)' : e.section === 'stab' ? ' (a worker off the Stability track)' : e.section === 'str' ? ' (a worker off the Strength track)' : e.section === 'free' ? ' (a worker with no upkeep)' : '');
      case 'nation': return who + ' will play ' + (D.NATIONS.find(n => n.id === e.nation) || {}).name + ' (' + e.side + ' side)';
    }
    return null;
  }
  function clauseText(x, e) {
    switch (e.t) {
      case 'ready': return x.C(e.card) + ' is finished';
      case 'covered': return 'it covers ' + x.C(e.card);
      case 'removed': return 'loses ' + x.C(e.card) + (REMOVED_WHY[e.why] ? ' (' + REMOVED_WHY[e.why] + ')' : '');
      case 'short': return 'runs short of ' + NAME[e.res];
      case 'spared': return e.why === 'greatwall' ? 'the Great Wall spares the VP' : e.why === 'edo' ? 'is defeated, but the Edo Period loses nothing' : 'Florence Nightingale spares the VP';
      case 'versailles': return 'is least stable for the rest of the round';
      case 'undeploy': return e.moving ? null : 'takes a worker off ' + x.C(e.card);
      case 'returned': return 'returns a worker to the population track';
      case 'archLost': return 'loses an architect off ' + x.C(e.card);
      case 'discovered': return 'discovers ' + x.C(e.card);
      case 'dynasty': return 'now rules as the ' + x.C(e.dyn);
      case 'spaceCovered': return 'the dynasty card covers a ' + (e.kind === 'bm' ? 'building/military' : 'colony') + ' space' + (e.card ? ' (' + x.C(e.card) + ' goes)' : '');
      case 'victoria': return 'Victoria Falls turns up ' + e.n + ' cards: ' + (e.colonies.length ? e.colonies.map(x.C).join(', ') + ' make a fourth row, 4 gold each' : 'not one colony');
      case 'moreActions': return x.C(e.card) + ' gives ' + e.n + ' more actions';
      case 'tempStr': return '+' + e.n + ' strength this round';
      case 'newSpace': return 'gains a building/military space';
      case 'tokenLost': return 'the defeat costs the Old Kingdom a token';
      case 'noUpkeep': return 'no military upkeep this round';
      case 'freeCard': return 'takes ' + x.C(e.card) + ' free (' + e.why + ')';
      case 'placed': return 'puts it in space ' + (e.slot + 1);
      case 'gaAlt': return x.C(e.card) + ' does its own thing';
      case 'axumite': return 'marks ' + x.C(e.card) + ' — 3 gold to them if anybody else buys it';
      case 'jagiello': return 'pays ' + x.P(e.to) + ' 1 gold for an action before everybody';
      case 'vikingTax': return 'takes a levy: everybody else loses 1 ' + NAME[e.res];
    }
    return null;
  }
  function tableText(x, e) {
    switch (e.t) {
      case 'start': return 'The nations take their places. ' + x.P(e.order[0]) + ' goes first.';
      case 'round': return (e.n % 2 ? 'The ' + D.AGE_NAME[e.age] + ' age begins. ' : '') + 'Round ' + e.n + ' of 8: growth.';
      case 'event': {
        const ev = D.event(e.ev);
        return 'This round’s event' + (ev.b ? 's: ' + ev.a.name + ' and ' + ev.b.name : ': ' + ev.a.name) + ' · famine ' + ev.famine + ' food' + (e.chosenBy ? ' (' + x.P(e.chosenBy) + ' chose)' : '');
      }
      case 'resolution': return 'Everybody has passed. Production, the War and the events.';
      case 'war': return e.none ? 'No War this round.' : 'The War: ' + x.C(e.card) + ' at strength ' + e.str + (e.defeated.length ? ' — ' + e.defeated.map(x.P).join(', ') + ' defeated.' : ' — nobody is defeated.');
      case 'books': return 'End of ' + D.AGE_NAME[e.age] + ': ' + e.rows.filter(r => r.vp).map(r => x.P(r.id) + ' +' + r.vp + ' VP').join(', ') + ' for books.';
      case 'over': return 'The game is over.';
      case 'hurried': return 'The table stopped waiting for ' + (e.who || []).map(x.P).join(' and ') + '.';
      case 'nowait': return 'The table went on without ' + (e.who || []).map(x.P).join(' and ') + ' reading the round card.';
    }
    return null;
  }

  /* The log as lines, oldest first. `base` is the absolute position of
     events[0]. A line: { i, by, t, head, gains, bits, table }. */
  function lines(events, src, base) {
    const x = ctx(src);
    const out = [];
    let open = null;
    (events || []).forEach((e, k) => {
      const i = (base || 0) + k;
      if (TABLE[e.t]) {
        const text = tableText(x, e);
        if (text) out.push({ i, by: null, t: e.t, head: text, gains: {}, bits: [], table: true });
        open = null;
        return;
      }
      if (HEAD[e.t]) {
        open = { i, by: e.by, t: e.t, head: headText(x, e), gains: {}, bits: [] };
        out.push(open);
        if (e.t === 'special' && e.gain) addGains(open, e.gain);
        if (e.t === 'buy' && e.gain) addGains(open, e.gain);
        if (e.t === 'buy' && e.pick && e.n) addGains(open, { [e.pick]: e.n });
        return;
      }
      if (e.t === 'gain' && e.why === 'event') {
        /* An event's outcome, one line per event and nation. */
        const key = 'ev:' + e.name + ':' + e.by;
        if (!open || open.key !== key) { open = { i, by: e.by, t: 'event', key, head: e.name + ': ' + x.P(e.by), gains: {}, bits: [], bare: true }; out.push(open); }
        addGains(open, e.res);
        return;
      }
      if (e.t === 'gain') {
        if (!open || open.by !== e.by) { open = { i, by: e.by, t: 'gain', head: x.P(e.by) + (e.card ? ' (' + x.C(e.card) + ')' : ''), gains: {}, bits: [], bare: true }; out.push(open); }
        addGains(open, e.res);
        return;
      }
      if (e.t === 'short' && !(open && open.by === e.by && open.t !== 'short' && HEAD[open.t])) {
        /* Running short in the resolution phase: one line a nation. */
        const key = 'short:' + e.by + ':' + e.round;
        if (!open || open.key !== key) { open = { i, by: e.by, t: 'short', key, head: x.P(e.by) + ' runs short of', res: [], gains: {}, bits: [], shortLine: true }; out.push(open); }
        open.res.push(NAME[e.res]);
        open.head = x.P(e.by) + ' runs short of ' + open.res.join(', ').replace(/, ([^,]*)$/, ' and $1') + ' — a VP for each';
        return;
      }
      if (e.t === 'defeat') {
        out.push(open = { i, by: e.by, t: 'defeat', head: x.P(e.by) + ' is defeated (' + e.str + ' against ' + e.need + ')', gains: {}, bits: [], bare: true });
        addGains(open, e.got);
        return;
      }
      if (e.t === 'revolt') {
        out.push(open = { i, by: e.by, t: 'revolt', head: x.P(e.by) + ' is in revolt' + (e.str != null ? ' (strength below 0)' : ''), gains: {}, bits: [], bare: true });
        addGains(open, e.got);
        return;
      }
      const clause = clauseText(x, e);
      if (!clause) return;
      if (open && open.by === e.by && !open.table) { open.bits.push(clause); return; }
      open = { i, by: e.by, t: e.t, head: x.P(e.by) + ' ' + clause, gains: {}, bits: [] };
      out.push(open);
    });
    return out;
  }
  function addGains(line, res) { for (const r in (res || {})) if (res[r]) line.gains[r] = (line.gains[r] || 0) + res[r]; }

  function render(line, icon) {
    const head = icon ? esc(line.head) : line.head;
    if (line.table) return head;
    const keys = ORDER.filter(k => line.gains[k]);
    const gained = icon
      ? keys.map(k => '<span class="wg' + (line.gains[k] < 0 ? ' neg' : '') + '">' + (line.gains[k] > 0 ? '+' : '−') + Math.abs(line.gains[k]) + icon(k) + '</span>')
      : keys.map(k => (line.gains[k] > 0 ? '+' : '−') + Math.abs(line.gains[k]) + ' ' + NAME[k]);
    const bits = line.bits.map(b => icon ? esc(b) : b);
    const parts = (gained.length ? [gained.join(icon ? ' ' : ', ')] : []).concat(bits);
    if (line.bare) return head + (parts.length ? ' ' + parts.join(', ') : ' — nothing') + '.';
    return head + (parts.length ? ' — ' + parts.join(', ') : '') + '.';
  }
  const text = line => render(line, null);
  const html = (line, A) => render(line, k => A.res(k, '1.05em'));

  /* ================================================================
     The round card, built by the telly from one round's log and shown on
     every screen: what production, the War, the events and the famine did
     to each nation, and what comes next.
     ================================================================ */
  function roundCard(events, pub, before) {
    const x = ctx(pub);
    const card = { round: 0, age: 0, players: [], prod: [], war: null, events: [], famine: [], books: null, order: pub.order.slice(), next: null, over: pub.phase === 'over' };
    for (const e of events) {
      if (e.t === 'produced') card.prod.push({ id: e.by, got: e.got });
      if (e.t === 'revolt') card.prod.push({ id: e.by, got: e.got, revolt: e.stab });
      if (e.t === 'war') card.war = e.none ? { none: true } : { card: e.card, str: e.str, by: e.by, defeated: [] };
      if (e.t === 'defeat') (card.warLoss = card.warLoss || []).push({ id: e.by, got: e.got, str: e.str });
      if (e.t === 'gain' && e.why === 'event') {
        let row = card.events.find(r => r.name === e.name);
        if (!row) card.events.push(row = { name: e.name, who: {} });
        const w = row.who[e.by] = row.who[e.by] || {};
        for (const r in e.res) w[r] = (w[r] || 0) + e.res[r];
      }
      if (e.t === 'fx') { if (!card.events.find(r => r.name === e.name)) card.events.push({ name: e.name, who: {} }); }
      if (e.t === 'moved') { const row = card.events.find(r => r.name === e.name); if (row) row.moved = { who: e.who, where: e.where }; }
      if (e.t === 'removed' && e.why === 'event') { const row = card.events.find(r => r.name === e.name); if (row) (row.lost = row.lost || []).push({ id: e.by, card: e.card }); }
      if (e.t === 'famine') card.famine.push({ id: e.by, got: e.got });
      if (e.t === 'books') card.books = { age: e.age, rows: e.rows };
      if (e.t === 'order') card.orderChange = { before: e.before, after: e.after, frozen: !!e.frozen };
      if (e.t === 'roundEnd') card.round = e.n;
    }
    card.age = Math.ceil(card.round / 2);
    /* The event is still the round's own when the card is built: the next
       one is drawn only after growth. */
    card.event = pub.event || null;
    card.players = pub.players.map(p => ({ id: p.id, name: p.name, hex: p.hex, total: p.score.total, vp: p.res.vp, delta: p.res.vp - ((before && before[p.id] != null) ? before[p.id] : p.res.vp) }));
    card.next = card.over ? null : { round: card.round + 1, age: Math.ceil((card.round + 1) / 2), first: pub.order[0] };
    return card;
  }
  function gainsHtml(res, A) {
    const keys = ORDER.filter(k => res && res[k]);
    if (!keys.length) return '<span class="wg">—</span>';
    return keys.map(k => '<span class="wg' + (res[k] < 0 ? ' neg' : '') + '">' + (res[k] > 0 ? '+' : '−') + Math.abs(res[k]) + A.res(k, '1em') + '</span>').join(' ');
  }
  function roundCardHtml(card, pub, A) {
    const x = ctx(pub);
    const P = id => pub.players.find(p => p.id === id) || { name: '?', hex: '#888' };
    const dot = id => '<i class="rc-dot" style="background:' + esc(P(id).hex) + '"></i>';
    const scores = card.players.map(p => '<div class="rc-p"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b>' +
      '<span class="rc-t">' + p.vp + '<small> VP</small></span>' +
      (p.delta ? '<span class="rc-d' + (p.delta < 0 ? ' neg' : '') + '">' + (p.delta > 0 ? '+' : '−') + Math.abs(p.delta) + ' this round</span>' : '') + '</div>').join('');
    const table = (rows, fn) => '<table class="rc-tab">' + rows.map(fn).join('') + '</table>';
    const prod = table(card.prod, r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + (r.revolt != null ? ' <em>in revolt (' + r.revolt + ')</em>' : '') + '</td><td>' + gainsHtml(r.got, A) + '</td></tr>');
    let war;
    if (!card.war || card.war.none) war = '<div class="rc-row">No War was bought this round.</div>';
    else war = '<div class="rc-row"><b>' + esc(x.C(card.war.card)) + '</b>&nbsp;at strength ' + card.war.str + ', declared by ' + esc(P(card.war.by).name) + '.</div>' +
      (card.warLoss && card.warLoss.length ? table(card.warLoss, r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + ' <em>defeated at ' + r.str + '</em></td><td>' + gainsHtml(r.got, A) + '</td></tr>') : '<div class="rc-row">Nobody was weaker than it.</div>');
    const evs = card.events.map(ev => {
      const ids = Object.keys(ev.who).filter(id => Object.keys(ev.who[id]).some(k => ev.who[id][k]));
      const bits = ids.map(id => dot(id) + esc(P(id).name) + ' ' + gainsHtml(ev.who[id], A));
      if (ev.moved) bits.push(ev.moved.who.map(id => esc(P(id).name)).join(', ') + ' go' + (ev.moved.who.length === 1 ? 'es' : '') + ' ' + ev.moved.where);
      for (const l of (ev.lost || [])) bits.push(esc(P(l.id).name) + ' loses ' + esc(x.C(l.card)));
      return '<div class="rc-row"><b>' + esc(ev.name) + ':</b>&nbsp;' + (bits.length ? bits.join(' · ') : 'nobody') + '</div>';
    }).join('');
    const fam = card.famine.filter(r => r.got && Object.keys(r.got).length);
    const famine = fam.length ? table(fam, r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + '</td><td>' + gainsHtml(r.got, A) + '</td></tr>') : '<div class="rc-row">No famine this round.</div>';
    const books = card.books ? '<div class="rc-sec"><h4>End of ' + D.AGE_NAME[card.books.age] + ' — books</h4>' +
      table(card.books.rows.slice().sort((a, b) => b.books - a.books), r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + '</td><td>' + r.books + ' books</td><td>' + (r.vp ? '+' + r.vp + ' VP' : '—') + '</td></tr>') + '</div>' : '';
    const next = card.next ? '<div class="rc-sub">Next: round ' + card.next.round + ' of 8' + (card.next.round % 2 ? ', the ' + D.AGE_NAME[card.next.age] + ' age' : '') +
      ' · player order ' + card.order.map(id => esc(P(id).name)).join(' → ') + '</div>' : '<div class="rc-sub">That was the last round.</div>';
    return '<div class="rc">' +
      '<div class="rc-h">Round ' + card.round + ' is over</div>' + next +
      '<div class="rc-sc">' + scores + '</div>' +
      '<div class="rc-grid">' +
      '<div class="rc-sec"><h4>Production</h4>' + prod + '</div>' +
      '<div class="rc-sec"><h4>The War</h4>' + war + '</div>' +
      '<div class="rc-sec"><h4>The events</h4>' + evs + '</div>' +
      '<div class="rc-sec"><h4>Famine</h4>' + famine + '</div>' +
      '</div>' + books + '</div>';
  }

  /* ================================================================
     The round, one phase at a time (rulebook p.11). Both screens draw the
     same strip from the same answer, so the room always agrees on where the
     round is.
     ================================================================ */
  const PHASES = [
    { id: 'deal', label: 'New cards', group: 'Maintenance' },
    { id: 'growth', label: 'Growth', group: 'Maintenance' },
    { id: 'event', label: 'New event', group: 'Maintenance' },
    { id: 'actions', label: 'Actions', group: 'Actions' },
    { id: 'prod', label: 'Production', group: 'Resolution' },
    { id: 'order', label: 'Player order', group: 'Resolution' },
    { id: 'war', label: 'War', group: 'Resolution' },
    { id: 'events', label: 'Events', group: 'Resolution' },
    { id: 'famine', label: 'Famine', group: 'Resolution' },
    { id: 'books', label: 'Books', group: 'Resolution', ageEnd: true }
  ];
  /* What each step does, in a sentence — said on the telly and the phone as
     the step comes up. */
  const PHASE_SAYS = {
    deal: 'The round marker moves on and the progress board is refilled.',
    growth: 'Everybody at once: take a worker, or a few of one resource.',
    event: 'This round’s event card is turned over. It sets the architects now; the rest happens at the end of the round.',
    actions: 'One action a turn, round the table, until everybody has passed.',
    prod: 'Every nation collects what its board makes — buildings, colonies, wonders, the advisor — and pays its military upkeep. Below 0 stability is a revolt.',
    order: 'The strongest nation goes first next round; a tie goes to the more stable.',
    war: 'Every nation weaker than the War loses what the War card says — its stability soaks some of it up — and 1 VP.',
    events: 'Both events on this round’s card happen now, top then bottom.',
    famine: 'Every nation pays the famine in food. Running short costs a VP and books.',
    books: 'End of the age: 1 VP for every nation with fewer books than you.'
  };
  /* Where the round is. `hold` is what the telly is showing on top (the
     event being turned over, or a page of the round card). */
  function phaseNow(pub, hold) {
    if (hold && hold.kind === 'event') return 'event';
    if (hold && hold.pages) { const pg = hold.pages[hold.page]; return pg === 'summary' ? 'end' : pg; }
    if (!pub) return null;
    if (pub.phase === 'nations') return 'setup';
    if (pub.phase === 'growth') return 'growth';
    if (pub.phase === 'action') return 'actions';
    if (pub.phase === 'over') return 'end';
    if (pub.phase === 'resolution') {
      const log = pub.log || [];
      for (let i = log.length - 1; i >= 0; i--) {
        const t = log[i].t;
        if (t === 'books') return 'books';
        if (t === 'famine') return 'famine';
        if (t === 'fx' || t === 'declined' || t === 'moved' || (t === 'gain' && log[i].why === 'event')) return 'events';
        if (t === 'war' || t === 'defeat') return 'war';
        if (t === 'order') return 'order';
        if (t === 'produced' || t === 'revolt' || t === 'resolution') return 'prod';
      }
      return 'prod';
    }
    return null;
  }
  /* The strip: every step of the round, the ones behind ticked off. */
  function phaseStripHtml(now, round) {
    const list = PHASES.filter(p => !p.ageEnd || round % 2 === 0);
    const at = now === 'end' ? list.length : list.findIndex(p => p.id === now);
    let group = '';
    return '<div class="phs">' + list.map((p, k) => {
      const head = p.group !== group ? '<span class="phg">' + esc(p.group) + '</span>' : '';
      group = p.group;
      const cls = k === at ? 'on' : (at >= 0 && k < at ? 'done' : '');
      return head + '<span class="ph ' + cls + '">' + esc(p.label) + '</span>';
    }).join('') + '</div>';
  }

  /* The round card as pages: one step of the resolution at a time, then the
     whole card. */
  function roundPages(card) {
    return ['prod', 'order', 'war', 'events', 'famine'].concat(card.books ? ['books'] : [], ['summary']);
  }
  function roundPageHtml(card, pub, A, page) {
    if (page === 'summary') return roundCardHtml(card, pub, A);
    const x = ctx(pub);
    const P = id => pub.players.find(p => p.id === id) || { name: '?', hex: '#888' };
    const dot = id => '<i class="rc-dot" style="background:' + esc(P(id).hex) + '"></i>';
    const table = (rows, fn) => '<table class="rc-tab">' + rows.map(fn).join('') + '</table>';
    const label = (PHASES.find(p => p.id === page) || {}).label || '';
    let body = '';
    if (page === 'prod') {
      body = table(card.prod, r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + (r.revolt != null ? ' <em>in revolt (' + r.revolt + ' stability)</em>' : '') + '</td><td>' + gainsHtml(r.got, A) + '</td></tr>');
    } else if (page === 'order') {
      const o = card.orderChange || { before: card.order, after: card.order };
      const same = o.before.join() === o.after.join();
      body = '<div class="rc-row">' + o.after.map((id, k) => '<span class="rc-ord"><b>' + (k + 1) + '</b>' + dot(id) + esc(P(id).name) +
        (o.before.indexOf(id) !== k ? ' <small>(was ' + (o.before.indexOf(id) + 1) + ')</small>' : '') + '</span>').join('') + '</div>' +
        '<div class="rc-row rc-note">' + (o.frozen ? 'This round’s event keeps the order as it was.' : same ? 'Nobody changes places.' : 'Next round is played in this order.') + '</div>';
    } else if (page === 'war') {
      if (!card.war || card.war.none) body = '<div class="rc-row">No War was bought this round — nobody fights.</div>';
      else body = '<div class="rc-row"><b>' + esc(x.C(card.war.card)) + '</b>&nbsp;at strength ' + card.war.str + ', declared by ' + esc(P(card.war.by).name) + '.</div>' +
        (card.warLoss && card.warLoss.length ? table(card.warLoss, r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + ' <em>defeated at ' + r.str + '</em></td><td>' + gainsHtml(r.got, A) + '</td></tr>') : '<div class="rc-row">Nobody was weaker than it.</div>');
    } else if (page === 'events') {
      const ev = card.event ? D.event(card.event) : null;
      const rows = card.events.map(e => {
        const ids = Object.keys(e.who).filter(id => Object.keys(e.who[id]).some(k => e.who[id][k]));
        const bits = ids.map(id => dot(id) + esc(P(id).name) + ' ' + gainsHtml(e.who[id], A));
        if (e.moved) bits.push(e.moved.who.map(id => esc(P(id).name)).join(', ') + ' go' + (e.moved.who.length === 1 ? 'es' : '') + ' ' + e.moved.where);
        for (const l of (e.lost || [])) bits.push(esc(P(l.id).name) + ' loses ' + esc(x.C(l.card)));
        const half = ev ? [ev.a, ev.b].filter(Boolean).find(h => h.name === e.name) : null;
        return '<div class="rc-evh"><b>' + esc(e.name) + '</b>' + (half ? '<div class="rc-note">' + esc(half.text) + '</div>' : '') +
          '<div class="rc-row">' + (bits.length ? bits.join(' · ') : 'Nobody was touched by it.') + '</div></div>';
      }).join('');
      body = '<div class="rc-evs">' + (ev && A ? '<div class="rc-evc">' + A.event(card.event) + '</div>' : '') + '<div class="rc-evl">' + (rows || '<div class="rc-row">Nothing happened.</div>') + '</div></div>';
    } else if (page === 'famine') {
      const fam = card.famine.filter(r => r.got && Object.keys(r.got).length);
      const n = card.event ? D.event(card.event).famine : 0;
      body = '<div class="rc-row">Famine this round: <b>&nbsp;' + n + ' food&nbsp;</b> a nation.</div>' +
        (fam.length ? table(fam, r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + '</td><td>' + gainsHtml(r.got, A) + '</td></tr>') : '');
    } else if (page === 'books') {
      body = table(card.books.rows.slice().sort((a, b) => b.books - a.books), r => '<tr><td>' + dot(r.id) + esc(P(r.id).name) + '</td><td>' + r.books + ' books</td><td>' + (r.vp ? '+' + r.vp + ' VP' : '—') + '</td></tr>');
    }
    return '<div class="rc rc-page">' + phaseStripHtml(page, card.round) +
      '<div class="rc-h">Round ' + card.round + ' — ' + esc(label) + '</div>' +
      '<div class="rc-sub rc-says">' + esc(PHASE_SAYS[page] || '') + '</div>' +
      '<div class="rc-sec">' + body + '</div></div>';
  }
  /* The event being turned over at the start of the actions. */
  function eventRevealHtml(info, pub, A) {
    const ev = D.event(info.event);
    if (!ev) return '';
    const half = h => '<div class="rc-evh"><b>' + esc(h.name) + '</b><div class="rc-row">' + esc(h.text) + '</div></div>';
    return '<div class="rc rc-page">' + phaseStripHtml('event', info.round) +
      '<div class="rc-h">Round ' + info.round + ' — the event' + (info.chosenBy ? ' <small>(' + esc(ctx(pub).P(info.chosenBy)) + ' chose it)</small>' : '') + '</div>' +
      '<div class="rc-sub rc-says">It stays beside the board all round. Nothing on it happens yet: both events and the famine come at the end, after production and the War.</div>' +
      '<div class="rc-evs"><div class="rc-evc">' + (A ? A.event(info.event) : '') + '</div><div class="rc-evl">' +
      half(ev.a) + (ev.b ? half(ev.b) : '') +
      '<div class="rc-evh"><b>Famine</b><div class="rc-row">At the end of the round every nation pays ' + ev.famine + ' food.</div></div>' +
      '<div class="rc-evh"><b>Architects</b><div class="rc-row">' + info.arch + ' to hire this round' + (ev.arch ? ' (' + ev.arch + ' of them from this card)' : '') + '.</div></div>' +
      '</div></div></div>';
  }

  const W = { VERSION, ctx, lines, text, html, roundCard, roundCardHtml, gainsHtml, HEAD,
    PHASES, PHASE_SAYS, phaseNow, phaseStripHtml, roundPages, roundPageHtml, eventRevealHtml };

  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.NationsWords = W;
})(typeof window !== 'undefined' ? window : globalThis);
