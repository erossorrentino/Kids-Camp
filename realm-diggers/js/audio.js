'use strict';
// ============================================================
// Synthesized sound effects + generative music (WebAudio, no files)
// ============================================================

const Sound = {
  ctx: null, master: null, sfx: null, music: null, noiseBuf: null, delay: null,
  musicState: { realm: null, next: 0, idx: 0, beat: 0 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
      this.music = this.ctx.createGain(); this.music.connect(this.master);
      this.delay = this.ctx.createDelay(1); this.delay.delayTime.value = 0.36;
      const fb = this.ctx.createGain(); fb.gain.value = 0.35;
      const df = this.ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2200;
      this.delay.connect(df); df.connect(fb); fb.connect(this.delay); df.connect(this.music);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolume();
    } catch (e) { this.ctx = null; }
  },
  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = Settings.data.volume;
    this.music.gain.value = Settings.data.music ? 0.55 : 0;
  },
  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, freq, q = 1, vol = 0.2, type = 'bandpass', delay = 0, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  material(id) {
    const d = BLOCKS[id]; if (!d) return 'stone';
    if (d.render === R_GLASS) return 'glass';
    if (d.tool === 'axe') return 'wood';
    if (d.tool === 'shovel' || d.soft) return 'soft';
    if (d.render === R_CROSS || d.leaves) return 'plant';
    return 'stone';
  },
  play(name, arg) {
    if (!this.ctx) return;
    switch (name) {
      case 'dig': { const m = this.material(arg); const f = { stone: 1400, wood: 700, soft: 380, plant: 2200, glass: 3000 }[m]; this.noise(0.08, f * (0.85 + Math.random() * 0.3), 1.5, 0.12); break; }
      case 'break': { const m = this.material(arg); const f = { stone: 1100, wood: 600, soft: 320, plant: 1800, glass: 3500 }[m]; this.noise(0.22, f, 1.2, 0.22); if (m === 'glass') { this.tone(2400, 0.15, 'triangle', 0.06); this.tone(3100, 0.12, 'triangle', 0.05, 0, 0.04); } break; }
      case 'place': this.noise(0.08, 500, 1, 0.18); this.tone(180, 0.06, 'sine', 0.08); break;
      case 'step': this.noise(0.05, { stone: 900, wood: 600, soft: 300, plant: 1200, glass: 1500 }[this.material(arg)] || 600, 1, 0.045); break;
      case 'hurt': this.tone(320, 0.18, 'square', 0.1, 0.5); break;
      case 'mobhurt': this.tone(260 * (arg || 1), 0.12, 'sawtooth', 0.07, 0.6); break;
      case 'mobdie': this.tone(300 * (arg || 1), 0.35, 'triangle', 0.1, 0.3); this.noise(0.3, 600, 0.7, 0.08); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.06, 900 + Math.random() * 400, 2, 0.12, 'bandpass', i * 0.11); break;
      case 'pickup': this.tone(880, 0.07, 'sine', 0.08); this.tone(1320, 0.08, 'sine', 0.06, 0, 0.05); break;
      case 'craft': this.tone(523, 0.08, 'triangle', 0.1); this.tone(784, 0.1, 'triangle', 0.09, 0, 0.07); this.noise(0.1, 800, 1, 0.08); break;
      case 'click': this.tone(660, 0.04, 'square', 0.05); break;
      case 'mod': { const notes = [523, 659, 784, 1047, 1319, 1568]; const n = 3 + (arg || 0); for (let i = 0; i < n; i++) this.tone(notes[i % 6] * (i >= 6 ? 2 : 1), 0.25, 'triangle', 0.12, 0, i * 0.08); if (arg >= 3) this.noise(0.8, 6000, 0.5, 0.05, 'highpass', 0.1); break; }
      case 'achieve': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.1, 0, i * 0.09)); break;
      case 'portal': this.noise(1.6, 300, 2, 0.2, 'bandpass', 0, 8); this.tone(200, 1.5, 'sine', 0.12, 4); this.tone(300, 1.5, 'triangle', 0.06, 3, 0.2); break;
      case 'boom': this.noise(1.2, 900, 0.6, 0.6, 'lowpass', 0, 0.1); this.tone(70, 0.8, 'sine', 0.5, 0.4); break;
      case 'fuse': this.noise(0.3, 4000, 1, 0.06, 'highpass'); break;
      case 'rocket': this.noise(3, 400, 0.6, 0.35, 'lowpass', 0, 3); this.tone(90, 3, 'sawtooth', 0.08, 3); break;
      case 'splash': this.noise(0.4, 1200, 0.8, 0.18, 'bandpass', 0, 0.4); break;
      case 'roar': this.tone(110, 0.9, 'sawtooth', 0.25, 0.6); this.noise(0.9, 300, 0.7, 0.3, 'lowpass'); break;
      case 'blink': this.tone(1500, 0.2, 'sine', 0.12, 0.25); this.tone(600, 0.2, 'sine', 0.08, 3, 0.05); break;
      case 'xray': this.tone(400, 0.5, 'sine', 0.08, 3); break;
      case 'shoot': this.tone(700, 0.15, 'square', 0.05, 0.4); break;
      case 'zap': this.tone(1700, 0.09, 'square', 0.035, 0.45); break;
      case 'jump': break;
      case 'chest': this.noise(0.3, 260, 2, 0.14, 'bandpass', 0, 1.8); this.tone(140, 0.2, 'triangle', 0.06, 1.5); break;
      case 'bounce': this.tone(300, 0.2, 'sine', 0.12, 2.5); break;
      case 'death': [440, 370, 311, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, 0, i * 0.18)); break;
      case 'levelup': [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.2, 'square', 0.06, 0, i * 0.07)); break;
      case 'boss': this.tone(80, 2, 'sawtooth', 0.15, 0.5); this.tone(120, 2, 'square', 0.06, 0.5, 0.3); break;
    }
  },
  // generative music: called every frame
  updateMusic(realm) {
    if (!this.ctx || !Settings.data.music || !realm) return;
    const ms = this.musicState, now = this.ctx.currentTime, m = realm.music;
    if (ms.realm !== realm.key) { ms.realm = realm.key; ms.next = now + 1.5; ms.idx = 2; ms.beat = 0; }
    while (ms.next < now + 0.3) {
      const t = ms.next - now;
      if (Math.random() < 0.62) {
        ms.idx = clamp(ms.idx + Math.floor(Math.random() * 5) - 2, 0, m.scale.length * 2 - 1);
        const oct = Math.floor(ms.idx / m.scale.length), semi = m.scale[ms.idx % m.scale.length] + oct * 12;
        const f = 440 * Math.pow(2, (m.root + semi - 69) / 12);
        this.musicNote(f, m.tempo * (Math.random() < 0.3 ? 3 : 1.6), m.wave, 0.045, t);
      }
      if (ms.beat % 8 === 0) {
        const f = 440 * Math.pow(2, (m.root - 12 + m.scale[0] - 69) / 12);
        this.musicNote(f, m.tempo * 6, 'sine', 0.05, t);
        this.musicNote(f * Math.pow(2, m.scale[2 % m.scale.length] / 12), m.tempo * 6, 'sine', 0.025, t);
      }
      if (m.drums && ms.beat % 2 === 0) this.drum(t, ms.beat % 8 === 0);
      ms.beat++;
      ms.next += m.tempo;
    }
  },
  musicNote(f, dur, wave, vol, delay) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
    o.type = wave; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = wave === 'sine' ? 4000 : 1400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.music); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.1);
  },
  drum(delay, big) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(big ? 120 : 180, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.2);
    g.gain.setValueAtTime(big ? 0.12 : 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.3);
  },
};
