/* The hub's sound effects for a telly page — synthesised live with Web Audio,
   no audio files needed. Hoisted from Dead of Winter's dow-sound.js
   (docs/GAME-AUDIT.md, "build once"): a game names its cues, it does not
   carry an audio engine.

     HubSound.armUnlock()                 unlock on the first click or key on this page (browsers keep a page
                                          silent until someone touches it); call once at load
     HubSound.unlock()                    unlock now, from inside a click/key handler
     HubSound.setEnabled(bool)            the room's sound on/off
     HubSound.play(name, { delay, pan, gain, pitch })   one cue; returns false when silent
     HubSound.roll(seconds, { gain })     a drum roll that swells and stops on a hit
     HubSound.define(name, fn(t, o, K))   a game's own cue, built from the kit K (see below)
     HubSound.sample(name, url)           a recorded file that replaces a cue once it loads
     HubSound.quiet(bool)                 duck everything but the named "scene" cues (a finale playing)

   The built-in cues: tick, flip, thump, chime, sting, gong, coin, sparkle, whoosh, step, beat, hit,
   cheer, fanfare, rise, dig, growl.

   Never load-bearing: without Web Audio (jsdom, an old browser) every call is a no-op, so the tests
   and a muted telly behave exactly the same. Nothing here knows any rules. */
(function (root) {
  'use strict';
  const AC = root.AudioContext || root.webkitAudioContext;
  let ctx = null, master, comp, sfx, scene, noiseBuf = null;
  const SAMPLES = {};
  const state = { enabled: true, quiet: false };

  function makeNoise(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function build() {
    if (ctx || !AC) return !!ctx;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    noiseBuf = makeNoise(2.5);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    scene = ctx.createGain(); scene.gain.value = 1; scene.connect(master);
    return true;
  }
  const now = () => ctx.currentTime;
  const ramp = (param, v, t) => { try { param.cancelScheduledValues(now()); param.setTargetAtTime(v, now(), (t || 0.6) / 3); } catch (e) {} };
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------------- the kit a cue is built from ---------------- */
  function out(pan, bus) {
    const g = ctx.createGain();
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); p.connect(bus || sfx); }
    else g.connect(bus || sfx);
    return g;
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f, t, dur, dest) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; }
  function burst(t, dur, dest, rate) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; if (rate) s.playbackRate.value = rate; s.connect(dest); s.start(t, Math.random() * 2, dur + 0.05); return s; }
  function filt(type, f, q, dest) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; b.connect(dest); return b; }
  const K = { out, env, osc, burst, filt, rnd, get ctx() { return ctx; }, get sfx() { return sfx; }, get scene() { return scene; } };

  /* ---------------- the built-in cues ----------------
     o: { pan, gain, pitch (a multiplier), bus } — bus 'scene' plays through a finale's quiet. */
  const P = o => o.pitch || 1;
  const bus = o => o.bus === 'scene' ? scene : sfx;
  const FX = {
    tick(t, o) { const g = out(o.pan, bus(o)); env(g, t, 0.003, 0.3 * o.gain, 0.12); osc('triangle', 1250 * P(o), t, 0.15, filt('bandpass', 1800 * P(o), 3, g)); },
    flip(t, o) {
      const g = out(o.pan, bus(o)); env(g, t, 0.004, 0.32 * o.gain, 0.09);
      const f = filt('bandpass', 2600, 1.5, g); f.frequency.exponentialRampToValueAtTime(6200, t + 0.09); burst(t, 0.12, filt('highpass', 1800, 0.7, f));
    },
    thump(t, o) {
      const g = out(o.pan, bus(o)); env(g, t, 0.005, 0.8 * o.gain, 0.4);
      const s = osc('sine', 130 * P(o), t, 0.45, g); s.frequency.exponentialRampToValueAtTime(42 * P(o), t + 0.22);
    },
    chime(t, o) { [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => { const g = out(o.pan, bus(o)); env(g, t + k * 0.09, 0.01, 0.16 * o.gain, 1.5); osc('sine', f * P(o), t + k * 0.09, 1.7, g); }); },
    sting(t, o) { const g = out(0, bus(o)); env(g, t, 0.05, 0.45 * o.gain, 1.3); const lp = filt('lowpass', 900, 1, g); [73.4, 77.8, 110].forEach(f => osc('sawtooth', f * P(o), t, 1.5, lp)); },
    gong(t, o) {
      const g = out(o.pan, bus(o)); env(g, t, 0.01, 0.55 * o.gain, 3.2);
      const lp = filt('lowpass', 1600, 0.7, g);
      [98, 147.8, 211, 263, 331].forEach((f, k) => { const s = osc('sine', f * P(o), t, 3.4, lp); s.frequency.exponentialRampToValueAtTime(f * P(o) * 0.985, t + 3); });
      const n = out(o.pan, bus(o)); env(n, t, 0.002, 0.25 * o.gain, 0.3); burst(t, 0.3, filt('bandpass', 420, 1, n));
    },
    coin(t, o) { [1975, 2637].forEach((f, k) => { const g = out(o.pan, bus(o)); env(g, t + k * 0.07, 0.002, 0.16 * o.gain, 0.5); osc('square', f * P(o), t + k * 0.07, 0.55, filt('bandpass', f * P(o), 8, g)); }); },
    sparkle(t, o) {
      for (let k = 0; k < 7; k++) {
        const tk = t + k * rnd(0.04, 0.08), f = rnd(1800, 4200) * P(o);
        const g = out(rnd(-0.5, 0.5), bus(o)); env(g, tk, 0.002, 0.09 * o.gain, rnd(0.3, 0.7)); osc('sine', f, tk, 0.8, g);
      }
    },
    whoosh(t, o) { const g = out(o.pan, bus(o)); env(g, t, 0.18, 0.3 * o.gain, 0.35); const f = filt('bandpass', 400, 1.2, g); f.frequency.exponentialRampToValueAtTime(3200, t + 0.45); burst(t, 0.6, f); },
    step(t, o) { [0, 0.11].forEach((dt, k) => { const g = out(o.pan, bus(o)); env(g, t + dt, 0.005, 0.2 * o.gain, 0.25); osc('triangle', (k ? 660 : 494) * P(o), t + dt, 0.3, g); }); },
    beat(t, o) {
      [[0, 1], [0.16, 0.6]].forEach(([dt, k]) => {
        const g = out(0, bus(o)); env(g, t + dt, 0.012, 0.8 * k * o.gain, 0.16);
        const s = osc('sine', 62, t + dt, 0.22, filt('lowpass', 180, 0.7, g)); s.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      });
    },
    hit(t, o) {        // a cymbal and a bass drum together: the end of a roll
      const g = out(0, bus(o)); env(g, t, 0.002, 0.45 * o.gain, 1.6); burst(t, 1.7, filt('highpass', 5200, 0.6, g));
      FX.thump(t, { pan: 0, gain: o.gain, pitch: 0.8, bus: o.bus });
    },
    cheer(t, o) {      // a crowd: band-limited noise that swells, with claps through it
      const g = out(0, bus(o)); env(g, t, 0.35, 0.32 * o.gain, 2.4);
      const f = filt('bandpass', 1100, 0.5, g); burst(t, 2.8, f, 0.9);
      for (let k = 0; k < 22; k++) {
        const tk = t + 0.2 + k * rnd(0.05, 0.12);
        const c = out(rnd(-0.7, 0.7), bus(o)); env(c, tk, 0.001, 0.18 * o.gain, 0.05); burst(tk, 0.05, filt('bandpass', rnd(1400, 2400), 1.5, c));
      }
    },
    fanfare(t, o) {    // three rising notes and a held chord
      const notes = [[0, 392], [0.16, 523.25], [0.32, 659.25]];
      notes.forEach(([dt, f]) => { const g = out(0, bus(o)); env(g, t + dt, 0.01, 0.2 * o.gain, 0.22); osc('sawtooth', f * P(o), t + dt, 0.25, filt('lowpass', 2400, 0.8, g)); });
      [523.25, 659.25, 783.99].forEach(f => { const g = out(0, bus(o)); env(g, t + 0.5, 0.03, 0.17 * o.gain, 1.8); osc('sawtooth', f * P(o), t + 0.5, 2, filt('lowpass', 2200, 0.8, g)); });
    },
    rise(t, o) {       // a slow swell under a reveal
      const g = out(0, bus(o)); env(g, t, 1.6, 0.3 * o.gain, 0.4);
      const lp = filt('lowpass', 300, 1, g); lp.frequency.exponentialRampToValueAtTime(2600, t + 1.9);
      [110, 164.8, 220].forEach(f => osc('sawtooth', f * P(o), t, 2.1, lp));
    },
    dig(t, o) {        // a spade in earth: a scrape and a thud
      const g = out(o.pan, bus(o)); env(g, t, 0.01, 0.35 * o.gain, 0.22); burst(t, 0.25, filt('bandpass', 900, 0.9, g), 0.6);
      FX.thump(t + 0.12, { pan: o.pan, gain: o.gain * 0.5, pitch: 0.9, bus: o.bus });
    },
    growl(t, o) {      // something old waking up
      const g = out(o.pan, bus(o)); env(g, t, 0.3, 0.4 * o.gain, 1.1);
      const f1 = filt('bandpass', 420, 4, g), s = osc('sawtooth', 58 * P(o), t, 1.4, f1);
      s.frequency.linearRampToValueAtTime(46 * P(o), t + 1.3);
      const n = out(o.pan, bus(o)); env(n, t, 0.25, 0.18 * o.gain, 0.9); burst(t, 1.2, filt('lowpass', 500, 0.8, n), 0.5);
    }
  };

  let rollEnd = 0;
  const api = {
    get available() { return !!AC; },
    get running() { return !!(ctx && ctx.state === 'running'); },
    state,
    unlock() {
      if (!build()) return;
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      ramp(master.gain, state.enabled ? 0.9 : 0, 1);
    },
    armUnlock() {
      if (!root.addEventListener) return;
      const go = () => { api.unlock(); if (api.running) { root.removeEventListener('pointerdown', go, true); root.removeEventListener('keydown', go, true); } };
      root.addEventListener('pointerdown', go, true);
      root.addEventListener('keydown', go, true);
    },
    setEnabled(on) { state.enabled = !!on; if (master) ramp(master.gain, on ? 0.9 : 0, 0.6); },
    quiet(on) { state.quiet = !!on; if (sfx) ramp(sfx.gain, on ? 0.15 : 1, 0.5); },
    define(name, fn) { FX[name] = (t, o) => fn(t, o, K); },
    sample(name, url) {
      if (typeof root.Audio !== 'function') return;
      const rec = { url, ok: false };
      try {
        const a = new root.Audio();
        a.preload = 'auto';
        a.addEventListener('canplaythrough', () => { rec.ok = true; }, { once: true });
        a.addEventListener('error', () => { rec.ok = false; });
        a.src = url;
      } catch (e) { return; }
      SAMPLES[name] = rec;
    },
    play(name, o) {
      o = Object.assign({ delay: 0, pan: 0, gain: 1 }, o || {});
      if (!ctx || ctx.state !== 'running' || !state.enabled) return false;
      const smp = SAMPLES[name];
      if (smp && smp.ok) {
        try {
          const a = new root.Audio(smp.url);
          a.volume = Math.max(0, Math.min(1, 0.9 * o.gain * (state.quiet && o.bus !== 'scene' ? 0.15 : 1)));
          const go = () => { const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); };
          if (o.delay) setTimeout(go, o.delay * 1000); else go();
          return true;
        } catch (e) { /* fall through to the synthesised one */ }
      }
      if (!FX[name]) return false;
      try { FX[name](now() + 0.02 + o.delay, o); } catch (e) { return false; }
      return true;
    },
    /* A snare roll: hits closer and louder until `seconds`, then one big hit. */
    roll(seconds, o) {
      o = Object.assign({ gain: 1, bus: 'scene', hit: true }, o || {});
      if (!ctx || ctx.state !== 'running' || !state.enabled) return false;
      const t0 = now() + 0.02, end = t0 + Math.max(0.3, seconds);
      if (rollEnd > t0) return false;           // one roll at a time
      rollEnd = end;
      for (let t = t0, k = 0; t < end; k++) {
        const x = (t - t0) / (end - t0);
        const g = out(rnd(-0.2, 0.2), bus(o)); env(g, t, 0.002, (0.08 + 0.25 * x) * o.gain, 0.06);
        burst(t, 0.07, filt('bandpass', 2100, 0.9, g));
        t += 0.075 - 0.03 * x;
      }
      if (o.hit) FX.hit(end, o);
      return true;
    }
  };
  root.HubSound = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
