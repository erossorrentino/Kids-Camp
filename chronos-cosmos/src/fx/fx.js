import * as THREE from 'three';
import { G } from '../core/G.js';
import { GLSL_NOISE, TIME_UNIFORM, fogUniforms } from '../core/shaderlib.js';

// ---------------------------------------------------------------------------
// CPU-simulated, GPU-drawn particle pools
// ---------------------------------------------------------------------------
const P_VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aShape;
varying float vAlpha; varying vec3 vColor; varying float vShape;
uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha; vColor = aColor; vShape = aShape;
}`;
const P_FRAG = /* glsl */ `
varying float vAlpha; varying vec3 vColor; varying float vShape;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float a;
  if (vShape < 0.5) a = pow(max(0.0, 1.0 - d), 1.8);          // soft glow
  else if (vShape < 1.5) a = smoothstep(1.0, 0.6, d) * (0.6 + 0.4 * (1.0 - d)); // smoke puff
  else { float s = max(abs(c.x * c.y) * 6.0, 0.0); a = max(pow(max(0.0, 1.0 - d), 3.0), (1.0 - smoothstep(0.0, 0.15, abs(c.x)) ) * (1.0 - d) + (1.0 - smoothstep(0.0, 0.15, abs(c.y))) * (1.0 - d)) ; a *= 1.0 - s * 0.0; } // star sparkle
  if (a * vAlpha < 0.004) discard;
  gl_FragColor = vec4(vColor * (vShape > 0.5 && vShape < 1.5 ? 1.0 : 1.0), a * vAlpha);
}`;

class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.shape = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.active = new Set();
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aShape = new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aShape', this.aShape);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }
  emit(o) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.active.add(i);
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.grav[i] = o.grav ?? 0;
    this.drag[i] = o.drag ?? 1;
    this.s0[i] = o.size ?? 0.3;
    this.s1[i] = o.size1 ?? this.s0[i];
    this.a0[i] = o.alpha ?? 1;
    const c = o.color || [1, 1, 1];
    const c1 = o.color1 || c;
    this.c0[i * 3] = c[0]; this.c0[i * 3 + 1] = c[1]; this.c0[i * 3 + 2] = c[2];
    this.c1[i * 3] = c1[0]; this.c1[i * 3 + 1] = c1[1]; this.c1[i * 3 + 2] = c1[2];
    this.shape[i] = o.shape || 0;
    return i;
  }
  update(dt, height) {
    const P = this.pos, V = this.vel;
    this.mat.uniforms.uScale.value = height * 0.9;
    for (const i of this.active) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.active.delete(i);
        this.free.push(i);
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const u = 1 - this.life[i] / this.maxLife[i];
      V[i * 3 + 1] -= this.grav[i] * dt;
      const dr = Math.pow(this.drag[i], dt * 60);
      V[i * 3] *= dr; V[i * 3 + 1] *= dr; V[i * 3 + 2] *= dr;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * u;
      const fadeIn = Math.min(1, u * 8);
      this.alpha[i] = this.a0[i] * fadeIn * (1 - u * u);
      this.col[i * 3] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * u;
      this.col[i * 3 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * u;
      this.col[i * 3 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * u;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aShape.needsUpdate = true;
  }
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

// ---------------------------------------------------------------------------
// Ambient wrapping fields (fireflies, pollen, ash, stars, rain, snow)
// ---------------------------------------------------------------------------
const AMB_VERT = /* glsl */ `
attribute vec4 aRand;
uniform vec3 uCenter; uniform float uSize; uniform float uTime; uniform float uKind; uniform float uAmount; uniform float uScale;
varying float vA; varying vec3 vC; varying float vKind;
${GLSL_NOISE}
void main(){
  vec3 p = position;
  float k = uKind;
  vec3 c = uCenter;
  vec3 wp;
  float sz = 1.0; float a = 1.0; vec3 col = vec3(1.0);
  float t = uTime;
  if (k < 0.5) { // pollen / dust motes
    p += vec3(sin(t * 0.3 + aRand.x * 20.0) * 2.0, sin(t * 0.21 + aRand.y * 10.0) * 1.0, cos(t * 0.27 + aRand.z * 15.0) * 2.0);
    sz = 0.05 + aRand.w * 0.05; col = vec3(1.0, 0.95, 0.8) * 1.5; a = 0.55;
  } else if (k < 1.5) { // fireflies
    p += vec3(sin(t * 0.7 + aRand.x * 20.0) * 1.5, sin(t * 0.9 + aRand.y * 10.0) * 0.6, cos(t * 0.6 + aRand.z * 15.0) * 1.5);
    float blink = pow(max(0.0, sin(t * (1.0 + aRand.w * 2.0) + aRand.x * 30.0)), 6.0);
    sz = 0.18; col = vec3(0.75, 1.0, 0.35) * 5.0; a = blink;
  } else if (k < 2.5) { // falling ash + embers
    p.y -= t * (0.6 + aRand.w * 0.6);
    p.x += t * 0.8 + sin(t * 0.8 + aRand.x * 20.0) * 1.2;
    p.z += sin(t * 0.6 + aRand.y * 20.0) * 1.2;
    bool ember = aRand.z > 0.85;
    sz = ember ? 0.07 : 0.09; col = ember ? vec3(3.0, 0.9, 0.2) : vec3(0.45, 0.42, 0.4); a = ember ? (0.6 + 0.4 * sin(t * 6.0 + aRand.x * 40.0)) : 0.7;
  } else if (k < 3.5) { // star motes rising
    p.y += t * (0.3 + aRand.w * 0.4);
    p.x += sin(t * 0.5 + aRand.x * 20.0) * 1.2;
    sz = 0.08; col = mix(vec3(0.3, 0.8, 1.6), vec3(1.2, 0.6, 1.8), aRand.z) * 1.6; a = 0.5 + 0.5 * sin(t * 3.0 + aRand.x * 40.0);
  } else if (k < 4.5) { // rain
    p.y -= t * 18.0;
    p.x += t * 2.0;
    sz = 0.06; col = vec3(0.6, 0.65, 0.75); a = 0.5;
  } else { // snow
    p.y -= t * (1.0 + aRand.w);
    p.x += sin(t * 0.6 + aRand.x * 20.0) * 1.0;
    sz = 0.1; col = vec3(1.0); a = 0.85;
  }
  vec3 h = vec3(uSize, uSize * 0.5, uSize);
  wp = c + mod(p - c + h * 0.5 * vec3(1.0, 1.0, 1.0) * 1.0, h) - h * 0.5;
  wp.y += c.y * 0.0;
  float d = length(wp - c);
  a *= (1.0 - smoothstep(uSize * 0.3, uSize * 0.5, d)) * step(aRand.x, uAmount);
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = sz * uScale / max(0.1, -mv.z);
  if (k > 3.5 && k < 4.5) gl_PointSize *= 1.0;
  vA = a; vC = col; vKind = k;
}`;
const AMB_FRAG = /* glsl */ `
varying float vA; varying vec3 vC; varying float vKind;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (vKind > 3.5 && vKind < 4.5) a = (1.0 - smoothstep(0.0, 0.25, abs(c.x))) * (1.0 - smoothstep(0.6, 1.0, abs(c.y)));
  else a = pow(max(0.0, 1.0 - length(c)), 2.0);
  if (a * vA < 0.01) discard;
  gl_FragColor = vec4(vC, a * vA);
}`;

class AmbientField {
  constructor(scene, count, size, kind, additive = true) {
    const pos = new Float32Array(count * 3);
    const rr = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * size;
      pos[i * 3 + 1] = Math.random() * size * 0.5;
      pos[i * 3 + 2] = Math.random() * size;
      rr[i * 4] = Math.random(); rr[i * 4 + 1] = Math.random(); rr[i * 4 + 2] = Math.random(); rr[i * 4 + 3] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rr, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = { uCenter: { value: new THREE.Vector3() }, uSize: { value: size }, uTime: TIME_UNIFORM, uKind: { value: kind }, uAmount: { value: 0 }, uScale: { value: 600 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: AMB_VERT, fragmentShader: AMB_FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.target = 0;
  }
  update(dt, center, height) {
    this.uniforms.uCenter.value.copy(center);
    this.uniforms.uScale.value = height * 0.9;
    const a = this.uniforms.uAmount;
    a.value += (this.target - a.value) * Math.min(1, dt * 0.7);
    this.points.visible = a.value > 0.005;
  }
}

// ---------------------------------------------------------------------------
// FX manager
// ---------------------------------------------------------------------------
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new Pool(scene, 4000, true);
    this.norm = new Pool(scene, 1500, false);
    this.rings = [];
    this.bolts = [];
    this.decals = [];
    this.numbers = [];
    this.lights = [];
    this.fade = 0;
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringGeo = ringGeo;
    const discGeo = new THREE.CircleGeometry(1, 40);
    discGeo.rotateX(-Math.PI / 2);
    this.discGeo = discGeo;
    // ambient
    this.amb = {
      pollen: new AmbientField(scene, 900, 50, 0),
      fireflies: new AmbientField(scene, 500, 60, 1),
      ash: new AmbientField(scene, 2500, 60, 2, false),
      stars: new AmbientField(scene, 900, 60, 3),
      rain: new AmbientField(scene, 7000, 50, 4, false),
      snow: new AmbientField(scene, 3000, 50, 5, false),
    };
    // pooled point lights for spells/explosions
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 12, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 0, inten: 0 });
    }
  }

  flashLight(x, y, z, color, intensity = 20, dur = 0.3, dist = 14) {
    let best = this.lights[0];
    for (const L of this.lights) if (L.t <= 0) { best = L; break; } else if (L.t < best.t) best = L;
    best.l.position.set(x, y, z);
    best.l.color.setHex(color);
    best.l.distance = dist;
    best.t = best.dur = dur;
    best.inten = intensity;
    best.l.visible = true;
  }

  // ------------------------------------------------------------- emitters
  sparks(x, y, z, n = 14, color = 0xffd27a, speed = 7) {
    const c = hex(color);
    for (let i = 0; i < n; i++) {
      this.add.emit({ x, y, z, vx: rnd(speed), vy: Math.random() * speed, vz: rnd(speed), life: 0.25 + Math.random() * 0.35, size: 0.12, size1: 0.02, color: [c[0] * 4, c[1] * 4, c[2] * 4], grav: 14, drag: 0.94 });
    }
    this.add.emit({ x, y, z, life: 0.12, size: 1.6, size1: 2.4, color: [c[0] * 3, c[1] * 3, c[2] * 3], alpha: 0.9 });
  }
  hitBurst(x, y, z, color = 0xffffff, strength = 1) {
    const c = hex(color);
    for (let i = 0; i < 10 * strength; i++) {
      this.add.emit({ x, y, z, vx: rnd(5), vy: rnd(5), vz: rnd(5), life: 0.2 + Math.random() * 0.25, size: 0.18, size1: 0.0, color: [c[0] * 3, c[1] * 3, c[2] * 3], drag: 0.9 });
    }
    this.add.emit({ x, y, z, life: 0.1, size: 1.2 * strength, size1: 2.2 * strength, color: [c[0] * 2, c[1] * 2, c[2] * 2], alpha: 0.8 });
  }
  dust(x, y, z, s = 1) {
    const e = G.epochs ? G.epochs.current : 0;
    const col = e === 1 ? [0.35, 0.3, 0.27] : e === 2 ? [0.5, 0.5, 0.7] : [0.55, 0.5, 0.42];
    for (let i = 0; i < 8 * s + 2; i++) {
      this.norm.emit({ x: x + rnd(0.4 * s), y: y + 0.1, z: z + rnd(0.4 * s), vx: rnd(2 * s), vy: Math.random() * 1.2 * s, vz: rnd(2 * s), life: 0.6 + Math.random() * 0.6, size: 0.4 * s, size1: 1.4 * s, color: col, alpha: 0.35, drag: 0.93, shape: 1 });
    }
  }
  smoke(x, y, z, s = 1, color = [0.3, 0.3, 0.32]) {
    this.norm.emit({ x: x + rnd(0.3), y, z: z + rnd(0.3), vx: rnd(0.3), vy: 0.8 + Math.random() * 0.6, vz: rnd(0.3), life: 2.5 + Math.random(), size: 0.6 * s, size1: 2.6 * s, color, alpha: 0.28, drag: 0.99, shape: 1 });
  }
  fire(x, y, z, s = 1) {
    this.add.emit({ x: x + rnd(0.25 * s), y: y + Math.random() * 0.2, z: z + rnd(0.25 * s), vx: rnd(0.3), vy: 1.5 + Math.random() * 1.5 * s, vz: rnd(0.3), life: 0.5 + Math.random() * 0.4, size: 0.5 * s, size1: 0.1, color: [4, 1.6, 0.4], color1: [2.5, 0.4, 0.05], drag: 0.97 });
    if (Math.random() < 0.15) this.add.emit({ x, y: y + 0.5, z, vx: rnd(0.8), vy: 2 + Math.random() * 2, vz: rnd(0.8), life: 1 + Math.random(), size: 0.06, color: [5, 2, 0.5], drag: 0.98 });
  }
  splash(x, y, z, s = 1) {
    for (let i = 0; i < 24 * s; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5 * s;
      this.norm.emit({ x, y: y + 0.1, z, vx: Math.cos(a) * r, vy: 3 + Math.random() * 4 * s, vz: Math.sin(a) * r, life: 0.7 + Math.random() * 0.4, size: 0.2, size1: 0.08, color: [0.8, 0.88, 0.95], alpha: 0.75, grav: 12, drag: 0.98 });
    }
    this.ring(x, y + 0.05, z, 2.5 * s, 0x9fdcff, 0.6, 0.6);
  }
  ripple(x, y, z) {
    this.ring(x, y + 0.04, z, 1.6, 0xcfe8ff, 0.9, 0.25);
  }
  healBurst(p, color = 0x9cff8a) {
    const c = hex(color);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add.emit({ x: p.x + Math.cos(a) * 0.6, y: p.y + Math.random() * 1.8, z: p.z + Math.sin(a) * 0.6, vx: 0, vy: 1 + Math.random() * 1.5, vz: 0, life: 0.8 + Math.random() * 0.5, size: 0.15, size1: 0.02, color: [c[0] * 3, c[1] * 3, c[2] * 3], shape: 2 });
    }
  }
  motes(x, y, z, n = 30, color = 0xbfe8ff, spread = 0.8) {
    const c = hex(color);
    for (let i = 0; i < n; i++) {
      this.add.emit({ x: x + rnd(spread), y: y + Math.random() * 1.6, z: z + rnd(spread), vx: rnd(0.8), vy: 0.8 + Math.random() * 2.2, vz: rnd(0.8), life: 1 + Math.random() * 1.2, size: 0.13, size1: 0.0, color: [c[0] * 3, c[1] * 3, c[2] * 3], drag: 0.98, shape: Math.random() < 0.3 ? 2 : 0 });
    }
  }
  elementBurst(x, y, z, el, s = 1) {
    if (el === 0) {
      for (let i = 0; i < 40 * s; i++) this.add.emit({ x, y, z, vx: rnd(6 * s), vy: rnd(5 * s) + 2, vz: rnd(6 * s), life: 0.4 + Math.random() * 0.5, size: 0.7 * s, size1: 0.1, color: [5, 1.8, 0.4], color1: [2, 0.3, 0.05], drag: 0.92 });
      for (let i = 0; i < 10 * s; i++) this.smoke(x + rnd(1), y, z + rnd(1), s, [0.15, 0.13, 0.12]);
      this.flashLight(x, y + 1, z, 0xff7a2a, 30 * s, 0.4);
    } else if (el === 1) {
      for (let i = 0; i < 40 * s; i++) this.add.emit({ x, y, z, vx: rnd(5 * s), vy: rnd(4 * s) + 1, vz: rnd(5 * s), life: 0.5 + Math.random() * 0.5, size: 0.25 * s, size1: 0.02, color: [1.5, 3, 4], drag: 0.9, grav: 4, shape: 2 });
      this.ring(x, y + 0.1, z, 3 * s, 0x9fe6ff, 0.8, 0.5);
      this.flashLight(x, y + 1, z, 0x8fe8ff, 18 * s, 0.35);
    } else if (el === 2) {
      for (let i = 0; i < 25 * s; i++) this.add.emit({ x, y, z, vx: rnd(9 * s), vy: rnd(9 * s), vz: rnd(9 * s), life: 0.15 + Math.random() * 0.2, size: 0.15, size1: 0.0, color: [3, 2.5, 5], drag: 0.85 });
      this.flashLight(x, y + 1, z, 0xc39bff, 35 * s, 0.2);
    } else {
      for (let i = 0; i < 30 * s; i++) this.add.emit({ x, y, z, vx: rnd(3 * s), vy: rnd(3 * s), vz: rnd(3 * s), life: 0.8 + Math.random() * 0.6, size: 0.2, size1: 0.0, color: [4, 3.3, 1.6], drag: 0.95, shape: 2 });
      this.ring(x, y + 0.1, z, 4 * s, 0xffe08a, 0.8, 0.8);
    }
  }
  shockwave(x, y, z, r = 5, color = 0xffffff, dur = 0.5) {
    this.ring(x, y, z, r, color, 1, dur);
    this.dust(x, y, z, r / 3);
  }
  ring(x, y, z, r, color, alpha = 1, dur = 0.5, geo) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo || this.ringGeo, m);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.1);
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    this.rings.push({ mesh, r, t: 0, dur, alpha });
  }
  // Ground telegraph for incoming attacks
  telegraph(x, y, z, r, dur, color = 0xff4422, kind = 'disc') {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
    const mesh = new THREE.Mesh(kind === 'ring' ? this.ringGeo : this.discGeo, m);
    mesh.position.set(x, y + 0.08, z);
    mesh.scale.setScalar(r);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    const edge = new THREE.Mesh(this.ringGeo, m.clone());
    edge.position.copy(mesh.position);
    edge.scale.setScalar(r);
    this.scene.add(edge);
    const d = { mesh, edge, t: 0, dur, r };
    this.decals.push(d);
    return d;
  }
  bolt(a, b, color = 0xc9a8ff, width = 1, life = 0.18, segs = 12) {
    const pts = [];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i > 0 && i < segs) p.add(new THREE.Vector3(rnd(1), rnd(1), rnd(1)).multiplyScalar(len * 0.06));
      pts.push(p);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(g, m);
    line.renderOrder = 7;
    this.scene.add(line);
    // thick glow points along the bolt
    for (const p of pts) this.add.emit({ x: p.x, y: p.y, z: p.z, life: life * 1.4, size: 0.6 * width, size1: 0.2, color: [2, 1.6, 3.5], alpha: 0.6 });
    this.bolts.push({ line, t: 0, life });
    this.flashLight(b.x, b.y + 0.5, b.z, color, 30, life * 1.5, 20);
  }
  damageNumber(x, y, z, v, color = '#fff', big = false, text = null) {
    this.numbers.push({ x: x + rnd(0.3), y, z: z + rnd(0.3), v: Math.round(v), color, t: 0, big, text, vy: 1.5 + Math.random() });
  }
  screenFade(dur = 0.5) {
    this.fade = Math.max(this.fade, 1);
    this.fadeSpeed = 1 / dur;
  }

  // Death dissolve of a rig into light motes
  dissolve(rig, color = 0xbfe8ff) {
    const p = new THREE.Vector3();
    rig.root.updateMatrixWorld(true);
    rig.root.traverse((o) => {
      if (o.isMesh && Math.random() < 0.7) {
        o.getWorldPosition(p);
        this.motes(p.x, p.y - 0.4, p.z, 4, color, 0.2);
      }
    });
  }

  update(dt) {
    const h = G.renderer.domElement.height / (G.renderer.getPixelRatio() || 1);
    this.add.update(dt, h * (G.renderer.getPixelRatio() || 1));
    this.norm.update(dt, h * (G.renderer.getPixelRatio() || 1));
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const u = r.t / r.dur;
      const e = 1 - Math.pow(1 - Math.min(1, u), 3);
      r.mesh.scale.setScalar(Math.max(0.01, e * r.r));
      r.mesh.material.opacity = r.alpha * (1 - u);
      if (u >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.t += dt;
      const u = d.t / d.dur;
      d.mesh.material.opacity = Math.min(0.35, u * 0.5) * (0.7 + 0.3 * Math.sin(d.t * 20));
      d.edge.material.opacity = 0.9;
      d.mesh.scale.setScalar(d.r * Math.min(1, u * 1.0));
      if (u >= 1 || d.kill) {
        this.scene.remove(d.mesh, d.edge);
        d.mesh.material.dispose();
        d.edge.material.dispose();
        this.decals.splice(i, 1);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.line.material.opacity = 1 - b.t / b.life;
      if (b.t >= b.life) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
    for (const L of this.lights) {
      if (L.t > 0) {
        L.t -= dt;
        L.l.intensity = L.inten * Math.max(0, L.t / L.dur);
        if (L.t <= 0) { L.l.visible = false; L.l.intensity = 0; }
      }
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      n.y += n.vy * dt;
      n.vy *= 0.94;
      if (n.t > 1.1) this.numbers.splice(i, 1);
    }
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * (this.fadeSpeed || 2));
  }

  updateAmbient(dt, cam, epoch, night, weather) {
    const A = this.amb;
    A.pollen.target = epoch === 0 ? (1 - night) * 0.7 * (1 - weather.rain) : 0;
    A.fireflies.target = (epoch === 0 || epoch === 2) ? night * (1 - weather.rain) : 0;
    A.ash.target = epoch === 1 ? 0.45 + weather.ash * 0.55 : 0;
    A.stars.target = epoch === 2 ? 0.7 : 0;
    A.rain.target = weather.rain;
    A.snow.target = (cam.y > 120 && epoch !== 1 ? 0.5 : 0) + weather.snow;
    const h = G.renderer.domElement.height;
    for (const k in A) A[k].update(dt, cam, h);
  }
}
