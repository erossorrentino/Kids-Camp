import * as THREE from 'three';

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
      this._chordLoop([220, 277, 330]),
      this._chordLoop([196, 246, 294]),
      this._chordLoop([164, 207, 246]),
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

  _chordLoop(freqs) {
    const sr = this.ctxSampleRate();
    const duration = 4;
    const n = Math.floor(duration * sr);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = 0;
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) * 0.2;
      v *= 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t);
      samples[i] = v;
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
      this.radioSound.setBuffer(this.radioStations[this.radioIndex]);
      this.radioSound.setLoop(true);
      this.radioSound.setVolume(0.35);
      this.radioSound.play();
      return `STATION ${this.radioIndex + 1}`;
    }
    return 'OFF';
  }

  stopRadio() {
    if (this.radioSound.isPlaying) this.radioSound.stop();
    this.radioIndex = -1;
  }
}
