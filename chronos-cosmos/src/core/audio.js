import * as THREE from 'three';
import { G } from './G.js';

// Fully procedural audio: generative score per Age with combat/boss layers,
// synthesized spatial SFX and ambient soundscapes. No audio files.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SCALES = {
  bloom: { root: 62, scale: [0, 2, 4, 6, 7, 9, 11], prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], tempo: 72 },
  ash: { root: 50, scale: [0, 1, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [1, 5, 8], [-2, 1, 5], [0, 3, 7]], tempo: 60 },
  stars: { root: 63, scale: [0, 2, 4, 6, 7, 9, 11], prog: [[0, 7, 16], [4, 11, 19], [9, 16, 21], [2, 9, 14]], tempo: 66 },
  rift: { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], tempo: 128 },
  title: { root: 62, scale: [0, 2, 4, 7, 9], prog: [[0, 7, 16], [5, 12, 16], [9, 16, 19], [7, 14, 19]], tempo: 64 },
  ending: { root: 60, scale: [0, 2, 4, 5, 7, 9, 11], prog: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]], tempo: 58 },
};

export class Audio {
  constructor() {
    this.ready = false;
    this.mood = 'title';
    this.intensity = 0;
    this.targetIntensity = 0;
    this.musicOverride = null;
    this.beat = 0;
    this.nextTime = 0;
    this.region = null;
    this.melody = { deg: 0, rest: 0 };
    this.lastFoot = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.music = c.createGain();
    this.sfxBus = c.createGain();
    this.amb = c.createGain();
    this.music.connect(this.master);
    this.sfxBus.connect(this.master);
    this.amb.connect(this.master);
    // reverb
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.2);
    this.revSend = c.createGain();
    this.revSend.gain.value = 0.5;
    this.revSend.connect(this.reverb);
    this.reverb.connect(this.master);
    // delay for plucks
    this.delay = c.createDelay(1);
    this.delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delayOut = c.createGain();
    this.delayOut.gain.value = 0.3;
    this.delay.connect(this.delayOut);
    this.delayOut.connect(this.music);
    this.delayOut.connect(this.revSend);
    // noise
    this.noise = this.makeNoise(2);
    this.setVolume();
    this.buildAmbience();
    this.ready = true;
    this.nextTime = c.currentTime + 0.1;
  }
  start() {
    this.init();
  }

  setVolume() {
    if (!this.ctx) return;
    const s = G.settings;
    this.master.gain.value = s.volume;
    this.music.gain.value = s.music * 0.55;
    this.sfxBus.gain.value = 0.9;
    this.amb.gain.value = 0.5;
  }

  impulse(dur, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  makeNoise(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ------------------------------------------------------------ spatial out
  out(pos, vol = 1, rev = 0.2) {
    const c = this.ctx;
    const g = c.createGain();
    let v = vol;
    let pan = 0;
    if (pos && G.camera) {
      const cam = G.camera.position;
      const dx = pos.x - cam.x, dy = (pos.y ?? cam.y) - cam.y, dz = pos.z - cam.z;
      const d = Math.hypot(dx, dy, dz);
      v *= 1 / (1 + Math.max(0, d - 3) / 10);
      if (d > 90) return null;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(G.camera.quaternion);
      pan = Math.max(-0.9, Math.min(0.9, (dx * right.x + dz * right.z) / (d || 1)));
    }
    g.gain.value = v;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfxBus);
      if (rev > 0) {
        const s = c.createGain();
        s.gain.value = rev;
        p.connect(s);
        s.connect(this.revSend);
      }
    } else g.connect(this.sfxBus);
    return g;
  }

  env(g, t, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  }

  osc(type, f, t, dur, dest, vol = 0.3, a = 0.005, slideTo = null) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    this.env(g, t, a, vol, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return o;
  }
  noiseBurst(t, dur, dest, vol, ftype, freq, q = 1, freqTo = null) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.005, vol, dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
  }

  // ------------------------------------------------------------ sfx library
  sfx(name, o = {}) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + 0.005;
    const p = o.pitch || 1;
    const out = this.out(o.pos, o.volume ?? 1, o.rev ?? 0.15);
    if (!out) return;
    switch (name) {
      case 'swing':
        this.noiseBurst(t, 0.18, out, 0.35, 'bandpass', 900 * p, 1.5, 3000 * p);
        break;
      case 'swingHeavy':
        this.noiseBurst(t, 0.35, out, 0.5, 'bandpass', 400 * p, 1.2, 1800 * p);
        this.osc('sine', 90 * p, t, 0.25, out, 0.15);
        break;
      case 'hit':
        this.noiseBurst(t, 0.12, out, 0.6, 'lowpass', 2500 * p, 1);
        this.osc('sine', 160 * p, t, 0.12, out, 0.5, 0.002, 60);
        break;
      case 'hitMetal':
        this.osc('square', 520 * p, t, 0.25, out, 0.12);
        this.osc('sine', 1340 * p, t, 0.4, out, 0.15);
        this.noiseBurst(t, 0.1, out, 0.4, 'highpass', 3000, 1);
        break;
      case 'hitFlesh':
      case 'hurt':
        this.osc('sine', 120, t, 0.18, out, 0.5, 0.002, 50);
        this.noiseBurst(t, 0.1, out, 0.4, 'lowpass', 900, 1);
        break;
      case 'parry': {
        for (const [f, v] of [[1180, 0.25], [1770, 0.18], [2380, 0.12], [3150, 0.08]]) this.osc('sine', f * p, t, 1.4, out, v, 0.001);
        this.noiseBurst(t, 0.06, out, 0.7, 'highpass', 4000, 1);
        break;
      }
      case 'block':
        this.osc('triangle', 300, t, 0.2, out, 0.3, 0.001, 200);
        this.noiseBurst(t, 0.08, out, 0.5, 'bandpass', 2000, 2);
        break;
      case 'guardbreak':
        this.osc('sawtooth', 200, t, 0.5, out, 0.25, 0.001, 70);
        break;
      case 'dodge':
        this.noiseBurst(t, 0.25, out, 0.3, 'bandpass', 600, 1, 1600);
        break;
      case 'jump':
        this.noiseBurst(t, 0.12, out, 0.15, 'lowpass', 800, 1);
        break;
      case 'land':
        this.osc('sine', 80, t, 0.2, out, 0.5, 0.002, 40);
        this.noiseBurst(t, 0.2, out, 0.35, 'lowpass', 600, 1);
        break;
      case 'glide':
        this.noiseBurst(t, 0.5, out, 0.25, 'bandpass', 300, 0.8, 1200);
        this.osc('sine', 660, t, 0.3, out, 0.08);
        break;
      case 'grab':
        this.noiseBurst(t, 0.06, out, 0.3, 'bandpass', 1500, 2);
        break;
      case 'splash':
        this.noiseBurst(t, 0.6, out, 0.5, 'lowpass', 2000, 0.7, 300);
        break;
      case 'slam':
      case 'explosion':
        this.osc('sine', 70, t, 0.8, out, 0.9, 0.002, 30);
        this.noiseBurst(t, 0.9, out, 0.7, 'lowpass', 1800, 0.7, 120);
        break;
      case 'fireCast':
        this.noiseBurst(t, 0.4, out, 0.4, 'bandpass', 500, 0.8, 2500);
        this.osc('sawtooth', 110, t, 0.3, out, 0.08, 0.01, 220);
        break;
      case 'fireHit':
        this.noiseBurst(t, 0.6, out, 0.5, 'lowpass', 1200, 0.7, 200);
        break;
      case 'frostCast':
        for (const f of [1568, 2093, 2637]) this.osc('sine', f * p, t + Math.random() * 0.05, 0.5, out, 0.07);
        this.noiseBurst(t, 0.2, out, 0.15, 'highpass', 5000, 1);
        break;
      case 'freeze':
        for (const f of [1046, 1318, 1568, 2093]) this.osc('triangle', f, t + Math.random() * 0.1, 0.8, out, 0.06);
        break;
      case 'thunder':
        this.noiseBurst(t, 0.15, out, 0.8, 'highpass', 2000, 1);
        this.noiseBurst(t + 0.05, 0.8, out, 0.5, 'lowpass', 800, 0.8, 80);
        break;
      case 'thunderBig':
        this.noiseBurst(t, 0.2, out, 1, 'highpass', 1500, 1);
        this.noiseBurst(t + 0.05, 2.2, out, 0.9, 'lowpass', 600, 0.6, 40);
        this.osc('sine', 50, t, 1.5, out, 0.6, 0.01, 30);
        break;
      case 'chrono':
      case 'stasis':
        this.osc('sine', 880 * p, t, 1.2, out, 0.12, 0.01, 220);
        this.osc('sine', 660 * p, t + 0.1, 1.2, out, 0.1, 0.01, 1320);
        break;
      case 'weave':
        for (let i = 0; i < 5; i++) this.osc('sine', NOTE(74 + i * 4), t + i * 0.05, 0.6, out, 0.07);
        break;
      case 'charge':
        this.osc('sawtooth', 110, t, 0.6, out, 0.05, 0.3, 440);
        break;
      case 'meteor':
        this.noiseBurst(t, 1.0, out, 0.5, 'bandpass', 3000, 1, 200);
        break;
      case 'nova':
        this.noiseBurst(t, 0.8, out, 0.4, 'highpass', 3000, 1, 8000);
        for (const f of [1318, 1760, 2349]) this.osc('sine', f, t, 1.0, out, 0.08);
        break;
      case 'epochShift': {
        this.noiseBurst(t, 2.5, out, 0.4, 'bandpass', 200, 0.5, 6000);
        this.osc('sine', 40, t, 2.5, out, 0.6, 0.5, 30);
        for (let i = 0; i < 6; i++) this.osc('sine', NOTE(62 + [0, 7, 12, 16, 19, 24][i]), t + 0.3 + i * 0.12, 2.2, out, 0.08);
        break;
      }
      case 'glint':
        this.osc('sine', 2637, t, 0.25, out, 0.12, 0.001);
        this.osc('sine', 3520, t + 0.03, 0.2, out, 0.08, 0.001);
        break;
      case 'danger':
        this.osc('sawtooth', 220, t, 0.35, out, 0.12, 0.002, 110);
        this.osc('square', 233, t, 0.35, out, 0.06, 0.002, 116);
        break;
      case 'reaction':
        for (const f of [523, 784, 1046]) this.osc('triangle', f, t, 0.5, out, 0.1, 0.002);
        break;
      case 'posture':
      case 'bossStagger':
        this.osc('sine', 330, t, 0.6, out, 0.2, 0.002, 165);
        this.noiseBurst(t, 0.3, out, 0.4, 'bandpass', 1200, 2);
        break;
      case 'timeslip':
        this.osc('sine', 1760, t, 1.5, out, 0.1, 0.002, 440);
        this.noiseBurst(t, 1.2, out, 0.2, 'bandpass', 4000, 3, 300);
        break;
      case 'alert':
        this.osc('sawtooth', 160, t, 0.3, out, 0.12, 0.01, 120);
        break;
      case 'growl':
        this.osc('sawtooth', 90, t, 0.5, out, 0.15, 0.05, 70);
        this.noiseBurst(t, 0.5, out, 0.2, 'lowpass', 400, 2);
        break;
      case 'bite':
        this.noiseBurst(t, 0.1, out, 0.4, 'bandpass', 1200, 2);
        break;
      case 'wispAlert':
        this.osc('sine', 1200, t, 0.5, out, 0.1, 0.01, 600);
        break;
      case 'blink':
        this.osc('sine', 300, t, 0.3, out, 0.15, 0.002, 1500);
        break;
      case 'enemyDie':
      case 'yip':
        // a small fox bark: two bright chirps
        for (let i = 0; i < 2; i++) {
          this.osc('triangle', 820 * p, t + i * 0.16, 0.09, out, 0.12, 0.005, 1350 * p);
          this.osc('sine', 1650 * p, t + i * 0.16, 0.06, out, 0.04, 0.005, 2100 * p);
        }
        break;
      case 'whimper':
        this.osc('sine', 300, t, 0.6, out, 0.15, 0.01, 100);
        for (let i = 0; i < 4; i++) this.osc('sine', NOTE(84 + i * 3), t + 0.2 + i * 0.06, 0.4, out, 0.04);
        break;
      case 'roar':
        this.osc('sawtooth', 70, t, 1.6, out, 0.35, 0.1, 45);
        this.noiseBurst(t, 1.6, out, 0.5, 'bandpass', 300, 1.5, 150);
        break;
      case 'bossCast':
        this.osc('sawtooth', 55, t, 1.0, out, 0.2, 0.3, 110);
        break;
      case 'bossWindup':
        this.noiseBurst(t, 0.6, out, 0.2, 'bandpass', 300, 1, 900);
        break;
      case 'bossDie':
        this.osc('sawtooth', 60, t, 3, out, 0.3, 0.1, 30);
        for (let i = 0; i < 8; i++) this.osc('sine', NOTE(72 + i * 2), t + 0.5 + i * 0.12, 1.4, out, 0.05);
        break;
      case 'spear':
        this.noiseBurst(t, 0.15, out, 0.5, 'highpass', 2500, 1);
        this.osc('square', 600, t, 0.1, out, 0.06);
        break;
      case 'pickup':
        this.osc('sine', NOTE(84) * p, t, 0.12, out, 0.12);
        this.osc('sine', NOTE(91) * p, t + 0.06, 0.18, out, 0.1);
        break;
      case 'mote':
      case 'keyItem':
        for (let i = 0; i < 5; i++) this.osc('sine', NOTE(79 + [0, 4, 7, 12, 16][i]), t + i * 0.07, 0.6, out, 0.09);
        break;
      case 'chest':
        this.noiseBurst(t, 0.3, out, 0.2, 'lowpass', 600, 2);
        for (let i = 0; i < 4; i++) this.osc('triangle', NOTE(72 + [0, 4, 7, 12][i]), t + 0.25 + i * 0.09, 0.7, out, 0.1);
        break;
      case 'discover':
        for (let i = 0; i < 4; i++) this.osc('sine', NOTE(67 + [0, 7, 12, 14][i]), t + i * 0.18, 1.6, out, 0.09, 0.05);
        break;
      case 'levelup':
      case 'unlock':
      case 'attune':
      case 'questDone':
        for (let i = 0; i < 6; i++) this.osc('triangle', NOTE(72 + [0, 4, 7, 12, 16, 19][i]), t + i * 0.08, 1.0, out, 0.09);
        this.osc('sine', NOTE(48), t, 1.6, out, 0.15, 0.05);
        break;
      case 'questStart':
      case 'questStep':
        this.osc('sine', NOTE(76), t, 0.5, out, 0.1);
        this.osc('sine', NOTE(83), t + 0.12, 0.7, out, 0.1);
        break;
      case 'chop':
        this.noiseBurst(t, 0.1, out, 0.5, 'bandpass', 700, 2);
        this.osc('triangle', 180, t, 0.1, out, 0.3, 0.001, 120);
        break;
      case 'mine':
        this.osc('square', 900, t, 0.08, out, 0.08);
        this.noiseBurst(t, 0.1, out, 0.5, 'highpass', 2000, 1);
        break;
      case 'rockBreak':
        this.noiseBurst(t, 0.6, out, 0.6, 'lowpass', 900, 0.8, 100);
        break;
      case 'crystalHit':
        for (const f of [1760, 2217, 2637]) this.osc('sine', f, t, 0.6, out, 0.08, 0.001);
        break;
      case 'treeCreak':
        this.osc('sawtooth', 70, t, 1.0, out, 0.08, 0.2, 55);
        break;
      case 'treeFall':
        this.osc('sine', 55, t, 0.9, out, 0.7, 0.002, 30);
        this.noiseBurst(t, 1.0, out, 0.6, 'lowpass', 700, 0.7, 100);
        break;
      case 'drink':
        for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.15, 0.08, out, 0.2, 'bandpass', 600 + i * 100, 4);
        this.osc('sine', NOTE(79), t + 0.5, 0.6, out, 0.08);
        break;
      case 'rest':
        for (let i = 0; i < 4; i++) this.osc('sine', NOTE(60 + [0, 7, 12, 16][i]), t + i * 0.25, 2.5, out, 0.07, 0.2);
        break;
      case 'select':
        this.osc('sine', 1046, t, 0.06, out, 0.06);
        break;
      case 'menuOpen':
        this.osc('sine', 660, t, 0.12, out, 0.06);
        this.osc('sine', 990, t + 0.05, 0.12, out, 0.05);
        break;
      case 'menuClose':
        this.osc('sine', 990, t, 0.1, out, 0.05);
        this.osc('sine', 660, t + 0.05, 0.1, out, 0.05);
        break;
      case 'dlgOpen':
        this.osc('sine', 784, t, 0.3, out, 0.05);
        break;
      case 'blip':
        this.osc('triangle', 520 * p + Math.random() * 60, t, 0.03, out, 0.025);
        break;
      case 'fizzle':
        this.noiseBurst(t, 0.2, out, 0.2, 'highpass', 3000, 1, 800);
        break;
      case 'stance':
        this.osc('triangle', 440, t, 0.15, out, 0.08);
        this.osc('triangle', 330, t + 0.08, 0.2, out, 0.08);
        break;
      case 'lock':
        this.osc('sine', 1200, t, 0.06, out, 0.05);
        break;
      case 'ignite':
        this.noiseBurst(t, 0.5, out, 0.4, 'bandpass', 800, 0.8, 2500);
        break;
      case 'plant':
        for (let i = 0; i < 3; i++) this.osc('sine', NOTE(72 + i * 5), t + i * 0.1, 0.8, out, 0.07);
        break;
      case 'craft':
        this.osc('square', 880, t, 0.06, out, 0.05);
        this.osc('square', 660, t + 0.12, 0.06, out, 0.05);
        for (let i = 0; i < 3; i++) this.osc('triangle', NOTE(76 + i * 4), t + 0.25 + i * 0.08, 0.5, out, 0.07);
        break;
      case 'place':
        this.osc('sine', 140, t, 0.1, out, 0.4, 0.002, 90);
        this.noiseBurst(t, 0.06, out, 0.3, 'lowpass', 1500, 1);
        break;
      case 'bounce':
        this.osc('sine', 200, t, 0.4, out, 0.3, 0.005, 800);
        break;
      case 'death':
        this.osc('sine', 220, t, 2.0, out, 0.2, 0.05, 55);
        for (let i = 0; i < 4; i++) this.osc('sine', NOTE(64 - i * 3), t + i * 0.3, 1.5, out, 0.06);
        break;
      case 'levelPick':
        this.osc('triangle', NOTE(88), t, 0.3, out, 0.1);
        break;
      default:
        this.osc('sine', 660, t, 0.1, out, 0.05);
    }
  }

  footstep(surface, intensity, pos) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.out(pos, 0.25 + intensity * 0.35, 0.05);
    if (!out) return;
    const f = { grass: [900, 0.5], dirt: [700, 1], stone: [2400, 2], wood: [500, 3], snow: [1500, 0.5], water: [1200, 0.6] }[surface] || [900, 1];
    this.noiseBurst(t, surface === 'water' ? 0.15 : 0.07, out, 0.5, surface === 'stone' ? 'bandpass' : 'lowpass', f[0] * (0.85 + Math.random() * 0.3), f[1]);
    if (surface === 'wood') this.osc('sine', 140, t, 0.06, out, 0.2);
  }

  // ------------------------------------------------------------ ambience
  buildAmbience() {
    const c = this.ctx;
    const mk = (type, freq, q) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      s.connect(f);
      f.connect(g);
      g.connect(this.amb);
      s.start();
      return { f, g };
    };
    this.wind = mk('bandpass', 400, 0.6);
    this.rain = mk('highpass', 1800, 0.5);
    this.rumble = mk('lowpass', 120, 0.8);
    this.water = mk('bandpass', 700, 0.4);
    this.chirpT = 0;
    this.cricketT = 0;
  }

  updateAmbience(dt) {
    const P = G.player;
    if (!P) return;
    const t = this.ctx.currentTime;
    const ep = G.game?.inPocket ? 3 : G.epochs?.current ?? 0;
    const night = G.atmo?.state.night || 0;
    const w = G.weather?.state || { rain: 0, wind: 0, storm: 0 };
    const alt = Math.max(0, P.pos.y - 20) / 150;
    const speed = Math.hypot(P.vel.x, P.vel.y, P.vel.z);
    const windAmt = Math.min(0.9, 0.08 + alt * 0.4 + (P.mode === 'glide' ? 0.3 + speed * 0.02 : 0) + w.storm * 0.3 + (ep === 1 ? 0.1 : 0));
    this.wind.g.gain.setTargetAtTime(G.state === 'play' ? windAmt : 0.1, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(300 + Math.sin(G.time * 0.3) * 120 + windAmt * 400, t, 0.8);
    this.rain.g.gain.setTargetAtTime(w.rain * 0.35, t, 1);
    this.rumble.g.gain.setTargetAtTime(ep === 1 ? 0.35 : 0, t, 1);
    const wl = G.water ? G.water.level : -99;
    const nearWater = G.terrain && wl - G.terrain.heightAt(P.pos.x + 8, P.pos.z) > 0.5 ? 0.15 : 0;
    this.water.g.gain.setTargetAtTime(nearWater, t, 1);
    if (G.state !== 'play') return;
    // birds by day in Bloom, crickets at night, chimes in Stars
    this.chirpT -= dt;
    if (this.chirpT <= 0) {
      this.chirpT = 0.8 + Math.random() * 3;
      const out = this.amb;
      if (ep === 0 && night < 0.5 && w.rain < 0.3) {
        const base = 2000 + Math.random() * 2000;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.osc('sine', base * (1 + Math.random() * 0.2), t + i * 0.09, 0.07, out, 0.025, 0.005, base * 1.3);
      } else if (ep === 2) {
        this.osc('sine', NOTE(84 + [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)]), t, 2.5, out, 0.025, 0.05);
      } else if (ep === 1 && Math.random() < 0.3) {
        this.noiseBurst(t, 0.3, out, 0.08, 'bandpass', 300, 2);
      } else if (ep === 1 && Math.random() < 0.18) {
        // a far-off crow over the ash plains
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) this.osc('sawtooth', 560 + Math.random() * 60, t + i * 0.34, 0.2, out, 0.012, 0.01, 380);
      } else if (ep === 0 && night > 0.6 && Math.random() < 0.12) {
        // an owl, two soft hoots
        this.osc('sine', 390, t, 0.32, out, 0.03, 0.04, 350);
        this.osc('sine', 380, t + 0.5, 0.55, out, 0.03, 0.05, 330);
      }
    }
    if (night > 0.5 && ep !== 1) {
      this.cricketT -= dt;
      if (this.cricketT <= 0) {
        this.cricketT = 0.4 + Math.random() * 0.8;
        for (let i = 0; i < 3; i++) this.osc('square', 4200 + Math.random() * 300, t + i * 0.05, 0.02, this.amb, 0.008);
      }
    }
  }

  // ------------------------------------------------------------ music
  setMusic(m) {
    this.musicOverride = m;
  }
  setEpoch() {}
  setRegion(r) {
    this.region = r;
  }

  currentMood() {
    if (this.musicOverride === 'boss') return 'boss';
    if (this.musicOverride === 'victory' || this.musicOverride === 'ending') return 'ending';
    if (G.state === 'title') return 'title';
    if (G.game?.inPocket) return 'rift';
    return ['bloom', 'ash', 'stars'][G.epochs?.current ?? 0];
  }

  scheduleMusic() {
    const c = this.ctx;
    const mood = this.currentMood();
    const key = mood === 'boss' ? ['bloom', 'ash', 'stars'][G.epochs.current] : mood;
    const sc = SCALES[key] || SCALES.bloom;
    const boss = mood === 'boss';
    const tempo = boss ? 112 : mood === 'rift' ? sc.tempo : sc.tempo + this.intensity * 30;
    const beatDur = 60 / tempo / 2; // eighth notes
    while (this.nextTime < c.currentTime + 0.25) {
      const t = this.nextTime;
      const step = this.beat % 64;
      const bar = Math.floor(step / 8) % 4;
      const chord = sc.prog[bar];
      const root = sc.root;
      const I = boss ? 1 : this.intensity;
      // pads on bar starts
      if (step % 8 === 0) {
        for (const n of chord) this.pad(NOTE(root + n - 12), t, beatDur * 8.2, key === 'ash' ? 0.035 : 0.045, key);
        this.osc('sine', NOTE(root + chord[0] - 24), t, beatDur * 7, this.music, 0.12 + I * 0.08, 0.05);
      }
      // melody: plucks/bells on a gentle random walk
      const mProb = mood === 'rift' ? 0.7 : 0.18 + I * 0.25;
      if (step % 2 === 0 && Math.random() < mProb) {
        const m = this.melody;
        m.deg = Math.max(-3, Math.min(10, m.deg + [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(Math.random() * 8)]));
        const s = sc.scale;
        const oct = Math.floor(m.deg / s.length);
        const n = root + 12 + s[((m.deg % s.length) + s.length) % s.length] + oct * 12;
        if (key === 'stars' || key === 'title') this.bell(NOTE(n), t, 0.06);
        else this.pluck(NOTE(n), t, key === 'ash' ? 0.05 : 0.07, key);
      }
      // rift arps
      if (mood === 'rift') {
        const n = root + chord[step % 3] + (step % 6 < 3 ? 0 : 12);
        this.osc('sawtooth', NOTE(n), t, beatDur * 0.8, this.music, 0.03, 0.003);
        if (step % 4 === 0) this.kick(t, 0.5);
        if (step % 8 === 4) this.snare(t, 0.2);
        this.hat(t, 0.04);
      }
      // combat percussion
      if (I > 0.05 && mood !== 'rift') {
        if (step % 4 === 0) this.taiko(t, 0.35 * I + (boss ? 0.2 : 0));
        if (step % 8 === 6 || (boss && step % 8 === 3)) this.taiko(t, 0.2 * I, 1.4);
        if (step % 2 === 1) this.hat(t, 0.025 * I);
        if (step % 2 === 0) this.osc('triangle', NOTE(root + chord[0] - 12 + (step % 8 === 4 ? 7 : 0)), t, beatDur * 0.9, this.music, 0.08 * I, 0.005);
        if (boss && step % 16 === 0) for (const n of chord) this.choir(NOTE(root + n), t, beatDur * 16);
      }
      this.nextTime += beatDur;
      this.beat++;
    }
  }

  pad(f, t, dur, vol, key) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = key === 'ash' ? 500 : 1200;
    for (const d of [-7, 7]) {
      const o = c.createOscillator();
      o.type = key === 'stars' ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    flt.connect(g);
    g.connect(this.music);
    const s = c.createGain();
    s.gain.value = 0.6;
    g.connect(s);
    s.connect(this.revSend);
  }
  pluck(f, t, vol, key) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = key === 'ash' ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(f * 6, t);
    flt.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.4);
    const g = c.createGain();
    this.env(g, t, 0.003, vol, 0.9);
    o.connect(flt);
    flt.connect(g);
    g.connect(this.music);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 1.2);
  }
  bell(f, t, vol) {
    const c = this.ctx;
    const car = c.createOscillator();
    const mod = c.createOscillator();
    const mg = c.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 1.5);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = c.createGain();
    this.env(g, t, 0.002, vol, 2.5);
    car.connect(g);
    g.connect(this.music);
    g.connect(this.delay);
    const s = c.createGain();
    s.gain.value = 0.8;
    g.connect(s);
    s.connect(this.revSend);
    car.start(t);
    mod.start(t);
    car.stop(t + 2.8);
    mod.stop(t + 2.8);
  }
  taiko(t, vol, pitch = 1) {
    this.osc('sine', 110 * pitch, t, 0.5, this.music, vol, 0.002, 45 * pitch);
    this.noiseBurst(t, 0.08, this.music, vol * 0.5, 'lowpass', 400, 1);
  }
  kick(t, vol) {
    this.osc('sine', 150, t, 0.3, this.music, vol, 0.001, 40);
  }
  snare(t, vol) {
    this.noiseBurst(t, 0.15, this.music, vol, 'bandpass', 1800, 0.8);
  }
  hat(t, vol) {
    this.noiseBurst(t, 0.04, this.music, vol, 'highpass', 7000, 1);
  }
  choir(f, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    let last = o;
    for (const ff of [700, 1150]) {
      const b = c.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.value = ff;
      b.Q.value = 6;
      last.connect(b);
      last = b;
    }
    last.connect(g);
    g.connect(this.music);
    g.connect(this.revSend);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  update(dt) {
    if (!this.ready) return;
    // combat intensity from alerted enemies near the player
    let target = 0;
    if (G.enemies && G.player) {
      for (const e of G.enemies) if (!e.dead && e.state !== 'idle' && e.state !== 'return' && e.distTo(G.player.pos) < 40) { target = 1; break; }
    }
    this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 1.5 : 0.3));
    this.scheduleMusic();
    this.updateAmbience(dt);
  }
}
