// Synthesized sound effects (no audio files): club impact, cup rattle,
// splash, sand, tree, crowd applause, birdsong and wind.
let ctx = null;
let master = null;
let enabled = true;
let windGain = null;
let rainGain = null;
let noiseBuf = null;
let ambience = { rain: 0, night: false };

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
    // rain bed: bright hiss plus a soft low patter
    const rs = ctx.createBufferSource();
    rs.buffer = noiseBuf;
    rs.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2600;
    hp.Q.value = 0.4;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rs.connect(hp).connect(rainGain).connect(master);
    rs.start(0, 0.7);
    scheduleBirds();
    setAmbience(ambience);
  } catch (e) {
    ctx = null;
  }
}

export function setSound(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.8 : 0;
  if (!on) stopMusic();
}

// Rain (0..1) and night (crickets instead of birds)
export function setAmbience({ rain = 0, night = false } = {}) {
  ambience = { rain, night };
  if (rainGain) rainGain.gain.setTargetAtTime(rain * 0.16, ctx.currentTime, 0.8);
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
  // the club swishing down, loudest as it reaches the ball
  whoosh(power, toImpact = 0.2) {
    if (!ctx) return;
    const p = Math.max(0.2, Math.min(1.1, power));
    const t = Math.max(0.06, toImpact);
    noise(t + 0.18, { freq: 500 + 700 * p, q: 0.7, gain: 0.22 * p, attack: t * 0.9, decay: t + 0.16 });
    noise(t + 0.1, { freq: 1600 + 900 * p, q: 1.4, gain: 0.08 * p, attack: t * 0.95, decay: t + 0.08 });
  },
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
  // the crowd: a hopeful rising "ooooh" and a disappointed falling one
  ooh(strength = 1) { crowdVowel(strength, 1.25, -0.35); },
  aah(strength = 1) { crowdVowel(strength, 1.1, 0.25); },
  thunder() {
    if (!ctx) return;
    noise(3.2, { type: 'lowpass', freq: 160, gain: 0.5, attack: 0.25, decay: 3 });
    noise(1.2, { type: 'lowpass', freq: 420, gain: 0.25, attack: 0.02, decay: 1, when: 0.05 });
  },
};

function scheduleBirds() {
  if (!ctx) return;
  const chirp = () => {
    if (enabled && ctx.state === 'running') {
      if (ambience.night) {
        // crickets: quick high trills
        const f = 4200 + Math.random() * 600;
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) tone(f, 0.035, { type: 'triangle', gain: 0.018, when: i * 0.06 });
      } else if (ambience.rain < 0.5) {
        const base = 2400 + Math.random() * 2200;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) tone(base + Math.random() * 400, 0.07, { gain: 0.025, when: i * 0.11, slide: 700 });
      }
      if (ambience.rain > 0.8 && Math.random() < 0.12) sfx.thunder();
    }
    setTimeout(chirp, ambience.night ? 900 + Math.random() * 1800 : 3000 + Math.random() * 7000);
  };
  setTimeout(chirp, 2000);
}

// A crowd vowel: many voices through two formant filters, gliding in pitch
function crowdVowel(strength, dur, glide) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.35 * strength, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass'; f1.Q.value = 5;
  f1.frequency.setValueAtTime(420, t);
  f1.frequency.linearRampToValueAtTime(420 * (1 + glide), t + dur);
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass'; f2.Q.value = 7;
  f2.frequency.setValueAtTime(900, t);
  f2.frequency.linearRampToValueAtTime(900 * (1 + glide * 0.6), t + dur);
  src.connect(f1).connect(g);
  src.connect(f2).connect(g);
  g.connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.1);
}

// ------------------------------------------------------------ menu music
// A gentle looping tune made on the fly: soft chords, a plucked arpeggio
// and a light shaker. Only plays on the menus.
let music = null;
const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function startMusic() {
  if (!ctx || !enabled || music) return;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(0.16, ctx.currentTime, 1.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  out.connect(lp).connect(master);
  music = { out, next: ctx.currentTime + 0.1, step: 0, timer: 0 };
  const beat = 60 / 88;
  const schedule = () => {
    if (!music) return;
    while (music.next < ctx.currentTime + 1.2) {
      const bar = Math.floor(music.step / 8) % CHORDS.length;
      const chord = CHORDS[bar];
      const i = music.step % 8;
      const t = music.next;
      if (i === 0) {
        // pad: the whole chord for a bar
        for (const n of chord) {
          for (const det of [-6, 6]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = midi(n - 12);
            o.detune.value = det;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.05, t + 0.6);
            g.gain.linearRampToValueAtTime(0.0001, t + beat * 8);
            o.connect(g).connect(music.out);
            o.start(t);
            o.stop(t + beat * 8 + 0.05);
          }
        }
        // bass note
        const b = ctx.createOscillator();
        b.type = 'triangle';
        b.frequency.value = midi(chord[0] - 24);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.28, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + beat * 3.5);
        b.connect(bg).connect(music.out);
        b.start(t); b.stop(t + beat * 4);
      }
      // arpeggio pluck on every beat
      const note = chord[[0, 1, 2, 3, 2, 1, 3, 2][i]] + (i >= 4 ? 12 : 0);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(note);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.9);
      o.connect(g).connect(music.out);
      o.start(t); o.stop(t + beat);
      // shaker on the off-beats
      if (i % 2 === 1) {
        const n = ctx.createBufferSource();
        n.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 6000;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.05, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        n.connect(hp).connect(ng).connect(music.out);
        n.start(t, Math.random()); n.stop(t + 0.1);
      }
      music.next += beat;
      music.step++;
    }
    music.timer = setTimeout(schedule, 300);
  };
  schedule();
}

export function stopMusic() {
  if (!music || !ctx) { music = null; return; }
  const m = music;
  music = null;
  clearTimeout(m.timer);
  m.out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  setTimeout(() => { try { m.out.disconnect(); } catch (e) { /* ignore */ } }, 2500);
}
