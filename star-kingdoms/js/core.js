/* Star Kingdoms — core utilities: math, seeded noise, object pools, audio. */
window.SK = window.SK || {};
(function (SK) {
  'use strict';

  /* ---------------------------------------------------------------- math */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const chance = (p) => Math.random() < p;
  // Frame-rate independent exponential approach.
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const angleDelta = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const dampAngle = (a, b, rate, dt) => a + angleDelta(a, b) * (1 - Math.exp(-rate * dt));

  /* --------------------------------------------------- seeded randomness */
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    const fn = function () {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.range = (a, b) => a + fn() * (b - a);
    fn.int = (a, b) => Math.floor(a + fn() * (b - a + 1));
    fn.pick = (arr) => arr[(fn() * arr.length) | 0];
    fn.sign = () => (fn() < 0.5 ? -1 : 1);
    return fn;
  }

  /* ------------------------------------------------ value noise + fbm 2d */
  function makeNoise(seed) {
    const rng = makeRng(seed);
    const SIZE = 256, MASK = 255;
    const perm = new Uint8Array(SIZE * 2);
    const grad = new Float32Array(SIZE * 2);
    for (let i = 0; i < SIZE; i++) { perm[i] = i; grad[i] = rng() * 2 - 1; }
    for (let i = SIZE - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < SIZE; i++) { perm[i + SIZE] = perm[i]; grad[i + SIZE] = grad[i]; }

    function value(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = smoothstep(xf), v = smoothstep(yf);
      const X = xi & MASK, Y = yi & MASK;
      const aa = grad[(perm[X] + perm[Y]) & MASK];
      const ba = grad[(perm[X + 1] + perm[Y]) & MASK];
      const ab = grad[(perm[X] + perm[Y + 1]) & MASK];
      const bb = grad[(perm[X + 1] + perm[Y + 1]) & MASK];
      return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
    }
    function fbm(x, y, octaves, lacunarity, gain) {
      octaves = octaves || 4; lacunarity = lacunarity || 2.03; gain = gain || 0.5;
      let amp = 0.5, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += value(x * freq, y * freq) * amp;
        norm += amp; amp *= gain; freq *= lacunarity;
      }
      return sum / norm;
    }
    // Sharp ridged noise — reads as mountain spines and canyon walls.
    function ridged(x, y, octaves) {
      octaves = octaves || 4;
      let amp = 0.5, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += (1 - Math.abs(value(x * freq, y * freq))) * amp;
        norm += amp; amp *= 0.5; freq *= 2.07;
      }
      return (sum / norm) * 2 - 1;
    }
    return { value, fbm, ridged };
  }

  /* -------------------------------------------------------- number fmt */
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(n);
  }

  /* -------------------------------------------------------------- audio */
  const Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    enabled: true, _pad: null, _padFilter: null,

    init() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return false; }
      try { this.ctx = new AC(); } catch (e) { this.enabled = false; return false; }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
      return true;
    },
    resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setVolume(v) { if (this.master) this.master.gain.value = v; this.enabled = v > 0; },

    _noiseBuffer: null,
    noise() {
      if (this._noiseBuffer) return this._noiseBuffer;
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
      return buf;
    },

    tone(opt) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = opt.type || 'sine';
      o.frequency.setValueAtTime(opt.f0, t);
      if (opt.f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t + opt.dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t + (opt.attack || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
      let node = o;
      if (opt.filter) {
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(opt.filter[0], t);
        f.frequency.exponentialRampToValueAtTime(opt.filter[1], t + opt.dur);
        f.Q.value = opt.q || 6;
        node.connect(f); node = f;
      }
      node.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + opt.dur + 0.05);
    },

    burst(opt) {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise();
      const f = this.ctx.createBiquadFilter();
      f.type = opt.type || 'lowpass';
      f.frequency.setValueAtTime(opt.f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, opt.f1), t + opt.dur);
      f.Q.value = opt.q || 1.2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(opt.gain || 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t); src.stop(t + opt.dur + 0.05);
    },

    laser() { this.tone({ type: 'sawtooth', f0: 1400, f1: 220, dur: 0.16, gain: 0.16, filter: [3800, 500], q: 9 }); },
    heavyShot() { this.tone({ type: 'square', f0: 420, f1: 70, dur: 0.3, gain: 0.2, filter: [1800, 200], q: 7 }); },
    hit() { this.burst({ f0: 2600, f1: 500, dur: 0.1, gain: 0.16 }); },
    explode() {
      this.burst({ f0: 900, f1: 60, dur: 0.75, gain: 0.42 });
      this.tone({ type: 'sine', f0: 140, f1: 32, dur: 0.6, gain: 0.3 });
    },
    click() { this.tone({ type: 'triangle', f0: 720, f1: 900, dur: 0.06, gain: 0.1 }); },
    confirm() { this.tone({ type: 'triangle', f0: 540, f1: 1080, dur: 0.16, gain: 0.14 }); },
    deny() { this.tone({ type: 'square', f0: 220, f1: 110, dur: 0.18, gain: 0.12, filter: [900, 300] }); },
    deploy() { this.tone({ type: 'sawtooth', f0: 180, f1: 700, dur: 0.22, gain: 0.14, filter: [600, 3000] }); },
    build() { this.tone({ type: 'triangle', f0: 320, f1: 880, dur: 0.35, gain: 0.16 }); this.burst({ f0: 1400, f1: 300, dur: 0.3, gain: 0.1 }); },
    warp() {
      this.tone({ type: 'sawtooth', f0: 80, f1: 2400, dur: 1.5, gain: 0.2, filter: [300, 6000], q: 8 });
      this.burst({ f0: 200, f1: 6000, dur: 1.5, gain: 0.14, type: 'bandpass', q: 3 });
    },
    victory() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => this.tone({ type: 'triangle', f0: f, dur: 0.5, gain: 0.16 }), i * 110);
      });
    },
    defeat() {
      [392, 349.23, 293.66, 220].forEach((f, i) => {
        setTimeout(() => this.tone({ type: 'sawtooth', f0: f, dur: 0.55, gain: 0.13, filter: [1200, 300] }), i * 150);
      });
    },

    /* Slow two-voice drone pad. Each planet gets its own root note. */
    setAmbient(rootHz, on) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (!this._pad) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 2;
        filter.connect(this.musicGain);
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.06; lfoGain.gain.value = 260;
        lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
        const voices = [];
        for (let i = 0; i < 3; i++) {
          const o = this.ctx.createOscillator();
          o.type = i === 2 ? 'triangle' : 'sawtooth';
          const g = this.ctx.createGain();
          g.gain.value = i === 2 ? 0.14 : 0.1;
          o.connect(g); g.connect(filter); o.start();
          voices.push(o);
        }
        this._pad = { voices, filter };
      }
      const mult = [1, 1.4983, 2.0];
      this._pad.voices.forEach((o, i) => {
        o.frequency.setTargetAtTime(rootHz * mult[i], t, 1.2);
        o.detune.setTargetAtTime(i === 1 ? 7 : -5, t, 1.0);
      });
      this.musicGain.gain.setTargetAtTime(on ? 0.16 : 0.0, t, 1.5);
    }
  };

  /* ------------------------------------------------------ tiny event bus */
  function makeBus() {
    const map = {};
    return {
      on(k, fn) { (map[k] = map[k] || []).push(fn); return () => this.off(k, fn); },
      off(k, fn) { if (map[k]) map[k] = map[k].filter((f) => f !== fn); },
      emit(k, a, b) { (map[k] || []).forEach((f) => f(a, b)); }
    };
  }

  /* -------------------------------------------------------- dom helpers */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  SK.util = {
    TAU, clamp, lerp, invLerp, smoothstep, rand, randInt, pick, chance, damp,
    angleDelta, dampAngle, makeRng, makeNoise, fmt, makeBus, $, $$, el
  };
  SK.Audio = Audio;
})(window.SK);
