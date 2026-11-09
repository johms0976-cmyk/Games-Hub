/* btp-music.js: the Draw, Partner! score engine. WebAudio only, with no audio files.
 *
 * A cue is plain data: { id, title, bpm, bar (16ths per bar, default 16), bars, loopFrom (bar index the loop
 * returns to; null = play once), swing (0..1, triplet-eighth swing), build(S) } where build writes notes into a
 * Score S. Every instrument has a 16-bit voice (SNES spirit: plucks, breath, formants, echo, spring reverb) and a
 * chip voice (NES spirit: pulse 12.5/25/50 %, triangle, noise).
 *
 * Instruments: whistle  twang (reverb+tremolo electric guitar)  guitar (acoustic pluck)  bass (upright pluck)
 *   harmonica  fiddle  trumpet  horns  strings  choir  pad (synth)  synbass  piano  calliope  jawharp
 *   timp  kick  snare  hat  crash  whip  anvil  block (woodblock, m = pitch)  castanet  shaker  bell
 *   steam (train whistle chord; o.chord, o.doppler)  chuff (exhaust beat, v = force)  clack (rail joint)  stomp
 *   whistle/fiddle with o.to = glide to that midi across the note (the eagle's cry)
 *
 * Score helpers (all times in 16ths from the start of the cue):
 *   S.note(inst, t, midi, dur16, vel)
 *   S.line(inst, t, "1:4 5:2 -:2 1+3+5:8", map, vel)   tokens pitch:dur; '-' rest; '+' stacks a chord
 *   S.drum(inst, t, bars, "X.x.x..x", midi)            one char per 16th: X accent, x normal, o ghost, . rest
 *   DPMusic.deg(tok, tonic, mode)  "5", "b3", "^7" (leading tone), "1'" octave up, "5," octave down
 *   DPMusic.chord(sym, tonic)      "i", "V7", "bVII", "iv", "IVsus4"...  ->  midi list (root position, tonic octave)
 *   DPMusic.prog("i:16 | VII:8 i:8")  ->  [{t, d, sym}]
 *
 * Use:  DPMusic.play(cue | id, {mode:'16bit'|'chip', loop:true})   DPMusic.stop(fade)
 *       DPMusic.render(cue, {mode, seconds}) -> Promise<AudioBuffer>   DPMusic.wav(buffer) -> Blob
 *       DPMusic.check(cue, mode) -> Promise<{peakDb, rmsDb, silentRuns, ...}>
 */
(function (root) {
'use strict';

/* ---------- theory ---------- */
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (+m[3] + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11],
};
function deg(tok, tonic, mode) {
  const m = /^([#b^]?)([1-7])([,']*)$/.exec(tok);
  if (!m) throw new Error('bad degree ' + tok);
  let s = m[1] === '^' ? 11 : MODES[mode || 'major'][+m[2] - 1] + (m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0);
  for (const c of m[3]) s += c === ',' ? -12 : 12;
  return midi(tonic) + s;
}
const ROOTS = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const QUAL = { M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], dim: [0, 3, 6],
  sus4: [0, 5, 7], 5: [0, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9] };
function chord(sym, tonic) {
  const m = /^([b#]?)(i{1,3}|iv|v|vi{0,2}|I{1,3}|IV|V|VI{0,2})(M7|m7|7|sus4|dim|5|6)?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const up = m[2].toUpperCase(), minor = m[2] !== up;
  let r = ROOTS[up] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
  let q = minor ? 'm' : 'M';
  if (m[3] === '7') q = minor ? 'm7' : '7'; else if (m[3] === '6') q = minor ? 'm6' : '6'; else if (m[3]) q = m[3];
  return QUAL[q].map(i => midi(tonic) + r + i);
}
function prog(str) {
  const out = []; let t = 0;
  for (const tok of str.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [sym, d] = tok.split(':');
    out.push({ t, d: +d, sym }); t += +d;
  }
  return out;
}

/* ---------- score ---------- */
class Score {
  constructor(cue) { this.cue = cue; this.ev = []; }
  note(inst, t, m, d, v, o) { this.ev.push({ inst, t, m: midi(m), d, v: v == null ? 1 : v, o }); return this; }
  line(inst, t, str, map, v, o) {
    for (const tok of str.split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const i = tok.lastIndexOf(':');
      const p = tok.slice(0, i), d = +tok.slice(i + 1);
      let vv = v == null ? 1 : v, pp = p;
      if (pp[0] === '>') { vv *= 1.25; pp = pp.slice(1); }
      if (pp !== '-') for (const n of pp.split('+')) this.note(inst, t, map ? map(n) : n, d, vv, o);
      t += d;
    }
    return t;
  }
  drum(inst, t, bars, pat, m, v) {
    const bar = this.cue.bar || 16, vel = { X: 1, x: 0.65, o: 0.35 };
    for (let b = 0; b < bars; b++) for (let i = 0; i < bar; i++) {
      const c = pat[i % pat.length];
      if (vel[c]) this.note(inst, t + b * bar + i, m == null ? 60 : m, 1, vel[c] * (v == null ? 1 : v));
    }
    return t + bars * bar;
  }
}

/* ---------- seeded randomness (offline renders repeat exactly) ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- the rig: buses, echo, reverb ---------- */
function impulse(ctx, secs, decay, seed) {
  const r = rng(seed), len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 40 ? i / 40 : 1);
  }
  return b;
}
function softClip(ctx, k) {
  const ws = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  ws.curve = c; return ws;
}
function buildRig(ctx, mode) {
  const R = { ctx, mode, sources: new Set(), cache: {} };
  R.master = ctx.createGain(); R.master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  R.master.connect(comp);
  // a safety limiter: nothing a composer writes may clip
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
  comp.connect(lim);
  // WebAudio compressors add their own make-up gain, so trim after them
  const trim = ctx.createGain(); trim.gain.value = 0.7; lim.connect(trim);
  if (mode === '16bit') {
    // the SNES's 32 kHz DAC and Gaussian interpolation took the top off everything
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 11000; lp.Q.value = 0.5;
    trim.connect(lp); lp.connect(ctx.destination);
  } else trim.connect(ctx.destination);
  R.bus = ctx.createGain(); R.bus.connect(R.master);
  // reverb send (spring-ish: bright, 2.2 s)
  R.verb = ctx.createConvolver(); R.verb.buffer = impulse(ctx, 2.2, 3.2, 7);
  R.send = ctx.createGain(); R.send.gain.value = mode === '16bit' ? 0.55 : 0.12;
  const vhp = ctx.createBiquadFilter(); vhp.type = 'highpass'; vhp.frequency.value = 250;
  R.send.connect(vhp); vhp.connect(R.verb); R.verb.connect(R.master);
  // echo send (the SNES echo buffer: a dark repeating delay)
  R.echo = ctx.createGain(); R.echo.gain.value = mode === '16bit' ? 0.35 : 0;
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.27;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const elp = ctx.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 2600;
  R.echo.connect(dl); dl.connect(elp); elp.connect(fb); fb.connect(dl); elp.connect(R.master);
  // the twang bus: drive, presence, tremolo, lots of spring
  R.twang = ctx.createGain();
  const drive = softClip(ctx, 2.2), pk = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), trem = ctx.createGain();
  pk.type = 'peaking'; pk.frequency.value = 2400; pk.gain.value = 5; pk.Q.value = 1;
  hp.type = 'highpass'; hp.frequency.value = 110;
  trem.gain.value = 0.75;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.6; lg.gain.value = 0.25;
  lfo.connect(lg); lg.connect(trem.gain); lfo.start(0);
  R.twang.connect(drive); drive.connect(pk); pk.connect(hp); hp.connect(trem);
  trem.connect(R.bus);
  const tw = ctx.createGain(); tw.gain.value = mode === '16bit' ? 0.6 : 0.15; trem.connect(tw); tw.connect(R.send);
  // shared noise
  const nr = rng(3), nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;
  R.noise = nb;
  // chip pulse waves
  R.pulse = {};
  for (const duty of [0.125, 0.25, 0.5]) {
    const N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty);
    R.pulse[duty] = ctx.createPeriodicWave(re, im);
  }
  return R;
}

/* ---------- voice helpers ---------- */
function out(R, node, pan, send, echo) {
  let n = node;
  if (pan && R.ctx.createStereoPanner) { const p = R.ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(R.bus);
  if (send) { const s = R.ctx.createGain(); s.gain.value = send; n.connect(s); s.connect(R.send); }
  if (echo) { const e = R.ctx.createGain(); e.gain.value = echo; n.connect(e); e.connect(R.echo); }
}
function track(R, src, t, end) { src.start(t); src.stop(end); R.sources.add(src); src.onended = () => R.sources.delete(src); }
function env(g, t, a, peak, d, rel, sus) {
  const p = g.gain; p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (sus != null) p.setTargetAtTime(peak * sus, t + a, Math.max(0.02, d * 0.3));
  p.setValueAtTime(sus != null ? peak * sus : peak, t + Math.max(a, d));
  p.linearRampToValueAtTime(0.0001, t + Math.max(a, d) + rel);
  return t + Math.max(a, d) + rel + 0.05;
}
function vibrato(R, osc, t, f, rate, cents, delay, endT) {
  const l = R.ctx.createOscillator(), g = R.ctx.createGain();
  l.frequency.value = rate; const depth = f * (Math.pow(2, cents / 1200) - 1);
  g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(depth, t + delay + 0.25);
  l.connect(g); g.connect(osc.frequency); track(R, l, t, endT);
}
function osc(R, type, f, t, endT) {
  const o = R.ctx.createOscillator();
  if (typeof type === 'number') o.setPeriodicWave(R.pulse[type]); else o.type = type;
  o.frequency.setValueAtTime(f, t); track(R, o, t, endT); return o;
}
function filt(R, type, f, q) { const b = R.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
function noiseSrc(R, t, endT, rate) {
  const s = R.ctx.createBufferSource(); s.buffer = R.noise; s.loop = true; if (rate) s.playbackRate.value = rate;
  s.start(t, (t * 7.31) % 1.5); s.stop(endT); R.sources.add(s); s.onended = () => R.sources.delete(s); return s;
}
// Karplus-Strong pluck, cached per pitch/colour
function ks(R, m, bright, decay, secs) {
  const key = m + '|' + bright + '|' + decay;
  if (R.cache[key]) return R.cache[key];
  const ctx = R.ctx, sr = ctx.sampleRate, f = hz(m), N = Math.max(2, Math.floor(sr / f - 0.5)), len = Math.floor(sr * secs);
  const b = ctx.createBuffer(1, len, sr), y = b.getChannelData(0), r = rng(m * 131 + 17);
  let prev = 0, mean = 0;
  for (let i = 0; i < N; i++) { prev += (r() * 2 - 1 - prev) * bright; y[i] = prev; mean += prev; }
  mean /= N; for (let i = 0; i < N; i++) y[i] -= mean;
  for (let i = N; i < len; i++) y[i] = decay * 0.5 * (y[i - N] + (i - N - 1 >= 0 ? y[i - N - 1] : 0));
  let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(y[i]));
  for (let i = 0; i < len; i++) y[i] /= pk || 1;
  return (R.cache[key] = { buf: b, rate: f / (sr / (N + 0.5)) });
}
function pluck(R, m, t, d, v, o) {
  const k = ks(R, m, o.bright, o.decay, o.secs || 2.5), s = R.ctx.createBufferSource(), g = R.ctx.createGain();
  s.buffer = k.buf; s.playbackRate.setValueAtTime(k.rate * (o.bend || 1), t);
  if (o.bend) s.playbackRate.linearRampToValueAtTime(k.rate, t + 0.06);
  const ring = o.ring == null ? 0.12 : o.ring, end = t + Math.min(d + ring, o.secs || 2.5);
  g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, Math.max(t, end - ring)); g.gain.linearRampToValueAtTime(0.0001, end);
  s.connect(g); track(R, s, t, end + 0.02); return g;
}

/* ---------- chip voices ---------- */
function chipTone(R, duty, f, t, d, v, o) {
  o = o || {};
  const end = t + d + (o.rel || 0.03), x = osc(R, duty, f, t, end + 0.05), g = R.ctx.createGain();
  if (o.vib) vibrato(R, x, t, f, 5.5, o.vib, 0.15, end + 0.05);
  if (o.slide) { x.frequency.setValueAtTime(f * o.slide, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
  if (o.to) { x.frequency.setValueAtTime(f, t + 0.05); x.frequency.exponentialRampToValueAtTime(o.to, t + d); }
  const p = g.gain; p.setValueAtTime(v, t);
  if (o.decay) p.setTargetAtTime(v * (o.sus || 0.15), t + 0.01, o.decay);
  p.setValueAtTime(o.decay ? v * (o.sus || 0.15) : v, Math.max(t, t + d)); p.linearRampToValueAtTime(0.0001, end);
  x.connect(g); return g;
}
function chipNoise(R, t, d, v, rate, hpF) {
  const s = noiseSrc(R, t, t + d + 0.02, rate), g = R.ctx.createGain(), h = filt(R, 'highpass', hpF || 500);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(h); h.connect(g); return g;
}

/* ---------- the instruments ---------- */
// each: (R, m, t, dSecs, v, o) -> connects itself; chip variant under CHIP
const INST = {
  whistle(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.1, x = osc(R, 'sine', f * 0.965, t, end + 0.05), g = R.ctx.createGain();
    x.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    vibrato(R, x, t, f, 5.3, 22, 0.14, end + 0.05);
    env(g, t, 0.035, 0.26 * v, d, 0.09);
    x.connect(g);
    const n = noiseSrc(R, t, end + 0.05), bp = filt(R, 'bandpass', f, 9), ng = R.ctx.createGain();
    env(ng, t, 0.02, 0.035 * v, d, 0.08); n.connect(bp); bp.connect(ng); ng.connect(g);
    out(R, g, 0.05, 0.5, 0.6);
  },
  twang(R, m, t, d, v, o) {
    const g = pluck(R, m, t, d, 0.17 * v, { bright: 0.85, decay: 0.9985, ring: (o && o.ring) || 0.35, bend: 0.985, secs: 3 });
    g.connect(R.twang);
  },
  guitar(R, m, t, d, v, o) {
    const g = pluck(R, m, t, d, 0.22 * v, { bright: 0.55, decay: 0.997, ring: (o && o.ring) || 0.08 });
    out(R, g, -0.25, 0.25);
  },
  bass(R, m, t, d, v) {
    // an upright: a dark pluck plus a little octave so a phone speaker can hear it
    const g = pluck(R, m, t, d, 0.45 * v, { bright: 0.28, decay: 0.996, ring: 0.06 });
    const lp = filt(R, 'lowpass', 900); g.connect(lp);
    const h = pluck(R, m + 12, t, d, 0.12 * v, { bright: 0.3, decay: 0.993, ring: 0.05 }); h.connect(lp);
    out(R, lp, 0, 0.05);
  },
  harmonica(R, m, t, d, v, o) {
    const f = hz(m), end = t + d + 0.08, g = R.ctx.createGain(), bp = filt(R, 'bandpass', 1300, 0.8), lp = filt(R, 'lowpass', 3200);
    const a = osc(R, 'square', f, t, end + 0.05), b = osc(R, 'sawtooth', f * 1.004, t, end + 0.05);
    const bend = o && o.bend != null ? o.bend : (d > 0.25 ? 0.94 : 0.985);
    for (const x of [a, b]) { x.frequency.setValueAtTime(f * bend, t); x.frequency.exponentialRampToValueAtTime(x === b ? f * 1.004 : f, t + 0.09); vibrato(R, x, t, f, 6.2, 18, 0.18, end + 0.05); }
    const mix = R.ctx.createGain(); mix.gain.value = 0.5; a.connect(mix); b.connect(mix);
    mix.connect(bp); mix.connect(lp); bp.connect(g); lp.connect(g);
    env(g, t, 0.03, 0.2 * v, d, 0.07, 0.85);
    out(R, g, 0.15, 0.3, 0.25);
  },
  fiddle(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.1, g = R.ctx.createGain(), pk = filt(R, 'peaking', 2600, 1.2), lp = filt(R, 'lowpass', 5000);
    pk.gain.value = 6;
    const a = osc(R, 'sawtooth', f, t, end + 0.05), b = osc(R, 'sawtooth', f * 1.003, t, end + 0.05);
    vibrato(R, a, t, f, 6, 16, 0.05, end); vibrato(R, b, t, f, 5.7, 16, 0.05, end);
    a.connect(pk); b.connect(pk); pk.connect(lp); lp.connect(g);
    env(g, t, 0.05, 0.13 * v, d, 0.09);
    out(R, g, -0.2, 0.35, 0.2);
  },
  trumpet(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.1, g = R.ctx.createGain(), lp = filt(R, 'lowpass', 900, 2);
    const a = osc(R, 'sawtooth', f * 0.97, t, end + 0.05);
    a.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    vibrato(R, a, t, f, 5.6, 25, 0.2, end);
    lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(Math.min(9000, 2200 + f * 3), t + 0.05);
    lp.frequency.setTargetAtTime(1600 + f * 1.5, t + 0.06, 0.15);
    a.connect(lp); lp.connect(g); env(g, t, 0.025, 0.13 * v, d, 0.08);
    out(R, g, 0.1, 0.55, 0.4);
  },
  horns(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.15, g = R.ctx.createGain(), lp = filt(R, 'lowpass', 600, 1);
    for (const det of [0.996, 1.004]) { const a = osc(R, 'sawtooth', f * det, t, end + 0.05); vibrato(R, a, t, f, 5, 10, 0.3, end); a.connect(lp); }
    lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1400 + f, t + 0.12); lp.frequency.setTargetAtTime(900 + f * 0.8, t + 0.15, 0.3);
    lp.connect(g); env(g, t, 0.06, 0.14 * v, d, 0.15);
    out(R, g, -0.1, 0.6, 0.15);
  },
  strings(R, m, t, d, v) {
    const f = hz(m), short = d < 0.22, rel = short ? 0.06 : 0.25, end = t + d + rel, g = R.ctx.createGain(), lp = filt(R, 'lowpass', short ? 2600 : 2000, 0.7);
    for (const det of [0.994, 1, 1.006]) { const a = osc(R, 'sawtooth', f * det, t, end + 0.05); if (!short) vibrato(R, a, t, f, 5.4, 9, 0.2, end); a.connect(lp); }
    lp.connect(g); env(g, t, short ? 0.012 : 0.16, (short ? 0.05 : 0.04) * v, d, rel);
    out(R, g, 0.2, 0.5, 0.05);
  },
  choir(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.45, g = R.ctx.createGain(), src = R.ctx.createGain();
    for (const det of [0.993, 1, 1.007]) { const a = osc(R, 'sawtooth', f * det, t, end + 0.05); vibrato(R, a, t, f, 5, 14, 0.25, end); a.connect(src); }
    for (const [ff, q, gg] of [[750, 7, 1], [1150, 9, 0.5], [2600, 11, 0.25]]) { const b = filt(R, 'bandpass', ff, q), h = R.ctx.createGain(); h.gain.value = gg; src.connect(b); b.connect(h); h.connect(g); }
    env(g, t, 0.3, 0.16 * v, d, 0.45);
    out(R, g, 0, 0.8, 0.1);
  },
  pad(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.5, g = R.ctx.createGain(), lp = filt(R, 'lowpass', 1100, 3);
    for (const det of [0.995, 1.005]) { const a = osc(R, 'sawtooth', f * det, t, end + 0.05); a.connect(lp); }
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1500, t + Math.min(d, 2));
    lp.connect(g); env(g, t, 0.4, 0.05 * v, d, 0.5);
    out(R, g, 0, 0.5, 0.2);
  },
  synbass(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.05, g = R.ctx.createGain(), lp = filt(R, 'lowpass', 300, 6);
    const a = osc(R, 'sawtooth', f, t, end + 0.05), b = osc(R, 'square', f / 2, t, end + 0.05);
    const bg = R.ctx.createGain(); bg.gain.value = 0.5; b.connect(bg); bg.connect(lp); a.connect(lp);
    lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    lp.connect(g); env(g, t, 0.005, 0.22 * v, d, 0.04);
    out(R, g, 0, 0.05);
  },
  piano(R, m, t, d, v) {
    const g = pluck(R, m, t, d, 0.3 * v, { bright: 0.45, decay: 0.9993, ring: 0.3, secs: 3 });
    const k = pluck(R, m + 12, t, d, 0.08 * v, { bright: 0.45, decay: 0.999, ring: 0.2, secs: 2 });
    const lp = filt(R, 'lowpass', 4000); g.connect(lp); k.connect(lp); out(R, lp, -0.1, 0.4);
  },
  calliope(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.06, g = R.ctx.createGain();
    const a = osc(R, 'sine', f, t, end + 0.05), b = osc(R, 'triangle', f * 2, t, end + 0.05), bg = R.ctx.createGain(); bg.gain.value = 0.3;
    vibrato(R, a, t, f, 7, 12, 0, end); b.connect(bg); a.connect(g); bg.connect(g);
    const n = noiseSrc(R, t, end), bp = filt(R, 'bandpass', f * 2, 4), ng = R.ctx.createGain(); ng.gain.value = 0.15; n.connect(bp); bp.connect(ng); ng.connect(g);
    env(g, t, 0.02, 0.18 * v, d, 0.05, 0.9); out(R, g, 0.1, 0.3, 0.3);
  },
  jawharp(R, m, t, d, v) {
    const f = hz(m), end = t + d + 0.05, g = R.ctx.createGain(), bp = filt(R, 'bandpass', 600, 12);
    const a = osc(R, 'sawtooth', f, t, end + 0.05); a.connect(bp);
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1800, t + Math.min(d, 0.25)); bp.frequency.exponentialRampToValueAtTime(500, t + Math.min(d, 0.25) + 0.15);
    bp.connect(g); env(g, t, 0.005, 2.2 * v, d * 0.6, d * 0.4 + 0.05); out(R, g, -0.2, 0.2);
  },
  timp(R, m, t, d, v) {
    const f = hz(m), end = t + 1.6, x = osc(R, 'sine', f * 1.03, t, end), g = R.ctx.createGain();
    x.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, end); x.connect(g);
    const h = osc(R, 'sine', f * 1.5, t, t + 0.5), hg = R.ctx.createGain(); hg.gain.setValueAtTime(0.15 * v, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); h.connect(hg); hg.connect(g);
    const n = noiseSrc(R, t, t + 0.12), lp = filt(R, 'lowpass', 800), ng = R.ctx.createGain();
    ng.gain.setValueAtTime(0.25 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); n.connect(lp); lp.connect(ng); ng.connect(g);
    out(R, g, 0, 0.4);
  },
  kick(R, m, t, d, v) {
    const x = osc(R, 'sine', 130, t, t + 0.35), g = R.ctx.createGain();
    x.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.7 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    x.connect(g); out(R, g, 0, 0);
  },
  snare(R, m, t, d, v) {
    const n = noiseSrc(R, t, t + 0.22), hp = filt(R, 'highpass', 1200), g = R.ctx.createGain();
    g.gain.setValueAtTime(0.32 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); n.connect(hp); hp.connect(g);
    const x = osc(R, 'triangle', 190, t, t + 0.1), xg = R.ctx.createGain(); xg.gain.setValueAtTime(0.3 * v, t); xg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); x.connect(xg); xg.connect(g);
    out(R, g, 0.05, 0.3);
  },
  hat(R, m, t, d, v) {
    const n = noiseSrc(R, t, t + 0.08), hp = filt(R, 'highpass', 7000), g = R.ctx.createGain();
    g.gain.setValueAtTime(0.12 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); n.connect(hp); hp.connect(g); out(R, g, 0.3, 0.1);
  },
  shaker(R, m, t, d, v) {
    const n = noiseSrc(R, t, t + 0.1), bp = filt(R, 'bandpass', 6000, 1.5), g = R.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); n.connect(bp); bp.connect(g); out(R, g, -0.3, 0.1);
  },
  crash(R, m, t, d, v) {
    const n = noiseSrc(R, t, t + 2.2), hp = filt(R, 'highpass', 4000), g = R.ctx.createGain();
    g.gain.setValueAtTime(0.18 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2); n.connect(hp); hp.connect(g); out(R, g, 0.2, 0.4);
  },
  whip(R, m, t, d, v) {
    const n = noiseSrc(R, t, t + 0.2), bp = filt(R, 'bandpass', 2500, 2), g = R.ctx.createGain();
    bp.frequency.setValueAtTime(1500, t); bp.frequency.exponentialRampToValueAtTime(7000, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * v, t + 0.07); g.gain.linearRampToValueAtTime(0.7 * v, t + 0.09); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    n.connect(bp); bp.connect(g); out(R, g, 0.35, 0.9, 0.5);
  },
  anvil(R, m, t, d, v) {
    const f = hz(m || 84), g = R.ctx.createGain(), end = t + 1.8;
    [[1, 0.5], [2.76, 0.3], [5.4, 0.18], [8.93, 0.1]].forEach(([r, a]) => { const x = osc(R, 'sine', f * r, t, end), h = R.ctx.createGain(); h.gain.setValueAtTime(a * v * 0.5, t); h.gain.exponentialRampToValueAtTime(0.0001, t + 1.7 / r ** 0.5); x.connect(h); h.connect(g); });
    out(R, g, -0.3, 0.7, 0.4);
  },
  bell(R, m, t, d, v) {
    const f = hz(m), g = R.ctx.createGain(), end = t + 2.5;
    [[1, 0.5], [2, 0.25], [3, 0.12], [4.2, 0.08]].forEach(([r, a]) => { const x = osc(R, 'sine', f * r, t, end), h = R.ctx.createGain(); h.gain.setValueAtTime(a * v * 0.35, t); h.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 / r); x.connect(h); h.connect(g); });
    out(R, g, 0.25, 0.6, 0.3);
  },
  block(R, m, t, d, v) {
    const f = hz(m || 79), x = osc(R, 'sine', f, t, t + 0.12), g = R.ctx.createGain(), bp = filt(R, 'bandpass', f, 3);
    g.gain.setValueAtTime(0.4 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); x.connect(bp); bp.connect(g);
    const n = noiseSrc(R, t, t + 0.02), ng = R.ctx.createGain(); ng.gain.setValueAtTime(0.12 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.015); n.connect(ng); ng.connect(g);
    out(R, g, -0.15, 0.15);
  },
  castanet(R, m, t, d, v) {
    for (const dt of [0, 0.018]) { const n = noiseSrc(R, t + dt, t + dt + 0.04), bp = filt(R, 'bandpass', 2800, 4), g = R.ctx.createGain(); g.gain.setValueAtTime(0.3 * v, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.03); n.connect(bp); bp.connect(g); out(R, g, 0.3, 0.2); }
  },
  // the locomotive's chime whistle: three pipes (o.chord, semitones over m), a scoop up as the steam opens, a sag
  // as it closes; o.doppler drops the pitch through the note as the engine passes
  steam(R, m, t, d, v, o) {
    o = o || {};
    const end = t + d + 0.3, g = R.ctx.createGain(), lp = filt(R, 'lowpass', 3500);
    for (const iv of o.chord || [0, 5, 9]) {
      const f = hz(m + iv), x = osc(R, 'triangle', f * 0.92, t, end + 0.05), s = osc(R, 'sine', f * 2, t, end + 0.05), sg = R.ctx.createGain();
      for (const [y, k] of [[x, 1], [s, 2]]) {
        y.frequency.exponentialRampToValueAtTime(f * k, t + 0.14);
        if (o.doppler) { y.frequency.setValueAtTime(f * k, t + d * 0.35); y.frequency.exponentialRampToValueAtTime(f * k * 0.93, t + d); }
        y.frequency.setValueAtTime(f * k * (o.doppler ? 0.93 : 1), t + d); y.frequency.exponentialRampToValueAtTime(f * k * (o.doppler ? 0.88 : 0.95), end);
      }
      sg.gain.value = 0.25; s.connect(sg); sg.connect(lp); x.connect(lp);
    }
    const n = noiseSrc(R, t, end), bp = filt(R, 'bandpass', hz(m) * 2, 3), ng = R.ctx.createGain(); ng.gain.value = 0.5; n.connect(bp); bp.connect(ng); ng.connect(lp);
    lp.connect(g); env(g, t, 0.1, 0.14 * v, d, 0.3);
    out(R, g, o.pan || 0.3, 0.9, 0.7);
  },
  // one exhaust beat of the locomotive: a soft-edged burst of steam
  chuff(R, m, t, d, v) {
    const n = noiseSrc(R, t, t + 0.3), bp = filt(R, 'bandpass', 900 + 600 * v, 0.9), lp = filt(R, 'lowpass', 4000), g = R.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.0 * v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + 0.12 * v);
    n.connect(bp); bp.connect(lp); lp.connect(g); out(R, g, -0.2, 0.15);
  },
  // wheels over a rail joint: clickety
  clack(R, m, t, d, v) {
    for (const [dt, a] of [[0, 1], [0.07, 0.7]]) {
      const n = noiseSrc(R, t + dt, t + dt + 0.05), hp = filt(R, 'bandpass', 3200, 2.5), g = R.ctx.createGain();
      g.gain.setValueAtTime(0.7 * v * a, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.035); n.connect(hp); hp.connect(g);
      const x = osc(R, 'sine', 1700, t + dt, t + dt + 0.04), xg = R.ctx.createGain(); xg.gain.setValueAtTime(0.2 * v * a, t + dt); xg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.03); x.connect(xg); xg.connect(g);
      out(R, g, 0.2, 0.1);
    }
  },
  // a buffalo hoof / big floor drum
  stomp(R, m, t, d, v) {
    const x = osc(R, 'sine', 95, t, t + 0.7), g = R.ctx.createGain();
    x.frequency.exponentialRampToValueAtTime(44, t + 0.25); g.gain.setValueAtTime(0.6 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); x.connect(g);
    const h = osc(R, 'triangle', 190, t, t + 0.15), hg = R.ctx.createGain(); hg.gain.setValueAtTime(0.2 * v, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); h.frequency.exponentialRampToValueAtTime(90, t + 0.12); h.connect(hg); hg.connect(g);
    const n = noiseSrc(R, t, t + 0.1), lp = filt(R, 'lowpass', 600), ng = R.ctx.createGain(); ng.gain.setValueAtTime(0.3 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); n.connect(lp); lp.connect(ng); ng.connect(g);
    out(R, g, 0, 0.35);
  },
};
// o.to (midi) glides the whistle or fiddle across the note: the eagle's cry
const _whistle = INST.whistle, _fiddle = INST.fiddle;
INST.whistle = function (R, m, t, d, v, o) {
  if (!o || o.to == null) return _whistle(R, m, t, d, v);
  // a cry: no scoop, fast wide vibrato, the pitch falls (or climbs) through the note
  const f = hz(m), end = t + d + 0.12, x = osc(R, 'sine', f, t, end + 0.05), g = R.ctx.createGain();
  x.frequency.setValueAtTime(f, t + 0.05); x.frequency.exponentialRampToValueAtTime(hz(o.to), t + d);
  vibrato(R, x, t, f, 7.5, 35, 0.05, end);
  env(g, t, 0.025, 0.24 * v, d, 0.12); x.connect(g);
  out(R, g, o.pan || -0.25, 0.8, 0.9);
};
INST.fiddle = function (R, m, t, d, v, o) {
  if (!o || o.to == null) return _fiddle(R, m, t, d, v);
  const f = hz(m), end = t + d + 0.1, g = R.ctx.createGain(), lp = filt(R, 'lowpass', 5000), a = osc(R, 'sawtooth', f, t, end + 0.05);
  a.frequency.setValueAtTime(f, t + 0.05); a.frequency.exponentialRampToValueAtTime(hz(o.to), t + d);
  a.connect(lp); lp.connect(g); env(g, t, 0.04, 0.12 * v, d, 0.1); out(R, g, -0.2, 0.4, 0.3);
};
const LEAD = { whistle: [0.25, 18, 0.97], harmonica: [0.125, 22, 0.95], trumpet: [0.5, 20, 0.97], fiddle: [0.25, 15], calliope: [0.5, 10], horns: [0.5, 8], jawharp: [0.125, 0] };
const CHIP = {
  lead(R, m, t, d, v, name, o) { const [duty, vib, slide] = LEAD[name], to = o && o.to != null ? hz(o.to) : 0; out(R, chipTone(R, duty, hz(m), t, d, 0.11 * v, { vib: to ? 30 : vib, slide: to ? 0 : slide, to }), 0, 0.3); },
  pluck(R, m, t, d, v) { out(R, chipTone(R, 0.125, hz(m), t, d, 0.1 * v, { decay: 0.12, sus: 0.2, rel: 0.05 }), -0.1, 0.2); },
  soft(R, m, t, d, v) { out(R, chipTone(R, 0.5, hz(m), t, d, 0.035 * v, { vib: 8, rel: 0.12 }), 0.1, 0.3); },
  tri(R, m, t, d, v) { out(R, chipTone(R, 'triangle', hz(m), t, d, 0.3 * v, { rel: 0.02 }), 0, 0); },
};
const CHIPMAP = {
  whistle: 'lead', harmonica: 'lead', trumpet: 'lead', fiddle: 'lead', calliope: 'lead', horns: 'lead', jawharp: 'lead',
  twang: 'pluck', guitar: 'pluck', piano: 'pluck',
  strings: 'soft', choir: 'soft', pad: 'soft',
  bass: 'tri', synbass: 'tri',
};
const CHIPDRUM = {
  kick(R, t, v) { const g = chipTone(R, 'triangle', 120, t, 0.08, 0.5 * v); out(R, g, 0, 0); },
  timp(R, t, v, m) { const x = chipTone(R, 'triangle', hz(m), t, 0.3, 0.45 * v, { decay: 0.15 }); out(R, x, 0, 0.1); },
  snare(R, t, v) { out(R, chipNoise(R, t, 0.14, 0.25 * v, 1, 1500), 0, 0.1); },
  hat(R, t, v) { out(R, chipNoise(R, t, 0.04, 0.12 * v, 1, 8000), 0.2, 0); },
  shaker(R, t, v) { out(R, chipNoise(R, t, 0.05, 0.07 * v, 1, 6000), -0.2, 0); },
  crash(R, t, v) { out(R, chipNoise(R, t, 1.2, 0.12 * v, 1, 3000), 0, 0.2); },
  whip(R, t, v) { out(R, chipNoise(R, t + 0.06, 0.1, 0.4 * v, 1, 2500), 0.3, 0.3); },
  castanet(R, t, v) { out(R, chipNoise(R, t, 0.03, 0.2 * v, 1, 2500), 0.3, 0); },
  block(R, t, v, m) { out(R, chipTone(R, 0.5, hz(m || 79), t, 0.03, 0.1 * v, { rel: 0.01 }), -0.1, 0); },
  anvil(R, t, v, m) { out(R, chipTone(R, 0.25, hz(m || 84), t, 0.5, 0.08 * v, { decay: 0.2, sus: 0.05 }), 0, 0.3); },
  bell(R, t, v, m) { out(R, chipTone(R, 0.25, hz(m), t, 0.6, 0.08 * v, { decay: 0.25, sus: 0.05 }), 0, 0.3); },
};
const CHIPX = {
  steam(R, e, t, d) { for (const iv of (e.o && e.o.chord) || [0, 5, 9]) out(R, chipTone(R, 0.5, hz(e.m + iv), t, d, 0.045 * e.v, { slide: 0.92, to: e.o && e.o.doppler ? hz(e.m + iv) * 0.93 : 0, rel: 0.2 }), 0.2, 0.4); },
  chuff(R, e, t) { out(R, chipNoise(R, t, 0.08 + 0.1 * e.v, 0.22 * e.v, 1, 700), -0.2, 0); },
  clack(R, e, t) { out(R, chipNoise(R, t, 0.025, 0.15 * e.v, 1, 4000), 0.2, 0); out(R, chipNoise(R, t + 0.07, 0.025, 0.1 * e.v, 1, 4000), 0.2, 0); },
  stomp(R, e, t) { const x = chipTone(R, 'triangle', 90, t, 0.18, 0.55 * e.v, { to: 45 }); out(R, x, 0, 0.1); },
};
function voice(R, e, t, d) {
  if (R.mode === 'chip') {
    if (CHIPDRUM[e.inst]) return CHIPDRUM[e.inst](R, t, e.v, e.m);
    const k = e.inst === 'strings' && d < 0.22 ? 'pluck' : CHIPMAP[e.inst];
    if (CHIPX[e.inst]) return CHIPX[e.inst](R, e, t, d);
    if (k === 'lead') return CHIP.lead(R, e.m, t, d, e.v, e.inst, e.o);
    if (k) return CHIP[k](R, e.m, t, d, e.v);
  }
  const fn = INST[e.inst]; if (!fn) throw new Error('no instrument ' + e.inst);
  fn(R, e.m, t, d, e.v, e.o);
}

/* ---------- compile a cue to timed events ---------- */
const registry = {};
function compile(cue, mode) {
  const S = new Score(cue); cue.build(S);
  const six = 60 / cue.bpm / 4, bar = cue.bar || 16, swing = cue.swing || 0, r = rng(99);
  const hum = mode === 'chip' ? 0 : (cue.humanize == null ? 1 : cue.humanize);
  const ev = S.ev.map(e => {
    let t = e.t;
    if (swing && Math.abs(t % 4 - 2) < 1e-6) t += swing * 2 / 3;
    const jitter = hum ? (r() - 0.5) * 0.012 * hum : 0;
    return Object.assign({}, e, { time: t * six + jitter, secs: e.d * six, v: e.v * (hum ? 1 + (r() - 0.5) * 0.1 * hum : 1) });
  }).sort((a, b) => a.time - b.time);
  const len = cue.bars * bar * six, from = cue.loopFrom == null ? null : cue.loopFrom * bar * six;
  return { ev, len, from, six };
}

/* ---------- live player ---------- */
const P = { ctx: null, R: null, mode: '16bit', timer: null, cur: null, volume: 0.8 };
function ensure(mode) {
  if (!P.ctx) P.ctx = new (root.AudioContext || root.webkitAudioContext)();
  if (P.ctx.state === 'suspended' && !P.paused) P.ctx.resume();
  if (!P.R || P.R.mode !== mode) {
    if (P.R) P.R.master.disconnect();
    P.R = buildRig(P.ctx, mode);
  }
  return P.R;
}
function play(cue, opt) {
  opt = opt || {};
  if (typeof cue === 'string') cue = registry[cue];
  if (!cue || !(root.AudioContext || root.webkitAudioContext)) return null;
  stop(0);
  const mode = opt.mode || P.mode; P.mode = mode;
  const R = ensure(mode), C = compile(cue, mode), ctx = P.ctx;
  R.master.gain.cancelScheduledValues(ctx.currentTime); R.master.gain.setValueAtTime(P.volume * (cue.gain || 1), ctx.currentTime);
  const loop = opt.loop !== false && C.from != null;
  const st = { cue, C, R, idx: 0, t0: ctx.currentTime + 0.12, offset: 0, loop, onbar: opt.onbar, lastBar: -1 };
  P.cur = st;
  const pump = () => {
    if (P.cur !== st) return;
    const now = ctx.currentTime, until = now + 0.3;
    while (true) {
      if (st.idx >= C.ev.length) {
        if (!st.loop) break;
        st.offset += C.len - C.from;   // the loop body restarts where the last pass ended
        st.idx = C.ev.findIndex(e => e.time >= C.from - 1e-6);
        if (st.idx < 0) break;
      }
      const e = C.ev[st.idx], at = st.t0 + st.offset + e.time;
      if (at > until) break;
      if (at >= now - 0.05) voice(R, e, at, e.secs);
      st.idx++;
    }
    if (st.onbar) {
      const pos = now - st.t0; let b = -1;
      if (pos >= 0) { b = Math.floor(pos / (C.six * (cue.bar || 16))); if (st.loop && pos >= C.len) b = (cue.loopFrom) + Math.floor((pos - C.len) / (C.six * (cue.bar || 16))) % (cue.bars - cue.loopFrom); }
      if (b !== st.lastBar) { st.lastBar = b; st.onbar(b); }
    }
    if (!st.loop && now > st.t0 + C.len + 3) stop(0);
  };
  pump(); st.timer = setInterval(pump, 40);
  return st;
}
function stop(fade) {
  const st = P.cur; if (!st) return;
  clearInterval(st.timer); P.cur = null;
  const ctx = P.ctx, now = ctx.currentTime, f = fade == null ? 0.4 : fade, R = st.R;
  R.master.gain.cancelScheduledValues(now); R.master.gain.setValueAtTime(R.master.gain.value, now); R.master.gain.linearRampToValueAtTime(0.0001, now + f + 0.01);
  for (const s of R.sources) { try { s.stop(now + f + 0.02); } catch (e) { /* already stopped */ } }
  if (st.onbar) st.onbar(-1);
}

/* ---------- offline render, wav, check ---------- */
function render(cue, opt) {
  opt = opt || {};
  if (typeof cue === 'string') cue = registry[cue];
  const mode = opt.mode || '16bit', C = compile(cue, mode), sr = opt.rate || 44100;
  const secs = opt.seconds || (C.len + 2.5);
  const ctx = new (root.OfflineAudioContext || root.webkitOfflineAudioContext)(2, Math.ceil(sr * secs), sr);
  const R = buildRig(ctx, mode); R.master.gain.value *= cue.gain || 1;
  for (const e of C.ev) if (e.time < secs && (!opt.only || opt.only.includes(e.inst))) voice(R, e, e.time + 0.02, e.secs);
  return ctx.startRendering();
}
function wav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVEfmt '); data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44; for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([data], { type: 'audio/wav' });
}
async function check(cue, mode) {
  if (typeof cue === 'string') cue = registry[cue];
  const C = compile(cue, mode || '16bit'), buf = await render(cue, { mode });
  const L = buf.getChannelData(0), Rr = buf.getChannelData(1), sr = buf.sampleRate;
  let peak = 0, sum = 0; const win = Math.floor(sr * 0.25), silent = []; let quiet = 0, wsum = 0, wn = 0;
  const musicEnd = Math.min(L.length, Math.floor(C.len * sr));
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(Rr[i])); peak = Math.max(peak, a); sum += L[i] * L[i] + Rr[i] * Rr[i];
    if (i < musicEnd) { wsum += a; wn++; if (wn === win) { if (wsum / wn < 0.002) quiet++; else { if (quiet >= 4) silent.push([(i / sr - quiet * 0.25).toFixed(1), (quiet * 0.25).toFixed(2) + 's']); quiet = 0; } wsum = 0; wn = 0; } }
  }
  const db = x => +(20 * Math.log10(x || 1e-9)).toFixed(1);
  const insts = {}; C.ev.forEach(e => { insts[e.inst] = (insts[e.inst] || 0) + 1; });
  const ms = C.ev.filter(e => !CHIPDRUM[e.inst] || e.inst === 'timp').map(e => e.m);
  return { id: cue.id, mode: mode || '16bit', seconds: +(C.len).toFixed(1), events: C.ev.length, peakDb: db(peak),
    rmsDb: db(Math.sqrt(sum / (2 * L.length))), clipped: peak >= 0.999, silentRuns: silent,
    lowest: Math.min.apply(null, ms), highest: Math.max.apply(null, ms), insts };
}

root.DPMusic = {
  midi, hz, deg, chord, prog, Score, MODES,
  cues: registry, add(cue) { registry[cue.id] = cue; return cue; },
  play, stop, render, wav, check, compile,
  ok: !!(root.AudioContext || root.webkitAudioContext),
  // browsers start an AudioContext only from a tap: call resume() from one. pause(true) while the page is hidden.
  resume() { if (P.ctx && P.ctx.state === 'suspended' && !P.paused) P.ctx.resume(); },
  pause(on) { P.paused = !!on; if (!P.ctx) return; if (on) P.ctx.suspend(); else P.ctx.resume(); },
  setVolume(v) { P.volume = v; if (P.R && P.cur) P.R.master.gain.setValueAtTime(v * (P.cur.cue.gain || 1), P.ctx.currentTime); },
  get playing() { return P.cur ? P.cur.cue.id : null; },
  get mode() { return P.mode; },
};
})(typeof window !== 'undefined' ? window : globalThis);
