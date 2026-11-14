'use strict';
/* ============================================================
   Audio: every sound is synthesized with WebAudio (no files).
   ============================================================ */

const AU = { ctx: null, on: false, vol: { master: 0.8, sfx: 1, crowd: 0.8, music: 0.5 }, crowdLevel: 0.12, lastSqueak: 0, musicOn: false };

function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const c = new AC();
  AU.ctx = c;
  AU.master = c.createGain(); AU.master.gain.value = AU.vol.master;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  AU.master.connect(comp); comp.connect(c.destination);
  AU.sfx = c.createGain(); AU.sfx.gain.value = AU.vol.sfx; AU.sfx.connect(AU.master);
  AU.music = c.createGain(); AU.music.gain.value = 0; AU.music.connect(AU.master);
  // shared noise buffer
  const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  AU.noise = buf;
  // pinkish noise for the crowd
  const pb = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const o = pb.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; o[i] = (b0 + b1 + b2) * 2.2; }
  }
  const src = c.createBufferSource(); src.buffer = pb; src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.55;
  const bp2 = c.createBiquadFilter(); bp2.type = 'peaking'; bp2.frequency.value = 2400; bp2.gain.value = 4;
  AU.crowdG = c.createGain(); AU.crowdG.gain.value = 0;
  AU.crowdBus = c.createGain(); AU.crowdBus.gain.value = AU.vol.crowd;
  src.connect(bp); bp.connect(bp2); bp2.connect(AU.crowdG); AU.crowdG.connect(AU.crowdBus); AU.crowdBus.connect(AU.master);
  src.start();
  AU.crowdF = bp;
  AU.on = true;
}
function now() { return AU.ctx.currentTime; }
function env(g, t, a, peak, dcy) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
}
function panNode(x) {
  const p = AU.ctx.createStereoPanner ? AU.ctx.createStereoPanner() : null;
  if (p) { p.pan.value = clamp((x || 0) / 55, -0.8, 0.8); p.connect(AU.sfx); return p; }
  return AU.sfx;
}
function noiseSrc(t, dur) {
  const s = AU.ctx.createBufferSource(); s.buffer = AU.noise;
  s.start(t, Math.random() * 1.5, dur + 0.05);
  return s;
}
function tone(type, f0, f1, t, dur, peak, out, a) {
  const c = AU.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a || 0.004, peak, dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function noiseHit(t, type, freq, q, dur, peak, out, a) {
  const c = AU.ctx, s = noiseSrc(t, dur + (a || 0)), f = c.createBiquadFilter(), g = c.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, a || 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(out);
}

const SFX = {
  dribble(v, x) {
    const t = now(), out = panNode(x), k = clamp(v / 12, 0.25, 1.1);
    tone('sine', 150, 52, t, 0.11, 0.55 * k, out);
    noiseHit(t, 'lowpass', 1300, 0.7, 0.05, 0.22 * k, out);
  },
  swish() {
    const t = now(), out = AU.sfx;
    noiseHit(t, 'bandpass', 5200, 0.6, 0.32, 0.34, out, 0.02);
    noiseHit(t + 0.03, 'highpass', 7000, 0.5, 0.25, 0.12, out, 0.03);
  },
  rim(v) {
    const t = now(), out = AU.sfx, k = clamp(v / 14, 0.2, 1);
    const f = 480 + Math.random() * 60;
    tone('sine', f, f * 0.995, t, 0.5, 0.32 * k, out);
    tone('sine', f * 2.41, f * 2.4, t, 0.3, 0.16 * k, out);
    tone('sine', f * 4.05, f * 4.02, t, 0.18, 0.08 * k, out);
    noiseHit(t, 'bandpass', 2500, 1.2, 0.06, 0.25 * k, out);
  },
  backboard(v) {
    const t = now(), out = AU.sfx, k = clamp(v / 14, 0.2, 1);
    tone('sine', 110, 70, t, 0.16, 0.45 * k, out);
    noiseHit(t, 'bandpass', 700, 1.0, 0.12, 0.35 * k, out);
  },
  bounce(v, x) { SFX.dribble(v * 1.2, x); },
  whistle() {
    const c = AU.ctx, t = now(), o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = 2950;
    lfo.frequency.value = 34; lg.gain.value = 140; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
    g.gain.setValueAtTime(0.32, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    o.connect(f); f.connect(g); g.connect(AU.sfx);
    o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
    noiseHit(t, 'highpass', 4000, 0.5, 0.4, 0.05, AU.sfx, 0.02);
  },
  buzzer() {
    const c = AU.ctx, t = now(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.setValueAtTime(0.22, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    for (const fr of [196, 199, 392]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + 1.2); }
    f.connect(g); g.connect(AU.sfx);
  },
  squeak(x) {
    const t = now();
    if (t - AU.lastSqueak < 0.18) return;
    AU.lastSqueak = t;
    const out = panNode(x), f = 1700 + Math.random() * 900;
    tone('triangle', f, f * 1.5, t, 0.07, 0.05, out, 0.01);
    tone('sine', f * 2, f * 2.6, t + 0.01, 0.05, 0.03, out, 0.01);
  },
  catch_() { const t = now(); tone('sine', 220, 120, t, 0.06, 0.18, AU.sfx); noiseHit(t, 'bandpass', 1800, 0.8, 0.04, 0.12, AU.sfx); },
  block() { const t = now(); noiseHit(t, 'lowpass', 900, 0.8, 0.12, 0.5, AU.sfx); tone('sine', 160, 60, t, 0.14, 0.4, AU.sfx); },
  dunk() {
    const t = now();
    tone('sine', 90, 40, t, 0.35, 0.8, AU.sfx); noiseHit(t, 'lowpass', 400, 0.7, 0.3, 0.6, AU.sfx);
    SFX.rim(16);
  },
  ui(kind) {
    if (!AU.on) return;
    const t = now();
    if (kind === 'move') tone('sine', 880, 990, t, 0.05, 0.07, AU.sfx);
    else if (kind === 'ok') { tone('triangle', 660, 660, t, 0.08, 0.1, AU.sfx); tone('triangle', 990, 990, t + 0.07, 0.12, 0.1, AU.sfx); }
    else if (kind === 'back') tone('triangle', 520, 380, t, 0.1, 0.09, AU.sfx);
    else if (kind === 'perfect') { tone('sine', 1320, 1320, t, 0.16, 0.12, AU.sfx); tone('sine', 1980, 1980, t + 0.05, 0.2, 0.08, AU.sfx); }
  },
};

/* crowd reacts to the game */
function crowdBase(level) { AU.crowdLevel = level; }
function crowdUpdate(dt) {
  if (!AU.on) return;
  const t = now();
  AU.crowdG.gain.setTargetAtTime(AU.crowdLevel * (0.9 + 0.2 * Math.sin(t * 0.7)), t, 0.4);
}
function crowdRoar(amount, dur) {
  if (!AU.on) return;
  const c = AU.ctx, t = now(), g = c.createGain(), f = c.createBiquadFilter(), s = noiseSrc(t, dur + 1);
  f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.45;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * amount, t + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(AU.crowdBus);
  AU.crowdF.frequency.setTargetAtTime(1300, t, 0.1); AU.crowdF.frequency.setTargetAtTime(900, t + 0.5, 0.8);
}
function crowdGroan() {
  if (!AU.on) return;
  const c = AU.ctx, t = now(), g = c.createGain(), f = c.createBiquadFilter(), s = noiseSrc(t, 1.4);
  f.type = 'bandpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(320, t + 1.1); f.Q.value = 1.4;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  s.connect(f); f.connect(g); g.connect(AU.crowdBus);
}
function crowdClap() {
  if (!AU.on) return;
  const t = now();
  for (const off of [0, 0.32]) {
    for (let i = 0; i < 5; i++) noiseHit(t + off + Math.random() * 0.03, 'bandpass', 1500 + Math.random() * 900, 1.1, 0.07, 0.07, AU.crowdBus);
  }
}

/* menu music: a laid-back loop built from the same synth parts */
const MUSIC = { step: 0, next: 0, timer: null, bpm: 92 };
function musicStart() {
  if (!AU.on || AU.musicOn) return;
  AU.musicOn = true;
  AU.music.gain.setTargetAtTime(AU.vol.music * 0.5, now(), 0.5);
  MUSIC.next = now() + 0.1; MUSIC.step = 0;
  if (!MUSIC.timer) MUSIC.timer = setInterval(musicTick, 40);
}
function musicStop() {
  if (!AU.on || !AU.musicOn) return;
  AU.musicOn = false;
  AU.music.gain.setTargetAtTime(0, now(), 0.3);
}
function musicTick() {
  if (!AU.on) return;
  if (!AU.musicOn && AU.music.gain.value < 0.002) return;
  const spb = 60 / MUSIC.bpm / 4;
  const bassNotes = [43, 43, 46, 46, 41, 41, 38, 39];
  const chords = [[55, 58, 62, 65], [58, 62, 65, 69], [53, 57, 60, 64], [50, 53, 57, 60]];
  while (MUSIC.next < now() + 0.15) {
    const t = MUSIC.next, s = MUSIC.step % 32, bar = Math.floor(MUSIC.step / 16) % 4, out = AU.music;
    const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
    if (s % 16 === 0 || s % 16 === 10) { tone('sine', 140, 45, t, 0.28, 0.9, out); }
    if (s % 8 === 4) { noiseHit(t, 'bandpass', 1900, 0.8, 0.16, 0.45, out); tone('triangle', 220, 180, t, 0.08, 0.2, out); }
    if (s % 2 === 0) noiseHit(t, 'highpass', 8000, 0.6, s % 4 === 2 ? 0.08 : 0.03, 0.14, out);
    if (s % 4 === 0) { const n = bassNotes[(MUSIC.step / 4) % 8 | 0]; tone('triangle', mf(n - 12), mf(n - 12), t, spb * 3.2, 0.38, out, 0.01); }
    if (s % 16 === 0) for (const n of chords[bar]) {
      const c = AU.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = mf(n); f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 15);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + spb * 16);
    }
    if ((s === 6 || s === 14 || s === 22 || s === 27) && Math.random() < 0.8) { const n = chords[bar][(Math.random() * 4) | 0] + 12; tone('sine', mf(n), mf(n), t, 0.22, 0.09, out, 0.005); }
    MUSIC.next += spb; MUSIC.step++;
  }
}
function setVolumes() {
  if (!AU.on) return;
  const t = now();
  AU.master.gain.setTargetAtTime(AU.vol.master, t, 0.05);
  AU.sfx.gain.setTargetAtTime(AU.vol.sfx, t, 0.05);
  AU.crowdBus.gain.setTargetAtTime(AU.vol.crowd, t, 0.05);
  if (AU.musicOn) AU.music.gain.setTargetAtTime(AU.vol.music * 0.5, t, 0.05);
}

/* optional announcer using the browser's speech engine */
const VOICE = { on: false, last: 0 };
function say(text, prio) {
  if (!VOICE.on || !window.speechSynthesis) return;
  const t = performance.now();
  if (t - VOICE.last < (prio ? 1500 : 4500)) return;
  VOICE.last = t;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.12; u.pitch = 0.9; u.volume = AU.vol.master;
    speechSynthesis.speak(u);
  } catch (e) { /* speech unavailable */ }
}
