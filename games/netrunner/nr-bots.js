'use strict';
/* Android: Netrunner — the house. A Corp and a Runner that decide from what
 * their own seat can see — the public view and their seat's half — and never
 * reach into the Game (a test greps this file for that).
 *
 *   answer(pub, me, prompt)   the house's answer to its open question
 *   fallback(pub, me, prompt) something legal, for when an answer is refused
 *
 * One brain per side, priced option by option; the levels (LESSONS-CHECKLIST
 * G1) are that brain made sloppier and, at Easy, without its plan:
 *   hard    noise 0.15 · plans its scoring remote, never leaves a central
 *           open, reads the Runner's breakers before rezzing; the Runner plans
 *           its breaker suite and hits the server most likely to hold points
 *   medium  noise 0.5, the odd slip
 *   easy    noise 1.2, slips, and no plan: the Corp installs agendas where it
 *           likes and the Runner runs wherever it fancies
 * Noise is a hash of what is being decided (seat, turn, the option), never
 * Math.random: seeded games stay reproducible at every level.
 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./nr-data.js') : root.NrData;
  const CARD = D.CARDS;
  const VERSION = 1;

  const LEVEL = {
    easy: { noise: 1.2, slip: 0.25, plan: false, guard: 1, careful: false },
    medium: { noise: 0.5, slip: 0.08, plan: true, guard: 1, careful: false },
    hard: { noise: 0.15, slip: 0, plan: true, guard: 2, careful: true },
    /* How to play: the medium plan, but it never hurts the learner on purpose. */
    gentle: { noise: 0.5, slip: 0.08, plan: true, guard: 1, careful: false, gentle: true }
  };
  /* What a gentle house Corp leaves alone: ambushes it could spring, and plays that hurt. */
  const GENTLE_NO = { edge: 1, snare: 1, junebug: 1, aggSec: 1, ghost: 1, prisec: 1, archangel: 1 };
  const HURTS = { scorched: 1, sea_source: 1, closed_accounts: 1, neural_emp: 1, psychographics: 1, boom: 1, hard_hitting: 1, midseason: 1, big_brother: 1 };
  let TUNE = {};
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  const levelOf = (pub, me) => { const p = pub.players.find(x => x.id === me.id); return (p && p.level) || 'medium'; };
  function L(pub, me) { return Object.assign({}, LEVEL[levelOf(pub, me)] || LEVEL.medium, TUNE[levelOf(pub, me)] || {}); }
  const jitter = (pub, me, key) => (hash(me.id + ':' + pub.turnN + ':' + key) - 0.5) * 2;

  /* ================================================================
     What either side can work out from the table
     ================================================================ */
  const typesOf = v => (v.tink ? ['barrier', 'code gate', 'sentry'] : v.chimera ? [v.chimera] : (CARD[v.k] && CARD[v.k].ice) || []);
  /* Subroutines that stop a run outright when they fire. */
  const STOPS = x => x.k === 'etr' || x.k === 'cell' || x.k === 'payOrEnd' || (x.k === 'psi' && x.then === 'etr') || (x.k === 'trace' && (x.then === 'etr' || x.then === 'draco' || x.then === 'flare'));
  /* The cheapest way the Runner's breakers deal with every subroutine on one
     rezzed ice (null = they cannot). Bioroids may be clicked through. */
  function iceCost(pub, v, credits, clicks) {
    const d = CARD[v.k];
    if (!d || !d.subs) return 0;
    const str = v.str != null ? v.str : d.str;
    const types = typesOf(v);
    let best = null;
    for (const b of pub.runner.rig) {
      const bd = CARD[b.k];
      if (!bd.brk) continue;
      if (bd.brk.type !== 'any' && types.indexOf(bd.brk.type) < 0) continue;
      let ice = str - (pub.runner.rig.some(x => x.k === 'ice_carver') ? 1 : 0);
      let lowers = 0;
      if (bd.brk.zero) { lowers = Math.max(0, ice); ice -= lowers; }
      let pumps = 0;
      if (b.str < ice) { if (!bd.pump) continue; pumps = Math.ceil((ice - b.str) / bd.pump.by); }
      const nSubs = v.subs != null ? v.subs : d.subs.length;
      const total = lowers * (bd.lower ? bd.lower.cost : 0) + pumps * (bd.pump ? bd.pump.cost : 0) + Math.ceil(nSubs / bd.brk.n) * bd.brk.cost;
      if (best == null || total < best) best = total;
    }
    if (d.clickBreak && clicks != null && clicks >= d.subs.length) best = best == null ? 0 : Math.min(best, 0);
    if (d.onEnc === 'toll') best = best == null ? null : best + 3;
    return best;
  }
  /* What a run on a server will cost, as far as the Runner can tell. */
  function runCost(pub, s, credits, clicks) {
    let cost = 0, unknown = 0, stop = false;
    for (const v of s.ice) {
      if (!v.rez) { unknown++; continue; }
      const c = iceCost(pub, v, credits, clicks);
      if (c == null) {
        /* Nothing breaks it: fine only if nothing on it ends the run — and
           what it does instead is priced as if paid in credits. */
        const d = CARD[v.k];
        if (d.subs.some(STOPS) || d.onEnc === 'toll' || d.onEnc === 'raven' || d.onEnc === 'popup') stop = true;
        for (const x of d.subs) cost += x.k === 'trace' ? 2.5 : x.k === 'net' || x.k === 'brain' ? 3 * x.n : x.k === 'trashProg' ? 3 : x.k === 'gain' ? 1 : 0.5;
        continue;
      }
      cost += c;
    }
    return { cost, unknown, stop };
  }
  const handOf = me => (me.hand || []).map(h => h.k);
  /* A later product's card may carry its own hints for the house (sets/*.js):
       bot: { what: (pub, me, prompt) → option id | ids | 'skip' | null }
       botAbil(pub, me, option) → a score for its ability on the turn menu
       botPlay(pub, me) → a score for playing or installing it
       botWin(pub, me, option) → true to use it in a run window
     Each sees only what the house's seat sees (the same two views). */
  const SB = k => (D.SCRIPT && D.SCRIPT[k]) || null;
  function scriptScore(pub, me, o, kind) {
    const sb = SB(o.card);
    if (kind === 'x') {
      if (sb && sb.botAbil) { const v = sb.botAbil(pub, me, o); if (v != null) return v; }
      return o.kind === 'ability' ? 0.8 : -1;
    }
    if (sb && sb.botPlay) { const v = sb.botPlay(pub, me, o); if (v != null) return v; }
    return null;
  }
  const breakerKinds = pub => { const k = {}; for (const b of pub.runner.rig) { const bd = CARD[b.k]; if (bd.brk) k[bd.brk.type] = true; } return k; };

  /* ================================================================
     The answer
     ================================================================ */
  function answer(pub, me, pr) {
    if (!pr) return null;
    const lv = L(pub, me);
    if (pr.t === 'turn') return { t: 'turn', n: pr.n, id: me.side === 'corp' ? corpTurn(pub, me, pr, lv) : runnerTurn(pub, me, pr, lv) };
    if (pr.t === 'enc') return { t: 'enc', n: pr.n, id: encounter(pub, me, pr, lv) };
    return pickAnswer(pub, me, pr, lv);
  }
  function best(pub, me, opts, scoreFn, lv) {
    let top = null, topS = -1e9;
    for (const o of opts) {
      if (o.bad) continue;
      let s = scoreFn(o);
      if (s == null) continue;
      s += jitter(pub, me, o.id) * lv.noise;
      if (lv.slip && s > 0 && hash('slip' + me.id + pub.turnN + o.id + pub.logN) < lv.slip) s -= 3;
      if (s > topS) { topS = s; top = o; }
    }
    return top;
  }

  /* ---------------- the Corp's turn ---------------- */
  function corpTurn(pub, me, pr, lv) {
    const C = pub.corp, R = pub.runner;
    const opts = pr.options;
    const hand = handOf(me);
    const clicks = C.clicks;
    const servers = C.servers;
    const iceOn = sid => (servers.find(s => s.id === sid) || { ice: [] }).ice.length;
    const remoteWithAgendaReady = () => servers.filter(s => /^r\d/.test(s.id) && s.root.some(c => me.mine[c.iid] && CARD[me.mine[c.iid]].type === 'agenda'));
    const plan = corpPlan(pub, me);
    /* Money it should keep: enough to rez the dearest unrezzed ice. */
    let want = 0;
    for (const sv of servers) for (const v of sv.ice) if (!v.rez && me.mine[v.iid]) want = Math.max(want, CARD[me.mine[v.iid]].cost);
    const poor = C.credits < want + 1;
    /* What the face-down ice would cost to rez: ice the Corp cannot pay for stops nothing. */
    let owed = 0;
    for (const sv of servers) for (const v of sv.ice) if (!v.rez && me.mine[v.iid]) owed += CARD[me.mine[v.iid]].cost || 0;
    const short = Math.max(0, Math.min(owed, 14) - C.credits);
    const pick = best(pub, me, opts, o => {
      const [kind, iid] = o.id.split(':');
      const k = o.card;
      const d = k ? CARD[k] : null;
      if (lv.gentle && ((kind === 'play' && HURTS[k]) || kind === 'psf' || kind === 'trashres')) return -9;
      if (kind === 'x') return scriptScore(pub, me, o, 'x');
      if ((kind === 'play' || kind === 'install') && SB(k) && SB(k).botPlay) { const v = scriptScore(pub, me, o, kind); if (v != null) return v; }
      switch (kind) {
        case 'score': return 1000;
        case 'end': return 0;
        case 'draw': return hand.length <= 1 ? 6 : hand.length <= 3 ? 2.6 : 0.4;
        case 'credit': return C.credits < 3 ? 2.6 : poor ? 2.3 : 1.2 + Math.min(1.6, 0.25 * short);
        case 'purge': { const v = R.rig.reduce((s, x) => s + (x.virus || 0), 0); return v >= 3 && clicks === 3 ? 3 + v * 0.6 : -1; }
        case 'trashres': return C.credits >= 4 ? 4.5 : 2;
        case 'psf': return R.tags ? 4 + (pub.runner.gripN <= 1 ? 30 : 0) : -1;
        case 'raven': return 6;
        case 'astro': return 8;
        case 'ab': {
          const kk = me.mine[iid];
          if (kk === 'melange') return clicks === 3 ? 4.5 : -1;
          if (kk === 'sec_sub') return C.credits < 4 ? 1.5 : -1;
          if (kk === 'marked') return C.credits < 6 ? 2.6 : 1.4;
          if (kk === 'private_contracts') return 3.2;
          if (kk === 'ronin') return pub.runner.gripN <= 2 ? 40 : 5;
          return 0;
        }
        case 'sab': {
          const kk = (C.score.find(c => c.iid === iid) || {}).k || me.mine[iid];
          if (kk === 'gov_contracts') return C.credits < 12 ? 4.6 : 1.2;
          if (kk === 'exec_retreat') return hand.length <= 1 ? 4 : -1;
          if (kk === 'datapool') return R.tags ? 0.3 : 1.6;
          if (kk === 'vitruvius' || kk === 'atlas') return 2.4;
          return 0.5;
        }
        case 'rez': {
          const kk = k || me.mine[iid];
          const cd = CARD[kk];
          if (cd.type === 'ice') return -2;            /* rez ice when it is approached */
          if (kk === 'pad' || kk === 'adonis' || kk === 'melange' || kk === 'eve' || kk === 'marked' || kk === 'private_contracts' || kk === 'net_police') return C.credits >= cd.cost ? 5 : -1;
          if (kk === 'ronin') { const rc = servers.flatMap(x => x.root).find(c => c.iid === iid); return rc && rc.adv >= 4 && C.credits >= cd.cost ? 6 : -1; }
          if (kk === 'drt') return R.tags && C.credits >= cd.cost ? 3 : -1;
          if (kk === 'encryption' || kk === 'aiz' || kk === 'chilo') return C.credits >= cd.cost + 3 ? 1.5 : -1;
          if (kk === 'research_station') return hand.length > 4 ? 4 : 1;
          if (kk === 'exp_data' || kk === 'akitaro') return 1;
          if (kk === 'sansan' || kk === 'red_herrings') { const s = servers.find(x => x.root.some(c => c.iid === iid)); return s && s.root.some(c => me.mine[c.iid] && CARD[me.mine[c.iid]].type === 'agenda') ? 5 : -1; }
          if (cd.kw && cd.kw.indexOf('Ambush') >= 0) return -5;   /* an ambush works face down */
          if (kk === 'sec_sub') return C.credits < 3 ? 0.5 : -1;
          return -1;
        }
        case 'adv': {
          const kk = me.mine[iid];
          const cd = CARD[kk];
          const s = servers.find(x => x.root.some(c => c.iid === iid) || x.ice.some(c => c.iid === iid));
          const card = s ? s.root.concat(s.ice).find(c => c.iid === iid) : null;
          if (cd.type === 'agenda') {
            const need = cd.adv - (s && s.root.some(c => c.k === 'sansan') ? 1 : 0);
            const left = need - card.adv;
            /* Advance when it can be scored this turn, or when it is safe enough. */
            if (left <= clicks && C.credits >= left) return 9 + cd.pts;
            /* An advanced card in a remote draws the Runner: advance early only what
               could not otherwise be scored in one turn next time. */
            if (lv.plan && left <= 3) return 0.4;
            return lv.plan ? (s.ice.length >= 1 ? 6 : 2.5) : 3;
          }
          if (cd.type === 'ice') return cd.advable ? (C.credits >= 6 ? 1.4 : -1) : C.credits >= 12 ? 0.6 : -1;
          if (kk === 'ronin') return card.adv < 4 && C.credits >= want + 3 ? 2.2 : -1;
          /* An ambush advanced looks like an agenda — worth a little, when rich. */
          return card.adv < 2 && C.credits >= want + 4 ? 1.6 : -1;
        }
        case 'install': {
          if (d.type === 'ice') {
            const weakest = Math.min(iceOn('hq'), iceOn('rd'));
            const scoring = remoteWithAgendaReady();
            let s = 3.2 - 0.4 * Math.min(iceOn('hq'), iceOn('rd'), 3);
            if (weakest === 0) s += 2.5;
            if (scoring.length && scoring.some(x => x.ice.length < 2)) s += 1.5;
            if (C.credits < d.cost) s -= 1.5;
            if (lv.plan && plan.needRemote) s += 3;
            if (poor && C.credits < d.cost + 2) s -= 1.8;
            s -= 0.3 * short;
            return s;
          }
          if (d.type === 'agenda') {
            /* Can it be installed and scored this turn? */
            const need = d.adv;
            if (need + 1 <= clicks && C.credits >= need) return 12;
            if (!lv.plan) return 3.5;
            if (plan.guarded.length) return 7;
            return plan.agendas >= 3 ? 2 : -1;
          }
          if (d.type === 'asset') {
            if (k === 'pad' || k === 'adonis' || k === 'melange' || k === 'eve' || k === 'private_contracts' || k === 'marked') return 3.4;
            if (k === 'ronin' || k === 'edge') return 1.8;
            if (k === 'drt') return 1.2;
            if (d.kw && d.kw.indexOf('Ambush') >= 0) return 1.8;
            if (k === 'sec_sub') return 0.5;
            return 1;
          }
          if (d.type === 'upgrade') {
            if (k === 'research_station') return 1.5;
            if (k === 'sansan' || k === 'red_herrings') return remoteWithAgendaReady().length ? 3 : 0.6;
            return 1;
          }
          return 0.5;
        }
        case 'play': {
          switch (k) {
            case 'hedge_fund': return C.credits < 15 ? 5.2 : 1;
            case 'beanstalk': return C.credits < 15 ? 4.4 : 0.8;
            case 'biotic_labor': return opts.some(x => x.id.startsWith('adv:')) && C.credits >= 7 ? 4 : 0.2;
            case 'anon_tip': return hand.length <= 3 ? 4 : 1.5;
            case 'scorched': return R.tags ? (pub.runner.gripN <= 4 ? 40 : 6) : -1;
            case 'closed_accounts': return R.credits >= 5 ? 6 : 1;
            case 'neural_emp': return pub.runner.gripN <= 1 ? 30 : 2;
            case 'sea_source': return C.credits >= R.credits + 4 ? 4.5 : 0.5;
            case 'psychographics': return 5;
            case 'kaguya': return 3.5;
            case 'precognition': return 1;
            case 'agg_neg': return 3;
            case 'archived_memories': return pub.corp.arch.up.some(x => x === 'hedge_fund' || CARD[x].type === 'agenda') ? 3 : 0.2;
            case 'mirrormorph': return hand.filter(h => CARD[h].type !== 'operation').length >= 3 ? 3 : 0.3;
            case 'green_level': return C.credits < 12 ? 4 : 1;
            case 'big_brother': return R.tags ? 4 : -1;
            case 'freelancer': return 4;
            case 'foxfire': return C.credits >= 8 ? 3 : 0.5;
            case 'pgo': return C.credits >= 5 ? 3 : 0.5;
            case 'midseason': return C.credits >= R.credits + 4 ? 6 : 0.5;
            case 'oversight': return C.credits < 6 ? 3.5 : 1.5;
            case 'commercialization': return 2;
            case 'trick_light': return opts.some(x => x.id.startsWith('adv:') && CARD[me.mine[x.id.split(':')[1]]] && CARD[me.mine[x.id.split(':')[1]]].type === 'agenda') ? 2.5 : -1;
            case 'sunset': return 0.3;
            case 'rework': return 0.2;
          }
          return 1;
        }
      }
      return 0;
    }, lv);
    return pick ? pick.id : (opts.find(o => !o.bad) || {}).id;
  }

  /* ---------------- the Runner's turn ---------------- */
  function runnerTurn(pub, me, pr, lv) {
    const C = pub.corp, R = pub.runner;
    const opts = pr.options;
    const hand = handOf(me);
    const kinds = breakerKinds(pub);
    const corpIce = {};
    for (const s of C.servers) for (const v of s.ice) if (v.rez) for (const t of typesOf(v)) corpIce[t] = (corpIce[t] || 0) + 1;
    const pick = best(pub, me, opts, o => {
      const [kind, iid] = o.id.split(':');
      const k = o.card;
      const d = k ? CARD[k] : null;
      if (kind === 'x') return scriptScore(pub, me, o, 'x');
      if ((kind === 'event' || kind === 'install') && SB(k) && SB(k).botPlay) { const v = scriptScore(pub, me, o, kind); if (v != null) return v; }
      switch (kind) {
        case 'end': return -50;
        case 'draw': return (hand.length <= 1 ? 5 : hand.length <= 2 ? 2.4 : 0.6) + (lv.careful && hand.length <= (C.ident === 'pe' ? 3 : 2) ? 3 : 0);
        case 'credit': return R.credits < 4 ? 1.8 : 1.0;
        case 'untag': return R.tags ? (C.ident === 'babw' || C.ident === 'making_news' ? 5 : 2.5) + (lv.careful && C.credits >= 3 ? 4 : 0) + Math.min(4, R.tags - 1) : -1;
        case 'run': return runScore(pub, me, o.sid, lv, null);
        case 'ab': {
          const kk = (R.rig.find(x => x.iid === iid) || {}).k;
          if (kk === 'magnum_opus') return 2.2;
          if (kk === 'armitage') return 2.4;
          if (kk === 'crypsis') { const c = R.rig.find(x => x.iid === iid); return c.virus < 2 ? 1.6 : 0.2; }
          if (kk === 'djinn') return 0.5;
          if (kk === 'lemuria') return 0.4;
          if (kk === 'sneakdoor') return runScore(pub, me, 'hq', lv, 'sneak');
          if (kk === 'data_dealer') return pub.runner.points >= pub.win - 1 ? -1 : 0.2;
          const rc = R.rig.find(x => x.iid === iid) || {};
          if (kk === 'liberated') return 2.6;
          if (kk === 'kati') return (rc.cred || 0) >= 6 ? -1 : 1.4;
          if (kk === 'mr_li') return hand.length <= 2 ? 1.8 : 0.6;
          if (kk === 'all_nighter') return R.clicks >= 2 ? 1.2 : -1;
          if (kk === 'dlr') return 0.3;
          if (kk === 'workshop') return 0.4;
          if (kk === 'cortez') return -1;
          return 0.5;
        }
        case 'kati': { const rc = R.rig.find(x => x.iid === iid) || {}; return (rc.cred || 0) >= 6 ? 3 : -1; }
        case 'ws': return R.credits >= 4 ? 1.6 : -1;
        case 'install': {
          if (d.brk) {
            const t = d.brk.type;
            if (t === 'any') return Object.keys(kinds).length >= 2 ? 1 : 5;
            if (!kinds[t]) return 6 + (corpIce[t] || 0) * 1.5 - (lv.plan ? 0 : 3);
            return 0.2;
          }
          switch (k) {
            case 'armitage': return 4.5;
            case 'magnum_opus': return 3.5;
            case 'desperado': return 3.8;
            case 'grimoire': return 1.5;
            case 'toolbox': return 3;
            case 'cyberfeeder': return 2.6;
            case 'akamatsu': return 1.4;
            case 'rabbit_hole': case 'globalsec': return 1.5;
            case 'datasucker': return 2.4;
            case 'medium': return 3;
            case 'parasite': return 2.6;
            case 'net_shield': return C.ident === 'pe' ? 3 : 1.2;
            case 'sneakdoor': return 2;
            case 'personal_touch': return 1.5;
            case 'ice_carver': return 2.2;
            case 'wyldside': return 1.8;
            case 'bank_job': return 1.6;
            case 'crash_space': return C.ident === 'babw' ? 2.5 : 0.8;
            case 'decoy': return C.ident === 'making_news' ? 2.5 : 0.8;
            case 'aesops': return 1;
            case 'sac_construct': return 1;
            case 'djinn': return 0.8;
            case 'lemuria': return 0.4;
            case 'data_dealer': return 0.3;
            case 'liberated': return 3.6;
            case 'kati': return 2.6;
            case 'inside_man': return 2;
            case 'underworld': return 1.6;
            case 'xanadu': return 2;
            case 'spinal_modem': return 2.6;
            case 'dyson': return 2.2;
            case 'dinosaurus': return 2.8;
            case 'hq_interface': return 2.4;
            case 'rd_interface': return 2.6;
            case 'imp': return 2.4;
            case 'nerve_agent': return 2.2;
            case 'deep_thought': return 1.8;
            case 'pheromones': return 1.6;
            case 'plascrete': return C.ident === 'bwbi' || C.ident === 'babw' ? 2.2 : 0.8;
            case 'deus_x': return C.ident === 'pe' || C.ident === 'twiy' ? 1.8 : 0.6;
            case 'muresh': return 1.2;
            case 'snitch': return 1.4;
            case 'e3': return 1.2;
            case 'doppelganger': return 1.8;
            case 'nach': return 1.2;
            case 'mr_li': return 1.2;
            case 'all_nighter': return 1;
            case 'workshop': return 0.5;
            case 'joshua': return 0.4;
            case 'helpful_ai': return 1.4;
            case 'comp_employee': return 1.2;
            case 'sympathy': return 1.2;
            case 'scrubber': return 1;
            case 'dlr': return 0.6;
            case 'cortez': case 'replicator': case 'disrupter': case 'crescentus': return 0.6;
          }
          return 1;
        }
        case 'event': {
          switch (k) {
            case 'sure_gamble': return 5.5;
            case 'easy_mark': return 4.2;
            case 'diesel': return hand.length <= 3 ? 4 : 1.5;
            case 'special_order': return Object.keys(kinds).length < 3 ? 4 : 0.2;
            case 'modded': return 2.8;
            case 'infiltration': return 1.5;
            case 'makers_eye': return runScore(pub, me, 'rd', lv, 'makers') + 1.5;
            case 'account_siphon': return C.credits >= 5 ? runScore(pub, me, 'hq', lv, 'siphon') + 3 : -1;
            case 'demolition_run': return Math.max(runScore(pub, me, 'hq', lv, 'demo'), runScore(pub, me, 'rd', lv, 'demo')) + 0.5;
            case 'inside_job': return bestRun(pub, me, lv, 'inside') + 0.8;
            case 'stimhack': return bestRun(pub, me, lv, 'stim') + 0.5;
            case 'deja_vu': return 0.6;
            case 'tinkering': return 0.3;
            case 'forged': return 1;
            case 'notoriety': return 9;
            case 'quality_time': return hand.length <= 2 ? 4.4 : 1;
            case 'networking': return R.tags ? 2.2 : -1;
            case 'em_shutdown': return 2.6;
            case 'kraken': return 2.8;
            case 'surge': return 1.6;
            case 'test_run': return Object.keys(kinds).length < 3 ? 2.4 : 0.3;
            case 'vamp': return C.credits >= 8 ? runScore(pub, me, 'hq', lv, 'vamp') + 2.5 : -1;
            case 'retrieval': return 0.2;
            case 'indexing': return runScore(pub, me, 'rd', lv, null) + 0.2;
            case 'sat_uplink': return 0.4;
          }
          return 1;
        }
      }
      return 0;
    }, lv);
    return pick ? pick.id : (opts.find(o => !o.bad) || {}).id;
  }
  function bestRun(pub, me, lv, via) {
    let b = -9;
    for (const s of pub.corp.servers) b = Math.max(b, runScore(pub, me, s.id, lv, via));
    return b;
  }
  /* How good a run on a server looks: what is there to find, against what it
     will cost to get in. */
  function runScore(pub, me, sid, lv, via) {
    const C = pub.corp, R = pub.runner;
    const s = C.servers.find(x => x.id === sid);
    if (!s) return -9;
    const extra = via === 'stim' ? 9 : 0;
    const credits = R.credits + extra + (C.bp || 0);
    const rc = runCost(pub, s, credits, R.clicks - 1);
    if (rc.stop) return -3;
    if (rc.cost > credits) return -2;
    let value = 0;
    if (sid === 'rd') value = 3.2 + (via === 'makers' ? 2.5 : 0) + (R.rig.some(x => x.k === 'medium') ? 1 : 0);
    else if (sid === 'hq') value = Math.min(3, C.hqN) * 0.9 + (via === 'siphon' ? 2 : 0);
    else if (sid === 'arch') value = C.arch.down > 0 ? 1 + C.arch.down * 0.3 : 0.2;
    else {
      const root = s.root;
      if (!root.length) value = 0.1;
      else {
        const adv = root.reduce((m, c) => Math.max(m, c.adv || 0), 0);
        const seen = known(pub);
        const hidden = root.some(c => !c.rez && !(seen[c.iid] && CARD[seen[c.iid]].type !== 'agenda' && !c.adv));
        value = hidden ? 2.6 + adv * 1.4 : 0;
        for (const c of root) if (!c.rez && seen[c.iid] && CARD[seen[c.iid]].trash != null && CARD[seen[c.iid]].trash <= credits - rc.cost && ['pad', 'adonis', 'melange', 'sansan'].indexOf(seen[c.iid]) >= 0) value += 2;
        for (const c of root) if (c.rez && ['pad', 'adonis', 'melange', 'sansan'].indexOf(c.k) >= 0) value += (CARD[c.k].trash || 0) <= credits - rc.cost ? 2.5 : 0.3;
        if (via === 'demo') value = 0;
      }
    }
    if (!lv.plan) value = 2.5;
    /* Careful: a thin grip does not walk into unknown ice against Jinteki. */
    if (lv.careful && rc.unknown && R.gripN <= (C.ident === 'pe' ? 3 : 1)) value -= 3;
    /* Unknown ice is a risk; a run with credits in hand is less of one. */
    const risk = rc.unknown * (credits - rc.cost >= 4 ? 0.9 : 2.2);
    const tagRisk = R.tags && C.ident === 'babw' ? 1 : 0;
    const once = (via == null && R.flags && R.flags.ran && sid !== 'rd' && sid !== 'hq') ? 0.5 : 0;
    return value - risk - rc.cost * 0.35 - tagRisk - once + 0.4;
  }

  /* ---------------- an encounter ---------------- */
  function encounter(pub, me, pr, lv) {
    const opts = pr.options.filter(o => !o.bad);
    const R = pub.runner;
    const enc = pub.run && pub.run.enc;
    const d = enc ? CARD[enc.k] : null;
    const all = opts.filter(o => o.kind === 'all').sort((a, b) => a.cost - b.cost)[0];
    const done = opts.find(o => o.id === 'done');
    if (!d) return done ? done.id : opts[0].id;
    const open = enc.broken.map((b, k) => b ? null : k).filter(k => k != null);
    const subs = enc.subs || d.subs;
    /* How much a subroutine hurts if it fires. */
    const pain = k => {
      const s = subs[k];
      if (!s) return 2;
      switch (s.k) {
        case 'etr': return 10;
        case 'cell': return 7;
        case 'net': case 'brain': return s.n >= R.gripN || s.n >= pub.runner.handMax ? 50 : 4 + 2 * s.n;
        case 'trashProg': return R.rig.some(x => CARD[x.k].type === 'program') ? 6 : 0;
        case 'trace': return R.tags || pub.corp.ident === 'babw' ? 5 : 3;
        case 'chum': return 4;
        case 'dataMine': return R.gripN <= 1 ? 50 : 3;
        case 'loseClick': return R.clicks > 0 ? 1.5 : 0;
        case 'gain': return 1;
        case 'psi': return s.then === 'etr' ? 6 : 3;
        case 'payOrEnd': return R.credits >= s.n + 2 ? s.n * 0.7 : 10;
        case 'sensei': return 4;
        case 'whirlpool': return 2;
      }
      return 2;
    };
    const suck = opts.find(o => o.id.startsWith('suck:'));
    const boost = opts.find(o => o.id.startsWith('hai:'));
    const cresc = opts.find(o => o.id.startsWith('cresc:'));
    /* Crescentus is worth spending on dear ice once every subroutine is broken. */
    if (cresc && !open.length && (d.cost || 0) >= 5) return cresc.id;
    /* The Helpful AI, when no breaker can reach the ice yet. */
    if (boost && all == null && opts.filter(o => o.kind === 'break').length === 0 && open.some(k => pain(k) >= 6)) return boost.id;
    /* A Datasucker counter is worth it when the ice is one point out of reach. */
    if (suck && all == null && opts.filter(o => o.kind === 'break').length === 0 && enc.str > 0) return suck.id;
    if (all && open.some(k => pain(k) >= 3)) return all.id;
    /* Otherwise break the most painful subroutine we can afford, one at a time. */
    let top = null, topS = 0;
    for (const o of opts) {
      if (o.kind !== 'break' && o.kind !== 'click') continue;
      const p = (o.subs || []).reduce((s, k) => s + pain(k), 0);
      const s = p - (o.cost || 0) * 0.45 - (o.kind === 'click' ? 1.2 : 0);
      if (s > topS) { topS = s; top = o; }
    }
    if (top) return top.id;
    return done ? done.id : opts[0].id;
  }

  /* ================================================================
     Every other question
     ================================================================ */
  function pickAnswer(pub, me, pr, lv) {
    const legal = pr.options.filter(o => !o.bad);
    const C = pub.corp, R = pub.runner;
    const A = id => ({ t: 'pick', n: pr.n, id });
    const SKIP = { t: 'skip', n: pr.n };
    const yesNo = y => A(y ? 'yes' : 'no');
    const val = k => cardValue(pub, me, k);
    const first = () => legal.length ? A(legal[0].id) : SKIP;
    if (lv.gentle && GENTLE_NO[pr.what]) return legal.some(o => o.id === 'no') ? A('no') : SKIP;
    const by = (fn) => { let b = null, bs = -1e9; for (const o of legal) { const s = fn(o) + jitter(pub, me, pr.what + o.id) * lv.noise * 0.3; if (s > bs) { bs = s; b = o; } } return b; };
    /* A scripted card's own hint for its own question. */
    const sb = pr.src && SB(pr.src);
    if (sb && sb.bot && sb.bot[pr.what]) {
      const r = sb.bot[pr.what](pub, me, pr, lv);
      if (r === 'skip' && pr.skip) return SKIP;
      if (Array.isArray(r) && pr.multi) return { t: 'pick', n: pr.n, ids: r };
      if (r != null && r !== 'skip' && !pr.multi && legal.some(o => o.id === r)) return A(r);
    }
    /* A run window: a scripted card says whether to use it now. */
    if (pr.what === 'rezIce' || pr.what === 'rezServer') {
      const xw = legal.find(o => o.id.startsWith('xw:') && SB(o.card) && SB(o.card).botWin && SB(o.card).botWin(pub, me, o));
      if (xw) return A(xw.id);
    }
    if (pr.multi) {
      let pickN = pr.min;
      if (pr.what === 'kaguya' || pr.what === 'freelancer' || pr.what === 'uplink') pickN = pr.max;
      const sorted = legal.slice().sort((a, b) => {
        if (pr.what === 'discard' || pr.what === 'makeRoom') return val(a.card) - val(b.card);
        if (pr.what === 'kaguya') return advPriority(pub, me, b.id) - advPriority(pub, me, a.id);
        if (pr.what === 'freelancer') return rval(b.card) - rval(a.card);
        return 0;
      });
      return { t: 'pick', n: pr.n, ids: sorted.slice(0, Math.max(pickN, pr.min)).map(o => o.id) };
    }
    switch (pr.what) {
      /* ---- Genesis ---- */
      case 'psi': {
        /* A psi bid is a guess: a hash of the table, never Math.random. */
        const ok = legal.filter(o => +o.id <= 2);
        const h = hash(me.id + ':psi:' + pub.logN + ':' + pub.turnN);
        const w = ok.map(o => o.id === '0' ? 1.2 : o.id === '1' ? 1 : 0.8);
        let t = h * w.reduce((a, b) => a + b, 0);
        for (let i = 0; i < ok.length; i++) { t -= w[i]; if (t <= 0) return A(ok[i].id); }
        return A(ok[ok.length - 1].id);
      }
      case 'chimera': {
        const kinds = breakerKinds(pub);
        return A(by(o => (kinds[o.id] ? 0 : 3) + (o.id === 'sentry' ? 0.2 : 0)).id);
      }
      case 'dracoX': { const x = Math.max(0, Math.min(legal.length - 1, C.credits - 3, 4)); return A(String(x)); }
      case 'aiz': return yesNo(true);
      case 'joshua': return yesNo(false);
      case 'darwin': return yesNo(R.credits >= 5);
      case 'workshop': case 'cortez': case 'surge': case 'houndOrder': case 'sunsetSrv': case 'sunset': return first();
      case 'wsHost': case 'testRun': case 'retrieval': { const o = by(o => rval(o.card)); return o ? A(o.id) : SKIP; }
      case 'mrli': case 'burke': return A(by(o => -rval(o.card)).id);
      case 'plascrete': return A(legal[legal.length - 1].id);
      case 'deusNet': { const n = +((pr.why.match(/all (\d+)/) || [])[1] || 0); return yesNo(n >= R.gripN || n >= 2); }
      case 'nach': return yesNo(R.credits >= 4);
      case 'disrupter': { const n = +((pr.why.match(/strength (\d+)/) || [])[1] || 0); return yesNo(n >= 4); }
      case 'snitch': return yesNo(true);
      case 'snitchJack': {
        const seen = pub.log.slice().reverse().find(e => e.t === 'expose' && e.k);
        if (!seen || !CARD[seen.k] || !CARD[seen.k].subs) return yesNo(false);
        const credits = R.credits + (pub.run ? (pub.run.stim || 0) + (pub.run.bpc || 0) : 0);
        const c = iceCost(pub, { k: seen.k, rez: true }, credits, R.clicks);
        return yesNo(c == null ? CARD[seen.k].subs.some(STOPS) : c > credits);
      }
      case 'doppel': { const o = by(o => runScore(pub, me, o.id, lv, null)); return o && runScore(pub, me, o.id, lv, null) > 0.5 ? A(o.id) : SKIP; }
      case 'bullfrog': return A(by(o => { const sv = C.servers.find(x => x.id === o.id); return sv ? sv.ice.length : 0; }).id);
      case 'sherlock': case 'flare': case 'hound': case 'foxfire': case 'pgo': return A(by(o => rval(o.card)).id);
      case 'trickTo': return A(by(o => advPriority(pub, me, o.id)).id);
      case 'trickFrom': return A(by(o => -advPriority(pub, me, o.id)).id);
      case 'commerce': return A(by(o => +((o.sub || '').match(/\d+/) || [0])[0]).id);
      case 'oversight': case 'shutdown': return A(by(o => (CARD[o.card] ? CARD[o.card].cost : 0) || 0).id);
      case 'rework': return A(by(o => -val(o.card)).id);
      case 'krakenAns': return A(by(o => -((CARD[o.card] ? CARD[o.card].cost : 0) || 0)).id);
      case 'kraken': return A(by(o => { const sv = C.servers.find(x => x.id === o.id); return sv ? (sv.id === 'rd' || sv.id === 'hq' ? 2 : sv.root.length ? 1.5 : 0) + sv.ice.length * 0.2 : 0; }).id);
      case 'networking': return yesNo(R.credits >= 4);
      case 'replicator': return yesNo(true);
      case 'payOrEnd': return A(legal.find(o => o.id === 'pay') ? 'pay' : 'end');
      case 'vamp': {
        const top = Math.max(...legal.map(o => +o.id));
        const x = Math.min(top, C.credits);
        return A(x >= 5 ? String(x) : '0');
      }
      case 'indexing': return yesNo(false);
      case 'indexOrder': return A(by(o => CARD[o.card] && CARD[o.card].type === 'agenda' ? 5 : 0).id);
      case 'edge': return yesNo(true);
      case 'demoAgenda': return A(legal.find(o => o.id === 'steal') ? 'steal' : legal[0].id);
      case 'mulligan': {
        const h = handOf(me).map(k => CARD[k]);
        if (me.side === 'corp') return yesNo(h.some(c => c.type === 'ice') && h.some(c => c.type === 'operation' || c.k === 'pad'));
        return yesNo(h.some(c => c.brk) || h.some(c => c.type === 'event' && (c.id === 'sure_gamble' || c.id === 'easy_mark')) || h.some(c => c.id === 'armitage'));
      }
      case 'startRez': {
        const o = by(o => ['pad', 'adonis'].indexOf(o.card) >= 0 ? 5 : o.card === 'melange' ? 2 : -9);
        return o && ['pad', 'adonis', 'melange'].indexOf(o.card) >= 0 ? A(o.id) : SKIP;
      }
      case 'installTo': return A(installTarget(pub, me, pr, lv));
      case 'rezIce': {
        const o = legal.find(x => x.id === 'rez');
        const nisei = legal.find(x => x.id.startsWith('nisei'));
        if (o) {
          const d = CARD[o.card];
          const cost = +((o.label.match(/\((\d+)\)$/) || [])[1] || d.cost);
          const s = C.servers.find(x => x.ice.some(v => v.iid === (pub.run && pub.run.at)));
          const important = s && (s.id === 'hq' || s.id === 'rd' || s.root.some(c => me.mine[c.iid] && CARD[me.mine[c.iid]].type === 'agenda') || s.root.length);
          const reserve = important ? 0 : 3;
          if (C.credits - cost >= reserve) {
            /* Hard looks at whether the Runner can break it at all. */
            if (lv.plan && levelOf(pub, me) === 'hard') {
              const kinds = breakerKinds(pub);
              const types = d.ice || [];
              const stops = !types.some(t => kinds[t]) && !kinds.any;
              if (stops || important) return A('rez');
              return C.credits - cost >= 6 ? A('rez') : SKIP;
            }
            return A('rez');
          }
        }
        if (nisei && pub.run && (pub.run.sid !== 'arch')) {
          const s = C.servers.find(x => x.id === pub.run.sid);
          if (s && s.root.some(c => me.mine[c.iid] && CARD[me.mine[c.iid]].type === 'agenda')) return A(nisei.id);
        }
        return SKIP;
      }
      case 'rezServer': {
        const nisei = legal.find(x => x.id.startsWith('nisei'));
        const s = pub.run ? C.servers.find(x => x.id === pub.run.sid) : null;
        if (nisei && s && s.root.some(c => me.mine[c.iid] && CARD[me.mine[c.iid]].type === 'agenda')) return A(nisei.id);
        const o = by(o => ['red_herrings', 'sansan'].indexOf(o.card) >= 0 && s && s.root.some(c => c.iid === o.id.split(':')[1]) ? 5 : -9);
        return o && ['red_herrings', 'sansan'].indexOf(o.card) >= 0 ? A(o.id) : SKIP;
      }
      case 'forfeit': return legal.length ? A(legal.slice().sort((a, b) => (CARD[a.card].pts || 0) - (CARD[b.card].pts || 0))[0].id) : SKIP;
      case 'tsX': return A(legal[Math.min(legal.length - 1, 1)].id);
      case 'traceC': {
        /* Beat what the Runner can answer with, if that is affordable. */
        const runnerMax = R.link + R.credits + (pub.run ? (pub.run.stim || 0) + (pub.run.bpc || 0) : 0);
        const base = +((pr.why.match(/Trace (\d+)/) || [])[1] || 0);
        const need = runnerMax - base + 1;
        const avail = legal.length - 1;
        if (need <= 0) return A('0');
        if (need <= avail && need <= C.credits * (levelOf(pub, me) === 'easy' ? 0.5 : 0.7) + 2) return A(String(need));
        return A(String(Math.min(avail, levelOf(pub, me) === 'easy' ? 1 : 0)));
      }
      case 'traceR': {
        const str = +((pr.why.match(/strength (\d+)/) || [])[1] || 0);
        const need = str - R.link;
        const avail = legal.length - 1;
        if (need <= 0) return A('0');
        const hurts = /Ichi|Hunter|Shadow|SEA|Matrix/.test(pr.why) ? 1 : 0.6;
        if (need <= avail && need <= 4 + hurts * 2) return A(String(need));
        return A('0');
      }
      case 'trashProg': return A(by(o => -val(o.card)).id);
      case 'zaibatsu': {
        const pay = legal.find(o => o.id === 'pay');
        return A(pay ? 'pay' : legal.find(o => o.id === 'trash') ? 'trash' : 'no');
      }
      case 'forgedAns': {
        const r = legal.find(o => o.id === 'rez');
        return A(r && C.credits >= 6 ? 'rez' : 'trash');
      }
      case 'snare': return yesNo(R.gripN <= 3 || C.credits >= 8);
      case 'junebug': return yesNo(true);
      case 'aggSec': return yesNo(true);
      case 'ghost': return yesNo(true);
      case 'bounty': return yesNo(C.ident === 'babw' && pub.corp.points + 1 < pub.win && R.credits < 6 && false);
      case 'abt': return yesNo(true);
      case 'prioReq': return legal.length ? A(by(o => +(o.sub || '').replace(/\D+/g, '') || 0).id) : SKIP;
      case 'secSub': return A(by(o => -(CARD[o.card] ? CARD[o.card].cost : 0)).id);
      case 'astroTo': case 'advTo': case 'matrix': {
        if (!legal.length) return SKIP;
        const o = by(o => advPriority(pub, me, o.id));
        return pr.what === 'matrix' && advPriority(pub, me, o.id) < 2 ? SKIP : A(o.id);
      }
      case 'psychoX': return A(legal[legal.length - 1].id);
      case 'archMem': return A(by(o => CARD[o.card].type === 'agenda' ? 6 : o.card === 'hedge_fund' ? 5 : val(o.card)).id);
      case 'mirror': {
        const plan = corpPlan(pub, me);
        const o = by(o => CARD[o.card].type === 'ice' ? 3 : CARD[o.card].type === 'agenda' ? (plan.guarded.length || !lv.plan ? 2 : -5) : 1);
        return o && !(CARD[o.card].type === 'agenda' && lv.plan && !plan.guarded.length) ? A(o.id) : SKIP;
      }
      case 'precog': return A(by(o => CARD[o.card].type === 'agenda' ? 5 : CARD[o.card].type === 'operation' ? 3 : 1).id);
      case 'aggNeg': return A(by(o => CARD[o.card].type === 'agenda' ? 6 - (CARD[o.card].adv || 0) : o.card === 'hedge_fund' ? 3 : 0).id);
      /* ---- the Runner ---- */
      case 'aesops': { const o = by(o => -val(o.card)); return o && val(o.card) < 1 ? A(o.id) : SKIP; }
      case 'netShield': return yesNo(true);
      case 'crash': return yesNo(true);
      case 'decoy': return yesNo(true);
      case 'construct': return yesNo(true);
      case 'hostIce': return A(by(o => { const m = (o.sub || '').match(/strength (-?\d+)/); return -(m ? +m[1] : 9); }).id);
      case 'hostBreaker': return A(by(o => val(o.card)).id);
      case 'djinnHost': return A(legal.find(o => o.id !== 'rig') ? legal.find(o => o.id !== 'rig').id : 'rig');
      case 'femme': return A(by(o => /Unrezzed/.test(o.label) ? 0 : 2).id);
      case 'rabbit': return yesNo(R.credits >= 4);
      case 'djinn': case 'special': return A(by(o => val(o.card)).id);
      case 'expose': return first();
      case 'dealer': return A(by(o => -(CARD[o.card].pts || 0)).id);
      case 'infil': return A(legal.find(o => o.id !== 'gain') && R.credits >= 4 ? legal.find(o => o.id !== 'gain').id : 'gain');
      case 'dejavu': case 'dejavu2': return A(by(o => val(o.card)).id);
      case 'modded': return A(by(o => val(o.card) + (CARD[o.card].cost || 0) * 0.3).id);
      case 'tinker': return first();
      case 'forged': return first();
      case 'runOn': return A(by(o => runScore(pub, me, o.id, lv, null)).id);
      case 'jack': return A(jackOut(pub, me, lv) && !(pr.options.find(o => o.id === 'jack') || {}).bad ? 'jack' : 'go');
      case 'femmeBy': return yesNo(true);
      case 'raven': return A(R.tags >= 2 && pub.corp.ident === 'babw' ? 'end' : 'tag');
      case 'siphon': return A('siphon');
      case 'bankJob': return A(legal[legal.length - 1].id);
      case 'steal': return A(legal.find(o => o.id === 'steal') ? 'steal' : 'leave');
      case 'trash': {
        const c = pub.run && pub.run.accessing;
        const k = c ? c.card : null;
        const price = +(((pr.options.find(o => o.id === 'trash') || {}).label || '').match(/\((\d+)\)/) || [0, 0])[1] || 0;
        const worth = { pad: 4, adonis: 5, melange: 4, sansan: 8, red_herrings: 3, akitaro: 3, exp_data: 2, research_station: 2, troubleshooter: 1, sec_sub: 2, zaibatsu: 1, snare: 0, junebug: 1, agg_sec: 1, ghost_branch: 1,
          eve: 5, marked: 4, private_contracts: 4, net_police: 2, ronin: 4, drt: 3, encryption: 2, ded_server: 2, edge: 1, ash: 3, chilo: 2, aiz: 2, hokusai: 2, bernice: 2, simone: 2, ruhr: 3, midori: 2 }[k];
        const v = worth != null ? worth : (price === 0 ? 1 : 0);
        const canTrash = legal.some(o => o.id === 'trash');
        if (canTrash && v >= price * 0.8 && R.credits - price >= 0 && (price === 0 ? v > 0 : true)) return A('trash');
        if (legal.some(o => o.id === 'imp') && v >= 2) return A('imp');
        return A('leave');
      }
    }
    if (pr.skip && !legal.length) return SKIP;
    return first();
  }
  /* What a Runner's card is worth to the Runner, whoever is asking. */
  function rval(k) {
    const d = CARD[k];
    if (!d) return 0;
    if (d.brk) return 7;
    if (k === 'sure_gamble' || k === 'easy_mark') return 6;
    if (d.type === 'program') return 4;
    if (d.type === 'hardware') return 3.5 + (d.cost || 0) * 0.2;
    return 3 + (d.cost || 0) * 0.1;
  }
  /* What a card is worth keeping (low = discard first). */
  function cardValue(pub, me, k) {
    const d = CARD[k];
    if (!d) return 0;
    if (me.side === 'corp') {
      if (d.type === 'agenda') return 8 + d.pts;
      if (d.type === 'ice') return 4 + d.str * 0.2;
      if (k === 'hedge_fund' || k === 'beanstalk') return 5;
      if (d.type === 'operation' && d.need === 'tagged') return pub.runner.tags ? 6 : 1.5;
      return 3;
    }
    if (d.brk) return 7;
    if (k === 'sure_gamble' || k === 'easy_mark') return 6;
    if (d.type === 'program') return 4;
    if (d.type === 'hardware') return 3.5;
    return 3;
  }
  function advPriority(pub, me, iid) {
    const k = me.mine && me.mine[iid];
    if (!k) return 0;
    const d = CARD[k];
    let adv = 0;
    for (const s of pub.corp.servers) for (const c of s.root.concat(s.ice)) if (c.iid === iid) adv = c.adv;
    if (d.type === 'agenda') return 6 + (adv + 1 >= d.adv ? 4 : 0);
    if (d.advable && d.type === 'asset') return 1.5;
    if (d.type === 'ice') return 1;
    return 0;
  }
  /* The Corp's plan: agendas in hand, and a remote with ice and nothing in it
     to put one in. Without one, the next ice builds it. */
  function corpPlan(pub, me) {
    const agendas = handOf(me).filter(h => CARD[h].type === 'agenda').length;
    const need = L(pub, me).guard || 1;
    /* Ice that will really stand: rezzed, or face down and affordable to rez. */
    const live = x => x.ice.filter(v => v.rez || (me.mine[v.iid] && (CARD[me.mine[v.iid]].cost || 0) <= pub.corp.credits)).length;
    const guarded = pub.corp.servers.filter(x => /^r\d/.test(x.id) && live(x) >= need && !x.root.some(c => me.mine[c.iid] && ['agenda', 'asset'].indexOf(CARD[me.mine[c.iid]].type) >= 0));
    const scoring = pub.corp.servers.some(x => /^r\d/.test(x.id) && x.root.some(c => me.mine[c.iid] && CARD[me.mine[c.iid]].type === 'agenda'));
    const building = pub.corp.servers.filter(x => /^r\d/.test(x.id) && x.ice.length > 0 && x.ice.length < need && !x.root.some(c => me.mine[c.iid] && ['agenda', 'asset'].indexOf(CARD[me.mine[c.iid]].type) >= 0));
    return { agendas, guarded, building, needRemote: agendas > 0 && !guarded.length && !scoring };
  }
  /* What the Runner has seen of the Corp's cards: everything accessed, in the
     public log, plus whatever is rezzed. */
  function known(pub) {
    const out = {};
    for (const e of pub.log) if ((e.t === 'sees' || e.t === 'expose') && e.iid) out[e.iid] = e.k;
    return out;
  }
  function installTarget(pub, me, pr, lv) {
    const legal = pr.options.filter(o => !o.bad);
    const C = pub.corp;
    const m = pr.why.match(/^Install (.+) where\?$/);
    const name = m ? m[1] : '';
    const k = Object.keys(CARD).find(x => CARD[x].name === name);
    const d = CARD[k] || {};
    const srv = id => C.servers.find(s => s.id === id);
    const holds = s => s ? s.root.find(c => me.mine[c.iid] && ['agenda', 'asset'].indexOf(CARD[me.mine[c.iid]].type) >= 0) : null;
    const scoreT = o => {
      const s = srv(o.id);
      if (d.type === 'ice') {
        const n = s ? s.ice.length : 0;
        let v = 5 - n * 1.3 - (o.cost || 0) * 0.6;
        if (s && (s.id === 'hq' || s.id === 'rd')) v += n === 0 ? 3 : 0.4;
        if (s && s.id === 'arch') v -= 2.5;
        if (s && /^r\d/.test(s.id)) {
          const h = holds(s);
          if (h && CARD[me.mine[h.iid]].type === 'agenda') v += 2.5;
          else if (h) v -= 1.5;
          else v += lv.plan ? 1 : 0;
        }
        const cp = corpPlan(pub, me);
        if (cp.needRemote && cp.building.some(b => b.id === o.id)) v += 6;
        if (o.id === 'new') v = lv.plan ? (cp.needRemote && !cp.building.length ? 7 : 1.5) : 1;
        return v;
      }
      if (d.type === 'agenda') {
        if (o.id === 'new') return lv.plan ? 1 : 3;
        if (!s) return 0;
        const h = holds(s);
        if (h && CARD[me.mine[h.iid]].type === 'agenda') return -5;
        return (lv.plan ? s.ice.length * 2 : 1) - (h ? 1.5 : 0);
      }
      if (d.type === 'asset') {
        if (o.id === 'new') return 3;
        const h = holds(s);
        return h ? -4 : 1 + (s ? s.ice.length * 0.3 : 0);
      }
      if (d.type === 'upgrade') {
        if (k === 'research_station') return o.id === 'hq' ? 5 : -9;
        if (k === 'sansan' || k === 'red_herrings') { const h = holds(s); return h && CARD[me.mine[h.iid]].type === 'agenda' ? 5 : s && /^r\d/.test(s.id) ? 1 : 0; }
        if (k === 'akitaro' || k === 'exp_data') return s ? s.ice.length + (s.id === 'rd' || s.id === 'hq' ? 1 : 0) : 0;
        return s && (s.id === 'hq' || s.id === 'rd') ? 2 : 1;
      }
      return 0;
    };
    let top = legal[0], ts = -1e9;
    for (const o of legal) { const v = scoreT(o) + jitter(pub, me, 'it' + o.id) * lv.noise * 0.5; if (v > ts) { ts = v; top = o; } }
    return top.id;
  }
  function jackOut(pub, me, lv) {
    const run = pub.run;
    if (!run) return false;
    const R = pub.runner;
    const s = pub.corp.servers.find(x => x.id === run.sid);
    if (!s || run.stage === 'server' || run.pos < 0) return false;
    /* The next ice inward: if it is rezzed and cannot be broken, leave. */
    const next = s.ice[run.pos];
    if (!next) return false;
    const credits = R.credits + (run.stim || 0) + (run.bpc || 0);
    if (next.rez) {
      const c = iceCost(pub, next, credits, R.clicks);
      const d = CARD[next.k];
      if (c == null) return d.subs.some(x => x.k === 'etr' || x.k === 'net' || x.k === 'brain' || x.k === 'trashProg');
      return c > credits;
    }
    return credits < 2 && lv.plan;
  }

  function fallback(pub, me, pr) {
    if (!pr) return null;
    if (pr.t === 'turn' || pr.t === 'enc') {
      const ok = pr.options.filter(o => !o.bad);
      const pref = ok.find(o => o.id === 'credit') || ok.find(o => o.id === 'done') || ok.find(o => o.id === 'end') || ok[0];
      return { t: pr.t, n: pr.n, id: pref.id };
    }
    const legal = pr.options.filter(o => !o.bad);
    if (pr.multi) return { t: 'pick', n: pr.n, ids: legal.slice(0, pr.min).map(o => o.id) };
    if (pr.skip) return { t: 'skip', n: pr.n };
    return legal.length ? { t: 'pick', n: pr.n, id: legal[0].id } : { t: 'skip', n: pr.n };
  }

  const Bots = { VERSION, answer, fallback, LEVEL, setTune(t) { TUNE = t || {}; }, iceCost, runCost };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
  else root.NrBots = Bots;
})(typeof window !== 'undefined' ? window : this);
