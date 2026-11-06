import * as THREE from 'three';
import { G } from '../core/G.js';
import { TIME_UNIFORM, WIND_UNIFORM } from '../core/shaderlib.js';

// Ambient life and small touches that make the world feel inhabited:
// bird flocks (styled per Age), butterflies, jumping fish, wind streaks
// and a rainbow after rain.

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

// ---------------------------------------------------------------- birds
function birdGeometry() {
  const P = [], W = [];
  const tri = (a, b, c) => {
    for (const v of [a, b, c]) {
      P.push(v[0], v[1], v[2]);
      W.push(Math.min(1, Math.abs(v[0]) / 0.55));
    }
  };
  // body: a thin diamond
  const nose = [0, 0, 0.26], tail = [0, 0, -0.22], top = [0, 0.05, 0.02], bot = [0, -0.045, 0.02], l = [0.05, 0, 0.02], r = [-0.05, 0, 0.02];
  for (const [a, b] of [[l, top], [top, r], [r, bot], [bot, l]]) { tri(nose, a, b); tri(tail, b, a); }
  // wings in two segments each side, swept back
  for (const sx of [1, -1]) {
    const r0 = [0.04 * sx, 0, 0.1], r1 = [0.04 * sx, 0, -0.07], m0 = [0.3 * sx, 0, 0.05], m1 = [0.28 * sx, 0, -0.1], tip = [0.58 * sx, 0, -0.14];
    tri(r0, m0, r1); tri(r1, m0, m1); tri(m0, tip, m1);
  }
  // tail fan
  tri([0, 0, -0.16], [0.08, 0, -0.34], [-0.08, 0, -0.34]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1));
  g.computeVertexNormals();
  return g;
}

const FLOCKS = 5, PER = 7;

class Birds {
  constructor(scene) {
    const geo = birdGeometry();
    const n = FLOCKS * PER;
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) phase[i] = Math.random();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.uFlap = { value: 11 };
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x000000 });
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = TIME_UNIFORM;
      sh.uniforms.uFlap = this.uFlap;
      sh.vertexShader = 'attribute float aWing; attribute float aPhase; uniform float uTime; uniform float uFlap;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float glide = smoothstep(0.35, 0.7, sin(uTime * 0.45 + aPhase * 6.28));
        float fl = sin(uTime * uFlap * (0.85 + 0.3 * fract(aPhase * 7.0)) + aPhase * 6.28) * (1.0 - glide * 0.85);
        transformed.y += aWing * (0.55 * aWing + 0.45) * fl * 0.32 + glide * aWing * aWing * 0.06;
        transformed.x *= 1.0 - 0.12 * aWing * abs(fl);`,
      );
    };
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, _c.setHex(0x2a2a30));
    scene.add(this.mesh);
    this.flocks = [];
    for (let f = 0; f < FLOCKS; f++) this.flocks.push({ x: 0, z: 0, alt: 30, yaw: 0, speed: 9, turn: 0, t: Math.random() * 100, alive: false, birds: [] });
    for (const fl of this.flocks) for (let b = 0; b < PER; b++) fl.birds.push({ ox: 0, oz: 0, oy: 0, ph: Math.random() * 10 });
    this.epoch = -1;
    this.vis = 0;
  }

  style(ep) {
    this.epoch = ep;
    const cols = ep === 0 ? [0x2b2b33, 0x3a3230, 0x23232a] : ep === 1 ? [0x141010, 0x1c1614, 0x100c0c] : [0x8fe8ff, 0xc39bff, 0x9fd0ff];
    for (let i = 0; i < FLOCKS * PER; i++) this.mesh.setColorAt(i, _c.setHex(cols[i % cols.length]));
    this.mesh.instanceColor.needsUpdate = true;
    this.mat.emissive.setHex(ep === 2 ? 0x3a5aa0 : 0x000000);
    this.mat.emissiveIntensity = ep === 2 ? 1.6 : 1;
    this.uFlap.value = ep === 1 ? 5 : ep === 2 ? 7 : 11;
    for (const fl of this.flocks) fl.alive = false; // respawn with the new style
  }

  spawn(fl, P, first) {
    const ep = this.epoch;
    const a = Math.random() * Math.PI * 2;
    const d = first ? 40 + Math.random() * 120 : 150 + Math.random() * 60;
    fl.x = P.x + Math.sin(a) * d;
    fl.z = P.z + Math.cos(a) * d;
    // fly roughly across the player's surroundings
    fl.yaw = a + Math.PI + (Math.random() - 0.5) * 1.6;
    fl.speed = ep === 1 ? 7 : ep === 2 ? 5 : 10 + Math.random() * 3;
    fl.alt = (ep === 1 ? 45 : 22) + Math.random() * 25;
    fl.circle = ep === 1 || (ep === 2 && Math.random() < 0.5);
    fl.turn = (Math.random() < 0.5 ? -1 : 1) * (fl.circle ? 0.25 : 0.03);
    fl.scale = ep === 1 ? 1.9 : ep === 2 ? 1.25 : 0.9 + Math.random() * 0.4;
    const v = ep === 0 && Math.random() < 0.6; // V formation
    fl.birds.forEach((b, i) => {
      if (v) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        b.ox = i === 0 ? 0 : side * row * 1.6;
        b.oz = -row * 1.5;
        b.oy = 0;
      } else {
        b.ox = (Math.random() - 0.5) * (fl.circle ? 14 : 7);
        b.oz = (Math.random() - 0.5) * (fl.circle ? 14 : 7);
        b.oy = (Math.random() - 0.5) * 4;
      }
    });
    fl.alive = true;
  }

  update(dt, P, ep, night, hidden) {
    if (ep !== this.epoch) this.style(ep);
    // songbirds roost at night; the other Ages' fliers stay up
    const want = hidden ? 0 : ep === 0 ? 1 - night : 1;
    this.vis += (want - this.vis) * Math.min(1, dt * 0.5);
    const on = this.vis > 0.05;
    this.mesh.visible = on;
    if (!on) { for (const fl of this.flocks) fl.alive = false; return; }
    const active = Math.max(1, Math.round(FLOCKS * this.vis));
    let k = 0;
    for (let f = 0; f < FLOCKS; f++) {
      const fl = this.flocks[f];
      if (!fl.alive) this.spawn(fl, P, true);
      fl.t += dt;
      fl.yaw += (fl.turn + Math.sin(fl.t * 0.13 + f) * (fl.circle ? 0.05 : 0.04)) * dt;
      fl.x += Math.sin(fl.yaw) * fl.speed * dt;
      fl.z += Math.cos(fl.yaw) * fl.speed * dt;
      if (Math.hypot(fl.x - P.x, fl.z - P.z) > 240) this.spawn(fl, P, false);
      const ground = G.terrain.heightAt(fl.x, fl.z);
      const wl = G.water ? G.water.level : -1e9;
      const floorY = Math.max(ground, wl) + fl.alt;
      fl.y = fl.y === undefined ? floorY : fl.y + (floorY - fl.y) * Math.min(1, dt * 0.4);
      const cs = Math.cos(fl.yaw), sn = Math.sin(fl.yaw);
      const bank = -fl.turn * (fl.circle ? 1.6 : 6);
      for (const b of fl.birds) {
        if (f >= active) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(k++, _m); continue; }
        const wob = Math.sin(fl.t * 0.9 + b.ph) * 0.8;
        _v.set(fl.x + b.ox * cs + b.oz * sn + wob, fl.y + b.oy + Math.sin(fl.t * 1.3 + b.ph) * 0.6, fl.z - b.ox * sn + b.oz * cs);
        _e.set(Math.sin(fl.t * 1.1 + b.ph) * 0.08, fl.yaw, bank);
        _q.setFromEuler(_e);
        _s.setScalar(fl.scale);
        _m.compose(_v, _q, _s);
        this.mesh.setMatrixAt(k++, _m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ----------------------------------------------------------- butterflies
const BF = 22;
class Butterflies {
  constructor(scene) {
    const P = [], S = [], C = [];
    const wing = (sx) => {
      // fore and hind wing as a fan around the body
      const pts = [[0, 0, 0.035], [0.07, 0, 0.075], [0.1, 0, 0.02], [0.085, 0, -0.035], [0.05, 0, -0.075], [0, 0, -0.03]];
      for (let i = 1; i < pts.length - 1; i++) {
        for (const p of [pts[0], pts[i], pts[i + 1]]) {
          P.push(p[0] * sx, p[1], p[2]);
          S.push(sx);
          const edge = Math.min(1, Math.hypot(p[0], p[2]) / 0.1);
          const k = 1 - edge * 0.55;
          C.push(k, k, k);
        }
      }
    };
    wing(1); wing(-1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    const ph = new Float32Array(BF);
    for (let i = 0; i < BF; i++) ph[i] = Math.random() * 10;
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x111111 });
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = TIME_UNIFORM;
      sh.vertexShader = 'attribute float aSide; attribute float aPhase; uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float a = 0.35 + sin(uTime * 17.0 + aPhase * 3.0) * 0.95;
        float ax = abs(transformed.x);
        transformed.x = aSide * ax * cos(a);
        transformed.y = ax * sin(a);`,
      );
    };
    this.mesh = new THREE.InstancedMesh(g, this.mat, BF);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const cols = [0xffb02e, 0xf4f0e0, 0x4aa3ff, 0xff6aa8, 0xffe35a, 0xb07aff];
    this.list = [];
    for (let i = 0; i < BF; i++) {
      this.mesh.setColorAt(i, _c.setHex(cols[i % cols.length]));
      this.list.push({ x: 0, z: 0, ax: 0, az: 0, t: Math.random() * 50, s: 0.8 + Math.random() * 0.6, set: false });
    }
    scene.add(this.mesh);
    this.vis = 0;
  }
  update(dt, P, ep, night, rain, hidden) {
    const want = !hidden && ep === 0 ? (1 - night) * (1 - rain) : 0;
    this.vis += (want - this.vis) * Math.min(1, dt * 0.6);
    this.mesh.visible = this.vis > 0.05;
    if (!this.mesh.visible) return;
    const n = Math.round(BF * this.vis);
    this.list.forEach((b, i) => {
      if (!b.set || Math.hypot(b.ax - P.x, b.az - P.z) > 30) {
        const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 20;
        b.ax = P.x + Math.sin(a) * d;
        b.az = P.z + Math.cos(a) * d;
        b.set = true;
      }
      b.t += dt;
      const t = b.t;
      const x = b.ax + Math.sin(t * 0.43 + i) * 2.5 + Math.sin(t * 1.7 + i * 2) * 0.4;
      const z = b.az + Math.cos(t * 0.37 + i * 3) * 2.5 + Math.cos(t * 1.9 + i) * 0.4;
      const gy = G.terrain.heightAt(x, z);
      const wl = G.water ? G.water.level : -1e9;
      const y = Math.max(gy, wl) + 0.7 + Math.sin(t * 1.3 + i) * 0.45 + Math.abs(Math.sin(t * 5 + i)) * 0.15;
      const dx = Math.cos(t * 0.43 + i) * 0.43 * 2.5, dz = -Math.sin(t * 0.37 + i * 3) * 0.37 * 2.5;
      _v.set(x, y, z);
      _e.set(-0.25, Math.atan2(dx, dz), 0);
      _q.setFromEuler(_e);
      _s.setScalar(i < n ? b.s : 0);
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ fish
class Fish {
  constructor(scene) {
    const body = new THREE.SphereGeometry(0.12, 10, 6);
    body.scale(0.55, 0.8, 2.2);
    const tail = new THREE.ConeGeometry(0.12, 0.2, 4);
    tail.rotateX(Math.PI / 2);
    tail.scale(0.3, 1, 1);
    tail.translate(0, 0, -0.32);
    const g = body;
    this.mat = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.6, roughness: 0.3, emissive: 0x000000 });
    this.mesh = new THREE.Group();
    this.mesh.add(new THREE.Mesh(g, this.mat), new THREE.Mesh(tail, this.mat));
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.cool = 4;
    this.jump = null;
  }
  update(dt, P, ep, hidden) {
    if (this.jump) {
      const j = this.jump;
      j.t += dt;
      const u = j.t / j.dur;
      if (u >= 1) {
        G.fx?.splash(j.x1, j.y, j.z1, 0.22);
        G.audio?.sfx('splash', { pos: _v.set(j.x1, j.y, j.z1), volume: 0.35, pitch: 1.6 });
        this.mesh.visible = false;
        this.jump = null;
        return;
      }
      const x = j.x0 + (j.x1 - j.x0) * u, z = j.z0 + (j.z1 - j.z0) * u;
      const y = j.y - 0.2 + Math.sin(u * Math.PI) * j.h;
      this.mesh.position.set(x, y, z);
      const vy = Math.cos(u * Math.PI) * j.h * Math.PI / j.dur;
      const vh = Math.hypot(j.x1 - j.x0, j.z1 - j.z0) / j.dur;
      this.mesh.rotation.set(-Math.atan2(vy, vh), Math.atan2(j.x1 - j.x0, j.z1 - j.z0), Math.sin(j.t * 20) * 0.2, 'YXZ');
      return;
    }
    if (hidden || ep === 1 || !G.water) return;
    this.cool -= dt;
    if (this.cool > 0) return;
    this.cool = 3 + Math.random() * 7;
    // pick a deep enough spot in view range
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2, d = 7 + Math.random() * 25;
      const x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
      if (G.water.depthAt(x, z) < 1.5 || G.water.isIce?.(x, z)) continue;
      const dir = Math.random() * Math.PI * 2, len = 1.2 + Math.random() * 1.2;
      const x1 = x + Math.sin(dir) * len, z1 = z + Math.cos(dir) * len;
      if (G.water.depthAt(x1, z1) < 1) continue;
      const y = G.water.level;
      this.jump = { x0: x, z0: z, x1, z1, y, t: 0, dur: 0.75 + Math.random() * 0.3, h: 0.8 + Math.random() * 0.7 };
      this.mat.color.setHex(ep === 2 ? 0x8fe8ff : 0xb8c4cc);
      this.mat.emissive.setHex(ep === 2 ? 0x3a8aff : 0x000000);
      const sc = 0.8 + Math.random() * 0.7;
      this.mesh.scale.setScalar(sc);
      this.mesh.visible = true;
      G.fx?.ripple(x, y, z);
      G.fx?.splash(x, y, z, 0.15);
      break;
    }
  }
}

// --------------------------------------------------------- wind streaks
const SN = 10, SL = 18;
class WindStreaks {
  constructor(scene) {
    this.pos = new Float32Array(SN * SL * 2 * 3);
    this.a = new Float32Array(SN * SL * 2);
    const idx = [];
    for (let s = 0; s < SN; s++) {
      for (let i = 0; i < SL - 1; i++) {
        const o = (s * SL + i) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0, 1.0, 0.98) * 1.1, vA); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
    this.list = [];
    for (let s = 0; s < SN; s++) {
      const pts = [];
      for (let i = 0; i < SL; i++) pts.push(new THREE.Vector3());
      this.list.push({ life: 0, t: 0, head: new THREE.Vector3(), vel: new THREE.Vector3(), pts, n: 0, ph: 0, acc: 0 });
    }
    this.spawnT = 0;
    this._side = new THREE.Vector3();
    this._to = new THREE.Vector3();
  }
  update(dt, cam, P, strength, flowDir) {
    this.spawnT -= dt;
    if (strength > 0.05 && this.spawnT <= 0) {
      this.spawnT = 0.35 / strength;
      const s = this.list.find((x) => x.life <= 0);
      if (s) {
        const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 9;
        s.head.set(cam.x + Math.sin(a) * d, cam.y + (Math.random() - 0.4) * 3, cam.z + Math.cos(a) * d);
        s.vel.copy(flowDir).multiplyScalar(9 + Math.random() * 6);
        s.life = 1.1 + Math.random() * 0.6;
        s.t = 0;
        s.n = 0;
        s.ph = Math.random() * 10;
        s.acc = 0;
      }
    }
    let any = false;
    for (let k = 0; k < SN; k++) {
      const s = this.list[k];
      const base = k * SL * 2;
      if (s.life <= 0) {
        for (let i = 0; i < SL * 2; i++) this.a[base + i] = 0;
        continue;
      }
      any = true;
      s.t += dt;
      // the head curls gently as it travels
      s.head.addScaledVector(s.vel, dt);
      s.head.y += Math.sin(s.t * 5 + s.ph) * dt * 1.2;
      this._side.set(-s.vel.z, 0, s.vel.x).normalize();
      s.head.addScaledVector(this._side, Math.cos(s.t * 4 + s.ph) * dt * 1.6);
      s.acc += dt;
      if (s.acc > 0.03 || s.n === 0) {
        s.acc = 0;
        for (let i = SL - 1; i > 0; i--) s.pts[i].copy(s.pts[i - 1]);
        s.pts[0].copy(s.head);
        s.n = Math.min(SL, s.n + 1);
      } else s.pts[0].copy(s.head);
      const u = s.t / s.life;
      const fade = Math.min(1, s.t * 4) * Math.min(1, (1 - u) * 3);
      if (u >= 1) s.life = 0;
      for (let i = 0; i < SL; i++) {
        const p = s.pts[Math.min(i, s.n - 1)];
        this._to.subVectors(cam, p).normalize();
        const nxt = s.pts[Math.min(i + 1, s.n - 1)];
        _v.subVectors(p, nxt);
        if (_v.lengthSq() < 1e-6) _v.copy(s.vel);
        this._side.crossVectors(_v, this._to).normalize().multiplyScalar(0.025);
        const o = (base + i * 2) * 3;
        this.pos[o] = p.x + this._side.x; this.pos[o + 1] = p.y + this._side.y; this.pos[o + 2] = p.z + this._side.z;
        this.pos[o + 3] = p.x - this._side.x; this.pos[o + 4] = p.y - this._side.y; this.pos[o + 5] = p.z - this._side.z;
        const along = i < s.n ? Math.sin((i / (SL - 1)) * Math.PI) : 0;
        this.a[base + i * 2] = this.a[base + i * 2 + 1] = along * fade * 0.42;
      }
    }
    this.mesh.visible = any;
    if (any) {
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.aA.needsUpdate = true;
    }
  }
}

// --------------------------------------------------------------- rainbow
class Rainbow {
  constructor(scene) {
    const g = new THREE.RingGeometry(0.9, 1.0, 128, 1);
    this.uA = { value: 0 };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uA: this.uA },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uA; varying vec2 vP;
        void main(){
          float u = (length(vP) - 0.9) / 0.1;
          float h = 0.78 * (1.0 - u);
          vec3 col = clamp(abs(fract(vec3(h) + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
          float a = sin(u * 3.14159) * uA;
          gl_FragColor = vec4(col * 0.95, a * 0.42);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.level = 0;
  }
  update(dt, cam, ep, weather, sunDir, hidden) {
    const after = weather ? Math.max(0, Math.min(1, (weather.wet - 0.15) * 2)) * (1 - Math.min(1, weather.rain * 4)) : 0;
    const want = !hidden && ep === 0 && sunDir.y > 0.04 && sunDir.y < 0.7 ? after : 0;
    this.level += (want - this.level) * Math.min(1, dt * 0.25);
    this.uA.value = this.level;
    this.mesh.visible = this.level > 0.01;
    if (!this.mesh.visible) return;
    const D = 2400;
    // centred on the antisolar point, 42 degrees around it
    _v.copy(sunDir).multiplyScalar(-D).add(cam);
    this.mesh.position.copy(_v);
    this.mesh.lookAt(cam);
    this.mesh.scale.setScalar(D * Math.tan((42 * Math.PI) / 180) / 0.95);
  }
}

// ---------------------------------------------------------------- manager
export class Life {
  constructor(scene) {
    this.birds = new Birds(scene);
    this.butterflies = new Butterflies(scene);
    this.fish = new Fish(scene);
    this.wind = new WindStreaks(scene);
    this.rainbow = new Rainbow(scene);
    this.flow = new THREE.Vector3();
  }
  update(dt, rdt) {
    if (!G.player || !G.terrain) return;
    const P = G.player.pos;
    const cam = G.camera.position;
    const ep = G.epochs ? G.epochs.current : 0;
    const night = G.atmo?.state?.night || 0;
    const W = G.weather?.state;
    const hidden = !!G.game?.inPocket || G.state === 'title';
    this.birds.update(dt, P, ep, night, hidden);
    this.butterflies.update(dt, P, ep, night, W ? W.rain : 0, hidden);
    this.fish.update(dt, P, ep, hidden);
    // wind streaks: strong weather wind, gliding or a fast gallop
    const pl = G.player;
    const speed = Math.hypot(pl.vel.x, pl.vel.z);
    let s = 0;
    if (!hidden) {
      if (pl.mode === 'glide') s = 1;
      else if (pl.mode === 'mounted' && speed > 9) s = 0.7;
      s = Math.max(s, W ? Math.max(0, (W.wind || 0) - 0.45) * 1.6 : 0);
      if (G.state !== 'play') s = 0;
    }
    if (pl.mode === 'glide' || pl.mode === 'mounted') this.flow.set(-pl.vel.x, 0, -pl.vel.z);
    else this.flow.set(WIND_UNIFORM.value.x, 0, WIND_UNIFORM.value.y);
    if (this.flow.lengthSq() < 1e-4) this.flow.set(1, 0, 0);
    this.flow.normalize();
    this.wind.update(dt, cam, P, s, this.flow);
    if (G.atmo) this.rainbow.update(rdt, cam, ep, W, G.atmo.uniforms.uSunDir.value, hidden);
  }
}
