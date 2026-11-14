// Race cameras: chase (far/near), hood, bumper and TV trackside, with
// speed-dependent field of view, spring smoothing, drift framing and shake.
import * as THREE from 'three';
import { clamp, lerp, damp } from '../core/rng.js';

export const CAMERA_MODES = ['Chase', 'Near Chase', 'Hood', 'Bumper', 'TV'];

export class RaceCamera {
  constructor(camera, track) {
    this.cam = camera;
    this.track = track;
    this.mode = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.shake = 0;
    this.fov = 60;
    this.initialized = false;
    this.tvSpot = null;
    this.tvTimer = 0;
    this._f = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this.lookBack = false;
  }

  setMode(m) { this.mode = ((m % CAMERA_MODES.length) + CAMERA_MODES.length) % CAMERA_MODES.length; this.initialized = false; }
  next() { this.setMode(this.mode + 1); return CAMERA_MODES[this.mode]; }
  addShake(a) { this.shake = Math.min(1.5, this.shake + a); }

  // target: {x,y,z,heading,vx,vz,speed,pitch,roll, L, H, nitro}
  update(dt, t, opts = {}) {
    const cam = this.cam;
    const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    const speed = t.speed || 0;
    // direction blend: look along velocity a bit when sliding (drift shots)
    let dirX = fx, dirZ = fz;
    if (speed > 6) {
      const vx = t.vx / speed, vz = t.vz / speed;
      dirX = lerp(fx, vx, 0.35); dirZ = lerp(fz, vz, 0.35);
      const l = Math.hypot(dirX, dirZ); dirX /= l; dirZ /= l;
    }
    const mode = opts.forceMode ?? this.mode;
    let fovTarget = 58 + clamp(speed / 90, 0, 1) * 16 + (t.nitro ? 7 : 0);
    let desired = this._t, look = this._f;
    let stiff = 8;
    const back = this.lookBack ? -1 : 1;
    if (mode === 0 || mode === 1) {
      const dist = (mode === 0 ? 6.2 : 4.6) + t.L * 0.35 + clamp(speed / 80, 0, 1) * 0.8;
      const height = (mode === 0 ? 1.9 : 1.45) + t.H * 0.35;
      desired.set(t.x - dirX * dist * back, t.y + height, t.z - dirZ * dist * back);
      look.set(t.x + fx * 4 * back, t.y + 0.9 + t.H * 0.2, t.z + fz * 4 * back);
      stiff = 9;
    } else if (mode === 2) {
      // hood
      desired.set(t.x + fx * 0.2, t.y + t.H * 0.92 + 0.12, t.z + fz * 0.2);
      look.set(t.x + fx * 30 * back, t.y + t.H * 0.75, t.z + fz * 30 * back);
      fovTarget += 6;
      stiff = 200;
    } else if (mode === 3) {
      // bumper
      desired.set(t.x + fx * (t.L * 0.5 + 0.15), t.y + 0.45, t.z + fz * (t.L * 0.5 + 0.15));
      look.set(t.x + fx * 40 * back, t.y + 0.35, t.z + fz * 40 * back);
      fovTarget += 10;
      stiff = 200;
    } else {
      // TV: fixed trackside spots that leapfrog the car
      const tr = this.track;
      const s = t.s ?? 0;
      if (!this.tvSpot || tr.wrapS(s - this.tvSpot.s) > 140 && tr.wrapS(s - this.tvSpot.s) < tr.length - 60) {
        const sNew = tr.wrapS(s + 90);
        const f = tr.frameAt(sNew);
        const side = Math.random() < 0.5 ? 1 : -1;
        const d = side * ((side > 0 ? f.barrierL : f.barrierR) + 6);
        this.tvSpot = { s: sNew, x: f.x + f.lx * d, y: f.y + 5 + Math.random() * 4, z: f.z + f.lz * d };
        this.initialized = false;
      }
      desired.set(this.tvSpot.x, this.tvSpot.y, this.tvSpot.z);
      look.set(t.x, t.y + 0.6, t.z);
      const dist = Math.hypot(t.x - desired.x, t.z - desired.z);
      fovTarget = clamp(2400 / Math.max(dist, 10), 12, 55);
      stiff = 1000;
    }
    if (!this.initialized) { this.pos.copy(desired); this.look.copy(look); this.fov = fovTarget; this.initialized = true; }
    const prev = this._prev || (this._prev = new THREE.Vector3());
    prev.copy(this.pos);
    // smooth (chase cams lag a bit in xz, tighter in y)
    const k = 1 - Math.exp(-stiff * dt);
    this.pos.x += (desired.x - this.pos.x) * k;
    this.pos.z += (desired.z - this.pos.z) * k;
    this.pos.y += (desired.y - this.pos.y) * Math.min(1, k * 1.6);
    this.look.lerp(look, Math.min(1, k * 2));
    if (dt > 0) this.vel.copy(this.pos).sub(prev).divideScalar(dt);
    // keep above ground
    if (mode <= 1 && opts.groundAt) {
      const g = opts.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y < g + 0.6) this.pos.y = g + 0.6;
    }
    this.fov = damp(this.fov, fovTarget, 3, dt);
    cam.fov = this.fov;
    cam.position.copy(this.pos);
    // shake: high speed buzz + curbs + impacts
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sp = clamp(speed / 100, 0, 1) * 0.012 + (opts.rumble || 0) * 0.03 + this.shake * 0.08;
    if (sp > 0 && mode !== 4) {
      const tt = performance.now() / 1000;
      cam.position.x += (Math.sin(tt * 37.1) + Math.sin(tt * 61.7)) * sp * 0.5;
      cam.position.y += (Math.sin(tt * 43.3) + Math.sin(tt * 71.9)) * sp * 0.5;
    }
    cam.lookAt(this.look);
    if (mode === 2 || mode === 3) {
      // roll with the car in hood/bumper views
      cam.rotateZ(-(t.roll || 0) * 0.6);
    }
    cam.updateProjectionMatrix();
  }
}
