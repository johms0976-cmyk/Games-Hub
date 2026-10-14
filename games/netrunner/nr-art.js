'use strict';
/* Android: Netrunner — what things look like: card faces, the Corp's servers
 * with their ice, the Runner's rig, icons.
 *
 * Every card is DRAWN — name, cost, strength, subroutines, words — so the game
 * reads with no pictures at all. The module's scans (art/<id>.webp, made by
 * tools/cut-art.py) are a layer that only shows once probe() has seen one load
 * (the class `nr-art` on <html>): never load-bearing (LESSONS-CHECKLIST E), so
 * jsdom tests and a missing folder get the drawn faces and the privacy guard's
 * markup never changes. Small faces (installed cards, lists) always show the
 * words; only a big face swaps to the printed card.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nr-data.js') : root.NrData;
  const CARD = D.CARDS;
  const VERSION = 1;
  const ART_VER = 2;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const facHex = k => (D.FACTIONS[(CARD[k] || {}).fac] || D.FACTIONS.neutral).hex;

  /* ---------------- icons (SVG, no emoji) ---------------- */
  const PATHS = {
    credit: '<path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M14.6 9.2a3.4 3.4 0 1 0 0 5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    click: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 6.5v5.5l3.6 2.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    link: '<rect x="3" y="8" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="10" y="4" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    mu: '<rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 9v6M12 9v6M16 9v6" stroke="currentColor" stroke-width="2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.8"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2.5 2.5 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1V5a2.5 2.5 0 0 1 3-1z" fill="none" stroke="currentColor" stroke-width="1.9"/>',
    bp: '<path d="M12 3l9.5 17h-19z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9.5v5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.3"/>',
    adv: '<path d="M12 3l3 6 6.5.8-4.8 4.5 1.3 6.5L12 17.5 6 20.8l1.3-6.5L2.5 9.8 9 9z"/>',
    agenda: '<rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8.5 12.5l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>',
    virus: '<circle cx="12" cy="12" r="5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    power: '<path d="M13 2L5 13.5h6L10 22l9-12.5h-6z"/>',
    card: '<rect x="5" y="2.5" width="14" height="19" rx="2.2"/><path d="M8 7h8M8 11h8M8 15h5" stroke="#000" stroke-opacity=".35" stroke-width="1.6"/>',
    deck: '<rect x="7" y="2.5" width="13" height="17" rx="2" opacity=".55"/><rect x="4" y="5" width="13" height="17" rx="2"/>',
    run: '<path d="M4 12h12M11 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 4v16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    sub: '<path d="M6 4v8a4 4 0 0 0 4 4h8M14 12l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/>'
  };
  function icon(name, size, color) {
    return '<svg class="ni" viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '" fill="' + (color || 'currentColor') + '" style="color:' + (color || 'currentColor') + '" aria-hidden="true">' + (PATHS[name] || '') + '</svg>';
  }
  const ICE_SHORT = { barrier: 'Barrier', 'code gate': 'Code gate', sentry: 'Sentry', trap: 'Trap' };

  function subLine(s) {
    switch (s.k) {
      case 'etr': return 'End the run.';
      case 'loseClick': return 'The Runner loses a click.';
      case 'trashProg': return 'Trash a program.';
      case 'brain': return s.n + ' brain damage.';
      case 'net': return s.n + ' net damage.';
      case 'gain': return 'The Corp gains ' + s.n + '.';
      case 'trace': return 'Trace ' + s.n + ': ' + ({ tag: '1 tag.', ichi: '1 tag and 1 brain damage.', raven: 'a power counter here.', gain3: 'the Corp gains 3.', etr: 'end the run.', loseClick: 'the Runner loses a click.', noRun: 'no more runs this turn.', sherlock: 'a program goes back on top of the stack.', flare: 'trash a hardware, 2 meat damage, end the run.', burke: 'the Runner trashes a program.', draco: '1 tag and end the run.', hound: 'look at the top of the stack, trash one.' })[s.then];
      case 'psi': return 'Psi game: ' + (s.then === 'etr' ? 'end the run.' : 'move this ice and the run to another server.');
      case 'sensei': return 'Every other ice this run gains “End the run”.';
      case 'whirlpool': return 'No jacking out this run; trash this.';
      case 'payOrEnd': return 'End the run unless the Runner pays ' + s.n + '.';
      case 'cell': return 'Back to the outermost ice; derez this.';
      case 'chum': return 'Next ice this run +2 strength; 3 net damage unless all of it is broken.';
      case 'dataMine': return '1 net damage, then trash this.';
    }
    return s.k;
  }
  function typeLine(d) {
    if (d.type === 'ice') return 'Ice · ' + d.ice.map(t => ICE_SHORT[t] || t).join(' · ') + (d.kw ? ' · ' + d.kw : '');
    return d.type[0].toUpperCase() + d.type.slice(1) + (d.kw ? ' · ' + d.kw : '');
  }
  /* The words on a card: subroutines for ice, its text otherwise. */
  function words(d) {
    if (d.type === 'ice') return (d.encText ? '<div class="nf-enc">' + esc(d.encText) + '</div>' : '') + (d.clickBreak ? '<div class="nf-enc">The Runner may spend a click to break any subroutine.</div>' : '') +
      (d.advStr ? '<div class="nf-enc">Can be advanced: +' + d.advStr + ' strength per token.</div>' : '') +
      d.subs.map(s => '<div class="nf-sub">' + icon('sub', 12) + esc(subLine(s)) + '</div>').join('');
    return '<div class="nf-txt">' + esc(d.text) + '</div>';
  }

  /* A full card face. o: { size: 'big'|'mid', cls } */
  function face(k, o) {
    o = o || {};
    const d = CARD[k];
    if (!d) return back('corp', o);
    const top = d.type === 'agenda' ? '<span class="nf-adv" title="advancement needed">' + d.adv + '</span>' :
      d.type === 'identity' ? '' : '<span class="nf-cost">' + (d.cost === 'X' ? 'X' : d.cost) + '</span>';
    const foot = [];
    if (d.type === 'agenda') foot.push('<span class="nf-pts">' + icon('agenda', 13) + d.pts + ' point' + (d.pts === 1 ? '' : 's') + '</span>');
    if (d.str != null) foot.push('<span class="nf-str">' + d.str + ' strength</span>');
    if (d.mu) foot.push('<span>' + icon('mu', 13) + d.mu + ' MU</span>');
    if (d.trash != null) foot.push('<span>' + icon('trash', 13) + d.trash + '</span>');
    if (d.link) foot.push('<span>' + icon('link', 13) + '+' + d.link + '</span>');
    if (d.memory) foot.push('<span>' + icon('mu', 13) + '+' + d.memory + '</span>');
    if (d.type === 'identity') foot.push('<span>' + esc(d.title || d.corpName || '') + '</span>');
    return '<div class="nf ' + (o.size || 'mid') + ' ' + (o.cls || '') + '" style="--f:' + facHex(k) + '">' +
      '<div class="nf-pic" style="background-image:url(art/' + esc(k) + '.webp?v=' + ART_VER + ')"></div>' +
      '<div class="nf-head">' + top + '<span class="nf-name">' + (d.uniq ? '◆ ' : '') + esc(d.name) + '</span></div>' +
      '<div class="nf-type">' + esc(typeLine(d)) + '</div>' +
      '<div class="nf-body">' + words(d) + '</div>' +
      '<div class="nf-foot">' + foot.join('') + '</div></div>';
  }
  function back(side, o) {
    o = o || {};
    return '<div class="nf back ' + side + ' ' + (o.size || 'mid') + ' ' + (o.cls || '') + '"><div class="nf-pic" style="background-image:url(art/back_' + side + '.webp?v=' + ART_VER + ')"></div><div class="nf-backtxt">' + (side === 'corp' ? 'CORP' : 'RUNNER') + '</div>' + (o.note ? '<div class="nf-note">' + esc(o.note) + '</div>' : '') + '</div>';
  }

  /* ---------------- a compact line for a card (lists, hands) ---------------- */
  function spine(k, o) {
    o = o || {};
    const d = CARD[k];
    if (!d) return '<span class="ns hidden">' + esc(o.label || 'face down') + '</span>';
    const bits = [];
    if (d.type === 'agenda') bits.push(d.adv + '/' + d.pts);
    else if (d.cost != null && d.type !== 'identity') bits.push(d.cost + icon('credit', 11));
    if (d.str != null) bits.push('str ' + (o.str != null ? o.str : d.str));
    return '<span class="ns" style="--f:' + facHex(k) + '"><b>' + esc(d.name) + '</b><small>' + bits.join(' · ') + '</small></span>';
  }

  /* ---------------- the Corp's servers ----------------
     o: { mine: {iid: k} (the Corp's own view), run (pub.run), light: [iid|sid], small } */
  function iceRow(v, o) {
    o = o || {};
    const run = o.run;
    const enc = run && run.enc && run.enc.iid === v.iid ? run.enc : null;
    const at = run && run.at === v.iid;
    const lit = (o.light || []).indexOf(v.iid) >= 0;
    const tok = (v.adv ? '<span class="nt adv">' + icon('adv', 12) + v.adv + '</span>' : '') + (v.power ? '<span class="nt pow">' + icon('power', 12) + v.power + '</span>' : '') + (v.rez && v.chimera ? '<span class="nt tk">a ' + esc(v.chimera) + '</span>' : '') + (v.cortez ? '<span class="nt">+2 to rez</span>' : '') + (v.hosted && o.rigBy ? v.hosted.map(h => '<span class="nt vir">' + esc((CARD[(o.rigBy[h] || {}).k] || {}).name || '') + ((o.rigBy[h] || {}).virus ? ' ' + (o.rigBy[h] || {}).virus : '') + '</span>').join('') : '') + (v.tink ? '<span class="nt tk">every type</span>' : '') + (v.boost ? '<span class="nt">+' + v.boost + '</span>' : '') +
      (v.chosted ? v.chosted.map(h => '<span class="nt tk">' + esc(h.k ? CARD[h.k].name : 'a card') + '</span>').join('') : '') + (v.note ? '<span class="nt">' + esc(v.note) + '</span>' : '');
    if (!v.rez) {
      const k = o.mine && o.mine[v.iid];
      return '<div class="ir down' + (at ? ' at' : '') + (lit ? ' lit' : '') + '" data-iid="' + esc(v.iid) + '"><span class="ir-n">' + (k ? esc(CARD[k].name) + ' <small>unrezzed · ' + CARD[k].cost + ' to rez</small>' : 'Unrezzed ice') + '</span>' + tok + '</div>';
    }
    const d = CARD[v.k];
    const str = enc ? enc.str : v.str;
    /* Subroutines as they stand: advanced ones (Woodcutter) and Sensei's extras included. */
    let subs = enc && enc.subs ? enc.subs : d.subs.slice();
    if (!enc && d.advSub) for (let k = 0; k < (v.adv || 0); k++) subs.push(d.advSub);
    const types = v.chimera ? [v.chimera] : d.ice;
    return '<div class="ir up' + (at ? ' at' : '') + (enc ? ' enc' : '') + (lit ? ' lit' : '') + '" style="--f:' + facHex(v.k) + '" data-iid="' + esc(v.iid) + '">' +
      '<div class="ir-top"><span class="ir-n">' + esc(d.name) + '</span><span class="ir-t">' + esc(types.map(t => ICE_SHORT[t] || t).join(' · ') || 'no type') + '</span>' + tok + '<span class="ir-s">' + str + '</span></div>' +
      (o.small ? '' : '<div class="ir-subs">' + subs.map((s, i) => '<span class="' + (enc ? (enc.broken[i] ? 'brk' : enc.fired.indexOf(i) >= 0 ? 'fire' : '') : '') + '">' + icon('sub', 11) + esc(subLine(s)) + '</span>').join('') + '</div>') + '</div>';
  }
  function rootCard(c, o) {
    o = o || {};
    const lit = (o.light || []).indexOf(c.iid) >= 0;
    const acc = o.run && o.run.accessing && o.run.accessing.iid === c.iid;
    const tok = (c.adv ? '<span class="nt adv">' + icon('adv', 12) + c.adv + '</span>' : '') + (c.cred ? '<span class="nt cr">' + icon('credit', 12) + c.cred + '</span>' : '') +
      (c.power ? '<span class="nt pow">' + icon('power', 12) + c.power + '</span>' : '') + (c.agenda ? '<span class="nt tk">' + c.agenda + ' counters</span>' : '') + (c.note ? '<span class="nt">' + esc(c.note) + '</span>' : '');
    /* Cards a Corp card carries (Full Immersion RecStudio, Worlds Plaza, a condition). */
    const carried = c.chosted && c.chosted.length ? '<div class="rc-on">' + c.chosted.map(h => rootCard(h, o)).join('') + '</div>' : '';
    if (!c.rez && !c.k) {
      const k = o.mine && o.mine[c.iid];
      return '<div class="rc down' + (lit ? ' lit' : '') + (acc ? ' acc' : '') + '" data-iid="' + esc(c.iid) + '"><span class="rc-n">' + (k ? esc(CARD[k].name) + ' <small>' + (CARD[k].type === 'agenda' ? CARD[k].adv + ' to score' : 'unrezzed') + '</small>' : 'Face-down card') + '</span>' + tok + carried + '</div>';
    }
    return '<div class="rc up' + (lit ? ' lit' : '') + (acc ? ' acc' : '') + '" style="--f:' + facHex(c.k) + '" data-iid="' + esc(c.iid) + '"><span class="rc-n">' + esc(CARD[c.k].name) + (c.rez ? '' : ' <small>face up</small>') + '</span>' + tok + carried + '</div>';
  }
  function servers(pub, o) {
    o = o || {};
    const C = pub.corp;
    const run = pub.run;
    const rigBy = {};
    for (const r of pub.runner.rig) rigBy[r.iid] = r;
    const oo = Object.assign({ run, rigBy }, o);
    return '<div class="srvs">' + C.servers.map(s => {
      const target = run && run.sid === s.id;
      const lit = (o.light || []).indexOf(s.id) >= 0;
      let box = '';
      if (s.id === 'hq') box = '<div class="sv-pile">' + icon('card', 14) + C.hqN + ' in hand' + (C.handMax !== 5 ? ' · max ' + C.handMax : '') + '</div>';
      if (s.id === 'rd') box = '<div class="sv-pile">' + icon('deck', 14) + C.rdN + ' in R&D</div>';
      if (s.id === 'arch') box = '<div class="sv-pile">' + icon('trash', 14) + C.arch.up.length + ' up · ' + C.arch.down + ' down</div>';
      const ice = s.ice.slice().reverse();
      return '<div class="sv' + (target ? ' target' : '') + (lit ? ' lit' : '') + (/^r\d/.test(s.id) ? ' remote' : '') + '" data-sid="' + esc(s.id) + '">' +
        '<div class="sv-ice">' + (ice.length ? ice.map(v => iceRow(v, oo)).join('') : '<div class="ir none">no ice</div>') + '</div>' +
        '<div class="sv-root"><div class="sv-name">' + (target ? icon('run', 14) : '') + esc(s.name) + '</div>' + box + s.root.map(c => rootCard(c, oo)).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------------- currents, and an open grip ---------------- */
  function currents(pub) {
    const cur = pub.corp.cur.map(k => ({ k, side: 'Corp' })).concat(pub.runner.cur.map(k => ({ k, side: 'Runner' })));
    const open = pub.runner.gripOpen;
    if (!cur.length && !open) return '';
    return '<div class="curs">' + cur.map(c => '<span class="cur" style="--f:' + facHex(c.k) + '" data-k="' + esc(c.k) + '">' + icon('card', 12) + 'Current (' + c.side + '): <b>' + esc(CARD[c.k].name) + '</b></span>').join('') +
      (open ? '<span class="cur open">The Runner’s grip is open: <b>' + esc(open.map(k => CARD[k].name).join(', ') || 'empty') + '</b></span>' : '') + '</div>';
  }

  /* ---------------- the Runner's rig ---------------- */
  function rig(pub, o) {
    o = o || {};
    const R = pub.runner;
    const rows = { program: [], hardware: [], resource: [] };
    const iceNames = {};
    for (const s of pub.corp.servers) for (const v of s.ice) iceNames[v.iid] = (v.rez ? CARD[v.k].name : 'an unrezzed ice') + ' (' + s.name + ')';
    const byIid = {};
    for (const c of R.rig) byIid[c.iid] = c;
    for (const c of R.rig) {
      const d = CARD[c.k];
      const tok = (c.virus ? '<span class="nt vir">' + icon('virus', 12) + c.virus + '</span>' : '') + (c.cred ? '<span class="nt cr">' + icon('credit', 12) + c.cred + '</span>' : '') + (c.rc ? '<span class="nt rc">' + icon('credit', 12) + c.rc + ' to spend</span>' : '');
      const where = c.host ? (byIid[c.host] ? 'on ' + CARD[byIid[c.host].k].name : 'on ' + (iceNames[c.host] || 'ice')) : '';
      const lit = (o.light || []).indexOf(c.iid) >= 0;
      rows[d.type].push('<div class="rg' + (lit ? ' lit' : '') + '" style="--f:' + facHex(c.k) + '" data-k="' + esc(c.k) + '"><span class="rg-n">' + esc(d.name) + '</span>' +
        (d.brk ? '<span class="rg-s">' + c.str + '</span><span class="rg-b">' + esc((d.brk.type === 'any' ? 'any ice' : d.brk.type)) + '</span>' : '') + tok +
        (c.power ? '<span class="nt pow">' + icon('power', 12) + c.power + '</span>' : '') + (c.note ? '<span class="nt">' + esc(c.note) + '</span>' : '') +
        (where ? '<small class="rg-w">' + esc(where) + '</small>' : '') + (c.mark ? '<small class="rg-w">marks ' + esc(iceNames[c.mark] || 'an ice') + '</small>' : '') + '</div>');
    }
    const row = (t, label) => '<div class="rgrow"><span class="rgl">' + label + '</span>' + (rows[t].length ? rows[t].join('') : '<span class="rg none">none</span>') + '</div>';
    /* Personal Workshop: cards waiting on it, a power counter off each turn. */
    /* Cards waiting on another card (Personal Workshop, Customized Secretary, BMI
       Buffer) or set aside (Ayla): face down ones are known to the Runner alone. */
    const mine = {};
    for (const w of o.wsMine || []) mine[w.iid] = w.k;
    const onWhat = w => w.host && byIid[w.host] ? 'on ' + CARD[byIid[w.host].k].name : w.host ? 'set aside' : 'on Personal Workshop';
    const ws = (R.ws || []).map(w => { const k = w.k || mine[w.iid]; return k ? '<div class="rg" style="--f:' + facHex(k) + '" data-k="' + esc(k) + '"><span class="rg-n">' + esc(CARD[k].name) + (w.k ? '' : ' <small>(only you know)</small>') + '</span>' + (w.power ? '<span class="nt pow">' + icon('power', 12) + w.power + '</span>' : '') + '<small class="rg-w">' + esc(onWhat(w)) + '</small></div>' : '<div class="rg down"><span class="rg-n">Face-down card</span><small class="rg-w">' + esc(onWhat(w)) + '</small></div>'; });
    const fdMine = {};
    for (const f of o.fdMine || []) fdMine[f.iid] = f.k;
    const fd = (R.fd || []).map(f => '<div class="rg down"><span class="rg-n">' + (fdMine[f.iid] ? esc(CARD[fdMine[f.iid]].name) + ' <small>(face down)</small>' : 'Face-down card') + '</span></div>');
    return '<div class="rig">' + row('program', 'Programs · ' + R.mu.used + '/' + R.mu.total + ' MU') + row('hardware', 'Hardware') + row('resource', 'Resources') +
      (fd.length ? '<div class="rgrow"><span class="rgl">Installed face down</span>' + fd.join('') + '</div>' : '') +
      (ws.length ? '<div class="rgrow"><span class="rgl">Waiting</span>' + ws.join('') + '</div>' : '') + '</div>';
  }

  function styles() {
    return '<style>' + `
.ni{vertical-align:-.15em;flex:none}
.nf{position:relative;overflow:hidden;border-radius:.8em;background:linear-gradient(170deg,color-mix(in srgb,var(--f) 34%,#10151c) 0%,#10151c 60%);border:.14em solid var(--f);color:#eef3f8;display:flex;flex-direction:column;aspect-ratio:300/418;min-width:0;font-size:1em;text-align:left}
.nf.big{font-size:1.15em}
.nf-pic{position:absolute;inset:0;background-size:cover;background-position:center;display:none}
.nr-art .nf.big .nf-pic,.nr-art .nf.back .nf-pic{display:block}
.nr-art .nf.big>:not(.nf-pic){visibility:hidden}
.nf-head{display:flex;align-items:center;gap:.4em;padding:.45em .5em .2em}
.nf-cost,.nf-adv{flex:none;min-width:1.6em;height:1.6em;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;background:#0b0f14;border:.12em solid var(--f);font-size:.95em}
.nf-adv{border-radius:.35em}
.nf-name{font-weight:900;font-size:1.02em;line-height:1.1}
.nf-type{font-size:.7em;color:#b9c4d0;padding:0 .7em .3em;text-transform:uppercase;letter-spacing:.06em}
.nf-body{flex:1;padding:.3em .65em;font-size:.82em;line-height:1.28;display:flex;flex-direction:column;gap:.3em;background:rgba(5,8,12,.45)}
.nf-sub{display:flex;gap:.3em;align-items:flex-start}
.nf-enc{color:#d6dde6;font-style:italic}
.nf-foot{display:flex;flex-wrap:wrap;gap:.25em .7em;padding:.35em .6em .45em;font-size:.78em;font-weight:800;color:#dfe7ef}
.nf-foot span{display:inline-flex;align-items:center;gap:.25em}
.nf-pts{color:#ffd36b}
.nf.back{background:linear-gradient(160deg,#1d2a3a,#0a0e14);border-color:#3c5068;align-items:center;justify-content:center}
.nf.back.runner{background:linear-gradient(160deg,#3a1d1d,#140a0a);border-color:#6b3c3c}
.nf-backtxt{font-weight:900;letter-spacing:.3em;color:#7d93ad;font-size:1.1em}
.nf-note{position:relative;margin-top:.5em;font-size:.8em;color:#c6d2de;text-align:center;padding:0 .4em}
.nr-art .nf.back .nf-backtxt{display:none}
.ns{display:inline-flex;align-items:baseline;gap:.4em;border-left:.25em solid var(--f,#555);background:rgba(255,255,255,.05);border-radius:.35em;padding:.1em .5em;white-space:nowrap}
.ns small{color:#9fb0c2}
.ns.hidden{color:#8fa0b3;font-style:italic}
.nt{display:inline-flex;align-items:center;gap:.2em;font-size:.8em;font-weight:800;border-radius:.4em;padding:0 .35em;background:#233142;color:#dfe8f2;white-space:nowrap}
.nt.adv{background:#5a4512;color:#ffd36b}
.nt.pow{background:#24324a;color:#9cc4ff}
.nt.vir{background:#163b22;color:#7ee39a}
.nt.cr{background:#2c2c10;color:#f2e27a}
.nt.rc{background:#1b2c3f;color:#9fd0ff}
.nt.tk{background:#3b1d4a;color:#e2b8ff}
.srvs{display:flex;gap:.6em;align-items:flex-end;min-width:0}
.sv{display:flex;flex-direction:column;gap:.3em;min-width:0;flex:1 1 0;max-width:15em;border-radius:.6em;padding:.25em;transition:background .3s}
.sv.target{background:rgba(255,80,60,.12);box-shadow:0 0 0 .14em rgba(255,90,70,.7)}
.sv.lit{box-shadow:0 0 0 .14em rgba(255,233,160,.8)}
.sv-ice{display:flex;flex-direction:column;gap:.25em}
.ir{border-radius:.45em;padding:.2em .45em;font-size:.9em;border:.1em solid #34465a;background:#121b26}
.ir.none{border-style:dashed;color:#6d8096;text-align:center;font-size:.75em}
.ir.down{background:repeating-linear-gradient(135deg,#1a2533 0 .4em,#152030 .4em .8em);color:#9fb3c8;display:flex;align-items:center;gap:.4em;flex-wrap:wrap}
.ir.up{border-color:var(--f);background:linear-gradient(90deg,color-mix(in srgb,var(--f) 30%,#121b26),#121b26)}
.ir.at{outline:.16em solid #ff6a50;outline-offset:.05em}
.ir.enc{outline:.2em solid #ff6a50;box-shadow:0 0 1.2em rgba(255,100,80,.55)}
.ir.lit{outline:.16em solid #ffe9a0}
.ir-top{display:flex;align-items:center;gap:.4em;flex-wrap:wrap}
.ir-n{font-weight:900;min-width:0}
.ir-n small{font-weight:600;color:#9fb3c8}
.ir-t{font-size:.72em;color:#aebdcc;text-transform:uppercase;letter-spacing:.05em}
.ir-s{margin-left:auto;font-weight:900;font-size:1.15em;background:#0b0f14;border:.1em solid var(--f);border-radius:50%;min-width:1.5em;height:1.5em;display:flex;align-items:center;justify-content:center}
.ir-subs{display:flex;flex-direction:column;font-size:.78em;color:#d5dee8;margin-top:.1em}
.ir-subs span{display:flex;gap:.25em;align-items:flex-start}
.ir-subs .brk{text-decoration:line-through;color:#6fd18a}
.ir-subs .fire{color:#ff8a72;font-weight:800}
.sv-root{border-radius:.5em;background:#0d141d;border:.1em solid #2a3a4d;padding:.25em .35em;display:flex;flex-direction:column;gap:.2em;min-height:3.2em}
.sv.remote .sv-root{border-color:#3b4f66}
.sv-name{font-weight:900;font-size:.95em;letter-spacing:.04em;display:flex;align-items:center;gap:.3em}
.sv-pile{font-size:.78em;color:#a7b6c6;display:flex;align-items:center;gap:.3em}
.rc{border-radius:.4em;padding:.15em .4em;font-size:.82em;display:flex;align-items:center;gap:.3em;flex-wrap:wrap;border:.1em solid #34465a;background:#152131}
.rc.down{background:repeating-linear-gradient(135deg,#1a2533 0 .4em,#152030 .4em .8em);color:#a9bccf}
.rc.up{border-color:var(--f);background:color-mix(in srgb,var(--f) 22%,#152131)}
.rc.lit{outline:.15em solid #ffe9a0}
.rc.acc{outline:.2em solid #ff6a50}
.rc-n{font-weight:800}
.rc-on{flex-basis:100%;display:flex;flex-direction:column;gap:.15em;padding-left:.6em;border-left:.15em solid #3b4f66;margin-top:.15em}
.curs{display:flex;flex-wrap:wrap;gap:.35em;margin:.25em 0}
.cur{display:inline-flex;align-items:center;gap:.3em;border-left:.25em solid var(--f,#888);background:rgba(255,255,255,.06);border-radius:.35em;padding:.15em .5em;font-size:.85em}
.cur.open{border-left-color:#ff8a5c}
.rg.down{background:repeating-linear-gradient(135deg,#1a2533 0 .4em,#152030 .4em .8em);color:#a9bccf}
.rc-n small{font-weight:600;color:#9fb3c8}
.rig{display:flex;flex-direction:column;gap:.35em}
.rgrow{display:flex;flex-wrap:wrap;gap:.35em;align-items:center}
.rgl{font-size:.7em;text-transform:uppercase;letter-spacing:.1em;color:#9fb0c2;width:9.5em;flex:none}
.rg{display:inline-flex;align-items:center;gap:.35em;border-radius:.45em;padding:.15em .45em;border:.1em solid var(--f,#445);background:color-mix(in srgb,var(--f,#445) 18%,#141c26);flex-wrap:wrap}
.rg.none{border-style:dashed;color:#6d8096;font-size:.8em}
.rg.lit{outline:.15em solid #ffe9a0}
.rg-n{font-weight:800}
.rg-s{font-weight:900;background:#0b0f14;border-radius:50%;min-width:1.4em;height:1.4em;display:inline-flex;align-items:center;justify-content:center;border:.1em solid var(--f)}
.rg-b{font-size:.72em;color:#aebdcc;text-transform:uppercase}
.rg-w{color:#9fb0c2;font-size:.75em}
` + '</style>';
  }
  /* The printed pictures are a layer, switched on only once one loads. */
  function probe() {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    const im = new Image();
    im.onload = () => { if (im.naturalWidth > 0) document.documentElement.classList.add('nr-art'); };
    im.src = 'art/back_corp.webp?v=' + ART_VER;
  }

  const Art = { VERSION, ART_VER, esc, icon, face, back, spine, servers, rig, currents, iceRow, subLine, typeLine, styles, probe, facHex };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  else root.NrArt = Art;
})(typeof window !== 'undefined' ? window : this);
