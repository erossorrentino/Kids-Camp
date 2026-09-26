// Ball, shot tracer, aim ring, flight preview, putt line, green slope
// arrows and particles.
import * as THREE from '../../vendor/three.module.min.js';
import { BALL_R } from '../sim/physics.js';

export class Ball {
  constructor() {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }));
    this.mesh.castShadow = true;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  }
  addTo(scene) { scene.add(this.mesh, this.shadow); }
  set(x, y, z, groundY, camPos) {
    this.mesh.position.set(x, y, z);
    // stay visible from far away
    const d = camPos ? camPos.distanceTo(this.mesh.position) : 1;
    const s = Math.max(1, d / 45);
    this.mesh.scale.setScalar(s);
    const air = Math.max(0, y - BALL_R - groundY);
    this.shadow.position.set(x, groundY + 0.015, z);
    this.shadow.scale.setScalar(s * (1 + air * 0.08));
    this.shadow.material.opacity = Math.max(0.05, 0.35 - air * 0.01);
  }
  setVisible(v) { this.mesh.visible = v; this.shadow.visible = v; }
}

// A camera-facing ribbon that draws the ball's flight like a TV tracer
export class Tracer {
  constructor(color = 0xffc93c) {
    this.max = 1200;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uFade); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    geo.setDrawRange(0, 0);
  }
  reset() { this.pts = []; this.mesh.geometry.setDrawRange(0, 0); this.mat.uniforms.uFade.value = 1; }
  push(x, y, z) {
    const last = this.pts[this.pts.length - 1];
    if (last && (last.x - x) ** 2 + (last.y - y) ** 2 + (last.z - z) ** 2 < 0.25) return;
    if (this.pts.length >= this.max) return;
    this.pts.push(new THREE.Vector3(x, y, z));
  }
  update(camera) {
    const n = this.pts.length;
    if (n < 2) { this.mesh.geometry.setDrawRange(0, 0); return; }
    const cp = camera.position;
    const t = new THREE.Vector3(), side = new THREE.Vector3(), toCam = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(n - 1, i + 1)];
      t.subVectors(b, a).normalize();
      toCam.subVectors(cp, p);
      const dist = toCam.length();
      side.crossVectors(t, toCam.normalize()).normalize();
      const w = Math.min(0.9, 0.05 + dist * 0.0035);
      this.pos[i * 6] = p.x + side.x * w; this.pos[i * 6 + 1] = p.y + side.y * w; this.pos[i * 6 + 2] = p.z + side.z * w;
      this.pos[i * 6 + 3] = p.x - side.x * w; this.pos[i * 6 + 4] = p.y - side.y * w; this.pos[i * 6 + 5] = p.z - side.z * w;
      const al = 0.25 + 0.7 * (i / n);
      this.alpha[i * 2] = al; this.alpha[i * 2 + 1] = al;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, (n - 1) * 6);
  }
}

export class AimRing {
  constructor() {
    this.group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.6, 48).rotateX(-Math.PI / 2), ringMat);
    this.inner = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.9, depthWrite: false }));
    this.windRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.group.add(this.ring, this.inner);
    this.group.renderOrder = 4;
    this.windRing.renderOrder = 4;
  }
  addTo(scene) { scene.add(this.group, this.windRing); }
  set(p, normal, scale = 1) {
    this.group.position.set(p.x, p.y + 0.06, p.z);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(normal.x, normal.y, normal.z));
    this.group.scale.setScalar(scale);
  }
  setWind(p, scale, visible) {
    this.windRing.visible = visible;
    if (visible) { this.windRing.position.set(p.x, p.y + 0.07, p.z); this.windRing.scale.setScalar(scale); }
  }
  setVisible(v) { this.group.visible = v; if (!v) this.windRing.visible = false; }
}

let DOT_TEX = null;
function dotTexture() {
  if (DOT_TEX) return DOT_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill();
  DOT_TEX = new THREE.CanvasTexture(c);
  return DOT_TEX;
}

// Dotted line of points (flight preview / putt preview)
export class DotLine {
  constructor(color = 0xffffff, size = 0.12, max = 400) {
    this.max = max;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, map: dotTexture(), alphaTest: 0.05 });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }
  set(list) {
    const n = Math.min(this.max, list.length);
    for (let i = 0; i < n; i++) { this.pos[i * 3] = list[i].x; this.pos[i * 3 + 1] = list[i].y; this.pos[i * 3 + 2] = list[i].z; }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
  }
  clear() { this.points.geometry.setDrawRange(0, 0); }
}

// Slope arrows across the green (a putting grid)
export class GreenGrid {
  constructor() {
    this.group = new THREE.Group();
    this.mesh = null;
  }
  build(hole) {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
    const g = hole.green;
    const pts = [];
    const R = Math.max(g.rx, g.rz) + 2;
    for (let x = g.x - R; x <= g.x + R; x += 1.1) {
      for (let z = g.z - R; z <= g.z + R; z += 1.1) {
        const f = hole.fields(x, z);
        if (f.dG > 1.2) continue;
        const n = hole.normalAt(x, z);
        const slope = Math.hypot(n.x, n.z) / n.y;
        pts.push({ x, z, y: hole.heightAt(x, z), dir: Math.atan2(n.x, n.z), slope });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.28, -0.1, 0, -0.12, 0.1, 0, -0.12], 3));
    geo.setIndex([0, 1, 2]);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    pts.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.dir);
      const s = 0.6 + Math.min(1.4, p.slope * 45);
      m4.compose(new THREE.Vector3(p.x, p.y + 0.03, p.z), q, new THREE.Vector3(s, 1, s));
      mesh.setMatrixAt(i, m4);
      // flat = cool blue, steep = hot red
      const k = Math.min(1, p.slope / 0.035);
      c.setHSL(0.6 - 0.6 * k, 0.85, 0.55);
      mesh.setColorAt(i, c);
    });
    mesh.count = pts.length;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.mesh = mesh;
    this.group.add(mesh);
  }
  setVisible(v) { this.group.visible = v; }
}

// Simple particle bursts (sand, water, grass)
export class Particles {
  constructor() {
    this.max = 600;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.points.frustumCulled = false;
    this.live = [];
  }
  burst(x, y, z, kind, strength = 1) {
    const color = new THREE.Color(kind === 'water' ? 0xdff3ff : kind === 'sand' ? 0xe8dcb5 : 0x5c8f3a);
    const n = Math.round((kind === 'water' ? 90 : 50) * strength);
    for (let i = 0; i < n && this.live.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (kind === 'water' ? 2.5 : 1.8) * (0.4 + Math.random()) * strength;
      this.live.push({
        x, y, z,
        vx: Math.cos(a) * sp * 0.6, vy: (kind === 'water' ? 4.5 : 3) * (0.5 + Math.random()) * strength, vz: Math.sin(a) * sp * 0.6,
        life: 0.9 + Math.random() * 0.6, color,
      });
    }
  }
  update(dt) {
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.color.r; this.col[i * 3 + 1] = p.color.g; this.col[i * 3 + 2] = p.color.b;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, L.length);
  }
}

// Divots on the fairway and pitch marks on greens; they stay for the hole
export class Marks {
  constructor(max = 120) {
    this.max = max;
    const divot = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
    this.divots = new THREE.InstancedMesh(divot, new THREE.MeshLambertMaterial({ color: '#6b4a2e', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), max);
    const ring = new THREE.RingGeometry(0.035, 0.06, 12).rotateX(-Math.PI / 2);
    this.pitches = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: '#2f5a22', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), max);
    for (const m of [this.divots, this.pitches]) { m.count = 0; m.frustumCulled = false; }
    this.m4 = new THREE.Matrix4();
  }
  addTo(scene) { scene.add(this.divots, this.pitches); }
  reset() { this.divots.count = 0; this.pitches.count = 0; }
  add(kind, x, y, z, heading = 0, size = 1) {
    const m = kind === 'divot' ? this.divots : this.pitches;
    if (m.count >= this.max) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading);
    const s = kind === 'divot' ? new THREE.Vector3(0.07 * size, 1, 0.16 * size) : new THREE.Vector3(size, 1, size);
    this.m4.compose(new THREE.Vector3(x, y + 0.01, z), q, s);
    m.setMatrixAt(m.count, this.m4);
    m.count++;
    m.instanceMatrix.needsUpdate = true;
  }
}
