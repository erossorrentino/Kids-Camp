/**
 * AUDIO
 * ------------------------------------------------------------------
 * Every sound is synthesised at runtime -- there are no audio files in
 * this project. Guns are filtered noise bursts with a pitched body,
 * lasers are swept oscillators, explosions are noise with a long decay.
 *
 * Positional sounds are panned and attenuated by distance from the
 * listener, which the camera updates each frame.
 */

const NOISE_SECONDS = 2;

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.6;
    this.listener = { x:0, y:0, z:0, fx:0, fz:-1, rx:1, rz:0 };
    this._noise = null;
    this._lastPlay = new Map();
    this._loops = new Map();
  }

  /** Must be called from a user gesture. */
  resume() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    // A gentle limiter keeps a twelve-mech firefight from clipping.
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;
    this.master.connect(this.comp).connect(this.ctx.destination);
    this._buildNoise();
    // A bed requested before the context existed (i.e. before the first
    // click) starts as soon as audio is unlocked.
    if (this._pendingAmbience) {
      const k = this._pendingAmbience;
      this._pendingAmbience = null;
      this.ambience(k);
    }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _buildNoise() {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * NOISE_SECONDS, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  setListener(pos, forward, right) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
    this.listener.fx = forward.x; this.listener.fz = forward.z;
    this.listener.rx = right.x; this.listener.rz = right.z;
  }

  /** Distance gain + stereo pan for a world position. */
  _spatial(pos, refDist = 30, maxDist = 900) {
    if (!pos) return { gain:1, pan:0, delay:0 };
    const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxDist) return null;
    const gain = refDist / (refDist + dist * 0.9);
    const pan = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * this.listener.rx + dz * this.listener.rz) / dist));
    return { gain, pan, delay: Math.min(0.55, dist / 340) };
  }

  _voice(pos, opts = {}) {
    if (!this.ctx || !this.enabled) return null;
    const sp = this._spatial(pos, opts.ref, opts.max);
    if (!sp) return null;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const panner = this.ctx.createStereoPanner?.();
    if (panner) { panner.pan.value = sp.pan; g.connect(panner).connect(this.master); }
    else g.connect(this.master);
    return { g, sp, t: this.ctx.currentTime + (opts.noDelay ? 0 : sp.delay) };
  }

  _noiseSource(playbackRate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    s.playbackRate.value = playbackRate;
    return s;
  }

  /** Short filtered-noise crack: ballistic weapons, impacts. */
  _crack(pos, { freq = 900, q = 1.2, dur = 0.16, vol = 0.5, type = 'bandpass', sweep = 0.4, ref, max } = {}) {
    const v = this._voice(pos, { ref, max });
    if (!v) return;
    const { g, sp, t } = v;
    const src = this._noiseSource(1);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(g);
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * sp.gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /** Pitched oscillator hit: lasers, UI, alerts. */
  _tone(pos, { f0 = 620, f1 = 220, dur = 0.2, vol = 0.35, type = 'sawtooth', ref, max } = {}) {
    const v = this._voice(pos, { ref, max });
    if (!v) return;
    const { g, sp, t } = v;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * sp.gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Deep body thump layered under big weapons and explosions. */
  _thump(pos, { f0 = 90, f1 = 32, dur = 0.5, vol = 0.8, ref, max } = {}) {
    this._tone(pos, { f0, f1, dur, vol, type:'sine', ref, max });
  }

  /** Fire a weapon sound derived from its data record. */
  weapon(w, pos) {
    if (!this.ctx) return;
    const heavy = (w.dmg * (w.pellets || 1)) > 60;
    switch (w.cls) {
      case 'ballistic':
        this._crack(pos, { freq: heavy ? 480 : 1500, q: 0.9, dur: heavy ? 0.3 : 0.11, vol: heavy ? 0.62 : 0.3, sweep:0.25 });
        if (heavy) this._thump(pos, { f0:110, f1:38, dur:0.45, vol:0.6 });
        break;
      case 'energy':
        this._tone(pos, { f0: heavy ? 260 : 1500, f1: heavy ? 1500 : 420, dur: heavy ? 0.36 : 0.16, vol:0.26, type:'square' });
        this._crack(pos, { freq:2600, q:3, dur:0.09, vol:0.12, type:'highpass' });
        break;
      case 'missile':
        this._crack(pos, { freq:700, q:0.6, dur:0.42, vol:0.32, sweep:1.9, type:'lowpass' });
        this._tone(pos, { f0:180, f1:900, dur:0.3, vol:0.14, type:'sawtooth' });
        break;
      default:
        this._tone(pos, { f0:900, f1:1400, dur:0.12, vol:0.16, type:'triangle' });
    }
  }

  explosion(pos, scale = 1) {
    this._crack(pos, { freq: 260 / Math.sqrt(scale), q:0.5, dur: 0.6 * scale, vol: Math.min(0.9, 0.5 * scale), sweep:0.12, type:'lowpass', max:1400 });
    this._thump(pos, { f0: 78 / scale, f1: 26, dur: 0.9 * scale, vol: Math.min(1, 0.7 * scale), max:1400 });
  }

  impact(pos, mat = 'metal') {
    if (mat === 'metal') this._crack(pos, { freq:2400, q:2.5, dur:0.07, vol:0.2, type:'highpass', max:420 });
    else this._crack(pos, { freq:600, q:0.8, dur:0.12, vol:0.16, type:'lowpass', max:420 });
  }

  /** Named one-shots used by abilities and the UI. */
  play(name, pos) {
    if (!this.ctx) return;
    // Rate-limit so a chorus of bots does not stack the same sound.
    const now = this.ctx.currentTime;
    const key = name + (pos ? '' : '_ui');
    if (now - (this._lastPlay.get(key) || -9) < 0.05) return;
    this._lastPlay.set(key, now);
    const P = pos || null;
    switch (name) {
      case 'blink':     this._tone(P, { f0:1800, f1:180, dur:0.3, vol:0.3, type:'sine' }); break;
      case 'burner':    this._crack(P, { freq:400, q:0.4, dur:0.8, vol:0.3, sweep:2.4, type:'lowpass' }); break;
      case 'jets':      this._crack(P, { freq:520, q:0.5, dur:0.6, vol:0.26, sweep:1.6, type:'bandpass' }); break;
      case 'overdrive': this._tone(P, { f0:220, f1:640, dur:0.5, vol:0.28, type:'sawtooth' }); break;
      case 'charge':    this._tone(P, { f0:140, f1:420, dur:0.45, vol:0.4, type:'square' }); break;
      case 'slam':      this.explosion(P, 0.7); break;
      case 'shield':    this._tone(P, { f0:400, f1:880, dur:0.35, vol:0.24, type:'triangle' }); break;
      case 'brace':     this._thump(P, { f0:120, f1:50, dur:0.35, vol:0.5 }); break;
      case 'deploy':    this._tone(P, { f0:300, f1:1100, dur:0.4, vol:0.24, type:'square' }); break;
      case 'smoke':     this._crack(P, { freq:1200, q:0.6, dur:0.7, vol:0.22, sweep:0.2, type:'lowpass' }); break;
      case 'cloak':     this._tone(P, { f0:1400, f1:120, dur:0.6, vol:0.22, type:'sine' }); break;
      case 'overclock': this._tone(P, { f0:300, f1:1500, dur:0.5, vol:0.24, type:'sawtooth' }); break;
      case 'alpha':     this._tone(P, { f0:900, f1:120, dur:0.5, vol:0.32, type:'square' }); break;
      case 'stomp':     this.explosion(P, 1.1); break;
      case 'emp':       this._tone(P, { f0:2200, f1:80, dur:0.7, vol:0.34, type:'sawtooth' }); break;
      case 'ecm':       this._tone(P, { f0:160, f1:96, dur:0.8, vol:0.2, type:'square' }); break;
      case 'scan':      this._tone(P, { f0:700, f1:2400, dur:0.5, vol:0.24, type:'sine' }); break;
      case 'lockon':    this._tone(P, { f0:1200, f1:1200, dur:0.08, vol:0.2, type:'square' }); break;
      case 'callout':   this._tone(P, { f0:520, f1:760, dur:0.25, vol:0.22, type:'triangle' }); break;
      case 'volley':    this._crack(P, { freq:800, q:0.5, dur:0.6, vol:0.4, sweep:2.2, type:'lowpass' }); break;
      case 'repair':    this._tone(P, { f0:600, f1:1000, dur:0.4, vol:0.2, type:'sine' }); break;
      case 'shutdown':  this._tone(P, { f0:400, f1:40, dur:1.4, vol:0.4, type:'sawtooth' }); break;
      case 'startup':   this._tone(P, { f0:60, f1:520, dur:1.2, vol:0.35, type:'sawtooth' }); break;
      case 'warn':      this._tone(P, { f0:880, f1:880, dur:0.12, vol:0.26, type:'square' }); break;
      case 'lock':      this._tone(P, { f0:1600, f1:1600, dur:0.05, vol:0.18, type:'square' }); break;
      case 'kill':      this._tone(P, { f0:1400, f1:2100, dur:0.14, vol:0.3, type:'triangle' }); break;
      case 'hit':       this._tone(P, { f0:2400, f1:1800, dur:0.045, vol:0.16, type:'square' }); break;
      case 'ui':        this._tone(P, { f0:900, f1:1200, dur:0.05, vol:0.14, type:'triangle' }); break;
      case 'uiBack':    this._tone(P, { f0:600, f1:380, dur:0.08, vol:0.14, type:'triangle' }); break;
      case 'dry':       this._crack(P, { freq:3000, q:4, dur:0.05, vol:0.14, type:'highpass' }); break;
      case 'reload':    this._crack(P, { freq:1100, q:2, dur:0.12, vol:0.2, type:'bandpass' }); break;
      case 'footstep':  this._thump(P, { f0:70, f1:34, dur:0.22, vol:0.34, max:260 }); break;
      case 'matchStart':this._tone(P, { f0:300, f1:900, dur:0.8, vol:0.3, type:'sawtooth' }); break;
      case 'victory':   this._tone(P, { f0:520, f1:1040, dur:1.0, vol:0.34, type:'triangle' }); break;
      case 'defeat':    this._tone(P, { f0:400, f1:120, dur:1.2, vol:0.3, type:'sawtooth' }); break;
      default:          this._tone(P, { f0:700, f1:500, dur:0.1, vol:0.16 });
    }
  }

  /** A continuous engine/beam loop keyed by id; call stopLoop to end it. */
  loop(id, { f0 = 90, type = 'sawtooth', vol = 0.1 } = {}) {
    if (!this.ctx || this._loops.has(id)) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = f0;
    g.gain.value = 0;
    o.connect(g).connect(this.master);
    o.start();
    g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.08);
    this._loops.set(id, { o, g });
  }
  setLoop(id, { f0, vol }) {
    const L = this._loops.get(id);
    if (!L) return;
    if (f0 != null) L.o.frequency.setTargetAtTime(f0, this.ctx.currentTime, 0.06);
    if (vol != null) L.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.06);
  }
  stopLoop(id) {
    const L = this._loops.get(id);
    if (!L) return;
    L.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => { try { L.o.stop(); } catch {} }, 260);
    this._loops.delete(id);
  }
  stopAllLoops() { for (const id of [...this._loops.keys()]) this.stopLoop(id); }

  /* ------------------------------------------------------------------ *
   * Ambience
   * ------------------------------------------------------------------ */

  /**
   * A per-biome atmosphere bed: filtered noise for wind or rain, a low
   * drone for the room tone, and a slow LFO on the filter so it breathes
   * instead of sitting there as a flat hiss.
   */
  ambience(kind) {
    if (!this.ctx) { this._pendingAmbience = kind; return; }
    if (this._ambKind === kind) return;
    this.stopAmbience();
    this._ambKind = kind;
    if (!kind) return;

    const P = AMBIENCE[kind] || AMBIENCE.default;
    const t = this.ctx.currentTime;

    const src = this._noiseSource(P.rate);
    const filter = this.ctx.createBiquadFilter();
    filter.type = P.filter;
    filter.frequency.value = P.freq;
    filter.Q.value = P.q;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    gain.gain.setTargetAtTime(P.gain, t, 1.4);

    // Slow sweep so the wind rises and falls.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = P.lfo;
    lfoGain.gain.value = P.freq * P.sweep;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    const drone = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    drone.type = 'sawtooth';
    drone.frequency.value = P.drone;
    droneGain.gain.value = 0;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = P.drone * 4;
    drone.connect(droneFilter).connect(droneGain).connect(this.master);
    drone.start();
    droneGain.gain.setTargetAtTime(P.droneGain, t, 2.0);

    this._amb = { src, gain, lfo, lfoGain, drone, droneGain };
  }

  stopAmbience() {
    this._ambKind = null;
    const a = this._amb;
    if (!a) return;
    this._amb = null;
    const t = this.ctx.currentTime;
    a.gain.gain.setTargetAtTime(0, t, 0.5);
    a.droneGain.gain.setTargetAtTime(0, t, 0.5);
    setTimeout(() => {
      for (const n of [a.src, a.lfo, a.drone]) { try { n.stop(); } catch {} }
    }, 1600);
  }
}

/* Atmosphere presets. `gain` values are deliberately low: this is a bed
 * that should be felt rather than heard over the guns. */
const AMBIENCE = {
  default:    { filter:'bandpass', freq:420,  q:0.7, rate:0.6,  gain:0.018, lfo:0.06, sweep:0.5, drone:48, droneGain:0.012 },
  desert:     { filter:'bandpass', freq:620,  q:0.5, rate:0.75, gain:0.026, lfo:0.08, sweep:0.6, drone:42, droneGain:0.008 },
  arctic:     { filter:'highpass', freq:900,  q:0.4, rate:1.0,  gain:0.038, lfo:0.11, sweep:0.5, drone:38, droneGain:0.010 },
  storm:      { filter:'lowpass',  freq:1400, q:0.3, rate:1.2,  gain:0.055, lfo:0.16, sweep:0.4, drone:34, droneGain:0.016 },
  industrial: { filter:'bandpass', freq:230,  q:1.6, rate:0.4,  gain:0.030, lfo:0.05, sweep:0.3, drone:56, droneGain:0.024 },
  volcanic:   { filter:'lowpass',  freq:260,  q:0.6, rate:0.35, gain:0.040, lfo:0.04, sweep:0.4, drone:31, droneGain:0.028 },
  jungle:     { filter:'bandpass', freq:1800, q:1.2, rate:0.9,  gain:0.024, lfo:0.2,  sweep:0.7, drone:62, droneGain:0.008 },
  orbital:    { filter:'lowpass',  freq:120,  q:0.5, rate:0.25, gain:0.012, lfo:0.03, sweep:0.3, drone:27, droneGain:0.022 },
  citynight:  { filter:'bandpass', freq:340,  q:0.8, rate:0.5,  gain:0.020, lfo:0.07, sweep:0.4, drone:44, droneGain:0.016 },
  wasteland:  { filter:'bandpass', freq:520,  q:0.6, rate:0.7,  gain:0.028, lfo:0.09, sweep:0.6, drone:40, droneGain:0.010 },
  underwater: { filter:'lowpass',  freq:180,  q:1.1, rate:0.3,  gain:0.034, lfo:0.05, sweep:0.5, drone:24, droneGain:0.030 },
};
