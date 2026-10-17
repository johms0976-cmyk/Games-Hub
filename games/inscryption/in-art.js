'use strict';
/* Inscryption — drawn card faces and sigil icons.
 *
 * Everything is drawn: a parchment card with the name across the top, the
 * cost in blood drops or bones at the top right, a portrait, the sigils in ink
 * along the bottom, Power bottom-left and Health bottom-right.
 *
 * The portrait is a glyph from in-data.js unless a real picture has been
 * dropped in: art/<card id>.png, listed in art/list.js (window.InscArtList).
 * The picture is a layer, never load-bearing — a missing file shows the glyph.
 */
(function (root) {
  const D = root.InscData;

  /* ---------------- sigil icons: 24x24, ink strokes ---------------- */
  const P = {
    airborne: '<path d="M3 15c5-1 9-4 12-10 1 4 0 7-2 9 3 0 5-1 8-3-2 5-7 8-14 8-2 0-3-2-4-4z"/>',
    mightyleap: '<path d="M12 3v14M6 9l6-6 6 6M5 21h14"/>',
    waterborne: '<path d="M2 9c3-3 5 3 8 0s5 3 8 0 3-1 4 0M2 15c3-3 5 3 8 0s5 3 8 0 3-1 4 0"/>',
    sprinter: '<path d="M3 12h15M13 6l6 6-6 6M3 7h6M3 17h6"/>',
    hefty: '<path d="M2 12h12M10 7l5 5-5 5M16 6h5v12h-5z"/>',
    rampager: '<path d="M4 18c2-8 8-11 15-11M15 3l4 4-4 4M4 18l3-4M8 19l2-4"/>',
    burrower: '<path d="M3 18c3-6 15-6 18 0zM12 3v9M8 8l4 4 4-4"/>',
    guardian: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
    fledgling: '<path d="M12 3c-4 0-7 6-7 11a7 7 0 0014 0c0-5-3-11-7-11zM8 12l2 2 2-3 2 3 2-2"/>',
    bonedigger: '<path d="M14 3l7 7-3 3-7-7zM12 9L4 17l3 3 8-8M3 21l2-2"/>',
    quills: '<path d="M3 20L7 6l3 9 2-12 2 12 3-9 4 14"/>',
    boneking: '<path d="M4 9l3 4 5-7 5 7 3-4v8H4zM7 20h10"/>',
    unkillable: '<path d="M6 8a4 4 0 100 8c3 0 9-8 12-8a4 4 0 110 8c-3 0-9-8-12-8z"/>',
    loosetail: '<path d="M3 12c4-6 8 6 12 0 2-3 4-3 6-1M15 12l3 6"/>',
    worthy: '<path d="M6 4c-2 3-1 6 2 7M18 4c2 3 1 6-2 7M8 11h8l-1 6-3 3-3-3z"/>',
    stinky: '<path d="M6 21c-3-4 3-6 0-10s2-6 0-8M12 21c-3-4 3-6 0-10s2-6 0-8M18 21c-3-4 3-6 0-10s2-6 0-8"/>',
    scavenger: '<path d="M5 20l3-9M10 20l1-11M15 20l-1-11M20 20l-3-9M6 9c2-4 10-4 12 0"/>',
    madeofstone: '<path d="M4 18l2-9 6-5 7 4 2 10zM9 10l4 3 2 6M6 9l7 4"/>',
    kraken: '<path d="M12 3c-4 0-6 4-5 8 1 3-3 4-4 8M12 3c4 0 6 4 5 8-1 3 3 4 4 8M10 12c-1 4 1 6 0 9M14 12c1 4-1 6 0 9"/>',
    rabbithole: '<path d="M4 19h16M7 19c0-4 2-6 5-6s5 2 5 6M9 13L7 4l3 5M15 13l2-9-3 5"/>',
    beeswithin: '<path d="M12 3l7 4v8l-7 4-7-4V7zM12 8v6M9 11h6"/>',
    dam: '<path d="M3 8h18M3 13h18M3 18h18M7 6v14M17 6v14"/>',
    fecundity: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
    corpseeater: '<path d="M4 9l3 3 3-3 2 3 2-3 3 3 3-3M4 15l3-3M20 15l-3-3M6 18c4 3 8 3 12 0"/>',
    antspawner: '<circle cx="7" cy="12" r="2.5"/><circle cx="12" cy="12" r="3"/><circle cx="17.5" cy="12" r="3.5"/><path d="M10 9l-2-4M14 9l2-4M10 15l-2 4M14 15l2 4"/>',
    leader: '<path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16l-5.4 3.2 1.3-6-4.5-4 6-.6z"/>',
    morsel: '<path d="M14 4a6 6 0 016 6c0 4-4 6-8 5l-6 6-3-3 6-6c-1-4 1-8 5-8z"/>',
    bloodlust: '<path d="M12 3c3 5 6 8 6 12a6 6 0 01-12 0c0-4 3-7 6-12zM10 13l2 4 2-4"/>',
    amorphous: '<path d="M6 8c2-5 9-5 12-1s1 6 3 9-4 6-8 4-9 1-10-3 1-6 3-9z"/><path d="M11 10c0-2 3-2 3 0s-2 2-2 4M12 17v.5"/>',
    frozenaway: '<path d="M12 2v20M3 7l18 10M3 17L21 7M9 4l3 3 3-3M9 20l3-3 3 3"/>',
    touch: '<path d="M12 3a7 7 0 00-7 7c0 3 1 4 2 5v3h10v-3c1-1 2-2 2-5a7 7 0 00-7-7z"/><circle cx="9" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/><path d="M10 18v3M14 18v3"/>',
    hoarder: '<path d="M4 9h16v11H4zM4 9l3-5h10l3 5M10 13h4"/>',
    manylives: '<path d="M5 20V8l3 3h8l3-3v12zM9 15h.5M15 15h.5M11 18h2"/>',
    bifurcated: '<path d="M12 21v-8M12 13L5 5M12 13l7-8M5 5v4M5 5h4M19 5v4M19 5h-4"/>',
    doublestrike: '<path d="M6 21L14 3M10 21l8-18M4 8h5M12 8h5"/>',
    armored: '<path d="M5 5h14v7c0 5-3 8-7 9-4-1-7-4-7-9zM5 10h14M12 5v16"/>',
    brood: '<path d="M12 3c-4 0-7 6-7 11a7 7 0 0014 0c0-5-3-11-7-11zM12 9v6M9 12h6"/>',
    repulsive: '<circle cx="12" cy="12" r="8"/><path d="M6 6l12 12"/>',
    bellist: '<path d="M6 17c1-2 1-4 1-7a5 5 0 0110 0c0 3 0 5 1 7zM4 17h16M10 20h4M12 3v2"/>',
    finical: '<path d="M12 3c-4 0-7 6-7 11a7 7 0 0014 0c0-5-3-11-7-11z"/><circle cx="9" cy="14" r="1.2"/><circle cx="12" cy="11" r="1.2"/><circle cx="15" cy="14" r="1.2"/>',
    trifurcated: '<path d="M12 21v-9M12 12V3M12 12L4 5M12 12l8-7M9 6l3-3 3 3M4 5v4M4 5h4M20 5v4M20 5h-4"/>',
    trinket: '<path d="M7 9h10l2 11H5zM9 9a3 3 0 016 0M12 13v3"/>',
    steeltrap: '<path d="M3 15h18M4 15l2-6 2 6 2-6 2 6 2-6 2 6 2-6 2 6M6 19h12"/>',
    omni: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
    tidallock: '<path d="M15 3a9 9 0 100 18 7 7 0 010-18z"/>',
    annoying: '<path d="M12 3v11M12 18v2"/><circle cx="12" cy="12" r="10"/>'
  };
  function icon(id, cls) {
    const body = P[id] || '<circle cx="12" cy="12" r="7"/>';
    return '<svg class="sg ' + (cls || '') + '" viewBox="0 0 24 24" aria-label="' + ((D.SIGILS[id] || {}).name || id) + '"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + '</g></svg>';
  }
  /* The variable-Power symbols. */
  const STAT_G = { ants: '🐜', bell: '🔔', hand: '✋', mirror: '🪞', bones: '🦴', spilled: '🩸' };

  /* ---------------- cost ---------------- */
  const DROP = '<svg viewBox="0 0 10 14"><path d="M5 1C3 5 1 7 1 9.5a4 4 0 008 0C9 7 7 5 5 1z" fill="#8b1a14"/></svg>';
  const BONE = '<svg viewBox="0 0 14 10"><path d="M3 2a2 2 0 013 1l3 0a2 2 0 113 2 2 2 0 11-3 2H6a2 2 0 11-3-2 2 2 0 010-3z" fill="#e8e0cc" stroke="#3a2c1a" stroke-width="1"/></svg>';
  function costHtml(blood, bones) {
    if (blood) return '<div class="cost bl">' + (blood <= 4 ? DROP.repeat(blood) : DROP + '<b>×' + blood + '</b>') + '</div>';
    if (bones) return '<div class="cost bo">' + (bones <= 3 ? BONE.repeat(bones) : BONE + '<b>×' + bones + '</b>') + '</div>';
    return '';
  }

  /* ---------------- portraits ---------------- */
  const ART = new Set((root.InscArtList || []));
  /* Both layers when a picture exists: the page shows one or the other
     (body.glyphs = the drawn glyphs, by the player's choice). */
  const hasArt = id => ART.has(id);
  function portrait(id, g) {
    const glyph = '<div class="pic gl"><span>' + (g || '❔') + '</span></div>';
    if (!ART.has(id)) return glyph;
    return '<div class="pic art" style="background-image:url(art/' + id + '.png)"></div>' + glyph;
  }

  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  /* A card face from a view ({ id, name, p, h, mh, stat, sig, gx, tt, blood, bones, ... })
     or a deck entry turned into one by fromEntry(). opts: { cls, back, label } */
  function face(v, opts) {
    opts = opts || {};
    if (!v) return '';
    if (opts.back) {
      return '<div class="card back ' + (opts.cls || '') + '"><div class="backin">' + (opts.label ? '<b>' + esc(opts.label) + '</b>' : '') + '</div></div>';
    }
    const d = D.card(v.as || v.id) || {};
    const cls = ['card'];
    if (d.terrain) cls.push('terrain');
    if (d.pelt) cls.push('pelt');
    if (d.pool === 'r') cls.push('rare');
    if (d.death) cls.push('death');
    if (d.giant) cls.push('giant');
    if (v.fused) cls.push('fused');
    if (hasArt(v.as || v.id)) cls.push('hasart');
    if (opts.cls) cls.push(opts.cls);
    const hurt = v.h < v.mh;
    const p = v.stat ? '<span class="st" title="' + esc((D.STATS[v.stat] || {}).name || '') + '">' + (STAT_G[v.stat] || '?') + (v.p != null ? '<i>' + v.p + '</i>' : '') + '</span>' : (v.p != null ? v.p : '');
    const sigs = (v.sig || []).map(s => icon(s, (v.gx && v.gx.indexOf(s) >= 0 ? 'gained' : '') + (v.tt === s ? ' totem' : '') + ((s === 'sprinter' || s === 'hefty' || s === 'rampager') && v.dir < 0 ? ' flip' : ''))).join('');
    return '<div class="' + cls.join(' ') + '" data-u="' + (v.u || '') + '">' +
      '<div class="nm">' + esc(v.name) + '</div>' +
      costHtml(v.blood, v.bones) +
      portrait(v.as || v.id, d.g) +
      (sigs ? '<div class="sigs n' + Math.min(4, v.sig.length) + '">' + sigs + '</div>' : '') +
      (d.terrain && !v.p ? '' : '<div class="pw">' + p + '</div>') +
      '<div class="hp' + (hurt ? ' hurt' : '') + '">' + v.h + '</div>' +
      (v.hooked ? '<div class="tag hook">🪝</div>' : '') +
      (v.sleepy ? '<div class="tag zz">z</div>' : '') +
      (v.armorUsed === undefined && (v.sig || []).indexOf('armored') >= 0 ? '' : '') +
      '</div>';
  }

  /* A deck entry ({ id, a, h, x, n, fused }) as a view. */
  function fromEntry(e) {
    const d = D.card(e.id);
    const sig = d.sig.concat((e.x || []).filter(s => d.sig.indexOf(s) < 0));
    return {
      id: e.id, name: e.n || d.name, p: d.stat ? null : d.atk + (e.a || 0), h: d.hp + (e.h || 0), mh: d.hp + (e.h || 0),
      stat: d.stat, sig, gx: (e.x || []).slice(), blood: d.blood, bones: d.bones, tribes: d.tribes, fused: e.fused, dir: 1
    };
  }

  root.InscArt = { icon, face, fromEntry, costHtml, portrait, hasArt, esc, STAT_G, count: () => ART.size };
})(typeof window !== 'undefined' ? window : this);
