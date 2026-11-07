import * as THREE from 'three';

// CPU-simulated point sprites with per-particle color/size/alpha.
// One additive pool (fire, sparks, magic) and one alpha-blended pool (smoke, dust, oil).
const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 512.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, uSoft);
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.col2 = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.colOut = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colOut, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aColor', this.colAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uSoft: { value: additive ? 1.6 : 1.2 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.geo = g;
    scene.add(this.points);
  }
  emit(o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    const c = o.color || [1, 1, 1], c2 = o.color2 || c;
    this.col[i3] = c[0]; this.col[i3 + 1] = c[1]; this.col[i3 + 2] = c[2];
    this.col2[i3] = c2[0]; this.col2[i3 + 1] = c2[1]; this.col2[i3 + 2] = c2[2];
    this.size0[i] = o.size ?? 1; this.size1[i] = o.size1 ?? this.size0[i];
    this.alpha0[i] = o.alpha ?? 1;
    this.maxLife[i] = this.life[i] = o.life ?? 1;
    this.drag[i] = o.drag ?? 0.5;
    this.grav[i] = o.grav ?? 0;
  }
  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.alpha[i] = this.alpha0[i] * fade;
      this.colOut[i3] = this.col[i3] + (this.col2[i3] - this.col[i3]) * t;
      this.colOut[i3 + 1] = this.col[i3 + 1] + (this.col2[i3 + 1] - this.col[i3 + 1]) * t;
      this.colOut[i3 + 2] = this.col[i3 + 2] + (this.col2[i3 + 2] - this.col[i3 + 2]) * t;
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    this.posAttr.needsUpdate = this.colAttr.needsUpdate = this.sizeAttr.needsUpdate = this.alphaAttr.needsUpdate = true;
  }
  kill(i) {
    const j = --this.count;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k]; this.vel[i3 + k] = this.vel[j3 + k];
      this.col[i3 + k] = this.col[j3 + k]; this.col2[i3 + k] = this.col2[j3 + k]; this.colOut[i3 + k] = this.colOut[j3 + k];
    }
    this.size[i] = this.size[j]; this.size0[i] = this.size0[j]; this.size1[i] = this.size1[j];
    this.alpha[i] = this.alpha[j]; this.alpha0[i] = this.alpha0[j];
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
    this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }
  clear() { this.count = 0; this.geo.setDrawRange(0, 0); }
}

export class Particles {
  constructor(scene) {
    this.add = new Pool(scene, 5000, true);
    this.norm = new Pool(scene, 3000, false);
  }
  setScale(h) { this.add.mat.uniforms.uScale.value = h * 0.6; this.norm.mat.uniforms.uScale.value = h * 0.6; }
  update(dt) { this.add.update(dt); this.norm.update(dt); }
  clear() { this.add.clear(); this.norm.clear(); }

  burst(p, n, opt) {
    const pool = opt.additive === false ? this.norm : this.add;
    const sp = opt.speed ?? 6;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const s = sp * (0.4 + Math.random() * 0.6);
      pool.emit({
        x: p.x + (opt.spread ?? 0) * (Math.random() - 0.5), y: p.y + (opt.spread ?? 0) * (Math.random() - 0.5), z: p.z + (opt.spread ?? 0) * (Math.random() - 0.5),
        vx: r * Math.cos(th) * s, vy: u * s + (opt.up ?? 0), vz: r * Math.sin(th) * s,
        color: opt.color, color2: opt.color2, size: opt.size ?? 0.5, size1: opt.size1, alpha: opt.alpha ?? 1,
        life: (opt.life ?? 0.8) * (0.6 + Math.random() * 0.6), drag: opt.drag ?? 2, grav: opt.grav ?? 0,
      });
    }
  }
  fire(p, intensity = 1) {
    this.add.emit({
      x: p.x + (Math.random() - 0.5) * 0.8, y: p.y + Math.random() * 0.5, z: p.z + (Math.random() - 0.5) * 0.8,
      vx: (Math.random() - 0.5) * 0.6, vy: 2.5 + Math.random() * 2.5 * intensity, vz: (Math.random() - 0.5) * 0.6,
      color: [1.0, 0.62, 0.2], color2: [0.8, 0.12, 0.02], size: 0.9 * intensity, size1: 0.2, alpha: 0.45, life: 0.7 + Math.random() * 0.5, drag: 1,
    });
    if (Math.random() < 0.3) this.norm.emit({
      x: p.x, y: p.y + 1.5, z: p.z, vx: (Math.random() - 0.5) * 0.5, vy: 2 + Math.random(), vz: (Math.random() - 0.5) * 0.5,
      color: [0.25, 0.22, 0.2], color2: [0.5, 0.5, 0.5], size: 1.2, size1: 4, alpha: 0.35, life: 2.5, drag: 0.6,
    });
  }
}
