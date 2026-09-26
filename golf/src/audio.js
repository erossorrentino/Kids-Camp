// Synthesized sound effects (no audio files): club impact, cup rattle,
// splash, sand, tree, crowd applause, birdsong and wind.
let ctx = null;
let master = null;
let enabled = true;
let windGain = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambient wind bed
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    src.connect(lp).connect(windGain).connect(master);
    src.start();
    scheduleBirds();
  } catch (e) {
    ctx = null;
  }
}

export function setSound(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.8 : 0;
}

export function setWind(mph) {
  if (windGain) windGain.gain.setTargetAtTime(Math.min(0.12, mph * 0.005), ctx.currentTime, 0.5);
}

function noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, decay = dur, when = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, when = 0, slide = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  impact(kind, power) {
    if (!ctx) return;
    const p = Math.max(0.15, Math.min(1.1, power));
    if (kind === 'putter') {
      tone(1400, 0.05, { type: 'triangle', gain: 0.25 * p + 0.05 });
      noise(0.04, { freq: 2500, q: 3, gain: 0.2 * p });
      return;
    }
    const wood = kind === 'wood' || kind === 'hybrid';
    noise(0.09, { freq: wood ? 2200 : 3400, q: 1.2, gain: 0.9 * p, decay: 0.08 });
    tone(wood ? 950 : 1900, wood ? 0.12 : 0.07, { type: 'triangle', gain: 0.35 * p });
    tone(160, 0.12, { gain: 0.3 * p, slide: -60 });
    if (!wood) noise(0.18, { type: 'lowpass', freq: 600, gain: 0.35 * p, when: 0.01, decay: 0.16 }); // turf
  },
  cup() {
    for (let i = 0; i < 4; i++) tone(2600 - i * 300, 0.05, { type: 'square', gain: 0.07, when: 0.05 + i * 0.07 + Math.random() * 0.03 });
    tone(420, 0.2, { gain: 0.15, when: 0.32 });
  },
  splash() { noise(0.7, { type: 'lowpass', freq: 1400, gain: 0.7, decay: 0.6 }); noise(0.3, { freq: 3000, q: 0.8, gain: 0.3, when: 0.05 }); },
  sand() { noise(0.25, { type: 'lowpass', freq: 900, gain: 0.5, decay: 0.2 }); },
  bounce(speed) { if (speed > 1.2) noise(0.06, { type: 'lowpass', freq: 500, gain: Math.min(0.4, speed * 0.03) }); },
  tree() { tone(700, 0.06, { type: 'square', gain: 0.12 }); noise(0.2, { freq: 3500, q: 0.6, gain: 0.25, when: 0.02 }); },
  pin() { tone(3200, 0.25, { type: 'triangle', gain: 0.2 }); },
  applause(strength = 1) {
    if (!ctx) return;
    const n = Math.round(30 + 50 * strength);
    for (let i = 0; i < n; i++) {
      noise(0.05, { freq: 1500 + Math.random() * 2500, q: 2, gain: 0.08 * strength, when: Math.random() * 1.8 * Math.max(0.6, strength) });
    }
    if (strength > 0.8) noise(1.4, { freq: 900, q: 0.7, gain: 0.08 * strength, attack: 0.3, decay: 1.4 }); // roar
  },
  groan() { noise(0.9, { type: 'lowpass', freq: 380, gain: 0.25, attack: 0.15, decay: 0.8 }); },
  click() { tone(900, 0.03, { type: 'square', gain: 0.05 }); },
};

function scheduleBirds() {
  if (!ctx) return;
  const chirp = () => {
    if (enabled && ctx.state === 'running') {
      const base = 2400 + Math.random() * 2200;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone(base + Math.random() * 400, 0.07, { gain: 0.025, when: i * 0.11, slide: 700 });
    }
    setTimeout(chirp, 3000 + Math.random() * 7000);
  };
  setTimeout(chirp, 2000);
}
