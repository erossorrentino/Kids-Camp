// Procedural audio (Web Audio). No sound files: engines are synthesised
// from looping firing-pulse waveforms built per cylinder count (inline-4
// buzz, V8 burble, V12/Formula scream, electric whine), pitched by rpm and
// crossfaded between on/off-throttle timbres. Plus tyre squeal, wind,
// surface rumble, turbo whistle, backfire pops, impacts and UI sounds.
import { clamp, lerp, mulberry32 } from '../core/rng.js';

const ENGINE_PROFILES = {
  i4: { base: 3000, irregular: 0.06, noise: 0.35, tone: 0.55, drive: 1.6, cutoff: 900 },
  i6: { base: 3000, irregular: 0.04, noise: 0.25, tone: 0.75, drive: 1.4, cutoff: 1200 },
  v6: { base: 3000, irregular: 0.1, noise: 0.3, tone: 0.65, drive: 1.6, cutoff: 1100 },
  v8: { base: 2500, irregular: 0.32, noise: 0.42, tone: 0.5, drive: 2.2, cutoff: 700 },
  v10: { base: 4000, irregular: 0.08, noise: 0.25, tone: 0.8, drive: 1.8, cutoff: 1600 },
  v12: { base: 4000, irregular: 0.04, noise: 0.2, tone: 0.9, drive: 1.6, cutoff: 1900 },
  f6: { base: 3500, irregular: 0.12, noise: 0.35, tone: 0.65, drive: 1.9, cutoff: 1300 },
  f1: { base: 6000, irregular: 0.03, noise: 0.18, tone: 0.95, drive: 2.0, cutoff: 2600 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.muted = false;
    this.buffers = new Map();
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.ui = ctx.createGain(); this.ui.gain.value = 0.5; this.ui.connect(this.master);
    // shared noise buffer
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    const rnd = mulberry32(7);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  toggleMute() { this.muted = !this.muted; this.setVolume(this.volume); return this.muted; }

  // ---------------------------------------------------------------------------
  // Engine waveform synthesis
  // ---------------------------------------------------------------------------
  engineBuffer(type, cyl, onThrottle) {
    const key = `${type}_${cyl}_${onThrottle}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const P = ENGINE_PROFILES[type] || ENGINE_PROFILES.i4;
    const ctx = this.ctx, sr = ctx.sampleRate;
    const cycle = 120 / P.base; // seconds per 4-stroke cycle
    const nCycles = Math.max(8, Math.round(0.9 / cycle));
    const len = Math.round(nCycles * cycle * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const rnd = mulberry32(cyl * 31 + (onThrottle ? 1 : 2));
    const firings = Math.max(1, cyl);
    // per-cylinder amplitude/timing signature (constant every cycle -> loops seamlessly)
    const amp = [], jit = [];
    for (let c = 0; c < firings; c++) {
      amp.push(1 - P.irregular + rnd() * P.irregular * 2);
      jit.push((rnd() - 0.5) * P.irregular * 0.35);
    }
    const tau = cycle / firings / (onThrottle ? 3.2 : 2.2);
    const res = (P.base / 60) * (firings / 2) * (onThrottle ? 3.1 : 2.2); // resonance
    let lp = 0, nState = 0;
    for (let cy = 0; cy < nCycles; cy++) {
      for (let c = 0; c < firings; c++) {
        const t0 = (cy + (c + jit[c]) / firings) * cycle;
        const start = Math.floor(t0 * sr);
        const dur = Math.floor(tau * 7 * sr);
        for (let k = 0; k < dur; k++) {
          const t = k / sr;
          const env = (t / tau) * Math.exp(1 - t / tau);
          const idx = (start + k) % len;
          const tone = Math.sin(2 * Math.PI * res * t) * P.tone;
          out[idx] += env * amp[c] * (0.9 + tone);
        }
      }
    }
    // add enveloped noise roughness + soft clip + one-pole low-pass + DC removal
    let mean = 0;
    for (let i = 0; i < len; i++) mean += out[i];
    mean /= len;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      let s = out[i] - mean;
      nState = nState * 0.6 + (rnd() * 2 - 1) * 0.4;
      s += nState * P.noise * (Math.abs(s) * 0.8 + 0.08);
      s = Math.tanh(s * P.drive * (onThrottle ? 1.2 : 0.8));
      lp += (s - lp) * (onThrottle ? 0.55 : 0.3);
      out[i] = lp;
      peak = Math.max(peak, Math.abs(lp));
    }
    // crossfade the loop seam
    const fade = Math.floor(sr * 0.004);
    for (let i = 0; i < fade; i++) { const t = i / fade; out[i] = out[i] * t + out[len - fade + i] * (1 - t); }
    for (let i = 0; i < len; i++) out[i] /= peak || 1;
    this.buffers.set(key, buf);
    return buf;
  }

  // An engine voice: returns a controller {update(rpm, throttle, opts), stop()}
  createEngine({ sound = 'i4', cyl = 4, ev = false, gain = 1, pannable = false, turbo = false } = {}) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    let panner = null;
    if (pannable && ctx.createStereoPanner) { panner = ctx.createStereoPanner(); out.connect(panner); panner.connect(this.sfx); }
    else out.connect(this.sfx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.Q.value = 0.9; filter.frequency.value = 1200;
    filter.connect(out);
    const nodes = [];
    let on = null, off = null, onG = null, offG = null, base = 1, oscs = null;
    if (ev) {
      // electric: layered whine
      oscs = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
      const gs = [0.5, 0.18, 0.08];
      oscs[0].type = 'sine'; oscs[1].type = 'triangle'; oscs[2].type = 'sine';
      oscs.forEach((o, i) => { const g = ctx.createGain(); g.gain.value = gs[i]; o.connect(g); g.connect(filter); o.start(); nodes.push(o, g); });
    } else {
      const P = ENGINE_PROFILES[sound] || ENGINE_PROFILES.i4;
      base = P.base;
      const mk = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
      on = mk(this.engineBuffer(sound, cyl, true));
      off = mk(this.engineBuffer(sound, cyl, false));
      onG = ctx.createGain(); offG = ctx.createGain();
      on.connect(onG); off.connect(offG); onG.connect(filter); offG.connect(filter);
      on.start(); off.start(ctx.currentTime + 0.013);
      nodes.push(on, off, onG, offG);
      this._cut = P.cutoff;
    }
    // turbo whistle
    let tOsc = null, tG = null;
    if (turbo) {
      tOsc = ctx.createOscillator(); tOsc.type = 'sine'; tG = ctx.createGain(); tG.gain.value = 0;
      tOsc.connect(tG); tG.connect(out); tOsc.start(); nodes.push(tOsc, tG);
    }
    const cutoffBase = ENGINE_PROFILES[sound]?.cutoff || 1200;
    let lastThrottle = 0;
    const self = this;
    const voice = {
      update(rpm, throttle, { load = 1, vol = 1, pan = 0, limiter = false, dist = 0 } = {}) {
        const t = ctx.currentTime;
        const r = Math.max(300, rpm);
        if (ev) {
          const f = 120 + r * 0.055;
          oscs[0].frequency.setTargetAtTime(f, t, 0.03);
          oscs[1].frequency.setTargetAtTime(f * 2.01, t, 0.03);
          oscs[2].frequency.setTargetAtTime(f * 4.7, t, 0.03);
          filter.frequency.setTargetAtTime(1200 + throttle * 3000, t, 0.05);
          out.gain.setTargetAtTime(gain * vol * (0.12 + throttle * 0.22), t, 0.05);
        } else {
          const rate = r / base;
          on.playbackRate.setTargetAtTime(rate, t, 0.02);
          off.playbackRate.setTargetAtTime(rate, t, 0.02);
          const th = limiter ? 0.2 : throttle;
          onG.gain.setTargetAtTime(0.15 + th * 0.85, t, 0.04);
          offG.gain.setTargetAtTime((1 - th) * 0.75 + 0.1, t, 0.04);
          const cut = cutoffBase * (0.6 + rate * 0.5) * (0.55 + th * 0.9) / (1 + dist * 0.02);
          filter.frequency.setTargetAtTime(clamp(cut, 200, 12000), t, 0.04);
          out.gain.setTargetAtTime(gain * vol * (0.28 + th * 0.32 + Math.min(0.25, rate * 0.05)), t, 0.04);
        }
        if (tOsc) {
          tOsc.frequency.setTargetAtTime(1800 + r * 0.5, t, 0.05);
          tG.gain.setTargetAtTime(throttle * Math.min(1, r / 6000) * 0.035 * gain * vol, t, 0.1);
          // blow-off on lift
          if (lastThrottle > 0.7 && throttle < 0.2 && r > 4000) self.blowOff(vol * gain);
        }
        if (panner) panner.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.05);
        lastThrottle = throttle;
      },
      stop() {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.05);
        setTimeout(() => { for (const n of nodes) { try { n.stop && n.stop(); } catch (e) { /* already stopped */ } try { n.disconnect(); } catch (e) { /* ignore */ } } out.disconnect(); }, 300);
      },
    };
    return voice;
  }

  // Looping filtered-noise layer (squeal, wind, rumble)
  noiseLayer(type, freq, q = 1) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(0, Math.random() * 1.5);
    return {
      set(gain, fr) { const t = ctx.currentTime; g.gain.setTargetAtTime(gain, t, 0.05); if (fr) f.frequency.setTargetAtTime(fr, t, 0.05); },
      stop() { try { src.stop(); } catch (e) { /* ignore */ } src.disconnect(); g.disconnect(); },
    };
  }

  // ---------------------------------------------------------------------------
  // One-shots
  // ---------------------------------------------------------------------------
  burst(dur, type, freq, gain, q = 1, dest = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, gain = 0.2, type = 'sine', dest = null, when = 0, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.ui);
    o.start(t); o.stop(t + dur + 0.05);
  }
  impact(strength) {
    const s = clamp(strength / 12, 0.1, 1);
    this.burst(0.35, 'lowpass', 500 + s * 1500, 0.9 * s);
    this.tone(70, 0.25, 0.6 * s, 'sine', this.sfx, 0, 0.5);
    if (s > 0.4) this.burst(0.5, 'highpass', 3000, 0.25 * s);
  }
  backfire(gain = 1) { this.burst(0.08, 'bandpass', 180 + Math.random() * 120, 1.2 * gain, 1.5); this.burst(0.05, 'lowpass', 900, 0.5 * gain); }
  blowOff(gain = 1) { this.burst(0.35, 'bandpass', 3800, 0.18 * gain, 0.8); }
  beep(high = false) { this.tone(high ? 880 : 440, high ? 0.6 : 0.22, 0.35, 'square'); }
  click() { this.tone(1400, 0.05, 0.12, 'triangle'); }
  hover() { this.tone(2200, 0.03, 0.04, 'sine'); }
  cash() { [880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.25, 0.18, 'triangle', null, i * 0.07)); }
  error() { this.tone(220, 0.25, 0.2, 'sawtooth'); }
  fanfare() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, i === 5 ? 0.9 : 0.22, 0.2, 'triangle', null, i * 0.14)); }
  crowdCheer(dur = 3) { this.burst(dur, 'bandpass', 1300, 0.35, 0.5); this.burst(dur * 0.8, 'bandpass', 2400, 0.15, 0.7); }
}

export const audio = new AudioEngine();
