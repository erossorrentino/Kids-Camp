import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function col(hex) { return new THREE.Color(hex); }

// Bake a solid vertex color into a geometry (non-indexed, position/normal/color only).
export function colored(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], jitter = 0 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  _m.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scale));
  g.applyMatrix4(_m);
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    for (let k = 0; k < 3 && i + k < n; k++) {
      arr[(i + k) * 3] = c.r * j; arr[(i + k) * 3 + 1] = c.g * j; arr[(i + k) * 3 + 2] = c.b * j;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function merge(parts, keepNormals = false) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!keepNormals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.0 });
export const smoothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });

export function treeGeometry(kind, leafColors, trunkColor) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.32, 2.6, 6);
  parts.push(colored(trunk, trunkColor, { pos: [0, 1.3, 0] }));
  if (kind === 'round') {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    parts.push(colored(ico, leafColors[0], { pos: [0, 3.2, 0], scale: [1.6, 1.3, 1.6], jitter: 0.15 }));
    parts.push(colored(ico, leafColors[1], { pos: [0.7, 2.7, 0.3], scale: [1.0, 0.9, 1.0], jitter: 0.15 }));
    parts.push(colored(ico, leafColors[2], { pos: [-0.5, 3.9, -0.3], scale: [1.0, 0.9, 1.0], jitter: 0.15 }));
  } else if (kind === 'pine') {
    const cone = new THREE.ConeGeometry(1, 1, 7);
    parts.push(colored(cone, leafColors[0], { pos: [0, 2.4, 0], scale: [1.7, 2.0, 1.7], jitter: 0.12 }));
    parts.push(colored(cone, leafColors[1], { pos: [0, 3.5, 0], scale: [1.3, 1.8, 1.3], jitter: 0.12 }));
    parts.push(colored(cone, leafColors[2], { pos: [0, 4.5, 0], scale: [0.85, 1.5, 0.85], jitter: 0.12 }));
  } else { // dead / twisted
    const br = new THREE.CylinderGeometry(0.06, 0.12, 1.6, 5);
    parts.push(colored(br, trunkColor, { pos: [0.45, 2.7, 0], rot: [0, 0, -0.9] }));
    parts.push(colored(br, trunkColor, { pos: [-0.4, 2.3, 0.2], rot: [0.3, 0, 0.9] }));
    parts.push(colored(br, trunkColor, { pos: [0, 3.0, -0.4], rot: [-0.8, 0, 0] }));
    const ico = new THREE.IcosahedronGeometry(0.5, 0);
    parts.push(colored(ico, leafColors[0], { pos: [0.9, 3.1, 0], jitter: 0.2 }));
    parts.push(colored(ico, leafColors[1], { pos: [-0.8, 2.7, 0.3], jitter: 0.2 }));
  }
  return merge(parts);
}

export function grassGeometry(base, tip) {
  const g = new THREE.BufferGeometry();
  const pos = [], colr = [];
  const cb = new THREE.Color(base), ct = new THREE.Color(tip);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + Math.random() * 0.4;
    const r = 0.22, h = 0.7 + Math.random() * 0.5;
    const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
    const lean = (Math.random() - 0.5) * 0.4;
    // both windings so blades are visible from either side without back-face normal flipping
    pos.push(-dx, 0, -dz, dx, 0, dz, lean, h, lean * 0.5);
    pos.push(dx, 0, dz, -dx, 0, -dz, lean, h, lean * 0.5);
    colr.push(cb.r, cb.g, cb.b, cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
    colr.push(cb.r, cb.g, cb.b, cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();
  // point normals up so grass is lit like the ground
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export function rockGeometry(c) {
  return colored(new THREE.IcosahedronGeometry(1, 0), c, { jitter: 0.25 });
}

export function chestGeometry() {
  const base = merge([
    colored(new THREE.BoxGeometry(1.4, 0.8, 0.9), 0x8a5a2b, { pos: [0, 0.4, 0] }),
    colored(new THREE.BoxGeometry(1.48, 0.12, 0.98), 0xd9a441, { pos: [0, 0.1, 0] }),
    colored(new THREE.BoxGeometry(1.48, 0.12, 0.98), 0xd9a441, { pos: [0, 0.75, 0] }),
  ]);
  const lid = merge([
    colored(new THREE.BoxGeometry(1.4, 0.35, 0.9), 0x9a6a33, { pos: [0, 0.17, 0.45] }),
    colored(new THREE.BoxGeometry(1.48, 0.08, 0.98), 0xd9a441, { pos: [0, 0.35, 0.45] }),
    colored(new THREE.BoxGeometry(0.25, 0.3, 0.1), 0xf3d36b, { pos: [0, 0.05, 0.92] }),
  ]);
  return { base, lid };
}

export function barrelGeometry() {
  return merge([
    colored(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), 0x2c2a2a, { pos: [0, 0.6, 0] }),
    colored(new THREE.CylinderGeometry(0.52, 0.52, 0.2, 10), 0xe2b93b, { pos: [0, 0.75, 0] }),
    colored(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 10), 0x6b5b3a, { pos: [0, 0.2, 0] }),
    colored(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 10), 0x6b5b3a, { pos: [0, 1.1, 0] }),
  ]);
}

// Stylized humanoid used for the player and survivors.
// The static body is one merged mesh; only limbs and scarf tail animate (6 draw calls).
const personMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
export function buildPerson({ body = 0x3d7bd9, accent = 0xe84a3a, skin = 0xf1c7a0, hair = 0x4a2e1e, hat = null } = {}) {
  const root = new THREE.Group();
  const parts = [
    colored(new THREE.CapsuleGeometry(0.33, 0.55, 4, 10), body, { pos: [0, 1.05, 0] }),
    colored(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12), 0x4a3220, { pos: [0, 0.82, 0] }),
    colored(new THREE.SphereGeometry(0.27, 14, 12), skin, { pos: [0, 1.72, 0] }),
    colored(new THREE.SphereGeometry(0.285, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, { pos: [0, 1.75, 0] }),
    colored(new THREE.TorusGeometry(0.27, 0.045, 6, 18), 0x2a2a2a, { pos: [0, 1.78, 0], rot: [Math.PI / 2 - 0.15, 0, 0] }),
    colored(new THREE.SphereGeometry(0.035, 6, 6), 0x1a1a1a, { pos: [0.09, 1.72, -0.25] }),
    colored(new THREE.SphereGeometry(0.035, 6, 6), 0x1a1a1a, { pos: [-0.09, 1.72, -0.25] }),
    colored(new THREE.TorusGeometry(0.22, 0.08, 6, 14), accent, { pos: [0, 1.45, 0], rot: [Math.PI / 2, 0, 0] }),
    colored(new THREE.BoxGeometry(0.5, 0.55, 0.28), 0x7a5532, { pos: [0, 1.12, 0.36] }),
  ];
  if (hat) parts.push(colored(new THREE.ConeGeometry(0.34, 0.45, 10), hat, { pos: [0, 2.05, 0] }));
  const torso = new THREE.Mesh(merge(parts, true), personMat);
  torso.castShadow = true;
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.7), mat(accent));
  tail.geometry.translate(0, 0, 0.35);
  tail.position.set(0.1, 1.45, 0.15);
  root.add(torso, tail);
  const limb = (w, l, c) => {
    const g = new THREE.BoxGeometry(w, l, w); g.translate(0, -l / 2, 0);
    const m = new THREE.Mesh(g, mat(c)); m.castShadow = true; return m;
  };
  const legL = limb(0.17, 0.62, 0x3a3a4a); legL.position.set(0.14, 0.66, 0);
  const legR = limb(0.17, 0.62, 0x3a3a4a); legR.position.set(-0.14, 0.66, 0);
  const armL = limb(0.13, 0.58, body); armL.position.set(0.43, 1.38, 0);
  const armR = limb(0.13, 0.58, body); armR.position.set(-0.43, 1.38, 0);
  root.add(legL, legR, armL, armR);
  root.userData = { legL, legR, armL, armR, tail, torso };
  return root;
}

export function animatePerson(p, phase, amount, airborne, t) {
  const u = p.userData;
  if (airborne) {
    u.legL.rotation.x = -0.5; u.legR.rotation.x = 0.3;
    u.armL.rotation.x = -0.6; u.armR.rotation.x = -0.6;
    u.armL.rotation.z = 0.6; u.armR.rotation.z = -0.6;
  } else {
    const s = Math.sin(phase) * 0.9 * amount;
    u.legL.rotation.x = s; u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
    u.armL.rotation.z = 0.08; u.armR.rotation.z = -0.08;
  }
  u.tail.rotation.x = -0.3 - amount * 0.9 + Math.sin(t * 9) * 0.15 * (0.3 + amount);
  u.tail.rotation.y = Math.sin(t * 5) * 0.2;
}

// Canvas-generated textures
export function makeCloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const r = 18 + Math.random() * 26;
    const cx = 64 + (Math.random() - 0.5) * 50, cy = 70 + (Math.random() - 0.5) * 30;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
