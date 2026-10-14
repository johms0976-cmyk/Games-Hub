'use strict';
/* Android: Netrunner — the words. One line per move, with what it did, shared
 * by the telly and every phone (LESSONS-CHECKLIST D: "one line per move with
 * what it earned, from one words file"). Built only from the public log, so a
 * line can never say what a seat could not see.
 *
 *   lines(log, pub, base)  → [{ i, by, side, t, text, quiet, turn }]
 *   html(line, pub)        → the line, names in their colours
 *   holdCardHtml(pub)      → the opening card (the table reads it together)
 *   showHtml(hold, pub)    → the words of a timed show (a rez, an access…)
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nr-data.js') : root.NrData;
  const CARD = D.CARDS;
  const VERSION = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nm = k => (CARD[k] ? CARD[k].name : k);
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
  const SRV = { hq: 'HQ', rd: 'R&D', arch: 'Archives' };
  const srv = sid => SRV[sid] || (/^r\d+$/.test(sid || '') ? 'Server ' + sid.slice(1) : sid || '?');

  /* Which of a seat's own lines count as "a move of theirs" — the phone's
     "since your last move" starts after the newest of these. */
  const CHOSE = { click: 1, install: 1, play: 1, run: 1, adv: 1, rez: 1, score: 1, purge: 1, use: 1, untag: 1, draw: 1 };
  const ENDS = {
    points: 'reached the agenda points.',
    flatline: 'The Runner is flatlined.',
    decked: 'R&D ran dry: the Corp could not draw.',
    cap: 'The game ran out of rounds: the most agenda points wins.'
  };

  function lines(log, pub, base) {
    base = base || 0;
    const corpSeat = pub.corp.seat, runSeat = pub.runner.seat;
    const P = id => pub.players.find(p => p.id === id) || {};
    const who = side => side === 'corp' ? (P(corpSeat).name || 'The Corp') : (P(runSeat).name || 'The Runner');
    const C = () => who('corp'), R = () => who('runner');
    const out = [];
    const say = (i, side, text, o) => out.push(Object.assign({ i: base + i, side, by: side === 'corp' ? corpSeat : side === 'runner' ? runSeat : null, text }, o || {}));
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      const t = e.t;
      switch (t) {
        case 'turn': say(i, e.side, (e.side === 'corp' ? 'Round ' + e.round + ' — ' + C() + '’s turn (the Corp)' : R() + '’s turn (the Runner)'), { turn: true, t }); break;
        case 'draw':
          if (e.why === 'deal') break;
          if (e.why === 'turn') { say(i, 'corp', C() + ' draws for the turn', { quiet: true, t }); break; }
          say(i, e.side, who(e.side) + ' draws ' + plural(e.n, 'card') + (e.why && e.why !== 'click' ? ' (' + nm(e.why) + ')' : ''), { t }); break;
        case 'mulligan': say(i, e.side, who(e.side) + (e.did ? ' takes a mulligan: five fresh cards' : ' keeps the opening hand'), { t }); break;
        case 'click': say(i, e.side, who(e.side) + ' takes a credit', { t }); break;
        case 'gain':
          if (['pad', 'adonis', 'etf', 'babw', 'gabriel', 'desperado'].indexOf(e.k) >= 0) say(i, e.side, nm(e.k) + ': ' + who(e.side) + ' +' + e.n, { t, quiet: e.k === 'etf' || e.k === 'babw' });
          else say(i, e.side, who(e.side) + ' gains ' + e.n + ' from ' + nm(e.k), { t });
          break;
        case 'install':
          if (e.side === 'corp') say(i, 'corp', C() + ' installs ' + (e.ice ? 'an ice in front of ' + srv(e.sid) + (e.cost ? ' (pays ' + e.cost + ')' : '') : 'a card in ' + srv(e.sid)), { t, sid: e.sid });
          else say(i, 'runner', R() + ' installs ' + nm(e.k) + (e.host ? ' on ' + nm(e.host) : '') + (e.cost ? ' for ' + e.cost : ''), { t });
          break;
        case 'overwrite': say(i, 'corp', 'The card that was in ' + srv(e.sid) + ' goes to Archives face down', { t, quiet: true }); break;
        case 'rez': say(i, 'corp', C() + ' rezzes ' + nm(e.k) + (e.sid ? ' (' + srv(e.sid) + ')' : '') + (e.cost ? ' for ' + e.cost : ' free'), { t, sid: e.sid }); break;
        case 'adv': say(i, 'corp', (e.by ? nm(e.by) + ': ' : C() + ' advances ') + (e.k ? nm(e.k) : 'a card') + ' in ' + srv(e.sid) + ' — now ' + e.n + ' advancement' + (e.n === 1 ? '' : 's'), { t, sid: e.sid }); break;
        case 'play': say(i, e.side, who(e.side) + ' plays ' + nm(e.k) + (e.x != null ? ' (X = ' + e.x + ')' : ''), { t }); break;
        case 'score': say(i, 'corp', C() + ' SCORES ' + nm(e.k) + ' — ' + plural(e.pts, 'point') + ', ' + e.total + ' in all', { t, big: true }); break;
        case 'steal': say(i, 'runner', R() + ' STEALS ' + nm(e.k) + ' — ' + plural(e.pts, 'point') + ', ' + e.total + ' in all', { t, big: true }); break;
        case 'forfeit': say(i, e.side, who(e.side) + ' forfeits ' + nm(e.k), { t }); break;
        case 'bp': say(i, 'corp', C() + ' takes ' + (e.add > 1 ? e.add + ' bad publicity' : 'bad publicity') + (e.cause ? ' (' + e.cause + ')' : '') + ' — ' + e.n + ' now', { t }); break;
        case 'tags': say(i, 'runner', R() + ' takes ' + plural(e.n, 'tag') + (e.cause ? ' (' + e.cause + ')' : '') + ' — ' + e.total + ' now', { t }); break;
        case 'untag': say(i, e.by === 'click' ? 'runner' : 'corp', e.by === 'click' ? R() + ' removes a tag' : R() + ' loses ' + plural(e.n, 'tag') + ' (' + nm(e.k) + ')', { t }); break;
        case 'damage': say(i, 'corp', R() + ' takes ' + e.n + ' ' + e.kind + ' damage' + (e.cause ? ' from ' + e.cause : '') + (e.lost.length ? ' — loses ' + e.lost.map(nm).join(', ') : '') + (e.flat ? ' — FLATLINED' : ''), { t, big: e.flat }); break;
        case 'prevent': say(i, e.side, nm(e.k) + (e.saved ? ' saves ' + nm(e.saved) : e.what === 'expose' ? ' stops the expose' : ' prevents ' + (e.n || 1)), { t }); break;
        case 'trace': say(i, 'corp', 'Trace' + (e.cause ? ' (' + e.cause + ')' : '') + ': ' + e.str + ' against link ' + (e.link + e.rb) + ' — ' + (e.ok ? 'it lands' : 'it fails'), { t }); break;
        case 'expose': say(i, 'runner', R() + ' exposes ' + nm(e.k) + (e.sid ? ' in ' + srv(e.sid) : ''), { t }); break;
        case 'run': say(i, 'runner', R() + ' runs ' + srv(e.sid) + (e.via ? ' (' + nm(e.via) + ')' : '') + (e.bp ? ' — ' + e.bp + ' bad-publicity credit' + (e.bp === 1 ? '' : 's') : ''), { t, sid: e.sid }); break;
        case 'approach': say(i, 'runner', '… approaches ' + (e.k ? nm(e.k) : 'an unrezzed ice'), { t, quiet: true, sid: e.sid }); break;
        case 'approachServer': say(i, 'runner', '… reaches ' + srv(e.sid), { t, quiet: true, sid: e.sid }); break;
        case 'encounter': say(i, 'runner', '… meets ' + nm(e.k), { t, quiet: true }); break;
        case 'bypass': say(i, 'runner', R() + ' slips past ' + nm(e.k) + ' (' + nm(e.by) + ')', { t }); break;
        case 'toll': say(i, 'runner', e.paid ? R() + ' pays the Tollbooth 3' : 'Tollbooth: ' + R() + ' cannot pay — the run ends', { t }); break;
        case 'ravenEnd': say(i, 'runner', R() + ' turns back from Data Raven', { t }); break;
        case 'break': say(i, 'runner', R() + ' breaks ' + plural(e.subs.length, 'subroutine') + (e.how === 'click' ? ' with a click' : ' with ' + nm(e.how) + (e.cost ? ' for ' + e.cost : '')), { t }); break;
        case 'lower': say(i, 'runner', nm(e.k || 'datasucker') + ': the ice is 1 weaker', { t, quiet: true }); break;
        case 'sub': if (e.sub !== 'etr' && e.sub !== 'trace' && e.sub !== 'net' && e.sub !== 'brain') say(i, 'corp', nm(e.k) + ' fires: ' + subWords(e.sub), { t }); else if (e.sub === 'etr') say(i, 'corp', nm(e.k) + ': END THE RUN', { t }); break;
        case 'loseClick': say(i, 'runner', R() + ' loses a click' + (e.k ? ' (' + nm(e.k) + ')' : ''), { t, quiet: true }); break;
        case 'power': say(i, CARD[e.k] && CARD[e.k].side === 'runner' ? 'runner' : 'corp', e.k === 'draco' ? 'Dracō is powered up: +' + e.n + ' strength' : nm(e.k || 'data_raven') + ': ' + plural(e.n, 'power counter'), { t }); break;
        case 'cell': say(i, 'corp', 'Cell Portal throws ' + R() + ' back to the outermost ice', { t }); break;
        case 'mineGone': say(i, 'corp', 'Data Mine is spent and trashed', { t, quiet: true }); break;
        case 'success': say(i, 'runner', 'The run on ' + srv(e.sid) + ' succeeds' + (e.as ? ' — it counts as HQ' : ''), { t, quiet: true }); break;
        case 'access': break;
        case 'sees': say(i, 'runner', R() + ' accesses ' + nm(e.k) + ' (' + ({ hq: 'HQ', rd: 'R&D', arch: 'Archives' }[e.from] || 'installed') + ')', { t }); break;
        case 'leave': say(i, 'runner', R() + ' leaves ' + nm(e.k) + ' where it is', { t }); break;
        case 'trash': say(i, 'runner', R() + ' trashes ' + nm(e.k) + (e.price ? ' for ' + e.price : e.by ? ' free (' + nm(e.by) + ')' : ''), { t }); break;
        case 'trashed': if (e.why === 'tagged') say(i, 'corp', C() + ' trashes ' + nm(e.k) + ' (the Runner is tagged)', { t }); else if (e.why !== 'room' && e.why !== 'console' && e.why !== 'unique') say(i, 'runner', nm(e.k) + ' is trashed' + ({ empty: ' — empty', crypsis: ' — it had no virus counter left', host: ' with what it sat on', memory: ' — no memory left for it' })[e.why] || (typeof e.why === 'string' && !/^(prevent|aesops)$/.test(e.why) ? ' (' + e.why + ')' : ''), { t }); break;
        case 'siphon': say(i, 'runner', 'Account Siphon: the Corp loses ' + e.n + ', ' + R() + ' gains ' + 2 * e.n, { t }); break;
        case 'ambush': say(i, 'corp', C() + ' springs ' + nm(e.k) + '!', { t, big: true }); break;
        case 'runEnd':
          if (e.how === 'success') say(i, 'runner', 'The run ends', { t, quiet: true });
          else say(i, 'runner', e.how === 'jacked' ? R() + ' jacks out' : 'The run on ' + srv(e.sid) + ' is stopped' + (e.by ? ' by ' + e.by : ''), { t });
          break;
        case 'virus': say(i, 'runner', nm(e.k) + ': ' + plural(e.n, 'virus counter'), { t, quiet: true }); break;
        case 'purge': say(i, 'corp', C() + ' purges ' + plural(e.n, 'virus counter'), { t }); break;
        case 'use': say(i, e.side, who(e.side) + ' uses ' + nm(e.k), { t }); break;
        case 'mill': say(i, 'runner', nm(e.k || 'noise') + ': the top of R&D goes to Archives', { t }); break;
        case 'mark': say(i, 'runner', 'Femme Fatale marks an ice', { t, quiet: true }); break;
        case 'search': say(i, e.side, who(e.side) + ' searches ' + (e.side === 'corp' ? 'R&D' : 'the stack') + (e.k ? ' and takes ' + nm(e.k) : ''), { t }); break;
        case 'fromHeap': say(i, 'runner', R() + ' takes ' + nm(e.k) + ' back from the heap', { t }); break;
        case 'fromArch': say(i, 'corp', C() + ' takes ' + (e.k ? nm(e.k) : 'a face-down card') + ' back from Archives', { t }); break;
        case 'tinker': say(i, 'runner', 'Tinkering: an ice is every type this turn', { t }); break;
        case 'trashedIce': say(i, 'corp', e.by === 'kraken' ? 'Kraken: ' + C() + ' trashes ' + (e.k ? nm(e.k) : 'an unrezzed ice') : C() + ' trashes the ice rather than rez it', { t }); break;
        case 'secsub': say(i, 'corp', C() + ' trashes ' + nm(e.k) + ' for 4 (Security Subcontract)', { t }); break;
        case 'boost': say(i, e.k === 'helpful_ai' ? 'runner' : 'corp', e.k === 'helpful_ai' ? 'The Helpful AI: an icebreaker is +' + e.n + ' strength this turn' : 'Corporate Troubleshooter: the ice is +' + e.n + ' strength', { t }); break;
        case 'abt': say(i, 'corp', 'Accelerated Beta Test: the rest of the top cards go to Archives', { t, quiet: true }); break;
        case 'precog': say(i, 'corp', C() + ' rearranges the top of R&D', { t, quiet: true }); break;
        case 'discard': say(i, e.side, who(e.side) + ' discards ' + (e.ks && e.ks.length ? e.ks.map(nm).join(', ') : plural(e.n, 'card')) + ' at the end of the turn', { t }); break;
        case 'lose': say(i, e.side || 'runner', who(e.side || 'runner') + ' loses ' + e.n + ' credits', { t }); break;
        case 'clicks': say(i, e.side, who(e.side) + ' gains ' + plural(e.n, 'click') + (e.k ? ' (' + nm(e.k) + ')' : ''), { t }); break;
        /* ---- Genesis ---- */
        case 'psi': say(i, 'corp', 'Psi game' + (e.cause ? ' (' + e.cause + ')' : '') + ': ' + C() + ' spent ' + e.cb + ', ' + R() + ' spent ' + e.rb + ' — ' + (e.cb !== e.rb ? 'they differ, it works' : 'they match, it fails'), { t, big: true }); break;
        case 'derez': say(i, e.why === 'shutdown' || e.why === 'crescentus' ? 'runner' : 'corp', nm(e.k) + ' is derezzed' + ({ turn: ' at the end of the turn', trace: ' — the trace failed', shutdown: ' (Emergency Shutdown)', crescentus: ' (Crescentus)' }[e.why] || ''), { t }); break;
        case 'chimera': say(i, 'corp', 'Chimera becomes a ' + e.type + ' until it derezzes', { t }); break;
        case 'workshop': say(i, 'runner', 'Personal Workshop: ' + nm(e.k) + ' — ' + plural(e.n, 'counter') + ' left', { t, quiet: true }); break;
        case 'workshopHost': say(i, 'runner', R() + ' puts ' + nm(e.k) + ' on Personal Workshop (' + plural(e.n, 'counter') + ')', { t }); break;
        case 'testRunBack': say(i, 'runner', 'Test Run: ' + nm(e.k) + ' goes back on top of the stack', { t }); break;
        case 'toStack': say(i, 'corp', 'Sherlock 1.0: ' + nm(e.k) + ' goes back on top of the Runner’s stack', { t }); break;
        case 'midori': say(i, 'corp', 'Midori: ' + C() + ' swaps in a fresh ice from HQ', { t }); break;
        case 'bullfrog': say(i, 'corp', 'Bullfrog leaps — the run moves to ' + srv(e.to), { t, big: true }); break;
        case 'sensei': say(i, 'corp', 'Sensei: every ice after it this run gains “End the run”', { t }); break;
        case 'whirlpool': say(i, 'corp', 'Whirlpool: no jacking out this run', { t }); break;
        case 'noRun': say(i, 'corp', nm(e.k) + ': no more runs this turn', { t }); break;
        case 'hound': say(i, 'corp', 'Data Hound: ' + nm(e.k) + ' is trashed off the top of the stack', { t }); break;
        case 'oversight': say(i, 'corp', 'Oversight AI: ' + nm(e.k) + ' is broken through and trashed', { t, quiet: true }); break;
        case 'counters': say(i, 'corp', nm(e.k) + ' gets ' + plural(e.n, 'agenda counter'), { t, quiet: true }); break;
        case 'shuffleHQ': say(i, 'corp', 'Executive Retreat: HQ is shuffled into R&D', { t }); break;
        case 'load': say(i, 'corp', nm(e.k) + ': ' + e.n + ' credits on it', { t, quiet: true }); break;
        case 'peek': say(i, 'runner', 'Deep Thought: ' + R() + ' looks at the top of R&D', { t }); break;
        case 'cortez': say(i, 'runner', 'Cortez Chip: an ice costs 2 more to rez this turn', { t }); break;
        case 'notoriety': say(i, 'runner', R() + ' plays Notoriety — +1 agenda point, ' + e.total + ' in all', { t, big: true }); break;
        case 'paid': say(i, 'runner', R() + ' pays ' + nm(e.k) + ' ' + e.n + ' to carry on', { t }); break;
        case 'rework': say(i, 'corp', 'Rework: a card from HQ goes into R&D', { t, quiet: true }); break;
        case 'sunset': say(i, 'corp', 'Sunset: the ice in front of ' + srv(e.sid) + ' is rearranged', { t }); break;
        case 'vamp': say(i, 'runner', 'Vamp: ' + R() + ' pays ' + e.n + ' and the Corp loses ' + e.n, { t, big: true }); break;
        case 'indexing': say(i, 'runner', 'Indexing: ' + R() + ' rearranges the top ' + plural(e.n, 'card') + ' of R&D', { t }); break;
        case 'ash': say(i, 'corp', 'Ash 2X3ZB9CY: only Ash can be accessed this run', { t }); break;
        case 'bernice': say(i, 'corp', 'Bernice Mai’s trace failed — she is trashed', { t }); break;
        /* ---- the later products ---- */
        case 'swapIce': say(i, e.side || 'runner', (e.side === 'corp' ? C() : R()) + ' swaps an ice in ' + srv(e.a) + ' with one in ' + srv(e.b), { t }); break;
        case 'unadv': say(i, 'runner', R() + ' takes ' + plural(e.n, 'advancement token') + ' off a card in ' + srv(e.sid), { t }); break;
        case 'cypher': say(i, 'runner', 'Cyber-Cypher is set for ' + srv(e.sid), { t, quiet: true }); break;
        case 'unbroken': say(i, 'corp', C() + ' stops ' + plural(e.n, 'subroutine') + ' from being broken', { t }); break;
        case 'note': say(i, e.side || null, e.text, { t, quiet: !!e.quiet }); break;
        case 'reveal': say(i, e.side, (e.side === 'corp' ? C() : R()) + ' shows ' + (e.ks.length > 6 ? plural(e.ks.length, 'card') : e.ks.map(nm).join(', ')) + (e.cause ? ' (' + nm(e.cause) + ')' : ''), { t }); break;
        case 'bpGone': say(i, 'corp', C() + ' sheds ' + plural(e.n, 'bad publicity', 'bad publicity') + (e.cause ? ' (' + e.cause + ')' : '') + ' — ' + e.total + ' left', { t }); break;
        case 'toHQ': say(i, 'corp', C() + ' takes ' + (e.what === 'ice' ? 'an ice' : e.what || 'a card') + ' back into HQ', { t }); break;
        case 'toRD': say(i, 'runner', nm(e.k) + ' goes back on top of R&D', { t }); break;
        case 'hostOn': say(i, 'runner', nm(e.k) + ' moves onto an ice in front of ' + srv(e.sid), { t }); break;
        case 'archToRD': say(i, 'corp', C() + ' shuffles ' + plural(e.n, 'card') + ' from Archives into R&D', { t }); break;
        case 'swapRoot': say(i, 'corp', 'Toshiyuki Sakai is swapped for a face-down card in ' + srv(e.sid), { t, big: true }); break;
        case 'discardBy': say(i, 'corp', nm(e.k) + ' is trashed from the Runner’s grip (' + nm(e.by) + ')', { t }); break;
        case 'copycat': say(i, 'runner', 'Copycat: the run carries on from ' + srv(e.sid), { t }); break;
        case 'accessOut': break;
        case 'currentGone': say(i, CARD[e.k] && CARD[e.k].side === 'runner' ? 'runner' : 'corp', nm(e.k) + ' (a current) leaves play', { t, quiet: true }); break;
        case 'empty': say(i, 'corp', nm(e.k) + ' is empty and goes', { t, quiet: true }); break;
        case 'parasite': say(i, 'runner', 'Parasite eats through ' + nm(e.k) + ' — trashed', { t }); break;
        case 'fizzle': break;
        case 'over': say(i, null, 'The game is over', { t, turn: true }); break;
        case 'hurried': say(i, null, 'The remote played a quiet phone’s move', { t }); break;
        case 'nowait': say(i, null, 'The table went on without a slow reader', { t, quiet: true }); break;
      }
    }
    return out;
  }
  function subWords(k) {
    return ({ loseClick: 'the Runner loses a click', trashProg: 'a program is trashed', gain: 'the Corp gains credits', cell: 'back to the start', chum: 'the next ice is stronger', dataMine: '1 net damage', psi: 'a psi game', sensei: 'later ice end the run', whirlpool: 'no jacking out', payOrEnd: 'pay or the run ends' })[k] || k;
  }
  function html(l, pub) {
    const p = l.by ? pub.players.find(x => x.id === l.by) : null;
    let t = esc(l.text);
    if (p) t = t.replace(esc(p.name), '<b style="color:' + esc(p.hex) + '">' + esc(p.name) + '</b>');
    return t;
  }

  /* The opening card: who is who, and how a turn works. */
  function holdCardHtml(pub) {
    const P = id => pub.players.find(p => p.id === id) || {};
    const c = P(pub.corp.seat), r = P(pub.runner.seat);
    const cid = CARD[pub.corp.ident], rid = CARD[pub.runner.ident];
    const row = (p, side, id, fac) => '<div class="rc-p"><i style="background:' + esc(p.hex) + '"></i><b>' + esc(p.name) + '</b> <span class="rc-role">' + side + (p.bot ? ' · house ' + esc(p.level) : '') + '</span>' +
      '<span class="rc-d">' + esc(D.FACTIONS[fac].name) + ' — ' + esc(id.name) + '</span><span class="rc-t">' + esc(id.text) + '</span></div>';
    return '<div class="rc-h">Jack in</div><div class="rc-sub">First to ' + pub.win + ' agenda points. The Corp also wins by flatlining the Runner; the Runner also wins if R&D runs out.</div>' +
      '<div class="rc-sc">' + row(c, 'the Corp', cid, pub.corp.fac) + row(r, 'the Runner', rid, pub.runner.fac) + '</div>' +
      '<div class="rc-sec"><h4>The Corp — 3 clicks a turn</h4><ul><li>Draws a card first. Installs ice to guard HQ, R&D, Archives and remote servers, agendas and assets in remotes, face down.</li><li>Advances an agenda (a click and a credit each) until it can be scored for points.</li><li>Pays to rez a card when it matters — ice usually as the Runner reaches it.</li></ul></div>' +
      '<div class="rc-sec"><h4>The Runner — 4 clicks a turn</h4><ul><li>Installs programs (icebreakers), hardware and resources; plays events.</li><li>Runs a server: ice by ice, breaking subroutines with icebreakers of the right kind. What isn’t broken fires.</li><li>Gets in, accesses what is there: steals agendas, may pay to trash the rest.</li></ul></div>';
  }

  const Words = { VERSION, lines, html, holdCardHtml, CHOSE, ENDS, srv, nm, subWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = Words;
  else root.NrWords = Words;
})(typeof window !== 'undefined' ? window : this);
