import * as THREE from '../../vendor/three/three.module.js';
import { WEATHER, CAMERA } from '../config.js';

const CLEAR_SKY = new THREE.Color(0x9fc3e0);
const STORM_SKY = new THREE.Color(0x3a4048);
const CLEAR_FOG_NEAR = 140;
const STORM_FOG_NEAR = 45;

function randRange([min, max]) { return THREE.MathUtils.lerp(min, max, Math.random()); }

// Cycles CLEAR <-> RAIN on a timer, lerping sky/fog/light, driving a falling
// rain-drop point cloud around the camera, and exposing `traction` so vehicle
// physics can make wet roads slicker. Thunder pairs a light flicker with a
// synthesized clap via AudioManager.
export class WeatherSystem {
  constructor(scene, sun, audio) {
    this.scene = scene;
    this.sun = sun;
    this.audio = audio;
    this.raining = false;
    this.transition = 0; // 0 = fully clear, 1 = fully storm
    this._phaseTimer = randRange(WEATHER.clearDuration);
    this.traction = 1;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(WEATHER.rainDropCount * 3);
    for (let i = 0; i < WEATHER.rainDropCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaad4ff, size: 0.12, transparent: true, opacity: 0 });
    this.rain = new THREE.Points(geo, mat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);
  }

  update(dt, anchorPos) {
    this._phaseTimer -= dt;
    if (this._phaseTimer <= 0) {
      this.raining = !this.raining;
      this._phaseTimer = randRange(this.raining ? WEATHER.rainDuration : WEATHER.clearDuration);
    }

    const target = this.raining ? 1 : 0;
    this.transition = THREE.MathUtils.lerp(this.transition, target, Math.min(1, dt / WEATHER.transitionTime));
    this.traction = THREE.MathUtils.lerp(1, WEATHER.wetTraction, this.transition);

    this.scene.background.copy(CLEAR_SKY).lerp(STORM_SKY, this.transition);
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.near = THREE.MathUtils.lerp(CLEAR_FOG_NEAR, STORM_FOG_NEAR, this.transition);
    this.scene.fog.far = THREE.MathUtils.lerp(CAMERA.far * 0.9, CAMERA.far * 0.5, this.transition);
    this.sun.intensity = THREE.MathUtils.lerp(1.1, 0.35, this.transition);

    this.rain.material.opacity = this.transition * 0.7;
    if (this.transition > 0.02) {
      this.rain.position.set(anchorPos.x, 0, anchorPos.z);
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - WEATHER.rainFallSpeed * dt;
        if (y < 0) y = 40;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    if (this.raining && Math.random() < WEATHER.thunderChance * dt * 10) {
      this._thunder(anchorPos);
    }
  }

  _thunder(pos) {
    const original = this.sun.intensity;
    this.sun.intensity = 2.2;
    setTimeout(() => { this.sun.intensity = original; }, 90);
    if (this.audio) this.audio.playExplosion(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 60, 30, pos.z + (Math.random() - 0.5) * 60));
  }

  get isWet() { return this.transition > 0.35; }
}
