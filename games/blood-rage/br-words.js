/* Blood Rage — the log, said out loud.
 *
 * One file for the telly's crier and the phones' "since your last turn", so
 * the two can never tell the table different stories.
 *
 * A Teller is fed log events IN THE ORDER THE ROOM MAY HEAR THEM (the telly
 * holds a battle's cards back until the clash has been fought, and feeds them
 * after) and keeps a list of lines. Glory and stat rises are CONSEQUENCES:
 * they are folded into the line of whatever earned them — "Ragnhild pillages
 * Horgr: Rage — Rage up to 7, +4 Glory (won the battle)" — rather than said
 * on their own, and never past the start of somebody else's turn.
 */
(function (root) {
  'use strict';
  const D = root.BRData;
  const PV = id => (D.prov(id) || {}).name || (D.fjord(id) || {}).name || id;
  const CN = k => (D.CARDS[k] || {}).name || k;
  const AGE = ['', 'First', 'Second', 'Third'];
  const GN = id => (D.DEITIES && D.DEITIES[id] ? D.DEITIES[id].name : id);

  /* The moves a clan makes on its own turn. A line of one of these, by you,
     is where "since your last turn" starts counting. */
  const TURN = { pass: 1, invade: 1, march: 1, upgrade: 1, questCommit: 1, pillage: 1, sacrifice: 1, valhallaOut: 1 };
  /* Consequences are never folded back past one of these. */
  const BARRIER = { age: 1, action: 1, actionEnd: 1 };

  function figList(figs, nm) {
    const by = [];
    for (const f of figs) {
      let o = by.find(x => x.id === f.owner);
      if (!o) by.push(o = { id: f.owner, names: [] });
      const k = o.names.find(x => x.name === f.name);
      if (k) k.n++; else o.names.push({ name: f.name, n: 1 });
    }
    return by.map(o => nm(o.id) + '’s ' + o.names.map(x => x.n > 1 ? x.n + ' ' + x.name + 's' : x.name).join(' and ')).join(', ');
  }

  /* The words for an event that is a line of its own; null if it is not. */
  function head(e, nm) {
    switch (e.t) {
      case 'age': return 'The ' + AGE[e.n] + ' Age begins. The gods deal their gifts.';
      case 'nodraft': return 'No draft this Age — every clan keeps the eight it was dealt.';
      case 'drafted': return 'The gifts are chosen. To war.';
      case 'action': return nm(e.first) + ' leads the Action phase.';
      case 'pass': return nm(e.by) + ' passes' + (e.lost ? ' and gives up ' + e.lost + ' Rage' : '') + '.';
      case 'invade': return nm(e.by) + ' invades ' + PV(e.to) + ' with ' + (e.kind === 'monster' ? 'the ' : 'a ') + e.fig + '.';
      case 'march': return e.lead ? nm(e.by) + '’s Leader moves on from ' + PV(e.from) + ' to ' + PV(e.to) + ' (Lord of Hammers).'
        : nm(e.by) + ' marches ' + e.n + ' from ' + PV(e.from) + ' to ' + PV(e.to) + '.';
      case 'upgrade': return nm(e.by) + ' takes ' + CN(e.card) + '.';
      case 'replace': return nm(e.by) + ' discards ' + CN(e.old) + ' to make room.';
      case 'questCommit': return nm(e.by) + ' commits to a Quest, face down.';
      case 'pillage': return nm(e.by) + (e.again ? ' pillages ' + PV(e.prov) + ' again (Tyr’s Challenge).' : ' calls the clans to ' + PV(e.prov) + '.');
      case 'join': return nm(e.by) + '’s ' + e.fig + ' answers the call to ' + PV(e.prov) + '.';
      case 'unopposed': return nm(e.by) + ' pillages ' + PV(e.prov) + ' without a fight.';
      case 'battle': return 'Battle at ' + PV(e.prov) + ': ' + e.parts.map(nm).join(' v ') + '.';
      case 'reveal': return 'Cards: ' + e.cards.map(c => nm(c.by) + ' ' + (c.keys.length ? c.keys.map(CN).join('+') : 'nothing')).join(' · ');
      case 'cancelled': return 'Thor’s Primacy silences ' + nm(e.by) + '’s ' + CN(e.key) + '.';
      case 'watch': return 'Heimdall’s Watch — the cards go, and everyone plays again.';
      case 'smite': return 'Odin’s Smite: ' + e.n + ' Warrior' + (e.n === 1 ? '' : 's') + ' fall before the clash.';
      case 'tide': return 'Odin’s Tide: every clan keeps one figure.';
      case 'late': return nm(e.by) + ' adds ' + CN(e.key) + ' after the reveal!';
      case 'result': return e.winner ? nm(e.winner) + ' wins at ' + PV(e.prov) + ' (' + e.totals.map(t => t.total).join(' v ') + ').'
        : 'A tie at ' + PV(e.prov) + ' — everybody loses.';
      case 'pillaged': return nm(e.by) + ' pillages ' + PV(e.prov) + ': ' + D.PILLAGE_NAMES[e.token] +
        (e.times > 1 ? ' — ' + (e.times === 3 ? 'three times' : 'twice') + ', for ' + (e.odin && e.times === 2 ? 'Odin' : e.odin ? 'the Frost Giant and Odin' : 'the Frost Giant') : '') + '.';
      case 'pillageFailed': return nm(e.by) + ' fails to take ' + PV(e.prov) + '.';
      case 'die': return (e.cause === 'ragnarok' ? 'Ragnarök takes ' : 'To Valhalla: ') + figList(e.figs, nm) + '.';
      case 'rampage': return 'The ' + e.fig + ' tramples ' + e.n + ' in ' + PV(e.prov) + '.';
      case 'protect': return 'Frigga shields ' + e.n + ' of ' + nm(e.by) + '’s figures.';
      case 'flee': return 'The Volur Witch flees to Yggdrasil.';
      case 'poison': return nm(e.by) + '’s Poison takes the winner’s cards.';
      case 'prowess': return nm(e.by) + ' buys back ' + e.n + ' card' + (e.n === 1 ? '' : 's') + '.';
      case 'steal': return nm(e.by) + ' steals ' + e.what + ' from ' + nm(e.from) + '.';
      case 'sacrifice': return nm(e.by) + ' sacrifices two figures to Frigga.';
      case 'valhallaOut': return nm(e.by) + ' calls a figure back out of Valhalla.';
      case 'actionEnd': return 'The Action phase is over.';
      case 'quest': return nm(e.by) + '’s ' + CN(e.card) + ' Quest ' + (e.ok ? 'succeeds.' : 'fails.');
      case 'fenrir': return 'Fenrir drags Ragnarök to ' + PV(e.prov) + '!';
      case 'ragnarok': return e.already ? 'Ragnarök finds ' + PV(e.prov) + ' already gone.' : 'RAGNARÖK swallows ' + PV(e.prov) + '.';
      case 'release': return nm(e.by) + ' brings ' + e.n + ' back from Valhalla.';
      case 'hurried': return 'The table stopped waiting for ' + e.who.map(nm).join(' and ') + '.';
      case 'over': return 'The world ends. ' + e.top + ' Glory is the best of it.';
      /* Mystics of Midgard */
      case 'mysticJoins': return nm(e.by) + '’s ' + CN(e.card) + ' brings a Mystic into the reserve.';
      case 'assassin': return nm(e.by) + '’s Mystic takes a village in ' + PV(e.prov) + ' — ' + nm(e.victim) + '’s ' + (e.kind === 'mystic' ? 'Mystic' : 'Warrior') + ' must go (Odin’s Chosen).';
      case 'assassinBlocked': return 'The village held; ' + nm(e.by) + '’s Mystic stays in the reserve.';
      case 'retreat': return nm(e.by) + '’s Mystic retreats from ' + PV(e.from) + ' to ' + PV(e.to) + ' (Frigga’s Chosen).';
      /* Gods of Asgard */
      case 'gods': return e.gods.map(d => GN(d.id) + (d.at ? ' stands in ' + PV(d.at) : ' finds nowhere to stand')).join('; ') + '.';
      case 'godMove': return nm(e.by) + ' sends ' + GN(e.god) + ' from ' + PV(e.from) + ' to ' + PV(e.to) + '.';
      case 'godStays': return GN(e.god) + ' stays in ' + PV(e.prov) + ' — there is nowhere else for the god to go.';
      case 'godSaves': return 'Frigga shelters ' + PV(e.prov) + ': nobody dies in this battle.';
      case 'openCard': return nm(e.by) + ' plays ' + CN(e.key) + ' face up, under Heimdall’s eye.';
    }
    return null;
  }
  /* Whose line it is: the clans a consequence may be folded into. */
  function whoOf(e) {
    if (e.t === 'battle') return e.parts.slice();
    if (e.t === 'result') return e.totals.map(t => t.by);
    if (e.t === 'reveal') return e.cards.map(c => c.by);
    if (e.t === 'die') return e.figs.map(f => f.owner).filter((id, i, a) => a.indexOf(id) === i);
    if (e.t === 'watch') return (e.by || []).slice();
    if (e.t === 'march' && e.lead) return [];      // part of a pillage already said; earns nothing itself
    return e.by && typeof e.by === 'string' ? [e.by] : [];
  }
  /* The Glory reason a line already says, so it is not said twice. */
  function implied(e) {
    if (e.t === 'pillaged') return 'pillage';
    if (e.t === 'result') return 'won the battle';
    if (e.t === 'quest') return CN(e.card);
    if (e.t === 'release') return 'released from Valhalla';
    if (e.t === 'die' && e.cause === 'ragnarok') return 'died in Ragnarök';
    return null;
  }

  function Teller() { this.lines = []; this.k = 0; }
  Teller.prototype.push = function (L) { L.k = this.k++; L.cons = L.cons || []; this.lines.push(L); if (this.lines.length > 400) this.lines.shift(); return L; };
  Teller.prototype.host = function (id) {
    for (let i = this.lines.length - 1, seen = 0; i >= 0 && seen < 10; i--, seen++) {
      const L = this.lines[i];
      if (L.who.indexOf(id) >= 0) return L;
      if (L.turn || BARRIER[L.t]) return null;
    }
    return null;
  };
  /* Feed one event. Returns the line it made or joined, or null. */
  Teller.prototype.feed = function (e) {
    if (e.t === 'glory' || e.t === 'stat') {
      const c = e.t === 'glory' ? { by: e.by, glory: e.n, why: e.why } : { by: e.by, stat: e.stat, to: e.to };
      const L = this.host(e.by);
      if (L) { L.cons.push(c); return L; }
      return this.push({ t: e.t, by: e.by, who: [e.by], solo: true, age: e.age, cons: [c] });
    }
    const text = head(e, id => '\u0001' + id + '\u0002');
    if (text == null) return null;
    return this.push({ t: e.t, text, by: typeof e.by === 'string' ? e.by : (e.winner || null), who: whoOf(e),
      turn: !!TURN[e.t] && !e.lead, age: e.age, imply: implied(e),
      /* "pillages Horgr: +5 Glory" already says what the token paid */
      stated: e.t === 'pillaged' && e.token === 'glory' });
  };

  /* A line in words. Names are resolved here, so a Teller needs nobody's
     name to be fed. */
  function say(L, nm) {
    const names = s => s.replace(/\u0001([^\u0002]*)\u0002/g, (m, id) => nm(id));
    /* per clan: its stat rises, the Glory the line itself explains (said
       without a reason, or not at all when the line already gave the
       number), then each other reason with its own amount */
    const groups = [];
    for (const c of L.cons) {
      let gp = groups.find(x => x.by === c.by);
      if (!gp) groups.push(gp = { by: c.by, stats: [], implied: 0, other: [] });
      if (c.stat) gp.stats.push(D.STAT_NAMES[c.stat] + ' up to ' + c.to);
      if (!c.glory) continue;
      if (c.why === L.imply) { gp.implied += c.glory; continue; }
      const o = gp.other.find(x => x.why === c.why);
      if (o) o.n += c.glory; else gp.other.push({ why: c.why, n: c.glory });
    }
    const part = gp => gp.stats
      .concat(gp.implied && !L.stated ? ['+' + gp.implied + ' Glory'] : [])
      .concat(gp.other.map(o => '+' + o.n + ' Glory' + (o.why ? ' (' + o.why + ')' : ''))).join(', ');
    const text = L.solo ? '' : names(L.text);
    const parts = groups.map(gp => ({ gp, s: part(gp) })).filter(x => x.s);
    if (L.solo) {
      const gp = groups[0];
      if (!gp.stats.length && gp.other.length === 1 && !gp.implied) return nm(L.by) + ' gains ' + gp.other[0].n + ' Glory' + (gp.other[0].why ? ' — ' + gp.other[0].why : '') + '.';
      return nm(L.by) + (gp.other.length || gp.implied ? ': ' : '’s ') + part(gp) + '.';
    }
    if (!parts.length) return text;
    const own = parts.length === 1 && parts[0].gp.by === L.by;
    return text.replace(/[.!]$/, '') + ' — ' + parts.map(x => (own ? '' : nm(x.gp.by) + ' ') + x.s).join('; ') + '.';
  }

  /* The lines a seat has not seen since its own last move: everything after
     its latest turn line, or — before it has had one — since the Age began.
     `lines` is any window of {k, t, by, turn, text}. */
  function since(lines, me) {
    let from = -1, first = false;
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].turn && lines[i].by === me) { from = i; break; }
    if (from < 0) {
      first = true;
      for (let i = lines.length - 1; i >= 0; i--) if (lines[i].t === 'age') { from = i - 1; break; }
    }
    const cut = from < 0 && lines.length > 0 && lines[0].k > 0 && !lines.some(l => l.t === 'age');
    return { first, cut, lines: lines.slice(from + 1).filter(l => !(l.turn && l.by === me)) };
  }

  root.BRWords = { Teller, say, since, head, TURN };
})(typeof window !== 'undefined' ? window : globalThis);
