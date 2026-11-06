import * as THREE from 'three';
import { G } from '../core/G.js';
import { mat } from './rig.js';

// Four-legged creature rig: wolves, cinder hounds and the Duskhorn mount.
export class QuadRig {
  constructor(o = {}) {
    const s = (this.s = o.scale || 1);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const unique = !!o.uniqueMats;
    const fur = mat(o.color || 0x5a4a3a, { rough: 0.95, unique, map: G.tex?.cloth.map });
    const fur2 = mat(o.color2 || 0x3a2e24, { rough: 0.95, unique });
    const eye = mat(o.eyes || 0x110a05, { emissive: o.glowEyes || 0x000000, emissiveIntensity: o.glowEyes ? 4 : 0, unique });
    this.materials = [fur, fur2];
    const len = o.length || 1.0;
    const hh = (this.hipH = (o.legLen || 0.62) * s);
    this.body.position.y = hh;
    const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x * s, y * s, z * s);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const torso = add(this.body, new THREE.CapsuleGeometry(0.22 * (o.girth || 1), len * 0.9, 4, 10), fur);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(s, s, s * 1.0);
    add(this.body, new THREE.SphereGeometry(0.235 * (o.girth || 1), 10, 8), fur, 0, 0.02, len * 0.4).scale.set(s, s * 1.0, s * 1.05);
    // neck + head
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.12 * s, len * 0.55 * s);
    this.body.add(this.neck);
    add(this.neck, new THREE.CapsuleGeometry(0.12, 0.28, 4, 8), fur, 0, 0.12, 0.08).rotation.x = -0.7;
    this.head = new THREE.Group();
    this.head.position.set(0, 0.28 * s, 0.2 * s);
    this.neck.add(this.head);
    add(this.head, new THREE.SphereGeometry(0.14, 10, 8), fur, 0, 0, 0).scale.set(s, s * 0.9, s * 1.1);
    const snout = add(this.head, new THREE.CylinderGeometry(0.06, 0.09, 0.26, 8), fur2, 0, -0.03, 0.18);
    snout.rotation.x = Math.PI / 2;
    snout.scale.setScalar(s);
    this.jaw = add(this.head, new THREE.BoxGeometry(0.1, 0.04, 0.22), fur2, 0, -0.08, 0.13);
    this.jaw.scale.setScalar(s);
    for (const sx of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.022, 6, 5), eye, 0.065 * sx, 0.04, 0.1).scale.setScalar(s);
      if (o.ears !== false) {
        const ear = add(this.head, new THREE.ConeGeometry(0.045, 0.13, 5), fur2, 0.07 * sx, 0.13, -0.02);
        ear.rotation.z = -0.25 * sx;
        ear.scale.setScalar(s);
      }
      if (o.antlers) {
        const am = mat(o.antlerColor || 0xe8dcc0, { emissive: o.antlerGlow || 0x000000, emissiveIntensity: o.antlerGlow ? 1.6 : 0, rough: 0.5 });
        const a = new THREE.Group();
        a.position.set(0.06 * sx * s, 0.12 * s, -0.02 * s);
        a.rotation.z = -0.5 * sx;
        this.head.add(a);
        const main = add(a, new THREE.CylinderGeometry(0.012, 0.022, 0.5, 5), am, 0, 0.25, 0);
        main.scale.setScalar(s);
        for (let k = 0; k < 3; k++) {
          const tine = add(a, new THREE.CylinderGeometry(0.008, 0.014, 0.22, 4), am, 0.04 * sx, 0.15 + k * 0.12, 0.04);
          tine.rotation.set(0.7, 0, -0.6 * sx);
          tine.scale.setScalar(s);
        }
      }
    }
    if (o.mane) {
      const mm = mat(o.mane, { rough: 1 });
      for (let i = 0; i < 5; i++) add(this.neck, new THREE.SphereGeometry(0.08, 6, 5), mm, 0, 0.22 - i * 0.02, -0.05 + i * 0.07).scale.set(s * 0.8, s * 1.2, s);
    }
    // legs: FL FR BL BR
    this.legs = [];
    const lx = 0.14, lzF = len * 0.4, lzB = -len * 0.38;
    const legDefs = [[lx, lzF, 0], [-lx, lzF, 0.5], [lx, lzB, 0.5], [-lx, lzB, 0]];
    for (const [x, z, ph] of legDefs) {
      const hip = new THREE.Group();
      hip.position.set(x * s, -0.02 * s, z * s);
      this.body.add(hip);
      const upperLen = hh * 0.52, lowerLen = hh * 0.52;
      const up = add(hip, new THREE.CapsuleGeometry(0.055 * (o.girth || 1), upperLen / s - 0.08, 3, 6), fur, 0, -upperLen / 2 / s, 0);
      up.scale.setScalar(s);
      const knee = new THREE.Group();
      knee.position.y = -upperLen;
      hip.add(knee);
      const lo = add(knee, new THREE.CapsuleGeometry(0.035, lowerLen / s - 0.06, 3, 6), fur2, 0, -lowerLen / 2 / s, 0);
      lo.scale.setScalar(s);
      add(knee, new THREE.SphereGeometry(0.045, 6, 5), fur2, 0, -lowerLen / s, 0.02).scale.setScalar(s);
      this.legs.push({ hip, knee, ph, front: z > 0 });
    }
    // tail
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.06 * s, -len * 0.55 * s);
    this.body.add(this.tail);
    const tl = add(this.tail, new THREE.CapsuleGeometry(0.05, o.tailLen || 0.4, 3, 6), fur2, 0, 0, -(o.tailLen || 0.4) / 2);
    tl.rotation.x = Math.PI / 2;
    tl.scale.setScalar(s);
    if (o.flame) {
      this.flame = true;
    }
    this.phase = 0;
    this.flash = 0;
  }
  setFlash(v, color = 0xffffff) {
    for (const m of this.materials) {
      m.emissive.setHex(color);
      m.emissiveIntensity = v * 2.5;
    }
  }
  addTo(scene) { scene.add(this.root); }
  removeFrom(scene) { scene.remove(this.root); }
  setVisible(v) { this.root.visible = v; }
  // speed in m/s; state: 'move' | 'idle' | 'attack' | 'dead' | 'rear'
  animate(dt, speed, state, u = 0) {
    const gallop = speed > 5;
    const stride = gallop ? 2.6 : 1.4;
    this.phase += (speed / stride) * dt * Math.PI * 2 * 0.5;
    const amp = Math.min(1, speed / 3) * (gallop ? 0.85 : 0.5);
    const b = this.body;
    b.rotation.set(0, 0, 0);
    b.position.y = this.hipH;
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      let off = L.ph;
      if (gallop) off = [0, 0.12, 0.55, 0.65][i];
      const ph = this.phase + off * Math.PI * 2;
      L.hip.rotation.x = Math.sin(ph) * amp * (L.front ? 1 : 1.1);
      L.knee.rotation.x = Math.max(0, -Math.sin(ph + 1.2)) * amp * (L.front ? -0.9 : 1.2);
    }
    const bob = Math.abs(Math.sin(this.phase * (gallop ? 1 : 2))) * (gallop ? 0.08 : 0.03) * this.s;
    b.position.y += bob;
    if (gallop) b.rotation.x = Math.sin(this.phase) * 0.08;
    this.neck.rotation.x = 0.1 + (gallop ? Math.sin(this.phase) * 0.1 : Math.sin(G.time * 1.2) * 0.04);
    this.head.rotation.x = 0;
    this.tail.rotation.x = 0.4 + Math.sin(G.time * 3) * 0.08;
    this.tail.rotation.y = Math.sin(G.time * (speed > 0.5 ? 8 : 2)) * 0.3;
    this.jaw.rotation.x = 0;
    if (state === 'idle') {
      this.neck.rotation.x = 0.35 + Math.sin(G.time * 0.7) * 0.1;
      this.head.rotation.y = Math.sin(G.time * 0.5) * 0.3;
    } else if (state === 'graze') {
      this.neck.rotation.x = 1.4;
      this.head.rotation.x = 0.4;
    } else if (state === 'windup') {
      b.rotation.x = 0.18 * u;
      b.position.y -= 0.12 * u * this.s;
      this.neck.rotation.x = -0.25 * u;
      this.jaw.rotation.x = 0.4 * u;
      for (const L of this.legs) L.knee.rotation.x = (L.front ? 0.6 : -0.9) * u;
    } else if (state === 'attack') {
      b.rotation.x = -0.25 * Math.sin(u * Math.PI);
      this.neck.rotation.x = -0.4;
      this.jaw.rotation.x = 0.6 * (1 - u);
      for (const L of this.legs) L.hip.rotation.x = (L.front ? -0.9 : 0.7) * Math.sin(u * Math.PI);
    } else if (state === 'rear') {
      b.rotation.x = -0.7 * Math.sin(Math.min(1, u) * Math.PI);
      b.position.y += 0.3 * this.s * Math.sin(Math.min(1, u) * Math.PI);
      for (const L of this.legs) if (L.front) L.hip.rotation.x = -0.9 + Math.sin(G.time * 10) * 0.4;
    } else if (state === 'dead') {
      b.rotation.z = Math.min(1, u) * 1.5;
      b.position.y = this.hipH * (1 - Math.min(1, u) * 0.7);
      for (const L of this.legs) L.hip.rotation.x = 0.4;
    } else if (state === 'stagger') {
      b.rotation.z = Math.sin(u * Math.PI) * 0.3;
      b.position.y -= 0.1 * Math.sin(u * Math.PI) * this.s;
    }
  }
}

// Floating wisp: glowing core with orbiting shards.
export class WispRig {
  constructor(o = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const color = o.color || 0x8fd8ff;
    const coreM = new THREE.MeshStandardMaterial({ color: 0x111122, emissive: color, emissiveIntensity: 3, roughness: 0.2 });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 * (o.scale || 1), 1), coreM);
    this.core.position.y = 1.6;
    this.body.add(this.core);
    this.shards = [];
    const shardM = new THREE.MeshStandardMaterial({ color: 0x223355, emissive: color, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14 * (o.scale || 1), 0), shardM);
      s.scale.set(0.6, 1.8, 0.6);
      s.castShadow = true;
      this.body.add(s);
      this.shards.push(s);
    }
    const glowM = new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    if (G.glowTex) glowM.map = G.glowTex;
    this.glow = new THREE.Sprite(glowM);
    this.glow.scale.setScalar(2.2 * (o.scale || 1));
    this.glow.position.y = 1.6;
    this.body.add(this.glow);
    this.materials = [coreM, shardM];
    this.coreM = coreM;
    this.baseColor = new THREE.Color(color);
  }
  setFlash(v) {
    this.coreM.emissiveIntensity = 3 + v * 6;
  }
  addTo(scene) { scene.add(this.root); }
  removeFrom(scene) { scene.remove(this.root); }
  setVisible(v) { this.root.visible = v; }
  animate(dt, speed, state, u = 0) {
    const t = G.time;
    this.core.position.y = 1.6 + Math.sin(t * 2) * 0.15;
    this.core.rotation.y += dt * 2;
    const spin = state === 'windup' ? 8 : 2;
    for (let i = 0; i < this.shards.length; i++) {
      const a = t * spin + (i / this.shards.length) * Math.PI * 2;
      const r = state === 'windup' ? 0.45 - u * 0.2 : 0.65;
      this.shards[i].position.set(Math.cos(a) * r, this.core.position.y + Math.sin(a * 2) * 0.15, Math.sin(a) * r);
      this.shards[i].rotation.y = -a;
    }
    this.glow.material.opacity = state === 'windup' ? 0.5 + u * 0.5 : 0.45;
    if (state === 'dead') this.body.scale.setScalar(Math.max(0.01, 1 - u));
    else this.body.scale.setScalar(1);
  }
}
