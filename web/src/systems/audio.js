import * as THREE from '../../vendor/three/three.module.js';

// All sound effects here are synthesized at runtime with the Web Audio API
// (noise bursts, filtered oscillators) rather than loaded from files, so the
// game needs no external audio assets. Engine/tire/gunshot/explosion sounds
// are spatialized via THREE.PositionalAudio; the in-car radio is 2D.
export class AudioManager {
  constructor(camera, scene) {
    this.listener = new THREE.AudioListener();
    this.scene = scene;
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = {
      gunshot_pistol: this._noiseBurst(0.12, 1800, 0.9),
      gunshot_rifle: this._noiseBurst(0.1, 2400, 1.0),
      gunshot_shotgun: this._noiseBurst(0.18, 900, 1.0),
      explosion: this._noiseBurst(1.1, 220, 1.0, true),
      engine: this._loopNoise(0.5, 90),
      tireScreech: this._loopNoise(0.4, 3200, true),
    };
    this.radioStations = [
      { name: 'SYNTHWAVE FM', buffer: this._synthwaveLoop() },
      { name: 'DOWNTOWN HIP-HOP', buffer: this._hiphopLoop() },
      { name: 'ROCK 105', buffer: this._rockLoop() },
      { name: 'TALK RADIO', buffer: this._talkRadioLoop() },
    ];
    this._loopSounds = [];
    this.radioIndex = -1;
    this.radioSound = new THREE.Audio(this.listener);
  }

  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

  _bufferFromSamples(samples, sr = this.ctxSampleRate()) {
    const buf = this.ctx.createBuffer(1, samples.length, sr);
    buf.copyToChannel(samples, 0);
    return buf;
  }
  ctxSampleRate() { return this.ctx.sampleRate; }

  _noiseBurst(duration, lowpassHz, decayPow, rumble = false) {
    const sr = this.ctxSampleRate();
    const n = Math.floor(duration * sr);
    const samples = new Float32Array(n);
    let last = 0;
    const rc = 1 / (2 * Math.PI * lowpassHz);
    const alpha = (1 / sr) / (rc + 1 / sr);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const raw = (Math.random() * 2 - 1) * Math.pow(1 - t, decayPow);
      last = last + alpha * (raw - last);
      samples[i] = rumble ? last * (1 + 0.4 * Math.sin(t * 40)) : last;
    }
    return this._bufferFromSamples(samples, sr);
  }

  _loopNoise(duration, lowpassHz, bandy = false) {
    const sr = this.ctxSampleRate();
    const n = Math.floor(duration * sr);
    const samples = new Float32Array(n);
    let last = 0;
    const rc = 1 / (2 * Math.PI * lowpassHz);
    const alpha = (1 / sr) / (rc + 1 / sr);
    for (let i = 0; i < n; i++) {
      const raw = (Math.random() * 2 - 1);
      last = last + alpha * (raw - last);
      samples[i] = bandy ? last * 1.4 : last;
    }
    return this._bufferFromSamples(samples, sr);
  }

  // Four station "genres", each a self-looping synthesized texture — there
  // are no audio files anywhere in this game, everything is generated here.
  _synthwaveLoop() {
    const sr = this.ctxSampleRate();
    const duration = 4;
    const n = Math.floor(duration * sr);
    const samples = new Float32Array(n);
    const chord = [220, 277, 330, 440];
    const stepLen = duration / 16;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const step = Math.floor(t / stepLen) % chord.length;
      const f = chord[step];
      let v = Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 1.003 * t) * 0.3;
      v += Math.sin(2 * Math.PI * (f / 2) * t) * 0.25; // sub bass
      const gate = 0.5 + 0.5 * Math.sin(Math.PI * ((t % stepLen) / stepLen));
      samples[i] = v * gate * 0.5;
    }
    return this._bufferFromSamples(samples, sr);
  }

  _hiphopLoop() {
    const sr = this.ctxSampleRate();
    const duration = 4;
    const n = Math.floor(duration * sr);
    const samples = new Float32Array(n);
    const beatLen = duration / 8;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const beatT = t % beatLen;
      const kick = Math.sin(2 * Math.PI * 55 * beatT) * Math.exp(-beatT * 18);
      const hatPhase = t % (beatLen / 2);
      const hat = (Math.random() * 2 - 1) * Math.exp(-hatPhase * 60) * 0.15;
      samples[i] = kick * 0.8 + hat;
    }
    return this._bufferFromSamples(samples, sr);
  }

  _rockLoop() {
    const sr = this.ctxSampleRate();
    const duration = 4;
    const n = Math.floor(duration * sr);
    const samples = new Float32Array(n);
    const root = 110, fifth = root * 1.5;
    const noteLen = duration / 16;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const saw = (f) => 2 * ((f * t) % 1) - 1;
      let v = (saw(root) + saw(root * 2) * 0.5 + saw(fifth)) * 0.35;
      v += (Math.random() * 2 - 1) * 0.08; // grit
      v = Math.tanh(v * 2.2); // soft-clip distortion
      const gateT = t % noteLen;
      const gate = gateT < noteLen * 0.85 ? 1 : 0.2;
      samples[i] = v * gate * 0.4;
    }
    return this._bufferFromSamples(samples, sr);
  }

  _talkRadioLoop() {
    const sr = this.ctxSampleRate();
    const duration = 5;
    const n = Math.floor(duration * sr);
    const samples = new Float32Array(n);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const cutoff = 500 + 300 * Math.sin(t * 3.1); // shifting formant-ish tone
      const rc = 1 / (2 * Math.PI * cutoff);
      const alpha = (1 / sr) / (rc + 1 / sr);
      const raw = Math.random() * 2 - 1;
      last += alpha * (raw - last);
      const cadence = Math.max(0, Math.sin(t * 2.2)) * Math.max(0, Math.sin(t * 0.7 + 1));
      samples[i] = last * cadence * 1.8;
    }
    return this._bufferFromSamples(samples, sr);
  }

  playGunshot(weaponId, position) {
    this._playOneShot(this.buffers[`gunshot_${weaponId}`] || this.buffers.gunshot_pistol, position, 0.7);
  }

  playExplosion(position) {
    this._playOneShot(this.buffers.explosion, position, 1.0);
  }

  _playOneShot(buffer, position, volume) {
    if (!buffer) return;
    const anchor = new THREE.Object3D();
    anchor.position.copy(position);
    this.scene.add(anchor);
    const sound = new THREE.PositionalAudio(this.listener);
    sound.setBuffer(buffer);
    sound.setRefDistance(8);
    sound.setVolume(volume);
    anchor.add(sound);
    sound.play();
    sound.onEnded = () => { anchor.parent && anchor.parent.remove(anchor); };
  }

  // Persistent looping sound attached to a moving mesh (engine hum, tire screech).
  attachLoop(mesh, bufferKey, { volume = 0.4, refDistance = 10 } = {}) {
    const sound = new THREE.PositionalAudio(this.listener);
    sound.setBuffer(this.buffers[bufferKey]);
    sound.setLoop(true);
    sound.setRefDistance(refDistance);
    sound.setVolume(0);
    mesh.add(sound);
    const handle = { sound, targetVolume: 0, baseVolume: volume, rate: 1 };
    this._loopSounds.push(handle);
    return handle;
  }

  setLoopIntensity(handle, intensity, rate = 1) {
    if (!handle) return;
    handle.targetVolume = handle.baseVolume * THREE.MathUtils.clamp(intensity, 0, 1);
    handle.rate = rate;
  }

  detachLoop(handle) {
    if (!handle) return;
    if (handle.sound.isPlaying) handle.sound.stop();
    handle.sound.parent && handle.sound.parent.remove(handle.sound);
    this._loopSounds = this._loopSounds.filter((h) => h !== handle);
  }

  update(dt) {
    for (const h of this._loopSounds) {
      const vol = THREE.MathUtils.lerp(h.sound.getVolume(), h.targetVolume, Math.min(1, 6 * dt));
      h.sound.setVolume(vol);
      if (vol > 0.001 && !h.sound.isPlaying) h.sound.play();
      if (vol <= 0.001 && h.sound.isPlaying) h.sound.pause();
      if (h.sound.setPlaybackRate) h.sound.setPlaybackRate(h.rate);
    }
  }

  toggleRadio() {
    this.radioIndex = (this.radioIndex + 1) % (this.radioStations.length + 1);
    if (this.radioSound.isPlaying) this.radioSound.stop();
    if (this.radioIndex < this.radioStations.length) {
      const station = this.radioStations[this.radioIndex];
      this.radioSound.setBuffer(station.buffer);
      this.radioSound.setLoop(true);
      this.radioSound.setVolume(0.35);
      this.radioSound.play();
      return station.name;
    }
    return 'OFF';
  }

  stopRadio() {
    if (this.radioSound.isPlaying) this.radioSound.stop();
    this.radioIndex = -1;
  }
}
