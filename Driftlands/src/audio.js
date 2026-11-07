// Procedural Web Audio: sfx, wind bed, and a gentle generative score.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.windTarget = 0.1;
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
    // shared noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // wind bed
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.7;
    this.windGain = c.createGain(); this.windGain.gain.value = 0.0;
    n.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);
    n.start();
    // simple reverb-ish delay for music
    this.delay = c.createDelay(1.0); this.delay.delayTime.value = 0.45;
    const fb = c.createGain(); fb.gain.value = 0.38;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(this.musicBus);
    this.nextNote = c.currentTime + 1;
    this.chordIdx = 0;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }
  update(dt, windAmount, storm) {
    if (!this.ctx) return;
    const c = this.ctx;
    const g = Math.min(0.5, 0.04 + windAmount * 0.35);
    this.windGain.gain.setTargetAtTime(g, c.currentTime, 0.3);
    this.windFilter.frequency.setTargetAtTime(350 + windAmount * 900, c.currentTime, 0.4);
    // generative music: pentatonic arps over slow chord changes
    if (c.currentTime > this.nextNote - 0.1) {
      const scales = storm
        ? [[0, 3, 5, 7, 10], [-2, 1, 5, 8, 10]]
        : [[0, 2, 4, 7, 9], [-3, 0, 4, 7, 9], [-5, -1, 2, 5, 9], [-4, 0, 3, 7, 10]];
      if (Math.random() < 0.12) this.chordIdx = (this.chordIdx + 1) % scales.length;
      const sc = scales[this.chordIdx % scales.length];
      const base = storm ? 55 : 62;
      const semi = sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0);
      this.pluck(440 * Math.pow(2, (base + semi - 69) / 12), this.nextNote, storm ? 0.5 : 0.35);
      if (Math.random() < 0.18) this.pad(440 * Math.pow(2, (base - 12 + sc[0] - 69) / 12), this.nextNote, 4);
      this.nextNote += [0.45, 0.9, 0.9, 1.35, 1.8][Math.floor(Math.random() * 5)];
    }
  }
  pluck(freq, t, vol) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o.stop(t + 1.7);
  }
  pad(freq, t, dur) {
    const c = this.ctx;
    for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f); f.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  noise(t, dur, vol, type, f0, f1, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(t, dur, vol, type, f0, f1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, vol = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'bow': this.tone(t, 0.18, 0.25 * vol, 'triangle', 220, 90); this.noise(t, 0.12, 0.2 * vol, 'highpass', 3000, 1500); break;
      case 'draw': this.noise(t, 0.3, 0.05 * vol, 'bandpass', 600, 1400, 3); break;
      case 'hit': this.tone(t, 0.12, 0.3 * vol, 'square', 300, 80); this.noise(t, 0.08, 0.2 * vol, 'lowpass', 2000, 400); break;
      case 'thud': this.noise(t, 0.15, 0.25 * vol, 'lowpass', 800, 100); break;
      case 'explode': this.noise(t, 1.2, 0.9 * vol, 'lowpass', 1800, 40); this.tone(t, 0.6, 0.5 * vol, 'sine', 120, 30); break;
      case 'thunder': this.noise(t, 2.5, 0.8 * vol, 'lowpass', 900, 30); this.noise(t + 0.1, 0.4, 0.4 * vol, 'highpass', 4000, 800); break;
      case 'pickup': this.tone(t, 0.12, 0.18 * vol, 'sine', 880, 1320); this.tone(t + 0.07, 0.18, 0.15 * vol, 'sine', 1320, 1760); break;
      case 'chest': [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.08, 0.35, 0.16 * vol, 'triangle', f, f)); break;
      case 'rescue': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.11, 0.6, 0.15 * vol, 'sine', f, f * 1.01)); break;
      case 'upgrade': [262, 392, 523, 784].forEach((f, i) => this.tone(t + i * 0.06, 0.5, 0.15 * vol, 'square', f, f)); break;
      case 'grapple': this.tone(t, 0.25, 0.2 * vol, 'sawtooth', 900, 200); this.noise(t, 0.2, 0.15 * vol, 'highpass', 5000, 2000); break;
      case 'jump': this.noise(t, 0.15, 0.12 * vol, 'bandpass', 500, 1500, 2); break;
      case 'glide': this.noise(t, 0.4, 0.15 * vol, 'bandpass', 300, 1200, 1.5); break;
      case 'hurt': this.tone(t, 0.25, 0.3 * vol, 'sawtooth', 200, 60); break;
      case 'shock': this.noise(t, 0.3, 0.35 * vol, 'highpass', 6000, 2000, 2); this.tone(t, 0.2, 0.12 * vol, 'square', 1800, 600); break;
      case 'fire': this.noise(t, 0.5, 0.25 * vol, 'bandpass', 400, 900, 0.8); break;
      case 'zap': this.tone(t, 0.3, 0.15 * vol, 'sawtooth', 600, 1800); break;
      case 'click': this.tone(t, 0.05, 0.1 * vol, 'square', 1200, 900); break;
      case 'error': this.tone(t, 0.2, 0.15 * vol, 'square', 180, 140); break;
      case 'warn': [600, 450].forEach((f, i) => this.tone(t + i * 0.15, 0.14, 0.12 * vol, 'square', f, f)); break;
      case 'rumble': this.noise(t, 2.0, 0.5 * vol, 'lowpass', 200, 40); break;
      case 'portal': this.tone(t, 1.5, 0.3 * vol, 'sine', 80, 600); this.noise(t, 1.5, 0.3 * vol, 'bandpass', 200, 3000, 2); break;
    }
  }
}
